# Retrieval and object storage (M and S)

PHANTOMS' **M** (Milvus) and **S** (SeaweedFS) are optional and are off in the default path. This guide shows how to try each one, when to move from one step to the next, and how to back it up. Everything here was run and checked against the pinned versions in [`version-policy.md`](version-policy.md).

## Choose the smallest step that works

| Step | Use it when | What it costs |
| --- | --- | --- |
| 1. **pgvector** in PostgreSQL | You start semantic search, or the corpus and traffic are small enough for one database. | One extension and one table. One backup story and one transaction boundary. |
| 2. **Milvus** with **SeaweedFS** | A measured need that step 1 no longer meets (see the criteria below). | Three more stateful services (Milvus, etcd, an S3-compatible store), their upgrades, backups and capacity planning. |

Start with step 1. The sample code and tests for it are in `packages/db/src/vector`.

### Why pgvector first

- It runs inside PostgreSQL, which the starter already has. Chunks, their source records and your access rules can live in one database, so a delete or an authorization change is one transaction and one backup covers both. The pgvector README lists exact and approximate nearest-neighbour search, ACID compliance and point-in-time recovery among its features ([pgvector](https://github.com/pgvector/pgvector)).
- It supports an approximate index (HNSW, used here) and exact search when there is no index.
- It adds no new service to operate. That is the main argument; this guide makes no throughput claim for it.

### When to graduate to Milvus

Move when one of these is true **on your own data**, measured with your embedding model and queries. Thresholds are yours to set; this guide does not invent them.

- **Corpus size.** Index build time, memory or storage on the PostgreSQL host is the limit, or vector load is hurting the transactional workload that shares the database.
- **Latency or recall.** A tuned pgvector index (HNSW parameters, `hnsw.ef_search`, filtering) cannot meet the latency or recall target at the load you need.
- **Hybrid or specialised search.** You need combined vector and keyword search, or features pgvector does not offer. Check the Milvus documentation for the exact feature, and verify it in the pinned version first.
- **Independent scaling.** Retrieval must scale, fail or be upgraded separately from the application database.

Milvus 3.0 describes a lake-native architecture with external collections and online schema changes ([release notes](https://milvus.io/docs/release_notes.md)). That is useful at scale and is heavy for a first app.

## Step 1: pgvector

pgvector comes from the `pgvector` Compose profile: a second PostgreSQL on loopback port 5433 with the extension installed. The default `postgres` service (port 5432) is unchanged and does not have the extension.

```sh
export COMPOSE_PROJECT_NAME=phantoms
docker compose --profile pgvector up -d --wait postgres-pgvector
export PGVECTOR_DATABASE_URL=postgres://phantoms:dev-only-change-me@127.0.0.1:5433/phantoms
bun run db:migrate:vector
```

The vector migrations are separate from the default ones (`packages/db/drizzle-vector`, history table `__drizzle_migrations_vector`) because the first one runs `CREATE EXTENSION vector`, which the plain PostgreSQL image cannot do. Running `bun run db:migrate` never touches them.

The schema is one table, `document_chunks`, with the source ID, chunk index, text and an HNSW index on the embedding for cosine distance:

```ts
import { createChunkStore, EMBEDDING_DIMENSIONS } from '@phantoms/db/vector';

const chunks = createChunkStore(db);
await chunks.upsert([{ sourceId, chunkIndex: 0, content, embedding }]);
const matches = await chunks.search(queryEmbedding, { limit: 5, sourceId });
await chunks.removeSource(sourceId); // when the source record is deleted
```

Things to decide before real use:

- **Dimension.** `EMBEDDING_DIMENSIONS` (1536) is a placeholder. Set it to your embedding model's output size, then generate a new migration. Changing models later means re-embedding every chunk. The `packages/ai` adapter does not produce embeddings yet; create them behind a server-side call.
- **Authorization.** The store filters by `sourceId` only. Check that the caller may read a source before returning its text, and filter by source in the query when you can.
- **Deletion.** Delete chunks when their source goes away (`removeSource`). The index holds copies of your data.
- **Index choice.** HNSW has better query performance than IVFFlat for speed against recall but builds more slowly and uses more memory (pgvector README). Revisit the choice with your data.

Tests: `bun test` always runs the input checks and migration-separation tests. The database tests run only when `PGVECTOR_DATABASE_URL` is set.

## Step 2: Milvus and SeaweedFS

Two profiles, both off by default:

| Profile | Starts |
| --- | --- |
| `objects` | SeaweedFS with its S3 API on `127.0.0.1:8333`. |
| `retrieval` | Milvus on `127.0.0.1:19530`, etcd, and SeaweedFS (Milvus needs an S3-compatible store, so this profile includes it). |

```sh
export COMPOSE_PROJECT_NAME=phantoms
docker compose --profile retrieval --profile objects up -d --wait
```

A plain `docker compose up` still starts only `postgres`. The images and versions are pinned in `compose.yaml` and listed in [`version-policy.md`](version-policy.md). Milvus runs standalone with etcd for metadata and SeaweedFS for object data; its bucket (`milvus`) is created on first start.

Credentials are disposable local defaults that you can override in `.env` (`S3_ACCESS_KEY`, `S3_SECRET_KEY`). Every port is bound to loopback. Do not reuse them outside your machine.

### Why SeaweedFS, and how to leave it

MinIO is the usual S3 default for local Milvus, but its repository was archived on 2026-04-24 ([MinIO](https://github.com/minio/minio)), so it is not a good new default. SeaweedFS is Apache-2.0 and actively developed ([SeaweedFS](https://github.com/seaweedfs/seaweedfs)). [RustFS](https://github.com/rustfs/rustfs) is another Apache-2.0 S3-compatible option; this starter has not tested it.

Both services use the S3 API, so the client stays portable. The tests use Bun's built-in `Bun.S3Client` and the Milvus REST API v2 with `fetch`, so no SDK is added. If you need a fuller client later, `@aws-sdk/client-s3` is the usual choice for S3 and `@zilliz/milvus2-sdk-node` for Milvus; neither is a dependency here.

### Is the combination supported?

Milvus does not, as far as the sources checked on 2026-11-04 show, publish a compatibility statement for SeaweedFS (its configuration names the store `minio` but targets any S3 API). This starter does not rely on a statement; it tests the behaviour:

```sh
RETRIEVAL_INTEGRATION=1 bun test apps/api/test/retrieval.integration.test.ts
```

To test only the S3 side (SeaweedFS, no Milvus or etcd), start the `objects` profile and use `OBJECTS_INTEGRATION=1` instead.

The test writes, reads and deletes an object through the S3 API, then creates a Milvus collection, inserts vectors, searches them and drops the collection. Without `RETRIEVAL_INTEGRATION=1` (or `OBJECTS_INTEGRATION=1` for the S3 test alone) it is skipped, and `bun test` needs neither service. With a switch set, an unreachable service fails the test.

CI runs the pgvector tests and the SeaweedFS S3 test in the `pgvector-objects-integration` job: on pipeline schedules, and manually (not automatically) on merge requests. Create the schedule in the GitLab project settings; a failed scheduled run shows as a red pipeline. **The Milvus test does not run in CI**: the shared runner pool starts service containers as uid 1000 and refuses a per-service user, and the Milvus image only runs as its own uid 999, so it exits with "Permission denied". The Milvus proof is the local run above (see [`ci-cd.md`](ci-cd.md)).

### Operating notes

- Milvus standalone, etcd and SeaweedFS (single server) are single points of failure. This is a local and test shape, not a production topology.
- The pinned Milvus version is not the newest. See [`version-policy.md`](version-policy.md) for what was chosen and why.
- Milvus stores its metadata in etcd and its data in the S3 store. Never back up or restore one without the other.

## Backup and restore

Run every command from the repository root with `COMPOSE_PROJECT_NAME=phantoms` exported, so the volume names below match. Backups go to `./backup` (git-ignored); keep real backups somewhere else and encrypt them. These commands were run and checked with Podman 5 and `podman-compose`; Docker Compose uses the same syntax, but it was not available to test.

### pgvector (PostgreSQL)

Back up with `pg_dump` in custom format. It is consistent while the database is running.

```sh
mkdir -p backup
docker compose --profile pgvector exec -T postgres-pgvector \
  pg_dump -U phantoms -Fc phantoms > backup/pgvector.dump
```

Restore into an existing, empty database (the dump recreates the extension):

```sh
docker compose --profile pgvector exec -T postgres-pgvector createdb -U phantoms restore_check
docker compose --profile pgvector exec -T postgres-pgvector \
  pg_restore -U phantoms -d restore_check --no-owner --clean --if-exists < backup/pgvector.dump
```

Check the result (`select count(*) from document_chunks` returns your rows and the `vector` extension is present), then point the app at the restored database or drop it with `dropdb`. Tested on the pinned image: the row, the extension and the HNSW index came back.

### Milvus and SeaweedFS (cold copy)

This procedure stops the services, copies their three volumes, and restores into fresh volumes. It is simple and consistent, at the cost of downtime. Both the helper image and the volumes come from this repository's pins.

Back up:

```sh
docker compose --profile retrieval stop milvus etcd seaweedfs
for v in etcd seaweedfs milvus; do
  docker run --rm -v "$COMPOSE_PROJECT_NAME-$v-data":/data:ro -v "$PWD/backup":/backup \
    docker.io/library/postgres:18.6-alpine tar czf "/backup/$v.tgz" -C /data .
done
docker compose --profile retrieval start etcd seaweedfs milvus
```

Restore into empty volumes (remove the old ones first with `docker volume rm`, after `docker compose --profile retrieval --profile objects down`):

```sh
for v in etcd seaweedfs milvus; do
  docker run --rm -v "$COMPOSE_PROJECT_NAME-$v-data":/data -v "$PWD/backup":/backup:ro \
    docker.io/library/postgres:18.6-alpine tar xzf "/backup/$v.tgz" -C /data
done
docker compose --profile retrieval --profile objects up -d --wait
```

Tested: Milvus segment files had been flushed to SeaweedFS before the backup. After restoring into freshly created volumes, the same number of segment objects was in the bucket, a Milvus collection created before the backup returned the same search results, and an object written to SeaweedFS before the backup read back unchanged. Milvus flushes on its own schedule; call the collection `flush` API first if you need a backup to include recent inserts in object storage. (The `postgres:18.6-alpine` image is only a pinned source of `tar`; any image with `tar` works.)

On a host with SELinux, add `:z` to the volume options. For production, Milvus documents a dedicated tool, [`milvus-backup`](https://github.com/zilliztech/milvus-backup), that backs up collections while running; this starter has not tested it with the pinned Milvus. Whatever you use, restore into a scratch environment on a schedule and run a real search, not only a file check.

## What is not covered

- Production topology, high availability, authentication on Milvus, TLS to SeaweedFS and access policies.
- Capacity, latency and recall numbers. Measure them with your data.
- Embedding generation, chunking strategy and re-indexing jobs.

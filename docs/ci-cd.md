# CI/CD for PHANTOMS apps

PHANTOMS apps should treat CI/CD as part of the application design. A Bun
runtime does not remove the need for dependency integrity, source scanning,
repeatable builds, protected deployment credentials, and evidence that the
artifact tested is the artifact released.

This repository is the public learning surface. Its source project on the
internal GitLab instance uses the private Launch Sequence templates. Readers
who cannot access that project can use the public GitLab baseline in this
document, including a local container build and runtime smoke check.

## The default flow

Use the following order for a real PHANTOMS application:

1. Install the exact dependency graph with `bun install --frozen-lockfile`.
2. Run formatting, type checks, and schema/migration consistency checks.
3. Apply migrations and run database integration tests against a disposable
   PostgreSQL service; run the production build before an image is built.
4. Scan source and dependencies for secrets and known vulnerabilities.
5. Build one immutable container image, identify it by digest, and generate an
   SBOM.
6. Run browser tests against that same image.
7. Sign and attest the image, then deploy only from a protected ref.
8. Verify health, telemetry, and rollback behavior after deployment.

Merge request jobs run with no production credentials. The protected default
branch is the point at which registry access, signing keys, deployment tokens,
and environment secrets may be available. Keep those boundaries in the GitLab
runner configuration as well as in YAML rules.

## Internal Launch Sequence consumer

The source project uses:

```yaml
include:
  - project: 'DroidOpsInc/launch-sequence'
    ref: b5afba2af206d84ee58315122977b11266f0ff1e
    file: '/pipelines/validate-only.yml'
```

That SHA is the resolved `origin/main` tip inspected on 2026-10-01. The
composition is `pipelines/validate-only.yml` because this learning repository
does not publish an image or deploy an application. It supplies shared
preflight and SAST jobs; consumer-owned jobs add Bun dependency auditing, a
disposable PostgreSQL integration test, and a Dockerfile lint for merge
requests. Merge requests stay on eligible unprivileged runners and
do not start a container builder. The protected default branch builds with
Docker-in-Docker on the `privileged` runner and smoke-tests that exact local
image in the same job, avoiding a large Docker archive in the GitLab artifact
store. Untagged validation jobs may use any eligible unprivileged runner;
configure runner tags and protection in GitLab so they cannot land on a
privileged host.

The source configuration sets `SAST_STRICT` to `true`, overriding Launch
Sequence's advisory default, and runs a separate blocking Gitleaks job. Its
`bun audit --audit-level high` job checks the locked dependency graph. The
Docker-in-Docker smoke job runs only on the protected default branch and uses a
runner tagged `privileged`; merge requests never receive privileged
execution. Protect `main` and restrict that runner to protected refs before
enabling the job. Source container images use the internal Harbor Docker Hub
proxy, including the pinned Semgrep 1.178.0 and Gitleaks 8.30.1 scanners.

The source project is private. Do not copy its templates into a public repo or
put credentials in this repository. If your GitLab group has an approved
Launch Sequence consumer, pin a reviewed SHA and run the linter from a local
checkout before opening the merge request:

```bash
python3 scripts/lint-consumer.py \
  --launch-sequence-path "$LAUNCH_SEQUENCE_CHECKOUT" \
  .gitlab-ci.yml
```

The source checkout's canonical documentation is:

- `pipelines/validate-only.yml` for docs/config repositories;
- `pipelines/container-app.yml` for a containerized application with the full
  assurance and deployment planes;
- `docs/runner-architecture.md` for protected and unprotected runner rules;
- `docs/consumer-adoption-guide.md` for a la carte security jobs.

### Selecting a PHANTOMS app composition

For an application that builds and deploys a container, use the same immutable
SHA with `pipelines/container-app.yml` and set the application variables at the
consumer level:

```yaml
include:
  - project: 'DroidOpsInc/launch-sequence'
    ref: b5afba2af206d84ee58315122977b11266f0ff1e
    file: '/pipelines/container-app.yml'

variables:
  IMAGE_NAME: 'my-phantoms-app'
  HARBOR_PROJECT: 'apps'
  DOCKERFILE: 'Dockerfile'
  PREFLIGHT_IMAGE: '${IMAGE_REGISTRY}/dockerhub-proxy/oven/bun:1.4.2-slim'
  PREFLIGHT_REQUIRED_TOOLS: 'bun'
  PREFLIGHT_COMMANDS: >-
    bun install --frozen-lockfile &&
    bun run lint &&
    bun run typecheck &&
    bun run db:check
  TEST_COMMANDS: >-
    bun install --frozen-lockfile &&
    bun test &&
    bun run build
  LOCKFILE_IMAGE: '${IMAGE_REGISTRY}/dockerhub-proxy/oven/bun:1.4.2-slim'
  LOCKFILE_COMMANDS: 'bun install --frozen-lockfile'
```

Set `DEPLOY_OVERLAY`, `DEPLOY_REGISTRY`, `APP_BASE_URL`, and the protected
post-deploy variables only when the app has a real deployment target. Do not
turn a deploy job on by inventing a cluster, registry project, URL, or secret.

The shared contract template currently has a package-runner path outside the
Bun baseline. Keep `CONTRACT_SPEC_PATH` disabled until the shared template has
a Bun-native execution path. For a Bun-first app, pin a contract CLI in the
workspace and call it from a consumer-owned script, for example:

```sh
bun add --dev @stoplight/spectral-cli
```

Then add a pinned `api:lint` package script and call `bun run api:lint` from
`PREFLIGHT_COMMANDS`.

Do not hide a failing security or evidence job behind `allow_failure` merely
to obtain a green pipeline. Fix the earliest failing plane and preserve the
artifact and report handoffs through the DAG.

## Public GitLab baseline

If the private Launch Sequence project is unavailable, replace the private
`include` with this self-contained GitLab configuration. It keeps Bun as the
only JavaScript runtime. Pin or update each image deliberately; this October
2026 example uses Bun 1.4.2, Hadolint 2.15.1, and Docker 29.8.1.

```yaml
image: oven/bun:1.4.2-slim

workflow:
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
    - if: '$CI_COMMIT_BRANCH =~ /^renovate\//'
    - if: '$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH'
    - when: never

stages:
  - verify
  - security
  - build

default:
  interruptible: true
  before_script:
    - bun --version
    - bun install --frozen-lockfile

lint:
  stage: verify
  script:
    - bun run lint

typecheck:
  stage: verify
  script:
    - bun run typecheck

test:
  stage: verify
  script:
    - bun test

build:
  stage: verify
  script:
    - bun run build

database-integration:
  stage: verify
  image: oven/bun:1.4.2-slim
  services:
    - name: postgres:18.6-alpine
      alias: postgres
  variables:
    POSTGRES_DB: 'phantoms_test'
    POSTGRES_USER: 'phantoms'
    POSTGRES_PASSWORD: 'ci-only-password'
    DATABASE_URL: 'postgres://phantoms:ci-only-password@postgres:5432/phantoms_test'
  script:
    - bun run db:migrate
    - bun test

db-check:
  stage: verify
  script:
    - bun run db:check

dependency-audit:
  stage: security
  script:
    - bun audit --audit-level high

semgrep:
  stage: security
  image:
    name: semgrep/semgrep:1.178.0
    entrypoint: ['']
  before_script: []
  script:
    - semgrep scan --config auto --severity ERROR --error .

secret-scan:
  stage: security
  image:
    name: zricethezav/gitleaks:v8.30.1
    entrypoint: ['']
  before_script: []
  script:
    - gitleaks detect --source . --no-banner --redact

dockerfile-lint-mr:
  stage: build
  image:
    name: hadolint/hadolint:v2.15.1-debian
    entrypoint: ['']
  before_script: []
  script:
    - hadolint --version
    - hadolint --failure-threshold warning Dockerfile
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
    - if: '$CI_COMMIT_BRANCH =~ /^renovate\//'

container-build-smoke:
  stage: build
  image: docker:29.8.1-cli
  services:
    - name: docker:29.8.1-dind
      alias: docker
      variables:
        HEALTHCHECK_TCP_PORT: '2375'
  tags:
    - privileged
  variables:
    DOCKER_HOST: 'tcp://docker:2375'
    DOCKER_TLS_CERTDIR: ''
  before_script: []
  script:
    - docker info
    - >-
      docker build --pull
      --build-arg BUN_IMAGE=oven/bun:1.4.2-slim
      --tag "phantoms-smoke:${CI_COMMIT_SHA}" .
    - docker run --detach --name phantoms-smoke --env DATABASE_URL=postgres://phantoms:ci-only@127.0.0.1:5432/phantoms --env API_BEARER_TOKEN=ci-smoke "phantoms-smoke:${CI_COMMIT_SHA}"
    - |
      docker exec phantoms-smoke bun -e '
        const deadline = Date.now() + 30000;
        let smokePassed = false;
        while (Date.now() < deadline) {
          try {
            const web = await fetch("http://127.0.0.1:4000/");
            const live = await fetch("http://127.0.0.1:4000/healthz");
            const denied = await fetch("http://127.0.0.1:4000/api/tasks");
            const page = await web.text();
            if (web.ok && page.includes("PHANTOMS") && live.ok && denied.status === 401) {
              console.info("container smoke passed: static page, health route, and auth boundary");
              smokePassed = true;
              break;
            }
          } catch {}
          await Bun.sleep(500);
        }
        if (!smokePassed) throw new Error("container smoke failed or timed out");
      '
  after_script:
    - docker logs phantoms-smoke || true
    - docker rm --force phantoms-smoke || true
    - docker image rm "phantoms-smoke:${CI_COMMIT_SHA}" || true
  rules:
    - if: '$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH'
```

Protect the default branch and configure a protected runner tagged `privileged`
for Docker-in-Docker before enabling the runtime smoke job. Merge requests use
Hadolint for static Dockerfile validation because the available unprivileged
Kubernetes runners cannot start rootlesskit. The protected default branch builds and
smoke-tests the exact local image in one job, avoiding a large Docker archive.
Neither job signs or deploys the image. For an app with a
real deployment target, add image and dependency scanning, SBOM generation,
provenance and signature verification, protected deployment, and post-deploy
health and rollback checks. Deploy by immutable digest only after all required
gates pass.

## Required repository commands

Every PHANTOMS app should expose these commands, even if their implementation
uses different tools:

| Command | Purpose |
| --- | --- |
| `bun run lint` | formatting and static checks |
| `bun run typecheck` | TypeScript and generated-type validation |
| `bun test` | deterministic unit and integration tests |
| `bun run build` | production build, when the app has a build step |
| `bun run db:check` | schema and migration validation |
| `database-integration` | apply migrations and exercise database access with disposable PostgreSQL |
| `bun run test:e2e` | browser journey tests when the app has user journeys that need browser coverage |

CI owns the order and environment; the repository owns the commands. Keep
network calls, model calls, and mutable external state out of unit tests. Use
fixtures or disposable services for tests, and keep production AI credentials
out of merge request pipelines.

The example starter has no interactive browser flow, so it does not define a
`test:e2e` script. Add one when an app has a browser journey worth protecting;
run it against the built candidate in a browser-capable CI job.

## Promotion and operations checklist

Before calling an app ready for staff or production use, verify:

- dependency lockfile is committed and frozen installs pass;
- PostgreSQL migrations are reviewed and have a rollback or forward-fix plan;
- AI provider configuration is environment-based and has timeout, retry,
  budget, and redaction controls;
- OpenClaw tools and plugins are allowlisted, version-pinned, and scoped to
  the smallest required agent/session permissions;
- Milvus and SeaweedFS data paths have retention, backup, and restore checks;
- image scan, SBOM, provenance, and signature artifacts are retained;
- deploy credentials are protected and unavailable to merge request jobs;
- health, readiness, error rate, latency, queue depth, model cost, and storage
  capacity are observable;
- a rollback or forward-recovery drill has been run against the release shape.

Keep an app's CI configuration next to its source, record the Launch Sequence
SHA in its change history, and review the pin on a deliberate cadence. The
public mirror is a learning surface; GitLab remains the source of CI/CD truth
for internally controlled applications.

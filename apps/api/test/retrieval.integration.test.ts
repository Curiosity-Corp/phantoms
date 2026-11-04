import { describe, expect, test } from 'bun:test';

// Opt in with RETRIEVAL_INTEGRATION=1 after starting the Compose profiles:
//   docker compose --profile retrieval --profile objects up -d --wait
// Once enabled, an unreachable service is a failure, not a skip, so a broken
// profile cannot pass quietly. The defaults match compose.yaml.
const enabled = Bun.env.RETRIEVAL_INTEGRATION === '1';

if (!enabled) {
  test.skip('Milvus and SeaweedFS tests require RETRIEVAL_INTEGRATION=1', () => {});
} else {
  const milvusUrl = Bun.env.MILVUS_URL ?? 'http://127.0.0.1:19530';
  const s3 = new Bun.S3Client({
    endpoint: Bun.env.S3_ENDPOINT ?? 'http://127.0.0.1:8333',
    accessKeyId: Bun.env.S3_ACCESS_KEY ?? 'phantoms-local',
    secretAccessKey: Bun.env.S3_SECRET_KEY ?? 'phantoms-local-secret',
    bucket: Bun.env.S3_TEST_BUCKET ?? 'phantoms-integration',
    region: 'us-east-1',
  });

  // The bucket Milvus is configured to use (MILVUS_BUCKET in compose.yaml).
  const milvusBucket = new Bun.S3Client({
    endpoint: Bun.env.S3_ENDPOINT ?? 'http://127.0.0.1:8333',
    accessKeyId: Bun.env.S3_ACCESS_KEY ?? 'phantoms-local',
    secretAccessKey: Bun.env.S3_SECRET_KEY ?? 'phantoms-local-secret',
    bucket: Bun.env.MILVUS_BUCKET ?? 'milvus',
    region: 'us-east-1',
  });

  async function countSegmentFiles() {
    const listed = await milvusBucket.list({
      prefix: 'files/insert_log/',
      maxKeys: 1000,
    });
    return listed.keyCount ?? 0;
  }

  // Milvus REST API v2 answers 200 with `code: 0` on success.
  async function milvus<T = unknown>(path: string, body: object): Promise<T> {
    const response = await fetch(`${milvusUrl}/v2/vectordb/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const payload = (await response.json()) as {
      code: number;
      message?: string;
      data: T;
    };
    if (!response.ok || payload.code !== 0) {
      throw new Error(
        `Milvus ${path} failed: ${payload.message ?? response.status}`,
      );
    }
    return payload.data;
  }

  describe('SeaweedFS S3 API', () => {
    test('writes, reads and deletes an object', async () => {
      const key = `it-${crypto.randomUUID()}.txt`;
      const body = `object ${crypto.randomUUID()}`;
      try {
        await s3.write(key, body);
        expect(await s3.exists(key)).toBe(true);
        expect(await s3.file(key).text()).toBe(body);
      } finally {
        await s3.delete(key);
      }
      expect(await s3.exists(key)).toBe(false);
    });
  });

  describe('Milvus', () => {
    test('inserts and searches vectors', async () => {
      const collectionName = `it_${crypto.randomUUID().replaceAll('-', '')}`;
      await milvus('collections/create', {
        collectionName,
        dimension: 4,
        metricType: 'COSINE',
        idType: 'Int64',
        autoID: false,
        primaryFieldName: 'id',
        vectorFieldName: 'vector',
        params: { consistencyLevel: 'Strong' },
      });
      try {
        const inserted = await milvus<{ insertCount: number }>(
          'entities/insert',
          {
            collectionName,
            data: [
              { id: 1, vector: [1, 0, 0, 0], text: 'north' },
              { id: 2, vector: [0, 1, 0, 0], text: 'east' },
              { id: 3, vector: [0.9, 0.1, 0, 0], text: 'north-ish' },
            ],
          },
        );
        expect(inserted.insertCount).toBe(3);

        const found = await milvus<{ id: number; text: string }[]>(
          'entities/search',
          {
            collectionName,
            data: [[1, 0, 0, 0]],
            annsField: 'vector',
            limit: 2,
            outputFields: ['text'],
          },
        );
        expect(found.map((match) => match.text)).toEqual([
          'north',
          'north-ish',
        ]);

        // A flush makes Milvus write its segment files to the S3 store, which
        // is the part of the Milvus and SeaweedFS pairing that needs proof.
        const before = await countSegmentFiles();
        await milvus('collections/flush', { collectionName });
        expect(await countSegmentFiles()).toBeGreaterThan(before);
      } finally {
        await milvus('collections/drop', { collectionName });
      }
    });
  });
}

import { and, cosineDistance, eq, gt, sql } from 'drizzle-orm';
import type { AppDatabase } from '../client';
import {
  type DocumentChunk,
  documentChunks,
  EMBEDDING_DIMENSIONS,
} from './schema';

export type ChunkInput = {
  sourceId: string;
  chunkIndex: number;
  content: string;
  embedding: number[];
};

export type ChunkMatch = Pick<
  DocumentChunk,
  'id' | 'sourceId' | 'chunkIndex' | 'content'
> & {
  /** 1 is identical direction, 0 is unrelated, -1 is opposite. */
  similarity: number;
};

export type SearchOptions = {
  limit?: number;
  /** Drop matches below this cosine similarity. */
  minSimilarity?: number;
  /** Restrict the search to one source, for example after an access check. */
  sourceId?: string;
};

function assertEmbedding(embedding: number[]) {
  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Expected an embedding of ${EMBEDDING_DIMENSIONS} numbers, got ${embedding.length}.`,
    );
  }
  if (!embedding.every(Number.isFinite)) {
    throw new Error('An embedding must contain only finite numbers.');
  }
}

/**
 * Chunk storage and cosine-similarity search on PostgreSQL with pgvector. It
 * needs the migration in `drizzle-vector/`, which creates the extension, so use
 * it only against a database that has pgvector installed.
 */
export function createChunkStore(db: AppDatabase) {
  return {
    /** Inserts or replaces chunks by (sourceId, chunkIndex). */
    async upsert(chunks: ChunkInput[]): Promise<void> {
      if (chunks.length === 0) return;
      for (const chunk of chunks) assertEmbedding(chunk.embedding);
      await db
        .insert(documentChunks)
        .values(chunks)
        .onConflictDoUpdate({
          target: [documentChunks.sourceId, documentChunks.chunkIndex],
          set: {
            content: sql`excluded.content`,
            embedding: sql`excluded.embedding`,
          },
        });
    },

    /** Returns the closest chunks, best first. */
    async search(
      embedding: number[],
      options: SearchOptions = {},
    ): Promise<ChunkMatch[]> {
      assertEmbedding(embedding);
      const limit = Math.min(Math.max(options.limit ?? 5, 1), 100);
      const similarity = sql<number>`1 - (${cosineDistance(documentChunks.embedding, embedding)})`;
      const filters = [
        options.sourceId === undefined
          ? undefined
          : eq(documentChunks.sourceId, options.sourceId),
        options.minSimilarity === undefined
          ? undefined
          : gt(similarity, options.minSimilarity),
      ].filter((filter) => filter !== undefined);
      return db
        .select({
          id: documentChunks.id,
          sourceId: documentChunks.sourceId,
          chunkIndex: documentChunks.chunkIndex,
          content: documentChunks.content,
          similarity,
        })
        .from(documentChunks)
        .where(filters.length > 0 ? and(...filters) : undefined)
        .orderBy(cosineDistance(documentChunks.embedding, embedding))
        .limit(limit);
    },

    /** Removes every chunk of a source, so deleted data leaves the index. */
    async removeSource(sourceId: string): Promise<void> {
      await db
        .delete(documentChunks)
        .where(eq(documentChunks.sourceId, sourceId));
    },
  };
}

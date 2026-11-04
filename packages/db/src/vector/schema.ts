import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';

/**
 * Size of one embedding. It must equal the output size of the embedding model
 * you use; changing it means a new migration and re-embedding every chunk.
 * 1536 is a placeholder, not a recommendation.
 */
export const EMBEDDING_DIMENSIONS = 1536;

/**
 * One searchable piece of a source document. `sourceId` points back to the
 * record the text came from, so that access checks, freshness and deletion can
 * follow the source instead of the index.
 */
export const documentChunks = pgTable(
  'document_chunks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sourceId: text('source_id').notNull(),
    chunkIndex: integer('chunk_index').notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding', {
      dimensions: EMBEDDING_DIMENSIONS,
    }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('document_chunks_source_chunk_unique').on(
      table.sourceId,
      table.chunkIndex,
    ),
    // Approximate nearest-neighbour index for cosine distance. The queries in
    // chunks.ts use the same operator, so the planner can use it.
    index('document_chunks_embedding_hnsw').using(
      'hnsw',
      table.embedding.op('vector_cosine_ops'),
    ),
  ],
);

export type DocumentChunk = typeof documentChunks.$inferSelect;

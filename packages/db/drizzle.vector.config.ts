import { defineConfig } from 'drizzle-kit';

// Separate from drizzle.config.ts on purpose: the default migrations must run
// on the plain PostgreSQL image, and this schema needs the pgvector extension.
export default defineConfig({
  schema: './src/vector/schema.ts',
  out: './drizzle-vector',
  dialect: 'postgresql',
  migrations: { table: '__drizzle_migrations_vector' },
  dbCredentials: {
    url:
      Bun.env.PGVECTOR_DATABASE_URL ??
      'postgres://phantoms:dev-only-change-me@127.0.0.1:5433/phantoms',
  },
});

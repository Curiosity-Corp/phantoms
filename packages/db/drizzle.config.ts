import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      Bun.env.DATABASE_URL ??
      'postgres://phantoms:local-only@127.0.0.1:5432/phantoms',
  },
});

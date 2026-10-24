import { defineConfig } from "drizzle-kit";

/**
 * Schema source of truth for Drizzle queries.
 *
 * Migrations are versioned SQL files under lib/db/migrations and are applied
 * by `npm run db:migrate` (tools/db-migrate.ts). `drizzle-kit` is kept for
 * schema inspection and future `drizzle-kit generate` use; the deploy path
 * never relies on `push`.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/aipass_local",
  },
  strict: true,
  verbose: true,
});

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getConfig, getDatabaseUrl } from "@/lib/config";
import * as schema from "@/lib/db/schema";

/**
 * PostgreSQL access for server components, route handlers, and tools.
 *
 * One client per process. Vercel functions are short-lived, so the pool is
 * small and prepared statements are disabled for pooler compatibility.
 */

type Sql = ReturnType<typeof postgres>;

const globalForDb = globalThis as unknown as {
  __aipassSql?: Sql;
  __aipassDb?: PostgresJsDatabase<typeof schema>;
};

export function getSql(): Sql {
  if (!globalForDb.__aipassSql) {
    const config = getConfig();
    const max = config.APP_ENV === "local" ? 10 : 3;
    globalForDb.__aipassSql = postgres(getDatabaseUrl(), {
      max,
      idle_timeout: 20,
      connect_timeout: 15,
      prepare: false,
      onnotice: () => {},
    });
  }
  return globalForDb.__aipassSql;
}

export function getDb(): PostgresJsDatabase<typeof schema> {
  if (!globalForDb.__aipassDb) {
    globalForDb.__aipassDb = drizzle(getSql(), { schema });
  }
  return globalForDb.__aipassDb;
}

export async function closeDb(): Promise<void> {
  if (globalForDb.__aipassSql) {
    await globalForDb.__aipassSql.end({ timeout: 5 });
    globalForDb.__aipassSql = undefined;
    globalForDb.__aipassDb = undefined;
  }
}

/** Health probe: returns false instead of throwing when the database is down. */
export async function pingDatabase(): Promise<boolean> {
  try {
    await getSql()`select 1`;
    return true;
  } catch {
    return false;
  }
}

export type Database = PostgresJsDatabase<typeof schema>;

/** A transaction handle from `db.transaction`. */
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Anything that can run drizzle queries: the pool or an open transaction. */
export type DbLike = Database | Tx;

export { schema };

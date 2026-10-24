/**
 * Purpose: apply versioned SQL migrations.
 *
 * Usage: npm run db:migrate
 *
 * Prints the environment and namespace before touching the database, so an
 * operator can see which target is about to change.
 */
import { loadScriptEnv } from "@/lib/scripts/env";

loadScriptEnv();

import postgres from "postgres";
import { getConfig, getDatabaseUrl } from "@/lib/config";
import { runMigrations } from "@/lib/db/migrate";

function safeHost(databaseUrl: string): string {
  try {
    const url = new URL(databaseUrl);
    return `${url.hostname}:${url.port || "5432"}${url.pathname}`;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

async function main() {
  const config = getConfig();
  const databaseUrl = getDatabaseUrl();

  console.log(`environment: ${config.APP_ENV}`);
  console.log(`namespace:   ${config.DATA_NAMESPACE}`);
  console.log(`database:    ${safeHost(databaseUrl)}`);

  const sql = postgres(databaseUrl, { max: 1, prepare: false, onnotice: () => {} });
  try {
    const result = await runMigrations(sql);
    for (const name of result.applied) console.log(`applied  ${name}`);
    for (const name of result.skipped) console.log(`up-to-date ${name}`);
    console.log(
      `done: ${result.applied.length} applied, ${result.skipped.length} already applied`,
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error(`db:migrate failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type postgres from "postgres";

/**
 * Versioned SQL migration runner.
 *
 * Each file in lib/db/migrations is applied once inside a transaction and
 * recorded with its SHA-256. Editing an applied file is an error, so a
 * deployed database cannot silently diverge from the repository.
 */

const MIGRATIONS_DIR = path.join(process.cwd(), "lib", "db", "migrations");
const LOCK_KEY = "aipass:migrate";

export type MigrationResult = {
  applied: string[];
  skipped: string[];
};

function checksum(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export async function runMigrations(sql: postgres.Sql): Promise<MigrationResult> {
  const files = (await readdir(MIGRATIONS_DIR))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  await sql`select pg_advisory_lock(hashtext(${LOCK_KEY}))`;
  try {
    await sql`
      create table if not exists schema_migrations (
        name text primary key,
        checksum text not null,
        applied_at timestamptz not null default now()
      )
    `;

    const rows = await sql<{ name: string; checksum: string }[]>`
      select name, checksum from schema_migrations
    `;
    const applied = new Map(rows.map((row) => [row.name, row.checksum]));

    const result: MigrationResult = { applied: [], skipped: [] };

    for (const file of files) {
      const content = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      const sum = checksum(content);
      const previous = applied.get(file);

      if (previous) {
        if (previous !== sum) {
          throw new Error(
            `Migration ${file} changed after it was applied. Add a new migration instead of editing history.`,
          );
        }
        result.skipped.push(file);
        continue;
      }

      await sql.begin(async (tx) => {
        await tx.unsafe(content);
        await tx`insert into schema_migrations (name, checksum) values (${file}, ${sum})`;
      });
      result.applied.push(file);
    }

    return result;
  } finally {
    await sql`select pg_advisory_unlock(hashtext(${LOCK_KEY}))`;
  }
}

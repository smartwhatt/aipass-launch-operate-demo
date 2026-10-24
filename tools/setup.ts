/**
 * Purpose: one-time local setup.
 *
 * Usage:
 *   npm run setup              # create .env.local, apply migrations, create accounts
 *   npm run setup -- --rotate  # replace the three teaching passwords
 *
 * Writes .env.local (gitignored) and local-accounts.<namespace>.txt (gitignored).
 * Passwords appear once, in that file, never in the repository or the logs.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { loadScriptEnv, reloadScriptEnv } from "@/lib/scripts/env";

loadScriptEnv();

import postgres from "postgres";
import { getConfig, getDatabaseUrl, resetConfigCache } from "@/lib/config";
import { runMigrations } from "@/lib/db/migrate";
import { getDb } from "@/lib/db/client";
import { ensureAccounts, renderAccountsFile } from "@/lib/seed/accounts";

const ROOT = process.cwd();

function readPackageVersion(): string {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")) as {
    version: string;
  };
  return pkg.version;
}

function ensureEnvFile(): string {
  const envPath = path.join(ROOT, ".env.local");
  const examplePath = path.join(ROOT, ".env.example");
  const version = readPackageVersion();

  let content = existsSync(envPath)
    ? readFileSync(envPath, "utf8")
    : readFileSync(examplePath, "utf8");

  const created = !existsSync(envPath);
  const secret = /^SESSION_SECRET=(.*)$/m.exec(content)?.[1]?.trim() ?? "";
  if (secret.length < 32) {
    const generated = randomBytes(32).toString("hex");
    content = content.replace(/^SESSION_SECRET=.*$/m, `SESSION_SECRET=${generated}`);
    console.log("generated SESSION_SECRET");
  }

  content = content.replace(/^APP_VERSION=.*$/m, `APP_VERSION=${version}`);

  if (/^APP_COMMIT=$/m.test(content)) {
    const git = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
    if (git.status === 0 && git.stdout.trim()) {
      content = content.replace(/^APP_COMMIT=.*$/m, `APP_COMMIT=${git.stdout.trim()}`);
      console.log(`recorded APP_COMMIT=${git.stdout.trim().slice(0, 12)}`);
    }
  }

  writeFileSync(envPath, content, { mode: 0o600 });
  if (created) console.log("created .env.local from .env.example");
  return envPath;
}

function writeAccountsFile(contents: string, namespace: string): string {
  const target = path.join(ROOT, `local-accounts.${namespace}.txt`);
  writeFileSync(target, contents, { mode: 0o600 });
  return target;
}

async function main() {
  const rotate = process.argv.includes("--rotate");
  ensureEnvFile();

  // Re-read after writing so the generated secret is visible to this process.
  reloadScriptEnv();
  resetConfigCache();
  const config = getConfig();
  const databaseUrl = getDatabaseUrl();

  console.log(`environment: ${config.APP_ENV}`);
  console.log(`namespace:   ${config.DATA_NAMESPACE}`);
  console.log(`app version: ${config.APP_VERSION}`);

  const sql = postgres(databaseUrl, { max: 1, prepare: false, onnotice: () => {} });
  try {
    const migrations = await runMigrations(sql);
    console.log(
      `migrations: ${migrations.applied.length} applied, ${migrations.skipped.length} already applied`,
    );
  } finally {
    await sql.end({ timeout: 5 });
  }

  const accounts = await ensureAccounts(getDb(), config.DATA_NAMESPACE, {
    rotatePasswords: rotate,
  });
  const file = writeAccountsFile(
    renderAccountsFile(accounts, config.DATA_NAMESPACE, config.APP_ENV),
    config.DATA_NAMESPACE,
  );

  const created = accounts.filter((account) => account.created).length;
  console.log(`accounts: ${created} created, ${accounts.length - created} already present`);
  console.log(`passwords: ${file} (mode 600, gitignored)`);
  console.log("");
  console.log("next:");
  console.log("  npm run db:migrate   # if you changed migrations");
  console.log("  npm run demo:seed    # documents, index, scenario data");
  console.log("  npm run dev");
}

main().catch((error) => {
  console.error(`setup failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

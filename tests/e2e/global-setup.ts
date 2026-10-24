import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Prepares a dedicated E2E namespace: migrations, three accounts with known
 * passwords, documents and index, and the EP1 baseline scenario.
 */
export default async function globalSetup() {
  process.env.APP_ENV = "local";
  process.env.DATA_NAMESPACE = "aipass-e2e";
  process.env.DATABASE_URL =
    process.env.TEST_DATABASE_URL ??
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:5432/aipass_local";
  process.env.SESSION_SECRET =
    process.env.SESSION_SECRET ?? "e2e-secret-0123456789abcdef0123456789abcdef";
  process.env.AI_MODE = "fixture";
  process.env.DEMO_CONTROLS_ENABLED = "true";
  const pkg = JSON.parse(
    (await import("node:fs")).readFileSync("package.json", "utf8"),
  ) as { version: string };
  process.env.APP_VERSION = pkg.version;

  const { getDb, getSql } = await import("../../lib/db/client");
  const { runMigrations } = await import("../../lib/db/migrate");
  const { ensureAccounts } = await import("../../lib/seed/accounts");
  const { applyScenario } = await import("../../lib/seed/scenarios");

  const sql = getSql();
  await runMigrations(sql);
  const accounts = await ensureAccounts(getDb(), process.env.DATA_NAMESPACE, {
    rotatePasswords: true,
  });

  await applyScenario(getDb(), {
    scenario: "ep1-baseline",
    namespace: process.env.DATA_NAMESPACE,
    actor: "playwright-setup",
    appVersion: pkg.version,
    appEnv: "local",
    controlsEnabled: true,
  });

  const credentials = Object.fromEntries(
    accounts.map((account) => [account.username, account.password]),
  );
  const target = path.join(process.cwd(), "artifacts", "e2e-accounts.json");
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(credentials, null, 2), { mode: 0o600 });

  await sql.end({ timeout: 5 });
}

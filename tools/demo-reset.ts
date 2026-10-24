/**
 * Purpose: apply a named teaching scenario reset.
 *
 * Usage:
 *   npm run demo:reset -- --scenario ep1-baseline
 *   npm run demo:reset -- --scenario ep3-stale-index
 *   npm run demo:reset -- --scenario ep3-stale-index --namespace aipass-preview --allow-remote-reset
 *
 * Prints the environment and namespace before touching data. Refuses to run
 * against a general learner deployment (DEMO_CONTROLS_ENABLED=false) and
 * refuses a remote reset without an explicit namespace and flag.
 */
import { loadScriptEnv } from "@/lib/scripts/env";

loadScriptEnv();

import { getConfig, getDatabaseUrl } from "@/lib/config";
import { getDb, closeDb } from "@/lib/db/client";
import { SCENARIO_IDS, applyScenario, ScenarioError } from "@/lib/seed/scenarios";

function argument(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return process.argv[index + 1];
}

function hostIsLocal(databaseUrl: string): boolean {
  try {
    const host = new URL(databaseUrl).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

async function main() {
  const scenario = argument("scenario");
  const explicitNamespace = argument("namespace");
  const allowRemote = process.argv.includes("--allow-remote-reset");
  const force = process.argv.includes("--force");
  const config = getConfig();

  if (!scenario) {
    console.error(`Missing --scenario. Known scenarios:\n  ${SCENARIO_IDS.join("\n  ")}`);
    process.exitCode = 2;
    return;
  }

  const databaseUrl = getDatabaseUrl();
  const isRemote = !hostIsLocal(databaseUrl) || config.APP_ENV !== "local";
  const namespace = explicitNamespace ?? config.DATA_NAMESPACE;

  console.log("demo reset");
  console.log(`  scenario:  ${scenario}`);
  console.log(`  environment: ${config.APP_ENV}`);
  console.log(`  namespace: ${namespace}`);
  console.log(`  app version: ${config.APP_VERSION}`);
  console.log(`  controls:  ${config.DEMO_CONTROLS_ENABLED ? "enabled" : "DISABLED"}`);

  if (isRemote && namespace !== config.DATA_NAMESPACE) {
    console.error("Refusing: --namespace does not match the configured DATA_NAMESPACE.");
    process.exitCode = 2;
    return;
  }
  if (isRemote) {
    console.log("  target is remote: requires --allow-remote-reset");
  }

  const result = await applyScenario(getDb(), {
    scenario,
    namespace,
    actor: "cli",
    appVersion: config.APP_VERSION,
    appEnv: config.APP_ENV,
    controlsEnabled: config.DEMO_CONTROLS_ENABLED,
    allowRemoteReset: allowRemote,
    isRemote,
    force,
  });

  console.log("");
  for (const action of result.actions) console.log(`  + ${action}`);
  console.log(`  active index: ${result.activeIndex}`);
  console.log(`  mode: ${result.mode}`);
  if (result.historical) {
    console.log(
      `  historical: ${result.historical.requests} requests, THB ${result.historical.costThb.toFixed(2)}, p95 ${result.historical.p95Ms} ms`,
    );
  }
  if (result.warnings.length > 0) {
    console.log("");
    console.log("warnings:");
    for (const warning of result.warnings) console.log(`  ! ${warning}`);
  }
  console.log("");
  console.log(`applied ${result.scenario} in ${result.namespace}`);
}

main()
  .catch((error) => {
    if (error instanceof ScenarioError) {
      console.error(`refused: ${error.message}`);
      process.exitCode = 2;
      return;
    }
    console.error(`demo:reset failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(() => closeDb());

/**
 * Purpose: release gate. Fails when the repository cannot be released safely.
 *
 * Usage: npm run release:check
 *
 * Checks: app version matches package.json, migrations exist, the workbook is
 * present with a recorded checksum, no secrets are tracked, required docs and
 * fixtures exist, and the handoff validator still passes.
 */
import { loadScriptEnv } from "@/lib/scripts/env";

loadScriptEnv();

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { getConfig } from "@/lib/config";

const ROOT = process.cwd();
const WORKBOOK = path.join(ROOT, "public", "downloads", "AIPASS_AI_App_Cost_Calculator_v1.xlsx");
const CHECKSUM_FILE = path.join(ROOT, "docs", "WORKBOOK_SHA256.txt");

type Check = { name: string; ok: boolean; detail: string };

const checks: Check[] = [];

function add(name: string, ok: boolean, detail: string) {
  checks.push({ name, ok, detail });
}

function run(command: string, args: string[]): { ok: boolean; output: string } {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: "utf8" });
  return {
    ok: result.status === 0,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim(),
  };
}

function main() {
  const config = getConfig();
  const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")) as {
    version: string;
    engines?: { node?: string };
  };

  add(
    "app version matches package.json",
    config.APP_VERSION === pkg.version,
    `APP_VERSION=${config.APP_VERSION} package.json=${pkg.version}`,
  );
  add(
    "Node engine declared",
    Boolean(pkg.engines?.node),
    `engines.node=${pkg.engines?.node ?? "(missing)"}`,
  );
  add("lockfile committed", existsSync(path.join(ROOT, "package-lock.json")), "package-lock.json");

  const migrationsDir = path.join(ROOT, "lib", "db", "migrations");
  const migrations = existsSync(migrationsDir)
    ? readdirSync(migrationsDir).filter((name) => name.endsWith(".sql"))
    : [];
  add("versioned migrations present", migrations.length > 0, `${migrations.length} file(s)`);

  if (existsSync(WORKBOOK)) {
    const bytes = readFileSync(WORKBOOK);
    const sha = createHash("sha256").update(bytes).digest("hex");
    const recorded = existsSync(CHECKSUM_FILE)
      ? readFileSync(CHECKSUM_FILE, "utf8").trim().split(/\s+/)[0]
      : "";
    add(
      "workbook present",
      true,
      `${bytes.length} bytes · sha256 ${sha}`,
    );
    add(
      "workbook checksum matches docs/WORKBOOK_SHA256.txt",
      recorded === sha,
      recorded ? `recorded ${recorded}` : "docs/WORKBOOK_SHA256.txt is missing",
    );
  } else {
    add("workbook present", false, "run npm run calculator:build");
  }

  const tracked = run("git", ["ls-files"]);
  if (tracked.ok) {
    const trackedFiles = tracked.output.split("\n");
    const forbidden = trackedFiles.filter((file) =>
      /^(\.env(?!\.example)|local-accounts|artifacts\/|\.tools\/|\.cache\/)/.test(file),
    );
    add("no secrets or local accounts tracked", forbidden.length === 0, forbidden.join(", ") || "clean");
    add(
      "workbook is committed",
      trackedFiles.includes("public/downloads/AIPASS_AI_App_Cost_Calculator_v1.xlsx"),
      "public/downloads/AIPASS_AI_App_Cost_Calculator_v1.xlsx",
    );
  } else {
    add("git metadata available", false, tracked.output);
  }

  const sourceSecret = run("grep", [
    "-rIl",
    "--exclude-dir=node_modules",
    "--exclude-dir=.next",
    "--exclude-dir=.git",
    "--exclude=*.example",
    "NEXT_PUBLIC_.*SECRET\\|NEXT_PUBLIC_.*KEY",
    "app",
    "components",
    "lib",
  ]);
  add("no NEXT_PUBLIC_ secrets in client code", sourceSecret.output.length === 0, "clean");

  const requiredDocs = [
    "README.md",
    "README.th.md",
    "docs/SETUP.md",
    "docs/RECORDING_RUNBOOK.md",
    "docs/VIDEO_DEMO_MATRIX.md",
    "docs/AIPASS_PROMPTS.md",
    "docs/DISTRIBUTION.md",
    "docs/IMPLEMENTATION_REPORT.md",
    "IMPLEMENTATION_SPEC.md",
    "AGENTS.md",
  ];
  const missingDocs = requiredDocs.filter((file) => !existsSync(path.join(ROOT, file)));
  add("required docs present", missingDocs.length === 0, missingDocs.join(", ") || "all present");

  const requiredFixtures = [
    "fixtures/documents/docs-v1.json",
    "fixtures/documents/docs-v2.json",
    "fixtures/evaluation-cases.json",
    "fixtures/scenarios.json",
    "fixtures/cost-cases.json",
    "fixtures/calculator-layout.json",
    "fixtures/dashboard-contract.json",
  ];
  const missingFixtures = requiredFixtures.filter((file) => !existsSync(path.join(ROOT, file)));
  add("teaching fixtures present", missingFixtures.length === 0, missingFixtures.join(", ") || "all present");

  const validator = run("python3", ["tools/validate_handoff.py"]);
  add(
    "handoff validator passes",
    validator.ok,
    validator.ok ? "PASS" : validator.output.split("\n").slice(-3).join(" "),
  );

  console.log("release check");
  console.log(`  environment: ${config.APP_ENV}`);
  console.log(`  namespace:   ${config.DATA_NAMESPACE}`);
  console.log("");
  for (const check of checks) {
    console.log(`  ${check.ok ? "PASS" : "FAIL"}  ${check.name} — ${check.detail}`);
  }
  const failed = checks.filter((check) => !check.ok);
  console.log("");
  console.log(`${checks.length - failed.length}/${checks.length} checks passed`);
  if (failed.length > 0) {
    console.log("release blocked");
    process.exitCode = 1;
  } else {
    console.log("release gate passed");
  }
}

try {
  main();
} catch (error) {
  console.error(`release:check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

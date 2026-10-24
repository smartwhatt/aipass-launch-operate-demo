/**
 * Purpose: build the distribution ZIP for learners and agents.
 *
 * Usage: npm run release:zip
 *
 * Excludes secrets, credentials, local accounts, .git, node_modules, build
 * output, generated evidence, and local tooling. Includes fixtures, docs,
 * migrations, tests, and the workbook.
 */
import { loadScriptEnv } from "@/lib/scripts/env";

loadScriptEnv();

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "release");

const EXCLUDES = [
  ".git/*",
  "node_modules/*",
  ".next/*",
  ".vercel/*",
  ".tools/*",
  ".cache/*",
  ".pgdata/*",
  ".pgsocket/*",
  "artifacts/*",
  "release/*",
  "coverage/*",
  "playwright-report/*",
  "test-results/*",
  "*.env",
  ".env*",
  "local-accounts*",
  "*.log",
  ".DS_Store",
];

function version(): string {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")) as {
    version: string;
  };
  return pkg.version;
}

function main() {
  const zipBinary = spawnSync("which", ["zip"], { encoding: "utf8" });
  if (zipBinary.status !== 0) {
    console.error("zip is not installed. Install it or create the archive with your platform tool.");
    process.exitCode = 1;
    return;
  }

  const appVersion = version();
  const name = `aipass-launch-operate-demo-v${appVersion}`;
  mkdirSync(OUT_DIR, { recursive: true });
  const target = path.join(OUT_DIR, `${name}.zip`);

  const args = ["-r", "-q", target, ".", ...EXCLUDES.flatMap((pattern) => ["-x", pattern])];
  const result = spawnSync("zip", args, { cwd: ROOT, encoding: "utf8" });
  if (result.status !== 0) {
    console.error(`zip failed: ${result.stderr}`);
    process.exitCode = 1;
    return;
  }

  const bytes = readFileSync(target);
  const sha = createHash("sha256").update(bytes).digest("hex");
  writeFileSync(path.join(OUT_DIR, "SHA256SUMS"), `${sha}  ${name}.zip\n`);

  console.log(`created ${path.relative(ROOT, target)}`);
  console.log(`  bytes:  ${statSync(target).size}`);
  console.log(`  sha256: ${sha}`);
  console.log(`  sums:   release/SHA256SUMS`);

  const verify = spawnSync("unzip", ["-l", target], { encoding: "utf8" });
  if (verify.status === 0) {
    const lines = verify.stdout.split("\n").filter((line) => line.trim().length > 0);
    console.log(`  entries: ${Math.max(0, lines.length - 3)}`);
    const leaked = lines.filter((line) =>
      /local-accounts|\.env\.local|artifacts\/|node_modules\//.test(line),
    );
    if (leaked.length > 0) {
      console.error("archive contains excluded files:");
      for (const line of leaked) console.error(`  ${line}`);
      process.exitCode = 1;
    }
  }

  if (!existsSync(path.join(ROOT, "public", "downloads", "AIPASS_AI_App_Cost_Calculator_v1.xlsx"))) {
    console.warn("warning: the workbook was missing when the archive was built");
  }
}

main();

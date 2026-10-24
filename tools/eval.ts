/**
 * Purpose: run the ten evaluation cases in fixture or live mode.
 *
 * Usage:
 *   npm run eval -- --mode fixture --suite current
 *   npm run eval -- --mode fixture --suite current --target docs-v1
 *   npm run eval -- --mode live --suite current
 *
 * Exit codes: 0 = gate passed, 1 = gate failed, 2 = blocked (missing key or
 * unverified pricing) or bad arguments. A blocked live run never reports a pass.
 */
import { loadScriptEnv } from "@/lib/scripts/env";

loadScriptEnv();

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getCommitSha, getConfig } from "@/lib/config";
import { getDb, closeDb } from "@/lib/db/client";
import { EvaluationBlocked, runEvaluation } from "@/lib/evaluation/runner";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  const mode = argument("mode") ?? "fixture";
  const suite = argument("suite") ?? "current";
  const target = argument("target");
  const config = getConfig();

  if (mode !== "fixture" && mode !== "live") {
    console.error(`--mode must be fixture or live, received ${mode}`);
    process.exitCode = 2;
    return;
  }
  if (target && target !== "docs-v1" && target !== "docs-v2") {
    console.error("--target must be docs-v1 or docs-v2");
    process.exitCode = 2;
    return;
  }

  console.log(`environment: ${config.APP_ENV}`);
  console.log(`namespace:   ${config.DATA_NAMESPACE}`);
  console.log(`suite:       ${suite}`);
  console.log(`mode:        ${mode}`);
  console.log(`model:       ${mode === "live" ? config.GEMINI_MODEL : "fixture-handbook-v1"}`);
  if (target) console.log(`target:      ${target}`);

  let summary;
  try {
    summary = await runEvaluation(getDb(), {
      namespace: config.DATA_NAMESPACE,
      suite,
      mode,
      targetDocument: target as "docs-v1" | "docs-v2" | undefined,
      appVersion: config.APP_VERSION,
      commitSha: getCommitSha(),
      apiKey: config.GEMINI_API_KEY,
      modelId: config.GEMINI_MODEL,
    });
  } catch (error) {
    if (error instanceof EvaluationBlocked) {
      console.error("");
      console.error(`BLOCKED: ${error.reason}`);
      console.error("This run is not a pass. Fix the blocked condition and run again.");
      process.exitCode = 2;
      return;
    }
    throw error;
  }

  console.log("");
  console.log(`run:         ${summary.runId}`);
  console.log(`document:    ${summary.docKey} / ${summary.indexKey}`);
  console.log("");
  console.log("case  crit  status              result  notes");
  for (const result of summary.cases) {
    const notes = result.failures.length > 0 ? result.failures.join("; ") : "";
    console.log(
      `${result.caseId.padEnd(5)} ${result.critical ? "yes " : "no  "} ${result.status.padEnd(19)} ${
        result.passed ? "PASS" : "FAIL"
      }    ${notes}`,
    );
  }
  console.log("");
  console.log(
    `total: ${summary.passed}/${summary.total} (minimum ${summary.minimumTotalPass}) | critical: ${summary.criticalPassed}/${summary.criticalTotal}`,
  );
  console.log(`gate: ${summary.meetsGate ? "PASS" : "FAIL"}`);

  const artifactsDir = path.join(process.cwd(), "artifacts");
  await mkdir(artifactsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const artifactPath = path.join(artifactsDir, `eval-${mode}-${stamp}.json`);
  await writeFile(
    artifactPath,
    JSON.stringify(
      {
        ...summary,
        environment: config.APP_ENV,
        namespace: config.DATA_NAMESPACE,
        commit: getCommitSha(),
        promptVersion: "prompt-1",
      },
      null,
      2,
    ),
  );
  console.log(`evidence:    ${path.relative(process.cwd(), artifactPath)}`);

  if (!summary.meetsGate) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(`eval failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(() => closeDb());

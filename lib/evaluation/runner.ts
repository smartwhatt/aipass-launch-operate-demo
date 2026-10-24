import { eq } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import { evaluationResults, evaluationRuns } from "@/lib/db/schema";
import evaluationCases from "@/fixtures/evaluation-cases.json";
import type { Citation, DataMode, RetrievalHit } from "@/lib/domain/types";
import { runAnswer } from "@/lib/answers/answer-service";
import { getActiveContext } from "@/lib/state/active";
import { ensureIndex, ensureDocument } from "@/lib/seed/documents";
import { loadIndex } from "@/lib/state/active";
import { citationUrl, getCanonicalDocument } from "@/lib/retrieval/canonical";
import { selectProvider } from "@/lib/answers/ask";
import { PROMPT_VERSION } from "@/lib/providers/prompt";
import { checkCase } from "@/lib/evaluation/checks";
import { fixtureCallCostThb } from "@/lib/calculator/teaching-prices";

/**
 * Evaluation runner.
 *
 * Expected answers live in fixtures/evaluation-cases.json. Actual results are
 * recorded per run in PostgreSQL and in artifacts/. Runs bypass admission so
 * they never consume the pilot's quota or the teaching budget.
 */

export type EvaluationCase = {
  id: string;
  question: string;
  critical: boolean;
  expected_status: string;
  expected_section: string | null;
  expected_meaning: string;
};

export type CaseResult = {
  caseId: string;
  question: string;
  critical: boolean;
  expectedStatus: string;
  expectedSection: string | null;
  status: string;
  answer: string;
  citations: Citation[];
  retrieved: RetrievalHit[];
  latencyMs: number;
  passed: boolean;
  failures: string[];
};

export type EvaluationSummary = {
  runId: string;
  suite: string;
  mode: DataMode;
  docKey: string;
  indexKey: string;
  appVersion: string;
  modelId: string | null;
  total: number;
  passed: number;
  criticalPassed: number;
  criticalTotal: number;
  minimumTotalPass: number;
  meetsGate: boolean;
  startedAt: string;
  finishedAt: string;
  cases: CaseResult[];
};

export class EvaluationBlocked extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(reason);
    this.name = "EvaluationBlocked";
    this.reason = reason;
  }
}

export type RunEvaluationOptions = {
  namespace: string;
  suite?: string;
  mode: DataMode;
  targetDocument?: "docs-v1" | "docs-v2";
  appVersion: string;
  commitSha: string;
  apiKey: string;
  modelId: string;
};

export async function runEvaluation(
  db: Database,
  options: RunEvaluationOptions,
): Promise<EvaluationSummary> {
  const suite = options.suite ?? evaluationCases.suite;
  const cases = evaluationCases.cases as EvaluationCase[];

  let docKey: string;
  let indexKey: string;
  let entries;
  let aliasMap;

  if (options.targetDocument) {
    docKey = options.targetDocument;
    indexKey = docKey === "docs-v1" ? "index-v1" : "index-v2";
    await ensureDocument(db, options.namespace, docKey);
    await ensureIndex(db, options.namespace, docKey, indexKey);
    const index = await loadIndex(db, options.namespace, indexKey);
    if (!index) throw new Error(`Index ${indexKey} could not be loaded`);
    entries = index.entries;
    aliasMap = index.aliasMap;
  } else {
    const active = await getActiveContext(db, options.namespace);
    if (!active.index) throw new EvaluationBlocked("No active index. Run npm run demo:seed first.");
    docKey = active.index.docKey;
    indexKey = active.index.indexKey;
    entries = active.index.entries;
    aliasMap = active.index.aliasMap;
  }

  const selection = selectProvider(options.mode, {
    failRequests: false,
    apiKey: options.apiKey,
    modelId: options.modelId,
  });
  if (!selection.ok) {
    throw new EvaluationBlocked(selection.explanation);
  }

  const [run] = await db
    .insert(evaluationRuns)
    .values({
      namespace: options.namespace,
      suite,
      mode: options.mode,
      targetDocument: docKey,
      targetIndex: indexKey,
      appVersion: options.appVersion,
      documentVersion: docKey,
      indexVersion: indexKey,
      modelId: options.mode === "live" ? options.modelId : "fixture-handbook-v1",
      commitSha: options.commitSha,
      status: "running",
      total: cases.length,
    })
    .returning({ id: evaluationRuns.id });

  const startedAt = new Date().toISOString();
  const results: CaseResult[] = [];
  const outOfScope = getCanonicalDocument(docKey).out_of_scope;

  for (const testCase of cases) {
    const caseStarted = Date.now();
    const outcome = await runAnswer({
      question: testCase.question,
      docKey,
      indexKey,
      entries,
      aliasMap,
      outOfScope,
      provider: selection.provider,
      scenarioMode: "normal",
      incident: null,
      fallbackUrl: citationUrl(docKey, "2.1"),
      costForCall: options.mode === "fixture" ? () => fixtureCallCostThb() : selection.costForCall,
    });

    const failures = checkCase({
      caseId: testCase.id,
      question: testCase.question,
      status: outcome.status,
      answer: outcome.answer,
      citations: outcome.citations,
      docKey,
      expectedStatus: testCase.expected_status,
      expectedSection: testCase.expected_section,
    });

    results.push({
      caseId: testCase.id,
      question: testCase.question,
      critical: testCase.critical,
      expectedStatus: testCase.expected_status,
      expectedSection: testCase.expected_section,
      status: outcome.status,
      answer: outcome.answer,
      citations: outcome.citations,
      retrieved: outcome.retrieved,
      latencyMs: Date.now() - caseStarted,
      passed: failures.length === 0,
      failures,
    });
  }

  const passed = results.filter((result) => result.passed).length;
  const criticalCases = results.filter((result) => result.critical);
  const criticalPassed = criticalCases.filter((result) => result.passed).length;
  const meetsGate =
    passed >= evaluationCases.minimum_total_pass && criticalPassed === criticalCases.length;
  const finishedAt = new Date().toISOString();

  await db.transaction(async (tx) => {
    await tx
      .update(evaluationRuns)
      .set({
        status: "completed",
        passed,
        criticalPassed,
        criticalTotal: criticalCases.length,
        finishedAt: new Date(),
        summary: {
          meets_gate: meetsGate,
          minimum_total_pass: evaluationCases.minimum_total_pass,
          prompt_version: PROMPT_VERSION,
          mode: options.mode,
        },
      })
      .where(eq(evaluationRuns.id, run.id));

    await tx.insert(evaluationResults).values(
      results.map((result) => ({
        runId: run.id,
        caseId: result.caseId,
        question: result.question,
        expectedStatus: result.expectedStatus,
        expectedSection: result.expectedSection,
        status: result.status,
        answer: result.answer,
        citations: result.citations,
        retrieved: result.retrieved,
        latencyMs: result.latencyMs,
        passed: result.passed,
        failures: result.failures,
        actual: { meaning: result.passed ? "matched" : "did not match", critical: result.critical },
      })),
    );
  });

  return {
    runId: run.id,
    suite,
    mode: options.mode,
    docKey,
    indexKey,
    appVersion: options.appVersion,
    modelId: options.mode === "live" ? options.modelId : "fixture-handbook-v1",
    total: results.length,
    passed,
    criticalPassed,
    criticalTotal: criticalCases.length,
    minimumTotalPass: evaluationCases.minimum_total_pass,
    meetsGate,
    startedAt,
    finishedAt,
    cases: results,
  };
}

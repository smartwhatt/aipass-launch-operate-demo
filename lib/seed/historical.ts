import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { DbLike } from "@/lib/db/client";
import { feedback, modelCalls, requests, traceSpans } from "@/lib/db/schema";
import dashboardContract from "@/fixtures/dashboard-contract.json";
import pilotFeedback from "@/fixtures/pilot-feedback.json";
import pilotRequests from "@/fixtures/pilot-requests.json";
import { getCanonicalDocument } from "@/lib/retrieval/canonical";
import { buildCitation } from "@/lib/answers/guards";
import { buildIndex } from "@/lib/retrieval/index-build";
import { teachingCostPerCallThb } from "@/lib/calculator/teaching-prices";
import type { Citation } from "@/lib/domain/types";

/**
 * The fixed historical pilot dataset (spec section 9).
 *
 * 20 users, five working days, 200 requests, 194 successes, 6 errors,
 * 40 insufficient_info, 24 feedback rows (8 needs_correction), p95 9s by
 * nearest rank, 206 model calls, THB 28.84 at the teaching price.
 *
 * Dates, counts, and values are copied from fixtures/pilot-requests.json and
 * never change on reset. Later rehearsal requests carry dataset = 'live', so
 * they cannot move these numbers.
 */

type PilotRow = {
  id: string;
  user_id: string;
  created_at: string;
  latency_ms: number;
  status: string;
  mode: string;
  model_calls: number;
  input_tokens_per_call: number;
  output_tokens_per_call: number;
  app_version: string;
  prompt_version: string;
  document_version: string;
  index_version: string;
  question_id?: string;
  question?: string;
  answer?: string;
  citation_section?: string;
};

const rows = pilotRequests as PilotRow[];
const feedbackRows = pilotFeedback as Array<{
  id: string;
  request_id: string;
  label: "helpful" | "needs_correction";
  mode: string;
}>;

const HISTORICAL_DATASET = "historical-pilot";

const OK_QUESTIONS: Array<{ question: string; section: string }> = [
  { question: "ศูนย์เปิดกี่โมง", section: "2.1" },
  { question: "ขอใช้ห้องประชุมต้องเตรียมอะไร", section: "3.1" },
  { question: "ส่งคำขอใช้ห้องประชุมทางไหน", section: "3.2" },
  { question: "ติดต่อเจ้าหน้าที่ได้ที่ไหน", section: "4.1" },
  { question: "ส่งเลขบัตรในแชทได้ไหม", section: "4.2" },
];

const INSUFFICIENT_QUESTIONS = [
  "มีที่จอดรถไหม",
  "ชำระเงินผ่านบัตรได้ไหม",
  "มีอาหารกลางวันไหม",
  "มีบริการจัดส่งเอกสารทางไปรษณีย์ไหม",
];

function citationFor(docKey: string, sectionId: string): Citation | null {
  const doc = getCanonicalDocument(docKey);
  const built = buildIndex(doc);
  const section = built.entries.sections.find((entry) => entry.sectionId === sectionId);
  return section ? buildCitation(docKey, section) : null;
}

function spansFor(latency: number, calls: number, status: string) {
  const admission = { name: "admission", startOffsetMs: 0, durationMs: 2, attributes: { quota_counted: true } };
  const retrieve = {
    name: "retrieve",
    startOffsetMs: 2,
    durationMs: Math.max(4, Math.round(latency * 0.04)),
    attributes: { index: "index-v1", document: "docs-v1" },
  };
  const providerStart = Math.round(latency * 0.1);
  const providerDuration = Math.round(latency * 0.72);
  const provider = {
    name: "provider_call",
    startOffsetMs: providerStart,
    durationMs: providerDuration,
    attributes: { provider: "fixture", model: "fixture-handbook-v1", attempts: calls, status },
  };
  const guardStart = providerStart + providerDuration;
  const guard = {
    name: "guard",
    startOffsetMs: guardStart,
    durationMs: Math.max(2, Math.round(latency * 0.08)),
    attributes: { status },
  };
  const respondStart = guardStart + guard.durationMs;
  const respond = {
    name: "respond",
    startOffsetMs: respondStart,
    durationMs: Math.max(1, latency - respondStart),
    attributes: { status },
  };
  return [admission, retrieve, provider, guard, respond];
}

export type HistoricalResult = {
  loaded: boolean;
  requests: number;
  modelCalls: number;
  costThb: number;
  p95Ms: number | null;
  feedback: number;
};

export async function historicalDatasetExists(db: DbLike, namespace: string): Promise<boolean> {
  const [row] = await db
    .select({ id: requests.id })
    .from(requests)
    .where(and(eq(requests.namespace, namespace), eq(requests.dataset, HISTORICAL_DATASET)))
    .limit(1);
  return Boolean(row);
}

export async function clearHistoricalDataset(db: DbLike, namespace: string): Promise<void> {
  await db
    .delete(requests)
    .where(and(eq(requests.namespace, namespace), eq(requests.dataset, HISTORICAL_DATASET)));
  await db
    .delete(feedback)
    .where(and(eq(feedback.namespace, namespace), eq(feedback.dataset, HISTORICAL_DATASET)));
}

/**
 * Loads the fixed dataset. Idempotent: an existing dataset is left untouched
 * so the recorded values cannot drift between takes.
 */
export async function loadHistoricalDataset(
  db: DbLike,
  namespace: string,
  options: { force?: boolean } = {},
): Promise<HistoricalResult> {
  if (options.force) await clearHistoricalDataset(db, namespace);

  const existing = await db
    .select({ id: requests.id })
    .from(requests)
    .where(and(eq(requests.namespace, namespace), eq(requests.dataset, HISTORICAL_DATASET)));

  if (existing.length > 0) {
    return {
      loaded: false,
      requests: existing.length,
      modelCalls: rows.reduce((sum, row) => sum + row.model_calls, 0),
      costThb: Number(dashboardContract.estimated_cost_thb),
      p95Ms: dashboardContract.p95_ms,
      feedback: feedbackRows.length,
    };
  }

  const cost = teachingCostPerCallThb();
  const idByRequestId = new Map<string, string>();
  const requestValues: Array<typeof requests.$inferInsert> = [];
  const callValues: Array<typeof modelCalls.$inferInsert> = [];
  const spanValues: Array<typeof traceSpans.$inferInsert> = [];

  rows.forEach((row, index) => {
    const rowId = randomUUID();
    idByRequestId.set(row.id, rowId);

    const createdAt = new Date(row.created_at);
    const completedAt = new Date(createdAt.getTime() + row.latency_ms);
    const documentVersion = row.document_version;

    let question = row.question ?? "";
    let answer = row.answer ?? "";
    let citations: Citation[] = [];

    if (row.status === "ok") {
      const chosen = row.question
        ? { question: row.question, section: row.citation_section ?? "2.1" }
        : OK_QUESTIONS[index % OK_QUESTIONS.length];
      question = question || chosen.question;
      const citation = citationFor(documentVersion, chosen.section);
      citations = citation ? [citation] : [];
      answer =
        answer ||
        (citation
          ? `จากคู่มือ ${documentVersion} ข้อ ${citation.sectionId}: ${citation.excerpt}`
          : "ตอบจากคู่มือฉบับที่ใช้งานอยู่");
    } else if (row.status === "insufficient_info") {
      question = question || INSUFFICIENT_QUESTIONS[index % INSUFFICIENT_QUESTIONS.length];
      answer =
        answer ||
        "คู่มือฉบับที่ใช้งานอยู่ไม่มีข้อความที่ตรงกับคำถามนี้ จึงยังตอบไม่ได้และไม่ควรเดาคำตอบ";
    } else {
      question = question || "ศูนย์เปิดกี่โมง";
      answer = answer || "ระบบติดต่อผู้ให้บริการ AI ไม่ได้ในขณะนี้ จึงยังไม่มีคำตอบจาก AI";
    }

    requestValues.push({
      id: rowId,
      namespace,
      requestId: row.id,
      userId: null,
      actorRef: row.user_id,
      dataset: HISTORICAL_DATASET,
      question,
      questionId: row.question_id ?? null,
      idempotencyKey: null,
      status: row.status,
      answer,
      citations,
      retrieved: citations.map((citation) => ({
        sectionId: citation.sectionId,
        title: citation.sectionTitle,
        score: 0.8,
        matchedTerms: [],
      })),
      mode: "fixture",
      environment: "local",
      appVersion: row.app_version,
      promptVersion: row.prompt_version,
      configVersion: "cfg-1",
      documentVersion,
      indexVersion: row.index_version,
      modelId: "fixture-handbook-v1",
      pricingVersion: "pricing-teaching-v1",
      latencyMs: row.latency_ms,
      errorCode: row.status === "provider_unavailable" ? "transient" : null,
      explanation: null,
      nextAction: null,
      retryAt: null,
      admittedAt: createdAt,
      completedAt,
      createdAt,
    });

    for (let attempt = 1; attempt <= row.model_calls; attempt += 1) {
      callValues.push({
        namespace,
        requestId: rowId,
        provider: "fixture",
        modelId: "fixture-handbook-v1",
        attempt,
        status: row.status === "provider_unavailable" ? "error" : "ok",
        inputTokens: row.input_tokens_per_call,
        outputTokens: row.output_tokens_per_call,
        costThb: String(cost),
        latencyMs: Math.round((row.latency_ms * 0.72) / row.model_calls),
        usageUnknown: false,
        errorCode: row.status === "provider_unavailable" ? "transient" : null,
        createdAt,
      });
    }

    spansFor(row.latency_ms, row.model_calls, row.status).forEach((span, spanIndex) => {
      spanValues.push({
        namespace,
        requestId: rowId,
        seq: spanIndex + 1,
        name: span.name,
        startOffsetMs: span.startOffsetMs,
        durationMs: span.durationMs,
        attributes: { ...span.attributes, historical: true },
      });
    });
  });

  const feedbackValues: Array<typeof feedback.$inferInsert> = feedbackRows.map((row, index) => {
    const requestRowId = idByRequestId.get(row.request_id);
    if (!requestRowId) throw new Error(`Feedback ${row.id} points at unknown request ${row.request_id}`);
    return {
      id: row.id,
      namespace,
      requestId: requestRowId,
      userId: null,
      label: row.label,
      comment: null,
      dataset: HISTORICAL_DATASET,
      createdAt: new Date(new Date("2026-10-13T02:00:00+00:00").getTime() + index * 3_600_000),
    };
  });

  // The caller owns the transaction: a reset runs every step in one unit.
  for (const batch of chunk(requestValues, 80)) await db.insert(requests).values(batch);
  for (const batch of chunk(callValues, 120)) await db.insert(modelCalls).values(batch);
  for (const batch of chunk(spanValues, 200)) await db.insert(traceSpans).values(batch);
  await db.insert(feedback).values(feedbackValues);

  const verification = await verifyHistoricalDataset(db, namespace);
  return {
    loaded: true,
    requests: verification.requests,
    modelCalls: verification.modelCalls,
    costThb: verification.costThb,
    p95Ms: verification.p95Ms,
    feedback: verification.feedback,
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

export type HistoricalVerification = {
  requests: number;
  successes: number;
  errors: number;
  insufficientInfo: number;
  modelCalls: number;
  costThb: number;
  p95Ms: number | null;
  feedback: number;
  needsCorrection: number;
  users: number;
  matchesContract: boolean;
};

export async function verifyHistoricalDataset(
  db: DbLike,
  namespace: string,
): Promise<HistoricalVerification> {
  const all = await db
    .select({
      status: requests.status,
      actorRef: requests.actorRef,
      latencyMs: requests.latencyMs,
    })
    .from(requests)
    .where(and(eq(requests.namespace, namespace), eq(requests.dataset, HISTORICAL_DATASET)));

  const calls = await db
    .select({ costThb: modelCalls.costThb })
    .from(modelCalls)
    .innerJoin(requests, eq(requests.id, modelCalls.requestId))
    .where(and(eq(requests.namespace, namespace), eq(requests.dataset, HISTORICAL_DATASET)));

  const feedbackRowsDb = await db
    .select({ label: feedback.label })
    .from(feedback)
    .where(and(eq(feedback.namespace, namespace), eq(feedback.dataset, HISTORICAL_DATASET)));

  const latencies = all.map((row) => row.latencyMs ?? 0).sort((a, b) => a - b);
  const rank = Math.ceil(0.95 * latencies.length);
  const p95 = latencies.length > 0 ? latencies[rank - 1] : null;
  const costThb = Math.round(calls.reduce((sum, call) => sum + Number(call.costThb), 0) * 100) / 100;

  const result: HistoricalVerification = {
    requests: all.length,
    successes: all.filter((row) => row.status !== "provider_unavailable").length,
    errors: all.filter((row) => row.status === "provider_unavailable").length,
    insufficientInfo: all.filter((row) => row.status === "insufficient_info").length,
    modelCalls: calls.length,
    costThb,
    p95Ms: p95,
    feedback: feedbackRowsDb.length,
    needsCorrection: feedbackRowsDb.filter((row) => row.label === "needs_correction").length,
    users: new Set(all.map((row) => row.actorRef)).size,
    matchesContract: false,
  };

  result.matchesContract =
    result.requests === dashboardContract.requests &&
    result.successes === dashboardContract.success &&
    result.errors === dashboardContract.errors &&
    result.insufficientInfo === dashboardContract.insufficient_info &&
    result.modelCalls === dashboardContract.model_calls &&
    Math.abs(result.costThb - Number(dashboardContract.estimated_cost_thb)) < 0.005 &&
    result.p95Ms === dashboardContract.p95_ms &&
    result.feedback === dashboardContract.feedback &&
    result.needsCorrection === dashboardContract.needs_correction &&
    result.users === dashboardContract.users;

  return result;
}

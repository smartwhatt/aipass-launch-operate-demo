import { and, eq } from "drizzle-orm";
import { getConfig, environmentLabel } from "@/lib/config";
import { getDb, type Database } from "@/lib/db/client";
import { requests } from "@/lib/db/schema";
import type { DataMode, QuestionResponse, Versions } from "@/lib/domain/types";
import type { Viewer } from "@/lib/auth/session";
import { getActiveContext, type ActiveContext } from "@/lib/state/active";
import { runAnswer, type AnswerOutcome } from "@/lib/answers/answer-service";
import { STATUS_ACTIONS } from "@/lib/answers/guards";
import { admitRequest, type RequestRow } from "@/lib/controls/admission";
import { settleReservation } from "@/lib/controls/budget";
import { completeRequest } from "@/lib/telemetry/requests";
import { FixtureProvider } from "@/lib/providers/fixture";
import { GeminiProvider } from "@/lib/providers/gemini";
import { PROMPT_VERSION } from "@/lib/providers/prompt";
import {
  PRICING_VERSION,
  costThbForTokens,
  getLivePrice,
  livePricingStatus,
  maxRequestCostThb,
} from "@/lib/providers/pricing";
import { fixtureCallCostThb } from "@/lib/calculator/teaching-prices";
import { citationUrl, getCanonicalDocument } from "@/lib/retrieval/canonical";
import type { AnswerProvider, ProviderUsage } from "@/lib/providers/types";

/**
 * Question orchestration.
 *
 * authorize (route) -> admit -> retrieve -> provider -> guards -> settle.
 * The request row is written at admission, so a provider failure still has a
 * trace, still counts against quota, and still settles its reservation.
 */

export type AskResult =
  | { kind: "response"; response: QuestionResponse }
  | { kind: "in_progress"; requestId: string };

function versionsFrom(
  appVersion: string,
  configVersion: string,
  docKey: string | null,
  indexKey: string | null,
  modelId: string | null,
): Versions {
  return {
    app: appVersion,
    config: configVersion,
    handbook: docKey,
    index: indexKey,
    prompt: PROMPT_VERSION,
    pricing: PRICING_VERSION,
    model: modelId,
  };
}

function responseFromRow(row: RequestRow): QuestionResponse {
  return {
    request_id: row.requestId,
    status: row.status as QuestionResponse["status"],
    answer: row.answer ?? "",
    citations: row.citations ?? [],
    versions: {
      app: row.appVersion,
      config: row.configVersion,
      handbook: row.documentVersion,
      index: row.indexVersion,
      prompt: row.promptVersion,
      pricing: row.pricingVersion,
      model: row.modelId,
    },
    mode: row.mode as DataMode,
    retry_at: row.retryAt?.toISOString() ?? null,
    explanation: row.explanation ?? "",
    next_action: row.nextAction ?? "",
    request_url: `/admin/traces/${encodeURIComponent(row.requestId)}`,
  };
}

/** Fallback links always point at a handbook the operator marked as checked. */
function canonicalOutOfScope(docKey: string): string[] {
  try {
    return getCanonicalDocument(docKey).out_of_scope;
  } catch {
    return [];
  }
}

function fallbackUrlFor(active: ActiveContext, topic: string | null): string {
  const checkedDoc = active.latestDocKey ?? active.index?.docKey ?? "docs-v2";
  if (topic === "opening_hours") return citationUrl(checkedDoc, "2.1");
  return `/handbook/${checkedDoc}`;
}

export type ProviderSelection =
  | { ok: true; provider: AnswerProvider; costForCall: (usage: ProviderUsage) => number; reservationThb: number; modelId: string }
  | { ok: false; status: "provider_unavailable"; explanation: string; nextAction: string };

export function selectProvider(
  mode: DataMode,
  options: { failRequests: boolean; apiKey: string; modelId: string },
): ProviderSelection {
  if (mode === "fixture") {
    return {
      ok: true,
      provider: new FixtureProvider({ failRequests: options.failRequests }),
      costForCall: () => fixtureCallCostThb(),
      reservationThb: fixtureCallCostThb() * 2,
      modelId: "fixture-handbook-v1",
    };
  }

  const price = getLivePrice(options.modelId);
  const status = livePricingStatus(options.modelId);
  if (status !== "ready") {
    return {
      ok: false,
      status: "provider_unavailable",
      explanation:
        status === "unknown"
          ? `ยังไม่มีข้อมูลราคาของโมเดล ${options.modelId} ระบบจึงหยุดเรียก AI เพื่อไม่ให้แสดงค่าใช้จ่ายผิด`
          : `ราคาของโมเดล ${options.modelId} ยังไม่ได้ตรวจสอบ ระบบจึงหยุดเรียก AI ชั่วคราว`,
      nextAction:
        "ผู้ดูแลระบบต้องตรวจราคาจากหน้าผู้ให้บริการ บันทึกวันที่ตรวจ แล้วตั้ง LIVE_PRICING_CONFIRMED=true",
    };
  }
  if (!options.apiKey) {
    return {
      ok: false,
      status: "provider_unavailable",
      explanation: "โหมด live ต้องใช้ GEMINI_API_KEY ซึ่งยังไม่ได้ตั้งค่าในเซิร์ฟเวอร์",
      nextAction: "ผู้ดูแลระบบต้องตั้งค่า GEMINI_API_KEY ฝั่งเซิร์ฟเวอร์ แล้ว deploy ใหม่",
    };
  }

  return {
    ok: true,
    provider: new GeminiProvider({ apiKey: options.apiKey, modelId: options.modelId }),
    costForCall: (usage: ProviderUsage) =>
      usage.usageUnknown ? 0 : costThbForTokens(usage.inputTokens, usage.outputTokens, price!),
    reservationThb: maxRequestCostThb(price!),
    modelId: options.modelId,
  };
}

export type AskInput = {
  namespace: string;
  viewer: Viewer;
  question: string;
  idempotencyKey: string;
};

export async function askQuestion(input: AskInput): Promise<AskResult> {
  const config = getConfig();
  const db = getDb();
  const startedAt = Date.now();

  const active = await getActiveContext(db, input.namespace);

  if (!active.index) {
    return {
      kind: "response",
      response: {
        request_id: "",
        status: "provider_unavailable",
        answer: "ยังไม่มีดัชนีคู่มือที่เปิดใช้งาน ระบบจึงตอบคำถามไม่ได้",
        citations: [],
        versions: versionsFrom(config.APP_VERSION, active.configVersion, null, null, null),
        mode: config.AI_MODE,
        retry_at: null,
        explanation: "ฐานข้อมูลนี้ยังไม่มีดัชนีที่เปิดใช้ (active index)",
        next_action: "ผู้ดูแลระบบต้องรัน npm run demo:seed หรือเลือกดัชนีในหน้า /admin/demo",
      },
    };
  }

  const selection = selectProvider(config.AI_MODE, {
    failRequests: active.mode === "provider_failure",
    apiKey: config.GEMINI_API_KEY,
    modelId: config.GEMINI_MODEL,
  });
  if (!selection.ok) {
    return {
      kind: "response",
      response: {
        request_id: "",
        status: selection.status,
        answer: selection.explanation,
        citations: [],
        versions: versionsFrom(
          config.APP_VERSION,
          active.configVersion,
          active.index.docKey,
          active.index.indexKey,
          null,
        ),
        mode: config.AI_MODE,
        retry_at: null,
        explanation: selection.explanation,
        next_action: selection.nextAction,
      },
    };
  }

  const admission = await admitRequest(db, {
    namespace: input.namespace,
    userId: input.viewer.id,
    idempotencyKey: input.idempotencyKey,
    question: input.question,
    mode: config.AI_MODE,
    environment: config.APP_ENV,
    appVersion: config.APP_VERSION,
    promptVersion: PROMPT_VERSION,
    configVersion: active.configVersion,
    documentVersion: active.index.docKey,
    indexVersion: active.index.indexKey,
    modelId: selection.modelId,
    pricingVersion: PRICING_VERSION,
    reservationThb: selection.reservationThb,
  });

  if (admission.kind === "duplicate") {
    if (admission.row.status === "admitted") {
      const settled = await waitForCompletion(db, input.namespace, admission.row.requestId);
      if (settled) return { kind: "response", response: responseFromRow(settled) };
      return { kind: "in_progress", requestId: admission.row.requestId };
    }
    return { kind: "response", response: responseFromRow(admission.row) };
  }

  if (admission.kind === "blocked") {
    return {
      kind: "response",
      response: {
        request_id: "",
        status: admission.status,
        answer: admission.explanation,
        citations: [],
        versions: versionsFrom(
          config.APP_VERSION,
          active.configVersion,
          active.index.docKey,
          active.index.indexKey,
          selection.modelId,
        ),
        mode: config.AI_MODE,
        retry_at: admission.retryAt?.toISOString() ?? null,
        explanation: admission.explanation,
        next_action: admission.nextAction,
      },
    };
  }

  const row = admission.row;
  const answer: AnswerOutcome = await runAnswer({
    question: input.question,
    docKey: active.index.docKey,
    indexKey: active.index.indexKey,
    entries: active.index.entries,
    aliasMap: active.index.aliasMap,
    outOfScope: canonicalOutOfScope(active.index.docKey),
    provider: selection.provider,
    scenarioMode: active.mode,
    incident: active.incident,
    fallbackUrl: fallbackUrlFor(active, active.incident.topic),
    costForCall: selection.costForCall,
  });

  const latencyMs = Date.now() - startedAt;
  const actualCost = answer.calls.reduce((sum, call) => sum + call.costThb, 0);

  const admissionSpan = {
    name: "admission",
    startOffsetMs: 0,
    durationMs: 0,
    attributes: {
      reservation_thb: selection.reservationThb,
      quota_counted: true,
      mode: config.AI_MODE,
    },
  };

  await completeRequest(db, {
    requestRowId: row.id,
    namespace: input.namespace,
    status: answer.status,
    answer: answer.answer,
    citations: answer.citations,
    retrieved: answer.retrieved,
    explanation: answer.explanation,
    nextAction: answer.nextAction,
    latencyMs,
    errorCode: answer.calls.find((call) => call.errorCode)?.errorCode ?? null,
    retryAt: answer.retryAt,
    calls: answer.calls,
    spans: [
      admissionSpan,
      ...answer.spans,
      {
        name: "respond",
        startOffsetMs: latencyMs,
        durationMs: 0,
        attributes: { status: answer.status, citations: answer.citations.length },
      },
    ],
  });

  await settleReservation(db, {
    namespace: input.namespace,
    requestRowId: row.id,
    actualCostThb: actualCost,
  });

  return {
    kind: "response",
    response: {
      request_id: row.requestId,
      status: answer.status,
      answer: answer.answer,
      citations: answer.citations,
      versions: versionsFrom(
        config.APP_VERSION,
        active.configVersion,
        active.index.docKey,
        active.index.indexKey,
        answer.modelId,
      ),
      mode: config.AI_MODE,
      retry_at: answer.retryAt?.toISOString() ?? null,
      explanation: answer.explanation || STATUS_ACTIONS[answer.status].explanation,
      next_action: answer.nextAction || STATUS_ACTIONS[answer.status].nextAction,
      request_url: `/admin/traces/${encodeURIComponent(row.requestId)}`,
    },
  };
}

async function waitForCompletion(
  db: Database,
  namespace: string,
  requestId: string,
  attempts = 10,
): Promise<RequestRow | null> {
  for (let index = 0; index < attempts; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    const [row] = await db
      .select()
      .from(requests)
      .where(and(eq(requests.namespace, namespace), eq(requests.requestId, requestId)))
      .limit(1);
    if (row && row.status !== "admitted") return row;
  }
  return null;
}

export function currentEnvironmentLabel(): string {
  return environmentLabel();
}

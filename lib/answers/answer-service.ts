import type { AnswerStatus, Citation, IndexEntries, RetrievalHit, ScenarioMode } from "@/lib/domain/types";
import {
  applyEvidenceGuards,
  buildCitation,
  isFeeQuestion,
  statesNotStated,
  STATUS_ACTIONS,
} from "@/lib/answers/guards";
import type { AliasMap } from "@/lib/retrieval/lexicon";
import { retrieve } from "@/lib/retrieval/retrieve";
import { MAX_CALLS_PER_REQUEST } from "@/lib/providers/pricing";
import {
  ProviderFailure,
  type AnswerProvider,
  type ProviderUsage,
} from "@/lib/providers/types";

/**
 * The answer pipeline: retrieve, guard, call the provider, guard again.
 *
 * Every phase is timed and returned as a span so the trace viewer can show
 * where the time went. Provider calls are returned as individual records:
 * a request with a retry has two call records but is still one request.
 */

export type ProviderCallRecord = {
  provider: "fixture" | "gemini";
  modelId: string;
  attempt: number;
  status: "ok" | "error";
  inputTokens: number;
  outputTokens: number;
  usageUnknown: boolean;
  costThb: number;
  latencyMs: number;
  errorCode: string | null;
};

export type AnswerSpan = {
  name: string;
  startOffsetMs: number;
  durationMs: number;
  attributes: Record<string, unknown>;
};

export type AnswerOutcome = {
  status: AnswerStatus;
  answer: string;
  citations: Citation[];
  retrieved: RetrievalHit[];
  calls: ProviderCallRecord[];
  spans: AnswerSpan[];
  explanation: string;
  nextAction: string;
  fallbackUrl: string;
  retryAt: Date | null;
  modelId: string | null;
  guardNotes: string[];
  totalLatencyMs: number;
};

export type AnswerServiceInput = {
  question: string;
  docKey: string;
  indexKey: string;
  entries: IndexEntries;
  aliasMap: AliasMap;
  outOfScope: string[];
  provider: AnswerProvider;
  scenarioMode: ScenarioMode;
  incident: {
    enabled: boolean;
    topic: string | null;
    message: string | null;
    nextUpdateAt: Date | null;
  } | null;
  /** Checked handbook link used by fallback buttons. */
  fallbackUrl: string;
  costForCall: (usage: ProviderUsage) => number;
  retryBackoffMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

const OPENING_HOURS_CONCEPT = "opening_hours";

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runAnswer(input: AnswerServiceInput): Promise<AnswerOutcome> {
  const startedAt = performance.now();
  const spans: AnswerSpan[] = [];
  const calls: ProviderCallRecord[] = [];

  const record = (name: string, startMs: number, attributes: Record<string, unknown>) => {
    spans.push({
      name,
      startOffsetMs: Math.round(startMs - startedAt),
      durationMs: Math.max(0, Math.round(performance.now() - startMs)),
      attributes,
    });
  };

  const retrieveStart = performance.now();
  const retrieval = retrieve({
    entries: input.entries,
    aliasMap: input.aliasMap,
    question: input.question,
    outOfScope: input.outOfScope,
  });
  record("retrieve", retrieveStart, {
    index: input.indexKey,
    document: input.docKey,
    hits: retrieval.hits.map((hit) => hit.sectionId),
    best_score: retrieval.bestScore,
    threshold: retrieval.threshold,
    concepts: retrieval.matchedConcepts,
    out_of_scope_term: retrieval.outOfScopeTerm,
  });

  const sectionsById = new Map(input.entries.sections.map((section) => [section.sectionId, section]));
  const evidenceSections = retrieval.hits
    .map((hit) => sectionsById.get(hit.sectionId))
    .filter((section): section is NonNullable<typeof section> => Boolean(section));

  const base = {
    retrieved: retrieval.hits,
    calls,
    spans,
    fallbackUrl: input.fallbackUrl,
    modelId: null as string | null,
    guardNotes: [] as string[],
  };

  // Deliberate pause: an incident can stop automatic answers for one topic.
  const pauseTopic = input.incident?.enabled ? input.incident.topic : null;
  if (pauseTopic === OPENING_HOURS_CONCEPT && retrieval.matchedConcepts.includes(OPENING_HOURS_CONCEPT)) {
    const guardStart = performance.now();
    record("incident_pause", guardStart, {
      topic: pauseTopic,
      next_update: input.incident?.nextUpdateAt?.toISOString() ?? null,
    });
    return {
      ...base,
      status: "provider_unavailable",
      citations: [],
      answer:
        "หยุดตอบอัตโนมัติชั่วคราวสำหรับคำถามเรื่องวันและเวลาเปิดบริการ เพราะพบว่าคู่มือที่ใช้ตอบยังเป็นฉบับเก่า",
      explanation:
        input.incident?.message ??
        "ปิดการตอบอัตโนมัติเฉพาะเรื่องเวลาเปิด–ปิด จนกว่าจะเปิดใช้ดัชนีที่สร้างจากคู่มือฉบับใหม่",
      nextAction: "เปิดคู่มือฉบับที่ตรวจสอบแล้ว (docs-v2 ข้อ 2.1) หรือติดต่อศูนย์ ระบบจะกลับมาตอบอัตโนมัติเมื่อแก้ไขเสร็จ",
      fallbackUrl: input.fallbackUrl,
      retryAt: input.incident?.nextUpdateAt ?? null,
      totalLatencyMs: Math.round(performance.now() - startedAt),
    };
  }

  if (evidenceSections.length === 0) {
    const outOfScope = retrieval.outOfScopeTerm;
    const guardStart = performance.now();
    record("guard", guardStart, { reason: outOfScope ? "out_of_scope" : "no_evidence" });
    const answer = outOfScope
      ? `คู่มือศูนย์บริการตัวอย่างไม่ครอบคลุมเรื่อง “${outOfScope}” จึงไม่ตอบเรื่องนี้และไม่ควรเดาคำตอบ`
      : "คู่มือฉบับที่ใช้งานอยู่ไม่มีข้อความที่ตรงกับคำถามนี้ จึงยังตอบไม่ได้และไม่ควรเดาคำตอบ";
    return {
      ...base,
      status: "insufficient_info",
      answer,
      citations: [],
      explanation: outOfScope
        ? "คำถามอยู่นอกขอบเขตของคู่มือ จึงไม่มีการเรียกผู้ให้บริการ AI"
        : "ค้นคู่มือแล้วไม่พบข้อความที่เกี่ยวข้อง จึงไม่มีการเรียกผู้ให้บริการ AI",
      nextAction: outOfScope
        ? "ถามใหม่ในเรื่องที่คู่มือครอบคลุม หรือติดต่อศูนย์เพื่อสอบถามเรื่องอื่น"
        : "ลองถามใหม่ให้แคบลง เปิดคู่มือดูข้อที่เกี่ยวข้อง หรือติดต่อศูนย์",
      retryAt: null,
      totalLatencyMs: Math.round(performance.now() - startedAt),
    };
  }

  const backoff = input.retryBackoffMs ?? 400;
  const sleep = input.sleep ?? defaultSleep;
  let lastFailure: ProviderFailure | null = null;
  let providerAnswer: Awaited<ReturnType<AnswerProvider["complete"]>> | null = null;

  for (let attempt = 1; attempt <= MAX_CALLS_PER_REQUEST; attempt += 1) {
    const callStart = performance.now();
    const providerStart = performance.now();
    try {
      providerAnswer = await input.provider.complete({
        question: input.question,
        docKey: input.docKey,
        indexKey: input.indexKey,
        sections: evidenceSections.map((section) => ({
          sectionId: section.sectionId,
          title: section.title,
          text: section.text,
        })),
        mode: input.provider.name === "fixture" ? "fixture" : "live",
      });

      calls.push({
        provider: input.provider.name,
        modelId: input.provider.modelId,
        attempt,
        status: "ok",
        inputTokens: providerAnswer.usage.inputTokens,
        outputTokens: providerAnswer.usage.outputTokens,
        usageUnknown: providerAnswer.usage.usageUnknown,
        costThb: input.costForCall(providerAnswer.usage),
        latencyMs: Math.round(performance.now() - callStart),
        errorCode: null,
      });
      record("provider_call", providerStart, {
        provider: input.provider.name,
        model: input.provider.modelId,
        attempt,
        status: "ok",
        tokens_in: providerAnswer.usage.inputTokens,
        tokens_out: providerAnswer.usage.outputTokens,
      });
      break;
    } catch (error) {
      const failure =
        error instanceof ProviderFailure
          ? error
          : new ProviderFailure("unknown", error instanceof Error ? error.message : String(error));
      lastFailure = failure;

      calls.push({
        provider: input.provider.name,
        modelId: input.provider.modelId,
        attempt,
        status: "error",
        inputTokens: 0,
        outputTokens: 0,
        usageUnknown: false,
        costThb: 0,
        latencyMs: Math.round(performance.now() - callStart),
        errorCode: failure.code,
      });
      record("provider_call", providerStart, {
        provider: input.provider.name,
        model: input.provider.modelId,
        attempt,
        status: "error",
        error_code: failure.code,
        message: failure.message,
      });

      if (!failure.retryable || attempt === MAX_CALLS_PER_REQUEST) break;
      await sleep(backoff);
    }
  }

  if (!providerAnswer) {
    const reason =
      lastFailure?.code === "rate_limited"
        ? "ผู้ให้บริการ AI จำกัดอัตราการเรียกในขณะนี้"
        : "ระบบติดต่อผู้ให้บริการ AI ไม่ได้ในขณะนี้";
    return {
      ...base,
      status: "provider_unavailable",
      citations: [],
      answer: `${reason} จึงยังไม่มีคำตอบจาก AI`,
      explanation: `${reason} (${lastFailure?.code ?? "unknown"})`,
      nextAction:
        "เปิดคู่มือฉบับที่ตรวจสอบแล้วหรือติดต่อศูนย์ ระบบจะกลับมาให้บริการเมื่อผู้ให้บริการพร้อม ระบบลองใหม่ให้หนึ่งครั้งแล้ว",
      retryAt: null,
      totalLatencyMs: Math.round(performance.now() - startedAt),
    };
  }

  const guardStart = performance.now();
  const guarded = applyEvidenceGuards({
    question: input.question,
    sections: input.entries.sections,
    status: providerAnswer.status,
    answer: providerAnswer.answer,
    citedSections: providerAnswer.citedSections,
    docKey: input.docKey,
  });
  record("guard", guardStart, { notes: guarded.notes, status: guarded.status });

  const feeNotStated =
    isFeeQuestion(input.question) &&
    evidenceSections.some((section) => statesNotStated(section.text));

  const status: AnswerStatus = guarded.status;
  const actions = STATUS_ACTIONS[status];

  return {
    ...base,
    status,
    answer: guarded.answer,
    citations: guarded.citations,
    guardNotes: guarded.notes,
    modelId: input.provider.modelId,
    explanation:
      status === "insufficient_info"
        ? feeNotStated
          ? "คู่มือระบุว่าไม่ระบุค่าธรรมเนียม จึงตอบเป็นจำนวนเงินไม่ได้"
          : "คู่มือมีข้อความที่เกี่ยวข้อง แต่ไม่พอสำหรับตอบคำถามนี้"
        : actions.explanation,
    nextAction:
      status === "insufficient_info"
        ? "เปิดคู่มือข้อที่อ้างอิงหรือติดต่อศูนย์เพื่อยืนยัน"
        : actions.nextAction,
    retryAt: null,
    totalLatencyMs: Math.round(performance.now() - startedAt),
  };
}

/** Used by the evaluation harness to build a citation without running the pipeline. */
export function citationFor(docKey: string, entries: IndexEntries, sectionId: string): Citation | null {
  const section = entries.sections.find((entry) => entry.sectionId === sectionId);
  return section ? buildCitation(docKey, section) : null;
}

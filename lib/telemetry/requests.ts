import { and, asc, eq } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import { appUsers, feedback, modelCalls, requests, traceSpans } from "@/lib/db/schema";
import type { AnswerStatus, Citation, RetrievalHit } from "@/lib/domain/types";

/**
 * Request telemetry.
 *
 * One row per user request, plus one row per model call, plus spans. Retries
 * add model-call rows, never request rows, so the dashboard's request count
 * stays honest.
 */

export type CompletionInput = {
  requestRowId: string;
  namespace: string;
  status: AnswerStatus;
  answer: string;
  citations: Citation[];
  retrieved: RetrievalHit[];
  explanation: string;
  nextAction: string;
  latencyMs: number;
  errorCode: string | null;
  retryAt: Date | null;
  calls: Array<{
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
  }>;
  spans: Array<{
    name: string;
    startOffsetMs: number;
    durationMs: number;
    attributes: Record<string, unknown>;
  }>;
};

export async function completeRequest(db: Database, input: CompletionInput): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(requests)
      .set({
        status: input.status,
        answer: input.answer,
        citations: input.citations,
        retrieved: input.retrieved,
        explanation: input.explanation,
        nextAction: input.nextAction,
        latencyMs: input.latencyMs,
        errorCode: input.errorCode,
        retryAt: input.retryAt,
        completedAt: new Date(),
      })
      .where(eq(requests.id, input.requestRowId));

    if (input.calls.length > 0) {
      await tx.insert(modelCalls).values(
        input.calls.map((call) => ({
          namespace: input.namespace,
          requestId: input.requestRowId,
          provider: call.provider,
          modelId: call.modelId,
          attempt: call.attempt,
          status: call.status,
          inputTokens: call.inputTokens,
          outputTokens: call.outputTokens,
          costThb: String(call.costThb),
          latencyMs: call.latencyMs,
          usageUnknown: call.usageUnknown,
          errorCode: call.errorCode,
        })),
      );
    }

    if (input.spans.length > 0) {
      await tx.insert(traceSpans).values(
        input.spans.map((span, index) => ({
          namespace: input.namespace,
          requestId: input.requestRowId,
          seq: index + 1,
          name: span.name,
          startOffsetMs: span.startOffsetMs,
          durationMs: span.durationMs,
          attributes: span.attributes,
        })),
      );
    }
  });
}

export async function recordFeedback(
  db: Database,
  input: {
    namespace: string;
    requestRowId: string;
    userId: string | null;
    label: "helpful" | "needs_correction";
    comment: string | null;
    dataset?: string;
  },
): Promise<{ id: string }> {
  const id = `FB-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}`;
  await db.insert(feedback).values({
    id,
    namespace: input.namespace,
    requestId: input.requestRowId,
    userId: input.userId,
    label: input.label,
    comment: input.comment,
    dataset: input.dataset ?? "live",
  });
  return { id };
}

export async function getRequestByRequestId(
  db: Database,
  namespace: string,
  requestId: string,
) {
  const [row] = await db
    .select()
    .from(requests)
    .where(and(eq(requests.namespace, namespace), eq(requests.requestId, requestId)))
    .limit(1);
  return row ?? null;
}

export type TraceView = {
  request: typeof requests.$inferSelect;
  calls: Array<typeof modelCalls.$inferSelect>;
  spans: Array<typeof traceSpans.$inferSelect>;
  actorName: string | null;
};

export async function getTrace(
  db: Database,
  namespace: string,
  requestId: string,
): Promise<TraceView | null> {
  const request = await getRequestByRequestId(db, namespace, requestId);
  if (!request) return null;

  const [calls, spans, actor] = await Promise.all([
    db
      .select()
      .from(modelCalls)
      .where(eq(modelCalls.requestId, request.id))
      .orderBy(asc(modelCalls.attempt), asc(modelCalls.createdAt)),
    db
      .select()
      .from(traceSpans)
      .where(eq(traceSpans.requestId, request.id))
      .orderBy(asc(traceSpans.seq)),
    request.userId
      ? db
          .select({ displayName: appUsers.displayName })
          .from(appUsers)
          .where(eq(appUsers.id, request.userId))
          .limit(1)
      : Promise.resolve([]),
  ]);

  return { request, calls, spans, actorName: actor[0]?.displayName ?? null };
}

export async function listFeedback(
  db: Database,
  namespace: string,
  limit = 50,
): Promise<Array<typeof feedback.$inferSelect>> {
  return db
    .select()
    .from(feedback)
    .where(eq(feedback.namespace, namespace))
    .orderBy(asc(feedback.createdAt))
    .limit(limit);
}

import { and, eq, gt, sql } from "drizzle-orm";
import { getDb, type Database } from "@/lib/db/client";
import {
  budgetLedger,
  budgetReservations,
  quotaUsage,
  requestAdmissions,
  requests,
} from "@/lib/db/schema";
import type { AnswerStatus, DataMode } from "@/lib/domain/types";
import {
  DAILY_QUOTA,
  DEFAULT_BUDGET_LIMIT_THB,
  RATE_LIMIT_PER_WINDOW,
  RATE_WINDOW_SECONDS,
  bangkokDate,
  bangkokPeriod,
  nextQuotaResetAt,
  rateWindowRetryAt,
} from "@/lib/controls/limits";
import { budgetDecision, round4, usagePercent } from "@/lib/controls/budget-math";

/**
 * Admission control.
 *
 * Rate, daily quota, and budget are enforced in ONE PostgreSQL transaction
 * under a per-user advisory lock, so parallel requests across server
 * instances cannot both take the last slot. Process memory is never the
 * source of truth.
 *
 * Counted against quota: valid, authorized questions admitted to processing,
 * including calls that later fail at the provider.
 * Not counted: validation failures, duplicate idempotency keys, and requests
 * blocked before admission.
 */

export type RequestRow = typeof requests.$inferSelect;

export type AdmissionInput = {
  namespace: string;
  userId: string;
  idempotencyKey: string;
  question: string;
  mode: DataMode;
  environment: string;
  appVersion: string;
  promptVersion: string;
  configVersion: string;
  documentVersion: string | null;
  indexVersion: string | null;
  modelId: string | null;
  pricingVersion: string | null;
  reservationThb: number;
  dataset?: string;
};

export type BlockedAdmission = {
  kind: "blocked";
  status: Extract<
    AnswerStatus,
    "rate_limited" | "quota_exceeded" | "budget_exceeded"
  >;
  explanation: string;
  nextAction: string;
  retryAt: Date | null;
  remaining: { quotaLeft: number; budgetLeftThb: number };
};

export type AdmissionResult =
  | { kind: "admitted"; row: RequestRow }
  | { kind: "duplicate"; row: RequestRow }
  | BlockedAdmission;

export function buildRequestId(now: Date = new Date()): string {
  const day = bangkokDate(now).replace(/-/g, "");
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `REQ-${day}-${random}`;
}

async function ensureLedger(tx: Database, namespace: string, period: string) {
  await tx
    .insert(budgetLedger)
    .values({
      namespace,
      period,
      limitThb: String(DEFAULT_BUDGET_LIMIT_THB),
      committedThb: "0",
      reservedThb: "0",
    })
    .onConflictDoNothing();
}

export async function admitRequest(
  db: Database,
  input: AdmissionInput,
): Promise<AdmissionResult> {
  const today = bangkokDate();
  const period = bangkokPeriod();

  return db.transaction(async (tx) => {
    // One writer per user at a time, across every server instance.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`${input.namespace}:${input.userId}`}))`,
    );

    const existing = await tx
      .select()
      .from(requests)
      .where(
        and(
          eq(requests.namespace, input.namespace),
          eq(requests.userId, input.userId),
          eq(requests.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    if (existing[0]) return { kind: "duplicate", row: existing[0] } as const;

    // Rolling 60 second window.
    const windowStart = new Date(Date.now() - RATE_WINDOW_SECONDS * 1000);
    const [window] = await tx
      .select({
        count: sql<number>`count(*)::int`,
        oldest: sql<Date | null>`min(${requestAdmissions.admittedAt})`,
      })
      .from(requestAdmissions)
      .where(
        and(
          eq(requestAdmissions.namespace, input.namespace),
          eq(requestAdmissions.userId, input.userId),
          gt(requestAdmissions.admittedAt, windowStart),
        ),
      );

    await ensureLedger(tx, input.namespace, period);
    const [ledgerRow] = await tx
      .select()
      .from(budgetLedger)
      .where(and(eq(budgetLedger.namespace, input.namespace), eq(budgetLedger.period, period)))
      .for("update");

    const [quotaRow] = await (async () => {
      await tx
        .insert(quotaUsage)
        .values({ namespace: input.namespace, userId: input.userId, usageDate: today, used: 0 })
        .onConflictDoNothing();
      return tx
        .select()
        .from(quotaUsage)
        .where(
          and(
            eq(quotaUsage.namespace, input.namespace),
            eq(quotaUsage.userId, input.userId),
            eq(quotaUsage.usageDate, today),
          ),
        )
        .for("update");
    })();

    const quotaLeft = Math.max(0, DAILY_QUOTA - (quotaRow?.used ?? 0));
    const snapshot = {
      limitThb: Number(ledgerRow?.limitThb ?? DEFAULT_BUDGET_LIMIT_THB),
      committedThb: Number(ledgerRow?.committedThb ?? 0),
      reservedThb: Number(ledgerRow?.reservedThb ?? 0),
    };
    const decision = budgetDecision(snapshot, input.reservationThb);

    const blocked = (
      status: BlockedAdmission["status"],
      explanation: string,
      nextAction: string,
      retryAt: Date | null,
    ): BlockedAdmission => ({
      kind: "blocked",
      status,
      explanation,
      nextAction,
      retryAt,
      remaining: { quotaLeft, budgetLeftThb: decision.remainingThb },
    });

    if ((window?.count ?? 0) >= RATE_LIMIT_PER_WINDOW) {
      const oldest = window?.oldest ? new Date(window.oldest) : new Date();
      return blocked(
        "rate_limited",
        `ระบบรับได้ ${RATE_LIMIT_PER_WINDOW} คำถามใน ${RATE_WINDOW_SECONDS} วินาทีต่อบัญชี`,
        "รอตามเวลาที่แสดงแล้วส่งคำถามอีกครั้ง",
        rateWindowRetryAt(oldest),
      );
    }

    if (quotaLeft <= 0) {
      const retryAt = nextQuotaResetAt();
      return blocked(
        "quota_exceeded",
        `บัญชีนี้ใช้คำถามครบ ${DAILY_QUOTA} ครั้งสำหรับวันนี้แล้ว`,
        "รอถึงเวลาเริ่มใหม่ตามเวลาที่แสดง หรือติดต่อศูนย์",
        retryAt,
      );
    }

    if (!decision.allowed) {
      return blocked(
        "budget_exceeded",
        `งบประมาณการสอนเดือนนี้เหลือ ${decision.remainingThb.toFixed(2)} บาท ไม่พอสำหรับการเรียก AI ครั้งใหม่`,
        "เปิดคู่มือที่ตรวจสอบแล้วหรือติดต่อศูนย์ ระหว่างนี้ผู้ดูแลระบบต้องตรวจงบประมาณ",
        null,
      );
    }

    const requestId = buildRequestId();
    const [row] = await tx
      .insert(requests)
      .values({
        namespace: input.namespace,
        requestId,
        userId: input.userId,
        actorRef: input.userId,
        dataset: input.dataset ?? "live",
        question: input.question,
        idempotencyKey: input.idempotencyKey,
        status: "admitted",
        mode: input.mode,
        environment: input.environment,
        appVersion: input.appVersion,
        promptVersion: input.promptVersion,
        configVersion: input.configVersion,
        documentVersion: input.documentVersion,
        indexVersion: input.indexVersion,
        modelId: input.modelId,
        pricingVersion: input.pricingVersion,
        admittedAt: new Date(),
        createdAt: new Date(),
      })
      .returning();

    await tx.insert(requestAdmissions).values({
      namespace: input.namespace,
      userId: input.userId,
      requestId: row.id,
      admittedAt: new Date(),
    });

    await tx
      .update(quotaUsage)
      .set({ used: (quotaRow?.used ?? 0) + 1, updatedAt: new Date() })
      .where(
        and(
          eq(quotaUsage.namespace, input.namespace),
          eq(quotaUsage.userId, input.userId),
          eq(quotaUsage.usageDate, today),
        ),
      );

    if (input.reservationThb > 0) {
      await tx.insert(budgetReservations).values({
        namespace: input.namespace,
        period,
        requestId: row.id,
        amountThb: String(round4(input.reservationThb)),
      });
      await tx
        .update(budgetLedger)
        .set({
          reservedThb: String(round4(snapshot.reservedThb + input.reservationThb)),
          updatedAt: new Date(),
        })
        .where(and(eq(budgetLedger.namespace, input.namespace), eq(budgetLedger.period, period)));
    }

    return { kind: "admitted", row } as const;
  });
}

export async function getQuotaStatus(namespace: string, userId: string, db: Database = getDb()) {
  const [row] = await db
    .select()
    .from(quotaUsage)
    .where(
      and(
        eq(quotaUsage.namespace, namespace),
        eq(quotaUsage.userId, userId),
        eq(quotaUsage.usageDate, bangkokDate()),
      ),
    );
  return {
    used: row?.used ?? 0,
    limit: DAILY_QUOTA,
    remaining: Math.max(0, DAILY_QUOTA - (row?.used ?? 0)),
    resetAt: nextQuotaResetAt(),
  };
}

export async function getRateStatus(namespace: string, userId: string, db: Database = getDb()) {
  const windowStart = new Date(Date.now() - RATE_WINDOW_SECONDS * 1000);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(requestAdmissions)
    .where(
      and(
        eq(requestAdmissions.namespace, namespace),
        eq(requestAdmissions.userId, userId),
        gt(requestAdmissions.admittedAt, windowStart),
      ),
    );
  return { used: row?.count ?? 0, limit: RATE_LIMIT_PER_WINDOW, windowSeconds: RATE_WINDOW_SECONDS };
}

export async function getBudgetSnapshot(namespace: string, db: Database = getDb()) {
  const period = bangkokPeriod();
  const [row] = await db
    .select()
    .from(budgetLedger)
    .where(and(eq(budgetLedger.namespace, namespace), eq(budgetLedger.period, period)));
  const snapshot = {
    limitThb: Number(row?.limitThb ?? DEFAULT_BUDGET_LIMIT_THB),
    committedThb: Number(row?.committedThb ?? 0),
    reservedThb: Number(row?.reservedThb ?? 0),
  };
  return {
    period,
    ...snapshot,
    percent: usagePercent(snapshot),
    alertAt: row?.alerted80At ?? null,
    remainingThb: round4(snapshot.limitThb - snapshot.committedThb - snapshot.reservedThb),
  };
}

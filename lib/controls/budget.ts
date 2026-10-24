import { and, eq } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import { budgetEvents, budgetLedger, budgetReservations } from "@/lib/db/schema";
import { alertThresholdThb, round4 } from "@/lib/controls/budget-math";
import { bangkokPeriod } from "@/lib/controls/limits";

/**
 * Budget settlement.
 *
 * A reservation is taken before the first provider call. After the request
 * finishes, actual usage is charged against the ledger and the unused part of
 * the reservation is released. Crossing 80% of the limit emits ONE admin
 * event per period; no email is sent by the app.
 */

export async function settleReservation(
  db: Database,
  input: { namespace: string; requestRowId: string; actualCostThb: number },
): Promise<{ settledThb: number; alertEmitted: boolean }> {
  const actual = round4(Math.max(0, input.actualCostThb));

  return db.transaction(async (tx) => {
    const [reservation] = await tx
      .select()
      .from(budgetReservations)
      .where(eq(budgetReservations.requestId, input.requestRowId))
      .limit(1);

    if (!reservation || reservation.status !== "reserved") {
      return { settledThb: actual, alertEmitted: false };
    }

    const period = reservation.period || bangkokPeriod();
    const [ledger] = await tx
      .select()
      .from(budgetLedger)
      .where(and(eq(budgetLedger.namespace, input.namespace), eq(budgetLedger.period, period)))
      .for("update");

    const amount = Number(reservation.amountThb);
    const committedBefore = Number(ledger?.committedThb ?? 0);
    const reservedBefore = Number(ledger?.reservedThb ?? 0);
    const committedAfter = round4(committedBefore + actual);
    const reservedAfter = round4(Math.max(0, reservedBefore - amount));
    const limit = Number(ledger?.limitThb ?? 0);

    await tx
      .update(budgetLedger)
      .set({
        committedThb: String(committedAfter),
        reservedThb: String(reservedAfter),
        updatedAt: new Date(),
      })
      .where(and(eq(budgetLedger.namespace, input.namespace), eq(budgetLedger.period, period)));

    await tx
      .update(budgetReservations)
      .set({
        status: actual > 0 ? "settled" : "released",
        settledThb: String(actual),
        settledAt: new Date(),
      })
      .where(eq(budgetReservations.id, reservation.id));

    const alreadyAlerted = Boolean(ledger?.alerted80At);
    const crossed = !alreadyAlerted && limit > 0 && committedAfter >= alertThresholdThb(limit);
    if (crossed) {
      await tx
        .update(budgetLedger)
        .set({ alerted80At: new Date() })
        .where(and(eq(budgetLedger.namespace, input.namespace), eq(budgetLedger.period, period)));
      await tx.insert(budgetEvents).values({
        namespace: input.namespace,
        period,
        kind: "budget_80_percent",
        amountThb: String(committedAfter),
        message: `ใช้จ่ายสะสม ${committedAfter.toFixed(2)} บาท จากเพดาน ${limit.toFixed(2)} บาท (ถึง 80%)`,
      });
    }

    return { settledThb: actual, alertEmitted: crossed };
  });
}

/** Releases a reservation without charging it (validation or a blocked path). */
export async function releaseReservation(
  db: Database,
  input: { namespace: string; requestRowId: string },
): Promise<void> {
  const [reservation] = await db
    .select()
    .from(budgetReservations)
    .where(eq(budgetReservations.requestId, input.requestRowId))
    .limit(1);
  if (!reservation || reservation.status !== "reserved") return;

  await db.transaction(async (tx) => {
    const [ledger] = await tx
      .select()
      .from(budgetLedger)
      .where(
        and(
          eq(budgetLedger.namespace, input.namespace),
          eq(budgetLedger.period, reservation.period),
        ),
      )
      .for("update");

    await tx
      .update(budgetLedger)
      .set({
        reservedThb: String(Math.max(0, round4(Number(ledger?.reservedThb ?? 0) - Number(reservation.amountThb)))),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(budgetLedger.namespace, input.namespace),
          eq(budgetLedger.period, reservation.period),
        ),
      );

    await tx
      .update(budgetReservations)
      .set({ status: "released", settledThb: "0", settledAt: new Date() })
      .where(eq(budgetReservations.id, reservation.id));
  });
}

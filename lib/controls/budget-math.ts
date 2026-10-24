/**
 * Budget arithmetic, kept pure so tests can pin the rules.
 *
 * A call reserves its maximum cost before it starts, so two parallel requests
 * cannot both spend the last of the budget. The reservation is settled against
 * actual usage and the unused part is released. This bounds the app's new
 * calls; it does not promise an exact ceiling on the provider invoice.
 */

export type BudgetSnapshot = {
  limitThb: number;
  committedThb: number;
  reservedThb: number;
};

export type BudgetDecision = {
  allowed: boolean;
  remainingThb: number;
  committedAfterThb: number;
  reservedAfterThb: number;
  exceedsByThb: number;
};

export function committedAndReserved(snapshot: BudgetSnapshot): number {
  return round4(snapshot.committedThb + snapshot.reservedThb);
}

export function budgetDecision(snapshot: BudgetSnapshot, reservationThb: number): BudgetDecision {
  const remaining = round4(snapshot.limitThb - committedAndReserved(snapshot));
  const exceedsBy = round4(Math.max(0, reservationThb - remaining));
  return {
    allowed: exceedsBy <= 0.00005,
    remainingThb: remaining,
    committedAfterThb: snapshot.committedThb,
    reservedAfterThb: round4(snapshot.reservedThb + reservationThb),
    exceedsByThb: exceedsBy,
  };
}

export function alertThresholdThb(limitThb: number): number {
  return round4(limitThb * 0.8);
}

export function shouldAlert(snapshot: BudgetSnapshot, alreadyAlerted: boolean): boolean {
  if (alreadyAlerted) return false;
  return snapshot.committedThb >= alertThresholdThb(snapshot.limitThb);
}

export function usagePercent(snapshot: BudgetSnapshot): number {
  if (snapshot.limitThb <= 0) return 0;
  return Math.round((committedAndReserved(snapshot) / snapshot.limitThb) * 1000) / 10;
}

export function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

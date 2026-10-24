import costCases from "@/fixtures/cost-cases.json";

/**
 * Fictional teaching prices.
 *
 * These numbers come from fixtures/cost-cases.json and belong to the course
 * calculator and to fixture-mode demonstration data only. They are never used
 * as a live model price: lib/providers/pricing.ts holds real provider prices.
 */

export const TEACHING_PRICES = costCases.shared;
export const TEACHING_CURRENCY = costCases.currency;
export const TEACHING_CASES = costCases.cases;
export const PRICES_ARE_FICTIONAL = costCases.fictional_prices;

export function roundThb4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/** One fictional model call at the default teaching token counts. THB 0.14. */
export function teachingCostPerCallThb(): number {
  const shared = costCases.shared;
  const usd =
    (shared.input_tokens * shared.input_usd_per_million) / 1_000_000 +
    (shared.output_tokens * shared.output_usd_per_million) / 1_000_000;
  return roundThb4(usd * shared.thb_per_usd);
}

/** Cost of one fixture-mode call. Retries are counted as separate calls. */
export function fixtureCallCostThb(): number {
  return teachingCostPerCallThb();
}

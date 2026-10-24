/**
 * Live model pricing and token caps.
 *
 * IMPORTANT: these are real provider prices for the live adapter, not the
 * fictional teaching prices used by the course calculator. The teaching
 * prices live in fixtures/cost-cases.json and are never attached to a model.
 *
 * `verified` is false until an operator checks the provider price page and
 * sets LIVE_PRICING_CONFIRMED=true. While a model's price is unknown, new
 * live calls stop and the admin screens show that state (spec section 8).
 */

export const PRICING_VERSION = "pricing-2026-10-24";

export type ModelPrice = {
  /** USD per one million input tokens. */
  inputUsdPerMillion: number;
  /** USD per one million output tokens. */
  outputUsdPerMillion: number;
  source: string;
  checkedDate: string | null;
  verified: boolean;
};

export const LIVE_MODEL_PRICES: Record<string, ModelPrice> = {
  "gemini-3.5-flash-lite": {
    inputUsdPerMillion: 0.1,
    outputUsdPerMillion: 0.4,
    source: "https://ai.google.dev/gemini-api/docs/pricing",
    checkedDate: null,
    verified: false,
  },
};

/** Hard caps so a budget reservation always has a defined upper bound. */
export const MAX_INPUT_TOKENS = 12_000;
export const MAX_OUTPUT_TOKENS = 1_024;
/** One initial call plus at most one retry. */
export const MAX_CALLS_PER_REQUEST = 2;

export const THB_PER_USD_FALLBACK = 35;

export function getLivePrice(modelId: string): ModelPrice | null {
  return LIVE_MODEL_PRICES[modelId] ?? null;
}

/** A live model is usable only when its price is known and confirmed. */
export function livePricingStatus(modelId: string): "ready" | "unverified" | "unknown" {
  const price = getLivePrice(modelId);
  if (!price) return "unknown";
  return price.verified ? "ready" : "unverified";
}

export function costThbForTokens(
  inputTokens: number,
  outputTokens: number,
  price: ModelPrice,
  thbPerUsd: number = THB_PER_USD_FALLBACK,
): number {
  const usd =
    (inputTokens * price.inputUsdPerMillion) / 1_000_000 +
    (outputTokens * price.outputUsdPerMillion) / 1_000_000;
  return roundThb(usd * thbPerUsd);
}

/** Worst case for one call, used to reserve budget before calling. */
export function maxCallCostThb(price: ModelPrice, thbPerUsd: number = THB_PER_USD_FALLBACK): number {
  return costThbForTokens(MAX_INPUT_TOKENS, MAX_OUTPUT_TOKENS, price, thbPerUsd);
}

/** Worst case for one request including the single allowed retry. */
export function maxRequestCostThb(
  price: ModelPrice,
  thbPerUsd: number = THB_PER_USD_FALLBACK,
): number {
  return roundThb(maxCallCostThb(price, thbPerUsd) * MAX_CALLS_PER_REQUEST);
}

export function roundThb(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

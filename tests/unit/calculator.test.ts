import { describe, expect, it } from "vitest";
import costCases from "@/fixtures/cost-cases.json";
import dashboard from "@/fixtures/dashboard-contract.json";
import pilotRequests from "@/fixtures/pilot-requests.json";
import {
  CALCULATOR_DEFAULTS,
  calculateCost,
  validateCalculatorInputs,
  type CalculatorInputs,
} from "@/lib/calculator/model";
import { teachingCostPerCallThb, fixtureCallCostThb } from "@/lib/calculator/teaching-prices";
import {
  budgetDecision,
  shouldAlert,
  alertThresholdThb,
  usagePercent,
} from "@/lib/controls/budget-math";
import {
  DAILY_QUOTA,
  RATE_LIMIT_PER_WINDOW,
  bangkokDate,
  bangkokPeriod,
  nextQuotaResetAt,
  rateWindowRetryAt,
} from "@/lib/controls/limits";
import { nearestRank } from "@/lib/telemetry/metrics";
import {
  costThbForTokens,
  getLivePrice,
  maxRequestCostThb,
  MAX_CALLS_PER_REQUEST,
} from "@/lib/providers/pricing";

const shared = costCases.shared;

function inputsFor(users: number, callsPerQuestion: number): CalculatorInputs {
  return {
    ...CALCULATOR_DEFAULTS,
    users,
    questionsPerDay: shared.questions_per_user_day,
    activeDays: shared.days_per_month,
    callsPerQuestion,
    inputTokens: shared.input_tokens,
    outputTokens: shared.output_tokens,
    inputUsdPerMillion: shared.input_usd_per_million,
    outputUsdPerMillion: shared.output_usd_per_million,
    thbPerUsd: shared.thb_per_usd,
    hostingThbMonth: shared.hosting_thb_month,
    domainThbYear: shared.domain_thb_year,
    otherVariableThbQuestion: shared.other_variable_thb_question,
    otherFixedThbMonth: shared.other_fixed_thb_month,
    contingency: shared.contingency_fraction,
  };
}

describe("calculator formulas match fixtures/cost-cases.json", () => {
  it.each(costCases.cases)("$id", (testCase) => {
    const result = calculateCost(inputsFor(testCase.users, testCase.calls_per_question));
    expect(result.questionsPerMonth).toBe(testCase.questions);
    expect(result.modelCalls).toBe(testCase.model_calls);
    expect(result.costPerCallThb).toBeCloseTo(0.14, 4);
    expect(result.modelCostThb).toBe(testCase.model_cost_thb);
    expect(result.fixedCostThb).toBe(testCase.fixed_cost_thb);
    expect(result.totalThb).toBe(testCase.total_thb);
  });

  it("keeps the per-question figure meaningless at zero questions", () => {
    const result = calculateCost(inputsFor(0, 1));
    expect(result.totalThb).toBe(350);
    expect(result.perQuestionThb).toBe(0);
    expect(result.perQuestionMeaningful).toBe(false);
    expect(Number.isFinite(result.perQuestionThb)).toBe(true);
  });

  it("doubles only the USD-derived component when the exchange rate doubles", () => {
    const base = calculateCost(inputsFor(100, 1));
    const doubled = calculateCost({ ...inputsFor(100, 1), thbPerUsd: shared.thb_per_usd * 2 });
    expect(doubled.modelCostThb).toBeCloseTo(base.modelCostThb * 2, 4);
    expect(doubled.fixedCostThb).toBe(base.fixedCostThb);
    expect(doubled.totalThb).toBeCloseTo(base.modelCostThb * 2 + base.fixedCostThb, 2);
    expect(doubled.totalThb).toBe(3430);
  });
});

describe("calculator input validation", () => {
  it("accepts the defaults", () => {
    expect(validateCalculatorInputs(CALCULATOR_DEFAULTS)).toEqual([]);
  });

  it("rejects negative and out-of-range values", () => {
    const bad: Array<Partial<CalculatorInputs>> = [
      { users: -1 },
      { activeDays: 32 },
      { activeDays: 2.5 },
      { thbPerUsd: 0 },
      { contingency: 1.5 },
      { inputTokens: -1 },
      { callsPerQuestion: -0.1 },
    ];
    for (const patch of bad) {
      const issues = validateCalculatorInputs({ ...CALCULATOR_DEFAULTS, ...patch });
      expect(issues.length, JSON.stringify(patch)).toBeGreaterThan(0);
    }
  });
});

describe("teaching prices stay separate from live model prices", () => {
  it("computes the fictional per-call price from the fixture", () => {
    expect(teachingCostPerCallThb()).toBeCloseTo(0.14, 4);
    expect(fixtureCallCostThb()).toBeCloseTo(0.14, 4);
  });

  it("uses real provider prices for the live adapter, never the teaching price", () => {
    const price = getLivePrice("gemini-3.5-flash-lite");
    expect(price).not.toBeNull();
    const live = costThbForTokens(1500, 500, price!);
    expect(live).not.toBeCloseTo(0.14, 6);
    expect(maxRequestCostThb(price!)).toBeGreaterThan(live);
  });

  it("bounds a request by the maximum of two calls", () => {
    expect(MAX_CALLS_PER_REQUEST).toBe(2);
  });
});

describe("nearest-rank percentile", () => {
  const latencies = (pilotRequests as Array<{ latency_ms: number }>)
    .map((row) => row.latency_ms)
    .sort((a, b) => a - b);

  it("reads the 190th value for 200 requests", () => {
    expect(latencies).toHaveLength(200);
    expect(nearestRank(latencies, 0.95)).toBe(9000);
    expect(nearestRank(latencies, 0.95)).toBe(dashboard.p95_ms);
  });

  it("uses rank ceil(p*n) and never interpolates", () => {
    const values = Array.from({ length: 20 }, (_, index) => index + 1);
    expect(nearestRank(values, 0.95)).toBe(19);
    expect(nearestRank(values, 0.5)).toBe(10);
    expect(nearestRank([], 0.95)).toBeNull();
    expect(nearestRank([7], 0.95)).toBe(7);
  });
});

describe("budget arithmetic", () => {
  it("allows a reservation only when the remaining amount covers it", () => {
    const snapshot = { limitThb: 1000, committedThb: 999.8, reservedThb: 0 };
    expect(budgetDecision(snapshot, 0.2).allowed).toBe(true);
    expect(budgetDecision(snapshot, 0.28).allowed).toBe(false);
    expect(budgetDecision(snapshot, 0.28).exceedsByThb).toBeCloseTo(0.08, 4);
  });

  it("counts pending reservations in the decision", () => {
    const snapshot = { limitThb: 1000, committedThb: 800, reservedThb: 199.9 };
    expect(budgetDecision(snapshot, 0.2).allowed).toBe(false);
    expect(budgetDecision(snapshot, 0.1).allowed).toBe(true);
  });

  it("alerts once at 80%", () => {
    expect(alertThresholdThb(1000)).toBe(800);
    expect(shouldAlert({ limitThb: 1000, committedThb: 799, reservedThb: 0 }, false)).toBe(false);
    expect(shouldAlert({ limitThb: 1000, committedThb: 800, reservedThb: 0 }, false)).toBe(true);
    expect(shouldAlert({ limitThb: 1000, committedThb: 900, reservedThb: 0 }, true)).toBe(false);
    expect(usagePercent({ limitThb: 1000, committedThb: 800, reservedThb: 0 })).toBe(80);
  });
});

describe("Bangkok time boundaries", () => {
  it("formats the quota day and period in Asia/Bangkok", () => {
    const lateUtc = new Date("2026-10-24T17:30:00Z"); // 00:30 next day in Bangkok
    expect(bangkokDate(lateUtc)).toBe("2026-10-25");
    expect(bangkokPeriod(lateUtc)).toBe("2026-10");
    expect(bangkokDate(new Date("2026-10-24T16:59:00Z"))).toBe("2026-10-24");
  });

  it("resets the daily quota at the next Bangkok midnight", () => {
    expect(nextQuotaResetAt(new Date("2026-10-24T14:00:00Z")).toISOString()).toBe(
      "2026-10-24T17:00:00.000Z",
    );
    expect(nextQuotaResetAt(new Date("2026-10-24T17:00:00Z")).toISOString()).toBe(
      "2026-10-25T17:00:00.000Z",
    );
  });

  it("frees one rate slot 60 seconds after the oldest admission", () => {
    const oldest = new Date("2026-10-24T14:00:00Z");
    expect(rateWindowRetryAt(oldest).toISOString()).toBe("2026-10-24T14:01:00.000Z");
    expect(RATE_LIMIT_PER_WINDOW).toBe(5);
    expect(DAILY_QUOTA).toBe(20);
  });
});

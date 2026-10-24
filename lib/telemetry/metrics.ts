import { and, eq, gte, lt, sql } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import { feedback, modelCalls, requests } from "@/lib/db/schema";
import { round4 } from "@/lib/controls/budget-math";

/**
 * Dashboard metrics.
 *
 * Service behaviour and answer quality are reported separately, on purpose:
 * a wrong answer can still be a successful HTTP response.
 *
 * p95 uses the nearest-rank method: for 200 sorted latencies, read the 190th
 * value. This is not an interpolated percentile.
 */

export type MetricsFilter = {
  namespace: string;
  /** null means every environment in this namespace. */
  environment: string | null;
  dataset: string;
  mode: "all" | "fixture" | "live";
  from: string; // YYYY-MM-DD, Asia/Bangkok, inclusive
  to: string; // YYYY-MM-DD, Asia/Bangkok, inclusive
};

export type ServiceMetrics = {
  requests: number;
  success: number;
  errors: number;
  errorRate: number;
  insufficientInfo: number;
  insufficientInfoRate: number;
  modelCalls: number;
  avgLatencyMs: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
  p95Method: "nearest-rank";
  costFixtureThb: number;
  costLiveThb: number;
  unknownUsageCalls: number;
  users: number;
  periodFrom: string;
  periodTo: string;
};

export type QualityMetrics = {
  feedbackCount: number;
  helpful: number;
  needsCorrection: number;
  correctionRate: number;
  insufficientInfo: number;
  feedbackRate: number;
};

export type DashboardMetrics = {
  service: ServiceMetrics;
  quality: QualityMetrics;
  filter: MetricsFilter;
};

function dayStart(date: string): Date {
  return new Date(`${date}T00:00:00+07:00`);
}

function dayAfter(date: string): Date {
  const start = dayStart(date);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const maybe = result as { rows?: T[] };
  return maybe.rows ?? [];
}

export async function getDashboardMetrics(
  db: Database,
  filter: MetricsFilter,
): Promise<DashboardMetrics> {
  const from = dayStart(filter.from);
  const toExclusive = dayAfter(filter.to);

  const conditions = [
    eq(requests.namespace, filter.namespace),
    eq(requests.dataset, filter.dataset),
    gte(requests.createdAt, from),
    lt(requests.createdAt, toExclusive),
    sql`${requests.completedAt} is not null`,
  ];
  if (filter.environment) {
    conditions.push(eq(requests.environment, filter.environment));
  }
  if (filter.mode !== "all") {
    conditions.push(eq(requests.mode, filter.mode));
  }
  const where = and(...conditions);

  const [totals] = await db
    .select({
      total: sql<number>`count(*)::int`,
      success: sql<number>`count(*) filter (where ${requests.status} = 'ok')::int`,
      errors: sql<number>`count(*) filter (where ${requests.status} not in ('ok', 'insufficient_info'))::int`,
      insufficient: sql<number>`count(*) filter (where ${requests.status} = 'insufficient_info')::int`,
      avgLatency: sql<number | null>`round(avg(${requests.latencyMs}))::int`,
      users: sql<number>`count(distinct ${requests.actorRef})::int`,
    })
    .from(requests)
    .where(where);

  const percentileRows = rowsOf<{ p50: number | null; p95: number | null; p99: number | null }>(
    await db.execute(sql`
      select
        max(latency_ms) filter (where rn = ceil(0.5 * n))::int as p50,
        max(latency_ms) filter (where rn = ceil(0.95 * n))::int as p95,
        max(latency_ms) filter (where rn = ceil(0.99 * n))::int as p99
      from (
        select
          ${requests.latencyMs} as latency_ms,
          row_number() over (order by ${requests.latencyMs} asc) as rn,
          count(*) over () as n
        from ${requests}
        where ${where} and ${requests.latencyMs} is not null
      ) ranked
    `),
  );

  const [calls] = await db
    .select({
      calls: sql<number>`count(${modelCalls.id})::int`,
      fixtureCost: sql<string>`coalesce(sum(${modelCalls.costThb}) filter (where ${requests.mode} = 'fixture'), 0)::text`,
      liveCost: sql<string>`coalesce(sum(${modelCalls.costThb}) filter (where ${requests.mode} = 'live'), 0)::text`,
      unknownUsage: sql<number>`count(${modelCalls.id}) filter (where ${modelCalls.usageUnknown})::int`,
    })
    .from(modelCalls)
    .innerJoin(requests, eq(requests.id, modelCalls.requestId))
    .where(where);

  const [quality] = await db
    .select({
      feedbackCount: sql<number>`count(*)::int`,
      helpful: sql<number>`count(*) filter (where ${feedback.label} = 'helpful')::int`,
      needsCorrection: sql<number>`count(*) filter (where ${feedback.label} = 'needs_correction')::int`,
    })
    .from(feedback)
    .innerJoin(requests, eq(requests.id, feedback.requestId))
    .where(where);

  const total = totals?.total ?? 0;
  const errors = totals?.errors ?? 0;
  const insufficient = totals?.insufficient ?? 0;
  const feedbackCount = quality?.feedbackCount ?? 0;
  const needsCorrection = quality?.needsCorrection ?? 0;

  return {
    service: {
      requests: total,
      success: totals?.success ?? 0,
      errors,
      errorRate: total === 0 ? 0 : errors / total,
      insufficientInfo: insufficient,
      insufficientInfoRate: total === 0 ? 0 : insufficient / total,
      modelCalls: calls?.calls ?? 0,
      avgLatencyMs: totals?.avgLatency ?? null,
      p50Ms: percentileRows[0]?.p50 ?? null,
      p95Ms: percentileRows[0]?.p95 ?? null,
      p99Ms: percentileRows[0]?.p99 ?? null,
      p95Method: "nearest-rank",
      costFixtureThb: round4(Number(calls?.fixtureCost ?? 0)),
      costLiveThb: round4(Number(calls?.liveCost ?? 0)),
      unknownUsageCalls: calls?.unknownUsage ?? 0,
      users: totals?.users ?? 0,
      periodFrom: filter.from,
      periodTo: filter.to,
    },
    quality: {
      feedbackCount,
      helpful: quality?.helpful ?? 0,
      needsCorrection,
      correctionRate: feedbackCount === 0 ? 0 : needsCorrection / feedbackCount,
      insufficientInfo: insufficient,
      feedbackRate: total === 0 ? 0 : feedbackCount / total,
    },
    filter,
  };
}

/** Nearest rank, exported so a unit test can pin the definition. */
export function nearestRank(sortedValues: number[], percentile: number): number | null {
  if (sortedValues.length === 0) return null;
  const rank = Math.ceil(percentile * sortedValues.length);
  return sortedValues[Math.min(sortedValues.length, Math.max(1, rank)) - 1] ?? null;
}

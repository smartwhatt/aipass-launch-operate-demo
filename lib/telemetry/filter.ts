import dashboardContract from "@/fixtures/dashboard-contract.json";
import type { MetricsFilter } from "@/lib/telemetry/metrics";

/**
 * Dashboard filter defaults.
 *
 * The default view is the fixed historical teaching window, so a later
 * rehearsal request cannot move the numbers while recording. Rehearsal
 * requests are also stored with dataset = "live".
 */

export const HISTORICAL_PERIOD = {
  from: dashboardContract.period_start,
  to: dashboardContract.period_end,
} as const;

export const DATASETS = ["historical-pilot", "live"] as const;
export type DatasetName = (typeof DATASETS)[number];

export function parseMetricsFilter(
  params: URLSearchParams,
  namespace: string,
): MetricsFilter {
  const datasetParam = params.get("dataset");
  const dataset: DatasetName = datasetParam === "live" ? "live" : "historical-pilot";
  const from = params.get("from") ?? (dataset === "historical-pilot" ? HISTORICAL_PERIOD.from : defaultFrom());
  const to = params.get("to") ?? (dataset === "historical-pilot" ? HISTORICAL_PERIOD.to : today());
  const modeParam = params.get("mode");
  const mode = modeParam === "fixture" || modeParam === "live" ? modeParam : "all";
  const environmentParam = params.get("environment");
  const environment = environmentParam && environmentParam !== "all" ? environmentParam : null;

  return { namespace, environment, dataset, mode, from, to };
}

export function today(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function defaultFrom(): string {
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
  now.setUTCDate(now.getUTCDate() - 7);
  return now.toISOString().slice(0, 10);
}

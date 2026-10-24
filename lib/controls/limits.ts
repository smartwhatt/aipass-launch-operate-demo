/**
 * Teaching limits and Bangkok time helpers.
 *
 * Defaults come from fixtures/scenarios.json: five admitted questions per
 * rolling 60 seconds and 20 per day, reset at 00:00 Asia/Bangkok.
 * These are pure functions so unit tests can pin the boundary behaviour.
 */

export const TIMEZONE = "Asia/Bangkok";
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

export const RATE_LIMIT_PER_WINDOW = 5;
export const RATE_WINDOW_SECONDS = 60;
export const DAILY_QUOTA = 20;
export const DEFAULT_BUDGET_LIMIT_THB = 1000;
export const BUDGET_ALERT_FRACTION = 0.8;

/** YYYY-MM-DD in Asia/Bangkok. */
export function bangkokDate(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + BANGKOK_OFFSET_MS);
  return shifted.toISOString().slice(0, 10);
}

/** YYYY-MM in Asia/Bangkok, the budget ledger period. */
export function bangkokPeriod(now: Date = new Date()): string {
  return bangkokDate(now).slice(0, 7);
}

/** Next 00:00 Asia/Bangkok strictly after `now`. */
export function nextQuotaResetAt(now: Date = new Date()): Date {
  const [year, month, day] = bangkokDate(now).split("-").map(Number);
  const startOfNextDayUtc = Date.UTC(year, month - 1, day + 1) - BANGKOK_OFFSET_MS;
  return new Date(startOfNextDayUtc);
}

/** When the rolling window frees one slot. */
export function rateWindowRetryAt(oldestAdmission: Date): Date {
  return new Date(oldestAdmission.getTime() + RATE_WINDOW_SECONDS * 1000);
}

export function formatBangkok(date: Date, options: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: TIMEZONE,
    dateStyle: "medium",
    timeStyle: "short",
    ...options,
  }).format(date);
}

export function formatBangkokDate(date: Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: TIMEZONE,
    dateStyle: "long",
  }).format(date);
}

/** Remaining whole seconds until a reset, floored at zero. */
export function secondsUntil(target: Date, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((target.getTime() - now.getTime()) / 1000));
}

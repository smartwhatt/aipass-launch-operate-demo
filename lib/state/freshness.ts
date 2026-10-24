/**
 * Handbook freshness.
 *
 * The active index can point at an older document than the newest registered
 * one. That is the stale-index condition from EP3. The check is a pure
 * comparison so the interface and the tests agree on the rule.
 */
export type HandbooksFreshness = {
  stale: boolean;
  activeDocKey: string | null;
  latestDocKey: string | null;
};

export function handbookFreshness(
  activeDocKey: string | null | undefined,
  latestDocKey: string | null | undefined,
): HandbooksFreshness {
  const active = activeDocKey ?? null;
  const latest = latestDocKey ?? null;
  return {
    stale: Boolean(active && latest && active !== latest),
    activeDocKey: active,
    latestDocKey: latest,
  };
}

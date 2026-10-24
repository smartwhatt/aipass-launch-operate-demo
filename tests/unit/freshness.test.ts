import { describe, expect, it } from "vitest";
import { handbookFreshness } from "@/lib/state/freshness";

describe("handbook freshness", () => {
  it("flags a newer registered document that is not served", () => {
    const result = handbookFreshness("docs-v1", "docs-v2");
    expect(result.stale).toBe(true);
    expect(result.activeDocKey).toBe("docs-v1");
    expect(result.latestDocKey).toBe("docs-v2");
  });

  it("is fresh when the active index serves the newest document", () => {
    expect(handbookFreshness("docs-v2", "docs-v2").stale).toBe(false);
  });

  it("does not claim stale when one side is missing", () => {
    expect(handbookFreshness(null, "docs-v2").stale).toBe(false);
    expect(handbookFreshness("docs-v1", null).stale).toBe(false);
    expect(handbookFreshness(undefined, undefined).stale).toBe(false);
  });
});

import type { AnswerStatus, DataMode } from "@/lib/domain/types";

/**
 * Provider contract.
 *
 * Two adapters implement it: a deterministic fixture adapter (always labelled
 * on screen) and the Gemini adapter (live). Nothing above this layer knows
 * which one answered, except the recorded `mode` and the visible label.
 */

export type ProviderSection = {
  sectionId: string;
  title: string;
  text: string;
};

export type ProviderInput = {
  question: string;
  docKey: string;
  indexKey: string;
  sections: ProviderSection[];
  mode: DataMode;
};

export type ProviderUsage = {
  inputTokens: number;
  outputTokens: number;
  usageUnknown: boolean;
};

export type ProviderResult = {
  status: Extract<AnswerStatus, "ok" | "insufficient_info">;
  answer: string;
  /** Section IDs the answer relies on. Server maps them to citations. */
  citedSections: string[];
  usage: ProviderUsage;
  latencyMs: number;
  /** Attempts used, 1 or 2. */
  attempts: number;
  raw?: unknown;
};

export type ProviderFailureCode = "transient" | "auth" | "rate_limited" | "unknown";

export class ProviderFailure extends Error {
  readonly code: ProviderFailureCode;
  readonly retryable: boolean;

  constructor(code: ProviderFailureCode, message: string) {
    super(message);
    this.name = "ProviderFailure";
    this.code = code;
    this.retryable = code === "transient" || code === "rate_limited";
  }
}

export interface AnswerProvider {
  readonly name: "fixture" | "gemini";
  readonly modelId: string;
  complete(input: ProviderInput): Promise<ProviderResult>;
}

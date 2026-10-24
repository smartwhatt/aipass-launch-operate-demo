/**
 * Shared domain types for the ถามคู่มือ demo.
 *
 * These names are part of the teaching contract: the scripts and the
 * recording runbook use the same status words on screen.
 */

/** Result statuses shown to learners (IMPLEMENTATION_SPEC.md section 5). */
export const ANSWER_STATUSES = [
  "ok",
  "insufficient_info",
  "unauthorized",
  "rate_limited",
  "quota_exceeded",
  "budget_exceeded",
  "provider_unavailable",
] as const;

export type AnswerStatus = (typeof ANSWER_STATUSES)[number];

/** Where an answer came from. Fixture answers are always labelled on screen. */
export type DataMode = "fixture" | "live";

export type AppRole = "admin" | "pilot" | "outsider";

export type ScenarioMode = "normal" | "stale_index" | "incident" | "provider_failure";

export type Citation = {
  /** Document key, for example docs-v1. */
  documentId: string;
  /** Version label shown to learners; same as documentId in this demo. */
  version: string;
  sectionId: string;
  sectionTitle: string;
  excerpt: string;
  /** Built by the server from a known section. Never taken from the model. */
  url: string;
};

export type RetrievalHit = {
  sectionId: string;
  title: string;
  score: number;
  matchedTerms: string[];
};

export type IndexSection = {
  sectionId: string;
  title: string;
  text: string;
  ordinal: number;
  /** Character n-gram counts, the retrieval signal. */
  grams: Record<string, number>;
  /** Canonical terms found in the section text. */
  terms: string[];
  /** Query aliases that resolve to this section through its terms. */
  aliases: string[];
};

export type IndexEntries = {
  docKey: string;
  title: string;
  effectiveDate: string;
  sections: IndexSection[];
};

export type SpanAttributes = Record<string, unknown>;

export type Versions = {
  app: string;
  config: string;
  handbook: string | null;
  index: string | null;
  prompt: string;
  pricing: string | null;
  model: string | null;
};

/** Response body of POST /api/questions. */
export type QuestionResponse = {
  request_id: string;
  status: AnswerStatus | "invalid_input";
  answer: string;
  citations: Citation[];
  versions: Versions;
  mode: DataMode;
  retry_at?: string | null;
  explanation?: string;
  next_action?: string;
  /** Server-built link to the handbook version an operator marked as checked. */
  fallback_url?: string | null;
  request_url?: string;
};

export type QuestionErrorResponse = {
  status: "invalid_input" | "unauthorized";
  error: { code: string; message: string };
};

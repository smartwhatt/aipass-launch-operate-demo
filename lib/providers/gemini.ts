import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { buildPrompt, PROMPT_VERSION } from "@/lib/providers/prompt";
import { MAX_OUTPUT_TOKENS } from "@/lib/providers/pricing";
import {
  ProviderFailure,
  type AnswerProvider,
  type ProviderInput,
  type ProviderResult,
} from "@/lib/providers/types";

/**
 * Live Gemini adapter (server only).
 *
 * The API key is read from the server environment and never sent to the
 * browser. One call per attempt; retry policy lives in the answer service so
 * the retry can be recorded and budgeted separately.
 */

const responseSchema = z.object({
  status: z.enum(["ok", "insufficient_info"]),
  answer: z.string().min(1).max(4000),
  cited_sections: z.array(z.string()).max(3).optional().default([]),
});

const TIMEOUT_MS = 20_000;

export class GeminiProvider implements AnswerProvider {
  readonly name = "gemini" as const;
  readonly modelId: string;
  private readonly apiKey: string;

  constructor(options: { apiKey: string; modelId: string }) {
    if (!options.apiKey) {
      throw new ProviderFailure("auth", "GEMINI_API_KEY is missing; live mode cannot start");
    }
    this.apiKey = options.apiKey;
    this.modelId = options.modelId;
  }

  async complete(input: ProviderInput): Promise<ProviderResult> {
    const startedAt = performance.now();
    const client = new GoogleGenAI({ apiKey: this.apiKey });

    let text: string | undefined;
    let usageMetadata: { promptTokenCount?: number; candidatesTokenCount?: number } | undefined;

    try {
      const response = await client.models.generateContent({
        model: this.modelId,
        contents: buildPrompt(input),
        config: {
          temperature: 0.2,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          responseMimeType: "application/json",
          abortSignal: AbortSignal.timeout(TIMEOUT_MS),
        },
      });
      text = response.text;
      usageMetadata = response.usageMetadata as typeof usageMetadata;
    } catch (error) {
      throw mapProviderError(error);
    }

    const latencyMs = Math.round(performance.now() - startedAt);
    if (!text) {
      throw new ProviderFailure("transient", "Gemini returned an empty response");
    }

    let parsed: z.infer<typeof responseSchema>;
    try {
      parsed = responseSchema.parse(JSON.parse(stripCodeFence(text)));
    } catch {
      throw new ProviderFailure("unknown", "Gemini returned text that was not valid JSON");
    }

    const inputTokens = usageMetadata?.promptTokenCount ?? 0;
    const outputTokens = usageMetadata?.candidatesTokenCount ?? 0;
    const usageUnknown = inputTokens === 0 && outputTokens === 0;

    return {
      status: parsed.status,
      answer: parsed.answer,
      citedSections: parsed.cited_sections,
      usage: { inputTokens, outputTokens, usageUnknown },
      latencyMs,
      attempts: 1,
      raw: { promptVersion: PROMPT_VERSION },
    };
  }
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```[a-z]*\n?/i, "").replace(/```$/, "").trim();
}

function mapProviderError(error: unknown): ProviderFailure {
  if (error instanceof ProviderFailure) return error;
  const message = error instanceof Error ? error.message : String(error);
  const status = (error as { status?: number } | null)?.status;

  if (status === 401 || status === 403 || /api key|permission|unauthenticated/i.test(message)) {
    return new ProviderFailure("auth", `Gemini authorization failed: ${message}`);
  }
  if (status === 429 || /rate limit|quota|resource exhausted/i.test(message)) {
    return new ProviderFailure("rate_limited", `Gemini rate limited: ${message}`);
  }
  if (/timeout|aborted|network|fetch failed|ECONN|ETIMEDOUT/i.test(message)) {
    return new ProviderFailure("transient", `Gemini network error: ${message}`);
  }
  if (typeof status === "number" && status >= 500) {
    return new ProviderFailure("transient", `Gemini server error ${status}: ${message}`);
  }
  return new ProviderFailure("unknown", `Gemini error: ${message}`);
}

import { ProviderFailure, type AnswerProvider, type ProviderInput, type ProviderResult } from "@/lib/providers/types";

/**
 * Deterministic fixture provider.
 *
 * Answers are extracted from the retrieved sections of the *active* index, so
 * a stale index changes the answer in the same way a live model would. The
 * mode is recorded on every request and shown on screen: fixture data is
 * fake teaching data, never a live model result.
 *
 * `failRequests` reproduces the EP2 provider outage.
 */

export function composeFixtureAnswer(input: ProviderInput, sectionIndex = 0): string {
  const section = input.sections[sectionIndex];
  if (!section) {
    return "ไม่พบข้อความที่เกี่ยวข้องในคู่มือฉบับที่ใช้งานอยู่ จึงยังตอบคำถามนี้ไม่ได้";
  }
  // The citation panel already names the document and section, so the answer
  // stays a plain quote of the evidence instead of repeating the reference.
  return section.text;
}

export class FixtureProvider implements AnswerProvider {
  readonly name = "fixture" as const;
  readonly modelId = "fixture-handbook-v1";
  private readonly failRequests: boolean;

  constructor(options: { failRequests?: boolean } = {}) {
    this.failRequests = options.failRequests ?? false;
  }

  async complete(input: ProviderInput): Promise<ProviderResult> {
    const startedAt = performance.now();

    if (this.failRequests) {
      throw new ProviderFailure(
        "transient",
        "fixture provider: simulated upstream failure (EP2 provider failure scenario)",
      );
    }

    if (input.sections.length === 0) {
      return {
        status: "insufficient_info",
        answer:
          "คู่มือฉบับที่ใช้งานอยู่ไม่มีข้อความที่ตรงกับคำถามนี้ จึงยังตอบไม่ได้และไม่ควรเดาคำตอบ",
        citedSections: [],
        usage: { inputTokens: 0, outputTokens: 0, usageUnknown: false },
        latencyMs: Math.round(performance.now() - startedAt),
        attempts: 1,
      };
    }

    const answer = composeFixtureAnswer(input);
    // Rough, deterministic token accounting: the fixture has no real model.
    const inputTokens = Math.max(1, Math.round(`${input.docKey}${input.question}`.length / 4));
    const outputTokens = Math.max(1, Math.round(answer.length / 4));

    return {
      status: "ok",
      answer,
      citedSections: [input.sections[0].sectionId],
      usage: { inputTokens, outputTokens, usageUnknown: false },
      latencyMs: Math.round(performance.now() - startedAt),
      attempts: 1,
    };
  }
}

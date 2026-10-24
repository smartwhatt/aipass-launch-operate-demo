import type { IndexEntries, RetrievalHit } from "@/lib/domain/types";
import type { AliasMap } from "@/lib/retrieval/lexicon";
import { matchRules } from "@/lib/retrieval/lexicon";
import { normalizeText } from "@/lib/retrieval/normalize";
import { gramCounts } from "@/lib/retrieval/normalize";

/**
 * Deterministic Thai keyword retrieval over section-level chunks.
 *
 * Score = weighted mix of
 *   1. alias coverage: how many expansion terms of the matched question
 *      concepts the section contains, and
 *   2. cosine similarity of TF-IDF character n-gram vectors.
 *
 * Returns at most `limit` sections. A low score means "no relevant evidence"
 * and the caller must answer insufficient_info instead of inventing text.
 */

export const MAX_SECTIONS = 3;
/** Below this score the section is not treated as evidence. */
export const MIN_SCORE = 0.34;
/** Alias coverage gets this share of the score when concepts match. */
export const ALIAS_WEIGHT = 0.6;
export const GRAM_WEIGHT = 0.4;

export type RetrieveInput = {
  entries: IndexEntries;
  aliasMap: AliasMap;
  question: string;
  outOfScope: string[];
  limit?: number;
};

export type RetrieveResult = {
  hits: RetrievalHit[];
  outOfScopeTerm: string | null;
  matchedConcepts: string[];
  bestScore: number;
  threshold: number;
};

function sublinearTf(count: number): number {
  return 1 + Math.log(count);
}

/** idf over the sections of one index. */
function buildIdf(entries: IndexEntries, grams: Iterable<string>): Map<string, number> {
  const total = entries.sections.length;
  const idf = new Map<string, number>();
  for (const gram of grams) {
    let df = 0;
    for (const section of entries.sections) {
      if (section.grams[gram]) df += 1;
    }
    idf.set(gram, Math.log(1 + total / (1 + df)));
  }
  return idf;
}

function cosine(
  query: Map<string, number>,
  sectionGrams: Record<string, number>,
  idf: Map<string, number>,
): { score: number; matched: Array<{ gram: string; weight: number }> } {
  let dot = 0;
  let queryNorm = 0;
  let sectionNorm = 0;
  const matched: Array<{ gram: string; weight: number }> = [];

  for (const [gram, count] of query) {
    const weight = sublinearTf(count) * (idf.get(gram) ?? 0);
    queryNorm += weight * weight;
    const sectionCount = sectionGrams[gram];
    if (sectionCount) {
      const sectionWeight = sublinearTf(sectionCount) * (idf.get(gram) ?? 0);
      dot += weight * sectionWeight;
      matched.push({ gram, weight: sectionWeight });
    }
  }

  for (const [gram, count] of Object.entries(sectionGrams)) {
    const weight = sublinearTf(count) * (idf.get(gram) ?? 0);
    sectionNorm += weight * weight;
  }

  if (queryNorm === 0 || sectionNorm === 0) return { score: 0, matched: [] };
  return { score: dot / (Math.sqrt(queryNorm) * Math.sqrt(sectionNorm)), matched };
}

export function retrieve(input: RetrieveInput): RetrieveResult {
  const limit = input.limit ?? MAX_SECTIONS;
  const question = normalizeText(input.question);
  const outOfScopeTerm =
    input.outOfScope.find((term) => question.includes(normalizeText(term))) ?? null;
  const rules = matchRules(question);

  const queryGrams = gramCounts(question);
  const idf = buildIdf(input.entries, queryGrams.keys());

  const scored = input.entries.sections.map((section) => {
    const { score: cosineScore, matched } = cosine(queryGrams, section.grams, idf);
    const sectionTerms = new Set(section.terms.map((term) => normalizeText(term)));

    let aliasCoverage = 0;
    if (rules.length > 0) {
      const total = rules.reduce((sum, rule) => sum + rule.expands.length, 0);
      const present = rules.reduce(
        (sum, rule) =>
          sum + rule.expands.filter((term) => sectionTerms.has(normalizeText(term))).length,
        0,
      );
      aliasCoverage = total === 0 ? 0 : present / total;
    }

    const weightTotal = (rules.length > 0 ? ALIAS_WEIGHT : 0) + GRAM_WEIGHT;
    const score =
      weightTotal === 0 ? 0 : (ALIAS_WEIGHT * aliasCoverage + GRAM_WEIGHT * cosineScore) / weightTotal;

    const matchedTerms = matched
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 6)
      .map((entry) => entry.gram);

    return { section, score, matchedTerms, aliasCoverage, cosineScore };
  });

  scored.sort((a, b) => {
    if (Math.abs(b.score - a.score) > 1e-9) return b.score - a.score;
    return a.section.ordinal - b.section.ordinal;
  });

  const bestScore = scored[0]?.score ?? 0;

  // An out-of-scope topic with no matched handbook concept has no evidence.
  if (outOfScopeTerm && rules.length === 0) {
    return {
      hits: [],
      outOfScopeTerm,
      matchedConcepts: [],
      bestScore,
      threshold: MIN_SCORE,
    };
  }

  const hits: RetrievalHit[] = scored
    .filter((entry) => entry.score >= MIN_SCORE)
    .slice(0, limit)
    .map((entry) => ({
      sectionId: entry.section.sectionId,
      title: entry.section.title,
      score: Number(entry.score.toFixed(4)),
      matchedTerms: entry.matchedTerms,
    }));

  return {
    hits,
    outOfScopeTerm,
    matchedConcepts: rules.map((rule) => rule.id),
    bestScore: Number(bestScore.toFixed(4)),
    threshold: MIN_SCORE,
  };
}

export type { AliasMap };

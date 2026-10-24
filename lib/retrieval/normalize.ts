/**
 * Thai text normalisation and n-gram tokenisation.
 *
 * Thai does not put spaces between words, so this demo uses character
 * n-grams (2, 3, and 4 characters) as the retrieval signal. It is
 * deterministic, offline, and needs no embedding API.
 */

export function normalizeText(input: string): string {
  return input
    .normalize("NFC")
    .replace(/[\u200b-\u200f\ufeff]/g, "")
    .replace(/[“”„«»"]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const THAI_RUN = /[\u0e00-\u0e7f]+/g;
const LATIN_RUN = /[a-z0-9]+/g;

/** Contiguous Thai runs and Latin words, in reading order. */
export function textRuns(input: string): string[] {
  const normalized = normalizeText(input);
  const runs: string[] = [];
  for (const match of normalized.matchAll(THAI_RUN)) {
    if (match[0].length >= 2) runs.push(match[0]);
  }
  for (const match of normalized.matchAll(LATIN_RUN)) {
    if (match[0].length >= 2) runs.push(match[0]);
  }
  return runs;
}

/** Character n-grams for Thai runs; whole words for Latin runs. */
export function gramList(input: string, sizes: number[] = [2, 3, 4]): string[] {
  const grams: string[] = [];
  for (const run of textRuns(input)) {
    if (/^[a-z0-9]/.test(run)) {
      grams.push(run);
      continue;
    }
    for (const size of sizes) {
      if (run.length < size) continue;
      for (let i = 0; i + size <= run.length; i += 1) {
        grams.push(run.slice(i, i + size));
      }
    }
  }
  return grams;
}

export function gramCounts(input: string, sizes?: number[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const gram of gramList(input, sizes)) {
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }
  return counts;
}

/** True when the normalised query contains the normalised phrase. */
export function containsPhrase(haystack: string, needle: string): boolean {
  if (!needle) return false;
  return normalizeText(haystack).includes(normalizeText(needle));
}

export function wordCount(text: string): number {
  return textRuns(text).length;
}

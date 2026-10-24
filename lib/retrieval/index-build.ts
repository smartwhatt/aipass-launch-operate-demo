import { createHash } from "node:crypto";
import type { IndexEntries, IndexSection } from "@/lib/domain/types";
import { buildAliasMap, allExpansionTerms, ALIAS_RULES, type AliasMap } from "@/lib/retrieval/lexicon";
import { gramCounts, normalizeText } from "@/lib/retrieval/normalize";

/**
 * Index building.
 *
 * An index is generated from document content only: section text becomes
 * character n-grams, plus the query aliases that resolve to the section's
 * terms. The active index pointer is stored in PostgreSQL, separate from
 * deployment artifacts, so a stale index is a real, visible condition.
 */

export type CanonicalDocument = {
  id: string;
  title: string;
  effective_date: string;
  fictional: boolean;
  sections: Array<{ id: string; title: string; text: string }>;
  out_of_scope: string[];
};

export type BuiltIndex = {
  entries: IndexEntries;
  aliasMap: AliasMap;
  contentHash: string;
};

export function buildIndex(doc: CanonicalDocument): BuiltIndex {
  const expansionTerms = allExpansionTerms();
  const aliasMap = buildAliasMap();

  const sections: IndexSection[] = doc.sections.map((section, ordinal) => {
    const grams = Object.fromEntries(gramCounts(`${section.title} ${section.text}`));
    const sectionText = normalizeText(`${section.title} ${section.text}`);
    const terms = expansionTerms.filter((term) => sectionText.includes(normalizeText(term)));
    const aliases = ALIAS_RULES.filter((rule) =>
      rule.expands.some((term) => sectionText.includes(normalizeText(term))),
    ).flatMap((rule) => rule.triggers);

    return {
      sectionId: section.id,
      title: section.title,
      text: section.text,
      ordinal,
      grams,
      terms,
      aliases: Array.from(new Set(aliases)).sort(),
    };
  });

  const entries: IndexEntries = {
    docKey: doc.id,
    title: doc.title,
    effectiveDate: doc.effective_date,
    sections,
  };

  const contentHash = createHash("sha256")
    .update(JSON.stringify({ docId: doc.id, sections: doc.sections }))
    .digest("hex");

  return { entries, aliasMap, contentHash };
}

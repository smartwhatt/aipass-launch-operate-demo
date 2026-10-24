import docsV1 from "@/fixtures/documents/docs-v1.json";
import docsV2 from "@/fixtures/documents/docs-v2.json";
import type { CanonicalDocument } from "@/lib/retrieval/index-build";

/**
 * Canonical handbook text, imported from the repository fixtures.
 *
 * The JSON files are the source of truth. Versioned copies are imported into
 * PostgreSQL by `npm run demo:seed`; the app reads the database copy so a
 * document can be registered without redeploying code.
 */
export const CANONICAL_DOCUMENTS: Record<string, CanonicalDocument> = {
  "docs-v1": docsV1 as CanonicalDocument,
  "docs-v2": docsV2 as CanonicalDocument,
};

export const DOCUMENT_KEYS = Object.keys(CANONICAL_DOCUMENTS);

export function getCanonicalDocument(key: string): CanonicalDocument {
  const doc = CANONICAL_DOCUMENTS[key];
  if (!doc) {
    throw new Error(`Unknown document ${key}. Known: ${DOCUMENT_KEYS.join(", ")}`);
  }
  return doc;
}

/** Section anchors on /handbook/[version]. */
export function sectionAnchor(sectionId: string): string {
  return `s${sectionId.replace(/\./g, "-")}`;
}

/** Citations always point at a section the server knows, never at a model URL. */
export function citationUrl(docKey: string, sectionId: string): string {
  return `/handbook/${encodeURIComponent(docKey)}#${sectionAnchor(sectionId)}`;
}

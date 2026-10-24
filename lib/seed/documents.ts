import { and, eq, inArray } from "drizzle-orm";
import type { DbLike } from "@/lib/db/client";
import { activeState, chunks, documents, docIndexes } from "@/lib/db/schema";
import { getCanonicalDocument } from "@/lib/retrieval/canonical";
import { buildIndex } from "@/lib/retrieval/index-build";
import { bumpConfigVersion, ensureActiveState } from "@/lib/state/active";

/**
 * Document and index registration.
 *
 * Canonical text stays in the repository. Versioned copies are imported here.
 * Indexes are immutable: `ensureIndex` never updates an existing row, and
 * registering a document never activates an index by itself.
 */

export async function ensureDocument(
  db: DbLike,
  namespace: string,
  docKey: string,
): Promise<{ documentId: string; created: boolean }> {
  const canonical = getCanonicalDocument(docKey);

  const existing = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.namespace, namespace), eq(documents.docKey, docKey)))
    .limit(1);

  if (existing[0]) {
    await ensureChunks(db, namespace, existing[0].id, docKey);
    return { documentId: existing[0].id, created: false };
  }

  const { contentHash } = buildIndex(canonical);
  const [row] = await db
    .insert(documents)
    .values({
      namespace,
      docKey,
      title: canonical.title,
      effectiveDate: canonical.effective_date,
      fictional: canonical.fictional,
      body: canonical as unknown as Record<string, unknown>,
      contentHash,
    })
    .returning({ id: documents.id });

  await ensureChunks(db, namespace, row.id, docKey);
  return { documentId: row.id, created: true };
}

async function ensureChunks(
  db: DbLike,
  namespace: string,
  documentId: string,
  docKey: string,
): Promise<void> {
  const canonical = getCanonicalDocument(docKey);
  await db
    .insert(chunks)
    .values(
      canonical.sections.map((section, index) => ({
        namespace,
        documentId,
        sectionId: section.id,
        title: section.title,
        text: section.text,
        ordinal: index,
      })),
    )
    .onConflictDoNothing();
}

export type EnsuredIndex = {
  indexKey: string;
  docKey: string;
  documentId: string;
  created: boolean;
  chunkCount: number;
};

export async function ensureIndex(
  db: DbLike,
  namespace: string,
  docKey: string,
  indexKey: string,
): Promise<EnsuredIndex> {
  const { documentId } = await ensureDocument(db, namespace, docKey);
  const existing = await db
    .select({ chunkCount: docIndexes.chunkCount })
    .from(docIndexes)
    .where(and(eq(docIndexes.namespace, namespace), eq(docIndexes.indexKey, indexKey)))
    .limit(1);

  if (existing[0]) {
    return { indexKey, docKey, documentId, created: false, chunkCount: existing[0].chunkCount };
  }

  const canonical = getCanonicalDocument(docKey);
  const built = buildIndex(canonical);

  await db
    .insert(docIndexes)
    .values({
      namespace,
      indexKey,
      documentId,
      docKey,
      entries: built.entries,
      aliasMap: built.aliasMap,
      contentHash: built.contentHash,
      chunkCount: canonical.sections.length,
    })
    .onConflictDoNothing();

  return {
    indexKey,
    docKey,
    documentId,
    created: true,
    chunkCount: canonical.sections.length,
  };
}

export async function activateIndex(
  db: DbLike,
  namespace: string,
  indexKey: string,
): Promise<void> {
  const [index] = await db
    .select({ id: docIndexes.id })
    .from(docIndexes)
    .where(and(eq(docIndexes.namespace, namespace), eq(docIndexes.indexKey, indexKey)))
    .limit(1);
  if (!index) throw new Error(`Index ${indexKey} is not registered in ${namespace}`);

  await ensureActiveState(db, namespace);
  await db
    .update(activeState)
    .set({ activeIndexKey: indexKey, updatedAt: new Date() })
    .where(eq(activeState.namespace, namespace));
  await bumpConfigVersion(db, namespace);
}

export async function getActiveIndexKey(db: DbLike, namespace: string): Promise<string | null> {
  await ensureActiveState(db, namespace);
  const [row] = await db
    .select({ activeIndexKey: activeState.activeIndexKey })
    .from(activeState)
    .where(eq(activeState.namespace, namespace))
    .limit(1);
  return row?.activeIndexKey ?? null;
}

/** Removes a document and the indexes built from it. Used by baseline resets. */
export async function removeDocuments(
  db: DbLike,
  namespace: string,
  docKeys: string[],
): Promise<void> {
  if (docKeys.length === 0) return;
  const activeKey = await getActiveIndexKey(db, namespace);

  const doomed = await db
    .select({ id: documents.id, docKey: documents.docKey })
    .from(documents)
    .where(and(eq(documents.namespace, namespace), inArray(documents.docKey, docKeys)));

  for (const document of doomed) {
    const indexes = await db
      .select({ indexKey: docIndexes.indexKey })
      .from(docIndexes)
      .where(and(eq(docIndexes.namespace, namespace), eq(docIndexes.documentId, document.id)));

    if (indexes.some((index) => index.indexKey === activeKey)) {
      await db
        .update(activeState)
        .set({ activeIndexKey: null, updatedAt: new Date() })
        .where(eq(activeState.namespace, namespace));
    }
    await db
      .delete(docIndexes)
      .where(and(eq(docIndexes.namespace, namespace), eq(docIndexes.documentId, document.id)));
    await db.delete(documents).where(eq(documents.id, document.id));
  }
}

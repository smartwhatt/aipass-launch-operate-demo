import { and, desc, eq } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import { activeState, documents, docIndexes } from "@/lib/db/schema";
import type { IndexEntries, ScenarioMode } from "@/lib/domain/types";
import type { AliasMap } from "@/lib/retrieval/lexicon";
import { DEFAULT_BUDGET_LIMIT_THB } from "@/lib/controls/limits";

/**
 * Active configuration.
 *
 * The active index pointer lives in PostgreSQL, not in a deployment artifact.
 * That is what makes the stale-index incident and the rollback limitation
 * real: rolling back code does not move the pointer.
 */

export type ActiveIndex = {
  indexKey: string;
  docKey: string;
  documentId: string;
  entries: IndexEntries;
  aliasMap: AliasMap;
  chunkCount: number;
  builtAt: Date;
};

export type IncidentInfo = {
  enabled: boolean;
  topic: string | null;
  message: string | null;
  owner: string | null;
  nextUpdateAt: Date | null;
};

export type ActiveContext = {
  namespace: string;
  configVersion: string;
  mode: ScenarioMode;
  index: ActiveIndex | null;
  incident: IncidentInfo;
  /** Newest registered document, even when it is not the active index. */
  latestDocKey: string | null;
  registeredDocuments: Array<{
    docKey: string;
    title: string;
    effectiveDate: string;
    registeredAt: Date;
    isActive: boolean;
  }>;
};

export type RegisteredDocument = {
  docKey: string;
  title: string;
  effectiveDate: string;
  registeredAt: Date;
  isActive: boolean;
};

export async function ensureActiveState(db: Database, namespace: string): Promise<void> {
  await db
    .insert(activeState)
    .values({ namespace, mode: "normal", configVersion: "cfg-1" })
    .onConflictDoNothing();
}

export async function loadIndex(
  db: Database,
  namespace: string,
  indexKey: string,
): Promise<ActiveIndex | null> {
  const rows = await db
    .select({
      indexKey: docIndexes.indexKey,
      docKey: docIndexes.docKey,
      documentId: docIndexes.documentId,
      entries: docIndexes.entries,
      aliasMap: docIndexes.aliasMap,
      chunkCount: docIndexes.chunkCount,
      builtAt: docIndexes.builtAt,
    })
    .from(docIndexes)
    .where(and(eq(docIndexes.namespace, namespace), eq(docIndexes.indexKey, indexKey)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listDocuments(
  db: Database,
  namespace: string,
  activeIndexKey: string | null,
): Promise<RegisteredDocument[]> {
  const rows = await db
    .select({
      docKey: documents.docKey,
      title: documents.title,
      effectiveDate: documents.effectiveDate,
      registeredAt: documents.registeredAt,
    })
    .from(documents)
    .where(eq(documents.namespace, namespace))
    .orderBy(desc(documents.effectiveDate));

  const activeDocKey = activeIndexKey
    ? (
        await db
          .select({ docKey: docIndexes.docKey })
          .from(docIndexes)
          .where(and(eq(docIndexes.namespace, namespace), eq(docIndexes.indexKey, activeIndexKey)))
          .limit(1)
      )[0]?.docKey
    : null;

  return rows.map((row) => ({ ...row, isActive: row.docKey === activeDocKey }));
}

export async function getActiveContext(db: Database, namespace: string): Promise<ActiveContext> {
  await ensureActiveState(db, namespace);

  const [state] = await db
    .select()
    .from(activeState)
    .where(eq(activeState.namespace, namespace))
    .limit(1);

  const index = state?.activeIndexKey
    ? await loadIndex(db, namespace, state.activeIndexKey)
    : null;

  const registeredDocuments = await listDocuments(db, namespace, state?.activeIndexKey ?? null);

  const incident: IncidentInfo = state?.incidentEnabled
    ? {
        enabled: true,
        topic: state.incidentTopic,
        message: state.incidentMessage,
        owner: state.incidentOwner,
        nextUpdateAt: state.incidentNextUpdate,
      }
    : {
        enabled: false,
        topic: null,
        message: null,
        owner: null,
        nextUpdateAt: null,
      };

  return {
    namespace,
    configVersion: state?.configVersion ?? "cfg-1",
    mode: (state?.mode ?? "normal") as ScenarioMode,
    index,
    incident,
    latestDocKey: registeredDocuments[0]?.docKey ?? null,
    registeredDocuments,
  };
}

export async function bumpConfigVersion(db: Database, namespace: string): Promise<string> {
  const [row] = await db
    .select({ configVersion: activeState.configVersion })
    .from(activeState)
    .where(eq(activeState.namespace, namespace))
    .limit(1);
  const current = Number(/(\d+)/.exec(row?.configVersion ?? "cfg-1")?.[1] ?? 0) + 1;
  const next = `cfg-${current}`;
  await db
    .update(activeState)
    .set({ configVersion: next, updatedAt: new Date() })
    .where(eq(activeState.namespace, namespace));
  return next;
}

export function defaultBudgetLimit(): number {
  return DEFAULT_BUDGET_LIMIT_THB;
}

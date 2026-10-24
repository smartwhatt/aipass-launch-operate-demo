/**
 * Drizzle schema for ถามคู่มือ — ศูนย์บริการตัวอย่าง.
 *
 * The executable source of truth for the database is the versioned SQL under
 * lib/db/migrations. This file mirrors it for typed queries and for
 * `drizzle-kit` inspection. Keep the two in step.
 *
 * Every mutable teaching table carries `namespace` so one deployment's
 * Preview reset can never touch another environment's data.
 */
import {
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { Citation, IndexEntries, RetrievalHit, SpanAttributes } from "@/lib/domain/types";

export const appUsers = pgTable(
  "app_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    namespace: text("namespace").notNull(),
    username: text("username").notNull(),
    displayName: text("display_name").notNull(),
    role: text("role").notNull(),
    passwordHash: text("password_hash").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("app_users_namespace_username_key").on(t.namespace, t.username)],
);

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  namespace: text("namespace").notNull(),
  userId: uuid("user_id")
    .notNull()
    .references(() => appUsers.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  userAgent: text("user_agent"),
});

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    namespace: text("namespace").notNull(),
    docKey: text("doc_key").notNull(),
    title: text("title").notNull(),
    effectiveDate: date("effective_date").notNull(),
    fictional: boolean("fictional").notNull().default(true),
    body: jsonb("body").notNull().$type<Record<string, unknown>>(),
    contentHash: text("content_hash").notNull(),
    registeredAt: timestamp("registered_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("documents_namespace_doc_key_key").on(t.namespace, t.docKey)],
);

export const chunks = pgTable(
  "chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    namespace: text("namespace").notNull(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    sectionId: text("section_id").notNull(),
    title: text("title").notNull(),
    text: text("text").notNull(),
    ordinal: integer("ordinal").notNull(),
  },
  (t) => [uniqueIndex("chunks_document_section_key").on(t.documentId, t.sectionId)],
);

export const docIndexes = pgTable(
  "doc_indexes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    namespace: text("namespace").notNull(),
    indexKey: text("index_key").notNull(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id),
    docKey: text("doc_key").notNull(),
    entries: jsonb("entries").notNull().$type<IndexEntries>(),
    aliasMap: jsonb("alias_map").notNull().$type<Record<string, string[]>>(),
    contentHash: text("content_hash").notNull(),
    chunkCount: integer("chunk_count").notNull(),
    builtAt: timestamp("built_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("doc_indexes_namespace_index_key_key").on(t.namespace, t.indexKey)],
);

export const activeState = pgTable("active_state", {
  namespace: text("namespace").primaryKey(),
  activeIndexKey: text("active_index_key"),
  mode: text("mode").notNull().default("normal"),
  configVersion: text("config_version").notNull().default("cfg-1"),
  incidentEnabled: boolean("incident_enabled").notNull().default(false),
  incidentTopic: text("incident_topic"),
  incidentMessage: text("incident_message"),
  incidentOwner: text("incident_owner"),
  incidentNextUpdate: timestamp("incident_next_update", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const requests = pgTable(
  "requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    namespace: text("namespace").notNull(),
    requestId: text("request_id").notNull(),
    userId: uuid("user_id").references(() => appUsers.id, { onDelete: "set null" }),
    actorRef: text("actor_ref").notNull(),
    dataset: text("dataset").notNull().default("live"),
    question: text("question").notNull(),
    questionId: text("question_id"),
    idempotencyKey: text("idempotency_key"),
    status: text("status").notNull(),
    answer: text("answer"),
    citations: jsonb("citations").notNull().default([]).$type<Citation[]>(),
    retrieved: jsonb("retrieved").notNull().default([]).$type<RetrievalHit[]>(),
    mode: text("mode").notNull(),
    environment: text("environment").notNull().default("local"),
    appVersion: text("app_version").notNull(),
    promptVersion: text("prompt_version").notNull(),
    documentVersion: text("document_version"),
    indexVersion: text("index_version"),
    configVersion: text("config_version").notNull().default("cfg-1"),
    modelId: text("model_id"),
    pricingVersion: text("pricing_version"),
    latencyMs: integer("latency_ms"),
    explanation: text("explanation"),
    nextAction: text("next_action"),
    errorCode: text("error_code"),
    retryAt: timestamp("retry_at", { withTimezone: true }),
    admittedAt: timestamp("admitted_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("requests_namespace_request_id_key").on(t.namespace, t.requestId),
    uniqueIndex("requests_idempotency_key").on(t.namespace, t.userId, t.idempotencyKey),
    index("requests_namespace_created_at_idx").on(t.namespace, t.createdAt),
    index("requests_namespace_dataset_idx").on(t.namespace, t.dataset),
  ],
);

export const modelCalls = pgTable(
  "model_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    namespace: text("namespace").notNull(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => requests.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    modelId: text("model_id").notNull(),
    attempt: integer("attempt").notNull().default(1),
    status: text("status").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costThb: numeric("cost_thb", { precision: 12, scale: 4 }).notNull().default("0"),
    latencyMs: integer("latency_ms"),
    usageUnknown: boolean("usage_unknown").notNull().default(false),
    errorCode: text("error_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("model_calls_request_idx").on(t.requestId)],
);

export const traceSpans = pgTable(
  "trace_spans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    namespace: text("namespace").notNull(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => requests.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    name: text("name").notNull(),
    startOffsetMs: integer("start_offset_ms").notNull(),
    durationMs: integer("duration_ms").notNull(),
    attributes: jsonb("attributes").notNull().default({}).$type<SpanAttributes>(),
  },
  (t) => [index("trace_spans_request_idx").on(t.requestId, t.seq)],
);

export const feedback = pgTable("feedback", {
  id: text("id").primaryKey(),
  namespace: text("namespace").notNull(),
  requestId: uuid("request_id")
    .notNull()
    .references(() => requests.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => appUsers.id, { onDelete: "set null" }),
  label: text("label").notNull(),
  comment: text("comment"),
  dataset: text("dataset").notNull().default("live"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const quotaUsage = pgTable(
  "quota_usage",
  {
    namespace: text("namespace").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    usageDate: date("usage_date").notNull(),
    used: integer("used").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.namespace, t.userId, t.usageDate] })],
);

export const requestAdmissions = pgTable(
  "request_admissions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    namespace: text("namespace").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    requestId: uuid("request_id").references(() => requests.id, { onDelete: "cascade" }),
    admittedAt: timestamp("admitted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("request_admissions_window_idx").on(t.namespace, t.userId, t.admittedAt)],
);

export const budgetLedger = pgTable(
  "budget_ledger",
  {
    namespace: text("namespace").notNull(),
    period: text("period").notNull(),
    limitThb: numeric("limit_thb", { precision: 12, scale: 2 }).notNull(),
    committedThb: numeric("committed_thb", { precision: 12, scale: 4 }).notNull().default("0"),
    reservedThb: numeric("reserved_thb", { precision: 12, scale: 4 }).notNull().default("0"),
    alerted80At: timestamp("alerted_80_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.namespace, t.period] })],
);

export const budgetReservations = pgTable("budget_reservations", {
  id: uuid("id").primaryKey().defaultRandom(),
  namespace: text("namespace").notNull(),
  period: text("period").notNull(),
  requestId: uuid("request_id")
    .notNull()
    .references(() => requests.id, { onDelete: "cascade" }),
  amountThb: numeric("amount_thb", { precision: 12, scale: 4 }).notNull(),
  settledThb: numeric("settled_thb", { precision: 12, scale: 4 }).notNull().default("0"),
  status: text("status").notNull().default("reserved"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  settledAt: timestamp("settled_at", { withTimezone: true }),
});

export const budgetEvents = pgTable("budget_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  namespace: text("namespace").notNull(),
  period: text("period").notNull(),
  kind: text("kind").notNull(),
  amountThb: numeric("amount_thb", { precision: 12, scale: 4 }).notNull().default("0"),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const incidents = pgTable("incidents", {
  id: uuid("id").primaryKey().defaultRandom(),
  namespace: text("namespace").notNull(),
  enabled: boolean("enabled").notNull(),
  topic: text("topic"),
  message: text("message"),
  owner: text("owner"),
  nextUpdateAt: timestamp("next_update_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => appUsers.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const evaluationRuns = pgTable("evaluation_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  namespace: text("namespace").notNull(),
  suite: text("suite").notNull(),
  mode: text("mode").notNull(),
  targetDocument: text("target_document"),
  targetIndex: text("target_index"),
  appVersion: text("app_version").notNull(),
  documentVersion: text("document_version"),
  indexVersion: text("index_version"),
  modelId: text("model_id"),
  commitSha: text("commit_sha"),
  status: text("status").notNull().default("running"),
  total: integer("total"),
  passed: integer("passed"),
  criticalPassed: integer("critical_passed"),
  criticalTotal: integer("critical_total"),
  summary: jsonb("summary").notNull().default({}).$type<Record<string, unknown>>(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const evaluationResults = pgTable("evaluation_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id")
    .notNull()
    .references(() => evaluationRuns.id, { onDelete: "cascade" }),
  caseId: text("case_id").notNull(),
  question: text("question").notNull(),
  expectedStatus: text("expected_status").notNull(),
  expectedSection: text("expected_section"),
  status: text("status").notNull(),
  answer: text("answer"),
  citations: jsonb("citations").notNull().default([]).$type<Citation[]>(),
  retrieved: jsonb("retrieved").notNull().default([]).$type<RetrievalHit[]>(),
  latencyMs: integer("latency_ms"),
  passed: boolean("passed").notNull(),
  failures: jsonb("failures").notNull().default([]).$type<string[]>(),
  actual: jsonb("actual").notNull().default({}).$type<Record<string, unknown>>(),
});

export const releases = pgTable("releases", {
  id: uuid("id").primaryKey().defaultRandom(),
  namespace: text("namespace").notNull(),
  environment: text("environment").notNull(),
  appVersion: text("app_version").notNull(),
  configVersion: text("config_version").notNull(),
  documentVersion: text("document_version"),
  indexVersion: text("index_version"),
  commitSha: text("commit_sha"),
  testSummary: jsonb("test_summary").notNull().default({}).$type<Record<string, unknown>>(),
  owner: text("owner"),
  recoveryInstructions: text("recovery_instructions"),
  releasedAt: timestamp("released_at", { withTimezone: true }).notNull().defaultNow(),
});

export const resetAudit = pgTable("reset_audit", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  namespace: text("namespace").notNull(),
  scenario: text("scenario").notNull(),
  actor: text("actor").notNull(),
  outcome: text("outcome").notNull().default("applied"),
  details: jsonb("details").notNull().default({}).$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contactRequests = pgTable("contact_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  namespace: text("namespace").notNull(),
  reference: text("reference").notNull().unique(),
  displayName: text("display_name").notNull(),
  accessDate: date("access_date"),
  attendees: integer("attendees"),
  note: text("note"),
  fictional: boolean("fictional").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

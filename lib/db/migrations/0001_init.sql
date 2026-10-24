-- 0001_init.sql
-- Initial schema for ถามคู่มือ — ศูนย์บริการตัวอย่าง.
-- Every mutable teaching table carries `namespace` (DATA_NAMESPACE).
-- Applied by tools/db-migrate.ts, which records each file in schema_migrations.

create extension if not exists pgcrypto;

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  namespace text not null,
  username text not null,
  display_name text not null,
  role text not null check (role in ('admin', 'pilot', 'outsider')),
  password_hash text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists app_users_namespace_username_key
  on app_users (namespace, username);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  namespace text not null,
  user_id uuid not null references app_users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  user_agent text
);
create index if not exists sessions_user_idx on sessions (user_id);

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  namespace text not null,
  doc_key text not null,
  title text not null,
  effective_date date not null,
  fictional boolean not null default true,
  body jsonb not null,
  content_hash text not null,
  registered_at timestamptz not null default now()
);
create unique index if not exists documents_namespace_doc_key_key
  on documents (namespace, doc_key);

create table if not exists chunks (
  id uuid primary key default gen_random_uuid(),
  namespace text not null,
  document_id uuid not null references documents (id) on delete cascade,
  section_id text not null,
  title text not null,
  text text not null,
  ordinal integer not null
);
create unique index if not exists chunks_document_section_key
  on chunks (document_id, section_id);

-- Indexes are immutable: rows are inserted once and never updated.
create table if not exists doc_indexes (
  id uuid primary key default gen_random_uuid(),
  namespace text not null,
  index_key text not null,
  document_id uuid not null references documents (id),
  doc_key text not null,
  entries jsonb not null,
  alias_map jsonb not null,
  content_hash text not null,
  chunk_count integer not null,
  built_at timestamptz not null default now()
);
create unique index if not exists doc_indexes_namespace_index_key_key
  on doc_indexes (namespace, index_key);

-- The active index pointer lives outside deployment artifacts, on purpose.
create table if not exists active_state (
  namespace text primary key,
  active_index_key text,
  mode text not null default 'normal'
    check (mode in ('normal', 'stale_index', 'incident', 'provider_failure')),
  config_version text not null default 'cfg-1',
  incident_enabled boolean not null default false,
  incident_topic text,
  incident_message text,
  incident_owner text,
  incident_next_update timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists requests (
  id uuid primary key default gen_random_uuid(),
  namespace text not null,
  request_id text not null,
  user_id uuid references app_users (id) on delete set null,
  actor_ref text not null,
  dataset text not null default 'live',
  question text not null,
  question_id text,
  idempotency_key text,
  status text not null,
  answer text,
  citations jsonb not null default '[]'::jsonb,
  retrieved jsonb not null default '[]'::jsonb,
  mode text not null,
  environment text not null default 'local',
  app_version text not null,
  prompt_version text not null,
  document_version text,
  index_version text,
  config_version text not null default 'cfg-1',
  model_id text,
  pricing_version text,
  latency_ms integer,
  explanation text,
  next_action text,
  error_code text,
  retry_at timestamptz,
  admitted_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists requests_namespace_request_id_key
  on requests (namespace, request_id);
create unique index if not exists requests_idempotency_key
  on requests (namespace, user_id, idempotency_key);
create index if not exists requests_namespace_created_at_idx
  on requests (namespace, created_at);
create index if not exists requests_namespace_dataset_idx
  on requests (namespace, dataset);

create table if not exists model_calls (
  id uuid primary key default gen_random_uuid(),
  namespace text not null,
  request_id uuid not null references requests (id) on delete cascade,
  provider text not null,
  model_id text not null,
  attempt integer not null default 1,
  status text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_thb numeric(12, 4) not null default 0,
  latency_ms integer,
  usage_unknown boolean not null default false,
  error_code text,
  created_at timestamptz not null default now()
);
create index if not exists model_calls_request_idx on model_calls (request_id);

create table if not exists trace_spans (
  id uuid primary key default gen_random_uuid(),
  namespace text not null,
  request_id uuid not null references requests (id) on delete cascade,
  seq integer not null,
  name text not null,
  start_offset_ms integer not null,
  duration_ms integer not null,
  attributes jsonb not null default '{}'::jsonb
);
create index if not exists trace_spans_request_idx on trace_spans (request_id, seq);

create table if not exists feedback (
  id text primary key,
  namespace text not null,
  request_id uuid not null references requests (id) on delete cascade,
  user_id uuid references app_users (id) on delete set null,
  label text not null check (label in ('helpful', 'needs_correction')),
  comment text,
  dataset text not null default 'live',
  created_at timestamptz not null default now()
);
create index if not exists feedback_namespace_idx on feedback (namespace, created_at);

create table if not exists quota_usage (
  namespace text not null,
  user_id uuid not null references app_users (id) on delete cascade,
  usage_date date not null,
  used integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (namespace, user_id, usage_date)
);

-- One row per admitted request: the rolling-window rate limit reads this table.
create table if not exists request_admissions (
  id bigserial primary key,
  namespace text not null,
  user_id uuid not null references app_users (id) on delete cascade,
  request_id uuid references requests (id) on delete cascade,
  admitted_at timestamptz not null default now()
);
create index if not exists request_admissions_window_idx
  on request_admissions (namespace, user_id, admitted_at);

create table if not exists budget_ledger (
  namespace text not null,
  period text not null,
  limit_thb numeric(12, 2) not null,
  committed_thb numeric(12, 4) not null default 0,
  reserved_thb numeric(12, 4) not null default 0,
  alerted_80_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (namespace, period)
);

create table if not exists budget_reservations (
  id uuid primary key default gen_random_uuid(),
  namespace text not null,
  period text not null,
  request_id uuid not null references requests (id) on delete cascade,
  amount_thb numeric(12, 4) not null,
  settled_thb numeric(12, 4) not null default 0,
  status text not null default 'reserved'
    check (status in ('reserved', 'settled', 'released')),
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
create index if not exists budget_reservations_request_idx on budget_reservations (request_id);

create table if not exists budget_events (
  id uuid primary key default gen_random_uuid(),
  namespace text not null,
  period text not null,
  kind text not null,
  amount_thb numeric(12, 4) not null default 0,
  message text not null,
  created_at timestamptz not null default now()
);
create index if not exists budget_events_namespace_idx on budget_events (namespace, created_at);

create table if not exists incidents (
  id uuid primary key default gen_random_uuid(),
  namespace text not null,
  enabled boolean not null,
  topic text,
  message text,
  owner text,
  next_update_at timestamptz,
  created_by uuid references app_users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists incidents_namespace_idx on incidents (namespace, created_at);

create table if not exists evaluation_runs (
  id uuid primary key default gen_random_uuid(),
  namespace text not null,
  suite text not null,
  mode text not null,
  target_document text,
  target_index text,
  app_version text not null,
  document_version text,
  index_version text,
  model_id text,
  commit_sha text,
  status text not null default 'running',
  total integer,
  passed integer,
  critical_passed integer,
  critical_total integer,
  summary jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists evaluation_runs_namespace_idx on evaluation_runs (namespace, started_at);

create table if not exists evaluation_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references evaluation_runs (id) on delete cascade,
  case_id text not null,
  question text not null,
  expected_status text not null,
  expected_section text,
  status text not null,
  answer text,
  citations jsonb not null default '[]'::jsonb,
  retrieved jsonb not null default '[]'::jsonb,
  latency_ms integer,
  passed boolean not null,
  failures jsonb not null default '[]'::jsonb,
  actual jsonb not null default '{}'::jsonb
);
create index if not exists evaluation_results_run_idx on evaluation_results (run_id);

create table if not exists releases (
  id uuid primary key default gen_random_uuid(),
  namespace text not null,
  environment text not null,
  app_version text not null,
  config_version text not null,
  document_version text,
  index_version text,
  commit_sha text,
  test_summary jsonb not null default '{}'::jsonb,
  owner text,
  recovery_instructions text,
  released_at timestamptz not null default now()
);
create index if not exists releases_namespace_idx on releases (namespace, environment, released_at);

create table if not exists reset_audit (
  id bigserial primary key,
  namespace text not null,
  scenario text not null,
  actor text not null,
  outcome text not null default 'applied',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists reset_audit_namespace_idx on reset_audit (namespace, created_at);

-- Section 3.2's internal meeting-room request form. Fictional fields only.
create table if not exists contact_requests (
  id uuid primary key default gen_random_uuid(),
  namespace text not null,
  reference text not null unique,
  display_name text not null,
  access_date date,
  attendees integer,
  note text,
  fictional boolean not null default true,
  created_at timestamptz not null default now()
);

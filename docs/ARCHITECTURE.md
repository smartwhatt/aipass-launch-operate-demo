# Architecture

One Next.js 16 App Router project on the Node.js runtime. PostgreSQL holds all
durable state. The application has five layers.

## Request lifecycle

```text
POST /api/questions
  authorize            session cookie -> role check (pilot or admin)
  validate             trimmed 1..2000 code points
  admit                ONE transaction: idempotency, rate, quota, budget reserve
  retrieve             active index -> at most three sections
  incident pause       stop opening-hours answers while the incident is on
  provider             fixture adapter or Gemini, at most one retry
  guard                citation allowlist, fee-not-stated rule, URL and phone scrub
  persist              request row, model-call rows, trace spans
  settle               charge actual usage, release the unused reservation
```

The request row is written at admission. A provider failure still has a trace,
still counts against the daily quota, and still releases its reservation.

## Data model

| Table | Purpose |
|---|---|
| `app_users`, `sessions` | three roles, hashed passwords, signed HttpOnly cookies |
| `documents`, `chunks` | versioned handbook copies imported from `fixtures/documents` |
| `doc_indexes` | immutable index rows: n-gram vectors, alias map, content hash |
| `active_state` | the active index pointer, mode, config version, incident fields |
| `requests` | one row per user request, with a configuration snapshot |
| `model_calls` | one row per provider attempt; retries add rows, not requests |
| `trace_spans` | timed phases with attributes, for the trace viewer |
| `quota_usage`, `request_admissions` | daily quota and rolling-window rate limit |
| `budget_ledger`, `budget_reservations`, `budget_events` | monthly THB budget and the 80% alert |
| `feedback`, `incidents`, `contact_requests` | answer quality, incident banner, meeting-room form |
| `evaluation_runs`, `evaluation_results` | expected versus actual results |
| `releases`, `reset_audit` | app/config pairs and the reset log |

Every mutable teaching table carries `namespace` from `DATA_NAMESPACE`.

## Retrieval

Thai has no spaces between words, so the index stores character n-grams of
length 2, 3, and 4 for each section, plus the Thai query aliases that resolve to
the section's terms. A query scores each section with:

```text
score = (0.6 * alias coverage + 0.4 * cosine(tf-idf n-grams)) / weight total
```

Sections below `MIN_SCORE` are not evidence. The caller then returns
`insufficient_info` and cites nothing. An out-of-scope topic with no matched
handbook concept returns no hits.

The index is built from document text only. It stores no question IDs and no
evaluation strings. A unit test checks that.

At most three sections are retrieved. The fixture adapter answers from the top
section. The Gemini adapter may cite only retrieved section IDs, and the server
builds every URL from the known section.

## Controls

Admission runs in one transaction under `pg_advisory_xact_lock` for the user:

1. A duplicate idempotency key returns the stored request, with no new call.
2. A rolling 60-second window rejects the sixth question with `rate_limited`.
3. The daily row in `quota_usage` rejects the 21st question with
   `quota_exceeded`. The reset time is the next 00:00 Asia/Bangkok.
4. The budget ledger reserves the worst-case cost of the request. Pending
   reservations count against the limit.

After the answer, `settleReservation` charges the actual cost and releases the
rest. Crossing 80% of the monthly limit writes one `budget_events` row.

Unknown model pricing stops new live work. The admin screens show that state
instead of a zero cost.

## Providers

| Adapter | Use | Notes |
|---|---|---|
| `FixtureProvider` | teaching and tests | deterministic, answers from the active index text, labelled on screen |
| `GeminiProvider` | live | official `@google/genai` SDK, prompt-1, JSON response, 20 s timeout |

Prompt-1 tells the model to use retrieved evidence only, to treat the question
and the documents as data, and to return section IDs rather than URLs.

Teaching prices come from `fixtures/cost-cases.json`. Live prices come from
`lib/providers/pricing.ts`. The two never mix.

## Telemetry

The dashboard reads two panels from one filter (date range, environment,
namespace, dataset, mode):

- **Service**: requests, errors, error rate, p50/p95/p99 by nearest rank, model
  calls, cost split by mode, unknown-usage count.
- **Quality**: `insufficient_info` count and rate, feedback count, needs-correction
  count and rate.

The fixed historical dataset has `dataset = 'historical-pilot'` and dates
2026-10-12 to 2026-10-16. Rehearsal traffic has `dataset = 'live'` and today's
date. A rehearsal cannot move the recorded numbers.

## Deliberate limits

- No vector database. Five sections and Thai n-grams are enough for the lesson.
- No email delivery. The 80% alert is an admin event.
- No automatic model switching on budget exhaustion or outage.
- Langfuse export is out of scope. The built-in trace viewer is the required
  evidence.
- The workbook is a teaching estimate. It does not enforce a real API budget.

# Implementation report

Status: implementation complete for every local gate. Hosting and live model
gates are blocked. See "Remaining work" for the exact conditions.

## Delivered artifacts

| Item | Value |
|---|---|
| Repository | https://github.com/smartwhatt/aipass-launch-operate-demo |
| Application tags | `app-v1.0.0` (EP1 baseline), `app-v1.0.1` (corrected) |
| Preview URL | none. Vercel access is blocked. |
| Production sandbox URL | none. Vercel access is blocked. |
| Workbook | `public/downloads/AIPASS_AI_App_Cost_Calculator_v1.xlsx` |
| Workbook bytes and SHA-256 | 17,020 bytes · `68db1fbfea331a41dcaee6aac6cef39117386ff4b5809edfe5972ddb1a11d86b` |
| Node.js | 24.22.1 |
| npm | 11.19.1 |
| Next.js | 16.4.3 |
| React | 19.3.1 |
| TypeScript | 5.9.3 |
| PostgreSQL | 17.11 |
| Drizzle ORM | 0.45.4 (driver `postgres` 3.4.9) |
| Gemini SDK | `@google/genai` 2.31.0 |
| Model ID | `gemini-3.5-flash-lite` (not access-checked; no key) |
| Prompt version | `prompt-1` |
| Pricing version | `pricing-2026-10-24` (live price unverified) |

## Checks

Each command ran in the repository root on 24 October 2026 (Asia/Bangkok).

| Check | Command | Exit | Evidence |
|---|---|---|---|
| Handoff validator | `python3 tools/validate_handoff.py` | 0 | source hashes and 40 slots pass |
| Lint | `npm run lint` | 0 | clean |
| Type check | `npm run typecheck` | 0 | clean |
| Unit tests | `npm test` | 0 | 52 passed |
| Integration tests | `npm run test:integration` | 0 | 33 passed |
| End-to-end tests | `npm run test:e2e` | 0 | 10 passed |
| Fixture evaluation, docs-v2 | `npm run eval -- --mode fixture` | 0 | 10/10, critical 5/5, gate PASS |
| Fixture evaluation, docs-v1 | `npm run eval -- --mode fixture --target docs-v1` | 0 | 10/10, critical 5/5, gate PASS |
| Live evaluation | `npm run eval -- --mode live` | 2 | **BLOCKED** — price unverified, no key |
| Workbook formulas | `npm run calculator:check` | 0 | 473 assertions, 0 failed |
| Workbook build | `npm run calculator:build` | 0 | same SHA on two builds |
| Production build | `npm run build` | 0 | 27 dynamic routes plus the proxy |
| Release gate | `npm run release:check` | 0 | 12/12 checks |
| Distribution ZIP | `npm run release:zip` | 0 | `release/SHA256SUMS` |
| Database migrations | `npm run db:migrate` | 0 | 1 migration applied |
| Demo seed | `npm run demo:seed` | 0 | documents, index-v1, release row |
| Scenario resets | `npm run demo:reset -- --scenario <id>` | 0 | all nine scenarios applied twice |
| Live model access | not run | — | **BLOCKED** — no key |

## What the tests actually prove

- **Authorization**: the outsider and the anonymous caller get 401/403 from the
  route handlers themselves, not from hidden buttons. The pilot cannot read
  traces or reset data.
- **Concurrency**: two parallel questions with one quota slot left produce
  exactly one answer and one `quota_exceeded`. Two parallel questions with
  THB 0.28 of budget left produce exactly one answer and one `budget_exceeded`.
- **Idempotency**: the same key twice creates one request row and one model-call
  sequence.
- **Validation**: blank and 2,001-character input fail with no request row and
  no model call.
- **Historical data**: the dashboard reports 200 requests, 6 errors, 40
  `insufficient_info`, p95 9,000 ms by nearest rank, 206 calls, THB 28.84, 24
  feedback rows, 8 needs-correction. A later rehearsal does not move those
  numbers.
- **Stale index**: registering `docs-v2` leaves `index-v1` active. Activating
  `index-v2` changes new answers from 09:00–16:00 to 08:30–16:30 and leaves the
  recorded `DEMO-R042` trace unchanged.
- **Workbook**: the real formulas recalculate to 1,890 / 15,750 / 2,044 / 350
  and the doubled exchange rate case. Cached values, protection without a
  password, and data validation are all asserted.

## What changed between the two app tags

`app-v1.0.1` adds one reviewable application change: a handbook-freshness notice
on the home page. The page compares the document behind the active index with the
newest registered document. When they differ, it names both versions and links to
the newest section 2.1. The pilot sees the warning before an old answer misleads
them, and the admin gets a link to the index controls. The rule lives in
`lib/state/freshness.ts`, is unit-tested, and is covered by a Playwright test
with a screenshot. Endpoint behavior and stable IDs are unchanged.

## Video coverage

[docs/VIDEO_RESULTS.md](VIDEO_RESULTS.md) gives one result for each of the 40
slots: 20 PASS, 6 PARTIAL, 14 BLOCKED.

## Remaining work

**Blocker 1: Vercel access**

- Condition: the Vercel CLI reports `The specified token is not valid`.
- Affected gates: EP1 slots 6–10, EP3 slots 10 and 13, all hosted URLs, the
  Preview/Production split, and the promotion and rollback rehearsal.
- Work completed independently: the app builds, runs, and passes every local
  check. The Vercel settings, environment variables, and migration steps are
  written in `docs/SETUP.md`.
- Owner action: supply a valid Vercel token or connect the repository in the
  Vercel dashboard. Then repeat the runbook steps and record the URLs.

**Blocker 2: live Gemini access and prices**

- Condition: no `GEMINI_API_KEY`, and the model price is not verified.
- Affected gates: the live evaluation, live-mode answers, and live cost
  accounting.
- Work completed independently: the adapter, prompt-1, retry, token caps,
  reservation, and usage accounting are implemented and unit-tested. The
  blocked run exits 2 and says it is not a pass.
- Owner action: add the key, check the price page, set the price entry to
  verified, set `LIVE_PRICING_CONFIRMED=true`, and run the live evaluation.

**Blocker 3: the CI workflow file cannot be pushed**

- Condition: the GitHub OAuth token has no `workflow` scope, so GitHub rejects
  any push that creates `.github/workflows/ci.yml`.
- Affected gates: automated CI.
- Work completed independently: the workflow is committed as `docs/ci/ci.yml`,
  validated as YAML, and covers the required jobs. The verify job runs lint,
  type check, unit tests, integration tests, the fixture evaluation, the
  workbook check, the build, and the release gate. The live job is manual and
  reports a blocked gate without a key.
- Owner action: copy `docs/ci/ci.yml` to `.github/workflows/ci.yml` from an
  account or token with the `workflow` scope, then push.

**Not a blocker, but required before filming**

- Prepare the concept graphics for EP1 slots 2–4, EP2 slots 2, 7, 8, and 13, and
  EP3 slot 14. The app does not replace them.
- Rehearse with the AiPASS account for EP1 slot 5, EP2 slot 3, and EP3 slot 8.

## Recording review

- **EP2 fixed cost**: the narration calls THB 350 a subscription. The workbook
  and the app call it a fixed monthly cost of THB 300 hosting plus THB 50 of the
  domain. The number is unchanged. See `docs/SOURCE_CONFLICTS.md`.
- **Vercel menu names**: not checked against the current console, because there
  is no console access.
- **AiPASS account**: not checked.
- **Rehearsal duration**: not measured. The script time slots remain estimates.
- **App tags**: EP1 and EP2 need `app-v1.0.0`. EP3 slots 11–13 need
  `app-v1.0.1`. A scenario reset warns when the running version does not match.

## Published tags

| Tag | Commit | Date |
|---|---|---|
| `handoff-v1.0.0` | `1659a57` | 24 October 2026 |
| `app-v1.0.0` | filled from the published tag | 24 October 2026 |
| `app-v1.0.1` | filled from the published tag | 24 October 2026 |

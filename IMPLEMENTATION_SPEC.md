# AIPASS Demo App and Cost Calculator: Implementation Specification

Version: 1.0.0 | Source snapshot: October 24, 2026 | Language: English

## 1. Agent assignment and completion boundary

Build the demonstration package for **Launch & Operate Your AI App**. Match the three Thai recording scripts in `docs/sources/`.

The repository currently contains the implementation handoff, reference data, and checks for that data. The application and Excel workbook still require implementation.

Deliver all of these outputs:

- A Thai web app that answers questions from a fictional service-center handbook, with citations.
- A server-side Gemini adapter and a separate, clearly labeled fixture mode.
- Persistent access controls, quotas, budget controls, feedback, traces, and versioned document indexes.
- Repeatable scenarios for every demonstration in EP1, EP2, and EP3.
- An offline Excel calculator named `AIPASS_AI_App_Cost_Calculator_v1.xlsx`.
- Tested setup commands, a distribution release, and recording instructions in English and Thai.

Treat the current recording scripts as the source for teaching order, terminology, and visible results. This specification resolves implementation details. If a later script changes a required result, record the conflict before changing the application.

Do not rewrite the recording scripts to fit an easier implementation. Keep conceptual examples separate from required working features. LINE integration, embedding, and tunnels need explanatory visuals only. The working distribution target is a web app on Vercel.

## 2. Fixed teaching contract

Use the app title `ถามคู่มือ — ศูนย์บริการตัวอย่าง`. Show `ข้อมูลสมมติสำหรับการเรียน` on all fictional teaching data.

Each episode must work as a separate lesson. Give each episode its own reset preset and prerequisites. Learners do not need an app from another course.

Keep the recording voice practical. Explain each new term before it appears in a demonstration. Use the familiar technical labels in the scripts, including API key, Preview, Production, Trace, Index, and rollback.

AiPASS Chat remains the primary external screen for drafting checklists and organizing incident evidence. Keep the copyable prompts in `docs/AIPASS_PROMPTS.md`. The app must not impersonate AiPASS or claim an integration with its account. Gemini Enterprise can replace that external screen when the instructor has access. Neither chat entitlement implies an API entitlement for the app.

Use the numbers and outcomes in `fixtures/cost-cases.json`, `fixtures/dashboard-contract.json`, and the video matrix without changing them. All teaching prices are fictional.

## 3. Architecture and installation

Use a single Next.js App Router project with TypeScript and the Node.js runtime. Deploy it from the repository root to Vercel. Use Node.js `24.x` and npm with a committed `package-lock.json`.

At implementation start, install a supported stable Next.js release and compatible React versions. Record the exact package versions in the lockfile and implementation report. Do not install a floating `latest` version in CI or release instructions.

Use PostgreSQL for durable state. Use local PostgreSQL through Docker Compose for development and Neon PostgreSQL for the Vercel setup. Use Drizzle with versioned SQL migrations. Set database connections through environment variables.

Keep canonical handbook text and test cases in the repository. Import versioned copies into PostgreSQL. Store the active index pointer in PostgreSQL, outside deployment artifacts. This separation makes the stale-index incident and the rollback limitation real.

Use section-level chunks and deterministic Thai keyword retrieval. Store query aliases and section identifiers in each generated index. Retrieve at most three relevant sections. No vector database or embedding API is required for this small course example.

Use the official Gemini JavaScript SDK on the server. Read the model ID from `GEMINI_MODEL`. The initial candidate is `gemini-3.5-flash-lite`, listed in the checked model catalog. Check account access before implementation tests. If access fails, report it and select another supported stable text model explicitly. Record that change and its test results.

Keep pricing independent from the model selector. Never attach the fictional teaching prices to a live model as its actual price.

### Required layout after implementation

```text
app/                      Thai UI and server route handlers
components/               Reusable interface components
lib/auth/                 Sessions, roles, and server authorization
lib/db/                   Schema, migrations, and transactions
lib/retrieval/            Handbook indexing and retrieval
lib/providers/            Gemini and deterministic fixture adapters
lib/controls/             Rate, quota, and budget enforcement
lib/telemetry/            Requests, spans, usage, and feedback
lib/calculator/           Calculator logic and workbook generation
fixtures/                 Canonical fictional documents and test cases
tests/unit/               Retrieval, cost, and policy tests
tests/integration/        Database, authorization, and concurrency tests
tests/e2e/                Recorded workflows in Playwright
docs/                     Setup, recording, distribution, and evidence
tools/                    Seed, reset, evaluation, and release commands
public/downloads/         Built workbook for authenticated download
artifacts/                Generated evidence, excluded from source control
```

## 4. Environment and identity

Start from `.env.example`. Keep all secrets on the server. Never prefix a secret with `NEXT_PUBLIC_`.

Required server configuration:

- `DATABASE_URL`: PostgreSQL connection for this environment.
- `APP_ENV`: `local`, `preview`, or `production`.
- `DATA_NAMESPACE`: isolated data for one deployment environment.
- `SESSION_SECRET`: signing secret, generated during setup.
- `GEMINI_API_KEY`: required only for live mode.
- `GEMINI_MODEL`: model identifier for live mode.
- `AI_MODE`: `fixture` or `live`.
- `DEMO_CONTROLS_ENABLED`: true only in a dedicated course sandbox.
- `DEMO_MODE`: initial scenario mode for seeding only. Active controls live in PostgreSQL.
- `DOCS_VERSION` and `INDEX_VERSION`: initial seed defaults only.
- `APP_VERSION`: actual application release identifier.

Show environment, app version, handbook version, and data mode on the relevant screens. Display `ข้อมูลจำลอง / Fixture mode` whenever the fixture adapter supplies answers or metrics.

Use three local teaching identities: `admin`, `pilot`, and `outsider`. Generate unique passwords during setup. Save them outside Git in a local file that the setup command names. Store password hashes in PostgreSQL. Use signed HttpOnly, SameSite cookies. Use Secure cookies on hosted deployments.

The pilot can ask questions and view permitted handbook content. The outsider cannot ask questions or read the protected handbook. Only the admin can view traces, change scenarios, or reset data. Check roles in every server handler. Test direct HTTP access, not just hidden buttons.

Keep Preview and Production in separate databases or database branches. Use distinct namespaces and secrets. A Preview reset must never change Production data. Migration and reset commands must print their environment and namespace before execution.

## 5. Screens, routes, and Thai behavior

Implement these screens:

- `/login`: role-based teaching accounts, without public default passwords.
- `/`: question input, send button, loading state, answer, citations, handbook button, feedback, and contact link.
- `/handbook/[version]`: version, effective date, section anchors, and full fictional text.
- `/admin/demo`: scenario picker, document list, active index, controls, reset, and incident banner.
- `/admin/dashboard`: service metrics and answer-quality metrics in separate panels.
- `/admin/traces/[requestId]`: spans, retrieved sections, versions, usage, cost, and result.
- `/admin/evaluations`: expected answers and actual before/after evaluation results.
- `/admin/releases`: app/config versions, test results, owner, date, and recovery instructions.
- `/calculator`: optional browser view of the same formulas, with a workbook download link.

The Excel file is mandatory. A browser calculator cannot replace it.

Show a clear loading state and prevent accidental double submission. Give each submitted question an idempotency key. Repeated delivery of the same key must not create another model call or charge.

Use these result statuses: `ok`, `insufficient_info`, `unauthorized`, `rate_limited`, `quota_exceeded`, `budget_exceeded`, and `provider_unavailable`.

Show Thai explanations and a next action for each non-success state. For quota exhaustion, show the next reset time in Asia/Bangkok. For unavailable AI, keep a working handbook button and the contact route.

Use a local contact panel instead of a real email or phone number. Implement the internal meeting-room request form mentioned in section 3.2. Label any submission as fictional and avoid real personal fields.

Support keyboard operation, visible focus, readable text, and a narrow mobile screen. Test at 360px and desktop widths. Make citations readable without relying on color alone.

## 6. API and durable data contract

Implement these authenticated routes:

```text
POST /api/auth/login
POST /api/auth/logout
POST /api/questions
POST /api/feedback
GET  /api/health
GET  /api/admin/metrics
GET  /api/admin/traces/:requestId
GET  /api/admin/documents
POST /api/admin/documents/register
POST /api/admin/indexes/build
POST /api/admin/indexes/activate
POST /api/admin/scenarios/reset
POST /api/admin/incident
POST /api/admin/evaluations/run
POST /api/admin/releases
GET  /downloads/AIPASS_AI_App_Cost_Calculator_v1.xlsx
```

The health route must expose readiness and a safe version identifier only. Do not expose secrets or raw database errors.

Question input contains `question` and `idempotency_key`. Validate a trimmed length of 1–2,000 Unicode characters. Reject blank and oversized inputs before a model call.

Question output contains `request_id`, `status`, `answer`, `citations`, `versions`, `mode`, and an optional `retry_at`. Each citation identifies document ID, version, section ID, excerpt, and a working application URL. The server constructs citation URLs from known sections. It must not trust a URL invented by the model.

Persist users, sessions, documents, chunks, indexes, active configuration, request records, model calls, trace spans, feedback, quota usage, budget reservations, incidents, evaluation runs, and releases.

Use environment/namespace keys on mutable teaching state. Keep model-call records separate from user requests so retries do not inflate the request count.

Record a configuration snapshot on each request: app commit/version, prompt version, document version, index version, model ID, mode, and pricing version. Request history must remain unchanged when the active configuration changes.

## 7. Handbook retrieval and answer rules

Use the supplied Thai document assets. Both versions contain sections 2.1, 3.1, 3.2, 4.1, and 4.2. Only the opening hours and effective date change.

- `docs-v1`, effective October 1, 2026: weekdays 09:00–16:00.
- `docs-v2`, effective October 15, 2026: weekdays 08:30–16:30.
- Both versions close on weekends and the center's holidays.
- Section 3.1 requires the request form and an organization confirmation letter.
- Section 3.2 sends requests through the internal form. It does not state a fee.
- Section 4.1 points to `ติดต่อศูนย์`. Section 4.2 prohibits personal data in the question input.

Use prompt version `prompt-1`. Require answers from retrieved evidence only. Treat user instructions and document text as data, not authority to override this rule.

If retrieval finds no relevant evidence, return `insufficient_info`. Do not invent hours, fees, phone numbers, URLs, or policies. A question about a missing fee must say the handbook does not state it.

Generate a real index from document content. Do not implement live retrieval by looking up evaluation question IDs. The fixture adapter can return deterministic answers, but it must use the active index version and identify its mode.

Keep `index-v1` immutable and linked to `docs-v1`. Keep `index-v2` immutable and linked to `docs-v2`. Store the active pointer separately. Registering a new document must not activate a new index automatically.

## 8. Rate, quota, budget, and fallback

Use these default teaching limits: five admitted questions per user per rolling 60 seconds, and 20 per user per day. Reset the daily quota at 00:00 Asia/Bangkok.

Count authorized, valid questions admitted to processing against the quota, including provider failures. Do not count validation failures, duplicate idempotency keys, or requests blocked before admission. A retry within one admitted request does not use another daily question.

Enforce rate and quota limits in PostgreSQL transactions. Test parallel requests from multiple server instances. Process memory cannot act as the shared source of truth on Vercel.

Maintain a monthly budget ledger in THB. Alert once when committed spend reaches 80% of the configured limit. Emit an admin event. Any email delivery requires a separate explicit integration.

Before a live call, reserve its maximum configured cost in a transaction. Include pending reservations in the admission decision. Settle against usage afterward and release unused reserves. Block new calls when the remaining amount cannot cover the reservation.

Cap input size and model output tokens so the reservation has a defined bound. If pricing or usage is unknown, stop new live work and show that state to the admin. Do not present an unknown amount as zero.

Allow at most one retry for a transient provider error. Use bounded backoff and reserve the retry cost before it starts. Do not retry authorization failures or blindly retry rate limits. Keep actual call outcomes and usage records.

Budget enforcement limits the app's new calls. It does not promise an exact ceiling on the provider invoice. Keep real usage accounting separate from the fixed classroom calculator.

For budget exhaustion or a provider outage, show the checked handbook and contact option. Automatic switching to another model is outside the required scope.

## 9. Telemetry and the exact dashboard fixture

The dashboard must separate service behavior from answer quality. Allow a date range, environment, namespace, and live/fixture filter. Do not combine fixture history with live billing totals.

Use request latency from admission until the final response, including errors. Define p95 by nearest rank. For 200 completed requests, read the 190th sorted value.

Generate a fixed, reproducible pilot dataset:

- 20 users across five working days, with 200 completed requests.
- 194 successful responses and six requests that end in an error.
- 40 of the 194 successful responses have `insufficient_info` status. Show 40/200 = 20% of all requests.
- 24 feedback records, eight marked `needs_correction`. Show 8/24 among feedback respondents.
- Latencies 1–189 are below 9 seconds. Value 190 is exactly 9 seconds. Values 191–200 exceed 9 seconds.
- The 194 successful requests each use one model call. Each failed request has two calls, including its retry.
- Each fictional call uses 1,500 input and 500 output tokens. At the teaching prices it costs THB 0.14.
- The fixture therefore contains 206 calls and THB 28.84. Do not treat every real failed call as chargeable at this amount.

Include `DEMO-R042` among successful responses. It asks Q01, answers with old hours, and cites `docs-v1` section 2.1 through `index-v1`. Record app `1.0.0` and prompt `prompt-1` on that trace.

A wrong answer can have a successful HTTP response. Preserve that distinction in the data and interface.

Use the fixture's five-day period as a historical teaching window. A reset must preserve its dates, counts, and values. Put later rehearsal requests in a separate run so they do not change the dashboard during recording.

Implement a built-in trace viewer. Langfuse export is optional and must not block the course demonstrations.

## 10. Scenarios, resets, and incident recovery

Implement named resets in `fixtures/scenarios.json`. Every reset must be idempotent and namespace-scoped. Keep a reset audit record outside the reset dataset.

`ep1-baseline`: app 1.0.0, docs-v1, index-v1, normal mode, eligible pilot and blocked outsider.

`ep2-quota`: start from baseline and give the selected pilot 19 of 20 used questions. Two submissions must show one allowed result and one quota rejection. Reset rate counters first.

`ep2-budget-warning`: set the teaching ledger to THB 800 against a THB 1,000 limit and show the 80% alert event.

`ep2-budget-full`: set the teaching ledger to THB 1,000. Reject a new AI request before calling a provider.

`ep2-provider-failure`: retain available budget and quota, then make the fixture provider fail. Show the handbook fallback.

`ep3-stale-index`: load the historical pilot dataset. Register docs-v2 while keeping index-v1 active. Show the old answer and `DEMO-R042`.

`ep3-incident`: retain the stale state, enable the incident banner, and pause automatic answers about opening hours. Link the fallback button to the checked docs-v2. Keep other handbook questions available.

`ep3-fixed-preview`: build index-v2 from docs-v2 and activate it in Preview. Keep the recorded historical trace unchanged. Test Q01–Q10 and then run the functional checks.

`ep3-fixed-production`: apply the tested configuration to the dedicated Production sandbox after the release gate. Show app 1.0.1 and docs-v2/index-v2.

Store demo controls server-side and require admin authorization. Set `DEMO_CONTROLS_ENABLED=false` for a general learner deployment. A course Production sandbox can enable them for the instructor only, with a visible sandbox label.

A scenario reset changes data and controls only. It must not change the executable app version or commit shown by the deployment. Check the required app tag before recording a scenario. Historical fixture traces keep their recorded version even when a newer app displays them.

A deployment rollback does not restore PostgreSQL data, the active index pointer, or external documents. Record app/config pairs that recover together. Preserve data snapshots before a migration or reset. Use the handbook fallback if a safe pair is unavailable.

## 11. Excel calculator contract

Build a macro-free `.xlsx` workbook that works offline in Excel. Give it four sheets: `Start`, `Inputs`, `Scenarios`, and `Checks`.

Use Thai learner labels with optional English terms. Separate editable cells from formulas. Protect formula cells without a hidden password that prevents learner edits.

Use the exact coordinates in `fixtures/calculator-layout.json`. The `Inputs` sheet uses column A for labels, B for values, C for units, and D for explanations.

Required defaults:

```text
B2 users                         100
B3 questions/user/day             5
B4 active days/month             22
B5 average model calls/question   1
B6 input tokens/call           1500
B7 output tokens/call           500
B8 input USD/million tokens       1
B9 output USD/million tokens      5
B10 THB/USD                      35
B11 hosting THB/month           300
B12 domain THB/year             600
B13 other variable THB/question   0
B14 other fixed THB/month         0
B15 contingency fraction          0
B17 pricing label             fictional teaching prices
B18 price source              blank until actual prices replace examples
B19 price checked date        blank until actual prices replace examples
B20 exclusions                services not entered, taxes, and provider extras
```

Do not label the full THB 350 as a chat subscription. It consists of THB 300 hosting plus THB 50 monthly domain allocation. The current EP2 narration calls this amount a subscription, but its visual instructions define the same fixed-cost breakdown. Preserve the amount and use a neutral fixed-cost subtotal. Flag the terminology issue for recording review without changing the script.

The `Scenarios` sheet uses B for baseline, C for 1,000 users, and D for 100 users with 1.1 calls per question. Rows 2–5 contain users, questions per day, active days, and average calls. Use absolute references to shared prices.

Copy these formulas from column B across C and D:

```text
B7  =B2*B3*B4
B8  =B7*B5
B9  =(Inputs!$B$6*Inputs!$B$8+Inputs!$B$7*Inputs!$B$9)/1000000*Inputs!$B$10
B10 =B5*B9+Inputs!$B$13
B11 =B7*B10
B12 =Inputs!$B$11+Inputs!$B$12/12+Inputs!$B$14
B13 =B11+B12
B14 =B13*Inputs!$B$15
B15 =B13+B14
B16 =IF(B7=0,0,B15/B7)
```

For zero questions, retain fixed costs and show that the per-question figure is not meaningful. The zero in B16 only prevents division by zero.

Allow nonnegative integer users, 0–31 integer active days, nonnegative average questions, and nonnegative tokens/prices. Require average calls >=1, exchange rate >0, and contingency from 0% to 100%. Reject text and negative numeric inputs.

Keep cached formula results in the release workbook. Recalculate it with Excel or LibreOffice before release. A Python calculator alone does not prove that workbook formulas work.

Required outputs:

- Baseline: 11,000 questions, THB 0.14 per model call, THB 1,540 model cost, THB 350 fixed cost, THB 1,890 total.
- 1,000 users: 110,000 questions and THB 15,750 total.
- Retry scenario: 12,100 model calls, THB 1,694 model cost, and THB 2,044 total.
- Zero users: THB 350 total and no formula errors.
- Doubled exchange rate: double only the USD-derived component.

The workbook must explain its limits. Real bills can include cache pricing, reasoning tokens, tools, embeddings, storage, network, context tiers, taxes, and different prices. A spreadsheet does not enforce an API budget.

Publish one versioned workbook in the release and serve the same bytes from the app download route. Link that file under EP2 in the LMS. Use checksums to prevent formula drift between copies.

## 12. Evaluation and release gates

Implement the ten cases in `fixtures/evaluation-cases.json`. Keep expected answers separate from actual results. Use semantic checks and source checks rather than exact sentence matching.

The corrected state must pass Q01, Q02, Q03, Q05, and Q06. It must pass at least nine of ten cases overall. Every expected citation must identify the correct section and document version. Q05 must refuse without fabricated citations. Q08 must say the fee is unspecified.

Run each case in fixture mode for deterministic regression checks. Run all cases in live mode before claiming live readiness. Record actual answer text, retrieved sections, citations, latency, usage, model ID, configuration, commit, and date.

Add these functional tests:

- Pilot access succeeds. Outsider and unauthenticated requests fail on the server.
- Non-admin users cannot read traces or call reset/index routes.
- Blank and oversized input fails without a model call.
- Two parallel requests cannot consume the last quota slot twice.
- Parallel calls cannot reserve more than the remaining budget.
- Repeated idempotency keys create one request and one call sequence.
- Quota, budget, rate-limit, provider-failure, and incident states show the correct Thai next action.
- Both handbook versions and their citation links work.
- Registering docs-v2 leaves index-v1 active until activation.
- The historical dashboard remains exactly 200 requests and THB 28.84 after live rehearsal requests.
- The corrected index changes new answers but not the old trace.
- The workbook opens offline, recalculates, and matches all numeric cases.

The gate for 100 pilot requests over five working days is a teaching example. Automated tests must not claim that they satisfy real pilot observation.

## 13. Commands the agent must implement

The current handoff validator is real. The npm commands below are required interfaces for the future implementation. Implement them before documenting them as working.

```text
npm ci
npm run dev
npm run build
npm run start
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run test:e2e
npm run db:migrate
npm run demo:seed
npm run demo:reset -- --scenario ep1-baseline
npm run demo:reset -- --scenario ep3-stale-index
npm run index:build -- --docs docs-v2 --index index-v2
npm run index:activate -- --index index-v2
npm run eval -- --mode fixture --suite current
npm run eval -- --mode live --suite current
npm run calculator:build
npm run calculator:check
npm run release:check
```

Seed commands must not erase unrelated data. Remote resets require the explicit target namespace and an `--allow-remote-reset` flag. Refuse resets against a general learner deployment.

Record command exit codes and evidence paths. Do not add a no-op script to satisfy a command name.

## 14. Repository and distribution requirements

The handoff repository uses `main` as its default branch. It is a template repository. Its initial release tag is `handoff-v1.0.0`.

After implementation, create actual application tags `app-v1.0.0` and `app-v1.0.1` from distinct commits. Keep a `demo-update` branch for the Preview demonstration. Do not confuse the handoff tag with a runnable application release.

The base app tag must support the EP1 baseline. The corrected tag must contain a real, reviewable application change and support the docs-v2/index-v2 release. Keep stable IDs and endpoint behavior across the two tags.

Add an English README for agents and `README.th.md` for learners. Include these distribution paths: Use this template, clone, source ZIP, tagged release, and workbook download. Pin release examples to tags. Keep `main` useful for ongoing development.

Create a release ZIP that excludes secrets, credentials, real traces, `.git`, node_modules, and local account files. Include fixture data, setup instructions, migrations, and the workbook when it exists.

Add CI for type checks, unit tests, integration tests, fixture evaluations, workbook checks, and a production build. Keep live Gemini tests manual with a required secret. A missing API key must skip a clearly named live gate, not create a false passing report.

Repository visibility starts private. Making the learner release public requires the owner's explicit choice. Do not change course-content licenses or publish external example documents. Keep source script snapshots as reference material under the owner's existing rights.

## 15. Implementation order and final evidence

Complete these milestones in order:

1. Load source snapshots, run the handoff validator, and write the dependency choices.
2. Build authentication, the Thai question interface, and versioned handbook/index storage.
3. Add live and fixture adapters, citations, and all functional statuses.
4. Add persistent limits, idempotency, budget reservations, telemetry, and scenario resets.
5. Build the calculator workbook and test its actual formulas.
6. Complete the video matrix in both fixture and live modes where required.
7. Deploy the dedicated Vercel sandbox, test Preview/Production, and rehearse every recording flow.
8. Publish the runnable app release, workbook, and final implementation report.

The final report must list the repository URL, deployed URLs, release tags, commit IDs, environment names, model ID, and test evidence. Give each video slot a pass/fail/blocked result.

Record blockers precisely. If credentials, model access, or hosting are unavailable, finish independent work and mark only the affected gates blocked. Never report a fixture test as a live model test.

Before filming, check the current Vercel interface and the instructor's AiPASS access. Rehearse each ten-minute script with its actual screens. Do not change the approved teaching sequence silently.

## 16. Reference links

Checked on October 24, 2026. Recheck version-sensitive details during implementation.

- Vercel Node.js versions: https://vercel.com/docs/functions/runtimes/node-js/node-js-versions
- Next.js installation: https://nextjs.org/docs/app/getting-started/installation
- Gemini models: https://ai.google.dev/gemini-api/docs/models
- Gemini pricing: https://ai.google.dev/gemini-api/docs/pricing
- Gemini rate limits: https://ai.google.dev/gemini-api/docs/rate-limits
- Vercel promotion: https://vercel.com/docs/deployments/promoting-a-deployment
- Vercel rollback: https://vercel.com/docs/instant-rollback
- Vercel environment variables: https://vercel.com/docs/environment-variables
- Neon and Vercel: https://neon.com/docs/guides/vercel-overview
- GitHub templates: https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-template-repository
- OWASP secrets: https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html
- SRE canary releases: https://sre.google/workbook/canarying-releases/
- SRE incident response: https://sre.google/workbook/incident-response/
- Langfuse observability: https://langfuse.com/docs/observability/overview
- Langfuse evaluation: https://langfuse.com/docs/evaluation/overview
- AiPASS Gemini Enterprise: https://aipass.go.th/gemini-enterprise

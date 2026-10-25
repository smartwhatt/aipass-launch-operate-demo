# ถามคู่มือ — ศูนย์บริการตัวอย่าง

A Thai question-and-answer demo for the course **Launch & Operate Your AI App**.
The app answers from a fictional service-center handbook and shows the source
section for every answer. All content and prices are fictional teaching data.

This repository contains the working application, the offline Excel cost
calculator, the ten-case evaluation suite, and the recording evidence that the
implementation spec asks for.

## Current state

| Area | State | Evidence |
|---|---|---|
| App (EP1 baseline) | Works locally | 55 unit, 34 integration, 12 Playwright tests pass |
| Corpus and index | Two versions, immutable indexes | `npm run index:build` / `index:activate` |
| Controls (rate, quota, budget) | Enforced in PostgreSQL transactions | parallel-request tests pass |
| Fixture evaluation | 10/10 (docs-v2) and 10/10 (docs-v1) | `npm run eval -- --mode fixture` |
| Excel workbook | Built and checked | `npm run calculator:check` (473 assertions) |
| GitHub release and tags | Published | see [docs/DISTRIBUTION.md](docs/DISTRIBUTION.md) |
| Vercel deployment | **Blocked** | Vercel CLI token is not valid on this machine |
| Live Gemini run | **Blocked** | no `GEMINI_API_KEY` on this machine |

A fixture test is not a live model test. The live gates stay blocked until an
owner supplies the key and checks the model prices.

## Start in 5 minutes

Docker is the documented path. Use the second block when Docker is unavailable.

```sh
docker compose up -d
npm ci
cp .env.example .env.local
npm run setup            # writes .env.local, applies migrations, makes accounts
npm run demo:seed
npm run demo:reset -- --scenario ep1-baseline
npm run dev
```

Without Docker, a PostgreSQL 17 binary on the machine is enough:

```sh
npm run db:local:start   # cluster inside .pgdata/, port 5432
npm ci
npm run setup
npm run demo:seed
npm run demo:reset -- --scenario ep1-baseline
npm run dev
```

Open <http://localhost:3000>. The three accounts and their generated passwords
are in `local-accounts.<namespace>.txt`. That file is gitignored. Read it, then
log in as `pilot` and ask `ศูนย์เปิดกี่โมง`.

Full setup, environment variables, and hosting steps: [docs/SETUP.md](docs/SETUP.md).

## The three lessons

Each lesson is independent. Apply its preset, then follow the recording runbook.
A preset changes teaching data and controls only. It never changes the code that
runs, so check the app tag before you record.

| Episode | Preset | What the audience sees |
|---|---|---|
| EP1 deploy | `ep1-baseline` | Local/Preview/Production, a citation, outsider refused, rollback limits |
| EP2 costs and rollout | `ep2-quota`, `ep2-budget-warning`, `ep2-budget-full`, `ep2-provider-failure` | Quota stop before the provider, 80% budget alert, AI outage with handbook fallback |
| EP3 old index | `ep3-stale-index`, `ep3-incident`, `ep3-fixed-preview`, `ep3-fixed-production` | Old answer with `DEMO-R042`, incident banner, index rebuild, evaluation gate |

```sh
npm run demo:reset -- --scenario ep3-stale-index
```

The scenario list and its expected screens are in
[docs/VIDEO_DEMO_MATRIX.md](docs/VIDEO_DEMO_MATRIX.md). The per-slot result is in
[docs/VIDEO_RESULTS.md](docs/VIDEO_RESULTS.md).

## Commands

```sh
npm ci                   # install from the lockfile
npm run dev              # local development
npm run build            # production build
npm run start            # serve the build
npm run lint             # ESLint
npm run typecheck        # tsc --noEmit
npm test                 # unit tests (no database)
npm run test:integration # database, authorization, concurrency
npm run test:e2e         # Playwright against a production build
npm run db:migrate       # apply versioned SQL migrations
npm run setup            # env file, migrations, three accounts
npm run demo:seed        # documents, index-v1, release record
npm run demo:reset -- --scenario <id>
npm run index:build -- --docs docs-v2 --index index-v2
npm run index:activate -- --index index-v2
npm run eval -- --mode fixture --suite current
npm run eval -- --mode live --suite current     # needs a key; blocked here
npm run calculator:build
npm run calculator:check
npm run release:check
npm run release:zip
```

Seed commands add data. Reset commands replace teaching data inside one
namespace. A reset needs `DEMO_CONTROLS_ENABLED=true`. A remote reset also needs
`--namespace` and `--allow-remote-reset`.

## What is where

```text
app/            Thai UI, route handlers, and the authenticated download route
components/     interface components (server and client)
lib/auth/       sessions, roles, server authorization
lib/db/         Drizzle schema and versioned SQL migrations
lib/retrieval/  handbook index, Thai n-gram retrieval, citations
lib/providers/  fixture adapter, Gemini adapter, live prices, prompt-1
lib/controls/   rate, quota, budget reservation and settlement
lib/telemetry/  requests, model calls, spans, dashboard metrics
lib/calculator/ workbook builder and shared cost formulas
fixtures/       canonical fake documents, cases, prices, scenarios
tests/          unit, integration, and Playwright suites
docs/           setup, runbook, matrix, report, conflicts
tools/          seed, reset, index, eval, calculator, release commands
public/downloads/  the built workbook, served through an authenticated route
artifacts/      generated evidence (gitignored)
```

## Design notes that matter in the classroom

- **The active index pointer lives in PostgreSQL.** A code rollback does not move
  it. That is the EP3 incident.
- **`DEMO-R042` is recorded evidence.** Fixing the index changes new answers and
  leaves the old trace unchanged.
- **Fixture mode is labelled on screen.** The dashboard keeps the fixed
  historical dataset separate from rehearsal traffic.
- **Budget reservation is transactional.** Two parallel requests cannot reserve
  the same remaining budget.
- **Citations are built by the server.** The model may choose a section ID from
  the retrieved set, never a URL.
- **Learner screens speak about editions, not keys.** Citations read
  "คู่มือฉบับที่ 1 ข้อ 2.1". Internal keys (`docs-v1`, `index-v1`), the
  environment, and the model live in the footer status line, `/about`, the
  trace viewer, and the admin screens. Keep that split when you edit the UI.
- **v1.0.1 adds a handbook-freshness notice.** When a newer document is
  registered but not active, the home page says so before a learner sees an old
  answer. That is the reviewer-visible change between the two app tags.

## Documentation

- [docs/SETUP.md](docs/SETUP.md) — install, configure, migrate, host
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how the pieces fit
- [docs/RECORDING_RUNBOOK.md](docs/RECORDING_RUNBOOK.md) — reset and filming steps
- [docs/VIDEO_DEMO_MATRIX.md](docs/VIDEO_DEMO_MATRIX.md) — required screens per slot
- [docs/VIDEO_RESULTS.md](docs/VIDEO_RESULTS.md) — result for every slot
- [docs/AIPASS_PROMPTS.md](docs/AIPASS_PROMPTS.md) — prompts for the external chat
- [docs/DISTRIBUTION.md](docs/DISTRIBUTION.md) — tags, ZIP, workbook, learner paths
- [docs/IMPLEMENTATION_REPORT.md](docs/IMPLEMENTATION_REPORT.md) — versions, evidence, blockers
- [docs/SOURCE_CONFLICTS.md](docs/SOURCE_CONFLICTS.md) — places where the sources disagree
- [docs/ci/ci.yml](docs/ci/ci.yml) — CI workflow template (copy into `.github/workflows/` with a token that has the `workflow` scope)
- [IMPLEMENTATION_SPEC.md](IMPLEMENTATION_SPEC.md) — the original specification
- [README.th.md](README.th.md) — Thai learner guide

## Rights

The course scripts and external reference material keep their existing rights.
This repository does not grant a new license to them. Repository visibility
stays private until the owner decides otherwise. The bundled font is Noto Sans
Thai under the SIL Open Font License (see `public/fonts/OFL.txt`).

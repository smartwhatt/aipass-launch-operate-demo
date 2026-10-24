# Setup

This page covers install, configuration, database, accounts, and hosting.
All teaching data is fictional.

## Requirements

| Tool | Version used here |
|---|---|
| Node.js | 24.22.1 (`engines.node` is `24.x`) |
| npm | 11.19.1 |
| PostgreSQL | 17.11 (Docker image `postgres:17-alpine`, or a local binary) |

The app is a single Next.js 16 App Router project on the Node.js runtime.
Deploy it from the repository root.

## Environment variables

Copy `.env.example` to `.env.local`. Never commit a filled copy.
Never prefix a secret with `NEXT_PUBLIC_`.

| Name | Purpose | Notes |
|---|---|---|
| `APP_ENV` | `local`, `preview`, or `production` | Shows on screen. Sets the Secure cookie flag. |
| `DATA_NAMESPACE` | Isolates one environment's data | Every mutable table carries it. |
| `DATABASE_URL` | PostgreSQL connection | Separate database or branch per environment. |
| `SESSION_SECRET` | Signs session cookies | 32+ characters. `npm run setup` generates it. |
| `AI_MODE` | `fixture` or `live` | Fixture mode is labelled on screen. |
| `GEMINI_API_KEY` | Server-only key | Needed only for live mode. |
| `GEMINI_MODEL` | Model identifier | Default `gemini-3.5-flash-lite`. |
| `LIVE_PRICING_CONFIRMED` | `true` after you check model prices | Without it, live mode warns the admin. |
| `DEMO_CONTROLS_ENABLED` | Enables scenario resets | `true` only in a course sandbox. |
| `DEMO_MODE` | Initial mode for seeding | `normal`, `stale_index`, `incident`, `provider_failure`. |
| `DOCS_VERSION`, `INDEX_VERSION` | Seed defaults only | The live pointer is in PostgreSQL. |
| `APP_VERSION` | Release identifier | Must match `package.json`. |
| `APP_COMMIT` | Commit shown on screen | `npm run setup` fills it from Git. |

`npm run db:migrate`, `demo:reset`, and `demo:seed` print the environment and
namespace before they change anything.

## Option A: Docker

```sh
docker compose up -d
npm ci
cp .env.example .env.local
npm run setup
```

`docker-compose.yml` starts PostgreSQL 17 on port 5432 with database
`aipass_local`. The default `DATABASE_URL` already matches it.

## Option B: local PostgreSQL without Docker

`npm run db:local:start` creates a cluster inside the repository at `.pgdata/`,
listens on `127.0.0.1:5432`, and creates `aipass_local` and `aipass_test`.
It finds the binaries in `/opt/homebrew/opt/postgresql*`, `/usr/local/opt`, or
`PATH`. Set `PG_BIN` to point at a bin directory.

```sh
npm run db:local:start
npm ci
npm run setup
npm run demo:seed
```

Stop it with `npm run db:local:stop`.

## Setup command

`npm run setup` does four things:

1. Creates `.env.local` from `.env.example` when it is missing.
2. Generates `SESSION_SECRET` when it is empty or too short.
3. Applies the versioned SQL migrations in `lib/db/migrations`.
4. Creates the three teaching accounts and writes their passwords once to
   `local-accounts.<namespace>.txt` (mode 600, gitignored).

Use `npm run setup -- --rotate` to replace the three passwords.

The three roles:

| Account | Role | Can |
|---|---|---|
| `admin` | administrator | view traces, change scenarios, reset data, read the handbook |
| `pilot` | pilot user | ask questions, read the handbook |
| `outsider` | outside user | nothing protected; both paths return 401/403 |

## Seed and reset

```sh
npm run demo:seed                              # additive: documents, index-v1, release record
npm run demo:reset -- --scenario ep1-baseline  # idempotent, namespace-scoped
```

`demo:seed` never deletes data. A reset replaces teaching data inside the
configured namespace and writes a row to `reset_audit`.

A reset refuses to run when `DEMO_CONTROLS_ENABLED=false`. A remote target also
needs `--namespace <name> --allow-remote-reset`. The command compares the
namespace with `DATA_NAMESPACE` and stops when they differ.

## Tests

```sh
npm test                 # unit: retrieval, cost, policy
npm run test:integration # database, authorization, concurrency
npm run test:e2e         # Playwright; needs a production build
```

Integration tests use the `aipass_test` database and the `aipass-test`
namespace. Override with `TEST_DATABASE_URL`.

Playwright needs a browser. When Playwright cannot write to its default cache:

```sh
PLAYWRIGHT_BROWSERS_PATH="$PWD/.cache/ms-playwright" npx playwright install chromium
PLAYWRIGHT_BROWSERS_PATH="$PWD/.cache/ms-playwright" npm run test:e2e
```

The E2E suite uses `aipass-e2e`, so it cannot touch your demo data.

## Workbook

```sh
npm run calculator:build   # writes public/downloads/AIPASS_AI_App_Cost_Calculator_v1.xlsx
npm run calculator:check   # recalculates the real formulas through Python `formulas`
```

`calculator:check` needs a Python environment with `formulas` and `openpyxl`.
This machine uses `.tools/venv`. Set `CALCULATOR_PYTHON` to another interpreter
path when needed.

The workbook is committed and served through `GET /downloads/<file>`.
A proxy rewrites that public path to the authenticated route, because Next.js
serves `public/` before app routes. Without the proxy, a static copy would skip
the session check. The route returns 401 for anonymous users and 403 for the
outsider role.

## Hosting on Vercel with Neon

1. Create one Neon project per environment, or one branch per environment.
2. Set `APP_ENV=preview` and `APP_ENV=production` in the two Vercel scopes.
3. Use different `DATA_NAMESPACE` values, for example `aipass-preview` and
   `aipass-production`.
4. Set `SESSION_SECRET` separately in each scope. Use
   `openssl rand -hex 32`.
5. Set `DATABASE_URL` to the pooled connection string of that branch.
6. Run `npm run db:migrate` and `npm run demo:seed` once against each database.
7. Set `DEMO_CONTROLS_ENABLED=true` only in the dedicated sandbox project.
8. Keep `AI_MODE=fixture` until a key and checked prices are in place.

Do not share one database between Preview and Production. A Preview reset must
never change Production data.

## Security notes

- Session cookies are HttpOnly, SameSite=Lax, and Secure when `APP_ENV` is not
  `local`.
- Passwords are bcrypt hashes in PostgreSQL.
- `/api/health` returns readiness, version, environment, and mode. It never
  returns secrets or raw database errors.
- Every route checks the role on the server. The tests call the routes directly
  with an outsider session.
- Rate, quota, and budget decisions use PostgreSQL transactions and a per-user
  advisory lock. Process memory is not the source of truth.
- The Gemini key is read only in server code.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `DATABASE_URL is empty` | `.env.local` missing | `npm run setup` |
| Health returns 503, `active_index` null | no index active | `npm run demo:seed`, then a reset |
| Login fails for all accounts | account file lost | `npm run setup -- --rotate` |
| `relation "requests" does not exist` | migrations not applied | `npm run db:migrate` |
| Reset refused | controls disabled or remote without flags | check `.env.local`, add `--allow-remote-reset` |
| e2e webServer timeout | `/login` not ready or port busy | set `E2E_PORT`, check `next start` logs |
| `formulas` import error | Python environment missing packages | `pip install formulas openpyxl` |

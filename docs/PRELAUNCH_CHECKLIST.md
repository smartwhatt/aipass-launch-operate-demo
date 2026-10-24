# Prelaunch checklist (EP1, slot 11)

The checklist is a starting point for the demo, not a production audit.
Fill in "observed" from the screen you see. Do not mark a row passed from a
button being hidden.

| # | Check | Expected result | Observed (fill in) | Evidence |
|---|---|---|---|---|
| 1 | Main task: a question with a known answer | Answer matches the active handbook and cites the right section | | `tests/e2e/demo.spec.ts` — pilot asks and opens the citation |
| 2 | Main task: an out-of-scope question | `insufficient_info`, no citation | | `tests/unit/retrieval.test.ts` — out-of-scope returns no hits |
| 3 | Main task: a question the handbook cannot answer | Says the handbook does not state it | | `tests/unit/policy.test.ts` — fee-not-stated guard |
| 4 | Secrets: no key in the repo or the client bundle | Only server-side names in `.env.example` | | `npm run release:check` — no `NEXT_PUBLIC_` secrets |
| 5 | Secrets: no real key on screen | Key field hidden before any screenshot | | recording rule, not a code check |
| 6 | Access: pilot can ask | 200 with an answer | | `tests/integration/authz.test.ts` |
| 7 | Access: outsider cannot ask | 403 from the server, not a hidden button | | `tests/integration/authz.test.ts` |
| 8 | Access: unauthenticated cannot ask | 401 | | `tests/integration/authz.test.ts` |
| 9 | Access: non-admin cannot read traces or reset | 403 | | `tests/integration/authz.test.ts` |
| 10 | Capacity: quota stops before the provider | One allowed, one `quota_exceeded`, one request row | | `tests/integration/controls.test.ts` |
| 11 | Capacity: budget stops before the provider | One allowed, one `budget_exceeded` | | `tests/integration/controls.test.ts` |
| 12 | Recovery: a previous deployment target exists | Vercel shows an earlier Production deployment | BLOCKED — no Vercel access on the implementation machine |
| 13 | Recovery: handbook fallback works when AI is down | Handbook button opens; contact panel works | | `ep2-provider-failure` scenario |
| 14 | Scope: the app shows its handbook version and limits | Header and home page show both | | screenshot `artifacts/screenshots/home-pilot.png` |
| 15 | Scope: a wrong answer can be reported | Feedback saves | | `tests/integration/authz.test.ts` — feedback |

## Commands that produce the evidence

```sh
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run test:e2e
npm run eval -- --mode fixture
npm run calculator:check
npm run release:check
```

## Rows that stay open

- Row 12 needs the Vercel project and an earlier Production deployment.
- Live model answers need `GEMINI_API_KEY` and checked prices.
- An actual pilot observation is not an automated test. The dashboard gate is a
  teaching example.

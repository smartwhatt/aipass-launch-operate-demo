# Video acceptance results

One result for each row of `docs/VIDEO_DEMO_MATRIX.md`.
`PASS` means the required screen exists and the required action works with the
preset named in the matrix. `BLOCKED` names the missing condition.

Evidence types: `test` (automated), `shot` (screenshot in `artifacts/screenshots`),
`cmd` (command output in the implementation report).

## EP1

| Slot | Required screen | Result | Evidence |
|---|---|---|---|
| 1 | Local app, question with citation | PASS | `shot: answer-with-citation.png`; `test: demo.spec.ts` |
| 2 | Tunnel / Static / Web app visuals | BLOCKED | needs teaching graphics; out of app scope |
| 3 | Direct access / LINE / embed visuals | BLOCKED | needs teaching graphics; out of app scope |
| 4 | Deployment visuals | BLOCKED | needs teaching graphics |
| 5 | Environment labels and AiPASS chat | PARTIAL | `shot: home-pilot.png` shows Local, version, handbook, mode. AiPASS chat needs the instructor account (BLOCKED) |
| 6 | GitHub repo and Vercel import | PARTIAL | repo is public to the owner and pushed; Vercel import BLOCKED (invalid CLI token) |
| 7 | Vercel environment variables | BLOCKED | no Vercel access; variable list is in `docs/SETUP.md` |
| 8 | Vercel Preview and app checks | PARTIAL | app checks PASS (`test: demo.spec.ts`); Preview URL BLOCKED |
| 9 | Promote to Production | BLOCKED | no Vercel access |
| 10 | Instant rollback menu | BLOCKED | no Vercel access; the limitation is explained in `/admin/releases` |
| 11 | Prelaunch checklist | PASS | `docs/PRELAUNCH_CHECKLIST.md` with test and command evidence |
| 12 | App scope and recovery | PASS | home scope card; `/admin/releases` recovery steps |
| 13 | Learner exercise | BLOCKED | instructor slide, not an app screen |

## EP2

| Slot | Required screen | Result | Evidence |
|---|---|---|---|
| 1 | App and device visuals | PARTIAL | `shot: mobile-home-360.png` shows the narrow screen; the double-submit story is narration |
| 2 | Rollout plan | BLOCKED | teaching graphic |
| 3 | AiPASS and release gate | BLOCKED | needs the AiPASS account; the gate values are on `/admin/dashboard` |
| 4 | Excel Inputs, 11,000 questions | PASS | `cmd: calculator:check`; `shot: calculator.png` |
| 5 | Excel Scenarios, 0.14 THB and 1,890 THB | PASS | `cmd: calculator:check` |
| 6 | 1,000 users = 15,750; retry = 2,044 | PASS | `cmd: calculator:check` |
| 7 | Load and queue visuals | BLOCKED | teaching graphic |
| 8 | Latency visuals and simulated rate limit | BLOCKED | teaching graphic; p95 is shown on the dashboard |
| 9 | App quota, two submissions | PASS | `ep2-quota`; `test: controls.test.ts` |
| 10 | Budget warning then full | PASS | `ep2-budget-warning`, `ep2-budget-full`; `test: controls.test.ts` |
| 11 | Provider fallback | PASS | `ep2-provider-failure`; two failed calls and a handbook fallback |
| 12 | Pilot decision table | PASS | `shot: dashboard.png` — 6/200, p95 9.0s, 40/200, 8/24, 1,890 > 1,000 |
| 13 | Learner exercise | BLOCKED | instructor slide |

## EP3

| Slot | Required screen | Result | Evidence |
|---|---|---|---|
| 1 | Old hours against the new handbook | PASS | `ep3-stale-index`; `test: controls.test.ts` |
| 2 | Dashboard, 20 users, 5 days, 200 requests | PASS | `shot: dashboard.png` |
| 3 | Service metrics: 6/200, p95 9s, 28.84 THB | PASS | `test: controls.test.ts` |
| 4 | Quality metrics: 40/200, 8/24 | PASS | `test: controls.test.ts` |
| 5 | Trace viewer, `DEMO-R042` | PASS | `shot: trace-demo-r042.png` |
| 6 | Handbook compared with the old answer | PASS | trace page compares with the newest document |
| 7 | Document and index admin | PASS | `shot: admin-demo.png` — docs-v2 registered, index-v1 active |
| 8 | AiPASS prompt with fictional evidence | BLOCKED | needs the AiPASS account |
| 9 | Incident banner and paused answers | PASS | `ep3-incident`; `test: policy.test.ts` for the pause rule |
| 10 | Preview and config snapshot | PARTIAL | snapshot on `/admin/releases`; Vercel Preview BLOCKED |
| 11 | Build and activate index-v2, ask Q01 | PASS | `test: controls.test.ts` — old answer becomes 08:30–16:30 |
| 12 | Evaluation results, critical 5/5, total 10/10 | PASS | `shot: evaluations.png`; `cmd: eval` |
| 13 | Production deployment and release record | PARTIAL | release record PASS; Vercel Production BLOCKED |
| 14 | Learner exercise | BLOCKED | instructor slide |

## Summary

- 20 rows are PASS with a test or screenshot.
- 6 rows are PARTIAL: the app part works; the platform or account part is missing.
- 14 rows are BLOCKED by teaching graphics, the AiPASS account, or Vercel access.

No blocked row is reported as a pass. Live model evidence is absent on purpose.

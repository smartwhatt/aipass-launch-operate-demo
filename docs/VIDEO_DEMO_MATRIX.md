# Video-to-implementation matrix

Each row is an acceptance requirement. Source scripts are frozen in `docs/sources/`.

Concept visuals require prepared teaching graphics. App rows require working screens and tested actions.
The presets below change teaching data only. Match the actual application tag separately.

## EP1

| Slot / time | Required screen | Starting preset | Required action and result |
|---|---|---|---|
| 1 / 00:00–01:00 | Local app | ep1-baseline | Show localhost on two machines, then the fictional question app with a citation. |
| 2 / 01:00–01:45 | Concept visuals | none | Explain Tunnel, Static, and Web app. A working tunnel service is not required. |
| 3 / 01:45–02:30 | Concept visuals | none | Show direct web access, LINE integration, and embed. Choose direct web access for the demo. |
| 4 / 02:30–03:15 | Deployment visuals | none | Explain deployment and Vercel before its console appears. |
| 5 / 03:15–04:00 | Environment labels and AiPASS | ep1-baseline | Explain Local/Preview/Production. Use the EP1 prompt in actual AiPASS Chat. |
| 6 / 04:00–04:45 | GitHub and Vercel import | ep1-baseline | Show the actual repo, README, build settings, and import. Prepare the real baseline deployment. |
| 7 / 04:45–05:35 | Vercel environment variables | ep1-baseline | Show server-only variable names with hidden values and separate Preview/Production settings. |
| 8 / 05:35–06:25 | Vercel Preview and app | ep1-baseline | Push a real branch commit, open Preview, check Q01/Q05, then compare pilot and outsider access. |
| 9 / 06:25–07:05 | Vercel promotion and app | ep1-baseline | Promote the checked Preview, then repeat checks on its actual Production URL. |
| 10 / 07:05–07:30 | Vercel rollback menu | ep1-baseline | Show a previous real Production target. Explain that database/index state remains separate. |
| 11 / 07:30–08:20 | Prelaunch checklist | ep1-baseline | Show expected and observed results for function, secrets, and server-side access checks. |
| 12 / 08:20–09:15 | App scope and recovery | ep1-baseline | Show handbook/version limits, contact route, owner, incident route, and recovery checks. |
| 13 / 09:15–10:00 | Learner exercise | none | Show first users, access channel, stop conditions, and one issue to fix before sharing. |

## EP2

| Slot / time | Required screen | Starting preset | Required action and result |
|---|---|---|---|
| 1 / 00:00–01:00 | App and device visuals | ep1-baseline | Introduce the same app and a fictional narrow-screen/double-submit problem. |
| 2 / 01:00–01:45 | Rollout plan | none | Show 5 internal users, 20 pilot users, and a possible 100-user expansion. |
| 3 / 01:45–02:30 | AiPASS and release gate | none | Use EP2-A. Show observation window, minimum sample, owners, and example thresholds. |
| 4 / 02:30–03:20 | Excel Inputs | none | Enter 100 users x 5 questions x 22 days. Show 11,000 questions per month. |
| 5 / 03:20–04:05 | Excel Scenarios | none | Explain tokens and fictional prices. Show 0.14 THB/call and 1,890 THB monthly total. |
| 6 / 04:05–04:30 | Excel Scenarios | none | Show 1,000 users =15,750 THB, then 100 users with 1.1 calls/question =2,044 THB. |
| 7 / 04:30–05:25 | Load and queue visuals | none | Explain concurrency using spread traffic versus simultaneous questions. |
| 8 / 05:25–06:30 | Latency visuals | none | Explain nearest-rank p95 and a simulated provider rate-limit response. |
| 9 / 06:30–07:20 | App quota | ep2-quota | Submit twice with one question remaining. The second request stops before any model call. |
| 10 / 07:20–08:00 | Budget controls | ep2-budget-warning -> ep2-budget-full | Show the 80% alert and the separate full-budget rejection with handbook fallback. |
| 11 / 08:00–08:30 | Provider fallback | ep2-provider-failure | Show unavailable AI with a working handbook and contact option. |
| 12 / 08:30–09:20 | Pilot decision table | ep3-stale-index historical data | Show 6/200 errors, p95 9s, a critical answer defect, and 1,890 >1,000 THB. Do not expand. |
| 13 / 09:20–10:00 | Learner exercise | none | Show a one-page rollout plan and calculator changes with effects on users. |

## EP3

| Slot / time | Required screen | Starting preset | Required action and result |
|---|---|---|---|
| 1 / 00:00–01:00 | Question app | ep3-stale-index | Show old 09:00 hours against the current 08:30 handbook. |
| 2 / 01:00–01:30 | Dashboard | ep3-stale-index | Show service versus answer quality for 20 users, five days, and 200 requests. |
| 3 / 01:30–02:20 | Service metrics | ep3-stale-index | Show 6/200=3%, p95 9s, and 28.84 THB fixture cost. |
| 4 / 02:20–03:00 | Quality metrics and feedback | ep3-stale-index | Show 40/200 insufficient-info results and 8/24 correction feedback. Open both types of unknown answers. |
| 5 / 03:00–03:30 | Trace viewer | ep3-stale-index | Explain Log/Trace, then open DEMO-R042 and its version metadata. |
| 6 / 03:30–04:20 | Handbook and trace | ep3-stale-index | Compare docs-v2 2.1 with the old answer and index-v1 retrieval. |
| 7 / 04:20–05:05 | Document/index admin | ep3-stale-index | Show registered docs-v2 while index-v1 remains active. Explain index preparation. |
| 8 / 05:05–05:30 | AiPASS | ep3-stale-index | Use the EP3 prompt with fictional evidence. Compare the actual chat response with the trace. |
| 9 / 05:30–06:15 | Incident banner | ep3-incident | Pause automatic opening-hours answers, show checked docs-v2, owner, and next update. |
| 10 / 06:15–07:00 | Preview and snapshot | ep3-incident | Save the prior config and prepare Preview. Explain why code rollback alone may not fix an old index. |
| 11 / 07:00–07:50 | Index build and question | ep3-fixed-preview | Actually build/activate index-v2, ask Q01, and open its docs-v2 section 2.1 citation. |
| 12 / 07:50–08:30 | Evaluation results | ep3-fixed-preview | Run Q01-Q10. Show actual results, critical 5/5, total >=9/10, and correct citations. |
| 13 / 08:30–09:00 | Production and release record | ep3-fixed-production | Deploy the actual corrected app, check Q01, record versions, and monitor the same pilot group. |
| 14 / 09:00–10:00 | Learner exercise | none | Show the maintenance cycle, a problem question, expected evidence, owner, and review schedule. |


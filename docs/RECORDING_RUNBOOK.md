# Recording runbook

## Before any recording

1. Read the current Thai script and its matrix rows.
2. Use a dedicated sandbox with fictional data.
3. Check the actual app tag, environment, namespace, and mode.
4. Check the pilot, outsider, and admin accounts.
5. Run the named reset, then confirm its visible starting state.

Keep API keys, passwords, personal data, and account details outside the recording. Record the real tool interface when the script requires it.

A fixture reset can restore application data. It cannot create an actual Git commit or change which code Vercel runs. Deploy the required application tag separately. Show the actual executable version and commit.

Use fixture mode for repeatable incidents and historical dashboards. Label it on screen. Record the happy path and corrected evaluation in live mode before claiming live readiness.

## EP1: deploy the app

Deploy `app-v1.0.0` to the dedicated sandbox. Apply `ep1-baseline`. Check Q01 against the v1 hours, 09:00–16:00. Check that Q05 returns insufficient information.

Use the real repository, README, and Vercel project. Record the initial import separately if necessary. The first import can create a Production deployment immediately.

Create the `demo-update` branch with an actual small interface change. Push it and open its Preview URL. Show the environment label and separate configuration.

Check a known question, an out-of-scope question, pilot access, and outsider rejection. Then select the checked Preview deployment in Vercel and use Promote to Production.

Check Production configuration before promotion. Check the actual Production URL after the rebuild. Open the same question and citation again.

Prepare an earlier deployment that actually served Production. Show its rollback menu and target. If the instructor executes rollback, check the app and document/index state afterward.

Before another take, restore the intended Production deployment and `ep1-baseline`. Check both roles and Q01/Q05 again.

## EP2: costs and rollout

Open the actual workbook. Start with the baseline column. Enter 100 users, five questions per day, and 22 active days. Show 11,000 questions and THB 1,890 total.

Change to 1,000 users. Show THB 15,750. Return to 100 users and change average calls to 1.1. Show 12,100 calls and THB 2,044.

Use fictional-price labels throughout. Do not substitute current provider prices in the filmed example. Put real prices in a separate learner copy if needed.

Apply `ep2-quota`. Confirm the pilot has one question left and a clear rate counter. Send twice. The first request succeeds. The second stops before the provider and shows the reset time.

Apply `ep2-budget-warning`, then `ep2-budget-full`. Show the alert and the independent block on new AI work. Open the handbook fallback.

Apply `ep2-provider-failure`. Confirm the account still has budget and quota. Trigger one request and show the unavailable state and fallback.

Load the fixed rollout comparison: 200 requests, six errors, p95 of nine seconds, one critical answer defect, and THB 1,890 monthly estimate. Show that the expansion gate fails.

Before another take, restore workbook baseline values, reset the selected pilot, clear teaching alerts, and restore normal provider behavior.

## EP3: old index incident

Run `ep3-stale-index` on the dedicated sandbox with app 1.0.0. The document list must contain v2 while the active index remains v1.

Open the historical pilot dashboard. It must stay at 200 requests. Open `DEMO-R042` and its retrieved v1 section. Show the current v2 handbook next to the old answer.

Use the EP3 AiPASS prompt with the fictional evidence only. The actual chat response can vary. Check it against the trace.

Run `ep3-incident`. Show the banner, paused opening-hours answers, checked v2 handbook link, owner, and next-update time.

Move the fix to Preview. Keep the historical trace unchanged. Build index-v2 from docs-v2 and activate it there. Ask Q01 again and open its v2 citation.

Run the ten evaluation cases. Show actual before/after results. The critical cases must all pass and the total must reach at least nine of ten.

Deploy the actual `app-v1.0.1` change. Apply only the checked config/index release to the Production sandbox. Check Q01 and the active versions there.

A reset for another take must restore the v1 index and old dataset without deleting unrelated namespaces. After filming, restore the corrected state and disable general access to demo controls.

## Source conflicts and recording gates

EP2 uses the word subscription for THB 350 in narration. Its visuals define THB 300 hosting plus THB 50 monthly domain cost. Use the fixed-cost subtotal in the calculator. Ask the instructor to align the narration at rehearsal.

Do not add unimplemented LINE, embed, tunnel, or Langfuse screens to the working demo. Those concepts need the visuals described in the scripts.

The script time slots are estimates. Rehearse actual clicks and reading pauses. Cut build waiting time rather than skipping a required check.

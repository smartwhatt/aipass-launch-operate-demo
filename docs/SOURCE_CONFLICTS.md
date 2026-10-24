# Source conflicts

The spec says to record a conflict before changing behavior. This file lists
every conflict found while implementing. No course script changed.

## 1. THB 350 called a "subscription" in EP2 narration

- **Script**: the EP2 narration calls THB 350 the AI chat subscription.
- **Spec and visuals**: THB 300 hosting plus THB 50 monthly domain allocation
  (THB 600 per year divided by 12). Section 11 of the spec names this directly.
- **Implementation**: the workbook labels the row "ต้นทุนคงที่ต่อเดือน (fixed
  cost per month)" and the Start sheet states that the amount is not a chat
  service fee. The number stays 350. The calculator page uses the same label.
- **Action for the owner**: align the EP2 narration at rehearsal, or confirm the
  neutral wording. The script is unchanged.

## 2. `gemini-3.5-flash-lite` cannot be verified from this machine

- **Spec**: check account access before implementation tests, and report a
  failure. Record any substitute model and its test results.
- **Reality**: no `GEMINI_API_KEY` exists in this environment. No Google account
  call was made, so account access is unknown.
- **Implementation**: the model ID stays `gemini-3.5-flash-lite` in
  `.env.example`, and the adapter reads `GEMINI_MODEL`. Live mode reports a
  blocked gate, not a pass.
- **Action for the owner**: supply a key, run `npm run eval -- --mode live`, and
  record the result. If the model is unavailable, set `GEMINI_MODEL` to another
  supported text model and add its price to `lib/providers/pricing.ts`.

## 3. Live model prices cannot be confirmed here

- **Spec**: keep pricing independent from the model selector, and never attach
  the teaching prices to a live model.
- **Reality**: the price page cannot be checked without account context, so the
  entry in `lib/providers/pricing.ts` carries `verified: false` and no checked
  date.
- **Implementation**: live calls stop when a model has no price. When a price
  exists but is unverified, the admin screens show "ยังไม่ตรวจสอบ" and
  `LIVE_PRICING_CONFIRMED` records the operator's confirmation.
- **Action for the owner**: check the price page, set `checkedDate` and
  `verified`, then set `LIVE_PRICING_CONFIRMED=true`.

## 4. The workbook location conflicts with its "authenticated download" label

- **Spec layout**: `public/downloads/` holds the built workbook for an
  authenticated download.
- **Platform behavior**: Next.js serves `public/` before app routes, so a static
  file at `/downloads/<file>` would skip the session check.
- **Implementation**: the workbook stays in `public/downloads/` as the layout
  asks. `proxy.ts` rewrites `/downloads/:path*` to the authenticated
  `/api/workbook/:filename` route before the static handler runs. Tests show 401
  anonymous, 403 outsider, 200 pilot, and 404 for other filenames.
- **Action for the owner**: keep `proxy.ts` if you change the download path.

## 5. EP2 slot 12 asks for the EP3 historical dataset

- **Matrix**: EP2 slot 12 is labelled "ep3-stale-index historical data".
- **Implementation**: the `ep3-stale-index` preset loads the 200-request dataset.
  The EP2 row uses it without loading the incident. No separate preset was added,
  because the matrix names this one.

## 6. Node.js 24 is required, but this machine had no Node 24

- **Spec**: use Node.js 24.x with a committed lockfile.
- **Reality**: the system Node was 24-adjacent only after a local install. The
  repository declares `engines.node: "24.x"` and the lockfile was produced with
  npm 11.19.1 on Node 24.22.1. A workspace copy of Node 24 is used for every
  command in the report; it is gitignored.

## 7. GitHub Actions are not active on the private account

- **Spec**: add CI for type checks, tests, fixture evaluation, workbook checks,
  and a build. Keep the live Gemini test manual.
- **Reality**: the original handoff says automation is not active under the
  current account permissions.
- **Implementation**: the workflow is committed as `docs/ci/ci.yml` and
  validated as YAML. GitHub rejects a push that creates
  `.github/workflows/ci.yml` because the implementation token has no `workflow`
  scope. The live job is manual (`workflow_dispatch`) and needs a
  `GEMINI_API_KEY` secret. A missing key fails the job with a clear name. It
  never reports a pass.
- **Action for the owner**: copy `docs/ci/ci.yml` into `.github/workflows/`
  from an account with the `workflow` scope, then push.

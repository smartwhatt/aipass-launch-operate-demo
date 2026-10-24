# Implementation instructions

Read these files before you change application code:

1. `IMPLEMENTATION_SPEC.md`
2. `docs/VIDEO_DEMO_MATRIX.md` and `docs/VIDEO_RESULTS.md`
3. `docs/RECORDING_RUNBOOK.md`
4. `docs/ARCHITECTURE.md` and `docs/SOURCE_CONFLICTS.md`
5. `docs/sources/manifest.json` and the three Thai script snapshots

The repository is no longer a handoff. It contains the working application, the
Excel workbook, the test suites, and the release evidence. Keep them working.

## Preserve the teaching contract

- Keep Thai learner text and English agent documentation.
- Match the current script snapshots. Record any later source change in
  `docs/SOURCE_CONFLICTS.md` before you change behavior.
- Keep all three lessons independent. Do not require a project from another course.
- Preserve sample hours, prices, outputs, IDs, and evaluation cases.
- Keep live results and fixtures visibly separate. Label fixture mode on screen.
- Keep AiPASS prompts as external instructor actions. Do not invent an AiPASS API.
- Preserve the Excel deliverable. A website alone is insufficient.
- Keep `DEMO-R042` and the 200-request historical dataset exactly as recorded.

## Work rules

- Start with `npm ci`, then `npm run db:migrate` and `npm run setup`.
- Use PostgreSQL transactions for shared limits. Never use process memory.
- Never put secrets, generated passwords, private traces, or real user data in Git.
- Do not change a script or an expected answer to hide a failing test. Record the
  actual output in the implementation report.
- Run fixture tests without an API key. Run live evaluation separately. Report a
  missing key as a blocked gate. Never report a fixture test as a live test.
- A reset changes data and controls only. It must not change the app version.
- Keep `public/downloads/` served through `proxy.ts`. Without the proxy, a static
  copy skips the session check.

## Commands that must keep working

```sh
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

Do not add a no-op script to satisfy a command name. Record the exit code.

## Evidence

- `artifacts/` holds generated evidence. It is gitignored.
- `docs/IMPLEMENTATION_REPORT.md` holds versions, commands, and blockers.
- `docs/VIDEO_RESULTS.md` holds one result for every video slot.
- Keep the workbook checksum in `docs/WORKBOOK_SHA256.txt` in step with the file.

## Repository publication

- Keep the current private visibility unless the owner explicitly asks.
- Do not change content licenses.
- `handoff-v1.0.0` is the specification release.
- `app-v1.0.0` is the EP1 baseline. `app-v1.0.1` is the corrected release.
- Keep `demo-update` for the Preview exercise.

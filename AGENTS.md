# Implementation instructions

Read these files before writing application code:

1. `IMPLEMENTATION_SPEC.md`
2. `docs/VIDEO_DEMO_MATRIX.md`
3. `docs/RECORDING_RUNBOOK.md`
4. `docs/sources/manifest.json` and the three Thai script snapshots

The current repository is an implementation handoff. Do not report the app or calculator as complete from these files alone.

## Preserve the teaching contract

- Keep Thai learner text and English agent documentation.
- Match the current script snapshots. Record later source changes before changing behavior.
- Keep all three lessons independent. Do not require a project from another course.
- Preserve the sample hours, prices, outputs, IDs, and evaluation cases.
- Keep live results and fixtures visibly separate.
- Keep AiPASS prompts as external instructor actions. Do not invent an AiPASS API integration.
- Preserve the Excel deliverable. A website alone is insufficient.

## Work and evidence

Start with `python3 tools/validate_handoff.py`. Then implement the milestones in the specification.

Use persistent transactions for shared limits. Do not use process memory for hosted quotas or budgets.

Never put secrets, generated account passwords, private traces, or actual user data in Git.

Do not alter a script or expected answer to hide a failing test. Save actual answers and failed checks in the implementation report.

Run fixture tests without an API key. Run live evaluation separately when credentials are available. Report a missing credential as a blocked live gate.

Use the report template for the final handoff. Include commits, versions, commands, deployment URLs, workbook checksums, and video-slot results.

## Repository publication

Keep the current private visibility unless the owner explicitly asks to change it. Do not change content licenses.

Create application tags only after application code and tests exist. `handoff-v1.0.0` is a specification release.

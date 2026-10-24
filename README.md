# AIPASS Launch & Operate Demo: Agent Handoff

Give an implementation agent `AGENTS.md`, then ask it to complete `IMPLEMENTATION_SPEC.md` against the video matrix.

Repository: https://github.com/smartwhatt/aipass-launch-operate-demo

Status: specification and teaching fixtures only. The app, Excel workbook, and hosted demo still require implementation.

## Start here

1. Read [the implementation specification](IMPLEMENTATION_SPEC.md).
2. Check [every video slot](docs/VIDEO_DEMO_MATRIX.md).
3. Read [the recording runbook](docs/RECORDING_RUNBOOK.md).
4. Run the existing handoff check:

```sh
python3 tools/validate_handoff.py
```

A CI template is included at `docs/ci/handoff.yml.example`. Automatic GitHub Actions are not active in this handoff release. An owner with workflow permission can move it to `.github/workflows/handoff.yml`.

The check uses only Python 3 and its standard library. It checks the handoff data and cost examples. It does not test an application.

## Ask an agent to implement

Use this prompt:

```text
Read AGENTS.md and IMPLEMENTATION_SPEC.md in full.
Implement the demo app, persistent controls, scenarios, and Excel workbook.
Match every row of docs/VIDEO_DEMO_MATRIX.md and the Thai script snapshots.
Use docs/RECORDING_RUNBOOK.md for reset and filming behavior.
Report actual test results and exact blockers. Keep fixture and live evidence separate.
Complete docs/IMPLEMENTATION_REPORT.template.md with evidence paths and release URLs.
```

## Distribution

This repository is a private GitHub template. Repository access still applies when someone uses the template or downloads an asset.

- Use **Use this template** to create an independent implementation repository.
- Clone the repository to keep its history.
- Download the `handoff-v1.0.0` release ZIP to give the complete handoff to another agent.
- Use `IMPLEMENTATION_SPEC.md` as the portable English entry point.

The handoff release does not include a workbook or a runnable application. The implementing agent must create those release assets after the acceptance gates pass.

## Source and teaching language

The specification is English. The learner interface, handbook, and video narration remain Thai. Source snapshots date from October 24, 2026.

The scripts use one fictional handbook app across three independent lessons:

- EP1: deploy and check the app on Vercel.
- EP2: add users in stages and calculate costs.
- EP3: diagnose an old index, fix it, and test the next release.

See [source provenance](docs/sources/manifest.json) and [the Thai learner note](README.th.md).

## Rights

This handoff does not grant a new license to the course scripts or external reference materials. The owner decides redistribution rights and public visibility.

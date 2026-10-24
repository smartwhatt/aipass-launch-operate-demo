# Repository distribution

## Release channels

| Channel | Contents |
|---|---|
| `handoff-v1.0.0` | the original specification package |
| `app-v1.0.0` | runnable baseline application for EP1 |
| `app-v1.0.1` | corrected application for EP3, with the handbook-freshness notice |
| `demo-update` | the branch used for the EP1 Preview exercise |
| `main` | ongoing development |

Each release from `app-v1.0.0` onward carries:

- the application source ZIP,
- the workbook `AIPASS_AI_App_Cost_Calculator_v1.xlsx`,
- a `SHA256SUMS` file for both archives,
- the setup guide, the recording runbook, and the implementation report.

## Learner paths

| Path | Use |
|---|---|
| **Use this template** | start an independent repository; no secrets, database, or Vercel settings come with it |
| clone | keep the history and the tags |
| source ZIP from the release | hand the complete package to another machine or agent |
| tagged release | pin the app tag that matches the lesson |
| workbook download | open the same bytes that the app serves |

Pin every example to a tag. Example:

```sh
git clone --branch app-v1.0.0 https://github.com/smartwhatt/aipass-launch-operate-demo
```

## Workbook

The release and the app must serve the same bytes.

| Field | Value |
|---|---|
| File | `AIPASS_AI_App_Cost_Calculator_v1.xlsx` |
| Bytes | 17,020 |
| SHA-256 | `68db1fbfea331a41dcaee6aac6cef39117386ff4b5809edfe5972ddb1a11d86b` |
| Checksum file | `docs/WORKBOOK_SHA256.txt` and `release/SHA256SUMS` |

Verify after download:

```sh
shasum -a 256 AIPASS_AI_App_Cost_Calculator_v1.xlsx
```

Link one workbook under EP2 in the LMS. Do not upload several workbooks with
different formulas under the same filename.

## Before you give a learner access

1. Create a separate database and a separate `DATA_NAMESPACE`.
2. Set `DEMO_CONTROLS_ENABLED=false` for a general learner deployment.
3. Run `npm run setup -- --rotate` and keep the account file out of any share.
4. Run `npm run release:check`.
5. Confirm `npm run calculator:check` passes.
6. Check the template, the clone, the ZIP, and the download from a learner
   account.
7. Keep the repository private until the owner chooses otherwise.

## Visibility and rights

The repository starts private. Making a learner release public needs an explicit
choice by the owner. The course scripts and external reference material keep
their existing rights. This package does not publish external example documents.

## What the ZIP excludes

`.git`, `node_modules`, `.next`, `.vercel`, `.env*`, `local-accounts*`,
`artifacts/`, `release/`, local database clusters, tool caches, and logs.

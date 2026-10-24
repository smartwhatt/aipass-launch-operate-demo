# Repository distribution

## Current handoff release

The repository contains the English specification, Thai source snapshots, fictional assets, and a handoff validator.

The tag `handoff-v1.0.0` identifies this package. Its ZIP can move between AI-agent environments without Google Drive access. The app and workbook still require implementation.

Private repository permissions also protect its release assets. The owner must grant access or share the downloaded ZIP with the recipient.

## Template use

Select **Use this template** to create a separate repository. A template copies content and structure. It does not copy deployment secrets, connected databases, Vercel settings, or learner access.

The recipient must generate new credentials and use an isolated database/namespace. Do not reuse the instructor's environment.

## Required application release

After implementation, publish these assets from one checked commit:

- Application source ZIP and version tag.
- The offline workbook, with its version and SHA-256.
- English and Thai setup instructions.
- Recording runbook and scenario resets.
- Implementation report with actual evidence.

Serve the same workbook bytes from the app and the tagged release. The download must remain available when no AI provider key is set.

Use these release channels:

- `handoff-v1.0.0`: specification package.
- `app-v1.0.0`: actual baseline application for EP1.
- `app-v1.0.1`: actual corrected application for EP3.

Keep `demo-update` for the Preview exercise. Do not use a branch name as a substitute for a tested release tag.

## Before learner distribution

Check the template, clone, ZIP, and workbook paths from a learner account. Remove secrets, local accounts, real traces, and unrelated files.

Check the license and visibility with the owner before public distribution. Keep course scripts and external reference materials under their existing rights.

Use one release as the LMS source. Do not upload several workbooks with different formulas under the same filename.

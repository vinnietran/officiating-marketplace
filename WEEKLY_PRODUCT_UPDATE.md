# Weekly Product Update Automation

This repository includes a GitHub Actions workflow that compiles a stakeholder-facing weekly product update email from GitHub issues, pull requests, and recent workflow runs.

## What It Does

- runs on a weekly schedule and also supports manual execution through `workflow_dispatch`
- collects issues closed during the reporting window and filters pull requests out of those results
- summarizes issue story detail from common headings such as `## Summary`, `## Background`, `## Acceptance Criteria`, `## Validation`, and `## Testing`
- lists currently in-progress work based on configurable labels
- includes recent merged pull requests and recent GitHub Actions results when enabled
- sends an HTML email through SMTP or produces a dry-run artifact preview without sending

## Files

- workflow: `.github/workflows/weekly-product-update.yml`
- main entrypoint: `scripts/weekly-product-update/index.mjs`
- parser tests: `scripts/weekly-product-update/tests/*.test.mjs`
- dry-run artifact output directory: `artifacts/weekly-product-update`
- checked-in example artifact: `docs/weekly-product-update-example/weekly-product-update-example.html`

## Required GitHub Secrets

Set these repository secrets before enabling scheduled email delivery:

- `PRODUCT_UPDATE_SMTP_HOST`
- `PRODUCT_UPDATE_SMTP_PORT`
- `PRODUCT_UPDATE_SMTP_USERNAME`
- `PRODUCT_UPDATE_SMTP_PASSWORD`

## Recommended GitHub Variables

These repository variables control the workflow without editing code:

- `PRODUCT_UPDATE_RECIPIENTS`: comma-separated recipient list
- `PRODUCT_UPDATE_PROJECT_NAME`: subject line label for the product name
- `PRODUCT_UPDATE_SENDER_NAME`: display name for the sender
- `PRODUCT_UPDATE_SENDER_EMAIL`: from-address used for delivery
- `PRODUCT_UPDATE_DRY_RUN`: optional global default of `true` or `false`
- `PRODUCT_UPDATE_IN_PROGRESS_LABELS`: default `in-progress,doing,active`
- `PRODUCT_UPDATE_BLOCKER_LABELS`: default `blocked,blocker,question,open-question`
- `PRODUCT_UPDATE_NEXT_FOCUS_LABELS`: default `next-up`
- `PRODUCT_UPDATE_INCLUDE_MERGED_PRS`: default `true`
- `PRODUCT_UPDATE_INCLUDE_TESTS`: default `true`
- `PRODUCT_UPDATE_INCLUDE_BLOCKERS`: default `true`
- `PRODUCT_UPDATE_INCLUDE_NEXT_FOCUS`: default `true`
- `PRODUCT_UPDATE_SMTP_SECURE`: default `true`

## Manual Runs

The workflow supports these manual inputs:

- `report_start`: optional UTC start date in `YYYY-MM-DD` or ISO-8601 format
- `report_end`: optional UTC end date in `YYYY-MM-DD` or ISO-8601 format
- `recipient_override`: optional comma-separated override for the email recipients
- `dry_run`: when `true`, the workflow skips email delivery and uploads the generated HTML, text, and JSON artifacts

If no dates are provided, the script uses the previous 7-day window in UTC.

## Local Verification

Install dependencies and run the unit tests:

```bash
npm test
```

Generate a dry run locally by setting at least `GITHUB_REPOSITORY`, `GITHUB_TOKEN`, and `DRY_RUN=true`:

```bash
GITHUB_REPOSITORY=owner/repo GITHUB_TOKEN=ghp_example DRY_RUN=true npm run weekly-product-update:dry-run
```

## Dry-Run Artifacts

Each run writes these files into `artifacts/weekly-product-update`:

- `weekly-product-update.html`
- `weekly-product-update.txt`
- `weekly-product-update.json`

The workflow uploads that directory as an artifact on both scheduled and manual runs so the email body can be reviewed before or after delivery.

To refresh the checked-in example files, run:

```bash
npm run weekly-product-update:example
```

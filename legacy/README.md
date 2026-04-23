# Legacy — quarantined files

These files are **not invoked** by production cron (`run-sprout.sh`) and are kept here only for reference during the refactor.

## Deletion policy

**Delete this entire folder after 2026-05-30** if the new `bin/run.js` path has been running cleanly in production for at least 7 consecutive days.

## Why each file is here

| File | Reason |
|---|---|
| `simple-analytics.js` | Older profile-level script. Not called by cron. Has a frozen Aug 28 – Sep 1 date window — never used. |
| `schedule-daily-update.js` | Self-scheduling `node-schedule` wrapper. Cron does not invoke it. |
| `group-analytics.js` | Older variant of `sprout_april.js`. Redundant. |
| `hardcoded_april.js` | One-off backfill script. |
| `hardcoded_sprout_posts.js` | One-off backfill script. |
| `api-cron.js` | Vercel-specific serverless entry. We run on EC2. Renamed from `api/cron.js`. |
| `simple-auth.js` | Early-development auth helper superseded by `utils/auth.js`. |
| `test-oauth.js` | Ad-hoc OAuth test. |
| `check-apis.js` | Diagnostic. |

## How to restore (if anything here turns out to still be needed)

```bash
git mv legacy/<filename> <filename>
```

Or for `api-cron.js` specifically (was in `api/`):
```bash
mkdir -p api
git mv legacy/api-cron.js api/cron.js
```

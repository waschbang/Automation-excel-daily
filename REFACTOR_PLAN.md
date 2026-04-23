# Refactor Plan — Automation-excel-daily

Owner: harsh@schbang.com
Drafted: 2026-04-23

**Goal**: replace the current patchwork of 6 overlapping scripts with a single, clean, testable, observable codebase — while producing **byte-for-byte identical output** in the same Google Sheets. Zero regression in the daily 7 AM run.

---

## 0. Guiding principles

1. **Preserve behavior first, improve second.** Every phase can be rolled back in one command.
2. **No big-bang cutover.** The new code runs alongside the old until it proves identical for 3 consecutive days.
3. **Every change is reversible.** Old code is quarantined in `legacy/`, not deleted, until the new path is proven.
4. **No fake abstractions.** A "Pipeline" class is only justified if it replaces ≥2 concrete things. Avoid factories/strategy-patterns unless they remove real duplication.
5. **Secrets leave the repo forever.** No hardcoded tokens in any file we commit.

---

## 1. Current state — what is broken, unused, or redundant

### 1.1 Files that are NEVER run by production cron (dead code)

| File | Why it's dead |
|---|---|
| [simple-analytics.js](simple-analytics.js) | Not called by `run-sprout.sh`. Has a frozen Aug 28 – Sep 1 date window. |
| [schedule-daily-update.js](schedule-daily-update.js) | Self-scheduling wrapper; cron doesn't invoke it. |
| [group-analytics.js](group-analytics.js) | Older variant of `sprout_april.js`. Redundant. |
| [hardcoded_april.js](hardcoded_april.js) | One-off backfill. |
| [hardcoded_sprout_posts.js](hardcoded_sprout_posts.js) | One-off backfill. |
| [api/cron.js](api/cron.js) | Vercel-specific entry. We run on EC2. |
| [simple-auth.js](simple-auth.js) | Early-development auth helper. |
| [test-oauth.js](test-oauth.js) | Ad-hoc test script. |
| [check-apis.js](check-apis.js) | Diagnostic. |

**Action**: quarantine all 9 files in `legacy/` during Phase 1; delete in Phase 10 after new code is stable.

### 1.2 Duplicated logic across `sprout_april.js` and `sprout_posts.js`

Both scripts independently re-implement: group fetching, profile filtering, spreadsheet find-or-create, sheet find-or-create, date-range row clearing, throttled writes, retry-with-backoff, email sending. ~70% overlap. A single unified pipeline kills this.

### 1.3 Silent data-loss paths (unchanged since HANDOVER.md §6)

1. Duplicate group names (`Rajasthan Revealed` x2, `Birla Opus` x2, `RCAT Rajasthan` x3, typo `Phoenix`/`Pheonix`) → second group's rows get clobbered.
2. `requestWithRetry` returns `null` on sustained 429 → profile silently dropped, no summary count.
3. Drive storage quota → whole group skipped, only visible in HTML email body.
4. Parallel execution of both scripts → race conditions on same sheets.
5. `sprout_posts.js` has a `ReferenceError` at end → no completion email for posts pipeline.

### 1.4 Unused npm dependencies

From `package.json`:
- `express` — not required anywhere.
- `opn` — not required anywhere.
- `fs`, `path` — these are Node built-ins; listing them as deps does nothing harmful but pollutes package.json.
- `node-schedule` — only used by dead `schedule-daily-update.js`.

**Action**: drop `express`, `opn`, `fs`, `path`, `node-schedule` in Phase 1.

### 1.5 Hardcoded secrets (rotate + move to env)

| Secret | Occurrences |
|---|---|
| Sprout API token | 5 files (see HANDOVER.md §2.5) |
| Gmail app password | [utils/email.js:7-8](utils/email.js#L7-L8) |
| Customer ID `2653573` | 6 files |
| Folder IDs | 4 files |

### 1.6 Operational gaps

- No dry-run mode.
- No CLI flags. Anything configurable requires editing source.
- No structured logging — everything is `console.log`.
- No heartbeat / alerting.
- No tests.
- Full refetch of 400 days every single run (wipe-and-refill). Should be incremental.

---

## 2. Target architecture

### 2.1 Folder structure

```
Automation-excel-daily/
├── bin/
│   └── run.js                    # Single CLI entry point (replaces sprout_april.js + sprout_posts.js + run-sprout.sh)
│
├── src/
│   ├── config/
│   │   ├── index.js              # Loads .env, validates, exports typed config object
│   │   ├── metrics.js            # Profile-level Sprout metric list (was inline in utils/api.js)
│   │   └── postMetrics.js        # Post-level metric lists per network
│   │
│   ├── clients/
│   │   ├── sprout.js             # Sprout API client: auth, retry, rate limit handling
│   │   ├── googleAuth.js         # Prefers ADC, falls back to service account JSON
│   │   ├── drive.js              # File search, create, findOrCreateById
│   │   ├── sheets.js             # Throttled read/write, ensureCapacity, deleteRowsByDate
│   │   └── mailer.js             # Nodemailer wrapper
│   │
│   ├── core/
│   │   ├── groupResolver.js      # Fetch groups + profiles, group-by-id (solves dup names)
│   │   ├── spreadsheetStore.js   # Resolve "Copy of <Name> [<groupId>]" → file ID, with cache
│   │   ├── dateRange.js          # Compute incremental window: (max_existing_date - 14d) → today-2, bounded by floor 2025-04-01
│   │   ├── clearExistingRows.js  # Shared date-range clearing logic
│   │   └── writeRows.js          # Shared capacity + throttle + retry wrapper
│   │
│   ├── platforms/
│   │   ├── profile/              # Daily-metrics formatters (one per network)
│   │   │   ├── _base.js          # Shared HEADERS prefix (Date, Network Type, Profile Name)
│   │   │   ├── instagram.js
│   │   │   ├── facebook.js
│   │   │   ├── linkedin.js
│   │   │   ├── twitter.js
│   │   │   └── youtube.js
│   │   └── post/                 # Post-level formatters
│   │       ├── _base.js
│   │       ├── instagram.js
│   │       ├── facebook.js
│   │       ├── linkedin.js
│   │       ├── twitter.js
│   │       └── youtube.js
│   │
│   ├── pipelines/
│   │   ├── profileMetrics.js     # = old sprout_april.js main(), uses src/core/* + platforms/profile/*
│   │   └── postMetrics.js        # = old sprout_posts.js main(), uses src/core/* + platforms/post/*
│   │
│   ├── reporting/
│   │   ├── summary.js            # Aggregate run stats (groups done, skipped, dropped profiles)
│   │   └── emailReport.js        # HTML render + send (replaces sproutEmailHelper.js)
│   │
│   └── lib/
│       ├── logger.js             # JSON structured log with console pretty-print
│       ├── retry.js              # Exponential backoff + jitter (one implementation, not 4)
│       ├── throttle.js           # Global write-rate limiter
│       ├── sleep.js
│       └── dates.js              # ISO normalization, range building, D-2 helpers
│
├── scripts/
│   ├── run-daily.sh              # Replaces run-sprout.sh — sequential, not parallel
│   ├── healthcheck.sh            # Cron-invoked: alerts if .last-success > 6h old
│   └── rename-drive-files.js     # One-off migration: "Copy of X" → "Copy of X [groupId]"
│
├── test/
│   ├── fixtures/
│   │   ├── sprout-profiles.json
│   │   ├── sprout-analytics.json
│   │   └── sheets-response.json
│   ├── unit/
│   │   ├── dateRange.test.js
│   │   ├── groupResolver.test.js
│   │   ├── retry.test.js
│   │   └── platforms.test.js
│   └── integration/
│       └── pipeline-profile.test.js
│
├── legacy/                       # QUARANTINE — not invoked, kept for reference during transition
│   ├── README.md                 # "These are the old files. Delete after 2026-05-30 if new path stable."
│   ├── sprout_april.js
│   ├── sprout_posts.js
│   ├── simple-analytics.js
│   ├── schedule-daily-update.js
│   ├── group-analytics.js
│   ├── hardcoded_april.js
│   ├── hardcoded_sprout_posts.js
│   ├── api-cron.js
│   ├── simple-auth.js
│   ├── test-oauth.js
│   └── check-apis.js
│
├── .env.example                  # Template; no secrets
├── .gitignore                    # Blocks .env, service-account.json, *.log, encoded.txt, private-key.pem
├── .nvmrc                        # Pin Node 18 (matches EC2)
├── package.json
├── package-lock.json
├── README.md                     # How to set up locally
├── HANDOVER.md                   # Already exists — updated at end of refactor
├── REFACTOR_PLAN.md              # This file
└── CHANGELOG.md                  # Track the refactor steps
```

### 2.2 Single CLI

```bash
node bin/run.js [flags]
```

Flags:
- `--pipeline=profile|posts|both`  (default: `both`)
- `--groups=<id1,id2,...>`          (default: all; useful for debugging one brand)
- `--backfill=YYYY-MM-DD`           (full refetch from that date; otherwise incremental)
- `--refresh-days=N`                (default: 14; overlap window that gets re-fetched to catch Sprout corrections)
- `--dry-run`                       (fetches from Sprout but writes nothing; logs intended actions)
- `--verbose`                       (DEBUG-level logging)

Examples:
```bash
# Daily cron (default):
node bin/run.js

# Only post metrics for one brand:
node bin/run.js --pipeline=posts --groups=2594998

# Full backfill from April 1 (what we do today):
node bin/run.js --backfill=2025-04-01

# Dry-run to test without touching Sheets:
node bin/run.js --dry-run --groups=2594998
```

### 2.3 Incremental fetch — the big speedup

**Today**: every run re-fetches `2025-04-01 → D-2` (≈400 days × 250 profiles). Takes hours.

**After**: default behavior is:
1. For each sheet tab, read the max date already present.
2. Compute `start = max(max_existing_date - 14 days, 2025-04-01)` — the 14-day overlap captures Sprout's retroactive corrections.
3. If sheet is empty → use full backfill range.
4. Fetch `start → D-2`. Delete rows in that range. Write fresh.

Daily runs drop from hours to **~5-15 minutes**. Backfills remain available via `--backfill=<date>`.

### 2.4 Duplicate-group-name fix

Current: `Copy of <GroupName>` — collides when Sprout has two groups with same name.

New: `Copy of <GroupName> [<groupId>]`. Example: `Copy of Birla Opus [2764111]` vs `Copy of Birla Opus [2764123]`.

One-off migration script (`scripts/rename-drive-files.js`) renames every existing file in the target folder to the new pattern. Safe because the script is read-only on content (only renames).

Lookup logic prefers groupId match first; falls back to name match for one-time migration tolerance.

### 2.5 Safe concurrency

`scripts/run-daily.sh` runs the two pipelines **sequentially**:

```bash
#!/bin/bash
set -euo pipefail
cd ~/Automation-excel-daily
node bin/run.js --pipeline=profile >> logs/profile.log 2>&1
node bin/run.js --pipeline=posts   >> logs/posts.log   2>&1
date -u -Iseconds > .last-success
```

Eliminates the sheet-write races we have today. Total runtime still well under 7 AM cron window because of incremental fetch.

### 2.6 Observability

- **Structured JSON logs** (one line per event) to `logs/<pipeline>.jsonl`, with a human-readable pretty-print to stdout so existing grep habits still work.
- **Run summary** at the end of each pipeline:
  ```
  === RUN SUMMARY ===
  groups_processed: 135
  groups_skipped:   2  (Birla Opus [2764123]: storage quota; ... )
  profiles_dropped: 4  (due to repeated 429)
  rows_written:     8,450
  duration_sec:     412
  ```
- **Heartbeat file** `.last-success` updated at end of clean run. A second cron at 09:00 IST runs `scripts/healthcheck.sh` — emails alert if heartbeat is older than 6 hours.
- **Email report** enhanced: subject prefixed `⚠️` if any groups skipped or profiles dropped.

---

## 3. Phased rollout

Each phase is **independently shippable**, **reversible in one git command**, and **verified** before proceeding. Estimated calendar time assumes part-time work.

### Phase 0 — Baseline (0.5 day) — DO THIS FIRST
**Goal**: prove current behavior works and capture what "correct" looks like.

Tasks:
1. Confirm today's manual run (started 07:36 UTC) finishes successfully and email arrives.
2. Snapshot Drive folder: export `Copy of Schbang`, `Copy of Shiv Nadar Foundation`, `Copy of Birla Opus` (x2 variants) as CSV baselines into a `baselines/` folder locally (outside git).
3. Record current run duration from cron logs.
4. Tag git: `git tag pre-refactor-baseline`.

**Verification**: baselines exist, tag exists, last known-good cron ran.

**Rollback**: n/a.

---

### Phase 1 — Quarantine dead code + fix trivial bugs (0.5 day)
**Goal**: remove noise from the repo without touching production behavior.

Tasks:
1. Create `legacy/` folder with a README explaining quarantine policy.
2. `git mv` each dead file into `legacy/`:
   - `simple-analytics.js`, `schedule-daily-update.js`, `group-analytics.js`, `hardcoded_april.js`, `hardcoded_sprout_posts.js`, `simple-auth.js`, `test-oauth.js`, `check-apis.js`, `api/cron.js`.
3. Drop unused deps: `express`, `opn`, `fs`, `path`, `node-schedule`. Run `npm prune` on EC2.
4. Fix the `sprout_posts.js` ReferenceError at the end (undefined `executionTimeMin`/`executionTimeSec`/`allResults`) — 2-line patch.
5. Fix `run-sprout.sh` on EC2 to run scripts **sequentially** instead of parallel.
6. Remove all `scheduler-logs.txt`, `encoded.txt`, `private-key.pem` from the working tree; add to `.gitignore`.

**Verification**:
- `npm ci` still installs clean.
- Manual run of `bash run-sprout.sh` on EC2 completes successfully.
- Next 7 AM cron succeeds and email arrives.

**Rollback**: `git revert <phase-1-commit>` or restore from tag.

---

### Phase 2 — Extract shared infrastructure (1-2 days)
**Goal**: introduce `src/` without breaking the existing entry points.

Tasks:
1. Create `src/` skeleton per §2.1.
2. Move `utils/` content into `src/clients/` + `src/lib/`:
   - `utils/api.js` → split into `src/clients/sprout.js` (HTTP) + `src/config/metrics.js` (metric lists) + `src/lib/retry.js` (backoff).
   - `utils/auth.js` → `src/clients/googleAuth.js`.
   - `utils/env.js` → `src/config/index.js`.
   - `utils/sheets.js` + `utils/simple-drive.js` → `src/clients/sheets.js` + `src/clients/drive.js`.
   - `utils/email.js` + `utils/sproutEmailHelper.js` → `src/clients/mailer.js` + `src/reporting/emailReport.js`.
   - `utils/groups.js` → `src/core/groupResolver.js`.
3. Move `platforms/` into `src/platforms/profile/` and `src/platforms/post/`. Create `_base.js` with shared prefix columns (`Date`, `Network Type`, `Profile Name`).
4. Update `sprout_april.js` and `sprout_posts.js` to `require('./src/…')` for the extracted modules. **Behavior unchanged.**

**Verification**:
- `node sprout_april.js` and `node sprout_posts.js` still produce identical output (diff vs Phase 0 baselines).
- Same runtime ± 10%.

**Rollback**: `git revert`.

---

### Phase 3 — Config + secrets (0.5 day)
**Goal**: no secret in any committed file.

Tasks:
1. Generate `.env.example` listing all required vars (`SPROUT_CUSTOMER_ID`, `SPROUT_API_TOKEN`, `DRIVE_FOLDER_ID_PROFILE`, `DRIVE_FOLDER_ID_POSTS`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `MAIL_RECIPIENTS`, `GOOGLE_APPLICATION_CREDENTIALS`).
2. Create `.env` on EC2 with live values. Ensure `.gitignore` covers it.
3. Replace hardcoded tokens in active files with `config.sproutApiToken`, etc.
4. Rotate the Sprout API token in Sprout admin and the Gmail app password in Google account — old ones are compromised (they're on github).
5. Add `src/config/index.js` validator that throws at startup if any required env is missing.

**Verification**:
- `git grep "MjY1MzU3M3w"` returns no matches in active code (only in `legacy/`).
- Run succeeds with new token.

**Rollback**: keep old token active for 7 days after rotation so you can redeploy the old code if needed.

---

### Phase 4 — Unified entry `bin/run.js` (2-3 days)
**Goal**: one CLI that supersedes both top-level scripts.

Tasks:
1. Build `bin/run.js` with `yargs` (or `commander`) for CLI flags.
2. Extract `sprout_april.js main()` → `src/pipelines/profileMetrics.js`.
3. Extract `sprout_posts.js main()` → `src/pipelines/postMetrics.js`.
4. `bin/run.js` dispatches based on `--pipeline`.
5. Old files `sprout_april.js` / `sprout_posts.js` become **one-line shims**: `require('./bin/run.js')` with a fixed pipeline flag. Cron still works unchanged during cutover.

**Verification**:
- `node bin/run.js --pipeline=profile --groups=2594998` produces identical Schbang spreadsheet rows vs baseline.
- Same for `--pipeline=posts`.
- `node sprout_april.js` and `node sprout_posts.js` still work via shims.

**Rollback**: `git revert`; shims revert to original files.

---

### Phase 5 — Duplicate-name disambiguation (1 day)
**Goal**: stop silent clobbering of duplicate-named groups.

Tasks:
1. Write `scripts/rename-drive-files.js`: lists every `Copy of *` file in the target Drive folder, checks whether two groups share the name, renames all to include `[<groupId>]`.
2. Run the rename migration manually **once** (it's idempotent — safe to run multiple times).
3. Update `spreadsheetStore` to always look up by `[groupId]` suffix first; fall back to name for files not yet migrated.

**Verification**:
- Every group in Sprout has exactly one matching spreadsheet.
- All 6 previously-colliding groups (`Rajasthan Revealed`, `Birla Opus`, `RCAT Rajasthan`) now have their own spreadsheets.
- Next run writes to the correct one per group.

**Rollback**: `scripts/rename-drive-files.js --revert` reverts the naming; lookup logic keeps name fallback so nothing breaks.

---

### Phase 6 — Incremental fetch (1-2 days) — THE BIG SPEEDUP
**Goal**: daily runs drop from hours to minutes.

Tasks:
1. Build `src/core/dateRange.js`:
   - `computeWindow({ sheetsClient, spreadsheetId, sheetName, refreshDays, backfill, minDate })`.
   - Reads max existing date, returns `{ startDate, endDate }`.
2. Wire into both pipelines.
3. Add `--backfill=YYYY-MM-DD` flag; when set, skip the max-existing-date check and use the given date as start.
4. Add `--refresh-days=N` (default 14).

**Verification**:
- Daily run (incremental): runtime < 30 minutes.
- `--backfill=2025-04-01` run: matches a known full-refetch output byte-for-byte.
- Sheet rows are not duplicated or missed across a date boundary.

**Rollback**: `git revert`; old full-refetch behavior returns. Data remains correct because it's just wider.

---

### Phase 7 — Observability (1-2 days)
**Goal**: make failures loud; provide daily health signal.

Tasks:
1. Replace `console.log` with `src/lib/logger.js` (JSON lines + pretty console).
2. Implement `src/reporting/summary.js` aggregator. Print summary at end of each pipeline.
3. Write `.last-success` heartbeat file on clean exit.
4. Add `scripts/healthcheck.sh` and a cron entry at 09:00 IST that emails if heartbeat > 6h old.
5. Enhance email subject: `⚠️` prefix on skipped groups or dropped profiles.

**Verification**:
- Break the Sprout token intentionally on a test EC2 run — healthcheck alert fires within the hour.
- Email contains summary stats.

**Rollback**: `git revert`.

---

### Phase 8 — Tests (1-2 days)
**Goal**: CI-runnable regression suite on the risky bits.

Tasks:
1. `test/unit/dateRange.test.js`: incremental window computation, DST, year boundary, empty sheet, backfill override.
2. `test/unit/groupResolver.test.js`: duplicate-name handling, missing-profile handling.
3. `test/unit/retry.test.js`: retry-after header, jitter, max-attempts.
4. `test/unit/platforms.test.js`: each platform's formatter produces correct column count + types.
5. `test/integration/pipeline-profile.test.js`: mocked Sprout + mocked Sheets; run one group end-to-end.
6. `npm test` in CI (GitHub Actions) on every PR.

**Verification**: `npm test` passes locally and in CI.

**Rollback**: tests are additive; n/a.

---

### Phase 9 — Cutover (1 day + 3 days monitoring)
**Goal**: EC2 cron points at new code. Old shims stay for 1 week as rollback lifeline.

Tasks:
1. Point `run-sprout.sh` at `scripts/run-daily.sh` (which uses `bin/run.js`).
2. Monitor 3 consecutive daily runs. Compare output hashes to incremental-fetch outputs.
3. After 3 clean days: update HANDOVER.md.

**Rollback (within 7 days)**: restore `run-sprout.sh` to old contents. Old shims still work.

---

### Phase 10 — Delete legacy (0.5 day)
**Goal**: no dead code left.

Tasks:
1. Delete `legacy/` folder.
2. Delete shim files `sprout_april.js`, `sprout_posts.js` (replaced by `bin/run.js`).
3. Delete `run-sprout.sh` (replaced by `scripts/run-daily.sh`) — or keep as a `deprecated` symlink for 1 more week.
4. Final HANDOVER.md update.

**Verification**: `npm run lint && npm test && node bin/run.js --dry-run` all pass.

**Rollback**: restore from pre-refactor tag; not expected to be needed.

---

## 4. Estimated effort

| Phase | Days (part-time) |
|---|---|
| 0. Baseline | 0.5 |
| 1. Quarantine + trivial fixes | 0.5 |
| 2. Extract shared infra | 1.5 |
| 3. Config + secrets | 0.5 |
| 4. Unified CLI | 2.5 |
| 5. Duplicate-name fix | 1 |
| 6. Incremental fetch | 1.5 |
| 7. Observability | 1.5 |
| 8. Tests | 1.5 |
| 9. Cutover + monitor | 1 + 3 |
| 10. Cleanup | 0.5 |
| **Total** | **~15 days** over ~3 weeks |

Critical-path items (what you'd do if you could only do 4 phases): **0 → 1 → 5 → 6**. That gets you dedup + incremental fetch + a clean repo, which solves the "missing data" and "runs forever" problems.

---

## 5. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| New incremental window misses a date | Low | Medium | Unit tests + 14-day overlap; `--backfill` always available |
| Drive file rename migration breaks lookup for in-flight groups | Low | High | Lookup keeps name fallback during transition; migration script is idempotent and has `--revert` |
| Token rotation locks you out | Low | High | Keep old token active for 7 days post-rotation |
| Cron points at new code that crashes | Low | High | Monitor first 3 runs closely; old shims stay for 7 days |
| Sprout API behavior changes during refactor | Very Low | Medium | Contract tests using recorded fixtures |
| Duplicate-name migration renames a file outside the target folder | Low | Low | Script scopes search to `FOLDER_ID_PROFILE` and `FOLDER_ID_POSTS` only |

---

## 6. What stays the same (contractual — do not change)

- Output Drive folder IDs.
- Spreadsheet tab names (`Instagram`, `Facebook`, `Linkedin`, `Twitter`, `Youtube`, `instagram_post`, etc.).
- Column headers per platform (row 1 of each tab).
- Email recipients list.
- 7:00 AM IST cron schedule.
- Customer ID (`2653573`) and service account identity.

All visible downstream behavior (data in sheets, format of email, file names after Phase 5 migration) is either preserved or a strict improvement.

---

## 7. Open decisions before starting

1. **Move legacy files into this repo's `legacy/` folder, or a separate archived repo?** I recommend in-repo `legacy/` with a deletion date set to 30 days post-cutover. It's cheap and recoverable.
2. **Do we invest in a CI (GitHub Actions)?** Recommended — it's 30 minutes of setup and catches regressions forever. Low cost, high value.
3. **Incremental refresh window — 14 days or 30?** 14 matches Meta/YouTube correction windows. 30 is safer but doubles runtime. I recommend 14.
4. **Post-level pipeline — keep in same run, or split to its own schedule?** If posts data can lag a day, splitting to a slower schedule (e.g., 3 AM) decouples failures. But the simpler "both at 7 AM, sequentially" is fine for now. Decide once Phase 6 shows actual runtimes.
5. **Do we add Slack/webhook alerts in Phase 7, or stick to email?** Email is enough for V1. Add Slack only if the team wants it.

---

## 8. Definition of done

This refactor is complete when **all** of these are true:

- [ ] `npm ci && npm test && node bin/run.js --dry-run` passes.
- [ ] Daily 7 AM cron runs successfully 7 consecutive days.
- [ ] Typical run duration < 20 minutes (incremental).
- [ ] No file contains a secret. `git grep` for the old token returns nothing in active code.
- [ ] Every Customer Group in Sprout has exactly one spreadsheet (no name collisions).
- [ ] Heartbeat file updates on every successful run; healthcheck cron alerts on staleness.
- [ ] Completion email shows run summary (groups processed, skipped, dropped).
- [ ] `legacy/` deleted.
- [ ] HANDOVER.md reflects current state; includes a "local dev setup" section so a new hire can get running in under 30 min.

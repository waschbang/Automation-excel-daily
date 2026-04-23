# Refactor — Task Checklist

Source of truth for current refactor work. Drives from [REFACTOR_PLAN.md](../REFACTOR_PLAN.md).
Follow phases in order. Do not skip. Each phase is reversible via `git revert`.

---

## Phase 0 — Baseline

- [ ] Confirm manual backfill (started 2026-04-23 07:36 UTC) completed successfully
- [ ] Confirm completion email arrived
- [ ] Tag current git HEAD as `pre-refactor-baseline`
- [ ] Record typical run duration in [HANDOVER.md](../HANDOVER.md)

## Phase 1 — Quarantine + trivial fixes (LOCAL ONLY — no EC2 changes yet)

- [ ] Create `legacy/` with README stating quarantine policy (delete after 2026-05-30)
- [ ] Move dead files into `legacy/`:
  - [ ] `simple-analytics.js`
  - [ ] `schedule-daily-update.js`
  - [ ] `group-analytics.js`
  - [ ] `hardcoded_april.js`
  - [ ] `hardcoded_sprout_posts.js`
  - [ ] `api/cron.js`
  - [ ] `simple-auth.js`
  - [ ] `test-oauth.js`
  - [ ] `check-apis.js`
- [ ] Remove unused deps from `package.json`: `express`, `opn`, `fs`, `path`, `node-schedule`
- [ ] Fix `sprout_posts.js` ReferenceError at end of `main()` (undefined `executionTimeMin` / `executionTimeSec` / `allResults`)
- [ ] Update `.gitignore`: ensure `.env`, `env.js`, `service-account.json`, `private-key.pem`, `encoded.txt`, `*.log`, `*.log.*`, `scheduler-logs.txt`, `manual-run.log` are covered
- [ ] Add `.nvmrc` pinning Node 18 (matches EC2)
- [ ] **(EC2 task — deferred to after current backfill finishes)** Update `run-sprout.sh` to run pipelines sequentially instead of parallel

### Verification before commit
- [ ] `npm ci` succeeds
- [ ] `node -c sprout_april.js` and `node -c sprout_posts.js` parse clean
- [ ] `git status` shows only intended changes

## Phase 2 — Extract shared infrastructure into `src/`

- [ ] Create `src/` skeleton per REFACTOR_PLAN.md §2.1
- [ ] `utils/api.js` → `src/clients/sprout.js` + `src/config/metrics.js` + `src/lib/retry.js`
- [ ] `utils/auth.js` → `src/clients/googleAuth.js`
- [ ] `utils/env.js` → `src/config/index.js`
- [ ] `utils/sheets.js` + `utils/simple-drive.js` → `src/clients/{sheets,drive}.js`
- [ ] `utils/email.js` + `utils/sproutEmailHelper.js` → `src/clients/mailer.js` + `src/reporting/emailReport.js`
- [ ] `utils/groups.js` → `src/core/groupResolver.js`
- [ ] `platforms/` → `src/platforms/{profile,post}/<network>.js` with `_base.js`
- [ ] Update `sprout_april.js` and `sprout_posts.js` to require from `src/*`. **No behavior change.**
- [ ] Verify output byte-for-byte identical to baseline for one test group

## Phase 3 — Config + secrets

- [ ] Generate `.env.example` with all required vars
- [ ] Replace hardcoded tokens in active files with `config.*`
- [ ] Rotate Sprout API token in Sprout admin
- [ ] Rotate Gmail app password
- [ ] Deploy new `.env` to EC2
- [ ] Verify `git grep` for old token returns nothing in active code

## Phase 4 — Unified entry `bin/run.js`

- [ ] Build `bin/run.js` with `yargs`/`commander` for CLI flags
- [ ] Extract `sprout_april.js` main → `src/pipelines/profileMetrics.js`
- [ ] Extract `sprout_posts.js` main → `src/pipelines/postMetrics.js`
- [ ] Old top-level files become one-line shims (`require('./bin/run.js')`)
- [ ] Verify `node bin/run.js --pipeline=profile --groups=<testGroupId>` matches baseline

## Phase 5 — Duplicate-group-name disambiguation

- [ ] Write `scripts/rename-drive-files.js` — renames `Copy of <Name>` → `Copy of <Name> [<groupId>]`, idempotent, has `--revert`
- [ ] Run migration manually against production Drive folder
- [ ] Update `spreadsheetStore` lookup: groupId-first, name fallback
- [ ] Verify all 6 previously-colliding groups now have distinct spreadsheets

## Phase 6 — Incremental fetch

- [ ] Build `src/core/dateRange.js` (max-existing-date minus 14d, floor 2025-04-01)
- [ ] Wire into both pipelines
- [ ] Add `--backfill=YYYY-MM-DD` and `--refresh-days=N` flags
- [ ] Verify daily run completes in < 30 minutes
- [ ] Verify `--backfill=2025-04-01` matches a known full-refetch output

## Phase 7 — Observability

- [ ] `src/lib/logger.js` — JSON lines + pretty console
- [ ] `src/reporting/summary.js` — aggregate run stats
- [ ] `.last-success` heartbeat file on clean exit
- [ ] `scripts/healthcheck.sh` + second cron at 09:00 IST for staleness alert
- [ ] Email subject prefix `⚠️` on skipped groups or dropped profiles

## Phase 8 — Tests

- [ ] `test/unit/dateRange.test.js`
- [ ] `test/unit/groupResolver.test.js`
- [ ] `test/unit/retry.test.js`
- [ ] `test/unit/platforms.test.js`
- [ ] `test/integration/pipeline-profile.test.js`
- [ ] GitHub Actions CI running `npm test` on every PR

## Phase 9 — Cutover

- [ ] Point `run-sprout.sh` (or new `scripts/run-daily.sh`) at `bin/run.js`
- [ ] Monitor 3 consecutive daily runs
- [ ] Compare output hashes to incremental-fetch expected outputs

## Phase 10 — Delete legacy

- [ ] Delete `legacy/` folder
- [ ] Delete shim files `sprout_april.js`, `sprout_posts.js`
- [ ] Replace `run-sprout.sh` with `scripts/run-daily.sh` (or symlink 1 week)
- [ ] Final HANDOVER.md pass

---

## Review log

(Append one entry per phase with: date, phase, what shipped, how verified, commit hash, rollback command)

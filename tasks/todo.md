# Refactor — Task Checklist

Source of truth for current refactor work. Drives from [REFACTOR_PLAN.md](../REFACTOR_PLAN.md).
Follow phases in order. Do not skip. Each phase is reversible via `git revert`.

---

## Phase 0 — Baseline

- [ ] Confirm manual backfill (started 2026-04-23 07:36 UTC) completed successfully
- [ ] Confirm completion email arrived
- [x] Tag current git HEAD as `pre-refactor-baseline`
- [ ] Record typical run duration in [HANDOVER.md](../HANDOVER.md)

## Phase 1 — Quarantine + trivial fixes (LOCAL ONLY — no EC2 changes yet) ✅ commit f4299b7

- [x] Create `legacy/` with README stating quarantine policy (delete after 2026-05-30)
- [x] Move dead files into `legacy/`:
  - [x] `simple-analytics.js`
  - [x] `schedule-daily-update.js`
  - [x] `group-analytics.js`
  - [x] `hardcoded_april.js`
  - [x] `hardcoded_sprout_posts.js`
  - [x] `api/cron.js`
  - [x] `simple-auth.js`
  - [x] `test-oauth.js`
  - [x] `check-apis.js`
- [x] Remove unused deps from `package.json`: `express`, `opn`, `fs`, `path`, `node-schedule` (also: added missing `nodemailer`)
- [x] Fix `sprout_posts.js` ReferenceError at end of `main()`
- [x] Update `.gitignore`: `.env`, `env.js`, `service-account.json`, `private-key.pem`, `encoded.txt`, `*.log.*`, `logs/`, `manual-run.log`, `scheduler-logs.txt`, `cron-sprout.log`, `.last-success`, `baselines/`, `.claude/`, `CLAUDE.md`
- [x] Add `.nvmrc` pinning Node 18
- [x] Untrack `node_modules/` and `CLAUDE.md` (commits 992dff2, 1129650)
- [ ] **(EC2 task — deferred to after current backfill finishes)** Update `run-sprout.sh` to run pipelines sequentially instead of parallel

### Verification before commit
- [x] `npm install` succeeds after dep cleanup
- [x] `node -c sprout_april.js` and `node -c sprout_posts.js` parse clean
- [x] `git status` shows only intended changes

## Phase 2 — Extract shared infrastructure into `src/` ✅ commit b04dc5b

- [x] Create `src/` skeleton (config, clients, core, reporting, platforms/{profile,post})
- [x] `utils/api.js` → `src/clients/sprout.js` (split into metrics/retry modules deferred to later phase — file kept intact for now to minimize risk)
- [x] `utils/auth.js` → `src/clients/googleAuth.js`
- [x] `utils/env.js` → `src/config/index.js`
- [x] `utils/sheets.js` → `src/clients/sheets.js`
- [x] `utils/simple-drive.js` → `src/clients/drive.js`
- [x] `utils/email.js` → `src/clients/mailer.js`
- [x] `utils/sproutEmailHelper.js` → `src/reporting/emailReport.js`
- [x] `utils/groups.js` → `src/core/groupResolver.js`
- [x] `platforms/<n>.js` → `src/platforms/profile/<n>.js`
- [x] `platforms/<n>_posts.js` → `src/platforms/post/<n>.js`
- [x] Dead utils quarantined (`utils/drive.js`, `utils/oauth-utils.js`, `utils/stats.js` → `legacy/utils/`)
- [x] Update `sprout_april.js` and `sprout_posts.js` to require from `src/*`
- [x] All 18 src/ modules verified resolvable via `node -e require()` chain
- [ ] Byte-for-byte output comparison against baseline — deferred to after manual backfill finishes and we can trigger a clean run

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

### 2026-04-23 — Phase 1 shipped
- **Commit**: `f4299b7` on branch `refactor/phase-1-quarantine`
- **Scope**: 9 dead files quarantined into `legacy/`; sprout_posts.js ReferenceError fixed; package.json cleaned of 5 unused deps + `nodemailer` declared; `.nvmrc` added; `.gitignore` extended for EC2 secrets and rotated logs; CLAUDE.md + HANDOVER.md + REFACTOR_PLAN.md + tasks/ written
- **Verified**: `node -c sprout_april.js` and `node -c sprout_posts.js` both OK; no active file references a quarantined file
- **Rollback**: `git revert f4299b7` (or `git reset --hard pre-refactor-baseline`)

### 2026-04-23 — Phase 2 shipped
- **Commit**: `b04dc5b` on branch `refactor/phase-1-quarantine`
- **Scope**: all `utils/*` and `platforms/*` moved into `src/` layered layout (config/ clients/ core/ reporting/ platforms/{profile,post}); dead utils quarantined into `legacy/utils/`; all require() paths updated across 21 files
- **Verified**: `node -c` on every moved file; `require()` chain test loads all 18 src/ modules; git recorded renames with 97-100% similarity preserving history
- **Rollback**: `git revert b04dc5b`

### 2026-04-23 — Cleanup (untrack node_modules + CLAUDE.md)
- **Commits**: `992dff2`, `1129650`
- **Scope**: node_modules/ (2876 files) and CLAUDE.md removed from git tracking; package-lock.json refreshed to reflect Phase 1 dep cleanup
- **Rollback**: low-value — these files still exist on disk; `git revert` would re-track them

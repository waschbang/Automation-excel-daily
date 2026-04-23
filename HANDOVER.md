# Automation-excel-daily — Handover

Owner: harsh@schbang.com
Last reviewed: 2026-04-23

This document is the single source of truth for how the Sprout Social → Google Sheets automation works, where it runs, how to operate it, what is known to be broken or fragile, and a staged plan for gaining full visibility.

---

## 1. What the project does (one minute)

Every morning at **07:00 IST**, an EC2 cron job pulls daily analytics from the **Sprout Social API** for every Customer Group (≈135 groups) and updates one Google Sheet per group in a fixed Drive folder. Two passes run **in parallel**:

1. **Profile-level daily metrics** → tabs `Instagram`, `Facebook`, `Linkedin`, `Twitter`, `Youtube` (run by `sprout_april.js`).
2. **Post-level metrics per individual post** → tabs `instagram_post`, `facebook_post`, `linkedin_post`, `twitter_post`, `youtube_post` (run by `sprout_posts.js`).

At the end, `sprout_april.js` sends a completion email to three schbang recipients. `sprout_posts.js` currently crashes before sending its email (bug — see §6).

All output sheets live in Drive folder **`13XPLx5l1LuPeJL2Ue03ZztNQUsNgNW06`** with names of the form `Copy of <Group Name>`.

---

## 2. Infrastructure

### 2.1 EC2

| Item | Value |
|---|---|
| Host | `ubuntu@ip-172-31-34-133` (private) |
| OS | Ubuntu 24.04.3 LTS |
| Kernel | 6.17.0-1007-aws |
| User | `ubuntu` |
| Project dir | `~/Automation-excel-daily` |
| Node | `/usr/bin/node` (Node 18+) |
| Adjacent projects on same box | `~/Sprout-Social-Database`, `~/imagine`, `~/luna-chatbot-backend`, `~/prometheus` |

### 2.2 Cron (ubuntu user)

```
30 1 * * * ~/Automation-excel-daily/run-sprout.sh       # 07:00 AM IST (01:30 UTC)
0 14 * * * ~/Sprout-Social-Database/run-db.sh           # 07:30 PM IST (separate project)
0 9 * * *  ~/imagine/run-callUsers.sh                   # separate project
30 10 * * * ~/imagine/run-callReminder.sh               # separate project
```

Verify with `crontab -l`. Cron firings appear in `sudo grep CRON /var/log/syslog`.

### 2.3 `run-sprout.sh`

```bash
#!/bin/bash
cd ~/Automation-excel-daily
/usr/bin/node sprout_april.js >> ~/Automation-excel-daily/sprout_april.log 2>&1 &
/usr/bin/node sprout_posts.js  >> ~/Automation-excel-daily/sprout_posts.log  2>&1 &
wait
```

> ⚠️ **Both scripts run in parallel and write to the same spreadsheets.** This is the root cause of most intermittent failures and silent data gaps (see §6).

### 2.4 Secrets on the EC2 (NOT in git, do not commit)

These live only on the instance and are loaded at runtime:
- `~/Automation-excel-daily/env.js` — local dotenv file
- `~/Automation-excel-daily/service-account.json` — Google service account key (used via `GOOGLE_APPLICATION_CREDENTIALS`)
- `~/Automation-excel-daily/private-key.pem` — legacy key
- `~/Automation-excel-daily/encoded.txt` — legacy base64 key dump

The Google service account used has **Editor** access on Drive folder `13XPLx5l1LuPeJL2Ue03ZztNQUsNgNW06`. If this is revoked, every run fails silently with "read-only access" warnings.

### 2.5 Hardcoded secrets in source (needs rotation)

| Secret | Where | Action |
|---|---|---|
| Sprout Social API token | [sprout_april.js:79](sprout_april.js#L79), [sprout_posts.js:38](sprout_posts.js#L38), [simple-analytics.js:57](simple-analytics.js#L57), [hardcoded_april.js:83](hardcoded_april.js#L83), [hardcoded_sprout_posts.js](hardcoded_sprout_posts.js) | Move to `env.js` / process.env, rotate token in Sprout |
| Gmail app password | [utils/email.js:7-8](utils/email.js#L7-L8) | Move to env, regenerate app password |
| Sprout Customer ID `2653573` | same files | Env var |

---

## 3. Code map

```
Automation-excel-daily/
├── run-sprout.sh               # EC2 cron entry — runs both scripts in parallel
├── sprout_april.js             # PROD: daily profile-level analytics
├── sprout_posts.js             # PROD: daily post-level analytics
│
├── simple-analytics.js         # DEAD CODE in prod (cron does not call it). Has frozen date range.
├── schedule-daily-update.js    # DEAD CODE in prod. Self-scheduling node-schedule wrapper.
├── group-analytics.js          # DEAD CODE. Older variant.
├── hardcoded_april.js          # DEAD CODE. One-off backfill script.
├── hardcoded_sprout_posts.js   # DEAD CODE. One-off backfill script.
├── api/cron.js                 # Vercel-style entry. Not used on EC2.
├── check-apis.js               # Diagnostic.
├── simple-auth.js / test-oauth.js  # One-off auth helpers.
│
├── platforms/                  # Column definitions + row formatters per network
│   ├── instagram.js  / instagram_posts.js
│   ├── facebook.js   / facebook_posts.js
│   ├── linkedin.js   / linkedin_posts.js
│   ├── twitter.js    / twitter_posts.js
│   └── youtube.js    / youtube_posts.js
│
├── utils/
│   ├── api.js                  # Sprout API client, retry w/ backoff, metric list
│   ├── auth.js                 # Google auth (ADC / service-account / OAuth)
│   ├── env.js                  # dotenv + credential assembly
│   ├── sheets.js               # Google Sheets write helpers
│   ├── simple-drive.js         # Drive search/create helpers, ensureSheetCapacity
│   ├── groups.js               # Customer groups + profiles + grouping
│   ├── email.js                # Nodemailer completion email
│   └── sproutEmailHelper.js    # Email template wrapper
│
├── service-account.json        # (EC2 only) Google credentials
├── env.js / encoded.txt / private-key.pem   # (EC2 only) local creds
│
├── sprout_april.log*           # rotated logs, profile-level run
├── sprout_posts.log*           # rotated logs, post-level run
├── scheduler-logs.txt          # written by dead-code schedule-daily-update.js
└── postanalyticsdocs.txt       # reference notes, Sprout API doc excerpts
```

Active code path (what actually runs in prod): `run-sprout.sh` → `sprout_april.js` + `sprout_posts.js` → `utils/*` + `platforms/*`.

Everything else is dead weight and should be pruned.

---

## 4. Data flow end-to-end

1. **Auth** — `utils/auth.authenticateWithEnv()` prefers `GOOGLE_APPLICATION_CREDENTIALS` (ADC). Falls back to `GOOGLE_CLIENT_EMAIL` + `GOOGLE_PRIVATE_KEY`. Scopes: `drive`, `spreadsheets`.
2. **Discover groups** — `GET /v1/{customer_id}/metadata/customer/groups` via `utils/groups.getCustomerGroups()`.
3. **Discover profiles** — `GET /v1/{customer_id}/metadata/customer` → every profile with its `network_type`, `customer_profile_id`, and `groups[]`.
4. **Group profiles** — `groupProfilesByGroup()` attaches each profile to its group(s). Profiles without a group go into an `Ungrouped Profiles` bucket (skipped if empty).
5. **For each group (sequential, 75 s delay between groups):**
    1. Find/reuse the `Copy of <GroupName>` spreadsheet in the Drive folder (or fall back to a fuzzy global search; or create new — but creation is rate-limited by Drive storage quota).
    2. Ensure a tab exists per network type; write headers from `platforms/<net>.HEADERS`.
    3. Clear any existing rows in the target date range (to avoid duplicates on re-runs).
    4. POST to `/analytics/profiles` (profile-level) or `/analytics/posts` (post-level) per profile, per the metric list in [utils/api.js:186-277](utils/api.js#L186-L277). Per-profile, **single POST** covers the full date range.
    5. Format rows using the platform module, bulk-write to the sheet with throttling (2 s min between writes) and exponential backoff on 429.
6. **Email** — `sproutEmailHelper.sendSproutCompletionEmail()` renders an HTML summary and sends it to 3 recipients hardcoded in [utils/email.js:12](utils/email.js#L12).

### Date window

| Script | `START_DATE` | `END_DATE` |
|---|---|---|
| `sprout_april.js` | `2025-04-01` (hardcoded) | `getCurrentDate()` = today − 2 days |
| `sprout_posts.js` | `2025-04-01` (hardcoded) | `getCurrentDate()` = today − 2 days |
| `simple-analytics.js` (dead) | `2025-08-28` | `2025-09-01` |
| `api/cron.js` (dead) | today − 2 | today − 2 |

> Each run refetches everything from 2025-04-01 to D-2. That's hundreds of days × ~250 profiles × multiple networks. A full run currently takes **hours**. If the Sprout token rotates mid-run, the remaining groups fail silently.

---

## 5. What a successful run looks like

- `sudo grep CRON /var/log/syslog | grep Automation-excel-daily` shows a line at 01:30 UTC.
- `tail -f ~/Automation-excel-daily/sprout_april.log` is appending every few seconds, cycling through groups.
- Completion email arrives at `atharva.sawant@schbang.com`, `ansh.shetty@schbang.com`, `yadnesh.rane@schbang.com` within a few hours.
- Each `Copy of <Group>` spreadsheet has a fresh row at `today - 2` in each network tab and each `*_post` tab.

If any of those four checks fail, see §7.

---

## 6. Known bugs and silent data-loss paths — ranked by impact

### 6.1 🔴 Critical — duplicate group NAMES in Sprout overwrite each other
In the group list, multiple distinct Customer Groups share the same name:
- `Rajasthan Revealed` appears as IDs 2760771 **and** 2760772
- `Birla Opus` appears as 2764111 **and** 2764123
- `RCAT Rajasthan` appears 3× (2760792, 2760794, 2760795)
- `Phoenix Marketcity` (2634540) vs `Pheonix Marketcity` (2639618) — typo variant

`driveUtils.findExistingSpreadsheet(drive, "Copy of <name>", folderId)` returns the **first** match. So the second, third, etc. groups with the same name all write into the same spreadsheet, clobbering the first group's rows in the clear-range step.

**Impact**: at least one group's rows are overwritten per duplicate pair. Explains "some of the data that is there it is not fetched."

**Fix options**:
- (preferred) Disambiguate the spreadsheet name with the group ID: `Copy of <name> [<groupId>]`.
- (lighter) Skip groups whose name already has a target spreadsheet that "belongs to" a different groupId (requires tracking a mapping in Drive file description).

### 6.2 🔴 Critical — parallel execution of two scripts writing to the same sheets
`run-sprout.sh` launches both `sprout_april.js` and `sprout_posts.js` with `&`. They:
- Hit Sprout API concurrently → double the 429 rate-limit pressure.
- Write to the **same spreadsheet** (per group) concurrently → intermittent 429 from Sheets, occasional `exceeds grid limits` errors.
- Race on `findExistingSpreadsheet` → both may attempt to create the same new sheet if it doesn't exist yet (Drive returns one of two copies).

**Fix**: run them sequentially. `sprout_april.js` first, then `sprout_posts.js`. Change `run-sprout.sh` to:

```bash
#!/bin/bash
cd ~/Automation-excel-daily
/usr/bin/node sprout_april.js >> ~/Automation-excel-daily/sprout_april.log 2>&1
/usr/bin/node sprout_posts.js  >> ~/Automation-excel-daily/sprout_posts.log  2>&1
```

(And/or add a lockfile per group to guarantee serialization at the sheet level.)

### 6.3 🟠 High — silent null on sustained API failure
[utils/api.js:37](utils/api.js#L37) returns `null` after N retries instead of throwing. The caller in [utils/api.js:288-293](utils/api.js#L288-L293) simply logs `Skipping profile ${profileId} due to repeated request failures` and moves on. There is **no aggregated summary** of how many profiles were dropped, so a 429-storm during the run looks identical to "that profile just had no data."

**Fix**: accumulate a `droppedProfiles[]` array and include its length in the completion email. If `dropped > 0`, set subject prefix `⚠️`.

### 6.4 🟠 High — storage-quota skip is invisible
[sprout_april.js:248-258](sprout_april.js#L248-L258) catches quota errors on spreadsheet creation and returns `status: Skipped`. If the Drive target folder is near quota, whole groups are skipped. Currently only visible in the HTML email table.

**Fix**: emit a clear WARNING line at the top of the final log and in the email subject.

### 6.5 🟠 High — `sprout_posts.js` crashes before email
[sprout_posts.js:410-417](sprout_posts.js#L410-L417) references `executionTimeMin`, `executionTimeSec`, and `allResults` which are never defined. `ReferenceError` terminates the process with a non-zero exit. All data writes before this line have already completed, so **data is OK**, but **no post-level completion email is ever sent**.

**Fix**: compute the variables properly and rename `results` → `allResults` in the email call. Two-line edit.

### 6.6 🟡 Medium — entire date range re-fetched daily
Both scripts fetch from `2025-04-01` → `D-2` every run. That's ~400 days × 250 profiles × many network metrics. Run takes hours; if Sprout rate-limits you, the whole tail of the alphabet suffers. Historical data never changes — only the last ~3 days can shift.

**Fix**: default `START_DATE = today - 7` (or configurable). Keep an explicit backfill mode (`--backfill-from=2025-04-01`) you can run manually when needed.

### 6.7 🟡 Medium — dead code confuses operators
`simple-analytics.js`, `schedule-daily-update.js`, `group-analytics.js`, `hardcoded_*.js`, `api/cron.js`, `simple-auth.js`, `test-oauth.js` are not on the prod path. Their hardcoded date windows, tokens, and folder IDs mislead anyone trying to understand or modify the system. Delete or move to `legacy/`.

### 6.8 🟡 Medium — no monitoring
Today if the cron fails or the run silently processes only half the groups, nobody notices for days. There is no heartbeat, no alert on missing email, no dashboard.

### 6.9 🟡 Low — secrets in source control
See §2.5. Not a data-loss issue, but a compliance issue. Rotate and move to env vars.

### 6.10 🟡 Low — `schedule-daily-update.js` would double-schedule if invoked
If anyone ever changes `run-sprout.sh` to call `node schedule-daily-update.js`, the script runs once immediately AND schedules a node-schedule rule for 11:40 PM IST — but the next day's cron re-launches it, leaking processes. Kill the file.

---

## 7. Operational runbook

### 7.1 Is today's run healthy?

```bash
# Did cron fire?
sudo grep CRON /var/log/syslog | grep run-sprout | tail -3

# Are the logs growing?
tail -f ~/Automation-excel-daily/sprout_april.log
tail -f ~/Automation-excel-daily/sprout_posts.log

# Are the node processes still alive?
pgrep -af "node sprout_april.js"
pgrep -af "node sprout_posts.js"

# Was the email received? (check atharva/ansh/yadnesh inboxes)
```

### 7.2 Run manually (off-schedule)

```bash
cd ~/Automation-excel-daily

# Both in parallel (same as cron):
./run-sprout.sh

# Just profile-level:
/usr/bin/node sprout_april.js 2>&1 | tee -a sprout_april.manual.log

# Just posts:
/usr/bin/node sprout_posts.js 2>&1 | tee -a sprout_posts.manual.log
```

### 7.3 Kill a stuck run

```bash
pkill -f "node sprout_april.js"
pkill -f "node sprout_posts.js"
```

### 7.4 Rotate logs (they grow unbounded)

Logs are already rotated (`sprout_april.log.1`, `.2.gz`, …). Check `/etc/logrotate.d/` for the rule if you need to change retention, or compress manually:

```bash
mv sprout_april.log sprout_april.log.$(date +%F) && gzip sprout_april.log.$(date +%F)
```

### 7.5 Google Drive storage quota

The service account has its own Drive quota. When it fills up, creating new spreadsheets fails and whole groups are silently skipped. Mitigation: archive old/unused `Copy of <group>` sheets out of folder `13XPLx5l1LuPeJL2Ue03ZztNQUsNgNW06`.

### 7.6 Rotating the Sprout API token

1. Generate a new token in Sprout admin.
2. Update `~/Automation-excel-daily/env.js` (or wherever `SPROUT_API_TOKEN` env lives).
3. Also update every hardcoded occurrence in source (§2.5) — until §6.9 is fixed.
4. Manually test: `node -e "require('axios').get('https://api.sproutsocial.com/v1/2653573/metadata/customer', { headers: { Authorization: 'Bearer <token>', 'Content-Type': 'application/json' } }).then(r => console.log(r.data.data.length))"`.

---

## 8. Staged improvement plan (recommended order)

Numbered so you can do them in phases without all-or-nothing risk. Each phase is reversible.

### Phase 1 — Stop silent data loss (1 day, low risk)
1. Change `run-sprout.sh` to run the two scripts **sequentially** (§6.2). Single-line edit. Biggest reliability win.
2. Fix the `ReferenceError` in `sprout_posts.js` so its completion email sends (§6.5). Two-line edit.
3. Disambiguate duplicate-named spreadsheets: include the group ID in the Drive file name (§6.1). One helper change in `driveUtils.findExistingSpreadsheet` + name pattern.
4. Delete dead-code files (§6.7). Zero behavior change; big readability win.

### Phase 2 — Visibility (2-3 days, low risk)
5. Add a `droppedProfiles[]` / `skippedGroups[]` aggregator and surface counts in the completion email subject **and** in a "Run Summary" block at the top of the log. You want to see "Processed 135 groups, 0 dropped" vs "Processed 135 groups, 14 dropped" at a glance.
6. Write a one-line **heartbeat file** at the end of a successful run: `date > ~/Automation-excel-daily/.last-success`. Add a second cron at 11:00 IST that emails an alert if the file is older than 6 hours.
7. Add a `--dry-run` flag that fetches from Sprout but writes nothing — useful for diagnosing without polluting sheets.
8. Default `START_DATE = today - 7`, with a `--start YYYY-MM-DD` CLI flag for manual backfills (§6.6). Makes daily runs go from hours to minutes.

### Phase 3 — Secrets and code hygiene (1 day, medium risk)
9. Remove all hardcoded tokens; load from `env.js` / `process.env` everywhere. Rotate the Sprout token and gmail app password (§2.5, §6.9).
10. Add a `.env.example` to the repo so handover is self-contained.
11. Pin Node version via `.nvmrc` and document it in this file.

### Phase 4 — Architecture (1 week, higher risk, only after Phase 1-3 stabilize)
12. Collapse `sprout_april.js` and `sprout_posts.js` into a single `bin/run.js` with flags (`--profile`, `--posts`, `--groups=<csv>`). They share 90% of their logic.
13. Replace the per-group 75 s sleep with adaptive pacing based on observed 429s.
14. Per-group lockfile (`/tmp/sprout-<groupId>.lock`) so parallel runs can coexist safely if you ever want to shard.
15. Persist a run manifest (JSON) to S3 or a local DB: `run_id, started_at, finished_at, groups_processed, groups_skipped, profiles_dropped, errors[]`. This is the foundation for a real dashboard.

### Phase 5 — Observability (ongoing, optional)
16. Push a metric per run (groups processed, duration, error count) to CloudWatch or a simple Grafana Cloud instance. Alert on regressions.
17. Weekly digest email that summarizes 7 days of runs (trends, most-frequent failing groups).

---

## 9. Open questions for the product owner

- **Which data specifically looks "not fetched"?** Is it a particular group, a particular metric, recent dates, or historical? The answer narrows Phase 1 action #1 vs #3.
- **Do we need both profile-level AND post-level daily?** If post-level is monthly-sufficient, decouple them (Phase 1 #1 becomes trivially safe).
- **Is the `simple-analytics.js` folder `1O0In92io6PksS-VEdr1lyD-VfVC6mVV3` still meaningful?** Nobody is writing to it. If it's a legacy output, we can formally decommission.

---

## 10. Appendix — Google Drive / Sheets

- Output folder (active): https://drive.google.com/drive/folders/13XPLx5l1LuPeJL2Ue03ZztNQUsNgNW06
- Output folder (legacy/dead): https://drive.google.com/drive/folders/1O0In92io6PksS-VEdr1lyD-VfVC6mVV3

- Service account email: check `client_email` in `~/Automation-excel-daily/service-account.json` on EC2. This is the identity that must retain Editor access on the folder above.

- Sprout Social customer ID: `2653573`.

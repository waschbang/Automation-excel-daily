## Workflow Orchestration

### 1. Plan Node Default

- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately -- don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy

- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop

- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done

- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)

- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes -- don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing

- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests -- then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

---

## Task Management

1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to `tasks/todo.md`
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections

---

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.

---

## Project Context

### What this repo does
Daily 07:00 IST cron on EC2 pulls analytics from Sprout Social → writes to Google Sheets in Drive folder `13XPLx5l1LuPeJL2Ue03ZztNQUsNgNW06` (one `Copy of <Group>` spreadsheet per Sprout Customer Group, ~135 groups). Two pipelines: **profile-level daily metrics** (sprout_april.js) and **post-level metrics** (sprout_posts.js).

### Runtime & deployment
- Host: EC2 `ubuntu@ip-172-31-34-133` (Ubuntu 24.04), project dir `~/Automation-excel-daily`
- Cron: `30 1 * * * ~/Automation-excel-daily/run-sprout.sh` (01:30 UTC = 07:00 IST)
- Node 18+ (`/usr/bin/node`)
- Secrets on EC2 only: `env.js`, `service-account.json`, `private-key.pem`, `encoded.txt` (all gitignored)

### Active code paths (PRODUCTION)
- `run-sprout.sh` → launches `sprout_april.js` + `sprout_posts.js` in parallel (race conditions — see REFACTOR_PLAN.md §1.3)
- `sprout_april.js` — profile-level pipeline; full backfill `2025-04-01 → D-2` every run
- `sprout_posts.js` — post-level pipeline; same date range; **has a ReferenceError at end before email send** (no data loss, just no email)
- `utils/*` — api client, auth, sheets, drive, groups, email helpers
- `platforms/{network}.js` + `{network}_posts.js` — column definitions and row formatters per network

### Dead code (NOT invoked by prod cron — scheduled for quarantine in Phase 1)
`simple-analytics.js`, `schedule-daily-update.js`, `group-analytics.js`, `hardcoded_april.js`, `hardcoded_sprout_posts.js`, `api/cron.js`, `simple-auth.js`, `test-oauth.js`, `check-apis.js`

### Key documents (read these in order)
1. **[docs/HANDOVER.md](docs/HANDOVER.md)** — operational reference: architecture, EC2 setup, runbook, 10 known bugs ranked by impact
2. **[docs/REFACTOR_PLAN.md](docs/REFACTOR_PLAN.md)** — phased refactor blueprint; single source of truth for the migration
3. **[tasks/todo.md](tasks/todo.md)** — current phase checklist
4. **[tasks/lessons.md](tasks/lessons.md)** — accumulated corrections and patterns

### Contract (must not change during refactor)
- Output Drive folder IDs (`13XPLx5l1LuPeJL2Ue03ZztNQUsNgNW06` for profile+posts)
- Spreadsheet tab names (`Instagram`, `Facebook`, `Linkedin`, `Twitter`, `Youtube`, `instagram_post`, `facebook_post`, ...)
- Column headers per tab (row 1)
- Email recipients
- 07:00 IST schedule
- Customer ID `2653573` and service account identity

### Known silent-failure paths (do not introduce more)
1. Duplicate group NAMES in Sprout (`Rajasthan Revealed`, `Birla Opus`, `RCAT Rajasthan`, `Phoenix`/`Pheonix`) collide in `findExistingSpreadsheet`; second group clobbers first. Phase 5 fix: include groupId in spreadsheet name.
2. `requestWithRetry` returns `null` on sustained 429 → profile silently dropped. Phase 7 fix: aggregate `droppedProfiles[]` + surface in email subject.
3. Drive storage quota exceeded → whole group silently skipped. Phase 7 fix: loud warning.
4. Parallel execution of the two pipelines → race on same sheets. Phase 1 fix: make `run-sprout.sh` sequential.

### Refactor rules
- Follow REFACTOR_PLAN.md phase by phase. Do not skip phases.
- Every change must be reversible in one `git revert`.
- Do not touch production EC2 while a manual backfill is in progress.
- Update `tasks/todo.md` as items complete. Add entries to `tasks/lessons.md` after any correction.
- Default behavior (sheets, emails, cron schedule) must stay identical through Phases 1-4. Behavior changes are introduced explicitly and named in Phases 5+ (dedup, incremental fetch, observability).

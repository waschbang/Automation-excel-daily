# Lessons

Append one entry per correction. Format:

```
## YYYY-MM-DD — <short rule>
- Context: <what happened>
- Pattern to follow: <rule in one sentence>
- Why: <reason, often a past incident>
```

Review at the start of each session before touching this project.

---

## 2026-04-23 — Never paste shell prompts verbatim
- Context: Pasting transcript output (including `ubuntu@host:~$` prefix) into a live bash shell caused bash to parse and execute garbled CRON syslog text as commands, spawning two unintended duplicate `node sprout_april.js` + `node sprout_posts.js` processes that raced against the in-flight cron run.
- Pattern to follow: When giving users commands, never include shell prompts (`$`, `>`) in code blocks. When receiving terminal output from users, do not assume any part of it is safe to re-run.
- Why: The duplicate processes competed for the same Google Sheets writes and nearly corrupted an in-flight backfill.

## 2026-04-23 — "If X is empty, do Y" requires the user to verify X first
- Context: Gave a fallback command prefixed with "If pgrep is empty…". User ran the fallback even though pgrep showed two live PIDs, spawning duplicates for the second time.
- Pattern to follow: Instead of conditional fallbacks, ask the user to paste the current state first and only then issue the next command. Never chain "if empty, do X" fallbacks in the same message as the primary instruction.
- Why: Conditional commands in sequence are dangerous with non-expert shell users.

## 2026-04-23 — Backgrounded `sleep N &&` does not block foreground sanity checks
- Context: Used `sleep 30 && ... &` in the background and `sleep 20` in the foreground to check PIDs. Foreground check fired before the background sleep finished, so `pgrep` returned empty — misleadingly suggesting failure.
- Pattern to follow: When verifying a backgrounded process spawned, wait at least as long as any leading `sleep` inside the backgrounded chain, plus a margin. Or remove the leading sleep entirely and verify with a loop: `for i in {1..15}; do pgrep -af <proc> && break; sleep 2; done`.
- Why: Race-condition verification gives false negatives and prompts destructive retry actions.

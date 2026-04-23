#!/usr/bin/env node

/**
 * Unified CLI entry point.
 *
 * Usage:
 *   node bin/run.js                              Run both pipelines sequentially (profile, then posts)
 *   node bin/run.js --pipeline=profile           Only the profile-level pipeline
 *   node bin/run.js --pipeline=posts             Only the post-level pipeline
 *   node bin/run.js --pipeline=both              Same as default
 *
 * Flags reserved for future phases (currently parsed but not wired):
 *   --groups=id1,id2         Run only these Customer Group IDs
 *   --backfill=YYYY-MM-DD    Force full refetch from this start date
 *   --refresh-days=N         Override incremental refresh window (default 14)
 *   --dry-run                Fetch from Sprout but write nothing to Sheets
 *   --verbose                DEBUG-level logging
 */

const PIPELINES = {
  profile: () => require('../src/pipelines/profileMetrics'),
  posts:   () => require('../src/pipelines/postMetrics'),
};

function parseArgs(argv) {
  const opts = {
    pipeline: 'both',
    groups: null,
    backfill: null,
    refreshDays: null,
    dryRun: false,
    verbose: false,
  };
  for (const raw of argv) {
    if (raw === '--dry-run') { opts.dryRun = true; continue; }
    if (raw === '--verbose') { opts.verbose = true; continue; }
    const m = raw.match(/^--([^=]+)=(.+)$/);
    if (!m) continue;
    const [, k, v] = m;
    if (k === 'pipeline') opts.pipeline = v;
    else if (k === 'groups') opts.groups = v.split(',').map((s) => s.trim()).filter(Boolean);
    else if (k === 'backfill') opts.backfill = v;
    else if (k === 'refresh-days') opts.refreshDays = parseInt(v, 10);
  }
  if (!['profile', 'posts', 'both'].includes(opts.pipeline)) {
    throw new Error(`Unknown --pipeline=${opts.pipeline}. Use profile | posts | both.`);
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  console.log(`[run] pipeline=${opts.pipeline} dryRun=${opts.dryRun} verbose=${opts.verbose}`);
  if (opts.groups) console.log(`[run] groups=${opts.groups.join(',')}`);
  if (opts.backfill) console.log(`[run] backfill=${opts.backfill}`);
  if (opts.refreshDays != null) console.log(`[run] refreshDays=${opts.refreshDays}`);

  const order = opts.pipeline === 'both' ? ['profile', 'posts'] : [opts.pipeline];

  for (const name of order) {
    const pipeline = PIPELINES[name]();
    console.log(`\n[run] === starting ${name} pipeline ===`);
    const started = Date.now();
    try {
      await pipeline.run(opts);
    } catch (err) {
      console.error(`[run] ${name} pipeline failed:`, err?.message || err);
      if (err?.stack) console.error(err.stack);
      // Continue to next pipeline rather than aborting the whole run.
    }
    const elapsedSec = Math.round((Date.now() - started) / 1000);
    console.log(`[run] === finished ${name} pipeline in ${elapsedSec}s ===`);
  }
}

// Process-wide safety net — log but do not crash
process.on('uncaughtException', (err) => {
  console.error('[run] uncaughtException:', err?.message || err);
  if (err?.stack) console.error(err.stack);
});
process.on('unhandledRejection', (reason) => {
  console.error('[run] unhandledRejection:', reason?.message || reason);
});

main().catch((err) => {
  console.error('[run] fatal:', err?.message || err);
  process.exit(1);
});

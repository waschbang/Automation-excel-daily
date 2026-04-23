#!/usr/bin/env node

/**
 * Shim for backward-compatible cron invocation.
 * New canonical entry: `node bin/run.js --pipeline=posts`
 * This file is retained so existing run-sprout.sh on EC2 keeps working.
 * Will be deleted in Phase 10.
 */
require('./src/pipelines/postMetrics').run().catch((err) => {
  console.error('posts pipeline failed:', err?.message || err);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
});

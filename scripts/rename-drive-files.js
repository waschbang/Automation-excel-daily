#!/usr/bin/env node

/**
 * One-off migration: rename legacy Drive files to canonical form.
 *
 *   Before:  "Copy of Birla Opus"
 *   After :  "Copy of Birla Opus [2764111]"
 *
 * Why:
 *   Sprout has multiple Customer Groups sharing display names. The
 *   legacy filename lookup (name-only) silently merged their data into
 *   one spreadsheet. Embedding [<groupId>] makes the file uniquely
 *   identifiable and lets the pipeline resolver (findSpreadsheetForGroup)
 *   route writes correctly.
 *
 * Safety:
 *   - Idempotent: files already ending in "[<groupId>]" are skipped.
 *   - Collision-aware: if two groups share a legacy name, the file is
 *     NOT renamed (since we cannot tell which owns the existing data).
 *     The next pipeline run will create fresh canonical files for each
 *     colliding group; the legacy file becomes orphaned and can be
 *     archived manually.
 *   - --dry-run: logs intended renames without calling the API.
 *   - --revert:  strips the "[<groupId>]" suffix back to legacy form.
 *
 * Usage:
 *   node scripts/rename-drive-files.js [--dry-run] [--revert]
 */

const { google } = require('googleapis');
const { getConfig } = require('../src/config');
const { authenticateWithEnv } = require('../src/clients/googleAuth');
const groupUtils = require('../src/core/groupResolver');
const {
  canonicalSpreadsheetName,
  extractGroupIdFromName,
} = require('../src/clients/drive');

const cfg = getConfig();

const FLAGS = {
  dryRun: process.argv.includes('--dry-run'),
  revert: process.argv.includes('--revert'),
};

const legacyName = (groupName) => `Copy of ${groupName}`;

async function listAllSpreadsheetsInFolder(drive, folderId) {
  const files = [];
  let pageToken = null;
  do {
    const resp = await drive.files.list({
      q: `mimeType='application/vnd.google-apps.spreadsheet' and '${folderId}' in parents and trashed=false`,
      fields: 'nextPageToken, files(id, name)',
      pageSize: 1000,
      pageToken: pageToken || undefined,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });
    files.push(...(resp.data.files || []));
    pageToken = resp.data.nextPageToken || null;
  } while (pageToken);
  return files;
}

async function fetchGroups() {
  return groupUtils.getCustomerGroups(cfg.sprout.baseUrl, cfg.sprout.customerId, cfg.sprout.apiToken);
}

function plan({ files, groups }) {
  // Group id set (for fast lookup), and group name → [groupIds]
  const nameToIds = new Map();
  for (const g of groups) {
    if (!g || !g.group_id) continue;
    const key = g.name || '';
    if (!nameToIds.has(key)) nameToIds.set(key, []);
    nameToIds.get(key).push(String(g.group_id));
  }

  const actions = [];
  for (const f of files) {
    const currentId = extractGroupIdFromName(f.name);
    if (FLAGS.revert) {
      if (!currentId) {
        actions.push({ kind: 'skip', file: f, reason: 'already-legacy' });
        continue;
      }
      // Find group by id to reconstruct legacy name
      const group = groups.find((g) => String(g.group_id) === currentId);
      if (!group) {
        actions.push({ kind: 'skip', file: f, reason: 'groupId-in-name-not-found' });
        continue;
      }
      const target = legacyName(group.name);
      if (f.name === target) {
        actions.push({ kind: 'skip', file: f, reason: 'already-target' });
      } else {
        actions.push({ kind: 'rename', file: f, from: f.name, to: target });
      }
      continue;
    }

    // Forward migration
    if (currentId) {
      actions.push({ kind: 'skip', file: f, reason: 'already-canonical' });
      continue;
    }
    // Try to match on legacy name "Copy of <GroupName>"
    let matchedGroup = null;
    for (const g of groups) {
      if (!g || !g.name) continue;
      if (f.name === legacyName(g.name)) {
        matchedGroup = g;
        break;
      }
    }
    if (!matchedGroup) {
      actions.push({ kind: 'skip', file: f, reason: 'no-matching-group' });
      continue;
    }
    const idsWithSameName = nameToIds.get(matchedGroup.name) || [];
    if (idsWithSameName.length > 1) {
      actions.push({
        kind: 'skip',
        file: f,
        reason: `collision: ${idsWithSameName.length} groups share name "${matchedGroup.name}" (ids: ${idsWithSameName.join(', ')}). Pipeline will create fresh canonical files for each.`,
      });
      continue;
    }
    const target = canonicalSpreadsheetName(matchedGroup.name, matchedGroup.group_id);
    if (f.name === target) {
      actions.push({ kind: 'skip', file: f, reason: 'already-target' });
    } else {
      actions.push({ kind: 'rename', file: f, from: f.name, to: target });
    }
  }
  return actions;
}

async function applyRename(drive, file, newName) {
  return drive.files.update({
    fileId: file.id,
    resource: { name: newName },
    fields: 'id, name',
    supportsAllDrives: true,
  });
}

async function main() {
  console.log(`[rename] mode=${FLAGS.revert ? 'revert' : 'forward'}${FLAGS.dryRun ? ' DRY-RUN' : ''}`);
  const { drive } = await authenticateWithEnv();
  drive.context = { ...drive.context }; // no-op, keeps TS happy

  const folderId = cfg.drive.folderId;
  console.log(`[rename] target folder: ${folderId}`);

  console.log('[rename] fetching Sprout Customer Groups…');
  const groups = await fetchGroups();
  console.log(`[rename] ${groups.length} groups`);

  console.log('[rename] listing Drive files…');
  const files = await listAllSpreadsheetsInFolder(drive, folderId);
  console.log(`[rename] ${files.length} spreadsheets in folder`);

  const actions = plan({ files, groups });

  const renames = actions.filter((a) => a.kind === 'rename');
  const skips = actions.filter((a) => a.kind === 'skip');

  console.log(`\n[rename] plan: ${renames.length} rename(s), ${skips.length} skip(s)`);
  for (const a of renames) {
    console.log(`  RENAME  "${a.from}"  →  "${a.to}"`);
  }
  const skipReasons = {};
  for (const a of skips) skipReasons[a.reason] = (skipReasons[a.reason] || 0) + 1;
  for (const [r, n] of Object.entries(skipReasons)) {
    console.log(`  SKIP    (${n})  ${r}`);
  }

  if (FLAGS.dryRun) {
    console.log('\n[rename] dry-run: no changes applied.');
    return;
  }

  if (renames.length === 0) {
    console.log('\n[rename] nothing to do.');
    return;
  }

  console.log('\n[rename] applying renames…');
  let done = 0;
  let failed = 0;
  for (const a of renames) {
    try {
      await applyRename(drive, a.file, a.to);
      done++;
      if (done % 20 === 0) console.log(`  progress: ${done}/${renames.length}`);
    } catch (err) {
      failed++;
      console.error(`  FAILED  "${a.from}": ${err?.message || err}`);
    }
  }
  console.log(`\n[rename] done=${done} failed=${failed}`);
}

main().catch((err) => {
  console.error('[rename] fatal:', err?.message || err);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
});

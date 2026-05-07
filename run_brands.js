#!/usr/bin/env node

/**
 * Run sprout_april analytics for a specific list of brand groups only.
 *
 * Use this to backfill / repopulate the four brands that were reported
 * as missing data, without re-running the full 164-group nightly job.
 *
 * Usage:
 *   node run_brands.js
 *   node run_brands.js "GAIN by Galderma" "Maxx Protein"   (override list)
 */

const { google } = require('googleapis');
const groupUtils = require('./utils/groups');
const { authenticateWithEnv } = require('./utils/auth');
const {
  processGroupAnalytics,
  CUSTOMER_ID,
  SPROUT_API_TOKEN,
  FOLDER_ID,
  BASE_URL,
} = require('./sprout_april');

const DEFAULT_BRANDS = [
  'GAIN by Galderma',
  'Maxx Protein',
  'Simpolo',
  'simpolo',
  'Specta Quartz Surfaces',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const cliBrands = process.argv.slice(2);
  const targetNames = cliBrands.length > 0 ? cliBrands : DEFAULT_BRANDS;

  console.log('='.repeat(80));
  console.log('Brand-scoped Sprout run');
  console.log('Targets:', targetNames.join(', '));
  console.log('='.repeat(80));

  const start = Date.now();

  const { auth } = await authenticateWithEnv();
  const drive = google.drive({ version: 'v3', auth });
  const sheets = google.sheets({ version: 'v4', auth });

  try {
    await drive.files.get({ fileId: FOLDER_ID, fields: 'id,name', supportsAllDrives: true });
  } catch (e) {
    console.warn(`Folder access warning: ${e.message}`);
  }

  const groups = await groupUtils.getCustomerGroups(BASE_URL, CUSTOMER_ID, SPROUT_API_TOKEN);
  const profiles = await groupUtils.getAllProfiles(BASE_URL, CUSTOMER_ID, SPROUT_API_TOKEN);

  if (groups.length === 0 || profiles.length === 0) {
    console.error('Sprout returned no groups or no profiles — aborting.');
    process.exit(1);
  }

  const profilesByGroup = groupUtils.groupProfilesByGroup(profiles, groups);

  const wantedSet = new Set(targetNames.map((s) => s.toLowerCase()));
  const matchedGroups = Object.entries(profilesByGroup).filter(
    ([, data]) => data.groupName && wantedSet.has(data.groupName.toLowerCase())
  );

  if (matchedGroups.length === 0) {
    console.error('None of the requested brand names matched any Sprout group.');
    console.error('Sprout returned these names that look similar:');
    const ts = targetNames.map((s) => s.toLowerCase());
    Object.values(profilesByGroup).forEach((d) => {
      if (d.groupName && ts.some((t) => d.groupName.toLowerCase().includes(t.split(' ')[0]))) {
        console.error('  -', d.groupName);
      }
    });
    process.exit(1);
  }

  console.log(`\nMatched ${matchedGroups.length} group(s):`);
  matchedGroups.forEach(([gid, d]) => console.log(`  - ${d.groupName} (${gid})  profiles=${d.profiles.length}`));

  const googleClients = { auth, drive, sheets };
  const results = [];

  for (const [groupId, data] of matchedGroups) {
    if (!data.profiles || data.profiles.length === 0) {
      console.log(`Skipping ${data.groupName} — no profiles attached.`);
      continue;
    }
    console.log(`\n--- Processing ${data.groupName} (${groupId}) ---`);
    try {
      const r = await processGroupAnalytics(groupId, data.groupName, data.profiles, googleClients);
      if (Array.isArray(r)) results.push(...r);
    } catch (e) {
      console.error(`Group ${data.groupName} failed: ${e.message}`);
    }
    // Be gentle to Sheets/Sprout APIs between groups
    await sleep(45 * 1000);
  }

  const sec = Math.round((Date.now() - start) / 1000);
  console.log('\n' + '='.repeat(80));
  console.log(`Finished in ${Math.round(sec / 60 * 10) / 10} min (${sec}s)`);
  console.log('='.repeat(80));
  for (const r of results) {
    console.log(`${r.groupName}: ${r.status}${r.spreadsheetUrl ? '  ' + r.spreadsheetUrl : ''}`);
  }
})().catch((e) => {
  console.error('Fatal:', e.message);
  if (e.stack) console.error(e.stack);
  process.exit(1);
});

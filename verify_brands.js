#!/usr/bin/env node

/**
 * Verify that run_brands.js actually wrote data to the right spreadsheets.
 *
 * For each target brand:
 *   1. Resolve the spreadsheet using the same logic as processGroupAnalytics
 *      (findExistingSpreadsheet → in-folder substring match → global search).
 *   2. Print which spreadsheet ID was resolved (and whether it matches the
 *      URL the user expected).
 *   3. Read every network tab and count rows whose Date column falls in
 *      the script's window (2025-04-01 → today-2).
 */

const { google } = require('googleapis');
const { authenticateWithEnv } = require('./utils/auth');
const groupUtils = require('./utils/groups');
const driveUtils = require('./utils/simple-drive');

const CUSTOMER_ID = '2653573';
const SPROUT_API_TOKEN = 'MjY1MzU3M3wxNzUyMjE2ODQ5fDdmNzgxNzQyLWI3NWEtNDFkYS1hN2Y4LWRkMTE3ODRhNzBlNg==';
const FOLDER_ID = '13XPLx5l1LuPeJL2Ue03ZztNQUsNgNW06';
const BASE_URL = 'https://api.sproutsocial.com/v1';

// Brand → expected spreadsheet ID (from the URLs you shared)
const EXPECTED_SHEETS = {
  'GAIN by Galderma': '1F6wYJ8T7vOvfbltmCE8z-L7rOAGSLt3ZqO3DhdRaJlQ',
  'Maxx Protein': '1eZenWB9B5Y-CbBAKB_4oZlQGkQ9cn0lPolYGcQBElfQ',
  'Simpolo': '1o1r-QW-ilfVMzeM8F-gNTr33x0oC182dIp8nvpq_fUE',
  'simpolo': '1o1r-QW-ilfVMzeM8F-gNTr33x0oC182dIp8nvpq_fUE',
  'Specta Quartz Surfaces': '1No7_qy4_gYMtgfsOex6C9TyF3-Sxx6BlUnnv5uz5yJs',
};

const TARGET_NAMES = Object.keys(EXPECTED_SHEETS);

const NETWORK_TABS = ['Facebook', 'Instagram', 'Linkedin', 'Twitter', 'Youtube', 'Pinterest'];

function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
const today = new Date();
const dMinus2 = new Date(today); dMinus2.setDate(dMinus2.getDate() - 2);
const WINDOW_START = '2025-04-01';
const WINDOW_END = fmtDate(dMinus2);

function normalizeDate(value) {
  if (value == null) return '';
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const asNum = Number(raw);
  if (!Number.isNaN(asNum) && raw !== '') {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const ms = epoch.getTime() + Math.round(asNum) * 86400000;
    const dt = new Date(ms);
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,'0')}-${String(dt.getUTCDate()).padStart(2,'0')}`;
  }
  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth()+1).padStart(2,'0')}-${String(parsed.getDate()).padStart(2,'0')}`;
  }
  return '';
}

async function resolveSpreadsheet(drive, groupName) {
  // Step 1: same as processGroupAnalytics - findExistingSpreadsheet on "Copy of <name>"
  const baseNamePattern = `Copy of ${groupName}`;
  let id = await driveUtils.findExistingSpreadsheet(drive, baseNamePattern, FOLDER_ID);
  if (id) return { id, via: `findExistingSpreadsheet("${baseNamePattern}")` };

  // Step 2: substring match in folder
  const list = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.spreadsheet' and '${FOLDER_ID}' in parents and trashed=false`,
    fields: 'files(id, name, modifiedTime)',
    orderBy: 'modifiedTime desc',
    pageSize: 1000,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
  });
  const lower = groupName.toLowerCase();
  const matches = (list.data.files || []).filter(f =>
    f.name.toLowerCase().includes(lower) || lower.includes(f.name.toLowerCase())
  );
  if (matches.length > 0) return { id: matches[0].id, via: `in-folder substring match "${matches[0].name}"` };

  // Step 3: global pattern search
  try {
    const g = await driveUtils.findSpreadsheetByPattern(drive, baseNamePattern, null);
    if (g && g.id) return { id: g.id, via: `global search "${g.name}"` };
  } catch (_) {}

  return { id: null, via: 'NOT FOUND' };
}

async function inspectSheet(sheets, drive, spreadsheetId) {
  // Drive metadata
  let meta;
  try {
    meta = await drive.files.get({ fileId: spreadsheetId, fields: 'id,name,parents,trashed', supportsAllDrives: true });
  } catch (e) {
    return { error: `drive.get failed: ${e.message}` };
  }
  const inTargetFolder = (meta.data.parents || []).includes(FOLDER_ID);

  // Tabs
  const ss = await sheets.spreadsheets.get({ spreadsheetId, includeGridData: false });
  const tabs = (ss.data.sheets || []).map(s => s.properties.title);

  // Per-tab row counts in window
  const tabStats = {};
  for (const tabName of tabs) {
    if (!NETWORK_TABS.includes(tabName) && !tabName.endsWith('_post')) continue;
    try {
      const r = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${tabName}!A:A` });
      const rows = r.data.values || [];
      let inWindow = 0;
      let firstDate = null;
      let lastDate = null;
      for (let i = 1; i < rows.length; i++) {
        const d = normalizeDate(rows[i] && rows[i][0]);
        if (!d) continue;
        if (d >= WINDOW_START && d <= WINDOW_END) {
          inWindow++;
          if (!firstDate || d < firstDate) firstDate = d;
          if (!lastDate || d > lastDate) lastDate = d;
        }
      }
      tabStats[tabName] = { totalRows: Math.max(0, rows.length - 1), inWindow, firstDate, lastDate };
    } catch (e) {
      tabStats[tabName] = { error: e.message };
    }
  }

  return {
    name: meta.data.name,
    parents: meta.data.parents,
    inTargetFolder,
    tabs,
    tabStats,
  };
}

(async () => {
  console.log('='.repeat(80));
  console.log(`Verifying brand sheets — window ${WINDOW_START} → ${WINDOW_END}`);
  console.log('='.repeat(80));

  const { auth } = await authenticateWithEnv();
  const drive = google.drive({ version: 'v3', auth });
  const sheets = google.sheets({ version: 'v4', auth });

  const groups = await groupUtils.getCustomerGroups(BASE_URL, CUSTOMER_ID, SPROUT_API_TOKEN);

  const seen = new Set();
  for (const targetName of TARGET_NAMES) {
    const matchedGroup = groups.find(g => g.name === targetName);
    console.log('\n' + '─'.repeat(80));
    console.log(`Brand: ${targetName}`);
    console.log('─'.repeat(80));
    if (!matchedGroup) {
      console.log('  ✗ Group not found in Sprout');
      continue;
    }
    console.log(`  Sprout group_id: ${matchedGroup.group_id}`);

    const expected = EXPECTED_SHEETS[targetName];
    console.log(`  Expected spreadsheet (from URL you shared): ${expected}`);

    const resolved = await resolveSpreadsheet(drive, targetName);
    console.log(`  Resolved by script logic: ${resolved.id || 'NONE'}  via ${resolved.via}`);
    if (resolved.id && resolved.id !== expected) {
      console.log(`  ⚠ MISMATCH: script wrote to a different spreadsheet than the URL you shared.`);
    } else if (resolved.id === expected) {
      console.log(`  ✓ Match — script targets the same spreadsheet you opened.`);
    }

    // Inspect the resolved spreadsheet (where the script actually wrote)
    if (resolved.id && !seen.has(resolved.id)) {
      seen.add(resolved.id);
      const info = await inspectSheet(sheets, drive, resolved.id);
      if (info.error) {
        console.log(`  ✗ Could not inspect resolved sheet: ${info.error}`);
      } else {
        console.log(`  Sheet name: "${info.name}"  inTargetFolder=${info.inTargetFolder}`);
        console.log(`  Tabs: ${info.tabs.join(', ')}`);
        for (const [tab, s] of Object.entries(info.tabStats)) {
          if (s.error) console.log(`    - ${tab}: error ${s.error}`);
          else console.log(`    - ${tab}: rowsInWindow=${s.inWindow}/${s.totalRows}  range=${s.firstDate || '-'}..${s.lastDate || '-'}`);
        }
      }
    }

    // Also inspect the expected (URL) spreadsheet if different
    if (expected && resolved.id !== expected && !seen.has(expected)) {
      seen.add(expected);
      console.log(`  -- inspecting URL spreadsheet ${expected} for comparison --`);
      const info = await inspectSheet(sheets, drive, expected);
      if (info.error) {
        console.log(`  ✗ Could not inspect URL sheet: ${info.error}`);
      } else {
        console.log(`  Sheet name: "${info.name}"  inTargetFolder=${info.inTargetFolder}  parents=${JSON.stringify(info.parents)}`);
        console.log(`  Tabs: ${info.tabs.join(', ')}`);
        for (const [tab, s] of Object.entries(info.tabStats)) {
          if (s.error) console.log(`    - ${tab}: error ${s.error}`);
          else console.log(`    - ${tab}: rowsInWindow=${s.inWindow}/${s.totalRows}  range=${s.firstDate || '-'}..${s.lastDate || '-'}`);
        }
      }
    }
  }

  console.log('\nDone.');
})().catch(e => { console.error('Fatal:', e.message); process.exit(1); });

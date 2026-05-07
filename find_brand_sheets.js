#!/usr/bin/env node

/**
 * Find ALL Google Sheets (across Drive) whose name contains a brand keyword.
 *
 * For each brand we look up every matching spreadsheet — not just the
 * "Copy of <name>" file the script writes to — so we can detect duplicates
 * (e.g. an old "Simpolo" sheet someone is checking, separate from the
 * "Copy of Simpolo" sheet the script actually populates).
 *
 * For each match it prints:
 *   - id, name, parent folder name, last modified, owner
 *   - whether it's the one the script writes to
 *   - row count + last populated date on Facebook / Instagram / Linkedin tabs
 */

const { google } = require('googleapis');
const { authenticateWithEnv } = require('./utils/auth');

const FOLDER_ID = '13XPLx5l1LuPeJL2Ue03ZztNQUsNgNW06';

// brand label → keywords to search for in spreadsheet names
const BRANDS = [
  { label: 'GAIN by Galderma',      keywords: ['gain', 'galderma'] },
  { label: 'Maxx Protein',          keywords: ['maxx protein', 'max protein', 'ritebite'] },
  { label: 'Simpolo',               keywords: ['simpolo'] },
  { label: 'Specta Quartz Surfaces', keywords: ['specta'] },
];

const NETWORK_TABS = ['Facebook', 'Instagram', 'Linkedin', 'Twitter', 'Youtube'];

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

async function searchDriveByKeyword(drive, keyword) {
  const q = `mimeType='application/vnd.google-apps.spreadsheet' and name contains '${keyword.replace(/'/g, "\\'")}' and trashed=false`;
  const all = [];
  let pageToken;
  do {
    const res = await drive.files.list({
      q,
      fields: 'nextPageToken, files(id, name, parents, modifiedTime, owners(emailAddress), driveId)',
      pageSize: 100,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      corpora: 'allDrives',
      pageToken,
    });
    all.push(...(res.data.files || []));
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return all;
}

async function getParentName(drive, parentId) {
  if (!parentId) return '(no parent)';
  try {
    const r = await drive.files.get({ fileId: parentId, fields: 'id,name', supportsAllDrives: true });
    return `${r.data.name} (${r.data.id})`;
  } catch (_) {
    return `(parent ${parentId} — no access)`;
  }
}

async function inspectTabs(sheets, ssid) {
  const out = {};
  let ss;
  try {
    ss = await sheets.spreadsheets.get({ spreadsheetId: ssid, includeGridData: false });
  } catch (e) {
    return { error: e.message };
  }
  const tabs = (ss.data.sheets || []).map(s => s.properties.title);
  for (const tab of tabs) {
    if (!NETWORK_TABS.includes(tab) && !tab.endsWith('_post')) continue;
    try {
      const r = await sheets.spreadsheets.values.get({ spreadsheetId: ssid, range: `${tab}!A:A` });
      const rows = r.data.values || [];
      let firstDate = null, lastDate = null, populated = 0;
      for (let i = 1; i < rows.length; i++) {
        const d = normalizeDate(rows[i] && rows[i][0]);
        if (!d) continue;
        populated++;
        if (!firstDate || d < firstDate) firstDate = d;
        if (!lastDate || d > lastDate) lastDate = d;
      }
      out[tab] = { totalRows: Math.max(0, rows.length - 1), datedRows: populated, firstDate, lastDate };
    } catch (e) {
      out[tab] = { error: e.message };
    }
  }
  out._allTabs = tabs;
  return out;
}

(async () => {
  console.log('Searching Drive for every spreadsheet matching each brand keyword...\n');

  const { auth } = await authenticateWithEnv();
  const drive = google.drive({ version: 'v3', auth });
  const sheets = google.sheets({ version: 'v4', auth });

  for (const b of BRANDS) {
    console.log('='.repeat(90));
    console.log(`Brand: ${b.label}    keywords: ${b.keywords.join(', ')}`);
    console.log('='.repeat(90));

    // Gather unique matches across all keywords
    const seen = new Map();
    for (const kw of b.keywords) {
      const files = await searchDriveByKeyword(drive, kw);
      for (const f of files) seen.set(f.id, f);
    }
    const matches = Array.from(seen.values());
    matches.sort((a, b) => (b.modifiedTime || '').localeCompare(a.modifiedTime || ''));

    if (matches.length === 0) {
      console.log('  (no matches)');
      continue;
    }
    console.log(`  Found ${matches.length} matching spreadsheet(s):\n`);

    for (const f of matches) {
      const parentId = (f.parents || [])[0];
      const parentName = await getParentName(drive, parentId);
      const inTargetFolder = (f.parents || []).includes(FOLDER_ID);
      const owner = (f.owners || [])[0]?.emailAddress || '(unknown)';
      const isCopyOf = f.name.toLowerCase().startsWith(`copy of ${b.label.toLowerCase()}`)
                    || b.keywords.some(k => f.name.toLowerCase().startsWith(`copy of ${k.toLowerCase()}`));

      console.log('-'.repeat(90));
      console.log(`  Name        : "${f.name}"`);
      console.log(`  ID          : ${f.id}`);
      console.log(`  Folder      : ${parentName}   inTargetFolder=${inTargetFolder}`);
      console.log(`  Modified    : ${f.modifiedTime}`);
      console.log(`  Owner       : ${owner}`);
      console.log(`  Script writes here? ${isCopyOf && inTargetFolder ? 'YES (Copy of <name> in target folder)' : 'no'}`);

      const tabs = await inspectTabs(sheets, f.id);
      if (tabs.error) {
        console.log(`  Tabs        : (read error: ${tabs.error})`);
      } else {
        console.log(`  All tabs    : ${tabs._allTabs.join(', ')}`);
        for (const [tab, s] of Object.entries(tabs)) {
          if (tab === '_allTabs') continue;
          if (s.error) console.log(`     ${tab}: error ${s.error}`);
          else console.log(`     ${tab}: rows=${s.totalRows}  datedRows=${s.datedRows}  range=${s.firstDate || '-'}..${s.lastDate || '-'}`);
        }
      }
    }
    console.log('');
  }

  console.log('Done.');
})().catch(e => { console.error('Fatal:', e.message); process.exit(1); });

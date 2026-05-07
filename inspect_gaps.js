#!/usr/bin/env node

/**
 * Drill into reported gaps. For each brand+date-range the user flagged,
 * read the sheet rows in that window and classify each row as:
 *   - POPULATED (any numeric metric > 0)
 *   - ALL_ZERO  (row exists but every metric is 0/empty)
 *   - MISSING   (no row exists for that date)
 *
 * Then print a per-day grid so you can see exactly where the gap is.
 */

const { google } = require('googleapis');
const { authenticateWithEnv } = require('./utils/auth');

const SHEETS = {
  'GAIN by Galderma': '1F6wYJ8T7vOvfbltmCE8z-L7rOAGSLt3ZqO3DhdRaJlQ',
  'Maxx Protein':     '1eZenWB9B5Y-CbBAKB_4oZlQGkQ9cn0lPolYGcQBElfQ',
  'Simpolo':          '1o1r-QW-ilfVMzeM8F-gNTr33x0oC182dIp8nvpq_fUE',
  'Specta Quartz':    '1No7_qy4_gYMtgfsOex6C9TyF3-Sxx6BlUnnv5uz5yJs',
};

// User-reported gap windows (inclusive)
const REPORTS = [
  { brand: 'Maxx Protein',     window: ['2026-03-16', '2026-05-05'] },
  { brand: 'GAIN by Galderma', window: ['2026-03-11', '2026-04-13'] },
  { brand: 'Simpolo',          window: ['2026-04-08', '2026-05-05'] },
  { brand: 'Specta Quartz',    window: ['2026-03-11', '2026-05-05'] },
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

function classifyRow(row) {
  // row = ['date', 'profile_name', metric1, metric2, ...]  (after column 1 are metrics)
  let nonEmpty = 0;
  let nonZero = 0;
  let total = 0;
  for (let i = 2; i < row.length; i++) {
    const v = row[i];
    if (v === undefined || v === null || v === '') continue;
    total++;
    const s = String(v).trim();
    if (s === '') continue;
    nonEmpty++;
    const n = Number(s.replace(/,/g, ''));
    if (!Number.isNaN(n) && n !== 0) nonZero++;
  }
  if (nonZero > 0) return 'POPULATED';
  if (nonEmpty > 0) return 'ALL_ZERO';
  return 'BLANK';
}

function eachDate(start, end) {
  const out = [];
  let d = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  while (d <= e) {
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

(async () => {
  const { auth } = await authenticateWithEnv();
  const sheets = google.sheets({ version: 'v4', auth });

  for (const r of REPORTS) {
    const ssid = SHEETS[r.brand];
    console.log('\n' + '='.repeat(90));
    console.log(`Brand: ${r.brand}    window: ${r.window[0]} → ${r.window[1]}`);
    console.log(`Sheet: ${ssid}`);
    console.log('='.repeat(90));

    if (!ssid) { console.log('  (no spreadsheet id)'); continue; }

    const ss = await sheets.spreadsheets.get({ spreadsheetId: ssid, includeGridData: false });
    const tabs = (ss.data.sheets || []).map(s => s.properties.title).filter(t => NETWORK_TABS.includes(t));

    for (const tab of tabs) {
      let resp;
      try {
        resp = await sheets.spreadsheets.values.get({ spreadsheetId: ssid, range: `${tab}!A:AZ` });
      } catch (e) {
        console.log(`  -- ${tab}: read error ${e.message}`);
        continue;
      }
      const rows = resp.data.values || [];
      if (rows.length < 2) { console.log(`  -- ${tab}: empty`); continue; }

      // Group rows by date and by profile-name (col B)
      // For each (date, profile) combo, classify
      const byDateProfile = new Map(); // date -> Map(profile -> classification)
      const profilesSeen = new Set();
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const date = normalizeDate(row[0]);
        if (!date) continue;
        if (date < r.window[0] || date > r.window[1]) continue;
        const profile = String(row[1] || '(unknown)').trim();
        profilesSeen.add(profile);
        const cls = classifyRow(row);
        if (!byDateProfile.has(date)) byDateProfile.set(date, new Map());
        byDateProfile.get(date).set(profile, cls);
      }

      const profiles = Array.from(profilesSeen);
      if (profiles.length === 0) {
        console.log(`  -- ${tab}: no rows in window`);
        continue;
      }

      console.log(`\n  -- ${tab} -- profiles in this tab: ${profiles.join(' | ')}`);

      // Per-profile summary
      for (const prof of profiles) {
        const allDates = eachDate(r.window[0], r.window[1]);
        const counts = { POPULATED: 0, ALL_ZERO: 0, BLANK: 0, MISSING: 0 };
        const missingDates = [];
        const allZeroDates = [];
        const blankDates = [];
        for (const d of allDates) {
          const cls = byDateProfile.get(d)?.get(prof);
          if (!cls) { counts.MISSING++; missingDates.push(d); }
          else {
            counts[cls]++;
            if (cls === 'ALL_ZERO') allZeroDates.push(d);
            if (cls === 'BLANK') blankDates.push(d);
          }
        }
        console.log(`     ${prof}:`);
        console.log(`       populated=${counts.POPULATED}  allZero=${counts.ALL_ZERO}  blank=${counts.BLANK}  missingRow=${counts.MISSING}   (window=${allDates.length} days)`);
        const summarize = (arr) => arr.length === 0 ? '' : (arr.length <= 8 ? arr.join(', ') : `${arr.slice(0,3).join(', ')} ... ${arr.slice(-3).join(', ')} (${arr.length} total)`);
        if (missingDates.length)  console.log(`       missing rows  : ${summarize(missingDates)}`);
        if (allZeroDates.length)  console.log(`       all-zero rows : ${summarize(allZeroDates)}`);
        if (blankDates.length)    console.log(`       blank rows    : ${summarize(blankDates)}`);
      }
    }
  }

  console.log('\nDone.');
})().catch(e => { console.error('Fatal:', e.message); process.exit(1); });

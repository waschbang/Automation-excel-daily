#!/usr/bin/env node

/**
 * Sprout Social Post-level Analytics to Google Sheets
 * --------------------------------------------------
 * For each customer group, fetches post-level analytics per profile from
 * Sprout Social posts endpoint and writes to new tabs in the existing
 * group spreadsheet: instagram_post, linkedin_post, facebook_post,
 * twitter_post, youtube_post.
 *
 * Behaviors mirror sprout_april.js:
 * - Same auth via utils/auth
 * - Same folder resolution: reuse existing group sheet (Copy of <GroupName>)
 * - Same date range logic (D-2 as single day)
 * - Clear rows within date range before writing to avoid duplicates
 * - Throttle and backoff to respect Sheets and API quotas
 */

const { google } = require('googleapis');
const path = require('path');

// Utils
const apiUtils = require('./utils/api');
const sheetsUtils = require('./utils/sheets');
const driveUtils = require('./utils/simple-drive');
const groupUtils = require('./utils/groups');

// Platform Post Modules
const igPosts = require('./platforms/instagram_posts');
const liPosts = require('./platforms/linkedin_posts');
const fbPosts = require('./platforms/facebook_posts');
const twPosts = require('./platforms/twitter_posts');
const ytPosts = require('./platforms/youtube_posts');

// API & Config (align with sprout_april.js)
const CUSTOMER_ID = "2653573";
const SPROUT_API_TOKEN = "MjY1MzU3M3wxNzUyMjE2ODQ5fDdmNzgxNzQyLWI3NWEtNDFkYS1hN2Y4LWRkMTE3ODRhNzBlNg==";
const FOLDER_ID = '13XPLx5l1LuPeJL2Ue03ZztNQUsNgNW06';
const BASE_URL = "https://api.sproutsocial.com/v1";
const POSTS_URL = `${BASE_URL}/${CUSTOMER_ID}/analytics/posts`;

const getCurrentDate = () => {
  const today = new Date();
  const d2 = new Date(today);
  d2.setDate(d2.getDate() - 2);
  const y = d2.getFullYear();
  const m = String(d2.getMonth() + 1).padStart(2, '0');
  const d = String(d2.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};
const date = getCurrentDate();
const START_DATE = '2025-04-01';
const END_DATE = '2025-09-02';

const WRITE_MIN_INTERVAL_MS = 2000;
let lastWriteAt = 0;
const sleep = (ms) => new Promise(res => setTimeout(res, ms));
async function throttleWrite() {
  const now = Date.now();
  const wait = Math.max(0, WRITE_MIN_INTERVAL_MS - (now - lastWriteAt));
  if (wait > 0) await sleep(wait);
  lastWriteAt = Date.now();
}

async function retryWithBackoff(fn, { maxAttempts = 5, baseDelayMs = 15000, onBeforeRetry = async () => {} } = {}) {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      const msg = err?.message || '';
      const code = err?.code || err?.response?.status;
      const isQuota = code === 429 || /quota exceeded|rate limit/i.test(msg);
      if (!isQuota || attempt >= maxAttempts) throw err;
      const delay = Math.round(baseDelayMs * Math.pow(2, attempt - 1) * (0.8 + Math.random() * 0.4));
      console.warn(`Quota hit. Cooling down for ${Math.round(delay/1000)}s before retry ${attempt}/${maxAttempts}...`);
      await onBeforeRetry(attempt, err);
      await sleep(delay);
    }
  }
}

// Normalize mapping
const networkTypeMapping = {
  'linkedin_company': 'linkedin',
  'fb_instagram_account': 'instagram',
  'fb_page': 'facebook',
  'youtube_channel': 'youtube',
  'twitter_profile': 'twitter'
};

const postModules = {
  instagram: igPosts,
  linkedin: liPosts,
  facebook: fbPosts,
  twitter: twPosts,
  youtube: ytPosts
};

function buildDateSet(startDateStr, endDateStr) {
  const set = new Set();
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    set.add(`${yyyy}-${mm}-${dd}`);
  }
  return set;
}

function normalizeSheetDateCell(value) {
  if (value == null) return '';
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const asNum = Number(raw);
  if (!Number.isNaN(asNum) && raw !== '') {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const ms = epoch.getTime() + Math.round(asNum) * 86400000;
    const dt = new Date(ms);
    const yyyy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) {
    const yyyy = parsed.getFullYear();
    const mm = String(parsed.getMonth() + 1).padStart(2, '0');
    const dd = String(parsed.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  return '';
}

async function fetchPostsForProfile(profileId, startDate, endDate, metrics) {
  const axios = require('axios');
  const hdrs = apiUtils.getSproutHeaders(SPROUT_API_TOKEN);
  const metricList = Array.isArray(metrics) && metrics.length ? metrics : undefined;

  const variants = [
    { label: 'created_time + metrics', filters: [`customer_profile_id.eq(${profileId})`, `created_time.in(${startDate}...${endDate})`], metrics: metricList },
    { label: 'created_time (no metrics)', filters: [`customer_profile_id.eq(${profileId})`, `created_time.in(${startDate}...${endDate})`], metrics: undefined },
    { label: 'reporting_period + metrics', filters: [`customer_profile_id.eq(${profileId})`, `reporting_period.in(${startDate}...${endDate})`], metrics: metricList },
    { label: 'reporting_period (no metrics)', filters: [`customer_profile_id.eq(${profileId})`, `reporting_period.in(${startDate}...${endDate})`], metrics: undefined }
  ];

  for (const v of variants) {
    const payload = {
      filters: v.filters,
      fields: [
        'created_time',
        'perma_link',
        'text',
        'internal.tags.id',
        'internal.sent_by.id',
        'internal.sent_by.email',
        'internal.sent_by.first_name',
        'internal.sent_by.last_name'
      ],
      timezone: 'America/Chicago',
      page: 1
    };
    if (v.metrics) payload.metrics = v.metrics;
    try {
      const resp = await apiUtils.requestWithRetry(
        () => axios.post(POSTS_URL, payload, { headers: hdrs }),
        `posts profile ${profileId} (${v.label})`
      );
      const arr = resp?.data?.data || [];
      console.log(`[Posts] profile=${profileId} variant="${v.label}" -> count=${arr.length}`);
      if (arr.length > 0) return arr;
    } catch (_) {
      // requestWithRetry already logs; continue to next variant
    }
  }
  console.warn(`[Posts] profile=${profileId} returned no data for any variant in ${startDate}..${endDate}`);
  return [];
}

function truncate(str, max = 500) {
  if (typeof str !== 'string') return str;
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + '…';
}

async function processGroup(groupId, groupName, profiles, googleClients) {
  const { drive, sheets, auth } = googleClients;
  const baseNamePattern = `Copy of ${groupName}`;

  // Resolve spreadsheet (reuse existing; do not create new unless necessary)
  let spreadsheetId = await driveUtils.findExistingSpreadsheet(drive, baseNamePattern, FOLDER_ID);
  if (!spreadsheetId) {
    // Attempt to find similar or global reuse (mirror logic in sprout_april.js fallback)
    try {
      const listResponse = await drive.files.list({
        q: `mimeType='application/vnd.google-apps.spreadsheet' and '${FOLDER_ID}' in parents and trashed=false`,
        fields: 'files(id, name, modifiedTime)',
        orderBy: 'modifiedTime desc',
        pageSize: 100,
        includeItemsFromAllDrives: true,
        supportsAllDrives: true
      });
      const allFiles = listResponse.data.files || [];
      const groupNameLower = groupName.toLowerCase();
      const possibleMatches = allFiles.filter(file => file.name.toLowerCase().includes(groupNameLower) || groupNameLower.includes(file.name.toLowerCase()));
      if (possibleMatches.length > 0) {
        spreadsheetId = possibleMatches[0].id;
        console.log(`Reusing spreadsheet: ${possibleMatches[0].name} (${spreadsheetId})`);
      } else {
        const globalMatch = await driveUtils.findSpreadsheetByPattern(drive, baseNamePattern, null);
        if (globalMatch && globalMatch.id) {
          spreadsheetId = globalMatch.id;
          console.log(`Reusing spreadsheet outside folder: ${globalMatch.name} (${spreadsheetId})`);
        }
      }
    } catch (e) {
      console.warn(`Failed to reuse spreadsheet for ${groupName}: ${e.message}`);
    }
  }
  if (!spreadsheetId) throw new Error(`No spreadsheet found for group ${groupName}.`);

  // Group profiles by simplified network type
  const profilesByNetwork = {};
  for (const p of profiles) {
    const net = networkTypeMapping[p.network_type] || (p.network_type || '').toLowerCase();
    if (!profilesByNetwork[net]) profilesByNetwork[net] = [];
    profilesByNetwork[net].push(p);
  }

  // Ensure tabs exist with headers later
  const createdTabs = new Set();

  const postsByNetwork = {};

  for (const [net, profs] of Object.entries(profilesByNetwork)) {
    postsByNetwork[net] = [];

    for (const profile of profs) {
      const profileId = profile.customer_profile_id;
      const mod = postModules[net];
      const metrics = mod && Array.isArray(mod.METRICS) ? mod.METRICS.map(m => m.key) : undefined;
      const data = await fetchPostsForProfile(profileId, START_DATE, END_DATE, metrics);
      for (const dp of data) {
        // Attach resolved basics for formatting later
        postsByNetwork[net].push({ dataPoint: dp, profile });
      }
      // gentle delay to avoid API rate limits between profiles
      await sleep(800 + Math.floor(Math.random() * 400));
    }
  }

  // For each network, ensure tab exists, set headers, then clear existing rows for date range and write
  for (const [net, posts] of Object.entries(postsByNetwork)) {
    if (!posts || posts.length === 0) continue;
    const mod = postModules[net];
    if (!mod) { console.log(`No module for ${net}, skipping`); continue; }

    const sheetName = mod.SHEET_NAME; // e.g., instagram_post

    // Create sheet if needed
    try {
      const resp = await sheets.spreadsheets.get({ spreadsheetId, includeGridData: false });
      const existingSheets = (resp.data.sheets || []).map(s => s.properties?.title);
      if (!existingSheets.includes(sheetName)) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          resource: { requests: [{ addSheet: { properties: { title: sheetName } } }] }
        });
        console.log(`Created sheet "${sheetName}"`);
      }
    } catch (e) {
      console.warn(`Sheet ensure failed for ${sheetName}: ${e.message}`);
    }
    createdTabs.add(sheetName);

    // Build headers using module's METRICS (titles)
    const headers = mod.buildHeaders(mod.METRICS);
    await mod.setupHeaders(sheetsUtils, auth, spreadsheetId, headers);

    // Clear rows within date range to avoid duplicates
    try {
      const existingValues = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${sheetName}!A:AZ` });
      const rows = existingValues.data.values || [];
      if (rows.length > 0) {
        const dateSet = buildDateSet(START_DATE, END_DATE);
        const rowsToClear = [];
        for (let i = 1; i < rows.length; i++) {
          const normalized = normalizeSheetDateCell(rows[i] && rows[i][0]);
          if (normalized && dateSet.has(normalized)) rowsToClear.push(i + 1);
        }
        if (rowsToClear.length > 0) {
          rowsToClear.sort((a,b)=>a-b);
          const ranges = [];
          let start = rowsToClear[0];
          let prev = rowsToClear[0];
          for (let i = 1; i < rowsToClear.length; i++) {
            const curr = rowsToClear[i];
            if (curr === prev + 1) {
              prev = curr;
            } else {
              ranges.push([start, prev]);
              start = curr; prev = curr;
            }
          }
          ranges.push([start, prev]);

          const ss = await sheets.spreadsheets.get({ spreadsheetId, includeGridData: false });
          const sheet = (ss.data.sheets || []).find(s => s.properties?.title === sheetName);
          const sheetId = sheet?.properties?.sheetId;
          if (sheetId == null) {
            const a1Ranges = ranges.map(([s,e]) => `${sheetName}!A${s}:AZ${e}`);
            await sheets.spreadsheets.values.batchClear({ spreadsheetId, resource: { ranges: a1Ranges } });
          } else {
            const deleteRequests = ranges
              .map(([s, e]) => ({ start: s - 1, end: e }))
              .sort((r1, r2) => r2.start - r1.start)
              .map(({ start, end }) => ({
                deleteDimension: {
                  range: { sheetId, dimension: 'ROWS', startIndex: start, endIndex: end }
                }
              }));
            await sheets.spreadsheets.batchUpdate({ spreadsheetId, resource: { requests: deleteRequests } });
          }
        }
      }
    } catch (e) {
      console.warn(`Failed clearing existing rows for ${sheetName}: ${e.message}`);
    }

    // Format rows
    const rows = posts.map(({ dataPoint, profile }) => mod.formatPostData(dataPoint, profile, headers, truncate));
    const filtered = rows.filter(r => Array.isArray(r) && r.length === headers.length);

    if (filtered.length === 0) {
      console.log(`No rows to write for ${sheetName}`);
      continue;
    }

    // Ensure capacity then write with throttling and backoff
    try { await driveUtils.ensureSheetCapacity(sheets, spreadsheetId, sheetName, filtered.length + 2000, Math.max(30, headers.length + 2)); } catch (_) {}
    await throttleWrite();
    await retryWithBackoff(async () => {
      await throttleWrite();
      return await mod.updateSheet(sheetsUtils, auth, spreadsheetId, filtered, sheetName);
    }, {
      maxAttempts: 7,
      baseDelayMs: 30000,
      onBeforeRetry: async () => {}
    });
  }

  return { groupId, groupName, spreadsheetId };
}

async function main() {
  try {
    console.log('Starting Post-level Analytics run');

    // Auth like sprout_april.js
    const { authenticateWithEnv } = require('./utils/auth');
    const authResult = await authenticateWithEnv();
    const auth = authResult.auth;
    let drive = authResult.drive;
    let sheets = authResult.sheets;

    drive = google.drive({ version: 'v3', auth });
    sheets = google.sheets({ version: 'v4', auth });

    // Verify folder
    try {
      await drive.files.get({ fileId: FOLDER_ID, fields: 'id,name', supportsAllDrives: true });
    } catch (e) {
      console.warn(`Folder access warning: ${e.message}`);
    }

    // Fetch groups and profiles
    const groups = await groupUtils.getCustomerGroups(BASE_URL, CUSTOMER_ID, SPROUT_API_TOKEN);
    const profiles = await groupUtils.getAllProfiles(BASE_URL, CUSTOMER_ID, SPROUT_API_TOKEN);

    if (!groups || groups.length === 0) { console.error('No groups found'); return; }
    if (!profiles || profiles.length === 0) { console.error('No profiles found'); return; }

    const profilesByGroup = groupUtils.groupProfilesByGroup(profiles, groups);

    const results = [];
    for (const [groupId, data] of Object.entries(profilesByGroup)) {
      const { groupName, profiles: groupProfiles } = data;
      if (!groupProfiles || groupProfiles.length === 0) continue;
      try {
        const r = await processGroup(groupId, groupName, groupProfiles, { drive, sheets, auth });
        results.push(r);
      } catch (e) {
        console.error(`Group ${groupName} failed: ${e.message}`);
      }
      // spacing between groups to be gentle
      await sleep(75 * 1000);
    }

    console.log('Done.');
    results.forEach(r => {
      if (!r) return;
      console.log(`Group: ${r.groupName} -> https://docs.google.com/spreadsheets/d/${r.spreadsheetId}/edit`);
    });
  } catch (err) {
    console.error('Error in sprout_posts:', err?.message || err);
  }
}

if (require.main === module) {
  main();
}

#!/usr/bin/env node

/**
 * Sprout Social Post-level Analytics to Google Sheets - Kotak 811 Only
 * --------------------------------------------------------------------
 * Fetches post-level analytics specifically for Kotak 811 group (2613891)
 * from Sprout Social posts endpoint and writes to tabs in the existing
 * group spreadsheet: instagram_post, linkedin_post, facebook_post,
 * twitter_post, youtube_post.
 */

const { google } = require('googleapis');
const path = require('path');

// Utils
const apiUtils = require('./utils/api');
const sheetsUtils = require('./utils/sheets');
const driveUtils = require('./utils/simple-drive');
const groupUtils = require('./utils/groups');
const { sendSproutCompletionEmail } = require('./utils/sproutEmailHelper');

// Platform Post Modules
const igPosts = require('./platforms/instagram_posts');
const liPosts = require('./platforms/linkedin_posts');
const fbPosts = require('./platforms/facebook_posts');
const twPosts = require('./platforms/twitter_posts');
const ytPosts = require('./platforms/youtube_posts');

// API & Config
const CUSTOMER_ID = "2653573";
const SPROUT_API_TOKEN = "MjY1MzU3M3wxNzUyMjE2ODQ5fDdmNzgxNzQyLWI3NWEtNDFkYS1hN2Y4LWRkMTE3ODRhNzBlNg==";
const FOLDER_ID = '13XPLx5l1LuPeJL2Ue03ZztNQUsNgNW06';
const BASE_URL = "https://api.sproutsocial.com/v1";
const POSTS_URL = `${BASE_URL}/${CUSTOMER_ID}/analytics/posts`;

// Hardcoded BookMyShow Stream data
const GROUP_ID = 2598096;
const GROUP_NAME = "Bookmyshow Stream";
const PROFILES = [
    {
        "customer_profile_id": 7102965,
        "network_type": "twitter",
        "name": "BookMyShow Stream",
        "native_name": "BmsStream",
        "link": "https://twitter.com/BmsStream",
        "native_id": "1339560147648036864",
        "groups": [2598096, 2602711]
    },
    {
        "customer_profile_id": 7116735,
        "network_type": "fb_instagram_account",
        "name": "BookMyShow Stream",
        "native_name": "bmsstream",
        "link": "https://instagram.com/bmsstream",
        "native_id": "17841444738062812",
        "groups": [2598096, 2602711]
    },
    {
        "customer_profile_id": 7116731,
        "network_type": "facebook",
        "name": "StreamOfficial",
        "native_name": "BMSStreamIndiaOfficial",
        "link": "https://facebook.com/103265699015611",
        "native_id": "103265699015611",
        "groups": [2598096, 2602711]
    }
];

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
const END_DATE = date;

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

// Network type mapping
const networkTypeMapping = {
  'linkedin_company': 'linkedin',
  'fb_instagram_account': 'instagram',
  'fb_page': 'facebook',
  'facebook': 'facebook',
  'youtube': 'youtube',
  'twitter_profile': 'twitter',
  'twitter': 'twitter'
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
    } catch (err) {
      console.warn(`[Posts] profile=${profileId} variant="${v.label}" failed: ${err.message}`);
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

async function processGroup(googleClients) {
  const { drive, sheets, auth } = googleClients;
  const baseNamePattern = `Copy of ${GROUP_NAME}`;

  console.log(`Processing group: ${GROUP_NAME} (${GROUP_ID})`);
  console.log(`Profiles to process: ${PROFILES.length}`);

  // Resolve spreadsheet
  let spreadsheetId = await driveUtils.findExistingSpreadsheet(drive, baseNamePattern, FOLDER_ID);
  if (!spreadsheetId) {
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
      const groupNameLower = KOTAK_GROUP_NAME.toLowerCase();
      const possibleMatches = allFiles.filter(file => 
        file.name.toLowerCase().includes(groupNameLower) || 
        groupNameLower.includes(file.name.toLowerCase())
      );
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
      console.warn(`Failed to reuse spreadsheet for ${KOTAK_GROUP_NAME}: ${e.message}`);
    }
  }
  
  if (!spreadsheetId) {
    throw new Error(`No spreadsheet found for group ${KOTAK_GROUP_NAME}.`);
  }

  // Group profiles by network type
  const profilesByNetwork = {};
  for (const p of PROFILES) {
    const net = networkTypeMapping[p.network_type] || (p.network_type || '').toLowerCase();
    if (!profilesByNetwork[net]) profilesByNetwork[net] = [];
    profilesByNetwork[net].push(p);
  }

  console.log('Profiles grouped by network:', Object.keys(profilesByNetwork));

  const postsByNetwork = {};

  // Fetch posts for each network
  for (const [net, profs] of Object.entries(profilesByNetwork)) {
    console.log(`\nFetching posts for ${net} (${profs.length} profiles)`);
    postsByNetwork[net] = [];

    for (const profile of profs) {
      const profileId = profile.customer_profile_id;
      console.log(`Fetching posts for profile ${profileId} (${profile.name})`);
      
      const mod = postModules[net];
      const metrics = mod && Array.isArray(mod.METRICS) ? mod.METRICS.map(m => m.key) : undefined;
      const data = await fetchPostsForProfile(profileId, START_DATE, END_DATE, metrics);
      
      for (const dp of data) {
        postsByNetwork[net].push({ dataPoint: dp, profile });
      }
      
      // Gentle delay between profiles
      await sleep(800 + Math.floor(Math.random() * 400));
    }
    
    console.log(`${net}: ${postsByNetwork[net].length} posts found`);
  }

  // Process each network's posts
  for (const [net, posts] of Object.entries(postsByNetwork)) {
    if (!posts || posts.length === 0) {
      console.log(`No posts for ${net}, skipping`);
      continue;
    }
    
    const mod = postModules[net];
    if (!mod) { 
      console.log(`No module for ${net}, skipping`); 
      continue; 
    }

    const sheetName = mod.SHEET_NAME;
    console.log(`\nProcessing ${sheetName} with ${posts.length} posts`);

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

    // Setup headers
    const headers = mod.buildHeaders(mod.METRICS);
    await mod.setupHeaders(sheetsUtils, auth, spreadsheetId, headers);

    // Clear existing rows in date range
    try {
      const existingValues = await sheets.spreadsheets.values.get({ 
        spreadsheetId, 
        range: `${sheetName}!A:AZ` 
      });
      const rows = existingValues.data.values || [];
      
      if (rows.length > 0) {
        const dateSet = buildDateSet(START_DATE, END_DATE);
        const rowsToClear = [];
        
        for (let i = 1; i < rows.length; i++) {
          const normalized = normalizeSheetDateCell(rows[i] && rows[i][0]);
          if (normalized && dateSet.has(normalized)) {
            rowsToClear.push(i + 1);
          }
        }
        
        if (rowsToClear.length > 0) {
          console.log(`Clearing ${rowsToClear.length} existing rows in date range`);
          rowsToClear.sort((a,b) => a - b);
          
          const ranges = [];
          let start = rowsToClear[0];
          let prev = rowsToClear[0];
          
          for (let i = 1; i < rowsToClear.length; i++) {
            const curr = rowsToClear[i];
            if (curr === prev + 1) {
              prev = curr;
            } else {
              ranges.push([start, prev]);
              start = curr; 
              prev = curr;
            }
          }
          ranges.push([start, prev]);

          const ss = await sheets.spreadsheets.get({ spreadsheetId, includeGridData: false });
          const sheet = (ss.data.sheets || []).find(s => s.properties?.title === sheetName);
          const sheetId = sheet?.properties?.sheetId;
          
          if (sheetId == null) {
            const a1Ranges = ranges.map(([s,e]) => `${sheetName}!A${s}:AZ${e}`);
            await sheets.spreadsheets.values.batchClear({ 
              spreadsheetId, 
              resource: { ranges: a1Ranges } 
            });
          } else {
            const deleteRequests = ranges
              .map(([s, e]) => ({ start: s - 1, end: e }))
              .sort((r1, r2) => r2.start - r1.start)
              .map(({ start, end }) => ({
                deleteDimension: {
                  range: { sheetId, dimension: 'ROWS', startIndex: start, endIndex: end }
                }
              }));
            await sheets.spreadsheets.batchUpdate({ 
              spreadsheetId, 
              resource: { requests: deleteRequests } 
            });
          }
        }
      }
    } catch (e) {
      console.warn(`Failed clearing existing rows for ${sheetName}: ${e.message}`);
    }

    // Format and write rows
    const rows = posts.map(({ dataPoint, profile }) => 
      mod.formatPostData(dataPoint, profile, headers, truncate)
    );
    const filtered = rows.filter(r => Array.isArray(r) && r.length === headers.length);

    if (filtered.length === 0) {
      console.log(`No valid rows to write for ${sheetName}`);
      continue;
    }

    console.log(`Writing ${filtered.length} rows to ${sheetName}`);

    // Ensure sheet capacity
    try { 
      await driveUtils.ensureSheetCapacity(
        sheets, 
        spreadsheetId, 
        sheetName, 
        filtered.length + 2000, 
        Math.max(30, headers.length + 2)
      ); 
    } catch (e) {
      console.warn(`Failed to ensure capacity: ${e.message}`);
    }

    // Write with throttling and backoff
    await throttleWrite();
    await retryWithBackoff(async () => {
      await throttleWrite();
      return await mod.updateSheet(sheetsUtils, auth, spreadsheetId, filtered, sheetName);
    }, {
      maxAttempts: 7,
      baseDelayMs: 30000,
      onBeforeRetry: async () => {}
    });

    console.log(`✓ Completed ${sheetName}`);
  }

  return { 
    groupId: GROUP_ID, 
    groupName: GROUP_NAME, 
    spreadsheetId 
  };
}

async function main() {
  const startTime = Date.now();
  
  try {
    console.log('Starting Post-level Analytics run for Kotak 811');
    console.log(`Date range: ${START_DATE} to ${END_DATE}`);

    // Authentication
    const { authenticateWithEnv } = require('./utils/auth');
    const authResult = await authenticateWithEnv();
    const auth = authResult.auth;
    let drive = authResult.drive;
    let sheets = authResult.sheets;

    drive = google.drive({ version: 'v3', auth });
    sheets = google.sheets({ version: 'v4', auth });

    // Verify folder access
    try {
      await drive.files.get({ 
        fileId: FOLDER_ID, 
        fields: 'id,name', 
        supportsAllDrives: true 
      });
      console.log('✓ Folder access verified');
    } catch (e) {
      console.warn(`Folder access warning: ${e.message}`);
    }

    // Process the group
    const result = await processGroup({ drive, sheets, auth });

    const endTime = Date.now();
    const executionTimeSec = Math.round((endTime - startTime) / 1000);
    const executionTimeMin = Math.round(executionTimeSec / 60 * 100) / 100;
    const formattedTime = `${executionTimeMin} minutes (${executionTimeSec} seconds)`;

    console.log('\n✓ Process completed successfully!');
    console.log(`Group: ${result.groupName}`);
    console.log(`Spreadsheet: https://docs.google.com/spreadsheets/d/${result.spreadsheetId}/edit`);
    console.log(`Total execution time: ${formattedTime}`);

    // Send completion email
    console.log('Sending completion email...');
    const folderLink = `https://drive.google.com/drive/folders/${FOLDER_ID}`;
    await sendSproutCompletionEmail([result], formattedTime, folderLink);
    
  } catch (err) {
    console.error('Error in sprout_posts:', err?.message || err);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
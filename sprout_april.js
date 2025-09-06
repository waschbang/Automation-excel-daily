#!/usr/bin/env node

/**
 * Simplified Sprout Social Group Analytics to Google Sheets
 * ==============================================
 * This script fetches analytics data from Sprout Social API for all profiles in each group
 * and creates separate Google Sheets for each group with the data.
 * Uses a simplified authentication approach for Google APIs.
 */

const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');

// Import utilities
const apiUtils = require('./utils/api');
const sheetsUtils = require('./utils/sheets');
const driveUtils = require('./utils/simple-drive');
const groupUtils = require('./utils/groups');
const { sendSproutCompletionEmail } = require('./utils/sproutEmailHelper');
const getCurrentDate = () => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 2);
  
  const year = yesterday.getFullYear();
  const month = String(yesterday.getMonth() + 1).padStart(2, '0');
  const day = String(yesterday.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const WRITE_MIN_INTERVAL_MS = 2000; // ~30 writes/min max
let lastWriteAt = 0;
async function throttleWrite() {
  const now = Date.now();
  const wait = Math.max(0, WRITE_MIN_INTERVAL_MS - (now - lastWriteAt));
  if (wait > 0) await sleep(wait);
  lastWriteAt = Date.now();
}
/**
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function retryWithBackoff(fn, {
  maxAttempts = 5,
  baseDelayMs = 15000, // 15s base to be conservative
  onBeforeRetry = async () => {}
} = {}) {
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

      // cooldown then retry
      const delay = Math.round(baseDelayMs * Math.pow(2, attempt - 1) * (0.8 + Math.random() * 0.4));
      console.warn(`Quota hit. Cooling down for ${Math.round(delay/1000)}s before retry ${attempt}/${maxAttempts}...`);
      await onBeforeRetry(attempt, err);
      await sleep(delay);
    }
  }
}

// Import platform modules
const instagram = require('./platforms/instagram');
const youtube = require('./platforms/youtube');
const linkedin = require('./platforms/linkedin');
const facebook = require('./platforms/facebook');
const twitter = require('./platforms/twitter');

// API & Authentication
const CUSTOMER_ID = "2653573";
const SPROUT_API_TOKEN = "MjY1MzU3M3wxNzUyMjE2ODQ5fDdmNzgxNzQyLWI3NWEtNDFkYS1hN2Y4LWRkMTE3ODRhNzBlNg==";
const FOLDER_ID = '13XPLx5l1LuPeJL2Ue03ZztNQUsNgNW06';

const date = getCurrentDate();
const START_DATE = date; // Single-day window ending 2 days ago
const END_DATE = date;   // Same as start for one-day update
// const START_DATE = '2025-04-01';
// const END_DATE = '2025-09-02';
const DESCRIPTION = '';

// Sprout Social API endpoints
const BASE_URL = "https://api.sproutsocial.com/v1";
const METADATA_URL = `${BASE_URL}/${CUSTOMER_ID}/metadata/customer`;
const ANALYTICS_URL = `${BASE_URL}/${CUSTOMER_ID}/analytics/profiles`;

/**
 * Process analytics data for a group
 * @param {string} groupId - Group ID
 * @param {string} groupName - Group name
 * @param {Array} profiles - Array of profiles in the group
 * @param {Object} googleClients - Authenticated Google API clients
 * @returns {Promise<Array<Object>>} Array of spreadsheet details
 */
const processGroupAnalytics = async (groupId, groupName, profiles, googleClients) => {
  try {
    console.log(`\n=== Processing Group: ${groupName} (${groupId}) ===`);
    console.log(`Found ${profiles.length} profiles in this group`);
    
    // Use the provided Google API clients
    const { drive, sheets, auth } = googleClients;
    if (!drive || !sheets || !auth) {
      throw new Error('Invalid Google API clients provided');
    }
    
    const now = new Date();
    const formattedDate = now.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-'); // MM-DD-YYYY
    const formattedTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }).replace('AM', 'am').replace('PM', 'pm'); // HH:MM am/pm format
    
    const baseNamePattern = `Copy of ${groupName}`;
    console.log(`Group name: "${groupName}"`);
    console.log(`Base name pattern for search: "${baseNamePattern}"`);
    
    // Keep the spreadsheet title as the pure group name
    const spreadsheetTitle = `${groupName}`;
    console.log(`Spreadsheet title: "${spreadsheetTitle}"`);

    console.log(`Looking for existing spreadsheet: "${baseNamePattern}"`);

    try {
      const listResponse = await drive.files.list({
        q: `mimeType='application/vnd.google-apps.spreadsheet' and '${FOLDER_ID}' in parents and trashed=false`,
        fields: 'files(id, name)',
        spaces: 'drive',
        includeItemsFromAllDrives: true,
        supportsAllDrives: true
      });
      
      const allFiles = listResponse.data.files;
      if (allFiles && allFiles.length > 0) {
        console.log(`\nAll spreadsheets in folder (showing first 5):`);
        allFiles.slice(0, 5).forEach(file => {
          console.log(`- "${file.name}" (${file.id})`);
        });
        if (allFiles.length > 5) {
          console.log(`... and ${allFiles.length - 5} more`);
        }
      }
    } catch (listError) {
      console.error(`Error listing all spreadsheets: ${listError.message}`);
    }
    
    // Now search for our specific spreadsheet
    let spreadsheetId = await driveUtils.findExistingSpreadsheet(
      drive,
      baseNamePattern,
      FOLDER_ID
    );
    
    if (spreadsheetId) {
      console.log(`Found existing spreadsheet: "${spreadsheetId}"`);
      // No need to update title since we're using the same name format
      console.log(`Using existing spreadsheet with name: "${spreadsheetTitle}"`);
      
      // No need to update the title since we're using the same name format
      // Keeping the existing title to avoid unnecessary API calls
    } else {
      // No existing spreadsheet found - check if storage quota exceeded
      console.log(`No existing spreadsheet found with name "${baseNamePattern}".`);
      
      // Check if we can find a similar/old spreadsheet to reuse instead of creating new
      console.log(`Searching for reusable spreadsheet with similar name...`);
      
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
        
        // Look for any spreadsheet that might be for this group (case insensitive, partial match)
        const groupNameLower = groupName.toLowerCase();
        const possibleMatches = allFiles.filter(file => 
          file.name.toLowerCase().includes(groupNameLower) || 
          groupNameLower.includes(file.name.toLowerCase())
        );
        
        if (possibleMatches.length > 0) {
          const reusableSheet = possibleMatches[0];
          console.log(`✓ Found reusable spreadsheet: "${reusableSheet.name}" (${reusableSheet.id})`);
          console.log(`Using existing spreadsheet instead of creating new one due to storage constraints`);
          spreadsheetId = reusableSheet.id;
        } else {
          // Global fallback: search across all Drive for a spreadsheet with this name
          console.log(`No in-folder match. Performing global search for existing spreadsheet named "${baseNamePattern}"...`);
          try {
            const globalMatch = await driveUtils.findSpreadsheetByPattern(drive, baseNamePattern, null);
            if (globalMatch && globalMatch.id) {
              spreadsheetId = globalMatch.id;
              console.log(`✓ Found spreadsheet outside target folder: "${globalMatch.name}" (${globalMatch.id}). Will reuse it.`);
            }
          } catch (globalSearchError) {
            console.warn(`Global search failed: ${globalSearchError.message}`);
          }

          if (!spreadsheetId) {
          // Try to create new spreadsheet with storage quota handling
          console.log(`No reusable spreadsheet found. Attempting to create new one: "${spreadsheetTitle}"`);
          console.log(`Target folder ID: ${FOLDER_ID}`);
          
          try {
            // Try Drive API creation
            const response = await drive.files.create({
              resource: {
                name: spreadsheetTitle,
                parents: [FOLDER_ID],
                mimeType: 'application/vnd.google-apps.spreadsheet'
              },
              fields: 'id, name, parents'
            });
            
            spreadsheetId = response.data.id;
            console.log(`✓ Created new spreadsheet: ${spreadsheetId}`);
            
            // Initialize with default sheet
            try {
              await sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                resource: {
                  requests: [{
                    updateSheetProperties: {
                      properties: {
                        sheetId: 0,
                        title: 'Summary'
                      },
                      fields: 'title'
                    }
                  }]
                }
              });
              console.log(`✓ Initialized spreadsheet with default sheet`);
            } catch (initError) {
              console.warn(`⚠ Could not initialize sheet: ${initError.message}`);
            }
            
          } catch (createError) {
            if (createError.message.includes('quota') || createError.message.includes('storage')) {
              console.error(`✗ Storage quota exceeded. Cannot create new spreadsheet.`);
              console.error(`Solution: Clean up old spreadsheets or upgrade storage.`);
              console.error(`Found ${allFiles.length} spreadsheets in folder - consider archiving old ones.`);
              
              return [{
                groupId,
                groupName,
                status: `Skipped: Storage quota exceeded (${allFiles.length} files in folder)`
              }];
            } else {
              throw createError;
            }
          }
          }
        }
        
      } catch (error) {
        console.error(`✗ Failed to handle spreadsheet for group ${groupName}:`);
        console.error(`Error: ${error.message}`);
        
        return [{
          groupId,
          groupName,
          status: `Error: ${error.message}`
        }];
      }
    }
    
    // Group profiles by network type
    const profilesByNetwork = {};
    for (const profile of profiles) {
      // Map network types to our simplified types
      const networkTypeMapping = {
        'linkedin_company': 'linkedin',
        'fb_instagram_account': 'instagram',
        'fb_page': 'facebook',
        'youtube_channel': 'youtube',
        'twitter_profile': 'twitter'
      };
      
      // Get our simplified network type
      const networkType = networkTypeMapping[profile.network_type] || profile.network_type.toLowerCase();
      
      if (!profilesByNetwork[networkType]) {
        profilesByNetwork[networkType] = [];
      }
      
      profilesByNetwork[networkType].push(profile);
    }
    
    // Create sheets for each network type that has profiles
    const networkModules = {
      instagram,
      youtube,
      linkedin,
      facebook,
      twitter
    };
    
    // Keep track of which sheets we've created
    const createdSheets = [];
    
    // Create sheets for each network type
    for (const [networkType, networkProfiles] of Object.entries(profilesByNetwork)) {
      if (networkProfiles.length > 0) {
        const sheetName = networkType.charAt(0).toUpperCase() + networkType.slice(1);
        
        try {
          // Check if sheet already exists
          const response = await sheets.spreadsheets.get({
            spreadsheetId,
            includeGridData: false
          });
          
          const existingSheets = response.data.sheets.map(sheet => sheet.properties.title);
          
          if (!existingSheets.includes(sheetName)) {
            // Create the sheet if it doesn't exist
            await sheets.spreadsheets.batchUpdate({
              spreadsheetId,
              resource: {
                requests: [
                  {
                    addSheet: {
                      properties: {
                        title: sheetName
                      }
                    }
                  }
                ]
              }
            });
            console.log(`Created sheet "${sheetName}"`);
          } else {
            console.log(`Sheet "${sheetName}" already exists`);
          }
          
          createdSheets.push(sheetName);
          
          // Set up headers
          const module = networkModules[networkType];
          if (module && module.setupHeaders) {
            await module.setupHeaders(sheetsUtils, auth, spreadsheetId);
          }
        } catch (error) {
          console.error(`Error creating ${sheetName} sheet: ${error.message}`);
        }
      }
    }
    
    // Helper: build a set of ISO date strings between start and end (inclusive)
    function buildDateSet(startDateStr, endDateStr) {
      const set = new Set();
      const start = new Date(startDateStr);
      const end = new Date(endDateStr);
      // normalize to UTC-less date string by using YYYY-MM-DD generation
      const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const yyyy = d.getFullYear();
        const mm = pad(d.getMonth() + 1);
        const dd = pad(d.getDate());
        set.add(`${yyyy}-${mm}-${dd}`);
      }
      return set;
    }

    // Normalize any Google Sheets date cell value to ISO YYYY-MM-DD
    function normalizeSheetDateCell(value) {
      if (value == null) return '';
      const raw = String(value).trim();

      // Case 1: Already ISO
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

      // Case 2: Google serial number or numeric-like string
      const asNum = Number(raw);
      if (!Number.isNaN(asNum) && raw !== '') {
        // Google Sheets serial date: days since 1899-12-30
        // Note: Excel leap year bug day is already handled by using 1899-12-30 as epoch
        const epoch = new Date(Date.UTC(1899, 11, 30));
        const ms = epoch.getTime() + Math.round(asNum) * 86400000;
        const dt = new Date(ms);
        const yyyy = dt.getUTCFullYear();
        const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(dt.getUTCDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      }

      // Case 3: Parse any other string (e.g., 8/29/2025, 29-08-2025, 29 Aug 2025)
      const parsed = new Date(raw);
      if (!isNaN(parsed.getTime())) {
        const yyyy = parsed.getFullYear();
        const mm = String(parsed.getMonth() + 1).padStart(2, '0');
        const dd = String(parsed.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      }

      return '';
    }
    
    // Fetch analytics data for all profiles in this group
    const profileIds = profiles.map(p => p.customer_profile_id).filter(id => id);
    console.log(`Fetching analytics data for ${profileIds.length} profiles in group ${groupName} from ${START_DATE} to ${END_DATE}`);
    
    // Always update data even if today's data exists
    console.log(`Fetching fresh data for ${getCurrentDate()} to update spreadsheet`);
    
    // Check if we need to clear existing data for the date range to avoid duplicates
    try {
      // For each sheet, check if today's data exists and clear it if it does
      for (const sheetName of createdSheets) {
        console.log(`Checking for existing data in ${sheetName} sheet...`);
        const existingValues = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${sheetName}!A:Z`
        });

        const rows = existingValues.data.values || [];
        if (rows.length === 0) continue;

        // Build a set of all dates in the configured range to be overwritten
        const dateSet = buildDateSet(START_DATE, END_DATE);

        // Find rows whose first cell (Date) matches any date in the range
        const rowsToClear = [];
        // Start at index 1 to skip header row (row 1)
        for (let i = 1; i < rows.length; i++) {
          const normalized = normalizeSheetDateCell(rows[i] && rows[i][0]);
          if (normalized && dateSet.has(normalized)) {
            // Google Sheets rows are 1-indexed
            rowsToClear.push(i + 1);
          }
        }

        if (rowsToClear.length > 0) {
          console.log(`Found ${rowsToClear.length} existing row(s) within ${START_DATE}..${END_DATE} in sheet "${sheetName}". Deleting them (batched).`);
          // Coalesce consecutive rows into ranges (1-indexed), then delete as row dimension ranges (0-indexed)
          rowsToClear.sort((a, b) => a - b);
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

          // Get sheetId for deleteDimension requests
          const ss = await sheets.spreadsheets.get({ spreadsheetId, includeGridData: false });
          const sheet = ss.data.sheets.find(s => s.properties.title === sheetName);
          const sheetId = sheet?.properties?.sheetId;
          if (sheetId == null) {
            console.warn(`Could not resolve sheetId for "${sheetName}". Falling back to clearing values.`);
            const a1Ranges = ranges.map(([s, e]) => `${sheetName}!A${s}:AS${e}`);
            await sheets.spreadsheets.values.batchClear({ spreadsheetId, resource: { ranges: a1Ranges } });
          } else {
            // Build delete requests from bottom to top to avoid index shifting
            const deleteRequests = ranges
              .map(([s, e]) => ({ start: s - 1, end: e })) // convert to 0-based, end exclusive
              .sort((r1, r2) => r2.start - r1.start) // descending by start index
              .map(({ start, end }) => ({
                deleteDimension: {
                  range: {
                    sheetId,
                    dimension: 'ROWS',
                    startIndex: start,
                    endIndex: end
                  }
                }
              }));

            await sheets.spreadsheets.batchUpdate({
              spreadsheetId,
              resource: { requests: deleteRequests }
            });
          }

          console.log(`Removed ${ranges.length} contiguous range(s) for sheet "${sheetName}".`);
        } else {
          console.log(`No existing rows to clear for ${sheetName} within ${START_DATE}..${END_DATE}.`);
        }
      }
    } catch (error) {
      console.warn(`Error handling existing data: ${error.message}. Will proceed with update anyway.`);
    }
    
    // Fetch fresh data from API
    const analyticsData = await apiUtils.getAnalyticsData(
      ANALYTICS_URL,
      SPROUT_API_TOKEN,
      START_DATE,
      END_DATE,
      profileIds
    );
    
    // Log the raw data for debugging
    console.log(`Received ${analyticsData?.data?.length || 0} data points from API`);
    
    if (!analyticsData || !analyticsData.data || analyticsData.data.length === 0) {
      console.warn(`No analytics data found for group ${groupName} in period ${START_DATE} to ${END_DATE}`);
      return [{
        groupId,
        groupName,
        folderId: FOLDER_ID,
        description: DESCRIPTION,
        dateRange: `${START_DATE} to ${END_DATE}`,
        profileCount: profiles.length,
        spreadsheetId,
        spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
        status: 'No data'
      }];
    }
    
    // Group data by profile and date
    const dataByProfileAndDate = {};
    
    for (const dataPoint of analyticsData.data) {
      const customerProfileId = dataPoint.dimensions?.customer_profile_id;
      const reportingPeriod = dataPoint.dimensions?.['reporting_period.by(day)'] || dataPoint.dimensions?.reporting_period;
      
      if (!customerProfileId || !reportingPeriod) continue;
      
      const date = new Date(reportingPeriod).toISOString().split('T')[0];
      const key = `${customerProfileId}_${date}`;
      
      if (!dataByProfileAndDate[key]) {
        dataByProfileAndDate[key] = {
          profileId: customerProfileId,
          date: date,
          dataPoint: dataPoint
        };
      }
    }
    
    // Process data for each profile
    const rowsByNetwork = {
      instagram: [],
      youtube: [],
      linkedin: [],
      facebook: [],
      twitter: []
    };
    
    for (const { profileId, date, dataPoint } of Object.values(dataByProfileAndDate)) {
      const profile = profiles.find(p => p.customer_profile_id === parseInt(profileId));
      if (!profile) {
        console.log(`Profile not found for ID: ${profileId}`);
        continue;
      }
      
      // Map network types to our simplified types
      const networkTypeMapping = {
        'linkedin_company': 'linkedin',
        'fb_instagram_account': 'instagram',
        'fb_page': 'facebook',
        'youtube_channel': 'youtube',
        'twitter_profile': 'twitter'
      };
      
      // Get our simplified network type
      const networkType = networkTypeMapping[profile.network_type] || profile.network_type.toLowerCase();
      console.log(`Processing data for profile ${profile.name} (${profileId}) with network type: ${profile.network_type} → ${networkType}`);
      
      const module = networkModules[networkType];
      if (module && module.formatAnalyticsData) {
        const row = module.formatAnalyticsData(dataPoint, profile);
        if (row) {
          rowsByNetwork[networkType].push(row);
          console.log(`Added row for ${networkType} profile ${profile.name}`);
        } else {
          console.log(`No row generated for ${networkType} profile ${profile.name}`);
        }
      } else {
        console.log(`No formatter found for network type: ${networkType}`);
      }
    }
    
    // Update sheets with data
    // Sequential updates with throttling to avoid Sheets write-per-minute quota
    for (const [networkType, rows] of Object.entries(rowsByNetwork)) {
      if (rows.length === 0) {
        console.log(`No rows to update for ${networkType}`);
        continue;
      }

      const sheetName = networkType.charAt(0).toUpperCase() + networkType.slice(1);
      if (!createdSheets.includes(sheetName)) {
        console.log(`Sheet ${sheetName} not created, skipping update`);
        continue;
      }

      const module = networkModules[networkType];
      if (!(module && module.updateSheet)) {
        console.log(`No updateSheet method found for ${networkType}`);
        continue;
      }

      console.log(`Updating ${sheetName} sheet with ${rows.length} rows`);
      try {
        await driveUtils.ensureSheetCapacity(sheets, spreadsheetId, sheetName, rows.length + 2000, 30);
      } catch (capErr) {
        console.warn(`Capacity check failed for ${sheetName}: ${capErr.message}`);
      }

      // Throttle before each write
      await throttleWrite();

      await retryWithBackoff(
        async () => {
          // Additional throttle inside retries
          await throttleWrite();
          return await module.updateSheet(sheetsUtils, auth, spreadsheetId, rows);
        },
        {
          maxAttempts: 7,
          baseDelayMs: 30000, // 30s base backoff for 429s
          onBeforeRetry: async (attempt, err) => {
            const msg = err?.message || '';
            const code = err?.code || err?.response?.status;
            if (code === 400 || /exceeds grid limits|grid limits/i.test(msg)) {
              try {
                await driveUtils.ensureSheetCapacity(sheets, spreadsheetId, sheetName, (rows.length + 2000) + attempt * 1000, 30);
              } catch (_) {}
            }
          }
        }
      );
    }
    
    console.log(`Completed processing for group ${groupName}`);
    console.log(`Spreadsheet URL: https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`);
    
    return [{
      groupId,
      groupName,
      folderId: FOLDER_ID,
      description: DESCRIPTION,
      dateRange: `${START_DATE} to ${END_DATE}`,
      profileCount: profiles.length,
      spreadsheetId,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
      status: 'Completed'
    }];
  } catch (error) {
    console.error(`Error processing group ${groupName}: ${error.message}`);
    return [{
      groupId,
      groupName,
      profileCount: profiles.length,
      status: `Error: ${error.message}`
    }];
  }
};

/**
 * Main function to orchestrate the entire process
 */
const main = async () => {
  try {
    const startTime = new Date();
    console.log(`Starting Group Analytics Processing at ${startTime.toLocaleTimeString()}`);
    
    // Authenticate with Google APIs using environment variables
    console.log('Authenticating with Google APIs using environment variables...');
    
    let auth, drive, sheets;
    
    try {
      // Use the new environment variable authentication
      const { authenticateWithEnv } = require('./utils/auth');
      const authResult = await authenticateWithEnv();
      auth = authResult.auth;
      drive = authResult.drive;
      sheets = authResult.sheets;
      
      console.log('Environment variable authentication successful');
      console.log(`Authenticated as: ${auth.credentials?.client_email || 'OAuth user'}`);
    } catch (authError) {
      console.error(`Environment variable authentication failed: ${authError.message}`);
      throw new Error('Authentication failed. Please check your .env file configuration.');
    }
    
    // Create Drive and Sheets clients
    drive = google.drive({ version: 'v3', auth });
    sheets = google.sheets({ version: 'v4', auth });
    
    const googleClients = { auth, drive, sheets };
    
    // Verify access to the folder
    try {
      console.log(`Verifying access to folder: ${FOLDER_ID}`);
      const folderResponse = await drive.files.get({
        fileId: FOLDER_ID,
        fields: 'id,name,capabilities(canEdit)',
        supportsAllDrives: true
      });
      
      const folder = folderResponse.data;
      if (!folder.capabilities.canEdit) {
        console.warn(`Warning: Read-only access to folder "${folder.name}" (${folder.id})`);
        console.warn('You may encounter errors when trying to create or modify files in this folder.');
      } else {
        console.log(`Successfully verified access to folder "${folder.name}" (${folder.id})`);
      }
    } catch (folderError) {
      console.warn(`Warning: Could not verify folder access: ${folderError.message}`);
      // Continue; subsequent calls may still work if access is eventually granted
    }
    
    // Fetch all groups
    console.log('\n=== Fetching Customer Groups ===');
    let groups = [];
    
    try {
      console.log(`[API CALL] Fetching customer groups from: ${BASE_URL}/${CUSTOMER_ID}/metadata/customer/groups`);
      groups = await groupUtils.getCustomerGroups(BASE_URL, CUSTOMER_ID, SPROUT_API_TOKEN);
    } catch (groupError) {
      console.error(`Error fetching groups: ${groupError.message}`);
      return;
    }
    
    if (groups.length === 0) {
      console.error('No groups found. Cannot proceed.');
      return;
    }
    
    console.log(`Found ${groups.length} groups`);
    
    // Fetch all profiles
    console.log('\n=== Fetching All Profiles ===');
    let profiles = [];
    
    try {
      profiles = await groupUtils.getAllProfiles(BASE_URL, CUSTOMER_ID, SPROUT_API_TOKEN);
    } catch (profileError) {
      console.error(`Error fetching profiles: ${profileError.message}`);
      return;
    }
    
    if (profiles.length === 0) {
      console.error('No profiles found. Cannot proceed.');
      return;
    }
    
    console.log(`Found ${profiles.length} profiles`);
    
    // Group profiles by group ID
    console.log('\n=== Grouping Profiles by Group ID ===');
    let profilesByGroup;
    try {
      profilesByGroup = groupUtils.groupProfilesByGroup(profiles, groups);
    } catch (groupingError) {
      console.error(`Error grouping profiles: ${groupingError.message}`);
      // Create a minimal profilesByGroup with available data
      profilesByGroup = {};
      groups.forEach(group => {
        const groupProfiles = profiles.filter(profile => 
          profile.groups && profile.groups.includes(group.group_id)
        );
        if (groupProfiles.length > 0) {
          profilesByGroup[group.group_id] = {
            groupName: group.name,
            profiles: groupProfiles
          };
        }
      });
    }
    
    // Process each group
    console.log('\n=== Processing Each Group ===');
    const allResults = [];
    
    for (const [groupId, groupData] of Object.entries(profilesByGroup)) {
      const { groupName, profiles } = groupData;
      
      if (profiles.length > 0) {
        try {
          console.log(`\nProcessing group: ${groupName} (${groupId}) with ${profiles.length} profiles`);
          const results = await processGroupAnalytics(groupId, groupName, profiles, googleClients);
          if (results && results.length > 0) {
            allResults.push(...results);
          }
        } catch (error) {
          console.error(`Error processing group ${groupName}: ${error.message}`);
        }
        console.log(`Short delay before processing the next group...`);
        await sleep(75 * 1000); // 75 seconds between groups to be kinder to API
      } else {
        console.log(`Skipping group ${groupName} (${groupId}) - no profiles found`);
      }
    }
    
    // Print summary
    console.log('\n=== Processing Complete ===');
    console.log(`Processed ${allResults.length} spreadsheets`);
    
    for (const result of allResults) {
      console.log(`\nGroup: ${result.groupName}`);
      console.log(`Status: ${result.status}`);
      if (result.spreadsheetUrl) {
        console.log(`Spreadsheet: ${result.spreadsheetUrl}`);
      }
    }
    
    const endTime = new Date();
    const executionTimeMs = endTime - startTime;
    const executionTimeSec = Math.round(executionTimeMs / 1000);
    const executionTimeMin = Math.round(executionTimeSec / 60 * 10) / 10;
    const formattedTime = `${executionTimeMin} minutes (${executionTimeSec} seconds)`;
    
    console.log(`\nTotal execution time: ${formattedTime}`);
    
    // Send completion email
    console.log('Sending completion email...');
    const folderLink = `https://drive.google.com/drive/folders/${FOLDER_ID}`;
    await sendSproutCompletionEmail(allResults, formattedTime, folderLink);
    
  } catch (error) {
    console.error(`Error in main process: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
  }
};

// Set up global unhandled exception handlers to prevent crashes
process.on('uncaughtException', (error) => {
  console.error('CRITICAL ERROR: Uncaught Exception detected');
  console.error(`Error: ${error.message}`);
  console.error(`Stack: ${error.stack}`);
  console.error('The script will continue execution despite this error.');
  // Don't exit the process - allow it to continue
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('CRITICAL ERROR: Unhandled Promise Rejection detected');
  console.error(`Reason: ${reason}`);
  console.error('The script will continue execution despite this error.');
  // Don't exit the process - allow it to continue
});

// Run the main function with comprehensive error handling
main().catch(err => {
  console.error('Unhandled error in main function:', err);
  console.error('Script execution completed with errors, but did not crash.');
});
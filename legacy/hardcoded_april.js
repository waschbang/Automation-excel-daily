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
const getCurrentDate = () => {
  // Use the date from 2 days ago instead of today to ensure complete metrics
  // Social media platforms often have a delay in reporting analytics
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 2);
  
  const year = yesterday.getFullYear();
  const month = String(yesterday.getMonth() + 1).padStart(2, '0');
  const day = String(yesterday.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
// Global write throttle (Sheets write limits are per user per minute). Adjust if needed.
const WRITE_MIN_INTERVAL_MS = 2000; // ~30 writes/min max
let lastWriteAt = 0;
async function throttleWrite() {
  const now = Date.now();
  const wait = Math.max(0, WRITE_MIN_INTERVAL_MS - (now - lastWriteAt));
  if (wait > 0) await sleep(wait);
  lastWriteAt = Date.now();
}
/**
 * Sleep for a specified duration
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Retry helper with exponential backoff and jitter
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
// const START_DATE = date; // Single-day window ending 2 days ago
// const END_DATE = date;   // Same as start for one-day update
const START_DATE = '2025-04-01';
const END_DATE = '2025-09-07';
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
    
    // Format current date and time for the spreadsheet title
    const now = new Date();
    const formattedDate = now.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-'); // MM-DD-YYYY
    const formattedTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }).replace('AM', 'am').replace('PM', 'pm'); // HH:MM am/pm format
    
    // Search only for sheets that are copies: names like "Copy of <Group Name>..."
    const baseNamePattern = `Copy of ${groupName}`;
    console.log(`Group name: "${groupName}"`);
    console.log(`Base name pattern for search: "${baseNamePattern}"`);
    
    // Keep the spreadsheet title as the pure group name
    const spreadsheetTitle = `${groupName}`;
    console.log(`Spreadsheet title: "${spreadsheetTitle}"`);
    
    // First check if a spreadsheet for this group already exists
    console.log(`Looking for existing spreadsheet: "${baseNamePattern}"`);
    
    // List all spreadsheets in the folder first for debugging
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
          const dateStr = (rows[i] && rows[i][0]) ? String(rows[i][0]).trim() : '';
          if (dateSet.has(dateStr)) {
            // Google Sheets rows are 1-indexed
            rowsToClear.push(i + 1);
          }
        }

        if (rowsToClear.length > 0) {
          console.log(`Found ${rowsToClear.length} existing row(s) within ${START_DATE}..${END_DATE} in sheet "${sheetName}". Clearing them (batched).`);
          // Coalesce consecutive rows into ranges, then clear with a single batchClear
          rowsToClear.sort((a, b) => a - b);
          const ranges = [];
          let start = rowsToClear[0];
          let prev = rowsToClear[0];
          for (let i = 1; i < rowsToClear.length; i++) {
            const curr = rowsToClear[i];
            if (curr === prev + 1) {
              prev = curr;
            } else {
              ranges.push(`${sheetName}!A${start}:AS${prev}`); // A..AS = 45 columns
              start = curr;
              prev = curr;
            }
          }
          ranges.push(`${sheetName}!A${start}:AS${prev}`);

          await sheets.spreadsheets.values.batchClear({
            spreadsheetId,
            resource: { ranges }
          });
          console.log(`Cleared ${ranges.length} range(s) in one request for sheet "${sheetName}".`);
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
    
    // Authenticate with Google APIs
    console.log('Authenticating with Google APIs...');
    
    // Check for service account key file
    const serviceAccountPath = path.join(__dirname, 'service-account-key.json');
    const credentialsPath = path.join(__dirname, 'credentials.json');
    const tokenPath = path.join(__dirname, 'token.json');
    
    let auth, drive, sheets;
    
    // Try to authenticate with service account first
    if (fs.existsSync(serviceAccountPath)) {
      try {
        console.log('Using service account authentication...');
        const serviceAccountKey = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
        
        // Create a JWT client
        auth = new google.auth.JWT(
          serviceAccountKey.client_email,
          null,
          serviceAccountKey.private_key,
          [
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/drive'
          ]
        );
        
        // Authorize the client
        await auth.authorize();
        console.log('Service account authentication successful');
        console.log(`Authenticated as service account: ${serviceAccountKey.client_email}`);
      } catch (authError) {
        console.error(`Service account authentication failed: ${authError.message}`);
        auth = null;
      }
    }
    
    // Fall back to OAuth if service account authentication failed
    if (!auth && fs.existsSync(credentialsPath) && fs.existsSync(tokenPath)) {
      try {
        console.log('Falling back to OAuth authentication...');
        const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
        const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
        
        const clientCredentials = credentials.installed || credentials.web;
        if (!clientCredentials) {
          throw new Error('Invalid OAuth credentials format');
        }
        
        // Create OAuth client
        auth = new google.auth.OAuth2(
          clientCredentials.client_id,
          clientCredentials.client_secret,
          clientCredentials.redirect_uris[0]
        );
        
        // Set credentials from token file
        auth.setCredentials(token);
        console.log('OAuth authentication successful');
      } catch (oauthError) {
        console.error(`OAuth authentication failed: ${oauthError.message}`);
        auth = null;
      }
    }
    
    // If all authentication methods failed, try using drive-credentials.json
    if (!auth && fs.existsSync(path.join(__dirname, 'drive-credentials.json'))) {
      try {
        console.log('Falling back to drive-credentials.json...');
        const driveCredentials = JSON.parse(fs.readFileSync(path.join(__dirname, 'drive-credentials.json'), 'utf8'));
        
        // Create a JWT client
        auth = new google.auth.JWT(
          driveCredentials.client_email,
          null,
          driveCredentials.private_key,
          [
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/drive'
          ]
        );
        
        // Authorize the client
        await auth.authorize();
        console.log('Authentication with drive-credentials.json successful');
      } catch (driveAuthError) {
        console.error(`Authentication with drive-credentials.json failed: ${driveAuthError.message}`);
        throw new Error('All authentication methods failed');
      }
    }
    
    // If all authentication methods failed, throw an error
    if (!auth) {
      throw new Error('All authentication methods failed');
    }
    
    // Create Drive and Sheets clients
    drive = google.drive({ version: 'v3', auth });
    sheets = google.sheets({ version: 'v4', auth });
    
    const googleClients = { auth, drive, sheets };
    
    // Verify access to the folder; if not found under current principal, try OAuth fallback
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
      // If the current auth is a service account and OAuth creds exist, try OAuth fallback
      const hasOAuthFiles = fs.existsSync(credentialsPath) && fs.existsSync(tokenPath);
      const isJwt = auth && typeof auth.createScopedRequired === 'function';
      if (hasOAuthFiles) {
        try {
          console.log('Retrying with OAuth credentials because the folder was not accessible under current account...');
          const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
          const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
          const clientCredentials = credentials.installed || credentials.web;
          if (!clientCredentials) {
            throw new Error('Invalid OAuth credentials format');
          }
          const oauth = new google.auth.OAuth2(
            clientCredentials.client_id,
            clientCredentials.client_secret,
            clientCredentials.redirect_uris[0]
          );
          oauth.setCredentials(token);
          // Swap clients to OAuth
          auth = oauth;
          drive = google.drive({ version: 'v3', auth });
          sheets = google.sheets({ version: 'v4', auth });
          // Retry folder verification
          const retryResp = await drive.files.get({
            fileId: FOLDER_ID,
            fields: 'id,name,capabilities(canEdit)',
            supportsAllDrives: true
          });
          const folder = retryResp.data;
          console.log(`Successfully verified access to folder with OAuth as "${folder.name}" (${folder.id})`);
        } catch (oauthSwapErr) {
          console.warn(`OAuth fallback failed or still cannot access folder: ${oauthSwapErr.message}`);
          // Continue; subsequent calls may still work if access is eventually granted
        }
      }
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
    // OVERRIDE: restrict to only the requested groups (Option 1)
    groups = [
      { group_id: 2598096, name: 'Bookmyshow Stream' }
      
    ];
    console.log(`Overridden groups to ${groups.length}:`, groups.map(g => `${g.name} (${g.group_id})`).join(', '));
    
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

    // Remove duplicates and clean profiles
    const uniqueProfiles = [...new Map(profiles.map(item => [item.customer_profile_id, item])).values()];
    //need to run again 7203910, 7111511
    // OVERRIDE: restrict to only the requested profiles (filtered by provided IDs)
    profiles = uniqueProfiles.filter(profile => {
      return [
        7116731, 7116735, 7102965
      ].includes(profile.customer_profile_id);
    });

    console.log(`Overridden profiles to ${profiles.length} selected profiles.`);

    // Group profiles by the overridden groups list
    console.log('\n=== Grouping Profiles by Group ID ===');
    let profilesByGroup;
    try {
      profilesByGroup = groupUtils.groupProfilesByGroup(profiles, groups);
    } catch (groupingError) {
      console.error(`Error grouping profiles: ${groupingError.message}`);
      // Fallback minimal grouping by first group id from profiles
      profilesByGroup = {};
      const groupMeta = new Map(groups.map(g => [g.group_id, g.name]));
      const groupIds = new Set();
      profiles.forEach(p => (p.groups || []).forEach(gid => groupIds.add(gid)));
      for (const gid of groupIds) {
        const groupProfiles = profiles.filter(p => (p.groups || []).includes(gid));
        if (groupProfiles.length > 0) {
          profilesByGroup[gid] = {
            groupName: groupMeta.get(gid) || `Group ${gid}`,
            profiles: groupProfiles
          };
        }
      }
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

    console.log(`\nTotal execution time: ${executionTimeMin} minutes (${executionTimeSec} seconds)`);
  } catch (error) {
    console.error(`Fatal error in main(): ${error.message}`);
  }
};

// Invoke main
main().catch(err => {
  console.error('Unhandled error:', err);
  process.exitCode = 1;
});
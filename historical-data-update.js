#!/usr/bin/env node

/**
 * Historical Data Update for Sprout Social Analytics
 * 
 * This script fetches historical data from January 1, 2025 to May 2, 2025
 * and updates the Google Sheets with this data. It uses the same core functionality
 * as the daily update script but with a different date range.
 */

const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

// Import platform modules
const instagram = require('./platforms/instagram');
const youtube = require('./platforms/youtube');
const linkedin = require('./platforms/linkedin');
const facebook = require('./platforms/facebook');
const twitter = require('./platforms/twitter');

// Import utility modules
const api = require('./utils/api');
const sheetsUtils = require('./utils/sheets');
const driveUtils = require('./utils/drive');
const groupUtils = require('./utils/groups');
const { google } = require('googleapis');

// Fixed date range for historical data
const START_DATE = '2025-01-01';
const END_DATE = '2025-05-02';

// API & Authentication - using the same values as group-analytics.js
const CUSTOMER_ID = "2426451";
const SPROUT_API_TOKEN = "MjQyNjQ1MXwxNzQyNzk4MTc4fDQ0YmU1NzQ4LWI1ZDAtNDhkMi04ODQxLWE1YzM1YmI4MmNjNQ==";
const BASE_URL = "https://api.sproutsocial.com/v1";

// Google Drive folder ID
const FOLDER_ID = '1usYEd9TeNI_2gapA-dLK4y27zvvWJO8r';

// Set environment variables for API utilities
process.env.CUSTOMER_ID = CUSTOMER_ID;
process.env.SPROUT_API_TOKEN = SPROUT_API_TOKEN;
process.env.SPROUT_PROFILES_URL = `${BASE_URL}/profiles/metadata`;
process.env.SPROUT_ANALYTICS_URL = `${BASE_URL}/analytics/profiles`;
process.env.DRIVE_FOLDER_ID = FOLDER_ID;

// Credentials paths
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const DRIVE_CREDENTIALS_PATH = path.join(__dirname, 'drive-credentials.json');

// Network modules mapping
const networkModules = {
  instagram,
  youtube,
  linkedin,
  facebook,
  twitter
};

/**
 * Sleep for a specified duration
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Check if Drive credentials exist, or create them from a source file
 */
const saveDriveCredentials = () => {
  if (!fs.existsSync(DRIVE_CREDENTIALS_PATH) && fs.existsSync(CREDENTIALS_PATH)) {
    console.log('Creating Drive credentials from source credentials...');
    fs.copyFileSync(CREDENTIALS_PATH, DRIVE_CREDENTIALS_PATH);
    console.log(`Created Drive credentials at ${DRIVE_CREDENTIALS_PATH}`);
  } else if (!fs.existsSync(DRIVE_CREDENTIALS_PATH)) {
    console.error(`ERROR: No credentials found at ${CREDENTIALS_PATH}`);
    console.error('Please create a credentials.json file with your Google API credentials');
    process.exit(1);
  }
};

/**
 * Verify Google Drive credentials by making a test API call
 * @returns {Promise<boolean>} True if credentials are valid, false otherwise
 */
const verifyDriveCredentials = async () => {
  try {
    console.log('Verifying Google Drive credentials...');
    const auth = await driveUtils.authorize();
    if (!auth) {
      console.error('Failed to authorize with Google Drive');
      return false;
    }
    
    const drive = google.drive({ version: 'v3', auth });
    const response = await drive.files.list({
      pageSize: 1,
      fields: 'files(id, name)'
    });
    
    console.log('Google Drive credentials verified successfully');
    return true;
  } catch (error) {
    console.error(`Error verifying Google Drive credentials: ${error.message}`);
    return false;
  }
};

/**
 * Process analytics data for a group
 * @param {string} groupId - Group ID
 * @param {string} groupName - Group name
 * @param {Array} profiles - Array of profiles in the group
 * @returns {Promise<Array<Object>>} Array of spreadsheet details
 */
const processGroupAnalytics = async (groupId, groupName, profiles) => {
  console.log(`\n=== PROCESSING GROUP: ${groupName} (${groupId}) ===`);
  console.log(`Found ${profiles.length} profiles in this group`);
  
  const results = [];
  const folderId = FOLDER_ID;
  const description = 'Historical Data (Jan 1 - May 2, 2025)';
  
  // Authentication for Google Drive and Sheets
  const auth = await driveUtils.authorize();
  if (!auth) {
    console.error('Failed to authenticate with Google Drive');
    return results;
  }
  
  // Check if a spreadsheet already exists for this group
  const spreadsheetTitle = `Sprout Analytics - ${groupName} - Historical Data`;
  console.log(`Looking for existing spreadsheet: "${spreadsheetTitle}"`);
  
  let spreadsheetId = await driveUtils.findExistingSpreadsheet(
    auth,
    spreadsheetTitle,
    folderId
  );
  
  if (spreadsheetId) {
    console.log(`Found existing spreadsheet: ${spreadsheetId}`);
  } else {
    console.log(`Creating new spreadsheet: "${spreadsheetTitle}"`);
    
    try {
      // Create a new spreadsheet in the specified folder
      spreadsheetId = await driveUtils.createSpreadsheet(
        auth,
        spreadsheetTitle,
        folderId
      );
      
      if (!spreadsheetId) {
        console.error(`Failed to create spreadsheet for group ${groupName}`);
        results.push({
          groupId,
          groupName,
          folderId,
          description,
          dateRange: `${START_DATE} to ${END_DATE}`,
          profileCount: profiles.length,
          status: 'Failed to create spreadsheet'
        });
        return results;
      }
      
      console.log(`Created spreadsheet with ID: ${spreadsheetId}`);
    } catch (error) {
      console.error(`Error creating spreadsheet: ${error.message}`);
      results.push({
        groupId,
        groupName,
        folderId,
        description,
        dateRange: `${START_DATE} to ${END_DATE}`,
        profileCount: profiles.length,
        status: `Error: ${error.message}`
      });
      return results;
    }
  }
  
  // Create sheets for each platform if they don't exist
  const sheets = google.sheets({ version: 'v4', auth });
  const createdSheets = [];
  
  for (const networkType of Object.keys(networkModules)) {
    const sheetName = networkType.charAt(0).toUpperCase() + networkType.slice(1);
    try {
      await driveUtils.createSheet(sheets, spreadsheetId, sheetName);
      createdSheets.push(sheetName);
    } catch (error) {
      console.error(`Error creating ${sheetName} sheet: ${error.message}`);
    }
  }
  
  // Get profile IDs for API call
  const profileIds = profiles.map(profile => profile.customer_profile_id);
  
  // Fetch analytics data for these profiles
  console.log(`\n=== FETCHING ANALYTICS DATA ===`);
  console.log(`Date range: ${START_DATE} to ${END_DATE}`);
  console.log(`Profiles: ${profileIds.join(', ')}`);
  
  try {
    const analyticsData = await api.getAnalyticsData(
      process.env.SPROUT_ANALYTICS_URL,
      SPROUT_API_TOKEN,
      START_DATE,
      END_DATE,
      profileIds
    );
    
    // Log the raw data for debugging
    console.log(`Received ${analyticsData?.data?.length || 0} data points from API`);
    
    if (!analyticsData || !analyticsData.data || analyticsData.data.length === 0) {
      console.warn(`No analytics data found for group ${groupName} in period ${START_DATE} to ${END_DATE}`);
      results.push({
        groupId,
        groupName,
        folderId,
        description,
        dateRange: `${START_DATE} to ${END_DATE}`,
        profileCount: profiles.length,
        spreadsheetId,
        spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
        status: 'No data'
      });
      return results;
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
    const updatePromises = [];
    const sheetTimers = {};
    
    for (const [networkType, rows] of Object.entries(rowsByNetwork)) {
      if (rows.length > 0) {
        const sheetName = networkType.charAt(0).toUpperCase() + networkType.slice(1);
        if (createdSheets.includes(sheetName)) {
          const module = networkModules[networkType];
          if (module && module.updateSheet) {
            // Record start time for this sheet
            const sheetStartTime = new Date();
            console.log(`Starting ${sheetName} sheet update at ${sheetStartTime.toLocaleTimeString()} with ${rows.length} rows`);
            
            // Store the start time for later calculation
            sheetTimers[sheetName] = sheetStartTime;
            
            // Wrap the update in a function that logs timing information
            const updateWithTiming = async () => {
              try {
                await module.updateSheet(sheetsUtils, auth, spreadsheetId, rows);
                const sheetEndTime = new Date();
                const sheetTimeMs = sheetEndTime - sheetTimers[sheetName];
                const sheetTimeSec = Math.round(sheetTimeMs / 1000);
                console.log(`Completed ${sheetName} sheet update at ${sheetEndTime.toLocaleTimeString()}. Time taken: ${sheetTimeSec} seconds`);
              } catch (error) {
                const sheetEndTime = new Date();
                const sheetTimeMs = sheetEndTime - sheetTimers[sheetName];
                const sheetTimeSec = Math.round(sheetTimeMs / 1000);
                console.error(`Error updating ${sheetName} sheet after ${sheetTimeSec} seconds: ${error.message}`);
                throw error; // Re-throw to maintain original error handling
              }
            };
            
            updatePromises.push(updateWithTiming());
          } else {
            console.log(`No updateSheet method found for ${networkType}`);
          }
        } else {
          console.log(`Sheet ${sheetName} not created, skipping update`);
        }
      } else {
        console.log(`No rows to update for ${networkType}`);
      }
    }
    
    await Promise.all(updatePromises);
    
    console.log(`Completed processing for group ${groupName} in folder ${folderId}`);
    console.log(`Spreadsheet URL: https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`);
    
    results.push({
      groupId,
      groupName,
      folderId,
      description,
      dateRange: `${START_DATE} to ${END_DATE}`,
      profileCount: profiles.length,
      spreadsheetId,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
      status: 'Success'
    });
    
    return results;
  } catch (error) {
    console.error(`Error processing analytics for group ${groupName}: ${error.message}`);
    results.push({
      groupId,
      groupName,
      folderId,
      description,
      dateRange: `${START_DATE} to ${END_DATE}`,
      profileCount: profiles.length,
      status: `Error: ${error.message}`
    });
    return results;
  }
};

/**
 * Main function to orchestrate the entire process
 */
const main = async () => {
  console.log('\n=== HISTORICAL DATA UPDATE STARTING ===');
  console.log(`Start time: ${new Date().toLocaleString()}`);
  console.log(`Date range: ${START_DATE} to ${END_DATE}`);
  console.log(`Folder ID: ${FOLDER_ID}`);
  
  try {
    // Ensure Drive credentials exist
    saveDriveCredentials();
    
    // Verify Drive credentials before proceeding
    let credentialsValid = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`Verifying Google Drive credentials (attempt ${attempt}/3)...`);
        credentialsValid = await verifyDriveCredentials();
        if (credentialsValid) break;
        
        console.error(`Credentials verification failed on attempt ${attempt}/3.`);
        if (attempt < 3) {
          console.log('Waiting 5 seconds before retrying...');
          await sleep(5000);
        }
      } catch (verifyError) {
        console.error(`Error during credentials verification (attempt ${attempt}/3): ${verifyError.message}`);
        if (attempt < 3) {
          console.log('Waiting 5 seconds before retrying...');
          await sleep(5000);
        }
      }
    }
    
    if (!credentialsValid) {
      console.error('Google Drive credentials verification failed after multiple attempts.');
      console.error('Will attempt to continue with limited functionality.');
    }
    
    // Fetch all groups with retry logic
    console.log('\n=== Fetching Customer Groups ===');
    let groups = [];
    
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`[API CALL] Fetching customer groups from: ${BASE_URL}/${CUSTOMER_ID}/metadata/customer/groups (attempt ${attempt}/3)`);
        groups = await groupUtils.getCustomerGroups(BASE_URL, CUSTOMER_ID, SPROUT_API_TOKEN);
        if (groups.length > 0) break;
        
        console.error(`No groups found on attempt ${attempt}/3.`);
        if (attempt < 3) {
          console.log('Waiting 10 seconds before retrying...');
          await sleep(10000);
        }
      } catch (groupError) {
        console.error(`Error fetching groups (attempt ${attempt}/3): ${groupError.message}`);
        if (attempt < 3) {
          console.log('Waiting 10 seconds before retrying...');
          await sleep(10000);
        }
      }
    }
    
    if (groups.length === 0) {
      console.error('Failed to fetch any groups after multiple attempts');
      return;
    }
    
    console.log(`Found ${groups.length} groups`);
    
    // Process each group
    const allResults = [];
    
    for (const group of groups) {
      const groupId = group.id;
      const groupName = group.name;
      
      // Fetch profiles for this group
      console.log(`\n=== FETCHING PROFILES FOR GROUP: ${groupName} ===`);
      
      let profiles = [];
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          console.log(`[API CALL] Fetching profiles for group ${groupName} (${groupId}) (attempt ${attempt}/3)`);
          profiles = await api.getProfileData(
            process.env.SPROUT_PROFILES_URL,
            SPROUT_API_TOKEN,
            [groupId]
          );
          
          if (profiles && profiles.length > 0) break;
          
          console.error(`No profiles found for group ${groupName} on attempt ${attempt}/3.`);
          if (attempt < 3) {
            console.log('Waiting 10 seconds before retrying...');
            await sleep(10000);
          }
        } catch (profileError) {
          console.error(`Error fetching profiles for group ${groupName} (attempt ${attempt}/3): ${profileError.message}`);
          if (attempt < 3) {
            console.log('Waiting 10 seconds before retrying...');
            await sleep(10000);
          }
        }
      }
      
      if (!profiles || profiles.length === 0) {
        console.error(`Failed to fetch profiles for group ${groupName} after multiple attempts`);
        continue;
      }
      
      console.log(`Found ${profiles.length} profiles in group ${groupName}`);
      
      // Process analytics for this group
      const results = await processGroupAnalytics(groupId, groupName, profiles);
      allResults.push(...results);
    }
    
    // Print summary
    console.log('\n=== HISTORICAL DATA UPDATE COMPLETED ===');
    console.log(`End time: ${new Date().toLocaleString()}`);
    console.log(`Processed ${allResults.length} groups`);
    
    for (const result of allResults) {
      console.log(`\nGroup: ${result.groupName}`);
      console.log(`Status: ${result.status}`);
      if (result.spreadsheetUrl) {
        console.log(`Spreadsheet: ${result.spreadsheetUrl}`);
      }
    }
    
  } catch (error) {
    console.error(`Error in main process: ${error.message}`);
    console.error(error.stack);
  }
};

// All required environment variables are set directly in this script
console.log('Starting historical data update with date range:', START_DATE, 'to', END_DATE);
console.log('Using folder ID:', FOLDER_ID);

// Run the main function
main().catch(error => {
  console.error('Critical error in main function:');
  console.error(error);
  process.exit(1);
});

// Set up global unhandled exception handlers to prevent crashes
process.on('uncaughtException', (error) => {
  console.error('CRITICAL ERROR: Uncaught Exception detected');
  console.error(`Error: ${error.message}`);
  console.error(error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('CRITICAL ERROR: Unhandled Promise Rejection detected');
  console.error('Reason:', reason);
});

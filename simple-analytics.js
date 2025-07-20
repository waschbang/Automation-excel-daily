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

/**
 * Sleep for a specified duration
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Import platform modules
const instagram = require('./platforms/instagram');
const youtube = require('./platforms/youtube');
const linkedin = require('./platforms/linkedin');
const facebook = require('./platforms/facebook');
const twitter = require('./platforms/twitter');

// API & Authentication
const CUSTOMER_ID = "2653573";
const SPROUT_API_TOKEN = "MjY1MzU3M3wxNzUyMjE2ODQ5fDdmNzgxNzQyLWI3NWEtNDFkYS1hN2Y4LWRkMTE3ODRhNzBlNg==";

// Get yesterday's date in YYYY-MM-DD format for more complete analytics data
const getCurrentDate = () => {
  // Use yesterday's date instead of today to ensure complete metrics
  // Social media platforms often have a delay in reporting analytics
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  const year = yesterday.getFullYear();
  const month = String(yesterday.getMonth() + 1).padStart(2, '0');
  const day = String(yesterday.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Date ranges for analytics - only using one folder and only fetching today's data
const FOLDER_ID = '1usYEd9TeNI_2gapA-dLK4y27zvvWJO8r';
const START_DATE = getCurrentDate(); // Today's date as start date
const END_DATE = getCurrentDate();   // Today's date as end date
const DESCRIPTION = 'Q1 2025';

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
    
    // Create base name pattern (without date/time) for searching existing spreadsheets
    const baseNamePattern = `Sprout Analytics - ${groupName} - Daily Update`;
    
    // Full title with last updated time - exactly matching the Q4-2024 format
    const spreadsheetTitle = `Sprout Analytics - ${groupName} - Daily Update - Last Updated ${formattedDate} ${formattedTime}`;
    
    // First check if a spreadsheet for this group already exists
    console.log(`Looking for existing spreadsheet: "${baseNamePattern}"`);
    
    let spreadsheetId = await driveUtils.findExistingSpreadsheet(
      drive,
      baseNamePattern,
      FOLDER_ID
    );
    
    if (spreadsheetId) {
      console.log(`Found existing spreadsheet: "${spreadsheetId}"`);
      console.log(`Updating title to: "${spreadsheetTitle}"`);
      
      // Update the spreadsheet title
      await drive.files.update({
        fileId: spreadsheetId,
        resource: {
          name: spreadsheetTitle
        }
      });
    } else {
      // No existing spreadsheet found, create a new one
      console.log(`No existing spreadsheet found. Creating a new one: "${spreadsheetTitle}"`);
      
      try {
        // Create a new spreadsheet
        const response = await sheets.spreadsheets.create({
          resource: {
            properties: {
              title: spreadsheetTitle
            }
          }
        });
        
        spreadsheetId = response.data.spreadsheetId;
        
        // Move the spreadsheet to the specified folder
        await drive.files.update({
          fileId: spreadsheetId,
          addParents: FOLDER_ID,
          removeParents: 'root',
          fields: 'id, parents'
        });
        
        console.log(`Created spreadsheet with ID: ${spreadsheetId}`);
      } catch (error) {
        console.error(`Failed to create spreadsheet for group ${groupName}: ${error.message}`);
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
    
    // Fetch analytics data for all profiles in this group
    const profileIds = profiles.map(p => p.customer_profile_id).filter(id => id);
    console.log(`Fetching analytics data for ${profileIds.length} profiles in group ${groupName} from ${START_DATE} to ${END_DATE}`);
    
    // Always update data even if today's data exists
    console.log(`Fetching fresh data for ${getCurrentDate()} to update spreadsheet`);
    
    // Check if we need to clear existing data for today to avoid duplicates
    try {
      const today = getCurrentDate();
      
      // For each sheet, check if today's data exists and clear it if it does
      for (const sheetName of createdSheets) {
        console.log(`Checking for existing data in ${sheetName} sheet...`);
        const existingValues = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${sheetName}!A:Z`
        });
        
        if (existingValues.data && existingValues.data.values && existingValues.data.values.length > 1) {
          // Find rows with today's date in column A
          const rowsWithToday = [];
          existingValues.data.values.forEach((row, index) => {
            if (row[0] === today) {
              rowsWithToday.push(index + 1); // +1 because sheets are 1-indexed
            }
          });
          
          if (rowsWithToday.length > 0) {
            console.log(`Found ${rowsWithToday.length} rows with today's date (${today}) in sheet ${sheetName}. Will update these rows.`);
            
            // Clear existing data for today to avoid duplicates
            for (const rowIndex of rowsWithToday) {
              await sheets.spreadsheets.values.clear({
                spreadsheetId,
                range: `${sheetName}!A${rowIndex}:Z${rowIndex}`
              });
            }
            console.log(`Cleared existing data for today in sheet ${sheetName}.`);
          } else {
            console.log(`No existing data found for today (${today}) in sheet ${sheetName}.`);
          }
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
    const updatePromises = [];
    
    for (const [networkType, rows] of Object.entries(rowsByNetwork)) {
      if (rows.length > 0) {
        const sheetName = networkType.charAt(0).toUpperCase() + networkType.slice(1);
        if (createdSheets.includes(sheetName)) {
          const module = networkModules[networkType];
          if (module && module.updateSheet) {
            console.log(`Updating ${sheetName} sheet with ${rows.length} rows`);
            updatePromises.push(module.updateSheet(sheetsUtils, auth, spreadsheetId, rows));
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
    
    // Verify access to the folder
    try {
      console.log(`Verifying access to folder: ${FOLDER_ID}`);
      const folderResponse = await drive.files.get({
        fileId: FOLDER_ID,
        fields: 'id,name,capabilities(canEdit)'
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
      // Continue anyway, as the folder might still be accessible
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
        await sleep(30 * 1000); // 30 seconds between groups instead of 5 minutes
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

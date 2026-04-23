#!/usr/bin/env node

/**
 * Sprout Social Group Analytics to Google Sheets
 * ==============================================
 * This script fetches analytics data from Sprout Social API for all profiles in each group
 * and creates separate Google Sheets for each group with the data.
 * Modified to save spreadsheets to multiple Drive folders.
 * Uses Google Service Account authentication for continuous operation.
 */

const path = require('path');
const fs = require('fs');

// Import utilities
const apiUtils = require('./utils/api');
const sheetsUtils = require('./utils/sheets');
const driveUtils = require('./utils/drive');
const groupUtils = require('./utils/groups');
const authUtils = require('./utils/auth');

/**
 * Sleep for a specified duration
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// API & Authentication
const CUSTOMER_ID = "2426451";
const SPROUT_API_TOKEN = "MjQyNjQ1MXwxNzQyNzk4MTc4fDQ0YmU1NzQ4LWI1ZDAtNDhkMi04ODQxLWE1YzM1YmI4MmNjNQ==";

// Paths
const SERVICE_ACCOUNT_KEY_PATH = path.join(__dirname, 'service-account-key.json');

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
const FOLDER_CONFIGS = [
  {
    folderId: '1usYEd9TeNI_2gapA-dLK4y27zvvWJO8r',
    startDate: getCurrentDate(), // Today's date as start date
    endDate: getCurrentDate(),   // Today's date as end date
    description: 'Daily Update'
  }
];

// Sprout Social API endpoints
const BASE_URL = "https://api.sproutsocial.com/v1";
const METADATA_URL = `${BASE_URL}/${CUSTOMER_ID}/metadata/customer`;
const ANALYTICS_URL = `${BASE_URL}/${CUSTOMER_ID}/analytics/profiles`;

// Check for available credentials files
const checkCredentials = () => {
  try {
    // First check for service account key
    if (fs.existsSync(SERVICE_ACCOUNT_KEY_PATH)) {
      console.log(`Found service account key at ${SERVICE_ACCOUNT_KEY_PATH}`);
      return SERVICE_ACCOUNT_KEY_PATH;
    }
    
    // Check for drive-credentials.json as fallback
    const driveCredentialsPath = path.join(__dirname, 'drive-credentials.json');
    if (fs.existsSync(driveCredentialsPath)) {
      console.log(`Service account key not found, using drive credentials at ${driveCredentialsPath}`);
      return driveCredentialsPath;
    }
    
    // Check for credentials.json as second fallback
    const credentialsPath = path.join(__dirname, 'credentials.json');
    if (fs.existsSync(credentialsPath)) {
      console.log(`Using credentials at ${credentialsPath}`);
      return credentialsPath;
    }
    
    // No credentials found
    throw new Error(`No credentials found. Please create one of the following files:\n- ${SERVICE_ACCOUNT_KEY_PATH}\n- ${driveCredentialsPath}\n- ${credentialsPath}`);
  } catch (error) {
    console.error(`Credentials error: ${error.message}`);
    console.error('\nPlease ensure you have:');
    console.error('1. Created a service account or OAuth client in the Google Cloud Console');
    console.error('2. Downloaded the credentials file');
    console.error('3. Saved it to one of the locations mentioned above');
    console.error('4. Shared your Google Drive folders with the appropriate account');
    process.exit(1); // Exit if we can't set up credentials - no point continuing
  }
};

/**
 * Authenticate with Google Drive and verify access to folders
 * @returns {Promise<{auth, drive, sheets}>} Authentication and API clients
 */
const authenticateAndVerifyAccess = async () => {
  try {
    console.log('Authenticating with Google APIs...');
    
    // Get the path to credentials file
    const credentialsPath = checkCredentials();
    
    // Authenticate with the credentials
    const googleClients = await authUtils.authenticateWithServiceAccount(credentialsPath);
    if (!googleClients.drive || !googleClients.sheets || !googleClients.auth) {
      throw new Error('Failed to initialize Google API clients');
    }
    
    // Make a simple API call to test authentication
    // List files with a very small limit to minimize API usage
    await googleClients.drive.files.list({
      pageSize: 1,
      fields: 'files(id, name)'
    });
    
    console.log('Google Service Account authentication successful!');
    
    // Verify access to all folders
    let allFoldersAccessible = true;
    for (const folderConfig of FOLDER_CONFIGS) {
      const folderAccessible = await authUtils.verifyFolderAccess(googleClients.drive, folderConfig.folderId);
      if (!folderAccessible) {
        console.error(`Warning: Issues accessing folder ${folderConfig.folderId}`);
        console.error('Make sure the folder is shared with the service account email.');
        allFoldersAccessible = false;
      }
    }
    
    if (!allFoldersAccessible) {
      console.warn('\nSome folders may not be accessible. The script will continue but may encounter errors.');
      console.warn('Please ensure all folders are shared with the service account email with Editor permissions.');
    }
    
    return googleClients;
  } catch (error) {
    console.error(`Google Drive authentication failed: ${error.message}`);
    
    if (error.message.includes('invalid_grant') || 
        error.message.includes('Invalid JWT')) {
      console.error('\nAuthentication error detected. The service account credentials are invalid.');
      console.error('Please generate new service account keys from the Google Cloud Console.');
    } else if (error.message.includes('permission') || error.message.includes('access')) {
      console.error('\nPermission error detected. The service account does not have access to the requested resources.');
      console.error('Please ensure all Google Drive folders are shared with the service account email.');
    }
    
    process.exit(1); // Exit if authentication fails - no point continuing
  }
};

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
    const groupStartTime = new Date();
    console.log(`\n=== Processing Group: ${groupName} (${groupId}) ===`);
    console.log(`Found ${profiles.length} profiles in this group`);
    
    // Use the provided Google API clients
    const { drive, sheets } = googleClients;
    if (!drive || !sheets) {
      throw new Error('Invalid Google API clients provided');
    }
    
    // Create spreadsheets in all specified folders with their respective date ranges
    const results = [];
    
    for (const folderConfig of FOLDER_CONFIGS) {
      const { folderId, startDate, endDate, description } = folderConfig;
      console.log(`Creating spreadsheet in folder: ${folderId} (${description}: ${startDate} to ${endDate})`);
      
      // Format current date and time for the spreadsheet title
      const now = new Date();
      const formattedDate = now.toISOString().split('T')[0]; // YYYY-MM-DD
      const formattedTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }); // HH:MM format
      
      // Create base name pattern (without date/time) for searching existing spreadsheets
      const baseNamePattern = `Sprout Analytics - ${groupName} - ${description}`;
      
      // Full title with last updated time
      const spreadsheetTitle = `${baseNamePattern} - Last Updated ${formattedDate} ${formattedTime}`;
      
      // First check if a spreadsheet for this group already exists by pattern matching
      const existingSpreadsheet = await driveUtils.findSpreadsheetByPattern(drive, baseNamePattern, folderId);
      
      let spreadsheetId;
      
      if (existingSpreadsheet) {
        // Use the existing spreadsheet but update its title to reflect the new update time
        spreadsheetId = existingSpreadsheet.id;
        console.log(`Found existing spreadsheet: "${existingSpreadsheet.name}" (${spreadsheetId})`);
        console.log(`Updating title to: "${spreadsheetTitle}"`);
        
        // Update the spreadsheet title
        await driveUtils.updateSpreadsheetTitle(drive, spreadsheetId, spreadsheetTitle);
      } else {
        // No existing spreadsheet found, create a new one
        console.log(`No existing spreadsheet found. Creating a new one: "${spreadsheetTitle}"`);
        spreadsheetId = await driveUtils.createSpreadsheet(sheets, drive, spreadsheetTitle, folderId);
        
        if (!spreadsheetId) {
          console.error(`Failed to create spreadsheet for group ${groupName} in folder ${folderId}`);
          continue; // Skip to next folder if this one fails
        }
      }
      
      // Group profiles by network type
      const profilesByNetwork = groupUtils.groupProfilesByNetworkType(profiles);
      
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
          await driveUtils.createSheet(sheets, spreadsheetId, sheetName);
          createdSheets.push(sheetName);
          
          // Set up headers
          const module = networkModules[networkType];
          if (module && module.setupHeaders) {
            await module.setupHeaders(sheetsUtils, googleClients.auth, spreadsheetId);
          }
        }
      }
      
      // Fetch analytics data for all profiles in this group using this folder's date range
      const profileIds = profiles.map(p => p.customer_profile_id).filter(id => id);
      console.log(`Fetching analytics data for ${profileIds.length} profiles in group ${groupName} from ${startDate} to ${endDate}`);
      
      // First check if we already have data for today to avoid duplicates
      let existingData = false;
      try {
        // Get the current date in the format used in the spreadsheet (YYYY-MM-DD)
        const today = getCurrentDate();
        
        // Check if we already have data for today in the spreadsheet
        for (const sheetName of createdSheets) {
          const existingValues = await sheetsUtils.getSheetValues(googleClients.auth, spreadsheetId, sheetName, 'A:A');
          if (existingValues && existingValues.length > 1) {
            // Check if today's date exists in column A
            const todayExists = existingValues.some(row => row[0] === today);
            if (todayExists) {
              console.log(`Data for today (${today}) already exists in sheet ${sheetName}. Skipping update.`);
              existingData = true;
              break;
            }
          }
        }
      } catch (error) {
        console.warn(`Error checking for existing data: ${error.message}. Will proceed with update.`);
      }
      
      // Skip fetching if we already have today's data
      if (existingData) {
        console.log(`Skipping analytics update for group ${groupName} as today's data already exists.`);
        results.push({
          groupId,
          groupName,
          folderId,
          description,
          dateRange: `${startDate} to ${endDate}`,
          profileCount: profiles.length,
          spreadsheetId,
          spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
          status: 'Already updated today'
        });
        continue; // Skip to next folder
      }
      
      // Fetch fresh data from API
      const analyticsData = await apiUtils.getAnalyticsData(
        ANALYTICS_URL,
        SPROUT_API_TOKEN,
        startDate,
        endDate,
        profileIds
      );
      
      // Log the raw data for debugging
      console.log(`Received ${analyticsData?.data?.length || 0} data points from API`);
      if (analyticsData?.data?.length > 0) {
        // Log the first data point's metrics to see all available fields
        const sampleDataPoint = analyticsData.data[0];
        console.log('\n=== SAMPLE API DATA POINT ===');
        console.log('Date:', sampleDataPoint.dimensions?.reporting_period || sampleDataPoint.dimensions?.['reporting_period.by(day)']);
        console.log('Profile ID:', sampleDataPoint.dimensions?.customer_profile_id);
        console.log('\nAVAILABLE METRICS:');
        console.log('----------------');
        
        // Sort metrics by name for easier reading
        const metricKeys = Object.keys(sampleDataPoint.metrics || {}).sort();
        metricKeys.forEach(key => {
          console.log(`${key}: ${sampleDataPoint.metrics[key]}`);
        });
        
        console.log('\nSample data point (full):', JSON.stringify(sampleDataPoint, null, 2));
      }
      
      if (!analyticsData || !analyticsData.data || analyticsData.data.length === 0) {
        console.warn(`No analytics data found for group ${groupName} in period ${startDate} to ${endDate}`);
        results.push({
          groupId,
          groupName,
          folderId,
          description,
          dateRange: `${startDate} to ${endDate}`,
          profileCount: profiles.length,
          spreadsheetId,
          spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
          status: 'No data'
        });
        continue; // Skip to next folder
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
                  await module.updateSheet(sheetsUtils, googleClients.auth, spreadsheetId, rows);
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
        dateRange: `${startDate} to ${endDate}`,
        profileCount: profiles.length,
        spreadsheetId,
        spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
        status: 'Completed'
      });
    }
    
    // Calculate and log the total time taken
    const groupEndTime = new Date();
    const executionTimeMs = groupEndTime - groupStartTime;
    const executionTimeSec = Math.round(executionTimeMs / 1000);
    const executionTimeMin = Math.round(executionTimeSec / 60 * 10) / 10;
    
    console.log(`\n=== Completed Group: ${groupName} (${groupId}) at ${groupEndTime.toLocaleTimeString()} ===`);
    console.log(`Total time taken: ${executionTimeMin} minutes (${executionTimeSec} seconds)`);
    console.log(`Spreadsheet URL: https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`);
    
    return results;
  } catch (error) {
    // Log error with timing information
    const groupEndTime = new Date();
    const executionTimeMs = groupEndTime - groupStartTime;
    const executionTimeSec = Math.round(executionTimeMs / 1000);
    const executionTimeMin = Math.round(executionTimeSec / 60 * 10) / 10;
    
    console.error(`Error processing group ${groupName} after ${executionTimeMin} minutes:`, error);
    return [{
      groupId,
      groupName,
      profileCount: profiles.length,
      status: `Error after ${executionTimeMin} minutes: ${error.message}`
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
    
    // Track execution time
    const trackTime = (label) => {
      const currentTime = new Date();
      const elapsedMs = currentTime - startTime;
      const elapsedSec = Math.round(elapsedMs / 1000);
      const elapsedMin = Math.round(elapsedSec / 60 * 10) / 10;
      console.log(`[TIMING] ${label}: ${elapsedMin} minutes (${elapsedSec} seconds)`);
      return currentTime;
    };
    
    trackTime('Process started');
    
    // Authenticate with Google APIs and verify folder access
    const googleClients = await authenticateAndVerifyAccess();
    trackTime('Google Drive authentication complete');
    
    // Fetch all groups with retry logic
    console.log('\n=== Fetching Customer Groups ===');
    let groups = [];
    trackTime('Fetching customer groups started');
    const groupFetchStartTime = trackTime('Fetching customer groups');
    
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
      console.error('No groups found after multiple attempts. Cannot proceed.');
      return;
    }
    
    console.log('\nGroup details:');
    groups.forEach((group, index) => {
      console.log(`${index + 1}. Group ID: ${group.group_id}, Name: ${group.name}`);
    });
    
    // Fetch all profiles with retry logic
    console.log('\n=== Fetching All Profiles ===');
    let profiles = [];
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        profiles = await groupUtils.getAllProfiles(BASE_URL, CUSTOMER_ID, SPROUT_API_TOKEN);
        if (profiles.length > 0) break;
        
        console.error(`No profiles found on attempt ${attempt}/3.`);
        if (attempt < 3) {
          console.log('Waiting 10 seconds before retrying...');
          await sleep(10000);
        }
      } catch (profileError) {
        console.error(`Error fetching profiles (attempt ${attempt}/3): ${profileError.message}`);
        if (attempt < 3) {
          console.log('Waiting 10 seconds before retrying...');
          await sleep(10000);
        }
      }
    }
    
    if (profiles.length === 0) {
      console.error('No profiles found after multiple attempts. Cannot proceed.');
      return;
    }
    
    console.log('\nProfile details:');
    profiles.slice(0, 5).forEach((profile, index) => {
      const groupsInfo = profile.groups ? profile.groups.join(',') : 'None';
      console.log(`${index + 1}. Profile ID: ${profile.customer_profile_id}, Name: ${profile.name}, Network: ${profile.network_type}, Groups: ${groupsInfo}`);
    });
    if (profiles.length > 5) {
      console.log(`... and ${profiles.length - 5} more profiles`);
    }
    
    // Group profiles by group ID
    console.log('\n=== Grouping Profiles by Group ID ===');
    let profilesByGroup;
    try {
      profilesByGroup = groupUtils.groupProfilesByGroup(profiles, groups);
    } catch (groupingError) {
      console.error(`Error grouping profiles: ${groupingError.message}`);
      console.error('Attempting to continue with limited functionality...');
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
    
    // Process groups with a delay between each to avoid hitting API quotas
    for (const [groupId, groupData] of Object.entries(profilesByGroup)) {
      const { groupName, profiles } = groupData;
      
      if (profiles.length > 0) {
        try {
          console.log(`\nProcessing group: ${groupName} (${groupId}) with ${profiles.length} profiles`);
          const results = await processGroupAnalytics(groupId, groupName, profiles, googleClients);
          if (results && results.length > 0) {
            allResults.push(...results);
          }
          
          // Add a much longer delay after processing each group to avoid hitting API quotas
          // Wait 5 minutes between groups
          console.log(`Waiting 5 minutes before processing the next group to avoid API quota limits...`);
          await sleep(5 * 60 * 1000); // 5 minutes in milliseconds
        } catch (error) {
          console.error(`Error processing group ${groupName}: ${error.message}`);
          if (error.stack) {
            console.error(`Stack trace: ${error.stack}`);
          }
          
          // Even if there's an error, wait before trying the next group
          console.log(`Waiting 10 seconds before continuing to the next group...`);
          await sleep(10000);
        }
      } else {
        console.log(`Skipping group ${groupName} (${groupId}) - no profiles found`);
      }
    }
    
    // Print summary
    console.log('\n=== Processing Complete ===');
    console.log(`Processed ${allResults.length} spreadsheets across ${FOLDER_CONFIGS.length} folders:`);
    
    // Group results by folder
    const resultsByFolder = {};
    FOLDER_CONFIGS.forEach(config => {
      resultsByFolder[config.folderId] = {
        description: config.description,
        dateRange: `${config.startDate} to ${config.endDate}`,
        results: allResults.filter(result => result.folderId === config.folderId)
      };
    });
    
    // Print summary by folder
    for (const [folderId, folderData] of Object.entries(resultsByFolder)) {
      const { description, dateRange, results } = folderData;
      console.log(`\nFolder ID: ${folderId} - ${description} (${dateRange}) - ${results.length} spreadsheets created:`);
      
      results.forEach(result => {
        if (result.spreadsheetUrl) {
          console.log(`- ${result.groupName} (${result.profileCount} profiles): ${result.spreadsheetUrl}`);
        } else {
          console.log(`- ${result.groupName} (${result.profileCount} profiles): ${result.status}`);
        }
      });
    }
    
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

// Add a watchdog timer to prevent indefinite hangs
const WATCHDOG_TIMEOUT = 4 * 60 * 60 * 1000; // 4 hours max runtime
const watchdog = setTimeout(() => {
  console.error(`WATCHDOG ALERT: Script has been running for ${WATCHDOG_TIMEOUT/1000/60/60} hours.`);
  console.error('This may indicate a hang or infinite loop condition.');
  console.error('Script execution will continue, but you may want to investigate.');
}, WATCHDOG_TIMEOUT);
watchdog.unref(); // Don't let the watchdog prevent the process from exiting normally

// Run the main function with comprehensive error handling
main().catch(err => {
  console.error('Unhandled error in main function:', err);
  console.error('Script execution completed with errors, but did not crash.');
});
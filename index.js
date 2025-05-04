#!/usr/bin/env node

/**
 * Sprout Social Group Analytics to Google Sheets
 * ==============================================
 * This script fetches analytics data from Sprout Social API for all profiles in each group
 * and creates separate Google Sheets for each group with the data.
 */

const path = require('path');
const fs = require('fs');

// Import utilities
const apiUtils = require('./utils/api');
const sheetsUtils = require('./utils/sheets');
const driveUtils = require('./utils/drive');
const groupUtils = require('./utils/groups');

// Import platform modules
const instagram = require('./platforms/instagram');
const youtube = require('./platforms/youtube');
const linkedin = require('./platforms/linkedin');
const facebook = require('./platforms/facebook');
const twitter = require('./platforms/twitter');

// API & Authentication
const CUSTOMER_ID = "2426451";
const SPROUT_API_TOKEN = "MjQyNjQ1MXwxNzQyNzk4MTc4fDQ0YmU1NzQ4LWI1ZDAtNDhkMi04ODQxLWE1YzM1YmI4MmNjNQ==";

// Paths
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const DRIVE_CREDENTIALS_PATH = path.join(__dirname, 'drive-credentials.json');

// Date range for analytics
const START_DATE = '2025-01-01';
const END_DATE = '2025-05-01';

// Google Drive folder ID to save all spreadsheets
const DRIVE_FOLDER_ID = '1usYEd9TeNI_2gapA-dLK4y27zvvWJO8r';

// Sprout Social API endpoints
const BASE_URL = "https://api.sproutsocial.com/v1";
const METADATA_URL = `${BASE_URL}/${CUSTOMER_ID}/metadata/customer`;
const ANALYTICS_URL = `${BASE_URL}/${CUSTOMER_ID}/analytics/profiles`;

// Check if Drive credentials exist, or create them from a source file
const saveDriveCredentials = () => {
  try {
    // If drive credentials file already exists, don't overwrite it
    if (fs.existsSync(DRIVE_CREDENTIALS_PATH)) {
      console.log(`Drive credentials already exist at ${DRIVE_CREDENTIALS_PATH}`);
      
      // Verify the file contains valid JSON
      try {
        const fileContent = fs.readFileSync(DRIVE_CREDENTIALS_PATH, 'utf8');
        const credentials = JSON.parse(fileContent);
        
        // Check for required fields
        if (!credentials.private_key || !credentials.client_email) {
          console.log('Existing credentials file is missing required fields, will recreate it.');
          throw new Error('Invalid credentials format');
        }
        
        // Check if private key looks valid (has proper BEGIN/END markers)
        if (!credentials.private_key.includes('-----BEGIN PRIVATE KEY-----') || 
            !credentials.private_key.includes('-----END PRIVATE KEY-----')) {
          console.log('Existing credentials file has malformed private key, will recreate it.');
          throw new Error('Malformed private key');
        }
        
        return;
      } catch (parseError) {
        console.log(`Existing credentials file has issues, will recreate it: ${parseError.message}`);
      }
    }
    
    // Source credentials file path (use credentials.json if it exists)
    const sourceCredentialsPath = path.join(__dirname, 'credentials.json');
    
    if (!fs.existsSync(sourceCredentialsPath)) {
      throw new Error(`Source credentials file not found at ${sourceCredentialsPath}`);
    }
    
    // Read credentials from source file
    const credentials = JSON.parse(fs.readFileSync(sourceCredentialsPath, 'utf8'));
    
    // Ensure it has the required fields for a service account
    if (!credentials.private_key || !credentials.client_email) {
      throw new Error('Source credentials file is missing required service account fields');
    }
    
    // Ensure private key has proper format
    if (!credentials.private_key.includes('-----BEGIN PRIVATE KEY-----') || 
        !credentials.private_key.includes('-----END PRIVATE KEY-----')) {
      throw new Error('Source credentials file has malformed private key');
    }

    // Write to drive credentials file
  fs.writeFileSync(DRIVE_CREDENTIALS_PATH, JSON.stringify(credentials, null, 2));
  console.log(`Drive credentials saved to ${DRIVE_CREDENTIALS_PATH}`);
  } catch (error) {
    console.error(`Failed to save drive credentials: ${error.message}`);
    console.error('Please ensure you have valid Google service account credentials in credentials.json');
    console.error('You may need to generate new service account keys from the Google Cloud Console.');
    process.exit(1); // Exit if we can't set up credentials - no point continuing
  }
};

/**
 * Verify Google Drive credentials by making a test API call
 * @returns {Promise<boolean>} True if credentials are valid, false otherwise
 */
const verifyDriveCredentials = async () => {
  try {
    console.log('Verifying Google Drive credentials...');
    
    // Get Google Drive client
    const { drive, sheets, auth } = await driveUtils.getDriveClient(DRIVE_CREDENTIALS_PATH);
    if (!drive || !sheets || !auth) {
      throw new Error('Failed to initialize Google Drive client');
    }
    
    // Make a simple API call to test authentication
    // List files with a very small limit to minimize API usage
    await drive.files.list({
      pageSize: 1,
      fields: 'files(id, name)'
    });
    
    console.log('Google Drive credentials verified successfully!');
    return true;
  } catch (error) {
    console.error(`Google Drive credentials verification failed: ${error.message}`);
    
    if (error.message.includes('invalid_grant') || 
        error.message.includes('Invalid JWT') || 
        error.message.includes('Token has been expired')) {
      console.error('\nAuthentication error detected. The service account credentials are invalid or expired.');
      console.error('Please generate new service account keys from the Google Cloud Console.');
      console.error('1. Go to https://console.cloud.google.com/');
      console.error('2. Select your project');
      console.error('3. Go to IAM & Admin > Service Accounts');
      console.error('4. Find your service account and create a new key');
      console.error('5. Download the key as JSON and save it as credentials.json in this directory');
      console.error('6. Delete the existing drive-credentials.json file');
      console.error('7. Run this script again');
    }
    
    return false;
  }
};

/**
 * Process analytics data for a group
 * @param {string} groupId - Group ID
 * @param {string} groupName - Group name
 * @param {Array} profiles - Array of profiles in the group
 * @returns {Promise<void>}
 */
const processGroupAnalytics = async (groupId, groupName, profiles) => {
  try {
    console.log(`\n=== Processing Group: ${groupName} (${groupId}) ===`);
    console.log(`Found ${profiles.length} profiles in this group`);
    
    // Get Google Drive client
    const { drive, sheets, auth, refreshAuth } = await driveUtils.getDriveClient(DRIVE_CREDENTIALS_PATH);
    if (!drive || !sheets || !auth) {
      throw new Error('Failed to authenticate with Google Drive API');
    }
    
    // Refresh authentication token before critical operations
    try {
      await refreshAuth();
      console.log('Authentication refreshed before processing group analytics');
    } catch (refreshError) {
      console.warn(`Warning: Could not refresh authentication: ${refreshError.message}`);
      console.warn('Proceeding with existing token...');
    }
    
    // Format current date and time for the spreadsheet title
    const now = new Date();
    const formattedDate = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const formattedTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }); // HH:MM format
    
    // Create base name pattern (without date/time) for searching existing spreadsheets
    const baseNamePattern = `Sprout Analytics - ${groupName}`;
    
    // Full title with last updated time
    const spreadsheetTitle = `${baseNamePattern} - Last Updated ${formattedDate} ${formattedTime}`;
    
    // First check if a spreadsheet for this group already exists by pattern matching
    const existingSpreadsheet = await driveUtils.findSpreadsheetByPattern(drive, baseNamePattern, DRIVE_FOLDER_ID);
    
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
      spreadsheetId = await driveUtils.createSpreadsheet(sheets, drive, spreadsheetTitle, DRIVE_FOLDER_ID, refreshAuth);
      if (!spreadsheetId) {
        throw new Error(`Failed to create spreadsheet for group ${groupName}`);
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
        await driveUtils.createSheet(sheets, spreadsheetId, sheetName, refreshAuth);
        createdSheets.push(sheetName);
        
        // Set up headers
        const module = networkModules[networkType];
        if (module && module.setupHeaders) {
          await module.setupHeaders(sheetsUtils, auth, spreadsheetId);
        }
      }
    }
    
    // Fetch analytics data for all profiles in this group
    const profileIds = profiles.map(p => p.customer_profile_id).filter(id => id);
    console.log(`Fetching analytics data for ${profileIds.length} profiles in group ${groupName}`);
    
    const analyticsData = await apiUtils.getAnalyticsData(
      ANALYTICS_URL,
      SPROUT_API_TOKEN,
      START_DATE,
      END_DATE,
      profileIds
    );
    
    if (!analyticsData || !analyticsData.data || analyticsData.data.length === 0) {
      console.warn(`No analytics data found for group ${groupName}`);
      return;
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
    
    return spreadsheetId;
  } catch (error) {
    console.error(`Error processing group ${groupName}:`, error);
    return null;
  }
};

/**
 * Main function to orchestrate the entire process
 */
const main = async () => {
  try {
    console.log('Starting Group Analytics Processing');
    
    // Save Drive credentials
    saveDriveCredentials();
    
    // Verify Drive credentials before proceeding
    const credentialsValid = await verifyDriveCredentials();
    if (!credentialsValid) {
      console.error('Google Drive credentials verification failed. Cannot proceed with spreadsheet creation.');
      console.error('Please fix the credentials issues and try again.');
      return;
    }    
                    // Fetch all groups
    console.log('\n=== Fetching Customer Groups ===');
    const groups = await groupUtils.getCustomerGroups(BASE_URL, CUSTOMER_ID, SPROUT_API_TOKEN);
    if (groups.length === 0) {
      throw new Error('No groups found');
    }
    
    console.log('\nGroup details:');
    groups.forEach((group, index) => {
      console.log(`${index + 1}. Group ID: ${group.group_id}, Name: ${group.name}`);
    });
    
    // Fetch all profiles
    console.log('\n=== Fetching All Profiles ===');
    const profiles = await groupUtils.getAllProfiles(BASE_URL, CUSTOMER_ID, SPROUT_API_TOKEN);
    if (profiles.length === 0) {
      throw new Error('No profiles found');
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
    const profilesByGroup = groupUtils.groupProfilesByGroup(profiles, groups);
    
    // Process each group
    console.log('\n=== Processing Each Group ===');
    const results = [];
    
    // Import sleep function from drive utils
    const { sleep } = require('./utils/drive');
    
    // Process groups with a delay between each to avoid hitting API quotas
    for (const [groupId, groupData] of Object.entries(profilesByGroup)) {
      const { groupName, profiles } = groupData;
      
      if (profiles.length > 0) {
        try {
          console.log(`\nProcessing group: ${groupName} (${groupId}) with ${profiles.length} profiles`);
          const spreadsheetId = await processGroupAnalytics(groupId, groupName, profiles);
          if (spreadsheetId) {
            results.push({
              groupId,
              groupName,
              profileCount: profiles.length,
              spreadsheetId,
              spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
            });
          }
          
          // Add a longer delay after processing each group to avoid hitting API quotas
          // Wait 60 seconds between groups
          console.log(`Waiting 60 seconds before processing the next group to avoid API quota limits...`);
          await sleep(60000);
        } catch (error) {
          console.error(`Error processing group ${groupName}: ${error.message}`);
          
          // Even if there's an error, wait longer before trying the next group
          console.log(`Waiting 30 seconds before continuing to the next group...`);
          await sleep(30000);
        }
      } else {
        console.log(`Skipping group ${groupName} (${groupId}) - no profiles found`);
      }
    }
    
    // Print summary
    console.log('\n=== Processing Complete ===');
    console.log(`Processed ${results.length} groups:`);
    
    results.forEach(result => {
      console.log(`- ${result.groupName} (${result.profileCount} profiles): ${result.spreadsheetUrl}`);
    });
    
  } catch (error) {
    console.error(`Error in main process: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
  }
};

// Run the main function
main().catch(err => console.error('Unhandled error:', err));

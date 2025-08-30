/**
 * Vercel Cron Job API Endpoint
 * 
 * This endpoint runs both analytics scripts sequentially:
 * 1. simple-analytics.js (runs first)
 * 2. sprout_april.js (runs after first completes)
 * 
 * Scheduled to run daily at 11:40 PM IST via Vercel Cron
 */

const { google } = require('googleapis');

// Import your existing modules
const apiUtils = require('../utils/api');
const sheetsUtils = require('../utils/sheets');
const driveUtils = require('../utils/simple-drive');
const groupUtils = require('../utils/groups');

// Import platform modules
const instagram = require('../platforms/instagram');
const youtube = require('../platforms/youtube');
const linkedin = require('../platforms/linkedin');
const facebook = require('../platforms/facebook');
const twitter = require('../platforms/twitter');

// Environment variables (set in Vercel dashboard)
const CUSTOMER_ID = process.env.CUSTOMER_ID || "2653573";
const SPROUT_API_TOKEN = process.env.SPROUT_API_TOKEN || "MjY1MzU3M3wxNzUyMjE2ODQ5fDdmNzgxNzQyLWI3NWEtNDFkYS1hN2Y4LWRkMTE3ODRhNzBlNg==";
const FOLDER_ID_SIMPLE = process.env.FOLDER_ID_SIMPLE || '1O0In92io6PksS-VEdr1lyD-VfVC6mVV3';
const FOLDER_ID_APRIL = process.env.FOLDER_ID_APRIL || '13XPLx5l1LuPeJL2Ue03ZztNQUsNgNW06';
const GOOGLE_CREDENTIALS_JSON = process.env.GOOGLE_CREDENTIALS_JSON;

// API endpoints
const BASE_URL = "https://api.sproutsocial.com/v1";
const ANALYTICS_URL = `${BASE_URL}/${CUSTOMER_ID}/analytics/profiles`;

// Get current date (2 days ago for complete metrics)
const getCurrentDate = () => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 2);
  
  const year = yesterday.getFullYear();
  const month = String(yesterday.getMonth() + 1).padStart(2, '0');
  const day = String(yesterday.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Authentication function for Vercel
const authenticateWithEnv = async () => {
  try {
    console.log('Authenticating with Google APIs using environment variables...');
    
    // Parse credentials from environment variable
    const credentials = JSON.parse(GOOGLE_CREDENTIALS_JSON);
    
    // Create JWT auth client
    const auth = new google.auth.JWT(
      credentials.client_email,
      null,
      credentials.private_key,
      ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets']
    );
    
    await auth.authorize();
    
    // Create API clients
    const drive = google.drive({ version: 'v3', auth });
    const sheets = google.sheets({ version: 'v4', auth });
    
    return { auth, drive, sheets };
  } catch (error) {
    console.error(`Authentication error: ${error.message}`);
    throw error;
  }
};

// Process analytics data for a group (simplified version)
const processGroupAnalytics = async (groupId, groupName, profiles, googleClients, folderId) => {
  try {
    console.log(`\n=== Processing Group: ${groupName} (${groupId}) ===`);
    console.log(`Found ${profiles.length} profiles in this group`);
    
    const { drive, sheets, auth } = googleClients;
    
    // Search for existing spreadsheet
    const baseNamePattern = `Copy of ${groupName}`;
    let spreadsheetId = await driveUtils.findExistingSpreadsheet(
      drive,
      baseNamePattern,
      folderId
    );
    
    if (!spreadsheetId) {
      // Create new spreadsheet
      const response = await drive.files.create({
        resource: {
          name: groupName,
          parents: [folderId],
          mimeType: 'application/vnd.google-apps.spreadsheet'
        },
        fields: 'id, name, parents'
      });
      
      spreadsheetId = response.data.id;
      console.log(`✓ Created new spreadsheet: ${spreadsheetId}`);
    }
    
    // Group profiles by network type
    const profilesByNetwork = {};
    for (const profile of profiles) {
      const networkTypeMapping = {
        'linkedin_company': 'linkedin',
        'fb_instagram_account': 'instagram',
        'fb_page': 'facebook',
        'youtube_channel': 'youtube',
        'twitter_profile': 'twitter'
      };
      
      const networkType = networkTypeMapping[profile.network_type] || profile.network_type.toLowerCase();
      
      if (!profilesByNetwork[networkType]) {
        profilesByNetwork[networkType] = [];
      }
      
      profilesByNetwork[networkType].push(profile);
    }
    
    // Create sheets for each network type
    const networkModules = { instagram, youtube, linkedin, facebook, twitter };
    const createdSheets = [];
    
    for (const [networkType, networkProfiles] of Object.entries(profilesByNetwork)) {
      if (networkProfiles.length > 0) {
        const sheetName = networkType.charAt(0).toUpperCase() + networkType.slice(1);
        
        try {
          const response = await sheets.spreadsheets.get({
            spreadsheetId,
            includeGridData: false
          });
          
          const existingSheets = response.data.sheets.map(sheet => sheet.properties.title);
          
          if (!existingSheets.includes(sheetName)) {
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
    
    // Fetch analytics data
    const profileIds = profiles.map(p => p.customer_profile_id).filter(id => id);
    const START_DATE = getCurrentDate();
    const END_DATE = getCurrentDate();
    
    console.log(`Fetching analytics data for ${profileIds.length} profiles in group ${groupName} from ${START_DATE} to ${END_DATE}`);
    
    const analyticsData = await apiUtils.getAnalyticsData(
      ANALYTICS_URL,
      SPROUT_API_TOKEN,
      START_DATE,
      END_DATE,
      profileIds
    );
    
    if (!analyticsData || !analyticsData.data || analyticsData.data.length === 0) {
      console.warn(`No analytics data found for group ${groupName}`);
      return {
        groupId,
        groupName,
        status: 'No data'
      };
    }
    
    // Process data for each profile
    const rowsByNetwork = {
      instagram: [], youtube: [], linkedin: [], facebook: [], twitter: []
    };
    
    for (const dataPoint of analyticsData.data) {
      const customerProfileId = dataPoint.dimensions?.customer_profile_id;
      const reportingPeriod = dataPoint.dimensions?.['reporting_period.by(day)'] || dataPoint.dimensions?.reporting_period;
      
      if (!customerProfileId || !reportingPeriod) continue;
      
      const date = new Date(reportingPeriod).toISOString().split('T')[0];
      const profile = profiles.find(p => p.customer_profile_id === parseInt(customerProfileId));
      
      if (!profile) continue;
      
      const networkTypeMapping = {
        'linkedin_company': 'linkedin',
        'fb_instagram_account': 'instagram',
        'fb_page': 'facebook',
        'youtube_channel': 'youtube',
        'twitter_profile': 'twitter'
      };
      
      const networkType = networkTypeMapping[profile.network_type] || profile.network_type.toLowerCase();
      const module = networkModules[networkType];
      
      if (module && module.formatAnalyticsData) {
        const row = module.formatAnalyticsData(dataPoint, profile);
        if (row) {
          rowsByNetwork[networkType].push(row);
        }
      }
    }
    
    // Update sheets with data
    for (const [networkType, rows] of Object.entries(rowsByNetwork)) {
      if (rows.length === 0) continue;
      
      const sheetName = networkType.charAt(0).toUpperCase() + networkType.slice(1);
      if (!createdSheets.includes(sheetName)) continue;
      
      const module = networkModules[networkType];
      if (!(module && module.updateSheet)) continue;
      
      console.log(`Updating ${sheetName} sheet with ${rows.length} rows`);
      
      try {
        await driveUtils.ensureSheetCapacity(sheets, spreadsheetId, sheetName, rows.length + 2000, 30);
        await module.updateSheet(sheetsUtils, auth, spreadsheetId, rows);
      } catch (error) {
        console.error(`Error updating ${sheetName} sheet: ${error.message}`);
      }
    }
    
    console.log(`Completed processing for group ${groupName}`);
    
    return {
      groupId,
      groupName,
      folderId,
      spreadsheetId,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
      status: 'Completed'
    };
    
  } catch (error) {
    console.error(`Error processing group ${groupName}: ${error.message}`);
    return {
      groupId,
      groupName,
      status: `Error: ${error.message}`
    };
  }
};

// Main function to run both scripts sequentially
const runSequentialAnalytics = async () => {
  try {
    console.log('=== STARTING SEQUENTIAL ANALYTICS UPDATE ===');
    console.log(`Time: ${new Date().toISOString()}`);
    
    // Authenticate
    const { auth, drive, sheets } = await authenticateWithEnv();
    const googleClients = { auth, drive, sheets };
    
    // Fetch groups and profiles
    const groups = await groupUtils.getCustomerGroups(BASE_URL, CUSTOMER_ID, SPROUT_API_TOKEN);
    const profiles = await groupUtils.getAllProfiles(BASE_URL, CUSTOMER_ID, SPROUT_API_TOKEN);
    const profilesByGroup = groupUtils.groupProfilesByGroup(profiles, groups);
    
    const allResults = [];
    
    // Process each group for simple-analytics.js (first script)
    console.log('\n=== STEP 1: Running simple-analytics.js logic ===');
    for (const [groupId, groupData] of Object.entries(profilesByGroup)) {
      const { groupName, profiles } = groupData;
      if (profiles.length > 0) {
        try {
          const results = await processGroupAnalytics(groupId, groupName, profiles, googleClients, FOLDER_ID_SIMPLE);
          if (results) {
            allResults.push(results);
          }
        } catch (error) {
          console.error(`Error processing group ${groupName}: ${error.message}`);
        }
      }
    }
    
    console.log('\n=== STEP 1 COMPLETED ===');
    console.log(`Processed ${allResults.length} groups for simple-analytics.js`);
    
    // Wait 30 seconds between scripts
    console.log('Waiting 30 seconds before running sprout_april.js logic...');
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    // Process each group for sprout_april.js (second script)
    console.log('\n=== STEP 2: Running sprout_april.js logic ===');
    const aprilResults = [];
    for (const [groupId, groupData] of Object.entries(profilesByGroup)) {
      const { groupName, profiles } = groupData;
      if (profiles.length > 0) {
        try {
          const results = await processGroupAnalytics(groupId, groupName, profiles, googleClients, FOLDER_ID_APRIL);
          if (results) {
            aprilResults.push(results);
          }
        } catch (error) {
          console.error(`Error processing group ${groupName}: ${error.message}`);
        }
      }
    }
    
    console.log('\n=== STEP 2 COMPLETED ===');
    console.log(`Processed ${aprilResults.length} groups for sprout_april.js`);
    
    console.log('\n=== SEQUENTIAL ANALYTICS UPDATE COMPLETED ===');
    console.log(`Total groups processed: ${allResults.length + aprilResults.length}`);
    
    return {
      success: true,
      simpleAnalytics: allResults,
      sproutApril: aprilResults,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('Error in sequential execution:', error);
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
};

// Vercel API handler
module.exports = async (req, res) => {
  try {
    console.log('Vercel cron job triggered');
    
    // Run the sequential analytics
    const result = await runSequentialAnalytics();
    
    if (result.success) {
      console.log('Cron job completed successfully');
      res.status(200).json({
        success: true,
        message: 'Sequential analytics update completed',
        data: result
      });
    } else {
      console.error('Cron job failed:', result.error);
      res.status(500).json({
        success: false,
        message: 'Sequential analytics update failed',
        error: result.error
      });
    }
    
  } catch (error) {
    console.error('Cron job error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

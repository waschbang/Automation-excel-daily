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

// Environment variables (all from Vercel dashboard)
const CUSTOMER_ID = process.env.CUSTOMER_ID;
const SPROUT_API_TOKEN = process.env.SPROUT_API_TOKEN;
const FOLDER_ID_SIMPLE = process.env.FOLDER_ID_SIMPLE;
const FOLDER_ID_APRIL = process.env.FOLDER_ID_APRIL;

// API endpoints
const BASE_URL = "https://api.sproutsocial.com/v1";

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
    
    // Build credentials object from individual environment variables
    const credentials = {
      type: process.env.GOOGLE_SERVICE_ACCOUNT_TYPE || 'service_account',
      project_id: process.env.GOOGLE_PROJECT_ID,
      private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
      private_key: process.env.GOOGLE_PRIVATE_KEY ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      client_id: process.env.GOOGLE_CLIENT_ID,
      auth_uri: process.env.GOOGLE_AUTH_URI || 'https://accounts.google.com/o/oauth2/auth',
      token_uri: process.env.GOOGLE_TOKEN_URI || 'https://oauth2.googleapis.com/token',
      auth_provider_x509_cert_url: process.env.GOOGLE_AUTH_PROVIDER_X509_CERT_URL || 'https://www.googleapis.com/oauth2/v1/certs',
      client_x509_cert_url: process.env.GOOGLE_CLIENT_X509_CERT_URL,
      universe_domain: process.env.GOOGLE_UNIVERSE_DOMAIN || 'googleapis.com'
    };
    
    // Validate required environment variables
    const required = [
      { name: 'CUSTOMER_ID', value: CUSTOMER_ID },
      { name: 'SPROUT_API_TOKEN', value: SPROUT_API_TOKEN },
      { name: 'FOLDER_ID_SIMPLE', value: FOLDER_ID_SIMPLE },
      { name: 'FOLDER_ID_APRIL', value: FOLDER_ID_APRIL },
      { name: 'GOOGLE_CLIENT_EMAIL', value: credentials.client_email },
      { name: 'GOOGLE_PRIVATE_KEY', value: credentials.private_key },
      { name: 'GOOGLE_PROJECT_ID', value: credentials.project_id }
    ];
    
    const missing = required.filter(req => !req.value);
    if (missing.length > 0) {
      const missingNames = missing.map(m => m.name);
      throw new Error(`Missing required environment variables: ${missingNames.join(', ')}`);
    }
    
    console.log(`✓ Building credentials for: ${credentials.client_email}`);
    console.log(`✓ Project ID: ${credentials.project_id}`);
    console.log(`✓ Customer ID: ${CUSTOMER_ID}`);
    console.log(`✓ Folder Simple: ${FOLDER_ID_SIMPLE}`);
    console.log(`✓ Folder April: ${FOLDER_ID_APRIL}`);
    
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
    
    console.log('✓ Authentication successful');
    
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
    console.log(`Target folder: ${folderId}`);
    
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
      console.log(`Creating new spreadsheet: ${groupName}`);
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
    } else {
      console.log(`✓ Using existing spreadsheet: ${spreadsheetId}`);
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
    
    // Fetch analytics data
    const profileIds = profiles.map(p => p.customer_profile_id).filter(id => id);
    const START_DATE = getCurrentDate();
    const END_DATE = getCurrentDate();
    const ANALYTICS_URL = `${BASE_URL}/${CUSTOMER_ID}/analytics/profiles`;
    
    console.log(`Fetching analytics data for ${profileIds.length} profiles from ${START_DATE} to ${END_DATE}`);
    
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
        folderId,
        spreadsheetId,
        spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
        status: 'No data'
      };
    }
    
    console.log(`Processing ${analyticsData.data.length} data points`);
    
    // Process data for each profile
    const rowsByNetwork = {
      instagram: [], youtube: [], linkedin: [], facebook: [], twitter: []
    };
    
    for (const dataPoint of analyticsData.data) {
      const customerProfileId = dataPoint.dimensions?.customer_profile_id;
      const reportingPeriod = dataPoint.dimensions?.['reporting_period.by(day)'] || dataPoint.dimensions?.reporting_period;
      
      if (!customerProfileId || !reportingPeriod) continue;
      
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
    let updatedSheets = 0;
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
        updatedSheets++;
        console.log(`✓ Updated ${sheetName} sheet successfully`);
      } catch (error) {
        console.error(`Error updating ${sheetName} sheet: ${error.message}`);
      }
    }
    
    console.log(`✓ Completed processing for group ${groupName} - Updated ${updatedSheets} sheets`);
    
    return {
      groupId,
      groupName,
      folderId,
      spreadsheetId,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
      profileCount: profiles.length,
      updatedSheets,
      status: 'Completed'
    };
    
  } catch (error) {
    console.error(`Error processing group ${groupName}: ${error.message}`);
    return {
      groupId,
      groupName,
      folderId,
      profileCount: profiles.length,
      status: `Error: ${error.message}`
    };
  }
};

// Main function to run both scripts sequentially
const runSequentialAnalytics = async () => {
  try {
    console.log('=== STARTING SEQUENTIAL ANALYTICS UPDATE ===');
    console.log(`Time: ${new Date().toISOString()}`);
    console.log(`Date range: ${getCurrentDate()} (2 days ago for complete metrics)`);
    
    // Authenticate
    const { auth, drive, sheets } = await authenticateWithEnv();
    const googleClients = { auth, drive, sheets };
    
    // Fetch groups and profiles
    console.log('\n=== Fetching Groups and Profiles ===');
    const groups = await groupUtils.getCustomerGroups(BASE_URL, CUSTOMER_ID, SPROUT_API_TOKEN);
    const profiles = await groupUtils.getAllProfiles(BASE_URL, CUSTOMER_ID, SPROUT_API_TOKEN);
    
    if (!groups || groups.length === 0) {
      throw new Error('No groups found');
    }
    
    if (!profiles || profiles.length === 0) {
      throw new Error('No profiles found');
    }
    
    console.log(`✓ Found ${groups.length} groups and ${profiles.length} profiles`);
    
    const profilesByGroup = groupUtils.groupProfilesByGroup(profiles, groups);
    const groupCount = Object.keys(profilesByGroup).length;
    console.log(`✓ Organized into ${groupCount} groups with profiles`);
    
    const allResults = [];
    
    // Process each group for simple-analytics.js (first script)
    console.log('\n=== STEP 1: Running simple-analytics.js logic ===');
    console.log(`Target folder: ${FOLDER_ID_SIMPLE}`);
    
    for (const [groupId, groupData] of Object.entries(profilesByGroup)) {
      const { groupName, profiles } = groupData;
      if (profiles.length > 0) {
        try {
          const results = await processGroupAnalytics(groupId, groupName, profiles, googleClients, FOLDER_ID_SIMPLE);
          if (results) {
            allResults.push(results);
          }
        } catch (error) {
          console.error(`Error processing group ${groupName} (Step 1): ${error.message}`);
          allResults.push({
            groupId,
            groupName,
            folderId: FOLDER_ID_SIMPLE,
            status: `Error: ${error.message}`
          });
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
    console.log(`Target folder: ${FOLDER_ID_APRIL}`);
    
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
          console.error(`Error processing group ${groupName} (Step 2): ${error.message}`);
          aprilResults.push({
            groupId,
            groupName,
            folderId: FOLDER_ID_APRIL,
            status: `Error: ${error.message}`
          });
        }
      }
    }
    
    console.log('\n=== STEP 2 COMPLETED ===');
    console.log(`Processed ${aprilResults.length} groups for sprout_april.js`);
    
    console.log('\n=== SEQUENTIAL ANALYTICS UPDATE COMPLETED ===');
    console.log(`Total execution time: ${Math.round((Date.now() - Date.parse(new Date().toISOString())) + Date.now()) / 1000} seconds`);
    
    // Summary
    const step1Success = allResults.filter(r => r.status === 'Completed').length;
    const step2Success = aprilResults.filter(r => r.status === 'Completed').length;
    
    console.log('\n=== SUMMARY ===');
    console.log(`Step 1 (simple-analytics): ${step1Success}/${allResults.length} successful`);
    console.log(`Step 2 (sprout_april): ${step2Success}/${aprilResults.length} successful`);
    
    return {
      success: true,
      simpleAnalytics: {
        results: allResults,
        successful: step1Success,
        total: allResults.length
      },
      sproutApril: {
        results: aprilResults,
        successful: step2Success,
        total: aprilResults.length
      },
      timestamp: new Date().toISOString(),
      dateProcessed: getCurrentDate()
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
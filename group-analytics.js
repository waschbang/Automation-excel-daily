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

// Save Drive credentials from the provided JSON
const saveDriveCredentials = () => {
  const credentials = {
    "type": "service_account",
    "project_id": "gen-lang-client-0318780732",
    "private_key_id": "f119bb5117200bef22c8401d97a907550526a5eb",
    "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCYH4fG/kHN9vLs\nzkBWlA9WLBgDwc0DIrgL0XIWDbtBzm30BdxMjLLJbBKv04pxYnXjYwXoeB6Cz0eL\nseHLcR4uRY4R8dX9MPlcWsUKV+OXSooHxNJ9OvTDG7LXHlDFGppOFDp/nD4k3bib\nkLhXoubuOM8VrdVFqsTGQvID0d5p81Hm5HktghDvcA0wWmO+sCgSbWKA7XZw0GIL\nvOi+nnQEDUXeDgHyDKWwd6XhFx5VMJs2ZWFASR273ayCQJiqGHQmsY1zpno2DooB\no+JrCsK4A/UrPaxPiqV73VHgkgxVgXxmR+48zQZoSSbfobGQTup0pCfJ3jGnI8x7\np2BMwvBRAgMBAAECggEAAjy3+KfneDfHFK8XlIJgy5zSRVdfvEmh3OghkjQVXntS\nhAPETLKmxDYw++mbtA1NdCiyFvwxwC0b1XDKNB2LsuTiWQ6WPd8PEsHxuwRGAEUI\nDMNS8GUqIXauQZJEQDLTBT4QSm1F/3EskGqfYGgQlv0qQ/yKiffQBSWpxR88cvDL\noURBZo+Yu8OWzRwHA+CYIjK3zk821afYhbCucP657EyobzimaWr2KZHoNKcBzrvc\n8xwkw5TVFXrI+4TJVqgMSxPHoV8NZBWuLoRmsVEHtzxOouxd8LFuMao/CR/lE7bq\n+UiIsXi5Zcj3r5AgmFW04bDMzvqGK7ztf86l4yz4YQKBgQDRz/5hs2uNm82R07lh\nnbzXwgMv6pepRMfhH8rb/9Bd7EekDuB0VYzV8m/CMMf+oM7eAPILpc7dFCtltEW2\niiGDIPerZYqj5BnA2MyZiJ80XZYCq7zqnjP77+pJGwVedoCtdAoT6XRsXPNSRBtl\n6iD8c/4D/fhQv/C+zAZz93wvoQKBgQC5nHLwENLJazjARMC3QGE5bVKsXOyp9pSq\ni/jrtnoKuysM3cffGlmTRiewiurh88jUrDy8HqCF7hoKkBZg/Hxbv5oN10ccr/89\naW3UtFf95/HXRyz+CX1Wu8I9vuk9vL2XfwOKaHvyPdZcdbl7wGUWFmGDOf0c8d02\n5KD82Q7CsQKBgQCYi5IXNN0Q42OOEBLrv0TK1ft9PiIwZpqwum3CkHbNovnfdRWK\nX5z6/L52wQLXxdFCJgvVniMOKBj5ZB1/f2SoMzL/Qd+QE0sKJFZ1lpix+Q0VOgor\nxwRiu2dq6aN4r84UzpZ5LbaBBv++I1iMO7Lp+eeIvYFqLHN8NVjHvftjoQKBgGOS\nsH5lKA9x+/H5cEFewkmiglWBTF0psTuE97bMH9Cd9ExkthLT+fXuDuDAxZ0NwVGG\nTNbGv2rZ/xJnlfnVuYkm0qhWMwoKyKzTYF5ZmVLXGYBZ6KMnyBu9gkjJoCrElBkv\nxGB+CPA9iD/1z9m5rwEYZJuXglgC0J/gKxU6BJchAoGBAKbEWEyy03ja2m08ejbl\nKidylJeuIE7hn1sb74qg1+F7xfehK2l1PwikgLgnX/75SOmizI8ncBnuiwK+zgdj\nrEd+VKbJUqXHtkmJLadfx0J51XYcin1mebbiLZDWwO2wKi7ULQJfo+6amqU4cMPv\nBd2O+OpVSl1cbzqxOIs5X0Ew\n-----END PRIVATE KEY-----\n",
    "client_email": "automation-sheet@gen-lang-client-0318780732.iam.gserviceaccount.com",
    "client_id": "109917942587527544122",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/automation-sheet%40gen-lang-client-0318780732.iam.gserviceaccount.com",
    "universe_domain": "googleapis.com"
  };

  fs.writeFileSync(DRIVE_CREDENTIALS_PATH, JSON.stringify(credentials, null, 2));
  console.log(`Drive credentials saved to ${DRIVE_CREDENTIALS_PATH}`);
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
    const { drive, sheets, auth } = await driveUtils.getDriveClient(DRIVE_CREDENTIALS_PATH);
    if (!drive || !sheets || !auth) {
      throw new Error('Failed to authenticate with Google Drive API');
    }
    
    // Create a new spreadsheet for this group
    const spreadsheetTitle = `Sprout Analytics - ${groupName} - ${new Date().toISOString().split('T')[0]}`;
    const spreadsheetId = await driveUtils.createSpreadsheet(sheets, drive, spreadsheetTitle, DRIVE_FOLDER_ID);
    if (!spreadsheetId) {
      throw new Error(`Failed to create spreadsheet for group ${groupName}`);
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
          
          // Add a delay after processing each group to avoid hitting API quotas
          // Wait 30 seconds between groups
          console.log(`Waiting 30 seconds before processing the next group to avoid API quota limits...`);
          await sleep(30000);
        } catch (error) {
          console.error(`Error processing group ${groupName}: ${error.message}`);
          
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

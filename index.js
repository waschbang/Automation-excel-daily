const axios = require('axios');
const { google } = require('googleapis');
const sheets = google.sheets('v4');
const fs = require('fs');
const path = require('path');

// Configuration
const CUSTOMER_ID = "2426451";
const PROFILE_ID = "6878551";
const SPROUT_API_TOKEN = "MjQyNjQ1MXwxNzQyNzk4MTc4fDQ0YmU1NzQ4LWI1ZDAtNDhkMi04ODQxLWE1YzM1YmI4MmNjNQ==";
const SPREADSHEET_ID = "1qV9j-gp8ADN_tu3Qb9MQPnKit48_IrhamAzI-WCEEr8";
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');

// Sprout Social API endpoints
const BASE_URL = "https://api.sproutsocial.com/v1";
const PROFILES_URL = `${BASE_URL}/${CUSTOMER_ID}/profiles`;

// Setup headers for Sprout Social API
const getSproutHeaders = () => {
  return {
    "Authorization": `Bearer ${SPROUT_API_TOKEN}`,
    "Content-Type": "application/json"
  };
};

// Get profile data directly from API
const getProfileData = async (profileId) => {
  try {
    const profileUrl = `${PROFILES_URL}/${profileId}`;
    console.log(`[API CALL] Fetching profile data from: ${profileUrl}`);
    const response = await axios.get(profileUrl, { headers: getSproutHeaders() });
    console.log('[API RESPONSE] Profile data:', JSON.stringify(response.data, null, 2));
    if (response.data && response.data.data) {
      const profileData = response.data.data;
      const network_type = profileData.network_type;
      const name = profileData.name;
      const network_id = profileData.network_id || profileData.id || profileId;
      if (!network_type || !name || !network_id) {
        console.warn('[WARNING] network_type, name, or network_id missing in profile data. Full response:', JSON.stringify(response.data, null, 2));
      }
      return {
        network_type: network_type || '',
        name: name || '',
        network_id: network_id || '',
        profile_id: profileId
      };
    }
    console.warn('[WARNING] Profile data not found in response. Full response:', JSON.stringify(response.data, null, 2));
    return { network_type: '', name: '', network_id: '', profile_id: profileId };
  } catch (error) {
    console.error(`[ERROR] Error fetching profile data: ${error.message}`);
    if (error.response) {
      console.error('[API ERROR RESPONSE]', JSON.stringify(error.response.data, null, 2));
    }
    return { network_type: '', name: '', network_id: '', profile_id: profileId };
  }
};

// Get analytics data from Sprout Social API
const getAnalyticsData = async (startDate, endDate) => {
  const dateRange = `${startDate}...${endDate}`;
  const analyticsUrl = `${BASE_URL}/${CUSTOMER_ID}/analytics/profiles`;
  
  // UPDATED: Added the new metrics you requested
  const payload = {
    "filters": [
      `customer_profile_id.eq(${PROFILE_ID})`,
      `reporting_period.in(${dateRange})`
    ],
    "metrics": [
      "lifetime_snapshot.followers_count",
      "net_follower_growth",
      "lifetime_snapshot.followers_by_age_gender",
      "followers_gained",
      "followers_lost",
      "posts_sent_count",
      "impressions",
      "reactions",
      "saves",
      "comments_count",
      "shares_count",
      "likes",
      "story_replies",
      "impressions_unique",
      "net_following_growth",
      "video_views",
      "lifetime_snapshot.following_count",
      "calculated_engagements",
      "net_follower_growth_percentage"
    ],
    "page": 1
  };
  
  try {
    console.log(`Analytics API Request for ${dateRange}`);
    
    const response = await axios.post(
      analyticsUrl, 
      payload, 
      { headers: getSproutHeaders() }
    );
    
    if (!response.data || !response.data.data || response.data.data.length === 0) {
      console.warn(`No analytics data found for range ${dateRange}`);
      return null;
    }
    
    console.log(`Received ${response.data.data.length} data points for range ${dateRange}`);
    return response.data;
    
  } catch (error) {
    console.error(`Error getting analytics data: ${error.message}`);
    if (error.response) {
      console.error('API Error Response:', {
        status: error.response.status,
        data: JSON.stringify(error.response.data)
      });
    }
    return null;
  }
};

// Format analytics data for Google Sheets with new metrics and formulas
const formatAnalyticsData = (dataPoint, profileData) => {
  try {
    if (!dataPoint || !dataPoint.metrics) {
      console.error('Invalid data point received for formatting');
      return null;
    }
    const date = dataPoint.reporting_period || new Date().toISOString().split('T')[0];
    const metrics = dataPoint.metrics;
    const followers = metrics["lifetime_snapshot.followers_count"] || 0;
    const impressions = metrics["impressions"] || 0;
    const likes = metrics["likes"] || 0;
    const comments = metrics["comments_count"] || 0;
    const shares = metrics["shares_count"] || 0;
    const saves = metrics["saves"] || 0;
    const storyReplies = metrics["story_replies"] || 0;
    const engagements = (
      parseFloat(likes || 0) + 
      parseFloat(comments || 0) + 
      parseFloat(shares || 0) + 
      parseFloat(saves || 0) + 
      parseFloat(storyReplies || 0)
    );
    let engagementRatePerImpression = 0;
    if (impressions && impressions > 0) {
      engagementRatePerImpression = parseFloat(((engagements / impressions) * 100).toFixed(2));
    }
    const row = [
      date,
      profileData.network_type,
      profileData.name,
      profileData.network_id,
      profileData.profile_id,
      followers,
      metrics["net_follower_growth"] || 0,
      metrics["followers_gained"] || 0,
      metrics["followers_lost"] || 0,
      metrics["posts_sent_count"] || 0,
      impressions,
      metrics["reactions"] || 0,
      saves,
      comments,
      shares,
      likes,
      storyReplies,
      metrics["impressions_unique"] || 0,
      metrics["net_following_growth"] || 0,
      metrics["video_views"] || 0,
      metrics["lifetime_snapshot.following_count"] || 0,
      engagements,
      engagementRatePerImpression,
      metrics["net_follower_growth_percentage"] || 0
    ];
    return row;
  } catch (error) {
    console.error(`Error formatting analytics data: ${error.message}`);
    return null;
  }
};

// Authenticate with Google Sheets API
const getGoogleAuth = async () => {
  try {
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
    const { client_email, private_key } = credentials;
    
    const auth = new google.auth.JWT(
      client_email,
      null,
      private_key,
      ['https://www.googleapis.com/auth/spreadsheets']
    );
    
    await auth.authorize();
    console.log('Successfully authenticated with Google Sheets API');
    return auth;
  } catch (error) {
    console.error(`Error authenticating with Google: ${error.message}`);
    return null;
  }
};

// Set up sheet with new headers
const setupSheetHeaders = async (auth) => {
  try {
    const response = await sheets.spreadsheets.values.get({
      auth,
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A1:Z1',
    });
    const headers = [
      'Date',
      'Network',
      'Profile Name',
      'Network ID',
      'Profile ID',
      'Followers Count',
      'Net Follower Growth',
      'Followers Gained',
      'Followers Lost',
      'Posts Sent Count',
      'Impressions',
      'Reactions',
      'Saves',
      'Comments Count',
      'Shares Count',
      'Likes',
      'Story Replies',
      'Impressions Unique',
      'Net Following Growth',
      'Video Views',
      'Following Count',
      'Engagements',
      'Engagement Rate (per Impression)',
      'Net Follower Growth Percentage'
    ];
    let needHeaderUpdate = true;
    if (response.data.values && response.data.values[0]) {
      const existingHeaders = response.data.values[0];
      if (existingHeaders.length === headers.length) {
        let allMatch = true;
        for (let i = 0; i < headers.length; i++) {
          if (existingHeaders[i] !== headers[i]) {
            allMatch = false;
            break;
          }
        }
        if (allMatch) {
          needHeaderUpdate = false;
        }
      }
    }
    if (needHeaderUpdate) {
      console.log('Updating sheet headers with new columns');
      await sheets.spreadsheets.values.update({
        auth,
        spreadsheetId: SPREADSHEET_ID,
        range: `Sheet1!A1:${String.fromCharCode(65 + headers.length - 1)}1`,
        valueInputOption: 'RAW',
        resource: {
          values: [headers]
        }
      });
      console.log('Headers updated successfully');
    } else {
      console.log('Headers already up to date');
    }
    return true;
  } catch (error) {
    console.error(`Error setting up sheet headers: ${error.message}`);
    return false;
  }
};

// Update Google Sheet with the data
const updateSheet = async (auth, row) => {
  if (!row) {
    console.warn('No data to update in sheet');
    return false;
  }
  try {
    const response = await sheets.spreadsheets.values.get({
      auth,
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A:A',
    });
    const nextRow = (response.data.values ? response.data.values.length : 0) + 1;
    await sheets.spreadsheets.values.update({
      auth,
      spreadsheetId: SPREADSHEET_ID,
      range: `Sheet1!A${nextRow}:${String.fromCharCode(65 + row.length - 1)}${nextRow}`,
      valueInputOption: 'RAW',
      resource: {
        values: [row]
      }
    });
    console.log(`Data for ${row[0]} updated in row ${nextRow}`);
    return true;
  } catch (error) {
    console.error(`Error updating sheet: ${error.message}`);
    return false;
  }
};

// Main function to run the data collection and update
const main = async () => {
  try {
    console.log('Starting daily update process...');
    const auth = await getGoogleAuth();
    if (!auth) {
      throw new Error('Failed to authenticate with Google Sheets');
    }
    await setupSheetHeaders(auth);
    const profileData = await getProfileData(PROFILE_ID);
    console.log('Using profile data:', profileData);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    const todayStr = today.toISOString().split('T')[0];
    console.log(`Fetching analytics data for ${yesterdayStr}`);
    const analyticsData = await getAnalyticsData(yesterdayStr, yesterdayStr);
    if (!analyticsData || !analyticsData.data || analyticsData.data.length === 0) {
      console.warn(`No analytics data available for ${yesterdayStr}`);
      return;
    }
    for (const dataPoint of analyticsData.data) {
      const formattedRow = formatAnalyticsData(dataPoint, profileData);
      if (formattedRow) {
        await updateSheet(auth, formattedRow);
      }
    }
    console.log('Daily update completed successfully');
  } catch (error) {
    console.error(`Error in main function: ${error.message}`);
  }
};

// Function to collect historical data
const collectHistoricalData = async () => {
  try {
    console.log('Starting historical data collection...');
    const auth = await getGoogleAuth();
    if (!auth) {
      throw new Error('Failed to authenticate with Google Sheets');
    }
    await setupSheetHeaders(auth);
    const profileData = await getProfileData(PROFILE_ID);
    console.log('Using profile data for historical collection:', profileData);
    const startDate = new Date('2024-05-15');
    const endDate = new Date();
    endDate.setDate(endDate.getDate() - 1);
    console.log('Historical Data Collection:', {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0]
    });
    let currentStart = new Date(startDate);
    while (currentStart <= endDate) {
      let currentEnd = new Date(currentStart);
      currentEnd.setDate(currentEnd.getDate() + 29);
      if (currentEnd > endDate) {
        currentEnd = new Date(endDate);
      }
      const startStr = currentStart.toISOString().split('T')[0];
      const endStr = currentEnd.toISOString().split('T')[0];
      console.log(`Processing historical data from ${startStr} to ${endStr}`);
      const analyticsData = await getAnalyticsData(startStr, endStr);
      if (analyticsData && analyticsData.data && analyticsData.data.length > 0) {
        console.log(`Found ${analyticsData.data.length} data points for period ${startStr} to ${endStr}`);
        for (const dataPoint of analyticsData.data) {
          const formattedRow = formatAnalyticsData(dataPoint, profileData);
          if (formattedRow) {
            await updateSheet(auth, formattedRow);
          }
        }
      } else {
        console.log(`No data found for period ${startStr} to ${endStr}`);
      }
      currentStart.setDate(currentEnd.getDate() + 1);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    console.log('Historical data collection completed');
  } catch (error) {
    console.error(`Error collecting historical data: ${error.message}`);
  }
};

// Schedule regular runs
const scheduleRuns = (intervalMinutes = 120) => {
  console.log(`Scheduling runs every ${intervalMinutes} minutes`);
  setInterval(main, intervalMinutes * 60 * 1000);
};

// First collect historical data, then start regular updates
collectHistoricalData().then(() => {
  console.log('Starting regular updates');
  main();
  scheduleRuns();
});
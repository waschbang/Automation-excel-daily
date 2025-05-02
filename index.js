const axios = require('axios');
const { google } = require('googleapis');
const sheets = google.sheets('v4');
const fs = require('fs');
const path = require('path');

// Configuration
const CUSTOMER_ID = "2426451";
const PROFILE_IDS = ["6886943"]; // Now properly defined as an array
const SPROUT_API_TOKEN = "MjQyNjQ1MXwxNzQyNzk4MTc4fDQ0YmU1NzQ4LWI1ZDAtNDhkMi04ODQxLWE1YzM1YmI4MmNjNQ==";
const SPREADSHEET_ID = "10S8QaFXTIFCtLu_jNopsF27Zq77B1bx_aceqdYcrexk";
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
// Set to a date string like "2025-04-01" to start, and "2025-04-05" to end (inclusive)
// If only one is set, fetch for that single day. If both are null, use today.
const START_DATE = "2024-05-01"; // e.g. "2025-04-01"
const END_DATE = "2025-05-01";   // e.g. "2025-04-05"

// Sprout Social API endpoints
const BASE_URL = "https://api.sproutsocial.com/v1";
const METADATA_URL = `${BASE_URL}/${CUSTOMER_ID}/metadata/customer`;
const ANALYTICS_URL = `${BASE_URL}/${CUSTOMER_ID}/analytics/profiles`;

// Setup headers for Sprout Social API
const getSproutHeaders = () => ({
  "Authorization": `Bearer ${SPROUT_API_TOKEN}`,
  "Content-Type": "application/json"
});

// Get profile data from metadata endpoint
const getProfileData = async () => {
  try {
    console.log('[API CALL] Fetching profile metadata');
    const response = await axios.get(METADATA_URL, { headers: getSproutHeaders() });
    
    if (!response.data || !response.data.data) {
      throw new Error('Invalid metadata response');
    }

    console.log('Profile metadata API response:', JSON.stringify(response.data, null, 2));
    
    // Convert PROFILE_IDS to strings for comparison
    const profileIdsToMatch = PROFILE_IDS.map(id => id.toString());
    const profiles = response.data.data.filter(profile => 
      profileIdsToMatch.includes(profile.customer_profile_id.toString())
    );

    if (profiles.length === 0) {
      throw new Error('No matching profiles found in metadata');
    }

    return profiles.map(profile => ({
      network_type: profile.network_type,
      name: profile.name,
      network_id: profile.native_id,
      profile_id: profile.customer_profile_id.toString(),
      native_name: profile.native_name,
      link: profile.link
    }));
  } catch (error) {
    console.error(`[ERROR] Error fetching profile metadata: ${error.message}`);
    if (error.response) {
      console.error('[API ERROR RESPONSE]', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
};

// Get analytics data from Sprout Social API
const getAnalyticsData = async (startDate, endDate, profileIds) => {
  const dateRange = `${startDate}...${endDate}`;
  const profileIdsStr = profileIds.join(', ');
  
  console.log('Analytics Request Details:', {
    dateRange,
    profileIds,
    profileIdsStr
  });

  const payload = {
    "filters": [
      `customer_profile_id.eq(${profileIdsStr})`,
      `reporting_period.in(${dateRange})`
    ],
    "metrics": [
      "lifetime_snapshot.followers_count",
      "net_follower_growth",
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
    const response = await axios.post(ANALYTICS_URL, payload, { headers: getSproutHeaders() });
    
    if (!response.data || !response.data.data || response.data.data.length === 0) {
      console.warn(`No analytics data found for range ${dateRange}`);
      return null;
    }
    
    console.log('Analytics Response Sample:', JSON.stringify(response.data.data[0], null, 2));
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

// Format analytics data for Google Sheets
const formatAnalyticsData = (dataPoint, profileData) => {
  try {
    if (!dataPoint || !dataPoint.metrics) {
      console.error('Invalid data point received for formatting:', dataPoint);
      return null;
    }

    // Use dimensions.customer_profile_id for logging
    const customerProfileId = dataPoint.dimensions && dataPoint.dimensions.customer_profile_id;

    console.log('Formatting data point:', {
      reporting_period: dataPoint.reporting_period,
      customer_profile_id: customerProfileId,
      metrics: Object.keys(dataPoint.metrics)
    });

    const metrics = dataPoint.metrics;
    // Use reporting period from dimensions
    const reportingPeriod = dataPoint.dimensions && (dataPoint.dimensions['reporting_period.by(day)'] || dataPoint.dimensions.reporting_period);
    if (!reportingPeriod) {
      console.error('No reporting period found in dataPoint:', dataPoint);
      return null;
    }
    const date = new Date(reportingPeriod).toISOString().split('T')[0];
    
    const engagements = (
      parseFloat(metrics["likes"] || 0) + 
      parseFloat(metrics["comments_count"] || 0) + 
      parseFloat(metrics["shares_count"] || 0) + 
      parseFloat(metrics["saves"] || 0) + 
      parseFloat(metrics["story_replies"] || 0)
    );

    const impressions = metrics["impressions"] || 0;
    const engagementRatePerImpression = impressions > 0 
      ? parseFloat(((engagements / impressions) * 100).toFixed(2))
      : 0;

    const row = [
      date,
      profileData.network_type,
      profileData.name,
      profileData.network_id,
      profileData.profile_id,
      metrics["lifetime_snapshot.followers_count"] || 0,
      metrics["net_follower_growth"] || 0,
      metrics["followers_gained"] || 0,
      metrics["followers_lost"] || 0,
      metrics["posts_sent_count"] || 0,
      impressions,
      metrics["reactions"] || 0,
      metrics["saves"] || 0,
      metrics["comments_count"] || 0,
      metrics["shares_count"] || 0,
      metrics["likes"] || 0,
      metrics["story_replies"] || 0,
      metrics["impressions_unique"] || 0,
      metrics["net_following_growth"] || 0,
      metrics["video_views"] || 0,
      metrics["lifetime_snapshot.following_count"] || 0,
      engagements,
      engagementRatePerImpression,
      metrics["net_follower_growth_percentage"] || 0
    ];

    console.log('Formatted row:', row);
    return row;
  } catch (error) {
    console.error(`Error formatting analytics data: ${error.message}`);
    console.error('Data point:', dataPoint);
    console.error('Profile data:', profileData);
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
const updateSheet = async (auth, rows) => {
  if (!rows || rows.length === 0) {
    console.warn('No data to update in sheet');
    return false;
  }

  try {
    console.log('Updating sheet with rows:', rows.length);
    console.log('First row sample:', rows[0]);

    const response = await sheets.spreadsheets.values.get({
      auth,
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A:A',
    });

    const nextRow = (response.data.values ? response.data.values.length : 0) + 1;
    const lastRow = nextRow + rows.length - 1;
    
    console.log('Sheet update details:', {
      nextRow,
      lastRow,
      columnCount: rows[0].length,
      rowCount: rows.length
    });

    const updateResponse = await sheets.spreadsheets.values.update({
      auth,
      spreadsheetId: SPREADSHEET_ID,
      range: `Sheet1!A${nextRow}:${String.fromCharCode(65 + rows[0].length - 1)}${lastRow}`,
      valueInputOption: 'RAW',
      resource: {
        values: rows
      }
    });

    console.log('Sheet update response:', updateResponse.data);
    console.log(`Updated ${rows.length} rows starting from row ${nextRow}`);
    return true;
  } catch (error) {
    console.error(`Error updating sheet: ${error.message}`);
    if (error.response) {
      console.error('Sheet API Error:', error.response.data);
    }
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
    const profiles = await getProfileData();
    
    if (!profiles || profiles.length === 0) {
      throw new Error('No profiles found to process');
    }

    // Determine date range to fetch
    let datesToFetch = [];
    if (START_DATE && END_DATE) {
      // Generate all days between START_DATE and END_DATE (inclusive)
      const start = new Date(START_DATE);
      const end = new Date(END_DATE);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        datesToFetch.push(new Date(d).toISOString().split('T')[0]);
      }
    } else if (START_DATE) {
      datesToFetch = [START_DATE];
    } else {
      datesToFetch = [(new Date()).toISOString().split('T')[0]];
    }

    for (const dateToUse of datesToFetch) {
      console.log(`Fetching analytics data for ${dateToUse}`);
      const analyticsData = await getAnalyticsData(
        dateToUse, 
        dateToUse,
        profiles.map(p => p.profile_id)
      );

      if (!analyticsData || !analyticsData.data || analyticsData.data.length === 0) {
        console.warn(`No analytics data returned for ${dateToUse}`);
        continue;
      }

      const rowsForDate = [];
      for (const dataPoint of analyticsData.data) {
        // Use dimensions.customer_profile_id for mapping
        const customerProfileId = dataPoint.dimensions && dataPoint.dimensions.customer_profile_id;
        if (!customerProfileId) {
          console.error('Data point missing dimensions.customer_profile_id:', dataPoint);
          continue;
        }

        const profile = profiles.find(p => 
          p.profile_id === customerProfileId.toString()
        );

        if (!profile) {
          console.error(`No matching profile found for ID: ${customerProfileId}`);
          continue;
        }

        const formattedRow = formatAnalyticsData(dataPoint, profile);
        if (formattedRow) {
          rowsForDate.push(formattedRow);
        }
      }
      if (rowsForDate.length > 0) {
        await updateSheet(auth, rowsForDate);
        console.log(`Updated sheet for ${dateToUse}`);
      } else {
        console.warn(`No valid data rows to update for ${dateToUse}`);
      }
    }

    console.log('All dates processed and sheet updated.');
  } catch (error) {
    console.error(`Error in main function: ${error.message}`);
    console.error(error.stack);
  }
};

// Schedule regular runs
const scheduleRuns = (intervalMinutes = 1) => {
  console.log(`Scheduling runs every ${intervalMinutes} minute(s)`);
  setInterval(main, intervalMinutes * 60 * 1000);
};

// Only start regular updates (no historical data)
console.log('Starting regular updates');
main();
scheduleRuns();
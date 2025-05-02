const axios = require('axios');
const { google } = require('googleapis');
const sheets = google.sheets('v4');
const fs = require('fs');
const path = require('path');

// Configuration
const CUSTOMER_ID = "2426451";
const PROFILE_IDS = ["6886943", "6909586", "6878551", "6886947", "6911594"];
const SPROUT_API_TOKEN = "MjQyNjQ1MXwxNzQyNzk4MTc4fDQ0YmU1NzQ4LWI1ZDAtNDhkMi04ODQxLWE1YzM1YmI4MmNjNQ==";
const SPREADSHEET_ID = "10S8QaFXTIFCtLu_jNopsF27Zq77B1bx_aceqdYcrexk";
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const START_DATE = "2025-04-01"; // e.g. "2025-04-01"
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

// Helper function to sleep/delay execution
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Get analytics data from Sprout Social API with date chunking to avoid rate limits
const getAnalyticsData = async (startDate, endDate, profileIds) => {
  // Generate all days between START_DATE and END_DATE (inclusive)
  const generateDateRange = (start, end) => {
    const dates = [];
    const startDate = new Date(start);
    const endDate = new Date(end);
    
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      dates.push(new Date(d).toISOString().split('T')[0]);
    }
    return dates;
  };

  // Break the date range into chunks of 5 days to avoid rate limits
  const allDates = generateDateRange(startDate, endDate);
  console.log(`Processing ${allDates.length} days from ${startDate} to ${endDate}`);
  
  // Process in chunks of 5 days
  const CHUNK_SIZE = 5;
  const allResults = { data: [] };
  
  for (let i = 0; i < allDates.length; i += CHUNK_SIZE) {
    const chunkDates = allDates.slice(i, i + CHUNK_SIZE);
    const chunkStart = chunkDates[0];
    const chunkEnd = chunkDates[chunkDates.length - 1];
    
    const dateRange = `${chunkStart}...${chunkEnd}`;
    const profileIdsStr = profileIds.join(', ');
    
    console.log(`Processing chunk ${Math.floor(i/CHUNK_SIZE) + 1}: ${dateRange}`);
    
    const payload = {
      "filters": [
        `customer_profile_id.eq(${profileIdsStr})`,
        `reporting_period.in(${dateRange})`
      ],
      "metrics": [
        "lifetime_snapshot.followers_count",
        "net_follower_growth",
        "followers_gained",
        "followers_gained_organic",
        "followers_gained_paid",
        "followers_lost",
        "lifetime_snapshot.fans_count",
        "fans_gained",
        "fans_gained_organic",
        "fans_gained_paid",
        "fans_lost",
        "impressions",
        "impressions_organic",
        "impressions_viral",
        "impressions_nonviral",
        "impressions_paid",
        "tab_views",
        "tab_views_login",
        "tab_views_logout",
        "post_impressions",
        "post_impressions_organic",
        "post_impressions_viral",
        "post_impressions_nonviral",
        "post_impressions_paid",
        "impressions_unique",
        "impressions_organic_unique",
        "impressions_viral_unique",
        "impressions_nonviral_unique",
        "impressions_paid_unique",
        "reactions",
        "comments_count",
        "shares_count",
        "post_link_clicks",
        "post_content_clicks_other",
        "profile_actions",
        "post_engagements",
        "video_views",
        "video_views_organic",
        "video_views_paid",
        "video_views_autoplay",
        "video_views_click_to_play",
        "video_views_repeat",
        "video_view_time",
        "video_views_unique",
        "video_views_30s_complete",
        "video_views_30s_complete_organic",
        "video_views_30s_complete_paid",
        "video_views_30s_complete_autoplay",
        "video_views_30s_complete_click_to_play",
        "video_views_30s_complete_repeat",
        "video_views_30s_complete_unique",
        "video_views_partial",
        "video_views_partial_organic",
        "video_views_partial_paid",
        "video_views_partial_autoplay",
        "video_views_partial_click_to_play",
        "video_views_partial_repeat",
        "posts_sent_count",
        "posts_sent_by_post_type",
        "posts_sent_by_content_type",
        "calculated_engagements"
      ],
      "page": 1
    };
    
    try {
      console.log(`Analytics API Request for ${dateRange}`);
      const response = await axios.post(ANALYTICS_URL, payload, { headers: getSproutHeaders() });
      
      if (response.data && response.data.data && response.data.data.length > 0) {
        console.log(`Received ${response.data.data.length} data points for range ${dateRange}`);
        allResults.data = [...allResults.data, ...response.data.data];
      } else {
        console.warn(`No analytics data found for range ${dateRange}`);
      }
      
      // Add a delay between API calls to avoid rate limiting
      if (i + CHUNK_SIZE < allDates.length) {
        console.log('Waiting 2 seconds before next API call to avoid rate limits...');
        await sleep(2000);
      }
    } catch (error) {
      console.error(`Error getting analytics data for ${dateRange}: ${error.message}`);
      if (error.response) {
        console.error('API Error Response:', {
          status: error.response.status,
          data: JSON.stringify(error.response.data)
        });
      }
      
      // If we hit a rate limit, wait longer before continuing
      if (error.response && (error.response.status === 429 || error.response.status === 403)) {
        console.log('Rate limit hit, waiting 10 seconds before continuing...');
        await sleep(10000);
      } else {
        // For other errors, still wait a bit
        await sleep(2000);
      }
    }
  }
  
  console.log(`Total data points collected: ${allResults.data.length}`);
  return allResults.data.length > 0 ? allResults : null;
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
      const followersCount = metrics["lifetime_snapshot.followers_count"] || 0;
      const engagementRatePerFollower = followersCount > 0 
        ? parseFloat(((engagements / followersCount) * 100).toFixed(2))
        : 0;
    const row = [
      date,
      profileData.network_type,
      profileData.name,
      profileData.network_id,
      profileData.profile_id,
      followersCount,
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
      engagementRatePerFollower
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
const INSTAGRAM_SHEET_NAME = 'Instagram';
const setupInstagramSheetHeaders = async (auth) => {
  try {
    const response = await sheets.spreadsheets.values.get({
      auth,
      spreadsheetId: SPREADSHEET_ID,
      range: `${INSTAGRAM_SHEET_NAME}!A1:Z1`,
    });
    const headers = [
      'Date',
      'Network',
      'Profile Name',
      'Network ID',
      'Profile ID',
      'Followers Count',
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
      'Engagement Rate (per Follower)',
    ];
    // Force header update to include new Followers Count column
    let needHeaderUpdate = true;
    if (needHeaderUpdate) {
      console.log('Updating sheet headers with new columns');
      await sheets.spreadsheets.values.update({
        auth,
        spreadsheetId: SPREADSHEET_ID,
        range: `${INSTAGRAM_SHEET_NAME}!A1:${String.fromCharCode(65 + headers.length - 1)}1`,
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
const updateSheet = async (auth, rows, sheetName) => {
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
      range: `${sheetName}!A:A`,
    });

    const nextRow = (response.data.values ? response.data.values.length : 0) + 1;
    const lastRow = nextRow + rows.length - 1;

    // Use getColumnLetter for last column
    const getColumnLetter = (colNum) => {
      let temp = colNum;
      let letter = '';
      while (temp > 0) {
        let rem = (temp - 1) % 26;
        letter = String.fromCharCode(65 + rem) + letter;
        temp = Math.floor((temp - 1) / 26);
      }
      return letter;
    };
    const lastCol = getColumnLetter(rows[0].length);

    console.log('Sheet update details:', {
      nextRow,
      lastRow,
      columnCount: rows[0].length,
      rowCount: rows.length
    });

    const updateResponse = await sheets.spreadsheets.values.update({
      auth,
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A${nextRow}:${lastCol}${lastRow}`,
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

// Format YouTube analytics data for Sheet2
function formatYouTubeAnalyticsData(dataPoint, profileData) {
  try {
    const metrics = dataPoint.metrics;
    const reportingPeriod = dataPoint.dimensions && (dataPoint.dimensions['reporting_period.by(day)'] || dataPoint.dimensions.reporting_period);
    if (!reportingPeriod) {
      console.error('No reporting period found in dataPoint:', dataPoint);
      return null;
    }
    const date = new Date(reportingPeriod).toISOString().split('T')[0];
    
    const netFollowerGrowths = 
      (parseFloat(metrics["followers_gained"] || 0)) - 
      (parseFloat(metrics["followers_lost"] || 0));

    const videoEngagements = 
      (parseFloat(metrics["comments_count"] || 0)) +
      (parseFloat(metrics["likes"] || 0))+
      (parseFloat(metrics["dislikes"] || 0)) +
      (parseFloat(metrics["shares_count"] || 0)) +
      (parseFloat(metrics["followers_gained"] || 0)) +
      (parseFloat(metrics["annotation_clicks"] || 0)) +
      (parseFloat(metrics["card_clicks"] || 0));

    const videoViews = parseFloat(metrics["video_views"] || 0);
    const engagementsPerView = videoViews > 0 
      ? parseFloat((videoEngagements / videoViews).toFixed(4)) 
      : 0;
    // Return values in the order specified for Sheet2
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
      netFollowerGrowths,
      videoEngagements,
      videoViews
    ];
    console.log('Formatted YouTube row:', row);
    return row;
  } catch (err) {
    console.error('Error formatting YouTube analytics data:', err.message);
    console.error('Data point:', dataPoint);
    console.error('Profile data:', profileData);
    return null;
  }
}

// Set up Sheet2 headers
const YOUTUBE_SHEET_NAME = 'Youtube';
const YOUTUBE_HEADERS = [
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
  'netFollowerGrowths',
  'videoEngagements',
  'videoViews'
];

const setupYoutubeSheetHeaders = async (auth) => {
  try {
    const lastCol = getColumnLetter(YOUTUBE_HEADERS.length);
    const headerRange = `${YOUTUBE_SHEET_NAME}!A1:${lastCol}1`;
    const response = await sheets.spreadsheets.values.get({
      auth,
      spreadsheetId: SPREADSHEET_ID,
      range: headerRange,
    });
    // Force header update to include new Followers Count column
    let needHeaderUpdate = true;
    if (needHeaderUpdate) {
      console.log('Updating Youtube headers with new columns');
      await sheets.spreadsheets.values.update({
        auth,
        spreadsheetId: SPREADSHEET_ID,
        range: headerRange,
        valueInputOption: 'RAW',
        resource: {
          values: [YOUTUBE_HEADERS]
        }
      });
      console.log('Youtube headers updated successfully');
    } else {
      console.log('Youtube headers already up to date');
    }
    return true;
  } catch (error) {
    console.error(`Error setting up Youtube headers: ${error.message}`);
    return false;
  }
};

// --- Sheet3 Support for LinkedIn (Profile ID 6878551) ---
// --- Sheet4 Support for Facebook (Profile ID 6886947) ---
// --- Sheet5 Support for Twitter (Profile ID 6911594) ---
const SHEET5_PROFILE_ID = '6911594';
const TWITTER_SHEET_NAME = 'Twitter';
const TWITTER_HEADERS = [
  'Date',
  'Network',
  'Profile Name',
  'Network ID',
  'Profile ID',
  'Followers Count',
  'net_follower_growth',
  'impressions',
  'post_media_views',
  'video_views',
  'reactions',
  'likes',
  'comments_count',
  'shares_count',
  'post_link_clicks',
  'post_content_clicks_other',
  'post_media_clicks',
  'post_hashtag_clicks',
  'post_detail_expand_clicks',
  'post_profile_clicks',
  'engagements_other',
  'post_app_engagements',
  'post_app_installs',
  'post_app_opens',
  'posts_sent_count',
  'posts_sent_by_post_type',
  'posts_sent_by_content_type',
  'Engagements',
  'Engagement Rate (per Impression)',
  'Engagement Rate (per Follower)',
  'Click-Through Rate'
];
const setupTwitterSheetHeaders = async (auth) => {
  try {
    const lastCol = getColumnLetter(TWITTER_HEADERS.length);
    const headerRange = `${TWITTER_SHEET_NAME}!A1:${lastCol}1`;
    const response = await sheets.spreadsheets.values.get({
      auth,
      spreadsheetId: SPREADSHEET_ID,
      range: headerRange,
    });
    // Force header update to include new Followers Count column
    let needHeaderUpdate = true;
    if (needHeaderUpdate) {
      console.log('Updating Twitter headers with new columns');
      await sheets.spreadsheets.values.update({
        auth,
        spreadsheetId: SPREADSHEET_ID,
        range: headerRange,
        valueInputOption: 'RAW',
        resource: {
          values: [TWITTER_HEADERS]
        }
      });
      console.log('Twitter headers updated successfully');
    } else {
      console.log('Twitter headers already up to date');
    }
    return true;
  } catch (error) {
    console.error(`Error setting up Twitter headers: ${error.message}`);
    return false;
  }
};
const formatTwitterAnalyticsData = (dataPoint, profileData) => {
  // Use safeNumber for all metrics in the row array

  try {
    const metrics = dataPoint.metrics;
    const reportingPeriod = dataPoint.dimensions && (dataPoint.dimensions['reporting_period.by(day)'] || dataPoint.dimensions.reporting_period);
    if (!reportingPeriod) {
      console.error('No reporting period found in dataPoint:', dataPoint);
      return null;
    }
    const date = new Date(reportingPeriod).toISOString().split('T')[0];
    
    const followers = metrics["lifetime_snapshot.followers_count"] || 0;
    const impressions = metrics["impressions"] || 0;
    const postLinkClicks = metrics["post_link_clicks"] || 0;
    const otherClicks = metrics["post_content_clicks_other"] || 0;
    const otherEngagements = metrics["engagements_other"] || 0;
    
    // Sprout's default Engagements calculation for Twitter/X
    const engagements = 
      parseFloat(metrics["likes"] || 0) + 
      parseFloat(metrics["comments_count"] || 0) +  // @Replies
      parseFloat(metrics["shares_count"] || 0) +    // Reposts
      parseFloat(postLinkClicks) + 
      parseFloat(otherClicks) +
      parseFloat(otherEngagements);
    
    // Engagement Rates
    const engagementRatePerFollower = followers > 0 
      ? parseFloat(((engagements / followers) * 100).toFixed(2)) 
      : 0;
      
    const engagementRatePerImpression = impressions > 0
      ? parseFloat(((engagements / impressions) * 100).toFixed(2))
      : 0;
      
    // Click-Through Rate
    const clickThroughRate = impressions > 0
      ? parseFloat(((postLinkClicks / impressions) * 100).toFixed(2))
      : 0;
    
    return [
      date,
      profileData ? profileData.network_type : '',
      profileData ? profileData.name : '',
      profileData ? profileData.network_id : '',
      dataPoint.dimensions.customer_profile_id || '',
      safeNumber(metrics['lifetime_snapshot.followers_count']),
      safeNumber(metrics['net_follower_growth']),
      safeNumber(metrics['impressions']),
      safeNumber(metrics['post_media_views']),
      safeNumber(metrics['video_views']),
      safeNumber(metrics['reactions']),
      safeNumber(metrics['likes']),
      safeNumber(metrics['comments_count']),
      safeNumber(metrics['shares_count']),
      safeNumber(metrics['post_content_clicks']),
      safeNumber(metrics['post_link_clicks']),
      safeNumber(metrics['post_content_clicks_other']),
      safeNumber(metrics['post_media_clicks']),
      safeNumber(metrics['post_hashtag_clicks']),
      safeNumber(metrics['post_detail_expand_clicks']),
      safeNumber(metrics['post_profile_clicks']),
      safeNumber(metrics['engagements_other']),
      safeNumber(metrics['post_app_engagements']),
      safeNumber(metrics['post_app_installs']),
      safeNumber(metrics['post_app_opens']),
      safeNumber(metrics['posts_sent_count']),
      safeNumber(metrics['posts_sent_by_post_type']),
      safeNumber(metrics['posts_sent_by_content_type']),
      engagements,
      engagementRatePerImpression,
      engagementRatePerFollower,
      clickThroughRate
    ];
  } catch (err) {
    console.error('Error formatting Twitter analytics data:', err.message);
    return null;
  }
};
const updateTwitterSheet = async (auth, rows) => updateSheet(auth, rows, TWITTER_SHEET_NAME);
// --- End Twitter Support ---

const SHEET4_PROFILE_ID = '6886947';
const FACEBOOK_SHEET_NAME = 'Facebook';
const FACEBOOK_HEADERS = [
  'Date',
  'Network',
  'Profile Name',
  'Network ID',
  'Profile ID',
  'Followers Count',
  'net_follower_growth',
  'followers_gained',
  'followers_gained_organic',
  'followers_gained_paid',
  'followers_lost',
  'lifetime_snapshot.fans_count',
  'fans_gained',
  'fans_gained_organic',
  'fans_gained_paid',
  'fans_lost',
  'impressions',
  'impressions_organic',
  'impressions_viral',
  'impressions_nonviral',
  'impressions_paid',
  'tab_views',
  'tab_views_login',
  'tab_views_logout',
  'post_impressions',
  'post_impressions_organic',
  'post_impressions_viral',
  'post_impressions_nonviral',
  'post_impressions_paid',
  'impressions_unique',
  'impressions_organic_unique',
  'impressions_viral_unique',
  'impressions_nonviral_unique',
  'impressions_paid_unique',
  'reactions',
  'comments_count',
  'shares_count',
  'post_link_clicks',
  'post_content_clicks_other',
  'profile_actions',
  'post_engagements',
  'video_views',
  'video_views_organic',
  'video_views_paid',
  'video_views_autoplay',
  'video_views_click_to_play',
  'video_views_repeat',
  'video_view_time',
  'Engagements',
  'Engagement Rate (per Impression)',
  'Engagement Rate (per Follower)',
  'Click-Through Rate',
  'video_views_unique',
  'video_views_30s_complete',
  'video_views_30s_complete_organic',
  'video_views_30s_complete_paid',
  'video_views_30s_complete_autoplay',
  'video_views_30s_complete_click_to_play',
  'video_views_30s_complete_repeat',
  'video_views_30s_complete_unique',
  'video_views_partial',
  'video_views_partial_organic',
  'video_views_partial_paid',
  'video_views_partial_autoplay',
  'video_views_partial_click_to_play',
  'video_views_partial_repeat',
  'posts_sent_count',
  'posts_sent_by_post_type',
  'posts_sent_by_content_type'
];
const setupFacebookSheetHeaders = async (auth) => {
  try {
    const lastCol = getColumnLetter(FACEBOOK_HEADERS.length);
    const headerRange = `${FACEBOOK_SHEET_NAME}!A1:${lastCol}1`;
    const response = await sheets.spreadsheets.values.get({
      auth,
      spreadsheetId: SPREADSHEET_ID,
      range: headerRange,
    });
    // Force header update to include new Followers Count column
    let needHeaderUpdate = true;
    if (needHeaderUpdate) {
      console.log('Updating Facebook headers with new columns');
      await sheets.spreadsheets.values.update({
        auth,
        spreadsheetId: SPREADSHEET_ID,
        range: headerRange,
        valueInputOption: 'RAW',
        resource: {
          values: [FACEBOOK_HEADERS]
        }
      });
      console.log('Facebook headers updated successfully');
    } else {
      console.log('Facebook headers already up to date');
    }
    return true;
  } catch (error) {
    console.error(`Error setting up Facebook headers: ${error.message}`);
    return false;
  }
};
function safeNumber(val) {
  return (typeof val === 'number' && !isNaN(val)) ? val : 0;
}

const formatFacebookAnalyticsData = (dataPoint, profileData) => {
  try {
    const metrics = dataPoint.metrics;
    const reportingPeriod = dataPoint.dimensions && (dataPoint.dimensions['reporting_period.by(day)'] || dataPoint.dimensions.reporting_period);
    if (!reportingPeriod) {
      console.error('No reporting period found in dataPoint:', dataPoint);
      return null;
    }
    const date = new Date(reportingPeriod).toISOString().split('T')[0];
    
    const followers = metrics["lifetime_snapshot.followers_count"] || 0;
    const impressions = metrics["impressions"] || 0;
    const postLinkClicks = metrics["post_link_clicks"] || 0;
    const otherClicks = metrics["post_content_clicks_other"] || 0;
    
    // Sprout's default Engagements calculation for Facebook
    const engagements = 
      (parseFloat(metrics["reactions"] || 0)) + 
      (parseFloat(metrics["comments_count"] || 0)) + 
      (parseFloat(metrics["shares_count"] || 0)) + 
      parseFloat(postLinkClicks) + 
      parseFloat(otherClicks);
    
    // Engagement Rates
    const engagementRatePerFollower = followers > 0 
      ? parseFloat(((engagements / followers) * 100).toFixed(2)) 
      : 0;
      
    const engagementRatePerImpression = impressions > 0
      ? parseFloat(((engagements / impressions) * 100).toFixed(2))
      : 0;
      
    // Click-Through Rate
    const clickThroughRate = impressions > 0
      ? parseFloat(((postLinkClicks / impressions) * 100).toFixed(2))
      : 0;
    
    return [
      date,
      profileData ? profileData.network_type : '',
      profileData ? profileData.name : '',
      profileData ? profileData.network_id : '',
      dataPoint.dimensions.customer_profile_id || '',
      metrics['lifetime_snapshot.followers_count'] || 0,
      metrics['net_follower_growth'] || 0,
      metrics['followers_gained'] || 0,
      metrics['followers_gained_organic'] || 0,
      metrics['followers_gained_paid'] || 0,
      metrics['followers_lost'] || 0,
      safeNumber(metrics['lifetime_snapshot.fans_count']),
      safeNumber(metrics['fans_gained']),
      safeNumber(metrics['fans_gained_organic']),
      safeNumber(metrics['fans_gained_paid']),
      safeNumber(metrics['fans_lost']),
      metrics['impressions'] || 0,
      safeNumber(metrics['impressions_organic']),
      safeNumber(metrics['impressions_viral']),
      safeNumber(metrics['impressions_nonviral']),
      safeNumber(metrics['impressions_paid']),
      safeNumber(metrics['tab_views']),
      safeNumber(metrics['tab_views_login']),
      safeNumber(metrics['tab_views_logout']),
      safeNumber(metrics['post_impressions']),
      safeNumber(metrics['post_impressions_organic']),
      safeNumber(metrics['post_impressions_viral']),
      safeNumber(metrics['post_impressions_nonviral']),
      safeNumber(metrics['post_impressions_paid']),
      metrics['impressions_unique'] || 0,
      safeNumber(metrics['impressions_organic_unique']),
      safeNumber(metrics['impressions_viral_unique']),
      safeNumber(metrics['impressions_nonviral_unique']),
      safeNumber(metrics['impressions_paid_unique']),
      metrics['reactions'] || 0,
      metrics['comments_count'] || 0,
      metrics['shares_count'] || 0,
      metrics['post_link_clicks'] || 0,
      metrics['post_content_clicks_other'] || 0,
      safeNumber(metrics['profile_actions']),
      safeNumber(metrics['post_engagements']),
      metrics['video_views'] || 0,
      safeNumber(metrics['video_views_organic']),
      safeNumber(metrics['video_views_paid']),
      safeNumber(metrics['video_views_autoplay']),
      safeNumber(metrics['video_views_click_to_play']),
      safeNumber(metrics['video_views_repeat']),
      safeNumber(metrics['video_view_time']),
      safeNumber(metrics['video_views_unique']),
      safeNumber(metrics['video_views_30s_complete']),
      safeNumber(metrics['video_views_30s_complete_organic']),
      safeNumber(metrics['video_views_30s_complete_paid']),
      safeNumber(metrics['video_views_30s_complete_autoplay']),
      safeNumber(metrics['video_views_30s_complete_click_to_play']),
      safeNumber(metrics['video_views_30s_complete_repeat']),
      safeNumber(metrics['video_views_30s_complete_unique']),
      safeNumber(metrics['video_views_partial']),
      safeNumber(metrics['video_views_partial_organic']),
      safeNumber(metrics['video_views_partial_paid']),
      safeNumber(metrics['video_views_partial_autoplay']),
      safeNumber(metrics['video_views_partial_click_to_play']),
      safeNumber(metrics['video_views_partial_repeat']),
      metrics['posts_sent_count'] || 0,
      metrics['posts_sent_by_post_type'] || 0,
      metrics['posts_sent_by_content_type'] || 0,
      engagements,
      engagementRatePerImpression,
      engagementRatePerFollower,
      clickThroughRate
    ];
  } catch (err) {
    console.error('Error formatting Facebook analytics data:', err.message);
    return null;
  }
};
const updateFacebookSheet = async (auth, rows) => updateSheet(auth, rows, FACEBOOK_SHEET_NAME);
// --- End Facebook Support ---

const INSTAGRAM_PROFILE_ID = '6886943';
const YOUTUBE_PROFILE_ID = '6909586';
const LINKEDIN_PROFILE_ID = '6878551';
const FACEBOOK_PROFILE_ID = '6886947';
const TWITTER_PROFILE_ID = '6911594';
const LINKEDIN_SHEET_NAME = 'Linkedin';
const LINKEDIN_HEADERS = [
  'Date',
  'Network',
  'Profile Name',
  'Network ID',
  'Profile ID',
  'Followers Count',
  'Followers by Job Function',
  'Followers by Seniority',
  'Net Follower Growth',
  'Followers Gained',
  'Followers Gained Organic',
  'Followers Gained Paid',
  'Followers Lost',
  'Impressions',
  'Impressions Unique',
  'Reactions',
  'Comments Count',
  'Shares Count',
  'Post Content Clicks',
  'Posts Sent Count',
  'Engagements',
  'Engagement Rate (per Impression)',
  'Engagement Rate (per Follower)',
];
const getColumnLetter = (colNum) => {
  let temp = colNum;
  let letter = '';
  while (temp > 0) {
    let rem = (temp - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    temp = Math.floor((temp - 1) / 26);
  }
  return letter;
};

const setupLinkedinSheetHeaders = async (auth) => {
  try {
    const lastCol = getColumnLetter(LINKEDIN_HEADERS.length);
    const headerRange = `${LINKEDIN_SHEET_NAME}!A1:${lastCol}1`;
    const response = await sheets.spreadsheets.values.get({
      auth,
      spreadsheetId: SPREADSHEET_ID,
      range: headerRange,
    });
    // Force header update to include new Followers Count column
    let needHeaderUpdate = true;
    if (needHeaderUpdate) {
      console.log('Updating LinkedIn headers with new columns');
      await sheets.spreadsheets.values.update({
        auth,
        spreadsheetId: SPREADSHEET_ID,
        range: headerRange,
        valueInputOption: 'RAW',
        resource: {
          values: [LINKEDIN_HEADERS]
        }
      });
      console.log('LinkedIn headers updated successfully');
    } else {
      console.log('LinkedIn headers already up to date');
    }
    return true;
  } catch (error) {
    console.error(`Error setting up LinkedIn headers: ${error.message}`);
    return false;
  }
};
const formatLinkedInAnalyticsData = (dataPoint, profileData) => {
  try {
    const metrics = dataPoint.metrics;
    const reportingPeriod = dataPoint.dimensions && (dataPoint.dimensions['reporting_period.by(day)'] || dataPoint.dimensions.reporting_period);
    if (!reportingPeriod) {
      console.error('No reporting period found in dataPoint:', dataPoint);
      return null;
    }
    const date = new Date(reportingPeriod).toISOString().split('T')[0];
    
    const engagements = 
      (parseFloat(metrics["reactions"] || 0)) + 
      (parseFloat(metrics["comments_count"] || 0)) + 
      (parseFloat(metrics["shares_count"] || 0)) + 
      (parseFloat(metrics["post_clicks_all"] || 0));
    
    const impressions = parseFloat(metrics["impressions"] || 1); // Avoid division by zero
    const followers = parseFloat(metrics["lifetime_snapshot.followers_count"] || 1);
    const engagementRatePerFollower = followers > 0 
      ? parseFloat(((engagements / followers) * 100).toFixed(2)) 
      : 0;
    const engagementRatePerImpression = parseFloat(((engagements / impressions) * 100).toFixed(2));
    
    return [
      date,
      profileData ? profileData.network_type : '',
      profileData ? profileData.name : '',
      profileData ? profileData.network_id : '',
      dataPoint.dimensions.customer_profile_id || '',
      metrics['lifetime_snapshot.followers_count'] || 0,
      metrics['followers_by_job_function'] || '0',
      metrics['followers_by_seniority'] || '0',
      metrics['net_follower_growth'] || 0,
      metrics['followers_gained'] || 0,
      metrics['followers_gained_organic'] || 0,
      metrics['followers_gained_paid'] || 0,
      metrics['followers_lost'] || 0,
      metrics['impressions'] || 0,
      metrics['impressions_unique'] || 0,
      metrics['reactions'] || 0,
      metrics['comments_count'] || 0,
      metrics['shares_count'] || 0,
      metrics['post_content_clicks'] || 0,
      metrics['posts_sent_count'] || 0,
      engagements,
      engagementRatePerImpression,
      engagementRatePerFollower
    ];
  } catch (err) {
    console.error('Error formatting LinkedIn analytics data:', err.message);
    return null;
  }
};
const updateLinkedinSheet = async (auth, rows) => updateSheet(auth, rows, LINKEDIN_SHEET_NAME);
// --- End LinkedIn Support ---

// Main function to run the data collection and update
const main = async () => {
  try {
    console.log('Starting daily update process...');
    const auth = await getGoogleAuth();
    if (!auth) {
      throw new Error('Failed to authenticate with Google Sheets');
    }

    await setupInstagramSheetHeaders(auth);
    await setupYoutubeSheetHeaders(auth);
    await setupLinkedinSheetHeaders(auth);
    await setupFacebookSheetHeaders(auth);
    await setupTwitterSheetHeaders(auth);
    const profiles = await getProfileData();
    const sheet1ProfileId = INSTAGRAM_PROFILE_ID;
    const sheet2ProfileId = YOUTUBE_PROFILE_ID;
    const linkedinProfileId = LINKEDIN_PROFILE_ID;
    const facebookProfileId = FACEBOOK_PROFILE_ID;
    const twitterProfileId = TWITTER_PROFILE_ID;
    
    if (!profiles || profiles.length === 0) {
      throw new Error('No profiles found to process');
    }

        // Determine date range to fetch
    let startDateToUse = START_DATE;
    let endDateToUse = END_DATE;
    
    if (!startDateToUse && !endDateToUse) {
      // If no dates specified, use today
      const today = new Date().toISOString().split('T')[0];
      startDateToUse = today;
      endDateToUse = today;
    } else if (startDateToUse && !endDateToUse) {
      // If only start date specified, use just that day
      endDateToUse = startDateToUse;
    }
    
    console.log(`Fetching analytics data for date range: ${startDateToUse} to ${endDateToUse}`);
    
    // Fetch all data for the entire date range with chunking to avoid rate limits
    const analyticsData = await getAnalyticsData(
      startDateToUse,
      endDateToUse,
      profiles.map(p => p.profile_id)
    );
    
    // Process data by date
    if (analyticsData && analyticsData.data && analyticsData.data.length > 0) {
      // Group data points by date
      const dataByDate = {};
      
      for (const dataPoint of analyticsData.data) {
        const reportingPeriod = dataPoint.dimensions && 
          (dataPoint.dimensions['reporting_period.by(day)'] || dataPoint.dimensions.reporting_period);
        
        if (!reportingPeriod) {
          console.error('No reporting period found in dataPoint:', dataPoint);
          continue;
        }
        
        // Ensure date is properly formatted
        let dateKey;
        try {
          dateKey = new Date(reportingPeriod).toISOString().split('T')[0];
        } catch (e) {
          console.error(`Error parsing date from ${reportingPeriod}:`, e);
          continue;
        }
        
        if (!dataByDate[dateKey]) {
          dataByDate[dateKey] = [];
        }
        dataByDate[dateKey].push(dataPoint);
      }
      
      // Sort dates chronologically
      const sortedDates = Object.keys(dataByDate).sort();
      console.log(`Processing data for ${sortedDates.length} dates: ${sortedDates.join(', ')}`);
      
      // Process each date's data
      for (const dateToUse of sortedDates) {
        console.log(`Processing data for ${dateToUse}`);
        const datepointArray = dataByDate[dateToUse];
        
        // Create a compatible data structure for the rest of the code
        const dateAnalyticsData = {
          data: datepointArray
        };

      const rowsForDate = [];
      const youtubeRowsForDate = [];
      
      const linkedinRowsForDate = [];
      const facebookRowsForDate = [];
      const twitterRowsForDate = [];
      for (const dataPoint of datepointArray) {
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

        // Sheet1: Only use profile_id 6886943
        if (String(profile.profile_id) === sheet1ProfileId) {
          const formattedRow = formatAnalyticsData(dataPoint, profile);
          if (formattedRow) {
            rowsForDate.push(formattedRow);
          }
        }

        // Sheet2: Only use profile_id 6909586
        if (String(profile.profile_id) === sheet2ProfileId) {
          console.log('[Sheet2] Processing YouTube profile:', profile);
          const youtubeRow = formatYouTubeAnalyticsData(dataPoint, profile);
          if (youtubeRow) {
            console.log('[Sheet2] Adding YouTube row:', youtubeRow);
            youtubeRowsForDate.push(youtubeRow);
          } else {
            console.warn('[Youtube] formatYouTubeAnalyticsData returned null for dataPoint:', dataPoint);
          }
        }
        // Linkedin: Only use profile_id 6878551
        if (String(profile.profile_id) === linkedinProfileId) {
          const linkedinRow = formatLinkedInAnalyticsData(dataPoint, profile);
          if (linkedinRow) {
            linkedinRowsForDate.push(linkedinRow);
          } else {
            console.warn('[Linkedin] formatLinkedInAnalyticsData returned null for dataPoint:', dataPoint);
          }
        }
        // Facebook: Only use profile_id 6886947
        if (String(profile.profile_id) === facebookProfileId) {
          const facebookRow = formatFacebookAnalyticsData(dataPoint, profile);
          if (facebookRow) {
            facebookRowsForDate.push(facebookRow);
          } else {
            console.warn('[Facebook] formatFacebookAnalyticsData returned null for dataPoint:', dataPoint);
          }
        }
        // Twitter: Only use profile_id 6911594
        if (String(profile.profile_id) === twitterProfileId) {
          const twitterRow = formatTwitterAnalyticsData(dataPoint, profile);
          if (twitterRow) {
            twitterRowsForDate.push(twitterRow);
          } else {
            console.warn('[Twitter] formatTwitterAnalyticsData returned null for dataPoint:', dataPoint);
          }
        }
      }

      if (rowsForDate.length > 0) {
        await updateSheet(auth, rowsForDate, INSTAGRAM_SHEET_NAME);
        console.log(`Updated Instagram for ${dateToUse}`);
      } else {
        console.warn(`No valid Instagram data rows to update for ${dateToUse}`);
      }

      if (youtubeRowsForDate.length > 0) {
        await updateSheet(auth, youtubeRowsForDate, YOUTUBE_SHEET_NAME);
        console.log(`Updated Youtube for ${dateToUse}`);
      } else {
        console.warn(`No valid Youtube data rows to update for ${dateToUse}`);
      }
      if (linkedinRowsForDate.length > 0) {
        await updateSheet(auth, linkedinRowsForDate, LINKEDIN_SHEET_NAME);
        console.log(`Updated Linkedin for ${dateToUse}`);
      } else {
        console.warn(`No valid Linkedin data rows to update for ${dateToUse}`);
      }
      if (facebookRowsForDate.length > 0) {
        await updateSheet(auth, facebookRowsForDate, FACEBOOK_SHEET_NAME);
        console.log(`Updated Facebook for ${dateToUse}`);
      } else {
        console.warn(`No valid Facebook data rows to update for ${dateToUse}`);
      }
      if (twitterRowsForDate.length > 0) {
        await updateSheet(auth, twitterRowsForDate, TWITTER_SHEET_NAME);
        console.log(`Updated Twitter for ${dateToUse}`);
      } else {
        console.warn(`No valid Twitter data rows to update for ${dateToUse}`);
      }
    }
    }
    console.log('All dates processed and sheet updated.');
  } catch (error) {
    console.error(`Error in main function: ${error.message}`);
    console.error(error.stack);
  }
};

// Schedule runs
const scheduleRuns = () => {
  // Run every hour by default (adjust as needed)
  const intervalMinutes = 60;
  console.log(`Scheduling runs every ${intervalMinutes} minute(s)`);
  
  // Run immediately
  main();
  
  // Then schedule
  setInterval(main, intervalMinutes * 60 * 1000);
};

// Start the process
console.log('Starting regular updates');
scheduleRuns();
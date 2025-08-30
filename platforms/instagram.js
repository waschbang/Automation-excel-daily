/**
 * Instagram analytics processing module - FINAL CORRECTED VERSION
 */
const { safeNumber } = require('../utils/api');

// Network types that should be processed as Instagram
const INSTAGRAM_NETWORK_TYPES = ['instagram', 'fb_instagram_account'];

// Sheet configuration
const SHEET_NAME = 'Instagram';

// Sheet headers - EXACTLY matching your API response metrics
const HEADERS = [
  // Identifiers
  'Date',
  'Network Type',
  'Profile Name',
  
  // Follower Metrics
  'Followers',                    // lifetime_snapshot.followers_count
  'Net Follower Growth',          // net_follower_growth
  'Followers Gained',             // followers_gained
  'Followers Lost',               // followers_lost
  'Following',                    // lifetime_snapshot.following_count
  'Net Following Growth',         // net_following_growth
  
  // Impression/View Metrics
  'Impressions',                  // impressions
  'Paid Impressions',            // impressions_paid
  'Organic Impressions',         // impressions_organic
  'Total Impressions',           // impressions_total
  'Reach',                       // impressions_unique
  'Views',                       // views
  'Post Video Views',            // video_views
  
  // Engagement Metrics
  'Reactions',                   // reactions
  'Likes',                      // likes
  'Comments',                   // comments_count
  'Saves',                      // saves
  'Shares',                     // shares_count
  'Story Replies',              // story_replies
  
  // Content Metrics
  'Posts Sent Count',           // posts_sent_count
  'Posts Sent By Post Type',    // posts_sent_by_post_type
  'Posts Sent By Content Type'  // posts_sent_by_content_type
];

/**
 * Check if the network type should be processed as Instagram
 * @param {string} networkType - Network type from the profile
 * @returns {boolean} True if the network type should be processed as Instagram
 */
const isInstagramType = (networkType) => {
  return INSTAGRAM_NETWORK_TYPES.includes(networkType);
};

/**
 * Format Instagram analytics data for Google Sheets
 * @param {Object} dataPoint - Data point from API
 * @param {Object} profileData - Profile metadata
 * @returns {Array|null} Formatted row for Google Sheets
 */
const formatAnalyticsData = (dataPoint, profileData) => {
  try {
    if (!dataPoint || !dataPoint.metrics) {
      console.error('Invalid data point received for formatting:', dataPoint);
      return null;
    }

    console.log('\n=== Instagram Data Point ===');
    console.log('Profile Data:', {
      name: profileData.name,
      network_type: profileData.network_type,
      network_id: profileData.network_id,
      customer_profile_id: profileData.customer_profile_id
    });
    
    console.log('\nRaw Metrics:', dataPoint.metrics);
    
    const metrics = dataPoint.metrics;
    const reportingPeriod = dataPoint.dimensions && (dataPoint.dimensions['reporting_period.by(day)'] || dataPoint.dimensions.reporting_period);
    
    if (!reportingPeriod) {
      console.error('No reporting period found in dataPoint:', dataPoint);
      return null;
    }
    
    const date = new Date(reportingPeriod).toISOString().split('T')[0];

    // Build row with correct mapping to API response metrics
    const row = [
      // Basic Information
      date,                                                         // Date
      profileData.network_type,                                     // Network Type
      profileData.name,                                            // Profile Name
      
      // Follower Metrics
      safeNumber(metrics["lifetime_snapshot.followers_count"]),    // Followers
      safeNumber(metrics["net_follower_growth"]),                  // Net Follower Growth
      safeNumber(metrics["followers_gained"]),                     // Followers Gained
      safeNumber(metrics["followers_lost"]),                       // Followers Lost
      safeNumber(metrics["lifetime_snapshot.following_count"]),    // Following
      safeNumber(metrics["net_following_growth"]),                 // Net Following Growth
      
      // Impression/View Metrics
      safeNumber(metrics["impressions"]),                          // Impressions
      safeNumber(metrics["impressions_paid"]),                     // Paid Impressions
      safeNumber(metrics["impressions_organic"]),                  // Organic Impressions
      safeNumber(metrics["impressions_total"]),                    // Total Impressions
      safeNumber(metrics["impressions_unique"]),                   // Reach
      safeNumber(metrics["views"]),                                // Views
      safeNumber(metrics["video_views"]),                          // Post Video Views
      
      // Engagement Metrics
      safeNumber(metrics["reactions"]),                            // Reactions
      safeNumber(metrics["likes"]),                                // Likes
      safeNumber(metrics["comments_count"]),                       // Comments
      safeNumber(metrics["saves"]),                                // Saves
      safeNumber(metrics["shares_count"]),                         // Shares
      safeNumber(metrics["story_replies"]),                        // Story Replies
      
      // Content Metrics
      safeNumber(metrics["posts_sent_count"]),                     // Posts Sent Count
      metrics["posts_sent_by_post_type"] ? JSON.stringify(metrics["posts_sent_by_post_type"]) : '',
      metrics["posts_sent_by_content_type"] ? JSON.stringify(metrics["posts_sent_by_content_type"]) : ''
    ];

    console.log('\nFormatted Row:');
    row.forEach((value, index) => {
      console.log(`${HEADERS[index]}: ${value}`);
    });

    // Validate row length
    if (row.length !== HEADERS.length) {
      console.error(`Row length mismatch! Headers: ${HEADERS.length}, Row: ${row.length}`);
      return null;
    }

    return row;
  } catch (error) {
    console.error(`Error formatting Instagram analytics data: ${error.message}`);
    console.error('Data point:', dataPoint);
    console.error('Profile data:', profileData);
    return null;
  }
};

/**
 * Setup Instagram sheet headers
 * @param {Object} sheetsUtil - Sheets utility module
 * @param {Object} auth - Google auth client
 * @param {string} spreadsheetId - Google Spreadsheet ID
 * @returns {Promise<boolean>} Success status
 */
const setupHeaders = async (sheetsUtil, auth, spreadsheetId) => {
  return sheetsUtil.setupSheetHeaders(auth, spreadsheetId, SHEET_NAME, HEADERS);
};

/**
 * Update Instagram sheet with data
 * @param {Object} sheetsUtil - Sheets utility module
 * @param {Object} auth - Google auth client
 * @param {string} spreadsheetId - Google Spreadsheet ID
 * @param {Array} rows - Data rows
 * @returns {Promise<boolean>} Success status
 */
const updateSheet = async (sheetsUtil, auth, spreadsheetId, rows) => {
  return sheetsUtil.updateSheet(auth, spreadsheetId, rows, SHEET_NAME);
};

module.exports = {
  SHEET_NAME,
  HEADERS,
  formatAnalyticsData,
  setupHeaders,
  updateSheet,
  isInstagramType
};
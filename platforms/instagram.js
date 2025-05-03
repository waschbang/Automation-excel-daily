/**
 * Instagram analytics processing module
 */
const { safeNumber } = require('../utils/api');

// Network types that should be processed as Instagram
const INSTAGRAM_NETWORK_TYPES = ['instagram', 'fb_instagram_account'];

// Sheet configuration
const SHEET_NAME = 'Instagram';

// Sheet headers
const HEADERS = [
  'Date',
  'Network',
  'Profile Name',
  'Network ID',
  'Profile ID',
  'Impressions',
  'Impressions Unique',
  'Video Views',
  'Reactions',
  'Likes',
  'Comments Count',
  'Saves',
  'Shares Count',
  'Story Replies',
  'Posts Sent Count',
  'Net Follower Growth',
  'Followers Gained',
  'Followers Lost',
  'Following Count',
  'Views',
  'Followers Count',
  'Net Following Growth',
  'Total Engagements',
  'Engagement Rate (per Impression)',
  'Engagement Rate (per Follower)'
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
    
    // Calculate total engagements
    const engagements = (
      parseFloat(metrics["likes"] || 0) + 
      parseFloat(metrics["comments_count"] || 0) + 
      parseFloat(metrics["shares_count"] || 0) + 
      parseFloat(metrics["saves"] || 0) + 
      parseFloat(metrics["story_replies"] || 0)
    );

    const impressions = parseFloat(metrics["impressions"] || 0);
    const followersCount = parseFloat(metrics["lifetime_snapshot.followers_count"] || 0);
    
    // Calculate engagement rates
    const engagementRatePerImpression = impressions > 0 
      ? parseFloat(((engagements / impressions) * 100).toFixed(2))
      : 0;
      
    const engagementRatePerFollower = followersCount > 0 
      ? parseFloat(((engagements / followersCount) * 100).toFixed(2))
      : 0;

    // Map the data in the correct order according to the metrics
    const row = [
      date,                                    // Date
      profileData.network_type,                // Network
      profileData.name,                        // Profile Name
      profileData.network_id,                  // Network ID
      profileData.customer_profile_id,         // Profile ID
      metrics["impressions"] || 0,             // Impressions
      metrics["impressions_unique"] || 0,      // Impressions Unique
      metrics["video_views"] || 0,             // Video Views
      metrics["reactions"] || 0,               // Reactions
      metrics["likes"] || 0,                   // Likes
      metrics["comments_count"] || 0,          // Comments Count
      metrics["saves"] || 0,                   // Saves
      metrics["shares_count"] || 0,            // Shares Count
      metrics["story_replies"] || 0,           // Story Replies
      metrics["posts_sent_count"] || 0,        // Posts Sent Count
      metrics["net_follower_growth"] || 0,     // Net Follower Growth
      metrics["followers_gained"] || 0,        // Followers Gained
      metrics["followers_lost"] || 0,          // Followers Lost
      metrics["lifetime_snapshot.following_count"] || 0, // Following Count
      metrics["views"] || 0,                   // Views
      metrics["lifetime_snapshot.followers_count"] || 0, // Followers Count
      metrics["net_following_growth"] || 0,    // Net Following Growth
      engagements,                             // Total Engagements
      engagementRatePerImpression,             // Engagement Rate (per Impression)
      engagementRatePerFollower                // Engagement Rate (per Follower)
    ];

    console.log('\nFormatted Row:', row.map((value, index) => ({
      header: HEADERS[index],
      value: value
    })));

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
  isInstagramType,
  setupHeaders,
  updateSheet
};

/**
 * LinkedIn analytics processing module
 */
const { safeNumber } = require('../utils/api');

// Network types that should be processed as LinkedIn
const LINKEDIN_NETWORK_TYPES = ['linkedin', 'linkedin_company'];

// Sheet configuration
const SHEET_NAME = 'Linkedin';

// Sheet headers
const HEADERS = [
  'Date',
  'Network Type',
  'Profile Name',
  'Network ID',
  'Profile ID',
  'Net Follower Growth',
  'New Followers Gained',
  'Followers Lost',
  'Organic Impressions',
  'Paid Impressions',
  'Total Reactions',
  'Total Comments',
  'Total Shares',
  'Total Link Clicks',
  'Total Content Clicks',
  'Posts Published Count',
  'Total Clicks',
  'Total Impressions',
  'Lifetime Followers Count',
  'Total Engagement Actions',
  'Engagement Rate % (per Impression)',
  'Engagement Rate % (per Follower)',
  'Click-Through Rate %',
  // Additional MetricKeyAvailability (exact names requested)
  'Followers',
  'Followers By Job',
  'Followers By Seniority',
  // Skip 'Net Follower Growth' duplicate (already present above)
  'Followers Gained',
  'Organic Followers Gained',
  'Paid Followers Gained',
  // Skip 'Followers Lost' duplicate (already present above as exact)
  'Impressions',
  'Reach',
  'Reactions',
  'Comments',
  'Shares',
  'Post Clicks (All)',
  'Posts Sent Count',
  'Posts Sent By Post Type',
  'Posts Sent By Content Type'
];

/**
 * Check if the network type should be processed as LinkedIn
 * @param {string} networkType - Network type from the profile
 * @returns {boolean} True if the network type should be processed as LinkedIn
 */
const isLinkedInType = (networkType) => {
  return LINKEDIN_NETWORK_TYPES.includes(networkType);
};

/**
 * Format LinkedIn analytics data for Google Sheets
 * @param {Object} dataPoint - Data point from API
 * @param {Object} profileData - Profile metadata
 * @returns {Array|null} Formatted row for Google Sheets
 */
const formatAnalyticsData = (dataPoint, profileData) => {
  try {
    if (!dataPoint || !dataPoint.metrics) {
      console.error('Invalid LinkedIn data point received for formatting:', dataPoint);
      return null;
    }

    const metrics = dataPoint.metrics;
    const reportingPeriod = dataPoint.dimensions && 
      (dataPoint.dimensions['reporting_period.by(day)'] || dataPoint.dimensions.reporting_period);
    
    if (!reportingPeriod) {
      console.error('No reporting period found in LinkedIn dataPoint:', dataPoint);
      return null;
    }
    
    const date = new Date(reportingPeriod).toISOString().split('T')[0];
    
    // Calculate total engagement actions
    const engagements = 
      parseFloat(metrics["reactions"] || 0) + 
      parseFloat(metrics["comments_count"] || 0) + 
      parseFloat(metrics["shares_count"] || 0) + 
      parseFloat(metrics["post_link_clicks"] || 0) + 
      parseFloat(metrics["post_content_clicks"] || 0);
    
    // Get total impressions and lifetime followers count
    const impressions = parseFloat(metrics["impressions"] || 0);
    const followersCount = parseFloat(metrics["lifetime_snapshot.followers_count"] || 0);
    
    // Calculate engagement rate as percentage of impressions
    const engagementRatePerImpression = impressions > 0 
      ? parseFloat(((engagements / impressions) * 100).toFixed(2))
      : 0;
      
    // Calculate engagement rate as percentage of followers
    const engagementRatePerFollower = followersCount > 0 
      ? parseFloat(((engagements / followersCount) * 100).toFixed(2))
      : 0;
      
    // Calculate click-through rate as percentage of impressions
    const clickThroughRate = impressions > 0
      ? parseFloat(((parseFloat(metrics["post_link_clicks"] || 0) + parseFloat(metrics["post_content_clicks"] || 0)) / impressions * 100).toFixed(2))
      : 0;

    // Map the data in the correct order according to the existing sheet headers
    const baseRow = [
      date,                                    // Date
      profileData.network_type,                // Network Type
      profileData.name,                        // Profile Name
      profileData.network_id,                  // Network ID
      profileData.customer_profile_id,         // Profile ID
      safeNumber(metrics["net_follower_growth"]),     // Net Follower Growth
      safeNumber(metrics["followers_gained"]),        // New Followers Gained
      safeNumber(metrics["followers_lost"]),          // Followers Lost
      safeNumber(metrics["impressions_organic"]),     // Organic Impressions
      safeNumber(metrics["impressions_paid"]),        // Paid Impressions
      safeNumber(metrics["reactions"]),               // Total Reactions
      safeNumber(metrics["comments_count"]),          // Total Comments
      safeNumber(metrics["shares_count"]),            // Total Shares
      safeNumber(metrics["post_link_clicks"]),        // Total Link Clicks
      safeNumber(metrics["post_content_clicks"]),     // Total Content Clicks
      safeNumber(metrics["posts_sent_count"]),        // Posts Published Count
      safeNumber(metrics["post_link_clicks"]) + safeNumber(metrics["post_content_clicks"]), // Total Clicks
      safeNumber(metrics["impressions"]),             // Total Impressions
      safeNumber(metrics["lifetime_snapshot.followers_count"]), // Lifetime Followers Count
      engagements,                             // Total Engagement Actions
      engagementRatePerImpression,             // Engagement Rate % (per Impression)
      engagementRatePerFollower,               // Engagement Rate % (per Follower)
      clickThroughRate                         // Click-Through Rate %
    ];

    // Helper to stringify objects for breakdown metrics
    const valueOrJson = (val) => {
      if (val === null || val === undefined) return '';
      if (typeof val === 'object') return JSON.stringify(val);
      return val;
    };

    // Additional MetricKeyAvailability values in exact order
    const additional = [
      safeNumber(metrics['lifetime_snapshot.followers_count']), // Followers
      valueOrJson(metrics['followers_by_job_function']),        // Followers By Job (object/string)
      valueOrJson(metrics['followers_by_seniority']),           // Followers By Seniority (object/string)
      safeNumber(metrics['followers_gained']),                  // Followers Gained
      safeNumber(metrics['followers_gained_organic']),          // Organic Followers Gained
      safeNumber(metrics['followers_gained_paid']),             // Paid Followers Gained
      safeNumber(metrics['impressions']),                       // Impressions
      safeNumber(metrics['impressions_unique']),                // Reach
      safeNumber(metrics['reactions']),                         // Reactions
      safeNumber(metrics['comments_count']),                    // Comments
      safeNumber(metrics['shares_count']),                      // Shares
      safeNumber(metrics['post_content_clicks']),               // Post Clicks (All)
      safeNumber(metrics['posts_sent_count']),                  // Posts Sent Count
      valueOrJson(metrics['posts_sent_by_post_type']),          // Posts Sent By Post Type (object/string)
      valueOrJson(metrics['posts_sent_by_content_type']),       // Posts Sent By Content Type (object/string)
    ];

    const row = [...baseRow, ...additional];
    console.log('Formatted LinkedIn row:', row);
    return row;
  } catch (error) {
    console.error(`Error formatting LinkedIn analytics data: ${error.message}`);
    console.error('Data point:', dataPoint);
    console.error('Profile data:', profileData);
    return null;
  }
};

/**
 * Setup LinkedIn sheet headers
 * @param {Object} sheetsUtil - Sheets utility module
 * @param {Object} auth - Google auth client
 * @param {string} spreadsheetId - Google Spreadsheet ID
 * @returns {Promise<boolean>} Success status
 */
const setupHeaders = async (sheetsUtil, auth, spreadsheetId) => {
  return sheetsUtil.setupSheetHeaders(auth, spreadsheetId, SHEET_NAME, HEADERS);
};

/**
 * Update LinkedIn sheet with data
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
  isLinkedInType
};

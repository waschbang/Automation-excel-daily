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
  'Network',
  'Profile Name',
  'Network ID',
  'Profile ID',
  'Net Follower Growth',
  'Followers Gained',
  'Followers Lost',
  'Impressions Organic',
  'Impressions Paid',
  'Reactions',
  'Comments',
  'Shares',
  'Post Link Clicks',
  'Post Content Clicks',
  'Posts Sent Count',
  'Clicks',
  'Impressions',
  'Followers Count',
  'Engagements',
  'Engagement Rate (per Impression)',
  'Engagement Rate (per Follower)',
  'Click-Through Rate'
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
    
    // Calculate total engagements
    const engagements = 
      parseFloat(metrics["reactions"] || 0) + 
      parseFloat(metrics["comments_count"] || 0) + 
      parseFloat(metrics["shares_count"] || 0) + 
      parseFloat(metrics["post_link_clicks"] || 0) + 
      parseFloat(metrics["post_content_clicks"] || 0);
    
    const impressions = parseFloat(metrics["impressions"] || 0);
    const followersCount = parseFloat(metrics["lifetime_snapshot.followers_count"] || 0);
    
    // Calculate engagement rates
    const engagementRatePerImpression = impressions > 0 
      ? parseFloat(((engagements / impressions) * 100).toFixed(2))
      : 0;
      
    const engagementRatePerFollower = followersCount > 0 
      ? parseFloat(((engagements / followersCount) * 100).toFixed(2))
      : 0;
      
    const clickThroughRate = impressions > 0
      ? parseFloat(((parseFloat(metrics["post_link_clicks"] || 0) + parseFloat(metrics["post_content_clicks"] || 0)) / impressions * 100).toFixed(2))
      : 0;

    // Map the data in the correct order according to the sheet headers
    const row = [
      date,                                    // Date
      profileData.network_type,                // Network
      profileData.name,                        // Profile Name
      profileData.network_id,                  // Network ID
      profileData.customer_profile_id,         // Profile ID
      parseFloat(metrics["net_follower_growth"] || 0), // Net Follower Growth
      parseFloat(metrics["followers_gained"] || 0),    // Followers Gained
      parseFloat(metrics["followers_lost"] || 0),      // Followers Lost
      parseFloat(metrics["impressions_organic"] || 0), // Impressions Organic
      parseFloat(metrics["impressions_paid"] || 0),    // Impressions Paid
      parseFloat(metrics["reactions"] || 0),           // Reactions
      parseFloat(metrics["comments_count"] || 0),      // Comments
      parseFloat(metrics["shares_count"] || 0),        // Shares
      parseFloat(metrics["post_link_clicks"] || 0),    // Post Link Clicks
      parseFloat(metrics["post_content_clicks"] || 0), // Post Content Clicks
      parseFloat(metrics["posts_sent_count"] || 0),    // Posts Sent Count
      parseFloat(metrics["post_link_clicks"] || 0) + parseFloat(metrics["post_content_clicks"] || 0), // Clicks
      impressions,                             // Impressions
      followersCount,                          // Followers Count
      engagements,                             // Total Engagements
      engagementRatePerImpression,             // Engagement Rate (per Impression)
      engagementRatePerFollower,               // Engagement Rate (per Follower)
      clickThroughRate                         // Click-Through Rate
    ];

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
  isLinkedInType,
  setupHeaders,
  updateSheet
};

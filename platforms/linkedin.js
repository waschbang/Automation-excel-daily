/**
 * LinkedIn analytics processing module
 */
const { safeNumber } = require('../utils/api');

// Sheet configuration
const SHEET_NAME = 'Linkedin';

// Sheet headers
const HEADERS = [
  'Date',
  'Network',
  'Profile Name',
  'Network ID',
  'Profile ID',
  'Followers Count',
  'Net Follower Growth',
  'Followers Gained',
  'Followers Lost',
  'Impressions',
  'Impressions Organic',
  'Impressions Paid',
  'Reactions',
  'Comments',
  'Shares',
  'Clicks',
  'Post Link Clicks',
  'Post Content Clicks',
  'Posts Sent Count',
  'Engagements',
  'Engagement Rate (per Impression)',
  'Engagement Rate (per Follower)',
  'Click-Through Rate'
];

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
    
    const followers = safeNumber(metrics['lifetime_snapshot.followers_count']);
    const impressions = safeNumber(metrics['impressions']);
    const clicks = safeNumber(metrics['post_link_clicks']) + safeNumber(metrics['post_content_clicks_other']);
    
    // Calculate engagement metrics
    const engagements = 
      safeNumber(metrics['reactions']) + 
      safeNumber(metrics['comments_count']) + 
      safeNumber(metrics['shares_count']) + 
      clicks;
    
    const engagementRatePerFollower = followers > 0 
      ? parseFloat(((engagements / followers) * 100).toFixed(2)) 
      : 0;
      
    const engagementRatePerImpression = impressions > 0
      ? parseFloat(((engagements / impressions) * 100).toFixed(2))
      : 0;
      
    const clickThroughRate = impressions > 0
      ? parseFloat(((clicks / impressions) * 100).toFixed(2))
      : 0;
    
    const row = [
      date,
      profileData.network_type,
      profileData.name,
      profileData.network_id,
      profileData.profile_id,
      followers,
      safeNumber(metrics['net_follower_growth']),
      safeNumber(metrics['followers_gained']),
      safeNumber(metrics['followers_lost']),
      impressions,
      safeNumber(metrics['impressions_organic']),
      safeNumber(metrics['impressions_paid']),
      safeNumber(metrics['reactions']),
      safeNumber(metrics['comments_count']),
      safeNumber(metrics['shares_count']),
      clicks,
      safeNumber(metrics['post_link_clicks']),
      safeNumber(metrics['post_content_clicks']),
      safeNumber(metrics['posts_sent_count']),
      engagements,
      engagementRatePerImpression,
      engagementRatePerFollower,
      clickThroughRate
    ];

    return row;
  } catch (err) {
    console.error('Error formatting LinkedIn analytics data:', err.message);
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
  updateSheet
};

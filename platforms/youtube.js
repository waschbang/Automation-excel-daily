/**
 * YouTube analytics processing module
 */
const { safeNumber } = require('../utils/api');

// Sheet configuration
const SHEET_NAME = 'Youtube';

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
  'Posts Sent Count',
  'netFollowerGrowths',
  'videoEngagements',
  'videoViews'
];

/**
 * Format YouTube analytics data for Google Sheets
 * @param {Object} dataPoint - Data point from API
 * @param {Object} profileData - Profile metadata
 * @returns {Array|null} Formatted row for Google Sheets
 */
const formatAnalyticsData = (dataPoint, profileData) => {
  try {
    if (!dataPoint || !dataPoint.metrics) {
      console.error('Invalid YouTube data point received for formatting:', dataPoint);
      return null;
    }

    const metrics = dataPoint.metrics;
    const reportingPeriod = dataPoint.dimensions && 
      (dataPoint.dimensions['reporting_period.by(day)'] || dataPoint.dimensions.reporting_period);
    
    if (!reportingPeriod) {
      console.error('No reporting period found in YouTube dataPoint:', dataPoint);
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

    console.log('[Sheet2] Adding YouTube row:', row);
    return row;
  } catch (error) {
    console.error(`Error formatting YouTube analytics data: ${error.message}`);
    return null;
  }
};

/**
 * Setup YouTube sheet headers
 * @param {Object} sheetsUtil - Sheets utility module
 * @param {Object} auth - Google auth client
 * @param {string} spreadsheetId - Google Spreadsheet ID
 * @returns {Promise<boolean>} Success status
 */
const setupHeaders = async (sheetsUtil, auth, spreadsheetId) => {
  return sheetsUtil.setupSheetHeaders(auth, spreadsheetId, SHEET_NAME, HEADERS);
};

/**
 * Update YouTube sheet with data
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

/**
 * Instagram analytics processing module
 */
const { safeNumber } = require('../utils/api');

// Sheet configuration
const SHEET_NAME = 'Instagram';

// Sheet headers
const HEADERS = [
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
  'Engagement Rate (per Follower)'
];

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

    // Use dimensions.customer_profile_id for logging
    const customerProfileId = dataPoint.dimensions && dataPoint.dimensions.customer_profile_id;

    console.log('Formatting data point:', {
      reporting_period: dataPoint.reporting_period,
      customer_profile_id: customerProfileId,
      metrics: Object.keys(dataPoint.metrics)
    });

    const metrics = dataPoint.metrics;
    // Use reporting period from dimensions
    const reportingPeriod = dataPoint.dimensions && 
      (dataPoint.dimensions['reporting_period.by(day)'] || dataPoint.dimensions.reporting_period);
    
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
  updateSheet
};

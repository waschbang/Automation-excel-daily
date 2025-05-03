/**
 * Twitter analytics processing module
 */
const { safeNumber } = require('../utils/api');

// Sheet configuration
const SHEET_NAME = 'Twitter';
const PROFILE_ID = '6911594';

// Sheet headers
const HEADERS = [
  'Date',
  'Network',
  'Profile Name',
  'Network ID',
  'Profile ID',
  'Followers Count',
  'Net Follower Growth',
  'Impressions',
  'Post Media Views',
  'Video Views',
  'Reactions',
  'Likes',
  'Comments',
  'Shares',
  'Post Content Clicks',
  'Post Link Clicks',
  'Post Content Clicks Other',
  'Post Media Clicks',
  'Post Hashtag Clicks',
  'Post Detail Expand Clicks',
  'Post Profile Clicks',
  'Engagements Other',
  'Post App Engagements',
  'Post App Installs',
  'Post App Opens',
  'Posts Sent Count',
  'Posts Sent by Post Type',
  'Posts Sent by Content Type',
  'Engagements',
  'Engagement Rate (per Impression)',
  'Engagement Rate (per Follower)',
  'Click-Through Rate'
];

/**
 * Format Twitter analytics data for Google Sheets
 * @param {Object} dataPoint - Data point from API
 * @param {Object} profileData - Profile metadata
 * @returns {Array|null} Formatted row for Google Sheets
 */
const formatAnalyticsData = (dataPoint, profileData) => {
  try {
    if (!dataPoint || !dataPoint.metrics) {
      console.error('Invalid Twitter data point received for formatting:', dataPoint);
      return null;
    }

    const metrics = dataPoint.metrics;
    const reportingPeriod = dataPoint.dimensions && 
      (dataPoint.dimensions['reporting_period.by(day)'] || dataPoint.dimensions.reporting_period);
    
    if (!reportingPeriod) {
      console.error('No reporting period found in Twitter dataPoint:', dataPoint);
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

/**
 * Setup Twitter sheet headers
 * @param {Object} sheetsUtil - Sheets utility module
 * @param {Object} auth - Google auth client
 * @param {string} spreadsheetId - Google Spreadsheet ID
 * @returns {Promise<boolean>} Success status
 */
const setupHeaders = async (sheetsUtil, auth, spreadsheetId) => {
  return sheetsUtil.setupSheetHeaders(auth, spreadsheetId, SHEET_NAME, HEADERS);
};

/**
 * Update Twitter sheet with data
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
  PROFILE_ID,
  HEADERS,
  formatAnalyticsData,
  setupHeaders,
  updateSheet
};

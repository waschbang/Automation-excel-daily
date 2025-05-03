/**
 * Facebook analytics processing module
 */
const { safeNumber } = require('../utils/api');

// Sheet configuration
const SHEET_NAME = 'Facebook';

// Sheet headers
const HEADERS = [
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
  'video_views_unique',
  'posts_sent_count',
  'posts_sent_by_post_type',
  'posts_sent_by_content_type',
  'Engagements',
  'Engagement Rate (per Impression)',
  'Engagement Rate (per Follower)',
  'Click-Through Rate',
];

/**
 * Format Facebook analytics data for Google Sheets
 * @param {Object} dataPoint - Data point from API
 * @param {Object} profileData - Profile metadata
 * @returns {Array|null} Formatted row for Google Sheets
 */
const formatAnalyticsData = (dataPoint, profileData) => {
  try {
    const metrics = dataPoint.metrics;
    const reportingPeriod = dataPoint.dimensions && 
      (dataPoint.dimensions['reporting_period.by(day)'] || dataPoint.dimensions.reporting_period);
    
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
      safeNumber(metrics['lifetime_snapshot.followers_count']),
      safeNumber(metrics['net_follower_growth']),
      safeNumber(metrics['followers_gained']),
      safeNumber(metrics['followers_gained_organic']),
      safeNumber(metrics['followers_gained_paid']),
      safeNumber(metrics['followers_lost']),
      safeNumber(metrics['lifetime_snapshot.fans_count']),
      safeNumber(metrics['fans_gained']),
      safeNumber(metrics['fans_gained_organic']),
      safeNumber(metrics['fans_gained_paid']),
      safeNumber(metrics['fans_lost']),
      safeNumber(metrics['impressions']),
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
      safeNumber(metrics['impressions_unique']),
      safeNumber(metrics['impressions_organic_unique']),
      safeNumber(metrics['impressions_viral_unique']),
      safeNumber(metrics['impressions_nonviral_unique']),
      safeNumber(metrics['impressions_paid_unique']),
      safeNumber(metrics['reactions']),
      safeNumber(metrics['comments_count']),
      safeNumber(metrics['shares_count']),
      safeNumber(metrics['post_link_clicks']),
      safeNumber(metrics['post_content_clicks_other']),
      safeNumber(metrics['profile_actions']),
      safeNumber(metrics['post_engagements']),
      safeNumber(metrics['video_views']),
      safeNumber(metrics['video_views_organic']),
      safeNumber(metrics['video_views_paid']),
      safeNumber(metrics['video_views_autoplay']),
      safeNumber(metrics['video_views_click_to_play']),
      safeNumber(metrics['video_views_repeat']),
      safeNumber(metrics['video_view_time']),
      safeNumber(metrics['video_views_unique']),
      safeNumber(metrics['posts_sent_count']),
      safeNumber(metrics['posts_sent_by_post_type']),
      safeNumber(metrics['posts_sent_by_content_type']),
      engagements,
      engagementRatePerImpression,
      engagementRatePerFollower,
      clickThroughRate,
    ];
  } catch (err) {
    console.error('Error formatting Facebook analytics data:', err.message);
    return null;
  }
};

/**
 * Setup Facebook sheet headers
 * @param {Object} sheetsUtil - Sheets utility module
 * @param {Object} auth - Google auth client
 * @param {string} spreadsheetId - Google Spreadsheet ID
 * @returns {Promise<boolean>} Success status
 */
const setupHeaders = async (sheetsUtil, auth, spreadsheetId) => {
  return sheetsUtil.setupSheetHeaders(auth, spreadsheetId, SHEET_NAME, HEADERS);
};

/**
 * Update Facebook sheet with data
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

/**
 * Facebook analytics processing module
 */
const { safeNumber } = require('../utils/api');

// Sheet configuration
const SHEET_NAME = 'Facebook';

// Sheet headers
const HEADERS = [
  'Date',
  'Network Type',
  'Profile Name',
  'Network ID',
  'Profile ID',
  'Lifetime Followers Count',
  'Net Follower Growth',
  'New Followers Gained',
  'New Followers Gained (Organic)',
  'New Followers Gained (Paid)',
  'Followers Lost',
  'Lifetime Fans Count',
  'New Fans Gained',
  'New Fans Gained (Organic)',
  'New Fans Gained (Paid)',
  'Fans Lost',
  'Total Impressions',
  'Organic Impressions',
  'Viral Impressions',
  'Non-Viral Impressions',
  'Paid Impressions',
  'Total Tab Views',
  'Tab Views (Logged In)',
  'Tab Views (Logged Out)',
  'Total Post Impressions',
  'Post Impressions (Organic)',
  'Post Impressions (Viral)',
  'Post Impressions (Non-Viral)',
  'Post Impressions (Paid)',
  'Unique Impressions',
  'Unique Organic Impressions',
  'Unique Viral Impressions',
  'Unique Non-Viral Impressions',
  'Unique Paid Impressions',
  'Total Reactions',
  'Total Comments',
  'Total Shares',
  'Total Link Clicks',
  'Total Other Content Clicks',
  'Total Profile Actions',
  'Total Post Engagements',
  'Total Video Views',
  'Video Views (Organic)',
  'Video Views (Paid)',
  'Video Views (Autoplay)',
  'Video Views (Click-to-Play)',
  'Video Views (Repeat)',
  'Total Video View Time',
  'Unique Video Views',
  'Posts Published Count',
  'Posts by Post Type',
  'Posts by Content Type',
  'Total Engagement Actions',
  'Engagement Rate % (per Impression)',
  'Engagement Rate % (per Follower)',
  'Click-Through Rate %',
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
    
    // Calculate total engagement actions (Sprout's default Engagements calculation for Facebook)
    const engagements = 
      (parseFloat(metrics["reactions"] || 0)) + 
      (parseFloat(metrics["comments_count"] || 0)) + 
      (parseFloat(metrics["shares_count"] || 0)) + 
      parseFloat(postLinkClicks) + 
      parseFloat(otherClicks);
    
    // Calculate engagement rate as percentage of followers
    const engagementRatePerFollower = followers > 0 
      ? parseFloat(((engagements / followers) * 100).toFixed(2)) 
      : 0;
      
    // Calculate engagement rate as percentage of impressions
    const engagementRatePerImpression = impressions > 0
      ? parseFloat(((engagements / impressions) * 100).toFixed(2))
      : 0;
      
    // Calculate click-through rate as percentage of impressions
    const clickThroughRate = impressions > 0
      ? parseFloat(((postLinkClicks / impressions) * 100).toFixed(2))
      : 0;
    
    return [
      date,                                                // Date
      profileData ? profileData.network_type : '',           // Network Type
      profileData ? profileData.name : '',                   // Profile Name
      profileData ? profileData.network_id : '',             // Network ID
      dataPoint.dimensions.customer_profile_id || '',        // Profile ID
      safeNumber(metrics['lifetime_snapshot.followers_count']), // Lifetime Followers Count
      safeNumber(metrics['net_follower_growth']),            // Net Follower Growth
      safeNumber(metrics['followers_gained']),               // New Followers Gained
      safeNumber(metrics['followers_gained_organic']),       // New Followers Gained (Organic)
      safeNumber(metrics['followers_gained_paid']),          // New Followers Gained (Paid)
      safeNumber(metrics['followers_lost']),                 // Followers Lost
      safeNumber(metrics['lifetime_snapshot.fans_count']),   // Lifetime Fans Count
      safeNumber(metrics['fans_gained']),                    // New Fans Gained
      safeNumber(metrics['fans_gained_organic']),            // New Fans Gained (Organic)
      safeNumber(metrics['fans_gained_paid']),               // New Fans Gained (Paid)
      safeNumber(metrics['fans_lost']),                      // Fans Lost
      safeNumber(metrics['impressions']),                    // Total Impressions
      safeNumber(metrics['impressions_organic']),            // Organic Impressions
      safeNumber(metrics['impressions_viral']),              // Viral Impressions
      safeNumber(metrics['impressions_nonviral']),           // Non-Viral Impressions
      safeNumber(metrics['impressions_paid']),               // Paid Impressions
      safeNumber(metrics['tab_views']),                      // Total Tab Views
      safeNumber(metrics['tab_views_login']),                // Tab Views (Logged In)
      safeNumber(metrics['tab_views_logout']),               // Tab Views (Logged Out)
      safeNumber(metrics['post_impressions']),               // Total Post Impressions
      safeNumber(metrics['post_impressions_organic']),       // Post Impressions (Organic)
      safeNumber(metrics['post_impressions_viral']),         // Post Impressions (Viral)
      safeNumber(metrics['post_impressions_nonviral']),      // Post Impressions (Non-Viral)
      safeNumber(metrics['post_impressions_paid']),          // Post Impressions (Paid)
      safeNumber(metrics['impressions_unique']),             // Unique Impressions
      safeNumber(metrics['impressions_organic_unique']),     // Unique Organic Impressions
      safeNumber(metrics['impressions_viral_unique']),       // Unique Viral Impressions
      safeNumber(metrics['impressions_nonviral_unique']),    // Unique Non-Viral Impressions
      safeNumber(metrics['impressions_paid_unique']),        // Unique Paid Impressions
      safeNumber(metrics['reactions']),                      // Total Reactions
      safeNumber(metrics['comments_count']),                 // Total Comments
      safeNumber(metrics['shares_count']),                   // Total Shares
      safeNumber(metrics['post_link_clicks']),               // Total Link Clicks
      safeNumber(metrics['post_content_clicks_other']),      // Total Other Content Clicks
      safeNumber(metrics['profile_actions']),                // Total Profile Actions
      safeNumber(metrics['post_engagements']),               // Total Post Engagements
      safeNumber(metrics['video_views']),                    // Total Video Views
      safeNumber(metrics['video_views_organic']),            // Video Views (Organic)
      safeNumber(metrics['video_views_paid']),               // Video Views (Paid)
      safeNumber(metrics['video_views_autoplay']),           // Video Views (Autoplay)
      safeNumber(metrics['video_views_click_to_play']),      // Video Views (Click-to-Play)
      safeNumber(metrics['video_views_repeat']),             // Video Views (Repeat)
      safeNumber(metrics['video_view_time']),                // Total Video View Time
      safeNumber(metrics['video_views_unique']),             // Unique Video Views
      safeNumber(metrics['posts_sent_count']),               // Posts Published Count
      safeNumber(metrics['posts_sent_by_post_type']),        // Posts by Post Type
      safeNumber(metrics['posts_sent_by_content_type']),     // Posts by Content Type
      engagements,                                           // Total Engagement Actions
      engagementRatePerImpression,                           // Engagement Rate % (per Impression)
      engagementRatePerFollower,                             // Engagement Rate % (per Follower)
      clickThroughRate,                                      // Click-Through Rate %
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

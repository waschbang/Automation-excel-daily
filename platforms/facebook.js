/**
 * Facebook analytics processing module
 */
const { safeNumber } = require('../utils/api');

// Sheet configuration
const SHEET_NAME = 'Facebook';

// Sheet headers (identifiers + exact order requested)
const HEADERS = [
  'Date',
  'Network Type',
  'Profile Name',
  'Followers',
  'Net Follower Growth',
  'Followers Gained',
  'Organic Followers Gained',
  'Paid Followers Gained',
  'Page Unlikes',
  'Fans',
  'Page Likes',
  'Organic Page Likes',
  'Paid Page Likes',
  'Page Unlikes (Fans)',
  'Impressions',
  'Organic Impressions',
  'Viral Impressions',
  'Non-viral Impressions',
  'Paid Impressions',
  'Total Impressions',
  'Page Tab Views',
  'Logged In Page Tab Views',
  'Logged Out Page Tab Views',
  'Post Impressions',
  'Organic Post Impressions',
  'Viral Post Impressions',
  'Non-viral Post Impressions',
  'Paid Post Impressions',
  'Reach',
  'Organic Reach',
  'Viral Reach',
  'Non-viral Reach',
  'Paid Reach',
  'Reactions',
  'Comments',
  'Shares',
  'Post Link Clicks',
  'Other Post Clicks',
  'Page Actions',
  'Post Engagements',
  'Video Views',
  'Organic Video Views',
  'Paid Video Views',
  'Autoplay Video Views',
  'Click to Play Video Views',
  'Replayed Video Views',
  'Video View Time',
  'Unique Video Views',
  'Full Video Views',
  'Organic Full Video Views',
  'Paid Full Video Views',
  'Autoplay Full Video Views',
  'Click to Play Full Video Views',
  'Replayed Full Video Views',
  'Unique Full Video Views',
  'Partial Video Views',
  'Organic Partial Video Views',
  'Paid Partial Video Views',
  'Autoplay Partial Video Views',
  'Click to Play Partial Video Views',
  'Replayed Partial Video Views',
  'Posts Sent Count',
  'Posts Sent By Post Type',
  'Posts Sent By Content Type'
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
    
    // Build row exactly per requested headers
    const row = [
      date,                                                // Date
      profileData ? profileData.network_type : '',         // Network Type
      profileData ? profileData.name : '',                 // Profile Name
      safeNumber(metrics['lifetime_snapshot.followers_count']), // Followers
      safeNumber(metrics['net_follower_growth']),          // Net Follower Growth
      safeNumber(metrics['followers_gained']),             // Followers Gained
      safeNumber(metrics['followers_gained_organic']),     // Organic Followers Gained
      safeNumber(metrics['followers_gained_paid']),        // Paid Followers Gained
      safeNumber(metrics['followers_lost']),               // Page Unlikes
      safeNumber(metrics['lifetime_snapshot.fans_count']), // Fans
      safeNumber(metrics['fans_gained']),                  // Page Likes
      safeNumber(metrics['fans_gained_organic']),          // Organic Page Likes
      safeNumber(metrics['fans_gained_paid']),             // Paid Page Likes
      safeNumber(metrics['fans_lost']),                    // Page Unlikes (Fans)
      safeNumber(metrics['impressions']),                  // Impressions
      safeNumber(metrics['impressions_organic']),          // Organic Impressions
      safeNumber(metrics['impressions_viral']),            // Viral Impressions
      safeNumber(metrics['impressions_nonviral']),         // Non-viral Impressions
      safeNumber(metrics['impressions_paid']),             // Paid Impressions
      safeNumber(metrics['impressions_total']),            // Total Impressions
      safeNumber(metrics['tab_views']),                    // Page Tab Views
      safeNumber(metrics['tab_views_login']),              // Logged In Page Tab Views
      safeNumber(metrics['tab_views_logout']),             // Logged Out Page Tab Views
      safeNumber(metrics['post_impressions']),             // Post Impressions
      safeNumber(metrics['post_impressions_organic']),     // Organic Post Impressions
      safeNumber(metrics['post_impressions_viral']),       // Viral Post Impressions
      safeNumber(metrics['post_impressions_nonviral']),    // Non-viral Post Impressions
      safeNumber(metrics['post_impressions_paid']),        // Paid Post Impressions
      safeNumber(metrics['impressions_unique']),           // Reach
      safeNumber(metrics['impressions_organic_unique']),   // Organic Reach
      safeNumber(metrics['impressions_viral_unique']),     // Viral Reach
      safeNumber(metrics['impressions_nonviral_unique']),  // Non-viral Reach
      safeNumber(metrics['impressions_paid_unique']),      // Paid Reach
      safeNumber(metrics['reactions']),                    // Reactions
      safeNumber(metrics['comments_count']),               // Comments
      safeNumber(metrics['shares_count']),                 // Shares
      safeNumber(metrics['post_link_clicks']),             // Post Link Clicks
      safeNumber(metrics['post_content_clicks_other']),    // Other Post Clicks
      safeNumber(metrics['profile_actions']),              // Page Actions
      safeNumber(metrics['post_engagements']),             // Post Engagements
      safeNumber(metrics['video_views']),                  // Video Views
      safeNumber(metrics['video_views_organic']),          // Organic Video Views
      safeNumber(metrics['video_views_paid']),             // Paid Video Views
      safeNumber(metrics['video_views_autoplay']),         // Autoplay Video Views
      safeNumber(metrics['video_views_click_to_play']),    // Click to Play Video Views
      safeNumber(metrics['video_views_repeat']),           // Replayed Video Views
      safeNumber(metrics['video_view_time']),              // Video View Time
      safeNumber(metrics['video_views_unique']),           // Unique Video Views
      safeNumber(metrics['video_views_30s_complete']),     // Full Video Views
      safeNumber(metrics['video_views_30s_complete_organic']), // Organic Full Video Views
      safeNumber(metrics['video_views_30s_complete_paid']),    // Paid Full Video Views
      safeNumber(metrics['video_views_30s_complete_autoplay']), // Autoplay Full Video Views
      safeNumber(metrics['video_views_30s_complete_click_to_play']), // Click to Play Full Video Views
      safeNumber(metrics['video_views_30s_complete_repeat']), // Replayed Full Video Views
      safeNumber(metrics['video_views_30s_complete_unique']), // Unique Full Video Views
      safeNumber(metrics['video_views_partial']),          // Partial Video Views
      safeNumber(metrics['video_views_partial_organic']),  // Organic Partial Video Views
      safeNumber(metrics['video_views_partial_paid']),     // Paid Partial Video Views
      safeNumber(metrics['video_views_partial_autoplay']), // Autoplay Partial Video Views
      safeNumber(metrics['video_views_partial_click_to_play']), // Click to Play Partial Video Views
      safeNumber(metrics['video_views_partial_repeat']),   // Replayed Partial Video Views
      safeNumber(metrics['posts_sent_count']),             // Posts Sent Count
      metrics['posts_sent_by_post_type'] ? JSON.stringify(metrics['posts_sent_by_post_type']) : '', // Posts Sent By Post Type
      metrics['posts_sent_by_content_type'] ? JSON.stringify(metrics['posts_sent_by_content_type']) : '' // Posts Sent By Content Type
    ];

    return row;
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

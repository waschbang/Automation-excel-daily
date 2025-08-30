/**
 * Twitter/X analytics processing module - CORRECTED VERSION
 */
const { safeNumber } = require('../utils/api');

// Sheet configuration
const SHEET_NAME = 'Twitter';
const PROFILE_ID = '6911594';

// Sheet headers - aligned with available X metrics
const HEADERS = [
  'Date',
  'Network Type',
  'Profile Name',
  'Lifetime Followers Count',      // lifetime_snapshot.followers_count ✓
  'Net Follower Growth',           // net_follower_growth ✓
  'Total Impressions',             // impressions ✓
  'Total Media Views',             // post_media_views ✓ (Premium)
  'Total Video Views',             // video_views ✓
  'Total Reactions',               // reactions ✓
  'Total Likes',                   // likes ✓
  'Total Comments/Replies',        // comments_count ✓ (@replies)
  'Total Shares/Reposts',          // shares_count ✓ (reposts)
  'Total Content Clicks',          // post_content_clicks ✓
  'Total Link Clicks',             // post_link_clicks ✓
  'Total Other Content Clicks',    // post_content_clicks_other ✓
  'Total Media Clicks',            // post_media_clicks ✓ (Premium)
  'Total Hashtag Clicks',          // post_hashtag_clicks ✓ (Premium)
  'Total Expand Clicks',           // post_detail_expand_clicks ✓ (Premium)
  'Total Profile Clicks',          // post_profile_clicks ✓ (Premium)
  'Other Engagement Actions',      // engagements_other ✓
  'Total App Engagements',         // post_app_engagements ✓ (Premium)
  'Total App Installs',            // post_app_installs ✓ (Premium)
  'Total App Opens',               // post_app_opens ✓ (Premium)
  'Posts Published Count',         // posts_sent_count ✓
  'Posts by Post Type',            // posts_sent_by_post_type ✓ (Premium, JSON)
  'Posts by Content Type',         // posts_sent_by_content_type ✓ (Premium, JSON)
  'Total Engagement Actions',      // Calculated
  'Engagement Rate % (per Impression)', // Calculated
  'Engagement Rate % (per Follower)',   // Calculated
  'Click-Through Rate %'           // Calculated
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

    console.log('\n=== Twitter/X Data Point ===');
    console.log('Profile Data:', {
      name: profileData.name,
      network_type: profileData.network_type,
      network_id: profileData.network_id,
      customer_profile_id: profileData.customer_profile_id
    });
    
    console.log('\nRaw Metrics:', dataPoint.metrics);

    const metrics = dataPoint.metrics;
    const reportingPeriod = dataPoint.dimensions && 
      (dataPoint.dimensions['reporting_period.by(day)'] || dataPoint.dimensions.reporting_period);
    
    if (!reportingPeriod) {
      console.error('No reporting period found in Twitter dataPoint:', dataPoint);
      return null;
    }
    
    const date = new Date(reportingPeriod).toISOString().split('T')[0];
    
    // Extract numeric values safely
    const followers = safeNumber(metrics["lifetime_snapshot.followers_count"]);
    const impressions = safeNumber(metrics["impressions"]);
    const postLinkClicks = safeNumber(metrics["post_link_clicks"]);
    const otherClicks = safeNumber(metrics["post_content_clicks_other"]);
    const otherEngagements = safeNumber(metrics["engagements_other"]);
    const likes = safeNumber(metrics["likes"]);
    const comments = safeNumber(metrics["comments_count"]);
    const shares = safeNumber(metrics["shares_count"]);
    
    // Calculate total engagement actions (Sprout's default Engagements calculation for Twitter/X)
    const engagements = likes + comments + shares + postLinkClicks + otherClicks + otherEngagements;
    
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

    // Build the row with correct metric mapping
    const row = [
      date,                                                    // Date
      profileData ? profileData.network_type : '',            // Network Type
      profileData ? profileData.name : '',                    // Profile Name
      followers,                                               // Lifetime Followers Count
      safeNumber(metrics['net_follower_growth']),             // Net Follower Growth
      impressions,                                            // Total Impressions
      safeNumber(metrics['post_media_views']),                // Total Media Views (Premium)
      safeNumber(metrics['video_views']),                     // Total Video Views
      safeNumber(metrics['reactions']),                       // Total Reactions
      likes,                                                  // Total Likes
      comments,                                               // Total Comments/Replies
      shares,                                                 // Total Shares/Reposts
      safeNumber(metrics['post_content_clicks']),             // Total Content Clicks
      postLinkClicks,                                         // Total Link Clicks
      otherClicks,                                            // Total Other Content Clicks
      safeNumber(metrics['post_media_clicks']),               // Total Media Clicks (Premium)
      safeNumber(metrics['post_hashtag_clicks']),             // Total Hashtag Clicks (Premium)
      safeNumber(metrics['post_detail_expand_clicks']),       // Total Expand Clicks (Premium)
      safeNumber(metrics['post_profile_clicks']),             // Total Profile Clicks (Premium)
      otherEngagements,                                       // Other Engagement Actions
      safeNumber(metrics['post_app_engagements']),            // Total App Engagements (Premium)
      safeNumber(metrics['post_app_installs']),               // Total App Installs (Premium)
      safeNumber(metrics['post_app_opens']),                  // Total App Opens (Premium)
      safeNumber(metrics['posts_sent_count']),                // Posts Published Count
      // Handle JSON objects correctly
      metrics['posts_sent_by_post_type'] ? JSON.stringify(metrics['posts_sent_by_post_type']) : '',
      metrics['posts_sent_by_content_type'] ? JSON.stringify(metrics['posts_sent_by_content_type']) : '',
      engagements,                                            // Total Engagement Actions (Calculated)
      engagementRatePerImpression,                            // Engagement Rate % (per Impression)
      engagementRatePerFollower,                              // Engagement Rate % (per Follower)
      clickThroughRate                                        // Click-Through Rate %
    ];

    console.log('\n=== Twitter/X Row Mapping ===');
    row.forEach((value, index) => {
      console.log(`${index + 1}. ${HEADERS[index]}: ${value}`);
    });

    // Validate row length
    if (row.length !== HEADERS.length) {
      console.error(`❌ Row length mismatch! Headers: ${HEADERS.length}, Row: ${row.length}`);
      return null;
    }

    console.log(`✅ Twitter/X row validation passed: ${row.length} values for ${HEADERS.length} headers`);
    return row;

  } catch (err) {
    console.error('Error formatting Twitter analytics data:', err.message);
    console.error('Data point:', dataPoint);
    console.error('Profile data:', profileData);
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
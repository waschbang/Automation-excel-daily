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
  'Added On',
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
    
    // Create a mapping of our expected metrics to possible API field names
    const metricMapping = {
      // Followers metrics
      followers_count: ['lifetime_snapshot.followers_count', 'followers_count'],
      net_follower_growth: ['net_follower_growth'],
      followers_gained: ['followers_gained', 'followers_gained_organic'],
      followers_gained_organic: ['followers_gained_organic'],
      followers_gained_paid: ['followers_gained_paid'],
      followers_lost: ['followers_lost'],
      
      // Fans metrics
      fans_count: ['lifetime_snapshot.fans_count', 'fans_count'],
      fans_gained: ['fans_gained'],
      fans_gained_organic: ['fans_gained_organic'],
      fans_gained_paid: ['fans_gained_paid'],
      fans_lost: ['fans_lost'],
      
      // Impressions metrics
      impressions: ['impressions', 'post_impressions'],
      impressions_organic: ['impressions_organic'],
      impressions_viral: ['impressions_viral'],
      impressions_nonviral: ['impressions_nonviral'],
      impressions_paid: ['impressions_paid'],
      
      // Tab views
      tab_views: ['tab_views'],
      tab_views_login: ['tab_views_login'],
      tab_views_logout: ['tab_views_logout'],
      
      // Post impressions
      post_impressions: ['post_impressions'],
      post_impressions_organic: ['post_impressions_organic'],
      post_impressions_viral: ['post_impressions_viral'],
      post_impressions_nonviral: ['post_impressions_nonviral'],
      post_impressions_paid: ['post_impressions_paid'],
      
      // Unique impressions
      impressions_unique: ['impressions_unique'],
      impressions_organic_unique: ['impressions_organic_unique'],
      impressions_viral_unique: ['impressions_viral_unique'],
      impressions_nonviral_unique: ['impressions_nonviral_unique'],
      impressions_paid_unique: ['impressions_paid_unique'],
      
      // Engagement metrics
      reactions: ['reactions', 'post_engagements'],
      comments_count: ['comments_count', 'comments'],
      shares_count: ['shares_count', 'shares'],
      post_link_clicks: ['post_link_clicks'],
      post_content_clicks_other: ['post_content_clicks_other'],
      profile_actions: ['profile_actions'],
      post_engagements: ['post_engagements'],
      
      // Video metrics
      video_views: ['video_views'],
      video_views_organic: ['video_views_organic'],
      video_views_paid: ['video_views_paid'],
      video_views_autoplay: ['video_views_autoplay'],
      video_views_click_to_play: ['video_views_click_to_play'],
      video_views_repeat: ['video_views_repeat'],
      video_view_time: ['video_view_time'],
      video_views_unique: ['video_views_unique'],
      
      // Publishing metrics
      posts_sent_count: ['posts_sent_count', 'posts_published_count'],
      posts_sent_by_post_type: ['posts_sent_by_post_type'],
      posts_sent_by_content_type: ['posts_sent_by_content_type']
    };
    
    // Helper function to get the first available metric from the mapping
    const getMetric = (metricKey) => {
      const possibleKeys = metricMapping[metricKey] || [];
      for (const key of possibleKeys) {
        if (metrics[key] !== undefined) {
          console.log(`Using '${key}' for ${metricKey} with value: ${metrics[key]}`);
          return metrics[key];
        }
      }
      console.log(`No value found for ${metricKey}, using 0`);
      return 0;
    };
    
    // Log all available metrics for debugging
    console.log('\nAll available Facebook metrics keys:', Object.keys(metrics));
    
    // Get current timestamp for the 'Added On' column - use ISO format with local time
    const now = new Date();
    const currentTimestamp = now.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
    
    return [
      date,                                                // Date
      profileData ? profileData.network_type : '',           // Network Type
      profileData ? profileData.name : '',                   // Profile Name
      profileData ? profileData.network_id : '',             // Network ID
      dataPoint.dimensions.customer_profile_id || '',        // Profile ID
      currentTimestamp,                                      // Added On
      
      // Followers metrics
      safeNumber(getMetric('followers_count')),                // Lifetime Followers Count
      safeNumber(getMetric('net_follower_growth')),            // Net Follower Growth
      safeNumber(getMetric('followers_gained')),               // New Followers Gained
      safeNumber(getMetric('followers_gained_organic')),       // New Followers Gained (Organic)
      safeNumber(getMetric('followers_gained_paid')),          // New Followers Gained (Paid)
      safeNumber(getMetric('followers_lost')),                 // Followers Lost
      
      // Fans metrics
      safeNumber(getMetric('fans_count')),                     // Lifetime Fans Count
      safeNumber(getMetric('fans_gained')),                    // New Fans Gained
      safeNumber(getMetric('fans_gained_organic')),            // New Fans Gained (Organic)
      safeNumber(getMetric('fans_gained_paid')),               // New Fans Gained (Paid)
      safeNumber(getMetric('fans_lost')),                      // Fans Lost
      
      // Impressions metrics
      safeNumber(getMetric('impressions')),                    // Total Impressions
      safeNumber(getMetric('impressions_organic')),            // Organic Impressions
      safeNumber(getMetric('impressions_viral')),              // Viral Impressions
      safeNumber(getMetric('impressions_nonviral')),           // Non-Viral Impressions
      safeNumber(getMetric('impressions_paid')),               // Paid Impressions
      
      // Tab views metrics
      safeNumber(getMetric('tab_views')),                      // Total Tab Views
      safeNumber(getMetric('tab_views_login')),                // Tab Views (Logged In)
      safeNumber(getMetric('tab_views_logout')),               // Tab Views (Logged Out)
      
      // Post impressions metrics
      safeNumber(getMetric('post_impressions')),               // Total Post Impressions
      safeNumber(getMetric('post_impressions_organic')),       // Post Impressions (Organic)
      safeNumber(getMetric('post_impressions_viral')),         // Post Impressions (Viral)
      safeNumber(getMetric('post_impressions_nonviral')),      // Post Impressions (Non-Viral)
      safeNumber(getMetric('post_impressions_paid')),          // Post Impressions (Paid)
      
      // Unique impressions metrics
      safeNumber(getMetric('impressions_unique')),             // Unique Impressions
      safeNumber(getMetric('impressions_organic_unique')),     // Unique Organic Impressions
      safeNumber(getMetric('impressions_viral_unique')),       // Unique Viral Impressions
      safeNumber(getMetric('impressions_nonviral_unique')),    // Unique Non-Viral Impressions
      safeNumber(getMetric('impressions_paid_unique')),        // Unique Paid Impressions
      
      // Engagement metrics
      safeNumber(getMetric('reactions')),                      // Total Reactions
      safeNumber(getMetric('comments_count')),                 // Total Comments
      safeNumber(getMetric('shares_count')),                   // Total Shares
      safeNumber(getMetric('post_link_clicks')),               // Total Link Clicks
      safeNumber(getMetric('post_content_clicks_other')),      // Total Other Content Clicks
      safeNumber(getMetric('profile_actions')),                // Total Profile Actions
      safeNumber(getMetric('post_engagements')),               // Total Post Engagements
      
      // Video metrics
      safeNumber(getMetric('video_views')),                    // Total Video Views
      safeNumber(getMetric('video_views_organic')),            // Video Views (Organic)
      safeNumber(getMetric('video_views_paid')),               // Video Views (Paid)
      safeNumber(getMetric('video_views_autoplay')),           // Video Views (Autoplay)
      safeNumber(getMetric('video_views_click_to_play')),      // Video Views (Click to Play)
      safeNumber(getMetric('video_views_repeat')),             // Video Views (Repeat)
      safeNumber(getMetric('video_view_time')),                // Total Video View Time
      safeNumber(getMetric('video_views_unique')),             // Unique Video Views
      
      // Publishing metrics
      safeNumber(getMetric('posts_sent_count')),               // Posts Published Count
      safeNumber(getMetric('posts_sent_by_post_type')),        // Posts by Post Type
      safeNumber(getMetric('posts_sent_by_content_type')),     // Posts by Content Type
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

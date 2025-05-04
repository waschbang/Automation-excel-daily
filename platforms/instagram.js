/**
 * Instagram analytics processing module
 */
const { safeNumber } = require('../utils/api');

// Network types that should be processed as Instagram
const INSTAGRAM_NETWORK_TYPES = ['instagram', 'fb_instagram_account'];

// Sheet configuration
const SHEET_NAME = 'Instagram';

// Sheet headers
const HEADERS = [
  'Date',
  'Network Type',
  'Profile Name',
  'Network ID',
  'Profile ID',
  'Added On',
  'Total Impressions',
  'Unique Impressions',
  'Total Video Views',
  'Total Reactions',
  'Total Post Likes',
  'Total Comments',
  'Total Post Saves',
  'Total Shares',
  'Total Story Replies',
  'Posts Published Count',
  'Net Follower Growth',
  'New Followers Gained',
  'Followers Lost',
  'Lifetime Following Count',
  'Total Content Views',
  'Lifetime Followers Count',
  'Net Following Growth',
  'Total Engagement Actions',
  'Engagement Rate % (per Impression)',
  'Engagement Rate % (per Follower)'
];

/**
 * Check if the network type should be processed as Instagram
 * @param {string} networkType - Network type from the profile
 * @returns {boolean} True if the network type should be processed as Instagram
 */
const isInstagramType = (networkType) => {
  return INSTAGRAM_NETWORK_TYPES.includes(networkType);
};

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

    console.log('\n=== Instagram Data Point ===');
    console.log('Profile Data:', {
      name: profileData.name,
      network_type: profileData.network_type,
      network_id: profileData.network_id,
      customer_profile_id: profileData.customer_profile_id
    });
    
    console.log('\nRaw Metrics:', dataPoint.metrics);
    
    const metrics = dataPoint.metrics;
    const reportingPeriod = dataPoint.dimensions && (dataPoint.dimensions['reporting_period.by(day)'] || dataPoint.dimensions.reporting_period);
    if (!reportingPeriod) {
      console.error('No reporting period found in dataPoint:', dataPoint);
      return null;
    }
    const date = new Date(reportingPeriod).toISOString().split('T')[0];
    
    // Check for both 'saves' and 'post_saves' metrics as the API might return either
    const savesMetric = metrics["post_saves"] !== undefined ? "post_saves" : "saves";
    console.log(`Using ${savesMetric} for saves metric with value: ${metrics[savesMetric] || 0}`);
    
    // Check for both 'likes' and 'post_likes' metrics as the API might return either
    const likesMetric = metrics["post_likes"] !== undefined ? "post_likes" : "likes";
    console.log(`Using ${likesMetric} for likes metric with value: ${metrics[likesMetric] || 0}`);
    
    // Calculate total engagements using the correct metrics
    const engagements = (
      parseFloat(metrics[likesMetric] || 0) + 
      parseFloat(metrics["comments_count"] || 0) + 
      parseFloat(metrics["shares_count"] || 0) + 
      parseFloat(metrics[savesMetric] || 0) + 
      parseFloat(metrics["story_replies"] || 0)
    );

    const impressions = parseFloat(metrics["impressions"] || 0);
    const followersCount = parseFloat(metrics["lifetime_snapshot.followers_count"] || 0);
    
    // Calculate engagement rates
    const engagementRatePerImpression = impressions > 0 
      ? parseFloat(((engagements / impressions) * 100).toFixed(2))
      : 0;
      
    const engagementRatePerFollower = followersCount > 0 
      ? parseFloat(((engagements / followersCount) * 100).toFixed(2))
      : 0;

    // Create a mapping of our expected metrics to possible API field names
    const metricMapping = {
      // Impressions metrics
      impressions: ['impressions', 'post_impressions'],
      impressions_unique: ['impressions_unique', 'impressions_unique_users'],
      
      // Video metrics
      video_views: ['video_views', 'video_views_organic', 'video_views_total'],
      
      // Engagement metrics
      reactions: ['reactions', 'post_engagements', 'post_reactions'],
      post_likes: ['post_likes', 'likes', 'reactions'],
      comments_count: ['comments_count', 'comments'],
      post_saves: ['post_saves', 'saves'],
      shares_count: ['shares_count', 'shares'],
      story_replies: ['story_replies'],
      
      // Publishing metrics
      posts_sent_count: ['posts_sent_count', 'posts_published_count'],
      
      // Follower metrics
      net_follower_growth: ['net_follower_growth'],
      followers_gained: ['followers_gained', 'followers_gained_organic'],
      followers_lost: ['followers_lost'],
      following_count: ['following_count', 'lifetime_snapshot.following_count'],
      
      // Content metrics
      content_views: ['post_views', 'views', 'post_impressions'],
      
      // Followers count
      followers_count: ['lifetime_snapshot.followers_count', 'followers_count']
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
    console.log('\nAll available metrics keys:', Object.keys(metrics));
    
    // Map the data in the correct order according to the metrics
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
    
    const row = [
      date,                                    // Date
      profileData.network_type,                // Network Type
      profileData.name,                        // Profile Name
      profileData.network_id,                  // Network ID
      profileData.customer_profile_id,         // Profile ID
      currentTimestamp,                        // Added On
      
      // Impressions metrics
      safeNumber(getMetric('impressions')),             // Total Impressions
      safeNumber(getMetric('impressions_unique')),      // Unique Impressions
      
      // Video metrics
      safeNumber(getMetric('video_views')),             // Total Video Views
      
      // Engagement metrics
      safeNumber(getMetric('reactions')),               // Total Reactions
      safeNumber(getMetric('post_likes')),              // Total Post Likes
      safeNumber(getMetric('comments_count')),          // Total Comments
      safeNumber(getMetric('post_saves')),              // Total Post Saves
      safeNumber(getMetric('shares_count')),            // Total Shares
      safeNumber(getMetric('story_replies')),           // Total Story Replies
      
      // Publishing metrics
      safeNumber(getMetric('posts_sent_count')),        // Posts Published Count
      
      // Follower metrics
      safeNumber(getMetric('net_follower_growth')),     // Net Follower Growth
      safeNumber(getMetric('followers_gained')),        // New Followers Gained
      safeNumber(getMetric('followers_lost')),          // Followers Lost
      safeNumber(getMetric('following_count')),         // Lifetime Following Count
      safeNumber(getMetric('content_views')),           // Total Content Views
      safeNumber(getMetric('followers_count')),         // Lifetime Followers Count
      safeNumber(metrics["net_following_growth"] || 0),    // Net Following Growth
      
      // Calculated metrics
      engagements,                             // Total Engagement Actions
      engagementRatePerImpression,             // Engagement Rate % (per Impression)
      engagementRatePerFollower                // Engagement Rate % (per Follower)
    ];

    console.log('\nFormatted Row:', row.map((value, index) => ({
      header: HEADERS[index],
      value: value
    })));

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
  isInstagramType,
  setupHeaders,
  updateSheet
};

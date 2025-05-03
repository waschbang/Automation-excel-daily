/**
 * API utility functions for Sprout Social
 */
const axios = require('axios');

/**
 * Get headers for Sprout Social API requests
 * @param {string} token - API token
 * @returns {Object} Headers object with authorization and content type
 */
const getSproutHeaders = (token) => ({
  "Authorization": `Bearer ${token}`,
  "Content-Type": "application/json"
});

/**
 * Fetch profile data from Sprout Social metadata endpoint
 * @param {string} metadataUrl - Metadata endpoint URL
 * @param {string} token - API token
 * @param {Array} profileIds - Array of profile IDs to filter
 * @returns {Promise<Array>} Array of profile objects with normalized properties
 */
const getProfileData = async (metadataUrl, token, profileIds) => {
  try {
    console.log('[API CALL] Fetching profile metadata');
    const response = await axios.get(metadataUrl, { headers: getSproutHeaders(token) });
    
    if (!response.data || !response.data.data) {
      throw new Error('Invalid metadata response');
    }

    // Convert profile IDs to strings for comparison
    const profileIdsToMatch = profileIds.map(id => id.toString());
    const profiles = response.data.data.filter(profile => 
      profileIdsToMatch.includes(profile.customer_profile_id.toString())
    );

    if (profiles.length === 0) {
      throw new Error('No matching profiles found in metadata');
    }

    return profiles.map(profile => ({
      network_type: profile.network_type,
      name: profile.name,
      network_id: profile.native_id,
      profile_id: profile.customer_profile_id.toString(),
      native_name: profile.native_name,
      link: profile.link
    }));
  } catch (error) {
    console.error(`[ERROR] Error fetching profile metadata: ${error.message}`);
    if (error.response) {
      console.error('[API ERROR RESPONSE]', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
};

/**
 * Get analytics data from Sprout Social API with date chunking to avoid rate limits
 * @param {string} analyticsUrl - Analytics endpoint URL
 * @param {string} token - API token
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @param {Array} profileIds - Array of profile IDs to include
 * @returns {Promise<Array>} Array of analytics data points
 */
const getAnalyticsData = async (analyticsUrl, token, startDate, endDate, profileIds) => {
  console.log(`Processing data from ${startDate} to ${endDate}`);
  
  // Function to chunk the date range into 3-month periods
  const generateDateChunks = (start, end) => {
    const chunks = [];
    const startDate = new Date(start);
    const endDate = new Date(end);
    
    let currentStart = new Date(startDate);
    
    while (currentStart < endDate) {
      // Calculate end of this chunk (3 months from start)
      let currentEnd = new Date(currentStart);
      currentEnd.setMonth(currentEnd.getMonth() + 3);
      
      // If chunk end is after the overall end date, use the overall end date
      if (currentEnd > endDate) {
        currentEnd = new Date(endDate);
      }
      
      chunks.push({
        start: currentStart.toISOString().split('T')[0],
        end: currentEnd.toISOString().split('T')[0]
      });
      
      // Move to the next chunk start
      currentStart = new Date(currentEnd);
      currentStart.setDate(currentStart.getDate() + 1);
    }
    
    return chunks;
  };
  
  const dateChunks = generateDateChunks(startDate, endDate);
  console.log(`Processing data in ${dateChunks.length} chunks of 3 months each`);
  
  const allResults = { data: [] };
  const profileIdsStr = profileIds.join(', ');
  
  // Process each chunk
  for (let i = 0; i < dateChunks.length; i++) {
    const { start: chunkStart, end: chunkEnd } = dateChunks[i];
    const dateRange = `${chunkStart}...${chunkEnd}`;
    
    console.log(`Processing chunk ${i + 1}/${dateChunks.length}: ${dateRange}`);
    
    const payload = {
      "filters": [
        `customer_profile_id.eq(${profileIdsStr})`,
        `reporting_period.in(${dateRange})`
      ],
      "metrics": [
        "lifetime_snapshot.followers_count",
        "net_follower_growth",
        "followers_gained",
        "followers_gained_organic",
        "followers_gained_paid",
        "followers_lost",
        "lifetime_snapshot.fans_count",
        "fans_gained",
        "fans_gained_organic",
        "fans_gained_paid",
        "fans_lost",
        "impressions",
        "impressions_organic",
        "impressions_viral",
        "impressions_nonviral",
        "impressions_paid",
        "tab_views",
        "tab_views_login",
        "tab_views_logout",
        "post_impressions",
        "post_impressions_organic",
        "post_impressions_viral",
        "post_impressions_nonviral",
        "post_impressions_paid",
        "impressions_unique",
        "impressions_organic_unique",
        "impressions_viral_unique",
        "impressions_nonviral_unique",
        "impressions_paid_unique",
        "reactions",
        "comments_count",
        "shares_count",
        "post_link_clicks",
        "post_content_clicks_other",
        "profile_actions",
        "post_engagements",
        "video_views",
        "video_views_organic",
        "video_views_paid",
        "video_views_autoplay",
        "video_views_click_to_play",
        "video_views_repeat",
        "video_view_time",
        "video_views_unique",
        "posts_sent_count",
        "posts_sent_by_post_type",
        "posts_sent_by_content_type",
        "calculated_engagements"
      ],
      "page": 1
    };
    
    try {
      console.log(`Analytics API Request for ${dateRange}`);
      const response = await axios.post(analyticsUrl, payload, { headers: getSproutHeaders(token) });
      
      if (response.data && response.data.data && response.data.data.length > 0) {
        console.log(`Received ${response.data.data.length} data points for range ${dateRange}`);
        allResults.data = [...allResults.data, ...response.data.data];
      } else {
        console.warn(`No analytics data found for range ${dateRange}`);
      }
    } catch (error) {
      console.error(`Error getting analytics data for ${dateRange}: ${error.message}`);
      if (error.response) {
        console.error('API Error Response:', {
          status: error.response.status,
          data: JSON.stringify(error.response.data)
        });
      }
      
      // If we hit a rate limit, wait longer before continuing
      if (error.response && (error.response.status === 429 || error.response.status === 403)) {
        console.log('Rate limit hit, waiting 10 seconds before continuing...');
        await sleep(10000);
      }
    }
  }
  
  console.log(`Total data points collected: ${allResults.data.length}`);
  return allResults.data.length > 0 ? allResults : null;
};

/**
 * Helper function to pause execution for a specified time
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} Promise that resolves after the specified time
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Convert a value to a safe number (0 if not a valid number)
 * @param {any} val - Value to convert
 * @returns {number} Safe number value
 */
function safeNumber(val) {
  return (typeof val === 'number' && !isNaN(val)) ? val : 0;
}

module.exports = {
  getSproutHeaders,
  getProfileData,
  getAnalyticsData,
  sleep,
  safeNumber
};

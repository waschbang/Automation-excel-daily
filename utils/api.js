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
  
  // Filter out any empty or invalid profile IDs
  const validProfileIds = profileIds.filter(id => id && id.toString().trim() !== '');
  
  // Make sure we have valid profile IDs
  if (validProfileIds.length === 0) {
    console.error('No valid profile IDs provided');
    return null;
  }
  
  // Ensure the date range is one year or less as required by the API
  const startDateObj = new Date(startDate);
  const endDateObj = new Date(endDate);
  
  // Calculate the difference in milliseconds
  const dateDiff = endDateObj.getTime() - startDateObj.getTime();
  // Convert to days
  const daysDiff = dateDiff / (1000 * 60 * 60 * 24);
  
  // If the date range is more than 365 days, limit it to one year
  let effectiveEndDate = endDate;
  if (daysDiff > 365) {
    const oneYearLater = new Date(startDateObj);
    oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
    oneYearLater.setDate(oneYearLater.getDate() - 1); // Subtract one day to stay within one year
    effectiveEndDate = oneYearLater.toISOString().split('T')[0];
    console.log(`Date range exceeds one year. Limiting to: ${startDate} to ${effectiveEndDate}`);
  }
  
  console.log(`Processing data for range: ${startDate} to ${effectiveEndDate}`);
  console.log(`Using ${validProfileIds.length} valid profile IDs`);
  
  // Create individual API requests for each profile ID to ensure compatibility
  const allResults = { data: [] };
  
  // Process each profile ID individually to ensure API compatibility
  for (const profileId of validProfileIds) {
    try {
      console.log(`Processing analytics for profile ID: ${profileId}`);
      
      // Format the payload for an individual profile ID
      // The API expects dates in the format 'reporting_period.in(2024-01-01...2024-12-31)'
      const payload = {
        "filters": [
          `customer_profile_id.eq(${profileId})`,
          `reporting_period.in(${startDate}...${effectiveEndDate})`
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
          "calculated_engagements",
          "saves",
          "post_saves",
          "likes",
          "post_likes",
          "views",
          "post_views",
          "following_count"
        ],
        "page": 1
      };
      
      console.log(`Making API request for profile ID: ${profileId}`);
      console.log(`Using POST to ${analyticsUrl}`);
      
      const response = await axios.post(analyticsUrl, payload, { headers: getSproutHeaders(token) });
      
      if (response.data && response.data.data && response.data.data.length > 0) {
        console.log(`Received ${response.data.data.length} data points for profile ${profileId}`);
        allResults.data = [...allResults.data, ...response.data.data];
      } else {
        console.warn(`No analytics data found for profile ${profileId}`);
      }
      
      // Add a small delay between requests to avoid rate limiting with Sprout Social API
      console.log(`Waiting 1 second before processing the next profile...`);
      await sleep(1000);
      
    } catch (error) {
      console.error(`Error getting analytics data for profile ${profileId}: ${error.message}`);
      if (error.response) {
        console.error(`API Error Response for profile ${profileId}:`, {
          status: error.response.status,
          data: JSON.stringify(error.response.data)
        });
      }
    }
  }
  
  console.log(`Total data points collected across all profiles: ${allResults.data.length}`);
  return allResults.data.length > 0 ? allResults : null;
};

/**
 * Alternative implementation for getting analytics data with JSON payload
 */
const getAnalyticsDataWithJsonPayload = async (analyticsUrl, token, startDate, endDate, profileIds) => {
  // Filter out any empty or invalid profile IDs
  const validProfileIds = profileIds.filter(id => id && id.toString().trim() !== '');
  
  if (validProfileIds.length === 0) {
    console.error('No valid profile IDs provided');
    return null;
  }
  
  // Ensure date range is within one year
  let effectiveEndDate = endDate;
  const startDateObj = new Date(startDate);
  const endDateObj = new Date(endDate);
  const daysDiff = (endDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24);
  
  if (daysDiff > 365) {
    const oneYearLater = new Date(startDateObj);
    oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
    oneYearLater.setDate(oneYearLater.getDate() - 1);
    effectiveEndDate = oneYearLater.toISOString().split('T')[0];
  }
  
  // Use the original payload format that is known to work
  const payload = {
    "filters": [
      validProfileIds.length === 1 
        ? `customer_profile_id.eq(${validProfileIds[0]})` 
        : `customer_profile_id.in(${validProfileIds.join(',')})`,
      `reporting_period.between(${startDate},${effectiveEndDate})`
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
  
  const allResults = { data: [] };
  
  try {
    console.log(`Analytics API Request for ${startDate} to ${effectiveEndDate}`);
    console.log(`API Request Payload: ${JSON.stringify(payload, null, 2)}`);
    
    const response = await axios.post(analyticsUrl, payload, { headers: getSproutHeaders(token) });
    
    if (response.data && response.data.data && response.data.data.length > 0) {
      console.log(`Received ${response.data.data.length} data points for range ${startDate} to ${effectiveEndDate}`);
      allResults.data = [...allResults.data, ...response.data.data];
    } else {
      console.warn(`No analytics data found for range ${startDate} to ${effectiveEndDate}`);
      if (response.data) {
        console.log(`API Response: ${JSON.stringify(response.data, null, 2)}`);
      }
    }
  } catch (error) {
    console.error(`Error getting analytics data for ${startDate} to ${effectiveEndDate}: ${error.message}`);
    if (error.response) {
      console.error('API Error Response:', {
        status: error.response.status,
        data: JSON.stringify(error.response.data)
      });
      
      // Log more details about the request that failed
      console.error('Failed Request Details:', {
        url: analyticsUrl,
        payload: JSON.stringify(payload),
        headers: JSON.stringify(getSproutHeaders(token))
      });
    }
    
    // If we hit a rate limit, wait before continuing
    if (error.response && (error.response.status === 429 || error.response.status === 403)) {
      console.log('Rate limit hit, waiting 15 seconds before continuing...');
      await sleep(15000); // Reduced to 15 seconds for Sprout Social API
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
  getAnalyticsDataWithJsonPayload,
  sleep,
  safeNumber
};

/**
 * API utility functions for Sprout Social
 */
const axios = require('axios');

/**
 * Execute an axios request with exponential backoff and jitter
 * @param {Function} fn - async function returning axios response
 * @param {string} opName - operation name for logging
 * @param {number} maxRetries
 * @param {number} initialBackoff
 */
const requestWithRetry = async (fn, opName = 'request', maxRetries = 8, initialBackoff = 4000) => {
  let retries = 0;
  let backoff = initialBackoff;
  while (retries <= maxRetries) {
    try {
      return await fn();
    } catch (error) {
      retries++;
      const status = error?.response?.status;
      const dataStr = JSON.stringify(error?.response?.data || {});
      const isRateOrQuota = status === 429 || (dataStr && (dataStr.includes('rateLimit') || dataStr.includes('quota')));
      const isAuth = status === 401 || status === 403;
      const isServer = status >= 500 || !status; // network or 5xx

      if (retries > maxRetries) {
        console.error(`[Sprout] ${opName} failed after ${maxRetries} retries: ${error.message}`);
        return null; // never throw, to keep scripts running
      }

      let waitMs = backoff;
      const retryAfter = error?.response?.headers?.['retry-after'];
      if (retryAfter && !isNaN(parseInt(retryAfter, 10))) {
        waitMs = Math.max(waitMs, parseInt(retryAfter, 10) * 1000);
      }
      // add jitter +/-25%
      const jitter = waitMs * (0.25 * (Math.random() - 0.5) * 2);
      waitMs = Math.max(750, Math.floor(waitMs + jitter));

      if (isRateOrQuota) {
        console.log(`[Sprout] Rate/quota hit. Retrying ${opName} in ${Math.round(waitMs/1000)}s (attempt ${retries}/${maxRetries})`);
        await sleep(waitMs);
        backoff = Math.min(backoff * 2.2, 10 * 60 * 1000);
      } else if (isAuth) {
        console.log(`[Sprout] Auth error. Retrying ${opName} in ${Math.round(waitMs/1000)}s (attempt ${retries}/${maxRetries})`);
        await sleep(waitMs);
        backoff = Math.min(backoff * 2.0, 10 * 60 * 1000);
      } else if (isServer) {
        console.log(`[Sprout] Server/network error (${status || 'network'}). Retrying ${opName} in ${Math.round(waitMs/1000)}s (attempt ${retries}/${maxRetries})`);
        await sleep(waitMs);
        backoff = Math.min(backoff * 1.8, 10 * 60 * 1000);
      } else {
        console.log(`[Sprout] Error ${opName}: ${error.message}. Retrying in ${Math.round(waitMs/1000)}s (attempt ${retries}/${maxRetries})`);
        await sleep(waitMs);
        backoff = Math.min(backoff * 1.5, 10 * 60 * 1000);
      }
    }
  }
  return null;
};

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
    const response = await requestWithRetry(
      () => axios.get(metadataUrl, { headers: getSproutHeaders(token) }),
      'fetch profile metadata'
    );
    if (!response) return [];
    
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
      console.log(`\n=== API CALL: Processing analytics for profile ID: ${profileId} ===`);
      
      // Format the payload for an individual profile ID
      // The API expects dates in the format 'reporting_period.in(2024-01-01...2024-12-31)'
      const payload = {
        "filters": [
          `customer_profile_id.eq(${profileId})`,
          `reporting_period.in(${startDate}...${effectiveEndDate})`
        ],
        "metrics": [
          // Followers/Fans
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

          // Facebook Impressions/Reach/Post Impressions
          "impressions",
          "impressions_organic",
          "impressions_viral",
          "impressions_nonviral",
          "impressions_paid",
          "impressions_total",
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

          // Engagement and clicks
          "reactions",
          "comments_count",
          "shares_count",
          "post_content_clicks",
          "post_link_clicks",
          "post_content_clicks_other",
          "post_media_clicks",
          "post_hashtag_clicks",
          "post_detail_expand_clicks",
          "post_profile_clicks",
          "engagements_other",
          "profile_actions",
          "post_engagements",

          // Video metrics (FB)
          "post_media_views",
          "video_views",
          "video_views_organic",
          "video_views_paid",
          "video_views_autoplay",
          "video_views_click_to_play",
          "video_views_repeat",
          "video_view_time",
          "video_views_unique",
          "video_views_30s_complete",
          "video_views_30s_complete_organic",
          "video_views_30s_complete_paid",
          "video_views_30s_complete_autoplay",
          "video_views_30s_complete_click_to_play",
          "video_views_30s_complete_repeat",
          "video_views_30s_complete_unique",
          "video_views_partial",
          "video_views_partial_organic",
          "video_views_partial_paid",
          "video_views_partial_autoplay",
          "video_views_partial_click_to_play",
          "video_views_partial_repeat",

          // Posts/Content
          "posts_sent_count",
          "posts_sent_by_post_type",
          "posts_sent_by_content_type",

          // Twitter App interaction metrics (Premium)
          "post_app_engagements",
          "post_app_installs",
          "post_app_opens",

          // Instagram-specific additions used in platform mapping
          "lifetime_snapshot.following_count",
          "net_following_growth",
          "likes",
          "saves",
          "views",
          "story_replies"
        ],
        "page": 1
      };
      
      console.log(`Making API request for profile ID: ${profileId}`);
      console.log(`Using POST to ${analyticsUrl}`);
      
      const response = await requestWithRetry(
        () => axios.post(analyticsUrl, payload, { headers: getSproutHeaders(token) }),
        `analytics profile ${profileId}`
      );
      if (!response) {
        console.warn(`Skipping profile ${profileId} due to repeated request failures.`);
        // Add protective cool-down before next profile
        await sleep(1500 + Math.floor(Math.random()*1000));
        continue;
      }
      
      if (response.data && response.data.data && response.data.data.length > 0) {
        console.log(`Received ${response.data.data.length} data points for profile ${profileId}`);
        allResults.data = [...allResults.data, ...response.data.data];
      } else {
        console.warn(`No analytics data found for profile ${profileId}`);
      }
      
      // Safer delay between requests to avoid rate limiting (with jitter)
      const delayMs = 1200 + Math.floor(Math.random() * 800);
      console.log(`Delay ${delayMs}ms before next profile to avoid rate limits...`);
      await sleep(delayMs);
      
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
      // Followers/Fans
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

      // Facebook Impressions/Reach/Post Impressions
      "impressions",
      "impressions_organic",
      "impressions_viral",
      "impressions_nonviral",
      "impressions_paid",
      "impressions_total",
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

      // Engagement and clicks
      "reactions",
      "comments_count",
      "shares_count",
      "post_content_clicks",
      "post_link_clicks",
      "post_content_clicks_other",
      "post_media_clicks",
      "post_hashtag_clicks",
      "post_detail_expand_clicks",
      "post_profile_clicks",
      "engagements_other",
      "profile_actions",
      "post_engagements",

      // Video metrics (FB)
      "post_media_views",
      "video_views",
      "video_views_organic",
      "video_views_paid",
      "video_views_autoplay",
      "video_views_click_to_play",
      "video_views_repeat",
      "video_view_time",
      "video_views_unique",
      "video_views_30s_complete",
      "video_views_30s_complete_organic",
      "video_views_30s_complete_paid",
      "video_views_30s_complete_autoplay",
      "video_views_30s_complete_click_to_play",
      "video_views_30s_complete_repeat",
      "video_views_30s_complete_unique",
      "video_views_partial",
      "video_views_partial_organic",
      "video_views_partial_paid",
      "video_views_partial_autoplay",
      "video_views_partial_click_to_play",
      "video_views_partial_repeat",

      // Posts/Content
      "posts_sent_count",
      "posts_sent_by_post_type",
      "posts_sent_by_content_type",

      // Twitter App interaction metrics (Premium)
      "post_app_engagements",
      "post_app_installs",
      "post_app_opens",

      // Instagram-specific additions used in platform mapping
      "lifetime_snapshot.following_count",
      "net_following_growth",
      "likes",
      "saves",
      "views",
      "story_replies"
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
      const retryAfter = error.response.headers?.['retry-after'];
      const waitMs = retryAfter && !isNaN(parseInt(retryAfter,10)) ? parseInt(retryAfter,10)*1000 : 8000 + Math.floor(Math.random()*4000);
      console.log(`Rate limit hit, cooling down for ${Math.round(waitMs/1000)}s before continuing...`);
      await sleep(waitMs);
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
  requestWithRetry,
  sleep,
  safeNumber
};

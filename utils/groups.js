/**
 * Sprout Social Groups and Profiles API utilities
 */
const axios = require('axios');
const { getSproutHeaders } = require('./api');

/**
 * Get all customer groups from Sprout Social API
 * @param {string} baseUrl - Base API URL
 * @param {string} customerId - Customer ID
 * @param {string} token - API token
 * @returns {Promise<Array>} Array of group objects
 */
const getCustomerGroups = async (baseUrl, customerId, token) => {
  try {
    const url = `${baseUrl}/${customerId}/metadata/customer/groups`;
    console.log(`[API CALL] Fetching customer groups from: ${url}`);
    
    const response = await axios.get(url, { headers: getSproutHeaders(token) });
    
    if (response.data && response.data.data) {
      console.log(`Found ${response.data.data.length} customer groups`);
      return response.data.data;
    } else {
      console.warn('No customer groups found');
      return [];
    }
  } catch (error) {
    console.error(`Error fetching customer groups: ${error.message}`);
    if (error.response) {
      console.error('API Error Response:', {
        status: error.response.status,
        data: JSON.stringify(error.response.data)
      });
    }
    return [];
  }
};

/**
 * Get all profiles from Sprout Social API
 * @param {string} baseUrl - Base API URL
 * @param {string} customerId - Customer ID
 * @param {string} token - API token
 * @returns {Promise<Array>} Array of profile objects
 */
const getAllProfiles = async (baseUrl, customerId, token) => {
  try {
    const url = `${baseUrl}/${customerId}/metadata/customer`;
    console.log(`[API CALL] Fetching all profiles from: ${url}`);
    
    const response = await axios.get(url, { headers: getSproutHeaders(token) });
    
    if (response.data && response.data.data) {
      console.log(`Found ${response.data.data.length} profiles`);
      return response.data.data;
    } else {
      console.warn('No profiles found');
      return [];
    }
  } catch (error) {
    console.error(`Error fetching profiles: ${error.message}`);
    if (error.response) {
      console.error('API Error Response:', {
        status: error.response.status,
        data: JSON.stringify(error.response.data)
      });
    }
    return [];
  }
};

/**
 * Group profiles by their group ID
 * @param {Array} profiles - Array of profile objects
 * @param {Array} groups - Array of group objects
 * @returns {Object} Object with group IDs as keys and arrays of profiles as values
 */
const groupProfilesByGroup = (profiles, groups) => {
  const profilesByGroup = {};
  
  // Create a map of group IDs to group names for easier lookup
  const groupMap = {};
  groups.forEach(group => {
    if (group && group.group_id) {
      groupMap[group.group_id] = group.name;
      
      // Initialize the group in our result object
      profilesByGroup[group.group_id] = {
        groupName: group.name,
        profiles: []
      };
    }
  });
  
  // Create a default group for profiles without a group
  profilesByGroup['default'] = {
    groupName: 'Ungrouped Profiles',
    profiles: []
  };
  
  console.log(`Found ${profiles.length} profiles to organize into groups`);
  console.log(`Found ${Object.keys(groupMap).length} groups from API`);
  
  // Add profiles to their respective groups
  profiles.forEach(profile => {
    // In the API response, groups is an array of group IDs
    const groupIds = profile.groups || [];
    
    if (groupIds.length > 0) {
      // Add the profile to each of its groups
      let assigned = false;
      
      groupIds.forEach(groupId => {
        if (profilesByGroup[groupId]) {
          profilesByGroup[groupId].profiles.push(profile);
          assigned = true;
        }
      });
      
      // If the profile wasn't assigned to any valid group, add to default
      if (!assigned) {
        profilesByGroup['default'].profiles.push(profile);
      }
    } else {
      // No groups assigned, add to default group
      profilesByGroup['default'].profiles.push(profile);
    }
  });
  
  // Log group information for debugging
  console.log('Group information:');
  for (const [groupId, groupData] of Object.entries(profilesByGroup)) {
    console.log(`- Group ${groupData.groupName} (${groupId}): ${groupData.profiles.length} profiles`);
  }
  
  return profilesByGroup;
};

/**
 * Get profiles grouped by network type
 * @param {Array} profiles - Array of profile objects
 * @returns {Object} Object with network types as keys and arrays of profiles as values
 */
const groupProfilesByNetworkType = (profiles) => {
  const profilesByNetwork = {
    instagram: [],
    youtube: [],
    linkedin: [],
    facebook: [],
    twitter: []
  };
  
  // Map of Sprout network types to our simplified network types
  const networkTypeMapping = {
    'linkedin_company': 'linkedin',
    'fb_instagram_account': 'instagram',
    'fb_page': 'facebook',
    'youtube_channel': 'youtube',
    'twitter_profile': 'twitter'
  };
  
  profiles.forEach(profile => {
    // Get the original network type from the profile
    const originalNetworkType = profile.network_type;
    
    // Get our simplified network type from the mapping or use the lowercase original as fallback
    const mappedNetworkType = networkTypeMapping[originalNetworkType] || originalNetworkType.toLowerCase();
    
    // Log what network type we're processing
    console.log(`Mapping network type: ${originalNetworkType} → ${mappedNetworkType}`);
    
    // Add the profile to the appropriate network group if it exists
    if (profilesByNetwork[mappedNetworkType]) {
      profilesByNetwork[mappedNetworkType].push(profile);
    } else {
      console.log(`Unrecognized network type: ${originalNetworkType}. Profile not assigned to any network group.`);
    }
  });
  
  return profilesByNetwork;
};

module.exports = {
  getCustomerGroups,
  getAllProfiles,
  groupProfilesByGroup,
  groupProfilesByNetworkType
};

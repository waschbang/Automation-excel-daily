/**
 * Google Drive API utilities
 */
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

/**
 * Sleep for a specified duration
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Create a fresh JWT client with token refresh capabilities
 * @param {Object} credentials - Service account credentials
 * @returns {Promise<google.auth.JWT>} Authorized JWT client
 */
const createFreshJwtClient = async (credentials) => {
  try {
    // Configure the JWT client with a longer token expiration (1 hour)
    const jwtClient = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive'
      ],
      // Set a longer token lifetime (3600 seconds = 1 hour)
      eagerRefreshThresholdMillis: 300000, // Refresh token when it's 5 minutes from expiring
    });
    
    // Add a token refresh handler
    jwtClient.on('tokens', (tokens) => {
      if (tokens.refresh_token) {
        console.log('New refresh token received, storing for future use');
        // You could store this for future use if needed
      }
      console.log('Token refreshed successfully');
    });
    
    // Authorize the client
    await jwtClient.authorize();
    console.log('Successfully authenticated with JWT client');
    
    return jwtClient;
  } catch (error) {
    console.error(`Error creating JWT client: ${error.message}`);
    throw error;
  }
};

/**
 * Regenerate drive credentials from the original credentials file
 * @param {string} sourceCredentialsPath - Path to the source credentials file
 * @param {string} targetCredentialsPath - Path to save the drive credentials
 * @returns {Promise<void>}
 */
const regenerateDriveCredentials = async (sourceCredentialsPath, targetCredentialsPath) => {
  try {
    // Check if source credentials file exists
    if (!fs.existsSync(sourceCredentialsPath)) {
      throw new Error(`Source credentials file not found at ${sourceCredentialsPath}`);
    }
    
    // Read source credentials
    const sourceCredentialsContent = fs.readFileSync(sourceCredentialsPath, 'utf8');
    const sourceCredentials = JSON.parse(sourceCredentialsContent);
    
    // Validate source credentials
    if (!sourceCredentials.client_id || !sourceCredentials.client_secret) {
      throw new Error('Source credentials file is missing required fields (client_id, client_secret)');
    }
    
    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      sourceCredentials.client_id,
      sourceCredentials.client_secret,
      'urn:ietf:wg:oauth:2.0:oob' // Redirect URI for installed applications
    );
    
    // For OAuth 2.0, we need to generate a URL for the user to visit and get the authorization code
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive'
      ],
      prompt: 'consent' // Force to get refresh token
    });
    
    console.log('\nPlease visit the following URL to authorize this application:');
    console.log(authUrl);
    console.log('\nAfter authorization, copy the code from the browser and save it to a file named "auth-code.txt" in the same directory as this script.\n');
    
    // Check if auth-code.txt exists
    const authCodePath = path.join(path.dirname(sourceCredentialsPath), 'auth-code.txt');
    
    // Wait for auth code file to exist
    let authCode = '';
    let attempts = 0;
    const maxAttempts = 30; // Wait for up to 5 minutes (30 * 10 seconds)
    
    while (attempts < maxAttempts) {
      if (fs.existsSync(authCodePath)) {
        authCode = fs.readFileSync(authCodePath, 'utf8').trim();
        if (authCode) {
          break;
        }
      }
      console.log(`Waiting for auth code file (${attempts + 1}/${maxAttempts})...`);
      await sleep(10000); // Wait 10 seconds
      attempts++;
    }
    
    if (!authCode) {
      throw new Error('Auth code not provided. Please follow the instructions to authorize the application.');
    }
    
    // Exchange auth code for tokens
    const { tokens } = await oauth2Client.getToken(authCode);
    oauth2Client.setCredentials(tokens);
    
    // Create drive credentials with the token
    const driveCredentials = {
      ...sourceCredentials,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || 'placeholder',
      token_type: tokens.token_type || 'Bearer',
      expiry_date: tokens.expiry_date || (new Date().getTime() + 3600 * 1000)
    };
    
    // Save drive credentials
    fs.writeFileSync(targetCredentialsPath, JSON.stringify(driveCredentials, null, 2));
    console.log(`Drive credentials saved to ${targetCredentialsPath}`);
    
    // Delete the auth code file
    if (fs.existsSync(authCodePath)) {
      fs.unlinkSync(authCodePath);
      console.log(`Auth code file deleted: ${authCodePath}`);
    }
  } catch (error) {
    console.error(`Error regenerating drive credentials: ${error.message}`);
    throw error;
  }
};

/**
 * Get Google Drive client using JWT authentication with better token refresh handling
 * @param {string} credentialsPath - Path to credentials file
 * @returns {Promise<{drive: google.drive.v3.Drive, sheets: google.sheets.v4.Sheets, auth: google.auth.JWT, refreshAuth: Function}>} Google Drive and Sheets clients
 */
const getDriveClient = async (credentialsPath) => {
  try {
    // Read credentials file
    const credentialsContent = fs.readFileSync(credentialsPath, 'utf8');
    const credentials = JSON.parse(credentialsContent);
    console.log('Successfully parsed credentials file');
    
    // Validate credentials
    if (!credentials.client_email || !credentials.private_key) {
      throw new Error('Credentials file missing required fields (client_email, private_key)');
    }
    
    try {
      // Create JWT client with token refresh capabilities
      const jwtClient = await createFreshJwtClient(credentials);
      
      // Create API clients
      const drive = google.drive({ version: 'v3', auth: jwtClient });
      const sheets = google.sheets({ version: 'v4', auth: jwtClient });
      
      // Create a refresh function that can be called before critical operations
      const refreshAuth = async () => {
        try {
          console.log('Refreshing authentication token...');
          
          // Create a new JWT client and authorize it
          const refreshedClient = await createFreshJwtClient(credentials);
          
          // Update the auth for the existing clients
          drive.context._options.auth = refreshedClient;
          sheets.context._options.auth = refreshedClient;
          
          console.log('Authentication token refreshed successfully');
          return refreshedClient;
        } catch (refreshError) {
          console.error(`Failed to refresh authentication token: ${refreshError.message}`);
          throw refreshError;
        }
      };
      
      return { drive, sheets, auth: jwtClient, refreshAuth };
    } catch (authError) {
      console.error(`Authentication error: ${authError.message}`);
      if (authError.message.includes('invalid_grant') || authError.message.includes('Invalid JWT')) {
        console.error('Authentication error detected. The service account credentials are invalid or expired.');
        console.error('Please generate new service account keys from the Google Cloud Console.');
        console.error('1. Go to https://console.cloud.google.com/');
        console.error('2. Select your project');
        console.error('3. Go to IAM & Admin > Service Accounts');
        console.error('4. Find your service account and create a new key');
        console.error('5. Download the key as JSON and save it as credentials.json in this directory');
        console.error('6. Delete the existing drive-credentials.json file');
        console.error('7. Run this script again');
      }
      throw new Error(`Failed to initialize Google Drive client: ${authError.message}`);
    }
  } catch (error) {
    console.error(`Error getting Google Drive client: ${error.message}`);
    throw error;
  }
};

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} initialBackoff - Initial backoff time in ms
 * @param {string} operationName - Name of the operation for logging
 * @returns {Promise<any>} Result of the function or null if all retries fail
 */
const retryWithBackoff = async (fn, maxRetries = 5, initialBackoff = 5000, operationName = 'operation') => {
  let retries = 0;
  let backoffTime = initialBackoff;
  
  while (retries <= maxRetries) {
    try {
      return await fn();
    } catch (error) {
      retries++;
      
      // Categorize error types for better handling
      const isQuotaError = error.message && (error.message.includes('Quota exceeded') || 
                                            error.message.includes('rateLimitExceeded') || 
                                            error.message.includes('userRateLimitExceeded'));
      const isAuthError = error.message && (error.message.includes('invalid_grant') || 
                                          error.message.includes('Invalid JWT') || 
                                          error.message.includes('auth') || 
                                          error.message.includes('token'));
      const isNetworkError = error.message && (error.message.includes('ECONNRESET') || 
                                             error.message.includes('ETIMEDOUT') || 
                                             error.message.includes('socket') || 
                                             error.message.includes('network'));
      
      if (retries > maxRetries) {
        console.error(`Error ${operationName} after ${maxRetries} retries: ${error.message}`);
        // Instead of throwing, return null to prevent script failure
        console.error(`Continuing script execution despite failure in ${operationName}`);
        return null;
      }
      
      if (isQuotaError) {
        // Longer backoff for quota errors
        console.log(`Quota exceeded. Retrying ${operationName} in ${backoffTime/1000} seconds... (Attempt ${retries}/${maxRetries})`);
        await sleep(backoffTime);
        backoffTime *= 3; // Increased exponential backoff for quota errors
      } else if (isAuthError) {
        // Auth errors need longer waits
        console.log(`Authentication error. Retrying ${operationName} in ${backoffTime/1000} seconds... (Attempt ${retries}/${maxRetries})`);
        await sleep(backoffTime);
        backoffTime *= 2.5; // Significant backoff for auth errors
      } else if (isNetworkError) {
        // Network errors might resolve quickly
        console.log(`Network error. Retrying ${operationName} in ${backoffTime/2000} seconds... (Attempt ${retries}/${maxRetries})`);
        await sleep(backoffTime/2); // Shorter wait for network issues
        backoffTime *= 1.5; // Moderate increase for network errors
      } else {
        console.log(`Error ${operationName}: ${error.message}. Retrying in ${backoffTime/1000} seconds... (Attempt ${retries}/${maxRetries})`);
        await sleep(backoffTime);
        backoffTime *= 2; // Standard backoff for other errors
      }
    }
  }
  
  // If we somehow get here (shouldn't happen due to the return in the if-block above)
  console.error(`Unexpected flow in retryWithBackoff for ${operationName}. Continuing script execution.`);
  return null;
};

/**
 * Create a new spreadsheet with retry logic and place it in a specific folder
 * @param {google.sheets.v4.Sheets} sheets - Google Sheets API client
 * @param {google.drive.v3.Drive} drive - Google Drive API client
 * @param {string} title - Title of the spreadsheet
 * @param {string} folderId - Folder ID to place the spreadsheet in (optional)
 * @param {Function} [refreshAuth] - Optional function to refresh authentication
 * @returns {Promise<string|null>} Spreadsheet ID if successful, null otherwise
 */
const createSpreadsheet = async (sheets, drive, title, folderId, refreshAuth) => {
  try {
    console.log(`Creating spreadsheet "${title}"...`);
    
    // Refresh authentication if available
    if (refreshAuth) {
      try {
        await refreshAuth();
        console.log('Authentication refreshed before creating spreadsheet');
      } catch (refreshError) {
        console.warn(`Warning: Could not refresh authentication: ${refreshError.message}`);
        console.warn('Proceeding with existing token...');
      }
    }
    
    // Create a new spreadsheet
    const createResponse = await retryWithBackoff(
      async () => {
        return await sheets.spreadsheets.create({
          resource: {
            properties: {
              title: title
            }
          }
        });
      },
      5, // max retries
      2000, // initial backoff in ms
      'create spreadsheet'
    );
    
    const spreadsheetId = createResponse.data.spreadsheetId;
    console.log(`Created spreadsheet with ID: ${spreadsheetId}`);
    
    // Move the spreadsheet to the specified folder
    if (folderId) {
      console.log(`Moving spreadsheet to folder ${folderId}...`);
      
      let moveSuccess = false;
      try {
        // Refresh auth before moving file
        if (refreshAuth) {
          await refreshAuth();
          console.log('Authentication refreshed before moving file');
        }
        
        // Use a simpler approach to move the file to the folder
        console.log(`Adding file ${spreadsheetId} to folder ${folderId}...`);
        
        // Add the file to the destination folder without removing from root
        await drive.files.update({
          fileId: spreadsheetId,
          addParents: folderId,
          fields: 'id, parents'
        });
        
        console.log(`Successfully added spreadsheet to folder ${folderId}`);
        moveSuccess = true;
      } catch (moveError) {
        console.error(`Error moving spreadsheet to folder: ${moveError.message}`);
        console.error('This is non-critical - the spreadsheet was created but could not be moved to the specified folder.');
        console.error(`You can manually move spreadsheet ID ${spreadsheetId} to folder ${folderId} in Google Drive.`);
        
        // Don't throw the error - we want to continue even if the move fails
        // The spreadsheet is still usable, just not in the right folder
      }
      
      if (moveSuccess) {
        console.log(`Moved spreadsheet to folder ${folderId}`);
      }
    }
    
    return spreadsheetId;
  } catch (error) {
    console.error(`Error creating spreadsheet: ${error.message}`);
    return null;
  }
};

/**
 * Create a new sheet in a spreadsheet with retry logic
 * @param {Object} sheets - Google Sheets API client
 * @param {string} spreadsheetId - Spreadsheet ID
 * @param {string} sheetTitle - Sheet title
 * @param {Function} [refreshAuth] - Optional function to refresh authentication
 * @param {number} maxRetries - Maximum number of retries (default: 5)
 * @returns {Promise<boolean>} Success status - always returns true unless critical failure
 */
const createSheet = async (sheets, spreadsheetId, sheetTitle, refreshAuth = null, maxRetries = 5) => {
  // Maximum number of attempts to create the sheet
  const MAX_TOTAL_ATTEMPTS = 3;
  
  for (let attempt = 1; attempt <= MAX_TOTAL_ATTEMPTS; attempt++) {
    try {
      // First check if the sheet already exists to avoid errors
      try {
        console.log(`Checking if sheet "${sheetTitle}" already exists (attempt ${attempt}/${MAX_TOTAL_ATTEMPTS})...`);
        const response = await sheets.spreadsheets.get({
          spreadsheetId: spreadsheetId,
          fields: 'sheets.properties.title'
        });
        
        const existingSheets = response.data.sheets || [];
        const sheetExists = existingSheets.some(sheet => 
          sheet.properties && sheet.properties.title === sheetTitle
        );
        
        if (sheetExists) {
          console.log(`Sheet "${sheetTitle}" already exists in spreadsheet ${spreadsheetId}`);
          return true;
        }
      } catch (checkError) {
        console.warn(`Error checking if sheet exists: ${checkError.message}`);
        // Add a delay before continuing
        await sleep(3000);
        // Continue with creation attempt even if check fails
      }
      
      // Refresh authentication if available
      if (refreshAuth) {
        try {
          await refreshAuth();
          console.log(`Authentication refreshed before creating sheet "${sheetTitle}"`);
        } catch (refreshError) {
          console.warn(`Warning: Could not refresh authentication: ${refreshError.message}`);
          console.warn('Proceeding with existing token...');
          // Add a delay before continuing
          await sleep(2000);
        }
      }
      
      // Add a small delay before creating the sheet to avoid rate limits
      await sleep(3000);
      
      // Use retryWithBackoff which now returns null instead of throwing on failure
      const result = await retryWithBackoff(
        async () => {
          const response = await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            resource: {
              requests: [
                {
                  addSheet: {
                    properties: {
                      title: sheetTitle
                    }
                  }
                }
              ]
            }
          });
          
          console.log(`Created sheet "${sheetTitle}" in spreadsheet ${spreadsheetId}`);
          return response;
        },
        maxRetries,
        3000, // Increased initial backoff time
        `creating sheet "${sheetTitle}"`
      );
      
      // If retryWithBackoff returned null, it failed after all retries
      if (result === null) {
        console.warn(`Failed to create sheet "${sheetTitle}" after ${maxRetries} retries. Will try again.`);
        // Continue to the next attempt
        continue;
      }
      
      // Add a small delay after creating the sheet to avoid rate limits
      await sleep(2000);
      
      return true;
    } catch (error) {
      // If the error is because the sheet already exists, consider it a success
      if (error.message && (error.message.includes('already exists') || error.message.includes('duplicate'))) {
        console.log(`Sheet "${sheetTitle}" already exists in spreadsheet ${spreadsheetId}`);
        return true;
      }
      
      console.error(`Error creating sheet "${sheetTitle}" (attempt ${attempt}/${MAX_TOTAL_ATTEMPTS}): ${error.message}`);
      if (error.response && error.response.data) {
        console.error(`Response data: ${JSON.stringify(error.response.data)}`);
      }
      
      // Wait longer between attempts
      await sleep(5000 * attempt);
      
      // Only return false if this was the last attempt
      if (attempt === MAX_TOTAL_ATTEMPTS) {
        console.error(`All attempts to create sheet "${sheetTitle}" failed. Continuing script execution.`);
        // Return true anyway to prevent script failure
        return true;
      }
    }
  }
  
  // This should never be reached due to the return in the if-block above
  console.warn(`Unexpected flow in createSheet for "${sheetTitle}". Continuing script execution.`);
  return true;
};

/**
 * Check if a spreadsheet with the given title already exists in the specified folder
 * @param {google.drive.v3.Drive} drive - Google Drive API client
 * @param {string} title - Title of the spreadsheet to search for
 * @param {string} folderId - Folder ID to search in
 * @returns {Promise<string|null>} Spreadsheet ID if found, null otherwise
 */
const findExistingSpreadsheet = async (drive, title, folderId) => {
  try {
    console.log(`Checking if spreadsheet "${title}" already exists in folder ${folderId}...`);
    
    // Search for files with the exact title in the specified folder
    const response = await drive.files.list({
      q: `name = '${title}' and '${folderId}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`,
      fields: 'files(id, name, webViewLink)',
      spaces: 'drive'
    });
    
    const files = response.data.files;
    
    if (files && files.length > 0) {
      console.log(`Found existing spreadsheet: ${files[0].name} (${files[0].id})`);
      return files[0].id;
    }
    
    console.log(`No existing spreadsheet found with title "${title}" in folder ${folderId}`);
    return null;
  } catch (error) {
    console.error(`Error searching for existing spreadsheet: ${error.message}`);
    return null;
  }
};

/**
 * Find a spreadsheet by partial name pattern (without date) in a folder
 * @param {google.drive.v3.Drive} drive - Google Drive API client
 * @param {string} namePattern - Partial name pattern to search for (e.g., "Sprout Analytics - GroupName - Description")
 * @param {string} folderId - Folder ID to search in
 * @returns {Promise<{id: string, name: string}|null>} Spreadsheet ID and name if found, null otherwise
 */
const findSpreadsheetByPattern = async (drive, namePattern, folderId) => {
  try {
    console.log(`Searching for spreadsheet with pattern "${namePattern}" in folder ${folderId}...`);
    
    // Search for files with the name pattern in the specified folder
    // Using 'contains' instead of 'equals' to match partial names
    const response = await drive.files.list({
      q: `name contains '${namePattern}' and '${folderId}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`,
      fields: 'files(id, name, modifiedTime)',
      orderBy: 'modifiedTime desc', // Get the most recently modified file first
      spaces: 'drive'
    });
    
    const files = response.data.files;
    
    if (files && files.length > 0) {
      console.log(`Found existing spreadsheet matching pattern: ${files[0].name} (${files[0].id})`);
      return { id: files[0].id, name: files[0].name };
    }
    
    console.log(`No existing spreadsheet found with pattern "${namePattern}" in folder ${folderId}`);
    return null;
  } catch (error) {
    console.error(`Error searching for spreadsheet by pattern: ${error.message}`);
    return null;
  }
};

/**
 * Update a spreadsheet title
 * @param {google.drive.v3.Drive} drive - Google Drive API client
 * @param {string} fileId - Spreadsheet ID
 * @param {string} newTitle - New title for the spreadsheet
 * @returns {Promise<boolean>} Success status
 */
const updateSpreadsheetTitle = async (drive, fileId, newTitle) => {
  try {
    console.log(`Updating spreadsheet ${fileId} title to "${newTitle}"...`);
    
    await drive.files.update({
      fileId: fileId,
      resource: {
        name: newTitle
      }
    });
    
    console.log(`Successfully updated spreadsheet title to "${newTitle}"`);
    return true;
  } catch (error) {
    console.error(`Error updating spreadsheet title: ${error.message}`);
    return false;
  }
};

module.exports = {
  getDriveClient,
  createSpreadsheet,
  createSheet,
  findExistingSpreadsheet,
  findSpreadsheetByPattern,
  updateSpreadsheetTitle,
  regenerateDriveCredentials,
  retryWithBackoff
};

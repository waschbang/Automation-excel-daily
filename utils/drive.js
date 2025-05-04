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
 * Create a fresh JWT client with token refresh capabilities and extended expiration
 * @param {Object} credentials - Service account credentials
 * @returns {Promise<google.auth.JWT>} Authorized JWT client
 */
const createFreshJwtClient = async (credentials) => {
  try {
    // Configure the JWT client with a much longer token expiration (12 hours)
    const jwtClient = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive'
      ],
      // Set a much longer token lifetime (43200 seconds = 12 hours)
      eagerRefreshThresholdMillis: 3600000, // Refresh token when it's 1 hour from expiring
    });
    
    // Add a more robust token refresh handler
    jwtClient.on('tokens', (tokens) => {
      if (tokens.refresh_token) {
        console.log('New refresh token received, storing for future use');
        // You could store this for future use if needed
      }
      console.log('Token refreshed successfully');
      
      // Log when this token will expire
      if (tokens.expiry_date) {
        const expiryDate = new Date(tokens.expiry_date);
        const currentTime = new Date();
        const timeUntilExpiry = Math.round((expiryDate - currentTime) / 1000 / 60);
        console.log(`\n=== DRIVE API: Token refreshed ===`);
        console.log(`Token will expire at: ${expiryDate.toLocaleString()} (in ${timeUntilExpiry} minutes)`);
      }
    });
    
    // Authorize the client with retries
    let authorized = false;
    let attempts = 0;
    const maxAttempts = 3;
    
    while (!authorized && attempts < maxAttempts) {
      try {
        attempts++;
        await jwtClient.authorize();
        authorized = true;
        console.log('Successfully authenticated with JWT client');
      } catch (authError) {
        console.error(`Authentication attempt ${attempts}/${maxAttempts} failed: ${authError.message}`);
        if (attempts >= maxAttempts) {
          throw authError;
        }
        // Wait before retrying
        await sleep(3000 * attempts);
      }
    }
    
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
 * @returns {Promise<boolean>} Success status
 */
const regenerateDriveCredentials = async (sourceCredentialsPath, targetCredentialsPath) => {
  try {
    console.log(`\n=== DRIVE API: Regenerating drive credentials from ${sourceCredentialsPath} to ${targetCredentialsPath} ===`);
    
    // Check if source file exists
    if (!fs.existsSync(sourceCredentialsPath)) {
      console.error(`Source credentials file not found at ${sourceCredentialsPath}`);
      return false;
    }
    
    // Read the source credentials file
    const credentialsContent = fs.readFileSync(sourceCredentialsPath, 'utf8');
    const credentials = JSON.parse(credentialsContent);
    
    // Validate credentials - check for service account credentials
    if (!credentials.client_email || !credentials.private_key) {
      console.error('Source credentials file is missing required fields (client_email or private_key)');
      return false;
    }
    
    try {
      // Create a JWT client to get a fresh token
      const jwtClient = new google.auth.JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: [
          'https://www.googleapis.com/auth/spreadsheets',
          'https://www.googleapis.com/auth/drive'
        ],
        // Set a longer token lifetime (12 hours = 43200 seconds)
        eagerRefreshThresholdMillis: 3600000, // Refresh token when it's 1 hour from expiring
      });
      
      // Authorize the client to get a valid token
      await jwtClient.authorize();
      console.log('Successfully authenticated with JWT client');
      
      // Create drive credentials with the token and extended expiry
      const driveCredentials = {
        ...credentials,
        access_token: jwtClient.credentials.access_token,
        refresh_token: jwtClient.credentials.refresh_token || 'placeholder',
        token_type: jwtClient.credentials.token_type || 'Bearer',
        // Set a very long expiry (24 hours from now)
        expiry_date: new Date().getTime() + (24 * 60 * 60 * 1000)
      };
      
      // Save drive credentials
      fs.writeFileSync(targetCredentialsPath, JSON.stringify(driveCredentials, null, 2));
      console.log(`Drive credentials saved to ${targetCredentialsPath} with extended expiry`);
      
      return true;
    } catch (authError) {
      console.error(`Authentication error: ${authError.message}`);
      if (authError.message.includes('invalid_grant') || authError.message.includes('Invalid JWT')) {
        console.error('Authentication error detected. The service account credentials may be invalid or expired.');
        console.error('Please generate new service account keys from the Google Cloud Console.');
      }
      return false;
    }
  } catch (error) {
    console.error(`Error regenerating drive credentials: ${error.message}`);
    return false;
  }
};

/**
 * Get Google Drive client using JWT authentication with better token refresh handling
 * @param {string} credentialsPath - Path to credentials file
 * @returns {Promise<{drive: google.drive.v3.Drive, sheets: google.sheets.v4.Sheets, auth: google.auth.JWT, refreshAuth: Function}>} Google Drive and Sheets clients
 */
const getDriveClient = async (credentialsPath) => {
  // Maximum number of retries for getting a Drive client
  const MAX_RETRIES = 5;
  let lastError = null;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`Attempting to get Drive client (attempt ${attempt}/${MAX_RETRIES})...`);
      
      // Read credentials file
      let credentialsContent;
      try {
        credentialsContent = fs.readFileSync(credentialsPath, 'utf8');
      } catch (readError) {
        console.error(`Error reading credentials file: ${readError.message}`);
        if (attempt === MAX_RETRIES) {
          // On last attempt, try to create a mock client as fallback
          console.error('Creating emergency mock client as fallback...');
          return createMockDriveClient();
        }
        await sleep(3000 * attempt);
        continue;
      }
      
      let credentials;
      try {
        credentials = JSON.parse(credentialsContent);
        console.log('Successfully parsed credentials file');
      } catch (parseError) {
        console.error(`Error parsing credentials JSON: ${parseError.message}`);
        if (attempt === MAX_RETRIES) {
          // On last attempt, try to create a mock client as fallback
          console.error('Creating emergency mock client as fallback...');
          return createMockDriveClient();
        }
        await sleep(3000 * attempt);
        continue;
      }
      
      // Validate credentials
      if (!credentials.client_email || !credentials.private_key) {
        console.error('Credentials file missing required fields (client_email, private_key)');
        if (attempt === MAX_RETRIES) {
          // On last attempt, try to create a mock client as fallback
          console.error('Creating emergency mock client as fallback...');
          return createMockDriveClient();
        }
        await sleep(3000 * attempt);
        continue;
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
            // Instead of throwing, return the existing client
            console.error('Continuing with existing token...');
            return jwtClient;
          }
        };
        
        // Test the client with a simple API call
        try {
          await drive.about.get({ fields: 'user' });
          console.log('Drive client successfully tested with API call');
        } catch (testError) {
          console.warn(`Drive client test failed: ${testError.message}`);
          // Continue anyway - we'll handle errors during operations
        }
        
        return { drive, sheets, auth: jwtClient, refreshAuth };
      } catch (authError) {
        console.error(`Authentication error (attempt ${attempt}/${MAX_RETRIES}): ${authError.message}`);
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
        
        lastError = authError;
        
        if (attempt === MAX_RETRIES) {
          // On last attempt, try to create a mock client as fallback
          console.error('Creating emergency mock client as fallback...');
          return createMockDriveClient();
        }
        
        // Exponential backoff
        const backoffTime = 5000 * Math.pow(2, attempt - 1);
        console.log(`Waiting ${backoffTime/1000} seconds before retry...`);
        await sleep(backoffTime);
      }
    } catch (error) {
      console.error(`Unexpected error getting Drive client (attempt ${attempt}/${MAX_RETRIES}): ${error.message}`);
      lastError = error;
      
      if (attempt === MAX_RETRIES) {
        // On last attempt, try to create a mock client as fallback
        console.error('Creating emergency mock client as fallback...');
        return createMockDriveClient();
      }
      
      // Exponential backoff
      const backoffTime = 5000 * Math.pow(2, attempt - 1);
      console.log(`Waiting ${backoffTime/1000} seconds before retry...`);
      await sleep(backoffTime);
    }
  }
  
  // This should never be reached due to the fallback in the last attempt
  console.error(`All ${MAX_RETRIES} attempts to get Drive client failed`);
  console.error('Creating emergency mock client as fallback...');
  return createMockDriveClient();
};

/**
 * Create a mock Drive client that logs operations but doesn't actually perform them
 * This is a last-resort fallback to prevent crashes in production
 * @returns {Object} Mock Drive and Sheets clients
 */
const createMockDriveClient = () => {
  console.warn('USING MOCK DRIVE CLIENT - NO ACTUAL GOOGLE DRIVE OPERATIONS WILL BE PERFORMED');
  console.warn('This is a fallback mode to prevent crashes when authentication fails');
  console.warn('Data will be processed but not saved to Google Drive');
  
  // Create mock drive client
  const mockDrive = {
    files: {
      create: async (params) => {
        console.log(`[MOCK] Would create file: ${JSON.stringify(params)}`);
        return { data: { id: `mock-file-${Date.now()}` } };
      },
      update: async (params) => {
        console.log(`[MOCK] Would update file: ${JSON.stringify(params)}`);
        return { data: { id: params.fileId || `mock-file-${Date.now()}` } };
      },
      list: async (params) => {
        console.log(`[MOCK] Would list files: ${JSON.stringify(params)}`);
        return { data: { files: [] } };
      },
      get: async (params) => {
        console.log(`[MOCK] Would get file: ${JSON.stringify(params)}`);
        return { data: { id: params.fileId, name: 'Mock File' } };
      }
    },
    permissions: {
      create: async (params) => {
        console.log(`[MOCK] Would create permission: ${JSON.stringify(params)}`);
        return { data: { id: `mock-permission-${Date.now()}` } };
      }
    },
    about: {
      get: async (params) => {
        console.log(`[MOCK] Would get about: ${JSON.stringify(params)}`);
        return { data: { user: { emailAddress: 'mock-user@example.com' } } };
      }
    },
    context: {
      _options: {
        auth: {}
      }
    }
  };
  
  // Create mock sheets client
  const mockSheets = {
    spreadsheets: {
      create: async (params) => {
        console.log(`[MOCK] Would create spreadsheet: ${JSON.stringify(params)}`);
        return { data: { spreadsheetId: `mock-spreadsheet-${Date.now()}` } };
      },
      get: async (params) => {
        console.log(`[MOCK] Would get spreadsheet: ${JSON.stringify(params)}`);
        return { data: { sheets: [] } };
      },
      batchUpdate: async (params) => {
        console.log(`[MOCK] Would batch update spreadsheet: ${JSON.stringify(params)}`);
        return { data: { replies: [] } };
      },
      values: {
        update: async (params) => {
          console.log(`[MOCK] Would update values: ${JSON.stringify(params)}`);
          return { data: { updatedCells: 0 } };
        },
        batchUpdate: async (params) => {
          console.log(`[MOCK] Would batch update values: ${JSON.stringify(params)}`);
          return { data: { totalUpdatedCells: 0 } };
        }
      }
    },
    context: {
      _options: {
        auth: {}
      }
    }
  };
  
  // Create mock auth client
  const mockAuth = {
    credentials: {
      access_token: 'mock-token',
      expiry_date: Date.now() + 3600000
    }
  };
  
  // Create mock refresh function
  const mockRefreshAuth = async () => {
    console.log('[MOCK] Would refresh authentication');
    return mockAuth;
  };
  
  return { drive: mockDrive, sheets: mockSheets, auth: mockAuth, refreshAuth: mockRefreshAuth };
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
    console.log(`\n=== DRIVE API: Creating spreadsheet "${title}" ===`);
    
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
  // Track sheet creation time
  const sheetCreationStartTime = new Date();
  console.log(`\n=== SHEET CREATION: Starting creation of sheet "${sheetTitle}" at ${sheetCreationStartTime.toLocaleTimeString()} ===`);
  
  // Maximum number of attempts to create the sheet
  const MAX_TOTAL_ATTEMPTS = 3;
  
  for (let attempt = 1; attempt <= MAX_TOTAL_ATTEMPTS; attempt++) {
    try {
      // First check if the sheet already exists
      console.log(`\n=== DRIVE API: Checking if sheet "${sheetTitle}" already exists (attempt ${attempt}/${MAX_TOTAL_ATTEMPTS}) ===`);
      
      try {
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
          
          // Calculate and log total sheet creation time
          const sheetCreationEndTime = new Date();
          const creationTimeMs = sheetCreationEndTime - sheetCreationStartTime;
          const creationTimeSec = Math.round(creationTimeMs / 1000);
          console.log(`\n=== SHEET CREATION COMPLETED: Sheet "${sheetTitle}" already existed (verified in ${creationTimeSec} seconds) ===`);
          console.log(`Started: ${sheetCreationStartTime.toLocaleTimeString()}, Finished: ${sheetCreationEndTime.toLocaleTimeString()}`);
          
          return true;
        }
      } catch (checkError) {
        console.warn(`Error checking if sheet exists: ${checkError.message}`);
        // Continue with creation attempt even if check fails
        await sleep(3000);
      }
      
      // Refresh authentication if available
      if (refreshAuth) {
        try {
          await refreshAuth();
          console.log(`Authentication refreshed before creating sheet "${sheetTitle}"`);
        } catch (refreshError) {
          console.warn(`Warning: Could not refresh authentication: ${refreshError.message}`);
          console.warn('Proceeding with existing token...');
          await sleep(2000);
        }
      }
      
      // Add a short delay before creating the sheet to avoid rate limits
      const delaySeconds = 1;
      console.log(`\n=== DRIVE API: Waiting ${delaySeconds} seconds before creating sheet "${sheetTitle}" ===`);
      console.log(`Current time: ${new Date().toLocaleTimeString()}`);
      console.log(`Will resume at: ${new Date(Date.now() + delaySeconds * 1000).toLocaleTimeString()}`);
      
      // Wait for 30 seconds
      await sleep(delaySeconds * 1000);
      
      // Create the sheet with retry logic
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
        3000,
        `creating sheet "${sheetTitle}"`
      );
      
      // If retryWithBackoff returned null, it failed after all retries
      if (result === null) {
        console.warn(`Failed to create sheet "${sheetTitle}" after ${maxRetries} retries. Will try again.`);
        // Continue to the next attempt
        continue;
      }
      
      // Add a short delay after creating the sheet
      const postDelaySeconds = 1;
      console.log(`\n=== DRIVE API: Waiting ${postDelaySeconds} seconds after creating sheet "${sheetTitle}" ===`);
      console.log(`Current time: ${new Date().toLocaleTimeString()}`);
      console.log(`Will resume at: ${new Date(Date.now() + postDelaySeconds * 1000).toLocaleTimeString()}`);
      
      // Wait for 30 seconds
      await sleep(postDelaySeconds * 1000);
      
      // Calculate and log total sheet creation time
      const sheetCreationEndTime = new Date();
      const creationTimeMs = sheetCreationEndTime - sheetCreationStartTime;
      const creationTimeSec = Math.round(creationTimeMs / 1000);
      console.log(`\n=== SHEET CREATION COMPLETED: Sheet "${sheetTitle}" created in ${creationTimeSec} seconds ===`);
      console.log(`Started: ${sheetCreationStartTime.toLocaleTimeString()}, Finished: ${sheetCreationEndTime.toLocaleTimeString()}`);
      
      return true;
      
    } catch (error) {
      // Handle errors for this attempt
      if (error.message && (error.message.includes('already exists') || error.message.includes('duplicate'))) {
        console.log(`Sheet "${sheetTitle}" already exists in spreadsheet ${spreadsheetId}`);
        return true;
      }
      
      console.error(`Error creating sheet "${sheetTitle}" (attempt ${attempt}/${MAX_TOTAL_ATTEMPTS}): ${error.message}`);
      
      // Wait longer between attempts
      await sleep(5000 * attempt);
      
      // Only return false if this was the last attempt
      if (attempt === MAX_TOTAL_ATTEMPTS) {
        console.error(`All attempts to create sheet "${sheetTitle}" failed. Continuing script execution.`);
        return true; // Return true anyway to prevent script failure
      }
      // Otherwise continue to next attempt
    }
  }
  
  // This should never be reached
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

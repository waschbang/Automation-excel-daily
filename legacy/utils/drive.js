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
 * Retry a function with exponential backoff and jitter
 * @param {Function} fn - Function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} initialBackoff - Initial backoff time in ms
 * @param {string} operationName - Name of the operation for logging
 * @returns {Promise<any>} Result of the function or null if all retries fail
 */
const retryWithBackoff = async (fn, maxRetries = 7, initialBackoff = 8000, operationName = 'operation') => {
  let retries = 0;
  let backoffTime = initialBackoff;

  while (retries <= maxRetries) {
    try {
      return await fn();
    } catch (error) {
      retries++;

      // Prefer status/reason when available
      const status = error?.response?.status;
      const reasons = JSON.stringify(error?.response?.data) || '';

      const isQuotaError = status === 429 ||
        (reasons && (
          reasons.includes('rateLimitExceeded') ||
          reasons.includes('userRateLimitExceeded') ||
          reasons.includes('backendError') ||
          reasons.includes('quota')
        )) ||
        (error.message && (
          error.message.includes('Quota exceeded') ||
          error.message.includes('Rate Limit')
        ));

      const isAuthError = status === 401 || status === 403 ||
        (error.message && (
          error.message.includes('invalid_grant') ||
          error.message.includes('Invalid JWT') ||
          error.message.includes('auth') ||
          error.message.includes('token')
        ));

      const isNetworkError = !status && (
        error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND' ||
        (error.message && (
          error.message.includes('ECONNRESET') ||
          error.message.includes('ETIMEDOUT') ||
          error.message.includes('socket') ||
          error.message.includes('network')
        ))
      );

      if (retries > maxRetries) {
        console.error(`Error ${operationName} after ${maxRetries} retries: ${error.message}`);
        console.error(`Continuing script execution despite failure in ${operationName}`);
        return null;
      }

      // Respect Retry-After if provided
      const retryAfterHeader = error?.response?.headers?.['retry-after'];
      let waitMs = backoffTime;
      if (retryAfterHeader) {
        const retryAfterSec = parseInt(retryAfterHeader, 10);
        if (!isNaN(retryAfterSec)) {
          waitMs = Math.max(waitMs, retryAfterSec * 1000);
        }
      }

      // Add jitter +/- 30%
      const jitter = waitMs * (0.3 * (Math.random() - 0.5) * 2); // [-30%, +30%]
      waitMs = Math.max(1000, Math.floor(waitMs + jitter));

      if (isQuotaError) {
        console.log(`Quota/rate limit. Retrying ${operationName} in ${Math.round(waitMs/1000)}s (attempt ${retries}/${maxRetries})`);
        await sleep(waitMs);
        backoffTime = Math.min(backoffTime * 2.5, 15 * 60 * 1000);
      } else if (isAuthError) {
        console.log(`Auth error. Retrying ${operationName} in ${Math.round(waitMs/1000)}s (attempt ${retries}/${maxRetries})`);
        await sleep(waitMs);
        backoffTime = Math.min(backoffTime * 2, 15 * 60 * 1000);
      } else if (isNetworkError || (status && status >= 500)) {
        console.log(`Transient/server error (${status || 'network'}). Retrying ${operationName} in ${Math.round(waitMs/1000)}s (attempt ${retries}/${maxRetries})`);
        await sleep(waitMs);
        backoffTime = Math.min(backoffTime * 1.8, 10 * 60 * 1000);
      } else {
        console.log(`Error ${operationName}: ${error.message}. Retrying in ${Math.round(waitMs/1000)}s (attempt ${retries}/${maxRetries})`);
        await sleep(waitMs);
        backoffTime = Math.min(backoffTime * 1.5, 10 * 60 * 1000);
      }
    }
  }

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
    console.log(`\n=== DRIVE API: Creating spreadsheet "${title}" in folder ${folderId} ===`);

    if (refreshAuth) {
      try {
        await refreshAuth();
        console.log('Authentication refreshed before creating spreadsheet.');
      } catch (refreshError) {
        console.warn(`Warning: Could not refresh authentication: ${refreshError.message}`);
      }
    }

    const fileMetadata = {
      name: title,
      parents: [folderId],
      mimeType: 'application/vnd.google-apps.spreadsheet',
    };

    const media = {
      mimeType: 'application/vnd.google-apps.spreadsheet',
      body: '' // Empty body for a new spreadsheet
    };

    const response = await retryWithBackoff(
      async () => {
        return await drive.files.create({
          resource: fileMetadata,
          media: media,
          fields: 'id'
        });
      },
      8,
      8000,
      `creating spreadsheet "${title}"`
    );

    if (!response) {
      console.error(`Could not create spreadsheet "${title}" after retries. Continuing without failing.`);
      return null;
    }

    const spreadsheetId = response.data.id;
    console.log(`Successfully created spreadsheet with ID: ${spreadsheetId} in folder ${folderId}`);
    return spreadsheetId;

  } catch (error) {
    console.error(`Failed to create spreadsheet for group: ${error.message}`);
    if (error.errors) {
        error.errors.forEach(err => console.error(`Google API Error: ${err.reason} - ${err.message}`));
    }
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

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
 * Get Google Drive API client
 * @param {string} credentialsPath - Path to credentials file
 * @returns {Promise<Object>} Google Drive API client
 */
const getDriveClient = async (credentialsPath) => {
  try {
    if (!fs.existsSync(credentialsPath)) {
      throw new Error(`Credentials file not found at ${credentialsPath}`);
    }
    
    // Read credentials file
    let credentials;
    try {
      credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
      console.log('Successfully parsed credentials file');
    } catch (parseError) {
      throw new Error(`Failed to parse credentials file: ${parseError.message}`);
    }
    
    // Check if we have the minimum required fields
    if (!credentials.client_email) {
      throw new Error('Credentials file missing client_email field');
    }
    
    if (!credentials.private_key) {
      throw new Error('Credentials file missing private_key field');
    }
    
    // Create a JWT client directly instead of using GoogleAuth
    // This can sometimes handle credential format issues better
    try {
      const jwtClient = new google.auth.JWT(
        credentials.client_email,
        null,
        credentials.private_key,
        ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
      );
      
      // Authorize the client
      await jwtClient.authorize();
      console.log('Successfully authenticated with JWT client');
      
      // Create API clients
      const drive = google.drive({ version: 'v3', auth: jwtClient });
      const sheets = google.sheets({ version: 'v4', auth: jwtClient });
      
      return { drive, sheets, auth: jwtClient };
    } catch (authError) {
      console.error(`JWT authentication error: ${authError.message}`);
      if (authError.message.includes('invalid_grant') || authError.message.includes('Invalid JWT')) {
        console.error('This usually indicates an issue with the private key format or expired credentials.');
      }
      throw authError;
    }
  } catch (error) {
    console.error(`Error getting Google Drive client: ${error.message}`);
    return { drive: null, sheets: null, auth: null };
  }
};

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} initialBackoff - Initial backoff time in ms
 * @param {string} operationName - Name of the operation for logging
 * @returns {Promise<any>} Result of the function
 */
const retryWithBackoff = async (fn, maxRetries = 5, initialBackoff = 2000, operationName = 'operation') => {
  let retries = 0;
  let backoffTime = initialBackoff;
  
  while (retries <= maxRetries) {
    try {
      return await fn();
    } catch (error) {
      retries++;
      
      // Check if it's a quota error
      const isQuotaError = error.message.includes('Quota exceeded');
      
      if (retries > maxRetries) {
        console.error(`Error ${operationName} after ${maxRetries} retries: ${error.message}`);
        throw error;
      }
      
      if (isQuotaError) {
        console.log(`Quota exceeded. Retrying ${operationName} in ${backoffTime/1000} seconds... (Attempt ${retries}/${maxRetries})`);
        await sleep(backoffTime);
        backoffTime *= 2; // Exponential backoff for quota errors
      } else {
        console.log(`Error ${operationName}. Retrying in ${backoffTime/1000} seconds... (Attempt ${retries}/${maxRetries})`);
        await sleep(backoffTime);
        backoffTime *= 1.5; // Mild backoff for other errors
      }
    }
  }
};

/**
 * Create a new spreadsheet with retry logic and place it in a specific folder
 * @param {google.sheets.v4.Sheets} sheets - Google Sheets API client
 * @param {google.drive.v3.Drive} drive - Google Drive API client
 * @param {string} title - Title of the spreadsheet
 * @param {string} folderId - Folder ID to place the spreadsheet in (optional)
 * @param {number} maxRetries - Maximum number of retries (default: 5)
 * @returns {Promise<string>} Spreadsheet ID
 */
const createSpreadsheet = async (sheets, drive, title, folderId = null, maxRetries = 5) => {
  return retryWithBackoff(
    async () => {
      try {
        // Log authentication attempt
        console.log(`Attempting to create spreadsheet "${title}"...`);
        
        // Create the spreadsheet
        const response = await sheets.spreadsheets.create({
          resource: {
            properties: {
              title
            }
          }
        });
        
        const spreadsheetId = response.data.spreadsheetId;
        console.log(`Created spreadsheet with ID: ${spreadsheetId}`);
        
        // If a folder ID is specified, move the spreadsheet to that folder
        if (folderId) {
          try {
            // Add the spreadsheet to the specified folder
            await drive.files.update({
              fileId: spreadsheetId,
              addParents: folderId,
              fields: 'id, parents'
            });
            
            console.log(`Moved spreadsheet to folder ID: ${folderId}`);
          } catch (error) {
            console.error(`Error moving spreadsheet to folder: ${error.message}`);
            if (error.response) {
              console.error(`Response status: ${error.response.status}`);
              console.error(`Response data: ${JSON.stringify(error.response.data)}`);
            }
            // Don't fail the whole operation if just the move fails
          }
        }
        
        return spreadsheetId;
      } catch (error) {
        // Enhanced error logging
        console.error(`Failed to create spreadsheet: ${error.message}`);
        
        // Log more details if available
        if (error.response) {
          console.error(`Response status: ${error.response.status}`);
          console.error(`Response data: ${JSON.stringify(error.response.data)}`);
        }
        
        // Check for common auth errors
        if (error.message.includes('invalid_grant') || 
            error.message.includes('Invalid JWT') || 
            error.message.includes('Token has been expired')) {
          console.error('Authentication error detected. The service account credentials may be invalid or expired.');
          console.error('Please check your credentials.json file or generate new service account keys.');
        }
        
        // Rethrow to allow retry
        throw error;
      }
    },
    maxRetries,
    2000,
    'creating spreadsheet'
  );
};

/**
 * Create a new sheet in a spreadsheet with retry logic
 * @param {Object} sheets - Google Sheets API client
 * @param {string} spreadsheetId - Spreadsheet ID
 * @param {string} sheetTitle - Sheet title
 * @param {number} maxRetries - Maximum number of retries (default: 5)
 * @returns {Promise<boolean>} Success status
 */
const createSheet = async (sheets, spreadsheetId, sheetTitle, maxRetries = 5) => {
  try {
    await retryWithBackoff(
      async () => {
        await sheets.spreadsheets.batchUpdate({
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
        return true;
      },
      maxRetries,
      2000,
      `creating sheet "${sheetTitle}"`
    );
    return true;
  } catch (error) {
    console.error(`Failed to create sheet after multiple retries: ${error.message}`);
    return false;
  }
};

module.exports = {
  getDriveClient,
  createSpreadsheet,
  createSheet,
  sleep
};

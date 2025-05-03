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
    
    const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
    
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
    });
    
    const drive = google.drive({ version: 'v3', auth });
    const sheets = google.sheets({ version: 'v4', auth });
    
    return { drive, sheets, auth };
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
          // Don't fail the whole operation if just the move fails
        }
      }
      
      return spreadsheetId;
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

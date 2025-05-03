/**
 * Google Drive utilities
 */
const { google } = require('googleapis');
const fs = require('fs');

/**
 * Get Google Drive client using a credentials file
 * @param {string} credentialsPath - Path to the credentials file
 * @returns {Promise<Object>} Object containing drive, sheets, and auth clients
 */
const getDriveClient = async (credentialsPath) => {
  try {
    const content = fs.readFileSync(credentialsPath, 'utf8');
    const credentials = JSON.parse(content);
    
    return await getClientFromCredentials(credentials);
  } catch (error) {
    console.error(`Error getting Drive client: ${error.message}`);
    return { drive: null, sheets: null, auth: null };
  }
};

/**
 * Get Google Drive client using hardcoded credentials
 * @param {Object} credentials - The hardcoded credentials object
 * @returns {Promise<Object>} Object containing drive, sheets, and auth clients
 */
const getDriveClientWithCredentials = async (credentials) => {
  try {
    return await getClientFromCredentials(credentials);
  } catch (error) {
    console.error(`Error getting Drive client with hardcoded credentials: ${error.message}`);
    return { drive: null, sheets: null, auth: null };
  }
};

/**
 * Helper function to get client from credentials
 * @param {Object} credentials - The credentials object
 * @returns {Promise<Object>} Object containing drive, sheets, and auth clients
 */
const getClientFromCredentials = async (credentials) => {
  // Create JWT client
  const auth = new google.auth.JWT(
    credentials.client_email,
    null,
    credentials.private_key,
    [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/spreadsheets'
    ]
  );
  
  // Authorize the client
  await auth.authorize();
  
  // Create Drive and Sheets clients
  const drive = google.drive({ version: 'v3', auth });
  const sheets = google.sheets({ version: 'v4', auth });
  
  return { drive, sheets, auth };
};

/**
 * Create a new spreadsheet in Google Drive
 * @param {Object} sheets - Google Sheets API client
 * @param {Object} drive - Google Drive API client
 * @param {string} title - Title of the spreadsheet
 * @param {string} folderId - Folder ID where the spreadsheet should be created
 * @returns {Promise<string>} Spreadsheet ID
 */
const createSpreadsheet = async (sheets, drive, title, folderId) => {
  try {
    // Create a new spreadsheet
    const response = await sheets.spreadsheets.create({
      resource: {
        properties: {
          title: title
        }
      }
    });
    
    const spreadsheetId = response.data.spreadsheetId;
    
    // Move the spreadsheet to the specified folder
    if (folderId) {
      await drive.files.update({
        fileId: spreadsheetId,
        addParents: folderId,
        removeParents: 'root',
        fields: 'id, parents'
      });
    }
    
    console.log(`Created spreadsheet with ID: ${spreadsheetId}`);
    return spreadsheetId;
  } catch (error) {
    console.error(`Error creating spreadsheet: ${error.message}`);
    return null;
  }
};

/**
 * Create a new sheet in a spreadsheet
 * @param {Object} sheets - Google Sheets API client
 * @param {string} spreadsheetId - Spreadsheet ID
 * @param {string} sheetName - Name of the sheet to create
 * @returns {Promise<number>} Sheet ID
 */
const createSheet = async (sheets, spreadsheetId, sheetName) => {
  try {
    const response = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: {
        requests: [
          {
            addSheet: {
              properties: {
                title: sheetName
              }
            }
          }
        ]
      }
    });
    
    const sheetId = response.data.replies[0].addSheet.properties.sheetId;
    console.log(`Created sheet "${sheetName}" with ID: ${sheetId}`);
    return sheetId;
  } catch (error) {
    console.error(`Error creating sheet "${sheetName}": ${error.message}`);
    return null;
  }
};

/**
 * Update cell values in a sheet
 * @param {Object} sheets - Google Sheets API client
 * @param {string} spreadsheetId - Spreadsheet ID
 * @param {string} range - Range to update (e.g., "Sheet1!A1:D10")
 * @param {Array} values - 2D array of values to update
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
const updateValues = async (sheets, spreadsheetId, range, values) => {
  try {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values
      }
    });
    
    console.log(`Updated range ${range}`);
    return true;
  } catch (error) {
    console.error(`Error updating range ${range}: ${error.message}`);
    return false;
  }
};

/**
 * Sleep for a specified number of milliseconds
 * @param {number} ms - Number of milliseconds to sleep
 * @returns {Promise<void>}
 */
const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

module.exports = {
  getDriveClient,
  getDriveClientWithCredentials,
  createSpreadsheet,
  createSheet,
  updateValues,
  sleep
};

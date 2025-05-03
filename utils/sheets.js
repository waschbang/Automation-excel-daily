/**
 * Google Sheets utility functions
 */
const { google } = require('googleapis');
const fs = require('fs');
const sheets = google.sheets('v4');

/**
 * Authenticate with Google Sheets API
 * @param {string} credentialsPath - Path to credentials JSON file
 * @returns {Promise<Object>} Google auth client
 */
const getGoogleAuth = async (credentialsPath) => {
  try {
    const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
    const { client_email, private_key } = credentials;
    
    const auth = new google.auth.JWT(
      client_email,
      null,
      private_key,
      ['https://www.googleapis.com/auth/spreadsheets']
    );
    
    await auth.authorize();
    console.log('Successfully authenticated with Google Sheets API');
    return auth;
  } catch (error) {
    console.error(`Error authenticating with Google: ${error.message}`);
    return null;
  }
};

/**
 * Create a sheet if it doesn't exist
 * @param {Object} auth - Google auth client
 * @param {string} spreadsheetId - Google Spreadsheet ID
 * @param {string} sheetName - Name of the sheet to create
 * @returns {Promise<boolean>} Success status
 */
const createSheetIfNotExists = async (auth, spreadsheetId, sheetName) => {
  try {
    // First check if sheet exists
    const response = await sheets.spreadsheets.get({
      auth,
      spreadsheetId,
    });

    const sheetExists = response.data.sheets.some(sheet => 
      sheet.properties.title === sheetName
    );

    if (!sheetExists) {
      console.log(`Creating new sheet: ${sheetName}`);
      await sheets.spreadsheets.batchUpdate({
        auth,
        spreadsheetId,
        resource: {
          requests: [{
            addSheet: {
              properties: {
                title: sheetName
              }
            }
          }]
        }
      });
      console.log(`Successfully created sheet: ${sheetName}`);
    } else {
      console.log(`Sheet ${sheetName} already exists`);
    }
    return true;
  } catch (error) {
    console.error(`Error creating sheet ${sheetName}:`, error.message);
    return false;
  }
};

/**
 * Update sheet with headers
 * @param {Object} auth - Google auth client
 * @param {string} spreadsheetId - Google Spreadsheet ID
 * @param {string} sheetName - Name of the sheet
 * @param {Array} headers - Array of header values
 * @returns {Promise<boolean>} Success status
 */
const setupSheetHeaders = async (auth, spreadsheetId, sheetName, headers) => {
  try {
    const lastCol = getColumnLetter(headers.length);
    const headerRange = `${sheetName}!A1:${lastCol}1`;
    
    console.log(`Updating ${sheetName} headers with new columns`);
    await sheets.spreadsheets.values.update({
      auth,
      spreadsheetId,
      range: headerRange,
      valueInputOption: 'RAW',
      resource: {
        values: [headers]
      }
    });
    console.log(`${sheetName} headers updated successfully`);
    return true;
  } catch (error) {
    console.error(`Error setting up ${sheetName} headers: ${error.message}`);
    return false;
  }
};

/**
 * Update Google Sheet with data rows
 * @param {Object} auth - Google auth client
 * @param {string} spreadsheetId - Google Spreadsheet ID
 * @param {Array} rows - Array of data rows
 * @param {string} sheetName - Name of the sheet to update
 * @returns {Promise<boolean>} Success status
 */
const updateSheet = async (auth, spreadsheetId, rows, sheetName) => {
  if (!rows || rows.length === 0) {
    console.warn('No data to update in sheet');
    return false;
  }

  try {
    console.log('Updating sheet with rows:', rows.length);
    console.log('First row sample:', rows[0]);

    const response = await sheets.spreadsheets.values.get({
      auth,
      spreadsheetId,
      range: `${sheetName}!A:A`,
    });

    const nextRow = (response.data.values ? response.data.values.length : 0) + 1;
    const lastRow = nextRow + rows.length - 1;
    const lastCol = getColumnLetter(rows[0].length);

    console.log('Sheet update details:', {
      nextRow,
      lastRow,
      columnCount: rows[0].length,
      rowCount: rows.length
    });

    const updateResponse = await sheets.spreadsheets.values.update({
      auth,
      spreadsheetId,
      range: `${sheetName}!A${nextRow}:${lastCol}${lastRow}`,
      valueInputOption: 'RAW',
      resource: {
        values: rows
      }
    });

    console.log('Sheet update response:', updateResponse.data);
    console.log(`Updated ${updateResponse.data.updatedRows} rows starting from row ${nextRow}`);
    return true;
  } catch (error) {
    console.error(`Error updating sheet: ${error.message}`);
    if (error.response && error.response.data) {
      console.error('Sheet API Error:', error.response.data);
    }
    return false;
  }
};

/**
 * Convert column number to letter (A, B, C, ..., AA, AB, etc.)
 * @param {number} colNum - Column number (1-based)
 * @returns {string} Column letter
 */
const getColumnLetter = (colNum) => {
  let temp = colNum;
  let letter = '';
  while (temp > 0) {
    let rem = (temp - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    temp = Math.floor((temp - 1) / 26);
  }
  return letter;
};

module.exports = {
  getGoogleAuth,
  createSheetIfNotExists,
  setupSheetHeaders,
  updateSheet,
  getColumnLetter
};

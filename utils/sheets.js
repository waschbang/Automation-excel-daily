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
    
    // Get today's date in the same format as stored in the sheet (YYYY-MM-DD)
    const today = new Date().toISOString().split('T')[0];
    console.log(`Checking for existing data for date: ${today}`);
    
    // Get all existing data to check for today's date
    const existingDataResponse = await sheets.spreadsheets.values.get({
      auth,
      spreadsheetId,
      range: `${sheetName}!A:F`, // Include date column and profile ID columns
    });
    
    const existingData = existingDataResponse.data.values || [];
    console.log(`Found ${existingData.length} existing rows in the sheet`);
    
    // Skip header row if it exists
    const dataToCheck = existingData.length > 0 ? existingData.slice(1) : [];
    
    // Function to normalize dates for comparison
    const normalizeDate = (dateStr) => {
      if (!dateStr) return '';
      // Try to convert to a standard format YYYY-MM-DD
      try {
        const date = new Date(dateStr);
        return date.toISOString().split('T')[0]; // Returns YYYY-MM-DD
      } catch (e) {
        return dateStr; // Return original if parsing fails
      }
    };
    
    // Get yesterday's date as well since we're now fetching yesterday's data
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    // Check for both today's and yesterday's data for these profiles
    const recentData = dataToCheck.filter(row => {
      const rowDate = normalizeDate(row[0]);
      return rowDate === today || rowDate === yesterdayStr;
    });
    
    if (recentData.length > 0) {
      console.log(`Found ${recentData.length} existing rows for recent dates (${yesterdayStr} or ${today})`);
      
      // Filter out rows that already exist for the same date and profile ID
      const newRows = rows.filter(newRow => {
        // Each new row should have date at index 0 and profile ID at index 4
        const newRowDate = normalizeDate(newRow[0]);
        const newRowProfileId = String(newRow[4]).trim(); // Normalize profile ID
        
        // Check if this profile's data already exists
        const exists = recentData.some(existingRow => {
          const existingRowDate = normalizeDate(existingRow[0]);
          const existingRowProfileId = String(existingRow[4]).trim(); // Normalize profile ID
          
          return existingRowDate === newRowDate && existingRowProfileId === newRowProfileId;
        });
        
        return !exists;
      });
      
      if (newRows.length === 0) {
        console.log('All data for today already exists in the sheet. No update needed.');
        return true; // Return success since no update was needed
      }
      
      console.log(`Adding ${newRows.length} new rows that don't already exist for today`);
      rows = newRows; // Replace rows with filtered rows
    }
    
    // Get the next row to append data - account for header row
    // If there's existing data, we need to add rows after the last row
    // The +1 accounts for the header row that's already in the sheet
    const nextRow = existingData.length > 0 ? existingData.length + 1 : 2;
    const lastRow = nextRow + rows.length - 1;
    const lastCol = getColumnLetter(rows[0].length);
    
    console.log(`Appending data starting at row ${nextRow} (after existing ${existingData.length} rows)`);

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

/**
 * Get values from a sheet range
 * @param {Object} auth - Google auth client
 * @param {string} spreadsheetId - Google Spreadsheet ID
 * @param {string} sheetName - Name of the sheet
 * @param {string} range - Range to get (e.g., 'A1:B10' or 'A:A')
 * @returns {Promise<Array>} Array of row values
 */
const getSheetValues = async (auth, spreadsheetId, sheetName, range) => {
  try {
    const response = await sheets.spreadsheets.values.get({
      auth,
      spreadsheetId,
      range: `${sheetName}!${range}`,
      valueRenderOption: 'UNFORMATTED_VALUE'
    });
    
    return response.data.values || [];
  } catch (error) {
    console.error(`Error getting sheet values: ${error.message}`);
    return [];
  }
};

module.exports = {
  getGoogleAuth,
  createSheetIfNotExists,
  setupSheetHeaders,
  updateSheet,
  getColumnLetter,
  getSheetValues
};

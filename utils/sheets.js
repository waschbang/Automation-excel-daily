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
      valueInputOption: 'USER_ENTERED',
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
        const newRowProfileId = String(newRow[3]).trim(); // Profile ID is column D (index 3)
        
        // Check if this profile's data already exists
        const exists = recentData.some(existingRow => {
          const existingRowDate = normalizeDate(existingRow[0]);
          const existingRowProfileId = String(existingRow[3]).trim(); // Profile ID is column D (index 3)
          
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

    // Determine the sheet's existing date pattern for column A and format our outgoing dates to match
    const { pattern: existingPattern, source: patternSource } = await determineExistingDatePattern(auth, spreadsheetId, sheetName);
    console.log(`Date pattern detection: pattern="${existingPattern || 'N/A'}" (source=${patternSource})`);

    const formattedRows = rows.map(r => {
      const newRow = [...r];
      try {
        // Only format if column 0 looks like a date and we have a pattern
        if (newRow[0]) {
          const iso = normalizeToIsoDateString(newRow[0]);
          if (iso) {
            newRow[0] = formatDateByPattern(iso, existingPattern);
          }
        }
      } catch (_) {}
      return newRow;
    });

    const updateResponse = await sheets.spreadsheets.values.update({
      auth,
      spreadsheetId,
      range: `${sheetName}!A${nextRow}:${lastCol}${lastRow}`,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: formattedRows
      }
    });

    console.log('Sheet update response:', updateResponse.data);
    console.log(`Updated ${updateResponse.data.updatedRows} rows starting from row ${nextRow}`);
    // Apply date format to Date column (A) only if there was no existing pattern detected
    if (!existingPattern) {
      try { await ensureDateColumnFormat(auth, spreadsheetId, sheetName); } catch (_) {}
    }
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

/**
 * Ensure column A is formatted as a Date with YYYY-MM-DD pattern on the target sheet.
 * Applies to A2:A (leaves header A1 untouched).
 */
const ensureDateColumnFormat = async (auth, spreadsheetId, sheetName) => {
  try {
    // Resolve sheetId from sheet title
    const ss = await sheets.spreadsheets.get({ auth, spreadsheetId, includeGridData: false });
    const sheet = (ss.data.sheets || []).find(s => s.properties.title === sheetName);
    const sheetId = sheet?.properties?.sheetId;
    if (sheetId == null) return;

    await sheets.spreadsheets.batchUpdate({
      auth,
      spreadsheetId,
      resource: {
        requests: [
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 }, // A2:A
              cell: {
                userEnteredFormat: {
                  numberFormat: { type: 'DATE', pattern: 'yyyy-mm-dd' }
                }
              },
              fields: 'userEnteredFormat.numberFormat'
            }
          }
        ]
      }
    });
  } catch (err) {
    console.warn(`Failed to set date format on ${sheetName}!A:A: ${err.message}`);
  }
};

/**
 * Try to detect the existing date pattern for column A by checking cell formatting.
 * Returns { pattern: string|null, source: 'format'|'display'|'none' }
 */
const determineExistingDatePattern = async (auth, spreadsheetId, sheetName) => {
  try {
    // First, look at cell format for A2:A50
    const meta = await sheets.spreadsheets.get({
      auth,
      spreadsheetId,
      includeGridData: true,
      ranges: [`${sheetName}!A2:A50`],
      fields: 'sheets(data(rowData(values(userEnteredFormat.numberFormat,type,userEnteredValue,formattedValue))),properties(title))'
    });

    const sheet = (meta.data.sheets || [])[0];
    const rows = sheet?.data?.[0]?.rowData || [];
    for (const row of rows) {
      const cell = row?.values?.[0];
      const fmt = cell?.userEnteredFormat?.numberFormat;
      if (fmt && (fmt.type === 'DATE' || fmt.type === 'DATE_TIME')) {
        if (fmt.pattern && typeof fmt.pattern === 'string' && fmt.pattern.trim()) {
          return { pattern: fmt.pattern, source: 'format' };
        }
      }
    }

    // Fallback: inspect displayed values to infer a common pattern
    const disp = await sheets.spreadsheets.values.get({
      auth,
      spreadsheetId,
      range: `${sheetName}!A2:A50`,
      valueRenderOption: 'FORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING'
    });
    const vals = (disp.data.values || []).map(v => (v && v[0]) ? String(v[0]) : '').filter(Boolean);
    for (const v of vals) {
      const inferred = inferPatternFromDisplay(v);
      if (inferred) return { pattern: inferred, source: 'display' };
    }

    return { pattern: null, source: 'none' };
  } catch (err) {
    console.warn(`Could not determine existing date pattern for ${sheetName}: ${err.message}`);
    return { pattern: null, source: 'none' };
  }
};

// Infer a simple date pattern from a display string
const inferPatternFromDisplay = (s) => {
  const str = String(s).trim();
  // yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return 'yyyy-mm-dd';
  // dd/mm/yyyy
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) return 'dd/mm/yyyy';
  // mm/dd/yyyy
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    // ambiguous with dd/mm, but we'll keep mm/dd as alternative; actual disambiguation needs locale
    return 'mm/dd/yyyy';
  }
  // d/m/yyyy or m/d/yyyy (single-digit variants)
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) return 'd/m/yyyy';
  // 29 Aug 2025
  if (/^\d{1,2}\s+[A-Za-z]{3,}\s+\d{4}$/.test(str)) return 'd mmm yyyy';
  return null;
};

// Normalize various inputs to ISO YYYY-MM-DD
const normalizeToIsoDateString = (value) => {
  if (value == null) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  // already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  // numeric (serial)
  const asNum = Number(raw);
  if (!Number.isNaN(asNum) && raw !== '') {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const ms = epoch.getTime() + Math.round(asNum) * 86400000;
    const dt = new Date(ms);
    const yyyy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  // parse generically
  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) {
    const yyyy = parsed.getFullYear();
    const mm = String(parsed.getMonth() + 1).padStart(2, '0');
    const dd = String(parsed.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  return '';
};

// Format an ISO YYYY-MM-DD into a target pattern (limited set). If no pattern, return ISO.
const formatDateByPattern = (iso, pattern) => {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  if (!pattern) return iso;
  const [y, m, d] = iso.split('-');
  switch ((pattern || '').toLowerCase()) {
    case 'yyyy-mm-dd':
    case 'yyyy-mm-dd;@':
      return `${y}-${m}-${d}`;
    case 'dd/mm/yyyy':
    case 'dd/mm/yyyy;@':
    case 'd/m/yyyy':
      return `${d}/${m}/${y}`;
    case 'mm/dd/yyyy':
    case 'mm/dd/yyyy;@':
    case 'm/d/yyyy':
      return `${m}/${d}/${y}`;
    case 'd mmm yyyy': {
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const idx = parseInt(m, 10) - 1;
      return `${parseInt(d,10)} ${months[idx]} ${y}`;
    }
    default:
      return `${y}-${m}-${d}`;
  }
};

module.exports = {
  getGoogleAuth,
  createSheetIfNotExists,
  setupSheetHeaders,
  updateSheet,
  getColumnLetter,
  getSheetValues,
  ensureDateColumnFormat,
  determineExistingDatePattern,
  formatDateByPattern,
  normalizeToIsoDateString
};

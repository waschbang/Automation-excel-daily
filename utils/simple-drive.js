/**
 * Simple Google Drive Utilities
 * This module provides simplified functions for working with Google Drive
 */
const { google } = require('googleapis');

/**
 * Find an existing spreadsheet in a folder by title pattern
 * @param {google.drive.v3.Drive} drive - Authenticated Drive client
 * @param {string} titlePattern - Pattern to match in the spreadsheet title
 * @param {string} folderId - ID of the folder to search in
 * @returns {Promise<string|null>} Spreadsheet ID if found, null otherwise
 */
const findExistingSpreadsheet = async (drive, titlePattern, folderId) => {
  try {
    console.log(`Searching for spreadsheet matching pattern: "${titlePattern}" in folder: ${folderId}`);
    
    // Build the query
    let query = `mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
    
    // Add folder constraint if provided
    if (folderId) {
      query += ` and '${folderId}' in parents`;
    }
    
    // Execute the search
    const response = await drive.files.list({
      q: query,
      fields: 'files(id, name)',
      spaces: 'drive'
    });
    
    const files = response.data.files;
    
    if (!files || files.length === 0) {
      console.log('No spreadsheets found.');
      return null;
    }
    
    console.log(`Found ${files.length} spreadsheets in the folder.`);
    
    // Find the first spreadsheet that matches the pattern
    const matchingFile = files.find(file => file.name.includes(titlePattern));
    
    if (matchingFile) {
      console.log(`Found matching spreadsheet: "${matchingFile.name}" (${matchingFile.id})`);
      return matchingFile.id;
    } else {
      console.log(`No spreadsheet matching pattern "${titlePattern}" found.`);
      return null;
    }
  } catch (error) {
    console.error(`Error finding existing spreadsheet: ${error.message}`);
    return null;
  }
};

/**
 * Create a new spreadsheet
 * @param {google.sheets.v4.Sheets} sheets - Authenticated Sheets client
 * @param {google.drive.v3.Drive} drive - Authenticated Drive client
 * @param {string} title - Title of the spreadsheet
 * @param {string} folderId - ID of the folder to create the spreadsheet in
 * @returns {Promise<string>} ID of the created spreadsheet
 */
const createSpreadsheet = async (sheets, drive, title, folderId) => {
  try {
    console.log(`Creating new spreadsheet: "${title}"`);
    
    // Create the spreadsheet
    const response = await sheets.spreadsheets.create({
      resource: {
        properties: {
          title: title
        }
      }
    });
    
    const spreadsheetId = response.data.spreadsheetId;
    
    // Move the spreadsheet to the specified folder if provided
    if (folderId) {
      await drive.files.update({
        fileId: spreadsheetId,
        addParents: folderId,
        removeParents: 'root',
        fields: 'id, parents'
      });
      
      console.log(`Moved spreadsheet to folder: ${folderId}`);
    }
    
    console.log(`Created spreadsheet with ID: ${spreadsheetId}`);
    return spreadsheetId;
  } catch (error) {
    console.error(`Error creating spreadsheet: ${error.message}`);
    throw error;
  }
};

/**
 * Create a new sheet in a spreadsheet
 * @param {google.sheets.v4.Sheets} sheets - Authenticated Sheets client
 * @param {string} spreadsheetId - ID of the spreadsheet
 * @param {string} sheetTitle - Title of the sheet
 * @returns {Promise<number>} ID of the created sheet
 */
const createSheet = async (sheets, spreadsheetId, sheetTitle) => {
  try {
    console.log(`Creating sheet "${sheetTitle}" in spreadsheet: ${spreadsheetId}`);
    
    // Add the sheet
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
    
    const sheetId = response.data.replies[0].addSheet.properties.sheetId;
    console.log(`Created sheet with ID: ${sheetId}`);
    return sheetId;
  } catch (error) {
    console.error(`Error creating sheet: ${error.message}`);
    throw error;
  }
};

/**
 * Find a spreadsheet by pattern in its title
 * @param {google.drive.v3.Drive} drive - Authenticated Drive client
 * @param {string} pattern - Pattern to search for in the title
 * @param {string} folderId - ID of the folder to search in (optional)
 * @returns {Promise<{id: string, name: string}|null>} Spreadsheet details if found, null otherwise
 */
const findSpreadsheetByPattern = async (drive, pattern, folderId) => {
  try {
    console.log(`Searching for spreadsheet with pattern "${pattern}" in title`);
    
    // Build the query
    let query = `mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
    
    // Add folder constraint if provided
    if (folderId) {
      query += ` and '${folderId}' in parents`;
    }
    
    // Add name pattern
    if (pattern) {
      query += ` and name contains '${pattern}'`;
    }
    
    // Execute the search
    const response = await drive.files.list({
      q: query,
      fields: 'files(id, name)',
      spaces: 'drive',
      orderBy: 'modifiedTime desc'
    });
    
    const files = response.data.files;
    
    if (!files || files.length === 0) {
      console.log('No matching spreadsheets found.');
      return null;
    }
    
    // Return the most recently modified file
    const file = files[0];
    console.log(`Found spreadsheet: "${file.name}" (${file.id})`);
    return { id: file.id, name: file.name };
  } catch (error) {
    console.error(`Error finding spreadsheet by pattern: ${error.message}`);
    return null;
  }
};

/**
 * Update a spreadsheet title
 * @param {google.drive.v3.Drive} drive - Authenticated Drive client
 * @param {string} spreadsheetId - ID of the spreadsheet
 * @param {string} newTitle - New title for the spreadsheet
 * @returns {Promise<void>}
 */
const updateSpreadsheetTitle = async (drive, spreadsheetId, newTitle) => {
  try {
    console.log(`Updating title of spreadsheet ${spreadsheetId} to "${newTitle}"`);
    
    await drive.files.update({
      fileId: spreadsheetId,
      resource: {
        name: newTitle
      }
    });
    
    console.log('Title updated successfully.');
  } catch (error) {
    console.error(`Error updating spreadsheet title: ${error.message}`);
    throw error;
  }
};

module.exports = {
  findExistingSpreadsheet,
  createSpreadsheet,
  createSheet,
  findSpreadsheetByPattern,
  updateSpreadsheetTitle
};

/**
 * Simple Google Drive Utilities
 * This module provides simplified functions for working with Google Drive
 */
const { google } = require('googleapis');

/**
 * Canonical spreadsheet name that disambiguates Customer Groups with the
 * same display name. Sprout has multiple groups sharing names
 * (e.g. "Rajasthan Revealed", "Birla Opus", "RCAT Rajasthan"), and the
 * legacy name-based lookup silently clobbered one group's data into
 * another's sheet. The [<groupId>] suffix guarantees uniqueness.
 *
 * @param {string} groupName
 * @param {string|number} groupId
 * @returns {string} e.g. "Copy of Rajasthan Revealed [2760771]"
 */
const canonicalSpreadsheetName = (groupName, groupId) => {
  if (groupId == null || groupId === '') return `Copy of ${groupName}`;
  return `Copy of ${groupName} [${groupId}]`;
};

/**
 * Match a file name against the "Copy of X [groupId]" format. Returns the
 * embedded groupId string, or null if the name is not canonical.
 * @param {string} name
 * @returns {string|null}
 */
const extractGroupIdFromName = (name) => {
  if (typeof name !== 'string') return null;
  const m = name.match(/\[([0-9A-Za-z_-]+)\]\s*$/);
  return m ? m[1] : null;
};

/**
 * Resolve the Drive file for a Customer Group using groupId-first matching.
 *
 * Lookup order:
 *   1. Exact match on "Copy of <name> [<groupId>]" — canonical
 *   2. Any file whose "[<token>]" suffix equals groupId (handles renamed groups)
 *   3. Exact match on "Copy of <name>" — legacy (pre-migration)
 *   4. Any file starting with "Copy of <name>"  — legacy fuzzy
 *   5. null
 *
 * Does NOT create new files. Caller decides whether to create on miss.
 *
 * @param {google.drive.v3.Drive} drive
 * @param {string} folderId
 * @param {string|number} groupId
 * @param {string} groupName
 * @returns {Promise<{ id: string, name: string, match: 'canonical'|'groupId'|'legacy-exact'|'legacy-fuzzy' }|null>}
 */
const findSpreadsheetForGroup = async (drive, folderId, groupId, groupName) => {
  try {
    const query = `mimeType='application/vnd.google-apps.spreadsheet' and '${folderId}' in parents and trashed=false`;
    const response = await drive.files.list({
      q: query,
      fields: 'files(id, name)',
      spaces: 'drive',
      pageSize: 1000,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });
    const files = response.data.files || [];
    if (!files.length) return null;

    const canonical = canonicalSpreadsheetName(groupName, groupId);
    const legacyExact = `Copy of ${groupName}`;

    // 1. canonical exact
    let hit = files.find((f) => f.name === canonical);
    if (hit) return { id: hit.id, name: hit.name, match: 'canonical' };

    // 2. any file whose [<id>] suffix equals groupId (catches renamed groups)
    const idStr = String(groupId);
    hit = files.find((f) => extractGroupIdFromName(f.name) === idStr);
    if (hit) return { id: hit.id, name: hit.name, match: 'groupId' };

    // 3. legacy exact
    hit = files.find((f) => f.name === legacyExact);
    if (hit) return { id: hit.id, name: hit.name, match: 'legacy-exact' };

    // 4. legacy fuzzy (starts-with). Only return if unambiguous — if
    //    multiple files start with "Copy of <name>", we cannot safely
    //    pick one (that is the duplicate-name symptom we are fixing).
    const fuzzy = files.filter((f) => f.name.startsWith(legacyExact));
    if (fuzzy.length === 1) {
      return { id: fuzzy[0].id, name: fuzzy[0].name, match: 'legacy-fuzzy' };
    }
    if (fuzzy.length > 1) {
      console.warn(
        `[drive] Ambiguous legacy match for group "${groupName}" (${groupId}): ` +
        `${fuzzy.length} files share the prefix. Will create a new canonical file.`
      );
    }
    return null;
  } catch (error) {
    console.error(`findSpreadsheetForGroup failed for ${groupName} (${groupId}): ${error.message}`);
    return null;
  }
};

/**
 * Find an existing spreadsheet in a folder by title pattern (legacy API,
 * used only by pipelines during the Phase 5 transition. Prefer
 * findSpreadsheetForGroup for new code).
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
      spaces: 'drive',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true
    });
    
    const files = response.data.files;
    
    if (!files || files.length === 0) {
      console.log('No spreadsheets found.');
      return null;
    }
    
    console.log(`Found ${files.length} spreadsheets in the folder.`);
    
    // Find the first spreadsheet that matches the pattern strictly
    // 1) exact match or 2) name starts with pattern (e.g., "Copy of <Group> ...")
    let matchingFile = files.find(file => file.name === titlePattern);
    if (!matchingFile) {
      matchingFile = files.find(file => file.name.startsWith(titlePattern));
    }
    
    // If still no match, fall back to includes for more flexible matching
    if (!matchingFile) {
      matchingFile = files.find(file => file.name.includes(titlePattern));
    }
    
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
 * Ensure a sheet has at least the requested number of rows/columns.
 * Grows the grid if needed (no-op if already large enough).
 * @param {google.sheets.v4.Sheets} sheets - Sheets client
 * @param {string} spreadsheetId - Spreadsheet ID
 * @param {string} sheetTitle - Sheet name
 * @param {number} minRows - Minimum required rows
 * @param {number} minCols - Minimum required columns
 */
const ensureSheetCapacity = async (sheets, spreadsheetId, sheetTitle, minRows, minCols) => {
  try {
    // Get sheet properties
    const meta = await sheets.spreadsheets.get({
      spreadsheetId,
      includeGridData: false,
    });

    const sheet = (meta.data.sheets || []).find(s => s.properties && s.properties.title === sheetTitle);
    if (!sheet) {
      console.warn(`ensureSheetCapacity: Sheet "${sheetTitle}" not found in ${spreadsheetId}`);
      return;
    }

    const props = sheet.properties || {};
    const grid = props.gridProperties || {};
    const currentRows = grid.rowCount || 1000;
    const currentCols = grid.columnCount || 26;

    const targetRows = Math.max(currentRows, minRows || currentRows);
    const targetCols = Math.max(currentCols, minCols || currentCols);

    if (targetRows === currentRows && targetCols === currentCols) {
      return; // No change needed
    }

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: {
        requests: [
          {
            updateSheetProperties: {
              properties: {
                sheetId: props.sheetId,
                gridProperties: {
                  rowCount: targetRows,
                  columnCount: targetCols,
                },
              },
              fields: 'gridProperties(rowCount,columnCount)'
            }
          }
        ]
      }
    });
    console.log(`Expanded sheet "${sheetTitle}" to rows=${targetRows}, cols=${targetCols}`);
  } catch (error) {
    console.warn(`ensureSheetCapacity failed for ${sheetTitle}: ${error.message}`);
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
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
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
  canonicalSpreadsheetName,
  extractGroupIdFromName,
  findSpreadsheetForGroup,
  findExistingSpreadsheet,
  createSpreadsheet,
  createSheet,
  findSpreadsheetByPattern,
  updateSpreadsheetTitle,
  ensureSheetCapacity,
};

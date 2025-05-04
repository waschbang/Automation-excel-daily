/**
 * Find and List Duplicate Spreadsheets
 * 
 * This utility script finds duplicate spreadsheets in the Google Drive folder
 * and provides options to manage them.
 */

const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');
const driveUtils = require('./drive');
const readline = require('readline');

// Google Drive folder ID
const FOLDER_ID = '1usYEd9TeNI_2gapA-dLK4y27zvvWJO8r';

// Credentials path
const DRIVE_CREDENTIALS_PATH = path.join(__dirname, '..', 'drive-credentials.json');

/**
 * Find duplicate spreadsheets in the folder
 */
async function findDuplicateSpreadsheets() {
  console.log('\n=== FINDING DUPLICATE SPREADSHEETS ===');
  console.log(`Folder ID: ${FOLDER_ID}`);
  
  // Authenticate with Google Drive
  const auth = await driveUtils.authorize();
  if (!auth) {
    console.error('Failed to authenticate with Google Drive');
    return;
  }
  
  // Get all spreadsheets in the folder
  const drive = google.drive({ version: 'v3', auth });
  
  try {
    console.log('Fetching spreadsheets from Google Drive...');
    const response = await drive.files.list({
      q: `'${FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.spreadsheet'`,
      fields: 'files(id, name, createdTime, modifiedTime)',
      orderBy: 'name'
    });
    
    const files = response.data.files;
    console.log(`Found ${files.length} spreadsheets in the folder`);
    
    // Group files by name to find duplicates
    const filesByName = {};
    files.forEach(file => {
      if (!filesByName[file.name]) {
        filesByName[file.name] = [];
      }
      filesByName[file.name].push(file);
    });
    
    // Find duplicates
    const duplicates = Object.entries(filesByName)
      .filter(([name, files]) => files.length > 1)
      .map(([name, files]) => ({
        name,
        files: files.sort((a, b) => new Date(b.modifiedTime) - new Date(a.modifiedTime))
      }));
    
    if (duplicates.length === 0) {
      console.log('No duplicate spreadsheets found.');
      return;
    }
    
    console.log(`\nFound ${duplicates.length} sets of duplicate spreadsheets:`);
    
    duplicates.forEach((duplicate, index) => {
      console.log(`\n${index + 1}. ${duplicate.name} (${duplicate.files.length} copies):`);
      duplicate.files.forEach((file, fileIndex) => {
        const createdDate = new Date(file.createdTime).toLocaleString();
        const modifiedDate = new Date(file.modifiedTime).toLocaleString();
        console.log(`   ${fileIndex + 1}. ID: ${file.id}`);
        console.log(`      Created: ${createdDate}`);
        console.log(`      Last Modified: ${modifiedDate}`);
        console.log(`      URL: https://docs.google.com/spreadsheets/d/${file.id}/edit`);
      });
    });
    
    // Offer to fix duplicates
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    rl.question('\nWould you like to keep only the most recently modified file for each duplicate set? (yes/no): ', async (answer) => {
      if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
        console.log('\nKeeping only the most recently modified file for each duplicate set...');
        
        for (const duplicate of duplicates) {
          // Keep the first file (most recently modified) and move others to trash
          const [keepFile, ...trashFiles] = duplicate.files;
          
          console.log(`\nFor "${duplicate.name}":`);
          console.log(`- Keeping: ${keepFile.id} (Last modified: ${new Date(keepFile.modifiedTime).toLocaleString()})`);
          
          for (const file of trashFiles) {
            console.log(`- Moving to trash: ${file.id} (Last modified: ${new Date(file.modifiedTime).toLocaleString()})`);
            try {
              await drive.files.update({
                fileId: file.id,
                requestBody: {
                  trashed: true
                }
              });
              console.log(`  ✓ Successfully moved ${file.id} to trash`);
            } catch (error) {
              console.error(`  ✗ Error moving ${file.id} to trash: ${error.message}`);
            }
          }
        }
        
        console.log('\nDuplicate management completed.');
      } else {
        console.log('No changes made to duplicate files.');
      }
      
      rl.close();
    });
    
  } catch (error) {
    console.error(`Error finding duplicate spreadsheets: ${error.message}`);
  }
}

// Run the function if this script is executed directly
if (require.main === module) {
  findDuplicateSpreadsheets().catch(error => {
    console.error('Critical error:', error);
  });
}

module.exports = { findDuplicateSpreadsheets };

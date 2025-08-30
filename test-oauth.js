#!/usr/bin/env node

/**
 * Test OAuth authentication and spreadsheet creation
 * Run this script to verify OAuth setup is working properly
 */

const { createOAuthClients } = require('./utils/oauth-utils');

// Target folder ID where spreadsheets will be created
const FOLDER_ID = '1O0In92io6PksS-VEdr1lyD-VfVC6mVV3';

/**
 * Test OAuth authentication and Google Drive/Sheets access
 */
async function testOAuthAccess() {
  try {
    console.log('🔄 Testing OAuth Authentication and Drive/Sheets Access');
    console.log('====================================================');
    
    // Get OAuth clients
    const { drive, sheets } = await createOAuthClients();
    console.log('✅ OAuth client creation successful');
    
    // Test folder access
    console.log(`\n📁 Testing access to folder ${FOLDER_ID}...`);
    try {
      const folder = await drive.files.get({
        fileId: FOLDER_ID,
        fields: 'id, name, owners'
      });
      
      console.log(`✅ Successfully accessed folder: "${folder.data.name}"`);
      
      // Show owner info
      if (folder.data.owners && folder.data.owners.length > 0) {
        const owner = folder.data.owners[0];
        console.log(`📧 Folder owner: ${owner.displayName} (${owner.emailAddress})`);
      }
    } catch (folderError) {
      console.error(`❌ Error accessing folder: ${folderError.message}`);
      console.log('   Make sure the folder exists and you have access to it');
      return false;
    }
    
    // Test spreadsheet creation
    console.log('\n📊 Testing spreadsheet creation...');
    try {
      const title = `OAuth Test - ${new Date().toISOString()}`;
      console.log(`   Creating spreadsheet: "${title}"`);
      
      // Create the spreadsheet
      const spreadsheet = await sheets.spreadsheets.create({
        resource: {
          properties: {
            title: title
          }
        }
      });
      
      const spreadsheetId = spreadsheet.data.spreadsheetId;
      const spreadsheetUrl = spreadsheet.data.spreadsheetUrl;
      
      console.log(`✅ Successfully created spreadsheet: ${spreadsheetId}`);
      console.log(`🔗 URL: ${spreadsheetUrl}`);
      
      // Move to target folder
      console.log(`\n📦 Moving spreadsheet to target folder (${FOLDER_ID})...`);
      await drive.files.update({
        fileId: spreadsheetId,
        addParents: FOLDER_ID,
        removeParents: 'root',
        fields: 'id, parents'
      });
      
      console.log('✅ Successfully moved spreadsheet to target folder');
      
      // Test complete
      console.log('\n🎉 OAUTH AUTHENTICATION TEST SUCCESSFUL!');
      console.log('   Your OAuth setup is working properly.');
      console.log('   You can now use OAuth in your main script.');
      
      return true;
    } catch (sheetError) {
      console.error(`❌ Error creating spreadsheet: ${sheetError.message}`);
      return false;
    }
    
  } catch (error) {
    console.error('❌ OAuth test failed:', error.message);
    return false;
  }
}

// Run test if executed directly
if (require.main === module) {
  testOAuthAccess()
    .then(success => {
      if (!success) {
        console.log('\n⚠️ OAuth test failed. Please check the errors above.');
      }
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Unhandled error:', error);
      process.exit(1);
    });
}

module.exports = { testOAuthAccess };

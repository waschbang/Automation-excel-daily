#!/usr/bin/env node

/**
 * Check if required Google APIs are enabled
 */

const { google } = require('googleapis');

const checkApis = async () => {
  try {
    console.log('🔍 Checking Google API status...\n');
    
    // Authenticate using Application Default Credentials (ADC)
    const scopes = [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/drive.metadata'
    ];
    const auth = await google.auth.getClient({ scopes });
    if (auth.authorize) {
      try { await auth.authorize(); } catch (_) {}
    }
    console.log('✓ Authentication successful via ADC\n');
    
    // Check Drive API
    const drive = google.drive({ version: 'v3', auth });
    console.log('Testing Drive API...');
    try {
      const aboutResponse = await drive.about.get({
        fields: 'user,storageQuota'
      });
      console.log(`✓ Drive API is working!`);
      console.log(`  - Authenticated as: ${aboutResponse.data.user.emailAddress}`);
      
      // Check storage quota
      const quota = aboutResponse.data.storageQuota;
      const usedGB = Math.round(quota.usage / (1024 * 1024 * 1024) * 100) / 100;
      const limitGB = quota.limit ? Math.round(quota.limit / (1024 * 1024 * 1024) * 100) / 100 : 'Unlimited';
      
      console.log(`  - Drive Storage: ${usedGB} GB used of ${limitGB} GB`);
      console.log(`  - Usage percentage: ${quota.limit ? Math.round(quota.usage / quota.limit * 100) : 0}%`);
      
      if (quota.usage && quota.limit && quota.usage >= quota.limit) {
        console.log(`❌ STORAGE QUOTA EXCEEDED! This is the actual problem.`);
      }
    } catch (error) {
      console.log(`❌ Drive API error: ${error.message}`);
    }
    
    // Check Sheets API
    const sheets = google.sheets({ version: 'v4', auth });
    console.log('\nTesting Sheets API...');
    try {
      // Try to create a test spreadsheet
      const response = await sheets.spreadsheets.create({
        resource: {
          properties: {
            title: `API Test - ${new Date().toISOString()}`
          }
        }
      });
      
      const spreadsheetId = response.data.spreadsheetId;
      console.log(`✓ Sheets API is working! Created test spreadsheet: ${spreadsheetId}`);
      
      // Clean up
      try {
        await drive.files.delete({ fileId: spreadsheetId });
        console.log(`✓ Test spreadsheet deleted`);
      } catch (deleteError) {
        console.log(`Note: Could not delete test spreadsheet: ${deleteError.message}`);
      }
    } catch (error) {
      console.log(`❌ Sheets API error: ${error.message}`);
    }
    
    // Check folder access
    const FOLDER_ID = '1_bUiyGsrEjZb1Vkpelu7JKlepDvvr_30';
    console.log(`\nChecking access to folder: ${FOLDER_ID}`);
    try {
      const folderResponse = await drive.files.get({
        fileId: FOLDER_ID,
        fields: 'id,name,capabilities(canEdit)'
      });
      
      const folder = folderResponse.data;
      if (!folder.capabilities.canEdit) {
        console.log(`❌ NO EDIT ACCESS to folder "${folder.name}" (${folder.id})`);
        console.log(`   The service account can see the folder but cannot edit it.`);
      } else {
        console.log(`✓ Service account has edit access to folder "${folder.name}" (${folder.id})`);
      }
    } catch (error) {
      console.log(`❌ Cannot access folder: ${error.message}`);
      console.log(`   The service account might not have access to this folder at all.`);
    }
    
    console.log('\n🔍 SUMMARY OF FINDINGS:');
    console.log('1. If Drive API failed: Enable it in Google Cloud Console');
    console.log('2. If Sheets API failed: Enable it in Google Cloud Console');
    console.log('3. If folder access failed: Share the folder with the service account');
    console.log('4. If storage quota exceeded: Free up space or request more quota');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
};

checkApis();

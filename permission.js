#!/usr/bin/env node

/**
 * Alternative test that creates the spreadsheet directly in the folder
 */

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const FOLDER_ID = '1_bUiyGsrEjZb1Vkpelu7JKlepDvvr_30';

const testAlternativeApproach = async () => {
  try {
    console.log('🔍 Testing alternative spreadsheet creation...\n');
    
    // Load service account
    const serviceAccountPath = path.join(__dirname, 'service-account-key.json');
    const serviceAccountKey = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    console.log(`✓ Service account loaded: ${serviceAccountKey.client_email}`);
    
    // Authenticate with additional scopes
    const auth = new google.auth.JWT(
      serviceAccountKey.client_email,
      null,
      serviceAccountKey.private_key,
      [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/drive.metadata'
      ]
    );
    
    await auth.authorize();
    console.log('✓ Authentication successful\n');
    
    const drive = google.drive({ version: 'v3', auth });
    const sheets = google.sheets({ version: 'v4', auth });
    
    // Method 1: Create spreadsheet directly in folder
    console.log('Method 1: Creating spreadsheet directly in target folder...');
    try {
      const response = await sheets.spreadsheets.create({
        resource: {
          properties: {
            title: `Direct Test - ${new Date().toISOString()}`
          }
        }
      });
      
      const spreadsheetId = response.data.spreadsheetId;
      console.log(`  ✓ Created: ${spreadsheetId}`);
      
      // Immediately move to folder
      await drive.files.update({
        fileId: spreadsheetId,
        addParents: FOLDER_ID,
        removeParents: 'root'
      });
      console.log('  ✓ Moved to folder');
      
      // Clean up
      await drive.files.delete({ fileId: spreadsheetId });
      console.log('  ✓ Cleaned up\n');
      
    } catch (error) {
      console.log(`  ❌ Method 1 failed: ${error.message}\n`);
    }
    
    // Method 2: Create with parent folder specified
    console.log('Method 2: Creating with parent folder specified...');
    try {
      // First create a regular file in the folder to test basic permissions
      const fileMetadata = {
        name: `Test File - ${Date.now()}`,
        parents: [FOLDER_ID],
        mimeType: 'application/vnd.google-apps.spreadsheet'
      };
      
      const file = await drive.files.create({
        resource: fileMetadata
      });
      
      console.log(`  ✓ Created file: ${file.data.id}`);
      
      // Clean up
      await drive.files.delete({ fileId: file.data.id });
      console.log('  ✓ Cleaned up\n');
      
    } catch (error) {
      console.log(`  ❌ Method 2 failed: ${error.message}\n`);
    }
    
    // Method 3: Check your current permissions
    console.log('Method 3: Checking current Drive permissions...');
    try {
      const about = await drive.about.get({
        fields: 'user,storageQuota'
      });
      
      console.log(`  ✓ Authenticated as: ${about.data.user.emailAddress}`);
      console.log(`  ✓ Display name: ${about.data.user.displayName}`);
      
    } catch (error) {
      console.log(`  ❌ Method 3 failed: ${error.message}\n`);
    }
    
    console.log('🎯 If all methods failed, try these solutions:');
    console.log('1. Enable "Google Drive API" in Google Cloud Console');
    console.log('2. Enable "Google Sheets API" in Google Cloud Console');
    console.log('3. Add service account as Editor to the specific folder');
    console.log('4. Grant "Editor" role to service account in IAM');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    
    // Specific error handling
    if (error.code === 403) {
      console.error('\n📋 403 Forbidden Error Solutions:');
      console.error('1. Go to Google Cloud Console → APIs & Services → Library');
      console.error('2. Enable "Google Drive API" and "Google Sheets API"');
      console.error('3. Go to IAM & Admin → IAM');
      console.error('4. Add Editor role to: sprout-social@second-brain-462019.iam.gserviceaccount.com');
    }
    
    if (error.code === 404) {
      console.error('\n📋 404 Not Found Error Solutions:');
      console.error('1. Check if folder ID is correct: ' + FOLDER_ID);
      console.error('2. Verify folder exists and is accessible');
    }
  }
};

testAlternativeApproach();
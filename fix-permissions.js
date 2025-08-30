#!/usr/bin/env node

/**
 * Google Drive API Permission Fix Script
 * =====================================
 * This script helps diagnose and fix Google Drive API permission issues
 * for service accounts trying to create spreadsheets.
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// Configuration
const SERVICE_ACCOUNT_KEY_PATH = './service-account-key.json';
const TARGET_FOLDER_ID = '1O0In92io6PksS-VEdr1lyD-VfVC6mVV3';

/**
 * Create and authorize Google API clients
 */
async function createGoogleClients() {
  try {
    console.log('🔐 Loading service account credentials...');
    
    if (!fs.existsSync(SERVICE_ACCOUNT_KEY_PATH)) {
      throw new Error(`Service account key file not found: ${SERVICE_ACCOUNT_KEY_PATH}`);
    }
    
    const credentials = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_KEY_PATH, 'utf8'));
    
    console.log(`📧 Service Account Email: ${credentials.client_email}`);
    console.log(`🏗️  Project ID: ${credentials.project_id}`);
    
    // Create JWT client with proper scopes
    const auth = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/drive.file'
      ]
    });
    
    console.log('🔑 Authorizing service account...');
    await auth.authorize();
    console.log('✅ Service account authorized successfully');
    
    // Create API clients
    const drive = google.drive({ version: 'v3', auth });
    const sheets = google.sheets({ version: 'v4', auth });
    
    return { drive, sheets, auth };
  } catch (error) {
    console.error('❌ Error creating Google clients:', error.message);
    throw error;
  }
}

/**
 * Check folder permissions and access
 */
async function checkFolderPermissions(drive, folderId) {
  try {
    console.log(`\n📁 Checking folder permissions for: ${folderId}`);
    
    // Try to get folder metadata
    try {
      const folderResponse = await drive.files.get({
        fileId: folderId,
        fields: 'id, name, owners, permissions, capabilities'
      });
      
      console.log(`✅ Folder found: "${folderResponse.data.name}"`);
      console.log(`📋 Folder ID: ${folderResponse.data.id}`);
      
      if (folderResponse.data.owners) {
        console.log('👥 Folder owners:');
        folderResponse.data.owners.forEach(owner => {
          console.log(`   - ${owner.displayName || owner.emailAddress}`);
        });
      }
      
      // Check capabilities
      if (folderResponse.data.capabilities) {
        const caps = folderResponse.data.capabilities;
        console.log('🔧 Folder capabilities:');
        console.log(`   - Can add children: ${caps.canAddChildren || 'false'}`);
        console.log(`   - Can create: ${caps.canCreate || 'false'}`);
        console.log(`   - Can edit: ${caps.canEdit || 'false'}`);
        console.log(`   - Can list children: ${caps.canListChildren || 'false'}`);
      }
      
    } catch (folderError) {
      console.error('❌ Cannot access folder metadata:', folderError.message);
      return false;
    }
    
    // Try to list folder permissions
    try {
      console.log('\n🔍 Checking folder permissions...');
      const permissionsResponse = await drive.permissions.list({
        fileId: folderId,
        fields: 'permissions(id, type, role, emailAddress, displayName)'
      });
      
      if (permissionsResponse.data.permissions) {
        console.log('📜 Current permissions:');
        permissionsResponse.data.permissions.forEach(perm => {
          console.log(`   - ${perm.type}: ${perm.emailAddress || perm.displayName || 'N/A'} (${perm.role})`);
        });
      }
      
    } catch (permError) {
      console.error('⚠️  Cannot list permissions (this is normal for service accounts):', permError.message);
    }
    
    // Try to list files in folder to test read access
    try {
      console.log('\n📂 Testing folder read access...');
      const filesResponse = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'files(id, name, mimeType)',
        pageSize: 5
      });
      
      console.log(`✅ Can read folder contents (${filesResponse.data.files.length} files found)`);
      if (filesResponse.data.files.length > 0) {
        console.log('📄 Sample files:');
        filesResponse.data.files.slice(0, 3).forEach(file => {
          console.log(`   - ${file.name} (${file.mimeType})`);
        });
      }
      
    } catch (readError) {
      console.error('❌ Cannot read folder contents:', readError.message);
      return false;
    }
    
    return true;
    
  } catch (error) {
    console.error('❌ Error checking folder permissions:', error.message);
    return false;
  }
}

/**
 * Test spreadsheet creation
 */
async function testSpreadsheetCreation(drive, sheets, folderId) {
  try {
    console.log('\n🧪 Testing spreadsheet creation...');
    
    const testTitle = `Permission Test - ${new Date().toISOString()}`;
    
    console.log(`📝 Attempting to create test spreadsheet: "${testTitle}"`);
    
    // Create spreadsheet
    const createResponse = await sheets.spreadsheets.create({
      resource: {
        properties: {
          title: testTitle
        }
      }
    });
    
    const spreadsheetId = createResponse.data.spreadsheetId;
    console.log(`✅ Spreadsheet created successfully: ${spreadsheetId}`);
    
    // Move to target folder
    console.log('📁 Moving spreadsheet to target folder...');
    
    await drive.files.update({
      fileId: spreadsheetId,
      addParents: folderId,
      fields: 'id, parents'
    });
    
    console.log('✅ Spreadsheet moved to target folder successfully');
    
    // Clean up - delete test spreadsheet
    console.log('🧹 Cleaning up test spreadsheet...');
    await drive.files.delete({
      fileId: spreadsheetId
    });
    
    console.log('✅ Test spreadsheet deleted successfully');
    console.log('🎉 PERMISSION TEST PASSED! Your service account can create spreadsheets.');
    
    return true;
    
  } catch (error) {
    console.error('❌ PERMISSION TEST FAILED:', error.message);
    
    if (error.message.includes('The caller does not have permission')) {
      console.log('\n🚨 DIAGNOSIS: Service account lacks permission to create files');
      console.log('📋 SOLUTION STEPS:');
      console.log('1. Share the target folder with your service account email');
      console.log('2. Grant "Editor" or "Content Manager" role');
      console.log('3. Ensure Google Drive API is enabled in Google Cloud Console');
      console.log('4. Ensure Google Sheets API is enabled in Google Cloud Console');
    }
    
    return false;
  }
}

/**
 * Provide step-by-step fix instructions
 */
function provideFix() {
  console.log('\n🔧 STEP-BY-STEP FIX INSTRUCTIONS:');
  console.log('=====================================');
  
  console.log('\n1️⃣  SHARE FOLDER WITH SERVICE ACCOUNT:');
  console.log('   a. Open Google Drive in your browser');
  console.log('   b. Navigate to the target folder (ID: 1O0In92io6PksS-VEdr1lyD-VfVC6mVV3)');
  console.log('   c. Right-click the folder and select "Share"');
  console.log('   d. Add this email: sprout@oceanic-oxide-466512-b9.iam.gserviceaccount.com');
  console.log('   e. Set role to "Editor" or "Content Manager"');
  console.log('   f. Click "Send" (uncheck "Notify people" if you want)');
  
  console.log('\n2️⃣  VERIFY GOOGLE CLOUD CONSOLE SETTINGS:');
  console.log('   a. Go to: https://console.cloud.google.com/');
  console.log('   b. Select project: oceanic-oxide-466512-b9');
  console.log('   c. Go to "APIs & Services" > "Library"');
  console.log('   d. Search for "Google Drive API" and ensure it\'s ENABLED');
  console.log('   e. Search for "Google Sheets API" and ensure it\'s ENABLED');
  
  console.log('\n3️⃣  CHECK SERVICE ACCOUNT PERMISSIONS:');
  console.log('   a. Go to "IAM & Admin" > "Service Accounts"');
  console.log('   b. Find: sprout@oceanic-oxide-466512-b9.iam.gserviceaccount.com');
  console.log('   c. Ensure it has "Editor" role or appropriate Drive permissions');
  
  console.log('\n4️⃣  TEST THE FIX:');
  console.log('   a. Run this script again: node fix-permissions.js');
  console.log('   b. If test passes, run your main script: node simple-analytics.js');
  
  console.log('\n📞 ALTERNATIVE APPROACH:');
  console.log('   If sharing doesn\'t work, you can:');
  console.log('   1. Create spreadsheets in your personal Drive first');
  console.log('   2. Then move them to the shared folder');
  console.log('   3. Or use a different folder that\'s already shared');
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 Google Drive Permission Fix Tool');
  console.log('===================================');
  
  try {
    // Create Google clients
    const { drive, sheets } = await createGoogleClients();
    
    // Check folder permissions
    const folderAccessible = await checkFolderPermissions(drive, TARGET_FOLDER_ID);
    
    if (!folderAccessible) {
      console.log('\n❌ Folder is not accessible or has permission issues');
      provideFix();
      return;
    }
    
    // Test spreadsheet creation
    const canCreateSpreadsheets = await testSpreadsheetCreation(drive, sheets, TARGET_FOLDER_ID);
    
    if (!canCreateSpreadsheets) {
      provideFix();
      return;
    }
    
    console.log('\n🎉 SUCCESS! All permissions are working correctly.');
    console.log('✅ You can now run your main script: node simple-analytics.js');
    
  } catch (error) {
    console.error('\n💥 Critical error:', error.message);
    provideFix();
  }
}

// Run the fix tool
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  createGoogleClients,
  checkFolderPermissions,
  testSpreadsheetCreation
};

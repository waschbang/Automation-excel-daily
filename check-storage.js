const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

async function checkStorage() {
  try {
    // Load service account credentials
    const serviceAccountPath = path.join(__dirname, 'service-account-key.json');
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    
    // Create JWT client
    const auth = new google.auth.JWT(
      serviceAccount.client_email,
      null,
      serviceAccount.private_key,
      ['https://www.googleapis.com/auth/drive.metadata.readonly']
    );

    // Initialize the Drive API
    const drive = google.drive({ version: 'v3', auth });

    console.log('🔍 Fetching storage quota information...');
    console.log(`Service Account: ${serviceAccount.client_email}\n`);

    // Get storage quota information
    const about = await drive.about.get({
      fields: 'storageQuota,user',
    });

    const quota = about.data.storageQuota;
    const user = about.data.user;

    // Convert bytes to GB for readability
    const bytesToGB = (bytes) => (bytes / (1024 * 1024 * 1024)).toFixed(2);

    console.log('📊 STORAGE QUOTA INFORMATION:');
    console.log('----------------------------');
    console.log(`👤 User: ${user.displayName} (${user.emailAddress})`);
    console.log(`💾 Storage Used: ${bytesToGB(quota.usage)} GB`);
    console.log(`📂 Storage in Drive: ${bytesToGB(quota.usageInDrive)} GB`);
    console.log(`🗑️  Storage in Trash: ${bytesToGB(quota.usageInDriveTrash || 0)} GB`);
    
    if (quota.limit) {
      console.log(`🔝 Storage Limit: ${bytesToGB(quota.limit)} GB`);
      const usagePercent = ((quota.usage / quota.limit) * 100).toFixed(2);
      console.log(`📈 Usage: ${usagePercent}% of limit`);
    } else {
      console.log('🔝 Storage Limit: Unlimited (Google Workspace account)');
    }
    
    if (quota.usage > 0 && quota.limit && quota.usage >= quota.limit) {
      console.log('\n❌ WARNING: Storage quota exceeded! You need to free up space.');
    } else if (quota.limit === 0) {
      console.log('\n⚠️  WARNING: This account has  GB storage limit. You may need to request an increase.');
    } else {
      console.log('\n✅ Storage is within limits.');
    }

  } catch (error) {
    console.error('❌ Error checking storage quota:', error.message);
    if (error.message.includes('insufficientFilePermissions')) {
      console.log('\nℹ️  The service account needs the "View your Google Drive account information" permission.');
      console.log('   Please enable the Google Drive API in the Google Cloud Console and make sure the service account has the Viewer role at the project level.');
    }
  }
}

checkStorage();

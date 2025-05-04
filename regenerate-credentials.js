#!/usr/bin/env node

/**
 * Regenerate Drive Credentials
 * ============================
 * This script regenerates the drive-credentials.json file from the original credentials.json file.
 * Use this when you encounter JWT authentication errors or when the credentials have expired.
 */

const path = require('path');
const fs = require('fs');
const driveUtils = require('./utils/drive');

// Paths
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const DRIVE_CREDENTIALS_PATH = path.join(__dirname, 'drive-credentials.json');

/**
 * Main function to regenerate drive credentials
 */
const main = async () => {
  console.log('Starting Drive Credentials Regeneration');
  
  // Check if the original credentials file exists
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.error(`Error: Original credentials file not found at ${CREDENTIALS_PATH}`);
    console.error('Please place your service account credentials file at this location first.');
    process.exit(1);
  }
  
  // Check if drive-credentials.json exists and delete it if it does
  if (fs.existsSync(DRIVE_CREDENTIALS_PATH)) {
    console.log(`Removing existing drive credentials file at ${DRIVE_CREDENTIALS_PATH}`);
    fs.unlinkSync(DRIVE_CREDENTIALS_PATH);
  }
  
  // Regenerate the drive credentials
  const success = await driveUtils.regenerateDriveCredentials(CREDENTIALS_PATH, DRIVE_CREDENTIALS_PATH);
  
  if (success) {
    console.log('Drive credentials regenerated successfully!');
    console.log(`New drive credentials file created at: ${DRIVE_CREDENTIALS_PATH}`);
    console.log('\nYou can now run your scripts with the new credentials.');
  } else {
    console.error('Failed to regenerate drive credentials.');
    console.error('Please check the error messages above and try again.');
    process.exit(1);
  }
};

// Run the main function
main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});

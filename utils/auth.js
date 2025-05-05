/**
 * Google API Authentication Utilities
 * 
 * This module provides authentication utilities for Google APIs using a service account.
 * It handles loading credentials from a service account key file and creating authenticated clients.
 */
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

/**
 * Authenticate with Google APIs using credentials
 * @param {string} keyFilePath - Path to the credentials file (service account key or OAuth credentials)
 * @returns {Promise<{auth: any, drive: google.drive.v3.Drive, sheets: google.sheets.v4.Sheets}>}
 */
const authenticateWithServiceAccount = async (keyFilePath) => {
  try {
    console.log(`Authenticating with credentials from: ${keyFilePath}`);
    
    // Check if the key file exists
    if (!fs.existsSync(keyFilePath)) {
      // Try to find credentials.json as fallback
      const credentialsPath = path.join(path.dirname(keyFilePath), 'credentials.json');
      if (fs.existsSync(credentialsPath)) {
        console.log(`Service account key not found, falling back to: ${credentialsPath}`);
        return authenticateWithOAuth(credentialsPath);
      }
      throw new Error(`Credentials file not found at: ${keyFilePath}`);
    }
    
    // Read the file to determine what type of credentials we have
    const fileContent = fs.readFileSync(keyFilePath, 'utf8');
    let credentials;
    
    try {
      credentials = JSON.parse(fileContent);
    } catch (parseError) {
      throw new Error(`Invalid credentials file format: ${parseError.message}`);
    }
    
    // Check if this is a service account key
    if (credentials.type === 'service_account' && credentials.private_key && credentials.client_email) {
      return authenticateWithServiceAccountKey(credentials);
    } 
    // Check if this is an OAuth client credentials file
    else if (credentials.installed || credentials.web) {
      return authenticateWithOAuth(keyFilePath);
    }
    // Check if this is a saved OAuth token
    else if (credentials.access_token || credentials.refresh_token) {
      return authenticateWithSavedToken(credentials);
    }
    else {
      throw new Error('Unknown credentials format. File must contain either service account key or OAuth credentials.');
    }
  } catch (error) {
    console.error(`Authentication error: ${error.message}`);
    
    // Provide more specific error messages based on the error type
    if (error.message.includes('not found')) {
      console.error('\nThe credentials file is missing. Please ensure you have:');
      console.error('1. Created either a service account key or OAuth credentials in Google Cloud Console');
      console.error('2. Downloaded the credentials file');
      console.error(`3. Placed the file at the correct location`);
    } else if (error.message.includes('invalid_grant') || error.message.includes('Invalid JWT')) {
      console.error('\nThe credentials are invalid. Please ensure:');
      console.error('1. The credentials file contains valid data');
      console.error('2. The service account or OAuth client has not been deleted or disabled');
      console.error('3. The key or token has not been revoked');
    } else if (error.message.includes('permission')) {
      console.error('\nThe authenticated account does not have permission to access the requested resource. Please ensure:');
      console.error('1. The account has been granted access to the Google Drive folders');
      console.error('2. The account has the necessary permissions (e.g., Drive Editor, Sheets Editor)');
    }
    
    throw error;
  }
};

/**
 * Authenticate with a service account key
 * @param {Object} credentials - Service account credentials object
 * @returns {Promise<{auth: any, drive: google.drive.v3.Drive, sheets: google.sheets.v4.Sheets}>}
 */
const authenticateWithServiceAccountKey = async (credentials) => {
  try {
    console.log(`Authenticating with service account: ${credentials.client_email}`);
    
    // Create a JWT client with more direct approach
    const auth = new google.auth.JWT(
      credentials.client_email,
      null,
      credentials.private_key,
      [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive'
      ]
    );
    
    // Authorize the client
    await auth.authorize();
    
    // Create Drive and Sheets clients
    const drive = google.drive({ version: 'v3', auth });
    const sheets = google.sheets({ version: 'v4', auth });
    
    return { auth, drive, sheets };
  } catch (error) {
    console.error(`Service account authentication error: ${error.message}`);
    throw error;
  }
};

/**
 * Authenticate with OAuth credentials
 * @param {string} credentialsPath - Path to the OAuth credentials file
 * @returns {Promise<{auth: any, drive: google.drive.v3.Drive, sheets: google.sheets.v4.Sheets}>}
 */
const authenticateWithOAuth = async (credentialsPath) => {
  try {
    console.log(`Authenticating with OAuth credentials from: ${credentialsPath}`);
    
    // Read credentials file
    const content = fs.readFileSync(credentialsPath, 'utf8');
    const credentials = JSON.parse(content);
    
    // Get client credentials
    const clientCredentials = credentials.installed || credentials.web;
    if (!clientCredentials) {
      throw new Error('Invalid OAuth credentials format');
    }
    
    // Create OAuth client
    const oauth2Client = new google.auth.OAuth2(
      clientCredentials.client_id,
      clientCredentials.client_secret,
      clientCredentials.redirect_uris[0]
    );
    
    // Check if we have a token file
    const tokenPath = path.join(path.dirname(credentialsPath), 'token.json');
    if (fs.existsSync(tokenPath)) {
      const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
      oauth2Client.setCredentials(token);
    } else {
      console.log('No OAuth token found. Using default authentication.');
    }
    
    // Create Drive and Sheets clients
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
    
    return { auth: oauth2Client, drive, sheets };
  } catch (error) {
    console.error(`OAuth authentication error: ${error.message}`);
    throw error;
  }
};

/**
 * Authenticate with a saved OAuth token
 * @param {Object} token - Saved OAuth token
 * @returns {Promise<{auth: any, drive: google.drive.v3.Drive, sheets: google.sheets.v4.Sheets}>}
 */
const authenticateWithSavedToken = async (token) => {
  try {
    console.log('Authenticating with saved OAuth token');
    
    // Create OAuth client with default values (we only need the token)
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials(token);
    
    // Create Drive and Sheets clients
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
    
    return { auth: oauth2Client, drive, sheets };
  } catch (error) {
    console.error(`Token authentication error: ${error.message}`);
    throw error;
  }
};

/**
 * Verify access to a specific Google Drive folder
 * @param {google.drive.v3.Drive} drive - Authenticated Drive client
 * @param {string} folderId - ID of the folder to verify access to
 * @returns {Promise<boolean>} True if the folder is accessible, false otherwise
 */
const verifyFolderAccess = async (drive, folderId) => {
  try {
    console.log(`Verifying access to folder: ${folderId}`);
    
    // Try to get the folder metadata
    const response = await drive.files.get({
      fileId: folderId,
      fields: 'id,name,capabilities(canEdit)'
    });
    
    const file = response.data;
    
    // Check if we have edit permissions
    if (!file.capabilities.canEdit) {
      console.warn(`Warning: The service account has read-only access to folder "${file.name}" (${file.id})`);
      console.warn('You may encounter errors when trying to create or modify files in this folder.');
      return false;
    }
    
    console.log(`Successfully verified access to folder "${file.name}" (${file.id})`);
    return true;
  } catch (error) {
    console.error(`Error verifying folder access: ${error.message}`);
    
    if (error.code === 404) {
      console.error(`\nThe folder with ID ${folderId} was not found. Please ensure:`);
      console.error('1. The folder ID is correct');
      console.error('2. The folder has not been deleted');
    } else if (error.code === 403) {
      console.error(`\nAccess denied to folder with ID ${folderId}. Please ensure:`);
      console.error('1. The folder has been shared with the service account email');
      console.error('2. The service account has at least Editor access to the folder');
    }
    
    return false;
  }
};

module.exports = {
  authenticateWithServiceAccount,
  verifyFolderAccess
};

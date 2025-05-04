#!/usr/bin/env node

/**
 * OAuth 2.0 Setup Script for Google Drive API
 * ===========================================
 * This script helps set up OAuth 2.0 credentials for the Google Drive API.
 * It guides the user through the process of creating OAuth 2.0 credentials
 * and saving them to a file.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { google } = require('googleapis');

// Path to credentials files
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const DRIVE_CREDENTIALS_PATH = path.join(__dirname, 'drive-credentials.json');
const TOKEN_PATH = path.join(__dirname, 'token.json');

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/**
 * Sleep for a specified duration
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Ask a question and get the answer
 * @param {string} question - Question to ask
 * @returns {Promise<string>} - Answer
 */
const askQuestion = (question) => {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
};

/**
 * Main function to set up OAuth 2.0 credentials
 */
const main = async () => {
  try {
    console.log('=== OAuth 2.0 Setup for Google Drive API ===');
    
    // Check if credentials.json exists
    if (!fs.existsSync(CREDENTIALS_PATH)) {
      console.log('\nNo credentials.json file found.');
      console.log('Please follow these steps to create OAuth 2.0 credentials:');
      console.log('1. Go to https://console.cloud.google.com/');
      console.log('2. Create a new project or select an existing one');
      console.log('3. Go to APIs & Services > Dashboard');
      console.log('4. Click "Enable APIs and Services" and enable the Google Drive API and Google Sheets API');
      console.log('5. Go to APIs & Services > Credentials');
      console.log('6. Click "Create Credentials" and select "OAuth client ID"');
      console.log('7. Set the application type to "Desktop app" and give it a name');
      console.log('8. Click "Create" and download the JSON file');
      console.log('9. Save the downloaded file as "credentials.json" in the same directory as this script');
      
      const proceed = await askQuestion('\nHave you completed these steps and saved the credentials.json file? (yes/no): ');
      if (proceed.toLowerCase() !== 'yes') {
        console.log('Setup aborted. Please run this script again after completing the steps.');
        rl.close();
        return;
      }
      
      // Check again if credentials.json exists
      if (!fs.existsSync(CREDENTIALS_PATH)) {
        console.log('Error: credentials.json file still not found. Please save it and try again.');
        rl.close();
        return;
      }
    }
    
    console.log('\nReading credentials.json file...');
    const credentialsContent = fs.readFileSync(CREDENTIALS_PATH, 'utf8');
    let credentials;
    
    try {
      credentials = JSON.parse(credentialsContent);
      
      // Check if it's the correct format (OAuth 2.0 client credentials)
      if (!credentials.installed && !credentials.web) {
        console.log('Error: The credentials.json file is not in the correct format for OAuth 2.0 client credentials.');
        console.log('Please make sure you downloaded the correct type of credentials (OAuth 2.0 Client ID).');
        rl.close();
        return;
      }
      
      // Extract client ID and client secret
      const clientId = credentials.installed?.client_id || credentials.web?.client_id;
      const clientSecret = credentials.installed?.client_secret || credentials.web?.client_secret;
      
      if (!clientId || !clientSecret) {
        console.log('Error: The credentials.json file is missing client_id or client_secret.');
        rl.close();
        return;
      }
      
      console.log('Credentials file is valid.');
      
      // Create OAuth2 client
      const redirectUri = credentials.installed?.redirect_uris?.[0] || 'urn:ietf:wg:oauth:2.0:oob';
      const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
      
      // Generate authorization URL
      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: [
          'https://www.googleapis.com/auth/spreadsheets',
          'https://www.googleapis.com/auth/drive'
        ],
        prompt: 'consent' // Force to get refresh token
      });
      
      console.log('\nPlease visit the following URL to authorize this application:');
      console.log(authUrl);
      
      // Get authorization code from user
      const authCode = await askQuestion('\nEnter the authorization code from the browser: ');
      
      if (!authCode.trim()) {
        console.log('Error: No authorization code provided. Setup aborted.');
        rl.close();
        return;
      }
      
      // Exchange authorization code for tokens
      console.log('\nExchanging authorization code for tokens...');
      const { tokens } = await oauth2Client.getToken(authCode);
      oauth2Client.setCredentials(tokens);
      
      // Create drive credentials with the token
      const driveCredentials = {
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_type: tokens.token_type || 'Bearer',
        expiry_date: tokens.expiry_date || (new Date().getTime() + 3600 * 1000)
      };
      
      // Save tokens
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
      console.log(`Token saved to ${TOKEN_PATH}`);
      
      // Save drive credentials
      fs.writeFileSync(DRIVE_CREDENTIALS_PATH, JSON.stringify(driveCredentials, null, 2));
      console.log(`Drive credentials saved to ${DRIVE_CREDENTIALS_PATH}`);
      
      console.log('\nSetup completed successfully!');
      console.log('You can now run your application with OAuth 2.0 authentication.');
      
    } catch (parseError) {
      console.error(`Error parsing credentials.json: ${parseError.message}`);
      rl.close();
      return;
    }
    
  } catch (error) {
    console.error(`Error during setup: ${error.message}`);
  } finally {
    rl.close();
  }
};

// Run the main function
main().catch(err => console.error('Unhandled error:', err));

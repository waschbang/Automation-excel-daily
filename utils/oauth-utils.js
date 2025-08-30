/**
 * OAuth 2.0 Utilities for Google Drive/Sheets API Access
 */
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const readline = require('readline');

// If modifying these scopes, delete token.json.
const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive'
];

// The file token.json stores the user's access and refresh tokens
const TOKEN_PATH = path.join(__dirname, '../token.json');

/**
 * Create an OAuth2 client with the given credentials
 * @param {Object} credentials The authorization client credentials
 * @return {Promise<google.auth.OAuth2>}
 */
async function authorize() {
  // Hardcoded client credentials for simplicity
  const credentials = {
    client_id: '746176311500-0a7do8eqjqhl97ebqnmgpi0kvnt8gnmu.apps.googleusercontent.com',
    client_secret: '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',
    redirect_uris: ['http://localhost:3000/oauth2callback']
  };
  
  const oAuth2Client = new google.auth.OAuth2(
    credentials.client_id,
    credentials.client_secret,
    credentials.redirect_uris[0]
  );

  // Check if we have previously stored a token
  try {
    if (fs.existsSync(TOKEN_PATH)) {
      const token = fs.readFileSync(TOKEN_PATH);
      oAuth2Client.setCredentials(JSON.parse(token));
      console.log('Using existing OAuth token');
      return oAuth2Client;
    } else {
      return getNewToken(oAuth2Client);
    }
  } catch (err) {
    console.error('Error loading OAuth token:', err);
    return getNewToken(oAuth2Client);
  }
}

/**
 * Get and store new token after prompting for user authorization
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for
 * @return {Promise<google.auth.OAuth2>}
 */
async function getNewToken(oAuth2Client) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });
  console.log('Authorize this app by visiting this URL:', authUrl);
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve, reject) => {
    rl.question('Enter the code from that page here: ', (code) => {
      rl.close();
      oAuth2Client.getToken(code, (err, token) => {
        if (err) {
          console.error('Error retrieving access token', err);
          return reject(err);
        }
        oAuth2Client.setCredentials(token);
        // Store the token to disk for later program executions
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
        console.log('Token stored to', TOKEN_PATH);
        resolve(oAuth2Client);
      });
    });
  });
}

/**
 * Create Google Drive and Sheets clients using OAuth
 * @return {Promise<{drive: google.drive.v3.Drive, sheets: google.sheets.v4.Sheets, auth: google.auth.OAuth2}>}
 */
async function createOAuthClients() {
  try {
    console.log('⏳ Setting up OAuth authentication...');
    const auth = await authorize();
    
    // Create Drive and Sheets clients
    const drive = google.drive({ version: 'v3', auth });
    const sheets = google.sheets({ version: 'v4', auth });
    
    console.log('✅ OAuth authentication successful');
    return { drive, sheets, auth };
  } catch (error) {
    console.error('❌ OAuth authentication failed:', error.message);
    throw error;
  }
}

// Export functions
module.exports = {
  authorize,
  createOAuthClients
};

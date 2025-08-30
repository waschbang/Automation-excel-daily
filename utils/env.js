require('dotenv').config();

/**
 * Get Google Cloud Service Account credentials from environment variables
 * @returns {Object} Service account credentials object
 */
function getServiceAccountCredentials() {
  return {
    type: process.env.GOOGLE_SERVICE_ACCOUNT_TYPE || 'service_account',
    project_id: process.env.GOOGLE_PROJECT_ID,
    private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
    private_key: process.env.GOOGLE_PRIVATE_KEY ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    client_id: process.env.GOOGLE_CLIENT_ID,
    auth_uri: process.env.GOOGLE_AUTH_URI || 'https://accounts.google.com/o/oauth2/auth',
    token_uri: process.env.GOOGLE_TOKEN_URI || 'https://oauth2.googleapis.com/token',
    auth_provider_x509_cert_url: process.env.GOOGLE_AUTH_PROVIDER_X509_CERT_URL || 'https://www.googleapis.com/oauth2/v1/certs',
    client_x509_cert_url: process.env.GOOGLE_CLIENT_X509_CERT_URL,
    universe_domain: process.env.GOOGLE_UNIVERSE_DOMAIN || 'googleapis.com'
  };
}

/**
 * Get Google OAuth client credentials from environment variables
 * @returns {Object} OAuth client credentials object
 */
function getOAuthClientCredentials() {
  return {
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
    client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    redirect_uris: [process.env.GOOGLE_OAUTH_REDIRECT_URI || 'http://localhost:3000/oauth2callback']
  };
}

/**
 * Validate that all required environment variables are set
 * @throws {Error} If required variables are missing
 */
function validateEnvironment() {
  const requiredVars = [
    'GOOGLE_PROJECT_ID',
    'GOOGLE_PRIVATE_KEY',
    'GOOGLE_CLIENT_EMAIL',
    'GOOGLE_OAUTH_CLIENT_ID',
    'GOOGLE_OAUTH_CLIENT_SECRET'
  ];

  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

module.exports = {
  getServiceAccountCredentials,
  getOAuthClientCredentials,
  validateEnvironment
};

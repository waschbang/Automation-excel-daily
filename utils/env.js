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
  // Allow two auth modes:
  // 1) Application Default Credentials via GOOGLE_APPLICATION_CREDENTIALS
  // 2) Inline Service Account env vars (legacy fallback)
  const hasADC = !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const hasInlineSA = !!(process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY);

  if (!hasADC && !hasInlineSA) {
    throw new Error('Missing credentials. Set GOOGLE_APPLICATION_CREDENTIALS to a JSON key path, or provide GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY.');
  }

  // OAuth client is optional. If partially provided, enforce the pair.
  const hasOAuthId = !!process.env.GOOGLE_OAUTH_CLIENT_ID;
  const hasOAuthSecret = !!process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if ((hasOAuthId && !hasOAuthSecret) || (!hasOAuthId && hasOAuthSecret)) {
    throw new Error('OAuth configuration incomplete. Provide both GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET, or neither.');
  }
}

module.exports = {
  getServiceAccountCredentials,
  getOAuthClientCredentials,
  validateEnvironment
};

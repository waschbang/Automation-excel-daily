require('dotenv').config();

/**
 * Centralised configuration, loaded from environment variables.
 *
 * Single source of truth for every secret, identifier, and runtime setting
 * the app reads. Any new config surface must land here (not in the consuming
 * module) so rotation and overrides stay in one place.
 *
 * Validation: required values are checked on first call to `getConfig()`
 * (lazy, not at import time) so tooling that merely requires this module
 * for the legacy Google-credential helpers does not trip the validator.
 */

const BASE_SPROUT_URL = 'https://api.sproutsocial.com/v1';

const parseList = (v) => (v || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

let _validated = false;
let _config = null;

function buildConfig() {
  const cfg = {
    sprout: {
      customerId: process.env.SPROUT_CUSTOMER_ID,
      apiToken: process.env.SPROUT_API_TOKEN,
      baseUrl: BASE_SPROUT_URL,
    },
    drive: {
      folderId: process.env.DRIVE_FOLDER_ID,
    },
    mail: {
      user: process.env.GMAIL_USER,
      password: process.env.GMAIL_APP_PASSWORD,
      from: process.env.MAIL_FROM || process.env.GMAIL_USER,
      recipients: parseList(process.env.MAIL_RECIPIENTS),
    },
  };

  // Convenience: derived URLs
  cfg.sprout.metadataUrl = `${cfg.sprout.baseUrl}/${cfg.sprout.customerId}/metadata/customer`;
  cfg.sprout.analyticsUrl = `${cfg.sprout.baseUrl}/${cfg.sprout.customerId}/analytics/profiles`;
  cfg.sprout.postsUrl = `${cfg.sprout.baseUrl}/${cfg.sprout.customerId}/analytics/posts`;

  return cfg;
}

function validate(cfg) {
  const missing = [];
  if (!cfg.sprout.customerId) missing.push('SPROUT_CUSTOMER_ID');
  if (!cfg.sprout.apiToken) missing.push('SPROUT_API_TOKEN');
  if (!cfg.drive.folderId) missing.push('DRIVE_FOLDER_ID');
  if (!cfg.mail.user) missing.push('GMAIL_USER');
  if (!cfg.mail.password) missing.push('GMAIL_APP_PASSWORD');
  if (!cfg.mail.recipients.length) missing.push('MAIL_RECIPIENTS');

  if (missing.length) {
    throw new Error(
      `Missing required env vars: ${missing.join(', ')}. ` +
      `Copy .env.example to .env and fill in the values.`
    );
  }
}

/**
 * Return the validated config. Lazy — first call validates and caches.
 * Subsequent calls return the cached object.
 * @returns {Object}
 */
function getConfig() {
  if (!_config) _config = buildConfig();
  if (!_validated) {
    validate(_config);
    _validated = true;
  }
  return _config;
}

// -------------------------------------------------------------------
// Legacy Google-credential helpers (unchanged). Kept so googleAuth.js
// can continue its ADC-first / service-account fallback without churn.
// -------------------------------------------------------------------

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
 * Validate Google auth env is present in one of two supported forms.
 * @throws {Error} If required variables are missing
 */
function validateEnvironment() {
  const hasADC = !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const hasInlineSA = !!(process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY);

  if (!hasADC && !hasInlineSA) {
    throw new Error('Missing credentials. Set GOOGLE_APPLICATION_CREDENTIALS to a JSON key path, or provide GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY.');
  }

  const hasOAuthId = !!process.env.GOOGLE_OAUTH_CLIENT_ID;
  const hasOAuthSecret = !!process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if ((hasOAuthId && !hasOAuthSecret) || (!hasOAuthId && hasOAuthSecret)) {
    throw new Error('OAuth configuration incomplete. Provide both GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET, or neither.');
  }
}

module.exports = {
  getConfig,
  // Legacy exports retained for googleAuth.js
  getServiceAccountCredentials,
  getOAuthClientCredentials,
  validateEnvironment,
};

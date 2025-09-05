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
    private_key: selectPrivateKey(),
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
    // Accept either raw or base64-encoded private key
    (process.env.GOOGLE_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY_BASE64) ? null : 'GOOGLE_PRIVATE_KEY',
    'GOOGLE_CLIENT_EMAIL',
    'GOOGLE_OAUTH_CLIENT_ID',
    'GOOGLE_OAUTH_CLIENT_SECRET'
  ];

  const missing = requiredVars.filter(varName => varName && !process.env[varName]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

/**
 * Return normalized private key from environment variables or file
 * Tries in this order:
 * 1. GOOGLE_PRIVATE_KEY (raw)
 * 2. GOOGLE_PRIVATE_KEY_BASE64 (base64 encoded)
 * 3. GOOGLE_PRIVATE_KEY_FILE (path to key file)
 * 4. ./private-key.json or ./key.json (common key file locations)
 * @returns {string|undefined}
 */
function selectPrivateKey() {
  const fs = require('fs');
  const path = require('path');
  
  // 1. Try raw environment variable
  if (process.env.GOOGLE_PRIVATE_KEY) {
    console.log('Using private key from GOOGLE_PRIVATE_KEY environment variable');
    return normalizePrivateKey(process.env.GOOGLE_PRIVATE_KEY);
  }
  
  // 2. Try base64-encoded environment variable
  if (process.env.GOOGLE_PRIVATE_KEY_BASE64) {
    try {
      console.log('Decoding private key from GOOGLE_PRIVATE_KEY_BASE64');
      const decoded = Buffer.from(process.env.GOOGLE_PRIVATE_KEY_BASE64, 'base64').toString('utf8');
      return normalizePrivateKey(decoded);
    } catch (error) {
      console.error('Failed to decode base64 private key:', error.message);
    }
  }
  
  // 3. Try key file from environment variable path
  if (process.env.GOOGLE_PRIVATE_KEY_FILE) {
    try {
      console.log(`Loading private key from file: ${process.env.GOOGLE_PRIVATE_KEY_FILE}`);
      const keyContent = fs.readFileSync(process.env.GOOGLE_PRIVATE_KEY_FILE, 'utf8');
      return normalizePrivateKey(keyContent);
    } catch (error) {
      console.error(`Failed to read private key file (${process.env.GOOGLE_PRIVATE_KEY_FILE}):`, error.message);
    }
  }
  
  // 4. Try common key file locations as last resort
  const possibleKeyFiles = [
    path.join(process.cwd(), 'private-key.json'),
    path.join(process.cwd(), 'key.json'),
    path.join(process.cwd(), 'service-account-key.json')
  ];
  
  for (const keyFile of possibleKeyFiles) {
    try {
      if (fs.existsSync(keyFile)) {
        console.log(`Found and loading private key from: ${keyFile}`);
        const keyContent = fs.readFileSync(keyFile, 'utf8');
        // If it's a JSON file, extract the private_key field
        try {
          const keyJson = JSON.parse(keyContent);
          if (keyJson.private_key) {
            return normalizePrivateKey(keyJson.private_key);
          }
        } catch (e) {
          // If not JSON, try to use as raw key
          return normalizePrivateKey(keyContent);
        }
      }
    } catch (error) {
      console.error(`Error reading key file (${keyFile}):`, error.message);
    }
  }
  
  console.error('No valid private key source found. Please set one of:');
  console.error('- GOOGLE_PRIVATE_KEY environment variable');
  console.error('- GOOGLE_PRIVATE_KEY_BASE64 environment variable');
  console.error('- GOOGLE_PRIVATE_KEY_FILE pointing to a key file');
  console.error('- A key file named private-key.json, key.json, or service-account-key.json in the project root');
  
  return undefined;
}

/**
 * Normalize the private key value read from environment variables.
 * Handles cases where the key is provided with:
 * - Escaped newlines ("\n")
 * - Actual newlines
 * - Windows CRLF ("\r\n") line endings
 * - Surrounding quotes accidentally included by shell or .env formatting
 * Ensures the string matches the PEM format OpenSSL expects.
 * @param {string|undefined} value
 * @returns {string|undefined}
 */
function normalizePrivateKey(value) {
  console.log('Normalizing private key...');
  console.log('Input type:', typeof value);
  console.log('Input length:', value?.length);
  
  if (!value) {
    console.log('No private key provided');
    return undefined;
  }
  
  let v = String(value);
  console.log('After string conversion, length:', v.length);
  
  // Trim BOM and whitespace
  const original = v;
  v = v.replace(/^\uFEFF/, '').trim();
  if (original !== v) {
    console.log('Trimmed BOM/whitespace');
  }
  
  // Remove accidental surrounding quotes (single or double)
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith('\'') && v.endsWith('\''))) {
    console.log('Removed surrounding quotes');
    v = v.slice(1, -1);
  }
  
  // Convert escaped newlines to actual newlines
  if (v.includes('\\n')) {
    console.log('Converting escaped newlines to actual newlines');
    v = v.replace(/\\\\n/g, '\\n'); // First unescape any double-escaped newlines
    v = v.replace(/\\n/g, '\n');
  }
  
  // Normalize CRLF to LF
  if (v.includes('\r\n')) {
    console.log('Normalizing CRLF to LF');
    v = v.replace(/\r\n/g, '\n');
  }
  
  // Ensure header/footer are on their own lines and properly formatted
  const hasBegin = v.includes('-----BEGIN PRIVATE KEY-----');
  const hasEnd = v.includes('-----END PRIVATE KEY-----');
  
  if (!hasBegin || !hasEnd) {
    console.warn('WARNING: Private key is missing standard PEM headers/footers');
  }
  
  // Clean up any extra spaces around headers/footers
  v = v.replace(/\s*-----BEGIN PRIVATE KEY-----\s*/g, '-----BEGIN PRIVATE KEY-----\n');
  v = v.replace(/\s*-----END PRIVATE KEY-----\s*/g, '\n-----END PRIVATE KEY-----');
  
  // Ensure we have proper line endings
  v = v.replace(/\r/g, ''); // Remove any remaining CRs
  
  // Guarantee trailing newline (some OpenSSL versions are picky)
  if (!v.endsWith('\n')) {
    console.log('Adding missing trailing newline');
    v += '\n';
  }
  
  console.log('Final key length:', v.length);
  console.log('Key starts with:', v.substring(0, 30) + '...');
  console.log('Key ends with:', '...' + v.substring(v.length - 30));
  
  return v;
}

module.exports = {
  getServiceAccountCredentials,
  getOAuthClientCredentials,
  validateEnvironment,
  normalizePrivateKey,
  selectPrivateKey
};

# Automation Excel Daily

This project automates daily Excel operations using Google APIs.

## Setup Instructions

### 1. Environment Variables

To use this project securely, you need to set up environment variables. Copy the contents from `env-template.txt` and create a `.env` file in the root directory.

**Important**: Never commit the `.env` file to version control!

### 2. Required Environment Variables

#### Google Cloud Service Account Credentials
```
GOOGLE_SERVICE_ACCOUNT_TYPE=service_account
GOOGLE_PROJECT_ID=your-project-id
GOOGLE_PRIVATE_KEY_ID=your-private-key-id
GOOGLE_PRIVATE_KEY="your-private-key"
GOOGLE_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_AUTH_URI=https://accounts.google.com/o/oauth2/auth
GOOGLE_TOKEN_URI=https://oauth2.googleapis.com/token
GOOGLE_AUTH_PROVIDER_X509_CERT_URL=https://www.googleapis.com/oauth2/v1/certs
GOOGLE_CLIENT_X509_CERT_URL=your-cert-url
GOOGLE_UNIVERSE_DOMAIN=googleapis.com
```

#### Google OAuth Client Credentials
```
GOOGLE_OAUTH_CLIENT_ID=your-oauth-client-id
GOOGLE_OAUTH_CLIENT_SECRET=your-oauth-client-secret
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/oauth2callback
```

### 3. Installation

```bash
npm install
```

### 4. Usage

The project now uses environment variables for authentication. Make sure your `.env` file is properly configured before running any scripts.

## Security Notes

- The `.env` file is automatically ignored by Git
- Sensitive credential files like `service-account-key.json` are also ignored
- All hardcoded credentials have been removed from the codebase
- Use environment variables for all sensitive information

## Troubleshooting

If you encounter authentication errors:

1. Verify all required environment variables are set
2. Check that your Google Cloud project has the necessary APIs enabled
3. Ensure your service account has the required permissions
4. Verify OAuth consent screen is configured if using OAuth authentication

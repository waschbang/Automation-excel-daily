# Sprout Social Analytics Automation

This automation script fetches social media analytics data from the Sprout Social API and updates Google Sheets with the latest metrics. It's designed to be highly reliable and crash-proof, ensuring continuous operation in production environments.

## Features

- **Daily Updates**: Automatically fetches data from January 1, 2024 up to the current date
- **Crash-Proof**: Handles token expiration, API rate limits, and other errors gracefully
- **Multiple Platforms**: Supports Instagram, Facebook, Twitter, LinkedIn, and YouTube
- **Detailed Metrics**: Displays comprehensive analytics with clear column headers
- **Scheduled Execution**: Can be set to run automatically at a specific time each day

## Setup Instructions

1. **Ensure credentials are properly configured**:
   - `credentials.json` - Google service account credentials
   - The script will automatically generate `drive-credentials.json`

2. **Install dependencies**:
   ```
   npm install
   ```

3. **Run the script manually**:
   ```
   node group-analytics.js
   ```

4. **Set up daily automatic updates**:
   ```
   node schedule-daily-update.js
   ```
   
   This will:
   - Run the script immediately
   - Schedule it to run daily at 6:00 AM (configurable in the file)
   - Keep running in the background
   
## Running as a Background Service

For production environments, you should set up the script to run as a background service:

### Windows (Using PM2)

1. Install PM2 globally:
   ```
   npm install -g pm2
   ```

2. Start the scheduler as a service:
   ```
   pm2 start schedule-daily-update.js --name "sprout-analytics"
   ```

3. Set PM2 to start on system boot:
   ```
   pm2 save
   pm2 startup
   ```
   
   Then run the command PM2 provides.

## Monitoring

- Check the `scheduler-logs.txt` file for scheduler activity
- The script provides detailed console output during execution
- All errors are logged but will not cause the script to crash

## Troubleshooting

If you encounter any issues:

1. **Check Google Drive API Quota**: The script implements backoff strategies, but you may still hit quota limits
2. **Verify Credentials**: Ensure your service account has appropriate permissions
3. **Check Network Connectivity**: The script requires internet access to both Sprout Social and Google APIs

## Configuration

Key configuration settings:

- **Start Date**: Fixed at January 1, 2024
- **End Date**: Automatically set to the current date
- **Folder ID**: `1usYEd9TeNI_2gapA-dLK4y27zvvWJO8r`
- **Schedule Time**: 6:00 AM daily (configurable in `schedule-daily-update.js`)

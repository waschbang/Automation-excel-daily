# Sprout Analytics Sequential Scheduler

This scheduler runs both analytics scripts sequentially every day at 11:40 PM.

## What It Does

1. **Runs daily at 11:40 PM** (23:40)
2. **Executes scripts in sequence:**
   - First: `simple-analytics.js`
   - Second: `sprout_april.js` (runs after first completes)
3. **Waits 30 seconds** between scripts to avoid API rate limits
4. **Logs everything** to both console and `scheduler-logs.txt`

## How to Use

### Option 1: Start the Scheduler
```bash
npm start
# or
npm run scheduler
# or
node schedule-daily-update.js
```

### Option 2: Use Windows Batch File
Double-click `start-scheduler.bat`

### Option 3: Use PowerShell
```powershell
.\start-scheduler.ps1
```

## Script Execution Order

1. **simple-analytics.js** runs first
   - Fetches analytics from Sprout Social API
   - Updates Google Sheets with group data
   - Uses folder ID: `1O0In92io6PksS-VEdr1lyD-VfVC6mVV3`

2. **sprout_april.js** runs second (after 30-second delay)
   - Fetches analytics from Sprout Social API
   - Updates Google Sheets with group data
   - Uses folder ID: `13XPLx5l1LuPeJL2Ue03ZztNQUsNgNW06`

## Scheduling Details

- **Time**: 11:40 PM daily (23:40 in 24-hour format)
- **Cron Expression**: `40 23 * * *`
- **Timezone**: System local time
- **Automatic**: Runs every day without manual intervention

## Logging

All scheduler activity is logged to:
- **Console**: Real-time output
- **File**: `scheduler-logs.txt` (appended to daily)

## Manual Execution

You can also run scripts individually:

```bash
# Run first script only
npm run simple

# Run second script only  
npm run april

# Run both sequentially (same as scheduler)
npm start
```

## Stopping the Scheduler

- Press `Ctrl+C` to stop the scheduler
- The scheduler will gracefully shut down

## Requirements

- Node.js 18+ installed
- All dependencies installed (`npm install`)
- Both script files present in the directory
- Proper Google API credentials configured

## Troubleshooting

1. **Check logs**: Look at `scheduler-logs.txt` for detailed execution history
2. **Verify scripts**: Ensure both `simple-analytics.js` and `sprout_april.js` exist
3. **Check credentials**: Verify Google API authentication is working
4. **Monitor execution**: Watch console output for real-time status

## Notes

- The scheduler runs an initial execution on startup (for testing)
- Each script runs independently with its own error handling
- If the first script fails, the second won't run
- 30-second delay between scripts prevents API rate limiting
- All execution times and results are logged for monitoring

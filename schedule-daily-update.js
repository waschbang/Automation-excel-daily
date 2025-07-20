/**
 * Daily Scheduler for Sprout Social Analytics
 * 
 * This script sets up a daily scheduled task to run the group-analytics.js script
 * at a specified time each day. It uses the node-schedule package to handle scheduling.
 */

console.log('SCRIPT STARTING: Sprout Analytics Scheduler');
console.log('Current directory:', __dirname);

const schedule = require('node-schedule');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

// Configuration
const CONFIG = {
  // Time to run the script daily (24-hour format)
  // Default: 6:00 AM - adjust as needed
  hour: 15,
  minute: 19,
  
  // Path to the main analytics script
  scriptPath: '',
  
  // Log file for the scheduler
  logPath: path.join(__dirname, 'scheduler-logs.txt')
};

// Get the absolute path to the analytics script
// First try simple-analytics.js, then fall back to group-analytics.js if it doesn't exist
let scriptPath;
const simpleScriptPath = path.resolve(__dirname, 'simple-analytics.js');
const groupScriptPath = path.resolve(__dirname, 'group-analytics.js');

if (fs.existsSync(simpleScriptPath)) {
  scriptPath = simpleScriptPath;
  console.log('Using simplified analytics script: simple-analytics.js');
} else {
  scriptPath = groupScriptPath;
  console.log('Using standard analytics script: group-analytics.js');
}

CONFIG.scriptPath = scriptPath;

/**
 * Log a message to both console and log file
 * @param {string} message - Message to log
 */
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  
  console.log(logMessage);
  console.log('DEBUG: Log message output to console');
  
  try {
    // Append to log file
    fs.appendFileSync(CONFIG.logPath, logMessage + '\n');
    console.log('DEBUG: Successfully wrote to log file: ' + CONFIG.logPath);
  } catch (error) {
    console.error('ERROR: Failed to write to log file:', error.message);
  }
}

/**
 * Run the analytics script and handle any errors
 */
function runAnalyticsScript() {
  const startTime = new Date();
  log(`\n=== SCHEDULER: STARTING ANALYTICS UPDATE ===`);
  log(`Start time: ${startTime.toLocaleString()}`);
  log(`Folder ID: 1usYEd9TeNI_2gapA-dLK4y27zvvWJO8r`);
  log(`Date range: Today only (${new Date().toISOString().split('T')[0]})`);
  log(`Script path: ${CONFIG.scriptPath}`);
  log(`Max buffer size: 50MB`);
  log(`\n=== EXECUTION STARTING ===`);
  
  // Execute the script with increased buffer size (50MB)
  const child = exec(`node "${CONFIG.scriptPath}"`, { maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
    const endTime = new Date();
    const executionTimeMs = endTime - startTime;
    const executionTimeSec = Math.round(executionTimeMs / 1000);
    const executionTimeMin = Math.round(executionTimeSec / 60 * 10) / 10;
    
    if (error) {
      log(`Error executing script: ${error.message}`);
      log(`Script failed after ${executionTimeMin} minutes (${executionTimeSec} seconds)`);
      return;
    }
    
    if (stderr) {
      log(`Script stderr: ${stderr.substring(0, 1000)}${stderr.length > 1000 ? '...' : ''}`);
    }
    
    log(`Analytics update completed successfully at ${endTime.toLocaleTimeString()}`);
    log(`Total execution time: ${executionTimeMin} minutes (${executionTimeSec} seconds)`);
    log(`Output: ${stdout.substring(0, 500)}...`); // Log first 500 chars of output
  });
  
  // Handle process errors
  child.on('error', (error) => {
    log(`Failed to start script: ${error.message}`);
  });
}

// Schedule the job to run daily at the configured time
const job = schedule.scheduleJob(`${CONFIG.minute} ${CONFIG.hour} * * *`, function() {
  log(`Running scheduled job at ${new Date().toLocaleString()}`);
  runAnalyticsScript();
});

log(`Scheduler set to run DAILY at ${CONFIG.hour}:${CONFIG.minute.toString().padStart(2, '0')}`);

// Run immediately on startup (optional)
// Comment this out if you only want it to run at the scheduled time
log('Running initial analytics update on startup...');
runAnalyticsScript();

// Log that the scheduler is running
const nextRun = job.nextInvocation();
log(`Scheduler started. Next run scheduled for: ${nextRun.toLocaleString()}`);
log(`Script will run daily at ${CONFIG.hour}:${CONFIG.minute.toString().padStart(2, '0')}`);

// Keep the process running
process.on('SIGINT', function() {
  log('Scheduler stopping...');
  job.cancel();
  process.exit(0);
});

// Handle uncaught exceptions to prevent crashes
process.on('uncaughtException', (error) => {
  log(`Uncaught exception in scheduler: ${error.message}`);
  log(error.stack);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  log('Unhandled promise rejection in scheduler');
  log(`Reason: ${reason}`);
});

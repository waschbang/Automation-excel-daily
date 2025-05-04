/**
 * Simple Daily Scheduler for Sprout Social Analytics
 * 
 * This script makes an API call at a specific time each day to update the analytics data.
 * It uses the node-schedule package for scheduling and axios for making API requests.
 */

const schedule = require('node-schedule');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// ===== CONFIGURATION =====
// Set the time you want the script to run daily (24-hour format)
const SCHEDULE_TIME = {
  HOUR: 17,    // 6 AM - Change this to your preferred hour
  MINUTE: 40   // 0 minutes - Change this to your preferred minute
};

// Path to the main script
const SCRIPT_PATH = path.join(__dirname, 'group-analytics.js');

// Log file path
const LOG_FILE = path.join(__dirname, 'daily-update-log.txt');

/**
 * Append a log message to the log file and console
 * @param {string} message - The message to log
 */
function log(message) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}\n`;
  
  // Log to console
  console.log(logEntry.trim());
  
  // Log to file
  try {
    fs.appendFileSync(LOG_FILE, logEntry);
  } catch (error) {
    console.error(`Error writing to log file: ${error.message}`);
  }
}

/**
 * Run the analytics script
 */
function updateAnalytics() {
  log('Starting analytics update...');
  
  // Get current date for logging
  const currentDate = new Date().toLocaleDateString();
  log(`Running update for data through ${currentDate}`);
  
  // Execute the script with increased buffer size (50MB)
  const child = exec(`node "${SCRIPT_PATH}"`, { maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
    if (error) {
      log(`Error executing analytics script: ${error.message}`);
      return;
    }
    
    if (stderr) {
      log(`Script warnings/errors: ${stderr.substring(0, 500)}${stderr.length > 500 ? '...' : ''}`);
    }
    
    log('Analytics update completed successfully');
    log(`Script output summary: ${stdout.substring(0, 200)}${stdout.length > 200 ? '...' : ''}`);
  });
  
  // Handle process errors
  child.on('error', (error) => {
    log(`Failed to start analytics script: ${error.message}`);
  });
}

// ===== MAIN EXECUTION =====

// Schedule the job to run at the specified time every day
const scheduledTime = `${SCHEDULE_TIME.MINUTE} ${SCHEDULE_TIME.HOUR} * * *`;
const job = schedule.scheduleJob(scheduledTime, function() {
  log(`Running scheduled analytics update at ${new Date().toLocaleString()}`);
  updateAnalytics();
});

// Check if we should run immediately
const now = new Date();
const scheduledTimeToday = new Date();
scheduledTimeToday.setHours(SCHEDULE_TIME.HOUR, SCHEDULE_TIME.MINUTE, 0, 0);

// Log startup information
log('='.repeat(50));
log(`Analytics scheduler started`);
log(`Script will run daily at ${SCHEDULE_TIME.HOUR}:${SCHEDULE_TIME.MINUTE.toString().padStart(2, '0')}`);
log(`Next scheduled run: ${job.nextInvocation().toLocaleString()}`);

// Run immediately if the scheduled time has already passed for today
if (now.getTime() > scheduledTimeToday.getTime()) {
  log(`Scheduled time ${SCHEDULE_TIME.HOUR}:${SCHEDULE_TIME.MINUTE} has already passed for today`);
  log(`Running analytics update immediately...`);
  updateAnalytics();
} else {
  const timeUntilRun = Math.round((scheduledTimeToday.getTime() - now.getTime()) / 60000);
  log(`Today's scheduled run will occur in approximately ${timeUntilRun} minutes`);
}

log('='.repeat(50));

// Handle graceful shutdown
process.on('SIGINT', function() {
  log('Scheduler stopping due to user request');
  job.cancel();
  process.exit(0);
});

// Prevent crashes from unhandled exceptions
process.on('uncaughtException', (error) => {
  log(`Uncaught exception: ${error.message}`);
  log(error.stack);
});

process.on('unhandledRejection', (reason) => {
  log(`Unhandled promise rejection: ${reason}`);
});

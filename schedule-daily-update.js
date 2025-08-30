/**
 * Daily Scheduler for Sprout Social Analytics
 * 
 * This script sets up a daily scheduled task to run both analytics scripts sequentially:
 * 1. simple-analytics.js (runs first)
 * 2. sprout_april.js (runs after first script completes)
 * 
 * Scheduled to run daily at 11:40 PM
 */

console.log('SCRIPT STARTING: Sprout Analytics Sequential Scheduler');
console.log('Current directory:', __dirname);

const schedule = require('node-schedule');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

// Configuration
const CONFIG = {
  // Time to run the scripts daily (24-hour format)
  // 11:40 PM = 23:40
  hour: 23,
  minute: 40,
  
  // Paths to the analytics scripts
  firstScriptPath: path.resolve(__dirname, 'simple-analytics.js'),
  secondScriptPath: path.resolve(__dirname, 'sprout_april.js'),
  
  // Log file for the scheduler
  logPath: path.join(__dirname, 'scheduler-logs.txt')
};

// Verify both scripts exist
if (!fs.existsSync(CONFIG.firstScriptPath)) {
  console.error(`ERROR: First script not found: ${CONFIG.firstScriptPath}`);
  process.exit(1);
}

if (!fs.existsSync(CONFIG.secondScriptPath)) {
  console.error(`ERROR: Second script not found: ${CONFIG.secondScriptPath}`);
  process.exit(1);
}

console.log(`First script: ${CONFIG.firstScriptPath}`);
console.log(`Second script: ${CONFIG.secondScriptPath}`);

/**
 * Log a message to both console and log file
 * @param {string} message - Message to log
 */
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  
  console.log(logMessage);
  
  try {
    // Append to log file
    fs.appendFileSync(CONFIG.logPath, logMessage + '\n');
  } catch (error) {
    console.error('ERROR: Failed to write to log file:', error.message);
  }
}

/**
 * Execute a script and return a promise
 * @param {string} scriptPath - Path to the script to execute
 * @param {string} scriptName - Name of the script for logging
 * @returns {Promise<{success: boolean, output: string, error: string, executionTime: number}>}
 */
function executeScript(scriptPath, scriptName) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    log(`\n=== EXECUTING: ${scriptName} ===`);
    log(`Script path: ${scriptPath}`);
    log(`Start time: ${new Date().toLocaleString()}`);
    
    const child = exec(`node "${scriptPath}"`, { 
      maxBuffer: 50 * 1024 * 1024 // 50MB buffer
    }, (error, stdout, stderr) => {
      const endTime = Date.now();
      const executionTimeMs = endTime - startTime;
      const executionTimeSec = Math.round(executionTimeMs / 1000);
      const executionTimeMin = Math.round(executionTimeSec / 60 * 10) / 10;
      
      if (error) {
        log(`ERROR: ${scriptName} failed: ${error.message}`);
        log(`Execution time: ${executionTimeMin} minutes (${executionTimeSec} seconds)`);
        resolve({
          success: false,
          output: stdout,
          error: error.message,
          executionTime: executionTimeMs
        });
        return;
      }
      
      if (stderr) {
        log(`WARNING: ${scriptName} stderr: ${stderr.substring(0, 1000)}${stderr.length > 1000 ? '...' : ''}`);
      }
      
      log(`SUCCESS: ${scriptName} completed successfully`);
      log(`Execution time: ${executionTimeMin} minutes (${executionTimeSec} seconds)`);
      log(`Output: ${stdout.substring(0, 500)}...`);
      
      resolve({
        success: true,
        output: stdout,
        error: stderr,
        executionTime: executionTimeMs
      });
    });
    
    // Handle process errors
    child.on('error', (error) => {
      log(`ERROR: Failed to start ${scriptName}: ${error.message}`);
      resolve({
        success: false,
        output: '',
        error: error.message,
        executionTime: 0
      });
    });
  });
}

/**
 * Run both analytics scripts sequentially
 */
async function runSequentialAnalytics() {
  const overallStartTime = new Date();
  log(`\n=== SCHEDULER: STARTING SEQUENTIAL ANALYTICS UPDATE ===`);
  log(`Overall start time: ${overallStartTime.toLocaleString()}`);
  log(`Scripts will run in sequence: simple-analytics.js → sprout_april.js`);
  
  try {
    // Execute first script (simple-analytics.js)
    log(`\n--- STEP 1: Running simple-analytics.js ---`);
    const firstResult = await executeScript(CONFIG.firstScriptPath, 'simple-analytics.js');
    
    if (!firstResult.success) {
      log(`ERROR: First script failed. Stopping execution.`);
      log(`Error: ${firstResult.error}`);
      return;
    }
    
    log(`✓ First script completed successfully in ${Math.round(firstResult.executionTime / 1000)} seconds`);
    
    // Wait 30 seconds between scripts to avoid API rate limits
    log(`Waiting 30 seconds before running second script...`);
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    // Execute second script (sprout_april.js)
    log(`\n--- STEP 2: Running sprout_april.js ---`);
    const secondResult = await executeScript(CONFIG.secondScriptPath, 'sprout_april.js');
    
    if (!secondResult.success) {
      log(`ERROR: Second script failed.`);
      log(`Error: ${secondResult.error}`);
      return;
    }
    
    log(`✓ Second script completed successfully in ${Math.round(secondResult.executionTime / 1000)} seconds`);
    
    // Overall completion
    const overallEndTime = new Date();
    const overallExecutionTimeMs = overallEndTime - overallStartTime;
    const overallExecutionTimeSec = Math.round(overallExecutionTimeMs / 1000);
    const overallExecutionTimeMin = Math.round(overallExecutionTimeSec / 60 * 10) / 10;
    
    log(`\n=== SEQUENTIAL ANALYTICS UPDATE COMPLETED ===`);
    log(`Overall completion time: ${overallEndTime.toLocaleString()}`);
    log(`Total execution time: ${overallExecutionTimeMin} minutes (${overallExecutionTimeSec} seconds)`);
    log(`Both scripts executed successfully!`);
    
  } catch (error) {
    log(`CRITICAL ERROR in sequential execution: ${error.message}`);
    log(error.stack);
  }
}

// Schedule the job to run daily at 11:40 PM
const job = schedule.scheduleJob(`${CONFIG.minute} ${CONFIG.hour} * * *`, function() {
  log(`\n=== SCHEDULED JOB TRIGGERED ===`);
  log(`Running scheduled sequential analytics at ${new Date().toLocaleString()}`);
  runSequentialAnalytics();
});

log(`Scheduler set to run DAILY at ${CONFIG.hour}:${CONFIG.minute.toString().padStart(2, '0')} (11:40 PM)`);
log(`Scripts will run in sequence: simple-analytics.js → sprout_april.js`);

// Run immediately on startup (optional)
// Comment this out if you only want it to run at the scheduled time
log('\n=== RUNNING INITIAL EXECUTION ON STARTUP ===');
runSequentialAnalytics();

// Log that the scheduler is running
const nextRun = job.nextInvocation();
log(`\nScheduler started successfully!`);
log(`Next scheduled run: ${nextRun.toLocaleString()}`);
log(`Scripts will run daily at 11:40 PM in sequence`);

// Keep the process running
process.on('SIGINT', function() {
  log('\nScheduler stopping...');
  job.cancel();
  process.exit(0);
});

// Handle uncaught exceptions to prevent crashes
process.on('uncaughtException', (error) => {
  log(`CRITICAL ERROR: Uncaught exception in scheduler: ${error.message}`);
  log(error.stack);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  log('CRITICAL ERROR: Unhandled promise rejection in scheduler');
  log(`Reason: ${reason}`);
});

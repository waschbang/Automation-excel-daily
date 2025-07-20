/**
 * Test script to run the analytics update without scheduler
 */

console.log('=== TEST SCRIPT STARTING ===');
console.log('Current time:', new Date().toLocaleString());

// Import the necessary modules
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

// Choose which analytics script to run
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

console.log(`Script path: ${scriptPath}`);
console.log('\n=== RUNNING ANALYTICS UPDATE ===');

// Execute the analytics script directly
const child = exec(`node "${scriptPath}"`, { maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
  if (error) {
    console.error(`Error executing script: ${error.message}`);
    return;
  }
  
  if (stderr) {
    console.error(`Script stderr: ${stderr}`);
  }
  
  console.log('=== Analytics update completed ===');
  console.log(`Output: ${stdout.substring(0, 1000)}${stdout.length > 1000 ? '...' : ''}`);
});

// Forward the script's output to our console
child.stdout.on('data', (data) => {
  console.log(data.toString());
});

child.stderr.on('data', (data) => {
  console.error(data.toString());
});

console.log('Test script started analytics update, now waiting for completion...');

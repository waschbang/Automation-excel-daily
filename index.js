/**
 * Sprout Social Analytics to Google Sheets - Vercel Entry Point
 * ============================================================
 * This file serves as the entry point for Vercel deployment.
 * It provides HTTP endpoints and triggers the scheduler.
 */

const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Path to the scheduler script
const SCHEDULER_SCRIPT = path.join(__dirname, 'schedule-daily-update.js');

/**
 * Run the scheduler script
 * @returns {Promise<string>} Output from the script
 */
const runScheduler = () => {
  return new Promise((resolve, reject) => {
    console.log(`Running scheduler script: ${SCHEDULER_SCRIPT}`);
    
    const process = exec(`node ${SCHEDULER_SCRIPT}`, { 
      maxBuffer: 50 * 1024 * 1024 // 50MB buffer
    });
    
    let output = '';
    
    process.stdout.on('data', (data) => {
      output += data.toString();
      console.log(data.toString());
    });
    
    process.stderr.on('data', (data) => {
      output += data.toString();
      console.error(data.toString());
    });
    
    process.on('close', (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(`Scheduler exited with code ${code}: ${output}`));
      }
    });
  });
};

// Define HTTP routes for Vercel deployment
app.get('/', async (req, res) => {
  try {
    res.status(200).json({
      status: 'online',
      message: 'Sprout Social Analytics API is running',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in root endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/run', async (req, res) => {
  try {
    // Set a timeout to avoid Vercel's 10-second function timeout
    const timeoutPromise = new Promise(resolve => {
      setTimeout(() => {
        resolve('Analytics process started in the background');
      }, 1000);
    });

    // Start the analytics process in the background
    runScheduler().catch(err => console.error('Error running scheduler:', err));

    // Respond quickly to avoid timeout
    const message = await timeoutPromise;
    res.status(200).json({
      status: 'processing',
      message,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error running analytics:', error);
    res.status(500).json({ error: 'Failed to start analytics process' });
  }
});

// Start the server if not in Vercel environment
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log('Available endpoints:');
    console.log('  - GET /: Check API status');
    console.log('  - GET /run: Trigger analytics update');
  });
} else {
  console.log('Running in Vercel serverless environment');
}

// Export the Express app for Vercel
module.exports = app;

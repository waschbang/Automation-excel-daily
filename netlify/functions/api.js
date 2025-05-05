const express = require('express');
const serverless = require('serverless-http');
const { exec } = require('child_process');
const path = require('path');

const app = express();
const SCHEDULER_SCRIPT = path.join(__dirname, '../../schedule-daily-update.js');

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

// Define routes
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
    // Set a timeout to avoid Netlify's function timeout
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

// Export the serverless handler
module.exports.handler = serverless(app);

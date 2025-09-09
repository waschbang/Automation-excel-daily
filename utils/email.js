const nodemailer = require('nodemailer');

const EMAIL_CONFIG = {
  service: 'gmail',
  auth: {
    user: 'satharva2004@gmail.com',
    pass: 'rcut bssf vhex sadm' // App password
  }
};

const FROM_EMAIL = 'satharva2004@gmail.com';
const TO_EMAIL = ['atharva.sawant@schbang.com', 'ansh.shetty@schbang.com', 'yadnesh.rane@schbang.com'];

/**
 * Sends an email with the given subject, HTML content, and optional attachments
 * @param {string} subject - Email subject
 * @param {string} html - Email content in HTML format
 * @param {Array} [attachments=[]] - Array of attachment objects
 * @returns {Promise<Object>} Email send result
 */
async function sendEmail(subject, html, attachments = []) {
  const results = [];
  let lastError = null;
  
  for (const email of TO_EMAIL) {
    try {
      const transporter = nodemailer.createTransport({
        service: EMAIL_CONFIG.service,
        auth: EMAIL_CONFIG.auth
      });

      const mailOptions = {
        from: `"Automation Bot" <${FROM_EMAIL}>`,
        to: email,
        subject: subject,
        html: html,
        attachments: attachments
      };

      const info = await transporter.sendMail(mailOptions);
      console.log(`Email sent to ${email}: ${info.messageId}`);
      results.push({ email, success: true, messageId: info.messageId });
    } catch (error) {
      console.error(`Error sending email to ${email}:`, error.message);
      lastError = error;
      results.push({ email, success: false, error: error.message });
    }
  }

  // If all emails failed, return the last error
  if (results.every(r => !r.success)) {
    return { 
      success: false, 
      error: lastError?.message || 'All email sending attempts failed',
      details: results
    };
  }

  // If at least one email was successful, return success
  return { 
    success: true, 
    messageId: results.find(r => r.messageId)?.messageId,
    details: results
  };
}

/**
 * Sends a report email with sheet statistics
 * @param {Object} stats - Statistics object
 * @param {number} stats.totalSheets - Total number of sheets
 * @param {number} stats.completedSheets - Number of successfully processed sheets
 * @param {Array<string>} [stats.failedSheets=[]] - Array of failed sheet names
 * @param {Array<Object>} [stats.allResults=[]] - Array of group results
 * @param {string} [folderLink='#'] - Link to the output folder
 * @param {string} [processName='Automation Process'] - Name of the process
 * @returns {Promise<Object>} Email send result
 */
const sendReportEmail = async ({ 
  totalSheets, 
  completedSheets, 
  failedSheets = [],
  allResults = [],
  spreadsheetUrl = '',
  groupName = 'Multiple Groups',
  allGroupNames = []
}, folderLink = '#', processName = 'Automation Process') => {
  // Ensure all values are valid numbers
  const total = Math.max(0, parseInt(totalSheets) || 0);
  const completed = Math.max(0, parseInt(completedSheets) || 0);
  const failedCount = Math.max(0, failedSheets.length);
  
  // Calculate success count - it should be the number of successfully completed sheets
  // This should match the completedSheets parameter if it represents successful processing
  const successCount = Math.min(completed, total);
  
  // Validate that our counts make sense
  const processedTotal = successCount + failedCount;
  if (processedTotal > total) {
    console.warn(`Warning: Processed total (${processedTotal}) exceeds total sheets (${total}). Adjusting counts.`);
  }
  
  const completionTime = new Date().toLocaleString();
  
  // Calculate success rate based on total sheets
  const successRate = total > 0 ? Math.round((successCount / total) * 100) : 0;
  const subject = `${processName} Completed - ${successCount} of ${total} Sheets Processed (${successRate}% Success)`;
  
  // Generate group results HTML
  let groupResultsHtml = '';
  if (allResults && allResults.length > 0) {
    groupResultsHtml = `
      <h3 style="border-bottom: 1px solid #dadce0; padding-bottom: 8px; margin-top: 20px;">
        Group Processing Details
      </h3>
      <div style="padding: 15px; margin-bottom: 20px; background: #f8f9fa; border-radius: 4px;">
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background-color: #f1f3f4; text-align: left;">
              <th style="padding: 8px; border: 1px solid #ddd;">Group</th>
              <th style="padding: 8px; border: 1px solid #ddd;">Status</th>
              <th style="padding: 8px; border: 1px solid #ddd;">Spreadsheet</th>
            </tr>
          </thead>
          <tbody>
            ${allResults.map(result => `
              <tr>
                <td style="padding: 8px; border: 1px solid #ddd;">${result.groupName || 'N/A'}</td>
                <td style="padding: 8px; border: 1px solid #ddd; color: ${result.status === 'Success' ? '#0f9d58' : '#db4437'}">
                  ${result.status || 'Unknown'}
                </td>
                <td style="padding: 8px; border: 1px solid #ddd;">
                  ${result.spreadsheetUrl ? 
                    `<a href="${result.spreadsheetUrl}" target="_blank" style="color: #1a73e8; text-decoration: none;">View Sheet</a>` : 
                    'N/A'}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;
  }
  
  // Create a more informative summary
  const unprocessedCount = Math.max(0, total - successCount - failedCount);
  const allSuccessful = failedCount === 0 && unprocessedCount === 0;
  
  // Format groups display
  const groupsDisplay = allGroupNames.length > 0 
    ? allGroupNames.map(name => `<span style="display: inline-block; background: #f1f3f4; padding: 2px 8px; border-radius: 12px; margin: 2px; font-size: 13px;">${name}</span>`).join(' ')
    : groupName;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
      <h2>${processName}</h2>
      <div style="margin-bottom: 20px; font-size: 15px;">
        <div style="color: #5f6368; margin-bottom: 5px;">Processed Groups:</div>
        <div style="line-height: 1.8;">${groupsDisplay}</div>
      </div>
      
      <div style="padding: 15px; margin-bottom: 20px; background: #f8f9fa; border-radius: 4px; border-left: 4px solid #1a73e8;">
        <p style="margin: 0 0 10px 0; font-weight: 500;">
          <strong>Report Details</strong>
        </p>
        <p style="margin: 5px 0;">
          <strong>Completion Time:</strong> ${completionTime}
        </p>
        <p style="margin: 5px 0;">
          <strong> Output Folder:</strong> 
          <a href="${folderLink}" style="color: #1a73e8; text-decoration: none;">
            View in Google Drive
          </a>
        </p>
        ${spreadsheetUrl ? `
        <p style="margin: 5px 0;">
          <strong>Spreadsheet:</strong> 
          <a href="${spreadsheetUrl}" style="color: #1a73e8; text-decoration: none;">
            Open in Google Sheets
          </a>
        </p>
        ` : ''}
      </div>
      
      <h3 style="border-bottom: 1px solid #dadce0; padding-bottom: 8px; margin-top: 20px;">
        Process Summary
      </h3>
      
      <div style="padding: 15px; margin-bottom: 20px; background: #f8f9fa; border-radius: 4px;">
        <p style="margin: 0 0 10px 0; font-weight: 500;">
          The automation process has completed execution. Here's a detailed summary:
        </p>
        <ul style="margin: 0; padding-left: 20px;">
          <li><strong>Total Files:</strong> ${total}</li>
          <li><strong>Successfully Processed:</strong> <span style="color: #0f9d58;">${successCount} files</span></li>
          ${failedCount > 0 ? `
          <li><strong>Failed to Process:</strong> <span style="color: #db4437;">${failedCount} ${failedCount === 1 ? 'file' : 'files'}</span>
            <ul style="margin: 5px 0 0 20px; padding-left: 10px; color: #db4437;">
              ${failedSheets.map(sheet => `<li>${sheet}</li>`).join('')}
            </ul>
          </li>
          ` : ''}
          ${unprocessedCount > 0 ? `
          <li><strong>Not Processed:</strong> <span style="color: #ff9800;">${unprocessedCount} files</span> (may have been skipped or not attempted)</li>
          ` : ''}
          <li><strong>Success Rate:</strong> <span style="font-weight: bold; color: ${successRate >= 80 ? '#0f9d58' : successRate >= 50 ? '#ff9800' : '#db4437'};">${successRate}%</span></li>
        </ul>
      </div>
      
      ${groupResultsHtml}
      
      <div style="padding: 15px; margin-top: 20px; background: ${allSuccessful ? '#e6f4ea' : '#e8f0fe'}; border-radius: 4px; border-left: 4px solid ${allSuccessful ? '#0f9d58' : '#1a73e8'};">
        <p style="margin: 0; font-size: 14px; color: ${allSuccessful ? '#0f9d58' : '#1a73e8'}; font-weight: ${allSuccessful ? 'bold' : 'normal'}">
          <strong>${allSuccessful ? 'Success!' : 'Quick Stats:'}</strong> 
          ${allSuccessful ? 'All files processed successfully!' : 
            successRate >= 90 ? 'Excellent performance!' : 
            successRate >= 70 ? 'Good performance with some issues to review.' : 
            'Performance needs attention. Please review failed items.'
          }
        </p>
      </div>
    </div>
  `;
  
  return await sendEmail(subject, html);
}

// Export the functions
module.exports = {
  sendEmail,
  sendReportEmail
};
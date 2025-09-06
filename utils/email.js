const nodemailer = require('nodemailer');

const EMAIL_CONFIG = {
  service: 'gmail',
  auth: {
    user: 'satharva2004@gmail.com',
    pass: 'rcut bssf vhex sadm' // App password
  }
};

const FROM_EMAIL = 'satharva2004@gmail.com';
const TO_EMAIL = ['satharva2004@gmail.com', 'atharva.sawant@schbang.com'];

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
 * @param {number} stats.completedSheets - Number of processed sheets
 * @param {Array<string>} [stats.failedSheets=[]] - Array of failed sheet names
 * @param {string} [folderLink='#'] - Link to the output folder
 * @param {string} [processName='Automation Process'] - Name of the process
 * @returns {Promise<Object>} Email send result
 */
async function sendReportEmail({ 
  totalSheets, 
  completedSheets, 
  failedSheets = [] 
}, folderLink = '#', processName = 'Automation Process') {
  const failedCount = failedSheets.length;
  const successCount = completedSheets - failedCount;
  const completionTime = new Date().toLocaleString();
  
  const subject = `${processName} Complete: ${successCount}/${totalSheets} sheets processed`;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>${processName} Report</h2>
      
      <div style="padding: 15px; margin-bottom: 20px;">
        <p style="margin: 0;">
          <strong>Completion Time:</strong> ${completionTime}<br>
          <strong>Output Folder:</strong> 
          <a href="${folderLink}" style="text-decoration: none;">
            View Files
          </a>
        </p>
      </div>
      
      <h3 style="border-bottom: 1px solid #dadce0; padding-bottom: 8px;">
        Process Summary
      </h3>
      
      <div style="padding: 15px; margin-bottom: 20px;">
        <p style="margin: 0 0 10px 0; font-weight: 500;">
          The cron job has been executed successfully! Here's a quick summary:
        </p>
        <ul style="margin: 0; padding-left: 20px;">
          <li><strong>Total Files Processed:</strong> ${totalSheets}</li>
          <li><strong>Successfully Processed:</strong> ${successCount} files</li>
          <li><strong>Failed to Process:</strong> ${failedCount} files</li>
          <li><strong>Success Rate:</strong> ${Math.round((successCount / Math.max(totalSheets, 1)) * 100)}%</li>
        </ul>
      </div>
      
      ${failedCount > 0 ? `
        <div>
          <h3>Failed Files</h3>
          <p>The following files could not be processed:</p>
          <ul>
            ${failedSheets.map(sheet => `<li>${sheet}</li>`).join('')}
          </ul>
        </div>
      ` : `
      <div style="text-align: center; margin: 30px 0;">
        <div style="padding: 15px; display: inline-block;">
          All files were processed successfully!
        </div>
      </div>`}
      
      <div style="margin-top: 30px; padding-top: 15px; border-top: 1px solid #dadce0; font-size: 12px;">
        <p style="margin: 5px 0;">This is an automated message. Please do not reply.</p>
        <p style="margin: 5px 0;">Process completed at: ${completionTime}</p>
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
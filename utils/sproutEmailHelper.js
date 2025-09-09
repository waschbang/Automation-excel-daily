const { sendReportEmail } = require('./email');

/**
 * Sends a completion email for the Sprout Analytics script
 * @param {Object} results - Results from processing groups
 * @param {string} executionTime - Formatted execution time
 * @param {string} folderLink - Link to the output folder
 * @returns {Promise<void>}
 */
async function sendSproutCompletionEmail(results, executionTime, folderLink = '#') {
  try {
    // If results don't have status, consider all as completed
    const hasStatus = results.every(r => 'status' in r);
    
    const completedSheets = hasStatus 
      ? results.filter(r => r.status === 'completed').length 
      : results.length;
      
    const totalSheets = results.length;
    
    const failedSheets = hasStatus 
      ? results
          .filter(r => r.status !== 'completed')
          .map(r => ({
            name: r.groupName || 'Unknown Group',
            error: r.error || 'Unknown error'
          }))
      : [];

    const emailHtml = `
      <h2>Sprout Analytics Processing Complete</h2>
      <p>Execution completed in <strong>${executionTime}</strong></p>
      <p>Processed <strong>${completedSheets}/${totalSheets}</strong> spreadsheets successfully.</p>
      ${failedSheets.length > 0 ? 
        `<h3>Failed Sheets (${failedSheets.length}):</h3>
         <ul>
           ${failedSheets.map(sheet => 
             `<li><strong>${sheet.name}</strong>: ${sheet.error}</li>`
           ).join('')}
         </ul>` 
        : ''
      }
      <p>Output folder: <a href="${folderLink}">Click here to view files</a></p>
    `;

    // Extract spreadsheet URL from results if available
    const spreadsheetUrl = results[0]?.spreadsheetId 
      ? `https://docs.google.com/spreadsheets/d/${results[0].spreadsheetId}/edit`
      : '';
      
    // Get all unique group names from results
    const groupNames = [...new Set(results.map(r => r.groupName).filter(Boolean))];
    const groupNameDisplay = groupNames.length > 0 
      ? groupNames.join(', ') 
      : 'Multiple Groups';
    
    await sendReportEmail(
      { 
        totalSheets,
        completedSheets,
        failedSheets: failedSheets.map(s => s.name),
        spreadsheetUrl,
        groupName: groupNameDisplay,
        allGroupNames: groupNames  // Pass all group names to the email template
      },
      folderLink,
      `Sprout Social Analytics - ${groupNames.length > 1 ? `${groupNames.length} Groups` : groupNameDisplay}`
    );

    console.log('Completion email sent successfully');
  } catch (error) {
    console.error('Error sending completion email:', error.message);
    // Don't throw, as we don't want to fail the main process
  }
}

module.exports = {
  sendSproutCompletionEmail
};

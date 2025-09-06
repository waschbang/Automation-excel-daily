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
    const completedSheets = results.filter(r => r.status === 'completed').length;
    const totalSheets = results.length;
    const failedSheets = results
      .filter(r => r.status !== 'completed')
      .map(r => ({
        name: r.groupName,
        error: r.error || 'Unknown error'
      }));

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

    await sendReportEmail(
      { 
        totalSheets,
        completedSheets,
        failedSheets: failedSheets.map(s => s.name)
      },
      folderLink,
      'Sprout Social Analytics'
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

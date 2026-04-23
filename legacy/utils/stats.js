/**
 * Tracks statistics for sheet processing
 */
class StatsTracker {
  constructor() {
    this.totalSheets = 0;
    this.completedSheets = 0;
    this.failedSheets = [];
  }

  /**
   * Increment total sheets count
   * @param {number} [count=1] - Number of sheets to add
   */
  addTotalSheets(count = 1) {
    this.totalSheets += count;
  }

  /**
   * Mark a sheet as completed
   * @param {string} sheetName - Name of the sheet
   */
  markCompleted(sheetName) {
    this.completedSheets++;
  }

  /**
   * Mark a sheet as failed
   * @param {string} sheetName - Name of the failed sheet
   * @param {string} [error='Unknown error'] - Error message
   */
  markFailed(sheetName, error = 'Unknown error') {
    this.failedSheets.push(`${sheetName} - ${error}`);
    this.completedSheets++; // Still counts as processed
  }

  /**
   * Get current statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    return {
      totalSheets: this.totalSheets,
      completedSheets: this.completedSheets,
      failedSheets: [...this.failedSheets]
    };
  }
}

// Export a singleton instance
module.exports = new StatsTracker();

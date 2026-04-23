/**
 * Compute the date window a pipeline should fetch for one group.
 *
 * Motivation: the original code re-fetched 2025-04-01 → D-2 for every
 * profile on every run (≈400 days × 250 profiles). A single daily run
 * took 2-4 hours and hit Sprout rate limits hard. The incremental
 * strategy: read the max date already present in the spreadsheet, then
 * only fetch from (maxExistingDate - refreshDays) through D-2. The
 * refresh window captures Meta/YouTube's retroactive metric corrections
 * (they revise impressions/views for ~14 days after the fact).
 *
 * Supports an explicit override for full backfill (`--backfill=DATE`).
 */

const MIN_DATE = '2025-04-01';
const DEFAULT_REFRESH_DAYS = 14;

const pad = (n) => String(n).padStart(2, '0');

function isoDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function todayMinusTwoIST() {
  const d = new Date();
  d.setDate(d.getDate() - 2);
  return isoDate(d);
}

function subDays(iso, days) {
  const d = new Date(iso);
  d.setDate(d.getDate() - days);
  return isoDate(d);
}

/**
 * Parse a Sheets date cell (ISO / numeric serial / natural string) → ISO.
 * Returns '' for unparseable.
 */
function normalizeSheetDateCell(value) {
  if (value == null) return '';
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const asNum = Number(raw);
  if (!Number.isNaN(asNum) && raw !== '') {
    // Google Sheets serial date: days since 1899-12-30 (Excel-compatible)
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const ms = epoch.getTime() + Math.round(asNum) * 86400000;
    const dt = new Date(ms);
    return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
  }
  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) return isoDate(parsed);
  return '';
}

/**
 * Read the maximum ISO date in column A (excluding header) of a tab.
 * Returns null if the tab is empty or the call fails.
 */
async function readMaxDateInTab(sheets, spreadsheetId, tabName) {
  try {
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tabName}!A:A`,
    });
    const rows = resp.data.values || [];
    if (rows.length <= 1) return null;
    let maxIso = null;
    for (let i = 1; i < rows.length; i++) {
      const iso = normalizeSheetDateCell(rows[i] && rows[i][0]);
      if (iso && (maxIso == null || iso > maxIso)) maxIso = iso;
    }
    return maxIso;
  } catch (_) {
    return null;
  }
}

/**
 * Compute the fetch window for a group.
 *
 * Strategy:
 *   - If `backfill` is provided, startDate = backfill (full re-fetch from that date).
 *   - Else read maxExistingDate across `tabs`. Use the EARLIEST tab max-date (so
 *     the most stale tab drives the window — all tabs end up at parity).
 *   - If any tab is empty or no max-date could be read, fall back to minDate.
 *   - startDate = max(earliestTabMax - refreshDays, minDate).
 *   - endDate   = today − 2 days.
 *
 * @param {Object} args
 * @param {Object} args.sheets
 * @param {string} args.spreadsheetId
 * @param {string[]} args.tabs
 * @param {string=} args.backfill   ISO YYYY-MM-DD or falsy
 * @param {number=} args.refreshDays
 * @param {string=} args.minDate
 * @returns {Promise<{ startDate:string, endDate:string, maxExisting:string|null, strategy:'backfill-override'|'incremental'|'full-empty-tab' }>}
 */
async function computeWindow({
  sheets,
  spreadsheetId,
  tabs,
  backfill,
  refreshDays = DEFAULT_REFRESH_DAYS,
  minDate = MIN_DATE,
}) {
  const endDate = todayMinusTwoIST();

  if (backfill) {
    return { startDate: backfill, endDate, maxExisting: null, strategy: 'backfill-override' };
  }

  if (!tabs || tabs.length === 0) {
    return { startDate: minDate, endDate, maxExisting: null, strategy: 'full-empty-tab' };
  }

  let earliestTabMax = null;
  let anyEmpty = false;
  for (const tab of tabs) {
    const tabMax = await readMaxDateInTab(sheets, spreadsheetId, tab);
    if (tabMax == null) { anyEmpty = true; break; }
    if (earliestTabMax == null || tabMax < earliestTabMax) earliestTabMax = tabMax;
  }

  if (anyEmpty || earliestTabMax == null) {
    return { startDate: minDate, endDate, maxExisting: null, strategy: 'full-empty-tab' };
  }

  let startDate = subDays(earliestTabMax, refreshDays);
  if (startDate < minDate) startDate = minDate;

  return { startDate, endDate, maxExisting: earliestTabMax, strategy: 'incremental' };
}

module.exports = {
  computeWindow,
  normalizeSheetDateCell,
  todayMinusTwoIST,
  subDays,
  isoDate,
  MIN_DATE,
  DEFAULT_REFRESH_DAYS,
};

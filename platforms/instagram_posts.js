/**
 * Instagram Post-level module
 * Builds headers dynamically (metrics keys as-is) plus standard post columns.
 */
const { safeNumber } = require('../utils/api');

const SHEET_NAME = 'instagram_post';
// Fixed metrics with display titles matching documentation
const METRICS = [
  { title: 'Comments', key: 'lifetime.comments_count' },
  { title: 'Impressions', key: 'lifetime.impressions' },
  { title: 'Likes', key: 'lifetime.likes' },
  { title: 'Reach', key: 'lifetime.impressions_unique' },
  { title: 'Reactions', key: 'lifetime.reactions' },
  { title: 'Reels Unique Session Plays', key: 'lifetime.reels_unique_session_plays' },
  { title: 'Saves', key: 'lifetime.saves' },
  { title: 'Shares', key: 'lifetime.shares_count' },
  { title: 'SproutLink Clicks', key: 'lifetime.link_in_bio_clicks' },
  { title: 'Story Exits', key: 'lifetime.story_exits' },
  { title: 'Story Replies', key: 'lifetime.comments_count' },
  { title: 'Story Taps Back', key: 'lifetime.story_taps_back' },
  { title: 'Story Taps Forward', key: 'lifetime.story_taps_forward' },
  { title: 'Video Views', key: 'lifetime.video_views' },
  { title: 'Views', key: 'lifetime.views' },
  { title: 'Positive Comments', key: 'lifetime.sentiment_comments_positive_count' },
  { title: 'Negative Comments', key: 'lifetime.sentiment_comments_negative_count' },
  { title: 'Neutral Comments', key: 'lifetime.sentiment_comments_neutral_count' },
  { title: 'Unclassified Comments', key: 'lifetime.sentiment_comments_unclassified_count' },
  { title: 'Net Sentiment Score', key: 'lifetime.net_sentiment_score' }
];

// Build headers: fixed columns + metric keys (as-is)
function buildHeaders(metricList = METRICS) {
  const base = [
    'Created Time (UTC)',
    'Network Type',
    'Profile Name',
    'Profile ID',
    'Perma Link',
    'Text'
  ];
  return [...base, ...metricList.map(m => m.title)];
}

async function setupHeaders(sheetsUtil, auth, spreadsheetId, headers) {
  return sheetsUtil.setupSheetHeaders(auth, spreadsheetId, SHEET_NAME, headers);
}

function parseIsoDate(dimensions, dataPoint) {
  const rp = dataPoint?.created_time || dimensions?.['created_time'] || dimensions?.created_time || dimensions?.['reporting_period.by(day)'] || dimensions?.reporting_period;
  if (!rp) return '';
  try { return new Date(rp).toISOString(); } catch { return ''; }
}

function get(dp, path, fallback = '') {
  try {
    const parts = path.split('.');
    let cur = dp;
    for (const p of parts) cur = cur?.[p];
    return (cur === undefined || cur === null) ? fallback : cur;
  } catch {
    return fallback;
  }
}

function formatPostData(dataPoint, profileData, headers, truncate) {
  if (!dataPoint) return null;
  const dimensions = dataPoint.dimensions || {};
  const metrics = dataPoint.metrics || {};

  const createdAt = parseIsoDate(dimensions, dataPoint);
  const networkType = profileData?.network_type || 'instagram';
  const profileName = profileData?.name || '';
  const profileId = String(profileData?.customer_profile_id || profileData?.profile_id || profileData?.id || '');
  const permaLink = dataPoint?.perma_link || get(dimensions, 'post_url', get(dataPoint, 'post_url', ''));
  const text = truncate(String(dataPoint?.text || get(dimensions, 'message', get(dimensions, 'caption', get(dataPoint, 'message', '')))) || '', 500);

  // Start row with base columns in the exact same order as buildHeaders base
  const row = [
    createdAt,
    networkType,
    profileName,
    profileId,
    permaLink,
    text
  ];

  // Then append metric values to match headers order
  for (const m of METRICS) {
    const val = metrics[m.key];
    row.push(safeNumber(val));
  }

  if (row.length !== headers.length) return null;
  return row;
}

async function updateSheet(sheetsUtil, auth, spreadsheetId, rows, sheetNameOverride) {
  const sheetName = sheetNameOverride || SHEET_NAME;
  return sheetsUtil.updateSheet(auth, spreadsheetId, rows, sheetName);
}

module.exports = {
  SHEET_NAME,
  METRICS,
  buildHeaders,
  setupHeaders,
  formatPostData,
  updateSheet
};

/**
 * Twitter/X Post-level module
 */
const { safeNumber } = require('../utils/api');

const SHEET_NAME = 'twitter_post';
// Human-readable headers with exact titles and corresponding keys
const METRICS = [
  { title: 'Impressions', key: 'lifetime.impressions' },
  { title: 'Media Views', key: 'lifetime.post_media_views' },
  { title: 'Video Views', key: 'lifetime.video_views' },
  { title: 'Reactions', key: 'lifetime.reactions' },
  { title: 'Likes', key: 'lifetime.likes' },
  { title: '@Replies', key: 'lifetime.comments_count' },
  { title: 'Reposts', key: 'lifetime.shares_count' },
  { title: 'Post Clicks (All)', key: 'lifetime.post_content_clicks' },
  { title: 'Post Link Clicks', key: 'lifetime.post_link_clicks' },
  { title: 'Other Post Clicks', key: 'lifetime.post_content_clicks_other' },
  { title: 'Post Media Clicks', key: 'lifetime.post_media_clicks' },
  { title: 'Post Hashtag Clicks', key: 'lifetime.post_hashtag_clicks' },
  { title: 'Post Detail Expand Clicks', key: 'lifetime.post_detail_expand_clicks' },
  { title: 'Profile Clicks', key: 'lifetime.post_profile_clicks' },
  { title: 'Other Engagements', key: 'lifetime.engagements_other' },
  { title: 'Follows from Posts', key: 'lifetime.post_followers_gained' },
  { title: 'Unfollows from Posts', key: 'lifetime.post_followers_lost' },
  { title: 'App Engagements', key: 'lifetime.post_app_engagements' },
  { title: 'App Install Attempts', key: 'lifetime.post_app_installs' },
  { title: 'App Opens', key: 'lifetime.post_app_opens' },
  { title: 'Positive Comments', key: 'lifetime.sentiment_comments_positive_count' },
  { title: 'Negative Comments', key: 'lifetime.sentiment_comments_negative_count' },
  { title: 'Neutral Comments', key: 'lifetime.sentiment_comments_neutral_count' },
  { title: 'Unclassified Comments', key: 'lifetime.sentiment_comments_unclassified_count' },
  { title: 'Net Sentiment Score', key: 'lifetime.net_sentiment_score' }
];

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
  const networkType = profileData?.network_type || 'twitter';
  const profileName = profileData?.name || '';
  const profileId = String(profileData?.customer_profile_id || profileData?.profile_id || profileData?.id || '');
  const permaLink = dataPoint?.perma_link || get(dimensions, 'post_url', get(dataPoint, 'post_url', ''));
  const text = truncate(String(dataPoint?.text || get(dimensions, 'message', get(dataPoint, 'message', '')) || ''), 500);

  const row = [
    createdAt,
    networkType,
    profileName,
    profileId,
    permaLink,
    text
  ];

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

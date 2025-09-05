/**
 * YouTube Post-level module
 */
const { safeNumber } = require('../utils/api');

const SHEET_NAME = 'youtube_post';
// Human-readable headers with exact titles and corresponding keys
const METRICS = [
  { title: 'Annotation Clicks', key: 'lifetime.annotation_clicks' },
  { title: 'Annotation Click Rate', key: 'lifetime.annotation_click_through_rate' },
  { title: 'Clickable Annotation Impressions', key: 'lifetime.annotation_clickable_impressions' },
  { title: 'Closable Annotation Impressions', key: 'lifetime.annotation_closable_impressions' },
  { title: 'Annotation Closes', key: 'lifetime.annotation_closes' },
  { title: 'Annotation Close Rate', key: 'lifetime.annotation_close_rate' },
  { title: 'Annotation Impressions', key: 'lifetime.annotation_impressions' },
  { title: 'Card Clicks', key: 'lifetime.card_clicks' },
  { title: 'Card Impressions', key: 'lifetime.card_impressions' },
  { title: 'Card Click Rate', key: 'lifetime.card_click_rate' },
  { title: 'Card Teaser Clicks', key: 'lifetime.card_teaser_clicks' },
  { title: 'Card Teaser Impressions', key: 'lifetime.card_teaser_impressions' },
  { title: 'Card Teaser Click Rate', key: 'lifetime.card_teaser_click_rate' },
  { title: 'Estimated Minutes Watched', key: 'lifetime.estimated_minutes_watched' },
  { title: 'Estimated YT Red Minutes Watched', key: 'lifetime.estimated_red_minutes_watched' },
  { title: 'Content Click Other', key: 'lifetime.post_content_clicks_other' },
  { title: 'Shares', key: 'lifetime.shares_count' },
  { title: 'Subscribers Gained', key: 'lifetime.subscribers_gained' },
  { title: 'Subscribers Lost', key: 'lifetime.subscribers_lost' },
  { title: 'YT Red Video Views', key: 'lifetime.red_video_views' },
  { title: 'Video Views', key: 'lifetime.video_views' },
  { title: 'Video Likes', key: 'lifetime.likes' },
  { title: 'Video Dislikes', key: 'lifetime.dislikes' },
  { title: 'Video Reactions', key: 'lifetime.reactions' },
  { title: 'Video Comments', key: 'lifetime.comments_count' },
  { title: 'Video Added to Playlist', key: 'lifetime.videos_added_to_playlist' },
  { title: 'Video From to Playlist', key: 'lifetime.videos_removed_from_playlist' },
  { title: 'Positive Comments', key: 'lifetime.sentiment_comments_positive_count' },
  { title: 'Negative Comments', key: 'lifetime.sentiment_comments_negative_count' },
  { title: 'Neutral Comments', key: 'lifetime.sentiment_comments_neutral_count' },
  { title: 'Unclassified Comments', key: 'lifetime.sentiment_comments_unclassified_count' },
  { title: 'Net Sentiment Score', key: 'lifetime.net_sentiment_score' }
];

function buildHeaders(metricList = METRICS) {
  const base = [
    'Date',
    'Network Type',
    'Profile Name',
    'Profile ID',
    'Post ID',
    'Post URL',
    'Post Type',
    'Post Title'
  ];
  return [...base, ...metricList.map(m => m.title)];
}

async function setupHeaders(sheetsUtil, auth, spreadsheetId, headers) {
  return sheetsUtil.setupSheetHeaders(auth, spreadsheetId, SHEET_NAME, headers);
}

function parseIsoDate(dimensions) {
  const rp = dimensions?.['created_time'] || dimensions?.created_time || dimensions?.['reporting_period.by(day)'] || dimensions?.reporting_period;
  if (!rp) return '';
  try { return new Date(rp).toISOString().split('T')[0]; } catch { return ''; }
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

  const date = parseIsoDate(dimensions);
  const networkType = profileData?.network_type || 'youtube';
  const profileName = profileData?.name || '';
  const profileId = String(profileData?.customer_profile_id || profileData?.profile_id || profileData?.id || '');
  const postId = get(dimensions, 'post_id', get(dataPoint, 'post_id', ''));
  const postUrl = get(dimensions, 'post_url', get(dataPoint, 'post_url', ''));
  const postType = get(dimensions, 'post_type', get(dataPoint, 'post_type', ''));
  const title = truncate(String(get(dimensions, 'title', get(dataPoint, 'title', '')) || ''), 500);

  const row = [
    date,
    networkType,
    profileName,
    profileId,
    postId,
    postUrl,
    postType,
    title
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

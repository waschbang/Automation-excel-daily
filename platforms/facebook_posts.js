/**
 * Facebook Post-level module
 */
const { safeNumber } = require('../utils/api');

const SHEET_NAME = 'facebook_post';
// Human-readable headers with exact titles and corresponding keys
const METRICS = [
  { title: 'Impressions', key: 'lifetime.impressions' },
  { title: 'Organic Impressions', key: 'lifetime.impressions_organic' },
  { title: 'Viral Impressions', key: 'lifetime.impressions_viral' },
  { title: 'Non-viral Impressions', key: 'lifetime.impressions_nonviral' },
  { title: 'Paid Impressions', key: 'lifetime.impressions_paid' },
  { title: 'Fan Impressions', key: 'lifetime.impressions_follower' },
  { title: 'Non-fan Impressions', key: 'lifetime.impressions_nonfollower' },
  { title: 'Reach', key: 'lifetime.impressions_unique' },
  { title: 'Organic Reach', key: 'lifetime.impressions_organic_unique' },
  { title: 'Viral Reach', key: 'lifetime.impressions_viral_unique' },
  { title: 'Non-viral Reach', key: 'lifetime.impressions_nonviral_unique' },
  { title: 'Paid Reach', key: 'lifetime.impressions_paid_unique' },
  { title: 'Fan Reach', key: 'lifetime.impressions_follower_unique' },
  { title: 'Reactions', key: 'lifetime.reactions' },
  { title: 'Likes', key: 'lifetime.likes' },
  { title: 'Love Reactions', key: 'lifetime.reactions_love' },
  { title: 'Haha Reactions', key: 'lifetime.reactions_haha' },
  { title: 'Wow Reactions', key: 'lifetime.reactions_wow' },
  { title: 'Sad Reactions', key: 'lifetime.reactions_sad' },
  { title: 'Angry Reactions', key: 'lifetime.reactions_angry' },
  { title: 'Comments', key: 'lifetime.comments_count' },
  { title: 'Shares', key: 'lifetime.shares_count' },
  { title: 'Answers', key: 'lifetime.question_answers' },
  { title: 'Post Clicks (All)', key: 'lifetime.post_content_clicks' },
  { title: 'Post Link Clicks', key: 'lifetime.post_link_clicks' },
  { title: 'Post Photo View Clicks', key: 'lifetime.post_photo_view_clicks' },
  { title: 'Post Video Play Clicks', key: 'lifetime.post_video_play_clicks' },
  { title: 'Other Post Clicks', key: 'lifetime.post_content_clicks_other' },
  { title: 'Video Length', key: 'video_length' },
  { title: 'Video Views', key: 'lifetime.video_views' },
  { title: 'Organic Video Views', key: 'lifetime.video_views_organic' },
  { title: 'Paid Video Views', key: 'lifetime.video_views_paid' },
  { title: 'Autoplay Video Views', key: 'lifetime.video_views_autoplay' },
  { title: 'Click to Play Video Views', key: 'lifetime.video_views_click_to_play' },
  { title: 'Sound on Video Views', key: 'lifetime.video_views_sound_on' },
  { title: 'Sound off Video Views', key: 'lifetime.video_views_sound_off' },
  { title: 'Partial Video Views', key: 'lifetime.video_views_partial' },
  { title: 'Organic Partial Video Views', key: 'lifetime.video_views_partial_organic' },
  { title: 'Paid Partial Video Views', key: 'lifetime.video_views_partial_paid' },
  { title: 'Autoplay Partial Video Views', key: 'lifetime.video_views_partial_autoplay' },
  { title: 'Click to Play Partial Video Views', key: 'lifetime.video_views_partial_click_to_play' },
  { title: 'Full Video Views', key: 'lifetime.video_views_30s_complete' },
  { title: 'Organic Full Video Views', key: 'lifetime.video_views_30s_complete_organic' },
  { title: 'Paid Full Video Views', key: 'lifetime.video_views_30s_complete_paid' },
  { title: 'Autoplay Full Video Views', key: 'lifetime.video_views_30s_complete_autoplay' },
  { title: 'Click to Play Full Video Views', key: 'lifetime.video_views_30s_complete_click_to_play' },
  { title: '95% Video Views', key: 'lifetime.video_views_p95' },
  { title: 'Organic 95% Video Views', key: 'lifetime.video_views_p95_organic' },
  { title: 'Paid 95% Video Views', key: 'lifetime.video_views_p95_paid' },
  { title: 'Reels Unique Session Plays', key: 'lifetime.reels_unique_session_plays' },
  { title: 'Unique Video Views', key: 'lifetime.video_views_unique' },
  { title: 'Unique Organic Video Views', key: 'lifetime.video_views_organic_unique' },
  { title: 'Unique Paid Video Views', key: 'lifetime.video_views_paid_unique' },
  { title: 'Unique Full Video Views', key: 'lifetime.video_views_30s_complete_unique' },
  { title: 'Unique Organic 95% Video Views', key: 'lifetime.video_views_p95_organic_unique' },
  { title: 'Unique Paid 95% Video Views', key: 'lifetime.video_views_p95_paid_unique' },
  { title: 'Average Video Time Watched', key: 'lifetime.video_view_time_per_view' },
  { title: 'Video View Time', key: 'lifetime.video_view_time' },
  { title: 'Organic Video View Time', key: 'lifetime.video_view_time_organic' },
  { title: 'Paid Video View Time', key: 'lifetime.video_view_time_paid' },
  { title: 'Video Ad Break Ad Impressions', key: 'lifetime.video_ad_break_impressions' },
  { title: 'Video Ad Break Ad Earnings', key: 'lifetime.video_ad_break_earnings' },
  { title: 'Video Ad Break Ad Cost per Impression (CPM)', key: 'lifetime.video_ad_break_cost_per_impression' },
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
  const networkType = profileData?.network_type || 'facebook';
  const profileName = profileData?.name || '';
  const profileId = String(profileData?.customer_profile_id || profileData?.profile_id || profileData?.id || '');
  const permaLink = dataPoint?.perma_link || get(dimensions, 'post_url', get(dataPoint, 'post_url', ''));
  const message = truncate(String(dataPoint?.text || get(dimensions, 'message', get(dataPoint, 'message', '')) || ''), 500);

  const row = [
    createdAt,
    networkType,
    profileName,
    profileId,
    permaLink,
    message
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

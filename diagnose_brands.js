#!/usr/bin/env node

/**
 * Brand Diagnostic — checks Sprout API data availability for specific brands.
 *
 * For each target brand group, lists profiles and probes Sprout's analytics
 * endpoint across several date windows. Prints, per profile and per window:
 *   - data point count
 *   - whether all returned metrics are 0/empty
 *   - first non-zero metric date (if any)
 *
 * Usage: node diagnose_brands.js
 */

const axios = require('axios');
const apiUtils = require('./utils/api');
const groupUtils = require('./utils/groups');

const CUSTOMER_ID = '2653573';
const SPROUT_API_TOKEN = 'MjY1MzU3M3wxNzUyMjE2ODQ5fDdmNzgxNzQyLWI3NWEtNDFkYS1hN2Y4LWRkMTE3ODRhNzBlNg==';
const BASE_URL = 'https://api.sproutsocial.com/v1';
const ANALYTICS_URL = `${BASE_URL}/${CUSTOMER_ID}/analytics/profiles`;
const POSTS_URL = `${BASE_URL}/${CUSTOMER_ID}/analytics/posts`;

const TARGET_BRANDS = [
  'GAIN by Galderma',
  'Maxx Protein',
  'Simpolo',
  'simpolo',
  'Specta Quartz Surfaces',
];

const PROBE_METRICS = [
  'lifetime_snapshot.followers_count',
  'net_follower_growth',
  'impressions',
  'post_impressions',
  'reactions',
  'comments_count',
  'shares_count',
  'post_engagements',
  'video_views',
  'posts_sent_count',
];

function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function buildWindows() {
  const today = new Date();
  const minus = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return d; };
  return [
    { label: 'script_window (2025-04-01 → D-2)', start: '2025-04-01', end: fmtDate(minus(2)) },
    { label: 'last_30_days (D-31 → D-1)',         start: fmtDate(minus(31)), end: fmtDate(minus(1)) },
    { label: 'last_7_days  (D-7  → D-1)',         start: fmtDate(minus(7)),  end: fmtDate(minus(1)) },
    { label: 'yesterday    (D-1  → D-1)',         start: fmtDate(minus(1)),  end: fmtDate(minus(1)) },
    { label: 'today        (D    → D)',           start: fmtDate(today),     end: fmtDate(today)    },
  ];
}

async function probeProfile(profileId, startDate, endDate) {
  const payload = {
    filters: [
      `customer_profile_id.eq(${profileId})`,
      `reporting_period.in(${startDate}...${endDate})`,
    ],
    metrics: PROBE_METRICS,
    page: 1,
  };
  try {
    const resp = await apiUtils.requestWithRetry(
      () => axios.post(ANALYTICS_URL, payload, { headers: apiUtils.getSproutHeaders(SPROUT_API_TOKEN) }),
      `probe profile ${profileId} ${startDate}..${endDate}`,
      3,
      3000,
    );
    if (!resp || !resp.data) return { points: 0, anyNonZero: false, firstNonZeroDate: null, perMetric: {}, perDate: [], error: 'no response' };
    const data = resp.data.data || [];
    let anyNonZero = false;
    let firstNonZeroDate = null;
    const perMetric = {}; // metric -> { nonZeroDays, totalDays }
    const perDate = []; // [{date, nonZeroMetrics, totalMetrics}]
    for (const m of PROBE_METRICS) perMetric[m] = { nonZeroDays: 0, totalDays: 0 };
    for (const dp of data) {
      const metricsObj = dp.metrics || {};
      const period = dp.dimensions?.['reporting_period.by(day)'] || dp.dimensions?.reporting_period;
      const dayDate = period ? new Date(period).toISOString().split('T')[0] : null;
      let nonZeroMetricsThisDay = 0;
      for (const m of PROBE_METRICS) {
        perMetric[m].totalDays += 1;
        const v = metricsObj[m];
        if (typeof v === 'number' && v !== 0) {
          perMetric[m].nonZeroDays += 1;
          nonZeroMetricsThisDay += 1;
        }
      }
      perDate.push({ date: dayDate, nonZeroMetrics: nonZeroMetricsThisDay, totalMetrics: PROBE_METRICS.length });
      if (nonZeroMetricsThisDay > 0) {
        anyNonZero = true;
        if (!firstNonZeroDate || (dayDate && dayDate < firstNonZeroDate)) firstNonZeroDate = dayDate;
      }
    }
    return { points: data.length, anyNonZero, firstNonZeroDate, perMetric, perDate, error: null };
  } catch (e) {
    return { points: 0, anyNonZero: false, firstNonZeroDate: null, perMetric: {}, perDate: [], error: e.message };
  }
}

async function probePostsCount(profileId, startDate, endDate) {
  const payload = {
    filters: [
      `customer_profile_id.eq(${profileId})`,
      `created_time.in(${startDate}...${endDate})`,
    ],
    fields: ['created_time', 'perma_link'],
    timezone: 'America/Chicago',
    page: 1,
  };
  try {
    const resp = await apiUtils.requestWithRetry(
      () => axios.post(POSTS_URL, payload, { headers: apiUtils.getSproutHeaders(SPROUT_API_TOKEN) }),
      `posts profile ${profileId} ${startDate}..${endDate}`,
      3,
      3000,
    );
    return resp?.data?.data?.length ?? 0;
  } catch (_) {
    return 0;
  }
}

(async () => {
  console.log('='.repeat(80));
  console.log('Sprout Brand Diagnostic');
  console.log(`Today: ${fmtDate(new Date())}`);
  console.log('='.repeat(80));

  const groups = await groupUtils.getCustomerGroups(BASE_URL, CUSTOMER_ID, SPROUT_API_TOKEN);
  const profiles = await groupUtils.getAllProfiles(BASE_URL, CUSTOMER_ID, SPROUT_API_TOKEN);

  const targetGroups = groups.filter((g) => TARGET_BRANDS.includes(g.name));
  if (targetGroups.length === 0) {
    console.error('No target brand groups found in Sprout.');
    process.exit(1);
  }

  const windows = buildWindows();
  const summary = [];

  for (const g of targetGroups) {
    const groupProfiles = profiles.filter((p) => Array.isArray(p.groups) && p.groups.includes(g.group_id));
    console.log('\n' + '─'.repeat(80));
    console.log(`Brand: ${g.name}   group_id=${g.group_id}   profiles=${groupProfiles.length}`);
    console.log('─'.repeat(80));

    if (groupProfiles.length === 0) {
      console.log('  ⚠ No profiles attached to this group.');
      summary.push({ brand: g.name, profile: '-', network: '-', issue: 'no profiles in group' });
      continue;
    }

    for (const p of groupProfiles) {
      console.log(`\n  Profile: ${p.name || '(unnamed)'}   id=${p.customer_profile_id}   network=${p.network_type}`);

      let last30 = null;
      for (const w of windows) {
        const r = await probeProfile(p.customer_profile_id, w.start, w.end);
        const status = r.error
          ? `ERROR: ${r.error}`
          : `points=${String(r.points).padStart(4)}  nonZero=${r.anyNonZero ? 'YES' : 'no '}  firstNonZero=${r.firstNonZeroDate || '-'}`;
        console.log(`    ${w.label.padEnd(38)} ${status}`);
        if (w.label.startsWith('last_30')) {
          last30 = r;
          if (r.points === 0) {
            summary.push({ brand: g.name, profile: p.name, network: p.network_type, issue: 'NO data points in last 30 days' });
          } else if (!r.anyNonZero) {
            summary.push({ brand: g.name, profile: p.name, network: p.network_type, issue: 'data points exist but all metrics are 0 in last 30 days' });
          }
        }
      }

      // Per-metric breakdown for the last_30_days probe
      if (last30 && last30.points > 0) {
        console.log(`    --- per-metric coverage in last 30 days (nonZeroDays / totalDays) ---`);
        for (const [m, stats] of Object.entries(last30.perMetric)) {
          const pct = stats.totalDays ? Math.round((stats.nonZeroDays / stats.totalDays) * 100) : 0;
          const flag = stats.nonZeroDays === 0 ? '  ⚠ ALL ZERO' : '';
          console.log(`      ${m.padEnd(38)} ${String(stats.nonZeroDays).padStart(3)}/${String(stats.totalDays).padStart(3)}  (${String(pct).padStart(3)}%)${flag}`);
          if (stats.nonZeroDays === 0) {
            summary.push({ brand: g.name, profile: p.name, network: p.network_type, issue: `metric "${m}" is 0 for all 30 days` });
          }
        }
        // Per-date completeness
        const allZeroDates = last30.perDate.filter(d => d.nonZeroMetrics === 0).map(d => d.date);
        if (allZeroDates.length > 0) {
          console.log(`    --- dates with ALL metrics zero (${allZeroDates.length}): ${allZeroDates.join(', ')}`);
        }
      }

      // Posts count for last 30 days as a secondary signal
      const minus = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return fmtDate(d); };
      const postsCount = await probePostsCount(p.customer_profile_id, minus(31), minus(1));
      console.log(`    posts (last 30 days)                   count=${postsCount}`);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY OF ISSUES');
  console.log('='.repeat(80));
  if (summary.length === 0) {
    console.log('No issues detected — every profile returned non-zero data in the last 30 days.');
  } else {
    for (const s of summary) {
      console.log(`  ✗ [${s.brand}] ${s.network}  ${s.profile}  →  ${s.issue}`);
    }
  }
  console.log('\nDone.');
})().catch((e) => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});

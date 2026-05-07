# Quick Reference: How Your Cron Setup Works

## 🎯 TL;DR

- **No local PC needed** - everything runs on Vercel's servers
- **No PM2 needed** - Vercel manages the scheduling
- **Daily at 11:40 PM IST** - automated cron job executes
- **3 API calls made** → Sprout (groups, profiles, analytics)
- **2 folder destinations** → FOLDER_ID_SIMPLE + FOLDER_ID_APRIL
- **Data lands in Google Sheets** → instantly available to you

---

## 📍 Where Code Runs

| Component | Location | Triggered By |
|-----------|----------|--------------|
| **api/cron.js** | Vercel Servers | Daily cron (11:40 PM IST) |
| **Env Variables** | Vercel Dashboard | Manual setup (one-time) |
| **Your Code** | GitHub (source) | Vercel auto-deploys on push |
| **Google Sheets** | Google Cloud | Your code updates it |
| **Sprout API** | Sprout Social | Your code calls it |

---

## 🔄 Data Flow (Simplified)

```
⏰ 11:40 PM IST
    ↓
📍 Vercel calls: GET /api/cron
    ↓
🔐 Read secrets: CUSTOMER_ID, SPROUT_API_TOKEN, GOOGLE_CREDENTIALS_JSON
    ↓
📱 Fetch from Sprout:
   - Groups list
   - Profiles list
   - Yesterday's analytics
    ↓
📊 Process data:
   - Group profiles by type (Instagram, Facebook, etc.)
   - Format metrics into spreadsheet rows
    ↓
📄 Update Google Sheets (2 times):
   - FOLDER_ID_SIMPLE/spreadsheets
   - FOLDER_ID_APRIL/spreadsheets
    ↓
✅ Done!
```

---

## 🔐 Secrets Configuration

**Where to add in Vercel Dashboard:**

Settings → Environment Variables

| Variable | Value | What It's For |
|----------|-------|---------------|
| `CUSTOMER_ID` | 12345 | Identify your Sprout account |
| `SPROUT_API_TOKEN` | token_xxx | Authenticate with Sprout API |
| `FOLDER_ID_SIMPLE` | google_folder_id | Where to save daily analytics sheets |
| `FOLDER_ID_APRIL` | google_folder_id | Where to save April data sheets |
| `GOOGLE_CREDENTIALS_JSON` | { ...service account key...} | Google API authentication |

---

## 📂 Files That Matter

| File | Purpose |
|------|---------|
| **api/cron.js** | Main cron job logic (entry point) |
| **utils/api.js** | Calls Sprout Social API |
| **utils/sheets.js** | Updates Google Sheets cells |
| **utils/groups.js** | Organizes profiles by group |
| **platforms/*.js** | Format data by network (Instagram, Facebook, etc.) |

---

## 🚨 Common Issues & Fixes

| Problem | Cause | Fix |
|---------|-------|-----|
| Cron doesn't run | Not configured in Vercel | Settings → Cron Jobs → Add schedule |
| "Invalid token" | Sprout API token expired | Update SPROUT_API_TOKEN in env vars |
| "Permission denied" | Google service account revoked | Re-generate and update GOOGLE_CREDENTIALS_JSON |
| "Folder not found" | Wrong folder ID | Check FOLDER_ID_SIMPLE and FOLDER_ID_APRIL |
| Data not updating | Cron executed but sheets failed | Check Vercel Logs for specific error |

---

## 📈 Timeline Each Day

```
11:40:00 PM  → Cron fires
11:40:01 PM  → api/cron.js starts
11:40:05 PM  → Fetch data from Sprout APIs
11:40:15 PM  → Update FOLDER_ID_SIMPLE sheets
11:40:45 PM  → Update FOLDER_ID_APRIL sheets
11:41:45 PM  → ✅ Complete!
```

**Duration:** ~1 minute per execution

---

## 🔍 How to Debug

### Step 1: Check if cron fired
- Vercel Dashboard → Project → Logs
- Look for `api/cron` entries

### Step 2: Check error messages
- In Logs, expand the failed entry
- See which step failed (Sprout API? Google API?)

### Step 3: Common patterns to look for
- `Authentication error` → Secrets are wrong
- `No data found` → Sprout API returned empty
- `Permission denied` → Google service account issue
- `Timeout` → API taking too long

---

## ✍️ Updating the Schedule

To change cron time from 11:40 PM to (example) 9:00 AM:

**In Vercel Dashboard:**
1. Project Settings → Cron Jobs
2. Edit the cron expression: `0 3 * * *` → `0 9 * * *`
   - Format: `minute hour day month dayOfWeek` (UTC)
   - 9:00 AM IST = 3:30 AM UTC = `30 3 * * *`

---

## 🔗 API Calls Made by Your Code

```javascript
// 1. Get all groups
POST https://api.sproutsocial.com/v1/{CUSTOMER_ID}/groups

// 2. Get all profiles
POST https://api.sproutsocial.com/v1/{CUSTOMER_ID}/profiles

// 3. Get analytics data
POST https://api.sproutsocial.com/v1/{CUSTOMER_ID}/analytics/profiles
Body: {
  "filters": ["created_time.in(yesterday)"],
  "metrics": ["impressions", "likes", "comments", ...]
}

// 4. Update Google Sheets (multiple calls)
PUT https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}/values/Sheet1!A:Z
Body: {
  "values": [
    ["date", "platform", "impressions", "likes", ...],
    ["2025-03-16", "instagram", 5000, 250, ...],
    ...
  ]
}
```

---

## 💾 Data Stored Where

| Data | Storage | Who Owns It |
|------|---------|-----------|
| Source Code | GitHub | You (public/private repo) |
| Secrets (tokens, keys) | Vercel Env Vars | You (encrypted) |
| Processed Analytics | Google Sheets | You (Google Drive) |
| Execution Logs | Vercel Logs | Vercel (kept for ~1 week) |
| Post Content & Metrics | Sprout Social | Sprout (their database) |

---

## 🎓 Learning Path

1. **Understand the flow** ← You are here! (This file)
2. **Read SETUP_EXPLANATION.md** ← Detailed technical explanation
3. **Look at api/cron.js** ← See the actual code
4. **Check Vercel Logs** ← See it running in real-time
5. **Modify & Deploy** ← Make changes, push to GitHub, Vercel auto-deploys

---

## 🚀 Deployment Process

```
You edit code locally
    ↓
git push to GitHub
    ↓
Vercel webhook triggers
    ↓
Vercel pulls latest code
    ↓
npm install (dependencies)
    ↓
Build completes
    ↓
New code is live!
    ↓
Next cron run uses new code
```

**Zero downtime. Automatic.**

---

## 📞 Support

- **Vercel Logs:** Project → Logs (see execution details)
- **Vercel Status:** https://www.vercelstatus.com/
- **Sprout API Docs:** https://developer.sproutsocial.com/
- **Google Sheets API:** https://developers.google.com/sheets

---

## ✅ Checklist for Initial Setup

- [ ] Environment variables added to Vercel
- [ ] Cron schedule configured in Vercel
- [ ] First manual test run completed (check logs)
- [ ] Google Sheets visible with test data
- [ ] Vercel has access to read Sprout API
- [ ] Google service account has Drive & Sheets permissions
- [ ] Folder IDs (SIMPLE & APRIL) exist in Google Drive

---

**Remember:** Everything is in the cloud. Just push code to GitHub, and Vercel handles the rest! 🚀


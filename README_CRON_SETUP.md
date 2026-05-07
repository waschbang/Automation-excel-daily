# Your Cron Job Setup - Complete Guide

## 📚 Documentation Overview

You have 4 documents to understand your setup:

1. **README_CRON_SETUP.md** ← You are here (start here!)
2. **QUICK_REFERENCE.md** → Fast lookup guide (1-2 min read)
3. **SETUP_EXPLANATION.md** → Detailed step-by-step explanation (10 min read)
4. **ARCHITECTURE.md** → Technical deep-dive with diagrams (15 min read)

---

## ❓ Your Original Question

> "I have this setup in EC2 instance, and also I have no PM2 and no local runs on there, so how the hell the cron is being set and all like whats the process how the data we get and then give it to the sheets and all"

### The Answer (Short Version)

**You're NOT running anything on EC2 (or any local machine).**

Your code runs on **Vercel** (a cloud platform). Here's how:

1. **11:40 PM IST every day** → Vercel's cron scheduler automatically triggers your code
2. **Your code runs** → Fetches data from Sprout Social API
3. **Updates Google Sheets** → Puts the data into your spreadsheets
4. **Stops running** → Waits until next day

**No PM2 needed** because Vercel manages everything. **No local machine needed** because it all runs in the cloud.

---

## 🎯 The Complete Process

### Daily Execution Timeline

```
Your Spreadsheet is EMPTY
    │
    ↓
11:40 PM IST (Every Day)
    │
    ├─ Vercel Cron Scheduler: "Time to run!"
    │
    ├─ HTTP Request → https://your-vercel-app.vercel.app/api/cron
    │
    ├─ Node.js starts on Vercel server
    │
    ├─ Load environment variables:
    │  ├─ CUSTOMER_ID = your Sprout account ID
    │  ├─ SPROUT_API_TOKEN = your Sprout API key
    │  ├─ GOOGLE_CREDENTIALS_JSON = your Google service account key
    │  ├─ FOLDER_ID_SIMPLE = Google Drive folder for daily data
    │  └─ FOLDER_ID_APRIL = Google Drive folder for April data
    │
    ├─ Authenticate with Google & Sprout
    │
    ├─ Fetch data:
    │  ├─ List of all your groups (from Sprout)
    │  ├─ List of all your profiles (from Sprout)
    │  └─ Yesterday's analytics (from Sprout)
    │
    ├─ Process data:
    │  ├─ Group profiles by type (Instagram, Facebook, etc.)
    │  ├─ Format metrics into spreadsheet rows
    │  └─ Organize by destination folder
    │
    ├─ Update Google Sheets (STEP 1):
    │  ├─ Find/create spreadsheets in FOLDER_ID_SIMPLE
    │  ├─ Update all network sheets (Instagram, Facebook, LinkedIn, etc.)
    │  └─ Done!
    │
    ├─ Wait 30 seconds
    │
    ├─ Update Google Sheets (STEP 2):
    │  ├─ Find/create spreadsheets in FOLDER_ID_APRIL
    │  ├─ Update all network sheets with April data
    │  └─ Done!
    │
    ├─ Log: "✓ Execution complete"
    │
    └─ Return HTTP 200 response
       └─ Vercel stores execution logs

Your Spreadsheet now HAS DATA
    │
    └─ You can view it in Google Sheets!
```

---

## 🔐 Where Your Secrets Are Stored

You might be worried: *"Where are my API keys? Are they secure?"*

**Answer: In Vercel's secure environment variable vault.**

```
Vercel Dashboard
    │
    ├─ Project Settings
    │   │
    │   └─ Environment Variables (encrypted)
    │       ├─ CUSTOMER_ID
    │       ├─ SPROUT_API_TOKEN
    │       ├─ FOLDER_ID_SIMPLE
    │       ├─ FOLDER_ID_APRIL
    │       └─ GOOGLE_CREDENTIALS_JSON
    │
    ├─ Your code reads from here at runtime
    ├─ NOT stored in GitHub (secure!)
    ├─ NOT stored on your local machine
    ├─ NOT visible in your code
    └─ ✓ Safe!
```

---

## 🚀 How Everything is Connected

### Cloud Architecture

```
                     ┌─────────────────────────┐
                     │   YOUR LOCAL MACHINE    │
                     │  (Just for editing!)    │
                     │                         │
                     │  ┌─────────────────┐    │
                     │  │ VSCode/Editor   │    │
                     │  │ (edit code)     │    │
                     │  └────────┬────────┘    │
                     │           │ git push    │
                     │  ┌────────↓────────┐    │
                     │  │  GitHub Repo    │    │
                     │  │  (source code)  │    │
                     │  └────────┬────────┘    │
                     └───────────┼─────────────┘
                                 │
                                 │ webhook
                                 ↓
                     ┌─────────────────────────┐
                     │  VERCEL (Cloud)         │
                     │                         │
                     │  ┌────────────────────┐ │
                     │  │ Auto-Deploy        │ │
                     │  │ (pull latest code) │ │
                     │  └────────────────────┘ │
                     │                         │
                     │  ┌────────────────────┐ │
                     │  │ Daily Cron Job     │ │
                     │  │ (11:40 PM IST)     │ │
                     │  │                    │ │
                     │  │ ├─ Read secrets    │ │
                     │  │ ├─ Fetch from API  │ │
                     │  │ ├─ Update sheets   │ │
                     │  │ └─ Log result      │ │
                     │  └────────┬───────────┘ │
                     │           │             │
                     │           │ calls       │
                     │  ┌────────┴────────┐    │
                     │  │ Environment     │    │
                     │  │ Variables       │    │
                     │  │ (encrypted)     │    │
                     │  └─────────────────┘    │
                     └────┬─────────────────┬──┘
                          │                 │
                     calls │ to              │ calls
                          ↓ API             ↓ to API
                     ┌────────────┐    ┌──────────────┐
                     │ Sprout     │    │ Google       │
                     │ Social     │    │ Sheets/Drive │
                     │ API        │    │ API          │
                     │            │    │              │
                     │ returns:   │    │ returns:     │
                     │ ├─Groups   │    │ ├─Auth token │
                     │ ├─Profiles │    │ └─Spreadsheet
                     │ └─Analytics    │   updates OK  │
                     └────────────┘    └──────────────┘
                          ↓                    ↓
                     ┌─────────────────────────────┐
                     │  YOUR GOOGLE DRIVE SHEETS   │
                     │                             │
                     │  📊 Brand A - Instagram     │
                     │  📊 Brand A - Facebook      │
                     │  📊 Brand B - LinkedIn      │
                     │  ... (all your data!)       │
                     └─────────────────────────────┘
```

---

## 🔄 The Data Flow (Simple Version)

```
Sprout Social
    ↓
(Your profiles & analytics data)
    ↓
Vercel runs api/cron.js
    ↓
Fetches data from Sprout API
    ↓
Formats data (Instagram, Facebook, etc.)
    ↓
Google Sheets API
    ↓
Your Google Sheets
    ↓
✓ You can see your analytics!
```

---

## ✅ What Makes This Work

### 1. GitHub Repo
- **What:** Your source code (api/cron.js, utils, platforms, etc.)
- **Where:** github.com/your-repo
- **Purpose:** Central source of truth for all code

### 2. Vercel Deployment
- **What:** Automatically deploys your code from GitHub
- **When:** Whenever you push changes to GitHub
- **How:** Vercel webhook detects the push, pulls code, runs `npm install`, deploys to their servers

### 3. Environment Variables (Secrets)
- **What:** API tokens, folder IDs, credentials
- **Where:** Vercel Dashboard → Settings → Environment Variables
- **Why:** Your code reads these at runtime (not hardcoded in files)

### 4. Cron Scheduler
- **What:** Automated trigger every day
- **When:** 11:40 PM IST (configured in Vercel)
- **How:** Vercel's internal scheduler makes HTTP request to /api/cron

### 5. API Calls
- **Sprout API:** Sends requests asking for groups, profiles, analytics data
- **Google Sheets API:** Sends requests to update cells with the data

### 6. Google Service Account
- **What:** Robot user that can access Google Sheets/Drive on your behalf
- **How:** Credentials stored as GOOGLE_CREDENTIALS_JSON env variable
- **Why:** Allows automatic updates without human interaction

---

## 📈 Example: What Happens at 11:40 PM IST

**Real scenario:**

```
11:40 PM IST - Instagram account @brand_instagram from "Brand A" group

Step 1: Sprout API call
  Response: "Yesterday's posts got 5,000 impressions, 250 likes, 45 comments"

Step 2: Data processing
  Format as: ["2025-03-16", "instagram", "Brand A", "5000", "250", "45", ...]

Step 3: Google Sheets update
  Find: Spreadsheet "Brand A" in FOLDER_ID_SIMPLE
  Find: Sheet "Instagram"
  Update: Cell A2:H999 with new data

Step 4: Verification
  Check: Data appears in your Google Sheets instantly

Step 5: Tomorrow morning
  You open Google Sheets
  You see: "Instagram, 5000 impressions, 250 likes, 45 comments" for yesterday
  ✓ Done!
```

---

## 🎯 Why This Architecture?

| Feature | Benefit |
|---------|---------|
| **Serverless (Vercel)** | No servers to manage, no EC2 instances to maintain |
| **Automated Cron** | Runs daily without you doing anything |
| **GitHub Integration** | Changes deploy automatically |
| **Encrypted Secrets** | Your API keys are safe |
| **Scalable** | Can handle 1 profile or 1000 profiles |
| **Reliable** | Vercel maintains 99.95% uptime SLA |
| **Cost-effective** | Pay only for what you use (likely under $1/month) |

---

## 🔍 How to Check If It's Working

### 1. Check Vercel Logs
- **Go to:** Vercel Dashboard → Your Project → Logs
- **Look for:** Entries with timestamp around 11:40 PM IST
- **Expected:** "Cron job triggered" → "Processing complete" messages

### 2. Check Google Sheets
- **Open:** Your spreadsheet in Google Sheets
- **Look for:** Yesterday's data in the relevant sheets
- **Expected:** New rows with impressions, likes, comments, etc.

### 3. Check for Errors
- **Common issues:**
  - `Authentication error` → Secrets are wrong
  - `No data found` → Sprout API returned nothing
  - `Permission denied` → Google service account issue

---

## 🛠️ Common Tasks

### Task 1: Change Cron Time
**Goal:** Run at 9:00 AM instead of 11:40 PM

**Steps:**
1. Vercel Dashboard → Settings → Cron Jobs
2. Change cron expression (9:00 AM IST = 3:30 AM UTC = `30 3 * * *`)
3. Save

### Task 2: Update Sprout API Token
**Goal:** Token expired, need to update

**Steps:**
1. Vercel Dashboard → Settings → Environment Variables
2. Find: SPROUT_API_TOKEN
3. Update the value with new token
4. Next cron run uses new token

### Task 3: Add a New Folder
**Goal:** Store data in additional folder

**Steps:**
1. Create new folder in Google Drive
2. Copy folder ID
3. Vercel Dashboard → Environment Variables
4. Add: FOLDER_ID_NEW = folder_id_value
5. Update code to use new variable
6. Push to GitHub

### Task 4: Change Data Frequency
**Goal:** Run hourly instead of daily

**Steps:**
1. Vercel Dashboard → Cron Jobs
2. Change: `40 18 * * *` → `40 * * * *` (every hour at :40)
3. Monitor costs (more executions = more cost)

---

## ⚠️ Important Gotchas

### 1. Timezone Confusion
- **Cron time shown in Vercel:** UTC
- **Your IST time:** UTC + 5:30
- **Example:** 11:40 PM IST = 6:10 PM UTC
- **Cron expression:** `10 18 * * *`

### 2. Data Lag
- **Code fetches:** Yesterday's data (2 days ago for complete metrics)
- **Why:** Today's data might not be finalized yet
- **Result:** You see yesterday's complete data, not today's partial data

### 3. Spreadsheet Limits
- **Google Sheets limit:** ~10 million cells per spreadsheet
- **Your usage:** Probably < 1000 cells
- **Impact:** Not an issue for you (plenty of room)

### 4. Rate Limiting
- **Sprout API:** 5 requests per second
- **Your usage:** ~3-4 requests per cron run
- **Impact:** Not an issue (well within limits)

### 5. Costs
- **Vercel:** Free tier includes cron jobs
- **Google Sheets:** Free
- **Sprout API:** You already pay for it
- **Total new costs:** $0!

---

## 📞 Troubleshooting Checklist

- [ ] Code is on GitHub
- [ ] Vercel is connected to GitHub
- [ ] Environment variables added to Vercel
- [ ] Cron schedule configured in Vercel
- [ ] First manual test completed (click "Run" in Vercel logs)
- [ ] Data appears in Google Sheets
- [ ] Google Drive folder IDs are correct
- [ ] Sprout API token is valid
- [ ] Google service account has permissions

---

## 🎓 Next Steps

1. **Understand the flow:** Read QUICK_REFERENCE.md
2. **Deep dive:** Read SETUP_EXPLANATION.md
3. **Technical details:** Read ARCHITECTURE.md
4. **Monitor execution:** Check Vercel Logs daily
5. **Make changes:** Edit code → Push to GitHub → Auto-deployed
6. **Optimize:** Adjust schedule, add metrics, change formatting

---

## 🚀 Summary

**You have a completely automated, serverless data pipeline:**

- **Trigger:** Daily at 11:40 PM IST (automatic)
- **Data source:** Sprout Social API
- **Processing:** Node.js on Vercel (no local machine needed)
- **Storage:** Google Sheets (your data)
- **Management:** GitHub + Vercel (both free/cheap)

**Zero maintenance. Zero downtime. Completely automatic. ✓**

---

**Questions?** Check the other documentation files or your project README!


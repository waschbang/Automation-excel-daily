# Complete Setup Explanation: Cron Job on EC2 (No PM2, No Local Runs)

## 🎯 The Big Picture

Your project runs on **Vercel** (a serverless platform), NOT on EC2. The "EC2 instance" confusion comes from the fact that Vercel is managing the infrastructure. Think of it this way:

- **Your code lives on GitHub**
- **Vercel watches GitHub** and automatically deploys changes
- **Vercel's servers** (which are cloud infrastructure, similar to EC2) run your code
- **No local machine needed** - everything is in the cloud
- **No PM2 needed** - Vercel manages the processes automatically

---

## 🔄 The Complete Data Flow (Step by Step)

### Phase 1: Cron Job Triggers (Daily at 11:40 PM IST)

```
Vercel Cron Scheduler
    ↓
Hits: https://your-domain.vercel.app/api/cron
    ↓
Vercel executes api/cron.js on their servers
```

**Where is this configured?**

- Not in code! It's set in **Vercel Dashboard**
- You would configure it via:
  - Dashboard → Your Project → Cron Jobs
  - Or in a `vercel.json` file (but not present in your current project)

---

### Phase 2: Authentication with Google & Sprout

```
api/cron.js starts running:

1. READ ENVIRONMENT VARIABLES
   ├── CUSTOMER_ID (from Sprout Social)
   ├── SPROUT_API_TOKEN (from Sprout Social)
   ├── FOLDER_ID_SIMPLE (your Google Drive folder)
   ├── FOLDER_ID_APRIL (another Google Drive folder)
   └── GOOGLE_CREDENTIALS_JSON (service account key)

2. CREATE JWT AUTHENTICATION
   └── Uses Google credentials to authenticate as a service account
       (This is like a robot user that has permissions to edit sheets)

3. RETURN GOOGLE API CLIENTS
   └── drive (to create/find spreadsheets)
   └── sheets (to update cell data)
```

**Key Point:** The credentials are **NOT stored in code**. They're stored in **Vercel's Environment Variables** (encrypted). Your code reads them at runtime:

```javascript
const credentialsJson = process.env.GOOGLE_CREDENTIALS_JSON;
const credentials = JSON.parse(credentialsJson);
// Now you have client_email, private_key, etc.
```

---

### Phase 3: Fetch Data from Sprout Social API

```
Vercel Server (running your code)
    ↓
HTTP POST → https://api.sproutsocial.com/v1/{CUSTOMER_ID}/groups
    ↓
Returns: List of all your groups with IDs
    ↓
HTTP POST → https://api.sproutsocial.com/v1/{CUSTOMER_ID}/profiles
    ↓
Returns: List of all social media profiles (Instagram, Facebook, LinkedIn, etc.)
    ↓
Organize profiles by group
    ↓
HTTP POST → https://api.sproutsocial.com/v1/{CUSTOMER_ID}/analytics/profiles
    ↓
Returns: Analytics data (impressions, likes, comments, etc.) for each profile
```

**What data is retrieved?**

- Post metrics from Instagram, Facebook, LinkedIn, YouTube, Twitter
- Date range: Yesterday's data (calculated as 2 days ago for complete metrics)
- Metrics like: impressions, reactions, comments, video views, etc.

---

### Phase 4: Process Data by Network Type

```
For each group:
    │
    ├─ Get all profiles in that group
    │
    ├─ Separate profiles by network type:
    │  ├── Instagram profiles
    │  ├── Facebook profiles
    │  ├── LinkedIn profiles
    │  ├── YouTube channels
    │  └── Twitter profiles
    │
    └─ For each network type:
         │
         ├─ Check if sheet exists in spreadsheet
         ├─ If not, create new sheet
         ├─ Set up headers (column names)
         └─ Format the analytics data into rows
```

**Example:** If you have 3 Instagram accounts in "Brand A" group:

- Data comes back from Sprout API
- Code extracts Instagram-specific metrics
- Formats them into spreadsheet rows
- Uploads to the Instagram sheet in Brand A's spreadsheet

---

### Phase 5: Update Google Sheets

```
For each network sheet:
    │
    ├─ Ensure spreadsheet has enough rows (auto-expand if needed)
    │
    └─ Update cells with:
       ├─ Posted content (text, links)
       ├─ Metrics (impressions, likes, comments)
       ├─ Network (Instagram, Facebook, etc.)
       ├─ Posted by (which team member)
       ├─ Post timestamp
       └─ Any other tracked metrics
```

**Google Sheets API Call:**

```
Vercel Server
    ↓
Google Sheets API
    ↓
Find spreadsheet by ID (stored in FOLDER_ID_SIMPLE or FOLDER_ID_APRIL)
    ↓
Find sheet "Instagram", "Facebook", etc.
    ↓
Update cells A2:Z999 with analytics data
    ↓
Done! Data appears in your sheet instantly
```

---

### Phase 6: Two Scripts Run Sequentially

The cron.js file runs **TWO workflows** back-to-back:

**STEP 1: simple-analytics.js logic**

```
Process all groups
    ↓
Save spreadsheets to FOLDER_ID_SIMPLE folder
    ↓
Wait 30 seconds
```

**STEP 2: sprout_april.js logic**

```
Process all groups again
    ↓
Save spreadsheets to FOLDER_ID_APRIL folder
    ↓
Complete
```

**Why two runs?** Probably because:

- FOLDER_ID_SIMPLE = Monthly/daily analytics
- FOLDER_ID_APRIL = Special April 2025 data tracking

---

## 📊 Your Project Structure

```
Automation-excel-daily/
├── api/
│   └── cron.js                    ← THE MAIN FILE (runs on Vercel)
├── platforms/
│   ├── instagram.js               ← Format Instagram data
│   ├── facebook.js                ← Format Facebook data
│   ├── youtube.js                 ← Format YouTube data
│   ├── linkedin.js                ← Format LinkedIn data
│   └── twitter.js                 ← Format Twitter data
├── utils/
│   ├── api.js                     ← Make API calls to Sprout
│   ├── sheets.js                  ← Update Google Sheets
│   ├── simple-drive.js            ← Find/create spreadsheets
│   └── groups.js                  ← Organize profiles by group
├── package.json                   ← Dependencies
└── [other files - local testing]
```

---

## 🔐 Environment Variables You Need on Vercel

```
CUSTOMER_ID=12345
SPROUT_API_TOKEN=xxxx-yyyy-zzzz
FOLDER_ID_SIMPLE=google-drive-folder-id-here
FOLDER_ID_APRIL=another-google-drive-folder-id
GOOGLE_CREDENTIALS_JSON={
  "type": "service_account",
  "project_id": "your-project",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...",
  "client_email": "service-account@project.iam.gserviceaccount.com",
  ...
}
```

**How to add these to Vercel:**

1. Go to Vercel Dashboard
2. Select your project
3. Settings → Environment Variables
4. Add each variable (copy-paste the JSON as-is for GOOGLE_CREDENTIALS_JSON)

---

## 🌐 Network Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    DAILY (11:40 PM IST)                     │
│                  Vercel Cron Scheduler                       │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ↓
        ┌────────────────────────┐
        │  api/cron.js runs      │
        │  (on Vercel server)    │
        └────────┬───────────────┘
                 │
      ┌──────────┴──────────┐
      ↓                     ↓
┌─────────────┐       ┌──────────────┐
│   Sprout    │       │   Google     │
│   Social    │       │   APIs       │
│   API       │       │              │
│ (fetch      │       │ (auth +      │
│  data)      │       │  update)     │
└─────────────┘       └──────────────┘
      ↓                     ↓
   Get Groups         Create/Find
   Get Profiles       Spreadsheets
   Get Analytics      Update Sheets
      │
      └─────────────────┬─────────────────┐
                        ↓                 ↓
                   ┌─────────┐        ┌─────────┐
                   │ SIMPLE  │        │ APRIL   │
                   │ FOLDER  │        │ FOLDER  │
                   │ (Sheets)│        │ (Sheets)│
                   └─────────┘        └─────────┘
```

---

## 🚀 How Data Actually Gets to Your Sheets

### Real Example:

**Time: 11:40 PM IST**

1. Vercel scheduler fires
2. cron.js starts on Vercel's server
3. Authenticates to Google & Sprout
4. Fetches: "Yesterday's Instagram posts from @brand_instagram got 5,000 impressions, 250 likes"
5. Code formats this as a spreadsheet row
6. Google Sheets API updates your spreadsheet with this data
7. You open Google Sheets and see the new data (within seconds)

**No local machine involved. No PM2 needed. Just cloud ↔ cloud.**

---

## ⚙️ Why No Local PM2?

**PM2** is a local process manager:

```
Your Computer:
  node schedule-daily-update.js  ← PM2 keeps this running
       ↓
    Runs every X minutes
       ↓
    Updates sheets
```

**Your Setup (Vercel Cron):**

```
Vercel Cloud:
  Automatic cron triggers
       ↓
    Vercel runs api/cron.js
       ↓
    Updates sheets
```

**Vercel = Serverless = No need to keep a process running 24/7 on your own machine.**

---

## 🔍 How to Monitor/Debug

### Check Vercel Logs:

1. Vercel Dashboard → Your Project → Logs
2. You'll see:
   - When cron executed
   - Console.log output from your code
   - Any errors

### What gets logged:

```
[11:40 PM] Vercel cron job triggered
[11:40 PM] Authenticating with Google APIs...
[11:40 PM] ✓ Loaded credentials for service-account@project.iam...
[11:40 PM] ✓ Found 5 groups and 25 profiles
[11:40 PM] === Processing Group: Brand A ===
[11:41 PM] Updating Instagram sheet with 10 rows
[11:41 PM] Updating Facebook sheet with 8 rows
...
[11:42 PM] === SEQUENTIAL ANALYTICS UPDATE COMPLETED ===
[11:42 PM] Success!
```

---

## 📝 The Complete Timeline

```
11:40:00 PM IST
  └─ Vercel scheduler triggers HTTP request to /api/cron

11:40:01 PM
  └─ Node.js starts executing api/cron.js
  └─ Reads environment variables from Vercel

11:40:02 PM
  └─ Authenticates with Google using service account

11:40:03 PM
  └─ Calls Sprout Social API to get groups/profiles

11:40:05 PM
  └─ Calls Sprout Social API to get analytics data for yesterday

11:40:10 PM
  └─ Formats data by network type (Instagram, Facebook, etc.)

11:40:15 PM
  └─ Updates FOLDER_ID_SIMPLE spreadsheets

11:40:45 PM
  └─ Waits 30 seconds

11:41:15 PM
  └─ Updates FOLDER_ID_APRIL spreadsheets

11:41:45 PM
  └─ Sends success response to Vercel
  └─ Execution complete!
```

**Total time: ~1 minute per run**

---

## ❓ FAQ

**Q: If there's no local PM2, how does it run daily?**
A: Vercel's cron scheduler automatically makes an HTTP request to your endpoint daily. You don't need anything running locally.

**Q: Where are my secrets stored?**
A: In Vercel's encrypted environment variable vault (not in code, not on EC2, not on your local machine).

**Q: Can I test it locally?**
A: Yes! Run `npm start` on your local machine, but this runs the `schedule-daily-update.js` file locally using node-schedule, not the Vercel cron.

**Q: What if the cron fails?**
A: Vercel logs the error. You can see it in Vercel Dashboard → Logs. Common issues:

- Invalid Sprout API token (expired/revoked)
- Google service account key not working
- Rate limiting from Sprout API
- Spreadsheet permissions issues

**Q: Can I change the cron time?**
A: Yes! In Vercel Dashboard:

1. Project → Settings → Cron Jobs
2. Add/edit the schedule (cron syntax: `40 18 * * *` = 11:40 PM IST)

**Q: Is there a vercel.json?**
A: Not in your current project. Cron is configured in Vercel Dashboard UI, not in code.

---

## 🎯 Key Takeaway

```
Your entire automation runs in the cloud (Vercel):

  GitHub → Vercel (auto-deploys) → Daily Cron → Sprout API → Google Sheets

  No local machine. No PM2. No EC2. Just serverless cloud automation!
```

Each day at 11:40 PM IST, without you doing anything:

1. Vercel triggers your code
2. Your code fetches analytics from Sprout
3. Your code updates Google Sheets
4. You wake up with fresh data in your sheets!

# Architecture Diagram & Technical Details

## 🏗️ System Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        YOUR LOCAL MACHINE                                │
│                      (You don't need anything                             │
│                       running here 24/7)                                  │
│                                                                            │
│  ┌─────────────────┐                                                      │
│  │   Your Editor   │                                                      │
│  │  (VSCode, etc)  │                                                      │
│  └────────┬────────┘                                                      │
│           │ git push                                                       │
│           ↓                                                                │
│  ┌─────────────────┐                                                      │
│  │   GitHub Repo   │                                                      │
│  │  (source code)  │                                                      │
│  └────────┬────────┘                                                      │
└───────────┼──────────────────────────────────────────────────────────────┘
            │
            │ webhook triggers
            │
┌───────────↓──────────────────────────────────────────────────────────────┐
│                           VERCEL (Cloud)                                  │
│                                                                            │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ 1. Auto-Deploy on GitHub Push                                   │    │
│  │    └─ npm install                                               │    │
│  │    └─ Prepare functions                                         │    │
│  │    └─ Deploy api/cron.js                                        │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                            │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ 2. Daily Cron Scheduler (11:40 PM IST)                          │    │
│  │    └─ Makes HTTP request to your endpoint                       │    │
│  │    └─ Triggers api/cron.js execution                            │    │
│  │                                                                  │    │
│  │    ┌──────────────────────────────────────────┐                │    │
│  │    │ 3. Cron Job Execution                    │                │    │
│  │    │                                          │                │    │
│  │    │ a) Read Environment Variables            │                │    │
│  │    │    ├─ CUSTOMER_ID                        │                │    │
│  │    │    ├─ SPROUT_API_TOKEN                   │                │    │
│  │    │    ├─ FOLDER_ID_SIMPLE                   │                │    │
│  │    │    ├─ FOLDER_ID_APRIL                    │                │    │
│  │    │    └─ GOOGLE_CREDENTIALS_JSON (encrypted)│                │    │
│  │    │                                          │                │    │
│  │    │ b) Authenticate                          │                │    │
│  │    │    ├─ Google Sheets & Drive              │                │    │
│  │    │    └─ Service Account JWT                │                │    │
│  │    │                                          │                │    │
│  │    │ c) Process Step 1                        │                │    │
│  │    │    ├─ Fetch groups from Sprout           │                │    │
│  │    │    ├─ Fetch profiles from Sprout         │                │    │
│  │    │    ├─ Fetch analytics from Sprout        │                │    │
│  │    │    ├─ Format by network type             │                │    │
│  │    │    └─ Update sheets in FOLDER_ID_SIMPLE  │                │    │
│  │    │                                          │                │    │
│  │    │ d) Wait 30 seconds                       │                │    │
│  │    │                                          │                │    │
│  │    │ e) Process Step 2                        │                │    │
│  │    │    ├─ Same as Step 1                     │                │    │
│  │    │    └─ But save to FOLDER_ID_APRIL        │                │    │
│  │    │                                          │                │    │
│  │    │ f) Return Response                       │                │    │
│  │    │    └─ Success/Failure + Summary          │                │    │
│  │    └──────────────────────────────────────────┘                │    │
│  │                                                                  │    │
│  │    ┌──────────────────────────────────────────┐                │    │
│  │    │ 4. Environment Variables (Encrypted)     │                │    │
│  │    │                                          │                │    │
│  │    │ CUSTOMER_ID=12345                        │                │    │
│  │    │ SPROUT_API_TOKEN=xxx-yyy-zzz             │                │    │
│  │    │ FOLDER_ID_SIMPLE=abc123                  │                │    │
│  │    │ FOLDER_ID_APRIL=def456                   │                │    │
│  │    │ GOOGLE_CREDENTIALS_JSON={...json...}     │                │    │
│  │    └──────────────────────────────────────────┘                │    │
│  │                                                                  │    │
│  │    ┌──────────────────────────────────────────┐                │    │
│  │    │ 5. Logs (stored for ~1 week)            │                │    │
│  │    │                                          │                │    │
│  │    │ [11:40 PM] Cron triggered                │                │    │
│  │    │ [11:40 PM] Starting authentication       │                │    │
│  │    │ [11:40 PM] ✓ Auth successful             │                │    │
│  │    │ [11:40 PM] Fetching data from Sprout     │                │    │
│  │    │ [11:41 PM] Updating 15 sheets            │                │    │
│  │    │ [11:42 PM] ✓ Complete                    │                │    │
│  │    └──────────────────────────────────────────┘                │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                            │
└────────┬──────────────────────┬──────────────────────┬────────────────────┘
         │                      │                      │
         │                      │                      │
      Calls:               Calls:                   Calls:
         │                 │                         │
         ↓                 ↓                         ↓
    ┌─────────────┐   ┌──────────────┐      ┌──────────────────┐
    │   Sprout    │   │   Google     │      │  Google Sheets   │
    │   Social    │   │   Sheets     │      │  (Your Data!)    │
    │   API       │   │   API        │      │                  │
    │             │   │              │      │  ┌────────────────┤
    │ Returns:    │   │ Returns:     │      │  │ Sheet: Instagram
    │ ├─Groups    │   │ ├─Auth token │      │  │ ├─ Post 1
    │ ├─Profiles  │   │ ├─Existing   │      │  │ ├─ Post 2
    │ └─Analytics │   │ │ spreadsheets      │  │ └─ ...
    │             │   │ └─Cell ranges       │  │                │
    │             │   │                    │  │ Sheet: Facebook │
    │             │   │                    │  │ ├─ Post 1      │
    │             │   │                    │  │ ├─ Post 2      │
    │             │   │                    │  │ └─ ...          │
    └─────────────┘   └──────────────┘      │  │                │
                                             │  │ Sheet: LinkedIn
                                             │  │ └─ ...
                                             │  └────────────────┤
                                             │
                                             │ (Stored in Google
                                             │  Drive folders)
                                             │
                                             └──────────────┘
```

---

## 📡 Request/Response Flow

### Request 1: Authenticate with Google
```
Vercel Server
  ├─ Read: GOOGLE_CREDENTIALS_JSON from env
  ├─ Parse JSON (client_email, private_key, etc.)
  └─ Create JWT token
      │
      └─ POST to https://oauth2.googleapis.com/token
          └─ Returns: access_token
```

### Request 2: Get Groups from Sprout
```
Vercel Server
  ├─ Read: CUSTOMER_ID, SPROUT_API_TOKEN
  └─ POST https://api.sproutsocial.com/v1/{CUSTOMER_ID}/groups
      ├─ Headers: Authorization: Bearer {SPROUT_API_TOKEN}
      └─ Response:
          {
            "data": [
              { "id": 1, "name": "Brand A", ... },
              { "id": 2, "name": "Brand B", ... },
              ...
            ]
          }
```

### Request 3: Get Profiles from Sprout
```
Vercel Server
  └─ POST https://api.sproutsocial.com/v1/{CUSTOMER_ID}/profiles
      └─ Response:
          {
            "data": [
              {
                "customer_profile_id": 123,
                "name": "@brand_instagram",
                "network_type": "fb_instagram_account",
                "group_id": 1,
                ...
              },
              ...
            ]
          }
```

### Request 4: Get Analytics from Sprout
```
Vercel Server
  └─ POST https://api.sproutsocial.com/v1/{CUSTOMER_ID}/analytics/profiles
      ├─ Body:
      │   {
      │     "filters": [
      │       "created_time.in(2025-03-15..2025-03-16)",
      │       "customer_profile_id.eq(123, 456, 789, ...)"
      │     ],
      │     "metrics": [
      │       "impressions", "likes", "comments", "video_views", ...
      │     ],
      │     "dimensions": ["customer_profile_id", "reporting_period"]
      │   }
      │
      └─ Response:
          {
            "data": [
              {
                "dimensions": {
                  "customer_profile_id": 123,
                  "reporting_period": "2025-03-15"
                },
                "metrics": {
                  "impressions": 5000,
                  "likes": 250,
                  "comments": 45,
                  "video_views": 120,
                  ...
                }
              },
              ...
            ]
          }
```

### Request 5: Update Google Sheets
```
Vercel Server
  ├─ Use access_token from step 1
  ├─ Find spreadsheet ID (stored in FOLDER_ID_SIMPLE)
  ├─ Format data into rows
  └─ PUT https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}/values/Instagram!A:Z
      ├─ Body:
      │   {
      │     "majorDimension": "ROWS",
      │     "values": [
      │       ["Date", "Post Text", "Impressions", "Likes", "Comments", ...],
      │       ["2025-03-15", "Check out our...", "5000", "250", "45", ...],
      │       ["2025-03-14", "New product...", "3200", "180", "32", ...],
      │       ...
      │     ]
      │   }
      │
      └─ Response: { "updatedCells": 120, "updatedColumns": 12, ... }
```

---

## 🔐 Authentication Flow

### Google Service Account (JWT)
```
1. Your code has credentials:
   {
     "type": "service_account",
     "project_id": "my-project",
     "private_key": "-----BEGIN PRIVATE KEY-----\n...",
     "client_email": "service-account@my-project.iam.gserviceaccount.com"
   }

2. Create JWT token (signed with private_key)
   └─ Claim: aud = "https://oauth2.googleapis.com/token"
   └─ Claim: scope = ["sheets", "drive"]
   └─ Claim: sub = client_email

3. Send JWT to Google
   └─ POST https://oauth2.googleapis.com/token
   └─ Body: { grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: JWT }

4. Google returns: access_token
   └─ Valid for ~1 hour
   └─ Used in all subsequent Google API calls

5. Use access_token
   └─ Header: Authorization: Bearer {access_token}
   └─ Make requests to Google Sheets & Drive APIs
```

### Sprout API (Bearer Token)
```
1. You have SPROUT_API_TOKEN (provided by Sprout admin)

2. Use directly in headers:
   └─ Authorization: Bearer {SPROUT_API_TOKEN}

3. Valid until manually revoked

4. If expired:
   └─ Update SPROUT_API_TOKEN in Vercel env vars
   └─ No code changes needed!
```

---

## 💾 Data Processing Pipeline

```
Step 1: Fetch Groups
   Input: CUSTOMER_ID, SPROUT_API_TOKEN
   ├─ GET groups list
   ├─ Each group has: id, name, description
   └─ Output: [{ id: 1, name: "Brand A" }, ...]

Step 2: Fetch Profiles
   Input: CUSTOMER_ID, SPROUT_API_TOKEN
   ├─ GET profiles list (all profiles across all groups)
   ├─ Each profile has: customer_profile_id, network_type, group_id, name
   └─ Output: [{ customer_profile_id: 123, network_type: "fb_instagram_account" }, ...]

Step 3: Organize by Group
   Input: profiles list + groups list
   ├─ Create mapping: { groupId: { groupName, profiles: [...] } }
   ├─ For each group:
   │  └─ Collect all profiles belonging to it
   └─ Output: { "1": { groupName: "Brand A", profiles: [...] }, ... }

Step 4: Fetch Analytics
   Input: customer_profile_ids, date range
   ├─ POST to /analytics/profiles
   ├─ Filters: customer_profile_id.eq(123, 456, ...) + date range
   ├─ Request metrics: impressions, likes, comments, shares, video_views, etc.
   └─ Output: [{ dimensions: {...}, metrics: {...} }, ...]

Step 5: Group by Network Type
   Input: profiles list + analytics data
   ├─ For each profile:
   │  ├─ Look up network_type (instagram, facebook, linkedin, youtube, twitter)
   │  ├─ Find matching analytics data
   │  └─ Create row: [date, text, impressions, likes, ...]
   ├─ Group rows by network_type
   └─ Output: { instagram: [...rows...], facebook: [...rows...], ... }

Step 6: Create Sheets
   Input: spreadsheet_id, network types
   ├─ GET existing sheets
   ├─ For each network type:
   │  └─ If sheet doesn't exist, CREATE new sheet
   │  └─ Set up headers: ["Date", "Post", "Impressions", "Likes", ...]
   └─ Output: All sheets ready for data

Step 7: Update Sheets
   Input: spreadsheet_id, sheet_name, rows
   ├─ PUT request to Google Sheets API
   ├─ Range: Sheet1!A:Z
   ├─ Values: header row + data rows
   ├─ Overwrite existing data
   └─ Output: ✓ Cells updated

Step 8: Wait 30 seconds
   └─ Intentional delay between SIMPLE and APRIL folder updates

Step 9: Repeat Steps 1-7 for FOLDER_ID_APRIL
   └─ Save to different folder destination
```

---

## 🗂️ Folder Structure in Google Drive

```
Your Google Drive
│
├─ FOLDER_ID_SIMPLE (e.g., "Daily Analytics")
│  ├─ Brand A
│  │  ├─ Columns: Date, Post, Network, Impressions, Likes, Comments, ...
│  │  ├─ Sheet: Instagram
│  │  ├─ Sheet: Facebook
│  │  ├─ Sheet: LinkedIn
│  │  ├─ Sheet: YouTube
│  │  └─ Sheet: Twitter
│  │
│  ├─ Brand B
│  │  ├─ Sheet: Instagram
│  │  ├─ Sheet: Facebook
│  │  └─ Sheet: LinkedIn
│  │
│  └─ ...
│
└─ FOLDER_ID_APRIL (e.g., "April 2025 Analytics")
   ├─ Brand A
   │  ├─ Sheet: Instagram (April data only)
   │  ├─ Sheet: Facebook (April data only)
   │  └─ ...
   │
   ├─ Brand B
   │  ├─ Sheet: Instagram (April data only)
   │  └─ ...
   │
   └─ ...
```

---

## 📊 Sample Data Transformation

### Input (from Sprout API)
```json
{
  "dimensions": {
    "customer_profile_id": 123,
    "reporting_period": "2025-03-15"
  },
  "metrics": {
    "impressions": 5000,
    "likes": 250,
    "comments": 45,
    "shares_count": 12,
    "video_views": 120
  }
}
```

### Processing (in your code)
```javascript
// Find profile with customer_profile_id = 123
const profile = profiles.find(p => p.customer_profile_id === 123);
// Result: { customer_profile_id: 123, name: "@brand_instagram", network_type: "fb_instagram_account", ... }

// Get network type
const networkType = "instagram"; // from profile.network_type mapping

// Get post content from post_analytics endpoint (separate API call)
const post = { text: "Check out our new product!", perma_link: "instagram.com/p/123..." };

// Format into spreadsheet row
const row = [
  "2025-03-15",        // Date
  "Check out our...",  // Post text (truncated)
  "instagram",         // Network
  "5000",              // Impressions
  "250",               // Likes
  "45",                // Comments
  "12",                // Shares
  "120",               // Video views
  "@brand_instagram"   // Profile name
];
```

### Output (in Google Sheets)
```
Date        | Post Text      | Network   | Impressions | Likes | Comments | Shares | Video Views | Profile
2025-03-15  | Check our..    | instagram | 5000        | 250   | 45       | 12     | 120         | @brand_instagram
2025-03-14  | New product    | instagram | 3200        | 180   | 32       | 8      | 95          | @brand_instagram
```

---

## ⏱️ Execution Timeline

```
11:40:00.000 PM IST
  └─ Vercel cron scheduler fires HTTP request

11:40:00.100 PM IST
  └─ Node.js process starts (api/cron.js)

11:40:00.500 PM IST
  └─ Environment variables loaded

11:40:01.000 PM IST
  └─ Google authentication complete
  │  └─ JWT created and sent
  │  └─ access_token received

11:40:02.000 PM IST
  └─ Sprout API calls (groups, profiles, analytics)
  │  └─ Request 1: GET groups (response time: ~500ms)
  │  └─ Request 2: GET profiles (response time: ~800ms)
  │  └─ Request 3: GET analytics (response time: ~2000ms - data heavy)

11:40:05.000 PM IST
  └─ Data processing begins
  │  └─ Organize by group: ~100ms
  │  └─ Separate by network type: ~50ms
  │  └─ Format into rows: ~200ms

11:40:06.000 PM IST
  └─ Create/Find spreadsheets
  │  └─ Check existing sheets: ~100ms per group

11:40:10.000 PM IST
  └─ Update FOLDER_ID_SIMPLE sheets
  │  └─ 15 API calls to Google Sheets (1 per sheet)
  │  └─ Total time: ~5000ms

11:40:40.000 PM IST
  └─ STEP 1 COMPLETE

11:40:45.000 PM IST
  └─ Wait 30 seconds (intentional delay)

11:41:15.000 PM IST
  └─ Update FOLDER_ID_APRIL sheets (same process as step 1)
  │  └─ Total time: ~5000ms

11:41:45.000 PM IST
  └─ All processing complete
  │  └─ Return HTTP 200 response to Vercel

11:41:46.000 PM IST
  └─ Process terminates
  └─ Vercel logs execution details
```

**Total Duration:** ~1 minute 46 seconds (from trigger to completion)

---

## 🔄 Continuous Improvement Loop

```
You want to change how data is formatted
  │
  ├─ Edit: platforms/instagram.js
  ├─ Test locally: node platforms/instagram.js
  │
  ├─ Commit: git commit -m "Change Instagram metric formatting"
  ├─ Push: git push
  │
  ├─ Vercel webhook triggers
  ├─ Vercel downloads latest code
  ├─ Vercel builds (npm install + prepare)
  ├─ Vercel deploys to production
  │
  ├─ Next cron run (tomorrow 11:40 PM)
  ├─ Cron runs new code automatically
  ├─ Google Sheets get updated with new format
  │
  └─ ✓ Zero downtime, automatic deployment!
```

---

**Note:** This is a serverless, event-driven architecture. No servers to maintain, no processes to keep running, completely automated daily execution! 🚀


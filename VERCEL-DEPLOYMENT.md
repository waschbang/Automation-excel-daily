# Vercel Deployment Guide for Sprout Analytics

This guide will help you deploy your Sprout Analytics scripts to Vercel with automatic daily cron jobs at 11:40 PM IST.

## What You Get with Vercel

✅ **Free hosting** with generous limits  
✅ **Automatic daily execution** at 11:40 PM IST  
✅ **Sequential script execution** (simple-analytics.js → sprout_april.js)  
✅ **Built-in logging** and monitoring  
✅ **No server management** required  
✅ **Global CDN** for fast execution  

## Prerequisites

1. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)
2. **GitHub Account**: Your code should be in a GitHub repository
3. **Google Service Account**: For Google Sheets API access
4. **Sprout Social API Token**: Your existing API credentials

## Step 1: Prepare Your Repository

Make sure your repository has these files:
- ✅ `api/cron.js` - The main cron job endpoint
- ✅ `vercel.json` - Vercel configuration
- ✅ `package.json` - Dependencies
- ✅ All utility files and platform modules

## Step 2: Deploy to Vercel

### Option A: Deploy via GitHub (Recommended)

1. **Connect GitHub to Vercel**:
   - Go to [vercel.com/new](https://vercel.com/new)
   - Click "Import Git Repository"
   - Select your GitHub repository
   - Click "Deploy"

2. **Configure Build Settings**:
   - **Framework Preset**: Other
   - **Root Directory**: `./` (leave as default)
   - **Build Command**: Leave empty
   - **Output Directory**: Leave empty

3. **Click "Deploy"**

### Option B: Deploy via Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy
vercel

# Follow the prompts
```

## Step 3: Set Environment Variables

After deployment, go to your Vercel dashboard:

1. **Select your project**
2. **Go to Settings → Environment Variables**
3. **Add these variables**:

```
CUSTOMER_ID=2653573
SPROUT_API_TOKEN=MjY1MzU3M3wxNzUyMjE2ODQ5fDdmNzgxNzQyLWI3NWEtNDFkYS1hN2Y4LWRkMTE3ODRhNzBlNg==
FOLDER_ID_SIMPLE=1O0In92io6PksS-VEdr1lyD-VfVC6mVV3
FOLDER_ID_APRIL=13XPLx5l1LuPeJL2Ue03ZztNQUsNgNW06
GOOGLE_CREDENTIALS_JSON={"your":"google_credentials_json_here"}
```

### Google Credentials Setup

1. **Get your service account JSON**:
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Navigate to APIs & Services → Credentials
   - Find your service account
   - Download the JSON key file

2. **Copy the entire JSON content** and paste it as the `GOOGLE_CREDENTIALS_JSON` value

3. **Redeploy** after adding environment variables

## Step 4: Verify Cron Job Setup

Your `vercel.json` should look like this:

```json
{
  "version": 2,
  "builds": [
    {
      "src": "api/cron.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/cron",
      "dest": "/api/cron.js"
    }
  ],
  "crons": [
    {
      "path": "/cron",
      "schedule": "40 23 * * *"
    }
  ]
}
```

**Cron Schedule**: `40 23 * * *` = 11:40 PM daily in UTC
- **IST Time**: 11:40 PM IST
- **UTC Time**: 6:10 PM UTC (IST is UTC+5:30)

## Step 5: Test Your Deployment

### Manual Test
Visit your deployed URL + `/cron` to test manually:
```
https://your-project.vercel.app/cron
```

### Check Logs
1. Go to your Vercel dashboard
2. Click on your project
3. Go to "Functions" tab
4. Click on the cron function
5. View execution logs

## How It Works

1. **Daily at 11:40 PM IST**, Vercel triggers your cron job
2. **First script runs**: `simple-analytics.js` logic (updates folder 1)
3. **30-second delay**: Prevents API rate limiting
4. **Second script runs**: `sprout_april.js` logic (updates folder 2)
5. **Results logged**: All execution details are captured

## Monitoring & Troubleshooting

### Check Execution Status
- **Vercel Dashboard** → Functions → cron function
- **Function logs** show execution details
- **Response codes** indicate success/failure

### Common Issues

1. **Environment Variables Missing**:
   - Error: "Cannot read property of undefined"
   - Solution: Add missing environment variables

2. **Google Authentication Failed**:
   - Error: "Invalid private key"
   - Solution: Check `GOOGLE_CREDENTIALS_JSON` format

3. **API Rate Limits**:
   - Error: "429 Too Many Requests"
   - Solution: Script already handles this with delays

### Performance Monitoring
- **Execution time**: Usually 2-5 minutes
- **Memory usage**: Vercel provides 1024MB
- **Timeout**: 10 seconds (should be sufficient)

## Cost & Limits

### Free Tier Includes:
- **100 GB-Hours** of serverless function execution
- **1000 invocations** per day
- **Cron jobs**: Available on free tier
- **Bandwidth**: 100 GB/month

### Your Usage:
- **Daily execution**: 1 cron job per day
- **Execution time**: ~2-5 minutes
- **Cost**: $0 (well within free limits)

## Updates & Maintenance

### Deploy Updates
```bash
# Push to GitHub
git push origin main

# Vercel automatically redeploys
```

### Environment Variable Changes
1. Update in Vercel dashboard
2. Redeploy (automatic or manual)

### Monitor Performance
- Check Vercel analytics
- Review function logs
- Monitor execution times

## Support

- **Vercel Docs**: [vercel.com/docs](https://vercel.com/docs)
- **Cron Jobs**: [vercel.com/docs/cron-jobs](https://vercel.com/docs/cron-jobs)
- **Environment Variables**: [vercel.com/docs/environment-variables](https://vercel.com/docs/environment-variables)

## Success Checklist

- [ ] Repository deployed to Vercel
- [ ] Environment variables set
- [ ] Cron job configured (`40 23 * * *`)
- [ ] Manual test successful
- [ ] First automatic execution completed
- [ ] Both scripts running sequentially
- [ ] Google Sheets being updated daily

Your analytics will now run automatically every day at 11:40 PM IST on Vercel's reliable infrastructure! 🚀

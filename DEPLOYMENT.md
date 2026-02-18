# Heroku Deployment Guide

This guide walks you through deploying the Twilio scraper to Heroku with **zero monthly costs** using Heroku Scheduler.

## Prerequisites

- Heroku CLI installed: `brew install heroku` (or download from https://devcenter.heroku.com/articles/heroku-cli)
- Heroku account (free tier)
- GitHub repo created and pushed

## Step-by-Step Deployment

### 1. Login to Heroku

```bash
heroku login
```

### 2. Create Heroku App

```bash
heroku create twilio-alphanumeric-scraper
# Or use: heroku create (for auto-generated name)
```

### 3. Add Puppeteer Buildpack (Required for headless Chrome)

```bash
heroku buildpacks:add jontewks/puppeteer
heroku buildpacks:add heroku/nodejs
```

Verify buildpacks are in correct order:
```bash
heroku buildpacks
```

Should show:
1. `jontewks/puppeteer`
2. `heroku/nodejs`

### 4. Set Environment Variables

```bash
heroku config:set AIRTABLE_API_KEY=your_api_key_here
heroku config:set AIRTABLE_BASE_ID=your_base_id_here
heroku config:set AIRTABLE_TABLE_NAME="Alphanumeric Sender ID Docs"
```

Verify:
```bash
heroku config
```

### 5. Deploy to Heroku

```bash
git push heroku main
```

If you're on `master` branch:
```bash
git push heroku master:main
```

### 6. Ensure No Web Dynos Running (Zero Cost)

```bash
heroku ps:scale web=0
```

This ensures no dynos are running continuously, which would incur costs.

### 7. Install Heroku Scheduler (Free Add-on)

```bash
heroku addons:create scheduler:standard
```

### 8. Configure Scheduler

Open the scheduler dashboard:
```bash
heroku addons:open scheduler
```

In the web interface:
1. Click **"Create job"**
2. **Schedule**: Choose your frequency (Daily at 9:00 AM UTC recommended)
3. **Command**: Enter exactly:
   ```
   node scraper.js
   ```
4. Click **"Save Job"**

**Recommended Schedule Options:**
- **Daily at 9:00 AM UTC** - Checks for new countries once per day
- **Daily at 1:00 AM UTC** - Runs during off-peak hours
- **Every 10 minutes** - Only if you need real-time updates (not recommended, uses more dyno hours)

### 9. Verify Setup

Check that no dynos are running:
```bash
heroku ps
```

Should show: `No dynos on ⬢ your-app-name`

Check scheduler is installed:
```bash
heroku addons
```

Should show `scheduler (scheduler:standard)`

### 10. Test the Scraper Manually

```bash
heroku run node scraper.js
```

This will run the scraper once to verify everything works.

## Cost Breakdown

✅ **Total Monthly Cost: $0**

- **Web Dyno**: 0 hours/month (scaled to 0)
- **Heroku Scheduler**: Free add-on
- **Dyno Usage**: ~1 minute per scheduled run
  - Daily runs: ~30 minutes/month
  - Well within free tier: 550 free dyno hours/month

## Monitoring

### View Logs
```bash
heroku logs --tail
```

### View Recent Scheduler Runs
```bash
heroku logs --tail --dyno=scheduler
```

### Check Scheduler Job History
```bash
heroku addons:open scheduler
```

## Updating the App

When you make changes to the code:

```bash
git add -A
git commit -m "Update scraper logic"
git push heroku main
```

The scheduler will automatically use the new code on the next run.

## Troubleshooting

### Puppeteer Fails on Heroku

Make sure buildpacks are installed in correct order:
```bash
heroku buildpacks
```

Should be:
1. `jontewks/puppeteer`
2. `heroku/nodejs`

### Environment Variables Not Set

```bash
heroku config
```

Verify all three variables are set:
- `AIRTABLE_API_KEY`
- `AIRTABLE_BASE_ID`
- `AIRTABLE_TABLE_NAME`

### Scheduler Not Running

Check logs:
```bash
heroku logs --tail --dyno=scheduler
```

Open scheduler dashboard to verify job is active:
```bash
heroku addons:open scheduler
```

### App Running Out of Memory

Increase dyno memory (still free tier):
```bash
heroku ps:resize scheduler=standard-1x
```

## Deleting the App

If you want to remove everything:

```bash
heroku addons:destroy scheduler
heroku apps:destroy --app your-app-name --confirm your-app-name
```

## Additional Configuration

### Change Scheduler Frequency

```bash
heroku addons:open scheduler
```

Click the job, change schedule, and save.

### Add Email Notifications on Failure

Heroku doesn't support built-in email notifications for scheduled jobs, but you can:
1. Use Heroku Logplex Drains to send logs to external services
2. Add error handling in `scraper.js` to send emails via SendGrid
3. Use monitoring services like Sentry or Rollbar

### Upgrade to More Frequent Runs

Standard scheduler allows minimum 10-minute intervals. For more frequent runs:
1. Use Heroku Advanced Scheduler (paid)
2. Or use an external cron service like cron-job.org pointing to a webhook

# Twilio Alphanumeric Sender ID Documentation Scraper

Scrapes Twilio help articles about "Documents Required and Instructions to Register Your Alphanumeric Sender ID" for various countries and saves them to Airtable.

## Features

- Scrapes https://help.twilio.com/sections/205104768-SMS for relevant articles (124+ articles)
- Handles JavaScript-based pagination to capture all pages
- Filters articles matching the pattern: "Documents Required and Instructions to Register Your Alphanumeric Sender ID in [Country]"
- Extracts country name and article link
- Saves to Airtable with automatic updates (creates new or updates existing records)
- Runs on Heroku with scheduled execution

## Prerequisites

- Node.js 18.x or higher
- Airtable account with API access
- Heroku account (for deployment)

## Local Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file based on `.env.example`:
```bash
cp .env.example .env
```

3. Configure your environment variables in `.env`:
   - `AIRTABLE_API_KEY`: Your Airtable API key (from https://airtable.com/account)
   - `AIRTABLE_BASE_ID`: Your Airtable base ID (from the URL: airtable.com/BASE_ID/...)
   - `AIRTABLE_TABLE_NAME`: Name of your table (default: "Alphanumeric Sender ID Docs")

4. Set up your Airtable table with these columns:
   - **Country** (Single line text)
   - **Link** (URL)

5. Run the scraper:
```bash
npm start
```

## Heroku Deployment

1. Create a new Heroku app:
```bash
heroku create your-app-name
```

2. Add the Puppeteer buildpack (required for headless Chrome):
```bash
heroku buildpacks:add jontewks/puppeteer
heroku buildpacks:add heroku/nodejs
```

3. Set environment variables:
```bash
heroku config:set AIRTABLE_API_KEY=your_api_key
heroku config:set AIRTABLE_BASE_ID=your_base_id
heroku config:set AIRTABLE_TABLE_NAME="Alphanumeric Sender ID Docs"
```

4. Deploy:
```bash
git init
git add .
git commit -m "Initial commit"
git push heroku main
```

5. Set up Heroku Scheduler:
```bash
heroku addons:create scheduler:standard
heroku addons:open scheduler
```

In the Heroku Scheduler dashboard, add a new job:
- Command: `node scraper.js`
- Frequency: Daily (or your preferred schedule)

## How It Works

1. Launches a headless Chrome browser using Puppeteer
2. Navigates to the Twilio SMS help section
3. Pages through all results (handles JavaScript-based pagination)
4. Extracts all article links matching the naming pattern
5. For each matching article:
   - Extracts the country name from the title
   - Saves country and link to Airtable (updates if already exists)

## Airtable Schema

Your Airtable table should have these fields:

| Field Name | Field Type | Description |
|------------|------------|-------------|
| Country | Single line text | Country name extracted from article title |
| Link | URL | Direct link to the Twilio help article |

## Troubleshooting

### Puppeteer fails on Heroku
Make sure you have the Puppeteer buildpack installed:
```bash
heroku buildpacks
```

Should show both buildpacks in order:
1. `jontewks/puppeteer`
2. `heroku/nodejs`

### Airtable API errors
- Verify your API key is correct
- Check that the base ID matches your Airtable base
- Ensure the table name matches exactly (case-sensitive)

### Articles not being found
The script waits for elements with `href*="/articles/"`. If Twilio changes their page structure, you may need to update the selectors in the `getArticleLinks()` function.

## License

ISC

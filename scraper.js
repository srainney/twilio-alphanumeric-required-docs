require('dotenv').config();
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');
const Airtable = require('airtable');

// Configuration
const TWILIO_SECTIONS = [
  {
    name: 'Alphanumeric Sender ID',
    tableName: 'Alphanumeric Guidelines',
    url: 'https://help.twilio.com/sections/205104768-SMS',
    pattern: /Documents Required and Instructions to Register Your Alphanumeric Sender ID in/i,
    countryExtractor: (title) => {
      // "Documents Required and Instructions to Register Your Alphanumeric Sender ID in Thailand"
      const match = title.match(/in\s+([A-Za-z\s]+)$/i);
      return match ? match[1].trim() : null;
    }
  },
  {
    name: 'Short Code',
    tableName: 'Short Code Best Practices',
    url: 'https://help.twilio.com/sections/205112927-Short-Codes',
    pattern: /(.+?)\s+Short Code Best Practices$/i,
    countryExtractor: (title) => {
      // "Argentina Short Code Best Practices"
      const match = title.match(/^(.+?)\s+Short Code Best Practices$/i);
      return match ? match[1].trim() : null;
    }
  }
];

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

// Initialize Airtable
const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);

/**
 * Extract country name, type, and table name from article title
 * Returns { country, type, tableName } or null if no match
 */
function parseArticleTitle(title) {
  for (const section of TWILIO_SECTIONS) {
    if (section.pattern.test(title)) {
      const country = section.countryExtractor(title);
      if (country) {
        return {
          country,
          type: section.name,
          tableName: section.tableName
        };
      }
    }
  }
  return null;
}

/**
 * Scrape the main section page to get article links (handles JavaScript pagination)
 */
async function getArticleLinks(page, sectionUrl, sectionName) {
  console.log(`\nLoading ${sectionName} section: ${sectionUrl}`);
  await page.goto(sectionUrl, { waitUntil: 'networkidle2', timeout: 30000 });

  // Wait for articles to load
  await page.waitForSelector('a[href*="/articles/"]', { timeout: 10000 });

  let allArticles = [];
  let currentPage = 1;
  let hasMorePages = true;

  while (hasMorePages) {
    console.log(`Scraping page ${currentPage}...`);

    // Wait a bit for page to fully render
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Extract articles from current page
    const articles = await page.evaluate(() => {
      const articleElements = document.querySelectorAll('a[href*="/articles/"]');
      const results = [];

      articleElements.forEach(element => {
        const href = element.href;
        const title = element.textContent.trim();

        if (title && href && !results.some(a => a.url === href)) {
          results.push({ title, url: href });
        }
      });

      return results;
    });

    // Add new articles (avoiding duplicates)
    let newArticlesCount = 0;
    articles.forEach(article => {
      if (!allArticles.some(a => a.url === article.url)) {
        allArticles.push(article);
        newArticlesCount++;
      }
    });

    console.log(`Found ${articles.length} articles on page ${currentPage} (${newArticlesCount} new)`);

    // If no new articles were found, we've reached the end
    if (newArticlesCount === 0 && currentPage > 1) {
      console.log('No new articles found, stopping pagination');
      hasMorePages = false;
      break;
    }

    // Look for next page button
    const hasNextPage = await page.evaluate(() => {
      // Look for "Go to next page" button
      const buttons = document.querySelectorAll('button');
      for (const button of buttons) {
        const text = button.textContent.trim().toLowerCase();
        const isDisabled = button.disabled ||
                         button.classList.contains('disabled') ||
                         button.getAttribute('aria-disabled') === 'true';

        if (text.includes('go to next page') && !isDisabled) {
          return true;
        }
      }
      return false;
    });

    if (hasNextPage) {
      try {
        // Click "Go to next page" button
        const clicked = await page.evaluate(() => {
          const buttons = document.querySelectorAll('button');
          for (const button of buttons) {
            const text = button.textContent.trim().toLowerCase();
            const isDisabled = button.disabled ||
                             button.classList.contains('disabled') ||
                             button.getAttribute('aria-disabled') === 'true';

            if (text.includes('go to next page') && !isDisabled) {
              button.click();
              return true;
            }
          }
          return false;
        });

        if (!clicked) {
          console.log('Could not click next page button');
          hasMorePages = false;
          continue;
        }

        // Wait for page to update - give it more time
        await new Promise(resolve => setTimeout(resolve, 3000));

        currentPage++;

      } catch (error) {
        console.log(`Error navigating to next page: ${error.message}`);
        hasMorePages = false;
      }
    } else {
      console.log('No more pages found');
      hasMorePages = false;
    }

    // Safety limit to prevent infinite loops
    if (currentPage > 20) {
      console.log('Reached maximum page limit');
      hasMorePages = false;
    }
  }

  console.log(`Found ${allArticles.length} total articles across ${currentPage} page(s)`);
  return allArticles;
}


/**
 * Check if article already exists in Airtable and return the record if found
 */
async function getExistingRecord(countryName, tableName) {
  try {
    const records = await base(tableName)
      .select({
        filterByFormula: `{Country} = '${countryName}'`,
        maxRecords: 1
      })
      .firstPage();

    return records.length > 0 ? records[0] : null;
  } catch (error) {
    console.error(`Error checking if article exists for ${countryName} in ${tableName}:`, error.message);
    return null;
  }
}

/**
 * Save or update article in Airtable
 */
async function saveToAirtable(countryName, tableName, type, articleUrl) {
  try {
    // Check if record already exists
    const existingRecord = await getExistingRecord(countryName, tableName);

    if (existingRecord) {
      // Update existing record
      await base(tableName).update([
        {
          id: existingRecord.id,
          fields: {
            Country: countryName,
            Link: articleUrl
          }
        }
      ]);
      console.log(`✓ Updated: ${countryName} (${type})`);
    } else {
      // Create new record
      await base(tableName).create([
        {
          fields: {
            Country: countryName,
            Link: articleUrl
          }
        }
      ]);
      console.log(`✓ Created: ${countryName} (${type})`);
    }
  } catch (error) {
    console.error(`Error saving to Airtable for ${countryName} (${type}):`, error.message);
    throw error;
  }
}

/**
 * Main scraping function
 */
async function main() {
  let browser;

  try {
    console.log('Starting scraper...');

    // Launch browser with Heroku-compatible settings using @sparticuz/chromium
    const isProduction = process.env.NODE_ENV === 'production' || !!process.env.DYNO;

    const launchOptions = {
      args: isProduction ? chromium.args : [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ],
      defaultViewport: chromium.defaultViewport,
      executablePath: isProduction
        ? await chromium.executablePath()
        : process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      headless: chromium.headless
    };

    console.log('Launching browser...');
    if (isProduction) {
      console.log('Using @sparticuz/chromium for Heroku');
    }

    browser = await puppeteer.launch(launchOptions);

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    let totalProcessed = 0;
    let totalCreated = 0;
    let totalUpdated = 0;

    // Loop through each section (Alphanumeric and Short Code)
    for (const section of TWILIO_SECTIONS) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Processing ${section.name} articles`);
      console.log('='.repeat(60));

      // Get all article links from this section
      const articles = await getArticleLinks(page, section.url, section.name);

      // Filter and parse articles matching the pattern
      const matchingArticles = [];
      for (const article of articles) {
        const parsed = parseArticleTitle(article.title);
        if (parsed && parsed.type === section.name) {
          matchingArticles.push({
            ...article,
            country: parsed.country,
            type: parsed.type,
            tableName: parsed.tableName
          });
        }
      }

      console.log(`\nFound ${matchingArticles.length} ${section.name} articles matching the pattern\n`);

      // Process each matching article
      for (const article of matchingArticles) {
        try {
          await saveToAirtable(article.country, article.tableName, article.type, article.url);
          totalProcessed++;
        } catch (error) {
          console.error(`Error processing ${article.country} (${article.type}):`, error.message);
        }
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('Scraping completed successfully!');
    console.log(`Total articles processed: ${totalProcessed}`);
    console.log('='.repeat(60));
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Run the scraper
main();

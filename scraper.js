require('dotenv').config();
const puppeteer = require('puppeteer');
const Airtable = require('airtable');

// Configuration
const TWILIO_SECTION_URL = 'https://help.twilio.com/sections/205104768-SMS';
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME || 'Alphanumeric Sender ID Docs';

// Initialize Airtable
const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);

/**
 * Extract country name from article title
 * Example: "Documents Required and Instructions to Register Your Alphanumeric Sender ID in Thailand" -> "Thailand"
 */
function extractCountryFromTitle(title) {
  const match = title.match(/in\s+([A-Za-z\s]+)$/i);
  return match ? match[1].trim() : null;
}

/**
 * Check if article title matches the required pattern
 */
function matchesPattern(title) {
  const pattern = /Documents Required and Instructions to Register Your Alphanumeric Sender ID in/i;
  return pattern.test(title);
}

/**
 * Scrape the main section page to get article links (handles JavaScript pagination)
 */
async function getArticleLinks(page) {
  console.log('Loading main section page...');
  await page.goto(TWILIO_SECTION_URL, { waitUntil: 'networkidle2', timeout: 30000 });

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
async function getExistingRecord(countryName) {
  try {
    const records = await base(AIRTABLE_TABLE_NAME)
      .select({
        filterByFormula: `{Country} = '${countryName}'`,
        maxRecords: 1
      })
      .firstPage();

    return records.length > 0 ? records[0] : null;
  } catch (error) {
    console.error(`Error checking if article exists for ${countryName}:`, error.message);
    return null;
  }
}

/**
 * Save or update article in Airtable
 */
async function saveToAirtable(countryName, articleUrl) {
  try {
    // Check if record already exists
    const existingRecord = await getExistingRecord(countryName);

    if (existingRecord) {
      // Update existing record
      await base(AIRTABLE_TABLE_NAME).update([
        {
          id: existingRecord.id,
          fields: {
            Country: countryName,
            Link: articleUrl
          }
        }
      ]);
      console.log(`✓ Updated: ${countryName} - ${articleUrl}`);
    } else {
      // Create new record
      await base(AIRTABLE_TABLE_NAME).create([
        {
          fields: {
            Country: countryName,
            Link: articleUrl
          }
        }
      ]);
      console.log(`✓ Created: ${countryName} - ${articleUrl}`);
    }
  } catch (error) {
    console.error(`Error saving to Airtable for ${countryName}:`, error.message);
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

    // Launch browser with Heroku-compatible settings
    const launchOptions = {
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-accelerated-2d-canvas',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-breakpad',
        '--disable-client-side-phishing-detection',
        '--disable-component-update',
        '--disable-default-apps',
        '--disable-extensions',
        '--disable-features=AudioServiceOutOfProcess',
        '--disable-hang-monitor',
        '--disable-ipc-flooding-protection',
        '--disable-popup-blocking',
        '--disable-prompt-on-repost',
        '--disable-renderer-backgrounding',
        '--disable-sync',
        '--disable-translate',
        '--metrics-recording-only',
        '--no-first-run',
        '--no-default-browser-check',
        '--mute-audio',
        '--hide-scrollbars'
      ]
    };

    // Use Chrome installed by Heroku buildpack
    // The jontewks/puppeteer buildpack sets CHROME_BIN environment variable
    if (process.env.CHROME_BIN) {
      console.log('Using Chrome from buildpack:', process.env.CHROME_BIN);
      launchOptions.executablePath = process.env.CHROME_BIN;
    }

    browser = await puppeteer.launch(launchOptions);

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    // Get all article links from the section page
    const articles = await getArticleLinks(page);

    // Filter articles matching the pattern
    const matchingArticles = articles.filter(article => matchesPattern(article.title));
    console.log(`Found ${matchingArticles.length} articles matching the pattern`);

    // Process each matching article
    for (const article of matchingArticles) {
      const countryName = extractCountryFromTitle(article.title);

      if (!countryName) {
        console.log(`Could not extract country from: ${article.title}`);
        continue;
      }

      try {
        await saveToAirtable(countryName, article.url);
      } catch (error) {
        console.error(`Error processing ${countryName}:`, error.message);
      }
    }

    console.log('Scraping completed successfully!');
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

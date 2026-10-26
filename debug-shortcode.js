require('dotenv').config();
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

const SHORTCODE_URL = 'https://help.twilio.com/sections/205112927-Short-Codes';

async function debugShortCodes() {
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

  const browser = await puppeteer.launch(launchOptions);
  const page = await browser.newPage();

  console.log('Loading Short Code section...');
  await page.goto(SHORTCODE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForSelector('a[href*="/articles/"]', { timeout: 10000 });

  let allArticles = [];
  let currentPage = 1;
  let hasMorePages = true;

  while (hasMorePages && currentPage <= 5) {
    await new Promise(resolve => setTimeout(resolve, 2000));

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

    let newCount = 0;
    articles.forEach(article => {
      if (!allArticles.some(a => a.url === article.url)) {
        allArticles.push(article);
        newCount++;
      }
    });

    console.log(`Page ${currentPage}: Found ${articles.length} articles (${newCount} new)`);

    if (newCount === 0 && currentPage > 1) {
      hasMorePages = false;
      break;
    }

    const hasNext = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      for (const button of buttons) {
        const text = button.textContent.trim().toLowerCase();
        if (text.includes('go to next page') && !button.disabled) {
          return true;
        }
      }
      return false;
    });

    if (hasNext) {
      await page.evaluate(() => {
        const buttons = document.querySelectorAll('button');
        for (const button of buttons) {
          const text = button.textContent.trim().toLowerCase();
          if (text.includes('go to next page') && !button.disabled) {
            button.click();
            return;
          }
        }
      });
      await new Promise(resolve => setTimeout(resolve, 3000));
      currentPage++;
    } else {
      hasMorePages = false;
    }
  }

  console.log('\n=== ALL SHORT CODE ARTICLES ===\n');

  const pattern = /Short Code/i;
  const matchingArticles = allArticles.filter(a => pattern.test(a.title));

  console.log(`Total articles: ${allArticles.length}`);
  console.log(`Articles with "Short Code" in title: ${matchingArticles.length}\n`);

  matchingArticles.forEach((article, index) => {
    console.log(`${index + 1}. ${article.title}`);
    console.log(`   ${article.url}\n`);
  });

  await browser.close();
}

debugShortCodes().catch(console.error);

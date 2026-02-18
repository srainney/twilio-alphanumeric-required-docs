const { join } = require('path');

/**
 * Puppeteer configuration for Heroku deployment
 * Prevents Puppeteer from downloading Chrome and uses buildpack Chrome instead
 */
module.exports = {
  // Skip downloading Chrome during npm install
  skipDownload: true,
};

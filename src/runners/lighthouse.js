'use strict';

const { parseCookies, parseAuthHeader, loginWithPuppeteer, cookiesToHeader } = require('../utils/auth');

async function runLighthouse(url, options) {
  const { cookie, authHeader, loginUrl, username, password } = options;

  let lighthouse;
  try {
    const lhModule = require('lighthouse');
    lighthouse = lhModule.default || lhModule;
  } catch (e) {
    return { tool: 'Lighthouse', error: e.message, skipped: true };
  }

  let chromeLauncher;
  try {
    chromeLauncher = require('chrome-launcher');
  } catch (e) {
    try {
      chromeLauncher = require('lighthouse/node_modules/chrome-launcher');
    } catch (e2) {
      return { tool: 'Lighthouse', error: 'chrome-launcher not found', skipped: true };
    }
  }

  let chromePath;
  try {
    const puppeteer = require('puppeteer');
    chromePath = puppeteer.executablePath();
  } catch (e) {
    chromePath = undefined;
  }

  let chrome;
  try {
    const launchOpts = { chromeFlags: ['--headless', '--no-sandbox', '--disable-setuid-sandbox'] };
    if (chromePath) launchOpts.chromePath = chromePath;
    chrome = await chromeLauncher.launch(launchOpts);

    // Build extra headers for Lighthouse
    const extraHeaders = {};

    // --cookie flag
    if (cookie) extraHeaders['Cookie'] = cookie;

    // --auth-header flag
    const parsedAuth = parseAuthHeader(authHeader);
    if (parsedAuth) extraHeaders[parsedAuth.name] = parsedAuth.value;

    // --login-url / --username / --password: use Puppeteer to log in, extract cookies
    if (loginUrl && username && password) {
      const puppeteer = require('puppeteer');
      const browser = await puppeteer.connect({ browserURL: `http://localhost:${chrome.port}` });
      try {
        const sessionCookies = await loginWithPuppeteer(browser, loginUrl, username, password);
        const cookieHeader = cookiesToHeader(sessionCookies);
        if (cookieHeader) {
          // Merge with any explicit --cookie value
          extraHeaders['Cookie'] = [extraHeaders['Cookie'], cookieHeader].filter(Boolean).join('; ');
        }
      } finally {
        await browser.disconnect();
      }
    }

    const runnerResult = await lighthouse(url, {
      port: chrome.port,
      output: 'json',
      logLevel: 'error',
      extraHeaders: Object.keys(extraHeaders).length > 0 ? extraHeaders : undefined,
    }, {
      extends: 'lighthouse:default',
      settings: { onlyCategories: ['performance'] }
    });

    const lhr = runnerResult.lhr;
    const audits = lhr.audits;

    return {
      tool: 'Lighthouse',
      type: 'page',
      url,
      metrics: {
        lcp: Math.round(audits['largest-contentful-paint']?.numericValue ?? 0),
        fcp: Math.round(audits['first-contentful-paint']?.numericValue ?? 0),
        tti: Math.round(audits['interactive']?.numericValue ?? 0),
        tbt: Math.round(audits['total-blocking-time']?.numericValue ?? 0),
        cls: audits['cumulative-layout-shift']?.numericValue ?? 0,
        performanceScore: Math.round((lhr.categories.performance?.score ?? 0) * 100)
      }
    };
  } catch (err) {
    return { tool: 'Lighthouse', error: err.message, skipped: true };
  } finally {
    if (chrome) {
      try { await chrome.kill(); } catch (e) {}
    }
  }
}

module.exports = runLighthouse;

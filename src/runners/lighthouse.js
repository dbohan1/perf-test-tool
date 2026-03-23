'use strict';

async function runLighthouse(url, options) {
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

  // Try to find Puppeteer's bundled Chrome if chrome-launcher can't find one
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

    const runnerResult = await lighthouse(url, {
      port: chrome.port,
      output: 'json',
      logLevel: 'error',
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

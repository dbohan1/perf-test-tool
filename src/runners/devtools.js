'use strict';

async function runDevTools(url, options) {
  const { iterations = 10 } = options;
  const puppeteer = require('puppeteer');

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });

  const raw = [];
  try {
    for (let i = 0; i < iterations; i++) {
      const page = await browser.newPage();
      try {
        await page.goto(url, { waitUntil: 'load', timeout: 30000 });
        const timing = await page.evaluate(() => JSON.parse(JSON.stringify(window.performance.timing)));
        const metrics = await page.metrics();

        const domLoad = timing.domContentLoadedEventEnd - timing.navigationStart;
        const fullLoad = timing.loadEventEnd - timing.navigationStart;
        const ttfb = timing.responseStart - timing.navigationStart;
        const fcp = metrics.FirstMeaningfulPaint ? metrics.FirstMeaningfulPaint * 1000 : 0;

        raw.push({ domLoad: Math.max(0, domLoad), fullLoad: Math.max(0, fullLoad), ttfb: Math.max(0, ttfb), fcp: Math.max(0, fcp) });
      } catch (e) {
        raw.push({ domLoad: 0, fullLoad: 0, ttfb: 0, fcp: 0, error: e.message });
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }

  const validRaw = raw.filter(r => !r.error);
  const avg = (key) => validRaw.length ? Math.round(validRaw.reduce((sum, r) => sum + r[key], 0) / validRaw.length) : 0;

  return {
    tool: 'Chrome DevTools (Puppeteer)',
    type: 'page',
    url,
    iterations,
    metrics: {
      ttfb: avg('ttfb'),
      domLoad: avg('domLoad'),
      fullLoad: avg('fullLoad'),
      fcp: avg('fcp')
    },
    raw
  };
}

module.exports = runDevTools;

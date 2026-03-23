'use strict';

const fs = require('fs');
const path = require('path');
const Handlebars = require('handlebars');

async function reportHTML(results, opts) {
  const { url, output, iterations, concurrency } = opts;
  fs.mkdirSync(output, { recursive: true });

  const templatePath = path.join(__dirname, '..', '..', 'templates', 'report.html.template');
  const templateSrc = fs.readFileSync(templatePath, 'utf8');
  const template = Handlebars.compile(templateSrc);

  Handlebars.registerHelper('scoreColor', (score) => {
    if (score >= 90) return 'good';
    if (score >= 50) return 'warn';
    return 'poor';
  });

  Handlebars.registerHelper('timeColor', (ms, good, warn) => {
    if (ms <= good) return 'good';
    if (ms <= warn) return 'warn';
    return 'poor';
  });

  Handlebars.registerHelper('clsColor', (cls) => {
    if (cls <= 0.1) return 'good';
    if (cls <= 0.25) return 'warn';
    return 'poor';
  });

  Handlebars.registerHelper('fixed', (n, digits) => {
    return typeof n === 'number' ? n.toFixed(digits) : n;
  });

  const apiResults = results.filter(r => r.type === 'api' && !r.skipped && !r.error);
  const devtools = results.find(r => r.tool === 'Chrome DevTools (Puppeteer)' && !r.skipped && !r.error);
  const lh = results.find(r => r.tool === 'Lighthouse' && !r.skipped && !r.error);
  const skipped = results.filter(r => r.skipped || r.error);

  const html = template({
    url,
    timestamp: new Date().toLocaleString(),
    iterations,
    concurrency,
    apiResults,
    devtools: devtools || null,
    lighthouse: lh || null,
    skipped,
    hasApi: apiResults.length > 0,
    hasPage: !!(devtools || lh),
    hasLighthouse: !!lh,
    hasDevtools: !!devtools,
    hasSkipped: skipped.length > 0
  });

  const filePath = path.join(output, 'report.html');
  fs.writeFileSync(filePath, html, 'utf8');
  return filePath;
}

module.exports = reportHTML;

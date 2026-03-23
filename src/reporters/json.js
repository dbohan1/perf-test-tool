'use strict';

const fs = require('fs');
const path = require('path');

async function reportJSON(results, opts) {
  const { url, output, iterations, concurrency } = opts;
  fs.mkdirSync(output, { recursive: true });

  const report = {
    timestamp: new Date().toISOString(),
    url,
    iterations,
    concurrency,
    results
  };

  const filePath = path.join(output, 'results.json');
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf8');
  return filePath;
}

module.exports = reportJSON;

'use strict';

const newman = require('newman');

function calcPercentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function calcMetrics(times, successes) {
  if (!times.length) return { min: 0, max: 0, avg: 0, p95: 0, successRate: 0 };
  const min = Math.min(...times);
  const max = Math.max(...times);
  const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
  const p95 = calcPercentile(times, 95);
  const successRate = Math.round((successes / times.length) * 100);
  return { min, max, avg, p95, successRate };
}

async function runNewman(url, options) {
  const { iterations = 10 } = options;

  const collection = {
    info: { name: 'PerfTest', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
    item: [{
      name: 'GET Request',
      request: {
        method: 'GET',
        url: url
      }
    }]
  };

  const raw = [];

  return new Promise((resolve, reject) => {
    newman.run({
      collection,
      iterationCount: iterations,
      insecure: true,
      reporters: [],
    }, (err, summary) => {
      if (err) return reject(err);

      const executions = summary.run.executions || [];
      let successCount = 0;
      for (const exec of executions) {
        const responseTime = exec.response ? exec.response.responseTime : 0;
        const statusCode = exec.response ? exec.response.code : 0;
        const success = statusCode >= 200 && statusCode < 400;
        if (success) successCount++;
        raw.push({ responseTime, statusCode, success });
      }

      const times = raw.map(r => r.responseTime);
      const metrics = calcMetrics(times, successCount);

      resolve({
        tool: 'Newman (Postman)',
        type: 'api',
        url,
        iterations,
        metrics,
        raw
      });
    });
  });
}

module.exports = runNewman;

'use strict';

const chalk = require('chalk');
const Table = require('cli-table3');

function colorTime(ms, goodMs = 500, warnMs = 1500) {
  if (ms <= goodMs) return chalk.green(`${ms} ms`);
  if (ms <= warnMs) return chalk.yellow(`${ms} ms`);
  return chalk.red(`${ms} ms`);
}

function colorScore(score) {
  if (score >= 90) return chalk.green(`${score}`);
  if (score >= 50) return chalk.yellow(`${score}`);
  return chalk.red(`${score}`);
}

function colorLcp(ms) {
  if (ms <= 2500) return chalk.green(`${ms} ms`);
  if (ms <= 4000) return chalk.yellow(`${ms} ms`);
  return chalk.red(`${ms} ms`);
}

function reportConsole(results, opts) {
  const { url } = opts;
  const width = 72;

  console.log('\n' + chalk.bold.bgBlue.white(' '.repeat(width)));
  console.log(chalk.bold.bgBlue.white(`  PERFORMANCE BENCHMARK RESULTS${' '.repeat(width - 32)}`));
  console.log(chalk.bold.bgBlue.white(`  URL: ${url}${' '.repeat(Math.max(0, width - 7 - url.length))}`));
  console.log(chalk.bold.bgBlue.white(' '.repeat(width)) + '\n');

  const apiResults = results.filter(r => r.type === 'api' && !r.skipped && !r.error);
  if (apiResults.length > 0) {
    console.log(chalk.bold('API RESPONSE TIME'));
    const apiTable = new Table({
      head: [chalk.bold('Tool'), chalk.bold('Min'), chalk.bold('Avg'), chalk.bold('Max'), chalk.bold('P95'), chalk.bold('Success%')],
      colWidths: [24, 12, 12, 12, 12, 12]
    });
    for (const r of apiResults) {
      const m = r.metrics;
      apiTable.push([r.tool, colorTime(m.min), colorTime(m.avg), colorTime(m.max), colorTime(m.p95), `${m.successRate}%`]);
    }
    console.log(apiTable.toString());
  }

  const skippedApi = results.filter(r => r.type === 'api' && (r.skipped || r.error));
  for (const r of skippedApi) {
    console.log(chalk.yellow(`  ⚠  ${r.tool}: ${r.reason || r.error || 'skipped'}`));
  }

  console.log('');

  const pageResults = results.filter(r => r.type === 'page' && !r.skipped && !r.error);
  const devtools = pageResults.find(r => r.tool === 'Chrome DevTools (Puppeteer)');
  const lh = pageResults.find(r => r.tool === 'Lighthouse');

  if (devtools || lh) {
    console.log(chalk.bold('PAGE LOAD METRICS'));
    const pageTable = new Table({
      head: [chalk.bold('Tool'), chalk.bold('TTFB'), chalk.bold('DOM Load'), chalk.bold('Full Load'), chalk.bold('FCP/LCP')],
      colWidths: [28, 12, 12, 12, 14]
    });
    if (devtools) {
      const m = devtools.metrics;
      pageTable.push([devtools.tool, colorTime(m.ttfb, 200, 600), colorTime(m.domLoad, 1000, 3000), colorTime(m.fullLoad, 2000, 5000), colorTime(m.fcp, 1800, 3000)]);
    }
    if (lh) {
      const m = lh.metrics;
      pageTable.push([lh.tool, '-', '-', '-', colorLcp(m.lcp)]);
    }
    console.log(pageTable.toString());
  }

  if (lh && !lh.skipped && !lh.error) {
    const m = lh.metrics;
    console.log('\n' + chalk.bold('LIGHTHOUSE SCORES'));
    const lhTable = new Table({
      head: [chalk.bold('Metric'), chalk.bold('Value')],
      colWidths: [30, 20]
    });
    lhTable.push(
      ['Performance Score', colorScore(m.performanceScore ?? 0)],
      ['LCP', colorLcp(m.lcp ?? 0)],
      ['FCP', colorTime(m.fcp ?? 0, 1800, 3000)],
      ['TTI', colorTime(m.tti ?? 0, 3800, 7300)],
      ['TBT', colorTime(m.tbt ?? 0, 200, 600)],
      ['CLS', (m.cls == null || isNaN(m.cls))
        ? chalk.gray('N/A')
        : m.cls <= 0.1 ? chalk.green(m.cls.toFixed(3))
        : m.cls <= 0.25 ? chalk.yellow(m.cls.toFixed(3))
        : chalk.red(m.cls.toFixed(3))]
    );
    console.log(lhTable.toString());
  }

  const skippedPage = results.filter(r => r.type === 'page' && (r.skipped || r.error));
  for (const r of skippedPage) {
    console.log(chalk.yellow(`  ⚠  ${r.tool}: ${r.reason || r.error || 'skipped'}`));
  }

  const errored = results.filter(r => !r.type && (r.skipped || r.error));
  for (const r of errored) {
    console.log(chalk.yellow(`  ⚠  ${r.tool}: ${r.reason || r.error || 'skipped'}`));
  }

  console.log('');
}

module.exports = reportConsole;

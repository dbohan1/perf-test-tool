#!/usr/bin/env node
'use strict';

// Suppress DEP0176 from newman's secure-fs.js (fs.F_OK used internally by newman dependency)
const originalEmit = process.emit.bind(process);
process.emit = function (event, warning, ...args) {
  if (event === 'warning' && warning && warning.code === 'DEP0176') return false;
  return originalEmit(event, warning, ...args);
};

const path = require('path');
const chalk = require('chalk');
const ora = require('ora');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

const ensureDependencies = require('../src/setup/dependencies');
const runNewman = require('../src/runners/newman');
const runJMeter = require('../src/runners/jmeter');
const runDevTools = require('../src/runners/devtools');
const runLighthouse = require('../src/runners/lighthouse');
const reportConsole = require('../src/reporters/console');
const reportJSON = require('../src/reporters/json');
const reportHTML = require('../src/reporters/html');

const argv = yargs(hideBin(process.argv))
  .option('url', { type: 'string', demandOption: true, describe: 'URL to test' })
  .option('iterations', { type: 'number', default: 10, describe: 'Number of iterations' })
  .option('concurrency', { type: 'number', default: 5, describe: 'Concurrent users (JMeter)' })
  .option('output', { type: 'string', default: './reports', describe: 'Output directory' })
  .option('cookie', { type: 'string', describe: 'Cookie header value, e.g. "session=abc; token=xyz"' })
  .option('auth-header', { type: 'string', describe: 'Auth header, e.g. "Authorization: Bearer abc123"' })
  .option('login-url', { type: 'string', describe: 'Login page URL for form-based auth (requires --username and --password)' })
  .option('username', { type: 'string', describe: 'Username for form login' })
  .option('password', { type: 'string', describe: 'Password for form login' })
  .option('company-id', { type: 'string', describe: 'Company ID for form login (fills #CompanyId input)' })
  .check(argv => {
    if ((argv['login-url'] || argv.username || argv.password) &&
        !(argv['login-url'] && argv.username && argv.password)) {
      throw new Error('--login-url, --username, and --password must all be provided together');
    }
    return true;
  })
  .help()
  .argv;

async function main() {
  const { url, iterations, concurrency, output, cookie, authHeader, loginUrl, username, password, companyId } = argv;
  const outputDir = path.resolve(output);

  console.log(chalk.bold.cyan('\n🚀 Performance Benchmark Tool'));
  console.log(chalk.gray(`   URL: ${url}`));
  console.log(chalk.gray(`   Iterations: ${iterations}, Concurrency: ${concurrency}`));
  if (cookie) console.log(chalk.gray(`   Cookie: ${cookie.slice(0, 40)}${cookie.length > 40 ? '…' : ''}`));
  if (authHeader) console.log(chalk.gray(`   Auth: ${authHeader.split(':')[0]}: ***`));
  if (loginUrl) console.log(chalk.gray(`   Login: ${loginUrl} (user: ${username}${companyId ? `, company: ${companyId}` : ''})`));
  console.log('');

  const depSpinner = ora('Checking dependencies...').start();
  let deps;
  try {
    deps = await ensureDependencies({ url, iterations, concurrency, output: outputDir });
    depSpinner.succeed('Dependencies checked');
  } catch (err) {
    depSpinner.fail(`Dependency check failed: ${err.message}`);
    process.exit(1);
  }

  const spinner = ora('Running benchmark tests in parallel...').start();

  const opts = { iterations, concurrency, cookie, authHeader, loginUrl, username, password, companyId, ...deps };

  let results;
  try {
    results = await Promise.all([
      runNewman(url, opts).catch(err => ({ tool: 'Newman (Postman)', error: err.message, skipped: true })),
      runJMeter(url, { ...opts, ...(deps.jmeter || {}) }).catch(err => ({ tool: 'JMeter', error: err.message, skipped: true })),
      runDevTools(url, opts).catch(err => ({ tool: 'Chrome DevTools (Puppeteer)', error: err.message, skipped: true })),
      runLighthouse(url, opts).catch(err => ({ tool: 'Lighthouse', error: err.message, skipped: true })),
    ]);
    spinner.succeed('All benchmark tests completed');
  } catch (err) {
    spinner.fail(`Benchmark failed: ${err.message}`);
    process.exit(1);
  }

  const reportOpts = { url, output: outputDir, iterations, concurrency };

  reportConsole(results, reportOpts);

  const jsonSpinner = ora('Writing JSON report...').start();
  try {
    await reportJSON(results, reportOpts);
    jsonSpinner.succeed(`JSON report written to ${outputDir}/results.json`);
  } catch (err) {
    jsonSpinner.fail(`JSON report failed: ${err.message}`);
  }

  const htmlSpinner = ora('Writing HTML report...').start();
  try {
    await reportHTML(results, reportOpts);
    htmlSpinner.succeed(`HTML report written to ${outputDir}/report.html`);
  } catch (err) {
    htmlSpinner.fail(`HTML report failed: ${err.message}`);
  }

  console.log(chalk.bold.green('\n✅ Benchmark complete!\n'));
}

main().catch(err => {
  console.error(chalk.red('Fatal error:'), err.message);
  process.exit(1);
});

// Suppress non-fatal cleanup errors from chrome-launcher (EPERM on temp dir removal)
process.on('uncaughtException', (err) => {
  if (err.code === 'EPERM' || err.code === 'ENOTEMPTY' || err.syscall === 'rm') return;
  console.error(chalk.red('Uncaught exception:'), err.message);
  process.exit(1);
});

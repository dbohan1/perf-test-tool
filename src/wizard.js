'use strict';

const prompts = require('prompts');
const chalk = require('chalk');

async function runWizard() {
  console.log(chalk.bold.cyan('\n🚀 Performance Benchmark Tool'));
  console.log(chalk.gray('   Answer the prompts below, or press Ctrl+C to cancel.\n'));

  // Cancel handler
  const onCancel = () => {
    console.log(chalk.yellow('\nCancelled.'));
    process.exit(0);
  };

  // Step 1: URL
  const { url } = await prompts({
    type: 'text',
    name: 'url',
    message: 'Target URL to benchmark',
    validate: v => (v && v.startsWith('http') ? true : 'Please enter a valid URL (starting with http:// or https://)')
  }, { onCancel });

  // Step 2: Benchmark settings
  const settings = await prompts([
    {
      type: 'number',
      name: 'iterations',
      message: 'Number of request iterations (per API tool)',
      initial: 10,
      min: 1
    },
    {
      type: 'number',
      name: 'concurrency',
      message: 'JMeter concurrent virtual users',
      initial: 5,
      min: 1
    },
    {
      type: 'text',
      name: 'output',
      message: 'Output directory for reports',
      initial: './reports'
    }
  ], { onCancel });

  // Step 3: Auth
  const { needsAuth } = await prompts({
    type: 'confirm',
    name: 'needsAuth',
    message: 'Does the target URL require authentication?',
    initial: false
  }, { onCancel });

  let authOpts = {};

  if (needsAuth) {
    const { authMethod } = await prompts({
      type: 'select',
      name: 'authMethod',
      message: 'How is the page authenticated?',
      choices: [
        { title: 'Form login  (username + password, Puppeteer fills the form)', value: 'form' },
        { title: 'Cookie      (paste a cookie string from your browser)', value: 'cookie' },
        { title: 'Auth header (Bearer token, API key, etc.)', value: 'header' },
      ]
    }, { onCancel });

    if (authMethod === 'form') {
      const formOpts = await prompts([
        {
          type: 'text',
          name: 'loginUrl',
          message: 'Login page URL',
          validate: v => (v && v.startsWith('http') ? true : 'Please enter a valid URL')
        },
        {
          type: 'text',
          name: 'companyId',
          message: 'Company ID  (leave blank if not required)',
        },
        {
          type: 'text',
          name: 'username',
          message: 'Username or email',
          validate: v => (v ? true : 'Username is required')
        },
        {
          type: 'password',
          name: 'password',
          message: 'Password',
          validate: v => (v ? true : 'Password is required')
        }
      ], { onCancel });

      authOpts = {
        loginUrl: formOpts.loginUrl,
        username: formOpts.username,
        password: formOpts.password,
        companyId: formOpts.companyId || undefined
      };

    } else if (authMethod === 'cookie') {
      const { cookie } = await prompts({
        type: 'text',
        name: 'cookie',
        message: 'Cookie string  (e.g. session=abc; token=xyz)',
        validate: v => (v ? true : 'Please enter at least one cookie')
      }, { onCancel });
      authOpts = { cookie };

    } else if (authMethod === 'header') {
      const { authHeader } = await prompts({
        type: 'text',
        name: 'authHeader',
        message: 'Auth header  (e.g. Authorization: Bearer abc123)',
        validate: v => (v && v.includes(':') ? true : 'Must be in "Header-Name: value" format')
      }, { onCancel });
      authOpts = { authHeader };
    }

    // If form login was chosen, also offer cookie/header for Newman & JMeter
    if (authMethod === 'form') {
      const { alsoApiAuth } = await prompts({
        type: 'confirm',
        name: 'alsoApiAuth',
        message: 'Do Newman & JMeter also need auth? (cookie or header)',
        initial: false
      }, { onCancel });

      if (alsoApiAuth) {
        const { apiAuthMethod } = await prompts({
          type: 'select',
          name: 'apiAuthMethod',
          message: 'Auth method for Newman & JMeter',
          choices: [
            { title: 'Cookie', value: 'cookie' },
            { title: 'Auth header', value: 'header' }
          ]
        }, { onCancel });

        if (apiAuthMethod === 'cookie') {
          const { cookie } = await prompts({
            type: 'text',
            name: 'cookie',
            message: 'Cookie string  (e.g. session=abc; token=xyz)'
          }, { onCancel });
          authOpts.cookie = cookie;
        } else {
          const { authHeader } = await prompts({
            type: 'text',
            name: 'authHeader',
            message: 'Auth header  (e.g. Authorization: Bearer abc123)'
          }, { onCancel });
          authOpts.authHeader = authHeader;
        }
      }
    }
  }

  // Summary
  console.log('');
  console.log(chalk.bold('─── Run summary ─────────────────────────────'));
  console.log(chalk.gray(`  URL:         `) + url);
  console.log(chalk.gray(`  Iterations:  `) + settings.iterations);
  console.log(chalk.gray(`  Concurrency: `) + settings.concurrency);
  console.log(chalk.gray(`  Output:      `) + settings.output);
  if (authOpts.loginUrl)   console.log(chalk.gray(`  Login URL:   `) + authOpts.loginUrl);
  if (authOpts.companyId)  console.log(chalk.gray(`  Company ID:  `) + authOpts.companyId);
  if (authOpts.username)   console.log(chalk.gray(`  Username:    `) + authOpts.username);
  if (authOpts.cookie)     console.log(chalk.gray(`  Cookie:      `) + authOpts.cookie.slice(0, 40) + (authOpts.cookie.length > 40 ? '…' : ''));
  if (authOpts.authHeader) console.log(chalk.gray(`  Auth header: `) + authOpts.authHeader.split(':')[0] + ': ***');
  console.log(chalk.bold('─────────────────────────────────────────────'));

  const { confirmed } = await prompts({
    type: 'confirm',
    name: 'confirmed',
    message: 'Start benchmark?',
    initial: true
  }, { onCancel });

  if (!confirmed) {
    console.log(chalk.yellow('Aborted.'));
    process.exit(0);
  }

  return { url, ...settings, ...authOpts };
}

module.exports = runWizard;

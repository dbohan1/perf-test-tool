'use strict';

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

async function ensureDependencies(opts) {
  const result = {
    newman: false,
    lighthouse: false,
    puppeteer: false,
    jmeter: { available: false, path: null }
  };

  // Newman
  try {
    require.resolve('newman');
    result.newman = true;
  } catch (e) {
    throw new Error('newman not found. Run npm install.');
  }

  // Lighthouse
  try {
    require.resolve('lighthouse');
    result.lighthouse = true;
  } catch (e) {
    throw new Error('lighthouse not found. Run npm install.');
  }

  // Puppeteer
  try {
    require.resolve('puppeteer');
    result.puppeteer = true;
  } catch (e) {
    throw new Error('puppeteer not found. Run npm install.');
  }

  // JMeter
  result.jmeter = await checkJMeter(opts);

  return result;
}

async function checkJMeter(opts) {
  const vendorDir = path.join(__dirname, '..', '..', 'vendor');
  const jmeterVersion = '5.6.3';
  const jmeterDir = path.join(vendorDir, `apache-jmeter-${jmeterVersion}`);
  const jmeterExe = path.join(jmeterDir, 'bin', 'jmeter.bat');

  // Check vendor directory first (already downloaded)
  if (fs.existsSync(jmeterExe)) {
    return { available: true, path: jmeterExe };
  }

  // Try system PATH
  try {
    const jmeterPath = execSync('where jmeter', { stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim().split('\n')[0].trim();
    if (jmeterPath) return { available: true, path: jmeterPath };
  } catch (e) {
    // not on PATH
  }

  // Check Java is available before attempting download
  try {
    execSync('java -version', { stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (e) {
    console.warn('\n⚠️  Java not found. JMeter will be skipped.');
    return { available: false, path: null };
  }

  console.log('\n📥 Downloading JMeter...');
  const axios = require('axios');
  const AdmZip = require('adm-zip');

  const zipUrl = `https://archive.apache.org/dist/jmeter/binaries/apache-jmeter-${jmeterVersion}.zip`;
  const zipPath = path.join(vendorDir, `apache-jmeter-${jmeterVersion}.zip`);

  if (!fs.existsSync(vendorDir)) fs.mkdirSync(vendorDir, { recursive: true });

  try {
    const response = await axios.get(zipUrl, { responseType: 'arraybuffer', timeout: 120000 });
    fs.writeFileSync(zipPath, Buffer.from(response.data));
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(vendorDir, true);
    fs.unlinkSync(zipPath);
    process.env.JMETER_HOME = jmeterDir;
    return { available: true, path: jmeterExe };
  } catch (err) {
    console.warn(`\n⚠️  Failed to download JMeter: ${err.message}. JMeter will be skipped.`);
    return { available: false, path: null };
  }
}

module.exports = ensureDependencies;

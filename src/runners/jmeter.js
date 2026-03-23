'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

function calcPercentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function buildJmx(url, iterations, concurrency, resultsFile, headers = []) {
  const parsed = new URL(url);
  const hostname = parsed.hostname;
  const port = parsed.port || (parsed.protocol === 'https:' ? 443 : 80);
  const protocol = parsed.protocol.replace(':', '');
  const urlPath = parsed.pathname + (parsed.search || '');
  const resultsFileSafe = resultsFile.replace(/\\/g, '/');

  const headerManagerXml = headers.length > 0 ? `
        <HeaderManager guiclass="HeaderPanel" testclass="HeaderManager" testname="HTTP Header Manager">
          <collectionProp name="HeaderManager.headers">
            ${headers.map(h => `<elementProp name="" elementType="Header">
              <stringProp name="Header.name">${h.name}</stringProp>
              <stringProp name="Header.value">${h.value}</stringProp>
            </elementProp>`).join('\n            ')}
          </collectionProp>
        </HeaderManager>
        <hashTree/>` : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<jmeterTestPlan version="1.2" properties="5.0" jmeter="5.6.3">
  <hashTree>
    <TestPlan guiclass="TestPlanGui" testclass="TestPlan" testname="Perf Test Plan">
      <boolProp name="TestPlan.functional_mode">false</boolProp>
      <boolProp name="TestPlan.serialize_threadgroups">false</boolProp>
    </TestPlan>
    <hashTree>
      <ThreadGroup guiclass="ThreadGroupGui" testclass="ThreadGroup" testname="Thread Group">
        <intProp name="ThreadGroup.num_threads">${concurrency}</intProp>
        <intProp name="ThreadGroup.ramp_time">1</intProp>
        <boolProp name="ThreadGroup.same_user_on_next_iteration">true</boolProp>
        <stringProp name="ThreadGroup.on_sample_error">continue</stringProp>
        <elementProp name="ThreadGroup.main_controller" elementType="LoopController">
          <boolProp name="LoopController.continue_forever">false</boolProp>
          <intProp name="LoopController.loops">${iterations}</intProp>
        </elementProp>
      </ThreadGroup>
      <hashTree>
        <HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="HTTP Request">
          <stringProp name="HTTPSampler.domain">${hostname}</stringProp>
          <intProp name="HTTPSampler.port">${port}</intProp>
          <stringProp name="HTTPSampler.protocol">${protocol}</stringProp>
          <stringProp name="HTTPSampler.path">${urlPath}</stringProp>
          <stringProp name="HTTPSampler.method">GET</stringProp>
          <boolProp name="HTTPSampler.follow_redirects">true</boolProp>
          <boolProp name="HTTPSampler.use_keepalive">true</boolProp>
        </HTTPSamplerProxy>
        <hashTree/>${headerManagerXml}
        <ResultCollector guiclass="SimpleDataWriter" testclass="ResultCollector" testname="Simple Data Writer">
          <boolProp name="ResultCollector.error_logging">false</boolProp>
          <objProp>
            <name>saveConfig</name>
            <value class="SampleSaveConfiguration">
              <time>true</time>
              <latency>true</latency>
              <timestamp>true</timestamp>
              <success>true</success>
              <label>true</label>
              <code>true</code>
              <message>true</message>
              <threadName>true</threadName>
              <dataType>true</dataType>
              <encoding>false</encoding>
              <assertions>true</assertions>
              <subresults>true</subresults>
              <responseData>false</responseData>
              <samplerData>false</samplerData>
              <xml>false</xml>
              <fieldNames>true</fieldNames>
              <responseHeaders>false</responseHeaders>
              <requestHeaders>false</requestHeaders>
              <responseDataOnError>false</responseDataOnError>
              <saveAssertionResultsFailureMessage>true</saveAssertionResultsFailureMessage>
              <assertionsResultsToSave>0</assertionsResultsToSave>
              <bytes>true</bytes>
              <sentBytes>true</sentBytes>
              <url>true</url>
              <threadCounts>true</threadCounts>
              <idleTime>true</idleTime>
              <connectTime>true</connectTime>
            </value>
          </objProp>
          <stringProp name="filename">${resultsFileSafe}</stringProp>
        </ResultCollector>
        <hashTree/>
      </hashTree>
    </hashTree>
  </hashTree>
</jmeterTestPlan>`;
}

function findJavaHome() {
  const candidates = [
    'C:\\Program Files\\Microsoft\\jdk-21.0.10.7-hotspot',
    'C:\\Program Files\\Eclipse Adoptium',
    'C:\\Program Files\\Java',
  ];
  for (const base of candidates) {
    if (fs.existsSync(path.join(base, 'bin', 'java.exe'))) return base;
    // Check one level deep for versioned subdirs (e.g. Eclipse Adoptium)
    if (fs.existsSync(base)) {
      const sub = fs.readdirSync(base).map(d => path.join(base, d)).find(d => fs.existsSync(path.join(d, 'bin', 'java.exe')));
      if (sub) return sub;
    }
  }
  return null;
}

async function runJMeter(url, options) {
  const { iterations = 10, concurrency = 5, available = false, path: jmeterPath = null, cookie, authHeader } = options;
  const { parseAuthHeader } = require('../utils/auth');

  if (!available || !jmeterPath) {
    return {
      tool: 'JMeter',
      type: 'api',
      url,
      skipped: true,
      reason: 'JMeter not available (Java not found or download failed)'
    };
  }

  const tmpDir = os.tmpdir();
  const jmxFile = path.join(tmpDir, `perf-test-${Date.now()}.jmx`);
  const resultsFile = path.join(tmpDir, `perf-results-${Date.now()}.csv`);

  try {
    const jmxHeaders = [];
    if (cookie) jmxHeaders.push({ name: 'Cookie', value: cookie });
    const parsedAuth = parseAuthHeader(authHeader);
    if (parsedAuth) jmxHeaders.push({ name: parsedAuth.name, value: parsedAuth.value });

    const jmx = buildJmx(url, iterations, concurrency, resultsFile, jmxHeaders);
    fs.writeFileSync(jmxFile, jmx, 'utf8');

    // Resolve JAVA_HOME from common install locations if not already set
    const javaHome = process.env.JAVA_HOME || findJavaHome();
    const javaBin = javaHome ? path.join(javaHome, 'bin') : null;
    const childEnv = { ...process.env };
    if (javaHome) {
      childEnv.JAVA_HOME = javaHome;
      childEnv.Path = javaBin + ';' + (childEnv.Path || childEnv.PATH || '');
    }

    let stderr = '';
    try {
      execSync(`"${jmeterPath}" -n -t "${jmxFile}" -l "${resultsFile}"`, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: childEnv,
        timeout: 300000
      });
    } catch (err) {
      stderr = (err.stderr || err.stdout || '').toString();
      throw new Error(`JMeter exited with error:\n${stderr || err.message}`);
    }

    // Parse CSV
    const csvContent = fs.readFileSync(resultsFile, 'utf8');
    const lines = csvContent.trim().split('\n');
    const headers = lines[0].split(',');
    const elapsedIdx = headers.indexOf('elapsed');
    const successIdx = headers.indexOf('success');
    const codeIdx = headers.indexOf('responseCode');

    const raw = [];
    let successCount = 0;
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      const elapsed = parseInt(cols[elapsedIdx], 10) || 0;
      const success = cols[successIdx] === 'true';
      const statusCode = parseInt(cols[codeIdx], 10) || 0;
      if (success) successCount++;
      raw.push({ responseTime: elapsed, statusCode, success });
    }

    const times = raw.map(r => r.responseTime);
    const sorted = [...times].sort((a, b) => a - b);
    const min = sorted[0] || 0;
    const max = sorted[sorted.length - 1] || 0;
    const avg = Math.round(times.reduce((a, b) => a + b, 0) / (times.length || 1));
    const p95idx = Math.ceil(0.95 * sorted.length) - 1;
    const p95 = sorted[Math.max(0, p95idx)] || 0;
    const successRate = Math.round((successCount / (raw.length || 1)) * 100);

    return {
      tool: 'JMeter',
      type: 'api',
      url,
      iterations,
      metrics: { min, max, avg, p95, successRate },
      raw
    };
  } finally {
    try { fs.unlinkSync(jmxFile); } catch (e) {}
    try { fs.unlinkSync(resultsFile); } catch (e) {}
  }
}

module.exports = runJMeter;

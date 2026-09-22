/**
 * SYNTHETIC TEST SUITE: TASK H1
 * Offline Routing — V2 is Local by Design
 * 
 * Verifies:
 * 1. `offline: true` executes V2 Single-Pass Ground Truth pipeline locally (0 Gemini API calls).
 * 2. Engine Mode banner displays `Single-Pass Ground Truth (Chromium, local)` and never legacy mutator loop.
 * 3. Chromium capture failure triggers explicit LOUD fallback banner:
 *    `[LEGACY FALLBACK (GT unavailable)] Single-pass Chromium capture failed: <reason>`
 *    `Forcing ADVISORY export. Never silent legacy.`
 * 4. Legacy fallback strictly forces ADVISORY export (`cleanPass: false`, `gatekeeperPassed: false`, `LEGACY_FALLBACK` defect registered).
 * 5. Scalar contract is 100% compliant across both offline V2 and fallback exports.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { compileHtmlToElementor } = require('../src/engine');
const geminiClient = require('../src/ai/gemini-client');
const styleSnapshot = require('../src/smart/style-snapshot');
const { validateTemplate } = require('../src/smart/scalar-contract');

console.log('========================================================================');
console.log('       SYNTHETIC SUITE H1: OFFLINE ROUTING & LOCAL V2 PARITY');
console.log('========================================================================\n');

let passedTests = 0;
let totalTests = 0;

function pass(msg) {
  totalTests++;
  passedTests++;
  console.log(`  ✓ PASS: ${msg}`);
}

function fail(msg, err) {
  totalTests++;
  console.error(`  ❌ FAIL: ${msg}`);
  if (err) console.error(err);
}

const sampleHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Offline V2 Test</title>
  <style>
    body { margin: 0; padding: 0; font-family: Inter, sans-serif; background: #ffffff; }
    .hero-card {
      display: flex;
      flex-direction: column;
      padding: 32px;
      margin: 20px auto;
      max-width: 960px;
      background-color: #0f172a;
      border-radius: 16px;
      color: #ffffff;
    }
    .hero-title {
      font-size: 32px;
      font-weight: 700;
      color: #38bdf8;
      margin-bottom: 12px;
    }
    .hero-desc {
      font-size: 16px;
      line-height: 1.6;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  <div class="hero-card">
    <h1 class="hero-title">Local Chromium Ground Truth</h1>
    <p class="hero-desc">Testing V2 single pass routing under offline flag.</p>
  </div>
</body>
</html>`;

(async () => {
  // ---------------------------------------------------------------------------
  // TEST 1: offline: true executes V2 Single-Pass GT with 0 Gemini Calls
  // ---------------------------------------------------------------------------
  console.log('▶ [1/4] Verifying offline: true routes to V2 Ground Truth locally (0 Gemini calls)...');
  try {
    let geminiCalls = 0;
    const origCallGeminiCompiler = geminiClient.callGeminiCompiler;
    geminiClient.callGeminiCompiler = async () => {
      geminiCalls++;
      throw new Error('Gemini compiler must NOT be called in offline mode!');
    };

    const loggedLines = [];
    const origLog = console.log;
    console.log = (...args) => {
      loggedLines.push(args.join(' '));
      origLog(...args);
    };

    let result;
    try {
      result = await compileHtmlToElementor(sampleHtml, {
        title: 'Offline V2 Test',
        offline: true,
        useAi: false,
        useVisionAi: false,
        inspect: true
      });
    } finally {
      console.log = origLog;
      geminiClient.callGeminiCompiler = origCallGeminiCompiler;
    }

    assert.strictEqual(geminiCalls, 0, 'Gemini API call count must be exactly 0 in offline mode');
    assert.strictEqual(result.isGroundTruthCompiled, true, 'isGroundTruthCompiled must be true');
    assert.strictEqual(result.isAiCompiled, false, 'isAiCompiled must be false');
    assert.strictEqual(result.isFallbackLegacy, false, 'isFallbackLegacy must be false');
    assert.strictEqual(result.meta.isGroundTruthCompiled, true, 'meta.isGroundTruthCompiled must be true');
    assert.strictEqual(result.meta.model, 'Single-Pass Ground Truth (Chromium, local)', 'meta.model must match V2 local engine');
    assert(result.templateJson && Array.isArray(result.templateJson.content), 'Valid Elementor template JSON must be returned');
    assert(result.templateJson.content.length > 0, 'Template must contain root container');

    const scalarViolations = validateTemplate(result.templateJson);
    assert.strictEqual(scalarViolations.length, 0, `Scalar contract must have 0 violations (got ${scalarViolations.length})`);

    pass('offline: true successfully compiled via V2 Single-Pass GT locally with 0 Gemini calls');
  } catch (err) {
    fail('offline: true failed to route to V2 Ground Truth', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 2: CLI Banner Display Verification
  // ---------------------------------------------------------------------------
  console.log('\n▶ [2/4] Verifying CLI Banner outputs Single-Pass Ground Truth (Chromium, local)...');
  try {
    const loggedMessages = [];
    const origLog = console.log;
    console.log = (...args) => {
      loggedMessages.push(args.join(' '));
      origLog(...args);
    };

    try {
      await compileHtmlToElementor(sampleHtml, {
        title: 'CLI Banner Test',
        offline: true,
        inspect: false
      });
    } finally {
      console.log = origLog;
    }

    const fullLog = loggedMessages.join('\n');
    assert(
      fullLog.includes('• Engine Mode:      Single-Pass Ground Truth (Chromium, local)'),
      'Output banner must display "Engine Mode:      Single-Pass Ground Truth (Chromium, local)"'
    );
    assert(
      !fullLog.includes('Legacy Offline DOM Semantic Tree Decomposition Engine'),
      'Output must NEVER display Legacy Offline DOM engine on V2 path'
    );

    pass('CLI Banner explicitly prints "Engine Mode: Single-Pass Ground Truth (Chromium, local)"');
  } catch (err) {
    fail('CLI Banner verification failed', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Simulated Chromium GT Crash -> Loud Fallback Banner & Forced Advisory
  // ---------------------------------------------------------------------------
  console.log('\n▶ [3/4] Verifying Simulated GT Failure -> Loud Fallback Banner & Forced Advisory...');
  try {
    const origCapture = styleSnapshot.captureGroundTruth;
    styleSnapshot.captureGroundTruth = async () => {
      throw new Error('Puppeteer process crashed: Target closed unexpectedly');
    };

    const warnedMessages = [];
    const origWarn = console.warn;
    console.warn = (...args) => {
      warnedMessages.push(args.join(' '));
      origWarn(...args);
    };

    let fallbackResult;
    try {
      fallbackResult = await compileHtmlToElementor(sampleHtml, {
        title: 'Crash Fallback Test',
        offline: true,
        inspect: false
      });
    } finally {
      styleSnapshot.captureGroundTruth = origCapture;
      console.warn = origWarn;
    }

    const fullWarnings = warnedMessages.join('\n');
    assert(
      fullWarnings.includes('[LEGACY FALLBACK (GT unavailable)] Single-pass Chromium capture failed: Puppeteer process crashed'),
      'Loud fallback warning banner must be printed with exact failure reason'
    );
    assert(
      fullWarnings.includes('Forcing ADVISORY export. Never silent legacy.'),
      'Loud banner must state "Forcing ADVISORY export. Never silent legacy."'
    );

    assert.strictEqual(fallbackResult.isGroundTruthCompiled, false, 'isGroundTruthCompiled must be false on failure');
    assert.strictEqual(fallbackResult.isFallbackLegacy, true, 'isFallbackLegacy must be true');
    assert.strictEqual(fallbackResult.visualReport.cleanPass, false, 'visualReport.cleanPass must be forced false');
    assert.strictEqual(fallbackResult.visualReport.gatekeeperPassed, false, 'visualReport.gatekeeperPassed must be forced false');
    assert.strictEqual(fallbackResult.visualReport.scorecard.cleanPass, false, 'scorecard.cleanPass must be forced false');

    const hasLegacyDefect = (fallbackResult.visualReport.unresolvedDefects || []).some(
      d => d.type === 'LEGACY_FALLBACK' && d.message.includes('Puppeteer process crashed')
    );
    assert(hasLegacyDefect, 'Visual report must register LEGACY_FALLBACK defect');

    pass('Simulated GT crash triggered loud fallback banner and forced ADVISORY export');
  } catch (err) {
    fail('Simulated GT crash test failed', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Explicit useGroundTruth: false -> Loud Fallback & Advisory
  // ---------------------------------------------------------------------------
  console.log('\n▶ [4/4] Verifying explicit useGroundTruth: false -> Loud Fallback & Advisory...');
  try {
    const warnedMessages = [];
    const origWarn = console.warn;
    console.warn = (...args) => {
      warnedMessages.push(args.join(' '));
      origWarn(...args);
    };

    let disabledResult;
    try {
      disabledResult = await compileHtmlToElementor(sampleHtml, {
        title: 'Explicit Disabled GT Test',
        offline: true,
        useGroundTruth: false,
        inspect: false
      });
    } finally {
      console.warn = origWarn;
    }

    const fullWarnings = warnedMessages.join('\n');
    assert(
      fullWarnings.includes('[LEGACY FALLBACK (GT unavailable)]'),
      'Must print loud fallback banner when GT is explicitly disabled'
    );
    assert.strictEqual(disabledResult.isFallbackLegacy, true, 'isFallbackLegacy must be true');
    assert.strictEqual(disabledResult.visualReport.cleanPass, false, 'visualReport.cleanPass must be false');
    assert.strictEqual(disabledResult.visualReport.scorecard.cleanPass, false, 'scorecard.cleanPass must be false');

    pass('Explicit useGroundTruth: false logged loud fallback banner and forced ADVISORY export');
  } catch (err) {
    fail('Explicit useGroundTruth: false test failed', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 5: CLI binary subprocess with --offline runs V2 Single-Pass GT
  // ---------------------------------------------------------------------------
  console.log('\n▶ [5/5] Verifying CLI binary subprocess execution with --offline...');
  try {
    const { execSync } = require('child_process');
    const tempInput = path.join(__dirname, 'temp-h1-input.html');
    const tempOutput = path.join(__dirname, 'temp-h1-output.json');
    fs.writeFileSync(tempInput, sampleHtml, 'utf8');

    let cliStdout = '';
    try {
      cliStdout = execSync(`node bin/cli.js "${tempInput}" "${tempOutput}" --offline`, {
        cwd: path.join(__dirname, '..'),
        encoding: 'utf8'
      });
    } finally {
      if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
      if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);
      const tempPreview = tempOutput.replace('.json', '-preview.html');
      if (fs.existsSync(tempPreview)) fs.unlinkSync(tempPreview);
      const tempAudit = tempOutput.replace('.json', '.audit.json');
      if (fs.existsSync(tempAudit)) fs.unlinkSync(tempAudit);
    }

    assert(
      cliStdout.includes('• Flag:             --offline (Remote AI Disabled, Local Chromium GT Active)'),
      'CLI stdout must show offline flag with local GT active'
    );
    assert(
      cliStdout.includes('• Engine Mode:      Single-Pass Ground Truth (Chromium, local)'),
      'CLI stdout must show Engine Mode: Single-Pass Ground Truth (Chromium, local)'
    );
    assert(
      cliStdout.includes('Compilation Engine: Single-Pass Ground Truth (Chromium, local)'),
      'CLI stdout must show Compilation Engine: Single-Pass Ground Truth (Chromium, local)'
    );
    assert(
      !cliStdout.includes('Legacy Offline DOM Semantic Tree Decomposition Engine'),
      'CLI stdout must NOT show Legacy Offline DOM Engine'
    );

    pass('CLI binary runs V2 Single-Pass GT locally when invoked with --offline');
  } catch (err) {
    fail('CLI binary subprocess test failed', err);
  }

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log(`SUITE H1 RESULTS: ${passedTests}/${totalTests} tests passed (${Math.round(passedTests / totalTests * 100)}%)`);
  console.log('========================================================================');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
})();

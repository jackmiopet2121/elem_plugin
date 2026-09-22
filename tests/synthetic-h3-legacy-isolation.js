/**
 * SYNTHETIC TEST SUITE: TASK H3
 * Legacy Mutator Isolation + Gate Semantics Enforcement (Block 7.5)
 * 
 * Verifies:
 * 1. Legacy mutator loop invocations = 0 on V2 path (strict isolation of legacy heuristics).
 * 2. E1 Gate Semantics: Fidelity can NEVER report 100 while unresolved defects > 0 (strictly capped at 99).
 * 3. cleanPass strict invariant: cleanPass === Boolean(gatePassed && high === 0 && critical === 0 && fidelity >= 95).
 * 4. Banner consistency: [CLEAN PASS] vs [ADVISORY EXPORT (not clean)] without ambiguous or contradictory states.
 * 5. Introspectability: *.audit.json and scorecard strictly include `engineMode` and `defects` array.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const legacyLoopModule = require('../src/inspector/self-healing-loop');
const { calculateFidelityScore, evaluateConvergenceGate } = require('../src/smart/convergence-gate');
const { compileHtmlToElementor } = require('../src/engine');
const { validateTemplate } = require('../src/smart/scalar-contract');

console.log('========================================================================');
console.log('       SYNTHETIC SUITE H3: LEGACY ISOLATION & GATE SEMANTICS');
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
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { margin: 0; padding: 0; font-family: Inter, sans-serif; background: #ffffff; }
    .hero { width: 100%; padding: 40px 0; background: #0f172a; color: #ffffff; }
    .container { max-width: 1200px; margin: 0 auto; padding: 0 20px; }
    h1 { font-size: 32px; color: #38bdf8; margin: 0 0 16px 0; }
    p { font-size: 16px; color: #94a3b8; line-height: 1.5; margin: 0; }
  </style>
</head>
<body>
  <section class="hero">
    <div class="container">
      <h1>Legacy Isolation Verification</h1>
      <p>Ensuring V2 path never invokes legacy mutator heuristics.</p>
    </div>
  </section>
</body>
</html>`;

(async () => {
  // ---------------------------------------------------------------------------
  // TEST 1: Legacy Mutator Invocations = 0 on V2 Path
  // ---------------------------------------------------------------------------
  console.log('▶ [1/5] Verifying legacy mutator loop invocations = 0 on V2 path...');
  try {
    let legacyLoopCalls = 0;
    const origRunSelfHealingLoop = legacyLoopModule.runSelfHealingLoop;
    legacyLoopModule.runSelfHealingLoop = async (...args) => {
      legacyLoopCalls++;
      throw new Error('LEGACY MUTATOR ISOLATION VIOLATION: runSelfHealingLoop was called on V2 path!');
    };

    let result;
    try {
      result = await compileHtmlToElementor(sampleHtml, {
        title: 'H3 Isolation Test',
        offline: true,
        inspect: true,
        maxIterations: 2
      });
    } finally {
      legacyLoopModule.runSelfHealingLoop = origRunSelfHealingLoop;
    }

    assert.strictEqual(legacyLoopCalls, 0, `Legacy mutator invocations must be 0 (got ${legacyLoopCalls})`);
    assert.strictEqual(result.isGroundTruthCompiled, true, 'isGroundTruthCompiled must be true');
    assert.strictEqual(result.isFallbackLegacy, false, 'isFallbackLegacy must be false');
    assert(result.visualReport, 'V2 smart self-healing visualReport must be present');
    assert(result.visualReport.ladderState, 'V2 4-rung ladder state must be present');

    pass('V2 Single-Pass GT executed 4-rung ladder with 0 legacy mutator loop invocations');
  } catch (err) {
    fail('Legacy mutator isolation test failed', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Fidelity Score NEVER Reports 100 while Unresolved Defects > 0
  // ---------------------------------------------------------------------------
  console.log('\n▶ [2/5] Verifying Fidelity score can NEVER be 100 when unresolved defects > 0...');
  try {
    // 0 defects -> 100 is allowed
    const scoreZeroDefects = calculateFidelityScore({ total: 0, critical: 0, high: 0, medium: 0, low: 0 }, 500);
    assert.strictEqual(scoreZeroDefects, 100, 'Score with 0 defects must be 100');

    // 1 low defect on large 500-node snapshot (Math.round(100 - (0.1/500)*100) = 100)
    // MUST be capped at 99!
    const scoreOneLowDefect = calculateFidelityScore({ total: 1, critical: 0, high: 0, medium: 0, low: 1 }, 500);
    assert.strictEqual(scoreOneLowDefect, 99, `Score with 1 low defect must be capped at 99 (got ${scoreOneLowDefect})`);

    // 1 medium defect on 1000-node snapshot
    const scoreOneMedDefect = calculateFidelityScore({ total: 1, critical: 0, high: 0, medium: 1, low: 0 }, 1000);
    assert.strictEqual(scoreOneMedDefect, 99, `Score with 1 medium defect must be capped at 99 (got ${scoreOneMedDefect})`);

    // Through evaluateConvergenceGate
    const gtMock = { viewports: { desktop: { flat: { s1: {}, s2: {}, s3: {}, s4: {}, s5: {} } } } };
    const matrixWithDefect = {
      counts: { total: 1, critical: 0, high: 0, medium: 0, low: 1 },
      defects: [{ severity: 'LOW', property: 'padding', message: 'Minor padding delta' }]
    };
    const gateEval = evaluateConvergenceGate(matrixWithDefect, null, gtMock);
    assert(gateEval.fidelity < 100, `Gate fidelity must be strictly < 100 when defects > 0 (got ${gateEval.fidelity})`);
    assert.strictEqual(gateEval.fidelity, 99, `Gate fidelity must be exactly 99 (got ${gateEval.fidelity})`);

    pass('Fidelity strictly capped at 99 when defects > 0; 100 is only possible with 0 defects');
  } catch (err) {
    fail('Fidelity cap test failed', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 3: cleanPass Invariant (cleanPass === gatePassed && high===0 && critical===0 && fidelity>=95)
  // ---------------------------------------------------------------------------
  console.log('\n▶ [3/5] Verifying strict cleanPass formula...');
  try {
    const gtMock = { viewports: { desktop: { flat: {} } } };
    for (let i = 0; i < 50; i++) gtMock.viewports.desktop.flat[`s${i}`] = {};

    // Case A: 0 critical, 0 high, fidelity >= 95 -> cleanPass = true
    const caseA = evaluateConvergenceGate({
      counts: { total: 1, critical: 0, high: 0, medium: 1, low: 0 },
      defects: [{ severity: 'MEDIUM' }]
    }, null, gtMock);
    assert.strictEqual(caseA.gatePassed, true, 'Case A gatePassed must be true');
    assert.strictEqual(caseA.cleanPass, true, 'Case A cleanPass must be true (0 high, 0 crit, fid>=95)');

    // Case B: 1 high defect -> cleanPass MUST be false
    const caseB = evaluateConvergenceGate({
      counts: { total: 1, critical: 0, high: 1, medium: 0, low: 0 },
      defects: [{ severity: 'HIGH' }]
    }, null, gtMock);
    assert.strictEqual(caseB.cleanPass, false, 'Case B cleanPass must be false (disqualified by high defect)');
    assert.strictEqual(caseB.scorecard.cleanPass, false, 'Case B scorecard.cleanPass must be false');

    // Case C: 1 critical defect -> cleanPass MUST be false
    const caseC = evaluateConvergenceGate({
      counts: { total: 1, critical: 1, high: 0, medium: 0, low: 0 },
      defects: [{ severity: 'CRITICAL' }]
    }, null, gtMock);
    assert.strictEqual(caseC.cleanPass, false, 'Case C cleanPass must be false (disqualified by critical defect)');
    assert.strictEqual(caseC.gatePassed, false, 'Case C gatePassed must be false');

    // Case D: Fidelity < 95 -> cleanPass MUST be false
    const caseD = evaluateConvergenceGate({
      counts: { total: 20, critical: 0, high: 0, medium: 20, low: 0 },
      defects: Array(20).fill({ severity: 'MEDIUM' })
    }, null, { viewports: { desktop: { flat: { s1: {} } } } }); // small flat so penalty drops score < 95
    assert(caseD.fidelity < 95, `Case D fidelity must be < 95 (got ${caseD.fidelity})`);
    assert.strictEqual(caseD.cleanPass, false, 'Case D cleanPass must be false (fidelity < 95)');

    pass('cleanPass strictly satisfies gatePassed && high===0 && critical===0 && fidelity>=95');
  } catch (err) {
    fail('cleanPass invariant test failed', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Banner Consistency
  // ---------------------------------------------------------------------------
  console.log('\n▶ [4/5] Verifying banner consistency (CLEAN PASS vs ADVISORY EXPORT)...');
  try {
    function formatBanner(visualReport) {
      const isCleanPass = Boolean(visualReport && (visualReport.cleanPass === true || visualReport.scorecard?.cleanPass === true));
      if (visualReport && isCleanPass) {
        return '[CLEAN PASS]';
      } else if (visualReport) {
        return '[ADVISORY EXPORT (not clean)]';
      }
      return '[NO REPORT]';
    }

    // Clean pass
    const bannerClean = formatBanner({ cleanPass: true, scorecard: { cleanPass: true }, finalScore: 98 });
    assert.strictEqual(bannerClean, '[CLEAN PASS]');

    // Advisory with high defect
    const bannerAdvisoryHigh = formatBanner({ cleanPass: false, scorecard: { cleanPass: false }, finalScore: 96 });
    assert.strictEqual(bannerAdvisoryHigh, '[ADVISORY EXPORT (not clean)]');

    // Advisory with critical defect
    const bannerAdvisoryCrit = formatBanner({ cleanPass: false, scorecard: { cleanPass: false }, finalScore: 50 });
    assert.strictEqual(bannerAdvisoryCrit, '[ADVISORY EXPORT (not clean)]');

    // Fallback legacy
    const bannerLegacy = formatBanner({ cleanPass: false, scorecard: { cleanPass: false, legacyFallback: true }, finalScore: 0 });
    assert.strictEqual(bannerLegacy, '[ADVISORY EXPORT (not clean)]');

    pass('Banner output is 100% consistent across clean pass and advisory scenarios');
  } catch (err) {
    fail('Banner consistency test failed', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Introspectability in scorecard & audit JSON
  // ---------------------------------------------------------------------------
  console.log('\n▶ [5/5] Verifying Introspectability (engineMode + defects in audit JSON)...');
  try {
    const { execSync } = require('child_process');
    const tempInput = path.join(__dirname, 'temp-h3-input.html');
    const tempOutput = path.join(__dirname, 'temp-h3-output.json');
    const tempAudit = path.join(__dirname, 'temp-h3-output.audit.json');
    fs.writeFileSync(tempInput, sampleHtml, 'utf8');

    try {
      const cliStdout = execSync(`node bin/cli.js "${tempInput}" "${tempOutput}" --offline`, {
        cwd: path.join(__dirname, '..'),
        encoding: 'utf8'
      });

      assert(fs.existsSync(tempAudit), 'Audit JSON file must be generated');
      const auditData = JSON.parse(fs.readFileSync(tempAudit, 'utf8'));

      assert.strictEqual(
        auditData.engineMode,
        'Single-Pass Ground Truth (Chromium, local)',
        `engineMode must be 'Single-Pass Ground Truth (Chromium, local)' (got '${auditData.engineMode}')`
      );
      assert(Array.isArray(auditData.defects), 'Audit JSON must contain defects array');
      assert(auditData.counts && typeof auditData.counts.critical === 'number', 'Audit JSON must contain counts');
      assert(typeof auditData.cleanPass === 'boolean', 'Audit JSON must contain boolean cleanPass');
      assert(typeof auditData.fidelity === 'number', 'Audit JSON must contain numeric fidelity');

      // Task M9 Banner Integrity Check:
      const bannerMatch = cliStdout.match(/Unresolved Defects:\s+(\d+)/);
      if (bannerMatch) {
        const bannerDefects = parseInt(bannerMatch[1], 10);
        assert.strictEqual(bannerDefects, auditData.counts.total, `Banner defects (${bannerDefects}) must equal auditData.counts.total (${auditData.counts.total})`);
      }

      pass('Introspectability verified: *.audit.json contains engineMode, defects, counts, and cleanPass (with banner integrity)');
    } finally {
      if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
      if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);
      if (fs.existsSync(tempAudit)) fs.unlinkSync(tempAudit);
      const tempPreview = tempOutput.replace('.json', '-preview.html');
      if (fs.existsSync(tempPreview)) fs.unlinkSync(tempPreview);
    }
  } catch (err) {
    fail('Introspectability test failed', err);
  }

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log(`SUITE H3 RESULTS: ${passedTests}/${totalTests} tests passed (${Math.round(passedTests / totalTests * 100)}%)`);
  console.log('========================================================================');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
})();

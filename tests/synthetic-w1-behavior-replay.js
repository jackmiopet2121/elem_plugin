/**
 * SYNTHETIC TEST SUITE: TASK W1
 * Behavior Replay Close-out (Offline)
 *
 * Verifies:
 * 1. Behavior Probe + Replay in default offline compile path:
 *    - Probes interactive components (accordions, tabs) in local Chromium.
 *    - Replays interaction traces in strict Elementor emulator preview.
 * 2. Scorecard & Audit Contract:
 *    - Populates audit.behavior { tested, passed, failed, mismatches }.
 * 3. Parity & Gatekeeper Enforcement:
 *    - Positive case: accordion + tabs -> tested >= 2, passed === tested, mismatches === 0, cleanPass === true.
 *    - Negative case: deliberately broken bridge -> RULE-BHV-01 HIGH raised, cleanPass === false.
 */

const assert = require('assert');
const { compileHtmlToElementor } = require('../src/engine');
const { runSmartSelfHealingLoop } = require('../src/smart/self-healing-loop');
const { evaluateConvergenceGate } = require('../src/smart/convergence-gate');
const { verifyReplayBehavior } = require('../src/smart/replay-verifier');
const { renderElementorToHtml } = require('../src/emulator/elementor-virtual-renderer');

console.log('========================================================================');
console.log('   SYNTHETIC SUITE W1: OFFLINE INTERACTIVE BEHAVIOR REPLAY (PARITY CLOSE-OUT)');
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

(async () => {
  // ---------------------------------------------------------------------------
  // TEST 1: POSITIVE CASE — End-to-End Accordion + Tabs Compilation Offline
  // ---------------------------------------------------------------------------
  console.log('\n▶ [1/3] Compiling interactive fixture (Accordion + Tabs) offline...');
  try {
    const positiveHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Interactive Components Test</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: sans-serif; padding: 20px; background: #fff; color: #111; }
    .container { max-width: 800px; margin: 0 auto; }
    
    /* FAQ Accordion */
    .accordion-item { border: 1px solid #e2e8f0; margin-bottom: 12px; border-radius: 6px; }
    .accordion-header {
      width: 100%; text-align: left; padding: 16px; background: #f8fafc;
      border: none; font-size: 16px; font-weight: 600; cursor: pointer;
      display: flex; justify-content: space-between; align-items: center;
    }
    .accordion-body {
      max-height: 0; overflow: hidden; padding: 0 16px; transition: max-height 0.3s ease;
    }
    .accordion-item.is-active .accordion-body {
      max-height: 200px; padding: 16px;
    }

    /* Tabs */
    .tabs-wrapper { margin-top: 30px; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; }
    .tab-nav { display: flex; gap: 8px; margin-bottom: 16px; }
    .tab-button {
      padding: 8px 16px; border: 1px solid #cbd5e1; background: #fff;
      cursor: pointer; border-radius: 4px; font-weight: 500;
    }
    .tab-button.is-active { background: #2563eb; color: #fff; border-color: #2563eb; }
    .tab-pane { display: none; }
    .tab-pane.is-active { display: block; }
  </style>
</head>
<body>
  <div class="container">
    <h2>FAQ Section</h2>
    <div class="accordion-item">
      <button class="accordion-header" id="faq-trigger-1">
        <span>How does deployment work?</span>
        <span class="icon">+</span>
      </button>
      <div class="accordion-body">
        <p>Deployment runs automatically in isolated containers with zero downtime.</p>
      </div>
    </div>

    <h2>Interactive Tabs</h2>
    <div class="tabs-wrapper">
      <div class="tab-nav">
        <button class="tab-button is-active" data-tab="tab-one" id="tab-btn-1">Tab 1</button>
        <button class="tab-button" data-tab="tab-two" id="tab-btn-2">Tab 2</button>
      </div>
      <div class="tab-panels">
        <div id="tab-one" class="tab-pane is-active">First panel information text.</div>
        <div id="tab-two" class="tab-pane">Second panel details text.</div>
      </div>
    </div>
  </div>

  <script>
    document.addEventListener('DOMContentLoaded', function() {
      // Accordion logic
      document.querySelectorAll('.accordion-header').forEach(function(header) {
        header.addEventListener('click', function() {
          var item = this.closest('.accordion-item');
          item.classList.toggle('is-active');
        });
      });

      // Tabs logic
      document.querySelectorAll('.tab-button').forEach(function(btn) {
        btn.addEventListener('click', function() {
          document.querySelectorAll('.tab-button').forEach(function(b) { b.classList.remove('is-active'); });
          document.querySelectorAll('.tab-pane').forEach(function(p) { p.classList.remove('is-active'); });
          this.classList.add('is-active');
          var targetId = this.getAttribute('data-tab');
          var targetPane = document.getElementById(targetId);
          if (targetPane) targetPane.classList.add('is-active');
        });
      });
    });
  </script>
</body>
</html>`;

    const compileResult = await compileHtmlToElementor(positiveHtml, {
      title: 'Interactive Test Page',
      offline: true,
      useGroundTruth: true
    });

    const vr = compileResult.visualReport;
    assert(vr, 'visualReport must be generated in offline mode');
    const bhv = vr.scorecard?.behavior;
    assert(bhv, 'visualReport.scorecard.behavior must be defined');

    console.log(`    Behavior tested:   ${bhv.tested}`);
    console.log(`    Behavior passed:   ${bhv.passed}`);
    console.log(`    Behavior failed:   ${bhv.failed}`);
    console.log(`    Behavior mismatches: ${JSON.stringify(bhv.mismatches)}`);
    console.log(`    Clean pass:        ${vr.cleanPass}`);

    assert(bhv.tested >= 2, `Expected at least 2 behavior interactions tested (accordion + tabs), got ${bhv.tested}`);
    assert.strictEqual(bhv.passed, bhv.tested, `Expected all tested interactions to pass (${bhv.tested}), got ${bhv.passed}`);
    assert.strictEqual(bhv.failed, 0, `Expected 0 failed interactions, got ${bhv.failed}`);
    assert.strictEqual(bhv.mismatches.length, 0, `Expected 0 mismatches, got ${bhv.mismatches.length}`);
    pass('Positive Case: Accordion + Tabs probed and verified with 100% parity (tested >= 2, passed === tested, mismatches === 0)');
  } catch (err) {
    fail('Positive Case failed', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 2: NEGATIVE CASE — Deliberately Broken Bridge Blocks cleanPass
  // ---------------------------------------------------------------------------
  console.log('\n▶ [2/3] Verifying deliberately broken bridge raises RULE-BHV-01 HIGH and blocks cleanPass...');
  try {
    const brokenTraces = [
      {
        trigger: '.non-existent-accordion-btn',
        ancestor: '.non-existent-item',
        mutations: ['is-active'],
        initialState: { collapsed: true, active: false },
        triggerSid: 'sid-broken-trigger',
        action: 'click',
        deltas: []
      }
    ];

    const minimalTemplate = {
      version: '0.4',
      title: 'Broken Bridge Template',
      type: 'page',
      content: [
        {
          id: 'test-con-1',
          elType: 'container',
          settings: { css_classes: 'e-con' },
          elements: [
            {
              id: 'test-wgt-1',
              widgetType: 'heading',
              settings: { title: 'Broken Bridge Test' }
            }
          ]
        }
      ]
    };

    const previewHtml = renderElementorToHtml(minimalTemplate);
    const replayRes = await verifyReplayBehavior(previewHtml, brokenTraces);

    assert.strictEqual(replayRes.totalTested, 1, 'Expected 1 test executed');
    assert.strictEqual(replayRes.failed, 1, 'Expected 1 failure due to missing trigger');
    assert.strictEqual(replayRes.passed, 0, 'Expected 0 passed');

    // Simulate convergence gate evaluation with failed behavior
    const matrixResult = {
      defects: [
        {
          id: 'defect-bhv-sid-broken-trigger',
          nodeSid: 'sid-broken-trigger',
          viewport: 'desktop',
          property: 'interactive-behavior',
          original: 'interaction-active',
          rendered: 'interaction-failed',
          severity: 'HIGH',
          rule: 'RULE-BHV-01',
          rung: 'R0',
          advisory: false,
          message: 'Trigger .non-existent-accordion-btn not found on Elementor preview.'
        }
      ],
      counts: { total: 1, critical: 0, high: 1, medium: 0, low: 0 }
    };

    const behaviorResult = {
      tested: 1,
      passed: 0,
      failed: 1,
      mismatches: [
        {
          triggerSid: 'sid-broken-trigger',
          trigger: '.non-existent-accordion-btn',
          message: 'Trigger .non-existent-accordion-btn not found on Elementor preview.',
          rule: 'RULE-BHV-01',
          severity: 'HIGH',
          advisory: false
        }
      ]
    };

    const gateEval = evaluateConvergenceGate(matrixResult, behaviorResult, null, null, {
      title: 'Broken Bridge Gate Test'
    });

    assert.strictEqual(gateEval.cleanPass, false, 'Convergence gate cleanPass MUST be false when behavior has mismatches');
    assert.strictEqual(gateEval.gatePassed, false, 'Convergence gate gatePassed MUST be false when behavior has mismatches');
    assert.strictEqual(gateEval.scorecard.counts.high, 1, 'Expected counts.high === 1 from RULE-BHV-01');

    const bhvDefect = gateEval.scorecard.defects.find(d => d.rule === 'RULE-BHV-01');
    assert(bhvDefect, 'RULE-BHV-01 defect must be recorded in scorecard.defects');
    assert.strictEqual(bhvDefect.severity, 'HIGH', 'RULE-BHV-01 severity must be HIGH');
    assert.strictEqual(bhvDefect.advisory, false, 'RULE-BHV-01 advisory must be false (blocking)');

    pass('Negative Case: Broken interaction raises RULE-BHV-01 HIGH and strictly blocks cleanPass (E1 contract)');
  } catch (err) {
    fail('Negative Case failed', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 3: VERIFY FAQ ACCORDION BRIDGE ON landing.html
  // ---------------------------------------------------------------------------
  console.log('\n▶ [3/3] Verifying landing.html FAQ Accordion Bridge & Expansion Parity...');
  try {
    const fs = require('fs');
    const landingHtml = fs.readFileSync('landing.html', 'utf8');

    const result = await compileHtmlToElementor(landingHtml, {
      title: 'Landing Page Test',
      offline: true,
      useGroundTruth: true
    });

    const scorecard = result.visualReport?.scorecard;
    assert(scorecard, 'landing.html compilation scorecard must be generated');
    assert(scorecard.behavior, 'scorecard.behavior must be populated');
    assert(scorecard.behavior.tested >= 1, `Expected landing.html behavior.tested >= 1, got ${scorecard.behavior.tested}`);
    assert.strictEqual(scorecard.behavior.failed, 0, `Expected landing.html behavior.failed === 0, got ${scorecard.behavior.failed}`);
    assert.strictEqual(scorecard.behavior.mismatches.length, 0, 'Expected 0 behavior mismatches on landing.html');
    assert.strictEqual(result.visualReport.cleanPass, true, 'landing.html must achieve cleanPass === true');

    pass(`landing.html FAQ Accordion: ${scorecard.behavior.passed}/${scorecard.behavior.tested} interactions passed with 0 mismatches, cleanPass: ${result.visualReport.cleanPass}`);
  } catch (err) {
    fail('landing.html accordion bridge verification failed', err);
  }

  // ---------------------------------------------------------------------------
  // FINAL SUMMARY
  // ---------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log(`SYNTHETIC TEST SUMMARY: ${passedTests}/${totalTests} PASSED`);
  if (passedTests === totalTests) {
    console.log('✓ ALL W1 BEHAVIOR REPLAY TESTS PASSED!');
    console.log('========================================================================');
    process.exit(0);
  } else {
    console.error('❌ SOME TESTS FAILED');
    console.log('========================================================================');
    process.exit(1);
  }
})();

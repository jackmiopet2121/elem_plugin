/**
 * Block 8.2 — Phase 5 (Part 1): Container Surface Verification Test Suite.
 *
 * Verifies:
 * 1. Opaque source/render match -> zero surface defects.
 * 2. Source transparent/render white -> HIGH defect.
 * 3. Source rgba/render alpha mkhtalef -> HIGH defect.
 * 4. Source solid/render color mkhtalef -> exactly one surface defect, zero duplicate RULE-CLR-02.
 * 5. Source none/render gradient -> HIGH defect.
 * 6. Source gradient/render none -> HIGH defect.
 * 7. Source gradient/render gradient -> explicit unverified HIGH defect, not a fake pass.
 * 8. Missing render SID or modern style ref/property -> HIGH defect.
 * 9. Synthetic root without GT SID -> zero invented surface comparison.
 * 10. Real Chromium mini fixture: body dark, section transparent, card alpha; live pipeline audit & honest report.
 */

'use strict';

const assert = require('assert');
const { auditVerificationMatrix } = require('../src/smart/verification-matrix');
const { captureGroundTruth } = require('../src/smart/style-snapshot');
const { compileHtmlToElementor } = require('../src/engine');
const { renderElementorToHtml } = require('../src/emulator/elementor-virtual-renderer');
const { captureRenderSnapshot } = require('../src/smart/render-snapshot');

(async () => {
  console.log('========================================================================');
  console.log('BLOCK 8.2 — PHASE 5 (PART 1): CONTAINER SURFACE VERIFICATION');
  console.log('========================================================================\n');

  let totalTests = 0;
  let passedTests = 0;

  function runTest(name, fn) {
    totalTests++;
    try {
      fn();
      passedTests++;
      console.log(`  ✓ [TEST ${totalTests}] ${name}`);
    } catch (err) {
      console.error(`  ✖ [TEST ${totalTests}] ${name} FAILED:`, err.message);
      throw err;
    }
  }

  async function runAsyncTest(name, fn) {
    totalTests++;
    try {
      await fn();
      passedTests++;
      console.log(`  ✓ [TEST ${totalTests}] ${name}`);
    } catch (err) {
      console.error(`  ✖ [TEST ${totalTests}] ${name} FAILED:`, err.message);
      throw err;
    }
  }

  function make3VpCanvas(canvasConfig = {}) {
    const makeVp = () => ({
      html: Object.assign({ backgroundColor: 'transparent', backgroundImage: 'none', opacity: '1' }, canvasConfig.html || {}),
      body: Object.assign({ backgroundColor: 'transparent', backgroundImage: 'none', opacity: '1' }, canvasConfig.body || {})
    });
    return {
      desktop: makeVp(),
      tablet: makeVp(),
      mobile: makeVp()
    };
  }

  function make3VpGtSnapshot({
    sid,
    tag = 'div',
    role = 'container',
    bgColor = 'rgba(0, 0, 0, 0)',
    bgImage = 'none',
    computedStyleRef = null,
    styleDict = undefined,
    canvasConfig = {}
  } = {}) {
    const ref = computedStyleRef || `ref-${sid}`;
    let dict;
    if (styleDict !== undefined) {
      dict = styleDict;
    } else {
      dict = {
        [ref]: {
          'background-color': bgColor,
          'background-image': bgImage
        }
      };
    }
    const node = {
      sid,
      tag,
      role,
      rect: { x: 0, y: 0, w: 800, h: 200 },
      styles: {
        backgroundColor: bgColor,
        backgroundImage: bgImage,
        display: 'block'
      },
      computedStyleRef: ref
    };
    const canvas = make3VpCanvas(canvasConfig);
    const makeVp = () => ({
      canvas: canvas.desktop,
      flat: { [sid]: node },
      styleDictionary: dict
    });
    return {
      annotatedHtml: `<html><body><div data-sid="${sid}"></div></body></html>`,
      fonts: [],
      viewports: {
        desktop: makeVp(),
        tablet: makeVp(),
        mobile: makeVp()
      }
    };
  }

  function make3VpRenderSnapshot({
    sid,
    widgetId = 'w1',
    bgColor = 'rgba(0, 0, 0, 0)',
    bgImage = 'none',
    canvasBg = 'transparent',
    canvasImg = 'none',
    missingSid = false,
    missingStyles = false
  } = {}) {
    let node = null;
    if (!missingSid) {
      node = {
        sid,
        widgetId,
        rect: { x: 0, y: 0, w: 800, h: 200 },
        styles: missingStyles ? null : {
          backgroundColor: bgColor,
          backgroundImage: bgImage,
          display: 'block'
        }
      };
    }
    const flat = node ? { [sid]: node } : {};
    const makeVp = () => ({
      flat,
      duplicateSids: [],
      canvas: {
        body: {
          backgroundColor: canvasBg,
          backgroundImage: canvasImg
        }
      }
    });
    return {
      viewports: {
        desktop: makeVp(),
        tablet: makeVp(),
        mobile: makeVp()
      }
    };
  }

  function makeTemplate(sid, widgetId = 'w1', settings = {}) {
    return {
      title: 'Container Surface Test',
      page_settings: {},
      content: [
        {
          _sid: sid,
          id: widgetId,
          elType: 'container',
          settings: Object.assign({ _sid: sid }, settings),
          elements: []
        }
      ]
    };
  }

  // ---------------------------------------------------------------------------
  // Test 1: Opaque source / render match -> zero surface defects
  // ---------------------------------------------------------------------------
  console.log('▶ [TEST 1] Opaque Source / Render Match');

  runTest('1. Opaque source/render match -> zero surface defects', () => {
    const gt = make3VpGtSnapshot({ sid: 'c1', bgColor: 'rgb(220, 38, 38)', bgImage: 'none' });
    const render = make3VpRenderSnapshot({ sid: 'c1', bgColor: 'rgb(220, 38, 38)', bgImage: 'none' });
    const tpl = makeTemplate('c1', 'w1');

    const result = auditVerificationMatrix(gt, render, tpl);
    const surfaceDefects = result.defects.filter(d => d.rule === 'RULE-SURFACE-01');

    assert.strictEqual(surfaceDefects.length, 0, `Expected 0 surface defects on exact match, got: ${surfaceDefects.length}`);
  });

  // ---------------------------------------------------------------------------
  // Test 2: Source transparent / render white -> HIGH defect
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 2] Source Transparent / Render White');

  runTest('2. Source transparent/render white -> HIGH defect', () => {
    const gt = make3VpGtSnapshot({ sid: 'c1', bgColor: 'rgba(0, 0, 0, 0)', bgImage: 'none' });
    const render = make3VpRenderSnapshot({ sid: 'c1', bgColor: 'rgb(255, 255, 255)', bgImage: 'none' });
    const tpl = makeTemplate('c1', 'w1');

    const result = auditVerificationMatrix(gt, render, tpl);
    const surfaceDefects = result.defects.filter(d => d.rule === 'RULE-SURFACE-01');

    assert(surfaceDefects.length > 0, 'Must emit RULE-SURFACE-01 defect when transparent source renders white');
    const defect = surfaceDefects[0];
    assert.strictEqual(defect.severity, 'HIGH');
    assert.strictEqual(defect.advisory, false);
    assert.strictEqual(defect.property, 'backgroundColor');
    assert.strictEqual(defect.original, 'rgba(0, 0, 0, 0)');
    assert.strictEqual(defect.rendered, 'rgb(255, 255, 255)');
  });

  // ---------------------------------------------------------------------------
  // Test 3: Source rgba / render alpha mkhtalef -> HIGH defect
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 3] Source RGBA / Render Alpha Mismatch');

  runTest('3. Source rgba/render alpha mkhtalef -> HIGH defect', () => {
    const gt = make3VpGtSnapshot({ sid: 'c1', bgColor: 'rgba(0, 0, 0, 0.4)', bgImage: 'none' });
    const render = make3VpRenderSnapshot({ sid: 'c1', bgColor: 'rgba(0, 0, 0, 0.8)', bgImage: 'none' });
    const tpl = makeTemplate('c1', 'w1');

    const result = auditVerificationMatrix(gt, render, tpl);
    const surfaceDefects = result.defects.filter(d => d.rule === 'RULE-SURFACE-01');

    assert(surfaceDefects.length > 0, 'Must emit defect when alpha values differ significantly');
    const defect = surfaceDefects[0];
    assert.strictEqual(defect.severity, 'HIGH');
    assert.strictEqual(defect.property, 'backgroundColor');
    assert.strictEqual(defect.original, 'rgba(0, 0, 0, 0.4)');
    assert.strictEqual(defect.rendered, 'rgba(0, 0, 0, 0.8)');
  });

  // ---------------------------------------------------------------------------
  // Test 4: Source solid / render color mkhtalef -> 1 surface defect, 0 duplicate RULE-CLR-02
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 4] Color Mismatch Isolation (Zero Duplicate RULE-CLR-02)');

  runTest('4. Source solid/render color mkhtalef -> wa7ed surface defect, bla duplicate RULE-CLR-02', () => {
    const gt = make3VpGtSnapshot({ sid: 'c1', bgColor: 'rgb(255, 0, 0)', bgImage: 'none' });
    const render = make3VpRenderSnapshot({ sid: 'c1', bgColor: 'rgb(0, 255, 0)', bgImage: 'none' });
    const tpl = makeTemplate('c1', 'w1');

    const result = auditVerificationMatrix(gt, render, tpl);
    const surfaceDefects = result.defects.filter(d => d.rule === 'RULE-SURFACE-01' && d.viewport === 'desktop');
    const clrDefects = result.defects.filter(d => d.rule === 'RULE-CLR-02' && d.nodeSid === 'c1');

    assert.strictEqual(surfaceDefects.length, 1, `Must emit exactly 1 surface defect at desktop, got: ${surfaceDefects.length}`);
    assert.strictEqual(clrDefects.length, 0, `Must NOT emit duplicate RULE-CLR-02 defect on container, got: ${clrDefects.length}`);
    assert.strictEqual(surfaceDefects[0].property, 'backgroundColor');
    assert.strictEqual(surfaceDefects[0].original, 'rgb(255, 0, 0)');
    assert.strictEqual(surfaceDefects[0].rendered, 'rgb(0, 255, 0)');
  });

  // ---------------------------------------------------------------------------
  // Test 5: Source none / render gradient -> HIGH defect
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 5] Source None / Render Gradient');

  runTest('5. Source none/render gradient -> HIGH defect', () => {
    const gt = make3VpGtSnapshot({ sid: 'c1', bgColor: 'rgba(0, 0, 0, 0)', bgImage: 'none' });
    const render = make3VpRenderSnapshot({
      sid: 'c1',
      bgColor: 'rgba(0, 0, 0, 0)',
      bgImage: 'linear-gradient(to right, rgb(0, 0, 0), rgb(255, 255, 255))'
    });
    const tpl = makeTemplate('c1', 'w1');

    const result = auditVerificationMatrix(gt, render, tpl);
    const surfaceDefects = result.defects.filter(d => d.rule === 'RULE-SURFACE-01');

    assert(surfaceDefects.length > 0, 'Must emit defect when rendered container has unexpected gradient');
    const defect = surfaceDefects.find(d => d.property === 'backgroundImage');
    assert(defect, 'Must find defect for property backgroundImage');
    assert.strictEqual(defect.severity, 'HIGH');
    assert.strictEqual(defect.original, 'none');
    assert(defect.rendered.includes('linear-gradient'));
  });

  // ---------------------------------------------------------------------------
  // Test 6: Source gradient / render none -> HIGH defect
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 6] Source Gradient / Render None');

  runTest('6. Source gradient/render none -> HIGH defect', () => {
    const gt = make3VpGtSnapshot({
      sid: 'c1',
      bgColor: 'rgba(0, 0, 0, 0)',
      bgImage: 'linear-gradient(to right, rgb(0, 0, 0), rgb(255, 255, 255))'
    });
    const render = make3VpRenderSnapshot({ sid: 'c1', bgColor: 'rgba(0, 0, 0, 0)', bgImage: 'none' });
    const tpl = makeTemplate('c1', 'w1');

    const result = auditVerificationMatrix(gt, render, tpl);
    const surfaceDefects = result.defects.filter(d => d.rule === 'RULE-SURFACE-01');

    assert(surfaceDefects.length > 0, 'Must emit defect when GT gradient is missing in render');
    const defect = surfaceDefects.find(d => d.property === 'backgroundImage');
    assert(defect, 'Must find defect for property backgroundImage');
    assert.strictEqual(defect.severity, 'HIGH');
    assert.strictEqual(defect.rendered, 'none');
    assert(defect.original.includes('linear-gradient'));
  });

  // ---------------------------------------------------------------------------
  // Test 7: Source gradient / render gradient -> explicit unverified HIGH defect
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 7] Source Gradient / Render Gradient (Unverified Invariant)');

  runTest('7. Source gradient/render gradient -> explicit unverified HIGH, machi fake pass', () => {
    const grad = 'linear-gradient(to right, rgb(0, 0, 0), rgb(255, 255, 255))';
    const gt = make3VpGtSnapshot({ sid: 'c1', bgColor: 'rgba(0, 0, 0, 0)', bgImage: grad });
    const render = make3VpRenderSnapshot({ sid: 'c1', bgColor: 'rgba(0, 0, 0, 0)', bgImage: grad });
    const tpl = makeTemplate('c1', 'w1');

    const result = auditVerificationMatrix(gt, render, tpl);
    const surfaceDefects = result.defects.filter(d => d.rule === 'RULE-SURFACE-01');

    assert(surfaceDefects.length > 0, 'Must NOT grant fake pass when gradient is unverified in Part 1');
    const defect = surfaceDefects.find(d => d.property === 'backgroundImage');
    assert(defect, 'Must find defect for property backgroundImage');
    assert.strictEqual(defect.severity, 'HIGH');
    assert.strictEqual(defect.advisory, false);
    assert(defect.message.includes('Unverified surface'), `Message must state unverified surface, got: ${defect.message}`);
  });

  // ---------------------------------------------------------------------------
  // Test 8: Missing render SID or modern style ref/property -> HIGH defect
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 8] Missing Render SID or Modern Style Dictionary Ref/Property');

  runTest('8.1. Missing render SID in render snapshot -> HIGH defect', () => {
    const gt = make3VpGtSnapshot({ sid: 'c1', bgColor: 'rgb(220, 38, 38)', bgImage: 'none' });
    const render = make3VpRenderSnapshot({ sid: 'c1', missingSid: true });
    const tpl = makeTemplate('c1', 'w1');

    const result = auditVerificationMatrix(gt, render, tpl);
    const surfaceDefects = result.defects.filter(d => d.rule === 'RULE-SURFACE-01');

    assert(surfaceDefects.length > 0, 'Must emit defect when container SID is missing from render snapshot');
    const defect = surfaceDefects.find(d => d.property === 'surface');
    assert(defect, 'Must find surface defect');
    assert.strictEqual(defect.severity, 'HIGH');
    assert.strictEqual(defect.rendered, 'missing');
  });

  runTest('8.2. Modern snapshot missing computedStyleRef entry -> explicit HIGH defect', () => {
    // styleDictionary is present but does not have entry for ref-c1
    const gt = make3VpGtSnapshot({ sid: 'c1', bgColor: 'rgb(220, 38, 38)', bgImage: 'none', styleDict: {} });
    const render = make3VpRenderSnapshot({ sid: 'c1', bgColor: 'rgb(220, 38, 38)', bgImage: 'none' });
    const tpl = makeTemplate('c1', 'w1');

    const result = auditVerificationMatrix(gt, render, tpl);
    const surfaceDefects = result.defects.filter(d => d.rule === 'RULE-SURFACE-01');

    assert(surfaceDefects.length > 0, 'Must emit explicit defect when styleDictionary entry is missing');
    const defect = surfaceDefects[0];
    assert.strictEqual(defect.severity, 'HIGH');
    assert(defect.rendered.includes('FULL_STYLE_REF_MISSING') || defect.message.includes('FULL_STYLE_REF_MISSING'));
  });

  runTest('8.3. Modern snapshot missing background-color property -> explicit HIGH defect', () => {
    // styleDictionary has entry, but missing 'background-color'
    const gt = make3VpGtSnapshot({
      sid: 'c1',
      styleDict: {
        'ref-c1': {
          'background-image': 'none'
        }
      }
    });
    const render = make3VpRenderSnapshot({ sid: 'c1', bgColor: 'rgb(220, 38, 38)', bgImage: 'none' });
    const tpl = makeTemplate('c1', 'w1');

    const result = auditVerificationMatrix(gt, render, tpl);
    const surfaceDefects = result.defects.filter(d => d.rule === 'RULE-SURFACE-01');

    assert(surfaceDefects.length > 0, 'Must emit explicit defect when property is missing in styleDictionary');
    const defect = surfaceDefects.find(d => d.property === 'backgroundColor');
    assert(defect, 'Must find backgroundColor defect');
    assert.strictEqual(defect.severity, 'HIGH');
    assert(defect.rendered.includes('FULL_STYLE_PROPERTY_MISSING') || defect.message.includes('FULL_STYLE_PROPERTY_MISSING'));
  });

  // ---------------------------------------------------------------------------
  // Test 9: Synthetic root container without GT SID -> zero invented comparison
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 9] Synthetic Root Container (No Invented Comparison)');

  runTest('9. Synthetic root container without GT SID -> zero invented surface comparison', () => {
    const gt = make3VpGtSnapshot({ sid: 'c1', bgColor: 'rgb(220, 38, 38)', bgImage: 'none' });
    const render = make3VpRenderSnapshot({ sid: 'c1', bgColor: 'rgb(220, 38, 38)', bgImage: 'none' });
    // Template has a synthetic wrapper without a SID, wrapping c1
    const tpl = {
      title: 'Synthetic Wrapper Test',
      page_settings: {},
      content: [
        {
          id: 'synthetic-root',
          elType: 'container',
          settings: {}, // NO _sid !
          elements: [
            {
              _sid: 'c1',
              id: 'w1',
              elType: 'container',
              settings: { _sid: 'c1' },
              elements: []
            }
          ]
        }
      ]
    };

    const result = auditVerificationMatrix(gt, render, tpl);
    const surfaceDefects = result.defects.filter(d => d.rule === 'RULE-SURFACE-01');

    assert.strictEqual(surfaceDefects.length, 0, 'Synthetic root container without SID must not trigger any surface defect');
  });

  // ---------------------------------------------------------------------------
  // Test 10: Real Chromium mini fixture: body dark, section transparent, card alpha
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 10] Real Chromium Mini Fixture (Live Pipeline & Honest Defect Report)');

  await runAsyncTest('10. Real Chromium mini fixture: body dark, section transparent, card alpha', async () => {
    const miniHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      background-color: rgb(15, 23, 42);
      margin: 0;
      padding: 0;
    }
    .main-section {
      background-color: transparent;
      padding: 32px;
      box-sizing: border-box;
    }
    .alpha-card {
      background-color: rgba(255, 255, 255, 0.1);
      padding: 24px;
      border-radius: 8px;
      color: rgb(255, 255, 255);
      box-sizing: border-box;
    }
  </style>
</head>
<body>
  <section class="main-section" id="sec-root">
    <div class="alpha-card" id="card-box">
      <h2>Alpha Card Title</h2>
      <p>Card content inside transparent section.</p>
    </div>
  </section>
</body>
</html>`;

    console.log('    • Capturing real Ground Truth snapshot with Chromium...');
    const gtSnapshot = await captureGroundTruth(miniHtml, { cache: false });
    assert(gtSnapshot?.viewports?.desktop?.canvas?.body, 'Real GT must capture canvas.body');
    assert.strictEqual(gtSnapshot.viewports.desktop.canvas.body.backgroundColor, 'rgb(15, 23, 42)');

    console.log('    • Compiling HTML to Elementor template...');
    const compileResult = await compileHtmlToElementor(miniHtml, {
      offline: true,
      useAi: false,
      inspect: false,
      probeBehavior: false,
      behaviorTraces: [],
      captureGroundTruth: async () => gtSnapshot
    });

    assert(compileResult?.templateJson?.page_settings, 'Compilation must produce page_settings');
    assert.strictEqual(compileResult.templateJson.page_settings.background_background, 'classic');
    assert.strictEqual(compileResult.templateJson.page_settings.background_color, 'rgb(15, 23, 42)');

    console.log('    • Rendering Elementor template to HTML...');
    const previewHtml = renderElementorToHtml(compileResult.templateJson, { fonts: gtSnapshot.fonts });

    console.log('    • Capturing render snapshot with Chromium...');
    const renderSnapshot = await captureRenderSnapshot(previewHtml);

    console.log('    • Running Per-Widget Verification Matrix Audit...');
    const matrixResult = auditVerificationMatrix(gtSnapshot, renderSnapshot, compileResult.templateJson);

    const canvasDefects = matrixResult.defects.filter(d => d.rule === 'RULE-CANVAS-01');
    const surfaceDefects = matrixResult.defects.filter(d => d.rule === 'RULE-SURFACE-01');

    console.log(`    • Canvas defects (RULE-CANVAS-01): ${canvasDefects.length}`);
    console.log(`    • Surface defects (RULE-SURFACE-01): ${surfaceDefects.length}`);
    console.log(`    • Total defects across all rules: ${matrixResult.defects.length}`);
    console.log(`    • Health Score: ${matrixResult.healthScore}/100`);

    if (surfaceDefects.length > 0) {
      console.log('    • Surface Defect Records:');
      for (const d of surfaceDefects) {
        console.log(`      - [${d.severity}] ${d.property} at ${d.viewport} (SID: ${d.nodeSid}): expected "${d.original}", got "${d.rendered}" — ${d.message}`);
      }
    }

    // Canvas parity must be 0 defects because body color is mapped natively into page_settings
    assert.strictEqual(canvasDefects.length, 0, `RULE-CANVAS-01 should have 0 defects, got: ${canvasDefects.length}`);

    // In Part 1, we assert that the audit executed honestly without crashing and produced standard defect records
    assert(Array.isArray(surfaceDefects), 'Surface defects must be an array');
    for (const d of surfaceDefects) {
      assert.strictEqual(d.rule, 'RULE-SURFACE-01');
      assert.strictEqual(d.severity, 'HIGH');
      assert.strictEqual(d.advisory, false);
    }
  });

  // ---------------------------------------------------------------------------
  // Test 11: Missing render backgroundImage yields missing_render_background_image defect
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 11] Missing Render backgroundImage -> missing_render_background_image');

  runTest('11. Missing render backgroundImage yields missing_render_background_image defect', () => {
    const gt = make3VpGtSnapshot({ sid: 'c11', bgColor: 'rgb(255, 255, 255)', bgImage: 'none' });
    const render = make3VpRenderSnapshot({ sid: 'c11', bgColor: 'rgb(255, 255, 255)', bgImage: '' });
    const tpl = makeTemplate('c11', 'w11');

    const result = auditVerificationMatrix(gt, render, tpl);
    const defects = result.defects.filter(d => d.nodeSid === 'c11' && d.rule === 'RULE-SURFACE-01' && d.property === 'backgroundImage');

    assert.strictEqual(defects.length, 3, `Expected 3 defects (1 per viewport), got ${defects.length}`);
    for (const d of defects) {
      assert.strictEqual(d.severity, 'HIGH');
      assert.strictEqual(d.rendered, 'missing_render_background_image');
      assert.strictEqual(d.original, 'none');
    }
  });

  // ---------------------------------------------------------------------------
  // Test 12: Alpha 0.40 vs 0.42 yields HIGH defect (strict alpha comparison)
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 12] Alpha 0.40 vs 0.42 -> HIGH defect');

  runTest('12. Alpha 0.40 vs 0.42 yields HIGH defect', () => {
    const gt = make3VpGtSnapshot({ sid: 'c12', bgColor: 'rgba(50, 50, 50, 0.40)', bgImage: 'none' });
    const render = make3VpRenderSnapshot({ sid: 'c12', bgColor: 'rgba(50, 50, 50, 0.42)', bgImage: 'none' });
    const tpl = makeTemplate('c12', 'w12');

    const result = auditVerificationMatrix(gt, render, tpl);
    const defects = result.defects.filter(d => d.nodeSid === 'c12' && d.rule === 'RULE-SURFACE-01' && d.property === 'backgroundColor');

    assert.strictEqual(defects.length, 3, `Expected 3 alpha mismatch defects, got ${defects.length}`);
    for (const d of defects) {
      assert.strictEqual(d.severity, 'HIGH');
      assert(d.message.includes('Container alpha mismatch'), `Expected message to contain 'Container alpha mismatch', got: ${d.message}`);
    }
  });

  // ---------------------------------------------------------------------------
  // Test 13: RGB difference of 1 (rgb(10,20,30) vs rgb(10,20,31)) yields HIGH defect
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 13] RGB Difference of 1 -> HIGH defect');

  runTest('13. RGB difference of 1 yields HIGH defect', () => {
    const gt = make3VpGtSnapshot({ sid: 'c13', bgColor: 'rgb(10, 20, 30)', bgImage: 'none' });
    const render = make3VpRenderSnapshot({ sid: 'c13', bgColor: 'rgb(10, 20, 31)', bgImage: 'none' });
    const tpl = makeTemplate('c13', 'w13');

    const result = auditVerificationMatrix(gt, render, tpl);
    const defects = result.defects.filter(d => d.nodeSid === 'c13' && d.rule === 'RULE-SURFACE-01' && d.property === 'backgroundColor');

    assert.strictEqual(defects.length, 3, `Expected 3 RGB channel mismatch defects, got ${defects.length}`);
    for (const d of defects) {
      assert.strictEqual(d.severity, 'HIGH');
      assert(d.message.includes('Container RGB channel mismatch'), `Expected message to contain 'Container RGB channel mismatch', got: ${d.message}`);
    }
  });

  // ---------------------------------------------------------------------------
  // Test 14: GT role 'container' mapped to widget with wrong background triggers RULE-CLR-02
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 14] GT role container mapped to widget -> triggers RULE-CLR-02');

  runTest('14. GT role container mapped to widget with wrong background triggers RULE-CLR-02', () => {
    const gt = make3VpGtSnapshot({ sid: 'w14', role: 'container', bgColor: 'rgb(10, 20, 30)', bgImage: 'none' });
    const render = make3VpRenderSnapshot({ sid: 'w14', widgetId: 'w14', bgColor: 'rgb(100, 200, 250)', bgImage: 'none' });
    // In template, it's mapped to a widget, not a container!
    const tpl = {
      title: 'Widget from Container',
      page_settings: {},
      content: [
        {
          _sid: 'w14',
          id: 'w14',
          elType: 'widget',
          widgetType: 'heading',
          settings: { _sid: 'w14' }
        }
      ]
    };

    const result = auditVerificationMatrix(gt, render, tpl);
    const clrDefects = result.defects.filter(d => d.nodeSid === 'w14' && d.rule === 'RULE-CLR-02');
    const surfaceDefects = result.defects.filter(d => d.nodeSid === 'w14' && d.rule === 'RULE-SURFACE-01');

    // Should NOT be audited by RULE-SURFACE-01 because template el is widget
    assert.strictEqual(surfaceDefects.length, 0, `Expected 0 surface defects, got ${surfaceDefects.length}`);
    // MUST trigger RULE-CLR-02 because it was NOT an audited container surface
    assert.strictEqual(clrDefects.length, 3, `Expected 3 RULE-CLR-02 defects, got ${clrDefects.length}`);
    for (const d of clrDefects) {
      assert.strictEqual(d.severity, 'HIGH');
    }
  });

  // ---------------------------------------------------------------------------
  // Test 15: Audited container has exact zero duplicate defect (RULE-SURFACE-01 only, zero RULE-CLR-02)
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 15] Audited container has exact zero duplicate defect');

  runTest('15. Audited container has exact zero duplicate defect (RULE-SURFACE-01 only, zero RULE-CLR-02)', () => {
    const gt = make3VpGtSnapshot({ sid: 'c15', role: 'container', bgColor: 'rgb(10, 20, 30)', bgImage: 'none' });
    const render = make3VpRenderSnapshot({ sid: 'c15', widgetId: 'c15', bgColor: 'rgb(255, 0, 0)', bgImage: 'none' });
    const tpl = makeTemplate('c15', 'c15');

    const result = auditVerificationMatrix(gt, render, tpl);
    const surfaceDefects = result.defects.filter(d => d.nodeSid === 'c15' && d.rule === 'RULE-SURFACE-01');
    const clrDefects = result.defects.filter(d => d.nodeSid === 'c15' && d.rule === 'RULE-CLR-02');

    assert.strictEqual(surfaceDefects.length, 3, `Expected 3 surface defects, got ${surfaceDefects.length}`);
    assert.strictEqual(clrDefects.length, 0, `Expected 0 duplicate RULE-CLR-02 defects on audited container, got ${clrDefects.length}`);
  });

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log(`ALL ${passedTests}/${totalTests} TESTS PASSED CLEANLY (100%)`);
  console.log('========================================================================');
})();

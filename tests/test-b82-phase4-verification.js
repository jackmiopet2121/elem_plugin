/**
 * Block 8.2 — Phase 4 (Part 2): Canvas Parity Verification & Audit Suite.
 *
 * Verifies:
 * 1. Solid match: Identical GT and Render canvas color with background_background: 'classic' -> 0 defects.
 * 2. Solid mismatch: Actual rendered color differs from expected -> non-advisory HIGH defect.
 * 3. Missing background_color: templateJson missing background_color -> non-advisory HIGH defect.
 * 4. Correct color + missing background_background: templateJson has color but missing mode -> non-advisory HIGH defect.
 * 5. Correct color + wrong mode: templateJson has color but background_background: 'gradient' -> non-advisory HIGH defect.
 * 6. Correct color + rendered backgroundImage: linear-gradient -> non-advisory HIGH defect.
 * 7. Correct color + missing rendered backgroundImage: render canvas missing backgroundImage -> non-advisory HIGH defect.
 * 8. Missing render canvas on solid GT: Render snapshot missing canvas capture -> non-advisory HIGH defect.
 * 9. Unsupported gradient: Body with gradient -> explicit non-advisory HIGH defect, no false clean pass.
 * 10. Responsive mismatch: Canvas background differs across viewports -> explicit non-advisory HIGH defect.
 * 11. Invalid GT: Incomplete viewports or invalid opacity -> explicit non-advisory HIGH defect.
 * 12. Transparent default:
 *     - 12.1. Valid capture + no invented settings -> 0 canvas defects (clean pass).
 *     - 12.2. Transparent GT + missing render canvas -> non-advisory HIGH defect (unverified).
 *     - 12.3. Transparent GT + invented background_background: 'classic' -> non-advisory HIGH defect.
 *     - 12.4. Transparent GT + invented background_color -> non-advisory HIGH defect.
 * 13. Independence of section background: Section container background does not trigger or leak into canvas audit.
 */

'use strict';

const assert = require('assert');
const { auditVerificationMatrix } = require('../src/smart/verification-matrix');

(async () => {
  console.log('========================================================================');
  console.log('BLOCK 8.2 — PHASE 4 (PART 2): CANVAS PARITY AUDIT & VERIFICATION');
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

  function make3VpCanvas(canvasConfig) {
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

  function makeGtSnapshot(canvasConfig, flatNodes = {}, styleDict = null) {
    const canvas = make3VpCanvas(canvasConfig);
    const dict = Object.assign({}, styleDict || {});
    for (const [sid, node] of Object.entries(flatNodes)) {
      const ref = node.computedStyleRef || `ref-${sid}`;
      node.computedStyleRef = ref;
      if (!dict[ref]) {
        dict[ref] = {
          'background-color': node.styles?.backgroundColor || node.styles?.['background-color'] || 'rgba(0, 0, 0, 0)',
          'background-image': node.styles?.backgroundImage || node.styles?.['background-image'] || 'none'
        };
      }
    }
    return {
      annotatedHtml: '<html><body></body></html>',
      fonts: [],
      viewports: {
        desktop: { canvas: canvas.desktop, flat: flatNodes, styleDictionary: dict },
        tablet: { canvas: canvas.tablet, flat: flatNodes, styleDictionary: dict },
        mobile: { canvas: canvas.mobile, flat: flatNodes, styleDictionary: dict }
      }
    };
  }

  function makeRenderSnapshot(renderedCanvasBg = 'rgb(15, 23, 42)', renderedCanvasImg = 'none', flatNodes = {}) {
    const populatedFlat = {};
    for (const [sid, node] of Object.entries(flatNodes)) {
      populatedFlat[sid] = Object.assign({}, node, {
        styles: Object.assign({ backgroundImage: 'none' }, node.styles || {})
      });
    }
    const makeVp = () => {
      let canvasObj = null;
      if (renderedCanvasBg !== null) {
        canvasObj = {
          body: {
            backgroundColor: renderedCanvasBg,
            backgroundImage: renderedCanvasImg
          }
        };
      }
      return {
        flat: populatedFlat,
        duplicateSids: [],
        canvas: canvasObj
      };
    };
    return {
      viewports: {
        desktop: makeVp(),
        tablet: makeVp(),
        mobile: makeVp()
      }
    };
  }

  // ---------------------------------------------------------------------------
  // Test 1: Solid Match
  // ---------------------------------------------------------------------------
  console.log('▶ [TEST 1] Solid Canvas Match Parity');

  runTest('1. Solid Match: GT rgb(15, 23, 42), templateJson background_background: classic, and rendered body match cleanly', () => {
    const gt = makeGtSnapshot({ body: { backgroundColor: 'rgb(15, 23, 42)' } });
    const templateJson = {
      title: 'Canvas Match Test',
      page_settings: {
        background_background: 'classic',
        background_color: 'rgb(15, 23, 42)'
      },
      content: []
    };
    const render = makeRenderSnapshot('rgb(15, 23, 42)', 'none');

    const result = auditVerificationMatrix(gt, render, templateJson);
    const canvasDefects = result.defects.filter(d => d.rule === 'RULE-CANVAS-01');

    assert.strictEqual(canvasDefects.length, 0, 'Expected 0 canvas defects on exact match');
    assert.strictEqual(result.healthScore, 100, 'Health score should be 100 when canvas matches');
  });

  // ---------------------------------------------------------------------------
  // Test 2: Solid Mismatch
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 2] Solid Canvas Color Mismatch');

  runTest('2. Solid Mismatch: Rendered color rgb(255, 0, 0) differs from GT rgb(15, 23, 42)', () => {
    const gt = makeGtSnapshot({ body: { backgroundColor: 'rgb(15, 23, 42)' } });
    const templateJson = {
      title: 'Canvas Mismatch Test',
      page_settings: {
        background_background: 'classic',
        background_color: 'rgb(15, 23, 42)'
      },
      content: []
    };
    const render = makeRenderSnapshot('rgb(255, 0, 0)', 'none'); // mismatch

    const result = auditVerificationMatrix(gt, render, templateJson);
    const canvasDefects = result.defects.filter(d => d.rule === 'RULE-CANVAS-01');

    assert(canvasDefects.length > 0, 'Must emit RULE-CANVAS-01 defects on color mismatch');
    const firstDefect = canvasDefects[0];
    assert.strictEqual(firstDefect.rule, 'RULE-CANVAS-01');
    assert.strictEqual(firstDefect.severity, 'HIGH');
    assert.strictEqual(firstDefect.advisory, false);
    assert.strictEqual(firstDefect.property, 'backgroundColor');
    assert.strictEqual(firstDefect.original, 'rgb(15, 23, 42)');
    assert.strictEqual(firstDefect.rendered, 'rgb(255, 0, 0)');
    assert(result.healthScore < 100, 'Health score must be penalized on mismatch (no false pass)');
  });

  // ---------------------------------------------------------------------------
  // Test 3: Missing background_color
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 3] Missing background_color on Solid Canvas');

  runTest('3. Missing background_color: templateJson has no background_color when GT is solid', () => {
    const gt = makeGtSnapshot({ body: { backgroundColor: 'rgb(15, 23, 42)' } });
    const templateJson = {
      title: 'Missing Page Settings Test',
      page_settings: { background_background: 'classic' }, // missing background_color
      content: []
    };
    const render = makeRenderSnapshot('rgb(15, 23, 42)', 'none');

    const result = auditVerificationMatrix(gt, render, templateJson);
    const canvasDefects = result.defects.filter(d => d.rule === 'RULE-CANVAS-01');

    assert(canvasDefects.length > 0, 'Must emit RULE-CANVAS-01 defect when background_color is missing');
    const defect = canvasDefects[0];
    assert.strictEqual(defect.severity, 'HIGH');
    assert.strictEqual(defect.advisory, false);
    assert.strictEqual(defect.rendered, 'missing_page_setting');
    assert(result.healthScore < 100, 'Health score must be penalized');
  });

  // ---------------------------------------------------------------------------
  // Test 4: Correct color + missing background_background
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 4] Correct Color + Missing background_background');

  runTest('4. Correct color + missing background_background: emits non-advisory HIGH defect', () => {
    const gt = makeGtSnapshot({ body: { backgroundColor: 'rgb(15, 23, 42)' } });
    const templateJson = {
      title: 'Missing Mode Test',
      page_settings: {
        background_color: 'rgb(15, 23, 42)'
        // missing background_background: 'classic'
      },
      content: []
    };
    const render = makeRenderSnapshot('rgb(15, 23, 42)', 'none');

    const result = auditVerificationMatrix(gt, render, templateJson);
    const canvasDefects = result.defects.filter(d => d.rule === 'RULE-CANVAS-01');

    assert(canvasDefects.length > 0, 'Must emit defect when background_background mode is missing');
    const defect = canvasDefects[0];
    assert.strictEqual(defect.property, 'background_background');
    assert.strictEqual(defect.original, 'classic');
    assert.strictEqual(defect.severity, 'HIGH');
    assert.strictEqual(defect.advisory, false);
  });

  // ---------------------------------------------------------------------------
  // Test 5: Correct color + wrong mode
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 5] Correct Color + Wrong Mode');

  runTest('5. Correct color + wrong mode: background_background: "gradient" emits non-advisory HIGH defect', () => {
    const gt = makeGtSnapshot({ body: { backgroundColor: 'rgb(15, 23, 42)' } });
    const templateJson = {
      title: 'Wrong Mode Test',
      page_settings: {
        background_background: 'gradient', // wrong mode!
        background_color: 'rgb(15, 23, 42)'
      },
      content: []
    };
    const render = makeRenderSnapshot('rgb(15, 23, 42)', 'none');

    const result = auditVerificationMatrix(gt, render, templateJson);
    const canvasDefects = result.defects.filter(d => d.rule === 'RULE-CANVAS-01');

    assert(canvasDefects.length > 0, 'Must emit defect when background_background is wrong mode');
    const defect = canvasDefects[0];
    assert.strictEqual(defect.property, 'background_background');
    assert.strictEqual(defect.original, 'classic');
    assert.strictEqual(defect.rendered, 'gradient');
    assert.strictEqual(defect.severity, 'HIGH');
  });

  // ---------------------------------------------------------------------------
  // Test 6: Correct color + rendered backgroundImage: linear-gradient(...)
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 6] Correct Color + Rendered backgroundImage Gradient');

  runTest('6. Correct color + rendered backgroundImage linear-gradient emits non-advisory HIGH defect', () => {
    const gt = makeGtSnapshot({ body: { backgroundColor: 'rgb(15, 23, 42)' } });
    const templateJson = {
      title: 'Render Gradient Test',
      page_settings: {
        background_background: 'classic',
        background_color: 'rgb(15, 23, 42)'
      },
      content: []
    };
    // rendered body has color but also has a gradient on backgroundImage!
    const render = makeRenderSnapshot('rgb(15, 23, 42)', 'linear-gradient(to right, rgb(0, 0, 0), rgb(255, 255, 255))');

    const result = auditVerificationMatrix(gt, render, templateJson);
    const canvasDefects = result.defects.filter(d => d.rule === 'RULE-CANVAS-01');

    assert(canvasDefects.length > 0, 'Must emit defect when rendered body has unexpected backgroundImage');
    const defect = canvasDefects.find(d => d.property === 'backgroundImage');
    assert(defect, 'Must find defect for property backgroundImage');
    assert.strictEqual(defect.severity, 'HIGH');
    assert.strictEqual(defect.advisory, false);
    assert.strictEqual(defect.original, 'none');
    assert(defect.rendered.includes('linear-gradient'));
  });

  // ---------------------------------------------------------------------------
  // Test 7: Correct color + missing rendered backgroundImage
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 7] Correct Color + Missing Rendered backgroundImage');

  runTest('7. Correct color + missing rendered backgroundImage emits non-advisory HIGH defect', () => {
    const gt = makeGtSnapshot({ body: { backgroundColor: 'rgb(15, 23, 42)' } });
    const templateJson = {
      title: 'Missing Render Image Test',
      page_settings: {
        background_background: 'classic',
        background_color: 'rgb(15, 23, 42)'
      },
      content: []
    };
    // rendered body backgroundImage is empty or missing
    const render = makeRenderSnapshot('rgb(15, 23, 42)', '');

    const result = auditVerificationMatrix(gt, render, templateJson);
    const canvasDefects = result.defects.filter(d => d.rule === 'RULE-CANVAS-01');

    assert(canvasDefects.length > 0, 'Must emit defect when rendered backgroundImage is missing/empty');
    const defect = canvasDefects.find(d => d.property === 'backgroundImage');
    assert(defect, 'Must find defect for property backgroundImage');
    assert.strictEqual(defect.severity, 'HIGH');
  });

  // ---------------------------------------------------------------------------
  // Test 7b: Solid GT + page_settings background_image
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 7b] Solid GT + page_settings background_image');

  runTest('7b. Solid GT + non-empty page_settings.background_image emits non-advisory HIGH defect', () => {
    const gt = makeGtSnapshot({ body: { backgroundColor: 'rgb(15, 23, 42)' } });
    const templateJson = {
      title: 'Solid Page Image Test',
      page_settings: {
        background_background: 'classic',
        background_color: 'rgb(15, 23, 42)',
        background_image: { url: 'https://example.com/bg.png' }
      },
      content: []
    };
    const render = makeRenderSnapshot('rgb(15, 23, 42)', 'none');

    const result = auditVerificationMatrix(gt, render, templateJson);
    const canvasDefects = result.defects.filter(d => d.rule === 'RULE-CANVAS-01');

    assert(canvasDefects.length > 0, 'Must emit defect when page_settings has background_image for solid GT');
    const defect = canvasDefects.find(d => d.property === 'background_image');
    assert(defect, 'Must find defect for property background_image');
    assert.strictEqual(defect.severity, 'HIGH');
    assert.strictEqual(defect.advisory, false);
    assert.strictEqual(defect.original, 'none');
    assert.strictEqual(defect.rendered, 'https://example.com/bg.png');
  });

  // ---------------------------------------------------------------------------
  // Test 8: Missing Render Canvas
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 8] Missing Render Canvas Capture');

  runTest('8. Missing Render Canvas: Render snapshot has null canvas', () => {
    const gt = makeGtSnapshot({ body: { backgroundColor: 'rgb(15, 23, 42)' } });
    const templateJson = {
      title: 'Missing Render Canvas Test',
      page_settings: {
        background_background: 'classic',
        background_color: 'rgb(15, 23, 42)'
      },
      content: []
    };
    const render = makeRenderSnapshot(null); // null canvas

    const result = auditVerificationMatrix(gt, render, templateJson);
    const canvasDefects = result.defects.filter(d => d.rule === 'RULE-CANVAS-01');

    assert(canvasDefects.length > 0, 'Must emit RULE-CANVAS-01 defect when render canvas is missing');
    const defect = canvasDefects[0];
    assert.strictEqual(defect.severity, 'HIGH');
    assert.strictEqual(defect.rendered, 'missing_render_capture');
  });

  // ---------------------------------------------------------------------------
  // Test 9: Unsupported Gradient on GT
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 9] Unsupported Gradient Canvas on GT');

  runTest('9. Unsupported Gradient: GT body has linear-gradient -> non-advisory HIGH defect', () => {
    const gt = makeGtSnapshot({
      body: { backgroundColor: 'rgb(0, 0, 0)', backgroundImage: 'linear-gradient(to right, #000, #fff)' }
    });
    const templateJson = {
      title: 'Gradient Canvas Test',
      page_settings: {},
      content: []
    };
    const render = makeRenderSnapshot('#ffffff', 'none');

    const result = auditVerificationMatrix(gt, render, templateJson);
    const canvasDefects = result.defects.filter(d => d.rule === 'RULE-CANVAS-01');

    assert.strictEqual(canvasDefects.length, 1, 'Must emit exactly 1 defect for unsupported canvas mode');
    const defect = canvasDefects[0];
    assert.strictEqual(defect.rule, 'RULE-CANVAS-01');
    assert.strictEqual(defect.severity, 'HIGH');
    assert.strictEqual(defect.advisory, false);
    assert.strictEqual(defect.property, 'canvasMode');
    assert.strictEqual(defect.original, 'UNSUPPORTED_LAYERED');
    assert(result.healthScore < 100, 'Health score must not be 100 on unsupported gradient');
  });

  // ---------------------------------------------------------------------------
  // Test 10: Responsive Mismatch Across Viewports
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 10] Responsive Canvas Mismatch');

  runTest('10. Responsive Mismatch: Desktop is rgb(15, 23, 42), Mobile is rgb(255, 255, 255)', () => {
    const gt = {
      annotatedHtml: '<html><body></body></html>',
      viewports: {
        desktop: { canvas: { html: { backgroundColor: 'transparent', backgroundImage: 'none', opacity: '1' }, body: { backgroundColor: 'rgb(15, 23, 42)', backgroundImage: 'none', opacity: '1' } }, flat: {} },
        tablet: { canvas: { html: { backgroundColor: 'transparent', backgroundImage: 'none', opacity: '1' }, body: { backgroundColor: 'rgb(15, 23, 42)', backgroundImage: 'none', opacity: '1' } }, flat: {} },
        mobile: { canvas: { html: { backgroundColor: 'transparent', backgroundImage: 'none', opacity: '1' }, body: { backgroundColor: 'rgb(255, 255, 255)', backgroundImage: 'none', opacity: '1' } }, flat: {} }
      }
    };
    const templateJson = { title: 'Responsive Mismatch Test', page_settings: {}, content: [] };
    const render = makeRenderSnapshot('rgb(15, 23, 42)', 'none');

    const result = auditVerificationMatrix(gt, render, templateJson);
    const canvasDefects = result.defects.filter(d => d.rule === 'RULE-CANVAS-01');

    assert.strictEqual(canvasDefects.length, 1);
    const defect = canvasDefects[0];
    assert.strictEqual(defect.rule, 'RULE-CANVAS-01');
    assert.strictEqual(defect.severity, 'HIGH');
    assert.strictEqual(defect.advisory, false);
    assert.strictEqual(defect.property, 'canvasMode');
    assert.strictEqual(defect.original, 'RESPONSIVE_CANVAS_UNSUPPORTED');
  });

  // ---------------------------------------------------------------------------
  // Test 11: Invalid Ground Truth Capture
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 11] Invalid Ground Truth Capture');

  runTest('11. Invalid GT: Incomplete viewports (desktop only) emits non-advisory HIGH defect', () => {
    const invalidGt = {
      viewports: {
        desktop: { canvas: { html: { backgroundColor: 'transparent', backgroundImage: 'none', opacity: '1' }, body: { backgroundColor: 'rgb(15, 23, 42)', backgroundImage: 'none', opacity: '1' } } }
      }
    };
    const templateJson = { title: 'Invalid GT Test', page_settings: {}, content: [] };
    const render = makeRenderSnapshot('rgb(15, 23, 42)', 'none');

    const result = auditVerificationMatrix(invalidGt, render, templateJson);
    const canvasDefects = result.defects.filter(d => d.rule === 'RULE-CANVAS-01');

    assert.strictEqual(canvasDefects.length, 1);
    const defect = canvasDefects[0];
    assert.strictEqual(defect.rule, 'RULE-CANVAS-01');
    assert.strictEqual(defect.severity, 'HIGH');
    assert.strictEqual(defect.original, 'INVALID_CAPTURE');
  });

  // ---------------------------------------------------------------------------
  // Test 12: Transparent Default Cases
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 12] Transparent Default Canvas Scenarios');

  runTest('12.1. Transparent Default: Compiler omits page background + valid render capture -> 0 defects', () => {
    const gt = makeGtSnapshot({
      html: { backgroundColor: 'transparent' },
      body: { backgroundColor: 'transparent' }
    });
    const templateJson = { title: 'Transparent Test', page_settings: {}, content: [] };
    const render = makeRenderSnapshot('#ffffff', 'none');

    const result = auditVerificationMatrix(gt, render, templateJson);
    const canvasDefects = result.defects.filter(d => d.rule === 'RULE-CANVAS-01');
    assert.strictEqual(canvasDefects.length, 0, 'Must have 0 defects when transparent default has no page background and valid render capture');
  });

  runTest('12.2. Transparent GT + missing render canvas -> non-advisory HIGH defect (unverified)', () => {
    const gt = makeGtSnapshot({
      html: { backgroundColor: 'transparent' },
      body: { backgroundColor: 'transparent' }
    });
    const templateJson = { title: 'Transparent Test', page_settings: {}, content: [] };
    const render = makeRenderSnapshot(null); // missing render canvas!

    const result = auditVerificationMatrix(gt, render, templateJson);
    const canvasDefects = result.defects.filter(d => d.rule === 'RULE-CANVAS-01');
    assert(canvasDefects.length > 0, 'Must emit defect when transparent GT has missing render capture');
    assert.strictEqual(canvasDefects[0].property, 'canvasCapture');
    assert.strictEqual(canvasDefects[0].rendered, 'missing_render_capture');
    assert.strictEqual(canvasDefects[0].severity, 'HIGH');
  });

  runTest('12.3. Transparent GT + page_settings.background_background: classic without color -> non-advisory HIGH defect', () => {
    const gt = makeGtSnapshot({
      html: { backgroundColor: 'transparent' },
      body: { backgroundColor: 'transparent' }
    });
    const templateJson = {
      title: 'Invented Mode Test',
      page_settings: { background_background: 'classic' }, // invented mode without color!
      content: []
    };
    const render = makeRenderSnapshot('#ffffff', 'none');

    const result = auditVerificationMatrix(gt, render, templateJson);
    const canvasDefects = result.defects.filter(d => d.rule === 'RULE-CANVAS-01');
    assert(canvasDefects.length > 0, 'Must emit defect when compiler sets invented background_background on transparent canvas');
    assert.strictEqual(canvasDefects[0].property, 'background_background');
    assert.strictEqual(canvasDefects[0].rendered, 'classic');
    assert.strictEqual(canvasDefects[0].severity, 'HIGH');
  });

  runTest('12.4. Transparent GT + compiler emits invented background_color -> non-advisory HIGH defect', () => {
    const gt = makeGtSnapshot({
      html: { backgroundColor: 'transparent' },
      body: { backgroundColor: 'transparent' }
    });
    const templateJson = {
      title: 'Invented Color Test',
      page_settings: { background_color: '#ffffff' }, // invented color!
      content: []
    };
    const render = makeRenderSnapshot('#ffffff', 'none');

    const result = auditVerificationMatrix(gt, render, templateJson);
    const canvasDefects = result.defects.filter(d => d.rule === 'RULE-CANVAS-01');
    assert(canvasDefects.length > 0, 'Must emit defect when compiler invents page color for transparent canvas');
    assert.strictEqual(canvasDefects[0].property, 'backgroundColor');
    assert.strictEqual(canvasDefects[0].severity, 'HIGH');
    assert.strictEqual(canvasDefects[0].original, 'transparent');
  });

  runTest('12.5. Transparent GT + active background_background mode (gradient) -> non-advisory HIGH defect', () => {
    const gt = makeGtSnapshot({
      html: { backgroundColor: 'transparent' },
      body: { backgroundColor: 'transparent' }
    });
    const templateJson = {
      title: 'Transparent Gradient Mode Test',
      page_settings: { background_background: 'gradient' },
      content: []
    };
    const render = makeRenderSnapshot('#ffffff', 'none');

    const result = auditVerificationMatrix(gt, render, templateJson);
    const canvasDefects = result.defects.filter(d => d.rule === 'RULE-CANVAS-01');
    assert(canvasDefects.length > 0, 'Must emit defect when compiler sets gradient mode on transparent canvas');
    assert.strictEqual(canvasDefects[0].property, 'background_background');
    assert.strictEqual(canvasDefects[0].rendered, 'gradient');
    assert.strictEqual(canvasDefects[0].severity, 'HIGH');
  });

  runTest('12.6. Transparent GT + non-empty page_settings.background_image -> non-advisory HIGH defect', () => {
    const gt = makeGtSnapshot({
      html: { backgroundColor: 'transparent' },
      body: { backgroundColor: 'transparent' }
    });
    const templateJson = {
      title: 'Transparent Image Test',
      page_settings: { background_image: { url: 'https://example.com/bg.png' } },
      content: []
    };
    const render = makeRenderSnapshot('#ffffff', 'none');

    const result = auditVerificationMatrix(gt, render, templateJson);
    const canvasDefects = result.defects.filter(d => d.rule === 'RULE-CANVAS-01');
    assert(canvasDefects.length > 0, 'Must emit defect when page_settings has background_image on transparent canvas');
    assert.strictEqual(canvasDefects[0].property, 'background_image');
    assert.strictEqual(canvasDefects[0].rendered, 'https://example.com/bg.png');
    assert.strictEqual(canvasDefects[0].severity, 'HIGH');
  });

  // ---------------------------------------------------------------------------
  // Test 13: Independence of Section Background vs Canvas Audit
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 13] Section Background Independence from Canvas Audit');

  runTest('13. Section Background Independence: Container has rgb(220, 38, 38) and canvas has rgb(15, 23, 42)', () => {
    const sectionSid = 'sec-test-hero';
    const gtFlat = {
      [sectionSid]: {
        sid: sectionSid,
        tag: 'section',
        role: 'container',
        rect: { x: 0, y: 0, w: 800, h: 200 },
        styles: {
          backgroundColor: 'rgb(220, 38, 38)',
          display: 'block'
        }
      }
    };
    const renderFlat = {
      [sectionSid]: {
        sid: sectionSid,
        widgetId: 'w-hero',
        rect: { x: 0, y: 0, w: 800, h: 200 },
        styles: {
          backgroundColor: 'rgb(220, 38, 38)',
          display: 'block'
        }
      }
    };

    const gt = makeGtSnapshot({ body: { backgroundColor: 'rgb(15, 23, 42)' } }, gtFlat);
    const templateJson = {
      title: 'Section Independence Test',
      page_settings: {
        background_background: 'classic',
        background_color: 'rgb(15, 23, 42)'
      },
      content: [
        {
          _sid: sectionSid,
          id: 'w-hero',
          elType: 'container',
          settings: {
            _sid: sectionSid,
            background_color: 'rgb(220, 38, 38)'
          },
          elements: []
        }
      ]
    };
    const render = makeRenderSnapshot('rgb(15, 23, 42)', 'none', renderFlat);

    const result = auditVerificationMatrix(gt, render, templateJson);

    // Canvas parity audit: 0 defects
    const canvasDefects = result.defects.filter(d => d.rule === 'RULE-CANVAS-01');
    assert.strictEqual(canvasDefects.length, 0, 'Canvas must match cleanly without interference from section');

    // Section styling: verified separately without cross-contamination
    assert.strictEqual(result.healthScore, 100, 'Score is 100 when both canvas and section match their respective targets');
  });

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log(`ALL ${passedTests}/${totalTests} TESTS PASSED CLEANLY (100%)`);
  console.log('========================================================================');
})();

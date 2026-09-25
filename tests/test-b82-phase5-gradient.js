/**
 * Block 8.2 — Phase 5 (Part 4A): Native Two-Stop Linear Gradients Tests.
 *
 * Verifies:
 * 1. Safe parsing of linear-gradient with rgb(...)/rgba(...) containing commas.
 * 2. Omitted angle defaults to 180deg; omitted stops default to 0% and 100%.
 * 3. Explicit % stops and custom angles in [0, 360).
 * 4. 4 Cardinal directions: to top (0), to right (90), to bottom (180), to left (270).
 * 5. Alpha preservation in rgba(...) colors without lossy stripping.
 * 6. Negative tests & rejection reason codes:
 *    - 3+ stops -> three_plus_stops
 *    - Radial/repeating/conic -> repeating_or_conic_or_radial
 *    - Multi-layer image+gradient -> multi_layer
 *    - Diagonal direction -> diagonal_direction
 *    - Separate opaque base color -> opaque_base_color
 *    - Unknown color syntax -> unknown_color_syntax
 *    - Invalid stop -> invalid_stop
 *    - Color hint -> color_hint
 *    - Modern dictionary missing ref/property -> throws FULL_STYLE_*
 * 7. Real Chromium mini fixture (desktop linear-gradient):
 *    GT computed styles -> compile to native settings -> virtual render -> Chromium computed parity.
 * 8. Real audit defects inspection:
 *    Actual defect records from audit.defects for supported-but-unverified gradient and unsupported multi-layer.
 */

'use strict';

const assert = require('assert');
const { auditVerificationMatrix } = require('../src/smart/verification-matrix');
const { captureGroundTruth } = require('../src/smart/style-snapshot');
const { parseHtmlToAst } = require('../src/parser/html-parser');
const { compileGroundTruthToElementor } = require('../src/smart/geometry-mapper');
const { compileHtmlToElementor } = require('../src/engine');
const { renderElementorToHtml } = require('../src/emulator/elementor-virtual-renderer');
const { captureRenderSnapshot } = require('../src/smart/render-snapshot');
const {
  resolveGradientBackground,
  parseLinearGradient,
  splitTopLevelCommas
} = require('../src/smart/gradient-background-resolver');

(async () => {
  console.log('========================================================================');
  console.log('BLOCK 8.2 — PHASE 5 (PART 4A): NATIVE TWO-STOP LINEAR GRADIENTS');
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

  function collectAllElements(roots) {
    const list = [];
    function walk(el) {
      if (!el) return;
      list.push(el);
      if (el.elements && Array.isArray(el.elements)) {
        for (const child of el.elements) walk(child);
      }
    }
    for (const r of roots) walk(r);
    return list;
  }

  function make3VpGtSnapshot({
    sid,
    tag = 'div',
    role = 'container',
    bgColor = 'rgba(0, 0, 0, 0)',
    bgImage = 'none',
    computedStyleRef = null,
    styleDict = undefined
  } = {}) {
    const ref = computedStyleRef || `ref-${sid}`;
    let dict;
    if (styleDict !== undefined) {
      dict = styleDict;
    } else {
      dict = {
        [ref]: {
          'background-color': bgColor,
          'background-image': bgImage,
          'background-size': 'auto',
          'background-position': '0% 0%',
          'background-repeat': 'repeat',
          'border-top-left-radius': '0px',
          'border-top-right-radius': '0px',
          'border-bottom-right-radius': '0px',
          'border-bottom-left-radius': '0px'
        }
      };
    }
    const node = {
      sid,
      tag,
      role,
      rect: { x: 0, y: 0, w: 800, h: 300 },
      styles: {
        backgroundColor: bgColor,
        backgroundImage: bgImage,
        display: 'block'
      },
      computedStyleRef: ref
    };
    const makeVp = () => ({
      canvas: {
        html: { backgroundColor: 'transparent', backgroundImage: 'none', opacity: '1' },
        body: { backgroundColor: 'transparent', backgroundImage: 'none', opacity: '1' }
      },
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
    bgImage = 'none'
  } = {}) {
    const node = {
      sid,
      widgetId,
      rect: { x: 0, y: 0, w: 800, h: 300 },
      styles: {
        backgroundColor: bgColor,
        backgroundImage: bgImage,
        display: 'block'
      }
    };
    const makeVp = () => ({
      flat: { [sid]: node },
      duplicateSids: [],
      canvas: {
        body: {
          backgroundColor: 'transparent',
          backgroundImage: 'none'
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

  // ---------------------------------------------------------------------------
  // Test 1: rgb(...) and rgba(...) Commas + Top-Level Scanner
  // ---------------------------------------------------------------------------
  console.log('▶ [TEST 1] Safe Parsing with rgb(...) and rgba(...) Commas');

  runTest('1. Top-level scanner preserves commas inside rgb(...) and rgba(...)', () => {
    const raw = 'linear-gradient(to right, rgb(255, 0, 0) 10%, rgba(0, 0, 255, 0.7) 90%)';
    const result = parseLinearGradient(raw, 'rgba(0, 0, 0, 0)');

    assert.strictEqual(result.mode, 'native-linear');
    assert.strictEqual(result.settings.background_background, 'gradient');
    assert.strictEqual(result.settings.background_color, 'rgb(255, 0, 0)');
    assert.deepStrictEqual(result.settings.background_color_stop, { unit: '%', size: 10, sizes: [] });
    assert.strictEqual(result.settings.background_color_b, 'rgba(0, 0, 255, 0.7)');
    assert.deepStrictEqual(result.settings.background_color_b_stop, { unit: '%', size: 90, sizes: [] });
    assert.strictEqual(result.settings.background_gradient_type, 'linear');
    assert.deepStrictEqual(result.settings.background_gradient_angle, { unit: 'deg', size: 90, sizes: [] });
  });

  // ---------------------------------------------------------------------------
  // Test 2: Omitted Angle and Omitted Stops
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 2] Omitted Angle (180deg) and Omitted Stops (0%, 100%)');

  runTest('2. Omitted angle defaults to 180deg; omitted stops default to 0% and 100%', () => {
    const raw = 'linear-gradient(rgb(15, 23, 42), rgb(51, 65, 85))';
    const result = parseLinearGradient(raw, 'rgba(0, 0, 0, 0)');

    assert.strictEqual(result.mode, 'native-linear');
    assert.strictEqual(result.settings.background_gradient_angle.size, 180, 'Default angle must be 180deg');
    assert.strictEqual(result.settings.background_color, 'rgb(15, 23, 42)');
    assert.strictEqual(result.settings.background_color_stop.size, 0, 'First omitted stop must be 0%');
    assert.strictEqual(result.settings.background_color_b, 'rgb(51, 65, 85)');
    assert.strictEqual(result.settings.background_color_b_stop.size, 100, 'Second omitted stop must be 100%');
  });

  // ---------------------------------------------------------------------------
  // Test 3: Four Cardinal Directions Mapping
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 3] Cardinal Directions Mapping');

  runTest('3.1. to top maps to 0deg', () => {
    const res = parseLinearGradient('linear-gradient(to top, #ff0000, #0000ff)', 'rgba(0, 0, 0, 0)');
    assert.strictEqual(res.mode, 'native-linear');
    assert.strictEqual(res.settings.background_gradient_angle.size, 0);
  });

  runTest('3.2. to right maps to 90deg', () => {
    const res = parseLinearGradient('linear-gradient(to right, #ff0000, #0000ff)', 'rgba(0, 0, 0, 0)');
    assert.strictEqual(res.mode, 'native-linear');
    assert.strictEqual(res.settings.background_gradient_angle.size, 90);
  });

  runTest('3.3. to bottom maps to 180deg', () => {
    const res = parseLinearGradient('linear-gradient(to bottom, #ff0000, #0000ff)', 'rgba(0, 0, 0, 0)');
    assert.strictEqual(res.mode, 'native-linear');
    assert.strictEqual(res.settings.background_gradient_angle.size, 180);
  });

  runTest('3.4. to left maps to 270deg', () => {
    const res = parseLinearGradient('linear-gradient(to left, #ff0000, #0000ff)', 'rgba(0, 0, 0, 0)');
    assert.strictEqual(res.mode, 'native-linear');
    assert.strictEqual(res.settings.background_gradient_angle.size, 270);
  });

  // ---------------------------------------------------------------------------
  // Test 4: Alpha Preservation in Colors
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 4] Alpha Preservation');

  runTest('4. Exact computed color strings with alpha are preserved without lossy stripping', () => {
    const res = parseLinearGradient('linear-gradient(135deg, rgba(255, 0, 0, 0.35) 25%, rgba(0, 255, 0, 0.85) 75%)', 'rgba(0, 0, 0, 0)');
    assert.strictEqual(res.mode, 'native-linear');
    assert.strictEqual(res.settings.background_color, 'rgba(255, 0, 0, 0.35)');
    assert.strictEqual(res.settings.background_color_b, 'rgba(0, 255, 0, 0.85)');
    assert.strictEqual(res.settings.background_color_stop.size, 25);
    assert.strictEqual(res.settings.background_color_b_stop.size, 75);
    assert.strictEqual(res.settings.background_gradient_angle.size, 135);
  });

  runTest('4.2. Exact fractional angle 12.34567deg preserves precision without rounding', () => {
    const res = parseLinearGradient('linear-gradient(12.34567deg, rgb(255, 0, 0) 20%, rgb(0, 0, 255) 80%)', 'rgba(0, 0, 0, 0)');
    assert.strictEqual(res.mode, 'native-linear');
    assert.strictEqual(res.settings.background_gradient_angle.size, 12.34567, 'Angle size must be exactly 12.34567 without rounding');
  });

  // ---------------------------------------------------------------------------
  // Test 5: Rejection Reason Codes (Negative Tests)
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 5] Rejection Reason Codes for Unsupported Cases');

  runTest('5.1. Three or more stops -> three_plus_stops', () => {
    const res = parseLinearGradient('linear-gradient(rgb(255, 0, 0), rgb(0, 255, 0), rgb(0, 0, 255))');
    assert.strictEqual(res.mode, 'unsupported');
    assert.strictEqual(res.reason, 'three_plus_stops');
    assert.strictEqual(res.settings, null);
  });

  runTest('5.2. Radial gradient -> repeating_or_conic_or_radial', () => {
    const res = parseLinearGradient('radial-gradient(circle, red, blue)');
    assert.strictEqual(res.mode, 'unsupported');
    assert.strictEqual(res.reason, 'repeating_or_conic_or_radial');
  });

  runTest('5.3. Repeating linear gradient -> repeating_or_conic_or_radial', () => {
    const res = parseLinearGradient('repeating-linear-gradient(red, blue 20px)');
    assert.strictEqual(res.mode, 'unsupported');
    assert.strictEqual(res.reason, 'repeating_or_conic_or_radial');
  });

  runTest('5.4. Conic gradient -> repeating_or_conic_or_radial', () => {
    const res = parseLinearGradient('conic-gradient(red, blue)');
    assert.strictEqual(res.mode, 'unsupported');
    assert.strictEqual(res.reason, 'repeating_or_conic_or_radial');
  });

  runTest('5.5. Multi-layer background (gradient + url) -> multi_layer', () => {
    const res = parseLinearGradient('linear-gradient(red, blue), url("https://example.com/bg.png")');
    assert.strictEqual(res.mode, 'unsupported');
    assert.strictEqual(res.reason, 'multi_layer');
  });

  runTest('5.6. Diagonal keyword direction -> diagonal_direction', () => {
    const res = parseLinearGradient('linear-gradient(to top right, red, blue)');
    assert.strictEqual(res.mode, 'unsupported');
    assert.strictEqual(res.reason, 'diagonal_direction');
  });

  runTest('5.7. Separate opaque base color -> opaque_base_color', () => {
    const res = parseLinearGradient('linear-gradient(red, blue)', 'rgb(255, 255, 255)');
    assert.strictEqual(res.mode, 'unsupported');
    assert.strictEqual(res.reason, 'opaque_base_color');
  });

  runTest('5.8. Unknown color syntax -> unknown_color_syntax', () => {
    const res = parseLinearGradient('linear-gradient(invalid_color_xyz, blue)');
    assert.strictEqual(res.mode, 'unsupported');
    assert.strictEqual(res.reason, 'unknown_color_syntax');
  });

  runTest('5.9. Invalid stop unit (px) -> invalid_stop', () => {
    const res = parseLinearGradient('linear-gradient(red 20px, blue 80px)');
    assert.strictEqual(res.mode, 'unsupported');
    assert.strictEqual(res.reason, 'invalid_stop');
  });

  runTest('5.10. Color interpolation hint -> color_hint', () => {
    const res = parseLinearGradient('linear-gradient(red, 50%, blue)');
    assert.strictEqual(res.mode, 'unsupported');
    assert(['color_hint', 'three_plus_stops'].includes(res.reason));
  });

  runTest('5.11. Partial/invalid decimal angle (1.2.3deg) -> invalid_angle', () => {
    const res = parseLinearGradient('linear-gradient(1.2.3deg, red, blue)');
    assert.strictEqual(res.mode, 'unsupported');
    assert.strictEqual(res.reason, 'invalid_angle');
  });

  runTest('5.12. Partial/invalid decimal stop (red 1.2.3%) -> invalid_stop', () => {
    const res = parseLinearGradient('linear-gradient(red 1.2.3%, blue)');
    assert.strictEqual(res.mode, 'unsupported');
    assert.strictEqual(res.reason, 'invalid_stop');
  });

  runTest('5.13. Invalid hex color with NaN channels (#gggggg) -> unknown_color_syntax', () => {
    const res = parseLinearGradient('linear-gradient(#gggggg, #0000ff)');
    assert.strictEqual(res.mode, 'unsupported');
    assert.strictEqual(res.reason, 'unknown_color_syntax');
  });

  // ---------------------------------------------------------------------------
  // Test 6: Modern Style Dictionary Property / Ref Missing
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 6] Modern Style Dictionary Integrity');

  runTest('6. Modern snapshot missing background-image throws FULL_STYLE_PROPERTY_MISSING', () => {
    const gt = make3VpGtSnapshot({
      sid: 'c_missing_dict',
      styleDict: {
        'ref-c_missing_dict': {
          'background-color': 'rgba(0, 0, 0, 0)'
          // background-image missing!
        }
      }
    });

    const node = gt.viewports.desktop.flat['c_missing_dict'];
    assert.throws(() => {
      resolveGradientBackground(node, gt, 'desktop');
    }, (err) => {
      return err.code === 'FULL_STYLE_PROPERTY_MISSING';
    });
  });

  // ---------------------------------------------------------------------------
  // Test 7: Compiler Container Surface Routing & Virtual Preview
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 7] Container Surface Routing & Virtual Preview Emission');

  runTest('7.1. Supported linear gradient routes to native container and emits preview CSS', () => {
    const gt = make3VpGtSnapshot({
      sid: 'c_grad_1',
      bgImage: 'linear-gradient(135deg, rgb(255, 0, 0) 20%, rgb(0, 0, 255) 80%)',
      bgColor: 'rgba(0, 0, 0, 0)'
    });

    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });
    const all = collectAllElements(elements);
    const c = all.find(e => e._sid === 'c_grad_1' || e.settings?._sid === 'c_grad_1') || elements[0];

    assert(c, 'Container c_grad_1 must be present');
    assert.strictEqual(c.elType, 'container');
    assert.strictEqual(c.settings.background_background, 'gradient');
    assert.strictEqual(c.settings.background_color, 'rgb(255, 0, 0)');
    assert.strictEqual(c.settings.background_color_stop.size, 20);
    assert.strictEqual(c.settings.background_color_b, 'rgb(0, 0, 255)');
    assert.strictEqual(c.settings.background_color_b_stop.size, 80);
    assert.strictEqual(c.settings.background_gradient_type, 'linear');
    assert.strictEqual(c.settings.background_gradient_angle.size, 135);
    assert.strictEqual(c.settings.background_image, undefined, 'Must not retain background_image setting');

    // Render virtual preview HTML & CSS
    const previewHtml = renderElementorToHtml({ content: [c], page_settings: {} }, { fonts: [] });
    assert(previewHtml.includes('background-color: transparent;'), 'Preview CSS must emit transparent background-color');
    assert(previewHtml.includes('background-image: linear-gradient(135deg, rgb(255, 0, 0) 20%, rgb(0, 0, 255) 80%);'),
      'Preview CSS must emit exact linear-gradient');
  });

  runTest('7.2. Unsupported multi-layer yields zero native gradient and retains zero guessed styles', () => {
    const gt = make3VpGtSnapshot({
      sid: 'c_multi_unsupported',
      bgImage: 'linear-gradient(rgb(255, 0, 0), rgb(0, 0, 255)), url("https://example.com/bg.png")',
      bgColor: 'rgba(0, 0, 0, 0)'
    });

    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });
    const all = collectAllElements(elements);
    const c = all.find(e => e._sid === 'c_multi_unsupported' || e.settings?._sid === 'c_multi_unsupported') || elements[0];

    assert.strictEqual(c.settings.background_background, undefined, 'Must not emit background_background');
    assert.strictEqual(c.settings.background_color, undefined, 'Must not emit background_color');
    assert.strictEqual(c.settings.background_image, undefined, 'Must not emit background_image');
  });

  runTest('7.3. Opaque base color preserves classic solid background and rejects gradient override', () => {
    const gt = make3VpGtSnapshot({
      sid: 'c_opaque_base',
      bgImage: 'linear-gradient(rgb(255, 0, 0), rgb(0, 0, 255))',
      bgColor: 'rgb(240, 240, 240)'
    });

    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });
    const all = collectAllElements(elements);
    const c = all.find(e => e._sid === 'c_opaque_base' || e.settings?._sid === 'c_opaque_base') || elements[0];

    assert.strictEqual(c.settings.background_background, 'classic', 'Must preserve classic solid background');
    assert.strictEqual(c.settings.background_color, 'rgb(240, 240, 240)', 'Must retain base solid color');
    assert.strictEqual(c.settings.background_gradient_type, undefined, 'Must not emit gradient settings');
  });

  runTest('7.4. Fractional angle preserves exact precision in emitted virtual preview CSS', () => {
    const gt = make3VpGtSnapshot({
      sid: 'c_grad_precision',
      bgImage: 'linear-gradient(12.34567deg, rgb(255, 0, 0) 20%, rgb(0, 0, 255) 80%)',
      bgColor: 'rgba(0, 0, 0, 0)'
    });

    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });
    const all = collectAllElements(elements);
    const c = all.find(e => e._sid === 'c_grad_precision' || e.settings?._sid === 'c_grad_precision') || elements[0];

    assert.strictEqual(c.settings.background_gradient_angle.size, 12.34567, 'Angle size in template must be exactly 12.34567');

    const previewHtml = renderElementorToHtml({ content: [c], page_settings: {} }, { fonts: [] });
    assert(previewHtml.includes('background-image: linear-gradient(12.34567deg, rgb(255, 0, 0) 20%, rgb(0, 0, 255) 80%);'),
      'Preview CSS must emit linear-gradient with exact fractional angle 12.34567deg');
  });

  // ---------------------------------------------------------------------------
  // Test 8: Real Chromium Mini Fixture (End-to-End Desktop Gradient)
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 8] Real Chromium Mini Fixture (End-to-End Desktop Linear Gradient)');

  await runAsyncTest('8. Capture GT -> compile -> virtual render -> Chromium computed parity', async () => {
    const fixtureHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #ffffff; }
    .hero-grad-container {
      width: 100%;
      height: 250px;
      background-image: linear-gradient(135deg, rgb(255, 0, 0) 20%, rgb(0, 0, 255) 80%);
      background-color: transparent;
      display: flex;
      flex-direction: column;
    }
  </style>
</head>
<body>
  <div id="grad-hero-box" class="hero-grad-container"></div>
</body>
</html>`;

    console.log('    • Capturing real Ground Truth snapshot with Chromium...');
    const gtSnapshot = await captureGroundTruth(fixtureHtml, { cache: false });

    const heroNode = Object.values(gtSnapshot.viewports.desktop.flat).find(n => n.id === 'grad-hero-box');
    assert(heroNode, 'grad-hero-box must be captured in GT snapshot');

    const heroDict = gtSnapshot.viewports.desktop.styleDictionary[heroNode.computedStyleRef];
    console.log('    • Chromium GT Computed Styles:');
    console.log(`      - background-image: ${heroDict['background-image']}`);
    console.log(`      - background-color: ${heroDict['background-color']}`);

    assert.strictEqual(heroDict['background-image'], 'linear-gradient(135deg, rgb(255, 0, 0) 20%, rgb(0, 0, 255) 80%)');

    console.log('    • Compiling HTML to Elementor template...');
    const compileResult = await compileHtmlToElementor(fixtureHtml, {
      offline: true,
      useAi: false,
      inspect: false,
      probeBehavior: false,
      behaviorTraces: [],
      captureGroundTruth: async () => gtSnapshot
    });

    const allElements = collectAllElements(compileResult.templateJson.content || []);
    const heroEl = allElements.find(e => e.settings?._element_id === 'grad-hero-box' || e._element_id === 'grad-hero-box');
    assert(heroEl, 'Compiled element must exist');

    console.log('    • Native Elementor Gradient Settings:');
    console.log(`      - background_background:    ${heroEl.settings.background_background}`);
    console.log(`      - background_gradient_type: ${heroEl.settings.background_gradient_type}`);
    console.log(`      - background_color:         ${heroEl.settings.background_color} (${heroEl.settings.background_color_stop?.size}%)`);
    console.log(`      - background_color_b:       ${heroEl.settings.background_color_b} (${heroEl.settings.background_color_b_stop?.size}%)`);
    console.log(`      - background_gradient_angle: ${heroEl.settings.background_gradient_angle?.size}deg`);

    assert.strictEqual(heroEl.settings.background_background, 'gradient');
    assert.strictEqual(heroEl.settings.background_gradient_type, 'linear');
    assert.strictEqual(heroEl.settings.background_color, 'rgb(255, 0, 0)');
    assert.strictEqual(heroEl.settings.background_color_stop.size, 20);
    assert.strictEqual(heroEl.settings.background_color_b, 'rgb(0, 0, 255)');
    assert.strictEqual(heroEl.settings.background_color_b_stop.size, 80);
    assert.strictEqual(heroEl.settings.background_gradient_angle.size, 135);

    console.log('    • Rendering Elementor template to virtual HTML...');
    const previewHtml = renderElementorToHtml(compileResult.templateJson, { fonts: gtSnapshot.fonts });

    console.log('    • Capturing render snapshot with Chromium...');
    const renderSnapshot = await captureRenderSnapshot(previewHtml);

    const renderNode = renderSnapshot.viewports.desktop.flat[heroNode.sid];
    assert(renderNode, 'Rendered node must exist in desktop render snapshot');

    console.log('    • Chromium Rendered Computed Styles:');
    console.log(`      - background-image: ${renderNode.styles.backgroundImage}`);
    console.log(`      - background-color: ${renderNode.styles.backgroundColor}`);

    // Computed style in Chromium matches exactly
    assert.strictEqual(renderNode.styles.backgroundImage, 'linear-gradient(135deg, rgb(255, 0, 0) 20%, rgb(0, 0, 255) 80%)');
    assert.strictEqual(renderNode.styles.backgroundColor, 'rgba(0, 0, 0, 0)');

    console.log('    • Running Per-Widget Verification Matrix Audit...');
    const matrixResult = auditVerificationMatrix(gtSnapshot, renderSnapshot, compileResult.templateJson);

    // 8.1 Positive test: Desktop supported matching 2-stop linear gradient yields ZERO RULE-SURFACE-01 defects
    const desktopSurfaceDefects = matrixResult.defects.filter(
      d => d.nodeSid === heroNode.sid && d.rule === 'RULE-SURFACE-01' && d.viewport === 'desktop'
    );
    console.log(`    • Desktop RULE-SURFACE-01 defects count: ${desktopSurfaceDefects.length}`);
    assert.strictEqual(desktopSurfaceDefects.length, 0, 'Supported 2-stop linear gradient must produce 0 RULE-SURFACE-01 defects on desktop');

    // 8.2 Negative Test 1: Mismatch in angle between GT and render
    console.log('    • [Negative 1] Testing angle mismatch between GT and render...');
    const angleMismatchRender = JSON.parse(JSON.stringify(renderSnapshot));
    angleMismatchRender.viewports.desktop.flat[heroNode.sid].styles.backgroundImage = 'linear-gradient(90deg, rgb(255, 0, 0) 20%, rgb(0, 0, 255) 80%)';
    const angleMismatchAudit = auditVerificationMatrix(gtSnapshot, angleMismatchRender, compileResult.templateJson);
    const angleDefect = angleMismatchAudit.defects.find(
      d => d.nodeSid === heroNode.sid && d.rule === 'RULE-SURFACE-01' && d.viewport === 'desktop'
    );
    assert(angleDefect, 'Angle mismatch must emit RULE-SURFACE-01 defect');
    assert.strictEqual(angleDefect.severity, 'HIGH');
    assert.strictEqual(angleDefect.property, 'backgroundImage');
    assert(angleDefect.message.includes('gradient angle mismatch'), `Expected message to contain angle mismatch, got: ${angleDefect.message}`);
    console.log('    • ACTUAL Defect Record for Angle Mismatch:');
    console.log(JSON.stringify(angleDefect, null, 2));

    // 8.3 Negative Test 2: Mismatch in stop position between GT and render
    console.log('    • [Negative 2] Testing stop position mismatch between GT and render...');
    const stopMismatchRender = JSON.parse(JSON.stringify(renderSnapshot));
    stopMismatchRender.viewports.desktop.flat[heroNode.sid].styles.backgroundImage = 'linear-gradient(135deg, rgb(255, 0, 0) 30%, rgb(0, 0, 255) 80%)';
    const stopMismatchAudit = auditVerificationMatrix(gtSnapshot, stopMismatchRender, compileResult.templateJson);
    const stopDefect = stopMismatchAudit.defects.find(
      d => d.nodeSid === heroNode.sid && d.rule === 'RULE-SURFACE-01' && d.viewport === 'desktop'
    );
    assert(stopDefect, 'Stop position mismatch must emit RULE-SURFACE-01 defect');
    assert.strictEqual(stopDefect.severity, 'HIGH');
    assert(stopDefect.message.includes('gradient stop mismatch'), `Expected message to contain stop mismatch, got: ${stopDefect.message}`);
    console.log('    • ACTUAL Defect Record for Stop Position Mismatch:');
    console.log(JSON.stringify(stopDefect, null, 2));

    // 8.4 Negative Test 3: Mismatch in stop color (RGB or alpha) between GT and render
    console.log('    • [Negative 3] Testing stop color and alpha mismatch between GT and render...');
    const colorMismatchRender = JSON.parse(JSON.stringify(renderSnapshot));
    colorMismatchRender.viewports.desktop.flat[heroNode.sid].styles.backgroundImage = 'linear-gradient(135deg, rgb(0, 255, 0) 20%, rgb(0, 0, 255) 80%)';
    const colorMismatchAudit = auditVerificationMatrix(gtSnapshot, colorMismatchRender, compileResult.templateJson);
    const colorDefect = colorMismatchAudit.defects.find(
      d => d.nodeSid === heroNode.sid && d.rule === 'RULE-SURFACE-01' && d.viewport === 'desktop'
    );
    assert(colorDefect, 'Color RGB mismatch must emit RULE-SURFACE-01 defect');
    assert.strictEqual(colorDefect.severity, 'HIGH');
    assert(colorDefect.message.includes('first gradient color mismatch'), `Expected message to contain color mismatch, got: ${colorDefect.message}`);

    const alphaMismatchRender = JSON.parse(JSON.stringify(renderSnapshot));
    alphaMismatchRender.viewports.desktop.flat[heroNode.sid].styles.backgroundImage = 'linear-gradient(135deg, rgba(255, 0, 0, 0.5) 20%, rgb(0, 0, 255) 80%)';
    const alphaMismatchAudit = auditVerificationMatrix(gtSnapshot, alphaMismatchRender, compileResult.templateJson);
    const alphaDefect = alphaMismatchAudit.defects.find(
      d => d.nodeSid === heroNode.sid && d.rule === 'RULE-SURFACE-01' && d.viewport === 'desktop'
    );
    assert(alphaDefect, 'Color alpha mismatch must emit RULE-SURFACE-01 defect');
    assert.strictEqual(alphaDefect.severity, 'HIGH');

    // 8.5 Negative Test 4: Template settings missing or mismatched while render matches
    console.log('    • [Negative 4] Testing template settings tampered / missing...');
    const badTmpl = JSON.parse(JSON.stringify(compileResult.templateJson));
    const tmplHero = collectAllElements(badTmpl.content || []).find(
      e => e.settings?._element_id === 'grad-hero-box' || e._element_id === 'grad-hero-box'
    );
    assert(tmplHero, 'Template hero element must exist');
    tmplHero.settings.background_gradient_angle = { unit: 'deg', size: 45, sizes: [] };
    const tmplMismatchAudit = auditVerificationMatrix(gtSnapshot, renderSnapshot, badTmpl);
    const tmplDefect = tmplMismatchAudit.defects.find(
      d => d.nodeSid === heroNode.sid && d.rule === 'RULE-SURFACE-01' && d.viewport === 'desktop'
    );
    assert(tmplDefect, 'Tampered template setting must emit RULE-SURFACE-01 defect');
    assert.strictEqual(tmplDefect.severity, 'HIGH');
    assert(tmplDefect.message.includes('native gradient template settings invalid'), `Expected template invalid message, got: ${tmplDefect.message}`);

    // 8.6 Negative Test 5: Rendered backgroundColor opaque instead of transparent
    console.log('    • [Negative 5] Testing opaque rendered backgroundColor (contract violation)...');
    const opaqueBgRender = JSON.parse(JSON.stringify(renderSnapshot));
    opaqueBgRender.viewports.desktop.flat[heroNode.sid].styles.backgroundColor = 'rgb(255, 255, 255)';
    const opaqueBgAudit = auditVerificationMatrix(gtSnapshot, opaqueBgRender, compileResult.templateJson);
    const opaqueBgDefect = opaqueBgAudit.defects.find(
      d => d.nodeSid === heroNode.sid && d.rule === 'RULE-SURFACE-01' && d.viewport === 'desktop'
    );
    assert(opaqueBgDefect, 'Opaque rendered backgroundColor must emit RULE-SURFACE-01 defect');
    assert.strictEqual(opaqueBgDefect.severity, 'HIGH');
    assert(opaqueBgDefect.message.includes('opaque_base_color'), `Expected opaque_base_color in message, got: ${opaqueBgDefect.message}`);

    // 8.7 Negative Test 6: Multi-viewport: desktop matches (0 defects), mobile GT diverges (HIGH defect on mobile)
    console.log('    • [Negative 6] Testing multi-viewport divergence (desktop clean, mobile HIGH)...');
    const multiVpGt = JSON.parse(JSON.stringify(gtSnapshot));
    const mobileHeroGt = multiVpGt.viewports.mobile.flat[heroNode.sid];
    const mobileHeroRef = mobileHeroGt.computedStyleRef;
    multiVpGt.viewports.mobile.styleDictionary[mobileHeroRef]['background-image'] = 'linear-gradient(90deg, rgb(0, 255, 0) 10%, rgb(255, 255, 0) 90%)';
    multiVpGt.viewports.mobile.flat[heroNode.sid].styles.backgroundImage = 'linear-gradient(90deg, rgb(0, 255, 0) 10%, rgb(255, 255, 0) 90%)';

    const multiVpAudit = auditVerificationMatrix(multiVpGt, renderSnapshot, compileResult.templateJson);
    const multiVpDesktopDefects = multiVpAudit.defects.filter(
      d => d.nodeSid === heroNode.sid && d.rule === 'RULE-SURFACE-01' && d.viewport === 'desktop'
    );
    const multiVpMobileDefects = multiVpAudit.defects.filter(
      d => d.nodeSid === heroNode.sid && d.rule === 'RULE-SURFACE-01' && d.viewport === 'mobile'
    );

    assert.strictEqual(multiVpDesktopDefects.length, 0, 'Desktop must retain 0 defects even when mobile diverges');
    assert.strictEqual(multiVpMobileDefects.length, 1, 'Mobile divergence must produce exactly 1 RULE-SURFACE-01 defect');
    assert.strictEqual(multiVpMobileDefects[0].severity, 'HIGH');
    console.log('    • ACTUAL Defect Record for Mobile Divergence:');
    console.log(JSON.stringify(multiVpMobileDefects[0], null, 2));

    // 8.8 Negative Test 7: Rendered backgroundColor is empty string ('') -> HIGH defect (missing_render_background_color)
    console.log('    • [Negative 7] Testing empty rendered backgroundColor (must not pass as transparent)...');
    const emptyBgRender = JSON.parse(JSON.stringify(renderSnapshot));
    emptyBgRender.viewports.desktop.flat[heroNode.sid].styles.backgroundColor = '';
    const emptyBgAudit = auditVerificationMatrix(gtSnapshot, emptyBgRender, compileResult.templateJson);
    const emptyBgDefect = emptyBgAudit.defects.find(
      d => d.nodeSid === heroNode.sid && d.rule === 'RULE-SURFACE-01' && d.viewport === 'desktop'
    );
    assert(emptyBgDefect, 'Empty rendered backgroundColor must emit RULE-SURFACE-01 defect');
    assert.strictEqual(emptyBgDefect.severity, 'HIGH');
    assert.strictEqual(emptyBgDefect.property, 'backgroundColor');
    assert.strictEqual(emptyBgDefect.rendered, 'missing_render_background_color');
    console.log('    • ACTUAL Defect Record for Empty Rendered Background Color:');
    console.log(JSON.stringify(emptyBgDefect, null, 2));

    // 8.9 Negative Test 8: Template has background_image = {url: '', id: ''} -> HIGH defect (must be absent)
    console.log('    • [Negative 8] Testing template with background_image = {url: "", id: ""} (must be absent)...');
    const bgImgPresentTmpl = JSON.parse(JSON.stringify(compileResult.templateJson));
    const tmplHeroWithBg = collectAllElements(bgImgPresentTmpl.content || []).find(
      e => e.settings?._element_id === 'grad-hero-box' || e._element_id === 'grad-hero-box'
    );
    assert(tmplHeroWithBg, 'Template hero element must exist');
    tmplHeroWithBg.settings.background_image = { url: '', id: '' };
    const bgImgPresentAudit = auditVerificationMatrix(gtSnapshot, renderSnapshot, bgImgPresentTmpl);
    const bgImgPresentDefect = bgImgPresentAudit.defects.find(
      d => d.nodeSid === heroNode.sid && d.rule === 'RULE-SURFACE-01' && d.viewport === 'desktop'
    );
    assert(bgImgPresentDefect, 'Template with background_image property must emit RULE-SURFACE-01 defect');
    assert.strictEqual(bgImgPresentDefect.severity, 'HIGH');
    assert.strictEqual(bgImgPresentDefect.property, 'backgroundImage');
    assert(bgImgPresentDefect.message.includes('background_image must be absent'), `Expected message to state background_image must be absent, got: ${bgImgPresentDefect.message}`);
    console.log('    • ACTUAL Defect Record for Template background_image Present:');
    console.log(JSON.stringify(bgImgPresentDefect, null, 2));
  });

  // ---------------------------------------------------------------------------
  // Test 9: Actual Defect Record for Unsupported Multi-Layer Gradient
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 9] Actual Defect Record for Unsupported Multi-Layer Background');

  runTest('9. Verification matrix reports actual defect for unsupported multi-layer background', () => {
    const multiLayerBg = 'linear-gradient(rgb(255, 0, 0), rgb(0, 0, 255)), url("https://example.com/bg.png")';
    const gt = make3VpGtSnapshot({
      sid: 'c_multi_audit',
      bgImage: multiLayerBg,
      bgColor: 'rgba(0, 0, 0, 0)'
    });

    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });

    // Render virtual preview
    const previewHtml = renderElementorToHtml({ content: elements, page_settings: {} }, { fonts: [] });
    // In unsupported multi-layer, virtual preview has none/missing background image
    const renderSnap = make3VpRenderSnapshot({
      sid: 'c_multi_audit',
      widgetId: elements[0].id,
      bgImage: 'none',
      bgColor: 'rgba(0, 0, 0, 0)'
    });

    const matrixResult = auditVerificationMatrix(gt, renderSnap, { content: elements, page_settings: {} });

    const multiLayerDefect = matrixResult.defects.find(
      d => d.nodeSid === 'c_multi_audit' && d.rule === 'RULE-SURFACE-01' && d.viewport === 'desktop'
    );
    assert(multiLayerDefect, 'RULE-SURFACE-01 defect must be logged for missing/unsupported multi-layer background');

    console.log('    • ACTUAL Defect Record for Unsupported Multi-Layer:');
    console.log(JSON.stringify(multiLayerDefect, null, 2));

    assert.strictEqual(multiLayerDefect.rule, 'RULE-SURFACE-01');
    assert.strictEqual(multiLayerDefect.severity, 'HIGH');
    assert.strictEqual(multiLayerDefect.property, 'backgroundImage');
    assert.strictEqual(multiLayerDefect.original, multiLayerBg);
    assert.strictEqual(multiLayerDefect.rendered, 'none');
  });

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log(`ALL ${passedTests}/${totalTests} TESTS PASSED CLEANLY (100%)`);
  console.log('========================================================================');
})();

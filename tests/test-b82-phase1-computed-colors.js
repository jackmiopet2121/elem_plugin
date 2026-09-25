/**
 * Block 8.2 — Phase 1: Full Computed-Style Bridge & Native Colors Verification.
 *
 * Tests:
 * 1. Chromium full computed style resolution directly from styleDictionary for native container and button.
 * 2. Raw color preservation without lossy normalization, hex rounding, or alpha stripping (rgba).
 * 3. Transparent background recognition (omitted as visual fill).
 * 4. Ground-truth tamper test: modifying legacy gt.styles does not alter output derived from styleDictionary.
 * 5. Strict error throwing on broken computedStyleRef (FULL_STYLE_REF_MISSING) when dictionary is populated.
 * 6. Strict error throwing on missing CSS property (FULL_STYLE_PROPERTY_MISSING) when dictionary is populated.
 * 7. Legacy synthetic snapshot fallback when styleDictionary is omitted.
 * 8. Confirmation that container and button remain native primitives (not HTML widgets).
 */

const assert = require('assert');
const { captureGroundTruth } = require('../src/smart/style-snapshot');
const { parseHtmlToAst } = require('../src/parser/html-parser');
const { compileGroundTruthToElementor } = require('../src/smart/geometry-mapper');
const {
  readComputedCssProperty,
  isFullyTransparentColor
} = require('../src/smart/computed-style-resolver');

(async () => {
  console.log('========================================================================');
  console.log('BLOCK 8.2 — PHASE 1: FULL COMPUTED-STYLE BRIDGE & NATIVE COLORS');
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

  // ---------------------------------------------------------------------------
  // Helper: flatten Elementor element tree
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // Suite 1: Pure helper isFullyTransparentColor
  // ---------------------------------------------------------------------------
  console.log('▶ [SUITE 1] Helper isFullyTransparentColor Unit Verification');

  runTest('Recognizes "transparent" keyword', () => {
    assert.strictEqual(isFullyTransparentColor('transparent'), true);
    assert.strictEqual(isFullyTransparentColor('TRANSPARENT'), true);
    assert.strictEqual(isFullyTransparentColor('  transparent  '), true);
  });

  runTest('Recognizes rgba with alpha 0', () => {
    assert.strictEqual(isFullyTransparentColor('rgba(0, 0, 0, 0)'), true);
    assert.strictEqual(isFullyTransparentColor('rgba(255, 255, 255, 0)'), true);
    assert.strictEqual(isFullyTransparentColor('rgba(12, 34, 56, 0.0)'), true);
    assert.strictEqual(isFullyTransparentColor('rgba(0,0,0,0)'), true);
  });

  runTest('Rejects rgba with alpha >= 0.01', () => {
    assert.strictEqual(isFullyTransparentColor('rgba(0, 0, 0, 0.01)'), false);
    assert.strictEqual(isFullyTransparentColor('rgba(0, 0, 0, 0.001)'), false);
    assert.strictEqual(isFullyTransparentColor('rgba(255, 0, 0, 0.5)'), false);
    assert.strictEqual(isFullyTransparentColor('rgba(255, 255, 255, 1)'), false);
    assert.strictEqual(isFullyTransparentColor('rgb(255, 255, 255)'), false);
  });

  runTest('Rejects non-string and empty values', () => {
    assert.strictEqual(isFullyTransparentColor(''), false);
    assert.strictEqual(isFullyTransparentColor(null), false);
    assert.strictEqual(isFullyTransparentColor(undefined), false);
  });

  // ---------------------------------------------------------------------------
  // Suite 2: Synthetic DOM Capture & Ground-Truth Mapping
  // ---------------------------------------------------------------------------
  console.log('\n▶ [SUITE 2] Synthetic DOM Capture & Mapping with Chromium styleDictionary');

  const syntheticHtml = `<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      margin: 0;
      padding: 20px;
    }
    .alpha-container {
      background-color: rgba(30, 41, 59, 0.85);
      padding: 24px;
      margin-bottom: 20px;
    }
    .alpha-button {
      background-color: rgba(14, 165, 233, 0.9);
      color: rgba(255, 255, 255, 0.95);
      padding: 12px 24px;
      display: inline-block;
      text-decoration: none;
      font-size: 16px;
    }
    .transparent-container {
      background-color: transparent;
      padding: 16px;
      margin-bottom: 20px;
    }
    .transparent-button {
      background-color: rgba(0, 0, 0, 0);
      color: rgb(15, 23, 42);
      padding: 10px 20px;
      display: inline-block;
      text-decoration: none;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="alpha-container" id="alpha-box">
    <a href="#action" class="alpha-button" id="alpha-btn">Alpha Action</a>
  </div>
  <div class="transparent-container" id="trans-box">
    <button class="transparent-button" id="trans-btn">Transparent Action</button>
  </div>
</body>
</html>`;

  console.log('  Capturing synthetic ground truth snapshot...');
  const gtSnapshot = await captureGroundTruth(syntheticHtml);
  const vpDesktop = gtSnapshot.viewports.desktop;
  assert(vpDesktop.styleDictionary, 'Desktop styleDictionary must be populated');
  assert(Object.keys(vpDesktop.styleDictionary).length > 0, 'styleDictionary must contain entries');

  const ast = parseHtmlToAst(gtSnapshot.annotatedHtml || syntheticHtml);
  const elements = compileGroundTruthToElementor(ast, gtSnapshot, { viewport: 'desktop' });
  const allElements = collectAllElements(elements);

  const alphaBoxEl = allElements.find(e => e.settings?._element_id === 'alpha-box');
  const alphaBtnEl = allElements.find(e => e.settings?._element_id === 'alpha-btn');
  const transBoxEl = allElements.find(e => e.settings?._element_id === 'trans-box');
  const transBtnEl = allElements.find(e => e.settings?._element_id === 'trans-btn');

  runTest('Alpha container resolves raw background-color from styleDictionary with alpha preserved', () => {
    assert(alphaBoxEl, 'alpha-box element must be mapped');
    assert.strictEqual(alphaBoxEl.elType, 'container', 'alpha-box must remain a native container');
    assert.strictEqual(alphaBoxEl.widgetType, undefined, 'container must not have widgetType');
    assert.strictEqual(alphaBoxEl.settings.background_background, 'classic');

    const gtNode = Object.values(vpDesktop.flat).find(n => n.id === 'alpha-box');
    assert(gtNode, 'alpha-box node must exist in desktop flat');
    const expectedBg = vpDesktop.styleDictionary[gtNode.computedStyleRef]['background-color'];
    assert(expectedBg.startsWith('rgba(') && expectedBg.includes('0.85'), `Expected raw rgba with 0.85, got: ${expectedBg}`);
    assert.strictEqual(alphaBoxEl.settings.background_color, expectedBg);
  });

  runTest('Alpha button resolves raw background_color and button_text_color from styleDictionary', () => {
    assert(alphaBtnEl, 'alpha-btn element must be mapped');
    assert.strictEqual(alphaBtnEl.elType, 'widget');
    assert.strictEqual(alphaBtnEl.widgetType, 'button', 'alpha-btn must remain a native button');

    const gtNode = Object.values(vpDesktop.flat).find(n => n.id === 'alpha-btn');
    assert(gtNode, 'alpha-btn node must exist in desktop flat');
    const expectedBg = vpDesktop.styleDictionary[gtNode.computedStyleRef]['background-color'];
    const expectedColor = vpDesktop.styleDictionary[gtNode.computedStyleRef]['color'];

    assert(expectedBg.startsWith('rgba(') && expectedBg.includes('0.9'), `Expected raw rgba background, got: ${expectedBg}`);
    assert(expectedColor.startsWith('rgba(') && expectedColor.includes('0.95'), `Expected raw rgba text color, got: ${expectedColor}`);
    assert.strictEqual(alphaBtnEl.settings.background_color, expectedBg);
    assert.strictEqual(alphaBtnEl.settings.button_text_color, expectedColor);
  });

  runTest('Transparent container does not emit native background color setting', () => {
    assert(transBoxEl, 'trans-box element must be mapped');
    assert.strictEqual(transBoxEl.elType, 'container');
    assert.strictEqual(transBoxEl.settings.background_background, undefined, 'transparent container must omit background_background');
    assert.strictEqual(transBoxEl.settings.background_color, undefined, 'transparent container must omit background_color');
  });

  runTest('Transparent button emits exact raw background_color and button_text_color', () => {
    assert(transBtnEl, 'trans-btn element must be mapped');
    assert.strictEqual(transBtnEl.elType, 'widget');
    assert.strictEqual(transBtnEl.widgetType, 'button');

    const gtNode = Object.values(vpDesktop.flat).find(n => n.id === 'trans-btn');
    assert(gtNode, 'trans-btn node must exist in desktop flat');
    const expectedBg = vpDesktop.styleDictionary[gtNode.computedStyleRef]['background-color'];
    const expectedColor = vpDesktop.styleDictionary[gtNode.computedStyleRef]['color'];

    // In Phase 2: button emits raw background_color even if transparent to prevent theme button overrides
    assert.strictEqual(transBtnEl.settings.background_color, expectedBg);
    assert.strictEqual(transBtnEl.settings.button_text_color, expectedColor);
  });

  runTest('All tested elements remain native Elementor primitives and never fall back to HTML widgets', () => {
    const ids = ['alpha-box', 'alpha-btn', 'trans-box', 'trans-btn'];
    for (const id of ids) {
      const el = allElements.find(e => e.settings?._element_id === id);
      assert(el, `Element ${id} must exist`);
      assert.notStrictEqual(el.widgetType, 'html', `Element ${id} must not be an HTML widget`);
      assert.strictEqual(el.settings._html_reason, undefined, `Element ${id} must not have _html_reason`);
    }
  });

  // ---------------------------------------------------------------------------
  // Suite 3: Tamper Immunity (styleDictionary takes strict precedence over gt.styles)
  // ---------------------------------------------------------------------------
  console.log('\n▶ [SUITE 3] Tamper Immunity: gt.styles corruption does not pollute output');

  runTest('Corrupting gt.styles in snapshot copy leaves output colors intact from styleDictionary', () => {
    const tamperedSnapshot = JSON.parse(JSON.stringify(gtSnapshot));
    for (const sid of Object.keys(tamperedSnapshot.viewports.desktop.flat)) {
      const node = tamperedSnapshot.viewports.desktop.flat[sid];
      if (node.styles) {
        node.styles.backgroundColor = 'rgb(255, 0, 0)';
        node.styles.color = 'rgb(0, 255, 0)';
      }
    }

    const tamperedElements = compileGroundTruthToElementor(ast, tamperedSnapshot, { viewport: 'desktop' });
    const tamperedAll = collectAllElements(tamperedElements);

    const tamperedBox = tamperedAll.find(e => e.settings?._element_id === 'alpha-box');
    const tamperedBtn = tamperedAll.find(e => e.settings?._element_id === 'alpha-btn');

    assert(tamperedBox && tamperedBtn);
    // Colors must match the original styleDictionary values, NOT the corrupted gt.styles
    assert.strictEqual(tamperedBox.settings.background_color, alphaBoxEl.settings.background_color);
    assert.strictEqual(tamperedBtn.settings.background_color, alphaBtnEl.settings.background_color);
    assert.strictEqual(tamperedBtn.settings.button_text_color, alphaBtnEl.settings.button_text_color);
    assert.notStrictEqual(tamperedBox.settings.background_color, 'rgb(255, 0, 0)');
    assert.notStrictEqual(tamperedBtn.settings.button_text_color, 'rgb(0, 255, 0)');
  });

  // ---------------------------------------------------------------------------
  // Suite 4: Strict Error Invariants (No Silent Fallback on Populated Dictionaries)
  // ---------------------------------------------------------------------------
  console.log('\n▶ [SUITE 4] Error Invariants: Populated dictionary failures throw explicit errors');

  runTest('Broken computedStyleRef throws FULL_STYLE_REF_MISSING without silent fallback', () => {
    let thrown = null;
    try {
      readComputedCssProperty(
        { sid: 'sid-test-broken', computedStyleRef: 'non-existent-hash' },
        gtSnapshot,
        'desktop',
        'background-color',
        'backgroundColor'
      );
    } catch (err) {
      thrown = err;
    }
    assert(thrown, 'Must throw error when computedStyleRef is not in populated styleDictionary');
    assert.strictEqual(thrown.reason, 'FULL_STYLE_REF_MISSING');
    assert.strictEqual(thrown.code, 'FULL_STYLE_REF_MISSING');
    assert.strictEqual(thrown.sid, 'sid-test-broken');
    assert.strictEqual(thrown.viewport, 'desktop');
    assert.strictEqual(thrown.property, 'background-color');
  });

  runTest('styleDictionary: {} is not legacy and throws FULL_STYLE_REF_MISSING', () => {
    let thrown = null;
    try {
      readComputedCssProperty(
        { sid: 'sid-empty-dict', computedStyleRef: 'ref-any', styles: { backgroundColor: '#123456' } },
        { viewports: { desktop: { styleDictionary: {} } } },
        'desktop',
        'background-color',
        'backgroundColor'
      );
    } catch (err) {
      thrown = err;
    }
    assert(thrown, 'Empty styleDictionary must throw FULL_STYLE_REF_MISSING, not fall back to gt.styles');
    assert.strictEqual(thrown.reason, 'FULL_STYLE_REF_MISSING');
    assert.strictEqual(thrown.code, 'FULL_STYLE_REF_MISSING');
    assert.strictEqual(thrown.sid, 'sid-empty-dict');
  });

  runTest('Missing requested viewport in multi-viewport snapshot throws FULL_STYLE_VIEWPORT_MISSING', () => {
    let thrown = null;
    try {
      readComputedCssProperty(
        { sid: 'sid-missing-vp', computedStyleRef: 'ref-1' },
        gtSnapshot,
        'nonexistent-viewport',
        'background-color',
        'backgroundColor'
      );
    } catch (err) {
      thrown = err;
    }
    assert(thrown, 'Missing viewport must throw FULL_STYLE_VIEWPORT_MISSING');
    assert.strictEqual(thrown.reason, 'FULL_STYLE_VIEWPORT_MISSING');
    assert.strictEqual(thrown.code, 'FULL_STYLE_VIEWPORT_MISSING');
    assert.strictEqual(thrown.sid, 'sid-missing-vp');
    assert.strictEqual(thrown.viewport, 'nonexistent-viewport');
    assert.strictEqual(thrown.property, 'background-color');
  });

  runTest('Missing property in styleDictionary throws FULL_STYLE_PROPERTY_MISSING', () => {
    const validNode = Object.values(vpDesktop.flat)[0];
    let thrown = null;
    try {
      readComputedCssProperty(
        validNode,
        gtSnapshot,
        'desktop',
        'non-existent-css-property',
        'nonExistent'
      );
    } catch (err) {
      thrown = err;
    }
    assert(thrown, 'Must throw error when CSS property is missing in dictionary entry');
    assert.strictEqual(thrown.reason, 'FULL_STYLE_PROPERTY_MISSING');
    assert.strictEqual(thrown.code, 'FULL_STYLE_PROPERTY_MISSING');
    assert.strictEqual(thrown.sid, validNode.sid);
    assert.strictEqual(thrown.viewport, 'desktop');
    assert.strictEqual(thrown.property, 'non-existent-css-property');
  });

  // ---------------------------------------------------------------------------
  // Suite 5: Legacy Synthetic Fallback (Only when dictionary is missing)
  // ---------------------------------------------------------------------------
  console.log('\n▶ [SUITE 5] Legacy Synthetic Fallback (When styleDictionary is absent)');

  runTest('Legacy snapshot without styleDictionary resolves colors via gt.styles', () => {
    const legacySnapshot = {
      viewports: {
        desktop: {
          flat: {
            'leg-box': {
              sid: 'leg-box',
              tagName: 'div',
              styles: {
                backgroundColor: 'rgb(243, 244, 246)'
              },
              rect: { x: 0, y: 0, w: 800, h: 400 }
            },
            'leg-btn': {
              sid: 'leg-btn',
              tagName: 'a',
              directText: 'Legacy Button',
              styles: {
                backgroundColor: 'rgb(79, 70, 229)',
                color: 'rgb(255, 255, 255)'
              },
              rect: { x: 20, y: 20, w: 120, h: 44 }
            }
          }
        }
      }
    };

    const resolvedBoxBg = readComputedCssProperty(
      legacySnapshot.viewports.desktop.flat['leg-box'],
      legacySnapshot,
      'desktop',
      'background-color',
      'backgroundColor'
    );
    assert.strictEqual(resolvedBoxBg, 'rgb(243, 244, 246)');

    const resolvedBtnBg = readComputedCssProperty(
      legacySnapshot.viewports.desktop.flat['leg-btn'],
      legacySnapshot,
      'desktop',
      'background-color',
      'backgroundColor'
    );
    assert.strictEqual(resolvedBtnBg, 'rgb(79, 70, 229)');

    const resolvedBtnColor = readComputedCssProperty(
      legacySnapshot.viewports.desktop.flat['leg-btn'],
      legacySnapshot,
      'desktop',
      'color',
      'color'
    );
    assert.strictEqual(resolvedBtnColor, 'rgb(255, 255, 255)');
  });

  console.log('\n========================================================================');
  console.log(`✓ BLOCK 8.2 PHASE 1 VERIFICATION PASSED: ${passedTests}/${totalTests} TESTS PASSED (100%)`);
  console.log('========================================================================');
})().catch(err => {
  console.error('\n✖ BLOCK 8.2 PHASE 1 VERIFICATION FAILED:', err);
  process.exit(1);
});

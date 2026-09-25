/**
 * Block 8.2 — Phase 2: Strict Style Source & Native Color Semantics.
 *
 * Verifies:
 * 1. Native heading and text-editor widgets read 'color' directly from styleDictionary (non-gradient branch).
 * 2. Alpha preservation (rgba) on heading title_color and text-editor text_color.
 * 3. Transparent color preservation on heading and text-editor without falling back to hardcoded '#111827'.
 * 4. Poison immunity: mutating legacy gt.styles.color does not alter output derived from styleDictionary.
 * 5. Button widget emits raw background-color and color even when transparent to prevent theme CSS overrides.
 * 6. Virtual-renderer output generates scoped .elementor-button CSS rules with raw background-color and color.
 *    (NOTE: This emulator test validates virtual renderer CSS emission and does not claim WP-live runtime parity).
 */

const assert = require('assert');
const { captureGroundTruth } = require('../src/smart/style-snapshot');
const { parseHtmlToAst } = require('../src/parser/html-parser');
const { compileGroundTruthToElementor } = require('../src/smart/geometry-mapper');
const { renderElementorToHtml } = require('../src/emulator/elementor-virtual-renderer');

(async () => {
  console.log('========================================================================');
  console.log('BLOCK 8.2 — PHASE 2: STRICT STYLE SOURCE & NATIVE COLOR SEMANTICS');
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
  // Synthetic HTML Fixture: Alpha and Transparent Headings, Texts, and Button
  // ---------------------------------------------------------------------------
  const syntheticHtml = `<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      margin: 0;
      padding: 24px;
      font-family: sans-serif;
    }
    .alpha-heading {
      color: rgba(59, 130, 246, 0.85);
      font-size: 28px;
      margin: 0 0 16px 0;
    }
    .alpha-text {
      color: rgba(16, 185, 129, 0.9);
      font-size: 16px;
      line-height: 1.5;
      margin: 0 0 20px 0;
    }
    .trans-heading {
      color: rgba(0, 0, 0, 0);
      font-size: 22px;
      margin: 0 0 12px 0;
    }
    .trans-text {
      color: transparent;
      font-size: 14px;
      margin: 0 0 20px 0;
    }
    .trans-button {
      background-color: rgba(0, 0, 0, 0);
      color: rgba(255, 255, 255, 0.7);
      padding: 10px 20px;
      display: inline-block;
      text-decoration: none;
      font-size: 15px;
    }
  </style>
</head>
<body>
  <div id="content-container">
    <h1 class="alpha-heading" id="alpha-head">Alpha Blue Heading</h1>
    <p class="alpha-text" id="alpha-para">Alpha green descriptive paragraph content.</p>
    <h2 class="trans-heading" id="trans-head">Transparent Ghost Heading</h2>
    <p class="trans-text" id="trans-para">Transparent paragraph content.</p>
    <a href="#click" class="trans-button" id="ghost-btn">Ghost Action Button</a>
  </div>
</body>
</html>`;

  console.log('▶ [SUITE 1] Capturing Synthetic Ground Truth Snapshot...');
  const gtSnapshot = await captureGroundTruth(syntheticHtml);
  const vpDesktop = gtSnapshot.viewports.desktop;
  assert(vpDesktop.styleDictionary, 'Desktop styleDictionary must be populated');

  const ast = parseHtmlToAst(gtSnapshot.annotatedHtml || syntheticHtml);
  const elements = compileGroundTruthToElementor(ast, gtSnapshot, { viewport: 'desktop' });
  const allElements = collectAllElements(elements);

  const alphaHeadEl = allElements.find(e => e.settings?._element_id === 'alpha-head');
  const alphaParaEl = allElements.find(e => e.settings?._element_id === 'alpha-para');
  const transHeadEl = allElements.find(e => e.settings?._element_id === 'trans-head');
  const transParaEl = allElements.find(e => e.settings?._element_id === 'trans-para');
  const ghostBtnEl = allElements.find(e => e.settings?._element_id === 'ghost-btn');

  // ---------------------------------------------------------------------------
  // Suite 2: Heading & Text Native Color Mapping from styleDictionary
  // ---------------------------------------------------------------------------
  console.log('\n▶ [SUITE 2] Native Heading & Text Color Mapping from styleDictionary');

  runTest('Alpha heading resolves raw title_color from styleDictionary with alpha preserved', () => {
    assert(alphaHeadEl, 'alpha-head must be mapped');
    assert.strictEqual(alphaHeadEl.elType, 'widget');
    assert.strictEqual(alphaHeadEl.widgetType, 'heading');

    const gtNode = Object.values(vpDesktop.flat).find(n => n.id === 'alpha-head');
    assert(gtNode, 'alpha-head node must exist in desktop flat');
    const expectedColor = vpDesktop.styleDictionary[gtNode.computedStyleRef]['color'];
    assert(expectedColor.startsWith('rgba(') && expectedColor.includes('0.85'), `Expected raw rgba color, got: ${expectedColor}`);
    assert.strictEqual(alphaHeadEl.settings.title_color, expectedColor);
  });

  runTest('Alpha text-editor resolves raw text_color from styleDictionary with alpha preserved', () => {
    assert(alphaParaEl, 'alpha-para must be mapped');
    assert.strictEqual(alphaParaEl.elType, 'widget');
    assert.strictEqual(alphaParaEl.widgetType, 'text-editor');

    const gtNode = Object.values(vpDesktop.flat).find(n => n.id === 'alpha-para');
    assert(gtNode, 'alpha-para node must exist in desktop flat');
    const expectedColor = vpDesktop.styleDictionary[gtNode.computedStyleRef]['color'];
    assert(expectedColor.startsWith('rgba(') && expectedColor.includes('0.9'), `Expected raw rgba color, got: ${expectedColor}`);
    assert.strictEqual(alphaParaEl.settings.text_color, expectedColor);
  });

  runTest('Transparent heading resolves raw transparent title_color without hardcoded fallback', () => {
    assert(transHeadEl, 'trans-head must be mapped');
    assert.strictEqual(transHeadEl.elType, 'widget');
    assert.strictEqual(transHeadEl.widgetType, 'heading');

    const gtNode = Object.values(vpDesktop.flat).find(n => n.id === 'trans-head');
    assert(gtNode, 'trans-head node must exist in desktop flat');
    const expectedColor = vpDesktop.styleDictionary[gtNode.computedStyleRef]['color'];
    assert.strictEqual(transHeadEl.settings.title_color, expectedColor);
    assert.notStrictEqual(transHeadEl.settings.title_color, '#111827', 'Must not fall back to hardcoded dark color');
  });

  runTest('Transparent text-editor resolves raw transparent text_color without hardcoded fallback', () => {
    assert(transParaEl, 'trans-para must be mapped');
    assert.strictEqual(transParaEl.elType, 'widget');
    assert.strictEqual(transParaEl.widgetType, 'text-editor');

    const gtNode = Object.values(vpDesktop.flat).find(n => n.id === 'trans-para');
    assert(gtNode, 'trans-para node must exist in desktop flat');
    const expectedColor = vpDesktop.styleDictionary[gtNode.computedStyleRef]['color'];
    assert.strictEqual(transParaEl.settings.text_color, expectedColor);
  });

  runTest('Transparent button emits raw background_color and button_text_color', () => {
    assert(ghostBtnEl, 'ghost-btn must be mapped');
    assert.strictEqual(ghostBtnEl.elType, 'widget');
    assert.strictEqual(ghostBtnEl.widgetType, 'button');

    const gtNode = Object.values(vpDesktop.flat).find(n => n.id === 'ghost-btn');
    assert(gtNode, 'ghost-btn node must exist in desktop flat');
    const expectedBg = vpDesktop.styleDictionary[gtNode.computedStyleRef]['background-color'];
    const expectedColor = vpDesktop.styleDictionary[gtNode.computedStyleRef]['color'];

    assert.strictEqual(ghostBtnEl.settings.background_color, expectedBg);
    assert.strictEqual(ghostBtnEl.settings.button_text_color, expectedColor);
  });

  runTest('All widgets remain native Elementor primitives and never emit HTML widgets', () => {
    const ids = ['alpha-head', 'alpha-para', 'trans-head', 'trans-para', 'ghost-btn'];
    for (const id of ids) {
      const el = allElements.find(e => e.settings?._element_id === id);
      assert(el, `Widget ${id} must exist`);
      assert.notStrictEqual(el.widgetType, 'html', `Widget ${id} must not be an HTML widget`);
      assert.strictEqual(el.settings._html_reason, undefined, `Widget ${id} must not have _html_reason`);
    }
  });

  // ---------------------------------------------------------------------------
  // Suite 3: Poisoning Immunity (gt.styles.color corruption)
  // ---------------------------------------------------------------------------
  console.log('\n▶ [SUITE 3] Poisoning Immunity: gt.styles.color corruption is ignored');

  runTest('Poisoning gt.styles.color in snapshot leaves mapped heading and text colors intact', () => {
    const poisonedSnapshot = JSON.parse(JSON.stringify(gtSnapshot));
    for (const sid of Object.keys(poisonedSnapshot.viewports.desktop.flat)) {
      const node = poisonedSnapshot.viewports.desktop.flat[sid];
      if (node.styles) {
        node.styles.color = 'rgb(255, 0, 0)'; // Poison color
      }
    }

    const poisonedElements = compileGroundTruthToElementor(ast, poisonedSnapshot, { viewport: 'desktop' });
    const poisonedAll = collectAllElements(poisonedElements);

    const pAlphaHead = poisonedAll.find(e => e.settings?._element_id === 'alpha-head');
    const pAlphaPara = poisonedAll.find(e => e.settings?._element_id === 'alpha-para');
    const pTransHead = poisonedAll.find(e => e.settings?._element_id === 'trans-head');
    const pTransPara = poisonedAll.find(e => e.settings?._element_id === 'trans-para');

    assert.strictEqual(pAlphaHead.settings.title_color, alphaHeadEl.settings.title_color);
    assert.strictEqual(pAlphaPara.settings.text_color, alphaParaEl.settings.text_color);
    assert.strictEqual(pTransHead.settings.title_color, transHeadEl.settings.title_color);
    assert.strictEqual(pTransPara.settings.text_color, transParaEl.settings.text_color);

    assert.notStrictEqual(pAlphaHead.settings.title_color, 'rgb(255, 0, 0)');
    assert.notStrictEqual(pAlphaPara.settings.text_color, 'rgb(255, 0, 0)');
  });

  // ---------------------------------------------------------------------------
  // Suite 4: Virtual Renderer Emulation Test for Scoped Button Rules
  // ---------------------------------------------------------------------------
  console.log('\n▶ [SUITE 4] Virtual Renderer Scoped Button CSS Emission');

const { resolveElementSelector } = require('../src/smart/semantic-scoper');

  runTest('Virtual renderer generates scoped .elementor-button CSS rule with raw background and color', () => {
    // NOTE: This emulator test validates virtual renderer CSS emission and does not claim WP-live runtime parity.
    const templateJson = {
      version: '0.4',
      title: 'Phase 2 Test',
      type: 'page',
      content: elements
    };

    const previewHtml = renderElementorToHtml(templateJson, { fonts: gtSnapshot.fonts });
    assert(previewHtml && previewHtml.length > 0, 'Virtual HTML preview must be generated');

    const expectedSelector = resolveElementSelector(ghostBtnEl);
    assert(expectedSelector, 'Must resolve a selector for ghost button');

    // Extract style block
    const styleMatch = previewHtml.match(/<style>([\s\S]*?)<\/style>/);
    assert(styleMatch, 'Preview HTML must include <style> block');
    const cssContent = styleMatch[1];

    // Find the scoped button rule targeting expectedSelector .elementor-button
    const escapedSelector = expectedSelector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const btnRulePattern = new RegExp(`${escapedSelector}\\s*\\.elementor-button\\s*\\{[^}]*\\}`, 's');
    const btnRuleMatch = cssContent.match(btnRulePattern);
    assert(btnRuleMatch, `Must find scoped CSS rule for ${expectedSelector} .elementor-button in virtual HTML`);

    const matchedRuleText = btnRuleMatch[0];
    const expectedBg = vpDesktop.styleDictionary[Object.values(vpDesktop.flat).find(n => n.id === 'ghost-btn').computedStyleRef]['background-color'];
    const expectedColor = vpDesktop.styleDictionary[Object.values(vpDesktop.flat).find(n => n.id === 'ghost-btn').computedStyleRef]['color'];

    assert(matchedRuleText.includes(`background-color: ${expectedBg};`), `Rule must contain raw background-color: ${expectedBg}`);
    assert(matchedRuleText.includes(`color: ${expectedColor};`), `Rule must contain raw color: ${expectedColor}`);
  });

  console.log('\n========================================================================');
  console.log(`✓ BLOCK 8.2 PHASE 2 VERIFICATION PASSED: ${passedTests}/${totalTests} TESTS PASSED (100%)`);
  console.log('========================================================================');
})().catch(err => {
  console.error('\n✖ BLOCK 8.2 PHASE 2 VERIFICATION FAILED:', err);
  process.exit(1);
});

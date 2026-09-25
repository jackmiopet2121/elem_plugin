/**
 * Block 8.2 — Phase 5 (Part 5B-1): Native Responsive Background Image Source Tests.
 *
 * Verifies:
 * 1. D/T/M same URL -> zero image source overrides.
 * 2. D=A, T=B, M=B -> tablet override B, zero mobile override; render A/B/B.
 * 3. D=A, T=B, M=A -> tablet B AND mobile A (mobile restore / reversal); render A/B/A.
 * 4. D=A, T=B, M=C -> two overrides; render A/B/C.
 * 5. URL with "gradient", comma, and ")" inside quoted url(...) remains valid single image.
 * 6. Invalid/multilayer/none/unsafe responsive source -> no guessed native override.
 * 7. Missing modern dictionary background-image -> explicit FULL_STYLE_PROPERTY_MISSING.
 * 8. Repeated responsive merge on same input -> same JSON, zero stale overrides.
 * 9. Real Chromium media-query fixture with computed URL parity.
 */

'use strict';

const assert = require('assert');
const { captureGroundTruth } = require('../src/smart/style-snapshot');
const { captureRenderSnapshot } = require('../src/smart/render-snapshot');
const { renderElementorToHtml, isSafeCssUrl } = require('../src/emulator/elementor-virtual-renderer');
const { parseHtmlToAst } = require('../src/parser/html-parser');
const { compileGroundTruthToElementor, resolveAssetUrl } = require('../src/smart/geometry-mapper');
const { mergeNodeResponsive } = require('../src/smart/responsive-merger');
const { classifyImageBackgroundState } = require('../src/smart/image-background-geometry');
const { compileHtmlToElementor } = require('../src/engine');

(async () => {
  console.log('========================================================================');
  console.log('BLOCK 8.2 — PHASE 5 (PART 5B-1): NATIVE RESPONSIVE IMAGE SOURCE');
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

  function make3VpGtImageSnapshot({
    sid = 'c_img_resp',
    bgColor = 'rgb(15, 23, 42)',
    desktopImg = 'url("https://example.com/desktop.jpg")',
    tabletImg = 'url("https://example.com/desktop.jpg")',
    mobileImg = 'url("https://example.com/desktop.jpg")',
    styleDictDesktop = undefined,
    styleDictTablet = undefined,
    styleDictMobile = undefined
  } = {}) {
    const ref = `ref-${sid}`;

    const makeDict = (imgCss, overrideDict) => {
      if (overrideDict !== undefined) return overrideDict;
      return {
        [ref]: {
          'background-color': bgColor,
          'background-image': imgCss,
          'background-size': 'cover',
          'background-position': '50% 50%',
          'background-repeat': 'no-repeat',
          'border-top-left-radius': '0px',
          'border-top-right-radius': '0px',
          'border-bottom-right-radius': '0px',
          'border-bottom-left-radius': '0px'
        }
      };
    };

    const makeNode = (imgCss) => ({
      sid,
      tag: 'div',
      role: 'container',
      computedStyleRef: ref,
      rect: { x: 0, y: 0, w: 800, h: 400 },
      styles: {
        backgroundColor: bgColor,
        backgroundImage: imgCss,
        backgroundSize: 'cover',
        backgroundPosition: '50% 50%',
        backgroundRepeat: 'no-repeat'
      }
    });

    return {
      annotatedHtml: `<div data-sid="${sid}"></div>`,
      viewports: {
        desktop: {
          flat: { [sid]: makeNode(desktopImg) },
          styleDictionary: makeDict(desktopImg, styleDictDesktop),
          canvas: {
            html: { backgroundColor: 'transparent', backgroundImage: 'none' },
            body: { backgroundColor: 'transparent', backgroundImage: 'none' }
          }
        },
        tablet: {
          flat: { [sid]: makeNode(tabletImg) },
          styleDictionary: makeDict(tabletImg, styleDictTablet),
          canvas: {
            html: { backgroundColor: 'transparent', backgroundImage: 'none' },
            body: { backgroundColor: 'transparent', backgroundImage: 'none' }
          }
        },
        mobile: {
          flat: { [sid]: makeNode(mobileImg) },
          styleDictionary: makeDict(mobileImg, styleDictMobile),
          canvas: {
            html: { backgroundColor: 'transparent', backgroundImage: 'none' },
            body: { backgroundColor: 'transparent', backgroundImage: 'none' }
          }
        }
      }
    };
  }

  // ---------------------------------------------------------------------------
  // Test 1: D/T/M same URL -> zero image source overrides; render A/A/A
  // ---------------------------------------------------------------------------
  console.log('▶ [TEST 1] Uniform Image Source Across Viewports -> Zero Responsive Overrides');

  await runAsyncTest('1. D/T/M same URL produces zero responsive overrides and renders A/A/A', async () => {
    const urlA = 'https://example.com/asset-a.jpg';
    const gt = make3VpGtImageSnapshot({
      sid: 'c_same_img',
      desktopImg: `url("${urlA}")`,
      tabletImg: `url("${urlA}")`,
      mobileImg: `url("${urlA}")`
    });

    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });
    mergeNodeResponsive(elements[0], null, gt);

    const s = elements[0].settings;
    assert.deepStrictEqual(s.background_image, { url: urlA, id: '' });
    assert.strictEqual(s.background_image_tablet, undefined, 'Must not emit tablet override when identical to desktop');
    assert.strictEqual(s.background_image_mobile, undefined, 'Must not emit mobile override when identical to tablet');

    const previewHtml = renderElementorToHtml({ content: elements, page_settings: {} });
    assert(!previewHtml.includes('background-image: url("https://example.com/asset-a.jpg");\n}'), 'No tablet media background-image rule');

    const renderSnapshot = await captureRenderSnapshot(previewHtml);
    const desk = renderSnapshot.viewports.desktop.flat['c_same_img'].styles.backgroundImage;
    const tab = renderSnapshot.viewports.tablet.flat['c_same_img'].styles.backgroundImage;
    const mob = renderSnapshot.viewports.mobile.flat['c_same_img'].styles.backgroundImage;

    assert.strictEqual(desk, `url("${urlA}")`);
    assert.strictEqual(tab, `url("${urlA}")`);
    assert.strictEqual(mob, `url("${urlA}")`);
  });

  // ---------------------------------------------------------------------------
  // Test 2: D=A, T=B, M=B -> tablet override B, zero mobile override; render A/B/B
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 2] Tablet Change, Mobile Same as Tablet -> Tablet Override Only');

  await runAsyncTest('2. D=A, T=B, M=B produces tablet override B, zero mobile override, renders A/B/B', async () => {
    const urlA = 'https://example.com/hero-desktop.jpg';
    const urlB = 'https://example.com/hero-tablet.jpg';
    const gt = make3VpGtImageSnapshot({
      sid: 'c_tab_change',
      desktopImg: `url("${urlA}")`,
      tabletImg: `url("${urlB}")`,
      mobileImg: `url("${urlB}")`
    });

    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });
    mergeNodeResponsive(elements[0], null, gt);

    const s = elements[0].settings;
    assert.deepStrictEqual(s.background_image, { url: urlA, id: '' });
    assert.deepStrictEqual(s.background_image_tablet, { url: urlB, id: '' });
    assert.strictEqual(s.background_image_mobile, undefined, 'Mobile inherits tablet B naturally via CSS cascade');

    const previewHtml = renderElementorToHtml({ content: elements, page_settings: {} });
    assert(previewHtml.includes(`background-image: url("${urlB}");`), 'Tablet rule must emit url(B)');

    const renderSnapshot = await captureRenderSnapshot(previewHtml);
    const desk = renderSnapshot.viewports.desktop.flat['c_tab_change'].styles.backgroundImage;
    const tab = renderSnapshot.viewports.tablet.flat['c_tab_change'].styles.backgroundImage;
    const mob = renderSnapshot.viewports.mobile.flat['c_tab_change'].styles.backgroundImage;

    assert.strictEqual(desk, `url("${urlA}")`);
    assert.strictEqual(tab, `url("${urlB}")`);
    assert.strictEqual(mob, `url("${urlB}")`);
  });

  // ---------------------------------------------------------------------------
  // Test 3: D=A, T=B, M=A -> tablet B AND mobile A (mobile restore / reversal); render A/B/A
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 3] Tablet Change, Mobile Reverts to Desktop -> Tablet B & Mobile A');

  await runAsyncTest('3. D=A, T=B, M=A emits both tablet B and mobile A, renders A/B/A', async () => {
    const urlA = 'https://example.com/brand-desktop.jpg';
    const urlB = 'https://example.com/brand-tablet.jpg';
    const gt = make3VpGtImageSnapshot({
      sid: 'c_reversal',
      desktopImg: `url("${urlA}")`,
      tabletImg: `url("${urlB}")`,
      mobileImg: `url("${urlA}")`
    });

    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });
    mergeNodeResponsive(elements[0], null, gt);

    const s = elements[0].settings;
    assert.deepStrictEqual(s.background_image, { url: urlA, id: '' });
    assert.deepStrictEqual(s.background_image_tablet, { url: urlB, id: '' });
    assert.deepStrictEqual(s.background_image_mobile, { url: urlA, id: '' }, 'Mobile must explicitly restore desktop URL A');

    const previewHtml = renderElementorToHtml({ content: elements, page_settings: {} });
    assert(previewHtml.includes(`background-image: url("${urlB}");`), 'Tablet CSS must have url(B)');
    assert(previewHtml.includes(`background-image: url("${urlA}");`), 'Mobile CSS must have url(A)');

    const renderSnapshot = await captureRenderSnapshot(previewHtml);
    const desk = renderSnapshot.viewports.desktop.flat['c_reversal'].styles.backgroundImage;
    const tab = renderSnapshot.viewports.tablet.flat['c_reversal'].styles.backgroundImage;
    const mob = renderSnapshot.viewports.mobile.flat['c_reversal'].styles.backgroundImage;

    assert.strictEqual(desk, `url("${urlA}")`);
    assert.strictEqual(tab, `url("${urlB}")`);
    assert.strictEqual(mob, `url("${urlA}")`);
  });

  // ---------------------------------------------------------------------------
  // Test 4: D=A, T=B, M=C -> two overrides; render A/B/C
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 4] Distinct URLs on All Viewports -> Tablet B & Mobile C');

  await runAsyncTest('4. D=A, T=B, M=C emits both overrides, renders A/B/C', async () => {
    const urlA = 'https://example.com/hero-d.jpg';
    const urlB = 'https://example.com/hero-t.jpg';
    const urlC = 'https://example.com/hero-m.jpg';
    const gt = make3VpGtImageSnapshot({
      sid: 'c_all_diff',
      desktopImg: `url("${urlA}")`,
      tabletImg: `url("${urlB}")`,
      mobileImg: `url("${urlC}")`
    });

    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });
    mergeNodeResponsive(elements[0], null, gt);

    const s = elements[0].settings;
    assert.deepStrictEqual(s.background_image, { url: urlA, id: '' });
    assert.deepStrictEqual(s.background_image_tablet, { url: urlB, id: '' });
    assert.deepStrictEqual(s.background_image_mobile, { url: urlC, id: '' });

    const previewHtml = renderElementorToHtml({ content: elements, page_settings: {} });
    const renderSnapshot = await captureRenderSnapshot(previewHtml);
    const desk = renderSnapshot.viewports.desktop.flat['c_all_diff'].styles.backgroundImage;
    const tab = renderSnapshot.viewports.tablet.flat['c_all_diff'].styles.backgroundImage;
    const mob = renderSnapshot.viewports.mobile.flat['c_all_diff'].styles.backgroundImage;

    assert.strictEqual(desk, `url("${urlA}")`);
    assert.strictEqual(tab, `url("${urlB}")`);
    assert.strictEqual(mob, `url("${urlC}")`);
  });

  // ---------------------------------------------------------------------------
  // Test 5: Quoted URL with "gradient", comma, and ")" inside quoted url(...)
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 5] Complex Quoted URL ("gradient", comma, ")" in URL)');

  await runAsyncTest('5. Quoted URL with "gradient", comma, and ")" parses and maps to valid responsive override', async () => {
    const urlDesktop = 'https://example.com/assets/gradient,special(v1).png';
    const urlTablet = 'https://example.com/assets/gradient,special(v2).png';
    const gt = make3VpGtImageSnapshot({
      sid: 'c_complex_resp',
      desktopImg: `url("${urlDesktop}")`,
      tabletImg: `url("${urlTablet}")`,
      mobileImg: `url("${urlTablet}")`
    });

    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });
    mergeNodeResponsive(elements[0], null, gt);

    const s = elements[0].settings;
    assert.deepStrictEqual(s.background_image, { url: urlDesktop, id: '' });
    assert.deepStrictEqual(s.background_image_tablet, { url: urlTablet, id: '' });
    assert.strictEqual(s.background_image_mobile, undefined);

    const previewHtml = renderElementorToHtml({ content: elements, page_settings: {} });
    const renderSnapshot = await captureRenderSnapshot(previewHtml);
    const desk = renderSnapshot.viewports.desktop.flat['c_complex_resp'].styles.backgroundImage;
    const tab = renderSnapshot.viewports.tablet.flat['c_complex_resp'].styles.backgroundImage;
    const mob = renderSnapshot.viewports.mobile.flat['c_complex_resp'].styles.backgroundImage;

    assert.strictEqual(desk, `url("${urlDesktop}")`);
    assert.strictEqual(tab, `url("${urlTablet}")`);
    assert.strictEqual(mob, `url("${urlTablet}")`);
  });

  // ---------------------------------------------------------------------------
  // Test 6: Invalid/multilayer/none/unsafe responsive source -> no guessed native override
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 6] Invalid / Multilayer / none / Unsafe -> Zero Guessed Overrides');

  runTest('6.1. Responsive value "none" (URL -> none -> URL) emits scoped CSS reset and mobile re-apply', () => {
    const heroUrl = 'https://example.com/hero.jpg';
    const gt = make3VpGtImageSnapshot({
      sid: 'c_none_tab',
      desktopImg: `url("${heroUrl}")`,
      tabletImg: 'none',
      mobileImg: `url("${heroUrl}")`
    });
    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });

    // Fail-closed test: calling without atomicRules must throw IMAGE_CSS_ROUTE_UNAVAILABLE
    assert.throws(() => {
      mergeNodeResponsive(elements[0], null, gt, {});
    }, (err) => {
      return err && err.code === 'IMAGE_CSS_ROUTE_UNAVAILABLE';
    }, 'Must throw IMAGE_CSS_ROUTE_UNAVAILABLE when atomicRules is missing');

    const atomicRules = [];
    mergeNodeResponsive(elements[0], null, gt, { atomicRules });

    // Native settings check
    assert.strictEqual(elements[0].settings.background_image_tablet, undefined, 'Must not emit native background_image_tablet for "none"');

    // Scoped CSS rules check
    const tabletRule = atomicRules.find(r => r.includes('1024px') && r.includes('e-sid-c_none_tab'));
    assert.ok(tabletRule, 'Must emit scoped tablet media query rule');
    assert.ok(tabletRule.includes('background-image: none !important;'), 'Tablet rule must reset background-image to none !important');

    const mobileRule = atomicRules.find(r => r.includes('767px') && r.includes('e-sid-c_none_tab'));
    assert.ok(mobileRule, 'Must emit scoped mobile media query rule to re-apply image');
    assert.ok(mobileRule.includes(`background-image: url("${heroUrl}") !important;`), 'Mobile rule must re-apply URL with !important');
  });

  runTest('6.1b. Transition URL -> none -> none emits tablet none !important and zero mobile duplicate', () => {
    const urlA = 'https://example.com/hero.jpg';
    const gt = make3VpGtImageSnapshot({
      sid: 'c_none_none',
      desktopImg: `url("${urlA}")`,
      tabletImg: 'none',
      mobileImg: 'none'
    });
    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });
    const atomicRules = [];
    mergeNodeResponsive(elements[0], null, gt, { atomicRules });

    assert.strictEqual(elements[0].settings.background_image_tablet, undefined);
    assert.strictEqual(elements[0].settings.background_image_mobile, undefined);

    const tabletRule = atomicRules.find(r => r.includes('1024px') && r.includes('e-sid-c_none_none'));
    assert.ok(tabletRule && tabletRule.includes('background-image: none !important;'), 'Must emit tablet none rule');

    const mobileRule = atomicRules.find(r => r.includes('767px') && r.includes('e-sid-c_none_none'));
    assert.strictEqual(mobileRule, undefined, 'Mobile must inherit tablet none rule with zero duplicate');
  });

  runTest('6.1c. Transition URL-A -> none -> URL-B emits tablet none !important and mobile URL-B !important', () => {
    const urlA = 'https://example.com/hero-a.jpg';
    const urlB = 'https://example.com/hero-b.jpg';
    const gt = make3VpGtImageSnapshot({
      sid: 'c_none_diff_url',
      desktopImg: `url("${urlA}")`,
      tabletImg: 'none',
      mobileImg: `url("${urlB}")`
    });
    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });
    const atomicRules = [];
    mergeNodeResponsive(elements[0], null, gt, { atomicRules });

    assert.strictEqual(elements[0].settings.background_image_tablet, undefined);

    const tabletRule = atomicRules.find(r => r.includes('1024px') && r.includes('e-sid-c_none_diff_url'));
    assert.ok(tabletRule && tabletRule.includes('background-image: none !important;'));

    const mobileRule = atomicRules.find(r => r.includes('767px') && r.includes('e-sid-c_none_diff_url'));
    assert.ok(mobileRule && mobileRule.includes(`background-image: url("${urlB}") !important;`));
  });

  runTest('6.1d. Transition none -> URL -> none emits tablet URL !important and mobile none !important', () => {
    const urlA = 'https://example.com/tab.jpg';
    const gt = make3VpGtImageSnapshot({
      sid: 'c_none_url_none',
      desktopImg: 'none',
      tabletImg: `url("${urlA}")`,
      mobileImg: 'none'
    });
    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });
    const atomicRules = [];
    mergeNodeResponsive(elements[0], null, gt, { atomicRules });

    const tabletRule = atomicRules.find(r => r.includes('1024px') && r.includes('e-sid-c_none_url_none'));
    assert.ok(tabletRule && tabletRule.includes(`background-image: url("${urlA}") !important;`));

    const mobileRule = atomicRules.find(r => r.includes('767px') && r.includes('e-sid-c_none_url_none'));
    assert.ok(mobileRule && mobileRule.includes('background-image: none !important;'));
  });

  runTest('6.1e. Transition none -> URL -> URL emits tablet URL !important and zero mobile duplicate', () => {
    const urlA = 'https://example.com/tab.jpg';
    const gt = make3VpGtImageSnapshot({
      sid: 'c_none_url_url',
      desktopImg: 'none',
      tabletImg: `url("${urlA}")`,
      mobileImg: `url("${urlA}")`
    });
    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });
    const atomicRules = [];
    mergeNodeResponsive(elements[0], null, gt, { atomicRules });

    const tabletRule = atomicRules.find(r => r.includes('1024px') && r.includes('e-sid-c_none_url_url'));
    assert.ok(tabletRule && tabletRule.includes(`background-image: url("${urlA}") !important;`));

    const mobileRule = atomicRules.find(r => r.includes('767px') && r.includes('e-sid-c_none_url_url'));
    assert.strictEqual(mobileRule, undefined, 'Mobile inherits tablet rule with zero duplicate');
  });

  runTest('6.1f. Transition URL-A -> URL-B -> none emits native tablet setting and mobile none !important', () => {
    const urlA = 'https://example.com/hero-a.jpg';
    const urlB = 'https://example.com/hero-b.jpg';
    const gt = make3VpGtImageSnapshot({
      sid: 'c_url_url_none',
      desktopImg: `url("${urlA}")`,
      tabletImg: `url("${urlB}")`,
      mobileImg: 'none'
    });
    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });
    const atomicRules = [];
    mergeNodeResponsive(elements[0], null, gt, { atomicRules });

    assert.deepStrictEqual(elements[0].settings.background_image_tablet, { url: urlB, id: '' });
    assert.strictEqual(elements[0].settings.background_image_mobile, undefined);

    const tabletRule = atomicRules.find(r => r.includes('1024px') && r.includes('e-sid-c_url_url_none'));
    assert.strictEqual(tabletRule, undefined, 'Tablet uses native setting, zero CSS rule');

    const mobileRule = atomicRules.find(r => r.includes('767px') && r.includes('e-sid-c_url_url_none'));
    assert.ok(mobileRule && mobileRule.includes('background-image: none !important;'));
  });

  runTest('6.1g. Class isolation across multiple nodes prevents rule collision', () => {
    const urlA = 'https://example.com/node1.jpg';
    const urlB = 'https://example.com/node2.jpg';
    const gt1 = make3VpGtImageSnapshot({
      sid: 'c_iso_1',
      desktopImg: `url("${urlA}")`,
      tabletImg: 'none',
      mobileImg: 'none'
    });
    const gt2 = make3VpGtImageSnapshot({
      sid: 'c_iso_2',
      desktopImg: `url("${urlB}")`,
      tabletImg: 'none',
      mobileImg: `url("${urlB}")`
    });
    const el1 = { elType: 'container', _sid: 'c_iso_1', settings: { background_background: 'classic', background_image: { url: urlA, id: '' } } };
    const el2 = { elType: 'container', _sid: 'c_iso_2', settings: { background_background: 'classic', background_image: { url: urlB, id: '' } } };
    const combinedGt = {
      viewports: {
        desktop: { flat: { ...gt1.viewports.desktop.flat, ...gt2.viewports.desktop.flat } },
        tablet: { flat: { ...gt1.viewports.tablet.flat, ...gt2.viewports.tablet.flat } },
        mobile: { flat: { ...gt1.viewports.mobile.flat, ...gt2.viewports.mobile.flat } }
      }
    };
    const atomicRules = [];
    mergeNodeResponsive(el1, null, combinedGt, { atomicRules });
    mergeNodeResponsive(el2, null, combinedGt, { atomicRules });

    assert.ok(el1.settings._css_classes.includes('e-sid-c_iso_1'));
    assert.ok(el2.settings._css_classes.includes('e-sid-c_iso_2'));
    assert(!el1.settings._css_classes.includes('e-sid-c_iso_2'));
    assert(!el2.settings._css_classes.includes('e-sid-c_iso_1'));

    const rule1 = atomicRules.find(r => r.includes('e-sid-c_iso_1'));
    const rule2 = atomicRules.find(r => r.includes('e-sid-c_iso_2'));
    assert.ok(rule1 && rule2);
  });

  runTest('6.2. Multilayer url(...), url(...) emits zero tablet override', () => {
    const multi = 'url("https://example.com/layer1.png"), url("https://example.com/layer2.png")';
    const gt = make3VpGtImageSnapshot({
      sid: 'c_multi_tab',
      desktopImg: 'url("https://example.com/hero.jpg")',
      tabletImg: multi,
      mobileImg: 'url("https://example.com/hero.jpg")'
    });
    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });
    mergeNodeResponsive(elements[0], null, gt);

    assert.strictEqual(elements[0].settings.background_image_tablet, undefined, 'Must not extract first URL from multilayer');
  });

  runTest('6.3. Mixed url(...) + linear-gradient(...) emits zero tablet override', () => {
    const mixed = 'url("https://example.com/hero.jpg"), linear-gradient(to right, #000, #fff)';
    const gt = make3VpGtImageSnapshot({
      sid: 'c_mixed_tab',
      desktopImg: 'url("https://example.com/hero.jpg")',
      tabletImg: mixed,
      mobileImg: 'url("https://example.com/hero.jpg")'
    });
    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });
    mergeNodeResponsive(elements[0], null, gt);

    assert.strictEqual(elements[0].settings.background_image_tablet, undefined, 'Must not extract URL from mixed layer');
  });

  runTest('6.4. Malformed url() emits zero tablet override', () => {
    const gt = make3VpGtImageSnapshot({
      sid: 'c_malformed_tab',
      desktopImg: 'url("https://example.com/hero.jpg")',
      tabletImg: 'url()',
      mobileImg: 'url("https://example.com/hero.jpg")'
    });
    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });
    mergeNodeResponsive(elements[0], null, gt);

    assert.strictEqual(elements[0].settings.background_image_tablet, undefined, 'Must not guess URL for empty url()');
  });

  runTest('6.5. Unsafe XSS URL in responsive GT emits zero tablet override and no virtual CSS rule', () => {
    const unsafe = 'https://example.com/img.png</style><script>alert("xss")</script>';
    const gt = make3VpGtImageSnapshot({
      sid: 'c_unsafe_tab',
      desktopImg: 'url("https://example.com/hero.jpg")',
      tabletImg: `url("${unsafe}")`,
      mobileImg: 'url("https://example.com/hero.jpg")'
    });
    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });
    mergeNodeResponsive(elements[0], null, gt);

    assert.strictEqual(elements[0].settings.background_image_tablet, undefined, 'Unsafe URL must not be emitted in settings');

    // Also verify virtual renderer rejects unsafe override if injected
    elements[0].settings.background_image_tablet = { url: unsafe, id: '' };
    const preview = renderElementorToHtml({ content: elements, page_settings: {} });
    assert(!preview.includes('alert("xss")'), 'Preview must not contain injected script');
    assert(!preview.includes(unsafe), 'Preview must not emit unsafe URL');
  });

  runTest('6.6. Scheme validation rejects dangerous schemes and permits safe http/https/relative URLs', () => {
    // Dangerous schemes rejected
    assert.strictEqual(isSafeCssUrl('javascript:alert(1)'), false);
    assert.strictEqual(isSafeCssUrl('JaVaScRiPt:alert(1)'), false);
    assert.strictEqual(isSafeCssUrl('data:text/html,<b>xss</b>'), false);
    assert.strictEqual(isSafeCssUrl('vbscript:msgbox(1)'), false);
    assert.strictEqual(isSafeCssUrl('file:///etc/passwd'), false);
    assert.strictEqual(isSafeCssUrl('blob:https://example.com/uuid'), false);
    assert.strictEqual(isSafeCssUrl('unknown:scheme'), false);
    assert.strictEqual(isSafeCssUrl('http://'), false);
    assert.strictEqual(isSafeCssUrl('https://'), false);

    // Safe absolute, relative, and protocol-relative permitted
    assert.strictEqual(isSafeCssUrl('https://example.com/a.png'), true);
    assert.strictEqual(isSafeCssUrl('http://example.com/a.png'), true);
    assert.strictEqual(isSafeCssUrl('assets/a.png'), true);
    assert.strictEqual(isSafeCssUrl('/assets/a.png'), true);
    assert.strictEqual(isSafeCssUrl('./assets/a.png'), true);
    assert.strictEqual(isSafeCssUrl('../assets/a.png'), true);
    assert.strictEqual(isSafeCssUrl('//example.com/a.png'), true);
  });

  runTest('6.7. GT tablet javascript: URL emits zero background_image_tablet and renderer rejects manual injection', () => {
    const jsUrl = 'javascript:alert(1)';
    const gt = make3VpGtImageSnapshot({
      sid: 'c_js_tab',
      desktopImg: 'url("https://example.com/hero.jpg")',
      tabletImg: `url("${jsUrl}")`,
      mobileImg: 'url("https://example.com/hero.jpg")'
    });
    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });
    mergeNodeResponsive(elements[0], null, gt);

    assert.strictEqual(elements[0].settings.background_image_tablet, undefined, 'Must not emit background_image_tablet for javascript URL');

    // Also verify virtual renderer rejects javascript URL if manually injected in settings
    elements[0].settings.background_image_tablet = { url: jsUrl, id: '' };
    const preview = renderElementorToHtml({ content: elements, page_settings: {} });
    assert(!preview.includes('javascript:alert(1)'), 'Virtual preview must not emit javascript URL');
  });

  runTest('6.8. Fail closed on empty computed image: empty strings return unsupported and emit zero native or CSS none reset', () => {
    // 1. Classification assertions
    const emptyRes = classifyImageBackgroundState('');
    assert.deepStrictEqual(emptyRes, { state: 'unsupported', url: null, reason: 'empty_computed_style' }, 'Empty string must be unsupported empty_computed_style');

    const whitespaceRes = classifyImageBackgroundState('   ');
    assert.deepStrictEqual(whitespaceRes, { state: 'unsupported', url: null, reason: 'empty_computed_style' }, 'Whitespace string must be unsupported empty_computed_style');

    const noneRes = classifyImageBackgroundState('none');
    assert.deepStrictEqual(noneRes, { state: 'none', url: null, reason: null }, 'Literal none must return state none');

    const noneUpperRes = classifyImageBackgroundState('NONE');
    assert.deepStrictEqual(noneUpperRes, { state: 'none', url: null, reason: null }, 'Case-insensitive NONE must return state none');

    const validRes = classifyImageBackgroundState('url("https://example.com/valid.jpg")');
    assert.deepStrictEqual(validRes, { state: 'url', url: 'https://example.com/valid.jpg', reason: null }, 'Valid URL must return state url');

    // 2. Integration with responsive merger: zero native tablet override, zero CSS none reset
    const gt = make3VpGtImageSnapshot({
      sid: 'c_empty_tab',
      desktopImg: 'url("https://example.com/hero.jpg")',
      tabletImg: '',
      mobileImg: 'url("https://example.com/hero.jpg")'
    });
    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });
    const atomicRules = [];
    mergeNodeResponsive(elements[0], null, gt, { atomicRules });

    assert.strictEqual(elements[0].settings.background_image_tablet, undefined, 'Must not emit native background_image_tablet for empty computed style');
    assert.strictEqual(elements[0].settings.background_image_mobile, undefined, 'Must not emit native background_image_mobile');
    assert.strictEqual(
      atomicRules.some(r => r.includes('none !important')),
      false,
      'Must NOT emit CSS none reset when computed style is empty string'
    );
  });

  // ---------------------------------------------------------------------------
  // Test 7: Missing modern dictionary background-image -> FULL_STYLE_PROPERTY_MISSING
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 7] Modern Dictionary Missing Property -> FULL_STYLE_PROPERTY_MISSING');

  runTest('7. Missing background-image in tablet modern dictionary throws FULL_STYLE_PROPERTY_MISSING', () => {
    const gt = make3VpGtImageSnapshot({
      sid: 'c_missing_dict_prop',
      desktopImg: 'url("https://example.com/hero.jpg")',
      tabletImg: 'url("https://example.com/tablet.jpg")',
      styleDictTablet: {
        'ref-c_missing_dict_prop': {
          'background-color': 'rgb(15, 23, 42)',
          // 'background-image' intentionally omitted
          'background-size': 'cover',
          'background-position': '50% 50%',
          'background-repeat': 'no-repeat',
          'border-top-left-radius': '0px',
          'border-top-right-radius': '0px',
          'border-bottom-right-radius': '0px',
          'border-bottom-left-radius': '0px'
        }
      }
    });

    // Stale URL in legacy styles object
    gt.viewports.tablet.flat['c_missing_dict_prop'].styles.backgroundImage = 'url("https://example.com/stale-legacy.jpg")';

    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });

    let thrown = null;
    try {
      mergeNodeResponsive(elements[0], null, gt);
    } catch (err) {
      thrown = err;
    }

    assert(thrown, 'Must throw error when tablet modern dictionary is missing property');
    assert.strictEqual(thrown.code, 'FULL_STYLE_PROPERTY_MISSING');
    assert.strictEqual(thrown.property, 'background-image');
  });

  // ---------------------------------------------------------------------------
  // Test 8: Repeated responsive merge on same input (idempotency)
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 8] Idempotency: Re-running Merger Cleans Stale Overrides');

  runTest('8. Re-running merger eliminates stale overrides and produces idempotent output', () => {
    const urlA = 'https://example.com/hero-d.jpg';
    const urlB = 'https://example.com/hero-t.jpg';
    const gt = make3VpGtImageSnapshot({
      sid: 'c_idempotent',
      desktopImg: `url("${urlA}")`,
      tabletImg: `url("${urlB}")`,
      mobileImg: `url("${urlB}")`
    });

    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });

    // Inject stale keys
    elements[0].settings.background_image_tablet = { url: 'https://example.com/stale-tab.jpg', id: '' };
    elements[0].settings.background_image_mobile = { url: 'https://example.com/stale-mob.jpg', id: '' };

    // Run 1
    mergeNodeResponsive(elements[0], null, gt);
    const snapshotRun1 = JSON.parse(JSON.stringify(elements[0].settings));

    // Run 2
    mergeNodeResponsive(elements[0], null, gt);
    const snapshotRun2 = JSON.parse(JSON.stringify(elements[0].settings));

    assert.deepStrictEqual(snapshotRun2, snapshotRun1, 'Repeated runs must produce identical output');
    assert.deepStrictEqual(snapshotRun2.background_image_tablet, { url: urlB, id: '' });
    assert.strictEqual(snapshotRun2.background_image_mobile, undefined, 'Stale mobile key must be eliminated');
  });

  // ---------------------------------------------------------------------------
  // Test 9: Real Chromium Media-Query Fixture
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 9] Real Headless Chromium Fixture with Media Queries (End-to-End)');

  await runAsyncTest('9. Real Chromium media-query fixture: GT capture -> compile -> virtual render -> Chromium computed parity', async () => {
    const fixtureHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: rgb(248, 250, 252);
    }
    .resp-card {
      background-image: url("https://images.unsplash.com/photo-1579546929518-9e396f3cc809");
      background-color: rgb(15, 23, 42);
      background-size: cover;
      background-position: 50% 50%;
      background-repeat: no-repeat;
      padding: 40px;
      box-sizing: border-box;
    }
    @media (max-width: 1024px) {
      .resp-card {
        background-image: url("https://images.unsplash.com/photo-1557683316-973673baf926");
        background-size: contain;
      }
    }
    @media (max-width: 767px) {
      .resp-card {
        background-image: url("https://images.unsplash.com/photo-1579546929518-9e396f3cc809");
        background-size: cover;
      }
    }
  </style>
</head>
<body>
  <div class="resp-card" id="card-hero">
    <h1 style="color: white; margin: 0;">Responsive Background Image Card</h1>
  </div>
</body>
</html>`;

    console.log('    • Capturing real Ground Truth snapshot with Chromium...');
    const gtSnapshot = await captureGroundTruth(fixtureHtml, { cache: false });

    const cardDesk = Object.values(gtSnapshot.viewports.desktop.flat).find(n => n.id === 'card-hero');
    const cardTab = Object.values(gtSnapshot.viewports.tablet.flat).find(n => n.id === 'card-hero');
    const cardMob = Object.values(gtSnapshot.viewports.mobile.flat).find(n => n.id === 'card-hero');

    assert(cardDesk && cardTab && cardMob, 'Card container must exist in all 3 viewports in GT');

    const deskDict = gtSnapshot.viewports.desktop.styleDictionary[cardDesk.computedStyleRef];
    const tabDict = gtSnapshot.viewports.tablet.styleDictionary[cardTab.computedStyleRef];
    const mobDict = gtSnapshot.viewports.mobile.styleDictionary[cardMob.computedStyleRef];

    console.log('    • Real Chromium GT Computed Styles across Viewports:');
    console.log(`      [Desktop] ${deskDict['background-image']}`);
    console.log(`      [Tablet]  ${tabDict['background-image']}`);
    console.log(`      [Mobile]  ${mobDict['background-image']}`);

    assert.strictEqual(deskDict['background-image'], 'url("https://images.unsplash.com/photo-1579546929518-9e396f3cc809")');
    assert.strictEqual(tabDict['background-image'], 'url("https://images.unsplash.com/photo-1557683316-973673baf926")');
    assert.strictEqual(mobDict['background-image'], 'url("https://images.unsplash.com/photo-1579546929518-9e396f3cc809")');

    console.log('    • Compiling HTML to Elementor template with responsive merger...');
    const compileResult = await compileHtmlToElementor(fixtureHtml, {
      offline: true,
      useAi: false,
      inspect: false,
      probeBehavior: false,
      behaviorTraces: [],
      captureGroundTruth: async () => gtSnapshot
    });

    const allElements = collectAllElements(compileResult.templateJson.content || []);
    const compiledCard = allElements.find(
      e => e.settings?._element_id === 'card-hero' || e._element_id === 'card-hero'
    );
    assert(compiledCard, 'Compiled card must exist');

    const s = compiledCard.settings;
    console.log('    • Native Elementor Settings:');
    console.log('      - Desktop background_image:       ', JSON.stringify(s.background_image));
    console.log('      - Tablet background_image_tablet: ', JSON.stringify(s.background_image_tablet));
    console.log('      - Mobile background_image_mobile: ', JSON.stringify(s.background_image_mobile));

    assert.deepStrictEqual(s.background_image, {
      url: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809',
      id: ''
    });
    assert.deepStrictEqual(s.background_image_tablet, {
      url: 'https://images.unsplash.com/photo-1557683316-973673baf926',
      id: ''
    });
    assert.deepStrictEqual(s.background_image_mobile, {
      url: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809',
      id: ''
    }, 'Mobile must have explicit override to restore desktop image after tablet change');

    console.log('    • Rendering Elementor template to HTML...');
    const previewHtml = renderElementorToHtml(compileResult.templateJson, { fonts: gtSnapshot.fonts });

    console.log('    • Capturing render snapshot across 3 viewports with Chromium...');
    const renderSnapshot = await captureRenderSnapshot(previewHtml);

    const deskRenderNode = renderSnapshot.viewports.desktop.flat[cardDesk.sid];
    const tabRenderNode = renderSnapshot.viewports.tablet.flat[cardTab.sid];
    const mobRenderNode = renderSnapshot.viewports.mobile.flat[cardMob.sid];

    console.log('    • Real Chromium Rendered Computed Styles across Viewports:');
    console.log(`      [Desktop] ${deskRenderNode.styles.backgroundImage}`);
    console.log(`      [Tablet]  ${tabRenderNode.styles.backgroundImage}`);
    console.log(`      [Mobile]  ${mobRenderNode.styles.backgroundImage}`);

    assert.strictEqual(
      deskRenderNode.styles.backgroundImage,
      'url("https://images.unsplash.com/photo-1579546929518-9e396f3cc809")',
      'Desktop computed background image must match GT'
    );
    assert.strictEqual(
      tabRenderNode.styles.backgroundImage,
      'url("https://images.unsplash.com/photo-1557683316-973673baf926")',
      'Tablet computed background image must match GT'
    );
    assert.strictEqual(
      mobRenderNode.styles.backgroundImage,
      'url("https://images.unsplash.com/photo-1579546929518-9e396f3cc809")',
      'Mobile computed background image must match GT'
    );
  });

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log(`ALL ${passedTests}/${totalTests} TESTS PASSED CLEANLY (100%)`);
  console.log('========================================================================');
})();

/**
 * Block 8.2 — Phase 5 (Part 4C-1): Native Responsive Gradient Settings Tests.
 *
 * Verifies:
 * 1. Desktop 180deg / 0% / 100%; tablet 90deg / 10% / 90%; mobile 180deg / 0% / 100%
 *    -> tablet AND mobile override objects all emitted (reversal preservation).
 * 2. Desktop/tablet/mobile identical -> zero responsive gradient keys.
 * 3. Tablet change, mobile same as tablet -> tablet overrides only (effective inheritance).
 * 4. Mobile-only change -> mobile overrides only.
 * 5. One control changes, two others same -> emit only changed control, zero unnecessary keys.
 * 6. Tablet unsupported (3+ stops or multi-layer), mobile valid -> zero tablet keys; mobile compared against desktop.
 * 7. Colors change on tablet/mobile -> zero invented responsive color keys; no fake parity.
 * 8. Missing modern dictionary ref/property -> explicit FULL_STYLE_* error thrown.
 * 9. Re-running merger on same template -> same settings, zero stale overrides.
 * 10. Existing classic background-image responsive settings remain unaffected.
 * 11. Real Chromium mini fixture with media queries changing gradient:
 *     verify GT computed styles and exact emitted native override objects across 3 viewports.
 */

'use strict';

const assert = require('assert');
const { auditVerificationMatrix } = require('../src/smart/verification-matrix');
const { captureGroundTruth } = require('../src/smart/style-snapshot');
const { captureRenderSnapshot } = require('../src/smart/render-snapshot');
const { renderElementorToHtml } = require('../src/emulator/elementor-virtual-renderer');
const { parseHtmlToAst } = require('../src/parser/html-parser');
const { compileGroundTruthToElementor } = require('../src/smart/geometry-mapper');
const { mergeNodeResponsive } = require('../src/smart/responsive-merger');
const { compileHtmlToElementor } = require('../src/engine');

(async () => {
  console.log('========================================================================');
  console.log('BLOCK 8.2 — PHASE 5 (PART 4C-2): RESPONSIVE GRADIENT RENDER + HONEST AUDIT');
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

  function make3VpGtGradientSnapshot({
    sid = 'c_grad_resp',
    bgColor = 'rgba(0, 0, 0, 0)',
    desktopGrad = 'linear-gradient(180deg, rgb(255, 0, 0) 0%, rgb(0, 0, 255) 100%)',
    tabletGrad = 'linear-gradient(180deg, rgb(255, 0, 0) 0%, rgb(0, 0, 255) 100%)',
    mobileGrad = 'linear-gradient(180deg, rgb(255, 0, 0) 0%, rgb(0, 0, 255) 100%)',
    styleDictDesktop = undefined,
    styleDictTablet = undefined,
    styleDictMobile = undefined
  } = {}) {
    const ref = `ref-${sid}`;

    const makeDict = (gradCss, overrideDict) => {
      if (overrideDict !== undefined) return overrideDict;
      return {
        [ref]: {
          'background-color': bgColor,
          'background-image': gradCss,
          'background-size': 'auto',
          'background-position': '0% 0%',
          'background-repeat': 'repeat',
          'border-top-left-radius': '0px',
          'border-top-right-radius': '0px',
          'border-bottom-right-radius': '0px',
          'border-bottom-left-radius': '0px'
        }
      };
    };

    const makeNode = (gradCss) => ({
      sid,
      tag: 'div',
      role: 'container',
      computedStyleRef: ref,
      rect: { x: 0, y: 0, w: 800, h: 400 },
      styles: {
        backgroundColor: bgColor,
        backgroundImage: gradCss
      }
    });

    return {
      annotatedHtml: `<div data-sid="${sid}"></div>`,
      fonts: [],
      viewports: {
        desktop: {
          flat: { [sid]: makeNode(desktopGrad) },
          styleDictionary: makeDict(desktopGrad, styleDictDesktop),
          canvas: {
            html: { backgroundColor: 'transparent', backgroundImage: 'none', opacity: '1' },
            body: { backgroundColor: 'transparent', backgroundImage: 'none', opacity: '1' }
          }
        },
        tablet: {
          flat: { [sid]: makeNode(tabletGrad) },
          styleDictionary: makeDict(tabletGrad, styleDictTablet),
          canvas: {
            html: { backgroundColor: 'transparent', backgroundImage: 'none', opacity: '1' },
            body: { backgroundColor: 'transparent', backgroundImage: 'none', opacity: '1' }
          }
        },
        mobile: {
          flat: { [sid]: makeNode(mobileGrad) },
          styleDictionary: makeDict(mobileGrad, styleDictMobile),
          canvas: {
            html: { backgroundColor: 'transparent', backgroundImage: 'none', opacity: '1' },
            body: { backgroundColor: 'transparent', backgroundImage: 'none', opacity: '1' }
          }
        }
      }
    };
  }

  function makeRenderSnapshotMatchingGt(gt, overrides = {}) {
    const snapshot = {
      timestamp: new Date().toISOString(),
      viewports: {
        desktop: { flat: {}, duplicateSids: [], canvas: { body: { backgroundColor: 'transparent', backgroundImage: 'none' } } },
        tablet:  { flat: {}, duplicateSids: [], canvas: { body: { backgroundColor: 'transparent', backgroundImage: 'none' } } },
        mobile:  { flat: {}, duplicateSids: [], canvas: { body: { backgroundColor: 'transparent', backgroundImage: 'none' } } }
      }
    };

    for (const vp of ['desktop', 'tablet', 'mobile']) {
      const vpGt = gt.viewports[vp];
      for (const [sid, node] of Object.entries(vpGt.flat)) {
        const dict = vpGt.styleDictionary ? vpGt.styleDictionary[node.computedStyleRef] : {};
        const bgImg = dict ? dict['background-image'] : (node.styles ? node.styles.backgroundImage : 'none');
        const bgCol = dict ? dict['background-color'] : (node.styles ? node.styles.backgroundColor : 'transparent');

        snapshot.viewports[vp].flat[sid] = {
          sid,
          widgetId: 'w_' + sid,
          elementType: 'container',
          rect: { x: 0, y: 0, w: 800, h: 400 },
          outerRect: { x: 0, y: 0, w: 800, h: 400 },
          styles: {
            backgroundColor: bgCol,
            backgroundImage: bgImg
          }
        };
      }
    }

    for (const [vp, nodes] of Object.entries(overrides)) {
      if (snapshot.viewports[vp]) {
        for (const [sid, st] of Object.entries(nodes)) {
          if (snapshot.viewports[vp].flat[sid]) {
            Object.assign(snapshot.viewports[vp].flat[sid].styles, st);
          }
        }
      }
    }

    return snapshot;
  }

  // ---------------------------------------------------------------------------
  // Test 1: Desktop 180 / Tab 90 / Mob 180 (Reversal Emits Both)
  // ---------------------------------------------------------------------------
  console.log('▶ [TEST 1] Desktop 180 / Tab 90 / Mob 180 (Reversal Preservation)');

  runTest('1. Reversal: tablet override AND explicit mobile override are both emitted', () => {
    const gt = make3VpGtGradientSnapshot({
      sid: 'c_rev',
      desktopGrad: 'linear-gradient(180deg, rgb(255, 0, 0) 0%, rgb(0, 0, 255) 100%)',
      tabletGrad:  'linear-gradient(90deg, rgb(255, 0, 0) 10%, rgb(0, 0, 255) 90%)',
      mobileGrad:  'linear-gradient(180deg, rgb(255, 0, 0) 0%, rgb(0, 0, 255) 100%)'
    });

    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });
    mergeNodeResponsive(elements[0], null, gt);

    const c = elements[0];
    // Base desktop
    assert.strictEqual(c.settings.background_background, 'gradient');
    assert.deepStrictEqual(c.settings.background_gradient_angle, { unit: 'deg', size: 180, sizes: [] });
    assert.deepStrictEqual(c.settings.background_color_stop, { unit: '%', size: 0, sizes: [] });
    assert.deepStrictEqual(c.settings.background_color_b_stop, { unit: '%', size: 100, sizes: [] });

    // Tablet overrides
    assert.deepStrictEqual(c.settings.background_gradient_angle_tablet, { unit: 'deg', size: 90, sizes: [] });
    assert.deepStrictEqual(c.settings.background_color_stop_tablet, { unit: '%', size: 10, sizes: [] });
    assert.deepStrictEqual(c.settings.background_color_b_stop_tablet, { unit: '%', size: 90, sizes: [] });

    // Mobile overrides (reversal back to 180 / 0 / 100)
    assert.deepStrictEqual(c.settings.background_gradient_angle_mobile, { unit: 'deg', size: 180, sizes: [] });
    assert.deepStrictEqual(c.settings.background_color_stop_mobile, { unit: '%', size: 0, sizes: [] });
    assert.deepStrictEqual(c.settings.background_color_b_stop_mobile, { unit: '%', size: 100, sizes: [] });
  });

  // ---------------------------------------------------------------------------
  // Test 2: Desktop / Tablet / Mobile Identical -> Zero Responsive Keys
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 2] Identical Viewports -> Zero Responsive Gradient Keys');

  runTest('2. Identical gradients across viewports produce zero responsive keys', () => {
    const gt = make3VpGtGradientSnapshot({
      sid: 'c_identical',
      desktopGrad: 'linear-gradient(135deg, rgb(255, 0, 0) 20%, rgb(0, 0, 255) 80%)',
      tabletGrad:  'linear-gradient(135deg, rgb(255, 0, 0) 20%, rgb(0, 0, 255) 80%)',
      mobileGrad:  'linear-gradient(135deg, rgb(255, 0, 0) 20%, rgb(0, 0, 255) 80%)'
    });

    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });
    mergeNodeResponsive(elements[0], null, gt);

    const c = elements[0];
    assert.deepStrictEqual(c.settings.background_gradient_angle, { unit: 'deg', size: 135, sizes: [] });
    assert.strictEqual(c.settings.background_gradient_angle_tablet, undefined);
    assert.strictEqual(c.settings.background_color_stop_tablet, undefined);
    assert.strictEqual(c.settings.background_color_b_stop_tablet, undefined);
    assert.strictEqual(c.settings.background_gradient_angle_mobile, undefined);
    assert.strictEqual(c.settings.background_color_stop_mobile, undefined);
    assert.strictEqual(c.settings.background_color_b_stop_mobile, undefined);
  });

  // ---------------------------------------------------------------------------
  // Test 3: Tablet Change, Mobile Same as Tablet -> Tablet Only
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 3] Tablet Change, Mobile Same as Tablet -> Tablet Overrides Only');

  runTest('3. Mobile inherits from effective tablet: tablet overrides only, zero mobile keys', () => {
    const gt = make3VpGtGradientSnapshot({
      sid: 'c_tab_only',
      desktopGrad: 'linear-gradient(180deg, rgb(255, 0, 0) 0%, rgb(0, 0, 255) 100%)',
      tabletGrad:  'linear-gradient(90deg, rgb(255, 0, 0) 15%, rgb(0, 0, 255) 85%)',
      mobileGrad:  'linear-gradient(90deg, rgb(255, 0, 0) 15%, rgb(0, 0, 255) 85%)'
    });

    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });
    mergeNodeResponsive(elements[0], null, gt);

    const c = elements[0];
    // Tablet overrides present
    assert.deepStrictEqual(c.settings.background_gradient_angle_tablet, { unit: 'deg', size: 90, sizes: [] });
    assert.deepStrictEqual(c.settings.background_color_stop_tablet, { unit: '%', size: 15, sizes: [] });
    assert.deepStrictEqual(c.settings.background_color_b_stop_tablet, { unit: '%', size: 85, sizes: [] });

    // Mobile overrides must be absent (inherited from tablet)
    assert.strictEqual(c.settings.background_gradient_angle_mobile, undefined);
    assert.strictEqual(c.settings.background_color_stop_mobile, undefined);
    assert.strictEqual(c.settings.background_color_b_stop_mobile, undefined);
  });

  // ---------------------------------------------------------------------------
  // Test 4: Mobile-Only Change -> Mobile Overrides Only
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 4] Mobile-Only Change -> Mobile Overrides Only');

  runTest('4. Mobile-only change produces zero tablet keys and explicit mobile overrides', () => {
    const gt = make3VpGtGradientSnapshot({
      sid: 'c_mob_only',
      desktopGrad: 'linear-gradient(180deg, rgb(255, 0, 0) 0%, rgb(0, 0, 255) 100%)',
      tabletGrad:  'linear-gradient(180deg, rgb(255, 0, 0) 0%, rgb(0, 0, 255) 100%)',
      mobileGrad:  'linear-gradient(45deg, rgb(255, 0, 0) 25%, rgb(0, 0, 255) 75%)'
    });

    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });
    mergeNodeResponsive(elements[0], null, gt);

    const c = elements[0];
    // Tablet overrides absent
    assert.strictEqual(c.settings.background_gradient_angle_tablet, undefined);
    assert.strictEqual(c.settings.background_color_stop_tablet, undefined);
    assert.strictEqual(c.settings.background_color_b_stop_tablet, undefined);

    // Mobile overrides present
    assert.deepStrictEqual(c.settings.background_gradient_angle_mobile, { unit: 'deg', size: 45, sizes: [] });
    assert.deepStrictEqual(c.settings.background_color_stop_mobile, { unit: '%', size: 25, sizes: [] });
    assert.deepStrictEqual(c.settings.background_color_b_stop_mobile, { unit: '%', size: 75, sizes: [] });
  });

  // ---------------------------------------------------------------------------
  // Test 5: One Control Changes, Two Others Same -> Emit Changed Only
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 5] Selective Control Emitting (Zero Unnecessary Keys)');

  runTest('5. Only the specific changed control is emitted per viewport', () => {
    const gt = make3VpGtGradientSnapshot({
      sid: 'c_selective',
      desktopGrad: 'linear-gradient(180deg, rgb(255, 0, 0) 0%, rgb(0, 0, 255) 100%)',
      tabletGrad:  'linear-gradient(90deg, rgb(255, 0, 0) 0%, rgb(0, 0, 255) 100%)', // only angle changed
      mobileGrad:  'linear-gradient(90deg, rgb(255, 0, 0) 20%, rgb(0, 0, 255) 100%)' // angle same as tablet, only stop A changed
    });

    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });
    mergeNodeResponsive(elements[0], null, gt);

    const c = elements[0];
    // Tablet: angle only
    assert.deepStrictEqual(c.settings.background_gradient_angle_tablet, { unit: 'deg', size: 90, sizes: [] });
    assert.strictEqual(c.settings.background_color_stop_tablet, undefined);
    assert.strictEqual(c.settings.background_color_b_stop_tablet, undefined);

    // Mobile: stop A only
    assert.strictEqual(c.settings.background_gradient_angle_mobile, undefined);
    assert.deepStrictEqual(c.settings.background_color_stop_mobile, { unit: '%', size: 20, sizes: [] });
    assert.strictEqual(c.settings.background_color_b_stop_mobile, undefined);
  });

  // ---------------------------------------------------------------------------
  // Test 6: Tablet Unsupported (3+ stops), Mobile Valid
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 6] Tablet Unsupported (3+ Stops) & Mobile Valid');

  runTest('6. Unsupported tablet gradient emits zero tablet keys; mobile compares against desktop', () => {
    const gt = make3VpGtGradientSnapshot({
      sid: 'c_tab_unsupported',
      desktopGrad: 'linear-gradient(180deg, rgb(255, 0, 0) 0%, rgb(0, 0, 255) 100%)',
      tabletGrad:  'linear-gradient(90deg, rgb(255, 0, 0) 0%, rgb(0, 255, 0) 50%, rgb(0, 0, 255) 100%)', // 3 stops -> unsupported
      mobileGrad:  'linear-gradient(90deg, rgb(255, 0, 0) 0%, rgb(0, 0, 255) 100%)' // 2 stops, 90deg
    });

    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });
    mergeNodeResponsive(elements[0], null, gt);

    const c = elements[0];
    // Zero tablet overrides emitted
    assert.strictEqual(c.settings.background_gradient_angle_tablet, undefined);
    assert.strictEqual(c.settings.background_color_stop_tablet, undefined);
    assert.strictEqual(c.settings.background_color_b_stop_tablet, undefined);

    // Mobile compared against desktop: angle differs (90 vs 180), stops match (0, 100)
    assert.deepStrictEqual(c.settings.background_gradient_angle_mobile, { unit: 'deg', size: 90, sizes: [] });
    assert.strictEqual(c.settings.background_color_stop_mobile, undefined);
    assert.strictEqual(c.settings.background_color_b_stop_mobile, undefined);
  });

  // ---------------------------------------------------------------------------
  // Test 7: Colors Change in Tablet/Mobile -> Zero Invented Color Keys
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 7] Colors Change on Tablet/Mobile -> Zero Responsive Color Keys');

  runTest('7. Colors change produces zero invented color overrides (Elementor non-responsive color constraint)', () => {
    const gt = make3VpGtGradientSnapshot({
      sid: 'c_color_change',
      desktopGrad: 'linear-gradient(180deg, rgb(255, 0, 0) 0%, rgb(0, 0, 255) 100%)',
      tabletGrad:  'linear-gradient(180deg, rgb(0, 255, 0) 0%, rgb(255, 255, 0) 100%)', // colors changed, angle & stops same
      mobileGrad:  'linear-gradient(90deg, rgb(10, 10, 10) 0%, rgb(20, 20, 20) 100%)' // colors changed, angle changed
    });

    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });
    mergeNodeResponsive(elements[0], null, gt);

    const c = elements[0];
    // Zero responsive color keys anywhere
    assert.strictEqual(c.settings.background_color_tablet, undefined);
    assert.strictEqual(c.settings.background_color_mobile, undefined);
    assert.strictEqual(c.settings.background_color_b_tablet, undefined);
    assert.strictEqual(c.settings.background_color_b_mobile, undefined);
    assert.strictEqual(c.settings.background_background_tablet, undefined);
    assert.strictEqual(c.settings.background_background_mobile, undefined);

    // Tablet: angle and stops were same as desktop -> zero tablet keys
    assert.strictEqual(c.settings.background_gradient_angle_tablet, undefined);
    assert.strictEqual(c.settings.background_color_stop_tablet, undefined);
    assert.strictEqual(c.settings.background_color_b_stop_tablet, undefined);

    // Mobile: angle changed to 90 -> angle override emitted
    assert.deepStrictEqual(c.settings.background_gradient_angle_mobile, { unit: 'deg', size: 90, sizes: [] });
  });

  // ---------------------------------------------------------------------------
  // Test 8: Missing Modern Dictionary Property -> Throws FULL_STYLE_*
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 8] Modern Dictionary Integrity (No Legacy Guessing)');

  runTest('8. Missing modern dictionary property on tablet throws FULL_STYLE_PROPERTY_MISSING', () => {
    const gt = make3VpGtGradientSnapshot({
      sid: 'c_missing_prop',
      styleDictTablet: {
        'ref-c_missing_prop': {
          'background-color': 'rgba(0, 0, 0, 0)'
          // background-image intentionally missing!
        }
      }
    });

    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });

    assert.throws(
      () => {
        mergeNodeResponsive(elements[0], null, gt);
      },
      (err) => {
        assert(err.code === 'FULL_STYLE_PROPERTY_MISSING', `Expected FULL_STYLE_PROPERTY_MISSING, got ${err.code}`);
        return true;
      }
    );
  });

  // ---------------------------------------------------------------------------
  // Test 9: Re-Running Merger Cleans Stale Overrides
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 9] Re-running Merger Cleans Stale Overrides');

  runTest('9. Re-running merger eliminates stale overrides and produces idempotent output', () => {
    const gt = make3VpGtGradientSnapshot({
      sid: 'c_rerun',
      desktopGrad: 'linear-gradient(180deg, rgb(255, 0, 0) 0%, rgb(0, 0, 255) 100%)',
      tabletGrad:  'linear-gradient(180deg, rgb(255, 0, 0) 0%, rgb(0, 0, 255) 100%)',
      mobileGrad:  'linear-gradient(180deg, rgb(255, 0, 0) 0%, rgb(0, 0, 255) 100%)'
    });

    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });

    // Manually inject stale keys
    elements[0].settings.background_gradient_angle_tablet = { unit: 'deg', size: 999, sizes: [] };
    elements[0].settings.background_color_stop_mobile = { unit: '%', size: 999, sizes: [] };

    // Run merger 1st time
    mergeNodeResponsive(elements[0], null, gt);
    const settingsAfterFirstRun = JSON.parse(JSON.stringify(elements[0].settings));

    // Run merger 2nd time on SAME template and SAME GT
    mergeNodeResponsive(elements[0], null, gt);
    const settingsAfterSecondRun = JSON.parse(JSON.stringify(elements[0].settings));

    assert.deepStrictEqual(settingsAfterSecondRun, settingsAfterFirstRun, 'Second merge run must produce identical settings (idempotency)');
    assert.strictEqual(elements[0].settings.background_gradient_angle_tablet, undefined, 'Stale tablet angle must be deleted');
    assert.strictEqual(elements[0].settings.background_color_stop_mobile, undefined, 'Stale mobile stop must be deleted');
  });

  // ---------------------------------------------------------------------------
  // Test 10: Existing Classic Background-Image Settings Unaffected
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 10] Classic Background-Image Settings Unaffected');

  runTest('10. Classic image containers retain image responsive geometry and omit gradient keys', () => {
    const ref = 'ref-c_classic';
    const commonDict = (bgSize) => ({
      'background-color': 'transparent',
      'background-image': 'url("https://example.com/banner.jpg")',
      'background-size': bgSize,
      'background-position': '50% 50%',
      'background-repeat': 'no-repeat',
      'border-top-left-radius': '0px',
      'border-top-right-radius': '0px',
      'border-bottom-right-radius': '0px',
      'border-bottom-left-radius': '0px'
    });
    const gt = {
      annotatedHtml: '<div data-sid="c_classic"></div>',
      fonts: [],
      viewports: {
        desktop: {
          flat: { c_classic: { sid: 'c_classic', tag: 'div', role: 'container', computedStyleRef: ref, rect: { x: 0, y: 0, w: 800, h: 400 }, styles: { backgroundColor: 'transparent', backgroundImage: 'url("https://example.com/banner.jpg")', backgroundSize: 'cover', backgroundPosition: '50% 50%', backgroundRepeat: 'no-repeat' } } },
          styleDictionary: { [ref]: commonDict('cover') },
          canvas: { html: { backgroundColor: 'transparent', backgroundImage: 'none' }, body: { backgroundColor: 'transparent', backgroundImage: 'none' } }
        },
        tablet: {
          flat: { c_classic: { sid: 'c_classic', tag: 'div', role: 'container', computedStyleRef: ref, rect: { x: 0, y: 0, w: 800, h: 400 }, styles: { backgroundColor: 'transparent', backgroundImage: 'url("https://example.com/banner.jpg")', backgroundSize: 'contain', backgroundPosition: '50% 50%', backgroundRepeat: 'no-repeat' } } },
          styleDictionary: { [ref]: commonDict('contain') },
          canvas: { html: { backgroundColor: 'transparent', backgroundImage: 'none' }, body: { backgroundColor: 'transparent', backgroundImage: 'none' } }
        },
        mobile: {
          flat: { c_classic: { sid: 'c_classic', tag: 'div', role: 'container', computedStyleRef: ref, rect: { x: 0, y: 0, w: 800, h: 400 }, styles: { backgroundColor: 'transparent', backgroundImage: 'url("https://example.com/banner.jpg")', backgroundSize: 'contain', backgroundPosition: '50% 50%', backgroundRepeat: 'no-repeat' } } },
          styleDictionary: { [ref]: commonDict('contain') },
          canvas: { html: { backgroundColor: 'transparent', backgroundImage: 'none' }, body: { backgroundColor: 'transparent', backgroundImage: 'none' } }
        }
      }
    };

    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });
    mergeNodeResponsive(elements[0], null, gt);

    const c = elements[0];
    assert.strictEqual(c.settings.background_background, 'classic');
    assert.strictEqual(c.settings.background_size, 'cover');
    assert.strictEqual(c.settings.background_size_tablet, 'contain');
    assert.strictEqual(c.settings.background_gradient_angle_tablet, undefined);
  });

  // ---------------------------------------------------------------------------
  // Test 11: Real Chromium Mini Fixture with Media Queries
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 11] Real Chromium Mini Fixture with Media Queries (End-to-End GT -> Responsive Settings)');

  await runAsyncTest('11. Real Chromium snapshot with media queries compiles to exact responsive settings', async () => {
    const fixtureHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #ffffff; }
    .hero-grad-box {
      width: 100%;
      height: 250px;
      background-image: linear-gradient(180deg, rgb(255, 0, 0) 0%, rgb(0, 0, 255) 100%);
      background-color: transparent;
      display: flex;
      flex-direction: column;
    }
    @media (max-width: 1024px) {
      .hero-grad-box {
        background-image: linear-gradient(90deg, rgb(255, 0, 0) 10%, rgb(0, 0, 255) 90%);
      }
    }
    @media (max-width: 767px) {
      .hero-grad-box {
        background-image: linear-gradient(45deg, rgb(255, 0, 0) 25%, rgb(0, 0, 255) 75%);
      }
    }
  </style>
</head>
<body>
  <div id="grad-hero-box" class="hero-grad-box"></div>
</body>
</html>`;

    console.log('    • Capturing real Ground Truth snapshot across 3 viewports with Chromium...');
    const gtSnapshot = await captureGroundTruth(fixtureHtml, { cache: false });

    const heroDesk = Object.values(gtSnapshot.viewports.desktop.flat).find(n => n.id === 'grad-hero-box');
    const heroTab  = Object.values(gtSnapshot.viewports.tablet.flat).find(n => n.id === 'grad-hero-box');
    const heroMob  = Object.values(gtSnapshot.viewports.mobile.flat).find(n => n.id === 'grad-hero-box');

    assert(heroDesk && heroTab && heroMob, 'Hero node must exist in all 3 viewports');

    const dictDesk = gtSnapshot.viewports.desktop.styleDictionary[heroDesk.computedStyleRef];
    const dictTab  = gtSnapshot.viewports.tablet.styleDictionary[heroTab.computedStyleRef];
    const dictMob  = gtSnapshot.viewports.mobile.styleDictionary[heroMob.computedStyleRef];

    console.log('    • Real Chromium GT Computed Styles across Viewports:');
    console.log(`      [Desktop] ${dictDesk['background-image']}`);
    console.log(`      [Tablet]  ${dictTab['background-image']}`);
    console.log(`      [Mobile]  ${dictMob['background-image']}`);

    assert.strictEqual(dictDesk['background-image'], 'linear-gradient(rgb(255, 0, 0) 0%, rgb(0, 0, 255) 100%)');
    assert.strictEqual(dictTab['background-image'], 'linear-gradient(90deg, rgb(255, 0, 0) 10%, rgb(0, 0, 255) 90%)');
    assert.strictEqual(dictMob['background-image'], 'linear-gradient(45deg, rgb(255, 0, 0) 25%, rgb(0, 0, 255) 75%)');

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
    const heroEl = allElements.find(e => e.settings?._element_id === 'grad-hero-box' || e._element_id === 'grad-hero-box');
    assert(heroEl, 'Hero container element must exist in compiled template');

    console.log('    • EXACT JSON Excerpt of Emitted Elementor Gradient Settings:');
    const gradientSettingsExcerpt = {
      // Desktop
      background_background: heroEl.settings.background_background,
      background_gradient_type: heroEl.settings.background_gradient_type,
      background_color: heroEl.settings.background_color,
      background_color_stop: heroEl.settings.background_color_stop,
      background_color_b: heroEl.settings.background_color_b,
      background_color_b_stop: heroEl.settings.background_color_b_stop,
      background_gradient_angle: heroEl.settings.background_gradient_angle,
      // Tablet
      background_gradient_angle_tablet: heroEl.settings.background_gradient_angle_tablet,
      background_color_stop_tablet: heroEl.settings.background_color_stop_tablet,
      background_color_b_stop_tablet: heroEl.settings.background_color_b_stop_tablet,
      // Mobile
      background_gradient_angle_mobile: heroEl.settings.background_gradient_angle_mobile,
      background_color_stop_mobile: heroEl.settings.background_color_stop_mobile,
      background_color_b_stop_mobile: heroEl.settings.background_color_b_stop_mobile
    };
    console.log(JSON.stringify(gradientSettingsExcerpt, null, 2));

    // Assert Desktop Base Settings
    assert.strictEqual(heroEl.settings.background_background, 'gradient');
    assert.strictEqual(heroEl.settings.background_gradient_type, 'linear');
    assert.strictEqual(heroEl.settings.background_color, 'rgb(255, 0, 0)');
    assert.deepStrictEqual(heroEl.settings.background_color_stop, { unit: '%', size: 0, sizes: [] });
    assert.strictEqual(heroEl.settings.background_color_b, 'rgb(0, 0, 255)');
    assert.deepStrictEqual(heroEl.settings.background_color_b_stop, { unit: '%', size: 100, sizes: [] });
    assert.deepStrictEqual(heroEl.settings.background_gradient_angle, { unit: 'deg', size: 180, sizes: [] });

    // Assert Tablet Override Settings
    assert.deepStrictEqual(heroEl.settings.background_gradient_angle_tablet, { unit: 'deg', size: 90, sizes: [] });
    assert.deepStrictEqual(heroEl.settings.background_color_stop_tablet, { unit: '%', size: 10, sizes: [] });
    assert.deepStrictEqual(heroEl.settings.background_color_b_stop_tablet, { unit: '%', size: 90, sizes: [] });

    // Assert Mobile Override Settings
    assert.deepStrictEqual(heroEl.settings.background_gradient_angle_mobile, { unit: 'deg', size: 45, sizes: [] });
    assert.deepStrictEqual(heroEl.settings.background_color_stop_mobile, { unit: '%', size: 25, sizes: [] });
    assert.deepStrictEqual(heroEl.settings.background_color_b_stop_mobile, { unit: '%', size: 75, sizes: [] });

    // Assert zero responsive color keys
    assert.strictEqual(heroEl.settings.background_color_tablet, undefined);
    assert.strictEqual(heroEl.settings.background_color_mobile, undefined);
    assert.strictEqual(heroEl.settings.background_color_b_tablet, undefined);
    assert.strictEqual(heroEl.settings.background_color_b_mobile, undefined);

    // Part 4C-2: Real Chromium Computed Styles Parity + Zero Defects
    const previewHtml = renderElementorToHtml(compileResult.templateJson, { fonts: gtSnapshot.fonts });
    const renderSnapshot = await captureRenderSnapshot(previewHtml);
    const auditResult = auditVerificationMatrix(gtSnapshot, renderSnapshot, compileResult.templateJson);

    const rnDeskGrad = renderSnapshot.viewports.desktop.flat[heroDesk.sid]?.styles.backgroundImage;
    const rnTabGrad  = renderSnapshot.viewports.tablet.flat[heroTab.sid]?.styles.backgroundImage;
    const rnMobGrad  = renderSnapshot.viewports.mobile.flat[heroMob.sid]?.styles.backgroundImage;

    console.log('    • Real Chromium Rendered Computed Styles across Viewports:');
    console.log(`      [Desktop] ${rnDeskGrad}`);
    console.log(`      [Tablet]  ${rnTabGrad}`);
    console.log(`      [Mobile]  ${rnMobGrad}`);

    assert.strictEqual(rnDeskGrad, 'linear-gradient(rgb(255, 0, 0) 0%, rgb(0, 0, 255) 100%)');
    assert.strictEqual(rnTabGrad, 'linear-gradient(90deg, rgb(255, 0, 0) 10%, rgb(0, 0, 255) 90%)');
    assert.strictEqual(rnMobGrad, 'linear-gradient(45deg, rgb(255, 0, 0) 25%, rgb(0, 0, 255) 75%)');

    const desktopDefects = auditResult.defects.filter(d => d.nodeSid === heroDesk.sid && d.rule === 'RULE-SURFACE-01' && d.viewport === 'desktop');
    const tabletDefects = auditResult.defects.filter(d => d.nodeSid === heroTab.sid && d.rule === 'RULE-SURFACE-01' && d.viewport === 'tablet');
    const mobileDefects = auditResult.defects.filter(d => d.nodeSid === heroMob.sid && d.rule === 'RULE-SURFACE-01' && d.viewport === 'mobile');

    console.log(`    • Audit defects for gradient container (Part 4C-2 verified):`);
    console.log(`      - Desktop RULE-SURFACE-01 defects: ${desktopDefects.length} (clean 0 defects)`);
    console.log(`      - Tablet RULE-SURFACE-01 defects:  ${tabletDefects.length} (clean 0 defects)`);
    console.log(`      - Mobile RULE-SURFACE-01 defects:  ${mobileDefects.length} (clean 0 defects)`);

    assert.strictEqual(desktopDefects.length, 0, 'Desktop must have 0 RULE-SURFACE-01 defects');
    assert.strictEqual(tabletDefects.length, 0, 'Tablet must have 0 RULE-SURFACE-01 defects');
    assert.strictEqual(mobileDefects.length, 0, 'Mobile must have 0 RULE-SURFACE-01 defects');
  });

  // ---------------------------------------------------------------------------
  // Test 12: Tablet Change, Mobile Same as Tablet (Inheritance Parity with Real Render)
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 12] Tablet Change, Mobile Same as Tablet (Real Render Parity)');

  await runAsyncTest('12. Tablet change + mobile same as tablet: zero mobile override and actual mobile Chromium inherits tablet gradient', async () => {
    const gt = make3VpGtGradientSnapshot({
      sid: 'c_tab_inherit',
      desktopGrad: 'linear-gradient(180deg, rgb(255, 0, 0) 0%, rgb(0, 0, 255) 100%)',
      tabletGrad:  'linear-gradient(90deg, rgb(255, 0, 0) 10%, rgb(0, 0, 255) 90%)',
      mobileGrad:  'linear-gradient(90deg, rgb(255, 0, 0) 10%, rgb(0, 0, 255) 90%)'
    });

    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });
    mergeNodeResponsive(elements[0], null, gt);

    const c = elements[0];
    assert.deepStrictEqual(c.settings.background_gradient_angle_tablet, { unit: 'deg', size: 90, sizes: [] });
    assert.deepStrictEqual(c.settings.background_color_stop_tablet, { unit: '%', size: 10, sizes: [] });
    assert.deepStrictEqual(c.settings.background_color_b_stop_tablet, { unit: '%', size: 90, sizes: [] });

    // Mobile overrides MUST be absent from settings
    assert.strictEqual(c.settings.background_gradient_angle_mobile, undefined);
    assert.strictEqual(c.settings.background_color_stop_mobile, undefined);
    assert.strictEqual(c.settings.background_color_b_stop_mobile, undefined);

    // Real Virtual Render + Real Chromium Capture
    const tmplJson = { content: [c], page_settings: {} };
    const previewHtml = renderElementorToHtml(tmplJson);
    const renderSnapshot = await captureRenderSnapshot(previewHtml);

    const deskNode = renderSnapshot.viewports.desktop.flat['c_tab_inherit'];
    const tabNode  = renderSnapshot.viewports.tablet.flat['c_tab_inherit'];
    const mobNode  = renderSnapshot.viewports.mobile.flat['c_tab_inherit'];

    assert(deskNode && tabNode && mobNode, 'Container must exist in all 3 viewports of render snapshot');

    const deskBg = deskNode.styles.backgroundImage;
    const tabBg  = tabNode.styles.backgroundImage;
    const mobBg  = mobNode.styles.backgroundImage;

    console.log('    • Real Chromium Rendered Computed Styles (Test 12):');
    console.log(`      [Desktop] ${deskBg}`);
    console.log(`      [Tablet]  ${tabBg}`);
    console.log(`      [Mobile]  ${mobBg}`);

    assert.strictEqual(deskBg, 'linear-gradient(rgb(255, 0, 0) 0%, rgb(0, 0, 255) 100%)');
    assert.strictEqual(tabBg, 'linear-gradient(90deg, rgb(255, 0, 0) 10%, rgb(0, 0, 255) 90%)');
    // Actual mobile Chromium shows tablet gradient!
    assert.strictEqual(mobBg, 'linear-gradient(90deg, rgb(255, 0, 0) 10%, rgb(0, 0, 255) 90%)');

    assert.strictEqual(deskNode.styles.backgroundColor, 'rgba(0, 0, 0, 0)');
    assert.strictEqual(tabNode.styles.backgroundColor, 'rgba(0, 0, 0, 0)');
    assert.strictEqual(mobNode.styles.backgroundColor, 'rgba(0, 0, 0, 0)');

    const audit = auditVerificationMatrix(gt, renderSnapshot, tmplJson);
    const deskDefects = audit.defects.filter(d => d.nodeSid === 'c_tab_inherit' && d.rule === 'RULE-SURFACE-01' && d.viewport === 'desktop');
    const tabDefects  = audit.defects.filter(d => d.nodeSid === 'c_tab_inherit' && d.rule === 'RULE-SURFACE-01' && d.viewport === 'tablet');
    const mobDefects  = audit.defects.filter(d => d.nodeSid === 'c_tab_inherit' && d.rule === 'RULE-SURFACE-01' && d.viewport === 'mobile');

    console.log(`    • Test 12 Defect Counts: desktop=${deskDefects.length}, tablet=${tabDefects.length}, mobile=${mobDefects.length}`);
    assert.strictEqual(deskDefects.length, 0, 'Desktop must have 0 RULE-SURFACE-01 defects');
    assert.strictEqual(tabDefects.length, 0, 'Tablet must have 0 RULE-SURFACE-01 defects');
    assert.strictEqual(mobDefects.length, 0, 'Mobile must have 0 RULE-SURFACE-01 defects');
  });

  // ---------------------------------------------------------------------------
  // Test 13: Tablet Change, Mobile Revert to Desktop (Reversal with Real Render)
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 13] Tablet Change, Mobile Revert to Desktop (Real Render Reversal)');

  await runAsyncTest('13. Tablet change + mobile revert to desktop: actual mobile Chromium restores desktop gradient', async () => {
    const gt = make3VpGtGradientSnapshot({
      sid: 'c_reversal',
      desktopGrad: 'linear-gradient(180deg, rgb(255, 0, 0) 0%, rgb(0, 0, 255) 100%)',
      tabletGrad:  'linear-gradient(90deg, rgb(255, 0, 0) 10%, rgb(0, 0, 255) 90%)',
      mobileGrad:  'linear-gradient(180deg, rgb(255, 0, 0) 0%, rgb(0, 0, 255) 100%)'
    });

    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });
    mergeNodeResponsive(elements[0], null, gt);

    const c = elements[0];
    assert.deepStrictEqual(c.settings.background_gradient_angle_tablet, { unit: 'deg', size: 90, sizes: [] });
    assert.deepStrictEqual(c.settings.background_gradient_angle_mobile, { unit: 'deg', size: 180, sizes: [] });

    // Real Virtual Render + Real Chromium Capture
    const tmplJson = { content: [c], page_settings: {} };
    const previewHtml = renderElementorToHtml(tmplJson);
    const renderSnapshot = await captureRenderSnapshot(previewHtml);

    const deskNode = renderSnapshot.viewports.desktop.flat['c_reversal'];
    const tabNode  = renderSnapshot.viewports.tablet.flat['c_reversal'];
    const mobNode  = renderSnapshot.viewports.mobile.flat['c_reversal'];

    assert(deskNode && tabNode && mobNode, 'Container must exist in all 3 viewports of render snapshot');

    const deskBg = deskNode.styles.backgroundImage;
    const tabBg  = tabNode.styles.backgroundImage;
    const mobBg  = mobNode.styles.backgroundImage;

    console.log('    • Real Chromium Rendered Computed Styles (Test 13):');
    console.log(`      [Desktop] ${deskBg}`);
    console.log(`      [Tablet]  ${tabBg}`);
    console.log(`      [Mobile]  ${mobBg}`);

    assert.strictEqual(deskBg, 'linear-gradient(rgb(255, 0, 0) 0%, rgb(0, 0, 255) 100%)');
    assert.strictEqual(tabBg, 'linear-gradient(90deg, rgb(255, 0, 0) 10%, rgb(0, 0, 255) 90%)');
    // Actual mobile Chromium restores desktop gradient, NOT tablet!
    assert.strictEqual(mobBg, 'linear-gradient(rgb(255, 0, 0) 0%, rgb(0, 0, 255) 100%)');

    assert.strictEqual(deskNode.styles.backgroundColor, 'rgba(0, 0, 0, 0)');
    assert.strictEqual(tabNode.styles.backgroundColor, 'rgba(0, 0, 0, 0)');
    assert.strictEqual(mobNode.styles.backgroundColor, 'rgba(0, 0, 0, 0)');

    const audit = auditVerificationMatrix(gt, renderSnapshot, tmplJson);
    const deskDefects = audit.defects.filter(d => d.nodeSid === 'c_reversal' && d.rule === 'RULE-SURFACE-01' && d.viewport === 'desktop');
    const tabDefects  = audit.defects.filter(d => d.nodeSid === 'c_reversal' && d.rule === 'RULE-SURFACE-01' && d.viewport === 'tablet');
    const mobDefects  = audit.defects.filter(d => d.nodeSid === 'c_reversal' && d.rule === 'RULE-SURFACE-01' && d.viewport === 'mobile');

    console.log(`    • Test 13 Defect Counts: desktop=${deskDefects.length}, tablet=${tabDefects.length}, mobile=${mobDefects.length}`);
    assert.strictEqual(deskDefects.length, 0, 'Desktop must have 0 RULE-SURFACE-01 defects');
    assert.strictEqual(tabDefects.length, 0, 'Tablet must have 0 RULE-SURFACE-01 defects');
    assert.strictEqual(mobDefects.length, 0, 'Mobile must have 0 RULE-SURFACE-01 defects');
  });

  // ---------------------------------------------------------------------------
  // Test 14: Partial Override (Remaining Effective Controls with Real Render)
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 14] Partial Override (Real Render Parity)');

  await runAsyncTest('14. Partial override: actual tablet/mobile Chromium shows full effective gradient', async () => {
    const gt = make3VpGtGradientSnapshot({
      sid: 'c_partial',
      desktopGrad: 'linear-gradient(180deg, rgb(255, 0, 0) 0%, rgb(0, 0, 255) 100%)',
      tabletGrad:  'linear-gradient(90deg, rgb(255, 0, 0) 0%, rgb(0, 0, 255) 100%)', // angle only
      mobileGrad:  'linear-gradient(90deg, rgb(255, 0, 0) 20%, rgb(0, 0, 255) 100%)' // angle same as tab, stopA only
    });

    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });
    mergeNodeResponsive(elements[0], null, gt);

    const c = elements[0];
    assert.deepStrictEqual(c.settings.background_gradient_angle_tablet, { unit: 'deg', size: 90, sizes: [] });
    assert.strictEqual(c.settings.background_color_stop_tablet, undefined);
    assert.strictEqual(c.settings.background_color_b_stop_tablet, undefined);

    assert.strictEqual(c.settings.background_gradient_angle_mobile, undefined);
    assert.deepStrictEqual(c.settings.background_color_stop_mobile, { unit: '%', size: 20, sizes: [] });
    assert.strictEqual(c.settings.background_color_b_stop_mobile, undefined);

    // Real Virtual Render + Real Chromium Capture
    const tmplJson = { content: [c], page_settings: {} };
    const previewHtml = renderElementorToHtml(tmplJson);
    const renderSnapshot = await captureRenderSnapshot(previewHtml);

    const deskNode = renderSnapshot.viewports.desktop.flat['c_partial'];
    const tabNode  = renderSnapshot.viewports.tablet.flat['c_partial'];
    const mobNode  = renderSnapshot.viewports.mobile.flat['c_partial'];

    assert(deskNode && tabNode && mobNode, 'Container must exist in all 3 viewports of render snapshot');

    const deskBg = deskNode.styles.backgroundImage;
    const tabBg  = tabNode.styles.backgroundImage;
    const mobBg  = mobNode.styles.backgroundImage;

    console.log('    • Real Chromium Rendered Computed Styles (Test 14):');
    console.log(`      [Desktop] ${deskBg}`);
    console.log(`      [Tablet]  ${tabBg}`);
    console.log(`      [Mobile]  ${mobBg}`);

    assert.strictEqual(deskBg, 'linear-gradient(rgb(255, 0, 0) 0%, rgb(0, 0, 255) 100%)');
    assert.strictEqual(tabBg, 'linear-gradient(90deg, rgb(255, 0, 0) 0%, rgb(0, 0, 255) 100%)');
    assert.strictEqual(mobBg, 'linear-gradient(90deg, rgb(255, 0, 0) 20%, rgb(0, 0, 255) 100%)');

    const audit = auditVerificationMatrix(gt, renderSnapshot, tmplJson);
    const deskDefects = audit.defects.filter(d => d.nodeSid === 'c_partial' && d.rule === 'RULE-SURFACE-01' && d.viewport === 'desktop');
    const tabDefects  = audit.defects.filter(d => d.nodeSid === 'c_partial' && d.rule === 'RULE-SURFACE-01' && d.viewport === 'tablet');
    const mobDefects  = audit.defects.filter(d => d.nodeSid === 'c_partial' && d.rule === 'RULE-SURFACE-01' && d.viewport === 'mobile');

    console.log(`    • Test 14 Defect Counts: desktop=${deskDefects.length}, tablet=${tabDefects.length}, mobile=${mobDefects.length}`);
    assert.strictEqual(deskDefects.length, 0, 'Desktop must have 0 RULE-SURFACE-01 defects');
    assert.strictEqual(tabDefects.length, 0, 'Tablet must have 0 RULE-SURFACE-01 defects');
    assert.strictEqual(mobDefects.length, 0, 'Mobile must have 0 RULE-SURFACE-01 defects');
  });

  // ---------------------------------------------------------------------------
  // Test 15: Malformed Tablet/Mobile Override -> HIGH Defect (Real Render + Mutation)
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 15] Malformed Tablet/Mobile Override -> HIGH Defect');

  await runAsyncTest('15. Malformed tablet/mobile override: no silent CSS emission and triggers HIGH defect in real render', async () => {
    const gt = make3VpGtGradientSnapshot({
      sid: 'c_malformed',
      desktopGrad: 'linear-gradient(180deg, rgb(255, 0, 0) 0%, rgb(0, 0, 255) 100%)',
      tabletGrad:  'linear-gradient(90deg, rgb(255, 0, 0) 10%, rgb(0, 0, 255) 90%)',
      mobileGrad:  'linear-gradient(45deg, rgb(255, 0, 0) 25%, rgb(0, 0, 255) 75%)'
    });

    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });
    mergeNodeResponsive(elements[0], null, gt);

    // Case A: Malformed unit on tablet angle ('px' instead of 'deg') with REAL RENDER
    const badTmplA = JSON.parse(JSON.stringify({ content: elements, page_settings: {} }));
    badTmplA.content[0].settings.background_gradient_angle_tablet = { unit: 'px', size: 90, sizes: [] };

    // Real Virtual Render: must NOT emit silent valid tablet CSS rule
    const previewHtmlA = renderElementorToHtml(badTmplA);
    assert(!previewHtmlA.includes('linear-gradient(90px'), 'Must not emit malformed px gradient syntax');
    assert(!previewHtmlA.includes('linear-gradient(90deg'), 'Must not silently emit valid tablet gradient when setting malformed');

    // Real Chromium Capture
    const realRenderSnapA = await captureRenderSnapshot(previewHtmlA);
    const realAuditA = auditVerificationMatrix(gt, realRenderSnapA, badTmplA);
    const realDefectA = realAuditA.defects.find(d => d.nodeSid === 'c_malformed' && d.rule === 'RULE-SURFACE-01' && d.viewport === 'tablet');

    assert(realDefectA, 'Malformed tablet unit must trigger HIGH defect in real render');
    assert.strictEqual(realDefectA.severity, 'HIGH');
    assert.strictEqual(realDefectA.advisory, false);
    assert(realDefectA.message.includes('malformed') || realDefectA.message.includes('invalid'), `Message: ${realDefectA.message}`);

    console.log('    • ACTUAL Defect Record for Malformed Tablet Override (from Real Chromium Render):');
    console.log(JSON.stringify(realDefectA, null, 2));

    // Case B: Out-of-range stop on mobile (150%) - Audit validation check
    const badTmplB = JSON.parse(JSON.stringify({ content: elements, page_settings: {} }));
    badTmplB.content[0].settings.background_color_stop_mobile = { unit: '%', size: 150, sizes: [] };
    const renderSnapB = makeRenderSnapshotMatchingGt(gt);
    const auditB = auditVerificationMatrix(gt, renderSnapB, badTmplB);
    const defectB = auditB.defects.find(d => d.nodeSid === 'c_malformed' && d.rule === 'RULE-SURFACE-01' && d.viewport === 'mobile');

    assert(defectB, 'Out-of-range mobile stop must trigger HIGH defect');
    assert.strictEqual(defectB.severity, 'HIGH');

    // Case C: Null override on tablet
    const badTmplC = JSON.parse(JSON.stringify({ content: elements, page_settings: {} }));
    badTmplC.content[0].settings.background_color_stop_tablet = null;
    const renderSnapC = makeRenderSnapshotMatchingGt(gt);
    const auditC = auditVerificationMatrix(gt, renderSnapC, badTmplC);
    const defectC = auditC.defects.find(d => d.nodeSid === 'c_malformed' && d.rule === 'RULE-SURFACE-01' && d.viewport === 'tablet');

    assert(defectC, 'Null override must trigger HIGH defect');
    assert.strictEqual(defectC.severity, 'HIGH');
  });

  // ---------------------------------------------------------------------------
  // Test 16: Rendered Gradient Tampered -> HIGH in Affected Viewport Only
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 16] Rendered Gradient Tampered -> HIGH in Affected Viewport Only');

  runTest('16. Rendered gradient tampered in tablet triggers HIGH defect in tablet only', () => {
    const gt = make3VpGtGradientSnapshot({
      sid: 'c_tampered',
      desktopGrad: 'linear-gradient(180deg, rgb(255, 0, 0) 0%, rgb(0, 0, 255) 100%)',
      tabletGrad:  'linear-gradient(90deg, rgb(255, 0, 0) 10%, rgb(0, 0, 255) 90%)',
      mobileGrad:  'linear-gradient(45deg, rgb(255, 0, 0) 25%, rgb(0, 0, 255) 75%)'
    });

    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });
    mergeNodeResponsive(elements[0], null, gt);

    const tmplJson = { content: elements, page_settings: {} };

    // Tamper tablet render only (120deg instead of 90deg)
    const tamperedRender = makeRenderSnapshotMatchingGt(gt, {
      tablet: {
        c_tampered: {
          backgroundImage: 'linear-gradient(120deg, rgb(255, 0, 0) 10%, rgb(0, 0, 255) 90%)'
        }
      }
    });

    const audit = auditVerificationMatrix(gt, tamperedRender, tmplJson);
    const deskDefects = audit.defects.filter(d => d.nodeSid === 'c_tampered' && d.rule === 'RULE-SURFACE-01' && d.viewport === 'desktop');
    const tabDefects  = audit.defects.filter(d => d.nodeSid === 'c_tampered' && d.rule === 'RULE-SURFACE-01' && d.viewport === 'tablet');
    const mobDefects  = audit.defects.filter(d => d.nodeSid === 'c_tampered' && d.rule === 'RULE-SURFACE-01' && d.viewport === 'mobile');

    assert.strictEqual(deskDefects.length, 0, 'Desktop must have 0 defects');
    assert.strictEqual(mobDefects.length, 0, 'Mobile must have 0 defects');
    assert.strictEqual(tabDefects.length, 1, 'Tablet must have exactly 1 defect');
    assert.strictEqual(tabDefects[0].severity, 'HIGH');
    assert(tabDefects[0].message.includes('gradient angle mismatch: expected 90deg, got 120deg'));
  });

  // ---------------------------------------------------------------------------
  // Test 17: GT Colors Changed -> HIGH Color Mismatch (Real Render Parity)
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 17] GT Colors Changed -> HIGH Color Mismatch (Real Render Evidence)');

  await runAsyncTest('17. GT colors changed on tablet: actual Chromium render retains desktop colors and triggers HIGH defect', async () => {
    const gt = make3VpGtGradientSnapshot({
      sid: 'c_color_mismatch',
      desktopGrad: 'linear-gradient(180deg, rgb(255, 0, 0) 0%, rgb(0, 0, 255) 100%)',
      tabletGrad:  'linear-gradient(90deg, rgb(0, 255, 0) 10%, rgb(255, 255, 0) 90%)', // colors changed to green/yellow
      mobileGrad:  'linear-gradient(45deg, rgb(255, 0, 0) 25%, rgb(0, 0, 255) 75%)'
    });

    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });
    mergeNodeResponsive(elements[0], null, gt);

    // Verify zero invented color keys
    assert.strictEqual(elements[0].settings.background_color_tablet, undefined);
    assert.strictEqual(elements[0].settings.background_color_b_tablet, undefined);

    // Real Virtual Render + Real Chromium Capture
    const tmplJson = { content: elements, page_settings: {} };
    const previewHtml = renderElementorToHtml(tmplJson);
    const realRenderSnap = await captureRenderSnapshot(previewHtml);

    const tabNode = realRenderSnap.viewports.tablet.flat['c_color_mismatch'];
    assert(tabNode, 'Tablet node must exist in real render snapshot');

    const tabRenderedBg = tabNode.styles.backgroundImage;
    console.log(`    • Actual Tablet Rendered Background (Test 17): ${tabRenderedBg}`);

    // Actual tablet rendered gradient retains desktop red/blue colors!
    assert(tabRenderedBg.includes('rgb(255, 0, 0)') && tabRenderedBg.includes('rgb(0, 0, 255)'), 'Actual tablet render must retain desktop colors');
    assert(!tabRenderedBg.includes('rgb(0, 255, 0)'), 'Actual tablet render must NOT guess GT green color');

    // Run audit with actual Chromium render
    const audit = auditVerificationMatrix(gt, realRenderSnap, tmplJson);
    const tabDefects = audit.defects.filter(d => d.nodeSid === 'c_color_mismatch' && d.rule === 'RULE-SURFACE-01' && d.viewport === 'tablet');

    assert.strictEqual(tabDefects.length, 1, 'Tablet must emit exactly 1 defect for color change');
    assert.strictEqual(tabDefects[0].severity, 'HIGH');
    assert.strictEqual(tabDefects[0].property, 'backgroundImage');
    assert(tabDefects[0].message.includes('Template background_color mismatch'), `Message: ${tabDefects[0].message}`);
    // Defect rendered field must reflect the ACTUAL desktop-color render
    assert(tabDefects[0].rendered.includes('rgb(255, 0, 0)'), `Rendered field must reflect actual render, got: ${tabDefects[0].rendered}`);

    console.log('    • ACTUAL Defect Record for Color Change in Tablet GT (from Real Chromium Render):');
    console.log(JSON.stringify(tabDefects[0], null, 2));

    const deskDefects = audit.defects.filter(d => d.nodeSid === 'c_color_mismatch' && d.rule === 'RULE-SURFACE-01' && d.viewport === 'desktop');
    assert.strictEqual(deskDefects.length, 0, 'Desktop must retain 0 defects');
  });

  // ---------------------------------------------------------------------------
  // Test 18: Unsupported 3+ Stops on Tablet -> HIGH Defect Remains
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 18] Unsupported 3+ Stops on Tablet -> HIGH Defect');

  runTest('18. Unsupported 3+ stops linear gradient on tablet triggers HIGH defect', () => {
    const gt = make3VpGtGradientSnapshot({
      sid: 'c_unsupported_stops',
      desktopGrad: 'linear-gradient(180deg, rgb(255, 0, 0) 0%, rgb(0, 0, 255) 100%)',
      tabletGrad:  'linear-gradient(90deg, rgb(255, 0, 0) 0%, rgb(0, 255, 0) 50%, rgb(0, 0, 255) 100%)', // 3 stops
      mobileGrad:  'linear-gradient(180deg, rgb(255, 0, 0) 0%, rgb(0, 0, 255) 100%)'
    });

    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });
    mergeNodeResponsive(elements[0], null, gt);

    const tmplJson = { content: elements, page_settings: {} };
    const renderSnap = makeRenderSnapshotMatchingGt(gt);
    const audit = auditVerificationMatrix(gt, renderSnap, tmplJson);

    const tabDefects = audit.defects.filter(d => d.nodeSid === 'c_unsupported_stops' && d.rule === 'RULE-SURFACE-01' && d.viewport === 'tablet');
    assert(tabDefects.length >= 1, 'Tablet with 3+ stops must have at least 1 defect');
    assert.strictEqual(tabDefects[0].severity, 'HIGH');
  });

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log(`ALL ${passedTests}/${totalTests} TESTS PASSED CLEANLY (100%)`);
  console.log('========================================================================');
})();

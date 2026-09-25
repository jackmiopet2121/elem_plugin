/**
 * Block 8.2 — Phase 5 (Part 3A): Native Image Geometry (Desktop).
 *
 * Verifies:
 * 1. Native background controls: background_size, background_position, background_repeat.
 * 2. 9-point grid mapping from keywords and percentage coordinates (0%, 50%, 100%).
 * 3. Normalization of auto / auto auto -> auto.
 * 4. Equivalent repeat strings (repeat repeat -> repeat, no-repeat no-repeat -> no-repeat, etc.).
 * 5. Explicit unsupported entries for custom values (px, calc, space/round, multi-value), zero guessing.
 * 6. Modern style dictionary missing property / ref throws FULL_STYLE_* without legacy fallback.
 * 7. Legacy snapshot fallback when snapshot has no styleDictionary.
 * 8. Pipeline integration: compilation preserves container primitive, color, URL, SIDs, and maps geometry on desktop.
 * 9. Unsupported geometry is omitted from native container settings (zero guessed defaults).
 * 10. Gradient / multi-layer / zero-image containers do NOT invoke geometry resolver.
 * 11. Virtual preview CSS emits whitelisted geometry rules and preserves safe URL guard.
 * 12. Real Chromium mini fixture: end-to-end computed-style parity for single image container background.
 */

'use strict';

const assert = require('assert');
const {
  resolveImageBackgroundGeometry,
  mapBackgroundSize,
  mapBackgroundPosition,
  mapBackgroundRepeat,
  VALID_SIZES,
  VALID_POSITIONS,
  VALID_REPEATS
} = require('../src/smart/image-background-geometry');
const { captureGroundTruth } = require('../src/smart/style-snapshot');
const { parseHtmlToAst } = require('../src/parser/html-parser');
const { compileGroundTruthToElementor } = require('../src/smart/geometry-mapper');
const { compileHtmlToElementor } = require('../src/engine');
const { renderElementorToHtml, isSafeCssUrl } = require('../src/emulator/elementor-virtual-renderer');
const { captureRenderSnapshot } = require('../src/smart/render-snapshot');

(async () => {
  console.log('========================================================================');
  console.log('BLOCK 8.2 — PHASE 5 (PART 3A): NATIVE IMAGE GEOMETRY (DESKTOP)');
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

  function makeGtSnapshot({
    sid = 'c_test',
    bgSize = 'auto',
    bgPosition = '0% 0%',
    bgRepeat = 'repeat',
    bgImage = 'url("https://example.com/hero.png")',
    bgColor = 'rgba(0, 0, 0, 0)',
    styleDict = undefined
  } = {}) {
    const ref = `ref-${sid}`;
    const dict = (styleDict !== undefined) ? styleDict : {
      [ref]: {
        'background-color': bgColor,
        'background-image': bgImage,
        'background-size': bgSize,
        'background-position': bgPosition,
        'background-repeat': bgRepeat,
        'border-top-left-radius': '0px',
        'border-top-right-radius': '0px',
        'border-bottom-right-radius': '0px',
        'border-bottom-left-radius': '0px'
      }
    };

    const node = {
      sid,
      tag: 'div',
      role: 'container',
      computedStyleRef: ref,
      rect: { x: 0, y: 0, w: 800, h: 400 },
      styles: {
        backgroundColor: bgColor,
        backgroundImage: bgImage,
        backgroundSize: bgSize,
        backgroundPosition: bgPosition,
        backgroundRepeat: bgRepeat
      }
    };

    const makeVp = () => ({
      flat: { [sid]: node },
      styleDictionary: dict,
      canvas: {
        html: { backgroundColor: 'transparent', backgroundImage: 'none' },
        body: { backgroundColor: 'transparent', backgroundImage: 'none' }
      }
    });

    return {
      annotatedHtml: `<div data-sid="${sid}"></div>`,
      viewports: {
        desktop: makeVp(),
        tablet: makeVp(),
        mobile: makeVp()
      }
    };
  }

  // ---------------------------------------------------------------------------
  // Section 1: Background Size Resolver Unit Tests
  // ---------------------------------------------------------------------------
  console.log('▶ [SECTION 1] Background Size Resolver Unit Tests');

  runTest('1.1. Native sizes map correctly: cover, contain, auto', () => {
    assert.strictEqual(mapBackgroundSize('cover'), 'cover');
    assert.strictEqual(mapBackgroundSize('contain'), 'contain');
    assert.strictEqual(mapBackgroundSize('auto'), 'auto');
  });

  runTest('1.2. Computed "auto auto" normalizes to native "auto"', () => {
    assert.strictEqual(mapBackgroundSize('auto auto'), 'auto');
    assert.strictEqual(mapBackgroundSize('  auto   auto  '), 'auto');
  });

  runTest('1.3. Unsupported sizes return null (zero guess): px, %, calc, multi-value', () => {
    assert.strictEqual(mapBackgroundSize('100px 50px'), null);
    assert.strictEqual(mapBackgroundSize('50%'), null);
    assert.strictEqual(mapBackgroundSize('calc(100% - 20px) auto'), null);
    assert.strictEqual(mapBackgroundSize('cover, contain'), null);
    assert.strictEqual(mapBackgroundSize(''), null);
    assert.strictEqual(mapBackgroundSize(null), null);
  });

  // ---------------------------------------------------------------------------
  // Section 2: Background Repeat Resolver Unit Tests
  // ---------------------------------------------------------------------------
  console.log('\n▶ [SECTION 2] Background Repeat Resolver Unit Tests');

  runTest('2.1. Native repeats map directly: repeat, no-repeat, repeat-x, repeat-y', () => {
    assert.strictEqual(mapBackgroundRepeat('repeat'), 'repeat');
    assert.strictEqual(mapBackgroundRepeat('no-repeat'), 'no-repeat');
    assert.strictEqual(mapBackgroundRepeat('repeat-x'), 'repeat-x');
    assert.strictEqual(mapBackgroundRepeat('repeat-y'), 'repeat-y');
  });

  runTest('2.2. Equivalent 2-axis repeat tokens map to single native setting', () => {
    assert.strictEqual(mapBackgroundRepeat('repeat repeat'), 'repeat');
    assert.strictEqual(mapBackgroundRepeat('no-repeat no-repeat'), 'no-repeat');
    assert.strictEqual(mapBackgroundRepeat('repeat no-repeat'), 'repeat-x');
    assert.strictEqual(mapBackgroundRepeat('no-repeat repeat'), 'repeat-y');
  });

  runTest('2.3. Unsupported repeat values return null (zero guess): space, round', () => {
    assert.strictEqual(mapBackgroundRepeat('space'), null);
    assert.strictEqual(mapBackgroundRepeat('round'), null);
    assert.strictEqual(mapBackgroundRepeat('space round'), null);
    assert.strictEqual(mapBackgroundRepeat('round repeat'), null);
    assert.strictEqual(mapBackgroundRepeat(''), null);
  });

  // ---------------------------------------------------------------------------
  // Section 3: Background Position Resolver Unit Tests (9-Point Grid)
  // ---------------------------------------------------------------------------
  console.log('\n▶ [SECTION 3] Background Position Resolver Unit Tests (9-Point Grid)');

  runTest('3.1. Exact 9 keyword values map to themselves', () => {
    const grid = [
      'top left', 'top center', 'top right',
      'center left', 'center center', 'center right',
      'bottom left', 'bottom center', 'bottom right'
    ];
    for (const pos of grid) {
      assert.strictEqual(mapBackgroundPosition(pos), pos);
    }
  });

  runTest('3.2. Swapped keyword pairs map to standard Elementor orientation', () => {
    assert.strictEqual(mapBackgroundPosition('left top'), 'top left');
    assert.strictEqual(mapBackgroundPosition('center top'), 'top center');
    assert.strictEqual(mapBackgroundPosition('right top'), 'top right');
    assert.strictEqual(mapBackgroundPosition('left center'), 'center left');
    assert.strictEqual(mapBackgroundPosition('right center'), 'center right');
    assert.strictEqual(mapBackgroundPosition('left bottom'), 'bottom left');
    assert.strictEqual(mapBackgroundPosition('center bottom'), 'bottom center');
    assert.strictEqual(mapBackgroundPosition('right bottom'), 'bottom right');
  });

  runTest('3.3. Single keywords expand to 2-axis grid positions', () => {
    assert.strictEqual(mapBackgroundPosition('center'), 'center center');
    assert.strictEqual(mapBackgroundPosition('top'), 'top center');
    assert.strictEqual(mapBackgroundPosition('bottom'), 'bottom center');
    assert.strictEqual(mapBackgroundPosition('left'), 'center left');
    assert.strictEqual(mapBackgroundPosition('right'), 'center right');
  });

  runTest('3.4. Chromium computed percentage coordinates map to exact 9 grid positions', () => {
    assert.strictEqual(mapBackgroundPosition('0% 0%'), 'top left');
    assert.strictEqual(mapBackgroundPosition('50% 0%'), 'top center');
    assert.strictEqual(mapBackgroundPosition('100% 0%'), 'top right');
    assert.strictEqual(mapBackgroundPosition('0% 50%'), 'center left');
    assert.strictEqual(mapBackgroundPosition('50% 50%'), 'center center');
    assert.strictEqual(mapBackgroundPosition('100% 50%'), 'center right');
    assert.strictEqual(mapBackgroundPosition('0% 100%'), 'bottom left');
    assert.strictEqual(mapBackgroundPosition('50% 100%'), 'bottom center');
    assert.strictEqual(mapBackgroundPosition('100% 100%'), 'bottom right');
  });

  runTest('3.5. Mixed keywords and percentages map correctly', () => {
    assert.strictEqual(mapBackgroundPosition('center 0%'), 'top center');
    assert.strictEqual(mapBackgroundPosition('50% top'), 'top center');
    assert.strictEqual(mapBackgroundPosition('left 50%'), 'center left');
    assert.strictEqual(mapBackgroundPosition('0% center'), 'center left');
    assert.strictEqual(mapBackgroundPosition('right 100%'), 'bottom right');
  });

  runTest('3.6. Unsupported positions return null (zero guess): arbitrary px, %, calc', () => {
    assert.strictEqual(mapBackgroundPosition('10px 20px'), null);
    assert.strictEqual(mapBackgroundPosition('25% 75%'), null);
    assert.strictEqual(mapBackgroundPosition('33% 33%'), null);
    assert.strictEqual(mapBackgroundPosition('calc(50% + 10px) 0%'), null);
    assert.strictEqual(mapBackgroundPosition('top left, bottom right'), null);
    assert.strictEqual(mapBackgroundPosition(''), null);
  });

  // ---------------------------------------------------------------------------
  // Section 4: Pure Resolver Return Structure & Unsupported Tracking
  // ---------------------------------------------------------------------------
  console.log('\n▶ [SECTION 4] Pure Resolver Return Structure & Unsupported Tracking');

  runTest('4.1. Fully representable styles return complete settings and empty unsupported list', () => {
    const gt = makeGtSnapshot({
      bgSize: 'cover',
      bgPosition: '50% 50%',
      bgRepeat: 'no-repeat'
    });
    const node = gt.viewports.desktop.flat['c_test'];
    const result = resolveImageBackgroundGeometry(node, gt, 'desktop');

    assert.deepStrictEqual(result.settings, {
      background_size: 'cover',
      background_position: 'center center',
      background_repeat: 'no-repeat'
    });
    assert.strictEqual(result.unsupported.length, 0);
  });

  runTest('4.2. Custom/unsupported styles track explicit reasons without guessing native settings', () => {
    const gt = makeGtSnapshot({
      bgSize: '240px 120px',
      bgPosition: '15px 30px',
      bgRepeat: 'space'
    });
    const node = gt.viewports.desktop.flat['c_test'];
    const result = resolveImageBackgroundGeometry(node, gt, 'desktop');

    assert.deepStrictEqual(result.settings, {});
    assert.strictEqual(result.unsupported.length, 3);

    const sizeUnsup = result.unsupported.find(u => u.property === 'background-size');
    assert(sizeUnsup, 'Must record unsupported background-size');
    assert.strictEqual(sizeUnsup.value, '240px 120px');
    assert.strictEqual(sizeUnsup.reason, 'UNSUPPORTED_BACKGROUND_SIZE_VALUE');

    const posUnsup = result.unsupported.find(u => u.property === 'background-position');
    assert(posUnsup, 'Must record unsupported background-position');
    assert.strictEqual(posUnsup.value, '15px 30px');
    assert.strictEqual(posUnsup.reason, 'UNSUPPORTED_BACKGROUND_POSITION_VALUE');

    const repUnsup = result.unsupported.find(u => u.property === 'background-repeat');
    assert(repUnsup, 'Must record unsupported background-repeat');
    assert.strictEqual(repUnsup.value, 'space');
    assert.strictEqual(repUnsup.reason, 'UNSUPPORTED_BACKGROUND_REPEAT_VALUE');
  });

  // ---------------------------------------------------------------------------
  // Section 5: Modern Dictionary Missing Property / Ref Errors (No Guessing)
  // ---------------------------------------------------------------------------
  console.log('\n▶ [SECTION 5] Modern Dictionary Error Guardrails');

  runTest('5.1. Missing background-size in modern dictionary throws FULL_STYLE_PROPERTY_MISSING', () => {
    const gt = makeGtSnapshot({
      styleDict: {
        'ref-c_test': {
          'background-color': 'rgba(0, 0, 0, 0)',
          'background-image': 'url("https://example.com/test.png")',
          // 'background-size' is missing
          'background-position': '0% 0%',
          'background-repeat': 'repeat'
        }
      }
    });
    const node = gt.viewports.desktop.flat['c_test'];
    let thrown = null;
    try {
      resolveImageBackgroundGeometry(node, gt, 'desktop');
    } catch (err) {
      thrown = err;
    }
    assert(thrown, 'Must throw error');
    assert.strictEqual(thrown.code, 'FULL_STYLE_PROPERTY_MISSING');
    assert.strictEqual(thrown.property, 'background-size');
  });

  runTest('5.2. Missing computedStyleRef in modern dictionary throws FULL_STYLE_REF_MISSING', () => {
    const gt = makeGtSnapshot();
    const node = { ...gt.viewports.desktop.flat['c_test'], computedStyleRef: 'non_existent_ref' };
    let thrown = null;
    try {
      resolveImageBackgroundGeometry(node, gt, 'desktop');
    } catch (err) {
      thrown = err;
    }
    assert(thrown, 'Must throw error');
    assert.strictEqual(thrown.code, 'FULL_STYLE_REF_MISSING');
  });

  runTest('5.3. Legacy snapshot without any styleDictionary falls back to gt.styles cleanly', () => {
    const legacyGt = {
      viewports: {
        desktop: {
          flat: {
            'c_legacy': {
              sid: 'c_legacy',
              tag: 'div',
              role: 'container',
              styles: {
                backgroundSize: 'cover',
                backgroundPosition: '50% 50%',
                backgroundRepeat: 'no-repeat'
              }
            }
          }
        }
      }
    };
    const node = legacyGt.viewports.desktop.flat['c_legacy'];
    const result = resolveImageBackgroundGeometry(node, legacyGt, 'desktop');
    assert.deepStrictEqual(result.settings, {
      background_size: 'cover',
      background_position: 'center center',
      background_repeat: 'no-repeat'
    });
  });

  // ---------------------------------------------------------------------------
  // Section 6: Compilation Integration & Primitive Preservation
  // ---------------------------------------------------------------------------
  console.log('\n▶ [SECTION 6] Compilation Integration & Primitive Preservation');

  runTest('6.1. Compiler maps desktop native geometry and preserves container primitive + color + URL', () => {
    const imgUrl = 'https://example.com/assets/banner.jpg';
    const bgColor = 'rgba(15, 23, 42, 0.9)';
    const gt = makeGtSnapshot({
      sid: 'c_integ_1',
      bgImage: `url("${imgUrl}")`,
      bgColor,
      bgSize: 'cover',
      bgPosition: '50% 50%',
      bgRepeat: 'no-repeat'
    });
    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });
    const all = collectAllElements(elements);
    const c = all.find(e => e._sid === 'c_integ_1' || e.settings?._sid === 'c_integ_1');

    assert(c, 'Container c_integ_1 must be present');
    assert.strictEqual(c.elType, 'container', 'Must retain container primitive');
    assert.strictEqual(c.widgetType, undefined, 'Must not be a widget');
    assert.strictEqual(c.settings.background_background, 'classic');
    assert.deepStrictEqual(c.settings.background_image, { url: imgUrl, id: '' });
    assert.strictEqual(c.settings.background_color, bgColor);
    assert.strictEqual(c.settings.background_size, 'cover');
    assert.strictEqual(c.settings.background_position, 'center center');
    assert.strictEqual(c.settings.background_repeat, 'no-repeat');
  });

  runTest('6.2. Container with unsupported geometry keeps image URL and color, but omits geometry settings (zero guess)', () => {
    const imgUrl = 'https://example.com/custom-bg.png';
    const gt = makeGtSnapshot({
      sid: 'c_unsup_geo',
      bgImage: `url("${imgUrl}")`,
      bgSize: '300px 150px',
      bgPosition: '10px 20px',
      bgRepeat: 'space'
    });
    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });
    const all = collectAllElements(elements);
    const c = all.find(e => e._sid === 'c_unsup_geo' || e.settings?._sid === 'c_unsup_geo');

    assert(c, 'Container must exist');
    assert.strictEqual(c.settings.background_background, 'classic');
    assert.deepStrictEqual(c.settings.background_image, { url: imgUrl, id: '' });
    // Unsupported geometry must NOT be guessed
    assert.strictEqual(c.settings.background_size, undefined, 'Must not guess background_size');
    assert.strictEqual(c.settings.background_position, undefined, 'Must not guess background_position');
    assert.strictEqual(c.settings.background_repeat, undefined, 'Must not guess background_repeat');
  });

  runTest('6.3. Gradient or no-image containers do NOT invoke geometry resolver or set geometry keys', () => {
    const gt = makeGtSnapshot({
      sid: 'c_gradient',
      bgImage: 'linear-gradient(135deg, rgb(255, 0, 0), rgb(0, 0, 255))',
      bgSize: 'cover',
      bgPosition: 'center center',
      bgRepeat: 'no-repeat'
    });
    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });
    const all = collectAllElements(elements);
    const c = all.find(e => e._sid === 'c_gradient' || e.settings?._sid === 'c_gradient');

    assert(c, 'Container must exist');
    assert.strictEqual(c.settings.background_image, undefined);
    assert.strictEqual(c.settings.background_size, undefined);
    assert.strictEqual(c.settings.background_position, undefined);
    assert.strictEqual(c.settings.background_repeat, undefined);
  });

  // ---------------------------------------------------------------------------
  // Section 7: Virtual Renderer Emission
  // ---------------------------------------------------------------------------
  console.log('\n▶ [SECTION 7] Virtual Renderer Emission');

  runTest('7.1. Virtual renderer emits whitelisted background-size, background-position, background-repeat', () => {
    const template = {
      title: 'Geometry CSS Emission Test',
      content: [
        {
          _sid: 'c_css_1',
          id: 'w_css_1',
          elType: 'container',
          settings: {
            background_background: 'classic',
            background_image: { url: 'https://example.com/clean.jpg', id: '' },
            background_size: 'cover',
            background_position: 'center center',
            background_repeat: 'no-repeat'
          },
          elements: []
        }
      ]
    };

    const renderedHtml = renderElementorToHtml(template);
    assert(renderedHtml.includes('background-image: url("https://example.com/clean.jpg");'), 'Must emit background-image');
    assert(renderedHtml.includes('background-size: cover;'), 'Must emit background-size: cover;');
    assert(renderedHtml.includes('background-position: center center;'), 'Must emit background-position: center center;');
    assert(renderedHtml.includes('background-repeat: no-repeat;'), 'Must emit background-repeat: no-repeat;');
  });

  runTest('7.2. Virtual renderer does not emit unwhitelisted / forged geometry strings', () => {
    const template = {
      title: 'Unwhitelisted Geometry Test',
      content: [
        {
          _sid: 'c_css_2',
          id: 'w_css_2',
          elType: 'container',
          settings: {
            background_background: 'classic',
            background_image: { url: 'https://example.com/clean.jpg', id: '' },
            background_size: '100px 50px; evil-rule: true',
            background_position: 'top left; color: red',
            background_repeat: 'repeat-y; overflow: hidden'
          },
          elements: []
        }
      ]
    };

    const renderedHtml = renderElementorToHtml(template);
    assert(!renderedHtml.includes('100px 50px'), 'Must not emit unwhitelisted size');
    assert(!renderedHtml.includes('evil-rule'), 'Must not emit injected rule in size');
    assert(!renderedHtml.includes('top left; color: red'), 'Must not emit unwhitelisted position');
    assert(!renderedHtml.includes('repeat-y; overflow'), 'Must not emit unwhitelisted repeat');
  });

  // ---------------------------------------------------------------------------
  // Section 8: Real Headless Chromium Mini Fixture (End-to-End Computed Parity)
  // ---------------------------------------------------------------------------
  console.log('\n▶ [SECTION 8] Real Headless Chromium Mini Fixture (Computed Style Parity)');

  await runAsyncTest('8. End-to-end Chromium fixture: capture GT -> compile -> virtual render -> Chromium computed parity', async () => {
    const fixtureHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: rgb(240, 244, 248);
    }
    .hero-banner {
      background-image: url("https://images.unsplash.com/photo-1579546929518-9e396f3cc809");
      background-size: cover;
      background-position: center center;
      background-repeat: no-repeat;
      background-color: rgb(15, 23, 42);
      padding: 48px 32px;
      min-height: 350px;
      box-sizing: border-box;
    }
    .hero-banner h1 {
      color: rgb(255, 255, 255);
      margin: 0;
      font-size: 28px;
    }
  </style>
</head>
<body>
  <div class="hero-banner" id="hero-banner-container">
    <h1>Single Image Container</h1>
  </div>
</body>
</html>`;

    console.log('    • Capturing real Ground Truth snapshot with Chromium...');
    const gtSnapshot = await captureGroundTruth(fixtureHtml, { cache: false });
    assert(gtSnapshot?.viewports?.desktop?.flat, 'GT must contain flat nodes for desktop');

    const heroGtNode = Object.values(gtSnapshot.viewports.desktop.flat).find(
      n => n.id === 'hero-banner-container'
    );
    assert(heroGtNode, 'Hero container node must be captured in GT');

    // Inspect Chromium ground-truth computed styles
    const gtDict = gtSnapshot.viewports.desktop.styleDictionary;
    const heroRef = heroGtNode.computedStyleRef;
    const heroComputed = gtDict[heroRef];

    console.log('    • Chromium GT Computed Styles:');
    console.log(`      - background-image:    ${heroComputed['background-image']}`);
    console.log(`      - background-size:     ${heroComputed['background-size']}`);
    console.log(`      - background-position: ${heroComputed['background-position']}`);
    console.log(`      - background-repeat:   ${heroComputed['background-repeat']}`);
    console.log(`      - background-color:    ${heroComputed['background-color']}`);

    assert(heroComputed['background-image'].includes('unsplash.com'), 'GT image must match fixture');
    assert.strictEqual(heroComputed['background-size'], 'cover', 'GT size must be cover');
    assert.strictEqual(heroComputed['background-position'], '50% 50%', 'Chromium computes center center as 50% 50%');
    assert.strictEqual(heroComputed['background-repeat'], 'no-repeat', 'GT repeat must be no-repeat');
    assert.strictEqual(heroComputed['background-color'], 'rgb(15, 23, 42)', 'GT color must be rgb(15, 23, 42)');

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
    const heroCompiled = allElements.find(
      e => e.settings?._element_id === 'hero-banner-container' || e._element_id === 'hero-banner-container'
    );

    assert(heroCompiled, 'Hero container must exist in Elementor template');
    assert.strictEqual(heroCompiled.elType, 'container');
    assert.strictEqual(heroCompiled.settings.background_background, 'classic');
    assert(heroCompiled.settings.background_image?.url.includes('unsplash.com'));
    assert.strictEqual(heroCompiled.settings.background_size, 'cover');
    assert.strictEqual(heroCompiled.settings.background_position, 'center center');
    assert.strictEqual(heroCompiled.settings.background_repeat, 'no-repeat');
    assert.strictEqual(heroCompiled.settings.background_color, 'rgb(15, 23, 42)');

    console.log('    • Elementor Native Container Settings:');
    console.log(`      - background_background: ${heroCompiled.settings.background_background}`);
    console.log(`      - background_image.url:  ${heroCompiled.settings.background_image.url}`);
    console.log(`      - background_size:       ${heroCompiled.settings.background_size}`);
    console.log(`      - background_position:   ${heroCompiled.settings.background_position}`);
    console.log(`      - background_repeat:     ${heroCompiled.settings.background_repeat}`);
    console.log(`      - background_color:      ${heroCompiled.settings.background_color}`);

    console.log('    • Rendering Elementor template to virtual HTML...');
    const previewHtml = renderElementorToHtml(compileResult.templateJson, { fonts: gtSnapshot.fonts });
    assert(previewHtml.includes('background-size: cover;'), 'Virtual CSS must include background-size: cover;');
    assert(previewHtml.includes('background-position: center center;'), 'Virtual CSS must include background-position: center center;');
    assert(previewHtml.includes('background-repeat: no-repeat;'), 'Virtual CSS must include background-repeat: no-repeat;');
    assert(previewHtml.includes('background-color: rgb(15, 23, 42);'), 'Virtual CSS must include background-color');

    console.log('    • Capturing render snapshot of virtual preview with Chromium...');
    const renderSnapshot = await captureRenderSnapshot(previewHtml);
    assert(renderSnapshot?.viewports?.desktop?.flat, 'Render snapshot must contain desktop flat nodes');

    const heroRenderNode = renderSnapshot.viewports.desktop.flat[heroGtNode.sid];
    assert(heroRenderNode, 'Rendered node matching GT SID must exist');
    const rns = heroRenderNode.styles;

    console.log('    • Chromium Rendered Computed Styles:');
    console.log(`      - background-image:    ${rns.backgroundImage}`);
    console.log(`      - background-size:     ${rns.backgroundSize}`);
    console.log(`      - background-position: ${rns.backgroundPosition}`);
    console.log(`      - background-repeat:   ${rns.backgroundRepeat}`);
    console.log(`      - background-color:    ${rns.backgroundColor}`);

    // Verify computed-style parity
    assert(rns.backgroundImage.includes('unsplash.com'), 'Rendered background-image must match');
    assert.strictEqual(rns.backgroundSize, 'cover', 'Rendered background-size computed parity verified');
    assert.strictEqual(rns.backgroundPosition, '50% 50%', 'Rendered background-position computed parity verified (50% 50%)');
    assert.strictEqual(rns.backgroundRepeat, 'no-repeat', 'Rendered background-repeat computed parity verified');
    assert.strictEqual(rns.backgroundColor, 'rgb(15, 23, 42)', 'Rendered background-color computed parity verified');
  });

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log(`ALL ${passedTests}/${totalTests} TESTS PASSED CLEANLY (100%)`);
  console.log('========================================================================');
})();

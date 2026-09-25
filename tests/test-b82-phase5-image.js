/**
 * Block 8.2 — Phase 5 (Part 2): Single-Image Native Routing & Verification.
 *
 * Verifies:
 * 1. Single image with quoted URL -> native container setting { url, id: '' }, mode 'classic',
 *    and virtual CSS emits background-image: url(...).
 * 2. Single image with alpha background-color -> both settings present on container,
 *    and virtual CSS emits both background-color and background-image.
 * 3. Container retention -> container remains elType 'container' (not an image or html widget).
 * 4. Malformed / empty url() -> zero native background_image, zero guess.
 * 5. Multi-layer url(...), url(...) -> zero native background_image, explicit unverified defect in matrix.
 * 6. Linear-gradient or mixture -> zero native background_image, explicit unverified defect in matrix.
 * 7. Real Chromium mini fixture with static background-image on container:
 *    compile -> native classic + image URL -> virtual render CSS -> matrix audit reports explicit
 *    unverified HIGH defect awaiting Part 3 capability routing (honest report, zero false clean pass).
 */

'use strict';

const assert = require('assert');
const { auditVerificationMatrix } = require('../src/smart/verification-matrix');
const { captureGroundTruth } = require('../src/smart/style-snapshot');
const { parseHtmlToAst } = require('../src/parser/html-parser');
const { compileGroundTruthToElementor } = require('../src/smart/geometry-mapper');
const { compileHtmlToElementor } = require('../src/engine');
const { renderElementorToHtml, isSafeCssUrl } = require('../src/emulator/elementor-virtual-renderer');
const { captureRenderSnapshot } = require('../src/smart/render-snapshot');

(async () => {
  console.log('========================================================================');
  console.log('BLOCK 8.2 — PHASE 5 (PART 2): SINGLE-IMAGE NATIVE ROUTING');
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
  // Test 1: Single image with quoted URL -> native container setting + virtual CSS
  // ---------------------------------------------------------------------------
  console.log('▶ [TEST 1] Single Image with Quoted URL -> Native Container Setting');

  runTest('1. Quoted URL maps to native background_image and emits virtual CSS', () => {
    const rawUrl = 'https://example.com/assets/hero.jpg';
    const gt = make3VpGtSnapshot({
      sid: 'c1',
      bgImage: `url("${rawUrl}")`,
      bgColor: 'transparent'
    });
    const ast = parseHtmlToAst(gt.annotatedHtml);
    const atomicRules = [];
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules });
    const all = collectAllElements(elements);
    const container = all.find(e => e._sid === 'c1' || e.settings?._sid === 'c1');

    assert(container, 'Container c1 must be present in compiled elements');
    assert.strictEqual(container.elType, 'container', 'Must remain elType container');
    assert.strictEqual(container.settings.background_background, 'classic', 'Must set background_background: classic');
    assert.deepStrictEqual(
      container.settings.background_image,
      { url: rawUrl, id: '' },
      'Must set native background_image { url, id: "" }'
    );

    // Verify virtual preview CSS emission
    const previewHtml = renderElementorToHtml({
      content: [container],
      page_settings: {}
    });
    assert(
      previewHtml.includes(`background-image: url("${rawUrl}");`),
      `Virtual preview CSS must include background-image: url("${rawUrl}");`
    );
    // Guessed background-size / repeat / position must NOT be emitted in Part 2
    assert(!previewHtml.includes('background-size: cover;'), 'Must not emit guessed background-size in Part 2');
    assert(!previewHtml.includes('background-repeat: no-repeat;'), 'Must not emit guessed background-repeat in Part 2');
  });

  // ---------------------------------------------------------------------------
  // Test 2: Single image with alpha background color -> both settings present
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 2] Single Image with Alpha Background Color');

  runTest('2. Image + alpha color preserves both settings and renders both in virtual CSS', () => {
    const imgUrl = 'https://example.com/card-bg.png';
    const alphaColor = 'rgba(15, 23, 42, 0.75)';
    const gt = make3VpGtSnapshot({
      sid: 'c2',
      bgImage: `url("${imgUrl}")`,
      bgColor: alphaColor
    });
    const ast = parseHtmlToAst(gt.annotatedHtml);
    const atomicRules = [];
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules });
    const all = collectAllElements(elements);
    const container = all.find(e => e._sid === 'c2' || e.settings?._sid === 'c2');

    assert(container, 'Container c2 must exist');
    assert.strictEqual(container.settings.background_background, 'classic');
    assert.strictEqual(container.settings.background_color, alphaColor, 'Must preserve background_color');
    assert.deepStrictEqual(container.settings.background_image, { url: imgUrl, id: '' });

    const previewHtml = renderElementorToHtml({
      content: [container],
      page_settings: {}
    });
    assert(previewHtml.includes(`background-color: ${alphaColor};`), 'Virtual preview CSS must include background-color');
    assert(previewHtml.includes(`background-image: url("${imgUrl}");`), 'Virtual preview CSS must include background-image');
  });

  // ---------------------------------------------------------------------------
  // Test 3: Container retention -> remains container, never converted to widget
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 3] Container Primitive Retention');

  runTest('3. Container with background image remains elType container', () => {
    const gt = make3VpGtSnapshot({
      sid: 'c3',
      bgImage: 'url(\'https://example.com/test.jpg\')',
      bgColor: 'transparent'
    });
    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });
    const all = collectAllElements(elements);
    const container = all.find(e => e._sid === 'c3' || e.settings?._sid === 'c3');

    assert(container, 'Container c3 must exist');
    assert.strictEqual(container.elType, 'container');
    assert.strictEqual(container.widgetType, undefined, 'Must not be a widget');
  });

  // ---------------------------------------------------------------------------
  // Test 4: Malformed / empty url() -> zero native background_image, zero guess
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 4] Malformed / Empty url()');

  runTest('4. Empty and malformed url() values do not set background_image', () => {
    const malformedCases = ['url()', 'url("")', 'url(\'\')', 'url(   )', 'none', ''];

    for (const bgVal of malformedCases) {
      const gt = make3VpGtSnapshot({
        sid: 'c4',
        bgImage: bgVal,
        bgColor: 'transparent'
      });
      const ast = parseHtmlToAst(gt.annotatedHtml);
      const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });
      const all = collectAllElements(elements);
      const container = all.find(e => e._sid === 'c4' || e.settings?._sid === 'c4');

      assert(container, `Container must exist for case "${bgVal}"`);
      assert.strictEqual(
        container.settings.background_image,
        undefined,
        `background_image must remain undefined for "${bgVal}", got ${JSON.stringify(container.settings.background_image)}`
      );
    }
  });

  // ---------------------------------------------------------------------------
  // Test 5: Multi-layer url(...), url(...) -> zero native setting, unverified matrix defect
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 5] Multi-Layer Images -> Zero Native Setting, Unverified Defect');

  runTest('5. Multi-layer background image yields no native image and reports unverified defect', () => {
    const multiLayer = 'url("https://example.com/layer1.png"), url("https://example.com/layer2.png")';
    const gt = make3VpGtSnapshot({
      sid: 'c5',
      bgImage: multiLayer,
      bgColor: 'transparent'
    });
    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });
    const all = collectAllElements(elements);
    const container = all.find(e => e._sid === 'c5' || e.settings?._sid === 'c5');

    assert.strictEqual(container.settings.background_image, undefined, 'Multi-layer must not be mapped to native single image');

    // Matrix audit
    const render = make3VpRenderSnapshot({
      sid: 'c5',
      bgColor: 'transparent',
      bgImage: multiLayer
    });
    const tpl = {
      content: [container],
      page_settings: {}
    };
    const audit = auditVerificationMatrix(gt, render, tpl);
    const surfaceDefects = audit.defects.filter(d => d.nodeSid === 'c5' && d.rule === 'RULE-SURFACE-01');

    assert.strictEqual(surfaceDefects.length, 3, `Expected 3 unverified surface defects, got ${surfaceDefects.length}`);
    for (const d of surfaceDefects) {
      assert.strictEqual(d.severity, 'HIGH');
      assert(d.message.includes('Unverified surface'), `Message must indicate unverified surface, got: ${d.message}`);
    }
  });

  // ---------------------------------------------------------------------------
  // Test 6: Linear-gradient or mixture -> zero native setting, unverified matrix defect
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 6] Gradient / Mixture -> Zero Native Setting, Unverified Defect');

  runTest('6. Gradient and mixture yield no native image and report unverified defect', () => {
    const mixture = 'url("https://example.com/hero.jpg"), linear-gradient(to bottom, #000, #fff)';
    const gt = make3VpGtSnapshot({
      sid: 'c6',
      bgImage: mixture,
      bgColor: 'transparent'
    });
    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });
    const all = collectAllElements(elements);
    const container = all.find(e => e._sid === 'c6' || e.settings?._sid === 'c6');

    assert.strictEqual(container.settings.background_image, undefined, 'Mixture must not be mapped to native single image');

    const render = make3VpRenderSnapshot({
      sid: 'c6',
      bgColor: 'transparent',
      bgImage: mixture
    });
    const tpl = {
      content: [container],
      page_settings: {}
    };
    const audit = auditVerificationMatrix(gt, render, tpl);
    const surfaceDefects = audit.defects.filter(d => d.nodeSid === 'c6' && d.rule === 'RULE-SURFACE-01');

    assert.strictEqual(surfaceDefects.length, 3, `Expected 3 unverified surface defects, got ${surfaceDefects.length}`);
    for (const d of surfaceDefects) {
      assert.strictEqual(d.severity, 'HIGH');
      assert(d.message.includes('Unverified surface'));
    }
  });

  // ---------------------------------------------------------------------------
  // Test 7: Real Chromium mini fixture with static background-image on container
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 7] Real Chromium Mini Fixture (Container Static Background-Image)');

  await runAsyncTest('7. Real Chromium mini fixture: compile, render virtual, honest defect report', async () => {
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
    .hero-container {
      background-image: url("https://images.unsplash.com/photo-1579546929518-9e396f3cc809");
      background-color: rgb(15, 23, 42);
      padding: 48px 32px;
      box-sizing: border-box;
    }
    .hero-container h1 {
      color: rgb(255, 255, 255);
      margin: 0;
      font-size: 28px;
    }
  </style>
</head>
<body>
  <div class="hero-container" id="hero-box">
    <h1>Hero Container Title</h1>
  </div>
</body>
</html>`;

    console.log('    • Capturing real Ground Truth snapshot with Chromium...');
    const gtSnapshot = await captureGroundTruth(fixtureHtml, { cache: false });
    assert(gtSnapshot?.viewports?.desktop?.flat, 'GT must have flat nodes');

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
    const heroEl = allElements.find(e => e.settings?._element_id === 'hero-box' || e._element_id === 'hero-box');

    assert(heroEl, 'Hero container must be present in template');
    assert.strictEqual(heroEl.elType, 'container', 'Hero must be elType container');
    assert.strictEqual(heroEl.settings.background_background, 'classic', 'Must have classic background mode');
    assert(heroEl.settings.background_image?.url, 'Must have background_image url');
    assert(
      heroEl.settings.background_image.url.includes('unsplash.com'),
      `background_image.url must contain image source, got: ${heroEl.settings.background_image?.url}`
    );
    assert.strictEqual(heroEl.settings.background_color, 'rgb(15, 23, 42)', 'Must preserve background_color');

    console.log('    • Rendering Elementor template to HTML...');
    const previewHtml = renderElementorToHtml(compileResult.templateJson, { fonts: gtSnapshot.fonts });
    assert(
      previewHtml.includes('background-image: url('),
      'Virtual preview HTML must contain background-image rule'
    );
    assert(
      previewHtml.includes('background-color: rgb(15, 23, 42);'),
      'Virtual preview HTML must contain background-color rule'
    );

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

    // Canvas parity clean
    assert.strictEqual(canvasDefects.length, 0, `RULE-CANVAS-01 should have 0 defects, got: ${canvasDefects.length}`);

    // In Part 5A, when native template URL, rendered URL, and base color match:
    // exactly 0 RULE-SURFACE-01 defects are expected.
    assert.strictEqual(surfaceDefects.length, 0, `RULE-SURFACE-01 should have 0 defects, got: ${surfaceDefects.length}`);
  });

  // ---------------------------------------------------------------------------
  // Test 8: Task 1 — Forbidden modern-to-legacy fallback on missing background-image
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 8] Modern Dictionary Missing background-image -> FULL_STYLE_PROPERTY_MISSING');

  runTest('8. Missing background-image in modern dictionary throws FULL_STYLE_PROPERTY_MISSING without falling back to stale legacy styles', () => {
    const gt = make3VpGtSnapshot({
      sid: 'c_missing_prop',
      styleDict: {
        'ref-c_missing_prop': {
          'background-color': 'rgb(255, 255, 255)',
          // 'background-image' is deliberately omitted from modern dictionary
          'border-top-left-radius': '0px',
          'border-top-right-radius': '0px',
          'border-bottom-right-radius': '0px',
          'border-bottom-left-radius': '0px'
        }
      }
    });
    // Stale URL in legacy styles object
    gt.viewports.desktop.flat['c_missing_prop'].styles.backgroundImage = 'url("https://example.com/stale-legacy.jpg")';

    const ast = parseHtmlToAst(gt.annotatedHtml);
    let thrown = null;
    try {
      compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });
    } catch (err) {
      thrown = err;
    }

    assert(thrown, 'Must throw error when modern dictionary is missing property');
    assert.strictEqual(thrown.code, 'FULL_STYLE_PROPERTY_MISSING', `Error code must be FULL_STYLE_PROPERTY_MISSING, got: ${thrown.code}`);
    assert(thrown.message.includes('FULL_STYLE_PROPERTY_MISSING'), 'Message must include error code');
    assert.strictEqual(thrown.property, 'background-image');
  });

  // ---------------------------------------------------------------------------
  // Test 9: Task 2 — URL syntax parsing vs word matching
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 9] URL Syntax Parsing (gradient in filename, literal ), actual gradients, mixed layers)');

  runTest('9.1. Quoted URL containing the word "gradient" maps to native background_image', () => {
    const url = 'https://example.test/gradient-banner.png';
    const gt = make3VpGtSnapshot({
      sid: 'c_grad_file',
      bgImage: `url("${url}")`
    });
    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });
    const all = collectAllElements(elements);
    const c = all.find(e => e._sid === 'c_grad_file' || e.settings?._sid === 'c_grad_file');

    assert(c, 'Container must exist');
    assert.strictEqual(c.settings.background_background, 'classic');
    assert.deepStrictEqual(c.settings.background_image, { url, id: '' });
  });

  runTest('9.2. Quoted URL containing literal ")" with balanced outer parens maps to native background_image', () => {
    const url = 'https://example.test/image(1).png';
    const gt = make3VpGtSnapshot({
      sid: 'c_paren_url',
      bgImage: `url("${url}")`
    });
    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });
    const all = collectAllElements(elements);
    const c = all.find(e => e._sid === 'c_paren_url' || e.settings?._sid === 'c_paren_url');

    assert(c, 'Container must exist');
    assert.strictEqual(c.settings.background_background, 'classic');
    assert.deepStrictEqual(c.settings.background_image, { url, id: '' });
  });

  runTest('9.3. Single-quoted URL containing literal ")" maps to native background_image', () => {
    const url = 'https://example.test/banner(v2).png';
    const gt = make3VpGtSnapshot({
      sid: 'c_sq_paren',
      bgImage: `url('${url}')`
    });
    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });
    const all = collectAllElements(elements);
    const c = all.find(e => e._sid === 'c_sq_paren' || e.settings?._sid === 'c_sq_paren');

    assert(c, 'Container must exist');
    assert.strictEqual(c.settings.background_background, 'classic');
    assert.deepStrictEqual(c.settings.background_image, { url, id: '' });
  });

  runTest('9.4. Actual linear-gradient is rejected by URL syntax (not mapped to background_image)', () => {
    const gt = make3VpGtSnapshot({
      sid: 'c_real_grad',
      bgImage: 'linear-gradient(to right, rgb(0, 0, 0), rgb(255, 255, 255))'
    });
    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });
    const all = collectAllElements(elements);
    const c = all.find(e => e._sid === 'c_real_grad' || e.settings?._sid === 'c_real_grad');

    assert(c, 'Container must exist');
    assert.strictEqual(c.settings.background_image, undefined, 'Actual gradient must not set native background_image');
  });

  runTest('9.5. Mixed layers (url + linear-gradient) do not extract first URL', () => {
    const mixed = 'url("https://example.test/first.png"), linear-gradient(to bottom, #000, #fff)';
    const gt = make3VpGtSnapshot({
      sid: 'c_mixed_layers',
      bgImage: mixed
    });
    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });
    const all = collectAllElements(elements);
    const c = all.find(e => e._sid === 'c_mixed_layers' || e.settings?._sid === 'c_mixed_layers');

    assert(c, 'Container must exist');
    assert.strictEqual(c.settings.background_image, undefined, 'Must not extract first URL from mixed layers');
  });

  // ---------------------------------------------------------------------------
  // Test 10: Task 3 — Virtual Preview Safe URL Enforcement
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 10] Virtual Preview Safe URL Enforcement');

  runTest('10.1. Malicious URL containing </style><script> is rejected: no raw tag injection and no background-image rule', () => {
    const unsafeUrl = 'https://example.com/img.png</style><script>alert("xss")</script>';
    const template = {
      title: 'Unsafe URL Test',
      content: [
        {
          _sid: 'c_unsafe_1',
          id: 'w_unsafe_1',
          elType: 'container',
          settings: {
            background_background: 'classic',
            background_image: { url: unsafeUrl, id: '' }
          },
          elements: []
        }
      ]
    };

    const previewHtml = renderElementorToHtml(template);
    assert(!previewHtml.includes('</style><script>'), 'Generated preview must not contain raw injected </style><script> tag');
    assert(!previewHtml.includes('<script>alert'), 'Generated preview must not contain injected script content');
    assert(!previewHtml.includes(`background-image: url("${unsafeUrl}");`), 'Unsafe URL must not be emitted as background-image');
    assert(!previewHtml.includes('background-image:'), 'No background-image rule should be emitted for unsafe URL');
  });

  runTest('10.2. URL with ASCII control characters or CSS string-breaking chars (quotes, newlines, semicolons) is rejected', () => {
    const brokenCases = [
      'https://example.com/test\x00null.png',
      'https://example.com/test\nnewline.png',
      'https://example.com/test\rreturn.png',
      'https://example.com/test"quote.png',
      'https://example.com/test;color:red.png',
      'https://example.com/test{display:none}.png',
      'https://example.com/test\\escape.png'
    ];

    for (const badUrl of brokenCases) {
      assert.strictEqual(isSafeCssUrl(badUrl), false, `isSafeCssUrl must reject "${badUrl}"`);

      const tpl = {
        title: 'Safety Test',
        content: [
          {
            _sid: 'c_bad',
            id: 'w_bad',
            elType: 'container',
            settings: {
              background_background: 'classic',
              background_image: { url: badUrl, id: '' }
            },
            elements: []
          }
        ]
      };
      const rendered = renderElementorToHtml(tpl);
      assert(!rendered.includes('background-image:'), `Must not emit background-image for bad URL "${badUrl}"`);
    }
  });

  runTest('10.3. Normal safe URL is correctly emitted in virtual preview CSS', () => {
    const safeUrl = 'https://example.com/assets/clean-hero.png';
    assert.strictEqual(isSafeCssUrl(safeUrl), true);

    const template = {
      title: 'Safe URL Test',
      content: [
        {
          _sid: 'c_safe',
          id: 'w_safe',
          elType: 'container',
          settings: {
            background_background: 'classic',
            background_image: { url: safeUrl, id: '' }
          },
          elements: []
        }
      ]
    };

    const previewHtml = renderElementorToHtml(template);
    assert(
      previewHtml.includes(`background-image: url("${safeUrl}");`),
      `Virtual preview must emit background-image: url("${safeUrl}");`
    );
  });

  // ---------------------------------------------------------------------------
  // Test 11: Part 5A — Focused Single-Image Background Content Verification
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 11] Part 5A Single-Image Background Content Verification (Negative & Positive)');

  runTest('11.1. Wrong template URL triggers HIGH RULE-SURFACE-01 defect', () => {
    const gtUrl = 'https://example.com/gt-hero.jpg';
    const wrongTmplUrl = 'https://example.com/wrong-template.jpg';
    const gt = make3VpGtSnapshot({
      sid: 'c_wrong_tmpl',
      bgImage: `url("${gtUrl}")`,
      bgColor: 'rgb(15, 23, 42)'
    });
    const render = make3VpRenderSnapshot({
      sid: 'c_wrong_tmpl',
      bgImage: `url("${gtUrl}")`,
      bgColor: 'rgb(15, 23, 42)'
    });
    const tpl = {
      content: [
        {
          _sid: 'c_wrong_tmpl',
          id: 'w_wrong_tmpl',
          elType: 'container',
          settings: {
            background_background: 'classic',
            background_image: { url: wrongTmplUrl, id: '' }
          },
          elements: []
        }
      ]
    };

    const audit = auditVerificationMatrix(gt, render, tpl);
    const defects = audit.defects.filter(d => d.nodeSid === 'c_wrong_tmpl' && d.rule === 'RULE-SURFACE-01');

    assert.strictEqual(defects.length, 3, `Expected 3 defects (1 per viewport), got ${defects.length}`);
    for (const d of defects) {
      assert.strictEqual(d.severity, 'HIGH');
      assert.strictEqual(d.property, 'backgroundImage');
      assert.strictEqual(d.original, gtUrl);
      assert.strictEqual(d.rendered, wrongTmplUrl);
      assert(d.message.includes('template URL mismatch') || d.message.includes('template settings invalid'));
    }
    console.log('    • ACTUAL Defect Record for Wrong Template URL:');
    console.log(JSON.stringify(defects[0], null, 2));
  });

  runTest('11.2. Wrong rendered URL triggers HIGH RULE-SURFACE-01 defect', () => {
    const gtUrl = 'https://example.com/gt-hero.jpg';
    const tamperedUrl = 'https://example.com/tampered-render.jpg';
    const gt = make3VpGtSnapshot({
      sid: 'c_wrong_rn',
      bgImage: `url("${gtUrl}")`,
      bgColor: 'rgb(15, 23, 42)'
    });
    const render = make3VpRenderSnapshot({
      sid: 'c_wrong_rn',
      bgImage: `url("${tamperedUrl}")`,
      bgColor: 'rgb(15, 23, 42)'
    });
    const tpl = {
      content: [
        {
          _sid: 'c_wrong_rn',
          id: 'w_wrong_rn',
          elType: 'container',
          settings: {
            background_background: 'classic',
            background_image: { url: gtUrl, id: '' }
          },
          elements: []
        }
      ]
    };

    const audit = auditVerificationMatrix(gt, render, tpl);
    const defects = audit.defects.filter(d => d.nodeSid === 'c_wrong_rn' && d.rule === 'RULE-SURFACE-01');

    assert.strictEqual(defects.length, 3, `Expected 3 defects (1 per viewport), got ${defects.length}`);
    for (const d of defects) {
      assert.strictEqual(d.severity, 'HIGH');
      assert.strictEqual(d.property, 'backgroundImage');
      assert.strictEqual(d.original, gtUrl);
      assert.strictEqual(d.rendered, tamperedUrl);
      assert(d.message.includes('rendered background image URL mismatch'));
    }
    console.log('    • ACTUAL Defect Record for Wrong Rendered URL:');
    console.log(JSON.stringify(defects[0], null, 2));
  });

  runTest('11.3. Missing rendered image triggers HIGH RULE-SURFACE-01 defect', () => {
    const gtUrl = 'https://example.com/gt-hero.jpg';
    const gt = make3VpGtSnapshot({
      sid: 'c_missing_rn_img',
      bgImage: `url("${gtUrl}")`,
      bgColor: 'rgb(15, 23, 42)'
    });
    const render = make3VpRenderSnapshot({
      sid: 'c_missing_rn_img',
      bgImage: 'none',
      bgColor: 'rgb(15, 23, 42)'
    });
    const tpl = {
      content: [
        {
          _sid: 'c_missing_rn_img',
          id: 'w_missing_rn_img',
          elType: 'container',
          settings: {
            background_background: 'classic',
            background_image: { url: gtUrl, id: '' }
          },
          elements: []
        }
      ]
    };

    const audit = auditVerificationMatrix(gt, render, tpl);
    const defects = audit.defects.filter(d => d.nodeSid === 'c_missing_rn_img' && d.rule === 'RULE-SURFACE-01');

    assert.strictEqual(defects.length, 3, `Expected 3 defects (1 per viewport), got ${defects.length}`);
    for (const d of defects) {
      assert.strictEqual(d.severity, 'HIGH');
      assert.strictEqual(d.property, 'backgroundImage');
      assert(d.message.includes('missing backgroundImage'));
    }
  });

  runTest('11.4. Alpha base-color mismatch triggers HIGH RULE-SURFACE-01 defect on backgroundColor', () => {
    const gtUrl = 'https://example.com/gt-hero.jpg';
    const gtColor = 'rgba(15, 23, 42, 0.5)';
    const wrongColor = 'rgba(15, 23, 42, 0.9)';
    const gt = make3VpGtSnapshot({
      sid: 'c_alpha_mismatch',
      bgImage: `url("${gtUrl}")`,
      bgColor: gtColor
    });
    const render = make3VpRenderSnapshot({
      sid: 'c_alpha_mismatch',
      bgImage: `url("${gtUrl}")`,
      bgColor: wrongColor
    });
    const tpl = {
      content: [
        {
          _sid: 'c_alpha_mismatch',
          id: 'w_alpha_mismatch',
          elType: 'container',
          settings: {
            background_background: 'classic',
            background_image: { url: gtUrl, id: '' }
          },
          elements: []
        }
      ]
    };

    const audit = auditVerificationMatrix(gt, render, tpl);
    const defects = audit.defects.filter(d => d.nodeSid === 'c_alpha_mismatch' && d.rule === 'RULE-SURFACE-01');

    assert.strictEqual(defects.length, 3, `Expected 3 defects (1 per viewport), got ${defects.length}`);
    for (const d of defects) {
      assert.strictEqual(d.severity, 'HIGH');
      assert.strictEqual(d.property, 'backgroundColor');
      assert.strictEqual(d.original, gtColor);
      assert.strictEqual(d.rendered, wrongColor);
      assert(d.message.includes('background color mismatch') || d.message.includes('Container alpha mismatch'));
    }
    console.log('    • ACTUAL Defect Record for Base Color Alpha Mismatch:');
    console.log(JSON.stringify(defects[0], null, 2));
  });

  runTest('11.5. Positive: Quoted URL containing "gradient", comma, and ")" verifies with 0 RULE-SURFACE-01 defects', () => {
    const complexUrl = 'https://example.com/assets/gradient,special(v2).png';
    const gtColor = 'rgb(10, 20, 30)';
    const gt = make3VpGtSnapshot({
      sid: 'c_complex_url',
      bgImage: `url("${complexUrl}")`,
      bgColor: gtColor
    });
    // Test double quotes
    const renderDouble = make3VpRenderSnapshot({
      sid: 'c_complex_url',
      bgImage: `url("${complexUrl}")`,
      bgColor: gtColor
    });
    const tpl = {
      content: [
        {
          _sid: 'c_complex_url',
          id: 'w_complex_url',
          elType: 'container',
          settings: {
            background_background: 'classic',
            background_image: { url: complexUrl, id: '' }
          },
          elements: []
        }
      ]
    };

    const audit1 = auditVerificationMatrix(gt, renderDouble, tpl);
    const defects1 = audit1.defects.filter(d => d.nodeSid === 'c_complex_url' && d.rule === 'RULE-SURFACE-01');
    assert.strictEqual(defects1.length, 0, `Expected 0 defects for double-quoted complex URL, got ${defects1.length}`);

    // Test single quotes in render computed style
    const renderSingle = make3VpRenderSnapshot({
      sid: 'c_complex_url',
      bgImage: `url('${complexUrl}')`,
      bgColor: gtColor
    });
    const audit2 = auditVerificationMatrix(gt, renderSingle, tpl);
    const defects2 = audit2.defects.filter(d => d.nodeSid === 'c_complex_url' && d.rule === 'RULE-SURFACE-01');
    assert.strictEqual(defects2.length, 0, `Expected 0 defects for single-quoted complex URL, got ${defects2.length}`);
  });

  runTest('11.6. Multilayer backgrounds remain HIGH RULE-SURFACE-01 defect', () => {
    const multiLayer = 'url("https://example.com/layer1.png"), url("https://example.com/layer2.png")';
    const gt = make3VpGtSnapshot({
      sid: 'c_multi_remain',
      bgImage: multiLayer,
      bgColor: 'transparent'
    });
    const render = make3VpRenderSnapshot({
      sid: 'c_multi_remain',
      bgImage: multiLayer,
      bgColor: 'transparent'
    });
    const tpl = {
      content: [
        {
          _sid: 'c_multi_remain',
          id: 'w_multi_remain',
          elType: 'container',
          settings: {
            background_background: 'classic'
          },
          elements: []
        }
      ]
    };

    const audit = auditVerificationMatrix(gt, render, tpl);
    const defects = audit.defects.filter(d => d.nodeSid === 'c_multi_remain' && d.rule === 'RULE-SURFACE-01');

    assert.strictEqual(defects.length, 3, `Expected 3 defects, got ${defects.length}`);
    for (const d of defects) {
      assert.strictEqual(d.severity, 'HIGH');
      assert.strictEqual(d.property, 'backgroundImage');
      assert(d.message.includes('Unverified surface'));
    }
    console.log('    • ACTUAL Defect Record for Unsupported Multilayer:');
    console.log(JSON.stringify(defects[0], null, 2));
  });

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log(`ALL ${passedTests}/${totalTests} TESTS PASSED CLEANLY (100%)`);
  console.log('========================================================================');
})();

/**
 * Block 8.2 — Phase 4: Native Page Canvas Mapping Test Suite (Updated with Part 2 Invariants).
 *
 * Verifies:
 * 1. Opaque dark body (e.g. rgb(15, 23, 42)) -> exact page_settings.background_color.
 * 2. Transparent body + opaque html (e.g. rgb(30, 41, 59)) -> html color.
 * 3. Both transparent -> zero invented page color, page_settings without background.
 * 4. Root section with different background -> page background and section background remain independent.
 * 5. Multiple root sections -> compiles identically with solid and transparent canvas; tree shape, IDs, SIDs, and widget counts match.
 * 6. Gradient/image, alpha layering, incomplete capture, and responsive canvas differences -> explicit unsupported/invalid status, zero guessed color.
 * 7. Negative checks: missing viewport, missing image/opacity fields, invalid opacity, alpha 0.999 semi-transparent, and equivalent color strings.
 * 8. Virtual preview reads page setting, not first section background.
 * 9. Legacy compilation path without GT snapshot remains unchanged.
 */

'use strict';

const assert = require('assert');
const {
  parseCssColor,
  hasImageOrGradient,
  resolveViewportCanvas,
  resolvePageCanvas,
  REQUIRED_VIEWPORTS
} = require('../src/smart/page-canvas-resolver');
const { compileHtmlToElementor } = require('../src/engine');
const { renderElementorToHtml } = require('../src/emulator/elementor-virtual-renderer');
const { captureGroundTruth } = require('../src/smart/style-snapshot');
const { captureRenderSnapshot } = require('../src/smart/render-snapshot');
const { auditVerificationMatrix } = require('../src/smart/verification-matrix');

(async () => {
  console.log('========================================================================');
  console.log('BLOCK 8.2 — PHASE 4: NATIVE PAGE CANVAS MAPPING');
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

  function make3VpCanvas(canvasConfig) {
    return {
      desktop: {
        html: Object.assign({ backgroundColor: 'transparent', backgroundImage: 'none', opacity: '1' }, canvasConfig.html || {}),
        body: Object.assign({ backgroundColor: 'transparent', backgroundImage: 'none', opacity: '1' }, canvasConfig.body || {})
      },
      tablet: {
        html: Object.assign({ backgroundColor: 'transparent', backgroundImage: 'none', opacity: '1' }, canvasConfig.html || {}),
        body: Object.assign({ backgroundColor: 'transparent', backgroundImage: 'none', opacity: '1' }, canvasConfig.body || {})
      },
      mobile: {
        html: Object.assign({ backgroundColor: 'transparent', backgroundImage: 'none', opacity: '1' }, canvasConfig.html || {}),
        body: Object.assign({ backgroundColor: 'transparent', backgroundImage: 'none', opacity: '1' }, canvasConfig.body || {})
      }
    };
  }

  function make3VpSnapshot(syntheticHtml, canvasPerVp, flatNodes = {}, styleDictionary = {}) {
    const normalizedDict = {};
    for (const [ref, dict] of Object.entries(styleDictionary || {})) {
      normalizedDict[ref] = Object.assign({ 'background-image': 'none' }, dict);
    }
    const viewports = {};
    for (const vp of REQUIRED_VIEWPORTS) {
      viewports[vp] = {
        canvas: canvasPerVp[vp] || canvasPerVp,
        flat: flatNodes,
        styleDictionary: normalizedDict
      };
    }
    return {
      annotatedHtml: syntheticHtml,
      fonts: [],
      viewports
    };
  }

  // ---------------------------------------------------------------------------
  // Case 1: Opaque dark body -> exact page_settings.background_color
  // ---------------------------------------------------------------------------
  console.log('▶ [CASE 1] Opaque Dark Body Canvas Resolution & Compilation');

  runTest('Case 1.1: resolvePageCanvas extracts exact body background color when body is solid opaque', () => {
    const canvas = make3VpCanvas({
      body: { backgroundColor: 'rgb(15, 23, 42)', backgroundImage: 'none', opacity: '1' }
    });
    const snapshot = { viewports: { desktop: { canvas: canvas.desktop }, tablet: { canvas: canvas.tablet }, mobile: { canvas: canvas.mobile } } };

    const res = resolvePageCanvas(snapshot);
    assert.strictEqual(res.status, 'SOLID_COLOR');
    assert.strictEqual(res.color, 'rgb(15, 23, 42)');
  });

  await runAsyncTest('Case 1.2: compileHtmlToElementor sets page_settings.background_color across 3 viewports', async () => {
    const syntheticHtml = `<!DOCTYPE html>
<html>
<head><style>body { background-color: rgb(15, 23, 42); margin: 0; }</style></head>
<body>
  <div id="c1" data-sid="sid-c1"><h1>Test Heading</h1></div>
</body>
</html>`;

    const canvas = make3VpCanvas({
      body: { backgroundColor: 'rgb(15, 23, 42)', backgroundImage: 'none', opacity: '1' }
    });
    const snapshot = make3VpSnapshot(syntheticHtml, canvas, {
      'sid-c1': {
        sid: 'sid-c1',
        id: 'c1',
        tagName: 'div',
        role: 'container',
        rect: { x: 0, y: 0, w: 800, h: 100 },
        styles: { display: 'block' },
        computedStyleRef: 'ref-c1'
      }
    }, {
      'ref-c1': {
        'background-color': 'rgba(0, 0, 0, 0)',
        'border-top-left-radius': '0px',
        'border-top-right-radius': '0px',
        'border-bottom-right-radius': '0px',
        'border-bottom-left-radius': '0px'
      }
    });

    const result = await compileHtmlToElementor(syntheticHtml, {
      captureGroundTruth: async () => snapshot,
      offline: true,
      useAi: false,
      inspect: false,
      probeBehavior: false,
      behaviorTraces: []
    });

    assert(result?.templateJson, 'Template JSON must be created');
    assert(result.templateJson.page_settings, 'templateJson.page_settings must exist');
    assert.strictEqual(result.templateJson.page_settings.background_background, 'classic');
    assert.strictEqual(result.templateJson.page_settings.background_color, 'rgb(15, 23, 42)');
    assert.strictEqual(result.canvasReport.status, 'SOLID_COLOR');
    assert.strictEqual(result.canvasReport.color, 'rgb(15, 23, 42)');
    assert.strictEqual(result.meta.canvas.status, 'SOLID_COLOR');
  });

  // ---------------------------------------------------------------------------
  // Case 2: Transparent body + opaque html -> html color
  // ---------------------------------------------------------------------------
  console.log('\n▶ [CASE 2] Transparent Body + Opaque HTML Canvas');

  runTest('Case 2.1: resolvePageCanvas uses HTML color when body is transparent and HTML is solid opaque', () => {
    const canvas = make3VpCanvas({
      html: { backgroundColor: 'rgb(30, 41, 59)', backgroundImage: 'none', opacity: '1' },
      body: { backgroundColor: 'rgba(0, 0, 0, 0)', backgroundImage: 'none', opacity: '1' }
    });
    const snapshot = { viewports: { desktop: { canvas: canvas.desktop }, tablet: { canvas: canvas.tablet }, mobile: { canvas: canvas.mobile } } };

    const res = resolvePageCanvas(snapshot);
    assert.strictEqual(res.status, 'SOLID_COLOR');
    assert.strictEqual(res.color, 'rgb(30, 41, 59)');
  });

  await runAsyncTest('Case 2.2: compileHtmlToElementor sets page_settings.background_color from opaque HTML across 3 viewports', async () => {
    const syntheticHtml = `<!DOCTYPE html>
<html>
<head><style>html { background-color: rgb(30, 41, 59); } body { background-color: transparent; margin: 0; }</style></head>
<body>
  <div id="c2" data-sid="sid-c2"><p>Hello World</p></div>
</body>
</html>`;

    const canvas = make3VpCanvas({
      html: { backgroundColor: 'rgb(30, 41, 59)', backgroundImage: 'none', opacity: '1' },
      body: { backgroundColor: 'transparent', backgroundImage: 'none', opacity: '1' }
    });
    const snapshot = make3VpSnapshot(syntheticHtml, canvas, {
      'sid-c2': {
        sid: 'sid-c2',
        id: 'c2',
        tagName: 'div',
        role: 'container',
        rect: { x: 0, y: 0, w: 800, h: 100 },
        styles: { display: 'block' },
        computedStyleRef: 'ref-c2'
      }
    }, {
      'ref-c2': {
        'background-color': 'rgba(0, 0, 0, 0)',
        'border-top-left-radius': '0px',
        'border-top-right-radius': '0px',
        'border-bottom-right-radius': '0px',
        'border-bottom-left-radius': '0px'
      }
    });

    const result = await compileHtmlToElementor(syntheticHtml, {
      captureGroundTruth: async () => snapshot,
      offline: true,
      useAi: false,
      inspect: false,
      probeBehavior: false,
      behaviorTraces: []
    });

    assert(result?.templateJson?.page_settings, 'page_settings must exist');
    assert.strictEqual(result.templateJson.page_settings.background_background, 'classic');
    assert.strictEqual(result.templateJson.page_settings.background_color, 'rgb(30, 41, 59)');
    assert.strictEqual(result.canvasReport.color, 'rgb(30, 41, 59)');
  });

  // ---------------------------------------------------------------------------
  // Case 3: Both transparent -> zero invented page color
  // ---------------------------------------------------------------------------
  console.log('\n▶ [CASE 3] Transparent Default Canvas (No Invented Color)');

  runTest('Case 3.1: resolvePageCanvas returns TRANSPARENT_DEFAULT when both html and body are transparent', () => {
    const canvas = make3VpCanvas({
      html: { backgroundColor: 'transparent', backgroundImage: 'none', opacity: '1' },
      body: { backgroundColor: 'rgba(0, 0, 0, 0)', backgroundImage: 'none', opacity: '1' }
    });
    const snapshot = { viewports: { desktop: { canvas: canvas.desktop }, tablet: { canvas: canvas.tablet }, mobile: { canvas: canvas.mobile } } };

    const res = resolvePageCanvas(snapshot);
    assert.strictEqual(res.status, 'TRANSPARENT_DEFAULT');
    assert.strictEqual(res.color, null);
  });

  await runAsyncTest('Case 3.2: compileHtmlToElementor leaves page_settings without background setting when canvas is transparent', async () => {
    const syntheticHtml = `<!DOCTYPE html><html><body><div id="c3" data-sid="sid-c3"><span>Transparent page</span></div></body></html>`;

    const canvas = make3VpCanvas({
      html: { backgroundColor: 'transparent', backgroundImage: 'none', opacity: '1' },
      body: { backgroundColor: 'transparent', backgroundImage: 'none', opacity: '1' }
    });
    const snapshot = make3VpSnapshot(syntheticHtml, canvas, {
      'sid-c3': {
        sid: 'sid-c3',
        id: 'c3',
        tagName: 'div',
        role: 'container',
        rect: { x: 0, y: 0, w: 800, h: 100 },
        styles: { display: 'block' },
        computedStyleRef: 'ref-c3'
      }
    }, {
      'ref-c3': {
        'background-color': 'rgba(0, 0, 0, 0)',
        'border-top-left-radius': '0px',
        'border-top-right-radius': '0px',
        'border-bottom-right-radius': '0px',
        'border-bottom-left-radius': '0px'
      }
    });

    const result = await compileHtmlToElementor(syntheticHtml, {
      captureGroundTruth: async () => snapshot,
      offline: true,
      useAi: false,
      inspect: false,
      probeBehavior: false,
      behaviorTraces: []
    });

    assert(result?.templateJson, 'templateJson must exist');
    assert.strictEqual(result.canvasReport.status, 'TRANSPARENT_DEFAULT');
    assert.strictEqual(result.canvasReport.color, null);
    if (result.templateJson.page_settings) {
      assert.strictEqual(result.templateJson.page_settings.background_color, undefined);
    }
  });

  // ---------------------------------------------------------------------------
  // Case 4: Root section with different background remains independent
  // ---------------------------------------------------------------------------
  console.log('\n▶ [CASE 4] Independent Root Section Background vs Page Background');

  await runAsyncTest('Case 4: Page background and root section background do not leak into or overwrite each other', async () => {
    const syntheticHtml = `<!DOCTYPE html>
<html>
<head><style>body { background-color: rgb(15, 23, 42); margin: 0; } #sec-hero { background-color: rgb(220, 38, 38); }</style></head>
<body>
  <section id="sec-hero" data-sid="sid-hero"><h1>Hero Title</h1></section>
</body>
</html>`;

    const canvas = make3VpCanvas({
      body: { backgroundColor: 'rgb(15, 23, 42)', backgroundImage: 'none', opacity: '1' }
    });
    const snapshot = make3VpSnapshot(syntheticHtml, canvas, {
      'sid-hero': {
        sid: 'sid-hero',
        id: 'sec-hero',
        tagName: 'section',
        role: 'container',
        rect: { x: 0, y: 0, w: 800, h: 200 },
        styles: {
          display: 'block',
          backgroundColor: 'rgb(220, 38, 38)'
        },
        computedStyleRef: 'ref-hero'
      }
    }, {
      'ref-hero': {
        'background-color': 'rgb(220, 38, 38)',
        'border-top-left-radius': '0px',
        'border-top-right-radius': '0px',
        'border-bottom-right-radius': '0px',
        'border-bottom-left-radius': '0px'
      }
    });

    const result = await compileHtmlToElementor(syntheticHtml, {
      captureGroundTruth: async () => snapshot,
      offline: true,
      useAi: false,
      inspect: false,
      probeBehavior: false,
      behaviorTraces: []
    });

    // Page settings has body color
    assert.strictEqual(result.templateJson.page_settings?.background_color, 'rgb(15, 23, 42)');

    // Root section container has its own background color
    const rootContainer = result.templateJson.content.find(e => e.settings?._element_id === 'sec-hero' || e.settings?._sid === 'sid-hero');
    assert(rootContainer, 'Root section container must exist in content');
    assert.strictEqual(rootContainer.settings.background_color, 'rgb(220, 38, 38)');
    assert.notStrictEqual(rootContainer.settings.background_color, result.templateJson.page_settings.background_color);
  });

  // ---------------------------------------------------------------------------
  // Case 5: Multiple root sections -> compiles identically with solid & transparent canvas
  // ---------------------------------------------------------------------------
  console.log('\n▶ [CASE 5] Multiple Root Sections Parity Comparison');

  await runAsyncTest('Case 5: Multiple top-level siblings compile with identical structure, IDs, SIDs, and widget counts', async () => {
    const syntheticHtml = `<!DOCTYPE html>
<html>
<head><style>header { height: 60px; } footer { height: 80px; }</style></head>
<body>
  <header id="hdr-root" data-sid="sid-hdr"><p>Header</p></header>
  <footer id="ftr-root" data-sid="sid-ftr"><p>Footer</p></footer>
</body>
</html>`;

    const flatNodes = {
      'sid-hdr': { sid: 'sid-hdr', id: 'hdr-root', tagName: 'header', role: 'container', rect: { x: 0, y: 0, w: 800, h: 60 }, styles: { display: 'block' }, computedStyleRef: 'ref-hdr' },
      'sid-ftr': { sid: 'sid-ftr', id: 'ftr-root', tagName: 'footer', role: 'container', rect: { x: 0, y: 60, w: 800, h: 80 }, styles: { display: 'block' }, computedStyleRef: 'ref-ftr' }
    };
    const styleDictionary = {
      'ref-hdr': { 'background-color': 'rgba(0, 0, 0, 0)', 'border-top-left-radius': '0px', 'border-top-right-radius': '0px', 'border-bottom-right-radius': '0px', 'border-bottom-left-radius': '0px' },
      'ref-ftr': { 'background-color': 'rgba(0, 0, 0, 0)', 'border-top-left-radius': '0px', 'border-top-right-radius': '0px', 'border-bottom-right-radius': '0px', 'border-bottom-left-radius': '0px' }
    };

    const solidCanvas = make3VpCanvas({
      body: { backgroundColor: 'rgb(15, 23, 42)', backgroundImage: 'none', opacity: '1' }
    });
    const transparentCanvas = make3VpCanvas({
      body: { backgroundColor: 'transparent', backgroundImage: 'none', opacity: '1' }
    });

    const solidSnapshot = make3VpSnapshot(syntheticHtml, solidCanvas, flatNodes, styleDictionary);
    const transparentSnapshot = make3VpSnapshot(syntheticHtml, transparentCanvas, flatNodes, styleDictionary);

    const resultSolid = await compileHtmlToElementor(syntheticHtml, {
      captureGroundTruth: async () => solidSnapshot,
      offline: true,
      useAi: false,
      inspect: false,
      probeBehavior: false,
      behaviorTraces: []
    });

    const resultTransparent = await compileHtmlToElementor(syntheticHtml, {
      captureGroundTruth: async () => transparentSnapshot,
      offline: true,
      useAi: false,
      inspect: false,
      probeBehavior: false,
      behaviorTraces: []
    });

    // Helper to extract structural topology (tags, SIDs, IDs, element count)
    function extractTopology(elements = []) {
      return elements.map(el => ({
        elType: el.elType,
        widgetType: el.widgetType || null,
        sid: el.settings?._sid || null,
        id: el.settings?._element_id || null,
        children: extractTopology(el.elements || [])
      }));
    }

    const topoSolid = extractTopology(resultSolid.templateJson.content);
    const topoTransparent = extractTopology(resultTransparent.templateJson.content);

    // Exact structural parity between solid and transparent compilation:
    // Page canvas setting does NOT alter templateJson.content hierarchy or inject extra wrappers!
    assert.deepStrictEqual(topoSolid, topoTransparent, 'Content tree topology must be 100% identical between solid and transparent canvas');

    // Page settings: solid has background, transparent does not
    assert.strictEqual(resultSolid.templateJson.page_settings?.background_color, 'rgb(15, 23, 42)');
    assert.strictEqual(resultTransparent.templateJson.page_settings?.background_color, undefined);
  });

  // ---------------------------------------------------------------------------
  // Case 6: Gradients, alpha layering, invalid capture, responsive differences
  // ---------------------------------------------------------------------------
  console.log('\n▶ [CASE 6] Unsupported Layering, Responsive Differences, and Invalid Captures');

  runTest('Case 6.1: Body gradient -> UNSUPPORTED_LAYERED', () => {
    const canvas = make3VpCanvas({
      body: { backgroundColor: 'rgb(0, 0, 0)', backgroundImage: 'linear-gradient(to right, #000, #fff)', opacity: '1' }
    });
    const snapshot = { viewports: { desktop: { canvas: canvas.desktop }, tablet: { canvas: canvas.tablet }, mobile: { canvas: canvas.mobile } } };
    const res = resolvePageCanvas(snapshot);
    assert.strictEqual(res.status, 'UNSUPPORTED_LAYERED');
    assert.strictEqual(res.color, null);
    assert(res.reason.includes('gradient') || res.reason.includes('image'));
  });

  runTest('Case 6.2: Body semi-transparent background -> UNSUPPORTED_LAYERED', () => {
    const canvas = make3VpCanvas({
      body: { backgroundColor: 'rgba(15, 23, 42, 0.65)', backgroundImage: 'none', opacity: '1' }
    });
    const snapshot = { viewports: { desktop: { canvas: canvas.desktop }, tablet: { canvas: canvas.tablet }, mobile: { canvas: canvas.mobile } } };
    const res = resolvePageCanvas(snapshot);
    assert.strictEqual(res.status, 'UNSUPPORTED_LAYERED');
    assert.strictEqual(res.color, null);
    assert(res.reason.includes('semi-transparent') || res.reason.includes('alpha'));
  });

  runTest('Case 6.3: Body opacity < 1 -> UNSUPPORTED_LAYERED', () => {
    const canvas = make3VpCanvas({
      body: { backgroundColor: 'rgb(15, 23, 42)', backgroundImage: 'none', opacity: '0.85' }
    });
    const snapshot = { viewports: { desktop: { canvas: canvas.desktop }, tablet: { canvas: canvas.tablet }, mobile: { canvas: canvas.mobile } } };
    const res = resolvePageCanvas(snapshot);
    assert.strictEqual(res.status, 'UNSUPPORTED_LAYERED');
    assert.strictEqual(res.color, null);
    assert(res.reason.includes('opacity'));
  });

  runTest('Case 6.4: Incomplete/missing canvas data -> INVALID_CAPTURE', () => {
    const res1 = resolvePageCanvas(null);
    assert.strictEqual(res1.status, 'INVALID_CAPTURE');

    const res2 = resolvePageCanvas({ viewports: {} });
    assert.strictEqual(res2.status, 'INVALID_CAPTURE');

    const res3 = resolvePageCanvas({
      viewports: {
        desktop: { canvas: { html: null, body: null } },
        tablet: { canvas: { html: null, body: null } },
        mobile: { canvas: { html: null, body: null } }
      }
    });
    assert.strictEqual(res3.status, 'INVALID_CAPTURE');
  });

  runTest('Case 6.5: Responsive differences across viewports -> RESPONSIVE_CANVAS_UNSUPPORTED', () => {
    const snapshot = {
      viewports: {
        desktop: {
          canvas: {
            html: { backgroundColor: 'transparent', backgroundImage: 'none', opacity: '1' },
            body: { backgroundColor: 'rgb(15, 23, 42)', backgroundImage: 'none', opacity: '1' }
          }
        },
        tablet: {
          canvas: {
            html: { backgroundColor: 'transparent', backgroundImage: 'none', opacity: '1' },
            body: { backgroundColor: 'rgb(15, 23, 42)', backgroundImage: 'none', opacity: '1' }
          }
        },
        mobile: {
          canvas: {
            html: { backgroundColor: 'transparent', backgroundImage: 'none', opacity: '1' },
            body: { backgroundColor: 'rgb(255, 255, 255)', backgroundImage: 'none', opacity: '1' }
          }
        }
      }
    };
    const res = resolvePageCanvas(snapshot);
    assert.strictEqual(res.status, 'RESPONSIVE_CANVAS_UNSUPPORTED');
    assert.strictEqual(res.color, null);
  });

  await runAsyncTest('Case 6.6: Unsupported/invalid canvas emits zero guessed color in page_settings', async () => {
    const syntheticHtml = `<!DOCTYPE html><html><body><div id="c6" data-sid="sid-c6"><span>Unsupported canvas</span></div></body></html>`;

    const canvas = make3VpCanvas({
      body: { backgroundColor: 'rgb(15, 23, 42)', backgroundImage: 'linear-gradient(#000, #fff)', opacity: '1' }
    });
    const snapshot = make3VpSnapshot(syntheticHtml, canvas, {
      'sid-c6': { sid: 'sid-c6', id: 'c6', tagName: 'div', role: 'container', rect: { x: 0, y: 0, w: 800, h: 100 }, styles: { display: 'block' }, computedStyleRef: 'ref-c6' }
    }, {
      'ref-c6': { 'background-color': 'rgba(0, 0, 0, 0)', 'border-top-left-radius': '0px', 'border-top-right-radius': '0px', 'border-bottom-right-radius': '0px', 'border-bottom-left-radius': '0px' }
    });

    const result = await compileHtmlToElementor(syntheticHtml, {
      captureGroundTruth: async () => snapshot,
      offline: true,
      useAi: false,
      inspect: false,
      probeBehavior: false,
      behaviorTraces: []
    });

    assert.strictEqual(result.canvasReport.status, 'UNSUPPORTED_LAYERED');
    assert.strictEqual(result.canvasReport.color, null);
    assert.strictEqual(result.meta.canvas.status, 'UNSUPPORTED_LAYERED');
    if (result.templateJson.page_settings) {
      assert.strictEqual(result.templateJson.page_settings.background_color, undefined);
    }
  });

  // ---------------------------------------------------------------------------
  // Case 7: Strict Invariants & Negative Tests (Part 2 Closure)
  // ---------------------------------------------------------------------------
  console.log('\n▶ [CASE 7] Part 2 Strict Negative Invariants');

  runTest('Case 7.1: Missing required viewport (desktop only) returns INVALID_CAPTURE', () => {
    const desktopOnlySnapshot = {
      viewports: {
        desktop: {
          canvas: {
            html: { backgroundColor: 'transparent', backgroundImage: 'none', opacity: '1' },
            body: { backgroundColor: 'rgb(15, 23, 42)', backgroundImage: 'none', opacity: '1' }
          }
        }
      }
    };
    const res = resolvePageCanvas(desktopOnlySnapshot);
    assert.strictEqual(res.status, 'INVALID_CAPTURE');
    assert(res.reason.includes('Missing required viewport'));
  });

  runTest('Case 7.2: Missing image or opacity fields returns INVALID_CAPTURE', () => {
    const missingImgSnapshot = {
      viewports: {
        desktop: {
          canvas: {
            html: { backgroundColor: 'transparent', opacity: '1' }, // missing backgroundImage
            body: { backgroundColor: 'rgb(15, 23, 42)', backgroundImage: 'none', opacity: '1' }
          }
        },
        tablet: {
          canvas: {
            html: { backgroundColor: 'transparent', backgroundImage: 'none', opacity: '1' },
            body: { backgroundColor: 'rgb(15, 23, 42)', backgroundImage: 'none', opacity: '1' }
          }
        },
        mobile: {
          canvas: {
            html: { backgroundColor: 'transparent', backgroundImage: 'none', opacity: '1' },
            body: { backgroundColor: 'rgb(15, 23, 42)', backgroundImage: 'none', opacity: '1' }
          }
        }
      }
    };
    const res1 = resolvePageCanvas(missingImgSnapshot);
    assert.strictEqual(res1.status, 'INVALID_CAPTURE');

    const missingOpSnapshot = {
      viewports: {
        desktop: {
          canvas: {
            html: { backgroundColor: 'transparent', backgroundImage: 'none', opacity: '1' },
            body: { backgroundColor: 'rgb(15, 23, 42)', backgroundImage: 'none' } // missing opacity
          }
        },
        tablet: {
          canvas: {
            html: { backgroundColor: 'transparent', backgroundImage: 'none', opacity: '1' },
            body: { backgroundColor: 'rgb(15, 23, 42)', backgroundImage: 'none', opacity: '1' }
          }
        },
        mobile: {
          canvas: {
            html: { backgroundColor: 'transparent', backgroundImage: 'none', opacity: '1' },
            body: { backgroundColor: 'rgb(15, 23, 42)', backgroundImage: 'none', opacity: '1' }
          }
        }
      }
    };
    const res2 = resolvePageCanvas(missingOpSnapshot);
    assert.strictEqual(res2.status, 'INVALID_CAPTURE');
  });

  runTest('Case 7.3: Out-of-bounds or NaN opacity returns INVALID_CAPTURE', () => {
    const invalidOpSnapshot1 = {
      viewports: {
        desktop: {
          canvas: {
            html: { backgroundColor: 'transparent', backgroundImage: 'none', opacity: '1' },
            body: { backgroundColor: 'rgb(15, 23, 42)', backgroundImage: 'none', opacity: '1.5' } // > 1
          }
        },
        tablet: {
          canvas: {
            html: { backgroundColor: 'transparent', backgroundImage: 'none', opacity: '1' },
            body: { backgroundColor: 'rgb(15, 23, 42)', backgroundImage: 'none', opacity: '1' }
          }
        },
        mobile: {
          canvas: {
            html: { backgroundColor: 'transparent', backgroundImage: 'none', opacity: '1' },
            body: { backgroundColor: 'rgb(15, 23, 42)', backgroundImage: 'none', opacity: '1' }
          }
        }
      }
    };
    const res1 = resolvePageCanvas(invalidOpSnapshot1);
    assert.strictEqual(res1.status, 'INVALID_CAPTURE');

    const invalidOpSnapshot2 = {
      viewports: {
        desktop: {
          canvas: {
            html: { backgroundColor: 'transparent', backgroundImage: 'none', opacity: 'not-a-number' },
            body: { backgroundColor: 'rgb(15, 23, 42)', backgroundImage: 'none', opacity: '1' }
          }
        },
        tablet: {
          canvas: {
            html: { backgroundColor: 'transparent', backgroundImage: 'none', opacity: '1' },
            body: { backgroundColor: 'rgb(15, 23, 42)', backgroundImage: 'none', opacity: '1' }
          }
        },
        mobile: {
          canvas: {
            html: { backgroundColor: 'transparent', backgroundImage: 'none', opacity: '1' },
            body: { backgroundColor: 'rgb(15, 23, 42)', backgroundImage: 'none', opacity: '1' }
          }
        }
      }
    };
    const res2 = resolvePageCanvas(invalidOpSnapshot2);
    assert.strictEqual(res2.status, 'INVALID_CAPTURE');
  });

  runTest('Case 7.4: Alpha 0.999 is treated as semi-transparent (UNSUPPORTED_LAYERED), not opaque', () => {
    const canvas = make3VpCanvas({
      body: { backgroundColor: 'rgba(15, 23, 42, 0.999)', backgroundImage: 'none', opacity: '1' }
    });
    const snapshot = { viewports: { desktop: { canvas: canvas.desktop }, tablet: { canvas: canvas.tablet }, mobile: { canvas: canvas.mobile } } };
    const res = resolvePageCanvas(snapshot);
    assert.strictEqual(res.status, 'UNSUPPORTED_LAYERED');
    assert(res.reason.includes('semi-transparent') || res.reason.includes('alpha'));
  });

  runTest('Case 7.5: Equivalent color strings across viewports (different spacing) match as SOLID_COLOR', () => {
    const snapshot = {
      viewports: {
        desktop: {
          canvas: {
            html: { backgroundColor: 'transparent', backgroundImage: 'none', opacity: '1' },
            body: { backgroundColor: 'rgb(15,23,42)', backgroundImage: 'none', opacity: '1' }
          }
        },
        tablet: {
          canvas: {
            html: { backgroundColor: 'transparent', backgroundImage: 'none', opacity: '1' },
            body: { backgroundColor: 'rgb(15, 23, 42)', backgroundImage: 'none', opacity: '1' }
          }
        },
        mobile: {
          canvas: {
            html: { backgroundColor: 'transparent', backgroundImage: 'none', opacity: '1' },
            body: { backgroundColor: 'rgb(15,   23,   42)', backgroundImage: 'none', opacity: '1' }
          }
        }
      }
    };
    const res = resolvePageCanvas(snapshot);
    assert.strictEqual(res.status, 'SOLID_COLOR');
  });

  // ---------------------------------------------------------------------------
  // Case 8: Virtual preview reads page setting, not first section background
  // ---------------------------------------------------------------------------
  console.log('\n▶ [CASE 8] Virtual Preview Decoupling from First Section Background');

  runTest('Case 8.1: Virtual preview applies templateData.page_settings.background_color to preview body', () => {
    const templateData = {
      version: '0.4',
      title: 'Preview Test',
      type: 'page',
      page_settings: {
        background_background: 'classic',
        background_color: 'rgb(15, 23, 42)'
      },
      content: [
        {
          id: 'sec1',
          elType: 'container',
          settings: {
            background_color: 'rgb(220, 38, 38)'
          },
          elements: []
        }
      ]
    };

    const previewHtml = renderElementorToHtml(templateData);
    assert(previewHtml.includes('background-color: rgb(15, 23, 42);'), 'Preview body must use page_settings.background_color');
    assert(!previewHtml.includes('body {\n      margin: 0;\n      padding: 0;\n      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;\n      -webkit-font-smoothing: antialiased;\n      -moz-osx-font-smoothing: grayscale;\n      background-color: rgb(220, 38, 38);'), 'Preview body must NOT steal content[0] background_color');
  });

  runTest('Case 8.2: Virtual preview without page_settings background falls back to default, never content[0]', () => {
    const templateData = {
      version: '0.4',
      title: 'Preview Fallback Test',
      type: 'page',
      page_settings: {},
      content: [
        {
          id: 'sec1',
          elType: 'container',
          settings: {
            background_color: 'rgb(220, 38, 38)'
          },
          elements: []
        }
      ]
    };

    const previewHtml = renderElementorToHtml(templateData);
    // Should fallback to #ffffff, NOT steal rgb(220, 38, 38)
    assert(previewHtml.includes('background-color: #ffffff;'), 'Preview body must fall back to #ffffff');
  });

  // ---------------------------------------------------------------------------
  // Case 9: Legacy compilation path without GT snapshot remains unchanged
  // ---------------------------------------------------------------------------
  console.log('\n▶ [CASE 9] Legacy Compilation Path Compatibility');

  await runAsyncTest('Case 9: Legacy compilation without GT produces valid template, null canvasReport, unaffected', async () => {
    const legacyHtml = `<!DOCTYPE html><html><body><div class="legacy-card"><h2>Legacy Title</h2><p>Legacy text</p></div></body></html>`;

    const result = await compileHtmlToElementor(legacyHtml, {
      useGroundTruth: false,
      offline: true,
      useAi: false,
      inspect: false,
      probeBehavior: false,
      behaviorTraces: []
    });

    assert(result?.templateJson, 'Legacy template must compile');
    assert.strictEqual(result.isGroundTruthCompiled, false);
    assert.strictEqual(result.canvasReport, null);
    assert.strictEqual(result.meta.canvas, null);
    assert(Array.isArray(result.templateJson.content), 'Content must be an array');
    assert(result.templateJson.content.length > 0, 'Content must not be empty');
  });

  // ---------------------------------------------------------------------------
  // Case 10: Real Chromium End-to-End Pipeline Verification
  // ---------------------------------------------------------------------------
  console.log('\n▶ [CASE 10] Real Chromium End-to-End Pipeline Verification');

  await runAsyncTest('Case 10: Real Chromium captureGroundTruth -> compileHtmlToElementor -> renderElementorToHtml -> captureRenderSnapshot -> auditVerificationMatrix', async () => {
    const realHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      background-color: rgb(15, 23, 42);
      margin: 0;
      padding: 0;
    }
    .hero-section {
      background-color: rgb(220, 38, 38);
      padding: 40px;
      color: rgb(255, 255, 255);
    }
  </style>
</head>
<body>
  <section class="hero-section" id="hero-sec">
    <h1>Real Chromium Canvas Test</h1>
    <p>Verifying live Chromium capture and rendered canvas parity.</p>
  </section>
</body>
</html>`;

    const gtSnapshot = await captureGroundTruth(realHtml, { cache: false });
    assert(gtSnapshot?.viewports?.desktop?.canvas?.body, 'Real GT must capture canvas.body');
    assert.strictEqual(gtSnapshot.viewports.desktop.canvas.body.backgroundColor, 'rgb(15, 23, 42)');

    const result = await compileHtmlToElementor(realHtml, {
      offline: true,
      useAi: false,
      inspect: false,
      probeBehavior: false,
      behaviorTraces: [],
      captureGroundTruth: async () => gtSnapshot
    });

    assert(result?.templateJson?.page_settings, 'Must produce page_settings');
    assert.strictEqual(result.templateJson.page_settings.background_background, 'classic');
    assert.strictEqual(result.templateJson.page_settings.background_color, 'rgb(15, 23, 42)');

    const previewHtml = renderElementorToHtml(result.templateJson, { fonts: gtSnapshot.fonts });
    assert(previewHtml.includes('background-color: rgb(15, 23, 42);'), 'Preview body must use page_settings color');

    const renderSnapshot = await captureRenderSnapshot(previewHtml);
    assert(renderSnapshot?.viewports?.desktop?.canvas?.body, 'Render snapshot must capture canvas.body');
    assert.strictEqual(renderSnapshot.viewports.desktop.canvas.body.backgroundColor, 'rgb(15, 23, 42)');
    assert.strictEqual(renderSnapshot.viewports.desktop.canvas.body.backgroundImage, 'none');

    const matrixResult = auditVerificationMatrix(gtSnapshot, renderSnapshot, result.templateJson);
    const canvasDefects = matrixResult.defects.filter(d => d.rule === 'RULE-CANVAS-01');
    assert.strictEqual(canvasDefects.length, 0, `Real Chromium pipeline must have 0 RULE-CANVAS-01 defects, got: ${JSON.stringify(canvasDefects)}`);
  });

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log(`ALL ${passedTests}/${totalTests} TESTS PASSED CLEANLY (100%)`);
  console.log('========================================================================');
})();

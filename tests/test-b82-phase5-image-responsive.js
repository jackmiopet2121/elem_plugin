/**
 * Block 8.2 — Phase 5 (Part 3B): Responsive Image Geometry + Audit.
 *
 * Verifies:
 * 1. Ga3 viewports same values -> zero responsive overrides.
 * 2. Desktop cover, tablet contain, mobile cover -> tablet contain AND mobile cover overrides.
 * 3. Tablet position top left, mobile same -> tablet override only (effective inheritance).
 * 4. Repeat override + effective inheritance.
 * 5. Unsupported tablet/mobile calc(...)/custom value -> zero guessed native setting + HIGH audit defect (RULE-SURFACE-02).
 * 6. Missing modern dictionary ref/property -> explicit failure / error, no legacy fallback.
 * 7. Missing rendered geometry field -> HIGH defect (RULE-SURFACE-02).
 * 8. Rendered geometry mismatch -> HIGH defect with correct viewport/property (RULE-SURFACE-02).
 * 9. Real Chromium mini fixture with media queries changing geometry in tablet/mobile:
 *    verify native JSON overrides and rendered computed CSS in 3 viewports.
 */

'use strict';

const assert = require('assert');
const { auditVerificationMatrix } = require('../src/smart/verification-matrix');
const { captureGroundTruth } = require('../src/smart/style-snapshot');
const { parseHtmlToAst } = require('../src/parser/html-parser');
const { compileGroundTruthToElementor } = require('../src/smart/geometry-mapper');
const { mergeNodeResponsive } = require('../src/smart/responsive-merger');
const { compileHtmlToElementor } = require('../src/engine');
const { renderElementorToHtml } = require('../src/emulator/elementor-virtual-renderer');
const { captureRenderSnapshot } = require('../src/smart/render-snapshot');

(async () => {
  console.log('========================================================================');
  console.log('BLOCK 8.2 — PHASE 5 (PART 3B): RESPONSIVE IMAGE GEOMETRY + AUDIT');
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
    sid = 'c_resp',
    bgImage = 'url("https://example.com/banner.jpg")',
    bgColor = 'rgb(15, 23, 42)',
    desktop = { size: 'cover', pos: '50% 50%', repeat: 'no-repeat' },
    tablet = { size: 'cover', pos: '50% 50%', repeat: 'no-repeat' },
    mobile = { size: 'cover', pos: '50% 50%', repeat: 'no-repeat' },
    styleDictDesktop = undefined,
    styleDictTablet = undefined,
    styleDictMobile = undefined
  } = {}) {
    const ref = `ref-${sid}`;

    const makeDict = (geo, overrideDict) => {
      if (overrideDict !== undefined) return overrideDict;
      return {
        [ref]: {
          'background-color': bgColor,
          'background-image': bgImage,
          'background-size': geo.size,
          'background-position': geo.pos,
          'background-repeat': geo.repeat,
          'border-top-left-radius': '0px',
          'border-top-right-radius': '0px',
          'border-bottom-right-radius': '0px',
          'border-bottom-left-radius': '0px'
        }
      };
    };

    const makeNode = (geo) => ({
      sid,
      tag: 'div',
      role: 'container',
      computedStyleRef: ref,
      rect: { x: 0, y: 0, w: 800, h: 400 },
      styles: {
        backgroundColor: bgColor,
        backgroundImage: bgImage,
        backgroundSize: geo.size,
        backgroundPosition: geo.pos,
        backgroundRepeat: geo.repeat
      }
    });

    return {
      annotatedHtml: `<div data-sid="${sid}"></div>`,
      viewports: {
        desktop: {
          flat: { [sid]: makeNode(desktop) },
          styleDictionary: makeDict(desktop, styleDictDesktop),
          canvas: {
            html: { backgroundColor: 'transparent', backgroundImage: 'none' },
            body: { backgroundColor: 'transparent', backgroundImage: 'none' }
          }
        },
        tablet: {
          flat: { [sid]: makeNode(tablet) },
          styleDictionary: makeDict(tablet, styleDictTablet),
          canvas: {
            html: { backgroundColor: 'transparent', backgroundImage: 'none' },
            body: { backgroundColor: 'transparent', backgroundImage: 'none' }
          }
        },
        mobile: {
          flat: { [sid]: makeNode(mobile) },
          styleDictionary: makeDict(mobile, styleDictMobile),
          canvas: {
            html: { backgroundColor: 'transparent', backgroundImage: 'none' },
            body: { backgroundColor: 'transparent', backgroundImage: 'none' }
          }
        }
      }
    };
  }

  function makeRenderSnapshotMatchingGt(gtSnapshot, renderOverrides = {}) {
    const renderSnap = { viewports: {} };
    for (const vp of ['desktop', 'tablet', 'mobile']) {
      const gtVp = gtSnapshot.viewports[vp];
      const flat = {};
      for (const [sid, node] of Object.entries(gtVp.flat)) {
        const dict = gtVp.styleDictionary?.[node.computedStyleRef] || {};
        const overrides = renderOverrides[vp]?.[sid] || {};
        flat[sid] = {
          sid,
          rect: { x: 0, y: 0, w: 800, h: 400 },
          styles: {
            backgroundColor: overrides.backgroundColor !== undefined ? overrides.backgroundColor : dict['background-color'],
            backgroundImage: overrides.backgroundImage !== undefined ? overrides.backgroundImage : dict['background-image'],
            backgroundSize: overrides.backgroundSize !== undefined ? overrides.backgroundSize : dict['background-size'],
            backgroundPosition: overrides.backgroundPosition !== undefined ? overrides.backgroundPosition : dict['background-position'],
            backgroundRepeat: overrides.backgroundRepeat !== undefined ? overrides.backgroundRepeat : dict['background-repeat']
          }
        };
      }
      renderSnap.viewports[vp] = {
        flat,
        canvas: {
          body: {
            backgroundColor: 'transparent',
            backgroundImage: 'none'
          }
        }
      };
    }
    return renderSnap;
  }

  // ---------------------------------------------------------------------------
  // Test 1: All viewports same values -> zero responsive overrides
  // ---------------------------------------------------------------------------
  console.log('▶ [TEST 1] All Viewports Same Values -> Zero Responsive Overrides');

  runTest('1. Uniform geometry across viewports produces zero responsive overrides', () => {
    const gt = make3VpGtSnapshot({
      sid: 'c_same',
      desktop: { size: 'cover', pos: '50% 50%', repeat: 'no-repeat' },
      tablet:  { size: 'cover', pos: '50% 50%', repeat: 'no-repeat' },
      mobile:  { size: 'cover', pos: '50% 50%', repeat: 'no-repeat' }
    });
    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });
    mergeNodeResponsive(elements[0], null, gt);

    const c = elements[0];
    assert.strictEqual(c.settings.background_size, 'cover');
    assert.strictEqual(c.settings.background_position, 'center center');
    assert.strictEqual(c.settings.background_repeat, 'no-repeat');

    // Tablet overrides must be absent
    assert.strictEqual(c.settings.background_size_tablet, undefined);
    assert.strictEqual(c.settings.background_position_tablet, undefined);
    assert.strictEqual(c.settings.background_repeat_tablet, undefined);

    // Mobile overrides must be absent
    assert.strictEqual(c.settings.background_size_mobile, undefined);
    assert.strictEqual(c.settings.background_position_mobile, undefined);
    assert.strictEqual(c.settings.background_repeat_mobile, undefined);

    // Matrix audit has 0 RULE-SURFACE-02 defects
    const renderSnap = makeRenderSnapshotMatchingGt(gt);
    const audit = auditVerificationMatrix(gt, renderSnap, { content: [c], page_settings: {} });
    const geoDefects = audit.defects.filter(d => d.rule === 'RULE-SURFACE-02');
    assert.strictEqual(geoDefects.length, 0, 'Must have 0 RULE-SURFACE-02 defects');
  });

  // ---------------------------------------------------------------------------
  // Test 2: Desktop cover, tablet contain, mobile cover -> tablet AND mobile overrides
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 2] Desktop cover, Tablet contain, Mobile cover');

  runTest('2. Mobile compares with effective tablet value: emits both tablet contain and mobile cover', () => {
    const gt = make3VpGtSnapshot({
      sid: 'c_cov_con_cov',
      desktop: { size: 'cover', pos: '50% 50%', repeat: 'no-repeat' },
      tablet:  { size: 'contain', pos: '50% 50%', repeat: 'no-repeat' },
      mobile:  { size: 'cover', pos: '50% 50%', repeat: 'no-repeat' }
    });
    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });
    mergeNodeResponsive(elements[0], null, gt);

    const c = elements[0];
    assert.strictEqual(c.settings.background_size, 'cover', 'Desktop base must be cover');
    assert.strictEqual(c.settings.background_size_tablet, 'contain', 'Tablet override must be contain');
    assert.strictEqual(c.settings.background_size_mobile, 'cover', 'Mobile override must be cover (differs from effective tablet contain)');

    // Virtual CSS verification
    const renderedHtml = renderElementorToHtml({ content: [c], page_settings: {} });
    assert(renderedHtml.includes('background-size: cover;'), 'Desktop base CSS must contain cover');
    assert(renderedHtml.includes('background-size: contain;'), 'Tablet media query must contain background-size: contain;');
    assert(renderedHtml.includes('background-size: cover;'), 'Mobile media query must contain background-size: cover;');

    // Matrix audit clean
    const renderSnap = makeRenderSnapshotMatchingGt(gt);
    const audit = auditVerificationMatrix(gt, renderSnap, { content: [c], page_settings: {} });
    const geoDefects = audit.defects.filter(d => d.rule === 'RULE-SURFACE-02');
    assert.strictEqual(geoDefects.length, 0, 'Must have 0 RULE-SURFACE-02 defects');
  });

  // ---------------------------------------------------------------------------
  // Test 3: Tablet position top left, mobile same -> tablet override only
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 3] Tablet Position Override with Mobile Inheritance');

  runTest('3. Tablet position top left with identical mobile -> tablet override only, zero mobile setting', () => {
    const gt = make3VpGtSnapshot({
      sid: 'c_pos_inherit',
      desktop: { size: 'cover', pos: '50% 50%', repeat: 'no-repeat' },
      tablet:  { size: 'cover', pos: '0% 0%', repeat: 'no-repeat' },
      mobile:  { size: 'cover', pos: '0% 0%', repeat: 'no-repeat' }
    });
    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });
    mergeNodeResponsive(elements[0], null, gt);

    const c = elements[0];
    assert.strictEqual(c.settings.background_position, 'center center');
    assert.strictEqual(c.settings.background_position_tablet, 'top left', 'Tablet override must be top left');
    assert.strictEqual(c.settings.background_position_mobile, undefined, 'Mobile inherits tablet top left without redundant override');

    // Matrix audit clean (50% 50% vs center center, 0% 0% vs top left)
    const renderSnap = makeRenderSnapshotMatchingGt(gt);
    const audit = auditVerificationMatrix(gt, renderSnap, { content: [c], page_settings: {} });
    const geoDefects = audit.defects.filter(d => d.rule === 'RULE-SURFACE-02');
    assert.strictEqual(geoDefects.length, 0, 'Must have 0 RULE-SURFACE-02 defects');
  });

  // ---------------------------------------------------------------------------
  // Test 4: Repeat override + effective inheritance
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 4] Repeat Override + Effective Inheritance');

  runTest('4. Repeat override on tablet with mobile inheritance and 2-axis normalizer', () => {
    const gt = make3VpGtSnapshot({
      sid: 'c_repeat_inherit',
      desktop: { size: 'cover', pos: '50% 50%', repeat: 'no-repeat' },
      tablet:  { size: 'cover', pos: '50% 50%', repeat: 'repeat no-repeat' }, // computed repeat-x
      mobile:  { size: 'cover', pos: '50% 50%', repeat: 'repeat-x' }
    });
    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });
    mergeNodeResponsive(elements[0], null, gt);

    const c = elements[0];
    assert.strictEqual(c.settings.background_repeat, 'no-repeat');
    assert.strictEqual(c.settings.background_repeat_tablet, 'repeat-x');
    assert.strictEqual(c.settings.background_repeat_mobile, undefined, 'Mobile inherits repeat-x');

    const renderSnap = makeRenderSnapshotMatchingGt(gt);
    const audit = auditVerificationMatrix(gt, renderSnap, { content: [c], page_settings: {} });
    const geoDefects = audit.defects.filter(d => d.rule === 'RULE-SURFACE-02');
    assert.strictEqual(geoDefects.length, 0, 'Must have 0 RULE-SURFACE-02 defects');
  });

  // ---------------------------------------------------------------------------
  // Test 5: Unsupported tablet/mobile calc(...)/custom value -> zero guessed native setting + HIGH audit defect
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 5] Unsupported Custom Geometry -> Zero Guess + RULE-SURFACE-02 HIGH Defect');

  runTest('5. Unsupported calc(...) and px geometry on tablet/mobile omits native settings and triggers HIGH defect', () => {
    const gt = make3VpGtSnapshot({
      sid: 'c_unsupported_resp',
      desktop: { size: 'cover', pos: '50% 50%', repeat: 'no-repeat' },
      tablet:  { size: 'calc(100% - 20px) auto', pos: '15px 30px', repeat: 'space' },
      mobile:  { size: 'cover', pos: '50% 50%', repeat: 'no-repeat' }
    });
    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });
    mergeNodeResponsive(elements[0], null, gt);

    const c = elements[0];
    // No guessed settings on tablet
    assert.strictEqual(c.settings.background_size_tablet, undefined, 'Must not guess tablet size');
    assert.strictEqual(c.settings.background_position_tablet, undefined, 'Must not guess tablet position');
    assert.strictEqual(c.settings.background_repeat_tablet, undefined, 'Must not guess tablet repeat');

    const renderSnap = makeRenderSnapshotMatchingGt(gt);
    const audit = auditVerificationMatrix(gt, renderSnap, { content: [c], page_settings: {} });
    const geoDefects = audit.defects.filter(d => d.rule === 'RULE-SURFACE-02' && d.viewport === 'tablet');

    assert.strictEqual(geoDefects.length, 3, 'Must report 3 unsupported geometry defects on tablet');
    for (const d of geoDefects) {
      assert.strictEqual(d.severity, 'HIGH');
      assert.strictEqual(d.advisory, false);
      assert.strictEqual(d.rendered, 'unsupported');
    }
  });

  // ---------------------------------------------------------------------------
  // Test 6: Missing modern dictionary ref/property -> explicit failure, no legacy fallback
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 6] Missing Modern Dictionary Ref/Property -> Explicit Failure');

  runTest('6. Missing modern dictionary property on tablet throws FULL_STYLE_PROPERTY_MISSING in merger and reports HIGH in audit', () => {
    const gt = make3VpGtSnapshot({
      sid: 'c_missing_tab_prop',
      styleDictTablet: {
        'ref-c_missing_tab_prop': {
          'background-color': 'rgb(15, 23, 42)',
          'background-image': 'url("https://example.com/banner.jpg")',
          // 'background-size' is missing
          'background-position': '0% 0%',
          'background-repeat': 'repeat'
        }
      }
    });
    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });

    // Merger throws when modern dictionary property is missing
    let mergerThrown = null;
    try {
      mergeNodeResponsive(elements[0], null, gt);
    } catch (err) {
      mergerThrown = err;
    }
    assert(mergerThrown, 'Merger must throw when modern dictionary is missing property');
    assert.strictEqual(mergerThrown.code, 'FULL_STYLE_PROPERTY_MISSING');
    assert.strictEqual(mergerThrown.property, 'background-size');

    // Matrix audit emits HIGH defect for missing GT property
    const renderSnap = makeRenderSnapshotMatchingGt(gt, {
      tablet: {
        c_missing_tab_prop: {
          backgroundSize: 'cover'
        }
      }
    });
    const audit = auditVerificationMatrix(gt, renderSnap, { content: elements, page_settings: {} });
    const missingDefect = audit.defects.find(
      d => d.rule === 'RULE-SURFACE-02' && d.viewport === 'tablet' && d.property === 'background-size'
    );
    assert(missingDefect, 'Audit must report missing GT property defect');
    assert.strictEqual(missingDefect.severity, 'HIGH');
    assert.strictEqual(missingDefect.advisory, false);
    assert.strictEqual(missingDefect.rendered, 'FULL_STYLE_PROPERTY_MISSING');
  });

  // ---------------------------------------------------------------------------
  // Test 7: Missing rendered geometry field -> HIGH
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 7] Missing Rendered Geometry Field -> HIGH Defect');

  runTest('7. Missing rendered background-size style triggers non-advisory HIGH defect', () => {
    const gt = make3VpGtSnapshot({
      sid: 'c_missing_render_geo',
      desktop: { size: 'cover', pos: '50% 50%', repeat: 'no-repeat' }
    });
    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });
    mergeNodeResponsive(elements[0], null, gt);

    // Create render snapshot where backgroundSize is missing/empty
    const renderSnap = makeRenderSnapshotMatchingGt(gt, {
      desktop: {
        c_missing_render_geo: {
          backgroundSize: '' // missing
        }
      }
    });

    const audit = auditVerificationMatrix(gt, renderSnap, { content: elements, page_settings: {} });
    const defect = audit.defects.find(
      d => d.rule === 'RULE-SURFACE-02' && d.viewport === 'desktop' && d.property === 'background-size'
    );

    assert(defect, 'Must find missing render geometry defect');
    assert.strictEqual(defect.severity, 'HIGH');
    assert.strictEqual(defect.advisory, false);
    assert.strictEqual(defect.rendered, 'missing');
  });

  // ---------------------------------------------------------------------------
  // Test 8: Rendered geometry mismatch -> HIGH b correct viewport/property
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 8] Rendered Geometry Mismatch -> HIGH Defect with Viewport/Property');

  runTest('8. Rendered geometry mismatch on mobile triggers HIGH defect with exact viewport and property', () => {
    const gt = make3VpGtSnapshot({
      sid: 'c_mismatch_geo',
      desktop: { size: 'cover', pos: '50% 50%', repeat: 'no-repeat' },
      tablet:  { size: 'cover', pos: '50% 50%', repeat: 'no-repeat' },
      mobile:  { size: 'cover', pos: '0% 0%', repeat: 'no-repeat' } // mobile expects top left (0% 0%)
    });
    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });
    mergeNodeResponsive(elements[0], null, gt);

    // Render snapshot has mobile with 100% 100% (bottom right) instead of top left
    const renderSnap = makeRenderSnapshotMatchingGt(gt, {
      mobile: {
        c_mismatch_geo: {
          backgroundPosition: '100% 100%' // bottom right mismatch
        }
      }
    });

    const audit = auditVerificationMatrix(gt, renderSnap, { content: elements, page_settings: {} });
    const defect = audit.defects.find(
      d => d.rule === 'RULE-SURFACE-02' && d.viewport === 'mobile' && d.property === 'background-position'
    );

    assert(defect, 'Must find position mismatch defect on mobile');
    assert.strictEqual(defect.severity, 'HIGH');
    assert.strictEqual(defect.advisory, false);
    assert.strictEqual(defect.original, 'top left');
    assert.strictEqual(defect.rendered, 'bottom right');
  });

  // ---------------------------------------------------------------------------
  // Test 9: Causality Guard (RULE-SURFACE-01 missing image does NOT duplicate 3 geometry defects)
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 9] Causality Guard (No Duplicate Defects When Image Missing)');

  runTest('9. Missing image in render produces RULE-SURFACE-01 defect only, zero duplicate RULE-SURFACE-02 defects', () => {
    const gt = make3VpGtSnapshot({
      sid: 'c_missing_img',
      desktop: { size: 'cover', pos: '50% 50%', repeat: 'no-repeat' }
    });
    const ast = parseHtmlToAst(gt.annotatedHtml);
    const elements = compileGroundTruthToElementor(ast, gt, { viewport: 'desktop', atomicRules: [] });

    // Render snapshot missing background-image
    const renderSnap = makeRenderSnapshotMatchingGt(gt, {
      desktop: {
        c_missing_img: {
          backgroundImage: 'none'
        }
      }
    });

    const audit = auditVerificationMatrix(gt, renderSnap, { content: elements, page_settings: {} });
    const surface01Defects = audit.defects.filter(d => d.rule === 'RULE-SURFACE-01');
    const surface02Defects = audit.defects.filter(d => d.rule === 'RULE-SURFACE-02');

    assert(surface01Defects.length > 0, 'RULE-SURFACE-01 must report missing image');
    assert.strictEqual(surface02Defects.length, 0, 'RULE-SURFACE-02 must NOT add 3 duplicate geometry defects for missing image');
  });

  // ---------------------------------------------------------------------------
  // Test 10: Real Headless Chromium Mini Fixture with Media Queries (End-to-End)
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 10] Real Chromium Mini Fixture with Responsive Media Queries');

  await runAsyncTest('10. End-to-end Chromium fixture: media queries -> native overrides -> rendered CSS computed parity across 3 viewports', async () => {
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
    .responsive-hero {
      background-image: url("https://images.unsplash.com/photo-1579546929518-9e396f3cc809");
      background-color: rgb(15, 23, 42);
      background-size: cover;
      background-position: center center;
      background-repeat: no-repeat;
      padding: 48px 32px;
      min-height: 350px;
      box-sizing: border-box;
    }
    .responsive-hero h1 {
      color: rgb(255, 255, 255);
      margin: 0;
      font-size: 28px;
    }
    @media (max-width: 1024px) {
      .responsive-hero {
        background-size: contain;
        background-position: top left;
        background-repeat: repeat-x;
      }
    }
    @media (max-width: 767px) {
      .responsive-hero {
        background-size: cover;
        background-position: top left;
        background-repeat: repeat-x;
      }
    }
  </style>
</head>
<body>
  <div class="responsive-hero" id="resp-hero-container">
    <h1>Responsive Image Container</h1>
  </div>
</body>
</html>`;

    console.log('    • Capturing real Ground Truth snapshot across 3 viewports with Chromium...');
    const gtSnapshot = await captureGroundTruth(fixtureHtml, { cache: false });

    assert(gtSnapshot?.viewports?.desktop?.flat, 'GT desktop flat nodes must exist');
    assert(gtSnapshot?.viewports?.tablet?.flat, 'GT tablet flat nodes must exist');
    assert(gtSnapshot?.viewports?.mobile?.flat, 'GT mobile flat nodes must exist');

    const heroDesk = Object.values(gtSnapshot.viewports.desktop.flat).find(n => n.id === 'resp-hero-container');
    const heroTab = Object.values(gtSnapshot.viewports.tablet.flat).find(n => n.id === 'resp-hero-container');
    const heroMob = Object.values(gtSnapshot.viewports.mobile.flat).find(n => n.id === 'resp-hero-container');

    assert(heroDesk && heroTab && heroMob, 'Hero container node must be present in all 3 viewports');

    const deskDict = gtSnapshot.viewports.desktop.styleDictionary[heroDesk.computedStyleRef];
    const tabDict = gtSnapshot.viewports.tablet.styleDictionary[heroTab.computedStyleRef];
    const mobDict = gtSnapshot.viewports.mobile.styleDictionary[heroMob.computedStyleRef];

    console.log('    • Chromium GT Computed Styles across 3 Viewports:');
    console.log(`      [Desktop] size=${deskDict['background-size']}, pos=${deskDict['background-position']}, rep=${deskDict['background-repeat']}`);
    console.log(`      [Tablet]  size=${tabDict['background-size']}, pos=${tabDict['background-position']}, rep=${tabDict['background-repeat']}`);
    console.log(`      [Mobile]  size=${mobDict['background-size']}, pos=${mobDict['background-position']}, rep=${mobDict['background-repeat']}`);

    assert.strictEqual(deskDict['background-size'], 'cover');
    assert.strictEqual(deskDict['background-position'], '50% 50%');
    assert.strictEqual(deskDict['background-repeat'], 'no-repeat');

    assert.strictEqual(tabDict['background-size'], 'contain');
    assert.strictEqual(tabDict['background-position'], '0% 0%');
    assert.strictEqual(tabDict['background-repeat'], 'repeat-x');

    assert.strictEqual(mobDict['background-size'], 'cover');
    assert.strictEqual(mobDict['background-position'], '0% 0%');
    assert.strictEqual(mobDict['background-repeat'], 'repeat-x');

    console.log('    • Compiling HTML to Elementor template with responsive merge...');
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
      e => e.settings?._element_id === 'resp-hero-container' || e._element_id === 'resp-hero-container'
    );

    assert(heroCompiled, 'Compiled hero container must exist in template');
    const s = heroCompiled.settings;

    console.log('    • Native Elementor Settings after Compilation:');
    console.log(`      - Desktop: size=${s.background_size}, pos=${s.background_position}, rep=${s.background_repeat}`);
    console.log(`      - Tablet:  size=${s.background_size_tablet}, pos=${s.background_position_tablet}, rep=${s.background_repeat_tablet}`);
    console.log(`      - Mobile:  size=${s.background_size_mobile}, pos=${s.background_position_mobile}, rep=${s.background_repeat_mobile}`);

    // Verify Desktop
    assert.strictEqual(s.background_size, 'cover');
    assert.strictEqual(s.background_position, 'center center');
    assert.strictEqual(s.background_repeat, 'no-repeat');

    // Verify Tablet overrides
    assert.strictEqual(s.background_size_tablet, 'contain');
    assert.strictEqual(s.background_position_tablet, 'top left');
    assert.strictEqual(s.background_repeat_tablet, 'repeat-x');

    // Verify Mobile overrides (size reverts to cover from tablet contain, position/repeat inherit tablet)
    assert.strictEqual(s.background_size_mobile, 'cover', 'Mobile size must override tablet contain');
    assert.strictEqual(s.background_position_mobile, undefined, 'Mobile position inherits tablet top left');
    assert.strictEqual(s.background_repeat_mobile, undefined, 'Mobile repeat inherits tablet repeat-x');

    console.log('    • Rendering Elementor template to virtual HTML with media queries...');
    const previewHtml = renderElementorToHtml(compileResult.templateJson, { fonts: gtSnapshot.fonts });

    // Verify CSS contains media queries for tablet and mobile
    assert(previewHtml.includes('@media (max-width: 1024px)'), 'Virtual CSS must have tablet media query');
    assert(previewHtml.includes('@media (max-width: 767px)'), 'Virtual CSS must have mobile media query');

    console.log('    • Capturing render snapshot across 3 viewports with Chromium...');
    const renderSnapshot = await captureRenderSnapshot(previewHtml);

    const deskRenderNode = renderSnapshot.viewports.desktop.flat[heroDesk.sid];
    const tabRenderNode = renderSnapshot.viewports.tablet.flat[heroTab.sid];
    const mobRenderNode = renderSnapshot.viewports.mobile.flat[heroMob.sid];

    assert(deskRenderNode && tabRenderNode && mobRenderNode, 'Rendered node must be present in all 3 viewports');

    console.log('    • Chromium Rendered Computed Styles across 3 Viewports:');
    console.log(`      [Desktop] size=${deskRenderNode.styles.backgroundSize}, pos=${deskRenderNode.styles.backgroundPosition}, rep=${deskRenderNode.styles.backgroundRepeat}`);
    console.log(`      [Tablet]  size=${tabRenderNode.styles.backgroundSize}, pos=${tabRenderNode.styles.backgroundPosition}, rep=${tabRenderNode.styles.backgroundRepeat}`);
    console.log(`      [Mobile]  size=${mobRenderNode.styles.backgroundSize}, pos=${mobRenderNode.styles.backgroundPosition}, rep=${mobRenderNode.styles.backgroundRepeat}`);

    // Verify rendered computed parity
    assert.strictEqual(deskRenderNode.styles.backgroundSize, 'cover');
    assert.strictEqual(deskRenderNode.styles.backgroundPosition, '50% 50%');
    assert.strictEqual(deskRenderNode.styles.backgroundRepeat, 'no-repeat');

    assert.strictEqual(tabRenderNode.styles.backgroundSize, 'contain');
    assert.strictEqual(tabRenderNode.styles.backgroundPosition, '0% 0%');
    assert.strictEqual(tabRenderNode.styles.backgroundRepeat, 'repeat-x');

    assert.strictEqual(mobRenderNode.styles.backgroundSize, 'cover');
    assert.strictEqual(mobRenderNode.styles.backgroundPosition, '0% 0%');
    assert.strictEqual(mobRenderNode.styles.backgroundRepeat, 'repeat-x');

    console.log('    • Running Per-Widget Verification Matrix Audit...');
    const matrixResult = auditVerificationMatrix(gtSnapshot, renderSnapshot, compileResult.templateJson);

    const geoDefects = matrixResult.defects.filter(d => d.rule === 'RULE-SURFACE-02');
    const surface01Defects = matrixResult.defects.filter(d => d.rule === 'RULE-SURFACE-01');

    console.log(`      - RULE-SURFACE-02 defects (geometry): ${geoDefects.length}`);
    console.log(`      - RULE-SURFACE-01 defects (content unverified): ${surface01Defects.length}`);

    // Geometry parity is clean across all 3 viewports
    assert.strictEqual(geoDefects.length, 0, 'RULE-SURFACE-02 must have 0 defects (full responsive computed parity)');

    // In Part 5A: Single-image parity across desktop/tablet/mobile -> 0 RULE-SURFACE-01 defects
    assert.strictEqual(surface01Defects.length, 0, 'RULE-SURFACE-01 must have 0 defects when single image matches across viewports');
  });

  // ---------------------------------------------------------------------------
  // Test 11: Responsive Image URL Change in GT (Viewport Isolation) -> HIGH in changed viewport
  // ---------------------------------------------------------------------------
  console.log('\n▶ [TEST 11] Responsive Image URL Change in GT -> Viewport Isolated HIGH Defect');

  runTest('11. GT changing background image URL on tablet triggers HIGH RULE-SURFACE-01 in tablet only', () => {
    const desktopUrl = 'https://example.com/desktop-banner.jpg';
    const tabletUrl = 'https://example.com/tablet-banner.jpg';
    const sid = 'c_resp_img_mismatch';

    // GT has desktopUrl on desktop and mobile, but tabletUrl on tablet
    const gt = make3VpGtSnapshot({
      sid,
      bgImage: `url("${desktopUrl}")`,
      bgColor: 'rgb(15, 23, 42)',
      desktop: { size: 'cover', pos: '50% 50%', repeat: 'no-repeat' },
      tablet:  { size: 'cover', pos: '50% 50%', repeat: 'no-repeat' },
      mobile:  { size: 'cover', pos: '50% 50%', repeat: 'no-repeat' }
    });

    // Mutate tablet GT node and dictionary to tabletUrl
    gt.viewports.tablet.flat[sid].styles.backgroundImage = `url("${tabletUrl}")`;
    gt.viewports.tablet.styleDictionary[`ref-${sid}`]['background-image'] = `url("${tabletUrl}")`;

    // Template only has desktop native image setting (Elementor has no background_image_tablet)
    const tpl = {
      content: [
        {
          _sid: sid,
          id: 'w_resp_img_mismatch',
          elType: 'container',
          settings: {
            background_background: 'classic',
            background_image: { url: desktopUrl, id: '' }
          },
          elements: []
        }
      ]
    };

    // Render snapshot matches desktop template across all 3 viewports
    const render = makeRenderSnapshotMatchingGt(gt, {
      tablet: {
        [sid]: {
          backgroundImage: `url("${desktopUrl}")`
        }
      }
    });

    const audit = auditVerificationMatrix(gt, render, tpl);
    const surfaceDefects = audit.defects.filter(d => d.nodeSid === sid && d.rule === 'RULE-SURFACE-01');

    const deskDefects = surfaceDefects.filter(d => d.viewport === 'desktop');
    const tabDefects = surfaceDefects.filter(d => d.viewport === 'tablet');
    const mobDefects = surfaceDefects.filter(d => d.viewport === 'mobile');

    assert.strictEqual(deskDefects.length, 0, 'Desktop must have 0 RULE-SURFACE-01 defects');
    assert.strictEqual(mobDefects.length, 0, 'Mobile must have 0 RULE-SURFACE-01 defects');

    assert.strictEqual(tabDefects.length, 1, 'Tablet must have exactly 1 RULE-SURFACE-01 defect');
    assert.strictEqual(tabDefects[0].severity, 'HIGH');
    assert.strictEqual(tabDefects[0].property, 'backgroundImage');
    assert.strictEqual(tabDefects[0].original, tabletUrl);
    assert.strictEqual(tabDefects[0].rendered, desktopUrl);
    console.log('    • ACTUAL Defect Record for Responsive Image URL Mismatch on Tablet:');
    console.log(JSON.stringify(tabDefects[0], null, 2));
  });

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log(`ALL ${passedTests}/${totalTests} TESTS PASSED CLEANLY (100%)`);
  console.log('========================================================================');
})();

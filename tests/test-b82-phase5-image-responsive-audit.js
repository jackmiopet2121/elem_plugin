/**
 * Block 8.2 — Phase 5 (Part 5B-2): Responsive Background Image Audit Tests.
 *
 * Verifies:
 * 1. Positive matrix: A/A/A, A/B/B, A/B/A, A/B/C have zero RULE-SURFACE-01 defects when template and render match.
 * 2. Negative matrix:
 *    - Missing tablet override -> tablet HIGH, mobile HIGH (inherits missing).
 *    - Wrong tablet URL -> tablet HIGH.
 *    - Missing mobile restore (A/B/A) -> mobile HIGH.
 *    - Malformed/empty tablet override -> tablet HIGH.
 *    - Unsafe tablet URL (javascript:) -> tablet HIGH.
 *    - Mobile own valid override overcomes invalid tablet setting.
 *    - Rendered URL mismatch despite correct template -> exact viewport HIGH.
 *    - Unsupported transition to none hidden by rendered CSS -> HIGH defect preserved.
 * 3. Real Chromium media-query end-to-end fixture: GT -> compile -> virtual render -> Chromium render snapshot -> audit (A/B/A = 0 defects).
 */

'use strict';

const assert = require('assert');
const { captureGroundTruth } = require('../src/smart/style-snapshot');
const { captureRenderSnapshot } = require('../src/smart/render-snapshot');
const { renderElementorToHtml, isSafeCssUrl } = require('../src/emulator/elementor-virtual-renderer');
const { compileHtmlToElementor } = require('../src/engine');
const { auditVerificationMatrix, findScopedImageCssDeclaration } = require('../src/smart/verification-matrix');

(async () => {
  console.log('========================================================================');
  console.log('BLOCK 8.2 — PHASE 5 (PART 5B-2): RESPONSIVE IMAGE SOURCE AUDIT');
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

  function make3VpGtImageSnapshot({
    sid = 'c_test_resp',
    bgColor = 'rgb(15, 23, 42)',
    desktopImg = 'url("https://example.com/desktop.jpg")',
    tabletImg = 'url("https://example.com/desktop.jpg")',
    mobileImg = 'url("https://example.com/desktop.jpg")'
  } = {}) {
    const ref = `ref-${sid}`;
    const makeDict = (imgCss) => ({
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
    });

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

    const canvas = {
      html: { backgroundColor: 'transparent', backgroundImage: 'none' },
      body: { backgroundColor: 'transparent', backgroundImage: 'none' }
    };

    return {
      annotatedHtml: `<div class="hero-c" data-sid="${sid}"><h1>Test</h1></div>`,
      fonts: [],
      viewports: {
        desktop: {
          flat: { [sid]: makeNode(desktopImg) },
          styleDictionary: makeDict(desktopImg),
          canvas
        },
        tablet: {
          flat: { [sid]: makeNode(tabletImg) },
          styleDictionary: makeDict(tabletImg),
          canvas
        },
        mobile: {
          flat: { [sid]: makeNode(mobileImg) },
          styleDictionary: makeDict(mobileImg),
          canvas
        }
      }
    };
  }

  function makeRenderSnapshotMatching({
    sid = 'c_test_resp',
    bgColor = 'rgb(15, 23, 42)',
    desktopImg = 'url("https://example.com/desktop.jpg")',
    tabletImg = 'url("https://example.com/desktop.jpg")',
    mobileImg = 'url("https://example.com/desktop.jpg")'
  } = {}) {
    const makeNode = (img) => ({
      sid,
      rect: { x: 0, y: 0, w: 800, h: 400 },
      styles: {
        backgroundColor: bgColor,
        backgroundImage: img,
        backgroundSize: 'cover',
        backgroundPosition: '50% 50%',
        backgroundRepeat: 'no-repeat'
      }
    });
    const canvas = {
      body: { backgroundColor: 'transparent', backgroundImage: 'none' }
    };
    return {
      viewports: {
        desktop: { flat: { [sid]: makeNode(desktopImg) }, canvas },
        tablet: { flat: { [sid]: makeNode(tabletImg) }, canvas },
        mobile: { flat: { [sid]: makeNode(mobileImg) }, canvas }
      }
    };
  }

  function makeTemplateJson({
    sid = 'c_test_resp',
    settings = {},
    atomicRules = []
  } = {}) {
    return {
      atomicRules,
      content: [
        {
          _sid: sid,
          id: `w_${sid}`,
          elType: 'container',
          settings: {
            background_background: 'classic',
            ...settings
          },
          elements: []
        }
      ]
    };
  }

  // ---------------------------------------------------------------------------
  // Positive Matrix Tests
  // ---------------------------------------------------------------------------
  console.log('▶ [SECTION 1] Positive Responsive Matrix: Zero RULE-SURFACE-01 Defects');

  runTest('1.1. Positive A/A/A (uniform source across viewports) -> 0 RULE-SURFACE-01 defects', () => {
    const urlA = 'https://example.com/image-a.jpg';
    const gt = make3VpGtImageSnapshot({
      sid: 'c_pos_aaa',
      desktopImg: `url("${urlA}")`,
      tabletImg: `url("${urlA}")`,
      mobileImg: `url("${urlA}")`
    });
    const render = makeRenderSnapshotMatching({
      sid: 'c_pos_aaa',
      desktopImg: `url("${urlA}")`,
      tabletImg: `url("${urlA}")`,
      mobileImg: `url("${urlA}")`
    });
    const tpl = makeTemplateJson({
      sid: 'c_pos_aaa',
      settings: {
        background_image: { url: urlA, id: '' }
      }
    });

    const audit = auditVerificationMatrix(gt, render, tpl);
    const surfaceDefects = audit.defects.filter(d => d.nodeSid === 'c_pos_aaa' && d.rule === 'RULE-SURFACE-01');
    assert.strictEqual(surfaceDefects.length, 0, 'A/A/A must have exactly 0 RULE-SURFACE-01 defects');
  });

  runTest('1.2. Positive A/B/B (tablet change, mobile inherits tablet) -> 0 RULE-SURFACE-01 defects', () => {
    const urlA = 'https://example.com/image-a.jpg';
    const urlB = 'https://example.com/image-b.jpg';
    const gt = make3VpGtImageSnapshot({
      sid: 'c_pos_abb',
      desktopImg: `url("${urlA}")`,
      tabletImg: `url("${urlB}")`,
      mobileImg: `url("${urlB}")`
    });
    const render = makeRenderSnapshotMatching({
      sid: 'c_pos_abb',
      desktopImg: `url("${urlA}")`,
      tabletImg: `url("${urlB}")`,
      mobileImg: `url("${urlB}")`
    });
    const tpl = makeTemplateJson({
      sid: 'c_pos_abb',
      settings: {
        background_image: { url: urlA, id: '' },
        background_image_tablet: { url: urlB, id: '' }
      }
    });

    const audit = auditVerificationMatrix(gt, render, tpl);
    const surfaceDefects = audit.defects.filter(d => d.nodeSid === 'c_pos_abb' && d.rule === 'RULE-SURFACE-01');
    assert.strictEqual(surfaceDefects.length, 0, 'A/B/B must have exactly 0 RULE-SURFACE-01 defects');
  });

  runTest('1.3. Positive A/B/A (mobile restore / reversal) -> 0 RULE-SURFACE-01 defects', () => {
    const urlA = 'https://example.com/image-a.jpg';
    const urlB = 'https://example.com/image-b.jpg';
    const gt = make3VpGtImageSnapshot({
      sid: 'c_pos_aba',
      desktopImg: `url("${urlA}")`,
      tabletImg: `url("${urlB}")`,
      mobileImg: `url("${urlA}")`
    });
    const render = makeRenderSnapshotMatching({
      sid: 'c_pos_aba',
      desktopImg: `url("${urlA}")`,
      tabletImg: `url("${urlB}")`,
      mobileImg: `url("${urlA}")`
    });
    const tpl = makeTemplateJson({
      sid: 'c_pos_aba',
      settings: {
        background_image: { url: urlA, id: '' },
        background_image_tablet: { url: urlB, id: '' },
        background_image_mobile: { url: urlA, id: '' }
      }
    });

    const audit = auditVerificationMatrix(gt, render, tpl);
    const surfaceDefects = audit.defects.filter(d => d.nodeSid === 'c_pos_aba' && d.rule === 'RULE-SURFACE-01');
    assert.strictEqual(surfaceDefects.length, 0, 'A/B/A must have exactly 0 RULE-SURFACE-01 defects');
  });

  runTest('1.4. Positive A/B/C (distinct URLs on all viewports) -> 0 RULE-SURFACE-01 defects', () => {
    const urlA = 'https://example.com/image-a.jpg';
    const urlB = 'https://example.com/image-b.jpg';
    const urlC = 'https://example.com/image-c.jpg';
    const gt = make3VpGtImageSnapshot({
      sid: 'c_pos_abc',
      desktopImg: `url("${urlA}")`,
      tabletImg: `url("${urlB}")`,
      mobileImg: `url("${urlC}")`
    });
    const render = makeRenderSnapshotMatching({
      sid: 'c_pos_abc',
      desktopImg: `url("${urlA}")`,
      tabletImg: `url("${urlB}")`,
      mobileImg: `url("${urlC}")`
    });
    const tpl = makeTemplateJson({
      sid: 'c_pos_abc',
      settings: {
        background_image: { url: urlA, id: '' },
        background_image_tablet: { url: urlB, id: '' },
        background_image_mobile: { url: urlC, id: '' }
      }
    });

    const audit = auditVerificationMatrix(gt, render, tpl);
    const surfaceDefects = audit.defects.filter(d => d.nodeSid === 'c_pos_abc' && d.rule === 'RULE-SURFACE-01');
    assert.strictEqual(surfaceDefects.length, 0, 'A/B/C must have exactly 0 RULE-SURFACE-01 defects');
  });

  // ---------------------------------------------------------------------------
  // Negative Matrix Tests
  // ---------------------------------------------------------------------------
  console.log('\n▶ [SECTION 2] Negative Responsive Matrix: Viewport-Isolated HIGH Defects');

  runTest('2.1. Negative: Missing tablet override (D=A, T=B, M=B) -> tablet and mobile HIGH', () => {
    const urlA = 'https://example.com/image-a.jpg';
    const urlB = 'https://example.com/image-b.jpg';
    const sid = 'c_neg_miss_tab';
    const gt = make3VpGtImageSnapshot({
      sid,
      desktopImg: `url("${urlA}")`,
      tabletImg: `url("${urlB}")`,
      mobileImg: `url("${urlB}")`
    });
    const render = makeRenderSnapshotMatching({
      sid,
      desktopImg: `url("${urlA}")`,
      tabletImg: `url("${urlA}")`,
      mobileImg: `url("${urlA}")`
    });
    // Missing background_image_tablet:
    const tpl = makeTemplateJson({
      sid,
      settings: {
        background_image: { url: urlA, id: '' }
      }
    });

    const audit = auditVerificationMatrix(gt, render, tpl);
    const defects = audit.defects.filter(d => d.nodeSid === sid && d.rule === 'RULE-SURFACE-01');

    assert.strictEqual(defects.filter(d => d.viewport === 'desktop').length, 0);
    const tabDefects = defects.filter(d => d.viewport === 'tablet');
    const mobDefects = defects.filter(d => d.viewport === 'mobile');

    assert.strictEqual(tabDefects.length, 1);
    assert.strictEqual(tabDefects[0].severity, 'HIGH');
    assert.strictEqual(tabDefects[0].original, urlB);

    assert.strictEqual(mobDefects.length, 1);
    assert.strictEqual(mobDefects[0].severity, 'HIGH');
    assert.strictEqual(mobDefects[0].original, urlB);
  });

  runTest('2.2. Negative: Wrong tablet URL -> tablet HIGH', () => {
    const urlA = 'https://example.com/image-a.jpg';
    const urlB = 'https://example.com/image-b.jpg';
    const urlWrong = 'https://example.com/wrong-tablet.jpg';
    const sid = 'c_neg_wrong_tab';
    const gt = make3VpGtImageSnapshot({
      sid,
      desktopImg: `url("${urlA}")`,
      tabletImg: `url("${urlB}")`,
      mobileImg: `url("${urlB}")`
    });
    const render = makeRenderSnapshotMatching({
      sid,
      desktopImg: `url("${urlA}")`,
      tabletImg: `url("${urlWrong}")`,
      mobileImg: `url("${urlWrong}")`
    });
    const tpl = makeTemplateJson({
      sid,
      settings: {
        background_image: { url: urlA, id: '' },
        background_image_tablet: { url: urlWrong, id: '' }
      }
    });

    const audit = auditVerificationMatrix(gt, render, tpl);
    const defects = audit.defects.filter(d => d.nodeSid === sid && d.rule === 'RULE-SURFACE-01');

    assert.strictEqual(defects.filter(d => d.viewport === 'desktop').length, 0);
    const tabDefects = defects.filter(d => d.viewport === 'tablet');
    assert.strictEqual(tabDefects.length, 1);
    assert.strictEqual(tabDefects[0].severity, 'HIGH');
    assert.strictEqual(tabDefects[0].original, urlB);
    assert.strictEqual(tabDefects[0].rendered, urlWrong);
  });

  let printedMissingRestoreDefect = null;
  runTest('2.3. Negative: Missing mobile restore (D=A, T=B, M=A) -> mobile HIGH defect', () => {
    const urlA = 'https://example.com/image-a.jpg';
    const urlB = 'https://example.com/image-b.jpg';
    const sid = 'c_neg_miss_mob_restore';
    const gt = make3VpGtImageSnapshot({
      sid,
      desktopImg: `url("${urlA}")`,
      tabletImg: `url("${urlB}")`,
      mobileImg: `url("${urlA}")`
    });
    const render = makeRenderSnapshotMatching({
      sid,
      desktopImg: `url("${urlA}")`,
      tabletImg: `url("${urlB}")`,
      mobileImg: `url("${urlB}")`
    });
    // Missing background_image_mobile: mobile silently inherits tablet URL B
    const tpl = makeTemplateJson({
      sid,
      settings: {
        background_image: { url: urlA, id: '' },
        background_image_tablet: { url: urlB, id: '' }
      }
    });

    const audit = auditVerificationMatrix(gt, render, tpl);
    const defects = audit.defects.filter(d => d.nodeSid === sid && d.rule === 'RULE-SURFACE-01');

    assert.strictEqual(defects.filter(d => d.viewport === 'desktop').length, 0);
    assert.strictEqual(defects.filter(d => d.viewport === 'tablet').length, 0);

    const mobDefects = defects.filter(d => d.viewport === 'mobile');
    assert.strictEqual(mobDefects.length, 1);
    assert.strictEqual(mobDefects[0].severity, 'HIGH');
    assert.strictEqual(mobDefects[0].original, urlA);
    assert.strictEqual(mobDefects[0].rendered, urlB);
    printedMissingRestoreDefect = mobDefects[0];
  });

  runTest('2.4. Negative: Malformed/empty tablet override -> tablet HIGH (does not fall back to desktop silently)', () => {
    const urlA = 'https://example.com/image-a.jpg';
    const sid = 'c_neg_empty_tab';
    const gt = make3VpGtImageSnapshot({
      sid,
      desktopImg: `url("${urlA}")`,
      tabletImg: `url("${urlA}")`,
      mobileImg: `url("${urlA}")`
    });
    const render = makeRenderSnapshotMatching({
      sid,
      desktopImg: `url("${urlA}")`,
      tabletImg: `url("${urlA}")`,
      mobileImg: `url("${urlA}")`
    });
    // Present but empty tablet setting
    const tpl = makeTemplateJson({
      sid,
      settings: {
        background_image: { url: urlA, id: '' },
        background_image_tablet: { url: '', id: '' }
      }
    });

    const audit = auditVerificationMatrix(gt, render, tpl);
    const tabDefects = audit.defects.filter(d => d.nodeSid === sid && d.rule === 'RULE-SURFACE-01' && d.viewport === 'tablet');
    assert.strictEqual(tabDefects.length, 1);
    assert.strictEqual(tabDefects[0].severity, 'HIGH');
    assert(tabDefects[0].message.includes('missing, non-string, or empty'), 'Defect message must indicate empty setting');
  });

  let printedUnsafeOverrideDefect = null;
  runTest('2.5. Negative: Unsafe tablet URL (javascript:) -> tablet HIGH', () => {
    const urlA = 'https://example.com/image-a.jpg';
    const unsafeUrl = 'javascript:alert(1)';
    const sid = 'c_neg_unsafe_tab';
    const gt = make3VpGtImageSnapshot({
      sid,
      desktopImg: `url("${urlA}")`,
      tabletImg: `url("${urlA}")`,
      mobileImg: `url("${urlA}")`
    });
    const render = makeRenderSnapshotMatching({
      sid,
      desktopImg: `url("${urlA}")`,
      tabletImg: `url("${urlA}")`,
      mobileImg: `url("${urlA}")`
    });
    const tpl = makeTemplateJson({
      sid,
      settings: {
        background_image: { url: urlA, id: '' },
        background_image_tablet: { url: unsafeUrl, id: '' }
      }
    });

    const audit = auditVerificationMatrix(gt, render, tpl);
    const tabDefects = audit.defects.filter(d => d.nodeSid === sid && d.rule === 'RULE-SURFACE-01' && d.viewport === 'tablet');
    assert.strictEqual(tabDefects.length, 1);
    assert.strictEqual(tabDefects[0].severity, 'HIGH');
    assert(tabDefects[0].message.includes('contains unsafe URL'), 'Defect message must report unsafe URL');
    printedUnsafeOverrideDefect = tabDefects[0];
  });

  runTest('2.6. Negative: Mobile own valid override overcomes invalid tablet setting, tablet defect remains', () => {
    const urlA = 'https://example.com/image-a.jpg';
    const urlC = 'https://example.com/image-c.jpg';
    const sid = 'c_mob_overcomes_tab';
    const gt = make3VpGtImageSnapshot({
      sid,
      desktopImg: `url("${urlA}")`,
      tabletImg: `url("${urlA}")`,
      mobileImg: `url("${urlC}")`
    });
    const render = makeRenderSnapshotMatching({
      sid,
      desktopImg: `url("${urlA}")`,
      tabletImg: `url("${urlA}")`,
      mobileImg: `url("${urlC}")`
    });
    // Tablet has empty/invalid override, but mobile has own valid override matching GT & render
    const tpl = makeTemplateJson({
      sid,
      settings: {
        background_image: { url: urlA, id: '' },
        background_image_tablet: { url: '', id: '' },
        background_image_mobile: { url: urlC, id: '' }
      }
    });

    const audit = auditVerificationMatrix(gt, render, tpl);
    const defects = audit.defects.filter(d => d.nodeSid === sid && d.rule === 'RULE-SURFACE-01');

    assert.strictEqual(defects.filter(d => d.viewport === 'desktop').length, 0);
    const tabDefects = defects.filter(d => d.viewport === 'tablet');
    assert.strictEqual(tabDefects.length, 1, 'Tablet defect must remain');
    assert.strictEqual(tabDefects[0].severity, 'HIGH');

    const mobDefects = defects.filter(d => d.viewport === 'mobile');
    assert.strictEqual(mobDefects.length, 0, 'Mobile own valid override must not inherit invalid tablet defect');
  });

  runTest('2.7. Negative: Rendered URL mismatch despite correct template -> exact viewport HIGH', () => {
    const urlA = 'https://example.com/image-a.jpg';
    const urlB = 'https://example.com/image-b.jpg';
    const corruptedRenderUrl = 'https://example.com/corrupted.jpg';
    const sid = 'c_neg_render_mismatch';
    const gt = make3VpGtImageSnapshot({
      sid,
      desktopImg: `url("${urlA}")`,
      tabletImg: `url("${urlB}")`,
      mobileImg: `url("${urlB}")`
    });
    // Render has corrupted URL on mobile
    const render = makeRenderSnapshotMatching({
      sid,
      desktopImg: `url("${urlA}")`,
      tabletImg: `url("${urlB}")`,
      mobileImg: `url("${corruptedRenderUrl}")`
    });
    const tpl = makeTemplateJson({
      sid,
      settings: {
        background_image: { url: urlA, id: '' },
        background_image_tablet: { url: urlB, id: '' }
      }
    });

    const audit = auditVerificationMatrix(gt, render, tpl);
    const defects = audit.defects.filter(d => d.nodeSid === sid && d.rule === 'RULE-SURFACE-01');

    assert.strictEqual(defects.filter(d => d.viewport === 'desktop').length, 0);
    assert.strictEqual(defects.filter(d => d.viewport === 'tablet').length, 0);

    const mobDefects = defects.filter(d => d.viewport === 'mobile');
    assert.strictEqual(mobDefects.length, 1);
    assert.strictEqual(mobDefects[0].severity, 'HIGH');
    assert.strictEqual(mobDefects[0].original, urlB);
    assert.strictEqual(mobDefects[0].rendered, corruptedRenderUrl);
    assert(mobDefects[0].message.includes('rendered background image URL mismatch'), 'Must report rendered URL mismatch');
  });

  let printedNoneTransitionDefect = null;
  runTest('2.8. Negative: Unsupported transition to "none" hidden by rendered CSS -> HIGH defect preserved', () => {
    const urlA = 'https://example.com/image-a.jpg';
    const sid = 'c_neg_none_transition';
    const gt = make3VpGtImageSnapshot({
      sid,
      desktopImg: `url("${urlA}")`,
      tabletImg: 'none',
      mobileImg: 'none'
    });
    // Render snapshot has 'none' (e.g. forced by custom CSS)
    const render = makeRenderSnapshotMatching({
      sid,
      desktopImg: `url("${urlA}")`,
      tabletImg: 'none',
      mobileImg: 'none'
    });
    // Template still retains desktop image A (cannot natively clear in Elementor Free)
    const tpl = makeTemplateJson({
      sid,
      settings: {
        background_image: { url: urlA, id: '' }
      }
    });

    const audit = auditVerificationMatrix(gt, render, tpl);
    const defects = audit.defects.filter(d => d.nodeSid === sid && d.rule === 'RULE-SURFACE-01');

    assert.strictEqual(defects.filter(d => d.viewport === 'desktop').length, 0);
    const tabDefects = defects.filter(d => d.viewport === 'tablet');
    assert.strictEqual(tabDefects.length, 1);
    assert.strictEqual(tabDefects[0].severity, 'HIGH');
    assert.strictEqual(tabDefects[0].original, 'none');
    assert(tabDefects[0].message.includes('unsupported transition to background-image: none'), 'Must flag unsupported clear to none');
    printedNoneTransitionDefect = tabDefects[0];

    const mobDefects = defects.filter(d => d.viewport === 'mobile');
    assert.strictEqual(mobDefects.length, 1);
    assert.strictEqual(mobDefects[0].severity, 'HIGH');
    assert.strictEqual(mobDefects[0].original, 'none');
  });

  runTest('2.9. Positive: Verified scoped CSS transition URL -> none -> none produces 0 defects', () => {
    const urlA = 'https://example.com/image-a.jpg';
    const sid = 'c_pos_none_none';
    const cleanSid = 'c_pos_none_none';
    const gt = make3VpGtImageSnapshot({
      sid,
      desktopImg: `url("${urlA}")`,
      tabletImg: 'none',
      mobileImg: 'none'
    });
    const render = makeRenderSnapshotMatching({
      sid,
      desktopImg: `url("${urlA}")`,
      tabletImg: 'none',
      mobileImg: 'none'
    });
    const tpl = makeTemplateJson({
      sid,
      settings: {
        background_background: 'classic',
        background_image: { url: urlA, id: '' },
        _css_classes: `e-sid-${cleanSid}`
      },
      atomicRules: [
        `@media (max-width: 1024px) {\n  .e-sid-${cleanSid} {\n    background-image: none !important;\n  }\n}`
      ]
    });

    const audit = auditVerificationMatrix(gt, render, tpl);
    const defects = audit.defects.filter(d => d.nodeSid === sid && d.rule === 'RULE-SURFACE-01');
    assert.strictEqual(defects.length, 0, 'Must have zero RULE-SURFACE-01 defects for verified URL -> none -> none');
  });

  runTest('2.10. Positive: Verified scoped CSS transition URL -> none -> URL produces 0 defects', () => {
    const urlA = 'https://example.com/image-a.jpg';
    const sid = 'c_pos_none_url';
    const cleanSid = 'c_pos_none_url';
    const gt = make3VpGtImageSnapshot({
      sid,
      desktopImg: `url("${urlA}")`,
      tabletImg: 'none',
      mobileImg: `url("${urlA}")`
    });
    const render = makeRenderSnapshotMatching({
      sid,
      desktopImg: `url("${urlA}")`,
      tabletImg: 'none',
      mobileImg: `url("${urlA}")`
    });
    const tpl = makeTemplateJson({
      sid,
      settings: {
        background_background: 'classic',
        background_image: { url: urlA, id: '' },
        _css_classes: `e-sid-${cleanSid}`
      },
      atomicRules: [
        `@media (max-width: 1024px) {\n  .e-sid-${cleanSid} {\n    background-image: none !important;\n  }\n}`,
        `@media (max-width: 767px) {\n  .e-sid-${cleanSid} {\n    background-image: url("${urlA}") !important;\n  }\n}`
      ]
    });

    const audit = auditVerificationMatrix(gt, render, tpl);
    const defects = audit.defects.filter(d => d.nodeSid === sid && d.rule === 'RULE-SURFACE-01');
    assert.strictEqual(defects.length, 0, 'Must have zero RULE-SURFACE-01 defects for verified URL -> none -> URL');
  });

  runTest('2.11. Positive: Verified scoped CSS transition URL-A -> none -> URL-B produces 0 defects', () => {
    const urlA = 'https://example.com/image-a.jpg';
    const urlB = 'https://example.com/image-b.jpg';
    const sid = 'c_pos_diff_url';
    const cleanSid = 'c_pos_diff_url';
    const gt = make3VpGtImageSnapshot({
      sid,
      desktopImg: `url("${urlA}")`,
      tabletImg: 'none',
      mobileImg: `url("${urlB}")`
    });
    const render = makeRenderSnapshotMatching({
      sid,
      desktopImg: `url("${urlA}")`,
      tabletImg: 'none',
      mobileImg: `url("${urlB}")`
    });
    const tpl = makeTemplateJson({
      sid,
      settings: {
        background_background: 'classic',
        background_image: { url: urlA, id: '' },
        _css_classes: `e-sid-${cleanSid}`
      },
      atomicRules: [
        `@media (max-width: 1024px) {\n  .e-sid-${cleanSid} {\n    background-image: none !important;\n  }\n}`,
        `@media (max-width: 767px) {\n  .e-sid-${cleanSid} {\n    background-image: url("${urlB}") !important;\n  }\n}`
      ]
    });

    const audit = auditVerificationMatrix(gt, render, tpl);
    const defects = audit.defects.filter(d => d.nodeSid === sid && d.rule === 'RULE-SURFACE-01');
    assert.strictEqual(defects.length, 0, 'Must have zero RULE-SURFACE-01 defects for verified URL-A -> none -> URL-B');
  });

  runTest('2.12. Positive: Verified scoped CSS transition none -> URL -> none produces 0 defects', () => {
    const urlA = 'https://example.com/image-a.jpg';
    const sid = 'c_pos_none_url_none';
    const cleanSid = 'c_pos_none_url_none';
    const gt = make3VpGtImageSnapshot({
      sid,
      desktopImg: 'none',
      tabletImg: `url("${urlA}")`,
      mobileImg: 'none'
    });
    const render = makeRenderSnapshotMatching({
      sid,
      desktopImg: 'none',
      tabletImg: `url("${urlA}")`,
      mobileImg: 'none'
    });
    const tpl = makeTemplateJson({
      sid,
      settings: {
        _css_classes: `e-sid-${cleanSid}`
      },
      atomicRules: [
        `@media (max-width: 1024px) {\n  .e-sid-${cleanSid} {\n    background-image: url("${urlA}") !important;\n  }\n}`,
        `@media (max-width: 767px) {\n  .e-sid-${cleanSid} {\n    background-image: none !important;\n  }\n}`
      ]
    });

    const audit = auditVerificationMatrix(gt, render, tpl);
    const defects = audit.defects.filter(d => d.nodeSid === sid && d.rule === 'RULE-SURFACE-01');
    assert.strictEqual(defects.length, 0, 'Must have zero RULE-SURFACE-01 defects for verified none -> URL -> none');
  });

  runTest('2.13. Positive: Verified scoped CSS transition none -> URL -> URL produces 0 defects', () => {
    const urlA = 'https://example.com/image-a.jpg';
    const sid = 'c_pos_none_url_url';
    const cleanSid = 'c_pos_none_url_url';
    const gt = make3VpGtImageSnapshot({
      sid,
      desktopImg: 'none',
      tabletImg: `url("${urlA}")`,
      mobileImg: `url("${urlA}")`
    });
    const render = makeRenderSnapshotMatching({
      sid,
      desktopImg: 'none',
      tabletImg: `url("${urlA}")`,
      mobileImg: `url("${urlA}")`
    });
    const tpl = makeTemplateJson({
      sid,
      settings: {
        _css_classes: `e-sid-${cleanSid}`
      },
      atomicRules: [
        `@media (max-width: 1024px) {\n  .e-sid-${cleanSid} {\n    background-image: url("${urlA}") !important;\n  }\n}`
      ]
    });

    const audit = auditVerificationMatrix(gt, render, tpl);
    const defects = audit.defects.filter(d => d.nodeSid === sid && d.rule === 'RULE-SURFACE-01');
    assert.strictEqual(defects.length, 0, 'Must have zero RULE-SURFACE-01 defects for verified none -> URL -> URL');
  });

  runTest('2.14. Positive: Verified transition URL-A -> URL-B -> none produces 0 defects', () => {
    const urlA = 'https://example.com/image-a.jpg';
    const urlB = 'https://example.com/image-b.jpg';
    const sid = 'c_pos_url_url_none';
    const cleanSid = 'c_pos_url_url_none';
    const gt = make3VpGtImageSnapshot({
      sid,
      desktopImg: `url("${urlA}")`,
      tabletImg: `url("${urlB}")`,
      mobileImg: 'none'
    });
    const render = makeRenderSnapshotMatching({
      sid,
      desktopImg: `url("${urlA}")`,
      tabletImg: `url("${urlB}")`,
      mobileImg: 'none'
    });
    const tpl = makeTemplateJson({
      sid,
      settings: {
        background_background: 'classic',
        background_image: { url: urlA, id: '' },
        background_image_tablet: { url: urlB, id: '' },
        _css_classes: `e-sid-${cleanSid}`
      },
      atomicRules: [
        `@media (max-width: 767px) {\n  .e-sid-${cleanSid} {\n    background-image: none !important;\n  }\n}`
      ]
    });

    const audit = auditVerificationMatrix(gt, render, tpl);
    const defects = audit.defects.filter(d => d.nodeSid === sid && d.rule === 'RULE-SURFACE-01');
    assert.strictEqual(defects.length, 0, 'Must have zero RULE-SURFACE-01 defects for verified URL-A -> URL-B -> none');
  });

  runTest('2.15. Negative: Missing mobile re-apply rule when tablet has none reset flags HIGH defect', () => {
    const urlA = 'https://example.com/image-a.jpg';
    const sid = 'c_neg_missing_reapply';
    const cleanSid = 'c_neg_missing_reapply';
    const gt = make3VpGtImageSnapshot({
      sid,
      desktopImg: `url("${urlA}")`,
      tabletImg: 'none',
      mobileImg: `url("${urlA}")`
    });
    const render = makeRenderSnapshotMatching({
      sid,
      desktopImg: `url("${urlA}")`,
      tabletImg: 'none',
      mobileImg: `url("${urlA}")`
    });
    // Template has tablet none reset, but relies only on native mobile setting without scoped CSS rule
    const tpl = makeTemplateJson({
      sid,
      settings: {
        background_background: 'classic',
        background_image: { url: urlA, id: '' },
        background_image_mobile: { url: urlA, id: '' },
        _css_classes: `e-sid-${cleanSid}`
      },
      atomicRules: [
        `@media (max-width: 1024px) {\n  .e-sid-${cleanSid} {\n    background-image: none !important;\n  }\n}`
      ]
    });

    const audit = auditVerificationMatrix(gt, render, tpl);
    const defects = audit.defects.filter(d => d.nodeSid === sid && d.rule === 'RULE-SURFACE-01');
    const mobDefects = defects.filter(d => d.viewport === 'mobile');
    assert.strictEqual(mobDefects.length, 1, 'Must flag missing mobile scoped rule as HIGH defect');
    assert.strictEqual(mobDefects[0].severity, 'HIGH');
    assert(mobDefects[0].message.includes('tablet has active scoped "none !important" reset; mobile must explicitly re-apply image'));
  });

  runTest('2.16. Negative: Corrupted tablet render for URL -> none -> none flags HIGH defect', () => {
    const urlA = 'https://example.com/image-a.jpg';
    const sid = 'c_neg_corrupt_tab_render';
    const cleanSid = 'c_neg_corrupt_tab_render';
    const gt = make3VpGtImageSnapshot({
      sid,
      desktopImg: `url("${urlA}")`,
      tabletImg: 'none',
      mobileImg: 'none'
    });
    // Render snapshot has desktop image on tablet instead of none
    const render = makeRenderSnapshotMatching({
      sid,
      desktopImg: `url("${urlA}")`,
      tabletImg: `url("${urlA}")`,
      mobileImg: 'none'
    });
    const tpl = makeTemplateJson({
      sid,
      settings: {
        background_background: 'classic',
        background_image: { url: urlA, id: '' },
        _css_classes: `e-sid-${cleanSid}`
      },
      atomicRules: [
        `@media (max-width: 1024px) {\n  .e-sid-${cleanSid} {\n    background-image: none !important;\n  }\n}`
      ]
    });

    const audit = auditVerificationMatrix(gt, render, tpl);
    const defects = audit.defects.filter(d => d.nodeSid === sid && d.rule === 'RULE-SURFACE-01');
    const tabDefects = defects.filter(d => d.viewport === 'tablet');
    assert.strictEqual(tabDefects.length, 1, 'Must flag corrupted tablet render');
    assert.strictEqual(tabDefects[0].severity, 'HIGH');
    assert(tabDefects[0].message.includes('rendered with unexpected backgroundImage at tablet: expected "none"'));
  });

  let printedPrefixSidDefect = null;
  runTest('2.17. Negative: Prefix SID rule (.e-sid-foobar vs sid-foo) returns null and flags HIGH defect', () => {
    const urlA = 'https://example.com/hero.jpg';
    const sid = 'sid-foo';
    const gt = make3VpGtImageSnapshot({
      sid,
      desktopImg: `url("${urlA}")`,
      tabletImg: 'none',
      mobileImg: 'none'
    });
    const render = makeRenderSnapshotMatching({
      sid,
      desktopImg: `url("${urlA}")`,
      tabletImg: 'none',
      mobileImg: 'none'
    });
    // Template for sid-foo only has .e-sid-foobar rule
    const tpl = makeTemplateJson({
      sid,
      settings: {
        background_background: 'classic',
        background_image: { url: urlA, id: '' },
        _css_classes: 'e-sid-foobar'
      },
      atomicRules: [
        `@media (max-width: 1024px) {\n  .e-sid-foobar {\n    background-image: none !important;\n  }\n}`
      ]
    });

    const decl = findScopedImageCssDeclaration(tpl, sid, 'tablet');
    assert.strictEqual(decl, null, 'findScopedImageCssDeclaration must return null for prefix-only SID rule (.e-sid-foobar vs sid-foo)');

    const audit = auditVerificationMatrix(gt, render, tpl);
    const defects = audit.defects.filter(d => d.nodeSid === sid && d.rule === 'RULE-SURFACE-01');
    const tabDefects = defects.filter(d => d.viewport === 'tablet');
    assert.strictEqual(tabDefects.length, 1, 'Must flag missing scoped CSS route for sid-foo when only prefix rule exists');
    assert.strictEqual(tabDefects[0].severity, 'HIGH', 'Defect severity must be HIGH');
    printedPrefixSidDefect = tabDefects[0];
  });

  runTest('2.18. Positive: Exact SID rule (.e-sid-foo) produces 0 defects', () => {
    const urlA = 'https://example.com/hero.jpg';
    const sid = 'sid-foo';
    const gt = make3VpGtImageSnapshot({
      sid,
      desktopImg: `url("${urlA}")`,
      tabletImg: 'none',
      mobileImg: 'none'
    });
    const render = makeRenderSnapshotMatching({
      sid,
      desktopImg: `url("${urlA}")`,
      tabletImg: 'none',
      mobileImg: 'none'
    });
    const tpl = makeTemplateJson({
      sid,
      settings: {
        background_background: 'classic',
        background_image: { url: urlA, id: '' },
        _css_classes: 'e-sid-foo'
      },
      atomicRules: [
        `@media (max-width: 1024px) {\n  .e-sid-foo {\n    background-image: none !important;\n  }\n}`
      ]
    });

    const decl = findScopedImageCssDeclaration(tpl, sid, 'tablet');
    assert.ok(decl && decl.value === 'none' && decl.isImportant === true, 'Exact SID rule must be found');

    const audit = auditVerificationMatrix(gt, render, tpl);
    const defects = audit.defects.filter(d => d.nodeSid === sid && d.rule === 'RULE-SURFACE-01');
    assert.strictEqual(defects.length, 0, 'Exact SID rule must produce zero RULE-SURFACE-01 defects');
  });

  let printedCompoundMediaDefect = null;
  runTest('2.19. Negative: Non-applicable compound media query (@media (max-width: 1024px) and (min-width: 900px)) returns null for tablet/mobile and flags HIGH defect', () => {
    const urlA = 'https://example.com/hero.jpg';
    const sid = 'sid-foo';
    const gt = make3VpGtImageSnapshot({
      sid,
      desktopImg: `url("${urlA}")`,
      tabletImg: 'none',
      mobileImg: 'none'
    });
    // Render snapshot has desktop on desktop, and none on tablet/mobile
    const render = makeRenderSnapshotMatching({
      sid,
      desktopImg: `url("${urlA}")`,
      tabletImg: 'none',
      mobileImg: 'none'
    });
    // Template for sid-foo only has compound query @media (max-width: 1024px) and (min-width: 900px)
    const tpl = makeTemplateJson({
      sid,
      settings: {
        background_background: 'classic',
        background_image: { url: urlA, id: '' },
        _css_classes: 'e-sid-foo'
      },
      atomicRules: [
        `@media (max-width: 1024px) and (min-width: 900px) {\n  .e-sid-foo {\n    background-image: none !important;\n  }\n}`
      ]
    });

    const tabDecl = findScopedImageCssDeclaration(tpl, sid, 'tablet');
    assert.strictEqual(tabDecl, null, 'findScopedImageCssDeclaration must return null for tablet when media is compound (min-width: 900px)');

    const mobDecl = findScopedImageCssDeclaration(tpl, sid, 'mobile');
    assert.strictEqual(mobDecl, null, 'findScopedImageCssDeclaration must return null for mobile when media is compound');

    const audit = auditVerificationMatrix(gt, render, tpl);
    const defects = audit.defects.filter(d => d.nodeSid === sid && d.rule === 'RULE-SURFACE-01');
    const tabDefects = defects.filter(d => d.viewport === 'tablet');
    assert.strictEqual(tabDefects.length, 1, 'Matrix must flag HIGH RULE-SURFACE-01 defect on tablet because route does not apply to 768px');
    assert.strictEqual(tabDefects[0].severity, 'HIGH', 'Defect severity must be HIGH');
    printedCompoundMediaDefect = tabDefects[0];
  });

  runTest('2.20. Positive: Simple tablet media query (@media (max-width: 1024px)) is valid tablet route and cascades to mobile with 0 defects', () => {
    const urlA = 'https://example.com/hero.jpg';
    const sid = 'sid-foo';
    const gt = make3VpGtImageSnapshot({
      sid,
      desktopImg: `url("${urlA}")`,
      tabletImg: 'none',
      mobileImg: 'none'
    });
    const render = makeRenderSnapshotMatching({
      sid,
      desktopImg: `url("${urlA}")`,
      tabletImg: 'none',
      mobileImg: 'none'
    });
    const tpl = makeTemplateJson({
      sid,
      settings: {
        background_background: 'classic',
        background_image: { url: urlA, id: '' },
        _css_classes: 'e-sid-foo'
      },
      atomicRules: [
        `@media (max-width: 1024px) {\n  .e-sid-foo {\n    background-image: none !important;\n  }\n}`
      ]
    });

    const tabDecl = findScopedImageCssDeclaration(tpl, sid, 'tablet');
    assert.ok(tabDecl && tabDecl.value === 'none' && tabDecl.isImportant === true, 'Simple tablet media query must be a valid tablet route');

    const mobDecl = findScopedImageCssDeclaration(tpl, sid, 'mobile');
    assert.ok(mobDecl && mobDecl.value === 'none' && mobDecl.cascaded === true, 'Simple tablet media query must cascade to mobile');

    const audit = auditVerificationMatrix(gt, render, tpl);
    const defects = audit.defects.filter(d => d.nodeSid === sid && d.rule === 'RULE-SURFACE-01');
    assert.strictEqual(defects.length, 0, 'Simple tablet media query must produce zero RULE-SURFACE-01 defects');
  });

  runTest('2.21. Positive: Simple mobile media query (@media (max-width: 767px)) is valid mobile route with 0 defects', () => {
    const urlA = 'https://example.com/hero.jpg';
    const sid = 'sid-foo';
    const gt = make3VpGtImageSnapshot({
      sid,
      desktopImg: `url("${urlA}")`,
      tabletImg: `url("${urlA}")`,
      mobileImg: 'none'
    });
    const render = makeRenderSnapshotMatching({
      sid,
      desktopImg: `url("${urlA}")`,
      tabletImg: `url("${urlA}")`,
      mobileImg: 'none'
    });
    const tpl = makeTemplateJson({
      sid,
      settings: {
        background_background: 'classic',
        background_image: { url: urlA, id: '' },
        _css_classes: 'e-sid-foo'
      },
      atomicRules: [
        `@media (max-width: 767px) {\n  .e-sid-foo {\n    background-image: none !important;\n  }\n}`
      ]
    });

    const tabDecl = findScopedImageCssDeclaration(tpl, sid, 'tablet');
    assert.strictEqual(tabDecl, null, 'Tablet must not match mobile media query');

    const mobDecl = findScopedImageCssDeclaration(tpl, sid, 'mobile');
    assert.ok(mobDecl && mobDecl.value === 'none' && mobDecl.isImportant === true, 'Simple mobile media query must be a valid mobile route');

    const audit = auditVerificationMatrix(gt, render, tpl);
    const defects = audit.defects.filter(d => d.nodeSid === sid && d.rule === 'RULE-SURFACE-01');
    assert.strictEqual(defects.length, 0, 'Simple mobile media query must produce zero RULE-SURFACE-01 defects');
  });

  // ---------------------------------------------------------------------------
  // Real Headless Chromium Fixture
  // ---------------------------------------------------------------------------
  console.log('\n▶ [SECTION 3] Real Headless Chromium Fixture with Media Queries (End-to-End)');

  await runAsyncTest('3.1. Real Chromium media-query fixture: GT capture -> compile -> virtual render -> render snapshot -> audit (A/B/A = 0 defects)', async () => {
    const fixtureHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { margin: 0; padding: 0; }
    .hero-container {
      background-color: rgb(15, 23, 42);
      background-image: url("https://images.unsplash.com/photo-1579546929518-9e396f3cc809");
      background-size: cover;
      background-position: 50% 50%;
      background-repeat: no-repeat;
      min-height: 300px;
    }
    @media (max-width: 1024px) {
      .hero-container {
        background-image: url("https://images.unsplash.com/photo-1557683316-973673baf926");
      }
    }
    @media (max-width: 767px) {
      .hero-container {
        background-image: url("https://images.unsplash.com/photo-1579546929518-9e396f3cc809");
      }
    }
  </style>
</head>
<body>
  <div class="hero-container" id="real-hero-box">
    <h2>Parity Test</h2>
  </div>
</body>
</html>`;

    console.log('    • Step 1: Capturing real GT snapshot with Headless Chromium across 3 viewports...');
    const gtSnapshot = await captureGroundTruth(fixtureHtml, { cache: false });
    const heroNode = Object.values(gtSnapshot.viewports.desktop.flat).find(n => n.id === 'real-hero-box');
    assert(heroNode, 'GT hero node must exist');
    const sid = heroNode.sid;

    const deskGtImg = gtSnapshot.viewports.desktop.flat[sid].styles.backgroundImage;
    const tabGtImg = gtSnapshot.viewports.tablet.flat[sid].styles.backgroundImage;
    const mobGtImg = gtSnapshot.viewports.mobile.flat[sid].styles.backgroundImage;

    console.log(`      [GT Desktop] ${deskGtImg}`);
    console.log(`      [GT Tablet]  ${tabGtImg}`);
    console.log(`      [GT Mobile]  ${mobGtImg}`);

    console.log('    • Step 2: Compiling HTML to Elementor template...');
    const compileResult = await compileHtmlToElementor(fixtureHtml, {
      offline: true,
      useAi: false,
      inspect: false,
      probeBehavior: false,
      behaviorTraces: [],
      captureGroundTruth: async () => gtSnapshot
    });

    const allNodes = [];
    function walk(n) {
      if (!n) return;
      allNodes.push(n);
      if (n.elements) for (const c of n.elements) walk(c);
    }
    for (const r of compileResult.templateJson.content || []) walk(r);
    const compiledHero = allNodes.find(n => n._sid === sid);
    assert(compiledHero, 'Compiled hero container must exist in templateJson');

    const s = compiledHero.settings;
    console.log('      Emitted Elementor Settings:');
    console.log(`      - background_image:        ${JSON.stringify(s.background_image)}`);
    console.log(`      - background_image_tablet: ${JSON.stringify(s.background_image_tablet)}`);
    console.log(`      - background_image_mobile: ${JSON.stringify(s.background_image_mobile)}`);

    assert.strictEqual(s.background_image?.url, 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809');
    assert.strictEqual(s.background_image_tablet?.url, 'https://images.unsplash.com/photo-1557683316-973673baf926');
    assert.strictEqual(s.background_image_mobile?.url, 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809');

    console.log('    • Step 3: Rendering Elementor template to HTML...');
    const previewHtml = renderElementorToHtml(compileResult.templateJson);

    console.log('    • Step 4: Capturing render snapshot across 3 viewports with Chromium...');
    const renderSnapshot = await captureRenderSnapshot(previewHtml);

    const deskRnImg = renderSnapshot.viewports.desktop.flat[sid].styles.backgroundImage;
    const tabRnImg = renderSnapshot.viewports.tablet.flat[sid].styles.backgroundImage;
    const mobRnImg = renderSnapshot.viewports.mobile.flat[sid].styles.backgroundImage;

    console.log(`      [Render Desktop] ${deskRnImg}`);
    console.log(`      [Render Tablet]  ${tabRnImg}`);
    console.log(`      [Render Mobile]  ${mobRnImg}`);

    assert.strictEqual(deskRnImg, deskGtImg, 'Desktop render must match GT');
    assert.strictEqual(tabRnImg, tabGtImg, 'Tablet render must match GT');
    assert.strictEqual(mobRnImg, mobGtImg, 'Mobile render must match GT');

    console.log('    • Step 5: Running auditVerificationMatrix on real render snapshot...');
    const auditReport = auditVerificationMatrix(gtSnapshot, renderSnapshot, compileResult.templateJson);

    const surfaceDefects = auditReport.defects.filter(d => d.nodeSid === sid && d.rule === 'RULE-SURFACE-01');
    const geometryDefects = auditReport.defects.filter(d => d.nodeSid === sid && d.rule === 'RULE-SURFACE-02');

    console.log(`      - RULE-SURFACE-01 defects: ${surfaceDefects.length}`);
    console.log(`      - RULE-SURFACE-02 defects: ${geometryDefects.length}`);

    assert.strictEqual(surfaceDefects.length, 0, 'Real Chromium A/B/A fixture must have exactly 0 RULE-SURFACE-01 defects across all 3 viewports');
    assert.strictEqual(geometryDefects.length, 0, 'Real Chromium A/B/A fixture must have exactly 0 RULE-SURFACE-02 defects across all 3 viewports');
  });

  await runAsyncTest('3.2. Real Chromium media-query fixture: URL -> none -> URL (real GT -> compile -> preview -> Chromium render -> 0 defects)', async () => {
    const fixtureHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { margin: 0; padding: 0; }
    .hero-none-url {
      background-color: rgb(15, 23, 42);
      background-image: url("https://images.unsplash.com/photo-1579546929518-9e396f3cc809");
      background-size: cover;
      background-position: 50% 50%;
      background-repeat: no-repeat;
      min-height: 300px;
    }
    @media (max-width: 1024px) {
      .hero-none-url {
        background-image: none;
      }
    }
    @media (max-width: 767px) {
      .hero-none-url {
        background-image: url("https://images.unsplash.com/photo-1557683316-973673baf926");
      }
    }
  </style>
</head>
<body>
  <div class="hero-none-url" id="real-hero-none-url">
    <h2>URL to None to URL</h2>
  </div>
</body>
</html>`;

    const gtSnapshot = await captureGroundTruth(fixtureHtml, { cache: false });
    const heroNode = Object.values(gtSnapshot.viewports.desktop.flat).find(n => n.id === 'real-hero-none-url');
    assert(heroNode, 'GT hero node must exist');
    const sid = heroNode.sid;

    const deskGtImg = gtSnapshot.viewports.desktop.flat[sid].styles.backgroundImage;
    const tabGtImg = gtSnapshot.viewports.tablet.flat[sid].styles.backgroundImage;
    const mobGtImg = gtSnapshot.viewports.mobile.flat[sid].styles.backgroundImage;

    assert.ok(deskGtImg.includes('photo-1579546929518-9e396f3cc809'));
    assert.strictEqual(tabGtImg, 'none');
    assert.ok(mobGtImg.includes('photo-1557683316-973673baf926'));

    const compileResult = await compileHtmlToElementor(fixtureHtml, {
      offline: true,
      useAi: false,
      inspect: false,
      probeBehavior: false,
      behaviorTraces: [],
      captureGroundTruth: async () => gtSnapshot
    });

    const previewHtml = renderElementorToHtml(compileResult.templateJson);
    const renderSnapshot = await captureRenderSnapshot(previewHtml);

    const deskRnImg = renderSnapshot.viewports.desktop.flat[sid].styles.backgroundImage;
    const tabRnImg = renderSnapshot.viewports.tablet.flat[sid].styles.backgroundImage;
    const mobRnImg = renderSnapshot.viewports.mobile.flat[sid].styles.backgroundImage;

    assert.strictEqual(deskRnImg, deskGtImg, 'Desktop render must match GT');
    assert.strictEqual(tabRnImg, 'none', 'Tablet render must be none');
    assert.strictEqual(mobRnImg, mobGtImg, 'Mobile render must match GT URL');

    const auditReport = auditVerificationMatrix(gtSnapshot, renderSnapshot, compileResult.templateJson);
    const surfaceDefects = auditReport.defects.filter(d => d.nodeSid === sid && d.rule === 'RULE-SURFACE-01');

    assert.strictEqual(surfaceDefects.length, 0, 'Real Chromium URL -> none -> URL fixture must have exactly 0 RULE-SURFACE-01 defects');
  });

  await runAsyncTest('3.3. Real Chromium media-query fixture: none -> URL -> none (real GT -> compile -> preview -> Chromium render -> 0 defects)', async () => {
    const fixtureHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { margin: 0; padding: 0; }
    .hero-tab-only {
      background-color: rgb(30, 41, 59);
      background-image: none;
      min-height: 250px;
    }
    @media (max-width: 1024px) {
      .hero-tab-only {
        background-image: url("https://images.unsplash.com/photo-1579546929518-9e396f3cc809");
      }
    }
    @media (max-width: 767px) {
      .hero-tab-only {
        background-image: none;
      }
    }
  </style>
</head>
<body>
  <div class="hero-tab-only" id="real-hero-tab-only">
    <h2>None to URL to None</h2>
  </div>
</body>
</html>`;

    const gtSnapshot = await captureGroundTruth(fixtureHtml, { cache: false });
    const heroNode = Object.values(gtSnapshot.viewports.desktop.flat).find(n => n.id === 'real-hero-tab-only');
    assert(heroNode, 'GT hero node must exist');
    const sid = heroNode.sid;

    const deskGtImg = gtSnapshot.viewports.desktop.flat[sid].styles.backgroundImage;
    const tabGtImg = gtSnapshot.viewports.tablet.flat[sid].styles.backgroundImage;
    const mobGtImg = gtSnapshot.viewports.mobile.flat[sid].styles.backgroundImage;

    assert.strictEqual(deskGtImg, 'none');
    assert.ok(tabGtImg.includes('photo-1579546929518-9e396f3cc809'));
    assert.strictEqual(mobGtImg, 'none');

    const compileResult = await compileHtmlToElementor(fixtureHtml, {
      offline: true,
      useAi: false,
      inspect: false,
      probeBehavior: false,
      behaviorTraces: [],
      captureGroundTruth: async () => gtSnapshot
    });

    const previewHtml = renderElementorToHtml(compileResult.templateJson);
    const renderSnapshot = await captureRenderSnapshot(previewHtml);

    const deskRnImg = renderSnapshot.viewports.desktop.flat[sid].styles.backgroundImage;
    const tabRnImg = renderSnapshot.viewports.tablet.flat[sid].styles.backgroundImage;
    const mobRnImg = renderSnapshot.viewports.mobile.flat[sid].styles.backgroundImage;

    assert.strictEqual(deskRnImg, 'none', 'Desktop render must be none');
    assert.strictEqual(tabRnImg, tabGtImg, 'Tablet render must match GT');
    assert.strictEqual(mobRnImg, 'none', 'Mobile render must be none');

    const auditReport = auditVerificationMatrix(gtSnapshot, renderSnapshot, compileResult.templateJson);
    const surfaceDefects = auditReport.defects.filter(d => d.nodeSid === sid && d.rule === 'RULE-SURFACE-01');

    assert.strictEqual(surfaceDefects.length, 0, 'Real Chromium none -> URL -> none fixture must have exactly 0 RULE-SURFACE-01 defects');
  });

  // ---------------------------------------------------------------------------
  // Print Required Defect JSON Records
  // ---------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log('ACTUAL DEFECT JSON RECORDS');
  console.log('========================================================================');

  console.log('\n[DEFECT 1] Missing Mobile Restore (Case A/B/A with missing mobile override):');
  console.log(JSON.stringify(printedMissingRestoreDefect, null, 2));

  console.log('\n[DEFECT 2] Unsafe Responsive Setting (javascript: URL):');
  console.log(JSON.stringify(printedUnsafeOverrideDefect, null, 2));

  console.log('\n[DEFECT 3] Unsupported Transition to "none":');
  console.log(JSON.stringify(printedNoneTransitionDefect, null, 2));

  console.log('\n[DEFECT 4] Prefix SID Selector Mismatch (.e-sid-foobar vs sid-foo):');
  console.log(JSON.stringify(printedPrefixSidDefect, null, 2));

  console.log('\n[DEFECT 5] Non-Applicable Compound Media Query Failure (@media (max-width: 1024px) and (min-width: 900px)):');
  console.log(JSON.stringify(printedCompoundMediaDefect, null, 2));

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log(`ALL ${passedTests}/${totalTests} AUDIT TESTS PASSED CLEANLY (100%)`);
  console.log('========================================================================');
})();

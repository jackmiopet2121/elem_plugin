/**
 * SYNTHETIC TEST M5: TYPOGRAPHY HIERARCHY GT DEFERENCE
 * 
 * Verifies:
 * 1. Settings-First Contract: When Ground Truth has computed fontSize on a node,
 *    settings use it VERBATIM (e.g. 20px), never overridden by hierarchy heuristics or decor formulas.
 * 2. Hierarchy Fill Only: detectTypographyHierarchy & resolveFontSizeWithDeference may ONLY
 *    fill missing sizes when GT computed fontSize is absent.
 * 3. Icon Widget Parity: Circular decor icon widgets (e.g. 48x48) with GT computed fontSize: 20px
 *    receive size: { unit: 'px', size: 20 } and typography_font_size: { unit: 'px', size: 20 },
 *    not the legacy heuristic decor.height * 0.45 = 22px.
 * 4. Virtual Renderer Parity: Emits exact font-size on .elementor-icon across desktop and
 *    responsive media queries without drift.
 * 5. Style Resolver Deference: resolveCssToElementorStyles only fills missing typography_font_size,
 *    never clobbering existing GT values.
 * 6. Verification Matrix Parity: 0 RULE-TYP-01 font size mismatch defects in headless Chromium.
 */
const assert = require('assert');
const path = require('path');
const { detectTypographyHierarchy, resolveFontSizeWithDeference } = require('../src/parser/font-detector');
const { compileGroundTruthToElementor } = require('../src/smart/geometry-mapper');
const { renderElementorToHtml } = require('../src/emulator/elementor-virtual-renderer');
const { auditVerificationMatrix } = require('../src/smart/verification-matrix');
const { createIconWidget } = require('../src/transformers/widget-transformer');
const { resolveCssToElementorStyles } = require('../src/normalizers/css-style-resolver');
const { createBrowserSession } = require('../src/inspector/headless-driver');

console.log('========================================================================');
console.log('  SYNTHETIC TEST M5: TYPOGRAPHY HIERARCHY GT DEFERENCE');
console.log('========================================================================\n');

(async () => {
  try {
    // -------------------------------------------------------------------
    // 1. Hierarchy Detection & Settings-First Deference Contract
    // -------------------------------------------------------------------
    console.log('▶ [1/5] Testing Hierarchy Detection & Deference Contract...');

    const sampleHtml = `
      <div class="hero">
        <h1>Heading Title</h1>
        <p>Body copy here</p>
      </div>
    `;
    const sampleCss = `
      h1 { font-family: 'Poppins', sans-serif; font-size: 36px; }
      p { font-family: 'Inter', sans-serif; font-size: 16px; }
    `;

    const hierarchy = detectTypographyHierarchy(sampleHtml, sampleCss);
    assert.strictEqual(hierarchy.headingFont, 'Poppins', 'Heading font must be Poppins');
    assert.strictEqual(hierarchy.bodyFont, 'Inter', 'Body font must be Inter');
    assert.ok(hierarchy.sizes, 'Hierarchy sizes must be extracted');
    assert.strictEqual(hierarchy.sizes.h1, 36, 'h1 size must be 36');

    // Case A: GT has computed fontSize (e.g. 20px) on an h1 -> GT MUST win verbatim!
    const gtWith20px = { fontSize: '20px' };
    const resolvedA = resolveFontSizeWithDeference(gtWith20px, hierarchy, 'h1');
    assert.strictEqual(resolvedA, 20, 'GT computed 20px MUST take precedence over hierarchy 36px!');

    // Case B: GT has NO computed fontSize -> hierarchy fills missing size
    const gtEmpty = {};
    const resolvedB = resolveFontSizeWithDeference(gtEmpty, hierarchy, 'h1');
    assert.strictEqual(resolvedB, 36, 'Hierarchy MUST fill missing size when GT has no fontSize');

    // Case C: GT computed size is valid 22px on body -> GT MUST win verbatim over body 16px
    const gtWith22px = { fontSize: '22px' };
    const resolvedC = resolveFontSizeWithDeference(gtWith22px, hierarchy, 'body');
    assert.strictEqual(resolvedC, 22, 'GT computed 22px MUST win verbatim over hierarchy body 16px');

    console.log('  ✔ Hierarchy detection fills missing sizes and strictly defers to GT computed fontSize verbatim.');

    // -------------------------------------------------------------------
    // 2. Icon Widget Geometric Mapping (GT fontSize 20px vs Decor 48px)
    // -------------------------------------------------------------------
    console.log('▶ [2/5] Testing Icon Widget Decor Mapping with GT fontSize Deference...');

    const ast = {
      tagName: 'div',
      className: 'wrapper',
      attributes: { 'data-sid': 'sid-wrapper' },
      children: [
        {
          tagName: 'div',
          className: 'badge-icon',
          attributes: { 'data-sid': 'sid-badge-star' },
          textContent: '★',
          children: []
        }
      ]
    };

    // Simulated 48x48 circular decor node with GT computed fontSize: 20px (1.25rem)
    const gtSnapshot = {
      viewports: {
        desktop: {
          width: 1440,
          flat: {
            'sid-wrapper': {
              sid: 'sid-wrapper',
              tag: 'div',
              rect: { x: 100, y: 100, w: 1200, h: 200 },
              styles: { display: 'flex', flexDirection: 'column' }
            },
            'sid-badge-star': {
              sid: 'sid-badge-star',
              tag: 'div',
              rect: { x: 100, y: 100, w: 48, h: 48 },
              styles: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '48px',
                height: '48px',
                borderTopLeftRadius: '50%',
                borderTopRightRadius: '50%',
                borderBottomRightRadius: '50%',
                borderBottomLeftRadius: '50%',
                backgroundColor: 'rgb(249, 250, 251)',
                color: 'rgb(17, 24, 39)',
                fontSize: '20px' // Exact GT computed font size!
              },
              directText: '★',
              fullText: '★',
              hasDirectText: true
            }
          }
        },
        tablet: {
          width: 768,
          flat: {
            'sid-wrapper': {
              sid: 'sid-wrapper',
              tag: 'div',
              rect: { x: 50, y: 50, w: 668, h: 200 },
              styles: { display: 'flex', flexDirection: 'column' }
            },
            'sid-badge-star': {
              sid: 'sid-badge-star',
              tag: 'div',
              rect: { x: 50, y: 50, w: 48, h: 48 },
              styles: {
                fontSize: '20px',
                borderTopLeftRadius: '50%',
                borderTopRightRadius: '50%',
                borderBottomRightRadius: '50%',
                borderBottomLeftRadius: '50%',
                backgroundColor: 'rgb(249, 250, 251)'
              }
            }
          }
        },
        mobile: {
          width: 375,
          flat: {
            'sid-wrapper': {
              sid: 'sid-wrapper',
              tag: 'div',
              rect: { x: 20, y: 20, w: 335, h: 200 },
              styles: { display: 'flex', flexDirection: 'column' }
            },
            'sid-badge-star': {
              sid: 'sid-badge-star',
              tag: 'div',
              rect: { x: 20, y: 20, w: 48, h: 48 },
              styles: {
                fontSize: '20px',
                borderTopLeftRadius: '50%',
                borderTopRightRadius: '50%',
                borderBottomRightRadius: '50%',
                borderBottomLeftRadius: '50%',
                backgroundColor: 'rgb(249, 250, 251)'
              }
            }
          }
        }
      }
    };

    const compiledElements = compileGroundTruthToElementor(ast, gtSnapshot);
    // Find icon widget inside compiled tree
    function findWidget(nodes, sid) {
      for (const n of nodes) {
        if (n._sid === sid || n.id === sid || n.settings?._sid === sid) return n;
        if (n.elements) {
          const found = findWidget(n.elements, sid);
          if (found) return found;
        }
      }
      return null;
    }

    const iconWidget = findWidget(compiledElements, 'sid-badge-star');

    assert.ok(iconWidget, 'Icon widget must be produced');
    assert.strictEqual(iconWidget.widgetType, 'icon', 'Widget type must be icon');

    // Assert: size MUST be 20px verbatim (NOT 48 * 0.45 = 22px!)
    const iconSize = iconWidget.settings.size;
    const typoSize = iconWidget.settings.typography_font_size;

    assert.ok(iconSize, 'iconWidget.settings.size must be defined');
    const actualIconSize = typeof iconSize === 'object' ? iconSize.size : iconSize;
    assert.strictEqual(actualIconSize, 20, `Expected icon size 20px verbatim from GT, got ${actualIconSize}px (decor.height * 0.45 was 22px!)`);

    assert.ok(typoSize, 'iconWidget.settings.typography_font_size must be defined');
    assert.strictEqual(typoSize.size, 20, `Expected typography_font_size 20px, got ${typoSize.size}px`);

    console.log('  ✔ Decor icon widget size mapped to 20px verbatim from GT (22px decor formula successfully killed).');

    // -------------------------------------------------------------------
    // 3. Virtual Renderer CSS Emission Parity
    // -------------------------------------------------------------------
    console.log('▶ [3/5] Testing Virtual Renderer Font Size CSS Output...');

    const renderedHtml = renderElementorToHtml({
      content: compiledElements
    });

    // Verify .elementor-icon has font-size: 20px
    assert(
      renderedHtml.includes('font-size: 20px;'),
      `Virtual renderer must emit 'font-size: 20px;' for .elementor-icon. Rendered snippet:\n${renderedHtml.slice(0, 800)}`
    );
    assert(
      !renderedHtml.includes('font-size: 22px;'),
      'CRITICAL: Virtual renderer emitted obsolete 22px font-size!'
    );

    console.log('  ✔ Virtual renderer correctly emits font-size: 20px; without 22px drift.');

    // -------------------------------------------------------------------
    // 4. CSS Style Resolver Missing-Only Fill
    // -------------------------------------------------------------------
    console.log('▶ [4/5] Testing CSS Style Resolver Non-Clobber Contract...');

    const existingWidget = {
      elType: 'widget',
      widgetType: 'heading',
      settings: {
        title: 'Title',
        typography_font_size: { unit: 'px', size: 28 } // Pre-set GT computed size
      }
    };

    const cssWithConflictingSize = `
      h2 { font-size: 20px; }
    `;

    resolveCssToElementorStyles([existingWidget], cssWithConflictingSize, hierarchy);

    assert.strictEqual(
      existingWidget.settings.typography_font_size.size,
      28,
      'resolveCssToElementorStyles must NEVER clobber an existing GT typography_font_size'
    );

    console.log('  ✔ Style resolver strictly preserves existing font sizes and only fills missing slots.');

    // -------------------------------------------------------------------
    // 5. Headless Chromium Verification Matrix (0 RULE-TYP-01 Defects)
    // -------------------------------------------------------------------
    console.log('▶ [5/5] Running Headless Chromium Verification Matrix...');

    const browserSession = await createBrowserSession();
    try {
      const matrixResult = await auditVerificationMatrix(
        { content: compiledElements },
        gtSnapshot,
        browserSession
      );

      const typoDefects = (matrixResult.defects || []).filter(
        d => (d.rule === 'RULE-TYP-01' || d.property === 'fontSize') &&
             ['sid-badge-star'].includes(d.nodeSid)
      );

      assert.strictEqual(
        typoDefects.length,
        0,
        `Expected 0 font-size defects on target node, got ${typoDefects.length}: ${JSON.stringify(typoDefects)}`
      );

      console.log(`  ✔ Headless Chromium audit: 0 font-size mismatch defects on sid-badge-star.`);
      console.log(`  ✔ Fidelity Score: ${matrixResult.fidelity ?? matrixResult.score}/100, Critical Defects: ${matrixResult.defectCounts?.CRITICAL || 0}`);
    } finally {
      await browserSession.close();
    }

    console.log('\n========================================================================');
    console.log('  ✔ SYNTHETIC TEST M5 PASSED (5/5 CHECKS GREEN)');
    console.log('========================================================================\n');
    process.exit(0);
  } catch (err) {
    console.error('\n✖ SYNTHETIC TEST M5 FAILED:', err);
    process.exit(1);
  }
})();

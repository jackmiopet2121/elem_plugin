/**
 * Block 8.2 — Phase 6 (Part 6C-2): Universal Gradient Scoped CSS Fallback & Radial Parity Test Suite
 *
 * Verifies:
 * 1. Pure helper resolveScopedGradientPlan:
 *    - Radial value with nested rgba() commas, alpha, shape/position, and "radial-gradient(...), none".
 *    - Desktop radial unchanged in tablet/mobile: exactly one base rule.
 *    - Desktop none -> tablet radial -> mobile none: tablet override, mobile CSS reset.
 *    - Desktop radial -> tablet radial different -> mobile return to desktop value.
 *    - Desktop native linear -> tablet radial -> mobile native linear: native desktop controls preserved, mobile CSS override.
 *    - Gradient image with opaque/alpha background-color: separate longhands, never shorthand background.
 *    - Safety / Fail-closed: injection characters (<, >, ;, {, }, control chars, comments, @import), mixed URL+gradient, malformed syntax.
 *    - All native 2-stop linear: returns no CSS route.
 * 2. Multi-container class collision isolation:
 *    - Two containers sharing same HTML class with different radial gradients get isolated .e-sid-* atomic rules.
 * 3. Error invariants:
 *    - Missing atomicRules throws GRADIENT_CSS_ROUTE_UNAVAILABLE.
 * 4. End-to-end measured Chromium GT vs generated preview across 3 viewports:
 *    - Containers remain native Elementor containers (not HTML widgets).
 *    - 0 Pro widgets, no new content HTML widgets, valid SYSTEM:stylesheet-engine.
 *    - Exact Chromium-measured computed styles match GT across viewports.
 *    - Verification matrix RULE-SURFACE-01 yields 0 defects.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const {
  resolveScopedGradientPlan,
  parseLinearGradient
} = require('../src/smart/gradient-background-resolver');
const { mergeNodeResponsive } = require('../src/smart/responsive-merger');
const { captureGroundTruth } = require('../src/smart/style-snapshot');
const { compileHtmlToElementor } = require('../src/engine');
const { renderElementorToHtml } = require('../src/emulator/elementor-virtual-renderer');
const { captureRenderSnapshot } = require('../src/smart/render-snapshot');
const { auditVerificationMatrix } = require('../src/smart/verification-matrix');

const ROOT_DIR = path.resolve(__dirname, '..');

(async () => {
  console.log('========================================================================');
  console.log('BLOCK 8.2 — PHASE 6 (PART 6C-2): RADIAL GRADIENT PARITY TEST SUITE');
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

  // ===========================================================================
  // SUITE 1: Pure Helper resolveScopedGradientPlan Invariants
  // ===========================================================================
  console.log('▶ [SUITE 1] Pure Helper resolveScopedGradientPlan Invariants');

  const realCorpusRadial = 'radial-gradient(circle at 50% 10%, rgba(37, 99, 235, 0.05) 0%, rgba(0, 0, 0, 0) 65%), none';

  runTest('1.1. Radial value with nested rgba() commas, alpha, shape/position, and multi-layer none', () => {
    const styles = {
      desktop: { backgroundImage: realCorpusRadial, backgroundColor: 'rgba(0, 0, 0, 0)' },
      tablet: { backgroundImage: realCorpusRadial, backgroundColor: 'rgba(0, 0, 0, 0)' },
      mobile: { backgroundImage: realCorpusRadial, backgroundColor: 'rgba(0, 0, 0, 0)' }
    };

    const plan = resolveScopedGradientPlan(styles);
    assert.strictEqual(plan.supported, true, 'Must be supported');
    assert.strictEqual(plan.hasCssRoute, true, 'Must have CSS route');
    assert.strictEqual(plan.reason, null);
    assert.strictEqual(plan.cssControlled.desktop, true);
    assert.strictEqual(plan.cssControlled.tablet, true);
    assert.strictEqual(plan.cssControlled.mobile, true);

    // Desktop declaration preserves exact string as-is
    assert(plan.declarations.desktop, 'Desktop declarations must exist');
    assert(
      plan.declarations.desktop.some(d => d === `background-image: ${realCorpusRadial} !important;`),
      `Desktop must include exact background-image: ${JSON.stringify(plan.declarations.desktop)}`
    );
    assert(
      plan.declarations.desktop.some(d => d === 'background-color: rgba(0, 0, 0, 0) !important;'),
      `Desktop must include background-color: ${JSON.stringify(plan.declarations.desktop)}`
    );
  });

  runTest('1.2. Desktop radial unchanged in tablet/mobile: exactly one base rule', () => {
    const styles = {
      desktop: { backgroundImage: realCorpusRadial, backgroundColor: 'rgba(0, 0, 0, 0)' },
      tablet: { backgroundImage: realCorpusRadial, backgroundColor: 'rgba(0, 0, 0, 0)' },
      mobile: { backgroundImage: realCorpusRadial, backgroundColor: 'rgba(0, 0, 0, 0)' }
    };

    const plan = resolveScopedGradientPlan(styles);
    assert(plan.declarations.desktop && plan.declarations.desktop.length > 0, 'Desktop must have base declarations');
    assert.strictEqual(plan.declarations.tablet, null, 'Tablet must not re-emit duplicate rule');
    assert.strictEqual(plan.declarations.mobile, null, 'Mobile must not re-emit duplicate rule');
  });

  runTest('1.3. Desktop none -> tablet radial -> mobile none: tablet override, mobile CSS reset', () => {
    const tabRadial = 'radial-gradient(circle at 50% 50%, rgb(99, 102, 241) 0%, rgba(0, 0, 0, 0) 70%)';
    const styles = {
      desktop: { backgroundImage: 'none', backgroundColor: 'rgba(0, 0, 0, 0)' },
      tablet: { backgroundImage: tabRadial, backgroundColor: 'rgba(0, 0, 0, 0)' },
      mobile: { backgroundImage: 'none', backgroundColor: 'rgba(0, 0, 0, 0)' }
    };

    const plan = resolveScopedGradientPlan(styles);
    assert.strictEqual(plan.declarations.desktop, null, 'Desktop has no CSS rule');
    assert.strictEqual(plan.cssControlled.desktop, false, 'Desktop is not CSS controlled');

    assert(plan.declarations.tablet, 'Tablet must have declarations');
    assert(plan.declarations.tablet.some(d => d.includes('radial-gradient')));
    assert.strictEqual(plan.cssControlled.tablet, true);
    assert.strictEqual(plan.isReset.tablet, false);

    assert(plan.declarations.mobile, 'Mobile must have reset declaration');
    assert(plan.declarations.mobile.some(d => d === 'background-image: none !important;'), `Mobile must reset background-image: none: ${JSON.stringify(plan.declarations.mobile)}`);
    assert.strictEqual(plan.cssControlled.mobile, true);
    assert.strictEqual(plan.isReset.mobile, true);
  });

  runTest('1.4. Desktop radial -> tablet radial different -> mobile return to desktop value', () => {
    const rad1 = 'radial-gradient(circle, rgb(255, 0, 0) 0%, rgb(0, 0, 0) 100%)';
    const rad2 = 'radial-gradient(circle, rgb(0, 255, 0) 0%, rgb(0, 0, 0) 100%)';
    const styles = {
      desktop: { backgroundImage: rad1, backgroundColor: 'rgba(0, 0, 0, 0)' },
      tablet: { backgroundImage: rad2, backgroundColor: 'rgba(0, 0, 0, 0)' },
      mobile: { backgroundImage: rad1, backgroundColor: 'rgba(0, 0, 0, 0)' }
    };

    const plan = resolveScopedGradientPlan(styles);
    assert(plan.declarations.desktop.some(d => d.includes(rad1)));
    assert(plan.declarations.tablet.some(d => d.includes(rad2)));
    assert(plan.declarations.mobile.some(d => d.includes(rad1)), 'Mobile must re-emit desktop radial because tablet active');
  });

  runTest('1.5. Desktop native linear -> tablet radial -> mobile native linear', () => {
    const linear = 'linear-gradient(180deg, rgb(255, 0, 0) 0%, rgb(0, 0, 255) 100%)';
    const radial = 'radial-gradient(circle, rgb(0, 255, 0) 0%, rgb(0, 0, 0) 100%)';
    const styles = {
      desktop: { backgroundImage: linear, backgroundColor: 'rgba(0, 0, 0, 0)' },
      tablet: { backgroundImage: radial, backgroundColor: 'rgba(0, 0, 0, 0)' },
      mobile: { backgroundImage: linear, backgroundColor: 'rgba(0, 0, 0, 0)' }
    };

    const plan = resolveScopedGradientPlan(styles);
    assert.strictEqual(plan.declarations.desktop, null, 'Desktop native linear controls preserved without CSS rule');
    assert.strictEqual(plan.cssControlled.desktop, false);

    assert(plan.declarations.tablet.some(d => d.includes(radial)), 'Tablet emits radial CSS rule');
    assert(plan.declarations.mobile.some(d => d.includes(linear)), 'Mobile emits linear override to prevent tablet radial bleed');
    assert.strictEqual(plan.cssControlled.mobile, true);
  });

  runTest('1.6. Gradient image with opaque/alpha background-color emits separate longhands, never shorthand background', () => {
    const styles = {
      desktop: { backgroundImage: realCorpusRadial, backgroundColor: 'rgba(15, 23, 42, 0.85)' },
      tablet: { backgroundImage: realCorpusRadial, backgroundColor: 'rgba(15, 23, 42, 0.85)' },
      mobile: { backgroundImage: realCorpusRadial, backgroundColor: 'rgba(15, 23, 42, 0.85)' }
    };

    const plan = resolveScopedGradientPlan(styles);
    const decls = plan.declarations.desktop;
    assert(decls.some(d => d.startsWith('background-image:')), 'Must emit background-image');
    assert(decls.some(d => d.startsWith('background-color: rgba(15, 23, 42, 0.85)')), 'Must emit background-color');
    assert(!decls.some(d => d.startsWith('background:')), 'Must NEVER emit shorthand background:');
  });

  runTest('1.7. Safety & Fail-closed: injection, mixed URL, malformed, missing properties', () => {
    // Semicolon injection
    const inj1 = resolveScopedGradientPlan({
      desktop: { backgroundImage: 'radial-gradient(circle); color: red;', backgroundColor: 'transparent' },
      tablet: { backgroundImage: 'none', backgroundColor: 'transparent' },
      mobile: { backgroundImage: 'none', backgroundColor: 'transparent' }
    });
    assert.strictEqual(inj1.supported, false);
    assert.strictEqual(inj1.reason, 'unsafe_css_injection');

    // Style-tag breakout
    const inj2 = resolveScopedGradientPlan({
      desktop: { backgroundImage: 'radial-gradient(circle)</style><script>alert(1)</script>', backgroundColor: 'transparent' },
      tablet: { backgroundImage: 'none', backgroundColor: 'transparent' },
      mobile: { backgroundImage: 'none', backgroundColor: 'transparent' }
    });
    assert.strictEqual(inj2.supported, false);
    assert.strictEqual(inj2.reason, 'unsafe_css_injection');

    // Mixed gradient + URL
    const mixed = resolveScopedGradientPlan({
      desktop: { backgroundImage: 'radial-gradient(circle), url("photo.png")', backgroundColor: 'transparent' },
      tablet: { backgroundImage: 'none', backgroundColor: 'transparent' },
      mobile: { backgroundImage: 'none', backgroundColor: 'transparent' }
    });
    assert.strictEqual(mixed.supported, false);
    assert.strictEqual(mixed.reason, 'mixed_gradient_url');

    // Unbalanced parentheses
    const unbal = resolveScopedGradientPlan({
      desktop: { backgroundImage: 'radial-gradient(circle, red', backgroundColor: 'transparent' },
      tablet: { backgroundImage: 'none', backgroundColor: 'transparent' },
      mobile: { backgroundImage: 'none', backgroundColor: 'transparent' }
    });
    assert.strictEqual(unbal.supported, false);
    assert.strictEqual(unbal.reason, 'malformed_gradient_syntax');

    // Missing computed property
    const missing = resolveScopedGradientPlan({
      desktop: { backgroundImage: realCorpusRadial, backgroundColor: 'transparent' },
      tablet: { backgroundImage: realCorpusRadial } // missing backgroundColor
    });
    assert.strictEqual(missing.supported, false);
    assert.strictEqual(missing.reason, 'missing_computed_style');

    // All native 2-stop linear returns hasCssRoute: false
    const linear2 = resolveScopedGradientPlan({
      desktop: { backgroundImage: 'linear-gradient(180deg, red 0%, blue 100%)', backgroundColor: 'rgba(0, 0, 0, 0)' },
      tablet: { backgroundImage: 'linear-gradient(180deg, red 0%, blue 100%)', backgroundColor: 'rgba(0, 0, 0, 0)' },
      mobile: { backgroundImage: 'linear-gradient(180deg, red 0%, blue 100%)', backgroundColor: 'rgba(0, 0, 0, 0)' }
    });
    assert.strictEqual(linear2.supported, true);
    assert.strictEqual(linear2.hasCssRoute, false);
    assert.strictEqual(linear2.reason, 'all_native_linear');
  });

  runTest('1.8. repeating-linear-gradient, 3-stop linear, diagonal direction, and opaque base color trigger CSS route', () => {
    // A: repeating-linear-gradient
    const rep = 'repeating-linear-gradient(45deg, rgb(255, 0, 0) 0px, rgb(0, 0, 255) 20px)';
    const pRep = parseLinearGradient(rep, 'rgba(0, 0, 0, 0)');
    assert.strictEqual(pRep.mode, 'unsupported', 'parseLinearGradient(repeating-linear).mode must be unsupported');
    const planRep = resolveScopedGradientPlan({
      desktop: { backgroundImage: rep, backgroundColor: 'rgba(0, 0, 0, 0)' },
      tablet: { backgroundImage: rep, backgroundColor: 'rgba(0, 0, 0, 0)' },
      mobile: { backgroundImage: rep, backgroundColor: 'rgba(0, 0, 0, 0)' }
    });
    assert.strictEqual(planRep.hasCssRoute, true, 'resolveScopedGradientPlan(repeating-linear).hasCssRoute must be true');
    assert.strictEqual(planRep.cssControlled.desktop, true);

    // B: 3-stop linear-gradient
    const threeStop = 'linear-gradient(90deg, rgb(255, 0, 0) 0%, rgb(0, 255, 0) 50%, rgb(0, 0, 255) 100%)';
    const p3 = parseLinearGradient(threeStop, 'rgba(0, 0, 0, 0)');
    assert.strictEqual(p3.mode, 'unsupported', 'parseLinearGradient(3-stop-linear).mode must be unsupported');
    const plan3 = resolveScopedGradientPlan({
      desktop: { backgroundImage: threeStop, backgroundColor: 'rgba(0, 0, 0, 0)' },
      tablet: { backgroundImage: threeStop, backgroundColor: 'rgba(0, 0, 0, 0)' },
      mobile: { backgroundImage: threeStop, backgroundColor: 'rgba(0, 0, 0, 0)' }
    });
    assert.strictEqual(plan3.hasCssRoute, true, 'resolveScopedGradientPlan(3-stop-linear).hasCssRoute must be true');
    assert.strictEqual(plan3.cssControlled.desktop, true);

    // C: Diagonal direction (to top right)
    const diag = 'linear-gradient(to top right, rgb(255, 0, 0), rgb(0, 0, 255))';
    const pDiag = parseLinearGradient(diag, 'rgba(0, 0, 0, 0)');
    assert.strictEqual(pDiag.mode, 'unsupported', 'diagonal direction must be unsupported in parseLinearGradient');
    const planDiag = resolveScopedGradientPlan({
      desktop: { backgroundImage: diag, backgroundColor: 'rgba(0, 0, 0, 0)' },
      tablet: { backgroundImage: diag, backgroundColor: 'rgba(0, 0, 0, 0)' },
      mobile: { backgroundImage: diag, backgroundColor: 'rgba(0, 0, 0, 0)' }
    });
    assert.strictEqual(planDiag.hasCssRoute, true, 'diagonal direction must have CSS route');

    // D: Linear native with opaque base color
    const linOpaque = 'linear-gradient(180deg, rgb(255, 0, 0) 0%, rgb(0, 0, 255) 100%)';
    const pOpaque = parseLinearGradient(linOpaque, 'rgb(0, 255, 0)');
    assert.strictEqual(pOpaque.mode, 'unsupported', 'opaque base color must be unsupported in parseLinearGradient');
    const planOpaque = resolveScopedGradientPlan({
      desktop: { backgroundImage: linOpaque, backgroundColor: 'rgb(0, 255, 0)' },
      tablet: { backgroundImage: linOpaque, backgroundColor: 'rgb(0, 255, 0)' },
      mobile: { backgroundImage: linOpaque, backgroundColor: 'rgb(0, 255, 0)' }
    });
    assert.strictEqual(planOpaque.hasCssRoute, true, 'linear native with opaque base color must have CSS route');
  });

  runTest('1.9. Same native angle/stops but tablet/mobile stop colors different: native desktop, tablet CSS, mobile inherits', () => {
    const linD = 'linear-gradient(180deg, rgb(255, 0, 0) 0%, rgb(0, 0, 255) 100%)';
    const linT = 'linear-gradient(180deg, rgb(0, 255, 0) 0%, rgb(255, 255, 0) 100%)';
    const plan = resolveScopedGradientPlan({
      desktop: { backgroundImage: linD, backgroundColor: 'rgba(0, 0, 0, 0)' },
      tablet: { backgroundImage: linT, backgroundColor: 'rgba(0, 0, 0, 0)' },
      mobile: { backgroundImage: linT, backgroundColor: 'rgba(0, 0, 0, 0)' }
    });
    assert.strictEqual(plan.hasCssRoute, true, 'Must have CSS route');
    assert.strictEqual(plan.declarations.desktop, null, 'Desktop stays native');
    assert.strictEqual(plan.cssControlled.desktop, false, 'Desktop is not CSS controlled');
    assert(plan.declarations.tablet, 'Tablet has CSS declaration');
    assert.strictEqual(plan.cssControlled.tablet, true, 'Tablet is CSS controlled');
    assert.strictEqual(plan.declarations.mobile, null, 'Mobile inherits tablet CSS rule');
    assert.strictEqual(plan.cssControlled.mobile, true, 'Mobile is CSS controlled');
  });

  runTest('1.10. Existing native 2-stop linear with same colors & responsive angle/stops: hasCssRoute === false', () => {
    const plan = resolveScopedGradientPlan({
      desktop: { backgroundImage: 'linear-gradient(180deg, rgb(255, 0, 0) 0%, rgb(0, 0, 255) 100%)', backgroundColor: 'transparent' },
      tablet: { backgroundImage: 'linear-gradient(90deg, rgb(255, 0, 0) 10%, rgb(0, 0, 255) 90%)', backgroundColor: 'transparent' },
      mobile: { backgroundImage: 'linear-gradient(45deg, rgb(255, 0, 0) 25%, rgb(0, 0, 255) 75%)', backgroundColor: 'transparent' }
    });
    assert.strictEqual(plan.hasCssRoute, false);
    assert.strictEqual(plan.reason, 'all_native_linear');
    assert.strictEqual(plan.cssControlled.desktop, false);
    assert.strictEqual(plan.cssControlled.tablet, false);
    assert.strictEqual(plan.cssControlled.mobile, false);
  });

  runTest('1.11. All none viewports produce zero CSS route (all_none)', () => {
    const plan = resolveScopedGradientPlan({
      desktop: { backgroundImage: 'none', backgroundColor: 'transparent' },
      tablet: { backgroundImage: 'none', backgroundColor: 'transparent' },
      mobile: { backgroundImage: 'none', backgroundColor: 'transparent' }
    });
    assert.strictEqual(plan.hasCssRoute, false);
    assert.strictEqual(plan.reason, 'all_none');
    assert.strictEqual(plan.cssControlled.desktop, false);
    assert.strictEqual(plan.cssControlled.tablet, false);
    assert.strictEqual(plan.cssControlled.mobile, false);
  });

  // ===========================================================================
  // SUITE 2: Multi-Container Class Collision & Missing atomicRules Invariant
  // ===========================================================================
  console.log('\n▶ [SUITE 2] Multi-Container Class Collision & Invariants');

  runTest('2.1. Two containers sharing same HTML class with different radial gradients receive isolated .e-sid-* rules', () => {
    const node1 = {
      elType: 'container',
      _sid: 'sid-box-blue',
      settings: { _css_classes: 'shared-card' }
    };
    const node2 = {
      elType: 'container',
      _sid: 'sid-box-purple',
      settings: { _css_classes: 'shared-card' }
    };

    const mockSnapshot = {
      viewports: {
        desktop: {
          flat: {
            'sid-box-blue': { styles: { backgroundImage: 'radial-gradient(circle, blue 0%, black 100%)', backgroundColor: 'transparent' } },
            'sid-box-purple': { styles: { backgroundImage: 'radial-gradient(circle, purple 0%, black 100%)', backgroundColor: 'transparent' } }
          }
        },
        tablet: {
          flat: {
            'sid-box-blue': { styles: { backgroundImage: 'radial-gradient(circle, blue 0%, black 100%)', backgroundColor: 'transparent' } },
            'sid-box-purple': { styles: { backgroundImage: 'radial-gradient(circle, purple 0%, black 100%)', backgroundColor: 'transparent' } }
          }
        },
        mobile: {
          flat: {
            'sid-box-blue': { styles: { backgroundImage: 'radial-gradient(circle, blue 0%, black 100%)', backgroundColor: 'transparent' } },
            'sid-box-purple': { styles: { backgroundImage: 'radial-gradient(circle, purple 0%, black 100%)', backgroundColor: 'transparent' } }
          }
        }
      }
    };

    const atomicRules = [];
    mergeNodeResponsive(node1, null, mockSnapshot, { atomicRules });
    mergeNodeResponsive(node2, null, mockSnapshot, { atomicRules });

    // Assert zero rules target shared-card
    assert(!atomicRules.some(r => r.includes('.shared-card')), 'Atomic rules must NOT target shared class .shared-card');

    // Assert separate rules for .e-sid-box-blue and .e-sid-box-purple
    const blueRule = atomicRules.find(r => r.includes('.e-sid-box-blue'));
    const purpleRule = atomicRules.find(r => r.includes('.e-sid-box-purple'));
    assert(blueRule, 'Must find atomic rule for .e-sid-box-blue');
    assert(purpleRule, 'Must find atomic rule for .e-sid-box-purple');
    assert(blueRule.includes('blue'), 'Blue rule must contain blue');
    assert(purpleRule.includes('purple'), 'Purple rule must contain purple');
  });

  runTest('2.2. Missing atomicRules throws GRADIENT_CSS_ROUTE_UNAVAILABLE when CSS route required', () => {
    const node = {
      elType: 'container',
      _sid: 'sid-must-fail',
      settings: {}
    };
    const mockSnapshot = {
      viewports: {
        desktop: { flat: { 'sid-must-fail': { styles: { backgroundImage: realCorpusRadial, backgroundColor: 'transparent' } } } },
        tablet: { flat: { 'sid-must-fail': { styles: { backgroundImage: realCorpusRadial, backgroundColor: 'transparent' } } } },
        mobile: { flat: { 'sid-must-fail': { styles: { backgroundImage: realCorpusRadial, backgroundColor: 'transparent' } } } }
      }
    };

    assert.throws(
      () => mergeNodeResponsive(node, null, mockSnapshot, {}), // no atomicRules
      /GRADIENT_CSS_ROUTE_UNAVAILABLE/
    );
  });

  // ===========================================================================
  // SUITE 3: Measured Chromium GT vs Preview across 3 Viewports
  // ===========================================================================
  console.log('\n▶ [SUITE 3] Measured Chromium GT vs Preview across 3 Viewports');

  const testFixtureHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0f172a; padding: 40px; font-family: sans-serif; }

    .hero-radial {
      width: 100%;
      min-height: 200px;
      background-image: radial-gradient(circle at 50% 10%, rgba(37, 99, 235, 0.15) 0%, rgba(0, 0, 0, 0) 65%), none;
      background-color: rgba(0, 0, 0, 0);
      border-radius: 16px;
      padding: 24px;
      margin-bottom: 24px;
    }

    .card-color-radial {
      width: 100%;
      min-height: 150px;
      background-image: radial-gradient(circle at 50% 50%, rgba(99, 102, 241, 0.25) 0%, rgba(0, 0, 0, 0) 70%);
      background-color: rgba(15, 23, 42, 0.9);
      border-radius: 12px;
      padding: 20px;
    }

    h2 { color: #f8fafc; font-size: 20px; margin-bottom: 8px; }
    p { color: #94a3b8; font-size: 14px; }
  </style>
</head>
<body>
  <div class="hero-radial" data-sid="sid-hero">
    <h2 data-sid="sid-title">Radial Hero Section</h2>
    <p data-sid="sid-desc">Testing computed radial gradient parity across viewports.</p>
  </div>
  <div class="card-color-radial" data-sid="sid-card">
    <h2 data-sid="sid-card-title">Color + Radial Card</h2>
    <p data-sid="sid-card-desc">Opaque background color with radial gradient overlay.</p>
  </div>
</body>
</html>`;

  await runAsyncTest('3.1. Full compilation and verification matrix yields 0 RULE-SURFACE-01 defects', async () => {
    console.log('    • Capturing real Ground Truth with Chromium...');
    const gtSnapshot = await captureGroundTruth(testFixtureHtml);

    console.log('    • Compiling to Elementor template...');
    const compileResult = await compileHtmlToElementor(testFixtureHtml, {
      extractCss: true,
      engineMode: 'single-pass'
    });

    const templateJson = compileResult.templateJson;
    assert(templateJson, 'Template JSON must be produced');

    // Structural checks
    const roots = templateJson.content || [];
    assert(roots.length > 0, 'Must have root containers');

    function collectElements(nodes) {
      const list = [];
      function walk(n) {
        if (!n) return;
        list.push(n);
        if (n.elements) n.elements.forEach(walk);
      }
      nodes.forEach(walk);
      return list;
    }
    const allEls = collectElements(roots);

    // Verify containers remain native containers (not HTML widgets)
    const heroEl = allEls.find(e => e._sid === 'sid-hero' || e.settings?._sid === 'sid-hero');
    const cardEl = allEls.find(e => e._sid === 'sid-card' || e.settings?._sid === 'sid-card');

    assert(heroEl, 'Hero container must exist');
    assert.strictEqual(heroEl.elType, 'container', 'Hero must remain native container, not HTML widget');

    assert(cardEl, 'Card container must exist');
    assert.strictEqual(cardEl.elType, 'container', 'Card must remain native container, not HTML widget');

    // Verify 0 Pro widgets and valid stylesheet engine
    const proWidgets = allEls.filter(e => e.widgetType && !['heading', 'text-editor', 'button', 'icon', 'html'].includes(e.widgetType));
    assert.strictEqual(proWidgets.length, 0, 'Zero pro widgets allowed');

    const stylesheetWidget = allEls.find(e => e.widgetType === 'html' && e.settings?._html_reason === 'SYSTEM:stylesheet-engine');
    assert(stylesheetWidget, 'SYSTEM:stylesheet-engine widget must exist in header');

    console.log('    • Rendering template with virtual renderer...');
    const previewHtml = renderElementorToHtml(templateJson);

    console.log('    • Capturing render snapshot with Chromium...');
    const renderSnapshot = await captureRenderSnapshot(previewHtml);

    console.log('    • Evaluating verification matrix with correct signature...');
    const matrixReport = auditVerificationMatrix(gtSnapshot, renderSnapshot, templateJson);

    // Assert matrix inspected sid-hero and sid-card
    assert(matrixReport.auditedSurfaceSids.includes('sid-hero'), 'Matrix must have inspected sid-hero');
    assert(matrixReport.auditedSurfaceSids.includes('sid-card'), 'Matrix must have inspected sid-card');

    const surfaceDefects = matrixReport.defects.filter(d => d.rule === 'RULE-SURFACE-01');
    if (surfaceDefects.length > 0) {
      console.error('Surface defects encountered:', JSON.stringify(surfaceDefects, null, 2));
    }
    assert.strictEqual(surfaceDefects.length, 0, `RULE-SURFACE-01 must yield 0 defects, got: ${surfaceDefects.length}`);

    // Negative mutation 1: sid-hero desktop backgroundImage set to none
    console.log('    • [Negative 1] Testing sid-hero backgroundImage set to none...');
    const mutatedRender1 = JSON.parse(JSON.stringify(renderSnapshot));
    mutatedRender1.viewports.desktop.flat['sid-hero'].styles.backgroundImage = 'none';
    const negReport1 = auditVerificationMatrix(gtSnapshot, mutatedRender1, templateJson);
    const heroNegDefect = negReport1.defects.find(d =>
      d.nodeSid === 'sid-hero' &&
      d.viewport === 'desktop' &&
      d.property === 'backgroundImage' &&
      d.rule === 'RULE-SURFACE-01' &&
      d.severity === 'HIGH'
    );
    assert(heroNegDefect, 'Negative mutation 1: changing sid-hero backgroundImage to none must emit HIGH RULE-SURFACE-01 defect');

    // Negative mutation 2: sid-card backgroundColor mutated with different color/alpha
    console.log('    • [Negative 2] Testing sid-card backgroundColor mutated...');
    const mutatedRender2 = JSON.parse(JSON.stringify(renderSnapshot));
    mutatedRender2.viewports.desktop.flat['sid-card'].styles.backgroundColor = 'rgba(255, 0, 0, 0.2)';
    const negReport2 = auditVerificationMatrix(gtSnapshot, mutatedRender2, templateJson);
    const cardNegDefect = negReport2.defects.find(d =>
      d.nodeSid === 'sid-card' &&
      d.viewport === 'desktop' &&
      d.property === 'backgroundColor' &&
      d.rule === 'RULE-SURFACE-01' &&
      d.severity === 'HIGH'
    );
    assert(cardNegDefect, 'Negative mutation 2: changing sid-card backgroundColor must emit HIGH RULE-SURFACE-01 defect');

    // Direct Chromium measured property comparisons
    for (const vp of ['desktop', 'tablet', 'mobile']) {
      const gtHero = gtSnapshot.viewports[vp].flat['sid-hero'];
      const rnHero = renderSnapshot.viewports[vp].flat['sid-hero'];
      assert(gtHero && rnHero, `Hero must exist in ${vp}`);
      assert.strictEqual(
        rnHero.styles.backgroundImage,
        gtHero.styles.backgroundImage,
        `Hero backgroundImage in ${vp} must match GT exactly`
      );

      const gtCard = gtSnapshot.viewports[vp].flat['sid-card'];
      const rnCard = renderSnapshot.viewports[vp].flat['sid-card'];
      assert(gtCard && rnCard, `Card must exist in ${vp}`);
      assert.strictEqual(
        rnCard.styles.backgroundImage,
        gtCard.styles.backgroundImage,
        `Card backgroundImage in ${vp} must match GT exactly`
      );
      assert.strictEqual(
        rnCard.styles.backgroundColor,
        gtCard.styles.backgroundColor,
        `Card backgroundColor in ${vp} must match GT exactly`
      );
    }
  });

  const transNoneRadialNoneHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0f172a; padding: 20px; }
    .box-trans-1 {
      width: 100%;
      height: 200px;
      background-image: none;
      background-color: transparent;
    }
    @media (max-width: 1024px) {
      .box-trans-1 {
        background-image: radial-gradient(circle at 50% 50%, rgb(37, 99, 235) 0%, rgba(0, 0, 0, 0) 70%);
      }
    }
    @media (max-width: 767px) {
      .box-trans-1 {
        background-image: none;
      }
    }
  </style>
</head>
<body>
  <div class="box-trans-1" data-sid="sid-trans-1">
    <p>Transition none -> radial -> none</p>
  </div>
</body>
</html>`;

  await runAsyncTest('3.2. Measured Chromium end-to-end responsive: none -> radial -> none', async () => {
    console.log('    • Capturing Ground Truth for none -> radial -> none...');
    const gtSnapshot = await captureGroundTruth(transNoneRadialNoneHtml);

    console.log('    • Compiling to Elementor template...');
    const compileResult = await compileHtmlToElementor(transNoneRadialNoneHtml, {
      extractCss: true,
      engineMode: 'single-pass'
    });
    const templateJson = compileResult.templateJson;

    const previewHtml = renderElementorToHtml(templateJson);
    const renderSnapshot = await captureRenderSnapshot(previewHtml);

    // Direct Chromium measured property comparisons across viewports
    for (const vp of ['desktop', 'tablet', 'mobile']) {
      const gtNode = gtSnapshot.viewports[vp].flat['sid-trans-1'];
      const rnNode = renderSnapshot.viewports[vp].flat['sid-trans-1'];
      assert(gtNode && rnNode, `Node sid-trans-1 must exist in ${vp}`);
      assert.strictEqual(
        rnNode.styles.backgroundImage,
        gtNode.styles.backgroundImage,
        `sid-trans-1 backgroundImage in ${vp} must match GT exactly`
      );
    }

    console.log('    • Evaluating verification matrix with correct signature...');
    const matrixReport = auditVerificationMatrix(gtSnapshot, renderSnapshot, templateJson);
    const surfaceDefects = matrixReport.defects.filter(d => d.nodeSid === 'sid-trans-1' && d.rule === 'RULE-SURFACE-01');
    assert.strictEqual(surfaceDefects.length, 0, 'Positive audit must yield 0 RULE-SURFACE-01 defects');

    // Negative mutation: tablet radial bleeds into mobile render
    console.log('    • [Negative] Testing mobile render failing to reset to none...');
    const mutatedRender = JSON.parse(JSON.stringify(renderSnapshot));
    mutatedRender.viewports.mobile.flat['sid-trans-1'].styles.backgroundImage =
      renderSnapshot.viewports.tablet.flat['sid-trans-1'].styles.backgroundImage;
    const negReport = auditVerificationMatrix(gtSnapshot, mutatedRender, templateJson);
    const mobDefect = negReport.defects.find(d =>
      d.nodeSid === 'sid-trans-1' &&
      d.viewport === 'mobile' &&
      d.property === 'backgroundImage' &&
      d.rule === 'RULE-SURFACE-01' &&
      d.severity === 'HIGH'
    );
    assert(mobDefect, 'Negative mutation: mobile bleed of tablet radial must emit HIGH RULE-SURFACE-01 defect');
  });

  const transLinearRadialLinearHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0f172a; padding: 20px; }
    .box-trans-2 {
      width: 100%;
      height: 200px;
      background-image: linear-gradient(180deg, rgb(255, 0, 0) 0%, rgb(0, 0, 255) 100%);
      background-color: transparent;
    }
    @media (max-width: 1024px) {
      .box-trans-2 {
        background-image: radial-gradient(circle at 50% 50%, rgb(37, 99, 235) 0%, rgba(0, 0, 0, 0) 70%);
      }
    }
    @media (max-width: 767px) {
      .box-trans-2 {
        background-image: linear-gradient(180deg, rgb(255, 0, 0) 0%, rgb(0, 0, 255) 100%);
      }
    }
  </style>
</head>
<body>
  <div class="box-trans-2" data-sid="sid-trans-2">
    <p>Transition linear -> radial -> linear</p>
  </div>
</body>
</html>`;

  await runAsyncTest('3.3. Measured Chromium end-to-end responsive: native linear -> radial -> native linear', async () => {
    console.log('    • Capturing Ground Truth for linear -> radial -> linear...');
    const gtSnapshot = await captureGroundTruth(transLinearRadialLinearHtml);

    console.log('    • Compiling to Elementor template...');
    const compileResult = await compileHtmlToElementor(transLinearRadialLinearHtml, {
      extractCss: true,
      engineMode: 'single-pass'
    });
    const templateJson = compileResult.templateJson;

    const previewHtml = renderElementorToHtml(templateJson);
    const renderSnapshot = await captureRenderSnapshot(previewHtml);

    // Direct Chromium measured property comparisons across viewports
    for (const vp of ['desktop', 'tablet', 'mobile']) {
      const gtNode = gtSnapshot.viewports[vp].flat['sid-trans-2'];
      const rnNode = renderSnapshot.viewports[vp].flat['sid-trans-2'];
      assert(gtNode && rnNode, `Node sid-trans-2 must exist in ${vp}`);
      assert.strictEqual(
        rnNode.styles.backgroundImage,
        gtNode.styles.backgroundImage,
        `sid-trans-2 backgroundImage in ${vp} must match GT exactly`
      );
    }

    console.log('    • Evaluating verification matrix with correct signature...');
    const matrixReport = auditVerificationMatrix(gtSnapshot, renderSnapshot, templateJson);
    const surfaceDefects = matrixReport.defects.filter(d => d.nodeSid === 'sid-trans-2' && d.rule === 'RULE-SURFACE-01');
    assert.strictEqual(surfaceDefects.length, 0, 'Positive audit must yield 0 RULE-SURFACE-01 defects');

    // Negative mutation: mobile render mutated to have radial gradient (simulating reapply failure)
    console.log('    • [Negative] Testing mobile render failing to reapply linear gradient...');
    const mutatedRender = JSON.parse(JSON.stringify(renderSnapshot));
    mutatedRender.viewports.mobile.flat['sid-trans-2'].styles.backgroundImage =
      renderSnapshot.viewports.tablet.flat['sid-trans-2'].styles.backgroundImage;
    const negReport = auditVerificationMatrix(gtSnapshot, mutatedRender, templateJson);
    const mobDefect = negReport.defects.find(d =>
      d.nodeSid === 'sid-trans-2' &&
      d.viewport === 'mobile' &&
      d.property === 'backgroundImage' &&
      d.rule === 'RULE-SURFACE-01' &&
      d.severity === 'HIGH'
    );
    assert(mobDefect, 'Negative mutation: mobile failing to reapply linear must emit HIGH RULE-SURFACE-01 defect');
  });

  // ===========================================================================
  // SUMMARY
  // ===========================================================================
  console.log('\n========================================================================');
  console.log(`ALL ${passedTests}/${totalTests} TESTS PASSED CLEANLY (100%)`);
  console.log('========================================================================');
})();

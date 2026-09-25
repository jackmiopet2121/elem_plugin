/**
 * Block 8.2 — Phase 3: Exact Border-Radius Routing Test Suite.
 *
 * Verifies:
 * 1. Uniform 9999px button -> native Elementor border_radius 9999px, zero micro-CSS.
 * 2. Fractional asymmetric container (e.g. 12.5px 20px 8.25px 4px) -> exact native numbers, isLinked: false.
 * 3. 50% circular container -> native Elementor border_radius %.
 * 4. Mixed-unit and elliptical corners -> 4 scoped longhands with !important, no native radius, native element type preserved.
 * 5. Two siblings sharing same source class but different mixed radii -> different deterministic SID selectors (.e-sid-*).
 * 6. Simple button with border-radius: 0 -> native four zeros in mapper and final offline JSON, zero radius micro-CSS.
 *    Virtual renderer emits scoped border-radius: 0px 0px 0px 0px; to override 4px default.
 * 7. Square decor container (60x60, visible bg, computed radius zero) -> no native radius, no border-radius in decor atomic rule.
 * 8. Modern styleDictionary with empty corner value throws RADIUS_VALUE_INVALID with SID, viewport, property.
 * 9. Explicit error handling:
 *    - RADIUS_VALUE_UNSAFE thrown when ;, {, or } is injected.
 *    - RADIUS_CSS_ROUTE_UNAVAILABLE thrown when atomicRules is missing during CSS fallback.
 * 10. End-to-end compileHtmlToElementor offline compilation preserves native and scoped CSS radius.
 *    (NOTE: Offline compile validates JSON export and CSS scoping; it does not claim WP-live runtime parity).
 * 11. Phase 1 & 2 native color properties remain intact.
 */

const assert = require('assert');
const { resolveComputedRadius } = require('../src/smart/computed-radius-resolver');
const { captureGroundTruth } = require('../src/smart/style-snapshot');
const { parseHtmlToAst } = require('../src/parser/html-parser');
const { compileGroundTruthToElementor } = require('../src/smart/geometry-mapper');
const { compileHtmlToElementor } = require('../src/engine');
const { renderElementorToHtml } = require('../src/emulator/elementor-virtual-renderer');
const { resolveElementSelector } = require('../src/smart/semantic-scoper');

(async () => {
  console.log('========================================================================');
  console.log('BLOCK 8.2 — PHASE 3: EXACT BORDER-RADIUS ROUTING');
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

  // ---------------------------------------------------------------------------
  // Suite 1: resolveComputedRadius Unit Tests & Error Boundaries
  // ---------------------------------------------------------------------------
  console.log('▶ [SUITE 1] resolveComputedRadius Unit Invariants');

  runTest('Returns mode: "none" when all 4 corners are 0px', () => {
    const fakeSnapshot = {
      viewports: {
        desktop: {
          styleDictionary: {
            ref0: {
              'border-top-left-radius': '0px',
              'border-top-right-radius': '0px',
              'border-bottom-right-radius': '0px',
              'border-bottom-left-radius': '0px'
            }
          }
        }
      }
    };
    const res = resolveComputedRadius({ computedStyleRef: 'ref0', sid: 'test-0' }, fakeSnapshot, 'desktop');
    assert.strictEqual(res.mode, 'none');
  });

  runTest('Returns native 9999px without Math.round, clamp, or conversion to 50%', () => {
    const fakeSnapshot = {
      viewports: {
        desktop: {
          styleDictionary: {
            ref1: {
              'border-top-left-radius': '9999px',
              'border-top-right-radius': '9999px',
              'border-bottom-right-radius': '9999px',
              'border-bottom-left-radius': '9999px'
            }
          }
        }
      }
    };
    const res = resolveComputedRadius({ computedStyleRef: 'ref1', sid: 'test-1' }, fakeSnapshot, 'desktop');
    assert.strictEqual(res.mode, 'native');
    assert.deepStrictEqual(res.setting, {
      unit: 'px',
      top: '9999',
      right: '9999',
      bottom: '9999',
      left: '9999',
      isLinked: true
    });
  });

  runTest('Returns native fractional asymmetric values without rounding', () => {
    const fakeSnapshot = {
      viewports: {
        desktop: {
          styleDictionary: {
            ref2: {
              'border-top-left-radius': '12.5px',
              'border-top-right-radius': '20px',
              'border-bottom-right-radius': '8.25px',
              'border-bottom-left-radius': '4px'
            }
          }
        }
      }
    };
    const res = resolveComputedRadius({ computedStyleRef: 'ref2', sid: 'test-2' }, fakeSnapshot, 'desktop');
    assert.strictEqual(res.mode, 'native');
    assert.deepStrictEqual(res.setting, {
      unit: 'px',
      top: '12.5',
      right: '20',
      bottom: '8.25',
      left: '4',
      isLinked: false
    });
  });

  runTest('Returns native percent setting for uniform 50%', () => {
    const fakeSnapshot = {
      viewports: {
        desktop: {
          styleDictionary: {
            ref3: {
              'border-top-left-radius': '50%',
              'border-top-right-radius': '50%',
              'border-bottom-right-radius': '50%',
              'border-bottom-left-radius': '50%'
            }
          }
        }
      }
    };
    const res = resolveComputedRadius({ computedStyleRef: 'ref3', sid: 'test-3' }, fakeSnapshot, 'desktop');
    assert.strictEqual(res.mode, 'native');
    assert.deepStrictEqual(res.setting, {
      unit: '%',
      top: '50',
      right: '50',
      bottom: '50',
      left: '50',
      isLinked: true
    });
  });

  runTest('Returns mode: "css" for mixed px and % units', () => {
    const fakeSnapshot = {
      viewports: {
        desktop: {
          styleDictionary: {
            ref4: {
              'border-top-left-radius': '16px',
              'border-top-right-radius': '5%',
              'border-bottom-right-radius': '16px',
              'border-bottom-left-radius': '5%'
            }
          }
        }
      }
    };
    const res = resolveComputedRadius({ computedStyleRef: 'ref4', sid: 'test-4' }, fakeSnapshot, 'desktop');
    assert.strictEqual(res.mode, 'css');
    assert.strictEqual(res.corners.topLeft, '16px');
    assert.strictEqual(res.corners.topRight, '5%');
    assert.strictEqual(res.corners.bottomRight, '16px');
    assert.strictEqual(res.corners.bottomLeft, '5%');
  });

  runTest('Returns mode: "css" for elliptical corners with two values', () => {
    const fakeSnapshot = {
      viewports: {
        desktop: {
          styleDictionary: {
            ref5: {
              'border-top-left-radius': '20px 10px',
              'border-top-right-radius': '20px 10px',
              'border-bottom-right-radius': '20px 10px',
              'border-bottom-left-radius': '20px 10px'
            }
          }
        }
      }
    };
    const res = resolveComputedRadius({ computedStyleRef: 'ref5', sid: 'test-5' }, fakeSnapshot, 'desktop');
    assert.strictEqual(res.mode, 'css');
    assert.strictEqual(res.corners.topLeft, '20px 10px');
  });

  runTest('Throws RADIUS_VALUE_INVALID on empty corner value in modern styleDictionary', () => {
    const emptyCornerSnapshot = {
      viewports: {
        desktop: {
          styleDictionary: {
            refEmpty: {
              'border-top-left-radius': '',
              'border-top-right-radius': '0px',
              'border-bottom-right-radius': '0px',
              'border-bottom-left-radius': '0px'
            }
          }
        }
      }
    };
    assert.throws(() => {
      resolveComputedRadius({ computedStyleRef: 'refEmpty', sid: 'empty-sid' }, emptyCornerSnapshot, 'desktop');
    }, (err) => {
      return (err.code === 'RADIUS_VALUE_INVALID' || err.reason === 'RADIUS_VALUE_INVALID') &&
             err.sid === 'empty-sid' &&
             err.viewport === 'desktop' &&
             err.property === 'border-top-left-radius';
    });
  });

  runTest('Throws RADIUS_VALUE_UNSAFE on semicolon or brace injection', () => {
    const unsafeSnapshot = {
      viewports: {
        desktop: {
          styleDictionary: {
            refBad: {
              'border-top-left-radius': '10px; background: red;',
              'border-top-right-radius': '10px',
              'border-bottom-right-radius': '10px',
              'border-bottom-left-radius': '10px'
            }
          }
        }
      }
    };
    assert.throws(() => {
      resolveComputedRadius({ computedStyleRef: 'refBad', sid: 'bad-sid' }, unsafeSnapshot, 'desktop');
    }, (err) => {
      return err.code === 'RADIUS_VALUE_UNSAFE' || err.reason === 'RADIUS_VALUE_UNSAFE';
    });
  });

  // ---------------------------------------------------------------------------
  // Suite 2: Synthetic Chromium Capture & Geometric Mapping
  // ---------------------------------------------------------------------------
  console.log('\n▶ [SUITE 2] Synthetic DOM Capture & Geometric Mapping');

  const syntheticHtml = `<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      margin: 0;
      padding: 30px;
      font-family: sans-serif;
    }
    .pill-button {
      background-color: #3b82f6;
      color: #ffffff;
      border-radius: 9999px;
      padding: 12px 28px;
      font-size: 16px;
      border: none;
      cursor: pointer;
      display: inline-block;
    }
    .zero-button {
      background-color: #ef4444;
      color: #ffffff;
      border-radius: 0px;
      padding: 10px 20px;
      border: none;
      cursor: pointer;
      display: inline-block;
    }
    .fractional-container {
      background-color: #f1f5f9;
      border-top-left-radius: 12.5px;
      border-top-right-radius: 20px;
      border-bottom-right-radius: 8.25px;
      border-bottom-left-radius: 4px;
      padding: 24px;
      margin-bottom: 24px;
    }
    .percent-container {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background-color: #10b981;
      margin-bottom: 24px;
    }
    .decor-square {
      width: 60px;
      height: 60px;
      background-color: #3b82f6;
      border-radius: 0px;
      margin-bottom: 24px;
    }
    .mixed-container {
      background-color: #fef3c7;
      border-top-left-radius: 25px;
      border-top-right-radius: 10%;
      border-bottom-right-radius: 25px;
      border-bottom-left-radius: 10%;
      padding: 20px;
      margin-bottom: 24px;
    }
    .elliptical-button {
      background-color: #8b5cf6;
      color: #ffffff;
      border-radius: 30px / 15px;
      padding: 10px 24px;
      border: none;
      display: inline-block;
    }
    .badge {
      display: inline-block;
      padding: 8px 16px;
      background-color: #e0e7ff;
      margin-right: 12px;
    }
    .badge-one {
      border-top-left-radius: 15px;
      border-top-right-radius: 8%;
      border-bottom-right-radius: 15px;
      border-bottom-left-radius: 8%;
    }
    .badge-two {
      border-top-left-radius: 8%;
      border-top-right-radius: 15px;
      border-bottom-right-radius: 8%;
      border-bottom-left-radius: 15px;
    }
  </style>
</head>
<body>
  <div id="wrapper">
    <button class="pill-button" id="btn-pill">Pill Button</button>
    <button class="zero-button" id="btn-zero">Zero Radius Button</button>
    <div class="fractional-container" id="con-frac">
      <p>Fractional container text</p>
    </div>
    <div class="percent-container" id="con-pct"></div>
    <div class="decor-square" id="con-decor-square"></div>
    <div class="mixed-container" id="con-mixed">
      <p>Mixed unit container text</p>
    </div>
    <button class="elliptical-button" id="btn-ellip">Elliptical Button</button>
    <div class="badge badge-one" id="sibling-badge-1"><span>Badge 1</span></div>
    <div class="badge badge-two" id="sibling-badge-2"><span>Badge 2</span></div>
  </div>
</body>
</html>`;

  console.log('  Capturing synthetic ground truth snapshot with headless Chromium...');
  const gtSnapshot = await captureGroundTruth(syntheticHtml, { cache: false });
  assert(gtSnapshot?.viewports?.desktop?.styleDictionary, 'Snapshot must include styleDictionary');

  const ast = parseHtmlToAst(gtSnapshot.annotatedHtml || syntheticHtml);
  const atomicRules = [];
  const compileOptions = { viewport: 'desktop', atomicRules };
  const content = compileGroundTruthToElementor(ast, gtSnapshot, compileOptions);
  const allElements = collectAllElements(content);

  const pillBtn = allElements.find(e => e.settings?._element_id === 'btn-pill');
  const zeroBtn = allElements.find(e => e.settings?._element_id === 'btn-zero');
  const fracCon = allElements.find(e => e.settings?._element_id === 'con-frac');
  const pctCon = allElements.find(e => e.settings?._element_id === 'con-pct');
  const decorSquare = allElements.find(e => e.settings?._element_id === 'con-decor-square');
  const mixedCon = allElements.find(e => e.settings?._element_id === 'con-mixed');
  const ellipBtn = allElements.find(e => e.settings?._element_id === 'btn-ellip');
  const badge1 = allElements.find(e => e.settings?._element_id === 'sibling-badge-1');
  const badge2 = allElements.find(e => e.settings?._element_id === 'sibling-badge-2');

  runTest('Uniform 9999px button maps to native border_radius 9999px without micro-CSS', () => {
    assert(pillBtn, 'Pill button element must exist');
    assert.strictEqual(pillBtn.widgetType, 'button');
    assert.strictEqual(pillBtn.settings.border_radius.unit, 'px');
    assert.strictEqual(pillBtn.settings.border_radius.top, '9999');
    assert.strictEqual(pillBtn.settings.border_radius.right, '9999');
    assert.strictEqual(pillBtn.settings.border_radius.bottom, '9999');
    assert.strictEqual(pillBtn.settings.border_radius.left, '9999');
    assert.strictEqual(pillBtn.settings.border_radius.isLinked, true);

    // Verify zero micro-CSS rule emitted for pillBtn in atomicRules
    const pillCleanSid = String(pillBtn.settings?._sid || '').replace(/^sid-/, '');
    const hasPillCss = atomicRules.some(r => r.includes(`e-sid-${pillCleanSid}`));
    assert.strictEqual(hasPillCss, false, 'Uniform 9999px button must emit zero micro-CSS rules');
  });

  runTest('Simple button with border-radius: 0 maps to native four zeros with zero micro-CSS', () => {
    assert(zeroBtn, 'Zero radius button element must exist');
    assert.strictEqual(zeroBtn.widgetType, 'button');
    assert.deepStrictEqual(zeroBtn.settings.border_radius, {
      unit: 'px',
      top: '0',
      right: '0',
      bottom: '0',
      left: '0',
      isLinked: true
    });

    const zeroCleanSid = String(zeroBtn.settings?._sid || '').replace(/^sid-/, '');
    const hasZeroCss = atomicRules.some(r => r.includes(`e-sid-${zeroCleanSid}`));
    assert.strictEqual(hasZeroCss, false, 'Zero radius button must emit zero micro-CSS rules');
  });

  runTest('Fractional asymmetric container maps to exact native values with isLinked: false', () => {
    assert(fracCon, 'Fractional container element must exist');
    assert.strictEqual(fracCon.elType, 'container');
    assert.strictEqual(fracCon.settings.border_radius.unit, 'px');
    assert.strictEqual(fracCon.settings.border_radius.top, '12.5');
    assert.strictEqual(fracCon.settings.border_radius.right, '20');
    assert.strictEqual(fracCon.settings.border_radius.bottom, '8.25');
    assert.strictEqual(fracCon.settings.border_radius.left, '4');
    assert.strictEqual(fracCon.settings.border_radius.isLinked, false);
  });

  runTest('50% container maps to native border_radius with unit "%"', () => {
    assert(pctCon, '50% container element must exist');
    assert.strictEqual(pctCon.elType, 'container');
    assert.strictEqual(pctCon.settings.border_radius.unit, '%');
    assert.strictEqual(pctCon.settings.border_radius.top, '50');
    assert.strictEqual(pctCon.settings.border_radius.right, '50');
    assert.strictEqual(pctCon.settings.border_radius.bottom, '50');
    assert.strictEqual(pctCon.settings.border_radius.left, '50');
    assert.strictEqual(pctCon.settings.border_radius.isLinked, true);
  });

  runTest('Square decor container 60x60 with computed radius zero has no native radius and zero radius in decor atomic rule', () => {
    assert(decorSquare, 'Square decor container element must exist');
    assert.strictEqual(decorSquare.elType, 'container');
    assert.strictEqual(decorSquare.settings.border_radius, undefined, 'Must omit native border_radius when four corners are zero');

    const squareCleanSid = String(decorSquare.settings?._sid || '').replace(/^sid-/, '');
    const matchingRule = atomicRules.find(r => r.includes(`.e-sid-${squareCleanSid}`) || r.includes('.decor-square'));
    assert(matchingRule, 'Decor square must have atomic rule for dimensions/background');
    assert(matchingRule.includes('width: 60px !important;'), 'Must have width rule');
    assert(matchingRule.includes('height: 60px !important;'), 'Must have height rule');
    assert(!matchingRule.includes('border-radius'), `Decor atomic rule must not contain border-radius: ${matchingRule}`);
  });

  runTest('Mixed unit container routes to scoped CSS fallback with 4 longhands', () => {
    assert(mixedCon, 'Mixed container element must exist');
    assert.strictEqual(mixedCon.elType, 'container');
    assert.strictEqual(mixedCon.settings.border_radius, undefined, 'Must not emit native border_radius in CSS mode');
    assert.strictEqual(mixedCon.settings._radius_route, 'css');

    // Verify 4 longhands with !important in atomicRules
    const cleanSid = String(mixedCon.settings?._sid || '').replace(/^sid-/, '');
    const matchingRule = atomicRules.find(r => r.includes(`.e-sid-${cleanSid}`));
    assert(matchingRule, `Must find atomic rule targeting .e-sid-${cleanSid}`);
    assert(matchingRule.includes('border-top-left-radius: 25px !important;'));
    assert(matchingRule.includes('border-top-right-radius: 10% !important;'));
    assert(matchingRule.includes('border-bottom-right-radius: 25px !important;'));
    assert(matchingRule.includes('border-bottom-left-radius: 10% !important;'));
  });

  runTest('Elliptical button routes to scoped CSS fallback with 4 longhands and button selector', () => {
    assert(ellipBtn, 'Elliptical button element must exist');
    assert.strictEqual(ellipBtn.widgetType, 'button');
    assert.strictEqual(ellipBtn.settings.border_radius, undefined, 'Must not emit native border_radius in CSS mode');
    assert.strictEqual(ellipBtn.settings._radius_route, 'css');

    // Verify selector .e-sid-${cleanSid} .elementor-button in atomicRules
    const cleanSid = String(ellipBtn.settings?._sid || '').replace(/^sid-/, '');
    const matchingRule = atomicRules.find(r => r.includes(`.e-sid-${cleanSid} .elementor-button`));
    assert(matchingRule, `Must find atomic rule targeting .e-sid-${cleanSid} .elementor-button`);
    assert(matchingRule.includes('border-top-left-radius: 30px 15px !important;'));
    assert(matchingRule.includes('border-top-right-radius: 30px 15px !important;'));
    assert(matchingRule.includes('border-bottom-right-radius: 30px 15px !important;'));
    assert(matchingRule.includes('border-bottom-left-radius: 30px 15px !important;'));
  });

  runTest('Siblings with same HTML class but different mixed radii receive distinct deterministic selectors', () => {
    assert(badge1 && badge2, 'Both sibling badges must exist');
    const cleanSid1 = String(badge1.settings?._sid || '').replace(/^sid-/, '');
    const cleanSid2 = String(badge2.settings?._sid || '').replace(/^sid-/, '');
    assert.notStrictEqual(cleanSid1, cleanSid2, 'SIDs must be distinct');

    const rule1 = atomicRules.find(r => r.includes(`.e-sid-${cleanSid1}`));
    const rule2 = atomicRules.find(r => r.includes(`.e-sid-${cleanSid2}`));
    assert(rule1, `Must find rule for badge 1 with .e-sid-${cleanSid1}`);
    assert(rule2, `Must find rule for badge 2 with .e-sid-${cleanSid2}`);
    assert.notStrictEqual(rule1, rule2, 'Rules must be distinct without collision');
  });

  runTest('Virtual renderer emits scoped border-radius: 0px 0px 0px 0px; for zero radius button to override 4px default', () => {
    const templateJson = {
      version: '0.4',
      title: 'Zero Radius Test',
      type: 'page',
      content: [zeroBtn]
    };
    const previewHtml = renderElementorToHtml(templateJson, { fonts: gtSnapshot.fonts });
    assert(previewHtml && previewHtml.length > 0, 'Virtual HTML preview must be generated');

    const expectedSelector = resolveElementSelector(zeroBtn);
    assert(expectedSelector, 'Must resolve selector for zero radius button');

    const styleMatch = previewHtml.match(/<style>([\s\S]*?)<\/style>/);
    assert(styleMatch, 'Preview HTML must include <style> block');
    const cssContent = styleMatch[1];

    const escapedSelector = expectedSelector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const btnRulePattern = new RegExp(`${escapedSelector}\\s*\\.elementor-button\\s*\\{[^}]*\\}`, 's');
    const btnRuleMatch = cssContent.match(btnRulePattern);
    assert(btnRuleMatch, `Must find scoped CSS rule for ${expectedSelector} .elementor-button in virtual HTML`);

    const matchedRuleText = btnRuleMatch[0];
    assert(matchedRuleText.includes('border-radius: 0px 0px 0px 0px;'), `Rule must contain border-radius: 0px 0px 0px 0px; but got: ${matchedRuleText}`);
  });

  // ---------------------------------------------------------------------------
  // Suite 3: Missing atomicRules Error Invariant
  // ---------------------------------------------------------------------------
  console.log('\n▶ [SUITE 3] Error Invariants: Missing atomicRules in CSS Route');

  runTest('Throws RADIUS_CSS_ROUTE_UNAVAILABLE when atomicRules is missing during CSS fallback', () => {
    const invalidOptions = { viewport: 'desktop', atomicRules: null };
    assert.throws(() => {
      compileGroundTruthToElementor(ast, gtSnapshot, invalidOptions);
    }, (err) => {
      return err.code === 'RADIUS_CSS_ROUTE_UNAVAILABLE' || err.reason === 'RADIUS_CSS_ROUTE_UNAVAILABLE';
    });
  });

  // ---------------------------------------------------------------------------
  // Suite 4: Offline Compilation Parity & Embedded Stylesheet
  // ---------------------------------------------------------------------------
  console.log('\n▶ [SUITE 4] End-to-End Offline Compilation Test');

  await runAsyncTest('compileHtmlToElementor preserves native and scoped CSS radius offline', async () => {
    // NOTE: This offline compilation test validates JSON export and CSS scoping; it does not claim WP-live runtime parity.
    const result = await compileHtmlToElementor(syntheticHtml, {
      offline: true,
      useAi: false,
      cache: false,
      inspect: false
    });

    assert(result?.templateJson, 'Template JSON must be produced');
    const elements = collectAllElements(result.templateJson.content);

    // Verify pill button preserved
    const btn = elements.find(e => e.settings?._element_id === 'btn-pill');
    assert(btn, 'Exported JSON must contain pill button');
    assert.strictEqual(btn.settings.border_radius.top, '9999');

    // Verify zero radius button preserved in final offline JSON
    const zeroBtnCompiled = elements.find(e => e.settings?._element_id === 'btn-zero');
    assert(zeroBtnCompiled, 'Exported JSON must contain zero radius button');
    assert.deepStrictEqual(zeroBtnCompiled.settings.border_radius, {
      unit: 'px',
      top: '0',
      right: '0',
      bottom: '0',
      left: '0',
      isLinked: true
    });

    // Verify embedded stylesheet engine contains the scoped atomic rules
    const styleWidget = elements.find(e => e.widgetType === 'html' && e.settings?._html_reason === 'SYSTEM:stylesheet-engine');
    assert(styleWidget, 'Embedded stylesheet engine widget must exist');
    const styleHtml = styleWidget.settings.html;
    assert(styleHtml.includes('border-top-left-radius: 25px !important;'), 'Embedded CSS must contain mixed container rule');
    assert(styleHtml.includes('border-top-left-radius: 30px 15px !important;'), 'Embedded CSS must contain elliptical button rule');
  });

  // ---------------------------------------------------------------------------
  // Suite 5: Phase 1 & 2 Native Colors Intact
  // ---------------------------------------------------------------------------
  console.log('\n▶ [SUITE 5] Native Color Invariants Maintained');

  runTest('Pill button and containers preserve raw computed background and text colors', () => {
    assert.strictEqual(pillBtn.settings.background_color, 'rgb(59, 130, 246)');
    assert.strictEqual(pillBtn.settings.button_text_color, 'rgb(255, 255, 255)');
    assert.strictEqual(zeroBtn.settings.background_color, 'rgb(239, 68, 68)');
    assert.strictEqual(zeroBtn.settings.button_text_color, 'rgb(255, 255, 255)');
    assert.strictEqual(fracCon.settings.background_color, 'rgb(241, 245, 249)');
    assert.strictEqual(pctCon.settings.background_color, 'rgb(16, 185, 129)');
    assert.strictEqual(mixedCon.settings.background_color, 'rgb(254, 243, 199)');
  });

  console.log('\n========================================================================');
  console.log(`✓ BLOCK 8.2 PHASE 3 VERIFICATION PASSED: ${passedTests}/${totalTests} TESTS PASSED (100%)`);
  console.log('========================================================================');
})().catch(err => {
  console.error('\n✖ BLOCK 8.2 PHASE 3 VERIFICATION FAILED:', err);
  process.exit(1);
});

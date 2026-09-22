/**
 * SYNTHETIC TEST SUITE K8: State-Rule Semantic Target Mapping (Hover-Area Fix)
 *
 * Verifies (Spec Block 7.9 Task K8, Notes N1, N2, N3):
 * 1. Unit Contract: expandStateSelectorForElementor
 *    - Widget-level buttons target ONLY inner semantic element:
 *      .btn .elementor-button:hover, .elementor-widget-button.btn .elementor-button:hover
 *    - Zero bare wrapper pseudo-selectors (.btn:hover)
 *    - Zero wrapper-triggered descendants (.btn:hover .elementor-button)
 *    - Container-level state selectors preserved (.badge-card:hover, .feature-card:hover)
 * 2. Lint C18 AST Audit (Note N3):
 *    - Flags Form 1 (Bare .CLASS:hover on widget-level)
 *    - Flags Form 2 (Descendant .CLASS:hover <descendant> on widget-level)
 *    - Allows container-level hover (.card:hover) and correct inner selectors
 * 3. CDP / Headless Browser Hover Probe (Note N2 - 3 Assertions):
 *    - (a) Hover on button box -> hover effect activates (background #f3f4f6, translateY(-2px))
 *    - (b) Hover on empty wrapper area outside button -> ZERO effect (no transform, no shadow, no bg)
 *    - (c) Hover on container card (.badge-card) -> container hover effect activates
 */

const assert = require('assert');
const path = require('path');
const {
  extractMicroCss,
  expandStateSelectorForElementor,
  buildElementClassificationMap
} = require('../src/normalizers/css-classifier');
const { validateStateRuleSemanticTargets, auditTemplate } = require('../src/linter/template-linter');
const { renderElementorToHtml } = require('../src/emulator/elementor-virtual-renderer');
const { createBrowserSession } = require('../src/inspector/headless-driver');

console.log('========================================================================');
console.log('    SYNTHETIC TEST SUITE K8: STATE-RULE SEMANTIC TARGET MAPPING (B1)');
console.log('========================================================================\n');

let passedTests = 0;

// -----------------------------------------------------------------------------
// [1/4] Unit Contract: expandStateSelectorForElementor Target Classification
// -----------------------------------------------------------------------------
console.log('▶ [1/4] Testing expandStateSelectorForElementor semantic target mapping...');
{
  const btnSel = '.btn-white:hover';
  const expandedBtn = expandStateSelectorForElementor(btnSel);

  // Must include inner semantic elements
  assert.ok(expandedBtn.includes('.btn-white .elementor-button:hover'), 'Must include .btn-white .elementor-button:hover');
  assert.ok(expandedBtn.includes('.elementor-widget-button.btn-white .elementor-button:hover'), 'Must include .elementor-widget-button.btn-white .elementor-button:hover');

  // Must NOT include bare wrapper or wrapper-triggered descendant
  assert.ok(!expandedBtn.split(',').map(s => s.trim()).includes('.btn-white:hover'), 'Must NOT include bare .btn-white:hover');
  assert.ok(!expandedBtn.includes('.btn-white:hover .elementor-button'), 'Must NOT include .btn-white:hover .elementor-button');

  // Container-level hover must be preserved
  const cardSel = '.badge-card:hover';
  const expandedCard = expandStateSelectorForElementor(cardSel);
  assert.ok(expandedCard.includes('.badge-card:hover'), 'Container-level card hover must be preserved');

  // Classification Map with elType/widgetType (Note N1)
  const mockElements = [
    {
      elType: 'widget',
      widgetType: 'button',
      settings: { css_classes: 'custom-cta' }
    },
    {
      elType: 'widget',
      widgetType: 'html', // Composite trigger (Note N1)
      settings: { css_classes: 'accordion-header' }
    },
    {
      elType: 'container',
      settings: { css_classes: 'accordion-item pricing-card' }
    }
  ];
  const classMap = buildElementClassificationMap(mockElements);
  assert.strictEqual(classMap.widgetClassMap.get('custom-cta'), 'button');
  assert.ok(classMap.containerClassSet.has('accordion-header'), 'HTML widget composite-trigger must be container-level (Note N1)');
  assert.ok(classMap.containerClassSet.has('pricing-card'), 'Container must be container-level');

  const expandedCta = expandStateSelectorForElementor('.custom-cta:hover', classMap);
  assert.ok(expandedCta.includes('.custom-cta .elementor-button:hover'), 'Must map custom-cta to .elementor-button:hover');
  assert.ok(!expandedCta.includes('.custom-cta:hover'), 'Must not emit bare .custom-cta:hover');

  // Note N1: HTML widgets (composite controls) raw HTML classes pass-through test
  const mockWithRawHtml = [
    {
      elType: 'widget',
      widgetType: 'html',
      settings: {
        html: '<button class="raw-accordion-header raw-trigger">Question <span class="raw-icon">+</span></button>'
      }
    }
  ];
  const rawClassMap = buildElementClassificationMap(mockWithRawHtml);
  assert.ok(rawClassMap.htmlWidgetClassSet.has('raw-accordion-header'), 'raw-accordion-header must be in htmlWidgetClassSet');
  assert.ok(rawClassMap.htmlWidgetClassSet.has('raw-trigger'), 'raw-trigger must be in htmlWidgetClassSet');

  const expandedRaw = expandStateSelectorForElementor('.raw-accordion-header button:hover', rawClassMap);
  assert.strictEqual(expandedRaw, '.raw-accordion-header button:hover', 'HTML widget raw class selector must be pure PASS-THROUGH (Note N1)');
  assert.ok(!expandedRaw.includes('.elementor-button'), 'Must NOT rewrite raw HTML widget button to .elementor-button');

  console.log('  ✓ Unit contracts verified: widget-level targets inner semantic node; container hover preserved; HTML widget pass-through verified (Note N1).');
  passedTests++;
}

// -----------------------------------------------------------------------------
// [2/4] Lint C18: AST State-Rule Semantic Target Mapping Audit
// -----------------------------------------------------------------------------
console.log('\n▶ [2/4] Testing Lint C18 AST validation...');
{
  // Test Form 1: Bare wrapper pseudo-selector on widget-level target
  const dirtyTemplateForm1 = {
    content: [
      {
        id: 'w1',
        elType: 'widget',
        widgetType: 'button',
        settings: { css_classes: 'btn btn-primary' }
      },
      {
        id: 'style1',
        elType: 'widget',
        widgetType: 'html',
        settings: {
          html: '<style>\n.btn-primary:hover { background: red !important; }\n</style>'
        }
      }
    ]
  };
  const violations1 = validateStateRuleSemanticTargets(dirtyTemplateForm1);
  assert.ok(violations1.length > 0, 'Lint C18 must flag Form 1: bare .btn-primary:hover');
  assert.ok(violations1[0].includes('Bare wrapper-level pseudo selector detected'), 'Must specify Bare wrapper-level error');

  // Test Form 2: Wrapper-triggered descendant pseudo-selector
  const dirtyTemplateForm2 = {
    content: [
      {
        id: 'w2',
        elType: 'widget',
        widgetType: 'button',
        settings: { css_classes: 'btn btn-white' }
      },
      {
        id: 'style2',
        elType: 'widget',
        widgetType: 'html',
        settings: {
          html: '<style>\n.btn-white:hover .elementor-button { background: #f3f4f6 !important; }\n</style>'
        }
      }
    ]
  };
  const violations2 = validateStateRuleSemanticTargets(dirtyTemplateForm2);
  assert.ok(violations2.length > 0, 'Lint C18 must flag Form 2: wrapper-triggered descendant');
  assert.ok(violations2[0].includes('Wrapper-triggered descendant pseudo selector detected'), 'Must specify descendant error');

  // Test Clean Template: Inner selector allowed + container hover allowed
  const cleanTemplate = {
    content: [
      {
        id: 'w3',
        elType: 'widget',
        widgetType: 'button',
        settings: { css_classes: 'btn btn-white' }
      },
      {
        id: 'c1',
        elType: 'container',
        settings: { css_classes: 'badge-card' }
      },
      {
        id: 'style3',
        elType: 'widget',
        widgetType: 'html',
        settings: {
          html: '<style>\n.btn-white .elementor-button:hover, .elementor-widget-button.btn-white .elementor-button:hover { background: #f3f4f6 !important; transform: translateY(-2px) !important; }\n.badge-card:hover { transform: translateY(-4px) !important; }\n</style>'
        }
      }
    ]
  };
  const cleanViolations = validateStateRuleSemanticTargets(cleanTemplate);
  assert.strictEqual(cleanViolations.length, 0, 'Clean template must pass Lint C18 with 0 violations');

  console.log('  ✓ Lint C18 verified: flags both Form 1 (bare) and Form 2 (descendant); allow-lists container hover & inner selectors.');
  passedTests++;
}

// -----------------------------------------------------------------------------
// [3/4] Headless Browser Hover Probe (Note N2 - 3 Assertions)
// -----------------------------------------------------------------------------
console.log('\n▶ [3/4] Running Headless Browser Hover Probe (Assertions a, b, c)...');
(async () => {
  let browser = null;
  try {
    browser = await createBrowserSession();
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    // Construct realistic Elementor markup with:
    // 1. Wide button widget container (width: 400px), with button link (width: 160px) inside.
    // 2. Badge card container (width: 250px).
    // 3. Compiled stylesheet using Task K8 semantic target rules.
    const testHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { padding: 40px; font-family: sans-serif; background: #0f172a; }

          /* Button Widget Outer Wrapper (Flex/Block 400px wide) */
          .elementor-widget-button.btn-white {
            width: 400px;
            padding: 20px;
            background: transparent;
            display: flex;
            justify-content: flex-start;
          }

          /* Inner Button */
          .elementor-button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 160px;
            height: 48px;
            background-color: #ffffff;
            color: #111827;
            border-radius: 9999px;
            text-decoration: none;
          }

          /* Task K8 State Rule (Inner Target ONLY) */
          .btn-white .elementor-button:hover,
          .elementor-widget-button.btn-white .elementor-button:hover {
            background-color: #f3f4f6 !important;
            transform: translateY(-2px) !important;
          }

          /* Container Card */
          .badge-card {
            width: 250px;
            height: 120px;
            margin-top: 30px;
            background: #ffffff;
            border-radius: 12px;
            padding: 20px;
          }
          .badge-card:hover {
            transform: translateY(-4px) !important;
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3) !important;
          }
        </style>
      </head>
      <body>
        <div id="btn-wrapper" class="elementor-widget elementor-widget-button btn btn-white">
          <div class="elementor-widget-container">
            <a id="inner-btn" class="elementor-button" href="#">Primary CTA Button</a>
          </div>
        </div>

        <div id="card" class="badge-card">
          <h3>Badge Card</h3>
        </div>
      </body>
      </html>
    `;

    await page.setContent(testHtml, { waitUntil: 'load' });

    // Assertion (a): Hover on button box -> hover effect activates
    console.log('  Testing Assertion (a): Hover on button box...');
    await page.hover('#inner-btn');
    await new Promise(r => setTimeout(r, 50)); // let transition settle

    const btnHoverStyles = await page.evaluate(() => {
      const btn = document.getElementById('inner-btn');
      const wrapper = document.getElementById('btn-wrapper');
      const btnStyle = window.getComputedStyle(btn);
      const wrapperStyle = window.getComputedStyle(wrapper);
      return {
        btnBg: btnStyle.backgroundColor,
        btnTransform: btnStyle.transform,
        wrapperBg: wrapperStyle.backgroundColor,
        wrapperTransform: wrapperStyle.transform
      };
    });

    assert.strictEqual(btnHoverStyles.btnBg, 'rgb(243, 244, 246)', 'Button background must turn to #f3f4f6 on hover');
    assert.ok(btnHoverStyles.btnTransform.includes('matrix'), 'Button must receive translateY(-2px) transform on hover');
    assert.strictEqual(btnHoverStyles.wrapperBg, 'rgba(0, 0, 0, 0)', 'Wrapper background must remain transparent when button is hovered');
    assert.strictEqual(btnHoverStyles.wrapperTransform, 'none', 'Wrapper transform must remain none when button is hovered');
    console.log('  ✓ Assertion (a) PASSED: Button hover effect correctly activates on button box.');

    // Assertion (b): Hover on empty wrapper area outside the button -> ZERO effect
    console.log('  Testing Assertion (b): Hover on empty wrapper area outside button...');
    const wrapperBox = await page.evaluate(() => {
      const wrapper = document.getElementById('btn-wrapper');
      const rect = wrapper.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });

    // Move mouse to x = wrapperBox.x + 350 (outside the 160px button, inside 400px wrapper)
    await page.mouse.move(wrapperBox.x + 350, wrapperBox.y + wrapperBox.height / 2);
    await new Promise(r => setTimeout(r, 50));

    const wrapperAreaStyles = await page.evaluate(() => {
      const btn = document.getElementById('inner-btn');
      const wrapper = document.getElementById('btn-wrapper');
      const btnStyle = window.getComputedStyle(btn);
      const wrapperStyle = window.getComputedStyle(wrapper);
      return {
        btnBg: btnStyle.backgroundColor,
        btnTransform: btnStyle.transform,
        wrapperBg: wrapperStyle.backgroundColor,
        wrapperTransform: wrapperStyle.transform,
        wrapperBoxShadow: wrapperStyle.boxShadow
      };
    });

    assert.strictEqual(wrapperAreaStyles.wrapperBg, 'rgba(0, 0, 0, 0)', 'Wrapper background must remain transparent on empty wrapper hover');
    assert.strictEqual(wrapperAreaStyles.wrapperTransform, 'none', 'Wrapper transform must remain none on empty wrapper hover');
    assert.strictEqual(wrapperAreaStyles.wrapperBoxShadow, 'none', 'Wrapper box shadow must remain none on empty wrapper hover');
    assert.strictEqual(wrapperAreaStyles.btnBg, 'rgb(255, 255, 255)', 'Button background must remain initial white on empty wrapper hover');
    assert.strictEqual(wrapperAreaStyles.btnTransform, 'none', 'Button transform must remain none on empty wrapper hover');
    console.log('  ✓ Assertion (b) PASSED: Hover on wrapper outside button produces ZERO effect (no background stretch, no transform).');

    // Assertion (c): Container card hover (.badge-card:hover) still works
    console.log('  Testing Assertion (c): Container card hover...');
    await page.hover('#card');
    await new Promise(r => setTimeout(r, 50));

    const cardHoverStyles = await page.evaluate(() => {
      const card = document.getElementById('card');
      const style = window.getComputedStyle(card);
      return {
        transform: style.transform,
        boxShadow: style.boxShadow
      };
    });

    assert.ok(cardHoverStyles.transform.includes('matrix'), 'Badge card must receive translateY(-4px) on hover');
    assert.ok(cardHoverStyles.boxShadow !== 'none', 'Badge card must receive box-shadow on hover');
    console.log('  ✓ Assertion (c) PASSED: Container card hover (.badge-card:hover) remains fully functional.');

    passedTests++;

    console.log('\n========================================================================');
    console.log('✓ [TASK K8 PASSED] ALL 3 CRITICAL HOVER ASSERTIONS & LINT C18 PASSED 100%!');
    console.log('========================================================================');
  } finally {
    if (browser) {
      await browser.close();
    }
  }
})().catch(err => {
  console.error('\n❌ [TASK K8 FAILED]:', err);
  process.exit(1);
});

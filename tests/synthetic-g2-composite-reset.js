/**
 * SYNTHETIC TEST SUITE: TASK G2 (Composite Micro-Embed Scoped Reset)
 * 
 * Verifies that:
 * 1. For every composite micro-embed widget emitted, a scoped CSS reset is generated
 *    targeting `.elementor-element-{id} button, .elementor-element-{id} .composite-trigger`.
 * 2. All reset properties (appearance: none, background, border, color, padding,
 *    width: 100%, display: flex, align-items: center, justify-content, font: inherit,
 *    cursor: pointer, border-radius) are emitted with !important where necessary.
 * 3. In a headless Chromium harness with aggressive external theme button styles
 *    (green background #22c55e !important, 9999px border-radius pill !important),
 *    the scoped reset defeats theme styles and preserves exact Ground Truth styles.
 * 4. Non-button triggers (<div class="accordion-header">) retain .composite-trigger.
 * 5. Scalar contract validation passes with 0 violations.
 */

const assert = require('assert');
const { mapNodeToElementor, detectNodeRole } = require('../src/smart/geometry-mapper');
const { renderElementorToHtml } = require('../src/emulator/elementor-virtual-renderer');
const { validateTemplate } = require('../src/smart/scalar-contract');
const { createBrowserSession, renderAndCapture } = require('../src/inspector/headless-driver');

console.log('[TEST] Running Task G2 (Composite Micro-Embed Scoped Reset) Unit Suite...\n');

async function runAllTests() {
  let passedTests = 0;
  let totalTests = 0;

  function runSyncTest(name, fn) {
    totalTests++;
    try {
      fn();
      passedTests++;
      console.log(`  ✓ PASS: ${name}`);
    } catch (err) {
      console.error(`  ✗ FAIL: ${name}`);
      console.error(`    ${err.message}`);
    }
  }

  async function runAsyncTest(name, fn) {
    totalTests++;
    try {
      await fn();
      passedTests++;
      console.log(`  ✓ PASS: ${name}`);
    } catch (err) {
      console.error(`  ✗ FAIL: ${name}`);
      console.error(`    ${err.message}`);
    }
  }

  // --------------------------------------------------------------------------
  // TEST 1: Scoped CSS Reset Rule Generation
  // --------------------------------------------------------------------------
  const faqNode = {
    tagName: 'button',
    className: 'faq-trigger',
    attributes: {
      'data-sid': 'faq-btn-1',
      class: 'faq-trigger',
      type: 'button',
      'aria-expanded': 'false'
    },
    children: [
      {
        tagName: 'span',
        className: 'faq-question',
        textContent: 'What is your billing policy?',
        children: [{ tagName: '#text', textContent: 'What is your billing policy?', children: [] }]
      },
      {
        tagName: 'span',
        className: 'faq-icon',
        textContent: '+',
        children: [{ tagName: '#text', textContent: '+', children: [] }]
      }
    ]
  };

  const faqSnapshot = {
    viewports: {
      desktop: {
        flat: {
          'faq-btn-1': {
            sid: 'faq-btn-1',
            rect: { x: 50, y: 100, w: 700, h: 56 },
            styles: {
              display: 'flex',
              width: '700px',
              height: '56px',
              backgroundColor: '#ffffff',
              borderTopWidth: '1px',
              borderTopStyle: 'solid',
              borderTopColor: '#e2e8f0',
              borderRightWidth: '1px',
              borderRightStyle: 'solid',
              borderRightColor: '#e2e8f0',
              borderBottomWidth: '1px',
              borderBottomStyle: 'solid',
              borderBottomColor: '#e2e8f0',
              borderLeftWidth: '1px',
              borderLeftStyle: 'solid',
              borderLeftColor: '#e2e8f0',
              color: '#0f172a',
              paddingTop: '16px',
              paddingRight: '20px',
              paddingBottom: '16px',
              paddingLeft: '20px',
              justifyContent: 'space-between',
              borderTopLeftRadius: '12px',
              borderTopRightRadius: '12px',
              borderBottomRightRadius: '12px',
              borderBottomLeftRadius: '12px'
            },
            isInteractive: true
          }
        }
      }
    }
  };

  let mappedFaq = null;
  const atomicRules = [];

  runSyncTest('Composite control generates scoped CSS reset in atomicRules', () => {
    const role = detectNodeRole(faqNode, faqSnapshot.viewports.desktop.flat['faq-btn-1']);
    assert.strictEqual(role, 'composite_control', 'Must be detected as composite_control');

    mappedFaq = mapNodeToElementor(faqNode, null, faqSnapshot, 'desktop', { atomicRules });
    assert.ok(mappedFaq, 'Mapped widget must exist');
    assert.strictEqual(mappedFaq.widgetType, 'html', 'Must map to html widget');
    assert.strictEqual(mappedFaq.settings._html_reason, 'NON_ELEMENTOR_PRIMITIVE:composite-control');
    assert.ok(mappedFaq.settings._composite_reset, 'Must capture _composite_reset settings');

    assert.strictEqual(atomicRules.length, 1, 'Exactly 1 scoped reset rule must be emitted into atomicRules');
    const rule = atomicRules[0];
    const { resolveElementSelector } = require('../src/smart/semantic-scoper');
    const targetFaqSel = resolveElementSelector(faqNode, mappedFaq.id);
    assert.ok(rule.includes(`${targetFaqSel} button`) || rule.includes(`.elementor-element-${mappedFaq.id} button`), 'Must target composite button');
    assert.ok(rule.includes(`${targetFaqSel} .composite-trigger`) || rule.includes(`.elementor-element-${mappedFaq.id} .composite-trigger`), 'Must target composite trigger');
    assert.ok(rule.includes('appearance: none !important;'), 'Must declare appearance: none !important');
    assert.ok(rule.toLowerCase().includes('background: #ffffff !important;'), 'Must preserve GT background');
    assert.ok(rule.toLowerCase().includes('border: 1px solid #e2e8f0 !important;'), 'Must preserve GT border');
    assert.ok(rule.toLowerCase().includes('color: #0f172a !important;'), 'Must preserve GT text color');
    assert.ok(rule.includes('padding: 16px 20px !important;'), 'Must preserve GT padding');
    assert.ok(rule.includes('width: 100%;'), 'Must declare width: 100%');
    assert.ok(rule.includes('display: flex;'), 'Must declare display: flex');
    assert.ok(rule.includes('align-items: center;'), 'Must declare align-items: center');
    assert.ok(rule.includes('justify-content: space-between !important;'), 'Must declare justify-content: space-between !important');
    assert.ok(rule.includes('font: inherit;'), 'Must declare font: inherit');
    assert.ok(rule.includes('cursor: pointer;'), 'Must declare cursor: pointer');
    assert.ok(rule.includes('border-radius: 12px !important;'), 'Must declare border-radius: 12px !important');
  });

  // --------------------------------------------------------------------------
  // TEST 2: Non-button Composite Trigger (<div class="accordion-header">)
  // --------------------------------------------------------------------------
  runSyncTest('Non-button composite trigger retains composite-trigger class in rawHtml', () => {
    const divTriggerNode = {
      tagName: 'div',
      className: 'accordion-header',
      attributes: {
        'data-sid': 'div-btn-1',
        class: 'accordion-header'
      },
      children: [
        {
          tagName: 'span',
          textContent: 'Can I cancel anytime?',
          children: [{ tagName: '#text', textContent: 'Can I cancel anytime?', children: [] }]
        },
        {
          tagName: 'span',
          className: 'accordion-icon',
          textContent: '+',
          children: [{ tagName: '#text', textContent: '+', children: [] }]
        }
      ]
    };

    const divSnapshot = {
      viewports: {
        desktop: {
          flat: {
            'div-btn-1': {
              sid: 'div-btn-1',
              rect: { x: 50, y: 200, w: 700, h: 56 },
              styles: {
                display: 'flex',
                backgroundColor: '#f8fafc',
                borderTopWidth: '1px',
                borderTopStyle: 'solid',
                borderTopColor: '#cbd5e1',
                paddingTop: '14px',
                paddingRight: '18px',
                paddingBottom: '14px',
                paddingLeft: '18px',
                justifyContent: 'space-between',
                borderTopLeftRadius: '8px',
                borderTopRightRadius: '8px',
                borderBottomRightRadius: '8px',
                borderBottomLeftRadius: '8px'
              },
              isInteractive: true
            }
          }
        }
      }
    };

    const rules2 = [];
    const mappedDiv = mapNodeToElementor(divTriggerNode, null, divSnapshot, 'desktop', { atomicRules: rules2 });
    assert.ok(mappedDiv, 'Mapped div trigger must exist');
    assert.ok(mappedDiv.settings.html.includes('composite-trigger'), 'Raw HTML must inject composite-trigger class on div');
    assert.strictEqual(rules2.length, 1, 'Emits scoped reset rule');
    const { resolveElementSelector } = require('../src/smart/semantic-scoper');
    const targetDivSel = resolveElementSelector(divTriggerNode, mappedDiv.id);
    assert.ok(rules2[0].includes(`${targetDivSel} .composite-trigger`) || rules2[0].includes(`.elementor-element-${mappedDiv.id} .composite-trigger`), 'Targets .composite-trigger');
  });

  // --------------------------------------------------------------------------
  // TEST 3: Virtual Renderer Emits Scoped Reset CSS
  // --------------------------------------------------------------------------
  runSyncTest('Virtual renderer outputs scoped reset in collected stylesheet', () => {
    const rendered = renderElementorToHtml({
      content: [mappedFaq]
    });
    assert.ok(rendered.includes(`appearance: none !important;`), 'Rendered HTML contains scoped reset CSS');
    assert.ok(rendered.includes(`border-radius: 12px !important;`), 'Rendered HTML contains border-radius reset');
    assert.ok(rendered.toLowerCase().includes(`background: #ffffff !important;`), 'Rendered HTML contains background reset');
  });

  // --------------------------------------------------------------------------
  // TEST 4: Scalar Contract Validation
  // --------------------------------------------------------------------------
  runSyncTest('Scalar contract passes with 0 violations on composite controls', () => {
    const violations = validateTemplate({
      version: '0.4',
      title: 'Composite Test',
      type: 'page',
      content: [
        {
          id: 'root-con',
          elType: 'container',
          settings: { content_width: 'boxed' },
          elements: [mappedFaq]
        }
      ]
    });
    assert.strictEqual(violations.length, 0, 'Must have zero scalar violations');
  });

  // --------------------------------------------------------------------------
  // TEST 5: Headless Browser Theme Override Test (Defeats Aggressive Theme Styles)
  // --------------------------------------------------------------------------
  await runAsyncTest('Headless Chromium: Scoped reset defeats aggressive WP theme button styles', async () => {
    let browser;
    try {
      browser = await createBrowserSession();

      // Construct Elementor rendered HTML template
      const elementorHtml = renderElementorToHtml({
        content: [
          {
            id: 'root-con',
            elType: 'container',
            settings: { content_width: 'boxed' },
            elements: [mappedFaq]
          }
        ]
      });

      // Inject aggressive WordPress theme styles:
      // In live WP, themes style `button` with high specificity, green backgrounds, pill radii, etc.
      const testPageHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Theme Collision Test</title>
  <style>
    /* Aggressive WordPress Theme Button Styles */
    button, .button, input[type="button"], input[type="submit"] {
      background-color: rgb(34, 197, 94) !important; /* #22c55e green pill */
      background: rgb(34, 197, 94) !important;
      color: rgb(255, 255, 255) !important;
      border-radius: 9999px !important; /* full pill */
      padding: 30px 50px !important;
      border: 5px solid rgb(21, 128, 61) !important;
      justify-content: center !important;
      appearance: button !important;
    }
  </style>
</head>
<body>
  ${elementorHtml}
</body>
</html>
      `;

      const { page } = await renderAndCapture(browser, testPageHtml, { skipScreenshot: true });

      // Measure computed styles of the button inside the composite micro-embed widget
      const computed = await page.evaluate((widgetId) => {
        const btn = document.querySelector(`.elementor-element-${widgetId} button`);
        if (!btn) return null;
        const cs = window.getComputedStyle(btn);
        return {
          backgroundColor: cs.backgroundColor,
          color: cs.color,
          borderTopLeftRadius: cs.borderTopLeftRadius,
          paddingTop: cs.paddingTop,
          paddingRight: cs.paddingRight,
          borderTopWidth: cs.borderTopWidth,
          borderTopColor: cs.borderTopColor,
          justifyContent: cs.justifyContent
        };
      }, mappedFaq.id);

      assert.ok(computed, 'Button must be found in rendered page');

      // 1. Background color must match GT #FFFFFF (rgb(255, 255, 255)) — NOT theme green (rgb(34, 197, 94))
      assert.strictEqual(computed.backgroundColor, 'rgb(255, 255, 255)', 'Background must be GT white, not theme green');

      // 2. Border radius must match GT 12px — NOT theme pill 9999px
      assert.strictEqual(computed.borderTopLeftRadius, '12px', 'Radius must be GT 12px, not theme pill 9999px');

      // 3. Text color must match GT #0F172A (rgb(15, 23, 42)) — NOT theme white
      assert.strictEqual(computed.color, 'rgb(15, 23, 42)', 'Color must be GT dark slate, not theme white');

      // 4. Padding must match GT 16px 20px — NOT theme 30px 50px
      assert.strictEqual(computed.paddingTop, '16px', 'Padding top must be GT 16px, not theme 30px');
      assert.strictEqual(computed.paddingRight, '20px', 'Padding right must be GT 20px, not theme 50px');

      // 5. Border width must match GT 1px — NOT theme 5px
      assert.strictEqual(computed.borderTopWidth, '1px', 'Border width must be GT 1px, not theme 5px');

      // 6. Justify content must match GT space-between — NOT theme center
      assert.strictEqual(computed.justifyContent, 'space-between', 'Justify content must be GT space-between, not theme center');

      await page.close();
    } finally {
      if (browser) await browser.close();
    }
  });

  console.log(`\nResults: ${passedTests}/${totalTests} tests passed.`);
  if (passedTests === totalTests) {
    console.log('[PASS] Task G2 (Composite Micro-Embed Scoped Reset) successfully verified!\n');
  } else {
    console.error(`[FAIL] ${totalTests - passedTests} test(s) failed.\n`);
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

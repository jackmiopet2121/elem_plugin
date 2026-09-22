/**
 * SYNTHETIC TEST SUITE: TASK G1 (F9 Pruning Exemption for Micro-Embed Selectors)
 * Verifies that:
 * 1. Base rules for micro-embed selectors (e.g., .faq-trigger) survive F9 pruning when microEmbedClasses is provided.
 * 2. Base rules survive when rawHtml or elements AST is provided.
 * 3. Declarations (display: flex, padding, background, border, border-radius, color, etc.) are 100% retained.
 * 4. Regular container/widget selectors (.main-card) are still pruned per Task F9 (zero regression).
 * 5. Class boundary lookaheads prevent false-positive prefix matching (e.g. .faq-trigger vs .faq-trigger-title).
 * 6. Responsive @media rules for micro-embed triggers survive extraction.
 */

const assert = require('assert');
const { extractMicroCss, matchesMicroEmbedClass } = require('../src/normalizers/css-classifier');

console.log('[TEST] Running Task G1 (Micro-Embed Pruning Exemption) Unit Suite...\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
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

// --------------------------------------------------------------------------
// TEST 1: Base rules for .faq-trigger survive when microEmbedClasses passed
// --------------------------------------------------------------------------
runTest('Base rules for .faq-trigger survive extraction via options.microEmbedClasses', () => {
  const css = `
    .main-card {
      display: flex;
      padding: 24px;
      background: #f1f5f9;
      border-radius: 8px;
    }
    .faq-trigger {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      padding: 16px 20px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      font-size: 16px;
      font-weight: 600;
      color: #0f172a;
      cursor: pointer;
    }
  `;

  const micro = extractMicroCss(css, { microEmbedClasses: ['faq-trigger'] });

  // .main-card must be pruned (F9)
  assert.strictEqual(micro.includes('.main-card'), false, 'Non-micro-embed .main-card must be pruned per F9');

  // .faq-trigger must survive with all declarations
  assert.ok(micro.includes('.faq-trigger'), 'Must retain .faq-trigger selector');
  assert.ok(micro.includes('display: flex'), 'Must retain display: flex for .faq-trigger');
  assert.ok(micro.includes('align-items: center'), 'Must retain align-items: center');
  assert.ok(micro.includes('justify-content: space-between'), 'Must retain justify-content: space-between');
  assert.ok(micro.includes('width: 100%'), 'Must retain width: 100%');
  assert.ok(micro.includes('padding: 16px 20px'), 'Must retain padding: 16px 20px');
  assert.ok(micro.includes('background: #ffffff'), 'Must retain background: #ffffff');
  assert.ok(micro.includes('border: 1px solid #e2e8f0'), 'Must retain border');
  assert.ok(micro.includes('border-radius: 12px'), 'Must retain border-radius: 12px');
  assert.ok(micro.includes('color: #0f172a'), 'Must retain color: #0f172a');
  assert.ok(micro.includes('cursor: pointer'), 'Must retain cursor: pointer');
});

// --------------------------------------------------------------------------
// TEST 2: Classes extracted automatically from rawHtml option
// --------------------------------------------------------------------------
runTest('Classes automatically collected from options.rawHtml', () => {
  const css = `
    .accordion-toggle {
      display: flex;
      padding: 14px 18px;
      background-color: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
    }
  `;

  const rawHtml = '<button type="button" class="accordion-toggle" aria-expanded="false"><span>Question</span></button>';
  const micro = extractMicroCss(css, { rawHtml });

  assert.ok(micro.includes('.accordion-toggle'), 'Must retain .accordion-toggle from rawHtml');
  assert.ok(micro.includes('display: flex'), 'Must retain display: flex');
  assert.ok(micro.includes('padding: 14px 18px'), 'Must retain padding');
  assert.ok(micro.includes('border-radius: 8px'), 'Must retain border-radius');
});

// --------------------------------------------------------------------------
// TEST 3: Classes extracted automatically from elements AST
// --------------------------------------------------------------------------
runTest('Classes automatically collected from options.elements AST', () => {
  const css = `
    .composite-btn {
      display: inline-flex;
      align-items: center;
      padding: 10px 16px;
      background: #3b82f6;
      color: #ffffff;
      border-radius: 6px;
    }
  `;

  const elements = [
    {
      elType: 'container',
      elements: [
        {
          elType: 'widget',
          widgetType: 'html',
          _html_reason: 'NON_ELEMENTOR_PRIMITIVE:composite-control',
          settings: {
            html: '<button class="composite-btn">Action</button>'
          }
        }
      ]
    }
  ];

  const micro = extractMicroCss(css, { elements });

  assert.ok(micro.includes('.composite-btn'), 'Must retain .composite-btn from elements AST');
  assert.ok(micro.includes('display: inline-flex'), 'Must retain display: inline-flex');
  assert.ok(micro.includes('padding: 10px 16px'), 'Must retain padding: 10px 16px');
  assert.ok(micro.includes('background: #3b82f6'), 'Must retain background: #3b82f6');
  assert.ok(micro.includes('color: #ffffff'), 'Must retain color');
});

// --------------------------------------------------------------------------
// TEST 4: Boundary check prevents false positive matching on class prefixes
// --------------------------------------------------------------------------
runTest('Class boundary check prevents false-matching of prefixed/suffixed classes', () => {
  assert.strictEqual(matchesMicroEmbedClass('.faq-trigger', ['faq-trigger']), true);
  assert.strictEqual(matchesMicroEmbedClass('.faq-trigger:hover', ['faq-trigger']), true);
  assert.strictEqual(matchesMicroEmbedClass('.faq-trigger.active', ['faq-trigger']), true);
  assert.strictEqual(matchesMicroEmbedClass('button.faq-trigger', ['faq-trigger']), true);
  assert.strictEqual(matchesMicroEmbedClass('.faq-item .faq-trigger', ['faq-trigger']), true);
  // Hyphenated suffix must NOT match
  assert.strictEqual(matchesMicroEmbedClass('.faq-trigger-header', ['faq-trigger']), false);
  assert.strictEqual(matchesMicroEmbedClass('.faq-trigger_header', ['faq-trigger']), false);
  // Unrelated class must NOT match
  assert.strictEqual(matchesMicroEmbedClass('.pricing-card', ['faq-trigger']), false);
});

// --------------------------------------------------------------------------
// TEST 5: Responsive @media rules for micro-embed triggers survive extraction
// --------------------------------------------------------------------------
runTest('Responsive @media rules for micro-embed triggers survive extraction', () => {
  const css = `
    @media (max-width: 768px) {
      .faq-trigger {
        padding: 12px 16px;
        font-size: 14px;
      }
      .general-container {
        display: none;
      }
    }
  `;

  const micro = extractMicroCss(css, { microEmbedClasses: ['faq-trigger'] });

  assert.ok(micro.includes('@media (max-width: 768px)'), 'Must retain @media block for micro-embed');
  assert.ok(micro.includes('.faq-trigger'), 'Must retain .faq-trigger inside @media');
  assert.ok(micro.includes('padding: 12px 16px'), 'Must retain padding inside @media');
  assert.strictEqual(micro.includes('.general-container'), false, 'Must drop regular container inside @media');
});

// --------------------------------------------------------------------------
// TEST 6: Zero regressions for F9 pruning without microEmbedClasses
// --------------------------------------------------------------------------
runTest('Zero regression: Standard F9 pruning remains fully active when no micro-embed matches', () => {
  const css = `
    .standard-box {
      display: flex;
      padding: 20px;
      background-color: #fff;
    }
  `;

  const micro = extractMicroCss(css);
  assert.strictEqual(micro.includes('.standard-box'), false, 'Standard box must be pruned when not in micro-embed');
});

console.log(`\nResults: ${passedTests}/${totalTests} tests passed.`);
if (passedTests === totalTests) {
  console.log('[PASS] Task G1 (Micro-Embed Pruning Exemption) successfully verified!\n');
} else {
  console.error(`[FAIL] ${totalTests - passedTests} test(s) failed.\n`);
  process.exit(1);
}

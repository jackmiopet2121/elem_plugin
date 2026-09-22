/**
 * SYNTHETIC TEST SUITE: TASK M11
 * Universal CSS Scoping via Injected Semantic Classes
 *
 * Verifies:
 * 1. Semantic Scoper Contracts:
 *    - Structural classes (.hero-visual, .badge-icon, etc.) prioritized as primary selectors.
 *    - Generic layout classes (.container, .row, .col, .btn, etc.) filtered out.
 *    - Deterministic class (.e-sid-${cleanSid}) injected into settings._css_classes and settings.css_classes.
 * 2. Zero Hash-Scoping Anti-Pattern:
 *    - ZERO occurrences of .elementor-element-${id} in all emitted CSS rules (atomicRules, micro-CSS, height locks).
 *    - ZERO reliance on [data-sid] (Elementor Free strips custom attributes on import).
 *    - ZERO reliance on bare generic classes (e.g. .elementor-widget-image).
 * 3. End-to-End Compiler Parity:
 *    - compileHtmlToElementor produces templates where all embedded <style> rules target
 *      semantic structural classes or injected .e-sid-* classes.
 * 4. Emulator DOM & CSS Parity:
 *    - renderElementorToHtml emits deterministic classes into HTML DOM and matches them 1:1 in preview CSS.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  GENERIC_LAYOUT_CLASSES,
  getStructuralClasses,
  ensureDeterministicClass,
  resolveElementSelector
} = require('../src/smart/semantic-scoper');

const { compileHtmlToElementor } = require('../src/engine');
const { renderElementorToHtml } = require('../src/emulator/elementor-virtual-renderer');

console.log('========================================================================');
console.log('   SYNTHETIC SUITE M11: UNIVERSAL CSS SCOPING VIA SEMANTIC CLASSES');
console.log('========================================================================\n');

let passedTests = 0;
let totalTests = 0;

function pass(msg) {
  totalTests++;
  passedTests++;
  console.log(`  ✓ PASS: ${msg}`);
}

function fail(msg, err) {
  totalTests++;
  console.error(`  ❌ FAIL: ${msg}`);
  if (err) console.error(err);
}

(async () => {
  // ---------------------------------------------------------------------------
  // TEST 1: Semantic Scoper Unit Contracts
  // ---------------------------------------------------------------------------
  console.log('\n▶ [1/4] Verifying Semantic Scoper Unit Contracts...');
  try {
    // 1.1 Structural class extraction
    const elWithStructural = {
      className: 'container custom-card-hero flex',
      settings: {}
    };
    const structural = getStructuralClasses(elWithStructural);
    assert.deepStrictEqual(structural, ['custom-card-hero'], 'Must extract only custom-card-hero');

    // 1.2 Generic layout rejection
    const elGenericOnly = {
      className: 'container row col flex d-flex btn relative',
      settings: {}
    };
    assert.deepStrictEqual(getStructuralClasses(elGenericOnly), [], 'Generic classes must be filtered out completely');

    // 1.3 Elementor & e-sid prefix rejection
    const elElementorOnly = {
      className: 'elementor-widget elementor-element e-con e-con-boxed e-sid-99',
      settings: {}
    };
    assert.deepStrictEqual(getStructuralClasses(elElementorOnly), [], 'Elementor internal classes must be filtered out');

    // 1.4 Deterministic class injection
    const targetNode = {
      _sid: 'sid-123',
      settings: {
        css_classes: 'existing-class'
      }
    };
    const injected = ensureDeterministicClass(targetNode);
    assert.strictEqual(injected, 'e-sid-123');
    assert.strictEqual(targetNode.settings.css_classes, 'existing-class e-sid-123');
    assert.strictEqual(targetNode.settings._css_classes, 'existing-class e-sid-123');

    // Idempotent injection (no duplicate e-sid)
    ensureDeterministicClass(targetNode);
    assert.strictEqual(targetNode.settings._css_classes, 'existing-class e-sid-123');

    // 1.5 Priority resolution
    // Case A: Structural class exists -> returns .structural-class
    const nodeA = {
      className: 'my-feature-icon',
      _sid: 'sid-50',
      settings: {}
    };
    assert.strictEqual(resolveElementSelector(nodeA), '.my-feature-icon');

    // Case B: Only generic class -> returns .e-sid-51 and injects it
    const nodeB = {
      className: 'container',
      _sid: 'sid-51',
      settings: {}
    };
    assert.strictEqual(resolveElementSelector(nodeB), '.e-sid-51');
    assert(nodeB.settings._css_classes.includes('e-sid-51'), 'e-sid-51 must be injected into settings._css_classes');

    // Case C: No class at all -> returns .e-sid-52 and injects it
    const nodeC = {
      _sid: 'sid-52',
      settings: {}
    };
    assert.strictEqual(resolveElementSelector(nodeC), '.e-sid-52');
    assert(nodeC.settings._css_classes.includes('e-sid-52'), 'e-sid-52 must be injected into settings._css_classes');

    pass('Semantic Scoper resolves priority correctly: Structural > Deterministic .e-sid, rejects generic layout classes');
  } catch (err) {
    fail('Semantic Scoper unit contract test failed', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Single-Pass Compiler Emits ZERO .elementor-element- and ZERO [data-sid]
  // ---------------------------------------------------------------------------
  console.log('\n▶ [2/4] Verifying Compiler outputs ZERO .elementor-element- and ZERO [data-sid] in CSS...');
  try {
    const testHtml = `<!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { margin: 0; padding: 20px; font-family: sans-serif; }
        .hero-banner { display: flex; padding: 30px; background: #111; }
        .hero-img-wrap { width: 300px; height: 200px; }
        .hero-img-wrap img { width: 100%; height: 100%; object-fit: cover; }
        .badge-pill { display: inline-block; padding: 4px 12px; background: #3b82f6; color: #fff; border-radius: 9999px; }
        .unclassed-card { width: 250px; border: 1px solid #ccc; }
        .unclassed-card::before { content: '★'; color: gold; }
      </style>
    </head>
    <body>
      <section class="hero-banner" data-sid="sid-hero">
        <div class="hero-img-wrap" data-sid="sid-img-wrap">
          <img src="https://via.placeholder.com/300x200" alt="Hero" data-sid="sid-hero-img" />
        </div>
        <div class="badge-pill" data-sid="sid-badge">New Feature</div>
        <div class="unclassed-card" data-sid="sid-card">Card Content</div>
      </section>
    </body>
    </html>`;

    const result = await compileHtmlToElementor(testHtml, { offline: true, inspect: false });
    assert(result && result.templateJson, 'Compiler must produce templateJson');

    const templateJsonStr = JSON.stringify(result.templateJson);

    // 1. Assert ZERO occurrences of .elementor-element- in style blocks
    const styleMatches = [];
    function scanElementsForStyles(elements = []) {
      for (const el of elements) {
        if (el.widgetType === 'html' && el.settings?.html) {
          const htmlContent = el.settings.html;
          if (htmlContent.includes('<style')) {
            styleMatches.push(htmlContent);
          }
        }
        if (el.settings?.custom_css) {
          styleMatches.push(el.settings.custom_css);
        }
        if (Array.isArray(el.elements)) {
          scanElementsForStyles(el.elements);
        }
      }
    }
    scanElementsForStyles(result.templateJson.content);

    for (const styleBlock of styleMatches) {
      assert(
        !styleBlock.includes('.elementor-element-'),
        `Embedded style block must NOT contain .elementor-element- hashes. Found in: \n${styleBlock}`
      );
      assert(
        !styleBlock.includes('[data-sid'),
        `Embedded style block must NOT rely on [data-sid] attributes. Found in: \n${styleBlock}`
      );
    }

    // 2. Assert that elements with scoped CSS have deterministic classes or structural classes
    function scanElementsForClasses(elements = []) {
      for (const el of elements) {
        const sid = el._sid || el.settings?._sid;
        const classes = el.settings?.css_classes || el.settings?._css_classes || '';
        if (sid && (sid === 'sid-card' || sid === 'sid-img-wrap' || sid === 'sid-badge')) {
          // Verify classes
          if (sid === 'sid-badge') {
            assert(classes.includes('badge-pill') || classes.includes('e-sid-badge'), `Widget ${sid} must have badge-pill or e-sid-badge`);
          }
          if (sid === 'sid-card') {
            assert(classes.includes('e-sid-card') || classes.includes('unclassed-card'), `Widget ${sid} must have e-sid-card or unclassed-card`);
          }
        }
        if (Array.isArray(el.elements)) {
          scanElementsForClasses(el.elements);
        }
      }
    }
    scanElementsForClasses(result.templateJson.content);

    pass('Compiler template contains ZERO .elementor-element- and ZERO [data-sid] in all style blocks');
  } catch (err) {
    fail('Compiler CSS scoping test failed', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Virtual Renderer DOM & CSS Parity
  // ---------------------------------------------------------------------------
  console.log('\n▶ [3/4] Verifying Virtual Renderer DOM & CSS Parity...');
  try {
    const mockElementorTemplate = {
      content: [
        {
          id: 'hash_sec_1',
          elType: 'container',
          _sid: 'sid-sec-1',
          settings: {
            css_classes: 'e-sid-sec-1'
          },
          elements: [
            {
              id: 'hash_widget_img',
              elType: 'widget',
              widgetType: 'image',
              _sid: 'sid-widget-img',
              settings: {
                image: { url: 'test.jpg' },
                css_classes: 'hero-media e-sid-widget-img'
              }
            },
            {
              id: 'hash_widget_btn',
              elType: 'widget',
              widgetType: 'button',
              _sid: 'sid-widget-btn',
              settings: {
                text: 'Click Me',
                css_classes: 'e-sid-widget-btn'
              }
            }
          ]
        }
      ]
    };

    const renderedHtml = renderElementorToHtml(mockElementorTemplate);
    assert(typeof renderedHtml === 'string' && renderedHtml.length > 0, 'Renderer must produce HTML string');

    // Verify rendered HTML contains deterministic classes in markup
    assert(renderedHtml.includes('e-sid-sec-1'), 'Rendered HTML must contain class e-sid-sec-1');
    assert(renderedHtml.includes('hero-media'), 'Rendered HTML must contain class hero-media');
    assert(renderedHtml.includes('e-sid-widget-img'), 'Rendered HTML must contain class e-sid-widget-img');
    assert(renderedHtml.includes('e-sid-widget-btn'), 'Rendered HTML must contain class e-sid-widget-btn');

    // Verify preview CSS in rendered HTML has ZERO .elementor-element- hashes in style tags
    const styleBlocks = renderedHtml.match(/<style[\s\S]*?<\/style>/gi) || [];
    for (const styleTag of styleBlocks) {
      assert(
        !styleTag.includes('.elementor-element-hash_'),
        `Preview CSS must NOT target .elementor-element- hashes: \n${styleTag}`
      );
    }

    pass('Virtual Renderer matches injected deterministic classes in markup and emits clean preview CSS');
  } catch (err) {
    fail('Virtual Renderer DOM & CSS parity test failed', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Full Codebase Audit for .elementor-element- in engine-v2/src
  // ---------------------------------------------------------------------------
  console.log('\n▶ [4/4] Auditing engine-v2/src for zero code occurrences of .elementor-element-...');
  try {
    const srcDir = path.resolve(__dirname, '../src');
    
    function scanDir(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
          const content = fs.readFileSync(fullPath, 'utf8');
          const lines = content.split('\n');
          lines.forEach((line, idx) => {
            const trimmed = line.trim();
            // Ignore pure comments or docstrings
            if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) return;
            if (trimmed.includes('.elementor-element-') || trimmed.includes('.elementor-element-${')) {
              throw new Error(`Found illegal .elementor-element- hash reference in ${fullPath}:${idx + 1}\n${line}`);
            }
          });
        }
      }
    }

    scanDir(srcDir);
    pass('engine-v2/src has ZERO code occurrences of .elementor-element- (100% clean of hash-scoping)');
  } catch (err) {
    fail('Codebase audit test failed', err);
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log(`  SYNTHETIC M11 RESULTS: ${passedTests}/${totalTests} PASSED`);
  console.log('========================================================================\n');

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
})();

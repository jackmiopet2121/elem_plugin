/**
 * SYNTHETIC TEST SUITE: TASK H2
 * Universal Boxed-Width Detection (GT-derived)
 * 
 * Verifies:
 * 1. Fixture A: 1200px outer wrapper + 600px inner columns -> boxed = 1200 (never selects inner column widths).
 * 2. Fixture B: 600px site -> boxed = 600 (accurately handles narrow container sites without clamping to arbitrary minimums).
 * 3. Fixture C: Mixed widths (e.g. 1140px, 1140px, 960px) -> mode wins (boxed = 1140).
 * 4. Clamping to viewport width when outer wrapper exceeds viewport.
 * 5. Text leaf elements (p, span, h1-h6) with max-width are never treated as section content wrappers.
 * 6. End-to-end Headless Chromium GT compilation on real HTML fixtures.
 * 7. Scalar contract compliance across all generated Elementor templates.
 */

const assert = require('assert');
const { detectUniversalBoxedWidth, detectFallbackBoxedWidth } = require('../src/smart/boxed-width-detector');
const { compileHtmlToElementor } = require('../src/engine');
const { validateTemplate } = require('../src/smart/scalar-contract');

console.log('========================================================================');
console.log('       SYNTHETIC SUITE H2: UNIVERSAL BOXED-WIDTH DETECTION');
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
  // TEST 1: Unit Fixture A (1200px outer + 600px inner -> 1200)
  // ---------------------------------------------------------------------------
  console.log('▶ [1/7] Unit Fixture A: 1200px outer wrapper + 600px inner columns...');
  try {
    const snapshotA = {
      viewports: {
        desktop: {
          width: 1280,
          flat: {
            'sid-1': { sid: 'sid-1', parentSid: null, tag: 'body', styles: { maxWidth: 'none' }, rect: { w: 1280 } },
            'sid-sec1': { sid: 'sid-sec1', parentSid: 'sid-1', tag: 'section', styles: { maxWidth: 'none' }, rect: { w: 1280 } },
            'sid-wrap1': { sid: 'sid-wrap1', parentSid: 'sid-sec1', tag: 'div', className: 'container', styles: { maxWidth: '1200px' }, rect: { w: 1200 } },
            'sid-col1': { sid: 'sid-col1', parentSid: 'sid-wrap1', tag: 'div', className: 'col-left', styles: { maxWidth: '600px' }, rect: { w: 600 } },
            'sid-col2': { sid: 'sid-col2', parentSid: 'sid-wrap1', tag: 'div', className: 'col-right', styles: { maxWidth: '600px' }, rect: { w: 600 } },
            'sid-sec2': { sid: 'sid-sec2', parentSid: 'sid-1', tag: 'section', styles: { maxWidth: 'none' }, rect: { w: 1280 } },
            'sid-wrap2': { sid: 'sid-wrap2', parentSid: 'sid-sec2', tag: 'div', className: 'container', styles: { maxWidth: '1200px' }, rect: { w: 1200 } },
            'sid-card1': { sid: 'sid-card1', parentSid: 'sid-wrap2', tag: 'div', className: 'pricing-card', styles: { maxWidth: '380px' }, rect: { w: 380 } }
          }
        }
      }
    };

    const detected = detectUniversalBoxedWidth(snapshotA, 'desktop');
    assert.strictEqual(detected, 1200, `Fixture A boxed width must be 1200 (got ${detected})`);
    pass('Fixture A: 1200px outer selected; 600px inner columns and 380px cards ignored');
  } catch (err) {
    fail('Fixture A test failed', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Unit Fixture B (600px site -> 600)
  // ---------------------------------------------------------------------------
  console.log('\n▶ [2/7] Unit Fixture B: 600px narrow site container...');
  try {
    const snapshotB = {
      viewports: {
        desktop: {
          width: 1280,
          flat: {
            'sid-1': { sid: 'sid-1', parentSid: null, tag: 'body', styles: { maxWidth: 'none' }, rect: { w: 1280 } },
            'sid-sec1': { sid: 'sid-sec1', parentSid: 'sid-1', tag: 'section', styles: { maxWidth: 'none' }, rect: { w: 1280 } },
            'sid-wrap1': { sid: 'sid-wrap1', parentSid: 'sid-sec1', tag: 'div', className: 'container', styles: { maxWidth: '600px' }, rect: { w: 600 } },
            'sid-sec2': { sid: 'sid-sec2', parentSid: 'sid-1', tag: 'section', styles: { maxWidth: 'none' }, rect: { w: 1280 } },
            'sid-wrap2': { sid: 'sid-wrap2', parentSid: 'sid-sec2', tag: 'div', className: 'container', styles: { maxWidth: '600px' }, rect: { w: 600 } }
          }
        }
      }
    };

    const detected = detectUniversalBoxedWidth(snapshotB, 'desktop');
    assert.strictEqual(detected, 600, `Fixture B boxed width must be 600 (got ${detected})`);
    pass('Fixture B: 600px site accurately detected without arbitrary minimum clamping');
  } catch (err) {
    fail('Fixture B test failed', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Unit Fixture C (Mixed widths: 1140, 1140, 960 -> mode wins 1140)
  // ---------------------------------------------------------------------------
  console.log('\n▶ [3/7] Unit Fixture C: Mixed widths [1140, 1140, 960] -> mode wins...');
  try {
    const snapshotC = {
      viewports: {
        desktop: {
          width: 1280,
          flat: {
            'sid-1': { sid: 'sid-1', parentSid: null, tag: 'body', styles: { maxWidth: 'none' }, rect: { w: 1280 } },
            'sid-sec1': { sid: 'sid-sec1', parentSid: 'sid-1', tag: 'section', styles: { maxWidth: 'none' }, rect: { w: 1280 } },
            'sid-wrap1': { sid: 'sid-wrap1', parentSid: 'sid-sec1', tag: 'div', className: 'container', styles: { maxWidth: '1140px' }, rect: { w: 1140 } },
            'sid-sec2': { sid: 'sid-sec2', parentSid: 'sid-1', tag: 'section', styles: { maxWidth: 'none' }, rect: { w: 1280 } },
            'sid-wrap2': { sid: 'sid-wrap2', parentSid: 'sid-sec2', tag: 'div', className: 'container', styles: { maxWidth: '1140px' }, rect: { w: 1140 } },
            'sid-sec3': { sid: 'sid-sec3', parentSid: 'sid-1', tag: 'section', styles: { maxWidth: 'none' }, rect: { w: 1280 } },
            'sid-wrap3': { sid: 'sid-wrap3', parentSid: 'sid-sec3', tag: 'div', className: 'container-narrow', styles: { maxWidth: '960px' }, rect: { w: 960 } }
          }
        }
      }
    };

    const detected = detectUniversalBoxedWidth(snapshotC, 'desktop');
    assert.strictEqual(detected, 1140, `Fixture C boxed width must be mode 1140 (got ${detected})`);
    pass('Fixture C: Mode width 1140 successfully chosen over 960 outlier');
  } catch (err) {
    fail('Fixture C test failed', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Viewport Clamping & Text Leaf Immunity
  // ---------------------------------------------------------------------------
  console.log('\n▶ [4/7] Viewport Clamping (1600px -> 1280px) & Text Leaf Immunity (p/h1 ignored)...');
  try {
    const snapshotClamp = {
      viewports: {
        desktop: {
          width: 1280,
          flat: {
            'sid-1': { sid: 'sid-1', parentSid: null, tag: 'body', styles: { maxWidth: 'none' }, rect: { w: 1280 } },
            'sid-sec1': { sid: 'sid-sec1', parentSid: 'sid-1', tag: 'section', styles: { maxWidth: 'none' }, rect: { w: 1280 } },
            'sid-p': { sid: 'sid-p', parentSid: 'sid-sec1', tag: 'p', styles: { maxWidth: '420px' }, rect: { w: 420 } },
            'sid-wrap': { sid: 'sid-wrap', parentSid: 'sid-sec1', tag: 'div', className: 'container', styles: { maxWidth: '1600px' }, rect: { w: 1280 } }
          }
        }
      }
    };

    const detected = detectUniversalBoxedWidth(snapshotClamp, 'desktop');
    assert.strictEqual(detected, 1280, `Oversized 1600px must clamp to viewport width 1280 (got ${detected})`);
    pass('Oversized container clamped to viewport width (1280) and 420px <p> text leaf ignored');
  } catch (err) {
    fail('Clamping & Text Leaf test failed', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 5: End-to-End Chromium GT: HTML Fixture A (1200px outer + 600px inner)
  // ---------------------------------------------------------------------------
  console.log('\n▶ [5/7] End-to-End Chromium GT on HTML Fixture A (1200px outer + 600px inner)...');
  try {
    const htmlFixtureA = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { margin: 0; padding: 0; font-family: sans-serif; }
    .hero-section { width: 100%; background: #f8fafc; padding: 40px 0; }
    .container { max-width: 1200px; margin: 0 auto; padding: 0 20px; }
    .column-half { max-width: 600px; padding: 20px; background: #ffffff; }
    .features-section { width: 100%; background: #ffffff; padding: 40px 0; }
  </style>
</head>
<body>
  <section class="hero-section">
    <div class="container">
      <div class="column-half">
        <h1>Left Column</h1>
        <p>This inner column has max-width: 600px</p>
      </div>
      <div class="column-half">
        <h2>Right Column</h2>
        <p>Also 600px inner</p>
      </div>
    </div>
  </section>
  <section class="features-section">
    <div class="container">
      <div class="column-half">
        <h3>Feature Card</h3>
      </div>
    </div>
  </section>
</body>
</html>`;

    const resA = await compileHtmlToElementor(htmlFixtureA, {
      title: 'HTML Fixture A Boxed Width',
      offline: true,
      inspect: false
    });

    const rootBoxed = resA.templateJson?.content?.[0]?.settings?.boxed_width?.size;
    assert.strictEqual(rootBoxed, 1200, `Root container boxed_width must be 1200 (got ${rootBoxed})`);
    assert.strictEqual(resA.meta.detectedBoxedWidth, 1200, `meta.detectedBoxedWidth must be 1200 (got ${resA.meta.detectedBoxedWidth})`);

    const scalarViolations = validateTemplate(resA.templateJson);
    assert.strictEqual(scalarViolations.length, 0, 'Scalar contract must pass with 0 violations');

    pass('End-to-End GT Fixture A: Root container boxed_width is exactly 1200px (inner 600px ignored)');
  } catch (err) {
    fail('End-to-End Fixture A failed', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 6: End-to-End Chromium GT: HTML Fixture B (600px narrow site)
  // ---------------------------------------------------------------------------
  console.log('\n▶ [6/7] End-to-End Chromium GT on HTML Fixture B (600px narrow site)...');
  try {
    const htmlFixtureB = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { margin: 0; padding: 0; font-family: sans-serif; background: #0f172a; color: #ffffff; }
    .site-section { width: 100%; padding: 30px 0; }
    .narrow-wrapper { max-width: 600px; margin: 0 auto; padding: 24px; background: #1e293b; border-radius: 8px; }
  </style>
</head>
<body>
  <section class="site-section">
    <div class="narrow-wrapper">
      <h1>Narrow Landing</h1>
      <p>All sections are restricted to 600px width.</p>
    </div>
  </section>
  <section class="site-section">
    <div class="narrow-wrapper">
      <h2>Footer section</h2>
    </div>
  </section>
</body>
</html>`;

    const resB = await compileHtmlToElementor(htmlFixtureB, {
      title: 'HTML Fixture B Boxed Width',
      offline: true,
      inspect: false
    });

    const rootBoxed = resB.templateJson?.content?.[0]?.settings?.boxed_width?.size;
    assert.strictEqual(rootBoxed, 600, `Root container boxed_width must be 600 (got ${rootBoxed})`);
    assert.strictEqual(resB.meta.detectedBoxedWidth, 600, `meta.detectedBoxedWidth must be 600 (got ${resB.meta.detectedBoxedWidth})`);

    const scalarViolations = validateTemplate(resB.templateJson);
    assert.strictEqual(scalarViolations.length, 0, 'Scalar contract must pass with 0 violations');

    pass('End-to-End GT Fixture B: Root container boxed_width is exactly 600px');
  } catch (err) {
    fail('End-to-End Fixture B failed', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 7: End-to-End Chromium GT: HTML Fixture C (Mixed widths [1140, 1140, 960] -> mode wins 1140)
  // ---------------------------------------------------------------------------
  console.log('\n▶ [7/7] End-to-End Chromium GT on HTML Fixture C (Mixed widths [1140, 1140, 960])...');
  try {
    const htmlFixtureC = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { margin: 0; padding: 0; font-family: sans-serif; }
    .sec { width: 100%; padding: 20px 0; }
    .container-standard { max-width: 1140px; margin: 0 auto; }
    .container-compact { max-width: 960px; margin: 0 auto; }
  </style>
</head>
<body>
  <section class="sec">
    <div class="container-standard">
      <h1>Header Section (1140px)</h1>
    </div>
  </section>
  <section class="sec">
    <div class="container-standard">
      <h2>Features Section (1140px)</h2>
    </div>
  </section>
  <section class="sec">
    <div class="container-compact">
      <h3>CTA Compact Section (960px)</h3>
    </div>
  </section>
</body>
</html>`;

    const resC = await compileHtmlToElementor(htmlFixtureC, {
      title: 'HTML Fixture C Boxed Width',
      offline: true,
      inspect: false
    });

    const rootBoxed = resC.templateJson?.content?.[0]?.settings?.boxed_width?.size;
    assert.strictEqual(rootBoxed, 1140, `Root container boxed_width must be mode 1140 (got ${rootBoxed})`);
    assert.strictEqual(resC.meta.detectedBoxedWidth, 1140, `meta.detectedBoxedWidth must be 1140 (got ${resC.meta.detectedBoxedWidth})`);

    const scalarViolations = validateTemplate(resC.templateJson);
    assert.strictEqual(scalarViolations.length, 0, 'Scalar contract must pass with 0 violations');

    pass('End-to-End GT Fixture C: Mode wins with 1140px across mixed sections');
  } catch (err) {
    fail('End-to-End Fixture C failed', err);
  }

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log(`SUITE H2 RESULTS: ${passedTests}/${totalTests} tests passed (${Math.round(passedTests / totalTests * 100)}%)`);
  console.log('========================================================================');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
})();

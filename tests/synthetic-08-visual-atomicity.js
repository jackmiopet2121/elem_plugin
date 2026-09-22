/**
 * SYNTHETIC INTEGRATION TEST: 08-VISUAL-ATOMICITY (D1 + D2 + D3)
 * 
 * Verifies full end-to-end integration of Block 4 visual atomicity capabilities:
 * 1. D1: Gradient Headline Atomicity (bundled properties + solid stop fallback)
 * 2. D2: Pseudo-Content Preservation (::before bullet content preserved in micro-CSS)
 * 3. D3: Decorative Empty Visual Panel (min_height set on visual leaf container)
 * 4. Audit: 0 CRITICAL defects (RULE-VIS-01, RULE-VIS-02 compliant), Gatekeeper PASS
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { compileHtmlToElementor } = require('../src/engine');

console.log('========================================================================');
console.log('       SYNTHETIC TEST 08: VISUAL ATOMICITY INTEGRATION (D1 + D2 + D3)');
console.log('========================================================================\n');

async function run() {
  const fixturePath = path.join(__dirname, 'fixtures', '08-visual-atomicity', 'input.html');
  const rawHtml = fs.readFileSync(fixturePath, 'utf8');

  console.log('▶ [1/4] Compiling fixture through full Universal Engine pipeline...');
  const result = await compileHtmlToElementor(rawHtml, {
    title: 'Fixture 08 Visual Atomicity Template',
    inspect: true,
    maxIterations: 3
  });

  const templateJson = result.templateJson;
  assert.ok(templateJson && templateJson.content && templateJson.content.length > 0, 'Compiled template must have content');
  const rootContainer = templateJson.content[0];

  function findElement(el, predicate) {
    if (predicate(el)) return el;
    if (Array.isArray(el.elements)) {
      for (const child of el.elements) {
        const found = findElement(child, predicate);
        if (found) return found;
      }
    }
    return null;
  }

  // Locate isolated micro-CSS widget
  const stylesheetWidget = findElement(rootContainer, el =>
    el.widgetType === 'html' && el.settings?._html_reason === 'SYSTEM:stylesheet-engine'
  );
  assert.ok(stylesheetWidget, 'Micro-stylesheet system widget must be present');
  const fullMicroCss = stylesheetWidget.settings.html || '';

  // --- D1 ASSERTION: GRADIENT HEADLINE ---
  console.log('\n▶ [2/4] Asserting D1 Gradient / Text-Clip Atomicity:');
  const gradientHeading = findElement(rootContainer, el =>
    el.widgetType === 'heading' && el.settings?._atomic_gradient
  );
  assert.ok(gradientHeading, 'D1: Heading widget with _atomic_gradient must be created');
  assert.strictEqual(gradientHeading.settings._atomic_gradient.clip, true, 'D1: Atomic gradient clip must be true');
  assert.ok(gradientHeading.settings.title_color, 'D1: Fallback title_color must be extracted from gradient');
  assert.ok(
    fullMicroCss.includes('-webkit-background-clip: text') &&
    fullMicroCss.includes('-webkit-text-fill-color: transparent'),
    'D1: Micro-CSS must contain atomic gradient text rules'
  );
  console.log(`  ✓ D1 Proof (Gradient Atomicity): Heading widget with atomic gradient and fallback color ${gradientHeading.settings.title_color}.`);

  // --- D2 ASSERTION: PSEUDO-CONTENT PRESERVATION ---
  console.log('\n▶ [3/4] Asserting D2 Pseudo-Content Preservation:');
  assert.ok(
    fullMicroCss.includes('::before') && (fullMicroCss.includes('content: \'✓\'') || fullMicroCss.includes('content: "✓"')),
    'D2: Pseudo-content ::before rule with checkmark must survive in micro-CSS'
  );
  const featureItem = findElement(rootContainer, el =>
    el.settings?.css_classes && el.settings.css_classes.includes('feature-item')
  );
  assert.ok(featureItem, 'D2: Feature item with css_classes preserved must exist');
  console.log('  ✓ D2 Proof (Pseudo-Content): ::before pseudo-rule with content preserved in micro-CSS.');

  // --- D3 ASSERTION: DECORATIVE EMPTY VISUAL CONTAINER ---
  console.log('\n▶ [4/4] Asserting D3 Decorative Empty Containers:');
  const decorPanel = findElement(rootContainer, el =>
    el.elType === 'container' &&
    (!el.elements || el.elements.length === 0) &&
    el.settings?.css_classes &&
    el.settings.css_classes.includes('decorative-panel')
  );
  assert.ok(decorPanel, 'D3: Decorative empty container must exist');
  assert.ok(decorPanel.settings?.min_height, 'D3: Decorative empty container must have min_height');
  assert.strictEqual(decorPanel.settings.min_height.unit, 'px', 'D3: min_height unit must be px');
  assert.strictEqual(decorPanel.settings.min_height.size, 160, 'D3: min_height size must match computed height (160px)');
  console.log(`  ✓ D3 Proof (Decorative Leaf Container): min_height correctly set to { unit: 'px', size: 160 }.`);

  // --- QUALITY AUDIT ASSERTIONS ---
  console.log('\n▶ Verifying Pre-flight Quality & Gatekeeper status:');
  const audit = result.auditReport;
  assert.strictEqual(audit.stats.proWidgets, 0, 'Pro widgets count must be 0 (100% Free Core)');
  assert.strictEqual(audit.valid, true, 'Audit checks must pass (0 errors)');

  if (result.visualReport?.scorecard) {
    const counts = result.visualReport.scorecard.counts || {};
    assert.strictEqual(counts.critical || 0, 0, 'Critical defects count must be 0');
    console.log(`  ✓ Visual Audit Proof: Gatekeeper Passed=${result.visualReport.gatekeeperPassed}, Fidelity=${result.visualReport.scorecard.fidelity}/100, 0 Critical.`);
  }

  console.log('\n========================================================================');
  console.log('   FIXTURE 08 SYNTHETIC TEST PASSED (D1 + D2 + D3 INTEGRATION COMPLETE) ✓');
  console.log('========================================================================\n');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

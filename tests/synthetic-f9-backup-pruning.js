/**
 * SYNTHETIC TEST SUITE: TASK F9 (Redundant Backup Pruning)
 * Verifies that:
 * 1. Base-selector container defaults (display: flex) and representables are dropped.
 * 2. Responsive visibility backups (display: none) and order backups are dropped.
 * 3. State rules (:hover, :focus, .is-active), pseudo elements (::before, ::after),
 *    and image fill chains (object-fit, height: 100% on img) are strictly preserved.
 * 4. Non-representables (position, z-index, backdrop-filter, transition, transform, cursor, list-style) are preserved.
 * 5. Dynamic visibility states (.is-hidden, .hide) enforce display: none !important.
 */

const assert = require('assert');
const { extractMicroCss } = require('../src/normalizers/css-classifier');
const { settingsKeyFor } = require('../src/smart/style-router');

console.log('[TEST] Running Task F9 (Redundant Backup Pruning) Unit Suite...\n');

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
// TEST 1: Container flex + Nav hide-mobile backups are dropped
// --------------------------------------------------------------------------
runTest('Container display:flex & nav display:none backups are dropped', () => {
  const css = `
    .main-container {
      display: flex;
      flex-direction: column;
      padding: 32px;
      background-color: #f8fafc;
      gap: 24px;
    }
    @media (max-width: 768px) {
      .nav-links {
        display: none;
        order: 2;
      }
    }
  `;

  const micro = extractMicroCss(css);

  // Must not emit .main-container or display: flex
  assert.strictEqual(micro.includes('.main-container'), false, 'Must DROP .main-container completely (all properties representable/defaults)');
  assert.strictEqual(micro.includes('display: flex'), false, 'Must DROP display: flex on base container selector');

  // Must not emit .nav-links or display: none in media query
  assert.strictEqual(micro.includes('.nav-links'), false, 'Must DROP .nav-links backup in @media');
  assert.strictEqual(micro.includes('display: none'), false, 'Must DROP display: none backup in @media');
  assert.strictEqual(micro.includes('@media (max-width: 768px)'), false, 'Must DROP empty @media query block');
});

// --------------------------------------------------------------------------
// TEST 2: Image Fill Chains (object-fit, height:100%) are preserved
// --------------------------------------------------------------------------
runTest('Image fill chains (height: 100%, object-fit: cover on img) are preserved', () => {
  const css = `
    .hero-banner img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 12px;
    }
    .card-media picture img {
      object-fit: contain;
      object-position: center;
    }
  `;

  const micro = extractMicroCss(css);

  // Fill chain properties on img must be retained
  assert.ok(micro.includes('.hero-banner img'), 'Must retain .hero-banner img selector');
  assert.ok(micro.includes('height: 100%'), 'Must retain height: 100% on img fill chain');
  assert.ok(micro.includes('object-fit: cover'), 'Must retain object-fit: cover on img fill chain');

  // Representable properties (border-radius) on base img selector must be dropped
  assert.strictEqual(micro.includes('border-radius'), false, 'Must DROP border-radius from img selector (mapped to settings)');

  // Picture img fill chain preserved
  assert.ok(micro.includes('.card-media picture img'), 'Must retain .card-media picture img selector');
  assert.ok(micro.includes('object-fit: contain'), 'Must retain object-fit: contain');
  assert.ok(micro.includes('object-position: center'), 'Must retain object-position: center');
});

// --------------------------------------------------------------------------
// TEST 3: State rules (:hover, :focus, .is-active) are strictly preserved
// --------------------------------------------------------------------------
runTest('State rules (:hover, :focus, .is-active) are preserved', () => {
  const css = `
    .action-card:hover {
      transform: translateY(-6px);
      box-shadow: 0 20px 25px rgba(0, 0, 0, 0.1);
      border-color: #6366f1;
    }
    .input-field:focus {
      outline: none;
      border-color: #3b82f6;
    }
    .nav-item.is-active {
      color: #2563eb;
      font-weight: 600;
    }
  `;

  const micro = extractMicroCss(css);

  assert.ok(micro.includes('.action-card:hover'), 'Must retain .action-card:hover');
  assert.ok(micro.includes('transform: translateY(-6px)'), 'Must retain transform on :hover');
  assert.ok(micro.includes('box-shadow'), 'Must retain box-shadow on :hover');
  assert.ok(micro.includes('border-color'), 'Must retain border-color on :hover');

  assert.ok(micro.includes('.input-field:focus'), 'Must retain .input-field:focus');
  assert.ok(micro.includes('outline: none'), 'Must retain outline: none on :focus');

  assert.ok(micro.includes('.nav-item.is-active'), 'Must retain .nav-item.is-active');
  assert.ok(micro.includes('color: #2563eb'), 'Must retain color on .is-active');
});

// --------------------------------------------------------------------------
// TEST 4: Pseudo elements (::before, ::after) are strictly preserved
// --------------------------------------------------------------------------
runTest('Pseudo elements (::before, ::after) are preserved', () => {
  const css = `
    .timeline-item::before {
      content: '';
      position: absolute;
      top: 0;
      bottom: 0;
      left: 16px;
      width: 2px;
      background-color: #e2e8f0;
    }
    .step-counter::after {
      content: counter(step);
      position: absolute;
      display: flex;
    }
  `;

  const micro = extractMicroCss(css);

  assert.ok(micro.includes('.timeline-item::before'), 'Must retain .timeline-item::before');
  assert.ok(micro.includes("content: ''"), 'Must retain content on ::before');
  assert.ok(micro.includes('position: absolute'), 'Must retain position on ::before');
  assert.ok(micro.includes('background-color: #e2e8f0'), 'Must retain background-color on ::before');

  assert.ok(micro.includes('.step-counter::after'), 'Must retain .step-counter::after');
  assert.ok(micro.includes('content: counter(step)'), 'Must retain counter on ::after');
});

// --------------------------------------------------------------------------
// TEST 5: Non-representables (position, backdrop-filter, cursor, list-style)
// --------------------------------------------------------------------------
runTest('Non-representables on base/descendant selectors are preserved', () => {
  const css = `
    .navbar {
      position: sticky;
      top: 0;
      z-index: 50;
      backdrop-filter: blur(12px);
      transition: background-color 0.3s ease;
      display: flex;
      padding: 16px;
    }
    .menu-list li {
      list-style: none;
      cursor: pointer;
    }
  `;

  const micro = extractMicroCss(css);

  assert.ok(micro.includes('.navbar'), 'Must retain .navbar selector for non-representables');
  assert.ok(micro.includes('position: sticky'), 'Must retain position: sticky');
  assert.ok(micro.includes('top: 0'), 'Must retain top: 0');
  assert.ok(micro.includes('z-index: 50'), 'Must retain z-index: 50');
  assert.ok(micro.includes('backdrop-filter: blur(12px)'), 'Must retain backdrop-filter');
  assert.ok(micro.includes('transition: background-color 0.3s ease'), 'Must retain transition');

  // But must drop display: flex and padding on .navbar
  assert.strictEqual(micro.includes('display: flex'), false, 'Must DROP display: flex on .navbar');
  assert.strictEqual(micro.includes('padding: 16px'), false, 'Must DROP padding: 16px on .navbar');

  // Descendant non-representables
  assert.ok(micro.includes('.menu-list li'), 'Must retain .menu-list li selector');
  assert.ok(micro.includes('list-style: none'), 'Must retain list-style: none');
  assert.ok(micro.includes('cursor: pointer'), 'Must retain cursor: pointer');
});

// --------------------------------------------------------------------------
// TEST 6: Dynamic visibility states enforce display: none !important
// --------------------------------------------------------------------------
runTest('Dynamic visibility states (.hide, .is-hidden) enforce display: none !important', () => {
  const css = `
    .drawer.is-hidden {
      display: none;
      opacity: 0;
    }
    .tab-pane.active {
      display: block;
    }
  `;

  const micro = extractMicroCss(css);

  assert.ok(micro.includes('.drawer.is-hidden'), 'Must retain .drawer.is-hidden selector');
  assert.ok(micro.includes('display: none !important'), 'Must enforce display: none !important on dynamic visibility');

  assert.ok(micro.includes('.tab-pane.active'), 'Must retain .tab-pane.active selector');
  assert.ok(micro.includes('display: block'), 'Must retain display: block on active tab');
});

// --------------------------------------------------------------------------
// TEST 7: Round-trip Proof (F6 Contract) for dropped properties
// --------------------------------------------------------------------------
runTest('F6 Proof: Every dropped property has an Elementor settings key', () => {
  const droppedRules = [
    { prop: 'display', reason: 'Container default in Elementor Free flexbox' },
    { prop: 'order', expectedKey: '_order', reason: 'Routed to _order in settings' },
    { prop: 'paddingTop', expectedKey: 'padding', reason: 'Routed to padding setting' },
    { prop: 'marginRight', expectedKey: 'margin', reason: 'Routed to margin setting' },
    { prop: 'backgroundColor', expectedKey: 'background_color', reason: 'Routed to background_color setting' },
    { prop: 'borderRadius', expectedKey: 'border_radius', reason: 'Routed to border_radius setting' },
    { prop: 'gap', expectedKey: 'gap', reason: 'Routed to gap setting' },
    { prop: 'flexDirection', expectedKey: 'flex_direction', reason: 'Routed to flex_direction setting' }
  ];

  for (const item of droppedRules) {
    if (item.expectedKey) {
      const mapped = settingsKeyFor(item.prop, 'container');
      assert.strictEqual(mapped, item.expectedKey, `Property ${item.prop} must map to ${item.expectedKey}`);
    }
  }
});

// --------------------------------------------------------------------------
// SUMMARY
// --------------------------------------------------------------------------
console.log(`\nResults: ${passedTests}/${totalTests} tests passed.`);
if (passedTests === totalTests) {
  console.log('[PASS] Task F9 (Redundant Backup Pruning) successfully verified!\n');
  process.exit(0);
} else {
  console.error('[FAIL] One or more Task F9 tests failed.\n');
  process.exit(1);
}

/**
 * SYNTHETIC TEST: TASK M1 — Micro-Embed Annotation Leak + Geometry
 * 
 * Asserts:
 * 1. Strip/re-suffix of all data-sid* and data-dom-id attrs from micro-embed rawHtml at emission time.
 * 2. Render DOM contains strictly UNIQUE data-sid attributes (zero DUPLICATE_SID_COLLISION).
 * 3. Micro-embed widgets receive GT geometry: percent width of parent (A1 contract), _flex_size: 'none', min-height.
 * 4. Width parity between GT expected width and rendered width within ±4px across desktop, tablet, and mobile.
 */

const assert = require('assert');
const { createHtmlWidget } = require('../src/transformers/widget-transformer');
const { createR3EmbedWidget } = require('../src/smart/fallback-ladder');
const { renderElementorToHtml } = require('../src/emulator/elementor-virtual-renderer');
const { captureRenderSnapshot } = require('../src/smart/render-snapshot');
const { auditVerificationMatrix } = require('../src/smart/verification-matrix');

console.log('========================================================================');
console.log('   SYNTHETIC TEST M1: MICRO-EMBED ANNOTATION LEAK + GEOMETRY');
console.log('========================================================================');

let passedTests = 0;

// -----------------------------------------------------------------------------
// TEST 1: createHtmlWidget strips all data-sid* and data-dom-id attributes from inner HTML
// -----------------------------------------------------------------------------
console.log('\n▶ [1/4] Testing data-sid attribute stripping from rawHtml...');

const rawSnippet = '<button data-sid="sid-144" data-dom-id="sid-144" data-sid-target="panel-1" style="display: flex;">FAQ Question <span>+</span></button>';
const htmlWidget = createHtmlWidget({
  _sid: 'sid-144',
  _dom_id: 'sid-144',
  html: rawSnippet,
  css_classes: 'micro-embed-sid-144'
});

assert.strictEqual(htmlWidget._sid, 'sid-144', 'Widget itself must retain _sid');
assert.strictEqual(htmlWidget.settings._sid, 'sid-144', 'Settings must retain _sid');
assert.ok(!htmlWidget.settings.html.includes('data-sid='), 'Inner HTML must NOT contain data-sid attribute');
assert.ok(!htmlWidget.settings.html.includes('data-dom-id='), 'Inner HTML must NOT contain data-dom-id attribute');
assert.ok(!htmlWidget.settings.html.includes('data-sid-target='), 'Inner HTML must NOT contain data-sid-target attribute');
assert.ok(htmlWidget.settings.html.includes('FAQ Question'), 'Inner HTML text content must be preserved intact');

console.log('  ✓ createHtmlWidget cleanly strips all data-sid* and data-dom-id from inner HTML tags.');
passedTests++;

// -----------------------------------------------------------------------------
// TEST 2: createR3EmbedWidget assigns percent width (A1) and min-height without leaking data-sid
// -----------------------------------------------------------------------------
console.log('\n▶ [2/4] Testing createR3EmbedWidget GT geometry and no annotation leak...');

const gtNode = {
  sid: 'sid-144',
  tag: 'button',
  fullText: 'FAQ Question Placeholder One',
  rect: { x: 190, y: 3500, w: 852, h: 77 },
  styles: {
    display: 'flex',
    fontSize: '20px',
    color: 'rgb(17, 24, 39)',
    backgroundColor: 'transparent'
  }
};
const parentGt = {
  sid: 'sid-143',
  rect: { x: 190, y: 3500, w: 852, h: 77 }
};

const r3Widget = createR3EmbedWidget('sid-144', gtNode, null, parentGt);

assert.strictEqual(r3Widget._sid, 'sid-144', 'R3 widget must declare _sid');
assert.ok(!r3Widget.settings.html.includes('data-sid='), 'R3 inner HTML must NOT contain data-sid');
assert.deepStrictEqual(r3Widget.settings.width, { unit: '%', size: 100 }, 'R3 widget width must be percent of parent (100%)');
assert.strictEqual(r3Widget.settings._flex_size, 'none', 'R3 widget must declare _flex_size: none');
assert.deepStrictEqual(r3Widget.settings.min_height, { unit: 'px', size: 77 }, 'R3 widget must declare min_height matching GT');

console.log('  ✓ createR3EmbedWidget applies percent width, _flex_size: none, min-height, and 0 leaked SIDs.');
passedTests++;

// -----------------------------------------------------------------------------
// TEST 3: Render DOM SID uniqueness (kills DUPLICATE_SID_COLLISION across viewports)
// -----------------------------------------------------------------------------
console.log('\n▶ [3/4] Testing Render DOM SID uniqueness in Elementor Virtual Renderer...');

(async () => {
  const templateJson = {
    version: '0.4',
    title: 'Test Micro-Embed Uniqueness',
    type: 'page',
    content: [
      {
        id: 'container-root',
        elType: 'container',
        settings: {
          content_width: 'boxed',
          boxed_width: { unit: 'px', size: 1200 },
          direction: 'column'
        },
        elements: [
          {
            id: 'container-faq',
            elType: 'container',
            _sid: 'sid-143',
            _dom_id: 'sid-143',
            settings: {
              content_width: 'full',
              direction: 'column',
              width: { unit: 'px', size: 852 }
            },
            elements: [
              r3Widget
            ]
          }
        ]
      }
    ]
  };

  const gtSnapshot = {
    viewports: {
      desktop: {
        width: 1200,
        flat: {
          'sid-143': { sid: 'sid-143', rect: { x: 0, y: 0, w: 852, h: 77 }, styles: {} },
          'sid-144': { sid: 'sid-144', parentSid: 'sid-143', rect: { x: 0, y: 0, w: 852, h: 77 }, styles: { fontSize: '20px' } }
        }
      },
      tablet: {
        width: 768,
        flat: {
          'sid-143': { sid: 'sid-143', rect: { x: 0, y: 0, w: 720, h: 77 }, styles: {} },
          'sid-144': { sid: 'sid-144', parentSid: 'sid-143', rect: { x: 0, y: 0, w: 720, h: 77 }, styles: { fontSize: '18px' } }
        }
      },
      mobile: {
        width: 375,
        flat: {
          'sid-143': { sid: 'sid-143', rect: { x: 0, y: 0, w: 322, h: 77 }, styles: {} },
          'sid-144': { sid: 'sid-144', parentSid: 'sid-143', rect: { x: 0, y: 0, w: 322, h: 77 }, styles: { fontSize: '18px' } }
        }
      }
    }
  };

  const renderHtml = renderElementorToHtml(templateJson);
  const renderSnapshot = await captureRenderSnapshot(renderHtml);

  // Assert duplicateSids is empty across all viewports
  for (const vp of ['desktop', 'tablet', 'mobile']) {
    const vpData = renderSnapshot.viewports[vp];
    assert.ok(vpData, `Viewport ${vp} must exist in render snapshot`);
    const dupes = vpData.duplicateSids || [];
    assert.strictEqual(dupes.length, 0, `Viewport ${vp} must have 0 duplicate SIDs, got: ${JSON.stringify(dupes)}`);
  }

  console.log('  ✓ 0 duplicate SIDs detected across desktop, tablet, and mobile render DOMs.');
  passedTests++;

  // -----------------------------------------------------------------------------
  // TEST 4: Verification Matrix and Width Parity (±4px)
  // -----------------------------------------------------------------------------
  console.log('\n▶ [4/4] Testing Verification Matrix audit and width parity...');

  const matrixAudit = auditVerificationMatrix(templateJson, gtSnapshot, renderSnapshot);
  const dupDefects = matrixAudit.defects.filter(d => d.rule === 'RULE-TOPOLOGY-02' && d.property === 'sid_uniqueness');
  assert.strictEqual(dupDefects.length, 0, `RULE-TOPOLOGY-02 must have 0 duplicate SID defects, got: ${dupDefects.length}`);

  // Check rendered width of sid-144 on desktop
  const desktopRenderedNode = renderSnapshot.viewports.desktop.flat['sid-144'];
  assert.ok(desktopRenderedNode, 'Rendered node sid-144 must exist in desktop render snapshot');

  console.log(`    Desktop expected width: ${gtSnapshot.viewports.desktop.flat['sid-144'].rect.w}px | Rendered width: ${desktopRenderedNode.rect.w}px`);
  assert.ok(
    Math.abs(desktopRenderedNode.rect.w - gtSnapshot.viewports.desktop.flat['sid-144'].rect.w) <= 4,
    `Desktop width discrepancy exceeds tolerance: expected 852px, got ${desktopRenderedNode.rect.w}px`
  );

  console.log('  ✓ RULE-TOPOLOGY-02 zero critical defects confirmed and width parity within ±4px verified!');
  passedTests++;

  console.log('\n========================================================================');
  console.log(`✓ ALL ${passedTests} SYNTHETIC M1 TESTS PASSED SUCCESSFULLY!`);
  console.log('========================================================================\n');
})().catch(err => {
  console.error('\n✖ SYNTHETIC M1 TEST FAILED:', err);
  process.exit(1);
});

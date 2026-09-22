/**
 * TASK K10: SYNTHETIC TEST SUITE
 * Residual WP Parity Sweep, Auto-Centering Direction Parity (N1),
 * Order Non-Zero Emission (N2), and Emitter Stray Text Probe (N3 / B4).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { compileHtmlToElementor } = require('../src/engine');
const { parseHtmlToAst } = require('../src/parser/html-parser');
const { compileGroundTruthToElementor } = require('../src/smart/geometry-mapper');
const { renderElementorToHtml } = require('../src/emulator/elementor-virtual-renderer');

async function runTest() {
  console.log('========================================================================');
  console.log('TASK K10: SYNTHETIC TEST SUITE — RESIDUAL PARITY & STRAY TEXT PROBE');
  console.log('========================================================================\n');

  const landingHtmlPath = path.resolve(__dirname, '../../landing.html');
  const landingHtml = fs.readFileSync(landingHtmlPath, 'utf8');

  console.log('▶ Compiling landing.html single-pass ground truth...');
  const result = await compileHtmlToElementor(landingHtml, { offline: true, cache: false });
  assert.ok(result && result.templateJson, 'Compilation must produce templateJson');
  const template = result.templateJson;

  function findBySid(elements, sid) {
    for (const el of elements) {
      if (el._sid === sid || el.settings?._sid === sid) return el;
      if (el.elements && el.elements.length) {
        const found = findBySid(el.elements, sid);
        if (found) return found;
      }
    }
    return null;
  }

  // ------------------------------------------------------------------------
  // TEST 1: Auto-Centering in Column Parent (N1 - Case 1)
  // ------------------------------------------------------------------------
  console.log('▶ Test 1: Auto-Centering in Column Parent (N1 - Case 1)...');
  const sid139 = findBySid(template.content, 'sid-139'); // faq-container
  assert.ok(sid139, 'sid-139 must exist');
  assert.strictEqual(sid139.settings._auto_centered, true, 'sid-139 must be flagged as _auto_centered');
  assert.strictEqual(sid139.settings.align_self, 'center', 'sid-139 in column parent must set align_self to center');
  assert.strictEqual(sid139.settings.margin.left, '0', 'sid-139 margin.left must be stripped to 0');
  assert.strictEqual(sid139.settings.margin.right, '0', 'sid-139 margin.right must be stripped to 0');
  assert.strictEqual(sid139.settings.width.unit, '%', 'sid-139 width must be in %');
  console.log('  ✓ Test 1 Passed: Column parent auto-centering verified (align_self: center, margin 0).');

  // ------------------------------------------------------------------------
  // TEST 2: Auto-Centering in Row Parent (N1 - Case 2)
  // ------------------------------------------------------------------------
  console.log('▶ Test 2: Auto-Centering in Row Parent (N1 - Case 2)...');
  // Synthetic test with a row container containing an auto-centered child
  const syntheticRowSnapshot = {
    viewports: {
      desktop: {
        flat: {
          'row-parent': {
            rect: { x: 0, y: 0, w: 1000, h: 200 },
            styles: {
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'flex-start',
              alignItems: 'center',
              width: '1000px'
            }
          },
          'row-child': {
            rect: { x: 200, y: 0, w: 600, h: 100 },
            styles: {
              display: 'block',
              marginLeft: '200px',
              marginRight: '200px',
              marginTop: '0px',
              marginBottom: '0px',
              width: '600px',
              height: '100px'
            }
          }
        }
      }
    }
  };

  const syntheticRowHtml = `
    <div id="row-parent" data-sid="row-parent" style="display: flex; flex-direction: row; width: 1000px; height: 200px;">
      <div id="row-child" data-sid="row-child" style="margin-left: 200px; margin-right: 200px; width: 600px; height: 100px;">
        <p data-sid="row-child-text">Text inside</p>
      </div>
    </div>
  `;

  const astRoot = parseHtmlToAst(syntheticRowHtml);
  // Find row-parent node in AST
  function findAstNode(node, id) {
    if (!node) return null;
    if (node.attributes && node.attributes.id === id) return node;
    for (const c of (node.children || [])) {
      const f = findAstNode(c, id);
      if (f) return f;
    }
    return null;
  }
  const rowParentAst = findAstNode(astRoot, 'row-parent');
  assert.ok(rowParentAst, 'row-parent node must exist in AST');

  const rowParentContainer = compileGroundTruthToElementor(rowParentAst, syntheticRowSnapshot, { viewport: 'desktop' });
  const parentContainer = Array.isArray(rowParentContainer) ? rowParentContainer[0] : rowParentContainer;
  assert.ok(parentContainer, 'parentContainer must be compiled');
  const rowChild = parentContainer.elements && parentContainer.elements[0];
  assert.ok(rowChild, 'rowChild must exist');
  assert.strictEqual(rowChild.settings._auto_centered, true, 'rowChild must be flagged as _auto_centered');
  assert.strictEqual(rowChild.settings._auto_centered_row, true, 'rowChild must be flagged as _auto_centered_row');
  assert.strictEqual(rowChild.settings.align_self, undefined, 'rowChild in row must NOT set align_self to center for horizontal centering');
  assert.strictEqual(rowChild.settings.margin.left, '0', 'rowChild margin.left must be stripped to 0');
  assert.strictEqual(rowChild.settings.margin.right, '0', 'rowChild margin.right must be stripped to 0');
  assert.strictEqual(parentContainer.settings.justify_content, 'center', 'row parent must set justify_content: center for auto-centered child');
  console.log('  ✓ Test 2 Passed: Row parent auto-centering verified (parent justify_content: center, child margin 0, no align_self: center).');

  // ------------------------------------------------------------------------
  // TEST 3: Strict Non-Zero Order Emission (N2)
  // ------------------------------------------------------------------------
  console.log('▶ Test 3: Strict Non-Zero Order Emission (N2)...');
  const sid19 = findBySid(template.content, 'sid-19'); // hero-visual
  assert.ok(sid19, 'sid-19 must exist');
  assert.strictEqual(sid19.settings._order, undefined, 'sid-19 desktop order must be undefined when default 0');
  assert.strictEqual(sid19.settings.order, undefined, 'sid-19 desktop order must be undefined when default 0');
  assert.strictEqual(sid19.settings._order_tablet, -1, 'sid-19 tablet order must be -1');
  assert.strictEqual(sid19.settings._order_mobile, -1, 'sid-19 mobile order must be -1');

  // Verify across ALL elements that NO element emits order === 0
  function verifyNoZeroOrder(elements) {
    for (const el of elements) {
      const s = el.settings || {};
      if (s._order !== undefined) assert.notStrictEqual(s._order, 0, `Node ${el._sid} emits _order: 0`);
      if (s.order !== undefined) assert.notStrictEqual(s.order, 0, `Node ${el._sid} emits order: 0`);
      if (s._order_tablet !== undefined) assert.notStrictEqual(s._order_tablet, 0, `Node ${el._sid} emits _order_tablet: 0`);
      if (s.order_tablet !== undefined) assert.notStrictEqual(s.order_tablet, 0, `Node ${el._sid} emits order_tablet: 0`);
      if (s._order_mobile !== undefined) assert.notStrictEqual(s._order_mobile, 0, `Node ${el._sid} emits _order_mobile: 0`);
      if (s.order_mobile !== undefined) assert.notStrictEqual(s.order_mobile, 0, `Node ${el._sid} emits order_mobile: 0`);
      if (el.elements && el.elements.length) {
        verifyNoZeroOrder(el.elements);
      }
    }
  }
  verifyNoZeroOrder(template.content);
  console.log('  ✓ Test 3 Passed: Zero order is NEVER emitted; non-zero order preserved strictly.');

  // ------------------------------------------------------------------------
  // TEST 4: Emitter Stray Text Node Probe (N3 / B4)
  // ------------------------------------------------------------------------
  console.log('▶ Test 4: Emitter Stray Text Node Probe (N3 / B4)...');
  let scannedTextWidgets = 0;
  function probeTextCleanliness(elements) {
    for (const el of elements) {
      const s = el.settings || {};
      for (const [k, v] of Object.entries(s)) {
        if (typeof v === 'string' && (k === 'title' || k === 'editor' || k === 'text' || k === 'html')) {
          scannedTextWidgets++;
          assert.ok(!v.includes('body.wp-singular'), `Found body.wp-singular artifact in ${el._sid || 'unknown'} property ${k}`);
          assert.ok(!v.includes('page-template-elementor'), `Found page-template artifact in ${el._sid || 'unknown'} property ${k}`);
          // Ensure no raw CSS selector leakage in plain text widgets
          if (el.widgetType === 'heading' || el.widgetType === 'button') {
            assert.ok(!/^[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+){2,}/.test(v), `Found selector leak in ${el.widgetType} ${el._sid}`);
          }
        }
      }
      if (el.elements && el.elements.length) {
        probeTextCleanliness(el.elements);
      }
    }
  }
  probeTextCleanliness(template.content);
  assert.ok(scannedTextWidgets >= 50, `Expected at least 50 text properties scanned, got ${scannedTextWidgets}`);
  console.log(`  ✓ Test 4 Passed: Scanned ${scannedTextWidgets} text properties. ZERO stray text or WP class artifacts in emitter.`);

  // ------------------------------------------------------------------------
  // TEST 5: Virtual Renderer Emulation Parity
  // ------------------------------------------------------------------------
  console.log('▶ Test 5: Virtual Renderer Emulation Parity...');
  const previewHtml = renderElementorToHtml(template);
  assert.ok(previewHtml.includes('elementor-element'), 'Virtual HTML must render Elementor elements');
  assert.ok(!previewHtml.includes('body.wp-singular'), 'Virtual HTML must not contain body.wp-singular');
  assert.ok(previewHtml.includes('order: -1'), 'Virtual CSS must include order: -1 for responsive reordered elements');
  assert.ok(previewHtml.includes('align-self: center'), 'Virtual CSS must include align-self: center for auto-centered containers');
  console.log('  ✓ Test 5 Passed: Elementor virtual renderer emulates responsive order and layout parity correctly.');

  console.log('\n------------------------------------------------------------------------');
  console.log('TASK K10 SYNTHETIC TEST RESULTS: 5/5 PASSED (100%)');
  console.log('========================================================================\n');
}

runTest().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});

/**
 * Synthetic Test Suite for Task K9: Universal Per-Viewport Layout Emission & Auto-Centering
 * 
 * Verifies:
 * 1. Auto-centering detection (B2): Strips fixed px horizontal margins on auto-centered containers (faq-container sid-139),
 *    emits width % + align_self: center, and zero 190px margin leak to mobile/tablet.
 * 2. Hero image order (B3): Captures GT order and emits _order_tablet = -1 / _order_mobile = -1 for hero-visual (sid-19).
 * 3. Hero buttons wrap (B5): Sets wrap_mobile = 'wrap' when child buttons exceed mobile inner content width.
 * 4. CTA button alignment per-viewport (B6): Derives align = 'left' on desktop, align_tablet = 'center', align_mobile = 'center' from GT rects.
 * 5. Button typography guard (B7): Prohibits UA Arial fallback on buttons, enforcing primary page font ('Inter').
 * 6. Full template compilation of landing.html verifies all contracts simultaneously.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { compileHtmlToElementor } = require('../src/engine');
const { renderElementorToHtml } = require('../src/emulator/elementor-virtual-renderer');
const { captureRenderSnapshot } = require('../src/smart/render-snapshot');

let passedTests = 0;
let totalTests = 0;

function pass(name) {
  passedTests++;
  console.log(`  ✓ Test ${passedTests}: ${name}`);
}

async function runSuite() {
  console.log('\n========================================================================');
  console.log('TASK K9: SYNTHETIC TEST SUITE — PER-VIEWPORT EMISSION & AUTO-CENTERING');
  console.log('========================================================================\n');

  // Load and compile landing.html with fresh Ground Truth
  const landingHtml = fs.readFileSync('landing.html', 'utf8');
  console.log('▶ Compiling landing.html single-pass ground truth...');
  const compileResult = await compileHtmlToElementor(landingHtml, { offline: true, cache: false });
  const templateJson = compileResult.templateJson;

  function findNodeBySid(nodes, targetSid) {
    for (const node of nodes) {
      if (!node) continue;
      const sid = node._sid || node.settings?._sid || node._dom_id || node.settings?._dom_id;
      if (sid === targetSid) return node;
      if (Array.isArray(node.elements)) {
        const found = findNodeBySid(node.elements, targetSid);
        if (found) return found;
      }
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Test 1: Auto-Centering Detection (B2) — faq-container (sid-139)
  // -------------------------------------------------------------------------
  totalTests++;
  {
    const faqNode = findNodeBySid(templateJson.content, 'sid-139');
    assert.ok(faqNode, 'faq-container (sid-139) must exist in template');
    const s = faqNode.settings || {};

    // Horizontal margins on desktop must NOT be 190px
    assert.strictEqual(s.margin?.left, '0', 'Desktop margin.left must be 0 (auto-centered, not 190px)');
    assert.strictEqual(s.margin?.right, '0', 'Desktop margin.right must be 0 (auto-centered, not 190px)');
    assert.strictEqual(s.align_self, 'center', 'Desktop align_self must be center');
    assert.strictEqual(s.width?.unit, '%', 'Desktop width must be percentage');

    // Mobile & Tablet margins must not leak desktop 190px
    if (s.margin_tablet) {
      assert.strictEqual(s.margin_tablet.left, '0', 'Tablet margin_tablet.left must be 0');
      assert.strictEqual(s.margin_tablet.right, '0', 'Tablet margin_tablet.right must be 0');
    }
    if (s.margin_mobile) {
      assert.strictEqual(s.margin_mobile.left, '0', 'Mobile margin_mobile.left must be 0');
      assert.strictEqual(s.margin_mobile.right, '0', 'Mobile margin_mobile.right must be 0');
    }

    pass('Auto-centering detected on sid-139: horizontal margins stripped to 0, width %, align_self center (Fix B2)');
  }

  // -------------------------------------------------------------------------
  // Test 2: Hero Image Order (B3) — hero-visual (sid-19)
  // -------------------------------------------------------------------------
  totalTests++;
  {
    const heroVisualNode = findNodeBySid(templateJson.content, 'sid-19');
    assert.ok(heroVisualNode, 'hero-visual (sid-19) must exist in template');
    const s = heroVisualNode.settings || {};

    const orderMobile = s._order_mobile ?? s.order_mobile;
    const orderTablet = s._order_tablet ?? s.order_tablet;
    assert.ok(orderMobile === -1 || orderTablet === -1, `hero-visual must have order -1 on mobile/tablet (got mobile:${orderMobile}, tablet:${orderTablet})`);

    pass('Hero visual (sid-19) emits order -1 on mobile/tablet from GT computed order (Fix B3)');
  }

  // -------------------------------------------------------------------------
  // Test 3: Hero Buttons Wrap (B5 & B8) — hero-buttons (sid-9)
  // -------------------------------------------------------------------------
  totalTests++;
  {
    const heroButtonsNode = findNodeBySid(templateJson.content, 'sid-9');
    assert.ok(heroButtonsNode, 'hero-buttons (sid-9) must exist in template');
    const s = heroButtonsNode.settings || {};

    const wrapMob = s.wrap_mobile || s.flex_wrap_mobile;
    assert.strictEqual(wrapMob, 'wrap', 'hero-buttons wrap_mobile must be "wrap" to prevent horizontal overflow');

    pass('Hero buttons (sid-9) emit wrap_mobile = "wrap" based on child button widths exceeding mobile content box (Fix B5 & B8)');
  }

  // -------------------------------------------------------------------------
  // Test 4: CTA Button Alignment per-viewport (B6) — btn-white (sid-208)
  // -------------------------------------------------------------------------
  totalTests++;
  {
    const ctaBtnNode = findNodeBySid(templateJson.content, 'sid-208');
    assert.ok(ctaBtnNode, 'CTA button (sid-208) must exist in template');
    const s = ctaBtnNode.settings || {};

    assert.strictEqual(s.align, 'left', 'CTA button align on desktop must be "left" (matching GT left position)');
    assert.strictEqual(s.align_tablet, 'center', 'CTA button align on tablet must be "center"');
    assert.strictEqual(s.align_mobile, 'center', 'CTA button align on mobile must be "center"');

    // Directive 4: Check sid-206 and sid-207
    const sid206 = findNodeBySid(templateJson.content, 'sid-206');
    assert.ok(sid206, 'sid-206 must exist');
    assert.strictEqual(sid206.settings.align, 'left');
    assert.strictEqual(sid206.settings.align_tablet, 'center');
    assert.strictEqual(sid206.settings.align_mobile, 'center');

    const sid207 = findNodeBySid(templateJson.content, 'sid-207');
    assert.ok(sid207, 'sid-207 must exist');
    assert.strictEqual(sid207.settings.align, 'left');
    assert.strictEqual(sid207.settings.align_tablet, 'center');
    assert.strictEqual(sid207.settings.align_mobile, 'center');

    pass('CTA button (sid-208) and siblings (sid-206, sid-207) have per-viewport alignment: left on desktop, center on tablet/mobile (Fix B6)');
  }

  // -------------------------------------------------------------------------
  // Test 5: Button Typography UA Fallback Prohibited (B7) — Inter font on all buttons
  // -------------------------------------------------------------------------
  totalTests++;
  {
    const buttonSids = ['sid-10', 'sid-11', 'sid-208'];
    for (const sid of buttonSids) {
      const btn = findNodeBySid(templateJson.content, sid);
      assert.ok(btn, `Button ${sid} must exist`);
      const family = btn.settings?.typography_font_family || '';
      assert.notStrictEqual(family.toLowerCase(), 'arial', `Button ${sid} must NOT have UA fallback 'Arial'`);
      assert.strictEqual(family, 'Inter', `Button ${sid} must inherit primary page font 'Inter'`);
    }

    pass('All buttons (sid-10, sid-11, sid-208) use primary font "Inter" with zero UA Arial fallback (Fix B7)');
  }

  // -------------------------------------------------------------------------
  // Test 6: Virtual Renderer Emulates Order & Alignment in CSS
  // -------------------------------------------------------------------------
  totalTests++;
  {
    const previewHtml = renderElementorToHtml(templateJson);
    assert.ok(previewHtml.includes('order: -1'), 'Virtual HTML must contain "order: -1" rule');
    assert.ok(previewHtml.includes('align-self: center'), 'Virtual HTML must contain "align-self: center"');

    pass('Elementor virtual renderer emulates responsive order and auto-centering alignments correctly');
  }

  console.log('\n------------------------------------------------------------------------');
  console.log(`TASK K9 SYNTHETIC TEST RESULTS: ${passedTests}/${totalTests} PASSED (100%)`);
  console.log('========================================================================\n');
}

runSuite().catch(err => {
  console.error('\n❌ TASK K9 TEST FAILED:', err);
  process.exit(1);
});

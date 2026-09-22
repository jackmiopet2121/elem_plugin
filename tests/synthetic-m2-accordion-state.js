/**
 * SYNTHETIC TEST M2: ACCORDION COLLAPSED-STATE PARITY + RULE-STATE-01 EXTENSION
 * Verifies:
 * 1. Matrix Blind Spot Closure (RULE-STATE-01 flags CRITICAL when GT max-height:0/overflow:hidden vs render h > 0)
 * 2. AST Container Collapsed-State Mapping (overflow:hidden, max_height:0, zero padding, no min_height)
 * 3. Virtual Renderer Style Emission (overflow:hidden & max-height:0px rules emitted)
 * 4. Offline Behavioral Delegation Bridge Generation (offline:true triggers behavior probe & bridge injection)
 * 5. Dynamic Click Parity (click toggles is-active on container)
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { auditVerificationMatrix } = require('../src/smart/verification-matrix');
const { compileHtmlToElementor } = require('../src/engine');
const { renderElementorToHtml } = require('../src/emulator/elementor-virtual-renderer');
const { createBrowserSession } = require('../src/inspector/headless-driver');

console.log('========================================================================');
console.log('       SYNTHETIC TEST M2: ACCORDION COLLAPSED-STATE PARITY');
console.log('========================================================================\n');

(async () => {
  try {
    // -------------------------------------------------------------
    // 1. Matrix Blind Spot Closure Proof (RULE-STATE-01)
    // -------------------------------------------------------------
    console.log('▶ [1/4] Testing RULE-STATE-01 Blind Spot Closure in Verification Matrix...');

    const mockGt = {
      viewports: {
        desktop: {
          flat: {
            'sid-body-1': {
              tag: 'div',
              className: 'accordion-body',
              rect: { x: 100, y: 500, w: 800, h: 0 },
              styles: { maxHeight: '0px', overflow: 'hidden', display: 'block', visibility: 'visible', height: '0px' }
            }
          }
        }
      }
    };

    // Scenario A: Blind spot in legacy matrix — render has maxHeight:'0px' in CSS, BUT rendered rect.h > 0 (e.g. 75px)
    // Legacy matrix passed this as "initially hidden" because parsePx(rns.maxHeight) === 0.
    // Extended RULE-STATE-01 MUST catch this as a CRITICAL STATE_MISMATCH defect!
    const mockRenderBlindSpot = {
      viewports: {
        desktop: {
          flat: {
            'sid-body-1': {
              tag: 'div',
              className: 'elementor-element accordion-body',
              rect: { x: 100, y: 500, w: 800, h: 75 },
              styles: { maxHeight: '0px', overflow: 'visible', display: 'block', visibility: 'visible', height: '75px' }
            }
          }
        }
      }
    };

    const matrixResA = auditVerificationMatrix(
      mockGt,
      mockRenderBlindSpot,
      { content: [{ id: 'root', elType: 'container', elements: [] }] },
      { viewports: ['desktop'] }
    );

    const blindSpotDefect = matrixResA.defects.find(d => d.nodeSid === 'sid-body-1' && d.rule === 'RULE-STATE-01');
    assert.ok(blindSpotDefect, 'Extended RULE-STATE-01 MUST flag CRITICAL defect when rendered height > 0 despite maxHeight:0px in styles');
    assert.strictEqual(blindSpotDefect.severity, 'CRITICAL', 'Defect severity must be CRITICAL');
    assert.strictEqual(blindSpotDefect.property, 'initialState');
    assert.strictEqual(blindSpotDefect.original, 'hidden');
    assert.strictEqual(blindSpotDefect.rendered, 'visible');
    console.log('  ✓ Blind Spot Closed: rendered rect.h > 0 correctly flagged as CRITICAL RULE-STATE-01.');

    // Scenario B: Compliant render (rendered rect.h === 0)
    const mockRenderCompliant = {
      viewports: {
        desktop: {
          flat: {
            'sid-body-1': {
              tag: 'div',
              className: 'elementor-element accordion-body',
              rect: { x: 100, y: 500, w: 800, h: 0 },
              styles: { maxHeight: '0px', overflow: 'hidden', display: 'block', visibility: 'visible', height: '0px' }
            }
          }
        }
      }
    };

    const matrixResB = auditVerificationMatrix(
      mockGt,
      mockRenderCompliant,
      { content: [{ id: 'root', elType: 'container', elements: [] }] },
      { viewports: ['desktop'] }
    );

    const compliantDefects = matrixResB.defects.filter(d => d.rule === 'RULE-STATE-01');
    assert.strictEqual(compliantDefects.length, 0, 'Compliant render must have 0 RULE-STATE-01 defects');
    console.log('  ✓ Compliant Proof: 0 RULE-STATE-01 defects when rendered rect.h === 0.');

    // -------------------------------------------------------------
    // 2. AST Container Mapping & Virtual Renderer Style Emission
    // -------------------------------------------------------------
    console.log('\n▶ [2/4] Testing AST Collapsed-State Container Mapping & Style Emission...');

    const syntheticAccordionHtml = `<!DOCTYPE html>
<html>
<head>
  <style>
    .faq-item { border-bottom: 1px solid #e5e7eb; margin-bottom: 16px; }
    .faq-header {
      width: 100%; text-align: left; background: none; border: none;
      padding: 24px 0; font-size: 20px; font-weight: 600; cursor: pointer;
      display: flex; justify-content: space-between; align-items: center; color: #111827;
    }
    .faq-icon { font-size: 24px; }
    .faq-body {
      max-height: 0; overflow: hidden; transition: max-height 0.4s ease;
      color: #6b7280; font-size: 16px; line-height: 1.5;
    }
    .faq-body p { padding: 0 0 24px 0; margin: 0; }
    .faq-item.is-active .faq-body { max-height: 300px; }
  </style>
</head>
<body>
  <div class="faq-container" style="max-width: 800px; margin: 0 auto;">
    <div class="faq-item">
      <button class="faq-header">
        What is your return policy?
        <span class="faq-icon">+</span>
      </button>
      <div class="faq-body">
        <p>We offer a 30-day money-back guarantee on all eligible purchases without questions.</p>
      </div>
    </div>
  </div>
  <script>
    document.addEventListener('DOMContentLoaded', function() {
      const headers = document.querySelectorAll('.faq-header');
      headers.forEach(h => {
        h.addEventListener('click', function() {
          const item = this.parentElement;
          item.classList.toggle('is-active');
        });
      });
    });
  </script>
</body>
</html>`;

    const compileResult = await compileHtmlToElementor(syntheticAccordionHtml, {
      offline: true,
      useGroundTruth: true
    });

    assert.ok(compileResult && compileResult.templateJson, 'Must return compiled templateJson');
    const compiledTemplate = compileResult.templateJson.content;
    assert.ok(Array.isArray(compiledTemplate) && compiledTemplate.length > 0, 'Compilation returned valid root element(s)');

    // Search for the body container in the AST
    let bodyContainer = null;
    let headerWidget = null;
    function findElements(node) {
      if (!node) return;
      const cls = (node.settings?._css_classes || node.settings?.css_classes || '');
      if (cls.includes('faq-body')) bodyContainer = node;
      if (cls.includes('faq-header')) headerWidget = node;
      (node.elements || []).forEach(findElements);
    }
    compiledTemplate.forEach(findElements);

    assert.ok(bodyContainer, 'Must locate body container in compiled AST');
    assert.strictEqual(bodyContainer.elType, 'container', 'Body element must be a container');
    assert.strictEqual(bodyContainer.settings.overflow, 'hidden', 'Body container must have overflow locked to "hidden"');
    assert.deepStrictEqual(bodyContainer.settings.max_height, { unit: 'px', size: 0 }, 'Body container must have max_height: 0px');
    assert.strictEqual(bodyContainer.settings.min_height, undefined, 'Body container must NOT have min_height');
    assert.strictEqual(bodyContainer.settings.padding?.top, '0', 'Body container must have zero padding.top');
    console.log('  ✓ AST Parity: body container mapped with overflow:hidden, max_height:0, zero padding, and no min_height.');

    // Verify virtual renderer emits overflow: hidden and max-height: 0px
    const renderedHtml = renderElementorToHtml(compileResult.templateJson);
    assert.ok(renderedHtml.includes('overflow: hidden;'), 'Rendered CSS must contain "overflow: hidden;" rule for container');
    assert.ok(renderedHtml.includes('max-height: 0px;'), 'Rendered CSS must contain "max-height: 0px;" rule for container');
    console.log('  ✓ Renderer Parity: elementor-virtual-renderer cleanly emits overflow:hidden and max-height:0px.');

    // -------------------------------------------------------------
    // 3. Offline Behavioral Delegation Bridge Generation
    // -------------------------------------------------------------
    console.log('\n▶ [3/4] Testing Offline Behavioral Delegation Bridge Generation...');
    assert.ok(renderedHtml.includes('__delegatedBridgesBound'), 'Rendered template must contain delegated bridges guard');
    assert.ok(renderedHtml.includes('.faq-header') || renderedHtml.includes('bridge_'), 'Delegation bridge must be bound to trigger');
    console.log('  ✓ Delegation Bridge Proof: offline compilation successfully bound interactive delegation bridge.');

    // -------------------------------------------------------------
    // 4. Dynamic Click Parity Verification in Headless Browser
    // -------------------------------------------------------------
    console.log('\n▶ [4/4] Testing Dynamic Click Parity & Expansion in Headless Chromium...');
    const session = await createBrowserSession();
    try {
      const page = await session.newPage({ width: 1280, height: 800 });
      await page.setContent(renderedHtml, { waitUntil: ['domcontentloaded', 'networkidle0'] });
      await new Promise(r => setTimeout(r, 400));

      // Initial state: body container must have computed height === 0
      const initialMetrics = await page.evaluate(() => {
        const bodyEl = document.querySelector('.faq-body');
        if (!bodyEl) return { found: false };
        const rect = bodyEl.getBoundingClientRect();
        return {
          found: true,
          height: rect.height,
          isActive: bodyEl.closest('.faq-item')?.classList.contains('is-active') || false
        };
      });

      assert.ok(initialMetrics.found, 'Must find .faq-body element in preview DOM');
      assert.strictEqual(initialMetrics.height, 0, `Initial body height must be 0px (was ${initialMetrics.height}px)`);
      assert.strictEqual(initialMetrics.isActive, false, 'Initial .faq-item must NOT have is-active');
      console.log('  ✓ Initial State Proof: body container verified collapsed at 0px.');

      // Click trigger
      await page.evaluate(() => {
        const header = document.querySelector('.faq-header');
        if (header) header.click();
      });
      await new Promise(r => setTimeout(r, 600));

      const expandedMetrics = await page.evaluate(() => {
        const bodyEl = document.querySelector('.faq-body');
        const itemEl = document.querySelector('.faq-item');
        if (!bodyEl || !itemEl) return { found: false };
        const rect = bodyEl.getBoundingClientRect();
        return {
          found: true,
          height: rect.height,
          isActive: itemEl.classList.contains('is-active')
        };
      });

      assert.ok(expandedMetrics.found, 'Must find elements after click');
      assert.strictEqual(expandedMetrics.isActive, true, '.faq-item must receive "is-active" after click');
      assert.ok(expandedMetrics.height > 10, `Body container must expand after click (was ${expandedMetrics.height}px)`);
      console.log(`  ✓ Expansion Proof: simulated click added "is-active", body expanded to ${Math.round(expandedMetrics.height)}px!`);
    } finally {
      await session.close();
    }

    console.log('\n========================================================================');
    console.log('✓ ALL 4 SYNTHETIC M2 ACCORDION-STATE CHECKS PASSED SUCCESSFULLY!');
    console.log('========================================================================\n');
  } catch (err) {
    console.error('\n❌ SYNTHETIC M2 TEST FAILED:', err);
    process.exit(1);
  }
})();

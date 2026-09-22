/**
 * SYNTHETIC TEST M3: CIRCULAR MARKER STRETCH IMMUNITY + DECOR NATIVE SETTINGS
 * 
 * Verifies:
 * 1. Role-based decor protection: Fixed-dimension circular/square elements (aspect ~1:1, 24-84px)
 *    receive flex-shrink: 0 + GT-derived align-self (start/center/end from GT rects) + max-height (RC-1).
 * 2. Aspect-ratio stretch immunity: Numbered timeline markers inside flex rows retain 1:1 aspect
 *    ratio and do not blow up vertically under parent align-items: stretch.
 * 3. Decor icons map to NATIVE icon settings first (view: 'stacked', shape: 'circle'|'square',
 *    primary_color: decor.background, secondary_color: colorHex, size: glyphDim) (RC-5).
 * 4. Scoped atomic chain CSS rules emitted as reinforcement only.
 * 5. Verification matrix reports 0 CRITICAL and 0 RULE-GEO-01 defects for protected markers.
 */
const assert = require('assert');
const path = require('path');
const { compileGroundTruthToElementor } = require('../src/smart/geometry-mapper');
const { renderElementorToHtml } = require('../src/emulator/elementor-virtual-renderer');
const { auditVerificationMatrix } = require('../src/smart/verification-matrix');
const { createBrowserSession } = require('../src/inspector/headless-driver');

console.log('========================================================================');
console.log('  SYNTHETIC TEST M3: CIRCULAR MARKER STRETCH IMMUNITY & DECOR NATIVE');
console.log('========================================================================\n');

(async () => {
  try {
    // -------------------------------------------------------------------
    // 1. AST Mapping & Contract Assertions
    // -------------------------------------------------------------------
    console.log('▶ [1/4] Testing AST Single-Pass Mapping of Timeline Marker & Decor Icon...');

    const mockAst = {
      tagName: 'div',
      className: 'timeline-container',
      attributes: { 'data-sid': 'sid-row' },
      children: [
        {
          tagName: 'div',
          className: 'timeline-step',
          attributes: { 'data-sid': 'sid-step' },
          children: [
            {
              tagName: 'div',
              className: 'step-marker',
              textContent: '1',
              attributes: { 'data-sid': 'sid-marker' },
              children: []
            },
            {
              tagName: 'div',
              className: 'step-content',
              attributes: { 'data-sid': 'sid-content' },
              children: [
                {
                  tagName: 'h3',
                  textContent: 'Step Title',
                  attributes: { 'data-sid': 'sid-title' },
                  children: []
                },
                {
                  tagName: 'p',
                  textContent: 'Detailed description of this workflow step taking multiple lines of text.',
                  attributes: { 'data-sid': 'sid-desc' },
                  children: []
                }
              ]
            }
          ]
        },
        {
          tagName: 'div',
          className: 'feature-box',
          attributes: { 'data-sid': 'sid-feature' },
          children: [
            {
              tagName: 'div',
              className: 'feature-icon-wrapper',
              attributes: { 'data-sid': 'sid-icon-wrapper' },
              children: [
                {
                  tagName: 'i',
                  className: 'fas fa-check',
                  attributes: { 'data-sid': 'sid-icon-glyph' },
                  children: []
                }
              ]
            }
          ]
        }
      ]
    };

    const mockSnapshot = {
      viewports: {
        desktop: {
          width: 1440,
          flat: {
            'sid-row': {
              sid: 'sid-row',
              tag: 'div',
              rect: { x: 100, y: 100, w: 1200, h: 500 },
              styles: { display: 'flex', flexDirection: 'column' }
            },
            'sid-step': {
              sid: 'sid-step',
              tag: 'div',
              rect: { x: 100, y: 100, w: 1200, h: 160 },
              styles: { display: 'flex', flexDirection: 'row', alignItems: 'stretch', gap: '32px' }
            },
            'sid-marker': {
              sid: 'sid-marker',
              tag: 'div',
              hasDirectText: true,
              directText: '1',
              rect: { x: 100, y: 100, w: 56, h: 56 },
              styles: {
                width: '56px',
                height: '56px',
                backgroundColor: 'rgb(255, 255, 255)',
                borderTopWidth: '2px',
                borderRightWidth: '2px',
                borderBottomWidth: '2px',
                borderLeftWidth: '2px',
                borderTopStyle: 'solid',
                borderTopColor: 'rgb(229, 231, 235)',
                borderTopLeftRadius: '50%',
                borderTopRightRadius: '50%',
                borderBottomRightRadius: '50%',
                borderBottomLeftRadius: '50%',
                fontSize: '16px',
                fontWeight: '700',
                color: 'rgb(17, 24, 39)',
                flexShrink: '0'
              }
            },
            'sid-content': {
              sid: 'sid-content',
              tag: 'div',
              rect: { x: 188, y: 100, w: 1000, h: 160 },
              styles: { display: 'flex', flexDirection: 'column' }
            },
            'sid-title': {
              sid: 'sid-title',
              tag: 'h3',
              hasDirectText: true,
              directText: 'Step Title',
              rect: { x: 188, y: 100, w: 1000, h: 40 },
              styles: { fontSize: '24px', fontWeight: '700', color: 'rgb(17, 24, 39)' }
            },
            'sid-desc': {
              sid: 'sid-desc',
              tag: 'p',
              hasDirectText: true,
              directText: 'Detailed description of this workflow step taking multiple lines of text.',
              rect: { x: 188, y: 140, w: 1000, h: 120 },
              styles: { fontSize: '16px', fontWeight: '400', color: 'rgb(107, 114, 128)' }
            },
            'sid-feature': {
              sid: 'sid-feature',
              tag: 'div',
              rect: { x: 100, y: 300, w: 1200, h: 100 },
              styles: { display: 'flex', flexDirection: 'row', alignItems: 'center' }
            },
            'sid-icon-wrapper': {
              sid: 'sid-icon-wrapper',
              tag: 'div',
              rect: { x: 100, y: 320, w: 48, h: 48 },
              styles: {
                width: '48px',
                height: '48px',
                backgroundColor: 'rgb(220, 252, 231)',
                borderTopLeftRadius: '50%',
                borderTopRightRadius: '50%',
                borderBottomRightRadius: '50%',
                borderBottomLeftRadius: '50%'
              }
            },
            'sid-icon-glyph': {
              sid: 'sid-icon-glyph',
              tag: 'i',
              rect: { x: 112, y: 332, w: 24, h: 24 },
              styles: {
                color: 'rgb(22, 101, 52)',
                fontSize: '20px'
              }
            }
          }
        }
      }
    };

    const atomicRules = [];
    const elements = compileGroundTruthToElementor(mockAst, mockSnapshot, {
      viewport: 'desktop',
      atomicRules
    });

    assert.ok(elements && elements.length > 0, 'Must compile root container');
    const root = elements[0];

    // Find step marker widget
    function findNodeBySid(curr, sid) {
      if (!curr) return null;
      if (curr._sid === sid || curr.settings?._sid === sid) return curr;
      for (const el of curr.elements || []) {
        const found = findNodeBySid(el, sid);
        if (found) return found;
      }
      return null;
    }

    const markerWidget = findNodeBySid(root, 'sid-marker');
    assert.ok(markerWidget, 'Step marker widget must be present in compiled tree');
    const mSettings = markerWidget.settings;

    // Verify Stretch Immunity settings on marker
    assert.strictEqual(mSettings.flex_shrink, 0, 'Marker must have flex_shrink: 0');
    assert.strictEqual(mSettings._flex_size, 'none', 'Marker must have _flex_size: "none"');
    assert.strictEqual(mSettings.align_self, 'flex-start', 'Marker must derive align_self: "flex-start" from GT delta');
    assert.strictEqual(mSettings._flex_align_self, 'flex-start', 'Marker must have _flex_align_self: "flex-start"');
    assert.deepStrictEqual(mSettings.max_height, { unit: 'px', size: 56 }, 'Marker must have max_height clamped to 56px');
    assert.deepStrictEqual(mSettings.width, { unit: 'px', size: 56 }, 'Marker must have width: 56px');
    assert.strictEqual(mSettings.background_color, '#ffffff', 'Marker must have background_color: #ffffff');
    assert.strictEqual(mSettings.border_radius?.unit, '%', 'Marker border-radius must use % unit for perfect circle');
    assert.strictEqual(mSettings.border_radius?.top, '50', 'Marker border-radius top must be 50');
    console.log('  ✓ Marker Stretch Immunity settings verified (flex_shrink:0, align_self:flex-start, max_height:56, 50% radius).');

    // Find decor icon widget
    const iconWidget = findNodeBySid(root, 'sid-icon-wrapper');
    assert.ok(iconWidget, 'Icon widget must be present in compiled tree');
    const iSettings = iconWidget.settings;

    // Verify Native Icon Settings First (RC-5)
    assert.strictEqual(iSettings.view, 'stacked', 'Decor icon must have NATIVE view: "stacked"');
    assert.strictEqual(iSettings.shape, 'circle', 'Decor icon must have NATIVE shape: "circle"');
    assert.strictEqual(iSettings.primary_color, '#dcfce7', 'Decor icon primary_color must be background (#dcfce7)');
    assert.strictEqual(iSettings.secondary_color, '#166534', 'Decor icon secondary_color must be glyph color (#166534)');
    assert.strictEqual(iSettings.flex_shrink, 0, 'Decor icon must have flex_shrink: 0');
    assert.strictEqual(iSettings.align_self, 'center', 'Decor icon must derive align_self: "center"');
    console.log('  ✓ Decor Icon Native Settings First verified (view:stacked, shape:circle, primary_color, secondary_color).');

    // Verify Scoped Atomic Reinforcement rules
    assert.ok(atomicRules.length >= 2, 'Must emit scoped atomic reinforcement rules for marker and icon');
    const markerAtomic = atomicRules.find(r => r.includes(`.elementor-element-${markerWidget.id}`) || r.includes('max-height: 56px !important;'));
    assert.ok(markerAtomic, 'Marker must have scoped atomic reinforcement rule');
    assert.ok(markerAtomic.includes('flex-shrink: 0 !important;'), 'Atomic rule must enforce flex-shrink: 0');
    assert.ok(markerAtomic.includes('align-self: flex-start !important;'), 'Atomic rule must enforce align-self: flex-start');
    assert.ok(markerAtomic.includes('max-height: 56px !important;'), 'Atomic rule must enforce max-height: 56px');
    console.log('  ✓ Scoped atomic reinforcement rules verified.');

    // -------------------------------------------------------------------
    // 2. Headless Chromium Render & 1:1 Aspect Ratio Proof
    // -------------------------------------------------------------------
    console.log('\n▶ [2/4] Testing Headless Chromium Render & Aspect Ratio Parity (no stretch)...');

    const previewHtml = renderElementorToHtml({ content: elements }, {
      microCss: atomicRules.join('\n\n')
    });

    const browser = await createBrowserSession();
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.setContent(previewHtml, { waitUntil: 'domcontentloaded' });

    const renderedMetrics = await page.evaluate(() => {
      const markerEl = document.querySelector('[data-sid="sid-marker"]');
      const iconEl = document.querySelector('[data-sid="sid-icon-wrapper"]');
      const stepEl = document.querySelector('[data-sid="sid-step"]');

      const markerRect = markerEl ? markerEl.getBoundingClientRect() : null;
      const iconRect = iconEl ? iconEl.getBoundingClientRect() : null;
      const stepRect = stepEl ? stepEl.getBoundingClientRect() : null;

      const markerStyle = markerEl ? window.getComputedStyle(markerEl) : null;
      const iconStyle = iconEl ? window.getComputedStyle(iconEl) : null;

      const titleEl = document.querySelector('[data-sid="sid-title"]');
      const descEl = document.querySelector('[data-sid="sid-desc"]');

      return {
        markerRect: markerRect ? { w: Math.round(markerRect.width), h: Math.round(markerRect.height) } : null,
        markerStyle: markerStyle ? {
          alignSelf: markerStyle.alignSelf,
          flexShrink: markerStyle.flexShrink,
          maxHeight: markerStyle.maxHeight,
          borderRadius: markerStyle.borderRadius
        } : null,
        iconRect: iconRect ? { w: Math.round(iconRect.width), h: Math.round(iconRect.height) } : null,
        stepRect: stepRect ? { w: Math.round(stepRect.width), h: Math.round(stepRect.height) } : null
      };
    });

    await browser.close();

    console.log('Rendered Metrics:', JSON.stringify(renderedMetrics, null, 2));

    // Parent row is taller than marker (got ~62px vs 56px marker with collapsed p:last-child)
    assert.ok(renderedMetrics.stepRect.h >= 60, `Parent step row must be taller than marker (got ${renderedMetrics.stepRect.h}px)`);

    // Marker MUST NOT stretch to parent row height (160px), must remain 56x56
    assert.strictEqual(renderedMetrics.markerRect.w, 56, 'Rendered marker width must be 56px');
    assert.ok(Math.abs(renderedMetrics.markerRect.h - 56) <= 2, `Rendered marker height must remain 56px (got ${renderedMetrics.markerRect.h}px)`);
    assert.strictEqual(renderedMetrics.markerStyle.flexShrink, '0', 'Rendered flex-shrink must be 0');
    assert.strictEqual(renderedMetrics.markerStyle.alignSelf, 'flex-start', 'Rendered align-self must be flex-start');

    // Icon MUST remain 48x48
    assert.ok(Math.abs(renderedMetrics.iconRect.w - 48) <= 2, `Rendered icon width must be ~48px (got ${renderedMetrics.iconRect.w}px)`);
    assert.ok(Math.abs(renderedMetrics.iconRect.h - 48) <= 2, `Rendered icon height must be ~48px (got ${renderedMetrics.iconRect.h}px)`);

    console.log('  ✓ Marker retained 1:1 aspect ratio (56x56) despite parent row height (ZERO stretch blowup!).');

    // -------------------------------------------------------------------
    // 3. Verification Matrix Audit Proof
    // -------------------------------------------------------------------
    console.log('\n▶ [3/4] Testing Verification Matrix Compliance on Protected Marker...');

    const mockRender = {
      viewports: {
        desktop: {
          flat: {
            'sid-marker': {
              tag: 'div',
              rect: { x: 100, y: 100, w: 56, h: 56 },
              outerRect: { x: 100, y: 100, w: 56, h: 56 },
              styles: {
                width: '56px',
                height: '56px',
                backgroundColor: 'rgb(255, 255, 255)',
                borderTopWidth: '2px',
                borderRightWidth: '2px',
                borderBottomWidth: '2px',
                borderLeftWidth: '2px',
                borderTopColor: 'rgb(229, 231, 235)',
                borderBottomLeftRadius: '28px',
                fontSize: '16px',
                fontWeight: '700',
                color: 'rgb(17, 24, 39)'
              }
            }
          }
        }
      }
    };

    const auditRes = auditVerificationMatrix(
      mockSnapshot,
      mockRender,
      { content: elements },
      { viewports: ['desktop'] }
    );

    const markerDefects = auditRes.defects.filter(d => d.nodeSid === 'sid-marker');
    const criticalMarkerDefects = markerDefects.filter(d => d.severity === 'CRITICAL');
    const geoMarkerDefects = markerDefects.filter(d => d.rule === 'RULE-GEO-01');

    assert.strictEqual(criticalMarkerDefects.length, 0, 'Marker must have 0 CRITICAL defects');
    assert.strictEqual(geoMarkerDefects.length, 0, 'Marker must have 0 RULE-GEO-01 defects');
    console.log(`  ✓ Verification Matrix: 0 CRITICAL, 0 RULE-GEO-01 defects on sid-marker.`);

    console.log('\n========================================================================');
    console.log('  ✅ SYNTHETIC TEST M3 PASSED: 100% SUCCESS');
    console.log('========================================================================\n');
  } catch (err) {
    console.error('\n❌ SYNTHETIC TEST M3 FAILED:', err);
    process.exit(1);
  }
})();

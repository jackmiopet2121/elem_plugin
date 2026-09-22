/**
 * SYNTHETIC TEST M10-B: MULTI-ITEM INLINE WRAP PRESERVATION ON MOBILE (CLASS B)
 *
 * Verifies:
 * 1. Mobile Stacking Decision from Ground Truth:
 *    - When GT mobile flex-direction is 'row' (or child rects sit side-by-side),
 *      the compiler preserves row + wrap and child widths = GT mobile rect percent
 *      of parent content box (M8 contract), never blindly forcing 100%.
 *    - Child items stack to 100% ONLY when GT mobile actually stacks (column direction
 *      or full-width child rects).
 * 2. Trust-Bar Fixture Parity:
 *    - 3-item row on mobile renders items at 97px ± 4px in Headless Chromium (kills sid-17 defect).
 * 3. Stacking Fixture Parity:
 *    - Grid/cards that stack on mobile render at 100% width.
 * 4. Inline Shrink-Wrapped Widget Survival:
 *    - Auto-width widgets preserve shrink-wrap on mobile.
 */
const assert = require('assert');
const path = require('path');
const { compileGroundTruthToElementor } = require('../src/smart/geometry-mapper');
const { mergeResponsiveSettings } = require('../src/smart/responsive-merger');
const { renderElementorToHtml } = require('../src/emulator/elementor-virtual-renderer');
const { createBrowserSession } = require('../src/inspector/headless-driver');

console.log('========================================================================');
console.log('  SYNTHETIC TEST M10-B: MULTI-ITEM INLINE WRAP PRESERVATION ON MOBILE');
console.log('========================================================================\n');

(async () => {
  let browserSession = null;
  try {
    // -------------------------------------------------------------------
    // 1. Fixture 1: Trust-Bar Row (Preserved Row on Mobile)
    // -------------------------------------------------------------------
    console.log('▶ [1/4] Setting up Fixture 1: Trust-Bar multi-item row on mobile...');

    const trustBarAst = {
      tagName: 'section',
      className: 'trust-section',
      attributes: { 'data-sid': 'sid-trust-sec' },
      children: [
        {
          tagName: 'div',
          className: 'trust-row',
          attributes: { 'data-sid': 'sid-trust-row' },
          children: [
            {
              tagName: 'div',
              className: 'trust-item',
              attributes: { 'data-sid': 'sid-trust-item-1' },
              children: [
                {
                  tagName: 'span',
                  className: 'trust-text',
                  attributes: { 'data-sid': 'sid-trust-txt-1' },
                  textContent: 'Item 1',
                  children: []
                }
              ]
            },
            {
              tagName: 'div',
              className: 'trust-item',
              attributes: { 'data-sid': 'sid-trust-item-2' },
              children: [
                {
                  tagName: 'span',
                  className: 'trust-text',
                  attributes: { 'data-sid': 'sid-trust-txt-2' },
                  textContent: 'Item 2',
                  children: []
                }
              ]
            },
            {
              tagName: 'div',
              className: 'trust-item',
              attributes: { 'data-sid': 'sid-trust-item-3' },
              children: [
                {
                  tagName: 'span',
                  className: 'trust-text',
                  attributes: { 'data-sid': 'sid-trust-txt-3' },
                  textContent: 'Item 3',
                  children: []
                }
              ]
            }
          ]
        }
      ]
    };

    // GT Snapshot:
    // Desktop: 1440px -> row items 200px each
    // Mobile: 375px -> row items sit side-by-side, x=24, 138, 252, w=97px each
    const trustBarSnapshot = {
      viewports: {
        desktop: {
          width: 1440,
          flat: {
            'sid-trust-sec': {
              sid: 'sid-trust-sec',
              rect: { x: 0, y: 0, w: 1440, h: 100 },
              styles: { display: 'flex', flexDirection: 'column', paddingLeft: '120px', paddingRight: '120px' }
            },
            'sid-trust-row': {
              sid: 'sid-trust-row',
              rect: { x: 120, y: 0, w: 1200, h: 100 },
              styles: { display: 'flex', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: '40px', paddingLeft: '0px', paddingRight: '0px' }
            },
            'sid-trust-item-1': {
              sid: 'sid-trust-item-1',
              rect: { x: 120, y: 20, w: 200, h: 60 },
              styles: { display: 'flex', width: '200px' }
            },
            'sid-trust-item-2': {
              sid: 'sid-trust-item-2',
              rect: { x: 360, y: 20, w: 200, h: 60 },
              styles: { display: 'flex', width: '200px' }
            },
            'sid-trust-item-3': {
              sid: 'sid-trust-item-3',
              rect: { x: 600, y: 20, w: 200, h: 60 },
              styles: { display: 'flex', width: '200px' }
            }
          }
        },
        tablet: {
          width: 768,
          flat: {
            'sid-trust-sec': { sid: 'sid-trust-sec', rect: { x: 0, y: 0, w: 768, h: 100 }, styles: { display: 'flex', paddingLeft: '24px', paddingRight: '24px' } },
            'sid-trust-row': { sid: 'sid-trust-row', rect: { x: 24, y: 0, w: 720, h: 100 }, styles: { display: 'flex', flexDirection: 'row' } },
            'sid-trust-item-1': { sid: 'sid-trust-item-1', rect: { x: 24, y: 20, w: 150, h: 60 }, styles: { display: 'flex' } },
            'sid-trust-item-2': { sid: 'sid-trust-item-2', rect: { x: 200, y: 20, w: 150, h: 60 }, styles: { display: 'flex' } },
            'sid-trust-item-3': { sid: 'sid-trust-item-3', rect: { x: 376, y: 20, w: 150, h: 60 }, styles: { display: 'flex' } }
          }
        },
        mobile: {
          width: 375,
          flat: {
            'sid-trust-sec': {
              sid: 'sid-trust-sec',
              rect: { x: 0, y: 0, w: 375, h: 80 },
              styles: { display: 'flex', flexDirection: 'column', paddingLeft: '24px', paddingRight: '24px' }
            },
            'sid-trust-row': {
              sid: 'sid-trust-row',
              rect: { x: 24, y: 0, w: 327, h: 80 },
              styles: {
                display: 'flex',
                flexDirection: 'row',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                paddingLeft: '0px',
                paddingRight: '0px'
              }
            },
            'sid-trust-item-1': {
              sid: 'sid-trust-item-1',
              rect: { x: 24, y: 10, w: 97, h: 50 },
              styles: { display: 'flex', width: '97px' }
            },
            'sid-trust-item-2': {
              sid: 'sid-trust-item-2',
              rect: { x: 139, y: 10, w: 97, h: 50 },
              styles: { display: 'flex', width: '97px' }
            },
            'sid-trust-item-3': {
              sid: 'sid-trust-item-3',
              rect: { x: 254, y: 10, w: 97, h: 50 },
              styles: { display: 'flex', width: '97px' }
            }
          }
        }
      }
    };

    // Compile desktop, then merge responsive
    const compiledTrustArr = compileGroundTruthToElementor(trustBarAst, trustBarSnapshot, { viewport: 'desktop' });
    const compiledTrust = { content: compiledTrustArr };
    mergeResponsiveSettings(compiledTrust, trustBarSnapshot, {});

    // Verify AST settings for trust-bar:
    const findNodeBySid = (root, sid) => {
      if (!root) return null;
      if (root._sid === sid || root.settings?._sid === sid || root._dom_id === sid || root.settings?._dom_id === sid) return root;
      const elements = root.elements || root.content || [];
      for (const el of elements) {
        const res = findNodeBySid(el, sid);
        if (res) return res;
      }
      return null;
    };

    const rowNode = findNodeBySid(compiledTrust, 'sid-trust-row');
    assert(rowNode, 'sid-trust-row container must exist');
    assert.strictEqual(rowNode.settings.direction_mobile, 'row', 'sid-trust-row direction_mobile must be row');
    assert.strictEqual(rowNode.settings.wrap_mobile, 'wrap', 'sid-trust-row wrap_mobile must be wrap');

    const item3Node = findNodeBySid(compiledTrust, 'sid-trust-item-3');
    assert(item3Node, 'sid-trust-item-3 container must exist');
    assert(item3Node.settings.width_mobile, 'sid-trust-item-3 width_mobile must be defined');
    const item3Pct = item3Node.settings.width_mobile.size;
    console.log(`  ✓ Trust item 3 width_mobile: ${item3Pct}% (expected ~29.7%, NEVER forced 100%)`);
    assert(item3Pct < 50, `Trust item width_mobile (${item3Pct}%) must NOT be forced to 100%`);
    assert(Math.abs(item3Pct - (97 / 327 * 100)) <= 1.0, `Trust item width_mobile (${item3Pct}%) must match content-box ratio`);

    // -------------------------------------------------------------------
    // 2. Fixture 2: Stacking Columns (Proper 100% Stacking on Mobile)
    // -------------------------------------------------------------------
    console.log('\n▶ [2/4] Setting up Fixture 2: Stacking columns on mobile...');

    const stackingAst = {
      tagName: 'section',
      className: 'cards-section',
      attributes: { 'data-sid': 'sid-stack-sec' },
      children: [
        {
          tagName: 'div',
          className: 'cards-row',
          attributes: { 'data-sid': 'sid-stack-row' },
          children: [
            {
              tagName: 'div',
              className: 'card-col',
              attributes: { 'data-sid': 'sid-card-col-1' },
              children: [
                { tagName: 'h3', textContent: 'Card 1', children: [] }
              ]
            },
            {
              tagName: 'div',
              className: 'card-col',
              attributes: { 'data-sid': 'sid-card-col-2' },
              children: [
                { tagName: 'h3', textContent: 'Card 2', children: [] }
              ]
            }
          ]
        }
      ]
    };

    const stackingSnapshot = {
      viewports: {
        desktop: {
          width: 1440,
          flat: {
            'sid-stack-sec': { sid: 'sid-stack-sec', rect: { x: 0, y: 0, w: 1440, h: 400 }, styles: { display: 'flex' } },
            'sid-stack-row': { sid: 'sid-stack-row', rect: { x: 120, y: 0, w: 1200, h: 400 }, styles: { display: 'flex', flexDirection: 'row' } },
            'sid-card-col-1': { sid: 'sid-card-col-1', rect: { x: 120, y: 0, w: 580, h: 400 }, styles: { display: 'flex', width: '580px' } },
            'sid-card-col-2': { sid: 'sid-card-col-2', rect: { x: 740, y: 0, w: 580, h: 400 }, styles: { display: 'flex', width: '580px' } }
          }
        },
        tablet: {
          width: 768,
          flat: {
            'sid-stack-sec': { sid: 'sid-stack-sec', rect: { x: 0, y: 0, w: 768, h: 400 }, styles: { display: 'flex' } },
            'sid-stack-row': { sid: 'sid-stack-row', rect: { x: 24, y: 0, w: 720, h: 400 }, styles: { display: 'flex', flexDirection: 'row' } },
            'sid-card-col-1': { sid: 'sid-card-col-1', rect: { x: 24, y: 0, w: 340, h: 400 }, styles: { display: 'flex' } },
            'sid-card-col-2': { sid: 'sid-card-col-2', rect: { x: 404, y: 0, w: 340, h: 400 }, styles: { display: 'flex' } }
          }
        },
        mobile: {
          width: 375,
          flat: {
            'sid-stack-sec': { sid: 'sid-stack-sec', rect: { x: 0, y: 0, w: 375, h: 600 }, styles: { display: 'flex' } },
            'sid-stack-row': {
              sid: 'sid-stack-row',
              rect: { x: 24, y: 0, w: 327, h: 600 },
              styles: { display: 'flex', flexDirection: 'column' }
            },
            'sid-card-col-1': {
              sid: 'sid-card-col-1',
              rect: { x: 24, y: 0, w: 327, h: 280 },
              styles: { display: 'flex', width: '327px' }
            },
            'sid-card-col-2': {
              sid: 'sid-card-col-2',
              rect: { x: 24, y: 300, w: 327, h: 280 },
              styles: { display: 'flex', width: '327px' }
            }
          }
        }
      }
    };

    const compiledStackArr = compileGroundTruthToElementor(stackingAst, stackingSnapshot, { viewport: 'desktop' });
    const compiledStack = { content: compiledStackArr };
    mergeResponsiveSettings(compiledStack, stackingSnapshot, {});

    const stackColNode = findNodeBySid(compiledStack, 'sid-card-col-1');
    assert(stackColNode, 'sid-card-col-1 container must exist');
    console.log(`  ✓ Stacking column width_mobile: ${stackColNode.settings.width_mobile?.size}% (expected 100%)`);
    assert.strictEqual(stackColNode.settings.width_mobile?.size, 100, 'Stacking column width_mobile must be 100% when GT stacks');

    // -------------------------------------------------------------------
    // 3. Fixture 3: Inline Shrink-Wrapped Widget Survival on Mobile
    // -------------------------------------------------------------------
    console.log('\n▶ [3/4] Testing inline shrink-wrapped widget preservation on mobile...');

    const widgetNode = {
      id: 'w_test_shrink',
      elType: 'widget',
      widgetType: 'heading',
      settings: {
        _element_width: 'auto',
        _flex_size: 'none'
      }
    };
    const parentContainer = {
      id: 'c_parent',
      elType: 'container',
      settings: {
        direction_mobile: 'row'
      },
      elements: [widgetNode]
    };

    // Emulate responsive merger widget pass
    const templateWithWidget = {
      content: [parentContainer]
    };
    const widgetHtml = renderElementorToHtml(templateWithWidget);
    assert(
      (widgetHtml.includes('.elementor-element-w_test_shrink') || widgetHtml.includes('.e-sid-w_test_shrink')) && widgetHtml.includes('width: auto !important;'),
      'Widget must render width: auto !important in mobile CSS rules when _element_width is auto'
    );
    console.log('  ✓ Inline shrink-wrapped widget successfully emitted with width: auto !important in mobile CSS');

    // -------------------------------------------------------------------
    // 4. Physical Headless Chromium Render Validation
    // -------------------------------------------------------------------
    console.log('\n▶ [4/4] Physical Headless Chromium Measurement at Mobile Viewport (375px)...');

    const trustHtml = renderElementorToHtml(compiledTrust);
    browserSession = await createBrowserSession();
    const page = await browserSession.newPage();
    await page.setViewport({ width: 375, height: 812 });
    await page.setContent(trustHtml, { waitUntil: 'load' });

    // Measure at mobile viewport 375x812
    const mobileMeasurements = await page.evaluate(() => {
      const item1 = document.querySelector('[data-sid="sid-trust-item-1"]');
      const item2 = document.querySelector('[data-sid="sid-trust-item-2"]');
      const item3 = document.querySelector('[data-sid="sid-trust-item-3"]');
      const row = document.querySelector('[data-sid="sid-trust-row"]');

      const rRow = row ? row.getBoundingClientRect() : null;
      const r1 = item1 ? item1.getBoundingClientRect() : null;
      const r2 = item2 ? item2.getBoundingClientRect() : null;
      const r3 = item3 ? item3.getBoundingClientRect() : null;

      const rowStyle = row ? window.getComputedStyle(row) : null;

      return {
        rowFlexDir: rowStyle ? rowStyle.flexDirection : null,
        rowWrap: rowStyle ? rowStyle.flexWrap : null,
        rowRect: rRow ? { x: Math.round(rRow.x), y: Math.round(rRow.y), w: Math.round(rRow.width), h: Math.round(rRow.height) } : null,
        item1Rect: r1 ? { x: Math.round(r1.x), y: Math.round(r1.y), w: Math.round(r1.width), h: Math.round(r1.height) } : null,
        item2Rect: r2 ? { x: Math.round(r2.x), y: Math.round(r2.y), w: Math.round(r2.width), h: Math.round(r2.height) } : null,
        item3Rect: r3 ? { x: Math.round(r3.x), y: Math.round(r3.y), w: Math.round(r3.width), h: Math.round(r3.height) } : null
      };
    });

    console.log('  Mobile Rendered Metrics:');
    console.log(`    - Row rect:`, mobileMeasurements.rowRect);
    console.log(`    - Row flex-direction: ${mobileMeasurements.rowFlexDir} (expected: row)`);
    console.log(`    - Row flex-wrap: ${mobileMeasurements.rowWrap} (expected: wrap)`);
    console.log(`    - Item 1 rect:`, mobileMeasurements.item1Rect);
    console.log(`    - Item 2 rect:`, mobileMeasurements.item2Rect);
    console.log(`    - Item 3 rect:`, mobileMeasurements.item3Rect);

    assert.strictEqual(mobileMeasurements.rowFlexDir, 'row', 'Rendered row flex-direction on mobile must be row');
    assert.strictEqual(mobileMeasurements.rowWrap, 'wrap', 'Rendered row flex-wrap on mobile must be wrap');

    // Physical width check: 97px ± 4px (NOT 327px or 100%)
    const measuredW1 = mobileMeasurements.item1Rect.w;
    const measuredW2 = mobileMeasurements.item2Rect.w;
    const measuredW3 = mobileMeasurements.item3Rect.w;

    assert(
      Math.abs(measuredW3 - 97) <= 4,
      `Item 3 physical width (${measuredW3}px) must be 97px ± 4px (sid-17 parity). Received: ${measuredW3}px`
    );
    assert(
      Math.abs(measuredW1 - 97) <= 4,
      `Item 1 physical width (${measuredW1}px) must be 97px ± 4px. Received: ${measuredW1}px`
    );

    // Side-by-side check: Items must sit on the same horizontal line (similar y coordinates)
    assert(
      Math.abs(mobileMeasurements.item1Rect.y - mobileMeasurements.item3Rect.y) <= 4,
      `Items must be side-by-side on mobile (y1=${mobileMeasurements.item1Rect.y}, y3=${mobileMeasurements.item3Rect.y})`
    );

    console.log('\n========================================================================');
    console.log('  ✅ SYNTHETIC TEST M10-B PASSED: 100% Mobile Wrap Parity Verified');
    console.log('========================================================================\n');
  } catch (err) {
    console.error('\n❌ SYNTHETIC TEST M10-B FAILED:', err);
    process.exit(1);
  } finally {
    if (browserSession) {
      await browserSession.close();
    }
  }
})();

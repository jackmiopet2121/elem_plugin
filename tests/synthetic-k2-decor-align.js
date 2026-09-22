/**
 * SYNTHETIC TEST SUITE K2: Decor/Icon Alignment + Margin Parity & Advisories A1/A2
 *
 * Verifies:
 * 1. Geometry-driven align_self: Left-aligned icon in column parent => flex-start.
 * 2. Geometry-driven align_self: Centered icon in column parent => center.
 * 3. Geometry-driven align_self: Icon in row parent (cross-axis Y) => flex-start.
 * 4. Margin Parity & Deduplication:
 *    - Container gap > 0 + child margin exceeding GT => child margin zeroed (gap preserved).
 *    - Container gap == 0 + child margin => child margin preserved (e.g. 24px).
 * 5. Advisory A1: Per-viewport direction: desktop row + mobile column => direction: 'row', direction_mobile: 'column'.
 * 6. Advisory A2: Tight-stacked blocks with subpixel/minor Y overlap but strong X overlap => strictly column.
 * 7. Full compilation: Feature icon preserves align_self: 'flex-start' and _margin.bottom: '24'.
 * 8. Regression K1: All K1 contracts preserved.
 */

const assert = require('assert');
const {
  deriveAlignSelfFromGt,
  inferContainerLayout,
  deduplicateContainerChildSpacing
} = require('../src/smart/geometry-mapper');
const { mergeResponsiveSettings } = require('../src/smart/responsive-merger');
const { compileHtmlToElementor } = require('../src/index');

console.log('========================================================================');
console.log('       SYNTHETIC TEST SUITE K2: DECOR/ICON ALIGN & MARGIN PARITY');
console.log('========================================================================\n');

let passedTests = 0;

// [1/8] Left-Aligned Icon in Column Parent (e.g. feature-icon)
console.log('▶ [1/8] Testing left-aligned icon in column parent (x-offset vs parent content box)...');
const leftParentGt = {
  rect: { x: 64, y: 1560, w: 357, h: 283 },
  styles: { paddingLeft: '40px', paddingRight: '40px', display: 'flex', flexDirection: 'column' }
};
const leftIconGt = {
  rect: { x: 105, y: 1601, w: 56, h: 56 },
  styles: { marginBottom: '24px' }
};
const leftAlign = deriveAlignSelfFromGt(leftIconGt, leftParentGt);
assert.strictEqual(leftAlign, 'flex-start', 'Left-aligned icon in column container must derive align_self: "flex-start"');
console.log('  ✓ Left-aligned icon verified: align_self="flex-start".');
passedTests++;

// [2/8] Centered Icon in Column Parent (e.g. stat-card / badge-icon)
console.log('\n▶ [2/8] Testing centered icon in column parent...');
const centerParentGt = {
  rect: { x: 64, y: 967, w: 264, h: 222 },
  styles: { paddingLeft: '32px', paddingRight: '32px', display: 'flex', flexDirection: 'column' }
};
const centerIconGt = {
  rect: { x: 172, y: 1000, w: 48, h: 48 },
  styles: { marginBottom: '20px' }
};
const centerAlign = deriveAlignSelfFromGt(centerIconGt, centerParentGt);
assert.strictEqual(centerAlign, 'center', 'Centered icon in column container must derive align_self: "center"');
console.log('  ✓ Centered icon verified: align_self="center".');
passedTests++;

// [3/8] Icon in Row Parent (cross-axis Y-offset)
console.log('\n▶ [3/8] Testing icon in row parent (cross-axis vertical alignment)...');
const rowParentGt = {
  rect: { x: 680, y: 3848, w: 536, h: 55 },
  styles: { display: 'flex', flexDirection: 'row', paddingTop: '0px', paddingBottom: '0px' }
};
const rowIconGt = {
  rect: { x: 680, y: 3850, w: 24, h: 24 },
  styles: { marginBottom: '0px' }
};
const rowAlign = deriveAlignSelfFromGt(rowIconGt, rowParentGt);
assert.strictEqual(rowAlign, 'flex-start', 'Top-aligned icon in row container must derive align_self: "flex-start"');
console.log('  ✓ Icon in row parent verified: align_self="flex-start".');
passedTests++;

// [4/8] Spacing Deduplication & Margin Preservation
console.log('\n▶ [4/8] Testing spacing deduplication vs margin preservation...');
// 4A: Container with gap 24px and child margin 24px exceeding GT => child margin zeroed
const dedupContainerSettings = {
  direction: 'column',
  gap: { unit: 'px', size: 24, row: 24, column: 24 }
};
const dedupPairs = [
  {
    element: { settings: { _margin: { unit: 'px', top: '0', right: '0', bottom: '24', left: '0' } } },
    node: { attributes: { 'data-sid': 'icon-1' } }
  },
  {
    element: { settings: { _margin: { unit: 'px', top: '0', right: '0', bottom: '0', left: '0' } } },
    node: { attributes: { 'data-sid': 'heading-1' } }
  }
];
const dedupSnapshot = {
  viewports: {
    desktop: {
      flat: {
        'icon-1': { rect: { x: 0, y: 0, w: 50, h: 50 } },
        'heading-1': { rect: { x: 0, y: 74, w: 200, h: 30 } } // GT spacing = 24px
      }
    }
  }
};
deduplicateContainerChildSpacing(dedupContainerSettings, dedupPairs, dedupSnapshot, 'desktop');
assert.strictEqual(dedupPairs[0].element.settings._margin.bottom, '0', 'Child margin must be zeroed when container gap provides full GT spacing');

// 4B: Container with gap 0px and child margin 24px matching GT => child margin preserved
const zeroGapContainerSettings = {
  direction: 'column',
  gap: { unit: 'px', size: 0, row: 0, column: 0 }
};
const preservedPairs = [
  {
    element: { settings: { _margin: { unit: 'px', top: '0', right: '0', bottom: '24', left: '0' } } },
    node: { attributes: { 'data-sid': 'icon-2' } }
  },
  {
    element: { settings: { _margin: { unit: 'px', top: '0', right: '0', bottom: '0', left: '0' } } },
    node: { attributes: { 'data-sid': 'heading-2' } }
  }
];
deduplicateContainerChildSpacing(zeroGapContainerSettings, preservedPairs, dedupSnapshot, 'desktop');
assert.strictEqual(preservedPairs[0].element.settings._margin.bottom, '24', 'Child margin must be preserved when container gap is 0');
console.log('  ✓ Spacing deduplication and margin preservation verified: double-count eliminated & zero-gap preserved.');
passedTests++;

// [5/8] Advisory A1: Per-Viewport Direction Inference (desktop row + mobile column)
console.log('\n▶ [5/8] Testing Advisory A1: Per-viewport direction (desktop row -> mobile column)...');
const templateA1 = {
  content: [
    {
      id: 'con-1',
      elType: 'container',
      _sid: 'con-1',
      settings: {
        _sid: 'con-1',
        direction: 'row',
        flex_direction: 'row'
      },
      elements: [
        { id: 'w1', elType: 'widget', _sid: 'w1', settings: { _sid: 'w1' } },
        { id: 'w2', elType: 'widget', _sid: 'w2', settings: { _sid: 'w2' } }
      ]
    }
  ]
};
const snapshotA1 = {
  viewports: {
    desktop: {
      flat: {
        'con-1': { rect: { x: 0, y: 0, w: 1000, h: 200 }, styles: { display: 'flex', flexDirection: 'row' } },
        'w1': { rect: { x: 0, y: 0, w: 480, h: 200 } },
        'w2': { rect: { x: 500, y: 0, w: 480, h: 200 } }
      }
    },
    tablet: {
      flat: {
        'con-1': { rect: { x: 0, y: 0, w: 768, h: 200 }, styles: { display: 'flex', flexDirection: 'row' } },
        'w1': { rect: { x: 0, y: 0, w: 370, h: 200 } },
        'w2': { rect: { x: 390, y: 0, w: 370, h: 200 } }
      }
    },
    mobile: {
      flat: {
        'con-1': {
          rect: { x: 0, y: 0, w: 370, h: 400 },
          styles: { display: 'block' },
          childRects: [
            { type: 'element', rect: { x: 10, y: 10, w: 350, h: 180 } },
            { type: 'element', rect: { x: 10, y: 210, w: 350, h: 180 } }
          ]
        },
        'w1': { rect: { x: 10, y: 10, w: 350, h: 180 } },
        'w2': { rect: { x: 10, y: 210, w: 350, h: 180 } }
      }
    }
  }
};
mergeResponsiveSettings(templateA1, snapshotA1);
const mergedContainer = templateA1.content[0].settings;
assert.strictEqual(mergedContainer.direction, 'row', 'Desktop must remain direction: "row"');
assert.strictEqual(mergedContainer.direction_mobile, 'column', 'Mobile must infer direction_mobile: "column" from stacked child rects');
assert.strictEqual(mergedContainer.flex_direction_mobile, 'column', 'Mobile must infer flex_direction_mobile: "column"');
console.log('  ✓ Advisory A1 verified: direction="row" and direction_mobile="column".');
passedTests++;

// [6/8] Advisory A2: Tight-stacked vertical elements with subpixel/minor Y overlap
console.log('\n▶ [6/8] Testing Advisory A2: Tight-stacked blocks with minor Y overlap but heavy X overlap...');
const tightStackedElements = [
  { rect: { x: 20, y: 100, w: 400, h: 50 } },
  { rect: { x: 20, y: 146, w: 400, h: 50 } } // 4px Y overlap, but 400px X overlap!
];
const tightLayout = inferContainerLayout(tightStackedElements);
assert.strictEqual(tightLayout.direction, 'column', 'Tight-stacked blocks with strong X-overlap must strictly infer "column"');
console.log('  ✓ Advisory A2 verified: tight-stacked vertical elements strictly infer direction="column".');
passedTests++;

// [7/8] Regression K1 Contracts
console.log('\n▶ [7/8] Testing Regression K1 Contracts...');
const k1Inline = inferContainerLayout([
  { rect: { x: 10, y: 100, w: 24, h: 24 } },
  { rect: { x: 42, y: 102, w: 120, h: 20 } }
]);
assert.strictEqual(k1Inline.direction, 'row', 'K1 inline row must remain row');
assert.strictEqual(k1Inline.gap, 8, 'K1 gap must remain 8px');

const k1Single = inferContainerLayout([{ rect: { x: 0, y: 0, w: 100, h: 50 } }]);
assert.strictEqual(k1Single.direction, 'column', 'K1 single child must remain column');
console.log('  ✓ Regression K1 contracts verified 100% green.');
passedTests++;

// [8/8] Full Compilation of Feature Icon Fixture
console.log('\n▶ [8/8] Compiling feature card snippet to verify feature-icon align_self and margin...');
(async () => {
  const snippetHtml = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <style>
      * { box-sizing: border-box; }
      .feature-card {
        padding: 40px;
        background: #ffffff;
        border-radius: 16px;
        width: 360px;
      }
      .feature-icon {
        width: 56px;
        height: 56px;
        background: #eff6ff;
        border: 1px solid #bfdbfe;
        border-radius: 12px;
        margin-bottom: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #2563eb;
      }
      .feature-title {
        font-size: 20px;
        font-weight: 700;
        margin: 0 0 12px 0;
      }
      .feature-desc {
        font-size: 14px;
        color: #64748b;
        margin: 0;
      }
    </style>
  </head>
  <body>
    <div class="feature-card">
      <div class="feature-icon">★</div>
      <h3 class="feature-title">Fast Performance</h3>
      <p class="feature-desc">Lightning quick speeds across all devices.</p>
    </div>
  </body>
  </html>
  `;

  const { templateJson } = await compileHtmlToElementor(snippetHtml, { offline: true, cache: false, inspect: false });
  assert.ok(templateJson, 'Template must be generated');

  function findIcon(nodes) {
    for (const n of nodes) {
      if (n.widgetType === 'icon') return n;
      if (n.elements) {
        const found = findIcon(n.elements);
        if (found) return found;
      }
    }
    return null;
  }

  const iconWidget = findIcon(templateJson.content);
  assert.ok(iconWidget, 'Icon widget must be mapped');
  
  // Verify align_self is flex-start (not hardcoded center)
  assert.strictEqual(iconWidget.settings.align_self, 'flex-start', 'Feature icon align_self must be flex-start');
  assert.strictEqual(iconWidget.settings._flex_align_self, 'flex-start', 'Feature icon _flex_align_self must be flex-start');
  assert.strictEqual(iconWidget.settings.align, 'left', 'Feature icon align must be left');

  // Verify margin-bottom: 24px is preserved
  assert.ok(iconWidget.settings._margin, 'Feature icon must have _margin');
  assert.strictEqual(iconWidget.settings._margin.bottom, '24', 'Feature icon _margin.bottom must be preserved as 24');

  console.log('  ✓ Full feature card snippet compilation verified:');
  console.log(`    • align_self:        "${iconWidget.settings.align_self}"`);
  console.log(`    • align:             "${iconWidget.settings.align}"`);
  console.log(`    • _margin.bottom:    "${iconWidget.settings._margin.bottom}px"`);
  passedTests++;

  console.log('\n========================================================================');
  console.log(`✓ [TASK K2 PASSED] ALL ${passedTests}/8 TESTS PASSED 100%!`);
  console.log('========================================================================\n');
})().catch(err => {
  console.error('\n❌ [TASK K2 FAILED]', err);
  process.exit(1);
});

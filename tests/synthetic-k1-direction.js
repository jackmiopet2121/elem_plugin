/**
 * SYNTHETIC TEST SUITE K1: GT-Rect Direction Inference (row vs column)
 * 
 * Verifies:
 * 1. Geometry-driven inference: overlapping Y ranges => row (side-by-side).
 * 2. Stacked geometry inference: non-overlapping Y ranges => column (stacked).
 * 3. Mixed content containers (element + text node with GT childRects) => row.
 * 4. Single-child container respects computed flex-direction.
 * 5. Real compilation of trust-item containers (sid-13/15/17) compiles to direction: 'row'.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { inferContainerLayout } = require('../src/smart/geometry-mapper');
const { compileHtmlToElementor } = require('../src/index');

console.log('========================================================================');
console.log('       SYNTHETIC TEST SUITE K1: GT-RECT DIRECTION INFERENCE');
console.log('========================================================================\n');

let passedTests = 0;
const totalTests = 5;

// [1/5] Inline Row Fixture
console.log('▶ [1/5] Testing inline row fixture (side-by-side with Y-overlap)...');
const inlineRowChildren = [
  { rect: { x: 10, y: 100, w: 24, h: 24 } },
  { rect: { x: 42, y: 102, w: 120, h: 20 } }
];
const rowLayout = inferContainerLayout(inlineRowChildren);
assert.strictEqual(rowLayout.direction, 'row', 'Side-by-side children must infer direction: "row"');
assert.strictEqual(rowLayout.wrap, 'nowrap', 'Non-wrapping children must infer wrap: "nowrap"');
assert.strictEqual(rowLayout.gap, 8, 'Gap between 10+24=34 and 42 must be 8px');
console.log('  ✓ Inline row fixture verified: direction="row", gap=8px.');
passedTests++;

// [2/5] Stacked Column Fixture
console.log('\n▶ [2/5] Testing stacked column fixture (vertical non-overlapping)...');
const stackedChildren = [
  { rect: { x: 20, y: 50, w: 300, h: 40 } },
  { rect: { x: 20, y: 110, w: 300, h: 60 } },
  { rect: { x: 20, y: 190, w: 300, h: 40 } }
];
const colLayout = inferContainerLayout(stackedChildren);
assert.strictEqual(colLayout.direction, 'column', 'Vertically stacked children must infer direction: "column"');
assert.strictEqual(colLayout.gap, 20, 'Vertical gap between 50+40=90 and 110 must be 20px');
console.log('  ✓ Stacked column fixture verified: direction="column", gap=20px.');
passedTests++;

// [3/5] Mixed Content Container with parentGt.childRects
console.log('\n▶ [3/5] Testing mixed content container (parentGt.childRects with text + element)...');
const parentGtWithChildRects = {
  styles: { display: 'flex', flexDirection: 'row' },
  childRects: [
    { type: 'element', tag: 'span', rect: { x: 64, y: 666, w: 11, h: 22 } },
    { type: 'text', text: 'Trust Badge One', rect: { x: 83, y: 668, w: 112, h: 17 } }
  ]
};
const mixedLayout = inferContainerLayout([], parentGtWithChildRects);
assert.strictEqual(mixedLayout.direction, 'row', 'Mixed content container with overlapping childRects must infer direction: "row"');
assert.strictEqual(mixedLayout.gap, 8, 'Horizontal gap between span and text must be 8px');
console.log('  ✓ Mixed content parentGt.childRects verified: direction="row", gap=8px.');
passedTests++;

// [4/5] Single-child container defaulting to column flow
console.log('\n▶ [4/5] Testing single-child container defaulting to column flow...');
const singleChildGt = [{ rect: { x: 0, y: 0, w: 100, h: 50 } }];
const singleCol = inferContainerLayout(singleChildGt);
assert.strictEqual(singleCol.direction, 'column', 'Single child must default to column to allow block children flow');
console.log('  ✓ Single-child column flow contract verified.');
passedTests++;

// [5/5] Real Landing Trust-Item Verification
console.log('\n▶ [5/5] Compiling landing snippet to verify trust-item direction: "row"...');
(async () => {
  const testHtml = `
  <!DOCTYPE html>
  <html>
  <head>
    <style>
      .trust-row { display: flex; gap: 24px; align-items: center; }
      .trust-item { display: flex; align-items: center; gap: 8px; font-size: 14px; }
      .trust-item span { display: inline-block; width: 11px; }
    </style>
  </head>
  <body style="margin:0; padding:20px;">
    <div class="trust-row">
      <div class="trust-item" id="item1"><span>✓</span> Trust Badge One</div>
      <div class="trust-item" id="item2"><span>✓</span> Trust Badge Two</div>
    </div>
  </body>
  </html>
  `;

  const { templateJson } = await compileHtmlToElementor(testHtml, {
    offline: true,
    cache: false
  });

  function findContainers(elements, results = []) {
    for (const el of (elements || [])) {
      if (el.elType === 'container') {
        results.push(el);
      }
      if (el.elements && el.elements.length > 0) {
        findContainers(el.elements, results);
      }
    }
    return results;
  }

  const containers = findContainers(templateJson.content);
  const trustItemCons = containers.filter(c => 
    (c.settings?.css_classes || '').includes('trust-item') ||
    (c.settings?._element_id || '').includes('item')
  );

  assert(trustItemCons.length >= 2, 'Must find at least 2 trust-item containers');
  for (const tc of trustItemCons) {
    assert.strictEqual(tc.settings.direction, 'row', `trust-item container must have direction: "row" (got: ${tc.settings.direction})`);
    assert.strictEqual(tc.settings.flex_direction, 'row', `trust-item container must have flex_direction: "row"`);
  }

  console.log(`  ✓ Real compilation verified: all ${trustItemCons.length} trust-item containers compiled with direction: "row"!`);
  passedTests++;

  console.log('\n========================================================================');
  console.log(`✓ [TASK K1 PASSED] ALL ${passedTests}/${totalTests} TESTS PASSED 100%!`);
  console.log('========================================================================\n');
  process.exit(0);
})().catch(err => {
  console.error('\n❌ [TEST FAILED]:', err);
  process.exit(1);
});

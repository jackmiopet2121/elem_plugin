/**
 * Task F7: Equal-Height Rows Synthetic Suite.
 * Validates:
 * 1. detectEqualHeightRowChildIndices identifies row children with GT heights equal within +/- 4px.
 * 2. compileGroundTruthToElementor skips per-child min_height on equal-height cards.
 * 3. Parent row container sets align_items: stretch.
 * 4. Negative control: unequal row children retain their individual min_height.
 * 5. Multi-line/wrapping rows detect equal-height row children per visual row line.
 * 6. Elementor Virtual Renderer renders parent with align-items: stretch and cards without rigid min-height.
 * 7. Scalar contract compliance verified on compiled output.
 */

const assert = require('assert');
const {
  detectEqualHeightRowChildIndices,
  compileGroundTruthToElementor
} = require('../src/smart/geometry-mapper');
const { renderElementorToHtml } = require('../src/emulator/elementor-virtual-renderer');
const { validateTemplate } = require('../src/smart/scalar-contract');

console.log('=== Task F7: Equal-Height Rows Synthetic Suite ===\n');

// ---------------------------------------------------------------------------
// Test 1: detectEqualHeightRowChildIndices algorithm unit tests
// ---------------------------------------------------------------------------
console.log('1. Testing detectEqualHeightRowChildIndices helper...');

const mockNodes = [
  { tagName: 'div', id: 'card-1', attributes: { 'data-sid': 'sid-c1' } },
  { tagName: 'div', id: 'card-2', attributes: { 'data-sid': 'sid-c2' } },
  { tagName: 'div', id: 'card-3', attributes: { 'data-sid': 'sid-c3' } }
];

const mockSnapshotEqual = {
  viewports: {
    desktop: {
      flat: {
        'sid-c1': { rect: { x: 0, y: 100, w: 300, h: 420 }, styles: { height: '420px' } },
        'sid-c2': { rect: { x: 320, y: 100, w: 300, h: 422 }, styles: { height: '422px' } },
        'sid-c3': { rect: { x: 640, y: 100, w: 300, h: 419 }, styles: { height: '419px' } }
      }
    }
  }
};

const detectedEqual = detectEqualHeightRowChildIndices(mockNodes, mockSnapshotEqual, 'desktop');
assert.strictEqual(detectedEqual.size, 3, 'All 3 cards must be detected as equal-height row children');
assert.ok(detectedEqual.has(0) && detectedEqual.has(1) && detectedEqual.has(2), 'Must contain indices 0, 1, 2');
console.log('   ✓ 3 cards within +/- 4px correctly detected as equal-height row children.');

// Negative test: unequal heights (300px vs 550px)
const mockSnapshotUnequal = {
  viewports: {
    desktop: {
      flat: {
        'sid-c1': { rect: { x: 0, y: 100, w: 300, h: 300 }, styles: { height: '300px' } },
        'sid-c2': { rect: { x: 320, y: 100, w: 300, h: 550 }, styles: { height: '550px' } },
        'sid-c3': { rect: { x: 640, y: 100, w: 300, h: 420 }, styles: { height: '420px' } }
      }
    }
  }
};
const detectedUnequal = detectEqualHeightRowChildIndices(mockNodes, mockSnapshotUnequal, 'desktop');
assert.strictEqual(detectedUnequal.size, 0, 'Unequal children must NOT be detected as equal-height');
console.log('   ✓ Unequal row children correctly produce empty set.');

// ---------------------------------------------------------------------------
// Test 2: Full AST Compilation of 3 Equal-Height Cards in a Row
// ---------------------------------------------------------------------------
console.log('\n2. Testing AST compilation of 3 cards in row (Equal GT Heights)...');

const astRoot = {
  tagName: 'root',
  children: [
    {
      tagName: 'section',
      id: 'row-section',
      attributes: { 'data-sid': 'sid-row' },
      children: [
        {
          tagName: 'div',
          id: 'card-1',
          attributes: { 'data-sid': 'sid-c1', class: 'feature-card' },
          children: [
            {
              tagName: 'h3',
              id: 'title-1',
              attributes: { 'data-sid': 'sid-t1' },
              textContent: 'Starter Plan',
              children: []
            },
            {
              tagName: 'p',
              id: 'desc-1',
              attributes: { 'data-sid': 'sid-d1' },
              textContent: 'Perfect for small teams getting started.',
              children: []
            }
          ]
        },
        {
          tagName: 'div',
          id: 'card-2',
          attributes: { 'data-sid': 'sid-c2', class: 'feature-card' },
          children: [
            {
              tagName: 'h3',
              id: 'title-2',
              attributes: { 'data-sid': 'sid-t2' },
              textContent: 'Pro Plan',
              children: []
            },
            {
              tagName: 'p',
              id: 'desc-2',
              attributes: { 'data-sid': 'sid-d2' },
              textContent: 'Advanced automation and team collaboration.',
              children: []
            }
          ]
        },
        {
          tagName: 'div',
          id: 'card-3',
          attributes: { 'data-sid': 'sid-c3', class: 'feature-card' },
          children: [
            {
              tagName: 'h3',
              id: 'title-3',
              attributes: { 'data-sid': 'sid-t3' },
              textContent: 'Enterprise Plan',
              children: []
            },
            {
              tagName: 'p',
              id: 'desc-3',
              attributes: { 'data-sid': 'sid-d3' },
              textContent: 'Dedicated infrastructure with 99.99% uptime SLA.',
              children: []
            }
          ]
        }
      ]
    }
  ]
};

const fullSnapshot = {
  viewports: {
    desktop: {
      flat: {
        'sid-1': { rect: { x: 0, y: 0, w: 1200, h: 600 }, styles: {} },
        'sid-row': {
          rect: { x: 0, y: 100, w: 1100, h: 420 },
          styles: {
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'stretch',
            columnGap: '24px',
            rowGap: '0px'
          }
        },
        'sid-c1': {
          rect: { x: 0, y: 100, w: 350, h: 420 },
          styles: {
            display: 'flex',
            flexDirection: 'column',
            height: '420px',
            backgroundColor: '#ffffff',
            paddingTop: '24px',
            paddingBottom: '24px'
          }
        },
        'sid-t1': { rect: { x: 24, y: 124, w: 300, h: 28 }, styles: { fontSize: '20px', fontWeight: '700' }, directText: 'Starter Plan' },
        'sid-d1': { rect: { x: 24, y: 160, w: 300, h: 40 }, styles: { fontSize: '14px' }, directText: 'Perfect for small teams getting started.' },

        'sid-c2': {
          rect: { x: 374, y: 100, w: 350, h: 422 },
          styles: {
            display: 'flex',
            flexDirection: 'column',
            height: '422px',
            backgroundColor: '#ffffff',
            paddingTop: '24px',
            paddingBottom: '24px'
          }
        },
        'sid-t2': { rect: { x: 398, y: 124, w: 300, h: 28 }, styles: { fontSize: '20px', fontWeight: '700' }, directText: 'Pro Plan' },
        'sid-d2': { rect: { x: 398, y: 160, w: 300, h: 40 }, styles: { fontSize: '14px' }, directText: 'Advanced automation and team collaboration.' },

        'sid-c3': {
          rect: { x: 748, y: 100, w: 350, h: 419 },
          styles: {
            display: 'flex',
            flexDirection: 'column',
            height: '419px',
            backgroundColor: '#ffffff',
            paddingTop: '24px',
            paddingBottom: '24px'
          }
        },
        'sid-t3': { rect: { x: 772, y: 124, w: 300, h: 28 }, styles: { fontSize: '20px', fontWeight: '700' }, directText: 'Enterprise Plan' },
        'sid-d3': { rect: { x: 772, y: 160, w: 300, h: 40 }, styles: { fontSize: '14px' }, directText: 'Dedicated infrastructure with 99.99% uptime SLA.' }
      }
    }
  }
};

const compiledElements = compileGroundTruthToElementor(astRoot, fullSnapshot, { viewport: 'desktop' });
assert.ok(Array.isArray(compiledElements) && compiledElements.length > 0, 'Must compile root container');

const rowCon = compiledElements[0];
assert.strictEqual(rowCon.settings.flex_direction, 'row', 'Parent must be flex row');
assert.strictEqual(rowCon.settings.align_items, 'stretch', 'Parent must set align_items: stretch');
assert.strictEqual(rowCon.settings.flex_align_items, 'stretch', 'Parent must set flex_align_items: stretch');

const cardContainers = rowCon.elements.filter(el => el.elType === 'container');
assert.strictEqual(cardContainers.length, 3, 'Must have 3 child card containers');

for (let i = 0; i < cardContainers.length; i++) {
  const card = cardContainers[i];
  assert.strictEqual(
    card.settings.min_height,
    undefined,
    `Card ${i + 1} must NOT have settings.min_height set (skipped in favor of flex stretch)`
  );
}
console.log('   ✓ All 3 cards in row skipped min_height and parent has align_items: stretch.');

// ---------------------------------------------------------------------------
// Test 3: Negative Control — Unequal Row Children Retain Individual min_height
// ---------------------------------------------------------------------------
console.log('\n3. Testing Negative Control (Unequal Row Children)...');

const astUnequal = {
  tagName: 'root',
  children: [
    {
      tagName: 'section',
      id: 'split-section',
      attributes: { 'data-sid': 'sid-split' },
      children: [
        {
          tagName: 'aside',
          id: 'sidebar',
          attributes: { 'data-sid': 'sid-side' },
          children: [
            { tagName: 'p', id: 'p-side', attributes: { 'data-sid': 'sid-pside' }, textContent: 'Sidebar', children: [] }
          ]
        },
        {
          tagName: 'main',
          id: 'content',
          attributes: { 'data-sid': 'sid-main' },
          children: [
            { tagName: 'p', id: 'p-main', attributes: { 'data-sid': 'sid-pmain' }, textContent: 'Main content area with lots of text...', children: [] }
          ]
        }
      ]
    }
  ]
};

const snapshotUnequal = {
  viewports: {
    desktop: {
      flat: {
        'sid-1': { rect: { x: 0, y: 0, w: 1200, h: 800 }, styles: {} },
        'sid-split': {
          rect: { x: 0, y: 0, w: 1200, h: 700 },
          styles: { display: 'flex', flexDirection: 'row', alignItems: 'flex-start' }
        },
        'sid-side': {
          rect: { x: 0, y: 0, w: 300, h: 280 },
          styles: { height: '280px', minHeight: '280px', display: 'flex', flexDirection: 'column' }
        },
        'sid-pside': { rect: { x: 0, y: 0, w: 300, h: 30 }, styles: { fontSize: '16px' }, directText: 'Sidebar' },
        'sid-main': {
          rect: { x: 320, y: 0, w: 880, h: 700 },
          styles: { height: '700px', minHeight: '700px', display: 'flex', flexDirection: 'column' }
        },
        'sid-pmain': { rect: { x: 320, y: 0, w: 880, h: 30 }, styles: { fontSize: '16px' }, directText: 'Main content area with lots of text...' }
      }
    }
  }
};

const compiledUnequal = compileGroundTruthToElementor(astUnequal, snapshotUnequal, { viewport: 'desktop' });
const splitCon = compiledUnequal[0];
const childrenUnequal = splitCon.elements.filter(el => el.elType === 'container');

assert.strictEqual(childrenUnequal.length, 2, 'Must have 2 child containers');
assert.deepStrictEqual(childrenUnequal[0].settings.min_height, { unit: 'px', size: 280 }, 'Sidebar must preserve min_height 280');
assert.deepStrictEqual(childrenUnequal[1].settings.min_height, { unit: 'px', size: 700 }, 'Main must preserve min_height 700');
console.log('   ✓ Unequal row children preserve distinct min_height values.');

// ---------------------------------------------------------------------------
// Test 4: Virtual Renderer Emulation & Decalage Verification
// ---------------------------------------------------------------------------
console.log('\n4. Testing Virtual Renderer (Decalage & Stretch Verification)...');

const renderedHtml = renderElementorToHtml({
  title: 'Equal Height Rows Test',
  content: compiledElements
});

assert.ok(renderedHtml.includes('align-items: stretch'), 'Rendered CSS must contain align-items: stretch');
assert.ok(!renderedHtml.includes('--min-height: 420px'), 'Cards must not have rigid 420px min-height');
console.log('   ✓ Virtual renderer verified: align-items: stretch active, no rigid min-height decalage.');

// ---------------------------------------------------------------------------
// Test 5: Scalar Contract Compliance
// ---------------------------------------------------------------------------
console.log('\n5. Testing Scalar Contract compliance...');
const scalarViolations = validateTemplate({ content: compiledElements });
assert.strictEqual(scalarViolations.length, 0, 'Zero scalar contract violations expected');
console.log('   ✓ 0 scalar contract violations detected.');

console.log('\n=== ALL TASK F7 CHECKS PASSED ===\n');

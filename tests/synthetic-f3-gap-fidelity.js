/**
 * Synthetic Test: Task F3 - Gap Fidelity (columnGap & rowGap Settings)
 * 
 * Verifies that:
 * 1. Buttons row container (columnGap: 16px, rowGap: 0px) maps to gap { unit: 'px', column: 16, row: 0, isLinked: false }.
 * 2. Meta row container (columnGap: 12px, rowGap: 8px) maps to gap { unit: 'px', column: 12, row: 8, isLinked: false }.
 * 3. space_between_widgets remains an independent numeric scalar (not merged into gap object).
 * 4. Virtual emulator renders separated row-gap and column-gap in CSS.
 * 5. Fallback ladder R1 heals columnGap without overriding rowGap.
 * 6. Scalar contract validates 0 violations on both templates.
 */

const assert = require('assert');
const { mapNodeToElementor } = require('../src/smart/geometry-mapper');
const { renderElementorToHtml } = require('../src/emulator/elementor-virtual-renderer');
const { applyR1Mutation } = require('../src/smart/fallback-ladder');
const { validateTemplate } = require('../src/smart/scalar-contract');

console.log('=== Task F3: Gap Fidelity Synthetic Suite ===\n');

// 1. Buttons row (column-gap only)
console.log('1. Testing Buttons Row container (columnGap: 16px, rowGap: 0px)...');
const buttonsNode = {
  tagName: 'div',
  attributes: { 'data-sid': 'buttons-row-1', class: 'buttons-row' },
  children: [
    { tagName: 'button', attributes: { 'data-sid': 'btn-1' }, children: [] },
    { tagName: 'button', attributes: { 'data-sid': 'btn-2' }, children: [] }
  ]
};

const buttonsSnapshot = {
  viewports: {
    desktop: {
      flat: {
        'buttons-row-1': {
          sid: 'buttons-row-1',
          rect: { x: 100, y: 100, w: 400, h: 48 },
          styles: {
            display: 'flex',
            flexDirection: 'row',
            flexWrap: 'nowrap',
            columnGap: '16px',
            rowGap: '0px'
          }
        },
        'btn-1': {
          sid: 'btn-1',
          rect: { x: 100, y: 100, w: 150, h: 48 },
          styles: { display: 'inline-block' }
        },
        'btn-2': {
          sid: 'btn-2',
          rect: { x: 266, y: 100, w: 150, h: 48 },
          styles: { display: 'inline-block' }
        }
      }
    }
  }
};

const mappedButtons = mapNodeToElementor(buttonsNode, null, buttonsSnapshot, 'desktop');
assert.ok(mappedButtons, 'Buttons row should be mapped');
assert.strictEqual(mappedButtons.settings.direction, 'row');
assert.deepStrictEqual(mappedButtons.settings.gap, {
  unit: 'px',
  size: 16,
  column: 16,
  row: 0,
  isLinked: false
}, 'gap must separate column:16 and row:0');
assert.strictEqual(typeof mappedButtons.settings.space_between_widgets, 'number', 'space_between_widgets must remain a numeric scalar');
console.log('   ✓ Buttons row container mapped with separated columnGap: 16px, rowGap: 0px.');

// 2. Meta row (separate column-gap and row-gap)
console.log('\n2. Testing Meta Row container (columnGap: 12px, rowGap: 8px)...');
const metaNode = {
  tagName: 'div',
  attributes: { 'data-sid': 'meta-row-1', class: 'meta-row' },
  children: [
    { tagName: 'span', attributes: { 'data-sid': 'meta-1' }, children: [] },
    { tagName: 'span', attributes: { 'data-sid': 'meta-2' }, children: [] }
  ]
};

const metaSnapshot = {
  viewports: {
    desktop: {
      flat: {
        'meta-row-1': {
          sid: 'meta-row-1',
          rect: { x: 100, y: 200, w: 500, h: 60 },
          styles: {
            display: 'flex',
            flexDirection: 'row',
            flexWrap: 'wrap',
            columnGap: '12px',
            rowGap: '8px'
          }
        },
        'meta-1': {
          sid: 'meta-1',
          rect: { x: 100, y: 200, w: 200, h: 24 },
          styles: { display: 'inline' }
        },
        'meta-2': {
          sid: 'meta-2',
          rect: { x: 312, y: 200, w: 180, h: 24 },
          styles: { display: 'inline' }
        }
      }
    }
  }
};

const mappedMeta = mapNodeToElementor(metaNode, null, metaSnapshot, 'desktop');
assert.ok(mappedMeta, 'Meta row should be mapped');
assert.strictEqual(mappedMeta.settings.direction, 'row');
assert.deepStrictEqual(mappedMeta.settings.gap, {
  unit: 'px',
  size: 12,
  column: 12,
  row: 8,
  isLinked: false
}, 'gap must separate column:12 and row:8');
assert.strictEqual(typeof mappedMeta.settings.space_between_widgets, 'number', 'space_between_widgets must remain a numeric scalar');
console.log('   ✓ Meta row container mapped with separated columnGap: 12px, rowGap: 8px.');

// 3. Virtual Renderer CSS Emission
console.log('\n3. Testing Emulator CSS generation for separated gaps...');
const htmlButtons = renderElementorToHtml({
  title: 'Buttons Gap Test',
  content: [mappedButtons]
});

assert.ok(htmlButtons.includes('--column-gap: 16px;'), 'CSS must include --column-gap: 16px');
assert.ok(htmlButtons.includes('--row-gap: 0px;'), 'CSS must include --row-gap: 0px');
assert.ok(htmlButtons.includes('gap: 0px 16px;'), 'CSS must include gap: 0px 16px');

const htmlMeta = renderElementorToHtml({
  title: 'Meta Gap Test',
  content: [mappedMeta]
});

assert.ok(htmlMeta.includes('--column-gap: 12px;'), 'CSS must include --column-gap: 12px');
assert.ok(htmlMeta.includes('--row-gap: 8px;'), 'CSS must include --row-gap: 8px');
assert.ok(htmlMeta.includes('gap: 8px 12px;'), 'CSS must include gap: 8px 12px');
console.log('   ✓ Emulator emitted exact per-axis row-gap and column-gap CSS rules.');

// 4. Fallback ladder R1 healing test
console.log('\n4. Testing Fallback Ladder R1 healing for columnGap...');
const mockHealingContainer = {
  id: 'c_test_gap',
  elType: 'container',
  settings: {
    gap: { unit: 'px', size: 8, column: 8, row: 8, isLinked: true },
    flex_gap: { unit: 'px', size: 8, column: 8, row: 8, isLinked: true }
  }
};

const columnGapDefect = {
  nodeSid: 'c_test_gap',
  property: 'columnGap',
  original: '24px',
  rendered: '8px'
};

const healed = applyR1Mutation(mockHealingContainer, columnGapDefect);
assert.strictEqual(healed, true, 'applyR1Mutation should succeed on columnGap');
assert.strictEqual(mockHealingContainer.settings.gap.column, 24, 'columnGap must be updated to 24');
assert.strictEqual(mockHealingContainer.settings.gap.row, 8, 'rowGap must remain 8 (not overridden)');
assert.strictEqual(mockHealingContainer.settings.gap.isLinked, false, 'isLinked must become false');
console.log('   ✓ Fallback Ladder R1 updated columnGap to 24px while keeping rowGap at 8px.');

// 5. Scalar contract validation
console.log('\n5. Testing Scalar Contract compliance on both templates...');
const violations1 = validateTemplate({ content: [mappedButtons] });
assert.strictEqual(violations1.length, 0, 'Buttons template must have 0 scalar contract violations');

const violations2 = validateTemplate({ content: [mappedMeta] });
assert.strictEqual(violations2.length, 0, 'Meta template must have 0 scalar contract violations');
console.log('   ✓ 0 scalar contract violations detected on separated gap structures.');

// 6. Verification matrix gap check
console.log('\n6. Testing Verification Matrix RULE-BOX-01 for columnGap and rowGap...');
const { auditVerificationMatrix } = require('../src/smart/verification-matrix');

const gtGapSnapshot = {
  viewports: {
    desktop: {
      flat: {
        'row-1': {
          tag: 'div',
          sid: 'row-1',
          rect: { x: 100, y: 100, w: 400, h: 40 },
          styles: {
            display: 'flex',
            columnGap: '16px',
            rowGap: '0px'
          }
        }
      }
    }
  }
};

const rnGapMatching = {
  viewports: {
    desktop: {
      flat: {
        'row-1': {
          tag: 'div',
          sid: 'row-1',
          rect: { x: 100, y: 100, w: 400, h: 40 },
          styles: {
            display: 'flex',
            columnGap: '16px',
            rowGap: '0px'
          }
        }
      }
    }
  }
};

const resPass = auditVerificationMatrix(gtGapSnapshot, rnGapMatching, { content: [] });
const gapDefectsPass = resPass.defects.filter(d => d.property === 'columnGap' || d.property === 'rowGap');
assert.strictEqual(gapDefectsPass.length, 0, 'No gap defects when columnGap and rowGap match');

const rnGapFailing = {
  viewports: {
    desktop: {
      flat: {
        'row-1': {
          tag: 'div',
          sid: 'row-1',
          rect: { x: 100, y: 100, w: 400, h: 40 },
          styles: {
            display: 'flex',
            columnGap: '0px', // Missing columnGap
            rowGap: '0px'
          }
        }
      }
    }
  }
};

const resFail = auditVerificationMatrix(gtGapSnapshot, rnGapFailing, { content: [] });
const gapDefectsFail = resFail.defects.filter(d => d.property === 'columnGap');
assert.strictEqual(gapDefectsFail.length, 1, 'RULE-BOX-01 must catch columnGap mismatch');
console.log('   ✓ Verification matrix correctly caught columnGap delta (expected 16px, got 0px).');

console.log('\n=== ALL TASK F3 CHECKS PASSED ===\n');

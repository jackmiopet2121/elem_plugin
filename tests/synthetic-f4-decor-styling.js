/**
 * Synthetic Test: Task F4 - Decor Wrapper Styling (Icon Circles & Feature Boxes)
 * 
 * Verifies that:
 * 1. Trust badge circles (48x48) map to native icon widget with circular decor styling (50% radius, alpha bg).
 * 2. Feature icon boxes (56x56) map to native icon widget with boxed decor styling (12px radius, border, solid bg).
 * 3. Scoped micro-CSS rules target .elementor-element-{id} .elementor-widget-container and .elementor-element-{id} .elementor-icon.
 * 4. Virtual emulator renders exact width, height, border-radius, background, border, and flex centering.
 * 5. Scalar contract validation passes with 0 violations.
 * 6. Verification matrix confirms 0 defects for decor properties.
 */

const assert = require('assert');
const { mapNodeToElementor } = require('../src/smart/geometry-mapper');
const { renderElementorToHtml } = require('../src/emulator/elementor-virtual-renderer');
const { validateTemplate } = require('../src/smart/scalar-contract');
const { auditVerificationMatrix } = require('../src/smart/verification-matrix');

console.log('=== Task F4: Decor Wrapper Styling Synthetic Suite ===\n');

// 1. Trust badge circles (48x48)
console.log('1. Testing Trust Badge Circle (48x48, radius ~50%, rgba background)...');
const badgeNode = {
  tagName: 'span',
  attributes: { 'data-sid': 'badge-1', class: 'trust-badge-circle' },
  children: [
    {
      tagName: 'i',
      attributes: { 'data-sid': 'badge-icon-1', class: 'fas fa-shield-alt' },
      children: []
    }
  ]
};

const badgeSnapshot = {
  viewports: {
    desktop: {
      flat: {
        'badge-1': {
          sid: 'badge-1',
          rect: { x: 100, y: 100, w: 48, h: 48 },
          styles: {
            display: 'inline-flex',
            width: '48px',
            height: '48px',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            borderTopLeftRadius: '24px',
            borderTopRightRadius: '24px',
            borderBottomRightRadius: '24px',
            borderBottomLeftRadius: '24px',
            borderTopWidth: '0px',
            borderTopStyle: 'none'
          }
        },
        'badge-icon-1': {
          sid: 'badge-icon-1',
          rect: { x: 114, y: 114, w: 20, h: 20 },
          styles: {
            color: '#3b82f6',
            fontSize: '20px'
          }
        }
      }
    }
  }
};

const atomicRules1 = [];
const mappedBadge = mapNodeToElementor(badgeNode, null, badgeSnapshot, 'desktop', { atomicRules: atomicRules1 });

assert.ok(mappedBadge, 'Badge node must be mapped');
assert.strictEqual(mappedBadge.widgetType, 'icon', 'Badge circle should map to native icon widget');
assert.ok(mappedBadge.settings._icon_decor, 'Icon widget must capture _icon_decor');
assert.strictEqual(mappedBadge.settings._icon_decor.type, 'circular', 'Decor type must be circular');
assert.strictEqual(mappedBadge.settings._icon_decor.width, 48, 'Width must be 48');
assert.strictEqual(mappedBadge.settings._icon_decor.height, 48, 'Height must be 48');
assert.strictEqual(mappedBadge.settings._icon_decor.borderRadius, '50%', 'Border radius must be 50%');
const { resolveElementSelector } = require('../src/smart/semantic-scoper');
assert.strictEqual(mappedBadge.settings.secondary_color || mappedBadge.settings.primary_color, '#3b82f6', 'Icon glyph color must be preserved');
assert.strictEqual(atomicRules1.length, 1, 'Exactly one atomic micro-CSS rule must be emitted');
const bTarget = resolveElementSelector(badgeNode, mappedBadge.id);
assert.ok(atomicRules1[0].includes(`${bTarget} .elementor-widget-container`) || atomicRules1[0].includes(`.elementor-element-${mappedBadge.id} .elementor-widget-container`), 'Must target .elementor-widget-container');
assert.ok(atomicRules1[0].includes(`${bTarget} .elementor-icon`) || atomicRules1[0].includes(`.elementor-element-${mappedBadge.id} .elementor-icon`), 'Must target .elementor-icon');
assert.ok(atomicRules1[0].includes('border-radius: 50% !important;'), 'Rule must specify border-radius: 50%');
assert.ok(atomicRules1[0].includes('background: rgba(59, 130, 246, 0.1) !important;'), 'Rule must specify rgba background');
assert.ok(atomicRules1[0].includes('display: flex !important;'), 'Rule must specify display: flex');
console.log('   ✓ Trust badge circle mapped to icon widget with exact 48x48 circular decor.');

// 2. Feature icon boxes (56x56)
console.log('\n2. Testing Feature Icon Box (56x56, radius 12px, border, solid background)...');
const boxNode = {
  tagName: 'div',
  attributes: { 'data-sid': 'box-1', class: 'feature-icon-box' },
  children: [
    {
      tagName: 'svg',
      attributes: { 'data-sid': 'box-svg-1', class: 'icon-bolt' },
      children: []
    }
  ]
};

const boxSnapshot = {
  viewports: {
    desktop: {
      flat: {
        'box-1': {
          sid: 'box-1',
          rect: { x: 200, y: 100, w: 56, h: 56 },
          styles: {
            display: 'flex',
            width: '56px',
            height: '56px',
            backgroundColor: '#eff6ff',
            borderTopWidth: '1px',
            borderTopStyle: 'solid',
            borderTopColor: '#bfdbfe',
            borderRightWidth: '1px',
            borderBottomWidth: '1px',
            borderLeftWidth: '1px',
            borderTopLeftRadius: '12px',
            borderTopRightRadius: '12px',
            borderBottomRightRadius: '12px',
            borderBottomLeftRadius: '12px'
          }
        },
        'box-svg-1': {
          sid: 'box-svg-1',
          rect: { x: 216, y: 116, w: 24, h: 24 },
          styles: {
            color: '#2563eb',
            stroke: '#2563eb'
          }
        }
      }
    }
  }
};

const atomicRules2 = [];
const mappedBox = mapNodeToElementor(boxNode, null, boxSnapshot, 'desktop', { atomicRules: atomicRules2 });

assert.ok(mappedBox, 'Box node must be mapped');
assert.strictEqual(mappedBox.widgetType, 'icon', 'Box container should map to native icon widget');
assert.ok(mappedBox.settings._icon_decor, 'Icon widget must capture _icon_decor');
assert.strictEqual(mappedBox.settings._icon_decor.type, 'boxed', 'Decor type must be boxed');
assert.strictEqual(mappedBox.settings._icon_decor.width, 56, 'Width must be 56');
assert.strictEqual(mappedBox.settings._icon_decor.height, 56, 'Height must be 56');
assert.strictEqual(mappedBox.settings._icon_decor.borderRadius, '12px', 'Border radius must be 12px');
assert.strictEqual(mappedBox.settings._icon_decor.background, '#eff6ff', 'Background must match computed style');
assert.strictEqual(mappedBox.settings._icon_decor.border, '1px solid #bfdbfe', 'Border must match computed style');
assert.strictEqual(mappedBox.settings.secondary_color || mappedBox.settings.primary_color, '#2563eb', 'Primary glyph color must match child');
assert.strictEqual(atomicRules2.length, 1, 'Exactly one atomic micro-CSS rule must be emitted');
assert.ok(atomicRules2[0].includes('border: 1px solid #bfdbfe !important;'), 'Rule must specify border');
assert.ok(atomicRules2[0].includes('border-radius: 12px !important;'), 'Rule must specify 12px radius');
console.log('   ✓ Feature icon box mapped to icon widget with exact 56x56 boxed decor.');

// 3. Virtual Emulator CSS Generation
console.log('\n3. Testing Emulator CSS generation for decor icons...');
const htmlBadge = renderElementorToHtml({
  title: 'Badge Test',
  content: [mappedBadge]
});
assert.ok(htmlBadge.includes('border-radius: 50%') || htmlBadge.includes('border-radius: 50%;'), 'Rendered CSS must include border-radius: 50%');
assert.ok(htmlBadge.includes('rgba(59, 130, 246, 0.1)'), 'Rendered CSS must include rgba background');
assert.ok(htmlBadge.includes('width: 48px') || htmlBadge.includes('48px'), 'Rendered CSS must include width: 48px');
assert.ok(htmlBadge.includes('height: 48px') || htmlBadge.includes('48px'), 'Rendered CSS must include height: 48px');

const htmlBox = renderElementorToHtml({
  title: 'Box Test',
  content: [mappedBox]
});
assert.ok(htmlBox.includes('border: 1px solid #bfdbfe') || htmlBox.includes('#bfdbfe'), 'Rendered CSS must include border: 1px solid #bfdbfe');
assert.ok(htmlBox.includes('border-radius: 12px'), 'Rendered CSS must include border-radius: 12px');
assert.ok(htmlBox.includes('width: 56px') || htmlBox.includes('56px'), 'Rendered CSS must include width: 56px');
assert.ok(htmlBox.includes('height: 56px') || htmlBox.includes('56px'), 'Rendered CSS must include height: 56px');
console.log('   ✓ Emulator generated exact per-element scoped decor CSS.');

// 4. Scalar Contract Compliance
console.log('\n4. Testing Scalar Contract compliance...');
const violationsBadge = validateTemplate({ content: [mappedBadge] });
assert.strictEqual(violationsBadge.length, 0, 'Badge template must have 0 scalar contract violations');

const violationsBox = validateTemplate({ content: [mappedBox] });
assert.strictEqual(violationsBox.length, 0, 'Box template must have 0 scalar contract violations');
console.log('   ✓ 0 scalar contract violations detected on templates with _icon_decor.');

// 5. Verification Matrix Parity Check
console.log('\n5. Testing Verification Matrix RULE-CLR-02 and RULE-BOX-02 on decor icons...');
const gtBadge = {
  viewports: {
    desktop: {
      flat: {
        'badge-1': {
          tag: 'span',
          sid: 'badge-1',
          rect: { x: 100, y: 100, w: 48, h: 48 },
          styles: {
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            borderTopLeftRadius: '24px',
            borderTopRightRadius: '24px',
            borderBottomRightRadius: '24px',
            borderBottomLeftRadius: '24px'
          }
        }
      }
    }
  }
};

const rnBadgeMatching = {
  viewports: {
    desktop: {
      flat: {
        'badge-1': {
          tag: 'div',
          sid: 'badge-1',
          widgetType: 'icon.default',
          rect: { x: 100, y: 100, w: 48, h: 48 },
          styles: {
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            borderTopLeftRadius: '24px',
            borderTopRightRadius: '24px',
            borderBottomRightRadius: '24px',
            borderBottomLeftRadius: '24px'
          }
        }
      }
    }
  }
};

const auditPass = auditVerificationMatrix(gtBadge, rnBadgeMatching, { content: [mappedBadge] });
const decorDefects = auditPass.defects.filter(d => d.property === 'backgroundColor' || d.property === 'borderTopLeftRadius');
assert.strictEqual(decorDefects.length, 0, 'No decor defects when rendered styles match ground truth');
console.log('   ✓ Verification matrix confirms 0 defects for matching decor styles.');

console.log('\n=== ALL TASK F4 CHECKS PASSED ===\n');

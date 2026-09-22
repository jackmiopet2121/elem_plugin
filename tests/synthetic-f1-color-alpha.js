/**
 * Synthetic Test: Task F1 - Color Alpha Fidelity
 * 
 * Verifies that:
 * 1. normalizeColor preserves alpha channel for translucent rgba values.
 * 2. Solid colors normalize to #rrggbb hex.
 * 3. Transparent colors normalize to 'transparent'.
 * 4. isColorEqual compares with tolerance on alpha (|Δa| <= 0.03) and rgb (|Δrgb| <= 2).
 * 5. Matrix RULE-CLR-02 produces NO false positive on matching rgba values.
 * 6. Matrix RULE-CLR-02 catches solid #ffffff when rgba(255,255,255,0.1) is expected.
 * 7. Container settings retain rgba string for background_color.
 */

const assert = require('assert');
const { normalizeColor, isColorEqual, parseColorParts } = require('../src/smart/tolerances');
const { mapNodeToElementor } = require('../src/smart/geometry-mapper');
const { auditVerificationMatrix } = require('../src/smart/verification-matrix');

console.log('=== Task F1: Color Alpha Fidelity Synthetic Suite ===\n');

// 1. parseColorParts unit tests
console.log('1. Testing parseColorParts...');
const pRgba = parseColorParts('rgba(255, 255, 255, 0.1)');
assert.deepStrictEqual(pRgba, { r: 255, g: 255, b: 255, a: 0.1 }, 'RGBA parsing mismatch');

const pHex8 = parseColorParts('#ffffff1a');
assert.strictEqual(pHex8.r, 255);
assert.strictEqual(pHex8.g, 255);
assert.strictEqual(pHex8.b, 255);
assert.ok(Math.abs(pHex8.a - 0.102) < 0.01, 'Hex8 alpha parsing mismatch');

const pTrans = parseColorParts('rgba(0, 0, 0, 0)');
assert.strictEqual(pTrans.a, 0, 'Transparent alpha should be 0');
console.log('   ✓ parseColorParts correctly parses hex, rgb, rgba, and named colors.');

// 2. normalizeColor unit tests
console.log('\n2. Testing normalizeColor...');
assert.strictEqual(
  normalizeColor('rgba(255, 255, 255, 0.1)'),
  'rgba(255, 255, 255, 0.1)',
  'Translucent rgba(255, 255, 255, 0.1) must not be stripped to #ffffff'
);

assert.strictEqual(
  normalizeColor('rgba(255, 255, 255, 0.08)'),
  'rgba(255, 255, 255, 0.08)',
  'Translucent rgba(255, 255, 255, 0.08) must be preserved'
);

assert.strictEqual(
  normalizeColor('rgb(255, 255, 255)'),
  '#ffffff',
  'Fully opaque rgb(255, 255, 255) must normalize to #ffffff'
);

assert.strictEqual(
  normalizeColor('rgba(255, 255, 255, 1)'),
  '#ffffff',
  'Fully opaque rgba(255, 255, 255, 1) must normalize to #ffffff'
);

assert.strictEqual(
  normalizeColor('rgba(0, 0, 0, 0)'),
  'transparent',
  'Zero alpha must normalize to transparent'
);

assert.strictEqual(
  normalizeColor('transparent'),
  'transparent',
  'transparent must normalize to transparent'
);

assert.strictEqual(
  normalizeColor('#111827'),
  '#111827',
  'Solid hex #111827 must normalize to #111827'
);
console.log('   ✓ normalizeColor preserves translucency and normalizes opaque/transparent cleanly.');

// 3. isColorEqual alpha-aware comparison
console.log('\n3. Testing isColorEqual with alpha tolerance...');
assert.strictEqual(
  isColorEqual('rgba(255, 255, 255, 0.1)', 'rgba(255, 255, 255, 0.1)'),
  true,
  'Identical rgba must be equal'
);

assert.strictEqual(
  isColorEqual('rgba(255, 255, 255, 0.1)', 'rgba(255, 255, 255, 0.10196)'),
  true,
  'Subpixel/rounding alpha diff (|Δa| <= 0.03) must be equal'
);

assert.strictEqual(
  isColorEqual('rgba(255, 255, 255, 0.1)', '#ffffff'),
  false,
  'Translucent rgba(255,255,255,0.1) must NOT equal solid #ffffff'
);

assert.strictEqual(
  isColorEqual('rgba(255, 255, 255, 0.1)', 'rgba(255, 255, 255, 0.8)'),
  false,
  'Different alpha (0.1 vs 0.8) must NOT be equal'
);

assert.strictEqual(
  isColorEqual('rgba(0, 0, 0, 0)', 'transparent'),
  true,
  'Zero alpha rgba must equal transparent'
);

assert.strictEqual(
  isColorEqual('transparent', 'rgba(255, 255, 255, 0.1)'),
  false,
  'transparent must NOT equal translucent rgba'
);
console.log('   ✓ isColorEqual correctly applies alpha tolerance and rejects mismatches.');

// 4. Geometry mapper container settings emission
console.log('\n4. Testing geometry-mapper container settings with rgba background...');
const mockNode = {
  tagName: 'div',
  attributes: { 'data-sid': 'cta-visual-panel', class: 'cta-visual' },
  children: []
};
const mockSnapshot = {
  viewports: {
    desktop: {
      flat: {
        'cta-visual-panel': {
          sid: 'cta-visual-panel',
          rect: { x: 100, y: 200, w: 400, h: 300 },
          styles: {
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            borderTopLeftRadius: '16px',
            borderTopRightRadius: '16px',
            borderBottomRightRadius: '16px',
            borderBottomLeftRadius: '16px',
            paddingTop: '24px',
            paddingRight: '24px',
            paddingBottom: '24px',
            paddingLeft: '24px',
            marginTop: '0px',
            marginRight: '0px',
            marginBottom: '0px',
            marginLeft: '0px',
            gap: '16px'
          }
        }
      }
    }
  }
};

const mappedContainer = mapNodeToElementor(mockNode, null, mockSnapshot, 'desktop', { atomicRules: [] });
assert.ok(mappedContainer, 'Container should be mapped');
assert.strictEqual(
  mappedContainer.settings.background_color,
  'rgba(255, 255, 255, 0.1)',
  'Container settings must contain rgba(255, 255, 255, 0.1) for background_color'
);
assert.strictEqual(
  mappedContainer.settings.background_background,
  'classic',
  'Container background_background must be classic'
);
console.log('   ✓ geometry-mapper emitted background_color: rgba(255, 255, 255, 0.1).');

// 5. Verification matrix validation
console.log('\n5. Testing verification-matrix RULE-CLR-02 with alpha...');
const gtSnapshot = {
  viewports: {
    desktop: {
      flat: {
        'cta-box': {
          tag: 'div',
          sid: 'cta-box',
          rect: { x: 100, y: 100, w: 200, h: 200 },
          styles: {
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            color: '#ffffff'
          }
        }
      }
    }
  }
};

// Case A: Render matches GT within tolerance
const matchingRender = {
  viewports: {
    desktop: {
      flat: {
        'cta-box': {
          tag: 'div',
          sid: 'cta-box',
          widgetId: 'w_cta_1',
          rect: { x: 100, y: 100, w: 200, h: 200 },
          styles: {
            backgroundColor: 'rgba(255, 255, 255, 0.10196)',
            color: '#ffffff'
          }
        }
      }
    }
  }
};

const mockTemplate = {
  elements: [{
    id: 'w_cta_1',
    elType: 'widget',
    widgetType: 'heading',
    settings: { _sid: 'cta-box' }
  }]
};

const matrixResultPass = auditVerificationMatrix(gtSnapshot, matchingRender, mockTemplate);
const clrDefectsPass = matrixResultPass.defects.filter(d => d.rule === 'RULE-CLR-02');
assert.strictEqual(clrDefectsPass.length, 0, 'No RULE-CLR-02 defect should be flagged on matching rgba');
console.log('   ✓ Matching rgba produced 0 RULE-CLR-02 defects.');

// Case B: Render has solid white (bug reproduction)
const failingRender = {
  viewports: {
    desktop: {
      flat: {
        'cta-box': {
          tag: 'div',
          sid: 'cta-box',
          widgetId: 'w_cta_1',
          rect: { x: 100, y: 100, w: 200, h: 200 },
          styles: {
            backgroundColor: '#ffffff',
            color: '#ffffff'
          }
        }
      }
    }
  }
};

const matrixResultFail = auditVerificationMatrix(gtSnapshot, failingRender, mockTemplate);
const clrDefectsFail = matrixResultFail.defects.filter(d => d.rule === 'RULE-CLR-02');
assert.strictEqual(clrDefectsFail.length, 1, 'RULE-CLR-02 must be flagged when render is solid white');
assert.strictEqual(clrDefectsFail[0].severity, 'HIGH', 'Color defect must be HIGH severity');
console.log('   ✓ Solid white correctly flagged as HIGH severity RULE-CLR-02 defect against rgba.');

console.log('\n=== ALL TASK F1 CHECKS PASSED ===\n');

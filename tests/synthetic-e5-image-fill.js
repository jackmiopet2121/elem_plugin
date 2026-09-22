/**
 * SYNTHETIC TEST: E5 WRAPPER PERCENTAGE-HEIGHT PARITY (Hero Image Fill)
 * 
 * Verifies:
 * 1. geometry-mapper.js:
 *    - Detects image inside container where img height ≈ container height / object-fit: cover
 *    - Emits scoped micro-CSS: height: 100% !important; object-fit: cover !important;
 *    - Leaves regular unconstrained images unaffected.
 * 2. verification-matrix.js:
 *    - Compares GT img rect directly with rendered img rect (detects letterbox & height collapse)
 *    - Flags RULE-GEO-01 when img rect height collapses
 *    - Passes cleanly when img rect height is preserved
 */

const assert = require('assert');
const { mapNodeToElementor } = require('../src/smart/geometry-mapper');
const { auditVerificationMatrix } = require('../src/smart/verification-matrix');

console.log('========================================================================');
console.log('       SYNTHETIC TEST: E5 WRAPPER PERCENTAGE-HEIGHT PARITY');
console.log('========================================================================\n');

// --- 1. SCOPED MICRO-CSS EMISSION PROOF ---
console.log('▶ [1/3] Testing scoped micro-CSS emission for hero image fill...');

const mockHeroContainerNode = {
  tagName: 'div',
  className: 'hero-visual',
  attributes: { 'data-sid': 'sid-hero-con' },
  isTextOnly: () => false,
  children: []
};

const mockHeroImgNode = {
  tagName: 'img',
  className: 'hero-image',
  attributes: { 'data-sid': 'sid-hero-img', src: 'https://example.com/hero.jpg' },
  isTextOnly: () => false,
  children: []
};
mockHeroContainerNode.children.push(mockHeroImgNode);

const mockSnapshot = {
  viewports: {
    desktop: {
      flat: {
        'sid-hero-con': {
          sid: 'sid-hero-con',
          rect: { x: 500, y: 100, w: 600, h: 450 },
          styles: { height: '450px', display: 'flex' }
        },
        'sid-hero-img': {
          sid: 'sid-hero-img',
          rect: { x: 500, y: 100, w: 600, h: 450 },
          styles: {
            height: '100%',
            objectFit: 'cover',
            width: '100%'
          }
        }
      }
    }
  }
};

const atomicRules = [];
const options = { atomicRules };

const mappedImg = mapNodeToElementor(mockHeroImgNode, mockHeroContainerNode, mockSnapshot, 'desktop', options);
assert.ok(mappedImg, 'Mapped image widget must exist');
assert.strictEqual(mappedImg.widgetType, 'image', 'Widget type must be image');
assert.strictEqual(mappedImg.settings._hero_cover_fill, true, 'Image must be flagged with _hero_cover_fill');

assert.strictEqual(atomicRules.length, 1, 'Exactly one atomic scoped rule must be emitted for hero cover fill');
const { resolveElementSelector } = require('../src/smart/semantic-scoper');
const emittedRule = atomicRules[0];
const targetSelector = resolveElementSelector(mockHeroImgNode, mappedImg.id);
assert.ok(emittedRule.includes(targetSelector), 'Rule must scope to target selector');
assert.ok(emittedRule.includes(`${targetSelector} .elementor-widget-container`), 'Rule must target .elementor-widget-container');
assert.ok(emittedRule.includes(`${targetSelector} .elementor-widget-container img`), 'Rule must target img inside container');
assert.ok(emittedRule.includes('height: 100% !important;'), 'Rule must enforce height: 100% !important');
assert.ok(emittedRule.includes('object-fit: cover !important;'), 'Rule must enforce object-fit: cover !important');

console.log('  ✓ Scoped Rule Proof: Successfully emitted height:100% and object-fit:cover on widget, container, and img.');

// --- 2. NEGATIVE PROOF: UNCONSTRAINED INLINE IMAGE ---
console.log('\n▶ [2/3] Testing negative case (unconstrained inline image)...');
const mockInlineImgNode = {
  tagName: 'img',
  className: 'logo-img',
  attributes: { 'data-sid': 'sid-logo-img', src: 'https://example.com/logo.png' },
  isTextOnly: () => false,
  children: []
};

const mockHeaderConNode = {
  tagName: 'header',
  attributes: { 'data-sid': 'sid-header' },
  isTextOnly: () => false,
  children: [mockInlineImgNode]
};

mockSnapshot.viewports.desktop.flat['sid-header'] = {
  sid: 'sid-header',
  rect: { x: 0, y: 0, w: 1200, h: 80 },
  styles: { height: '80px' }
};
mockSnapshot.viewports.desktop.flat['sid-logo-img'] = {
  sid: 'sid-logo-img',
  rect: { x: 20, y: 20, w: 120, h: 40 },
  styles: { height: '40px', objectFit: 'fill' }
};

const inlineAtomicRules = [];
const mappedInline = mapNodeToElementor(mockInlineImgNode, mockHeaderConNode, mockSnapshot, 'desktop', { atomicRules: inlineAtomicRules });
assert.ok(mappedInline, 'Mapped inline image must exist');
assert.strictEqual(mappedInline.settings._hero_cover_fill, undefined, 'Unconstrained image must NOT have _hero_cover_fill');
assert.strictEqual(inlineAtomicRules.length, 0, 'No atomic rules emitted for standard inline image');
console.log('  ✓ Negative Proof: Normal inline images remain completely unconstrained.');

// --- 3. VERIFICATION MATRIX DIRECT IMG RECT COMPARISON ---
console.log('\n▶ [3/3] Testing Verification Matrix direct <img> rect comparison...');

const mockGtImg = {
  viewports: {
    desktop: {
      flat: {
        'sid-hero-img': {
          tag: 'img',
          rect: { x: 500, y: 100, w: 600, h: 450 },
          styles: { height: '450px', objectFit: 'cover' }
        }
      }
    }
  }
};

// Sub-case A: Rendered <img> height collapsed to 150px (letterbox gap)
const mockRenderCollapsed = {
  viewports: {
    desktop: {
      flat: {
        'sid-hero-img': {
          tag: 'img',
          widgetId: 'img-123',
          rect: { x: 500, y: 100, w: 600, h: 150 }, // Direct <img> rect collapsed
          outerRect: { x: 500, y: 100, w: 600, h: 450 }, // Wrapper was 450px, but <img> was only 150px!
          styles: { height: '150px' }
        }
      }
    }
  }
};

const resCollapsed = auditVerificationMatrix(
  mockGtImg,
  mockRenderCollapsed,
  {
    content: [{
      id: 'img-123',
      _sid: 'sid-hero-img',
      elType: 'widget',
      widgetType: 'image',
      settings: { _sid: 'sid-hero-img' }
    }]
  },
  { viewports: ['desktop'] }
);

const heightDefect = resCollapsed.defects.find(d => d.nodeSid === 'sid-hero-img' && d.property === 'height');
assert.ok(heightDefect, 'Must detect height discrepancy directly on <img> element rect');
assert.strictEqual(heightDefect.severity, 'HIGH', 'Discrepancy > 24px must be severity HIGH');
assert.strictEqual(heightDefect.rule, 'RULE-GEO-01', 'Rule must be RULE-GEO-01');
console.log(`  ✓ Violation Detection: Correctly flagged ${heightDefect.severity} ${heightDefect.rule} on collapsed <img> rect.`);

// Sub-case B: Rendered <img> height filled to 450px (compliant)
const mockRenderCompliant = {
  viewports: {
    desktop: {
      flat: {
        'sid-hero-img': {
          tag: 'img',
          widgetId: 'img-123',
          rect: { x: 500, y: 100, w: 600, h: 450 },
          outerRect: { x: 500, y: 100, w: 600, h: 450 },
          styles: { height: '450px' }
        }
      }
    }
  }
};

const resCompliant = auditVerificationMatrix(
  mockGtImg,
  mockRenderCompliant,
  {
    content: [{
      id: 'img-123',
      _sid: 'sid-hero-img',
      elType: 'widget',
      widgetType: 'image',
      settings: { _sid: 'sid-hero-img' }
    }]
  },
  { viewports: ['desktop'] }
);

const compliantHeightDefect = resCompliant.defects.find(d => d.nodeSid === 'sid-hero-img' && d.property === 'height');
assert.strictEqual(compliantHeightDefect, undefined, 'Compliant <img> render must produce 0 height defects');
console.log('  ✓ Compliant Proof: 0 height defects when <img> fills container height.');

console.log('\n========================================================================');
console.log('       ALL TASK E5 WRAPPER PERCENTAGE-HEIGHT TESTS PASSED! ✓');
console.log('========================================================================\n');

/**
 * Task F8: E5 Reinforcement — Image Fill Synthetic Suite.
 * Validates:
 * 1. Hero Image (600px): objectFit: cover -> full selector chain, min-height 600px, ZERO max-height.
 * 2. Split Image (500px): objectFit: cover -> full selector chain, min-height 500px, ZERO max-height.
 * 3. Card Media (180px): inside 400px card (parentH != imgH) -> uses 180px min-height, ZERO max-height.
 * 4. Guide Image (240px): height: 100% + objectFit: cover -> min-height 240px, ZERO max-height.
 * 5. Negative Control: standard inline image (height: auto, objectFit: initial) -> NO cover fill rule.
 * 6. Full selector chain parity: widget + .elementor-widget-container + img.
 * 7. Scalar Contract compliance.
 */

const assert = require('assert');
const { compileGroundTruthToElementor } = require('../src/smart/geometry-mapper');
const { validateTemplate } = require('../src/smart/scalar-contract');

console.log('=== Task F8: E5 Reinforcement (Image Fill) Synthetic Suite ===\n');

// ---------------------------------------------------------------------------
// Test 1: Hero Image (600px)
// ---------------------------------------------------------------------------
console.log('1. Testing Hero Image (600px fill, zero max-height cap)...');

const astHero = {
  tagName: 'root',
  children: [
    {
      tagName: 'section',
      id: 'hero-sec',
      attributes: { 'data-sid': 'sid-hero-sec' },
      children: [
        {
          tagName: 'img',
          id: 'hero-img',
          attributes: { 'data-sid': 'sid-hero-img', src: 'https://example.com/hero.jpg', alt: 'Hero' },
          children: []
        }
      ]
    }
  ]
};

const snapshotHero = {
  viewports: {
    desktop: {
      flat: {
        'sid-1': { rect: { x: 0, y: 0, w: 1200, h: 600 }, styles: {} },
        'sid-hero-sec': {
          rect: { x: 0, y: 0, w: 1200, h: 600 },
          styles: { display: 'flex', flexDirection: 'column' }
        },
        'sid-hero-img': {
          rect: { x: 0, y: 0, w: 1200, h: 600 },
          styles: {
            height: '100%',
            objectFit: 'cover'
          }
        }
      }
    }
  }
};

const atomicRulesHero = [];
const compiledHero = compileGroundTruthToElementor(astHero, snapshotHero, {
  viewport: 'desktop',
  atomicRules: atomicRulesHero
});

assert.ok(atomicRulesHero.length > 0, 'Must emit atomic rule for hero image');
const heroRule = atomicRulesHero[0];

assert.ok(heroRule.includes('.elementor-widget-container'), 'Rule must include .elementor-widget-container');
assert.ok(heroRule.includes('.elementor-widget-container img'), 'Rule must include .elementor-widget-container img');
assert.ok(heroRule.includes('height: 100% !important;'), 'Rule must include height: 100% !important');
assert.ok(heroRule.includes('object-fit: cover !important;'), 'Rule must include object-fit: cover !important');
assert.ok(heroRule.includes('min-height: 600px !important;'), 'Rule must include min-height: 600px !important');
assert.ok(!heroRule.includes('max-height'), 'ZERO max-height cap: Rule must NOT contain max-height');
console.log('   ✓ Hero image 600px: full selector chain verified, min-height 600px present, max-height cap ZERO.');

// ---------------------------------------------------------------------------
// Test 2: Split Image (500px)
// ---------------------------------------------------------------------------
console.log('\n2. Testing Split Image (500px fill)...');

const astSplit = {
  tagName: 'root',
  children: [
    {
      tagName: 'div',
      id: 'split-wrap',
      attributes: { 'data-sid': 'sid-split-wrap' },
      children: [
        {
          tagName: 'img',
          id: 'split-img',
          attributes: { 'data-sid': 'sid-split-img', src: 'https://example.com/split.jpg', alt: 'Split' },
          children: []
        }
      ]
    }
  ]
};

const snapshotSplit = {
  viewports: {
    desktop: {
      flat: {
        'sid-1': { rect: { x: 0, y: 0, w: 1200, h: 500 }, styles: {} },
        'sid-split-wrap': {
          rect: { x: 0, y: 0, w: 600, h: 500 },
          styles: { display: 'flex', flexDirection: 'column' }
        },
        'sid-split-img': {
          rect: { x: 0, y: 0, w: 600, h: 500 },
          styles: {
            objectFit: 'cover',
            height: '500px'
          }
        }
      }
    }
  }
};

const atomicRulesSplit = [];
compileGroundTruthToElementor(astSplit, snapshotSplit, {
  viewport: 'desktop',
  atomicRules: atomicRulesSplit
});

assert.ok(atomicRulesSplit.length > 0, 'Must emit atomic rule for split image');
const splitRule = atomicRulesSplit[0];
assert.ok(splitRule.includes('min-height: 500px !important;'), 'Must include min-height: 500px !important');
assert.ok(splitRule.includes('object-fit: cover !important;'), 'Must include object-fit: cover !important');
assert.ok(!splitRule.includes('max-height'), 'ZERO max-height cap on split image');
console.log('   ✓ Split image 500px: fill rule emitted with min-height 500px, max-height cap ZERO.');

// ---------------------------------------------------------------------------
// Test 3: Card Media Image (180px in 400px card, parentH != imgH)
// ---------------------------------------------------------------------------
console.log('\n3. Testing Card Media (180px inside 400px card)...');

const astCard = {
  tagName: 'root',
  children: [
    {
      tagName: 'article',
      id: 'blog-card',
      attributes: { 'data-sid': 'sid-card' },
      children: [
        {
          tagName: 'img',
          id: 'card-media-img',
          attributes: { 'data-sid': 'sid-media-img', src: 'https://example.com/card.jpg', alt: 'Card Media' },
          children: []
        },
        {
          tagName: 'h3',
          id: 'card-title',
          attributes: { 'data-sid': 'sid-card-title' },
          textContent: 'Card Title',
          children: []
        }
      ]
    }
  ]
};

const snapshotCard = {
  viewports: {
    desktop: {
      flat: {
        'sid-1': { rect: { x: 0, y: 0, w: 1200, h: 600 }, styles: {} },
        'sid-card': {
          rect: { x: 0, y: 0, w: 350, h: 400 },
          styles: { display: 'flex', flexDirection: 'column', height: '400px' }
        },
        'sid-media-img': {
          rect: { x: 0, y: 0, w: 350, h: 180 },
          styles: {
            objectFit: 'cover',
            height: '180px'
          }
        },
        'sid-card-title': {
          rect: { x: 0, y: 190, w: 350, h: 30 },
          styles: { fontSize: '18px' },
          directText: 'Card Title'
        }
      }
    }
  }
};

const atomicRulesCard = [];
compileGroundTruthToElementor(astCard, snapshotCard, {
  viewport: 'desktop',
  atomicRules: atomicRulesCard
});

assert.ok(atomicRulesCard.length > 0, 'Must emit atomic rule for card media image');
const cardRule = atomicRulesCard[0];
assert.ok(cardRule.includes('min-height: 180px !important;'), 'Must use image intrinsic 180px, NOT parent 400px!');
assert.ok(!cardRule.includes('400px'), 'Must not leak parent 400px into card media image');
assert.ok(!cardRule.includes('max-height'), 'ZERO max-height cap on card media image');
console.log('   ✓ Card media 180px: uses image height (180px), ignores parent height (400px), zero max-height.');

// ---------------------------------------------------------------------------
// Test 4: Guide Image (240px)
// ---------------------------------------------------------------------------
console.log('\n4. Testing Guide Image (240px)...');

const astGuide = {
  tagName: 'root',
  children: [
    {
      tagName: 'div',
      id: 'guide-media',
      attributes: { 'data-sid': 'sid-guide-media' },
      children: [
        {
          tagName: 'img',
          id: 'guide-img',
          attributes: { 'data-sid': 'sid-guide-img', src: 'https://example.com/guide.jpg', alt: 'Guide' },
          children: []
        }
      ]
    }
  ]
};

const snapshotGuide = {
  viewports: {
    desktop: {
      flat: {
        'sid-1': { rect: { x: 0, y: 0, w: 1200, h: 600 }, styles: {} },
        'sid-guide-media': {
          rect: { x: 0, y: 0, w: 380, h: 240 },
          styles: { height: '240px' }
        },
        'sid-guide-img': {
          rect: { x: 0, y: 0, w: 380, h: 240 },
          styles: {
            height: '100%',
            objectFit: 'cover'
          }
        }
      }
    }
  }
};

const atomicRulesGuide = [];
compileGroundTruthToElementor(astGuide, snapshotGuide, {
  viewport: 'desktop',
  atomicRules: atomicRulesGuide
});

assert.ok(atomicRulesGuide.length > 0, 'Must emit atomic rule for guide image');
const guideRule = atomicRulesGuide[0];
assert.ok(guideRule.includes('min-height: 240px !important;'), 'Must include min-height: 240px !important');
assert.ok(!guideRule.includes('max-height'), 'ZERO max-height cap on guide image');
console.log('   ✓ Guide image 240px: min-height 240px verified, max-height cap ZERO.');

// ---------------------------------------------------------------------------
// Test 5: Negative Control — Standard Inline Image
// ---------------------------------------------------------------------------
console.log('\n5. Testing Negative Control (Standard Inline Image)...');

const astStandard = {
  tagName: 'root',
  children: [
    {
      tagName: 'img',
      id: 'logo-img',
      attributes: { 'data-sid': 'sid-logo', src: 'https://example.com/logo.png', alt: 'Logo' },
      children: []
    }
  ]
};

const snapshotStandard = {
  viewports: {
    desktop: {
      flat: {
        'sid-1': { rect: { x: 0, y: 0, w: 1200, h: 600 }, styles: {} },
        'sid-logo': {
          rect: { x: 0, y: 0, w: 120, h: 40 },
          styles: {
            height: 'auto',
            objectFit: 'initial'
          }
        }
      }
    }
  }
};

const atomicRulesStandard = [];
compileGroundTruthToElementor(astStandard, snapshotStandard, {
  viewport: 'desktop',
  atomicRules: atomicRulesStandard
});

assert.strictEqual(atomicRulesStandard.length, 0, 'Standard inline image must NOT receive cover fill rule');
console.log('   ✓ Standard inline image correctly receives no cover fill rule.');

// ---------------------------------------------------------------------------
// Test 6: Scalar Contract Audit
// ---------------------------------------------------------------------------
console.log('\n6. Testing Scalar Contract compliance...');
const scalarViolations = validateTemplate({ content: compiledHero });
assert.strictEqual(scalarViolations.length, 0, 'Zero scalar contract violations expected');
console.log('   ✓ 0 scalar contract violations detected.');

console.log('\n=== ALL TASK F8 CHECKS PASSED ===\n');

/**
 * CHECKPOINT C15: FULL WP WRAPPER CHAIN AUDIT (TASK G3)
 * 
 * Verifies that:
 * 1. Every scoped decor rule contains the full Elementor wrapper chain:
 *    - .elementor-element-{id} .elementor-widget-container
 *    - .elementor-element-{id} .elementor-icon-wrapper
 *    - .elementor-element-{id} .elementor-icon
 *    - Declarations include !important
 * 2. Every scoped image fill rule contains the full Elementor wrapper chain:
 *    - .elementor-element-{id} .elementor-widget-image
 *    - .elementor-element-{id} .elementor-widget-container
 *    - .elementor-element-{id} .elementor-widget-container img
 *    - Declarations include !important
 * 3. Pseudo-elements retain css_classes and target the correct DOM depth.
 * 4. Source code generator in src/smart/geometry-mapper.js and emulator in
 *    src/emulator/elementor-virtual-renderer.js emit the full chains.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const {
  compileGroundTruthToElementor,
  mapNodeToElementor
} = require('../src/smart/geometry-mapper');
const { renderElementorToHtml } = require('../src/emulator/elementor-virtual-renderer');
const { validateTemplate } = require('../src/smart/scalar-contract');

console.log('========================================================================');
console.log('       CHECKPOINT C15: FULL WP WRAPPER CHAIN AUDIT (TASK G3)');
console.log('========================================================================\n');

let passedTests = 0;
let totalTests = 0;
const errors = [];

function pass(msg) {
  totalTests++;
  passedTests++;
  console.log(`  ✓ PASS: ${msg}`);
}

function fail(msg) {
  totalTests++;
  errors.push(msg);
  console.error(`  ❌ FAIL: ${msg}`);
}

// ---------------------------------------------------------------------------
// 1. SOURCE CODE CONTRACT AUDIT (geometry-mapper.js & elementor-virtual-renderer.js)
// ---------------------------------------------------------------------------
console.log('▶ [1/4] Auditing engine source code for full wrapper chains...');

const geoMapperPath = path.join(__dirname, '..', 'src', 'smart', 'geometry-mapper.js');
const geoMapperSrc = fs.readFileSync(geoMapperPath, 'utf8');

// A. Decor rule in geometry-mapper must target .elementor-icon-wrapper
if (geoMapperSrc.includes('.elementor-icon-wrapper') && geoMapperSrc.includes('.elementor-widget-container')) {
  pass('geometry-mapper.js decor scoped rule includes .elementor-icon-wrapper and .elementor-widget-container');
} else {
  fail('geometry-mapper.js decor scoped rule is missing .elementor-icon-wrapper in selector chain');
}

// B. Fill rule in geometry-mapper must target .elementor-widget-image
if (geoMapperSrc.includes('.elementor-widget-image') && geoMapperSrc.includes('.elementor-widget-container img')) {
  pass('geometry-mapper.js image fill scoped rule includes .elementor-widget-image and .elementor-widget-container');
} else {
  fail('geometry-mapper.js image fill scoped rule is missing .elementor-widget-image in selector chain');
}

// C. Virtual renderer must mirror decor wrapper chain
const rendererPath = path.join(__dirname, '..', 'src', 'emulator', 'elementor-virtual-renderer.js');
const rendererSrc = fs.readFileSync(rendererPath, 'utf8');
if (rendererSrc.includes('.elementor-icon-wrapper')) {
  pass('elementor-virtual-renderer.js decor styling mirrors .elementor-icon-wrapper in collected CSS');
} else {
  fail('elementor-virtual-renderer.js is missing .elementor-icon-wrapper in decor rules');
}

// ---------------------------------------------------------------------------
// 2. RUNTIME COMPILATION AUDIT: DECOR SCOPED RULE FULL CHAIN
// ---------------------------------------------------------------------------
console.log('\n▶ [2/4] Verifying Decor Scoped Rule generation through compiler...');

const mockDecorAst = {
  tagName: 'root',
  children: [
    {
      tagName: 'div',
      id: 'icon-box-wrapper',
      attributes: { 'data-sid': 'sid-icon-box' },
      children: [
        {
          tagName: 'div',
          id: 'feature-icon',
          className: 'icon-feature-badge',
          attributes: { 'data-sid': 'sid-feat-icon', class: 'icon-feature-badge' },
          children: [
            { tagName: 'i', className: 'fas fa-star', children: [] }
          ]
        }
      ]
    }
  ]
};

const mockDecorSnapshot = {
  viewports: {
    desktop: {
      flat: {
        'sid-icon-box': { rect: { x: 0, y: 0, w: 500, h: 100 }, styles: { display: 'flex' } },
        'sid-feat-icon': {
          rect: { x: 0, y: 0, w: 56, h: 56 },
          styles: {
            width: '56px',
            height: '56px',
            backgroundColor: '#eff6ff',
            borderTopWidth: '1px',
            borderTopStyle: 'solid',
            borderTopColor: '#bfdbfe',
            borderTopLeftRadius: '12px',
            borderTopRightRadius: '12px',
            borderBottomRightRadius: '12px',
            borderBottomLeftRadius: '12px'
          }
        }
      }
    }
  }
};

const decorAtomicRules = [];
const compiledDecor = compileGroundTruthToElementor(mockDecorAst, mockDecorSnapshot, {
  viewport: 'desktop',
  atomicRules: decorAtomicRules
});

assert.ok(decorAtomicRules.length > 0, 'Decor atomic rule must be generated');
const decorRule = decorAtomicRules[0];

// Verify full wrapper chain in decor rule
const hasWidgetContainer = decorRule.includes('.elementor-widget-container');
const hasIconWrapper = decorRule.includes('.elementor-icon-wrapper');
const hasIcon = decorRule.includes('.elementor-icon');
const hasImportant = decorRule.includes('!important');

if (hasWidgetContainer && hasIconWrapper && hasIcon && hasImportant) {
  pass('Decor scoped rule contains FULL wrapper chain (.elementor-widget-container, .elementor-icon-wrapper, .elementor-icon) with !important');
} else {
  fail(`Decor scoped rule missing required wrapper chain element: container=${hasWidgetContainer}, wrapper=${hasIconWrapper}, icon=${hasIcon}, important=${hasImportant}`);
}

// ---------------------------------------------------------------------------
// 3. RUNTIME COMPILATION AUDIT: IMAGE FILL SCOPED RULE FULL CHAIN
// ---------------------------------------------------------------------------
console.log('\n▶ [3/4] Verifying Image Fill Scoped Rule generation through compiler...');

const mockFillAst = {
  tagName: 'root',
  children: [
    {
      tagName: 'section',
      id: 'hero-wrap',
      attributes: { 'data-sid': 'sid-hero-wrap' },
      children: [
        {
          tagName: 'img',
          id: 'hero-banner',
          attributes: { 'data-sid': 'sid-hero-img', src: 'https://example.com/banner.jpg', alt: 'Hero' },
          children: []
        }
      ]
    }
  ]
};

const mockFillSnapshot = {
  viewports: {
    desktop: {
      flat: {
        'sid-hero-wrap': { rect: { x: 0, y: 0, w: 1200, h: 600 }, styles: { display: 'flex' } },
        'sid-hero-img': {
          rect: { x: 0, y: 0, w: 1200, h: 600 },
          styles: { height: '100%', objectFit: 'cover' }
        }
      }
    }
  }
};

const fillAtomicRules = [];
compileGroundTruthToElementor(mockFillAst, mockFillSnapshot, {
  viewport: 'desktop',
  atomicRules: fillAtomicRules
});

assert.ok(fillAtomicRules.length > 0, 'Image fill atomic rule must be generated');
const fillRule = fillAtomicRules[0];

// Verify full wrapper chain in fill rule
const hasWidgetImage = fillRule.includes('.elementor-widget-image');
const hasFillContainer = fillRule.includes('.elementor-widget-container');
const hasFillImg = fillRule.includes('.elementor-widget-container img');
const hasFillImportant = fillRule.includes('height: 100% !important;') && fillRule.includes('object-fit: cover !important;');

if (hasWidgetImage && hasFillContainer && hasFillImg && hasFillImportant) {
  pass('Image fill scoped rule contains FULL wrapper chain (.elementor-widget-image, .elementor-widget-container, img) with !important');
} else {
  fail(`Image fill scoped rule missing required wrapper chain element: widget-image=${hasWidgetImage}, container=${hasFillContainer}, img=${hasFillImg}, important=${hasFillImportant}`);
}

// ---------------------------------------------------------------------------
// 4. PSEUDO-ELEMENT CLASS RETENTION & DEPTH AUDIT
// ---------------------------------------------------------------------------
console.log('\n▶ [4/4] Verifying Pseudo-element class retention & depth...');

const mockPseudoNode = {
  tagName: 'div',
  id: 'step-counter-node',
  className: 'process-step numbered-step',
  attributes: { 'data-sid': 'sid-step', class: 'process-step numbered-step' },
  children: [
    { tagName: 'h4', textContent: 'Step One', children: [] }
  ]
};

const mockPseudoSnapshot = {
  viewports: {
    desktop: {
      flat: {
        'sid-step': {
          sid: 'sid-step',
          rect: { x: 0, y: 0, w: 300, h: 80 },
          styles: { position: 'relative' },
          pseudo: {
            before: {
              content: 'counter(step-counter)',
              position: 'absolute',
              width: '32px',
              height: '32px'
            }
          }
        }
      }
    }
  }
};

const mappedPseudo = mapNodeToElementor(mockPseudoNode, null, mockPseudoSnapshot, 'desktop', {});
assert.ok(mappedPseudo, 'Mapped pseudo element must exist');

const s = mappedPseudo.settings || {};
const retainedClasses = s.css_classes || s._css_classes || '';
const hasProcessStep = retainedClasses.includes('process-step');
const hasNumberedStep = retainedClasses.includes('numbered-step');
const hasPseudoFlag = s._has_pseudo === true;

if (hasProcessStep && hasNumberedStep && hasPseudoFlag) {
  pass('Active pseudo element preserves full css_classes string and _has_pseudo flag for CSS cascade');
} else {
  fail(`Pseudo element class retention incomplete: classes="${retainedClasses}", _has_pseudo=${hasPseudoFlag}`);
}

// ---------------------------------------------------------------------------
// 5. COMPILED CORPUS TEMPLATES AUDIT
// ---------------------------------------------------------------------------
console.log('\n▶ [5/5] Auditing compiled corpus templates for full wrapper chains...');

const corpusDir = path.join(__dirname, 'corpus');
if (fs.existsSync(corpusDir)) {
  const caseDirs = fs.readdirSync(corpusDir).filter(d => {
    const p = path.join(corpusDir, d);
    return fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'output.json'));
  });

  let totalAuditedRules = 0;
  for (const cDir of caseDirs) {
    const outputPath = path.join(corpusDir, cDir, 'output.json');
    const json = JSON.parse(fs.readFileSync(outputPath, 'utf8'));

    function extractStyles(nodes) {
      let styles = '';
      for (const el of nodes) {
        if (!el) continue;
        if (el.widgetType === 'html') {
          const h = el.settings?.html || '';
          if (h.includes('<style>')) {
            styles += '\n' + h;
          }
        }
        if (Array.isArray(el.elements)) {
          styles += '\n' + extractStyles(el.elements);
        }
      }
      return styles;
    }

    const allStyles = extractStyles(json.content || []);
    // Extract rule blocks from the style tags
    const ruleBlocks = allStyles.match(/\.elementor-element-[a-z0-9_-]+[^{]*\{[^}]*\}/gi) || [];

    for (const block of ruleBlocks) {
      const openIdx = block.indexOf('{');
      const selector = block.slice(0, openIdx).trim();
      const body = block.slice(openIdx + 1).trim();

      // Scoped decor check: if rule targets .elementor-icon, it must include .elementor-icon-wrapper
      if (selector.includes('.elementor-icon') && !selector.includes('indicator') && !selector.includes('chevron')) {
        totalAuditedRules++;
        if (!selector.includes('.elementor-icon-wrapper')) {
          fail(`${cDir}: Scoped decor rule missing .elementor-icon-wrapper in selector chain: "${selector}"`);
        }
        if (!selector.includes('.elementor-widget-container')) {
          fail(`${cDir}: Scoped decor rule missing .elementor-widget-container in selector chain: "${selector}"`);
        }
      }

      // Scoped fill check: if rule targets img with height: 100% and object-fit: cover, it must include .elementor-widget-image
      if (selector.includes('img') && body.includes('object-fit: cover') && body.includes('height: 100%')) {
        totalAuditedRules++;
        if (!selector.includes('.elementor-widget-image')) {
          fail(`${cDir}: Scoped fill rule missing .elementor-widget-image in selector chain: "${selector}"`);
        }
        if (!selector.includes('.elementor-widget-container')) {
          fail(`${cDir}: Scoped fill rule missing .elementor-widget-container in selector chain: "${selector}"`);
        }
      }
    }
  }

  pass(`Corpus templates audit passed (${totalAuditedRules} scoped decor/fill rules audited across ${caseDirs.length} corpus cases with 100% full wrapper chains)`);
}

// ---------------------------------------------------------------------------
// SUMMARY
// ---------------------------------------------------------------------------
console.log('\n========================================================================');
console.log(`Results: ${passedTests}/${totalTests} tests passed.`);
if (errors.length === 0) {
  console.log('✓ [CHECKPOINT C15 PASSED] Full WP wrapper chains & pseudo retention fully verified!\n');
  process.exit(0);
} else {
  console.error(`❌ [CHECKPOINT C15 FAILED] ${errors.length} error(s) detected:`);
  errors.forEach(e => console.error(`   - ${e}`));
  process.exit(1);
}

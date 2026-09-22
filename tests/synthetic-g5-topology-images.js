/**
 * SYNTHETIC TEST SUITE: TASK G5
 * Topology Parity, RULE-TOPOLOGY-02 Audit, and Direct Image Fill Chain
 * 
 * Verifies:
 * 1. RULE-TOPOLOGY-02 is registered in CRITICAL_RULES and AVAILABLE_RULES.
 * 2. Duplicate SID collision triggers CRITICAL RULE-TOPOLOGY-02 defect.
 * 3. Section vertical overlap > 20% triggers CRITICAL RULE-TOPOLOGY-02 defect.
 * 4. Compliant layout with unique SIDs and zero overlap passes RULE-TOPOLOGY-02 with 0 defects.
 * 5. Single-pass compiler disambiguates duplicate SIDs to enforce unique _sid per node.
 * 6. Scoped image fill rules target the <img> element directly with min-height and height: 100% !important.
 * 7. Headless Chromium verification: guide/card image inside auto-height parent renders with GT height > 0 without collapse.
 * 8. Scalar contract verification (100% schema compliant, 0 violations).
 */

const assert = require('assert');
const { createDefect, CRITICAL_RULES, AVAILABLE_RULES } = require('../src/smart/audit-schema');
const { auditVerificationMatrix } = require('../src/smart/verification-matrix');
const { mapNodeToElementor, compileGroundTruthToElementor } = require('../src/smart/geometry-mapper');
const { renderElementorToHtml } = require('../src/emulator/elementor-virtual-renderer');
const { createBrowserSession, renderAndCapture } = require('../src/inspector/headless-driver');
const { validateTemplate } = require('../src/smart/scalar-contract');

console.log('========================================================================');
console.log('    SYNTHETIC SUITE G5: TOPOLOGY & IMAGE FILL DIAGNOSIS');
console.log('========================================================================\n');

let passedTests = 0;
let totalTests = 0;

function pass(msg) {
  totalTests++;
  passedTests++;
  console.log(`  ✓ PASS: ${msg}`);
}

function fail(msg, err) {
  totalTests++;
  console.error(`  ❌ FAIL: ${msg}`);
  if (err) console.error(err);
}

(async () => {
  // ---------------------------------------------------------------------------
  // TEST 1: Schema Registration of RULE-TOPOLOGY-02
  // ---------------------------------------------------------------------------
  console.log('▶ [1/7] Verifying RULE-TOPOLOGY-02 in Audit Schema...');
  try {
    assert(CRITICAL_RULES.includes('RULE-TOPOLOGY-02'), 'RULE-TOPOLOGY-02 must be in CRITICAL_RULES');
    assert(AVAILABLE_RULES.includes('RULE-TOPOLOGY-02'), 'RULE-TOPOLOGY-02 must be in AVAILABLE_RULES');

    const defect = createDefect({
      nodeSid: 'sid-test',
      rule: 'RULE-TOPOLOGY-02',
      property: 'sid_uniqueness',
      original: 'unique',
      rendered: 'duplicate'
    });

    assert.strictEqual(defect.severity, 'CRITICAL', 'RULE-TOPOLOGY-02 defect severity must be CRITICAL');
    assert.strictEqual(defect.advisory, false, 'RULE-TOPOLOGY-02 defect advisory must be false');
    pass('RULE-TOPOLOGY-02 is registered as CRITICAL in audit schema');
  } catch (err) {
    fail('RULE-TOPOLOGY-02 schema registration failed', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Duplicate SID Detection in Verification Matrix
  // ---------------------------------------------------------------------------
  console.log('\n▶ [2/7] Testing Duplicate SID Collision Detection in Matrix...');
  try {
    const mockTemplateWithDups = {
      title: 'Duplicate SID Test',
      content: [
        {
          id: 'cont-1',
          elType: 'container',
          _sid: 'sid-root',
          settings: { content_width: 'boxed' },
          elements: [
            {
              id: 'widget-1',
              elType: 'widget',
              widgetType: 'heading',
              _sid: 'sid-duplicate-1',
              settings: { title: 'First Header' }
            },
            {
              id: 'widget-2',
              elType: 'widget',
              widgetType: 'heading',
              _sid: 'sid-duplicate-1', // Duplicate SID!
              settings: { title: 'Second Header' }
            }
          ]
        }
      ]
    };

    const mockGt = {
      viewports: {
        desktop: {
          flat: {
            'sid-root': { rect: { x: 0, y: 0, w: 1200, h: 400 }, styles: {} },
            'sid-duplicate-1': { rect: { x: 0, y: 0, w: 600, h: 40 }, styles: {} }
          }
        }
      }
    };

    const mockRender = {
      viewports: {
        desktop: {
          flat: {
            'sid-root': { rect: { x: 0, y: 0, w: 1200, h: 400 }, styles: {} },
            'sid-duplicate-1': { rect: { x: 0, y: 0, w: 600, h: 40 }, styles: {} }
          }
        }
      }
    };

    const audit = auditVerificationMatrix(mockGt, mockRender, mockTemplateWithDups);
    const topoDefects = audit.defects.filter(d => d.rule === 'RULE-TOPOLOGY-02');

    assert(topoDefects.length >= 1, 'Matrix must emit at least 1 RULE-TOPOLOGY-02 defect for duplicate SID');
    assert.strictEqual(topoDefects[0].severity, 'CRITICAL', 'Defect must be CRITICAL');
    assert.strictEqual(topoDefects[0].property, 'sid_uniqueness', 'Defect property must be sid_uniqueness');
    pass(`Matrix caught duplicate SID collision: ${topoDefects[0].message}`);
  } catch (err) {
    fail('Duplicate SID detection failed', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Section Overlap Detection (>20% Vertical Collision)
  // ---------------------------------------------------------------------------
  console.log('\n▶ [3/7] Testing Section Overlap Detection (>20% collision)...');
  try {
    const mockTemplateSections = {
      title: 'Section Overlap Test',
      content: [
        {
          id: 'root-cont',
          elType: 'container',
          _sid: 'sid-root',
          settings: { content_width: 'boxed' },
          elements: [
            {
              id: 'sec-devices',
              elType: 'container',
              _sid: 'sid-devices',
              settings: { content_width: 'full' },
              elements: []
            },
            {
              id: 'sec-guides',
              elType: 'container',
              _sid: 'sid-guides',
              settings: { content_width: 'full' },
              elements: []
            }
          ]
        }
      ]
    };

    // Case A: Severe overlap (Section 1: y=0, h=500; Section 2: y=300, h=500 -> overlap 200px / 500px = 40% > 20%)
    const mockRenderOverlap = {
      viewports: {
        desktop: {
          flat: {
            'sid-root': { rect: { x: 0, y: 0, w: 1200, h: 800 }, styles: {} },
            'sid-devices': { rect: { x: 0, y: 0, w: 1200, h: 500 }, styles: {} },
            'sid-guides': { rect: { x: 0, y: 300, w: 1200, h: 500 }, styles: {} } // Overlaps by 200px (40%)
          }
        }
      }
    };

    const auditOverlap = auditVerificationMatrix(null, mockRenderOverlap, mockTemplateSections);
    const overlapDefects = auditOverlap.defects.filter(d => d.rule === 'RULE-TOPOLOGY-02' && d.property === 'section_overlap');

    assert(overlapDefects.length >= 1, 'Matrix must emit RULE-TOPOLOGY-02 defect for 40% section overlap');
    assert.strictEqual(overlapDefects[0].severity, 'CRITICAL', 'Overlap defect must be CRITICAL');
    assert(overlapDefects[0].rendered.includes('40%'), 'Defect must record rendered overlap percentage');
    pass(`Matrix caught section overlap collision: ${overlapDefects[0].message}`);

    // Case B: Compliant stacked sections (Section 1: y=0, h=500; Section 2: y=500, h=500 -> 0% overlap)
    const mockRenderCompliant = {
      viewports: {
        desktop: {
          flat: {
            'sid-root': { rect: { x: 0, y: 0, w: 1200, h: 1000 }, styles: {} },
            'sid-devices': { rect: { x: 0, y: 0, w: 1200, h: 500 }, styles: {} },
            'sid-guides': { rect: { x: 0, y: 500, w: 1200, h: 500 }, styles: {} }
          }
        }
      }
    };

    const auditCompliant = auditVerificationMatrix(null, mockRenderCompliant, mockTemplateSections);
    const zeroDefects = auditCompliant.defects.filter(d => d.rule === 'RULE-TOPOLOGY-02');
    assert.strictEqual(zeroDefects.length, 0, 'Compliant stacked sections must produce 0 RULE-TOPOLOGY-02 defects');
    pass('Compliant stacked sections produce 0 RULE-TOPOLOGY-02 defects');
  } catch (err) {
    fail('Section overlap detection test failed', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Compiler SID Uniqueness & Disambiguation
  // ---------------------------------------------------------------------------
  console.log('\n▶ [4/7] Testing Compiler SID Deduplication Invariant...');
  try {
    const mockAst = {
      tagName: 'root',
      children: [
        {
          tagName: 'section',
          attributes: { 'data-sid': 'sid-shared' },
          children: [
            {
              tagName: 'h2',
              attributes: { 'data-sid': 'sid-shared' }, // Duplicate SID from AST input
              children: [{ tagName: '#text', textContent: 'Devices Heading' }]
            }
          ]
        }
      ]
    };

    const mockSnapshot = {
      viewports: {
        desktop: {
          flat: {
            'sid-shared': {
              sid: 'sid-shared',
              tag: 'section',
              rect: { x: 0, y: 0, w: 1200, h: 400 },
              styles: { display: 'flex', flexDirection: 'column' }
            }
          }
        }
      }
    };

    const options = { viewport: 'desktop', atomicRules: [], assignedSids: new Set() };
    const compiled = compileGroundTruthToElementor(mockAst, mockSnapshot, options);

    const sids = [];
    function collectSids(elements) {
      for (const el of elements || []) {
        const s = el._sid || el.settings?._sid;
        if (s) sids.push(s);
        if (el.elements) collectSids(el.elements);
      }
    }
    collectSids(compiled);

    const uniqueSids = new Set(sids);
    assert.strictEqual(sids.length, uniqueSids.size, 'All assigned SIDs must be strictly unique');
    assert(sids.includes('sid-shared'), 'Original SID must be retained for first element');
    assert(sids.some(s => s.startsWith('sid-shared-dup-')), 'Duplicate node must be disambiguated with -dup- suffix');
    pass(`Compiler deduplicated SIDs successfully: [${sids.join(', ')}]`);
  } catch (err) {
    fail('Compiler SID deduplication failed', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Direct Image Fill Scoped Rule Targeting <img> Element
  // ---------------------------------------------------------------------------
  console.log('\n▶ [5/7] Testing Image Fill Scoped Rule Targets <img> Directly...');
  try {
    const mockImgNode = {
      tagName: 'img',
      attributes: { 'data-sid': 'sid-guide-img', src: 'https://example.com/guide.jpg' }
    };

    const mockImgGt = {
      sid: 'sid-guide-img',
      tag: 'img',
      rect: { x: 0, y: 0, w: 380, h: 240 },
      styles: {
        objectFit: 'cover',
        height: '100%',
        minHeight: '240px'
      }
    };

    const mockParent = {
      tagName: 'div',
      attributes: { 'data-sid': 'sid-media' }
    };

    const mockImgSnapshot = {
      viewports: {
        desktop: {
          flat: {
            'sid-guide-img': mockImgGt,
            'sid-media': { sid: 'sid-media', tag: 'div', rect: { x: 0, y: 0, w: 380, h: 240 }, styles: { height: '240px' } }
          }
        }
      }
    };

    const atomicRules = [];
    const imgWidget = mapNodeToElementor(mockImgNode, mockParent, mockImgSnapshot, 'desktop', { atomicRules });

    assert(imgWidget, 'Image widget must be generated');
    assert.strictEqual(imgWidget.settings._hero_cover_fill, true, '_hero_cover_fill must be true');
    assert.strictEqual(imgWidget.settings._img_height, 240, '_img_height must be 240px');

    const { resolveElementSelector } = require('../src/smart/semantic-scoper');
    const targetSel = resolveElementSelector(imgWidget, 'sid-guide-img');
    const fillRule = atomicRules.find(r => r.includes(imgWidget.id) || r.includes(targetSel) || r.includes('min-height: 240px !important;'));
    assert(fillRule, 'Atomic rule for image widget must be emitted');

    // Verify selector targets img directly
    assert(fillRule.includes(`${targetSel} img`) || fillRule.includes(`.elementor-element-${imgWidget.id} img`), 'Scoped rule must directly target img');
    assert(fillRule.includes(`${targetSel} .elementor-widget-container img`) || fillRule.includes(`.elementor-element-${imgWidget.id} .elementor-widget-container img`), 'Scoped rule must target .elementor-widget-container img');
    assert(fillRule.includes('min-height: 240px !important;'), 'Scoped rule must set min-height: 240px !important on img');
    assert(fillRule.includes('height: 100% !important;'), 'Scoped rule must set height: 100% !important on img');
    assert(fillRule.includes('object-fit: cover !important;'), 'Scoped rule must set object-fit: cover !important on img');

    pass('Image fill scoped rule applies min-height and height: 100% !important directly to <img>');
  } catch (err) {
    fail('Image fill scoped rule targeting failed', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 6: Headless Chromium Proof — Guide Image inside Auto-Height Container
  // ---------------------------------------------------------------------------
  console.log('\n▶ [6/7] Headless Chromium Proof: Guide Image in Auto-Height Parent...');
  let browser = null;
  try {
    browser = await createBrowserSession();

    const testTemplate = {
      title: 'Guide Image Test',
      content: [
        {
          id: 'card-media-cont',
          elType: 'container',
          _sid: 'sid-card-media',
          settings: {
            content_width: 'full',
            min_height: { unit: 'px', size: 240 }
            // height is auto / undefined!
          },
          elements: [
            {
              id: 'guide-image-widget',
              elType: 'widget',
              widgetType: 'image',
              _sid: 'sid-guide-img',
              settings: {
                image: { url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="240"></svg>' },
                _hero_cover_fill: true,
                _img_height: 240
              }
            }
          ]
        }
      ]
    };

    const renderedHtml = renderElementorToHtml(testTemplate);
    const { page } = await renderAndCapture(browser, renderedHtml, { width: 1200, height: 800 });

    const imgMetrics = await page.evaluate(() => {
      const img = document.querySelector('.elementor-element-guide-image-widget img');
      if (!img) return null;
      const rect = img.getBoundingClientRect();
      const style = window.getComputedStyle(img);
      return {
        width: rect.width,
        height: rect.height,
        objectFit: style.objectFit,
        minHeight: style.minHeight
      };
    });

    assert(imgMetrics !== null, 'Rendered <img> element must exist in DOM');
    assert(imgMetrics.height >= 240, `Rendered <img> height (${imgMetrics.height}px) must be >= 240px without collapse`);
    assert.strictEqual(imgMetrics.objectFit, 'cover', 'Computed object-fit must be cover');
    assert.strictEqual(imgMetrics.minHeight, '240px', 'Computed min-height must be 240px');

    pass(`Headless Chromium computed img height: ${imgMetrics.height}px (GT min-height: 240px, object-fit: cover)`);
  } catch (err) {
    fail('Headless Chromium image verification failed', err);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  // ---------------------------------------------------------------------------
  // TEST 7: Scalar Contract & Schema Audit
  // ---------------------------------------------------------------------------
  console.log('\n▶ [7/7] Validating Scalar Contract Compliance...');
  try {
    const testTemplate = {
      title: 'Scalar Topology Contract Test',
      content: [
        {
          id: 'sec-root',
          elType: 'container',
          _sid: 'sid-sec-root',
          settings: {
            content_width: 'boxed',
            boxed_width: { unit: 'px', size: 1200 }
          },
          elements: [
            {
              id: 'widget-img',
              elType: 'widget',
              widgetType: 'image',
              _sid: 'sid-widget-img',
              settings: {
                image: { url: 'https://example.com/test.jpg' },
                _hero_cover_fill: true,
                _img_height: 240
              }
            }
          ]
        }
      ]
    };

    const violations = validateTemplate(testTemplate);
    assert.strictEqual(violations.length, 0, `Template must pass scalar contract: ${JSON.stringify(violations)}`);
    pass('Scalar contract audit passed (0 violations, 100% schema compliant)');
  } catch (err) {
    fail('Scalar contract validation failed', err);
  }

  // ---------------------------------------------------------------------------
  // FINAL SUMMARY
  // ---------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log(`Results: ${passedTests}/${totalTests} tests passed.`);
  if (passedTests === totalTests) {
    console.log('✓ [TASK G5 SYNTHETIC SUITE PASSED] Topology & Image Fill verified!');
    process.exit(0);
  } else {
    console.error('❌ [TASK G5 SYNTHETIC SUITE FAILED]');
    process.exit(1);
  }
})();

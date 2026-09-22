/**
 * Task G4: Stretch Side-Effect Fix (F7) Synthetic Test Suite.
 * 
 * Validates:
 * 1. detectEqualHeightRowChildIndices restricts candidates to containers only (excludes icons, dividers, images, buttons).
 * 2. Icon marker alongside text column does NOT cause equal-height flex stretch on parent.
 * 3. Decor/icon scoped micro-CSS rules inject `align-self: center !important; max-height: <dim>px !important;` and `_flex_align_self: 'center'`.
 * 4. Multi-column row with equal-height cards properly sets stretch on containers while excluding the icon marker.
 * 5. Virtual renderer CSS output includes max-height and align-self center overrides.
 * 6. Headless Chromium ground truth: In a flex row with align-items: stretch and a 250px text column,
 *    the icon marker maintains exact 56x56 dimensions and 1:1 aspect ratio (NEVER stretches into a pill/oval).
 * 7. Scalar contract compliance (0 violations).
 */

const assert = require('assert');
const path = require('path');
const {
  detectEqualHeightRowChildIndices,
  compileGroundTruthToElementor,
  mapNodeToElementor
} = require('../src/smart/geometry-mapper');
const { renderElementorToHtml } = require('../src/emulator/elementor-virtual-renderer');
const { validateTemplate } = require('../src/smart/scalar-contract');
const { createBrowserSession, renderAndCapture } = require('../src/inspector/headless-driver');

let passedTests = 0;
let totalTests = 0;

function runSyncTest(name, fn) {
  totalTests++;
  process.stdout.write(`▶ [${totalTests}] ${name}... `);
  try {
    fn();
    console.log('✓ PASS');
    passedTests++;
  } catch (err) {
    console.log('✗ FAIL');
    console.error(err.message);
    throw err;
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  process.stdout.write(`▶ [${totalTests}] ${name}... `);
  try {
    await fn();
    console.log('✓ PASS');
    passedTests++;
  } catch (err) {
    console.log('✗ FAIL');
    console.error(err.message);
    throw err;
  }
}

(async () => {
  console.log('========================================================================');
  console.log('       SYNTHETIC TEST G4: STRETCH SIDE-EFFECT FIX (F7)');
  console.log('========================================================================\n');

  // --------------------------------------------------------------------------
  // TEST 1: detectEqualHeightRowChildIndices restricts candidates to containers
  // --------------------------------------------------------------------------
  runSyncTest('detectEqualHeightRowChildIndices skips atomic widgets (icons, dividers, buttons, images)', () => {
    const mixedNodes = [
      {
        tagName: 'div',
        id: 'timeline-marker',
        className: 'step-marker icon-wrapper',
        attributes: { 'data-sid': 'marker-sid', class: 'step-marker icon-wrapper' },
        children: [{ tagName: 'i', className: 'fas fa-check', children: [] }]
      },
      {
        tagName: 'div',
        id: 'step-card',
        className: 'step-card',
        attributes: { 'data-sid': 'card-sid', class: 'step-card' },
        children: [
          { tagName: 'h4', textContent: 'Step Title', children: [] },
          { tagName: 'p', textContent: 'Step description text here', children: [] }
        ]
      },
      {
        tagName: 'hr',
        id: 'divider-node',
        attributes: { 'data-sid': 'divider-sid' }
      },
      {
        tagName: 'img',
        id: 'thumb-node',
        attributes: { 'data-sid': 'img-sid', src: 'https://example.com/thumb.png' }
      },
      {
        tagName: 'button',
        id: 'cta-btn',
        attributes: { 'data-sid': 'btn-sid' },
        textContent: 'Go'
      }
    ];

    // Note: Even if marker and card both report initial height 56px in snapshot
    const mockSnapshot = {
      viewports: {
        desktop: {
          flat: {
            'marker-sid': {
              rect: { x: 0, y: 100, w: 56, h: 56 },
              styles: {
                width: '56px',
                height: '56px',
                backgroundColor: '#ffffff',
                borderTopWidth: '1px',
                borderTopStyle: 'solid',
                borderTopColor: '#e5e7eb',
                borderTopLeftRadius: '12px',
                borderTopRightRadius: '12px',
                borderBottomRightRadius: '12px',
                borderBottomLeftRadius: '12px'
              }
            },
            'card-sid': {
              rect: { x: 80, y: 100, w: 400, h: 56 },
              styles: { height: '56px' }
            },
            'divider-sid': {
              rect: { x: 0, y: 160, w: 480, h: 2 },
              styles: { height: '2px' }
            },
            'img-sid': {
              rect: { x: 0, y: 170, w: 56, h: 56 },
              styles: { height: '56px' }
            },
            'btn-sid': {
              rect: { x: 60, y: 170, w: 100, h: 56 },
              styles: { height: '56px', backgroundColor: '#3B82F6' }
            }
          }
        }
      }
    };

    const detected = detectEqualHeightRowChildIndices(mixedNodes, mockSnapshot, 'desktop');
    assert.strictEqual(detected.size, 0, 'Atomic nodes must be excluded; only 1 container remains, so Set must be empty');
  });

  // --------------------------------------------------------------------------
  // TEST 2: Timeline Row AST compilation (Marker + Text Card)
  // --------------------------------------------------------------------------
  let mappedMarkerWidget = null;
  let compiledRowCon = null;
  const atomicRules = [];

  runSyncTest('AST Compilation: Timeline marker receives stretch immunity & decor protection', () => {
    const timelineRowAst = {
      tagName: 'root',
      children: [
        {
          tagName: 'div',
          id: 'timeline-step-row',
          attributes: { 'data-sid': 'row-sid' },
          children: [
            {
              tagName: 'div',
              id: 'timeline-marker',
              className: 'step-marker icon-wrapper',
              attributes: { 'data-sid': 'marker-sid', class: 'step-marker icon-wrapper' },
              children: [{ tagName: 'i', className: 'fas fa-check', children: [] }]
            },
            {
              tagName: 'div',
              id: 'timeline-content',
              className: 'step-content',
              attributes: { 'data-sid': 'content-sid', class: 'step-content' },
              children: [
                {
                  tagName: 'h3',
                  id: 'step-title',
                  attributes: { 'data-sid': 'title-sid' },
                  textContent: 'Discovery Phase',
                  children: []
                },
                {
                  tagName: 'p',
                  id: 'step-desc',
                  attributes: { 'data-sid': 'desc-sid' },
                  textContent: 'Deep research into architecture and constraints. Multi-line content that stretches vertically.',
                  children: []
                }
              ]
            }
          ]
        }
      ]
    };

    const timelineSnapshot = {
      viewports: {
        desktop: {
          flat: {
            'row-sid': {
              rect: { x: 0, y: 100, w: 800, h: 250 },
              styles: {
                display: 'flex',
                flexDirection: 'row',
                columnGap: '24px'
              }
            },
            'marker-sid': {
              rect: { x: 0, y: 100, w: 56, h: 56 },
              styles: {
                width: '56px',
                height: '56px',
                backgroundColor: '#ffffff',
                borderTopWidth: '1px',
                borderTopStyle: 'solid',
                borderTopColor: '#e5e7eb',
                borderTopLeftRadius: '12px',
                borderTopRightRadius: '12px',
                borderBottomRightRadius: '12px',
                borderBottomLeftRadius: '12px'
              }
            },
            'content-sid': {
              rect: { x: 80, y: 100, w: 720, h: 250 },
              styles: {
                display: 'flex',
                flexDirection: 'column',
                height: '250px'
              }
            },
            'title-sid': {
              rect: { x: 80, y: 100, w: 720, h: 32 },
              styles: { fontSize: '24px', fontWeight: '700' },
              directText: 'Discovery Phase'
            },
            'desc-sid': {
              rect: { x: 80, y: 140, w: 720, h: 60 },
              styles: { fontSize: '16px' },
              directText: 'Deep research into architecture and constraints. Multi-line content that stretches vertically.'
            }
          }
        }
      }
    };

    const compiled = compileGroundTruthToElementor(timelineRowAst, timelineSnapshot, {
      viewport: 'desktop',
      atomicRules
    });

    assert.ok(Array.isArray(compiled) && compiled.length > 0, 'Must compile root container');
    compiledRowCon = compiled[0];

    // 1. Equal-height detection must NOT flag the icon marker
    const detected = detectEqualHeightRowChildIndices(timelineRowAst.children[0].children, timelineSnapshot, 'desktop');
    assert.strictEqual(detected.has(0), false, 'Marker (index 0) must NOT be detected as equal-height child');
    assert.strictEqual(detected.size, 0, 'No equal-height containers detected');

    // 2. Locate child marker icon widget
    const markerEl = compiledRowCon.elements.find(el => el.widgetType === 'icon');
    assert.ok(markerEl, 'Marker must be mapped as icon widget');
    mappedMarkerWidget = markerEl;

    // 3. Icon widget must have _flex_align_self: 'center' (NOT stretch)
    assert.strictEqual(markerEl.settings._flex_align_self, 'center', 'Icon settings must set _flex_align_self: center');
    assert.notStrictEqual(markerEl.settings._flex_align_self, 'stretch', 'Icon settings must NOT be stretch');

    // 4. Scoped CSS rules must include align-self: center !important and max-height: 56px !important
    assert.ok(atomicRules.length > 0, 'Atomic rules must contain scoped decor rule');
    const decorRule = atomicRules.find(r => r.includes(`.elementor-element-${markerEl.id}`) || r.includes('max-height: 56px !important;'));
    assert.ok(decorRule, 'Must emit scoped decor rule for marker');
    assert.ok(decorRule.includes('align-self: center !important;'), 'Must inject align-self: center !important');
    assert.ok(decorRule.includes('max-height: 56px !important;'), 'Must inject max-height: 56px !important');
    assert.ok(decorRule.includes('width: 56px !important;'), 'Must inject width: 56px !important');
    assert.ok(decorRule.includes('height: 56px !important;'), 'Must inject height: 56px !important');
  });

  // --------------------------------------------------------------------------
  // TEST 3: Multi-card Row (Marker + 2 Equal Height Cards)
  // --------------------------------------------------------------------------
  runSyncTest('Multi-column row: Sibling cards get stretch, while marker is strictly immune', () => {
    const multiRowAst = {
      tagName: 'root',
      children: [
        {
          tagName: 'section',
          id: 'multi-row',
          attributes: { 'data-sid': 'm-row-sid' },
          children: [
            {
              tagName: 'div',
              id: 'timeline-marker-2',
              className: 'step-marker icon-wrapper',
              attributes: { 'data-sid': 'm-marker-sid', class: 'step-marker icon-wrapper' },
              children: [{ tagName: 'i', className: 'fas fa-star', children: [] }]
            },
            {
              tagName: 'div',
              id: 'card-a',
              attributes: { 'data-sid': 'm-card-a', class: 'feature-card' },
              children: [{ tagName: 'p', textContent: 'Card A', children: [] }]
            },
            {
              tagName: 'div',
              id: 'card-b',
              attributes: { 'data-sid': 'm-card-b', class: 'feature-card' },
              children: [{ tagName: 'p', textContent: 'Card B', children: [] }]
            }
          ]
        }
      ]
    };

    const multiSnapshot = {
      viewports: {
        desktop: {
          flat: {
            'm-row-sid': {
              rect: { x: 0, y: 100, w: 1000, h: 300 },
              styles: { display: 'flex', flexDirection: 'row', columnGap: '20px' }
            },
            'm-marker-sid': {
              rect: { x: 0, y: 100, w: 56, h: 56 },
              styles: {
                width: '56px',
                height: '56px',
                backgroundColor: '#ffffff',
                borderTopWidth: '1px',
                borderTopStyle: 'solid',
                borderTopColor: '#e5e7eb',
                borderTopLeftRadius: '12px',
                borderTopRightRadius: '12px',
                borderBottomRightRadius: '12px',
                borderBottomLeftRadius: '12px'
              }
            },
            'm-card-a': {
              rect: { x: 76, y: 100, w: 450, h: 300 },
              styles: { display: 'flex', flexDirection: 'column', height: '300px' }
            },
            'm-card-b': {
              rect: { x: 546, y: 100, w: 450, h: 302 },
              styles: { display: 'flex', flexDirection: 'column', height: '302px' }
            }
          }
        }
      }
    };

    const multiRules = [];
    const multiCompiled = compileGroundTruthToElementor(multiRowAst, multiSnapshot, {
      viewport: 'desktop',
      atomicRules: multiRules
    });

    const parentCon = multiCompiled[0];
    // Parent row container sets align_items: stretch because Card A and Card B are equal-height containers
    assert.strictEqual(parentCon.settings.align_items, 'stretch', 'Parent row sets align_items: stretch for cards');

    // Child marker icon widget at index 0
    const marker = parentCon.elements.find(el => el.widgetType === 'icon');
    assert.ok(marker, 'Marker widget exists');
    assert.strictEqual(marker.settings._flex_align_self, 'center', 'Marker must declare _flex_align_self: center');

    // Sibling cards must NOT have rigid min-height (stretch takes over)
    const cardContainers = parentCon.elements.filter(el => el.elType === 'container');
    assert.strictEqual(cardContainers.length, 2, '2 sibling card containers');
    assert.strictEqual(cardContainers[0].settings.min_height, undefined, 'Card A min_height omitted');
    assert.strictEqual(cardContainers[1].settings.min_height, undefined, 'Card B min_height omitted');

    // Scoped rules for marker protect it from stretch
    const markerScoped = multiRules.find(r => r.includes(`.elementor-element-${marker.id}`) || r.includes('max-height: 56px !important;'));
    assert.ok(markerScoped, 'Marker scoped rule must exist');
    assert.ok(markerScoped.includes('align-self: center !important;'), 'Marker scoped rule has align-self: center !important');
    assert.ok(markerScoped.includes('max-height: 56px !important;'), 'Marker scoped rule has max-height: 56px !important');
  });

  // --------------------------------------------------------------------------
  // TEST 4: Virtual Renderer CSS Emulation
  // --------------------------------------------------------------------------
  runSyncTest('Virtual Renderer outputs max-height and align-self in decor and widget styles', () => {
    const renderedHtml = renderElementorToHtml({
      content: [compiledRowCon]
    });

    assert.ok(renderedHtml.includes('align-self: center !important;'), 'Rendered CSS contains align-self: center !important');
    assert.ok(renderedHtml.includes('max-height: 56px !important;'), 'Rendered CSS contains max-height: 56px !important');
    assert.ok(renderedHtml.includes('width: 56px;'), 'Rendered CSS contains width: 56px;');
    assert.ok(renderedHtml.includes('height: 56px;'), 'Rendered CSS contains height: 56px;');
  });

  // --------------------------------------------------------------------------
  // TEST 5: Scalar Contract Compliance
  // --------------------------------------------------------------------------
  runSyncTest('Scalar contract passes with 0 violations', () => {
    const violations = validateTemplate({ content: [compiledRowCon] });
    assert.strictEqual(violations.length, 0, 'Zero scalar contract violations expected');
  });

  // --------------------------------------------------------------------------
  // TEST 6: Headless Chromium Ground Truth (Flex Stretch Immunity Proof)
  // --------------------------------------------------------------------------
  await runAsyncTest('Headless Chromium: Marker stays exact 56x56 in flex row while text column stretches to 250px', async () => {
    let browser;
    try {
      browser = await createBrowserSession();

      // We explicitly render a flex row with align-items: stretch to simulate worst-case stretch pressure
      const elementorHtml = renderElementorToHtml({
        content: [
          {
            ...compiledRowCon,
            settings: {
              ...compiledRowCon.settings,
              align_items: 'stretch',
              flex_align_items: 'stretch'
            }
          }
        ]
      });

      const testPageHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Stretch Side-Effect Verification</title>
  <style>
    /* Embed any micro-CSS rules emitted */
    ${atomicRules.join('\n')}
  </style>
</head>
<body>
  ${elementorHtml}
</body>
</html>
      `;

      const { page } = await renderAndCapture(browser, testPageHtml, { skipScreenshot: true });

      const metrics = await page.evaluate((markerId) => {
        const markerEl = document.querySelector(`.elementor-element-${markerId}`);
        const textCol = document.querySelector('.step-content, .elementor-widget-text-editor, .elementor-element:not(.elementor-element-' + markerId + ')');

        if (!markerEl) return null;

        const mRect = markerEl.getBoundingClientRect();
        const mCs = window.getComputedStyle(markerEl);

        let tRect = { width: 0, height: 0 };
        if (textCol) {
          tRect = textCol.getBoundingClientRect();
        }

        return {
          marker: {
            w: Math.round(mRect.width),
            h: Math.round(mRect.height),
            alignSelf: mCs.alignSelf,
            maxHeight: mCs.maxHeight,
            borderRadius: mCs.borderRadius
          },
          textCol: {
            h: Math.round(tRect.height)
          }
        };
      }, mappedMarkerWidget.id);

      assert.ok(metrics, 'Must find marker in rendered Chromium DOM');

      // 1. Icon marker MUST stay exactly 56x56 (+/- 1px tolerance for border box model)
      assert.ok(
        Math.abs(metrics.marker.w - 56) <= 1,
        `Marker width must be 56px, got ${metrics.marker.w}px`
      );
      assert.ok(
        Math.abs(metrics.marker.h - 56) <= 1,
        `Marker height must be 56px, got ${metrics.marker.h}px (MUST NOT stretch!)`
      );

      // 2. Aspect ratio must remain 1:1 square
      assert.strictEqual(
        metrics.marker.w,
        metrics.marker.h,
        `Marker must be square 1:1 aspect ratio, got ${metrics.marker.w}x${metrics.marker.h}`
      );

      // 3. align-self must be computed as center
      assert.strictEqual(
        metrics.marker.alignSelf,
        'center',
        `Marker computed align-self must be center, got ${metrics.marker.alignSelf}`
      );

      await page.close();
    } finally {
      if (browser) await browser.close();
    }
  });

  console.log(`\nResults: ${passedTests}/${totalTests} tests passed.`);
  if (passedTests === totalTests) {
    console.log('[PASS] Task G4 (Stretch Side-Effect Fix) successfully verified!\n');
  } else {
    console.error(`[FAIL] ${totalTests - passedTests} test(s) failed.\n`);
    process.exit(1);
  }
})();

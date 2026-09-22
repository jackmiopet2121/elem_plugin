/**
 * SYNTHETIC TEST M4: WIDGET SETTINGS PARITY — PILL RADIUS + GAPS
 * 
 * Verifies:
 * 1. Pill Radius: Button widgets map GT per-corner border-radius verbatim into button settings
 *    (px normalized, isLinked: false). 9999px pills survive without [object Object] corruption.
 * 2. Virtual Renderer CSS: Emits valid border-radius on .elementor-button for desktop and responsive viewports.
 * 3. Responsive Container Gaps: Containers with responsive gap overrides (e.g. desktop 80px, tablet 48px, mobile 48px)
 *    emit direct gap/row-gap/column-gap rules inside media queries so desktop gap is properly overridden.
 * 4. Button Gaps: Button widgets with inline-flex gap (e.g. 8px) map gap/flex_gap into settings and render on .elementor-button.
 * 5. Zero-Gap R1 Healing: R1 mutations handle 0px gap cleanly without skipping or corrupting size/linked state.
 * 6. Verification Matrix: Reports 0 RULE-BOX-01 (gap) and 0 RULE-BOX-02 (border radius) defects.
 */
const assert = require('assert');
const path = require('path');
const { compileGroundTruthToElementor } = require('../src/smart/geometry-mapper');
const { renderElementorToHtml } = require('../src/emulator/elementor-virtual-renderer');
const { auditVerificationMatrix } = require('../src/smart/verification-matrix');
const { createButtonWidget } = require('../src/transformers/widget-transformer');
const { applyR1Mutation, mergeBoxModelSide } = require('../src/smart/fallback-ladder');
const { mergeResponsiveSettings } = require('../src/smart/responsive-merger');
const { createBrowserSession } = require('../src/inspector/headless-driver');

console.log('========================================================================');
console.log('  SYNTHETIC TEST M4: WIDGET SETTINGS PARITY (PILL RADIUS + GAPS)');
console.log('========================================================================\n');

(async () => {
  try {
    // -------------------------------------------------------------------
    // 1. Pill Radius: Button Widget Transformer & Geometry Mapper
    // -------------------------------------------------------------------
    console.log('▶ [1/5] Testing Pill Radius Button Mapping (isLinked: false, 9999px survival)...');

    // Case A: Direct createButtonWidget with 4-side object
    const pillBtn = createButtonWidget({
      _sid: 'sid-btn-pill',
      text: 'Pill Button',
      border_radius: {
        unit: 'px',
        top: '9999',
        right: '9999',
        bottom: '9999',
        left: '9999',
        isLinked: false
      }
    });

    assert.strictEqual(typeof pillBtn.settings.border_radius, 'object', 'border_radius must be an object');
    assert.strictEqual(pillBtn.settings.border_radius.top, '9999', 'top radius must be 9999');
    assert.strictEqual(pillBtn.settings.border_radius.right, '9999', 'right radius must be 9999');
    assert.strictEqual(pillBtn.settings.border_radius.bottom, '9999', 'bottom radius must be 9999');
    assert.strictEqual(pillBtn.settings.border_radius.left, '9999', 'left radius must be 9999');
    assert.strictEqual(pillBtn.settings.border_radius.isLinked, false, 'border_radius isLinked must be false');

    // Case B: Virtual renderer CSS check
    const renderedPillHtml = renderElementorToHtml({
      content: [pillBtn]
    });

    assert(
      !renderedPillHtml.includes('[object Object]'),
      'CRITICAL: Virtual renderer emitted [object Object] in CSS!'
    );
    assert(
      renderedPillHtml.includes('border-radius: 9999px 9999px 9999px 9999px;'),
      `Expected 'border-radius: 9999px 9999px 9999px 9999px;' in rendered CSS, found:\n${renderedPillHtml}`
    );
    console.log('  ✔ Pill radius survived in button settings with isLinked:false and valid CSS emitted.');

    // -------------------------------------------------------------------
    // 2. Button Gap Mapping & Virtual Renderer
    // -------------------------------------------------------------------
    console.log('▶ [2/5] Testing Button Gap Mapping & Virtual Renderer...');

    const gapBtn = createButtonWidget({
      _sid: 'sid-btn-gap',
      text: 'Read Article →',
      gap: { unit: 'px', size: 8, column: 8, row: 8, isLinked: true },
      flex_gap: { unit: 'px', size: 8, column: 8, row: 8, isLinked: true }
    });

    const renderedGapHtml = renderElementorToHtml({
      content: [gapBtn]
    });

    assert(
      renderedGapHtml.includes('gap: 8px 8px;') || renderedGapHtml.includes('column-gap: 8px;'),
      `Expected button gap rules in rendered CSS, found:\n${renderedGapHtml}`
    );
    console.log('  ✔ Button gap rendered on .elementor-button successfully.');

    // -------------------------------------------------------------------
    // 3. Responsive Container Gap Overrides (Desktop 80px -> Tablet 48px -> Mobile 48px)
    // -------------------------------------------------------------------
    console.log('▶ [3/5] Testing Responsive Container Gap Overrides (Direct Media Query CSS)...');

    const mockContainer = {
      id: 'mock-grid-c1',
      elType: 'container',
      _sid: 'sid-grid-container',
      settings: {
        _sid: 'sid-grid-container',
        direction: 'row',
        flex_direction: 'row',
        gap: { unit: 'px', size: 80, column: 80, row: 80, isLinked: true },
        flex_gap: { unit: 'px', size: 80, column: 80, row: 80, isLinked: true },
        gap_tablet: { unit: 'px', size: 48, column: 48, row: 48, isLinked: true },
        flex_gap_tablet: { unit: 'px', size: 48, column: 48, row: 48, isLinked: true },
        gap_mobile: { unit: 'px', size: 48, column: 48, row: 48, isLinked: true },
        flex_gap_mobile: { unit: 'px', size: 48, column: 48, row: 48, isLinked: true }
      },
      elements: []
    };

    const renderedContainerHtml = renderElementorToHtml({
      content: [mockContainer]
    });

    // Check tablet media query contains direct gap: 48px 48px
    assert(
      renderedContainerHtml.includes('@media (max-width: 1024px)'),
      'Missing tablet media query'
    );
    const tabletSection = renderedContainerHtml.split('@media (max-width: 1024px)')[1].split('}')[0] || '';
    assert(
      tabletSection.includes('gap: 48px 48px;') || tabletSection.includes('column-gap: 48px;'),
      `Tablet media query must contain direct gap rule to override desktop gap! Got:\n${tabletSection}`
    );

    // Check mobile media query contains direct gap: 48px 48px
    assert(
      renderedContainerHtml.includes('@media (max-width: 767px)'),
      'Missing mobile media query'
    );
    const mobileSection = renderedContainerHtml.split('@media (max-width: 767px)')[1].split('}')[0] || '';
    assert(
      mobileSection.includes('gap: 48px 48px;') || mobileSection.includes('column-gap: 48px;'),
      `Mobile media query must contain direct gap rule to override desktop gap! Got:\n${mobileSection}`
    );
    console.log('  ✔ Tablet & Mobile media queries emit direct gap: 48px overriding desktop gap: 80px.');

    // -------------------------------------------------------------------
    // 4. R1 Healing for Zero-Gap & Pill Radius
    // -------------------------------------------------------------------
    console.log('▶ [4/5] Testing R1 Mutation Healing for Zero-Gap and Pill Radius...');

    // Zero-gap healing on container
    const testContainerNode = {
      elType: 'container',
      settings: {
        gap: { unit: 'px', size: 20, column: 20, row: 20, isLinked: true }
      }
    };
    const zeroGapDefect = {
      property: 'columnGap',
      viewport: 'desktop',
      original: '0px'
    };
    const healedZeroGap = applyR1Mutation(testContainerNode, zeroGapDefect);
    assert.strictEqual(healedZeroGap, true, 'R1 mutation must succeed for zero-gap defect');
    assert.strictEqual(testContainerNode.settings.gap.column, 0, 'column gap must heal to 0');
    assert.strictEqual(testContainerNode.settings.gap.size, 0, 'gap size must heal to 0');
    assert.strictEqual(testContainerNode.settings.space_between_widgets, 0, 'space_between_widgets must heal to 0');

    // Pill radius healing across responsive viewport
    const testBtnNode = {
      widgetType: 'button',
      settings: {
        border_radius: { unit: 'px', top: '9999', right: '9999', bottom: '9999', left: '9999', isLinked: false }
      }
    };
    const radiusDefect = {
      property: 'borderTopLeftRadius',
      viewport: 'tablet',
      original: '9999px'
    };
    const healedRadius = applyR1Mutation(testBtnNode, radiusDefect);
    assert.strictEqual(healedRadius, true, 'R1 mutation must succeed for border radius defect');
    assert.strictEqual(testBtnNode.settings.border_radius_tablet.top, '9999', 'tablet top radius must be 9999');
    assert.strictEqual(testBtnNode.settings.border_radius_tablet.right, '9999', 'tablet right radius must inherit 9999');
    assert.strictEqual(testBtnNode.settings.border_radius_tablet.bottom, '9999', 'tablet bottom radius must inherit 9999');
    assert.strictEqual(testBtnNode.settings.border_radius_tablet.left, '9999', 'tablet left radius must inherit 9999');
    assert.strictEqual(testBtnNode.settings.border_radius_tablet.isLinked, false, 'tablet border radius must be isLinked: false');
    console.log('  ✔ R1 healing correctly handles 0px gaps and responsive 9999px pill inheritance.');

    // -------------------------------------------------------------------
    // 5. Full Pipeline & Verification Matrix Proof (End-to-End Headless Chromium)
    // -------------------------------------------------------------------
    console.log('▶ [5/5] Testing End-to-End Pipeline & Headless Chromium Verification...');

    const mockDomAst = {
      tagName: 'div',
      className: 'main-wrapper',
      attributes: { 'data-sid': 'sid-root' },
      children: [
        {
          tagName: 'div',
          className: 'container hero-grid',
          attributes: { 'data-sid': 'sid-grid' },
          children: [
            {
              tagName: 'button',
              className: 'btn btn-primary',
              textContent: 'Primary CTA',
              attributes: { 'data-sid': 'sid-pill-btn' },
              children: []
            },
            {
              tagName: 'a',
              className: 'read-more',
              textContent: 'Read Article →',
              attributes: { 'data-sid': 'sid-read-more' },
              children: []
            }
          ]
        }
      ]
    };

    const mockSnapshot = {
      viewports: {
        desktop: {
          width: 1440,
          flat: {
            'sid-root': {
              sid: 'sid-root', tag: 'div',
              rect: { x: 0, y: 0, w: 1440, h: 600 },
              styles: { display: 'block', backgroundColor: 'transparent' }
            },
            'sid-grid': {
              sid: 'sid-grid', tag: 'div', parentSid: 'sid-root',
              rect: { x: 120, y: 0, w: 1200, h: 400 },
              styles: {
                display: 'flex', flexDirection: 'row',
                gap: '80px', rowGap: '80px', columnGap: '80px',
                backgroundColor: 'transparent'
              }
            },
            'sid-pill-btn': {
              sid: 'sid-pill-btn', tag: 'button', parentSid: 'sid-grid',
              rect: { x: 120, y: 50, w: 180, h: 50 },
              directText: 'Primary CTA',
              styles: {
                display: 'inline-flex',
                borderTopLeftRadius: '9999px',
                borderTopRightRadius: '9999px',
                borderBottomRightRadius: '9999px',
                borderBottomLeftRadius: '9999px',
                backgroundColor: '#000000',
                color: '#ffffff',
                paddingTop: '16px', paddingRight: '32px', paddingBottom: '16px', paddingLeft: '32px'
              }
            },
            'sid-read-more': {
              sid: 'sid-read-more', tag: 'a', parentSid: 'sid-grid',
              rect: { x: 380, y: 50, w: 160, h: 50 },
              directText: 'Read Article →',
              styles: {
                display: 'inline-flex',
                gap: '8px', rowGap: '8px', columnGap: '8px',
                backgroundColor: 'transparent',
                color: '#111827'
              }
            }
          }
        },
        tablet: {
          width: 768,
          flat: {
            'sid-root': {
              sid: 'sid-root', tag: 'div',
              rect: { x: 0, y: 0, w: 768, h: 700 },
              styles: { display: 'block', backgroundColor: 'transparent' }
            },
            'sid-grid': {
              sid: 'sid-grid', tag: 'div', parentSid: 'sid-root',
              rect: { x: 24, y: 0, w: 720, h: 500 },
              styles: {
                display: 'flex', flexDirection: 'column',
                gap: '48px', rowGap: '48px', columnGap: '48px',
                backgroundColor: 'transparent'
              }
            },
            'sid-pill-btn': {
              sid: 'sid-pill-btn', tag: 'button', parentSid: 'sid-grid',
              rect: { x: 24, y: 50, w: 180, h: 50 },
              directText: 'Primary CTA',
              styles: {
                display: 'inline-flex',
                borderTopLeftRadius: '9999px',
                borderTopRightRadius: '9999px',
                borderBottomRightRadius: '9999px',
                borderBottomLeftRadius: '9999px',
                backgroundColor: '#000000',
                color: '#ffffff'
              }
            },
            'sid-read-more': {
              sid: 'sid-read-more', tag: 'a', parentSid: 'sid-grid',
              rect: { x: 24, y: 150, w: 160, h: 50 },
              directText: 'Read Article →',
              styles: {
                display: 'inline-flex',
                gap: '8px', rowGap: '8px', columnGap: '8px',
                backgroundColor: 'transparent',
                color: '#111827'
              }
            }
          }
        },
        mobile: {
          width: 375,
          flat: {
            'sid-root': {
              sid: 'sid-root', tag: 'div',
              rect: { x: 0, y: 0, w: 375, h: 800 },
              styles: { display: 'block', backgroundColor: 'transparent' }
            },
            'sid-grid': {
              sid: 'sid-grid', tag: 'div', parentSid: 'sid-root',
              rect: { x: 16, y: 0, w: 343, h: 600 },
              styles: {
                display: 'flex', flexDirection: 'column',
                gap: '48px', rowGap: '48px', columnGap: '48px',
                backgroundColor: 'transparent'
              }
            },
            'sid-pill-btn': {
              sid: 'sid-pill-btn', tag: 'button', parentSid: 'sid-grid',
              rect: { x: 16, y: 50, w: 343, h: 50 },
              directText: 'Primary CTA',
              styles: {
                display: 'inline-flex',
                borderTopLeftRadius: '9999px',
                borderTopRightRadius: '9999px',
                borderBottomRightRadius: '9999px',
                borderBottomLeftRadius: '9999px',
                backgroundColor: '#000000',
                color: '#ffffff'
              }
            },
            'sid-read-more': {
              sid: 'sid-read-more', tag: 'a', parentSid: 'sid-grid',
              rect: { x: 16, y: 150, w: 343, h: 50 },
              directText: 'Read Article →',
              styles: {
                display: 'inline-flex',
                gap: '8px', rowGap: '8px', columnGap: '8px',
                backgroundColor: 'transparent',
                color: '#111827'
              }
            }
          }
        }
      }
    };

    const template = compileGroundTruthToElementor(mockDomAst, mockSnapshot);
    mergeResponsiveSettings(template, mockSnapshot);

    // Launch headless Chromium session
    const browser = await createBrowserSession();
    let auditReport;
    let auditResult;
    try {
      auditResult = await auditVerificationMatrix(template, mockSnapshot, browser);
    } finally {
      await browser.close();
    }

    console.log(`  Fidelity: ${auditResult.healthScore}%`);
    console.log(`  Defects Count: ${auditResult.defects.length}`);

    // Check specific rules for target nodes
    const pillRadiusDefects = auditResult.defects.filter(
      d => d.nodeSid === 'sid-pill-btn' && d.rule === 'RULE-BOX-02'
    );
    const gridGapDefects = auditResult.defects.filter(
      d => d.nodeSid === 'sid-grid' && d.rule === 'RULE-BOX-01'
    );
    const readMoreGapDefects = auditResult.defects.filter(
      d => d.nodeSid === 'sid-read-more' && d.rule === 'RULE-BOX-01'
    );

    assert.strictEqual(
      pillRadiusDefects.length,
      0,
      `Expected 0 RULE-BOX-02 defects on sid-pill-btn, got: ${JSON.stringify(pillRadiusDefects)}`
    );
    assert.strictEqual(
      gridGapDefects.length,
      0,
      `Expected 0 RULE-BOX-01 defects on sid-grid, got: ${JSON.stringify(gridGapDefects)}`
    );
    assert.strictEqual(
      readMoreGapDefects.length,
      0,
      `Expected 0 RULE-BOX-01 defects on sid-read-more, got: ${JSON.stringify(readMoreGapDefects)}`
    );

    console.log('  ✔ Headless Chromium audit verified: 0 RULE-BOX-01 and 0 RULE-BOX-02 defects on target nodes.');

    console.log('\n========================================================================');
    console.log('  ✔ ALL TASK M4 ASSERTIONS PASSED DEFINITIVELY (5/5)');
    console.log('========================================================================\n');
  } catch (err) {
    console.error('\n❌ SYNTHETIC TEST M4 FAILED:');
    console.error(err);
    process.exit(1);
  }
})();

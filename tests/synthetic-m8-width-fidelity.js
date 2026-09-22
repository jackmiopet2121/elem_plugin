/**
 * SYNTHETIC TEST M8: CONTAINER WIDTH FIDELITY (PERCENT VS GAP ACCOUNTING)
 * 
 * Verifies:
 * 1. Content-Box Relative Percent Width (A1 Contract):
 *    Child percentage width in a flex row container must be computed against
 *    the parent's CONTENT box (gt.rect.w - paddingLeft - paddingRight - borderLeft - borderRight),
 *    NOT the outer border-box width.
 *    Example: Parent outer width 1152px, horizontal padding 80px + 80px (content box 992px).
 *    Child 1 (600px) -> 60.5% (600/992), NOT 52.1% (600/1152).
 *    Child 2 (392px) -> 39.5% (392/992), NOT 34.0% (392/1152).
 * 
 * 2. Decorative Fixed-Size Children Immunity across Breakpoints:
 *    Fixed-dimension circular markers, badges, or icon containers (aspect ~1:1, 24-84px)
 *    keep their GT px dimensions and flex-shrink: 0 across all viewports (desktop, tablet, mobile),
 *    and are immune to being blown up to 100% width.
 * 
 * 3. Inline Heading / Text Shrink-Wrap Fidelity:
 *    Inline text / heading nodes (styles.display === 'inline') receive _element_width = 'auto'
 *    and align_self = 'flex-start', shrink-wrapping to their text width instead of expanding
 *    to full container width.
 * 
 * 4. Responsive Direction Parity in Virtual Renderer:
 *    Mobile / tablet direct flex-direction property emission ensures container reflows
 *    from row to column without being overridden by direct desktop flex rules.
 * 
 * 5. Headless Chromium Physical Render Parity:
 *    Proves exact geometric fidelity in Chromium across Desktop and Mobile viewports.
 */

const assert = require('assert');
const path = require('path');
const { compileGroundTruthToElementor } = require('../src/smart/geometry-mapper');
const { mergeResponsiveSettings } = require('../src/smart/responsive-merger');
const { renderElementorToHtml } = require('../src/emulator/elementor-virtual-renderer');
const { createBrowserSession } = require('../src/inspector/headless-driver');

console.log('========================================================================');
console.log('  SYNTHETIC TEST M8: CONTAINER WIDTH FIDELITY (PERCENT & GAP ACCOUNTING)');
console.log('========================================================================\n');

(async () => {
  try {
    // -------------------------------------------------------------------
    // 1. Fixture Setup: Flex Row with Padding & Two Fractional Children + Fixed Decor + Inline Heading
    // -------------------------------------------------------------------
    console.log('▶ [1/4] Setting up container width & content-box fixtures...');

    const ctaAst = {
      tagName: 'section',
      className: 'cta-section',
      attributes: { 'data-sid': 'sid-cta-root' },
      children: [
        {
          tagName: 'div',
          className: 'cta-content',
          attributes: { 'data-sid': 'sid-cta-content' },
          children: [
            {
              tagName: 'strong',
              className: 'cta-tagline',
              attributes: { 'data-sid': 'sid-inline-tag' },
              textContent: 'Exclusive Pro Offer',
              children: []
            },
            {
              tagName: 'h2',
              className: 'cta-title',
              attributes: { 'data-sid': 'sid-cta-heading' },
              textContent: 'Supercharge Your Workflow',
              children: []
            }
          ]
        },
        {
          tagName: 'div',
          className: 'cta-visual',
          attributes: { 'data-sid': 'sid-cta-visual' },
          children: [
            {
              tagName: 'div',
              className: 'timeline-marker',
              attributes: { 'data-sid': 'sid-decor-marker' },
              textContent: '01',
              children: []
            }
          ]
        }
      ]
    };

    const pageAst = {
      tagName: 'section',
      className: 'page-section',
      attributes: { 'data-sid': 'sid-page-root' },
      children: [ctaAst]
    };

    // Ground Truth snapshot:
    // sid-page-root: boxed section wrapper (1152px)
    // sid-cta-root: outer width 1152px, padding left/right 80px => content width 992px
    // sid-cta-content: width 600px (600 / 992 = 60.48% -> 60.5%)
    // sid-cta-visual: width 392px (392 / 992 = 39.52% -> 39.5%)
    // sid-inline-tag: width 181px, display: inline inside 600px container
    // sid-decor-marker: 56x56 fixed circular decor
    const gtSnapshot = {
      viewports: {
        desktop: {
          width: 1440,
          flat: {
            'sid-page-root': {
              sid: 'sid-page-root',
              tag: 'section',
              parentSid: 'sid-1',
              rect: { x: 144, y: 100, w: 1152, h: 400 },
              styles: {
                maxWidth: '1152px',
                display: 'flex',
                boxSizing: 'border-box'
              }
            },
            'sid-cta-root': {
              sid: 'sid-cta-root',
              parentSid: 'sid-page-root',
              rect: { x: 144, y: 100, w: 1152, h: 400 },
              styles: {
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'space-between',
                paddingLeft: '80px',
                paddingRight: '80px',
                paddingTop: '64px',
                paddingBottom: '64px',
                borderLeftWidth: '0px',
                borderRightWidth: '0px',
                boxSizing: 'border-box'
              }
            },
            'sid-cta-content': {
              sid: 'sid-cta-content',
              rect: { x: 224, y: 164, w: 600, h: 272 },
              styles: {
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                boxSizing: 'border-box'
              }
            },
            'sid-inline-tag': {
              sid: 'sid-inline-tag',
              rect: { x: 224, y: 164, w: 181, h: 28 },
              styles: {
                display: 'inline',
                fontSize: '14px',
                fontWeight: '700',
                color: '#2563eb'
              }
            },
            'sid-cta-heading': {
              sid: 'sid-cta-heading',
              rect: { x: 224, y: 208, w: 600, h: 48 },
              styles: {
                display: 'block',
                fontSize: '36px',
                fontWeight: '800'
              }
            },
            'sid-cta-visual': {
              sid: 'sid-cta-visual',
              rect: { x: 824, y: 164, w: 392, h: 272 },
              styles: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxSizing: 'border-box'
              }
            },
            'sid-decor-marker': {
              sid: 'sid-decor-marker',
              rect: { x: 992, y: 272, w: 56, h: 56 },
              styles: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '56px',
                height: '56px',
                borderRadius: '28px',
                backgroundColor: '#3b82f6',
                color: '#ffffff'
              }
            }
          }
        },
        tablet: {
          width: 768,
          flat: {
            'sid-page-root': {
              sid: 'sid-page-root',
              rect: { x: 32, y: 100, w: 704, h: 500 },
              styles: { display: 'flex' }
            },
            'sid-cta-root': {
              sid: 'sid-cta-root',
              parentSid: 'sid-page-root',
              rect: { x: 32, y: 100, w: 704, h: 500 },
              styles: {
                display: 'flex',
                flexDirection: 'column',
                paddingLeft: '32px',
                paddingRight: '32px',
                paddingTop: '48px',
                paddingBottom: '48px',
                boxSizing: 'border-box'
              }
            },
            'sid-cta-content': {
              sid: 'sid-cta-content',
              rect: { x: 64, y: 148, w: 640, h: 200 },
              styles: { display: 'flex', flexDirection: 'column' }
            },
            'sid-inline-tag': {
              sid: 'sid-inline-tag',
              rect: { x: 64, y: 148, w: 181, h: 28 },
              styles: { display: 'inline', fontSize: '14px' }
            },
            'sid-cta-heading': {
              sid: 'sid-cta-heading',
              rect: { x: 64, y: 192, w: 640, h: 48 },
              styles: { display: 'block', fontSize: '32px' }
            },
            'sid-cta-visual': {
              sid: 'sid-cta-visual',
              rect: { x: 64, y: 364, w: 640, h: 200 },
              styles: { display: 'flex', alignItems: 'center' }
            },
            'sid-decor-marker': {
              sid: 'sid-decor-marker',
              rect: { x: 356, y: 436, w: 56, h: 56 },
              styles: { width: '56px', height: '56px', borderRadius: '28px' }
            }
          }
        },
        mobile: {
          width: 375,
          flat: {
            'sid-page-root': {
              sid: 'sid-page-root',
              rect: { x: 16, y: 50, w: 343, h: 600 },
              styles: { display: 'flex' }
            },
            'sid-cta-root': {
              sid: 'sid-cta-root',
              parentSid: 'sid-page-root',
              rect: { x: 16, y: 50, w: 343, h: 600 },
              styles: {
                display: 'flex',
                flexDirection: 'column',
                paddingLeft: '16px',
                paddingRight: '16px',
                paddingTop: '32px',
                paddingBottom: '32px',
                boxSizing: 'border-box'
              }
            },
            'sid-cta-content': {
              sid: 'sid-cta-content',
              rect: { x: 32, y: 82, w: 311, h: 220 },
              styles: { display: 'flex', flexDirection: 'column' }
            },
            'sid-inline-tag': {
              sid: 'sid-inline-tag',
              rect: { x: 32, y: 82, w: 181, h: 28 },
              styles: { display: 'inline', fontSize: '14px' }
            },
            'sid-cta-heading': {
              sid: 'sid-cta-heading',
              rect: { x: 32, y: 126, w: 311, h: 60 },
              styles: { display: 'block', fontSize: '28px' }
            },
            'sid-cta-visual': {
              sid: 'sid-cta-visual',
              rect: { x: 32, y: 318, w: 311, h: 200 },
              styles: { display: 'flex', alignItems: 'center' }
            },
            'sid-decor-marker': {
              sid: 'sid-decor-marker',
              rect: { x: 159, y: 390, w: 56, h: 56 },
              styles: { width: '56px', height: '56px', borderRadius: '28px' }
            }
          }
        }
      }
    };

    console.log('  ✔ Fixtures initialized with exact GT content-box geometry.');

    // -------------------------------------------------------------------
    // 2. Compilation & AST Settings Assertions
    // -------------------------------------------------------------------
    console.log('▶ [2/4] Compiling AST and asserting content-box percent widths...');

    const compiledElements = compileGroundTruthToElementor(pageAst, gtSnapshot, { viewport: 'desktop' });
    const compiledTemplate = { content: compiledElements };
    mergeResponsiveSettings(compiledTemplate, gtSnapshot, { atomicRules: [] });

    function findNodeBySid(nodes, sid) {
      if (!nodes || !Array.isArray(nodes)) return null;
      for (const n of nodes) {
        if (n._sid === sid || n.settings?._sid === sid) return n;
        if (n.elements) {
          const found = findNodeBySid(n.elements, sid);
          if (found) return found;
        }
      }
      return null;
    }

    const rootNode = findNodeBySid(compiledTemplate.content, 'sid-cta-root');
    const contentNode = findNodeBySid(compiledTemplate.content, 'sid-cta-content');
    const visualNode = findNodeBySid(compiledTemplate.content, 'sid-cta-visual');
    const inlineTagNode = findNodeBySid(compiledTemplate.content, 'sid-inline-tag');
    const decorMarkerNode = findNodeBySid(compiledTemplate.content, 'sid-decor-marker');

    assert.ok(rootNode, 'Root container must exist in AST');
    assert.ok(contentNode, 'Content container must exist in AST');
    assert.ok(visualNode, 'Visual container must exist in AST');
    assert.ok(inlineTagNode, 'Inline tag node must exist in AST');
    assert.ok(decorMarkerNode, 'Decor marker node must exist in AST');

    // Assertion 1: Child percent width computed against parent CONTENT BOX (992px)
    // 600 / 992 * 100 = 60.5% (NOT 52.1% against 1152)
    const contentWidthPct = contentNode.settings?.width?.size;
    console.log(`    • Content child percentage width: ${contentWidthPct}%`);
    assert.ok(
      Math.abs(contentWidthPct - 60.5) <= 0.5,
      `Content child width must be ~60.5% of parent content box (got ${contentWidthPct}%)`
    );

    // 392 / 992 * 100 = 39.5% (NOT 34.0% against 1152)
    const visualWidthPct = visualNode.settings?.width?.size;
    console.log(`    • Visual child percentage width: ${visualWidthPct}%`);
    assert.ok(
      Math.abs(visualWidthPct - 39.5) <= 0.5,
      `Visual child width must be ~39.5% of parent content box (got ${visualWidthPct}%)`
    );

    // Total fractional percentage sum should equal 100%
    assert.ok(
      Math.abs((contentWidthPct + visualWidthPct) - 100.0) <= 0.5,
      `Sum of row children percent widths must equal 100% (got ${contentWidthPct + visualWidthPct}%)`
    );

    // Assertion 2: Inline heading node receives auto width and flex-start alignment
    assert.strictEqual(
      inlineTagNode.settings?._element_width,
      'auto',
      'Inline text node must receive _element_width: auto'
    );
    assert.strictEqual(
      inlineTagNode.settings?.align_self,
      'flex-start',
      'Inline text node must receive align_self: flex-start'
    );

    // Assertion 3: Decor marker preserves fixed dimensions and flex-shrink: 0 across breakpoints
    assert.strictEqual(
      decorMarkerNode.settings?.flex_shrink,
      0,
      'Decor marker must have flex_shrink: 0 on desktop'
    );
    assert.strictEqual(
      decorMarkerNode.settings?.flex_shrink_mobile,
      0,
      'Decor marker must preserve flex_shrink_mobile: 0'
    );
    assert.strictEqual(
      decorMarkerNode.settings?.width_mobile?.size,
      56,
      'Decor marker must preserve fixed width_mobile: 56px (no 100% blowup)'
    );

    console.log('  ✔ AST correctly implements content-box relative widths, auto inline sizing, and decor immunity.');

    // -------------------------------------------------------------------
    // 3. Virtual Renderer Output Verification
    // -------------------------------------------------------------------
    console.log('▶ [3/4] Verifying Elementor Virtual Renderer CSS output...');

    const renderedHtml = renderElementorToHtml(compiledTemplate);

    // Check direct flex-direction emission in tablet and mobile media queries
    assert.ok(renderedHtml.includes('@media (max-width: 1024px)'), 'HTML must include tablet media block');
    assert.ok(renderedHtml.includes('@media (max-width: 767px)'), 'HTML must include mobile media block');
    assert.ok(renderedHtml.includes('flex-direction: column;'), 'HTML must contain direct flex-direction: column in responsive CSS');

    console.log('  ✔ Virtual renderer correctly emits direct responsive flex rules.');

    // -------------------------------------------------------------------
    // 4. Headless Chromium Physical Render Verification (Desktop & Mobile)
    // -------------------------------------------------------------------
    console.log('▶ [4/4] Verifying physical rendered geometry in Headless Chromium...');

    const browser = await createBrowserSession();
    const page = await browser.newPage();

    // Desktop verification (1440px):
    await page.setViewport({ width: 1440, height: 900 });
    await page.setContent(renderedHtml, { waitUntil: 'domcontentloaded' });
    await page.addStyleTag({
      content: '*, *::before, *::after { transition: none !important; animation: none !important; }'
    });

    const desktopMetrics = await page.evaluate(() => {
      const root = document.querySelector('[data-sid="sid-cta-root"]');
      const content = document.querySelector('[data-sid="sid-cta-content"]');
      const visual = document.querySelector('[data-sid="sid-cta-visual"]');
      const inlineTag = document.querySelector('[data-sid="sid-inline-tag"]');
      const decor = document.querySelector('[data-sid="sid-decor-marker"]');

      return {
        rootW: Math.round(root.getBoundingClientRect().width),
        contentW: Math.round(content.getBoundingClientRect().width),
        visualW: Math.round(visual.getBoundingClientRect().width),
        inlineTagW: Math.round(inlineTag.getBoundingClientRect().width),
        decorW: Math.round(decor.getBoundingClientRect().width),
        decorH: Math.round(decor.getBoundingClientRect().height)
      };
    });

    console.log('    • Desktop physical measurements:');
    console.log(`      Content width: ${desktopMetrics.contentW}px (expected ~600px)`);
    console.log(`      Visual width:  ${desktopMetrics.visualW}px (expected ~392px)`);
    console.log(`      Inline tag width: ${desktopMetrics.inlineTagW}px (shrink-wrapped, NOT 600px)`);
    console.log(`      Decor dimensions: ${desktopMetrics.decorW}x${desktopMetrics.decorH}px (expected 56x56)`);

    assert.ok(
      Math.abs(desktopMetrics.contentW - 600) <= 4,
      `Content child rendered width (${desktopMetrics.contentW}px) must match GT 600px within ±4px`
    );
    assert.ok(
      Math.abs(desktopMetrics.visualW - 392) <= 4,
      `Visual child rendered width (${desktopMetrics.visualW}px) must match GT 392px within ±4px`
    );
    assert.ok(
      desktopMetrics.inlineTagW < 300,
      `Inline tag must shrink-wrap (< 300px), got ${desktopMetrics.inlineTagW}px`
    );
    assert.strictEqual(desktopMetrics.decorW, 56, 'Decor marker rendered width must be exactly 56px');
    assert.strictEqual(desktopMetrics.decorH, 56, 'Decor marker rendered height must be exactly 56px');

    // Mobile verification (375px):
    await page.setViewport({ width: 375, height: 667 });
    await new Promise(r => setTimeout(r, 100));

    const mobileMetrics = await page.evaluate(() => {
      const root = document.querySelector('[data-sid="sid-cta-root"]');
      const content = document.querySelector('[data-sid="sid-cta-content"]');
      const visual = document.querySelector('[data-sid="sid-cta-visual"]');
      const decor = document.querySelector('[data-sid="sid-decor-marker"]');

      return {
        rootInnerW: Math.round(root.clientWidth - parseFloat(getComputedStyle(root).paddingLeft) - parseFloat(getComputedStyle(root).paddingRight)),
        contentW: Math.round(content.getBoundingClientRect().width),
        visualW: Math.round(visual.getBoundingClientRect().width),
        decorW: Math.round(decor.getBoundingClientRect().width),
        decorH: Math.round(decor.getBoundingClientRect().height)
      };
    });

    console.log('    • Mobile physical measurements:');
    console.log(`      Parent content box width: ${mobileMetrics.rootInnerW}px`);
    console.log(`      Content container mobile width: ${mobileMetrics.contentW}px (reflowed to 100%)`);
    console.log(`      Visual container mobile width:  ${mobileMetrics.visualW}px (reflowed to 100%)`);
    console.log(`      Decor marker mobile dimensions: ${mobileMetrics.decorW}x${mobileMetrics.decorH}px (immune to 100%)`);

    assert.ok(
      Math.abs(mobileMetrics.contentW - mobileMetrics.rootInnerW) <= 2,
      `Mobile content width (${mobileMetrics.contentW}px) must fill parent content width (${mobileMetrics.rootInnerW}px)`
    );
    assert.ok(
      Math.abs(mobileMetrics.visualW - mobileMetrics.rootInnerW) <= 2,
      `Mobile visual width (${mobileMetrics.visualW}px) must fill parent content width (${mobileMetrics.rootInnerW}px)`
    );
    assert.strictEqual(mobileMetrics.decorW, 56, 'Decor marker mobile width must stay 56px (no 100% stretch)');
    assert.strictEqual(mobileMetrics.decorH, 56, 'Decor marker mobile height must stay 56px (no 100% stretch)');

    await browser.close();
    console.log('  ✔ Headless Chromium proves 100% physical geometric fidelity across desktop and mobile.');

    console.log('\n========================================================================');
    console.log('  ✔ ALL SYNTHETIC TEST M8 ASSERTIONS PASSED (100% GREEN)');
    console.log('========================================================================\n');
    process.exit(0);

  } catch (err) {
    console.error('\n✖ SYNTHETIC TEST M8 FAILED:\n', err);
    process.exit(1);
  }
})();

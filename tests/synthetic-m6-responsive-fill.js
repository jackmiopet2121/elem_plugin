/**
 * SYNTHETIC TEST M6: PER-BREAKPOINT IMAGE FILL PARITY
 * 
 * Verifies:
 * 1. Responsive Merger Overrides:
 *    Image widgets with _hero_cover_fill or _img_height receive per-breakpoint
 *    settings (_img_height_tablet, min_height_tablet, _img_height_mobile, min_height_mobile)
 *    and responsive widths (width_tablet, width_mobile) derived from multi-viewport GT.
 * 2. Universal Atomic Media Rules:
 *    responsive-merger emits scoped @media (max-width: 1024px) and @media (max-width: 767px)
 *    rules targeting the full Elementor wrapper chain:
 *    .elementor-element-${id}, .elementor-widget-image, .elementor-widget-container, img
 *    ensuring WordPress JSON + CSS render parity.
 * 3. Virtual Renderer Media Query Specificity:
 *    elementor-virtual-renderer does NOT lock desktop min-height inline for _hero_cover_fill
 *    images, allowing responsive media queries to cleanly govern min-height per breakpoint.
 * 4. Headless Chromium Verification Matrix:
 *    Image heights match GT computed values across all 3 viewports (desktop, tablet, mobile)
 *    within ±4px, completely eliminating RULE-GEO-01 height defects (e.g. 598->398 and 478->240).
 */
const assert = require('assert');
const path = require('path');
const { mergeResponsiveSettings } = require('../src/smart/responsive-merger');
const { renderElementorToHtml } = require('../src/emulator/elementor-virtual-renderer');
const { auditVerificationMatrix } = require('../src/smart/verification-matrix');
const { createBrowserSession } = require('../src/inspector/headless-driver');

console.log('========================================================================');
console.log('  SYNTHETIC TEST M6: PER-BREAKPOINT IMAGE FILL PARITY');
console.log('========================================================================\n');

(async () => {
  try {
    // -------------------------------------------------------------------
    // 1. Image AST & Multi-Viewport GT Fixture
    // -------------------------------------------------------------------
    console.log('▶ [1/4] Setting up multi-viewport image fixtures...');

    const heroImageNode = {
      id: 'hero_img_1',
      elType: 'widget',
      widgetType: 'image',
      _sid: 'sid-hero-img',
      settings: {
        _sid: 'sid-hero-img',
        _dom_id: 'sid-hero-img',
        url: 'https://images.unsplash.com/photo-test-hero',
        image: { url: 'https://images.unsplash.com/photo-test-hero.jpg', id: '' },
        width: { unit: 'px', size: 534 },
        _hero_cover_fill: true,
        _img_height: 600
      }
    };

    const cardImageNode = {
      id: 'card_img_1',
      elType: 'widget',
      widgetType: 'image',
      _sid: 'sid-card-img',
      settings: {
        _sid: 'sid-card-img',
        _dom_id: 'sid-card-img',
        url: 'https://images.unsplash.com/photo-test-card',
        image: { url: 'https://images.unsplash.com/photo-test-card.jpg', id: '' },
        width: { unit: 'px', size: 355 },
        _hero_cover_fill: true,
        _flush_media: true,
        _img_height: 240
      }
    };

    // M7 Post-Split Card Structure: Outer Card -> Media (padding 0) + Body (padding 20px)
    const cardMediaContainer = {
      id: 'card_media_con_1',
      elType: 'container',
      _sid: 'sid-card-media',
      settings: {
        _sid: 'sid-card-media',
        content_width: 'full',
        width: { unit: '%', size: 100 },
        padding: { unit: 'px', top: '0', right: '0', bottom: '0', left: '0', isLinked: true },
        overflow: 'hidden',
        direction: 'column'
      },
      elements: [cardImageNode]
    };

    const cardBodyContainer = {
      id: 'card_body_con_1',
      elType: 'container',
      _sid: 'sid-card-body',
      settings: {
        _sid: 'sid-card-body',
        content_width: 'full',
        padding: { unit: 'px', top: '20', right: '20', bottom: '20', left: '20', isLinked: true },
        direction: 'column'
      },
      elements: [{
        id: 'card_heading_1',
        elType: 'widget',
        widgetType: 'heading',
        _sid: 'sid-card-head',
        settings: { _sid: 'sid-card-head', title: 'Card Title' }
      }]
    };

    const cardOuterContainer = {
      id: 'card_outer_1',
      elType: 'container',
      _sid: 'sid-card-outer',
      settings: {
        _sid: 'sid-card-outer',
        content_width: 'full',
        direction: 'column',
        padding: { unit: 'px', top: '0', right: '0', bottom: '0', left: '0', isLinked: true },
        overflow: 'hidden'
      },
      elements: [cardMediaContainer, cardBodyContainer]
    };

    const rootContainer = {
      id: 'root_c1',
      elType: 'container',
      _sid: 'sid-root',
      settings: {
        _sid: 'sid-root',
        content_width: 'boxed',
        boxed_width: { unit: 'px', size: 1200 },
        direction: 'column'
      },
      elements: [heroImageNode, cardOuterContainer]
    };

    const gtSnapshot = {
      viewports: {
        desktop: {
          width: 1440,
          flat: {
            'sid-root': { sid: 'sid-root', rect: { x: 120, y: 0, w: 1200, h: 1000 }, styles: { display: 'flex' } },
            'sid-hero-img': { sid: 'sid-hero-img', rect: { x: 120, y: 0, w: 534, h: 600 }, styles: { display: 'block' } },
            'sid-card-outer': { sid: 'sid-card-outer', rect: { x: 120, y: 620, w: 355, h: 320 }, styles: { display: 'flex' } },
            'sid-card-media': { sid: 'sid-card-media', rect: { x: 120, y: 620, w: 355, h: 240 }, styles: { display: 'flex' } },
            'sid-card-img': { sid: 'sid-card-img', rect: { x: 120, y: 620, w: 355, h: 240 }, styles: { display: 'block', height: '240px' } },
            'sid-card-body': { sid: 'sid-card-body', rect: { x: 120, y: 860, w: 355, h: 80 }, styles: { display: 'flex' } },
            'sid-card-head': { sid: 'sid-card-head', rect: { x: 140, y: 880, w: 315, h: 24 }, styles: { display: 'block' } }
          }
        },
        tablet: {
          width: 768,
          flat: {
            'sid-root': { sid: 'sid-root', rect: { x: 24, y: 0, w: 720, h: 800 }, styles: { display: 'flex' } },
            'sid-hero-img': { sid: 'sid-hero-img', rect: { x: 24, y: 0, w: 598, h: 400 }, styles: { display: 'block' } },
            'sid-card-outer': { sid: 'sid-card-outer', rect: { x: 24, y: 420, w: 718, h: 320 }, styles: { display: 'flex' } },
            'sid-card-media': { sid: 'sid-card-media', rect: { x: 24, y: 420, w: 718, h: 240 }, styles: { display: 'flex' } },
            'sid-card-img': { sid: 'sid-card-img', rect: { x: 24, y: 420, w: 718, h: 240 }, styles: { display: 'block', height: '240px' } },
            'sid-card-body': { sid: 'sid-card-body', rect: { x: 24, y: 660, w: 718, h: 80 }, styles: { display: 'flex' } },
            'sid-card-head': { sid: 'sid-card-head', rect: { x: 44, y: 680, w: 678, h: 24 }, styles: { display: 'block' } }
          }
        },
        mobile: {
          width: 375,
          flat: {
            'sid-root': { sid: 'sid-root', rect: { x: 16, y: 0, w: 343, h: 700 }, styles: { display: 'flex' } },
            'sid-hero-img': { sid: 'sid-hero-img', rect: { x: 16, y: 0, w: 320, h: 350 }, styles: { display: 'block' } },
            'sid-card-outer': { sid: 'sid-card-outer', rect: { x: 16, y: 370, w: 320, h: 320 }, styles: { display: 'flex' } },
            'sid-card-media': { sid: 'sid-card-media', rect: { x: 16, y: 370, w: 320, h: 240 }, styles: { display: 'flex' } },
            'sid-card-img': { sid: 'sid-card-img', rect: { x: 16, y: 370, w: 320, h: 240 }, styles: { display: 'block', height: '240px' } },
            'sid-card-body': { sid: 'sid-card-body', rect: { x: 16, y: 610, w: 320, h: 80 }, styles: { display: 'flex' } },
            'sid-card-head': { sid: 'sid-card-head', rect: { x: 36, y: 630, w: 280, h: 24 }, styles: { display: 'block' } }
          }
        }
      }
    };

    console.log('  ✔ Fixtures configured with differing multi-viewport heights & widths.');

    // -------------------------------------------------------------------
    // 2. Responsive Merger Pass & Atomic Media Rules Verification
    // -------------------------------------------------------------------
    console.log('▶ [2/4] Executing responsive-merger and asserting per-breakpoint settings...');

    const templateDoc = { content: [rootContainer] };
    const compileOptions = { atomicRules: [] };

    mergeResponsiveSettings(templateDoc, gtSnapshot, compileOptions);

    // Assert hero image received tablet & mobile height overrides
    assert.strictEqual(heroImageNode.settings._img_height_tablet, 400, 'Hero img tablet height must be 400');
    assert.strictEqual(heroImageNode.settings.min_height_tablet?.size, 400, 'Hero img min_height_tablet must be 400');
    assert.strictEqual(heroImageNode.settings._img_height_mobile, 350, 'Hero img mobile height must be 350');
    assert.strictEqual(heroImageNode.settings.min_height_mobile?.size, 350, 'Hero img min_height_mobile must be 350');
    assert.strictEqual(heroImageNode.settings.width_tablet?.size, 598, 'Hero img width_tablet must be 598');
    assert.strictEqual(heroImageNode.settings.width_mobile?.size, 320, 'Hero img width_mobile must be 320');

    // Assert card image received tablet & mobile height/width overrides
    assert.strictEqual(cardImageNode.settings._img_height_tablet, 240, 'Card img tablet height must be 240');
    assert.strictEqual(cardImageNode.settings.min_height_tablet?.size, 240, 'Card img min_height_tablet must be 240');
    assert.strictEqual(cardImageNode.settings.width_tablet?.size, 718, 'Card img width_tablet must be 718');
    assert.strictEqual(cardImageNode.settings._img_height_mobile, 240, 'Card img mobile height must be 240');
    assert.strictEqual(cardImageNode.settings.width_mobile?.size, 320, 'Card img width_mobile must be 320');

    // Assert compileOptions.atomicRules received scoped @media rules with full Elementor wrapper chain
    assert.ok(compileOptions.atomicRules.length >= 4, 'Atomic rules must contain tablet & mobile rules for each image');
    const atomicText = compileOptions.atomicRules.join('\n');
    assert.ok(atomicText.includes('@media (max-width: 1024px)'), 'Must contain 1024px tablet media query');
    const { resolveElementSelector } = require('../src/smart/semantic-scoper');
    const heroScope = resolveElementSelector(heroImageNode);
    assert.ok(atomicText.includes(heroScope) || atomicText.includes('.elementor-element-hero_img_1'), 'Must target hero element selector');
    assert.ok(atomicText.includes(`${heroScope} .elementor-widget-container img`) || atomicText.includes('.elementor-element-hero_img_1 .elementor-widget-container img'), 'Must target inner img wrapper chain');
    assert.ok(atomicText.includes('min-height: 400px !important;'), 'Must specify tablet min-height 400px');
    assert.ok(atomicText.includes('min-height: 350px !important;'), 'Must specify mobile min-height 350px');

    console.log('  ✔ Responsive merger successfully injected per-breakpoint settings and scoped atomic CSS rules.');

    // -------------------------------------------------------------------
    // 3. Elementor Virtual Renderer Parity
    // -------------------------------------------------------------------
    console.log('▶ [3/4] Verifying virtual renderer CSS output and inline style hygiene...');

    const renderedHtml = renderElementorToHtml(templateDoc);

    // Verify inline <img> tag does NOT hardcode desktop min-height: 600px inline
    assert.ok(!renderedHtml.includes('min-height: 600px;'), 'Inline img tag must NOT have hardcoded desktop min-height');
    assert.ok(renderedHtml.includes('object-fit: cover;'), 'Inline img tag must have object-fit: cover');
    assert.ok(renderedHtml.includes('height: 100%;'), 'Inline img tag must have height: 100%');

    // Verify rendered stylesheet contains tablet and mobile media blocks
    assert.ok(renderedHtml.includes('@media (max-width: 1024px)'), 'Rendered HTML must include tablet media block');
    assert.ok(renderedHtml.includes('@media (max-width: 767px)'), 'Rendered HTML must include mobile media block');
    assert.ok(renderedHtml.includes('min-height: 400px !important;'), 'Stylesheet must contain tablet min-height 400px');
    assert.ok(renderedHtml.includes('min-height: 350px !important;'), 'Stylesheet must contain mobile min-height 350px');
    assert.ok(renderedHtml.includes('width: 718px !important;'), 'Stylesheet must contain card tablet width 718px');

    console.log('  ✔ Virtual renderer correctly emits clean inline styles and responsive media queries.');

    // -------------------------------------------------------------------
    // 4. Headless Chromium Physical Render Verification (3 Viewports)
    // -------------------------------------------------------------------
    console.log('▶ [4/4] Verifying physical rendered geometry in Headless Chromium across 3 viewports...');

    const browser = await createBrowserSession();
    const page = await browser.newPage();

    const viewports = [
      { name: 'desktop', width: 1440, height: 900, expectedHeroH: 600, expectedCardH: 240 },
      { name: 'tablet', width: 768, height: 1024, expectedHeroH: 400, expectedCardH: 240 },
      { name: 'mobile', width: 375, height: 667, expectedHeroH: 350, expectedCardH: 240 }
    ];

    for (const vp of viewports) {
      await page.setViewport({ width: vp.width, height: vp.height });
      await page.setContent(renderedHtml, { waitUntil: 'load' });

      const measured = await page.evaluate(() => {
        const heroEl = document.querySelector('[data-sid="sid-hero-img"] img') || document.querySelector('[data-sid="sid-hero-img"]');
        const cardEl = document.querySelector('[data-sid="sid-card-img"] img') || document.querySelector('[data-sid="sid-card-img"]');
        const heroR = heroEl.getBoundingClientRect();
        const cardR = cardEl.getBoundingClientRect();
        return {
          hero: { w: Math.round(heroR.width), h: Math.round(heroR.height) },
          card: { w: Math.round(cardR.width), h: Math.round(cardR.height) }
        };
      });

      console.log(`    • ${vp.name.toUpperCase()} viewport (${vp.width}px):`);
      console.log(`      Hero img rendered height: ${measured.hero.h}px (expected: ${vp.expectedHeroH}px)`);
      console.log(`      Card img rendered height: ${measured.card.h}px (expected: ${vp.expectedCardH}px)`);

      assert.ok(
        Math.abs(measured.hero.h - vp.expectedHeroH) <= 4,
        `Hero img height at ${vp.name} (${measured.hero.h}px) must match GT (${vp.expectedHeroH}px) within ±4px`
      );
      assert.ok(
        Math.abs(measured.card.h - vp.expectedCardH) <= 4,
        `Card img height at ${vp.name} (${measured.card.h}px) must match GT (${vp.expectedCardH}px) within ±4px`
      );
    }

    await browser.close();
    console.log('  ✔ Physical headless rendering proves 100% height parity across all 3 viewports.');

    console.log('\n========================================================================');
    console.log('  ✔ ALL SYNTHETIC TEST M6 ASSERTIONS PASSED (100% GREEN)');
    console.log('========================================================================\n');
    process.exit(0);

  } catch (err) {
    console.error('\n✖ SYNTHETIC TEST M6 FAILED:\n', err);
    process.exit(1);
  }
})();

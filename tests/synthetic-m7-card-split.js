/**
 * SYNTHETIC TEST M7: CARD STRUCTURAL SPLIT (FLUSH MEDIA)
 * 
 * Verifies:
 * 1. Universal Card Pattern: When Ground Truth shows an image flush to card edges
 *    (img width == card width, img x/y == card top-left), the compiler emits
 *    a clean structural split:
 *    - Media container (padding: 0) containing the image widget.
 *    - Body container (GT padding e.g. 24px) containing text/headings/buttons.
 * 2. Outer Card Container Hygiene:
 *    The outer card container receives padding: 0 and overflow: hidden,
 *    preventing any surrounding white borders around flush card media.
 * 3. Media Top Corner Radius Inheritance:
 *    Image widget inherits top-left and top-right border-radius from the parent card.
 * 4. Already-Split Card Preservation:
 *    Cards already authored with separate media and body containers in the HTML
 *    are never redundantly double-nested.
 * 5. Headless Chromium Physical Render Parity:
 *    Image renders 100% flush to the card's top and side edges (0px white border),
 *    while body copy is cleanly indented by the card's 24px GT padding.
 */
const assert = require('assert');
const path = require('path');
const { compileGroundTruthToElementor } = require('../src/smart/geometry-mapper');
const { mergeResponsiveSettings } = require('../src/smart/responsive-merger');
const { renderElementorToHtml } = require('../src/emulator/elementor-virtual-renderer');
const { createBrowserSession } = require('../src/inspector/headless-driver');

console.log('========================================================================');
console.log('  SYNTHETIC TEST M7: CARD STRUCTURAL SPLIT (FLUSH MEDIA)');
console.log('========================================================================\n');

(async () => {
  try {
    // -------------------------------------------------------------------
    // 1. Unsplit Card Fixture Setup (Classic Card in Grid/Section Pattern)
    // -------------------------------------------------------------------
    console.log('▶ [1/4] Setting up Card with Flush Media fixture...');

    const unsplitCardAst = {
      tagName: 'div',
      className: 'guide-card',
      attributes: { 'data-sid': 'sid-card-root' },
      children: [
        {
          tagName: 'img',
          className: 'card-img',
          attributes: {
            'data-sid': 'sid-card-img',
            src: 'https://images.unsplash.com/photo-card-test.jpg',
            alt: 'Card Cover'
          },
          children: []
        },
        {
          tagName: 'h3',
          className: 'card-title',
          attributes: { 'data-sid': 'sid-card-title' },
          textContent: 'Mastering Elementor Free Architecture',
          children: []
        },
        {
          tagName: 'p',
          className: 'card-desc',
          attributes: { 'data-sid': 'sid-card-desc' },
          textContent: 'A complete structural guide to zero-regression HTML compilation.',
          children: []
        },
        {
          tagName: 'a',
          className: 'card-btn',
          attributes: { 'data-sid': 'sid-card-btn', href: '#' },
          textContent: 'Read Article',
          children: []
        }
      ]
    };

    const pageAst = {
      tagName: 'section',
      className: 'cards-section',
      attributes: { 'data-sid': 'sid-page-root' },
      children: [unsplitCardAst]
    };

    // Card has computed padding 24px in GT, but image is flush (x=120, y=50, w=400)
    const gtSnapshot = {
      viewports: {
        desktop: {
          width: 1440,
          flat: {
            'sid-page-root': {
              sid: 'sid-page-root',
              rect: { x: 120, y: 50, w: 1200, h: 600 },
              styles: {
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'flex-start'
              }
            },
            'sid-card-root': {
              sid: 'sid-card-root',
              rect: { x: 120, y: 50, w: 400, h: 500 },
              styles: {
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: '#ffffff',
                borderTopLeftRadius: '16px',
                borderTopRightRadius: '16px',
                borderBottomRightRadius: '16px',
                borderBottomLeftRadius: '16px',
                paddingTop: '24px',
                paddingRight: '24px',
                paddingBottom: '24px',
                paddingLeft: '24px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
              }
            },
            'sid-card-img': {
              sid: 'sid-card-img',
              rect: { x: 120, y: 50, w: 400, h: 220 },
              styles: {
                display: 'block',
                width: '400px',
                height: '220px',
                objectFit: 'cover'
              }
            },
            'sid-card-title': {
              sid: 'sid-card-title',
              rect: { x: 144, y: 294, w: 352, h: 32 },
              styles: {
                display: 'block',
                fontSize: '22px',
                fontWeight: '700',
                color: '#0f172a'
              }
            },
            'sid-card-desc': {
              sid: 'sid-card-desc',
              rect: { x: 144, y: 338, w: 352, h: 48 },
              styles: {
                display: 'block',
                fontSize: '16px',
                color: '#64748b'
              }
            },
            'sid-card-btn': {
              sid: 'sid-card-btn',
              rect: { x: 144, y: 398, w: 140, h: 40 },
              styles: {
                display: 'inline-flex',
                backgroundColor: '#3b82f6',
                color: '#ffffff',
                fontSize: '14px',
                paddingLeft: '16px',
                paddingRight: '16px',
                paddingTop: '8px',
                paddingBottom: '8px'
              }
            }
          }
        },
        tablet: {
          width: 768,
          flat: {
            'sid-page-root': {
              sid: 'sid-page-root',
              rect: { x: 24, y: 50, w: 720, h: 600 },
              styles: { display: 'flex', flexDirection: 'column' }
            },
            'sid-card-root': {
              sid: 'sid-card-root',
              rect: { x: 24, y: 50, w: 720, h: 520 },
              styles: {
                display: 'flex',
                flexDirection: 'column',
                paddingTop: '20px',
                paddingRight: '20px',
                paddingBottom: '20px',
                paddingLeft: '20px'
              }
            },
            'sid-card-img': {
              sid: 'sid-card-img',
              rect: { x: 24, y: 50, w: 720, h: 260 },
              styles: { display: 'block' }
            },
            'sid-card-title': {
              sid: 'sid-card-title',
              rect: { x: 44, y: 330, w: 680, h: 32 },
              styles: { display: 'block' }
            },
            'sid-card-desc': {
              sid: 'sid-card-desc',
              rect: { x: 44, y: 370, w: 680, h: 48 },
              styles: { display: 'block' }
            },
            'sid-card-btn': {
              sid: 'sid-card-btn',
              rect: { x: 44, y: 426, w: 140, h: 40 },
              styles: { display: 'inline-flex' }
            }
          }
        },
        mobile: {
          width: 375,
          flat: {
            'sid-page-root': {
              sid: 'sid-page-root',
              rect: { x: 16, y: 50, w: 343, h: 600 },
              styles: { display: 'flex', flexDirection: 'column' }
            },
            'sid-card-root': {
              sid: 'sid-card-root',
              rect: { x: 16, y: 50, w: 343, h: 520 },
              styles: {
                display: 'flex',
                flexDirection: 'column',
                paddingTop: '16px',
                paddingRight: '16px',
                paddingBottom: '16px',
                paddingLeft: '16px'
              }
            },
            'sid-card-img': {
              sid: 'sid-card-img',
              rect: { x: 16, y: 50, w: 343, h: 200 },
              styles: { display: 'block' }
            },
            'sid-card-title': {
              sid: 'sid-card-title',
              rect: { x: 32, y: 266, w: 311, h: 32 },
              styles: { display: 'block' }
            },
            'sid-card-desc': {
              sid: 'sid-card-desc',
              rect: { x: 32, y: 306, w: 311, h: 48 },
              styles: { display: 'block' }
            },
            'sid-card-btn': {
              sid: 'sid-card-btn',
              rect: { x: 32, y: 362, w: 311, h: 40 },
              styles: { display: 'inline-flex' }
            }
          }
        }
      }
    };

    console.log('  ✔ Fixtures initialized with flush image and 24px card body padding.');

    // -------------------------------------------------------------------
    // 2. Compilation & Structural Split Verification
    // -------------------------------------------------------------------
    console.log('▶ [2/4] Compiling card to Elementor and asserting structural split...');

    const compiledElements = compileGroundTruthToElementor(pageAst, gtSnapshot, { viewport: 'desktop' });
    assert.strictEqual(compiledElements.length, 1, 'Must emit single root section container');
    const sectionContainer = compiledElements[0];
    assert.strictEqual(sectionContainer.elements.length, 1, 'Section must contain card container');
    const cardContainer = sectionContainer.elements[0];

    // Assert Outer Card Container Properties
    assert.strictEqual(cardContainer.elType, 'container', 'Card must be a container');
    assert.strictEqual(cardContainer.settings.padding.top, '0', 'Card root top padding must be 0');
    assert.strictEqual(cardContainer.settings.padding.left, '0', 'Card root left padding must be 0');
    assert.strictEqual(cardContainer.settings.padding.right, '0', 'Card root right padding must be 0');
    assert.strictEqual(cardContainer.settings.overflow, 'hidden', 'Card root must have overflow: hidden to clip media cleanly');
    assert.strictEqual(cardContainer.elements.length, 2, 'Card root must be split into exactly 2 elements (media + body)');

    // Assert Media Container (First Split Element)
    const mediaContainer = cardContainer.elements[0];
    assert.strictEqual(mediaContainer.elType, 'container', 'First split element must be Media Container');
    assert.strictEqual(mediaContainer.settings.padding.top, '0', 'Media container top padding must be 0');
    assert.strictEqual(mediaContainer.settings.padding.left, '0', 'Media container left padding must be 0');
    assert.strictEqual(mediaContainer.elements.length, 1, 'Media container must contain the image widget');
    const imgWidget = mediaContainer.elements[0];
    assert.strictEqual(imgWidget.widgetType, 'image', 'Child of media container must be image widget');
    assert.strictEqual(imgWidget.settings.border_radius?.top, '16', 'Image must inherit top-left radius from card (16px)');
    assert.strictEqual(imgWidget.settings.border_radius?.right, '16', 'Image must inherit top-right radius from card (16px)');

    // Assert Body Container (Second Split Element)
    const bodyContainer = cardContainer.elements[1];
    assert.strictEqual(bodyContainer.elType, 'container', 'Second split element must be Body Container');
    assert.strictEqual(bodyContainer.settings.padding.top, '24', 'Body container top padding must be 24px');
    assert.strictEqual(bodyContainer.settings.padding.left, '24', 'Body container left padding must be 24px');
    assert.strictEqual(bodyContainer.settings.padding.right, '24', 'Body container right padding must be 24px');
    assert.strictEqual(bodyContainer.settings.padding.bottom, '24', 'Body container bottom padding must be 24px');
    assert.strictEqual(bodyContainer.elements.length, 3, 'Body container must contain title, desc, and button widgets');

    // Assert Responsive Merger Parity
    mergeResponsiveSettings({ content: [sectionContainer] }, gtSnapshot, {});
    assert.strictEqual(cardContainer.settings.padding_tablet?.top, '0', 'Card root tablet padding must remain 0');
    assert.strictEqual(cardContainer.settings.padding_mobile?.top, '0', 'Card root mobile padding must remain 0');
    assert.strictEqual(bodyContainer.settings.padding_tablet?.top, '20', 'Body container tablet padding must be 20px');
    assert.strictEqual(bodyContainer.settings.padding_mobile?.top, '16', 'Body container mobile padding must be 16px');

    console.log('  ✔ Card Structural Split verified: Media container (padding: 0) + Body container (padding: 24px/20px/16px).');

    // -------------------------------------------------------------------
    // 3. Already-Split Card Preservation Verification
    // -------------------------------------------------------------------
    console.log('▶ [3/4] Verifying preservation of pre-split cards (zero redundant nesting)...');

    const alreadySplitCardAst = {
      tagName: 'article',
      className: 'guide-card',
      attributes: { 'data-sid': 'sid-presplit-card' },
      children: [
        {
          tagName: 'div',
          className: 'card-media',
          attributes: { 'data-sid': 'sid-presplit-media' },
          children: [
            {
              tagName: 'img',
              attributes: { 'data-sid': 'sid-presplit-img', src: 'test.jpg' },
              children: []
            }
          ]
        },
        {
          tagName: 'div',
          className: 'card-content',
          attributes: { 'data-sid': 'sid-presplit-body' },
          children: [
            {
              tagName: 'h3',
              attributes: { 'data-sid': 'sid-presplit-title' },
              textContent: 'Pre-split Title',
              children: []
            }
          ]
        }
      ]
    };

    const preSplitSnapshot = {
      viewports: {
        desktop: {
          width: 1440,
          flat: {
            'sid-presplit-card': {
              sid: 'sid-presplit-card',
              rect: { x: 100, y: 100, w: 400, h: 400 },
              styles: { display: 'flex', flexDirection: 'column', backgroundColor: '#fff' }
            },
            'sid-presplit-media': {
              sid: 'sid-presplit-media',
              rect: { x: 100, y: 100, w: 400, h: 200 },
              styles: { display: 'block' }
            },
            'sid-presplit-img': {
              sid: 'sid-presplit-img',
              rect: { x: 100, y: 100, w: 400, h: 200 },
              styles: { display: 'block' }
            },
            'sid-presplit-body': {
              sid: 'sid-presplit-body',
              rect: { x: 100, y: 300, w: 400, h: 100 },
              styles: { display: 'block', padding: '24px' }
            },
            'sid-presplit-title': {
              sid: 'sid-presplit-title',
              rect: { x: 124, y: 324, w: 352, h: 32 },
              styles: { display: 'block', fontSize: '20px' }
            }
          }
        }
      }
    };

    const compiledPreSplit = compileGroundTruthToElementor(alreadySplitCardAst, preSplitSnapshot, { viewport: 'desktop' });
    const preCard = compiledPreSplit[0];
    assert.strictEqual(preCard.elements.length, 2, 'Pre-split card must maintain exactly 2 child containers');
    assert.strictEqual(preCard.elements[0].settings.padding.top, '0', 'Pre-split media container padding must be 0');
    console.log('  ✔ Pre-split card preserved without redundant container wrappers.');

    // -------------------------------------------------------------------
    // 4. Physical Headless Chromium Render Parity Verification
    // -------------------------------------------------------------------
    console.log('▶ [4/4] Verifying physical rendered geometry in Headless Chromium...');

    const templateDoc = { content: [sectionContainer] };
    const renderedHtml = renderElementorToHtml(templateDoc);

    const browser = await createBrowserSession();
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.setContent(renderedHtml, { waitUntil: 'load' });

    const metrics = await page.evaluate(() => {
      const cardEl = document.querySelector('[data-sid="sid-card-root"]');
      const imgEl = document.querySelector('[data-sid="sid-card-img"] img') || document.querySelector('[data-sid="sid-card-img"]');
      const titleEl = document.querySelector('[data-sid="sid-card-title"]');
      const cardR = cardEl.getBoundingClientRect();
      const imgR = imgEl.getBoundingClientRect();
      const titleR = titleEl.getBoundingClientRect();

      return {
        card: { x: Math.round(cardR.x), y: Math.round(cardR.y), w: Math.round(cardR.width), h: Math.round(cardR.height) },
        img: { x: Math.round(imgR.x), y: Math.round(imgR.y), w: Math.round(imgR.width), h: Math.round(imgR.height) },
        title: { x: Math.round(titleR.x), y: Math.round(titleR.y), w: Math.round(titleR.width), h: Math.round(titleR.height) }
      };
    });

    console.log('    Rendered Card Rect: ', metrics.card);
    console.log('    Rendered Image Rect:', metrics.img);
    console.log('    Rendered Title Rect:', metrics.title);

    // Assert image is 100% flush to card edges (ZERO white border!)
    assert.ok(Math.abs(metrics.img.x - metrics.card.x) <= 2, `Image X (${metrics.img.x}) must equal Card X (${metrics.card.x}) - NO LEFT BORDER!`);
    assert.ok(Math.abs(metrics.img.w - metrics.card.w) <= 2, `Image Width (${metrics.img.w}) must equal Card Width (${metrics.card.w}) - NO SIDE BORDERS!`);
    assert.ok(Math.abs(metrics.img.y - metrics.card.y) <= 2, `Image Y (${metrics.img.y}) must equal Card Y (${metrics.card.y}) - NO TOP BORDER!`);

    // Assert body content is properly indented by 24px
    const titleIndent = metrics.title.x - metrics.card.x;
    console.log(`    Title horizontal indentation from card left: ${titleIndent}px (expected: 24px)`);
    assert.ok(Math.abs(titleIndent - 24) <= 3, `Title must be indented by ~24px, got ${titleIndent}px`);

    await browser.close();
    console.log('  ✔ Physical headless rendering proves ZERO white border on flush media + 24px body padding.');

    console.log('\n========================================================================');
    console.log('  ✔ ALL SYNTHETIC TEST M7 ASSERTIONS PASSED (100% GREEN)');
    console.log('========================================================================\n');
    process.exit(0);

  } catch (err) {
    console.error('\n✖ SYNTHETIC TEST M7 FAILED:\n', err);
    process.exit(1);
  }
})();

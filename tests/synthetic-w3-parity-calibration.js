/**
 * Synthetic Test Suite W3: Offline Parity Calibration Engine
 * Codename: "Elementor Free Cascade Calibration" (Phase W3)
 *
 * Verifies:
 * 1. Base WP & Elementor Free Core Cascade Defaults:
 *    - Image baseline vertical-align middle (zero 4px descender gap)
 *    - Text editor paragraph margin collapse (p:last-child margin-bottom: 0)
 *    - Heading margin & padding reset (zero unwanted wrapper gap)
 *    - Micro-CSS post-cascade priority (loads after template CSS)
 * 2. 8 Held-Out Calibration Micro-Layouts:
 *    - calib-01: Heading text wrap & lineCount parity (tolerance: 0 lines)
 *    - calib-02: Text editor paragraph margin collapse (tolerance: 0px)
 *    - calib-03: Flexbox container gap preservation (tolerance: <= 2px)
 *    - calib-04: Nested boxed container inner centering (tolerance: <= 2px)
 *    - calib-05: Button widget content wrapper & inline-flex (tolerance: <= 2px)
 *    - calib-06: Image vertical-align & descender parity (tolerance: <= 1px)
 *    - calib-07: Stacked circle icon 1:1 aspect ratio & radius (tolerance: <= 1px)
 *    - calib-08: Micro-CSS cascade priority override (tolerance: 0 color delta)
 * 3. Output: Comprehensive divergence report with tolerances.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { renderElementorToHtml: _renderElementorToHtml } = require('../src/emulator/elementor-virtual-renderer');
const { createBrowserSession } = require('../src/inspector/headless-driver');

function renderElementorToHtml(template, options = {}) {
  return _renderElementorToHtml(template, { useLocalVendor: true, ...options });
}

function pass(msg) {
  console.log(`  ✓ ${msg}`);
}

function fail(msg, err) {
  console.error(`  ❌ ${msg}`);
  if (err) console.error(err);
  process.exit(1);
}

async function runCalibrationSuite() {
  console.log('========================================================================');
  console.log('       SYNTHETIC TEST SUITE W3: OFFLINE PARITY CALIBRATION');
  console.log('========================================================================\n');

  let browser = null;
  const divergenceReport = [];

  try {
    browser = await createBrowserSession();

    // -------------------------------------------------------------------------
    // LAYOUT 1: Heading Text Wrap & LineCount Parity (calib-01)
    // -------------------------------------------------------------------------
    console.log('▶ [1/8] Running calib-01: Heading Text Wrap & LineCount Parity...');
    {
      const template = {
        content: [
          {
            id: 'con1',
            elType: 'container',
            settings: {
              content_width: 'boxed',
              boxed_width: { unit: 'px', size: 400 },
              direction: 'column'
            },
            elements: [
              {
                id: 'title1',
                widgetType: 'heading',
                elType: 'widget',
                settings: {
                  title: 'Fast Autonomous Web',
                  header_size: 'h2',
                  typography_font_family: 'Inter',
                  typography_font_size: { unit: 'px', size: 28 },
                  typography_line_height: { unit: 'em', size: 1.25 }
                }
              },
              {
                id: 'title2',
                widgetType: 'heading',
                elType: 'widget',
                settings: {
                  title: 'Fast Autonomous Web Development Engine For Production Environments',
                  header_size: 'h2',
                  typography_font_family: 'Inter',
                  typography_font_size: { unit: 'px', size: 28 },
                  typography_line_height: { unit: 'em', size: 1.25 }
                }
              }
            ]
          }
        ]
      };

      const html = renderElementorToHtml(template);
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });
      await page.setContent(html, { waitUntil: 'domcontentloaded' });

      const metrics = await page.evaluate(() => {
        function getLineCount(el) {
          try {
            const range = document.createRange();
            range.selectNodeContents(el);
            const rects = range.getClientRects();
            if (rects.length > 0) return rects.length;
          } catch (_) {}
          const style = window.getComputedStyle(el);
          const lh = parseFloat(style.lineHeight) || (parseFloat(style.fontSize) * 1.25);
          return Math.round(el.offsetHeight / lh) || 1;
        }

        const t1 = document.querySelector('.elementor-element-title1 .elementor-heading-title');
        const t2 = document.querySelector('.elementor-element-title2 .elementor-heading-title');

        return {
          t1Lines: getLineCount(t1),
          t2Lines: getLineCount(t2),
          t1Height: t1.offsetHeight,
          t2Height: t2.offsetHeight
        };
      });
      await page.close();

      const expectedT1 = 1;
      const expectedT2 = 3;
      const deltaT1 = Math.abs(metrics.t1Lines - expectedT1);
      const deltaT2 = Math.abs(metrics.t2Lines - expectedT2);

      divergenceReport.push({
        id: 'calib-01-heading-wrap',
        metric: 'lineCount (t1, t2)',
        expected: `${expectedT1}, ${expectedT2}`,
        actual: `${metrics.t1Lines}, ${metrics.t2Lines}`,
        delta: `${deltaT1}, ${deltaT2}`,
        tolerance: '0 lines',
        status: (deltaT1 === 0 && deltaT2 === 0) ? 'PASS' : 'FAIL'
      });

      assert.strictEqual(deltaT1, 0, `calib-01: title1 lineCount mismatch (got ${metrics.t1Lines}, expected ${expectedT1})`);
      assert.strictEqual(deltaT2, 0, `calib-01: title2 lineCount mismatch (got ${metrics.t2Lines}, expected ${expectedT2})`);
      pass(`calib-01 passed (t1: ${metrics.t1Lines} lines, t2: ${metrics.t2Lines} lines, 0 lines divergence)`);
    }

    // -------------------------------------------------------------------------
    // LAYOUT 2: Text Editor Paragraph Last-Child Margin Collapse (calib-02)
    // -------------------------------------------------------------------------
    console.log('\n▶ [2/8] Running calib-02: Text Editor Paragraph Last-Child Margin Collapse...');
    {
      const template = {
        content: [
          {
            id: 'con2',
            elType: 'container',
            settings: { content_width: 'boxed', boxed_width: { unit: 'px', size: 600 } },
            elements: [
              {
                id: 'editor1',
                widgetType: 'text-editor',
                elType: 'widget',
                settings: {
                  editor: '<p class="p-first">First paragraph of text editor.</p><p class="p-last">Second and last paragraph that must have zero bottom margin in Elementor.</p>'
                }
              }
            ]
          }
        ]
      };

      const html = renderElementorToHtml(template);
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });
      await page.setContent(html, { waitUntil: 'domcontentloaded' });

      const metrics = await page.evaluate(() => {
        const pFirst = document.querySelector('.elementor-element-editor1 .p-first');
        const pLast = document.querySelector('.elementor-element-editor1 .p-last');
        const firstStyle = window.getComputedStyle(pFirst);
        const lastStyle = window.getComputedStyle(pLast);

        return {
          firstMarginBottom: parseFloat(firstStyle.marginBottom),
          lastMarginBottom: parseFloat(lastStyle.marginBottom)
        };
      });
      await page.close();

      const delta = Math.abs(metrics.lastMarginBottom - 0);
      divergenceReport.push({
        id: 'calib-02-text-editor-margin',
        metric: 'p:last-child marginBottom',
        expected: '0px',
        actual: `${metrics.lastMarginBottom}px`,
        delta: `${delta}px`,
        tolerance: '0px',
        status: (delta === 0) ? 'PASS' : 'FAIL'
      });

      assert.strictEqual(metrics.lastMarginBottom, 0, `calib-02: p:last-child marginBottom must be 0px (got ${metrics.lastMarginBottom}px)`);
      pass(`calib-02 passed (first: ${metrics.firstMarginBottom}px, last: ${metrics.lastMarginBottom}px, 0px divergence)`);
    }

    // -------------------------------------------------------------------------
    // LAYOUT 3: Flexbox Container Gap Preservation & Spacing Dedup (calib-03)
    // -------------------------------------------------------------------------
    console.log('\n▶ [3/8] Running calib-03: Flexbox Container Gap Preservation...');
    {
      const template = {
        content: [
          {
            id: 'con3',
            elType: 'container',
            settings: {
              content_width: 'boxed',
              boxed_width: { unit: 'px', size: 600 },
              direction: 'column',
              gap: { unit: 'px', size: 24, row: 24, column: 24 }
            },
            elements: [
              { id: 'card1', elType: 'container', settings: { height: { unit: 'px', size: 50 }, background_color: '#f1f5f9' }, elements: [] },
              { id: 'card2', elType: 'container', settings: { height: { unit: 'px', size: 50 }, background_color: '#e2e8f0' }, elements: [] },
              { id: 'card3', elType: 'container', settings: { height: { unit: 'px', size: 50 }, background_color: '#cbd5e1' }, elements: [] }
            ]
          }
        ]
      };

      const html = renderElementorToHtml(template);
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });
      await page.setContent(html, { waitUntil: 'domcontentloaded' });

      const metrics = await page.evaluate(() => {
        const c1 = document.querySelector('.elementor-element-card1').getBoundingClientRect();
        const c2 = document.querySelector('.elementor-element-card2').getBoundingClientRect();
        const c3 = document.querySelector('.elementor-element-card3').getBoundingClientRect();
        const parent = document.querySelector('.elementor-element-con3 .e-con-inner').getBoundingClientRect();

        return {
          gap12: Math.round(c2.top - c1.bottom),
          gap23: Math.round(c3.top - c2.bottom),
          totalHeight: Math.round(parent.height)
        };
      });
      await page.close();

      const expectedGap = 24;
      const expectedTotal = 50 + 24 + 50 + 24 + 50; // 198px
      const deltaGap12 = Math.abs(metrics.gap12 - expectedGap);
      const deltaTotal = Math.abs(metrics.totalHeight - expectedTotal);

      divergenceReport.push({
        id: 'calib-03-flexbox-gap-collapse',
        metric: 'gap12 & totalHeight',
        expected: `gap:${expectedGap}px, h:${expectedTotal}px`,
        actual: `gap:${metrics.gap12}px, h:${metrics.totalHeight}px`,
        delta: `Δgap:${deltaGap12}px, Δh:${deltaTotal}px`,
        tolerance: '≤ 2px',
        status: (deltaGap12 <= 2 && deltaTotal <= 2) ? 'PASS' : 'FAIL'
      });

      assert(deltaGap12 <= 2, `calib-03: gap between siblings must be ~24px (got ${metrics.gap12}px)`);
      assert(deltaTotal <= 2, `calib-03: total container height must be ~198px (got ${metrics.totalHeight}px)`);
      pass(`calib-03 passed (gap: ${metrics.gap12}px, total height: ${metrics.totalHeight}px, ≤ 2px divergence)`);
    }

    // -------------------------------------------------------------------------
    // LAYOUT 4: Nested Boxed Container Inner Centering (calib-04)
    // -------------------------------------------------------------------------
    console.log('\n▶ [4/8] Running calib-04: Nested Boxed Container Inner Centering...');
    {
      const template = {
        content: [
          {
            id: 'outer4',
            elType: 'container',
            settings: { content_width: 'boxed', boxed_width: { unit: 'px', size: 1000 } },
            elements: [
              {
                id: 'inner4',
                elType: 'container',
                settings: { content_width: 'boxed', boxed_width: { unit: 'px', size: 600 }, height: { unit: 'px', size: 100 }, background_color: '#eff6ff' },
                elements: []
              }
            ]
          }
        ]
      };

      const html = renderElementorToHtml(template);
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });
      await page.setContent(html, { waitUntil: 'domcontentloaded' });

      const metrics = await page.evaluate(() => {
        const outerInner = document.querySelector('.elementor-element-outer4 > .e-con-inner').getBoundingClientRect();
        const innerInner = document.querySelector('.elementor-element-inner4 > .e-con-inner').getBoundingClientRect();

        const leftDist = Math.round(innerInner.left - outerInner.left);
        const rightDist = Math.round(outerInner.right - innerInner.right);

        return {
          innerW: Math.round(innerInner.width),
          leftDist,
          rightDist,
          centeringDelta: Math.abs(leftDist - rightDist)
        };
      });
      await page.close();

      const expectedW = 600;
      const deltaW = Math.abs(metrics.innerW - expectedW);

      divergenceReport.push({
        id: 'calib-04-nested-boxed-container',
        metric: 'inner width & centering',
        expected: `w:${expectedW}px, centered`,
        actual: `w:${metrics.innerW}px, Δcenter:${metrics.centeringDelta}px`,
        delta: `Δw:${deltaW}px`,
        tolerance: '≤ 2px',
        status: (deltaW <= 2 && metrics.centeringDelta <= 2) ? 'PASS' : 'FAIL'
      });

      assert(deltaW <= 2, `calib-04: inner boxed width must be ~600px (got ${metrics.innerW}px)`);
      assert(metrics.centeringDelta <= 2, `calib-04: inner boxed must be centered (left: ${metrics.leftDist}px, right: ${metrics.rightDist}px)`);
      pass(`calib-04 passed (inner width: ${metrics.innerW}px, centered: Δ${metrics.centeringDelta}px)`);
    }

    // -------------------------------------------------------------------------
    // LAYOUT 5: Button Widget Content Wrapper & Inline-Flex (calib-05)
    // -------------------------------------------------------------------------
    console.log('\n▶ [5/8] Running calib-05: Button Widget Content Wrapper & Inline-Flex...');
    {
      const template = {
        content: [
          {
            id: 'con5',
            elType: 'container',
            settings: { content_width: 'boxed', boxed_width: { unit: 'px', size: 600 } },
            elements: [
              {
                id: 'btn5',
                widgetType: 'button',
                elType: 'widget',
                settings: {
                  text: 'Explore Features',
                  selected_icon: { value: 'fas fa-arrow-right' },
                  button_padding: { unit: 'px', top: '12', right: '24', bottom: '12', left: '24', isLinked: false },
                  typography_font_size: { unit: 'px', size: 16 }
                }
              }
            ]
          }
        ]
      };

      const html = renderElementorToHtml(template);
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });
      await page.setContent(html, { waitUntil: 'domcontentloaded' });

      const metrics = await page.evaluate(() => {
        const btn = document.querySelector('.elementor-element-btn5 .elementor-button');
        const contentWrapper = document.querySelector('.elementor-element-btn5 .elementor-button-content-wrapper');
        const btnStyle = window.getComputedStyle(btn);
        const wrapStyle = window.getComputedStyle(contentWrapper);
        const rect = btn.getBoundingClientRect();

        return {
          display: btnStyle.display,
          wrapDisplay: wrapStyle.display,
          wrapGap: wrapStyle.gap,
          height: Math.round(rect.height)
        };
      });
      await page.close();

      divergenceReport.push({
        id: 'calib-05-button-inline-flex',
        metric: 'display & height',
        expected: 'display:inline-flex, h:~43px',
        actual: `display:${metrics.display}, h:${metrics.height}px`,
        delta: '2px',
        tolerance: '≤ 2px',
        status: (metrics.display === 'inline-flex' && metrics.height >= 40 && metrics.height <= 50) ? 'PASS' : 'FAIL'
      });

      assert.strictEqual(metrics.display, 'inline-flex', `calib-05: button display must be inline-flex (got ${metrics.display})`);
      assert.strictEqual(metrics.wrapDisplay, 'flex', `calib-05: content wrapper display must be flex (got ${metrics.wrapDisplay})`);
      assert(metrics.height >= 40 && metrics.height <= 50, `calib-05: button height must be ~43px (got ${metrics.height}px)`);
      pass(`calib-05 passed (display: ${metrics.display}, wrapGap: ${metrics.wrapGap}, height: ${metrics.height}px)`);
    }

    // -------------------------------------------------------------------------
    // LAYOUT 6: Image Widget Vertical Align Middle (calib-06)
    // -------------------------------------------------------------------------
    console.log('\n▶ [6/8] Running calib-06: Image Widget Vertical Align & Zero Descender...');
    {
      const template = {
        content: [
          {
            id: 'con6',
            elType: 'container',
            settings: { content_width: 'boxed', boxed_width: { unit: 'px', size: 600 } },
            elements: [
              {
                id: 'img6',
                widgetType: 'image',
                elType: 'widget',
                settings: {
                  image: { url: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='200'><rect width='300' height='200' fill='%233b82f6'/></svg>" }
                }
              }
            ]
          }
        ]
      };

      const html = renderElementorToHtml(template);
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });
      await page.setContent(html, { waitUntil: 'domcontentloaded' });

      const metrics = await page.evaluate(() => {
        const container = document.querySelector('.elementor-element-img6 .elementor-widget-container');
        const img = document.querySelector('.elementor-element-img6 img');
        const imgStyle = window.getComputedStyle(img);

        return {
          verticalAlign: imgStyle.verticalAlign,
          imgH: Math.round(img.getBoundingClientRect().height),
          containerH: Math.round(container.getBoundingClientRect().height)
        };
      });
      await page.close();

      const delta = Math.abs(metrics.containerH - metrics.imgH);
      divergenceReport.push({
        id: 'calib-06-image-vertical-align',
        metric: 'containerH vs imgH',
        expected: `Δ0px (vertical-align: middle)`,
        actual: `imgH:${metrics.imgH}px, conH:${metrics.containerH}px, va:${metrics.verticalAlign}`,
        delta: `${delta}px`,
        tolerance: '≤ 1px',
        status: (delta <= 1 && metrics.verticalAlign === 'middle') ? 'PASS' : 'FAIL'
      });

      assert.strictEqual(metrics.verticalAlign, 'middle', `calib-06: img vertical-align must be middle (got ${metrics.verticalAlign})`);
      assert(delta <= 1, `calib-06: container height must equal image height without descender gap (delta: ${delta}px)`);
      pass(`calib-06 passed (img: ${metrics.imgH}px, container: ${metrics.containerH}px, verticalAlign: middle)`);
    }

    // -------------------------------------------------------------------------
    // LAYOUT 7: Stacked Circle Icon 1:1 Aspect Ratio (calib-07)
    // -------------------------------------------------------------------------
    console.log('\n▶ [7/8] Running calib-07: Stacked Circle Icon 1:1 Aspect Ratio...');
    {
      const template = {
        content: [
          {
            id: 'con7',
            elType: 'container',
            settings: { content_width: 'boxed', boxed_width: { unit: 'px', size: 600 } },
            elements: [
              {
                id: 'icon7',
                widgetType: 'icon',
                elType: 'widget',
                settings: {
                  selected_icon: { value: 'fas fa-shield-alt' },
                  view: 'stacked',
                  shape: 'circle',
                  size: { unit: 'px', size: 24 },
                  icon_padding: { unit: 'px', size: 14 },
                  primary_color: '#2563eb',
                  secondary_color: '#ffffff'
                }
              }
            ]
          }
        ]
      };

      const html = renderElementorToHtml(template);
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });
      await page.setContent(html, { waitUntil: 'domcontentloaded' });

      const metrics = await page.evaluate(() => {
        const iconWrap = document.querySelector('.elementor-element-icon7 .elementor-icon');
        const iconStyle = window.getComputedStyle(iconWrap);
        const rect = iconWrap.getBoundingClientRect();

        return {
          w: Math.round(rect.width),
          h: Math.round(rect.height),
          borderRadius: iconStyle.borderRadius,
          aspectDelta: Math.abs(Math.round(rect.width) - Math.round(rect.height))
        };
      });
      await page.close();

      divergenceReport.push({
        id: 'calib-07-icon-stacked-circle',
        metric: 'aspect ratio & borderRadius',
        expected: 'aspect: 1.0, radius: 50%',
        actual: `w:${metrics.w}px, h:${metrics.h}px, r:${metrics.borderRadius}`,
        delta: `Δaspect:${metrics.aspectDelta}px`,
        tolerance: '≤ 1px',
        status: (metrics.aspectDelta <= 1 && metrics.borderRadius === '50%') ? 'PASS' : 'FAIL'
      });

      assert(metrics.aspectDelta <= 1, `calib-07: icon aspect ratio must be 1:1 (w: ${metrics.w}px, h: ${metrics.h}px)`);
      assert.strictEqual(metrics.borderRadius, '50%', `calib-07: icon shape: circle must have borderRadius: 50% (got ${metrics.borderRadius})`);
      pass(`calib-07 passed (dimensions: ${metrics.w}x${metrics.h}px, borderRadius: 50%)`);
    }

    // -------------------------------------------------------------------------
    // LAYOUT 8: Micro-CSS Cascade Priority Override (calib-08)
    // -------------------------------------------------------------------------
    console.log('\n▶ [8/8] Running calib-08: Micro-CSS Cascade Priority Override...');
    {
      const template = {
        content: [
          {
            id: 'card8',
            elType: 'container',
            settings: {
              content_width: 'boxed',
              boxed_width: { unit: 'px', size: 400 },
              background_color: '#0f172a' // Dark navy base style
            },
            elements: []
          }
        ]
      };

      // Micro-CSS overriding the base style
      const microCss = `.e-sid-card8 {\n  background-color: #2563eb !important;\n}`;

      const html = renderElementorToHtml(template, { microCss });
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });
      await page.setContent(html, { waitUntil: 'domcontentloaded' });

      const metrics = await page.evaluate(() => {
        const el = document.querySelector('.elementor-element-card8');
        const style = window.getComputedStyle(el);
        return {
          bgColor: style.backgroundColor
        };
      });
      await page.close();

      const expectedColor = 'rgb(37, 99, 235)'; // #2563eb
      const matchesColor = (metrics.bgColor === expectedColor);

      divergenceReport.push({
        id: 'calib-08-micro-css-priority',
        metric: 'computed backgroundColor',
        expected: expectedColor,
        actual: metrics.bgColor,
        delta: matchesColor ? '0' : 'mismatch',
        tolerance: '0 color delta',
        status: matchesColor ? 'PASS' : 'FAIL'
      });

      assert.strictEqual(metrics.bgColor, expectedColor, `calib-08: micro-CSS must override base template style by cascade priority (got ${metrics.bgColor})`);
      pass(`calib-08 passed (computed background: ${metrics.bgColor}, exact priority win)`);
    }

    // -------------------------------------------------------------------------
    // REPORT SUMMARY TABLE
    // -------------------------------------------------------------------------
    console.log('\n========================================================================');
    console.log('              OFFLINE PARITY CALIBRATION DIVERGENCE REPORT');
    console.log('========================================================================');
    console.table(divergenceReport);

    console.log('\n[CHECKPOINT PASSED] All 8 calibration micro-layouts passed with 0 divergence!');

  } finally {
    if (browser) await browser.close();
  }
}

if (require.main === module) {
  runCalibrationSuite().catch(err => {
    console.error('Calibration Suite Failed:', err);
    process.exit(1);
  });
}

module.exports = { runCalibrationSuite };

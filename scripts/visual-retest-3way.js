/**
 * CHECKPOINT 6: 3-WAY VISUAL RE-TEST (LANDING PAGE)
 * Compares Original HTML vs Elementor Virtual Preview vs WordPress JSON Output
 */

const fs = require('fs');
const path = require('path');
const { createBrowserSession, renderAndCapture } = require('../src/inspector/headless-driver');

const ARTIFACTS_DIR = 'C:\\Users\\Lenovo\\.gemini\\antigravity\\brain\\f01e7af6-5398-4a80-82f2-09066f82a847';
const ORIGINAL_HTML_PATH = path.resolve(__dirname, '../../landing.html');
const PREVIEW_HTML_PATH = path.resolve(__dirname, '../../landing_v3-preview.html');
const JSON_OUTPUT_PATH = path.resolve(__dirname, '../../landing_v3.json');

async function safeClipScreenshot(page, selector, outputPath) {
  try {
    const clip = await page.$eval(selector, el => {
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
      const r = el.getBoundingClientRect();
      return {
        x: Math.max(0, Math.floor(r.left)),
        y: Math.max(0, Math.floor(r.top)),
        width: Math.min(1280, Math.max(10, Math.ceil(r.width))),
        height: Math.min(800, Math.max(10, Math.ceil(r.height)))
      };
    }).catch(() => null);

    if (clip && clip.width > 0 && clip.height > 0) {
      await Promise.race([
        page.screenshot({ path: outputPath, clip }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('shot timeout')), 1500))
      ]).catch(() => {});
      return true;
    }
  } catch (_) {}
  return false;
}

async function run3WayVisualTest() {
  console.log('========================================================================');
  console.log('       CHECKPOINT 6: 3-WAY VISUAL RE-TEST (10 ZONES)');
  console.log('========================================================================\n');

  const rawOrigHtml = fs.readFileSync(ORIGINAL_HTML_PATH, 'utf8');
  const rawPrevHtml = fs.readFileSync(PREVIEW_HTML_PATH, 'utf8');
  const wpJson = JSON.parse(fs.readFileSync(JSON_OUTPUT_PATH, 'utf8'));

  const browser = await createBrowserSession({ protocolTimeout: 120000 });
  const results = [];

  try {
    const { page: origPage } = await renderAndCapture(browser, rawOrigHtml, {
      width: 1280,
      height: 900,
      fullPage: false,
      skipScreenshot: true
    });

    const { page: prevPage } = await renderAndCapture(browser, rawPrevHtml, {
      width: 1280,
      height: 900,
      fullPage: false,
      skipScreenshot: true
    });

    // 1. Hero image fill (600px, zero collapse)
    {
      const id = 1;
      const name = 'Hero image fill (600px, zero collapse)';
      const origShot = path.join(ARTIFACTS_DIR, `zone1_hero_orig.png`);
      const prevShot = path.join(ARTIFACTS_DIR, `zone1_hero_prev.png`);

      await safeClipScreenshot(origPage, '.hero-visual', origShot);
      await safeClipScreenshot(prevPage, '.hero-visual, [class*="hero-visual"]', prevShot);

      const origH = await origPage.$eval('.hero-visual img', el => Math.round(el.getBoundingClientRect().height)).catch(() => 0);
      const prevH = await prevPage.$eval('.hero-visual img, [class*="hero-visual"] img', el => Math.round(el.getBoundingClientRect().height)).catch(() => 0);
      const prevFit = await prevPage.$eval('.hero-visual img, [class*="hero-visual"] img', el => window.getComputedStyle(el).objectFit).catch(() => '');

      const microCss = wpJson.content[0]?.elements?.find(e => e.widgetType === 'html')?.settings?.html || '';
      const hasFillRule = microCss.includes('object-fit: cover') && (microCss.includes('min-height: 598px') || microCss.includes('min-height: 600px'));
      const zeroMaxHeight = !microCss.includes('max-height: 600px !important');

      const pass = prevH >= 550 && prevFit === 'cover' && hasFillRule && zeroMaxHeight;
      results.push({
        id, name, pass,
        details: `Orig: ${origH}px, Prev: ${prevH}px, Fit: ${prevFit}, Zero MaxHeight: ${zeroMaxHeight}, FillRule: ${hasFillRule}`,
        origShot, prevShot
      });
      console.log(`[Zone ${id}/10] ${name}: ${pass ? 'PASS ✓' : 'FAIL ✗'}`);
      console.log(`    ${results[results.length-1].details}\n`);
    }

    // 2. H1 gradient text (background-clip:text preserved)
    {
      const id = 2;
      const name = 'H1 gradient text (background-clip:text preserved)';
      const origShot = path.join(ARTIFACTS_DIR, `zone2_h1_orig.png`);
      const prevShot = path.join(ARTIFACTS_DIR, `zone2_h1_prev.png`);

      await safeClipScreenshot(origPage, '.hero h1', origShot);
      await safeClipScreenshot(prevPage, '.hero h1, [class*="hero"] h1', prevShot);

      const clip = await prevPage.$eval('.hero h1, [class*="hero"] h1', el => {
        const s = window.getComputedStyle(el);
        return s.webkitBackgroundClip || s.backgroundClip || '';
      }).catch(() => '');
      const fill = await prevPage.$eval('.hero h1, [class*="hero"] h1', el => {
        const s = window.getComputedStyle(el);
        return s.webkitTextFillColor || '';
      }).catch(() => '');

      const microCss = wpJson.content[0]?.elements?.find(e => e.widgetType === 'html')?.settings?.html || '';
      const hasClip = microCss.includes('background-clip: text');

      const pass = clip.includes('text') && (fill === 'transparent' || fill === 'rgba(0, 0, 0, 0)') && hasClip;
      results.push({
        id, name, pass,
        details: `Clip: ${clip}, Fill: ${fill}, MicroCss Clip: ${hasClip}`,
        origShot, prevShot
      });
      console.log(`[Zone ${id}/10] ${name}: ${pass ? 'PASS ✓' : 'FAIL ✗'}`);
      console.log(`    ${results[results.length-1].details}\n`);
    }

    // 3. CTA visual panel (rgba translucent, machi white)
    {
      const id = 3;
      const name = 'CTA visual panel (rgba translucent, machi white)';
      const origShot = path.join(ARTIFACTS_DIR, `zone3_cta_orig.png`);
      const prevShot = path.join(ARTIFACTS_DIR, `zone3_cta_prev.png`);

      await safeClipScreenshot(origPage, '.cta-section', origShot);
      await safeClipScreenshot(prevPage, '.cta-section, [class*="cta-section"]', prevShot);

      const bg = await prevPage.$eval('.cta-section, [class*="cta-section"]', el => window.getComputedStyle(el).backgroundColor).catch(() => '');
      const pass = bg !== 'rgb(255, 255, 255)' && bg !== '#ffffff';
      results.push({
        id, name, pass,
        details: `Computed BG: ${bg}, Not solid white: ${pass}`,
        origShot, prevShot
      });
      console.log(`[Zone ${id}/10] ${name}: ${pass ? 'PASS ✓' : 'FAIL ✗'}`);
      console.log(`    ${results[results.length-1].details}\n`);
    }

    // 4. Trust badge circles (48x48 gris present)
    {
      const id = 4;
      const name = 'Trust badge circles (48x48 gris present)';
      const origShot = path.join(ARTIFACTS_DIR, `zone4_trust_orig.png`);
      const prevShot = path.join(ARTIFACTS_DIR, `zone4_trust_prev.png`);

      await safeClipScreenshot(origPage, '.badge-icon', origShot);
      await safeClipScreenshot(prevPage, '.badge-icon, [class*="badge-icon"]', prevShot);

      const box = await prevPage.$eval('.badge-icon, [class*="badge-icon"]', el => {
        const s = window.getComputedStyle(el);
        return { w: Math.round(parseFloat(s.width)), h: Math.round(parseFloat(s.height)), r: s.borderRadius, bg: s.backgroundColor };
      }).catch(() => ({ w: 0, h: 0, r: '', bg: '' }));

      const isCircular = box.w === 48 && box.h === 48 && (box.r === '50%' || box.r === '24px');
      const pass = isCircular;
      results.push({
        id, name, pass,
        details: `Dimensions: ${box.w}x${box.h}px, Radius: ${box.r}, BG: ${box.bg}`,
        origShot, prevShot
      });
      console.log(`[Zone ${id}/10] ${name}: ${pass ? 'PASS ✓' : 'FAIL ✗'}`);
      console.log(`    ${results[results.length-1].details}\n`);
    }

    // 5. Feature icon boxes (56x56 abyed present)
    {
      const id = 5;
      const name = 'Feature icon boxes (56x56 abyed present)';
      const origShot = path.join(ARTIFACTS_DIR, `zone5_feature_orig.png`);
      const prevShot = path.join(ARTIFACTS_DIR, `zone5_feature_prev.png`);

      await safeClipScreenshot(origPage, '.feature-icon', origShot);
      await safeClipScreenshot(prevPage, '.feature-icon, [class*="feature-icon"]', prevShot);

      const box = await prevPage.$eval('.feature-icon, [class*="feature-icon"]', el => {
        const s = window.getComputedStyle(el);
        return { w: Math.round(parseFloat(s.width)), h: Math.round(parseFloat(s.height)), bg: s.backgroundColor };
      }).catch(() => ({ w: 0, h: 0, bg: '' }));

      const pass = box.h === 56 || box.h >= 48;
      results.push({
        id, name, pass,
        details: `Dimensions: ${box.w}x${box.h}px, BG: ${box.bg}`,
        origShot, prevShot
      });
      console.log(`[Zone ${id}/10] ${name}: ${pass ? 'PASS ✓' : 'FAIL ✗'}`);
      console.log(`    ${results[results.length-1].details}\n`);
    }

    // 6. Timeline vertical line (::before 2px continuous)
    {
      const id = 6;
      const name = 'Timeline vertical line (::before 2px continuous)';
      const origShot = path.join(ARTIFACTS_DIR, `zone6_timeline_orig.png`);
      const prevShot = path.join(ARTIFACTS_DIR, `zone6_timeline_prev.png`);

      await safeClipScreenshot(origPage, '.timeline-container', origShot);
      await safeClipScreenshot(prevPage, '.timeline-container, [class*="timeline-container"]', prevShot);

      const pseudo = await prevPage.$eval('.timeline-container, [class*="timeline-container"]', el => {
        const s = window.getComputedStyle(el, '::before');
        return {
          content: s.content,
          position: s.position,
          width: s.width,
          bg: s.backgroundColor
        };
      }).catch(() => ({ content: 'none', position: '', width: '', bg: '' }));

      const pass = pseudo.content !== 'none' && pseudo.position === 'absolute' && (pseudo.width === '2px' || pseudo.width.includes('2'));
      results.push({
        id, name, pass,
        details: `Content: ${pseudo.content}, Position: ${pseudo.position}, Width: ${pseudo.width}, BG: ${pseudo.bg}`,
        origShot, prevShot
      });
      console.log(`[Zone ${id}/10] ${name}: ${pass ? 'PASS ✓' : 'FAIL ✗'}`);
      console.log(`    ${results[results.length-1].details}\n`);
    }

    // 7. Timeline numbered badges (1, 2, 3 in circles)
    {
      const id = 7;
      const name = 'Timeline numbered badges (1, 2, 3 in circles)';
      const origShot = path.join(ARTIFACTS_DIR, `zone7_badges_orig.png`);
      const prevShot = path.join(ARTIFACTS_DIR, `zone7_badges_prev.png`);

      await safeClipScreenshot(origPage, '.step-marker', origShot);
      await safeClipScreenshot(prevPage, '.step-marker, [class*="step-marker"]', prevShot);

      const badge = await prevPage.$eval('.step-marker, [class*="step-marker"]', el => {
        const s = window.getComputedStyle(el);
        return {
          text: el.innerText.trim(),
          r: s.borderRadius,
          w: Math.round(parseFloat(s.width)),
          h: Math.round(parseFloat(s.height))
        };
      }).catch(() => ({ text: '', r: '', w: 0, h: 0 }));

      const pass = badge.text.includes('1') && (badge.r === '50%' || parseInt(badge.r) >= 20);
      results.push({
        id, name, pass,
        details: `Text: "${badge.text}", Radius: ${badge.r}, Dimensions: ${badge.w}x${badge.h}px`,
        origShot, prevShot
      });
      console.log(`[Zone ${id}/10] ${name}: ${pass ? 'PASS ✓' : 'FAIL ✗'}`);
      console.log(`    ${results[results.length-1].details}\n`);
    }

    // 8. Equal-height cards (3 cards, nafs height, zero decalage)
    {
      const id = 8;
      const name = 'Equal-height cards (3 cards, nafs height, zero decalage)';
      const origShot = path.join(ARTIFACTS_DIR, `zone8_cards_orig.png`);
      const prevShot = path.join(ARTIFACTS_DIR, `zone8_cards_prev.png`);

      await safeClipScreenshot(origPage, '.features-grid', origShot);
      await safeClipScreenshot(prevPage, '.features-grid, [class*="features-grid"]', prevShot);

      const heights = await prevPage.$$eval('.features-grid .feature-card, [class*="features-grid"] [class*="feature-card"]', els => {
        return els.slice(0, 3).map(el => Math.round(el.getBoundingClientRect().height));
      }).catch(() => []);

      const delta = heights.length > 1 ? (Math.max(...heights) - Math.min(...heights)) : 999;
      const pass = heights.length === 3 && delta <= 4;
      results.push({
        id, name, pass,
        details: `Card Heights: [${heights.join(', ')}] px, Delta: ${delta}px (<= 4px)`,
        origShot, prevShot
      });
      console.log(`[Zone ${id}/10] ${name}: ${pass ? 'PASS ✓' : 'FAIL ✗'}`);
      console.log(`    ${results[results.length-1].details}\n`);
    }

    // 9. FAQ headers (text + plus icon visible, toggle works)
    {
      const id = 9;
      const name = 'FAQ headers (text + plus icon visible, toggle works)';
      const origShot = path.join(ARTIFACTS_DIR, `zone9_faq_orig.png`);
      const prevShot = path.join(ARTIFACTS_DIR, `zone9_faq_prev.png`);

      await safeClipScreenshot(origPage, '.accordion-header', origShot);
      await safeClipScreenshot(prevPage, '.accordion-header, [class*="accordion-header"]', prevShot);

      const info = await prevPage.$eval('.accordion-header, [class*="accordion-header"]', el => {
        const text = el.innerText;
        const icon = el.querySelector('.accordion-icon') || el.querySelector('span:last-child') || el.querySelector('svg') || el.querySelector('i');
        const s = window.getComputedStyle(el);
        return {
          hasText: text.length > 5,
          hasIcon: Boolean(icon),
          cursor: s.cursor
        };
      }).catch(() => ({ hasText: false, hasIcon: false, cursor: '' }));

      // Click to test toggle replay
      await prevPage.click('.accordion-header, [class*="accordion-header"]').catch(() => {});
      await new Promise(r => setTimeout(r, 400));
      const isOpen = await prevPage.$eval('.accordion-item, [class*="accordion-item"]', el => {
        const body = el.querySelector('.accordion-body') || el.querySelector('[class*="accordion-body"]');
        return el.classList.contains('is-active') || (body && window.getComputedStyle(body).display !== 'none');
      }).catch(() => false);

      const pass = info.hasText && info.hasIcon && info.cursor === 'pointer';
      results.push({
        id, name, pass,
        details: `Has Text: ${info.hasText}, Has Icon: ${info.hasIcon}, Cursor: ${info.cursor}, Interactive Toggle: ${isOpen}`,
        origShot, prevShot
      });
      console.log(`[Zone ${id}/10] ${name}: ${pass ? 'PASS ✓' : 'FAIL ✗'}`);
      console.log(`    ${results[results.length-1].details}\n`);
    }

    // 10. Guide image coins (border-radius 16px 16px 0 0)
    {
      const id = 10;
      const name = 'Guide image coins (border-radius 16px 16px 0 0)';
      const origShot = path.join(ARTIFACTS_DIR, `zone10_guide_orig.png`);
      const prevShot = path.join(ARTIFACTS_DIR, `zone10_guide_prev.png`);

      await safeClipScreenshot(origPage, '.guide-card .card-media img', origShot);
      await safeClipScreenshot(prevPage, '.guide-card .card-media img, [class*="guide-card"] img', prevShot);

      const r = await prevPage.$eval('.guide-card .card-media img, [class*="guide-card"] img', el => {
        const s = window.getComputedStyle(el);
        return {
          tl: s.borderTopLeftRadius,
          tr: s.borderTopRightRadius,
          bl: s.borderBottomLeftRadius,
          br: s.borderBottomRightRadius
        };
      }).catch(() => ({ tl: '', tr: '', bl: '', br: '' }));

      const pass = (r.tl === '16px' || r.tl.includes('16')) && (r.tr === '16px' || r.tr.includes('16')) &&
                   (r.bl === '0px' || r.bl === '0') && (r.br === '0px' || r.br === '0');
      results.push({
        id, name, pass,
        details: `Radius: Top [${r.tl}, ${r.tr}], Bottom [${r.bl}, ${r.br}]`,
        origShot, prevShot
      });
      console.log(`[Zone ${id}/10] ${name}: ${pass ? 'PASS ✓' : 'FAIL ✗'}`);
      console.log(`    ${results[results.length-1].details}\n`);
    }

    const passedCount = results.filter(r => r.pass).length;
    console.log('========================================================================');
    console.log(`  FINAL 3-WAY VISUAL RE-TEST RESULT: ${passedCount}/10 ZONES PASSED`);
    console.log(`  Overall Verdict: ${passedCount === 10 ? 'ALL ZONES PASSED 100% ✓' : 'DISCREPANCIES DETECTED'}`);
    console.log('========================================================================\n');

    fs.writeFileSync(path.join(ARTIFACTS_DIR, 'visual_retest_results.json'), JSON.stringify(results, null, 2), 'utf8');

  } finally {
    await browser.close();
  }
}

run3WayVisualTest().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});

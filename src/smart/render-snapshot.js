/**
 * Elementor Virtual Render Snapshot Acquisition.
 * Codename: "Single-Pass + Verify" (Phase 3 - T3.2)
 * 
 * Captures computed styles, bounding rects, and text metrics from the rendered
 * Elementor preview HTML across viewports, mapped by stable data-sid.
 */

const { createBrowserSession } = require('../inspector/headless-driver');
const { VIEWPORTS } = require('./style-snapshot');

const STYLE_PROPS = [
  'display', 'position', 'top', 'right', 'bottom', 'left', 'zIndex',
  'flexDirection', 'flexWrap', 'justifyContent', 'alignItems', 'alignSelf',
  'flexGrow', 'flexShrink', 'flexBasis',
  'gap', 'rowGap', 'columnGap',
  'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
  'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'backgroundColor', 'backgroundImage',
  'color', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing',
  'textAlign', 'textTransform', 'whiteSpace',
  'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius',
  'borderTopWidth', 'borderTopStyle', 'borderTopColor',
  'borderRightWidth', 'borderRightStyle', 'borderRightColor',
  'borderBottomWidth', 'borderBottomStyle', 'borderBottomColor',
  'borderLeftWidth', 'borderLeftStyle', 'borderLeftColor',
  'boxShadow', 'opacity', 'overflow', 'cursor',
  'webkitTextFillColor', '-webkit-text-fill-color',
  'backgroundClip', 'webkitBackgroundClip', '-webkit-background-clip'
];

function inPageRenderExtract(STYLE_PROPS = []) {
  const results = { flat: {}, duplicateSids: [] };
  const seenSids = new Set();

  const allElements = document.querySelectorAll('[data-sid]');
  for (const el of allElements) {
    const sid = el.getAttribute('data-sid');
    if (!sid) continue;

    if (seenSids.has(sid)) {
      results.duplicateSids.push(sid);
    } else {
      seenSids.add(sid);
    }

    const widgetId = el.getAttribute('data-id');
    const elementType = el.getAttribute('data-element_type');
    const widgetType = el.getAttribute('data-widget_type');
    const outerRect = el.getBoundingClientRect();
    const outerStyle = window.getComputedStyle(el);

    // Identify target visual element for widgets
    let targetEl = el;
    if (widgetType === 'heading.default') {
      const h = el.querySelector('.elementor-heading-title');
      if (h) targetEl = h;
    } else if (widgetType === 'button.default') {
      const b = el.querySelector('.elementor-button');
      if (b) targetEl = b;
    } else if (widgetType === 'text-editor.default') {
      const t = el.querySelector('.elementor-text-editor');
      if (t) targetEl = t;
    } else if (widgetType === 'image.default') {
      const img = el.querySelector('img');
      if (img) targetEl = img;
    } else if (widgetType === 'icon.default') {
      const ic = el.querySelector('.elementor-icon');
      if (ic) targetEl = ic;
    }

    const targetRect = targetEl.getBoundingClientRect();
    const targetStyle = window.getComputedStyle(targetEl);

    // Text metrics
    let lineCount = 1;
    const lineWidths = [];
    try {
      let textTargetEl = targetEl;
      if (widgetType === 'text-editor.default') {
        const innerLeaf = targetEl.querySelector('p, h1, h2, h3, h4, h5, h6, span, div') || targetEl.firstElementChild;
        if (innerLeaf) textTargetEl = innerLeaf;
      } else if (widgetType === 'button.default') {
        const btnText = el.querySelector('.elementor-button-text');
        if (btnText) textTargetEl = btnText;
      }

      const range = document.createRange();
      range.selectNodeContents(textTargetEl);
      const clientRects = range.getClientRects();
      lineCount = clientRects.length || 1;
      for (let i = 0; i < clientRects.length; i++) {
        lineWidths.push(Math.round(clientRects[i].width));
      }
    } catch (_) {}

    const styles = {};
    const innerHasNoBorder = !targetStyle.borderTopWidth || targetStyle.borderTopWidth === '0px' || targetStyle.borderTopWidth === '0';
    for (const p of STYLE_PROPS) {
      const kebab = p.replace(/([A-Z])/g, '-$1').toLowerCase();
      let val = targetStyle[p] || (typeof targetStyle.getPropertyValue === 'function' ? targetStyle.getPropertyValue(kebab) : '');
      const outerVal = outerStyle[p] || (typeof outerStyle.getPropertyValue === 'function' ? outerStyle.getPropertyValue(kebab) : '');
      if (p === 'backgroundColor' && (val === 'rgba(0, 0, 0, 0)' || val === 'transparent')) {
        val = outerVal || val;
      } else if (p.startsWith('border') && innerHasNoBorder) {
        val = outerVal || val;
      }
      styles[p] = val || outerVal || '';
    }

    const fill = targetStyle.webkitTextFillColor || (typeof targetStyle.getPropertyValue === 'function' ? targetStyle.getPropertyValue('-webkit-text-fill-color') : '') ||
                 outerStyle.webkitTextFillColor || (typeof outerStyle.getPropertyValue === 'function' ? outerStyle.getPropertyValue('-webkit-text-fill-color') : '') || '';
    const clip = targetStyle.backgroundClip || (typeof targetStyle.getPropertyValue === 'function' ? targetStyle.getPropertyValue('background-clip') : '') ||
                 outerStyle.backgroundClip || (typeof outerStyle.getPropertyValue === 'function' ? outerStyle.getPropertyValue('background-clip') : '') || '';
    const webkitClip = targetStyle.webkitBackgroundClip || (typeof targetStyle.getPropertyValue === 'function' ? targetStyle.getPropertyValue('-webkit-background-clip') : '') ||
                       outerStyle.webkitBackgroundClip || (typeof outerStyle.getPropertyValue === 'function' ? outerStyle.getPropertyValue('-webkit-background-clip') : '') || '';
    const bgImg = (targetStyle.backgroundImage && targetStyle.backgroundImage !== 'none')
      ? targetStyle.backgroundImage
      : (outerStyle.backgroundImage && outerStyle.backgroundImage !== 'none' ? outerStyle.backgroundImage : (targetStyle.backgroundImage || outerStyle.backgroundImage || ''));

    styles.webkitTextFillColor = fill;
    styles['-webkit-text-fill-color'] = fill;
    styles.backgroundClip = clip;
    styles.webkitBackgroundClip = webkitClip;
    styles['-webkit-background-clip'] = webkitClip;
    styles['background-clip'] = clip;
    styles.backgroundImage = bgImg;

    let pseudo = null;
    try {
      const isPseudoActive = (c) => {
        if (c === null || c === undefined) return false;
        const s = String(c).trim();
        if (s.length === 0) return true;
        const lower = s.toLowerCase().replace(/['"]/g, '').trim();
        return lower !== 'none' && lower !== 'normal';
      };

      let beforeStyle = window.getComputedStyle(targetEl, '::before');
      let bContent = beforeStyle ? (beforeStyle.getPropertyValue('content') || beforeStyle.content) : 'none';
      if (!isPseudoActive(bContent) && targetEl !== el) {
        const outerBefore = window.getComputedStyle(el, '::before');
        const obContent = outerBefore ? (outerBefore.getPropertyValue('content') || outerBefore.content) : 'none';
        if (isPseudoActive(obContent)) {
          beforeStyle = outerBefore;
          bContent = obContent;
        }
      }

      let afterStyle = window.getComputedStyle(targetEl, '::after');
      let aContent = afterStyle ? (afterStyle.getPropertyValue('content') || afterStyle.content) : 'none';
      if (!isPseudoActive(aContent) && targetEl !== el) {
        const outerAfter = window.getComputedStyle(el, '::after');
        const oaContent = outerAfter ? (outerAfter.getPropertyValue('content') || outerAfter.content) : 'none';
        if (isPseudoActive(oaContent)) {
          afterStyle = outerAfter;
          aContent = oaContent;
        }
      }

      if (isPseudoActive(bContent) || isPseudoActive(aContent)) {
        pseudo = {};
        if (isPseudoActive(bContent)) {
          pseudo.before = {
            content: bContent,
            display: beforeStyle.getPropertyValue('display') || beforeStyle.display || '',
            position: beforeStyle.getPropertyValue('position') || beforeStyle.position || '',
            width: beforeStyle.getPropertyValue('width') || beforeStyle.width || '',
            height: beforeStyle.getPropertyValue('height') || beforeStyle.height || '',
            backgroundColor: beforeStyle.getPropertyValue('background-color') || beforeStyle.backgroundColor || '',
            color: beforeStyle.getPropertyValue('color') || beforeStyle.color || '',
            fontSize: beforeStyle.getPropertyValue('font-size') || beforeStyle.fontSize || ''
          };
        }
        if (isPseudoActive(aContent)) {
          pseudo.after = {
            content: aContent,
            display: afterStyle.getPropertyValue('display') || afterStyle.display || '',
            position: afterStyle.getPropertyValue('position') || afterStyle.position || '',
            width: afterStyle.getPropertyValue('width') || afterStyle.width || '',
            height: afterStyle.getPropertyValue('height') || afterStyle.height || '',
            backgroundColor: afterStyle.getPropertyValue('background-color') || afterStyle.backgroundColor || '',
            color: afterStyle.getPropertyValue('color') || afterStyle.color || '',
            fontSize: afterStyle.getPropertyValue('font-size') || afterStyle.fontSize || ''
          };
        }
      }
    } catch (_) {}

    let iconClass = null;
    const iEl = targetEl.querySelector('i') || el.querySelector('i') || (targetEl.tagName === 'I' ? targetEl : null);
    if (iEl) {
      iconClass = (typeof iEl.className === 'string' ? iEl.className : (iEl.getAttribute ? iEl.getAttribute('class') : '')) || null;
    }

    results.flat[sid] = {
      sid,
      widgetId,
      elementType,
      widgetType,
      rect: {
        x: Math.round(targetRect.left),
        y: Math.round(targetRect.top),
        w: Math.round(targetRect.width),
        h: Math.round(targetRect.height)
      },
      outerRect: {
        x: Math.round(outerRect.left),
        y: Math.round(outerRect.top),
        w: Math.round(outerRect.width),
        h: Math.round(outerRect.height)
      },
      styles,
      pseudo,
      iconClass,
      lineCount,
      lineWidths,
      text: (targetEl.innerText || targetEl.textContent || '').trim()
    };
  }

  return results;
}

/**
 * Captures rendered snapshot across 3 viewports.
 */
async function captureRenderSnapshot(renderHtml, options = {}) {
  const browser = await createBrowserSession();
  const snapshot = {
    timestamp: new Date().toISOString(),
    viewports: {}
  };

  try {
    const page = await browser.newPage();
    const desktopConfig = VIEWPORTS.desktop || { width: 1280, height: 800 };
    await page.setViewport({ width: desktopConfig.width, height: desktopConfig.height, deviceScaleFactor: 1 });
    await page.setContent(renderHtml, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});

    try {
      await page.evaluate(() => document.fonts ? document.fonts.ready : Promise.resolve());
      await page.addStyleTag({
        content: '*, *::before, *::after { transition: none !important; animation-duration: 0s !important; animation-delay: 0s !important; }'
      });
    } catch (_) {}

    for (const [vpKey, vpConfig] of Object.entries(VIEWPORTS)) {
      await page.setViewport({
        width: vpConfig.width,
        height: vpConfig.height,
        deviceScaleFactor: 1
      });
      await new Promise(res => setTimeout(res, 80));

      const vpResults = await page.evaluate(inPageRenderExtract, STYLE_PROPS);
      snapshot.viewports[vpKey] = vpResults;
    }

    await page.close();
  } finally {
    await browser.close();
  }

  return snapshot;
}

module.exports = {
  captureRenderSnapshot,
  STYLE_PROPS
};

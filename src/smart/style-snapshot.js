/**
 * Ground-Truth Style & Geometry Acquisition Layer.
 * Codename: "Single-Pass + Verify" (Phase 1 - T1.1)
 * 
 * Executes headless Chromium to extract the 100% W3C computed truth:
 * - 3 Viewports (Desktop: 1280x800, Tablet: 768x1024, Mobile: 370x667)
 * - Exact Bounding Rects & Geometry
 * - 45+ Computed Style Whitelist
 * - Text Metrics & Line Wrapping (via Range.getClientRects)
 * - Pseudo-state Deltas (:hover, :focus via CDP)
 * - Asset & Font Verification
 * - Console Error Capture
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createBrowserSession } = require('../inspector/headless-driver');

const VIEWPORTS = Object.freeze({
  desktop: { width: 1280, height: 800, name: 'desktop' },
  tablet: { width: 768, height: 1024, name: 'tablet' },
  mobile: { width: 370, height: 667, name: 'mobile' }
});

const CACHE_DIR = path.join(__dirname, '..', '..', '.cache');

function getCachePath(htmlContent) {
  const hash = crypto.createHash('sha256').update(htmlContent + ':v2_k9').digest('hex').slice(0, 16);
  return path.join(CACHE_DIR, `gt-${hash}.json`);
}

/**
 * Script evaluated inside page to walk document.body and extract metrics.
 */
function inPageExtract(options = {}) {
  const isDesktopPass = options.isDesktopPass;
  let sidCounter = 0;

  const results = {
    flat: {},
    assets: [],
    fonts: []
  };

  const body = document.body;
  if (!body) return results;

  const STYLE_PROPS = [
    'display', 'position', 'top', 'right', 'bottom', 'left', 'zIndex',
    'flexDirection', 'flexWrap', 'justifyContent', 'alignItems', 'alignSelf',
    'flexGrow', 'flexShrink', 'flexBasis', 'order',
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

  function walk(el, parentSid = null) {
    if (el.nodeType !== Node.ELEMENT_NODE) return;
    const tag = el.tagName.toLowerCase();
    if (['script', 'style', 'noscript', 'template', 'svg'].includes(tag) && tag !== 'svg') {
      return;
    }

    let sid = el.getAttribute('data-sid');
    if (!sid) {
      sid = `sid-${++sidCounter}`;
      el.setAttribute('data-sid', sid);
    }

    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);

    // Extract direct text preserving whitespace
    let directText = '';
    let hasDirectText = false;
    for (const child of el.childNodes) {
      if (child.nodeType === Node.TEXT_NODE && child.textContent) {
        directText += child.textContent;
        if (child.textContent.trim().length > 0) {
          hasDirectText = true;
        }
      }
    }

    // Text metrics
    let lineCount = 1;
    const lineWidths = [];
    if (hasDirectText) {
      try {
        const range = document.createRange();
        range.selectNodeContents(el);
        const clientRects = range.getClientRects();
        lineCount = clientRects.length || 1;
        for (let i = 0; i < clientRects.length; i++) {
          lineWidths.push(Math.round(clientRects[i].width));
        }
      } catch (_) {}
    }

    // Capture computed style values
    const styles = {};
    for (const p of STYLE_PROPS) {
      const kebab = p.replace(/([A-Z])/g, '-$1').toLowerCase();
      styles[p] = style[p] || (typeof style.getPropertyValue === 'function' ? (style.getPropertyValue(p) || style.getPropertyValue(kebab)) : '');
    }
    const fill = style.webkitTextFillColor || (typeof style.getPropertyValue === 'function' ? style.getPropertyValue('-webkit-text-fill-color') : '') || '';
    const clip = style.backgroundClip || (typeof style.getPropertyValue === 'function' ? style.getPropertyValue('background-clip') : '') || '';
    const webkitClip = style.webkitBackgroundClip || (typeof style.getPropertyValue === 'function' ? style.getPropertyValue('-webkit-background-clip') : '') || '';
    styles.webkitTextFillColor = fill;
    styles['-webkit-text-fill-color'] = fill;
    styles.backgroundClip = clip;
    styles.webkitBackgroundClip = webkitClip;
    styles['-webkit-background-clip'] = webkitClip;
    styles['background-clip'] = clip;

    // Interactive candidate detection
    const isInteractive = ['a', 'button', 'input', 'select', 'textarea', 'summary'].includes(tag) ||
      el.hasAttribute('onclick') ||
      el.getAttribute('role') === 'button' ||
      el.hasAttribute('tabindex') ||
      style.cursor === 'pointer';

    // D2: Capture pseudo-elements (::before, ::after)
    let pseudo = null;
    try {
      const beforeStyle = window.getComputedStyle(el, '::before');
      const bContent = beforeStyle ? (beforeStyle.getPropertyValue('content') || beforeStyle.content) : 'none';
      const afterStyle = window.getComputedStyle(el, '::after');
      const aContent = afterStyle ? (afterStyle.getPropertyValue('content') || afterStyle.content) : 'none';

      const isPseudoActive = (c) => {
        if (c === null || c === undefined) return false;
        const norm = String(c).trim();
        return norm !== '' && norm !== 'none' && norm !== 'normal';
      };

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

    // Task K1: Capture bounding rects of all immediate children (both elements and non-empty text nodes)
    const childRects = [];
    for (const child of el.childNodes) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const cr = child.getBoundingClientRect();
        if (cr.width > 0 || cr.height > 0) {
          childRects.push({
            type: 'element',
            tag: child.tagName.toLowerCase(),
            sid: child.getAttribute('data-sid') || null,
            rect: {
              x: Math.round(cr.x),
              y: Math.round(cr.y),
              w: Math.round(cr.width),
              h: Math.round(cr.height)
            }
          });
        }
      } else if (child.nodeType === Node.TEXT_NODE && child.textContent && child.textContent.trim().length > 0) {
        try {
          const range = document.createRange();
          range.selectNode(child);
          const tr = range.getBoundingClientRect();
          if (tr.width > 0 || tr.height > 0) {
            childRects.push({
              type: 'text',
              text: child.textContent.trim(),
              rect: {
                x: Math.round(tr.x),
                y: Math.round(tr.y),
                w: Math.round(tr.width),
                h: Math.round(tr.height)
              }
            });
          }
        } catch (_) {}
      }
    }

    const nodeData = {
      sid,
      parentSid,
      tag,
      id: el.id || null,
      className: typeof el.className === 'string' ? el.className : (el.className?.baseVal || ''),
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        w: Math.round(rect.width),
        h: Math.round(rect.height)
      },
      childRects,
      directText,
      fullText: (el.innerText || el.textContent || '').trim(),
      hasDirectText,
      lineCount,
      lineWidths,
      styles,
      isInteractive,
      pseudo
    };

    results.flat[sid] = nodeData;

    // Track assets
    if (tag === 'img') {
      results.assets.push({
        sid,
        src: el.currentSrc || el.src || '',
        complete: el.complete,
        naturalWidth: el.naturalWidth,
        naturalHeight: el.naturalHeight,
        rect: nodeData.rect
      });
    }

    // Recurse into children
    for (const child of el.children) {
      walk(child, sid);
    }
  }

  walk(body, null);

  // Check unique fonts
  const fontFamilies = new Set();
  Object.values(results.flat).forEach(n => {
    if (n.styles.fontFamily) {
      const firstFamily = n.styles.fontFamily.split(',')[0].replace(/['"]/g, '').trim();
      if (firstFamily) fontFamilies.add(firstFamily);
    }
  });

  results.fonts = Array.from(fontFamilies).map(f => ({
    family: f,
    isReady: document.fonts ? document.fonts.check(`16px "${f}"`) : true
  }));

  return results;
}

/**
 * Captures ground-truth snapshot at 3 viewports.
 * @param {string} htmlPathOrContent - File path or raw HTML string
 * @param {Object} options
 */
async function captureGroundTruth(htmlPathOrContent, options = {}) {
  const refresh = options.refresh || process.argv.includes('--refresh');

  let rawHtml = '';
  let isFilePath = false;
  if (fs.existsSync(htmlPathOrContent)) {
    rawHtml = fs.readFileSync(htmlPathOrContent, 'utf8');
    isFilePath = true;
  } else {
    rawHtml = String(htmlPathOrContent);
  }

  const cachePath = getCachePath(rawHtml);
  if (!refresh && fs.existsSync(cachePath)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      return cached;
    } catch (_) {}
  }

  const browser = await createBrowserSession();
  const consoleErrors = [];
  let annotatedHtml = '';

  const snapshot = {
    timestamp: new Date().toISOString(),
    viewports: {},
    assets: [],
    fonts: [],
    consoleErrors: []
  };

  try {
    const page = await browser.newPage();

    // Listen for runtime errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', err => {
      consoleErrors.push(err.message);
    });

    let desktopSidHtml = null;

    for (const vpKey of ['desktop', 'tablet', 'mobile']) {
      const vp = VIEWPORTS[vpKey];
      await page.setViewport({ width: vp.width, height: vp.height });

      if (vpKey === 'desktop') {
        await page.setContent(rawHtml, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
        try {
          await page.evaluate(() => document.fonts ? document.fonts.ready : Promise.resolve());
          await page.addStyleTag({
            content: '*, *::before, *::after { transition: none !important; animation-duration: 0s !important; animation-delay: 0s !important; }'
          });
        } catch (_) {}
        await new Promise(res => setTimeout(res, 200));
      } else {
        await new Promise(res => setTimeout(res, 100));
      }

      const vpResults = await page.evaluate(inPageExtract, { isDesktopPass: vpKey === 'desktop' });

      if (vpKey === 'desktop') {
        desktopSidHtml = await page.content();
        annotatedHtml = await page.evaluate(() => document.body.innerHTML);
        snapshot.assets = vpResults.assets;
        snapshot.fonts = vpResults.fonts;

        // Capture pseudo-state deltas for interactive candidates via CDP
        try {
          const client = await page.target().createCDPSession();
          const interactiveSids = Object.values(vpResults.flat).filter(n => n.isInteractive).map(n => n.sid);

          for (const sid of interactiveSids.slice(0, 30)) { // Bound to top 30 interactive controls
            const elHandle = await page.$(`[data-sid="${sid}"]`);
            if (!elHandle) continue;

            try {
              const remoteObj = elHandle.remoteObject();
              if (remoteObj && remoteObj.objectId) {
                await client.send('DOM.enable');
                await client.send('CSS.enable');
                const { nodeId } = await client.send('DOM.requestNode', { objectId: remoteObj.objectId });
                if (nodeId) {
                  await client.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['hover'] });
                  const hoverStyles = await page.evaluate(el => {
                    const s = window.getComputedStyle(el);
                    return {
                      color: s.color,
                      backgroundColor: s.backgroundColor,
                      borderColor: s.borderColor,
                      boxShadow: s.boxShadow
                    };
                  }, elHandle);

                  // Compute delta
                  const base = vpResults.flat[sid].styles;
                  const delta = {};
                  if (hoverStyles.color !== base.color) delta.color = hoverStyles.color;
                  if (hoverStyles.backgroundColor !== base.backgroundColor) delta.backgroundColor = hoverStyles.backgroundColor;
                  if (hoverStyles.borderColor !== base.borderTopColor) delta.borderColor = hoverStyles.borderColor;
                  if (hoverStyles.boxShadow !== base.boxShadow && hoverStyles.boxShadow !== 'none') delta.boxShadow = hoverStyles.boxShadow;

                  if (Object.keys(delta).length > 0) {
                    vpResults.flat[sid].pseudo = { ...(vpResults.flat[sid].pseudo || {}), hover: delta };
                  }
                  await client.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
                }
              }
            } catch (_) {}
          }
        } catch (_) {}
      }

      snapshot.viewports[vpKey] = vpResults;
    }

    snapshot.consoleErrors = consoleErrors;
    snapshot.annotatedHtml = annotatedHtml;

    // Cache snapshot
    try {
      if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
      fs.writeFileSync(cachePath, JSON.stringify(snapshot, null, 2), 'utf8');
    } catch (_) {}

  } finally {
    await browser.close();
  }

  return snapshot;
}

module.exports = {
  captureGroundTruth,
  VIEWPORTS
};

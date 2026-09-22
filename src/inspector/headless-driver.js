/**
 * Headless Browser Driver using puppeteer-core with system Chrome / Edge.
 * Provides zero-dependency browser rendering, screenshot capture, DOM metrics extraction,
 * and dynamic state interaction simulation.
 */
const fs = require('fs');
const path = require('path');
let _puppeteer = null;
async function getPuppeteer() {
  if (!_puppeteer) {
    const mod = await import('puppeteer-core');
    _puppeteer = mod.default || mod;
  }
  return _puppeteer;
}

const KNOWN_BROWSER_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA + '\\Microsoft\\Edge\\Application\\msedge.exe'
];

function getBrowserExecutablePath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  for (const candidate of KNOWN_BROWSER_PATHS) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error('No system Chrome or Edge executable detected. Please ensure Chrome or Edge is installed.');
}

async function createBrowserSession(options = {}) {
  const executablePath = getBrowserExecutablePath();
  const puppeteerInstance = await getPuppeteer();
  const browser = await puppeteerInstance.launch({
    executablePath,
    headless: 'new',
    protocolTimeout: options.protocolTimeout || 120000,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--font-render-hinting=none'
    ]
  });

  return browser;
}

async function renderAndCapture(browser, htmlContent, options = {}) {
  const page = await browser.newPage();
  const width = options.width || 1280;
  const height = options.height || 800;

  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.setContent(htmlContent, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {
    // If external fonts timeout, proceed with DOM ready
  });

  // Brief pause for layout stabilization and CSS font loading
  await new Promise(r => setTimeout(r, 200));

  let screenshotBuffer = null;
  if (!options.skipScreenshot) {
    const screenshotOptions = { fullPage: options.fullPage !== false };
    if (options.outputPath) {
      screenshotOptions.path = options.outputPath;
    }
    screenshotBuffer = await page.screenshot(screenshotOptions);
  }

  return { page, screenshotBuffer };
}

async function extractDomMetrics(page) {
  return await page.evaluate(() => {
    const results = [];
    const elements = document.querySelectorAll('*');

    let nodeSeq = 0;
    elements.forEach(el => {
      // Filter out meta, script, style, head, html, body tags
      const tag = el.tagName.toLowerCase();
      if (['html', 'head', 'meta', 'link', 'script', 'style', 'noscript', 'title'].includes(tag)) {
        return;
      }
      if (!el.getAttribute('data-dom-id')) {
        el.setAttribute('data-dom-id', `node-${++nodeSeq}`);
      }

      const rect = el.getBoundingClientRect();
      // Skip completely offscreen or zero-dimension invisible elements
      if (rect.width === 0 && rect.height === 0) return;

      const style = window.getComputedStyle(el);
      const text = (el.innerText || el.textContent || '').trim();

      // Resolve effective background color by climbing parent tree if current element background is transparent
      let effectiveBg = style.backgroundColor;
      if (!effectiveBg || effectiveBg === 'rgba(0, 0, 0, 0)' || effectiveBg === 'transparent') {
        let parent = el.parentElement;
        while (parent && parent !== document.documentElement) {
          const pStyle = window.getComputedStyle(parent);
          if (pStyle.backgroundColor && pStyle.backgroundColor !== 'rgba(0, 0, 0, 0)' && pStyle.backgroundColor !== 'transparent') {
            effectiveBg = pStyle.backgroundColor;
            break;
          }
          parent = parent.parentElement;
        }
      }
      const hasDirectText = Array.from(el.childNodes).some(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim().length > 0);
      let lineCount = 1;
      if (hasDirectText && text.length > 0) {
        try {
          const range = document.createRange();
          range.selectNodeContents(el);
          const clientRects = range.getClientRects();
          lineCount = clientRects.length || 1;
        } catch (_) {}
      }

      // DOM path calculation for structural spatial topology
      let domPath = '';
      let curr = el;
      while (curr && curr !== document.body && curr !== document.documentElement) {
        let index = 0;
        let sib = curr.previousElementSibling;
        while (sib) {
          if (sib.tagName === curr.tagName) index++;
          sib = sib.previousElementSibling;
        }
        domPath = `${curr.tagName.toLowerCase()}[${index}]${domPath ? '>' + domPath : ''}`;
        curr = curr.parentElement;
      }

      // Elementor metadata mapping
      const closestElementor = el.closest('[data-id]');
      const dataId = closestElementor ? closestElementor.getAttribute('data-id') : null;
      const domNodeId = el.getAttribute('data-dom-id') || (closestElementor ? closestElementor.getAttribute('data-dom-id') : null);
      const elType = closestElementor ? closestElementor.getAttribute('data-element_type') : null;
      const closestWidget = el.closest('.elementor-widget');
      const widgetType = closestWidget ? (closestWidget.getAttribute('data-widget_type') || '').split('.')[0] : null;

      let parentElementorId = null;
      if (closestElementor && closestElementor.parentElement) {
        const parentEl = closestElementor.parentElement.closest('[data-id]');
        if (parentEl) {
          parentElementorId = parentEl.getAttribute('data-id');
        }
      }

      // Outer Component Envelope (W3C Bounding Box for multi-layer Elementor widgets)
      let envelopeRect = null;
      const envelopeEl = closestWidget || closestElementor;
      if (envelopeEl) {
        const envR = envelopeEl.getBoundingClientRect();
        envelopeRect = {
          x: Math.round(envR.x),
          y: Math.round(envR.y),
          width: Math.round(envR.width),
          height: Math.round(envR.height)
        };
      }

      results.push({
        tag,
        id: el.id || null,
        domNodeId,
        domPath,
        dataId,
        parentElementorId,
        elType,
        widgetType,
        envelopeRect,
        isEnvelopeRoot: el === envelopeEl,
        className: typeof el.className === 'string' ? el.className : (el.className?.baseVal || ''),
        parentTag: el.parentElement ? el.parentElement.tagName.toLowerCase() : null,
        parentClass: el.parentElement ? (typeof el.parentElement.className === 'string' ? el.parentElement.className : (el.parentElement.className?.baseVal || '')) : '',
        text: text.slice(0, 100),
        fullText: text,
        words: text.split(/\s+/).filter(Boolean),
        hasDirectText,
        lineCount,
        isBlock: ['block', 'flex', 'grid'].includes(style.display) && rect.width >= 200,
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        },
        styles: {
          color: style.color,
          backgroundColor: effectiveBg || 'rgba(0, 0, 0, 0)',
          rawBackgroundColor: style.backgroundColor,
          backgroundImage: style.backgroundImage,
          boxShadow: style.boxShadow,
          borderRadius: style.borderRadius,
          border: style.border,
          borderTopWidth: parseFloat(style.borderTopWidth) || 0,
          borderRightWidth: parseFloat(style.borderRightWidth) || 0,
          borderBottomWidth: parseFloat(style.borderBottomWidth) || 0,
          borderLeftWidth: parseFloat(style.borderLeftWidth) || 0,
          borderTopStyle: style.borderTopStyle,
          borderTopColor: style.borderTopColor,
          borderTopLeftRadius: parseFloat(style.borderTopLeftRadius) || 0,
          borderTopRightRadius: parseFloat(style.borderTopRightRadius) || 0,
          borderBottomRightRadius: parseFloat(style.borderBottomRightRadius) || 0,
          borderBottomLeftRadius: parseFloat(style.borderBottomLeftRadius) || 0,
          paddingTop: parseFloat(style.paddingTop) || 0,
          paddingRight: parseFloat(style.paddingRight) || 0,
          paddingBottom: parseFloat(style.paddingBottom) || 0,
          paddingLeft: parseFloat(style.paddingLeft) || 0,
          marginTop: parseFloat(style.marginTop) || 0,
          marginRight: parseFloat(style.marginRight) || 0,
          marginBottom: parseFloat(style.marginBottom) || 0,
          marginLeft: parseFloat(style.marginLeft) || 0,
          rowGap: parseFloat(style.rowGap) || 0,
          columnGap: parseFloat(style.columnGap) || 0,
          fontSize: parseFloat(style.fontSize) || 0,
          fontWeight: style.fontWeight,
          fontFamily: style.fontFamily,
          lineHeight: style.lineHeight,
          letterSpacing: style.letterSpacing,
          textAlign: style.textAlign,
          display: style.display,
          flexDirection: style.flexDirection,
          justifyContent: style.justifyContent,
          alignItems: style.alignItems,
          flexWrap: style.flexWrap,
          opacity: parseFloat(style.opacity) !== undefined ? parseFloat(style.opacity) : 1,
          visibility: style.visibility,
          minHeight: parseFloat(style.minHeight) || 0,
          maxHeight: parseFloat(style.maxHeight) || 0,
          minWidth: parseFloat(style.minWidth) || 0,
          maxWidth: parseFloat(style.maxWidth) || 0,
          before: (() => {
            const bStyle = window.getComputedStyle(el, '::before');
            const hasB = bStyle && bStyle.content && bStyle.content !== 'none' && bStyle.content !== 'normal' && bStyle.content !== '""' && bStyle.content !== '""';
            const width = parseFloat(bStyle?.width) || 0;
            const height = parseFloat(bStyle?.height) || 0;
            if (width > 0 || height > 0 || (bStyle && bStyle.content && bStyle.content !== 'none' && bStyle.content !== 'normal')) {
              return {
                content: bStyle.content,
                width,
                height,
                borderRadius: bStyle.borderRadius,
                backgroundColor: bStyle.backgroundColor,
                boxShadow: bStyle.boxShadow
              };
            }
            return null;
          })(),
          after: (() => {
            const aStyle = window.getComputedStyle(el, '::after');
            const width = parseFloat(aStyle?.width) || 0;
            const height = parseFloat(aStyle?.height) || 0;
            if (width > 0 || height > 0 || (aStyle && aStyle.content && aStyle.content !== 'none' && aStyle.content !== 'normal')) {
              return {
                content: aStyle.content,
                width,
                height,
                borderRadius: aStyle.borderRadius,
                backgroundColor: aStyle.backgroundColor
              };
            }
            return null;
          })()
        }
      });
    });

    return results;
  });
}

async function detectAndTriggerInteraction(page, explicitSelector = null) {
  if (explicitSelector) {
    try {
      const target = await page.$(explicitSelector);
      if (target) {
        await page.evaluate(el => el.click(), target);
        await new Promise(r => setTimeout(r, 300));
        return { clickedSelector: explicitSelector, success: true };
      }
    } catch (_) {}
    return { success: false };
  }

  // Autonomous Discovery: discover candidate interactive triggers across all patterns
  const candidateSelectors = await page.evaluate(() => {
    const list = [];

    // 1. Form inputs & native interactive controls
    document.querySelectorAll('input[type="checkbox"], input[type="radio"], input[type="range"], select, summary').forEach(el => {
      if (el.id) list.push('#' + el.id);
      else if (el.className && typeof el.className === 'string') list.push('.' + el.className.trim().split(/\s+/)[0]);
      else list.push(el.tagName.toLowerCase());
    });

    // 2. Semantic roles and data triggers (tabs, toggles, filters, disclosures, modals)
    document.querySelectorAll('[role="tab"], [data-tab], [data-toggle], [data-filter], [data-billing], [aria-expanded], [data-modal]').forEach(el => {
      if (el.id) list.push('#' + el.id);
      else if (el.className && typeof el.className === 'string') list.push('.' + el.className.trim().split(/\s+/)[0]);
    });

    // 3. Custom switches, toggles, and interactive trigger headers
    document.querySelectorAll('.toggle-switch, .switch, .toggle-btn, .billing-toggle, .trigger, [aria-expanded], [data-toggle]').forEach(el => {
      if (el.id) list.push('#' + el.id);
      else if (el.className && typeof el.className === 'string') list.push('.' + el.className.trim().split(/\s+/)[0]);
    });

    return Array.from(new Set(list));
  });

  for (const selector of candidateSelectors) {
    try {
      const target = await page.$(selector);
      if (!target) continue;

      // Test with MutationObserver: only validate if clicking produces real visual / DOM state change
      const didMutate = await page.evaluate(async (sel) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        let mutated = false;
        const observer = new MutationObserver(() => { mutated = true; });
        observer.observe(document.body, { attributes: true, childList: true, subtree: true, characterData: true });
        el.click();
        await new Promise(r => setTimeout(r, 250));
        observer.disconnect();
        return mutated;
      }, selector);

      if (didMutate) {
        return { clickedSelector: selector, success: true };
      }
    } catch (_) {}
  }

  return { success: false };
}

function findNodeAtCoordinates(metrics, x, y) {
  if (!Array.isArray(metrics)) return null;
  const hits = metrics.filter(m => 
    m.dataId &&
    x >= m.rect.x && x <= m.rect.x + m.rect.width &&
    y >= m.rect.y && y <= m.rect.y + m.rect.height
  );
  if (hits.length === 0) return null;
  hits.sort((a, b) => (a.rect.width * a.rect.height) - (b.rect.width * b.rect.height));
  return hits[0];
}

function buildNodeSpatialIndex(metrics) {
  if (!Array.isArray(metrics)) return [];
  const map = new Map();
  metrics.forEach(m => {
    if (m.dataId && !map.has(m.dataId)) {
      map.set(m.dataId, {
        id: m.dataId,
        elType: m.elType,
        widgetType: m.widgetType,
        tag: m.tag,
        className: m.className,
        rect: m.rect,
        text: m.text?.slice(0, 40)
      });
    }
  });
  return Array.from(map.values());
}

async function captureSemanticCrops(page, maxCrops = 6) {
  const cropRects = await page.evaluate((limit) => {
    const list = [];
    const candidates = document.querySelectorAll(
      '.toggle-switch, .switch, [role="tablist"], .elementor-widget-button, button, a.btn, [class*="btn"], .pricing-card, .card, .tier, header, .header, .pill, .badge, .elementor-widget'
    );
    for (const el of candidates) {
      const rect = el.getBoundingClientRect();
      if (rect.width >= 35 && rect.height >= 18 && rect.width <= 1200 && rect.height <= 800) {
        const x = Math.max(0, Math.floor(rect.x));
        const y = Math.max(0, Math.floor(rect.y));
        const width = Math.min(1280 - x, Math.ceil(rect.width));
        const height = Math.min(1200, Math.ceil(rect.height));
        if (width >= 35 && height >= 18) {
          const already = list.some(existing => Math.abs(existing.x - x) < 10 && Math.abs(existing.y - y) < 10);
          if (!already) {
            list.push({ x, y, width, height });
          }
        }
      }
      if (list.length >= limit) break;
    }
    return list;
  }, maxCrops);

  const crops = [];
  for (const r of cropRects) {
    try {
      const buf = await page.screenshot({
        clip: { x: r.x, y: r.y, width: r.width, height: r.height }
      });
      crops.push({ rect: r, buffer: buf });
    } catch (_) {}
  }
  return crops;
}

module.exports = {
  createBrowserSession,
  renderAndCapture,
  extractDomMetrics,
  captureSemanticCrops,
  detectAndTriggerInteraction,
  getBrowserExecutablePath,
  findNodeAtCoordinates,
  buildNodeSpatialIndex
};

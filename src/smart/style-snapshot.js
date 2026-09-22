/**
 * Ground-Truth Style & Geometry Acquisition Layer.
 * Codename: "Single-Pass + Verify" (Phase 1 - T1.1 / Block 8.1 Exhaustive)
 * 
 * Executes headless Chromium to extract the 100% W3C computed truth:
 * - 3 Viewports (Desktop: 1280x800, Tablet: 768x1024, Mobile: 370x667)
 * - Exact Bounding Rects & Geometry
 * - Exhaustive Computed Styles (Chromium getComputedStyle enumeration, zero whitelist dependence)
 * - CSS Custom Properties discovery & resolution (--*)
 * - Root Canvas Truth (html and body per viewport)
 * - Materially Active Pseudo-Element Capture (::before, ::after)
 * - Style Interning & Collision-Safe Style Dictionary
 * - Deterministic Motion Freezing (Web Animations API & Phase A/B capture)
 * - Text Metrics & Line Wrapping
 * - Exhaustive Pseudo-state Capture (:hover across viewports via CDP)
 * - Asset & Font Verification
 * - Independent DOM-based Coverage Accounting
 * - 100% Backward Compatible legacy styles projection
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createBrowserSession } = require('../inspector/headless-driver');

const GROUND_TRUTH_SCHEMA_VERSION = '8.1.0';

const VIEWPORTS = Object.freeze({
  desktop: { width: 1280, height: 800, name: 'desktop' },
  tablet: { width: 768, height: 1024, name: 'tablet' },
  mobile: { width: 370, height: 667, name: 'mobile' }
});

const CACHE_DIR = path.join(__dirname, '..', '..', '.cache');

function getCachePath(htmlContent) {
  const hash = crypto.createHash('sha256').update(htmlContent + ':v8_1_k10_final').digest('hex').slice(0, 16);
  return path.join(CACHE_DIR, `gt-${hash}.json`);
}

/**
 * Universal element eligibility contract for Ground Truth computed-style capture.
 * Used identically for capture, coverage denominator, missing-style detection, and metrics.
 * 
 * @param {Object} node - DOM Element or AST node
 * @returns {boolean}
 */
function isEligibleForComputedStyleCapture(node) {
  if (!node) return false;
  const nodeType = node.nodeType;
  if (nodeType !== undefined && nodeType !== 1) {
    return false; // Rejects text nodes, comments, document nodes
  }

  const rawTag = node.tagName || node.tag || '';
  const tag = String(rawTag).toLowerCase();
  if (!tag) return false;

  // Metadata, script, style, and template elements are not eligible for visual styling
  const INELIGIBLE_TAGS = new Set([
    'head', 'meta', 'link', 'script', 'style', 'template', 'noscript', 'title', 'base'
  ]);

  return !INELIGIBLE_TAGS.has(tag);
}

/**
 * Node-side helper to canonicalize, hash, and intern a style map into a dictionary.
 * Also exported for controlled test seam (e.g., collision testing).
 * 
 * @param {Object} styleMap 
 * @param {Object} dictionary 
 * @param {string|null} [forcedHash=null] 
 * @returns {Object}
 */
function internStyleMap(styleMap, dictionary, forcedHash = null) {
  if (!styleMap || typeof styleMap !== 'object') {
    throw new Error('internStyleMap: styleMap must be an object');
  }
  if (!dictionary || typeof dictionary !== 'object') {
    throw new Error('internStyleMap: dictionary must be an object');
  }

  const keys = Object.keys(styleMap).sort();
  let hashInput = '';
  const canonical = {};
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const v = styleMap[k];
    canonical[k] = v;
    hashInput += `${k}:${v}\n`;
  }

  const baseHash = forcedHash || crypto.createHash('sha256').update(hashInput).digest('hex');

  let ref = baseHash;
  let collisionIdx = 0;
  while (dictionary[ref]) {
    const existing = dictionary[ref];
    let matches = true;
    const exKeys = Object.keys(existing);
    if (exKeys.length !== keys.length) {
      matches = false;
    } else {
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (existing[k] !== canonical[k]) {
          matches = false;
          break;
        }
      }
    }
    if (matches) break; // Identical style map already exists
    collisionIdx++;
    ref = `${baseHash}_c${collisionIdx}`;
  }

  if (!dictionary[ref]) {
    dictionary[ref] = canonical;
  }

  return {
    styleHash: baseHash,
    computedStyleRef: ref,
    stylePropertyCount: keys.length,
    canonical
  };
}

/**
 * Script evaluated inside page to walk DOM, discover custom properties,
 * enumerate all computed styles from Chromium, and build the interned dictionary.
 */
function inPageExtract(options = {}) {
  const isDesktopPass = Boolean(options.isDesktopPass);
  let sidCounter = 0;

  const results = {
    flat: {},
    styleDictionary: {},
    canvas: {
      html: null,
      body: null
    },
    customPropertyDiscovery: {
      status: 'COMPLETE',
      discoveredNameCount: 0,
      inaccessibleStylesheetCount: 0,
      warnings: []
    },
    captureAccounting: {
      eligibleElementSids: [],
      attemptedElementSids: [],
      capturedElementSids: [],
      missingComputedStyleSids: [],
      duplicateSidRecords: []
    },
    unsupportedRegions: [],
    captureErrors: [],
    assets: [],
    fonts: []
  };

  const docEl = document.documentElement;
  const body = document.body;
  if (!docEl || !body) return results;

  // Track seen SIDs to detect duplicate, overwritten, or malformed SIDs
  const seenSids = new Map();

  function recordSid(sid, el) {
    const tag = el.tagName.toLowerCase();
    if (seenSids.has(sid)) {
      results.captureAccounting.duplicateSidRecords.push({
        sid,
        tag,
        existingTag: seenSids.get(sid)
      });
    } else {
      seenSids.set(sid, tag);
    }
  }

  // Shared universal eligibility rule (Section 1)
  const isEligibleElement = options.eligibilityFnStr
    ? (new Function('return ' + options.eligibilityFnStr)())
    : function(node) {
        if (!node) return false;
        if (node.nodeType !== undefined && node.nodeType !== 1) return false;
        const rawTag = node.tagName || node.tag || '';
        const tag = String(rawTag).toLowerCase();
        if (!tag) return false;
        const INELIGIBLE = new Set(['head', 'meta', 'link', 'script', 'style', 'template', 'noscript', 'title', 'base']);
        return !INELIGIBLE.has(tag);
      };

  // 1. Independent DOM Inventory Pass (Section 1)
  function enumerateLiveDomInventory() {
    const eligibleSids = [];
    const visited = new Set();

    function visit(el) {
      if (!el || el.nodeType !== 1 || visited.has(el)) return;
      visited.add(el);

      if (isEligibleElement(el)) {
        let sid = el.getAttribute('data-sid');
        if (!sid) {
          if (el === docEl) {
            sid = 'sid-0';
          } else {
            sid = `sid-${++sidCounter}`;
          }
          el.setAttribute('data-sid', sid);
        }
        eligibleSids.push(sid);
      }

      // Open shadow DOM children
      if (el.shadowRoot && el.shadowRoot.mode === 'open') {
        for (const child of el.shadowRoot.children) {
          visit(child);
        }
      }

      // Same-origin iframe document
      const tag = el.tagName.toLowerCase();
      if (tag === 'iframe') {
        try {
          if (el.contentWindow) {
            const dummy = el.contentWindow.location.href;
          }
          const idoc = el.contentDocument;
          if (idoc && idoc.body) {
            for (const child of idoc.body.children) {
              visit(child);
            }
          }
        } catch (_) {}
      }

      // Light DOM children
      for (const child of el.children) {
        visit(child);
      }
    }

    if (docEl) {
      visit(docEl);
    }

    return eligibleSids;
  }

  // Pre-populate independent live DOM inventory (denominator)
  results.captureAccounting.eligibleElementSids = enumerateLiveDomInventory();

  // Synchronous pure JS SHA-256 for browser-side deterministic interning
  function sha256Sync(ascii) {
    function rightRotate(value, amount) {
      return (value >>> amount) | (value << (32 - amount));
    }
    const mathPow = Math.pow;
    const maxWord = mathPow(2, 32);
    const words = [];
    const asciiBitLength = ascii.length * 8;
    let hash = [];
    const k = [];
    let primeCounter = 0;
    const isComposite = {};
    for (let candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (let i = 0; i < 313; i += candidate) isComposite[i] = candidate;
        hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
        k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      }
    }
    hash = hash.slice(0, 8);
    for (let i = 0; i < ascii.length; i++) {
      words[i >> 2] |= (ascii.charCodeAt(i) & 0xff) << (24 - (i % 4) * 8);
    }
    words[asciiBitLength >> 5] |= 0x80 << (24 - (asciiBitLength % 32));
    words[(((asciiBitLength + 64) >> 9) << 4) + 15] = asciiBitLength;
    for (let i = 0; i < words.length; i += 16) {
      const w = words.slice(i, i + 16);
      const oldHash = hash.slice();
      for (let j = 0; j < 64; j++) {
        const w15 = w[j - 15];
        const w2 = w[j - 2];
        const a = hash[0];
        const e = hash[4];
        const temp1 = hash[7]
          + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
          + ((e & hash[5]) ^ ((~e) & hash[6]))
          + k[j]
          + (w[j] = (j < 16) ? (w[j] || 0) : (
              w[j - 16]
              + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
              + w[j - 7]
              + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))
            ) | 0
          );
        const temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
          + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(temp1 + temp2) | 0].concat(hash.slice(0, 7));
        hash[4] = (hash[4] + temp1) | 0;
      }
      for (let j = 0; j < 8; j++) hash[j] = (hash[j] + oldHash[j]) | 0;
    }
    let result = '';
    for (let i = 0; i < 8; i++) {
      for (let j = 3; j >= 0; j--) {
        const b = (hash[i] >> (j * 8)) & 255;
        result += (b < 16 ? '0' : '') + b.toString(16);
      }
    }
    return result;
  }

  // Multi-tiered CSS Custom Property Discovery
  const customPropNames = new Set();
  let inaccessibleCount = 0;

  function walkCssRules(rules) {
    if (!rules) return;
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      if (rule.style) {
        for (let j = 0; j < rule.style.length; j++) {
          const p = rule.style.item(j);
          if (p && p.startsWith('--')) {
            customPropNames.add(p);
          }
        }
      }
      if (rule.cssRules) {
        walkCssRules(rule.cssRules); // Handles nested @media, @supports, @layer, @container
      }
    }
  }

  try {
    const sheets = document.styleSheets || [];
    for (let i = 0; i < sheets.length; i++) {
      try {
        walkCssRules(sheets[i].cssRules);
      } catch (secErr) {
        inaccessibleCount++;
        results.customPropertyDiscovery.warnings.push(`Inaccessible stylesheet [index ${i}]: ${secErr.message}`);
      }
    }
  } catch (_) {}

  if (document.adoptedStyleSheets) {
    try {
      for (const sheet of document.adoptedStyleSheets) {
        try {
          walkCssRules(sheet.cssRules);
        } catch (_) {}
      }
    } catch (_) {}
  }

  // Canonicalize style map, hash deterministically, and intern into styleDictionary
  function internComputedStyle(styleObj) {
    const keys = Object.keys(styleObj).sort();
    let hashInput = '';
    const canonical = {};
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const v = styleObj[k];
      canonical[k] = v;
      hashInput += `${k}:${v}\n`;
    }
    const baseHash = sha256Sync(hashInput);

    // Collision check: verify key-value equality before reusing dictionary entry
    let ref = baseHash;
    let collisionIdx = 0;
    while (results.styleDictionary[ref]) {
      const existing = results.styleDictionary[ref];
      let matches = true;
      const exKeys = Object.keys(existing);
      if (exKeys.length !== keys.length) {
        matches = false;
      } else {
        for (let i = 0; i < keys.length; i++) {
          const k = keys[i];
          if (existing[k] !== canonical[k]) {
            matches = false;
            break;
          }
        }
      }
      if (matches) break; // Identical style map
      collisionIdx++;
      ref = `${baseHash}_c${collisionIdx}`;
    }

    if (!results.styleDictionary[ref]) {
      results.styleDictionary[ref] = canonical;
    }

    return {
      styleHash: baseHash,
      computedStyleRef: ref,
      stylePropertyCount: keys.length,
      canonical
    };
  }

  // Legacy STYLE_PROPS maintained exclusively for backwards-compatible projection
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

  function extractLegacyStyles(computed) {
    const styles = {};
    for (const p of STYLE_PROPS) {
      const kebab = p.replace(/([A-Z])/g, '-$1').toLowerCase();
      styles[p] = computed[p] || (typeof computed.getPropertyValue === 'function' ? (computed.getPropertyValue(p) || computed.getPropertyValue(kebab)) : '');
    }
    const fill = computed.webkitTextFillColor || (typeof computed.getPropertyValue === 'function' ? computed.getPropertyValue('-webkit-text-fill-color') : '') || '';
    const clip = computed.backgroundClip || (typeof computed.getPropertyValue === 'function' ? computed.getPropertyValue('background-clip') : '') || '';
    const webkitClip = computed.webkitBackgroundClip || (typeof computed.getPropertyValue === 'function' ? computed.getPropertyValue('-webkit-background-clip') : '') || '';
    styles.webkitTextFillColor = fill;
    styles['-webkit-text-fill-color'] = fill;
    styles.backgroundClip = clip;
    styles.webkitBackgroundClip = webkitClip;
    styles['-webkit-background-clip'] = webkitClip;
    styles['background-clip'] = clip;
    return styles;
  }

  function extractFullComputedStyle(el) {
    const computed = window.getComputedStyle(el);
    const map = {};
    if (!computed) return map;

    // Standard Chromium property enumeration without whitelist
    for (let i = 0; i < computed.length; i++) {
      const p = computed.item(i);
      map[p] = computed.getPropertyValue(p);
      if (p && p.startsWith('--')) {
        customPropNames.add(p);
      }
    }

    // Capture stylesheet-declared custom properties
    for (const cProp of customPropNames) {
      const val = computed.getPropertyValue(cProp);
      if (val !== undefined && val !== null && val !== '') {
        map[cProp] = val;
      }
    }

    // Capture inline-declared custom properties
    if (el.style) {
      for (let i = 0; i < el.style.length; i++) {
        const p = el.style.item(i);
        if (p && p.startsWith('--')) {
          customPropNames.add(p);
          const val = computed.getPropertyValue(p);
          if (val !== undefined && val !== null && val !== '') {
            map[p] = val;
          }
        }
      }
    }

    return map;
  }

  // Generic computed evidence helper for pseudo-element materiality (Section 4)
  function evaluatePseudoMateriality(pStyle) {
    if (!pStyle) return null;
    const pContent = pStyle.getPropertyValue('content') || pStyle.content;
    const normContent = String(pContent || '').trim();
    const hasContent = normContent !== '' && normContent !== 'none' && normContent !== 'normal';

    const pDisplay = pStyle.getPropertyValue('display') || '';
    const isNoneDisplay = pDisplay === 'none';

    const pBg = pStyle.getPropertyValue('background-color') || '';
    const hasBg = pBg && pBg !== 'rgba(0, 0, 0, 0)' && pBg !== 'transparent';
    const pImg = pStyle.getPropertyValue('background-image') || '';
    const hasImg = pImg && pImg !== 'none';

    const borderW = pStyle.getPropertyValue('border-top-width') || pStyle.getPropertyValue('border-width') || '0px';
    const borderS = pStyle.getPropertyValue('border-top-style') || pStyle.getPropertyValue('border-style') || 'none';
    const hasBorder = borderW !== '0px' && borderW !== '0' && borderS !== 'none';

    const pShadow = pStyle.getPropertyValue('box-shadow') || '';
    const hasShadow = pShadow && pShadow !== 'none';

    const pFilter = pStyle.getPropertyValue('filter') || '';
    const hasFilter = pFilter && pFilter !== 'none';

    const pW = parseFloat(pStyle.getPropertyValue('width')) || 0;
    const pH = parseFloat(pStyle.getPropertyValue('height')) || 0;
    const hasDims = pW > 0 && pH > 0;

    const pOpacity = parseFloat(pStyle.getPropertyValue('opacity')) || 1;
    const hasVisiblePaint = (hasBg || hasImg || hasBorder || hasShadow || hasFilter) && (!isNoneDisplay) && (pOpacity > 0);

    if (hasContent || hasVisiblePaint || (hasContent && hasDims)) {
      const reasons = [];
      if (hasContent) reasons.push(`content: ${normContent}`);
      if (hasBg) reasons.push('background');
      if (hasImg) reasons.push('background-image');
      if (hasBorder) reasons.push('border');
      if (hasShadow) reasons.push('box-shadow');
      if (hasFilter) reasons.push('filter');
      if (hasDims) reasons.push(`dimensions(${pW}x${pH})`);

      return {
        isMaterial: true,
        reason: reasons.join(' + ') || 'material-visual',
        content: pContent,
        display: pDisplay,
        hasVisiblePaint
      };
    }
    return null;
  }

  function walk(el, parentSid = null) {
    if (!el || el.nodeType !== 1) return;
    if (!isEligibleElement(el)) return;

    // Test seam for Section 1: allow deliberately skipping a subtree
    if (options.skipSubtreeSelector && typeof el.matches === 'function' && el.matches(options.skipSubtreeSelector)) {
      return;
    }
    if (options.skipSubtreeSid && el.getAttribute('data-sid') === options.skipSubtreeSid) {
      return;
    }

    const tag = el.tagName.toLowerCase();

    let sid = el.getAttribute('data-sid');
    if (!sid) {
      sid = `sid-${++sidCounter}`;
      el.setAttribute('data-sid', sid);
    }
    recordSid(sid, el);

    // Track accounting: attempted
    results.captureAccounting.attemptedElementSids.push(sid);

    // Detect unsupported regions (closed shadow roots, cross-origin iframes)
    if ((el.shadowRoot && el.shadowRoot.mode === 'closed') || (typeof window !== 'undefined' && window.__closedShadowHosts && window.__closedShadowHosts.has(el))) {
      results.unsupportedRegions.push({
        type: 'closed-shadow-root',
        sid,
        tag
      });
    }

    // Handle iframe exploration
    if (tag === 'iframe') {
      let doc = null;
      let isCrossOrigin = false;
      try {
        if (el.contentWindow) {
          const dummy = el.contentWindow.location.href;
        }
        doc = el.contentDocument;
        if (!doc && el.src && /^(https?:|\/\/)/i.test(el.getAttribute('src') || '')) {
          throw new Error('SecurityError: Blocked cross-origin iframe document access');
        }
      } catch (secErr) {
        isCrossOrigin = true;
        results.unsupportedRegions.push({
          type: 'cross-origin-iframe',
          sid,
          error: `SecurityError: ${secErr.message}`
        });
      }
      if (!isCrossOrigin) {
        if (doc && doc.body) {
          try {
            for (const child of doc.body.children) {
              walk(child, sid);
            }
          } catch (walkErr) {
            results.unsupportedRegions.push({
              type: 'same-origin-iframe-unsupported',
              sid,
              error: walkErr.message
            });
          }
        } else {
          results.unsupportedRegions.push({
            type: 'empty-or-restricted-iframe',
            sid
          });
        }
      }
    }

    const rect = el.getBoundingClientRect();
    const computed = window.getComputedStyle(el);

    // Extract direct text preserving whitespace
    let directText = '';
    let hasDirectText = false;
    for (const child of el.childNodes) {
      if (child.nodeType === 3 && child.textContent) { // TEXT_NODE
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

    // Exhaustive computed styles extraction & interning
    let internMeta = { styleHash: '', computedStyleRef: '', stylePropertyCount: 0, canonical: {} };
    try {
      const fullMap = extractFullComputedStyle(el);
      internMeta = internComputedStyle(fullMap);
      results.captureAccounting.capturedElementSids.push(sid);
    } catch (err) {
      results.captureAccounting.missingComputedStyleSids.push(sid);
      results.captureErrors.push({
        sid,
        tag,
        operation: 'extractFullComputedStyle',
        error: err.message
      });
    }

    // Backward-compatible legacy styles projection
    const styles = extractLegacyStyles(computed);

    // Interactive candidate detection
    const isInteractive = ['a', 'button', 'input', 'select', 'textarea', 'summary'].includes(tag) ||
      el.hasAttribute('onclick') ||
      el.getAttribute('role') === 'button' ||
      el.hasAttribute('tabindex') ||
      computed.cursor === 'pointer';

    // Exhaustive Pseudo-element capture (::before, ::after) across materiality criteria
    let pseudo = null;
    for (const pType of ['before', 'after']) {
      try {
        const pStyle = window.getComputedStyle(el, `::${pType}`);
        const mat = evaluatePseudoMateriality(pStyle);

        if (mat) {
          if (!pseudo) pseudo = {};

          const pMap = {};
          for (let i = 0; i < pStyle.length; i++) {
            const prop = pStyle.item(i);
            pMap[prop] = pStyle.getPropertyValue(prop);
            if (prop && prop.startsWith('--')) customPropNames.add(prop);
          }
          const pIntern = internComputedStyle(pMap);

          pseudo[pType] = {
            ownerSid: sid,
            pseudoType: pType,
            computedStyleRef: pIntern.computedStyleRef,
            stylePropertyCount: pIntern.stylePropertyCount,
            styleHash: pIntern.styleHash,
            materialityReason: mat.reason,
            geometryStatus: 'COMPUTED_ONLY',
            content: mat.content,
            display: mat.display,
            position: pStyle.getPropertyValue('position') || '',
            // Legacy projection fields for backward compatibility
            width: pStyle.getPropertyValue('width') || '',
            height: pStyle.getPropertyValue('height') || '',
            backgroundColor: pStyle.getPropertyValue('background-color') || '',
            color: pStyle.getPropertyValue('color') || '',
            fontSize: pStyle.getPropertyValue('font-size') || ''
          };
        }
      } catch (pErr) {
        results.captureErrors.push({
          sid,
          tag,
          operation: `pseudo-capture:${pType}`,
          error: pErr.message
        });
      }
    }

    // Child bounding rects capture
    const childRects = [];
    for (const child of el.childNodes) {
      if (child.nodeType === 1) { // ELEMENT_NODE
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
      } else if (child.nodeType === 3 && child.textContent && child.textContent.trim().length > 0) { // TEXT_NODE
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
      styles, // exact legacy projection
      stylePropertyCount: internMeta.stylePropertyCount,
      styleHash: internMeta.styleHash,
      computedStyleRef: internMeta.computedStyleRef,
      isInteractive,
      pseudo
    };

    // Define in-memory non-enumerable getter for live access without serializing duplicates
    Object.defineProperty(nodeData, 'computedStyle', {
      enumerable: false,
      configurable: true,
      get() {
        return results.styleDictionary[this.computedStyleRef] || null;
      }
    });

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

    // Open shadow root traversal (Section 6)
    if (el.shadowRoot && el.shadowRoot.mode === 'open') {
      try {
        if (el.shadowRoot.styleSheets) {
          for (const sheet of el.shadowRoot.styleSheets) {
            try {
              walkCssRules(sheet.cssRules);
            } catch (secErr) {
              inaccessibleCount++;
              results.customPropertyDiscovery.warnings.push(`Inaccessible shadow stylesheet: ${secErr.message}`);
            }
          }
        }
        if (el.shadowRoot.adoptedStyleSheets) {
          for (const sheet of el.shadowRoot.adoptedStyleSheets) {
            try {
              walkCssRules(sheet.cssRules);
            } catch (_) {}
          }
        }
      } catch (_) {}

      for (const child of el.shadowRoot.children) {
        walk(child, sid);
      }
    }

    // Recurse into element children
    for (const child of el.children) {
      walk(child, sid);
    }
  }

  // 1. Walk body and all its descendants (results.flat strictly starts at body for Elementor tree compatibility)
  walk(body, null);

  // 2. Root Canvas Ground Truth for html and body
  // html is captured and interned into styleDictionary, but NOT placed in results.flat
  // preserving backwards compatibility and flat node indexing.
  let htmlSid = docEl.getAttribute('data-sid');
  if (!htmlSid) {
    htmlSid = 'sid-0';
    docEl.setAttribute('data-sid', htmlSid);
  }
  recordSid(htmlSid, docEl);

  results.captureAccounting.attemptedElementSids.push(htmlSid);

  const bodySid = body.getAttribute('data-sid') || 'sid-1';
  const bodyNode = results.flat[bodySid];

  let htmlInternMeta = { styleHash: '', computedStyleRef: '', stylePropertyCount: 0, canonical: {} };
  try {
    const htmlFullMap = extractFullComputedStyle(docEl);
    htmlInternMeta = internComputedStyle(htmlFullMap);
    results.captureAccounting.capturedElementSids.push(htmlSid);
  } catch (err) {
    results.captureAccounting.missingComputedStyleSids.push(htmlSid);
    results.captureErrors.push({
      sid: htmlSid,
      tag: 'html',
      operation: 'extractFullComputedStyle',
      error: err.message
    });
  }

  const htmlComp = window.getComputedStyle(docEl);
  const bodyComp = window.getComputedStyle(body);

  results.canvas = {
    html: {
      sid: htmlSid,
      tag: 'html',
      backgroundColor: htmlComp.getPropertyValue('background-color') || 'rgba(0, 0, 0, 0)',
      backgroundImage: htmlComp.getPropertyValue('background-image') || 'none',
      color: htmlComp.getPropertyValue('color') || 'rgb(0, 0, 0)',
      opacity: htmlComp.getPropertyValue('opacity') || '1',
      fontFamily: htmlComp.getPropertyValue('font-family') || '',
      fontSize: htmlComp.getPropertyValue('font-size') || '',
      lineHeight: htmlComp.getPropertyValue('line-height') || '',
      width: Math.round(docEl.getBoundingClientRect().width),
      height: Math.round(docEl.getBoundingClientRect().height),
      overflow: htmlComp.getPropertyValue('overflow') || '',
      direction: htmlComp.getPropertyValue('direction') || 'ltr',
      writingMode: htmlComp.getPropertyValue('writing-mode') || 'horizontal-tb',
      computedStyleRef: htmlInternMeta.computedStyleRef,
      styleHash: htmlInternMeta.styleHash,
      stylePropertyCount: htmlInternMeta.stylePropertyCount
    },
    body: {
      sid: bodySid,
      tag: 'body',
      backgroundColor: bodyComp.getPropertyValue('background-color') || 'rgba(0, 0, 0, 0)',
      backgroundImage: bodyComp.getPropertyValue('background-image') || 'none',
      color: bodyComp.getPropertyValue('color') || 'rgb(0, 0, 0)',
      opacity: bodyComp.getPropertyValue('opacity') || '1',
      fontFamily: bodyComp.getPropertyValue('font-family') || '',
      fontSize: bodyComp.getPropertyValue('font-size') || '',
      lineHeight: bodyComp.getPropertyValue('line-height') || '',
      width: Math.round(body.getBoundingClientRect().width),
      height: Math.round(body.getBoundingClientRect().height),
      overflow: bodyComp.getPropertyValue('overflow') || '',
      direction: bodyComp.getPropertyValue('direction') || 'ltr',
      writingMode: bodyComp.getPropertyValue('writing-mode') || 'horizontal-tb',
      computedStyleRef: bodyNode ? bodyNode.computedStyleRef : null,
      styleHash: bodyNode ? bodyNode.styleHash : null,
      stylePropertyCount: bodyNode ? bodyNode.stylePropertyCount : 0
    }
  };

  // Finalize custom property discovery counts AFTER all elements and shadow roots have been walked
  results.customPropertyDiscovery.discoveredNameCount = customPropNames.size;
  results.customPropertyDiscovery.inaccessibleStylesheetCount = inaccessibleCount;
  results.customPropertyDiscovery.status = inaccessibleCount > 0 ? 'PARTIAL' : 'COMPLETE';

  // Check unique fonts
  const fontFamilies = new Set();
  Object.values(results.flat).forEach(n => {
    if (n.styles && n.styles.fontFamily) {
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
 * Reconstructs a defensive copy of the complete computed-style map for any node.
 * Works after JSON serialization and parsing.
 * 
 * @param {Object} node 
 * @param {Object} viewportSnapshot - Viewport object or full snapshot
 * @returns {Object} Complete computed-style map
 */
function reconstructComputedStyle(node, viewportSnapshot) {
  if (!node || typeof node !== 'object') {
    throw new Error('reconstructComputedStyle: node must be a valid object');
  }
  const ref = node.computedStyleRef || node.styleHash;
  if (!ref || typeof ref !== 'string') {
    throw new Error(`reconstructComputedStyle: node ${node.sid || 'unknown'} missing computedStyleRef`);
  }

  let dict = null;
  if (viewportSnapshot && typeof viewportSnapshot === 'object') {
    if (viewportSnapshot.styleDictionary && typeof viewportSnapshot.styleDictionary === 'object') {
      dict = viewportSnapshot.styleDictionary;
    } else if (viewportSnapshot.viewports) {
      for (const vpKey of ['desktop', 'tablet', 'mobile']) {
        if (viewportSnapshot.viewports[vpKey]?.styleDictionary?.[ref]) {
          dict = viewportSnapshot.viewports[vpKey].styleDictionary;
          break;
        }
      }
    }
  }

  if (!dict) {
    throw new Error('reconstructComputedStyle: missing or invalid styleDictionary in snapshot');
  }

  const entry = dict[ref];
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new Error(`reconstructComputedStyle: styleDictionary reference "${ref}" not found or malformed`);
  }

  // Return a defensive copy to guarantee mutation isolation
  return { ...entry };
}

/**
 * Computes honest Ground Truth coverage metrics for a viewport or snapshot.
 * Uses independent DOM-based accounting for the coverage denominator (Section 1).
 * Exhaustively validates every style reference across nodes, canvas, pseudo, and states (Section 2).
 * 
 * @param {Object} snapshot - Ground-truth snapshot
 * @param {string} [viewportKey='desktop']
 * @returns {Object}
 */
function calculateGroundTruthCoverage(snapshot, viewportKey = 'desktop') {
  if (!snapshot || !snapshot.viewports) {
    throw new Error('calculateGroundTruthCoverage: invalid snapshot');
  }
  const vp = snapshot.viewports[viewportKey];
  if (!vp || !vp.flat) {
    throw new Error(`calculateGroundTruthCoverage: missing viewport ${viewportKey}`);
  }

  const dict = vp.styleDictionary || {};
  const flatNodes = Object.values(vp.flat);
  const accounting = vp.captureAccounting;

  // Independent DOM-based eligible element SIDs (Section 1)
  const eligibleSids = accounting && Array.isArray(accounting.eligibleElementSids) && accounting.eligibleElementSids.length > 0
    ? accounting.eligibleElementSids
    : flatNodes.filter(n => isEligibleForComputedStyleCapture(n)).map(n => n.sid);

  const eligibleElementCount = eligibleSids.length;
  let capturedElementCount = 0;
  let totalEnumeratedPropertyEntries = 0;
  let minProps = Infinity;
  let maxProps = 0;
  let unresolvedStyleReferenceCount = 0;
  let customPropertyResolvedEntryCount = 0;
  let pseudoElementCount = 0;
  let stateSnapshotCount = 0;
  const invalidReferenceDetails = [];

  // Helper to validate any style reference (Section 2)
  function validateStyleRef(owner, ref, expectedCount, expectedHash) {
    if (!ref || typeof ref !== 'string') {
      unresolvedStyleReferenceCount++;
      invalidReferenceDetails.push({ owner, ref, reason: 'Reference missing or non-string' });
      return false;
    }
    const entry = dict[ref];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      unresolvedStyleReferenceCount++;
      invalidReferenceDetails.push({ owner, ref, reason: 'Dictionary entry missing or not an object' });
      return false;
    }
    const propCount = Object.keys(entry).length;
    if (expectedCount !== undefined && expectedCount !== null && expectedCount > 0 && propCount !== expectedCount) {
      unresolvedStyleReferenceCount++;
      invalidReferenceDetails.push({ owner, ref, reason: `Property count mismatch: entry has ${propCount}, expected ${expectedCount}` });
      return false;
    }
    if (expectedHash && ref !== expectedHash && !ref.startsWith(`${expectedHash}_c`)) {
      unresolvedStyleReferenceCount++;
      invalidReferenceDetails.push({ owner, ref, reason: `Hash mismatch: ref ${ref} does not match hash ${expectedHash}` });
      return false;
    }
    return true;
  }

  // 1. Validate eligible elements from independent accounting
  let missingComputedCount = 0;
  for (const sid of eligibleSids) {
    let node = vp.flat[sid];
    if (!node && vp.canvas?.html?.sid === sid) {
      node = vp.canvas.html;
    } else if (!node && vp.canvas?.body?.sid === sid) {
      node = vp.canvas.body;
    }

    if (node && node.computedStyleRef && dict[node.computedStyleRef]) {
      capturedElementCount++;
      const propCount = node.stylePropertyCount || Object.keys(dict[node.computedStyleRef]).length;
      totalEnumeratedPropertyEntries += propCount;
      if (propCount < minProps) minProps = propCount;
      if (propCount > maxProps) maxProps = propCount;

      const styleMap = dict[node.computedStyleRef];
      for (const propName in styleMap) {
        if (propName.startsWith('--')) {
          customPropertyResolvedEntryCount++;
        }
      }
    } else {
      missingComputedCount++;
    }
  }

  // 2. Validate all references across flat nodes
  for (const node of flatNodes) {
    validateStyleRef(`flat:${node.sid}`, node.computedStyleRef, node.stylePropertyCount, node.styleHash);

    // Validate pseudo elements
    if (node.pseudo) {
      if (node.pseudo.before) {
        pseudoElementCount++;
        validateStyleRef(`pseudo:before:${node.sid}`, node.pseudo.before.computedStyleRef, node.pseudo.before.stylePropertyCount, node.pseudo.before.styleHash);
      }
      if (node.pseudo.after) {
        pseudoElementCount++;
        validateStyleRef(`pseudo:after:${node.sid}`, node.pseudo.after.computedStyleRef, node.pseudo.after.stylePropertyCount, node.pseudo.after.styleHash);
      }
    }

    // Validate interaction states
    if (node.states) {
      for (const [stName, stData] of Object.entries(node.states)) {
        if (stData && stData.status === 'CAPTURED' && stData.computedStyleRef) {
          stateSnapshotCount++;
          validateStyleRef(`state:${stName}:${node.sid}`, stData.computedStyleRef, stData.stylePropertyCount, stData.styleHash);
        }
      }
    }
  }

  // 3. Validate root canvas references
  if (vp.canvas) {
    if (vp.canvas.html) {
      validateStyleRef('canvas.html', vp.canvas.html.computedStyleRef, vp.canvas.html.stylePropertyCount, vp.canvas.html.styleHash);
    } else {
      unresolvedStyleReferenceCount++;
      invalidReferenceDetails.push({ owner: 'canvas', ref: null, reason: 'Missing canvas.html' });
    }
    if (vp.canvas.body) {
      validateStyleRef('canvas.body', vp.canvas.body.computedStyleRef, vp.canvas.body.stylePropertyCount, vp.canvas.body.styleHash);
    } else {
      unresolvedStyleReferenceCount++;
      invalidReferenceDetails.push({ owner: 'canvas', ref: null, reason: 'Missing canvas.body' });
    }
  } else {
    unresolvedStyleReferenceCount += 2;
    invalidReferenceDetails.push({ owner: 'viewport', ref: null, reason: 'Missing canvas object' });
  }

  if (minProps === Infinity) minProps = 0;
  const elementsMissingComputedStyle = missingComputedCount;

  const duplicateSidsCount = (accounting?.duplicateSidRecords || []).length;

  const computedStyleCoveragePercent = (eligibleElementCount > 0 && elementsMissingComputedStyle === 0 && unresolvedStyleReferenceCount === 0 && duplicateSidsCount === 0)
    ? 100
    : (eligibleElementCount > 0
        ? Math.max(0, Math.round(((capturedElementCount - elementsMissingComputedStyle - unresolvedStyleReferenceCount) / eligibleElementCount) * 100 * 100) / 100)
        : 0);

  const avgProps = eligibleElementCount > 0
    ? Math.round(totalEnumeratedPropertyEntries / eligibleElementCount)
    : 0;

  let totalStoredPropertyEntries = 0;
  for (const h in dict) {
    totalStoredPropertyEntries += Object.keys(dict[h]).length;
  }

  let snapshotSizeBytes = 0;
  try {
    snapshotSizeBytes = Buffer.byteLength(JSON.stringify(vp), 'utf8');
  } catch (_) {}

  return {
    viewport: viewportKey,
    eligibleElementCount,
    capturedElementCount,
    elementsMissingComputedStyle,
    computedStyleCoveragePercent,
    totalEnumeratedPropertyEntries,
    totalStoredPropertyEntries,
    minimumPropertiesOnAnyEligibleElement: minProps,
    maximumPropertiesOnAnyEligibleElement: maxProps,
    averagePropertiesPerEligibleElement: avgProps,
    customPropertyNameCount: vp.customPropertyDiscovery?.discoveredNameCount || 0,
    customPropertyResolvedEntryCount,
    customPropertyDiscoveryStatus: vp.customPropertyDiscovery?.status || 'COMPLETE',
    pseudoElementCount,
    stateSnapshotCount,
    styleDictionaryEntryCount: Object.keys(dict).length,
    styleReferenceCount: flatNodes.length + (vp.canvas ? 2 : 0) + pseudoElementCount + stateSnapshotCount,
    unresolvedStyleReferenceCount,
    invalidReferenceDetails,
    duplicateSidRecordsCount: duplicateSidsCount,
    unsupportedRegionCount: (vp.unsupportedRegions || []).length,
    captureWarningCount: (vp.captureErrors || []).length + (vp.customPropertyDiscovery?.warnings || []).length,
    snapshotSizeBytes
  };
}

/**
 * Captures ground-truth snapshot across desktop, tablet, and mobile viewports.
 * 
 * @param {string} htmlPathOrContent - File path or raw HTML string
 * @param {Object} options
 */
async function captureGroundTruth(htmlPathOrContent, options = {}) {
  const refresh = options.refresh || process.argv.includes('--refresh');

  let rawHtml = '';
  if (fs.existsSync(htmlPathOrContent)) {
    rawHtml = fs.readFileSync(htmlPathOrContent, 'utf8');
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
    groundTruthSchemaVersion: GROUND_TRUTH_SCHEMA_VERSION,
    timestamp: new Date().toISOString(),
    viewports: {},
    assets: [],
    fonts: [],
    consoleErrors: []
  };

  try {
    const page = await browser.newPage();

    await page.evaluateOnNewDocument(() => {
      try {
        window.__closedShadowHosts = new WeakSet();
        const origAttach = Element.prototype.attachShadow;
        Element.prototype.attachShadow = function(init) {
          if (init && init.mode === 'closed') {
            window.__closedShadowHosts.add(this);
          }
          return origAttach.apply(this, arguments);
        };
      } catch (_) {}
    });

    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', err => {
      consoleErrors.push(err.message);
    });

    for (const vpKey of ['desktop', 'tablet', 'mobile']) {
      const vp = VIEWPORTS[vpKey];
      await page.setViewport({ width: vp.width, height: vp.height });

      let fontStatus = 'READY';

      if (vpKey === 'desktop') {
        const shadowHook = '<script id="__gt_shadow_hook__">(function(){try{window.__closedShadowHosts=new WeakSet();const o=Element.prototype.attachShadow;Element.prototype.attachShadow=function(i){if(i&&i.mode==="closed"){window.__closedShadowHosts.add(this);}return o.apply(this,arguments);};}catch(_){}})();</script>';
        const htmlToLoad = rawHtml.includes('<head>')
          ? rawHtml.replace('<head>', '<head>' + shadowHook)
          : (shadowHook + rawHtml);
        await page.setContent(htmlToLoad, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
      }

      // 1. Live font readiness wait with bounded timeout (Section 7)
      try {
        const fontReady = await page.evaluate(() => {
          if (!document.fonts) return 'READY';
          return Promise.race([
            document.fonts.ready.then(() => 'READY'),
            new Promise(res => setTimeout(() => res('TIMEOUT'), 3000))
          ]);
        });
        fontStatus = fontReady;
      } catch (_) {
        fontStatus = 'ERROR';
      }

      // 2. Deterministic motion freeze at currentTime = 0 and transition settling (Section 8)
      try {
        await page.evaluate(() => {
          if (typeof document.getAnimations === 'function') {
            const anims = document.getAnimations({ subtree: true });
            for (const a of anims) {
              if (a.constructor.name === 'CSSTransition' || a.transitionProperty) {
                try { a.finish(); } catch (_) {}
              } else {
                try {
                  a.pause();
                  a.currentTime = 0;
                } catch (_) {}
              }
            }
          }
        });
      } catch (_) {}

      await new Promise(res => setTimeout(res, 100));

      // 3. Extract in-page ground truth (styles, rects, canvas, accounting)
      const vpResults = await page.evaluate(inPageExtract, {
        isDesktopPass: vpKey === 'desktop',
        eligibilityFnStr: isEligibleForComputedStyleCapture.toString(),
        skipSubtreeSelector: options.skipSubtreeSelector || null,
        skipSubtreeSid: options.skipSubtreeSid || null
      });

      // 4. Measure live image readiness (Section 7)
      const imageReadiness = await page.evaluate(() => {
        const imgs = Array.from(document.querySelectorAll('img'));
        let pending = 0;
        const details = [];
        for (const img of imgs) {
          const complete = img.complete;
          const naturalWidth = img.naturalWidth;
          const src = img.src || img.getAttribute('src') || '';
          const isPending = !complete || (complete && naturalWidth === 0 && src && !src.startsWith('data:'));
          if (isPending) {
            pending++;
            details.push({
              src,
              complete,
              naturalWidth,
              status: complete && naturalWidth === 0 ? 'FAILED' : 'PENDING'
            });
          }
        }
        return { pending, details };
      });

      vpResults.readiness = {
        fonts: fontStatus,
        imagesPending: imageReadiness.pending,
        failedImages: imageReadiness.details.filter(d => d.status === 'FAILED'),
        stylesheetWarnings: vpResults.customPropertyDiscovery?.warnings || [],
        timeoutMs: 5000
      };

      if (vpKey === 'desktop') {
        annotatedHtml = await page.evaluate(() => {
          const h = document.getElementById('__gt_shadow_hook__');
          if (h) h.remove();
          return document.body.innerHTML;
        });
        snapshot.assets = vpResults.assets;
        snapshot.fonts = vpResults.fonts;
      }

      // 5. Exhaustive Interaction-State Capture (:hover across viewports via CDP) (Section 3)
      try {
        const client = await page.target().createCDPSession();
        await client.send('DOM.enable').catch(() => {});
        await client.send('CSS.enable').catch(() => {});
        const doc = await client.send('DOM.getDocument').catch(() => null);
        const rootNodeId = doc?.root?.nodeId;

        if (rootNodeId) {
          const interactiveSids = Object.values(vpResults.flat).filter(n => n.isInteractive).map(n => n.sid);

          for (const sid of interactiveSids) {
            try {
              const { nodeId } = await client.send('DOM.querySelector', {
                nodeId: rootNodeId,
                selector: `[data-sid="${sid}"]`
              });

              if (nodeId) {
                try {
                  await client.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['hover'] });

                  // Extract complete Chromium computed style during hover
                  const hoverStyleMap = await page.evaluate(s => {
                    const el = document.querySelector(`[data-sid="${s}"]`);
                    if (!el) return null;
                    const comp = window.getComputedStyle(el);
                    const map = {};
                    for (let i = 0; i < comp.length; i++) {
                      const p = comp.item(i);
                      map[p] = comp.getPropertyValue(p);
                    }
                    return map;
                  }, sid);

                  if (hoverStyleMap) {
                    const baseRef = vpResults.flat[sid].computedStyleRef;
                    const baseStyleMap = vpResults.styleDictionary[baseRef] || {};
                    let hasDelta = false;
                    for (const k in hoverStyleMap) {
                      if (hoverStyleMap[k] !== baseStyleMap[k]) {
                        hasDelta = true;
                        break;
                      }
                    }

                    if (hasDelta) {
                      const internMeta = internStyleMap(hoverStyleMap, vpResults.styleDictionary);
                      vpResults.flat[sid].states = vpResults.flat[sid].states || {};
                      vpResults.flat[sid].states.hover = {
                        computedStyleRef: internMeta.computedStyleRef,
                        styleHash: internMeta.styleHash,
                        stylePropertyCount: internMeta.stylePropertyCount,
                        trigger: 'hover',
                        status: 'CAPTURED'
                      };
                    }
                  }

                  // ALWAYS probe descendants for every hovered interactive parent (Section 3)
                  function getDescendantSids(pSid) {
                    const direct = Object.values(vpResults.flat).filter(n => n.parentSid === pSid);
                    let all = [];
                    for (const d of direct) {
                      all.push(d.sid);
                      all = all.concat(getDescendantSids(d.sid));
                    }
                    return all;
                  }
                  const childSids = getDescendantSids(sid);

                  for (const cSid of childSids) {
                    const cHoverStyle = await page.evaluate(cs => {
                      const cel = document.querySelector(`[data-sid="${cs}"]`);
                      if (!cel) return null;
                      const comp = window.getComputedStyle(cel);
                      const cmap = {};
                      for (let ci = 0; ci < comp.length; ci++) {
                        const cp = comp.item(ci);
                        cmap[cp] = comp.getPropertyValue(cp);
                      }
                      return cmap;
                    }, cSid);

                    if (cHoverStyle) {
                      const cBaseRef = vpResults.flat[cSid]?.computedStyleRef;
                      const cBaseMap = vpResults.styleDictionary[cBaseRef] || {};
                      let cHasDelta = false;
                      for (const ck in cHoverStyle) {
                        if (cHoverStyle[ck] !== cBaseMap[ck]) {
                          cHasDelta = true;
                          break;
                        }
                      }

                      if (cHasDelta) {
                        const cIntern = internStyleMap(cHoverStyle, vpResults.styleDictionary);
                        vpResults.flat[cSid].states = vpResults.flat[cSid].states || {};
                        const triggerKey = `parent-hover:${sid}`;
                        vpResults.flat[cSid].states[triggerKey] = {
                          computedStyleRef: cIntern.computedStyleRef,
                          styleHash: cIntern.styleHash,
                          stylePropertyCount: cIntern.stylePropertyCount,
                          trigger: triggerKey,
                          ancestorSid: sid,
                          status: 'CAPTURED'
                        };
                        // Maintain primary .hover pointer without overwriting if already set
                        if (!vpResults.flat[cSid].states.hover) {
                          vpResults.flat[cSid].states.hover = vpResults.flat[cSid].states[triggerKey];
                        }
                      }
                    }
                  }
                } catch (probeErr) {
                  vpResults.captureErrors.push({
                    operation: 'hover-probe',
                    sid,
                    error: probeErr.message
                  });
                } finally {
                  // Restore state unconditionally using finally (Section 3 item 6)
                  await client.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] }).catch(cleanupErr => {
                    vpResults.captureErrors.push({
                      operation: 'restorePseudoState',
                      sid,
                      error: cleanupErr.message
                    });
                  });
                }
              }
            } catch (nodeErr) {
              vpResults.captureErrors.push({
                operation: 'node-hover-setup',
                sid,
                error: nodeErr.message
              });
            }
          }
        }
      } catch (cdpErr) {
        vpResults.captureErrors.push({
          operation: 'cdp-session',
          error: cdpErr.message
        });
      }

      // Attach calculated coverage metrics to viewport
      try {
        vpResults.metrics = calculateGroundTruthCoverage({ viewports: { [vpKey]: vpResults } }, vpKey);
      } catch (_) {}

      snapshot.viewports[vpKey] = vpResults;
    }

    // Section 9: Ambiguous root snapshot.canvas alias REMOVED
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
  VIEWPORTS,
  reconstructComputedStyle,
  isEligibleForComputedStyleCapture,
  calculateGroundTruthCoverage,
  internStyleMap
};

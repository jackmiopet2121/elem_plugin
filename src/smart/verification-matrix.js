/**
 * Per-Widget Verification Matrix — Editability-First Contract (v3.1).
 * Codename: "Single-Pass + Verify" (Phase 3 - T3.3 / Phase 4 - T4)
 */

const { TOLERANCES, isColorEqual, normalizeColor } = require("./tolerances");
const { createDefect, createAuditReport, CRITICAL_RULES } = require("./audit-schema");
const { isElementorNativeProperty, isNativeEditableWidget } = require("./style-router");
const { extractKnownGlyph } = require("./glyph-map");
const { resolvePageCanvas, parseCssColor } = require("./page-canvas-resolver");
const { readComputedCssProperty } = require("./computed-style-resolver");
const {
  mapBackgroundSize,
  mapBackgroundPosition,
  mapBackgroundRepeat,
  extractSingleImageUrl
} = require("./image-background-geometry");
const { parseLinearGradient, resolveScopedGradientPlan } = require("./gradient-background-resolver");
const { isSafeCssUrl } = require("../emulator/elementor-virtual-renderer");

const AVAILABLE_RULES = Object.freeze([
  'RULE-ASSET-01',
  'RULE-LAYOUT-01',
  'RULE-DOM-01',
  'RULE-STATE-01',
  'RULE-CLR-01',
  'RULE-CLR-02',
  'RULE-CLR-03',
  'RULE-CANVAS-01',
  'RULE-SURFACE-01',
  'RULE-SURFACE-02',
  'RULE-TYP-01',
  'RULE-TYP-02',
  'RULE-TXT-01',
  'RULE-TXT-02',
  'RULE-GEO-01',
  'RULE-TOPOLOGY-01',
  'RULE-TOPOLOGY-02',
  'RULE-BOX-01',
  'RULE-BOX-02',
  'RULE-VIS-01',
  'RULE-VIS-02',
  'RULE-VIS-03',
  'RULE-VIS-04',
  'RULE-BHV-01'
]);

function hasNonEmptyBackgroundImage(bgImage) {
  if (!bgImage) return false;
  if (typeof bgImage === 'string') {
    const s = bgImage.trim().toLowerCase();
    return s !== '' && s !== 'none';
  }
  if (typeof bgImage === 'object' && bgImage !== null) {
    if (typeof bgImage.url === 'string') {
      const s = bgImage.url.trim().toLowerCase();
      return s !== '' && s !== 'none';
    }
  }
  return false;
}

function isNoneBackgroundImage(img) {
  if (!img) return true;
  const s = String(img).trim().toLowerCase();
  return s === '' || s === 'none';
}

function compareContainerBackgroundColors(gtColorStr, rnColorStr) {
  const p1 = parseCssColor(gtColorStr);
  const p2 = parseCssColor(rnColorStr);

  if (!p1 || !p2) {
    return {
      match: false,
      unparseable: true,
      reason: `Unparseable container background color: GT "${gtColorStr}", Rendered "${rnColorStr}".`
    };
  }

  // Transparent colors with alpha === 0 match even if RGB channels differ
  if (p1.alpha === 0 && p2.alpha === 0) {
    return { match: true };
  }

  // If one is alpha 0 and the other is not
  if ((p1.alpha === 0) !== (p2.alpha === 0)) {
    return {
      match: false,
      reason: `Container transparency mismatch: GT alpha ${p1.alpha}, Rendered alpha ${p2.alpha}.`
    };
  }

  // Exact alpha match (allow microscopic float epsilon < 0.001)
  if (Math.abs(p1.alpha - p2.alpha) >= 0.001) {
    return {
      match: false,
      reason: `Container alpha mismatch: expected ${p1.alpha}, got ${p2.alpha}.`
    };
  }

  // Exact RGB channel match (0 tolerance)
  if (p1.r !== p2.r || p1.g !== p2.g || p1.b !== p2.b) {
    return {
      match: false,
      reason: `Container RGB channel mismatch: expected rgb(${p1.r}, ${p1.g}, ${p1.b}), got rgb(${p2.r}, ${p2.g}, ${p2.b}).`
    };
  }

  return { match: true };
}

function validateGradientAngleSetting(obj) {
  if (!obj || typeof obj !== 'object') return { ok: false, reason: 'expected object' };
  if (obj.unit !== 'deg') return { ok: false, reason: `expected unit "deg", got "${obj.unit}"` };
  if (typeof obj.size !== 'number' || !Number.isFinite(obj.size)) return { ok: false, reason: `size must be finite number, got ${obj.size}` };
  return { ok: true };
}

function validateGradientStopSetting(obj) {
  if (!obj || typeof obj !== 'object') return { ok: false, reason: 'expected object' };
  if (obj.unit !== '%') return { ok: false, reason: `expected unit "%", got "${obj.unit}"` };
  if (typeof obj.size !== 'number' || !Number.isFinite(obj.size)) return { ok: false, reason: `size must be finite number, got ${obj.size}` };
  if (obj.size < 0 || obj.size > 100) return { ok: false, reason: `size must be between 0 and 100, got ${obj.size}` };
  return { ok: true };
}

function resolveEffectiveGradientSetting(tmplSettings, baseProp, vp, validator) {
  const tabProp = `${baseProp}_tablet`;
  const mobProp = `${baseProp}_mobile`;

  function checkProp(prop) {
    if (!Object.prototype.hasOwnProperty.call(tmplSettings, prop)) {
      return { present: false };
    }
    const val = tmplSettings[prop];
    const validation = validator(val);
    if (!validation.ok) {
      return { present: true, valid: false, error: `Template ${prop} malformed: ${validation.reason} (${JSON.stringify(val)})` };
    }
    return { present: true, valid: true, size: val.size, raw: val };
  }

  if (vp === 'desktop') {
    const base = checkProp(baseProp);
    if (!base.present) {
      return { valid: false, error: `Template ${baseProp} missing at desktop` };
    }
    if (!base.valid) {
      return { valid: false, error: base.error };
    }
    return { valid: true, value: base.size, raw: base.raw };
  }

  if (vp === 'tablet') {
    const tab = checkProp(tabProp);
    if (tab.present) {
      if (!tab.valid) return { valid: false, error: tab.error };
      return { valid: true, value: tab.size, raw: tab.raw };
    }
    const base = checkProp(baseProp);
    if (!base.present || !base.valid) {
      return { valid: false, error: base.error || `Template base ${baseProp} missing for tablet fallback` };
    }
    return { valid: true, value: base.size, raw: base.raw };
  }

  if (vp === 'mobile') {
    const mob = checkProp(mobProp);
    if (mob.present) {
      if (!mob.valid) return { valid: false, error: mob.error };
      return { valid: true, value: mob.size, raw: mob.raw };
    }
    const tab = checkProp(tabProp);
    if (tab.present) {
      if (!tab.valid) return { valid: false, error: tab.error };
      return { valid: true, value: tab.size, raw: tab.raw };
    }
    const base = checkProp(baseProp);
    if (!base.present || !base.valid) {
      return { valid: false, error: base.error || `Template base ${baseProp} missing for mobile fallback` };
    }
    return { valid: true, value: base.size, raw: base.raw };
  }

  return { valid: false, error: `Unknown viewport: ${vp}` };
}

function resolveEffectiveTemplateImageUrl(tmplSettings, vp) {
  if (!tmplSettings || typeof tmplSettings !== 'object') {
    return { valid: false, url: '', reason: 'Template settings missing or invalid', settingPresent: false };
  }

  function checkImageProp(prop) {
    if (!Object.prototype.hasOwnProperty.call(tmplSettings, prop)) {
      return { present: false };
    }
    const val = tmplSettings[prop];
    if (val && typeof val === 'object' && typeof val.url === 'string' && val.url.trim() !== '') {
      const trimmed = val.url.trim();
      if (!isSafeCssUrl(trimmed)) {
        return { present: true, valid: false, error: `Template ${prop} contains unsafe URL "${trimmed}"` };
      }
      return { present: true, valid: true, url: trimmed };
    }
    return { present: true, valid: false, error: `Template ${prop}.url missing, non-string, or empty` };
  }

  const base = checkImageProp('background_image');
  const tab = checkImageProp('background_image_tablet');
  const mob = checkImageProp('background_image_mobile');

  if (vp === 'desktop') {
    if (!base.present) {
      return { valid: false, url: '', reason: 'Template background_image property missing', settingPresent: false };
    }
    if (!base.valid) {
      return { valid: false, url: '', reason: base.error, settingPresent: true };
    }
    return { valid: true, url: base.url, settingPresent: true };
  }

  if (vp === 'tablet') {
    if (tab.present) {
      if (!tab.valid) {
        return { valid: false, url: '', reason: tab.error, settingPresent: true };
      }
      return { valid: true, url: tab.url, settingPresent: true };
    }
    // Tablet inherits from desktop
    if (!base.present || !base.valid) {
      return { valid: false, url: '', reason: base.error || 'Template background_image missing for tablet fallback', settingPresent: false };
    }
    return { valid: true, url: base.url, settingPresent: false };
  }

  if (vp === 'mobile') {
    if (mob.present) {
      if (!mob.valid) {
        return { valid: false, url: '', reason: mob.error, settingPresent: true };
      }
      return { valid: true, url: mob.url, settingPresent: true };
    }
    // Mobile inherits from tablet override if present, else desktop
    if (tab.present) {
      if (!tab.valid) {
        return { valid: false, url: '', reason: tab.error, settingPresent: false };
      }
      return { valid: true, url: tab.url, settingPresent: false };
    }
    if (!base.present || !base.valid) {
      return { valid: false, url: '', reason: base.error || 'Template background_image missing for mobile fallback', settingPresent: false };
    }
    return { valid: true, url: base.url, settingPresent: false };
  }

  return { valid: false, url: '', reason: `Unknown viewport: ${vp}`, settingPresent: false };
}

function parsePx(val) {
  if (!val) return 0;
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

const EDITABLE_RELAX = 2.5;

function isExactBaseContainerSelector(selectorStr, targetClass) {
  if (!selectorStr || typeof selectorStr !== 'string') return false;
  const targetSelector = `.${targetClass}`;
  const parts = selectorStr.split(',');
  return parts.some(part => part.trim() === targetSelector);
}

function isSimpleTabletMedia(mediaQuery) {
  if (!mediaQuery || typeof mediaQuery !== 'string') return false;
  return /^@media\s*(?:(?:only\s+)?screen\s+and\s+)?\(\s*max-width\s*:\s*(?:1024|1024\.98)px\s*\)$/i.test(mediaQuery.trim());
}

function isSimpleMobileMedia(mediaQuery) {
  if (!mediaQuery || typeof mediaQuery !== 'string') return false;
  return /^@media\s*(?:(?:only\s+)?screen\s+and\s+)?\(\s*max-width\s*:\s*(?:767|767\.98)px\s*\)$/i.test(mediaQuery.trim());
}

/**
 * Parses CSS text into structured rules with media query, selector, and body.
 */
function parseCssRules(cssText) {
  const rules = [];
  if (!cssText || typeof cssText !== 'string') return rules;

  let pos = 0;
  const len = cssText.length;

  let currentMedia = null;
  let currentSelector = null;
  let currentBodyStart = -1;
  let depth = 0;
  let buffer = '';

  while (pos < len) {
    const ch = cssText[pos];

    if (ch === '{') {
      const header = buffer.trim();
      buffer = '';
      if (depth === 0) {
        if (/^@media/i.test(header)) {
          currentMedia = header;
          depth = 1;
        } else {
          currentSelector = header;
          currentBodyStart = pos + 1;
          depth = 1;
        }
      } else if (depth === 1 && currentMedia) {
        currentSelector = header;
        currentBodyStart = pos + 1;
        depth = 2;
      }
    } else if (ch === '}') {
      if ((depth === 1 && !currentMedia && currentSelector) || (depth === 2 && currentMedia && currentSelector)) {
        const body = cssText.substring(currentBodyStart, pos);
        rules.push({
          media: currentMedia,
          selector: currentSelector,
          body: body.trim()
        });
        currentSelector = null;
        currentBodyStart = -1;
        depth--;
      } else if (depth === 1 && currentMedia) {
        currentMedia = null;
        depth = 0;
      }
      buffer = '';
    } else {
      buffer += ch;
    }
    pos++;
  }

  return rules;
}

function extractBackgroundImageFromCssBody(body) {
  if (!body) return null;
  const match = body.match(/background-image\s*:\s*([^;]+)(?:;|$)/i);
  if (!match) return null;
  const rawVal = match[1].trim();
  const isImportant = /!\s*important\s*$/i.test(rawVal);
  const value = rawVal.replace(/!\s*important\s*$/i, '').trim();
  return { value, isImportant };
}

function hasContainerCssRoute(templateJson, sid, options = {}) {
  if (!sid) return false;
  const cleanSid = String(sid).replace(/^sid-/, '');
  const targetClass = `e-sid-${cleanSid}`;

  const allCssTexts = [];
  if (Array.isArray(templateJson?.atomicRules)) {
    allCssTexts.push(...templateJson.atomicRules);
  }
  if (Array.isArray(options?.atomicRules)) {
    allCssTexts.push(...options.atomicRules);
  }
  if (typeof templateJson?.microCss === 'string') {
    allCssTexts.push(templateJson.microCss);
  }
  if (typeof options?.microCss === 'string') {
    allCssTexts.push(options.microCss);
  }

  function walk(els) {
    if (!Array.isArray(els)) return;
    for (const el of els) {
      if (el && el.widgetType === 'html') {
        const html = el.settings?.html;
        if (typeof html === 'string' && html.includes('<style')) {
          const match = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
          if (match && match[1]) {
            allCssTexts.push(match[1]);
          }
        } else if (typeof html === 'string' && html.includes('{')) {
          allCssTexts.push(html);
        }
      }
      if (el && el.elements) walk(el.elements);
    }
  }
  walk(templateJson?.content || (Array.isArray(templateJson) ? templateJson : []));

  for (const text of allCssTexts) {
    if (!text || typeof text !== 'string') continue;
    const rules = parseCssRules(text);
    for (const rule of rules) {
      if (isExactBaseContainerSelector(rule.selector, targetClass) && /background(?:-image)?\s*:/i.test(rule.body)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Finds the effective scoped CSS background-image declaration for a given SID and viewport.
 *
 * @param {Object} templateJson
 * @param {string} sid
 * @param {'desktop'|'tablet'|'mobile'} vp
 * @param {Object} [options]
 * @returns {{ found: boolean, explicit: boolean, value: string, isImportant: boolean, cascaded: boolean } | null}
 */
function findScopedImageCssDeclaration(templateJson, sid, vp, options = {}) {
  if (!sid) return null;
  const cleanSid = String(sid).replace(/^sid-/, '');
  const targetClass = `e-sid-${cleanSid}`;

  const allCssTexts = [];
  if (Array.isArray(templateJson?.atomicRules)) {
    allCssTexts.push(...templateJson.atomicRules);
  }
  if (Array.isArray(options?.atomicRules)) {
    allCssTexts.push(...options.atomicRules);
  }
  if (typeof templateJson?.microCss === 'string') {
    allCssTexts.push(templateJson.microCss);
  }
  if (typeof options?.microCss === 'string') {
    allCssTexts.push(options.microCss);
  }

  function walk(els) {
    if (!Array.isArray(els)) return;
    for (const el of els) {
      if (el && el.widgetType === 'html') {
        const html = el.settings?.html;
        if (typeof html === 'string' && html.includes('<style')) {
          const match = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
          if (match && match[1]) {
            allCssTexts.push(match[1]);
          }
        } else if (typeof html === 'string' && html.includes('{')) {
          allCssTexts.push(html);
        }
      }
      if (el && el.elements) walk(el.elements);
    }
  }
  walk(templateJson?.content || (Array.isArray(templateJson) ? templateJson : []));

  let desktopDecl = null;
  let tabletDecl = null;
  let tabletIsSimple = false;
  let mobileDecl = null;

  for (const text of allCssTexts) {
    if (!text || typeof text !== 'string') continue;
    const rules = parseCssRules(text);
    for (const rule of rules) {
      if (!isExactBaseContainerSelector(rule.selector, targetClass)) continue;
      const decl = extractBackgroundImageFromCssBody(rule.body);
      if (!decl) continue;

      if (!rule.media) {
        desktopDecl = decl;
      } else if (isSimpleTabletMedia(rule.media)) {
        tabletDecl = decl;
        tabletIsSimple = true;
      } else if (/max-width\s*:\s*(?:1024|1024\.98)px/i.test(rule.media)) {
        tabletDecl = decl;
        tabletIsSimple = false;
      } else if (isSimpleMobileMedia(rule.media)) {
        mobileDecl = decl;
      }
    }
  }

  if (vp === 'desktop') {
    if (desktopDecl) {
      return { found: true, explicit: true, value: desktopDecl.value, isImportant: desktopDecl.isImportant, cascaded: false };
    }
    return null;
  }

  if (vp === 'tablet') {
    if (tabletDecl) {
      return { found: true, explicit: true, value: tabletDecl.value, isImportant: tabletDecl.isImportant, cascaded: false };
    }
    return null;
  }

  if (vp === 'mobile') {
    if (mobileDecl) {
      return { found: true, explicit: true, value: mobileDecl.value, isImportant: mobileDecl.isImportant, cascaded: false };
    }
    // Mobile cascades from tablet ONLY if tablet rule is a simple max-width query
    if (tabletDecl && tabletIsSimple) {
      return { found: true, explicit: false, value: tabletDecl.value, isImportant: tabletDecl.isImportant, cascaded: true };
    }
    return null;
  }

  return null;
}

/**
 * Runs verification matrix comparison between GT snapshot and Render snapshot.
 */
function auditVerificationMatrix(gtSnapshot, renderSnapshot, templateJson, options = {}) {
  const auditReport = createAuditReport({
    title: templateJson.title || "Template Verification Matrix Audit",
    totalElements: (templateJson.content || []).length
  });

  const defects = [];
  const viewports = ["desktop", "tablet", "mobile"];

  // Index template elements by SID to detect native editable widgets
  const sidToElement = new Map();
  const leafSids = new Set();
  const sourceContainers = [];
  const auditedSurfaceSids = new Set();

  function indexElements(elements = []) {
    for (const el of elements) {
      const sid = el._sid || el.settings?._sid || el._dom_id || el.settings?._dom_id;
      if (sid) {
        sidToElement.set(sid, el);
        if (el.elType === "widget") {
          leafSids.add(sid);
        } else if (el.elType === "container") {
          sourceContainers.push({ el, sid });
        }
      }
      if (Array.isArray(el.elements)) indexElements(el.elements);
    }
  }
  indexElements(templateJson.content || []);

  // G9 Critical Check: EMPTY_ASSET_URL
  function checkEmptyAssetUrls(elements = []) {
    for (const el of elements) {
      if (el.widgetType === "image") {
        const url = el.settings?.image?.url || el.settings?.url;
        if (!url || typeof url !== 'string' || url.trim() === '') {
          defects.push(createDefect({
            nodeSid: el._sid || el.settings?._sid || el._dom_id || el.id || "image",
            viewport: "desktop",
            property: "url",
            original: "valid_url",
            rendered: "empty",
            severity: "CRITICAL",
            rule: "RULE-ASSET-01",
            rung: "R1",
            routing: "native",
            advisory: false,
            message: `EMPTY_ASSET_URL: Image widget ${el.id || el._sid || 'image'} has empty or missing URL.`
          }));
        }
      }
      if (Array.isArray(el.elements)) checkEmptyAssetUrls(el.elements);
    }
  }
  checkEmptyAssetUrls(templateJson.content || []);

  // A1: content_width CONTRACT (Critical invariant: EVERY inner container must have content_width: 'full')
  function checkContentWidthContract(elements, isRoot = true) {
    for (const el of elements) {
      if (el.elType === "container") {
        const s = el.settings || {};
        if (!isRoot && s.content_width !== "full") {
          defects.push(createDefect({
            nodeSid: el._sid || el.settings?._sid || el._dom_id || el.id || "container",
            viewport: "desktop",
            property: "content_width",
            original: "full",
            rendered: s.content_width || "undefined",
            severity: "CRITICAL",
            rule: "RULE-LAYOUT-01",
            rung: "R1",
            routing: "native",
            advisory: false,
            message: `CONTENT_WIDTH_VIOLATION: Inner container ${el.id || el._sid} has content_width '${s.content_width || 'undefined'}'. Must be 'full' to prevent WordPress 1-column collapse.`
          }));
        }
        if (Array.isArray(el.elements)) checkContentWidthContract(el.elements, false);
      }
    }
  }
  checkContentWidthContract(templateJson.content || [], true);

  // RULE-TOPOLOGY-02 (CRITICAL): Duplicate SID Collision Check in Template Tree
  const seenTemplateSids = new Set();
  function checkDuplicateSids(elements = []) {
    for (const el of elements) {
      const sid = el._sid || el.settings?._sid || el._dom_id || el.settings?._dom_id;
      if (sid) {
        if (seenTemplateSids.has(sid)) {
          defects.push(createDefect({
            nodeSid: sid,
            widgetId: el.id || null,
            viewport: "desktop",
            property: "sid_uniqueness",
            original: "unique",
            rendered: "duplicate",
            severity: "CRITICAL",
            rule: "RULE-TOPOLOGY-02",
            rung: "R1",
            routing: "native",
            advisory: false,
            message: `DUPLICATE_SID_COLLISION: Duplicate sid '${sid}' detected on element ${el.id || 'widget'} in template tree.`
          }));
        } else {
          seenTemplateSids.add(sid);
        }
      }
      if (Array.isArray(el.elements)) checkDuplicateSids(el.elements);
    }
  }
  checkDuplicateSids(templateJson.content || []);

  // RULE-TOPOLOGY-02 (CRITICAL): Duplicate SID Collision Check from Render DOM
  for (const vp of viewports) {
    const renderVp = renderSnapshot?.viewports?.[vp];
    if (renderVp && Array.isArray(renderVp.duplicateSids) && renderVp.duplicateSids.length > 0) {
      for (const dupSid of renderVp.duplicateSids) {
        defects.push(createDefect({
          nodeSid: dupSid,
          widgetId: null,
          viewport: vp,
          property: "sid_uniqueness",
          original: "unique",
          rendered: "duplicate",
          severity: "CRITICAL",
          rule: "RULE-TOPOLOGY-02",
          rung: "R1",
          routing: "native",
          advisory: false,
          message: `DUPLICATE_SID_COLLISION: Elementor render DOM contains duplicate [data-sid="${dupSid}"] at ${vp}.`
        }));
      }
    }
  }

  // RULE-TOPOLOGY-02 (CRITICAL): Section Overlap Check (>20% vertical collision)
  const rootContent = templateJson.content || [];
  let sectionElements = [];
  if (rootContent.length === 1 && rootContent[0].elType === 'container') {
    sectionElements = (rootContent[0].elements || []).filter(el => el.elType === 'container');
  } else {
    sectionElements = rootContent.filter(el => el.elType === 'container');
  }

  for (const vp of viewports) {
    const renderVp = renderSnapshot?.viewports?.[vp];
    if (!renderVp || !renderVp.flat) continue;
    const renderFlat = renderVp.flat;

    const renderedSections = [];
    for (const sec of sectionElements) {
      const sid = sec._sid || sec.settings?._sid || sec._dom_id || sec.settings?._dom_id;
      const node = sid ? renderFlat[sid] : null;
      if (node && node.rect && node.rect.h > 0) {
        renderedSections.push({ sec, sid, rect: node.rect });
      }
    }

    for (let i = 0; i < renderedSections.length - 1; i++) {
      const s1 = renderedSections[i];
      const s2 = renderedSections[i + 1];

      const top1 = s1.rect.y;
      const bottom1 = s1.rect.y + s1.rect.h;
      const top2 = s2.rect.y;
      const bottom2 = s2.rect.y + s2.rect.h;

      // Vertical overlap
      const overlapY = Math.max(0, Math.min(bottom1, bottom2) - Math.max(top1, top2));
      const minH = Math.min(s1.rect.h, s2.rect.h);

      // Horizontal overlap (must share horizontal corridor to be stacked section collision)
      const left1 = s1.rect.x;
      const right1 = s1.rect.x + s1.rect.w;
      const left2 = s2.rect.x;
      const right2 = s2.rect.x + s2.rect.w;
      const overlapX = Math.max(0, Math.min(right1, right2) - Math.max(left1, left2));
      const minW = Math.min(s1.rect.w, s2.rect.w);

      if (minH > 0 && minW > 0 && overlapX > minW * 0.5) {
        const overlapRatio = overlapY / minH;
        if (overlapRatio > 0.20) {
          defects.push(createDefect({
            nodeSid: s2.sid || s1.sid,
            widgetId: s2.sec?.id || s1.sec?.id || null,
            viewport: vp,
            property: "section_overlap",
            original: "0%",
            rendered: `${Math.round(overlapRatio * 100)}%`,
            severity: "CRITICAL",
            rule: "RULE-TOPOLOGY-02",
            rung: "R1",
            routing: "native",
            advisory: false,
            message: `SECTION_OVERLAP_COLLISION: Section ${s2.sid || s2.sec?.id} vertically overlaps section ${s1.sid || s1.sec?.id} by ${Math.round(overlapRatio * 100)}% (>20% threshold) at ${vp}.`
          }));
        }
      }
    }
  }

  function isDescendantOfLeaf(sid, gtFlat) {
    let curr = gtFlat[sid];
    while (curr && curr.parentSid) {
      if (leafSids.has(curr.parentSid)) return true;
      curr = gtFlat[curr.parentSid];
    }
    return false;
  }

  // Helper to compare canvas colors by parsed channels & alpha
  function isCanvasColorMatch(c1Str, c2Str) {
    if (!c1Str || !c2Str) return false;
    const p1 = parseCssColor(c1Str);
    const p2 = parseCssColor(c2Str);
    if (!p1 || !p2) return false;
    return p1.r === p2.r &&
           p1.g === p2.g &&
           p1.b === p2.b &&
           Math.abs(p1.alpha - p2.alpha) < 0.001;
  }

  // RULE-CANVAS-01: Page Canvas Ground Truth Parity Audit
  if (gtSnapshot) {
    const canvasDecision = resolvePageCanvas(gtSnapshot);

    if (canvasDecision.status === 'SOLID_COLOR') {
      const expectedColor = canvasDecision.color;
      const pageSettings = templateJson?.page_settings;
      const pageBg = pageSettings?.background_color;
      const pageBgMode = pageSettings?.background_background;
      const pageBgImage = pageSettings?.background_image;

      if (hasNonEmptyBackgroundImage(pageBgImage)) {
        const bgImgVal = typeof pageBgImage === 'object'
          ? (pageBgImage.url || JSON.stringify(pageBgImage))
          : pageBgImage;
        for (const vp of viewports) {
          defects.push(createDefect({
            nodeSid: 'canvas',
            widgetId: null,
            viewport: vp,
            property: 'background_image',
            original: 'none',
            rendered: bgImgVal,
            severity: 'HIGH',
            rule: 'RULE-CANVAS-01',
            rung: 'R0',
            advisory: false,
            message: `Elementor page_settings contains unexpected background_image for solid canvas at ${vp}.`
          }));
        }
      }

      for (const vp of viewports) {
        if (!pageBg || typeof pageBg !== 'string' || pageBg.trim() === '') {
          defects.push(createDefect({
            nodeSid: 'canvas',
            widgetId: null,
            viewport: vp,
            property: 'backgroundColor',
            original: expectedColor,
            rendered: 'missing_page_setting',
            severity: 'HIGH',
            rule: 'RULE-CANVAS-01',
            rung: 'R0',
            advisory: false,
            message: `Canvas background color missing in templateJson.page_settings at ${vp}: expected ${expectedColor}.`
          }));
        } else if (pageBgMode !== 'classic') {
          defects.push(createDefect({
            nodeSid: 'canvas',
            widgetId: null,
            viewport: vp,
            property: 'background_background',
            original: 'classic',
            rendered: pageBgMode || 'missing_mode',
            severity: 'HIGH',
            rule: 'RULE-CANVAS-01',
            rung: 'R0',
            advisory: false,
            message: `Canvas background mode missing or invalid in templateJson.page_settings at ${vp}: expected background_background: 'classic', got ${JSON.stringify(pageBgMode)}.`
          }));
        } else if (!isCanvasColorMatch(pageBg, expectedColor)) {
          defects.push(createDefect({
            nodeSid: 'canvas',
            widgetId: null,
            viewport: vp,
            property: 'backgroundColor',
            original: expectedColor,
            rendered: pageBg,
            severity: 'HIGH',
            rule: 'RULE-CANVAS-01',
            rung: 'R0',
            advisory: false,
            message: `Canvas templateJson.page_settings background mismatch at ${vp}: expected ${expectedColor}, got ${pageBg}.`
          }));
        } else {
          // Native Elementor settings are valid; now verify rendered body canvas
          const renderVp = renderSnapshot?.viewports?.[vp];
          const renderBody = renderVp?.canvas?.body;
          const renderBg = renderBody?.backgroundColor;
          const renderBgImg = renderBody?.backgroundImage;

          if (!renderBody || typeof renderBg !== 'string' || renderBg.trim() === '') {
            defects.push(createDefect({
              nodeSid: 'canvas',
              widgetId: null,
              viewport: vp,
              property: 'backgroundColor',
              original: expectedColor,
              rendered: 'missing_render_capture',
              severity: 'HIGH',
              rule: 'RULE-CANVAS-01',
              rung: 'R0',
              advisory: false,
              message: `Canvas render capture missing for viewport ${vp}: expected ${expectedColor}.`
            }));
          } else if (typeof renderBgImg !== 'string' || renderBgImg.trim() === '') {
            defects.push(createDefect({
              nodeSid: 'canvas',
              widgetId: null,
              viewport: vp,
              property: 'backgroundImage',
              original: 'none',
              rendered: 'missing_render_capture',
              severity: 'HIGH',
              rule: 'RULE-CANVAS-01',
              rung: 'R0',
              advisory: false,
              message: `Canvas render capture missing backgroundImage for viewport ${vp}: expected "none".`
            }));
          } else if (renderBgImg.trim().toLowerCase() !== 'none') {
            defects.push(createDefect({
              nodeSid: 'canvas',
              widgetId: null,
              viewport: vp,
              property: 'backgroundImage',
              original: 'none',
              rendered: renderBgImg,
              severity: 'HIGH',
              rule: 'RULE-CANVAS-01',
              rung: 'R0',
              advisory: false,
              message: `Canvas rendered with unexpected backgroundImage at ${vp}: expected "none", got ${renderBgImg}.`
            }));
          } else if (!isCanvasColorMatch(renderBg, expectedColor)) {
            defects.push(createDefect({
              nodeSid: 'canvas',
              widgetId: null,
              viewport: vp,
              property: 'backgroundColor',
              original: expectedColor,
              rendered: renderBg,
              severity: 'HIGH',
              rule: 'RULE-CANVAS-01',
              rung: 'R0',
              advisory: false,
              message: `Canvas background color mismatch at ${vp}: expected ${expectedColor}, got ${renderBg}.`
            }));
          }
        }
      }
    } else if (['UNSUPPORTED_LAYERED', 'RESPONSIVE_CANVAS_UNSUPPORTED', 'INVALID_CAPTURE'].includes(canvasDecision.status)) {
      defects.push(createDefect({
        nodeSid: 'canvas',
        widgetId: null,
        viewport: 'desktop',
        property: 'canvasMode',
        original: canvasDecision.status,
        rendered: canvasDecision.reason || canvasDecision.status,
        severity: 'HIGH',
        rule: 'RULE-CANVAS-01',
        rung: 'R0',
        advisory: false,
        message: `Canvas parity cannot be verified: [${canvasDecision.status}] ${canvasDecision.reason || ''}.`
      }));
    } else if (canvasDecision.status === 'TRANSPARENT_DEFAULT') {
      const pageSettings = templateJson?.page_settings;
      const pageBg = pageSettings?.background_color;
      const pageBgMode = pageSettings?.background_background;
      const pageBgImage = pageSettings?.background_image;

      if (pageBg && typeof pageBg === 'string' && pageBg.trim() !== '' && pageBg.trim() !== 'transparent') {
        defects.push(createDefect({
          nodeSid: 'canvas',
          widgetId: null,
          viewport: 'desktop',
          property: 'backgroundColor',
          original: 'transparent',
          rendered: pageBg,
          severity: 'HIGH',
          rule: 'RULE-CANVAS-01',
          rung: 'R0',
          advisory: false,
          message: `Compiler emitted invented page background color for transparent default canvas: ${pageBg}.`
        }));
      }

      if (pageBgMode && typeof pageBgMode === 'string' && pageBgMode.trim() !== '') {
        defects.push(createDefect({
          nodeSid: 'canvas',
          widgetId: null,
          viewport: 'desktop',
          property: 'background_background',
          original: null,
          rendered: pageBgMode,
          severity: 'HIGH',
          rule: 'RULE-CANVAS-01',
          rung: 'R0',
          advisory: false,
          message: `Compiler emitted invented page background mode for transparent default canvas: background_background: '${pageBgMode}'.`
        }));
      }

      if (hasNonEmptyBackgroundImage(pageBgImage)) {
        const bgImgVal = typeof pageBgImage === 'object'
          ? (pageBgImage.url || JSON.stringify(pageBgImage))
          : pageBgImage;
        defects.push(createDefect({
          nodeSid: 'canvas',
          widgetId: null,
          viewport: 'desktop',
          property: 'background_image',
          original: null,
          rendered: bgImgVal,
          severity: 'HIGH',
          rule: 'RULE-CANVAS-01',
          rung: 'R0',
          advisory: false,
          message: `Compiler emitted invented page background_image for transparent default canvas.`
        }));
      }

      // Check render canvas capture across viewports
      for (const vp of viewports) {
        const renderVp = renderSnapshot?.viewports?.[vp];
        const renderBody = renderVp?.canvas?.body;
        const renderBg = renderBody?.backgroundColor;
        const renderBgImg = renderBody?.backgroundImage;

        if (!renderBody || typeof renderBg !== 'string' || renderBg.trim() === '' || typeof renderBgImg !== 'string' || renderBgImg.trim() === '') {
          defects.push(createDefect({
            nodeSid: 'canvas',
            widgetId: null,
            viewport: vp,
            property: 'canvasCapture',
            original: 'valid_capture',
            rendered: 'missing_render_capture',
            severity: 'HIGH',
            rule: 'RULE-CANVAS-01',
            rung: 'R0',
            advisory: false,
            message: `Canvas render capture missing for transparent canvas at ${vp}: unverified.`
          }));
        }
      }
    }
  }

  for (const vp of viewports) {
    const gtVp = gtSnapshot?.viewports?.[vp];
    const renderVp = renderSnapshot?.viewports?.[vp];

    if (!gtVp || !renderVp) continue;

    const gtFlat = gtVp.flat || {};
    const renderFlat = renderVp.flat || {};

    // RULE-SURFACE-01: Source-Derived Container Surface Verification
    for (const { el: containerEl, sid } of sourceContainers) {
      const gtNode = gtFlat[sid];
      if (!gtNode || gtNode.tag === 'body') continue;

      auditedSurfaceSids.add(sid);

      let gtBgColor = '';
      let gtBgImage = '';
      let gtStyleReadFailed = false;

      try {
        gtBgColor = readComputedCssProperty(gtNode, gtSnapshot, vp, 'background-color', 'backgroundColor');
      } catch (err) {
        gtStyleReadFailed = true;
        defects.push(createDefect({
          nodeSid: sid,
          widgetId: containerEl.id || null,
          viewport: vp,
          property: 'backgroundColor',
          original: 'computedStyle',
          rendered: err.code || err.reason || 'MISSING_STYLE',
          severity: 'HIGH',
          rule: 'RULE-SURFACE-01',
          rung: 'R0',
          advisory: false,
          message: `Container ${sid} failed to read computed background-color at ${vp}: ${err.message}`
        }));
      }

      try {
        gtBgImage = readComputedCssProperty(gtNode, gtSnapshot, vp, 'background-image', 'backgroundImage');
      } catch (err) {
        gtStyleReadFailed = true;
        defects.push(createDefect({
          nodeSid: sid,
          widgetId: containerEl.id || null,
          viewport: vp,
          property: 'backgroundImage',
          original: 'computedStyle',
          rendered: err.code || err.reason || 'MISSING_STYLE',
          severity: 'HIGH',
          rule: 'RULE-SURFACE-01',
          rung: 'R0',
          advisory: false,
          message: `Container ${sid} failed to read computed background-image at ${vp}: ${err.message}`
        }));
      }

      if (gtStyleReadFailed) continue;

      const renderNode = renderFlat[sid];
      const rns = renderNode?.styles;
      const tmplSettings = containerEl?.settings || {};

      if (!renderNode || !rns) {
        defects.push(createDefect({
          nodeSid: sid,
          widgetId: containerEl.id || null,
          viewport: vp,
          property: 'surface',
          original: 'rendered_container',
          rendered: 'missing',
          severity: 'HIGH',
          rule: 'RULE-SURFACE-01',
          rung: 'R0',
          advisory: false,
          message: `Rendered container ${sid} or its styles missing at ${vp}.`
        }));
        continue;
      }

      if (rns.backgroundColor === undefined || rns.backgroundColor === null) {
        defects.push(createDefect({
          nodeSid: sid,
          widgetId: containerEl.id || null,
          viewport: vp,
          property: 'backgroundColor',
          original: gtBgColor,
          rendered: 'missing',
          severity: 'HIGH',
          rule: 'RULE-SURFACE-01',
          rung: 'R0',
          advisory: false,
          message: `Rendered container ${sid} missing backgroundColor style at ${vp}.`
        }));
        continue;
      }

      const rnBgColor = rns.backgroundColor || '';
      const rawRnBgImg = rns.backgroundImage;
      const rnBgImgMissingOrEmpty = (rawRnBgImg === undefined || rawRnBgImg === null || String(rawRnBgImg).trim() === '');
      const rnBgImgLower = !rnBgImgMissingOrEmpty ? String(rawRnBgImg).trim().toLowerCase() : '';
      const rnHasNoneImage = !rnBgImgMissingOrEmpty && rnBgImgLower === 'none';

      // Block 8.2 — Phase 6, Part 6C-2: CSS-Controlled Gradient Verification
      let containerGradPlan = null;
      try {
        const dNode = gtSnapshot?.viewports?.desktop?.flat?.[sid];
        const tNode = gtSnapshot?.viewports?.tablet?.flat?.[sid];
        const mNode = gtSnapshot?.viewports?.mobile?.flat?.[sid];
        if (dNode && tNode && mNode) {
          const vStyles = {
            desktop: {
              backgroundImage: readComputedCssProperty(dNode, gtSnapshot, 'desktop', 'background-image', 'backgroundImage'),
              backgroundColor: readComputedCssProperty(dNode, gtSnapshot, 'desktop', 'background-color', 'backgroundColor')
            },
            tablet: {
              backgroundImage: readComputedCssProperty(tNode, gtSnapshot, 'tablet', 'background-image', 'backgroundImage'),
              backgroundColor: readComputedCssProperty(tNode, gtSnapshot, 'tablet', 'background-color', 'backgroundColor')
            },
            mobile: {
              backgroundImage: readComputedCssProperty(mNode, gtSnapshot, 'mobile', 'background-image', 'backgroundImage'),
              backgroundColor: readComputedCssProperty(mNode, gtSnapshot, 'mobile', 'background-color', 'backgroundColor')
            }
          };
          containerGradPlan = resolveScopedGradientPlan(vStyles);
        }
      } catch (e) {
        containerGradPlan = null;
      }

      const rawSid = containerEl._sid || tmplSettings._sid || containerEl._dom_id || tmplSettings._dom_id || sid || '';
      const cleanSid = String(rawSid).replace(/^sid-/, '');
      const expectedSidClass = `e-sid-${cleanSid}`;
      const classTokens = [
        ...(typeof tmplSettings._css_classes === 'string' ? tmplSettings._css_classes.trim().split(/\s+/) : []),
        ...(typeof tmplSettings.css_classes === 'string' ? tmplSettings.css_classes.trim().split(/\s+/) : [])
      ];
      const hasSidClass = classTokens.includes(expectedSidClass);

      const hasCssRoute = hasContainerCssRoute(templateJson, sid, options);
      const isCssControlled = Boolean(
        hasSidClass &&
        hasCssRoute &&
        containerGradPlan &&
        containerGradPlan.supported &&
        containerGradPlan.cssControlled &&
        containerGradPlan.cssControlled[vp]
      );

      if (isCssControlled) {
        // 1. Verify rendered backgroundImage against full Chromium-computed GT value
        if (rnBgImgMissingOrEmpty) {
          defects.push(createDefect({
            nodeSid: sid,
            widgetId: containerEl.id || null,
            viewport: vp,
            property: 'backgroundImage',
            original: gtBgImage,
            rendered: 'missing_render_background_image',
            severity: 'HIGH',
            rule: 'RULE-SURFACE-01',
            rung: 'R0',
            advisory: false,
            message: `Container ${sid} rendered backgroundImage missing or empty at ${vp}: expected "${gtBgImage}".`
          }));
        } else {
          function normalizeGrad(s) {
            return String(s || '').replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim();
          }
          const normGt = normalizeGrad(gtBgImage);
          const normRn = normalizeGrad(rawRnBgImg);

          if (normGt !== normRn) {
            defects.push(createDefect({
              nodeSid: sid,
              widgetId: containerEl.id || null,
              viewport: vp,
              property: 'backgroundImage',
              original: gtBgImage,
              rendered: String(rawRnBgImg).trim(),
              severity: 'HIGH',
              rule: 'RULE-SURFACE-01',
              rung: 'R0',
              advisory: false,
              message: `Unverified surface: container ${sid} rendered gradient mismatch at ${vp}: expected "${gtBgImage}", got "${rawRnBgImg}".`
            }));
          }
        }

        // 2. Verify rendered backgroundColor semantically including alpha
        const rawRnBgColor = rns.backgroundColor;
        if (rawRnBgColor === undefined || rawRnBgColor === null || (typeof rawRnBgColor === 'string' && rawRnBgColor.trim() === '')) {
          defects.push(createDefect({
            nodeSid: sid,
            widgetId: containerEl.id || null,
            viewport: vp,
            property: 'backgroundColor',
            original: gtBgColor,
            rendered: (rawRnBgColor === undefined || rawRnBgColor === null) ? 'missing' : 'empty',
            severity: 'HIGH',
            rule: 'RULE-SURFACE-01',
            rung: 'R0',
            advisory: false,
            message: `Container ${sid} rendered backgroundColor missing or empty at ${vp}: expected "${gtBgColor}".`
          }));
        } else {
          const colorComp = compareContainerBackgroundColors(gtBgColor, String(rawRnBgColor).trim());
          if (colorComp.unparseable) {
            defects.push(createDefect({
              nodeSid: sid,
              widgetId: containerEl.id || null,
              viewport: vp,
              property: 'backgroundColor',
              original: gtBgColor,
              rendered: String(rawRnBgColor).trim(),
              severity: 'HIGH',
              rule: 'RULE-SURFACE-01',
              rung: 'R0',
              advisory: false,
              message: colorComp.reason || `Container ${sid} has unparseable background color at ${vp}.`
            }));
          } else if (!colorComp.match) {
            defects.push(createDefect({
              nodeSid: sid,
              widgetId: containerEl.id || null,
              viewport: vp,
              property: 'backgroundColor',
              original: gtBgColor,
              rendered: String(rawRnBgColor).trim(),
              severity: 'HIGH',
              rule: 'RULE-SURFACE-01',
              rung: 'R0',
              advisory: false,
              message: `Container ${sid} background color mismatch at ${vp}: expected ${gtBgColor}, got ${String(rawRnBgColor).trim()}. ${colorComp.reason || ''}`.trim()
            }));
          }
        }

        continue;
      }

      const gtHasNoneImage = isNoneBackgroundImage(gtBgImage);

      if (gtHasNoneImage) {
        const scopedImageDecl = findScopedImageCssDeclaration(templateJson, sid, vp, options);
        const hasValidNoneCssRoute = Boolean(
          hasSidClass &&
          scopedImageDecl &&
          scopedImageDecl.value === 'none' &&
          scopedImageDecl.isImportant
        );
        const isVerifiedNoneReset = hasValidNoneCssRoute && rnHasNoneImage;

        if (!isVerifiedNoneReset) {
          if (hasValidNoneCssRoute) {
            // Template is verified via scoped CSS; defect is strictly in rendered output
            if (rnBgImgMissingOrEmpty) {
              defects.push(createDefect({
                nodeSid: sid,
                widgetId: containerEl.id || null,
                viewport: vp,
                property: 'backgroundImage',
                original: 'none',
                rendered: 'missing_render_background_image',
                severity: 'HIGH',
                rule: 'RULE-SURFACE-01',
                rung: 'R0',
                advisory: false,
                message: `Container ${sid} rendered backgroundImage missing or empty at ${vp}: expected "none".`
              }));
            } else if (!rnHasNoneImage) {
              defects.push(createDefect({
                nodeSid: sid,
                widgetId: containerEl.id || null,
                viewport: vp,
                property: 'backgroundImage',
                original: 'none',
                rendered: String(rawRnBgImg).trim(),
                severity: 'HIGH',
                rule: 'RULE-SURFACE-01',
                rung: 'R0',
                advisory: false,
                message: `Container ${sid} rendered with unexpected backgroundImage at ${vp}: expected "none", got ${rawRnBgImg}.`
              }));
            }
          } else {
            // Template does not have a verified scoped CSS reset
            if (
              (vp === 'tablet' || vp === 'mobile') &&
              tmplSettings.background_background === 'classic' &&
              tmplSettings.background_image &&
              typeof tmplSettings.background_image.url === 'string' &&
              tmplSettings.background_image.url.trim() !== ''
            ) {
              const res = resolveEffectiveTemplateImageUrl(tmplSettings, vp);
              defects.push(createDefect({
                nodeSid: sid,
                widgetId: containerEl.id || null,
                viewport: vp,
                property: 'backgroundImage',
                original: 'none',
                rendered: String(rawRnBgImg).trim(),
                severity: 'HIGH',
                rule: 'RULE-SURFACE-01',
                rung: 'R0',
                advisory: false,
                message: `Unverified surface: container ${sid} has unsupported transition to background-image: none at ${vp}: effective template retains image "${res.url || tmplSettings.background_image.url.trim()}". Native clear to none is unsupported.`
              }));
            } else if (rnBgImgMissingOrEmpty) {
              defects.push(createDefect({
                nodeSid: sid,
                widgetId: containerEl.id || null,
                viewport: vp,
                property: 'backgroundImage',
                original: 'none',
                rendered: 'missing_render_background_image',
                severity: 'HIGH',
                rule: 'RULE-SURFACE-01',
                rung: 'R0',
                advisory: false,
                message: `Container ${sid} rendered backgroundImage missing or empty at ${vp}: expected "none".`
              }));
            } else if (!rnHasNoneImage) {
              defects.push(createDefect({
                nodeSid: sid,
                widgetId: containerEl.id || null,
                viewport: vp,
                property: 'backgroundImage',
                original: 'none',
                rendered: String(rawRnBgImg).trim(),
                severity: 'HIGH',
                rule: 'RULE-SURFACE-01',
                rung: 'R0',
                advisory: false,
                message: `Container ${sid} rendered with unexpected backgroundImage at ${vp}: expected "none", got ${rawRnBgImg}.`
              }));
            }
          }
        }
      } else {
        // GT has image or gradient
        if (rnBgImgMissingOrEmpty || rnHasNoneImage) {
          defects.push(createDefect({
            nodeSid: sid,
            widgetId: containerEl.id || null,
            viewport: vp,
            property: 'backgroundImage',
            original: gtBgImage,
            rendered: rnBgImgMissingOrEmpty ? 'missing_render_background_image' : 'none',
            severity: 'HIGH',
            rule: 'RULE-SURFACE-01',
            rung: 'R0',
            advisory: false,
            message: `Container ${sid} missing backgroundImage at ${vp}: expected ${gtBgImage}, got "${rnBgImgMissingOrEmpty ? 'missing' : 'none'}".`
          }));
        } else {
          // Both GT and render have background-image
          const gtGrad = parseLinearGradient(gtBgImage, gtBgColor);

          if (gtGrad.mode === 'native-linear') {
            let templateValid = true;
            let templateMismatchReason = '';

            if (tmplSettings.background_background !== 'gradient') {
              templateValid = false;
              templateMismatchReason = `Template background_background expected "gradient", got "${tmplSettings.background_background}"`;
            } else if (tmplSettings.background_gradient_type !== 'linear') {
              templateValid = false;
              templateMismatchReason = `Template background_gradient_type expected "linear", got "${tmplSettings.background_gradient_type}"`;
            } else if (Object.prototype.hasOwnProperty.call(tmplSettings, 'background_image')) {
              templateValid = false;
              templateMismatchReason = 'Template background_image must be absent for gradient containers';
            } else {
              // Validate colors, stops, and angle against parser settings
              const color1Comp = compareContainerBackgroundColors(gtGrad.settings.background_color, tmplSettings.background_color);
              if (!color1Comp.match) {
                templateValid = false;
                templateMismatchReason = `Template background_color mismatch: expected ${gtGrad.settings.background_color}, got ${tmplSettings.background_color}`;
              } else {
                const color2Comp = compareContainerBackgroundColors(gtGrad.settings.background_color_b, tmplSettings.background_color_b);
                if (!color2Comp.match) {
                  templateValid = false;
                  templateMismatchReason = `Template background_color_b mismatch: expected ${gtGrad.settings.background_color_b}, got ${tmplSettings.background_color_b}`;
                } else {
                  const stop1Res = resolveEffectiveGradientSetting(tmplSettings, 'background_color_stop', vp, validateGradientStopSetting);
                  if (!stop1Res.valid) {
                    templateValid = false;
                    templateMismatchReason = stop1Res.error;
                  } else if (stop1Res.value !== gtGrad.settings.background_color_stop.size) {
                    templateValid = false;
                    templateMismatchReason = `Template background_color_stop mismatch: expected ${gtGrad.settings.background_color_stop.size}%, got ${stop1Res.value}%`;
                  } else {
                    const stop2Res = resolveEffectiveGradientSetting(tmplSettings, 'background_color_b_stop', vp, validateGradientStopSetting);
                    if (!stop2Res.valid) {
                      templateValid = false;
                      templateMismatchReason = stop2Res.error;
                    } else if (stop2Res.value !== gtGrad.settings.background_color_b_stop.size) {
                      templateValid = false;
                      templateMismatchReason = `Template background_color_b_stop mismatch: expected ${gtGrad.settings.background_color_b_stop.size}%, got ${stop2Res.value}%`;
                    } else {
                      const angleRes = resolveEffectiveGradientSetting(tmplSettings, 'background_gradient_angle', vp, validateGradientAngleSetting);
                      if (!angleRes.valid) {
                        templateValid = false;
                        templateMismatchReason = angleRes.error;
                      } else if (angleRes.value !== gtGrad.settings.background_gradient_angle.size) {
                        templateValid = false;
                        templateMismatchReason = `Template background_gradient_angle mismatch: expected ${gtGrad.settings.background_gradient_angle.size}deg, got ${angleRes.value}deg`;
                      }
                    }
                  }
                }
              }
            }

            if (!templateValid) {
              defects.push(createDefect({
                nodeSid: sid,
                widgetId: containerEl.id || null,
                viewport: vp,
                property: 'backgroundImage',
                original: gtBgImage,
                rendered: String(rawRnBgImg).trim(),
                severity: 'HIGH',
                rule: 'RULE-SURFACE-01',
                rung: 'R0',
                advisory: false,
                message: `Unverified surface: container ${sid} native gradient template settings invalid at ${vp}: ${templateMismatchReason}.`
              }));
            } else {
              // Verify rendered background color is a non-empty string before parsing gradient
              const rawRnBgColor = rns.backgroundColor;
              if (typeof rawRnBgColor !== 'string' || rawRnBgColor.trim() === '') {
                defects.push(createDefect({
                  nodeSid: sid,
                  widgetId: containerEl.id || null,
                  viewport: vp,
                  property: 'backgroundColor',
                  original: gtBgColor,
                  rendered: 'missing_render_background_color',
                  severity: 'HIGH',
                  rule: 'RULE-SURFACE-01',
                  rung: 'R0',
                  advisory: false,
                  message: `Container ${sid} rendered backgroundColor missing or empty at ${vp}: expected transparent base color.`
                }));
              } else {
                // Parse rendered gradient (using raw rendered background image and background color)
                const rnGrad = parseLinearGradient(String(rawRnBgImg).trim(), rawRnBgColor.trim());

                if (rnGrad.mode !== 'native-linear') {
                  defects.push(createDefect({
                    nodeSid: sid,
                    widgetId: containerEl.id || null,
                    viewport: vp,
                    property: 'backgroundImage',
                    original: gtBgImage,
                    rendered: `${String(rawRnBgImg).trim()}${rawRnBgColor ? ` (bgColor: ${rawRnBgColor.trim()})` : ''}`,
                    severity: 'HIGH',
                    rule: 'RULE-SURFACE-01',
                    rung: 'R0',
                    advisory: false,
                    message: `Unverified surface: container ${sid} rendered gradient invalid or unsupported at ${vp}: ${rnGrad.reason || 'not_native_linear'}. Expected linear gradient with transparent background, got image "${rawRnBgImg}" and color "${rawRnBgColor.trim()}".`
                  }));
                } else {
                  // Compare GT gradient vs Rendered gradient
                const gtAngle = gtGrad.settings.background_gradient_angle.size;
                const rnAngle = rnGrad.settings.background_gradient_angle.size;
                const gtStop1 = gtGrad.settings.background_color_stop.size;
                const rnStop1 = rnGrad.settings.background_color_stop.size;
                const gtStop2 = gtGrad.settings.background_color_b_stop.size;
                const rnStop2 = rnGrad.settings.background_color_b_stop.size;

                const compColor1 = compareContainerBackgroundColors(gtGrad.settings.background_color, rnGrad.settings.background_color);
                const compColor2 = compareContainerBackgroundColors(gtGrad.settings.background_color_b, rnGrad.settings.background_color_b);

                let gradMismatchReason = '';
                if (gtAngle !== rnAngle) {
                  gradMismatchReason = `gradient angle mismatch: expected ${gtAngle}deg, got ${rnAngle}deg`;
                } else if (gtStop1 !== rnStop1 || gtStop2 !== rnStop2) {
                  gradMismatchReason = `gradient stop mismatch: expected [${gtStop1}%, ${gtStop2}%], got [${rnStop1}%, ${rnStop2}%]`;
                } else if (!compColor1.match) {
                  gradMismatchReason = `first gradient color mismatch: expected ${gtGrad.settings.background_color}, got ${rnGrad.settings.background_color}. ${compColor1.reason || ''}`.trim();
                } else if (!compColor2.match) {
                  gradMismatchReason = `second gradient color mismatch: expected ${gtGrad.settings.background_color_b}, got ${rnGrad.settings.background_color_b}. ${compColor2.reason || ''}`.trim();
                }

                if (gradMismatchReason) {
                  defects.push(createDefect({
                    nodeSid: sid,
                    widgetId: containerEl.id || null,
                    viewport: vp,
                    property: 'backgroundImage',
                    original: gtBgImage,
                    rendered: String(rawRnBgImg).trim(),
                    severity: 'HIGH',
                    rule: 'RULE-SURFACE-01',
                    rung: 'R0',
                    advisory: false,
                    message: `Unverified surface: container ${sid} rendered gradient mismatch at ${vp}: ${gradMismatchReason}. Expected "${gtBgImage}", got "${rawRnBgImg}".`
                  }));
                }
                // If everything matches: zero defects!
              }
            }
          }
        } else {
          const gtSingleImg = extractSingleImageUrl(gtBgImage);

          if (gtSingleImg) {
            let templateValid = true;
            let templateMismatchReason = '';
            let effectiveTmplUrl = '';

            const scopedImageDecl = findScopedImageCssDeclaration(templateJson, sid, vp, options);
            const cssImgUrl = scopedImageDecl?.value ? extractSingleImageUrl(scopedImageDecl.value) : null;
            const isCssImageRouteValid = Boolean(hasSidClass && cssImgUrl === gtSingleImg && scopedImageDecl?.isImportant);

            const tabletScopedDecl = (vp === 'mobile') ? findScopedImageCssDeclaration(templateJson, sid, 'tablet', options) : null;
            const tabletHasNoneReset = Boolean(hasSidClass && tabletScopedDecl?.value === 'none' && tabletScopedDecl?.isImportant);

            if (tabletHasNoneReset && vp === 'mobile') {
              // Tablet has active none reset. Mobile MUST explicitly re-apply via scoped CSS rule
              if (!isCssImageRouteValid || !scopedImageDecl.explicit) {
                templateValid = false;
                templateMismatchReason = `Container ${sid} tablet has active scoped "none !important" reset; mobile must explicitly re-apply image via scoped CSS route (GT URL: "${gtSingleImg}")`;
              } else {
                templateValid = true;
                effectiveTmplUrl = cssImgUrl;
              }
            } else if (isCssImageRouteValid) {
              templateValid = true;
              effectiveTmplUrl = cssImgUrl;
            } else {
              // Check native Elementor settings
              if (tmplSettings.background_background !== 'classic') {
                templateValid = false;
                templateMismatchReason = `Template background_background expected "classic", got "${tmplSettings.background_background}"`;
              } else {
                const res = resolveEffectiveTemplateImageUrl(tmplSettings, vp);
                effectiveTmplUrl = res.url;
                if (!res.valid) {
                  templateValid = false;
                  templateMismatchReason = res.reason;
                } else if (res.url !== gtSingleImg) {
                  templateValid = false;
                  templateMismatchReason = `Template background_image.url mismatch: expected "${gtSingleImg}", got "${res.url}"`;
                }
              }
            }

            if (!templateValid) {
              defects.push(createDefect({
                nodeSid: sid,
                widgetId: containerEl.id || null,
                viewport: vp,
                property: 'backgroundImage',
                original: gtSingleImg,
                rendered: effectiveTmplUrl || String(tmplSettings.background_background) || 'missing_or_invalid',
                severity: 'HIGH',
                rule: 'RULE-SURFACE-01',
                rung: 'R0',
                advisory: false,
                message: `Unverified surface: container ${sid} native image template settings invalid at ${vp}: ${templateMismatchReason}. (GT URL: "${gtSingleImg}", effective template URL: "${effectiveTmplUrl || 'none'}")`
              }));
            } else {
              // Template is valid: verify rendered backgroundImage
              const rnSingleImg = extractSingleImageUrl(rawRnBgImg);
              if (!rnSingleImg) {
                defects.push(createDefect({
                  nodeSid: sid,
                  widgetId: containerEl.id || null,
                  viewport: vp,
                  property: 'backgroundImage',
                  original: gtSingleImg,
                  rendered: String(rawRnBgImg).trim(),
                  severity: 'HIGH',
                  rule: 'RULE-SURFACE-01',
                  rung: 'R0',
                  advisory: false,
                  message: `Unverified surface: container ${sid} rendered background image invalid or unparseable at ${vp}: expected single image URL "${gtSingleImg}", got "${String(rawRnBgImg).trim()}".`
                }));
              } else if (rnSingleImg !== gtSingleImg) {
                defects.push(createDefect({
                  nodeSid: sid,
                  widgetId: containerEl.id || null,
                  viewport: vp,
                  property: 'backgroundImage',
                  original: gtSingleImg,
                  rendered: rnSingleImg,
                  severity: 'HIGH',
                  rule: 'RULE-SURFACE-01',
                  rung: 'R0',
                  advisory: false,
                  message: `Unverified surface: container ${sid} rendered background image URL mismatch at ${vp}: expected "${gtSingleImg}", got "${rnSingleImg}".`
                }));
              }
            }

            // Verify rendered backgroundColor against GT backgroundColor
            const rawRnBgColor = rns.backgroundColor;
            if (rawRnBgColor === undefined || rawRnBgColor === null || (typeof rawRnBgColor === 'string' && rawRnBgColor.trim() === '')) {
              defects.push(createDefect({
                nodeSid: sid,
                widgetId: containerEl.id || null,
                viewport: vp,
                property: 'backgroundColor',
                original: gtBgColor,
                rendered: (rawRnBgColor === undefined || rawRnBgColor === null) ? 'missing' : 'empty',
                severity: 'HIGH',
                rule: 'RULE-SURFACE-01',
                rung: 'R0',
                advisory: false,
                message: `Container ${sid} rendered backgroundColor missing or empty at ${vp}: expected "${gtBgColor}".`
              }));
            } else {
              const colorComp = compareContainerBackgroundColors(gtBgColor, String(rawRnBgColor).trim());
              if (colorComp.unparseable) {
                defects.push(createDefect({
                  nodeSid: sid,
                  widgetId: containerEl.id || null,
                  viewport: vp,
                  property: 'backgroundColor',
                  original: gtBgColor,
                  rendered: String(rawRnBgColor).trim(),
                  severity: 'HIGH',
                  rule: 'RULE-SURFACE-01',
                  rung: 'R0',
                  advisory: false,
                  message: colorComp.reason || `Container ${sid} has unparseable background color at ${vp}.`
                }));
              } else if (!colorComp.match) {
                defects.push(createDefect({
                  nodeSid: sid,
                  widgetId: containerEl.id || null,
                  viewport: vp,
                  property: 'backgroundColor',
                  original: gtBgColor,
                  rendered: String(rawRnBgColor).trim(),
                  severity: 'HIGH',
                  rule: 'RULE-SURFACE-01',
                  rung: 'R0',
                  advisory: false,
                  message: `Container ${sid} background color mismatch at ${vp}: expected ${gtBgColor}, got ${String(rawRnBgColor).trim()}. ${colorComp.reason || ''}`.trim()
                }));
              }
            }
          } else {
            const unsuppReason = containerGradPlan && !containerGradPlan.supported
              ? ` (${containerGradPlan.reason})`
              : '';
            defects.push(createDefect({
              nodeSid: sid,
              widgetId: containerEl.id || null,
              viewport: vp,
              property: 'backgroundImage',
              original: gtBgImage,
              rendered: String(rawRnBgImg).trim(),
              severity: 'HIGH',
              rule: 'RULE-SURFACE-01',
              rung: 'R0',
              advisory: false,
              message: `Unverified surface: container ${sid} has unsupported gradient${unsuppReason}, multi-layer, or malformed background at ${vp}.`
            }));
          }
        }
        }
      }

      if (gtHasNoneImage) {
        const colorComp = compareContainerBackgroundColors(gtBgColor, rnBgColor);
        if (colorComp.unparseable) {
          defects.push(createDefect({
            nodeSid: sid,
            widgetId: containerEl.id || null,
            viewport: vp,
            property: 'backgroundColor',
            original: gtBgColor,
            rendered: rnBgColor,
            severity: 'HIGH',
            rule: 'RULE-SURFACE-01',
            rung: 'R0',
            advisory: false,
            message: colorComp.reason || `Container ${sid} has unparseable background color at ${vp}.`
          }));
        } else if (!colorComp.match) {
          defects.push(createDefect({
            nodeSid: sid,
            widgetId: containerEl.id || null,
            viewport: vp,
            property: 'backgroundColor',
            original: gtBgColor,
            rendered: rnBgColor,
            severity: 'HIGH',
            rule: 'RULE-SURFACE-01',
            rung: 'R0',
            advisory: false,
            message: `Container ${sid} background color mismatch at ${vp}: expected ${gtBgColor}, got ${rnBgColor}. ${colorComp.reason || ''}`.trim()
          }));
        }
      }

      // RULE-SURFACE-02: Source-Derived Container Image Background Geometry Verification
      const gtSingleImg = extractSingleImageUrl(gtBgImage);
      if (gtSingleImg) {
        // Causality guard: If RULE-SURFACE-01 already found the image missing from render,
        // do not emit duplicate geometry defects on a missing image.
        if (!rnBgImgMissingOrEmpty && !rnHasNoneImage) {
          let gtSize = null;
          let gtPos = null;
          let gtRepeat = null;
          let gtSizeReadFailed = false;
          let gtPosReadFailed = false;
          let gtRepeatReadFailed = false;

          try {
            gtSize = readComputedCssProperty(gtNode, gtSnapshot, vp, 'background-size', 'backgroundSize');
          } catch (err) {
            gtSizeReadFailed = true;
            defects.push(createDefect({
              nodeSid: sid,
              widgetId: containerEl.id || null,
              viewport: vp,
              property: 'background-size',
              original: 'computedStyle',
              rendered: err.code || err.reason || 'MISSING_STYLE',
              severity: 'HIGH',
              rule: 'RULE-SURFACE-02',
              rung: 'R0',
              advisory: false,
              message: `Container ${sid} failed to read GT computed background-size at ${vp}: ${err.message}`
            }));
          }

          try {
            gtPos = readComputedCssProperty(gtNode, gtSnapshot, vp, 'background-position', 'backgroundPosition');
          } catch (err) {
            gtPosReadFailed = true;
            defects.push(createDefect({
              nodeSid: sid,
              widgetId: containerEl.id || null,
              viewport: vp,
              property: 'background-position',
              original: 'computedStyle',
              rendered: err.code || err.reason || 'MISSING_STYLE',
              severity: 'HIGH',
              rule: 'RULE-SURFACE-02',
              rung: 'R0',
              advisory: false,
              message: `Container ${sid} failed to read GT computed background-position at ${vp}: ${err.message}`
            }));
          }

          try {
            gtRepeat = readComputedCssProperty(gtNode, gtSnapshot, vp, 'background-repeat', 'backgroundRepeat');
          } catch (err) {
            gtRepeatReadFailed = true;
            defects.push(createDefect({
              nodeSid: sid,
              widgetId: containerEl.id || null,
              viewport: vp,
              property: 'background-repeat',
              original: 'computedStyle',
              rendered: err.code || err.reason || 'MISSING_STYLE',
              severity: 'HIGH',
              rule: 'RULE-SURFACE-02',
              rung: 'R0',
              advisory: false,
              message: `Container ${sid} failed to read GT computed background-repeat at ${vp}: ${err.message}`
            }));
          }

          // 1. Background-Size verification
          if (!gtSizeReadFailed) {
            const normGtSize = mapBackgroundSize(gtSize);
            if (!normGtSize) {
              defects.push(createDefect({
                nodeSid: sid,
                widgetId: containerEl.id || null,
                viewport: vp,
                property: 'background-size',
                original: gtSize,
                rendered: 'unsupported',
                severity: 'HIGH',
                rule: 'RULE-SURFACE-02',
                rung: 'R0',
                advisory: false,
                message: `Container ${sid} has unsupported GT background-size at ${vp}: "${gtSize}".`
              }));
            } else {
              const rawRnSize = rns.backgroundSize;
              if (rawRnSize === undefined || rawRnSize === null || String(rawRnSize).trim() === '') {
                defects.push(createDefect({
                  nodeSid: sid,
                  widgetId: containerEl.id || null,
                  viewport: vp,
                  property: 'background-size',
                  original: normGtSize,
                  rendered: 'missing',
                  severity: 'HIGH',
                  rule: 'RULE-SURFACE-02',
                  rung: 'R0',
                  advisory: false,
                  message: `Container ${sid} rendered background-size missing at ${vp}: expected "${normGtSize}".`
                }));
              } else {
                const normRnSize = mapBackgroundSize(rawRnSize);
                if (normGtSize !== normRnSize) {
                  defects.push(createDefect({
                    nodeSid: sid,
                    widgetId: containerEl.id || null,
                    viewport: vp,
                    property: 'background-size',
                    original: normGtSize,
                    rendered: normRnSize || String(rawRnSize).trim(),
                    severity: 'HIGH',
                    rule: 'RULE-SURFACE-02',
                    rung: 'R0',
                    advisory: false,
                    message: `Container ${sid} background-size mismatch at ${vp}: expected "${normGtSize}", got "${rawRnSize}".`
                  }));
                }
              }
            }
          }

          // 2. Background-Position verification
          if (!gtPosReadFailed) {
            const normGtPos = mapBackgroundPosition(gtPos);
            if (!normGtPos) {
              defects.push(createDefect({
                nodeSid: sid,
                widgetId: containerEl.id || null,
                viewport: vp,
                property: 'background-position',
                original: gtPos,
                rendered: 'unsupported',
                severity: 'HIGH',
                rule: 'RULE-SURFACE-02',
                rung: 'R0',
                advisory: false,
                message: `Container ${sid} has unsupported GT background-position at ${vp}: "${gtPos}".`
              }));
            } else {
              const rawRnPos = rns.backgroundPosition;
              if (rawRnPos === undefined || rawRnPos === null || String(rawRnPos).trim() === '') {
                defects.push(createDefect({
                  nodeSid: sid,
                  widgetId: containerEl.id || null,
                  viewport: vp,
                  property: 'background-position',
                  original: normGtPos,
                  rendered: 'missing',
                  severity: 'HIGH',
                  rule: 'RULE-SURFACE-02',
                  rung: 'R0',
                  advisory: false,
                  message: `Container ${sid} rendered background-position missing at ${vp}: expected "${normGtPos}".`
                }));
              } else {
                const normRnPos = mapBackgroundPosition(rawRnPos);
                if (normGtPos !== normRnPos) {
                  defects.push(createDefect({
                    nodeSid: sid,
                    widgetId: containerEl.id || null,
                    viewport: vp,
                    property: 'background-position',
                    original: normGtPos,
                    rendered: normRnPos || String(rawRnPos).trim(),
                    severity: 'HIGH',
                    rule: 'RULE-SURFACE-02',
                    rung: 'R0',
                    advisory: false,
                    message: `Container ${sid} background-position mismatch at ${vp}: expected "${normGtPos}", got "${rawRnPos}".`
                  }));
                }
              }
            }
          }

          // 3. Background-Repeat verification
          if (!gtRepeatReadFailed) {
            const normGtRepeat = mapBackgroundRepeat(gtRepeat);
            if (!normGtRepeat) {
              defects.push(createDefect({
                nodeSid: sid,
                widgetId: containerEl.id || null,
                viewport: vp,
                property: 'background-repeat',
                original: gtRepeat,
                rendered: 'unsupported',
                severity: 'HIGH',
                rule: 'RULE-SURFACE-02',
                rung: 'R0',
                advisory: false,
                message: `Container ${sid} has unsupported GT background-repeat at ${vp}: "${gtRepeat}".`
              }));
            } else {
              const rawRnRepeat = rns.backgroundRepeat;
              if (rawRnRepeat === undefined || rawRnRepeat === null || String(rawRnRepeat).trim() === '') {
                defects.push(createDefect({
                  nodeSid: sid,
                  widgetId: containerEl.id || null,
                  viewport: vp,
                  property: 'background-repeat',
                  original: normGtRepeat,
                  rendered: 'missing',
                  severity: 'HIGH',
                  rule: 'RULE-SURFACE-02',
                  rung: 'R0',
                  advisory: false,
                  message: `Container ${sid} rendered background-repeat missing at ${vp}: expected "${normGtRepeat}".`
                }));
              } else {
                const normRnRepeat = mapBackgroundRepeat(rawRnRepeat);
                if (normGtRepeat !== normRnRepeat) {
                  defects.push(createDefect({
                    nodeSid: sid,
                    widgetId: containerEl.id || null,
                    viewport: vp,
                    property: 'background-repeat',
                    original: normGtRepeat,
                    rendered: normRnRepeat || String(rawRnRepeat).trim(),
                    severity: 'HIGH',
                    rule: 'RULE-SURFACE-02',
                    rung: 'R0',
                    advisory: false,
                    message: `Container ${sid} background-repeat mismatch at ${vp}: expected "${normGtRepeat}", got "${rawRnRepeat}".`
                  }));
                }
              }
            }
          }
        }
      }
    }

    for (const [sid, gtNode] of Object.entries(gtFlat)) {
      const renderNode = renderFlat[sid];
      const templateEl = sidToElement.get(sid);
      const isNative = isNativeEditableWidget(templateEl);

      // Skip document.body
      if (gtNode.tag === "body") continue;

      // Skip invisible / zero-dimension container elements in original
      if (gtNode.rect.w === 0 && gtNode.rect.h === 0 && !gtNode.isInteractive) {
        continue;
      }

      if (!renderNode) {
        // If node is an inline descendant of an Elementor widget, it is already represented inside it
        if (isDescendantOfLeaf(sid, gtFlat)) {
          continue;
        }

        // True missing node defect
        if (gtNode.rect.w > 0 && gtNode.rect.h > 0) {
          defects.push(createDefect({
            nodeSid: sid,
            viewport: vp,
            property: "presence",
            original: "visible",
            rendered: "missing",
            severity: "CRITICAL",
            rule: "RULE-DOM-01",
            rung: "R3",
            routing: "micro",
            advisory: false,
            message: `Node ${sid} (${gtNode.tag}${gtNode.className ? "." + gtNode.className.split(" ")[0] : ""}) missing from Elementor render at ${vp}.`
          }));
        }
        continue;
      }

      const widgetId = renderNode.widgetId || null;
      const gts = gtNode.styles || {};
      const rns = renderNode.styles || {};

      // Helper to register defect with routing & severity re-mapping (G9)
      function pushDefect(d) {
        // C2: Mark derived layout metrics as advisory R0
        if (["lineCount", "wordCount", "lineWidth"].includes(d.property)) {
          d.advisory = true;
          d.rung = "R0";
          d.routing = "none";
          defects.push(createDefect(d));
          return;
        }

        // M9: Mark glyph parity as advisory R1
        if (d.rule === 'RULE-VIS-04' || d.property === 'glyph') {
          d.advisory = true;
          d.rung = "R1";
          d.severity = d.severity || "LOW";
          d.routing = "none";
          defects.push(createDefect(d));
          return;
        }

        const isNativeProp = isElementorNativeProperty(d.property);
        d.routing = isNativeProp ? "native" : "micro";
        // G9: Representable property deltas on native editable widgets are R1-actable defects, NOT demoted to advisory!
        d.advisory = false;

        // E6: Severity Recalibration (G9 enforcement)
        // Any |Δgeometry| > 24px (width or height) on a native editable widget -> severity: 'HIGH' + advisory: false
        if (isNative && ["width", "height"].includes(d.property)) {
          const origPx = parsePx(d.original);
          const rendPx = parsePx(d.rendered);
          if (Math.abs(origPx - rendPx) > 24) {
            d.severity = "HIGH";
            d.advisory = false;
          }
        }

        defects.push(createDefect(d));
      }

      // Z2 / B2 / M2: INITIAL-STATE PARITY ON STRICT RENDERER (RULE-STATE-01)
      // Closes matrix blind spot: If an element is initially collapsed/hidden in original ground truth
      // (computed max-height:0 / overflow:hidden with rect.h:0 / display:none / visibility:hidden),
      // but has rendered visible height > 0 on strict emulator, raise CRITICAL STATE_MISMATCH.
      const isGtInitiallyHidden = Boolean(
        (gts.maxHeight && gts.maxHeight !== "none" && parsePx(gts.maxHeight) === 0) ||
        (gtNode.rect && gtNode.rect.h === 0 && gts.overflow === 'hidden') ||
        (gts.overflow === 'hidden' && gts.height && gts.height !== 'auto' && parsePx(gts.height) === 0) ||
        gts.display === 'none' ||
        gts.visibility === 'hidden'
      );

      const hasRenderRect = Boolean(renderNode && renderNode.rect && renderNode.rect.h !== undefined);
      const isRenderVisible = hasRenderRect
        ? (renderNode.rect.h > 0 && rns.display !== 'none' && rns.visibility !== 'hidden')
        : (
            rns.display !== 'none' &&
            rns.visibility !== 'hidden' &&
            !(rns.overflow === 'hidden' && (
              (rns.maxHeight && rns.maxHeight !== 'none' && parsePx(rns.maxHeight) === 0) ||
              (rns.height && rns.height !== 'auto' && parsePx(rns.height) === 0)
            ))
          );

      if (isGtInitiallyHidden && isRenderVisible) {
        pushDefect({
          nodeSid: sid,
          widgetId,
          viewport: vp,
          property: "initialState",
          original: "hidden",
          rendered: "visible",
          severity: "CRITICAL",
          rule: "RULE-STATE-01",
          rung: "R1",
          advisory: false,
          message: `STATE_MISMATCH: ${sid} (${gtNode.tag}${gtNode.className ? "." + gtNode.className.split(" ")[0] : ""}) collapsed in original (maxHeight:0/overflow:hidden) but rendered visible (height=${renderNode?.rect?.h ?? rns.height}px).`
        });
      }

      // 1. Colors
      if (gts.color && rns.color && !isColorEqual(gts.color, rns.color)) {
        pushDefect({
          nodeSid: sid,
          widgetId,
          viewport: vp,
          property: "color",
          original: gts.color,
          rendered: rns.color,
          severity: "HIGH",
          rule: "RULE-CLR-01",
          rung: "R1",
          message: `Text color mismatch on ${sid} at ${vp}: expected ${gts.color}, got ${rns.color}.`
        });
      }

      const isAuditedContainerSurface = auditedSurfaceSids.has(sid);
      if (!isAuditedContainerSurface && gts.backgroundColor && rns.backgroundColor &&
          gts.backgroundColor !== "transparent" && gts.backgroundColor !== "rgba(0, 0, 0, 0)" &&
          !isColorEqual(gts.backgroundColor, rns.backgroundColor)) {
        pushDefect({
          nodeSid: sid,
          widgetId,
          viewport: vp,
          property: "backgroundColor",
          original: gts.backgroundColor,
          rendered: rns.backgroundColor,
          severity: "HIGH",
          rule: "RULE-CLR-02",
          rung: "R1",
          message: `Background color mismatch on ${sid} at ${vp}: expected ${gts.backgroundColor}, got ${rns.backgroundColor}.`
        });
      }

      if (parsePx(gts.borderTopWidth) > 0 && gts.borderTopColor && rns.borderTopColor &&
          !isColorEqual(gts.borderTopColor, rns.borderTopColor)) {
        pushDefect({
          nodeSid: sid,
          widgetId,
          viewport: vp,
          property: "borderColor",
          original: gts.borderTopColor,
          rendered: rns.borderTopColor,
          severity: "MEDIUM",
          rule: "RULE-CLR-03",
          rung: "R1",
          message: `Border color mismatch on ${sid} at ${vp}: expected ${gts.borderTopColor}, got ${rns.borderTopColor}.`
        });
      }

      // 2. Typography (Tolerance relaxed for native editable widgets)
      const fontTolerance = (isNative ? TOLERANCES.FONT_SIZE_PX * EDITABLE_RELAX : TOLERANCES.FONT_SIZE_PX);
      const gtFs = parsePx(gts.fontSize);
      const rnFs = parsePx(rns.fontSize);
      if (gtFs >= 8 && Math.abs(gtFs - rnFs) > fontTolerance) {
        pushDefect({
          nodeSid: sid,
          widgetId,
          viewport: vp,
          property: "fontSize",
          original: `${gtFs}px`,
          rendered: `${rnFs}px`,
          severity: "HIGH",
          rule: "RULE-TYP-01",
          rung: "R1",
          message: `Font size mismatch on ${sid} at ${vp}: expected ${gtFs}px, got ${rnFs}px (delta: ${(rnFs - gtFs).toFixed(1)}px).`
        });
      }

      if (gts.fontWeight && rns.fontWeight && String(gts.fontWeight) !== String(rns.fontWeight)) {
        const isBoldEq = (gts.fontWeight === "bold" && rns.fontWeight === "700") ||
                         (gts.fontWeight === "700" && rns.fontWeight === "bold") ||
                         (gts.fontWeight === "normal" && rns.fontWeight === "400") ||
                         (gts.fontWeight === "400" && rns.fontWeight === "normal");
        if (!isBoldEq) {
          pushDefect({
            nodeSid: sid,
            widgetId,
            viewport: vp,
            property: "fontWeight",
            original: gts.fontWeight,
            rendered: rns.fontWeight,
            severity: "MEDIUM",
            rule: "RULE-TYP-02",
            rung: "R1",
            message: `Font weight mismatch on ${sid} at ${vp}: expected ${gts.fontWeight}, got ${rns.fontWeight}.`
          });
        }
      }

      // 3. Text Metrics & Wrapping (Leaf Text Nodes Only)
      const isTextLeaf = ["h1", "h2", "h3", "h4", "h5", "h6", "p", "span", "a", "button", "li", "label", "b", "strong", "em"].includes(gtNode.tag);

      // D1 Critical Check: INVISIBLE_TEXT (RULE-VIS-01)
      if (isTextLeaf && gtNode.hasDirectText) {
        const rnColor = rns.color || "";
        const rnFill = rns.webkitTextFillColor || rns['-webkit-text-fill-color'] || rnColor;
        const isTransparent = rnFill === "transparent" || rnFill === "rgba(0, 0, 0, 0)" || rnColor === "transparent" || rnColor === "rgba(0, 0, 0, 0)";
        const bgClip = rns.webkitBackgroundClip || rns.backgroundClip || rns['-webkit-background-clip'] || rns['background-clip'] || "";
        const rnBgImage = rns.backgroundImage || "";
        const isBgEmpty = !rnBgImage || rnBgImage === "none" || rnBgImage === "initial";

        if (isTransparent && (!bgClip.includes("text") || isBgEmpty)) {
          pushDefect({
            nodeSid: sid,
            widgetId,
            viewport: vp,
            property: "webkitTextFillColor",
            original: gts.backgroundImage || gts.color || "rgb(17, 24, 39)",
            rendered: "transparent-invisible",
            severity: "CRITICAL",
            rule: "RULE-VIS-01",
            rung: "R1",
            advisory: false,
            message: `INVISIBLE_TEXT: Text node ${sid} has transparent fill with missing background-image / text-clip at ${vp}.`
          });
        }
      }

      // D3 Critical Check: COLLAPSED_DECOR (RULE-VIS-02)
      // If a visual leaf container with original height > 40px collapses to rendered height < 10px
      const isContainerTag = ['div', 'section', 'article', 'aside', 'header', 'footer', 'main'].includes(gtNode.tag);
      const isTemplateContainer = templateEl && templateEl.elType === 'container';
      const isLeafContainer = isTemplateContainer
        ? (!templateEl.elements || templateEl.elements.length === 0)
        : (isContainerTag && !gtNode.hasDirectText);

      if (isLeafContainer) {
        const hasVisualBg = gts.backgroundColor && gts.backgroundColor !== 'transparent' && gts.backgroundColor !== 'rgba(0, 0, 0, 0)';
        const hasBgImg = gts.backgroundImage && gts.backgroundImage !== 'none' && gts.backgroundImage !== 'initial';
        const hasBorder = parsePx(gts.borderTopWidth) > 0 || parsePx(gts.borderBottomWidth) > 0 || parsePx(gts.borderLeftWidth) > 0 || parsePx(gts.borderRightWidth) > 0;
        const isVisual = Boolean(hasVisualBg || hasBgImg || hasBorder);

        const origH = Math.round(gtNode.rect?.h || parsePx(gts.height) || 0);
        const rendH = Math.round(renderNode.rect?.h ?? renderNode.outerRect?.h ?? 0);

        if (isVisual && origH > 40 && rendH < 10) {
          pushDefect({
            nodeSid: sid,
            widgetId,
            viewport: vp,
            property: "minHeight",
            original: `${origH}px`,
            rendered: `${rendH}px`,
            severity: "CRITICAL",
            rule: "RULE-VIS-02",
            rung: "R1",
            advisory: false,
            message: `COLLAPSED_DECOR: Visual leaf container ${sid} collapsed from ${origH}px to ${rendH}px (<10px) at ${vp}.`
          });
        }
      }

      // F10 Critical Check: DECOR_LOSS (RULE-VIS-03)
      // If GT node has active pseudo (::before or ::after with content !== 'none'),
      // but Render node is missing pseudo or has content === 'none'.
      const isPseudoActive = (c) => {
        if (c === null || c === undefined) return false;
        const s = String(c).trim();
        if (s.length === 0) return true;
        const lower = s.toLowerCase().replace(/['"]/g, '').trim();
        return lower !== 'none' && lower !== 'normal';
      };

      const gtBefore = gtNode.pseudo?.before;
      if (gtBefore && isPseudoActive(gtBefore.content)) {
        const rnBefore = renderNode?.pseudo?.before;
        const isRenderBeforeActive = Boolean(rnBefore && isPseudoActive(rnBefore.content));
        if (!isRenderBeforeActive) {
          pushDefect({
            nodeSid: sid,
            widgetId,
            viewport: vp,
            property: "pseudo:before",
            original: gtBefore.content || "active",
            rendered: rnBefore ? (rnBefore.content || "none") : "none",
            severity: "CRITICAL",
            rule: "RULE-VIS-03",
            rung: "R1",
            advisory: false,
            message: `DECOR_LOSS: Node ${sid} has active ::before pseudo decor (${JSON.stringify(gtBefore.content)}) in Ground Truth, but rendered pseudo is missing or none at ${vp}.`
          });
        }
      }

      const gtAfter = gtNode.pseudo?.after;
      if (gtAfter && isPseudoActive(gtAfter.content)) {
        const rnAfter = renderNode?.pseudo?.after;
        const isRenderAfterActive = Boolean(rnAfter && isPseudoActive(rnAfter.content));
        if (!isRenderAfterActive) {
          pushDefect({
            nodeSid: sid,
            widgetId,
            viewport: vp,
            property: "pseudo:after",
            original: gtAfter.content || "active",
            rendered: rnAfter ? (rnAfter.content || "none") : "none",
            severity: "CRITICAL",
            rule: "RULE-VIS-03",
            rung: "R1",
            advisory: false,
            message: `DECOR_LOSS: Node ${sid} has active ::after pseudo decor (${JSON.stringify(gtAfter.content)}) in Ground Truth, but rendered pseudo is missing or none at ${vp}.`
          });
        }
      }

      if (isTextLeaf && gtNode.hasDirectText && gtNode.lineCount && renderNode.lineCount && gtNode.lineCount !== renderNode.lineCount) {
        pushDefect({
          nodeSid: sid,
          widgetId,
          viewport: vp,
          property: "lineCount",
          original: gtNode.lineCount,
          rendered: renderNode.lineCount,
          severity: "LOW",
          rule: "RULE-TXT-01",
          rung: "R0",
          advisory: true,
          message: `Text line wrap mismatch on ${sid} at ${vp}: expected ${gtNode.lineCount} lines, got ${renderNode.lineCount} lines.`
        });
      }

      // Task M9 Advisory Check: GLYPH_PARITY (RULE-VIS-04)
      const gtGlyphCandidate = gtNode.directText || gtNode.fullText || gtNode.pseudo?.before?.content || gtNode.pseudo?.after?.content || '';
      const gtGlyphMatch = extractKnownGlyph(gtGlyphCandidate);
      if (gtGlyphMatch) {
        const expectedIcon = gtGlyphMatch.faIcon;
        const expectedGlyph = gtGlyphMatch.glyph;
        const element = sidToElement.get(sid);

        if (element && element.widgetType === 'icon') {
          const configuredIcon = element.settings?.selected_icon?.value || element.settings?.icon?.value ||
            (typeof element.settings?.icon === 'string' ? element.settings.icon : null);
          const renderedIcon = renderNode?.iconClass || configuredIcon;

          const isCheckFallback = (renderedIcon === 'fas fa-check' || renderedIcon === 'fa-check') && expectedIcon !== 'fas fa-check';
          const isIconMismatch = renderedIcon && renderedIcon !== expectedIcon && !renderedIcon.includes(expectedIcon.replace('fas fa-', ''));

          if (isCheckFallback || isIconMismatch) {
            pushDefect({
              nodeSid: sid,
              widgetId,
              viewport: vp,
              property: "glyph",
              original: `${expectedGlyph} (${expectedIcon})`,
              rendered: renderedIcon || "fas fa-check",
              severity: "LOW",
              rule: "RULE-VIS-04",
              rung: "R1",
              advisory: true,
              message: `GLYPH_PARITY: Glyph mismatch on ${sid} at ${vp}: expected "${expectedGlyph}" (${expectedIcon}), got "${renderedIcon || 'fas fa-check'}".`
            });
          }
        }
      }

      // 4. Geometry (Width & Height) — Tolerance relaxed for native widgets
      const gtW = gtNode.rect.w;
      const rnW = renderNode.rect.w;
      const rnOuterW = renderNode.outerRect ? renderNode.outerRect.w : rnW;
      const widthDelta = Math.min(Math.abs(gtW - rnW), Math.abs(gtW - rnOuterW));
      const widthTolerance = isNative
        ? Math.max(TOLERANCES.WIDTH_PX * EDITABLE_RELAX, gtW * 0.12)
        : Math.max(TOLERANCES.WIDTH_PX, gtW * 0.08);

      if (gtW >= 20 && widthDelta > widthTolerance) {
        pushDefect({
          nodeSid: sid,
          widgetId,
          viewport: vp,
          property: "width",
          original: `${gtW}px`,
          rendered: `${rnW}px`,
          severity: "MEDIUM",
          rule: "RULE-GEO-01",
          rung: "R1",
          message: `Width discrepancy on ${sid} at ${vp}: expected ${gtW}px, got ${rnW}px.`
        });
      }

      // E5: Direct <img> rect comparison (detect letterbox / height collapse)
      const isImgNode = gtNode.tag === 'img' || templateEl?.widgetType === 'image';
      if (isImgNode && gtNode.rect.h >= 20) {
        const gtH = gtNode.rect.h;
        const rnH = renderNode.rect.h; // Direct <img> rect from targetRect (not wrapper)
        const heightTolerance = isNative
          ? Math.max(TOLERANCES.HEIGHT_PX * EDITABLE_RELAX, gtH * 0.15)
          : Math.max(TOLERANCES.HEIGHT_PX, gtH * 0.10);

        if (Math.abs(gtH - rnH) > heightTolerance) {
          pushDefect({
            nodeSid: sid,
            widgetId,
            viewport: vp,
            property: "height",
            original: `${gtH}px`,
            rendered: `${rnH}px`,
            severity: Math.abs(gtH - rnH) > 24 ? "HIGH" : "MEDIUM",
            rule: "RULE-GEO-01",
            rung: "R1",
            message: `Image height discrepancy on ${sid} at ${vp}: expected ${gtH}px, got ${rnH}px (letterbox/collapse detected on <img> element).`
          });
        }
      }

      // G9 Critical Check: LAYOUT_TOPOLOGY_MISMATCH
      if (vp === "desktop" && gtNode.children && gtNode.children.length > 1) {
        const gtChildNodes = gtNode.children.map(cid => gtFlat[cid]).filter(Boolean);
        const rnChildNodes = gtNode.children.map(cid => renderFlat[cid]).filter(Boolean);
        if (gtChildNodes.length >= 2 && rnChildNodes.length >= 2) {
          const gtAllSameRow = gtChildNodes.every(c => Math.abs(c.rect.y - gtChildNodes[0].rect.y) < 15);
          const rnWrapped = rnChildNodes.some(c => Math.abs(c.rect.y - rnChildNodes[0].rect.y) > 30);
          if (gtAllSameRow && rnWrapped) {
            pushDefect({
              nodeSid: sid,
              widgetId,
              viewport: vp,
              property: "flexWrap",
              original: "nowrap-row",
              rendered: "wrapped-column",
              severity: "HIGH",
              rule: "RULE-TOPOLOGY-01",
              rung: "R1",
              message: `LAYOUT_TOPOLOGY_MISMATCH: Multi-column container ${sid} children wrapped unexpectedly onto multiple rows at desktop.`
            });
          }
        }
      }

      // 5. Box Model (Paddings, Border Widths & Radius) — Tolerance relaxed for native widgets
      const borderSides = [
        'borderTopWidth',
        'borderRightWidth',
        'borderBottomWidth',
        'borderLeftWidth'
      ];
      for (const side of borderSides) {
        const gtBw = parsePx(gts[side]);
        const rnBw = parsePx(rns[side]);
        if (Math.abs(gtBw - rnBw) > TOLERANCES.BORDER_WIDTH_PX && (gtBw > 0 || rnBw > 0)) {
          pushDefect({
            nodeSid: sid,
            widgetId,
            viewport: vp,
            property: side,
            original: `${gtBw}px`,
            rendered: `${rnBw}px`,
            severity: "LOW",
            rule: "RULE-BOX-01",
            rung: "R1",
            message: `Border width mismatch on ${sid} (${side}) at ${vp}: expected ${gtBw}px, got ${rnBw}px.`
          });
          break;
        }
      }

      const padTolerance = isNative ? TOLERANCES.PADDING_PX * EDITABLE_RELAX : TOLERANCES.PADDING_PX;
      const gtPt = parsePx(gts.paddingTop);
      const rnPt = parsePx(rns.paddingTop);
      if (Math.abs(gtPt - rnPt) > padTolerance && gtPt > 0) {
        pushDefect({
          nodeSid: sid,
          widgetId,
          viewport: vp,
          property: "paddingTop",
          original: `${gtPt}px`,
          rendered: `${rnPt}px`,
          severity: "LOW",
          rule: "RULE-BOX-01",
          rung: "R1"
        });
      }

      // Check columnGap and rowGap on flex/grid containers
      if (gtNode.tag !== "body" && (gts.display === "flex" || gts.display === "inline-flex" || gts.display === "grid" || gts.display === "inline-grid")) {
        const gapTolerance = isNative ? 2.5 : 2.0;

        const gtColGap = parsePx(gts.columnGap);
        const rnColGap = parsePx(rns.columnGap);
        if (Math.abs(gtColGap - rnColGap) > gapTolerance && (gtColGap > 0 || rnColGap > 0)) {
          pushDefect({
            nodeSid: sid,
            widgetId,
            viewport: vp,
            property: "columnGap",
            original: `${gtColGap}px`,
            rendered: `${rnColGap}px`,
            severity: "LOW",
            rule: "RULE-BOX-01",
            rung: "R1",
            message: `Column gap mismatch on ${sid} at ${vp}: expected ${gtColGap}px, got ${rnColGap}px.`
          });
        }

        const gtRowGap = parsePx(gts.rowGap);
        const rnRowGap = parsePx(rns.rowGap);
        if (Math.abs(gtRowGap - rnRowGap) > gapTolerance && (gtRowGap > 0 || rnRowGap > 0)) {
          pushDefect({
            nodeSid: sid,
            widgetId,
            viewport: vp,
            property: "rowGap",
            original: `${gtRowGap}px`,
            rendered: `${rnRowGap}px`,
            severity: "LOW",
            rule: "RULE-BOX-01",
            rung: "R1",
            message: `Row gap mismatch on ${sid} at ${vp}: expected ${gtRowGap}px, got ${rnRowGap}px.`
          });
        }
      }

      const radTolerance = isNative ? TOLERANCES.BORDER_RADIUS_PX * EDITABLE_RELAX : TOLERANCES.BORDER_RADIUS_PX;
      const radiusCorners = [
        'borderTopLeftRadius',
        'borderTopRightRadius',
        'borderBottomRightRadius',
        'borderBottomLeftRadius'
      ];
      for (const corner of radiusCorners) {
        const gtRad = parsePx(gts[corner]);
        const rnRad = parsePx(rns[corner]);
        if (Math.abs(gtRad - rnRad) > radTolerance && (gtRad > 0 || rnRad > 0)) {
          pushDefect({
            nodeSid: sid,
            widgetId,
            viewport: vp,
            property: corner,
            original: `${gtRad}px`,
            rendered: `${rnRad}px`,
            severity: "LOW",
            rule: "RULE-BOX-02",
            rung: "R1",
            message: `Border radius mismatch on ${sid} (${corner}) at ${vp}: expected ${gtRad}px, got ${rnRad}px.`
          });
          break;
        }
      }
    }
  }

  // Calculate Health Score (ignoring pure advisory defects for critical/high penalties)
  const nonAdvisory = defects.filter(d => !d.advisory);
  const critical = nonAdvisory.filter(d => d.severity === "CRITICAL").length;
  const high = nonAdvisory.filter(d => d.severity === "HIGH").length;
  const medium = nonAdvisory.filter(d => d.severity === "MEDIUM").length;
  const low = nonAdvisory.filter(d => d.severity === "LOW").length;

  const penalty = (critical * 20) + (high * 6) + (medium * 2) + (low * 0.2);
  const healthScore = Math.max(0, Math.min(100, Math.round(100 - penalty)));

  auditReport.defects = defects;
  auditReport.global.fidelity = healthScore;

  // Census by rung
  const defectCensusByRung = {
    R0: defects.filter(d => d.rung === "R0").length,
    R1: defects.filter(d => d.rung === "R1").length,
    R2: defects.filter(d => d.rung === "R2").length,
    R3: defects.filter(d => d.rung === "R3").length
  };

  return {
    report: auditReport,
    healthScore,
    defects,
    counts: {
      total: defects.length,
      critical,
      high,
      medium,
      low
    },
    advisories: defects.filter(d => d.advisory === true).length,
    defectCensusByRung,
    auditedSurfaceSids: Array.from(auditedSurfaceSids)
  };
}

module.exports = {
  AVAILABLE_RULES,
  auditVerificationMatrix,
  findScopedImageCssDeclaration,
  isExactBaseContainerSelector,
  isSimpleTabletMedia,
  isSimpleMobileMedia
};

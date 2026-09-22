/**
 * @deprecated Legacy v0.4 Fallback Normalizer.
 * In V2, Single-Pass Geometric Mapping (src/smart/geometry-mapper.js) natively preserves geometry.
 * Retained strictly as fallback for offline/legacy AST pipeline.
 */
/**
 * [LEGACY OFFLINE FALLBACK] Universal CSS-to-Elementor Style Resolver.
 * Agnostic, deterministic property mapper that translates standard CSS declarations
 * from <style> blocks into native Elementor Free container and widget JSON settings.
 * 
 * Note: In V2 "Single-Pass + Verify", the primary style pipeline is Chromium ground-truth
 * via geometry-mapper.js. This module is retained exclusively as an offline AST fallback.
 */

const { parseCssRules } = require('../parser/css-parser');
const { cleanFontName } = require('../parser/font-detector');

const DYNAMIC_STATE_CLASSES = new Set([
  'is-active', 'active', 'selected', 'current', 'opened', 'open',
  'collapsed', 'is-hidden', 'hidden', 'is-open', 'is-collapsed',
  'disabled', 'checked'
]);

// Helper to extract and resolve CSS custom properties (variables)
function extractCssVariables(rawCss = '') {
  const variables = {};
  if (!rawCss || typeof rawCss !== 'string') return variables;

  const varRegex = /(--[a-zA-Z0-9\-_]+)\s*:\s*([^;]+);/g;
  let match;
  while ((match = varRegex.exec(rawCss)) !== null) {
    variables[match[1].trim()] = match[2].trim();
  }

  // Resolve chained variables (e.g. var(--color-surface))
  let changed = true;
  let iterations = 0;
  while (changed && iterations < 5) {
    changed = false;
    iterations++;
    for (const [k, v] of Object.entries(variables)) {
      const resolved = v.replace(/var\((--[a-zA-Z0-9\-_]+)(?:,\s*([^)]+))?\)/g, (_, varName, fallback) => {
        if (variables[varName]) {
          changed = true;
          return variables[varName];
        }
        return fallback || '';
      });
      if (resolved !== v) {
        variables[k] = resolved;
      }
    }
  }

  return variables;
}

function resolveCssValue(value = '', variables = {}) {
  if (!value || typeof value !== 'string') return '';
  return value.replace(/var\((--[a-zA-Z0-9\-_]+)(?:,\s*([^)]+))?\)/g, (_, varName, fallback) => {
    return variables[varName] || fallback || '';
  }).trim();
}

function flattenCssVariables(cssText = '', variables = {}) {
  if (!cssText || typeof cssText !== 'string') return '';
  const vars = (variables && Object.keys(variables).length > 0) ? variables : extractCssVariables(cssText);
  return cssText.replace(/var\((--[a-zA-Z0-9\-_]+)(?:,\s*([^)]+))?\)/g, (_, varName, fallback) => {
    return vars[varName] || fallback || '';
  });
}

function extractSolidColor(rawBg = '') {
  if (!rawBg || typeof rawBg !== 'string') return '';
  if (rawBg.includes('gradient') || rawBg.includes('url(')) {
    const allColors = rawBg.match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)/gi) || [];
    const solidColor = [...allColors].reverse().find(c => {
      if (c.startsWith('#')) return true;
      if (c.startsWith('rgb(')) return true;
      const alphaMatch = c.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([0-9.]+)\)/i);
      return alphaMatch && parseFloat(alphaMatch[1]) >= 0.8;
    });
    if (solidColor) return solidColor.trim();
  }
  return rawBg.trim();
}

function parsePixelValue(valStr = '', baseFontSize = 16, viewportWidth = 1280) {
  if (!valStr || typeof valStr !== 'string') return 0;
  const trimmed = valStr.trim();
  
  // rem
  const remMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*rem$/i);
  if (remMatch) {
    return Math.round(parseFloat(remMatch[1]) * baseFontSize);
  }

  // em
  const emMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*em$/i);
  if (emMatch) {
    return Math.round(parseFloat(emMatch[1]) * baseFontSize);
  }

  // vw
  const vwMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*vw$/i);
  if (vwMatch) {
    return Math.round((parseFloat(vwMatch[1]) / 100) * viewportWidth);
  }

  // vh
  const vhMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*vh$/i);
  if (vhMatch) {
    return Math.round((parseFloat(vhMatch[1]) / 100) * 800);
  }

  // pt
  const ptMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*pt$/i);
  if (ptMatch) {
    return Math.round(parseFloat(ptMatch[1]) * 1.333333);
  }

  // px or unitless
  const pxMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*(?:px)?$/i);
  if (pxMatch) {
    return Math.round(parseFloat(pxMatch[1]));
  }

  // Fallback regex for complex strings like "1.25rem !important"
  const dirtyMatch = trimmed.match(/(-?\d+(?:\.\d+)?)\s*(rem|em|vw|vh|pt|px)?/i);
  if (dirtyMatch) {
    const num = parseFloat(dirtyMatch[1]);
    const unit = (dirtyMatch[2] || 'px').toLowerCase();
    if (unit === 'rem' || unit === 'em') return Math.round(num * baseFontSize);
    if (unit === 'vw') return Math.round((num / 100) * viewportWidth);
    if (unit === 'vh') return Math.round((num / 100) * 800);
    if (unit === 'pt') return Math.round(num * 1.333333);
    return Math.round(num);
  }

  return 0;
}

function parseBoxModelShorthand(valStr = '') {
  if (!valStr) return null;
  const parts = valStr.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;

  let top, right, bottom, left;
  if (parts.length === 1) {
    top = right = bottom = left = parsePixelValue(parts[0]);
  } else if (parts.length === 2) {
    top = bottom = parsePixelValue(parts[0]);
    right = left = parsePixelValue(parts[1]);
  } else if (parts.length === 3) {
    top = parsePixelValue(parts[0]);
    right = left = parsePixelValue(parts[1]);
    bottom = parsePixelValue(parts[2]);
  } else {
    top = parsePixelValue(parts[0]);
    right = parsePixelValue(parts[1]);
    bottom = parsePixelValue(parts[2]);
    left = parsePixelValue(parts[3]);
  }

  return {
    unit: 'px',
    top: String(top),
    right: String(right),
    bottom: String(bottom),
    left: String(left),
    isLinked: top === right && right === bottom && bottom === left
  };
}

function parseBorderRadiusShorthand(valStr = '') {
  if (!valStr) return null;
  const parts = valStr.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;

  let top, right, bottom, left;
  if (parts.length === 1) {
    const num = valStr.includes('9999') || valStr.includes('50%') ? 9999 : parsePixelValue(parts[0]);
    top = right = bottom = left = num;
  } else if (parts.length === 2) {
    top = bottom = parsePixelValue(parts[0]);
    right = left = parsePixelValue(parts[1]);
  } else if (parts.length === 4) {
    top = parsePixelValue(parts[0]);
    right = parsePixelValue(parts[1]);
    bottom = parsePixelValue(parts[2]);
    left = parsePixelValue(parts[3]);
  } else {
    top = right = bottom = left = parsePixelValue(parts[0]);
  }

  return {
    unit: 'px',
    top: String(top),
    right: String(right),
    bottom: String(bottom),
    left: String(left),
    isLinked: top === right && right === bottom && bottom === left
  };
}

function isDarkColor(hexOrRgb = '') {
  if (!hexOrRgb) return false;
  const hex = hexOrRgb.toLowerCase().trim();
  if (hex.startsWith('#')) {
    const raw = hex.slice(1);
    if (raw.length === 3) {
      const r = parseInt(raw[0] + raw[0], 16);
      const g = parseInt(raw[1] + raw[1], 16);
      const b = parseInt(raw[2] + raw[2], 16);
      return (r * 0.299 + g * 0.587 + b * 0.114) < 130;
    }
    if (raw.length === 6) {
      const r = parseInt(raw.slice(0, 2), 16);
      const g = parseInt(raw.slice(2, 4), 16);
      const b = parseInt(raw.slice(4, 6), 16);
      return (r * 0.299 + g * 0.587 + b * 0.114) < 130;
    }
  }
  if (hex.includes('0f172a') || hex.includes('1e293b') || hex.includes('rgb(15') || hex.includes('rgba(15')) {
    return true;
  }
  return false;
}

function parseBorderShorthand(borderVal = '') {
  if (!borderVal || borderVal === 'none') return null;
  const styles = ['solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset'];
  let borderStyle = 'solid';
  let borderWidth = 1;
  let borderColor = '#E2E8F0';

  // Extract color first: rgba/rgb/hsl or hex
  const colorMatch = borderVal.match(/(rgba?\([^)]+\)|hsla?\([^)]+\)|#[0-9a-fA-F]{3,8})/i);
  if (colorMatch) {
    borderColor = colorMatch[1];
  } else {
    // Check for named color that is not a style or length
    const tokens = borderVal.split(/\s+/);
    for (const tok of tokens) {
      const lower = tok.toLowerCase();
      if (!styles.includes(lower) &&
          !tok.match(/\d/) &&
          !['thin', 'medium', 'thick', 'none', 'initial', 'inherit', 'px'].includes(lower)) {
        borderColor = tok;
        break;
      }
    }
  }

  // Extract style
  for (const st of styles) {
    if (new RegExp(`\\b${st}\\b`, 'i').test(borderVal)) {
      borderStyle = st;
      break;
    }
  }

  // Extract width
  const widthMatch = borderVal.match(/(\d+(?:\.\d+)?)\s*px/i);
  if (widthMatch) {
    borderWidth = Math.round(parseFloat(widthMatch[1]));
  }

  return { borderStyle, borderWidth, borderColor };
}

function parseBoxShadow(valStr = '') {
  if (!valStr || valStr === 'none') return null;
  // If multi-layer shadow, take the primary (first) layer for Elementor's single control
  const primaryLayer = valStr.split(/,(?![^(]*\))/)[0].trim();
  const colorMatch = primaryLayer.match(/(rgba?\([^)]+\)|hsla?\([^)]+\)|#[0-9a-fA-F]{3,8})/i);
  const color = colorMatch ? colorMatch[1] : 'rgba(0, 0, 0, 0.1)';
  const lengthsStr = colorMatch ? primaryLayer.replace(colorMatch[0], '').trim() : primaryLayer.trim();
  const numMatches = lengthsStr.match(/(-?\d+(?:\.\d+)?)(?:px)?/g);
  if (!numMatches || numMatches.length < 2) return null;

  const nums = numMatches.map(n => parsePixelValue(n));
  const horizontal = nums[0] || 0;
  const vertical = nums[1] || 0;
  const blur = nums.length > 2 ? nums[2] : 0;
  const spread = nums.length > 3 ? nums[3] : 0;

  return { horizontal, vertical, blur, spread, color };
}

/**
 * Traverses Elementor elements and decorates them with styling declarations
 * extracted from matching CSS rules.
 */
function resolveCssToElementorStyles(rootElements = [], fullCss = '', typographyHierarchy = null) {
  if (!Array.isArray(rootElements) || !fullCss || typeof fullCss !== 'string') {
    return rootElements;
  }

  const variables = extractCssVariables(fullCss);
  const { rules, hoverRules } = parseCssRules(fullCss);

  const classRulesMap = new Map();
  const idRulesMap = new Map();
  const compoundRules = [];

  const hoverClassRulesMap = new Map();
  const hoverCompoundRules = [];

  for (const hRule of (hoverRules || [])) {
    if (!hRule.baseSelector || !hRule.declarations) continue;
    const hSel = hRule.baseSelector.trim();

    if (hSel.startsWith('.') && !hSel.slice(1).includes('.') && !hSel.includes(' ') && !hSel.includes(':') && !hSel.includes('>')) {
      const cls = hSel.slice(1);
      const existing = hoverClassRulesMap.get(cls) || {};
      hoverClassRulesMap.set(cls, { ...existing, ...hRule.declarations });
      continue;
    }

    const isCompound = /^[a-zA-Z0-9_-]*(?:\.[a-zA-Z0-9_-]+)+$/.test(hSel);
    if (isCompound) {
      const tagMatch = hSel.match(/^([a-zA-Z0-9_-]+)\./);
      const requiredTag = tagMatch ? tagMatch[1].toLowerCase() : null;
      const rawClasses = hSel.split('.').filter(Boolean);
      const requiredClasses = requiredTag ? rawClasses.filter(c => c.toLowerCase() !== requiredTag) : rawClasses;
      hoverCompoundRules.push({
        tag: requiredTag,
        classes: requiredClasses,
        declarations: hRule.declarations,
        specificity: (requiredTag ? 1 : 0) + requiredClasses.length * 10
      });
      continue;
    }
  }
  hoverCompoundRules.sort((a, b) => a.specificity - b.specificity);

  for (const rule of rules) {
    if (!rule.selector || !rule.declarations) continue;
    const sel = rule.selector.trim();

    // Skip rules containing dynamic interactive state classes (:hover, .is-active, etc.)
    // Dynamic interactive states are handled 100% via Scoped CSS and JavaScript toggles.
    const hasDynamicStateInSelector = Array.from(DYNAMIC_STATE_CLASSES).some(st => sel.includes(`.${st}`) || sel.includes(`:${st}`) || sel.includes(`[${st}]`));
    if (hasDynamicStateInSelector || sel.includes(':hover') || sel.includes(':focus')) {
      continue;
    }

    if (sel.startsWith('#') && !sel.includes(' ') && !sel.includes(':') && !sel.includes('>') && !sel.includes('.')) {
      const id = sel.slice(1);
      const existing = idRulesMap.get(id) || {};
      idRulesMap.set(id, { ...existing, ...rule.declarations });
      continue;
    }

    if (sel.startsWith('.') && !sel.slice(1).includes('.') && !sel.includes(' ') && !sel.includes(':') && !sel.includes('>')) {
      const cls = sel.slice(1);
      const existing = classRulesMap.get(cls) || {};
      classRulesMap.set(cls, { ...existing, ...rule.declarations });
      continue;
    }

    // Compound class / tag+class rule (e.g. .billing-opt-btn.is-active, button.is-active)
    const isCompound = /^[a-zA-Z0-9_-]*(?:\.[a-zA-Z0-9_-]+)+$/.test(sel);
    if (isCompound) {
      const tagMatch = sel.match(/^([a-zA-Z0-9_-]+)\./);
      const requiredTag = tagMatch ? tagMatch[1].toLowerCase() : null;
      const rawClasses = sel.split('.').filter(Boolean);
      const requiredClasses = requiredTag ? rawClasses.filter(c => c.toLowerCase() !== requiredTag) : rawClasses;
      compoundRules.push({
        tag: requiredTag,
        classes: requiredClasses,
        declarations: rule.declarations,
        specificity: (requiredTag ? 1 : 0) + requiredClasses.length * 10
      });
      continue;
    }

    const match = sel.match(/\.([a-zA-Z0-9\-_]+)$/);
    if (match && !sel.includes(':')) {
      const cls = match[1];
      const existing = classRulesMap.get(cls) || {};
      classRulesMap.set(cls, { ...existing, ...rule.declarations });
    }

    const idMatch = sel.match(/#([a-zA-Z0-9\-_]+)$/);
    if (idMatch && !sel.includes(':')) {
      const id = idMatch[1];
      const existing = idRulesMap.get(id) || {};
      idRulesMap.set(id, { ...existing, ...rule.declarations });
    }
  }

  // Sort compound rules by ascending specificity
  compoundRules.sort((a, b) => a.specificity - b.specificity);

  function applyStylesToElement(el, inheritedColor = null, parentIsDark = false, inheritedTextAlign = null) {
    if (!el || typeof el !== 'object') return;
    const s = el.settings || (el.settings = {});

    const rawClasses = s.css_classes || s._css_classes || '';
    const classList = rawClasses.split(/\s+/).filter(Boolean);
    let elementId = s._element_id || s.id || '';
    if (!elementId && s.title && typeof s.title === 'string') {
      const m = s.title.match(/id=["']([^"']+)["']/);
      if (m) elementId = m[1];
    }

    // Dynamic State Isolation (RULE-STA-01):
    // Filter out runtime state modifier classes before resolving static baseline settings.
    // Dynamic interactive states are handled 100% via Scoped CSS and JavaScript toggles.
    const baselineClassList = classList.filter(c => !DYNAMIC_STATE_CLASSES.has(c.toLowerCase()));

    let decls = {};
    for (const cls of baselineClassList) {
      if (classRulesMap.has(cls)) {
        decls = { ...decls, ...classRulesMap.get(cls) };
      }
    }

    // Compound Class Rules (e.g. .billing-opt-btn.is-active)
    const elTag = (el.widgetType || el.elType || '').toLowerCase();
    for (const cr of compoundRules) {
      if (cr.tag && cr.tag !== elTag) continue;
      // Skip compound rules containing dynamic state modifier classes
      if (cr.classes.some(c => DYNAMIC_STATE_CLASSES.has(c.toLowerCase()))) continue;
      if (cr.classes.every(c => baselineClassList.includes(c))) {
        decls = { ...decls, ...cr.declarations };
      }
    }

    if (elementId && idRulesMap.has(elementId)) {
      decls = { ...decls, ...idRulesMap.get(elementId) };
    }

    let hoverDecls = {};
    for (const cls of baselineClassList) {
      if (hoverClassRulesMap.has(cls)) {
        hoverDecls = { ...hoverDecls, ...hoverClassRulesMap.get(cls) };
      }
    }
    for (const hcr of hoverCompoundRules) {
      if (hcr.tag && hcr.tag !== elTag && !(hcr.tag === 'button' && el.widgetType === 'button') && !(hcr.tag === 'a' && el.widgetType === 'button')) continue;
      if (hcr.classes.every(c => baselineClassList.includes(c))) {
        hoverDecls = { ...hoverDecls, ...hcr.declarations };
      }
    }

    // 1. Background Color / Fill (with Fallback Extraction from Complex Gradients / Images)
    let rawBg = resolveCssValue(decls['background-color'] || decls['background'] || '', variables);
    let bgVal = rawBg;
    if (rawBg && (rawBg.includes('gradient') || rawBg.includes('url('))) {
      // In CSS multiple backgrounds: background: gradient1, gradient2, ... <base-color>;
      // The base background-color is the final solid color, NOT the transparent gradient overlay!
      const allColors = rawBg.match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)/gi) || [];
      const solidColor = [...allColors].reverse().find(c => {
        if (c.startsWith('#')) return true;
        if (c.startsWith('rgb(')) return true;
        const alphaMatch = c.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([0-9.]+)\)/i);
        return alphaMatch && parseFloat(alphaMatch[1]) >= 0.8;
      });
      if (solidColor) {
        bgVal = solidColor.trim();
      } else if (allColors.length > 0) {
        bgVal = allColors[allColors.length - 1].trim();
      }
    }
    if (el.widgetType === 'button') {
      if (bgVal && !bgVal.includes('gradient') && !bgVal.includes('url(')) {
        s.background_color = (bgVal === 'transparent' || bgVal === 'none') ? 'rgba(0,0,0,0)' : bgVal;
      }
    } else if (bgVal && !bgVal.includes('gradient') && !bgVal.includes('url(') && bgVal !== 'transparent' && bgVal !== 'none') {
      if (el.elType === 'widget') {
        if (!s._background_background) s._background_background = 'classic';
        if (!s._background_color) s._background_color = bgVal;
      } else {
        if (!s.background_background) s.background_background = 'classic';
        if (!s.background_color) s.background_color = bgVal;
      }
    }

    const containerIsDark = parentIsDark || isDarkColor(s.background_color || s._background_color || bgVal);

    function isBoxModelEmpty(bm) {
      if (!bm || typeof bm !== 'object') return true;
      return (!bm.top || bm.top === '0' || bm.top === 0) &&
             (!bm.right || bm.right === '0' || bm.right === 0) &&
             (!bm.bottom || bm.bottom === '0' || bm.bottom === 0) &&
             (!bm.left || bm.left === '0' || bm.left === 0);
    }

    // 2. Padding (shorthand & individual properties)
    let currentPadding = s.padding || s._padding || { unit: 'px', top: '0', right: '0', bottom: '0', left: '0', isLinked: true };
    const paddingVal = resolveCssValue(decls['padding'] || '', variables);
    if (paddingVal && isBoxModelEmpty(s.padding)) {
      const parsedPadding = parseBoxModelShorthand(paddingVal);
      if (parsedPadding) {
        currentPadding = parsedPadding;
      }
    }
    let padChanged = false;
    if (decls['padding-top']) { currentPadding.top = String(parsePixelValue(resolveCssValue(decls['padding-top'], variables))); padChanged = true; }
    if (decls['padding-right']) { currentPadding.right = String(parsePixelValue(resolveCssValue(decls['padding-right'], variables))); padChanged = true; }
    if (decls['padding-bottom']) { currentPadding.bottom = String(parsePixelValue(resolveCssValue(decls['padding-bottom'], variables))); padChanged = true; }
    if (decls['padding-left']) { currentPadding.left = String(parsePixelValue(resolveCssValue(decls['padding-left'], variables))); padChanged = true; }
    if (padChanged || paddingVal) {
      currentPadding.isLinked = currentPadding.top === currentPadding.right && currentPadding.right === currentPadding.bottom && currentPadding.bottom === currentPadding.left;
      s.padding = currentPadding;
      if (el.widgetType === 'button') {
        s.button_padding = currentPadding;
      } else if (el.elType === 'widget') {
        s._padding = currentPadding;
      }
    }

    // 3. Margin (shorthand & individual properties)
    let currentMargin = s.margin || s._margin || { unit: 'px', top: '0', right: '0', bottom: '0', left: '0', isLinked: true };
    const marginVal = resolveCssValue(decls['margin'] || '', variables);
    if (marginVal && isBoxModelEmpty(s.margin) && isBoxModelEmpty(s._margin)) {
      const parsedMargin = parseBoxModelShorthand(marginVal);
      if (parsedMargin) {
        currentMargin = parsedMargin;
      }
    }
    let marChanged = false;
    if (decls['margin-top']) { currentMargin.top = String(parsePixelValue(resolveCssValue(decls['margin-top'], variables))); marChanged = true; }
    if (decls['margin-right']) { currentMargin.right = String(parsePixelValue(resolveCssValue(decls['margin-right'], variables))); marChanged = true; }
    if (decls['margin-bottom']) { currentMargin.bottom = String(parsePixelValue(resolveCssValue(decls['margin-bottom'], variables))); marChanged = true; }
    if (decls['margin-left']) { currentMargin.left = String(parsePixelValue(resolveCssValue(decls['margin-left'], variables))); marChanged = true; }
    if (marChanged || marginVal) {
      currentMargin.isLinked = currentMargin.top === currentMargin.right && currentMargin.right === currentMargin.bottom && currentMargin.bottom === currentMargin.left;
      s.margin = currentMargin;
      s._margin = currentMargin;
    }

    // 4. Border Radius (RULE-BDG-01: Support widgets with _border_radius)
    const radiusVal = resolveCssValue(decls['border-radius'] || '', variables);
    if (radiusVal) {
      const parsedRadius = parseBorderRadiusShorthand(radiusVal);
      if (parsedRadius) {
        if (el.widgetType === 'button') {
          s.border_radius = parsedRadius;
        } else if (el.elType === 'widget') {
          if (!s._border_radius) s._border_radius = parsedRadius;
        } else {
          if (!s.border_radius) s.border_radius = parsedRadius;
        }
      }
    }

    // 5. Border (RULE-BDG-01: Support widgets with _border_border)
    const borderVal = resolveCssValue(decls['border'] || decls['border-top'] || decls['border-bottom'] || '', variables);
    if (borderVal && borderVal !== 'none') {
      const parsedBorder = parseBorderShorthand(borderVal);
      if (parsedBorder) {
        const borderObj = {
          border_border: parsedBorder.borderStyle,
          border_width: {
            unit: 'px',
            top: String(parsedBorder.borderWidth),
            right: String(parsedBorder.borderWidth),
            bottom: String(parsedBorder.borderWidth),
            left: String(parsedBorder.borderWidth),
            isLinked: true
          },
          border_color: parsedBorder.borderColor
        };
        if (el.widgetType === 'button') {
          s.border_border = borderObj.border_border;
          s.border_width = borderObj.border_width;
          s.border_color = borderObj.border_color;
        } else if (el.elType === 'widget') {
          s._border_border = borderObj.border_border;
          s._border_width = borderObj.border_width;
          s._border_color = borderObj.border_color;
        } else {
          s.border_border = borderObj.border_border;
          s.border_width = borderObj.border_width;
          s.border_color = borderObj.border_color;
        }
      }
    } else if (borderVal === 'none' && el.widgetType === 'button') {
      s.border_border = 'none';
    }
    const explicitBorderColor = resolveCssValue(decls['border-color'] || '', variables);
    if (explicitBorderColor) {
      if (el.widgetType === 'button') {
        s.border_color = explicitBorderColor;
      } else if (el.elType === 'widget') {
        if (!s._border_color || s._border_color === 'px') s._border_color = explicitBorderColor;
      } else {
        if (!s.border_color || s.border_color === 'px') s.border_color = explicitBorderColor;
      }
    }

    // 6. Box Shadow
    const shadowVal = resolveCssValue(decls['box-shadow'] || '', variables);
    if (shadowVal && shadowVal !== 'none' && (!s.box_shadow_box_shadow || s.box_shadow_box_shadow.blur === -12)) {
      const parsedShadow = parseBoxShadow(shadowVal);
      if (parsedShadow) {
        s.box_shadow_box_shadow = parsedShadow;
      }
    }

    // 7. Width & Multi-Column Flex Basis & Height
    const flexVal = resolveCssValue(decls['flex'] || decls['flex-basis'] || decls['width'] || '', variables);
    const displayVal = resolveCssValue(decls['display'] || '', variables);
    const isFitContent = flexVal === 'fit-content' || flexVal === 'max-content' || (!flexVal && (displayVal === 'inline-flex' || displayVal === 'inline-block'));

    if (isFitContent && !s.width) {
      s.content_width = 'full';
      s.width = { unit: 'custom', size: 'fit-content' };
      s.width_tablet = { unit: 'custom', size: 'fit-content' };
      s.width_mobile = { unit: 'custom', size: 'fit-content' };
      s._flex_size = 'none';
      s._flex_size_tablet = 'none';
      s._flex_size_mobile = 'none';
      s.flex_shrink = 0;
      s.flex_shrink_tablet = 0;
      s.flex_shrink_mobile = 0;
    } else if (flexVal) {
      const pctMatch = flexVal.match(/(\d+(?:\.\d+)?)\s*%/);
      const pxMatch = flexVal.match(/(\d+(?:\.\d+)?)\s*px/);
      if (pctMatch && !s.width) {
        const pctSize = Math.round(parseFloat(pctMatch[1]));
        s.width = { unit: '%', size: pctSize };
        s.width_mobile = { unit: '%', size: 100 };
        s._element_width = 'initial';
        if (el.widgetType === 'button' && pctSize >= 90) {
          s.align = 'justify';
        }
      } else if (pxMatch && (!s.width || s.width.unit !== 'px')) {
        const pxSize = Math.round(parseFloat(pxMatch[1]));
        s.width = { unit: 'px', size: pxSize };
        s.flex_shrink = 0;
        s._flex_size = 'none';
        s._element_width = 'initial';
      }
    }

    // Elementor Button Native Width Alignment Mapping:
    // In WordPress Elementor Core, a button expands to 100% width ONLY when align: 'justify'.
    if (el.widgetType === 'button') {
      const explicitWidth = resolveCssValue(decls['width'] || '', variables);
      const isBlockDisplay = decls['display'] === 'block';
      if (explicitWidth === '100%' || isBlockDisplay) {
        s.align = 'justify';
        delete s._element_width;
      } else if (decls['text-align'] && !['initial', 'inherit'].includes(decls['text-align'])) {
        s.align = decls['text-align'];
      }
      if (s.align === 'justify') {
        delete s._element_width;
      }
    }

    // W3C Text Alignment Resolution & Cascading
    const ownTextAlign = resolveCssValue(decls['text-align'] || '', variables);
    const activeTextAlign = (ownTextAlign && !['initial', 'inherit'].includes(ownTextAlign)) ? ownTextAlign : inheritedTextAlign;
    if (activeTextAlign && ['heading', 'text-editor', 'button'].includes(el.widgetType) && !s.align) {
      s.align = activeTextAlign;
    }

    // Fluid Container Protocol: Never lock containers with content to fixed heights!
    const heightVal = resolveCssValue(decls['height'] || decls['min-height'] || '', variables);
    if (heightVal && !s.height && !s.min_height) {
      const pxHeightMatch = heightVal.match(/(\d+(?:\.\d+)?)\s*px/);
      if (pxHeightMatch) {
        const pxHeight = Math.round(parseFloat(pxHeightMatch[1]));
        if (el.elType === 'container') {
          // Strictly enforce min_height so children never bleed outside the container
          s.min_height = { unit: 'px', size: pxHeight };
        } else {
          s.height = { unit: 'px', size: pxHeight };
          s.custom_height = { unit: 'px', size: pxHeight };
        }
        s.flex_shrink = 0;
      }
    }

    // 8. Flex Direction & Wrap (W3C CSS Specification Compliance)
    const isFlexDisplay = decls['display'] === 'flex' || decls['display'] === 'inline-flex';
    const flexDir = resolveCssValue(decls['flex-direction'] || '', variables);
    if (flexDir) {
      s.direction = flexDir;
      s.flex_direction = flexDir;
    } else if (isFlexDisplay && (!s.direction || s.direction === 'column')) {
      // In W3C CSS, the initial/default value for flex-direction is 'row'
      const isExplicitVertical = rawClasses.includes('list') || rawClasses.includes('stack') || rawClasses.includes('vertical');
      if (!isExplicitVertical) {
        s.direction = 'row';
        s.flex_direction = 'row';
      }
    }

    const flexWrap = resolveCssValue(decls['flex-wrap'] || '', variables);
    if (flexWrap) {
      s.wrap = flexWrap;
      s.flex_wrap = flexWrap;
    }

    // 9. Gap
    const gapVal = resolveCssValue(decls['gap'] || '', variables);
    if (gapVal) {
      const gapPx = parsePixelValue(gapVal);
      s.gap = { unit: 'px', size: gapPx, column: gapPx, row: gapPx };
      s.flex_gap = { unit: 'px', size: gapPx, column: gapPx, row: gapPx };
      s.space_between_widgets = gapPx;
    }

    // 10. Justify Content & Align Items
    const justifyVal = resolveCssValue(decls['justify-content'] || '', variables);
    if (justifyVal) {
      const normalizedJustify = justifyVal === 'start' ? 'flex-start' : justifyVal === 'end' ? 'flex-end' : justifyVal;
      s.justify_content = normalizedJustify;
      s.flex_justify_content = normalizedJustify;
    }
    const alignVal = resolveCssValue(decls['align-items'] || '', variables);
    if (alignVal) {
      const normalizedAlign = alignVal === 'start' ? 'flex-start' : alignVal === 'end' ? 'flex-end' : alignVal;
      s.align_items = normalizedAlign;
      s.flex_align_items = normalizedAlign;
    }
    const alignSelfVal = resolveCssValue(decls['align-self'] || '', variables);
    if (alignSelfVal) {
      const normalizedSelf = alignSelfVal === 'start' ? 'flex-start' : alignSelfVal === 'end' ? 'flex-end' : alignSelfVal;
      s.align_self = normalizedSelf;
      s.flex_align_self = normalizedSelf;
      s._flex_align_self = normalizedSelf;
    }

    // 10b. Absolute Positioning & Sovereign Z-Index Stacking Parity
    const positionVal = resolveCssValue(decls['position'] || '', variables);
    if (positionVal === 'absolute') {
      if (el.elType === 'widget') {
        s._position = 'absolute';
      } else {
        s.position = 'absolute';
      }

      // Sovereign Z-Index Resolution:
      const rawZIndex = resolveCssValue(decls['z-index'] || '', variables);
      if (rawZIndex && rawZIndex !== 'auto') {
        // Respect author's explicit z-index 1:1 (positive, negative, or 0)
        const parsedZ = parseInt(rawZIndex, 10);
        if (!isNaN(parsedZ)) {
          s._z_index = parsedZ;
          s.z_index = parsedZ;
        }
      } else {
        // Natural W3C Stacking Context Restoration:
        // In pure HTML, positioned elements naturally stack above in-flow content (e.g. <img>).
        // Because Elementor Free injects 'position: relative' on all sibling widget wrappers,
        // assign minimal natural elevation (z-index: 2) so foreground overlays are never occluded.
        s._z_index = 2;
        s.z_index = 2;
      }
    }

    // 11. CSS Color Cascade & Typography
    const ownTextColor = resolveCssValue(decls['color'] || '', variables);
    const activeTextColor = ownTextColor || inheritedColor;

    const fontSizeVal = resolveCssValue(decls['font-size'] || '', variables);
    if (fontSizeVal && !s.typography_font_size) {
      const pxSize = parsePixelValue(fontSizeVal);
      if (pxSize > 0) {
        s.typography_font_size = { unit: 'px', size: pxSize };
        s.typography_typography = 'custom';
      }
    }
    // Task M5: Typography hierarchy may ONLY fill missing sizes when no size is defined
    if (!s.typography_font_size && typographyHierarchy?.sizes && (el.elType === 'widget' || s.title || s.editor)) {
      const isHeading = el.widgetType === 'heading' || (s.header_size && /^h[1-6]$/i.test(s.header_size));
      const tag = (el.tag || s.header_size || (isHeading ? 'h2' : 'body')).toLowerCase();
      const hierSize = typographyHierarchy.sizes[tag] || (isHeading ? typographyHierarchy.sizes.heading : typographyHierarchy.sizes.body);
      if (hierSize > 0) {
        s.typography_font_size = { unit: 'px', size: hierSize };
        s.typography_typography = 'custom';
      }
    }
    const fontWeightVal = resolveCssValue(decls['font-weight'] || '', variables);
    if (fontWeightVal) {
      s.typography_font_weight = String(fontWeightVal);
      s.typography_typography = 'custom';
    }
    const lineHtVal = resolveCssValue(decls['line-height'] || '', variables);
    if (lineHtVal && !s.typography_line_height) {
      const lhNum = parseFloat(lineHtVal);
      if (lhNum > 0) {
        s.typography_line_height = { unit: 'em', size: lhNum };
        s.typography_typography = 'custom';
      }
    }

    // Font Family resolution (RULE-FNT-01: per-element or hierarchical typography cascade)
    const fontFamilyVal = resolveCssValue(decls['font-family'] || '', variables);
    if (fontFamilyVal && !s.typography_font_family) {
      const cleanFont = cleanFontName(fontFamilyVal);
      if (cleanFont && cleanFont !== 'inherit') {
        s.typography_font_family = cleanFont;
        s.typography_typography = 'custom';
      }
    }

    if (!s.typography_font_family && typographyHierarchy && (el.elType === 'widget' || s.title || s.editor)) {
      const isHeading = el.widgetType === 'heading' || (s.header_size && /^h[1-6]$/i.test(s.header_size));
      const targetFont = isHeading ? typographyHierarchy.headingFont : typographyHierarchy.bodyFont;
      if (targetFont) {
        s.typography_font_family = targetFont;
        s.typography_typography = 'custom';
      }
    }

    if (el.widgetType === 'heading') {
      if (ownTextColor) {
        s.title_color = ownTextColor;
      } else if (activeTextColor) {
        s.title_color = activeTextColor;
      } else if (containerIsDark && (!s.title_color || s.title_color.toLowerCase() === '#0f172a')) {
        s.title_color = '#FFFFFF';
      }
    } else if (el.widgetType === 'text-editor') {
      if (ownTextColor) {
        s.text_color = ownTextColor;
        s.editor_color = ownTextColor;
      } else if (activeTextColor) {
        s.text_color = activeTextColor;
        s.editor_color = activeTextColor;
      } else if (containerIsDark && (!s.text_color || s.text_color.toLowerCase() === '#64748b')) {
        s.text_color = '#FFFFFF';
        s.editor_color = '#FFFFFF';
      }
    } else if (el.widgetType === 'button') {
      if (ownTextColor) {
        s.button_text_color = ownTextColor;
        s.text_color = ownTextColor;
      } else if (activeTextColor) {
        s.button_text_color = activeTextColor;
        s.text_color = activeTextColor;
      } else if (rawClasses.includes('primary') || rawClasses.includes('submit')) {
        s.button_text_color = '#FFFFFF';
        s.text_color = '#FFFFFF';
        s.typography_typography = 'custom';
      }
    } else if (el.widgetType === 'icon') {
      const isCheckIcon = (s.icon_value?.value || s.selected_icon?.value || '').includes('check') || rawClasses.includes('check');
      if (isCheckIcon) {
        s.size = { unit: 'px', size: 13 };
        s.primary_color = '#10B981';
        s._element_width = 'auto';
      }
      const isFeatureOrAddonIcon = rawClasses.includes('addon') || rawClasses.includes('feature') || (elementId && elementId.includes('icon'));
      if (isFeatureOrAddonIcon && !s.size) {
        s.size = { unit: 'px', size: 16 };
        s._element_width = 'auto';
      }
      if (ownTextColor) {
        s.primary_color = ownTextColor;
      } else if (activeTextColor && !isCheckIcon) {
        s.primary_color = activeTextColor;
      }
    }

    // 12. Native Pseudo-Class :hover Resolution (compiler-rules.json pseudoClasses.hover)
    if (el.widgetType === 'button') {
      const hoverBg = resolveCssValue(hoverDecls['background-color'] || hoverDecls['background'] || '', variables);
      if (hoverBg && hoverBg !== 'none') {
        const solidHoverBg = extractSolidColor(hoverBg) || hoverBg;
        s.button_background_hover_color = solidHoverBg;
      }
      const hoverTextColor = resolveCssValue(hoverDecls['color'] || '', variables);
      if (hoverTextColor) {
        s.hover_color = hoverTextColor;
      }
      const hoverBorderColor = resolveCssValue(hoverDecls['border-color'] || '', variables);
      if (hoverBorderColor) {
        s.border_color_hover = hoverBorderColor;
        s.button_hover_border_color = hoverBorderColor;
      }
    } else if (el.elType === 'container') {
      const hoverBorderColor = resolveCssValue(hoverDecls['border-color'] || '', variables);
      if (hoverBorderColor) {
        s.border_hover_color = hoverBorderColor;
        s.border_hover_border = s.border_border || 'solid';
      }
      const hoverShadow = resolveCssValue(hoverDecls['box-shadow'] || '', variables);
      if (hoverShadow && hoverShadow !== 'none') {
        const parsedHoverShadow = parseBoxShadow(hoverShadow);
        if (parsedHoverShadow) {
          s.box_shadow_hover_box_shadow_type = 'yes';
          s.box_shadow_hover_box_shadow = parsedHoverShadow;
        }
      }
      const hoverTransition = resolveCssValue(hoverDecls['transition'] || hoverDecls['transition-duration'] || '', variables);
      if (hoverTransition) {
        const durMatch = hoverTransition.match(/(\d+(?:\.\d+)?)\s*s/);
        if (durMatch) {
          s.border_hover_transition = { unit: 's', size: parseFloat(durMatch[1]) };
        }
      }
    }

    // Recursively process child elements with active inherited color, text-align & container darkness
    if (Array.isArray(el.elements)) {
      for (const child of el.elements) {
        applyStylesToElement(child, activeTextColor, containerIsDark, activeTextAlign);
      }
    }
  }

  for (const root of rootElements) {
    applyStylesToElement(root, null, false, null);
  }

  // Root Page Background Parity (RULE-BG-01):
  // If original CSS specifies a background on body or html, apply it to root container
  // to prevent Elementor pages defaulting to stark white theme resets.
  let bodyBgColor = null;
  for (const rule of rules) {
    const sel = (rule.selector || '').trim().toLowerCase();
    if (sel === 'body' || sel === 'html' || sel.startsWith('body ') || sel === ':root') {
      const bg = resolveCssValue(rule.declarations['background-color'] || rule.declarations['background'] || '', variables);
      if (bg && !bg.includes('gradient') && bg !== 'transparent' && bg !== 'none') {
        bodyBgColor = bg;
      }
    }
  }

  if (bodyBgColor && rootElements.length > 0 && rootElements[0].elType === 'container') {
    const rootSettings = rootElements[0].settings || (rootElements[0].settings = {});
    if (!rootSettings.background_color) {
      rootSettings.background_background = 'classic';
      rootSettings.background_color = bodyBgColor;
    }
  }

  return rootElements;
}

module.exports = {
  extractCssVariables,
  resolveCssValue,
  flattenCssVariables,
  parsePixelValue,
  parseBoxModelShorthand,
  parseBorderRadiusShorthand,
  parseBoxShadow,
  resolveCssToElementorStyles
};

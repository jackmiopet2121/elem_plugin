/**
 * Computed Style & CSSOM Cascade Engine.
 * Implements standard W3C CSS Cascade, inheritance, and variable resolution.
 * Provides computed style resolution for any HTML DOM node based on stylesheets and inline styles.
 */

const { parseInlineStyle, parseCssRules } = require('./css-parser');

/**
 * Extracts and resolves CSS custom properties (variables) with support
 * for nested/chained fallbacks and multi-pass resolution.
 */
function extractCssVariables(rawCss = '') {
  const variables = {};
  if (!rawCss || typeof rawCss !== 'string') return variables;

  const varRegex = /(--[a-zA-Z0-9\-_]+)\s*:\s*([^;]+);/g;
  let match;
  while ((match = varRegex.exec(rawCss)) !== null) {
    variables[match[1].trim()] = match[2].trim();
  }

  // Multi-pass resolution for chained variables (e.g. var(--color-surface))
  let changed = true;
  let iterations = 0;
  while (changed && iterations < 8) {
    changed = false;
    iterations++;
    for (const [k, v] of Object.entries(variables)) {
      const resolved = v.replace(/var\((--[a-zA-Z0-9\-_]+)(?:,\s*([^)]+))?\)/g, (_, varName, fallback) => {
        if (variables[varName]) {
          changed = true;
          return variables[varName];
        }
        return fallback ? fallback.trim() : '';
      });
      if (resolved !== v) {
        variables[k] = resolved;
      }
    }
  }

  return variables;
}

/**
 * Replaces all var(--name, fallback) references in a CSS property value.
 */
function resolveCssValue(value = '', variables = {}) {
  if (!value || typeof value !== 'string') return '';
  let resolved = value;
  let iterations = 0;
  while (resolved.includes('var(') && iterations < 6) {
    iterations++;
    const next = resolved.replace(/var\((--[a-zA-Z0-9\-_]+)(?:,\s*([^)]+))?\)/g, (_, varName, fallback) => {
      return variables[varName] !== undefined ? variables[varName] : (fallback ? fallback.trim() : '');
    });
    if (next === resolved) break;
    resolved = next;
  }
  return resolved.trim();
}

/**
 * Parses numeric pixel values cleanly.
 */
function parsePixelValue(valStr = '') {
  if (typeof valStr === 'number') return Math.round(valStr);
  const match = String(valStr).match(/(-?\d+(?:\.\d+)?)\s*(?:px)?/i);
  return match ? Math.round(parseFloat(match[1])) : 0;
}

/**
 * Determines whether a color is perceptually dark (luminance < 130).
 */
function isDarkColor(hexOrRgb = '') {
  if (!hexOrRgb) return false;
  const str = hexOrRgb.toLowerCase().trim();
  if (str === 'transparent' || str === 'none') return false;

  if (str.startsWith('#')) {
    const raw = str.slice(1);
    if (raw.length === 3) {
      const r = parseInt(raw[0] + raw[0], 16);
      const g = parseInt(raw[1] + raw[1], 16);
      const b = parseInt(raw[2] + raw[2], 16);
      return (r * 0.299 + g * 0.587 + b * 0.114) < 130;
    }
    if (raw.length === 6 || raw.length === 8) {
      const r = parseInt(raw.slice(0, 2), 16);
      const g = parseInt(raw.slice(2, 4), 16);
      const b = parseInt(raw.slice(4, 6), 16);
      return (r * 0.299 + g * 0.587 + b * 0.114) < 130;
    }
  }

  const rgbMatch = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10);
    const g = parseInt(rgbMatch[2], 10);
    const b = parseInt(rgbMatch[3], 10);
    return (r * 0.299 + g * 0.587 + b * 0.114) < 130;
  }

  // Dark slate and navy tokens
  if (str.includes('0f172a') || str.includes('1e293b') || str.includes('000000') || str.includes('111827') || str.includes('slate-900')) {
    return true;
  }
  return false;
}

/**
 * Parses CSS 1-4 part box model shorthands (margin/padding).
 */
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

/**
 * Parses CSS border-radius shorthand.
 */
function parseBorderRadiusShorthand(valStr = '') {
  if (!valStr) return null;
  const parts = valStr.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;

  let top, right, bottom, left;
  if (parts.length === 1) {
    const num = valStr.includes('9999') || valStr.includes('50%') || valStr.includes('full') ? 9999 : parsePixelValue(parts[0]);
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

/**
 * Parses CSS border shorthand.
 */
function parseBorderShorthand(borderVal = '') {
  if (!borderVal || borderVal === 'none') return null;
  const styles = ['solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset'];
  let borderStyle = 'solid';
  let borderWidth = 1;
  let borderColor = '#E2E8F0';

  const colorMatch = borderVal.match(/(rgba?\([^)]+\)|hsla?\([^)]+\)|#[0-9a-fA-F]{3,8})/i);
  if (colorMatch) {
    borderColor = colorMatch[1];
  } else {
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

  for (const st of styles) {
    if (new RegExp(`\\b${st}\\b`, 'i').test(borderVal)) {
      borderStyle = st;
      break;
    }
  }

  const widthMatch = borderVal.match(/(\d+(?:\.\d+)?)\s*px/i);
  if (widthMatch) {
    borderWidth = Math.round(parseFloat(widthMatch[1]));
  }

  return { borderStyle, borderWidth, borderColor };
}

/**
 * Parses CSS box-shadow shorthand.
 */
function parseBoxShadow(valStr = '') {
  if (!valStr || valStr === 'none') return null;
  const colorMatch = valStr.match(/(rgba?\([^)]+\)|hsla?\([^)]+\)|#[0-9a-fA-F]{3,8})/i);
  const color = colorMatch ? colorMatch[1] : 'rgba(0, 0, 0, 0.1)';
  const lengthsStr = colorMatch ? valStr.replace(colorMatch[0], '').trim() : valStr.trim();
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
 * Builds a Computed Style Context from full raw CSS stylesheets.
 */
function createComputedStyleContext(fullCss = '') {
  const variables = extractCssVariables(fullCss);
  const { rules } = parseCssRules(fullCss);

  const idMap = new Map();
  const classMap = new Map();
  const tagMap = new Map();
  const compoundRules = [];
  const complexRules = [];

  for (const rule of rules) {
    if (!rule.selector || !rule.declarations) continue;
    const sel = rule.selector.trim();

    // ID rule
    if (sel.startsWith('#') && !sel.includes(' ') && !sel.includes(':') && !sel.includes('>') && !sel.includes('.')) {
      const id = sel.slice(1);
      const existing = idMap.get(id) || {};
      idMap.set(id, { ...existing, ...rule.declarations });
      continue;
    }

    // Single Class rule
    if (sel.startsWith('.') && !sel.slice(1).includes('.') && !sel.includes(' ') && !sel.includes(':') && !sel.includes('>')) {
      const cls = sel.slice(1);
      const existing = classMap.get(cls) || {};
      classMap.set(cls, { ...existing, ...rule.declarations });
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

    // Tag rule
    if (/^[a-zA-Z0-9]+$/.test(sel)) {
      const tag = sel.toLowerCase();
      const existing = tagMap.get(tag) || {};
      tagMap.set(tag, { ...existing, ...rule.declarations });
      continue;
    }

    // Class terminal match
    const classTerminalMatch = sel.match(/\.([a-zA-Z0-9\-_]+)$/);
    if (classTerminalMatch && !sel.includes(':')) {
      const cls = classTerminalMatch[1];
      const existing = classMap.get(cls) || {};
      classMap.set(cls, { ...existing, ...rule.declarations });
    }

    // ID terminal match
    const idTerminalMatch = sel.match(/#([a-zA-Z0-9\-_]+)$/);
    if (idTerminalMatch && !sel.includes(':')) {
      const id = idTerminalMatch[1];
      const existing = idMap.get(id) || {};
      idMap.set(id, { ...existing, ...rule.declarations });
    }

    complexRules.push(rule);
  }

  // Sort compound rules by ascending specificity so higher specificity overwrites lower
  compoundRules.sort((a, b) => a.specificity - b.specificity);

  /**
   * Resolves the computed style for a DOM node according to standard CSS specificity.
   * Specificity order: Tag < Class < Compound Rules < ID < Inline Style.
   */
  function computeStyleForNode(node = {}, parentComputedStyle = null) {
    const tagName = (node.tagName || '').toLowerCase();
    const classAttr = node.className || node.attribs?.class || '';
    const classList = classAttr.split(/\s+/).filter(Boolean);
    const idAttr = node.id || node.attribs?.id || '';
    const inlineStyle = typeof node.style === 'string' ? parseInlineStyle(node.style) : (node.style || {});

    // 1. Accumulate declarations in specificity order
    let decls = {};

    // A. Tag rules
    if (tagMap.has(tagName)) {
      decls = { ...decls, ...tagMap.get(tagName) };
    }

    // B. Single Class rules
    for (const cls of classList) {
      if (classMap.has(cls)) {
        decls = { ...decls, ...classMap.get(cls) };
      }
    }

    // C. Compound Class & State rules (e.g. .billing-opt-btn.is-active)
    for (const cr of compoundRules) {
      if (cr.tag && cr.tag !== tagName) continue;
      if (cr.classes.every(c => classList.includes(c))) {
        decls = { ...decls, ...cr.declarations };
      }
    }

    // D. ID rules
    if (idAttr && idMap.has(idAttr)) {
      decls = { ...decls, ...idMap.get(idAttr) };
    }

    // E. Inline styles
    decls = { ...decls, ...inlineStyle };

    // 2. Resolve CSS variables across all declarations
    const resolvedDecls = {};
    for (const [k, v] of Object.entries(decls)) {
      resolvedDecls[k] = resolveCssValue(v, variables);
    }

    // 3. Inheritance & Computed Properties
    const parent = parentComputedStyle || {};

    // Typography & Color Inheritance
    const ownColor = resolvedDecls['color'] || '';
    const computedColor = ownColor || parent.computedColor || '';

    const ownFontFamily = resolvedDecls['font-family'] || '';
    const computedFontFamily = ownFontFamily || parent.computedFontFamily || '';

    const ownFontSize = resolvedDecls['font-size'] || '';
    const computedFontSize = ownFontSize ? parsePixelValue(ownFontSize) : (parent.computedFontSize || null);

    const ownFontWeight = resolvedDecls['font-weight'] || '';
    const computedFontWeight = ownFontWeight || parent.computedFontWeight || null;

    const ownLineHeight = resolvedDecls['line-height'] || '';
    const computedLineHeight = ownLineHeight ? parseFloat(ownLineHeight) : (parent.computedLineHeight || null);

    // Background & Darkness (with Fallback Extraction from Complex Gradients / Images)
    const rawBg = resolvedDecls['background-color'] || resolvedDecls['background'] || '';
    let bgVal = rawBg;
    if (rawBg && (rawBg.includes('gradient') || rawBg.includes('url('))) {
      const colorMatch = rawBg.match(/,\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\))\s*$/i) ||
                         rawBg.match(/(?:^|\s)(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\))(?:\s|$)/i);
      if (colorMatch) {
        bgVal = colorMatch[1].trim();
      }
    }
    const isDark = isDarkColor(bgVal) || (parent.isDark && (!bgVal || bgVal === 'transparent' || bgVal === 'none'));

    // Box Model
    const padding = parseBoxModelShorthand(resolvedDecls['padding'] || '');
    const margin = parseBoxModelShorthand(resolvedDecls['margin'] || '');
    const borderRadius = parseBorderRadiusShorthand(resolvedDecls['border-radius'] || '');
    const border = parseBorderShorthand(resolvedDecls['border'] || resolvedDecls['border-top'] || resolvedDecls['border-bottom'] || '');
    const boxShadow = parseBoxShadow(resolvedDecls['box-shadow'] || '');

    // Dimensions
    const widthVal = resolvedDecls['width'] || resolvedDecls['flex-basis'] || resolvedDecls['flex'] || '';
    let parsedWidth = null;
    if (widthVal) {
      const pct = widthVal.match(/(\d+(?:\.\d+)?)\s*%/);
      const px = widthVal.match(/(\d+(?:\.\d+)?)\s*px/);
      if (pct) {
        parsedWidth = { unit: '%', size: Math.round(parseFloat(pct[1])) };
      } else if (px) {
        parsedWidth = { unit: 'px', size: Math.round(parseFloat(px[1])) };
      }
    }

    const heightVal = resolvedDecls['height'] || resolvedDecls['min-height'] || '';
    const parsedHeight = heightVal ? parsePixelValue(heightVal) : null;

    // Flexbox
    const display = resolvedDecls['display'] || '';
    const isFlex = display === 'flex' || display === 'inline-flex';
    let direction = resolvedDecls['flex-direction'] || '';
    if (!direction && isFlex) {
      direction = 'row'; // Standard CSS default
    }

    const justifyContent = resolvedDecls['justify-content'] || '';
    const alignItems = resolvedDecls['align-items'] || '';
    const alignSelf = resolvedDecls['align-self'] || '';
    const flexWrap = resolvedDecls['flex-wrap'] || '';
    const gap = resolvedDecls['gap'] ? parsePixelValue(resolvedDecls['gap']) : null;

    return {
      rawDeclarations: resolvedDecls,
      computedColor,
      computedFontFamily,
      computedFontSize,
      computedFontWeight,
      computedLineHeight,
      backgroundColor: bgVal,
      isDark,
      padding,
      margin,
      borderRadius,
      border,
      boxShadow,
      width: parsedWidth,
      height: parsedHeight,
      display,
      isFlex,
      direction,
      justifyContent,
      alignItems,
      alignSelf,
      flexWrap,
      gap,
      flexShrink: resolvedDecls['flex-shrink'] !== undefined ? parseInt(resolvedDecls['flex-shrink'], 10) : (parsedWidth?.unit === 'px' ? 0 : null)
    };
  }

  return {
    variables,
    computeStyleForNode
  };
}

module.exports = {
  extractCssVariables,
  resolveCssValue,
  parsePixelValue,
  isDarkColor,
  parseBoxModelShorthand,
  parseBorderRadiusShorthand,
  parseBorderShorthand,
  parseBoxShadow,
  createComputedStyleContext
};

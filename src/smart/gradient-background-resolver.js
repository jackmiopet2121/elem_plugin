/**
 * Gradient Background Resolver.
 * Block 8.2 — Phase 5, Part 4A: Native Two-Stop Linear Gradients
 *
 * Safely parses computed CSS linear gradients and routes 2-stop linear gradients
 * to native Elementor Free container gradient settings.
 */

'use strict';

const { readComputedCssProperty, isFullyTransparentColor } = require('./computed-style-resolver');
const { parseColorParts, isColorEqual } = require('./tolerances');

/**
 * Splits a CSS value string by top-level commas, respecting parentheses and quotes.
 * Returns null if parentheses or quotes are unbalanced/malformed.
 *
 * @param {string} str
 * @returns {string[]|null}
 */
function splitTopLevelCommas(str) {
  if (typeof str !== 'string') return null;
  const tokens = [];
  let depth = 0;
  let inQuote = null;
  let current = '';

  for (let i = 0; i < str.length; i++) {
    const char = str[i];

    if (inQuote) {
      if (char === inQuote && str[i - 1] !== '\\') {
        inQuote = null;
      }
      current += char;
    } else if (char === '"' || char === "'") {
      inQuote = char;
      current += char;
    } else if (char === '(') {
      depth++;
      current += char;
    } else if (char === ')') {
      depth--;
      if (depth < 0) return null; // Unbalanced closing paren
      current += char;
    } else if (char === ',' && depth === 0) {
      const trimmed = current.trim();
      if (trimmed.length === 0) return null; // Empty token between commas
      tokens.push(trimmed);
      current = '';
    } else {
      current += char;
    }
  }

  if (depth !== 0 || inQuote !== null) {
    return null; // Unbalanced syntax
  }

  const trimmed = current.trim();
  if (trimmed.length > 0) {
    tokens.push(trimmed);
  }

  return tokens;
}

/**
 * Cardinal directions mapping to degrees.
 */
const CARDINAL_DIRECTIONS = Object.freeze({
  'to top': 0,
  'to right': 90,
  'to bottom': 180,
  'to left': 270
});

/**
 * Regex for diagonal keyword directions.
 */
const DIAGONAL_DIRECTION_REGEX = /^to\s+(?:top|bottom|left|right)\s+(?:top|bottom|left|right)$/i;

/**
 * Strict decimal pattern: (?:\d+(?:\.\d*)?|\.\d+) with optional +/-
 */
const STRICT_DECIMAL_PATTERN = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)';
const STRICT_DECIMAL_EXACT = new RegExp(`^${STRICT_DECIMAL_PATTERN}$`);

/**
 * Parses a single color stop token into { color, stop } or returns { error }.
 *
 * @param {string} token
 * @param {number} defaultStopPercent
 * @returns {{ color: string, stop: number } | { error: string }}
 */
function parseStopToken(token, defaultStopPercent) {
  if (!token || typeof token !== 'string') {
    return { error: 'invalid_stop' };
  }
  const s = token.trim();
  if (!s) {
    return { error: 'invalid_stop' };
  }

  // Check if token is just a color hint (percentage or length without a color)
  if (new RegExp(`^${STRICT_DECIMAL_PATTERN}(?:%|px|em|rem|vh|vw|pt)?$`, 'i').test(s)) {
    return { error: 'color_hint' };
  }

  let colorPart = s;
  let stopVal = defaultStopPercent;

  // Check if token ends with a stop position after whitespace
  const trailingMatch = s.match(/\s+([^\s]+)$/);
  if (trailingMatch) {
    const trailingPart = trailingMatch[1];

    if (trailingPart.endsWith('%')) {
      const rawNum = trailingPart.slice(0, -1);
      if (!STRICT_DECIMAL_EXACT.test(rawNum)) {
        return { error: 'invalid_stop' };
      }
      const parsed = Number(rawNum);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
        return { error: 'invalid_stop' };
      }
      stopVal = parsed;
      colorPart = s.slice(0, s.length - trailingPart.length).trim();

      // Check for double position stops (e.g. "red 0% 50%")
      if (/\s+[^\s]+$/i.test(colorPart)) {
        const prevTrailing = colorPart.match(/\s+([^\s]+)$/)[1];
        if (prevTrailing.endsWith('%') || new RegExp(`^${STRICT_DECIMAL_PATTERN}(?:%|px|em|rem|vh|vw|pt)?$`, 'i').test(prevTrailing)) {
          return { error: 'invalid_stop' };
        }
      }
    } else if (new RegExp(`^(?:${STRICT_DECIMAL_PATTERN}|[\\d.]+)(?:px|em|rem|vh|vw|pt)$`, 'i').test(trailingPart)) {
      // Non-% unit stop
      return { error: 'invalid_stop' };
    } else if (STRICT_DECIMAL_EXACT.test(trailingPart)) {
      // Unitless number stop
      return { error: 'invalid_stop' };
    }
  }

  if (!colorPart) {
    return { error: 'color_hint' };
  }

  // Validate color syntax and ensure all channels are finite numbers
  const parsedColor = parseColorParts(colorPart);
  if (
    !parsedColor ||
    !Number.isFinite(parsedColor.r) ||
    !Number.isFinite(parsedColor.g) ||
    !Number.isFinite(parsedColor.b) ||
    !Number.isFinite(parsedColor.a) ||
    parsedColor.r < 0 || parsedColor.r > 255 ||
    parsedColor.g < 0 || parsedColor.g > 255 ||
    parsedColor.b < 0 || parsedColor.b > 255 ||
    parsedColor.a < 0 || parsedColor.a > 1
  ) {
    return { error: 'unknown_color_syntax' };
  }

  return {
    color: colorPart,
    stop: stopVal
  };
}

/**
 * Pure parser for linear-gradient CSS string and background-color.
 *
 * @param {string} rawBgImage
 * @param {string} [rawBgColor]
 * @returns {{ mode: 'native-linear' | 'unsupported', settings: Object|null, reason: string|null }}
 */
function parseLinearGradient(rawBgImage, rawBgColor) {
  // 1. Separate opaque base color check
  if (rawBgColor && !isFullyTransparentColor(rawBgColor)) {
    return { mode: 'unsupported', settings: null, reason: 'opaque_base_color' };
  }

  // 2. Validate rawBgImage presence
  if (!rawBgImage || typeof rawBgImage !== 'string') {
    return { mode: 'unsupported', settings: null, reason: 'not_linear_gradient' };
  }
  const s = rawBgImage.trim();
  if (!s || s.toLowerCase() === 'none') {
    return { mode: 'unsupported', settings: null, reason: 'not_linear_gradient' };
  }

  // 3. Top-level multi-layer check
  const layers = splitTopLevelCommas(s);
  if (!layers || layers.length === 0) {
    return { mode: 'unsupported', settings: null, reason: 'malformed_gradient_syntax' };
  }
  if (layers.length > 1) {
    return { mode: 'unsupported', settings: null, reason: 'multi_layer' };
  }

  const singleLayer = layers[0].trim();

  // 4. Repeating, conic, or radial gradients check
  if (/^(?:repeating-linear-gradient|radial-gradient|repeating-radial-gradient|conic-gradient|repeating-conic-gradient)\s*\(/i.test(singleLayer)) {
    return { mode: 'unsupported', settings: null, reason: 'repeating_or_conic_or_radial' };
  }

  // 5. Must be linear-gradient
  const gradMatch = singleLayer.match(/^linear-gradient\s*\(([\s\S]*)\)$/i);
  if (!gradMatch) {
    return { mode: 'unsupported', settings: null, reason: 'not_linear_gradient' };
  }

  const inner = gradMatch[1].trim();
  if (!inner) {
    return { mode: 'unsupported', settings: null, reason: 'malformed_gradient_syntax' };
  }

  const args = splitTopLevelCommas(inner);
  if (!args || args.length === 0) {
    return { mode: 'unsupported', settings: null, reason: 'malformed_gradient_syntax' };
  }

  // 6. Parse angle / direction or detect omitted angle
  let angle = 180;
  let isAngleArg = false;
  const firstArg = args[0].trim();
  const firstArgLower = firstArg.toLowerCase();

  if (firstArgLower.startsWith('to ')) {
    if (CARDINAL_DIRECTIONS[firstArgLower] !== undefined) {
      angle = CARDINAL_DIRECTIONS[firstArgLower];
      isAngleArg = true;
    } else if (DIAGONAL_DIRECTION_REGEX.test(firstArgLower)) {
      return { mode: 'unsupported', settings: null, reason: 'diagonal_direction' };
    } else {
      return { mode: 'unsupported', settings: null, reason: 'invalid_angle' };
    }
  } else if (/(?:deg|rad|turn|grad)$/i.test(firstArg)) {
    const degMatch = firstArg.match(new RegExp(`^(${STRICT_DECIMAL_PATTERN})\\s*deg$`, 'i'));
    if (!degMatch) {
      return { mode: 'unsupported', settings: null, reason: 'invalid_angle' };
    }
    const num = Number(degMatch[1]);
    if (!Number.isFinite(num)) {
      return { mode: 'unsupported', settings: null, reason: 'invalid_angle' };
    }
    // Normalize angle to [0, 360) without precision loss
    let norm = ((num % 360) + 360) % 360;
    if (num >= 0 && num < 360) {
      norm = num;
    }
    angle = norm;
    isAngleArg = true;
  } else if (new RegExp(`^${STRICT_DECIMAL_PATTERN}$`).test(firstArg)) {
    // Unitless number is invalid angle in CSS linear-gradient
    return { mode: 'unsupported', settings: null, reason: 'invalid_angle' };
  }

  const stopArgs = isAngleArg ? args.slice(1) : args;

  // 7. Check stop count (exactly 2 stops required)
  if (stopArgs.length > 2) {
    return { mode: 'unsupported', settings: null, reason: 'three_plus_stops' };
  }
  if (stopArgs.length < 2) {
    return { mode: 'unsupported', settings: null, reason: 'less_than_two_stops' };
  }

  // 8. Parse first stop (default: 0%)
  const stop1 = parseStopToken(stopArgs[0], 0);
  if (stop1.error) {
    return { mode: 'unsupported', settings: null, reason: stop1.error };
  }

  // 9. Parse second stop (default: 100%)
  const stop2 = parseStopToken(stopArgs[1], 100);
  if (stop2.error) {
    return { mode: 'unsupported', settings: null, reason: stop2.error };
  }

  // 10. Construct native Elementor settings
  const settings = {
    background_background: 'gradient',
    background_color: stop1.color,
    background_color_stop: { unit: '%', size: stop1.stop, sizes: [] },
    background_color_b: stop2.color,
    background_color_b_stop: { unit: '%', size: stop2.stop, sizes: [] },
    background_gradient_type: 'linear',
    background_gradient_angle: { unit: 'deg', size: angle, sizes: [] }
  };

  return {
    mode: 'native-linear',
    settings,
    reason: null
  };
}

/**
 * Resolves container gradient background from Chromium computed styles.
 * Throws FULL_STYLE_* error if style dictionary is present but property/ref is missing.
 *
 * @param {Object} gtNode
 * @param {Object} gtSnapshot
 * @param {string} [viewport='desktop']
 * @returns {{ mode: 'native-linear' | 'unsupported', settings: Object|null, reason: string|null }}
 */
function resolveGradientBackground(gtNode, gtSnapshot, viewport = 'desktop') {
  const rawBgImage = readComputedCssProperty(gtNode, gtSnapshot, viewport, 'background-image', 'backgroundImage');
  const rawBgColor = readComputedCssProperty(gtNode, gtSnapshot, viewport, 'background-color', 'backgroundColor');

  return parseLinearGradient(rawBgImage, rawBgColor);
}

/**
 * Pure helper that evaluates computed background-image and background-color across 3 viewports
 * and produces a safe, scoped CSS fallback plan for radial and complex gradients.
 *
 * @param {Object} viewportStyles - { desktop: { backgroundImage, backgroundColor }, tablet: {...}, mobile: {...} }
 * @returns {{
 *   supported: boolean,
 *   reason: string|null,
 *   hasCssRoute: boolean,
 *   cssControlled: { desktop: boolean, tablet: boolean, mobile: boolean },
 *   declarations: { desktop: string[]|null, tablet: string[]|null, mobile: string[]|null },
 *   isReset: { desktop: boolean, tablet: boolean, mobile: boolean }
 * }}
 */
function resolveScopedGradientPlan(viewportStyles) {
  const defaultRes = (supported, reason, cssControlled = { desktop: false, tablet: false, mobile: false }) => ({
    supported,
    reason,
    hasCssRoute: false,
    cssControlled,
    declarations: { desktop: null, tablet: null, mobile: null },
    isReset: { desktop: false, tablet: false, mobile: false }
  });

  if (!viewportStyles || typeof viewportStyles !== 'object') {
    return defaultRes(false, 'missing_computed_style');
  }

  const vps = ['desktop', 'tablet', 'mobile'];
  const bgImgMap = {};
  const bgColMap = {};

  for (const vp of vps) {
    const s = viewportStyles[vp];
    if (!s || typeof s !== 'object') {
      return defaultRes(false, 'missing_computed_style');
    }

    const rawImg = s.backgroundImage !== undefined ? s.backgroundImage : s['background-image'];
    const rawCol = s.backgroundColor !== undefined ? s.backgroundColor : s['background-color'];

    if (rawImg === undefined || rawImg === null || rawCol === undefined || rawCol === null) {
      return defaultRes(false, 'missing_computed_style');
    }
    if (typeof rawImg !== 'string' || typeof rawCol !== 'string') {
      return defaultRes(false, 'missing_computed_style');
    }

    const trimmedImg = rawImg.trim();
    const trimmedCol = rawCol.trim();

    if (trimmedImg === '' || trimmedCol === '') {
      return defaultRes(false, 'empty_computed_style');
    }

    bgImgMap[vp] = trimmedImg;
    bgColMap[vp] = trimmedCol;
  }

  // 1. Injection checks: control characters, tags, semicolons, braces, comments, @import
  const INJECTION_REGEX = /[\x00-\x1f\x7f]|[;<>{}]|\/\*|\*\/|@import/i;
  for (const vp of vps) {
    if (INJECTION_REGEX.test(bgImgMap[vp]) || INJECTION_REGEX.test(bgColMap[vp])) {
      return defaultRes(false, 'unsafe_css_injection');
    }
  }

  // 2. Mixed gradient + URL check
  const URL_REGEX = /\b(?:url|image-set)\s*\(/i;
  for (const vp of vps) {
    if (URL_REGEX.test(bgImgMap[vp]) || URL_REGEX.test(bgColMap[vp])) {
      return defaultRes(false, 'mixed_gradient_url');
    }
  }

  // 3. Color parser validation on background-color
  for (const vp of vps) {
    const parsed = parseColorParts(bgColMap[vp]);
    if (
      !parsed ||
      !Number.isFinite(parsed.r) ||
      !Number.isFinite(parsed.g) ||
      !Number.isFinite(parsed.b) ||
      !Number.isFinite(parsed.a) ||
      parsed.r < 0 || parsed.r > 255 ||
      parsed.g < 0 || parsed.g > 255 ||
      parsed.b < 0 || parsed.b > 255 ||
      parsed.a < 0 || parsed.a > 1
    ) {
      return defaultRes(false, 'invalid_background_color');
    }
  }

  // 4. Validate gradient layers on background-image
  const GRADIENT_FUNC_REGEX = /^(?:linear-gradient|repeating-linear-gradient|radial-gradient|repeating-radial-gradient|conic-gradient|repeating-conic-gradient)\s*\(([\s\S]*)\)$/i;
  for (const vp of vps) {
    const imgVal = bgImgMap[vp];
    if (imgVal.toLowerCase() === 'none') {
      continue;
    }

    const layers = splitTopLevelCommas(imgVal);
    if (!layers || layers.length === 0) {
      return defaultRes(false, 'malformed_gradient_syntax');
    }

    for (const layer of layers) {
      const trimmedLayer = layer.trim();
      if (trimmedLayer.toLowerCase() === 'none') {
        continue;
      }
      const match = trimmedLayer.match(GRADIENT_FUNC_REGEX);
      if (!match || !match[1].trim()) {
        return defaultRes(false, 'unsupported_layer');
      }
    }
  }

  function isNone(val) {
    return typeof val === 'string' && val.trim().toLowerCase() === 'none';
  }

  function normalizeVal(s) {
    return String(s || '').replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').trim().toLowerCase();
  }

  function areColorsEqual(c1, c2) {
    return isColorEqual(c1, c2);
  }

  // Case A: All viewports are none -> no CSS route
  if (isNone(bgImgMap.desktop) && isNone(bgImgMap.tablet) && isNone(bgImgMap.mobile)) {
    return {
      supported: true,
      reason: 'all_none',
      hasCssRoute: false,
      cssControlled: { desktop: false, tablet: false, mobile: false },
      declarations: { desktop: null, tablet: null, mobile: null },
      isReset: { desktop: false, tablet: false, mobile: false }
    };
  }

  // Parse each non-none viewport using parseLinearGradient
  const parsed = {
    desktop: isNone(bgImgMap.desktop) ? { mode: 'none' } : parseLinearGradient(bgImgMap.desktop, bgColMap.desktop),
    tablet: isNone(bgImgMap.tablet) ? { mode: 'none' } : parseLinearGradient(bgImgMap.tablet, bgColMap.tablet),
    mobile: isNone(bgImgMap.mobile) ? { mode: 'none' } : parseLinearGradient(bgImgMap.mobile, bgColMap.mobile)
  };

  // Case B: All viewports are native-linear with semantically identical stop colors A and B
  const allNativeLinear =
    parsed.desktop.mode === 'native-linear' &&
    parsed.tablet.mode === 'native-linear' &&
    parsed.mobile.mode === 'native-linear';

  if (allNativeLinear) {
    const sameColors =
      areColorsEqual(parsed.desktop.settings.background_color, parsed.tablet.settings.background_color) &&
      areColorsEqual(parsed.desktop.settings.background_color, parsed.mobile.settings.background_color) &&
      areColorsEqual(parsed.desktop.settings.background_color_b, parsed.tablet.settings.background_color_b) &&
      areColorsEqual(parsed.desktop.settings.background_color_b, parsed.mobile.settings.background_color_b);

    if (sameColors) {
      return {
        supported: true,
        reason: 'all_native_linear',
        hasCssRoute: false,
        cssControlled: { desktop: false, tablet: false, mobile: false },
        declarations: { desktop: null, tablet: null, mobile: null },
        isReset: { desktop: false, tablet: false, mobile: false }
      };
    }
  }

  // CSS Route computation
  const declarations = { desktop: null, tablet: null, mobile: null };
  const cssControlled = { desktop: false, tablet: false, mobile: false };
  const isReset = { desktop: false, tablet: false, mobile: false };

  function buildDeclarations(imageVal, colorVal, includeColor) {
    const decls = [`background-image: ${imageVal} !important;`];
    if (includeColor && colorVal) {
      decls.push(`background-color: ${colorVal} !important;`);
    }
    return decls;
  }

  function sameBgColor(colA, colB) {
    return areColorsEqual(colA, colB);
  }

  // 1. Desktop evaluation
  if (!isNone(bgImgMap.desktop)) {
    if (parsed.desktop.mode !== 'native-linear') {
      declarations.desktop = buildDeclarations(bgImgMap.desktop, bgColMap.desktop, true);
      cssControlled.desktop = true;
    } else {
      // Desktop is native-linear, native Elementor settings will represent it
      declarations.desktop = null;
      cssControlled.desktop = false;
    }
  } else {
    declarations.desktop = null;
    cssControlled.desktop = false;
  }

  const desktopHasCssRule = declarations.desktop !== null;
  const desktopIsNative = parsed.desktop.mode === 'native-linear';

  // 2. Tablet evaluation
  let activeCssImageAfterTab = null;
  let activeCssColorAfterTab = null;
  let tabletHasCssRule = false;

  if (isNone(bgImgMap.tablet)) {
    if (desktopHasCssRule || desktopIsNative) {
      declarations.tablet = buildDeclarations('none', bgColMap.tablet, true);
      cssControlled.tablet = true;
      isReset.tablet = true;
      activeCssImageAfterTab = 'none';
      activeCssColorAfterTab = bgColMap.tablet;
      tabletHasCssRule = true;
    } else {
      declarations.tablet = null;
      cssControlled.tablet = false;
    }
  } else {
    const tabCanBeNative =
      desktopIsNative &&
      parsed.tablet.mode === 'native-linear' &&
      areColorsEqual(parsed.desktop.settings.background_color, parsed.tablet.settings.background_color) &&
      areColorsEqual(parsed.desktop.settings.background_color_b, parsed.tablet.settings.background_color_b);

    if (tabCanBeNative) {
      declarations.tablet = null;
      cssControlled.tablet = false;
      tabletHasCssRule = false;
    } else {
      if (desktopHasCssRule) {
        const sameImg = normalizeVal(bgImgMap.tablet) === normalizeVal(bgImgMap.desktop);
        const sameCol = sameBgColor(bgColMap.tablet, bgColMap.desktop);
        if (sameImg && sameCol) {
          declarations.tablet = null;
          cssControlled.tablet = true;
          activeCssImageAfterTab = bgImgMap.desktop;
          activeCssColorAfterTab = bgColMap.desktop;
          tabletHasCssRule = true;
        } else {
          declarations.tablet = buildDeclarations(bgImgMap.tablet, bgColMap.tablet, true);
          cssControlled.tablet = true;
          activeCssImageAfterTab = bgImgMap.tablet;
          activeCssColorAfterTab = bgColMap.tablet;
          tabletHasCssRule = true;
        }
      } else {
        declarations.tablet = buildDeclarations(bgImgMap.tablet, bgColMap.tablet, true);
        cssControlled.tablet = true;
        activeCssImageAfterTab = bgImgMap.tablet;
        activeCssColorAfterTab = bgColMap.tablet;
        tabletHasCssRule = true;
      }
    }
  }

  // 3. Mobile evaluation
  const effectiveCssActive = tabletHasCssRule
    ? { image: activeCssImageAfterTab, color: activeCssColorAfterTab }
    : (desktopHasCssRule ? { image: bgImgMap.desktop, color: bgColMap.desktop } : null);

  if (isNone(bgImgMap.mobile)) {
    if (effectiveCssActive) {
      if (effectiveCssActive.image !== 'none') {
        declarations.mobile = buildDeclarations('none', bgColMap.mobile, true);
        cssControlled.mobile = true;
        isReset.mobile = true;
      } else {
        declarations.mobile = null;
        cssControlled.mobile = true;
        isReset.mobile = true;
      }
    } else if (desktopIsNative) {
      declarations.mobile = buildDeclarations('none', bgColMap.mobile, true);
      cssControlled.mobile = true;
      isReset.mobile = true;
    } else {
      declarations.mobile = null;
      cssControlled.mobile = false;
    }
  } else {
    const mobCanBeNative =
      !effectiveCssActive &&
      desktopIsNative &&
      parsed.mobile.mode === 'native-linear' &&
      areColorsEqual(parsed.desktop.settings.background_color, parsed.mobile.settings.background_color) &&
      areColorsEqual(parsed.desktop.settings.background_color_b, parsed.mobile.settings.background_color_b);

    if (mobCanBeNative) {
      declarations.mobile = null;
      cssControlled.mobile = false;
    } else {
      if (effectiveCssActive) {
        const sameImg = normalizeVal(bgImgMap.mobile) === normalizeVal(effectiveCssActive.image);
        const sameCol = sameBgColor(bgColMap.mobile, effectiveCssActive.color);
        if (sameImg && sameCol) {
          declarations.mobile = null;
          cssControlled.mobile = true;
        } else {
          declarations.mobile = buildDeclarations(bgImgMap.mobile, bgColMap.mobile, true);
          cssControlled.mobile = true;
        }
      } else {
        declarations.mobile = buildDeclarations(bgImgMap.mobile, bgColMap.mobile, true);
        cssControlled.mobile = true;
      }
    }
  }

  const hasCssRoute = Boolean(declarations.desktop || declarations.tablet || declarations.mobile);

  return {
    supported: true,
    reason: null,
    hasCssRoute,
    cssControlled,
    declarations,
    isReset
  };
}

module.exports = {
  resolveGradientBackground,
  resolveScopedGradientPlan,
  parseLinearGradient,
  splitTopLevelCommas,
  CARDINAL_DIRECTIONS
};

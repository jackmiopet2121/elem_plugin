/**
 * Image Background Geometry Resolver.
 * Block 8.2 — Phase 5, Part 3A (Desktop Geometry)
 *
 * Resolves background-size, background-position, and background-repeat
 * from Chromium computed styles for single-image containers.
 */

'use strict';

const { readComputedCssProperty } = require('./computed-style-resolver');

// Allowed Elementor native background_position values
const VALID_POSITIONS = new Set([
  'top left', 'top center', 'top right',
  'center left', 'center center', 'center right',
  'bottom left', 'bottom center', 'bottom right'
]);

// Allowed Elementor native background_size values
const VALID_SIZES = new Set(['cover', 'contain', 'auto']);

// Allowed Elementor native background_repeat values
const VALID_REPEATS = new Set(['repeat', 'no-repeat', 'repeat-x', 'repeat-y']);

/**
 * Normalizes a coordinate string ('0%', '50%', '100%', '0px', 'top', etc.) along an axis ('x' or 'y')
 * @param {string} val
 * @param {'x'|'y'} axis
 * @returns {string|null} '0%' | '50%' | '100%' | null
 */
function normalizeCoordinate(val, axis) {
  if (!val || typeof val !== 'string') return null;
  const s = val.trim().toLowerCase();
  if (s === '0%' || s === '0px' || s === '0') return '0%';
  if (s === '50%') return '50%';
  if (s === '100%') return '100%';
  if (axis === 'x') {
    if (s === 'left') return '0%';
    if (s === 'center') return '50%';
    if (s === 'right') return '100%';
  }
  if (axis === 'y') {
    if (s === 'top') return '0%';
    if (s === 'center') return '50%';
    if (s === 'bottom') return '100%';
  }
  return null;
}

/**
 * Maps background-position value to Elementor native setting
 * @param {string} rawVal
 * @returns {string|null}
 */
function mapBackgroundPosition(rawVal) {
  if (!rawVal || typeof rawVal !== 'string') return null;
  const s = rawVal.trim().toLowerCase();
  if (!s) return null;

  // Direct match to one of the 9 Elementor values
  if (VALID_POSITIONS.has(s)) {
    return s;
  }

  // Handle swapped keywords e.g. "left top" -> "top left"
  const swappedMap = {
    'left top': 'top left',
    'center top': 'top center',
    'right top': 'top right',
    'left center': 'center left',
    'right center': 'center right',
    'left bottom': 'bottom left',
    'center bottom': 'bottom center',
    'right bottom': 'bottom right'
  };
  if (swappedMap[s]) {
    return swappedMap[s];
  }

  const parts = s.split(/\s+/).filter(Boolean);

  if (parts.length === 1) {
    const single = parts[0];
    if (single === 'center' || single === '50%') return 'center center';
    if (single === 'top') return 'top center';
    if (single === 'bottom') return 'bottom center';
    if (single === 'left' || single === '0%' || single === '0px' || single === '0') return 'center left';
    if (single === 'right' || single === '100%') return 'center right';
    return null;
  }

  if (parts.length === 2) {
    let xCoord = null;
    let yCoord = null;

    // Check if parts are in Y X order (e.g. "top center", "bottom 50%")
    if (['top', 'bottom'].includes(parts[0])) {
      yCoord = normalizeCoordinate(parts[0], 'y');
      xCoord = normalizeCoordinate(parts[1], 'x');
    } else {
      xCoord = normalizeCoordinate(parts[0], 'x');
      yCoord = normalizeCoordinate(parts[1], 'y');
    }

    if (xCoord && yCoord) {
      if (xCoord === '0%' && yCoord === '0%') return 'top left';
      if (xCoord === '50%' && yCoord === '0%') return 'top center';
      if (xCoord === '100%' && yCoord === '0%') return 'top right';
      if (xCoord === '0%' && yCoord === '50%') return 'center left';
      if (xCoord === '50%' && yCoord === '50%') return 'center center';
      if (xCoord === '100%' && yCoord === '50%') return 'center right';
      if (xCoord === '0%' && yCoord === '100%') return 'bottom left';
      if (xCoord === '50%' && yCoord === '100%') return 'bottom center';
      if (xCoord === '100%' && yCoord === '100%') return 'bottom right';
    }
  }

  return null;
}

/**
 * Maps background-size value to Elementor native setting
 * @param {string} rawVal
 * @returns {string|null}
 */
function mapBackgroundSize(rawVal) {
  if (!rawVal || typeof rawVal !== 'string') return null;
  const s = rawVal.trim().toLowerCase().split(/\s+/).join(' ');
  if (s === 'cover') return 'cover';
  if (s === 'contain') return 'contain';
  if (s === 'auto' || s === 'auto auto') return 'auto';
  return null;
}

/**
 * Maps background-repeat value to Elementor native setting
 * @param {string} rawVal
 * @returns {string|null}
 */
function mapBackgroundRepeat(rawVal) {
  if (!rawVal || typeof rawVal !== 'string') return null;
  const s = rawVal.trim().toLowerCase().split(/\s+/).join(' ');
  if (s === 'repeat' || s === 'repeat repeat') return 'repeat';
  if (s === 'no-repeat' || s === 'no-repeat no-repeat') return 'no-repeat';
  if (s === 'repeat-x' || s === 'repeat no-repeat') return 'repeat-x';
  if (s === 'repeat-y' || s === 'no-repeat repeat') return 'repeat-y';
  return null;
}

/**
 * Resolves desktop background geometry for a single image container.
 *
 * @param {Object} gtNode - Ground truth node record
 * @param {Object} gtSnapshot - Ground truth snapshot containing styleDictionary or styles
 * @param {string} [viewport='desktop'] - Viewport name
 * @returns {{ settings: Object, unsupported: Array<{ property: string, value: string, reason: string }> }}
 */
function resolveImageBackgroundGeometry(gtNode, gtSnapshot, viewport = 'desktop') {
  const vp = viewport || 'desktop';
  const settings = {};
  const unsupported = [];

  // 1. Background Size
  const rawSize = readComputedCssProperty(gtNode, gtSnapshot, vp, 'background-size', 'backgroundSize');
  const mappedSize = mapBackgroundSize(rawSize);
  if (mappedSize) {
    settings.background_size = mappedSize;
  } else {
    unsupported.push({
      property: 'background-size',
      value: rawSize,
      reason: 'UNSUPPORTED_BACKGROUND_SIZE_VALUE'
    });
  }

  // 2. Background Position
  const rawPos = readComputedCssProperty(gtNode, gtSnapshot, vp, 'background-position', 'backgroundPosition');
  const mappedPos = mapBackgroundPosition(rawPos);
  if (mappedPos) {
    settings.background_position = mappedPos;
  } else {
    unsupported.push({
      property: 'background-position',
      value: rawPos,
      reason: 'UNSUPPORTED_BACKGROUND_POSITION_VALUE'
    });
  }

  // 3. Background Repeat
  const rawRepeat = readComputedCssProperty(gtNode, gtSnapshot, vp, 'background-repeat', 'backgroundRepeat');
  const mappedRepeat = mapBackgroundRepeat(rawRepeat);
  if (mappedRepeat) {
    settings.background_repeat = mappedRepeat;
  } else {
    unsupported.push({
      property: 'background-repeat',
      value: rawRepeat,
      reason: 'UNSUPPORTED_BACKGROUND_REPEAT_VALUE'
    });
  }

  return {
    settings,
    unsupported
  };
}

/**
 * Extracts clean URL from single background-image url(...) definition.
 * Returns null for none, empty, multi-layer, gradients, or malformed syntax.
 * @param {string} bgImageStr
 * @returns {string|null}
 */
function extractSingleImageUrl(bgImageStr) {
  if (!bgImageStr || typeof bgImageStr !== 'string') return null;
  const s = bgImageStr.trim();
  if (!s || s === 'none') return null;

  // Double-quoted URL: url("...")
  const doubleMatch = s.match(/^url\(\s*"((?:[^"\\]|\\.)*)"\s*\)$/i);
  if (doubleMatch) {
    const url = doubleMatch[1].trim();
    return url.length > 0 ? url : null;
  }

  // Single-quoted URL: url('...')
  const singleMatch = s.match(/^url\(\s*'((?:[^'\\]|\\.)*)'\s*\)$/i);
  if (singleMatch) {
    const url = singleMatch[1].trim();
    return url.length > 0 ? url : null;
  }

  // Unquoted URL: url(...) without quotes, commas, parens, or whitespace
  const unquotedMatch = s.match(/^url\(\s*([^\s'"(),]+)\s*\)$/i);
  if (unquotedMatch) {
    const url = unquotedMatch[1].trim();
    return url.length > 0 ? url : null;
  }

  return null;
}

/**
 * Validates whether a URL string is safe to embed in generated CSS url("...") rules.
 * Prevents CSS injection, HTML tag escapes, control characters, and dangerous URI schemes.
 *
 * @param {string} url
 * @returns {boolean}
 */
function isSafeCssUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const s = url.trim();
  if (!s) return false;

  // Case-insensitive </style check (prevents breakout from style tags)
  if (/<\/style/i.test(s)) return false;

  // ASCII control characters (0x00 to 0x1F and 0x7F)
  if (/[\x00-\x1f\x7f]/.test(s)) return false;

  // CSS string-breaking syntax: " (quote), \ (escape), ; (declaration end), { or } (block boundaries)
  if (/["\\;{}]/.test(s)) return false;

  // Scheme validation: if URL starts with a scheme, permit only http/https with valid hostname
  const schemeMatch = s.match(/^([a-z][a-z0-9+.-]*):/i);
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase();
    if (scheme !== 'http' && scheme !== 'https') {
      return false;
    }
    try {
      const parsed = new URL(s);
      if (!parsed.hostname || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) {
        return false;
      }
    } catch {
      return false;
    }
  }

  return true;
}

/**
 * Classifies the image background state of a computed background-image string.
 *
 * @param {string} bgImageStr
 * @returns {{
 *   state: 'none' | 'url' | 'unsupported',
 *   url: string | null,
 *   reason: string | null
 * }}
 */
function classifyImageBackgroundState(bgImageStr) {
  if (bgImageStr === undefined || bgImageStr === null) {
    return { state: 'unsupported', url: null, reason: 'missing_computed_style' };
  }
  if (typeof bgImageStr !== 'string') {
    return { state: 'unsupported', url: null, reason: 'invalid_type' };
  }

  const s = bgImageStr.trim();
  if (s === '' || s.toLowerCase() === 'none') {
    return { state: 'none', url: null, reason: null };
  }

  const url = extractSingleImageUrl(s);
  if (url) {
    if (isSafeCssUrl(url)) {
      return { state: 'url', url, reason: null };
    } else {
      return { state: 'unsupported', url: null, reason: 'unsafe_url' };
    }
  }

  return { state: 'unsupported', url: null, reason: 'unsupported_image_syntax' };
}

/**
 * Resolves the responsive image background plan across desktop, tablet, and mobile.
 *
 * @param {Object} dState - { state: 'url'|'none'|'unsupported', url: string|null }
 * @param {Object} tState - { state: 'url'|'none'|'unsupported', url: string|null }
 * @param {Object} mState - { state: 'url'|'none'|'unsupported', url: string|null }
 * @param {Function} [resolveAssetUrl] - Function to resolve asset URL
 * @param {Object} [options] - Compiler options
 * @returns {{
 *   nativeSettings: {
 *     background_image_tablet: { url: string, id: string } | undefined,
 *     background_image_mobile: { url: string, id: string } | undefined
 *   },
 *   cssRules: {
 *     tablet: string | null,
 *     mobile: string | null
 *   },
 *   hasCssRoute: boolean
 * }}
 */
function resolveResponsiveImagePlan(dState, tState, mState, resolveAssetUrl = null, options = {}) {
  const resolve = (rawUrl) => {
    if (!rawUrl) return null;
    return typeof resolveAssetUrl === 'function' ? resolveAssetUrl(rawUrl, options) : rawUrl;
  };

  const dUrl = dState && dState.state === 'url' ? resolve(dState.url) : null;
  const tUrl = tState && tState.state === 'url' ? resolve(tState.url) : null;
  const mUrl = mState && mState.state === 'url' ? resolve(mState.url) : null;

  const dSafe = dUrl ? isSafeCssUrl(dUrl) : false;
  const tSafe = tUrl ? isSafeCssUrl(tUrl) : false;
  const mSafe = mUrl ? isSafeCssUrl(mUrl) : false;

  const effDState = dState?.state === 'url' && dSafe ? 'url' : (dState?.state === 'none' ? 'none' : 'unsupported');
  const effTState = tState?.state === 'url' && tSafe ? 'url' : (tState?.state === 'none' ? 'none' : 'unsupported');
  const effMState = mState?.state === 'url' && mSafe ? 'url' : (mState?.state === 'none' ? 'none' : 'unsupported');

  const nativeSettings = {
    background_image_tablet: undefined,
    background_image_mobile: undefined
  };

  const cssRules = {
    tablet: null,
    mobile: null
  };

  // Case 1: Desktop is URL
  if (effDState === 'url') {
    if (effTState === 'none') {
      // Tablet cannot natively clear image -> Scoped CSS reset
      cssRules.tablet = 'background-image: none !important;';

      if (effMState === 'none') {
        // Mobile inherits tablet's <= 1024px rule -> zero duplicate rule
        cssRules.mobile = null;
      } else if (effMState === 'url') {
        // Mobile re-applies URL (either same as desktop or different)
        cssRules.mobile = `background-image: url("${mUrl}") !important;`;
      }
    } else if (effTState === 'url') {
      let effTabUrl = dUrl;
      if (tUrl !== dUrl) {
        nativeSettings.background_image_tablet = { url: tUrl, id: '' };
        effTabUrl = tUrl;
      }

      if (effMState === 'none') {
        // Mobile cannot natively clear image -> Scoped CSS reset
        cssRules.mobile = 'background-image: none !important;';
      } else if (effMState === 'url') {
        if (mUrl !== effTabUrl) {
          nativeSettings.background_image_mobile = { url: mUrl, id: '' };
        }
      }
    } else {
      // Tablet is unsupported -> no guessed native setting
      if (effMState === 'url' && mUrl !== dUrl) {
        nativeSettings.background_image_mobile = { url: mUrl, id: '' };
      }
    }
  }

  // Case 2: Desktop is none
  if (effDState === 'none') {
    if (effTState === 'url') {
      // Desktop has no image, so tablet cannot be set natively -> Scoped CSS
      cssRules.tablet = `background-image: url("${tUrl}") !important;`;

      if (effMState === 'none') {
        // Mobile must explicitly reset to none to avoid inheriting tablet's !important rule
        cssRules.mobile = 'background-image: none !important;';
      } else if (effMState === 'url') {
        if (mUrl === tUrl) {
          // Mobile inherits tablet rule -> zero duplicate rule
          cssRules.mobile = null;
        } else {
          // Mobile has distinct URL -> explicit override
          cssRules.mobile = `background-image: url("${mUrl}") !important;`;
        }
      }
    } else if (effTState === 'none') {
      if (effMState === 'url') {
        // Mobile-only image when desktop & tablet are none
        cssRules.mobile = `background-image: url("${mUrl}") !important;`;
      }
    }
  }

  const hasCssRoute = Boolean(cssRules.tablet || cssRules.mobile);

  return {
    nativeSettings,
    cssRules,
    hasCssRoute
  };
}

module.exports = {
  resolveImageBackgroundGeometry,
  mapBackgroundSize,
  mapBackgroundPosition,
  mapBackgroundRepeat,
  extractSingleImageUrl,
  isSafeCssUrl,
  classifyImageBackgroundState,
  resolveResponsiveImagePlan,
  VALID_POSITIONS,
  VALID_SIZES,
  VALID_REPEATS
};

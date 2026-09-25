/**
 * Page Canvas Resolver & Router.
 * Codename: "Single-Pass + Verify" (Block 8.2 - Phase 4)
 *
 * Pure, deterministic resolver that maps html/body canvas background to native
 * Elementor Free page_settings based strictly on Chromium computed ground truth.
 *
 * Rules:
 * - Requires all production VIEWPORTS (desktop, tablet, mobile). Missing any -> INVALID_CAPTURE.
 * - Requires valid, non-empty backgroundColor, backgroundImage, and opacity in [0, 1]. Missing/NaN/out-of-bounds -> INVALID_CAPTURE.
 * - Alpha is opaque ONLY when alpha === 1; 0.999 is semi-transparent -> UNSUPPORTED_LAYERED.
 * - Compares viewport colors by parsed channels/alpha, not raw string whitespace.
 * - Gradients, images, opacity < 1, and alpha layering are explicitly UNSUPPORTED_LAYERED.
 * - Solid opaque body with no image -> body background color.
 * - Transparent body + solid opaque html with no image -> html background color.
 * - Both transparent with no image -> TRANSPARENT_DEFAULT.
 * - Responsive differences across viewports -> RESPONSIVE_CANVAS_UNSUPPORTED.
 * - ZERO hardcoding of classes, IDs, filenames, or specific colors.
 */

'use strict';

const { VIEWPORTS } = require('./style-snapshot');

const REQUIRED_VIEWPORTS = Object.freeze(Object.keys(VIEWPORTS || {
  desktop: { width: 1280, height: 800 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 370, height: 667 }
}));

/**
 * Parses a CSS color string to determine opacity, transparency, channels, and structure.
 *
 * @param {string} colorStr
 * @returns {{ isTransparent: boolean, isOpaque: boolean, isSemiTransparent: boolean, alpha: number, r: number, g: number, b: number, raw: string } | null}
 */
function parseCssColor(colorStr) {
  if (!colorStr || typeof colorStr !== 'string') return null;
  const s = colorStr.trim().toLowerCase();
  if (s === '') return null;

  if (s === 'transparent') {
    return { isTransparent: true, isOpaque: false, isSemiTransparent: false, alpha: 0, r: 0, g: 0, b: 0, raw: colorStr };
  }

  // rgb(r, g, b)
  const rgbMatch = s.match(/^rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10);
    const g = parseInt(rgbMatch[2], 10);
    const b = parseInt(rgbMatch[3], 10);
    if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) return null;
    return {
      isTransparent: false,
      isOpaque: true,
      isSemiTransparent: false,
      alpha: 1,
      r,
      g,
      b,
      raw: colorStr
    };
  }

  // rgba(r, g, b, a)
  const rgbaMatch = s.match(/^rgba\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/);
  if (rgbaMatch) {
    const r = parseInt(rgbaMatch[1], 10);
    const g = parseInt(rgbaMatch[2], 10);
    const b = parseInt(rgbaMatch[3], 10);
    if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) return null;
    const alpha = parseFloat(rgbaMatch[4]);
    if (isNaN(alpha) || alpha < 0 || alpha > 1) return null;
    const isTransparent = (alpha === 0);
    const isOpaque = (alpha === 1);
    const isSemiTransparent = (alpha > 0 && alpha < 1);
    return {
      isTransparent,
      isOpaque,
      isSemiTransparent,
      alpha,
      r,
      g,
      b,
      raw: colorStr
    };
  }

  // Modern CSS rgb(r g b / a) / rgba(r g b / a)
  const slashMatch = s.match(/^rgb(?:a)?\s*\(\s*(\d+)\s+(\d+)\s+(\d+)\s*\/\s*([\d.]+%?)\s*\)$/);
  if (slashMatch) {
    const r = parseInt(slashMatch[1], 10);
    const g = parseInt(slashMatch[2], 10);
    const b = parseInt(slashMatch[3], 10);
    if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) return null;
    const rawAlpha = slashMatch[4];
    const alpha = rawAlpha.endsWith('%') ? parseFloat(rawAlpha) / 100 : parseFloat(rawAlpha);
    if (isNaN(alpha) || alpha < 0 || alpha > 1) return null;
    const isTransparent = (alpha === 0);
    const isOpaque = (alpha === 1);
    const isSemiTransparent = (alpha > 0 && alpha < 1);
    return {
      isTransparent,
      isOpaque,
      isSemiTransparent,
      alpha,
      r,
      g,
      b,
      raw: colorStr
    };
  }

  // Hex formats #rrggbb
  const hex6Match = s.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (hex6Match) {
    return {
      isTransparent: false,
      isOpaque: true,
      isSemiTransparent: false,
      alpha: 1,
      r: parseInt(hex6Match[1], 16),
      g: parseInt(hex6Match[2], 16),
      b: parseInt(hex6Match[3], 16),
      raw: colorStr
    };
  }

  // Hex formats #rgb
  const hex3Match = s.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (hex3Match) {
    return {
      isTransparent: false,
      isOpaque: true,
      isSemiTransparent: false,
      alpha: 1,
      r: parseInt(hex3Match[1] + hex3Match[1], 16),
      g: parseInt(hex3Match[2] + hex3Match[2], 16),
      b: parseInt(hex3Match[3] + hex3Match[3], 16),
      raw: colorStr
    };
  }

  // Hex formats #rrggbbaa
  const hex8Match = s.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (hex8Match) {
    const alpha = parseInt(hex8Match[4], 16) / 255;
    const isTransparent = (alpha === 0);
    const isOpaque = (alpha === 1);
    const isSemiTransparent = (alpha > 0 && alpha < 1);
    return {
      isTransparent,
      isOpaque,
      isSemiTransparent,
      alpha,
      r: parseInt(hex8Match[1], 16),
      g: parseInt(hex8Match[2], 16),
      b: parseInt(hex8Match[3], 16),
      raw: colorStr
    };
  }

  // Hex formats #rgba
  const hex4Match = s.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (hex4Match) {
    const alpha = parseInt(hex4Match[4] + hex4Match[4], 16) / 255;
    const isTransparent = (alpha === 0);
    const isOpaque = (alpha === 1);
    const isSemiTransparent = (alpha > 0 && alpha < 1);
    return {
      isTransparent,
      isOpaque,
      isSemiTransparent,
      alpha,
      r: parseInt(hex4Match[1] + hex4Match[1], 16),
      g: parseInt(hex4Match[2] + hex4Match[2], 16),
      b: parseInt(hex4Match[3] + hex4Match[3], 16),
      raw: colorStr
    };
  }

  return null;
}

/**
 * Checks if a background-image computed style is non-trivial (image or gradient).
 *
 * @param {string} bgImageStr
 * @returns {boolean}
 */
function hasImageOrGradient(bgImageStr) {
  if (!bgImageStr || typeof bgImageStr !== 'string') return false;
  const s = bgImageStr.trim().toLowerCase();
  return s !== 'none' && s !== 'initial' && s !== 'inherit' && s !== '';
}

/**
 * Resolves canvas background decision for a single viewport canvas object.
 *
 * @param {Object} vpCanvas - vpData.canvas containing { html, body }
 * @returns {{ status: string, color?: string, source?: string, reason?: string, parsedColor?: Object }}
 */
function resolveViewportCanvas(vpCanvas) {
  if (!vpCanvas || typeof vpCanvas !== 'object') {
    return { status: 'INVALID_CAPTURE', reason: 'Missing canvas object in viewport data' };
  }
  const html = vpCanvas.html;
  const body = vpCanvas.body;
  if (!html || typeof html !== 'object') {
    return { status: 'INVALID_CAPTURE', reason: 'Missing canvas.html in viewport data' };
  }
  if (!body || typeof body !== 'object') {
    return { status: 'INVALID_CAPTURE', reason: 'Missing canvas.body in viewport data' };
  }

  const htmlBg = html.backgroundColor;
  const bodyBg = body.backgroundColor;
  if (typeof htmlBg !== 'string' || htmlBg.trim() === '') {
    return { status: 'INVALID_CAPTURE', reason: 'Missing or empty backgroundColor on canvas.html' };
  }
  if (typeof bodyBg !== 'string' || bodyBg.trim() === '') {
    return { status: 'INVALID_CAPTURE', reason: 'Missing or empty backgroundColor on canvas.body' };
  }

  const htmlImg = html.backgroundImage;
  const bodyImg = body.backgroundImage;
  if (typeof htmlImg !== 'string' || htmlImg.trim() === '') {
    return { status: 'INVALID_CAPTURE', reason: 'Missing or empty backgroundImage on canvas.html' };
  }
  if (typeof bodyImg !== 'string' || bodyImg.trim() === '') {
    return { status: 'INVALID_CAPTURE', reason: 'Missing or empty backgroundImage on canvas.body' };
  }

  if (html.opacity === undefined || html.opacity === null || html.opacity === '') {
    return { status: 'INVALID_CAPTURE', reason: 'Missing opacity on canvas.html' };
  }
  if (body.opacity === undefined || body.opacity === null || body.opacity === '') {
    return { status: 'INVALID_CAPTURE', reason: 'Missing opacity on canvas.body' };
  }

  const htmlOpacity = Number(html.opacity);
  const bodyOpacity = Number(body.opacity);
  if (isNaN(htmlOpacity) || htmlOpacity < 0 || htmlOpacity > 1) {
    return { status: 'INVALID_CAPTURE', reason: `Invalid opacity value on canvas.html: "${html.opacity}"` };
  }
  if (isNaN(bodyOpacity) || bodyOpacity < 0 || bodyOpacity > 1) {
    return { status: 'INVALID_CAPTURE', reason: `Invalid opacity value on canvas.body: "${body.opacity}"` };
  }

  // Parse colors
  const htmlColor = parseCssColor(htmlBg);
  const bodyColor = parseCssColor(bodyBg);

  if (!htmlColor) {
    return { status: 'INVALID_CAPTURE', reason: `Unconfirmed or unparseable HTML background color: "${htmlBg}"` };
  }
  if (!bodyColor) {
    return { status: 'INVALID_CAPTURE', reason: `Unconfirmed or unparseable Body background color: "${bodyBg}"` };
  }

  // Check for images or gradients
  if (hasImageOrGradient(htmlImg)) {
    return { status: 'UNSUPPORTED_LAYERED', reason: 'HTML element has background image or gradient' };
  }
  if (hasImageOrGradient(bodyImg)) {
    return { status: 'UNSUPPORTED_LAYERED', reason: 'Body element has background image or gradient' };
  }

  // Check element opacity < 1 (alpha layering)
  if (htmlOpacity < 1 || bodyOpacity < 1) {
    return { status: 'UNSUPPORTED_LAYERED', reason: 'HTML or Body has opacity < 1 (alpha layering)' };
  }

  // Check color alpha layering (semi-transparent)
  if (bodyColor.isSemiTransparent) {
    return { status: 'UNSUPPORTED_LAYERED', reason: 'Body has semi-transparent background (alpha layering)' };
  }
  if (htmlColor.isSemiTransparent) {
    return { status: 'UNSUPPORTED_LAYERED', reason: 'HTML has semi-transparent background (alpha layering)' };
  }

  // Rule 1: Solid opaque body
  if (bodyColor.isOpaque) {
    return { status: 'SOLID_COLOR', color: bodyBg.trim(), source: 'body', parsedColor: bodyColor };
  }

  // Rule 2: Transparent body + solid opaque html
  if (bodyColor.isTransparent && htmlColor.isOpaque) {
    return { status: 'SOLID_COLOR', color: htmlBg.trim(), source: 'html', parsedColor: htmlColor };
  }

  // Rule 3: Both transparent
  if (bodyColor.isTransparent && htmlColor.isTransparent) {
    return { status: 'TRANSPARENT_DEFAULT', color: null, source: 'default', parsedColor: null };
  }

  return { status: 'UNSUPPORTED_LAYERED', reason: 'Complex or unhandled canvas background combination' };
}

/**
 * Resolves the global page canvas decision across all required viewports in gtSnapshot.
 *
 * @param {Object} gtSnapshot
 * @returns {{ status: string, color: string|null, reason?: string, viewports?: Object }}
 */
function resolvePageCanvas(gtSnapshot) {
  if (!gtSnapshot || !gtSnapshot.viewports || typeof gtSnapshot.viewports !== 'object') {
    return { status: 'INVALID_CAPTURE', color: null, reason: 'Missing gtSnapshot.viewports' };
  }

  // Enforce all production viewports
  for (const vp of REQUIRED_VIEWPORTS) {
    if (!gtSnapshot.viewports[vp]) {
      return {
        status: 'INVALID_CAPTURE',
        color: null,
        reason: `Missing required viewport "${vp}" in gtSnapshot.viewports (requires desktop, tablet, and mobile)`
      };
    }
  }

  const perViewport = {};
  for (const vp of REQUIRED_VIEWPORTS) {
    const vpData = gtSnapshot.viewports[vp];
    perViewport[vp] = resolveViewportCanvas(vpData?.canvas);
  }

  // Check for invalid capture or unsupported layered in any viewport
  for (const vp of REQUIRED_VIEWPORTS) {
    const res = perViewport[vp];
    if (res.status === 'INVALID_CAPTURE') {
      return { status: 'INVALID_CAPTURE', color: null, reason: `Viewport "${vp}": ${res.reason}`, viewports: perViewport };
    }
    if (res.status === 'UNSUPPORTED_LAYERED') {
      return { status: 'UNSUPPORTED_LAYERED', color: null, reason: `Viewport "${vp}": ${res.reason}`, viewports: perViewport };
    }
  }

  // Check if all viewports are TRANSPARENT_DEFAULT
  const allTransparent = REQUIRED_VIEWPORTS.every(vp => perViewport[vp].status === 'TRANSPARENT_DEFAULT');
  if (allTransparent) {
    return { status: 'TRANSPARENT_DEFAULT', color: null, viewports: perViewport };
  }

  // Check if all viewports are SOLID_COLOR
  const allSolid = REQUIRED_VIEWPORTS.every(vp => perViewport[vp].status === 'SOLID_COLOR');
  if (allSolid) {
    const firstVp = REQUIRED_VIEWPORTS[0];
    const firstParsed = perViewport[firstVp].parsedColor;

    // Compare parsed color channels and alpha, not whitespace in raw strings
    const allColorsMatch = REQUIRED_VIEWPORTS.every(vp => {
      const p = perViewport[vp].parsedColor;
      return p && firstParsed &&
        p.r === firstParsed.r &&
        p.g === firstParsed.g &&
        p.b === firstParsed.b &&
        Math.abs(p.alpha - firstParsed.alpha) < 0.001;
    });

    if (allColorsMatch) {
      return { status: 'SOLID_COLOR', color: perViewport[firstVp].color, viewports: perViewport };
    }

    return {
      status: 'RESPONSIVE_CANVAS_UNSUPPORTED',
      color: null,
      reason: 'Canvas background color differs across viewports',
      viewports: perViewport
    };
  }

  // Mixed statuses across viewports (e.g. one SOLID_COLOR, another TRANSPARENT_DEFAULT)
  return {
    status: 'RESPONSIVE_CANVAS_UNSUPPORTED',
    color: null,
    reason: 'Canvas background mode differs across viewports',
    viewports: perViewport
  };
}

module.exports = {
  parseCssColor,
  hasImageOrGradient,
  resolveViewportCanvas,
  resolvePageCanvas,
  REQUIRED_VIEWPORTS
};

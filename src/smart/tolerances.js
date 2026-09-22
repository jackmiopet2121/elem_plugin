/**
 * Unified Tolerances Single Source of Truth.
 * Codename: "Single-Pass + Verify" (Phase 0 - T0.1)
 * 
 * Strict numeric and exact matching boundaries for visual parity auditing.
 */

const TOLERANCES = Object.freeze({
  // Colors (hex normalized #RRGGBB)
  COLOR_MATCH: 'EXACT',
  BACKGROUND_COLOR_MATCH: 'EXACT',
  BORDER_COLOR_MATCH: 'EXACT',
  BACKGROUND_IMAGE_MATCH: 'URL_EQUAL',

  // Typography
  FONT_SIZE_PX: 0.5,
  FONT_WEIGHT_MATCH: 'EXACT',
  LINE_HEIGHT_PX: 1.0,
  LETTER_SPACING_PX: 0.5,
  TEXT_ALIGN_MATCH: 'EXACT',
  TEXT_TRANSFORM_MATCH: 'EXACT',

  // Box Model Spacing (per side)
  PADDING_PX: 1.0,
  MARGIN_PX: 1.0,
  BORDER_WIDTH_PX: 0.5,
  BORDER_RADIUS_PX: 1.0,

  // Visual Effects
  BOX_SHADOW_PX: 1.0,
  OPACITY_DELTA: 0.05,

  // Geometry & Spatial Coordinates
  WIDTH_PX: 2.0,
  HEIGHT_PX: 2.0,
  COORD_X_PX: 2.0,
  COORD_Y_PX: 2.0,

  // Text Metrics
  LINE_COUNT_MATCH: 'EXACT',
  LINE_WIDTH_PX: 2.0,

  // Interactive / State Parity (Z2 / Nit N2)
  STATE_VISIBLE_MIN_PX: 15
});

const NAMED_COLORS = Object.freeze({
  transparent: { r: 0, g: 0, b: 0, a: 0 },
  white: { r: 255, g: 255, b: 255, a: 1 },
  black: { r: 0, g: 0, b: 0, a: 1 },
  red: { r: 239, g: 68, b: 68, a: 1 },
  blue: { r: 59, g: 130, b: 246, a: 1 },
  green: { r: 16, g: 185, b: 129, a: 1 },
  gray: { r: 107, g: 114, b: 128, a: 1 },
  grey: { r: 107, g: 114, b: 128, a: 1 }
});

function parseColorParts(str = '') {
  if (!str || typeof str !== 'string') return null;
  const s = str.trim().toLowerCase();

  if (s === 'transparent' || s === 'rgba(0, 0, 0, 0)') {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  if (NAMED_COLORS[s]) {
    return { ...NAMED_COLORS[s] };
  }

  if (s.startsWith('#')) {
    const hex = s.slice(1);
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
        a: 1
      };
    }
    if (hex.length === 4) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
        a: Math.round((parseInt(hex[3] + hex[3], 16) / 255) * 1000) / 1000
      };
    }
    if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: 1
      };
    }
    if (hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: Math.round((parseInt(hex.slice(6, 8), 16) / 255) * 1000) / 1000
      };
    }
    return null;
  }

  const rgbaMatch = s.match(/^rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)(?:[\s,/]+([\d.]+%?))?\s*\)$/i);
  if (rgbaMatch) {
    const parseChannel = (val) => {
      if (val.endsWith('%')) {
        return Math.min(255, Math.max(0, Math.round(parseFloat(val) * 2.55)));
      }
      return Math.min(255, Math.max(0, Math.round(parseFloat(val))));
    };

    const r = parseChannel(rgbaMatch[1]);
    const g = parseChannel(rgbaMatch[2]);
    const b = parseChannel(rgbaMatch[3]);

    let a = 1;
    if (rgbaMatch[4] !== undefined) {
      const aVal = rgbaMatch[4];
      if (aVal.endsWith('%')) {
        a = Math.min(1, Math.max(0, parseFloat(aVal) / 100));
      } else {
        a = Math.min(1, Math.max(0, parseFloat(aVal)));
      }
      a = Math.round(a * 1000) / 1000;
    }

    return { r, g, b, a };
  }

  return null;
}

function isColorEqual(color1 = '', color2 = '') {
  if (!color1 && !color2) return true;
  if (!color1 || !color2) return false;

  const s1 = String(color1).trim().toLowerCase();
  const s2 = String(color2).trim().toLowerCase();
  if (s1 === s2) return true;

  const p1 = parseColorParts(s1);
  const p2 = parseColorParts(s2);

  if (p1 && p2) {
    // Both transparent
    if (p1.a <= 0.001 && p2.a <= 0.001) return true;
    // One transparent, one not
    if ((p1.a <= 0.001) !== (p2.a <= 0.001)) return false;

    // Alpha tolerance (|Δalpha| <= 0.03)
    if (Math.abs(p1.a - p2.a) > 0.03) return false;

    // RGB tolerance (|Δrgb| <= 2)
    return Math.abs(p1.r - p2.r) <= 2 &&
           Math.abs(p1.g - p2.g) <= 2 &&
           Math.abs(p1.b - p2.b) <= 2;
  }

  const n1 = normalizeColor(color1);
  const n2 = normalizeColor(color2);
  if (!n1 && !n2) return true;
  if (!n1 || !n2) return false;
  return n1.toUpperCase() === n2.toUpperCase();
}

function normalizeColor(str = '') {
  if (!str || typeof str !== 'string') return '';
  const s = str.trim().toLowerCase();
  if (s === 'transparent' || s === 'rgba(0, 0, 0, 0)') return 'transparent';

  const parts = parseColorParts(s);
  if (parts) {
    if (parts.a <= 0.001) return 'transparent';
    if (parts.a >= 0.99) {
      const r = parts.r.toString(16).padStart(2, '0');
      const g = parts.g.toString(16).padStart(2, '0');
      const b = parts.b.toString(16).padStart(2, '0');
      return `#${r}${g}${b}`;
    }
    const cleanAlpha = Number(parts.a.toFixed(3));
    return `rgba(${parts.r}, ${parts.g}, ${parts.b}, ${cleanAlpha})`;
  }

  const named = {
    white: '#ffffff', black: '#000000', red: '#ef4444', blue: '#3b82f6',
    green: '#10b981', gray: '#6b7280', grey: '#6b7280'
  };
  return named[s] || s;
}

function isWithinDelta(val1, val2, allowedDelta) {
  const n1 = parseFloat(val1);
  const n2 = parseFloat(val2);
  if (isNaN(n1) && isNaN(n2)) return true;
  if (isNaN(n1) || isNaN(n2)) return false;
  return Math.abs(n1 - n2) <= allowedDelta;
}

module.exports = {
  TOLERANCES,
  parseColorParts,
  isColorEqual,
  normalizeColor,
  isWithinDelta
};

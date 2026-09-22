/**
 * Canonical Elementor Free Schema Mapper.
 * Unified W3C CSS to Elementor setting translator.
 * 
 * Provides a single, deterministic dictionary mapping any computed or resolved CSS
 * declaration into the exact schema keys required by Elementor Free widgets and containers.
 */

const { normalizeColor } = require('../smart/tolerances');

function normalizeColorToHex(colorStr = '') {
  if (!colorStr || typeof colorStr !== 'string') return null;
  const norm = normalizeColor(colorStr);
  if (!norm || norm === 'transparent') return null;
  return norm.startsWith('#') ? norm.toUpperCase() : norm;
}

function parsePixelValue(val) {
  if (typeof val === 'number') return val;
  if (!val || typeof val !== 'string') return 0;
  const num = parseFloat(val);
  if (val.includes('rem')) return Math.round(num * 16);
  if (val.includes('em')) return Math.round(num * 16);
  return isNaN(num) ? 0 : Math.round(num);
}

function parseBoxModel(val) {
  if (!val) return { top: 0, right: 0, bottom: 0, left: 0, isLinked: true };
  if (typeof val === 'number') {
    return { top: val, right: val, bottom: val, left: val, isLinked: true };
  }
  const parts = String(val).trim().split(/\s+/).map(parsePixelValue);
  if (parts.length === 1) {
    return { top: parts[0], right: parts[0], bottom: parts[0], left: parts[0], isLinked: true };
  }
  if (parts.length === 2) {
    return { top: parts[0], right: parts[1], bottom: parts[0], left: parts[1], isLinked: false };
  }
  if (parts.length === 3) {
    return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[1], isLinked: false };
  }
  return { top: parts[0] || 0, right: parts[1] || 0, bottom: parts[2] || 0, left: parts[3] || 0, isLinked: false };
}

function formatElementorBox(val, unit = 'px') {
  const box = parseBoxModel(val);
  return {
    unit,
    top: String(box.top),
    right: String(box.right),
    bottom: String(box.bottom),
    left: String(box.left),
    isLinked: Boolean(box.isLinked || (box.top === box.right && box.right === box.bottom && box.bottom === box.left))
  };
}

function parseBoxShadow(shadowStr = '') {
  if (!shadowStr || typeof shadowStr !== 'string' || shadowStr === 'none') return null;
  const match = shadowStr.match(/(rgba?\([^)]+\)|#[a-fA-F0-9]{3,8}|[a-zA-Z]+)?\s*(-?\d+px)?\s*(-?\d+px)?\s*(-?\d+px)?\s*(-?\d+px)?/i);
  if (!match) return null;

  const color = normalizeColorToHex(match[1] || 'rgba(0,0,0,0.1)') || 'rgba(0,0,0,0.1)';
  const horizontal = parseInt(match[2] || '0', 10);
  const vertical = parseInt(match[3] || '4', 10);
  const blur = parseInt(match[4] || '8', 10);
  const spread = parseInt(match[5] || '0', 10);

  return {
    horizontal,
    vertical,
    blur,
    spread,
    color,
    position: 'outline'
  };
}

/**
 * Maps a single CSS declaration into Elementor settings.
 * @param {string} prop - CSS property name (camelCase or kebab-case)
 * @param {*} value - CSS property value
 * @param {string} targetType - 'container' | 'heading' | 'button' | 'text-editor' | 'image' | 'icon'
 * @param {Object} [meta={}] - Additional context (e.g. isBlock, display)
 * @returns {Object} Key-value pairs for Elementor settings
 */
function translateCssToElementor(prop, value, targetType = 'heading', meta = {}) {
  const settings = {};
  if (value === undefined || value === null || value === '') return settings;

  const normProp = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

  switch (normProp) {
    case 'color': {
      const hex = normalizeColorToHex(value);
      if (!hex) break;
      if (targetType === 'heading') settings.title_color = hex;
      else if (targetType === 'button') settings.button_text_color = hex;
      else if (targetType === 'text-editor') settings.text_color = hex;
      else if (targetType === 'icon') settings.primary_color = hex;
      else if (targetType === 'container') settings._color = hex;
      break;
    }

    case 'backgroundColor':
    case 'background': {
      const hex = normalizeColorToHex(value);
      if (!hex) break;
      if (targetType === 'button') {
        settings.background_color = hex;
      } else if (targetType === 'container') {
        settings.background_background = 'classic';
        settings.background_color = hex;
      } else {
        // Heading / Text / Image / Icon in Advanced tab
        settings.background_background = 'classic';
        settings.background_color = hex;
      }
      break;
    }

    case 'borderRadius': {
      const px = parsePixelValue(value);
      if (px <= 0) break;
      const box = formatElementorBox(value);
      if (targetType === 'button' || targetType === 'container') {
        settings.border_radius = box;
      } else {
        // Micro-component pills/tags on heading/text
        settings.border_radius = box;
      }
      break;
    }

    case 'borderColor': {
      const hex = normalizeColorToHex(value);
      if (hex) settings.border_color = hex;
      break;
    }

    case 'borderWidth': {
      const px = parsePixelValue(value);
      if (px > 0) {
        settings.border_border = meta.borderStyle || 'solid';
        settings.border_width = formatElementorBox(value);
      }
      break;
    }

    case 'padding': {
      const box = formatElementorBox(value);
      if (targetType === 'container') {
        settings.padding = box;
      } else if (targetType === 'button') {
        settings.button_padding = box;
        settings._padding = box;
      } else {
        settings._padding = box;
      }
      break;
    }

    case 'margin': {
      const box = formatElementorBox(value);
      if (targetType === 'container') {
        settings.margin = box;
      } else {
        settings._margin = box;
      }
      break;
    }

    case 'textAlign': {
      const align = String(value).toLowerCase();
      if (['left', 'center', 'right', 'justify'].includes(align)) {
        if (targetType === 'heading' || targetType === 'button' || targetType === 'text-editor') {
          settings.align = align;
        }
      }
      break;
    }

    case 'fontSize': {
      const px = parsePixelValue(value);
      if (px >= 8) {
        settings.typography_typography = 'custom';
        settings.typography_font_size = { unit: 'px', size: px };
      }
      break;
    }

    case 'fontWeight': {
      const wStr = String(value).trim();
      if (wStr && wStr !== 'normal' && wStr !== 'initial') {
        settings.typography_typography = 'custom';
        settings.typography_font_weight = wStr === 'bold' ? '700' : wStr;
      }
      break;
    }

    case 'letterSpacing': {
      const px = parseFloat(value);
      if (!isNaN(px) && Math.abs(px) >= 0.2) {
        settings.typography_typography = 'custom';
        settings.typography_letter_spacing = { unit: 'px', size: Math.round(px * 10) / 10 };
      }
      break;
    }

    case 'lineHeight': {
      const lh = parseFloat(value);
      if (!isNaN(lh) && lh > 0) {
        settings.typography_typography = 'custom';
        if (String(value).includes('px')) {
          settings.typography_line_height = { unit: 'px', size: Math.round(lh) };
        } else {
          settings.typography_line_height = { unit: 'em', size: Math.round(lh * 10) / 10 };
        }
      }
      break;
    }

    case 'boxShadow': {
      const shadow = parseBoxShadow(value);
      if (shadow) {
        if (targetType === 'container') {
          settings.box_shadow_box_shadow = shadow;
        } else {
          settings._box_shadow_box_shadow = shadow;
        }
      }
      break;
    }

    case 'height': {
      // Fluid Container Protocol: Never lock containers to fixed heights that trap content!
      if (targetType === 'container') {
        const px = parsePixelValue(value);
        if (px >= 100 && !meta.hasVerticalChildren) {
          settings.min_height = { unit: 'px', size: px };
        }
      }
      break;
    }

    case 'width': {
      if (targetType === 'button') {
        if (value === '100%' || meta.isBlock) {
          settings.align = 'justify';
          settings._element_width = 'initial';
        }
      }
      break;
    }

    default:
      break;
  }

  return settings;
}

/**
 * Applies a batch of computed or resolved styles to target Elementor settings.
 */
function applyCanonicalStyles(targetSettings = {}, styles = {}, targetType = 'heading', meta = {}) {
  for (const [prop, val] of Object.entries(styles)) {
    const translated = translateCssToElementor(prop, val, targetType, meta);
    Object.assign(targetSettings, translated);
  }
  return targetSettings;
}

module.exports = {
  translateCssToElementor,
  applyCanonicalStyles,
  normalizeColorToHex,
  parsePixelValue,
  parseBoxModel,
  formatElementorBox,
  parseBoxShadow
};

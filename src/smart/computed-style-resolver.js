/**
 * Full Computed-Style Bridge & Resolver.
 * Codename: "Single-Pass + Verify" (Block 8.2 - Phase 2)
 *
 * Directly resolves Chromium exhaustive computed styles from styleDictionary,
 * preventing lossy normalization, alpha stripping, or reliance on legacy projections.
 */

/**
 * Checks if a CSS color string represents a 100% transparent color.
 * Recognizes 'transparent', computed 'rgba(..., 0)', 'rgb(... / 0)', and zero-alpha hex formats.
 * Alpha values >= 0.01 are strictly non-transparent.
 *
 * @param {string} value - CSS color string
 * @returns {boolean}
 */
function isFullyTransparentColor(value) {
  if (!value || typeof value !== 'string') return false;
  const s = value.trim().toLowerCase();
  if (s === 'transparent') return true;

  // rgba(r, g, b, a)
  const rgbaMatch = s.match(/^rgba\s*\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)$/);
  if (rgbaMatch) {
    const alpha = parseFloat(rgbaMatch[1]);
    return !isNaN(alpha) && alpha === 0;
  }

  // Modern CSS rgb(r g b / a) / rgba(r g b / a)
  const slashMatch = s.match(/^rgb(?:a)?\s*\(\s*[\d.]+\s+[\d.]+\s+[\d.]+\s*\/\s*([\d.]+%?)\s*\)$/);
  if (slashMatch) {
    const rawAlpha = slashMatch[1];
    const alpha = rawAlpha.endsWith('%') ? parseFloat(rawAlpha) / 100 : parseFloat(rawAlpha);
    return !isNaN(alpha) && alpha === 0;
  }

  // 8-digit hex #rrggbbaa (alpha 00) or 4-digit hex #rgba (alpha 0)
  if (/^#[0-9a-f]{6}00$/i.test(s) || /^#[0-9a-f]{3}0$/i.test(s)) {
    return true;
  }

  return false;
}

/**
 * Checks whether the snapshot contains any styleDictionary definitions across any viewport.
 * @param {Object} snapshot - Ground-truth snapshot
 * @returns {boolean}
 */
function hasAnyStyleDictionary(snapshot) {
  if (!snapshot) return false;
  if (snapshot.styleDictionary !== undefined) return true;
  if (snapshot.viewports && typeof snapshot.viewports === 'object') {
    for (const vpKey of Object.keys(snapshot.viewports)) {
      const vpObj = snapshot.viewports[vpKey];
      if (vpObj && typeof vpObj === 'object' && vpObj.styleDictionary !== undefined) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Resolves a raw CSS property from the snapshot's styleDictionary.
 * Throws explicit errors when a styleDictionary is present:
 * - FULL_STYLE_VIEWPORT_MISSING if the requested viewport dictionary is missing
 * - FULL_STYLE_REF_MISSING if the node's computedStyleRef is invalid/missing (including styleDictionary: {})
 * - FULL_STYLE_PROPERTY_MISSING if the property is missing from the dictionary entry
 *
 * Falls back to gt.styles ONLY for legacy snapshots that have NO styleDictionary property anywhere.
 *
 * @param {Object} gt - Ground truth node record
 * @param {Object} snapshot - Ground truth snapshot containing styleDictionary
 * @param {string} viewport - 'desktop' | 'tablet' | 'mobile'
 * @param {string} cssProperty - Exact kebab-case CSS property (e.g. 'background-color', 'color')
 * @param {string} legacyKey - Legacy camelCase key on gt.styles (e.g. 'backgroundColor', 'color')
 * @returns {string} Raw Chromium computed style string
 */
function readComputedCssProperty(gt, snapshot, viewport = 'desktop', cssProperty, legacyKey) {
  const sid = gt?.sid || 'unknown';
  const vp = viewport || 'desktop';

  const hasModernDict = hasAnyStyleDictionary(snapshot);

  if (hasModernDict) {
    let styleDict = null;

    if (snapshot.viewports && typeof snapshot.viewports === 'object') {
      const vpData = snapshot.viewports[vp];
      if (!vpData || vpData.styleDictionary === undefined) {
        const err = new Error(`[FULL_STYLE_VIEWPORT_MISSING] Style dictionary missing for viewport "${vp}" on SID "${sid}" (property: "${cssProperty}")`);
        err.code = 'FULL_STYLE_VIEWPORT_MISSING';
        err.reason = 'FULL_STYLE_VIEWPORT_MISSING';
        err.sid = sid;
        err.viewport = vp;
        err.property = cssProperty;
        throw err;
      }
      styleDict = vpData.styleDictionary;
    } else if (snapshot.styleDictionary !== undefined) {
      styleDict = snapshot.styleDictionary;
    }

    if (!styleDict || typeof styleDict !== 'object') {
      const err = new Error(`[FULL_STYLE_REF_MISSING] Style dictionary is invalid or missing for SID "${sid}" at viewport "${vp}" (property: "${cssProperty}")`);
      err.code = 'FULL_STYLE_REF_MISSING';
      err.reason = 'FULL_STYLE_REF_MISSING';
      err.sid = sid;
      err.viewport = vp;
      err.property = cssProperty;
      throw err;
    }

    const ref = gt?.computedStyleRef;
    if (!ref || !styleDict[ref]) {
      const err = new Error(`[FULL_STYLE_REF_MISSING] Node reference "${ref}" missing or not found in styleDictionary for SID "${sid}" at viewport "${vp}" (property: "${cssProperty}")`);
      err.code = 'FULL_STYLE_REF_MISSING';
      err.reason = 'FULL_STYLE_REF_MISSING';
      err.sid = sid;
      err.viewport = vp;
      err.property = cssProperty;
      throw err;
    }

    const styleObj = styleDict[ref];
    if (styleObj[cssProperty] === undefined) {
      const err = new Error(`[FULL_STYLE_PROPERTY_MISSING] Property "${cssProperty}" missing in styleDictionary for SID "${sid}" at viewport "${vp}" (ref: "${ref}")`);
      err.code = 'FULL_STYLE_PROPERTY_MISSING';
      err.reason = 'FULL_STYLE_PROPERTY_MISSING';
      err.sid = sid;
      err.viewport = vp;
      err.property = cssProperty;
      throw err;
    }

    // Return raw Chromium string without normalization, hex conversion, or rounding
    return styleObj[cssProperty];
  }

  // Legacy synthetic snapshot fallback (only when NO styleDictionary exists anywhere in snapshot)
  if (gt && gt.styles) {
    if (legacyKey && gt.styles[legacyKey] !== undefined) {
      return gt.styles[legacyKey];
    }
    if (cssProperty && gt.styles[cssProperty] !== undefined) {
      return gt.styles[cssProperty];
    }
  }

  return '';
}

module.exports = {
  isFullyTransparentColor,
  hasAnyStyleDictionary,
  readComputedCssProperty
};

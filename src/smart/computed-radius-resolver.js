/**
 * Computed Border-Radius Resolver & Router.
 * Codename: "Single-Pass + Verify" (Block 8.2 - Phase 3)
 *
 * Resolves exact border-radius longhands from Chromium computed styles:
 * - Evaluates top-left, top-right, bottom-right, bottom-left.
 * - Routes clean uniform/asymmetric single-unit radius to Elementor native setting.
 * - Routes mixed-unit and elliptical radii to scoped CSS atomic fallback.
 * - Rejects unsafe CSS syntax with explicit RADIUS_VALUE_UNSAFE.
 */

const { readComputedCssProperty, hasAnyStyleDictionary } = require('./computed-style-resolver');

/**
 * Resolves computed border-radius for an AST/GT element.
 *
 * @param {Object} gt - Ground truth node record
 * @param {Object} snapshot - Ground truth snapshot containing styleDictionary
 * @param {string} viewport - 'desktop' | 'tablet' | 'mobile'
 * @returns {{ mode: 'none' } | { mode: 'native', setting: Object } | { mode: 'css', corners: Object }}
 */
function resolveComputedRadius(gt, snapshot, viewport = 'desktop') {
  const cornerDefs = [
    { key: 'topLeft', css: 'border-top-left-radius', legacy: 'borderTopLeftRadius' },
    { key: 'topRight', css: 'border-top-right-radius', legacy: 'borderTopRightRadius' },
    { key: 'bottomRight', css: 'border-bottom-right-radius', legacy: 'borderBottomRightRadius' },
    { key: 'bottomLeft', css: 'border-bottom-left-radius', legacy: 'borderBottomLeftRadius' }
  ];

  const isModern = hasAnyStyleDictionary(snapshot);
  const sid = gt?.sid || 'unknown';
  const vp = viewport || 'desktop';
  const rawCorners = {};

  for (const { key, css, legacy } of cornerDefs) {
    const rawVal = readComputedCssProperty(gt, snapshot, vp, css, legacy);
    if (isModern && (rawVal === null || rawVal === undefined || (typeof rawVal === 'string' && rawVal.trim() === ''))) {
      const err = new Error(`[RADIUS_VALUE_INVALID] Empty corner property "${css}" in styleDictionary for SID "${sid}" at viewport "${vp}"`);
      err.code = 'RADIUS_VALUE_INVALID';
      err.reason = 'RADIUS_VALUE_INVALID';
      err.sid = sid;
      err.viewport = vp;
      err.property = css;
      throw err;
    }
    if (typeof rawVal === 'string' && /[;{}]/.test(rawVal)) {
      const err = new Error(`[RADIUS_VALUE_UNSAFE] Unsafe characters detected in ${css}: "${rawVal}" on SID "${sid}"`);
      err.code = 'RADIUS_VALUE_UNSAFE';
      err.reason = 'RADIUS_VALUE_UNSAFE';
      err.sid = sid;
      err.viewport = vp;
      err.property = css;
      err.value = rawVal;
      throw err;
    }
    rawCorners[key] = rawVal;
  }

  // Parse each corner
  const parsed = {};
  let allZero = true;

  for (const [cornerKey, rawVal] of Object.entries(rawCorners)) {
    const trimmed = (rawVal || '').trim();
    if (!trimmed) {
      parsed[cornerKey] = { isZero: true, isSingle: true, num: 0, unit: 'px', raw: '0px' };
      continue;
    }

    // Check for elliptical values (two space-separated values)
    const parts = trimmed.split(/\s+/);
    if (parts.length > 1) {
      const partsZero = parts.every(p => parseFloat(p) === 0);
      if (!partsZero) {
        allZero = false;
      }
      parsed[cornerKey] = {
        isZero: partsZero,
        isSingle: false,
        raw: trimmed
      };
      continue;
    }

    // Single value: match number + unit (px or %)
    const match = trimmed.match(/^(\d+(?:\.\d+)?)(px|%)?$/i);
    if (match) {
      const num = parseFloat(match[1]);
      const unit = (match[2] || 'px').toLowerCase();
      const isZero = (num === 0);
      if (!isZero) allZero = false;
      parsed[cornerKey] = {
        isZero,
        isSingle: true,
        num,
        unit,
        raw: trimmed
      };
    } else {
      const num = parseFloat(trimmed);
      const isZero = (num === 0);
      if (!isZero) allZero = false;
      parsed[cornerKey] = {
        isZero,
        isSingle: false,
        raw: trimmed
      };
    }
  }

  // Rule 2: If all corners are zero, return mode: 'none'
  if (allZero) {
    return { mode: 'none' };
  }

  // Rule 3: Single non-negative number in px or %, with all non-zero corners sharing the same unit
  const allSingle = Object.values(parsed).every(p => p.isSingle);
  if (allSingle) {
    const nonZeroUnits = Object.values(parsed).filter(p => !p.isZero).map(p => p.unit);
    const primaryUnit = nonZeroUnits[0] || 'px';
    const sameUnit = Object.values(parsed).every(p => p.isZero || p.unit === primaryUnit);

    if (sameUnit && (primaryUnit === 'px' || primaryUnit === '%')) {
      const top = String(parsed.topLeft.num);
      const right = String(parsed.topRight.num);
      const bottom = String(parsed.bottomRight.num);
      const left = String(parsed.bottomLeft.num);
      const isLinked = Boolean(top === right && right === bottom && bottom === left);

      return {
        mode: 'native',
        setting: {
          unit: primaryUnit,
          top,
          right,
          bottom,
          left,
          isLinked
        }
      };
    }
  }

  // Rule 4: Mixed units or elliptical corners -> mode: 'css'
  return {
    mode: 'css',
    corners: {
      topLeft: rawCorners.topLeft || '0px',
      topRight: rawCorners.topRight || '0px',
      bottomRight: rawCorners.bottomRight || '0px',
      bottomLeft: rawCorners.bottomLeft || '0px'
    }
  };
}

module.exports = {
  resolveComputedRadius
};

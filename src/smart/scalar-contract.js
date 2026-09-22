/**
 * Scalar Contract (Spec v3.4 + Addendum v3.4.1):
 * Guarantees Elementor PHP never receives an Object in a scalar slot.
 * 
 * - validateTemplate(json) -> violations[]  (read-only audit)
 * - enforceScalarContract(el)               (in-place auto-fix, deep unwrap)
 * - deepUnwrap(v, preferKey)                (recursive unwrap helper)
 */

const SUFFIX_RE = /_(tablet|mobile)$/;
const baseKey = (k) => k.replace(SUFFIX_RE, '');

const STRING_KEYS = new Set([
  'title', 'editor', 'html', 'header_size', 'align', 'css_classes', '_css_classes', '_element_id',
  'background_color', 'title_color', 'button_text_color', 'text_color', 'border_color',
  'primary_color', 'secondary_color', 'background_background', 'border_border',
  '_element_width', '_flex_size'
]);

const NUMBER_KEYS = new Set([
  'space_between_widgets'
]);

const DIM_KEYS = new Set([
  'padding', '_padding', 'margin', '_margin', 'border_width', 'border_radius', 'button_padding'
]);

const SIZE_OBJ_KEYS = new Set([
  'width', 'min_height', 'max_height', 'typography_font_size', 'typography_line_height',
  'typography_letter_spacing'
]);

const SHADOW_KEYS = new Set([
  'box_shadow_box_shadow', '_box_shadow_box_shadow'
]);

const GAP_KEYS = new Set([
  'gap', 'flex_gap'
]);

const isScalar = (v) => typeof v === 'string' || typeof v === 'number';

function deepUnwrap(v, preferKey) {
  let x = v;
  let guard = 0;
  while (x && typeof x === 'object' && guard++ < 5) {
    x = (preferKey && x[preferKey] !== undefined)
      ? x[preferKey]
      : (x.url ?? x.link ?? x.size ?? x.value ?? x.top ?? x.column ?? x.row ?? Object.values(x)[0]);
  }
  return x;
}

function enforceScalarContract(el) {
  if (!el || typeof el !== 'object') return 0;
  const s = el.settings || {};
  let fixed = 0;

  for (const k of Object.keys(s)) {
    const base = baseKey(k);

    if (STRING_KEYS.has(base)) {
      if (typeof s[k] !== 'string') {
        s[k] = String(deepUnwrap(s[k]) ?? '');
        fixed++;
      }
    } else if (NUMBER_KEYS.has(base)) {
      if (typeof s[k] !== 'number' || !Number.isFinite(s[k])) {
        const n = Number(deepUnwrap(s[k]));
        s[k] = Number.isFinite(n) ? n : 0;
        fixed++;
      }
    } else if (DIM_KEYS.has(base) && s[k] && typeof s[k] === 'object') {
      for (const side of ['top', 'right', 'bottom', 'left']) {
        if (s[k][side] !== undefined && !isScalar(s[k][side])) {
          s[k][side] = String(deepUnwrap(s[k][side]) ?? '0');
          fixed++;
        }
      }
    } else if (SIZE_OBJ_KEYS.has(base) && s[k] && typeof s[k] === 'object') {
      if (s[k].unit !== undefined && typeof s[k].unit !== 'string') {
        s[k].unit = String(s[k].unit);
        fixed++;
      }
      if (s[k].size !== undefined && !isScalar(s[k].size)) {
        const u = deepUnwrap(s[k], 'size');
        s[k].size = isScalar(u) ? u : String(u ?? 0);
        fixed++;
      }
    } else if (SHADOW_KEYS.has(base) && s[k] && typeof s[k] === 'object') {
      for (const c of ['horizontal', 'vertical', 'blur', 'spread']) {
        if (s[k][c] !== undefined && (typeof s[k][c] !== 'number' || !Number.isFinite(s[k][c]))) {
          const n = Number(deepUnwrap(s[k][c]));
          s[k][c] = Number.isFinite(n) ? n : 0;
          fixed++;
        }
      }
      if (s[k].color !== undefined && typeof s[k].color !== 'string') {
        s[k].color = String(deepUnwrap(s[k].color) ?? '');
        fixed++;
      }
    } else if (GAP_KEYS.has(base) && s[k] && typeof s[k] === 'object') {
      for (const c of ['column', 'row', 'size']) {
        if (s[k][c] !== undefined && (typeof s[k][c] !== 'number' || !Number.isFinite(s[k][c]))) {
          const n = Number(deepUnwrap(s[k][c]));
          s[k][c] = Number.isFinite(n) ? n : 0;
          fixed++;
        }
      }
    }
  }

  // Generalized link check (any widget with settings.link: button, image, icon, etc.)
  if (s.link !== undefined) {
    if (typeof s.link === 'string') {
      s.link = { url: s.link, is_external: false, nofollow: false };
      fixed++;
    } else if (s.link && typeof s.link === 'object') {
      if (typeof s.link.url !== 'string') {
        s.link.url = String(deepUnwrap(s.link.url, 'url') ?? '#');
        fixed++;
      }
      s.link.is_external = Boolean(s.link.is_external);
      s.link.nofollow = Boolean(s.link.nofollow);
    }
  }

  // Image media URL check
  if (s.image && typeof s.image === 'object') {
    if (s.image.url !== undefined && typeof s.image.url !== 'string') {
      s.image.url = String(deepUnwrap(s.image.url, 'url') ?? '');
      fixed++;
    }
  }

  // Icon value check
  if (s.selected_icon && typeof s.selected_icon === 'object') {
    if (s.selected_icon.value !== undefined && typeof s.selected_icon.value !== 'string') {
      s.selected_icon.value = String(deepUnwrap(s.selected_icon.value, 'value') ?? '');
      fixed++;
    }
  }

  (el.elements || []).forEach(c => {
    fixed += enforceScalarContract(c);
  });
  return fixed;
}

function validateTemplate(json) {
  const violations = [];

  function walk(el, path) {
    if (!el || typeof el !== 'object') return;
    const s = el.settings || {};
    const p = `${path}/${el.id || el.widgetType || el.elType || '?'}`;

    for (const k of Object.keys(s)) {
      const base = baseKey(k);

      if (STRING_KEYS.has(base)) {
        if (typeof s[k] !== 'string') {
          violations.push(`${p}: ${k} must be string, got ${typeof s[k]}`);
        }
      } else if (NUMBER_KEYS.has(base)) {
        if (typeof s[k] !== 'number' || !Number.isFinite(s[k])) {
          violations.push(`${p}: ${k} must be finite number, got ${typeof s[k]}`);
        }
      } else if (DIM_KEYS.has(base) && s[k] && typeof s[k] === 'object') {
        for (const side of ['top', 'right', 'bottom', 'left']) {
          if (s[k][side] !== undefined && !isScalar(s[k][side])) {
            violations.push(`${p}: ${k}.${side} must be scalar, got ${typeof s[k][side]}`);
          }
        }
      } else if (SIZE_OBJ_KEYS.has(base) && s[k] && typeof s[k] === 'object') {
        if (s[k].unit !== undefined && typeof s[k].unit !== 'string') {
          violations.push(`${p}: ${k}.unit must be string, got ${typeof s[k].unit}`);
        }
        if (s[k].size !== undefined && !isScalar(s[k].size)) {
          violations.push(`${p}: ${k}.size must be scalar, got ${typeof s[k].size}`);
        }
      } else if (SHADOW_KEYS.has(base) && s[k] && typeof s[k] === 'object') {
        for (const c of ['horizontal', 'vertical', 'blur', 'spread']) {
          if (s[k][c] !== undefined && (typeof s[k][c] !== 'number' || !Number.isFinite(s[k][c]))) {
            violations.push(`${p}: ${k}.${c} must be finite number, got ${typeof s[k][c]}`);
          }
        }
        if (s[k].color !== undefined && typeof s[k].color !== 'string') {
          violations.push(`${p}: ${k}.color must be string, got ${typeof s[k].color}`);
        }
      } else if (GAP_KEYS.has(base) && s[k] && typeof s[k] === 'object') {
        for (const c of ['column', 'row', 'size']) {
          if (s[k][c] !== undefined && (typeof s[k][c] !== 'number' || !Number.isFinite(s[k][c]))) {
            violations.push(`${p}: ${k}.${c} must be finite number, got ${typeof s[k][c]}`);
          }
        }
      }
    }

    // Generalized link check
    if (s.link !== undefined && (typeof s.link !== 'object' || typeof s.link.url !== 'string')) {
      violations.push(`${p}: settings.link.url must be string (widgetType=${el.widgetType})`);
    }

    // Image media URL check
    if (s.image && typeof s.image === 'object' && s.image.url !== undefined && typeof s.image.url !== 'string') {
      violations.push(`${p}: settings.image.url must be string (widgetType=${el.widgetType})`);
    }

    // Icon value check
    if (s.selected_icon && typeof s.selected_icon === 'object' && s.selected_icon.value !== undefined && typeof s.selected_icon.value !== 'string') {
      violations.push(`${p}: settings.selected_icon.value must be string (widgetType=${el.widgetType})`);
    }

    (el.elements || []).forEach((c, i) => walk(c, `${p}[${i}]`));
  }

  const content = json && Array.isArray(json.content) ? json.content : (Array.isArray(json) ? json : (json?.elements || []));
  (content || []).forEach((c, i) => walk(c, `root[${i}]`));
  return violations;
}

module.exports = {
  enforceScalarContract,
  validateTemplate,
  deepUnwrap,
  baseKey
};

/**
 * @deprecated Legacy v0.4 Fallback Normalizer.
 * In V2, Single-Pass Geometric Mapping (src/smart/geometry-mapper.js) natively preserves geometry.
 * Retained strictly as fallback for offline/legacy AST pipeline.
 */
/**
 * Elementor Schema Invariant Normalizer.
 * Enforces 100% compliance with Elementor Free template JSON schema.
 * 
 * Rules:
 * 1. Any node with 'widgetType' MUST have 'elType: "widget"' and 'elements: []'.
 * 2. Any node without 'widgetType' MUST have 'elType: "container"' and an 'elements' array.
 * 3. Containers must have 'isInner: false' if root, 'isInner: true' if nested.
 * 4. Every node must have a valid 'settings' object and unique 'id'.
 */
const { generateId } = require('../core/id-generator');
const { unwrapGapNumber } = require('../smart/style-router');
const { enforceScalarContract } = require('../smart/scalar-contract');

function normalizeElementorSchema(contentElements) {
  if (!Array.isArray(contentElements)) return;

  const seenIds = new Set();

  function scanAndNormalize(node, parent = null) {
    if (!node || typeof node !== 'object') return;

    // 1. Ensure unique valid ID
    if (!node.id || typeof node.id !== 'string' || seenIds.has(node.id)) {
      node.id = generateId();
    }
    seenIds.add(node.id);

    // 2. Ensure settings object exists
    if (!node.settings || typeof node.settings !== 'object' || Array.isArray(node.settings)) {
      node.settings = {};
    }
    const s = node.settings;

    // 3. Invariant: Widget vs Container
    if (node.widgetType) {
      // It is definitely a widget
      node.elType = 'widget';
      if (!Array.isArray(node.elements)) {
        node.elements = [];
      }
      if (node.isInner === undefined) {
        node.isInner = false;
      }

      // Icon widget schema parity: Ensure both modern selected_icon and legacy icon exist
      if (node.widgetType === 'icon') {
        if (s.icon && !s.selected_icon) {
          s.selected_icon = typeof s.icon === 'object' ? { ...s.icon } : { value: String(s.icon), library: 'fa-solid' };
        } else if (s.selected_icon && !s.icon) {
          s.icon = typeof s.selected_icon === 'object' ? { ...s.selected_icon } : { value: String(s.selected_icon), library: 'fa-solid' };
        }
        if (s.selected_icon && typeof s.selected_icon === 'object' && !s.selected_icon.library) {
          s.selected_icon.library = 'fa-solid';
        }
        const iconVal = (s.selected_icon?.value || s.icon?.value || '');
        if (iconVal.includes('fa-shield-halved') || iconVal.includes('fa-shield')) {
          if (s.selected_icon) s.selected_icon.value = 'fas fa-shield-alt';
          if (s.icon) s.icon.value = 'fas fa-shield-alt';
        } else if (iconVal.includes('fa-xmark')) {
          if (s.selected_icon) s.selected_icon.value = 'fas fa-times';
          if (s.icon) s.icon.value = 'fas fa-times';
        }

        // Universal Font Glyph Class Sanitizer:
        // Elementor Icon widgets render icons internally via selected_icon.
        // Font glyph classes (fa-*, fas, etc.) must NEVER be present on the widget wrapper's _css_classes,
        // otherwise FontAwesome applies ::before on the outer div, creating duplicate/stacked ghost icons!
        const rawClasses = (s.css_classes || s._css_classes || '');
        if (rawClasses) {
          const sanitizedClasses = rawClasses
            .split(/\s+/)
            .filter(c => !/^fa(?:$|-|s$|r$|b$|l$|d$|t$)/i.test(c) && !/^-/i.test(c))
            .join(' ')
            .trim();
          s.css_classes = sanitizedClasses;
          s._css_classes = sanitizedClasses;
        }
      }
    } else {
      // It is a container
      node.elType = 'container';
      node.isInner = (parent !== null);
      if (!Array.isArray(node.elements)) {
        node.elements = [];
      }

      // A1: content_width CONTRACT
      // Only root container may be 'boxed'; EVERY inner container must be 'full' to prevent WordPress 1-column collapse
      if (node.isInner) {
        s.content_width = 'full';
      } else if (!s.content_width) {
        s.content_width = 'boxed';
      }

      // A3: PERCENT-ONLY CHILD WIDTHS: child containers in row/grid -> width '%' at ALL viewports (mobile 100). Never px.
      if (node.isInner) {
        for (const [wKey, vp] of [['width', 'desktop'], ['width_tablet', 'tablet'], ['width_mobile', 'mobile']]) {
          if (s[wKey] && s[wKey].unit === 'px') {
            if (vp === 'mobile') {
              s[wKey] = { unit: '%', size: 100 };
            } else if (s[wKey].size <= 60) {
              s[wKey] = { unit: 'custom', size: 'fit-content' };
              s._flex_size = 'none';
              s.flex_shrink = 0;
            } else {
              const vpW = vp === 'tablet' ? 768 : 1200;
              const pct = Math.min(100, Math.round((s[wKey].size / vpW) * 100 * 10) / 10);
              s[wKey] = { unit: '%', size: pct };
            }
          }
        }
      }

      // Enforce scalar numbers for gap / space_between_widgets to prevent PHP 8 fatal
      for (const k of ['space_between_widgets', 'space_between_widgets_tablet', 'space_between_widgets_mobile']) {
        if (s[k] !== undefined) s[k] = unwrapGapNumber(s[k]);
      }
      for (const k of ['gap', 'flex_gap', 'gap_tablet', 'flex_gap_tablet', 'gap_mobile', 'flex_gap_mobile']) {
        if (s[k] && typeof s[k] === 'object') {
          if (s[k].size !== undefined) s[k].size = unwrapGapNumber(s[k].size);
          if (s[k].column !== undefined) s[k].column = unwrapGapNumber(s[k].column);
          if (s[k].row !== undefined) s[k].row = unwrapGapNumber(s[k].row);
        }
      }
    }

    // 4. Box Model 4-Direction Shorthand Expansion (Universal AI & AST Sanitization)
    if (s.border_radius && s.border_radius.size !== undefined && s.border_radius.top === undefined) {
      const rad = String(s.border_radius.size);
      s.border_radius = {
        unit: s.border_radius.unit || 'px',
        top: rad,
        right: rad,
        bottom: rad,
        left: rad,
        isLinked: true
      };
    }
    if (s.padding && s.padding.size !== undefined && s.padding.top === undefined) {
      const pad = String(s.padding.size);
      s.padding = {
        unit: s.padding.unit || 'px',
        top: pad,
        right: pad,
        bottom: pad,
        left: pad,
        isLinked: true
      };
    }
    if (s.margin && s.margin.size !== undefined && s.margin.top === undefined) {
      const mar = String(s.margin.size);
      s.margin = {
        unit: s.margin.unit || 'px',
        top: mar,
        right: mar,
        bottom: mar,
        left: mar,
        isLinked: true
      };
    }

    // 5. Sanitize Elementor background properties (Fix AI hallucination 'solid' -> 'classic')
    // IMPORTANT: Restrict wrapper background assignment exclusively to containers!
    // Never assign background_background: 'classic' to content widgets (like buttons or icons),
    // because WordPress Elementor will paint the outer wrapper box.
    if (node.elType === 'container') {
      if (s.background_background === 'solid' || (!s.background_background && s.background_color && s.background_color !== 'transparent')) {
        s.background_background = 'classic';
      }
    } else if (node.widgetType === 'button') {
      // Button widgets MUST NOT have wrapper background or wrapper padding
      delete s.background_background;
      delete s._background_color;
      delete s._background_background;
      delete s._padding;
      delete s.padding;
      // Guarantee full-width button parity
      if (s.width?.size === 100 || s.width === '100%' || s._element_width === 'inherit' || s.align === 'justify') {
        s.align = 'justify';
        delete s._element_width;
      }
    }

    // 6. Universal Scalar Contract Enforcement (Last-Writer-Wins)
    enforceScalarContract(node);

    // 7. Recurse into children
    if (Array.isArray(node.elements)) {
      for (const child of node.elements) {
        scanAndNormalize(child, node);
      }
    }
  }

  for (const root of contentElements) {
    scanAndNormalize(root, null);
  }
}

module.exports = {
  normalizeElementorSchema
};

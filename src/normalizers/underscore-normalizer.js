/**
 * @deprecated Legacy v0.4 Fallback Normalizer.
 * In V2, Single-Pass Geometric Mapping (src/smart/geometry-mapper.js) natively preserves geometry.
 * Retained strictly as fallback for offline/legacy AST pipeline.
 */
/**
 * Underscore Normalizer Guardrail (RULE: widgetUnderscoreBoxModelContract).
 * Recursively guarantees that all Elementor widgets strictly declare _margin, _padding, _css_classes.
 */

function normalizeWidgetUnderscores(element) {
  if (!element) return;

  if (element.elType === 'widget' && element.settings) {
    const s = element.settings;

    // Migrate margin -> _margin
    if (s.margin && !s._margin) {
      s._margin = s.margin;
      delete s.margin;
    } else if (!s._margin) {
      s._margin = { unit: 'px', top: '0', right: '0', bottom: '0', left: '0', isLinked: true };
    }

    // Migrate padding -> _padding
    if (s.padding && !s._padding) {
      s._padding = s.padding;
      delete s.padding;
    } else if (!s._padding) {
      s._padding = { unit: 'px', top: '0', right: '0', bottom: '0', left: '0', isLinked: true };
    }

    // Parity for css_classes <-> _css_classes
    if (s.css_classes && !s._css_classes) {
      s._css_classes = s.css_classes;
    } else if (s._css_classes && !s.css_classes) {
      s.css_classes = s._css_classes;
    }
  }

  // Recurse into children
  if (Array.isArray(element.elements)) {
    for (const child of element.elements) {
      normalizeWidgetUnderscores(child);
    }
  }
}

module.exports = {
  normalizeWidgetUnderscores
};

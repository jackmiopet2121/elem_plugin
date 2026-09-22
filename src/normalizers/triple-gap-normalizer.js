/**
 * @deprecated Legacy v0.4 Fallback Normalizer.
 * In V2, Single-Pass Geometric Mapping (src/smart/geometry-mapper.js) natively preserves geometry.
 * Retained strictly as fallback for offline/legacy AST pipeline.
 */
/**
 * Triple Gap Normalizer Guardrail (RULE: explicitContainerGap).
 * Guarantees that all containers have gap, flex_gap, and space_between_widgets declared
 * simultaneously across all breakpoints to neutralize Elementor Kit 20px injection.
 */

const { unwrapGapNumber } = require('../smart/style-router');

function normalizeTripleGaps(element) {
  if (!element) return;

  if (element.elType === 'container' && element.settings) {
    const s = element.settings;
    const baseGap = unwrapGapNumber(s.gap ?? s.flex_gap ?? s.space_between_widgets);

    s.gap = { unit: 'px', size: baseGap, column: baseGap, row: baseGap };
    s.flex_gap = { unit: 'px', size: baseGap, column: baseGap, row: baseGap };
    s.space_between_widgets = baseGap;

    // Tablet gap
    if (s.gap_tablet || s.flex_gap_tablet || s.space_between_widgets_tablet !== undefined) {
      const tabGap = unwrapGapNumber(s.gap_tablet ?? s.flex_gap_tablet ?? s.space_between_widgets_tablet ?? baseGap);
      s.gap_tablet = { unit: 'px', size: tabGap, column: tabGap, row: tabGap };
      s.flex_gap_tablet = { unit: 'px', size: tabGap, column: tabGap, row: tabGap };
      s.space_between_widgets_tablet = tabGap;
    }

    // Mobile gap
    if (s.gap_mobile || s.flex_gap_mobile || s.space_between_widgets_mobile !== undefined) {
      const mobGap = unwrapGapNumber(s.gap_mobile ?? s.flex_gap_mobile ?? s.space_between_widgets_mobile ?? baseGap);
      s.gap_mobile = { unit: 'px', size: mobGap, column: mobGap, row: mobGap };
      s.flex_gap_mobile = { unit: 'px', size: mobGap, column: mobGap, row: mobGap };
      s.space_between_widgets_mobile = mobGap;
    }
  }

  // Recurse into children
  if (Array.isArray(element.elements)) {
    for (const child of element.elements) {
      normalizeTripleGaps(child);
    }
  }
}

module.exports = {
  normalizeTripleGaps
};

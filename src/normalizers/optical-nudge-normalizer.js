/**
 * @deprecated Legacy v0.4 Fallback Normalizer.
 * In V2, Single-Pass Geometric Mapping (src/smart/geometry-mapper.js) natively preserves geometry.
 * Retained strictly as fallback for offline/legacy AST pipeline.
 */
/**
 * Optical Nudge Normalizer (RULE: opticalNudgeStrategy).
 * Enforces optical baseline alignment for fonts with high ascenders (Poppins/Inter)
 * when paired with icons inside pill buttons.
 */
const { getOpticalNudge } = require('../core/rules-engine');

function normalizeOpticalNudges(element) {
  if (!element) return;

  if (element.elType === 'widget' && element.widgetType === 'heading' && element.settings) {
    const s = element.settings;
    const font = s.typography_font_family || '';
    const classes = (s._css_classes || s.css_classes || '').toLowerCase();

    // Check if inside switcher or button pill
    if (classes.includes('switcher') || classes.includes('btn') || classes.includes('pill-text')) {
      const nudge = getOpticalNudge(font);
      if (nudge) {
        s._margin = {
          unit: 'px',
          top: String(nudge.top),
          right: s._margin?.right || '0',
          bottom: String(nudge.bottom),
          left: s._margin?.left || '0',
          isLinked: false
        };
      }
    }
  }

  // Recurse into children
  if (Array.isArray(element.elements)) {
    for (const child of element.elements) {
      normalizeOpticalNudges(child);
    }
  }
}

module.exports = {
  normalizeOpticalNudges
};

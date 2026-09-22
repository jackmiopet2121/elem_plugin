/**
 * Semantic Scoper Utility (Task M11)
 *
 * Ensures deterministic, hash-independent CSS scoping for Elementor export.
 * Solves WordPress import re-hashing by scoping styles to:
 * 1. Specific structural class from original HTML (.hero-visual, .badge-icon, etc.)
 * 2. Injected deterministic class (.e-sid-${sid})
 *
 * ZERO reliance on .elementor-element-${id} (Elementor hashes)
 * ZERO reliance on [data-sid] (stripped by Elementor Free on import)
 * ZERO reliance on bare .elementor-widget-${type} (causes global contamination)
 */

'use strict';

const GENERIC_LAYOUT_CLASSES = new Set([
  'container', 'container-fluid', 'e-con', 'e-con-boxed', 'e-con-full',
  'elementor-widget', 'elementor-element', 'row', 'col', 'flex', 'd-flex',
  'text-center', 'text-left', 'text-right', 'flex-center', 'w-full', 'h-full',
  'e-parent', 'e-child', 'e-flex', 'section', 'wrapper', 'main', 'btn', 'button',
  'section-padding', 'relative', 'absolute', 'block', 'inline-block'
]);

/**
 * Extracts specific structural classes from a node or settings object.
 * Returns array of non-generic, non-Elementor class names.
 */
function getStructuralClasses(elementOrSettings) {
  if (!elementOrSettings) return [];
  const s = elementOrSettings.settings || elementOrSettings;
  const rawCandidates = [
    typeof elementOrSettings.className === 'string' ? elementOrSettings.className : '',
    elementOrSettings.attributes?.class || elementOrSettings.attributes?.className || '',
    s.css_classes || '',
    s._css_classes || ''
  ];
  const tokens = Array.from(new Set(rawCandidates.join(' ').split(/\s+/).filter(Boolean)));
  return tokens.filter(c => {
    const lower = c.toLowerCase();
    if (GENERIC_LAYOUT_CLASSES.has(lower)) return false;
    if (lower.startsWith('elementor-')) return false;
    if (lower.startsWith('e-con')) return false;
    if (lower.startsWith('e-sid-')) return false;
    if (lower.startsWith('e-flex') || lower === 'e-parent' || lower === 'e-child') return false;
    return true;
  });
}

/**
 * Ensures deterministic class 'e-sid-${cleanSid}' is injected into settings._css_classes
 * and settings.css_classes when an element lacks a structural class.
 *
 * @param {Object} element - Elementor node or AST node
 * @param {string} [sidFallback] - Optional fallback sid or ID
 * @returns {string} - Injected class name (e.g. 'e-sid-20')
 */
function ensureDeterministicClass(element, sidFallback = null) {
  if (!element) return null;
  const s = element.settings = element.settings || {};

  const rawSid = element._sid || s._sid || element._dom_id || s._dom_id || sidFallback || element.id || '';
  if (!rawSid) return null;

  const cleanSid = String(rawSid).replace(/^sid-/, '');
  const deterministicClass = `e-sid-${cleanSid}`;

  const currentTokens = Array.from(new Set(
    [s.css_classes, s._css_classes].filter(Boolean).join(' ').split(/\s+/).filter(Boolean)
  ));

  if (!currentTokens.includes(deterministicClass)) {
    currentTokens.push(deterministicClass);
  }

  const merged = currentTokens.join(' ');
  s.css_classes = merged;
  s._css_classes = merged;

  return deterministicClass;
}

/**
 * Resolves the primary CSS scope selector for an Elementor element:
 * - Priority 1: Specific structural class from original HTML (.hero-visual, .badge-icon, etc.)
 * - Priority 2: Injected deterministic class (.e-sid-20, .e-sid-171, etc.)
 *
 * GUARANTEES: ZERO reliance on .elementor-element-${id}, [data-sid], or bare widget types.
 *
 * @param {Object} element - Elementor node or AST node
 * @param {string} [sidFallback] - Optional fallback sid
 * @returns {string} - CSS selector (e.g. '.hero-visual' or '.e-sid-20')
 */
function resolveElementSelector(element, sidFallback = null) {
  if (!element) return null;

  // Priority 1: Structural class from original HTML
  const structural = getStructuralClasses(element);
  if (structural.length > 0) {
    return `.${structural[0]}`;
  }

  // Priority 2: Injected deterministic class
  const injectedClass = ensureDeterministicClass(element, sidFallback);
  if (injectedClass) {
    return `.${injectedClass}`;
  }

  // Safe fallback if sid is completely absent: use element.id formatted as e-sid-
  const fallbackSid = element.id || 'elem';
  const fallbackClass = `e-sid-${fallbackSid}`;
  const s = element.settings = element.settings || {};
  const currentTokens = Array.from(new Set(
    [s.css_classes, s._css_classes].filter(Boolean).join(' ').split(/\s+/).filter(Boolean)
  ));
  if (!currentTokens.includes(fallbackClass)) {
    currentTokens.push(fallbackClass);
    const merged = currentTokens.join(' ');
    s.css_classes = merged;
    s._css_classes = merged;
  }
  return `.${fallbackClass}`;
}

module.exports = {
  GENERIC_LAYOUT_CLASSES,
  getStructuralClasses,
  ensureDeterministicClass,
  resolveElementSelector
};

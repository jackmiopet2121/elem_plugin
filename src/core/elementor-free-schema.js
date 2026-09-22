/**
 * Elementor Free Core Official Schema Registry.
 * Declares the exact, authoritative boundaries of what Elementor Free supports natively
 * versus what requires micro-CSS / micro-embed polyfilling.
 */

// 1. Officially Supported Native CSS Properties in Elementor Free Controls
const ELEMENTOR_FREE_NATIVE_PROPERTIES = new Set([
  // Typography (Group_Control_Typography)
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'letter-spacing',
  'text-transform',
  'font-style',
  'text-decoration',
  'text-align',
  'color',

  // Box Model & Dimensions (Control_Dimensions & Slider)
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'width',
  'max-width',
  'min-width',
  'height',
  'min-height',
  'max-height',

  // Borders & Outlines (Group_Control_Border)
  'border',
  'border-width',
  'border-style',
  'border-color',
  'border-radius',
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-right-radius',
  'border-bottom-left-radius',
  'outline',

  // Backgrounds (Group_Control_Background)
  'background',
  'background-color',
  'background-image',
  'background-position',
  'background-repeat',
  'background-size',

  // Box Effects (Group_Control_Box_Shadow)
  'box-shadow',
  'opacity',

  // Flexbox Container Controls (e-con)
  'display',
  'flex-direction',
  'justify-content',
  'align-items',
  'align-self',
  'align-content',
  'flex-wrap',
  'gap',
  'row-gap',
  'column-gap',
  'flex-grow',
  'flex-shrink',
  'flex-basis',
  'order'
]);

// 2. Officially Supported Free Widget Types
const ELEMENTOR_FREE_WIDGET_TYPES = new Set([
  'heading',
  'text-editor',
  'button',
  'icon',
  'image',
  'divider',
  'html'
]);

// 3. Patterns that DEMAND Micro-CSS (Elementor Free cannot represent natively in panel)
const MICRO_CSS_SELECTOR_PATTERNS = [
  // Vendor pseudo-elements
  /::-webkit-[a-z0-9-]+/i,
  /::-moz-[a-z0-9-]+/i,
  /::-ms-[a-z0-9-]+/i,
  // Standard pseudo-elements
  /::?(?:before|after|placeholder|selection|marker)/i,
  // Sibling combinators and relational pseudo-classes
  /\s*\+\s*/,
  /\s*~\s*/,
  /:checked/i,
  /:focus-within/i,
  /:focus-visible/i,
  /:target/i,
  // Dynamic JavaScript state classes (Universal Interactive State Engine)
  /\.(?:is-active|is-open|is-checked|active|open|expanded|collapsed|tier-active|selected|is-selected|current|show|is-visible)\b/i,
  // Dynamic visibility and filtering states (galleries, tabs, disclosures, modals)
  /\.(?:hide|hidden|is-hidden|fade-out|fade-in|invisible|is-collapsed|tier-hidden|filtered)\b/i,
  // Universal data attributes for filtering, states, and tabs
  /\[(?:data-filter|data-category|data-tab|data-state|data-target|hidden|aria-hidden|aria-expanded|aria-selected)\]/i,
  // Form controls & switches (must preserve dimensions, opacity, pseudo-knobs)
  /(?:^|\s|\.|\#)[a-z0-9_-]*(?:toggle|switch|slider|track|knob|thumb)[a-z0-9_-]*/i,
  // Badges & pills (including .save-badge, .popular-pill, .tag)
  /(?:^|\s|\.|\#)[a-z0-9_-]*(?:badge|pill|tag|save)[a-z0-9_-]*/i,
  // Form input elements
  /(?:^|\s)(?:input|select|textarea|label)\b/i
];

// 4. Global selectors that MUST be stripped to prevent corrupting WordPress themes
const GLOBAL_RESET_SELECTORS = [
  /^body$/i,
  /^html$/i,
  /^:root$/i,
  /^\*$/,
  /^\*::before$/,
  /^\*::after$/,
  /^\*,\s*\*::before,\s*\*::after$/i
];

function isNativeElementorProperty(prop = '') {
  return ELEMENTOR_FREE_NATIVE_PROPERTIES.has(prop.trim().toLowerCase());
}

function isMicroCssSelector(selector = '') {
  const s = selector.trim();
  return MICRO_CSS_SELECTOR_PATTERNS.some(pattern => pattern.test(s));
}

function isGlobalResetSelector(selector = '') {
  const s = selector.trim();
  return GLOBAL_RESET_SELECTORS.some(pattern => pattern.test(s));
}

module.exports = {
  ELEMENTOR_FREE_NATIVE_PROPERTIES,
  ELEMENTOR_FREE_WIDGET_TYPES,
  isNativeElementorProperty,
  isMicroCssSelector,
  isGlobalResetSelector
};

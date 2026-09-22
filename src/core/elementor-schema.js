/**
 * Official Elementor Free Core Schema Registry.
 * Pure W3C property boundaries: declares what Elementor Free supports natively
 * in its panel controls versus what requires Scoped CSS rendering.
 */

// Officially Supported Native CSS Properties in Elementor Free Controls
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

// Officially Supported Free Widget Types
const ELEMENTOR_FREE_WIDGET_TYPES = new Set([
  'heading',
  'text-editor',
  'button',
  'icon',
  'image',
  'divider',
  'html'
]);

// Global selectors that must be stripped so they don't break the parent WordPress theme
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

function isGlobalResetSelector(selector = '') {
  const s = selector.trim();
  return GLOBAL_RESET_SELECTORS.some(pattern => pattern.test(s));
}

module.exports = {
  ELEMENTOR_FREE_NATIVE_PROPERTIES,
  ELEMENTOR_FREE_WIDGET_TYPES,
  isNativeElementorProperty,
  isGlobalResetSelector
};

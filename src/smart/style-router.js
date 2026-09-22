/**
 * Single source of truth for style routing (Editability-First Contract §2.2).
 */
const NATIVE_WIDGET_WHITELIST = new Set([
  "heading", "text-editor", "button", "image", "icon", "divider", "spacer", "icon-list"
]);

const REPRESENTABLE_PROPERTIES = new Set([
  "color", "fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing",
  "textTransform", "textAlign", "backgroundColor", "backgroundImage",
  "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
  "borderTopStyle", "borderRightStyle", "borderBottomStyle", "borderLeftStyle",
  "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor",
  "borderColor", "borderWidth", "borderStyle", "border", "borderRadius", "boxShadow",
  "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "padding",
  "marginTop", "marginRight", "marginBottom", "marginLeft", "margin",
  "width", "minWidth", "maxWidth", "minHeight", "opacity",
  "gap", "rowGap", "columnGap", "flexDirection", "flexWrap", "justifyContent", "alignItems",
  "background", "font", "order"
]);

const REPRESENTABLE_ALIASES = {
  borderColor: "border_color",
  borderWidth: "border_width",
  borderStyle: "border_border",
  border: "border_border",
  background: "background_color",
  backgroundColor: "background_color",
  padding: "padding",
  margin: "margin",
  borderRadius: "border_radius",
  font: "typography_typography"
};

const MICRO_CSS_ONLY_PROPERTIES = new Set([
  "display", "position", "zIndex", "transform", "transition", "animation",
  "cursor", "overflow", "visibility", "pointerEvents", "userSelect", "filter"
]);

const SYSTEM_REASON_PREFIX = "SYSTEM:";
const VALID_HTML_REASONS = new Set([
  "SYSTEM:stylesheet-engine",
  "SYSTEM:script-engine",
  "NON_ELEMENTOR_PRIMITIVE:input[type=range]",
  "NON_ELEMENTOR_PRIMITIVE:switch",
  "NON_ELEMENTOR_PRIMITIVE:form-control",
  "NON_ELEMENTOR_PRIMITIVE:media",
  "NON_ELEMENTOR_PRIMITIVE:animated-svg",
  "NON_ELEMENTOR_PRIMITIVE:pseudo-content",
  "NON_ELEMENTOR_PRIMITIVE:composite-control"
]);

function toCamelCase(str) {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function toKebabCss(prop) {
  if (!prop || typeof prop !== 'string') return '';
  const trimmed = prop.trim();
  const startsWithHyphen = trimmed.startsWith('-');
  const kebab = trimmed.replace(/([A-Z])/g, '-$1').toLowerCase();
  return (kebab.startsWith('-') && !startsWithHyphen) ? kebab.slice(1) : kebab;
}

function isElementorNativeProperty(prop) {
  if (!prop) return false;
  const camel = toCamelCase(prop);
  if (REPRESENTABLE_PROPERTIES.has(prop) || REPRESENTABLE_PROPERTIES.has(camel)) return true;
  if (REPRESENTABLE_ALIASES[prop] || REPRESENTABLE_ALIASES[camel]) return true;
  const lower = prop.toLowerCase().replace(/[^a-z]/g, '');
  if (
    lower.startsWith('backgroundclip') ||
    lower.startsWith('webkitbackgroundclip') ||
    lower.startsWith('webkittextfillcolor') ||
    lower.startsWith('backgroundblendmode') ||
    lower.startsWith('backgroundorigin')
  ) {
    return false;
  }
  if (
    lower.startsWith('border') ||
    lower.startsWith('margin') ||
    lower.startsWith('padding') ||
    lower.startsWith('font') ||
    lower.startsWith('text') ||
    lower.startsWith('background') ||
    lower === 'color' ||
    lower === 'opacity' ||
    lower === 'gap' ||
    lower === 'rowgap' ||
    lower === 'columngap' ||
    lower === 'width' ||
    lower === 'minwidth' ||
    lower === 'maxwidth' ||
    lower === 'minheight' ||
    lower === 'height' ||
    lower === 'boxshadow' ||
    lower === 'flexdirection' ||
    lower === 'flexwrap' ||
    lower === 'justifycontent' ||
    lower === 'alignitems'
  ) {
    return true;
  }
  return false;
}

function isMicroCssOnlyProperty(prop) {
  return MICRO_CSS_ONLY_PROPERTIES.has(prop);
}

function isNativeEditableWidget(el) {
  if (!el) return false;
  if (el.elType === "container") return true;
  if (el.widgetType && NATIVE_WIDGET_WHITELIST.has(el.widgetType)) return true;
  return false;
}

function isSystemHtmlWidget(el) {
  return Boolean(
    el && el.widgetType === "html" &&
    typeof el.settings?._html_reason === "string" &&
    el.settings._html_reason.startsWith(SYSTEM_REASON_PREFIX)
  );
}

function isValidHtmlReason(reason) {
  return typeof reason === "string" && VALID_HTML_REASONS.has(reason);
}

function isMicroCssOnlySelector(selector = "") {
  return /::?(hover|focus|active|checked|before|after|placeholder|selection|first-child|last-child|nth-)/i.test(selector)
    || /\s[+~]\s/.test(selector)
    || /@keyframes/i.test(selector)
    || /\.(hide|hidden|is-hidden|active|is-active|is-open|open|tier-hidden|tier-visible|selected|current)\b/i.test(selector);
}

function isHtmlOnlyElement(tag, attrs = {}) {
  const t = (tag || "").toLowerCase();
  if (["canvas", "audio", "video", "iframe", "select", "textarea"].includes(t)) return true;
  if (t === "input") {
    const inputType = (attrs.type || "text").toLowerCase();
    return ["range", "checkbox", "radio", "file", "color", "date"].includes(inputType);
  }
  return false;
}

/**
 * Returns the base Elementor settings key for a property+widgetType.
 * Per-viewport suffix (_tablet/_mobile) is added by the caller.
 * Box-model keys returned here expect a 4-side Object (see §3.2).
 */
function settingsKeyFor(prop, widgetType) {
  if (!prop) return null;

  // Box-model & side normalizations
  if (prop.startsWith("padding")) {
    return widgetType === "container" ? "padding" : (widgetType === "button" ? "button_padding" : "_padding");
  }
  if (prop.startsWith("margin")) {
    return widgetType === "container" ? "margin" : "_margin";
  }
  if (prop === "borderWidth" || (prop.startsWith("border") && prop.endsWith("Width"))) {
    return "border_width";
  }
  if (prop === "borderColor" || (prop.startsWith("border") && prop.endsWith("Color"))) {
    return "border_color";
  }
  if (prop === "borderStyle" || prop === "border" || (prop.startsWith("border") && prop.endsWith("Style"))) {
    return "border_border";
  }
  if (prop === "borderRadius" || (prop.startsWith("border") && prop.endsWith("Radius"))) {
    return "border_radius";
  }
  if (prop === "gap" || prop === "rowGap" || prop === "columnGap") {
    return "gap";
  }

  const map = {
    color: { heading: "title_color", button: "button_text_color", "text-editor": "text_color", icon: "primary_color" }[widgetType] || "text_color",
    fontSize: widgetType === "icon" ? "size" : "typography_font_size",
    fontWeight: "typography_font_weight",
    lineHeight: "typography_line_height",
    letterSpacing: "typography_letter_spacing",
    textTransform: "typography_text_transform",
    fontFamily: "typography_font_family",
    textAlign: "align",
    backgroundColor: "background_color",
    boxShadow: widgetType === "container" ? "box_shadow_box_shadow" : "_box_shadow_box_shadow",
    width: "width",
    minHeight: "min_height",
    opacity: "opacity",
    flexDirection: "flex_direction",
    flexWrap: "flex_wrap",
    justifyContent: "justify_content",
    alignItems: "align_items",
    order: "_order"
  };
  return map[prop] || null;
}

/** Deep-unwrap any nested gap value to a plain Number. */
function unwrapGapNumber(v) {
  let x = v;
  let guard = 0;
  while (x && typeof x === 'object' && guard++ < 5) {
    x = (x.size ?? x.column ?? x.row ?? 0);
  }
  const n = Number(parseFloat(x));
  return Number.isFinite(n) ? n : 0;
}

function extractFirstGradientColor(bgImage) {
  if (!bgImage || typeof bgImage !== 'string') return null;
  const colorMatches = bgImage.match(/(?:rgba?\([^)]+\)|#[0-9a-fA-F]{3,8})/g);
  if (colorMatches && colorMatches.length > 0) {
    return colorMatches[0];
  }
  return null;
}

module.exports = {
  NATIVE_WIDGET_WHITELIST,
  REPRESENTABLE_PROPERTIES,
  MICRO_CSS_ONLY_PROPERTIES,
  SYSTEM_REASON_PREFIX,
  VALID_HTML_REASONS,
  isElementorNativeProperty,
  isMicroCssOnlyProperty,
  isNativeEditableWidget,
  isSystemHtmlWidget,
  isValidHtmlReason,
  isMicroCssOnlySelector,
  isHtmlOnlyElement,
  settingsKeyFor,
  unwrapGapNumber,
  toKebabCss,
  toCamelCase,
  REPRESENTABLE_ALIASES,
  extractFirstGradientColor
};

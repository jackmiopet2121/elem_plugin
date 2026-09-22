/**
 * Four-Rung Fallback Ladder (R0 -> R3) — Editability-First Contract (v3.1).
 * Codename: "Single-Pass + Verify" (Phase 4 - T4.3)
 */

const { normalizeColor } = require("./tolerances");
const { createHtmlWidget } = require("../transformers/widget-transformer");
const {
  settingsKeyFor,
  isElementorNativeProperty,
  isNativeEditableWidget,
  toKebabCss
} = require("./style-router");
const { resolveElementSelector } = require("./semantic-scoper");

function parsePx(val) {
  if (!val) return 0;
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

/**
 * Merges a single side of an Elementor 4-side box-model Object.
 */
function mergeBoxModelSide(node, baseKey, side, value, viewport = "desktop") {
  if (!node || !node.settings) return false;
  const s = node.settings;
  const vpSuffix = viewport === "desktop" ? "" : "_" + viewport;
  const fullKey = baseKey + vpSuffix;
  const px = String(Math.round(parseFloat(value)) || 0);

  if (!s[fullKey] || typeof s[fullKey] !== "object") {
    const fallbackBox = (s[baseKey] && typeof s[baseKey] === "object") ? s[baseKey] : null;
    s[fullKey] = {
      unit: fallbackBox?.unit || "px",
      top: fallbackBox?.top !== undefined ? String(fallbackBox.top) : "0",
      right: fallbackBox?.right !== undefined ? String(fallbackBox.right) : "0",
      bottom: fallbackBox?.bottom !== undefined ? String(fallbackBox.bottom) : "0",
      left: fallbackBox?.left !== undefined ? String(fallbackBox.left) : "0",
      isLinked: false
    };
  }
  s[fullKey][side] = px;
  s[fullKey].isLinked = (
    s[fullKey].top === s[fullKey].right &&
    s[fullKey].right === s[fullKey].bottom &&
    s[fullKey].bottom === s[fullKey].left
  );
  return true;
}

/**
 * Helper to extract side from property name (e.g. paddingTop -> top, borderLeftWidth -> left).
 */
function extractBoxSide(prop) {
  if (!prop) return null;
  // Border radius corners
  if (prop === 'borderTopLeftRadius') return 'top';
  if (prop === 'borderTopRightRadius') return 'right';
  if (prop === 'borderBottomRightRadius') return 'bottom';
  if (prop === 'borderBottomLeftRadius') return 'left';

  // Standard box-model sides (padding, margin, border width)
  if (prop.includes("Top")) return "top";
  if (prop.includes("Right")) return "right";
  if (prop.includes("Bottom")) return "bottom";
  if (prop.includes("Left")) return "left";
  return null;
}

/**
 * Checks if an Elementor setting key supports responsive viewport variants (_tablet, _mobile).
 */
function isResponsiveKey(key) {
  if (!key) return false;
  return [
    "padding", "_padding", "button_padding",
    "margin", "_margin",
    "typography_font_size", "typography_line_height", "typography_letter_spacing",
    "align", "width", "min_height", "gap", "flex_gap", "flex_direction", "border_radius", "size"
  ].includes(key);
}

/**
 * Formats GT computed values into Elementor settings format (colors, box-model, typography, layout).
 */
function formatValueForElementorSettings(prop, value, viewport = "desktop") {
  if (value === null || value === undefined) return null;
  const strVal = String(value).trim();

  // 1. Colors
  if (prop.toLowerCase().includes("color")) {
    const hex = normalizeColor(strVal);
    return hex || null;
  }

  // 2. Box model sides (if passed as full 4-side object)
  if (/^(padding|margin|borderWidth|borderRadius)(Top|Right|Bottom|Left)?$/.test(prop)) {
    const px = String(Math.round(parsePx(strVal)));
    return { unit: "px", top: px, right: px, bottom: px, left: px, isLinked: true };
  }

  // 3. Typography
  if (prop === "fontSize" || prop === "size") {
    const px = Math.round(parsePx(strVal));
    return px >= 8 ? { unit: "px", size: px } : null;
  }
  if (prop === "lineHeight") {
    const px = parsePx(strVal);
    if (px > 0) {
      return { unit: "em", size: Math.round((px / 16) * 10) / 10 };
    }
    return null;
  }
  if (prop === "letterSpacing") {
    const px = parsePx(strVal);
    return { unit: "px", size: px };
  }
  if (prop === "fontWeight") {
    return strVal;
  }
  if (prop === "textTransform") {
    return strVal.toLowerCase();
  }
  if (prop === "fontFamily") {
    return strVal.replace(/['"]/g, "").split(",")[0].trim();
  }

  // 4. Alignment
  if (prop === "textAlign") {
    const a = strVal.toLowerCase();
    return ["left", "center", "right", "justify"].includes(a) ? a : null;
  }

  // 5. Gap
  if (prop === "gap" || prop === "rowGap" || prop === "columnGap") {
    const px = Math.round(parsePx(strVal));
    return { unit: "px", size: px, column: px, row: px };
  }

  // 6. Geometry & Sizing
  if (prop === "width") {
    if (strVal.endsWith("%")) {
      return { unit: "%", size: parseFloat(strVal) };
    }
    const px = Math.round(parsePx(strVal));
    return px > 0 ? { unit: "px", size: px } : null;
  }
  if (prop === "minHeight") {
    const px = Math.round(parsePx(strVal));
    return px > 0 ? { unit: "px", size: px } : null;
  }
  if (prop === "opacity") {
    const n = parseFloat(strVal);
    return Number.isFinite(n) ? n : 1;
  }

  // 7. Flex properties
  if (["flexDirection", "flexWrap", "justifyContent", "alignItems"].includes(prop)) {
    return strVal.toLowerCase();
  }

  // 8. Box Shadow
  if (prop === "boxShadow") {
    return {
      horizontal: 0,
      vertical: 4,
      blur: 12,
      spread: 0,
      color: "rgba(0,0,0,0.08)"
    };
  }

  return strVal;
}

/**
 * Rung 1: Generic AST Parameter Mutation via native Elementor settings (C1 Generic Writer).
 */
function applyR1Mutation(node, defect, gtSnapshot = null) {
  if (!node || !node.settings) return false;
  const s = node.settings;
  const prop = defect.property;
  const vp = defect.viewport || "desktop";
  const vpSuffix = vp === "desktop" ? "" : "_" + vp;
  const widgetType = node.widgetType || (node.elType === "container" ? "container" : null);

  // 1. Check if property is representable in Elementor settings
  const baseKey = settingsKeyFor(prop, widgetType);
  if (!baseKey) return false; // Not representable, falls through to R2

  // 2. Get ground-truth computed value (from snapshot or defect original)
  const gtNode = gtSnapshot?.viewports?.[vp]?.flat?.[defect.nodeSid];
  const gtValue = gtNode?.styles?.[prop] ?? defect.original;
  if (gtValue === undefined || gtValue === null) return false;

  // 3. Special A3 Percent-Only Child Widths handling (Contract v4.0 A3 / C14)
  if (prop === "width" && node.elType === "container" && (node.isInner || s.content_width === "full")) {
    let parentW = defect.parentWidth;
    let isParentRow = false;
    let parentPad = 0;
    if (gtNode?.parentSid) {
      const parentGt = gtSnapshot?.viewports?.[vp]?.flat?.[gtNode.parentSid];
      if (parentGt) {
        if (!parentW) parentW = parentGt.rect?.w;
        const isFlex = Boolean(parentGt.styles?.display && parentGt.styles.display.includes('flex'));
        const parentFlexDir = parentGt.styles?.flexDirection || parentGt.styles?.['flex-direction'];
        if (isFlex && parentFlexDir === 'row') {
          isParentRow = true;
        }
        parentPad = (parseFloat(parentGt.styles?.paddingLeft) || 0) +
                    (parseFloat(parentGt.styles?.paddingRight) || 0) +
                    (parseFloat(parentGt.styles?.borderLeftWidth) || 0) +
                    (parseFloat(parentGt.styles?.borderRightWidth) || 0);
      }
    }
    if (!parentW) {
      parentW = vp === "mobile" ? 375 : (vp === "tablet" ? 768 : 1200);
    }
    const innerParentW = Math.max(1, parentW - parentPad);
    const w = parsePx(gtValue);

    if (vp === "mobile" && !isParentRow) {
      s.width_mobile = { unit: "%", size: 100 };
      return true;
    }

    if (w > 0 && innerParentW > 0) {
      const isFull = Math.abs(w - innerParentW) <= 8;
      const pct = isFull ? 100 : Math.min(100, Math.round((w / innerParentW) * 100 * 10) / 10);
      s["width" + vpSuffix] = { unit: "%", size: pct };
      if (vp === "mobile" && isParentRow) {
        s._flex_size = 'none';
        s.flex_shrink = 0;
        s.flex_shrink_mobile = 0;
      }
      return true;
    }
    return false;
  }

  // 4. Box Model Dimensions (Padding, Margin, Border Width, Border Radius)
  const isBoxDim = ["padding", "_padding", "button_padding", "margin", "_margin", "border_width", "border_radius"].includes(baseKey);
  if (isBoxDim) {
    if (baseKey === "border_radius") {
      const radiusCorners = {
        top: 'borderTopLeftRadius',
        right: 'borderTopRightRadius',
        bottom: 'borderBottomRightRadius',
        left: 'borderBottomLeftRadius'
      };
      for (const [sSide, sProp] of Object.entries(radiusCorners)) {
        const val = gtNode?.styles?.[sProp] ?? gtValue;
        mergeBoxModelSide(node, baseKey, sSide, val, vp);
      }
      if (s[baseKey + vpSuffix]) {
        s[baseKey + vpSuffix].isLinked = false;
      }
    } else {
      const side = extractBoxSide(prop);
      if (side) {
        mergeBoxModelSide(node, baseKey, side, gtValue, vp);
        if (node.widgetType === "button" && baseKey === "button_padding") {
          mergeBoxModelSide(node, "_padding", side, gtValue, vp);
        }
      } else {
        ["top", "right", "bottom", "left"].forEach(sideName => {
          mergeBoxModelSide(node, baseKey, sideName, gtValue, vp);
          if (node.widgetType === "button" && baseKey === "button_padding") {
            mergeBoxModelSide(node, "_padding", sideName, gtValue, vp);
          }
        });
      }
    }

    if (baseKey === "border_width") {
      s.border_border = s.border_border || "solid";
      if (!s.border_color) s.border_color = "#E2E8F0";
    }
    return true;
  }

  // Handle columnGap and rowGap independently on gap setting (including zero-gap cases)
  if (baseKey === "gap" && (prop === "columnGap" || prop === "rowGap")) {
    const side = prop === "columnGap" ? "column" : "row";
    const px = Math.round(parsePx(gtValue));
    const targetKey = (isResponsiveKey("gap") && vp !== "desktop") ? ("gap" + vpSuffix) : "gap";
    const flexKey = (isResponsiveKey("flex_gap") && vp !== "desktop") ? ("flex_gap" + vpSuffix) : "flex_gap";
    const currentGap = (s[targetKey] && typeof s[targetKey] === "object") ? { ...s[targetKey] } : { unit: "px", column: 0, row: 0, size: 0 };
    currentGap[side] = px;
    currentGap.size = currentGap[side] !== undefined ? currentGap[side] : (currentGap.column || currentGap.row || 0);
    currentGap.isLinked = Boolean(currentGap.column === currentGap.row);
    s[targetKey] = currentGap;
    s[flexKey] = { ...currentGap };
    if (node.elType === "container") {
      const spaceKey = "space_between_widgets" + (vp !== "desktop" ? vpSuffix : "");
      s[spaceKey] = currentGap.size;
    }
    return true;
  }

  // 5. Format value for generic Elementor setting
  const formattedValue = formatValueForElementorSettings(prop, gtValue, vp);
  if (formattedValue === null || formattedValue === undefined) return false;

  // 6. Write directly to settings with responsive viewport suffix if applicable
  const targetKey = (isResponsiveKey(baseKey) && vp !== "desktop") ? (baseKey + vpSuffix) : baseKey;
  s[targetKey] = formattedValue;

  // Also sync flex_gap if gap is written
  if (baseKey === "gap") {
    s["flex_gap" + (vp !== "desktop" ? vpSuffix : "")] = formattedValue;
  }

  // 7. Side-effect flags required by Elementor UI schema
  if (baseKey === "background_color" || targetKey.includes("background_color")) {
    s.background_background = "classic";
  }
  if (baseKey === "border_color") {
    s.border_border = s.border_border || "solid";
  }
  if (baseKey.startsWith("typography_")) {
    s.typography_typography = "custom";
  }

  return true;
}

/**
 * Rung 2: Scoped Micro-CSS Rule Generation.
 * Guarded (T3): NEVER emit CSS rules for Elementor-representable properties.
 */
function generateR2Rule(widgetId, defect, widgetType = null, element = null) {
  if ((!widgetId && !element) || !defect) return null;

  // C2: Block derived metrics from entering R2 CSS
  if (["lineCount", "wordCount", "lineWidth"].includes(defect.property)) {
    return null;
  }

  // Guard (T3): representable properties must NOT be hidden behind scoped CSS
  if (isElementorNativeProperty(defect.property)) {
    return null;
  }

  const prop = defect.property;
  const val = defect.original;

  let baseScope = null;
  if (element) {
    baseScope = resolveElementSelector(element, defect.sid || widgetId);
  } else if (defect.targetClass) {
    baseScope = `.${defect.targetClass}`;
  } else {
    const rawSid = defect.sid || widgetId;
    const cleanSid = String(rawSid).replace(/^sid-/, '');
    baseScope = `.e-sid-${cleanSid}`;
  }

  let selector = baseScope;
  if (widgetType === "heading") {
    selector += " .elementor-heading-title";
  } else if (widgetType === "button") {
    selector += " .elementor-button";
  } else if (widgetType === "text-editor") {
    selector += " .elementor-text-editor";
  }

  const cssProp = toKebabCss(prop);
  if (!cssProp) return null;

  const baseRule = `${selector} { ${cssProp}: ${val} !important; }`;
  if (defect.viewport === "tablet") {
    return `@media (max-width: 1024px) {\n  ${baseRule}\n}`;
  }
  if (defect.viewport === "mobile") {
    return `@media (max-width: 767px) {\n  ${baseRule}\n}`;
  }
  return baseRule;
}

/**
 * Rung 3: Scoped HTML Micro-Embed Creation.
 * Guarded (T4): Native editable widgets can NEVER be replaced by R3 embeds.
 */
function createR3EmbedWidget(sid, gtNode, sourceEl = null, parentGt = null) {
  // Guard (T4): Never replace native editable widgets
  if (sourceEl && isNativeEditableWidget(sourceEl)) {
    return null;
  }

  const styles = gtNode?.styles || {};
  const tag = gtNode?.tag || "div";
  const text = gtNode?.directText || gtNode?.fullText || "";

  const inlineStyles = [
    styles.display ? `display: ${styles.display}` : "",
    "width: 100%",
    styles.color ? `color: ${styles.color}` : "",
    styles.backgroundColor ? `background-color: ${styles.backgroundColor}` : "",
    styles.fontSize ? `font-size: ${styles.fontSize}` : "",
    styles.fontWeight ? `font-weight: ${styles.fontWeight}` : "",
    styles.paddingTop ? `padding: ${styles.paddingTop} ${styles.paddingRight} ${styles.paddingBottom} ${styles.paddingLeft}` : "",
    styles.borderTopWidth ? `border: ${styles.borderTopWidth} ${styles.borderTopStyle} ${styles.borderTopColor}` : "",
    styles.borderTopLeftRadius ? `border-radius: ${styles.borderTopLeftRadius}` : "",
    styles.boxShadow && styles.boxShadow !== "none" ? `box-shadow: ${styles.boxShadow}` : ""
  ].filter(Boolean).join("; ");

  // Task M1: Do not inject data-sid into inner tag string (kills DUPLICATE_SID_COLLISION)
  const html = `<${tag} style="${inlineStyles}">${text}</${tag}>`;

  // Task M1: Micro-embed widgets receive GT geometry (percent width of parent, min-height where GT height > 0)
  let pctWidth = 100;
  if (parentGt && parentGt.rect && parentGt.rect.w > 0 && gtNode?.rect && gtNode.rect.w > 0) {
    pctWidth = Math.min(100, Math.round((gtNode.rect.w / parentGt.rect.w) * 100 * 10) / 10);
  } else if (sourceEl?.settings?.width?.unit === '%' && sourceEl?.settings?.width?.size) {
    pctWidth = sourceEl.settings.width.size;
  }

  const widgetOptions = {
    _sid: sid,
    _dom_id: sid,
    html,
    css_classes: `micro-embed-${sid}`,
    _html_reason: "NON_ELEMENTOR_PRIMITIVE:form-control",
    width: { unit: '%', size: pctWidth },
    _flex_size: 'none'
  };

  if (gtNode?.rect && gtNode.rect.h > 0) {
    widgetOptions.min_height = { unit: 'px', size: Math.round(gtNode.rect.h) };
  }

  return createHtmlWidget(widgetOptions);
}

module.exports = {
  mergeBoxModelSide,
  applyR1Mutation,
  generateR2Rule,
  createR3EmbedWidget,
  formatValueForElementorSettings
};

/**
 * Single-Pass Geometric & Computed Style Mapper.
 * Codename: "Single-Pass + Verify" (Phase 2 - T2.1)
 * 
 * Directly maps any DOM node into native Elementor Free JSON
 * strictly derived from Chromium ground-truth geometry and computed styles.
 * 
 * ZERO regex CSS guessing. ZERO class-keyword heuristics.
 */

const { generateId } = require('../core/id-generator');
const { createContainer } = require('../transformers/container-transformer');
const {
  createHeadingWidget,
  createTextEditorWidget,
  createButtonWidget,
  createImageWidget,
  createIconWidget,
  createDividerWidget,
  createHtmlWidget
} = require('../transformers/widget-transformer');
const { gtFor } = require('./gt-link');
const { normalizeColor, parseColorParts } = require('./tolerances');
const { readComputedCssProperty, isFullyTransparentColor } = require('./computed-style-resolver');
const { resolveComputedRadius } = require('./computed-radius-resolver');
const { extractFirstGradientColor } = require('./style-router');
const { parseBoxShadow } = require('../normalizers/css-style-resolver');
const { detectUniversalBoxedWidth } = require('./boxed-width-detector');
const { resolveGlyphToFa5, hasKnownGlyph, extractKnownGlyph } = require('./glyph-map');
const { getFa5Equivalent } = require('../core/rules-engine');
const {
  getStructuralClasses,
  ensureDeterministicClass,
  resolveElementSelector
} = require('./semantic-scoper');
const { resolveImageBackgroundGeometry } = require('./image-background-geometry');
const { resolveGradientBackground } = require('./gradient-background-resolver');

function extractFontFamily(fontFamilyStr) {
  if (!fontFamilyStr) return null;
  const first = fontFamilyStr.split(',')[0].replace(/['"]/g, '').trim();
  return first || null;
}

function parsePx(val) {
  if (!val) return 0;
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

function formatBox(top, right, bottom, left, unit = 'px') {
  const t = Math.round(parsePx(top));
  const r = Math.round(parsePx(right));
  const b = Math.round(parsePx(bottom));
  const l = Math.round(parsePx(left));
  return {
    unit,
    top: String(t),
    right: String(r),
    bottom: String(b),
    left: String(l),
    isLinked: Boolean(t === r && r === b && b === l)
  };
}

function formatPaddingFromStyles(styles) {
  if (!styles) return null;
  return formatBox(styles.paddingTop, styles.paddingRight, styles.paddingBottom, styles.paddingLeft);
}

function formatMarginFromStyles(styles) {
  if (!styles) return null;
  return formatBox(styles.marginTop, styles.marginRight, styles.marginBottom, styles.marginLeft);
}

function formatRadiusFromStyles(styles) {
  if (!styles) return null;
  return formatBox(styles.borderTopLeftRadius, styles.borderTopRightRadius, styles.borderBottomRightRadius, styles.borderBottomLeftRadius);
}

function hasAnyBorderRadius(styles = {}) {
  return parsePx(styles.borderTopLeftRadius) > 0 ||
         parsePx(styles.borderTopRightRadius) > 0 ||
         parsePx(styles.borderBottomRightRadius) > 0 ||
         parsePx(styles.borderBottomLeftRadius) > 0;
}

function hasAnyBorder(styles = {}) {
  return parsePx(styles.borderTopWidth) > 0 ||
         parsePx(styles.borderRightWidth) > 0 ||
         parsePx(styles.borderBottomWidth) > 0 ||
         parsePx(styles.borderLeftWidth) > 0;
}

function pushAtomicRule(options, rule) {
  if (!options || !Array.isArray(options.atomicRules) || !rule) return;
  const trimmed = rule.trim();
  if (!trimmed) return;
  if (!options.atomicRules.some(r => r.trim() === trimmed)) {
    options.atomicRules.push(trimmed);
  }
}

function resolveBorderSettings(styles = {}) {
  if (!hasAnyBorder(styles)) return null;

  let borderStyle = 'solid';
  let borderColor = '';

  const sides = [
    { width: styles.borderTopWidth, style: styles.borderTopStyle, color: styles.borderTopColor },
    { width: styles.borderBottomWidth, style: styles.borderBottomStyle, color: styles.borderBottomColor },
    { width: styles.borderRightWidth, style: styles.borderRightStyle, color: styles.borderRightColor },
    { width: styles.borderLeftWidth, style: styles.borderLeftStyle, color: styles.borderLeftColor }
  ];

  for (const s of sides) {
    if (parsePx(s.width) > 0) {
      if (s.style && s.style !== 'none') {
        borderStyle = s.style;
      }
      if (s.color && s.color !== 'transparent' && s.color !== 'rgba(0, 0, 0, 0)') {
        borderColor = normalizeColor(s.color);
      }
      if (borderStyle && borderColor) break;
    }
  }

  const borderWidth = formatBox(
    styles.borderTopWidth,
    styles.borderRightWidth,
    styles.borderBottomWidth,
    styles.borderLeftWidth
  );

  const res = {
    border_border: borderStyle || 'solid',
    border_width: borderWidth
  };
  if (borderColor) {
    res.border_color = borderColor;
  }
  return res;
}

function isPseudoActive(c) {
  if (c === null || c === undefined) return false;
  const s = String(c).trim();
  if (s.length === 0) return true;
  const lower = s.toLowerCase().replace(/['"]/g, '').trim();
  return lower !== 'none' && lower !== 'normal';
}

function hasActivePseudoContent(gt) {
  if (!gt || !gt.pseudo) return false;
  return Boolean(isPseudoActive(gt.pseudo.before?.content) || isPseudoActive(gt.pseudo.after?.content));
}

/**
 * F4: Detects if an icon or its wrapper has circular or boxed decor styling.
 * - Circular: bg + border-radius ~50% + width/height 40-64px
 * - Boxed: bg + border + fixed dimensions 40-80px
 */
/**
 * GT-derived align-self detection from computed bounding rects.
 * Computes cross-axis alignment relative to the parent content-box:
 * - If parent is 'row' (or flex-direction: row), evaluates vertical cross-axis (Y-offset vs top/bottom padding).
 * - If parent is 'column' (default flex/block), evaluates horizontal cross-axis (X-offset vs left/right padding).
 */
function deriveAlignSelfFromGt(gt, parentGt, parentDirection = null) {
  if (!gt?.rect || !parentGt?.rect) return 'flex-start';

  const isRow = parentDirection === 'row' ||
    Boolean(parentGt.styles?.display && parentGt.styles.display.includes('flex') && parentGt.styles.flexDirection === 'row');

  if (isRow) {
    const padTop = parsePx(parentGt.styles?.paddingTop) || 0;
    const padBottom = parsePx(parentGt.styles?.paddingBottom) || 0;
    const borderTop = parsePx(parentGt.styles?.borderTopWidth) || 0;
    const borderBottom = parsePx(parentGt.styles?.borderBottomWidth) || 0;

    const contentTop = parentGt.rect.y + padTop + borderTop;
    const contentBottom = parentGt.rect.y + parentGt.rect.h - padBottom - borderBottom;
    const contentHeight = Math.max(0, contentBottom - contentTop);

    const childTop = gt.rect.y;
    const childHeight = gt.rect.h;
    const dyTop = Math.max(0, childTop - contentTop);
    const dyBottom = Math.max(0, contentBottom - (childTop + childHeight));
    const totalSlackY = Math.max(0, contentHeight - childHeight);

    if (totalSlackY <= 12) {
      return 'center';
    }
    if (Math.abs(dyTop - dyBottom) <= Math.max(10, totalSlackY * 0.2)) {
      return 'center';
    }
    return dyTop < dyBottom ? 'flex-start' : 'flex-end';
  } else {
    // Column cross-axis: horizontal (X-axis)
    const padLeft = parsePx(parentGt.styles?.paddingLeft) || 0;
    const padRight = parsePx(parentGt.styles?.paddingRight) || 0;
    const borderLeft = parsePx(parentGt.styles?.borderLeftWidth) || 0;
    const borderRight = parsePx(parentGt.styles?.borderRightWidth) || 0;

    const contentLeft = parentGt.rect.x + padLeft + borderLeft;
    const contentRight = parentGt.rect.x + parentGt.rect.w - padRight - borderRight;
    const contentWidth = Math.max(0, contentRight - contentLeft);

    const childLeft = gt.rect.x;
    const childWidth = gt.rect.w;
    const dxLeft = Math.max(0, childLeft - contentLeft);
    const dxRight = Math.max(0, contentRight - (childLeft + childWidth));
    const totalSlackX = Math.max(0, contentWidth - childWidth);

    if (totalSlackX <= 12) {
      return 'flex-start';
    }
    if (Math.abs(dxLeft - dxRight) <= Math.max(12, totalSlackX * 0.15)) {
      return 'center';
    }
    return dxLeft < dxRight ? 'flex-start' : 'flex-end';
  }
}

/**
 * F4 / M3: Detects if an icon or its wrapper has circular or boxed decor styling.
 * - Circular: bg + border-radius ~50% + width/height 24-84px
 * - Boxed: bg + border + fixed dimensions 24-84px
 */
function detectIconDecor(gt, styles, parentGt = null) {
  const candidates = [];
  if (gt && styles) candidates.push({ gt, styles });
  if (parentGt && parentGt.styles) candidates.push({ gt: parentGt, styles: parentGt.styles });

  for (const { gt: targetGt, styles: s } of candidates) {
    const w = Math.round(targetGt.rect?.w || parsePx(s.width) || 0);
    const h = Math.round(targetGt.rect?.h || parsePx(s.height) || 0);

    // Dimension range: 24-84px
    if (w < 24 || w > 84 || h < 24 || h > 84) continue;
    // Square/near-square check
    if (Math.abs(w - h) > Math.max(6, w * 0.25)) continue;

    const bg = normalizeColor(s.backgroundColor);
    const hasVisualBg = bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)';

    const bwTop = parsePx(s.borderTopWidth);
    const bwRight = parsePx(s.borderRightWidth);
    const bwBottom = parsePx(s.borderBottomWidth);
    const bwLeft = parsePx(s.borderLeftWidth);
    const maxBw = Math.max(bwTop, bwRight, bwBottom, bwLeft);
    const hasBorder = maxBw > 0 && s.borderTopStyle !== 'none';

    // Border radius corners
    const rTopLeft = parsePx(s.borderTopLeftRadius);
    const rTopRight = parsePx(s.borderTopRightRadius);
    const rBottomRight = parsePx(s.borderBottomRightRadius);
    const rBottomLeft = parsePx(s.borderBottomLeftRadius);
    const maxRadius = Math.max(rTopLeft, rTopRight, rBottomRight, rBottomLeft);
    const minDim = Math.min(w, h);

    const isCircular = (hasVisualBg || hasBorder) && (w >= 24 && w <= 84) && (maxRadius >= minDim * 0.38 || String(s.borderRadius).includes('50%'));
    const isBoxed = (hasVisualBg || hasBorder) && (w >= 24 && w <= 84) && !isCircular;

    if (isCircular || isBoxed) {
      const dim = Math.max(w, h);
      let borderRadiusCss = isCircular ? '50%' : `${maxRadius}px`;
      if (!isCircular && (rTopLeft !== rTopRight || rTopRight !== rBottomRight || rBottomRight !== rBottomLeft)) {
        borderRadiusCss = `${rTopLeft}px ${rTopRight}px ${rBottomRight}px ${rBottomLeft}px`;
      }

      let borderCss = '';
      if (hasBorder) {
        const bStyle = s.borderTopStyle && s.borderTopStyle !== 'none' ? s.borderTopStyle : 'solid';
        const bColor = normalizeColor(s.borderTopColor) || normalizeColor(s.borderColor) || '#E2E8F0';
        borderCss = `${maxBw}px ${bStyle} ${bColor}`;
      }

      return {
        type: isCircular ? 'circular' : 'boxed',
        width: dim,
        height: dim,
        borderRadius: borderRadiusCss,
        background: hasVisualBg ? bg : 'transparent',
        border: borderCss,
        alignSelf: deriveAlignSelfFromGt(targetGt, parentGt)
      };
    }
  }

  return null;
}

/**
 * Task M3: Role-based decor protection for fixed-dimension circular/square elements (aspect ~1:1, 24-84px).
 * Covers numbered timeline markers, icon containers, and badge containers (RC-1).
 */
function detectCircularOrSquareDecor(gt, styles, parentGt = null) {
  if (!gt?.rect) return null;
  const w = Math.round(gt.rect.w || parsePx(styles?.width) || 0);
  const h = Math.round(gt.rect.h || parsePx(styles?.height) || 0);

  if (w < 24 || w > 84 || h < 24 || h > 84) return null;
  if (Math.abs(w - h) > Math.max(6, Math.round(w * 0.25))) return null;

  const rawBg = styles?.backgroundColor ? String(styles.backgroundColor).trim() : '';
  const bg = normalizeColor(rawBg);
  const isTransparent = isFullyTransparentColor(rawBg) || bg === 'transparent' || rawBg === 'transparent' || rawBg === 'rgba(0, 0, 0, 0)';
  const hasVisualBg = Boolean(bg && !isTransparent);
  const hasBorder = hasAnyBorder(styles);
  const hasRadius = hasAnyBorderRadius(styles);
  const hasExplicitDim = Boolean(
    (typeof styles?.width === 'string' && styles.width.endsWith('px')) ||
    (typeof styles?.height === 'string' && styles.height.endsWith('px'))
  );

  if (!hasVisualBg && !hasBorder && !hasRadius && !hasExplicitDim) {
    return null;
  }

  const rTopLeft = parsePx(styles?.borderTopLeftRadius);
  const rTopRight = parsePx(styles?.borderTopRightRadius);
  const rBottomRight = parsePx(styles?.borderBottomRightRadius);
  const rBottomLeft = parsePx(styles?.borderBottomLeftRadius);
  const maxRadius = Math.max(rTopLeft, rTopRight, rBottomRight, rBottomLeft);
  const minDim = Math.min(w, h);

  const isCircular = maxRadius >= minDim * 0.38 || String(styles?.borderRadius).includes('50%');
  const alignSelf = deriveAlignSelfFromGt(gt, parentGt);

  let borderRadiusCss = isCircular ? '50%' : `${maxRadius}px`;
  if (!isCircular && (rTopLeft !== rTopRight || rTopRight !== rBottomRight || rBottomRight !== rBottomLeft)) {
    borderRadiusCss = `${rTopLeft}px ${rTopRight}px ${rBottomRight}px ${rBottomLeft}px`;
  }

  let borderCss = '';
  if (hasBorder) {
    const bw = Math.max(parsePx(styles?.borderTopWidth), parsePx(styles?.borderLeftWidth), 1);
    const bStyle = styles?.borderTopStyle && styles.borderTopStyle !== 'none' ? styles.borderTopStyle : 'solid';
    const bColor = normalizeColor(styles?.borderTopColor) || normalizeColor(styles?.borderColor) || '#E2E8F0';
    borderCss = `${bw}px ${bStyle} ${bColor}`;
  }

  const resolvedBg = hasVisualBg ? bg : (isTransparent ? 'transparent' : (bg || ''));

  return {
    isCircular,
    type: isCircular ? 'circular' : 'boxed',
    width: Math.max(w, h),
    height: Math.max(w, h),
    alignSelf,
    background: resolvedBg,
    hasVisualBg,
    hasBorder,
    border: borderCss,
    borderRadius: borderRadiusCss,
    maxRadius
  };
}

function serializeDomNodeToHtml(node) {
  if (!node) return '';
  if (node.tagName === '#text') return node.textContent || '';
  if (node.rawHtml) return node.rawHtml;

  const attrs = { ...(node.attributes || {}) };
  if (node.id && !attrs.id) attrs.id = node.id;
  if (node.className && !attrs.class) attrs.class = node.className;

  const booleanAttrs = new Set(['checked', 'disabled', 'required', 'readonly', 'autofocus', 'multiple', 'hidden']);
  const attrStr = Object.entries(attrs)
    .map(([k, v]) => {
      if (booleanAttrs.has(k.toLowerCase())) {
        return v === '' || v === true || v === 'true' || v === k ? k : `${k}="${v}"`;
      }
      return `${k}="${v}"`;
    })
    .join(' ');

  const openTag = attrStr ? `<${node.tagName} ${attrStr}>` : `<${node.tagName}>`;
  const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  if (voidTags.has(node.tagName)) {
    return openTag;
  }

  const innerHtml = Array.isArray(node.children) && node.children.length > 0
    ? node.children.map(serializeDomNodeToHtml).join('')
    : (node.textContent || '');

  return `${openTag}${innerHtml}</${node.tagName}>`;
}

function isVisualIndicatorNode(childNode, gtChild = null) {
  if (!childNode) return false;
  const tag = (childNode.tagName || '').toLowerCase();
  if (['svg', 'i', 'img'].includes(tag)) return true;
  const cls = (typeof childNode.className === 'string' ? childNode.className : (childNode.attributes?.class || '')).toLowerCase();
  if (/(?:icon|indicator|chevron|arrow|plus|minus|caret|toggle|marker|cross)/i.test(cls)) {
    return true;
  }
  const text = (childNode.textContent || '').trim();
  if (text.length > 0 && text.length <= 3 && /^[+\-\u00D7\u2212\u25BC\u25B2\u25B6\u25BA\u25B8\u203A\u00BB\u2039\u00AB\u2193\u2191\u2192\u2190|\u2715\u2716\u25BE\u25C2]$/u.test(text)) {
    return true;
  }
  if (childNode.children && childNode.children.some(cc => ['svg', 'i'].includes((cc.tagName || '').toLowerCase()))) {
    return true;
  }
  const raw = (childNode.rawHtml || '').toLowerCase();
  if (raw.includes('<svg') || raw.includes('<i ')) {
    return true;
  }
  if (gtChild && hasActivePseudoContent(gtChild)) {
    return true;
  }
  return false;
}

function isTextChildNode(childNode) {
  if (!childNode) return false;
  const tag = (childNode.tagName || '').toLowerCase();
  if (tag === '#text') {
    return (childNode.textContent || '').trim().length > 0;
  }
  const cls = (typeof childNode.className === 'string' ? childNode.className : (childNode.attributes?.class || '')).toLowerCase();
  if (/(?:title|text|question|label|header|heading|name|summary)/i.test(cls)) {
    return true;
  }
  if (['span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div', 'strong', 'em', 'b', 'label'].includes(tag)) {
    return (childNode.textContent || '').trim().length > 0;
  }
  return false;
}

function isCompositeControl(node, gt) {
  if (!node) return false;
  const tag = (node.tagName || '').toLowerCase();
  const attrs = node.attributes || {};

  // Never treat structural or list containers as composite controls
  if (['header', 'footer', 'section', 'article', 'nav', 'aside', 'main', 'li', 'ul', 'ol', 'form', 'table'].includes(tag)) {
    return false;
  }

  // Principle 1 (GT / Structural Truth): Must be an interactive trigger element
  const isTriggerElement = tag === 'button' ||
    tag === 'summary' ||
    attrs.role === 'button' ||
    attrs.role === 'tab' ||
    attrs['aria-expanded'] !== undefined ||
    attrs['data-toggle'] !== undefined ||
    attrs['data-collapse'] !== undefined ||
    Boolean(gt && gt.isInteractive && (tag === 'button' || tag === 'a' || tag === 'div' || tag === 'span'));

  if (!isTriggerElement) return false;

  const elementChildren = (node.children || []).filter(c => c.tagName && c.tagName !== '#text');
  if (elementChildren.length === 0) return false;

  const visualIndex = elementChildren.findIndex(c => isVisualIndicatorNode(c));
  if (visualIndex === -1) return false;

  // Must contain text (either in sibling child elements or direct text on trigger itself)
  const hasChildText = elementChildren.some((c, idx) => idx !== visualIndex && isTextChildNode(c));
  const hasDirectText = Boolean(
    (gt && ((gt.directText || gt.fullText || '').trim().length > 0)) ||
    ((node.textContent || '').trim().length > 0)
  );

  return hasChildText || hasDirectText;
}

/**
 * Detects the visual/semantic role of a DOM node from its computed truth.
 */
function detectNodeRole(node, gt) {
  if (!node) return null;
  const tag = (node.tagName || '').toLowerCase();
  if (tag === 'img') return 'image';
  if (tag === 'hr') return 'divider';
  if (!gt) return 'container';
  const styles = gt.styles || {};

  // D2: Empty direct text leaf node with active pseudo-content (::before/::after) -> HTML micro-embed
  const childElementCount = (node.children || []).filter(c => c.tagName !== '#text' || (c.textContent || '').trim().length > 0).length;
  const hasDirectText = Boolean(gt.hasDirectText && (gt.directText || '').trim().length > 0);
  const hasPseudo = hasActivePseudoContent(gt);
  if (childElementCount === 0 && !hasDirectText && hasPseudo) {
    return 'pseudo_html';
  }

  // 1. Explicit Image
  if (tag === 'img') return 'image';

  // 2. Divider
  if (tag === 'hr') return 'divider';

  // 3. SVG / Vector Icon
  if (tag === 'svg') {
    const raw = node.rawHtml || '';
    const hasAnimation = raw.includes('<animate') || raw.includes('<animateTransform') || raw.includes('<set');
    if (hasAnimation) {
      return 'svg_html';
    }
    if (gt.rect.w <= 64 && gt.rect.h <= 64) {
      return 'icon';
    }
    return 'image';
  }
  const directText = (gt.directText || node.textContent || '').trim();
  const hasGlyph = hasKnownGlyph(directText);

  // W2/W3: Tiny glyph bullets / separator dots:
  // Must render as inline text/span (heading widget with header_size: 'span'), NEVER icon widget with shape:circle / stacked decor
  // Advisory A1: relative to font-size (width <= 0.75 * fontSize) with 10px minimum
  const fontSize = parsePx(styles.fontSize) || 16;
  const maxBulletWidth = Math.max(10, Math.round(fontSize * 0.75));
  const isTinyBullet = Boolean(
    (gt.rect && gt.rect.w > 0 && Math.round(gt.rect.w) <= maxBulletWidth) &&
    (hasGlyph || directText.length <= 2)
  );
  if (isTinyBullet) {
    return 'inline_bullet';
  }

  if ((tag === 'i' || tag === 'span' || tag === 'em' || tag === 'b') && gt.rect.w <= 64 && gt.rect.h <= 64 && (!gt.hasDirectText || hasGlyph)) {
    return 'icon';
  }

  // F4: Decor Wrapper Styling (circular & boxed icon wrappers)
  const isGlyphText = (!/^\d+$/.test(directText) && directText.length > 0 && directText.length <= 2) || hasGlyph;
  const isDecorCandidate = (tag === 'i' || tag === 'span' || tag === 'div') && (!hasDirectText || isGlyphText);
  if (isDecorCandidate) {
    const w = Math.round(gt.rect?.w || parsePx(styles.width) || 0);
    const h = Math.round(gt.rect?.h || parsePx(styles.height) || 0);
    if (w >= 24 && w <= 84 && h >= 24 && h <= 84 && Math.abs(w - h) <= Math.max(6, w * 0.25)) {
      const hasIconChild = node.children && node.children.some(c => ['svg', 'i'].includes(c.tagName?.toLowerCase()) || (c.className || '').toLowerCase().includes('fa-') || (c.className || '').toLowerCase().includes('icon'));
      const hasComplexChild = node.children && node.children.some(c => ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'button', 'input', 'form', 'table'].includes(c.tagName?.toLowerCase()));
      const raw = (node.rawHtml || '').toLowerCase();
      const hasSvgOrI = raw.includes('<svg') || raw.includes('<i ') || raw.includes('class="fa');
      const hasIconClass = (node.className || '').toLowerCase().includes('icon') || (node.className || '').toLowerCase().includes('badge');
      if (!hasComplexChild && (hasIconChild || hasSvgOrI || tag === 'i' || tag === 'span' || isGlyphText || hasIconClass)) {
        const decor = detectIconDecor(gt, styles);
        if (decor) {
          return 'icon';
        }
      }
    }
  }

  // 4. Form Controls & Atomic Inputs
  if (['input', 'select', 'textarea'].includes(tag)) {
    return 'micro_input';
  }

  // F6: Composite Interactive Controls (FAQ Header text+icon, collapsible triggers)
  if (isCompositeControl(node, gt)) {
    return 'composite_control';
  }

  // 5. Interactive Button / CTA Candidate
  const isButtonTag = tag === 'button';
  const isButtonAnchor = tag === 'a' && (
    (styles.backgroundColor && styles.backgroundColor !== 'transparent' && styles.backgroundColor !== 'rgba(0, 0, 0, 0)') ||
    parsePx(styles.borderTopWidth) > 0 ||
    parsePx(styles.paddingLeft) >= 12
  ) && (gt.rect.h >= 24 && gt.rect.h <= 80);

  if (isButtonTag || isButtonAnchor || gt.isInteractive && (tag === 'a' || tag === 'button' || node.attributes?.role === 'button')) {
    // If it contains complex multi-line children, treat as container; otherwise button widget
    const hasComplexChildren = node.children && node.children.some(c => !['#text', 'span', 'i', 'strong', 'em', 'b'].includes(c.tagName));
    if (!hasComplexChildren) {
      return 'button';
    }
  }

  // 6. Text-only Leaf Node
  const nonTextChildCount = (node.children || []).filter(c => c.tagName !== '#text').length;
  const hasText = Boolean(
    (gt.hasDirectText && (gt.directText || '').trim().length > 0) ||
    (gt.fullText && (gt.fullText || '').trim().length > 0) ||
    (typeof node.isTextOnly === 'function' && node.isTextOnly()) ||
    (node.textContent && (node.textContent || '').trim().length > 0)
  );
  const isSemanticTextTag = ['p', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'small', 'label', 'blockquote', 'strong', 'em', 'b', 'i', 'li'].includes(tag);

  if ((nonTextChildCount === 0 || (typeof node.isTextOnly === 'function' && node.isTextOnly())) && (hasText || isSemanticTextTag)) {
    const isHeadingTag = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag);
    const fontSize = parsePx(styles.fontSize);
    const fontWeight = parseInt(styles.fontWeight, 10) || 400;

    if (isHeadingTag || fontSize >= 22 || (fontWeight >= 600 && fontSize >= 16)) {
      return 'heading';
    }
    return 'text';
  }

  // 7. Structural Layout Container
  return 'container';
}

/**
 * Geometric Layout Clustering:
 * Infers flex direction, wrap, and gap strictly from child bounding rects.
 */
function inferContainerLayout(childGts = [], parentGt) {
  // 1. Gather all candidate child rects: prefer parentGt.childRects if available, else childGts
  let rects = [];
  if (parentGt && Array.isArray(parentGt.childRects) && parentGt.childRects.length >= 2) {
    rects = parentGt.childRects.map(c => c.rect).filter(r => r && typeof r.x === 'number' && typeof r.y === 'number');
  } else if (Array.isArray(childGts) && childGts.length > 0) {
    rects = childGts.map(c => (c && c.rect ? c.rect : c)).filter(r => r && typeof r.x === 'number' && typeof r.y === 'number');
  }

  if (rects.length <= 1) {
    if (parentGt && parentGt.styles && (parentGt.styles.display === 'flex' || parentGt.styles.display === 'inline-flex')) {
      const fDir = (parentGt.styles.flexDirection || '').toLowerCase();
      if (fDir === 'row' || fDir === 'row-reverse') {
        return { direction: 'row', wrap: 'nowrap', gap: 0 };
      }
    }
    return { direction: 'column', wrap: 'nowrap', gap: 0 };
  }

  // 2. Pairwise geometric layout inference:
  // If children have overlapping Y ranges and are displaced horizontally => row (side-by-side)
  // If children are displaced vertically with negligible Y overlap => column (stacked)
  let rowPairs = 0;
  let colPairs = 0;
  let totalPairs = rects.length - 1;
  const gaps = [];

  for (let i = 0; i < totalPairs; i++) {
    const a = rects[i];
    const b = rects[i + 1];

    const overlapY = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    const overlapX = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
    const minH = Math.min(a.h, b.h);
    const minW = Math.min(a.w, b.w);
    // Advisory A2: Tight-stacked vertical blocks with minor subpixel/line-height Y overlap
    // must NEVER be inferred as row when their X-ranges strongly overlap.
    // Row inference strictly requires disjoint/non-overlapping X-ranges (side-by-side displacement).
    const isXDisjoint = (b.x >= a.x + a.w - 4 || a.x >= b.x + b.w - 4 || (minW > 0 && overlapX / minW < 0.35));
    const isYOverlapping = (minH > 0 && (overlapY / minH >= 0.35 || overlapY >= 4)) && isXDisjoint && !(minW > 0 && overlapX / minW >= 0.5);
    const isStacked = (b.y >= a.y + a.h - 4 || a.y >= b.y + b.h - 4 || (minW > 0 && overlapX / minW >= 0.5)) && (minH === 0 || !isYOverlapping);

    if (isYOverlapping) {
      rowPairs++;
      const horizontalGap = Math.max(0, b.x - (a.x + a.w));
      gaps.push(horizontalGap);
    } else if (isStacked) {
      colPairs++;
      const verticalGap = Math.max(0, b.y - (a.y + a.h));
      gaps.push(verticalGap);
    } else {
      // Fallback: check which axis displacement is larger
      const dx = Math.abs(b.x - a.x);
      const dy = Math.abs(b.y - a.y);
      if (dx > dy) {
        rowPairs++;
        gaps.push(Math.max(0, b.x - (a.x + a.w)));
      } else {
        colPairs++;
        gaps.push(Math.max(0, b.y - (a.y + a.h)));
      }
    }
  }

  const isRowDominant = rowPairs >= colPairs;
  const medianGap = gaps.length > 0 ? gaps.sort((x, y) => x - y)[Math.floor(gaps.length / 2)] : 0;

  // Check if wrap is needed (if children wrap onto multiple lines)
  const isWrap = isRowDominant && rowPairs < totalPairs && colPairs > 0;
  const isUniform = gaps.length <= 1 || (Math.max(...gaps) - Math.min(...gaps) <= 4);

  return {
    direction: isRowDominant ? 'row' : 'column',
    wrap: isWrap ? 'wrap' : 'nowrap',
    gap: Math.min(80, Math.max(0, Math.round(medianGap))),
    gaps,
    isUniform
  };
}

/**
 * W2: Spacing double-count elimination (timeline 48+48, split 31+32 class).
 * On the same stacking axis:
 * If container gap > 0 AND (child margin ≈ gap (|Δ| < 4px) OR their sum exceeds GT spacing):
 * Keep gap, zero the child margin.
 * Verifies strictly against GT computed spacing across adjacent siblings.
 */
function deduplicateContainerChildSpacing(containerSettings, mappedPairs, snapshot, viewport = 'desktop') {
  if (!mappedPairs || mappedPairs.length < 2) return;

  const isTablet = (viewport === 'tablet');
  const isMobile = (viewport === 'mobile');

  const dir = isTablet
    ? (containerSettings.direction_tablet || containerSettings.flex_direction_tablet || containerSettings.direction || containerSettings.flex_direction || 'column')
    : isMobile
      ? (containerSettings.direction_mobile || containerSettings.flex_direction_mobile || containerSettings.direction || containerSettings.flex_direction || 'column')
      : (containerSettings.direction || containerSettings.flex_direction || 'column');

  const isColumn = (dir === 'column');
  const isRow = (dir === 'row');

  if (!isColumn && !isRow) return;

  const rawGap = isTablet
    ? (containerSettings.gap_tablet || containerSettings.flex_gap_tablet || containerSettings.gap)
    : isMobile
      ? (containerSettings.gap_mobile || containerSettings.flex_gap_mobile || containerSettings.gap)
      : containerSettings.gap;

  const gapVal = isColumn
    ? parsePx(rawGap?.row ?? rawGap?.size ?? containerSettings.space_between_widgets)
    : parsePx(rawGap?.column ?? rawGap?.size ?? containerSettings.space_between_widgets);

  if (gapVal <= 0) return;

  for (let i = 0; i < mappedPairs.length - 1; i++) {
    const prev = mappedPairs[i];
    const curr = mappedPairs[i + 1];
    if (!prev?.element || !curr?.element) continue;

    const prevEl = prev.element;
    const currEl = curr.element;
    const prevNode = prev.node;
    const currNode = curr.node;
    const prevGt = prevNode ? gtFor(prevNode, viewport, snapshot) : null;
    const currGt = currNode ? gtFor(currNode, viewport, snapshot) : null;

    if (isColumn) {
      let gtSpacing = null;
      if (prevGt?.rect && currGt?.rect) {
        gtSpacing = Math.max(0, Math.round(currGt.rect.y - (prevGt.rect.y + prevGt.rect.h)));
      }

      const prevMarginBottom = isTablet
        ? parsePx(prevEl.settings?._margin_tablet?.bottom || prevEl.settings?.margin_tablet?.bottom || prevEl.settings?._margin?.bottom || prevEl.settings?.margin?.bottom)
        : isMobile
          ? parsePx(prevEl.settings?._margin_mobile?.bottom || prevEl.settings?.margin_mobile?.bottom || prevEl.settings?._margin?.bottom || prevEl.settings?.margin?.bottom)
          : parsePx(prevEl.settings?._margin?.bottom || prevEl.settings?.margin?.bottom);

      const currMarginTop = isTablet
        ? parsePx(currEl.settings?._margin_tablet?.top || currEl.settings?.margin_tablet?.top || currEl.settings?._margin?.top || currEl.settings?.margin?.top)
        : isMobile
          ? parsePx(currEl.settings?._margin_mobile?.top || currEl.settings?.margin_mobile?.top || currEl.settings?._margin?.top || currEl.settings?.margin?.top)
          : parsePx(currEl.settings?._margin?.top || currEl.settings?.margin?.top);

      const sumMargin = prevMarginBottom + currMarginTop;

      const isPrevApproxGap = prevMarginBottom > 0 && Math.abs(prevMarginBottom - gapVal) < 4;
      const isCurrApproxGap = currMarginTop > 0 && Math.abs(currMarginTop - gapVal) < 4;
      const isSumApproxGap = sumMargin > 0 && Math.abs(sumMargin - gapVal) < 4;
      const isExceedingGt = gtSpacing !== null && ((gapVal + sumMargin) > (gtSpacing + 2));

      if (isPrevApproxGap || isCurrApproxGap || isSumApproxGap || isExceedingGt) {
        if (prevMarginBottom > 0 && (isPrevApproxGap || isSumApproxGap || isExceedingGt)) {
          const isDecor = Boolean(prevEl.widgetType === 'icon' || prevEl.settings?._icon_decor || prevEl.settings?._decor);
          const remainingBottom = (isDecor && gtSpacing !== null && gtSpacing > gapVal)
            ? String(Math.round(gtSpacing - gapVal))
            : '0';
          if (!isTablet && !isMobile) {
            if (prevEl.settings?._margin) {
              prevEl.settings._margin.bottom = remainingBottom;
              prevEl.settings._margin.isLinked = false;
            }
            if (prevEl.settings?.margin) {
              prevEl.settings.margin.bottom = remainingBottom;
              prevEl.settings.margin.isLinked = false;
            }
          }
          if (isTablet) {
            if (!prevEl.settings._margin_tablet && prevEl.settings._margin) {
              prevEl.settings._margin_tablet = { ...prevEl.settings._margin };
            }
            if (prevEl.settings?._margin_tablet) {
              prevEl.settings._margin_tablet.bottom = remainingBottom;
              prevEl.settings._margin_tablet.isLinked = false;
            }
            if (prevEl.settings?.margin_tablet) {
              prevEl.settings.margin_tablet.bottom = remainingBottom;
              prevEl.settings.margin_tablet.isLinked = false;
            }
          }
          if (isMobile) {
            if (!prevEl.settings._margin_mobile && prevEl.settings._margin) {
              prevEl.settings._margin_mobile = { ...prevEl.settings._margin };
            }
            if (prevEl.settings?._margin_mobile) {
              prevEl.settings._margin_mobile.bottom = remainingBottom;
              prevEl.settings._margin_mobile.isLinked = false;
            }
            if (prevEl.settings?.margin_mobile) {
              prevEl.settings.margin_mobile.bottom = remainingBottom;
              prevEl.settings.margin_mobile.isLinked = false;
            }
          }
        }
        if (currMarginTop > 0 && (isCurrApproxGap || isSumApproxGap || isExceedingGt)) {
          if (!isTablet && !isMobile) {
            if (currEl.settings?._margin) {
              currEl.settings._margin.top = '0';
              currEl.settings._margin.isLinked = false;
            }
            if (currEl.settings?.margin) {
              currEl.settings.margin.top = '0';
              currEl.settings.margin.isLinked = false;
            }
          }
          if (isTablet) {
            if (!currEl.settings._margin_tablet && currEl.settings._margin) {
              currEl.settings._margin_tablet = { ...currEl.settings._margin };
            }
            if (currEl.settings?._margin_tablet) {
              currEl.settings._margin_tablet.top = '0';
              currEl.settings._margin_tablet.isLinked = false;
            }
            if (currEl.settings?.margin_tablet) {
              currEl.settings.margin_tablet.top = '0';
              currEl.settings.margin_tablet.isLinked = false;
            }
          }
          if (isMobile) {
            if (!currEl.settings._margin_mobile && currEl.settings._margin) {
              currEl.settings._margin_mobile = { ...currEl.settings._margin };
            }
            if (currEl.settings?._margin_mobile) {
              currEl.settings._margin_mobile.top = '0';
              currEl.settings._margin_mobile.isLinked = false;
            }
            if (currEl.settings?.margin_mobile) {
              currEl.settings.margin_mobile.top = '0';
              currEl.settings.margin_mobile.isLinked = false;
            }
          }
        }
      }
    } else if (isRow) {
      let gtSpacing = null;
      if (prevGt?.rect && currGt?.rect) {
        gtSpacing = Math.max(0, Math.round(currGt.rect.x - (prevGt.rect.x + prevGt.rect.w)));
      }

      const prevMarginRight = isTablet
        ? parsePx(prevEl.settings?._margin_tablet?.right || prevEl.settings?.margin_tablet?.right || prevEl.settings?._margin?.right || prevEl.settings?.margin?.right)
        : isMobile
          ? parsePx(prevEl.settings?._margin_mobile?.right || prevEl.settings?.margin_mobile?.right || prevEl.settings?._margin?.right || prevEl.settings?.margin?.right)
          : parsePx(prevEl.settings?._margin?.right || prevEl.settings?.margin?.right);

      const currMarginLeft = isTablet
        ? parsePx(currEl.settings?._margin_tablet?.left || currEl.settings?.margin_tablet?.left || currEl.settings?._margin?.left || currEl.settings?.margin?.left)
        : isMobile
          ? parsePx(currEl.settings?._margin_mobile?.left || currEl.settings?.margin_mobile?.left || currEl.settings?._margin?.left || currEl.settings?.margin?.left)
          : parsePx(currEl.settings?._margin?.left || currEl.settings?.margin?.left);

      const sumMargin = prevMarginRight + currMarginLeft;

      const isPrevApproxGap = prevMarginRight > 0 && Math.abs(prevMarginRight - gapVal) < 4;
      const isCurrApproxGap = currMarginLeft > 0 && Math.abs(currMarginLeft - gapVal) < 4;
      const isSumApproxGap = sumMargin > 0 && Math.abs(sumMargin - gapVal) < 4;
      const isExceedingGt = gtSpacing !== null && ((gapVal + sumMargin) > (gtSpacing + 2));

      if (isPrevApproxGap || isCurrApproxGap || isSumApproxGap || isExceedingGt) {
        if (prevMarginRight > 0 && (isPrevApproxGap || isSumApproxGap || isExceedingGt)) {
          const isDecor = Boolean(prevEl.widgetType === 'icon' || prevEl.settings?._icon_decor || prevEl.settings?._decor);
          const remainingRight = (isDecor && gtSpacing !== null && gtSpacing > gapVal)
            ? String(Math.round(gtSpacing - gapVal))
            : '0';
          if (!isTablet && !isMobile) {
            if (prevEl.settings?._margin) {
              prevEl.settings._margin.right = remainingRight;
              prevEl.settings._margin.isLinked = false;
            }
            if (prevEl.settings?.margin) {
              prevEl.settings.margin.right = remainingRight;
              prevEl.settings.margin.isLinked = false;
            }
          }
          if (isTablet) {
            if (!prevEl.settings._margin_tablet && prevEl.settings._margin) {
              prevEl.settings._margin_tablet = { ...prevEl.settings._margin };
            }
            if (prevEl.settings?._margin_tablet) {
              prevEl.settings._margin_tablet.right = remainingRight;
              prevEl.settings._margin_tablet.isLinked = false;
            }
            if (prevEl.settings?.margin_tablet) {
              prevEl.settings.margin_tablet.right = remainingRight;
              prevEl.settings.margin_tablet.isLinked = false;
            }
          }
          if (isMobile) {
            if (!prevEl.settings._margin_mobile && prevEl.settings._margin) {
              prevEl.settings._margin_mobile = { ...prevEl.settings._margin };
            }
            if (prevEl.settings?._margin_mobile) {
              prevEl.settings._margin_mobile.right = remainingRight;
              prevEl.settings._margin_mobile.isLinked = false;
            }
            if (prevEl.settings?.margin_mobile) {
              prevEl.settings.margin_mobile.right = remainingRight;
              prevEl.settings.margin_mobile.isLinked = false;
            }
          }
        }
        if (currMarginLeft > 0 && (isCurrApproxGap || isSumApproxGap || isExceedingGt)) {
          if (!isTablet && !isMobile) {
            if (currEl.settings?._margin) {
              currEl.settings._margin.left = '0';
              currEl.settings._margin.isLinked = false;
            }
            if (currEl.settings?.margin) {
              currEl.settings.margin.left = '0';
              currEl.settings.margin.isLinked = false;
            }
          }
          if (isTablet) {
            if (!currEl.settings._margin_tablet && currEl.settings._margin) {
              currEl.settings._margin_tablet = { ...currEl.settings._margin };
            }
            if (currEl.settings?._margin_tablet) {
              currEl.settings._margin_tablet.left = '0';
              currEl.settings._margin_tablet.isLinked = false;
            }
            if (currEl.settings?.margin_tablet) {
              currEl.settings.margin_tablet.left = '0';
              currEl.settings.margin_tablet.isLinked = false;
            }
          }
          if (isMobile) {
            if (!currEl.settings._margin_mobile && currEl.settings._margin) {
              currEl.settings._margin_mobile = { ...currEl.settings._margin };
            }
            if (currEl.settings?._margin_mobile) {
              currEl.settings._margin_mobile.left = '0';
              currEl.settings._margin_mobile.isLinked = false;
            }
            if (currEl.settings?.margin_mobile) {
              currEl.settings.margin_mobile.left = '0';
              currEl.settings.margin_mobile.isLinked = false;
            }
          }
        }
      }
    }
  }
}

/**
 * Task M7: Universal Card Flush Media Detection
 * Detects containers where media (image or single-child media wrapper) is flush
 * to the card's top and side edges (img width >= card inner width, img.y == card.y).
 */
function detectCardFlushMedia(node, parentNode, childNodes, gt, snapshot, viewport) {
  if (!node || !gt || !gt.rect || gt.rect.w <= 0 || gt.rect.h <= 0) return null;
  if (!childNodes || childNodes.length < 2) return null;

  const tag = (node.tagName || '').toLowerCase();
  if (['html', 'body', 'root', 'main', 'section'].includes(tag)) return null;

  // Top-level full-width sections (> 1000px direct child of body/root) are page sections, not cards
  if (!parentNode || ['root', 'body'].includes(parentNode.tagName?.toLowerCase())) {
    if (gt.rect.w >= 1000) return null;
  }

  const child0 = childNodes[0];
  const child0Gt = gtFor(child0, viewport, snapshot);
  if (!child0Gt || !child0Gt.rect) return null;

  const isChild0Img = child0.tagName?.toLowerCase() === 'img' || detectNodeRole(child0, child0Gt) === 'image';
  const isChild0MediaContainer = detectNodeRole(child0, child0Gt) === 'container' &&
    (child0.children || []).some(c => {
      if (c.tagName?.toLowerCase() === 'img') return true;
      const cGt = gtFor(c, viewport, snapshot);
      return Boolean(cGt && detectNodeRole(c, cGt) === 'image');
    });

  if (!isChild0Img && !isChild0MediaContainer) return null;

  const imgNode = isChild0Img
    ? child0
    : (child0.children || []).find(c => {
        if (c.tagName?.toLowerCase() === 'img') return true;
        const cGt = gtFor(c, viewport, snapshot);
        return Boolean(cGt && detectNodeRole(c, cGt) === 'image');
      });
  const imgGt = imgNode ? gtFor(imgNode, viewport, snapshot) : null;
  if (!imgGt || !imgGt.rect || imgGt.rect.w <= 0 || imgGt.rect.h <= 0) return null;

  const cardW = gt.rect.w;
  const cardH = gt.rect.h;
  const imgW = imgGt.rect.w;
  const imgH = imgGt.rect.h;

  // Flush geometry assertions:
  // 1. Image width matches card width (>= 92% of card width or within 8px)
  const isWidthFlush = (imgW >= cardW - 8) || (imgW / cardW >= 0.92);
  // 2. Horizontal alignment: image left is aligned with card left (within 6px)
  const isXFlush = Math.abs(imgGt.rect.x - gt.rect.x) <= 6;
  // 3. Top alignment: image top is aligned with card top (within 6px)
  const isTopFlush = Math.abs(imgGt.rect.y - gt.rect.y) <= 6;

  if (!isWidthFlush || !isXFlush || !isTopFlush) return null;

  const remainingChildren = childNodes.slice(1);
  if (remainingChildren.length === 0) return null;

  const rem0Gt = gtFor(remainingChildren[0], viewport, snapshot);
  const isAlreadySplit = isChild0MediaContainer && remainingChildren.length === 1 &&
    Boolean(rem0Gt && detectNodeRole(remainingChildren[0], rem0Gt) === 'container');

  return {
    isFlushCard: true,
    isAlreadySplit,
    isChild0Img,
    isChild0MediaContainer,
    child0,
    imgNode,
    imgGt,
    remainingChildren
  };
}

/**
 * F7: Equal-Height Rows detection.
 * Identifies child nodes in a flex row whose GT heights are equal within +/- 4px.
 */
function detectEqualHeightRowChildIndices(childNodes, snapshot, viewport) {
  const items = [];
  for (let idx = 0; idx < childNodes.length; idx++) {
    const c = childNodes[idx];
    const cGt = gtFor(c, viewport, snapshot);
    if (cGt && cGt.rect && cGt.rect.h > 0) {
      // G4: Restrict F7 equal-height row detection to structural containers only (exclude atomic widgets)
      const role = detectNodeRole(c, cGt);
      if (role !== 'container') continue;
      items.push({ idx, node: c, gt: cGt, rect: cGt.rect });
    }
  }

  if (items.length < 2) return new Set();

  const equalHeightIndices = new Set();
  const visualRows = [];

  for (const item of items) {
    const r = item.rect;
    let matchedRow = null;

    for (const vRow of visualRows) {
      const avgY = vRow.reduce((sum, el) => sum + el.rect.y, 0) / vRow.length;
      const avgH = vRow.reduce((sum, el) => sum + el.rect.h, 0) / vRow.length;
      const overlapY = Math.max(0, Math.min(r.y + r.h, avgY + avgH) - Math.max(r.y, avgY));
      const minH = Math.min(r.h, avgH);
      if (minH > 0 && (overlapY / minH) >= 0.45) {
        matchedRow = vRow;
        break;
      }
    }

    if (matchedRow) {
      matchedRow.push(item);
    } else {
      visualRows.push([item]);
    }
  }

  for (const vRow of visualRows) {
    if (vRow.length >= 2) {
      const heights = vRow.map(el => el.rect.h);
      const maxH = Math.max(...heights);
      const minH = Math.min(...heights);
      // Mutasawiya within +/- 4px
      if (maxH - minH <= 4) {
        for (const el of vRow) {
          equalHeightIndices.add(el.idx);
        }
      }
    }
  }

  return equalHeightIndices;
}

/**
 * Task K4: Universal Inline Mixed-Content AST Consolidation.
 * Identifies sequences of inline text, glyphs, bullets, and icons that sit on the same
 * horizontal line (e.g. card-meta "Category • 5 Min Read") to consolidate them into
 * a single text-editor widget with inline spans instead of splitting into separate widgets.
 */
const INLINE_TAGS = new Set(['span', 'i', 'b', 'strong', 'em', 'small', 'a', 'label', 'code', 'sub', 'sup', '#text']);
const BLOCK_TAGS = new Set([
  'div', 'section', 'article', 'header', 'footer', 'aside', 'nav', 'main',
  'form', 'ul', 'ol', 'li', 'table', 'img', 'video', 'iframe', 'blockquote',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'button', 'input', 'select', 'textarea'
]);

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function detectInlineMixedContentSequence(childNodes, parentNode, parentGt, snapshot, viewport) {
  if (!childNodes || childNodes.length < 2) return false;

  const validChildren = childNodes.filter(c => c.tagName !== '#text' || (c.textContent || '').trim().length > 0);
  if (validChildren.length < 2) return false;

  for (const c of validChildren) {
    const tag = (c.tagName || '').toLowerCase();
    if (BLOCK_TAGS.has(tag)) return false;
    if (!INLINE_TAGS.has(tag) && tag !== '#text') return false;
    if (c.children && c.children.some(cc => BLOCK_TAGS.has((cc.tagName || '').toLowerCase()))) {
      return false;
    }
  }

  const childGts = validChildren.map(c => gtFor(c, viewport, snapshot)).filter(Boolean);
  if (childGts.length < validChildren.length) return false;

  const firstY = childGts[0].rect.y;
  const isSameY = childGts.every(cg => Math.abs(cg.rect.y - firstY) <= 12);
  const isSingleLineH = childGts.every(cg => cg.rect.h <= 48);
  const parentH = parentGt?.rect?.h || 0;
  const isParentSingleLine = parentH <= 60;

  return Boolean(isSameY && isSingleLineH && isParentSingleLine);
}

function buildConsolidatedInlineTextWidget(childNodes, parentNode, parentGt, parentStyles, snapshot, viewport, options) {
  const validChildren = childNodes.filter(c => c.tagName !== '#text' || (c.textContent || '').trim().length > 0);
  const child0Gt = gtFor(validChildren[0], viewport, snapshot);
  const styles = child0Gt?.styles || parentStyles || {};

  const parentSid = parentGt?.sid || parentNode.attributes?.['data-sid'] || parentNode.attributes?.['data-dom-id'] || parentNode._sid || 'meta';
  const widgetSid = `${parentSid}-inline`;

  const textSettings = {
    _sid: widgetSid,
    _dom_id: widgetSid
  };

  // 1. Color
  const colorHex = normalizeColor(styles.color || parentStyles.color);
  if (colorHex && colorHex !== 'transparent') {
    textSettings.text_color = colorHex;
  }

  // 2. Typography
  const fontFamily = extractFontFamily(styles.fontFamily || parentStyles.fontFamily);
  if (fontFamily) {
    textSettings.typography_typography = 'custom';
    textSettings.typography_font_family = fontFamily;
  }
  const fontSize = Math.round(parsePx(styles.fontSize || parentStyles.fontSize));
  if (fontSize >= 8) {
    textSettings.typography_typography = 'custom';
    textSettings.typography_font_size = { unit: 'px', size: fontSize };
  }
  const fontWeight = styles.fontWeight || parentStyles.fontWeight;
  if (fontWeight && fontWeight !== 'normal') {
    textSettings.typography_typography = 'custom';
    textSettings.typography_font_weight = String(fontWeight);
  }
  const lineHeight = parsePx(styles.lineHeight || parentStyles.lineHeight);
  let computedLineHeight = 1.6;
  if (lineHeight > 0 && fontSize > 0) {
    computedLineHeight = Math.round((lineHeight / fontSize) * 10) / 10;
    textSettings.typography_typography = 'custom';
    textSettings.typography_line_height = {
      unit: 'em',
      size: computedLineHeight
    };
  } else if (styles.lineHeight && !isNaN(parseFloat(styles.lineHeight))) {
    computedLineHeight = parseFloat(styles.lineHeight);
  }
  const textTransform = styles.textTransform || parentStyles.textTransform;
  if (textTransform && textTransform !== 'none') {
    textSettings.typography_typography = 'custom';
    textSettings.typography_text_transform = textTransform;
  }
  const letterSpacing = parsePx(styles.letterSpacing || parentStyles.letterSpacing);
  if (letterSpacing !== 0 && !isNaN(letterSpacing)) {
    textSettings.typography_typography = 'custom';
    textSettings.typography_letter_spacing = {
      unit: 'px',
      size: Math.round(letterSpacing * 100) / 100
    };
  }

  // Responsive Typography
  const gtTablet = gtFor(parentNode, 'tablet', snapshot) || gtFor(validChildren[0], 'tablet', snapshot);
  if (gtTablet) {
    const fsTab = Math.round(parsePx(gtTablet.styles?.fontSize));
    if (fsTab > 0 && fsTab !== fontSize) {
      textSettings.typography_font_size_tablet = { unit: 'px', size: fsTab };
    }
  }
  const gtMobile = gtFor(parentNode, 'mobile', snapshot) || gtFor(validChildren[0], 'mobile', snapshot);
  if (gtMobile) {
    const fsMob = Math.round(parsePx(gtMobile.styles?.fontSize));
    if (fsMob > 0 && fsMob !== fontSize) {
      textSettings.typography_font_size_mobile = { unit: 'px', size: fsMob };
    }
  }

  // 3. Flex and Gap from GT styles
  const computedGapPx = parsePx(parentStyles.columnGap || parentStyles.gap || parentStyles['column-gap'] || parentStyles['row-gap']) || 0;
  const isFlex = parentStyles.display === 'flex' || parentStyles.display === 'inline-flex';

  // 4. Build inner spans HTML
  const spanParts = [];
  for (let i = 0; i < validChildren.length; i++) {
    const c = validChildren[i];
    const cGt = gtFor(c, viewport, snapshot);
    const cSid = cGt?.sid || c.attributes?.['data-sid'] || c.attributes?.['data-dom-id'] || c._sid || null;
    if (cSid && options.assignedSids) {
      options.assignedSids.add(cSid);
    }
    const cText = (cGt?.directText || cGt?.fullText || c.textContent || '').trim();
    const cClasses = [
      c.className || c.attributes?.class || '',
      cSid ? `e-${cSid}` : ''
    ].filter(Boolean).join(' ');

    const sidAttr = cSid ? ` data-sid="${cSid}"` : '';
    const classAttr = cClasses ? ` class="${cClasses}"` : '';
    const tag = (c.tagName || 'span').toLowerCase();

    spanParts.push(`<${tag}${sidAttr}${classAttr}>${escapeHtml(cText)}</${tag}>`);
  }

  const gapCss = computedGapPx > 0 ? ` gap: ${computedGapPx}px;` : '';
  const displayFlexCss = (isFlex || computedGapPx > 0) ? ` display: flex; align-items: center;` : '';
  textSettings.editor = `<p style="margin: 0; line-height: ${computedLineHeight};${displayFlexCss}${gapCss}">${spanParts.join('')}</p>`;

  return createTextEditorWidget(textSettings);
}

/**
 * Maps a single DOM AST node and its subtree to Elementor JSON.
 */
function isRelativeUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  return !/^(?:https?:|\/\/|data:|blob:)/i.test(trimmed);
}

function resolveAssetUrl(url, options = {}) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (!isRelativeUrl(trimmed)) return trimmed;

  if (options.assetsBase) {
    const base = options.assetsBase.endsWith('/') ? options.assetsBase : options.assetsBase + '/';
    const clean = trimmed.replace(/^\.?\//, '');
    return base + clean;
  }

  if (options.unresolvedAssets) {
    options.unresolvedAssets.push(trimmed);
  }
  return trimmed;
}

function extractSingleImageUrl(bgImageStr) {
  if (!bgImageStr || typeof bgImageStr !== 'string') return null;
  const s = bgImageStr.trim();
  if (!s || s === 'none') return null;

  // Double-quoted URL: url("...")
  const doubleMatch = s.match(/^url\(\s*"((?:[^"\\]|\\.)*)"\s*\)$/i);
  if (doubleMatch) {
    const url = doubleMatch[1].trim();
    return url.length > 0 ? url : null;
  }

  // Single-quoted URL: url('...')
  const singleMatch = s.match(/^url\(\s*'((?:[^'\\]|\\.)*)'\s*\)$/i);
  if (singleMatch) {
    const url = singleMatch[1].trim();
    return url.length > 0 ? url : null;
  }

  // Unquoted URL: url(...) without quotes, commas, parens, or whitespace
  const unquotedMatch = s.match(/^url\(\s*([^\s'"(),]+)\s*\)$/i);
  if (unquotedMatch) {
    const url = unquotedMatch[1].trim();
    return url.length > 0 ? url : null;
  }

  return null;
}

function mapNodeToElementor(node, parentNode, snapshot, viewport = 'desktop', options = {}) {
  if (!node) return null;

  // Handle synthetic root AST node
  if (node.tagName === 'root') {
    const validChildren = (node.children || []).filter(c => c.tagName !== '#text' || (c.textContent || '').trim().length > 0);
    if (validChildren.length === 1) {
      return mapNodeToElementor(validChildren[0], null, snapshot, viewport, options);
    }
    const elements = [];
    const rootPairs = [];
    for (const c of validChildren) {
      const el = mapNodeToElementor(c, node, snapshot, viewport, options);
      if (el) {
        elements.push(el);
        rootPairs.push({ element: el, node: c });
      }
    }
    const rootSettings = {
      direction: 'column',
      flex_direction: 'column',
      elements
    };
    deduplicateContainerChildSpacing(rootSettings, rootPairs, snapshot, viewport);
    return createContainer(rootSettings);
  }

  // Skip comments and non-visual elements
  if (node.tagName === '#text') {
    const text = (node.textContent || '').trim();
    if (!text) return null;
    return createHeadingWidget({
      title: text,
      header_size: 'span'
    });
  }

  const gt = gtFor(node, viewport, snapshot);
  if (!gt) return null;

  const styles = gt.styles || {};
  const rect = gt.rect;
  let sid = gt.sid || node.attributes?.['data-sid'] || node.attributes?.['data-dom-id'] || node.attrs?.['data-sid'] || node.attrs?.['data-dom-id'] || node._sid || null;

  // Disambiguate duplicate SIDs to enforce strict uniqueness across Elementor tree
  if (!options.assignedSids) options.assignedSids = new Set();
  if (sid) {
    if (options.assignedSids.has(sid)) {
      let suffix = 2;
      while (options.assignedSids.has(`${sid}-dup-${suffix}`)) {
        suffix++;
      }
      sid = `${sid}-dup-${suffix}`;
    }
    options.assignedSids.add(sid);
  }

  // Skip completely zero-dimension elements that are not interactive inputs or pseudo-content nodes
  const hasPseudo = hasActivePseudoContent(gt);
  if (rect.w === 0 && rect.h === 0 && !['input', 'select'].includes(node.tagName) && !hasPseudo) {
    return null;
  }

  const role = detectNodeRole(node, gt);
  const elementId = generateId();

  // Common Elementor metadata
  const commonMeta = {
    _sid: sid,
    _dom_id: sid
  };
  if (node.id || node.attributes?.id) {
    commonMeta._element_id = String(node.id || node.attributes?.id);
  }

  // F5 & M11: Mandatory css_classes retention & Class Injection Engine
  const classCandidates = [
    typeof node.className === 'string' ? node.className : '',
    node.attributes?.class || node.attributes?.className || '',
    gt.className || ''
  ];
  const cleanClasses = Array.from(new Set(classCandidates.join(' ').split(/\s+/).filter(Boolean))).join(' ');

  // M11: If element lacks a specific structural class (or has only layout classes), inject deterministic class e-sid-${sid}
  const structural = getStructuralClasses({ className: cleanClasses });
  let finalClasses = cleanClasses;
  if (structural.length === 0 && sid) {
    const cleanSid = String(sid).replace(/^sid-/, '');
    const deterministicClass = `e-sid-${cleanSid}`;
    finalClasses = Array.from(new Set([cleanClasses, deterministicClass].filter(Boolean).join(' ').split(/\s+/).filter(Boolean))).join(' ');
  }

  if (finalClasses) {
    commonMeta.css_classes = finalClasses;
    commonMeta._css_classes = finalClasses;
  }
  if (hasPseudo) {
    commonMeta._has_pseudo = true;
  }

  // Task M1: Micro-embed widgets receive GT geometry: percent width of parent (A1 contract), min-height where GT height > 0
  const isMicroEmbedRole = ['pseudo_html', 'composite_control', 'svg_html', 'micro_input'].includes(role);
  if (isMicroEmbedRole) {
    const parentGt = parentNode ? gtFor(parentNode, viewport, snapshot) : null;
    let pctWidth = 100;
    if (parentGt && parentGt.rect && parentGt.rect.w > 0 && gt.rect && gt.rect.w > 0) {
      pctWidth = Math.min(100, Math.round((gt.rect.w / parentGt.rect.w) * 100 * 10) / 10);
    }
    commonMeta.width = { unit: '%', size: pctWidth };
    commonMeta._flex_size = 'none';
    if (gt.rect && gt.rect.h > 0) {
      commonMeta.min_height = { unit: 'px', size: Math.round(gt.rect.h) };
    }
  }

  switch (role) {
    case 'pseudo_html': {
      let rawHtml = node.rawHtml;
      if (!rawHtml) {
        const clsAttr = node.className ? ` class="${node.className}"` : '';
        const idAttr = node.id ? ` id="${node.id}"` : '';
        const innerText = gt.directText || gt.fullText || '';
        rawHtml = `<${node.tagName}${idAttr}${clsAttr}>${innerText}</${node.tagName}>`;
      }
      return createHtmlWidget({
        ...commonMeta,
        html: rawHtml,
        _html_reason: 'NON_ELEMENTOR_PRIMITIVE:pseudo-content'
      });
    }

    case 'composite_control': {
      let rawHtml = node.rawHtml;
      if (!rawHtml) {
        rawHtml = serializeDomNodeToHtml(node);
      }
      if (rawHtml) {
        if (!rawHtml.includes('composite-trigger')) {
          if (/class=["']/.test(rawHtml)) {
            rawHtml = rawHtml.replace(/class=["']([^"']*)["']/, 'class="$1 composite-trigger"');
          } else {
            rawHtml = rawHtml.replace(/^<([a-zA-Z0-9_-]+)/, '<$1 class="composite-trigger"');
          }
        }
      }

      // Task G2: Extract GT computed styles for composite micro-embed scoped reset
      let bgStr = 'transparent';
      if (styles.backgroundColor && styles.backgroundColor !== 'transparent' && styles.backgroundColor !== 'rgba(0, 0, 0, 0)') {
        bgStr = normalizeColor(styles.backgroundColor);
      } else if (styles.background && styles.background !== 'none' && styles.background !== 'transparent') {
        bgStr = styles.background;
      } else if (styles.backgroundImage && styles.backgroundImage !== 'none') {
        bgStr = styles.backgroundImage;
      }

      let borderStr = 'none';
      if (styles.border && styles.border !== 'none' && !styles.border.startsWith('0px')) {
        borderStr = styles.border;
      } else if (hasAnyBorder(styles)) {
        const topW = parsePx(styles.borderTopWidth);
        const rightW = parsePx(styles.borderRightWidth);
        const bottomW = parsePx(styles.borderBottomWidth);
        const leftW = parsePx(styles.borderLeftWidth);
        const bWidth = (topW === rightW && rightW === bottomW && bottomW === leftW)
          ? `${topW}px`
          : `${topW}px ${rightW}px ${bottomW}px ${leftW}px`;
        const bStyle = styles.borderTopStyle || styles.borderStyle || 'solid';
        const bColor = normalizeColor(styles.borderTopColor || styles.borderColor || '#000000');
        borderStr = `${bWidth} ${bStyle} ${bColor}`;
      }

      const colorStr = (styles.color && styles.color !== 'transparent')
        ? normalizeColor(styles.color)
        : 'inherit';

      let padStr = '0px';
      const topP = parsePx(styles.paddingTop);
      const rightP = parsePx(styles.paddingRight);
      const bottomP = parsePx(styles.paddingBottom);
      const leftP = parsePx(styles.paddingLeft);
      if (topP > 0 || rightP > 0 || bottomP > 0 || leftP > 0) {
        if (topP === bottomP && rightP === leftP) {
          padStr = topP === rightP ? `${topP}px` : `${topP}px ${rightP}px`;
        } else {
          padStr = `${topP}px ${rightP}px ${bottomP}px ${leftP}px`;
        }
      } else if (styles.padding && styles.padding !== '0px') {
        padStr = styles.padding;
      }

      const justifyStr = styles.justifyContent || 'space-between';

      let radiusStr = '0px';
      if (hasAnyBorderRadius(styles)) {
        const tl = parsePx(styles.borderTopLeftRadius);
        const tr = parsePx(styles.borderTopRightRadius);
        const br = parsePx(styles.borderBottomRightRadius);
        const bl = parsePx(styles.borderBottomLeftRadius);
        if (tl === tr && tr === br && br === bl) {
          radiusStr = `${tl}px`;
        } else {
          radiusStr = `${tl}px ${tr}px ${br}px ${bl}px`;
        }
      }

      const compositeReset = {
        background: bgStr,
        border: borderStr,
        color: colorStr,
        padding: padStr,
        justifyContent: justifyStr,
        borderRadius: radiusStr
      };

      const compositeWidget = createHtmlWidget({
        ...commonMeta,
        html: rawHtml,
        _html_reason: 'NON_ELEMENTOR_PRIMITIVE:composite-control',
        _composite_reset: compositeReset
      });

      // Task G2 & M11: Scoped CSS reset targeting semantic scope with !important to beat WP theme button styles
      if (options.atomicRules && Array.isArray(options.atomicRules)) {
        const scope = resolveElementSelector(compositeWidget, sid);
        pushAtomicRule(
          options,
          `${scope} button,\n` +
          `${scope} .composite-trigger {\n` +
          `  appearance: none !important;\n` +
          `  background: ${bgStr} !important;\n` +
          `  border: ${borderStr} !important;\n` +
          `  color: ${colorStr} !important;\n` +
          `  padding: ${padStr} !important;\n` +
          `  width: 100%;\n` +
          `  display: flex;\n` +
          `  align-items: center;\n` +
          `  justify-content: ${justifyStr} !important;\n` +
          `  font: inherit;\n` +
          `  cursor: pointer;\n` +
          `  border-radius: ${radiusStr} !important;\n` +
          `}`
        );
      }

      return compositeWidget;
    }

    case 'image': {
      let src = node.attributes?.src || (gt.assets && gt.assets[0]?.src) || '';
      if (!src && styles.backgroundImage && styles.backgroundImage.includes('url(')) {
        const m = styles.backgroundImage.match(/url\(['"]?([^'"]+)['"]?\)/);
        if (m) src = m[1];
      }
      src = resolveAssetUrl(src, options);
      const imgSettings = {
        ...commonMeta,
        url: src,
        image: { url: src, id: '' },
        width: { unit: '%', size: 100 }
      };
      const parentGt = parentNode ? gtFor(parentNode, viewport, snapshot) : null;
      const parentH = parentGt ? (parsePx(parentGt.styles?.height) || parentGt.rect?.h || 0) : 0;

      if (hasAnyBorderRadius(styles)) {
        imgSettings.border_radius = formatRadiusFromStyles(styles);
      } else {
        const ancestorNodes = options.ancestorNodes || (parentNode ? [parentNode] : []);
        let topRadiusGt = null;
        for (let i = ancestorNodes.length - 1; i >= 0; i--) {
          const anc = ancestorNodes[i];
          const ancGt = gtFor(anc, viewport, snapshot);
          if (ancGt && hasAnyBorderRadius(ancGt.styles)) {
            if (Math.abs((gt.rect?.y || 0) - (ancGt.rect?.y || 0)) <= 8) {
              topRadiusGt = ancGt;
              break;
            }
          }
        }
        if (topRadiusGt) {
          const tl = parsePx(topRadiusGt.styles.borderTopLeftRadius);
          const tr = parsePx(topRadiusGt.styles.borderTopRightRadius);
          if (tl > 0 || tr > 0) {
            imgSettings.border_radius = {
              unit: 'px',
              top: String(tl),
              right: String(tr),
              bottom: '0',
              left: '0',
              isLinked: false
            };
          }
        }
      }
      const imgBorder = resolveBorderSettings(styles);
      if (imgBorder) {
        Object.assign(imgSettings, imgBorder);
      }
      const imgWidget = createImageWidget(imgSettings);

      // F8: E5 Reinforcement — Universal Image Fill Parity
      // Apply cover fill rule whenever GT objectFit === 'cover' OR height === '100%'
      // — without requiring rect ≈ parentH.
      // ZERO max-height cap (eliminates image collapse). Full selector chain.
      const hasPxHeight = typeof styles.height === 'string' && styles.height.endsWith('px');
      const hasPxMinHeight = typeof styles.minHeight === 'string' && styles.minHeight.endsWith('px');
      const imgH = Math.round(
        (gt.rect && gt.rect.h > 0)
          ? gt.rect.h
          : (hasPxHeight ? parsePx(styles.height) : (hasPxMinHeight ? parsePx(styles.minHeight) : 0))
      );
      const hasCoverFit = styles.objectFit === 'cover' ||
        styles.height === '100%' ||
        (typeof styles.height === 'string' && styles.height.trim() === '100%');
      const fillsContainerHeight = parentH > 40 && imgH > 40 && Math.abs(imgH - parentH) <= Math.max(24, parentH * 0.15);

      if (hasCoverFit || fillsContainerHeight) {
        imgWidget.settings._hero_cover_fill = true;
        const effectiveMinH = imgH > 0 ? imgH : (parentH > 0 ? parentH : 0);
        if (effectiveMinH > 0) {
          imgWidget.settings._img_height = effectiveMinH;
        }
        if (options.atomicRules && Array.isArray(options.atomicRules)) {
          const scope = resolveElementSelector(imgWidget, sid);
          const minHLine = effectiveMinH > 0 ? `  min-height: ${effectiveMinH}px !important;\n` : '';
          pushAtomicRule(
            options,
            `${scope},\n` +
            `${scope} .elementor-widget-image,\n` +
            `${scope} .elementor-widget-container,\n` +
            `${scope} .elementor-widget-container img,\n` +
            `${scope} img {\n` +
            `  width: 100% !important;\n` +
            `  height: 100% !important;\n` +
            minHLine +
            `  object-fit: cover !important;\n` +
            `}`
          );
        }
      } else {
        // Task K6: Non-cover image aspect ratio preservation
        const imgW = Math.round(gt.rect?.w || parsePx(styles.width) || 0);
        if (imgW > 0 && parentGt?.rect?.w && imgW < parentGt.rect.w * 0.9) {
          imgWidget.settings.width = { unit: 'px', size: imgW };
          imgWidget.settings._element_width = 'auto';
        }
        if (styles.objectFit === 'contain') {
          imgWidget.settings._img_contain = true;
          if (options.atomicRules && Array.isArray(options.atomicRules)) {
            const scope = resolveElementSelector(imgWidget, sid);
            pushAtomicRule(
              options,
              `${scope} img {\n` +
              `  object-fit: contain !important;\n` +
              `  height: auto !important;\n` +
              `}`
            );
          }
        }
      }

      return imgWidget;
    }

    case 'button': {
      const btnText = gt.directText || gt.fullText || 'Click Here';
      const rawBg = readComputedCssProperty(gt, snapshot, viewport, 'background-color', 'backgroundColor');
      const rawColor = readComputedCssProperty(gt, snapshot, viewport, 'color', 'color');

      const btnSettings = {
        ...commonMeta,
        text: btnText,
        link: node.attributes?.href || '#',
        size: 'sm'
      };

      if (rawBg) {
        btnSettings.background_color = rawBg;
      }
      if (rawColor) {
        btnSettings.button_text_color = rawColor;
      }

      const pad = formatPaddingFromStyles(styles);
      btnSettings.button_padding = pad;
      btnSettings._padding = pad;

      const radiusDecision = resolveComputedRadius(gt, snapshot, viewport);
      if (radiusDecision.mode === 'native') {
        btnSettings.border_radius = radiusDecision.setting;
      } else if (radiusDecision.mode === 'css') {
        delete btnSettings.border_radius;
        btnSettings._radius_route = 'css';
      } else {
        btnSettings.border_radius = { unit: 'px', top: '0', right: '0', bottom: '0', left: '0', isLinked: true };
      }
      const colGap = parsePx(styles.columnGap || styles.gap);
      const rowGap = parsePx(styles.rowGap || styles.gap);
      if (colGap > 0 || rowGap > 0) {
        const gapVal = colGap || rowGap;
        btnSettings.gap = { unit: 'px', size: gapVal, column: colGap, row: rowGap, isLinked: Boolean(colGap === rowGap) };
        btnSettings.flex_gap = { unit: 'px', size: gapVal, column: colGap, row: rowGap, isLinked: Boolean(colGap === rowGap) };
      }
      const btnBorder = resolveBorderSettings(styles);
      if (btnBorder) {
        Object.assign(btnSettings, btnBorder);
      }

      // Sizing Compensation & Universal Geometric Alignment (Task K9):
      // Directive 1: offsetX vs spaceRight (<=4px threshold) => left/center/right
      const parentGt = parentNode ? gtFor(parentNode, viewport, snapshot) : null;
      const parentPadLeft = parseFloat(parentGt?.styles?.paddingLeft) || 0;
      const parentPadRight = parseFloat(parentGt?.styles?.paddingRight) || 0;
      const contentBoxX = (parentGt?.rect?.x || 0) + parentPadLeft;
      const contentBoxW = Math.max(1, (parentGt?.rect?.w || 1200) - parentPadLeft - parentPadRight);
      const isFullWidth = (styles.display === 'block' || styles.display === 'flex') ||
        (rect.w >= contentBoxW * 0.85);

      if (isFullWidth) {
        btnSettings.align = 'justify';
        btnSettings._element_width = 'initial';
      } else if (parentGt && parentGt.rect?.w > 0 && rect.w > 0) {
        const offsetX = rect.x - contentBoxX;
        const spaceRight = contentBoxW - rect.w - offsetX;

        if (Math.abs(offsetX - spaceRight) <= 4 || Math.abs(rect.x + rect.w / 2 - (contentBoxX + contentBoxW / 2)) <= 12) {
          btnSettings.align = 'center';
        } else if (offsetX <= 4 || Math.abs(offsetX) <= 16) {
          btnSettings.align = 'left';
        } else if (spaceRight <= 4 || Math.abs(spaceRight) <= 16) {
          btnSettings.align = 'right';
        } else {
          btnSettings.align = styles.textAlign === 'center' ? 'center' : (styles.textAlign === 'right' ? 'right' : 'left');
        }
      } else {
        btnSettings.align = styles.textAlign === 'center' ? 'center' : (styles.textAlign === 'right' ? 'right' : 'left');
      }

      if (styles.fontFamily) {
        const family = extractFontFamily(styles.fontFamily);
        if (family) {
          const primaryFont = options.primaryFont || options.fontFamily || 'Inter';
          const resolvedFamily = (family.toLowerCase() === 'arial' && primaryFont && primaryFont.toLowerCase() !== 'arial')
            ? primaryFont
            : family;
          btnSettings.typography_typography = 'custom';
          btnSettings.typography_font_family = resolvedFamily;
        }
      }
      if (parsePx(styles.fontSize) >= 8) {
        btnSettings.typography_typography = 'custom';
        btnSettings.typography_font_size = { unit: 'px', size: Math.round(parsePx(styles.fontSize)) };
      }
      if (styles.fontWeight && styles.fontWeight !== 'normal') {
        btnSettings.typography_typography = 'custom';
        btnSettings.typography_font_weight = String(styles.fontWeight);
      }
      if (styles.letterSpacing && styles.letterSpacing !== 'normal') {
        const ls = parsePx(styles.letterSpacing);
        if (ls !== 0 && !isNaN(ls)) {
          btnSettings.typography_typography = 'custom';
          btnSettings.typography_letter_spacing = { unit: 'px', size: Math.round(ls * 100) / 100 };
        }
      }
      const btnMar = formatMarginFromStyles(styles);
      if (parsePx(btnMar.top) > 0 || parsePx(btnMar.right) > 0 || parsePx(btnMar.bottom) > 0 || parsePx(btnMar.left) > 0) {
        btnSettings._margin = btnMar;
      }

      // Pseudo hover capture
      if (gt.pseudo && gt.pseudo.hover) {
        if (gt.pseudo.hover.backgroundColor) btnSettings.button_background_hover_color = normalizeColor(gt.pseudo.hover.backgroundColor);
        if (gt.pseudo.hover.color) btnSettings.hover_color = normalizeColor(gt.pseudo.hover.color);
        if (gt.pseudo.hover.borderColor) btnSettings.button_hover_border_color = normalizeColor(gt.pseudo.hover.borderColor);
      }

      const btnWidget = createButtonWidget(btnSettings);
      if (radiusDecision.mode === 'css') {
        if (!options.atomicRules || !Array.isArray(options.atomicRules)) {
          const err = new Error(`[RADIUS_CSS_ROUTE_UNAVAILABLE] atomicRules array unavailable for CSS radius fallback on SID "${sid}"`);
          err.code = 'RADIUS_CSS_ROUTE_UNAVAILABLE';
          err.reason = 'RADIUS_CSS_ROUTE_UNAVAILABLE';
          err.sid = sid;
          throw err;
        }
        const scopedClass = ensureDeterministicClass(btnWidget, sid);
        const c = radiusDecision.corners;
        pushAtomicRule(
          options,
          `.${scopedClass} .elementor-button {\n` +
          `  border-top-left-radius: ${c.topLeft} !important;\n` +
          `  border-top-right-radius: ${c.topRight} !important;\n` +
          `  border-bottom-right-radius: ${c.bottomRight} !important;\n` +
          `  border-bottom-left-radius: ${c.bottomLeft} !important;\n` +
          `}`
        );
      }
      return btnWidget;
    }

    case 'heading': {
      const titleText = (node.children && node.children.length > 0)
        ? node.children.map(c => c.rawHtml || c.textContent || '').join('')
        : (gt.fullText || gt.directText || node.textContent || '');

      const headingSettings = {
        ...commonMeta,
        title: titleText.trim(),
        header_size: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(node.tagName) ? node.tagName : 'h3',
        align: styles.textAlign && ['left', 'center', 'right', 'justify'].includes(styles.textAlign) ? styles.textAlign : 'left'
      };

      const colorHex = normalizeColor(styles.color);
      const fillVal = styles.webkitTextFillColor || styles['-webkit-text-fill-color'] || '';
      const isFillTransparent = fillVal === 'transparent' || fillVal === 'rgba(0, 0, 0, 0)';
      const isColorTransparent = !colorHex || colorHex === 'transparent' || styles.color === 'transparent' || styles.color === 'rgba(0, 0, 0, 0)';
      const isTransparent = isFillTransparent || isColorTransparent;

      const clipVal = styles.webkitBackgroundClip || styles.backgroundClip || styles['-webkit-background-clip'] || styles['background-clip'] || '';
      const hasTextClip = clipVal.includes('text');
      const bgImage = (styles.backgroundImage && styles.backgroundImage !== 'none')
        ? styles.backgroundImage
        : (styles.background && styles.background !== 'none' ? styles.background : null);

      const isGradientAtomic = (isTransparent || hasTextClip) && Boolean(bgImage);

      if (isGradientAtomic) {
        // D1: Solid fallback color extracted from first gradient color stop
        const firstStopColor = normalizeColor(extractFirstGradientColor(bgImage));
        headingSettings.title_color = firstStopColor || (colorHex && !isColorTransparent ? colorHex : '#111827');
        headingSettings._atomic_gradient = {
          background: bgImage,
          clip: true
        };
      } else {
        const rawTitleColor = readComputedCssProperty(gt, snapshot, viewport, 'color', 'color');
        if (rawTitleColor) {
          headingSettings.title_color = rawTitleColor;
        } else if (colorHex && !isColorTransparent) {
          headingSettings.title_color = colorHex;
        } else {
          headingSettings.title_color = '#111827';
        }
      }

      if (styles.fontFamily) {
        const family = extractFontFamily(styles.fontFamily);
        if (family) {
          headingSettings.typography_typography = 'custom';
          headingSettings.typography_font_family = family;
        }
      }
      if (parsePx(styles.fontSize) >= 8) {
        headingSettings.typography_typography = 'custom';
        headingSettings.typography_font_size = { unit: 'px', size: Math.round(parsePx(styles.fontSize)) };
      }
      if (styles.fontWeight && styles.fontWeight !== 'normal') {
        headingSettings.typography_typography = 'custom';
        headingSettings.typography_font_weight = String(styles.fontWeight);
      }
      if (styles.lineHeight && parsePx(styles.lineHeight) > 0) {
        headingSettings.typography_typography = 'custom';
        headingSettings.typography_line_height = { unit: 'em', size: Math.round(parsePx(styles.lineHeight) / (parsePx(styles.fontSize) || 16) * 10) / 10 };
      }
      if (styles.letterSpacing && styles.letterSpacing !== 'normal') {
        const ls = parsePx(styles.letterSpacing);
        if (ls !== 0 && !isNaN(ls)) {
          headingSettings.typography_typography = 'custom';
          headingSettings.typography_letter_spacing = { unit: 'px', size: Math.round(ls * 100) / 100 };
        }
      }
      const headMar = formatMarginFromStyles(styles);
      if (parsePx(headMar.top) > 0 || parsePx(headMar.right) > 0 || parsePx(headMar.bottom) > 0 || parsePx(headMar.left) > 0) {
        headingSettings._margin = headMar;
      }

      // Task M3: Role-based decor protection for fixed-dimension circular/square markers & badges (aspect ~1:1, 24-84px) (RC-1)
      const parentGt = parentNode ? gtFor(parentNode, viewport, snapshot) : null;
      const decor = detectCircularOrSquareDecor(gt, styles, parentGt);

      if (decor) {
        headingSettings.width = { unit: 'px', size: decor.width };
        headingSettings._element_width = 'auto';
        headingSettings._flex_size = 'none';
        headingSettings.flex_shrink = 0;
        headingSettings.align_self = decor.alignSelf;
        headingSettings._flex_align_self = decor.alignSelf;
        headingSettings.max_height = { unit: 'px', size: decor.height };
        headingSettings.min_height = { unit: 'px', size: decor.height };

        if (decor.hasVisualBg) {
          headingSettings.background_background = 'classic';
          headingSettings.background_color = decor.background;
        }
        if (decor.isCircular) {
          headingSettings.border_radius = { unit: '%', top: '50', right: '50', bottom: '50', left: '50', isLinked: true };
        } else if (hasAnyBorderRadius(styles)) {
          headingSettings.border_radius = formatRadiusFromStyles(styles);
        }
        if (hasAnyBorder(styles)) {
          const b = resolveBorderSettings(styles);
          if (b) Object.assign(headingSettings, b);
        }
        headingSettings._padding = formatPaddingFromStyles(styles) || { unit: 'px', top: '0', right: '0', bottom: '0', left: '0', isLinked: true };
      } else {
        // Micro-component advanced box mapping (pills, badges, tags)
        const isPillOrBadge = rect.h <= 48 && (
          (styles.backgroundColor && styles.backgroundColor !== 'transparent' && styles.backgroundColor !== 'rgba(0, 0, 0, 0)') ||
          hasAnyBorder(styles) ||
          hasAnyBorderRadius(styles)
        );

        if (isPillOrBadge) {
          const bgHex = normalizeColor(styles.backgroundColor);
          if (bgHex && bgHex !== 'transparent') {
            headingSettings.background_background = 'classic';
            headingSettings.background_color = bgHex;
          }
          if (hasAnyBorderRadius(styles)) {
            headingSettings.border_radius = formatRadiusFromStyles(styles);
          }
          const pillBorder = resolveBorderSettings(styles);
          if (pillBorder) {
            Object.assign(headingSettings, pillBorder);
          }
          headingSettings._padding = formatPaddingFromStyles(styles);
        }

        if (styles.display === 'inline') {
          headingSettings._element_width = 'auto';
          headingSettings.align_self = 'flex-start';
          headingSettings._flex_align_self = 'flex-start';
        }
      }

      const headingWidget = createHeadingWidget(headingSettings);

      // Task M3 & M11: Scoped atomic chain reinforcement for decor markers (RC-1)
      if (decor && options.atomicRules && Array.isArray(options.atomicRules)) {
        const scope = resolveElementSelector(headingWidget, sid);
        const bRule = decor.border ? `  border: ${decor.border} !important;\n` : '';
        pushAtomicRule(
          options,
          `${scope},\n` +
          `${scope} .elementor-widget-container,\n` +
          `${scope} .elementor-heading-title {\n` +
          `  width: ${decor.width}px !important;\n` +
          `  height: ${decor.height}px !important;\n` +
          `  max-height: ${decor.height}px !important;\n` +
          `  flex-shrink: 0 !important;\n` +
          `  align-self: ${decor.alignSelf} !important;\n` +
          `  border-radius: ${decor.borderRadius} !important;\n` +
          `  background: ${decor.background} !important;\n` +
          bRule +
          `  display: flex !important;\n` +
          `  align-items: center !important;\n` +
          `  justify-content: center !important;\n` +
          `}`
        );
      }

      // D1 Atomicity & M11: Emit ONE atomic scoped rule into micro-CSS
      if (isGradientAtomic && options.atomicRules && Array.isArray(options.atomicRules)) {
        const scope = resolveElementSelector(headingWidget, sid);
        pushAtomicRule(
          options,
          `${scope} .elementor-heading-title {\n` +
          `  background-image: ${bgImage} !important;\n` +
          `  -webkit-background-clip: text !important;\n` +
          `  background-clip: text !important;\n` +
          `  -webkit-text-fill-color: transparent !important;\n` +
          `}`
        );
      }

      return headingWidget;
    }

    case 'text': {
      const editorHtml = (node.children && node.children.length > 0)
        ? node.children.map(c => c.rawHtml || c.textContent || '').join('')
        : (gt.fullText || gt.directText || node.textContent || '');

      const textSettings = {
        ...commonMeta,
        editor: `<p>${editorHtml.trim()}</p>`,
        align: styles.textAlign && ['left', 'center', 'right', 'justify'].includes(styles.textAlign) ? styles.textAlign : 'left'
      };

      const colorHex = normalizeColor(styles.color);
      const fillVal = styles.webkitTextFillColor || styles['-webkit-text-fill-color'] || '';
      const isFillTransparent = fillVal === 'transparent' || fillVal === 'rgba(0, 0, 0, 0)';
      const isColorTransparent = !colorHex || colorHex === 'transparent' || styles.color === 'transparent' || styles.color === 'rgba(0, 0, 0, 0)';
      const isTransparent = isFillTransparent || isColorTransparent;

      const clipVal = styles.webkitBackgroundClip || styles.backgroundClip || styles['-webkit-background-clip'] || styles['background-clip'] || '';
      const hasTextClip = clipVal.includes('text');
      const bgImage = (styles.backgroundImage && styles.backgroundImage !== 'none')
        ? styles.backgroundImage
        : (styles.background && styles.background !== 'none' ? styles.background : null);

      const isGradientAtomic = (isTransparent || hasTextClip) && Boolean(bgImage);

      if (isGradientAtomic) {
        const firstStopColor = normalizeColor(extractFirstGradientColor(bgImage));
        textSettings.text_color = firstStopColor || (colorHex && !isColorTransparent ? colorHex : '#111827');
      } else {
        const rawTextColor = readComputedCssProperty(gt, snapshot, viewport, 'color', 'color');
        if (rawTextColor) {
          textSettings.text_color = rawTextColor;
        } else if (colorHex && !isColorTransparent) {
          textSettings.text_color = colorHex;
        }
      }

      if (styles.fontFamily) {
        const family = extractFontFamily(styles.fontFamily);
        if (family) {
          textSettings.typography_typography = 'custom';
          textSettings.typography_font_family = family;
        }
      }
      if (parsePx(styles.fontSize) >= 8) {
        textSettings.typography_typography = 'custom';
        textSettings.typography_font_size = { unit: 'px', size: Math.round(parsePx(styles.fontSize)) };
      }
      if (styles.fontWeight && styles.fontWeight !== 'normal') {
        textSettings.typography_typography = 'custom';
        textSettings.typography_font_weight = String(styles.fontWeight);
      }
      if (styles.lineHeight && parsePx(styles.lineHeight) > 0) {
        textSettings.typography_typography = 'custom';
        textSettings.typography_line_height = { unit: 'em', size: Math.round(parsePx(styles.lineHeight) / (parsePx(styles.fontSize) || 16) * 10) / 10 };
      }
      if (styles.letterSpacing && styles.letterSpacing !== 'normal') {
        const ls = parsePx(styles.letterSpacing);
        if (ls !== 0 && !isNaN(ls)) {
          textSettings.typography_typography = 'custom';
          textSettings.typography_letter_spacing = { unit: 'px', size: Math.round(ls * 100) / 100 };
        }
      }
      const textMar = formatMarginFromStyles(styles);
      if (parsePx(textMar.top) > 0 || parsePx(textMar.right) > 0 || parsePx(textMar.bottom) > 0 || parsePx(textMar.left) > 0) {
        textSettings._margin = textMar;
      }

      const parentGt = parentNode ? gtFor(parentNode, viewport, snapshot) : null;
      const decor = detectCircularOrSquareDecor(gt, styles, parentGt);
      if (decor) {
        textSettings.width = { unit: 'px', size: decor.width };
        textSettings._element_width = 'auto';
        textSettings._flex_size = 'none';
        textSettings.flex_shrink = 0;
        textSettings.align_self = decor.alignSelf;
        textSettings._flex_align_self = decor.alignSelf;
        textSettings.max_height = { unit: 'px', size: decor.height };
        textSettings.min_height = { unit: 'px', size: decor.height };

        if (decor.hasVisualBg) {
          textSettings.background_background = 'classic';
          textSettings.background_color = decor.background;
        }
        if (decor.isCircular) {
          textSettings.border_radius = { unit: '%', top: '50', right: '50', bottom: '50', left: '50', isLinked: true };
        } else if (hasAnyBorderRadius(styles)) {
          textSettings.border_radius = formatRadiusFromStyles(styles);
        }
        if (hasAnyBorder(styles)) {
          const b = resolveBorderSettings(styles);
          if (b) Object.assign(textSettings, b);
        }
        textSettings._padding = formatPaddingFromStyles(styles) || { unit: 'px', top: '0', right: '0', bottom: '0', left: '0', isLinked: true };
      }

      if (styles.display === 'inline') {
        textSettings._element_width = 'auto';
        textSettings.align_self = 'flex-start';
        textSettings._flex_align_self = 'flex-start';
      }

      const textWidget = createTextEditorWidget(textSettings);

      if (decor && options.atomicRules && Array.isArray(options.atomicRules)) {
        const scope = resolveElementSelector(textWidget, sid);
        const bRule = decor.border ? `  border: ${decor.border} !important;\n` : '';
        pushAtomicRule(
          options,
          `${scope},\n` +
          `${scope} .elementor-widget-container,\n` +
          `${scope} .elementor-text-editor {\n` +
          `  width: ${decor.width}px !important;\n` +
          `  height: ${decor.height}px !important;\n` +
          `  max-height: ${decor.height}px !important;\n` +
          `  flex-shrink: 0 !important;\n` +
          `  align-self: ${decor.alignSelf} !important;\n` +
          `  border-radius: ${decor.borderRadius} !important;\n` +
          `  background: ${decor.background} !important;\n` +
          bRule +
          `  display: flex !important;\n` +
          `  align-items: center !important;\n` +
          `  justify-content: center !important;\n` +
          `}`
        );
      }

      if (isGradientAtomic && options.atomicRules && Array.isArray(options.atomicRules)) {
        const scope = resolveElementSelector(textWidget, sid);
        pushAtomicRule(
          options,
          `${scope} .elementor-text-editor, ${scope} p {\n` +
          `  background-image: ${bgImage} !important;\n` +
          `  -webkit-background-clip: text !important;\n` +
          `  background-clip: text !important;\n` +
          `  -webkit-text-fill-color: transparent !important;\n` +
          `}`
        );
      }

      return textWidget;
    }

    case 'inline_bullet': {
      const bulletText = (gt.directText || gt.fullText || node.textContent || '•').trim();
      const colorHex = normalizeColor(styles.color);
      const fs = parsePx(styles.fontSize) || 14;

      const bulletSettings = {
        ...commonMeta,
        title: bulletText,
        header_size: 'span',
        align: 'left',
        _element_width: 'auto',
        align_self: 'center',
        _flex_align_self: 'center',
        flex_shrink: 0,
        _padding: { unit: 'px', top: '0', right: '0', bottom: '0', left: '0', isLinked: true }
      };

      if (colorHex && colorHex !== 'transparent') {
        bulletSettings.title_color = colorHex;
      }

      if (styles.fontFamily) {
        const family = extractFontFamily(styles.fontFamily);
        if (family) {
          bulletSettings.typography_typography = 'custom';
          bulletSettings.typography_font_family = family;
        }
      }
      bulletSettings.typography_typography = 'custom';
      bulletSettings.typography_font_size = { unit: 'px', size: Math.round(fs) };

      const bMar = formatMarginFromStyles(styles);
      if (bMar) {
        bulletSettings._margin = bMar;
      }

      return createHeadingWidget(bulletSettings);
    }

    case 'icon': {
      let iconClass = null;
      const childIcon = (node.children || []).find(c => ['svg', 'i', 'span'].includes(c.tagName?.toLowerCase()));
      const combinedClasses = `${node.className || ''} ${childIcon?.className || ''}`.toLowerCase();
      const raw = (node.rawHtml || '').toLowerCase();

      // M9: Universal Unicode/Emoji Glyph Translation (Zero fa-check fallback for known glyphs)
      const glyphCandidate = gt.directText || gt.fullText || node.textContent || childIcon?.textContent || raw || '';
      const mappedGlyph = resolveGlyphToFa5(glyphCandidate);
      if (mappedGlyph) {
        iconClass = mappedGlyph;
      }

      if (!iconClass && gt.pseudo) {
        const pseudoText = `${gt.pseudo.before?.content || ''} ${gt.pseudo.after?.content || ''}`;
        const pseudoGlyph = resolveGlyphToFa5(pseudoText);
        if (pseudoGlyph) iconClass = pseudoGlyph;
      }

      if (!iconClass) {
        if (combinedClasses.includes('chevron') || combinedClasses.includes('arrow-down') || raw.includes('chevron') || (raw.includes('path') && raw.includes('m19 9l-7 7-7-7'))) {
          iconClass = 'fas fa-chevron-down';
        } else if (combinedClasses.includes('arrow-right') || raw.includes('arrow-right')) {
          iconClass = 'fas fa-arrow-right';
        } else if (combinedClasses.includes('arrow-left') || raw.includes('arrow-left')) {
          iconClass = 'fas fa-arrow-left';
        } else if (combinedClasses.includes('star') || raw.includes('star')) {
          iconClass = 'fas fa-star';
        } else if (combinedClasses.includes('sparkle')) {
          iconClass = 'fas fa-magic';
        } else if (combinedClasses.includes('close') || combinedClasses.includes('times') || raw.includes('times')) {
          iconClass = 'fas fa-times';
        } else if (combinedClasses.includes('shield') || raw.includes('shield')) {
          iconClass = 'fas fa-shield-alt';
        } else if (combinedClasses.includes('bolt') || raw.includes('bolt') || raw.includes('m13 10v3l4 14')) {
          iconClass = 'fas fa-bolt';
        } else if (combinedClasses.includes('check') || raw.includes('check') || raw.includes('m4.5 12.75')) {
          iconClass = 'fas fa-check';
        } else {
          const faMatch = combinedClasses.match(/fa[srb]?\s+fa-([a-z0-9-]+)/i);
          if (faMatch) iconClass = getFa5Equivalent(`fas fa-${faMatch[1]}`);
        }
      }

      if (!iconClass) {
        iconClass = 'fas fa-check';
      }

      const parentGt = parentNode ? gtFor(parentNode, viewport, snapshot) : null;
      const decor = detectIconDecor(gt, styles, parentGt);

      const childGt = childIcon ? gtFor(childIcon, viewport, snapshot) : null;
      const childStyles = childGt?.styles || {};

      let colorHex = normalizeColor(childStyles.color) ||
                     normalizeColor(childStyles.fill) ||
                     normalizeColor(childStyles.stroke) ||
                     normalizeColor(styles.color) ||
                     normalizeColor(styles.fill) ||
                     normalizeColor(styles.stroke);

      if (decor && colorHex === decor.background) {
        colorHex = '#3B82F6';
      }

      // Task M5: Ground Truth Computed Font Size Deference (Settings-First Contract)
      // When GT has a computed fontSize, use it VERBATIM over heuristic decor / dimension guesses!
      const gtFs = parsePx(styles.fontSize);
      const childFs = parsePx(childStyles.fontSize);
      let resolvedGlyphSize;
      if (childGt && childIcon?.tagName?.toLowerCase() === 'svg' && (childGt.rect?.w || 0) > 0) {
        resolvedGlyphSize = Math.round(Math.min(childGt.rect.w, childGt.rect.h || childGt.rect.w));
      } else if (childFs >= 8) {
        resolvedGlyphSize = Math.round(childFs);
      } else if (gtFs >= 8) {
        resolvedGlyphSize = Math.round(gtFs);
      } else if (childGt && (childGt.rect?.w || 0) > 0) {
        resolvedGlyphSize = Math.round(Math.min(childGt.rect.w, childGt.rect.h || childGt.rect.w));
      } else if (decor) {
        resolvedGlyphSize = Math.round(decor.height * 0.45);
      } else {
        resolvedGlyphSize = Math.round(rect.w || 16);
      }
      const finalIconSize = Math.max(8, Math.min(96, resolvedGlyphSize > 0 ? resolvedGlyphSize : 16));

      const iconSettings = {
        ...commonMeta,
        icon: iconClass
      };

      const iconMar = formatMarginFromStyles(styles);
      if (parsePx(iconMar.top) > 0 || parsePx(iconMar.right) > 0 || parsePx(iconMar.bottom) > 0 || parsePx(iconMar.left) > 0) {
        iconSettings._margin = iconMar;
        iconSettings.margin = iconMar;
      }

      // K2: GT-derived align-self and align from bounding rects vs parent content-box
      const derivedAlignSelf = decor?.alignSelf || deriveAlignSelfFromGt(gt, parentGt);
      iconSettings.align_self = derivedAlignSelf;
      iconSettings._flex_align_self = derivedAlignSelf;
      iconSettings.flex_align_self = derivedAlignSelf;
      iconSettings.align = (derivedAlignSelf === 'flex-start') ? 'left' : ((derivedAlignSelf === 'flex-end') ? 'right' : 'center');

      if (gtFs >= 8 || childFs >= 8) {
        iconSettings.typography_typography = 'custom';
        iconSettings.typography_font_size = { unit: 'px', size: finalIconSize };
      }

      if (decor) {
        // Task M3: Native icon settings first (RC-5)
        iconSettings.view = 'stacked';
        iconSettings.shape = decor.type === 'circular' ? 'circle' : 'square';
        iconSettings.primary_color = decor.background || '#ffffff';
        iconSettings.secondary_color = colorHex || '#111827';
        iconSettings.size = finalIconSize;
        iconSettings._icon_decor = decor;
        iconSettings.flex_shrink = 0;
        iconSettings._flex_size = 'none';
        iconSettings.max_height = { unit: 'px', size: decor.height };
        iconSettings.min_height = { unit: 'px', size: decor.height };
        iconSettings._element_width = 'auto';
      } else {
        iconSettings.view = 'default';
        iconSettings.shape = '';
        iconSettings.size = finalIconSize;
        if (colorHex) iconSettings.primary_color = colorHex;
      }

      const iconWidget = createIconWidget(iconSettings);

      // F4 / G4 / G3 / M3 & M11: Scoped micro-CSS rule as reinforcement only for decor
      if (decor && options.atomicRules && Array.isArray(options.atomicRules)) {
        const scope = resolveElementSelector(iconWidget, sid);
        const bRule = decor.border ? `  border: ${decor.border} !important;\n` : '';
        const aSelf = iconSettings.align_self || 'center';
        pushAtomicRule(
          options,
          `${scope},\n` +
          `${scope} .elementor-widget-container,\n` +
          `${scope} .elementor-icon-wrapper,\n` +
          `${scope} .elementor-icon {\n` +
          `  width: ${decor.height}px !important;\n` +
          `  height: ${decor.height}px !important;\n` +
          `  max-height: ${decor.height}px !important;\n` +
          `  flex-shrink: 0 !important;\n` +
          `  align-self: ${aSelf} !important;\n` +
          `  border-radius: ${decor.borderRadius} !important;\n` +
          `  background: ${decor.background} !important;\n` +
          bRule +
          `  display: flex !important;\n` +
          `  align-items: center !important;\n` +
          `  justify-content: center !important;\n` +
          `}`
        );
      }

      return iconWidget;
    }

    case 'divider': {
      return createDividerWidget(commonMeta);
    }

    case 'svg_html': {
      const rawHtml = node.rawHtml || `<${node.tagName}>${gt.fullText || ''}</${node.tagName}>`;
      return createHtmlWidget({
        ...commonMeta,
        html: rawHtml,
        _html_reason: 'NON_ELEMENTOR_PRIMITIVE:animated-svg'
      });
    }

    case 'micro_input': {
      const rawHtml = node.rawHtml || `<${node.tagName}>${gt.fullText || ''}</${node.tagName}>`;
      let reason = 'NON_ELEMENTOR_PRIMITIVE:form-control';
      const tag = (node.tagName || '').toLowerCase();
      const inputType = (node.attributes?.type || '').toLowerCase();
      if (tag === 'input' && inputType === 'range') {
        reason = 'NON_ELEMENTOR_PRIMITIVE:input[type=range]';
      } else if (tag === 'input' && (inputType === 'checkbox' || inputType === 'radio')) {
        reason = 'NON_ELEMENTOR_PRIMITIVE:switch';
      } else if (['select', 'textarea'].includes(tag)) {
        reason = 'NON_ELEMENTOR_PRIMITIVE:form-control';
      } else if (['canvas', 'audio', 'video', 'iframe'].includes(tag)) {
        reason = 'NON_ELEMENTOR_PRIMITIVE:media';
      }
      return createHtmlWidget({
        ...commonMeta,
        html: rawHtml,
        _html_reason: reason
      });
    }

    case 'container':
    default: {
      const childNodes = (node.children || []).filter(c => c.tagName !== '#text' || (c.textContent || '').trim().length > 0);
      const childGts = childNodes.map(c => gtFor(c, viewport, snapshot)).filter(Boolean);

      // Geometric layout inference
      const isGrid = (styles.display === 'grid' || styles.display === 'inline-grid');
      const layout = inferContainerLayout(childGts, gt);
      if (isGrid) {
        layout.direction = 'row';
        layout.wrap = 'wrap';
        commonMeta._layoutHandled = true;
      }

      // F3: Gap Fidelity — extract columnGap and rowGap separately from computed styles
      const hasComputedColGap = styles.columnGap !== undefined && styles.columnGap !== '' && styles.columnGap !== 'normal';
      const hasComputedRowGap = styles.rowGap !== undefined && styles.rowGap !== '' && styles.rowGap !== 'normal';
      const hasComputedGap = styles.gap !== undefined && styles.gap !== '' && styles.gap !== 'normal';

      let colGap = 0;
      let rowGap = 0;

      if (hasComputedColGap || hasComputedRowGap) {
        colGap = parsePx(styles.columnGap);
        rowGap = parsePx(styles.rowGap);
      } else if (hasComputedGap) {
        const gapPx = parsePx(styles.gap);
        colGap = gapPx;
        rowGap = gapPx;
      } else {
        // Fallback to geometric inference if CSS gap is not explicitly declared.
        // If child 0 is an icon/decor widget with a computed margin, that margin belongs
        // specifically to the decor widget and must not be inverted into a container gap.
        const child0Gt = childGts[0];
        const isChild0Decor = child0Gt && (
          child0Gt.classes?.includes('icon') ||
          child0Gt.classes?.includes('badge') ||
          detectNodeRole(childNodes[0], child0Gt, snapshot, viewport) === 'icon' ||
          Boolean(detectIconDecor(child0Gt, child0Gt.styles))
        );
        const child0Margin = (layout.direction === 'row')
          ? parsePx(child0Gt?.styles?.marginRight)
          : parsePx(child0Gt?.styles?.marginBottom);

        const hasDecorMargin = Boolean(isChild0Decor && child0Margin > 0);

        if (!hasDecorMargin) {
          if (layout.direction === 'row') {
            colGap = layout.gap;
            rowGap = layout.wrap === 'wrap' ? layout.gap : 0;
          } else {
            rowGap = layout.gap;
            colGap = 0;
          }
        }
      }

      const containerSettings = {
        ...commonMeta,
        direction: layout.direction,
        flex_direction: layout.direction,
        wrap: layout.wrap,
        flex_wrap: layout.wrap,
        gap: {
          unit: 'px',
          size: colGap || rowGap || 0,
          column: colGap,
          row: rowGap,
          isLinked: Boolean(colGap === rowGap)
        },
        flex_gap: {
          unit: 'px',
          size: colGap || rowGap || 0,
          column: colGap,
          row: rowGap,
          isLinked: Boolean(colGap === rowGap)
        },
        space_between_widgets: (layout.direction === 'column' ? rowGap : colGap) || 0,
        content_width: parentNode ? 'full' : 'boxed'
      };

      // Surface styles
      const rawBg = readComputedCssProperty(gt, snapshot, viewport, 'background-color', 'backgroundColor');
      if (rawBg && !isFullyTransparentColor(rawBg)) {
        containerSettings.background_background = 'classic';
        containerSettings.background_color = rawBg;
      }

      const rawBgImg = readComputedCssProperty(gt, snapshot, viewport, 'background-image', 'backgroundImage');

      const singleImgUrl = extractSingleImageUrl(rawBgImg);
      if (singleImgUrl) {
        const resolvedBgUrl = resolveAssetUrl(singleImgUrl, options);
        if (resolvedBgUrl) {
          containerSettings.background_background = 'classic';
          containerSettings.background_image = { url: resolvedBgUrl, id: '' };

          if (viewport === 'desktop') {
            const geo = resolveImageBackgroundGeometry(gt, snapshot, viewport);
            if (geo && geo.settings) {
              if (geo.settings.background_size) containerSettings.background_size = geo.settings.background_size;
              if (geo.settings.background_position) containerSettings.background_position = geo.settings.background_position;
              if (geo.settings.background_repeat) containerSettings.background_repeat = geo.settings.background_repeat;
            }
          }
        }
      } else if (viewport === 'desktop') {
        const gradResult = resolveGradientBackground(gt, snapshot, viewport);
        if (gradResult && gradResult.mode === 'native-linear' && gradResult.settings) {
          Object.assign(containerSettings, gradResult.settings);
          delete containerSettings.background_image;
        }
      }

      const containerBorder = resolveBorderSettings(styles);
      if (containerBorder) {
        Object.assign(containerSettings, containerBorder);
      }

      // Task M3: Role-based decor protection for fixed-dimension circular/square containers (RC-1)
      const parentGt = parentNode ? gtFor(parentNode, viewport, snapshot) : null;
      const decor = detectCircularOrSquareDecor(gt, styles, parentGt);
      if (decor) {
        containerSettings.width = { unit: 'px', size: decor.width };
        containerSettings._flex_size = 'none';
        containerSettings.flex_shrink = 0;
        containerSettings.align_self = decor.alignSelf;
        containerSettings.flex_align_self = decor.alignSelf;
        containerSettings.max_height = { unit: 'px', size: decor.height };
        containerSettings.min_height = { unit: 'px', size: decor.height };
        containerSettings.overflow = 'hidden';
        if (decor.hasVisualBg && containerSettings.background_background !== 'gradient') {
          containerSettings.background_background = 'classic';
          if (!containerSettings.background_color) {
            containerSettings.background_color = decor.background;
          }
        }
        if (decor.isCircular) {
          containerSettings.border_radius = { unit: '%', top: '50', right: '50', bottom: '50', left: '50', isLinked: true };
        }
      }

      const radiusDecision = resolveComputedRadius(gt, snapshot, viewport);
      if (radiusDecision.mode === 'native') {
        containerSettings.border_radius = radiusDecision.setting;
      } else if (radiusDecision.mode === 'css') {
        delete containerSettings.border_radius;
        containerSettings._radius_route = 'css';
      } else {
        delete containerSettings.border_radius;
      }

      const finalizeContainer = (settings) => {
        const el = createContainer(settings);
        if (radiusDecision.mode === 'css') {
          if (!options.atomicRules || !Array.isArray(options.atomicRules)) {
            const err = new Error(`[RADIUS_CSS_ROUTE_UNAVAILABLE] atomicRules array unavailable for CSS radius fallback on SID "${sid}"`);
            err.code = 'RADIUS_CSS_ROUTE_UNAVAILABLE';
            err.reason = 'RADIUS_CSS_ROUTE_UNAVAILABLE';
            err.sid = sid;
            throw err;
          }
          const scopedClass = ensureDeterministicClass(el, sid);
          const c = radiusDecision.corners;
          pushAtomicRule(
            options,
            `.${scopedClass} {\n` +
            `  border-top-left-radius: ${c.topLeft} !important;\n` +
            `  border-top-right-radius: ${c.topRight} !important;\n` +
            `  border-bottom-right-radius: ${c.bottomRight} !important;\n` +
            `  border-bottom-left-radius: ${c.bottomLeft} !important;\n` +
            `}`
          );
        }
        return el;
      };

      containerSettings.padding = formatPaddingFromStyles(styles);
      containerSettings._padding = containerSettings.padding;

      // Task K10 (N1): Universal Auto-Centering Direction Parity
      // In CSS Flexbox / Elementor Containers:
      // - Column parent: cross axis is horizontal => child gets align_self: 'center'.
      // - Row parent: main axis is horizontal => parent gets justify_content: 'center' (Elementor lacks margin: auto).
      const marL = parsePx(styles.marginLeft);
      const marR = parsePx(styles.marginRight);
      const parentW = parentGt?.rect?.w || 1200;
      const curW = gt.rect?.w || 0;
      const expectedCenterMargin = (parentW - curW) / 2;
      const isAutoCentered = (
        marL >= 16 && marR >= 16 &&
        Math.abs(marL - marR) <= 4 &&
        curW > 0 && parentW > curW &&
        Math.abs(marL - expectedCenterMargin) <= 16
      );

      const parentFlexDir = (parentGt?.styles?.flexDirection || '').toLowerCase();
      const isParentFlex = (parentGt?.styles?.display === 'flex' || parentGt?.styles?.display === 'inline-flex');
      const isParentRow = isParentFlex && (parentFlexDir === 'row' || parentFlexDir === 'row-reverse');

      if (isAutoCentered) {
        const pctW = Math.min(100, Math.max(1, Math.round((curW / parentW) * 100 * 10) / 10));
        containerSettings.width = { unit: '%', size: pctW };
        containerSettings._auto_centered = true;

        if (isParentRow) {
          containerSettings._auto_centered_row = true;
          // In a row container, align_self aligns vertically (cross-axis), so do NOT set align_self: center for horizontal centering
        } else {
          // Column or default container: cross axis is horizontal
          containerSettings.align_self = 'center';
          containerSettings.flex_align_self = 'center';
          containerSettings._flex_align_self = 'center';
        }

        const baseMar = formatMarginFromStyles(styles);
        if (baseMar) {
          baseMar.left = '0';
          baseMar.right = '0';
          baseMar.isLinked = false;
        }
        containerSettings.margin = baseMar;
        containerSettings._margin = baseMar;
      } else {
        containerSettings.margin = formatMarginFromStyles(styles);
        containerSettings._margin = containerSettings.margin;
      }

      // Section Overlap Prevention: For top-level sections, prevent severe negative top margins (>15% section height)
      if (!parentNode || ['root', 'body'].includes(parentNode.tagName)) {
        const topMargin = parsePx(styles.marginTop);
        if (topMargin < 0) {
          const secH = Math.round(parsePx(styles.height) || gt.rect?.h || 0);
          if (secH > 0 && Math.abs(topMargin) > secH * 0.15) {
            containerSettings.margin.top = '0';
          }
        }
      }

      // Alignment & distribution from computed styles
      if (styles.alignItems) {
        containerSettings.align_items = styles.alignItems;
        containerSettings.flex_align_items = styles.alignItems;
      }
      if (styles.justifyContent) {
        containerSettings.justify_content = styles.justifyContent;
        containerSettings.flex_justify_content = styles.justifyContent;
      }

      // Box shadow from computed styles
      if (styles.boxShadow && styles.boxShadow !== 'none') {
        const bs = parseBoxShadow(styles.boxShadow);
        if (bs) containerSettings.box_shadow_box_shadow = bs;
      }

      // Pseudo hover capture on container
      if (gt.pseudo && gt.pseudo.hover) {
        if (gt.pseudo.hover.borderColor) {
          containerSettings.border_hover_border = 'solid';
          containerSettings.border_hover_color = normalizeColor(gt.pseudo.hover.borderColor);
        }
        if (gt.pseudo.hover.boxShadow) {
          const hbs = parseBoxShadow(gt.pseudo.hover.boxShadow);
          if (hbs) containerSettings.box_shadow_hover_box_shadow = hbs;
        }
      }

      // M2: Universal Collapsed Container Parity (Principle 1 GT Truth)
      // If GT computed styles or rect reveal an initially collapsed container (max-height:0 / overflow:hidden / rect.h:0):
      // Lock container settings to overflow: 'hidden', max_height: 0, and zero padding so it collapses completely in all renders.
      const hasZeroMaxHeight = Boolean(styles.maxHeight && styles.maxHeight !== 'none' && parsePx(styles.maxHeight) === 0);
      const isGtCollapsed = Boolean(
        (hasZeroMaxHeight && styles.overflow === 'hidden') ||
        (gt && gt.rect && gt.rect.h === 0 && styles.overflow === 'hidden') ||
        (gt && gt.rect && gt.rect.h === 0 && hasZeroMaxHeight)
      );

      if (isGtCollapsed) {
        containerSettings.overflow = 'hidden';
        containerSettings.max_height = { unit: 'px', size: 0 };
        const zeroBox = { unit: 'px', top: '0', right: '0', bottom: '0', left: '0', isLinked: true };
        containerSettings.padding = { ...zeroBox };
        containerSettings._padding = { ...zeroBox };
        delete containerSettings.min_height;
      }

      // Fluid Container Protocol (G8): NEVER set fixed height!
      // F7: Equal-Height Rows — skip per-child min_height when flagged by parent row
      if (!options.skipMinHeight && !isGtCollapsed) {
        if (parsePx(styles.minHeight) > 0) {
          containerSettings.min_height = { unit: 'px', size: Math.round(parsePx(styles.minHeight)) };
        } else if (parsePx(styles.height) > 60 && !['html', 'body'].includes(node.tagName)) {
          containerSettings.min_height = { unit: 'px', size: Math.round(parsePx(styles.height)) };
        }
      }

      // F7: Equal-Height Rows detection
      const isFlexRow = (styles.display === 'flex' || styles.display === 'inline-flex') &&
        (styles.flexDirection === 'row' || styles.flexDirection === 'row-reverse');
      const isRowLayout = layout.direction === 'row' || isGrid || isFlexRow;

      let equalHeightChildIndices = new Set();
      if (isRowLayout) {
        equalHeightChildIndices = detectEqualHeightRowChildIndices(childNodes, snapshot, viewport);
      }

      // If equal-height row children detected, rely on flex stretch (default in Elementor)
      if (equalHeightChildIndices.size > 0) {
        if (!containerSettings.align_items || containerSettings.align_items === 'normal') {
          containerSettings.align_items = 'stretch';
          containerSettings.flex_align_items = 'stretch';
        }
      }

      // Task M7: Universal Card Flush Media Detection & Structural Split
      const cardFlush = detectCardFlushMedia(node, parentNode, childNodes, gt, snapshot, viewport);
      if (cardFlush) {
        containerSettings._flush_card = true;
        const zeroBox = { unit: 'px', top: '0', right: '0', bottom: '0', left: '0', isLinked: true };
        containerSettings.padding = { ...zeroBox };
        containerSettings._padding = { ...zeroBox };
        containerSettings.overflow = 'hidden';

        if (!cardFlush.isAlreadySplit) {
          // Perform structural split into Media Container (padding: 0) and Body Container (GT padding)
          let mediaElement = null;
          if (cardFlush.isChild0MediaContainer) {
            mediaElement = mapNodeToElementor(cardFlush.child0, node, snapshot, viewport, options);
            if (mediaElement && mediaElement.settings) {
              mediaElement.settings.padding = { ...zeroBox };
              mediaElement.settings._padding = { ...zeroBox };
              mediaElement.settings.overflow = 'hidden';
            }
          } else {
            const mappedImgWidget = mapNodeToElementor(cardFlush.child0, node, snapshot, viewport, options);
            if (mappedImgWidget) {
              const cardTopL = parsePx(styles.borderTopLeftRadius);
              const cardTopR = parsePx(styles.borderTopRightRadius);
              if ((cardTopL > 0 || cardTopR > 0) && (!mappedImgWidget.settings?.border_radius || mappedImgWidget.settings.border_radius.top === '0')) {
                if (!mappedImgWidget.settings) mappedImgWidget.settings = {};
                mappedImgWidget.settings.border_radius = {
                  unit: 'px',
                  top: String(cardTopL),
                  right: String(cardTopR),
                  bottom: '0',
                  left: '0',
                  isLinked: false
                };
              }
              const mediaContainer = createContainer({
                direction: 'column',
                padding: { top: 0, right: 0, bottom: 0, left: 0 },
                elements: [mappedImgWidget]
              });
              mediaContainer.id = generateId();
              mediaContainer.settings.content_width = 'full';
              mediaContainer.settings.width = { unit: '%', size: 100 };
              mediaContainer.settings._dom_id = `${sid || 'card'}-media`;
              mediaContainer.settings._sid = `${sid || 'card'}-media`;
              mediaContainer.settings.padding = { ...zeroBox };
              mediaContainer.settings._padding = { ...zeroBox };
              mediaContainer.settings.gap = { unit: 'px', size: 0, column: 0, row: 0, isLinked: true };
              mediaContainer.settings.flex_gap = { unit: 'px', size: 0, column: 0, row: 0, isLinked: true };
              mediaContainer.settings.overflow = 'hidden';
              mediaElement = mediaContainer;
            }
          }

          // Build Body Container
          let bodyElement = null;
          const remGt = gtFor(cardFlush.remainingChildren[0], viewport, snapshot);
          if (cardFlush.remainingChildren.length === 1 && remGt && detectNodeRole(cardFlush.remainingChildren[0], remGt) === 'container') {
            bodyElement = mapNodeToElementor(cardFlush.remainingChildren[0], node, snapshot, viewport, options);
          } else {
            const padTop = parsePx(styles.paddingTop);
            const padRight = parsePx(styles.paddingRight);
            const padBottom = parsePx(styles.paddingBottom);
            const padLeft = parsePx(styles.paddingLeft);
            let bodyPadding;
            if (padTop > 0 || padRight > 0 || padBottom > 0 || padLeft > 0) {
              bodyPadding = formatBox(padTop, padRight, padBottom, padLeft);
            } else {
              const firstBodyGt = gtFor(cardFlush.remainingChildren[0], viewport, snapshot);
              let indX = 0, indY = 0;
              if (firstBodyGt && firstBodyGt.rect && gt.rect) {
                indX = Math.max(0, Math.round(firstBodyGt.rect.x - gt.rect.x));
                indY = Math.max(0, Math.round(firstBodyGt.rect.y - (cardFlush.imgGt.rect.y + cardFlush.imgGt.rect.h)));
              }
              const p = indX || 20;
              bodyPadding = formatBox(indY || p, p, p, p);
            }

            const bodyChildOptions = {
              ...options,
              ancestorNodes: [...(options.ancestorNodes || []), node]
            };
            const bodyWidgets = [];
            const bodyPairs = [];
            for (const bChild of cardFlush.remainingChildren) {
              const bEl = mapNodeToElementor(bChild, node, snapshot, viewport, bodyChildOptions);
              if (bEl) {
                bodyWidgets.push(bEl);
                bodyPairs.push({ element: bEl, node: bChild });
              }
            }

            // W2: Deduplicate spacing in cardFlush body widgets
            deduplicateContainerChildSpacing(containerSettings, bodyPairs, snapshot, viewport);

            const bodyContainer = createContainer({
              direction: 'column',
              padding: bodyPadding,
              elements: bodyWidgets
            });
            bodyContainer.id = generateId();
            bodyContainer.settings.content_width = 'full';
            bodyContainer.settings.width = { unit: '%', size: 100 };
            bodyContainer.settings._dom_id = `${sid || 'card'}-body`;
            bodyContainer.settings._sid = `${sid || 'card'}-body`;
            bodyContainer.settings.padding = bodyPadding;
            bodyContainer.settings._padding = bodyPadding;
            bodyContainer.settings.gap = containerSettings.gap;
            bodyContainer.settings.flex_gap = containerSettings.gap;
            bodyContainer.settings.space_between_widgets = containerSettings.space_between_widgets;
            bodyContainer.settings.flex_grow = 1;
            bodyContainer.settings._flush_body = true;
            ensureDeterministicClass(bodyContainer);
            bodyElement = bodyContainer;
          }

          containerSettings.gap = { unit: 'px', size: 0, column: 0, row: 0, isLinked: true };
          containerSettings.flex_gap = { unit: 'px', size: 0, column: 0, row: 0, isLinked: true };
          containerSettings.space_between_widgets = 0;
          containerSettings.elements = [mediaElement, bodyElement].filter(Boolean);
          return finalizeContainer(containerSettings);
        }
      }

      // Recursively map children
      const elements = [];
      const mappedPairs = [];

      // Task K4: Universal Inline Mixed-Content AST Consolidation
      // Sequences like card-meta "Category • 5 Min Read" consolidate into a single text-editor widget with inline spans
      if (detectInlineMixedContentSequence(childNodes, node, gt, snapshot, viewport)) {
        const consolidatedWidget = buildConsolidatedInlineTextWidget(childNodes, node, gt, styles, snapshot, viewport, options);
        if (consolidatedWidget) {
          elements.push(consolidatedWidget);
          mappedPairs.push({ element: consolidatedWidget, node });
          for (const c of childNodes) {
            mappedPairs.push({ element: consolidatedWidget, node: c });
          }
        }
      } else {
        for (let childIdx = 0; childIdx < childNodes.length; childIdx++) {
          const childNode = childNodes[childIdx];
          const isChildEqualHeight = equalHeightChildIndices.has(childIdx);
          const shouldSkipChildMinHeight = Boolean(options.skipMinHeight || isChildEqualHeight || isGtCollapsed);
          const childOptions = {
            ...options,
            skipMinHeight: shouldSkipChildMinHeight,
            ancestorNodes: [...(options.ancestorNodes || []), node]
          };

          const childElement = mapNodeToElementor(childNode, node, snapshot, viewport, childOptions);
          if (childElement) {
            if (cardFlush?.isAlreadySplit && childIdx === 0 && childElement.settings) {
              const zeroBox = { unit: 'px', top: '0', right: '0', bottom: '0', left: '0', isLinked: true };
              childElement.settings.padding = { ...zeroBox };
              childElement.settings._padding = { ...zeroBox };
              childElement.settings.overflow = 'hidden';
            }
            if (isChildEqualHeight && childElement.settings) {
              delete childElement.settings.min_height;
              delete childElement.settings.min_height_tablet;
              delete childElement.settings.min_height_mobile;
            }

            // If container is row or grid (G6 measured child widths):
            if (layout.direction === 'row') {
              const childGt = gtFor(childNode, viewport, snapshot);
              if (childGt && gt && gt.rect.w > 0 && childGt.rect.w > 0) {
                const padLeft = parsePx(styles.paddingLeft);
                const padRight = parsePx(styles.paddingRight);
                const borderLeft = parsePx(styles.borderLeftWidth);
                const borderRight = parsePx(styles.borderRightWidth);
                const parentContentW = Math.max(1, gt.rect.w - padLeft - padRight - borderLeft - borderRight);

                // Task M8: Decorative fixed-size children check
                const isChildDecor = Boolean(
                  childElement.settings?._decor ||
                  childElement.settings?._is_decor ||
                  (childElement.settings?.width?.unit === 'px' && childElement.settings.width.size <= 84) ||
                  (childGt.rect.w <= 84 && Math.abs(childGt.rect.w - childGt.rect.h) <= 12)
                );

                if (isChildDecor) {
                  childElement.settings.flex_shrink = 0;
                } else {
                  const pct = Math.round((childGt.rect.w / parentContentW) * 100 * 10) / 10;
                  if (pct < 98) {
                    if (childElement.elType === 'container') {
                      if (!childElement.settings.max_height) {
                        childElement.settings.width = { unit: '%', size: pct };
                      }
                      childElement.settings._flex_size = 'none';
                      childElement.settings.flex_shrink = 0;
                    } else if (isGrid) {
                      childElement.settings.width = { unit: '%', size: pct };
                      childElement.settings._element_width = 'initial';
                      childElement.settings._flex_size = 'none';
                    }
                  }
                }
              }
              if (childElement.elType !== 'container' && !childElement.settings.width && childElement.settings.align !== 'justify') {
                childElement.settings._element_width = 'auto';
              }
            }
            elements.push(childElement);
            mappedPairs.push({ element: childElement, node: childNode });
          }
        }
      }

      // W2: Spacing double-count elimination (timeline 48+48, split 31+32 class)
      deduplicateContainerChildSpacing(containerSettings, mappedPairs, snapshot, viewport);

      // Task K10 (N1): If this container is a row and has an auto-centered child, set justify_content to center along horizontal main axis
      if (layout.direction === 'row') {
        const hasAutoCenteredRowChild = elements.some(el => el && (el.settings?._auto_centered_row || el._auto_centered_row));
        if (hasAutoCenteredRowChild) {
          containerSettings.justify_content = 'center';
          containerSettings.flex_justify_content = 'center';
        }
      }

      containerSettings.elements = elements;

      // D3: Strict scoped exception for leaf containers (0 content children) with computed height > 0 and visual surface
      if (elements.length === 0 && !['html', 'body'].includes(node.tagName)) {
        const computedH = Math.round(parsePx(styles.height) || gt.rect?.h || 0);
        const hasVisualBg = Boolean(rawBg && !isFullyTransparentColor(rawBg));
        const hasBgImg = styles.backgroundImage && styles.backgroundImage !== 'none' && styles.backgroundImage !== 'initial';
        const hasBorder = parsePx(styles.borderTopWidth) > 0 || parsePx(styles.borderBottomWidth) > 0 || parsePx(styles.borderLeftWidth) > 0 || parsePx(styles.borderRightWidth) > 0;
        const hasVisualSurface = Boolean(hasVisualBg || hasBgImg || hasBorder);

        if (computedH > 0 && hasVisualSurface) {
          containerSettings.min_height = { unit: 'px', size: computedH };
        } else if (computedH <= 0 && !hasVisualSurface) {
          return null;
        }
      }

      const containerElement = finalizeContainer(containerSettings);

      if (decor && options.atomicRules && Array.isArray(options.atomicRules)) {
        const scopedClass = ensureDeterministicClass(containerElement, sid);
        const scope = scopedClass ? `.${scopedClass}` : resolveElementSelector(containerElement, sid);
        const bRule = decor.border ? `  border: ${decor.border} !important;\n` : '';

        let bgRule = '';
        if (rawBg && typeof rawBg === 'string') {
          const trimmedBg = rawBg.trim();
          if (isFullyTransparentColor(trimmedBg) || trimmedBg.toLowerCase() === 'transparent') {
            bgRule = `  background-color: ${trimmedBg} !important;\n`;
          } else if (parseColorParts(trimmedBg)) {
            bgRule = `  background-color: ${trimmedBg} !important;\n`;
          }
        }

        pushAtomicRule(
          options,
          `${scope},\n` +
          `${scope} > .e-con-inner {\n` +
          `  width: ${decor.width}px !important;\n` +
          `  height: ${decor.height}px !important;\n` +
          `  max-height: ${decor.height}px !important;\n` +
          `  flex-shrink: 0 !important;\n` +
          `  align-self: ${decor.alignSelf} !important;\n` +
          bgRule +
          bRule +
          `  display: flex !important;\n` +
          `  align-items: center !important;\n` +
          `  justify-content: center !important;\n` +
          `}`
        );
      }

      return containerElement;
    }
  }
}

/**
 * Compiles a full HTML AST tree to Elementor root container via Single-Pass Geometric Mapping.
 */
function compileGroundTruthToElementor(astRoot, snapshot, options = {}) {
  const viewport = options.viewport || 'desktop';
  if (!options.unresolvedAssets) options.unresolvedAssets = [];
  if (options.atomicRules === undefined) options.atomicRules = [];
  if (!options.assignedSids) options.assignedSids = new Set();
  const rootElement = mapNodeToElementor(astRoot, null, snapshot, viewport, options);

  if (rootElement && rootElement.elType === 'container') {
    // Root container boxed configuration (GT-derived universal mode)
    rootElement.settings.content_width = 'boxed';
    const boxedW = detectUniversalBoxedWidth(snapshot, viewport);
    rootElement.settings.boxed_width = { unit: 'px', size: boxedW };
    return [rootElement];
  }

  return [rootElement].filter(Boolean);
}

module.exports = {
  detectNodeRole,
  inferContainerLayout,
  deriveAlignSelfFromGt,
  detectEqualHeightRowChildIndices,
  mapNodeToElementor,
  compileGroundTruthToElementor,
  deduplicateContainerChildSpacing,
  detectIconDecor,
  detectInlineMixedContentSequence,
  buildConsolidatedInlineTextWidget,
  resolveAssetUrl
};

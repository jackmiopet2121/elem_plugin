/**
 * Universal Semantic DOM Transformer.
 * Dynamically converts ANY HTML DOM AST node into native Elementor Free Containers and Widgets.
 */
const { generateId } = require('../core/id-generator');
const { createContainer } = require('./container-transformer');
const { getFa5Equivalent } = require('../core/rules-engine');
const { resolveGlyphToFa5, hasKnownGlyph } = require('../smart/glyph-map');
const {
  createHeadingWidget,
  createTextEditorWidget,
  createButtonWidget,
  createHtmlWidget,
  createIconWidget,
  createDividerWidget,
  createImageWidget
} = require('./widget-transformer');

function mapSvgToFontAwesome(svgHtml = '', className = '') {
  const lower = (svgHtml + ' ' + className).toLowerCase();

  // 1. Right arrows & chevrons (check first before generic fallbacks)
  if (
    lower.includes('arrow-right') ||
    lower.includes('chevron-right') ||
    lower.includes('m13.5 4.5l21 12') ||
    lower.includes('21 12') ||
    lower.includes('m5 12h14') ||
    lower.includes('case-study') ||
    lower.includes('read-more') ||
    lower.includes('learn-more') ||
    lower.includes('view-more') ||
    (lower.includes('link') && !lower.includes('external'))
  ) {
    return 'fas fa-arrow-right';
  }

  // 2. Left arrows & chevrons
  if (lower.includes('arrow-left') || lower.includes('chevron-left') || lower.includes('back')) return 'fas fa-arrow-left';
  if (lower.includes('chevron-down') || lower.includes('indicator') || lower.includes('arrow-down')) return 'fas fa-chevron-down';
  if (lower.includes('chevron-up') || lower.includes('arrow-up')) return 'fas fa-chevron-up';

  // 3. Calculator & Tools
  if (lower.includes('calc') || lower.includes('calculator')) return 'fas fa-calculator';

  // 4. Security & Trust
  if (lower.includes('shield') || lower.includes('ssl') || lower.includes('security') || lower.includes('protect')) return 'fas fa-shield-alt';
  if (lower.includes('lock') || lower.includes('key')) return 'fas fa-lock';

  // 5. Time & History
  if (lower.includes('clock') || lower.includes('sla') || lower.includes('time') || lower.includes('speed') || lower.includes('agent') || lower.includes('history')) return 'fas fa-clock';

  // 6. User & Support
  if (lower.includes('user') || lower.includes('headset') || lower.includes('support') || lower.includes('customer')) return 'fas fa-headset';

  // 7. Ratings & Stars
  if (lower.includes('star') || lower.includes('rating')) return 'fas fa-star';

  // 8. Help & FAQs
  if (lower.includes('question') || lower.includes('help') || lower.includes('faq')) return 'fas fa-question-circle';

  // 9. Magic & Sparkles
  if (lower.includes('sparkle') || lower.includes('magic') || lower.includes('wand')) return 'fas fa-magic';

  // 10. Servers & Infrastructure
  if (lower.includes('cloud') || lower.includes('server') || lower.includes('cluster') || lower.includes('database') || lower.includes('cpu')) return 'fas fa-server';

  // 11. Search & System
  if (lower.includes('search') || lower.includes('magnif')) return 'fas fa-search';
  if (lower.includes('gear') || lower.includes('cog') || lower.includes('setting')) return 'fas fa-cog';
  if (lower.includes('globe') || lower.includes('domain') || lower.includes('web')) return 'fas fa-globe';

  // 12. Power & Analytics
  if (lower.includes('zap') || lower.includes('bolt') || lower.includes('flash') || lower.includes('power')) return 'fas fa-bolt';
  if (lower.includes('chart') || lower.includes('graph') || lower.includes('analytics') || lower.includes('bar')) return 'fas fa-chart-line';

  // 13. Commerce & Pricing
  if (lower.includes('tag') || lower.includes('price') || lower.includes('discount') || lower.includes('percent')) return 'fas fa-tag';

  // 14. Notifications & Messages
  if (lower.includes('bell') || lower.includes('notification')) return 'fas fa-bell';
  if (lower.includes('envelope') || lower.includes('mail')) return 'fas fa-envelope';

  // 15. Checkmarks & Confirmation (Features, Benefits, Checklists)
  if (
    lower.includes('check') ||
    lower.includes('tick') ||
    lower.includes('verify') ||
    lower.includes('done') ||
    lower.includes('feature-icon') ||
    lower.includes('feature-item') ||
    lower.includes('checklist') ||
    lower.includes('m20 6') ||
    lower.includes('9 17l-5') ||
    lower.includes('5 13l4 4') ||
    lower.includes('9 16.17') ||
    lower.includes('9 16.2')
  ) {
    return 'fas fa-check';
  }

  return 'fas fa-arrow-right';
}

const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

function getNodeClassNames(node) {
  if (!node) return '';
  const base = (node.className || '').trim();
  const classes = base ? base.split(/\s+/).filter(Boolean) : [];
  if (node.attributes) {
    for (const [key, val] of Object.entries(node.attributes)) {
      if (key.startsWith('data-') && val !== undefined && val !== null) {
        // Lossless hexadecimal encoding for non-alphanumeric characters (_xHH_)
        // Guarantees 100% compliance with WordPress sanitize_html_class while perfectly preserving spaces and multi-values
        const strVal = String(val).trim();
        const encodedVal = strVal.replace(/[^a-zA-Z0-9-]/g, ch => `_x${ch.charCodeAt(0).toString(16).padStart(2, '0')}_`);
        classes.push(`${key}--${encodedVal}`);
      }
    }
  }
  return classes.join(' ');
}
const STRUCTURAL_CONTAINER_TAGS = new Set([
  'section', 'article', 'header', 'footer', 'nav', 'main', 'aside',
  'div', 'ul', 'ol', 'li', 'button', 'form', 'fieldset', 'label'
]);

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

function _transformDomNodeToElementorInternal(node, parent = null) {
  if (!node) return null;

  const nodeId = node.attributes?.id || node.id || '';

  // 1. Text-only node (#text)
  if (node.tagName === '#text') {
    const text = (node.textContent || '').trim();
    if (!text) return null;
    return createHeadingWidget({
      title: text,
      header_size: 'span',
      css_classes: '',
      _element_id: nodeId
    });
  }

  // 2. SVG Vectors: if explicit FA glyph, map to IconWidget; otherwise preserve crisp native SVG micro-embed
  if (node.tagName === 'svg') {
    const rawClass = (node.className || '') + ' ' + (parent?.className || '');
    const hasExplicitFa = /(?:^|\s)(?:fa|fas|far|fab|fa-solid|fa-[a-z0-9-]+)(?:\s|$)/i.test(rawClass);
    if (hasExplicitFa) {
      const iconClass = mapSvgToFontAwesome(node.rawHtml || '', rawClass);
      return createIconWidget({
        icon: iconClass,
        view: 'default',
        size: 16,
        color: '#2563EB',
        css_classes: node.className || 'vector-icon-widget',
        _element_id: nodeId
      });
    }

    // Preserve original crisp SVG vector losslessly (100% path, viewBox, stroke, fill parity)
    const svgHtml = node.rawHtml || serializeDomNodeToHtml(node);
    return createHtmlWidget({
      html: svgHtml,
      css_classes: node.className ? `${node.className} native-vector-svg` : 'native-vector-svg',
      _element_id: nodeId
    });
  }

  // 2a. Standalone FontAwesome or Glyph Icons (e.g. <i class="fas fa-shield-halved"></i>, <span class="fa-solid fa-headset"></span>, <span>★</span>)
  const textContent = (node.textContent || '').trim();
  const hasGlyph = hasKnownGlyph(textContent || node.rawHtml || '');

  // W2: Tiny separator bullets (• · etc.) must render as inline text/span heading widget, NEVER icon
  if (['•', '·', '・', '∙'].includes(textContent)) {
    return createHeadingWidget({
      title: textContent,
      header_size: 'span',
      css_classes: node.className || '',
      _element_id: nodeId,
      _element_width: 'auto'
    });
  }

  if (
    node.tagName === 'i' ||
    (hasGlyph && (node.tagName === 'span' || node.tagName === 'em' || node.tagName === 'b' || node.tagName === 'div') && (node.children || []).length === 0) ||
    ((node.tagName === 'span' || node.tagName === 'em') &&
      node.children.length === 0 &&
      /(?:^|\s)(?:fa|fas|far|fab|fa-solid|fa-[a-z0-9-]+)(?:\s|$)/i.test(node.className || ''))
  ) {
    const rawClass = node.className || '';
    let resolvedIcon = hasGlyph ? resolveGlyphToFa5(textContent || node.rawHtml || '') : null;
    if (!resolvedIcon) {
      resolvedIcon = getFa5Equivalent(rawClass || 'fas fa-check');
    }
    const sanitizedClasses = (rawClass || '')
      .split(/\s+/)
      .filter(c => !/^fa(?:$|-|s$|r$|b$|l$|d$|t$)/i.test(c) && !/^-/i.test(c))
      .join(' ')
      .trim();
    return createIconWidget({
      icon: resolvedIcon,
      view: 'default',
      size: 16,
      color: '#2563EB',
      css_classes: sanitizedClasses,
      _element_id: nodeId
    });
  }

  // 2b. Divider & Separator lines: map to native Elementor Divider Widget
  if (node.tagName === 'hr' || (node.className && node.className.includes('divider'))) {
    return createDividerWidget({
      css_classes: node.className || 'section-divider-widget',
      _element_id: nodeId
    });
  }

  // 2c. Images (<img>): map to native Elementor Image Widget
  if (node.tagName === 'img') {
    const src = node.attributes?.src || '';
    const alt = node.attributes?.alt || '';
    const parentClass = (parent?.className || '').toLowerCase();
    const isFullBleed = parentClass.includes('media') || parentClass.includes('card-img') || parentClass.includes('cover') || parentClass.includes('thumb');

    return createImageWidget({
      url: src,
      alt,
      css_classes: node.className || 'native-card-image',
      _element_id: nodeId,
      width: isFullBleed ? { unit: '%', size: 100 } : null,
      space: isFullBleed ? { unit: '%', size: 100 } : null,
      element_width: isFullBleed ? 'inherit' : null,
      flex_align_self: isFullBleed ? 'stretch' : null
    });
  }

  // 2d. Micro-embed for unreachable browser inputs (<input type="range">, checkbox switches)
  if (node.tagName === 'input') {
    const attrs = { ...(node.attributes || {}) };
    if (nodeId && !attrs.id) attrs.id = nodeId;
    if (node.className && !attrs.class) attrs.class = node.className;

    const booleanAttrs = new Set(['checked', 'disabled', 'required', 'readonly', 'autofocus', 'multiple', 'hidden']);
    const attrPairs = Object.entries(attrs)
      .map(([k, v]) => {
        if (booleanAttrs.has(k.toLowerCase())) {
          return v === '' || v === true || v === 'true' || v === k ? k : `${k}="${v}"`;
        }
        return `${k}="${v}"`;
      })
      .join(' ');

    const htmlSnippet = `<input ${attrPairs}>`.replace(/\s{2,}/g, ' ').trim();

    return createHtmlWidget({
      html: htmlSnippet,
      css_classes: node.className || 'micro-embed-input'
    });
  }

  // 2e. Atomic Toggle Switch / Custom Checkbox Pair Detection
  // If this container is a custom toggle switch wrapping an <input type="checkbox/radio">
  // and its adjacent visual handle (e.g. <span class="switch-slider">), preserve it
  // as an atomic micro-embed HTML widget so CSS sibling selectors (input:checked + .slider) remain 100% intact.
  const hasInputChild = Array.isArray(node.children) && node.children.some(c => c.tagName === 'input' && (c.attributes?.type === 'checkbox' || c.attributes?.type === 'radio'));
  const hasHeadingOrParagraph = Array.isArray(node.children) && node.children.some(c => HEADING_TAGS.has(c.tagName) || c.tagName === 'p');
  const isToggleClass = /(?:^|\s)(?:switch|toggle|checkbox|radio)(?:-wrap|-box|-container|-item|\s|$)/i.test(node.className || '');
  const hasSiblingVisualHandle = Array.isArray(node.children) && node.children.some(c => (c.tagName === 'span' || c.tagName === 'div' || c.tagName === 'em') && /(?:slider|knob|handle|indicator|track|switch|toggle)/i.test(c.className || ''));

  if (hasInputChild && !hasHeadingOrParagraph && (isToggleClass || hasSiblingVisualHandle)) {
    // Ensure the outer wrapper is a semantic <label for="input-id"> so clicking the visual handle
    // automatically toggles the checkbox natively in any browser!
    const inputChild = node.children.find(c => c.tagName === 'input');
    const inputId = inputChild?.attributes?.id || inputChild?.id || '';

    const existingStyle = node.attributes?.style || '';
    const styleWithDisplay = existingStyle.includes('display')
      ? existingStyle
      : (existingStyle ? `${existingStyle}; display: inline-block;` : 'display: inline-block;');

    const labelNode = {
      ...node,
      tagName: 'label',
      attributes: {
        ...(node.attributes || {}),
        style: styleWithDisplay,
        ...(inputId ? { for: inputId } : {})
      }
    };

    return createHtmlWidget({
      html: serializeDomNodeToHtml(labelNode),
      css_classes: node.className || 'switch-wrap'
    });
  }

  // 2f. Inline Rich Text Preservation (Spans with dynamic IDs inside text, e.g. price breakdown, counter phrases)
  // Prevents sentences like "Baseline: $<span id="bd-base">116</span> | Add-ons: $<span id="bd-addons">0</span>"
  // from shattering into disconnected separate headings, keeping inline flow & JS selectors 100% intact!
  const INLINE_TAGS = new Set(['#text', 'span', 'strong', 'b', 'em', 'i', 'u', 'small', 'code', 'sub', 'sup', 'mark']);
  const hasChildren = Array.isArray(node.children) && node.children.length > 0;
  const hasOnlyInlineChildren = hasChildren && node.children.every(c => INLINE_TAGS.has(c.tagName));
  const hasDirectNonEmptyText = hasChildren && node.children.some(c => c.tagName === '#text' && c.textContent && c.textContent.trim().length > 0);
  const containsInnerSpanOrFormattedTag = hasChildren && node.children.some(c => c.tagName === 'span' || c.tagName === 'strong' || c.tagName === 'b' || c.tagName === 'em');

  if (hasOnlyInlineChildren && hasDirectNonEmptyText && containsInnerSpanOrFormattedTag && (node.tagName === 'div' || node.tagName === 'p' || node.tagName === 'span')) {
    const innerHtml = node.children.map(serializeDomNodeToHtml).join('');
    return createTextEditorWidget({
      editor: innerHtml,
      css_classes: node.className,
      _element_id: nodeId
    });
  }

  // 3. Headings: h1 - h6
  if (HEADING_TAGS.has(node.tagName)) {
    const rawTitle = node.children && node.children.length > 0
      ? node.children.map(serializeDomNodeToHtml).join('')
      : node.textContent.trim();
    const headingTitle = nodeId ? `<span id="${nodeId}">${rawTitle}</span>` : rawTitle;
    return createHeadingWidget({
      title: headingTitle,
      header_size: node.tagName,
      css_classes: getNodeClassNames(node),
      _element_id: nodeId
    });
  }

  // 4. Paragraphs and spans with plain text
  if ((node.tagName === 'p' || node.tagName === 'span' || node.tagName === 'label') && node.isTextOnly()) {
    const rawTitle = node.textContent.trim();
    const headingTitle = nodeId ? `<span id="${nodeId}">${rawTitle}</span>` : rawTitle;
    return createHeadingWidget({
      title: headingTitle,
      header_size: node.tagName === 'p' ? 'p' : 'span',
      css_classes: getNodeClassNames(node),
      _element_id: nodeId
    });
  }

  // 5. Interactive Buttons & CTA Links (<button>, <a role="button">, or links with button semantics)
  const isButtonTag = node.tagName === 'button' || (node.tagName === 'input' && ['button', 'submit', 'reset'].includes(node.attributes?.type));
  const isButtonSemantics = node.attributes?.role === 'button' || /\b(?:btn|button|cta)\b/i.test(node.className || '');
  const hasStructuralChildren = Array.isArray(node.children) && node.children.some(c => 
    !INLINE_TAGS.has(c.tagName) && c.tagName !== '#text' && c.tagName !== 'svg' && c.tagName !== 'i' && c.tagName !== 'span' && c.tagName !== 'strong' && c.tagName !== 'em' && c.tagName !== 'b'
  );

  if ((isButtonTag || (node.tagName === 'a' && isButtonSemantics)) && !hasStructuralChildren) {
    const text = (node.textContent || node.attributes?.value || '').trim();
    const href = node.attributes?.href || '#';
    const rawClass = getNodeClassNames(node);
    const isBlockOrFull = node.style?.display === 'block' || node.style?.width === '100%' || /\b(?:w-full|block|stretched|full-width)\b/i.test(rawClass);
    return createButtonWidget({
      text: text || 'Click Here',
      link: href,
      css_classes: rawClass,
      align: isBlockOrFull ? 'justify' : 'center',
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      _element_id: nodeId
    });
  }

  // Links (<a>) that are not simple buttons
  if (node.tagName === 'a') {

    if (node.children && node.children.length > 0) {
      const childElements = node.children.map(c => transformDomNodeToElementor(c, node)).filter(Boolean);
      return createContainer({
        direction: node.style.display === 'flex' ? (node.style['flex-direction'] || 'row') : 'row',
        align_items: node.style['align-items'] || 'center',
        justify_content: node.style['justify-content'] || 'flex-start',
        gap: node.style.gap ? parseInt(node.style.gap) : 8,
        css_classes: getNodeClassNames(node) || 'interactive-link-container',
        _element_id: nodeId,
        elements: childElements
      });
    } else {
      return createHeadingWidget({
        title: node.textContent.trim(),
        header_size: 'span',
        css_classes: getNodeClassNames(node),
        _element_id: nodeId
      });
    }
  }

  // 6. Containers (div, section, button, ul, li, etc.)
  // Recursively map children
  const elements = [];
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      const el = transformDomNodeToElementor(child, node);
      if (el) {
        elements.push(el);
      }
    }
  }

  // If a container has no children but has text, convert to text widget
  if (elements.length === 0 && node.textContent.trim().length > 0) {
    return createTextEditorWidget({
      editor: node.textContent.trim(),
      css_classes: getNodeClassNames(node),
      _element_id: nodeId
    });
  }

  // Build responsive Flexbox container
  const isGrid = node.style?.display === 'grid' || (node.className && /\b(?:grid|gallery|cards|portfolio)\b/i.test(node.className));

  const allChildrenInline = Array.isArray(node.children) && node.children.length > 0 &&
    node.children.every(c => INLINE_TAGS.has(c.tagName));
  const isIconPlusTextRow = Array.isArray(node.children) && node.children.length === 2 &&
    (node.children[0].tagName === 'svg' || node.children[0].tagName === 'i' || (node.children[0].className || '').includes('icon')) &&
    (INLINE_TAGS.has(node.children[1].tagName) || HEADING_TAGS.has(node.children[1].tagName) || node.children[1].tagName === 'p');

  const isLockupOrInlineRow = allChildrenInline || isIconPlusTextRow ||
    (node.className && /\b(?:lockup|price|amount|badge|pill|tag|stat|metric|meta|rating)\b/i.test(node.className));

  const isHorizontalRow = isGrid || isLockupOrInlineRow || node.className.includes('row') || node.className.includes('trigger') || node.className.includes('addon') || node.className.includes('switcher') || node.className.includes('horizontal');
  const isFlex = node.style.display === 'flex' || isHorizontalRow || node.tagName === 'button';
  const direction = isGrid ? 'row' : (node.style['flex-direction'] || (isFlex ? (node.className.includes('list') || node.className.includes('stack') ? 'column' : 'row') : 'column'));
  const alignItems = node.style['align-items'] || (isFlex ? (isGrid ? 'stretch' : (allChildrenInline ? 'baseline' : 'center')) : 'stretch');
  const justifyContent = node.style['justify-content'] || (node.className.includes('addon') ? 'space-between' : 'flex-start');
  const gap = node.style.gap ? parseInt(node.style.gap) : (isGrid ? 24 : (isLockupOrInlineRow ? 4 : 0));

  // Universal Flex Row Blockification Invariant:
  // In Elementor flex rows, widgets without explicit percentage widths default to 100% width
  // unless _element_width: 'auto' is assigned. Enforce auto-width on all non-column children in row containers.
  if (direction === 'row' && !isGrid) {
    for (const child of elements) {
      if (child && child.settings) {
        const hasExplicitColumnWidth = child.settings.width && child.settings.width.unit === '%' && child.settings.width.size > 20;
        if (!hasExplicitColumnWidth) {
          child.settings._element_width = 'auto';
          const isRigidGlyph = child.widgetType === 'icon' || (child.settings?.css_classes || '').includes('icon') || (child.settings?.css_classes || '').includes('currency') || (child.settings?.css_classes || '').includes('switch');
          if (isRigidGlyph) {
            child.settings._flex_size = 'none';
            child.settings.flex_shrink = 0;
          } else {
            child.settings.flex_shrink = 1;
          }
        }
      }
    }
  }

  const containerConfig = {
    direction,
    align_items: alignItems,
    justify_content: justifyContent,
    gap,
    css_classes: getNodeClassNames(node),
    _element_id: nodeId,
    elements
  };

  if (isGrid) {
    containerConfig.wrap = 'wrap';
    containerConfig.flex_wrap = 'wrap';
  } else if (isLockupOrInlineRow) {
    containerConfig.wrap = 'nowrap';
    containerConfig.flex_wrap = 'nowrap';
  }

  return createContainer(containerConfig);
}

function transformDomNodeToElementor(node, parent = null) {
  const result = _transformDomNodeToElementorInternal(node, parent);
  if (result && node && node.domNodeId) {
    result._dom_id = node.domNodeId;
    if (result.settings) {
      result.settings._dom_id = node.domNodeId;
    }
  }
  return result;
}

module.exports = {
  transformDomNodeToElementor,
  mapSvgToFontAwesome
};

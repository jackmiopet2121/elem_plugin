/**
 * Black Box Rules Autonomous Universal Enforcer.
 * Reads compiler-rules.json directly and executes all active architectural rules
 * on the compiled Elementor AST, guaranteeing 100% universal zero-rule-skipping.
 * Agnostic across ALL landing page types, sections, and design systems.
 */
const { getRule, loadRules } = require('./rules-engine');
const { generateId } = require('./id-generator');
const { detectPrimaryFontFamily } = require('../parser/font-detector');
const { executeDeclarativeRules } = require('./declarative-rule-executor');
const { normalizeElementorSchema } = require('../normalizers/schema-normalizer');

const zeroPadding = {
  unit: 'px',
  top: '0',
  right: '0',
  bottom: '0',
  left: '0',
  isLinked: true
};

const zeroMargin = {
  unit: 'px',
  top: '0',
  right: '0',
  bottom: '0',
  left: '0',
  isLinked: true
};

function detectAstFontFamily(contentElements) {
  let detected = null;
  function scan(node) {
    if (detected || !node) return;
    if (node.widgetType === 'html' && node.settings?.html) {
      const found = detectPrimaryFontFamily('', node.settings.html);
      if (found && found !== 'Inter') {
        detected = found;
        return;
      }
    }
    if (node.settings?.typography_font_family && node.settings.typography_font_family !== 'Inter') {
      detected = node.settings.typography_font_family;
      return;
    }
    if (Array.isArray(node.elements)) {
      for (const child of node.elements) scan(child);
    }
  }
  for (const root of contentElements) scan(root);
  return detected || 'Inter';
}

function enforceBlackBoxRules(contentElements, context = {}) {
  if (!Array.isArray(contentElements) || contentElements.length === 0) return;
  normalizeElementorSchema(contentElements);
  const rules = loadRules();
  const fontFamily = context.fontFamily || detectAstFontFamily(contentElements);
  const runtimeContext = { ...context, fontFamily };

  // 1. Declarative Rules Engine (Automatic Schema-Driven Execution from compiler-rules.json)
  executeDeclarativeRules(contentElements, rules, runtimeContext);

  // 2. Structural & Contextual AST Pass
  for (const rootEl of contentElements) {
    if (rootEl.elType === 'container') {
      enforceRootSectionRules(rootEl, rules, runtimeContext);
    }
    enforceTreeRulesRecursive(rootEl, null, rules, runtimeContext);
  }
  normalizeElementorSchema(contentElements);
}

/**
 * 1. Root Section Rules (desktop boxed width + mobile edge-to-edge padding)
 */
function enforceRootSectionRules(rootEl, rules, context) {
  const s = rootEl.settings || (rootEl.settings = {});

  // Rule: layout.boxedWidthParity
  if (s.content_width === 'boxed' || !s.content_width) {
    s.content_width = 'boxed';
    let targetWidth = 1200;
    if (s.width && s.width.unit === 'px' && s.width.size > 300) {
      targetWidth = s.width.size;
    } else if (context.boxedWidth && context.boxedWidth > 300) {
      targetWidth = context.boxedWidth;
    } else if (rules.layout?.defaultBoxedWidth) {
      targetWidth = rules.layout.defaultBoxedWidth;
    }
    s.width = { unit: 'px', size: targetWidth };
    s.boxed_width = { unit: 'px', size: targetWidth };
  }

  // Rule: responsive.universalMobilePadding & width_mobile (fallback only)
  s.width_mobile = s.width_mobile || { unit: '%', size: 100 };
  if (!s.padding_mobile && !s._padding_mobile) {
    s.padding_mobile = {
      unit: 'px',
      top: '56',
      right: '16',
      bottom: '56',
      left: '16',
      isLinked: false
    };
    s._padding_mobile = s.padding_mobile;
  }

  // Tablet padding (fallback only)
  if (!s.padding_tablet && !s._padding_tablet) {
    s.padding_tablet = {
      unit: 'px',
      top: '56',
      right: '20',
      bottom: '56',
      left: '20',
      isLinked: false
    };
    s._padding_tablet = s.padding_tablet;
  }
}

function isDarkColor(hex = '') {
  if (!hex || typeof hex !== 'string') return false;
  const cleaned = hex.replace('#', '').trim();
  if (cleaned.length !== 6 && cleaned.length !== 3) return false;
  const full = cleaned.length === 3 ? cleaned.split('').map(c => c + c).join('') : cleaned;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return false;
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness < 128;
}

/**
 * 2. Recursive Universal Rules Across the entire AST (100% Class-Agnostic)
 */
function enforceTreeRulesRecursive(node, parent, rules, context) {
  if (!node) return;
  const s = node.settings || (node.settings = {});

  if (node.elType === 'container') {
    const hasExplicitPadding = Boolean(
      s.padding || s._padding || s.padding_tablet || s.padding_mobile
    );
    const hasVisualSurface = Boolean(
      s.background_color ||
      s._background_color ||
      s.border_border ||
      s.border_color ||
      s.box_shadow
    );

    // Rule: layout.neutralizeKitPadding
    // Transparent, unstyled inner layout wrappers must declare zero padding so Elementor Kit default 10px doesn't corrupt flex layouts.
    if (node.isInner && !hasExplicitPadding && !hasVisualSurface) {
      s.padding = { ...zeroPadding };
      s._padding = { ...zeroPadding };
    }

    // Rule: layout.zeroPaddingOnCollapseWrappers
    // Any collapsible container MUST declare zero padding in settings so max-height: 0 collapses completely.
    const isCollapsible = (
      (s.overflow === 'hidden' && (s.height?.size === 0 || s.max_height?.size === 0)) ||
      node.attributes?.['aria-hidden'] === 'true' ||
      node.attributes?.hidden !== undefined
    );
    if (isCollapsible) {
      s.padding = { ...zeroPadding };
      s._padding = { ...zeroPadding };
      s.padding_tablet = { ...zeroPadding };
      s.padding_mobile = { ...zeroPadding };
    }

    // Rule: responsive.mobileFullWidthButtonJustify (parent container cross-axis stretch)
    const hasFullWidthButton = Array.isArray(node.elements) && node.elements.some(child => {
      if (child.widgetType === 'button') {
        const cs = child.settings || {};
        return cs._element_width_mobile === '100' || cs.align_mobile === 'justify';
      }
      return false;
    });

    if (hasFullWidthButton) {
      s.align_items_mobile = 'stretch';
      s.flex_align_items_mobile = 'stretch';
    }

    // Fit-content width preservation across responsive breakpoints (100% CSS-driven)
    if (s.width && s.width.size === 'fit-content') {
      s.content_width = 'full';
      s.width_tablet = { unit: 'custom', size: 'fit-content' };
      s.width_mobile = { unit: 'custom', size: 'fit-content' };
      s._flex_size = 'none';
      s._flex_size_tablet = 'none';
      s._flex_size_mobile = 'none';
      s.flex_shrink = 0;
      s.flex_shrink_tablet = 0;
      s.flex_shrink_mobile = 0;
    }

    // Rule: segmentedSwitcherFlexRowCalibration
    // Segmented switchers & toggles: containers containing exclusively 2 or more button widgets
    const isButtonGroup = (
      Array.isArray(node.elements) &&
      node.elements.length >= 2 &&
      node.elements.every(c => c.widgetType === 'button')
    );

    if (isButtonGroup) {
      if (!s.direction) {
        s.direction = 'row';
        s.flex_direction = 'row';
      }
      if (!s.align_items) {
        s.align_items = 'center';
        s.flex_align_items = 'center';
      }
      s.content_width = 'full';

      for (const child of node.elements) {
        if (child.widgetType === 'button' && child.settings) {
          const cs = child.settings;
          cs._element_width = 'auto';
          cs._flex_size = 'none';
          cs.flex_shrink = 0;
          cs.align = 'center';

          if (!cs._margin) {
            cs._margin = { ...zeroMargin };
          }

          // Prevent Elementor default theme green button background from bleeding on inactive buttons
          if (!cs.background_color || cs.background_color === '#10b981') {
            cs.background_color = 'rgba(0, 0, 0, 0)';
          }
        }
      }
    }

    // Rule: sliderTrackFullWidth
    // Detected by presence of range inputs inside micro-embed html widgets
    const hasRangeInput = Array.isArray(node.elements) && node.elements.some(c =>
      c.widgetType === 'html' && (c.settings?.html || '').includes('type="range"')
    );

    if (hasRangeInput) {
      s.content_width = 'full';
      s.width = { unit: '%', size: 100 };
      s.direction = 'column';
      s.flex_direction = 'column';
      s.align_items = 'stretch';
      s.flex_align_items = 'stretch';
      for (const child of node.elements) {
        if (child.widgetType === 'html' && child.settings) {
          child.settings.width = { unit: '%', size: 100 };
          child.settings._element_width = 'inherit';
        }
      }
    }

    // Rule: negativeMargins.floatingCardBadge
    // Floating top badge detected via negative top margin (< 0)
    const hasNegativeTopMargin = Boolean(
      (s.margin && parseInt(s.margin.top, 10) < 0) ||
      (s._margin && parseInt(s._margin.top, 10) < 0)
    );

    if (hasNegativeTopMargin) {
      s.align_self = 'center';
      s.flex_align_self = 'center';
      s._flex_align_self = 'center';
      s.width = { unit: 'custom', size: 'fit-content' };
      s.width_tablet = { unit: 'custom', size: 'fit-content' };
      s.width_mobile = { unit: 'custom', size: 'fit-content' };
      if (parent && parent.settings) {
        if (parent.settings.padding) parent.settings.padding.top = '0';
        if (parent.settings._padding) parent.settings._padding.top = '0';
      }
    }

    // Rule: universalFlexRowChildAutoWidth & currencyGlyphKerning
    // In ANY horizontal row container, non-percentage child widgets must have _element_width: 'auto'
    // so they do not stretch to 100% or wrap inappropriately (covers price rows, metric counters, feature checklists, inline badges)
    const isRowContainer = s.direction === 'row' || s.flex_direction === 'row';
    if (isRowContainer && Array.isArray(node.elements)) {
      for (const child of node.elements) {
        if (child.settings) {
          const cs = child.settings;
          const hasExplicitPercentWidth = cs.width && cs.width.unit === '%' && cs.width.size > 0;
          if (!hasExplicitPercentWidth && cs._element_width !== 'inherit') {
            cs._element_width = 'auto';
            cs._flex_size = 'none';
            cs.flex_shrink = 0;
          }

          // Optical currency glyph kerning
          if (child.widgetType === 'heading') {
            const title = (cs.title || '').trim();
            if (/^[$€£¥₹]/.test(title) || ['usd', 'eur', 'mad'].includes(title.toLowerCase())) {
              const kerning = rules.currencyGlyphKerning?.currencyRightMargin || -3;
              if (!cs._margin) cs._margin = { ...zeroMargin };
              cs._margin.right = String(kerning);
              cs._margin.isLinked = false;
            }
          }
        }
      }
    }
  }

  // Universal DOM ID Preservation on all widgets
  if (node.elType === 'widget' && (s.id || s._element_id)) {
    if (s.id && !s._element_id) {
      s._element_id = s.id;
    }
  }

  // Rule: antiDuplicateIdContract (Universal Form Control Protection)
  // When an HTML widget contains an inner element with an 'id' (e.g. <input id="xyz">, <select id="abc">),
  // setting _element_id or id on the outer widget wrapper causes a duplicate ID collision in the DOM.
  // In DOM order, document.getElementById('xyz') resolves to the outer <div> wrapper instead of the form control,
  // corrupting .value, .checked, and event listeners into NaN.
  if (node.elType === 'widget' && node.widgetType === 'html' && s.html) {
    const idRegex = /\bid=["']([^"']+)["']/gi;
    let match;
    const innerIds = new Set();
    while ((match = idRegex.exec(s.html)) !== null) {
      innerIds.add(match[1]);
    }
    if (s._element_id && innerIds.has(s._element_id)) {
      delete s._element_id;
    }
    if (s.id && innerIds.has(s.id)) {
      delete s.id;
    }
  }

  // Rule: responsive.mobileFullWidthButtonJustify (Universal Button Contract)
  if (node.elType === 'widget' && node.widgetType === 'button') {
    s.typography_typography = 'custom';
    if (!s.typography_font_family) {
      s.typography_font_family = context.fontFamily;
    }
    if (s._element_width_mobile === '100' || s.width_mobile?.size === 100) {
      s.align_mobile = 'justify';
      s.align = s.align || 'center';
      s._element_width_mobile = '100';
    }
  }

  // Rule: typography.typographyCustomEnforcement (Universal Heading Contract)
  if (node.elType === 'widget' && node.widgetType === 'heading') {
    s.typography_typography = 'custom';
    if (!s.typography_font_family) {
      s.typography_font_family = context.fontFamily;
    }
    if (!s.typography_font_weight) {
      const size = (s.header_size || '').toLowerCase();
      s.typography_font_weight = (size === 'h1' || size === 'h2') ? '800' : '700';
    }
    // Rule: domIdPreservationContract
    if (s.id && !s._element_id) {
      s._element_id = s.id;
    }
    if (!s.title_color) {
      const parentBg = (parent && parent.settings ? (parent.settings.background_color || '') : '').toLowerCase();
      s.title_color = isDarkColor(parentBg) ? '#FFFFFF' : '#0F172A';
    }

    // Intrinsic auto-width for inline or badge headings
    if (s.background_color || s.border_radius || parent?.settings?.direction === 'row') {
      s._element_width = 'auto';
      s._flex_size = 'none';
      s.flex_shrink = 0;
    }
  }

  // Universal Text Editor Typography & Checklist Checkmarks
  if (node.elType === 'widget' && node.widgetType === 'text-editor') {
    if (s.typography_font_size || s.typography_font_weight || s.typography_line_height) {
      s.typography_typography = 'custom';
      if (!s.typography_font_family) {
        s.typography_font_family = context.fontFamily;
      }
    }
    if (s.editor) {
      let editorHtml = s.editor;
      if (editorHtml.includes('&#10003;') || editorHtml.includes('✓') || editorHtml.includes('&#10004;') || editorHtml.includes('✔')) {
        const solidCheckCircle = `<svg class="bullet-check-icon" viewBox="0 0 20 20" fill="#2563EB" style="width: 18px; height: 18px; min-width: 18px; margin-top: 2px; flex-shrink: 0; display: inline-block; vertical-align: middle;"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd" /></svg>`;
        editorHtml = editorHtml.replace(/<span[^>]*>[✓✔&#10003;&#10004;]+<\/span>/gi, solidCheckCircle)
                               .replace(/[✓✔]|&#10003;|&#10004;/g, solidCheckCircle);
        s.editor = editorHtml;
      }
    }
  }

  // Rule: images.validExtensions & images.cardMediaFullBleed
  if (node.elType === 'widget' && node.widgetType === 'image') {
    const validExts = rules.images?.validExtensions || ['.jpg', '.jpeg', '.png', '.webp', '.svg', '.gif', '.avif'];
    if (s.image && s.image.url) {
      const url = s.image.url.trim();
      if (url && !validExts.some(ext => url.toLowerCase().endsWith(ext) || url.toLowerCase().includes(ext + '?'))) {
        s.image.url = url + (rules.images?.defaultFallbackExtension || '.jpg');
      }
    }

    const isSoleChild = parent && Array.isArray(parent.elements) && parent.elements.length === 1;
    if (isSoleChild && (parent.settings?.align_items === 'stretch' || parent.settings?.content_width === 'full')) {
      s.width = { unit: '%', size: 100 };
      s.space = { unit: '%', size: 100 };
      s._element_width = 'inherit';
      s._flex_size = 'none';
      s._flex_align_self = 'stretch';
    }
  }

  // Rule: icons.boxCalibrations (geometric box centering)
  if (node.elType === 'widget' && node.widgetType === 'icon') {
    const parentWidth = parent?.settings?.width?.size;
    if (parentWidth && parentWidth <= 28) {
      if (!s._margin) s._margin = { ...zeroMargin };
      s._margin.top = '1';
      s._margin.bottom = '-1';
      s._margin.isLinked = false;
    } else if (parentWidth && parentWidth <= 64 && parent && parent.settings) {
      parent.settings.align_items = 'center';
      parent.settings.justify_content = 'center';
      if (!s.size?.size && !s.typography_font_size?.size) {
        s.size = { unit: 'px', size: Math.min(24, Math.round(parentWidth * 0.45)) };
      }
      s._margin = { ...zeroMargin };
    }
  }


  // Recurse into children
  if (Array.isArray(node.elements)) {
    for (const child of node.elements) {
      enforceTreeRulesRecursive(child, node, rules, context);
    }
  }
}

module.exports = {
  enforceBlackBoxRules
};

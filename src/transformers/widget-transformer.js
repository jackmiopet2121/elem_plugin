/**
 * Widget Transformer.
 * Generates 100% native Elementor Free Widgets with strict leading underscore box-model properties.
 */
const { generateId } = require('../core/id-generator');
const { getFa5Equivalent } = require('../core/rules-engine');
const { deepUnwrap } = require('../smart/scalar-contract');

function normalizeLink(link) {
  let url = link;
  let guard = 0;
  while (url && typeof url === 'object' && guard++ < 5) url = (url.url ?? url.link ?? '');
  if (typeof url !== 'string') url = String(url || '');
  const src = (link && typeof link === 'object') ? link : {};
  return {
    url: url || '#',
    is_external: Boolean(src.is_external),
    nofollow: Boolean(src.nofollow)
  };
}

function normalizeWidgetInputs(options = {}, widgetType = '') {
  const opts = { ...options };

  // 1. URL / Asset aliases (G1)
  if (widgetType === 'image' || opts.image || opts.src) {
    const rawUrl = opts.url || opts.image?.url || opts.src || '';
    opts.url = typeof rawUrl === 'string' ? rawUrl : String(deepUnwrap(rawUrl, 'url') || '');
  }

  // 2. Link aliases (G1)
  if (widgetType === 'button' || opts.link !== undefined || opts.href) {
    const rawLink = opts.link !== undefined ? opts.link : (opts.href || opts.url || '#');
    opts.link = normalizeLink(rawLink);
  }

  // 3. Icon aliases (G1)
  if (widgetType === 'icon' || opts.selected_icon || opts.icon) {
    let rawIcon = opts.selected_icon ?? opts.icon ?? opts.value ?? '';
    let guard = 0;
    while (rawIcon && typeof rawIcon === 'object' && guard++ < 5) {
      rawIcon = (rawIcon.value ?? rawIcon.icon ?? '');
    }
    if (typeof rawIcon === 'string' && rawIcon.length > 0) {
      opts.icon = rawIcon;
    }
  }

  // 4. Box Model Normalization (scalar -> 4-side object)
  if (opts._margin && !opts.margin) opts.margin = opts._margin;
  if (opts._padding && !opts.padding) opts.padding = opts._padding;
  for (const boxKey of ['margin', 'padding', 'border_radius', 'border_width', 'button_padding', '_margin', '_padding']) {
    if (opts[boxKey] !== undefined && (typeof opts[boxKey] === 'number' || typeof opts[boxKey] === 'string')) {
      const v = String(opts[boxKey]);
      opts[boxKey] = { top: v, right: v, bottom: v, left: v, isLinked: true };
    }
  }

  return opts;
}

function createHeadingWidget(options = {}) {
  const {
    title = '',
    header_size = 'h3',
    align = 'left',
    color = '#0f172a',
    font_size = null,
    line_height = null,
    font_weight = null,
    font_family = null,
    margin = { top: 0, right: 0, bottom: 0, left: 0 },
    padding = { top: 0, right: 0, bottom: 0, left: 0 },
    css_classes = '',
    element_width = null
  } = options;

  const settings = {
    title,
    header_size,
    align,
    title_color: color,
    typography_typography: 'custom',
    ...(font_family ? { typography_font_family: font_family } : {}),

    // Strict leading underscores on widgets
    _margin: {
      unit: 'px',
      top: String(margin.top || 0),
      right: String(margin.right || 0),
      bottom: String(margin.bottom || 0),
      left: String(margin.left || 0),
      isLinked: false
    },
    _padding: {
      unit: 'px',
      top: String(padding.top || 0),
      right: String(padding.right || 0),
      bottom: String(padding.bottom || 0),
      left: String(padding.left || 0),
      isLinked: false
    },
    _css_classes: css_classes,
    css_classes: css_classes
  };

  if (options._element_id || options.id) {
    settings._element_id = options._element_id || options.id;
  }

  if (font_size) {
    settings.typography_font_size = { unit: 'px', size: font_size };
  }
  if (line_height) {
    settings.typography_line_height = { unit: 'em', size: line_height };
  }
  if (font_weight) {
    settings.typography_font_weight = String(font_weight);
  }
  if (element_width) {
    settings._element_width = element_width;
    settings._flex_size = 'none';
  }

  const sid = options._sid || options._dom_id || undefined;
  if (sid) { settings._sid = sid; settings._dom_id = sid; }
  return {
    id: generateId(),
    elType: 'widget',
    widgetType: 'heading',
    _sid: sid,
    _dom_id: sid,
    settings: { ...settings, ...options },
    elements: []
  };
}

function createTextEditorWidget(options = {}) {
  const {
    editor = '',
    align = 'left',
    color = '#64748b',
    font_size = 14,
    line_height = 1.4,
    margin = { top: 0, right: 0, bottom: 0, left: 0 },
    css_classes = ''
  } = options;

  const sid = options._sid || options._dom_id || undefined;
  const defaultSettings = {
    editor,
    align,
    text_color: color,
    typography_typography: 'custom',
    typography_font_size: { unit: 'px', size: font_size },
    typography_line_height: { unit: 'em', size: line_height },
    _margin: {
      unit: 'px',
      top: String(margin.top || 0),
      right: String(margin.right || 0),
      bottom: String(margin.bottom || 0),
      left: String(margin.left || 0),
      isLinked: false
    },
    _padding: { unit: 'px', top: '0', right: '0', bottom: '0', left: '0', isLinked: true },
    _css_classes: css_classes,
    css_classes: css_classes,
    ...(options._element_id || options.id ? { _element_id: options._element_id || options.id } : {})
  };

  return {
    id: generateId(),
    elType: 'widget',
    widgetType: 'text-editor',
    _sid: sid,
    _dom_id: sid,
    settings: {
      ...defaultSettings,
      ...options,
      ...(sid ? { _sid: sid, _dom_id: sid } : {})
    },
    elements: []
  };
}

function stripSidAnnotations(html) {
  if (typeof html !== 'string' || !html) return html;
  return html.replace(/<[^>]+>/g, tag => tag.replace(/\s+data-(?:sid[\w-]*|dom-id)(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, ''));
}

function createHtmlWidget(options = {}) {
  const {
    html = '',
    margin = { top: 0, right: 0, bottom: 0, left: 0 },
    css_classes = '',
    element_width = null
  } = options;

  const cleanedHtml = stripSidAnnotations(html);

  const settings = {
    html: cleanedHtml,
    _margin: {
      unit: 'px',
      top: String(margin.top || 0),
      right: String(margin.right || 0),
      bottom: String(margin.bottom || 0),
      left: String(margin.left || 0),
      isLinked: false
    },
    _padding: { unit: 'px', top: '0', right: '0', bottom: '0', left: '0', isLinked: true },
    _css_classes: css_classes,
    css_classes: css_classes,
    ...(options._element_id || options.id ? { _element_id: options._element_id || options.id } : {})
  };

  if (options.width) {
    settings.width = options.width;
    settings._flex_size = 'none';
  }
  if (options.min_height) {
    settings.min_height = options.min_height;
  }
  if (options._flex_size) {
    settings._flex_size = options._flex_size;
  }

  if (element_width) {
    settings._element_width = element_width;
    settings._flex_size = 'none';
  }

  const sid = options._sid || options._dom_id || undefined;
  if (sid) { settings._sid = sid; settings._dom_id = sid; }
  return {
    id: generateId(),
    elType: 'widget',
    widgetType: 'html',
    _sid: sid,
    _dom_id: sid,
    settings: { ...options, ...settings },
    elements: []
  };
}

function createIconWidget(rawOptions = {}) {
  const options = normalizeWidgetInputs(rawOptions, 'icon');
  const {
    icon = 'fas fa-arrow-right',
    view = 'default',
    shape = 'circle',
    size = 14,
    color = null,
    primary_color = null,
    secondary_color = null,
    icon_padding = null,
    margin = { top: 0, right: 0, bottom: 0, left: 0 },
    css_classes = '',
    element_width = null
  } = options;

  const resolvedIcon = getFa5Equivalent(icon);
  const finalColor = view === 'stacked' ? (primary_color || color || '#2563EB') : (color || primary_color);
  const resolvedShape = (view === 'stacked' || view === 'framed') ? (options.shape || shape || 'circle') : '';

  const effectiveMargin = options._margin || options.margin || margin;
  const effectivePadding = options._padding || options.padding;

  const settings = {
    selected_icon: {
      value: resolvedIcon,
      library: 'fa-solid'
    },
    view,
    ...(resolvedShape ? { shape: resolvedShape } : {}),
    size: { unit: 'px', size },
    ...(finalColor ? { primary_color: finalColor } : {}),
    _margin: {
      unit: effectiveMargin?.unit || 'px',
      top: String(effectiveMargin?.top ?? 0),
      right: String(effectiveMargin?.right ?? 0),
      bottom: String(effectiveMargin?.bottom ?? 0),
      left: String(effectiveMargin?.left ?? 0),
      isLinked: Boolean(effectiveMargin?.isLinked)
    },
    _padding: effectivePadding ? {
      unit: effectivePadding?.unit || 'px',
      top: String(effectivePadding?.top ?? 0),
      right: String(effectivePadding?.right ?? 0),
      bottom: String(effectivePadding?.bottom ?? 0),
      left: String(effectivePadding?.left ?? 0),
      isLinked: Boolean(effectivePadding?.isLinked)
    } : { unit: 'px', top: '0', right: '0', bottom: '0', left: '0', isLinked: true },
    _css_classes: css_classes,
    css_classes: css_classes
  };

  if (options.align) {
    settings.align = options.align;
  }
  if (options.align_self || options._flex_align_self) {
    const aSelf = options.align_self || options._flex_align_self;
    settings.align_self = aSelf;
    settings.flex_align_self = aSelf;
    settings._flex_align_self = aSelf;
  }

  if (view === 'stacked' && secondary_color) {
    settings.secondary_color = secondary_color;
  }
  if (icon_padding !== null) {
    settings.icon_padding = { unit: 'px', size: icon_padding };
  }
  if (element_width) {
    settings._element_width = element_width;
    settings._flex_size = 'none';
  }

  const sid = options._sid || options._dom_id || undefined;
  if (sid) { settings._sid = sid; settings._dom_id = sid; }
  return {
    id: generateId(),
    elType: 'widget',
    widgetType: 'icon',
    _sid: sid,
    _dom_id: sid,
    settings: { ...options, ...settings },
    elements: []
  };
}

function createButtonWidget(rawOptions = {}) {
  const options = normalizeWidgetInputs(rawOptions, 'button');
  const {
    text = 'Click Here',
    link = '#',
    align = 'center',
    background_color = null,
    hover_background_color = null,
    text_color = null,
    border_radius = null,
    padding = null,
    margin = { top: 0, right: 0, bottom: 0, left: 0 },
    css_classes = '',
    font_weight = null,
    font_family = null
  } = options;

  const settings = {
    text,
    link: normalizeLink(link),
    align,
    typography_typography: 'custom',
    ...(font_family ? { typography_font_family: font_family } : {}),
    ...(font_weight ? { typography_font_weight: String(font_weight) } : {}),
    ...(text_color ? { button_text_color: text_color } : {}),
    ...(background_color ? { background_color } : {}),
    ...(hover_background_color ? { button_background_hover_color: hover_background_color } : {}),
    ...(border_radius !== null && border_radius !== undefined ? {
      border_radius: (typeof border_radius === 'object' && border_radius !== null) ? {
        unit: border_radius.unit || 'px',
        top: String(border_radius.top !== undefined ? border_radius.top : 0),
        right: String(border_radius.right !== undefined ? border_radius.right : 0),
        bottom: String(border_radius.bottom !== undefined ? border_radius.bottom : 0),
        left: String(border_radius.left !== undefined ? border_radius.left : 0),
        isLinked: border_radius.isLinked !== undefined
          ? Boolean(border_radius.isLinked)
          : (border_radius.top === border_radius.right && border_radius.right === border_radius.bottom && border_radius.bottom === border_radius.left)
      } : {
        unit: 'px',
        top: String(border_radius),
        right: String(border_radius),
        bottom: String(border_radius),
        left: String(border_radius),
        isLinked: true
      }
    } : {}),
    ...(padding ? {
      button_padding: {
        unit: 'px',
        top: String(padding.top || 14),
        right: String(padding.right || 28),
        bottom: String(padding.bottom || 14),
        left: String(padding.left || 28),
        isLinked: false
      }
    } : {}),
    _margin: {
      unit: 'px',
      top: String(margin.top || 0),
      right: String(margin.right || 0),
      bottom: String(margin.bottom || 0),
      left: String(margin.left || 0),
      isLinked: false
    },
    _padding: { unit: 'px', top: '0', right: '0', bottom: '0', left: '0', isLinked: true },
    _css_classes: css_classes,
    css_classes: css_classes,
    ...(options._element_id || options.id ? { _element_id: options._element_id || options.id } : {})
  };

  const sid = options._sid || options._dom_id || undefined;
  if (sid) { settings._sid = sid; settings._dom_id = sid; }
  return {
    id: generateId(),
    elType: 'widget',
    widgetType: 'button',
    _sid: sid,
    _dom_id: sid,
    settings: { ...options, ...settings },
    elements: []
  };
}

function createDividerWidget(options = {}) {
  const {
    style = 'solid',
    weight = 1,
    color = '#E2E8F0',
    gap = 15,
    margin = { top: 0, right: 0, bottom: 0, left: 0 },
    css_classes = ''
  } = options;

  const sid = options._sid || options._dom_id || undefined;
  return {
    id: generateId(),
    elType: 'widget',
    widgetType: 'divider',
    _sid: sid,
    _dom_id: sid,
    settings: {
      ...options,
      ...(sid ? { _sid: sid, _dom_id: sid } : {}),
      style,
      weight: { unit: 'px', size: weight },
      color,
      gap: { unit: 'px', size: gap },
      _margin: {
        unit: 'px',
        top: String(margin.top || 0),
        right: String(margin.right || 0),
        bottom: String(margin.bottom || 0),
        left: String(margin.left || 0),
        isLinked: false
      },
      _padding: { unit: 'px', top: '0', right: '0', bottom: '0', left: '0', isLinked: true },
      _css_classes: css_classes,
      css_classes: css_classes,
      ...(options._element_id || options.id ? { _element_id: options._element_id || options.id } : {})
    },
    elements: []
  };
}

function createImageWidget(rawOptions = {}) {
  const options = normalizeWidgetInputs(rawOptions, 'image');
  const {
    url = '',
    width = null,
    space = null,
    align = 'center',
    margin = { top: 0, right: 0, bottom: 0, left: 0 },
    css_classes = '',
    element_width = null,
    flex_align_self = null
  } = options;

  // Rule: images.validExtensions & defaultFallbackExtension
  const validExts = ['.jpg', '.jpeg', '.png', '.webp', '.svg', '.gif', '.avif'];
  let sanitizedUrl = (url || '').trim();
  if (sanitizedUrl && !sanitizedUrl.startsWith('data:') && !sanitizedUrl.startsWith('blob:') && !validExts.some(ext => sanitizedUrl.toLowerCase().endsWith(ext) || sanitizedUrl.toLowerCase().includes(ext + '?') || sanitizedUrl.toLowerCase().includes(ext + '&') || sanitizedUrl.toLowerCase().includes(ext + '#'))) {
    sanitizedUrl += '.jpg';
  }

  const settings = {
    image: {
      url: sanitizedUrl,
      id: ''
    },
    align,
    _margin: {
      unit: 'px',
      top: String(margin.top || 0),
      right: String(margin.right || 0),
      bottom: String(margin.bottom || 0),
      left: String(margin.left || 0),
      isLinked: false
    },
    _padding: { unit: 'px', top: '0', right: '0', bottom: '0', left: '0', isLinked: true },
    _css_classes: css_classes,
    css_classes: css_classes,
    ...(options._element_id || options.id ? { _element_id: options._element_id || options.id } : {})
  };

  if (width) settings.width = typeof width === 'object' ? width : { unit: '%', size: width };
  if (space) settings.space = typeof space === 'object' ? space : { unit: '%', size: space };
  if (element_width) {
    settings._element_width = element_width;
    settings._flex_size = 'none';
  }
  if (flex_align_self) {
    settings._flex_align_self = flex_align_self;
  }

  const sid = options._sid || options._dom_id || undefined;
  if (sid) { settings._sid = sid; settings._dom_id = sid; }
  return {
    id: generateId(),
    elType: 'widget',
    widgetType: 'image',
    _sid: sid,
    _dom_id: sid,
    settings: { ...options, ...settings, image: { url: sanitizedUrl, id: '' } },
    elements: []
  };
}

module.exports = {
  createHeadingWidget,
  createTextEditorWidget,
  createHtmlWidget,
  createIconWidget,
  createButtonWidget,
  createDividerWidget,
  createImageWidget,
  normalizeWidgetInputs
};


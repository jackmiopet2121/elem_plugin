/**
 * Container Transformer.
 * Generates 100% native Elementor Free Flexbox Containers with responsive properties.
 */
const { generateId } = require('../core/id-generator');
const { unwrapGapNumber } = require('../smart/style-router');

function createContainer(options = {}) {
  const {
    direction = 'column',
    direction_tablet = null,
    direction_mobile = null,
    justify_content = 'flex-start',
    align_items = 'stretch',
    align_items_mobile = null,
    wrap = 'nowrap',
    wrap_mobile = null,
    gap = 0,
    gap_mobile = null,
    padding = { top: 0, right: 0, bottom: 0, left: 0 },
    padding_mobile = null,
    margin = { top: 0, right: 0, bottom: 0, left: 0 },
    margin_mobile = null,
    width = null,
    width_mobile = null,
    background_color = null,
    border = null,
    border_radius = null,
    box_shadow = null,
    css_classes = '',
    custom_css = null,
    elements = []
  } = options;

  let gapObj;
  if (gap && typeof gap === 'object') {
    const col = gap.column !== undefined ? Number(gap.column) : (gap.size !== undefined ? Number(gap.size) : 0);
    const row = gap.row !== undefined ? Number(gap.row) : (gap.size !== undefined ? Number(gap.size) : 0);
    const sz = gap.size !== undefined ? Number(gap.size) : (col || row || 0);
    gapObj = {
      unit: gap.unit || 'px',
      size: sz,
      column: col,
      row: row,
      isLinked: Boolean(col === row)
    };
  } else {
    const gapNum = unwrapGapNumber(gap);
    gapObj = { unit: 'px', size: gapNum, column: gapNum, row: gapNum, isLinked: true };
  }

  const settings = {
    flex_direction: direction,
    direction: direction,
    flex_justify_content: justify_content,
    justify_content: justify_content,
    flex_align_items: align_items,
    align_items: align_items,
    flex_wrap: wrap,
    wrap: wrap,
    content_width: options.content_width || (options.isInner ? 'full' : (options.elements && options.elements.length > 0 ? 'full' : 'full')),

    // Triple gap declaration
    gap: gapObj,
    flex_gap: (options.flex_gap && typeof options.flex_gap === 'object') ? options.flex_gap : { ...gapObj },
    space_between_widgets: options.space_between_widgets !== undefined ? options.space_between_widgets : gapObj.size,

    // Padding & Margin
    padding: {
      unit: 'px',
      top: String(padding.top || 0),
      right: String(padding.right || 0),
      bottom: String(padding.bottom || 0),
      left: String(padding.left || 0),
      isLinked: false
    },
    margin: {
      unit: 'px',
      top: String(margin.top || 0),
      right: String(margin.right || 0),
      bottom: String(margin.bottom || 0),
      left: String(margin.left || 0),
      isLinked: false
    },

    // Dual class declaration
    css_classes: css_classes,
    _css_classes: css_classes,
    ...(options._element_id || options.id ? { _element_id: options._element_id || options.id } : {})
  };

  // Mobile Overrides
  if (direction_mobile) {
    settings.flex_direction_mobile = direction_mobile;
    settings.direction_mobile = direction_mobile;
  }
  if (align_items_mobile) {
    settings.flex_align_items_mobile = align_items_mobile;
    settings.align_items_mobile = align_items_mobile;
  }
  if (wrap_mobile) {
    settings.flex_wrap_mobile = wrap_mobile;
    settings.wrap_mobile = wrap_mobile;
  }
  if (gap_mobile !== null && gap_mobile !== undefined) {
    let mobGapObj;
    if (gap_mobile && typeof gap_mobile === 'object') {
      const col = gap_mobile.column !== undefined ? Number(gap_mobile.column) : (gap_mobile.size !== undefined ? Number(gap_mobile.size) : 0);
      const row = gap_mobile.row !== undefined ? Number(gap_mobile.row) : (gap_mobile.size !== undefined ? Number(gap_mobile.size) : 0);
      const sz = gap_mobile.size !== undefined ? Number(gap_mobile.size) : (col || row || 0);
      mobGapObj = {
        unit: gap_mobile.unit || 'px',
        size: sz,
        column: col,
        row: row,
        isLinked: Boolean(col === row)
      };
    } else {
      const gapMobNum = unwrapGapNumber(gap_mobile);
      mobGapObj = { unit: 'px', size: gapMobNum, column: gapMobNum, row: gapMobNum, isLinked: true };
    }
    settings.gap_mobile = mobGapObj;
    settings.flex_gap_mobile = (options.flex_gap_mobile && typeof options.flex_gap_mobile === 'object') ? options.flex_gap_mobile : { ...mobGapObj };
    settings.space_between_widgets_mobile = options.space_between_widgets_mobile !== undefined ? options.space_between_widgets_mobile : mobGapObj.size;
  }
  if (padding_mobile) {
    settings.padding_mobile = {
      unit: 'px',
      top: String(padding_mobile.top || 0),
      right: String(padding_mobile.right || 0),
      bottom: String(padding_mobile.bottom || 0),
      left: String(padding_mobile.left || 0),
      isLinked: false
    };
  }
  if (margin_mobile) {
    settings.margin_mobile = {
      unit: 'px',
      top: String(margin_mobile.top || 0),
      right: String(margin_mobile.right || 0),
      bottom: String(margin_mobile.bottom || 0),
      left: String(margin_mobile.left || 0),
      isLinked: false
    };
  }
  if (width_mobile) {
    settings.width_mobile = { unit: 'custom', size: width_mobile };
    settings._flex_size_mobile = 'none';
  }

  // Visual Styles
  if (width) {
    settings.width = typeof width === 'object' ? width : { unit: 'px', size: width };
  }
  if (background_color) {
    settings.background_background = 'classic';
    settings.background_color = background_color;
  }
  if (border) {
    settings.border_border = border.type || 'solid';
    settings.border_width = {
      unit: 'px',
      top: String(border.width || 1),
      right: String(border.width || 1),
      bottom: String(border.width || 1),
      left: String(border.width || 1),
      isLinked: true
    };
    settings.border_color = border.color || '#e2e8f0';
  }
  if (options.border_width && typeof options.border_width === 'object') {
    settings.border_width = options.border_width;
  }
  if (border_radius && typeof border_radius === 'object') {
    settings.border_radius = border_radius;
  } else if (border_radius) {
    settings.border_radius = {
      unit: 'px',
      top: String(border_radius),
      right: String(border_radius),
      bottom: String(border_radius),
      left: String(border_radius),
      isLinked: true
    };
  }
  if (box_shadow) {
    settings.box_shadow_box_shadow_type = 'yes';
    settings.box_shadow_box_shadow = box_shadow;
  }
  if (custom_css) {
    settings.custom_css = custom_css;
  }

  const sid = options._sid || options._dom_id || undefined;
  if (sid) {
    settings._sid = sid;
    settings._dom_id = sid;
  }

  const finalSettings = { ...options, ...settings };
  delete finalSettings.elements;

  return {
    id: generateId(),
    elType: 'container',
    isInner: false,
    _sid: sid,
    _dom_id: sid,
    settings: finalSettings,
    elements
  };
}

module.exports = {
  createContainer
};

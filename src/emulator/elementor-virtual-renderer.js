/**
 * Virtual Elementor Frontend Emulator.
 * Translates native Elementor Free JSON templates into standalone, pixel-perfect HTML/CSS.
 * Emulates the exact DOM markup and CSS compilation behavior of WordPress Elementor Free,
 * enabling instantaneous (~30ms) headless previews without WordPress, PHP, or databases.
 */

const fs = require('fs');
const path = require('path');
const { resolveElementSelector, ensureDeterministicClass } = require('../smart/semantic-scoper');
const {
  VALID_SIZES,
  VALID_POSITIONS,
  VALID_REPEATS
} = require('../smart/image-background-geometry');
const { parseColorParts } = require('../smart/tolerances');

function isFiniteGradientColor(c) {
  if (typeof c !== 'string' || c.trim() === '') return false;
  const p = parseColorParts(c);
  return Boolean(p && Number.isFinite(p.r) && Number.isFinite(p.g) && Number.isFinite(p.b) && Number.isFinite(p.a));
}

function isValidGradientAngle(obj) {
  return Boolean(obj && typeof obj === 'object' && obj.unit === 'deg' && typeof obj.size === 'number' && Number.isFinite(obj.size));
}

function isValidGradientStop(obj) {
  return Boolean(obj && typeof obj === 'object' && obj.unit === '%' && typeof obj.size === 'number' && Number.isFinite(obj.size) && obj.size >= 0 && obj.size <= 100);
}

let cachedLocalFontAwesome = null;
function getLocalFontAwesomeCss() {
  if (cachedLocalFontAwesome) return cachedLocalFontAwesome;
  const candidatePaths = [
    path.join(__dirname, '../../vendor/fontawesome/all.min.css'),
    path.join(__dirname, '../../../vendor/fontawesome/all.min.css'),
    path.join(process.cwd(), 'engine-v2/vendor/fontawesome/all.min.css'),
    path.join(process.cwd(), 'vendor/fontawesome/all.min.css')
  ];
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      try {
        cachedLocalFontAwesome = fs.readFileSync(p, 'utf8');
        return cachedLocalFontAwesome;
      } catch (e) {}
    }
  }
  return '';
}

function isSafeCssUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const s = url.trim();
  if (!s) return false;

  // Case-insensitive </style check (prevents breakout from style tags)
  if (/<\/style/i.test(s)) return false;

  // ASCII control characters (0x00 to 0x1F and 0x7F)
  if (/[\x00-\x1f\x7f]/.test(s)) return false;

  // CSS string-breaking syntax: " (quote), \ (escape), ; (declaration end), { or } (block boundaries)
  if (/["\\;{}]/.test(s)) return false;

  // Scheme validation: if URL starts with a scheme, permit only http/https with valid hostname
  const schemeMatch = s.match(/^([a-z][a-z0-9+.-]*):/i);
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase();
    if (scheme !== 'http' && scheme !== 'https') {
      return false;
    }
    try {
      const parsed = new URL(s);
      if (!parsed.hostname || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) {
        return false;
      }
    } catch {
      return false;
    }
  }

  return true;
}

function renderElementorToHtml(templateData, options = {}) {
  const content = templateData.content || (Array.isArray(templateData) ? templateData : []);
  const title = templateData.title || options.title || 'Elementor Virtual Preview';

  // Task K3: Ensure microCss from stylesheet-engine HTML widget is extracted if not in options
  let effectiveMicroCss = options.microCss || '';
  if (!effectiveMicroCss) {
    function findMicroCss(nodes) {
      for (const n of nodes) {
        if (n.widgetType === 'html' && n.settings?.html && n.settings.html.includes('<style')) {
          const match = n.settings.html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
          if (match && match[1]) return match[1];
        }
        if (n.elements) {
          const found = findMicroCss(n.elements);
          if (found) return found;
        }
      }
      return '';
    }
    effectiveMicroCss = findMicroCss(content);
  }

  const collectedCss = [];
  const collectedTabletCss = [];
  const collectedMobileCss = [];
  const cssCtx = { desktop: collectedCss, tablet: collectedTabletCss, mobile: collectedMobileCss };
  const fontsToLoad = new Set(['Inter', 'Roboto', 'Plus Jakarta Sans']);
  if (Array.isArray(options.fonts)) {
    options.fonts.forEach(f => {
      const name = typeof f === 'string' ? f : f?.family;
      if (name) fontsToLoad.add(name);
    });
  }

  // Traverse tree to generate HTML and extract CSS rules
  const bodyHtml = content.map(el => renderNode(el, cssCtx, fontsToLoad, true)).join('\n');

  // Build Google Fonts URL
  const fontFamilies = Array.from(fontsToLoad)
    .filter(f => f && !['inherit', 'initial', 'sans-serif', 'serif', 'monospace', 'var(--font-base)'].includes(f.toLowerCase()))
    .map(f => f.replace(/['"]/g, '').trim())
    .filter(Boolean);

  const useLocalFa = !!(options.useLocalVendor || options.offlineVendor);
  const localFaCss = useLocalFa ? getLocalFontAwesomeCss() : null;

  const fontAwesomeTag = localFaCss
    ? `<style>/* Local FontAwesome 6.4.2 Offline Copy */\n${localFaCss}\n</style>`
    : `<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css" integrity="sha512-z3gLpd7yknf1YoNbCzqRKc4qyor8gaKU1qmn+CShxbuBusANI9QpRohGBreCFkKxLhei6S9CQXFEbbKuqLg0DA==" crossorigin="anonymous" referrerpolicy="no-referrer" />`;

  const googleFontsLink = (fontFamilies.length > 0 && !options.skipFonts)
    ? `<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${fontFamilies.map(f => `family=${encodeURIComponent(f)}:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400;1,700`).join('&')}&display=swap">`
    : '';

  const rootBgColor = templateData.page_settings?.background_color || options.pageBackground || '#ffffff';
  const rootTextColor = options.bodyColor || '#0f172a';
  const rootFontFamily = options.bodyFont || '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

  const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - Virtual Elementor Preview</title>
  ${googleFontsLink}
  ${fontAwesomeTag}
  <style>
    /* 1. Base Elementor Free Grid & Layout Engine */
    *, *::before, *::after {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: ${rootFontFamily};
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      background-color: ${rootBgColor};
      color: ${rootTextColor};
    }
    .elementor {
      position: relative;
      width: 100%;
    }
    .e-con {
      display: var(--display, flex);
      flex-direction: var(--flex-direction, column);
      justify-content: var(--justify-content, flex-start);
      align-items: var(--align-items, stretch);
      flex-wrap: var(--flex-wrap, nowrap);
      gap: var(--gap, 0px);
      row-gap: var(--row-gap, var(--gap, 0px));
      column-gap: var(--column-gap, var(--gap, 0px));
      position: relative;
      width: 100%;
      --widgets-spacing: 20px;
    }
    .e-con-boxed {
      width: 100% !important;
    }
    .e-con-boxed > .e-con-inner {
      display: var(--display, flex);
      flex-direction: var(--flex-direction, column);
      justify-content: var(--justify-content, flex-start);
      align-items: var(--align-items, stretch);
      flex-wrap: var(--flex-wrap, nowrap);
      gap: var(--gap, 0px);
      row-gap: var(--row-gap, var(--gap, 0px));
      column-gap: var(--column-gap, var(--gap, 0px));
      width: 100%;
      max-width: var(--content-width, 1200px);
      margin-left: auto;
      margin-right: auto;
      position: relative;
      --widgets-spacing: 20px;
    }
    .e-con-full {
      width: 100%;
    }
    .elementor-widget {
      position: relative;
      margin-bottom: 0;
    }
    /* Elementor Core Flexbox Runtime Layout Reset:
       In live Elementor, widgets inside flex containers default to 100% width
       unless explicitly flagged as auto-width. This ensures 1:1 parity between
       local emulation and live WordPress. */
    .e-con > .elementor-widget:not(.elementor-widget__width-auto):not(.elementor-widget__width-initial),
    .e-con-inner > .elementor-widget:not(.elementor-widget__width-auto):not(.elementor-widget__width-initial) {
      width: 100%;
    }
    .elementor-widget__width-auto {
      width: auto;
      max-width: 100%;
      display: inline-block;
    }
    .elementor-widget__width-initial {
      max-width: 100%;
    }
    .elementor-widget__width-inherit {
      width: 100% !important;
      max-width: 100%;
    }
    .elementor-widget-container {
      position: relative;
      transition: background .3s, border .3s, border-radius .3s, box-shadow .3s;
    }
    .elementor-heading-title {
      margin: 0;
      padding: 0;
      line-height: 1.2;
    }
    .elementor-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      text-decoration: none;
      border-radius: 4px;
      padding: 12px 24px;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .elementor-button-wrapper.elementor-align-justify,
    .elementor-button-wrapper.elementor-align-justify .elementor-button {
      width: 100%;
      display: flex;
    }
    .elementor-button-content-wrapper {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .elementor-widget-icon .elementor-icon-wrapper {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
    }
    .elementor-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
    }
    .elementor-icon i {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1em;
      height: 1em;
      line-height: 1;
      text-align: center;
    }
    .elementor-view-stacked .elementor-icon,
    .elementor-view-framed .elementor-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 0.5em;
      aspect-ratio: 1 / 1;
    }
    .elementor-shape-circle,
    .elementor-shape-circle .elementor-icon,
    .elementor-icon.elementor-shape-circle {
      border-radius: 50% !important;
    }
    .elementor-shape-square,
    .elementor-shape-square .elementor-icon,
    .elementor-icon.elementor-shape-square {
      border-radius: 0 !important;
    }
    .elementor-icon-list-items {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .elementor-icon-list-item {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .elementor-divider-separator {
      display: block;
      border-top-style: solid;
      border-top-width: 1px;
      width: 100%;
    }

    /* Elementor Free Frontend Core Defaults (WP Parity) */
    .elementor-widget-image {
      text-align: center;
    }
    .elementor-widget-image a {
      display: inline-block;
    }
    .elementor-widget-image img {
      vertical-align: middle;
      display: inline-block;
      max-width: 100%;
    }
    .elementor-text-editor {
      color: inherit;
      font-family: inherit;
    }
    .elementor-text-editor p:last-child {
      margin-bottom: 0;
    }

    /* 2. Compiled Elementor Template Styles (Desktop / Post CSS) */
    ${collectedCss.join('\n\n')}

    /* 3. Compiled Elementor Tablet Styles (max-width: 1024px) */
    ${collectedTabletCss.length > 0 ? `@media (max-width: 1024px) {\n  ${collectedTabletCss.join('\n  ')}\n}` : ''}

    /* 4. Compiled Elementor Mobile Styles (max-width: 767px) */
    ${collectedMobileCss.length > 0 ? `@media (max-width: 767px) {\n  ${collectedMobileCss.join('\n  ')}\n}` : ''}

    /* 5. Isolated Micro-CSS & Atomic Overrides (Post-Cascade Priority) */
    ${effectiveMicroCss ? `\n    /* Isolated Micro-CSS */\n    ${effectiveMicroCss}\n` : ''}
  </style>
</head>
<body class="elementor-default elementor-page">
  <div class="elementor elementor-virtual-root">
    ${bodyHtml}
  </div>
</body>
</html>`;

  return fullHtml;
}

function renderNode(node, collectedCss, fontsToLoad, isParent = false) {
  if (!node) return '';

  const id = node.id || Math.random().toString(36).substr(2, 8);
  ensureDeterministicClass(node, id);
  const settings = node.settings || {};
  const cssClasses = Array.from(new Set([settings.css_classes, settings._css_classes].filter(Boolean).join(' ').split(/\s+/).filter(Boolean))).join(' ');

  // Compile CSS rules for this element
  compileNodeStyles(node, id, collectedCss, fontsToLoad);

  if (node.elType === 'container') {
    return renderContainer(node, id, cssClasses, collectedCss, fontsToLoad, isParent);
  } else if (node.elType === 'widget') {
    return renderWidget(node, id, cssClasses, collectedCss, fontsToLoad);
  }

  return '';
}

function extractDataAttributes(cssClasses = '') {
  if (!cssClasses || typeof cssClasses !== 'string') return '';
  const matches = cssClasses.match(/\bdata-([a-zA-Z0-9_\-]+)--([a-zA-Z0-9_\-]+)\b/g);
  if (!matches) return '';
  const attrs = [];
  for (const m of matches) {
    const parts = m.split('--');
    if (parts.length === 2) {
      attrs.push(`${parts[0]}="${parts[1]}"`);
    }
  }
  return attrs.length > 0 ? attrs.join(' ') + ' ' : '';
}

function renderContainer(node, id, cssClasses, collectedCss, fontsToLoad, isParent) {
  // A2 STRICT EMULATOR PARITY:
  // In WordPress PHP, if content_width !== 'full', it defaults to 'boxed' regardless of parent/child nesting!
  const isBoxed = (node.settings?.content_width !== 'full');
  const boxedClass = isBoxed ? 'e-con-boxed' : 'e-con-full';
  const parentChildClass = isParent ? 'e-parent' : 'e-child';
  const childNodes = node.elements || [];

  const renderedChildren = childNodes.map(child => renderNode(child, collectedCss, fontsToLoad, false)).join('\n');
  const settings = node.settings || {};
  const elementIdAttr = (settings._element_id || settings.id) ? `id="${settings._element_id || settings.id}" ` : '';
  const dataAttrs = extractDataAttributes(cssClasses);
  const sid = node._sid || settings._sid || node._dom_id || settings._dom_id || '';
  const sidAttr = sid ? `data-sid="${sid}" data-dom-id="${sid}" ` : '';

  if (isBoxed) {
    return `<div ${elementIdAttr}class="elementor-element elementor-element-${id} ${cssClasses} e-flex ${boxedClass} e-con ${parentChildClass}" ${sidAttr}${dataAttrs}data-id="${id}" data-element_type="container">
      <div class="e-con-inner">
        ${renderedChildren}
      </div>
    </div>`;
  }

  return `<div ${elementIdAttr}class="elementor-element elementor-element-${id} ${cssClasses} e-flex ${boxedClass} e-con ${parentChildClass}" ${sidAttr}${dataAttrs}data-id="${id}" data-element_type="container">
    ${renderedChildren}
  </div>`;
}

function renderWidget(node, id, cssClasses, collectedCss, fontsToLoad) {
  const widgetType = node.widgetType || 'html';
  const settings = node.settings || {};

  let widthClass = '';
  if (settings._element_width === 'auto' || settings.width === 'auto' || (settings.width && settings.width.size === 'auto')) widthClass = 'elementor-widget__width-auto';
  else if (settings._element_width === 'initial' || settings.width === 'initial') widthClass = 'elementor-widget__width-initial';
  else if (settings._element_width === 'inherit' || settings._element_width === '100%' || settings.width === '100%') widthClass = 'elementor-widget__width-inherit';

  let widgetInner = '';

  switch (widgetType) {
    case 'heading': {
      const tag = settings.header_size || 'h2';
      const title = settings.title || '';
      widgetInner = `<div class="elementor-widget-container"><${tag} class="elementor-heading-title elementor-size-default">${title}</${tag}></div>`;
      break;
    }
    case 'button': {
      const text = settings.text || 'Click here';
      const url = settings.link?.url || '#';
      const icon = settings.selected_icon?.value || '';
      const alignClass = settings.align === 'justify' ? ' elementor-align-justify' : '';
      widgetInner = `<div class="elementor-widget-container">
        <div class="elementor-button-wrapper${alignClass}">
          <a class="elementor-button elementor-size-${settings.size || 'sm'}" href="${url}">
            <span class="elementor-button-content-wrapper">
              ${icon ? `<span class="elementor-button-icon"><i class="${icon}"></i></span>` : ''}
              <span class="elementor-button-text">${text}</span>
            </span>
          </a>
        </div>
      </div>`;
      break;
    }
    case 'image': {
      const url = settings.image?.url || '';
      const imgMinH = (!settings._hero_cover_fill && settings._img_height) ? `min-height: ${settings._img_height}px;` : '';
      const imgFillStyle = settings._hero_cover_fill ? 'width: 100%; height: 100%; object-fit: cover;' : (imgMinH ? `height: auto; ${imgMinH}` : 'height: auto;');
      widgetInner = `<div class="elementor-widget-container"><img src="${url}" alt="" style="max-width: 100%; ${imgFillStyle}" /></div>`;
      break;
    }
    case 'icon': {
      const icon = settings.selected_icon?.value || (typeof settings.icon === 'string' ? settings.icon : settings.icon?.value) || 'fas fa-star';
      const view = settings.view || 'default';
      const shape = settings.shape || 'circle';
      const shapeClass = view !== 'default' ? ` elementor-shape-${shape}` : '';
      widgetInner = `<div class="elementor-widget-container">
        <div class="elementor-icon-wrapper">
          <div class="elementor-icon elementor-view-${view}${shapeClass}">
            <i class="${icon}"></i>
          </div>
        </div>
      </div>`;
      break;
    }
    case 'icon-list': {
      const items = settings.icon_list || [];
      widgetInner = `<div class="elementor-widget-container">
        <ul class="elementor-icon-list-items">
          ${items.map(it => `
            <li class="elementor-icon-list-item">
              ${it.selected_icon?.value ? `<span class="elementor-icon-list-icon"><i class="${it.selected_icon.value}"></i></span>` : ''}
              <span class="elementor-icon-list-text">${it.text || ''}</span>
            </li>
          `).join('')}
        </ul>
      </div>`;
      break;
    }
    case 'divider': {
      widgetInner = `<div class="elementor-widget-container"><div class="elementor-divider"><span class="elementor-divider-separator"></span></div></div>`;
      break;
    }
    case 'html': {
      const htmlContent = settings.html || '';
      widgetInner = `<div class="elementor-widget-container">${htmlContent}</div>`;
      break;
    }
    case 'text-editor': {
      const content = settings.editor || '';
      widgetInner = `<div class="elementor-widget-container"><div class="elementor-text-editor elementor-clearfix">${content}</div></div>`;
      break;
    }
    default: {
      widgetInner = `<div class="elementor-widget-container">${settings.editor || settings.html || ''}</div>`;
    }
  }

  const elementIdAttr = (settings._element_id || settings.id) ? `id="${settings._element_id || settings.id}" ` : '';
  const dataAttrs = extractDataAttributes(cssClasses);
  const sid = node._sid || settings._sid || node._dom_id || settings._dom_id || '';
  const sidAttr = sid ? `data-sid="${sid}" data-dom-id="${sid}" ` : '';

  return `<div ${elementIdAttr}class="elementor-element elementor-element-${id} ${cssClasses} ${widthClass} elementor-widget elementor-widget-${widgetType}" ${sidAttr}${dataAttrs}data-id="${id}" data-element_type="widget" data-widget_type="${widgetType}.default">
    ${widgetInner}
  </div>`;
}

function compileNodeStyles(node, id, cssContext, fontsToLoad) {
  const s = node.settings || {};
  const rules = [];
  const targetSelector = resolveElementSelector(node, id);
  const collectedCss = Array.isArray(cssContext) ? cssContext : (cssContext.desktop || []);
  const tabletCss = Array.isArray(cssContext) ? null : (cssContext.tablet || null);
  const mobileCss = Array.isArray(cssContext) ? null : (cssContext.mobile || null);

  // Container flex & box model styles
  if (node.elType === 'container') {
    const dir = s.flex_direction || s.direction;
    if (dir) {
      rules.push(`--flex-direction: ${dir};`);
      rules.push(`flex-direction: ${dir};`);
    }
    const justify = s.flex_justify_content || s.justify_content;
    if (justify) {
      rules.push(`--justify-content: ${justify};`);
      rules.push(`justify-content: ${justify};`);
    }
    const align = s.flex_align_items || s.align_items;
    if (align) {
      rules.push(`--align-items: ${align};`);
      rules.push(`align-items: ${align};`);
    }
    const wrap = s.flex_wrap || s.wrap;
    if (wrap) {
      rules.push(`--flex-wrap: ${wrap};`);
      rules.push(`flex-wrap: ${wrap};`);
    }
    const gapObj = s.flex_gap || s.gap;
    let rowGap = null;
    let colGap = null;

    if (gapObj && typeof gapObj === 'object') {
      rowGap = gapObj.row !== undefined ? gapObj.row : (gapObj.size ?? null);
      colGap = gapObj.column !== undefined ? gapObj.column : (gapObj.size ?? null);
    } else if (typeof s.gap === 'number') {
      rowGap = s.gap;
      colGap = s.gap;
    } else if (typeof s.space_between_widgets === 'number') {
      rowGap = s.space_between_widgets;
      colGap = s.space_between_widgets;
    }

    if (rowGap !== null || colGap !== null) {
      const r = Number(rowGap ?? colGap ?? 0);
      const c = Number(colGap ?? rowGap ?? 0);
      rules.push(`--row-gap: ${r}px;`);
      rules.push(`--column-gap: ${c}px;`);
      rules.push(`--gap: ${r}px ${c}px;`);
      rules.push(`gap: ${r}px ${c}px;`);
      rules.push(`row-gap: ${r}px;`);
      rules.push(`column-gap: ${c}px;`);
    }

    // Boxed content width
    if (s.boxed_width?.size) {
      rules.push(`--content-width: ${s.boxed_width.size}${s.boxed_width.unit || 'px'};`);
    }

    // Background color & image / gradient
    if (s.background_background === 'gradient') {
      const isAngleValid = typeof s.background_gradient_angle?.size === 'number' && Number.isFinite(s.background_gradient_angle.size);
      const isStop1Valid = typeof s.background_color_stop?.size === 'number' && Number.isFinite(s.background_color_stop.size) && s.background_color_stop.size >= 0 && s.background_color_stop.size <= 100;
      const isStop2Valid = typeof s.background_color_b_stop?.size === 'number' && Number.isFinite(s.background_color_b_stop.size) && s.background_color_b_stop.size >= 0 && s.background_color_b_stop.size <= 100;
      const isColor1Valid = typeof s.background_color === 'string' && s.background_color.trim() !== '' && Boolean(parseColorParts(s.background_color));
      const isColor2Valid = typeof s.background_color_b === 'string' && s.background_color_b.trim() !== '' && Boolean(parseColorParts(s.background_color_b));
      const isTypeValid = s.background_gradient_type === 'linear';

      if (isAngleValid && isStop1Valid && isStop2Valid && isColor1Valid && isColor2Valid && isTypeValid) {
        rules.push('background-color: transparent;');
        rules.push(`background-image: linear-gradient(${s.background_gradient_angle.size}deg, ${s.background_color.trim()} ${s.background_color_stop.size}%, ${s.background_color_b.trim()} ${s.background_color_b_stop.size}%);`);
      }
    } else {
      // Background color
      if (s.background_color) {
        rules.push(`background-color: ${s.background_color};`);
      }

      // Background image (classic mode with safe URL)
      if (s.background_background === 'classic' && typeof s.background_image?.url === 'string') {
        const imgUrl = s.background_image.url.trim();
        if (isSafeCssUrl(imgUrl)) {
          rules.push(`background-image: url("${imgUrl}");`);
          if (s.background_size && VALID_SIZES.has(s.background_size)) {
            rules.push(`background-size: ${s.background_size};`);
          }
          if (s.background_position && VALID_POSITIONS.has(s.background_position)) {
            rules.push(`background-position: ${s.background_position};`);
          }
          if (s.background_repeat && VALID_REPEATS.has(s.background_repeat)) {
            rules.push(`background-repeat: ${s.background_repeat};`);
          }
        }
      }
    }

    // Container typography
    if (s.typography_font_size?.size) {
      rules.push(`font-size: ${s.typography_font_size.size}${s.typography_font_size.unit || 'px'};`);
    }
    if (s.typography_font_weight) {
      rules.push(`font-weight: ${s.typography_font_weight};`);
    }
    if (s.typography_font_family) {
      fontsToLoad.add(s.typography_font_family);
      rules.push(`font-family: "${s.typography_font_family}", Sans-serif;`);
    }
    if (s.typography_line_height?.size) {
      rules.push(`line-height: ${s.typography_line_height.size}${s.typography_line_height.unit || ''};`);
    }
    if (s.text_color || s.color) {
      rules.push(`color: ${s.text_color || s.color};`);
    }

    // Paddings
    const pad = s.padding || s._padding;
    if (pad) {
      rules.push(`--padding-top: ${pad.top || 0}${pad.unit || 'px'};`);
      rules.push(`--padding-right: ${pad.right || 0}${pad.unit || 'px'};`);
      rules.push(`--padding-bottom: ${pad.bottom || 0}${pad.unit || 'px'};`);
      rules.push(`--padding-left: ${pad.left || 0}${pad.unit || 'px'};`);
      rules.push(`padding: var(--padding-top) var(--padding-right) var(--padding-bottom) var(--padding-left);`);
    }

    // Margins
    const mar = s.margin || s._margin;
    if (mar) {
      rules.push(`--margin-top: ${mar.top || 0}${mar.unit || 'px'};`);
      rules.push(`--margin-right: ${mar.right || 0}${mar.unit || 'px'};`);
      rules.push(`--margin-bottom: ${mar.bottom || 0}${mar.unit || 'px'};`);
      rules.push(`--margin-left: ${mar.left || 0}${mar.unit || 'px'};`);
      rules.push(`margin: var(--margin-top) var(--margin-right) var(--margin-bottom) var(--margin-left);`);
    }

    // Borders & radius
    if (s.border_radius) {
      const r = s.border_radius;
      rules.push(`border-radius: ${r.top || 0}${r.unit || 'px'} ${r.right || 0}${r.unit || 'px'} ${r.bottom || 0}${r.unit || 'px'} ${r.left || 0}${r.unit || 'px'};`);
    }
    if (s.border_border || s.border_width) {
      rules.push(`border-style: ${s.border_border || 'solid'};`);
      if (s.border_width) {
        const b = s.border_width;
        rules.push(`border-width: ${b.top || 0}px ${b.right || 0}px ${b.bottom || 0}px ${b.left || 0}px;`);
      }
      if (s.border_color) {
        rules.push(`border-color: ${s.border_color};`);
      }
    }

    // Width (A2 STRICT EMULATOR PARITY: boxed forces 100%; full uses measured %, missing defaults to 100%)
    if (s.content_width !== 'full') {
      rules.push(`width: 100% !important;`);
    } else if (s.width?.size) {
      if (s.width.size === 'fit-content') {
        rules.push(`width: fit-content;`);
        rules.push(`max-width: fit-content;`);
      } else {
        rules.push(`width: ${s.width.size}${s.width.unit || '%'};`);
      }
    } else {
      rules.push(`width: 100%;`);
    }

    // Min height
    if (s.min_height?.size) {
      rules.push(`--min-height: ${s.min_height.size}${s.min_height.unit || 'px'};`);
      rules.push(`min-height: ${s.min_height.size}${s.min_height.unit || 'px'};`);
    }

    // M2: Container Overflow & Max-Height Parity
    if (s.overflow) {
      rules.push(`overflow: ${s.overflow};`);
    }
    if (s.max_height?.size !== undefined) {
      rules.push(`max-height: ${s.max_height.size}${s.max_height.unit || 'px'};`);
    }
    if (s.height?.size !== undefined) {
      rules.push(`height: ${s.height.size}${s.height.unit || 'px'} !important;`);
    }
    if (s.align_self || s._flex_align_self) {
      rules.push(`align-self: ${s.align_self || s._flex_align_self} !important;`);
    }
    if (s._order !== undefined || s.order !== undefined) {
      rules.push(`order: ${s._order ?? s.order} !important;`);
    }
    if (s.flex_shrink !== undefined && s.flex_shrink !== null) {
      rules.push(`flex-shrink: ${s.flex_shrink} !important;`);
    } else if (s._flex_size === 'none') {
      rules.push(`flex-shrink: 0 !important;`);
    }

    // Box shadow
    if (s.box_shadow_box_shadow) {
      const bs = s.box_shadow_box_shadow;
      rules.push(`box-shadow: ${bs.horizontal || 0}px ${bs.vertical || 0}px ${bs.blur || 0}px ${bs.spread || 0}px ${bs.color || 'rgba(0,0,0,0.1)'};`);
    }

    if (rules.length > 0) {
      collectedCss.push(`${targetSelector} {\n  ${rules.join('\n  ')}\n}`);
    }

    const hoverRules = [];
    if (s.border_hover_color) {
      hoverRules.push(`border-color: ${s.border_hover_color};`);
      if (s.border_hover_border) hoverRules.push(`border-style: ${s.border_hover_border};`);
    }
    if (s.box_shadow_hover_box_shadow) {
      const hbs = s.box_shadow_hover_box_shadow;
      hoverRules.push(`box-shadow: ${hbs.horizontal || 0}px ${hbs.vertical || 0}px ${hbs.blur || 0}px ${hbs.spread || 0}px ${hbs.color || 'rgba(0,0,0,0.1)'};`);
    }
    if (hoverRules.length > 0) {
      collectedCss.push(`${targetSelector}:hover {\n  ${hoverRules.join('\n  ')}\n}`);
    }
  }

  // Heading widget styles
  if (node.widgetType === 'heading') {
    const headingRules = [];
    if (s.title_color) headingRules.push(`color: ${s.title_color};`);
    if (s.align) headingRules.push(`text-align: ${s.align};`);
    if (s.typography_font_family) {
      fontsToLoad.add(s.typography_font_family);
      headingRules.push(`font-family: "${s.typography_font_family}", Sans-serif;`);
    }
    if (s.typography_font_size?.size) {
      headingRules.push(`font-size: ${s.typography_font_size.size}${s.typography_font_size.unit || 'px'};`);
    }
    if (s.typography_font_weight) {
      headingRules.push(`font-weight: ${s.typography_font_weight};`);
    }
    if (s.typography_line_height?.size) {
      headingRules.push(`line-height: ${s.typography_line_height.size}${s.typography_line_height.unit || 'em'};`);
    }
    if (s.typography_letter_spacing?.size) {
      headingRules.push(`letter-spacing: ${s.typography_letter_spacing.size}${s.typography_letter_spacing.unit || 'px'};`);
    }

    if (headingRules.length > 0) {
      collectedCss.push(`${targetSelector} .elementor-heading-title {\n  ${headingRules.join('\n  ')}\n}`);
    }

    // Heading container level margins/paddings/background/radius
    const widgetRules = [];
    if (s._background_color || s.background_color) {
      widgetRules.push(`background-color: ${s._background_color || s.background_color};`);
    }
    if (s._border_radius || s.border_radius) {
      const r = s._border_radius || s.border_radius;
      widgetRules.push(`border-radius: ${r.top || 0}${r.unit || 'px'} ${r.right || 0}${r.unit || 'px'} ${r.bottom || 0}${r.unit || 'px'} ${r.left || 0}${r.unit || 'px'};`);
    }
    if (s._border_border || s.border_border === 'solid' || s._border_width || s.border_width) {
      widgetRules.push(`border-style: ${s._border_border || s.border_border || 'solid'};`);
      const b = s._border_width || s.border_width;
      if (b) {
        widgetRules.push(`border-width: ${b.top || 0}px ${b.right || 0}px ${b.bottom || 0}px ${b.left || 0}px;`);
      }
      const bc = s._border_color || s.border_color;
      if (bc) {
        widgetRules.push(`border-color: ${bc};`);
      }
    }
    if (s._margin) {
      widgetRules.push(`margin: ${s._margin.top || 0}${s._margin.unit || 'px'} ${s._margin.right || 0}${s._margin.unit || 'px'} ${s._margin.bottom || 0}${s._margin.unit || 'px'} ${s._margin.left || 0}${s._margin.unit || 'px'};`);
    }
    if (s._padding) {
      widgetRules.push(`padding: ${s._padding.top || 0}${s._padding.unit || 'px'} ${s._padding.right || 0}${s._padding.unit || 'px'} ${s._padding.bottom || 0}${s._padding.unit || 'px'} ${s._padding.left || 0}${s._padding.unit || 'px'};`);
    }
    if (widgetRules.length > 0) {
      collectedCss.push(`${targetSelector} {\n  ${widgetRules.join('\n  ')}\n}`);
    }
  }

  // Button widget styles
  if (node.widgetType === 'button') {
    const btnRules = [];
    if (s.button_text_color) btnRules.push(`color: ${s.button_text_color};`);
    if (s.background_color) btnRules.push(`background-color: ${s.background_color};`);
    if (s.border_radius) {
      const r = s.border_radius;
      btnRules.push(`border-radius: ${r.top || 0}${r.unit || 'px'} ${r.right || 0}${r.unit || 'px'} ${r.bottom || 0}${r.unit || 'px'} ${r.left || 0}${r.unit || 'px'};`);
    }
    if (s.typography_font_family) {
      fontsToLoad.add(s.typography_font_family);
      btnRules.push(`font-family: "${s.typography_font_family}", Sans-serif;`);
    }
    if (s.typography_font_size?.size) {
      btnRules.push(`font-size: ${s.typography_font_size.size}${s.typography_font_size.unit || 'px'};`);
    }
    if (s.typography_font_weight) {
      btnRules.push(`font-weight: ${s.typography_font_weight};`);
    }
    if (s.typography_letter_spacing?.size) {
      btnRules.push(`letter-spacing: ${s.typography_letter_spacing.size}${s.typography_letter_spacing.unit || 'px'};`);
    }
    const pad = s.button_padding || s.padding || s._padding;
    if (pad) {
      btnRules.push(`padding: ${pad.top || 0}${pad.unit || 'px'} ${pad.right || 0}${pad.unit || 'px'} ${pad.bottom || 0}${pad.unit || 'px'} ${pad.left || 0}${pad.unit || 'px'};`);
    }
    if (s.border_border === 'solid' || s.border_width) {
      btnRules.push(`border-style: solid;`);
      if (s.border_width) {
        const b = s.border_width;
        btnRules.push(`border-width: ${b.top || 0}px ${b.right || 0}px ${b.bottom || 0}px ${b.left || 0}px;`);
      }
      if (s.border_color) {
        btnRules.push(`border-color: ${s.border_color};`);
      }
    }
    const btnGapObj = s.flex_gap || s.gap;
    if (btnGapObj !== undefined && btnGapObj !== null) {
      let col = 0, row = 0;
      if (typeof btnGapObj === 'number') {
        col = btnGapObj; row = btnGapObj;
      } else if (typeof btnGapObj === 'object') {
        col = btnGapObj.column ?? btnGapObj.size ?? 0;
        row = btnGapObj.row ?? btnGapObj.size ?? 0;
      }
      btnRules.push(`gap: ${row}px ${col}px;`);
      btnRules.push(`row-gap: ${row}px;`);
      btnRules.push(`column-gap: ${col}px;`);
    }
    if (s.align === 'justify') {
      btnRules.push(`width: 100% !important;`);
      btnRules.push(`display: flex !important;`);
      btnRules.push(`justify-content: center;`);
      btnRules.push(`text-align: center;`);
    }
    if (btnRules.length > 0) {
      collectedCss.push(`${targetSelector} .elementor-button {\n  ${btnRules.join('\n  ')}\n}`);
    }

    const hoverBtnRules = [];
    if (s.button_background_hover_color) {
      hoverBtnRules.push(`background-color: ${s.button_background_hover_color};`);
    }
    if (s.hover_color) {
      hoverBtnRules.push(`color: ${s.hover_color};`);
    }
    if (s.border_color_hover || s.button_hover_border_color) {
      hoverBtnRules.push(`border-color: ${s.border_color_hover || s.button_hover_border_color};`);
    }
    if (hoverBtnRules.length > 0) {
      collectedCss.push(`${targetSelector} .elementor-button:hover {\n  ${hoverBtnRules.join('\n  ')}\n}`);
    }

    if (s.align) {
      const alignWrapperRules = [`text-align: ${s.align};`];
      if (s.align === 'justify') alignWrapperRules.push('width: 100%;');
      collectedCss.push(`${targetSelector} .elementor-button-wrapper {\n  ${alignWrapperRules.join('\n  ')}\n}`);
    }
    const wrapperRules = [];
    if (s._margin) {
      wrapperRules.push(`margin: ${s._margin.top || 0}${s._margin.unit || 'px'} ${s._margin.right || 0}${s._margin.unit || 'px'} ${s._margin.bottom || 0}${s._margin.unit || 'px'} ${s._margin.left || 0}${s._margin.unit || 'px'};`);
    }
    if (s._padding) {
      wrapperRules.push(`padding: ${s._padding.top || 0}${s._padding.unit || 'px'} ${s._padding.right || 0}${s._padding.unit || 'px'} ${s._padding.bottom || 0}${s._padding.unit || 'px'} ${s._padding.left || 0}${s._padding.unit || 'px'};`);
    }
    if (s._background_color) {
      wrapperRules.push(`background-color: ${s._background_color};`);
    } else if (s.background_background === 'classic' && s.background_color) {
      wrapperRules.push(`background-color: ${s.background_color};`);
    }
    if (wrapperRules.length > 0) {
      collectedCss.push(`${targetSelector} {\n  ${wrapperRules.join('\n  ')}\n}`);
    }
  }

  // Image widget styles
  if (node.widgetType === 'image') {
    const imgRules = [];
    if (s._hero_cover_fill) {
      imgRules.push('width: 100% !important;');
      imgRules.push('height: 100% !important;');
      if (s._img_height) {
        imgRules.push(`min-height: ${s._img_height}px !important;`);
      }
      imgRules.push('object-fit: cover !important;');
    }
    const r = s.border_radius || s._border_radius;
    if (r) {
      imgRules.push(`border-radius: ${r.top || 0}${r.unit || 'px'} ${r.right || 0}${r.unit || 'px'} ${r.bottom || 0}${r.unit || 'px'} ${r.left || 0}${r.unit || 'px'};`);
    }
    if (s.border_border || s.border_width || s._border_width) {
      imgRules.push(`border-style: ${s.border_border || 'solid'};`);
      const b = s.border_width || s._border_width;
      if (b) {
        imgRules.push(`border-width: ${b.top || 0}px ${b.right || 0}px ${b.bottom || 0}px ${b.left || 0}px;`);
      }
      const bc = s.border_color || s._border_color;
      if (bc) {
        imgRules.push(`border-color: ${bc};`);
      }
    }
    if (imgRules.length > 0) {
      collectedCss.push(`${targetSelector} img, ${targetSelector} .elementor-widget-container img {\n  ${imgRules.join('\n  ')}\n}`);
      if (s._hero_cover_fill) {
        collectedCss.push(`${targetSelector}, ${targetSelector} .elementor-widget-image, ${targetSelector} .elementor-widget-container {\n  height: 100% !important;\n${s._img_height ? `  min-height: ${s._img_height}px !important;\n` : ''}}`);
      }
    }
  }

  // Icon widget styles
  if (node.widgetType === 'icon') {
    const iconRules = [];
    if (s.view === 'stacked') {
      const bgColor = s.primary_color || '#2563EB';
      const glyphColor = s.secondary_color || '#ffffff';
      iconRules.push(`background-color: ${bgColor};`);
      iconRules.push(`color: ${glyphColor};`);
      iconRules.push(`fill: ${glyphColor};`);
      if (s.shape === 'circle') {
        iconRules.push(`border-radius: 50%;`);
      } else if (s.shape === 'square') {
        iconRules.push(`border-radius: 0;`);
      }
      if (s.icon_padding?.size !== undefined) {
        iconRules.push(`padding: ${s.icon_padding.size}px;`);
      }
    } else if (s.view === 'framed') {
      const borderColor = s.primary_color || '#2563EB';
      const bgColor = s.secondary_color || 'transparent';
      iconRules.push(`border: 3px solid ${borderColor};`);
      iconRules.push(`color: ${borderColor};`);
      iconRules.push(`fill: ${borderColor};`);
      iconRules.push(`background-color: ${bgColor};`);
      if (s.shape === 'circle') {
        iconRules.push(`border-radius: 50%;`);
      }
    } else {
      if (s.primary_color) {
        iconRules.push(`color: ${s.primary_color};`);
        iconRules.push(`fill: ${s.primary_color};`);
      }
    }
    const iconSize = s.size?.size ?? (typeof s.size === 'number' ? s.size : s.typography_font_size?.size);
    if (iconSize) {
      iconRules.push(`font-size: ${iconSize}px;`);
    }
    if (iconRules.length > 0) {
      collectedCss.push(`${targetSelector} .elementor-icon {\n  ${iconRules.join('\n  ')}\n}`);
    }

    if (s.align) {
      collectedCss.push(`${targetSelector} .elementor-icon-wrapper {\n  text-align: ${s.align};\n}`);
    }
    const iconMar = s._margin || s.margin;
    if (iconMar) {
      collectedCss.push(`${targetSelector} {\n  margin: ${iconMar.top || 0}${iconMar.unit || 'px'} ${iconMar.right || 0}${iconMar.unit || 'px'} ${iconMar.bottom || 0}${iconMar.unit || 'px'} ${iconMar.left || 0}${iconMar.unit || 'px'};\n}`);
    }

    if (s._icon_decor) {
      const d = s._icon_decor;
      const h = d.height || d.width;
      const aSelf = s.align_self || s._flex_align_self || 'center';
      const decorRules = [
        `width: ${h}px;`,
        `height: ${h}px;`,
        `max-height: ${h}px !important;`,
        `flex-shrink: 0 !important;`,
        `align-self: ${aSelf} !important;`,
        `border-radius: ${d.borderRadius} !important;`,
        `background: ${d.background} !important;`
      ];
      if (d.border) {
        decorRules.push(`border: ${d.border} !important;`);
      }
      decorRules.push(`display: flex !important;`);
      decorRules.push(`align-items: center !important;`);
      decorRules.push(`justify-content: center !important;`);
      collectedCss.push(
        `${targetSelector},\n${targetSelector} .elementor-widget-container,\n${targetSelector} .elementor-icon-wrapper,\n${targetSelector} .elementor-icon {\n  ${decorRules.join('\n  ')}\n}`
      );
    }
  }

  // Text Editor widget styles (Full Elementor Free Typography & Box Model Suite)
  if (node.widgetType === 'text-editor') {
    const textRules = [];
    if (s.text_color) textRules.push(`color: ${s.text_color};`);
    if (s.align) textRules.push(`text-align: ${s.align};`);
    if (s.typography_font_family) {
      fontsToLoad.add(s.typography_font_family);
      textRules.push(`font-family: "${s.typography_font_family}", Sans-serif;`);
    }
    if (s.typography_font_size?.size) {
      textRules.push(`font-size: ${s.typography_font_size.size}${s.typography_font_size.unit || 'px'};`);
    }
    if (s.typography_font_weight) {
      textRules.push(`font-weight: ${s.typography_font_weight};`);
    }
    if (s.typography_line_height?.size) {
      textRules.push(`line-height: ${s.typography_line_height.size}${s.typography_line_height.unit || 'em'};`);
    }
    if (s.typography_letter_spacing?.size) {
      textRules.push(`letter-spacing: ${s.typography_letter_spacing.size}${s.typography_letter_spacing.unit || 'px'};`);
    }
    if (s.typography_text_transform) {
      textRules.push(`text-transform: ${s.typography_text_transform};`);
    }
    if (s.typography_font_style) {
      textRules.push(`font-style: ${s.typography_font_style};`);
    }
    if (s.typography_text_decoration) {
      textRules.push(`text-decoration: ${s.typography_text_decoration};`);
    }

    if (textRules.length > 0) {
      collectedCss.push(`${targetSelector}, ${targetSelector} p, ${targetSelector} .elementor-text-editor {\n  ${textRules.join('\n  ')}\n}`);
    }

    // Advanced wrapper margins/paddings/background/radius
    const widgetRules = [];
    if (s._background_color || s.background_color) {
      widgetRules.push(`background-color: ${s._background_color || s.background_color};`);
    }
    if (s._border_radius || s.border_radius) {
      const r = s._border_radius || s.border_radius;
      widgetRules.push(`border-radius: ${r.top || 0}${r.unit || 'px'} ${r.right || 0}${r.unit || 'px'} ${r.bottom || 0}${r.unit || 'px'} ${r.left || 0}${r.unit || 'px'};`);
    }
    if (s._margin) {
      widgetRules.push(`margin: ${s._margin.top || 0}${s._margin.unit || 'px'} ${s._margin.right || 0}${s._margin.unit || 'px'} ${s._margin.bottom || 0}${s._margin.unit || 'px'} ${s._margin.left || 0}${s._margin.unit || 'px'};`);
    }
    if (s._padding) {
      widgetRules.push(`padding: ${s._padding.top || 0}${s._padding.unit || 'px'} ${s._padding.right || 0}${s._padding.unit || 'px'} ${s._padding.bottom || 0}${s._padding.unit || 'px'} ${s._padding.left || 0}${s._padding.unit || 'px'};`);
    }
    if (widgetRules.length > 0) {
      collectedCss.push(`${targetSelector} {\n  ${widgetRules.join('\n  ')}\n}`);
    }
  }

  // Universal widget layout rules (width, flex-shrink, flex-grow, max-width, max-height, absolute positioning & z-index)
  if (node.elType === 'widget') {
    const wRules = [];
    if (s.width?.size) {
      wRules.push(`width: ${s.width.size}${s.width.unit || 'px'} !important;`);
      wRules.push(`max-width: ${s.width.size}${s.width.unit || 'px'};`);
    }
    if (s.max_height?.size !== undefined) {
      wRules.push(`max-height: ${s.max_height.size}${s.max_height.unit || 'px'} !important;`);
    }
    if (s.height?.size !== undefined) {
      wRules.push(`height: ${s.height.size}${s.height.unit || 'px'} !important;`);
    }
    if (s.min_height?.size) {
      wRules.push(`min-height: ${s.min_height.size}${s.min_height.unit || 'px'};`);
    }
    if (s.flex_shrink !== undefined && s.flex_shrink !== null) {
      wRules.push(`flex-shrink: ${s.flex_shrink} !important;`);
      if (Number(s.flex_shrink) > 0) {
        wRules.push(`min-width: 0;`);
      }
    } else if (s._flex_size === 'none') {
      wRules.push(`flex-shrink: 0 !important;`);
    }
    if (s.flex_grow !== undefined && s.flex_grow !== null) {
      wRules.push(`flex-grow: ${s.flex_grow};`);
    }
    if (s.max_width?.size) {
      wRules.push(`max-width: ${s.max_width.size}${s.max_width.unit || 'px'};`);
    }
    if (s.align_self || s._flex_align_self) {
      wRules.push(`align-self: ${s.align_self || s._flex_align_self} !important;`);
    }
    if (s._position === 'absolute' || s.position === 'absolute') {
      wRules.push(`position: absolute;`);
    }
    if (s._z_index !== undefined || s.z_index !== undefined) {
      wRules.push(`z-index: ${s._z_index !== undefined ? s._z_index : s.z_index};`);
    }
    if (wRules.length > 0) {
      collectedCss.push(`${targetSelector} {\n  ${wRules.join('\n  ')}\n}`);
    }
  }

  // Task G2: Composite Micro-Embed Scoped Reset
  if (s._composite_reset) {
    const r = s._composite_reset;
    collectedCss.push(
      `${targetSelector} button,\n` +
      `${targetSelector} .composite-trigger {\n` +
      `  appearance: none !important;\n` +
      `  background: ${r.background} !important;\n` +
      `  border: ${r.border} !important;\n` +
      `  color: ${r.color} !important;\n` +
      `  padding: ${r.padding} !important;\n` +
      `  width: 100%;\n` +
      `  display: flex;\n` +
      `  align-items: center;\n` +
      `  justify-content: ${r.justifyContent} !important;\n` +
      `  font: inherit;\n` +
      `  cursor: pointer;\n` +
      `  border-radius: ${r.borderRadius} !important;\n` +
      `}`
    );
  }

  // Universal custom_css / _custom_css compilation
  if (s.custom_css || s._custom_css) {
    const rawCss = s.custom_css || s._custom_css;
    const resolvedCss = rawCss.replace(/\bselector\b/g, targetSelector);
    collectedCss.push(resolvedCss);
  }

  // Compile Responsive Overrides for Tablet and Mobile
  compileResponsiveStyles(node, id, s, tabletCss, mobileCss);
}

function compileResponsiveStyles(node, id, s, tabletCss, mobileCss) {
  if (!tabletCss && !mobileCss) return;
  const targetSelector = resolveElementSelector(node, id);

  // 1. Tablet container & widget rules
  if (tabletCss) {
    const tabRules = [];
    if (node.elType === 'container') {
      const tabDir = s.flex_direction_tablet || s.direction_tablet;
      if (tabDir) {
        tabRules.push(`--flex-direction: ${tabDir};`);
        tabRules.push(`flex-direction: ${tabDir} !important;`);
      }
      const tabJustify = s.flex_justify_content_tablet || s.justify_content_tablet;
      if (tabJustify) {
        tabRules.push(`--justify-content: ${tabJustify};`);
        tabRules.push(`justify-content: ${tabJustify} !important;`);
      }
      const tabAlign = s.flex_align_items_tablet || s.align_items_tablet;
      if (tabAlign) {
        tabRules.push(`--align-items: ${tabAlign};`);
        tabRules.push(`align-items: ${tabAlign} !important;`);
      }
      const tabWrap = s.flex_wrap_tablet || s.wrap_tablet;
      if (tabWrap) {
        tabRules.push(`--flex-wrap: ${tabWrap};`);
        tabRules.push(`flex-wrap: ${tabWrap} !important;`);
      }
      const tabGapObj = s.flex_gap_tablet || s.gap_tablet;
      if (tabGapObj !== undefined && tabGapObj !== null) {
        let col = 0, row = 0;
        if (typeof tabGapObj === 'number') {
          col = tabGapObj; row = tabGapObj;
        } else if (typeof tabGapObj === 'object') {
          col = tabGapObj.column ?? tabGapObj.size ?? 0;
          row = tabGapObj.row ?? tabGapObj.size ?? 0;
        }
        tabRules.push(`--gap: ${row}px ${col}px;`);
        tabRules.push(`--row-gap: ${row}px;`);
        tabRules.push(`--column-gap: ${col}px;`);
        tabRules.push(`gap: ${row}px ${col}px;`);
        tabRules.push(`row-gap: ${row}px;`);
        tabRules.push(`column-gap: ${col}px;`);
      }
      if (s.width_tablet?.size) {
        tabRules.push(`width: ${s.width_tablet.size}${s.width_tablet.unit || '%'};`);
      }
      const tabPad = s.padding_tablet || s._padding_tablet;
      if (tabPad) {
        tabRules.push(`--padding-top: ${tabPad.top || 0}${tabPad.unit || 'px'};`);
        tabRules.push(`--padding-right: ${tabPad.right || 0}${tabPad.unit || 'px'};`);
        tabRules.push(`--padding-bottom: ${tabPad.bottom || 0}${tabPad.unit || 'px'};`);
        tabRules.push(`--padding-left: ${tabPad.left || 0}${tabPad.unit || 'px'};`);
        tabRules.push(`padding: var(--padding-top) var(--padding-right) var(--padding-bottom) var(--padding-left);`);
      }
      const tabMar = s.margin_tablet || s._margin_tablet;
      if (tabMar) {
        tabRules.push(`--margin-top: ${tabMar.top || 0}${tabMar.unit || 'px'};`);
        tabRules.push(`--margin-right: ${tabMar.right || 0}${tabMar.unit || 'px'};`);
        tabRules.push(`--margin-bottom: ${tabMar.bottom || 0}${tabMar.unit || 'px'};`);
        tabRules.push(`--margin-left: ${tabMar.left || 0}${tabMar.unit || 'px'};`);
        tabRules.push(`margin: var(--margin-top) var(--margin-right) var(--margin-bottom) var(--margin-left);`);
      }
      if (s.typography_font_size_tablet?.size) {
        tabRules.push(`font-size: ${s.typography_font_size_tablet.size}${s.typography_font_size_tablet.unit || 'px'};`);
      }
      if (s.min_height_tablet?.size) {
        tabRules.push(`--min-height: ${s.min_height_tablet.size}${s.min_height_tablet.unit || 'px'};`);
        tabRules.push(`min-height: ${s.min_height_tablet.size}${s.min_height_tablet.unit || 'px'};`);
      }
      if (s.align_self_tablet || s._flex_align_self_tablet) {
        tabRules.push(`align-self: ${s.align_self_tablet || s._flex_align_self_tablet} !important;`);
      }
      if (s._order_tablet !== undefined || s.order_tablet !== undefined) {
        tabRules.push(`order: ${s._order_tablet ?? s.order_tablet} !important;`);
      }

      // Responsive background image & geometry (tablet)
      if (s.background_background === 'classic' && typeof s.background_image?.url === 'string' && isSafeCssUrl(s.background_image.url)) {
        if (
          Object.prototype.hasOwnProperty.call(s, 'background_image_tablet') &&
          typeof s.background_image_tablet?.url === 'string' &&
          s.background_image_tablet.url.trim() !== '' &&
          isSafeCssUrl(s.background_image_tablet.url)
        ) {
          tabRules.push(`background-image: url("${s.background_image_tablet.url.trim()}");`);
        }
        if (s.background_size_tablet && VALID_SIZES.has(s.background_size_tablet)) {
          tabRules.push(`background-size: ${s.background_size_tablet};`);
        }
        if (s.background_position_tablet && VALID_POSITIONS.has(s.background_position_tablet)) {
          tabRules.push(`background-position: ${s.background_position_tablet};`);
        }
        if (s.background_repeat_tablet && VALID_REPEATS.has(s.background_repeat_tablet)) {
          tabRules.push(`background-repeat: ${s.background_repeat_tablet};`);
        }
      }

      // Responsive linear gradient (tablet)
      if (s.background_background === 'gradient') {
        const hasTabAngle = Object.prototype.hasOwnProperty.call(s, 'background_gradient_angle_tablet');
        const hasTabStopA = Object.prototype.hasOwnProperty.call(s, 'background_color_stop_tablet');
        const hasTabStopB = Object.prototype.hasOwnProperty.call(s, 'background_color_b_stop_tablet');

        if (hasTabAngle || hasTabStopA || hasTabStopB) {
          const tabOverridesValid =
            (!hasTabAngle || isValidGradientAngle(s.background_gradient_angle_tablet)) &&
            (!hasTabStopA || isValidGradientStop(s.background_color_stop_tablet)) &&
            (!hasTabStopB || isValidGradientStop(s.background_color_b_stop_tablet));

          const baseValid =
            s.background_gradient_type === 'linear' &&
            isFiniteGradientColor(s.background_color) &&
            isFiniteGradientColor(s.background_color_b) &&
            isValidGradientAngle(s.background_gradient_angle) &&
            isValidGradientStop(s.background_color_stop) &&
            isValidGradientStop(s.background_color_b_stop);

          if (tabOverridesValid && baseValid) {
            const tabAngle = hasTabAngle ? s.background_gradient_angle_tablet.size : s.background_gradient_angle.size;
            const tabStopA = hasTabStopA ? s.background_color_stop_tablet.size : s.background_color_stop.size;
            const tabStopB = hasTabStopB ? s.background_color_b_stop_tablet.size : s.background_color_b_stop.size;

            tabRules.push('background-color: transparent;');
            tabRules.push(`background-image: linear-gradient(${tabAngle}deg, ${s.background_color.trim()} ${tabStopA}%, ${s.background_color_b.trim()} ${tabStopB}%);`);
          }
        }
      }
    } else if (node.widgetType === 'heading') {
      const headingTabRules = [];
      if (s.typography_font_size_tablet?.size) {
        headingTabRules.push(`font-size: ${s.typography_font_size_tablet.size}${s.typography_font_size_tablet.unit || 'px'};`);
      }
      if (s.typography_line_height_tablet?.size) {
        headingTabRules.push(`line-height: ${s.typography_line_height_tablet.size}${s.typography_line_height_tablet.unit || 'em'};`);
      }
      if (s.typography_letter_spacing_tablet?.size) {
        headingTabRules.push(`letter-spacing: ${s.typography_letter_spacing_tablet.size}${s.typography_letter_spacing_tablet.unit || 'px'};`);
      }
      if (s.align_tablet) {
        headingTabRules.push(`text-align: ${s.align_tablet};`);
      }
      if (headingTabRules.length > 0) {
        tabletCss.push(`${targetSelector} .elementor-heading-title {\n  ${headingTabRules.join('\n  ')}\n}`);
      }
      const pad = s._padding_tablet || s.padding_tablet;
      if (pad) tabRules.push(`padding: ${pad.top || 0}${pad.unit || 'px'} ${pad.right || 0}${pad.unit || 'px'} ${pad.bottom || 0}${pad.unit || 'px'} ${pad.left || 0}${pad.unit || 'px'};`);
      const mar = s._margin_tablet || s.margin_tablet;
      if (mar) tabRules.push(`margin: ${mar.top || 0}${mar.unit || 'px'} ${mar.right || 0}${mar.unit || 'px'} ${mar.bottom || 0}${mar.unit || 'px'} ${mar.left || 0}${mar.unit || 'px'};`);
    } else if (node.widgetType === 'text-editor') {
      const textTabRules = [];
      if (s.typography_font_size_tablet?.size) {
        textTabRules.push(`font-size: ${s.typography_font_size_tablet.size}${s.typography_font_size_tablet.unit || 'px'};`);
      }
      if (s.typography_line_height_tablet?.size) {
        textTabRules.push(`line-height: ${s.typography_line_height_tablet.size}${s.typography_line_height_tablet.unit || 'em'};`);
      }
      if (s.typography_letter_spacing_tablet?.size) {
        textTabRules.push(`letter-spacing: ${s.typography_letter_spacing_tablet.size}${s.typography_letter_spacing_tablet.unit || 'px'};`);
      }
      if (s.align_tablet) {
        textTabRules.push(`text-align: ${s.align_tablet};`);
      }
      if (textTabRules.length > 0) {
        tabletCss.push(`${targetSelector}, ${targetSelector} p, ${targetSelector} .elementor-text-editor {\n  ${textTabRules.join('\n  ')}\n}`);
      }
    } else if (node.widgetType === 'button') {
      const btnTabRules = [];
      if (s.typography_font_size_tablet?.size) {
        btnTabRules.push(`font-size: ${s.typography_font_size_tablet.size}${s.typography_font_size_tablet.unit || 'px'};`);
      }
      if (s.typography_letter_spacing_tablet?.size) {
        btnTabRules.push(`letter-spacing: ${s.typography_letter_spacing_tablet.size}${s.typography_letter_spacing_tablet.unit || 'px'};`);
      }
      const pad = s.button_padding_tablet || s.padding_tablet || s._padding_tablet;
      if (pad) {
        btnTabRules.push(`padding: ${pad.top || 0}${pad.unit || 'px'} ${pad.right || 0}${pad.unit || 'px'} ${pad.bottom || 0}${pad.unit || 'px'} ${pad.left || 0}${pad.unit || 'px'};`);
      }
      const tabBtnGap = s.flex_gap_tablet || s.gap_tablet;
      if (tabBtnGap !== undefined && tabBtnGap !== null) {
        let col = 0, row = 0;
        if (typeof tabBtnGap === 'number') {
          col = tabBtnGap; row = tabBtnGap;
        } else if (typeof tabBtnGap === 'object') {
          col = tabBtnGap.column ?? tabBtnGap.size ?? 0;
          row = tabBtnGap.row ?? tabBtnGap.size ?? 0;
        }
        btnTabRules.push(`gap: ${row}px ${col}px;`);
        btnTabRules.push(`row-gap: ${row}px;`);
        btnTabRules.push(`column-gap: ${col}px;`);
      }
      if (s.border_radius_tablet) {
        const r = s.border_radius_tablet;
        btnTabRules.push(`border-radius: ${r.top || 0}${r.unit || 'px'} ${r.right || 0}${r.unit || 'px'} ${r.bottom || 0}${r.unit || 'px'} ${r.left || 0}${r.unit || 'px'};`);
      }
      if (btnTabRules.length > 0) {
        tabletCss.push(`${targetSelector} .elementor-button {\n  ${btnTabRules.join('\n  ')}\n}`);
      }
      if (s.align_tablet) {
        tabletCss.push(`${targetSelector} .elementor-button-wrapper {\n  text-align: ${s.align_tablet};\n}`);
      }
    } else if (node.widgetType === 'icon') {
      const iconTabRules = [];
      const tabSize = s.size_tablet?.size ?? (typeof s.size_tablet === 'number' ? s.size_tablet : s.typography_font_size_tablet?.size);
      if (tabSize) {
        iconTabRules.push(`font-size: ${tabSize}px;`);
      }
      if (iconTabRules.length > 0) {
        tabletCss.push(`${targetSelector} .elementor-icon {\n  ${iconTabRules.join('\n  ')}\n}`);
      }
    } else if (node.widgetType === 'image') {
      const imgTabRules = [];
      const tabH = s._img_lock_height_tablet ?? s._img_height_tablet ?? s.min_height_tablet?.size;
      const isLockedTabH = Boolean(s._img_lock_height_tablet || s.max_height_tablet?.size);
      if (tabH) {
        if (isLockedTabH) {
          imgTabRules.push(`height: ${tabH}px !important;`);
          imgTabRules.push(`max-height: ${tabH}px !important;`);
          imgTabRules.push(`min-height: ${tabH}px !important;`);
        } else {
          imgTabRules.push(`min-height: ${tabH}px !important;`);
          imgTabRules.push(`height: 100% !important;`);
        }
        if (s._hero_cover_fill || isLockedTabH) {
          imgTabRules.push(`object-fit: cover !important;`);
          imgTabRules.push(`width: 100% !important;`);
        }
      }
      if (s.width_tablet?.size) {
        imgTabRules.push(`width: ${s.width_tablet.size}${s.width_tablet.unit || 'px'} !important;`);
        imgTabRules.push(`max-width: ${s.width_tablet.size}${s.width_tablet.unit || 'px'} !important;`);
      }
      if (imgTabRules.length > 0) {
        tabletCss.push(
          `${targetSelector},\n` +
          `${targetSelector} .elementor-widget-image,\n` +
          `${targetSelector} .elementor-widget-container,\n` +
          `${targetSelector} .elementor-widget-container img,\n` +
          `${targetSelector} img {\n  ${imgTabRules.join('\n  ')}\n}`
        );
      }
    }
    if (node.elType === 'widget') {
      if (s.width_tablet?.size) {
        tabRules.push(`width: ${s.width_tablet.size}${s.width_tablet.unit || 'px'} !important;`);
        tabRules.push(`max-width: ${s.width_tablet.size}${s.width_tablet.unit || 'px'};`);
      } else if (s._element_width_tablet === '100') {
        tabRules.push(`width: 100% !important;`);
      } else if (s._element_width_tablet === 'auto' || s._element_width === 'auto') {
        tabRules.push(`width: auto !important;`);
        tabRules.push(`max-width: 100%;`);
      }
    }
    if (node.elType === 'widget' && s.max_height_tablet?.size !== undefined) {
      tabRules.push(`max-height: ${s.max_height_tablet.size}${s.max_height_tablet.unit || 'px'} !important;`);
    }
    if (node.elType === 'widget' && s.min_height_tablet?.size) {
      tabRules.push(`min-height: ${s.min_height_tablet.size}${s.min_height_tablet.unit || 'px'};`);
    }
    if (s.align_self_tablet || s._flex_align_self_tablet) {
      tabRules.push(`align-self: ${s.align_self_tablet || s._flex_align_self_tablet} !important;`);
    }
    if (s._order_tablet !== undefined || s.order_tablet !== undefined) {
      tabRules.push(`order: ${s._order_tablet ?? s.order_tablet} !important;`);
    }
    if (s.flex_shrink_tablet !== undefined && s.flex_shrink_tablet !== null) {
      tabRules.push(`flex-shrink: ${s.flex_shrink_tablet} !important;`);
    } else if (s._flex_size === 'none') {
      tabRules.push(`flex-shrink: 0 !important;`);
    }

    if (tabRules.length > 0) {
      tabletCss.push(`${targetSelector} {\n  ${tabRules.join('\n  ')}\n}`);
    }
    if (node.widgetType === 'icon' && s.align_tablet) {
      tabletCss.push(`${targetSelector} .elementor-icon-wrapper {\n  text-align: ${s.align_tablet};\n}`);
    }
  }

  // 2. Mobile container & widget rules
  if (mobileCss) {
    const mobRules = [];
    if (node.elType === 'container') {
      const mobDir = s.flex_direction_mobile || s.direction_mobile;
      if (mobDir) {
        mobRules.push(`--flex-direction: ${mobDir};`);
        mobRules.push(`flex-direction: ${mobDir} !important;`);
      }
      const mobJustify = s.flex_justify_content_mobile || s.justify_content_mobile;
      if (mobJustify) {
        mobRules.push(`--justify-content: ${mobJustify};`);
        mobRules.push(`justify-content: ${mobJustify} !important;`);
      }
      const mobAlign = s.flex_align_items_mobile || s.align_items_mobile;
      if (mobAlign) {
        mobRules.push(`--align-items: ${mobAlign};`);
        mobRules.push(`align-items: ${mobAlign} !important;`);
      }
      const mobWrap = s.flex_wrap_mobile || s.wrap_mobile;
      if (mobWrap) {
        mobRules.push(`--flex-wrap: ${mobWrap};`);
        mobRules.push(`flex-wrap: ${mobWrap} !important;`);
      }
      const mobGapObj = s.flex_gap_mobile || s.gap_mobile;
      if (mobGapObj !== undefined && mobGapObj !== null) {
        let col = 0, row = 0;
        if (typeof mobGapObj === 'number') {
          col = mobGapObj; row = mobGapObj;
        } else if (typeof mobGapObj === 'object') {
          col = mobGapObj.column ?? mobGapObj.size ?? 0;
          row = mobGapObj.row ?? mobGapObj.size ?? 0;
        }
        mobRules.push(`--gap: ${row}px ${col}px;`);
        mobRules.push(`--row-gap: ${row}px;`);
        mobRules.push(`--column-gap: ${col}px;`);
        mobRules.push(`gap: ${row}px ${col}px;`);
        mobRules.push(`row-gap: ${row}px;`);
        mobRules.push(`column-gap: ${col}px;`);
      }
      if (s.width_mobile?.size) {
        mobRules.push(`width: ${s.width_mobile.size}${s.width_mobile.unit || '%'};`);
      }
      const mobPad = s.padding_mobile || s._padding_mobile;
      if (mobPad) {
        mobRules.push(`--padding-top: ${mobPad.top || 0}${mobPad.unit || 'px'};`);
        mobRules.push(`--padding-right: ${mobPad.right || 0}${mobPad.unit || 'px'};`);
        mobRules.push(`--padding-bottom: ${mobPad.bottom || 0}${mobPad.unit || 'px'};`);
        mobRules.push(`--padding-left: ${mobPad.left || 0}${mobPad.unit || 'px'};`);
        mobRules.push(`padding: var(--padding-top) var(--padding-right) var(--padding-bottom) var(--padding-left);`);
      }
      const mobMar = s.margin_mobile || s._margin_mobile;
      if (mobMar) {
        mobRules.push(`--margin-top: ${mobMar.top || 0}${mobMar.unit || 'px'};`);
        mobRules.push(`--margin-right: ${mobMar.right || 0}${mobMar.unit || 'px'};`);
        mobRules.push(`--margin-bottom: ${mobMar.bottom || 0}${mobMar.unit || 'px'};`);
        mobRules.push(`--margin-left: ${mobMar.left || 0}${mobMar.unit || 'px'};`);
        mobRules.push(`margin: var(--margin-top) var(--margin-right) var(--margin-bottom) var(--margin-left);`);
      }
      if (s.typography_font_size_mobile?.size) {
        mobRules.push(`font-size: ${s.typography_font_size_mobile.size}${s.typography_font_size_mobile.unit || 'px'};`);
      }
      if (s.min_height_mobile?.size) {
        mobRules.push(`--min-height: ${s.min_height_mobile.size}${s.min_height_mobile.unit || 'px'};`);
        mobRules.push(`min-height: ${s.min_height_mobile.size}${s.min_height_mobile.unit || 'px'};`);
      }
      if (s.align_self_mobile || s._flex_align_self_mobile) {
        mobRules.push(`align-self: ${s.align_self_mobile || s._flex_align_self_mobile} !important;`);
      }
      if (s._order_mobile !== undefined || s.order_mobile !== undefined) {
        mobRules.push(`order: ${s._order_mobile ?? s.order_mobile} !important;`);
      }

      // Responsive background image & geometry (mobile)
      if (s.background_background === 'classic' && typeof s.background_image?.url === 'string' && isSafeCssUrl(s.background_image.url)) {
        if (
          Object.prototype.hasOwnProperty.call(s, 'background_image_mobile') &&
          typeof s.background_image_mobile?.url === 'string' &&
          s.background_image_mobile.url.trim() !== '' &&
          isSafeCssUrl(s.background_image_mobile.url)
        ) {
          mobRules.push(`background-image: url("${s.background_image_mobile.url.trim()}");`);
        }
        if (s.background_size_mobile && VALID_SIZES.has(s.background_size_mobile)) {
          mobRules.push(`background-size: ${s.background_size_mobile};`);
        }
        if (s.background_position_mobile && VALID_POSITIONS.has(s.background_position_mobile)) {
          mobRules.push(`background-position: ${s.background_position_mobile};`);
        }
        if (s.background_repeat_mobile && VALID_REPEATS.has(s.background_repeat_mobile)) {
          mobRules.push(`background-repeat: ${s.background_repeat_mobile};`);
        }
      }

      // Responsive linear gradient (mobile)
      if (s.background_background === 'gradient') {
        const hasMobAngle = Object.prototype.hasOwnProperty.call(s, 'background_gradient_angle_mobile');
        const hasMobStopA = Object.prototype.hasOwnProperty.call(s, 'background_color_stop_mobile');
        const hasMobStopB = Object.prototype.hasOwnProperty.call(s, 'background_color_b_stop_mobile');

        // Only emit if mobile has at least one explicit responsive override.
        // Otherwise, mobile inherits tablet media rule (or desktop) via CSS cascade.
        if (hasMobAngle || hasMobStopA || hasMobStopB) {
          const hasTabAngle = Object.prototype.hasOwnProperty.call(s, 'background_gradient_angle_tablet');
          const hasTabStopA = Object.prototype.hasOwnProperty.call(s, 'background_color_stop_tablet');
          const hasTabStopB = Object.prototype.hasOwnProperty.call(s, 'background_color_b_stop_tablet');

          const mobOverridesValid =
            (!hasMobAngle || isValidGradientAngle(s.background_gradient_angle_mobile)) &&
            (!hasMobStopA || isValidGradientStop(s.background_color_stop_mobile)) &&
            (!hasMobStopB || isValidGradientStop(s.background_color_b_stop_mobile));

          const tabFallbackValid =
            (hasMobAngle || !hasTabAngle || isValidGradientAngle(s.background_gradient_angle_tablet)) &&
            (hasMobStopA || !hasTabStopA || isValidGradientStop(s.background_color_stop_tablet)) &&
            (hasMobStopB || !hasTabStopB || isValidGradientStop(s.background_color_b_stop_tablet));

          const baseValid =
            s.background_gradient_type === 'linear' &&
            isFiniteGradientColor(s.background_color) &&
            isFiniteGradientColor(s.background_color_b) &&
            isValidGradientAngle(s.background_gradient_angle) &&
            isValidGradientStop(s.background_color_stop) &&
            isValidGradientStop(s.background_color_b_stop);

          if (mobOverridesValid && tabFallbackValid && baseValid) {
            const mobAngle = hasMobAngle
              ? s.background_gradient_angle_mobile.size
              : (hasTabAngle ? s.background_gradient_angle_tablet.size : s.background_gradient_angle.size);

            const mobStopA = hasMobStopA
              ? s.background_color_stop_mobile.size
              : (hasTabStopA ? s.background_color_stop_tablet.size : s.background_color_stop.size);

            const mobStopB = hasMobStopB
              ? s.background_color_b_stop_mobile.size
              : (hasTabStopB ? s.background_color_b_stop_tablet.size : s.background_color_b_stop.size);

            mobRules.push('background-color: transparent;');
            mobRules.push(`background-image: linear-gradient(${mobAngle}deg, ${s.background_color.trim()} ${mobStopA}%, ${s.background_color_b.trim()} ${mobStopB}%);`);
          }
        }
      }
    } else if (node.widgetType === 'heading') {
      const headingMobRules = [];
      if (s.typography_font_size_mobile?.size) {
        headingMobRules.push(`font-size: ${s.typography_font_size_mobile.size}${s.typography_font_size_mobile.unit || 'px'};`);
      }
      if (s.typography_line_height_mobile?.size) {
        headingMobRules.push(`line-height: ${s.typography_line_height_mobile.size}${s.typography_line_height_mobile.unit || 'em'};`);
      }
      if (s.typography_letter_spacing_mobile?.size) {
        headingMobRules.push(`letter-spacing: ${s.typography_letter_spacing_mobile.size}${s.typography_letter_spacing_mobile.unit || 'px'};`);
      }
      if (s.align_mobile) {
        headingMobRules.push(`text-align: ${s.align_mobile};`);
      }
      if (headingMobRules.length > 0) {
        mobileCss.push(`${targetSelector} .elementor-heading-title {\n  ${headingMobRules.join('\n  ')}\n}`);
      }
      const pad = s._padding_mobile || s.padding_mobile;
      if (pad) mobRules.push(`padding: ${pad.top || 0}${pad.unit || 'px'} ${pad.right || 0}${pad.unit || 'px'} ${pad.bottom || 0}${pad.unit || 'px'} ${pad.left || 0}${pad.unit || 'px'};`);
      const mar = s._margin_mobile || s.margin_mobile;
      if (mar) mobRules.push(`margin: ${mar.top || 0}${mar.unit || 'px'} ${mar.right || 0}${mar.unit || 'px'} ${mar.bottom || 0}${mar.unit || 'px'} ${mar.left || 0}${mar.unit || 'px'};`);
    } else if (node.widgetType === 'text-editor') {
      const textMobRules = [];
      if (s.typography_font_size_mobile?.size) {
        textMobRules.push(`font-size: ${s.typography_font_size_mobile.size}${s.typography_font_size_mobile.unit || 'px'};`);
      }
      if (s.typography_line_height_mobile?.size) {
        textMobRules.push(`line-height: ${s.typography_line_height_mobile.size}${s.typography_line_height_mobile.unit || 'em'};`);
      }
      if (s.typography_letter_spacing_mobile?.size) {
        textMobRules.push(`letter-spacing: ${s.typography_letter_spacing_mobile.size}${s.typography_letter_spacing_mobile.unit || 'px'};`);
      }
      if (s.align_mobile) {
        textMobRules.push(`text-align: ${s.align_mobile};`);
      }
      if (textMobRules.length > 0) {
        mobileCss.push(`${targetSelector}, ${targetSelector} p, ${targetSelector} .elementor-text-editor {\n  ${textMobRules.join('\n  ')}\n}`);
      }
    } else if (node.widgetType === 'button') {
      const btnMobRules = [];
      if (s.typography_font_size_mobile?.size) {
        btnMobRules.push(`font-size: ${s.typography_font_size_mobile.size}${s.typography_font_size_mobile.unit || 'px'};`);
      }
      if (s.typography_letter_spacing_mobile?.size) {
        btnMobRules.push(`letter-spacing: ${s.typography_letter_spacing_mobile.size}${s.typography_letter_spacing_mobile.unit || 'px'};`);
      }
      const pad = s.button_padding_mobile || s.padding_mobile || s._padding_mobile;
      if (pad) {
        btnMobRules.push(`padding: ${pad.top || 0}${pad.unit || 'px'} ${pad.right || 0}${pad.unit || 'px'} ${pad.bottom || 0}${pad.unit || 'px'} ${pad.left || 0}${pad.unit || 'px'};`);
      }
      const mobBtnGap = s.flex_gap_mobile || s.gap_mobile;
      if (mobBtnGap !== undefined && mobBtnGap !== null) {
        let col = 0, row = 0;
        if (typeof mobBtnGap === 'number') {
          col = mobBtnGap; row = mobBtnGap;
        } else if (typeof mobBtnGap === 'object') {
          col = mobBtnGap.column ?? mobBtnGap.size ?? 0;
          row = mobBtnGap.row ?? mobBtnGap.size ?? 0;
        }
        btnMobRules.push(`gap: ${row}px ${col}px;`);
        btnMobRules.push(`row-gap: ${row}px;`);
        btnMobRules.push(`column-gap: ${col}px;`);
      }
      if (s.border_radius_mobile) {
        const r = s.border_radius_mobile;
        btnMobRules.push(`border-radius: ${r.top || 0}${r.unit || 'px'} ${r.right || 0}${r.unit || 'px'} ${r.bottom || 0}${r.unit || 'px'} ${r.left || 0}${r.unit || 'px'};`);
      }
      if (s.align_mobile === 'justify') {
        btnMobRules.push(`width: 100% !important;`);
        btnMobRules.push(`display: flex !important;`);
        btnMobRules.push(`justify-content: center;`);
        btnMobRules.push(`text-align: center;`);
        mobileCss.push(`${targetSelector} .elementor-button-wrapper {\n  width: 100% !important;\n}`);
      } else if (s.align_mobile) {
        mobileCss.push(`${targetSelector} .elementor-button-wrapper {\n  text-align: ${s.align_mobile};\n}`);
      }
      if (btnMobRules.length > 0) {
        mobileCss.push(`${targetSelector} .elementor-button {\n  ${btnMobRules.join('\n  ')}\n}`);
      }
    } else if (node.widgetType === 'icon') {
      const iconMobRules = [];
      const mobSize = s.size_mobile?.size ?? (typeof s.size_mobile === 'number' ? s.size_mobile : s.typography_font_size_mobile?.size);
      if (mobSize) {
        iconMobRules.push(`font-size: ${mobSize}px;`);
      }
      if (iconMobRules.length > 0) {
        mobileCss.push(`${targetSelector} .elementor-icon {\n  ${iconMobRules.join('\n  ')}\n}`);
      }
    } else if (node.widgetType === 'image') {
      const imgMobRules = [];
      const mobH = s._img_lock_height_mobile ?? s._img_height_mobile ?? s.min_height_mobile?.size;
      const isLockedMobH = Boolean(s._img_lock_height_mobile || s.max_height_mobile?.size);
      if (mobH) {
        if (isLockedMobH) {
          imgMobRules.push(`height: ${mobH}px !important;`);
          imgMobRules.push(`max-height: ${mobH}px !important;`);
          imgMobRules.push(`min-height: ${mobH}px !important;`);
        } else {
          imgMobRules.push(`min-height: ${mobH}px !important;`);
          imgMobRules.push(`height: 100% !important;`);
        }
        if (s._hero_cover_fill || isLockedMobH) {
          imgMobRules.push(`object-fit: cover !important;`);
          imgMobRules.push(`width: 100% !important;`);
        }
      }
      if (s.width_mobile?.size) {
        imgMobRules.push(`width: ${s.width_mobile.size}${s.width_mobile.unit || 'px'} !important;`);
        imgMobRules.push(`max-width: ${s.width_mobile.size}${s.width_mobile.unit || 'px'} !important;`);
      }
      if (imgMobRules.length > 0) {
        mobileCss.push(
          `${targetSelector},\n` +
          `${targetSelector} .elementor-widget-image,\n` +
          `${targetSelector} .elementor-widget-container,\n` +
          `${targetSelector} .elementor-widget-container img,\n` +
          `${targetSelector} img {\n  ${imgMobRules.join('\n  ')}\n}`
        );
      }
    }
    if (node.elType === 'widget') {
      if (s.width_mobile?.size) {
        mobRules.push(`width: ${s.width_mobile.size}${s.width_mobile.unit || 'px'} !important;`);
        mobRules.push(`max-width: ${s.width_mobile.size}${s.width_mobile.unit || 'px'};`);
      } else if (s._element_width_mobile === '100') {
        mobRules.push(`width: 100% !important;`);
      } else if (s._element_width_mobile === 'auto' || s._element_width === 'auto') {
        mobRules.push(`width: auto !important;`);
        mobRules.push(`max-width: 100%;`);
      }
    }
    if (node.elType === 'widget' && s.max_height_mobile?.size !== undefined) {
      mobRules.push(`max-height: ${s.max_height_mobile.size}${s.max_height_mobile.unit || 'px'} !important;`);
    }
    if (node.elType === 'widget' && s.min_height_mobile?.size) {
      mobRules.push(`min-height: ${s.min_height_mobile.size}${s.min_height_mobile.unit || 'px'};`);
    }
    if (s.align_self_mobile || s._flex_align_self_mobile) {
      mobRules.push(`align-self: ${s.align_self_mobile || s._flex_align_self_mobile} !important;`);
    }
    if (s._order_mobile !== undefined || s.order_mobile !== undefined) {
      mobRules.push(`order: ${s._order_mobile ?? s.order_mobile} !important;`);
    }
    if (s.flex_shrink_mobile !== undefined && s.flex_shrink_mobile !== null) {
      mobRules.push(`flex-shrink: ${s.flex_shrink_mobile} !important;`);
    } else if (s._flex_size === 'none') {
      mobRules.push(`flex-shrink: 0 !important;`);
    }

    if (mobRules.length > 0) {
      mobileCss.push(`${targetSelector} {\n  ${mobRules.join('\n  ')}\n}`);
    }
    if (node.widgetType === 'icon' && s.align_mobile) {
      mobileCss.push(`${targetSelector} .elementor-icon-wrapper {\n  text-align: ${s.align_mobile};\n}`);
    }
  }
}

module.exports = {
  renderElementorToHtml,
  isSafeCssUrl
};

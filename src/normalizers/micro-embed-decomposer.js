/**
 * @deprecated Legacy v0.4 Fallback Normalizer.
 * In V2, Single-Pass Geometric Mapping (src/smart/geometry-mapper.js) natively preserves geometry.
 * Retained strictly as fallback for offline/legacy AST pipeline.
 */
/**
 * Autonomous AST Micro-Embed Decomposer (Tier 2 Smart Safety Net).
 * Scans the Elementor AST for any widgetType === 'html' that bundles structural cards,
 * text/headings, or buttons (lazy dumping) and automatically transmutes it into
 * 100% native Elementor Containers and Widgets before the Pre-Flight Linter runs.
 * 
 * Agnostic & Universal: Operates on DOM semantics (tags, text, inputs), zero hardcoded class names.
 */
const { parseHtmlToAst } = require('../parser/html-parser');
const { transformDomNodeToElementor, mapSvgToFontAwesome } = require('../transformers/universal-dom-transformer');
const { createIconWidget, createDividerWidget } = require('../transformers/widget-transformer');

function decomposeMicroEmbeds(contentElements) {
  if (!Array.isArray(contentElements)) return;

  function processContainer(container) {
    if (!container || !Array.isArray(container.elements)) return;

    const newElements = [];

    for (const el of container.elements) {
      if (el.elType === 'widget' && el.widgetType === 'html' && el.settings && el.settings.html) {
        const htmlCode = (el.settings.html || '').trim();
        const isStylesheet = htmlCode.startsWith('<style') || htmlCode.includes('</style>');
        const isScript = htmlCode.startsWith('<script') || htmlCode.includes('</script>');

        if (!isStylesheet && !isScript) {
          const containerClasses = (container.settings?.css_classes || container.settings?._css_classes || '');
          const widgetClasses = (el.settings.css_classes || el.settings._css_classes || '');

          // 1. Check for standalone or wrapper-enclosed SVG icon
          const isSvgIcon = /<svg\b/i.test(htmlCode) &&
            !/<input\b|<button\b|<form\b/i.test(htmlCode) &&
            htmlCode.replace(/<[^>]+>/g, '').trim().length === 0;

          if (isSvgIcon) {
            const classMatch = htmlCode.match(/class=["']([^"']+)["']/i);
            const idMatch = htmlCode.match(/id=["']([^"']+)["']/i);
            const combinedClass = [widgetClasses, containerClasses, classMatch?.[1]].filter(Boolean).join(' ');
            const iconGlyph = mapSvgToFontAwesome(htmlCode, combinedClass);
            const iconWidget = createIconWidget({
              icon: iconGlyph,
              view: 'default',
              size: 16,
              color: '#2563EB',
              css_classes: widgetClasses || classMatch?.[1] || 'vector-icon-widget',
              _element_id: el.settings._element_id || el.settings.id || idMatch?.[1] || ''
            });
            newElements.push(iconWidget);
            continue;
          }

          // 2. Check for Divider line or horizontal rule
          const isDivider = /^\s*<hr\b[^>]*\/?>\s*$/i.test(htmlCode) ||
            /^\s*<(?:div|span)\b[^>]*class=["'][^"']*(?:divider|separator|line|border-t|border-b)[^"']*["'][^>]*>\s*<\/(?:div|span)>\s*$/i.test(htmlCode);

          if (isDivider) {
            const classMatch = htmlCode.match(/class=["']([^"']+)["']/i);
            const idMatch = htmlCode.match(/id=["']([^"']+)["']/i);
            const dividerWidget = createDividerWidget({
              css_classes: widgetClasses || classMatch?.[1] || 'section-divider-widget',
              _element_id: el.settings._element_id || el.settings.id || idMatch?.[1] || ''
            });
            newElements.push(dividerWidget);
            continue;
          }

          // 3. Check if this HTML widget is a lazy-dumped structural block
          const isBrowserInputOnly = /^\s*<input\b[^>]*\/?>\s*$/i.test(htmlCode);
          const isAtomicToggleSwitch = !/(?:card|title|cost|info|addon-left|header|body|desc)/i.test(htmlCode) && (
            /^\s*<(?:div|span|label)\b[^>]*class=["'][^"']*(?:switch|toggle)[^"']*["']/i.test(htmlCode) ||
            /^\s*<(?:div|span|label)\b[^>]*>[\s\S]*?<input\b[^>]*type=["'](?:checkbox|radio)["'][^>]*>[\s\S]*?<(?:span|div)\b[^>]*class=["'][^"']*(?:slider|knob|handle|toggle|switch)[^"']*["']/i.test(htmlCode)
          );

          const hasInputWithSiblings = /<input\b/i.test(htmlCode) && !isBrowserInputOnly && !isAtomicToggleSwitch;

          const isLazyDumpedCard = hasInputWithSiblings || (!isBrowserInputOnly && !isAtomicToggleSwitch &&
            (
              /<(?:div|label|section|article|li|form)\b[^>]*class=["'][^"']*(?:card|grid|column|item|box|row|addon)[^"']*["']/i.test(htmlCode) ||
              (/<button\b[^>]*class=["'][^"']*(?:cta|submit|btn|button)[^"']*["']/i.test(htmlCode) && htmlCode.length > 250) ||
              (/<(?:div|label)\b[^>]*>[\s\S]*?<input\b[^>]*>[\s\S]*?<\/(?:div|label)>/i.test(htmlCode) && (/<span\b|<p\b|<h[1-6]\b/i.test(htmlCode))) ||
              (/<(?:div|span|p)\b[^>]*class=["'][^"']*(?:tooltip|tick|label)[^"']*["']/i.test(htmlCode) && !htmlCode.includes('<input'))
            ));

          if (isLazyDumpedCard) {
            try {
              const ast = parseHtmlToAst(htmlCode);
              const topNodes = (ast && ast.tagName === 'root') ? ast.children : [ast];
              const decomposed = topNodes
                .map(child => transformDomNodeToElementor(child, container))
                .filter(Boolean);

              if (decomposed.length > 0) {
                newElements.push(...decomposed);
                continue;
              }
            } catch (err) {
              // If parsing fails for any reason, keep original element
            }
          }
        }
      }

      // If el is a container, recursively process its children
      if (el.elType === 'container') {
        processContainer(el);
      }

      newElements.push(el);
    }

    container.elements = newElements;
  }

  for (const root of contentElements) {
    if (root.elType === 'container') {
      processContainer(root);
    }
  }
}

module.exports = {
  decomposeMicroEmbeds
};

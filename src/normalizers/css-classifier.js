/**
 * @deprecated Legacy v0.4 Fallback Normalizer.
 * In V2, Single-Pass Geometric Mapping (src/smart/geometry-mapper.js) natively preserves geometry.
 * Retained strictly as fallback for offline/legacy AST pipeline.
 */
/**
 * Smart CSS Classifier & Micro-CSS Extractor.
 * Dynamically partitions raw CSS stylesheets into:
 * 1. Native Elementor Declarations: Mapped directly to widget settings (0 raw CSS output).
 * 2. WordPress Theme Pollutants: Global resets (body, html, *) are stripped 100%.
 * 3. Micro-CSS Fallbacks: Scoped strictly to pseudo-elements, dynamic JS states, and custom sibling switches (~1 KB).
 */

const {
  isNativeElementorProperty,
  isMicroCssSelector,
  isGlobalResetSelector
} = require('../core/elementor-free-schema');
const { extractCssVariables, flattenCssVariables } = require('./css-style-resolver');
const { isElementorNativeProperty, toKebabCss } = require('../smart/style-router');

/**
 * Parses raw CSS string into structured rule tokens.
 */
function parseCssBlocks(cssText = '') {
  const clean = cssText.replace(/\/\*[\s\S]*?\*\//g, ''); // strip comments
  const blocks = [];
  let depth = 0;
  let current = '';
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];

    if (inString) {
      current += char;
      if (char === stringChar && clean[i - 1] !== '\\') {
        inString = false;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      stringChar = char;
      current += char;
      continue;
    }

    if (char === '{') {
      depth++;
      current += char;
    } else if (char === '}') {
      depth--;
      current += char;
      if (depth === 0) {
        const trimmed = current.trim();
        if (trimmed) blocks.push(trimmed);
        current = '';
      }
    } else {
      current += char;
    }
  }

  return blocks;
}

function isPseudoOrStateSelector(selector = '') {
  if (/::?(?:hover|focus|active|visited|focus-within|focus-visible|before|after|marker|nth-child|nth-of-type|first-child|last-child|checked|disabled|placeholder)/i.test(selector)) {
    return true;
  }
  if (/(?:^|\s|\.)(?:is-active|active|is-hidden|hidden|hide|invisible|is-open|open|show|is-collapsed|fade-in|fade-out|tier-hidden|filtered)\b|\[data-|\[aria-|\[hidden\]/i.test(selector)) {
    return true;
  }
  return false;
}

/**
 * Checks if a CSS selector matches any of the collected micro-embed classes.
 * Enforces CSS class identifier boundaries (not followed by [a-zA-Z0-9_-]).
 */
function matchesMicroEmbedClass(selector = '', microEmbedClasses) {
  if (!microEmbedClasses) return false;
  const size = microEmbedClasses instanceof Set ? microEmbedClasses.size : microEmbedClasses.length;
  if (!size) return false;

  const classSet = microEmbedClasses instanceof Set ? microEmbedClasses : new Set(microEmbedClasses);
  for (const cls of classSet) {
    if (!cls || typeof cls !== 'string') continue;
    const cleanCls = cls.trim().replace(/^\./, '');
    if (!cleanCls) continue;
    const escaped = cleanCls.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`\\.${escaped}(?![a-zA-Z0-9_-])`);
    if (regex.test(selector)) {
      return true;
    }
  }
  return false;
}

function extractAdvancedDeclarations(declarationBlock = '', isStateOrPseudo = false, selectorGroup = '', isMicroEmbed = false) {
  const decls = [];
  let current = '';
  let inParen = 0;
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < declarationBlock.length; i++) {
    const ch = declarationBlock[i];

    if (inString) {
      current += ch;
      if (ch === stringChar && declarationBlock[i - 1] !== '\\') {
        inString = false;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      current += ch;
      continue;
    }

    if (ch === '(') inParen++;
    else if (ch === ')') inParen--;

    if (ch === ';' && inParen === 0) {
      if (current.trim()) decls.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) decls.push(current.trim());

  const hasTextClipOrFill = /(?:-webkit-)?background-clip\s*:\s*text|-webkit-text-fill-color\s*:\s*transparent/i.test(declarationBlock);
  const hasBackground = /\bbackground(?:-image)?\s*:/i.test(declarationBlock);

  const advanced = [];
  for (const d of decls) {
    const colon = d.indexOf(':');
    if (colon === -1) continue;
    const rawProp = d.slice(0, colon).trim();
    const prop = rawProp.toLowerCase();
    let val = d.slice(colon + 1).trim();

    // F5: Normalize empty/quote content to valid CSS string
    if (prop === 'content') {
      if (!val || val === "''" || val === '""') {
        val = "''";
      }
    }

    // 1. Drop dead grid properties (G5)
    if (prop === 'display' && val.includes('grid')) {
      continue;
    }
    if (prop === 'grid' || prop.startsWith('grid-')) {
      continue;
    }

    // 2. Preserve CSS variables
    if (prop.startsWith('--')) {
      advanced.push(`${prop}: ${val}`);
      continue;
    }

    // D1 Guard: Gradient text atomicity.
    // If declaration block has text-clip / transparent fill AND has background:
    // background and background-image MUST NOT be dropped as representable!
    // They must travel together atomically.
    const isBgProperty = prop === 'background' || prop === 'background-image';
    if (hasTextClipOrFill && hasBackground && isBgProperty) {
      const kebabProp = toKebabCss(rawProp);
      advanced.push(`${kebabProp}: ${val}`);
      continue;
    }

    // If declaration block has transparent text fill BUT NO background,
    // do NOT emit -webkit-text-fill-color: transparent alone (which renders invisible text).
    if (hasTextClipOrFill && !hasBackground && (prop === '-webkit-text-fill-color' || prop === 'webkittextfillcolor')) {
      continue;
    }

    // 3. Drop redundant base-selector rules (Task F9)
    // Task G1: If selector matches micro-embed classes, SKIP pruning (retain full declarations)
    if (!isStateOrPseudo && !isMicroEmbed) {
      // Check if this declaration is part of an image fill chain
      const isImageOrMediaSelector = /\b(?:img|picture|video)\b/i.test(selectorGroup);
      const isFillChain = isImageOrMediaSelector && (
        prop === 'object-fit' ||
        prop === 'object-position' ||
        ((prop === 'height' || prop === 'width') && val.includes('100%'))
      );

      if (!isFillChain) {
        // (b) Drop container defaults: display on base selectors (flex, block, inline-flex, none, etc.)
        // (c) Drop responsive visibility & order backups already handled in settings (hide_mobile, order_tablet)
        if (prop === 'display' || prop === 'order') {
          continue;
        }

        // (a) Drop representable declarations from base selectors (Z1 / F6)
        // If a property has a native Elementor setting, it is routed to settings, NOT retained in base selector.
        if (isElementorNativeProperty(prop)) {
          continue;
        }
      }
    }

    // 4. B2 / Z1 Key-Less Rule Retention:
    // If it is a state/pseudo selector, OR a property with NO native Elementor setting key
    // (max-height, overflow, backdrop-filter, transition, object-fit, cursor, etc.),
    // retain it strictly with kebab-case at emission!
    const kebabProp = toKebabCss(rawProp);
    advanced.push(`${kebabProp}: ${val}`);
  }

  // D1 Invariant: If -webkit-background-clip: text is present, ensure background-clip: text is also present
  if (advanced.some(a => a.startsWith('-webkit-background-clip: text')) && !advanced.some(a => a.startsWith('background-clip: text'))) {
    advanced.push('background-clip: text');
  }

  return advanced;
}

/**
 * Task K8: Universal State-Rule Semantic Target Mapping.
 * Builds element classification map by elType/widgetType (Note N1):
 * - WIDGET-level: elType === 'widget' && widgetType !== 'html' (button, heading, icon, text-editor)
 * - CONTAINER-level: elType === 'container' || widgetType === 'html' (composite-trigger rules are container-level)
 */
function buildElementClassificationMap(elements) {
  const widgetClassMap = new Map(); // className -> widgetType ('button', 'heading', 'icon', etc.)
  const containerClassSet = new Set(); // className -> true
  const htmlWidgetClassSet = new Set(); // className -> true (raw HTML widget classes, Note N1)

  function walk(nodes) {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes) {
      if (!node) continue;
      const rawClasses = (node.settings?.css_classes || node.settings?._css_classes || node.css_classes || node._css_classes || '');
      const classes = String(rawClasses).split(/\s+/).map(c => c.trim().replace(/^\./, '')).filter(Boolean);

      if (node.elType === 'container') {
        for (const cls of classes) {
          containerClassSet.add(cls);
        }
      } else if (node.elType === 'widget') {
        if (node.widgetType === 'html') {
          // N1: Html widgets dyal composite-trigger: l-is-active rules dyalhom container-level (ybqaw)
          for (const cls of classes) {
            containerClassSet.add(cls);
            htmlWidgetClassSet.add(cls);
          }
          // Reviewer Note N1: Also extract classes from raw HTML inside the widget
          if (node.settings?.html && typeof node.settings.html === 'string') {
            const classMatches = node.settings.html.match(/class=["']([^"']+)["']/gi) || [];
            for (const cm of classMatches) {
              const val = cm.replace(/^class=["']|["']$/gi, '');
              val.split(/\s+/).forEach(c => {
                const cleaned = c.trim().replace(/^\./, '');
                if (cleaned) {
                  containerClassSet.add(cleaned);
                  htmlWidgetClassSet.add(cleaned);
                }
              });
            }
          }
        } else if (['button', 'heading', 'icon', 'text-editor', 'image'].includes(node.widgetType)) {
          for (const cls of classes) {
            widgetClassMap.set(cls, node.widgetType);
          }
        }
      }

      if (node.elements && Array.isArray(node.elements)) {
        walk(node.elements);
      }
    }
  }

  walk(elements);
  return { widgetClassMap, containerClassSet, htmlWidgetClassSet };
}

/**
 * Task K8: Universal State-Rule Semantic Target Mapping (hover-area fix).
 * Expands hover/active/focus/::before/::after rules to target Elementor's inner primitives:
 * - WIDGET-level (button, heading, icon): state selectors target ONLY the inner semantic element
 *   (.elementor-button:hover, .elementor-heading-title:hover, .elementor-icon:hover).
 *   STRICTLY PROHIBITS bare .CLASS:hover or wrapper-triggered .CLASS:hover <descendant>.
 * - CONTAINER-level (cards, sections, containers, composite-trigger html widgets):
 *   preserves container-level hover (.feature-card:hover, .timeline-step:hover).
 */
function expandStateSelectorForElementor(selectorGroup, classificationMap = null) {
  if (!selectorGroup || typeof selectorGroup !== 'string') return selectorGroup;

  const selectors = selectorGroup.split(',').map(s => s.trim()).filter(Boolean);
  const expanded = [];

  for (const sel of selectors) {
    // If selector already targets Elementor internals, preserve as-is
    if (sel.includes('.elementor-')) {
      expanded.push(sel);
      continue;
    }

    const hasPseudoState = /:(?:hover|focus|active|focus-within|focus-visible)\b/i.test(sel);
    const hasActiveState = /(?:^|\s|\.)(?:is-active|active)\b|\[data-[^\]]*is-active|\[aria-expanded="true"\]/i.test(sel);
    const hasPseudoElem = /::?(?:before|after|marker)\b/i.test(sel);

    if (!hasPseudoState && !hasActiveState && !hasPseudoElem) {
      expanded.push(sel);
      continue;
    }

    // Extract classes from selector
    const classesInSel = (sel.match(/\.([a-z0-9_-]+)/gi) || []).map(c => c.slice(1));

    // Reviewer Note N1: HTML widgets (composite controls) raw HTML classes
    // MUST remain pure PASS-THROUGH without rewriting to inner semantic nodes (.elementor-button etc.)
    if (classificationMap && classificationMap.htmlWidgetClassSet && classificationMap.htmlWidgetClassSet.size > 0) {
      const isHtmlWidgetRule = classesInSel.some(cls => classificationMap.htmlWidgetClassSet.has(cls));
      if (isHtmlWidgetRule) {
        expanded.push(sel);
        continue;
      }
    }

    // Determine if selector targets a widget-level element
    let isWidgetLevel = false;
    let widgetKind = null;

    if (classificationMap && classificationMap.widgetClassMap && classificationMap.widgetClassMap.size > 0) {
      for (const cls of classesInSel) {
        if (classificationMap.widgetClassMap.has(cls)) {
          isWidgetLevel = true;
          widgetKind = classificationMap.widgetClassMap.get(cls);
          break;
        }
      }
      // If any class is explicitly container-level, container takes priority
      if (isWidgetLevel && classificationMap.containerClassSet) {
        for (const cls of classesInSel) {
          if (classificationMap.containerClassSet.has(cls)) {
            isWidgetLevel = false;
            break;
          }
        }
      }
    } else {
      // Fallback heuristics when classificationMap is not passed or empty (standalone unit tests)
      const isContainerOrCard = /(?:card|container|grid|section|box|wrap|row|col|item|step|accordion)\b/i.test(sel);
      if (!isContainerOrCard) {
        if (/(?:^|\s|\.|\#)[a-z0-9_-]*(?:btn|button|cta)[a-z0-9_-]*/i.test(sel)) {
          isWidgetLevel = true;
          widgetKind = 'button';
        } else if (/(?:heading|title)[a-z0-9_-]*/i.test(sel)) {
          isWidgetLevel = true;
          widgetKind = 'heading';
        } else if (/(?:icon)[a-z0-9_-]*/i.test(sel) && !/(?:badge-icon|feature-icon|step-marker)/i.test(sel)) {
          isWidgetLevel = true;
          widgetKind = 'icon';
        }
      }
    }

    // Check if selector has descendant/child combinator (space, >, +, ~)
    const hasCombinator = /[\s>+~]/.test(sel);

    if (hasCombinator) {
      // Check if target ends with a leaf element (img, svg, path, input, textarea)
      const leafMatch = sel.match(/(?:^|[\s>+~])(img|svg|path|input|textarea|video|canvas)\b/i);
      if (leafMatch && sel.endsWith(leafMatch[1])) {
        expanded.push(sel);
        continue;
      }

      // Check if ends with pseudo-element
      const pseudoElemMatch = sel.match(/::?(?:before|after|marker)$/i);
      if (pseudoElemMatch) {
        const base = sel.slice(0, pseudoElemMatch.index).trim();
        const pElem = pseudoElemMatch[0];
        expanded.push(sel);
        expanded.push(`${base} .elementor-heading-title${pElem}`);
        expanded.push(`${base} .elementor-icon${pElem}`);
        expanded.push(`${base} .elementor-button${pElem}`);
        continue;
      }

      // If the descendant target is a widget-level button
      if (isWidgetLevel && widgetKind === 'button' && (hasPseudoState || hasActiveState)) {
        const pseudoMatch = sel.match(/:(?:hover|focus|active|focus-within|focus-visible)/i);
        const pseudo = pseudoMatch ? pseudoMatch[0] : ':hover';
        const base = sel.replace(/:(?:hover|focus|active|focus-within|focus-visible)/gi, '');
        expanded.push(`${base} .elementor-button${pseudo}`);
        expanded.push(`${base}.elementor-widget-button .elementor-button${pseudo}`);
        continue;
      }

      // Standard descendant under container state (e.g. .timeline-step:hover .step-marker, .accordion-item.is-active .accordion-icon)
      expanded.push(sel);
      expanded.push(`${sel} .elementor-heading-title`);
      expanded.push(`${sel} .elementor-icon`);
      expanded.push(`${sel} .elementor-button`);
      if (hasActiveState) {
        expanded.push(`${sel} *`);
      }
    } else {
      // Single-subject selector (e.g. .btn-primary:hover, .guide-card:hover, a:hover)
      if (isWidgetLevel && widgetKind === 'button' && hasPseudoState) {
        // N1, N3: State selectors target ONLY the inner semantic element
        // PROHIBITED: bare .CLASS:hover and wrapper-triggered .CLASS:hover <descendant>
        const pseudoMatch = sel.match(/:(?:hover|focus|active|focus-within|focus-visible)/i);
        const pseudo = pseudoMatch ? pseudoMatch[0] : ':hover';
        const base = sel.replace(/:(?:hover|focus|active|focus-within|focus-visible)/gi, '');
        expanded.push(`${base} .elementor-button${pseudo}`);
        expanded.push(`.elementor-widget-button${base} .elementor-button${pseudo}`);
      } else if (isWidgetLevel && widgetKind === 'heading' && hasPseudoState) {
        const pseudoMatch = sel.match(/:(?:hover|focus|active)/i);
        const pseudo = pseudoMatch ? pseudoMatch[0] : ':hover';
        const base = sel.replace(/:(?:hover|focus|active)/gi, '');
        expanded.push(`${base} .elementor-heading-title${pseudo}`);
        expanded.push(`.elementor-widget-heading${base} .elementor-heading-title${pseudo}`);
      } else if (isWidgetLevel && widgetKind === 'icon' && hasPseudoState) {
        const pseudoMatch = sel.match(/:(?:hover|focus|active)/i);
        const pseudo = pseudoMatch ? pseudoMatch[0] : ':hover';
        const base = sel.replace(/:(?:hover|focus|active)/gi, '');
        expanded.push(`${base} .elementor-icon${pseudo}`);
        expanded.push(`.elementor-widget-icon${base} .elementor-icon${pseudo}`);
      } else if (hasPseudoElem) {
        const pseudoElemMatch = sel.match(/::?(?:before|after|marker)$/i);
        const base = sel.slice(0, pseudoElemMatch.index).trim();
        const pElem = pseudoElemMatch[0];
        expanded.push(sel);
        const isContainer = /(?:container|grid|section|wrap|row|col)\b/i.test(base);
        if (!isContainer) {
          expanded.push(`${base} .elementor-heading-title${pElem}`);
          expanded.push(`${base} .elementor-icon${pElem}`);
        }
      } else {
        // CONTAINER-level state rule (e.g. .guide-card:hover, .feature-card:hover, .badge-card:hover)
        // Preserved!
        expanded.push(sel);
        if (sel.includes('a:') || sel.includes('link:') || sel.includes('title:') || sel.includes('icon:')) {
          const pseudoMatch = sel.match(/:(?:hover|focus|active)/i);
          const pseudo = pseudoMatch ? pseudoMatch[0] : ':hover';
          const base = sel.replace(/:(?:hover|focus|active)/gi, '');
          expanded.push(`${base} .elementor-heading-title${pseudo}`);
          expanded.push(`${base} .elementor-icon${pseudo}`);
        }
      }
    }
  }

  return Array.from(new Set(expanded)).join(', ');
}

/**
 * Extracts strictly necessary Micro-CSS rules that cannot be handled
 * by Elementor Free native controls.
 */
function extractMicroCss(rawCss = '', isNestedOrOptions = false, maybeOptions = {}) {
  if (!rawCss || typeof rawCss !== 'string') return '';

  let isNested = false;
  let options = {};
  if (typeof isNestedOrOptions === 'boolean') {
    isNested = isNestedOrOptions;
    options = maybeOptions || {};
  } else if (typeof isNestedOrOptions === 'object' && isNestedOrOptions !== null) {
    options = isNestedOrOptions;
    isNested = !!options.isNested;
  }

  // Task G1: Collect all micro-embed classes to exempt their selectors from F9 pruning
  const microEmbedClasses = new Set();

  if (options.microEmbedClasses) {
    const list = Array.isArray(options.microEmbedClasses) || options.microEmbedClasses instanceof Set
      ? options.microEmbedClasses
      : [options.microEmbedClasses];
    for (const c of list) {
      if (typeof c === 'string') {
        const cleaned = c.trim().replace(/^\./, '');
        if (cleaned) microEmbedClasses.add(cleaned);
      }
    }
  }

  if (options.rawHtml) {
    const htmlList = Array.isArray(options.rawHtml) ? options.rawHtml : [options.rawHtml];
    for (const html of htmlList) {
      if (typeof html === 'string') {
        const matches = html.matchAll(/class=["']([^"']+)["']/gi);
        for (const m of matches) {
          m[1].split(/\s+/).filter(Boolean).forEach(cls => microEmbedClasses.add(cls));
        }
      }
    }
  }

  if (options.microEmbeds && Array.isArray(options.microEmbeds)) {
    for (const emb of options.microEmbeds) {
      const html = emb?.rawHtml || emb?.html || (typeof emb === 'string' ? emb : '');
      if (typeof html === 'string') {
        const matches = html.matchAll(/class=["']([^"']+)["']/gi);
        for (const m of matches) {
          m[1].split(/\s+/).filter(Boolean).forEach(cls => microEmbedClasses.add(cls));
        }
      }
    }
  }

  if (options.elements && Array.isArray(options.elements)) {
    function scanEl(list) {
      for (const el of list) {
        if (!el) continue;
        if (el.widgetType === 'html') {
          const html = el.settings?.html || el.rawHtml || '';
          if (!el._html_reason?.includes('stylesheet-engine') && !html.startsWith('<style')) {
            const matches = html.matchAll(/class=["']([^"']+)["']/gi);
            for (const m of matches) {
              m[1].split(/\s+/).filter(Boolean).forEach(cls => microEmbedClasses.add(cls));
            }
          }
        }
        if (el.elements && Array.isArray(el.elements)) scanEl(el.elements);
      }
    }
    scanEl(options.elements);
  }

  const classificationMap = options.classificationMap || buildElementClassificationMap(options.elements);
  const blocks = parseCssBlocks(rawCss);
  const microCssRules = [];

  for (const block of blocks) {
    // 1. Check for Keyframe Animations
    if (block.startsWith('@keyframes') || block.startsWith('@-webkit-keyframes')) {
      microCssRules.push(block);
      continue;
    }

    // 2. Check for Media Queries
    if (block.startsWith('@media')) {
      const openBraceIdx = block.indexOf('{');
      const header = block.slice(0, openBraceIdx).trim();
      const body = block.slice(openBraceIdx + 1, block.lastIndexOf('}')).trim();
      const innerRules = extractMicroCss(body, { ...options, isNested: true, microEmbedClasses, classificationMap });
      if (innerRules) {
        microCssRules.push(`${header} {\n  ${innerRules.split('\n').join('\n  ')}\n}`);
      }
      continue;
    }

    // 3. Standard Rule: Selector { Declarations }
    const openBraceIdx = block.indexOf('{');
    const closeBraceIdx = block.lastIndexOf('}');
    if (openBraceIdx === -1 || closeBraceIdx === -1) {
      continue;
    }

    const selectorGroup = block.slice(0, openBraceIdx).trim();
    const declarations = block.slice(openBraceIdx + 1, closeBraceIdx).trim();

    // Check if selector belongs to an explicitly preserved micro-embed block
    const individualSelectors = selectorGroup.split(',').map(s => s.trim()).filter(Boolean);

    // Filter out global resets (body, html, *, etc.)
    if (individualSelectors.some(isGlobalResetSelector)) {
      continue;
    }

    const isStateOrPseudo = isPseudoOrStateSelector(selectorGroup);
    const isMicroEmbed = matchesMicroEmbedClass(selectorGroup, microEmbedClasses);
    const advancedDecls = extractAdvancedDeclarations(declarations, isStateOrPseudo, selectorGroup, isMicroEmbed);

    // G5.5: Never emit empty rule blocks!
    if (advancedDecls.length === 0) {
      continue;
    }

    // Task K8: Universal State-Rule Depth & Semantic Target Mapping
    const targetSelector = isStateOrPseudo
      ? expandStateSelectorForElementor(selectorGroup, classificationMap)
      : selectorGroup;

    // Universal Dynamic Visibility & Filtering State Invariant:
    // Elementor Free flexbox containers (.e-con) apply display: flex !important.
    // When a rule declares display: none on a dynamic visibility state (.hide, .is-hidden, [hidden], etc.),
    // enforce display: none !important so filtered cards cleanly collapse from the layout flow.
    const isVisibilityState = /\.(?:hide|hidden|is-hidden|fade-out|invisible|is-collapsed|tier-hidden|filtered)\b|\[hidden\]/i.test(selectorGroup);
    const formattedDecls = advancedDecls.map(decl => {
      if (isVisibilityState && /^display\s*:\s*none\b/i.test(decl) && !decl.includes('!important')) {
        return 'display: none !important';
      }
      if (isStateOrPseudo && !decl.includes('!important')) {
        const colonIdx = decl.indexOf(':');
        if (colonIdx !== -1) {
          const prop = decl.slice(0, colonIdx).trim().toLowerCase();
          // State override properties that must win against base atomic/decor rules
          if (['background', 'background-color', 'border-color', 'color', 'transform', 'max-height', 'opacity', 'fill', 'stroke', 'box-shadow'].includes(prop)) {
            return `${decl} !important`;
          }
        }
      }
      return decl;
    });

    microCssRules.push(`${targetSelector} {\n  ${formattedDecls.join(';\n  ')};\n}`);
  }

  let finalMicroCss = microCssRules.join('\n\n').trim();

  // Full-bleed Image Container Chain (RULE-IMG-01):
  // When an image is inside a fixed-height media container, ensures Elementor's intermediate widget
  // wrappers (which default to height: auto) do not collapse percentage heights.
  // STRICT WIDGET SCOPING: Target ONLY .elementor-widget-image so overlay badges/pills are never stretched.
  const hasImageOrMedia = !isNested && (/\bimg\b/i.test(rawCss) || /(?:\.|\#|\[class\*=|class=")[a-z0-9_-]*(?:media|thumb|cover)\b/i.test(rawCss));
  if (hasImageOrMedia) {
    const mediaHeightBridge = `
[class*="media"], [class*="thumb"], [class*="cover"] {
  overflow: hidden !important;
}
[class*="media"] .elementor-widget-image,
[class*="media"] .elementor-widget-image .elementor-widget-container,
[class*="thumb"] .elementor-widget-image,
[class*="thumb"] .elementor-widget-image .elementor-widget-container,
[class*="cover"] .elementor-widget-image,
[class*="cover"] .elementor-widget-image .elementor-widget-container {
  height: 100% !important;
  display: flex !important;
  width: 100% !important;
}
[class*="media"] .elementor-widget-image img,
[class*="thumb"] .elementor-widget-image img,
[class*="cover"] .elementor-widget-image img {
  width: 100% !important;
  height: 100% !important;
  object-fit: cover !important;
}
`;
    finalMicroCss = (finalMicroCss + '\n' + mediaHeightBridge).trim();
  }

  // Optical Vertical Centering for Pill Badges (RULE-CSS-03):
  // Eliminates theme default line-height (1.5) on uppercase heading spans inside pill badges.
  if (!isNested && (rawCss.includes('badge') || rawCss.includes('pill'))) {
    const badgeOpticalBridge = `
.elementor-widget-heading[class*="badge"] .elementor-heading-title,
.elementor-widget-heading[class*="pill"] .elementor-heading-title,
[class*="badge"] .elementor-heading-title,
[class*="pill"] .elementor-heading-title {
  line-height: 1 !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  margin: 0 !important;
}
`;
    finalMicroCss = (finalMicroCss + '\n' + badgeOpticalBridge).trim();
  }

  // Universal structural control helpers (pure layout/pointer rules, zero hardcoded colors)
  if (!isNested && (rawCss.includes('switch') || rawCss.includes('track') || rawCss.includes('slider'))) {
    const structuralBridge = `
[class*="track-wrap"], [class*="track-wrap"] input[type="range"] { width: 100% !important; max-width: 100% !important; display: block !important; box-sizing: border-box !important; }
.switch-wrap, [class*="switch-wrap"] { cursor: pointer; display: inline-flex; align-items: center; }
.switch-wrap input[type="checkbox"], [class*="switch-wrap"] input[type="checkbox"] { cursor: pointer; }
`;
    finalMicroCss = (finalMicroCss + '\n' + structuralBridge).trim();
  }

  // Flatten all CSS custom properties (var(--...)) to resolved values
  if (!isNested) {
    const cssVars = extractCssVariables(rawCss);
    finalMicroCss = flattenCssVariables(finalMicroCss, cssVars);
    finalMicroCss = deduplicateAndConsolidateCss(finalMicroCss);
  }

  return finalMicroCss;
}

/**
 * Deduplicates identical CSS rule blocks and consolidates duplicate @media query blocks.
 * Enforces Lint C16 (zero duplicate rule blocks, consolidated media queries, size reduction).
 */
function deduplicateAndConsolidateCss(cssText = '') {
  if (!cssText || typeof cssText !== 'string') return '';
  const blocks = parseCssBlocks(cssText);
  const seenStandard = new Set();
  const seenKeyframes = new Set();
  const mediaMap = new Map(); // normHeader -> Map(normInnerKey -> formattedInnerBlock)
  const standardBlocks = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('@media')) {
      const openIdx = trimmed.indexOf('{');
      if (openIdx === -1) continue;
      const header = trimmed.slice(0, openIdx).trim();
      const body = trimmed.slice(openIdx + 1, trimmed.lastIndexOf('}')).trim();
      const innerBlocks = parseCssBlocks(body);

      // Normalize media query header (e.g. '@media (max-width: 1024px)')
      const normHeader = header.replace(/\s+/g, ' ');
      if (!mediaMap.has(normHeader)) {
        mediaMap.set(normHeader, new Map());
      }
      const innerMap = mediaMap.get(normHeader);

      for (const ib of innerBlocks) {
        const trimmedIb = ib.trim();
        if (!trimmedIb) continue;
        const openInner = trimmedIb.indexOf('{');
        if (openInner === -1) continue;
        const sel = trimmedIb.slice(0, openInner).trim();
        const decls = trimmedIb.slice(openInner + 1, trimmedIb.lastIndexOf('}')).trim();
        if (!decls) continue;

        const normSel = sel.split(',').map(s => s.trim()).filter(Boolean).sort().join(', ');
        const normDecls = decls.split(';').map(d => d.trim()).filter(Boolean).sort().join('; ');
        const normKey = `${normSel} { ${normDecls} }`;

        if (!innerMap.has(normKey)) {
          innerMap.set(normKey, trimmedIb);
        }
      }
    } else if (trimmed.startsWith('@keyframes') || trimmed.startsWith('@-webkit-keyframes')) {
      const norm = trimmed.replace(/\s+/g, ' ');
      if (!seenKeyframes.has(norm)) {
        seenKeyframes.add(norm);
        standardBlocks.push(trimmed);
      }
    } else {
      // Standard rule: selector { declarations }
      const openIdx = trimmed.indexOf('{');
      if (openIdx === -1) continue;
      const selector = trimmed.slice(0, openIdx).trim();
      const decls = trimmed.slice(openIdx + 1, trimmed.lastIndexOf('}')).trim();

      // Skip empty rule blocks
      if (!decls) continue;

      const normSelector = selector.split(',').map(s => s.trim()).filter(Boolean).sort().join(', ');
      const normDecls = decls.split(';').map(d => d.trim()).filter(Boolean).sort().join('; ');
      const normKey = `${normSelector} { ${normDecls} }`;

      if (!seenStandard.has(normKey)) {
        seenStandard.add(normKey);
        standardBlocks.push(trimmed);
      }
    }
  }

  // Deterministically order consolidated media queries: 1024px first, then 767px, then any others
  const consolidatedMedia = [];
  const sortedHeaders = Array.from(mediaMap.keys()).sort((a, b) => {
    const a1024 = a.includes('1024');
    const b1024 = b.includes('1024');
    const a767 = a.includes('767');
    const b767 = b.includes('767');
    if (a1024 && !b1024) return -1;
    if (!a1024 && b1024) return 1;
    if (a767 && !b767) return -1;
    if (!a767 && b767) return 1;
    return a.localeCompare(b);
  });

  for (const header of sortedHeaders) {
    const innerMap = mediaMap.get(header);
    if (innerMap && innerMap.size > 0) {
      const formattedInnerRules = Array.from(innerMap.values()).map(ruleStr => {
        return ruleStr.split('\n').map(line => {
          const l = line.trim();
          return l ? '  ' + l : '';
        }).join('\n');
      }).join('\n\n');

      consolidatedMedia.push(`${header} {\n${formattedInnerRules}\n}`);
    }
  }

  return [...standardBlocks, ...consolidatedMedia].join('\n\n');
}

module.exports = {
  parseCssBlocks,
  extractMicroCss,
  matchesMicroEmbedClass,
  deduplicateAndConsolidateCss,
  expandStateSelectorForElementor,
  buildElementClassificationMap
};

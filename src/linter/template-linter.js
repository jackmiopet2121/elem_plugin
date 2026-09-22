/**
 * Pre-Flight Template Linter & Auditor.
 * Audits the compiled Elementor JSON against the Black Box rules engine.
 */

const { isValidHtmlReason } = require('../smart/style-router');
const { computeEditabilityMetrics } = require('../smart/convergence-gate');
const { validateTemplate } = require('../smart/scalar-contract');
const { buildElementClassificationMap, parseCssBlocks } = require('../normalizers/css-classifier');

const PRO_WIDGET_TYPES = new Set([
  'nav-menu', 'slides', 'form', 'gallery', 'price-table', 'price-list',
  'animated-headline', 'flip-box', 'call-to-action', 'media-carousel',
  'testimonial-carousel', 'reviews', 'countdown', 'share-buttons',
  'author-box', 'post-comments', 'theme-elements', 'nested-tabs'
]);

function auditTemplate(templateJson) {
  const errors = [];
  const warnings = [];
  const seenIds = new Set();
  const stats = {
    totalElements: 0,
    containers: 0,
    widgets: 0,
    badges: 0,
    fixedIssues: 0,
    widgetTypes: {},
    interactiveInputs: 0,
    scripts: 0,
    proWidgets: 0
  };

  if (!templateJson || !Array.isArray(templateJson.content)) {
    return {
      valid: false,
      errors: ['Invalid template structure: content array is missing.'],
      warnings,
      stats
    };
  }

  function inspectNode(node, parent = null) {
    if (!node) return;
    stats.totalElements++;

    // 1. Check ID uniqueness
    if (!node.id) {
      errors.push(`Element missing ID: ${JSON.stringify(node).slice(0, 50)}`);
    } else if (seenIds.has(node.id)) {
      errors.push(`Duplicate ID detected: ${node.id}`);
    } else {
      seenIds.add(node.id);
    }

    // Schema Invariant Validation: Guarantee Elementor core compliance
    if (!node.elType) {
      errors.push(`Element ${node.id || 'unknown'} is missing required 'elType'. Must be 'container' or 'widget'.`);
    } else if (node.elType !== 'container' && node.elType !== 'widget') {
      errors.push(`Element ${node.id || 'unknown'} has invalid 'elType': "${node.elType}". Must be 'container' or 'widget'.`);
    }

    if (node.widgetType && node.elType !== 'widget') {
      errors.push(`Widget ${node.id || 'unknown'} (${node.widgetType}) must have elType: 'widget', but found "${node.elType}".`);
    }

    if (node.elType === 'widget') {
      if (!node.widgetType) {
        errors.push(`Widget ${node.id || 'unknown'} has elType: 'widget' but is missing 'widgetType'.`);
      }
      if (!Array.isArray(node.elements)) {
        errors.push(`Widget ${node.id || 'unknown'} (${node.widgetType}) is missing 'elements' array (must be []).`);
      }
    }

    if (node.elType === 'container' && !Array.isArray(node.elements)) {
      errors.push(`Container ${node.id || 'unknown'} is missing 'elements' array.`);
    }

    const s = node.settings || {};

    // 2. Container Checks
    if (node.elType === 'container') {
      stats.containers++;

      // Root Section Contract Checks
      const isRoot = (parent === null);
      if (isRoot) {
        if (s.content_width === 'boxed' && !s.boxed_width) {
          errors.push(`Root container ${node.id} is 'boxed' but lacks 'boxed_width'. Desktop will stretch to 1140px!`);
        }
        if (!s.padding_mobile) {
          errors.push(`Root container ${node.id} is missing 'padding_mobile'. Mobile will inherit desktop padding!`);
        }
      } else {
        // A1: content_width CONTRACT — EVERY inner container content_width:'full'
        if (s.content_width !== 'full') {
          errors.push(`CONTENT_WIDTH_VIOLATION: Inner container ${node.id} has content_width '${s.content_width || 'undefined'}'. Must be 'full' to prevent WordPress 1-column collapse.`);
        }
      }

      // Check triple gap
      if (!s.gap || !s.flex_gap || s.space_between_widgets === undefined) {
        warnings.push(`Container ${node.id} is missing triple gap declaration.`);
      }

      // Spec v3.2 — Gap scalar guard (prevents WordPress PHP fatal)
      for (const k of ['space_between_widgets', 'space_between_widgets_tablet', 'space_between_widgets_mobile']) {
        if (s[k] !== undefined && (typeof s[k] !== 'number' || !Number.isFinite(s[k]))) {
          errors.push(`Container ${node.id} has non-numeric ${k} (${typeof s[k]}: ${JSON.stringify(s[k])}). Will cause PHP 8 fatal in WordPress.`);
        }
      }
      for (const k of ['gap', 'flex_gap', 'gap_tablet', 'flex_gap_tablet', 'gap_mobile', 'flex_gap_mobile']) {
        if (s[k] && typeof s[k] === 'object') {
          for (const sub of ['size', 'column', 'row']) {
            if (s[k][sub] !== undefined && typeof s[k][sub] === 'object') {
              errors.push(`Container ${node.id} has nested object in ${k}.${sub}. Will cause PHP 8 fatal in WordPress.`);
            }
          }
        }
      }

      const classes = (s.css_classes || s._css_classes || '').toLowerCase();
      const isBadge = !classes.includes('grid') && !classes.includes('container') && !classes.includes('wrapper') && (classes.includes('badge') || classes.includes('pill') || classes.includes('tag'));
      if (isBadge) {
        stats.badges++;
        if (!s.width_mobile || s.width_mobile.size === '100%') {
          errors.push(`Badge container ${node.id} (.${classes}) lacks width_mobile: fit-content.`);
        }
        if (s._flex_size !== 'none') {
          errors.push(`Badge container ${node.id} (.${classes}) lacks _flex_size: 'none'. May stretch on flex parents!`);
        }
      }

      // Check segmented switchers horizontal alignment
      const isSwitcher = classes.includes('switcher') || classes.includes('toggle-card') || classes.includes('segmented');
      if (isSwitcher && (s.direction === 'column' || s.flex_direction === 'column')) {
        errors.push(`Violation of segmentedSwitcherFlexRowCalibration on container ${node.id}: Segmented switcher must be direction: 'row', not column.`);
      }
    }

    // 3. Widget Checks
    if (node.elType === 'widget') {
      stats.widgets++;
      const wt = node.widgetType || 'unknown';
      stats.widgetTypes[wt] = (stats.widgetTypes[wt] || 0) + 1;

      // Pro Widget Check
      if (PRO_WIDGET_TYPES.has(node.widgetType)) {
        stats.proWidgets++;
        errors.push(`Elementor Pro widget detected: '${node.widgetType}' on element ${node.id}. Must be 100% Free.`);
      }

      // Strict Underscore Check
      if (s.margin && !s._margin) {
        errors.push(`Widget ${node.id} (${node.widgetType}) has un-underscored 'margin'. Must be '_margin'.`);
      }
      if (s.padding && !s._padding) {
        errors.push(`Widget ${node.id} (${node.widgetType}) has un-underscored 'padding'. Must be '_padding'.`);
      }

      // Micro-Embed Decomposition & Editability Allowlist Check
      if (node.widgetType === 'html') {
        const reason = s._html_reason;
        if (!isValidHtmlReason(reason)) {
          errors.push(`HTML widget ${node.id} lacks a valid machine-readable justification in settings._html_reason. Got: "${reason}".`);
        }
        const htmlCode = (s.html || '').trim();
        const isStylesheet = htmlCode.startsWith('<style') || htmlCode.includes('</style>');
        const isScript = htmlCode.startsWith('<script') || htmlCode.includes('</script>');
        if (isScript) stats.scripts++;
        if (/<input|<select|<button\b|<textarea/i.test(htmlCode)) stats.interactiveInputs++;

        if (!isStylesheet && !isScript) {
          const hasInput = /<input|<select|<textarea/i.test(htmlCode);
          const hasStructuralCard = /class=["'][^"']*(?:card|grid|column)[^"']*["']/i.test(htmlCode) && !hasInput;
          const hasFullButton = /<button\b[^>]*class=["'][^"']*(?:cta|submit)[^"']*["']/i.test(htmlCode) &&
                                htmlCode.length > 250;
          if (hasStructuralCard || hasFullButton) {
            warnings.push(`Advisory: HTML widget ${node.id} contains raw structural card or button markup.`);
          }

          // Check for standalone SVG dump
          const hasStandaloneSvg = /^\s*(?:<(?:div|span)\b[^>]*>)?\s*<svg\b[\s\S]*?<\/svg>\s*(?:<\/(?:div|span)>)?\s*$/i.test(htmlCode) ||
            (/<svg\b/i.test(htmlCode) && !/<input\b|<button\b|<form\b/i.test(htmlCode) && htmlCode.replace(/<[^>]+>/g, '').trim().length === 0);
          if (hasStandaloneSvg) {
            warnings.push(`Advisory: Standalone SVG vector on HTML widget ${node.id}. Recommended native 'icon' widget.`);
          }

          // Check for divider dump
          const hasDivider = /^\s*<hr\b[^>]*\/?>\s*$/i.test(htmlCode) ||
            /^\s*<(?:div|span)\b[^>]*class=["'][^"']*(?:divider|separator)[^"']*["'][^>]*>\s*<\/(?:div|span)>\s*$/i.test(htmlCode);
          if (hasDivider) {
            warnings.push(`Advisory: Standalone divider on HTML widget ${node.id}. Recommended native 'divider' widget.`);
          }
        }
      }
    }

    // Recurse
    if (Array.isArray(node.elements)) {
      for (const child of node.elements) {
        inspectNode(child, node);
      }
    }
  }

  for (const root of templateJson.content) {
    inspectNode(root);
  }

  // Scalar Contract & Link Schema Auditing (Spec v3.4 + Addendum v3.4.1)
  const scalarViolations = validateTemplate(templateJson);
  for (const v of scalarViolations) {
    if (v.includes('settings.link.url must be string')) {
      errors.push(`LINK_SCHEMA_VIOLATION on ${v}`);
    } else {
      errors.push(`SCALAR_CONTRACT_VIOLATION on ${v}`);
    }
  }

  // Lint C18: State-Rule Semantic Target Mapping Audit (Task K8, Note N3)
  const stateTargetViolations = validateStateRuleSemanticTargets(templateJson);
  for (const v of stateTargetViolations) {
    errors.push(v);
  }

  const editMetrics = computeEditabilityMetrics(templateJson.content);
  stats.editability = editMetrics;
  if (editMetrics.nativeWidgetPercentage < 90) {
    warnings.push(`EDITABILITY PERCENTAGE BELOW TARGET: Template has ${editMetrics.nativeWidgetPercentage}% native widgets (target: >= 90%).`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats
  };
}

/**
 * Lint C18: State-Rule Semantic Target Mapping Audit (Task K8, Note N3)
 * Asserts:
 * ZERO wrapper-level pseudo selectors whose original target is widget-level.
 * Flags both forms on widget-level targets:
 * - Form 1 (Bare): .CLASS:hover, .CLASS:active, .CLASS:focus
 * - Form 2 (Descendant): .CLASS:hover <descendant>, .CLASS:active <descendant>
 * Allow-list:
 * - Container-level classes (.card:hover, .container:hover, .feature-card:hover, .timeline-step:hover)
 * - Correct inner semantic targets (.CLASS .elementor-button:hover, .elementor-widget-button.CLASS .elementor-button:hover)
 */
function validateStateRuleSemanticTargets(templateJson) {
  const violations = [];
  if (!templateJson || !Array.isArray(templateJson.content)) return violations;

  const { widgetClassMap, containerClassSet } = buildElementClassificationMap(templateJson.content);
  if (widgetClassMap.size === 0) return violations;

  // Find stylesheet widget(s)
  let stylesheetCss = '';
  function findStylesheets(nodes) {
    for (const n of nodes) {
      if (n.widgetType === 'html' && n.settings?.html && n.settings.html.includes('<style')) {
        const match = n.settings.html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
        if (match && match[1]) {
          stylesheetCss += '\n' + match[1];
        }
      }
      if (n.elements) findStylesheets(n.elements);
    }
  }
  findStylesheets(templateJson.content);

  if (!stylesheetCss.trim()) return violations;

  const blocks = parseCssBlocks(stylesheetCss);
  for (const block of blocks) {
    if (block.startsWith('@keyframes') || block.startsWith('@-webkit-keyframes')) continue;

    if (block.startsWith('@media')) {
      const openIdx = block.indexOf('{');
      const innerBody = block.slice(openIdx + 1, block.lastIndexOf('}')).trim();
      const innerBlocks = parseCssBlocks(innerBody);
      for (const ib of innerBlocks) {
        const ibOpen = ib.indexOf('{');
        if (ibOpen !== -1) {
          checkSelectors(ib.slice(0, ibOpen).trim());
        }
      }
      continue;
    }

    const openBrace = block.indexOf('{');
    if (openBrace === -1) continue;
    checkSelectors(block.slice(0, openBrace).trim());
  }

  function checkSelectors(selGroup) {
    const selectors = selGroup.split(',').map(s => s.trim()).filter(Boolean);
    for (const sel of selectors) {
      if (!/:(?:hover|active|focus|focus-within|focus-visible)\b/i.test(sel)) continue;

      for (const [wClass, wType] of widgetClassMap.entries()) {
        // Container allow-list (e.g. if class is also used on containers or composite markup)
        if (containerClassSet.has(wClass)) continue;

        // Form 1: Bare wrapper-level pseudo selector (e.g. .btn-white:hover, .btn:active)
        const bareRegex = new RegExp(`(?:^|[\\s>+~])\\.${wClass}:(?:hover|active|focus|focus-within|focus-visible)\\s*$`, 'i');
        // Form 2: Wrapper-triggered descendant pseudo selector (e.g. .btn-white:hover .elementor-button, .btn:hover span)
        const descendantRegex = new RegExp(`(?:^|[\\s>+~])\\.${wClass}:(?:hover|active|focus|focus-within|focus-visible)[\\s>+~]`, 'i');

        if (bareRegex.test(sel)) {
          violations.push(`[LINT C18 VIOLATION] Bare wrapper-level pseudo selector detected on widget-level class '${wClass}' (${wType}): "${sel}". State selectors must target inner semantic element (e.g. .${wClass} .elementor-button:hover).`);
        } else if (descendantRegex.test(sel)) {
          violations.push(`[LINT C18 VIOLATION] Wrapper-triggered descendant pseudo selector detected on widget-level class '${wClass}' (${wType}): "${sel}". State selectors must target inner semantic element (e.g. .${wClass} .elementor-button:hover).`);
        }
      }
    }
  }

  return violations;
}

module.exports = {
  auditTemplate,
  validateStateRuleSemanticTargets
};

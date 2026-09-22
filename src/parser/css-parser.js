/**
 * Lightweight pure Node.js CSS Parser for stylesheets and inline styles.
 * Extracts standard rules, :hover pseudo-classes, and mobile media queries.
 */

function parseInlineStyle(styleString) {
  const styles = {};
  if (!styleString || typeof styleString !== 'string') return styles;
  const declarations = styleString.split(';');
  for (const decl of declarations) {
    const trimmed = decl.trim();
    if (!trimmed) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;
    const prop = trimmed.slice(0, colonIdx).trim().toLowerCase();
    const val = trimmed.slice(colonIdx + 1).trim();
    if (prop && val) {
      styles[prop] = val;
    }
  }
  return styles;
}

function parseCssRules(cssText) {
  const rules = [];
  const hoverRules = [];
  const mediaQueries = [];

  if (!cssText || typeof cssText !== 'string') {
    return { rules, hoverRules, mediaQueries };
  }

  // Strip comments
  const cleanCss = cssText.replace(/\/\*[\s\S]*?\*\//g, '');

  // Extract media queries
  const mediaRegex = /@media[^{]+\{([\s\S]+?\}\s*)\}/gi;
  let mediaMatch;
  while ((mediaMatch = mediaRegex.exec(cleanCss)) !== null) {
    const fullMedia = mediaMatch[0];
    const headerMatch = fullMedia.match(/@media\s*([^{]+)\{/i);
    const query = headerMatch ? headerMatch[1].trim() : '';
    const body = mediaMatch[1];
    mediaQueries.push({ query, body });
  }

  // Remove media blocks to process standard rules
  const topLevelCss = cleanCss.replace(mediaRegex, '');

  // Extract top-level rules
  const ruleRegex = /([^{]+)\{([^}]+)\}/g;
  let match;
  while ((match = ruleRegex.exec(topLevelCss)) !== null) {
    const selectorGroup = match[1].trim();
    const declarationsText = match[2].trim();
    const declarations = parseInlineStyle(declarationsText);

    const selectors = selectorGroup.split(',').map(s => s.trim());
    for (const sel of selectors) {
      if (sel.includes(':hover')) {
        hoverRules.push({
          selector: sel,
          baseSelector: sel.replace(/:hover/g, '').trim(),
          declarations
        });
      } else {
        rules.push({ selector: sel, declarations });
      }
    }
  }

  return { rules, hoverRules, mediaQueries };
}

module.exports = {
  parseInlineStyle,
  parseCssRules
};

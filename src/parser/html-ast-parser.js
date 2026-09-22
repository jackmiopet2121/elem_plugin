/**
 * Clean-Slate Pure Node.js HTML DOM & Resource Parser.
 * Generates structured DOM AST nodes with atomic SVG preservation
 * and extracts stylesheets and client-side JavaScript.
 */

class DOMNode {
  constructor(tagName = 'div', attributes = {}, parent = null) {
    this.tagName = tagName.toLowerCase();
    this.attributes = attributes || {};
    this.id = this.attributes.id || '';
    this.className = this.attributes.class || '';
    this.classList = this.className.split(/\s+/).filter(Boolean);
    this.style = parseInlineStyle(this.attributes.style || '');
    this.children = [];
    this.parent = parent;
    this.textContent = '';
    this.rawHtml = '';
  }

  hasClass(cls) {
    return this.classList.includes(cls);
  }

  getAttribute(attr) {
    return this.attributes[attr] !== undefined ? this.attributes[attr] : null;
  }

  isTextOnly() {
    if (this.children.length === 0) return this.textContent.trim().length > 0;
    return this.children.length > 0 && this.children.every(c => c.tagName === '#text');
  }
}

function parseInlineStyle(styleString = '') {
  const styles = {};
  if (!styleString || typeof styleString !== 'string') return styles;
  const decls = styleString.split(';').map(s => s.trim()).filter(Boolean);
  for (const decl of decls) {
    const colonIdx = decl.indexOf(':');
    if (colonIdx === -1) continue;
    const prop = decl.slice(0, colonIdx).trim().toLowerCase();
    const val = decl.slice(colonIdx + 1).trim();
    styles[prop] = val;
  }
  return styles;
}

function parseAttributes(attrStr = '') {
  const attrs = {};
  if (!attrStr) return attrs;
  const regex = /([a-zA-Z0-9_\-:@.]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let match;
  while ((match = regex.exec(attrStr)) !== null) {
    const name = match[1];
    const value = match[2] !== undefined ? match[2] : (match[3] !== undefined ? match[3] : (match[4] !== undefined ? match[4] : ''));
    attrs[name] = value;
  }
  return attrs;
}

function parseHtmlToAst(htmlString) {
  if (!htmlString || typeof htmlString !== 'string') {
    return new DOMNode('div');
  }

  let bodyContent = htmlString;
  const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(htmlString);
  if (bodyMatch) {
    bodyContent = bodyMatch[1];
  }

  const root = new DOMNode('root');
  let current = root;
  const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

  // Handle comments, scripts, styles, raw SVGs, tags, and text
  const tokenRegex = /<!--[\s\S]*?-->|(<script[^>]*>[\s\S]*?<\/script>)|(<style[^>]*>[\s\S]*?<\/style>)|(<svg[^>]*>[\s\S]*?<\/svg>)|(<\/?[a-zA-Z0-9\-]+(?:\s+[^>]*?)?\/?>)|([^<]+)/gi;

  let match;
  while ((match = tokenRegex.exec(bodyContent)) !== null) {
    const fullMatch = match[0];

    // Comments
    if (fullMatch.startsWith('<!--')) continue;

    // SVG Block: Preserve 100% atomic raw markup and dimensions
    if (match[3]) {
      const svgFull = match[3];
      const openTagMatch = /^<svg([^>]*)>/i.exec(svgFull);
      const attrs = openTagMatch ? parseAttributes(openTagMatch[1]) : {};
      const svgNode = new DOMNode('svg', attrs, current);
      svgNode.rawHtml = svgFull;
      current.children.push(svgNode);
      continue;
    }

    // Scripts and Styles (extracted separately)
    if (match[1] || match[2]) continue;

    // Regular Tag
    if (match[4]) {
      const tagStr = match[4];
      if (tagStr.startsWith('</')) {
        if (current.parent) {
          current = current.parent;
        }
      } else {
        const tagMatch = /^<([a-zA-Z0-9\-]+)([\s\S]*?)(\/?)>$/.exec(tagStr);
        if (tagMatch) {
          const tagName = tagMatch[1].toLowerCase();
          const attrs = parseAttributes(tagMatch[2]);
          const isSelfClosing = tagMatch[3] === '/' || voidTags.has(tagName);

          const newNode = new DOMNode(tagName, attrs, current);
          current.children.push(newNode);

          if (!isSelfClosing) {
            current = newNode;
          }
        }
      }
      continue;
    }

    // Text Content
    if (match[5]) {
      const text = match[5].trim();
      if (text) {
        current.textContent = current.textContent ? current.textContent + ' ' + text : text;
        const textChild = new DOMNode('#text', {}, current);
        textChild.textContent = text;
        current.children.push(textChild);
      }
    }
  }

  const realChildren = root.children.filter(c => c.tagName !== '#text' || c.textContent.trim().length > 0);
  return realChildren.length === 1 ? realChildren[0] : root;
}

function extractStyles(htmlString = '') {
  const styles = [];
  const regex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let match;
  while ((match = regex.exec(htmlString)) !== null) {
    const css = match[1].trim();
    if (css) styles.push(css);
  }
  return styles.join('\n\n');
}

function extractScripts(htmlString = '') {
  const scripts = [];
  const regex = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = regex.exec(htmlString)) !== null) {
    const code = match[1].trim();
    if (code) scripts.push(code);
  }
  return scripts;
}

function extractDocumentTitle(htmlString = '') {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(htmlString);
  return match ? match[1].trim() : 'Elementor Template';
}

module.exports = {
  DOMNode,
  parseAttributes,
  parseInlineStyle,
  parseHtmlToAst,
  extractStyles,
  extractScripts,
  extractDocumentTitle
};

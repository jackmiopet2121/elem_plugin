/**
 * Lightweight pure Node.js HTML DOM Parser and AST Builder.
 * Transforms raw HTML strings into structured Node trees with styles and classes.
 */
const { parseInlineStyle } = require('./css-parser');

let domNodeSequence = 0;

class DOMNode {
  constructor(tagName = 'div', attributes = {}, parent = null) {
    this.domNodeId = `node-${++domNodeSequence}`;
    this.tagName = tagName.toLowerCase();
    this.attributes = attributes;
    this.id = attributes.id || '';
    this.className = attributes.class || '';
    this.classList = this.className.split(/\s+/).filter(Boolean);
    this.style = parseInlineStyle(attributes.style || '');
    this.children = [];
    this.parent = parent;
    this.textContent = '';
    this.rawHtml = '';
  }

  hasClass(cls) {
    return this.classList.includes(cls);
  }

  getAttribute(attr) {
    return this.attributes[attr] || null;
  }

  isTextOnly() {
    if (this.children.length === 0) return this.textContent.trim().length > 0;
    return this.children.length > 0 && this.children.every(c => c.tagName === '#text');
  }
}

function parseAttributes(attrStr) {
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
  domNodeSequence = 0;
  if (!htmlString || typeof htmlString !== 'string') {
    return new DOMNode('div');
  }

  // Strip doctype and head/html if full document
  let bodyContent = htmlString;
  const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(htmlString);
  if (bodyMatch) {
    bodyContent = bodyMatch[1];
  }

  const root = new DOMNode('root');
  let current = root;
  const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

  // Handle special tags like <svg>, <style>, and <script> by matching their entire content
  const tokenRegex = /<!--[\s\S]*?-->|(<script[^>]*>[\s\S]*?<\/script>)|(<style[^>]*>[\s\S]*?<\/style>)|(<svg[^>]*>[\s\S]*?<\/svg>)|(<\/?[a-zA-Z0-9\-]+(?:\s+[^>]*?)?\/?>)|([^<]+)/gi;

  let match;
  while ((match = tokenRegex.exec(bodyContent)) !== null) {
    const fullMatch = match[0];

    // Comment
    if (fullMatch.startsWith('<!--')) continue;

    // SVG Block
    if (match[3]) {
      const svgFull = match[3];
      const openTagMatch = /^<svg([^>]*)>/i.exec(svgFull);
      const attrs = openTagMatch ? parseAttributes(openTagMatch[1]) : {};
      const svgNode = new DOMNode('svg', attrs, current);
      svgNode.rawHtml = svgFull;
      current.children.push(svgNode);
      continue;
    }

    // Script or Style (handled by specific extractors)
    if (match[1] || match[2]) {
      continue;
    }

    // Regular Tag
    if (match[4]) {
      const tagStr = match[4];
      if (tagStr.startsWith('</')) {
        // Closing tag
        if (current.parent) {
          current = current.parent;
        }
      } else {
        // Opening or self-closing tag
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

    // Text node
    if (match[5]) {
      const raw = match[5];
      const normalized = raw.replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ');
      const hasLeadingSpace = /^\s/.test(raw);
      const hasTrailingSpace = /\s$/.test(raw);
      const trimmed = normalized.trim();

      if (trimmed.length > 0) {
        let finalContent = trimmed;
        if (hasLeadingSpace && current.children.length > 0) {
          finalContent = ' ' + finalContent;
        }
        if (hasTrailingSpace) {
          finalContent = finalContent + ' ';
        }

        current.textContent = current.textContent ? (current.textContent.endsWith(' ') || finalContent.startsWith(' ') ? current.textContent + finalContent.trim() : current.textContent + ' ' + finalContent.trim()) : finalContent.trim();
        const textChild = new DOMNode('#text', {}, current);
        textChild.textContent = finalContent;
        current.children.push(textChild);
      }
    }
  }

  // Filter root to return main content
  const realChildren = root.children.filter(c => c.tagName !== '#text' || c.textContent.trim().length > 0);
  return realChildren.length === 1 ? realChildren[0] : root;
}

module.exports = {
  DOMNode,
  parseAttributes,
  parseHtmlToAst
};

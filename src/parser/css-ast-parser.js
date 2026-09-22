/**
 * Clean-Slate CSS Parser & Design Token Engine.
 * Parses CSS stylesheets, resolves CSS variables, and maps CSS rules cleanly.
 */

function parseCssBlocks(cssText = '') {
  const clean = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
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

function parseDeclarations(declarationsText = '') {
  const decls = {};
  const tokens = [];
  let current = '';
  let inParen = 0;

  for (let i = 0; i < declarationsText.length; i++) {
    const ch = declarationsText[i];
    if (ch === '(') inParen++;
    else if (ch === ')') inParen--;

    if (ch === ';' && inParen === 0) {
      if (current.trim()) tokens.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) tokens.push(current.trim());

  for (const token of tokens) {
    const colonIdx = token.indexOf(':');
    if (colonIdx === -1) continue;
    const prop = token.slice(0, colonIdx).trim().toLowerCase();
    const val = token.slice(colonIdx + 1).trim();
    decls[prop] = val;
  }

  return decls;
}

function extractCssVariables(cssText = '') {
  const variables = {};
  const blocks = parseCssBlocks(cssText);

  for (const block of blocks) {
    const openBraceIdx = block.indexOf('{');
    if (openBraceIdx === -1) continue;
    const selector = block.slice(0, openBraceIdx).trim();
    const body = block.slice(openBraceIdx + 1, block.lastIndexOf('}')).trim();

    if (selector === ':root' || selector.startsWith(':root') || selector === 'html' || selector === 'body') {
      const decls = parseDeclarations(body);
      for (const [key, val] of Object.entries(decls)) {
        if (key.startsWith('--')) {
          variables[key] = val;
        }
      }
    }
  }

  return variables;
}

function resolveCssVariables(value = '', variables = {}) {
  if (!value || typeof value !== 'string') return '';
  let resolved = value;
  let iterations = 0;

  while (resolved.includes('var(') && iterations < 8) {
    iterations++;
    const next = resolved.replace(/var\((--[a-zA-Z0-9\-_]+)(?:,\s*([^)]+))?\)/g, (_, varName, fallback) => {
      if (variables[varName] !== undefined) return variables[varName];
      return fallback ? fallback.trim() : '';
    });
    if (next === resolved) break;
    resolved = next;
  }

  return resolved.trim();
}

function parseBoxShorthand(valStr = '') {
  if (!valStr || typeof valStr !== 'string') return null;
  const parts = valStr.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;

  const toPx = (v) => {
    const m = v.match(/(-?\d+(?:\.\d+)?)\s*(?:px)?/);
    return m ? String(Math.round(parseFloat(m[1]))) : '0';
  };

  let top = '0', right = '0', bottom = '0', left = '0';
  if (parts.length === 1) {
    top = right = bottom = left = toPx(parts[0]);
  } else if (parts.length === 2) {
    top = bottom = toPx(parts[0]);
    right = left = toPx(parts[1]);
  } else if (parts.length === 3) {
    top = toPx(parts[0]);
    right = left = toPx(parts[1]);
    bottom = toPx(parts[2]);
  } else if (parts.length >= 4) {
    top = toPx(parts[0]);
    right = toPx(parts[1]);
    bottom = toPx(parts[2]);
    left = toPx(parts[3]);
  }

  return {
    unit: 'px',
    top,
    right,
    bottom,
    left,
    isLinked: top === right && right === bottom && bottom === left
  };
}

module.exports = {
  parseCssBlocks,
  parseDeclarations,
  extractCssVariables,
  resolveCssVariables,
  parseBoxShorthand
};

/**
 * Vanilla JS Extractor.
 * Extracts client-side scripts, tab switcher behaviors, and interactive handlers.
 */

function extractScripts(htmlString) {
  const scripts = [];
  if (!htmlString || typeof htmlString !== 'string') return scripts;

  const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptRegex.exec(htmlString)) !== null) {
    const content = match[1].trim();
    if (content) {
      scripts.push(content);
    }
  }
  return scripts;
}

function detectInteractivePatterns(scriptContent) {
  const patterns = {
    hasTabSwitcher: false,
    activeClasses: [],
    targetSelectors: []
  };

  if (!scriptContent) return patterns;

  // Check for tab switching / class toggle patterns
  if (scriptContent.includes('classList.add') || scriptContent.includes('classList.toggle') || scriptContent.includes('addEventListener(\'click\'') || scriptContent.includes('addEventListener("click"')) {
    patterns.hasTabSwitcher = true;
  }

  // Extract classes being added or removed
  const classRegex = /classList\.(?:add|remove|toggle)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m;
  while ((m = classRegex.exec(scriptContent)) !== null) {
    if (!patterns.activeClasses.includes(m[1])) {
      patterns.activeClasses.push(m[1]);
    }
  }

  return patterns;
}

module.exports = {
  extractScripts,
  detectInteractivePatterns
};

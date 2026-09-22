/**
 * Central Black Box rules engine loader and query interface.
 */
const fs = require('fs');
const path = require('path');

let cachedRules = null;

function loadRules(customPath) {
  if (cachedRules && !customPath) return cachedRules;
  const rulesPath = customPath || path.resolve(__dirname, '../../compiler-rules.json');
  if (!fs.existsSync(rulesPath)) {
    throw new Error('compiler-rules.json not found at ' + rulesPath);
  }
  const raw = fs.readFileSync(rulesPath, 'utf8');
  cachedRules = JSON.parse(raw);
  return cachedRules;
}

function getRule(dotPath, defaultValue = null) {
  const rules = loadRules();
  const parts = dotPath.split('.');
  let curr = rules;
  for (const part of parts) {
    if (curr && Object.prototype.hasOwnProperty.call(curr, part)) {
      curr = curr[part];
    } else {
      return defaultValue;
    }
  }
  return curr;
}

function getOpticalNudge(fontFamily) {
  const rule = getRule('typography.opticalNudgeStrategy');
  if (rule && rule.fontFamily && fontFamily && fontFamily.toLowerCase().includes(rule.fontFamily.toLowerCase())) {
    return { top: rule.marginTop || -2, bottom: rule.marginBottom || 2 };
  }
  return null;
}

function getFa5Equivalent(fa6Class) {
  if (!fa6Class || typeof fa6Class !== 'string') return 'fas fa-check';
  const trimmed = fa6Class.trim();

  // If it's a Unicode/emoji glyph rather than a FontAwesome class
  if (!/^(?:fa[srb]?\s|fa-)/i.test(trimmed)) {
    const { resolveGlyphToFa5 } = require('../smart/glyph-map');
    const glyphMatch = resolveGlyphToFa5(trimmed);
    if (glyphMatch) return glyphMatch;
  }

  const fa5Map = getRule('fontAwesomeCompatibility.fa5Equivalents') || {};
  if (fa5Map[trimmed]) return fa5Map[trimmed];

  const tokens = trimmed.split(/\s+/);
  for (const token of tokens) {
    if (fa5Map[token]) {
      return fa5Map[token];
    }
  }

  let normalized = trimmed.replace(/\bfa-solid\b/g, 'fas');
  for (const [k, v] of Object.entries(fa5Map)) {
    if (normalized.includes(k)) {
      return v;
    }
  }

  if (normalized.startsWith('fa ')) {
    normalized = 'fas ' + normalized.slice(3);
  } else if (!normalized.startsWith('fas ') && !normalized.startsWith('fab ') && !normalized.startsWith('far ')) {
    normalized = 'fas ' + normalized;
  }
  return normalized;
}

module.exports = {
  loadRules,
  getRule,
  getOpticalNudge,
  getFa5Equivalent
};

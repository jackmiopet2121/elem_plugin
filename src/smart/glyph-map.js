/**
 * Unicode/Emoji to FontAwesome 5 (FA5) Glyph Translation Map.
 * Codename: "Single-Pass + Verify" (Block 7.6 - Task M9)
 * 
 * Provides deterministic translation from Unicode symbols, emoji,
 * and decorative glyphs into native Elementor FontAwesome 5 icons.
 * Enforces ZERO generic 'fas fa-check' fallback for known glyphs.
 */

const GLYPH_TO_FA5 = Object.freeze({
  // Stars & Ratings
  '★': 'fas fa-star',
  '☆': 'far fa-star',
  '⭐': 'fas fa-star',
  '🌟': 'fas fa-star',
  '✪': 'fas fa-star',
  '✫': 'fas fa-star',
  '✬': 'fas fa-star',
  '✭': 'fas fa-star',
  '✮': 'fas fa-star',
  '✯': 'fas fa-star',

  // Lightning & Energy
  '⚡': 'fas fa-bolt',
  '⚡️': 'fas fa-bolt',
  '🗲': 'fas fa-bolt',

  // Gears & Settings
  '⚙': 'fas fa-cog',
  '⚙️': 'fas fa-cog',
  '🔧': 'fas fa-wrench',
  '🛠': 'fas fa-tools',
  '🛠️': 'fas fa-tools',

  // Diamonds & Gems
  '◈': 'fas fa-gem',
  '◆': 'fas fa-gem',
  '◇': 'far fa-gem',
  '💎': 'fas fa-gem',
  '♦': 'fas fa-gem',
  '◊': 'far fa-gem',

  // Triangles, Carets & Arrows
  '▲': 'fas fa-caret-up',
  '▴': 'fas fa-caret-up',
  '🔼': 'fas fa-caret-up',
  '▼': 'fas fa-caret-down',
  '▾': 'fas fa-caret-down',
  '🔽': 'fas fa-caret-down',
  '▶': 'fas fa-play',
  '▸': 'fas fa-caret-right',
  '►': 'fas fa-play',
  '◀': 'fas fa-caret-left',
  '◂': 'fas fa-caret-left',
  '◄': 'fas fa-caret-left',
  '→': 'fas fa-arrow-right',
  '➔': 'fas fa-arrow-right',
  '➜': 'fas fa-arrow-right',
  '➡': 'fas fa-arrow-right',
  '←': 'fas fa-arrow-left',
  '⬅': 'fas fa-arrow-left',
  '↑': 'fas fa-arrow-up',
  '⬆': 'fas fa-arrow-up',
  '↓': 'fas fa-arrow-down',
  '⬇': 'fas fa-arrow-down',
  '↔': 'fas fa-arrows-alt-h',
  '↕': 'fas fa-arrows-alt-v',
  '»': 'fas fa-angle-double-right',
  '«': 'fas fa-angle-double-left',
  '›': 'fas fa-chevron-right',
  '‹': 'fas fa-chevron-left',

  // Circles, Dots & Bullets
  '●': 'fas fa-circle',
  '•': 'fas fa-circle',
  '⚫': 'fas fa-circle',
  '⚪': 'far fa-circle',
  '⦿': 'fas fa-dot-circle',
  '🔘': 'fas fa-dot-circle',
  '○': 'far fa-circle',
  '◎': 'fas fa-dot-circle',

  // Sparkles & Magic
  '✦': 'fas fa-magic',
  '✧': 'far fa-star',
  '✨': 'fas fa-magic',

  // Checks & Validations
  '✔': 'fas fa-check',
  '✓': 'fas fa-check',
  '☑': 'fas fa-check-square',
  '✅': 'fas fa-check-circle',

  // Crosses & Dismissals
  '✖': 'fas fa-times',
  '✗': 'fas fa-times',
  '✕': 'fas fa-times',
  '❌': 'fas fa-times-circle',
  '⨯': 'fas fa-times',

  // Plus & Minus
  '➕': 'fas fa-plus',
  '+': 'fas fa-plus',
  '➖': 'fas fa-minus',
  '−': 'fas fa-minus',
  '-': 'fas fa-minus',

  // Shields & Security
  '🛡': 'fas fa-shield-alt',
  '🛡️': 'fas fa-shield-alt',
  '🔒': 'fas fa-lock',
  '🔓': 'fas fa-unlock',
  '🔑': 'fas fa-key',

  // Time & Clocks
  '🕒': 'fas fa-clock',
  '⏰': 'fas fa-clock',
  '⏱': 'fas fa-stopwatch',
  '⏳': 'fas fa-hourglass-half',

  // Communication & Phone
  '📞': 'fas fa-phone',
  '📱': 'fas fa-mobile-alt',
  '🎧': 'fas fa-headset',
  '✉': 'fas fa-envelope',
  '✉️': 'fas fa-envelope',
  '📧': 'fas fa-envelope',
  '📩': 'fas fa-envelope-open',
  '💬': 'fas fa-comment',
  '🗨': 'fas fa-comment-alt',
  '🔔': 'fas fa-bell',

  // Search & Help
  '🔍': 'fas fa-search',
  '🔎': 'fas fa-search-plus',
  '❓': 'fas fa-question-circle',
  '❔': 'fas fa-question-circle',
  'ℹ': 'fas fa-info-circle',
  'ℹ️': 'fas fa-info-circle',
  '⚠': 'fas fa-exclamation-triangle',
  '⚠️': 'fas fa-exclamation-triangle',
  '❗': 'fas fa-exclamation-circle',

  // Misc UI Symbols
  '🔥': 'fas fa-fire',
  '🚀': 'fas fa-rocket',
  '💡': 'fas fa-lightbulb',
  '🌐': 'fas fa-globe',
  '👁': 'fas fa-eye',
  '👁️': 'fas fa-eye',
  '❤️': 'fas fa-heart',
  '❤': 'fas fa-heart',
  '👍': 'fas fa-thumbs-up',
  '👎': 'fas fa-thumbs-down',
  '🏷': 'fas fa-tag',
  '🏷️': 'fas fa-tag',
  '📁': 'fas fa-folder',
  '📂': 'fas fa-folder-open',
  '📄': 'fas fa-file-alt',
  '📝': 'fas fa-edit',
  '🗑': 'fas fa-trash-alt',
  '🗑️': 'fas fa-trash-alt',
  '🔗': 'fas fa-link',
  '📍': 'fas fa-map-marker-alt',
  '📌': 'fas fa-thumbtack',
  '🛒': 'fas fa-shopping-cart',
  '👤': 'fas fa-user',
  '👥': 'fas fa-users'
});

// Sorted keys descending by length to ensure multi-char emojis match first
const SORTED_GLYPH_KEYS = Object.keys(GLYPH_TO_FA5).sort((a, b) => b.length - a.length);
// Non-ASCII glyphs eligible for substring extraction (prevents ASCII hyphen in classes from triggering minus icon)
const SUBSTRING_GLYPH_KEYS = SORTED_GLYPH_KEYS.filter(k => k !== '-' && k !== '+');

/**
 * Decodes numeric and hex HTML/Unicode entities.
 */
function decodeGlyphEntities(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      try { return String.fromCodePoint(parseInt(hex, 16)); } catch (_) { return _; }
    })
    .replace(/&#([0-9]+);/g, (_, dec) => {
      try { return String.fromCodePoint(parseInt(dec, 10)); } catch (_) { return _; }
    })
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => {
      try { return String.fromCodePoint(parseInt(hex, 16)); } catch (_) { return _; }
    })
    .replace(/\\([0-9a-fA-F]{4,6})/g, (_, hex) => {
      try { return String.fromCodePoint(parseInt(hex, 16)); } catch (_) { return _; }
    });
}

/**
 * Extracts a known glyph and its FA5 translation if present in text.
 * Returns { glyph: string, faIcon: string } or null.
 */
function extractKnownGlyph(text) {
  if (!text || typeof text !== 'string') return null;
  const decoded = decodeGlyphEntities(text.trim());
  if (!decoded) return null;

  // Direct exact match (handles '+', '-', and single glyphs exactly)
  if (GLYPH_TO_FA5[decoded]) {
    return { glyph: decoded, faIcon: GLYPH_TO_FA5[decoded] };
  }

  // Substring match with longest match priority for non-ASCII symbols
  for (const glyph of SUBSTRING_GLYPH_KEYS) {
    if (decoded.includes(glyph)) {
      return { glyph, faIcon: GLYPH_TO_FA5[glyph] };
    }
  }

  return null;
}

/**
 * Resolves any Unicode/emoji glyph to its FontAwesome 5 equivalent.
 * Returns null if no known glyph is found.
 */
function resolveGlyphToFa5(text) {
  const match = extractKnownGlyph(text);
  return match ? match.faIcon : null;
}

/**
 * Checks whether text contains a known glyph.
 */
function hasKnownGlyph(text) {
  return extractKnownGlyph(text) !== null;
}

module.exports = {
  GLYPH_TO_FA5,
  SORTED_GLYPH_KEYS,
  decodeGlyphEntities,
  extractKnownGlyph,
  resolveGlyphToFa5,
  hasKnownGlyph
};

/**
 * Universal Dynamic Font Detector.
 * Agnostically inspects HTML and CSS to determine hierarchical typography:
 * - Heading font (from --font-heading, --font-display, or h1..h6 declarations)
 * - Body font (from --font-body, --font-main, --font-family, or body declarations)
 * - Multi-font extraction from Google Fonts CDN links
 */

const KNOWN_FONTS = [
  'Inter', 'Poppins', 'Plus Jakarta Sans', 'Roboto', 'Montserrat',
  'Open Sans', 'Lato', 'Outfit', 'Manrope', 'DM Sans', 'Geist',
  'Cabinet Grotesk', 'Figtree', 'Satoshi', 'Playfair Display',
  'Nunito', 'Raleway', 'Work Sans', 'Space Grotesk', 'Urbanist',
  'Syne', 'Clash Display', 'General Sans', 'Epilogue', 'Jakarta Sans'
];

function cleanFontName(rawStr = '') {
  if (!rawStr) return '';
  const first = rawStr.split(',')[0].replace(/['"]/g, '').trim();
  for (const font of KNOWN_FONTS) {
    if (first.toLowerCase() === font.toLowerCase()) {
      return font;
    }
  }
  return first;
}

function detectTypographyHierarchy(htmlContent = '', cssText = '') {
  const combined = (htmlContent + ' ' + cssText);
  const allFonts = [];

  // 1. Check Google Fonts / CDN Link or @import (supports multi-family URLs like family=Syne&family=Inter)
  const fontUrlRegex = /fonts\.googleapis\.com\/css2\?family=([^"'\s]+)/gi;
  let fontMatch;
  while ((fontMatch = fontUrlRegex.exec(combined)) !== null) {
    const rawParam = fontMatch[1];
    const families = rawParam.split('&family=').map(f => decodeURIComponent(f).replace(/\+/g, ' ').split(':')[0].split('&')[0].trim());
    for (const fam of families) {
      if (fam && !allFonts.includes(fam)) {
        allFonts.push(cleanFontName(fam));
      }
    }
  }

  // 2. Check CSS variables for Headings specifically
  let headingFont = null;
  const headingVarRegex = /--(?:font-heading|font-display|font-title)\s*:\s*([^;]+);/i;
  const headingVarMatch = headingVarRegex.exec(combined);
  if (headingVarMatch) {
    headingFont = cleanFontName(headingVarMatch[1]);
  }

  // Check h1..h6 font-family in CSS
  if (!headingFont) {
    const headingRuleRegex = /(?:h1|h2|h3|h4|h5|h6)[^{]*\{[^}]*font-family\s*:\s*([^;]+);/i;
    const headingRuleMatch = headingRuleRegex.exec(combined);
    if (headingRuleMatch) {
      headingFont = cleanFontName(headingRuleMatch[1]);
    }
  }

  // 3. Check CSS variables for Body / Base
  let bodyFont = null;
  const bodyVarRegex = /--(?:font-body|font-family|font-main|font-primary|font-sans|font-stack)\s*:\s*([^;]+);/i;
  const bodyVarMatch = bodyVarRegex.exec(combined);
  if (bodyVarMatch) {
    bodyFont = cleanFontName(bodyVarMatch[1]);
  }

  // Check body / html / :root font-family declaration
  if (!bodyFont) {
    const bodyFontRegex = /(?:body|html|:root)\s*\{[^}]*font-family\s*:\s*([^;]+);/i;
    const bodyMatch = bodyFontRegex.exec(combined);
    if (bodyMatch) {
      bodyFont = cleanFontName(bodyMatch[1]);
    }
  }

  // 4. Hierarchical Font Sizes (for filling missing sizes ONLY — GT computed fontSize always takes precedence)
  const sizes = {};
  const headingTags = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
  for (const tag of headingTags) {
    const headingSizeRegex = new RegExp(`(?:^|\\s|,)${tag}[^{]*\\{[^}]*font-size\\s*:\\s*([^;]+);`, 'i');
    const match = headingSizeRegex.exec(combined);
    if (match) {
      const rawVal = match[1].trim();
      const num = parseFloat(rawVal);
      if (num > 0) {
        sizes[tag] = rawVal.includes('rem') ? Math.round(num * 16) : Math.round(num);
      }
    }
  }

  const bodySizeRegex = /(?:body|html|:root)[^{]*\{[^}]*font-size\s*:\s*([^;]+);/i;
  const bodySizeMatch = bodySizeRegex.exec(combined);
  if (bodySizeMatch) {
    const rawVal = bodySizeMatch[1].trim();
    const num = parseFloat(rawVal);
    if (num > 0) {
      sizes.body = rawVal.includes('rem') ? Math.round(num * 16) : Math.round(num);
    }
  }

  // 5. Fallbacks
  const primaryFallback = allFonts[0] || 'Inter';
  const resolvedBody = bodyFont || primaryFallback;
  const resolvedHeading = headingFont || resolvedBody;

  return {
    headingFont: resolvedHeading,
    bodyFont: resolvedBody,
    primaryFont: resolvedBody,
    allFonts: allFonts.length > 0 ? allFonts : [resolvedBody],
    sizes: Object.keys(sizes).length > 0 ? sizes : undefined
  };
}

/**
 * Settings-First Deference Contract:
 * When Ground Truth has a computed fontSize on a node (>= 8px), settings MUST use it VERBATIM.
 * Hierarchy detection may ONLY fill missing sizes when GT computed fontSize is absent.
 */
function resolveFontSizeWithDeference(gtStyles = {}, hierarchy = null, tag = '') {
  const gtFs = gtStyles?.fontSize ? parseFloat(gtStyles.fontSize) : null;
  if (gtFs !== null && !isNaN(gtFs) && gtFs >= 8) {
    return Math.round(gtFs);
  }
  if (hierarchy && hierarchy.sizes) {
    const t = (tag || '').toLowerCase();
    if (hierarchy.sizes[t]) return hierarchy.sizes[t];
    if (/^h[1-6]$/.test(t) && hierarchy.sizes.heading) return hierarchy.sizes.heading;
    if (hierarchy.sizes.body) return hierarchy.sizes.body;
  }
  return null;
}

function detectPrimaryFontFamily(htmlContent = '', cssText = '') {
  const hier = detectTypographyHierarchy(htmlContent, cssText);
  return hier.primaryFont;
}

module.exports = {
  detectPrimaryFontFamily,
  detectTypographyHierarchy,
  resolveFontSizeWithDeference,
  cleanFontName,
  KNOWN_FONTS
};

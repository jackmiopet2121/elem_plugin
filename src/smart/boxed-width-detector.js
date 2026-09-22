/**
 * Universal Ground-Truth Boxed-Width Detector.
 * Task H2: GT-Derived Universal Algorithm (Spec Block 7.5).
 * 
 * Rules:
 * 1. Collect computed max-width of OUTERMOST content wrapper of each top-level section (from Chromium GT).
 * 2. Take the MODE (most frequent) across sections; clamp to viewport width.
 * 3. Never select inner column widths (BFS stops at outermost container level).
 * 4. Zero hardcoded fixture literals (C14 compliant).
 */

function parsePx(val) {
  if (!val || typeof val !== 'string') return 0;
  const trimmed = val.trim().toLowerCase();
  if (['none', 'auto', 'initial', 'inherit', 'unset'].includes(trimmed)) return 0;
  if (trimmed.endsWith('px')) {
    const num = parseFloat(trimmed);
    return isNaN(num) ? 0 : Math.round(num);
  }
  return 0;
}

/**
 * Universal GT-derived boxed width detection.
 * Inspects top-level sections in snapshot and finds the mode of outermost wrapper max-widths.
 */
function detectUniversalBoxedWidth(snapshot, viewport = 'desktop') {
  if (!snapshot || !snapshot.viewports) return 1140;
  const vpData = snapshot.viewports[viewport] || snapshot.viewports.desktop;
  if (!vpData || !vpData.flat) return 1140;

  const flat = vpData.flat;
  const viewportWidth = vpData.width || flat['sid-1']?.rect?.w || 1280;

  const bodyNode = flat['sid-1'];
  const bodyMaxWidth = parsePx(bodyNode?.styles?.maxWidth);

  const textLeafTags = new Set([
    'p', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'small', 'label', 'a', 'button', 'input', 'img', 'i', 'b', 'strong', 'em'
  ]);
  const sectionSemanticTags = new Set(['section', 'header', 'footer', 'nav', 'article', 'aside']);

  // 1. Identify top-level section candidates
  const nonVisualTags = new Set(['script', 'style', 'noscript', 'template', 'svg']);
  let topSections = Object.values(flat).filter(
    n => n.parentSid === 'sid-1' && !nonVisualTags.has((n.tag || '').toLowerCase()) && !textLeafTags.has((n.tag || '').toLowerCase())
  );

  // If there's a single outer generic wrapper covering the body, unwrap to find the sections
  if (topSections.length === 1) {
    const singleChild = topSections[0];
    const singleChildTag = (singleChild.tag || '').toLowerCase();
    if (!sectionSemanticTags.has(singleChildTag)) {
      const grandchildren = Object.values(flat).filter(
        n => n.parentSid === singleChild.sid && !nonVisualTags.has((n.tag || '').toLowerCase()) && !textLeafTags.has((n.tag || '').toLowerCase())
      );
      if (grandchildren.length > 1) {
        topSections = grandchildren;
      }
    }
  }

  // 2. Collect computed max-width of OUTERMOST content wrapper of each top-level section
  const sectionWidths = [];

  for (const sec of topSections) {
    const secTag = (sec.tag || '').toLowerCase();
    if (nonVisualTags.has(secTag) || textLeafTags.has(secTag)) continue;

    // A. Check if the section itself has a constrained max-width
    const secMaxWidth = parsePx(sec.styles?.maxWidth);
    if (secMaxWidth > 0) {
      sectionWidths.push(secMaxWidth);
      continue;
    }

    // B. Search inside the section level-by-level (BFS) for the OUTERMOST content wrapper
    let currentLevel = Object.values(flat).filter(n => n.parentSid === sec.sid);
    let foundWidth = null;

    while (currentLevel.length > 0) {
      const levelWidths = [];
      const nextLevel = [];

      for (const node of currentLevel) {
        const tag = (node.tag || '').toLowerCase();
        if (nonVisualTags.has(tag)) continue;

        const nodeMaxWidth = parsePx(node.styles?.maxWidth);
        const isTextLeaf = textLeafTags.has(tag) &&
          !((node.className || '').includes('container') || (node.className || '').includes('wrapper'));

        if (nodeMaxWidth > 0 && !isTextLeaf) {
          levelWidths.push(nodeMaxWidth);
        } else {
          // Only explore children if this node itself did NOT constrain the layout
          const children = Object.values(flat).filter(n => n.parentSid === node.sid);
          nextLevel.push(...children);
        }
      }

      if (levelWidths.length > 0) {
        // Outermost level with container constraint found! Take the max width at this level.
        foundWidth = Math.max(...levelWidths);
        break; // Never traverse deeper into inner columns/cards
      }

      currentLevel = nextLevel;
    }

    if (foundWidth !== null) {
      sectionWidths.push(foundWidth);
    }
  }

  // 3. Fallback to body or single wrapper if no section inner wrapper had max-width
  if (sectionWidths.length === 0) {
    if (bodyMaxWidth > 0 && bodyMaxWidth <= viewportWidth) {
      return Math.min(bodyMaxWidth, viewportWidth);
    }
    if (topSections.length === 1) {
      const singleMw = parsePx(topSections[0].styles?.maxWidth);
      if (singleMw > 0 && singleMw <= viewportWidth) {
        return Math.min(singleMw, viewportWidth);
      }
    }
    return Math.min(viewportWidth, 1140);
  }

  // 4. Calculate the MODE (most frequent) across sections
  const freq = new Map();
  for (const w of sectionWidths) {
    freq.set(w, (freq.get(w) || 0) + 1);
  }

  let maxCount = 0;
  let modeWidth = sectionWidths[0];
  for (const [w, count] of freq.entries()) {
    if (count > maxCount || (count === maxCount && w > modeWidth)) {
      maxCount = count;
      modeWidth = w;
    }
  }

  // 5. Clamp to viewport width
  return Math.min(modeWidth, viewportWidth);
}

/**
 * Fallback boxed-width detection when Chromium GT is unavailable.
 * Inspects CSS container selectors without blind regex.
 */
function detectFallbackBoxedWidth(htmlContent, fullCss = '') {
  if (!fullCss && htmlContent) {
    const cssMatches = htmlContent.match(/<style\b[^>]*>([\s\S]*?)<\/style>/gi) || [];
    fullCss = cssMatches.map(s => s.replace(/<\/?style[^>]*>/gi, '')).join('\n').trim();
  }

  // 1. Check CSS variables for container/layout/max-width
  const varMatches = fullCss.match(/--[\w-]*(?:container|layout|boxed|max-width)[\w-]*\s*:\s*([^;]+);/gi) || [];
  for (const vm of varMatches) {
    const pxMatch = vm.match(/:\s*([0-9]+)px/i);
    if (pxMatch) {
      const px = parseInt(pxMatch[1], 10);
      if (px >= 400 && px <= 2560) return px;
    }
  }

  // 2. Check prioritized container selectors
  const containerRegex = /(?:\.container|\.wrapper|\.section-container|\bmain\b|\.layout|\.site-content)\b[^{]*\{([^}]+)\}/gi;
  let match;
  const containerWidths = [];
  while ((match = containerRegex.exec(fullCss)) !== null) {
    const block = match[1];
    const mwMatch = block.match(/max-width:\s*([0-9]+)px/i);
    if (mwMatch) {
      const px = parseInt(mwMatch[1], 10);
      if (px >= 400 && px <= 2560) {
        containerWidths.push(px);
      }
    }
  }

  if (containerWidths.length > 0) {
    // Return the mode of detected container widths
    const freq = new Map();
    for (const w of containerWidths) {
      freq.set(w, (freq.get(w) || 0) + 1);
    }
    let maxCount = 0;
    let modeWidth = containerWidths[0];
    for (const [w, count] of freq.entries()) {
      if (count > maxCount || (count === maxCount && w > modeWidth)) {
        maxCount = count;
        modeWidth = w;
      }
    }
    return modeWidth;
  }

  return 1140;
}

module.exports = {
  detectUniversalBoxedWidth,
  detectFallbackBoxedWidth
};

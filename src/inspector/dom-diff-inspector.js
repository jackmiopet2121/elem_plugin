/**
 * Deterministic DOM & Computed Style Diff Inspector.
 * Analyzes DOM metrics extracted from original HTML and Elementor virtual preview.
 * Detects contrast failures (invisible text), font scale collapses, and layout stacking errors.
 */
const { parseBoxShadow } = require('../normalizers/css-style-resolver');

// Safely extract a pure string class name, guarding against SVGAnimatedString objects
function safeClassStr(val) {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (typeof val.baseVal === 'string') return val.baseVal;
  return String(val || '');
}

// Calculate relative luminance of an RGB or Hex color string
function getLuminance(rgbOrHexStr) {
  if (!rgbOrHexStr || typeof rgbOrHexStr !== 'string') return 1;
  let r = 255, g = 255, b = 255;
  if (rgbOrHexStr.startsWith('#')) {
    const raw = rgbOrHexStr.slice(1);
    if (raw.length === 3) {
      r = parseInt(raw[0] + raw[0], 16);
      g = parseInt(raw[1] + raw[1], 16);
      b = parseInt(raw[2] + raw[2], 16);
    } else if (raw.length >= 6) {
      r = parseInt(raw.slice(0, 2), 16);
      g = parseInt(raw.slice(2, 4), 16);
      b = parseInt(raw.slice(4, 6), 16);
    }
  } else {
    const match = rgbOrHexStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (match) {
      r = parseInt(match[1], 10);
      g = parseInt(match[2], 10);
      b = parseInt(match[3], 10);
    }
  }

  const [sR, sG, sB] = [r, g, b].map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * sR + 0.7152 * sG + 0.0722 * sB;
}

// Calculate WCAG contrast ratio between two colors
function getContrastRatio(color1, color2) {
  const l1 = getLuminance(color1);
  const l2 = getLuminance(color2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function normalizeColorToHex(rgbStr) {
  if (!rgbStr) return '#000000';
  if (rgbStr.startsWith('#')) return rgbStr;
  const match = rgbStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!match) return rgbStr;
  const hex = ((1 << 24) + (parseInt(match[1]) << 16) + (parseInt(match[2]) << 8) + parseInt(match[3])).toString(16).slice(1);
  return `#${hex.toUpperCase()}`;
}

function compareDomMetrics(originalMetrics, elementorMetrics, options = {}) {
  const defects = [];
  const pageBg = options.pageBackground || '#FFFFFF';

  // 1. Text Node Matching & Computed Style Audit
  const originalTextNodes = originalMetrics.filter(m => m.hasDirectText && m.text.length > 0);
  const elementorTextNodes = elementorMetrics.filter(m => m.hasDirectText && m.text.length > 0);

  for (const elNode of elementorTextNodes) {
    const textSnippet = elNode.text.slice(0, 40);

    // Find corresponding node in original
    const origNode = originalTextNodes.find(o => 
      o.text === elNode.text || 
      o.text.startsWith(textSnippet) || 
      elNode.text.startsWith(o.text.slice(0, 40))
    );

    // Skip hidden / invisible text elements (e.g. collapsed disclosure answers, hidden modal popups)
    if (elNode.styles.display === 'none' || elNode.styles.visibility === 'hidden' || elNode.styles.opacity === 0 || (elNode.rect.width === 0 && elNode.rect.height === 0)) {
      continue;
    }
    if (origNode && (origNode.styles.display === 'none' || origNode.styles.visibility === 'hidden' || origNode.styles.opacity === 0 || (origNode.rect.width === 0 && origNode.rect.height === 0))) {
      continue;
    }

    // Contrast Check: Is Elementor text invisible against background?
    const textColor = elNode.styles.color;
    let bgColor = (elNode.styles.backgroundColor && elNode.styles.backgroundColor !== 'rgba(0, 0, 0, 0)')
      ? elNode.styles.backgroundColor
      : pageBg;

    // If background is an rgba with low alpha (< 0.25), it's a transparent overlay, fallback to pageBg
    const alphaMatch = bgColor.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([0-9.]+)\)/i);
    if (alphaMatch && parseFloat(alphaMatch[1]) < 0.25) {
      bgColor = pageBg;
    }

    const contrast = getContrastRatio(textColor, bgColor);
    if (contrast < 2.0 && elNode.text.length > 2) {
      const targetColor = origNode ? normalizeColorToHex(origNode.styles.color) : '#0F172A';
      defects.push({
        type: 'CONTRAST_FAILURE',
        severity: 'HIGH',
        text: textSnippet,
        currentColor: textColor,
        backgroundColor: bgColor,
        contrastRatio: Math.round(contrast * 10) / 10,
        suggestedFix: {
          property: 'title_color',
          value: targetColor
        },
        message: `Invisible or illegible text detected: "${textSnippet}" has low contrast (${Math.round(contrast * 10) / 10}:1) against background.`
      });
    }

    // Universal Font Scale Collapse Check: Catch 1px collapse or severe shrinkage on any readable text
    if (origNode && origNode.styles.fontSize >= 11) {
      const origSize = origNode.styles.fontSize;
      const elSize = elNode.styles.fontSize;
      const ratio = elSize / origSize;

      // Flag if text collapsed to <= 4px OR shrank significantly (< 0.6x)
      if (elSize <= 4 || (ratio < 0.6 && origSize >= 12)) {
        defects.push({
          type: 'FONT_SCALE_COLLAPSE',
          severity: 'HIGH',
          text: textSnippet,
          originalFontSize: origSize,
          elementorFontSize: elSize,
          suggestedFix: {
            property: 'typography_font_size',
            value: { size: Math.round(origSize), unit: 'px' }
          },
          message: `Font scale collapsed on "${textSnippet}": expected ~${Math.round(origSize)}px, rendered as ${Math.round(elSize)}px.`
        });
      }
    }

    // Text Line-Wrap Regressions: Catch buttons or titles squished into multiple lines
    if (origNode && origNode.lineCount === 1 && (elNode.lineCount || 1) >= 2) {
      const isButtonOrHeading = ['button', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span'].includes(elNode.tag) ||
                                elNode.className.includes('btn') || elNode.className.includes('button') ||
                                elNode.className.includes('pill') || elNode.className.includes('badge') ||
                                elNode.className.includes('title') || elNode.className.includes('tier');
      if (isButtonOrHeading) {
        defects.push({
          type: 'TEXT_LINE_WRAP_DEFECT',
          severity: 'HIGH',
          text: textSnippet,
          originalLines: 1,
          elementorLines: elNode.lineCount,
          suggestedFix: {
            property: 'expand_width',
            text: textSnippet
          },
          message: `Text awkwardly wrapped/squished: "${textSnippet}" wrapped to ${elNode.lineCount} lines in Elementor (expected 1 single line).`
        });
      }
    }
  }

  // 2. Relative Layout & Sibling Cluster Row-Wrap Check (Zero Hardcoded 200px Filter)
  const isCardOrColumn = (m) => {
    const cls = (m.className || '').toLowerCase();
    const hasCardClass = cls.split(/\s+/).some(token => 
      token === 'card' || token.includes('card') || token.includes('plan') || 
      token.includes('tier') || token.includes('col') || token.includes('pricing-')
    );
    const isInnerElement = cls.includes('media') || cls.includes('img') || cls.includes('image') || 
                           cls.includes('body') || cls.includes('content') || cls.includes('header') || 
                           cls.includes('grid') || cls.includes('container') || cls.includes('section');
    return hasCardClass && !isInnerElement;
  };

  const origCards = originalMetrics.filter(m => m.rect.width >= 80 && m.rect.height >= 100 && isCardOrColumn(m));

  if (origCards.length >= 2) {
    const firstY = origCards[0].rect.y;
    const isOrigRow = origCards.every(c => Math.abs(c.rect.y - firstY) < 35);

    if (isOrigRow) {
      const elCards = elementorMetrics.filter(m => isCardOrColumn(m) && m.rect.height >= 100);
      if (elCards.length >= 2) {
        const elFirstY = elCards[0].rect.y;
        const allOnFirstRow = elCards.every(c => Math.abs(c.rect.y - elFirstY) < 35);

        if (!allOnFirstRow || elCards.length !== origCards.length) {
          defects.push({
            type: 'LAYOUT_STACKING_MISMATCH',
            severity: 'CRITICAL',
            message: `Multi-column cards wrapped or stacked vertically instead of a single horizontal row (${origCards.length} columns expected).`,
            suggestedFix: {
              property: 'direction',
              value: 'row',
              expectedColumns: origCards.length,
              childWidth: Math.round(100 / origCards.length - 2)
            }
          });
        }

        // Multi-Column Equal Height Parity Check
        const origHeights = origCards.map(c => c.rect.height);
        const origSpread = Math.max(...origHeights) - Math.min(...origHeights);
        const elHeights = elCards.map(c => c.rect.height);
        const elSpread = Math.max(...elHeights) - Math.min(...elHeights);

        if (origSpread <= 10 && elSpread > 20) {
          defects.push({
            type: 'SIBLING_EQUAL_HEIGHT_MISMATCH',
            severity: 'HIGH',
            heightSpread: elSpread,
            suggestedFix: {
              property: 'equal_height_stretch',
              alignItems: 'stretch',
              justifyContent: 'space-between'
            },
            message: `Multi-column cards rendered with unequal heights (difference of ${elSpread}px) whereas original design had equal height.`
          });
        }
      }
    }
  }

  // 3. Root Container Width Squeeze Check
  const origRootContainer = originalMetrics.find(m => 
    (m.tag === 'div' || m.tag === 'section' || m.tag === 'main') &&
    (m.className.includes('container') || m.className.includes('wrapper') || m.className.includes('pricing')) &&
    m.rect.width >= 800
  );
  const elRootContainer = elementorMetrics.find(m => 
    m.className.includes('e-con') && m.rect.width > 0 && m.rect.y < 300
  );

  if (origRootContainer && elRootContainer) {
    if (origRootContainer.rect.width >= 900 && elRootContainer.rect.width <= 700) {
      defects.push({
        type: 'ROOT_CONTAINER_SQUEEZED',
        severity: 'CRITICAL',
        expectedWidth: origRootContainer.rect.width,
        actualWidth: elRootContainer.rect.width,
        suggestedFix: {
          property: 'boxed_width',
          value: Math.round(origRootContainer.rect.width)
        },
        message: `Root container width was severely squeezed: Elementor rendered at ${elRootContainer.rect.width}px, expected ~${origRootContainer.rect.width}px.`
      });
    }
  }

  // 4. Section-to-Section Spatial Distance Matrix (\Delta Y Spacing Audit)
  // Check vertical gaps between sequential major top-level blocks
  const origBlocks = originalMetrics.filter(m => 
    (m.tag === 'header' || m.tag === 'section' || (m.tag === 'div' && m.rect.width >= 400 && m.rect.height >= 60)) &&
    !/(?:card|item|btn|button|input|toggle|pill|badge|list)/i.test(safeClassStr(m.className))
  ).filter((b, idx, arr) => {
    // Ensure non-nested: b is not inside another block in arr
    return !arr.some(parent => parent !== b && parent.rect.y <= b.rect.y && (parent.rect.y + parent.rect.height >= b.rect.y + b.rect.height));
  }).sort((a, b) => a.rect.y - b.rect.y);

  // Group adjacent non-nested vertical blocks
  for (let i = 0; i < origBlocks.length - 1; i++) {
    const b1 = origBlocks[i];
    const b2 = origBlocks[i + 1];
    const b1Bottom = b1.rect.y + b1.rect.height;
    const origGap = b2.rect.y - b1Bottom;

    if (origGap >= 24) {
      const b1Classes = safeClassStr(b1.className).split(/\s+/).filter(c => c.length >= 3 && !['elementor-widget', 'elementor-element'].includes(c));
      const b2Classes = safeClassStr(b2.className).split(/\s+/).filter(c => c.length >= 3 && !['elementor-widget', 'elementor-element'].includes(c));

      const findBlock = (block, classes) => {
        if (classes.length > 0) {
          return elementorMetrics.find(m => {
            const mCls = safeClassStr(m.className).split(/\s+/);
            return classes.some(c => mCls.includes(c));
          });
        }
        return elementorMetrics.find(m => m.tag === block.tag && m.rect.width >= 300 && Math.abs(m.rect.y - block.rect.y) < 100);
      };

      const elB1 = findBlock(b1, b1Classes);
      const elB2 = findBlock(b2, b2Classes);

      if (elB1 && elB2 && elB1 !== elB2 && elB2.rect.y > elB1.rect.y) {
        const elB1Bottom = elB1.rect.y + elB1.rect.height;
        const elGap = elB2.rect.y - elB1Bottom;

        if (elGap < Math.min(12, origGap * 0.3) || elGap <= 0) {
          const targetCls = b2Classes[0] || safeClassStr(b2.className).split(' ')[0] || b2.tag;
          defects.push({
            type: 'VERTICAL_SPACING_COLLAPSE',
            severity: 'CRITICAL',
            origGap,
            elGap,
            sectionPrev: b1Classes[0] || b1.tag,
            sectionNext: targetCls,
            suggestedFix: {
              property: 'margin_top',
              gapNeeded: origGap,
              targetClass: targetCls
            },
            message: `Vertical spacing collapsed between "${b1Classes[0] || b1.tag}" and "${targetCls}": original had ${origGap}px space, Elementor rendered with ${elGap}px.`
          });
        }
      }
    }
  }

  // 5. Lossless Word-Token Parity Check (Detect Word Sticking like "UnlimitedAI")
  const origWords = [];
  originalMetrics.forEach(m => {
    if (Array.isArray(m.words)) origWords.push(...m.words);
  });
  const elWords = [];
  elementorMetrics.forEach(m => {
    if (Array.isArray(m.words)) elWords.push(...m.words);
  });

  // Check if any elementor word is an unspaced concatenation of two consecutive original words
  for (let i = 0; i < origWords.length - 1; i++) {
    const w1 = origWords[i].replace(/[^a-zA-Z0-9]/g, '');
    const w2 = origWords[i + 1].replace(/[^a-zA-Z0-9]/g, '');
    if (w1.length >= 2 && w2.length >= 2) {
      const fused = (w1 + w2).toLowerCase();
      const stuckMatch = elWords.find(ew => {
        const cleanEw = ew.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        return cleanEw === fused && !ew.toLowerCase().includes(w1.toLowerCase() + ' ' + w2.toLowerCase());
      });
      if (stuckMatch) {
        defects.push({
          type: 'TEXT_TOKEN_STICKING',
          severity: 'HIGH',
          stuckToken: stuckMatch,
          w1: origWords[i],
          w2: origWords[i + 1],
          suggestedFix: {
            property: 'text_separator',
            stuckToken: stuckMatch,
            replacement: `${origWords[i]} ${origWords[i + 1]}`
          },
          message: `Text word sticking detected: "${stuckMatch}" was merged without whitespace (expected "${origWords[i]} ${origWords[i + 1]}").`
        });
      }
    }
  }

  // 6. Bounding Box Collision / Overlap Detector
  const interactiveNodes = elementorMetrics.filter(m => 
    m.className.includes('toggle') || m.className.includes('switch') || m.className.includes('filter') ||
    m.className.includes('billing')
  );
  const cardOrPillNodes = elementorMetrics.filter(m => 
    m.className.includes('pill') || m.className.includes('badge') || isCardOrColumn(m)
  );

  for (const ctrl of interactiveNodes) {
    for (const card of cardOrPillNodes) {
      if (ctrl === card) continue;
      const ctrlBottom = ctrl.rect.y + ctrl.rect.height;
      const cardTop = card.rect.y;

      if (ctrlBottom > cardTop + 2 && ctrlBottom < cardTop + card.rect.height) {
        const origCtrl = originalMetrics.find(o => o.className && safeClassStr(ctrl.className).includes(safeClassStr(o.className).split(' ')[0]));
        const origCard = originalMetrics.find(o => o.className && safeClassStr(card.className).includes(safeClassStr(o.className).split(' ')[0]));

        if (!origCtrl || !origCard || (origCtrl.rect.y + origCtrl.rect.height <= origCard.rect.y + 2)) {
          defects.push({
            type: 'WIDGET_COLLISION_DEFECT',
            severity: 'HIGH',
            suggestedFix: {
              property: 'margin_top',
              gapNeeded: Math.max(32, Math.round(ctrlBottom - cardTop + 24))
            },
            message: `Layout collision detected: Control/Toggle overlaps with card or pill badge below it by ~${Math.round(ctrlBottom - cardTop)}px.`
          });
          break;
        }
      }
    }
  }

  // 7. Root Page Background Color Parity Check
  const origBody = originalMetrics.find(m => m.tag === 'body');
  const origBg = origBody ? (origBody.styles.rawBackgroundColor || origBody.styles.backgroundColor) : pageBg;
  const elRoot = elementorMetrics.find(m => m.className.includes('e-con') && m.rect.y <= 100);
  const elBody = elementorMetrics.find(m => m.tag === 'body');
  const elEffectiveBg = elRoot?.styles?.backgroundColor || elBody?.styles?.backgroundColor || '#FFFFFF';

  if (origBg && origBg !== 'rgba(0, 0, 0, 0)' && origBg !== 'transparent' && origBg !== 'rgb(255, 255, 255)' && origBg !== '#ffffff') {
    const origHex = normalizeColorToHex(origBg).toUpperCase();
    const elHex = normalizeColorToHex(elEffectiveBg).toUpperCase();
    if (origHex !== elHex && elHex === '#FFFFFF') {
      defects.push({
        type: 'ROOT_BACKGROUND_MISMATCH',
        severity: 'CRITICAL',
        expectedColor: origHex,
        actualColor: elHex,
        suggestedFix: {
          property: 'background_color',
          value: origHex
        },
        message: `Root page background color mismatch: original design uses ${origHex}, but Elementor rendered stark white ${elHex}.`
      });
    }
  }

  // 8. Toggle Switch & Slider Micro-Component Parity Check
  const origSwitch = originalMetrics.find(m => 
    (m.tag === 'label' || m.className.includes('switch') || m.className.includes('slider')) &&
    !m.className.includes('wrapper') && !m.className.includes('container') && !m.className.includes('header') &&
    m.rect.width >= 24 && m.rect.width <= 140 && m.rect.height >= 16 && m.rect.height <= 60
  );
  if (origSwitch) {
    const origSlider = originalMetrics.find(m => 
      m.className.includes('slider') || (m.styles.before && m.styles.before.width >= 8)
    );
    const origSwitchCls = safeClassStr(origSwitch.className).split(' ')[0];
    const elSwitch = elementorMetrics.find(m => m.className && origSwitchCls && safeClassStr(m.className).includes(origSwitchCls));
    
    // Look for knob width in slider handle or child/sibling with before pseudo-element
    const elSlider = elementorMetrics.find(m => 
      (m.dataId === elSwitch?.dataId && (m.styles?.before?.width >= 8 || safeClassStr(m.className).includes('slider'))) ||
      (m.styles?.before?.width >= 8 && safeClassStr(m.className).includes('slider'))
    );
    const elKnobWidth = elSlider?.styles?.before?.width || elSwitch?.styles?.before?.width || 0;
    const elInput = elementorMetrics.find(m => m.tag === 'input');
    const isInputVisible = elInput && elInput.styles.opacity > 0.5 && elInput.rect.width > 0;

    if (elKnobWidth < 8 || isInputVisible || !elSwitch) {
      const knobMetrics = origSlider?.styles?.before || origSwitch.styles?.before || {};
      defects.push({
        type: 'SWITCH_DISTORTION',
        severity: 'CRITICAL',
        targetId: elSwitch?.dataId || null,
        message: `Toggle switch slider distorted or rendered as unstyled checkbox: knob width is ${elKnobWidth}px (expected ~${knobMetrics.width || 24}px).`,
        suggestedFix: {
          property: 'scoped_switch_css',
          targetId: elSwitch?.dataId || null,
          switchClass: origSwitchCls || 'toggle-switch',
          sliderClass: origSlider ? safeClassStr(origSlider.className).split(' ')[0] || 'slider' : 'slider',
          width: origSwitch.rect.width || 60,
          height: origSwitch.rect.height || 32,
          trackBg: origSwitch.styles.rawBackgroundColor || origSwitch.styles.backgroundColor || '#e2e8f0',
          trackRadius: origSwitch.styles.borderRadius || '999px',
          knobWidth: knobMetrics.width || 24,
          knobHeight: knobMetrics.height || 24,
          knobBg: knobMetrics.backgroundColor || '#ffffff',
          knobRadius: knobMetrics.borderRadius || '50%',
          knobShadow: knobMetrics.boxShadow || '0 2px 4px rgba(0,0,0,0.1)'
        }
      });
    }
  }

  // 9. Pill Badge & Save Badge Style Parity Check
  const origBadges = originalMetrics.filter(m => 
    /(?:badge|pill|tag|save)/i.test(safeClassStr(m.className)) && 
    (m.styles.backgroundImage?.includes('gradient') || (m.styles.rawBackgroundColor && m.styles.rawBackgroundColor !== 'rgba(0, 0, 0, 0)') || (m.styles.border && m.styles.border !== 'none'))
  );
  for (const ob of origBadges) {
    const obCls = safeClassStr(ob.className).split(' ')[0];
    const elBadge = elementorMetrics.find(m => 
      m.className && obCls && safeClassStr(m.className).includes(obCls)
    );
    const hasLostBg = !elBadge || (elBadge.styles.backgroundColor === 'rgba(0, 0, 0, 0)' && !elBadge.styles.backgroundImage?.includes('gradient'));
    const hasLostBorder = ob.styles.border && ob.styles.border !== 'none' && (!elBadge || !elBadge.styles.border || elBadge.styles.border === 'none');

    if (hasLostBg || hasLostBorder) {
      defects.push({
        type: 'BADGE_STYLE_LOST',
        severity: 'HIGH',
        targetId: elBadge?.dataId || null,
        badgeClass: obCls,
        message: `Pill/Badge style lost on ".${obCls}": background gradient/color or border stripped, rendering as plain text.`,
        suggestedFix: {
          property: 'scoped_badge_css',
          targetId: elBadge?.dataId || null,
          badgeClass: obCls,
          color: ob.styles.color,
          backgroundColor: ob.styles.rawBackgroundColor || ob.styles.backgroundColor,
          backgroundImage: ob.styles.backgroundImage,
          border: ob.styles.border,
          borderRadius: ob.styles.borderRadius,
          fontSize: ob.styles.fontSize,
          fontWeight: ob.styles.fontWeight
        }
      });
      break;
    }
  }

  // 10. Card Drop Shadow & Elevation Parity Check
  const origCardsWithShadow = origCards.filter(c => c.styles.boxShadow && c.styles.boxShadow !== 'none');
  if (origCardsWithShadow.length > 0) {
    const elCards = elementorMetrics.filter(m => isCardOrColumn(m) && m.rect.height >= 100);
    const elCardsWithShadow = elCards.filter(c => c.styles.boxShadow && c.styles.boxShadow !== 'none');
    if (elCardsWithShadow.length === 0 && elCards.length > 0) {
      const primaryShadow = origCardsWithShadow[0].styles.boxShadow;
      const popularCard = origCardsWithShadow.find(c => c.className.includes('popular') || c.className.includes('featured'));
      defects.push({
        type: 'SHADOW_LOST',
        severity: 'HIGH',
        targetIds: elCards.map(c => c.dataId).filter(Boolean),
        message: `Card elevation lost: ${origCardsWithShadow.length} card(s) in original design had soft drop shadows, but Elementor rendered with none.`,
        suggestedFix: {
          property: 'card_drop_shadow',
          targetIds: elCards.map(c => c.dataId).filter(Boolean),
          cardClass: safeClassStr(origCardsWithShadow[0].className).split(' ')[0],
          boxShadow: primaryShadow,
          popularBoxShadow: popularCard ? popularCard.styles.boxShadow : primaryShadow
        }
      });
    }
  }

  // 11. Universal 30-Property Exhaustive Computed Style Differential Matrix
  const matrixDefects = runComputedStyleMatrix(originalMetrics, elementorMetrics, defects);
  defects.push(...matrixDefects);

  // 12. Universal Spatial Relational Topology Engine
  // Audits inter-element bounding box collisions, sibling proximity blowups, and boundary containment
  const spatialDefects = auditSpatialTopology(originalMetrics, elementorMetrics);
  defects.push(...spatialDefects);

  // 13. Compute overall visual fidelity score (0 - 100)
  let score = 100;
  for (const d of defects) {
    if (d.severity === 'CRITICAL') score -= 25;
    else if (d.severity === 'HIGH') score -= 10;
    else score -= 5;
  }
  score = Math.max(0, score);

  return {
    score,
    passed: defects.length === 0,
    defectCount: defects.length,
    defects
  };
}

function auditSpatialTopology(originalMetrics, elementorMetrics) {
  const spatialDefects = [];

  function findBestOrig(elNode) {
    let best = null;
    let maxScore = 0;
    for (const orig of originalMetrics) {
      const s = computeNodeMatchScore(orig, elNode);
      if (s > maxScore && s >= 45) {
        maxScore = s;
        best = orig;
      }
    }
    return best;
  }

  const elElements = elementorMetrics.filter(m => {
    if (!m.dataId) return false;
    if (m.rect.width === 0 || m.rect.height === 0) return false;
    if (m.styles.display === 'none' || m.styles.visibility === 'hidden') return false;
    return true;
  });

  const origMap = new Map();
  for (const el of elElements) {
    const orig = findBestOrig(el);
    if (orig) origMap.set(el, orig);
  }

  // Invariant 1: Zero-Collision Invariant (A ∩ B = ∅)
  for (let i = 0; i < elElements.length; i++) {
    const a = elElements[i];
    const origA = origMap.get(a);
    if (!origA) continue;

    for (let j = i + 1; j < elElements.length; j++) {
      const b = elElements[j];
      const origB = origMap.get(b);
      if (!origB) continue;

      if (a.dataId === b.dataId) continue;

      // Invariant 1a: Collision detection strictly audits atomic leaf content elements.
      // Containers represent spatial boundaries, not leaf visual components.
      if (a.elType === 'container' || b.elType === 'container') continue;

      // Skip ancestor-descendant relationships
      if (a.domPath && b.domPath) {
        if (a.domPath.startsWith(b.domPath) || b.domPath.startsWith(a.domPath)) continue;
      }

      const origOverlapX = Math.max(0, Math.min(origA.rect.x + origA.rect.width, origB.rect.x + origB.rect.width) - Math.max(origA.rect.x, origB.rect.x));
      const origOverlapY = Math.max(0, Math.min(origA.rect.y + origA.rect.height, origB.rect.y + origB.rect.height) - Math.max(origA.rect.y, origB.rect.y));
      const origArea = origOverlapX * origOverlapY;

      if (origArea < 10) {
        const elOverlapX = Math.max(0, Math.min(a.rect.x + a.rect.width, b.rect.x + b.rect.width) - Math.max(a.rect.x, b.rect.x));
        const elOverlapY = Math.max(0, Math.min(a.rect.y + a.rect.height, b.rect.y + b.rect.height) - Math.max(a.rect.y, b.rect.y));
        const elArea = elOverlapX * elOverlapY;

        if (elArea >= 25 && elOverlapX >= 5 && elOverlapY >= 5) {
          const topNode = a.rect.y <= b.rect.y ? a : b;
          const bottomNode = topNode === a ? b : a;
          const overlapHeight = Math.ceil(elOverlapY);
          const overlapWidth = Math.ceil(elOverlapX);
          const isSameParent = Boolean(a.parentElementorId && a.parentElementorId === b.parentElementorId);
          const isVerticalCollision = isSameParent && (elOverlapY < elOverlapX || elOverlapY <= 30);

          spatialDefects.push({
            type: 'SPATIAL_COLLISION',
            severity: 'CRITICAL',
            targetId: bottomNode.dataId,
            collidingWithId: topNode.dataId,
            overlapArea: elArea,
            overlapHeight,
            overlapWidth,
            isSameParent,
            isVerticalCollision,
            suggestedFix: {
              property: 'resolve_spatial_collision',
              targetId: bottomNode.dataId,
              topId: topNode.dataId,
              gapNeeded: overlapHeight + 12,
              isSameParent,
              isVerticalCollision
            },
            message: `Spatial collision detected: "${topNode.text || topNode.className}" overlaps with "${bottomNode.text || bottomNode.className}" by ${overlapHeight}px (${elArea}px² area).`
          });
          break;
        }
      }
    }
  }

  // Invariant 2: Sibling Proximity Delta (Lockup Separation Blowup)
  for (let i = 0; i < elElements.length; i++) {
    const a = elElements[i];
    const origA = origMap.get(a);
    if (!origA) continue;

    for (let j = 0; j < elElements.length; j++) {
      if (i === j) continue;
      const b = elElements[j];
      const origB = origMap.get(b);
      if (!origB) continue;

      if (a.dataId === b.dataId) continue;

      const isOrigSameRow = Math.abs(origA.rect.y - origB.rect.y) <= 15;
      const origDistanceX = origB.rect.x - (origA.rect.x + origA.rect.width);

      if (isOrigSameRow && origDistanceX >= -2 && origDistanceX <= 25) {
        // Measure between outer component envelopes to adhere to W3C box model across multi-layer widgets
        const rectA = (a.envelopeRect && a.envelopeRect.width > 0) ? a.envelopeRect : a.rect;
        const rectB = (b.envelopeRect && b.envelopeRect.width > 0) ? b.envelopeRect : b.rect;
        const elDistanceX = rectB.x - (rectA.x + rectA.width);
        const distanceBlowup = elDistanceX - origDistanceX;

        if (distanceBlowup >= 35 && elDistanceX > 30) {
          const parentId = a.parentElementorId || b.parentElementorId;
          spatialDefects.push({
            type: 'SPATIAL_SEPARATION_BLOWUP',
            severity: 'CRITICAL',
            targetId: parentId || a.dataId,
            childAId: a.dataId,
            childBId: b.dataId,
            originalGap: Math.round(origDistanceX),
            elementorGap: Math.round(elDistanceX),
            blowupDelta: Math.round(distanceBlowup),
            suggestedFix: {
              property: 'tighten_lockup',
              targetId: parentId || a.dataId,
              childTargetIds: [a.dataId, b.dataId],
              desiredGap: Math.max(0, Math.round(origDistanceX))
            },
            message: `Spatial proximity blowup on lockup: "${a.text || a.className}" and "${b.text || b.className}" separated by ${Math.round(elDistanceX)}px in Elementor (expected ~${Math.round(origDistanceX)}px).`
          });
          break;
        }
      }
    }
  }

  // Invariant 3: Boundary Containment Invariant (Child ⊆ Parent + ε)
  const containers = elementorMetrics.filter(m => m.elType === 'container' && m.dataId && m.rect.width >= 100 && m.rect.height >= 80);
  for (const cont of containers) {
    const contRight = cont.rect.x + cont.rect.width;
    const contBottom = cont.rect.y + cont.rect.height;

    const childrenInCont = elElements.filter(e => (e.parentElementorId === cont.dataId || (e.domPath && cont.domPath && e.domPath.startsWith(cont.domPath))) && e.elType !== 'container');
    for (const child of childrenInCont) {
      const childRight = child.rect.x + child.rect.width;
      const childBottom = child.rect.y + child.rect.height;

      const bleedX = childRight - contRight;
      const bleedY = childBottom - contBottom;

      if (bleedX > 15 || bleedY > 15) {
        const origCont = findBestOrig(cont);
        const origChild = findBestOrig(child);

        let origBleed = false;
        if (origCont && origChild) {
          const origContRight = origCont.rect.x + origCont.rect.width;
          const origContBottom = origCont.rect.y + origCont.rect.height;
          if ((origChild.rect.x + origChild.rect.width > origContRight + 10) || (origChild.rect.y + origChild.rect.height > origContBottom + 10)) {
            origBleed = true;
          }
        }

        if (!origBleed) {
          spatialDefects.push({
            type: 'CONTAINER_BOUNDARY_BLEED',
            severity: 'HIGH',
            targetId: cont.dataId,
            childId: child.dataId,
            bleedX: Math.max(0, Math.round(bleedX)),
            bleedY: Math.max(0, Math.round(bleedY)),
            suggestedFix: {
              property: 'contain_boundary_overflow',
              targetId: cont.dataId,
              childId: child.dataId
            },
            message: `Boundary bleed detected: Element "${child.text || child.className}" overflows outside parent container boundary by ${Math.max(Math.round(bleedX), Math.round(bleedY))}px.`
          });
          break;
        }
      }
    }
  }

  // Invariant 5: Universal Element Dimension & Width Parity
  // Catches buttons, inputs, and block cards that shrank significantly in Elementor
  for (const el of elElements) {
    if (el.elType === 'container') continue; // Only audit leaf/interactive elements
    const orig = origMap.get(el);
    if (!orig) continue;

    // For button widgets, audit the interactive box (a.elementor-button or .elementor-widget-button),
    // skipping internal text/icon glyph wrappers (span, i, svg) which represent only text string length.
    if (el.widgetType === 'button' && ['span', 'i', 'svg', 'em', 'strong', 'b'].includes(el.tag)) {
      continue;
    }
    if ((orig.tag === 'button' || orig.tag === 'a') && ['span', 'i', 'svg', 'em', 'strong', 'b'].includes(el.tag)) {
      continue;
    }

    // Audit interactive CTAs or major leaf content elements with substantial original width
    const isInteractiveOrCta = el.widgetType === 'button' || ['button', 'a', 'input'].includes(el.tag) || (el.className || '').includes('btn') || (el.className || '').includes('button');
    if (isInteractiveOrCta && orig.rect.width >= 120) {
      const origW = orig.rect.width;
      const elW = el.rect.width;
      const ratio = elW / origW;

      // If width collapsed by more than 25% (e.g. 280px -> 140px)
      if (ratio < 0.75 && (origW - elW) >= 35) {
        spatialDefects.push({
          type: 'DIMENSION_MISMATCH',
          severity: 'HIGH',
          targetId: el.dataId,
          originalWidth: Math.round(origW),
          elementorWidth: Math.round(elW),
          shrinkageRatio: Math.round(ratio * 100) / 100,
          suggestedFix: {
            property: el.widgetType === 'button' ? 'align' : '_element_width',
            value: el.widgetType === 'button' ? 'justify' : 'initial'
          },
          message: `Dimension mismatch on ${el.widgetType || el.tag}: width collapsed from ${Math.round(origW)}px to ${Math.round(elW)}px (${Math.round((1 - ratio) * 100)}% shrinkage).`
        });
      }
    }
  }

  return spatialDefects;
}

function computeNodeMatchScore(orig, el) {
  let score = 0;
  if (!orig || !el) return 0;

  // 0. Exact Bidirectional DOM Source Map Match (100% Identity Match)
  if (orig.domNodeId && el.domNodeId && orig.domNodeId === el.domNodeId) {
    return 1000;
  }

  // Tag match
  if (orig.tag === el.tag) score += 20;

  // Text Match (direct or descendant text)
  const origTxt = (orig.text || orig.fullText || '').trim().toLowerCase();
  const elTxt = (el.text || el.fullText || '').trim().toLowerCase();
  if (origTxt && elTxt) {
    if (origTxt === elTxt) {
      score += 70;
    } else if (origTxt.startsWith(elTxt) || elTxt.startsWith(origTxt)) {
      score += 50;
    } else if (origTxt.includes(elTxt) || elTxt.includes(origTxt)) {
      score += 35;
    } else if (origTxt.length > 2 && elTxt.length > 2 && !origTxt.includes(elTxt) && !elTxt.includes(origTxt)) {
      // Different text content! Penalize mismatch to prevent cross-matching different text labels
      score -= 30;
    }
  }

  // Token Jaccard similarity for container / card groups
  if (Array.isArray(orig.words) && Array.isArray(el.words) && orig.words.length > 0 && el.words.length > 0) {
    const origSet = new Set(orig.words.map(w => w.toLowerCase()));
    let overlap = 0;
    for (const w of el.words) {
      if (origSet.has(w.toLowerCase())) overlap++;
    }
    const jaccard = overlap / Math.max(origSet.size, el.words.length);
    score += Math.round(jaccard * 40);
  }

  // Class token overlap
  const origClsStr = safeClassStr(orig.className);
  const elClsStr = safeClassStr(el.className);
  if (origClsStr && elClsStr) {
    const origClasses = new Set(origClsStr.split(/\s+/).filter(Boolean));
    for (const c of elClsStr.split(/\s+/).filter(Boolean)) {
      if (origClasses.has(c) && !['elementor-widget', 'elementor-element'].includes(c)) {
        score += 25;
        break;
      }
    }
  }

  // Spatial alignment (similar vertical and horizontal rank)
  const yDiff = Math.abs(orig.rect.y - el.rect.y);
  if (yDiff < 30) score += 15;
  else if (yDiff < 100) score += 5;

  const xDiff = Math.abs(orig.rect.x - el.rect.x);
  if (xDiff < 30) score += 15;
  else if (xDiff < 100) score += 5;

  return score;
}

function runComputedStyleMatrix(originalMetrics, elementorMetrics, existingDefects = []) {
  const matrixDefects = [];
  const handledKeys = new Set();

  // Populate handled keys from existing macro defects
  existingDefects.forEach(d => {
    if (d.targetId) {
      if (d.property) handledKeys.add(`${d.targetId}_${d.property}`);
      if (d.suggestedFix?.property) handledKeys.add(`${d.targetId}_${d.suggestedFix.property}`);
    }
    if (Array.isArray(d.targetIds)) {
      d.targetIds.forEach(id => {
        if (d.property) handledKeys.add(`${id}_${d.property}`);
        if (d.suggestedFix?.property) handledKeys.add(`${id}_${d.suggestedFix.property}`);
      });
    }
  });

  // Filter elementor nodes that have a valid dataId, excluding intermediate wrapper conduits
  const elNodesWithId = elementorMetrics.filter(m => {
    if (!m.dataId) return false;
    const cls = safeClassStr(m.className);
    if (cls.includes('elementor-widget-container') && !m.hasDirectText) return false;
    if (cls.includes('elementor-widget') && m.tag === 'div' && !m.hasDirectText) return false;
    if (cls.includes('elementor-button-wrapper')) return false;
    if (cls.includes('elementor-button-content-wrapper')) return false;
    if (cls.includes('elementor-icon-wrapper') && !m.hasDirectText) return false;
    return true;
  });

  for (const elNode of elNodesWithId) {
    // Exclude button wrapper divs (visual button styles live on .elementor-button)
    if (elNode.widgetType === 'button' && elNode.tag === 'div') {
      continue;
    }
    // Find highest matching original node
    let bestOrig = null;
    let highestScore = 0;

    for (const origNode of originalMetrics) {
      const score = computeNodeMatchScore(origNode, elNode);
      if (score > highestScore && score >= 40) {
        highestScore = score;
        bestOrig = origNode;
      }
    }

    if (!bestOrig) continue;

    const origStyles = bestOrig.styles || {};
    const elStyles = elNode.styles || {};
    const elCls = safeClassStr(elNode.className);

    // Helper to add direct AST mutation
    const addMutation = (prop, val, severity = 'MEDIUM', msg = '') => {
      const key = `${elNode.dataId}_${prop}`;
      if (handledKeys.has(key)) return;
      handledKeys.add(key);

      matrixDefects.push({
        type: 'DIRECT_AST_MUTATION',
        severity,
        targetId: elNode.dataId,
        property: prop,
        value: val,
        message: msg || `Style matrix delta on ${elNode.tag}.${elCls}: set ${prop}.`
      });
    };

    // Helper to add multiple settings mutation
    const addMultiMutation = (settingsObj, severity = 'HIGH', msg = '') => {
      const firstProp = Object.keys(settingsObj)[0];
      const key = `${elNode.dataId}_${firstProp}`;
      if (handledKeys.has(key)) return;
      Object.keys(settingsObj).forEach(k => handledKeys.add(`${elNode.dataId}_${k}`));

      matrixDefects.push({
        type: 'DIRECT_AST_MUTATION',
        severity,
        targetId: elNode.dataId,
        settings: settingsObj,
        message: msg || `Style matrix multi-delta on ${elNode.tag}.${elCls}.`
      });
    };

    // 0. Skip zero-dimension / invisible nodes (cannot audit visual properties of invisible elements)
    if ((elNode.rect.width === 0 && elNode.rect.height === 0) || (bestOrig.rect.width === 0 && bestOrig.rect.height === 0)) {
      continue;
    }
    if (elStyles.display === 'none' || elStyles.visibility === 'hidden' || origStyles.display === 'none' || origStyles.visibility === 'hidden') {
      continue;
    }

    // 1. Text-Bearing Element Definition:
    // MUST have actual visible text characters (> 0 length) AND must NOT be a pure HTML micro-embed widget
    const hasActualText = (elNode.text || '').trim().length > 0;
    const isTextBearingElement = hasActualText && elNode.widgetType !== 'html' && (
      elNode.hasDirectText ||
      ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'a', 'button', 'li', 'label', 'strong', 'em', 'b', 'i', 'small'].includes(elNode.tag) ||
      elCls.includes('heading-title') || elCls.includes('elementor-button') || elCls.includes('icon-list-text')
    );

    if (isTextBearingElement) {
      // 1. Typography: color
      if (origStyles.color && elStyles.color) {
        const origHex = normalizeColorToHex(origStyles.color).toUpperCase();
        const elHex = normalizeColorToHex(elStyles.color).toUpperCase();
        if (origHex !== elHex && origStyles.color !== 'rgba(0, 0, 0, 0)' && origStyles.color !== 'transparent') {
          const colorProp = elNode.widgetType === 'heading' ? 'title_color'
            : elNode.widgetType === 'button' ? 'button_text_color'
            : elNode.widgetType === 'icon' ? 'primary_color'
            : 'text_color';
          addMutation(colorProp, origHex, 'HIGH', `Color delta: expected ${origHex}, got ${elHex}`);
        }
      }

      // 2. Typography: fontSize
      if (origStyles.fontSize >= 10 && elStyles.fontSize) {
        if (Math.abs(origStyles.fontSize - elStyles.fontSize) >= 2) {
          addMultiMutation({
            typography_typography: 'custom',
            typography_font_size: { unit: 'px', size: Math.round(origStyles.fontSize) }
          }, 'HIGH', `Font size delta: expected ${Math.round(origStyles.fontSize)}px, got ${Math.round(elStyles.fontSize)}px`);
        }
      }

      // 3. Typography: fontWeight
      if (origStyles.fontWeight && elStyles.fontWeight && origStyles.fontWeight !== elStyles.fontWeight) {
        const origW = String(origStyles.fontWeight);
        if (origW === '700' || origW === '800' || origW === '600' || origW === 'bold') {
          addMultiMutation({
            typography_typography: 'custom',
            typography_font_weight: origW === 'bold' ? '700' : origW
          }, 'MEDIUM', `Font weight delta: expected ${origW}, got ${elStyles.fontWeight}`);
        }
      }

      // 4. Typography: letterSpacing
      if (origStyles.letterSpacing && parseFloat(origStyles.letterSpacing) > 0) {
        const origLs = parseFloat(origStyles.letterSpacing);
        const elLs = parseFloat(elStyles.letterSpacing) || 0;
        if (Math.abs(origLs - elLs) >= 0.5) {
          addMultiMutation({
            typography_typography: 'custom',
            typography_letter_spacing: { unit: 'px', size: Math.round(origLs * 10) / 10 }
          }, 'LOW', `Letter spacing delta: expected ${origLs}px`);
        }
      }

      // 5. Typography: textAlign
      if (origStyles.textAlign && !['start', 'initial', 'inherit'].includes(origStyles.textAlign)) {
        if (origStyles.textAlign !== elStyles.textAlign) {
          // Align setting in Elementor exists on heading, text-editor, and button widgets
          if (['heading', 'text-editor'].includes(elNode.widgetType)) {
            addMutation('align', origStyles.textAlign, 'MEDIUM', `Text align delta: expected ${origStyles.textAlign}`);
          } else if (elNode.widgetType === 'button') {
            // In Elementor, align: 'justify' enforces full-width button behavior.
            // Never mutate align to 'center' on a full-width button (which collapses its width).
            const isFullWidthInOrig = (bestOrig.rect.width >= 150) || (bestOrig.styles && bestOrig.styles.width === '100%');
            if (!isFullWidthInOrig) {
              addMutation('align', origStyles.textAlign, 'MEDIUM', `Button align delta: expected ${origStyles.textAlign}`);
            }
          }
        }
      }
    }

    const isButtonElement = elNode.widgetType === 'button' && (elNode.tag === 'a' || elNode.tag === 'button' || elCls.includes('elementor-button')) && elNode.tag !== 'span';
    const isSurfaceOrContainer = (elNode.elType === 'container' || isButtonElement ||
      elCls.includes('card') || elCls.includes('tier') || elCls.includes('pill') || elCls.includes('badge') ||
      ['section', 'header', 'article', 'nav', 'main', 'footer'].includes(elNode.tag)) && elNode.widgetType !== 'html';

    if (isSurfaceOrContainer) {
      // 6. Surface: backgroundColor
      if (origStyles.backgroundColor && origStyles.backgroundColor !== 'rgba(0, 0, 0, 0)' && origStyles.backgroundColor !== 'transparent') {
        const origBgHex = normalizeColorToHex(origStyles.backgroundColor).toUpperCase();
        const elBgHex = normalizeColorToHex(elStyles.backgroundColor).toUpperCase();
        if (origBgHex !== elBgHex && origBgHex !== '#FFFFFF' && elBgHex === '#FFFFFF') {
          if (elNode.elType === 'container') {
            addMultiMutation({
              background_background: 'classic',
              background_color: origBgHex
            }, 'HIGH', `Container background delta: expected ${origBgHex}, got ${elBgHex}`);
          } else if (elNode.widgetType === 'button') {
            addMutation('background_color', origBgHex, 'HIGH', `Button background delta: expected ${origBgHex}`);
          }
        }
      }

      // 7. Surface: boxShadow
      if (origStyles.boxShadow && origStyles.boxShadow !== 'none') {
        if (!elStyles.boxShadow || elStyles.boxShadow === 'none') {
          const parsedShadow = parseBoxShadow(origStyles.boxShadow);
          if (parsedShadow) {
            addMutation('box_shadow_box_shadow', parsedShadow, 'HIGH', `Drop shadow lost on ${elCls || elNode.tag}`);
          }
        }
      }

      // 8. Borders: borderTopWidth & borderTopColor
      if (origStyles.borderTopWidth >= 1 && (!elStyles.borderTopWidth || elStyles.borderTopWidth < 0.5)) {
        const bColor = normalizeColorToHex(origStyles.borderTopColor || '#E2E8F0');
        const bWidth = Math.round(origStyles.borderTopWidth);
        addMultiMutation({
          border_border: origStyles.borderTopStyle || 'solid',
          border_color: bColor,
          border_width: {
            unit: 'px',
            top: String(bWidth),
            right: String(Math.round(origStyles.borderRightWidth || bWidth)),
            bottom: String(Math.round(origStyles.borderBottomWidth || bWidth)),
            left: String(Math.round(origStyles.borderLeftWidth || bWidth)),
            isLinked: true
          }
        }, 'HIGH', `Border lost on ${elCls || elNode.tag}: restored ${bWidth}px ${bColor}`);
      }

      // 9. Radii: borderTopLeftRadius
      if (origStyles.borderTopLeftRadius >= 3) {
        const elRadius = elStyles.borderTopLeftRadius || 0;
        if (Math.abs(origStyles.borderTopLeftRadius - elRadius) >= 3) {
          const rVal = Math.round(origStyles.borderTopLeftRadius);
          addMutation('border_radius', {
            unit: 'px',
            top: String(rVal),
            right: String(Math.round(origStyles.borderTopRightRadius || rVal)),
            bottom: String(Math.round(origStyles.borderBottomRightRadius || rVal)),
            left: String(Math.round(origStyles.borderBottomLeftRadius || rVal)),
            isLinked: true
          }, 'MEDIUM', `Border radius delta: restored ${rVal}px`);
        }
      }
    }

    // 10. Spacing: Container padding
    if (elNode.elType === 'container' && origStyles.paddingTop >= 8) {
      const elPadTop = elStyles.paddingTop || 0;
      if (Math.abs(origStyles.paddingTop - elPadTop) >= 8) {
        addMutation('padding', {
          unit: 'px',
          top: String(Math.round(origStyles.paddingTop)),
          right: String(Math.round(origStyles.paddingRight || origStyles.paddingTop)),
          bottom: String(Math.round(origStyles.paddingBottom || origStyles.paddingTop)),
          left: String(Math.round(origStyles.paddingLeft || origStyles.paddingTop)),
          isLinked: origStyles.paddingTop === origStyles.paddingRight
        }, 'MEDIUM', `Padding delta on container: restored ~${Math.round(origStyles.paddingTop)}px`);
      }
    }

    // 11. Spacing: Container flex gap
    if (elNode.elType === 'container' && (origStyles.rowGap >= 8 || origStyles.columnGap >= 8)) {
      const elRowGap = elStyles.rowGap || 0;
      const elColGap = elStyles.columnGap || 0;
      if (elRowGap < 4 && elColGap < 4) {
        addMutation('gap', {
          unit: 'px',
          row: String(Math.round(origStyles.rowGap || 16)),
          column: String(Math.round(origStyles.columnGap || 16)),
          isLinked: origStyles.rowGap === origStyles.columnGap
        }, 'MEDIUM', `Flex gap delta: restored ${Math.round(origStyles.columnGap || origStyles.rowGap || 16)}px gap`);
      }
    }

    // 12. Flexbox: Container Direction & Align
    if (elNode.elType === 'container' && origStyles.display === 'flex') {
      if (origStyles.flexDirection === 'row' && elStyles.flexDirection === 'column' && bestOrig.rect.width >= 500) {
        addMultiMutation({
          direction: 'row',
          flex_direction: 'row',
          wrap: 'nowrap',
          flex_wrap: 'nowrap'
        }, 'CRITICAL', `Flex row stacking mismatch on container`);
      }
    }

    // 13. Universal Geometry Collapse Guardian (Flexbox Blockification Loss Recovery)
    // Agnostic & universal: If ANY element in the original page had meaningful dimensions (width >= 15),
    // but in Elementor collapsed by >= 40% because its display became 'inline' inside an Elementor wrapper:
    const effectiveWidth = (elNode.envelopeRect && elNode.envelopeRect.width > 0) ? elNode.envelopeRect.width : elNode.rect.width;
    if (bestOrig.rect.width >= 15 && effectiveWidth < bestOrig.rect.width * 0.6) {
      if (['inline', 'contents'].includes(elStyles.display) && ['block', 'inline-block', 'flex', 'inline-flex'].includes(origStyles.display)) {
        const validOrigClasses = (bestOrig.className || '').split(' ').filter(c => c && !c.startsWith('elementor-') && !c.startsWith('e-'));
        const targetCls = validOrigClasses[0] || (elNode.className ? elNode.className.split(/\s+/).filter(c => !c.startsWith('elementor-') && !c.startsWith('e-'))[0] : '') || '';
        const cleanSid = (elNode.sid || elNode.dataSid) ? String(elNode.sid || elNode.dataSid).replace(/^sid-/, '') : '';
        const selector = targetCls ? `.${targetCls}` : (cleanSid ? `.e-sid-${cleanSid}` : (elNode.dataId ? `.e-sid-${elNode.dataId}` : null));
        if (!selector) continue;
        const restoredDisplay = origStyles.display === 'flex' ? 'inline-flex' : 'inline-block';

        matrixDefects.push({
          type: 'GEOMETRY_COLLAPSE',
          severity: 'CRITICAL',
          targetId: elNode.dataId,
          suggestedFix: {
            property: 'display_blockification',
            selector,
            targetClass: targetCls,
            display: restoredDisplay,
            width: Math.round(bestOrig.rect.width),
            height: Math.round(bestOrig.rect.height)
          },
          message: `Geometry collapse on ${elNode.tag}${targetCls ? '.' + targetCls : ''}: collapsed from ${Math.round(bestOrig.rect.width)}px to ${Math.round(effectiveWidth)}px due to flexbox blockification loss. Enforcing ${restoredDisplay}.`
        });
      }
    }
  }

  return matrixDefects;
}

module.exports = {
  compareDomMetrics,
  runComputedStyleMatrix,
  getContrastRatio,
  normalizeColorToHex
};

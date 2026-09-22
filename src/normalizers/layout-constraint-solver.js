/**
 * @deprecated Legacy v0.4 Fallback Normalizer.
 * In V2, Single-Pass Geometric Mapping (src/smart/geometry-mapper.js) natively preserves geometry.
 * Retained strictly as fallback for offline/legacy AST pipeline.
 */
/**
 * [LEGACY OFFLINE FALLBACK] Elementor Box-Model Math & Layout Constraint Solver.
 * Implements mathematical layout solving for multi-column flex rows,
 * preventing accidental line-wrapping on desktop viewports while guaranteeing
 * 100% responsive column stacking on mobile.
 * 
 * Note: In V2 "Single-Pass + Verify", geometric flex rows are mapped directly from
 * Chromium bounding rects via geometry-mapper.js. This module is retained exclusively
 * as an offline AST fallback.
 */

/**
 * Solves multi-column flex row widths mathematically:
 * Sum(Width_i) + Total_Gaps <= 100%
 */
function solveFlexRowConstraints(container, containerWidth = 1200) {
  if (!container || container.elType !== 'container' || !Array.isArray(container.elements)) {
    return;
  }

  const s = container.settings || {};
  const isRow = s.direction === 'row' || s.flex_direction === 'row';

  if (isRow && container.elements.length >= 2) {
    const children = container.elements.filter(c => c && typeof c === 'object');
    const childCount = children.length;

    // Detect gap in pixels
    let gapPx = 0;
    if (s.gap && typeof s.gap.size === 'number') {
      gapPx = s.gap.size;
    } else if (typeof s.space_between_widgets === 'number') {
      gapPx = s.space_between_widgets;
    }

    const totalGapPx = gapPx * (childCount - 1);
    const totalGapPct = (totalGapPx / containerWidth) * 100;

    // Check if children have percentage widths
    const pctChildren = children.filter(c => c.settings && c.settings.width && c.settings.width.unit === '%');

    const isExplicitGridOrCards = (s._css_classes || '').includes('grid') || (s.css_classes || '').includes('grid') ||
                                  (s._css_classes || '').includes('gallery') || (s._css_classes || '').includes('cards');
    const areChildrenContainers = children.every(c => c.elType === 'container');
    const isLockup = (s._css_classes || '').includes('lockup') || (s._css_classes || '').includes('price') ||
                     (s._css_classes || '').includes('badge') || (s._css_classes || '').includes('pill') ||
                     s.wrap === 'nowrap' || s.flex_wrap === 'nowrap';

    if (pctChildren.length >= 2 && pctChildren.length === childCount) {
      const currentSum = pctChildren.reduce((sum, c) => sum + c.settings.width.size, 0);

      // If sum of widths + gap exceeds 98%, rebalance proportionally
      if (currentSum + totalGapPct > 98) {
        const availablePct = Math.max(80, 100 - totalGapPct - 1.5); // 1.5% safety buffer
        let allocatedSum = 0;

        for (let i = 0; i < pctChildren.length; i++) {
          const child = pctChildren[i];
          if (i === pctChildren.length - 1) {
            // Last child takes remainder to avoid rounding drift
            child.settings.width.size = Math.floor(availablePct - allocatedSum);
          } else {
            const proportional = Math.floor((child.settings.width.size / currentSum) * availablePct);
            child.settings.width.size = proportional;
            allocatedSum += proportional;
          }
          child.settings._element_width = 'initial';
          child.settings.flex_shrink = childCount <= 4 ? 1 : 0;
          // Ensure 100% width on mobile
          child.settings.width_mobile = { unit: '%', size: 100 };
        }
        if (childCount <= 4) {
          s.wrap = 'nowrap';
          s.flex_wrap = 'nowrap';
          s.direction_mobile = 'column';
          s.flex_direction_mobile = 'column';
        }
      }
    } else if (!isLockup && areChildrenContainers && (isExplicitGridOrCards || s.wrap === 'wrap' || s.flex_wrap === 'wrap' || (!pctChildren.length && childCount >= 3))) {
      // Universal Mathematical Multi-Column Wrapping Grid Solver
      let targetCols = 3;
      if (childCount === 2) targetCols = 2;
      else if (childCount === 4 || childCount === 8) targetCols = 4;
      else if (childCount % 3 === 0 || childCount >= 5) targetCols = 3;

      const effectiveGap = gapPx || 24;
      const rowGapPct = (effectiveGap * (targetCols - 1) / containerWidth) * 100;
      const availablePct = Math.max(70, 100 - rowGapPct - 0.5);
      const colWidthPct = Math.floor((availablePct / targetCols) * 10) / 10;

      const tabletCols = Math.min(targetCols, 2);
      const tabletGapPct = (effectiveGap * (tabletCols - 1) / 768) * 100;
      const tabletColWidthPct = tabletCols === 2 ? Math.floor(((100 - tabletGapPct - 0.5) / 2) * 10) / 10 : 100;

      const isSingleRowOnDesktop = childCount <= targetCols;
      s.direction = 'row';
      s.flex_direction = 'row';
      s.wrap = isSingleRowOnDesktop ? 'nowrap' : 'wrap';
      s.flex_wrap = isSingleRowOnDesktop ? 'nowrap' : 'wrap';
      s.align_items = 'stretch';
      s.flex_align_items = 'stretch';

      // Mobile Responsive Stacking
      s.direction_mobile = 'column';
      s.flex_direction_mobile = 'column';
      s.wrap_mobile = 'wrap';
      s.flex_wrap_mobile = 'wrap';

      if (!s.gap) {
        s.gap = { unit: 'px', size: effectiveGap, column: effectiveGap, row: effectiveGap };
        s.flex_gap = { unit: 'px', size: effectiveGap, column: effectiveGap, row: effectiveGap };
        s.space_between_widgets = effectiveGap;
      }

      for (const child of children) {
        if (!child.settings) child.settings = {};
        child.settings.width = { unit: '%', size: colWidthPct };
        child.settings.width_tablet = { unit: '%', size: tabletColWidthPct };
        child.settings.width_mobile = { unit: '%', size: 100 };
        child.settings._element_width = 'initial';
        child.settings.flex_shrink = isSingleRowOnDesktop ? 1 : 0;
        child.settings.flex_grow = isSingleRowOnDesktop ? 1 : 0;
        if (child.elType === 'container') {
          child.settings.content_width = 'full';
          child.settings.justify_content = 'space-between';
          child.settings.flex_justify_content = 'space-between';
        }
      }
    } else if (childCount === 2 && children.every(c => c.elType === 'container')) {
      const c0 = children[0];
      const c1 = children[1];
      const c0s = c0.settings || (c0.settings = {});
      const c1s = c1.settings || (c1.settings = {});

      function isIntrinsicComponent(container) {
        if (!container || container.elType !== 'container') return false;
        const cs = container.settings || {};
        if (cs.width?.size === 'fit-content' || cs._element_width === 'auto') return true;
        const topRadius = parseInt(cs.border_radius?.top, 10) || 0;
        const isRounded = topRadius >= 8 || cs.border_radius?.top === '9999';
        const topPad = parseInt(cs.padding?.top, 10);
        const isCompactPadding = !isNaN(topPad) && topPad <= 12;
        const hasPackaging = !!(cs.background_color || cs.background_background || cs.border_border);
        if (hasPackaging && (isRounded || isCompactPadding)) return true;
        if (cs.direction === 'row' && isCompactPadding) return true;
        const cls = (cs.css_classes || cs._css_classes || '').toLowerCase();
        if (cls.match(/\b(badge|pill|tag|counter|switcher|chip|indicator)\b/)) return true;
        return false;
      }

      const isC0Pill = isIntrinsicComponent(c0);
      const isC1Pill = isIntrinsicComponent(c1);

      if (isC0Pill && isC1Pill) {
        c0s.content_width = 'full';
        c0s.width = { unit: 'custom', size: 'fit-content' };
        c0s._flex_size = 'none';
        c0s.flex_shrink = 0;
        c0s._element_width = 'auto';

        c1s.content_width = 'full';
        c1s.width = { unit: 'custom', size: 'fit-content' };
        c1s._flex_size = 'none';
        c1s.flex_shrink = 0;
        c1s._element_width = 'auto';
      } else if (isC1Pill && !isC0Pill) {
        c1s.content_width = 'full';
        c1s.width = { unit: 'custom', size: 'fit-content' };
        c1s._flex_size = 'none';
        c1s.flex_shrink = 0;
        c1s._element_width = 'auto';
        c0s.flex_grow = 1;
        delete c0s.width;
      } else if (isC0Pill && !isC1Pill) {
        c0s.content_width = 'full';
        c0s.width = { unit: 'custom', size: 'fit-content' };
        c0s._flex_size = 'none';
        c0s.flex_shrink = 0;
        c0s._element_width = 'auto';
        c1s.flex_grow = 1;
        delete c1s.width;
      } else if (s.justify_content === 'space-between') {
        c0s.content_width = 'full';
        c0s.width = { unit: 'custom', size: 'fit-content' };
        c0s._flex_size = 'none';
        c0s.flex_shrink = 0;
        c0s._element_width = 'auto';

        c1s.content_width = 'full';
        c1s.width = { unit: 'custom', size: 'fit-content' };
        c1s._flex_size = 'none';
        c1s.flex_shrink = 0;
        c1s._element_width = 'auto';
      } else {
        // Dual column structural cards: calculate mathematically balanced width from container gap
        const effectiveGap = gapPx || 24;
        const gapPct = (effectiveGap / containerWidth) * 100;
        const halfCol = Math.floor(((100 - gapPct - 0.5) / 2) * 10) / 10;
        if (!c0s.width || c0s.width.unit !== '%') {
          c0s.width = { unit: '%', size: halfCol };
          c0s.width_mobile = { unit: '%', size: 100 };
          c0s._element_width = 'initial';
          c0s.flex_shrink = 0;
        }
        if (!c1s.width || c1s.width.unit !== '%') {
          c1s.width = { unit: '%', size: halfCol };
          c1s.width_mobile = { unit: '%', size: 100 };
          c1s._element_width = 'initial';
          c1s.flex_shrink = 0;
        }
      }
    }

    // Milestone row distribution: evenly distribute items in space-between rows
    if (s.justify_content === 'space-between' && childCount >= 3) {
      for (const child of children) {
        if (child.elType === 'container') {
          child.settings = child.settings || {};
          child.settings.content_width = 'full';
          child.settings.width = { unit: 'custom', size: 'fit-content' };
          child.settings._flex_size = 'none';
          child.settings.flex_shrink = 0;
          child.settings._element_width = 'auto';
          child.settings.align_items = 'center';
        }
      }
    }

    // Expand sibling content containers when paired with fixed-width boxes (e.g. icon-box + addon-info)
    const hasFixedChild = s.justify_content !== 'space-between' && children.some(c => {
      const cs = c.settings || {};
      return (cs.min_width && cs.min_width.size <= 60) ||
             (cs.width && cs.width.unit === 'px' && cs.width.size <= 60) ||
             c.widgetType === 'icon' ||
             (cs.css_classes || '').includes('switch');
    });
    if (hasFixedChild) {
      for (const child of children) {
        const cs = child.settings || {};
        const isFixed = (cs.min_width && cs.min_width.size <= 60) ||
                        (cs.width && cs.width.unit === 'px' && cs.width.size <= 60) ||
                        child.widgetType === 'icon' || (cs.css_classes || '').includes('switch');
        if (!isFixed && child.elType === 'container' && !cs.width) {
          child.settings.flex_grow = 1;
          child.settings._flex_size = 'grow';
        }
      }
    }

    // Price row lockup: keep all elements inline without stretching
    const rawCls = (s.css_classes || s._css_classes || '').toLowerCase();
    if (rawCls.includes('price-row') || rawCls.includes('price-lockup')) {
      s.direction = 'row';
      s.flex_direction = 'row';
      s.align_items = 'baseline';
      s.flex_align_items = 'baseline';
      s.justify_content = 'flex-start';
      s.flex_justify_content = 'flex-start';
      for (const child of children) {
        child.settings = child.settings || {};
        child.settings._element_width = 'auto';
        child.settings._flex_size = 'none';
        child.settings.flex_shrink = 0;
      }
    }
  }

  // Sanitize invalid pixel widths on containers (Elementor Container schema only supports % or fit-content)
  if (container.elType === 'container') {
    if (s.width && s.width.unit === 'px') {
      const pxSize = s.width.size;
      if (pxSize <= 60) {
        s.content_width = 'full';
        s.width = { unit: 'custom', size: 'fit-content' };
        s.min_width = { unit: 'px', size: pxSize };
        s.max_width = { unit: 'px', size: pxSize };
        s._flex_size = 'none';
        s.flex_shrink = 0;
        s._element_width = 'auto';
      } else if (container.isInner) {
        delete s.width;
        s._element_width = 'auto';
      }
    }
  }

  // Recurse into children
  for (const child of container.elements) {
    solveFlexRowConstraints(child, containerWidth);
  }
}

/**
 * Main Layout Constraint Solver entrypoint.
 */
function solveLayoutConstraints(rootElements = [], boxedWidth = 1200) {
  if (!Array.isArray(rootElements)) return rootElements;
  for (const root of rootElements) {
    solveFlexRowConstraints(root, boxedWidth || 1200);
  }
  return rootElements;
}

module.exports = {
  solveLayoutConstraints,
  solveFlexRowConstraints
};

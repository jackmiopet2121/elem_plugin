/**
 * @deprecated Legacy v0.4 Fallback Normalizer.
 * In V2, Single-Pass Geometric Mapping (src/smart/geometry-mapper.js) natively preserves geometry.
 * Retained strictly as fallback for offline/legacy AST pipeline.
 */
/**
 * Structural Normalizer Guardrail (RULES: interactiveRowTriggerContract, crossVersionFlexParity, elementorFlexCollapseEngine).
 * Autonomous, universal structural heuristics for interactive components (Disclosures, Drawers, Dropdowns, Cards).
 * Completely agnostic across ALL landing page types, component names, and design systems.
 */

const { getFa5Equivalent } = require('../core/rules-engine');

const zeroPadding = {
  unit: 'px',
  top: '0',
  right: '0',
  bottom: '0',
  left: '0',
  isLinked: true
};

function normalizeElementorContainerParity(container) {
  if (!container || container.elType !== 'container' || !container.settings) return;
  const s = container.settings;

  // 1. Flex Direction parity
  if (s.flex_direction && !s.direction) s.direction = s.flex_direction;
  if (s.direction && !s.flex_direction) s.flex_direction = s.direction;

  // 2. Justify Content parity
  if (s.flex_justify_content && !s.justify_content) s.justify_content = s.flex_justify_content;
  if (s.justify_content && !s.flex_justify_content) s.flex_justify_content = s.justify_content;

  // 3. Align Items parity
  if (s.flex_align_items && !s.align_items) s.align_items = s.flex_align_items;
  if (s.align_items && !s.flex_align_items) s.flex_align_items = s.align_items;

  // 4. Flex Wrap parity
  if (s.flex_wrap && !s.wrap) s.wrap = s.flex_wrap;
  if (s.wrap && !s.flex_wrap) s.flex_wrap = s.wrap;

  // 5. Align Self parity
  if (s.align_self && !s.flex_align_self) s.flex_align_self = s.align_self;
  if (s.flex_align_self && !s.align_self) s.align_self = s.flex_align_self;
  if (s.align_self && !s._flex_align_self) s._flex_align_self = s.align_self;

  // 6. Classes parity
  if (s.css_classes && !s._css_classes) s._css_classes = s.css_classes;
  if (s._css_classes && !s.css_classes) s.css_classes = s._css_classes;

  // 7. Box Model parity
  if (s.margin && !s._margin) s._margin = s.margin;
  if (s.padding && !s._padding) s._padding = s.padding;
}

function normalizeStructuralIntegrity(rootElements) {
  if (!Array.isArray(rootElements)) return;

  const collapsibleCards = [];

  function scanAndNormalize(el, parent = null) {
    if (!el) return;

    if (el.elType === 'container') {
      normalizeElementorContainerParity(el);
      const s = el.settings || {};
      const classes = (s.css_classes || s._css_classes || '').toLowerCase();

      // Detect Disclosure / Card Containers generically
      const isExplicitCollapsible = classes.includes('toggle-item') || classes.includes('collapse-item') || classes.includes('disclosure-item') || classes.includes('expand-item');
      const hasCollapsibleChild = Array.isArray(el.elements) && el.elements.some(c => {
        const cs = (c.settings?.css_classes || c.settings?._css_classes || '').toLowerCase();
        return cs.includes('trigger') || cs.includes('toggle') || cs.includes('collapse') || cs.includes('drawer-content');
      });
      const isCollapsibleCard = isExplicitCollapsible || ((classes.includes('card') || classes.includes('item')) && hasCollapsibleChild);

      if (isCollapsibleCard) {
        collapsibleCards.push(el);
        s.content_width = 'full';
        s.direction = 'column';
        s.flex_direction = 'column';
      } else if (
        /(?:^|\s)(?:[a-z0-9_-]+-card|card|pricing-plan|plan-box)(?:\s|$)/i.test(classes) &&
        !/(?:^|\s)[a-z0-9_-]*(?:meta|tags?|badges?|pills?|actions?|header|footer|row|switcher|toggle)[a-z0-9_-]*(?:\s|$)/i.test(classes) &&
        !classes.includes('item') && !classes.includes('toggle') && !classes.includes('switch')
      ) {
        // Main vertical cards (portfolio-card, pricing-card, plan-card)
        const isHorizontalCard = classes.includes('horizontal') || classes.includes('row') || classes.includes('addon');
        if (!isHorizontalCard) {
          s.content_width = 'full';
          // Respect sovereign CSS/AST row direction (never overwrite a resolved row to column)
          if (s.direction !== 'row') {
            s.direction = 'column';
            s.flex_direction = 'column';
          }

          // Child containers of vertical cards (e.g. card-media, card-body) must stack vertically unless they are rows/tags/meta
          if (Array.isArray(el.elements)) {
            for (const child of el.elements) {
              if (child.elType === 'container') {
                const cs = child.settings || (child.settings = {});
                const childCls = (cs.css_classes || cs._css_classes || '').toLowerCase();
                const isChildRow = cs.direction === 'row' || /(?:meta|tags?|badges?|pills?|actions?|links?)/i.test(childCls);
                if (!isChildRow && (childCls.includes('body') || childCls.includes('content') || childCls.includes('info'))) {
                  cs.direction = 'column';
                  cs.flex_direction = 'column';
                }
              }
            }
          }
        }
      } else {
        // Generic Icon + Text row detection (e.g. feature-item, checklist, trust badge)
        const hasIconChild = Array.isArray(el.elements) && el.elements.some(c => c.widgetType === 'icon' || (c.widgetType === 'html' && (c.settings?.html || '').includes('<svg')));
        const hasTextChild = Array.isArray(el.elements) && el.elements.some(c => c.widgetType === 'heading' || c.widgetType === 'text-editor');
        if (hasIconChild && hasTextChild && el.elements.length <= 3) {
          s.direction = 'row';
          s.flex_direction = 'row';
          s.align_items = s.align_items || 'center';
          s.flex_align_items = s.flex_align_items || 'center';
          s.wrap = 'nowrap';
          s.flex_wrap = 'nowrap';
        }
      }

      // Multi-Column Grid Containers (e.g. .calc-grid, .pg-grid, .grid, .dual-col, .columns, or container with 2+ cards)
      const isCardSubComponent = /(?:^|\s)[a-z0-9_-]*(?:meta|tags?|badges?|pills?|actions?|header|footer|row|switcher|toggle)[a-z0-9_-]*(?:\s|$)/i.test(classes);
      const isCardItself = !isCardSubComponent && (classes.includes('card') || classes.includes('item'));
      const isGridContainer = !isCardItself && (classes.includes('grid') || classes.includes('columns') || classes.includes('dual-col') || classes.includes('two-col'));
      const hasMultipleCards = !isCardItself && Array.isArray(el.elements) && el.elements.filter(c => {
        const cs = (c.settings?.css_classes || c.settings?._css_classes || '').toLowerCase();
        const isSub = cs.includes('media') || cs.includes('body') || cs.includes('header') || cs.includes('footer') || cs.includes('content');
        return !isSub && (cs.match(/\b(card|col)\b/) || cs.includes('controls'));
      }).length >= 2;

      if (isGridContainer || hasMultipleCards) {
        s.content_width = 'full';
        s.direction = 'row';
        s.flex_direction = 'row';
        s.wrap = 'wrap';
        s.flex_wrap = 'wrap';
        s.direction_mobile = 'column';
        s.flex_direction_mobile = 'column';
        s.justify_content = s.justify_content || 'center';
        s.flex_justify_content = s.flex_justify_content || 'center';
        if (!s.gap) {
          s.gap = { unit: 'px', size: 24, column: 24, row: 24 };
          s.flex_gap = { unit: 'px', size: 24, column: 24, row: 24 };
          s.space_between_widgets = 24;
        }

        // Calibrate responsive widths of child cards mathematically if not already set by CSS
        if (Array.isArray(el.elements) && el.elements.length >= 2) {
          const childCount = el.elements.length;
          if (childCount === 2) {
            const c0 = el.elements[0];
            const c1 = el.elements[1];
            const gapVal = (s.gap && typeof s.gap.size === 'number') ? s.gap.size : 24;
            const gapPct = (gapVal / 1200) * 100;
            const halfCol = Math.floor(((100 - gapPct - 0.5) / 2) * 10) / 10;
            if (c0.settings && !c0.settings.width) {
              c0.settings.width = { unit: '%', size: halfCol };
              c0.settings.width_mobile = { unit: '%', size: 100 };
              c0.settings._element_width = 'initial';
            }
            if (c1.settings && !c1.settings.width) {
              c1.settings.width = { unit: '%', size: halfCol };
              c1.settings.width_mobile = { unit: '%', size: 100 };
              c1.settings._element_width = 'initial';
            }
          } else {
            // Multi-item grid (3, 4, 6, 8, etc.)
            let targetCols = 3;
            if (childCount === 4 || childCount === 8) targetCols = 4;
            else if (childCount % 3 === 0 || childCount >= 5) targetCols = 3;

            const gapVal = (s.gap && typeof s.gap.size === 'number') ? s.gap.size : 24;
            const gapPct = (gapVal * (targetCols - 1) / 1200) * 100;
            const colWidth = Math.floor(((100 - gapPct - 0.5) / targetCols) * 10) / 10;
            const tabletCols = Math.min(targetCols, 2);
            const tabletGapPct = (gapVal * (tabletCols - 1) / 768) * 100;
            const tabletWidth = tabletCols === 2 ? Math.floor(((100 - tabletGapPct - 0.5) / 2) * 10) / 10 : 100;

            for (const child of el.elements) {
              if (child.settings && !child.settings.width) {
                child.settings.width = { unit: '%', size: colWidth };
                child.settings.width_tablet = { unit: '%', size: tabletWidth };
                child.settings.width_mobile = { unit: '%', size: 100 };
                child.settings._element_width = 'initial';
                child.settings.flex_shrink = 0;
              }
            }
          }
        }
      }

      // Detect Trigger Row generically (Container with heading/text on left and chevron/toggle icon on right)
      const parentClasses = (parent && parent.settings ? (parent.settings.css_classes || parent.settings._css_classes || '') : '').toLowerCase();
      const isInsideCard = parentClasses.includes('card') || parentClasses.includes('item') || parentClasses.includes('disclosure');
      const isBadge = classes.includes('badge') || classes.includes('pill') || classes.includes('tag');
      const isActionLink = classes.includes('link') || classes.includes('btn') || classes.includes('button') || classes.includes('cta') || classes.includes('action') || classes.includes('more');

      const isTrigger = !isBadge && !isActionLink && (
        classes.includes('trigger') ||
        classes.includes('toggle-header') ||
        classes.includes('toggle-btn') ||
        classes.includes('collapse-btn')
      );

      if (isActionLink) {
        s.direction = 'row';
        s.flex_direction = 'row';
        s.align_items = 'center';
        s.flex_align_items = 'center';
        s.justify_content = s.justify_content || 'flex-start';
        s.flex_justify_content = s.flex_justify_content || s.justify_content;
        s.wrap = 'nowrap';
        s.flex_wrap = 'nowrap';
        if (!s.gap) {
          s.gap = { unit: 'px', size: 8, column: 8, row: 8 };
          s.flex_gap = { unit: 'px', size: 8, column: 8, row: 8 };
          s.space_between_widgets = 8;
        }
        if (Array.isArray(el.elements)) {
          for (const child of el.elements) {
            if (child.widgetType === 'icon' && child.settings) {
              child.settings.view = 'default';
              delete child.settings.shape;
              delete child.settings.icon_padding;
              child.settings._element_width = 'auto';
              child.settings._flex_size = 'none';
              child.settings.flex_shrink = 0;
            }
            if ((child.widgetType === 'heading' || child.widgetType === 'text-editor') && child.settings) {
              child.settings._element_width = 'auto';
              child.settings._flex_size = 'none';
              child.settings.flex_shrink = 0;
            }
          }
        }
      }

      if (isBadge) {
        s.direction = 'row';
        s.flex_direction = 'row';
        s.align_items = 'center';
        s.flex_align_items = 'center';
        s.wrap = 'nowrap';
        s.flex_wrap = 'nowrap';
        if (!s.gap) {
          s.gap = { unit: 'px', size: 8, column: 8, row: 8 };
          s.flex_gap = { unit: 'px', size: 8, column: 8, row: 8 };
          s.space_between_widgets = 8;
        }
        if (Array.isArray(el.elements)) {
          for (const child of el.elements) {
            if (child.widgetType === 'icon' && child.settings) {
              child.settings.view = 'default';
              delete child.settings.shape;
              child.settings.size = child.settings.size || { unit: 'px', size: 12 };
            }
          }
        }
      }

      if (isTrigger) {
        s.content_width = 'full';
        s.width = { unit: '%', size: 100 };
        s.direction = 'row';
        s.flex_direction = 'row';
        s.justify_content = 'space-between';
        s.flex_justify_content = 'space-between';
        s.align_items = 'center';
        s.flex_align_items = 'center';
        s.wrap = 'nowrap';
        s.flex_wrap = 'nowrap';

        // Ensure heading is left (index 0) and icon is right (index 1)
        if (Array.isArray(el.elements) && el.elements.length === 2) {
          const hIdx = el.elements.findIndex(c => c.widgetType === 'heading' || c.widgetType === 'text-editor');
          const iIdx = el.elements.findIndex(c => c.widgetType === 'icon');
          if (hIdx === 1 && iIdx === 0) {
            const temp = el.elements[0];
            el.elements[0] = el.elements[1];
            el.elements[1] = temp;
          }
        }

        // Calibrate children inside trigger
        if (Array.isArray(el.elements)) {
          for (const child of el.elements) {
            const cs = child.settings || (child.settings = {});
            if (child.widgetType === 'heading' || child.widgetType === 'text-editor') {
              cs._flex_size = 'auto';
              cs._element_width = 'initial';
              cs.typography_typography = 'custom';
              cs.typography_font_weight = cs.typography_font_weight || '700';
              if (!cs.typography_font_size) {
                cs.typography_font_size = { unit: 'px', size: 17 };
              }
              cs.title_color = cs.title_color || '#0F172A';
              if (!cs._margin) {
                cs._margin = { unit: 'px', top: '0', right: '0', bottom: '0', left: '0', isLinked: true };
              }
            } else if (child.widgetType === 'icon') {
              cs.view = 'stacked';
              cs.shape = 'circle';
              if (!cs.selected_icon) {
                cs.selected_icon = { value: 'fas fa-chevron-down', library: 'fa-solid' };
              }
              cs.size = cs.size || { unit: 'px', size: 12 };
              cs.icon_padding = cs.icon_padding || { unit: 'px', size: 8 };
              cs.primary_color = cs.primary_color || '#F8FAFC';
              cs.secondary_color = cs.secondary_color || '#64748B';
              cs._flex_size = 'none';
              cs.flex_shrink = 0;
              cs._element_width = 'auto';
            }
          }
        }
      }

      // Detect Collapsible Body generically (drawers, collapse)
      const isCollapse = (
        classes.includes('collapse') ||
        classes.includes('drawer-content') ||
        classes.includes('toggle-content') ||
        classes.includes('collapsible') ||
        classes.includes('expandable')
      );

      if (isCollapse) {
        s.content_width = 'full';
        s.direction = 'column';
        s.flex_direction = 'column';
        s.padding = { ...zeroPadding };
        s._padding = { ...zeroPadding };
        s.padding_tablet = { ...zeroPadding };
        s.padding_mobile = { ...zeroPadding };
      }
    }

    // Inspect Icon Widgets (FA6 to FA5 Universal Translation)
    if (el.elType === 'widget' && el.widgetType === 'icon' && el.settings) {
      if (el.settings.icon && el.settings.icon.value) {
        el.settings.icon.value = getFa5Equivalent(el.settings.icon.value);
      }
      if (el.settings.selected_icon && el.settings.selected_icon.value) {
        el.settings.selected_icon.value = getFa5Equivalent(el.settings.selected_icon.value);
      }
    }

    // Inspect HTML Widgets (Styles & Scripts)
    if (el.elType === 'widget' && el.widgetType === 'html' && el.settings && el.settings.html) {
      let code = el.settings.html;

      // 1. Resolve CSS Grid collapse bug for Elementor Flexbox (Universal Adapter)
      if (code.includes('<style>') || code.includes(':root') || code.includes('collapse')) {
        const universalCollapseCss = `
/* UNIVERSAL ELEMENTOR FLEXBOX COLLAPSE ENGINE */
[class*="collapse"], [class*="collapsible-content"], [class*="drawer-content"] {
  max-height: 0 !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
  opacity: 0 !important;
  overflow: hidden !important;
  visibility: hidden !important;
  transition: max-height 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease, padding 0.35s cubic-bezier(0.16, 1, 0.3, 1) !important;
  pointer-events: none !important;
}
.is-open > [class*="collapse"],
.is-open [class*="collapse"],
.active > [class*="collapse"],
.active [class*="collapse"],
[class*="card"].is-open [class*="collapse"],
[class*="card"].active [class*="collapse"],
[class*="item"].is-open [class*="collapse"],
[class*="item"].active [class*="collapse"],
[class*="disclosure"].is-open [class*="content"],
[class*="disclosure"].active [class*="content"] {
  max-height: 1200px !important;
  padding-bottom: 24px !important;
  opacity: 1 !important;
  visibility: visible !important;
  pointer-events: auto !important;
}
[class*="indicator"] .elementor-icon,
[class*="chevron"] .elementor-icon,
[class*="toggle-icon"] .elementor-icon {
  background-color: #F8FAFC !important;
  border: 1px solid #E2E8F0 !important;
  border-radius: 9999px !important;
  width: 36px !important;
  height: 36px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  color: #64748B !important;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
}
.is-open [class*="indicator"] .elementor-icon,
.active [class*="indicator"] .elementor-icon,
.is-open [class*="chevron"] .elementor-icon,
.active [class*="chevron"] .elementor-icon {
  background-color: rgba(37, 99, 235, 0.08) !important;
  border-color: rgba(37, 99, 235, 0.25) !important;
  color: #2563EB !important;
  transform: rotate(180deg) !important;
}
@media (max-width: 767px) {
  .is-open > [class*="collapse"],
  .is-open [class*="collapse"],
  .active > [class*="collapse"],
  .active [class*="collapse"] {
    padding-bottom: 20px !important;
  }
  [class*="footer"], [class*="cta-box"], [class*="bottom-bar"] {
    align-items: stretch !important;
  }
  [class*="footer-btn"], [class*="cta-btn"] {
    width: 100% !important;
  }
  [class*="footer-btn"] .elementor-button, [class*="cta-btn"] .elementor-button {
    width: 100% !important;
    justify-content: center !important;
  }
}
`;
        if (!code.includes('UNIVERSAL ELEMENTOR FLEXBOX COLLAPSE ENGINE')) {
          code = code.replace('</style>', universalCollapseCss + '\n</style>');
        }
        el.settings.html = code;
      } else if (code.includes('<script>')) {
        // 2. Universal Card Toggle Delegation Bridge for containers wrapping form checkboxes/radios
        if (!code.includes('__universalCardToggleAttached') && !code.includes('initDynamicComponentLogic')) {
          const universalToggleScript = `
(function() {
  'use strict';
  function initUniversalCardToggles() {
    if (window.__universalCardToggleAttached) return;
    window.__universalCardToggleAttached = true;
    document.addEventListener('click', function(e) {
      var card = e.target.closest('.addon-card, [data-toggle-card], .toggle-card, .selectable-card');
      if (!card) return;
      if (e.target.tagName === 'INPUT') return;
      var cb = card.querySelector('input[type="checkbox"], input[type="radio"]');
      if (cb) {
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUniversalCardToggles);
  } else {
    initUniversalCardToggles();
  }
  setTimeout(initUniversalCardToggles, 200);
  window.addEventListener('elementor/frontend/init', initUniversalCardToggles);
})();
`;
          if (code.includes('</script>')) {
            code = code.replace('</script>', universalToggleScript + '\n</script>');
          } else {
            code = code + '\n<script>' + universalToggleScript + '</script>';
          }
        }
        el.settings.html = code;
      }
    }

    if (Array.isArray(el.elements)) {
      for (const child of el.elements) {
        scanAndNormalize(child, el);
      }
    }
  }

  rootElements.forEach(el => scanAndNormalize(el));
}

module.exports = {
  normalizeStructuralIntegrity,
  normalizeElementorContainerParity
};

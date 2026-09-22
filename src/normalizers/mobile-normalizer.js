/**
 * @deprecated Legacy v0.4 Fallback Normalizer.
 * In V2, Single-Pass Geometric Mapping (src/smart/geometry-mapper.js) natively preserves geometry.
 * Retained strictly as fallback for offline/legacy AST pipeline.
 */
/**
 * Mobile Normalizer Guardrail (RULES: pillBadgeFitContent, universalMobileRowRetention, mobileFullWidthButtonJustify).
 * Guarantees that badges, pills, tags, side-by-side rows, and buttons behave correctly across mobile viewports.
 * Completely agnostic across all landing page types.
 */

function normalizeMobileBehavior(element) {
  if (!element) return;

  if (element.elType === 'container' && element.settings) {
    const s = element.settings;
    const classes = (s.css_classes || s._css_classes || '').toLowerCase();

    // 1. Enforce Fit-Content across Desktop, Tablet, and Mobile for Badges/Pills
    const hasPillRadius = s.border_radius && (
      s.border_radius.top === '9999' || s.border_radius.top === 9999 ||
      s.border_radius === '9999' || s.border_radius === 9999 ||
      (typeof s.border_radius.top === 'string' && parseInt(s.border_radius.top, 10) >= 30)
    );
    const isBadge = hasPillRadius || s.width?.size === 'fit-content' || classes.includes('badge') || classes.includes('pill');

    if (isBadge) {
      s.content_width = 'full';
      s.width = { unit: 'custom', size: 'fit-content' };
      s.width_tablet = { unit: 'custom', size: 'fit-content' };
      s.width_mobile = { unit: 'custom', size: 'fit-content' };
      s._flex_size = 'none';
      s._flex_size_tablet = 'none';
      s._flex_size_mobile = 'none';
      s.flex_shrink = 0;
      s.flex_shrink_tablet = 0;
      s.flex_shrink_mobile = 0;
    }

    // 2. Enforce Row Retention on Mobile for intrinsic horizontal rows (inline widgets, nowrap, or switchers)
    const isRow = s.direction === 'row' || s.flex_direction === 'row';
    const isNowrap = s.wrap === 'nowrap' || s.flex_wrap === 'nowrap';
    const hasSmallInlineChildren = Array.isArray(element.elements) && element.elements.length <= 4 &&
      element.elements.every(c => c.widgetType === 'heading' || c.widgetType === 'icon' || c.widgetType === 'html' || c.widgetType === 'button');

    if (isRow && (isNowrap || isBadge || hasSmallInlineChildren)) {
      s.direction_mobile = 'row';
      s.flex_direction_mobile = 'row';
      s.wrap_mobile = 'nowrap';
      s.flex_wrap_mobile = 'nowrap';
    }

    // 3. Enforce Mobile Container Cross-Axis Stretch when containing full-width mobile button
    const hasFullWidthButton = Array.isArray(element.elements) && element.elements.some(child => {
      if (child.widgetType === 'button') {
        const cs = child.settings || {};
        return cs._element_width_mobile === '100' || cs.align_mobile === 'justify';
      }
      return false;
    });

    if (hasFullWidthButton || classes.includes('footer') || classes.includes('cta') || classes.includes('banner')) {
      s.align_items_mobile = 'stretch';
      s.flex_align_items_mobile = 'stretch';
    }
  }

  // 4. Enforce Full-Width Justified Buttons on Mobile
  if (element.elType === 'widget' && element.widgetType === 'button' && element.settings) {
    const s = element.settings;
    const btnClasses = (s.css_classes || s._css_classes || '').toLowerCase();
    const isFullWidthBtn = (
      s._element_width_mobile === '100' ||
      btnClasses.includes('full-width') ||
      btnClasses.includes('btn-block') ||
      btnClasses.includes('w-full') ||
      btnClasses.includes('footer-btn') ||
      btnClasses.includes('cta-btn')
    );
    if (isFullWidthBtn) {
      s.align_mobile = 'justify';
      s.align = s.align || 'center';
      s._element_width_mobile = '100';
    }
  }

  // Recurse into children
  if (Array.isArray(element.elements)) {
    for (const child of element.elements) {
      normalizeMobileBehavior(child);
    }
  }
}

module.exports = {
  normalizeMobileBehavior
};

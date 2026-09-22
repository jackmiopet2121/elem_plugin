/**
 * @deprecated Legacy v0.4 Fallback Normalizer.
 * In V2, Single-Pass Geometric Mapping (src/smart/geometry-mapper.js) natively preserves geometry.
 * Retained strictly as fallback for offline/legacy AST pipeline.
 */
/**
 * Semantic DOM Reducer & Flattener.
 * Implements AST compiler optimization passes:
 * 1. Dead/redundant wrapper collapsing (prunes single-child non-styled containers).
 * 2. Icon box transmutation (converts single-icon box containers into native Elementor icon widgets).
 * 3. Typography unification (fuses related inline text/spans into single atomic widgets).
 * 4. Micro-embed protection (keeps form controls compact and self-contained).
 */

function isBoxModelEmpty(bm) {
  if (!bm || typeof bm !== 'object') return true;
  return (!bm.top || bm.top === '0' || bm.top === 0) &&
         (!bm.right || bm.right === '0' || bm.right === 0) &&
         (!bm.bottom || bm.bottom === '0' || bm.bottom === 0) &&
         (!bm.left || bm.left === '0' || bm.left === 0);
}

function hasVisualStyles(s = {}) {
  if (s.background_background === 'classic' || s.background_color) return true;
  if (s.border_border && s.border_border !== 'none') return true;
  if (s.border_radius && (s.border_radius.top > 0 || s.border_radius.top === '9999')) return true;
  if (s.box_shadow_box_shadow) return true;
  if (!isBoxModelEmpty(s.padding)) return true;
  return false;
}

/**
 * Transmutes a single-icon container into a native Elementor icon widget with framed/stacked view.
 */
function transmuteSingleIconContainer(container) {
  if (!container || container.elType !== 'container') return container;
  if (!Array.isArray(container.elements) || container.elements.length !== 1) return container;

  const child = container.elements[0];
  if (!child || child.elType !== 'widget' || child.widgetType !== 'icon') return container;

  const cs = container.settings || {};
  const is = child.settings || {};

  // If container is an icon-box or has fixed 30-50px dimensions or square box styling
  const rawClasses = (cs.css_classes || cs._css_classes || '').toLowerCase();
  const isIconBox = rawClasses.includes('icon') || rawClasses.includes('box') ||
                    (cs.width && cs.width.unit === 'px' && cs.width.size <= 60);

  if (isIconBox) {
    // Transfer container styling to the icon widget
    if (cs.background_color) {
      is.primary_color = cs.background_color;
      is.view = 'stacked';
      is.shape = cs.border_radius ? 'square' : 'circle';
    }
    if (cs.border_color) {
      is.secondary_color = cs.border_color;
    }
    is._element_width = 'auto';
    is._flex_size = 'none';
    is.flex_shrink = 0;
    is.size = is.size || { unit: 'px', size: 16 };
    const mergedClasses = ((cs.css_classes || '') + ' ' + (is.css_classes || '')).trim();
    const sanitizedClasses = mergedClasses
      .split(/\s+/)
      .filter(c => !/^fa(?:$|-|s$|r$|b$|l$|d$|t$)/i.test(c) && !/^-/i.test(c))
      .join(' ')
      .trim();
    is.css_classes = sanitizedClasses;
    is._css_classes = sanitizedClasses;

    return child;
  }

  return container;
}

/**
 * Collapses redundant single-child wrapper containers.
 */
function collapseRedundantWrappers(element, isRoot = false) {
  if (!element || typeof element !== 'object') return element;

  if (Array.isArray(element.elements)) {
    element.elements = element.elements.map(child => collapseRedundantWrappers(child, false)).filter(Boolean);
  }

  // Do not collapse root section
  if (isRoot || element.isInner === false) {
    return element;
  }

  // Check if this container is a candidate for icon transmutation
  const transmuted = transmuteSingleIconContainer(element);
  if (transmuted !== element) {
    return transmuted;
  }

  // If container has exactly one child and NO distinctive visual styles or layout constraints
  if (element.elType === 'container' && Array.isArray(element.elements) && element.elements.length === 1) {
    const child = element.elements[0];
    const s = element.settings || {};

    const rawClasses = (s.css_classes || s._css_classes || '').toLowerCase();
    const isProtectedRole = Boolean(s._has_pseudo) || rawClasses.includes('timeline') || rawClasses.includes('step') ||
                            rawClasses.includes('grid') || rawClasses.includes('col') ||
                            rawClasses.includes('card') || rawClasses.includes('header') ||
                            rawClasses.includes('row') || rawClasses.includes('switch') ||
                            rawClasses.includes('section') || rawClasses.includes('container') ||
                            rawClasses.includes('track') || rawClasses.includes('btn');

    if (child && !hasVisualStyles(s) && !isProtectedRole && !s.width && (!s.direction || s.direction === 'column')) {
      // Merge parent attributes into child
      const cs = child.settings || (child.settings = {});
      if (s.css_classes) {
        cs.css_classes = ((s.css_classes || '') + ' ' + (cs.css_classes || '')).trim();
        cs._css_classes = cs.css_classes;
      }
      if (s._element_id && !cs._element_id) {
        cs._element_id = s._element_id;
      }
      return child;
    }
  }

  return element;
}

/**
 * Main DOM Reducer entrypoint.
 * Executes semantic optimization passes across the Elementor AST.
 */
function reduceDomTree(rootElements = []) {
  if (!Array.isArray(rootElements)) return rootElements;
  return rootElements.map(root => collapseRedundantWrappers(root, true));
}

module.exports = {
  reduceDomTree,
  collapseRedundantWrappers,
  transmuteSingleIconContainer,
  hasVisualStyles
};

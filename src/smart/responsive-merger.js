/**
 * Multi-Viewport Responsive Style & Layout Merger.
 * Codename: "Single-Pass + Verify" (Phase 6 - T6.1 & T6.2)
 * 
 * Merges desktop ground-truth base template with tablet and mobile
 * ground-truth styles and geometry into native Elementor responsive settings.
 * 
 * ZERO heuristics. ZERO regex guessing. Strictly Chromium computed ground truth.
 */

const {
  inferContainerLayout,
  deduplicateContainerChildSpacing,
  deriveAlignSelfFromGt,
  detectNodeRole,
  detectIconDecor,
  resolveAssetUrl
} = require('./geometry-mapper');
const { resolveElementSelector, ensureDeterministicClass } = require('./semantic-scoper');
const { resolveImageBackgroundGeometry, extractSingleImageUrl } = require('./image-background-geometry');
const { resolveGradientBackground, resolveScopedGradientPlan } = require('./gradient-background-resolver');
const { readComputedCssProperty } = require('./computed-style-resolver');
const { isSafeCssUrl } = require('../emulator/elementor-virtual-renderer');

function parsePx(val) {
  if (!val) return 0;
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

function formatBox(top, right, bottom, left, unit = 'px') {
  const t = Math.round(parsePx(top));
  const r = Math.round(parsePx(right));
  const b = Math.round(parsePx(bottom));
  const l = Math.round(parsePx(left));
  return {
    unit,
    top: String(t),
    right: String(r),
    bottom: String(b),
    left: String(l),
    isLinked: Boolean(t === r && r === b && b === l)
  };
}

function formatPaddingFromStyles(styles) {
  if (!styles) return null;
  return formatBox(styles.paddingTop, styles.paddingRight, styles.paddingBottom, styles.paddingLeft);
}

function formatMarginFromStyles(styles) {
  if (!styles) return null;
  return formatBox(styles.marginTop, styles.marginRight, styles.marginBottom, styles.marginLeft);
}

function isBoxSignificantlyDifferent(boxA, boxB, threshold = 4) {
  if (!boxA || !boxB) return false;
  return (
    Math.abs(parsePx(boxA.top) - parsePx(boxB.top)) >= threshold ||
    Math.abs(parsePx(boxA.right) - parsePx(boxB.right)) >= threshold ||
    Math.abs(parsePx(boxA.bottom) - parsePx(boxB.bottom)) >= threshold ||
    Math.abs(parsePx(boxA.left) - parsePx(boxB.left)) >= threshold
  );
}

/**
 * Recursively merges responsive overrides into Elementor nodes.
 */
function mergeNodeResponsive(node, parentNode, gtSnapshot, options) {
  if (!node) return;

  const sid = node._sid || node.settings?._sid || node._dom_id || node.settings?._dom_id;
  const s = node.settings || (node.settings = {});

  const gtDesktop = sid ? gtSnapshot?.viewports?.desktop?.flat?.[sid] : null;
  const gtTablet = sid ? gtSnapshot?.viewports?.tablet?.flat?.[sid] : null;
  const gtMobile = sid ? gtSnapshot?.viewports?.mobile?.flat?.[sid] : null;

  const parentSid = parentNode?._sid || parentNode?.settings?._sid || parentNode?._dom_id;
  const parentGtDesktop = parentSid ? gtSnapshot?.viewports?.desktop?.flat?.[parentSid] : null;
  const parentGtTablet = parentSid ? gtSnapshot?.viewports?.tablet?.flat?.[parentSid] : null;
  const parentGtMobile = parentSid ? gtSnapshot?.viewports?.mobile?.flat?.[parentSid] : null;

  // Task K10 (N2): Universal Per-Viewport Flex Child Order (strictly emitted when !== 0)
  // Desktop default 0 is NEVER emitted.
  if (gtDesktop?.styles?.order && gtDesktop.styles.order !== '0' && gtDesktop.styles.order !== 'normal') {
    const ordDesk = parseInt(gtDesktop.styles.order, 10);
    if (!isNaN(ordDesk) && ordDesk !== 0) {
      s._order = ordDesk;
      s.order = ordDesk;
    } else {
      delete s._order;
      delete s.order;
    }
  } else {
    delete s._order;
    delete s.order;
  }
  if (gtTablet?.styles?.order && gtTablet.styles.order !== '0' && gtTablet.styles.order !== 'normal') {
    const ordTab = parseInt(gtTablet.styles.order, 10);
    if (!isNaN(ordTab) && ordTab !== 0) {
      s._order_tablet = ordTab;
      s.order_tablet = ordTab;
    } else {
      delete s._order_tablet;
      delete s.order_tablet;
    }
  } else {
    delete s._order_tablet;
    delete s.order_tablet;
  }
  if (gtMobile?.styles?.order && gtMobile.styles.order !== '0' && gtMobile.styles.order !== 'normal') {
    const ordMob = parseInt(gtMobile.styles.order, 10);
    if (!isNaN(ordMob) && ordMob !== 0) {
      s._order_mobile = ordMob;
      s.order_mobile = ordMob;
    } else {
      delete s._order_mobile;
      delete s.order_mobile;
    }
  } else {
    delete s._order_mobile;
    delete s.order_mobile;
  }

  // 1. Container Layout & Flow (T6.1 & T6.2)
  if (node.elType === 'container') {
    const childNodes = (node.elements || []).filter(c => c && (c._sid || c.settings?._sid));
    const childGtsTablet = childNodes.map(c => {
      const cSid = c._sid || c.settings?._sid;
      return cSid ? gtSnapshot?.viewports?.tablet?.flat?.[cSid] : null;
    }).filter(Boolean);

    const childGtsMobile = childNodes.map(c => {
      const cSid = c._sid || c.settings?._sid;
      return cSid ? gtSnapshot?.viewports?.mobile?.flat?.[cSid] : null;
    }).filter(Boolean);

    // Tablet Layout Inference (Advisory A1 & Task K5)
    const hasTabletChildren = childGtsTablet.length > 1 || (gtTablet?.childRects && gtTablet.childRects.length > 1);
    const tabletLayout = (hasTabletChildren && gtTablet) ? inferContainerLayout(childGtsTablet, gtTablet) : { direction: s.direction || 'column', wrap: 'nowrap', gap: 0, isUniform: true };
    if (hasTabletChildren && gtTablet) {
      if (tabletLayout.direction !== s.direction) {
        s.direction_tablet = tabletLayout.direction;
        s.flex_direction_tablet = tabletLayout.direction;
      }
      if (tabletLayout.wrap !== s.wrap) {
        s.wrap_tablet = tabletLayout.wrap;
        s.flex_wrap_tablet = tabletLayout.wrap;
      }
    }

    // Task K5: Per-breakpoint gap parity — explicit CSS computed gap first, then geometric inference
    const hasTabExplicitCol = gtTablet?.styles?.columnGap !== undefined && gtTablet?.styles?.columnGap !== '' && gtTablet?.styles?.columnGap !== 'normal';
    const hasTabExplicitRow = gtTablet?.styles?.rowGap !== undefined && gtTablet?.styles?.rowGap !== '' && gtTablet?.styles?.rowGap !== 'normal';
    const hasTabExplicitGap = gtTablet?.styles?.gap !== undefined && gtTablet?.styles?.gap !== '' && gtTablet?.styles?.gap !== 'normal';

    let tabCol = 0;
    let tabRow = 0;
    let hasExplicitTabGap = false;

    if (hasTabExplicitCol || hasTabExplicitRow) {
      tabCol = parsePx(gtTablet.styles.columnGap);
      tabRow = parsePx(gtTablet.styles.rowGap);
      hasExplicitTabGap = true;
    } else if (hasTabExplicitGap) {
      const g = parsePx(gtTablet.styles.gap);
      tabCol = g;
      tabRow = g;
      hasExplicitTabGap = true;
    } else if (hasTabletChildren) {
      const hasTabDecorWithMargin = childNodes.some((childNode, idx) => {
        const cGt = childGtsTablet[idx];
        if (!cGt) return false;
        const role = detectNodeRole(childNode, cGt, gtSnapshot, 'tablet');
        const isDecor = role === 'icon' || Boolean(detectIconDecor(cGt, cGt.styles));
        const mar = (tabletLayout.direction === 'row') ? parsePx(cGt.styles?.marginRight) : parsePx(cGt.styles?.marginBottom);
        return isDecor && mar > 0;
      });
      if (!hasTabDecorWithMargin && tabletLayout.isUniform) {
        if (tabletLayout.direction === 'row') {
          tabCol = tabletLayout.gap;
          tabRow = tabletLayout.wrap === 'wrap' ? tabletLayout.gap : 0;
        } else {
          tabRow = tabletLayout.gap;
          tabCol = 0;
        }
      }
    }

    const tabDir = s.direction_tablet || s.flex_direction_tablet || s.direction || 'column';
    const effectiveTabGap = (tabDir === 'row' ? tabCol : tabRow) || tabCol || tabRow || 0;
    const dGap = s.gap?.size ?? 0;
    if (hasExplicitTabGap || Math.abs(effectiveTabGap - dGap) >= 4) {
      s.gap_tablet = { unit: 'px', size: effectiveTabGap, column: tabCol, row: tabRow, isLinked: Boolean(tabCol === tabRow) };
      s.flex_gap_tablet = { unit: 'px', size: effectiveTabGap, column: tabCol, row: tabRow, isLinked: Boolean(tabCol === tabRow) };
      s.space_between_widgets_tablet = effectiveTabGap;
    }

    // Mobile Layout Inference & Auto-Stacking (Advisory A1 & Task M10-B & Task K5)
    const hasMobileChildren = childGtsMobile.length > 1 || (gtMobile?.childRects && gtMobile.childRects.length > 1);
    const mobileLayout = (hasMobileChildren && gtMobile) ? inferContainerLayout(childGtsMobile, gtMobile) : { direction: s.direction || 'column', wrap: 'nowrap', gap: 0, isUniform: true };
    if (hasMobileChildren && gtMobile) {
      const isGtFlex = Boolean(gtMobile.styles?.display && gtMobile.styles.display.includes('flex'));
      const isMobileRow = Boolean(
        (isGtFlex && gtMobile.styles?.flexDirection === 'row') ||
        mobileLayout.direction === 'row'
      );

      if (isMobileRow) {
        s.direction_mobile = 'row';
        s.flex_direction_mobile = 'row';
        // Task K9 (B5 & B8): Wrap detection when children exceed parent inner width
        const parentPadM = (parseFloat(gtMobile.styles?.paddingLeft) || 0) + (parseFloat(gtMobile.styles?.paddingRight) || 0);
        const innerWMobile = Math.max(1, (gtMobile.rect?.w || 375) - parentPadM);
        const totalChildW = childGtsMobile.reduce((sum, c) => sum + (c?.rect?.w || 0), 0) +
          (Math.max(0, childGtsMobile.length - 1) * (parsePx(gtMobile.styles?.columnGap || gtMobile.styles?.gap) || 16));
        const shouldWrap = gtMobile.styles?.flexWrap === 'wrap' || mobileLayout.wrap === 'wrap' || totalChildW > innerWMobile - 4;
        const wrapVal = shouldWrap ? 'wrap' : (gtMobile.styles?.flexWrap === 'nowrap' ? 'nowrap' : 'wrap');
        s.wrap_mobile = wrapVal;
        s.flex_wrap_mobile = wrapVal;
      } else if (s.direction === 'row' || s.flex_direction === 'row' || mobileLayout.direction === 'column') {
        s.direction_mobile = 'column';
        s.flex_direction_mobile = 'column';
        s.wrap_mobile = mobileLayout.wrap || 'nowrap';
        s.flex_wrap_mobile = mobileLayout.wrap || 'nowrap';
      }
    }

    // Task K5: Per-breakpoint gap parity — explicit CSS computed gap first, then geometric inference
    const hasMobExplicitCol = gtMobile?.styles?.columnGap !== undefined && gtMobile?.styles?.columnGap !== '' && gtMobile?.styles?.columnGap !== 'normal';
    const hasMobExplicitRow = gtMobile?.styles?.rowGap !== undefined && gtMobile?.styles?.rowGap !== '' && gtMobile?.styles?.rowGap !== 'normal';
    const hasMobExplicitGap = gtMobile?.styles?.gap !== undefined && gtMobile?.styles?.gap !== '' && gtMobile?.styles?.gap !== 'normal';

    let mobCol = 0;
    let mobRow = 0;
    let hasExplicitMobGap = false;

    if (hasMobExplicitCol || hasMobExplicitRow) {
      mobCol = parsePx(gtMobile.styles.columnGap);
      mobRow = parsePx(gtMobile.styles.rowGap);
      hasExplicitMobGap = true;
    } else if (hasMobExplicitGap) {
      const g = parsePx(gtMobile.styles.gap);
      mobCol = g;
      mobRow = g;
      hasExplicitMobGap = true;
    } else if (hasMobileChildren) {
      const hasMobDecorWithMargin = childNodes.some((childNode, idx) => {
        const cGt = childGtsMobile[idx];
        if (!cGt) return false;
        const role = detectNodeRole(childNode, cGt, gtSnapshot, 'mobile');
        const isDecor = role === 'icon' || Boolean(detectIconDecor(cGt, cGt.styles));
        const mar = (mobileLayout.direction === 'row') ? parsePx(cGt.styles?.marginRight) : parsePx(cGt.styles?.marginBottom);
        return isDecor && mar > 0;
      });
      if (!hasMobDecorWithMargin && mobileLayout.isUniform) {
        if (mobileLayout.direction === 'row') {
          mobCol = mobileLayout.gap;
          mobRow = mobileLayout.wrap === 'wrap' ? mobileLayout.gap : 0;
        } else {
          mobRow = mobileLayout.gap;
          mobCol = 0;
        }
      }
    }

    const mobDir = s.direction_mobile || s.flex_direction_mobile || s.direction || 'column';
    const effectiveMobGap = (mobDir === 'row' ? mobCol : mobRow) || mobCol || mobRow || 0;
    if (hasExplicitMobGap || Math.abs(effectiveMobGap - dGap) >= 4) {
      s.gap_mobile = { unit: 'px', size: effectiveMobGap, column: mobCol, row: mobRow, isLinked: Boolean(mobCol === mobRow) };
      s.flex_gap_mobile = { unit: 'px', size: effectiveMobGap, column: mobCol, row: mobRow, isLinked: Boolean(mobCol === mobRow) };
      s.space_between_widgets_mobile = effectiveMobGap;
    }

    // Tablet & Mobile Width Scaling (where delta > 5%)
    if (parentGtDesktop?.rect?.w > 0 && gtDesktop?.rect?.w > 0) {
      const parentPadD = (parseFloat(parentGtDesktop.styles?.paddingLeft) || 0) +
                         (parseFloat(parentGtDesktop.styles?.paddingRight) || 0) +
                         (parseFloat(parentGtDesktop.styles?.borderLeftWidth) || 0) +
                         (parseFloat(parentGtDesktop.styles?.borderRightWidth) || 0);
      const innerWDesktop = Math.max(1, parentGtDesktop.rect.w - parentPadD);
      const isFullWidthDesktop = Math.abs(gtDesktop.rect.w - innerWDesktop) <= 8;

      // Task M8: Decorative fixed-size children check
      const isFixedDecor = Boolean(
        s._decor || s._is_decor ||
        (s.width?.unit === 'px' && s.width.size <= 84) ||
        (gtDesktop.rect.w <= 84 && Math.abs(gtDesktop.rect.w - gtDesktop.rect.h) <= 12 && Math.abs((gtMobile?.rect?.w || gtDesktop.rect.w) - gtDesktop.rect.w) <= 6)
      );

      if (isFixedDecor) {
        if (s.width?.unit === 'px') {
          s.width_tablet = { ...s.width };
          s.width_mobile = { ...s.width };
        }
        s.flex_shrink = 0;
        s.flex_shrink_tablet = 0;
        s.flex_shrink_mobile = 0;
      } else {
        // Tablet Width
        if (parentGtTablet && gtTablet && parentGtTablet.rect.w > 0 && gtTablet.rect.w > 0) {
          const parentPadT = (parseFloat(parentGtTablet.styles?.paddingLeft) || 0) +
                             (parseFloat(parentGtTablet.styles?.paddingRight) || 0) +
                             (parseFloat(parentGtTablet.styles?.borderLeftWidth) || 0) +
                             (parseFloat(parentGtTablet.styles?.borderRightWidth) || 0);
          const innerWTablet = Math.max(1, parentGtTablet.rect.w - parentPadT);
          const isTabletFull = Math.abs(gtTablet.rect.w - innerWTablet) <= 8;

          if (isTabletFull && !isFullWidthDesktop) {
            s.width_tablet = { unit: '%', size: 100 };
          } else {
            const desktopPct = (gtDesktop.rect.w / innerWDesktop) * 100;
            const tabletPct = (gtTablet.rect.w / innerWTablet) * 100;
            if (Math.abs(tabletPct - desktopPct) > 5) {
              s.width_tablet = { unit: '%', size: Math.min(100, Math.round(tabletPct * 10) / 10) };
            }
          }
        }

        // Mobile Width (Task M10-B: Multi-Item Inline Wrap Preservation on Mobile)
        if (parentGtMobile && gtMobile && parentGtMobile.rect.w > 0 && gtMobile.rect.w > 0) {
          const parentPadM = (parseFloat(parentGtMobile.styles?.paddingLeft) || 0) +
                             (parseFloat(parentGtMobile.styles?.paddingRight) || 0) +
                             (parseFloat(parentGtMobile.styles?.borderLeftWidth) || 0) +
                             (parseFloat(parentGtMobile.styles?.borderRightWidth) || 0);
          const innerWMobile = Math.max(1, parentGtMobile.rect.w - parentPadM);
          const isFullWidthMobile = Math.abs(gtMobile.rect.w - innerWMobile) <= 8;
          const isGtParentFlex = Boolean(parentGtMobile.styles?.display && parentGtMobile.styles.display.includes('flex'));
          const isParentRowMobile = Boolean(
            (isGtParentFlex && parentGtMobile.styles?.flexDirection === 'row') ||
            parentNode?.settings?.direction_mobile === 'row' ||
            parentNode?.settings?.flex_direction_mobile === 'row'
          );
          const isParentStacked = !isParentRowMobile && (
            parentNode?.settings?.direction_mobile === 'column' ||
            parentNode?.settings?.flex_direction_mobile === 'column' ||
            (isGtParentFlex && parentGtMobile.styles?.flexDirection === 'column')
          );

          const desktopPct = (gtDesktop.rect.w / innerWDesktop) * 100;
          const mobilePct = (gtMobile.rect.w / innerWMobile) * 100;

          if (isParentRowMobile && !isFullWidthMobile && (gtMobile.rect.w / innerWMobile) < 0.8) {
            // PRESERVE row + wrap; child widths = GT mobile rect percent of parent content box (M8 contract), never forced 100%
            const pct = Math.min(100, Math.max(1, Math.floor((gtMobile.rect.w / innerWMobile) * 100 * 10) / 10));
            s.width_mobile = { unit: '%', size: pct };
            s._flex_size = 'none';
          } else if (isParentStacked && (isFullWidthMobile || mobilePct >= 80)) {
            // Stack to 100% ONLY when GT mobile actually stacks (column direction or full-width child rects)
            s.width_mobile = { unit: '%', size: 100 };
          } else if (Math.abs(mobilePct - desktopPct) > 5) {
            s.width_mobile = { unit: '%', size: Math.min(100, Math.round(mobilePct * 10) / 10) };
          }
        }
      }
    }

    // Responsive Box Model (Paddings)
    if (s._flush_card) {
      const zeroBox = { unit: 'px', top: '0', right: '0', bottom: '0', left: '0', isLinked: true };
      s.padding_tablet = { ...zeroBox };
      s._padding_tablet = { ...zeroBox };
      s.padding_mobile = { ...zeroBox };
      s._padding_mobile = { ...zeroBox };
    } else if (s._flush_body && parentGtDesktop?.styles) {
      if (parentGtTablet?.styles) {
        const tPad = formatPaddingFromStyles(parentGtTablet.styles);
        if (tPad) {
          s.padding_tablet = tPad;
          s._padding_tablet = tPad;
        }
      }
      if (parentGtMobile?.styles) {
        const mPad = formatPaddingFromStyles(parentGtMobile.styles);
        if (mPad) {
          s.padding_mobile = mPad;
          s._padding_mobile = mPad;
        }
      }
    } else {
      // Section & Nested Container Padding Hierarchy (Task K5):
      // Preserves exact GT computed padding per container per viewport without inheritance bleed
      if (gtDesktop?.styles && gtTablet?.styles) {
        const desktopPad = formatPaddingFromStyles(gtDesktop.styles);
        const tabletPad = formatPaddingFromStyles(gtTablet.styles);
        if (isBoxSignificantlyDifferent(desktopPad, tabletPad, 4)) {
          s.padding_tablet = tabletPad;
          s._padding_tablet = tabletPad;
        }
      }
      if (gtDesktop?.styles && gtMobile?.styles) {
        const desktopPad = formatPaddingFromStyles(gtDesktop.styles);
        const mobilePad = formatPaddingFromStyles(gtMobile.styles);
        if (isBoxSignificantlyDifferent(desktopPad, mobilePad, 4)) {
          s.padding_mobile = mobilePad;
          s._padding_mobile = mobilePad;
        }
      }
      if (!parentNode && !s.padding_mobile) {
        s.padding_mobile = formatPaddingFromStyles(gtMobile?.styles || gtDesktop?.styles) || {
          unit: 'px', top: '0', right: '0', bottom: '0', left: '0', isLinked: true
        };
        s._padding_mobile = s.padding_mobile;
      }

      // Container Margin Hierarchy (Task K9):
      // Preserves exact GT computed margins per container per viewport without inheritance bleed
      if (gtDesktop?.styles && gtTablet?.styles) {
        const desktopMar = formatMarginFromStyles(gtDesktop.styles);
        const tabletMar = formatMarginFromStyles(gtTablet.styles);
        if (s._auto_centered) {
          tabletMar.left = '0';
          tabletMar.right = '0';
          tabletMar.isLinked = false;
        }
        if (isBoxSignificantlyDifferent(desktopMar, tabletMar, 4) || s._auto_centered) {
          s.margin_tablet = tabletMar;
          s._margin_tablet = tabletMar;
        }
      }
      if (gtDesktop?.styles && gtMobile?.styles) {
        const desktopMar = formatMarginFromStyles(gtDesktop.styles);
        const mobileMar = formatMarginFromStyles(gtMobile.styles);
        if (s._auto_centered) {
          mobileMar.left = '0';
          mobileMar.right = '0';
          mobileMar.isLinked = false;
        }
        if (isBoxSignificantlyDifferent(desktopMar, mobileMar, 4) || s._auto_centered) {
          s.margin_mobile = mobileMar;
          s._margin_mobile = mobileMar;
        }
      }

      // Task K10 (N1): Responsive Auto-Centering Direction Switch
      if (s._auto_centered) {
        if (parentNode && (parentNode.settings?.flex_direction_tablet === 'column' || parentNode.settings?.direction_tablet === 'column')) {
          s.align_self_tablet = 'center';
          s.flex_align_self_tablet = 'center';
        }
        if (parentNode && (parentNode.settings?.flex_direction_mobile === 'column' || parentNode.settings?.direction_mobile === 'column')) {
          s.align_self_mobile = 'center';
          s.flex_align_self_mobile = 'center';
        }
      }
    }

    // Block 8.2 — Phase 5, Part 5B-1: Native Responsive Background Image Source
    // & Part 3B: Responsive Image Background Geometry
    if (s.background_background === 'classic' && typeof s.background_image?.url === 'string' && s.background_image.url.trim() !== '') {
      delete s.background_image_tablet;
      delete s.background_image_mobile;

      const effectiveDesktopImgUrl = s.background_image.url.trim();
      let effectiveTabletImgUrl = effectiveDesktopImgUrl;

      // 1. Tablet Image Source override
      if (gtTablet) {
        const rawTabBgImg = readComputedCssProperty(gtTablet, gtSnapshot, 'tablet', 'background-image', 'backgroundImage');
        if (rawTabBgImg) {
          const parsedTabUrl = extractSingleImageUrl(rawTabBgImg);
          if (parsedTabUrl) {
            const resolvedTabUrl = resolveAssetUrl(parsedTabUrl, options);
            if (resolvedTabUrl && isSafeCssUrl(resolvedTabUrl)) {
              if (resolvedTabUrl !== effectiveDesktopImgUrl) {
                s.background_image_tablet = { url: resolvedTabUrl, id: '' };
                effectiveTabletImgUrl = resolvedTabUrl;
              }
            }
          }
        }
      }

      // 2. Mobile Image Source override (compare against effective tablet URL)
      if (gtMobile) {
        const rawMobBgImg = readComputedCssProperty(gtMobile, gtSnapshot, 'mobile', 'background-image', 'backgroundImage');
        if (rawMobBgImg) {
          const parsedMobUrl = extractSingleImageUrl(rawMobBgImg);
          if (parsedMobUrl) {
            const resolvedMobUrl = resolveAssetUrl(parsedMobUrl, options);
            if (resolvedMobUrl && isSafeCssUrl(resolvedMobUrl)) {
              if (resolvedMobUrl !== effectiveTabletImgUrl) {
                s.background_image_mobile = { url: resolvedMobUrl, id: '' };
              }
            }
          }
        }
      }

      const effectiveDesktopSize = s.background_size;
      const effectiveDesktopPosition = s.background_position;
      const effectiveDesktopRepeat = s.background_repeat;

      let effectiveTabletSize = effectiveDesktopSize;
      let effectiveTabletPosition = effectiveDesktopPosition;
      let effectiveTabletRepeat = effectiveDesktopRepeat;

      // 1. Tablet overrides (compare against effective desktop value)
      if (gtTablet) {
        const tabletGeo = resolveImageBackgroundGeometry(gtTablet, gtSnapshot, 'tablet');
        if (tabletGeo && tabletGeo.settings) {
          const tabSize = tabletGeo.settings.background_size;
          if (tabSize && tabSize !== effectiveDesktopSize) {
            s.background_size_tablet = tabSize;
            effectiveTabletSize = tabSize;
          }

          const tabPos = tabletGeo.settings.background_position;
          if (tabPos && tabPos !== effectiveDesktopPosition) {
            s.background_position_tablet = tabPos;
            effectiveTabletPosition = tabPos;
          }

          const tabRepeat = tabletGeo.settings.background_repeat;
          if (tabRepeat && tabRepeat !== effectiveDesktopRepeat) {
            s.background_repeat_tablet = tabRepeat;
            effectiveTabletRepeat = tabRepeat;
          }
        }
      }

      // 2. Mobile overrides (compare against effective tablet value)
      if (gtMobile) {
        const mobileGeo = resolveImageBackgroundGeometry(gtMobile, gtSnapshot, 'mobile');
        if (mobileGeo && mobileGeo.settings) {
          const mobSize = mobileGeo.settings.background_size;
          if (mobSize && mobSize !== effectiveTabletSize) {
            s.background_size_mobile = mobSize;
          }

          const mobPos = mobileGeo.settings.background_position;
          if (mobPos && mobPos !== effectiveTabletPosition) {
            s.background_position_mobile = mobPos;
          }

          const mobRepeat = mobileGeo.settings.background_repeat;
          if (mobRepeat && mobRepeat !== effectiveTabletRepeat) {
            s.background_repeat_mobile = mobRepeat;
          }
        }
      }
    }

    // Block 8.2 — Phase 5, Part 4C-1: Native Responsive Gradient Settings
    if (s.background_background === 'gradient') {
      delete s.background_gradient_angle_tablet;
      delete s.background_color_stop_tablet;
      delete s.background_color_b_stop_tablet;
      delete s.background_gradient_angle_mobile;
      delete s.background_color_stop_mobile;
      delete s.background_color_b_stop_mobile;

      if (
        gtDesktop &&
        s.background_gradient_angle &&
        typeof s.background_gradient_angle.size === 'number' &&
        s.background_color_stop &&
        typeof s.background_color_stop.size === 'number' &&
        s.background_color_b_stop &&
        typeof s.background_color_b_stop.size === 'number'
      ) {
        const desktopGrad = resolveGradientBackground(gtDesktop, gtSnapshot, 'desktop');
        if (desktopGrad && desktopGrad.mode === 'native-linear') {
          const effectiveDesktopAngle = s.background_gradient_angle.size;
          const effectiveDesktopStopA = s.background_color_stop.size;
          const effectiveDesktopStopB = s.background_color_b_stop.size;

          let effectiveTabletAngle = effectiveDesktopAngle;
          let effectiveTabletStopA = effectiveDesktopStopA;
          let effectiveTabletStopB = effectiveDesktopStopB;

          // 1. Tablet overrides (compare against effective desktop values)
          if (gtTablet) {
            const tabletGrad = resolveGradientBackground(gtTablet, gtSnapshot, 'tablet');
            if (tabletGrad && tabletGrad.mode === 'native-linear' && tabletGrad.settings) {
              const tabAngle = tabletGrad.settings.background_gradient_angle.size;
              if (tabAngle !== effectiveDesktopAngle) {
                s.background_gradient_angle_tablet = { unit: 'deg', size: tabAngle, sizes: [] };
                effectiveTabletAngle = tabAngle;
              }

              const tabStopA = tabletGrad.settings.background_color_stop.size;
              if (tabStopA !== effectiveDesktopStopA) {
                s.background_color_stop_tablet = { unit: '%', size: tabStopA, sizes: [] };
                effectiveTabletStopA = tabStopA;
              }

              const tabStopB = tabletGrad.settings.background_color_b_stop.size;
              if (tabStopB !== effectiveDesktopStopB) {
                s.background_color_b_stop_tablet = { unit: '%', size: tabStopB, sizes: [] };
                effectiveTabletStopB = tabStopB;
              }
            }
          }

          // 2. Mobile overrides (compare against effective tablet values)
          if (gtMobile) {
            const mobileGrad = resolveGradientBackground(gtMobile, gtSnapshot, 'mobile');
            if (mobileGrad && mobileGrad.mode === 'native-linear' && mobileGrad.settings) {
              const mobAngle = mobileGrad.settings.background_gradient_angle.size;
              if (mobAngle !== effectiveTabletAngle) {
                s.background_gradient_angle_mobile = { unit: 'deg', size: mobAngle, sizes: [] };
              }

              const mobStopA = mobileGrad.settings.background_color_stop.size;
              if (mobStopA !== effectiveTabletStopA) {
                s.background_color_stop_mobile = { unit: '%', size: mobStopA, sizes: [] };
              }

              const mobStopB = mobileGrad.settings.background_color_b_stop.size;
              if (mobStopB !== effectiveTabletStopB) {
                s.background_color_b_stop_mobile = { unit: '%', size: mobStopB, sizes: [] };
              }
            }
          }
        }
      }
    }

    // Block 8.2 — Phase 6, Part 6C-2: Universal Gradient Scoped CSS Fallback & Radial Parity
    if (gtDesktop && gtTablet && gtMobile) {
      let readFailed = false;
      let vStyles = null;
      try {
        vStyles = {
          desktop: {
            backgroundImage: readComputedCssProperty(gtDesktop, gtSnapshot, 'desktop', 'background-image', 'backgroundImage'),
            backgroundColor: readComputedCssProperty(gtDesktop, gtSnapshot, 'desktop', 'background-color', 'backgroundColor')
          },
          tablet: {
            backgroundImage: readComputedCssProperty(gtTablet, gtSnapshot, 'tablet', 'background-image', 'backgroundImage'),
            backgroundColor: readComputedCssProperty(gtTablet, gtSnapshot, 'tablet', 'background-color', 'backgroundColor')
          },
          mobile: {
            backgroundImage: readComputedCssProperty(gtMobile, gtSnapshot, 'mobile', 'background-image', 'backgroundImage'),
            backgroundColor: readComputedCssProperty(gtMobile, gtSnapshot, 'mobile', 'background-color', 'backgroundColor')
          }
        };
      } catch (err) {
        readFailed = true;
      }

      if (!readFailed && vStyles) {
        const plan = resolveScopedGradientPlan(vStyles);
        if (plan.hasCssRoute) {
          if (options !== undefined && options !== null && (!options.atomicRules || !Array.isArray(options.atomicRules))) {
            const err = new Error(`GRADIENT_CSS_ROUTE_UNAVAILABLE: atomicRules array is unavailable for node ${sid}`);
            err.code = 'GRADIENT_CSS_ROUTE_UNAVAILABLE';
            throw err;
          }

          if (options?.atomicRules && Array.isArray(options.atomicRules)) {
            const className = ensureDeterministicClass(node, sid);
            const selector = `.${className}`;

          if (plan.declarations.desktop && plan.declarations.desktop.length > 0) {
            const rule = `${selector} {\n  ${plan.declarations.desktop.join('\n  ')}\n}`;
            if (!options.atomicRules.includes(rule)) {
              options.atomicRules.push(rule);
            }
          }

          if (plan.declarations.tablet && plan.declarations.tablet.length > 0) {
            const rule = `@media (max-width: 1024px) {\n  ${selector} {\n    ${plan.declarations.tablet.join('\n    ')}\n  }\n}`;
            if (!options.atomicRules.includes(rule)) {
              options.atomicRules.push(rule);
            }
          }

            if (plan.declarations.mobile && plan.declarations.mobile.length > 0) {
              const rule = `@media (max-width: 767px) {\n  ${selector} {\n    ${plan.declarations.mobile.join('\n    ')}\n  }\n}`;
              if (!options.atomicRules.includes(rule)) {
                options.atomicRules.push(rule);
              }
            }
          }
        }
      }
    }
  }

  // 2. Widget Typography & Alignment
  if (node.elType === 'widget') {
    // Fixed decor protection for widgets (aspect ~1:1, 24-84px, or explicit px width with flex_shrink: 0)
    const isWidgetFixedDecor = Boolean(
      (s.width?.unit === 'px' && s.width.size <= 84 && s.flex_shrink === 0) ||
      (gtDesktop?.rect?.w <= 84 && Math.abs((gtDesktop?.rect?.w || 0) - (gtDesktop?.rect?.h || 0)) <= 12 && s.flex_shrink === 0)
    );
    if (isWidgetFixedDecor) {
      if (s.width?.unit === 'px') {
        s.width_tablet = { ...s.width };
        s.width_mobile = { ...s.width };
      }
      s.flex_shrink_tablet = 0;
      s.flex_shrink_mobile = 0;
    }

    // Task M10-B: Inline shrink-wrapped widgets (M8 _element_width auto contract must survive mobile pass)
    if (s._element_width === 'auto') {
      const isMobileInline = Boolean(
        gtMobile?.styles?.display === 'inline' ||
        gtMobile?.styles?.display === 'inline-block' ||
        (parentGtMobile && gtMobile && gtMobile.rect.w < parentGtMobile.rect.w * 0.8)
      );
      if (isMobileInline) {
        s._element_width_mobile = 'auto';
        s.align_self_mobile = s.align_self || 'flex-start';
        s._flex_align_self_mobile = s._flex_align_self || 'flex-start';
        s.flex_shrink_mobile = 0;
      }
    }

    const desktopFs = parsePx(gtDesktop?.styles?.fontSize);
    const tabletFs = parsePx(gtTablet?.styles?.fontSize);
    const mobileFs = parsePx(gtMobile?.styles?.fontSize);

    // Font size responsive overrides
    if (tabletFs >= 8 && desktopFs >= 8 && Math.abs(tabletFs - desktopFs) >= 1) {
      s.typography_typography = 'custom';
      s.typography_font_size_tablet = { unit: 'px', size: Math.round(tabletFs) };
      if (node.widgetType === 'icon') {
        s.size_tablet = { unit: 'px', size: Math.round(tabletFs) };
      }
    }
    if (mobileFs >= 8 && desktopFs >= 8 && Math.abs(mobileFs - desktopFs) >= 1) {
      s.typography_typography = 'custom';
      s.typography_font_size_mobile = { unit: 'px', size: Math.round(mobileFs) };
      if (node.widgetType === 'icon') {
        s.size_mobile = { unit: 'px', size: Math.round(mobileFs) };
      }
    }

    // Line height responsive overrides
    const desktopLh = parsePx(gtDesktop?.styles?.lineHeight);
    const tabletLh = parsePx(gtTablet?.styles?.lineHeight);
    const mobileLh = parsePx(gtMobile?.styles?.lineHeight);

    if (tabletLh > 0 && tabletFs > 0 && Math.abs(tabletLh - desktopLh) >= 1) {
      s.typography_typography = 'custom';
      const emRatio = Math.round((tabletLh / tabletFs) * 10) / 10;
      s.typography_line_height_tablet = { unit: 'em', size: emRatio };
    }
    if (mobileLh > 0 && mobileFs > 0 && Math.abs(mobileLh - desktopLh) >= 1) {
      s.typography_typography = 'custom';
      const emRatio = Math.round((mobileLh / mobileFs) * 10) / 10;
      s.typography_line_height_mobile = { unit: 'em', size: emRatio };
    }

    // Letter spacing responsive overrides
    const desktopLs = parsePx(gtDesktop?.styles?.letterSpacing);
    const tabletLs = parsePx(gtTablet?.styles?.letterSpacing);
    const mobileLs = parsePx(gtMobile?.styles?.letterSpacing);

    if (tabletLs !== 0 && !isNaN(tabletLs) && Math.abs(tabletLs - desktopLs) >= 0.1) {
      s.typography_typography = 'custom';
      s.typography_letter_spacing_tablet = { unit: 'px', size: Math.round(tabletLs * 100) / 100 };
    }
    if (mobileLs !== 0 && !isNaN(mobileLs) && Math.abs(mobileLs - desktopLs) >= 0.1) {
      s.typography_typography = 'custom';
      s.typography_letter_spacing_mobile = { unit: 'px', size: Math.round(mobileLs * 100) / 100 };
    }

    // Text alignment overrides
    if (gtTablet?.styles?.textAlign && gtTablet.styles.textAlign !== gtDesktop?.styles?.textAlign) {
      if (['left', 'center', 'right', 'justify'].includes(gtTablet.styles.textAlign)) {
        s.align_tablet = gtTablet.styles.textAlign;
      }
    }
    if (gtMobile?.styles?.textAlign && gtMobile.styles.textAlign !== gtDesktop?.styles?.textAlign) {
      if (['left', 'center', 'right', 'justify'].includes(gtMobile.styles.textAlign)) {
        s.align_mobile = gtMobile.styles.textAlign;
      }
    }

    // K2: Per-viewport decor/icon align-self inference from GT rects vs parent content-box
    if (node.widgetType === 'icon' || s._icon_decor || s.align_self) {
      if (gtTablet && parentGtTablet) {
        const aSelfTab = deriveAlignSelfFromGt(gtTablet, parentGtTablet);
        if (aSelfTab && aSelfTab !== s.align_self) {
          s.align_self_tablet = aSelfTab;
          s._flex_align_self_tablet = aSelfTab;
          if (node.widgetType === 'icon') {
            s.align_tablet = (aSelfTab === 'flex-start') ? 'left' : ((aSelfTab === 'flex-end') ? 'right' : 'center');
          }
        }
      }
      if (gtMobile && parentGtMobile) {
        const aSelfMob = deriveAlignSelfFromGt(gtMobile, parentGtMobile);
        if (aSelfMob && aSelfMob !== s.align_self) {
          s.align_self_mobile = aSelfMob;
          s._flex_align_self_mobile = aSelfMob;
          if (node.widgetType === 'icon') {
            s.align_mobile = (aSelfMob === 'flex-start') ? 'left' : ((aSelfMob === 'flex-end') ? 'right' : 'center');
          }
        }
      }
    }

    // Button Full-Width & Geometric Alignment on Tablet & Mobile + Responsive Gap (Task K9)
    if (node.widgetType === 'button') {
      if (gtTablet && parentGtTablet && parentGtTablet.rect?.w > 0 && gtTablet.rect?.w > 0) {
        const pPadL = parseFloat(parentGtTablet.styles?.paddingLeft) || 0;
        const pPadR = parseFloat(parentGtTablet.styles?.paddingRight) || 0;
        const contentBoxX = parentGtTablet.rect.x + pPadL;
        const contentBoxW = Math.max(1, parentGtTablet.rect.w - pPadL - pPadR);
        const offsetX = gtTablet.rect.x - contentBoxX;
        const spaceRight = contentBoxW - gtTablet.rect.w - offsetX;
        const pCenter = contentBoxX + contentBoxW / 2;
        const nCenter = gtTablet.rect.x + gtTablet.rect.w / 2;

        let derivedAlignTab = s.align || 'left';
        if (gtTablet.rect.w >= contentBoxW * 0.85) {
          derivedAlignTab = 'justify';
        } else if (Math.abs(offsetX - spaceRight) <= 4 || Math.abs(nCenter - pCenter) <= 12) {
          derivedAlignTab = 'center';
        } else if (offsetX <= 4 || Math.abs(offsetX) <= 16) {
          derivedAlignTab = 'left';
        } else if (spaceRight <= 4 || Math.abs(spaceRight) <= 16) {
          derivedAlignTab = 'right';
        }
        if (derivedAlignTab !== s.align) {
          s.align_tablet = derivedAlignTab;
        }
      }

      if (gtMobile && parentGtMobile && parentGtMobile.rect?.w > 0 && gtMobile.rect?.w > 0) {
        const pPadL = parseFloat(parentGtMobile.styles?.paddingLeft) || 0;
        const pPadR = parseFloat(parentGtMobile.styles?.paddingRight) || 0;
        const contentBoxX = parentGtMobile.rect.x + pPadL;
        const contentBoxW = Math.max(1, parentGtMobile.rect.w - pPadL - pPadR);
        const offsetX = gtMobile.rect.x - contentBoxX;
        const spaceRight = contentBoxW - gtMobile.rect.w - offsetX;
        const pCenter = contentBoxX + contentBoxW / 2;
        const nCenter = gtMobile.rect.x + gtMobile.rect.w / 2;
        const btnMobilePct = (gtMobile.rect.w / parentGtMobile.rect.w) * 100;

        let derivedAlignMob = s.align_tablet || s.align || 'left';
        if (btnMobilePct >= 80 || gtMobile.styles?.display === 'block' || gtMobile.rect.w >= contentBoxW * 0.85) {
          derivedAlignMob = 'justify';
          s._element_width_mobile = 'initial';
        } else if (Math.abs(offsetX - spaceRight) <= 4 || Math.abs(nCenter - pCenter) <= 12) {
          derivedAlignMob = 'center';
        } else if (offsetX <= 4 || Math.abs(offsetX) <= 16) {
          derivedAlignMob = 'left';
        } else if (spaceRight <= 4 || Math.abs(spaceRight) <= 16) {
          derivedAlignMob = 'right';
        }
        if (derivedAlignMob !== s.align) {
          s.align_mobile = derivedAlignMob;
        }
      }
      if (gtTablet?.styles) {
        const tCol = parsePx(gtTablet.styles.columnGap || gtTablet.styles.gap);
        const tRow = parsePx(gtTablet.styles.rowGap || gtTablet.styles.gap);
        if (tCol > 0 || tRow > 0) {
          const g = tCol || tRow;
          s.gap_tablet = { unit: 'px', size: g, column: tCol, row: tRow, isLinked: Boolean(tCol === tRow) };
          s.flex_gap_tablet = { unit: 'px', size: g, column: tCol, row: tRow, isLinked: Boolean(tCol === tRow) };
        }
      }
      if (gtMobile?.styles) {
        const mCol = parsePx(gtMobile.styles.columnGap || gtMobile.styles.gap);
        const mRow = parsePx(gtMobile.styles.rowGap || gtMobile.styles.gap);
        if (mCol > 0 || mRow > 0) {
          const g = mCol || mRow;
          s.gap_mobile = { unit: 'px', size: g, column: mCol, row: mRow, isLinked: Boolean(mCol === mRow) };
          s.flex_gap_mobile = { unit: 'px', size: g, column: mCol, row: mRow, isLinked: Boolean(mCol === mRow) };
        }
      }
    }

    // Task M1: HTML Micro-Embed Responsive Geometry Overrides
    if (node.widgetType === 'html') {
      if (gtTablet && parentGtTablet && parentGtTablet.rect?.w > 0 && gtTablet.rect?.w > 0) {
        const tabPct = Math.min(100, Math.round((gtTablet.rect.w / parentGtTablet.rect.w) * 100 * 10) / 10);
        if (!s.width?.size || s.width?.unit !== '%' || Math.abs(tabPct - s.width.size) > 2) {
          s.width_tablet = { unit: '%', size: tabPct };
        }
      }
      if (gtMobile && parentGtMobile && parentGtMobile.rect?.w > 0 && gtMobile.rect?.w > 0) {
        const mobPct = Math.min(100, Math.round((gtMobile.rect.w / parentGtMobile.rect.w) * 100 * 10) / 10);
        if (!s.width?.size || s.width?.unit !== '%' || Math.abs(mobPct - s.width.size) > 2) {
          s.width_mobile = { unit: '%', size: mobPct };
        }
      }
      if (gtTablet?.rect?.h > 0) {
        const tabH = Math.round(gtTablet.rect.h);
        if (!s.min_height?.size || s.min_height?.unit !== 'px' || Math.abs(tabH - s.min_height.size) > 4) {
          s.min_height_tablet = { unit: 'px', size: tabH };
        }
      }
      if (gtMobile?.rect?.h > 0) {
        const mobH = Math.round(gtMobile.rect.h);
        if (!s.min_height?.size || s.min_height?.unit !== 'px' || Math.abs(mobH - s.min_height.size) > 4) {
          s.min_height_mobile = { unit: 'px', size: mobH };
        }
      }
    }

    // Task M6 & M10-A: Image Widget Responsive Fill & Height Lock (_hero_cover_fill / flush-media)
    if (node.widgetType === 'image') {
      const tabH = Math.round(gtTablet?.rect?.h || 0);
      const mobH = Math.round(gtMobile?.rect?.h || 0);
      const tabW = Math.round(gtTablet?.rect?.w || 0);
      const mobW = Math.round(gtMobile?.rect?.w || 0);

      const tabStyleH = gtTablet?.styles?.height;
      const hasTabExplicitH = typeof tabStyleH === 'string' && tabStyleH.endsWith('px') && parsePx(tabStyleH) > 0;
      const mobStyleH = gtMobile?.styles?.height;
      const hasMobExplicitH = typeof mobStyleH === 'string' && mobStyleH.endsWith('px') && parsePx(mobStyleH) > 0;

      const isFlushOrCover = Boolean(s._hero_cover_fill || s._img_height || s._flush_media);

      if (isFlushOrCover) {
        if (tabH > 0) {
          s._img_height_tablet = tabH;
          s.min_height_tablet = { unit: 'px', size: tabH };
          if (hasTabExplicitH) {
            s._img_lock_height_tablet = tabH;
            s.height_tablet = { unit: 'px', size: tabH };
            s.max_height_tablet = { unit: 'px', size: tabH };
          }
        }
        if (mobH > 0) {
          s._img_height_mobile = mobH;
          s.min_height_mobile = { unit: 'px', size: mobH };
          if (hasMobExplicitH) {
            s._img_lock_height_mobile = mobH;
            s.height_mobile = { unit: 'px', size: mobH };
            s.max_height_mobile = { unit: 'px', size: mobH };
          }
        }

        // Emit per-breakpoint scoped atomic rules if atomicRules accumulator provided
        if (options && Array.isArray(options.atomicRules) && node) {
          const scope = resolveElementSelector(node);
          if (tabH > 0) {
            const tabHeightRules = hasTabExplicitH
              ? `    height: ${tabH}px !important;\n    max-height: ${tabH}px !important;\n    min-height: ${tabH}px !important;\n`
              : `    height: 100% !important;\n    min-height: ${tabH}px !important;\n`;

            options.atomicRules.push(
              `@media (max-width: 1024px) {\n` +
              `  ${scope},\n` +
              `  ${scope} .elementor-widget-image,\n` +
              `  ${scope} .elementor-widget-container,\n` +
              `  ${scope} .elementor-widget-container img {\n` +
              `    width: 100% !important;\n` +
              tabHeightRules +
              `    object-fit: cover !important;\n` +
              `  }\n` +
              `}`
            );
          }
          if (mobH > 0) {
            const mobHeightRules = hasMobExplicitH
              ? `    height: ${mobH}px !important;\n    max-height: ${mobH}px !important;\n    min-height: ${mobH}px !important;\n`
              : `    height: 100% !important;\n    min-height: ${mobH}px !important;\n`;

            options.atomicRules.push(
              `@media (max-width: 767px) {\n` +
              `  ${scope},\n` +
              `  ${scope} .elementor-widget-image,\n` +
              `  ${scope} .elementor-widget-container,\n` +
              `  ${scope} .elementor-widget-container img {\n` +
              `    width: 100% !important;\n` +
              mobHeightRules +
              `    object-fit: cover !important;\n` +
              `  }\n` +
              `}`
            );
          }
        }
      }

      if (isFlushOrCover) {
        s.width_tablet = { unit: '%', size: 100 };
        s.width_mobile = { unit: '%', size: 100 };
      } else {
        if (tabW > 0 && (!s.width?.size || s.width?.unit !== 'px' || Math.abs(tabW - s.width.size) > 4)) {
          s.width_tablet = { unit: 'px', size: tabW };
        }
        if (mobW > 0 && (!s.width?.size || s.width?.unit !== 'px' || Math.abs(mobW - s.width.size) > 4)) {
          s.width_mobile = { unit: 'px', size: mobW };
        }
      }
    }

    // Widget Padding & Margin Responsive Overrides
    if (gtDesktop?.styles && gtTablet?.styles) {
      const dPad = formatPaddingFromStyles(gtDesktop.styles);
      const tPad = formatPaddingFromStyles(gtTablet.styles);
      if (isBoxSignificantlyDifferent(dPad, tPad, 4)) {
        s._padding_tablet = tPad;
        if (node.widgetType === 'button') s.button_padding_tablet = tPad;
      }
      const dMar = formatMarginFromStyles(gtDesktop.styles);
      const tMar = formatMarginFromStyles(gtTablet.styles);
      if (isBoxSignificantlyDifferent(dMar, tMar, 4)) {
        s._margin_tablet = tMar;
        s.margin_tablet = tMar;
      }
    }
    if (gtDesktop?.styles && gtMobile?.styles) {
      const dPad = formatPaddingFromStyles(gtDesktop.styles);
      const mPad = formatPaddingFromStyles(gtMobile.styles);
      if (isBoxSignificantlyDifferent(dPad, mPad, 4)) {
        s._padding_mobile = mPad;
        if (node.widgetType === 'button') s.button_padding_mobile = mPad;
      }
      const dMar = formatMarginFromStyles(gtDesktop.styles);
      const mMar = formatMarginFromStyles(gtMobile.styles);
      if (isBoxSignificantlyDifferent(dMar, mMar, 4)) {
        s._margin_mobile = mMar;
        s.margin_mobile = mMar;
      }
    }
  }

  // Recurse down children
  if (Array.isArray(node.elements)) {
    for (const child of node.elements) {
      mergeNodeResponsive(child, node, gtSnapshot, options);
    }
  }

  // W2/W3: Responsive spacing double-count elimination (Advisory A2)
  if (node.elType === 'container' && Array.isArray(node.elements) && node.elements.length >= 2) {
    const mappedPairs = node.elements.map(child => ({
      element: child,
      node: { attributes: { 'data-sid': child._sid || child.settings?._sid || child._dom_id || child.settings?._dom_id } }
    }));
    deduplicateContainerChildSpacing(node.settings, mappedPairs, gtSnapshot, 'tablet');
    deduplicateContainerChildSpacing(node.settings, mappedPairs, gtSnapshot, 'mobile');
  }
}

/**
 * Merges multi-viewport ground-truth styles into the Elementor JSON template.
 */
function mergeResponsiveSettings(templateJson, gtSnapshot, options = {}) {
  if (!templateJson || !gtSnapshot?.viewports) return templateJson;

  const content = templateJson.content || (Array.isArray(templateJson) ? templateJson : []);
  for (const rootEl of content) {
    mergeNodeResponsive(rootEl, null, gtSnapshot, options);
  }

  return templateJson;
}

module.exports = {
  mergeResponsiveSettings,
  mergeNodeResponsive,
  formatPaddingFromStyles,
  formatMarginFromStyles
};

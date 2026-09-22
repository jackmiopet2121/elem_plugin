/**
 * Per-Widget Verification Matrix — Editability-First Contract (v3.1).
 * Codename: "Single-Pass + Verify" (Phase 3 - T3.3 / Phase 4 - T4)
 */

const { TOLERANCES, isColorEqual, normalizeColor } = require("./tolerances");
const { createDefect, createAuditReport, CRITICAL_RULES } = require("./audit-schema");
const { isElementorNativeProperty, isNativeEditableWidget } = require("./style-router");
const { extractKnownGlyph } = require("./glyph-map");

const AVAILABLE_RULES = Object.freeze([
  'RULE-ASSET-01',
  'RULE-LAYOUT-01',
  'RULE-DOM-01',
  'RULE-STATE-01',
  'RULE-CLR-01',
  'RULE-CLR-02',
  'RULE-CLR-03',
  'RULE-TYP-01',
  'RULE-TYP-02',
  'RULE-TXT-01',
  'RULE-TXT-02',
  'RULE-GEO-01',
  'RULE-TOPOLOGY-01',
  'RULE-TOPOLOGY-02',
  'RULE-BOX-01',
  'RULE-BOX-02',
  'RULE-VIS-01',
  'RULE-VIS-02',
  'RULE-VIS-03',
  'RULE-VIS-04',
  'RULE-BHV-01'
]);

function parsePx(val) {
  if (!val) return 0;
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

const EDITABLE_RELAX = 2.5;

/**
 * Runs verification matrix comparison between GT snapshot and Render snapshot.
 */
function auditVerificationMatrix(gtSnapshot, renderSnapshot, templateJson, options = {}) {
  const auditReport = createAuditReport({
    title: templateJson.title || "Template Verification Matrix Audit",
    totalElements: (templateJson.content || []).length
  });

  const defects = [];
  const viewports = ["desktop", "tablet", "mobile"];

  // Index template elements by SID to detect native editable widgets
  const sidToElement = new Map();
  const leafSids = new Set();

  function indexElements(elements = []) {
    for (const el of elements) {
      const sid = el._sid || el.settings?._sid || el._dom_id || el.settings?._dom_id;
      if (sid) {
        sidToElement.set(sid, el);
        if (el.elType === "widget") {
          leafSids.add(sid);
        }
      }
      if (Array.isArray(el.elements)) indexElements(el.elements);
    }
  }
  indexElements(templateJson.content || []);

  // G9 Critical Check: EMPTY_ASSET_URL
  function checkEmptyAssetUrls(elements = []) {
    for (const el of elements) {
      if (el.widgetType === "image") {
        const url = el.settings?.image?.url || el.settings?.url;
        if (!url || typeof url !== 'string' || url.trim() === '') {
          defects.push(createDefect({
            nodeSid: el._sid || el.settings?._sid || el._dom_id || el.id || "image",
            viewport: "desktop",
            property: "url",
            original: "valid_url",
            rendered: "empty",
            severity: "CRITICAL",
            rule: "RULE-ASSET-01",
            rung: "R1",
            routing: "native",
            advisory: false,
            message: `EMPTY_ASSET_URL: Image widget ${el.id || el._sid || 'image'} has empty or missing URL.`
          }));
        }
      }
      if (Array.isArray(el.elements)) checkEmptyAssetUrls(el.elements);
    }
  }
  checkEmptyAssetUrls(templateJson.content || []);

  // A1: content_width CONTRACT (Critical invariant: EVERY inner container must have content_width: 'full')
  function checkContentWidthContract(elements, isRoot = true) {
    for (const el of elements) {
      if (el.elType === "container") {
        const s = el.settings || {};
        if (!isRoot && s.content_width !== "full") {
          defects.push(createDefect({
            nodeSid: el._sid || el.settings?._sid || el._dom_id || el.id || "container",
            viewport: "desktop",
            property: "content_width",
            original: "full",
            rendered: s.content_width || "undefined",
            severity: "CRITICAL",
            rule: "RULE-LAYOUT-01",
            rung: "R1",
            routing: "native",
            advisory: false,
            message: `CONTENT_WIDTH_VIOLATION: Inner container ${el.id || el._sid} has content_width '${s.content_width || 'undefined'}'. Must be 'full' to prevent WordPress 1-column collapse.`
          }));
        }
        if (Array.isArray(el.elements)) checkContentWidthContract(el.elements, false);
      }
    }
  }
  checkContentWidthContract(templateJson.content || [], true);

  // RULE-TOPOLOGY-02 (CRITICAL): Duplicate SID Collision Check in Template Tree
  const seenTemplateSids = new Set();
  function checkDuplicateSids(elements = []) {
    for (const el of elements) {
      const sid = el._sid || el.settings?._sid || el._dom_id || el.settings?._dom_id;
      if (sid) {
        if (seenTemplateSids.has(sid)) {
          defects.push(createDefect({
            nodeSid: sid,
            widgetId: el.id || null,
            viewport: "desktop",
            property: "sid_uniqueness",
            original: "unique",
            rendered: "duplicate",
            severity: "CRITICAL",
            rule: "RULE-TOPOLOGY-02",
            rung: "R1",
            routing: "native",
            advisory: false,
            message: `DUPLICATE_SID_COLLISION: Duplicate sid '${sid}' detected on element ${el.id || 'widget'} in template tree.`
          }));
        } else {
          seenTemplateSids.add(sid);
        }
      }
      if (Array.isArray(el.elements)) checkDuplicateSids(el.elements);
    }
  }
  checkDuplicateSids(templateJson.content || []);

  // RULE-TOPOLOGY-02 (CRITICAL): Duplicate SID Collision Check from Render DOM
  for (const vp of viewports) {
    const renderVp = renderSnapshot?.viewports?.[vp];
    if (renderVp && Array.isArray(renderVp.duplicateSids) && renderVp.duplicateSids.length > 0) {
      for (const dupSid of renderVp.duplicateSids) {
        defects.push(createDefect({
          nodeSid: dupSid,
          widgetId: null,
          viewport: vp,
          property: "sid_uniqueness",
          original: "unique",
          rendered: "duplicate",
          severity: "CRITICAL",
          rule: "RULE-TOPOLOGY-02",
          rung: "R1",
          routing: "native",
          advisory: false,
          message: `DUPLICATE_SID_COLLISION: Elementor render DOM contains duplicate [data-sid="${dupSid}"] at ${vp}.`
        }));
      }
    }
  }

  // RULE-TOPOLOGY-02 (CRITICAL): Section Overlap Check (>20% vertical collision)
  const rootContent = templateJson.content || [];
  let sectionElements = [];
  if (rootContent.length === 1 && rootContent[0].elType === 'container') {
    sectionElements = (rootContent[0].elements || []).filter(el => el.elType === 'container');
  } else {
    sectionElements = rootContent.filter(el => el.elType === 'container');
  }

  for (const vp of viewports) {
    const renderVp = renderSnapshot?.viewports?.[vp];
    if (!renderVp || !renderVp.flat) continue;
    const renderFlat = renderVp.flat;

    const renderedSections = [];
    for (const sec of sectionElements) {
      const sid = sec._sid || sec.settings?._sid || sec._dom_id || sec.settings?._dom_id;
      const node = sid ? renderFlat[sid] : null;
      if (node && node.rect && node.rect.h > 0) {
        renderedSections.push({ sec, sid, rect: node.rect });
      }
    }

    for (let i = 0; i < renderedSections.length - 1; i++) {
      const s1 = renderedSections[i];
      const s2 = renderedSections[i + 1];

      const top1 = s1.rect.y;
      const bottom1 = s1.rect.y + s1.rect.h;
      const top2 = s2.rect.y;
      const bottom2 = s2.rect.y + s2.rect.h;

      // Vertical overlap
      const overlapY = Math.max(0, Math.min(bottom1, bottom2) - Math.max(top1, top2));
      const minH = Math.min(s1.rect.h, s2.rect.h);

      // Horizontal overlap (must share horizontal corridor to be stacked section collision)
      const left1 = s1.rect.x;
      const right1 = s1.rect.x + s1.rect.w;
      const left2 = s2.rect.x;
      const right2 = s2.rect.x + s2.rect.w;
      const overlapX = Math.max(0, Math.min(right1, right2) - Math.max(left1, left2));
      const minW = Math.min(s1.rect.w, s2.rect.w);

      if (minH > 0 && minW > 0 && overlapX > minW * 0.5) {
        const overlapRatio = overlapY / minH;
        if (overlapRatio > 0.20) {
          defects.push(createDefect({
            nodeSid: s2.sid || s1.sid,
            widgetId: s2.sec?.id || s1.sec?.id || null,
            viewport: vp,
            property: "section_overlap",
            original: "0%",
            rendered: `${Math.round(overlapRatio * 100)}%`,
            severity: "CRITICAL",
            rule: "RULE-TOPOLOGY-02",
            rung: "R1",
            routing: "native",
            advisory: false,
            message: `SECTION_OVERLAP_COLLISION: Section ${s2.sid || s2.sec?.id} vertically overlaps section ${s1.sid || s1.sec?.id} by ${Math.round(overlapRatio * 100)}% (>20% threshold) at ${vp}.`
          }));
        }
      }
    }
  }

  function isDescendantOfLeaf(sid, gtFlat) {
    let curr = gtFlat[sid];
    while (curr && curr.parentSid) {
      if (leafSids.has(curr.parentSid)) return true;
      curr = gtFlat[curr.parentSid];
    }
    return false;
  }

  for (const vp of viewports) {
    const gtVp = gtSnapshot?.viewports?.[vp];
    const renderVp = renderSnapshot?.viewports?.[vp];

    if (!gtVp || !renderVp) continue;

    const gtFlat = gtVp.flat || {};
    const renderFlat = renderVp.flat || {};

    for (const [sid, gtNode] of Object.entries(gtFlat)) {
      const renderNode = renderFlat[sid];
      const templateEl = sidToElement.get(sid);
      const isNative = isNativeEditableWidget(templateEl);

      // Skip document.body
      if (gtNode.tag === "body") continue;

      // Skip invisible / zero-dimension container elements in original
      if (gtNode.rect.w === 0 && gtNode.rect.h === 0 && !gtNode.isInteractive) {
        continue;
      }

      if (!renderNode) {
        // If node is an inline descendant of an Elementor widget, it is already represented inside it
        if (isDescendantOfLeaf(sid, gtFlat)) {
          continue;
        }

        // True missing node defect
        if (gtNode.rect.w > 0 && gtNode.rect.h > 0) {
          defects.push(createDefect({
            nodeSid: sid,
            viewport: vp,
            property: "presence",
            original: "visible",
            rendered: "missing",
            severity: "CRITICAL",
            rule: "RULE-DOM-01",
            rung: "R3",
            routing: "micro",
            advisory: false,
            message: `Node ${sid} (${gtNode.tag}${gtNode.className ? "." + gtNode.className.split(" ")[0] : ""}) missing from Elementor render at ${vp}.`
          }));
        }
        continue;
      }

      const widgetId = renderNode.widgetId || null;
      const gts = gtNode.styles || {};
      const rns = renderNode.styles || {};

      // Helper to register defect with routing & severity re-mapping (G9)
      function pushDefect(d) {
        // C2: Mark derived layout metrics as advisory R0
        if (["lineCount", "wordCount", "lineWidth"].includes(d.property)) {
          d.advisory = true;
          d.rung = "R0";
          d.routing = "none";
          defects.push(createDefect(d));
          return;
        }

        // M9: Mark glyph parity as advisory R1
        if (d.rule === 'RULE-VIS-04' || d.property === 'glyph') {
          d.advisory = true;
          d.rung = "R1";
          d.severity = d.severity || "LOW";
          d.routing = "none";
          defects.push(createDefect(d));
          return;
        }

        const isNativeProp = isElementorNativeProperty(d.property);
        d.routing = isNativeProp ? "native" : "micro";
        // G9: Representable property deltas on native editable widgets are R1-actable defects, NOT demoted to advisory!
        d.advisory = false;

        // E6: Severity Recalibration (G9 enforcement)
        // Any |Δgeometry| > 24px (width or height) on a native editable widget -> severity: 'HIGH' + advisory: false
        if (isNative && ["width", "height"].includes(d.property)) {
          const origPx = parsePx(d.original);
          const rendPx = parsePx(d.rendered);
          if (Math.abs(origPx - rendPx) > 24) {
            d.severity = "HIGH";
            d.advisory = false;
          }
        }

        defects.push(createDefect(d));
      }

      // Z2 / B2 / M2: INITIAL-STATE PARITY ON STRICT RENDERER (RULE-STATE-01)
      // Closes matrix blind spot: If an element is initially collapsed/hidden in original ground truth
      // (computed max-height:0 / overflow:hidden with rect.h:0 / display:none / visibility:hidden),
      // but has rendered visible height > 0 on strict emulator, raise CRITICAL STATE_MISMATCH.
      const isGtInitiallyHidden = Boolean(
        (gts.maxHeight && gts.maxHeight !== "none" && parsePx(gts.maxHeight) === 0) ||
        (gtNode.rect && gtNode.rect.h === 0 && gts.overflow === 'hidden') ||
        (gts.overflow === 'hidden' && gts.height && gts.height !== 'auto' && parsePx(gts.height) === 0) ||
        gts.display === 'none' ||
        gts.visibility === 'hidden'
      );

      const hasRenderRect = Boolean(renderNode && renderNode.rect && renderNode.rect.h !== undefined);
      const isRenderVisible = hasRenderRect
        ? (renderNode.rect.h > 0 && rns.display !== 'none' && rns.visibility !== 'hidden')
        : (
            rns.display !== 'none' &&
            rns.visibility !== 'hidden' &&
            !(rns.overflow === 'hidden' && (
              (rns.maxHeight && rns.maxHeight !== 'none' && parsePx(rns.maxHeight) === 0) ||
              (rns.height && rns.height !== 'auto' && parsePx(rns.height) === 0)
            ))
          );

      if (isGtInitiallyHidden && isRenderVisible) {
        pushDefect({
          nodeSid: sid,
          widgetId,
          viewport: vp,
          property: "initialState",
          original: "hidden",
          rendered: "visible",
          severity: "CRITICAL",
          rule: "RULE-STATE-01",
          rung: "R1",
          advisory: false,
          message: `STATE_MISMATCH: ${sid} (${gtNode.tag}${gtNode.className ? "." + gtNode.className.split(" ")[0] : ""}) collapsed in original (maxHeight:0/overflow:hidden) but rendered visible (height=${renderNode?.rect?.h ?? rns.height}px).`
        });
      }

      // 1. Colors
      if (gts.color && rns.color && !isColorEqual(gts.color, rns.color)) {
        pushDefect({
          nodeSid: sid,
          widgetId,
          viewport: vp,
          property: "color",
          original: gts.color,
          rendered: rns.color,
          severity: "HIGH",
          rule: "RULE-CLR-01",
          rung: "R1",
          message: `Text color mismatch on ${sid} at ${vp}: expected ${gts.color}, got ${rns.color}.`
        });
      }

      if (gts.backgroundColor && rns.backgroundColor &&
          gts.backgroundColor !== "transparent" && gts.backgroundColor !== "rgba(0, 0, 0, 0)" &&
          !isColorEqual(gts.backgroundColor, rns.backgroundColor)) {
        pushDefect({
          nodeSid: sid,
          widgetId,
          viewport: vp,
          property: "backgroundColor",
          original: gts.backgroundColor,
          rendered: rns.backgroundColor,
          severity: "HIGH",
          rule: "RULE-CLR-02",
          rung: "R1",
          message: `Background color mismatch on ${sid} at ${vp}: expected ${gts.backgroundColor}, got ${rns.backgroundColor}.`
        });
      }

      if (parsePx(gts.borderTopWidth) > 0 && gts.borderTopColor && rns.borderTopColor &&
          !isColorEqual(gts.borderTopColor, rns.borderTopColor)) {
        pushDefect({
          nodeSid: sid,
          widgetId,
          viewport: vp,
          property: "borderColor",
          original: gts.borderTopColor,
          rendered: rns.borderTopColor,
          severity: "MEDIUM",
          rule: "RULE-CLR-03",
          rung: "R1",
          message: `Border color mismatch on ${sid} at ${vp}: expected ${gts.borderTopColor}, got ${rns.borderTopColor}.`
        });
      }

      // 2. Typography (Tolerance relaxed for native editable widgets)
      const fontTolerance = (isNative ? TOLERANCES.FONT_SIZE_PX * EDITABLE_RELAX : TOLERANCES.FONT_SIZE_PX);
      const gtFs = parsePx(gts.fontSize);
      const rnFs = parsePx(rns.fontSize);
      if (gtFs >= 8 && Math.abs(gtFs - rnFs) > fontTolerance) {
        pushDefect({
          nodeSid: sid,
          widgetId,
          viewport: vp,
          property: "fontSize",
          original: `${gtFs}px`,
          rendered: `${rnFs}px`,
          severity: "HIGH",
          rule: "RULE-TYP-01",
          rung: "R1",
          message: `Font size mismatch on ${sid} at ${vp}: expected ${gtFs}px, got ${rnFs}px (delta: ${(rnFs - gtFs).toFixed(1)}px).`
        });
      }

      if (gts.fontWeight && rns.fontWeight && String(gts.fontWeight) !== String(rns.fontWeight)) {
        const isBoldEq = (gts.fontWeight === "bold" && rns.fontWeight === "700") ||
                         (gts.fontWeight === "700" && rns.fontWeight === "bold") ||
                         (gts.fontWeight === "normal" && rns.fontWeight === "400") ||
                         (gts.fontWeight === "400" && rns.fontWeight === "normal");
        if (!isBoldEq) {
          pushDefect({
            nodeSid: sid,
            widgetId,
            viewport: vp,
            property: "fontWeight",
            original: gts.fontWeight,
            rendered: rns.fontWeight,
            severity: "MEDIUM",
            rule: "RULE-TYP-02",
            rung: "R1",
            message: `Font weight mismatch on ${sid} at ${vp}: expected ${gts.fontWeight}, got ${rns.fontWeight}.`
          });
        }
      }

      // 3. Text Metrics & Wrapping (Leaf Text Nodes Only)
      const isTextLeaf = ["h1", "h2", "h3", "h4", "h5", "h6", "p", "span", "a", "button", "li", "label", "b", "strong", "em"].includes(gtNode.tag);

      // D1 Critical Check: INVISIBLE_TEXT (RULE-VIS-01)
      if (isTextLeaf && gtNode.hasDirectText) {
        const rnColor = rns.color || "";
        const rnFill = rns.webkitTextFillColor || rns['-webkit-text-fill-color'] || rnColor;
        const isTransparent = rnFill === "transparent" || rnFill === "rgba(0, 0, 0, 0)" || rnColor === "transparent" || rnColor === "rgba(0, 0, 0, 0)";
        const bgClip = rns.webkitBackgroundClip || rns.backgroundClip || rns['-webkit-background-clip'] || rns['background-clip'] || "";
        const rnBgImage = rns.backgroundImage || "";
        const isBgEmpty = !rnBgImage || rnBgImage === "none" || rnBgImage === "initial";

        if (isTransparent && (!bgClip.includes("text") || isBgEmpty)) {
          pushDefect({
            nodeSid: sid,
            widgetId,
            viewport: vp,
            property: "webkitTextFillColor",
            original: gts.backgroundImage || gts.color || "rgb(17, 24, 39)",
            rendered: "transparent-invisible",
            severity: "CRITICAL",
            rule: "RULE-VIS-01",
            rung: "R1",
            advisory: false,
            message: `INVISIBLE_TEXT: Text node ${sid} has transparent fill with missing background-image / text-clip at ${vp}.`
          });
        }
      }

      // D3 Critical Check: COLLAPSED_DECOR (RULE-VIS-02)
      // If a visual leaf container with original height > 40px collapses to rendered height < 10px
      const isContainerTag = ['div', 'section', 'article', 'aside', 'header', 'footer', 'main'].includes(gtNode.tag);
      const isTemplateContainer = templateEl && templateEl.elType === 'container';
      const isLeafContainer = isTemplateContainer
        ? (!templateEl.elements || templateEl.elements.length === 0)
        : (isContainerTag && !gtNode.hasDirectText);

      if (isLeafContainer) {
        const hasVisualBg = gts.backgroundColor && gts.backgroundColor !== 'transparent' && gts.backgroundColor !== 'rgba(0, 0, 0, 0)';
        const hasBgImg = gts.backgroundImage && gts.backgroundImage !== 'none' && gts.backgroundImage !== 'initial';
        const hasBorder = parsePx(gts.borderTopWidth) > 0 || parsePx(gts.borderBottomWidth) > 0 || parsePx(gts.borderLeftWidth) > 0 || parsePx(gts.borderRightWidth) > 0;
        const isVisual = Boolean(hasVisualBg || hasBgImg || hasBorder);

        const origH = Math.round(gtNode.rect?.h || parsePx(gts.height) || 0);
        const rendH = Math.round(renderNode.rect?.h ?? renderNode.outerRect?.h ?? 0);

        if (isVisual && origH > 40 && rendH < 10) {
          pushDefect({
            nodeSid: sid,
            widgetId,
            viewport: vp,
            property: "minHeight",
            original: `${origH}px`,
            rendered: `${rendH}px`,
            severity: "CRITICAL",
            rule: "RULE-VIS-02",
            rung: "R1",
            advisory: false,
            message: `COLLAPSED_DECOR: Visual leaf container ${sid} collapsed from ${origH}px to ${rendH}px (<10px) at ${vp}.`
          });
        }
      }

      // F10 Critical Check: DECOR_LOSS (RULE-VIS-03)
      // If GT node has active pseudo (::before or ::after with content !== 'none'),
      // but Render node is missing pseudo or has content === 'none'.
      const isPseudoActive = (c) => {
        if (c === null || c === undefined) return false;
        const s = String(c).trim();
        if (s.length === 0) return true;
        const lower = s.toLowerCase().replace(/['"]/g, '').trim();
        return lower !== 'none' && lower !== 'normal';
      };

      const gtBefore = gtNode.pseudo?.before;
      if (gtBefore && isPseudoActive(gtBefore.content)) {
        const rnBefore = renderNode?.pseudo?.before;
        const isRenderBeforeActive = Boolean(rnBefore && isPseudoActive(rnBefore.content));
        if (!isRenderBeforeActive) {
          pushDefect({
            nodeSid: sid,
            widgetId,
            viewport: vp,
            property: "pseudo:before",
            original: gtBefore.content || "active",
            rendered: rnBefore ? (rnBefore.content || "none") : "none",
            severity: "CRITICAL",
            rule: "RULE-VIS-03",
            rung: "R1",
            advisory: false,
            message: `DECOR_LOSS: Node ${sid} has active ::before pseudo decor (${JSON.stringify(gtBefore.content)}) in Ground Truth, but rendered pseudo is missing or none at ${vp}.`
          });
        }
      }

      const gtAfter = gtNode.pseudo?.after;
      if (gtAfter && isPseudoActive(gtAfter.content)) {
        const rnAfter = renderNode?.pseudo?.after;
        const isRenderAfterActive = Boolean(rnAfter && isPseudoActive(rnAfter.content));
        if (!isRenderAfterActive) {
          pushDefect({
            nodeSid: sid,
            widgetId,
            viewport: vp,
            property: "pseudo:after",
            original: gtAfter.content || "active",
            rendered: rnAfter ? (rnAfter.content || "none") : "none",
            severity: "CRITICAL",
            rule: "RULE-VIS-03",
            rung: "R1",
            advisory: false,
            message: `DECOR_LOSS: Node ${sid} has active ::after pseudo decor (${JSON.stringify(gtAfter.content)}) in Ground Truth, but rendered pseudo is missing or none at ${vp}.`
          });
        }
      }

      if (isTextLeaf && gtNode.hasDirectText && gtNode.lineCount && renderNode.lineCount && gtNode.lineCount !== renderNode.lineCount) {
        pushDefect({
          nodeSid: sid,
          widgetId,
          viewport: vp,
          property: "lineCount",
          original: gtNode.lineCount,
          rendered: renderNode.lineCount,
          severity: "LOW",
          rule: "RULE-TXT-01",
          rung: "R0",
          advisory: true,
          message: `Text line wrap mismatch on ${sid} at ${vp}: expected ${gtNode.lineCount} lines, got ${renderNode.lineCount} lines.`
        });
      }

      // Task M9 Advisory Check: GLYPH_PARITY (RULE-VIS-04)
      const gtGlyphCandidate = gtNode.directText || gtNode.fullText || gtNode.pseudo?.before?.content || gtNode.pseudo?.after?.content || '';
      const gtGlyphMatch = extractKnownGlyph(gtGlyphCandidate);
      if (gtGlyphMatch) {
        const expectedIcon = gtGlyphMatch.faIcon;
        const expectedGlyph = gtGlyphMatch.glyph;
        const element = sidToElement.get(sid);

        if (element && element.widgetType === 'icon') {
          const configuredIcon = element.settings?.selected_icon?.value || element.settings?.icon?.value ||
            (typeof element.settings?.icon === 'string' ? element.settings.icon : null);
          const renderedIcon = renderNode?.iconClass || configuredIcon;

          const isCheckFallback = (renderedIcon === 'fas fa-check' || renderedIcon === 'fa-check') && expectedIcon !== 'fas fa-check';
          const isIconMismatch = renderedIcon && renderedIcon !== expectedIcon && !renderedIcon.includes(expectedIcon.replace('fas fa-', ''));

          if (isCheckFallback || isIconMismatch) {
            pushDefect({
              nodeSid: sid,
              widgetId,
              viewport: vp,
              property: "glyph",
              original: `${expectedGlyph} (${expectedIcon})`,
              rendered: renderedIcon || "fas fa-check",
              severity: "LOW",
              rule: "RULE-VIS-04",
              rung: "R1",
              advisory: true,
              message: `GLYPH_PARITY: Glyph mismatch on ${sid} at ${vp}: expected "${expectedGlyph}" (${expectedIcon}), got "${renderedIcon || 'fas fa-check'}".`
            });
          }
        }
      }

      // 4. Geometry (Width & Height) — Tolerance relaxed for native widgets
      const gtW = gtNode.rect.w;
      const rnW = renderNode.rect.w;
      const rnOuterW = renderNode.outerRect ? renderNode.outerRect.w : rnW;
      const widthDelta = Math.min(Math.abs(gtW - rnW), Math.abs(gtW - rnOuterW));
      const widthTolerance = isNative
        ? Math.max(TOLERANCES.WIDTH_PX * EDITABLE_RELAX, gtW * 0.12)
        : Math.max(TOLERANCES.WIDTH_PX, gtW * 0.08);

      if (gtW >= 20 && widthDelta > widthTolerance) {
        pushDefect({
          nodeSid: sid,
          widgetId,
          viewport: vp,
          property: "width",
          original: `${gtW}px`,
          rendered: `${rnW}px`,
          severity: "MEDIUM",
          rule: "RULE-GEO-01",
          rung: "R1",
          message: `Width discrepancy on ${sid} at ${vp}: expected ${gtW}px, got ${rnW}px.`
        });
      }

      // E5: Direct <img> rect comparison (detect letterbox / height collapse)
      const isImgNode = gtNode.tag === 'img' || templateEl?.widgetType === 'image';
      if (isImgNode && gtNode.rect.h >= 20) {
        const gtH = gtNode.rect.h;
        const rnH = renderNode.rect.h; // Direct <img> rect from targetRect (not wrapper)
        const heightTolerance = isNative
          ? Math.max(TOLERANCES.HEIGHT_PX * EDITABLE_RELAX, gtH * 0.15)
          : Math.max(TOLERANCES.HEIGHT_PX, gtH * 0.10);

        if (Math.abs(gtH - rnH) > heightTolerance) {
          pushDefect({
            nodeSid: sid,
            widgetId,
            viewport: vp,
            property: "height",
            original: `${gtH}px`,
            rendered: `${rnH}px`,
            severity: Math.abs(gtH - rnH) > 24 ? "HIGH" : "MEDIUM",
            rule: "RULE-GEO-01",
            rung: "R1",
            message: `Image height discrepancy on ${sid} at ${vp}: expected ${gtH}px, got ${rnH}px (letterbox/collapse detected on <img> element).`
          });
        }
      }

      // G9 Critical Check: LAYOUT_TOPOLOGY_MISMATCH
      if (vp === "desktop" && gtNode.children && gtNode.children.length > 1) {
        const gtChildNodes = gtNode.children.map(cid => gtFlat[cid]).filter(Boolean);
        const rnChildNodes = gtNode.children.map(cid => renderFlat[cid]).filter(Boolean);
        if (gtChildNodes.length >= 2 && rnChildNodes.length >= 2) {
          const gtAllSameRow = gtChildNodes.every(c => Math.abs(c.rect.y - gtChildNodes[0].rect.y) < 15);
          const rnWrapped = rnChildNodes.some(c => Math.abs(c.rect.y - rnChildNodes[0].rect.y) > 30);
          if (gtAllSameRow && rnWrapped) {
            pushDefect({
              nodeSid: sid,
              widgetId,
              viewport: vp,
              property: "flexWrap",
              original: "nowrap-row",
              rendered: "wrapped-column",
              severity: "HIGH",
              rule: "RULE-TOPOLOGY-01",
              rung: "R1",
              message: `LAYOUT_TOPOLOGY_MISMATCH: Multi-column container ${sid} children wrapped unexpectedly onto multiple rows at desktop.`
            });
          }
        }
      }

      // 5. Box Model (Paddings, Border Widths & Radius) — Tolerance relaxed for native widgets
      const borderSides = [
        'borderTopWidth',
        'borderRightWidth',
        'borderBottomWidth',
        'borderLeftWidth'
      ];
      for (const side of borderSides) {
        const gtBw = parsePx(gts[side]);
        const rnBw = parsePx(rns[side]);
        if (Math.abs(gtBw - rnBw) > TOLERANCES.BORDER_WIDTH_PX && (gtBw > 0 || rnBw > 0)) {
          pushDefect({
            nodeSid: sid,
            widgetId,
            viewport: vp,
            property: side,
            original: `${gtBw}px`,
            rendered: `${rnBw}px`,
            severity: "LOW",
            rule: "RULE-BOX-01",
            rung: "R1",
            message: `Border width mismatch on ${sid} (${side}) at ${vp}: expected ${gtBw}px, got ${rnBw}px.`
          });
          break;
        }
      }

      const padTolerance = isNative ? TOLERANCES.PADDING_PX * EDITABLE_RELAX : TOLERANCES.PADDING_PX;
      const gtPt = parsePx(gts.paddingTop);
      const rnPt = parsePx(rns.paddingTop);
      if (Math.abs(gtPt - rnPt) > padTolerance && gtPt > 0) {
        pushDefect({
          nodeSid: sid,
          widgetId,
          viewport: vp,
          property: "paddingTop",
          original: `${gtPt}px`,
          rendered: `${rnPt}px`,
          severity: "LOW",
          rule: "RULE-BOX-01",
          rung: "R1"
        });
      }

      // Check columnGap and rowGap on flex/grid containers
      if (gtNode.tag !== "body" && (gts.display === "flex" || gts.display === "inline-flex" || gts.display === "grid" || gts.display === "inline-grid")) {
        const gapTolerance = isNative ? 2.5 : 2.0;

        const gtColGap = parsePx(gts.columnGap);
        const rnColGap = parsePx(rns.columnGap);
        if (Math.abs(gtColGap - rnColGap) > gapTolerance && (gtColGap > 0 || rnColGap > 0)) {
          pushDefect({
            nodeSid: sid,
            widgetId,
            viewport: vp,
            property: "columnGap",
            original: `${gtColGap}px`,
            rendered: `${rnColGap}px`,
            severity: "LOW",
            rule: "RULE-BOX-01",
            rung: "R1",
            message: `Column gap mismatch on ${sid} at ${vp}: expected ${gtColGap}px, got ${rnColGap}px.`
          });
        }

        const gtRowGap = parsePx(gts.rowGap);
        const rnRowGap = parsePx(rns.rowGap);
        if (Math.abs(gtRowGap - rnRowGap) > gapTolerance && (gtRowGap > 0 || rnRowGap > 0)) {
          pushDefect({
            nodeSid: sid,
            widgetId,
            viewport: vp,
            property: "rowGap",
            original: `${gtRowGap}px`,
            rendered: `${rnRowGap}px`,
            severity: "LOW",
            rule: "RULE-BOX-01",
            rung: "R1",
            message: `Row gap mismatch on ${sid} at ${vp}: expected ${gtRowGap}px, got ${rnRowGap}px.`
          });
        }
      }

      const radTolerance = isNative ? TOLERANCES.BORDER_RADIUS_PX * EDITABLE_RELAX : TOLERANCES.BORDER_RADIUS_PX;
      const radiusCorners = [
        'borderTopLeftRadius',
        'borderTopRightRadius',
        'borderBottomRightRadius',
        'borderBottomLeftRadius'
      ];
      for (const corner of radiusCorners) {
        const gtRad = parsePx(gts[corner]);
        const rnRad = parsePx(rns[corner]);
        if (Math.abs(gtRad - rnRad) > radTolerance && (gtRad > 0 || rnRad > 0)) {
          pushDefect({
            nodeSid: sid,
            widgetId,
            viewport: vp,
            property: corner,
            original: `${gtRad}px`,
            rendered: `${rnRad}px`,
            severity: "LOW",
            rule: "RULE-BOX-02",
            rung: "R1",
            message: `Border radius mismatch on ${sid} (${corner}) at ${vp}: expected ${gtRad}px, got ${rnRad}px.`
          });
          break;
        }
      }
    }
  }

  // Calculate Health Score (ignoring pure advisory defects for critical/high penalties)
  const nonAdvisory = defects.filter(d => !d.advisory);
  const critical = nonAdvisory.filter(d => d.severity === "CRITICAL").length;
  const high = nonAdvisory.filter(d => d.severity === "HIGH").length;
  const medium = nonAdvisory.filter(d => d.severity === "MEDIUM").length;
  const low = nonAdvisory.filter(d => d.severity === "LOW").length;

  const penalty = (critical * 20) + (high * 6) + (medium * 2) + (low * 0.2);
  const healthScore = Math.max(0, Math.min(100, Math.round(100 - penalty)));

  auditReport.defects = defects;
  auditReport.global.fidelity = healthScore;

  // Census by rung
  const defectCensusByRung = {
    R0: defects.filter(d => d.rung === "R0").length,
    R1: defects.filter(d => d.rung === "R1").length,
    R2: defects.filter(d => d.rung === "R2").length,
    R3: defects.filter(d => d.rung === "R3").length
  };

  return {
    report: auditReport,
    healthScore,
    defects,
    counts: {
      total: defects.length,
      critical,
      high,
      medium,
      low
    },
    advisories: defects.filter(d => d.advisory === true).length,
    defectCensusByRung
  };
}

module.exports = {
  AVAILABLE_RULES,
  auditVerificationMatrix
};

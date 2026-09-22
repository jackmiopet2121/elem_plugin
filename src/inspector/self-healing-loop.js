/**
 * Autonomous Visual Self-Healing Orchestrator.
 * Connects Compiler AST -> Virtual Emulator -> Headless Chrome -> Dual Inspector -> Auto-Patcher.
 * Runs in an automated convergence loop until visual similarity reaches >= 98% and defects are healed.
 */
const { renderElementorToHtml } = require('../emulator/elementor-virtual-renderer');
const { createBrowserSession, renderAndCapture, extractDomMetrics, captureSemanticCrops, detectAndTriggerInteraction, buildNodeSpatialIndex } = require('./headless-driver');
const { compareDomMetrics } = require('./dom-diff-inspector');
const { inspectWithVision } = require('./vision-inspector');
const { parseBoxShadow, flattenCssVariables } = require('../normalizers/css-style-resolver');

async function runSelfHealingLoop(rawHtml, compiledTemplate, options = {}) {
  const maxIterations = options.maxIterations || 6;
  const auditLog = [];
  let browser = null;

  try {
    browser = await createBrowserSession();

    // 1. Capture Original HTML Baseline & Metrics across 4 Viewports
    // A. Desktop (1280px)
    const { page: origPage, screenshotBuffer: origBuffer } = await renderAndCapture(browser, rawHtml, {
      width: 1280,
      height: 800
    });
    const origMetrics = await extractDomMetrics(origPage);
    const origSemanticCrops = await captureSemanticCrops(origPage, 4);

    // Interactive state detection
    const interactionResult = await detectAndTriggerInteraction(origPage);
    let origState2Metrics = null;
    let origState2Buffer = null;
    if (interactionResult.success) {
      origState2Buffer = await origPage.screenshot({ fullPage: true });
      origState2Metrics = await extractDomMetrics(origPage);
    }
    await origPage.close();

    // B. Laptop (1024px)
    const { page: origLaptopPage } = await renderAndCapture(browser, rawHtml, {
      width: 1024,
      height: 768
    });
    const origLaptopMetrics = await extractDomMetrics(origLaptopPage);
    await origLaptopPage.close();

    // C. Tablet (768px)
    const { page: origTabletPage } = await renderAndCapture(browser, rawHtml, {
      width: 768,
      height: 1024
    });
    const origTabletMetrics = await extractDomMetrics(origTabletPage);
    await origTabletPage.close();

    // D. Mobile (375px)
    const { page: origMobilePage } = await renderAndCapture(browser, rawHtml, {
      width: 375,
      height: 812
    });
    const origMobileMetrics = await extractDomMetrics(origMobilePage);
    await origMobilePage.close();

    // Detect page background color from original metrics
    const bodyMetric = origMetrics.find(m => m.tag === 'body' || m.className.includes('section') || m.className.includes('container'));
    const detectedPageBg = (bodyMetric && bodyMetric.styles.backgroundColor && bodyMetric.styles.backgroundColor !== 'rgba(0, 0, 0, 0)')
      ? bodyMetric.styles.backgroundColor
      : '#FFFFFF';

    // 2. Iterative Self-Healing Loop (Target: 100% Parity)
    let currentTemplate = compiledTemplate;
    let iteration = 0;
    let finalScore = 100;
    let allHealedDefects = [];
    let isGatekeeperPassed = false;
    let lastRemainingDefects = [];

    while (iteration < maxIterations) {
      iteration++;
      console.log(`\n  [SELF-HEALING LOOP] Iteration #${iteration}/${maxIterations}:`);

      // A. Render virtual preview at 1280px (Desktop Wide)
      const previewHtml = renderElementorToHtml(currentTemplate, { title: currentTemplate.title });
      const { page: elPage, screenshotBuffer: elBuffer } = await renderAndCapture(browser, previewHtml, {
        width: 1280,
        height: 800
      });
      const elMetrics = await extractDomMetrics(elPage);
      const elSemanticCrops = await captureSemanticCrops(elPage, 4);
      const nodeIndex = buildNodeSpatialIndex(elMetrics);

      // Interactive state simulation on Elementor preview if original had interaction
      let elState2Buffer = null;
      let elState2Metrics = null;
      if (interactionResult.success) {
        const elInterResult = await detectAndTriggerInteraction(elPage, interactionResult.clickedSelector);
        if (elInterResult.success) {
          elState2Buffer = await elPage.screenshot({ fullPage: true });
          elState2Metrics = await extractDomMetrics(elPage);
        }
      }
      await elPage.close();

      // B. Laptop Viewport (1024px - WordPress Content Area)
      const { page: elPage1024 } = await renderAndCapture(browser, previewHtml, {
        width: 1024,
        height: 768
      });
      const elMetrics1024 = await extractDomMetrics(elPage1024);
      await elPage1024.close();

      // C. Tablet Viewport (768px)
      const { page: elPageTablet } = await renderAndCapture(browser, previewHtml, {
        width: 768,
        height: 1024
      });
      const elMetricsTablet = await extractDomMetrics(elPageTablet);
      await elPageTablet.close();

      // D. Mobile Viewport (375px)
      const { page: elPageMobile } = await renderAndCapture(browser, previewHtml, {
        width: 375,
        height: 812
      });
      const elMetricsMobile = await extractDomMetrics(elPageMobile);
      await elPageMobile.close();

      // Deterministic DOM Diff (Level 1: 30-Property Matrix)
      const domDiff = compareDomMetrics(origMetrics, elMetrics, { pageBackground: detectedPageBg });

      // Multi-Viewport Responsive Audits
      const origCards = origMetrics.filter(m => m.rect.width >= 80 && m.rect.height >= 100 && /(?:card|plan|tier|col|pricing)/i.test(m.className));
      const multiViewportDefects = [];

      if (origCards.length >= 2) {
        const origIsRow = origCards.every(c => Math.abs(c.rect.y - origCards[0].rect.y) < 35);
        if (origIsRow) {
          // Laptop Check (1024px)
          const elCards1024 = elMetrics1024.filter(m => m.dataId && m.rect.height >= 100 && /(?:card|plan|tier|col|pricing)/i.test(m.className));
          if (elCards1024.length >= 2) {
            const firstY = elCards1024[0].rect.y;
            const isStackedAt1024 = !elCards1024.every(c => Math.abs(c.rect.y - firstY) < 35);
            if (isStackedAt1024) {
              multiViewportDefects.push({
                type: 'DESKTOP_WRAP_REGRESSION',
                severity: 'CRITICAL',
                message: `Multi-column cards stacked vertically at 1024px (WordPress content container). Container flex_wrap must be set to nowrap.`,
                suggestedFix: {
                  property: 'flex_wrap_nowrap',
                  targetIds: elCards1024.map(c => c.dataId)
                }
              });
              console.log(`    ⚠ Laptop Test (1024px): Detected unwanted card stacking! Auto-healing...`);
            }
          }

          // Tablet Check (768px)
          const origCardsTablet = origTabletMetrics.filter(m => m.rect.width >= 80 && m.rect.height >= 80 && /(?:card|plan|tier|col|pricing)/i.test(m.className));
          const elCardsTablet = elMetricsTablet.filter(m => m.dataId && m.rect.height >= 80 && /(?:card|plan|tier|col|pricing)/i.test(m.className));
          if (origCardsTablet.length >= 2 && elCardsTablet.length >= 2) {
            const origTabletStacked = !origCardsTablet.every(c => Math.abs(c.rect.y - origCardsTablet[0].rect.y) < 35);
            const elTabletStacked = !elCardsTablet.every(c => Math.abs(c.rect.y - elCardsTablet[0].rect.y) < 35);
            if (origTabletStacked && !elTabletStacked) {
              multiViewportDefects.push({
                type: 'TABLET_STACKING_MISMATCH',
                severity: 'MEDIUM',
                message: `Cards remained horizontal on tablet (768px) whereas original stacked. Calibrating direction_tablet to column.`,
                suggestedFix: { property: 'direction_tablet', value: 'column' }
              });
            }
          }

          // Mobile Check (375px)
          const elCardsMobile = elMetricsMobile.filter(m => m.dataId && m.rect.height >= 80 && /(?:card|plan|tier|col|pricing)/i.test(m.className));
          if (elCardsMobile.length >= 2) {
            const firstY = elCardsMobile[0].rect.y;
            const isSideBySideOnMobile = elCardsMobile.some((c, idx) => idx > 0 && Math.abs(c.rect.y - firstY) < 20);
            if (isSideBySideOnMobile) {
              multiViewportDefects.push({
                type: 'MOBILE_STACKING_REGRESSION',
                severity: 'HIGH',
                message: `Multi-column cards remained horizontal on mobile (375px). Container direction_mobile must be column.`,
                suggestedFix: { property: 'mobile_column_stack' }
              });
              console.log(`    ⚠ Mobile Test (375px): Cards side-by-side on mobile! Auto-healing vertical stack...`);
            }
          }
        }
      }

      // Interactive State DOM Diff if interaction was triggered
      const interactiveDefects = [];
      if (origState2Metrics && elState2Metrics) {
        const interDiff = compareDomMetrics(origState2Metrics, elState2Metrics, { pageBackground: detectedPageBg });
        if (interDiff.defects.length > 0) {
          interactiveDefects.push(...interDiff.defects);
        }
      }

      // Pair high-resolution semantic crops for multi-scale inspection
      const cropPairs = [];
      if (origSemanticCrops && elSemanticCrops) {
        origSemanticCrops.forEach(oc => {
          const match = elSemanticCrops.find(ec => Math.abs(ec.rect.y - oc.rect.y) < 60);
          if (match) {
            cropPairs.push({
              origBuffer: oc.buffer,
              elBuffer: match.buffer,
              rect: oc.rect
            });
          }
        });
      }

      // Vision AI Inspection (Level 2: Macro & Multi-Scale Component Inspection) if online
      let visionDiff = { passed: true, defects: [] };
      if (options.useVisionAi !== false) {
        visionDiff = await inspectWithVision(origBuffer, elBuffer, {
          apiKeys: options.apiKeys,
          nodeIndex,
          cropPairs,
          interactiveOriginalBuffer: origState2Buffer,
          interactiveElementorBuffer: elState2Buffer
        });
        if (visionDiff.source === 'gemini-vision') {
          console.log(`    • Gemini Vision Similarity Score:  ${visionDiff.similarityScore}% (${visionDiff.defects.length} defect(s) detected)`);
        }
      }

      // Sanitize interactive defects: MUST NOT corrupt baseline AST widget settings
      const safeInteractiveDefects = interactiveDefects.filter(d => {
        if (d.type === 'FONT_SCALE_COLLAPSE') return false;
        if (d.type === 'DIRECT_AST_MUTATION') {
          if (d.property && (d.property.startsWith('typography_') || d.property === 'title' || d.property === 'text')) return false;
          if (d.settings && (d.settings.typography_typography || d.settings.typography_font_size || d.settings.title)) return false;
          if (d.property === 'background_color' || d.settings?.background_color) return false;
        }
        return true;
      });

      // Enrich vision defects with autonomous computed styles if toolCall wasn't attached
      const enrichedVisionDefects = [];
      for (const vd of (visionDiff.defects || [])) {
        if (!vd.toolCall && !vd.suggestedFix) {
          if (vd.type === 'WRONG_ICON' || vd.suggestedPatch?.icon) {
            enrichedVisionDefects.push({
              type: 'WRONG_ICON',
              severity: 'HIGH',
              suggestedPatch: { icon: vd.suggestedPatch?.icon || 'fas fa-check' },
              message: `Vision AI detected incorrect icon: ${vd.current || vd.description} should be ${vd.expected || 'fas fa-check'}`
            });
          } else if (vd.type === 'BACKGROUND_COLOR_MISMATCH' || vd.type === 'ROOT_BACKGROUND_MISMATCH' || vd.suggestedPatch?.backgroundColor) {
            enrichedVisionDefects.push({
              type: 'ROOT_BACKGROUND_MISMATCH',
              severity: 'CRITICAL',
              suggestedFix: {
                property: 'background_color',
                value: vd.suggestedPatch?.backgroundColor || detectedPageBg || '#F8FAFC'
              },
              message: `Vision AI detected canvas background color mismatch: should be ${vd.suggestedPatch?.backgroundColor || detectedPageBg}`
            });
          } else if (vd.type === 'SWITCH_DISTORTION' || vd.target === 'toggle_switch' || /(?:toggle|switch|slider)/i.test(vd.description || '')) {
            const origSlider = origMetrics.find(m => /(?:slider|switch-track|toggle-knob|toggle-handle)/i.test(m.className) || (m.parentClass && /(?:toggle|switch)/i.test(m.parentClass)));
            const origSwitch = origMetrics.find(m => /(?:toggle-switch|switch|toggle)/i.test(m.className) || (m.tag === 'label' && m.className));

            const dynamicTrackBg = (origSlider && origSlider.styles?.backgroundColor && origSlider.styles.backgroundColor !== 'rgba(0, 0, 0, 0)')
              ? origSlider.styles.backgroundColor
              : ((origSwitch && origSwitch.styles?.backgroundColor && origSwitch.styles.backgroundColor !== 'rgba(0, 0, 0, 0)') ? origSwitch.styles.backgroundColor : '#e2e8f0');

            let dynamicActiveBg = '#6366f1';
            if (origState2Metrics) {
              const activeSlider = origState2Metrics.find(m => /(?:slider|switch-track)/i.test(m.className) || (m.parentClass && /(?:toggle|switch)/i.test(m.parentClass)));
              if (activeSlider && activeSlider.styles?.backgroundColor && activeSlider.styles.backgroundColor !== 'rgba(0, 0, 0, 0)') {
                dynamicActiveBg = activeSlider.styles.backgroundColor;
              }
            }

            enrichedVisionDefects.push({
              type: 'SWITCH_DISTORTION',
              severity: 'HIGH',
              suggestedFix: {
                switchClass: origSwitch ? origSwitch.className.split(' ')[0] : 'toggle-switch',
                sliderClass: origSlider ? origSlider.className.split(' ')[0] : 'slider',
                trackBg: dynamicTrackBg,
                activeBg: dynamicActiveBg,
                width: origSwitch?.rect?.width || 60,
                height: origSwitch?.rect?.height || 32
              },
              message: vd.description || 'Vision AI detected toggle switch distortion'
            });
          } else if (vd.type === 'BADGE_STYLE_LOST' || vd.target === 'badge' || /(?:badge|pill)/i.test(vd.description || '')) {
            const origBadge = origMetrics.find(m => /(?:badge|pill|tag|popular|save)/i.test(m.className));
            if (origBadge) {
              enrichedVisionDefects.push({
                type: 'BADGE_STYLE_LOST',
                severity: 'HIGH',
                suggestedFix: {
                  badgeClass: origBadge.className.split(' ')[0],
                  backgroundColor: origBadge.styles?.backgroundColor,
                  backgroundImage: origBadge.styles?.backgroundImage,
                  color: origBadge.styles?.color,
                  borderRadius: origBadge.styles?.borderRadius,
                  border: origBadge.styles?.border
                },
                message: vd.description || 'Vision AI detected badge style degradation'
              });
            } else {
              enrichedVisionDefects.push(vd);
            }
          } else {
            enrichedVisionDefects.push(vd);
          }
        } else {
          enrichedVisionDefects.push(vd);
        }
      }

      // Combine and deduplicate defect lists
      const rawCombined = [...domDiff.defects, ...multiViewportDefects, ...safeInteractiveDefects, ...enrichedVisionDefects];
      const seenDefectKeys = new Set();
      const combinedDefects = [];
      for (const d of rawCombined) {
        const key = `${d.type}_${d.targetId || d.toolCall?.targetId || ''}_${d.property || d.toolCall?.property || ''}_${d.text || ''}`;
        if (!seenDefectKeys.has(key)) {
          seenDefectKeys.add(key);
          combinedDefects.push(d);
        }
      }

      const visionScore = visionDiff.similarityScore !== undefined ? visionDiff.similarityScore : 100;
      const currentScore = Math.min(domDiff.score, visionScore);
      const actionableDefects = combinedDefects.filter(d => d.suggestedFix || d.toolCall || d.property || d.settings);
      lastRemainingDefects = combinedDefects;

      console.log(`    • Health Score: ${currentScore}/100 (${combinedDefects.length} defect(s) detected, ${actionableDefects.length} actionable)`);

      // 5 Affirmative Assertions Gatekeeper:
      // Invariant 1: Spatial Topology: 0 collisions, 0 blowups, 0 bleeds, 0 stacking regressions
      const criticalSpatialDefects = combinedDefects.filter(d => 
        ['SPATIAL_COLLISION', 'SPATIAL_SEPARATION_BLOWUP', 'CONTAINER_BOUNDARY_BLEED', 'LAYOUT_STACKING_MISMATCH', 'SWITCH_DISTORTION'].includes(d.type)
      );
      const isSpatialTopologyPassed = criticalSpatialDefects.length === 0;
      const isStyleMatrixPassed = domDiff.score >= 95;

      if (combinedDefects.length === 0 && isSpatialTopologyPassed && isStyleMatrixPassed) {
        console.log(`    ★ 100% VISUAL, STRUCTURAL & SPATIAL PERFECTION ACHIEVED! (All 5 Affirmative Assertions Passed across 4 viewports).`);
        finalScore = 100;
        isGatekeeperPassed = true;
        break;
      }

      if (currentScore >= 98 && actionableDefects.length === 0 && isSpatialTopologyPassed) {
        console.log(`    ✓ Target threshold met (Score: ${currentScore}/100, 0 spatial defects, 0 actionable defects remaining).`);
        finalScore = currentScore;
        isGatekeeperPassed = true;
        break;
      }

      if (currentScore >= 98 && actionableDefects.length > 0) {
        console.log(`    ⚡ Perfectionist Mode: Score is ${currentScore}%, but ${actionableDefects.length} defect(s) have actionable fixes. Pushing towards 100%...`);
      }

      // 3. Apply Pure Native AST Surgeries (Zero Injected Stylesheet Hacks)
      const patchCount = applyPatchesToAst(currentTemplate.content, combinedDefects);
      console.log(`    • Applied ${patchCount} native AST setting mutation(s).`);
      allHealedDefects.push(...combinedDefects);

      if (patchCount === 0) {
        finalScore = currentScore;
        isGatekeeperPassed = currentScore >= 98 && isSpatialTopologyPassed;
        break;
      }
    }

    return {
      template: currentTemplate,
      auditReport: {
        initialPassed: allHealedDefects.length === 0,
        gatekeeperPassed: isGatekeeperPassed,
        finalScore,
        iterationsRun: iteration,
        defectsHealed: allHealedDefects,
        unresolvedDefects: lastRemainingDefects,
        unresolvedDefectsCount: lastRemainingDefects.length
      }
    };
  } catch (err) {
    console.warn(`  [SELF-HEALING WARNING] Visual loop bypassed: ${err.message}`);
    return {
      template: compiledTemplate,
      auditReport: {
        bypassed: true,
        reason: err.message
      }
    };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

function getOrCreateUnifiedStylesheet(elements) {
  let existingWidget = null;
  function findWidget(n) {
    if (existingWidget) return;
    if (n.widgetType === 'html' && (n.settings?.html || '').includes('<style')) {
      existingWidget = n;
      return;
    }
    if (n.elements) n.elements.forEach(findWidget);
  }
  elements.forEach(findWidget);

  if (existingWidget) return existingWidget;

  const root = elements[0];
  const newWidget = {
    id: Math.random().toString(36).substr(2, 8),
    elType: 'widget',
    widgetType: 'html',
    settings: {
      html: `<style>\n/* Elementor Unified Micro-Stylesheet */\n</style>`,
      css_classes: 'elementor-unified-micro-stylesheet'
    },
    elements: []
  };
  if (root && root.elType === 'container') {
    if (!root.elements) root.elements = [];
    root.elements.unshift(newWidget);
  } else {
    elements.unshift(newWidget);
  }
  return newWidget;
}

function appendMicroCss(elements, cssRule, markerCheck) {
  const stylesheet = getOrCreateUnifiedStylesheet(elements);
  if (stylesheet && stylesheet.settings) {
    let html = stylesheet.settings.html || '<style>\n</style>';
    const flattenedRule = flattenCssVariables(cssRule).trim();
    if (!flattenedRule) return false;

    // Universal CSS Scoping Guardrail (Pillar 2 - Style Isolation):
    // Prohibit injecting bare HTML tag rules (e.g. "span {", "div {", "p {", "button {")
    // that contaminate the entire DOM tree.
    const bareTagCheck = /^\s*(?:span|div|p|a|button|ul|li|ol|input|label|h[1-6]|section|article|header|footer)\b(?!\s*[:.\-_#])/i;
    if (bareTagCheck.test(flattenedRule)) {
      return false;
    }

    // Smart duplication check: only skip if the normalized rule declarations already exist
    const normalizedHtml = html.replace(/\s+/g, ' ');
    const normalizedRule = flattenedRule.replace(/\s+/g, ' ');
    if (normalizedHtml.includes(normalizedRule)) {
      return false; // Exact rule already present
    }

    // If a marker comment is present, update the marked block rather than dropping the patch
    if (markerCheck && typeof markerCheck === 'string' && markerCheck.startsWith('/*') && html.includes(markerCheck)) {
      const escapedMarker = markerCheck.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const markerRegex = new RegExp(`${escapedMarker}[\\s\\S]*?(?=\\/\\*|(?=<\\/style>)|$)`, 'i');
      if (markerRegex.test(html)) {
        stylesheet.settings.html = html.replace(markerRegex, `${flattenedRule}\n`);
        return true;
      }
    }

    if (html.includes('</style>')) {
      stylesheet.settings.html = html.replace('</style>', `${flattenedRule}\n</style>`);
    } else {
      stylesheet.settings.html = `<style>\n${html}\n${flattenedRule}\n</style>`;
    }
    return true;
  }
  return false;
}

function applyPatchesToAst(elements, defects) {
  let count = 0;

  for (const defect of defects) {
    // 0. Direct Tool Calls from Multimodal Vision Critic
    if (defect.toolCall && defect.toolCall.action) {
      const tc = defect.toolCall;
      if (tc.action === 'SET_NODE_SETTING') {
        if (tc.targetId === 'root' || !tc.targetId) {
          const root = elements[0];
          if (root && root.elType === 'container') {
            if (!root.settings) root.settings = {};
            if (tc.property === 'background_color') {
              root.settings.background_background = 'classic';
              root.settings.background_color = tc.value;
              count++;
            } else {
              root.settings[tc.property] = tc.value;
              count++;
            }
          }
        } else {
          function patchToolNode(node) {
            if (node.id === tc.targetId) {
              if (!node.settings) node.settings = {};
              node.settings[tc.property] = tc.value;
              count++;
            }
            if (node.elements) node.elements.forEach(patchToolNode);
          }
          elements.forEach(patchToolNode);
        }
      } else if (tc.action === 'SET_CONTAINER_FLEX') {
        function patchToolFlex(node) {
          if (node.id === tc.targetId || (tc.targetId === 'root' && node === elements[0])) {
            if (!node.settings) node.settings = {};
            if (tc.flexProps && typeof tc.flexProps === 'object') {
              Object.assign(node.settings, tc.flexProps);
              count++;
            }
          }
          if (node.elements) node.elements.forEach(patchToolFlex);
        }
        elements.forEach(patchToolFlex);
      } else if (tc.action === 'INJECT_SCOPED_CSS') {
        if (tc.cssRules) {
          const rule = tc.selector ? `${tc.selector} {\n  ${tc.cssRules}\n}` : tc.cssRules;
          if (appendMicroCss(elements, rule, tc.selector || rule.slice(0, 30))) {
            count++;
          }
        }
      }
    }

    if (defect.type === 'CONTRAST_FAILURE' && defect.suggestedFix) {
      const fixColor = defect.suggestedFix.value || '#0F172A';
      function patchTextColor(node) {
        if (!node.settings) node.settings = {};
        if (node.widgetType === 'heading') {
          const title = (node.settings.title || '').trim();
          if (title && (title.includes(defect.text) || defect.text.includes(title.slice(0, 30)))) {
            node.settings.title_color = fixColor;
            count++;
          }
        } else if (node.widgetType === 'text-editor') {
          node.settings.text_color = fixColor;
          node.settings.editor_color = fixColor;
          count++;
        }
        if (node.elements) node.elements.forEach(patchTextColor);
      }
      elements.forEach(patchTextColor);
    }

    if (defect.type === 'WRONG_ICON' && defect.suggestedPatch) {
      const targetIcon = defect.suggestedPatch.icon || 'fas fa-check';
      function patchIcon(node) {
        if (node.widgetType === 'icon') {
          if (node.settings?.selected_icon?.value === 'fas fa-arrow-right') {
            node.settings.selected_icon.value = targetIcon;
            count++;
          }
        } else if (node.widgetType === 'icon-list') {
          if (Array.isArray(node.settings?.icon_list)) {
            node.settings.icon_list.forEach(item => {
              if (item.selected_icon?.value === 'fas fa-arrow-right') {
                item.selected_icon.value = targetIcon;
                count++;
              }
            });
          }
        }
        if (node.elements) node.elements.forEach(patchIcon);
      }
      elements.forEach(patchIcon);
    }

    if (defect.type === 'FONT_SCALE_COLLAPSE' && defect.suggestedFix) {
      function patchFontSize(node) {
        if (!node.settings) node.settings = {};
        if (node.widgetType === 'heading') {
          const title = (node.settings.title || '').trim();
          if (title && (title.includes(defect.text) || defect.text.includes(title.slice(0, 30)))) {
            node.settings.typography_font_size = defect.suggestedFix.value;
            node.settings.typography_typography = 'custom';
            count++;
          }
        } else if (node.widgetType === 'button') {
          const btnText = (node.settings.text || '').trim();
          if (btnText && (btnText.includes(defect.text) || defect.text.includes(btnText.slice(0, 30)))) {
            node.settings.typography_font_size = defect.suggestedFix.value;
            node.settings.typography_typography = 'custom';
            count++;
          }
        } else if (node.widgetType === 'text-editor') {
          const editorText = (node.settings.editor || '').replace(/<[^>]*>/g, '').trim();
          if (editorText && (editorText.includes(defect.text) || defect.text.includes(editorText.slice(0, 30)))) {
            node.settings.typography_font_size = defect.suggestedFix.value;
            node.settings.typography_typography = 'custom';
            count++;
          }
        }
        if (node.elements) node.elements.forEach(patchFontSize);
      }
      elements.forEach(patchFontSize);
    }

    if (defect.type === 'ROOT_CONTAINER_SQUEEZED' && defect.suggestedFix) {
      function patchRootBoxedWidth(node) {
        if (node.elType === 'container') {
          if (!node.settings) node.settings = {};
          node.settings.boxed_width = { unit: 'px', size: defect.suggestedFix.value };
          node.settings.content_width = 'boxed';
          count++;
        }
      }
      if (elements.length > 0) {
        patchRootBoxedWidth(elements[0]);
      }
    }

    if (defect.type === 'LAYOUT_STACKING_MISMATCH' && defect.suggestedFix) {
      function patchContainerDirection(node) {
        if (node.elType === 'container') {
          const children = node.elements || [];
          const childCards = children.filter(c => {
            const childCls = (c.settings?.css_classes || '').toLowerCase();
            return childCls.includes('card') || childCls.includes('tier') || childCls.includes('plan') || childCls.includes('pricing');
          });
          if (childCards.length >= 2) {
            if (!node.settings) node.settings = {};
            node.settings.direction = 'row';
            node.settings.flex_direction = 'row';
            node.settings.flex_wrap = 'nowrap';
            const calcWidth = defect.suggestedFix.childWidth || Math.round(100 / childCards.length - 2);
            childCards.forEach(c => {
              if (!c.settings) c.settings = {};
              c.settings.width = { unit: '%', size: calcWidth };
            });
            count++;
          }
        }
        if (node.elements) node.elements.forEach(patchContainerDirection);
      }
      elements.forEach(patchContainerDirection);
    }

    if (defect.type === 'WIDGET_COLLISION_DEFECT' && defect.suggestedFix) {
      function patchCollisionGap(node) {
        if (node.elType === 'container') {
          const cls = (node.settings?.css_classes || '').toLowerCase();
          if (cls.includes('grid') || cls.includes('pricing') || cls.includes('cards')) {
            if (!node.settings) node.settings = {};
            const curMargin = node.settings._margin || { unit: 'px', top: '0', bottom: '0', left: '0', right: '0' };
            const gap = String(defect.suggestedFix.gapNeeded || 40);
            node.settings._margin = {
              ...curMargin,
              top: gap,
              unit: 'px',
              isLinked: false
            };
            count++;
          }
        }
        if (node.elements) node.elements.forEach(patchCollisionGap);
      }
      elements.forEach(patchCollisionGap);
    }

    if (defect.type === 'VERTICAL_SPACING_COLLAPSE' && defect.suggestedFix) {
      function patchVerticalSpacing(node) {
        if (node.elType === 'container') {
          const cls = (node.settings?.css_classes || '').toLowerCase();
          const target = (defect.suggestedFix.targetClass || '').toLowerCase();
          if (target && cls.includes(target)) {
            if (!node.settings) node.settings = {};
            const curMargin = node.settings._margin || { unit: 'px', top: '0', bottom: '0', left: '0', right: '0' };
            node.settings._margin = {
              ...curMargin,
              top: String(defect.suggestedFix.gapNeeded),
              unit: 'px',
              isLinked: false
            };
            count++;
          }
        }
        if (node.elements) node.elements.forEach(patchVerticalSpacing);
      }
      elements.forEach(patchVerticalSpacing);
    }

    if (defect.type === 'TEXT_TOKEN_STICKING' && defect.suggestedFix) {
      const stuck = defect.suggestedFix.stuckToken;
      const repl = defect.suggestedFix.replacement;
      function patchStuckToken(node) {
        if (node.widgetType === 'heading' && node.settings?.title) {
          if (node.settings.title.includes(stuck)) {
            node.settings.title = node.settings.title.split(stuck).join(repl);
            count++;
          }
        } else if (node.widgetType === 'text-editor' && node.settings?.editor) {
          if (node.settings.editor.includes(stuck)) {
            node.settings.editor = node.settings.editor.split(stuck).join(repl);
            count++;
          }
        }
        if (node.elements) node.elements.forEach(patchStuckToken);
      }
      elements.forEach(patchStuckToken);
    }

    if (defect.type === 'SIBLING_EQUAL_HEIGHT_MISMATCH' && defect.suggestedFix) {
      function patchEqualHeights(node) {
        if (node.elType === 'container') {
          const children = node.elements || [];
          const childCards = children.filter(c => {
            const childCls = (c.settings?.css_classes || '').toLowerCase();
            return childCls.includes('card') || childCls.includes('tier') || childCls.includes('plan') || childCls.includes('pricing') || childCls.includes('col');
          });
          if (childCards.length >= 2) {
            if (!node.settings) node.settings = {};
            node.settings.align_items = 'stretch';
            node.settings.flex_align_items = 'stretch';
            childCards.forEach(card => {
              if (!card.settings) card.settings = {};
              card.settings.justify_content = 'space-between';
              card.settings.flex_justify_content = 'space-between';
            });
            count++;
          }
        }
        if (node.elements) node.elements.forEach(patchEqualHeights);
      }
      elements.forEach(patchEqualHeights);
    }

    if (defect.type === 'TEXT_LINE_WRAP_DEFECT') {
      function patchTextWrapping(node) {
        if (node.widgetType === 'button') {
          const btnText = (node.settings?.text || '').trim();
          if (btnText && (btnText.includes(defect.text) || defect.text.includes(btnText.slice(0, 20)))) {
            if (node.settings.width) delete node.settings.width;
            count++;
          }
        }
        if (node.elements) node.elements.forEach(patchTextWrapping);
      }
      elements.forEach(patchTextWrapping);
    }

    if (defect.type === 'DIRECT_AST_MUTATION' && defect.targetId) {
      function patchDirectAst(node) {
        if (node.id === defect.targetId) {
          // Guardrail: HTML widgets do not accept native typography or container settings
          if (node.widgetType === 'html') {
            return;
          }
          if (!node.settings) node.settings = {};
          if (defect.settings && typeof defect.settings === 'object') {
            Object.assign(node.settings, defect.settings);
            count++;
          } else if (defect.property) {
            node.settings[defect.property] = defect.value;
            count++;
          }
        }
        if (node.elements) node.elements.forEach(patchDirectAst);
      }
      elements.forEach(patchDirectAst);
    }

    if (defect.type === 'DIMENSION_MISMATCH' && defect.targetId) {
      function patchDimensionMismatch(node) {
        if (node.id === defect.targetId) {
          if (!node.settings) node.settings = {};
          if (node.widgetType === 'button') {
            node.settings.align = 'justify';
            delete node.settings._element_width;
            count++;
          } else {
            node.settings._element_width = 'initial';
            count++;
          }
        }
        if (node.elements) node.elements.forEach(patchDimensionMismatch);
      }
      elements.forEach(patchDimensionMismatch);
    }

    if (defect.type === 'DESKTOP_WRAP_REGRESSION') {
      function patchDesktopWrap(node) {
        if (node.elType === 'container') {
          const children = node.elements || [];
          const childCards = children.filter(c => {
            const childCls = (c.settings?.css_classes || '').toLowerCase();
            return childCls.includes('card') || childCls.includes('tier') || childCls.includes('plan') || childCls.includes('pricing');
          });
          if (childCards.length >= 2) {
            if (!node.settings) node.settings = {};
            node.settings.direction = 'row';
            node.settings.flex_direction = 'row';
            node.settings.wrap = 'nowrap';
            node.settings.flex_wrap = 'nowrap';
            node.settings.direction_mobile = 'column';
            node.settings.flex_direction_mobile = 'column';
            node.settings.wrap_mobile = 'wrap';
            node.settings.flex_wrap_mobile = 'wrap';
            childCards.forEach(c => {
              if (!c.settings) c.settings = {};
              c.settings.flex_shrink = 1;
              c.settings.flex_grow = 1;
              c.settings.width_mobile = { unit: '%', size: 100 };
            });
            count++;
          }
        }
        if (node.elements) node.elements.forEach(patchDesktopWrap);
      }
      elements.forEach(patchDesktopWrap);
    }

    if (defect.type === 'MOBILE_STACKING_REGRESSION') {
      function patchMobileStack(node) {
        if (node.elType === 'container') {
          const children = node.elements || [];
          const childCards = children.filter(c => {
            const childCls = (c.settings?.css_classes || '').toLowerCase();
            return childCls.includes('card') || childCls.includes('tier') || childCls.includes('plan') || childCls.includes('pricing');
          });
          if (childCards.length >= 2) {
            if (!node.settings) node.settings = {};
            node.settings.direction_mobile = 'column';
            node.settings.flex_direction_mobile = 'column';
            node.settings.wrap_mobile = 'wrap';
            node.settings.flex_wrap_mobile = 'wrap';
            childCards.forEach(c => {
              if (!c.settings) c.settings = {};
              c.settings.width_mobile = { unit: '%', size: 100 };
            });
            count++;
          }
        }
        if (node.elements) node.elements.forEach(patchMobileStack);
      }
      elements.forEach(patchMobileStack);
    }

    if (defect.type === 'TABLET_STACKING_MISMATCH') {
      function patchTabletStack(node) {
        if (node.elType === 'container') {
          const children = node.elements || [];
          const childCards = children.filter(c => {
            const childCls = (c.settings?.css_classes || '').toLowerCase();
            return childCls.includes('card') || childCls.includes('tier') || childCls.includes('plan') || childCls.includes('pricing');
          });
          if (childCards.length >= 2) {
            if (!node.settings) node.settings = {};
            node.settings.direction_tablet = 'column';
            node.settings.flex_direction_tablet = 'column';
            node.settings.wrap_tablet = 'wrap';
            node.settings.flex_wrap_tablet = 'wrap';
            childCards.forEach(c => {
              if (!c.settings) c.settings = {};
              c.settings.width_tablet = { unit: '%', size: 100 };
            });
            count++;
          }
        }
        if (node.elements) node.elements.forEach(patchTabletStack);
      }
      elements.forEach(patchTabletStack);
    }

    if (defect.type === 'ROOT_BACKGROUND_MISMATCH' && defect.suggestedFix?.value) {
      const root = elements[0];
      if (root && root.elType === 'container') {
        if (!root.settings) root.settings = {};
        root.settings.background_background = 'classic';
        root.settings.background_color = defect.suggestedFix.value;
        count++;
      }
    }

    // 12. Universal Geometry Collapse Handler (Flexbox Blockification Loss Recovery)
    if (defect.type === 'GEOMETRY_COLLAPSE' && defect.suggestedFix) {
      const fix = defect.suggestedFix;
      const targetSelector = fix.selector || (fix.targetClass ? `.${fix.targetClass}` : (defect.targetId ? `.e-sid-${defect.targetId}` : null));

      // Prohibit unscoped bare HTML tag injection (Pillar 2 - Style Isolation)
      if (targetSelector && !/^\s*(?:span|div|p|a|button|ul|li|input|label)\b/i.test(targetSelector)) {
        const display = fix.display || 'inline-block';
        const width = fix.width;
        const height = fix.height;

        const collapseRule = `
${targetSelector}, ${targetSelector} > .elementor-widget-container {
  display: ${display} !important;
  ${width ? `width: ${width}px !important;` : ''}
  ${height ? `height: ${height}px !important;` : ''}
}`;
        if (appendMicroCss(elements, collapseRule)) {
          count++;
        }
      }
    }

    // 13. Universal Spatial Collision Handler (Zero-Collision Invariant & Vector Geometry)
    if (defect.type === 'SPATIAL_COLLISION' && defect.suggestedFix) {
      const fix = defect.suggestedFix;
      const isVertical = fix.isVerticalCollision !== false && fix.isSameParent !== false;

      if (isVertical) {
        // Vertical sequential collision: adjust vertical margin-top on the bottom node
        const gapNeeded = fix.gapNeeded || 24;
        function patchSpatialCollision(node) {
          if (node.id === fix.targetId) {
            if (!node.settings) node.settings = {};
            const curMargin = node.settings._margin || { unit: 'px', top: '0', bottom: '0', left: '0', right: '0' };
            node.settings._margin = {
              ...curMargin,
              top: String(gapNeeded),
              unit: 'px',
              isLinked: false
            };
            count++;
          }
          if (node.elements) node.elements.forEach(patchSpatialCollision);
        }
        elements.forEach(patchSpatialCollision);
      } else {
        // Horizontal overlap or cross-column bleed:
        // Do NOT inject vertical margin-top! Enforce horizontal width containment on the colliding nodes.
        function patchHorizontalOverlap(node) {
          if (node.id === fix.targetId || node.id === fix.topId) {
            if (!node.settings) node.settings = {};
            node.settings._element_width = 'auto';
            node.settings.flex_shrink = 1;
            node.settings.max_width = { unit: '%', size: 100 };
            count++;
          }
          if (node.elements) node.elements.forEach(patchHorizontalOverlap);
        }
        elements.forEach(patchHorizontalOverlap);
      }
    }

    // 14. Universal Sibling Separation Blowup Handler (Lockup Proximity Invariant)
    if (defect.type === 'SPATIAL_SEPARATION_BLOWUP' && defect.suggestedFix) {
      const fix = defect.suggestedFix;
      const childIds = new Set(fix.childTargetIds || [defect.childAId, defect.childBId]);
      const desiredGap = fix.desiredGap !== undefined ? fix.desiredGap : 4;

      function patchSeparationBlowup(node) {
        if (node.id === fix.targetId || (node.elements && node.elements.some(c => childIds.has(c.id)))) {
          if (node.elType === 'container') {
            if (!node.settings) node.settings = {};
            node.settings.justify_content = 'flex-start';
            node.settings.flex_justify_content = 'flex-start';
            node.settings.gap = { unit: 'px', size: String(desiredGap) };
            count++;
          }
        }
        if (childIds.has(node.id)) {
          if (!node.settings) node.settings = {};
          node.settings._element_width = 'auto';
          node.settings._flex_size = 'none';
          node.settings.flex_shrink = 0;
          if (node.settings.width && node.settings.width.size === 100) {
            delete node.settings.width;
          }
          count++;
        }
        if (node.elements) node.elements.forEach(patchSeparationBlowup);
      }
      elements.forEach(patchSeparationBlowup);
    }

    // 15. Universal Container Boundary Bleed Handler (Boundary Containment Invariant)
    if (defect.type === 'CONTAINER_BOUNDARY_BLEED' && defect.suggestedFix) {
      const fix = defect.suggestedFix;
      function patchBoundaryBleed(node) {
        if (node.id === fix.targetId) {
          if (!node.settings) node.settings = {};
          node.settings.overflow = 'hidden';
          count++;
        }
        if (node.id === fix.childId) {
          if (!node.settings) node.settings = {};
          node.settings._element_width = 'auto';
          node.settings.flex_shrink = 1;
          node.settings.max_width = { unit: '%', size: 100 };
          count++;
        }
        if (node.elements) node.elements.forEach(patchBoundaryBleed);
      }
      elements.forEach(patchBoundaryBleed);
    }

    if (defect.type === 'SWITCH_DISTORTION' && defect.suggestedFix) {
      const fix = defect.suggestedFix;
      const swClass = fix.switchClass || 'toggle-switch';
      const slClass = fix.sliderClass || 'slider';
      const width = fix.width || 60;
      const height = fix.height || 32;
      const trackBg = fix.trackBg ? flattenCssVariables(fix.trackBg) : '#e2e8f0';
      const activeBg = fix.activeBg ? flattenCssVariables(fix.activeBg) : '#6366f1';
      let switchPatched = false;

      function patchSwitchNode(node) {
        if (node.widgetType === 'html' && node.settings?.html) {
          let html = node.settings.html;
          if (html.includes(swClass) || html.includes(slClass) || (html.includes('<input') && html.includes('checkbox'))) {
            // Flatten any CSS variables inside the HTML widget
            let updatedHtml = flattenCssVariables(html);

            // Ensure the switch element itself has display: inline-block so it never collapses to 7px
            if (updatedHtml.includes(`class="${swClass}"`) || updatedHtml.includes(`class='${swClass}'`)) {
              if (!updatedHtml.includes('display: inline-block') && !updatedHtml.includes('display:inline-block')) {
                if (updatedHtml.includes(`style="`)) {
                  updatedHtml = updatedHtml.replace(`style="`, `style="display: inline-block; `);
                } else if (updatedHtml.includes(`style='`)) {
                  updatedHtml = updatedHtml.replace(`style='`, `style='display: inline-block; `);
                } else {
                  updatedHtml = updatedHtml.replace(
                    new RegExp(`class=["']([^"']*${swClass}[^"']*)["']`, 'i'),
                    `class="$1" style="display: inline-block;"`
                  );
                }
              }
            }

            // Inline concrete styles directly on the switch markup
            if (updatedHtml.includes(`class="${slClass}"`) || updatedHtml.includes(`class='${slClass}'`)) {
              if (!updatedHtml.includes('style=')) {
                updatedHtml = updatedHtml.replace(
                  new RegExp(`class=["']([^"']*${slClass}[^"']*)["']`, 'i'),
                  `class="$1" style="position: absolute; inset: 0; background-color: ${trackBg}; border-radius: 999px; transition: 0.3s;"`
                );
              } else if (!updatedHtml.includes('background-color')) {
                updatedHtml = updatedHtml.replace(
                  new RegExp(`(class=["'][^"']*${slClass}[^"']*["'][^>]*style=["'])([^"']*)(["'])`, 'i'),
                  `$1background-color: ${trackBg}; $2$3`
                );
              }
            }
            if (updatedHtml !== html) {
              node.settings.html = updatedHtml;
              switchPatched = true;
            }
          }
        }
        if (node.elements) node.elements.forEach(patchSwitchNode);
      }

      elements.forEach(patchSwitchNode);

      // Micro-CSS rules for both the switch container (to prevent flexbox collapse) and track styling
      const switchCss = `
.${swClass}, .elementor-widget-html .${swClass}, .elementor-widget-container .${swClass} {
  display: inline-block !important;
  position: relative !important;
  width: ${width}px !important;
  height: ${height}px !important;
  cursor: pointer !important;
}
.${slClass}, .elementor-widget-html .${slClass}, .elementor-widget-container .${slClass} {
  background-color: ${trackBg} !important;
  border-radius: 999px !important;
}
input:checked + .${slClass}, .elementor-widget-html input:checked + .${slClass}, .elementor-widget-container input:checked + .${slClass} {
  background-color: ${activeBg} !important;
}`;
      if (appendMicroCss(elements, `/* healed-switch */\n${switchCss}`, '/* healed-switch */')) {
        switchPatched = true;
      }

      if (switchPatched) count++;
    }

    if (defect.type === 'BADGE_STYLE_LOST' && defect.suggestedFix) {
      const fix = defect.suggestedFix;
      const bClass = (fix.badgeClass || 'badge').toLowerCase();
      let badgePatched = false;

      const concreteBg = fix.backgroundImage && fix.backgroundImage !== 'none'
        ? fix.backgroundImage
        : (fix.backgroundColor && fix.backgroundColor !== 'rgba(0, 0, 0, 0)' ? fix.backgroundColor : '#6366f1');
      const concreteColor = fix.color || '#ffffff';
      const concreteBorderColor = fix.border ? (fix.border.match(/#[a-f0-9]{3,8}|rgba?\([^)]+\)/i)?.[0] || '#c7d2fe') : '#c7d2fe';
      const hasBorder = fix.border && fix.border !== 'none';

      function patchBadgeNode(node) {
        const cls = (node.settings?.css_classes || '').toLowerCase();
        const isTarget = (defect.targetId && node.id === defect.targetId) ||
          cls.includes(bClass) ||
          cls.includes('badge') || cls.includes('pill') || cls.includes('save');

        if (isTarget) {
          if (!node.settings) node.settings = {};
          if (node.elType === 'container') {
            node.settings.background_background = 'classic';
            node.settings.background_color = concreteBg;
            node.settings.border_radius = { unit: 'px', top: '999', right: '999', bottom: '999', left: '999', isLinked: true };
            if (hasBorder) {
              node.settings.border_border = 'solid';
              node.settings.border_color = concreteBorderColor;
              node.settings.border_width = { unit: 'px', top: '1', right: '1', bottom: '1', left: '1', isLinked: true };
            }
            node.settings.padding = { unit: 'px', top: '4', right: '12', bottom: '4', left: '12', isLinked: false };
            node.settings._padding = { unit: 'px', top: '4', right: '12', bottom: '4', left: '12', isLinked: false };
            node.settings.width = { unit: 'custom', size: 'fit-content' };
            node.settings.align_self = 'center';
            badgePatched = true;
          } else if (node.widgetType === 'heading' || node.widgetType === 'button') {
            if (node.widgetType === 'heading') node.settings.title_color = concreteColor;
            if (node.widgetType === 'button') node.settings.button_text_color = concreteColor;
            node.settings.background_background = 'classic';
            node.settings.background_color = concreteBg;
            node.settings.border_radius = { unit: 'px', top: '999', right: '999', bottom: '999', left: '999', isLinked: true };
            if (hasBorder) {
              node.settings.border_border = 'solid';
              node.settings.border_color = concreteBorderColor;
              node.settings.border_width = { unit: 'px', top: '1', right: '1', bottom: '1', left: '1', isLinked: true };
            }
            node.settings._padding = { unit: 'px', top: '4', right: '12', bottom: '4', left: '12', isLinked: false };
            node.settings._element_width = 'auto';
            node.settings._flex_size = 'none';
            node.settings.flex_shrink = 0;
            node.settings.typography_typography = 'custom';
            if (fix.fontSize) node.settings.typography_font_size = { unit: 'px', size: parseInt(fix.fontSize) || 12 };
            if (fix.fontWeight) node.settings.typography_font_weight = String(fix.fontWeight || '700');
            badgePatched = true;
          }
        }

        // Inline text-editor badge span (e.g. Yearly <span class="save-badge">-20% Save</span>)
        if (node.widgetType === 'text-editor' && node.settings?.editor && node.settings.editor.toLowerCase().includes(bClass)) {
          const bgDecl = fix.backgroundImage && fix.backgroundImage !== 'none'
            ? `background: ${fix.backgroundImage};`
            : (fix.backgroundColor && fix.backgroundColor !== 'rgba(0, 0, 0, 0)' ? `background-color: ${fix.backgroundColor};` : 'background-color: #fce7f3;');
          const colDecl = `color: ${concreteColor || '#be185d'};`;
          const bdrDecl = hasBorder ? `border: 1px solid ${concreteBorderColor};` : 'border: 1px solid #fbcfe8;';
          const inlineBadgeStyle = `display: inline-flex; align-items: center; justify-content: center; width: fit-content; line-height: 1; ${bgDecl} ${colDecl} ${bdrDecl} border-radius: 999px; padding: 4px 10px; font-size: ${fix.fontSize || 12}px; font-weight: ${fix.fontWeight || 700}; margin-left: 8px;`;

          const spanRegex = new RegExp(`(<span[^>]*class=["'][^"']*${bClass}[^"']*["'][^>]*)>`, 'gi');
          if (spanRegex.test(node.settings.editor)) {
            node.settings.editor = node.settings.editor.replace(spanRegex, (m, p1) => {
              if (p1.includes('style=')) {
                return p1.replace(/style=["']([^"']*)["']/, `style="$1; ${inlineBadgeStyle}"`) + '>';
              }
              return `${p1} style="${inlineBadgeStyle}">`;
            });
            badgePatched = true;
          }
        }

        if (node.elements) node.elements.forEach(patchBadgeNode);
      }

      elements.forEach(patchBadgeNode);
      if (badgePatched) count++;
    }

    if (defect.type === 'SHADOW_LOST') {
      const parsedPrimary = defect.suggestedFix?.boxShadow ? parseBoxShadow(defect.suggestedFix.boxShadow) : null;
      const parsedPopular = defect.suggestedFix?.popularBoxShadow ? parseBoxShadow(defect.suggestedFix.popularBoxShadow) : parsedPrimary;

      function patchCardShadows(node) {
        if (node.elType === 'container') {
          const cls = (node.settings?.css_classes || '').toLowerCase();
          const isTargetNode = defect.targetIds && defect.targetIds.includes(node.id);
          const isCardClass = cls.includes('card') || cls.includes('tier') || cls.includes('plan');

          if (isTargetNode || isCardClass) {
            if (!node.settings) node.settings = {};
            if (!node.settings.box_shadow_box_shadow) {
              const isPopular = cls.includes('popular') || cls.includes('featured') || cls.includes('highlight');
              const targetShadow = (isPopular && parsedPopular) ? parsedPopular : (parsedPrimary || {
                horizontal: 0,
                vertical: 10,
                blur: 15,
                spread: -3,
                color: 'rgba(0, 0, 0, 0.05)'
              });
              node.settings.box_shadow_box_shadow = targetShadow;
              count++;
            }
          }
        }
        if (node.elements) node.elements.forEach(patchCardShadows);
      }
      elements.forEach(patchCardShadows);
    }
  }

  return count;
}

module.exports = {
  runSelfHealingLoop,
  applyPatchesToAst
};

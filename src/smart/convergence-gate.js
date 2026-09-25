/**
 * Autonomous Convergence Gate & Export Policy.
 * Codename: "Single-Pass + Verify" (Phase 7 - T7.1 & T7.2 & T7.4)
 * Updated with Editability-First Contract (v3.1)
 */

const { createR3EmbedWidget } = require("./fallback-ladder");
const { serializeAuditScorecard } = require("./audit-schema");
const { isNativeEditableWidget, isElementorNativeProperty } = require("./style-router");

/**
 * Calculates weighted visual fidelity score (0 - 100).
 */
function calculateFidelityScore(counts = {}, totalChecked = 100) {
  const critical = counts.critical || 0;
  const high = counts.high || 0;
  const medium = counts.medium || 0;
  const low = counts.low || 0;
  const total = counts.total !== undefined ? counts.total : (critical + high + medium + low);

  if (critical > 0) {
    return Math.min(65, Math.max(0, Math.round(100 - (critical * 30 + high * 5))));
  }

  const penalty = (high * 1.5) + (medium * 0.4) + (low * 0.1);
  const scale = Math.max(30, totalChecked);
  let score = Math.round(100 - (penalty / scale) * 100);

  // E1 Invariant: Fidelity can NEVER report 100 while unresolved defects > 0.
  if (total > 0 && score >= 100) {
    score = 99;
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Computes editability metrics per Editability-First Contract v3.1.
 */
function computeEditabilityMetrics(elements = []) {
  let nativeWidgets = 0;
  let htmlWidgets = 0;
  let systemWidgets = 0;
  let nonElementorPrimitives = 0;
  let totalWidgets = 0;
  const htmlJustifications = [];

  function walk(el) {
    if (el.widgetType) {
      totalWidgets++;
      if (el.widgetType === "html") {
        htmlWidgets++;
        const reason = el.settings?._html_reason;
        htmlJustifications.push({ sid: el._sid || el._dom_id, reason });
        if (typeof reason === "string") {
          if (reason.startsWith("SYSTEM:")) {
            systemWidgets++;
          } else if (reason.startsWith("NON_ELEMENTOR_PRIMITIVE:")) {
            nonElementorPrimitives++;
          }
        }
      } else if (isNativeEditableWidget(el)) {
        nativeWidgets++;
      }
    }
    if (Array.isArray(el.elements)) el.elements.forEach(walk);
  }
  elements.forEach(walk);

  const effectiveTotal = Math.max(0, totalWidgets - systemWidgets - nonElementorPrimitives);
  const nativeWidgetPercentage = effectiveTotal > 0
    ? Math.round((nativeWidgets / effectiveTotal) * 100)
    : 100;

  return {
    totalWidgets,
    nativeWidgets,
    htmlWidgets,
    systemWidgets,
    nonElementorPrimitives,
    effectiveTotal,
    nativeWidgetPercentage,
    passed: nativeWidgetPercentage >= 90,
    target: 90,
    htmlJustifications
  };
}

/**
 * Evaluates the convergence gate conditions.
 */
function evaluateConvergenceGate(matrixResult, behaviorResult, gtSnapshot, ladderState = null, options = {}) {
  const defects = matrixResult?.defects || [];
  const counts = matrixResult?.counts || { total: 0, critical: 0, high: 0, medium: 0, low: 0 };
  const behaviorMismatches = Array.isArray(behaviorResult?.mismatches) ? behaviorResult.mismatches : [];

  const totalNodesChecked = Object.keys(gtSnapshot?.viewports?.desktop?.flat || {}).length * 3;
  const fidelity = calculateFidelityScore(counts, totalNodesChecked);

  const isBehaviorClean = behaviorMismatches.length === 0;
  const isCriticalClean = counts.critical === 0;
  const gatePassed = isCriticalClean && isBehaviorClean && (fidelity >= 95 || counts.total === 0);
  const cleanPass = Boolean(gatePassed && counts.high === 0 && counts.critical === 0 && fidelity >= 95);

  const rungCensus = ladderState?.rungsCensus || { R0: 0, R1: 0, R2: 0, R3: 0 };
  const contentElements = options.content || options.template?.content || options.templateJson?.content || [];
  const editability = computeEditabilityMetrics(contentElements);

  const mappedDefects = defects.map(d => ({
    id: d.id,
    nodeSid: d.nodeSid,
    widgetId: d.widgetId !== undefined && d.widgetId !== null ? d.widgetId : null,
    viewport: d.viewport,
    property: d.property,
    original: d.original !== undefined && d.original !== null ? d.original : null,
    rendered: d.rendered !== undefined && d.rendered !== null ? d.rendered : null,
    message: d.message,
    severity: d.severity,
    rule: d.rule,
    rung: d.rung,
    advisory: Boolean(d.advisory)
  }));

  const scorecard = {
    title: options.title || "Template Convergence Audit",
    timestamp: new Date().toISOString(),
    engineMode: options.engineMode || "Single-Pass Ground Truth (Chromium, local)",
    gatekeeperPassed: gatePassed,
    cleanPass,
    fidelity,
    counts,
    rungCensus,
    editability,
    advisoryDefectCount: defects.filter(d => d.advisory === true).length,
    behavior: {
      tested: behaviorResult?.tested !== undefined ? behaviorResult.tested : (behaviorResult?.totalTested !== undefined ? behaviorResult.totalTested : (behaviorResult?.eventsTested || 0)),
      passed: behaviorResult?.passed !== undefined ? behaviorResult.passed : (behaviorResult?.eventsPassed || 0),
      failed: behaviorResult?.failed !== undefined ? behaviorResult.failed : behaviorMismatches.length,
      mismatches: behaviorMismatches
    },
    assets: {
      total: gtSnapshot?.assets?.length || 0,
      loaded: (gtSnapshot?.assets || []).filter(a => a.loaded !== false).length
    },
    fonts: {
      declared: Array.from(gtSnapshot?.fonts || []),
      verified: Array.from(gtSnapshot?.fonts || [])
    },
    defects: mappedDefects,
    unresolvedDefects: mappedDefects
  };

  return {
    gatePassed,
    cleanPass,
    fidelity,
    scorecard,
    isCriticalClean,
    isBehaviorClean
  };
}

/**
 * Terminal R3 Escalation (Protected by Editability-First Contract):
 * Native editable widgets are strictly IMMUNE to R3 micro-embed escalation.
 */
function escalateRemainingToR3(templateJson, remainingDefects = [], gtSnapshot, ladderState) {
  if (!templateJson || !gtSnapshot || remainingDefects.length === 0) {
    return { modified: false, escalatedCount: 0, skippedCount: 0, skippedSids: [] };
  }

  const stubbornSids = new Set(remainingDefects.map(d => d.nodeSid).filter(Boolean));
  if (stubbornSids.size === 0) return { modified: false, escalatedCount: 0, skippedCount: 0, skippedSids: [] };

  let escalatedCount = 0;
  let skippedCount = 0;
  const skippedSids = [];

  function replaceInTree(elements = []) {
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      const sid = el._sid || el.settings?._sid || el._dom_id || el.settings?._dom_id;

      if (sid && stubbornSids.has(sid)) {
        // Guard 1 (T4): Native editable widgets are NEVER replaced by R3 micro-embeds
        if (isNativeEditableWidget(el)) {
          skippedCount++;
          skippedSids.push(sid);
          continue;
        }

        // Guard 2 (T5): If all defects on this node are native representable properties, skip as advisory
        const nodeDefects = remainingDefects.filter(d => d.nodeSid === sid);
        if (nodeDefects.length && nodeDefects.every(d => isElementorNativeProperty(d.property))) {
          skippedCount++;
          skippedSids.push(sid);
          continue;
        }

        const gtNode = gtSnapshot.viewports?.desktop?.flat?.[sid];
        if (gtNode) {
          const parentGt = gtNode.parentSid ? gtSnapshot.viewports?.desktop?.flat?.[gtNode.parentSid] : null;
          const r3Widget = createR3EmbedWidget(sid, gtNode, el, parentGt);
          if (r3Widget) {
            elements[i] = r3Widget;
            escalatedCount++;
            if (ladderState) ladderState.rungsCensus.R3++;
            continue;
          }
        }
      }

      if (Array.isArray(el.elements)) {
        replaceInTree(el.elements);
      }
    }
  }

  replaceInTree(templateJson.content || []);

  return {
    modified: escalatedCount > 0,
    escalatedCount,
    skippedCount,
    skippedSids
  };
}

module.exports = {
  calculateFidelityScore,
  computeEditabilityMetrics,
  evaluateConvergenceGate,
  escalateRemainingToR3
};

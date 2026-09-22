/**
 * Autonomous Targeted Healing Diagnoser -- Editability-First Contract (v3.1).
 * Codename: "Single-Pass + Verify" (Phase 4 - T4.1 & T4.2 / Phase 5 - T5)
 */

const { applyR1Mutation, generateR2Rule, createR3EmbedWidget } = require("./fallback-ladder");
const { createHtmlWidget } = require("../transformers/widget-transformer");
const { isElementorNativeProperty, isNativeEditableWidget } = require("./style-router");
const { CRITICAL_RULES } = require("./audit-schema");
const { deduplicateAndConsolidateCss } = require("../normalizers/css-classifier");

function buildNodeIndex(elements = [], parent = null, map = new Map()) {
  for (const el of elements) {
    const sid = el._sid || el.settings?._sid || el._dom_id || el.settings?._dom_id;
    if (sid) {
      map.set(sid, { element: el, parent });
    }
    if (Array.isArray(el.elements)) {
      buildNodeIndex(el.elements, el, map);
    }
  }
  return map;
}

/**
 * Injects R2 scoped CSS into the template stylesheet widget.
 * Enforces strict template-level cap (<= 40 CSS rules / braces).
 */
function injectR2RulesIntoTemplate(templateJson, r2Rules) {
  if (!r2Rules || r2Rules.size === 0) return;

  // C3.2: Enforce strict template-level R2 cap (<= 40 rules / opening braces)
  const MAX_CAP = 40;
  const r2Array = Array.from(r2Rules);
  const truncatedRules = [];
  let braceCount = 0;

  for (const rule of r2Array) {
    const bracesInRule = (rule.match(/\{/g) || []).length || 1;
    if (braceCount + bracesInRule > MAX_CAP) {
      break; // Truncate to strictly satisfy C12 cap
    }
    truncatedRules.push(rule);
    braceCount += bracesInRule;
  }

  if (truncatedRules.length === 0) return;

  const cssBlock = deduplicateAndConsolidateCss(truncatedRules.join("\n"));
  let hasStylesheet = false;

  function findStylesheet(n) {
    if (n.widgetType === "html" && (n.settings?.html || "").includes("/* SCOPED_R2_HEALING */")) {
      n.settings.html = `<style>\n/* SCOPED_R2_HEALING */\n${cssBlock}\n</style>`;
      hasStylesheet = true;
      return;
    }
    if (Array.isArray(n.elements)) n.elements.forEach(findStylesheet);
  }

  (templateJson.content || []).forEach(findStylesheet);

  if (!hasStylesheet) {
    const r2Widget = createHtmlWidget({
      html: `<style>\n/* SCOPED_R2_HEALING */\n${cssBlock}\n</style>`,
      css_classes: "scoped-r2-healing-engine",
      _html_reason: "SYSTEM:stylesheet-engine"
    });
    const root = templateJson.content?.[0];
    if (root && Array.isArray(root.elements)) {
      root.elements.unshift(r2Widget);
    } else {
      (templateJson.content = templateJson.content || []).unshift(r2Widget);
    }
  }
}

/**
 * Diagnoses defects and applies targeted healing per Editability-First routing.
 */
function diagnoseAndHeal(templateJson, defects = [], gtSnapshot = null, ladderState = null) {
  if (!ladderState) {
    ladderState = {
      mutationHistory: new Set(),
      oscillationCount: new Map(),
      r2Rules: new Set(),
      rungsCensus: { R0: 0, R1: 0, R2: 0, R3: 0 }
    };
  }
  if (!ladderState.oscillationCount) {
    ladderState.oscillationCount = new Map();
  }

  const sidIndex = buildNodeIndex(templateJson.content || []);
  let mutationsApplied = 0;
  let protectedCount = 0;

  for (const defect of defects) {
    const sid = defect.nodeSid;
    if (!sid) continue;

    const vp = defect.viewport || "desktop";
    const key = `${sid}:${vp}:${defect.property}`;
    const entry = sidIndex.get(sid);
    const element = entry?.element;
    const isNative = isNativeEditableWidget(element);
    const isNativeProp = isElementorNativeProperty(defect.property);

    // Oscillation Tracking
    const currentOscillations = (ladderState.oscillationCount.get(key) || 0) + 1;
    ladderState.oscillationCount.set(key, currentOscillations);

    // Guard: Critical rules (e.g. RULE-STATE-01, RULE-ASSET-01, RULE-DOM-01) are immune from advisory demotion or ladder mutation
    if (CRITICAL_RULES.includes(defect.rule) || defect.rule === "RULE-STATE-01") {
      defect.advisory = false;
      if (defect.rule !== "RULE-DOM-01") {
        continue;
      }
    }

    // Guard (T4/T5): On 2nd oscillation of a NATIVE property on a native widget -> stop healing, mark advisory
    if (isNative && isNativeProp && currentOscillations >= 2) {
      if (!CRITICAL_RULES.includes(defect.rule) && defect.rule !== "RULE-STATE-01") {
        defect.advisory = true;
      }
      protectedCount++;
      continue;
    }

    // 1. Native representable properties -> R1 only
    if (isNativeProp) {
      if (element) {
        const ok = applyR1Mutation(element, defect, gtSnapshot);
        if (ok) {
          ladderState.mutationHistory.add(key);
          ladderState.rungsCensus.R1++;
          mutationsApplied++;
        } else {
          // If R1 failed to apply, accept as advisory on native widgets, NEVER escalate to R2 or R3
          if (isNative) {
            if (!CRITICAL_RULES.includes(defect.rule) && defect.rule !== "RULE-STATE-01") {
              defect.advisory = true;
            }
            protectedCount++;
          }
        }
      }
      continue;
    }

    // 2. Non-representable micro-properties -> R2 scoped CSS (for micro-state / selectors only)
    if (!isNativeProp && element) {
      const widgetId = defect.widgetId || element.id;
      if (widgetId) {
        let currentBraces = 0;
        for (const r of ladderState.r2Rules) {
          currentBraces += (r.match(/\{/g) || []).length || 1;
        }
        // Enforce hard cap <= 40 R2 scoped rules / braces
        if (currentBraces >= 40) {
          if (!CRITICAL_RULES.includes(defect.rule) && defect.rule !== "RULE-STATE-01") {
            defect.advisory = true;
          }
          continue;
        }
        const rule = generateR2Rule(widgetId, defect, element.widgetType, element);
        if (rule && !ladderState.r2Rules.has(rule)) {
          const ruleBraces = (rule.match(/\{/g) || []).length || 1;
          if (currentBraces + ruleBraces <= 40) {
            ladderState.r2Rules.add(rule);
            ladderState.rungsCensus.R2++;
            mutationsApplied++;
          } else {
            if (!CRITICAL_RULES.includes(defect.rule) && defect.rule !== "RULE-STATE-01") {
              defect.advisory = true;
            }
          }
        }
      }
      continue;
    }

    // 3. Missing Structural DOM node defect (RULE-DOM-01 on non-whitelisted primitive)
    if (defect.severity === "CRITICAL" && defect.rule === "RULE-DOM-01") {
      const gtNode = gtSnapshot?.viewports?.[defect.viewport || "desktop"]?.flat?.[sid];
      if (gtNode) {
        const parentGt = gtNode.parentSid ? gtSnapshot?.viewports?.[defect.viewport || "desktop"]?.flat?.[gtNode.parentSid] : null;
        const embedWidget = createR3EmbedWidget(sid, gtNode, element, parentGt);
        if (embedWidget) {
          const root = templateJson.content?.[0];
          if (root && Array.isArray(root.elements)) {
            root.elements.push(embedWidget);
            ladderState.rungsCensus.R3++;
            mutationsApplied++;
          }
        }
      }
    }
  }

  if (protectedCount > 0) {
    console.log(`    • Editability guard: ${protectedCount} native widget(s) protected from escalation.`);
  }

  // Inject R2 rules into the template
  injectR2RulesIntoTemplate(templateJson, ladderState.r2Rules);

  return {
    updatedTemplate: templateJson,
    mutationsApplied,
    protectedCount,
    ladderState
  };
}

module.exports = {
  diagnoseAndHeal,
  injectR2RulesIntoTemplate
};

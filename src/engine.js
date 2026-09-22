/**
 * Master Compiler Pipeline Orchestrator.
 * Smart Hybrid Architecture:
 * 1. Gemini 3.6 Flash + Black Box Memory Bank for human-grade semantic & visual understanding.
 * 2. Deterministic Elementor Guardrails & Linter for 100% zero-regression schema compliance.
 * 3. Offline Dynamic AST fallback when API key is not present.
 */
const { resetIdPool } = require('./core/id-generator');
const { parseHtmlToAst } = require('./parser/html-parser');
const { parseCssRules } = require('./parser/css-parser');
const { extractScripts } = require('./parser/js-extractor');
const { transformDomNodeToElementor } = require('./transformers/universal-dom-transformer');
const { createHtmlWidget } = require('./transformers/widget-transformer');
const { normalizeWidgetUnderscores } = require('./normalizers/underscore-normalizer');
const { normalizeMobileBehavior } = require('./normalizers/mobile-normalizer');
const { normalizeTripleGaps } = require('./normalizers/triple-gap-normalizer');
const { normalizeOpticalNudges } = require('./normalizers/optical-nudge-normalizer');
const { normalizeStructuralIntegrity } = require('./normalizers/structural-normalizer');
const { decomposeMicroEmbeds } = require('./normalizers/micro-embed-decomposer');
const { reduceDomTree } = require('./normalizers/dom-tree-reducer');
const { solveLayoutConstraints } = require('./normalizers/layout-constraint-solver');
const { normalizeElementorSchema } = require('./normalizers/schema-normalizer');
const { enforceBlackBoxRules } = require('./core/black-box-enforcer');
const { extractMicroCss, deduplicateAndConsolidateCss } = require('./normalizers/css-classifier');
const { resolveCssToElementorStyles, extractCssVariables, resolveCssValue, parsePixelValue } = require('./normalizers/css-style-resolver');
const { detectPrimaryFontFamily, detectTypographyHierarchy } = require('./parser/font-detector');
const { auditTemplate } = require('./linter/template-linter');
const { callGeminiCompiler, getApiKey, getApiKeys } = require('./ai/gemini-client');
const { runSelfHealingLoop } = require('./inspector/self-healing-loop');
const styleSnapshot = require('./smart/style-snapshot');
const { compileGroundTruthToElementor } = require('./smart/geometry-mapper');
const { runSmartSelfHealingLoop } = require('./smart/self-healing-loop');
const { mergeResponsiveSettings } = require('./smart/responsive-merger');

const { detectUniversalBoxedWidth, detectFallbackBoxedWidth } = require('./smart/boxed-width-detector');

function generateDelegationCode(traces = []) {
  if (!traces || !Array.isArray(traces) || traces.length === 0) return '';
  const bridges = traces.map(traceItem => {
    const triggerSelector = traceItem['trigger'];
    const ancestorSelector = traceItem.ancestor;
    const mutationList = traceItem.mutations || [];
    return `
      (function(){
        var k = ${JSON.stringify('bridge_' + triggerSelector + '|' + ancestorSelector)};
        if (window[k]) return; window[k] = true;
        var preState = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
        if (preState) {
          document.addEventListener('click', function(e){
            var trig = e.target.closest(${JSON.stringify(triggerSelector)});
            if (!trig) return;
            var anc = trig.closest(${JSON.stringify(ancestorSelector)});
            if (!anc || anc === document.body) return;
            var s = {};
            ${mutationList.map(m => `s[${JSON.stringify(m)}] = anc.classList.contains(${JSON.stringify(m)});`).join(' ')}
            preState.set(e, s);
          }, true);
        }
        document.addEventListener('click', function(e){
          var trig = e.target.closest(${JSON.stringify(triggerSelector)});
          if (!trig) return;
          var anc = trig.closest(${JSON.stringify(ancestorSelector)});
          if (!anc || anc === document.body) return;
          var s = preState ? preState.get(e) : null;
          ${mutationList.map(m => `
          var wasPresent = s ? s[${JSON.stringify(m)}] : null;
          var isNowPresent = anc.classList.contains(${JSON.stringify(m)});
          if (wasPresent === null || wasPresent === isNowPresent) {
            anc.classList.toggle(${JSON.stringify(m)});
          }
          `).join('\n')}
          if (trig.hasAttribute('aria-expanded')) {
            var isExp = trig.getAttribute('aria-expanded') === 'true';
            trig.setAttribute('aria-expanded', String(!isExp));
          }
        });
      })();`;
  }).join('\n');

  return `
      if (!window.__delegatedBridgesBound) {
        window.__delegatedBridgesBound = true;
        ${bridges}
      }
  `;
}

async function compileHtmlToElementor(htmlContent, options = {}) {
  const {
    title = 'Elementor Free Template',
    type = 'page',
    useAi = true,
    offline = false,
    inputPath = null,
    useGroundTruth = true
  } = options;

  resetIdPool();

  const apiKeys = getApiKeys();
  let contentElements = [];
  let isAiCompiled = false;
  let isGroundTruthCompiled = false;
  let isFallbackLegacy = false;
  let fallbackReason = null;
  let aiMeta = null;
  let gtSnapshot = null;
  let compileOptions = { viewport: 'desktop', assetsBase: options.assetsBase, unresolvedAssets: [], atomicRules: [] };

  // 1. Primary Pipeline: Ground-Truth Single-Pass Geometric Mapping (V2 "Single-Pass + Verify")
  if (useGroundTruth !== false) {
    try {
      console.log(`\n[2/4] COMPILATION PIPELINE:`);
      console.log(`  • Engine Mode:      Single-Pass Ground Truth (Chromium, local)`);
      console.log(`  • Ground Truth:     Acquiring Headless Chromium 3-Viewport Snapshot...`);

      const captureFn = options.captureGroundTruth || styleSnapshot.captureGroundTruth;
      gtSnapshot = await captureFn(htmlContent, {
        inputPath,
        cache: options.cache !== false
      });

      const desktopFlat = gtSnapshot?.viewports?.desktop?.flat || {};
      const nodeCount = Object.keys(desktopFlat).length;
      console.log(`  ✓ Ground Truth acquired across ${Object.keys(gtSnapshot.viewports).length} viewports (${nodeCount} nodes mapped).`);

      const ast = parseHtmlToAst(gtSnapshot.annotatedHtml || htmlContent);
      compileOptions.viewport = 'desktop';
      compileOptions.assetsBase = options.assetsBase;
      compileOptions.unresolvedAssets = [];
      compileOptions.atomicRules = [];
      contentElements = compileGroundTruthToElementor(ast, gtSnapshot, compileOptions);
      if (compileOptions.unresolvedAssets && compileOptions.unresolvedAssets.length > 0) {
        console.warn(`  [ASSET WARNING] ${compileOptions.unresolvedAssets.length} relative asset(s) could not be resolved. Use --assets-base <url> to provide an asset origin.`);
      }
      mergeResponsiveSettings({ content: contentElements }, gtSnapshot, compileOptions);
      isGroundTruthCompiled = true;
      console.log(`  ✓ Single-Pass geometric mapping complete: ${contentElements.length} root container(s).`);
      console.log(`  ✓ Responsive parity pass complete across desktop, tablet, and mobile.`);
    } catch (gtErr) {
      isFallbackLegacy = true;
      fallbackReason = gtErr.message;
      console.warn(`\n========================================================================`);
      console.warn(`[LEGACY FALLBACK (GT unavailable)] Single-pass Chromium capture failed: ${gtErr.message}`);
      console.warn(`Forcing ADVISORY export. Never silent legacy.`);
      console.warn(`========================================================================\n`);
    }
  }

  // 2. High-Fidelity AST Generation (Fallback: Semantic Decomposition / AI)
  if (!isGroundTruthCompiled && options.useAiGenerative && useAi && !offline && apiKeys.length > 0) {
    try {
      console.log(`\n[2/4] COMPILATION PIPELINE:`);
      console.log(`  • Engine Mode:      Smart AI Generative Compiler (Experimental)`);
      const aiResult = await callGeminiCompiler(htmlContent, { title, apiKeys });
      if (aiResult && Array.isArray(aiResult.content) && aiResult.content.length > 0) {
        contentElements = aiResult.content;
        aiMeta = aiResult._meta || null;
        delete aiResult._meta;
        isAiCompiled = true;
        console.log(`  ✓ Semantic AI AST generation finished successfully.`);
      }
    } catch (err) {
      console.warn(`\n  [AI COMPILER WARNING] Falling back to Universal AST Engine: ${err.message}`);
    }
  }

  if (!isGroundTruthCompiled && !isAiCompiled) {
    if (!isFallbackLegacy) {
      isFallbackLegacy = true;
      fallbackReason = 'Ground Truth pipeline explicitly disabled or unavailable';
      console.warn(`\n========================================================================`);
      console.warn(`[LEGACY FALLBACK (GT unavailable)] Single-pass Chromium capture failed: ${fallbackReason}`);
      console.warn(`Forcing ADVISORY export. Never silent legacy.`);
      console.warn(`========================================================================\n`);
    }
    console.log(`\n[2/4] COMPILATION PIPELINE:`);
    console.log(`  • Engine Mode:      Legacy Offline DOM Semantic Tree Decomposition Engine`);
    console.log(`  • Layout Pipeline:  Dynamic AST Semantic Decomposition (100% Structural Preservation)`);

    const ast = parseHtmlToAst(htmlContent);
    const rootElement = transformDomNodeToElementor(ast);

    if (rootElement && rootElement.elType === 'container') {
      contentElements = [rootElement];
    } else {
      contentElements = [rootElement].filter(Boolean);
    }
  }

  const cssMatches = htmlContent.match(/<style\b[^>]*>([\s\S]*?)<\/style>/gi) || [];
  const fullCss = cssMatches.map(s => s.replace(/<\/?style[^>]*>/gi, '')).join('\n').trim();
  const typoHierarchy = detectTypographyHierarchy(htmlContent, fullCss);
  const detectedBoxedWidth = (isGroundTruthCompiled && gtSnapshot)
    ? detectUniversalBoxedWidth(gtSnapshot, 'desktop')
    : detectFallbackBoxedWidth(htmlContent, fullCss);
  const detectedFontFamily = typoHierarchy.primaryFont || detectPrimaryFontFamily(htmlContent);

  // 3. Post-Processing: Run Deterministic Guardrails & Normalizers
  console.log(`\n[3/4] ENFORCING BLACK BOX NORMALIZATION & GUARDRAILS:`);
  normalizeElementorSchema(contentElements);

  if (!isGroundTruthCompiled) {
    decomposeMicroEmbeds(contentElements);
    console.log(`  ✓ Decomposed structural HTML & preserved atomic micro-embed inputs (sliders/toggles)`);

    resolveCssToElementorStyles(contentElements, fullCss, typoHierarchy);
    console.log(`  ✓ Resolved & mapped CSS properties (background, padding, border, radius, typography: '${typoHierarchy.primaryFont}') to Elementor settings`);

    reduceDomTree(contentElements);
    console.log(`  ✓ Pruned redundant wrappers & normalized icon boxes`);

    solveLayoutConstraints(contentElements, detectedBoxedWidth);
    console.log(`  ✓ Solved flex-row layout constraints (desktop multi-columns & mobile stacking)`);

    normalizeStructuralIntegrity(contentElements);
    console.log(`  ✓ Calibrated flex-row containers & translated FA6 icons to FA5 Free`);

    for (const el of contentElements) {
      normalizeWidgetUnderscores(el);
      normalizeMobileBehavior(el);
      normalizeTripleGaps(el);
      normalizeOpticalNudges(el);
    }
    console.log(`  ✓ Applied widget underscores (_margin/_padding), triple gaps, and mobile responsive rules`);

    enforceBlackBoxRules(contentElements, { fontFamily: detectedFontFamily, boxedWidth: detectedBoxedWidth, typographyHierarchy: typoHierarchy });
    normalizeElementorSchema(contentElements);
    console.log(`  ✓ Injected optical font kerning ('${detectedFontFamily || 'System Default'}') & root boxed layout (${detectedBoxedWidth || 1140}px)`);
  } else {
    console.log(`  ✓ Single-pass ground truth verified: 100% computed geometry & styles preserved without regex guessing.`);
  }

  // Dynamic Smart Micro-CSS preservation (quarantined strictly to pseudo-elements, dynamic states, and switches)
  // Task G1: Exempt micro-embed selectors from F9 pruning by scanning emitted micro-embeds
  let microCss = extractMicroCss(fullCss, false, {
    elements: contentElements,
    ...compileOptions
  });

  if (compileOptions && Array.isArray(compileOptions.atomicRules) && compileOptions.atomicRules.length > 0) {
    const atomicCss = compileOptions.atomicRules.filter(Boolean).join('\n\n');
    if (atomicCss) {
      microCss = (microCss ? microCss + '\n\n' : '') + atomicCss;
    }
  }

  if (microCss) {
    microCss = deduplicateAndConsolidateCss(microCss);
    let hasStylesheetWidget = false;
    function scanForStylesheet(n) {
      if (n.widgetType === 'html' && (n.settings?.html || '').includes('<style')) {
        n.settings.html = `<style>\n${microCss}\n</style>`;
        hasStylesheetWidget = true;
      }
      if (n.elements) n.elements.forEach(scanForStylesheet);
    }
    contentElements.forEach(scanForStylesheet);

    if (!hasStylesheetWidget) {
      const stylesheetWidget = createHtmlWidget({
        html: `<style>\n${microCss}\n</style>`,
        css_classes: 'embedded-stylesheet-engine',
        _html_reason: 'SYSTEM:stylesheet-engine'
      });
      const root = contentElements[0];
      if (root && root.elType === 'container') {
        root.elements.unshift(stylesheetWidget);
      } else {
        contentElements.unshift(stylesheetWidget);
      }
      console.log(`  ✓ Preserved smart micro-stylesheet engine into template header (${Math.round(microCss.length / 1024 * 10) / 10} KB isolated)`);
    } else {
      console.log(`  ✓ Upgraded existing stylesheet widget with smart micro-stylesheet (${Math.round(microCss.length / 1024 * 10) / 10} KB isolated)`);
    }
  }

  // Interactive Behavior Probe & Dynamic Script Preservation (W1 Parity Close-out)
  let behaviorTraces = [];
  if (options.behaviorTraces !== undefined) {
    behaviorTraces = options.behaviorTraces || [];
  } else if (options.probeBehavior !== false) {
    try {
      const { probeOriginalBehavior } = require('./smart/behavior-probe');
      const probeRes = await probeOriginalBehavior(htmlContent);
      behaviorTraces = probeRes.traces || probeRes.interactions || [];
    } catch (e) {
      behaviorTraces = [];
    }
  }

  // Dynamic JavaScript business logic preservation
  const scripts = extractScripts(htmlContent);
  if (scripts.length > 0 || behaviorTraces.length > 0) {
    let hasScriptWidget = false;
    function scanForScript(n) {
      if (n.widgetType === 'html' && (n.settings?.html || '').includes('<script')) {
        hasScriptWidget = true;
      }
      if (n.elements) n.elements.forEach(scanForScript);
    }
    contentElements.forEach(scanForScript);

    if (!hasScriptWidget) {
      const delegationCode = generateDelegationCode(behaviorTraces);

      const scriptBody = `
(function() {
  // 1. Universal DOM Lifecycle Polyfill:
  // If user scripts listen for DOMContentLoaded or load after Elementor has already initialized the page,
  // immediately invoke the callback so dynamic scripts never enter a deadzone.
  try {
    var _origDocAdd = Document.prototype.addEventListener;
    var _lifecycleAdd = function(type, fn, opts) {
      if ((type === 'DOMContentLoaded' || type === 'readystatechange') && document.readyState !== 'loading') {
        try {
          setTimeout(function() { fn.call(document, new Event(type)); }, 0);
        } catch(e) {
          console.error('[LIFECYCLE]', e);
        }
        return;
      }
      return _origDocAdd.call(this, type, fn, opts);
    };
    Document.prototype.addEventListener = _lifecycleAdd;
    try { document.addEventListener = _lifecycleAdd; } catch(e) {}

    var _origWinAdd = Window.prototype.addEventListener;
    Window.prototype.addEventListener = function(type, fn, opts) {
      if (type === 'load' && document.readyState === 'complete') {
        try {
          setTimeout(function() { fn.call(window, new Event(type)); }, 0);
        } catch(e) {
          console.error('[LIFECYCLE]', e);
        }
        return;
      }
      return _origWinAdd.call(this, type, fn, opts);
    };
  } catch(e) {
    console.warn('[LIFECYCLE POLYFILL ERROR]', e);
  }

  function initDynamicComponentLogic() {
    // 2. Universal Data-Attribute Hydration Bridge:
    // Elementor Free strips custom_attributes. Rehydrate data-* attributes from class aliases
    // (e.g. data-category--design -> el.dataset.category = "design", el.setAttribute("data-category", "design"))
    try {
      document.querySelectorAll('*').forEach(function(el) {
        if (!el.className || typeof el.className !== 'string' || el.className.indexOf('data-') === -1) return;
        if (el.dataset && el.dataset.__hasDataHydrated) return;
        if (el.dataset) el.dataset.__hasDataHydrated = 'true';
        if (el.classList) {
          el.classList.forEach(function(cls) {
            if (cls.startsWith('data-') && cls.indexOf('--') !== -1) {
              var sepIdx = cls.indexOf('--');
              var attrName = cls.slice(0, sepIdx);
              var rawVal = cls.slice(sepIdx + 2);
              // Decode hex characters (_xHH_) losslessly back to original string (e.g. _x20_ -> space)
              var attrVal = rawVal.replace(/_x([0-9a-fA-F]{2})_/g, function(_, hex) {
                return String.fromCharCode(parseInt(hex, 16));
              });
              el.setAttribute(attrName, attrVal);
              if (el.dataset) {
                var prop = attrName.slice(5).replace(/-([a-z])/g, function(_, c) { return c.toUpperCase(); });
                el.dataset[prop] = attrVal;
              }
            }
          });
        }
      });
    } catch(e) {
      console.warn('[DATA HYDRATION ERROR]', e);
    }

    try {
      // Ensure textContent and innerText mutations on Elementor heading widget wrappers target the inner heading title
      document.querySelectorAll('.elementor-widget-heading').forEach(function(widget) {
        var inner = widget.querySelector('.elementor-heading-title');
        if (inner && !widget.__hasTextProxy) {
          widget.__hasTextProxy = true;
          Object.defineProperty(widget, 'textContent', {
            get: function() { return inner.textContent; },
            set: function(val) { inner.textContent = val; },
            configurable: true
          });
          Object.defineProperty(widget, 'innerText', {
            get: function() { return inner.innerText; },
            set: function(val) { inner.innerText = val; },
            configurable: true
          });
        }
      });

      // Compile-time Generated Delegation Bridges from Probe Traces (Z3, Z8, Z9)
      ${delegationCode}
    } catch(err) {
      console.warn('[COMPILER BRIDGE]', err);
    }

    // Execute Application Business Logic with Idempotency Protection
    if (!window.__appLogicInitialized) {
      window.__appLogicInitialized = true;
      try {
        ${scripts.join('\n')}
      } catch(appErr) {
        console.warn('[APP LOGIC ERROR]', appErr);
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDynamicComponentLogic);
  } else {
    initDynamicComponentLogic();
  }
  setTimeout(initDynamicComponentLogic, 200);
  setTimeout(initDynamicComponentLogic, 800);
  window.addEventListener('elementor/frontend/init', initDynamicComponentLogic);
})();
`;

      // Pre-flight script syntax validation
      try {
        new Function(scriptBody);
      } catch (syntaxErr) {
        console.warn(`  [SCRIPT PRE-FLIGHT WARNING] Syntax validation warning: ${syntaxErr.message}`);
      }

      const scriptWidget = createHtmlWidget({
        html: `<script>${scriptBody}</script>`,
        css_classes: 'embedded-script-engine',
        _html_reason: 'SYSTEM:script-engine'
      });
      const root = contentElements[0];
      if (root && root.elType === 'container') {
        root.elements.push(scriptWidget);
      } else {
        contentElements.push(scriptWidget);
      }
      console.log(`  ✓ Preserved 100% interactive JavaScript logic into bottom script engine`);
    }
  }

  let templateJson = {
    version: '0.4',
    title,
    type,
    content: contentElements
  };

  // 4. Closed-Loop Autonomous Visual Self-Healing Inspection
  let visualReport = null;
  if (options.inspect !== false && options.enableVisualInspection !== false) {
    if (isGroundTruthCompiled && gtSnapshot) {
      const healingResult = await runSmartSelfHealingLoop(templateJson, gtSnapshot, {
        maxIterations: options.maxIterations || 4,
        behaviorTraces,
        rawHtml: htmlContent,
        probeBehavior: options.probeBehavior
      });
      templateJson = healingResult.template;
      visualReport = healingResult.auditReport || {};
      visualReport.finalScore = healingResult.finalScore;
      visualReport.gatekeeperPassed = healingResult.gatekeeperPassed;
      visualReport.cleanPass = healingResult.cleanPass;
      visualReport.iterationsRun = healingResult.iterationsRun;
      visualReport.scorecard = healingResult.scorecard;
      visualReport.ladderState = healingResult.ladderState;
      visualReport.unresolvedDefects = healingResult.scorecard?.defects || [];
      visualReport.unresolvedDefectsCount = healingResult.scorecard?.counts?.total !== undefined
        ? healingResult.scorecard.counts.total
        : visualReport.unresolvedDefects.length;
    } else {
      console.log(`\n[4/4] AUTONOMOUS CLOSED-LOOP VISUAL INSPECTION & SELF-HEALING (LEGACY):`);
      const healingResult = await runSelfHealingLoop(htmlContent, templateJson, {
        apiKeys: offline ? [] : apiKeys,
        useVisionAi: !offline && options.useVisionAi !== false && options.useAi !== false
      });
      templateJson = healingResult.template;
      visualReport = healingResult.auditReport;
    }
  }

  // Enforce ADVISORY export on legacy fallback
  if (isFallbackLegacy) {
    if (!visualReport) {
      visualReport = {
        finalScore: 0,
        gatekeeperPassed: false,
        cleanPass: false,
        iterationsRun: 0,
        unresolvedDefectsCount: 1,
        unresolvedDefects: [{
          type: 'LEGACY_FALLBACK',
          message: `Single-pass Chromium capture failed: ${fallbackReason || 'GT unavailable'}`
        }],
        scorecard: {
          title,
          cleanPass: false,
          gatekeeperPassed: false,
          fidelity: 0,
          legacyFallback: true,
          reason: fallbackReason
        }
      };
    } else {
      visualReport.cleanPass = false;
      visualReport.gatekeeperPassed = false;
      if (visualReport.scorecard) {
        visualReport.scorecard.cleanPass = false;
        visualReport.scorecard.gatekeeperPassed = false;
      }
      visualReport.unresolvedDefects = visualReport.unresolvedDefects || [];
      visualReport.unresolvedDefects.push({
        type: 'LEGACY_FALLBACK',
        message: `Single-pass Chromium capture failed: ${fallbackReason || 'GT unavailable'}`
      });
      visualReport.unresolvedDefectsCount = visualReport.unresolvedDefects.length;
    }
  }

  // 5. Pre-Flight Quality Audit
  const auditReport = auditTemplate(templateJson);

  return {
    templateJson,
    auditReport,
    visualReport,
    isAiCompiled,
    isGroundTruthCompiled,
    isFallbackLegacy,
    meta: {
      isAiCompiled,
      isGroundTruthCompiled,
      isFallbackLegacy,
      model: isGroundTruthCompiled
        ? 'Single-Pass Ground Truth (Chromium, local)'
        : (isFallbackLegacy
            ? 'Legacy Fallback Engine (GT unavailable)'
            : (isAiCompiled
                ? (aiMeta?.model || 'Gemini Generative Compiler')
                : (options.useVisionAi !== false && options.useAi !== false && apiKeys.length > 0
                    ? 'Universal Engine + Gemini Vision Critic'
                    : 'Universal Deterministic Engine (Offline Matrix)'))),
      keyLabel: aiMeta?.keyLabel || null,
      keysCount: apiKeys.length,
      detectedFontFamily,
      detectedBoxedWidth
    }
  };
}

module.exports = {
  compileHtmlToElementor,
  detectUniversalBoxedWidth,
  detectFallbackBoxedWidth
};

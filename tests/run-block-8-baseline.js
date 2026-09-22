/**
 * Block 8.0: Universal Regression Baseline Runner & Audit Gate
 * 
 * Compiles all discovered corpus fixtures, extracts honest baseline metrics,
 * enforces universal invariants (Pro widgets, SIDs, HTML reasons, IDs, scalars, audit integrity),
 * prevents stale artifact reuse, sanitizes failure messages, and generates deterministic reports.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { discoverCorpusFixtures, DEFAULT_VIEWPORTS } = require('./support/corpus-manifest');
const { validateTemplate } = require('../src/smart/scalar-contract');
const { isValidHtmlReason } = require('../src/smart/style-router');
const { parseHtmlToAst } = require('../src/parser/html-parser');

const ROOT_DIR = path.resolve(__dirname, '..');
const REPORTS_DIR = path.join(__dirname, 'reports');

const SID_CLASSIFICATION_RULE =
  "Nodes are classified into 4 categories: " +
  "(1) source-derived (nodes representing source DOM elements mapped in Ground Truth, expected to preserve SID); " +
  "(2) generated helpers (explicit compiler-generated layout helpers, reported separately without invented SIDs); " +
  "(3) exempt system (stylesheet and script engine widgets); " +
  "(4) unverifiable (nodes without SID whose source derivation cannot be proven). " +
  "Missing SIDs on source-derived or unverifiable nodes fail the invariant gate.";

/**
 * Resolves the compiler CLI executable path.
 * @returns {string}
 */
function resolveCliPath() {
  const candidates = [
    path.join(ROOT_DIR, 'bin', 'cli.js')
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error('Compiler CLI (cli.js) not found in bin/.');
}

/**
 * Sanitizes an error message by stripping absolute paths, timestamps, and durations.
 * @param {string|null} errorMessage 
 * @param {string} [rootDir]
 * @returns {string|null}
 */
function sanitizeErrorMessage(errorMessage, rootDir = ROOT_DIR) {
  if (!errorMessage || typeof errorMessage !== 'string') return null;

  let clean = errorMessage;

  if (rootDir) {
    const rootNormBack = rootDir.replace(/\//g, '\\');
    const rootNormFwd = rootDir.replace(/\\/g, '/');
    clean = clean.split(rootNormBack).join('<ROOT>');
    clean = clean.split(rootNormFwd).join('<ROOT>');
  }

  // Windows absolute paths
  clean = clean.replace(/[A-Za-z]:\\[^\\/:*?"<>|\r\n\t]+/g, '<PATH>');
  clean = clean.replace(/[A-Za-z]:\/[^\\/:*?"<>|\r\n\t]+/g, '<PATH>');

  // Unix absolute paths
  clean = clean.replace(/\/(?:home|tmp|var|usr|etc|opt)\/[^\s:*?"<>|\r\n\t]+/g, '<PATH>');

  // ISO timestamps
  clean = clean.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/g, '');

  // Durations (e.g. 45000ms, 12.3s)
  clean = clean.replace(/\b\d+(?:\.\d+)?\s*(?:ms|seconds|sec|s)\b/gi, '');

  clean = clean.replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n').trim();
  return clean.substring(0, 300);
}

const RECOGNIZED_SEVERITIES = new Set(['critical', 'high', 'medium', 'low', 'advisory']);

/**
 * Enforces the complete audit schema.
 * An audit is VALID only when:
 * - root is a non-array object;
 * - fidelity is a finite number from 0 through 100;
 * - either defects is an array or counts is a valid object;
 * - every defect entry is a valid object with a recognized severity;
 * - every count is a finite non-negative integer;
 * - malformed defect data must not silently become zero defects.
 * 
 * @param {*} auditData 
 * @returns {{ valid: boolean, error: string|null, fidelity: number|null, defectCounts: Object|null, consoleErrorsCount: number }}
 */
function validateAuditSchema(auditData) {
  if (!auditData || typeof auditData !== 'object' || Array.isArray(auditData)) {
    return {
      valid: false,
      error: 'Audit JSON root must be a non-array object',
      fidelity: null,
      defectCounts: null,
      consoleErrorsCount: 0
    };
  }

  // 1. Fidelity Validation: finite number from 0 through 100
  const rawFidelity = auditData.fidelity !== undefined
    ? auditData.fidelity
    : (auditData.global?.fidelity !== undefined ? auditData.global.fidelity : auditData.score);

  if (typeof rawFidelity !== 'number' || !Number.isFinite(rawFidelity) || rawFidelity < 0 || rawFidelity > 100) {
    return {
      valid: false,
      error: `Audit fidelity must be a finite number between 0 and 100 (got ${rawFidelity})`,
      fidelity: null,
      defectCounts: null,
      consoleErrorsCount: 0
    };
  }

  // 2. Structural requirement: either defects is an array OR counts is a valid object
  const hasDefects = Array.isArray(auditData.defects);
  const hasCounts = auditData.counts !== null && typeof auditData.counts === 'object' && !Array.isArray(auditData.counts);

  if (!hasDefects && !hasCounts) {
    return {
      valid: false,
      error: 'Audit must contain either a valid defects array or a valid counts object',
      fidelity: null,
      defectCounts: null,
      consoleErrorsCount: 0
    };
  }

  const defectCounts = { critical: 0, high: 0, medium: 0, low: 0, advisory: 0 };

  // 3. Validate defects array if provided
  if (auditData.defects !== undefined) {
    if (!hasDefects) {
      return {
        valid: false,
        error: 'Audit defects must be an array when provided',
        fidelity: null,
        defectCounts: null,
        consoleErrorsCount: 0
      };
    }
    for (let i = 0; i < auditData.defects.length; i++) {
      const d = auditData.defects[i];
      if (!d || typeof d !== 'object' || Array.isArray(d)) {
        return {
          valid: false,
          error: `Defect entry at index ${i} must be a valid object`,
          fidelity: null,
          defectCounts: null,
          consoleErrorsCount: 0
        };
      }
      const rawSev = (d.severity || (d.advisory ? 'advisory' : 'low'));
      if (typeof rawSev !== 'string' || !RECOGNIZED_SEVERITIES.has(rawSev.toLowerCase())) {
        return {
          valid: false,
          error: `Defect entry at index ${i} has unrecognized severity: "${rawSev}"`,
          fidelity: null,
          defectCounts: null,
          consoleErrorsCount: 0
        };
      }
      const sev = rawSev.toLowerCase();
      if (d.advisory) {
        defectCounts.advisory++;
      } else {
        defectCounts[sev]++;
      }
    }
  }

  // 4. Validate counts object if provided
  if (auditData.counts !== undefined) {
    if (!hasCounts) {
      return {
        valid: false,
        error: 'Audit counts must be a valid non-array object when provided',
        fidelity: null,
        defectCounts: null,
        consoleErrorsCount: 0
      };
    }
    for (const [key, val] of Object.entries(auditData.counts)) {
      if (typeof val !== 'number' || !Number.isFinite(val) || !Number.isInteger(val) || val < 0) {
        return {
          valid: false,
          error: `Audit count for "${key}" must be a finite non-negative integer (got ${val})`,
          fidelity: null,
          defectCounts: null,
          consoleErrorsCount: 0
        };
      }
      const lowerKey = key.toLowerCase();
      if (RECOGNIZED_SEVERITIES.has(lowerKey)) {
        if (!hasDefects) {
          defectCounts[lowerKey] = val;
        }
      }
    }
    if (!hasDefects && auditData.advisoryDefectCount !== undefined) {
      const adv = auditData.advisoryDefectCount;
      if (typeof adv !== 'number' || !Number.isFinite(adv) || !Number.isInteger(adv) || adv < 0) {
        return {
          valid: false,
          error: `Audit advisoryDefectCount must be a finite non-negative integer (got ${adv})`,
          fidelity: null,
          defectCounts: null,
          consoleErrorsCount: 0
        };
      }
      defectCounts.advisory = adv;
    }
  }

  // 5. Validate consoleErrors if provided
  let consoleErrorsCount = 0;
  if (auditData.consoleErrors !== undefined) {
    if (!Array.isArray(auditData.consoleErrors)) {
      return {
        valid: false,
        error: 'Audit consoleErrors must be an array when provided',
        fidelity: null,
        defectCounts: null,
        consoleErrorsCount: 0
      };
    }
    consoleErrorsCount = auditData.consoleErrors.length;
  }

  return {
    valid: true,
    error: null,
    fidelity: rawFidelity,
    defectCounts,
    consoleErrorsCount
  };
}

/**
 * Checks content HTML for forbidden native primitives (headings, paragraphs, images, simple buttons)
 * using the project's actual HTML DOM parser (parseHtmlToAst). Inspects every node independently.
 * @param {string} html 
 * @param {string} reason 
 * @returns {Array<string>} List of violations
 */
function checkStructuralHtmlViolations(html, reason) {
  const violations = [];
  const trimmed = String(html || '').trim();

  // Exempt system widgets
  if (reason === 'SYSTEM:stylesheet-engine' || reason === 'SYSTEM:script-engine' ||
      trimmed.startsWith('<style') || trimmed.startsWith('<script')) {
    return violations;
  }

  // Parse HTML into AST using the project's actual HTML tree parser (parseHtmlToAst)
  const ast = parseHtmlToAst(trimmed);

  function walkAst(node) {
    if (!node || typeof node !== 'object') return;

    const tag = (node.tagName || '').toLowerCase();

    if (tag === 'button') {
      violations.push('contains simple button markup that must be native button widget');
    } else if (/^h[1-6]$/.test(tag)) {
      violations.push('contains standard heading markup that must be native heading widget');
    } else if (tag === 'p') {
      violations.push('contains standard paragraph markup that must be native text-editor widget');
    } else if (tag === 'img') {
      violations.push('contains standard image markup that must be native image widget');
    }

    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        walkAst(child);
      }
    }
  }

  if (Array.isArray(ast.children) && ast.children.length > 0) {
    for (const child of ast.children) {
      walkAst(child);
    }
  } else {
    walkAst(ast);
  }

  return violations;
}

/**
 * Analyzes an Elementor Template content tree for widget classification and invariants.
 * @param {Array} content 
 * @param {Object} [templateJson]
 * @param {Object} [auditData]
 * @returns {Object}
 */
function analyzeTemplateTree(content = [], templateJson = null, auditData = null) {
  let coreWidgetsCount = 0;
  let htmlWidgetsCount = 0;
  let proWidgetsCount = 0;
  const proWidgetTypes = [];
  const htmlWidgetReasons = [];
  let microCssSizeBytes = 0;
  let scriptSizeBytes = 0;

  // Granular SID Tracking
  let missingSidContainers = 0;
  let missingSidNativeWidgets = 0;
  let missingSidCustomWidgets = 0;
  let missingSidContentHtml = 0;
  let exemptSystemWidgets = 0;
  let generatedHelperNodes = 0;
  let unverifiableNodes = 0;

  // ID Validation: format /^[a-f0-9]{7,8}$/i, uniqueness, existence
  const ID_FORMAT_REGEX = /^[a-f0-9]{7,8}$/i;
  let malformedIdCount = 0;
  let duplicateIdCount = 0;
  let missingIdCount = 0;
  const seenIds = new Set();

  // HTML Reason Classification & Violations
  const htmlReasonViolations = [];
  const systemHtmlWidgetsCount = { stylesheet: 0, script: 0 };
  let contentHtmlWidgetsCount = 0;

  const validFreeWidgets = new Set([
    'heading', 'text-editor', 'button', 'image', 'icon',
    'divider', 'spacer', 'icon-list', 'html', 'counter',
    'progress', 'testimonial', 'tabs', 'accordion', 'toggle',
    'alert', 'shortcode', 'menu-anchor', 'sidebar', 'read-more'
  ]);

  function walk(node) {
    if (!node || typeof node !== 'object') return;

    // 1. ID Check
    if (!node.id || typeof node.id !== 'string') {
      missingIdCount++;
    } else if (!ID_FORMAT_REGEX.test(node.id)) {
      malformedIdCount++;
    } else if (seenIds.has(node.id)) {
      duplicateIdCount++;
    } else {
      seenIds.add(node.id);
    }

    // Extract SID and class hints
    const sid = node._sid || node.settings?._sid || node._dom_id || node.settings?._dom_id;
    const classes = String(node.settings?._css_classes || node.settings?.css_classes || '');
    const hasSidClass = /e-sid-(\d+|[a-zA-Z0-9_-]+)/.test(classes);
    const isExplicitHelper = Boolean(node.settings?._is_helper || node._is_helper || node.settings?._generated_helper);

    if (node.elType === 'container') {
      if (sid) {
        // Preserved SID
      } else if (isExplicitHelper) {
        generatedHelperNodes++;
      } else if (hasSidClass) {
        missingSidContainers++;
      } else {
        // Unverifiable container without SID tracking
        missingSidContainers++;
        unverifiableNodes++;
      }
    } else if (node.elType === 'widget') {
      const wType = node.widgetType;

      if (wType === 'html') {
        htmlWidgetsCount++;
        const reason = node.settings?._html_reason || node.settings?.html_reason;
        const html = String(node.settings?.html || '').trim();

        if (!reason || reason === 'UNSPECIFIED_HTML_WIDGET') {
          htmlReasonViolations.push(`HTML widget ${node.id || 'unknown'} lacks machine-readable _html_reason`);
          htmlWidgetReasons.push(reason || 'UNSPECIFIED_HTML_WIDGET');
        } else if (!isValidHtmlReason(reason)) {
          htmlReasonViolations.push(`HTML widget ${node.id} has unapproved reason: "${reason}"`);
          htmlWidgetReasons.push(reason);
        } else {
          htmlWidgetReasons.push(reason);
        }

        const isStylesheet = reason === 'SYSTEM:stylesheet-engine' || html.startsWith('<style') || html.includes('</style>');
        const isScript = reason === 'SYSTEM:script-engine' || html.startsWith('<script') || html.includes('</script>');

        if (isStylesheet) {
          systemHtmlWidgetsCount.stylesheet++;
          exemptSystemWidgets++;
          microCssSizeBytes += Buffer.byteLength(html, 'utf8');
        } else if (isScript) {
          systemHtmlWidgetsCount.script++;
          exemptSystemWidgets++;
          scriptSizeBytes += Buffer.byteLength(html, 'utf8');
        } else {
          contentHtmlWidgetsCount++;
          if (sid) {
            // Preserved SID
          } else if (isExplicitHelper) {
            generatedHelperNodes++;
          } else if (hasSidClass) {
            missingSidContentHtml++;
          } else {
            missingSidContentHtml++;
            unverifiableNodes++;
          }

          // Structural Primitive Check
          const primViolations = checkStructuralHtmlViolations(html, reason);
          for (const pv of primViolations) {
            htmlReasonViolations.push(`HTML widget ${node.id} ${pv}`);
          }
        }
      } else if (validFreeWidgets.has(wType)) {
        coreWidgetsCount++;
        if (sid) {
          // Preserved SID
        } else if (isExplicitHelper) {
          generatedHelperNodes++;
        } else if (hasSidClass) {
          missingSidNativeWidgets++;
        } else {
          missingSidNativeWidgets++;
          unverifiableNodes++;
        }
      } else {
        proWidgetsCount++;
        proWidgetTypes.push(wType);
        if (sid) {
          // Preserved SID
        } else if (isExplicitHelper) {
          generatedHelperNodes++;
        } else {
          missingSidCustomWidgets++;
          unverifiableNodes++;
        }
      }
    }

    if (Array.isArray(node.elements)) {
      node.elements.forEach(walk);
    }
  }

  if (Array.isArray(content)) {
    content.forEach(walk);
  }

  const totalContentWidgets = coreWidgetsCount + htmlWidgetsCount;
  const nativeEditabilityPercentage = totalContentWidgets > 0
    ? Math.round((coreWidgetsCount / totalContentWidgets) * 100)
    : 100;

  const totalNonExemptMissingSids = missingSidContainers + missingSidNativeWidgets + missingSidCustomWidgets + missingSidContentHtml;

  // Run scalar contract if template JSON is provided
  let scalarViolations = [];
  if (templateJson && typeof templateJson === 'object') {
    scalarViolations = validateTemplate(templateJson);
  }

  return {
    coreWidgetsCount,
    htmlWidgetsCount,
    proWidgetsCount,
    proWidgetTypes,
    htmlWidgetReasons,
    systemHtmlWidgetsCount,
    contentHtmlWidgetsCount,
    htmlReasonViolations,
    nativeEditabilityPercentage,
    microCssSizeBytes,
    scriptSizeBytes,
    missingSidBreakdown: {
      containers: missingSidContainers,
      nativeWidgets: missingSidNativeWidgets,
      customWidgets: missingSidCustomWidgets,
      contentHtmlWidgets: missingSidContentHtml,
      exemptSystemWidgets,
      generatedHelperNodes,
      unverifiableNodes
    },
    missingSidCount: totalNonExemptMissingSids,
    unverifiableNodesCount: unverifiableNodes,
    idMetrics: {
      totalIds: seenIds.size,
      malformed: malformedIdCount,
      duplicates: duplicateIdCount,
      missing: missingIdCount
    },
    scalarViolationsCount: scalarViolations.length,
    scalarViolations: scalarViolations.slice(0, 10)
  };
}

/**
 * Evaluates all invariant rules on the extracted template metrics.
 * @param {Object} treeAnalysis 
 * @param {string} compilationStatus 
 * @param {number|null} globalFidelityScore 
 * @param {string} [auditStatus='VALID']
 * @param {string|null} [auditError=null]
 * @returns {Array<string>} Invariant violation messages
 */
function evaluateInvariants(treeAnalysis, compilationStatus, globalFidelityScore, auditStatus = 'VALID', auditError = null) {
  const violations = [];

  // 1. Audit Integrity Check
  if (compilationStatus.startsWith('SUCCESS') && auditStatus !== 'VALID') {
    violations.push(`Audit artifact verification failed (${auditStatus}): ${auditError || 'Invalid or missing audit'}`);
  }

  // 2. Pro Widgets
  if (treeAnalysis.proWidgetsCount > 0) {
    violations.push(`Pro widgets detected: ${treeAnalysis.proWidgetTypes.join(', ')}`);
  }

  // 3. ID Validations
  const idM = treeAnalysis.idMetrics;
  if (idM.missing > 0) {
    violations.push(`${idM.missing} element(s) have missing IDs`);
  }
  if (idM.malformed > 0) {
    violations.push(`${idM.malformed} element(s) have malformed IDs (must match /^[a-f0-9]{7,8}$/i)`);
  }
  if (idM.duplicates > 0) {
    violations.push(`${idM.duplicates} duplicate ID(s) detected across template tree`);
  }

  // 4. Missing SIDs (non-exempt)
  if (treeAnalysis.missingSidCount > 0) {
    const b = treeAnalysis.missingSidBreakdown;
    violations.push(
      `${treeAnalysis.missingSidCount} non-exempt element(s) missing SID ` +
      `(containers: ${b.containers}, nativeWidgets: ${b.nativeWidgets}, ` +
      `customWidgets: ${b.customWidgets}, contentHtml: ${b.contentHtmlWidgets})`
    );
  }

  // 5. Unverifiable Nodes
  if (treeAnalysis.unverifiableNodesCount > 0) {
    violations.push(`${treeAnalysis.unverifiableNodesCount} unverifiable element(s) detected without source SID tracking`);
  }

  // 6. HTML Reason Violations
  if (treeAnalysis.htmlReasonViolations.length > 0) {
    violations.push(
      `${treeAnalysis.htmlReasonViolations.length} HTML widget contract violation(s) ` +
      `(e.g., ${treeAnalysis.htmlReasonViolations[0]})`
    );
  }

  // 7. Scalar Contract Violations
  if (treeAnalysis.scalarViolationsCount > 0) {
    violations.push(
      `${treeAnalysis.scalarViolationsCount} scalar contract violation(s) ` +
      `(e.g., ${treeAnalysis.scalarViolations[0]})`
    );
  }

  // 8. Fidelity on failed compilation
  if (compilationStatus === 'FAILED' && globalFidelityScore === 100) {
    violations.push('Failed compilation must not report 100% fidelity score');
  }

  return violations;
}

/**
 * Executes compilation for a single fixture and gathers baseline metrics.
 * Cleans stale artifacts before running.
 * @param {Object} fixture 
 * @param {string} cliPath 
 * @param {string} outputDir 
 * @returns {Object} Fixture result
 */
function runFixtureBaseline(fixture, cliPath, outputDir) {
  const fixtureSlug = fixture.fixtureId.replace(/\//g, '_');
  const targetJson = path.join(outputDir, `${fixtureSlug}_baseline.json`);
  const targetAudit = path.join(outputDir, `${fixtureSlug}_baseline.audit.json`);
  const targetPreview = path.join(outputDir, `${fixtureSlug}_baseline-preview.html`);

  // Stale Output Prevention: Remove only this fixture's previous artifacts
  if (fs.existsSync(targetJson)) fs.unlinkSync(targetJson);
  if (fs.existsSync(targetAudit)) fs.unlinkSync(targetAudit);
  if (fs.existsSync(targetPreview)) fs.unlinkSync(targetPreview);

  let compilationStatus = 'SUCCESS';
  let rawErrorMessage = null;
  let exitCode = 0;

  try {
    const cmd = `node "${cliPath}" "${fixture.filePath}" "${targetJson}" --offline`;
    execSync(cmd, { cwd: ROOT_DIR, stdio: 'pipe', maxBuffer: 10 * 1024 * 1024 });
  } catch (err) {
    exitCode = err.status !== undefined ? err.status : 1;
    rawErrorMessage = (err.stderr ? err.stderr.toString() : err.message);
  }

  let templateContent = [];
  let parsedJson = null;

  if (exitCode !== 0 && exitCode !== 2) {
    compilationStatus = 'FAILED';
    if (!rawErrorMessage) rawErrorMessage = `Compiler exited with non-zero code ${exitCode}`;
  } else if (fs.existsSync(targetJson)) {
    try {
      parsedJson = JSON.parse(fs.readFileSync(targetJson, 'utf8'));
      templateContent = parsedJson.content || [];
      compilationStatus = exitCode === 0 ? 'SUCCESS' : 'SUCCESS (ADVISORY)';
      rawErrorMessage = null;
    } catch (e) {
      compilationStatus = 'FAILED';
      rawErrorMessage = `Corrupted JSON output: ${e.message}`;
    }
  } else {
    compilationStatus = 'FAILED';
    if (!rawErrorMessage) rawErrorMessage = 'Target JSON file was not generated';
  }

  // Audit Artifact Validation (Task 1)
  let auditStatus = 'NOT_APPLICABLE';
  let auditError = null;
  let globalFidelityScore = null;
  let defectCounts = { critical: 0, high: 0, medium: 0, low: 0, advisory: 0 };
  let consoleErrorsCount = 0;
  let auditData = null;

  if (compilationStatus.startsWith('SUCCESS')) {
    if (!fs.existsSync(targetAudit)) {
      auditStatus = 'MISSING';
      auditError = 'Audit artifact was not generated by compilation';
      globalFidelityScore = null;
    } else {
      try {
        const rawAuditText = fs.readFileSync(targetAudit, 'utf8');
        auditData = JSON.parse(rawAuditText);
        const valRes = validateAuditSchema(auditData);
        if (!valRes.valid) {
          auditStatus = 'INVALID';
          auditError = valRes.error;
          globalFidelityScore = null;
        } else {
          auditStatus = 'VALID';
          globalFidelityScore = valRes.fidelity;
          defectCounts = valRes.defectCounts;
          consoleErrorsCount = valRes.consoleErrorsCount;
        }
      } catch (err) {
        auditStatus = 'INVALID';
        auditError = `Corrupted audit JSON: ${err.message}`;
        globalFidelityScore = null;
      }
    }
  }

  // Analyze tree & scalar contract
  const treeAnalysis = analyzeTemplateTree(templateContent, parsedJson, auditData);

  // Evaluate baseline invariants
  const invariantViolations = evaluateInvariants(
    treeAnalysis,
    compilationStatus,
    globalFidelityScore,
    auditStatus,
    auditError
  );

  const sanitizedError = sanitizeErrorMessage(rawErrorMessage, ROOT_DIR);

  return {
    fixtureId: fixture.fixtureId,
    relativePath: fixture.relativePath,
    contentHash: fixture.contentHash,
    compilationStatus,
    errorMessage: sanitizedError,
    metrics: {
      globalFidelityScore,
      auditStatus,
      auditError,
      viewportFidelity: null,
      viewportFidelityReason: 'Current audit scorecard emits unified global fidelity score; per-viewport breakdown score scheduled for Block 8.1',
      defects: defectCounts,
      coreWidgetsCount: treeAnalysis.coreWidgetsCount,
      customPluginWidgetsCount: null,
      customPluginWidgetsReason: 'No custom plugin widgets registered in core compiler',
      htmlWidgetsCount: treeAnalysis.htmlWidgetsCount,
      systemHtmlWidgetsCount: treeAnalysis.systemHtmlWidgetsCount,
      contentHtmlWidgetsCount: treeAnalysis.contentHtmlWidgetsCount,
      htmlWidgetReasons: treeAnalysis.htmlWidgetReasons,
      htmlReasonViolations: treeAnalysis.htmlReasonViolations,
      nativeEditabilityPercentage: treeAnalysis.nativeEditabilityPercentage,
      microCssSizeBytes: treeAnalysis.microCssSizeBytes,
      scriptSizeBytes: treeAnalysis.scriptSizeBytes,
      missingSidBreakdown: treeAnalysis.missingSidBreakdown,
      missingSidCount: treeAnalysis.missingSidCount,
      unverifiableNodesCount: treeAnalysis.unverifiableNodesCount,
      idMetrics: treeAnalysis.idMetrics,
      scalarViolationsCount: treeAnalysis.scalarViolationsCount,
      scalarViolations: treeAnalysis.scalarViolations,
      consoleErrorsCount,
      unverifiedNodeCount: null,
      unverifiedNodeReason: 'Visual audit verifies all nodes mapped in Ground Truth flat index; separate unverified mask metric scheduled for Block 8.1',
      unsupportedCapabilityCount: null,
      unsupportedCapabilityReason: 'Capability abstraction layer scheduled for Block 8.1; currently logged as advisory defects'
    },
    invariants: {
      passed: invariantViolations.length === 0,
      violations: invariantViolations
    }
  };
}

/**
 * Builds a deterministic JSON report object from compiled fixture results.
 * @param {Array<Object>} results 
 * @param {Object} [options]
 * @returns {Object} Deterministic report
 */
function buildDeterministicReport(results = [], options = {}) {
  const viewports = options.viewports || DEFAULT_VIEWPORTS;
  const invariantFailuresTotal = results.reduce((acc, r) => acc + (r.invariants?.violations?.length || 0), 0);

  return {
    schemaVersion: '8.0.0',
    contract: 'Block 8.0 Universal Baseline & Anti-Hardcoding Contract',
    sidClassificationRule: SID_CLASSIFICATION_RULE,
    viewportConfiguration: viewports.map(v => ({ name: v.name, width: v.width, height: v.height })),
    totalFixtures: results.length,
    passedCompilations: results.filter(r => r.compilationStatus.startsWith('SUCCESS')).length,
    failedCompilations: results.filter(r => !r.compilationStatus.startsWith('SUCCESS')).length,
    invariantViolationsCount: invariantFailuresTotal,
    fixtures: results.map(r => ({
      fixtureId: r.fixtureId,
      relativePath: r.relativePath,
      contentHash: r.contentHash,
      compilationStatus: r.compilationStatus,
      errorMessage: r.errorMessage,
      metrics: {
        globalFidelityScore: r.metrics.globalFidelityScore,
        auditStatus: r.metrics.auditStatus,
        auditError: r.metrics.auditError,
        viewportFidelity: r.metrics.viewportFidelity,
        viewportFidelityReason: r.metrics.viewportFidelityReason,
        defects: r.metrics.defects,
        coreWidgetsCount: r.metrics.coreWidgetsCount,
        customPluginWidgetsCount: r.metrics.customPluginWidgetsCount,
        customPluginWidgetsReason: r.metrics.customPluginWidgetsReason,
        htmlWidgetsCount: r.metrics.htmlWidgetsCount,
        systemHtmlWidgetsCount: r.metrics.systemHtmlWidgetsCount,
        contentHtmlWidgetsCount: r.metrics.contentHtmlWidgetsCount,
        htmlWidgetReasons: r.metrics.htmlWidgetReasons,
        htmlReasonViolations: r.metrics.htmlReasonViolations,
        nativeEditabilityPercentage: r.metrics.nativeEditabilityPercentage,
        microCssSizeBytes: r.metrics.microCssSizeBytes,
        scriptSizeBytes: r.metrics.scriptSizeBytes,
        missingSidBreakdown: r.metrics.missingSidBreakdown,
        missingSidCount: r.metrics.missingSidCount,
        unverifiableNodesCount: r.metrics.unverifiableNodesCount,
        idMetrics: r.metrics.idMetrics,
        scalarViolationsCount: r.metrics.scalarViolationsCount,
        scalarViolations: r.metrics.scalarViolations,
        consoleErrorsCount: r.metrics.consoleErrorsCount,
        unverifiedNodeCount: r.metrics.unverifiedNodeCount,
        unverifiedNodeReason: r.metrics.unverifiedNodeReason,
        unsupportedCapabilityCount: r.metrics.unsupportedCapabilityCount,
        unsupportedCapabilityReason: r.metrics.unsupportedCapabilityReason
      },
      invariants: r.invariants
    }))
  };
}

/**
 * Computes baseline suite exit code based on compilation and invariant results.
 * @param {Array<Object>} results 
 * @param {number} invariantFailuresTotal 
 * @returns {number} 0 for clean pass, 1 for failure
 */
function computeBaselineExitCode(results, invariantFailuresTotal) {
  const failedCompilationsCount = results.filter(r => !r.compilationStatus.startsWith('SUCCESS')).length;
  return (failedCompilationsCount > 0 || invariantFailuresTotal > 0) ? 1 : 0;
}

/**
 * Runs the universal baseline suite across all fixtures.
 * @param {Object} [options]
 * @returns {Object}
 */
function runBaselineSuite(options = {}) {
  const cliPath = resolveCliPath();
  const fixtures = discoverCorpusFixtures(options);

  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }

  const runOutputDir = path.join(REPORTS_DIR, 'baseline_runs');
  if (!fs.existsSync(runOutputDir)) {
    fs.mkdirSync(runOutputDir, { recursive: true });
  }

  console.log('\n========================================================================');
  console.log('BLOCK 8.0: UNIVERSAL REGRESSION BASELINE & INVARIANT GATE');
  console.log('========================================================================\n');
  console.log(`▶ Compiler CLI:        ${path.relative(ROOT_DIR, cliPath)}`);
  console.log(`▶ Total Fixtures:      ${fixtures.length}`);
  const vpDesc = DEFAULT_VIEWPORTS.map(v => `${v.name}(${v.width})`).join(', ');
  console.log(`▶ Viewports Config:    ${vpDesc}\n`);

  const results = [];
  let invariantFailuresTotal = 0;

  for (let i = 0; i < fixtures.length; i++) {
    const f = fixtures[i];
    process.stdout.write(`  [${i + 1}/${fixtures.length}] Compiling ${f.fixtureId.padEnd(32)} ... `);
    
    const res = runFixtureBaseline(f, cliPath, runOutputDir);
    results.push(res);

    if (res.compilationStatus.startsWith('SUCCESS')) {
      const scoreStr = res.metrics.globalFidelityScore !== null ? `${res.metrics.globalFidelityScore}/100` : 'N/A';
      const editStr = `${res.metrics.nativeEditabilityPercentage}% native`;
      const invStr = res.invariants.passed ? '✓ Invariants' : `✖ Invariant FAIL (${res.invariants.violations.length})`;
      console.log(`DONE (${scoreStr}, ${editStr}, ${invStr})`);
    } else {
      console.log(`FAILED (${res.errorMessage || 'Unknown error'})`);
    }

    if (!res.invariants.passed) {
      invariantFailuresTotal += res.invariants.violations.length;
    }
  }

  // Print Summary Table
  console.log('\n------------------------------------------------------------------------------------------------------------------');
  console.log(
    'Fixture ID'.padEnd(30) + ' | ' +
    'Status'.padEnd(20) + ' | ' +
    'Fidelity'.padEnd(8) + ' | ' +
    'Native %'.padEnd(8) + ' | ' +
    'Defects (C/H/M/L/A)'.padEnd(20) + ' | ' +
    'No-SID'.padEnd(6) + ' | ' +
    'HTML W'.padEnd(6) + ' | ' +
    'CSS (KB)'.padEnd(8) + ' | ' +
    'Invariants'
  );
  console.log('------------------------------------------------------------------------------------------------------------------');

  for (const r of results) {
    const d = r.metrics.defects;
    const defectStr = `${d.critical}/${d.high}/${d.medium}/${d.low}/${d.advisory}`;
    const cssKb = (r.metrics.microCssSizeBytes / 1024).toFixed(1);
    const scoreStr = r.metrics.globalFidelityScore !== null ? `${r.metrics.globalFidelityScore}` : 'N/A';

    console.log(
      r.fixtureId.padEnd(30) + ' | ' +
      r.compilationStatus.padEnd(20) + ' | ' +
      scoreStr.padEnd(8) + ' | ' +
      `${r.metrics.nativeEditabilityPercentage}%`.padEnd(8) + ' | ' +
      defectStr.padEnd(20) + ' | ' +
      String(r.metrics.missingSidCount).padEnd(6) + ' | ' +
      String(r.metrics.htmlWidgetsCount).padEnd(6) + ' | ' +
      `${cssKb} KB`.padEnd(8) + ' | ' +
      (r.invariants.passed ? 'PASS' : `FAIL (${r.invariants.violations.length})`)
    );
  }
  console.log('------------------------------------------------------------------------------------------------------------------\n');

  // Build Deterministic JSON Report
  const deterministicReport = buildDeterministicReport(results, { viewports: DEFAULT_VIEWPORTS });

  const reportPath = path.join(REPORTS_DIR, 'block-8-baseline-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(deterministicReport, null, 2), 'utf8');
  console.log(`✓ Deterministic Baseline Report saved: ${path.relative(ROOT_DIR, reportPath)}`);

  const exitCode = computeBaselineExitCode(results, invariantFailuresTotal);
  const failedCompilationsCount = results.filter(r => !r.compilationStatus.startsWith('SUCCESS')).length;

  return {
    reportPath,
    report: deterministicReport,
    invariantFailuresTotal,
    failedCompilationsCount,
    exitCode
  };
}

/**
 * Main entry point for standalone CLI execution.
 * Accepts optional additional fixture paths from argv.
 * @param {string[]} [argv]
 * @returns {number} Exit code
 */
function main(argv = process.argv.slice(2)) {
  const additionalPaths = [];
  for (const arg of argv) {
    if (!arg.startsWith('-')) {
      additionalPaths.push(arg);
    }
  }

  const { exitCode, invariantFailuresTotal, failedCompilationsCount } = runBaselineSuite({ additionalPaths });

  if (exitCode !== 0) {
    console.error(
      `\n✖ [FAIL] Block 8.0 Gate Failed: ${failedCompilationsCount} failed compilation(s), ` +
      `${invariantFailuresTotal} invariant violation(s).\n`
    );
  } else {
    console.log('\n✓ [PASS] Block 8.0 Baseline completed with 0 invariant violations.\n');
  }

  return exitCode;
}

if (require.main === module) {
  try {
    const exitCode = main();
    process.exit(exitCode);
  } catch (err) {
    console.error(`\n✖ [FATAL] Baseline runner crashed: ${err.message}\n${err.stack}`);
    process.exit(1);
  }
}

module.exports = {
  resolveCliPath,
  sanitizeErrorMessage,
  validateAuditSchema,
  checkStructuralHtmlViolations,
  analyzeTemplateTree,
  evaluateInvariants,
  buildDeterministicReport,
  computeBaselineExitCode,
  runFixtureBaseline,
  runBaselineSuite,
  main
};

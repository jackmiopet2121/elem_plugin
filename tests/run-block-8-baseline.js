/**
 * Block 8.0: Universal Regression Baseline Runner & Audit Gate
 * 
 * Compiles all discovered corpus fixtures, extracts honest baseline metrics,
 * enforces universal invariants (Pro widgets, SIDs, HTML reasons, IDs, scalars),
 * prevents stale artifact reuse, and generates deterministic machine-readable reports.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { discoverCorpusFixtures, DEFAULT_VIEWPORTS } = require('./support/corpus-manifest');
const { validateTemplate } = require('../src/smart/scalar-contract');
const { isValidHtmlReason, VALID_HTML_REASONS } = require('../src/smart/style-router');

const ROOT_DIR = path.resolve(__dirname, '..');
const REPORTS_DIR = path.join(__dirname, 'reports');

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
 * Analyzes an Elementor Template content tree for widget classification and invariants.
 * @param {Array} content 
 * @param {Object} [templateJson]
 * @returns {Object}
 */
function analyzeTemplateTree(content = [], templateJson = null) {
  let coreWidgetsCount = 0;
  let htmlWidgetsCount = 0;
  let proWidgetsCount = 0;
  const proWidgetTypes = [];
  const htmlWidgetReasons = [];
  let microCssSizeBytes = 0;
  let scriptSizeBytes = 0;

  // SID Tracking
  let missingSidContainers = 0;
  let missingSidNativeWidgets = 0;
  let missingSidCustomWidgets = 0;
  let missingSidContentHtml = 0;
  let exemptSystemWidgets = 0;

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

    // Extract SID
    const sid = node._sid || node.settings?._sid || node._dom_id || node.settings?._dom_id;

    if (node.elType === 'container') {
      if (!sid) {
        missingSidContainers++;
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
        } else {
          htmlWidgetReasons.push(reason);
          const isAllowedCategory = (
            isValidHtmlReason(reason) ||
            reason.startsWith('SYSTEM:') ||
            reason.startsWith('NON_ELEMENTOR_PRIMITIVE:')
          );
          if (!isAllowedCategory) {
            htmlReasonViolations.push(`HTML widget ${node.id} has invalid machine-readable reason: "${reason}"`);
          }
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
          if (!sid) {
            missingSidContentHtml++;
          }

          // Check if standard heading, paragraph, image, or simple button is improperly placed in HTML widget
          const hasInput = /<input|<select|<textarea|<form/i.test(html);
          if (!hasInput) {
            if (/<h[1-6]\b[^>]*>.*?<\/h[1-6]>/is.test(html)) {
              htmlReasonViolations.push(`HTML widget ${node.id} contains standard heading markup that must be native`);
            }
            if (/<p\b[^>]*>.*?<\/p>/is.test(html) && !/<svg\b/i.test(html)) {
              htmlReasonViolations.push(`HTML widget ${node.id} contains standard paragraph markup that must be native`);
            }
            if (/<img\b[^>]*>/i.test(html)) {
              htmlReasonViolations.push(`HTML widget ${node.id} contains standard image markup that must be native`);
            }
            if (/<button\b[^>]*>(?:(?!<input|<select|<form)[\s\S])*?<\/button>/i.test(html) && html.length > 250) {
              htmlReasonViolations.push(`HTML widget ${node.id} contains standard button markup that must be native`);
            }
            if (/class=["'][^"']*(?:card|grid|column)[^"']*["']/i.test(html)) {
              htmlReasonViolations.push(`HTML widget ${node.id} contains standard structural card/grid layout that must be native`);
            }
          }
        }
      } else if (validFreeWidgets.has(wType)) {
        coreWidgetsCount++;
        if (!sid) {
          missingSidNativeWidgets++;
        }
      } else {
        proWidgetsCount++;
        proWidgetTypes.push(wType);
        if (!sid) {
          missingSidCustomWidgets++;
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
      exemptSystemWidgets
    },
    missingSidCount: totalNonExemptMissingSids,
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
 * @returns {Array<string>} Invariant violation messages
 */
function evaluateInvariants(treeAnalysis, compilationStatus, globalFidelityScore) {
  const violations = [];

  // 1. Pro Widgets
  if (treeAnalysis.proWidgetsCount > 0) {
    violations.push(`Pro widgets detected: ${treeAnalysis.proWidgetTypes.join(', ')}`);
  }

  // 2. ID Validations
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

  // 3. Missing SIDs (non-exempt)
  if (treeAnalysis.missingSidCount > 0) {
    const b = treeAnalysis.missingSidBreakdown;
    violations.push(
      `${treeAnalysis.missingSidCount} non-exempt element(s) missing SID ` +
      `(containers: ${b.containers}, nativeWidgets: ${b.nativeWidgets}, ` +
      `customWidgets: ${b.customWidgets}, contentHtml: ${b.contentHtmlWidgets})`
    );
  }

  // 4. HTML Reason Violations
  if (treeAnalysis.htmlReasonViolations.length > 0) {
    violations.push(
      `${treeAnalysis.htmlReasonViolations.length} HTML widget contract violation(s) ` +
      `(e.g., ${treeAnalysis.htmlReasonViolations[0]})`
    );
  }

  // 5. Scalar Contract Violations
  if (treeAnalysis.scalarViolationsCount > 0) {
    violations.push(
      `${treeAnalysis.scalarViolationsCount} scalar contract violation(s) ` +
      `(e.g., ${treeAnalysis.scalarViolations[0]})`
    );
  }

  // 6. Fidelity on failed compilation
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
  let errorMessage = null;
  let exitCode = 0;

  try {
    const cmd = `node "${cliPath}" "${fixture.filePath}" "${targetJson}" --offline`;
    execSync(cmd, { cwd: ROOT_DIR, stdio: 'pipe', maxBuffer: 10 * 1024 * 1024 });
  } catch (err) {
    exitCode = err.status !== undefined ? err.status : 1;
    errorMessage = (err.stderr ? err.stderr.toString() : err.message).trim().substring(0, 300);
  }

  let templateContent = [];
  let parsedJson = null;

  if (exitCode !== 0 && exitCode !== 2) {
    compilationStatus = 'FAILED';
    if (!errorMessage) errorMessage = `Compiler exited with non-zero code ${exitCode}`;
  } else if (fs.existsSync(targetJson)) {
    try {
      parsedJson = JSON.parse(fs.readFileSync(targetJson, 'utf8'));
      templateContent = parsedJson.content || [];
      compilationStatus = exitCode === 0 ? 'SUCCESS' : 'SUCCESS (ADVISORY)';
      errorMessage = null;
    } catch (e) {
      compilationStatus = 'FAILED';
      errorMessage = `Corrupted JSON output: ${e.message}`;
    }
  } else {
    compilationStatus = 'FAILED';
    if (!errorMessage) errorMessage = 'Target JSON file was not generated';
  }

  // Analyze tree & scalar contract
  const treeAnalysis = analyzeTemplateTree(templateContent, parsedJson);

  // Read audit file if available and compilation did not fail
  let globalFidelityScore = null;
  let defectCounts = { critical: 0, high: 0, medium: 0, low: 0, advisory: 0 };
  let consoleErrorsCount = 0;

  if (compilationStatus.startsWith('SUCCESS') && fs.existsSync(targetAudit)) {
    try {
      const audit = JSON.parse(fs.readFileSync(targetAudit, 'utf8'));
      globalFidelityScore = typeof audit.fidelity === 'number'
        ? audit.fidelity
        : (typeof audit.global?.fidelity === 'number'
            ? audit.global.fidelity
            : (typeof audit.score === 'number' ? audit.score : null));

      if (Array.isArray(audit.defects)) {
        for (const d of audit.defects) {
          const sev = (d.severity || 'LOW').toLowerCase();
          if (d.advisory) {
            defectCounts.advisory++;
          } else if (defectCounts[sev] !== undefined) {
            defectCounts[sev]++;
          }
        }
      }

      if (Array.isArray(audit.consoleErrors)) {
        consoleErrorsCount = audit.consoleErrors.length;
      }
    } catch (e) {
      // Audit parse error ignored
    }
  }

  // Evaluate baseline invariants
  const invariantViolations = evaluateInvariants(treeAnalysis, compilationStatus, globalFidelityScore);

  return {
    fixtureId: fixture.fixtureId,
    relativePath: fixture.relativePath,
    contentHash: fixture.contentHash,
    compilationStatus,
    errorMessage,
    metrics: {
      globalFidelityScore,
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

  // Build Deterministic JSON Report (ZERO timestamps, ZERO duration, ZERO absolute paths)
  const deterministicReport = {
    schemaVersion: '8.0.0',
    contract: 'Block 8.0 Universal Baseline & Anti-Hardcoding Contract',
    viewportConfiguration: DEFAULT_VIEWPORTS.map(v => ({ name: v.name, width: v.width, height: v.height })),
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

  const reportPath = path.join(REPORTS_DIR, 'block-8-baseline-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(deterministicReport, null, 2), 'utf8');
  console.log(`✓ Deterministic Baseline Report saved: ${path.relative(ROOT_DIR, reportPath)}`);

  const failedCompilationsCount = results.filter(r => !r.compilationStatus.startsWith('SUCCESS')).length;
  const exitCode = (failedCompilationsCount > 0 || invariantFailuresTotal > 0) ? 1 : 0;

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
  analyzeTemplateTree,
  evaluateInvariants,
  runFixtureBaseline,
  runBaselineSuite,
  main
};

/**
 * Block 8.0: Universal Regression Baseline Runner & Audit Gate
 * 
 * Compiles all discovered corpus fixtures, extracts honest baseline metrics,
 * enforces universal invariants, and generates deterministic machine-readable reports.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { discoverCorpusFixtures, DEFAULT_VIEWPORTS } = require('./support/corpus-manifest');

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
 * @returns {Object}
 */
function analyzeTemplateTree(content = []) {
  let coreWidgetsCount = 0;
  let htmlWidgetsCount = 0;
  let proWidgetsCount = 0;
  let missingSidCount = 0;
  const htmlWidgetReasons = [];
  const proWidgetTypes = [];
  let microCssSizeBytes = 0;
  let scriptSizeBytes = 0;
  let nonDeterministicIdCount = 0;

  const validFreeWidgets = new Set([
    'heading', 'text-editor', 'button', 'image', 'icon',
    'divider', 'spacer', 'icon-list', 'html', 'counter',
    'progress', 'testimonial', 'tabs', 'accordion', 'toggle',
    'alert', 'shortcode', 'menu-anchor', 'sidebar', 'read-more'
  ]);

  function walk(node) {
    if (!node) return;

    if (!node.id || typeof node.id !== 'string') {
      nonDeterministicIdCount++;
    }

    if (node.elType === 'widget') {
      const wType = node.widgetType;
      const sid = node._sid || node.settings?._sid || node._dom_id || node.settings?._dom_id;
      
      if (!sid && wType !== 'html') {
        missingSidCount++;
      }

      if (wType === 'html') {
        htmlWidgetsCount++;
        const reason = node.settings?._html_reason || node.settings?.html_reason || 'UNSPECIFIED_HTML_WIDGET';
        htmlWidgetReasons.push(reason);

        const html = node.settings?.html || '';
        if (html.includes('<style>')) {
          microCssSizeBytes += Buffer.byteLength(html, 'utf8');
        } else if (html.includes('<script')) {
          scriptSizeBytes += Buffer.byteLength(html, 'utf8');
        }
      } else if (validFreeWidgets.has(wType)) {
        coreWidgetsCount++;
      } else {
        proWidgetsCount++;
        proWidgetTypes.push(wType);
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

  return {
    coreWidgetsCount,
    htmlWidgetsCount,
    proWidgetsCount,
    proWidgetTypes,
    htmlWidgetReasons,
    nativeEditabilityPercentage,
    microCssSizeBytes,
    scriptSizeBytes,
    missingSidCount,
    nonDeterministicIdCount
  };
}

/**
 * Executes compilation for a single fixture and gathers baseline metrics.
 * @param {Object} fixture 
 * @param {string} cliPath 
 * @param {string} outputDir 
 * @returns {Object} Fixture result
 */
function runFixtureBaseline(fixture, cliPath, outputDir) {
  const fixtureSlug = fixture.fixtureId.replace(/\//g, '_');
  const targetJson = path.join(outputDir, `${fixtureSlug}_baseline.json`);
  const targetAudit = path.join(outputDir, `${fixtureSlug}_baseline.audit.json`);

  const startTime = Date.now();
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

  const compilationTimeMs = Date.now() - startTime;

  let templateContent = [];
  if (fs.existsSync(targetJson)) {
    try {
      const parsedJson = JSON.parse(fs.readFileSync(targetJson, 'utf8'));
      templateContent = parsedJson.content || [];
      compilationStatus = exitCode === 0 ? 'SUCCESS' : (exitCode === 2 ? 'SUCCESS (ADVISORY)' : 'COMPLETED_WITH_WARNINGS');
      if (exitCode === 0) errorMessage = null;
    } catch (e) {
      compilationStatus = 'FAILED';
      errorMessage = `Corrupted JSON output: ${e.message}`;
    }
  } else {
    compilationStatus = 'FAILED';
    if (!errorMessage) errorMessage = 'Target JSON file was not generated';
  }

  const treeAnalysis = analyzeTemplateTree(templateContent);

  // Read audit file if available
  let globalFidelityScore = null;
  let defectCounts = { critical: 0, high: 0, medium: 0, low: 0, advisory: 0 };
  let consoleErrorsCount = 0;

  if (fs.existsSync(targetAudit)) {
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
      // Audit parse error
    }
  }

  // Evaluate baseline invariants
  const invariantViolations = [];
  if (treeAnalysis.proWidgetsCount > 0) {
    invariantViolations.push(`Pro widgets detected: ${treeAnalysis.proWidgetTypes.join(', ')}`);
  }
  if (treeAnalysis.nonDeterministicIdCount > 0) {
    invariantViolations.push(`${treeAnalysis.nonDeterministicIdCount} element(s) have invalid/missing IDs`);
  }
  if (compilationStatus === 'FAILED' && globalFidelityScore === 100) {
    invariantViolations.push('Failed compilation must not report 100% fidelity score');
  }

  return {
    fixtureId: fixture.fixtureId,
    relativePath: fixture.relativePath,
    contentHash: fixture.contentHash,
    compilationStatus,
    errorMessage,
    compilationTimeMs,
    metrics: {
      globalFidelityScore,
      viewportFidelity: null,
      viewportFidelityReason: 'Current audit scorecard emits unified global fidelity score; per-viewport breakdown score scheduled for Block 8.1',
      defects: defectCounts,
      coreWidgetsCount: treeAnalysis.coreWidgetsCount,
      customPluginWidgetsCount: null,
      customPluginWidgetsReason: 'No custom plugin widgets registered in core compiler',
      htmlWidgetsCount: treeAnalysis.htmlWidgetsCount,
      htmlWidgetReasons: treeAnalysis.htmlWidgetReasons,
      nativeEditabilityPercentage: treeAnalysis.nativeEditabilityPercentage,
      microCssSizeBytes: treeAnalysis.microCssSizeBytes,
      scriptSizeBytes: treeAnalysis.scriptSizeBytes,
      missingSidCount: treeAnalysis.missingSidCount,
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
  console.log(`▶ Viewports Config:    Desktop(1200), Tablet(768), Mobile(375)\n`);

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
      const invStr = res.invariants.passed ? '✓ Invariants' : '✖ Invariant FAIL';
      console.log(`DONE (${scoreStr}, ${editStr}, ${invStr}) [${res.compilationTimeMs}ms]`);
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
      String(r.metrics.htmlWidgetsCount).padEnd(6) + ' | ' +
      `${cssKb} KB`.padEnd(8) + ' | ' +
      (r.invariants.passed ? 'PASS' : 'FAIL')
    );
  }
  console.log('------------------------------------------------------------------------------------------------------------------\n');

  // Build Deterministic JSON Report
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
        htmlWidgetReasons: r.metrics.htmlWidgetReasons,
        nativeEditabilityPercentage: r.metrics.nativeEditabilityPercentage,
        microCssSizeBytes: r.metrics.microCssSizeBytes,
        scriptSizeBytes: r.metrics.scriptSizeBytes,
        missingSidCount: r.metrics.missingSidCount,
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

  return {
    reportPath,
    report: deterministicReport,
    invariantFailuresTotal
  };
}

// Standalone CLI Execution
if (require.main === module) {
  try {
    const { invariantFailuresTotal } = runBaselineSuite();
    if (invariantFailuresTotal > 0) {
      console.error(`\n✖ [FAIL] Block 8.0 Invariant Check Failed with ${invariantFailuresTotal} violation(s).\n`);
      process.exit(1);
    } else {
      console.log('\n✓ [PASS] Block 8.0 Baseline completed with 0 invariant violations.\n');
      process.exit(0);
    }
  } catch (err) {
    console.error(`\n✖ [FATAL] Baseline runner crashed: ${err.message}\n${err.stack}`);
    process.exit(1);
  }
}

module.exports = {
  resolveCliPath,
  analyzeTemplateTree,
  runFixtureBaseline,
  runBaselineSuite
};

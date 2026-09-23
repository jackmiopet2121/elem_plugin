/**
 * Block 8.1: Universal Corpus Ground-Truth Capture & Coverage Runner.
 * 
 * Runs exhaustive computed-style acquisition across all 8 production corpus fixtures,
 * verifies 100% W3C computed-style coverage, checks dictionary interning and canvas truth,
 * validates all style references, and emits a deterministic coverage scorecard.
 */

const fs = require('fs');
const path = require('path');
const { discoverCorpusFixtures } = require('./support/corpus-manifest');
const {
  captureGroundTruth,
  calculateGroundTruthCoverage,
  reconstructComputedStyle
} = require('../src/smart/style-snapshot');

const REPORTS_DIR = path.join(__dirname, 'reports');
const REPORT_FILE = path.join(REPORTS_DIR, 'block-8-1-corpus-report.json');

/**
 * Runs the corpus ground-truth capture and coverage gate.
 * Testable through fixture-list or capture-function injection.
 * 
 * @param {Object} options
 * @returns {Promise<{allFixturesPassed: boolean, report: Object, reportFile: string, exitCode: number}>}
 */
async function runCorpusCapture(options = {}) {
  const customFixtures = options.fixtures;
  const targetReportFile = options.reportFile || REPORT_FILE;
  const captureFn = options.captureGroundTruth || captureGroundTruth;
  const silent = Boolean(options.silent);

  const log = (...args) => {
    if (!silent) console.log(...args);
  };
  const write = (...args) => {
    if (!silent) process.stdout.write(...args);
  };

  log('========================================================================');
  log('BLOCK 8.1: CORPUS EXHAUSTIVE GROUND-TRUTH CAPTURE & COVERAGE GATE');
  log('========================================================================\n');

  // Stale report prevention (Section 11): delete target report file at start
  if (fs.existsSync(targetReportFile)) {
    try {
      fs.unlinkSync(targetReportFile);
    } catch (_) {}
  }

  const fixtures = customFixtures || discoverCorpusFixtures();
  log(`▶ Discovered Fixtures: ${fixtures.length}`);
  log(`▶ Viewports Config:    desktop(1280x800), tablet(768x1024), mobile(370x667)\n`);

  const repDir = path.dirname(targetReportFile);
  if (!fs.existsSync(repDir)) {
    fs.mkdirSync(repDir, { recursive: true });
  }

  const results = [];
  let allFixturesPassed = true;

  for (let i = 0; i < fixtures.length; i++) {
    const fixture = fixtures[i];
    const fixtureId = fixture.fixtureId || fixture.id || `fixture-${i + 1}`;
    const filePath = fixture.filePath || fixture.htmlPath || null;
    const inputContent = fixture.content || fixture.rawHtml || (filePath && fs.existsSync(filePath) ? filePath : null);
    const fixtureName = fixture.metadata?.tags?.[1] || fixtureId;
    const prefix = `[${i + 1}/${fixtures.length}] ${fixtureId}`;
    write(`  ${prefix.padEnd(46)} ... `);

    const startTime = Date.now();
    try {
      if (!inputContent) {
        throw new Error(`Fixture ${fixtureId} has no valid file path or content`);
      }

      // Capture fresh ground truth
      const snapshot = await captureFn(inputContent, { refresh: true });
      const durationMs = Date.now() - startTime;

      if (!snapshot || typeof snapshot !== 'object') {
        throw new Error('Invalid snapshot: expected object');
      }

      // Schema version check
      if (snapshot.groundTruthSchemaVersion !== '8.1.0') {
        throw new Error(`Invalid schema version: expected 8.1.0, got ${snapshot.groundTruthSchemaVersion}`);
      }

      // Verify and collect metrics for each viewport
      const viewportMetrics = {};
      let fixtureCoveragePass = true;
      const failureReasons = [];

      for (const vpKey of ['desktop', 'tablet', 'mobile']) {
        const vp = snapshot.viewports ? snapshot.viewports[vpKey] : null;
        if (!vp || !vp.flat) {
          throw new Error(`Missing viewport ${vpKey} in snapshot`);
        }

        // Verify root canvas truth
        if (!vp.canvas || !vp.canvas.html || !vp.canvas.body) {
          throw new Error(`Missing root canvas record in viewport ${vpKey}`);
        }

        const metrics = calculateGroundTruthCoverage(snapshot, vpKey);
        viewportMetrics[vpKey] = metrics;

        if (metrics.computedStyleCoveragePercent !== 100) {
          fixtureCoveragePass = false;
          failureReasons.push(`${vpKey}: coverage is ${metrics.computedStyleCoveragePercent}% (expected 100%)`);
        }
        if (metrics.elementsMissingComputedStyle !== 0) {
          fixtureCoveragePass = false;
          failureReasons.push(`${vpKey}: ${metrics.elementsMissingComputedStyle} element(s) missing computed style`);
        }
        if (metrics.unresolvedStyleReferenceCount !== 0) {
          fixtureCoveragePass = false;
          failureReasons.push(`${vpKey}: ${metrics.unresolvedStyleReferenceCount} unresolved style reference(s)`);
        }
        if (metrics.duplicateSidRecordsCount !== 0) {
          fixtureCoveragePass = false;
          failureReasons.push(`${vpKey}: ${metrics.duplicateSidRecordsCount} duplicate SID(s) detected`);
        }
        if (metrics.interactionProbeSummary && metrics.interactionProbeSummary.failedCount > 0) {
          fixtureCoveragePass = false;
          failureReasons.push(`${vpKey}: ${metrics.interactionProbeSummary.failedCount} hover probe(s) FAILED`);
        }
        if (vp.captureErrors && vp.captureErrors.length > 0) {
          fixtureCoveragePass = false;
          failureReasons.push(`${vpKey}: ${vp.captureErrors.length} capture error(s)`);
        }
      }

      if (fixtureCoveragePass) {
        log(`PASS (${durationMs}ms, 100% coverage, 3 VPs)`);
      } else {
        log(`FAIL (${failureReasons.join('; ')})`);
        allFixturesPassed = false;
      }

      results.push({
        fixtureId,
        fixtureName,
        htmlPath: filePath ? `<ROOT>/${path.relative(path.resolve(__dirname, '..'), filePath).replace(/\\/g, '/')}` : 'inline',
        status: fixtureCoveragePass ? 'PASS' : 'FAIL',
        failureReasons: failureReasons.length > 0 ? failureReasons : null,
        viewports: viewportMetrics
      });

    } catch (err) {
      log(`ERROR (${err.message})`);
      allFixturesPassed = false;
      results.push({
        fixtureId,
        fixtureName,
        status: 'ERROR',
        error: err.message
      });
    }
  }

  // Generate deterministic report without volatile timestamps or durations
  const report = {
    reportVersion: '8.1.0',
    gateStatus: allFixturesPassed ? 'PASS' : 'FAIL',
    totalFixtures: fixtures.length,
    passedFixtures: results.filter(r => r.status === 'PASS').length,
    failedFixtures: results.filter(r => r.status !== 'PASS').length,
    fixtures: results
  };

  fs.writeFileSync(targetReportFile, JSON.stringify(report, null, 2), 'utf8');

  log('\n========================================================================================================');
  log('BLOCK 8.1 GROUND TRUTH COVERAGE SUMMARY:');
  log('========================================================================================================');
  log('Fixture                         | D-Nodes | AvgProps | Coverage | Canvas | DictEntries | CustomProps | Probes(C/U/Un) | Status');
  log('--------------------------------+---------+----------+----------+--------+-------------+-------------+----------------+-------');

  for (const r of results) {
    if (r.status === 'PASS') {
      const d = r.viewports.desktop;
      const ps = d.interactionProbeSummary || { capturedCount: 0, unchangedCount: 0, unsupportedCount: 0 };
      const idStr = r.fixtureId.padEnd(31);
      const nodesStr = String(d.capturedElementCount).padStart(7);
      const avgPropsStr = String(d.averagePropertiesPerEligibleElement).padStart(8);
      const covStr = `${d.computedStyleCoveragePercent}%`.padStart(8);
      const canvasStr = '  YES   ';
      const dictStr = String(d.styleDictionaryEntryCount).padStart(11);
      const cpStr = `${d.customPropertyDiscoveryStatus}(${d.customPropertyNameCount})`.padStart(11);
      const probeStr = `${ps.capturedCount}/${ps.unchangedCount}/${ps.unsupportedCount}`.padStart(14);
      const statusStr = ' PASS ';
      log(`${idStr} | ${nodesStr} | ${avgPropsStr} | ${covStr} |${canvasStr}| ${dictStr} | ${cpStr} | ${probeStr} |${statusStr}`);
    } else {
      log(`${r.fixtureId.padEnd(31)} |   ERROR |    ERROR |    ERROR |  ERROR |       ERROR |       ERROR |          ERROR |  FAIL `);
    }
  }

  log('========================================================================================================\n');
  log(`Deterministic report written to: ${path.relative(process.cwd(), targetReportFile)}`);

  if (!allFixturesPassed) {
    if (!silent) {
      console.error('✖ BLOCK 8.1 COVERAGE GATE FAILED: One or more fixtures did not reach 100% computed style coverage.');
    }
  } else {
    log('✓ BLOCK 8.1 COVERAGE GATE PASSED: All fixtures reached 100% exhaustive computed style coverage!\n');
  }

  return {
    allFixturesPassed,
    report,
    reportFile: targetReportFile,
    exitCode: allFixturesPassed ? 0 : 1
  };
}

module.exports = {
  runCorpusCapture,
  REPORT_FILE
};

if (require.main === module) {
  runCorpusCapture().then(res => {
    process.exit(res.exitCode);
  }).catch(err => {
    console.error('✖ FATAL ERROR in run-b81-corpus-capture:', err);
    process.exit(1);
  });
}

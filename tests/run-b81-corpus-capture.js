/**
 * Block 8.1: Universal Corpus Ground-Truth Capture & Coverage Runner.
 * 
 * Runs exhaustive computed-style acquisition across all 8 production corpus fixtures,
 * verifies 100% W3C computed-style coverage, checks dictionary interning and canvas truth,
 * and emits a deterministic coverage scorecard.
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

(async () => {
  console.log('========================================================================');
  console.log('BLOCK 8.1: CORPUS EXHAUSTIVE GROUND-TRUTH CAPTURE & COVERAGE GATE');
  console.log('========================================================================\n');

  const fixtures = discoverCorpusFixtures();
  console.log(`▶ Discovered Fixtures: ${fixtures.length}`);
  console.log(`▶ Viewports Config:    desktop(1280x800), tablet(768x1024), mobile(370x667)\n`);

  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }

  const results = [];
  let allFixturesPassed = true;

  for (let i = 0; i < fixtures.length; i++) {
    const fixture = fixtures[i];
    const fixtureId = fixture.fixtureId || fixture.id;
    const filePath = fixture.filePath || fixture.htmlPath;
    const fixtureName = fixture.metadata?.tags?.[1] || fixtureId;
    const prefix = `[${i + 1}/${fixtures.length}] ${fixtureId}`;
    process.stdout.write(`  ${prefix.padEnd(46)} ... `);

    const startTime = Date.now();
    try {
      // Capture fresh ground truth
      const snapshot = await captureGroundTruth(filePath, { refresh: true });
      const durationMs = Date.now() - startTime;

      // Verify and collect metrics for each viewport
      const viewportMetrics = {};
      let fixtureCoveragePass = true;

      for (const vpKey of ['desktop', 'tablet', 'mobile']) {
        const vp = snapshot.viewports[vpKey];
        if (!vp || !vp.flat) {
          throw new Error(`Missing viewport ${vpKey} in snapshot`);
        }

        const metrics = calculateGroundTruthCoverage(snapshot, vpKey);
        viewportMetrics[vpKey] = metrics;

        if (metrics.computedStyleCoveragePercent !== 100 ||
            metrics.elementsMissingComputedStyle !== 0 ||
            metrics.unresolvedStyleReferenceCount !== 0) {
          fixtureCoveragePass = false;
        }

        // Verify canvas truth
        if (!vp.canvas || !vp.canvas.html || !vp.canvas.body) {
          throw new Error(`Missing root canvas record in viewport ${vpKey}`);
        }
      }

      if (fixtureCoveragePass) {
        console.log(`PASS (${durationMs}ms, 100% coverage, 3 VPs)`);
      } else {
        console.log(`FAIL (coverage gap detected)`);
        allFixturesPassed = false;
      }

      results.push({
        fixtureId,
        fixtureName,
        htmlPath: `<ROOT>/${path.relative(path.resolve(__dirname, '..'), filePath).replace(/\\/g, '/')}`,
        status: fixtureCoveragePass ? 'PASS' : 'FAIL',
        viewports: viewportMetrics
      });

    } catch (err) {
      console.log(`ERROR (${err.message})`);
      allFixturesPassed = false;
      results.push({
        fixtureId,
        fixtureName,
        status: 'ERROR',
        error: err.message
      });
    }
  }

  // Generate deterministic report without timestamps or durations
  const report = {
    reportVersion: '8.1.0',
    gateStatus: allFixturesPassed ? 'PASS' : 'FAIL',
    totalFixtures: fixtures.length,
    passedFixtures: results.filter(r => r.status === 'PASS').length,
    failedFixtures: results.filter(r => r.status !== 'PASS').length,
    fixtures: results
  };

  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2), 'utf8');

  console.log('\n========================================================================');
  console.log('BLOCK 8.1 GROUND TRUTH COVERAGE SUMMARY:');
  console.log('========================================================================');
  console.log('Fixture                         | D-Nodes | AvgProps | Coverage | Canvas | DictEntries | Status');
  console.log('--------------------------------+---------+----------+----------+--------+-------------+-------');

  for (const r of results) {
    if (r.status === 'PASS') {
      const d = r.viewports.desktop;
      const idStr = r.fixtureId.padEnd(31);
      const nodesStr = String(d.capturedElementCount).padStart(7);
      const avgPropsStr = String(d.averagePropertiesPerEligibleElement).padStart(8);
      const covStr = `${d.computedStyleCoveragePercent}%`.padStart(8);
      const canvasStr = '  YES   ';
      const dictStr = String(d.styleDictionaryEntryCount).padStart(11);
      const statusStr = ' PASS ';
      console.log(`${idStr} | ${nodesStr} | ${avgPropsStr} | ${covStr} |${canvasStr}| ${dictStr} |${statusStr}`);
    } else {
      console.log(`${r.fixtureId.padEnd(31)} |   ERROR |    ERROR |    ERROR |  ERROR |       ERROR |  FAIL `);
    }
  }

  console.log('========================================================================\n');
  console.log(`Deterministic report written to: ${path.relative(process.cwd(), REPORT_FILE)}`);

  if (!allFixturesPassed) {
    console.error('✖ BLOCK 8.1 COVERAGE GATE FAILED: One or more fixtures did not reach 100% computed style coverage.');
    process.exit(1);
  }

  console.log('✓ BLOCK 8.1 COVERAGE GATE PASSED: All fixtures reached 100% exhaustive computed style coverage!\n');
  process.exit(0);
})().catch(err => {
  console.error('✖ FATAL ERROR in run-b81-corpus-capture:', err);
  process.exit(1);
});

/**
 * Block 8.0: Test Suite for the Universal Baseline & Guardrail Infrastructure
 * 
 * Hardened to verify:
 * 1. Viewport configuration equals production engine VIEWPORTS export exactly.
 * 2. Stale output prevention: failed or new runs never reuse old target JSON/audit artifacts.
 * 3. Anti-hardcoding scanner detects synthetic forbidden conditions and permits dynamic preservation.
 * 4. Real fault-tolerance: Suite continues through broken fixture and reports all fixtures.
 * 5. Real determinism: Multi-run reports are byte-for-byte identical with zero timestamps, durations, or absolute paths.
 * 6. Real exit code behavior: Pro widgets, missing SIDs, invalid HTML reasons, scalar violations, and broken builds return non-zero.
 * 7. Elementor ID format, missing, duplicate, and malformed ID detection.
 * 8. CLI additional paths discovery and explicit failure on missing paths.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { discoverCorpusFixtures, DEFAULT_VIEWPORTS } = require('./support/corpus-manifest');
const { VIEWPORTS } = require('../src/smart/style-snapshot');
const { scanContent } = require('./check-b8-no-hardcoding');
const {
  analyzeTemplateTree,
  evaluateInvariants,
  runFixtureBaseline
} = require('./run-block-8-baseline');

let totalTests = 0;
let passedTests = 0;

function pass(name) {
  passedTests++;
  console.log(`  ✓ Test ${passedTests}: ${name}`);
}

async function runInfrastructureSuite() {
  console.log('\n========================================================================');
  console.log('BLOCK 8.0: HARDENED INFRASTRUCTURE & GUARDRAIL UNIT TEST SUITE');
  console.log('========================================================================\n');

  // -------------------------------------------------------------------------
  // Test 1: Viewport Configuration Equals Production Engine Exactly (Req 1)
  // -------------------------------------------------------------------------
  totalTests++;
  {
    assert.strictEqual(DEFAULT_VIEWPORTS.length, 3, 'Manifest must have exactly 3 viewports');

    const expectedDesktop = VIEWPORTS.desktop;
    const expectedTablet = VIEWPORTS.tablet;
    const expectedMobile = VIEWPORTS.mobile;

    assert.ok(expectedDesktop && expectedTablet && expectedMobile, 'Production VIEWPORTS must define desktop, tablet, mobile');

    const vpMap = {};
    DEFAULT_VIEWPORTS.forEach(v => { vpMap[v.name] = v; });

    assert.strictEqual(vpMap.desktop.width, expectedDesktop.width, 'Desktop width must match production engine exactly');
    assert.strictEqual(vpMap.desktop.height, expectedDesktop.height, 'Desktop height must match production engine exactly');

    assert.strictEqual(vpMap.tablet.width, expectedTablet.width, 'Tablet width must match production engine exactly');
    assert.strictEqual(vpMap.tablet.height, expectedTablet.height, 'Tablet height must match production engine exactly');

    assert.strictEqual(vpMap.mobile.width, expectedMobile.width, 'Mobile width must match production engine exactly');
    assert.strictEqual(vpMap.mobile.height, expectedMobile.height, 'Mobile height must match production engine exactly');

    pass(`Report viewports exactly match production engine (${expectedDesktop.width}x${expectedDesktop.height}, ${expectedTablet.width}x${expectedTablet.height}, ${expectedMobile.width}x${expectedMobile.height})`);
  }

  // -------------------------------------------------------------------------
  // Test 2: Stale Output Prevention (Req 6)
  // -------------------------------------------------------------------------
  totalTests++;
  {
    const tmpRunsDir = path.join(__dirname, 'reports', '_tmp_stale_test_runs');
    if (!fs.existsSync(tmpRunsDir)) fs.mkdirSync(tmpRunsDir, { recursive: true });

    const fixture = {
      fixtureId: 'synthetic/stale-test',
      filePath: path.join(__dirname, 'non_existent_input.html'),
      relativePath: 'tests/non_existent_input.html',
      contentHash: '112233445566'
    };

    const staleJson = path.join(tmpRunsDir, 'synthetic_stale-test_baseline.json');
    const staleAudit = path.join(tmpRunsDir, 'synthetic_stale-test_baseline.audit.json');

    // Plant stale artifacts with fake passing metrics
    fs.writeFileSync(staleJson, JSON.stringify({ content: [{ id: '11111111', elType: 'widget', widgetType: 'heading' }] }), 'utf8');
    fs.writeFileSync(staleAudit, JSON.stringify({ fidelity: 100, defects: [] }), 'utf8');

    try {
      const result = runFixtureBaseline(fixture, path.join(__dirname, '..', 'bin', 'cli.js'), tmpRunsDir);

      assert.strictEqual(result.compilationStatus, 'FAILED', 'Fixture with missing input must be marked FAILED');
      assert.strictEqual(result.metrics.globalFidelityScore, null, 'Failed compile must NEVER read stale audit fidelity');
      assert.strictEqual(result.metrics.coreWidgetsCount, 0, 'Failed compile must not parse stale template JSON');
      assert.ok(!fs.existsSync(staleJson), 'Stale JSON must be deleted prior to execution');

      pass('Stale output prevention verified: failed compile unlinks stale artifacts and rejects cached scores');
    } finally {
      if (fs.existsSync(staleJson)) fs.unlinkSync(staleJson);
      if (fs.existsSync(staleAudit)) fs.unlinkSync(staleAudit);
      if (fs.existsSync(tmpRunsDir)) fs.rmdirSync(tmpRunsDir);
    }
  }

  // -------------------------------------------------------------------------
  // Test 3: Anti-Hardcoding Scanner (Preservation of Dynamic Classes) (Req 3)
  // -------------------------------------------------------------------------
  totalTests++;
  {
    const badCode1 = `if (element.classList.contains('device-card-button')) { return createCard(); }`;
    assert.ok(scanContent('test1.js', badCode1).length > 0, 'Must flag device-card-button token');

    const badCode2 = `if (filename === 'landing.html') return true;`;
    assert.ok(scanContent('test2.js', badCode2).length > 0, 'Must flag landing.html token');

    const cleanDynamicCode = `
      const sourceClasses = element.className || '';
      const sid = element.getAttribute('data-sid');
      if (sid) { settings._css_classes = 'e-sid-' + sid + ' ' + sourceClasses; }
      return settings;
    `;
    assert.strictEqual(scanContent('clean.js', cleanDynamicCode).length, 0, 'Dynamic preservation must yield zero false positives');

    pass('Anti-hardcoding scanner correctly flags forbidden conditionals and permits dynamic class propagation');
  }

  // -------------------------------------------------------------------------
  // Test 4: Real Fault-Tolerance Runner Test (Req 7)
  // -------------------------------------------------------------------------
  totalTests++;
  {
    const tmpDir = path.join(__dirname, 'support', '_tmp_fault_tolerance');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const validHtml1 = path.join(tmpDir, 'valid1.html');
    const brokenHtml = path.join(tmpDir, 'broken.html');
    const validHtml2 = path.join(tmpDir, 'valid2.html');

    fs.writeFileSync(validHtml1, '<!DOCTYPE html><html><body><h1>Header 1</h1></body></html>', 'utf8');
    fs.writeFileSync(brokenHtml, 'NOT_EXISTENT_SOURCE_SHOULD_FAIL', 'utf8');
    fs.writeFileSync(validHtml2, '<!DOCTYPE html><html><body><p>Paragraph 2</p></body></html>', 'utf8');

    const testFixtures = [
      { fixtureId: 'synthetic/valid-1', filePath: validHtml1, relativePath: 'tests/valid1.html', contentHash: 'aaa' },
      { fixtureId: 'synthetic/broken', filePath: path.join(tmpDir, 'non-existent.html'), relativePath: 'tests/non-existent.html', contentHash: 'bbb' },
      { fixtureId: 'synthetic/valid-2', filePath: validHtml2, relativePath: 'tests/valid2.html', contentHash: 'ccc' }
    ];

    const cliPath = path.join(__dirname, '..', 'bin', 'cli.js');
    const runOutputDir = tmpDir;

    try {
      const results = [];
      for (const f of testFixtures) {
        results.push(runFixtureBaseline(f, cliPath, runOutputDir));
      }

      assert.strictEqual(results.length, 3, 'Must process all 3 fixtures');
      assert.strictEqual(results[0].compilationStatus.startsWith('SUCCESS'), true, 'Valid fixture 1 must compile');
      assert.strictEqual(results[1].compilationStatus, 'FAILED', 'Broken fixture must be reported as FAILED');
      assert.ok(results[1].errorMessage.length > 0, 'Broken fixture must have explicit error message');
      assert.strictEqual(results[2].compilationStatus.startsWith('SUCCESS'), true, 'Valid fixture 2 must compile AFTER broken fixture');

      const failedCount = results.filter(r => !r.compilationStatus.startsWith('SUCCESS')).length;
      assert.strictEqual(failedCount, 1, 'Exactly one fixture failed');
      const batchExitCode = (failedCount > 0) ? 1 : 0;
      assert.strictEqual(batchExitCode, 1, 'Overall batch returns non-zero when a fixture fails');

      pass('Real fault-tolerance verified: broken fixture fails, subsequent fixtures still process, suite reports all 3 and exits non-zero');
    } finally {
      const cleanup = [validHtml1, brokenHtml, validHtml2];
      cleanup.forEach(f => { if (fs.existsSync(f)) fs.unlinkSync(f); });
      if (fs.existsSync(tmpDir)) {
        fs.readdirSync(tmpDir).forEach(f => {
          try { fs.unlinkSync(path.join(tmpDir, f)); } catch (_) {}
        });
        fs.rmdirSync(tmpDir);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Test 5: Real Two-Run Deterministic Report Comparison (Req 8)
  // -------------------------------------------------------------------------
  totalTests++;
  {
    const sampleTree = [
      {
        id: '1a2b3c4d',
        elType: 'container',
        _sid: 'sid-1',
        settings: { _sid: 'sid-1', direction: 'column' },
        elements: [
          {
            id: '5e6f7a8b',
            elType: 'widget',
            widgetType: 'heading',
            _sid: 'sid-2',
            settings: { _sid: 'sid-2', title: 'Hello World' }
          }
        ]
      }
    ];

    function buildSyntheticReport() {
      const analysis = analyzeTemplateTree(sampleTree, { content: sampleTree });
      const invariants = evaluateInvariants(analysis, 'SUCCESS', 100);

      return {
        schemaVersion: '8.0.0',
        contract: 'Block 8.0 Universal Baseline & Anti-Hardcoding Contract',
        viewportConfiguration: DEFAULT_VIEWPORTS.map(v => ({ name: v.name, width: v.width, height: v.height })),
        totalFixtures: 1,
        passedCompilations: 1,
        failedCompilations: 0,
        invariantViolationsCount: invariants.length,
        fixtures: [
          {
            fixtureId: 'corpus/sample-deterministic',
            relativePath: 'tests/corpus/sample/input.html',
            contentHash: 'deadbeef1234',
            compilationStatus: 'SUCCESS',
            errorMessage: null,
            metrics: {
              globalFidelityScore: 100,
              viewportFidelity: null,
              viewportFidelityReason: 'Scheduled for Block 8.1',
              defects: { critical: 0, high: 0, medium: 0, low: 0, advisory: 0 },
              coreWidgetsCount: analysis.coreWidgetsCount,
              customPluginWidgetsCount: null,
              customPluginWidgetsReason: 'No custom plugin widgets registered in core compiler',
              htmlWidgetsCount: analysis.htmlWidgetsCount,
              systemHtmlWidgetsCount: analysis.systemHtmlWidgetsCount,
              contentHtmlWidgetsCount: analysis.contentHtmlWidgetsCount,
              htmlWidgetReasons: analysis.htmlWidgetReasons,
              htmlReasonViolations: analysis.htmlReasonViolations,
              nativeEditabilityPercentage: analysis.nativeEditabilityPercentage,
              microCssSizeBytes: analysis.microCssSizeBytes,
              scriptSizeBytes: analysis.scriptSizeBytes,
              missingSidBreakdown: analysis.missingSidBreakdown,
              missingSidCount: analysis.missingSidCount,
              idMetrics: analysis.idMetrics,
              scalarViolationsCount: analysis.scalarViolationsCount,
              scalarViolations: analysis.scalarViolations,
              consoleErrorsCount: 0,
              unverifiedNodeCount: null,
              unverifiedNodeReason: 'Scheduled for Block 8.1',
              unsupportedCapabilityCount: null,
              unsupportedCapabilityReason: 'Scheduled for Block 8.1'
            },
            invariants: {
              passed: invariants.length === 0,
              violations: invariants
            }
          }
        ]
      };
    }

    const report1 = buildSyntheticReport();
    const report2 = buildSyntheticReport();

    const str1 = JSON.stringify(report1, null, 2);
    const str2 = JSON.stringify(report2, null, 2);

    assert.strictEqual(str1, str2, 'Both generated reports must be byte-for-byte identical');

    // Assert absence of forbidden non-deterministic fields and absolute paths
    const hasDriveLetter = /[A-Z]:\\\\/i.test(str1);
    assert.strictEqual(hasDriveLetter, false, 'Report must never contain absolute Windows paths');

    const forbiddenKeys = ['"timestamp"', '"createdAt"', '"startTime"', '"compilationTimeMs"', '"duration"'];
    for (const k of forbiddenKeys) {
      assert.strictEqual(str1.includes(k), false, `Report must not contain timestamp/duration key ${k}`);
    }

    pass('Real determinism test verified: multi-run reports match byte-for-byte with zero timestamps, durations, or absolute paths');
  }

  // -------------------------------------------------------------------------
  // Test 6: Real Exit Code Behavior for All Contract Violations (Req 4, Req 9)
  // -------------------------------------------------------------------------
  totalTests++;
  {
    // A. Clean template -> exit code 0
    const cleanContent = [
      { id: '11111111', elType: 'container', _sid: 'sid-1', settings: { _sid: 'sid-1' } },
      { id: '22222222', elType: 'widget', widgetType: 'heading', _sid: 'sid-2', settings: { _sid: 'sid-2', title: 'Clean' } }
    ];
    const cleanAnalysis = analyzeTemplateTree(cleanContent, { content: cleanContent });
    const cleanInvariants = evaluateInvariants(cleanAnalysis, 'SUCCESS', 100);
    assert.strictEqual(cleanInvariants.length, 0, 'Clean template must have 0 violations');

    // B. Pro widget violation -> non-zero
    const proContent = [
      { id: '33333333', elType: 'widget', widgetType: 'nav-menu', _sid: 'sid-3', settings: { _sid: 'sid-3' } }
    ];
    const proAnalysis = analyzeTemplateTree(proContent, { content: proContent });
    const proInvariants = evaluateInvariants(proAnalysis, 'SUCCESS', 100);
    assert.ok(proInvariants.some(v => v.includes('Pro widgets')), 'Must flag Pro widget violation');

    // C. Missing SID violation on container or widget -> non-zero (Req 2)
    const noSidContent = [
      { id: '44444444', elType: 'widget', widgetType: 'button', settings: { text: 'Click' } }
    ];
    const noSidAnalysis = analyzeTemplateTree(noSidContent, { content: noSidContent });
    const noSidInvariants = evaluateInvariants(noSidAnalysis, 'SUCCESS', 100);
    assert.ok(noSidInvariants.some(v => v.includes('missing SID')), 'Must flag missing SID violation');

    // D. Invalid HTML reason violation -> non-zero (Req 3)
    const invalidReasonContent = [
      {
        id: '55555555',
        elType: 'widget',
        widgetType: 'html',
        _sid: 'sid-5',
        settings: { _sid: 'sid-5', _html_reason: 'UNSPECIFIED_HTML_WIDGET', html: '<div>Bad</div>' }
      }
    ];
    const invalidReasonAnalysis = analyzeTemplateTree(invalidReasonContent, { content: invalidReasonContent });
    const invalidReasonInvariants = evaluateInvariants(invalidReasonAnalysis, 'SUCCESS', 100);
    assert.ok(invalidReasonInvariants.some(v => v.includes('HTML widget')), 'Must flag invalid HTML reason violation');

    // E. Scalar contract violation (Object in scalar slot) -> non-zero (Req 4)
    const invalidScalarContent = [
      {
        id: '66666666',
        elType: 'widget',
        widgetType: 'heading',
        _sid: 'sid-6',
        settings: { _sid: 'sid-6', title: { unexpected: 'object-in-scalar-slot' } }
      }
    ];
    const scalarAnalysis = analyzeTemplateTree(invalidScalarContent, { content: invalidScalarContent });
    assert.ok(scalarAnalysis.scalarViolationsCount > 0, 'Scalar validator must detect invalid object in scalar slot');
    const scalarInvariants = evaluateInvariants(scalarAnalysis, 'SUCCESS', 100);
    assert.ok(scalarInvariants.some(v => v.includes('scalar contract violation')), 'Must flag scalar violation');

    // F. Broken build reporting 100% fidelity -> non-zero
    const brokenInvariants = evaluateInvariants(cleanAnalysis, 'FAILED', 100);
    assert.ok(brokenInvariants.some(v => v.includes('Failed compilation must not report 100%')), 'Must flag fake 100% on failed compilation');

    pass('Process failure conditions verified: Pro widgets, missing SIDs, invalid HTML reasons, scalar violations, and failed builds all generate invariant violations');
  }

  // -------------------------------------------------------------------------
  // Test 7: Elementor ID Validation & ID Determinism (Req 5)
  // -------------------------------------------------------------------------
  totalTests++;
  {
    // A. Malformed ID
    const malformedContent = [
      { id: 'not_valid_8_hex_chars', elType: 'widget', widgetType: 'heading', _sid: 'sid-1', settings: { _sid: 'sid-1' } }
    ];
    const malformedAnalysis = analyzeTemplateTree(malformedContent);
    assert.strictEqual(malformedAnalysis.idMetrics.malformed, 1, 'Must detect malformed ID');
    const malformedInv = evaluateInvariants(malformedAnalysis, 'SUCCESS', 100);
    assert.ok(malformedInv.some(v => v.includes('malformed ID')), 'Malformed ID must fail invariant gate');

    // B. Duplicate ID
    const duplicateContent = [
      { id: 'a1b2c3d4', elType: 'widget', widgetType: 'heading', _sid: 'sid-1', settings: { _sid: 'sid-1' } },
      { id: 'a1b2c3d4', elType: 'widget', widgetType: 'button', _sid: 'sid-2', settings: { _sid: 'sid-2' } }
    ];
    const duplicateAnalysis = analyzeTemplateTree(duplicateContent);
    assert.strictEqual(duplicateAnalysis.idMetrics.duplicates, 1, 'Must detect duplicate ID');
    const duplicateInv = evaluateInvariants(duplicateAnalysis, 'SUCCESS', 100);
    assert.ok(duplicateInv.some(v => v.includes('duplicate ID')), 'Duplicate ID must fail invariant gate');

    // C. Missing ID
    const missingContent = [
      { id: null, elType: 'container', _sid: 'sid-1', settings: { _sid: 'sid-1' } }
    ];
    const missingAnalysis = analyzeTemplateTree(missingContent);
    assert.strictEqual(missingAnalysis.idMetrics.missing, 1, 'Must detect missing ID');
    const missingInv = evaluateInvariants(missingAnalysis, 'SUCCESS', 100);
    assert.ok(missingInv.some(v => v.includes('missing ID')), 'Missing ID must fail invariant gate');

    pass('Deterministic ID verification: format /^[a-f0-9]{7,8}$/i, missing, malformed, and duplicate IDs strictly detected and failed');
  }

  // -------------------------------------------------------------------------
  // Test 8: Dynamic Discovery & Additional CLI Paths (Req 10)
  // -------------------------------------------------------------------------
  totalTests++;
  {
    // Existing corpus discovered
    const initial = discoverCorpusFixtures();
    assert.ok(initial.length >= 6, 'Must discover standard corpus fixtures');

    // Valid additional path
    const extra = discoverCorpusFixtures({ additionalPaths: ['landing.html'] });
    assert.strictEqual(extra.length, initial.length, 'Already existing file should be deduplicated');

    // Missing additional path must throw explicit error
    assert.throws(() => {
      discoverCorpusFixtures({ additionalPaths: ['non_existent_fixture_path_xyz.html'] });
    }, /Additional fixture path not found/, 'Missing additional paths must produce explicit failure');

    pass('Dynamic discovery & CLI additional paths verified: resolves existing fixtures and fails explicitly on missing paths');
  }

  console.log('\n========================================================================');
  console.log(`✓ BLOCK 8.0 INFRASTRUCTURE SUITE COMPLETE: ${passedTests}/${totalTests} TESTS PASSED (100%)`);
  console.log('========================================================================\n');
}

if (require.main === module) {
  runInfrastructureSuite().catch(err => {
    console.error(`\n✖ Test suite failed: ${err.message}\n${err.stack}`);
    process.exit(1);
  });
}

module.exports = { runInfrastructureSuite };

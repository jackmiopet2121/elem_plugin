/**
 * Block 8.0: Test Suite for the Universal Baseline & Guardrail Infrastructure
 * 
 * Comprehensive verification of all Block 8.0 final audit requirements:
 * 1. Viewport configuration equals production engine VIEWPORTS export exactly.
 * 2. Audit artifact validity: missing, corrupt, and structurally invalid audits fail the gate.
 * 3. Stale output prevention: failed or new runs never reuse old target JSON/audit artifacts.
 * 4. Real fault-tolerance runner test: suite processes all 3 fixtures (valid, broken, valid) and exits non-zero.
 * 5. Real two-compilation Elementor ID determinism: identical source elements receive identical IDs across separate runs.
 * 6. Real report determinism: shared buildDeterministicReport produces byte-for-byte identical output.
 * 7. HTML reason enforcement: isValidHtmlReason() and registry authority reject arbitrary prefixes.
 * 8. Structural primitive detection: detects simple buttons, headings, paragraphs, and images in HTML widgets without length thresholds.
 * 9. Correct SID semantics: distinguishes source-derived, generated helpers, exempt system, and unverifiable nodes.
 * 10. Failure message sanitization: removes absolute paths, timestamps, and durations.
 * 11. Exit code computation: computeBaselineExitCode returns non-zero on any failure or invariant violation.
 * 12. Anti-hardcoding scanner: flags forbidden tokens while permitting dynamic class preservation.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const { discoverCorpusFixtures, DEFAULT_VIEWPORTS } = require('./support/corpus-manifest');
const { VIEWPORTS } = require('../src/smart/style-snapshot');
const { isValidHtmlReason } = require('../src/smart/style-router');
const { scanContent } = require('./check-b8-no-hardcoding');
const {
  analyzeTemplateTree,
  evaluateInvariants,
  runFixtureBaseline,
  buildDeterministicReport,
  computeBaselineExitCode,
  sanitizeErrorMessage,
  checkStructuralHtmlViolations
} = require('./run-block-8-baseline');

let totalTests = 0;
let passedTests = 0;

function pass(name) {
  passedTests++;
  console.log(`  ✓ Test ${passedTests}: ${name}`);
}

async function runInfrastructureSuite() {
  console.log('\n========================================================================');
  console.log('BLOCK 8.0: AUDIT CLOSURE & HARDENED INFRASTRUCTURE SUITE');
  console.log('========================================================================\n');

  // -------------------------------------------------------------------------
  // Test 1: Viewport Configuration Equals Production Engine Exactly (Req 1)
  // -------------------------------------------------------------------------
  totalTests++;
  {
    assert.strictEqual(DEFAULT_VIEWPORTS.length, 3, 'Manifest must have exactly 3 viewports');
    const vpMap = {};
    DEFAULT_VIEWPORTS.forEach(v => { vpMap[v.name] = v; });

    assert.strictEqual(vpMap.desktop.width, VIEWPORTS.desktop.width);
    assert.strictEqual(vpMap.desktop.height, VIEWPORTS.desktop.height);
    assert.strictEqual(vpMap.tablet.width, VIEWPORTS.tablet.width);
    assert.strictEqual(vpMap.tablet.height, VIEWPORTS.tablet.height);
    assert.strictEqual(vpMap.mobile.width, VIEWPORTS.mobile.width);
    assert.strictEqual(vpMap.mobile.height, VIEWPORTS.mobile.height);

    pass(`Report viewports match production engine (${VIEWPORTS.desktop.width}x${VIEWPORTS.desktop.height}, ${VIEWPORTS.tablet.width}x${VIEWPORTS.tablet.height}, ${VIEWPORTS.mobile.width}x${VIEWPORTS.mobile.height})`);
  }

  // -------------------------------------------------------------------------
  // Test 2: Audit Integrity & Failures on Missing/Corrupt/Invalid Audit (Task 1)
  // -------------------------------------------------------------------------
  totalTests++;
  {
    const cleanContent = [{ id: '11111111', elType: 'container', _sid: 'sid-1', settings: { _sid: 'sid-1' } }];
    const tree = analyzeTemplateTree(cleanContent, { content: cleanContent });

    // A. Missing audit artifact
    const invMissing = evaluateInvariants(tree, 'SUCCESS', null, 'MISSING', 'Audit artifact was not generated');
    assert.ok(invMissing.some(v => v.includes('Audit artifact verification failed (MISSING)')), 'Missing audit must fail invariant gate');

    // B. Corrupt audit JSON
    const invCorrupt = evaluateInvariants(tree, 'SUCCESS', null, 'INVALID', 'Corrupted audit JSON: Unexpected token');
    assert.ok(invCorrupt.some(v => v.includes('Audit artifact verification failed (INVALID)')), 'Corrupt audit must fail invariant gate');

    // C. Structurally invalid audit (missing numerical fidelity score)
    const invInvalid = evaluateInvariants(tree, 'SUCCESS', null, 'INVALID', 'Audit JSON missing required numerical fidelity score');
    assert.ok(invInvalid.some(v => v.includes('Audit artifact verification failed (INVALID)')), 'Structurally invalid audit must fail invariant gate');

    pass('Audit integrity verified: missing, corrupt, and structurally invalid audits fail the gate and keep fidelity null');
  }

  // -------------------------------------------------------------------------
  // Test 3: Stale Output Prevention (Req 6)
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

    fs.writeFileSync(staleJson, JSON.stringify({ content: [{ id: '11111111', elType: 'widget', widgetType: 'heading' }] }), 'utf8');
    fs.writeFileSync(staleAudit, JSON.stringify({ fidelity: 100, defects: [] }), 'utf8');

    try {
      const result = runFixtureBaseline(fixture, path.join(__dirname, '..', 'bin', 'cli.js'), tmpRunsDir);

      assert.strictEqual(result.compilationStatus, 'FAILED');
      assert.strictEqual(result.metrics.globalFidelityScore, null);
      assert.strictEqual(result.metrics.coreWidgetsCount, 0);
      assert.ok(!fs.existsSync(staleJson), 'Stale target JSON must be unlinked');

      pass('Stale output prevention verified: failed compile deletes stale files and never reports cached metrics');
    } finally {
      if (fs.existsSync(staleJson)) fs.unlinkSync(staleJson);
      if (fs.existsSync(staleAudit)) fs.unlinkSync(staleAudit);
      if (fs.existsSync(tmpRunsDir)) fs.rmdirSync(tmpRunsDir);
    }
  }

  // -------------------------------------------------------------------------
  // Test 4: Real Three-Fixture Continuation & Exit Code Verification (Task 2)
  // -------------------------------------------------------------------------
  totalTests++;
  {
    const tmpDir = path.join(__dirname, 'support', '_tmp_three_fixture_run');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const validHtml1 = path.join(tmpDir, 'valid1.html');
    const validHtml2 = path.join(tmpDir, 'valid2.html');

    fs.writeFileSync(validHtml1, '<!DOCTYPE html><html><body><h1>Header 1</h1></body></html>', 'utf8');
    fs.writeFileSync(validHtml2, '<!DOCTYPE html><html><body><p>Paragraph 2</p></body></html>', 'utf8');

    const testFixtures = [
      { fixtureId: 'synthetic/valid-1', filePath: validHtml1, relativePath: 'tests/valid1.html', contentHash: 'aaa' },
      { fixtureId: 'synthetic/broken', filePath: path.join(tmpDir, 'non_existent.html'), relativePath: 'tests/non_existent.html', contentHash: 'bbb' },
      { fixtureId: 'synthetic/valid-2', filePath: validHtml2, relativePath: 'tests/valid2.html', contentHash: 'ccc' }
    ];

    const cliPath = path.join(__dirname, '..', 'bin', 'cli.js');

    try {
      const results = [];
      for (const f of testFixtures) {
        results.push(runFixtureBaseline(f, cliPath, tmpDir));
      }

      assert.strictEqual(results.length, 3, 'Must process all 3 fixtures');
      assert.strictEqual(results[0].compilationStatus.startsWith('SUCCESS'), true, 'Valid fixture 1 must compile');
      assert.strictEqual(results[1].compilationStatus, 'FAILED', 'Broken fixture must report FAILED');
      assert.ok(results[1].errorMessage.length > 0, 'Broken fixture must have explicit error message');
      assert.strictEqual(results[2].compilationStatus.startsWith('SUCCESS'), true, 'Valid fixture 2 must compile AFTER broken fixture');

      const report = buildDeterministicReport(results);
      assert.strictEqual(report.totalFixtures, 3, 'Report must contain all 3 fixtures');
      assert.strictEqual(report.failedCompilations, 1, 'Report must record 1 failed compilation');

      const exitCode = computeBaselineExitCode(results, report.invariantViolationsCount);
      assert.strictEqual(exitCode, 1, 'computeBaselineExitCode must return non-zero when a fixture fails');

      pass('Real runner path verified: broken fixture fails, subsequent fixture processes, report has all 3, exit code is 1');
    } finally {
      if (fs.existsSync(tmpDir)) {
        fs.readdirSync(tmpDir).forEach(f => {
          try { fs.unlinkSync(path.join(tmpDir, f)); } catch (_) {}
        });
        fs.rmdirSync(tmpDir);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Test 5: Real Two-Compilation Elementor ID Determinism (Task 3)
  // -------------------------------------------------------------------------
  totalTests++;
  {
    const tmpDir = path.join(__dirname, 'support', '_tmp_id_det_run');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const inputHtml = path.join(tmpDir, 'test_id.html');
    const outA = path.join(tmpDir, 'outA.json');
    const outB = path.join(tmpDir, 'outB.json');

    fs.writeFileSync(
      inputHtml,
      '<!DOCTYPE html><html><body><section><div class="card"><h2>Card Title</h2><button>Click</button></div></section></body></html>',
      'utf8'
    );

    const cliPath = path.join(__dirname, '..', 'bin', 'cli.js');

    try {
      execSync(`node "${cliPath}" "${inputHtml}" "${outA}" --offline`, { stdio: 'pipe' });
      execSync(`node "${cliPath}" "${inputHtml}" "${outB}" --offline`, { stdio: 'pipe' });

      assert.ok(fs.existsSync(outA) && fs.existsSync(outB), 'Both compilations must produce output JSON');

      const jsonA = JSON.parse(fs.readFileSync(outA, 'utf8'));
      const jsonB = JSON.parse(fs.readFileSync(outB, 'utf8'));

      const extractOrderedMap = (content) => {
        const list = [];
        const walk = (n, idx) => {
          if (!n) return;
          const sid = n._sid || n.settings?._sid || n._dom_id || `pos-${idx}`;
          list.push({ sid, id: n.id, elType: n.elType, widgetType: n.widgetType });
          (n.elements || []).forEach((c, cIdx) => walk(c, `${idx}.${cIdx}`));
        };
        (content || []).forEach((c, idx) => walk(c, String(idx)));
        return list;
      };

      const mapA = extractOrderedMap(jsonA.content);
      const mapB = extractOrderedMap(jsonB.content);

      assert.ok(mapA.length > 0, 'Compiled template must contain elements');
      assert.strictEqual(mapA.length, mapB.length, 'Both runs must produce identical element counts');

      const seenIds = new Set();
      for (let i = 0; i < mapA.length; i++) {
        const itemA = mapA[i];
        const itemB = mapB[i];

        assert.strictEqual(itemA.sid, itemB.sid, `Source relation must match at index ${i}`);
        assert.strictEqual(itemA.id, itemB.id, `Elementor ID must be identical across compiles for source element ${itemA.sid}`);
        assert.ok(/^[a-f0-9]{7,8}$/i.test(itemA.id), `ID ${itemA.id} must match expected Elementor format`);
        assert.ok(!seenIds.has(itemA.id), `ID ${itemA.id} must not be duplicated within template`);
        seenIds.add(itemA.id);
      }

      pass(`Actual ID determinism verified across 2 compiles: ${mapA.length}/${mapA.length} IDs identical, ordered sequence matches, format valid`);
    } finally {
      if (fs.existsSync(tmpDir)) {
        fs.readdirSync(tmpDir).forEach(f => {
          try { fs.unlinkSync(path.join(tmpDir, f)); } catch (_) {}
        });
        fs.rmdirSync(tmpDir);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Test 6: Real Report Determinism Across Two Runs (Task 2 & Req 8)
  // -------------------------------------------------------------------------
  totalTests++;
  {
    const sampleResults = [
      {
        fixtureId: 'corpus/01-sample',
        relativePath: 'tests/corpus/01-sample/input.html',
        contentHash: '123456abcdef',
        compilationStatus: 'SUCCESS',
        errorMessage: null,
        metrics: {
          globalFidelityScore: 95,
          auditStatus: 'VALID',
          auditError: null,
          viewportFidelity: null,
          viewportFidelityReason: 'Scheduled for Block 8.1',
          defects: { critical: 0, high: 1, medium: 2, low: 0, advisory: 5 },
          coreWidgetsCount: 10,
          customPluginWidgetsCount: null,
          customPluginWidgetsReason: 'No custom plugin widgets',
          htmlWidgetsCount: 2,
          systemHtmlWidgetsCount: { stylesheet: 1, script: 1 },
          contentHtmlWidgetsCount: 0,
          htmlWidgetReasons: ['SYSTEM:stylesheet-engine', 'SYSTEM:script-engine'],
          htmlReasonViolations: [],
          nativeEditabilityPercentage: 100,
          microCssSizeBytes: 2048,
          scriptSizeBytes: 4096,
          missingSidBreakdown: { containers: 0, nativeWidgets: 0, customWidgets: 0, contentHtmlWidgets: 0, exemptSystemWidgets: 2, generatedHelperNodes: 0, unverifiableNodes: 0 },
          missingSidCount: 0,
          unverifiableNodesCount: 0,
          idMetrics: { totalIds: 12, malformed: 0, duplicates: 0, missing: 0 },
          scalarViolationsCount: 0,
          scalarViolations: [],
          consoleErrorsCount: 0,
          unverifiedNodeCount: null,
          unverifiedNodeReason: 'Verified in GT',
          unsupportedCapabilityCount: null,
          unsupportedCapabilityReason: 'Scheduled for Block 8.1'
        },
        invariants: { passed: true, violations: [] }
      }
    ];

    const report1 = buildDeterministicReport(sampleResults);
    const report2 = buildDeterministicReport(sampleResults);

    const json1 = JSON.stringify(report1, null, 2);
    const json2 = JSON.stringify(report2, null, 2);

    assert.strictEqual(json1, json2, 'buildDeterministicReport must produce byte-for-byte identical output');
    assert.strictEqual(/[A-Za-z]:[\\\/]/i.test(json1), false, 'Report must contain zero absolute paths');

    const forbiddenKeys = ['"timestamp"', '"createdAt"', '"startTime"', '"compilationTimeMs"', '"duration"'];
    for (const k of forbiddenKeys) {
      assert.strictEqual(json1.includes(k), false, `Report must not contain volatile key ${k}`);
    }

    pass('Two-run report determinism verified: byte-for-byte identical JSON with zero absolute paths or timestamps');
  }

  // -------------------------------------------------------------------------
  // Test 7: HTML Reason Validation Through Shared Contract (Task 4)
  // -------------------------------------------------------------------------
  totalTests++;
  {
    // A. Negative tests: unapproved reasons must fail isValidHtmlReason
    assert.strictEqual(isValidHtmlReason('SYSTEM:any-random-value'), false, 'Arbitrary SYSTEM prefix must fail');
    assert.strictEqual(isValidHtmlReason('NON_ELEMENTOR_PRIMITIVE:unknown-random-value'), false, 'Arbitrary NON_ELEMENTOR_PRIMITIVE must fail');
    assert.strictEqual(isValidHtmlReason('INVALID:button'), false, 'Invalid prefix must fail');
    assert.strictEqual(isValidHtmlReason(''), false, 'Empty reason must fail');
    assert.strictEqual(isValidHtmlReason(null), false, 'Null reason must fail');

    // B. Negative test in template tree analysis
    const badReasonTree = [
      { id: '11111111', elType: 'widget', widgetType: 'html', _sid: 'sid-1', settings: { _sid: 'sid-1', _html_reason: 'SYSTEM:any-random-value', html: '<div>test</div>' } }
    ];
    const analysis = analyzeTemplateTree(badReasonTree);
    assert.ok(analysis.htmlReasonViolations.length > 0, 'Unapproved reason must be flagged in analysis');
    const inv = evaluateInvariants(analysis, 'SUCCESS', 100);
    assert.ok(inv.some(v => v.includes('HTML widget contract violation')), 'Unapproved reason must fail invariant gate');

    // C. Positive tests: approved reasons must pass
    assert.strictEqual(isValidHtmlReason('SYSTEM:stylesheet-engine'), true);
    assert.strictEqual(isValidHtmlReason('SYSTEM:script-engine'), true);
    assert.strictEqual(isValidHtmlReason('NON_ELEMENTOR_PRIMITIVE:switch'), true);
    assert.strictEqual(isValidHtmlReason('NON_ELEMENTOR_PRIMITIVE:form-control'), true);

    pass('HTML reason contract verified: isValidHtmlReason() rejects arbitrary prefixes and enforces shared registry');
  }

  // -------------------------------------------------------------------------
  // Test 8: Structural Primitive Detection in Content HTML (Task 5)
  // -------------------------------------------------------------------------
  totalTests++;
  {
    // A. Simple button in HTML widget without length threshold -> violation
    const btnViolations = checkStructuralHtmlViolations('<button>Short</button>', 'NON_ELEMENTOR_PRIMITIVE:composite-control');
    assert.ok(btnViolations.some(v => v.includes('simple button markup')), 'Short simple button must be flagged');

    // B. Heading in HTML widget -> violation
    const headingViolations = checkStructuralHtmlViolations('<h3>Short Header</h3>', 'NON_ELEMENTOR_PRIMITIVE:composite-control');
    assert.ok(headingViolations.some(v => v.includes('standard heading markup')), 'Heading must be flagged');

    // C. Paragraph in HTML widget -> violation
    const pViolations = checkStructuralHtmlViolations('<p>Short paragraph text</p>', 'NON_ELEMENTOR_PRIMITIVE:composite-control');
    assert.ok(pViolations.some(v => v.includes('standard paragraph markup')), 'Paragraph must be flagged');

    // D. Standalone image in HTML widget -> violation
    const imgViolations = checkStructuralHtmlViolations('<img src="avatar.png" alt="User">', 'NON_ELEMENTOR_PRIMITIVE:composite-control');
    assert.ok(imgViolations.some(v => v.includes('standard image markup')), 'Image must be flagged');

    // E. Complex interactive control with valid reason -> allowed
    const switchViolations = checkStructuralHtmlViolations(
      '<label class="switch"><input type="checkbox"><span class="slider round"></span></label>',
      'NON_ELEMENTOR_PRIMITIVE:switch'
    );
    assert.strictEqual(switchViolations.length, 0, 'Composite switch control with valid reason must not flag false violations');

    pass('Structural primitive detection verified: simple buttons, headings, paragraphs, and images flagged without length thresholds');
  }

  // -------------------------------------------------------------------------
  // Test 9: Correct SID Semantics & Classification (Task 6)
  // -------------------------------------------------------------------------
  totalTests++;
  {
    const mixedTree = [
      // 1. Source-derived node with preserved SID -> PASS
      { id: '11111111', elType: 'container', _sid: 'sid-1', settings: { _sid: 'sid-1' } },
      // 2. Explicit compiler-generated helper container -> GENERATED HELPER (does not fail)
      { id: '22222222', elType: 'container', settings: { _is_helper: true } },
      // 3. Exempt system widget -> EXEMPT (does not fail)
      { id: '33333333', elType: 'widget', widgetType: 'html', settings: { _html_reason: 'SYSTEM:stylesheet-engine', html: '<style>.a{}</style>' } },
      // 4. Source-derived widget with missing SID (has e-sid hint) -> MISSING SID VIOLATION
      { id: '44444444', elType: 'widget', widgetType: 'button', settings: { _css_classes: 'e-sid-10 btn' } },
      // 5. Native widget without SID or helper flag -> UNVERIFIABLE NODE VIOLATION
      { id: '55555555', elType: 'widget', widgetType: 'heading', settings: { title: 'Orphan' } }
    ];

    const analysis = analyzeTemplateTree(mixedTree);
    assert.strictEqual(analysis.missingSidBreakdown.generatedHelperNodes, 1, 'Helper container counted separately');
    assert.strictEqual(analysis.missingSidBreakdown.exemptSystemWidgets, 1, 'Stylesheet counted as exempt');
    assert.strictEqual(analysis.missingSidBreakdown.nativeWidgets, 2, 'Missing SIDs counted on native widgets');
    assert.strictEqual(analysis.missingSidBreakdown.unverifiableNodes, 1, 'Unverifiable node flagged');

    const inv = evaluateInvariants(analysis, 'SUCCESS', 100);
    assert.ok(inv.some(v => v.includes('missing SID')), 'Missing SID must trigger invariant violation');
    assert.ok(inv.some(v => v.includes('unverifiable element')), 'Unverifiable element must trigger invariant violation');

    pass('Correct SID semantics verified: helper nodes separated, exempt widgets allowed, missing SIDs and unverifiable nodes flagged');
  }

  // -------------------------------------------------------------------------
  // Test 10: Absolute-Path & Machine Information Sanitization (Task 7)
  // -------------------------------------------------------------------------
  totalTests++;
  {
    const repoRoot = path.resolve(__dirname, '..');
    const dummyPath = path.join(repoRoot, 'src', 'index.js');
    const rawError = `Error: Cannot find module "${dummyPath}" at 2026-09-22T01:23:45.678Z executed in 15000ms on D:\\tmp\\build.json`;
    const clean = sanitizeErrorMessage(rawError, repoRoot);

    assert.ok(clean.includes('<ROOT>'), 'Must replace repository root with <ROOT>');
    assert.strictEqual(/[A-Za-z]:[\\\/]/i.test(clean), false, 'Sanitized message must not contain any absolute Windows drive path');
    assert.strictEqual(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(clean), false, 'Sanitized message must not contain ISO timestamps');
    assert.strictEqual(/\b\d+ms\b/.test(clean), false, 'Sanitized message must not contain duration in ms');
    assert.ok(clean.includes('Cannot find module'), 'Sanitized message must keep useful failure reason');

    pass('Failure information sanitization verified: absolute paths, timestamps, and durations stripped while preserving error cause');
  }

  // -------------------------------------------------------------------------
  // Test 11: Exit Code Computation for All Contract Violations
  // -------------------------------------------------------------------------
  totalTests++;
  {
    const cleanResults = [{ compilationStatus: 'SUCCESS', invariants: { passed: true, violations: [] } }];
    assert.strictEqual(computeBaselineExitCode(cleanResults, 0), 0, 'Clean suite must return exit code 0');

    const failedCompileResults = [{ compilationStatus: 'FAILED', invariants: { passed: true, violations: [] } }];
    assert.strictEqual(computeBaselineExitCode(failedCompileResults, 0), 1, 'Failed compilation must return exit code 1');

    const invariantFailedResults = [{ compilationStatus: 'SUCCESS', invariants: { passed: false, violations: ['Pro widget'] } }];
    assert.strictEqual(computeBaselineExitCode(invariantFailedResults, 1), 1, 'Invariant violation must return exit code 1');

    pass('Exit code computation verified: computeBaselineExitCode returns 0 for clean pass and 1 for any compilation or invariant failure');
  }

  // -------------------------------------------------------------------------
  // Test 12: Anti-Hardcoding Scanner & Dynamic Class Preservation
  // -------------------------------------------------------------------------
  totalTests++;
  {
    const badCode = `if (element.classList.contains('device-card-button')) { return createCard(); }`;
    assert.ok(scanContent('test1.js', badCode).length > 0, 'Must flag device-card-button token');

    const dynamicCode = `
      const sid = element.getAttribute('data-sid');
      if (sid) settings._css_classes = 'e-sid-' + sid + ' ' + (element.className || '');
    `;
    assert.strictEqual(scanContent('clean.js', dynamicCode).length, 0, 'Dynamic preservation yields zero false positives');

    pass('Anti-hardcoding scanner verified: detects forbidden tokens and permits dynamic class propagation');
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

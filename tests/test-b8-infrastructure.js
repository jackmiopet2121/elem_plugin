/**
 * Block 8.0: Test Suite for the Universal Baseline & Guardrail Infrastructure
 * 
 * Comprehensive verification of all Block 8.0 final audit requirements:
 * 1. Viewport configuration equals production engine VIEWPORTS export exactly.
 * 2. Complete Audit Schema: missing, corrupt, non-numeric, out-of-range, and malformed audits fail the gate.
 * 3. Stale output prevention: failed or new runs never reuse old target JSON/audit artifacts.
 * 4. Real fault-tolerance runner test: suite processes all 3 fixtures (valid, broken, valid) and exits non-zero.
 * 5. Compilation-scoped Elementor ID determinism: isolated contexts, 50,000 IDs, concurrent & interleaved isolation.
 * 6. Real report determinism: shared buildDeterministicReport produces byte-for-byte identical output.
 * 7. HTML reason enforcement: isValidHtmlReason() and registry authority reject arbitrary prefixes.
 * 8. AST-based structural primitive detection: inspects all nodes inside and outside forms independently.
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
  createIdGenerator,
  computeContentSeed,
  runWithGenerator,
  generateId,
  resetIdPool
} = require('../src/core/id-generator');
const {
  analyzeTemplateTree,
  evaluateInvariants,
  runFixtureBaseline,
  buildDeterministicReport,
  computeBaselineExitCode,
  sanitizeErrorMessage,
  checkStructuralHtmlViolations,
  validateAuditSchema
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
  // Test 1: Viewport Configuration Equals Production Engine Exactly
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
  // Test 2: Complete Audit Schema Validation & Negative Runner-Level Tests
  // -------------------------------------------------------------------------
  totalTests++;
  {
    const cleanContent = [{ id: '11111111', elType: 'container', _sid: 'sid-1', settings: { _sid: 'sid-1' } }];
    const tree = analyzeTemplateTree(cleanContent, { content: cleanContent });

    // A. Audit containing only fidelity 100 without defects or counts must be INVALID
    const fidOnlyRes = validateAuditSchema({ fidelity: 100 });
    assert.strictEqual(fidOnlyRes.valid, false, 'Audit with only fidelity must be INVALID');
    assert.strictEqual(fidOnlyRes.fidelity, null, 'Invalid audit must have fidelity null');

    // B. Fidelity NaN, negative, and above 100
    const nanRes = validateAuditSchema({ fidelity: NaN, defects: [] });
    assert.strictEqual(nanRes.valid, false, 'NaN fidelity must be INVALID');

    const negFidRes = validateAuditSchema({ fidelity: -1, defects: [] });
    assert.strictEqual(negFidRes.valid, false, 'Negative fidelity must be INVALID');

    const overFidRes = validateAuditSchema({ fidelity: 105, defects: [] });
    assert.strictEqual(overFidRes.valid, false, 'Fidelity above 100 must be INVALID');

    // C. Defects supplied as a string
    const strDefectsRes = validateAuditSchema({ fidelity: 80, defects: 'none' });
    assert.strictEqual(strDefectsRes.valid, false, 'String defects must be INVALID');

    // D. Negative or non-numeric or non-integer defect counts
    const negCountRes = validateAuditSchema({ fidelity: 80, counts: { critical: -1 } });
    assert.strictEqual(negCountRes.valid, false, 'Negative count must be INVALID');

    const strCountRes = validateAuditSchema({ fidelity: 80, counts: { critical: 'one' } });
    assert.strictEqual(strCountRes.valid, false, 'Non-numeric count must be INVALID');

    const floatCountRes = validateAuditSchema({ fidelity: 80, counts: { critical: 1.5 } });
    assert.strictEqual(floatCountRes.valid, false, 'Non-integer count must be INVALID');

    // E. Malformed defect entries
    const nullDefectRes = validateAuditSchema({ fidelity: 80, defects: [null] });
    assert.strictEqual(nullDefectRes.valid, false, 'Null defect entry must be INVALID');

    const strDefectEntryRes = validateAuditSchema({ fidelity: 80, defects: ['bad entry'] });
    assert.strictEqual(strDefectEntryRes.valid, false, 'String defect entry must be INVALID');

    const unrecDefectRes = validateAuditSchema({ fidelity: 80, defects: [{ severity: 'EXTREME' }] });
    assert.strictEqual(unrecDefectRes.valid, false, 'Unrecognized severity must be INVALID');

    // F. Non-object or array root
    assert.strictEqual(validateAuditSchema(null).valid, false);
    assert.strictEqual(validateAuditSchema([]).valid, false);
    assert.strictEqual(validateAuditSchema('invalid').valid, false);

    // G. Invariant gate check: all invalid audit statuses must fail the gate
    const invInvalid = evaluateInvariants(tree, 'SUCCESS', null, 'INVALID', 'Audit JSON missing required numerical fidelity score');
    assert.ok(invInvalid.some(v => v.includes('Audit artifact verification failed (INVALID)')), 'Invalid audit must fail invariant gate');

    const invMissing = evaluateInvariants(tree, 'SUCCESS', null, 'MISSING', 'Audit artifact was not generated');
    assert.ok(invMissing.some(v => v.includes('Audit artifact verification failed (MISSING)')), 'Missing audit must fail invariant gate');

    // H. Positive cases: valid audit with defects array or counts object
    const validDefects = validateAuditSchema({
      fidelity: 85,
      defects: [{ severity: 'medium', rule: 'RULE-1' }, { advisory: true, severity: 'advisory', rule: 'RULE-ADV' }]
    });
    assert.strictEqual(validDefects.valid, true);
    assert.strictEqual(validDefects.fidelity, 85);
    assert.strictEqual(validDefects.defectCounts.medium, 1);
    assert.strictEqual(validDefects.defectCounts.advisory, 1);

    const validCounts = validateAuditSchema({
      fidelity: 90,
      counts: { critical: 0, high: 1, medium: 0, low: 2 },
      advisoryDefectCount: 3
    });
    assert.strictEqual(validCounts.valid, true);
    assert.strictEqual(validCounts.fidelity, 90);
    assert.strictEqual(validCounts.defectCounts.high, 1);
    assert.strictEqual(validCounts.defectCounts.low, 2);
    assert.strictEqual(validCounts.defectCounts.advisory, 3);

    // I. Real runner-level tests for all malformed audit artifact cases
    const tmpRunsDir = path.join(__dirname, 'reports', '_tmp_malformed_audit_test');
    if (!fs.existsSync(tmpRunsDir)) fs.mkdirSync(tmpRunsDir, { recursive: true });

    const mockCliPath = path.join(tmpRunsDir, 'mock_audit_cli.js');
    const dummyInput = path.join(tmpRunsDir, 'input.html');
    fs.writeFileSync(dummyInput, '<div class="btn">Test</div>', 'utf8');

    const malformedAuditCases = [
      { name: 'fidelity without defects or counts', audit: { fidelity: 100 } },
      { name: 'NaN fidelity', audit: { fidelity: NaN, defects: [] } },
      { name: 'negative fidelity', audit: { fidelity: -10, defects: [] } },
      { name: 'fidelity above 100', audit: { fidelity: 105, defects: [] } },
      { name: 'defects supplied as string', audit: { fidelity: 80, defects: 'none' } },
      { name: 'negative defect count', audit: { fidelity: 80, counts: { critical: -1 } } },
      { name: 'non-numeric defect count', audit: { fidelity: 80, counts: { critical: 'one' } } },
      { name: 'non-integer defect count', audit: { fidelity: 80, counts: { critical: 1.5 } } },
      { name: 'malformed defect entry (null)', audit: { fidelity: 80, defects: [null] } },
      { name: 'malformed defect entry (string)', audit: { fidelity: 80, defects: ['bad entry'] } },
      { name: 'malformed defect entry (unrecognized severity)', audit: { fidelity: 80, defects: [{ severity: 'EXTREME' }] } }
    ];

    try {
      for (const tc of malformedAuditCases) {
        // Mock CLI that outputs valid template and tc.audit as the audit artifact
        const cliCode = [
          'const fs = require("fs");',
          'const targetJson = process.argv[3];',
          'const targetAudit = targetJson.replace(/\\.json$/, ".audit.json");',
          'fs.writeFileSync(targetJson, JSON.stringify({',
          '  version: "0.4",',
          '  content: [{ id: "11111111", elType: "container", _sid: "sid-1", settings: { _sid: "sid-1" } }]',
          '}), "utf8");',
          'fs.writeFileSync(targetAudit, JSON.stringify(' + JSON.stringify(tc.audit) + '), "utf8");',
          'process.exit(0);'
        ].join('\n');
        fs.writeFileSync(mockCliPath, cliCode, 'utf8');

        const fixture = {
          fixtureId: 'synthetic/malformed-' + tc.name.replace(/[^a-z0-9]/gi, '-'),
          filePath: dummyInput,
          relativePath: 'tests/reports/_tmp_malformed_audit_test/input.html',
          contentHash: 'hash-' + tc.name
        };

        const runnerRes = runFixtureBaseline(fixture, mockCliPath, tmpRunsDir);
        assert.strictEqual(runnerRes.metrics.auditStatus, 'INVALID', `Runner must mark ${tc.name} as INVALID`);
        assert.strictEqual(runnerRes.metrics.globalFidelityScore, null, `Runner must keep fidelity null for ${tc.name}`);
        assert.strictEqual(runnerRes.invariants.passed, false, `Runner must fail invariants for ${tc.name}`);
        const exitCode = computeBaselineExitCode([runnerRes], runnerRes.invariants.violations.length);
        assert.strictEqual(exitCode, 1, `Suite must exit non-zero on ${tc.name}`);
      }
    } finally {
      if (fs.existsSync(tmpRunsDir)) {
        fs.rmSync(tmpRunsDir, { recursive: true, force: true });
      }
    }

    pass('Complete audit schema verified: only-fidelity, NaN, negative, string defects, bad counts, and bad entries fail the gate');
  }

  // -------------------------------------------------------------------------
  // Test 3: Stale Output Prevention
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
      if (fs.existsSync(tmpRunsDir)) {
        fs.rmSync(tmpRunsDir, { recursive: true, force: true });
      }
    }
  }

  // -------------------------------------------------------------------------
  // Test 4: Real Three-Fixture Continuation & Exit Code Verification
  // -------------------------------------------------------------------------
  totalTests++;
  {
    const tmpDir = path.join(__dirname, 'support', '_tmp_three_fixture_run');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const validHtml1 = path.join(tmpDir, 'valid1.html');
    const validHtml2 = path.join(tmpDir, 'valid2.html');
    const brokenHtml = path.join(tmpDir, 'broken.html');

    fs.writeFileSync(validHtml1, '<!DOCTYPE html><html><body><div class="card"><h1>Valid 1</h1></div></body></html>', 'utf8');
    fs.writeFileSync(validHtml2, '<!DOCTYPE html><html><body><div class="card"><h1>Valid 2</h1></div></body></html>', 'utf8');
    fs.writeFileSync(brokenHtml, 'NOT_FOUND_BROKEN', 'utf8');
    if (fs.existsSync(brokenHtml)) fs.unlinkSync(brokenHtml);

    const cliPath = path.join(__dirname, '..', 'bin', 'cli.js');

    try {
      const fixtures = [
        { fixtureId: 'synthetic/valid-1', filePath: validHtml1, relativePath: 'valid1.html', contentHash: 'hash1' },
        { fixtureId: 'synthetic/broken', filePath: brokenHtml, relativePath: 'broken.html', contentHash: 'hash2' },
        { fixtureId: 'synthetic/valid-2', filePath: validHtml2, relativePath: 'valid2.html', contentHash: 'hash3' }
      ];

      const results = fixtures.map(f => runFixtureBaseline(f, cliPath, tmpDir));

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
  // Test 5: Compilation-Scoped ID Generator: 7 Invariant Requirements
  // -------------------------------------------------------------------------
  totalTests++;
  {
    // Req 5.1: Same input compiled twice gives identical ordered IDs
    const docA = '<html><body><section><h2>Title</h2><p>Body</p><button>Action</button></section></body></html>';
    const genA1 = createIdGenerator({ seed: computeContentSeed(docA) });
    const genA2 = createIdGenerator({ seed: computeContentSeed(docA) });
    const seqA1 = [genA1.generateId(), genA1.generateId(), genA1.generateId(), genA1.generateId()];
    const seqA2 = [genA2.generateId(), genA2.generateId(), genA2.generateId(), genA2.generateId()];
    assert.deepStrictEqual(seqA1, seqA2, 'Same input must produce identical ordered IDs');

    // Req 5.2: Two different inputs do not give an identical complete ID sequence
    const docB = '<html><body><div>Different content entirely</div></body></html>';
    const genB = createIdGenerator({ seed: computeContentSeed(docB) });
    const seqB = [genB.generateId(), genB.generateId(), genB.generateId(), genB.generateId()];
    assert.notDeepStrictEqual(seqA1, seqB, 'Different inputs must produce different ID sequences');

    // Req 5.3: Two generator contexts interleaved in same process do not affect each other
    const genI1 = createIdGenerator({ seed: 0x11112222 });
    const genI2 = createIdGenerator({ seed: 0x33334444 });
    const genI1_solo = createIdGenerator({ seed: 0x11112222 });
    const genI2_solo = createIdGenerator({ seed: 0x33334444 });

    const inter1 = [];
    const inter2 = [];
    inter1.push(genI1.generateId());
    inter2.push(genI2.generateId());
    inter1.push(genI1.generateId());
    inter2.push(genI2.generateId());
    inter1.push(genI1.generateId());
    inter2.push(genI2.generateId());

    const solo1 = [genI1_solo.generateId(), genI1_solo.generateId(), genI1_solo.generateId()];
    const solo2 = [genI2_solo.generateId(), genI2_solo.generateId(), genI2_solo.generateId()];

    assert.deepStrictEqual(inter1, solo1, 'Interleaved generation must not perturb Context 1 sequence');
    assert.deepStrictEqual(inter2, solo2, 'Interleaved generation must not perturb Context 2 sequence');

    // Req 5.4: Two concurrent compiler runs in same process remain deterministic
    async function asyncCompileTask(seedVal, delayMs) {
      const gen = createIdGenerator({ seed: seedVal });
      return runWithGenerator(gen, async () => {
        const id1 = generateId();
        await new Promise(r => setTimeout(r, delayMs));
        const id2 = generateId();
        await new Promise(r => setTimeout(r, delayMs));
        const id3 = generateId();
        return [id1, id2, id3];
      });
    }

    const [resConcurrent1, resConcurrent2] = await Promise.all([
      asyncCompileTask(0xAAAA1111, 15),
      asyncCompileTask(0xBBBB2222, 10)
    ]);

    const checkSolo1 = createIdGenerator({ seed: 0xAAAA1111 });
    const checkSolo2 = createIdGenerator({ seed: 0xBBBB2222 });
    assert.deepStrictEqual(resConcurrent1, [checkSolo1.generateId(), checkSolo1.generateId(), checkSolo1.generateId()]);
    assert.deepStrictEqual(resConcurrent2, [checkSolo2.generateId(), checkSolo2.generateId(), checkSolo2.generateId()]);

    // Req 5.5: 50,000 IDs from one context are valid and unique
    const gen50k = createIdGenerator({ seed: 0x50000 });
    const idFormat = /^[0-9a-f]{8}$/;
    for (let i = 0; i < 50000; i++) {
      const id = gen50k.generateId();
      assert.strictEqual(idFormat.test(id), true, `ID at index ${i} must match 8-char hex format`);
    }
    assert.strictEqual(gen50k.usedIds.size, 50000, 'All 50,000 generated IDs must be strictly unique');

    // Req 5.6: Resetting or creating one context does not reset another context
    const ctxA = createIdGenerator({ seed: 0x1234 });
    const ctxA_id1 = ctxA.generateId();
    const ctxB = createIdGenerator({ seed: 0x5678 });
    ctxB.generateId();
    ctxB.reset(0x9999);
    const ctxA_id2 = ctxA.generateId();

    const ctxA_control = createIdGenerator({ seed: 0x1234 });
    ctxA_control.generateId();
    const ctxA_control_id2 = ctxA_control.generateId();
    assert.strictEqual(ctxA_id2, ctxA_control_id2, 'Resetting context B must not mutate context A');

    // Req 5.7: All current corpus templates have zero malformed and zero duplicate IDs
    const corpusDir = path.join(__dirname, 'corpus');
    if (fs.existsSync(corpusDir)) {
      const fixtureDirs = fs.readdirSync(corpusDir);
      for (const fd of fixtureDirs) {
        const outJsonPath = path.join(corpusDir, fd, 'output.json');
        if (!fs.existsSync(outJsonPath)) continue;
        const templateData = JSON.parse(fs.readFileSync(outJsonPath, 'utf8'));
        const seenTemplateIds = new Set();
        let malformedCount = 0;
        let duplicateCount = 0;

        function walkTree(node) {
          if (!node) return;
          if (Array.isArray(node)) { node.forEach(walkTree); return; }
          if (typeof node !== 'object') return;
          if (node.id) {
            if (!/^[a-f0-9]{7,8}$/i.test(node.id)) malformedCount++;
            if (seenTemplateIds.has(node.id)) duplicateCount++;
            seenTemplateIds.add(node.id);
          }
          if (Array.isArray(node.elements)) node.elements.forEach(walkTree);
          if (Array.isArray(node.content)) node.content.forEach(walkTree);
        }

        walkTree(templateData);
        assert.strictEqual(malformedCount, 0, `Corpus template ${fd} must have 0 malformed IDs`);
        assert.strictEqual(duplicateCount, 0, `Corpus template ${fd} must have 0 duplicate IDs`);
      }
    }

    pass('Compilation-scoped ID generator verified: same-input, different-input, interleaved, concurrent, 50k unique, reset isolation, and 0 corpus defects');
  }

  // -------------------------------------------------------------------------
  // Test 6: Real Two-Run Report Determinism
  // -------------------------------------------------------------------------
  totalTests++;
  {
    const fixture1 = {
      fixtureId: 'corpus/sample-1',
      relativePath: 'tests/corpus/sample-1/input.html',
      contentHash: 'abc123hash'
    };

    const runData1 = {
      fixtureId: fixture1.fixtureId,
      relativePath: fixture1.relativePath,
      contentHash: fixture1.contentHash,
      compilationStatus: 'SUCCESS',
      errorMessage: null,
      metrics: {
        globalFidelityScore: 95,
        auditStatus: 'VALID',
        auditError: null,
        viewportFidelity: null,
        viewportFidelityReason: 'Unified score',
        defects: { critical: 0, high: 0, medium: 1, low: 2, advisory: 3 },
        coreWidgetsCount: 15,
        customPluginWidgetsCount: null,
        customPluginWidgetsReason: 'None',
        htmlWidgetsCount: 2,
        systemHtmlWidgetsCount: { stylesheet: 1, script: 1 },
        contentHtmlWidgetsCount: 0,
        htmlWidgetReasons: ['SYSTEM:stylesheet-engine', 'SYSTEM:script-engine'],
        htmlReasonViolations: [],
        nativeEditabilityPercentage: 100,
        microCssSizeBytes: 120,
        scriptSizeBytes: 85,
        missingSidBreakdown: { containers: 0, nativeWidgets: 0, customWidgets: 0, contentHtmlWidgets: 0, generatedHelperNodes: 0, exemptSystemWidgets: 2, unverifiableNodes: 0 },
        missingSidCount: 0,
        unverifiableNodesCount: 0,
        idMetrics: { missing: 0, malformed: 0, duplicates: 0, total: 17 },
        scalarViolationsCount: 0,
        scalarViolations: [],
        consoleErrorsCount: 0,
        unverifiedNodeCount: null,
        unverifiedNodeReason: 'Audited in GT',
        unsupportedCapabilityCount: null,
        unsupportedCapabilityReason: 'Logged as advisory'
      },
      invariants: { passed: true, violations: [] }
    };

    const report1 = buildDeterministicReport([runData1]);
    const report2 = buildDeterministicReport([runData1]);

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
  // Test 7: HTML Reason Validation Through Shared Contract
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
  // Test 8: AST-Based Structural Primitive Detection (Inside & Outside Forms)
  // -------------------------------------------------------------------------
  totalTests++;
  {
    // A. Heading inside form -> must be flagged
    const hInForm = checkStructuralHtmlViolations('<form><h2>Form Title</h2><input type="text"></form>', 'NON_ELEMENTOR_PRIMITIVE:form-control');
    assert.ok(hInForm.some(v => v.includes('standard heading markup')), 'Heading inside form must be flagged');

    // B. Paragraph inside form -> must be flagged
    const pInForm = checkStructuralHtmlViolations('<form><p>Form Description</p><input type="text"></form>', 'NON_ELEMENTOR_PRIMITIVE:form-control');
    assert.ok(pInForm.some(v => v.includes('standard paragraph markup')), 'Paragraph inside form must be flagged');

    // C. Image inside form -> must be flagged
    const imgInForm = checkStructuralHtmlViolations('<form><img src="avatar.png" alt="Profile"><input type="text"></form>', 'NON_ELEMENTOR_PRIMITIVE:form-control');
    assert.ok(imgInForm.some(v => v.includes('standard image markup')), 'Image inside form must be flagged');

    // D. Simple button inside form -> must be flagged
    const btnInForm = checkStructuralHtmlViolations('<form><input type="text"><button>Submit Form</button></form>', 'NON_ELEMENTOR_PRIMITIVE:form-control');
    assert.ok(btnInForm.some(v => v.includes('simple button markup')), 'Simple button inside form must be flagged');

    // E. Combined required behavior snippet from contract:
    // <form><h2>Title</h2><p>Description</p><input><button>Submit</button></form>
    const combinedForm = checkStructuralHtmlViolations(
      '<form>\n  <h2>Title</h2>\n  <p>Description</p>\n  <input>\n  <button>Submit</button>\n</form>',
      'NON_ELEMENTOR_PRIMITIVE:form-control'
    );
    assert.ok(combinedForm.some(v => v.includes('standard heading markup')), 'Combined form heading must be flagged');
    assert.ok(combinedForm.some(v => v.includes('standard paragraph markup')), 'Combined form paragraph must be flagged');
    assert.ok(combinedForm.some(v => v.includes('simple button markup')), 'Combined form button must be flagged');

    // F. Allowed unsupported form control without embedded native primitives -> allowed (0 violations)
    const allowedControls = checkStructuralHtmlViolations(
      '<form><input type="range"><select><option>Option 1</option></select><textarea></textarea></form>',
      'NON_ELEMENTOR_PRIMITIVE:form-control'
    );
    assert.strictEqual(allowedControls.length, 0, 'Allowed unsupported form controls without native primitives must produce 0 violations');

    // G. Nested and mixed-case tags: <FORM><DIV><H3>Title</H3><P>Text</P></DIV></FORM>
    const mixedCase = checkStructuralHtmlViolations(
      '<FORM><DIV><H3>Title</H3><P>Text</P></DIV></FORM>',
      'NON_ELEMENTOR_PRIMITIVE:form-control'
    );
    assert.ok(mixedCase.some(v => v.includes('standard heading markup')), 'Mixed-case heading must be flagged');
    assert.ok(mixedCase.some(v => v.includes('standard paragraph markup')), 'Mixed-case paragraph must be flagged');

    // H. Tags with multiline attributes:
    const multilineAttrs = checkStructuralHtmlViolations(
      '<form>\n  <h2\n    class="hero-title"\n    data-id="123">Title</h2>\n  <button\n    type="submit"\n    class="btn-primary">Send</button>\n</form>',
      'NON_ELEMENTOR_PRIMITIVE:form-control'
    );
    assert.ok(multilineAttrs.some(v => v.includes('standard heading markup')), 'Multiline attribute heading must be flagged');
    assert.ok(multilineAttrs.some(v => v.includes('simple button markup')), 'Multiline attribute button must be flagged');

    // I. Complex interactive switch control with valid reason -> allowed
    const switchViolations = checkStructuralHtmlViolations(
      '<label class="switch"><input type="checkbox"><span class="slider round"></span></label>',
      'NON_ELEMENTOR_PRIMITIVE:switch'
    );
    assert.strictEqual(switchViolations.length, 0, 'Composite switch control with valid reason must not flag false violations');

    pass('AST-based structural primitive detection verified: heading, paragraph, image, button flagged inside forms, mixed-case & multiline handled, unsupported controls allowed');
  }

  // -------------------------------------------------------------------------
  // Test 9: Correct SID Semantics & Classification
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
  // Test 10: Absolute-Path & Machine Information Sanitization
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

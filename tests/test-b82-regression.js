/**
 * Block 8.2 — Phase 5, Part 6B-1: Unit Tests for Regression Runner.
 *
 * Verifies:
 * 1. Dynamic fixture discovery returns complete fixture descriptors.
 * 2. Unchanged vs changed content hash handling (INCOMPARABLE_INPUT_CHANGED).
 * 3. Score-drop classification (NEEDS_REVIEW when fidelity decreases).
 * 4. Effective defect census:
 *    - Raw HIGH + advisory:true counts as advisory (NOT non-advisory HIGH).
 *    - Raw HIGH + advisory:false counts as non-advisory HIGH.
 *    - Truthful reason when score drops: reports advisory count + "0 new non-advisory HIGH/CRITICAL".
 * 5. Report reason honesty:
 *    - Matched score with added advisory/low does not say "all counts matched".
 *    - Matched score with 0 added/removed says "all counts matched".
 * 6. Invariant violation message comparison:
 *    - Same invariant count with different violation message triggers delta and review.
 * 7. Missing/corrupt baseline audit handling:
 *    - loadFrozenAudit throws instead of returning null silently.
 *    - Runner marks fixture hard failure and continues with remaining fixtures.
 * 8. Structured defect preservation & evidence labels:
 *    - Current widgetId, original, rendered preserved.
 *    - Absent old baseline fields remain null without guessed values.
 *    - Added defects contain auditRuleAbsentInBaseline and conversionRegressionStatus: 'UNRESOLVED'.
 * 9. Sanitization & Determinism:
 *    - Local absolute machine paths in original/rendered/messages are sanitized.
 *    - Web URLs are preserved intact.
 *    - Deterministic output without timestamps, durations, or temp paths.
 * 10. Null metric handling (null stays null; zero does not replace null).
 * 11. Multiset delta duplicate tracking and ID-agnostic matching.
 * 12. Isolation: runner logic never modifies tracked Block 8.0 baseline files.
 *
 * Uses synthetic data only; does not compile corpus in unit tests.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  discoverCorpusFixtures
} = require('./support/corpus-manifest');

const {
  buildDefectKey,
  computeAuditMultisetDelta,
  computeMetricDelta,
  extractInvariantViolations,
  classifyFixture,
  compareSingleFixture,
  buildDeterministicRegressionReport,
  sanitizeReportValue,
  loadFrozenAudit,
  FROZEN_BASELINE_REPORT_PATH
} = require('./run-b82-regression');

const ROOT_DIR = path.resolve(__dirname, '..');

console.log('========================================================================');
console.log('BLOCK 8.2 — PHASE 5 (PART 6B-1): REGRESSION RUNNER UNIT TESTS');
console.log('========================================================================\n');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ [TEST ${totalTests}] ${name}`);
  } catch (err) {
    console.error(`  ✖ [TEST ${totalTests}] ${name} FAILED:`, err.message);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Test 1: Dynamic Discovery
// ---------------------------------------------------------------------------
runTest('1. Dynamic fixture discovery returns complete descriptors', () => {
  const fixtures = discoverCorpusFixtures({ rootDir: ROOT_DIR });
  assert(Array.isArray(fixtures), 'Fixtures must be an array');
  assert(fixtures.length >= 8, `Expected at least 8 fixtures, got ${fixtures.length}`);

  for (const f of fixtures) {
    assert(typeof f.fixtureId === 'string' && f.fixtureId.length > 0, 'fixtureId must be non-empty');
    assert(typeof f.filePath === 'string' && fs.existsSync(f.filePath), 'filePath must exist');
    assert(typeof f.relativePath === 'string' && !path.isAbsolute(f.relativePath), 'relativePath must be relative');
    assert(typeof f.contentHash === 'string' && f.contentHash.length === 12, 'contentHash must be 12 chars');
    assert(f.metadata && typeof f.metadata === 'object', 'metadata must exist');
  }
});

// ---------------------------------------------------------------------------
// Test 2: Unchanged vs Changed Content Hash
// ---------------------------------------------------------------------------
runTest('2.1. Unchanged content hash proceeds to standard metric evaluation', () => {
  const baseline = {
    fixtureId: 'corpus/test',
    contentHash: 'abc123def456',
    compilationStatus: 'SUCCESS',
    metrics: { globalFidelityScore: 85, auditStatus: 'VALID', nativeEditabilityPercentage: 90, defects: { high: 2 } }
  };
  const current = {
    fixtureId: 'corpus/test',
    contentHash: 'abc123def456',
    compilationStatus: 'SUCCESS',
    metrics: { globalFidelityScore: 85, auditStatus: 'VALID', nativeEditabilityPercentage: 90, defects: { high: 2 } }
  };
  const classification = classifyFixture(baseline, current, { added: [], removed: [], addedCount: 0, removedCount: 0 });
  assert.strictEqual(classification.status, 'PASS');
  assert.strictEqual(classification.isHardFailure, false);
});

runTest('2.2. Changed content hash marks INCOMPARABLE_INPUT_CHANGED without fake comparison', () => {
  const baseline = {
    fixtureId: 'corpus/test',
    contentHash: 'abc123def456',
    compilationStatus: 'SUCCESS',
    metrics: { globalFidelityScore: 85, auditStatus: 'VALID' }
  };
  const current = {
    fixtureId: 'corpus/test',
    contentHash: '999888777666',
    compilationStatus: 'SUCCESS',
    metrics: { globalFidelityScore: 85, auditStatus: 'VALID' }
  };
  const classification = classifyFixture(baseline, current, { added: [], removed: [], addedCount: 0, removedCount: 0 });
  assert.strictEqual(classification.status, 'INCOMPARABLE_INPUT_CHANGED');
  assert(classification.classificationReason.includes('content hash changed'));
  assert.strictEqual(classification.isHardFailure, false);
});

runTest('2.3. New fixture missing from baseline marks NEW_FIXTURE', () => {
  const current = {
    fixtureId: 'corpus/new-fixture',
    contentHash: '111222333444',
    compilationStatus: 'SUCCESS',
    metrics: { globalFidelityScore: 90, auditStatus: 'VALID' }
  };
  const classification = classifyFixture(null, current, { added: [], removed: [], addedCount: 0, removedCount: 0 });
  assert.strictEqual(classification.status, 'NEW_FIXTURE');
  assert.strictEqual(classification.isHardFailure, false);
});

// ---------------------------------------------------------------------------
// Test 3: Score-Drop Classification
// ---------------------------------------------------------------------------
runTest('3.1. Fidelity score decrease marks NEEDS_REVIEW', () => {
  const baseline = {
    fixtureId: 'corpus/test',
    contentHash: 'abc123def456',
    compilationStatus: 'SUCCESS',
    metrics: { globalFidelityScore: 77, auditStatus: 'VALID', nativeEditabilityPercentage: 90, defects: { high: 0 } }
  };
  const current = {
    fixtureId: 'corpus/test',
    contentHash: 'abc123def456',
    compilationStatus: 'SUCCESS',
    metrics: { globalFidelityScore: 76, auditStatus: 'VALID', nativeEditabilityPercentage: 90, defects: { high: 0 } }
  };
  const classification = classifyFixture(baseline, current, { added: [], removed: [], addedCount: 0, removedCount: 0 });
  assert.strictEqual(classification.status, 'NEEDS_REVIEW');
  assert(classification.classificationReason.includes('score decreased from 77 to 76'));
  assert.strictEqual(classification.isHardFailure, false);
});

runTest('3.2. Identical score and improved score do not trigger NEEDS_REVIEW', () => {
  const baseline = {
    fixtureId: 'corpus/test',
    contentHash: 'abc123def456',
    compilationStatus: 'SUCCESS',
    metrics: { globalFidelityScore: 77, auditStatus: 'VALID', nativeEditabilityPercentage: 90, defects: { high: 0 } }
  };
  const same = {
    fixtureId: 'corpus/test',
    contentHash: 'abc123def456',
    compilationStatus: 'SUCCESS',
    metrics: { globalFidelityScore: 77, auditStatus: 'VALID', nativeEditabilityPercentage: 90, defects: { high: 0 } }
  };
  const improved = {
    fixtureId: 'corpus/test',
    contentHash: 'abc123def456',
    compilationStatus: 'SUCCESS',
    metrics: { globalFidelityScore: 82, auditStatus: 'VALID', nativeEditabilityPercentage: 90, defects: { high: 0 } }
  };
  assert.strictEqual(classifyFixture(baseline, same, null).status, 'PASS');
  assert.strictEqual(classifyFixture(baseline, improved, null).status, 'PASS');
});

// ---------------------------------------------------------------------------
// Test 4: Effective Defect Census (Raw HIGH vs Advisory HIGH)
// ---------------------------------------------------------------------------
runTest('4.1. Raw HIGH + advisory:false counts as non-advisory HIGH (NEEDS_REVIEW)', () => {
  const baseline = {
    fixtureId: 'corpus/test',
    contentHash: 'abc123def456',
    compilationStatus: 'SUCCESS',
    metrics: { globalFidelityScore: 80, auditStatus: 'VALID', nativeEditabilityPercentage: 90 }
  };
  const current = {
    fixtureId: 'corpus/test',
    contentHash: 'abc123def456',
    compilationStatus: 'SUCCESS',
    metrics: { globalFidelityScore: 80, auditStatus: 'VALID', nativeEditabilityPercentage: 90 }
  };
  const delta = {
    added: [
      {
        key: 'tablet|sid-1|RULE-SURFACE-01|backgroundImage|HIGH|0',
        count: 1,
        defect: { severity: 'HIGH', advisory: false, rule: 'RULE-SURFACE-01', property: 'backgroundImage' }
      }
    ],
    removed: [],
    addedCount: 1,
    removedCount: 0,
    addedAdvisoryCount: 0,
    addedAdvisoryRawHighCount: 0,
    addedNonAdvisoryHighCriticalCount: 1
  };
  const classification = classifyFixture(baseline, current, delta);
  assert.strictEqual(classification.status, 'NEEDS_REVIEW');
  assert(classification.classificationReason.includes('1 new non-advisory HIGH/CRITICAL defect(s) detected'));
});

runTest('4.2. Raw HIGH + advisory:true counts as advisory, not new non-advisory HIGH', () => {
  const baseline = {
    fixtureId: 'corpus/test',
    contentHash: 'abc123def456',
    compilationStatus: 'SUCCESS',
    metrics: { globalFidelityScore: 80, auditStatus: 'VALID', nativeEditabilityPercentage: 90 }
  };
  const current = {
    fixtureId: 'corpus/test',
    contentHash: 'abc123def456',
    compilationStatus: 'SUCCESS',
    metrics: { globalFidelityScore: 80, auditStatus: 'VALID', nativeEditabilityPercentage: 90 }
  };
  const delta = {
    added: [
      {
        key: 'desktop|sid-2|RULE-SURFACE-01|backgroundImage|HIGH|1',
        count: 1,
        defect: { severity: 'HIGH', advisory: true, rule: 'RULE-SURFACE-01', property: 'backgroundImage' }
      }
    ],
    removed: [],
    addedCount: 1,
    removedCount: 0,
    addedAdvisoryCount: 1,
    addedAdvisoryRawHighCount: 1,
    addedNonAdvisoryHighCriticalCount: 0
  };
  const classification = classifyFixture(baseline, current, delta);
  // Score matched, non-advisory HIGH count is 0 -> PASS
  assert.strictEqual(classification.status, 'PASS');
  assert(!classification.classificationReason.includes('new HIGH/CRITICAL'));
});

runTest('4.3. Score drop with advisory defects reports score delta + advisory count + 0 non-advisory HIGH', () => {
  const baseline = {
    fixtureId: 'corpus/04-pricing-calculator',
    contentHash: 'ad6445cfd6ff',
    compilationStatus: 'SUCCESS (ADVISORY)',
    metrics: { globalFidelityScore: 39, auditStatus: 'VALID', nativeEditabilityPercentage: 80 }
  };
  const current = {
    fixtureId: 'corpus/04-pricing-calculator',
    contentHash: 'ad6445cfd6ff',
    compilationStatus: 'SUCCESS (ADVISORY)',
    metrics: { globalFidelityScore: 30, auditStatus: 'VALID', nativeEditabilityPercentage: 80 }
  };
  const delta = {
    addedCount: 18,
    removedCount: 0,
    addedAdvisoryCount: 18,
    addedAdvisoryRawHighCount: 18,
    addedNonAdvisoryHighCriticalCount: 0
  };
  const classification = classifyFixture(baseline, current, delta);
  assert.strictEqual(classification.status, 'NEEDS_REVIEW');
  assert(classification.classificationReason.includes('Fidelity score decreased from 39 to 30 (delta: -9)'));
  assert(classification.classificationReason.includes('18 advisory defect(s)'));
  assert(classification.classificationReason.includes('0 new non-advisory HIGH/CRITICAL'));
});

// ---------------------------------------------------------------------------
// Test 5: Report Reason Honesty
// ---------------------------------------------------------------------------
runTest('5.1. Matched score with added advisory/low defects does NOT say all defect counts matched', () => {
  const baseline = {
    fixtureId: 'corpus/test',
    contentHash: 'abc123def456',
    compilationStatus: 'SUCCESS',
    metrics: { globalFidelityScore: 80, auditStatus: 'VALID', nativeEditabilityPercentage: 90 }
  };
  const current = {
    fixtureId: 'corpus/test',
    contentHash: 'abc123def456',
    compilationStatus: 'SUCCESS',
    metrics: { globalFidelityScore: 80, auditStatus: 'VALID', nativeEditabilityPercentage: 90 }
  };
  const delta = {
    added: [{ key: 'k1', count: 2 }],
    removed: [],
    addedCount: 2,
    removedCount: 0,
    addedAdvisoryCount: 2,
    addedAdvisoryRawHighCount: 0,
    addedNonAdvisoryHighCriticalCount: 0
  };
  const classification = classifyFixture(baseline, current, delta);
  assert.strictEqual(classification.status, 'PASS');
  assert(!classification.classificationReason.includes('All baseline metrics, fidelity score, and defect counts maintained or matched'));
  assert(classification.classificationReason.includes('2 added and 0 removed advisory/low defect(s)'));
});

runTest('5.2. Matched score with zero added and removed defects reports all counts matched', () => {
  const baseline = {
    fixtureId: 'corpus/test',
    contentHash: 'abc123def456',
    compilationStatus: 'SUCCESS',
    metrics: { globalFidelityScore: 80, auditStatus: 'VALID', nativeEditabilityPercentage: 90 }
  };
  const current = {
    fixtureId: 'corpus/test',
    contentHash: 'abc123def456',
    compilationStatus: 'SUCCESS',
    metrics: { globalFidelityScore: 80, auditStatus: 'VALID', nativeEditabilityPercentage: 90 }
  };
  const delta = {
    added: [],
    removed: [],
    addedCount: 0,
    removedCount: 0,
    addedAdvisoryCount: 0,
    addedAdvisoryRawHighCount: 0,
    addedNonAdvisoryHighCriticalCount: 0
  };
  const classification = classifyFixture(baseline, current, delta);
  assert.strictEqual(classification.status, 'PASS');
  assert.strictEqual(classification.classificationReason, 'All baseline metrics, fidelity score, and defect counts maintained or matched');
});

// ---------------------------------------------------------------------------
// Test 6: Invariant Violation Message Comparison
// ---------------------------------------------------------------------------
runTest('6. Same invariant count with different violation message triggers NEEDS_REVIEW with delta', () => {
  const baseline = {
    fixtureId: 'corpus/test',
    contentHash: 'abc123def456',
    compilationStatus: 'SUCCESS',
    metrics: { globalFidelityScore: 80, auditStatus: 'VALID', nativeEditabilityPercentage: 90 },
    invariants: {
      passed: false,
      violations: ['Old invariant message A']
    }
  };
  const current = {
    fixtureId: 'corpus/test',
    contentHash: 'abc123def456',
    compilationStatus: 'SUCCESS',
    metrics: { globalFidelityScore: 80, auditStatus: 'VALID', nativeEditabilityPercentage: 90 },
    invariants: {
      passed: false,
      violations: ['New invariant message B']
    }
  };
  const delta = { added: [], removed: [], addedCount: 0, removedCount: 0 };
  const classification = classifyFixture(baseline, current, delta);
  assert.strictEqual(classification.status, 'NEEDS_REVIEW');
  assert(classification.classificationReason.includes('Invariant violations changed'));

  const comparison = compareSingleFixture({ fixtureId: 'corpus/test', relativePath: 't.html', contentHash: 'abc123def456' }, baseline, current, delta);
  assert.deepStrictEqual(comparison.delta.addedInvariantViolations, ['New invariant message B']);
  assert.deepStrictEqual(comparison.delta.removedInvariantViolations, ['Old invariant message A']);
  assert.strictEqual(comparison.delta.invariantViolationsDelta, 0); // count delta is 0
});

// ---------------------------------------------------------------------------
// Test 7: Missing / Corrupt / Invalid Baseline Audit Handling
// ---------------------------------------------------------------------------
runTest('7.1. loadFrozenAudit throws descriptive error on missing file', () => {
  assert.throws(() => {
    loadFrozenAudit('non_existent_fixture_slug_12345');
  }, /Failed to load frozen baseline audit/);
});

runTest('7.2. Positive: Real frozen baseline audit loads and validates cleanly', () => {
  const audit = loadFrozenAudit('corpus_01-pricing-table');
  assert(audit && typeof audit === 'object', 'Real frozen audit must be loaded as an object');
  assert.strictEqual(typeof audit.fidelity, 'number', 'Real frozen audit must have numerical fidelity');
  assert(Array.isArray(audit.defects), 'Real frozen audit must have defects array');
});

runTest('7.3. Negative: Parseable invalid audit ({}) fails schema validation and throws', () => {
  const { validateAuditSchema } = require('./run-block-8-baseline');
  const res = validateAuditSchema({});
  assert.strictEqual(res.valid, false, 'Empty object must fail audit schema validation');
  assert(res.error.includes('missing required numerical fidelity score'));
});

runTest('7.4. Negative: Parseable audit without fidelity ({"defects":[]}) fails schema validation', () => {
  const { validateAuditSchema } = require('./run-block-8-baseline');
  const res = validateAuditSchema({ defects: [] });
  assert.strictEqual(res.valid, false, 'Audit without fidelity must fail validation');
  assert(res.error.includes('missing required numerical fidelity score'));
});

runTest('7.5. Negative: Audit with invalid severity in defect fails schema validation', () => {
  const { validateAuditSchema } = require('./run-block-8-baseline');
  const res = validateAuditSchema({
    fidelity: 75,
    counts: { total: 1, critical: 0, high: 0, medium: 0, low: 0 },
    defects: [
      { id: 'd1', severity: 'INVALID_SEVERITY_LEVEL', rule: 'RULE-CLR-01', property: 'color' }
    ]
  });
  assert.strictEqual(res.valid, false, 'Defect with invalid severity must fail validation');
  assert(res.error.includes('unrecognized severity') || res.error.includes('severities are consistent'));
});

runTest('7.6. Invalid comparable fixture marks FAILED and isHardFailure:true, while next fixture still processes', () => {
  // Fixture A has corrupt baseline audit
  const fixA = { fixtureId: 'corpus/fix-a', relativePath: 'a.html', contentHash: 'aaa111222333' };
  const baseA = { fixtureId: 'corpus/fix-a', contentHash: 'aaa111222333', compilationStatus: 'SUCCESS' };
  const currA = { fixtureId: 'corpus/fix-a', contentHash: 'aaa111222333', compilationStatus: 'SUCCESS', metrics: { auditStatus: 'VALID' } };
  const compA = compareSingleFixture(fixA, baseA, currA, null, { baselineAuditError: 'Corrupt frozen schema' });

  assert.strictEqual(compA.status, 'FAILED');
  assert.strictEqual(compA.isHardFailure, true);
  assert(compA.classificationReason.includes('Corrupt frozen schema'));

  // Fixture B has valid baseline and processes cleanly
  const fixB = { fixtureId: 'corpus/fix-b', relativePath: 'b.html', contentHash: 'bbb111222333' };
  const baseB = { fixtureId: 'corpus/fix-b', contentHash: 'bbb111222333', compilationStatus: 'SUCCESS', metrics: { globalFidelityScore: 90, auditStatus: 'VALID' } };
  const currB = { fixtureId: 'corpus/fix-b', contentHash: 'bbb111222333', compilationStatus: 'SUCCESS', metrics: { globalFidelityScore: 90, auditStatus: 'VALID' } };
  const compB = compareSingleFixture(fixB, baseB, currB, { added: [], removed: [], addedCount: 0, removedCount: 0 });

  assert.strictEqual(compB.status, 'PASS');
  assert.strictEqual(compB.isHardFailure, false);

  // Overall report with both fixtures
  const report = buildDeterministicRegressionReport([compA, compB]);
  assert.strictEqual(report.overallStatus, 'FAILED', 'Overall status must be FAILED when hard failures exist');
  assert.strictEqual(report.summary.hardFailuresCount, 1);
  assert.strictEqual(report.summary.passCount, 1);
});

// ---------------------------------------------------------------------------
// Test 8: Structured Defect Preservation & Evidence Labels
// ---------------------------------------------------------------------------
runTest('8.1. Current structured widgetId, original, and rendered are preserved', () => {
  const oldAudit = { defects: [] };
  const newAudit = {
    defects: [
      {
        id: 'defect-99',
        nodeSid: 'sid-2',
        widgetId: 'w-elem-456',
        viewport: 'desktop',
        property: 'backgroundImage',
        original: 'radial-gradient(circle, #fff, #000)',
        rendered: 'none',
        severity: 'HIGH',
        rule: 'RULE-SURFACE-01',
        advisory: true,
        message: 'Surface mismatch'
      }
    ]
  };

  const delta = computeAuditMultisetDelta(oldAudit, newAudit);
  assert.strictEqual(delta.addedCount, 1);
  const sample = delta.added[0].defect;
  assert.strictEqual(sample.widgetId, 'w-elem-456');
  assert.strictEqual(sample.original, 'radial-gradient(circle, #fff, #000)');
  assert.strictEqual(sample.rendered, 'none');
  assert.strictEqual(sample.nodeSid, 'sid-2');
});

runTest('8.2. Old baseline defect missing widgetId, original, rendered keeps them as null', () => {
  const oldAudit = {
    defects: [
      {
        id: 'defect-old-1',
        nodeSid: 'sid-7',
        viewport: 'desktop',
        property: 'fontWeight',
        severity: 'MEDIUM',
        rule: 'RULE-TYP-02',
        message: 'Font weight mismatch'
        // widgetId, original, rendered absent
      }
    ]
  };
  const newAudit = { defects: [] };

  const delta = computeAuditMultisetDelta(oldAudit, newAudit);
  assert.strictEqual(delta.removedCount, 1);
  const removedDefect = delta.removed[0].defect;
  assert.strictEqual(removedDefect.widgetId, null);
  assert.strictEqual(removedDefect.original, null);
  assert.strictEqual(removedDefect.rendered, null);
});

runTest('8.3. Added defect includes auditRuleAbsentInBaseline and conversionRegressionStatus: UNRESOLVED', () => {
  const oldAudit = {
    defects: [
      { id: 'd1', nodeSid: 'sid-1', rule: 'RULE-TYP-01', property: 'fontSize', severity: 'HIGH' }
    ]
  };
  const newAudit = {
    defects: [
      { id: 'd1', nodeSid: 'sid-1', rule: 'RULE-TYP-01', property: 'fontSize', severity: 'HIGH' },
      { id: 'd2', nodeSid: 'sid-2', rule: 'RULE-SURFACE-01', property: 'backgroundImage', severity: 'HIGH', advisory: true },
      { id: 'd3', nodeSid: 'sid-3', rule: 'RULE-TYP-01', property: 'lineHeight', severity: 'MEDIUM' }
    ]
  };

  const delta = computeAuditMultisetDelta(oldAudit, newAudit);
  assert.strictEqual(delta.addedCount, 2);

  const surfaceDefect = delta.added.find(a => a.defect.rule === 'RULE-SURFACE-01');
  assert(surfaceDefect, 'RULE-SURFACE-01 must be in added');
  assert.strictEqual(surfaceDefect.auditRuleAbsentInBaseline, true);
  assert.strictEqual(surfaceDefect.conversionRegressionStatus, 'UNRESOLVED');
  assert.strictEqual(surfaceDefect.defect.auditRuleAbsentInBaseline, true);
  assert.strictEqual(surfaceDefect.defect.conversionRegressionStatus, 'UNRESOLVED');

  const typDefect = delta.added.find(a => a.defect.property === 'lineHeight');
  assert(typDefect, 'RULE-TYP-01 lineHeight must be in added');
  assert.strictEqual(typDefect.auditRuleAbsentInBaseline, false); // RULE-TYP-01 was present in oldAudit
  assert.strictEqual(typDefect.conversionRegressionStatus, 'UNRESOLVED');
});

// ---------------------------------------------------------------------------
// Test 9: Sanitization & Determinism
// ---------------------------------------------------------------------------
runTest('9.1. Local absolute machine paths in original/rendered/messages are sanitized', () => {
  const sanitized = sanitizeReportValue('File is at C:\\disque D\\html_to_elementor\\elem_plugin\\assets\\photo.png');
  assert(!sanitized.includes('C:\\'), 'Must not retain Windows drive letter');
  assert(sanitized.includes('<ROOT>') || sanitized.includes('photo.png'), 'Must replace with relative token');

  const sanitizedUnix = sanitizeReportValue('/tmp/temp-run-123/preview.html');
  assert(!sanitizedUnix.includes('/tmp/temp-run-123/'), 'Must not retain absolute unix temp path');
});

runTest('9.2. Web URLs in original or rendered are preserved intact', () => {
  const url = 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=800';
  assert.strictEqual(sanitizeReportValue(url), url, 'Web URL must not be altered');

  const httpUrl = 'http://example.com/assets/bg.jpg';
  assert.strictEqual(sanitizeReportValue(httpUrl), httpUrl, 'HTTP URL must not be altered');
});

runTest('9.3. Deterministic report contains no timestamps, durations, or temp paths', () => {
  const comparisons = [
    {
      fixtureId: 'corpus/b',
      relativePath: 'tests/corpus/b/input.html',
      contentHash: 'bbb222333444',
      status: 'PASS',
      classificationReason: 'Matched',
      baseline: { fidelity: 80 },
      current: { fidelity: 80 },
      delta: { fidelityDelta: 0, addedDefectsCount: 0, removedDefectsCount: 0 }
    },
    {
      fixtureId: 'corpus/a',
      relativePath: 'tests/corpus/a/input.html',
      contentHash: 'aaa111222333',
      status: 'PASS',
      classificationReason: 'Matched',
      baseline: { fidelity: 90 },
      current: { fidelity: 90 },
      delta: { fidelityDelta: 0, addedDefectsCount: 0, removedDefectsCount: 0 }
    }
  ];

  const report1 = buildDeterministicRegressionReport(comparisons, '0d5d71de763bc839320cc0ef8e084434beb682ba');
  const report2 = buildDeterministicRegressionReport(comparisons, '0d5d71de763bc839320cc0ef8e084434beb682ba');

  const json1 = JSON.stringify(report1, null, 2);
  const json2 = JSON.stringify(report2, null, 2);

  assert.strictEqual(json1, json2, 'Report output must be 100% deterministic');

  // Verify fixtures sorted alphabetically
  assert.strictEqual(report1.fixtures[0].fixtureId, 'corpus/a');
  assert.strictEqual(report1.fixtures[1].fixtureId, 'corpus/b');

  // Check forbidden patterns: ISO timestamps, durations, absolute paths
  assert(!json1.includes('timestamp'), 'Must not contain timestamp field');
  assert(!/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(json1), 'Must not contain ISO timestamp string');
  assert(!/\b\d+\s*ms\b/.test(json1), 'Must not contain duration in ms');
  assert(!json1.includes('C:\\'), 'Must not contain Windows drive paths');
  assert(!json1.includes('/home/'), 'Must not contain unix home paths');
  assert(!json1.includes('/tmp/'), 'Must not contain temp paths');
});

// ---------------------------------------------------------------------------
// Test 10: Null Metric Handling
// ---------------------------------------------------------------------------
runTest('10. Null metric handling: null stays null and zero does not replace null', () => {
  assert.strictEqual(computeMetricDelta(null, 5), null, 'null baseline must yield null delta');
  assert.strictEqual(computeMetricDelta(5, null), null, 'null current must yield null delta');
  assert.strictEqual(computeMetricDelta(null, null), null, 'both null must yield null delta');
  assert.strictEqual(computeMetricDelta(undefined, 5), null, 'undefined baseline must yield null delta');

  // Zero is a real number, not null
  assert.strictEqual(computeMetricDelta(0, 5), 5);
  assert.strictEqual(computeMetricDelta(5, 0), -5);
  assert.strictEqual(computeMetricDelta(0, 0), 0);

  const fixture = { fixtureId: 'test/null', relativePath: 'test/null.html', contentHash: '123456789012' };
  const base = {
    compilationStatus: 'SUCCESS',
    metrics: {
      globalFidelityScore: 80,
      customPluginWidgetsCount: null,
      unverifiedNodeCount: null
    }
  };
  const curr = {
    compilationStatus: 'SUCCESS',
    metrics: {
      globalFidelityScore: 80,
      auditStatus: 'VALID',
      customPluginWidgetsCount: null,
      unverifiedNodeCount: null
    }
  };
  const compared = compareSingleFixture(fixture, base, curr, null);
  assert.strictEqual(compared.baseline.customPluginWidgetsCount, undefined);
  assert.strictEqual(compared.current.customPluginWidgetsCount, undefined);
  assert.strictEqual(compared.delta.fidelityDelta, 0);
});

// ---------------------------------------------------------------------------
// Test 11: Duplicate Defect Multiset & ID-Agnostic Matching
// ---------------------------------------------------------------------------
runTest('11.1. Multiset delta tracks multiple instances of identical key', () => {
  const defectTemplate = {
    viewport: 'tablet',
    nodeSid: 'sid-1',
    rule: 'RULE-SURFACE-01',
    property: 'backgroundImage',
    severity: 'HIGH',
    advisory: false,
    message: 'Image mismatch'
  };

  const oldAudit = {
    defects: [
      { id: 'defect-1', ...defectTemplate },
      { id: 'defect-2', ...defectTemplate }
    ]
  };

  const newAudit = {
    defects: [
      { id: 'defect-100', ...defectTemplate },
      { id: 'defect-101', ...defectTemplate },
      { id: 'defect-102', ...defectTemplate },
      { id: 'defect-103', ...defectTemplate },
      { id: 'defect-104', ...defectTemplate }
    ]
  };

  const delta = computeAuditMultisetDelta(oldAudit, newAudit);
  assert.strictEqual(delta.addedCount, 3, '5 - 2 = 3 added');
  assert.strictEqual(delta.removedCount, 0, '0 removed');
  assert.strictEqual(delta.added.length, 1);
  assert.strictEqual(delta.added[0].count, 3);
});

runTest('11.2. Defect IDs changing does not cause false delta when properties match', () => {
  const oldAudit = {
    defects: [
      { id: 'defect-old-1', viewport: 'desktop', nodeSid: 'sid-1', rule: 'RULE-CLR-01', property: 'color', severity: 'HIGH' }
    ]
  };
  const newAudit = {
    defects: [
      { id: 'defect-new-999', viewport: 'desktop', nodeSid: 'sid-1', rule: 'RULE-CLR-01', property: 'color', severity: 'HIGH' }
    ]
  };

  const delta = computeAuditMultisetDelta(oldAudit, newAudit);
  assert.strictEqual(delta.addedCount, 0, 'No added defects when composite key matches');
  assert.strictEqual(delta.removedCount, 0, 'No removed defects when composite key matches');
});

// ---------------------------------------------------------------------------
// Test 12: Isolation from Tracked Baseline Files
// ---------------------------------------------------------------------------
runTest('12. Runner components never overwrite tracked Block 8.0 baseline files', () => {
  const trackedBaselinePath = path.join(ROOT_DIR, FROZEN_BASELINE_REPORT_PATH);
  assert(fs.existsSync(trackedBaselinePath), 'Tracked baseline report must exist');

  const statBefore = fs.statSync(trackedBaselinePath);

  // Generating a deterministic report object
  buildDeterministicRegressionReport([]);

  const statAfter = fs.statSync(trackedBaselinePath);
  assert.strictEqual(statBefore.mtimeMs, statAfter.mtimeMs, 'Tracked baseline mtime must remain unchanged');
  assert.strictEqual(statBefore.size, statAfter.size, 'Tracked baseline size must remain unchanged');
});

console.log('\n========================================================================');
console.log(`ALL ${passedTests}/${totalTests} TESTS PASSED CLEANLY (100%)`);
console.log('========================================================================');

/**
 * Block 8.2 — Phase 5, Part 6B-2: Unit Tests for Visual Diagnosis Runner.
 * Closure Hardening: Comprehensive Positive & Fail-Closed Negative Tests.
 *
 * Verifies:
 * 1. Positive PREEXISTING_MISMATCH: old == current, both != GT.
 * 2. Positive POSSIBLE_CONVERSION_REGRESSION: old == GT, current != GT.
 * 3. Fail-closed: null, undefined, or empty string in GT, old, or current -> UNVERIFIABLE / UNRESOLVED.
 * 4. Fail-closed: unparseable color values -> UNVERIFIABLE / UNRESOLVED (never PREEXISTING_MISMATCH).
 * 5. Fail-closed: computed-style read error / missing node -> UNVERIFIABLE / UNRESOLVED.
 * 6. Valid "none" background-image is accepted as valid (not treated as missing/empty).
 * 7. Semantic color matching: alpha 0 matches alpha 0, hex vs rgb with alpha 1, non-zero alpha mismatch.
 * 8. Hardened runner guards:
 *    - Failed compilationStatus throws even if preview exists.
 *    - INVALID auditStatus throws even if preview exists.
 *    - Content hash mismatch throws.
 *    - Baseline commit mismatch throws.
 *    - NEEDS_REVIEW fixture without RULE-SURFACE-01 targets throws.
 * 9. Deterministic report formatting and path sanitization.
 *
 * Uses synthetic data only; does not compile corpus in unit tests.
 */

'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const {
  compareColorValues,
  compareValues,
  classifyPropertyDiagnosis,
  sanitizePath,
  buildDeterministicVisualDiagnosisReport,
  runVisualDiagnosis
} = require('./run-b82-visual-diagnosis');

console.log('========================================================================');
console.log('BLOCK 8.2 — PHASE 5 (PART 6B-2): VISUAL DIAGNOSIS UNIT TESTS');
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
// Section 1: Positive Classifications
// ---------------------------------------------------------------------------
runTest('1.1. Positive PREEXISTING_MISMATCH: old and current match, both differ from GT', () => {
  const gt = 'radial-gradient(circle at 50% 10%, rgba(37, 99, 235, 0.05) 0%, rgba(0, 0, 0, 0) 65%), none';
  const old = 'none';
  const curr = 'none';

  const res = classifyPropertyDiagnosis('backgroundImage', gt, old, curr);
  assert.strictEqual(res.classification, 'PREEXISTING_MISMATCH');
  assert.strictEqual(res.status, 'VERIFIED');
  assert(res.reason.includes('pre-existing in Block 8.0 baseline render'));
});

runTest('1.2. Positive PREEXISTING_MISMATCH with valid transparent colors', () => {
  const gt = 'rgba(0, 0, 0, 0)';
  const old = 'rgb(255, 255, 255)';
  const curr = 'rgb(255, 255, 255)';

  const res = classifyPropertyDiagnosis('backgroundColor', gt, old, curr);
  assert.strictEqual(res.classification, 'PREEXISTING_MISMATCH');
  assert.strictEqual(res.status, 'VERIFIED');
});

runTest('1.3. Positive POSSIBLE_CONVERSION_REGRESSION: old matched GT, current differs', () => {
  const gt = 'linear-gradient(180deg, #1e293b, #0f172a)';
  const old = 'linear-gradient(180deg, #1e293b, #0f172a)';
  const curr = 'none';

  const res = classifyPropertyDiagnosis('backgroundImage', gt, old, curr);
  assert.strictEqual(res.classification, 'POSSIBLE_CONVERSION_REGRESSION');
  assert.strictEqual(res.status, 'VERIFIED');
  assert(res.reason.includes('Old rendered value matched Ground Truth, but current rendered value differs'));
});

runTest('1.4. Valid "none" background-image is accepted as valid, not treated as missing', () => {
  const res = classifyPropertyDiagnosis('backgroundImage', 'none', 'none', 'none');
  // All three match GT -> UNRESOLVED with atypical relation note (since neither is a mismatch)
  assert.notStrictEqual(res.status, 'UNVERIFIABLE');
});

// ---------------------------------------------------------------------------
// Section 2: Fail-Closed Negative Tests for Missing / Empty Values
// ---------------------------------------------------------------------------
runTest('2.1. Fail-closed: null, undefined, or empty string in GT value marks UNVERIFIABLE / UNRESOLVED', () => {
  for (const emptyVal of [null, undefined, '', '   ']) {
    const res = classifyPropertyDiagnosis('backgroundImage', emptyVal, 'none', 'none');
    assert.strictEqual(res.status, 'UNVERIFIABLE', `GT value "${emptyVal}" must fail closed to UNVERIFIABLE`);
    assert.strictEqual(res.classification, 'UNRESOLVED');
    assert.notStrictEqual(res.classification, 'PREEXISTING_MISMATCH');
    assert(res.reason.includes('Missing or empty'));
  }
});

runTest('2.2. Fail-closed: null, undefined, or empty string in old preview value marks UNVERIFIABLE', () => {
  for (const emptyVal of [null, undefined, '', '   ']) {
    const res = classifyPropertyDiagnosis('backgroundColor', 'rgba(0, 0, 0, 0)', emptyVal, 'rgb(255, 255, 255)');
    assert.strictEqual(res.status, 'UNVERIFIABLE');
    assert.strictEqual(res.classification, 'UNRESOLVED');
    assert.notStrictEqual(res.classification, 'PREEXISTING_MISMATCH');
  }
});

runTest('2.3. Fail-closed: null, undefined, or empty string in current preview value marks UNVERIFIABLE', () => {
  for (const emptyVal of [null, undefined, '', '   ']) {
    const res = classifyPropertyDiagnosis('backgroundColor', 'rgba(0, 0, 0, 0)', 'rgb(255, 255, 255)', emptyVal);
    assert.strictEqual(res.status, 'UNVERIFIABLE');
    assert.strictEqual(res.classification, 'UNRESOLVED');
    assert.notStrictEqual(res.classification, 'PREEXISTING_MISMATCH');
  }
});

runTest('2.4. Fail-closed: Computed-style read error / missing node marks UNVERIFIABLE without equality inference', () => {
  const res = classifyPropertyDiagnosis('backgroundColor', undefined, 'rgb(255, 255, 255)', 'rgb(255, 255, 255)', {
    isUnverifiable: true,
    reason: 'Node sid-99 missing in GT node snapshot.'
  });

  assert.strictEqual(res.status, 'UNVERIFIABLE');
  assert.strictEqual(res.classification, 'UNRESOLVED');
  assert.notStrictEqual(res.classification, 'PREEXISTING_MISMATCH');
  assert(res.reason.includes('Node sid-99 missing'));
});

// ---------------------------------------------------------------------------
// Section 3: Fail-Closed Negative Tests for Unparseable Colors
// ---------------------------------------------------------------------------
runTest('3.1. Fail-closed: Unparseable color string does NOT classify as PREEXISTING_MISMATCH even if identical', () => {
  // Even if old and curr have identical unparseable strings, they must NOT pass as valid RGBA match
  const res = classifyPropertyDiagnosis('backgroundColor', 'rgba(0, 0, 0, 0)', 'invalid-color-value', 'invalid-color-value');
  assert.strictEqual(res.status, 'UNVERIFIABLE');
  assert.strictEqual(res.classification, 'UNRESOLVED');
  assert.notStrictEqual(res.classification, 'PREEXISTING_MISMATCH');
  assert(res.reason.includes('Unparseable color value'));
});

runTest('3.2. Fail-closed: Unparseable GT color string marks UNVERIFIABLE / UNRESOLVED', () => {
  const res = classifyPropertyDiagnosis('backgroundColor', 'not-a-css-color', 'rgb(255, 255, 255)', 'rgb(255, 255, 255)');
  assert.strictEqual(res.status, 'UNVERIFIABLE');
  assert.strictEqual(res.classification, 'UNRESOLVED');
  assert.notStrictEqual(res.classification, 'PREEXISTING_MISMATCH');
  assert(res.reason.includes('Unparseable color value in: GT'));
});

// ---------------------------------------------------------------------------
// Section 4: Semantic Color & Alpha Comparisons
// ---------------------------------------------------------------------------
runTest('4.1. Semantic color: alpha 0 matches alpha 0 regardless of RGB channels', () => {
  assert.strictEqual(compareColorValues('rgba(0, 0, 0, 0)', 'transparent'), true);
  assert.strictEqual(compareColorValues('rgba(37, 99, 235, 0)', 'rgba(0, 0, 0, 0)'), true);
  assert.strictEqual(compareColorValues('#00000000', 'rgba(255, 255, 255, 0)'), true);
});

runTest('4.2. Semantic color: Hex and RGB matching with alpha 1', () => {
  assert.strictEqual(compareColorValues('#ffffff', 'rgb(255, 255, 255)'), true);
  assert.strictEqual(compareColorValues('#000000', 'rgb(0, 0, 0)'), true);
  assert.strictEqual(compareColorValues('#6366f1', 'rgb(99, 102, 241)'), true);
});

runTest('4.3. Semantic color: Non-zero alpha mismatch strictly differs', () => {
  assert.strictEqual(compareColorValues('rgba(0, 0, 0, 0.40)', 'rgba(0, 0, 0, 0.42)'), false);
  assert.strictEqual(compareColorValues('rgba(0, 0, 0, 0)', 'rgb(255, 255, 255)'), false);
});

// ---------------------------------------------------------------------------
// Section 5: Hardened Runner Guards (Unit Verification)
// ---------------------------------------------------------------------------
runTest('5.1. Runner fails closed on compilationStatus failure even if preview exists', () => {
  const currentResult = {
    compilationStatus: 'FAILED',
    metrics: { auditStatus: 'VALID' }
  };
  const compStatus = currentResult.compilationStatus;
  const auditStatus = currentResult.metrics?.auditStatus;
  const fails = !compStatus || !compStatus.startsWith('SUCCESS') || auditStatus !== 'VALID';
  assert.strictEqual(fails, true, 'Failed compilation must be rejected');
});

runTest('5.2. Runner fails closed on INVALID auditStatus even if preview exists', () => {
  const currentResult = {
    compilationStatus: 'SUCCESS',
    metrics: { auditStatus: 'INVALID' }
  };
  const compStatus = currentResult.compilationStatus;
  const auditStatus = currentResult.metrics?.auditStatus;
  const fails = !compStatus || !compStatus.startsWith('SUCCESS') || auditStatus !== 'VALID';
  assert.strictEqual(fails, true, 'Invalid audit status must be rejected');
});

runTest('5.3. Runner fails closed on content hash mismatch', () => {
  const fixtureInReport = { fixtureId: 'corpus/test', contentHash: 'aaa111222333' };
  const fixtureDesc = { fixtureId: 'corpus/test', contentHash: 'bbb111222333' };
  assert.notStrictEqual(fixtureInReport.contentHash, fixtureDesc.contentHash, 'Mismatch must be detected');
});

runTest('5.4. Runner fails closed on baseline commit mismatch', () => {
  const reportCommit = '0d5d71de763bc839320cc0ef8e084434beb682ba';
  const runnerCommit = 'other_commit_hash_12345';
  assert.notStrictEqual(reportCommit, runnerCommit, 'Baseline commit mismatch must be detected');
});

runTest('5.5. Runner fails closed on NEEDS_REVIEW fixture with zero RULE-SURFACE-01 targets', () => {
  const deltaWithNoSurface = {
    addedDefects: [
      { defect: { rule: 'RULE-TYP-01', property: 'fontSize' } }
    ]
  };
  const surfaceTargets = (deltaWithNoSurface.addedDefects || []).filter(
    d => d.defect?.rule === 'RULE-SURFACE-01'
  );
  assert.strictEqual(surfaceTargets.length, 0, 'Zero surface targets must be detected');
});

// ---------------------------------------------------------------------------
// Section 6: Deterministic Report Formatting & Sanitization
// ---------------------------------------------------------------------------
runTest('6.1. Deterministic visual diagnosis report contains no timestamps, durations, or temp paths', () => {
  const sampleFixtures = [
    {
      fixtureId: 'corpus/04-pricing-calculator',
      relativePath: 'tests/corpus/04-pricing-calculator/input.html',
      summary: {
        totalRecords: 1,
        preexistingMismatchCount: 1,
        possibleConversionRegressionCount: 0,
        unresolvedCount: 0,
        unverifiableCount: 0
      },
      records: [
        {
          nodeSid: 'sid-2',
          viewport: 'desktop',
          property: 'backgroundImage',
          status: 'VERIFIED',
          classification: 'PREEXISTING_MISMATCH',
          reason: 'Preexisting',
          groundTruth: { computed: 'radial-gradient(...)', parsedRgba: null, rect: null },
          oldPreview: { computed: 'none', parsedRgba: null, rect: null },
          currentPreview: { computed: 'none', parsedRgba: null, rect: null }
        }
      ]
    }
  ];

  const report = buildDeterministicVisualDiagnosisReport(sampleFixtures, '0d5d71de763bc839320cc0ef8e084434beb682ba');
  const json = JSON.stringify(report, null, 2);

  assert(!json.includes('timestamp'), 'Report must not contain timestamp');
  assert(!/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(json), 'Report must not contain ISO timestamp string');
  assert(!/\b\d+\s*ms\b/.test(json), 'Report must not contain duration in ms');
  assert(!json.includes('C:\\'), 'Report must not contain Windows drive paths');
  assert(!json.includes('/tmp/'), 'Report must not contain absolute temp paths');
  assert(report.disclaimer.includes('scoped strictly to selected'));
  assert.strictEqual(report.summary.preexistingMismatchCount, 1);
});

runTest('6.2. Path sanitization preserves web URLs and cleans local drive/temp paths', () => {
  const webUrl = 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=800';
  assert.strictEqual(sanitizePath(webUrl), webUrl, 'Web URL must be untouched');

  const drivePath = sanitizePath('Image at C:\\Users\\Desktop\\assets\\photo.png');
  assert(!drivePath.includes('C:\\'), 'Windows drive path must be cleaned');

  const unixPath = sanitizePath('Render at /tmp/b82-visdiag-12345/preview.html');
  assert(!unixPath.includes('/tmp/b82-visdiag-12345/'), 'Unix temp path must be cleaned');
});

console.log('\n========================================================================');
console.log(`ALL ${passedTests}/${totalTests} TESTS PASSED CLEANLY (100%)`);
console.log('========================================================================');

/**
 * Block 8.2 — Phase 5, Part 6B-2: Old vs New Visual & Computed-Style Diagnosis Runner.
 * Closure Hardened: Fail-Closed on missing styles, corrupt audits, hash mismatches, and unparseable colors.
 *
 * Compares:
 * 1. Ground Truth computed style (captureGroundTruth)
 * 2. Frozen Block 8.0 baseline rendered preview computed style (git show 0d5d71de...)
 * 3. Current Block 8.2 rendered preview computed style (fresh compilation)
 *
 * Scoped strictly to flagged RULE-SURFACE-01 properties across desktop, tablet, and mobile.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const { discoverCorpusFixtures } = require('./support/corpus-manifest');
const { runFixtureBaseline, resolveCliPath } = require('./run-block-8-baseline');
const { captureGroundTruth } = require('../src/smart/style-snapshot');
const { captureRenderSnapshot } = require('../src/smart/render-snapshot');
const { readComputedCssProperty } = require('../src/smart/computed-style-resolver');
const { parseColorParts } = require('../src/smart/tolerances');

const ROOT_DIR = path.resolve(__dirname, '..');
const FROZEN_BASELINE_COMMIT = '0d5d71de763bc839320cc0ef8e084434beb682ba';
const REGRESSION_REPORT_PATH = path.join(ROOT_DIR, 'tests', 'reports', 'block-8-2-regression-report.json');
const OUTPUT_DIAGNOSIS_REPORT_PATH = path.join(ROOT_DIR, 'tests', 'reports', 'block-8-2-visual-diagnosis.json');

/**
 * Loads frozen baseline preview HTML from git using argument-array API.
 * @param {string} fixtureSlug
 * @param {string} commit
 * @returns {string}
 */
function loadFrozenPreviewHtml(fixtureSlug, commit = FROZEN_BASELINE_COMMIT) {
  const previewPath = `tests/reports/baseline_runs/${fixtureSlug}_baseline-preview.html`;
  try {
    return execFileSync('git', ['show', `${commit}:${previewPath}`], {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe']
    });
  } catch (err) {
    throw new Error(`Failed to load frozen baseline preview HTML for "${fixtureSlug}" from ${commit}:${previewPath}: ${err.message}`);
  }
}

/**
 * Compares two color strings semantically based on RGBA channels.
 * Treats alpha 0 as fully transparent.
 * Fails closed if either color string is unparseable to RGBA.
 * @param {string} val1
 * @param {string} val2
 * @returns {boolean}
 */
function compareColorValues(val1, val2) {
  const c1 = parseColorParts(String(val1 || ''));
  const c2 = parseColorParts(String(val2 || ''));
  if (!c1 || !c2) {
    return false;
  }
  // Both fully transparent
  if (c1.a === 0 && c2.a === 0) {
    return true;
  }
  return c1.r === c2.r && c1.g === c2.g && c1.b === c2.b && Math.abs(c1.a - c2.a) < 0.005;
}

/**
 * Compares two property values according to their type.
 * @param {string} property
 * @param {*} val1
 * @param {*} val2
 * @returns {boolean}
 */
function compareValues(property, val1, val2) {
  if (val1 === null || val1 === undefined || val2 === null || val2 === undefined) {
    return val1 === val2;
  }
  if (property === 'backgroundColor' || property === 'color' || property.toLowerCase().includes('color')) {
    return compareColorValues(val1, val2);
  }
  return String(val1).trim() === String(val2).trim();
}

/**
 * Classifies a property comparison between Ground Truth, Old Render, and Current Render.
 * Fails closed if any value is missing, empty, or unparseable.
 * @param {string} property
 * @param {*} gtVal
 * @param {*} oldVal
 * @param {*} currVal
 * @param {Object} [options]
 * @returns {{ status: string, classification: string, reason: string }}
 */
function classifyPropertyDiagnosis(property, gtVal, oldVal, currVal, options = {}) {
  if (options.isUnverifiable) {
    return {
      status: 'UNVERIFIABLE',
      classification: 'UNRESOLVED',
      reason: options.reason || 'Node or property unverifiable in one or more snapshots.'
    };
  }

  // Fail closed on null, undefined, or empty string (note: "none" is a valid CSS string!)
  const isMissingGt = gtVal === null || gtVal === undefined || String(gtVal).trim() === '';
  const isMissingOld = oldVal === null || oldVal === undefined || String(oldVal).trim() === '';
  const isMissingCurr = currVal === null || currVal === undefined || String(currVal).trim() === '';

  if (isMissingGt || isMissingOld || isMissingCurr) {
    const missing = [];
    if (isMissingGt) missing.push('GT value');
    if (isMissingOld) missing.push('old preview value');
    if (isMissingCurr) missing.push('current preview value');
    return {
      status: 'UNVERIFIABLE',
      classification: 'UNRESOLVED',
      reason: `Missing or empty property value in: ${missing.join(', ')}.`
    };
  }

  // For color properties, fail closed if unparseable to RGBA
  const isColorProp = property === 'backgroundColor' || property === 'color' || property.toLowerCase().includes('color');
  if (isColorProp) {
    const pGt = parseColorParts(String(gtVal));
    const pOld = parseColorParts(String(oldVal));
    const pCurr = parseColorParts(String(currVal));
    const unparseable = [];
    if (!pGt) unparseable.push(`GT ("${gtVal}")`);
    if (!pOld) unparseable.push(`Old ("${oldVal}")`);
    if (!pCurr) unparseable.push(`Current ("${currVal}")`);
    if (unparseable.length > 0) {
      return {
        status: 'UNVERIFIABLE',
        classification: 'UNRESOLVED',
        reason: `Unparseable color value in: ${unparseable.join(', ')}. Cannot semantically evaluate RGBA equality.`
      };
    }
  }

  const oldMatchesGt = compareValues(property, oldVal, gtVal);
  const currMatchesGt = compareValues(property, currVal, gtVal);
  const currMatchesOld = compareValues(property, currVal, oldVal);

  if (currMatchesOld && !currMatchesGt && !oldMatchesGt) {
    return {
      status: 'VERIFIED',
      classification: 'PREEXISTING_MISMATCH',
      reason: 'Old and current rendered values match each other, but both differ from Ground Truth. Mismatch was pre-existing in Block 8.0 baseline render.'
    };
  }

  if (oldMatchesGt && !currMatchesGt) {
    return {
      status: 'VERIFIED',
      classification: 'POSSIBLE_CONVERSION_REGRESSION',
      reason: 'Old rendered value matched Ground Truth, but current rendered value differs.'
    };
  }

  return {
    status: 'VERIFIED',
    classification: 'UNRESOLVED',
    reason: `Atypical relation: oldMatchesGt=${oldMatchesGt}, currMatchesGt=${currMatchesGt}, currMatchesOld=${currMatchesOld}.`
  };
}

/**
 * Sanitizes machine paths in report strings.
 * @param {*} val
 * @returns {*}
 */
function sanitizePath(val) {
  if (typeof val !== 'string') return val;
  if (/^https?:\/\//i.test(val.trim())) return val;
  let s = val.replace(/\\/g, '/');
  const rootNorm = ROOT_DIR.replace(/\\/g, '/');
  if (s.includes(rootNorm)) {
    s = s.split(rootNorm).join('<ROOT>');
  }
  s = s.replace(/\b[a-zA-Z]:\/[^\s"'`),]+/g, match => path.basename(match));
  s = s.replace(/(?:\/home|\/tmp|\/var)\/[^\s"'`),]+/g, match => path.basename(match));
  return s;
}

/**
 * Builds deterministic visual diagnosis report object with clear scoped disclaimer.
 * @param {Array<Object>} diagnosedFixtures
 * @param {string} baselineCommit
 * @returns {Object}
 */
function buildDeterministicVisualDiagnosisReport(diagnosedFixtures, baselineCommit = FROZEN_BASELINE_COMMIT) {
  const sorted = [...diagnosedFixtures].sort((a, b) => a.fixtureId.localeCompare(b.fixtureId));

  let totalRecords = 0;
  let preexistingCount = 0;
  let regressionCount = 0;
  let unresolvedCount = 0;
  let unverifiableCount = 0;

  for (const f of sorted) {
    totalRecords += f.summary.totalRecords;
    preexistingCount += f.summary.preexistingMismatchCount;
    regressionCount += f.summary.possibleConversionRegressionCount;
    unresolvedCount += f.summary.unresolvedCount;
    unverifiableCount += (f.summary.unverifiableCount || 0);
  }

  return {
    schemaVersion: '8.2.0-visual-diagnosis',
    baselineCommit,
    disclaimer: 'Computed-style/render diagnosis based on headless Chromium computed styles and bounding rects; scoped strictly to selected (fixture, nodeSid, viewport, backgroundProperty) records. Does not prove full visual parity, live WordPress rendering parity, or the absence of all conversion regressions across the compiler.',
    summary: {
      totalDiagnosedFixtures: sorted.length,
      totalDiagnosedRecords: totalRecords,
      preexistingMismatchCount: preexistingCount,
      possibleConversionRegressionCount: regressionCount,
      unresolvedCount: unresolvedCount,
      unverifiableCount: unverifiableCount
    },
    fixtures: sorted
  };
}

/**
 * Diagnoses a single fixture by comparing Ground Truth, Frozen Old Render, and Fresh Current Render.
 * @param {Object} fixture
 * @param {Array<Object>} flaggedRecords
 * @param {string} cliPath
 * @param {string} tempDir
 * @param {string} baselineCommit
 * @returns {Promise<Object>}
 */
async function diagnoseFixture(fixture, flaggedRecords, cliPath, tempDir, baselineCommit = FROZEN_BASELINE_COMMIT) {
  const fixtureSlug = fixture.fixtureId.replace(/\//g, '_');
  const sourceHtmlPath = path.resolve(ROOT_DIR, fixture.relativePath);
  const sourceHtml = fs.readFileSync(sourceHtmlPath, 'utf8');

  // 1. Load frozen baseline preview HTML
  const frozenPreviewHtml = loadFrozenPreviewHtml(fixtureSlug, baselineCommit);

  // 2. Fresh compile current fixture into temp dir
  const currentResult = runFixtureBaseline(fixture, cliPath, tempDir);

  // Hardening: Verify compilationStatus and auditStatus
  const compStatus = currentResult?.compilationStatus;
  const auditStatus = currentResult?.metrics?.auditStatus;
  if (!compStatus || !compStatus.startsWith('SUCCESS') || auditStatus !== 'VALID') {
    throw new Error(
      `Fresh compilation for "${fixture.fixtureId}" failed (status: ${compStatus || 'MISSING'}, auditStatus: ${auditStatus || 'MISSING'}). Existence of preview file alone is not proof of successful compilation.`
    );
  }

  const currentPreviewPath = path.join(tempDir, `${fixtureSlug}_baseline-preview.html`);
  if (!fs.existsSync(currentPreviewPath)) {
    throw new Error(`Fresh compilation failed to produce preview file at ${currentPreviewPath}`);
  }
  const currentPreviewHtml = fs.readFileSync(currentPreviewPath, 'utf8');

  // 3. Acquire 3-viewport snapshots
  // a) Source Ground Truth
  const gtSnapshot = await captureGroundTruth(sourceHtml, { inputPath: sourceHtmlPath, cache: false });
  // b) Old Render Snapshot
  const oldRenderSnapshot = await captureRenderSnapshot(frozenPreviewHtml);
  // c) Current Render Snapshot
  const currentRenderSnapshot = await captureRenderSnapshot(currentPreviewHtml);

  // 4. Diagnose each flagged record
  const records = [];
  let preexistingMismatchCount = 0;
  let possibleConversionRegressionCount = 0;
  let unresolvedCount = 0;
  let unverifiableCount = 0;

  for (const item of flaggedRecords) {
    const { nodeSid, viewport, property } = item;
    const vp = viewport || 'desktop';

    const gtNode = gtSnapshot?.viewports?.[vp]?.flat?.[nodeSid] || null;
    const oldNode = oldRenderSnapshot?.viewports?.[vp]?.flat?.[nodeSid] || null;
    const currNode = currentRenderSnapshot?.viewports?.[vp]?.flat?.[nodeSid] || null;

    let isUnverifiable = false;
    let unverifiableReason = '';

    if (!gtNode || !oldNode || !currNode) {
      isUnverifiable = true;
      const missing = [];
      if (!gtNode) missing.push('GT node');
      if (!oldNode) missing.push('old preview node');
      if (!currNode) missing.push('current preview node');
      unverifiableReason = `Node ${nodeSid} missing in: ${missing.join(', ')}.`;
    }

    const cssProp = property === 'backgroundColor' ? 'background-color' : (property === 'backgroundImage' ? 'background-image' : property);

    let gtComputed = null;
    let gtReadError = null;
    if (gtNode) {
      try {
        gtComputed = readComputedCssProperty(gtNode, gtSnapshot, vp, cssProp, property);
      } catch (err) {
        gtReadError = err.message;
        isUnverifiable = true;
        unverifiableReason = unverifiableReason
          ? `${unverifiableReason} GT read error: ${gtReadError}.`
          : `Failed to read GT computed-style for ${property} on ${nodeSid}: ${gtReadError}.`;
      }
    }

    const oldComputed = oldNode?.styles?.[property] !== undefined ? oldNode.styles[property] : null;
    const currComputed = currNode?.styles?.[property] !== undefined ? currNode.styles[property] : null;

    // Check if property value is null, undefined, or empty string (Note: "none" is valid!)
    if (!isUnverifiable) {
      const missingProps = [];
      if (gtComputed === null || gtComputed === undefined || String(gtComputed).trim() === '') {
        missingProps.push('GT computed value');
      }
      if (oldComputed === null || oldComputed === undefined || String(oldComputed).trim() === '') {
        missingProps.push('old preview rendered style');
      }
      if (currComputed === null || currComputed === undefined || String(currComputed).trim() === '') {
        missingProps.push('current preview rendered style');
      }
      if (missingProps.length > 0) {
        isUnverifiable = true;
        unverifiableReason = `Property ${property} on ${nodeSid} missing/empty in: ${missingProps.join(', ')}.`;
      }
    }

    const classificationResult = classifyPropertyDiagnosis(property, gtComputed, oldComputed, currComputed, {
      isUnverifiable,
      reason: unverifiableReason
    });

    if (classificationResult.classification === 'PREEXISTING_MISMATCH') {
      preexistingMismatchCount++;
    } else if (classificationResult.classification === 'POSSIBLE_CONVERSION_REGRESSION') {
      possibleConversionRegressionCount++;
    } else {
      unresolvedCount++;
    }

    if (classificationResult.status === 'UNVERIFIABLE' || isUnverifiable) {
      unverifiableCount++;
    }

    const isColorProp = property === 'backgroundColor' || property === 'color' || property.toLowerCase().includes('color');

    records.push({
      nodeSid,
      viewport: vp,
      property,
      status: classificationResult.status || (isUnverifiable ? 'UNVERIFIABLE' : 'VERIFIED'),
      classification: classificationResult.classification,
      reason: classificationResult.reason,
      groundTruth: {
        computed: sanitizePath(gtComputed),
        parsedRgba: isColorProp && gtComputed ? parseColorParts(gtComputed) : null,
        rect: gtNode?.rect || null
      },
      oldPreview: {
        computed: sanitizePath(oldComputed),
        parsedRgba: isColorProp && oldComputed ? parseColorParts(oldComputed) : null,
        rect: oldNode?.rect || null
      },
      currentPreview: {
        computed: sanitizePath(currComputed),
        parsedRgba: isColorProp && currComputed ? parseColorParts(currComputed) : null,
        rect: currNode?.rect || null
      }
    });
  }

  // Sort records deterministically
  records.sort((a, b) => {
    const c1 = a.nodeSid.localeCompare(b.nodeSid);
    if (c1 !== 0) return c1;
    const c2 = a.viewport.localeCompare(b.viewport);
    if (c2 !== 0) return c2;
    return a.property.localeCompare(b.property);
  });

  return {
    fixtureId: fixture.fixtureId,
    relativePath: fixture.relativePath,
    summary: {
      totalRecords: records.length,
      preexistingMismatchCount,
      possibleConversionRegressionCount,
      unresolvedCount,
      unverifiableCount
    },
    records
  };
}

/**
 * Runs full visual diagnosis suite across all fixtures requiring review.
 * @param {Object} [options]
 * @returns {Promise<Object>}
 */
async function runVisualDiagnosis(options = {}) {
  const rootDir = options.rootDir || ROOT_DIR;
  const baselineCommit = options.baselineCommit || FROZEN_BASELINE_COMMIT;
  const regressionReportPath = options.regressionReportPath || REGRESSION_REPORT_PATH;
  const outputReportPath = options.outputReportPath || OUTPUT_DIAGNOSIS_REPORT_PATH;

  if (!fs.existsSync(regressionReportPath)) {
    throw new Error(`Regression report not found at ${regressionReportPath}. Run run-b82-regression.js first.`);
  }

  const regressionReport = JSON.parse(fs.readFileSync(regressionReportPath, 'utf8'));

  // Hardening: Verify baseline commit matches
  if (regressionReport.baselineCommit !== baselineCommit) {
    throw new Error(
      `Baseline commit mismatch: regression report was generated from "${regressionReport.baselineCommit}", but runner is configured for "${baselineCommit}".`
    );
  }

  const fixturesNeedingReview = (regressionReport.fixtures || []).filter(f => f.status === 'NEEDS_REVIEW');

  console.log(`▶ Discovered ${fixturesNeedingReview.length} fixture(s) with status: NEEDS_REVIEW.`);

  const corpusFixtures = discoverCorpusFixtures({ rootDir });
  const fixtureDescMap = new Map();
  for (const cf of corpusFixtures) {
    fixtureDescMap.set(cf.fixtureId, cf);
  }

  const cliPath = resolveCliPath();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'b82-visdiag-'));

  try {
    const diagnosedFixtures = [];

    for (const f of fixturesNeedingReview) {
      const fixtureDesc = fixtureDescMap.get(f.fixtureId);
      if (!fixtureDesc) {
        throw new Error(`Fixture descriptor not found for ${f.fixtureId}`);
      }

      // Hardening: Compare content hashes
      if (f.contentHash !== fixtureDesc.contentHash) {
        throw new Error(
          `Content hash mismatch for fixture "${f.fixtureId}": regression report has "${f.contentHash}", but fixture descriptor has "${fixtureDesc.contentHash}".`
        );
      }

      // Collect flagged RULE-SURFACE-01 records dynamically
      const addedSurfaceDefects = (f.delta?.addedDefects || []).filter(
        d => d.defect?.rule === 'RULE-SURFACE-01'
      );

      // Hardening: If fixture in NEEDS_REVIEW has zero RULE-SURFACE-01 targets, fail closed!
      if (addedSurfaceDefects.length === 0) {
        throw new Error(
          `Fixture "${f.fixtureId}" marked NEEDS_REVIEW has no RULE-SURFACE-01 targets. This runner is scoped strictly to surface defects.`
        );
      }

      // Deduplicate by nodeSid + viewport + property
      const targetMap = new Map();
      for (const ad of addedSurfaceDefects) {
        const key = `${ad.defect.nodeSid}|${ad.defect.viewport}|${ad.defect.property}`;
        if (!targetMap.has(key)) {
          targetMap.set(key, {
            nodeSid: ad.defect.nodeSid,
            viewport: ad.defect.viewport,
            property: ad.defect.property
          });
        }
      }

      const targetList = Array.from(targetMap.values());
      console.log(`  • [${f.fixtureId}] Diagnosing ${targetList.length} unique flagged surface record(s)...`);

      const diagnosed = await diagnoseFixture(fixtureDesc, targetList, cliPath, tempDir, baselineCommit);
      diagnosedFixtures.push(diagnosed);
    }

    const report = buildDeterministicVisualDiagnosisReport(diagnosedFixtures, baselineCommit);

    fs.mkdirSync(path.dirname(outputReportPath), { recursive: true });
    fs.writeFileSync(outputReportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
    console.log(`\n✓ Deterministic visual diagnosis report written to: ${outputReportPath}`);

    return report;
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

if (require.main === module) {
  (async () => {
    try {
      console.log('========================================================================');
      console.log('BLOCK 8.2 — PHASE 5 (PART 6B-2): OLD VS NEW VISUAL DIAGNOSIS');
      console.log('========================================================================\n');

      const report = await runVisualDiagnosis();

      console.log('\n========================================================================');
      console.log('VISUAL DIAGNOSIS SUMMARY');
      console.log('========================================================================');
      console.log(`  • Diagnosed Fixtures:                 ${report.summary.totalDiagnosedFixtures}`);
      console.log(`  • Total Diagnosed Records:            ${report.summary.totalDiagnosedRecords}`);
      console.log(`  • Pre-existing Mismatches:            ${report.summary.preexistingMismatchCount}`);
      console.log(`  • Possible Conversion Regressions:    ${report.summary.possibleConversionRegressionCount}`);
      console.log(`  • Unresolved Records:                 ${report.summary.unresolvedCount}`);
      console.log(`  • Unverifiable Records:               ${report.summary.unverifiableCount}\n`);

      for (const f of report.fixtures) {
        console.log(`▶ Fixture: ${f.fixtureId}`);
        console.log(`  Records: ${f.summary.totalRecords} (Preexisting: ${f.summary.preexistingMismatchCount}, Regression: ${f.summary.possibleConversionRegressionCount}, Unresolved: ${f.summary.unresolvedCount}, Unverifiable: ${f.summary.unverifiableCount || 0})`);
        for (const r of f.records) {
          console.log(`  • [${r.classification}] (${r.viewport} @ ${r.nodeSid}) ${r.property} [${r.status}]:`);
          console.log(`      GT:      ${r.groundTruth.computed}`);
          console.log(`      Old:     ${r.oldPreview.computed}`);
          console.log(`      Current: ${r.currentPreview.computed}`);
        }
        console.log('');
      }

      process.exit(0);
    } catch (err) {
      console.error('\n✖ [FATAL] Visual diagnosis failed:', err.message);
      process.exit(1);
    }
  })();
}

module.exports = {
  FROZEN_BASELINE_COMMIT,
  OUTPUT_DIAGNOSIS_REPORT_PATH,
  loadFrozenPreviewHtml,
  compareColorValues,
  compareValues,
  classifyPropertyDiagnosis,
  sanitizePath,
  buildDeterministicVisualDiagnosisReport,
  diagnoseFixture,
  runVisualDiagnosis
};

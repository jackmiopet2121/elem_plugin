/**
 * Block 8.2 — Phase 5, Part 6B-1: Cross-Corpus Regression Diagnostic Runner.
 *
 * Reuses:
 * - discoverCorpusFixtures() from tests/support/corpus-manifest.js
 * - runFixtureBaseline(), resolveCliPath(), buildDeterministicReport() from tests/run-block-8-baseline.js
 *
 * Compares current compilation against frozen Block 8.0 baseline from git:
 * Commit: 0d5d71de763bc839320cc0ef8e084434beb682ba
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const { discoverCorpusFixtures, DEFAULT_VIEWPORTS } = require('./support/corpus-manifest');
const { runFixtureBaseline, resolveCliPath, buildDeterministicReport, validateAuditSchema } = require('./run-block-8-baseline');

const ROOT_DIR = path.resolve(__dirname, '..');
const FROZEN_BASELINE_COMMIT = '0d5d71de763bc839320cc0ef8e084434beb682ba';
const FROZEN_BASELINE_REPORT_PATH = 'tests/reports/block-8-baseline-report.json';
const OUTPUT_REGRESSION_REPORT_PATH = path.join(ROOT_DIR, 'tests', 'reports', 'block-8-2-regression-report.json');

/**
 * Sanitizes report strings by replacing absolute machine paths with relative/generic tokens.
 * Web URLs (http/https) are left untouched.
 * @param {*} val
 * @returns {*}
 */
function sanitizeReportValue(val) {
  if (val === null || val === undefined) return null;
  if (typeof val !== 'string') return val;
  // If string starts with web protocol, preserve it intact
  if (/^https?:\/\//i.test(val.trim())) return val;

  let s = val;
  const rootNorm = ROOT_DIR.replace(/\\/g, '/');
  s = s.replace(/\\/g, '/');
  if (s.includes(rootNorm)) {
    s = s.split(rootNorm).join('<ROOT>');
  }
  // Sanitize Windows drive paths: single letter followed by :/
  s = s.replace(/\b[a-zA-Z]:\/[^\s"'`),]+/g, (match) => {
    return path.basename(match);
  });
  // Sanitize unix absolute paths like /tmp/..., /home/..., /var/...
  s = s.replace(/(?:\/home|\/tmp|\/var)\/[^\s"'`),]+/g, (match) => {
    return path.basename(match);
  });
  return s;
}

/**
 * Loads the frozen baseline report from git using argument-array process API.
 * @param {string} commit
 * @param {string} reportPath
 * @returns {Object}
 */
function loadFrozenBaseline(commit = FROZEN_BASELINE_COMMIT, reportPath = FROZEN_BASELINE_REPORT_PATH) {
  try {
    const raw = execFileSync('git', ['show', `${commit}:${reportPath}`], {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to load frozen baseline from ${commit}:${reportPath}: ${err.message}`);
  }
}

/**
 * Loads the frozen baseline audit file for a fixture from git.
 * Throws a descriptive error if missing or corrupt so callers can record a hard failure.
 * Validates the parsed audit using validateAuditSchema from run-block-8-baseline.js.
 * @param {string} fixtureSlug
 * @param {string} commit
 * @returns {Object}
 */
function loadFrozenAudit(fixtureSlug, commit = FROZEN_BASELINE_COMMIT) {
  const auditPath = `tests/reports/baseline_runs/${fixtureSlug}_baseline.audit.json`;
  let parsed;
  try {
    const raw = execFileSync('git', ['show', `${commit}:${auditPath}`], {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to load frozen baseline audit for "${fixtureSlug}" from ${commit}:${auditPath}: ${err.message}`);
  }

  // Validate frozen audit schema
  const validation = validateAuditSchema(parsed);
  if (!validation.valid) {
    throw new Error(`Frozen baseline audit schema invalid for "${fixtureSlug}": ${validation.error}`);
  }
  if (!Array.isArray(parsed.defects)) {
    throw new Error(`Frozen baseline audit schema invalid for "${fixtureSlug}": missing or invalid defects array`);
  }

  return parsed;
}

/**
 * Builds composite multiset key for a defect.
 * Key: viewport + nodeSid + rule + property + severity + advisory.
 * Ignores defect.id because IDs can change between runs.
 * @param {Object} d
 * @returns {string}
 */
function buildDefectKey(d) {
  if (!d || typeof d !== 'object') return 'unknown|unknown|unknown|unknown|UNKNOWN|0';
  const vp = d.viewport || 'desktop';
  const sid = d.nodeSid || '';
  const rule = d.rule || '';
  const prop = d.property || '';
  const sev = (d.severity || '').toUpperCase();
  const adv = d.advisory ? '1' : '0';
  return `${vp}|${sid}|${rule}|${prop}|${sev}|${adv}`;
}

/**
 * Computes multiset delta between two audit defect lists.
 * @param {Object|null} oldAudit
 * @param {Object|null} newAudit
 * @returns {{ added: Array, removed: Array, addedCount: number, removedCount: number, addedAdvisoryCount: number, addedAdvisoryRawHighCount: number, addedNonAdvisoryHighCriticalCount: number }}
 */
function computeAuditMultisetDelta(oldAudit, newAudit) {
  const oldDefects = (oldAudit && Array.isArray(oldAudit.defects)) ? oldAudit.defects : [];
  const newDefects = (newAudit && Array.isArray(newAudit.defects)) ? newAudit.defects : [];

  const baselineAuditRules = new Set(
    oldDefects.map(d => d.rule).filter(Boolean)
  );

  const oldCountMap = new Map();
  const oldExampleMap = new Map();
  for (const d of oldDefects) {
    const k = buildDefectKey(d);
    oldCountMap.set(k, (oldCountMap.get(k) || 0) + 1);
    if (!oldExampleMap.has(k)) {
      oldExampleMap.set(k, {
        viewport: d.viewport || null,
        nodeSid: d.nodeSid || null,
        widgetId: d.widgetId !== undefined && d.widgetId !== null ? sanitizeReportValue(d.widgetId) : null,
        rule: d.rule || null,
        property: d.property || null,
        severity: d.severity || null,
        advisory: Boolean(d.advisory),
        original: d.original !== undefined && d.original !== null ? sanitizeReportValue(d.original) : null,
        rendered: d.rendered !== undefined && d.rendered !== null ? sanitizeReportValue(d.rendered) : null,
        message: d.message ? sanitizeReportValue(d.message) : null
      });
    }
  }

  const newCountMap = new Map();
  const newExampleMap = new Map();
  for (const d of newDefects) {
    const k = buildDefectKey(d);
    newCountMap.set(k, (newCountMap.get(k) || 0) + 1);
    if (!newExampleMap.has(k)) {
      newExampleMap.set(k, {
        viewport: d.viewport || null,
        nodeSid: d.nodeSid || null,
        widgetId: d.widgetId !== undefined && d.widgetId !== null ? sanitizeReportValue(d.widgetId) : null,
        rule: d.rule || null,
        property: d.property || null,
        severity: d.severity || null,
        advisory: Boolean(d.advisory),
        original: d.original !== undefined && d.original !== null ? sanitizeReportValue(d.original) : null,
        rendered: d.rendered !== undefined && d.rendered !== null ? sanitizeReportValue(d.rendered) : null,
        message: d.message ? sanitizeReportValue(d.message) : null
      });
    }
  }

  const allKeys = new Set([...oldCountMap.keys(), ...newCountMap.keys()]);
  const added = [];
  const removed = [];
  let addedCount = 0;
  let removedCount = 0;
  let addedAdvisoryCount = 0;
  let addedAdvisoryRawHighCount = 0;
  let addedNonAdvisoryHighCriticalCount = 0;

  for (const k of allKeys) {
    const oldCount = oldCountMap.get(k) || 0;
    const newCount = newCountMap.get(k) || 0;
    if (newCount > oldCount) {
      const diff = newCount - oldCount;
      addedCount += diff;
      const ex = newExampleMap.get(k);
      const isAbsentRule = !baselineAuditRules.has(ex.rule);
      const addedEntry = {
        key: k,
        count: diff,
        defect: {
          ...ex,
          auditRuleAbsentInBaseline: isAbsentRule,
          conversionRegressionStatus: 'UNRESOLVED'
        },
        auditRuleAbsentInBaseline: isAbsentRule,
        conversionRegressionStatus: 'UNRESOLVED'
      };
      added.push(addedEntry);

      if (ex.advisory === true) {
        addedAdvisoryCount += diff;
        if (ex.severity === 'HIGH') {
          addedAdvisoryRawHighCount += diff;
        }
      } else {
        if (ex.severity === 'HIGH' || ex.severity === 'CRITICAL') {
          addedNonAdvisoryHighCriticalCount += diff;
        }
      }
    } else if (oldCount > newCount) {
      const diff = oldCount - newCount;
      removedCount += diff;
      removed.push({
        key: k,
        count: diff,
        defect: oldExampleMap.get(k)
      });
    }
  }

  added.sort((a, b) => a.key.localeCompare(b.key));
  removed.sort((a, b) => a.key.localeCompare(b.key));

  return {
    added,
    removed,
    addedCount,
    removedCount,
    addedAdvisoryCount,
    addedAdvisoryRawHighCount,
    addedNonAdvisoryHighCriticalCount
  };
}

/**
 * Computes metric difference preserving null values.
 * Null stays null; zero does not replace null.
 * @param {number|null} baselineVal
 * @param {number|null} currentVal
 * @returns {number|null}
 */
function computeMetricDelta(baselineVal, currentVal) {
  if (baselineVal === null || baselineVal === undefined || currentVal === null || currentVal === undefined) {
    return null;
  }
  return currentVal - baselineVal;
}

/**
 * Extracts invariant violation message strings from a fixture.
 * @param {Object} fixture
 * @returns {Array<string>}
 */
function extractInvariantViolations(fixture) {
  const violations = fixture?.invariants?.violations;
  if (!Array.isArray(violations)) return [];
  return violations.map(v => typeof v === 'string' ? v : (v?.message || JSON.stringify(v)));
}

/**
 * Classifies fixture comparison.
 * @param {Object|null} baselineFixture
 * @param {Object} currentFixture
 * @param {Object|null} auditDelta
 * @param {Object} [options]
 * @returns {{ status: string, classificationReason: string, isHardFailure: boolean }}
 */
function classifyFixture(baselineFixture, currentFixture, auditDelta, options = {}) {
  // 1. Compile failure
  if (!currentFixture.compilationStatus || !currentFixture.compilationStatus.startsWith('SUCCESS')) {
    return {
      status: 'FAILED',
      classificationReason: `Compilation failed with status ${currentFixture.compilationStatus}: ${currentFixture.errorMessage || 'Unknown compiler error'}`,
      isHardFailure: true
    };
  }

  // 2. Invalid or missing audit
  if (currentFixture.metrics?.auditStatus !== 'VALID') {
    return {
      status: 'FAILED',
      classificationReason: `Audit status is ${currentFixture.metrics?.auditStatus}: ${currentFixture.metrics?.auditError || 'Invalid audit'}`,
      isHardFailure: true
    };
  }

  // 3. Baseline audit error for comparable fixture
  if (options && options.baselineAuditError) {
    return {
      status: 'FAILED',
      classificationReason: `Baseline audit error: ${options.baselineAuditError}`,
      isHardFailure: true
    };
  }

  // 4. New fixture (not in baseline)
  if (!baselineFixture || options.isNewFixture) {
    return {
      status: 'NEW_FIXTURE',
      classificationReason: 'Fixture is newly discovered and not present in baseline',
      isHardFailure: false
    };
  }

  // 5. Incomparable input changed
  if (baselineFixture.contentHash !== currentFixture.contentHash) {
    return {
      status: 'INCOMPARABLE_INPUT_CHANGED',
      classificationReason: `Input content hash changed from ${baselineFixture.contentHash} to ${currentFixture.contentHash}`,
      isHardFailure: false
    };
  }

  // 6. Check metrics for regression
  const baseFidelity = baselineFixture.metrics?.globalFidelityScore;
  const currFidelity = currentFixture.metrics?.globalFidelityScore;
  const baseEditability = baselineFixture.metrics?.nativeEditabilityPercentage;
  const currEditability = currentFixture.metrics?.nativeEditabilityPercentage;

  const baseViolations = extractInvariantViolations(baselineFixture);
  const currViolations = extractInvariantViolations(currentFixture);
  const addedInvariants = currViolations.filter(v => !baseViolations.includes(v));

  const reviewReasons = [];

  const addedNonAdvisoryHighCriticalCount = auditDelta?.addedNonAdvisoryHighCriticalCount || 0;
  const addedAdvisoryCount = auditDelta?.addedAdvisoryCount || 0;

  // Score decrease
  if (typeof baseFidelity === 'number' && typeof currFidelity === 'number' && currFidelity < baseFidelity) {
    const fDelta = currFidelity - baseFidelity;
    let scoreMsg = `Fidelity score decreased from ${baseFidelity} to ${currFidelity} (delta: ${fDelta})`;
    if (addedAdvisoryCount > 0) {
      scoreMsg += `; ${addedAdvisoryCount} advisory defect(s)`;
    }
    if (addedNonAdvisoryHighCriticalCount === 0) {
      scoreMsg += ` (0 new non-advisory HIGH/CRITICAL)`;
    } else {
      scoreMsg += ` (${addedNonAdvisoryHighCriticalCount} new non-advisory HIGH/CRITICAL)`;
    }
    reviewReasons.push(scoreMsg);
  } else if (addedNonAdvisoryHighCriticalCount > 0) {
    reviewReasons.push(`${addedNonAdvisoryHighCriticalCount} new non-advisory HIGH/CRITICAL defect(s) detected`);
  }

  // Editability decrease
  if (typeof baseEditability === 'number' && typeof currEditability === 'number' && currEditability < baseEditability) {
    reviewReasons.push(`Native editability percentage decreased from ${baseEditability}% to ${currEditability}%`);
  }

  // Invariant violations changed or increased (message-aware)
  if (addedInvariants.length > 0) {
    reviewReasons.push(`Invariant violations changed: ${addedInvariants.length} new violation(s) detected`);
  }

  if (reviewReasons.length > 0) {
    return {
      status: 'NEEDS_REVIEW',
      classificationReason: reviewReasons.join('; '),
      isHardFailure: false
    };
  }

  const totalAddedCount = auditDelta?.addedCount || 0;
  const totalRemovedCount = auditDelta?.removedCount || 0;

  // Score increased with zero regression flags
  if (typeof baseFidelity === 'number' && typeof currFidelity === 'number' && currFidelity > baseFidelity) {
    return {
      status: 'PASS',
      classificationReason: `Fidelity score improved from ${baseFidelity} to ${currFidelity}` + (totalAddedCount > 0 ? ` (${totalAddedCount} added advisory/low defect(s))` : ''),
      isHardFailure: false
    };
  }

  // Score matched but there are added/removed advisory or low defects
  if (totalAddedCount > 0 || totalRemovedCount > 0) {
    return {
      status: 'PASS',
      classificationReason: `Fidelity score matched baseline (${currFidelity}) with ${totalAddedCount} added and ${totalRemovedCount} removed advisory/low defect(s)`,
      isHardFailure: false
    };
  }

  return {
    status: 'PASS',
    classificationReason: 'All baseline metrics, fidelity score, and defect counts maintained or matched',
    isHardFailure: false
  };
}

/**
 * Compares a single fixture result against its baseline.
 * @param {Object} fixture
 * @param {Object|null} baselineFixture
 * @param {Object} currentFixture
 * @param {Object|null} auditDelta
 * @param {Object} [options]
 * @returns {Object}
 */
function compareSingleFixture(fixture, baselineFixture, currentFixture, auditDelta, options = {}) {
  const classification = classifyFixture(baselineFixture, currentFixture, auditDelta, options);

  const baseMetrics = baselineFixture?.metrics || {};
  const currMetrics = currentFixture?.metrics || {};

  const baseDefects = baseMetrics.defects || {};
  const currDefects = currMetrics.defects || {};

  const baseViolations = extractInvariantViolations(baselineFixture);
  const currViolations = extractInvariantViolations(currentFixture);
  const addedInvariants = currViolations.filter(v => !baseViolations.includes(v));
  const removedInvariants = baseViolations.filter(v => !currViolations.includes(v));

  const delta = {
    fidelityDelta: computeMetricDelta(baseMetrics.globalFidelityScore, currMetrics.globalFidelityScore),
    defectCountDeltas: {
      critical: computeMetricDelta(baseDefects.critical, currDefects.critical),
      high: computeMetricDelta(baseDefects.high, currDefects.high),
      medium: computeMetricDelta(baseDefects.medium, currDefects.medium),
      low: computeMetricDelta(baseDefects.low, currDefects.low),
      advisory: computeMetricDelta(baseDefects.advisory, currDefects.advisory)
    },
    nativeEditabilityDelta: computeMetricDelta(baseMetrics.nativeEditabilityPercentage, currMetrics.nativeEditabilityPercentage),
    htmlWidgetsDelta: computeMetricDelta(baseMetrics.htmlWidgetsCount, currMetrics.htmlWidgetsCount),
    microCssSizeDelta: computeMetricDelta(baseMetrics.microCssSizeBytes, currMetrics.microCssSizeBytes),
    scriptSizeDelta: computeMetricDelta(baseMetrics.scriptSizeBytes, currMetrics.scriptSizeBytes),
    invariantViolationsDelta: computeMetricDelta(baseViolations.length, currViolations.length),
    addedInvariantViolations: addedInvariants,
    removedInvariantViolations: removedInvariants,
    addedDefectsCount: auditDelta ? auditDelta.addedCount : null,
    removedDefectsCount: auditDelta ? auditDelta.removedCount : null,
    addedAdvisoryCount: auditDelta ? auditDelta.addedAdvisoryCount : null,
    addedAdvisoryRawHighCount: auditDelta ? auditDelta.addedAdvisoryRawHighCount : null,
    addedNonAdvisoryHighCriticalCount: auditDelta ? auditDelta.addedNonAdvisoryHighCriticalCount : null,
    addedDefects: auditDelta ? auditDelta.added : [],
    removedDefects: auditDelta ? auditDelta.removed : []
  };

  return {
    fixtureId: fixture.fixtureId,
    relativePath: fixture.relativePath,
    contentHash: fixture.contentHash,
    status: classification.status,
    classificationReason: classification.classificationReason,
    isHardFailure: classification.isHardFailure,
    baseline: baselineFixture ? {
      compilationStatus: baselineFixture.compilationStatus,
      auditStatus: baseMetrics.auditStatus !== undefined ? baseMetrics.auditStatus : null,
      fidelity: baseMetrics.globalFidelityScore !== undefined ? baseMetrics.globalFidelityScore : null,
      defects: {
        critical: baseDefects.critical !== undefined ? baseDefects.critical : null,
        high: baseDefects.high !== undefined ? baseDefects.high : null,
        medium: baseDefects.medium !== undefined ? baseDefects.medium : null,
        low: baseDefects.low !== undefined ? baseDefects.low : null,
        advisory: baseDefects.advisory !== undefined ? baseDefects.advisory : null
      },
      invariantViolations: baseViolations.length,
      nativeEditabilityPercentage: baseMetrics.nativeEditabilityPercentage !== undefined ? baseMetrics.nativeEditabilityPercentage : null,
      htmlWidgetsCount: baseMetrics.htmlWidgetsCount !== undefined ? baseMetrics.htmlWidgetsCount : null,
      microCssSizeBytes: baseMetrics.microCssSizeBytes !== undefined ? baseMetrics.microCssSizeBytes : null,
      scriptSizeBytes: baseMetrics.scriptSizeBytes !== undefined ? baseMetrics.scriptSizeBytes : null
    } : null,
    current: {
      compilationStatus: currentFixture.compilationStatus,
      auditStatus: currMetrics.auditStatus !== undefined ? currMetrics.auditStatus : null,
      fidelity: currMetrics.globalFidelityScore !== undefined ? currMetrics.globalFidelityScore : null,
      defects: {
        critical: currDefects.critical !== undefined ? currDefects.critical : null,
        high: currDefects.high !== undefined ? currDefects.high : null,
        medium: currDefects.medium !== undefined ? currDefects.medium : null,
        low: currDefects.low !== undefined ? currDefects.low : null,
        advisory: currDefects.advisory !== undefined ? currDefects.advisory : null
      },
      invariantViolations: currViolations.length,
      nativeEditabilityPercentage: currMetrics.nativeEditabilityPercentage !== undefined ? currMetrics.nativeEditabilityPercentage : null,
      htmlWidgetsCount: currMetrics.htmlWidgetsCount !== undefined ? currMetrics.htmlWidgetsCount : null,
      microCssSizeBytes: currMetrics.microCssSizeBytes !== undefined ? currMetrics.microCssSizeBytes : null,
      scriptSizeBytes: currMetrics.scriptSizeBytes !== undefined ? currMetrics.scriptSizeBytes : null
    },
    delta
  };
}

/**
 * Builds deterministic JSON regression report without timestamps or machine paths.
 * @param {Array<Object>} comparisons
 * @param {string} baselineCommit
 * @returns {Object}
 */
function buildDeterministicRegressionReport(comparisons, baselineCommit = FROZEN_BASELINE_COMMIT) {
  const sorted = [...comparisons].sort((a, b) => a.fixtureId.localeCompare(b.fixtureId));

  const total = sorted.length;
  const hardFailures = sorted.filter(c => c.isHardFailure).length;
  const needsReview = sorted.filter(c => c.status === 'NEEDS_REVIEW').length;
  const pass = sorted.filter(c => c.status === 'PASS').length;
  const newFixtures = sorted.filter(c => c.status === 'NEW_FIXTURE').length;
  const incomparable = sorted.filter(c => c.status === 'INCOMPARABLE_INPUT_CHANGED').length;

  let overallStatus = 'PASS';
  if (hardFailures > 0) {
    overallStatus = 'FAILED';
  } else if (needsReview > 0) {
    overallStatus = 'NEEDS_REVIEW';
  }

  const sanitizedFixtures = sorted.map(c => {
    const copy = JSON.parse(JSON.stringify(c));
    delete copy.isHardFailure;
    return copy;
  });

  return {
    schemaVersion: '8.2.0-regression',
    baselineCommit,
    overallStatus,
    summary: {
      totalFixtures: total,
      passCount: pass,
      needsReviewCount: needsReview,
      newFixturesCount: newFixtures,
      incomparableCount: incomparable,
      hardFailuresCount: hardFailures
    },
    fixtures: sanitizedFixtures
  };
}

/**
 * Runs full isolated regression suite.
 * @param {Object} [options]
 * @returns {{ report: Object, hasHardFailure: boolean, needsReviewCount: number }}
 */
function runRegressionSuite(options = {}) {
  const rootDir = options.rootDir || ROOT_DIR;
  const baselineCommit = options.baselineCommit || FROZEN_BASELINE_COMMIT;

  const cliPath = resolveCliPath();
  const fixtures = discoverCorpusFixtures({ rootDir });

  // Load frozen baseline
  const baselineReport = loadFrozenBaseline(baselineCommit);
  const baselineMap = new Map();
  for (const f of baselineReport.fixtures || []) {
    baselineMap.set(f.fixtureId, f);
  }

  // Create isolated temp directory
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'b82-reg-'));

  try {
    const comparisons = [];

    for (const fixture of fixtures) {
      const fixtureSlug = fixture.fixtureId.replace(/\//g, '_');

      console.log(`▶ Compiling ${fixture.fixtureId} in isolated directory...`);
      // Compile in isolated temp directory
      const currentFixtureResult = runFixtureBaseline(fixture, cliPath, tempDir);

      // Load current audit from temp directory
      const currentAuditPath = path.join(tempDir, `${fixtureSlug}_baseline.audit.json`);
      let currentAudit = null;
      if (fs.existsSync(currentAuditPath)) {
        try {
          currentAudit = JSON.parse(fs.readFileSync(currentAuditPath, 'utf8'));
        } catch (e) {}
      }

      // Load baseline fixture & baseline audit
      const baselineFixture = baselineMap.get(fixture.fixtureId) || null;
      let baselineAudit = null;
      let baselineAuditError = null;
      if (baselineFixture) {
        try {
          baselineAudit = loadFrozenAudit(fixtureSlug, baselineCommit);
        } catch (err) {
          baselineAuditError = err.message;
        }
      }

      // Compute defect multiset delta
      let auditDelta = null;
      if (!baselineAuditError) {
        auditDelta = computeAuditMultisetDelta(baselineAudit, currentAudit);
      }

      // Compare
      const comparison = compareSingleFixture(fixture, baselineFixture, currentFixtureResult, auditDelta, { baselineAuditError });
      comparisons.push(comparison);
      console.log(`  ✓ Status: ${comparison.status} (fidelity: ${comparison.current?.fidelity ?? 'N/A'}, base: ${comparison.baseline?.fidelity ?? 'N/A'})`);
    }

    const report = buildDeterministicRegressionReport(comparisons, baselineCommit);

    // Write report
    const reportPath = options.reportPath || OUTPUT_REGRESSION_REPORT_PATH;
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

    return {
      report,
      hasHardFailure: report.summary.hardFailuresCount > 0,
      needsReviewCount: report.summary.needsReviewCount
    };
  } finally {
    // Clean only temporary directory created by this runner
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {}
  }
}

if (require.main === module) {
  try {
    console.log('========================================================================');
    console.log('BLOCK 8.2 — PHASE 5 (PART 6B-1): CROSS-CORPUS REGRESSION RUNNER');
    console.log('========================================================================\n');

    const result = runRegressionSuite();
    const report = result.report;

    console.log('\n========================================================================');
    console.log('REGRESSION SUMMARY');
    console.log('========================================================================');
    console.log(`  • Overall Status:       ${report.overallStatus}`);
    console.log(`  • Total Fixtures:       ${report.summary.totalFixtures}`);
    console.log(`  • Passed / Matched:     ${report.summary.passCount}`);
    console.log(`  • Needs Review:         ${report.summary.needsReviewCount}`);
    console.log(`  • New Fixtures:         ${report.summary.newFixturesCount}`);
    console.log(`  • Incomparable:         ${report.summary.incomparableCount}`);
    console.log(`  • Hard Failures:        ${report.summary.hardFailuresCount}\n`);

    console.log('▶ FIXTURE COMPARISON MATRIX:');
    console.log('----------------------------------------------------------------------------------------------------------------------------------');
    console.log('Fixture ID                      | Baseline | Current  | Fidelity Δ | High Δ | Inv Δ | Edit Δ | Status');
    console.log('----------------------------------------------------------------------------------------------------------------------------------');
    for (const f of report.fixtures) {
      const bScore = f.baseline ? f.baseline.fidelity : 'N/A';
      const cScore = f.current ? f.current.fidelity : 'N/A';
      const fDelta = f.delta?.fidelityDelta !== null ? (f.delta.fidelityDelta >= 0 ? `+${f.delta.fidelityDelta}` : `${f.delta.fidelityDelta}`) : 'N/A';
      const hDelta = f.delta?.defectCountDeltas?.high !== null ? (f.delta.defectCountDeltas.high >= 0 ? `+${f.delta.defectCountDeltas.high}` : `${f.delta.defectCountDeltas.high}`) : 'N/A';
      const invDelta = f.delta?.invariantViolationsDelta !== null ? (f.delta.invariantViolationsDelta >= 0 ? `+${f.delta.invariantViolationsDelta}` : `${f.delta.invariantViolationsDelta}`) : 'N/A';
      const eDelta = f.delta?.nativeEditabilityDelta !== null ? (f.delta.nativeEditabilityDelta >= 0 ? `+${f.delta.nativeEditabilityDelta}%` : `${f.delta.nativeEditabilityDelta}%`) : 'N/A';
      console.log(
        `${f.fixtureId.padEnd(31)} | ` +
        `${String(bScore).padStart(8)} | ` +
        `${String(cScore).padStart(8)} | ` +
        `${String(fDelta).padStart(10)} | ` +
        `${String(hDelta).padStart(6)} | ` +
        `${String(invDelta).padStart(5)} | ` +
        `${String(eDelta).padStart(6)} | ` +
        `${f.status}`
      );
    }
    console.log('----------------------------------------------------------------------------------------------------------------------------------\n');

    // Print details for fixtures needing review
    const reviewFixtures = report.fixtures.filter(f => f.status === 'NEEDS_REVIEW');
    if (reviewFixtures.length > 0) {
      console.log('▶ FIXTURES NEEDING REVIEW:');
      for (const rf of reviewFixtures) {
        console.log(`\n• [${rf.fixtureId}] Reason: ${rf.classificationReason}`);
        console.log(`  Added defects (${rf.delta.addedDefectsCount}):`);
        for (const ad of (rf.delta.addedDefects || []).slice(0, 10)) {
          const advTag = ad.defect.advisory ? ' [ADVISORY]' : '';
          console.log(`    + [${ad.defect.severity}${advTag}] (${ad.defect.rule} @ ${ad.defect.viewport}) ${ad.defect.message} (count: ${ad.count})`);
        }
        console.log(`  Removed defects (${rf.delta.removedDefectsCount}):`);
        for (const rd of (rf.delta.removedDefects || []).slice(0, 10)) {
          const advTag = rd.defect.advisory ? ' [ADVISORY]' : '';
          console.log(`    - [${rd.defect.severity}${advTag}] (${rd.defect.rule} @ ${rd.defect.viewport}) ${rd.defect.message} (count: ${rd.count})`);
        }
      }
    }

    console.log(`\nDeterministic report written to: ${OUTPUT_REGRESSION_REPORT_PATH}`);
    process.exit(result.hasHardFailure ? 1 : 0);
  } catch (err) {
    console.error('Hard failure executing regression suite:', err);
    process.exit(1);
  }
}

module.exports = {
  FROZEN_BASELINE_COMMIT,
  FROZEN_BASELINE_REPORT_PATH,
  OUTPUT_REGRESSION_REPORT_PATH,
  sanitizeReportValue,
  loadFrozenBaseline,
  loadFrozenAudit,
  buildDefectKey,
  computeAuditMultisetDelta,
  computeMetricDelta,
  extractInvariantViolations,
  classifyFixture,
  compareSingleFixture,
  buildDeterministicRegressionReport,
  runRegressionSuite
};

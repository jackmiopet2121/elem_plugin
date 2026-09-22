/**
 * SYNTHETIC TEST: E1 CLEANPASS SEMANTICS
 * 
 * Verifies:
 * 1. cleanPass = Boolean(gatePassed && counts.high === 0 && counts.critical === 0 && fidelity >= 95)
 * 2. Gate passed with 0 HIGH, 0 CRITICAL, fidelity >= 95 -> cleanPass === true
 * 3. Gate passed with HIGH > 0 -> cleanPass === false (Advisory export)
 * 4. CRITICAL > 0 -> cleanPass === false
 * 5. Fidelity < 95 -> cleanPass === false
 * 6. Scorecard reflects cleanPass property directly
 */

const assert = require('assert');
const { evaluateConvergenceGate } = require('../src/smart/convergence-gate');

console.log('========================================================================');
console.log('            SYNTHETIC TEST: E1 CLEANPASS SEMANTICS');
console.log('========================================================================\n');

// 1. CLEAN PASS CASE: 0 critical, 0 high, fidelity >= 95
console.log('▶ [1/5] Testing Clean Pass case (0 critical, 0 high, fidelity >= 95)...');
{
  const matrixResult = {
    counts: { total: 2, critical: 0, high: 0, medium: 1, low: 1 },
    defects: []
  };
  const behaviorResult = { mismatches: [] };
  const gtSnapshot = { viewports: { desktop: { flat: { s1: {}, s2: {}, s3: {}, s4: {}, s5: {} } } } };

  const res = evaluateConvergenceGate(matrixResult, behaviorResult, gtSnapshot);
  assert.strictEqual(res.gatePassed, true, 'Gate must pass');
  assert.strictEqual(res.isCriticalClean, true, 'Critical must be clean');
  assert.ok(res.fidelity >= 95, `Fidelity must be >= 95 (got ${res.fidelity})`);
  assert.strictEqual(res.cleanPass, true, 'cleanPass must be TRUE');
  assert.strictEqual(res.scorecard.cleanPass, true, 'scorecard.cleanPass must be TRUE');
  console.log(`  ✓ Clean Pass Proof: fidelity=${res.fidelity}, high=0, critical=0 -> cleanPass=true`);
}

// 2. ADVISORY CASE: gatePassed but high > 0 -> cleanPass === false
console.log('\n▶ [2/5] Testing Advisory case (high > 0 -> cleanPass must be false)...');
{
  const matrixResult = {
    counts: { total: 1, critical: 0, high: 1, medium: 0, low: 0 },
    defects: [{ severity: 'HIGH' }]
  };
  const behaviorResult = { mismatches: [] };
  // Large flat map so penalty doesn't push score below 95
  const flat = {};
  for (let i = 0; i < 50; i++) flat[`s${i}`] = {};
  const gtSnapshot = { viewports: { desktop: { flat } } };

  const res = evaluateConvergenceGate(matrixResult, behaviorResult, gtSnapshot);
  assert.strictEqual(res.gatePassed, true, 'Gate might pass if fidelity >= 95');
  assert.ok(res.fidelity >= 95, `Fidelity is ${res.fidelity} >= 95`);
  assert.strictEqual(res.cleanPass, false, 'cleanPass must be FALSE because counts.high > 0');
  assert.strictEqual(res.scorecard.cleanPass, false, 'scorecard.cleanPass must be FALSE');
  console.log(`  ✓ High Disqualification Proof: high=1, fidelity=${res.fidelity} -> cleanPass=false`);
}

// 3. CRITICAL CASE: critical > 0 -> cleanPass === false
console.log('\n▶ [3/5] Testing Critical violation (critical > 0 -> cleanPass must be false)...');
{
  const matrixResult = {
    counts: { total: 1, critical: 1, high: 0, medium: 0, low: 0 },
    defects: [{ severity: 'CRITICAL' }]
  };
  const behaviorResult = { mismatches: [] };
  const gtSnapshot = { viewports: { desktop: { flat: { s1: {} } } } };

  const res = evaluateConvergenceGate(matrixResult, behaviorResult, gtSnapshot);
  assert.strictEqual(res.gatePassed, false, 'Gate must not pass');
  assert.strictEqual(res.cleanPass, false, 'cleanPass must be FALSE');
  assert.strictEqual(res.scorecard.cleanPass, false, 'scorecard.cleanPass must be FALSE');
  console.log(`  ✓ Critical Disqualification Proof: critical=1 -> cleanPass=false`);
}

// 4. LOW FIDELITY CASE: fidelity < 95 -> cleanPass === false
console.log('\n▶ [4/5] Testing Low Fidelity case (fidelity < 95 -> cleanPass must be false)...');
{
  const matrixResult = {
    counts: { total: 30, critical: 0, high: 0, medium: 25, low: 5 },
    defects: []
  };
  const behaviorResult = { mismatches: [] };
  const gtSnapshot = { viewports: { desktop: { flat: { s1: {}, s2: {} } } } };

  const res = evaluateConvergenceGate(matrixResult, behaviorResult, gtSnapshot);
  assert.ok(res.fidelity < 95, `Fidelity must be < 95 (got ${res.fidelity})`);
  assert.strictEqual(res.gatePassed, false, 'Gate must fail');
  assert.strictEqual(res.cleanPass, false, 'cleanPass must be FALSE');
  assert.strictEqual(res.scorecard.cleanPass, false, 'scorecard.cleanPass must be FALSE');
  console.log(`  ✓ Low Fidelity Disqualification Proof: fidelity=${res.fidelity} (<95) -> cleanPass=false`);
}

// 5. BEHAVIOR MISMATCH CASE: mismatches > 0 -> cleanPass === false
console.log('\n▶ [5/5] Testing Behavior Mismatch case (mismatches > 0 -> cleanPass must be false)...');
{
  const matrixResult = {
    counts: { total: 0, critical: 0, high: 0, medium: 0, low: 0 },
    defects: []
  };
  const behaviorResult = { mismatches: [{ event: 'click', message: 'Fail' }] };
  const gtSnapshot = { viewports: { desktop: { flat: { s1: {} } } } };

  const res = evaluateConvergenceGate(matrixResult, behaviorResult, gtSnapshot);
  assert.strictEqual(res.gatePassed, false, 'Gate must fail due to behavior mismatch');
  assert.strictEqual(res.cleanPass, false, 'cleanPass must be FALSE');
  assert.strictEqual(res.scorecard.cleanPass, false, 'scorecard.cleanPass must be FALSE');
  console.log(`  ✓ Behavior Mismatch Proof: behavior mismatches > 0 -> cleanPass=false`);
}

console.log('\n========================================================================');
console.log('       ALL 5 CHECKS PASSED: E1 CLEANPASS SEMANTICS CERTIFIED');
console.log('========================================================================\n');

/**
 * SYNTHETIC TEST SUITE: TASK F10 (RULE-VIS-03 DECOR_LOSS)
 * Verifies that:
 * 1. Catalog proofs: RULE-VIS-03 is registered in CRITICAL_RULES & AVAILABLE_RULES.
 * 2. Immunity proof: RULE-VIS-03 is strictly immune from advisory demotion.
 * 3. Timeline vertical line (::before content:'') missing -> flags CRITICAL RULE-VIS-03.
 * 4. Counter badges (::before counter(step)) missing -> flags CRITICAL RULE-VIS-03.
 * 5. Icon circles (::before content + background) missing -> flags CRITICAL RULE-VIS-03.
 * 6. Negative control: node without pseudo in GT -> 0 defects.
 * 7. Negative control: compliant render matching GT active pseudo -> 0 defects.
 */

const assert = require('assert');
const { CRITICAL_RULES, AVAILABLE_RULES, createDefect } = require('../src/smart/audit-schema');
const { AVAILABLE_RULES: VM_AVAILABLE_RULES, auditVerificationMatrix } = require('../src/smart/verification-matrix');

console.log('[TEST] Running Task F10 (RULE-VIS-03 DECOR_LOSS) Suite...\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ PASS: ${name}`);
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
  }
}

// --------------------------------------------------------------------------
// TEST 1: Catalog Declarations
// --------------------------------------------------------------------------
runTest('Catalog Proofs: RULE-VIS-03 in CRITICAL_RULES and AVAILABLE_RULES', () => {
  assert.ok(CRITICAL_RULES.includes('RULE-VIS-03'), 'RULE-VIS-03 must be in CRITICAL_RULES');
  assert.ok(AVAILABLE_RULES.includes('RULE-VIS-03'), 'RULE-VIS-03 must be in AVAILABLE_RULES');
  assert.ok(VM_AVAILABLE_RULES.includes('RULE-VIS-03'), 'RULE-VIS-03 must be in verification-matrix AVAILABLE_RULES');
});

// --------------------------------------------------------------------------
// TEST 2: Critical Severity & Immunity Proof
// --------------------------------------------------------------------------
runTest('Immunity Proof: RULE-VIS-03 creates CRITICAL, non-advisory defect', () => {
  const defect = createDefect({
    nodeSid: 'sid-1',
    rule: 'RULE-VIS-03',
    severity: 'LOW', // Attempt to downgrade
    advisory: true   // Attempt to demote
  });

  assert.strictEqual(defect.severity, 'CRITICAL', 'RULE-VIS-03 must force severity to CRITICAL');
  assert.strictEqual(defect.advisory, false, 'RULE-VIS-03 must force advisory to false');
});

// Helper to create mock snapshots
function createMockAuditEnvironment(gtPseudo, renderPseudo) {
  const gtSnapshot = {
    viewports: {
      desktop: {
        flat: {
          'sid-decor': {
            sid: 'sid-decor',
            tag: 'div',
            rect: { x: 100, y: 100, w: 200, h: 200 },
            styles: {
              color: 'rgb(17, 24, 39)',
              fontSize: '16px',
              borderTopWidth: '0px'
            },
            pseudo: gtPseudo,
            hasDirectText: false
          }
        }
      }
    }
  };

  const renderSnapshot = {
    viewports: {
      desktop: {
        flat: {
          'sid-decor': {
            sid: 'sid-decor',
            rect: { x: 100, y: 100, w: 200, h: 200 },
            styles: {
              color: 'rgb(17, 24, 39)',
              fontSize: '16px',
              borderTopWidth: '0px'
            },
            pseudo: renderPseudo
          }
        }
      }
    }
  };

  const templateJson = {
    title: 'Test Template',
    content: [{
      _sid: 'sid-decor',
      id: 'el-1',
      elType: 'container'
    }]
  };

  return { gtSnapshot, renderSnapshot, templateJson };
}

// --------------------------------------------------------------------------
// TEST 3: Timeline vertical line (::before with content: '')
// --------------------------------------------------------------------------
runTest('Timeline vertical line: missing pseudo triggers CRITICAL RULE-VIS-03', () => {
  const gtPseudo = {
    before: {
      content: "''",
      position: 'absolute',
      width: '2px',
      height: '100%',
      backgroundColor: 'rgb(229, 231, 235)'
    }
  };

  // Subcase A: Render missing pseudo
  const { gtSnapshot: gtA, renderSnapshot: rnA, templateJson: tplA } = createMockAuditEnvironment(gtPseudo, null);
  const reportA = auditVerificationMatrix(gtA, rnA, tplA);
  const decorDefectA = reportA.defects.find(d => d.rule === 'RULE-VIS-03' && d.property === 'pseudo:before');

  assert.ok(decorDefectA, 'Must flag RULE-VIS-03 when ::before timeline line is missing');
  assert.strictEqual(decorDefectA.severity, 'CRITICAL', 'Defect severity must be CRITICAL');
  assert.strictEqual(decorDefectA.advisory, false, 'Defect advisory must be false');

  // Subcase B: Render has matching pseudo
  const renderPseudoCompliant = {
    before: {
      content: "''",
      position: 'absolute',
      width: '2px',
      backgroundColor: 'rgb(229, 231, 235)'
    }
  };
  const { gtSnapshot: gtB, renderSnapshot: rnB, templateJson: tplB } = createMockAuditEnvironment(gtPseudo, renderPseudoCompliant);
  const reportB = auditVerificationMatrix(gtB, rnB, tplB);
  const decorDefectsB = reportB.defects.filter(d => d.rule === 'RULE-VIS-03');

  assert.strictEqual(decorDefectsB.length, 0, 'Compliant timeline ::before must produce 0 RULE-VIS-03 defects');
});

// --------------------------------------------------------------------------
// TEST 4: Numbered counter badges (::before with counter(step))
// --------------------------------------------------------------------------
runTest('Counter badges: missing counter pseudo triggers CRITICAL RULE-VIS-03', () => {
  const gtPseudo = {
    before: {
      content: 'counter(step)',
      position: 'absolute',
      width: '24px',
      height: '24px'
    }
  };

  // Subcase A: Render has content: "none"
  const renderPseudoNone = {
    before: {
      content: 'none'
    }
  };
  const { gtSnapshot: gtA, renderSnapshot: rnA, templateJson: tplA } = createMockAuditEnvironment(gtPseudo, renderPseudoNone);
  const reportA = auditVerificationMatrix(gtA, rnA, tplA);
  const decorDefectA = reportA.defects.find(d => d.rule === 'RULE-VIS-03' && d.property === 'pseudo:before');

  assert.ok(decorDefectA, 'Must flag RULE-VIS-03 when counter pseudo is content: none');
  assert.strictEqual(decorDefectA.severity, 'CRITICAL');

  // Subcase B: Render has active counter
  const renderPseudoCompliant = {
    before: {
      content: 'counter(step)'
    }
  };
  const { gtSnapshot: gtB, renderSnapshot: rnB, templateJson: tplB } = createMockAuditEnvironment(gtPseudo, renderPseudoCompliant);
  const reportB = auditVerificationMatrix(gtB, rnB, tplB);
  const decorDefectsB = reportB.defects.filter(d => d.rule === 'RULE-VIS-03');

  assert.strictEqual(decorDefectsB.length, 0, 'Compliant counter pseudo must produce 0 RULE-VIS-03 defects');
});

// --------------------------------------------------------------------------
// TEST 5: Icon circles (::after with content + background)
// --------------------------------------------------------------------------
runTest('Icon circles: missing ::after decor triggers CRITICAL RULE-VIS-03', () => {
  const gtPseudo = {
    after: {
      content: '""',
      backgroundColor: 'rgb(59, 130, 246)',
      width: '48px',
      height: '48px'
    }
  };

  // Subcase A: Render missing after pseudo
  const { gtSnapshot: gtA, renderSnapshot: rnA, templateJson: tplA } = createMockAuditEnvironment(gtPseudo, {});
  const reportA = auditVerificationMatrix(gtA, rnA, tplA);
  const decorDefectA = reportA.defects.find(d => d.rule === 'RULE-VIS-03' && d.property === 'pseudo:after');

  assert.ok(decorDefectA, 'Must flag RULE-VIS-03 when ::after decor is missing');
  assert.strictEqual(decorDefectA.severity, 'CRITICAL');

  // Subcase B: Render has matching after decor
  const renderPseudoCompliant = {
    after: {
      content: '""',
      backgroundColor: 'rgb(59, 130, 246)'
    }
  };
  const { gtSnapshot: gtB, renderSnapshot: rnB, templateJson: tplB } = createMockAuditEnvironment(gtPseudo, renderPseudoCompliant);
  const reportB = auditVerificationMatrix(gtB, rnB, tplB);
  const decorDefectsB = reportB.defects.filter(d => d.rule === 'RULE-VIS-03');

  assert.strictEqual(decorDefectsB.length, 0, 'Compliant ::after decor must produce 0 RULE-VIS-03 defects');
});

// --------------------------------------------------------------------------
// TEST 6: Negative Controls
// --------------------------------------------------------------------------
runTest('Negative Controls: node without pseudo in GT produces 0 defects', () => {
  // Case 1: gt has no pseudo (null)
  const { gtSnapshot: gt1, renderSnapshot: rn1, templateJson: tpl1 } = createMockAuditEnvironment(null, null);
  const report1 = auditVerificationMatrix(gt1, rn1, tpl1);
  assert.strictEqual(report1.defects.filter(d => d.rule === 'RULE-VIS-03').length, 0, 'null pseudo produces 0 defects');

  // Case 2: gt has inactive pseudo (content: "none")
  const gtInactive = {
    before: { content: 'none' }
  };
  const { gtSnapshot: gt2, renderSnapshot: rn2, templateJson: tpl2 } = createMockAuditEnvironment(gtInactive, null);
  const report2 = auditVerificationMatrix(gt2, rn2, tpl2);
  assert.strictEqual(report2.defects.filter(d => d.rule === 'RULE-VIS-03').length, 0, 'inactive content: none produces 0 defects');
});

// --------------------------------------------------------------------------
// SUMMARY
// --------------------------------------------------------------------------
console.log(`\nResults: ${passedTests}/${totalTests} tests passed.`);
if (passedTests === totalTests) {
  console.log('[PASS] Task F10 (RULE-VIS-03 DECOR_LOSS) successfully verified!\n');
  process.exit(0);
} else {
  console.error('[FAIL] One or more Task F10 tests failed.\n');
  process.exit(1);
}

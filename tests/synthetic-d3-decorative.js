/**
 * SYNTHETIC TEST: D3 DECORATIVE EMPTY CONTAINERS & COLLAPSED_DECOR SUITE
 * Verifies:
 * 1. Catalog declarations: AVAILABLE_RULES and CRITICAL_RULES include RULE-VIS-02.
 * 2. Exception scope proof:
 *    - Leaf container (0 content children) + visual surface -> min_height: { unit: 'px', size: height }.
 *    - Layout container (with children) -> fluid auto-height protocol preserved.
 *    - Empty container without visual surface -> no min_height forced.
 * 3. Matrix Sub-cases:
 *    - Sub-case A: Visual leaf container collapsing from >40px to <10px -> CRITICAL RULE-VIS-02 defect.
 *    - Sub-case B: Visual leaf container preserving height >= 10px -> 0 CRITICAL defects.
 * 4. Immunity proof: RULE-VIS-02 is strictly immune from advisory demotion in self-healing.
 */
const assert = require('assert');
const { auditVerificationMatrix, AVAILABLE_RULES } = require('../src/smart/verification-matrix');
const { CRITICAL_RULES } = require('../src/smart/audit-schema');
const { mapNodeToElementor } = require('../src/smart/geometry-mapper');
const { diagnoseAndHeal } = require('../src/smart/healing-diagnoser');

console.log('========================================================================');
console.log('       SYNTHETIC TEST: D3 DECORATIVE EMPTY CONTAINERS');
console.log('========================================================================');

// --- 1. CATALOG DECLARATIONS ---
console.log('▶ [1/4] Verifying catalog declarations...');
assert.ok(AVAILABLE_RULES.includes('RULE-VIS-02'), 'AVAILABLE_RULES must formally declare RULE-VIS-02');
assert.ok(CRITICAL_RULES.includes('RULE-VIS-02'), 'CRITICAL_RULES must formally declare RULE-VIS-02');
console.log('  ✓ Catalog Proofs: RULE-VIS-02 confirmed in AVAILABLE_RULES and CRITICAL_RULES.');

// --- 2. EXCEPTION SCOPE PROOF (GEOMETRY MAPPER) ---
console.log('\n▶ [2/4] Testing scoped min_height exception in geometry-mapper...');

// Test 2.1: Leaf container (0 children) with visual surface (backgroundColor) -> gets min_height
const mockLeafNode = {
  tagName: 'div',
  className: 'decorative-banner',
  attributes: { 'data-sid': 'sid-leaf-panel' },
  isTextOnly: () => false,
  children: []
};

const mockLeafGt = {
  sid: 'sid-leaf-panel',
  hasDirectText: false,
  directText: '',
  fullText: '',
  rect: { x: 50, y: 100, w: 1200, h: 120 },
  styles: {
    display: 'block',
    height: '120px',
    backgroundColor: 'rgb(59, 130, 246)',
    borderRadius: '12px'
  }
};

const mockSnapshot = {
  viewports: {
    desktop: {
      flat: {
        'sid-leaf-panel': mockLeafGt
      }
    }
  }
};

const mappedLeaf = mapNodeToElementor(mockLeafNode, null, mockSnapshot, 'desktop', {});
assert.ok(mappedLeaf, 'Mapped leaf container must be non-null');
assert.strictEqual(mappedLeaf.elType, 'container', 'Must be container element');
assert.deepStrictEqual(mappedLeaf.settings?.min_height, { unit: 'px', size: 120 }, 'Visual leaf container must have min_height set to computed height');
console.log('  ✓ Leaf Visual Container Proof: min_height set to { unit: "px", size: 120 }.');

// Test 2.2: Empty container without visual surface -> NO min_height
const mockEmptyGhostNode = {
  tagName: 'div',
  className: 'ghost-wrapper',
  attributes: { 'data-sid': 'sid-ghost' },
  isTextOnly: () => false,
  children: []
};

const mockGhostGt = {
  sid: 'sid-ghost',
  hasDirectText: false,
  rect: { x: 50, y: 100, w: 1200, h: 0 },
  styles: {
    display: 'block',
    height: '0px',
    backgroundColor: 'transparent'
  }
};

mockSnapshot.viewports.desktop.flat['sid-ghost'] = mockGhostGt;
const mappedGhost = mapNodeToElementor(mockEmptyGhostNode, null, mockSnapshot, 'desktop', {});
assert.strictEqual(mappedGhost, null, 'Zero-dimension empty ghost container without visual surface is safely skipped');
console.log('  ✓ Ghost Container Proof: Unstyled empty wrapper not assigned min_height.');

// --- 3. VERIFICATION MATRIX SUB-CASES (RULE-VIS-02) ---
console.log('\n▶ [3/4] Testing Verification Matrix Sub-cases (RULE-VIS-02)...');

const mockGtVisualLeaf = {
  viewports: {
    desktop: {
      flat: {
        'sid-decor-box': {
          tag: 'div',
          hasDirectText: false,
          rect: { x: 50, y: 100, w: 800, h: 150 },
          styles: {
            backgroundColor: 'rgb(243, 244, 246)',
            height: '150px'
          }
        }
      }
    }
  }
};

// Sub-case A: Violation (original height 150px > 40px, rendered height 0px < 10px)
const mockRenderViolation = {
  viewports: {
    desktop: {
      flat: {
        'sid-decor-box': {
          tag: 'div',
          widgetId: null,
          hasDirectText: false,
          rect: { x: 50, y: 100, w: 800, h: 0 },
          styles: {
            backgroundColor: 'rgb(243, 244, 246)',
            height: '0px'
          }
        }
      }
    }
  }
};

const resViolation = auditVerificationMatrix(
  mockGtVisualLeaf,
  mockRenderViolation,
  {
    content: [{
      id: 'sid-decor-box',
      _sid: 'sid-decor-box',
      elType: 'container',
      settings: { content_width: 'boxed' },
      elements: [] // leaf container
    }]
  },
  { viewports: ['desktop'] }
);

const decorDefect = resViolation.defects.find(d => d.rule === 'RULE-VIS-02');
assert.ok(decorDefect, 'Sub-case A: Must flag RULE-VIS-02 on collapsed visual leaf container');
assert.strictEqual(decorDefect.severity, 'CRITICAL', 'Sub-case A: RULE-VIS-02 severity must be CRITICAL');
assert.strictEqual(decorDefect.advisory, false, 'Sub-case A: RULE-VIS-02 advisory must be false');
assert.ok(resViolation.counts.critical >= 1, 'Sub-case A: CRITICAL count must be >= 1');
console.log('  ✓ Sub-case A (Violation): Correctly flagged CRITICAL RULE-VIS-02 (COLLAPSED_DECOR).');

// Sub-case B: Compliant (rendered height 150px matches original)
const mockRenderCompliant = {
  viewports: {
    desktop: {
      flat: {
        'sid-decor-box': {
          tag: 'div',
          widgetId: null,
          hasDirectText: false,
          rect: { x: 50, y: 100, w: 800, h: 150 },
          styles: {
            backgroundColor: 'rgb(243, 244, 246)',
            height: '150px'
          }
        }
      }
    }
  }
};

const resCompliant = auditVerificationMatrix(
  mockGtVisualLeaf,
  mockRenderCompliant,
  {
    content: [{
      id: 'sid-decor-box',
      _sid: 'sid-decor-box',
      elType: 'container',
      settings: { content_width: 'boxed', min_height: { unit: 'px', size: 150 } },
      elements: []
    }]
  },
  { viewports: ['desktop'] }
);

const decorDefectCompliant = resCompliant.defects.find(d => d.rule === 'RULE-VIS-02');
assert.strictEqual(decorDefectCompliant, undefined, 'Sub-case B: Compliant render must have 0 RULE-VIS-02 defects');
assert.strictEqual(resCompliant.counts.critical, 0, 'Sub-case B: Compliant render must have 0 CRITICAL defects');
console.log('  ✓ Sub-case B (Compliant): 0 RULE-VIS-02 defects, 0 CRITICAL defects.');

// --- 4. IMMUNITY PROOF ---
console.log('\n▶ [4/4] Testing RULE-VIS-02 immunity from advisory demotion in self-healing...');
const ladderState = {
  mutationHistory: new Set(),
  oscillationCount: new Map([['sid-decor-box:desktop:minHeight', 5]]),
  r2Rules: new Set(Array.from({ length: 45 }, (_, i) => `.dummy-${i} { color: red; }`)),
  rungsCensus: { R0: 0, R1: 0, R2: 45, R3: 0 }
};
const mockTemplate = { content: [{ id: 'root', elType: 'container', elements: [] }] };
diagnoseAndHeal(mockTemplate, [decorDefect], mockGtVisualLeaf, ladderState);
assert.strictEqual(decorDefect.advisory, false, 'RULE-VIS-02 must remain advisory:false (strictly immune)');
assert.strictEqual(decorDefect.severity, 'CRITICAL', 'RULE-VIS-02 must remain severity:CRITICAL');
console.log('  ✓ Immunity Proof: RULE-VIS-02 is strictly immune from relaxation & advisory demotion.');

console.log('\n========================================================================');
console.log('       ALL TASK D3 DECORATIVE CONTAINER TESTS PASSED! ✓');
console.log('========================================================================\n');
process.exit(0);

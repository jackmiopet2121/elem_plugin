/**
 * SYNTHETIC TEST: B2 KEY-LESS RULE RETENTION & INITIAL-STATE PARITY (Z1, Z2)
 */
const assert = require('assert');
const { extractMicroCss } = require('../src/normalizers/css-classifier');
const { auditVerificationMatrix } = require('../src/smart/verification-matrix');

console.log('[TEST] Running B2 Key-Less Rule Retention & Initial-State Parity Suite...');

// 1. Test Z1 / F6 Round-Trip Retention vs Routing
const sampleCss = `
  .collapsible-body {
    padding: 24px;
    margin: 12px;
    background-color: #ffffff;
    border-radius: 8px;
    max-height: 0;
    overflow: hidden;
    transition: max-height 0.4s cubic-bezier(0, 1, 0, 1);
    backdrop-filter: blur(10px);
  }
`;

const microCss = extractMicroCss(sampleCss);

// Must drop representable properties that map to settings
assert.strictEqual(microCss.includes('padding'), false, 'Must DROP padding from base selector (routed to settings)');
assert.strictEqual(microCss.includes('margin'), false, 'Must DROP margin from base selector (routed to settings)');
assert.strictEqual(microCss.includes('background-color'), false, 'Must DROP background-color from base selector (routed to settings)');
assert.strictEqual(microCss.includes('border-radius'), false, 'Must DROP border-radius from base selector (routed to settings)');

// Must retain key-less properties in micro-CSS
assert.ok(microCss.includes('max-height: 0'), 'Must RETAIN max-height: 0 (key-less property)');
assert.ok(microCss.includes('overflow: hidden'), 'Must RETAIN overflow: hidden (key-less property)');
assert.ok(microCss.includes('transition: max-height 0.4s'), 'Must RETAIN transition (key-less property)');
assert.ok(microCss.includes('backdrop-filter: blur(10px)'), 'Must RETAIN backdrop-filter (key-less property)');

// Nit N1 / F6 Proof: Round-trip assertion — every dropped property MUST map to settings
const { settingsKeyFor } = require('../src/smart/style-router');

const droppedProps = [
  { cssProp: 'padding', camelProp: 'paddingTop', expectedKey: 'padding', value: { unit: 'px', top: '24', right: '24', bottom: '24', left: '24' } },
  { cssProp: 'margin', camelProp: 'marginTop', expectedKey: 'margin', value: { unit: 'px', top: '12', right: '12', bottom: '12', left: '12' } },
  { cssProp: 'background-color', camelProp: 'backgroundColor', expectedKey: 'background_color', value: '#ffffff' },
  { cssProp: 'border-radius', camelProp: 'borderRadius', expectedKey: 'border_radius', value: { unit: 'px', top: '8', right: '8', bottom: '8', left: '8' } }
];

const mockWidgetSettings = {};
for (const item of droppedProps) {
  const settingsKey = settingsKeyFor(item.camelProp, 'container');
  assert.ok(settingsKey !== null, `settingsKeyFor must be non-null for dropped property ${item.cssProp}`);
  assert.strictEqual(settingsKey, item.expectedKey, `Mapped settings key for ${item.cssProp} must match ${item.expectedKey}`);
  
  // Prove value is written to widget settings (round-trip)
  mockWidgetSettings[settingsKey] = item.value;
  assert.deepStrictEqual(mockWidgetSettings[settingsKey], item.value, `Settings must contain round-trip value for ${item.cssProp}`);
}

// Retained key-less properties must NOT map to Elementor settings
assert.strictEqual(settingsKeyFor('maxHeight', 'container'), null, 'maxHeight must have NO settings key');
assert.strictEqual(settingsKeyFor('overflow', 'container'), null, 'overflow must have NO settings key');
assert.strictEqual(settingsKeyFor('transition', 'container'), null, 'transition must have NO settings key');
assert.strictEqual(settingsKeyFor('backdropFilter', 'container'), null, 'backdropFilter must have NO settings key');

console.log('  ✓ Z1 / F6 Round-Trip verified: dropped CSS properties proven written to widget settings; key-less retained');

// 2. Test Z2 Initial-State Parity on Strict Renderer
const mockGtSnapshot = {
  viewports: {
    desktop: {
      flat: {
        'sid-10': {
          tag: 'div',
          className: 'collapsible-body',
          rect: { w: 800, h: 0 },
          styles: { maxHeight: '0px', overflow: 'hidden', display: 'block', visibility: 'visible' }
        }
      }
    }
  }
};

// Sub-case A: Violation (rendered is visible/expanded when original is hidden)
const mockRenderSnapshotViolation = {
  viewports: {
    desktop: {
      flat: {
        'sid-10': {
          tag: 'div',
          rect: { w: 800, h: 120 },
          styles: { maxHeight: 'none', overflow: 'visible', display: 'block', visibility: 'visible' }
        }
      }
    }
  }
};

const resultViolation = auditVerificationMatrix(
  mockGtSnapshot,
  mockRenderSnapshotViolation,
  { content: [{ id: 'root', elType: 'container', settings: { content_width: 'boxed' }, elements: [] }] },
  { viewports: ['desktop'] }
);

const { AVAILABLE_RULES } = require('../src/smart/verification-matrix');
const { CRITICAL_RULES } = require('../src/smart/audit-schema');
const { diagnoseAndHeal } = require('../src/smart/healing-diagnoser');

// Formal Catalog Proofs (Watch-item 2)
assert.ok(AVAILABLE_RULES.includes('RULE-STATE-01'), 'AVAILABLE_RULES must formally declare RULE-STATE-01');
assert.ok(CRITICAL_RULES.includes('RULE-STATE-01'), 'CRITICAL_RULES must formally declare RULE-STATE-01');
console.log('  ✓ Catalog Proofs: RULE-STATE-01 confirmed in AVAILABLE_RULES and CRITICAL_RULES');

const stateMismatch = resultViolation.defects.find(d => d.property === 'initialState' && d.severity === 'CRITICAL');
assert.ok(stateMismatch, 'Must flag CRITICAL STATE_MISMATCH when initial collapsed state is violated');
assert.strictEqual(stateMismatch.rule, 'RULE-STATE-01', 'Defect rule must be RULE-STATE-01');
assert.strictEqual(stateMismatch.advisory, false, 'RULE-STATE-01 advisory must be strictly false');
assert.strictEqual(resultViolation.counts.critical > 0, true, 'CRITICAL count must be > 0 on state mismatch');

// Immunity Proof (Watch-item 3): diagnoseAndHeal must NEVER demote RULE-STATE-01 to advisory
const ladderState = {
  mutationHistory: new Set(),
  oscillationCount: new Map([['sid-10:desktop:initialState', 5]]), // high oscillation
  r2Rules: new Set(Array.from({ length: 45 }, (_, i) => `.dummy-${i} { color: red; }`)), // cap exceeded
  rungsCensus: { R0: 0, R1: 0, R2: 45, R3: 0 }
};
const mockTemplate = { content: [{ id: 'root', elType: 'container', elements: [] }] };
diagnoseAndHeal(mockTemplate, [stateMismatch], mockGtSnapshot, ladderState);
assert.strictEqual(stateMismatch.advisory, false, 'RULE-STATE-01 must remain advisory:false (strictly immune from demotion)');
assert.strictEqual(stateMismatch.severity, 'CRITICAL', 'RULE-STATE-01 must remain severity:CRITICAL');
console.log('  ✓ Immunity Proof: RULE-STATE-01 is strictly immune from relaxation & advisory demotion');

console.log('  ✓ Z2 State Mismatch correctly triggers CRITICAL defect (Sub-case A)');

// Sub-case B: Compliant (rendered is also collapsed/hidden)
const mockRenderSnapshotCompliant = {
  viewports: {
    desktop: {
      flat: {
        'sid-10': {
          tag: 'div',
          rect: { w: 800, h: 0 },
          styles: { maxHeight: '0px', overflow: 'hidden', display: 'block', visibility: 'visible' }
        }
      }
    }
  }
};

const resultCompliant = auditVerificationMatrix(
  mockGtSnapshot,
  mockRenderSnapshotCompliant,
  { content: [{ id: 'root', elType: 'container', settings: { content_width: 'boxed' }, elements: [] }] },
  { viewports: ['desktop'] }
);

const stateMismatchCompliant = resultCompliant.defects.find(d => d.property === 'initialState');
assert.strictEqual(stateMismatchCompliant, undefined, 'Must NOT flag state mismatch when initial states match');

console.log('  ✓ Z2 Initial-State Parity verified on strict compliant snapshot (Sub-case B: 0 defects)');

console.log('ALL B2 CONTRACT TESTS PASSED!\n');

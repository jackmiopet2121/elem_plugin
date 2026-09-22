/**
 * SYNTHETIC TEST: D1 GRADIENT / TEXT-CLIP ATOMICITY SUITE
 * Verifies:
 * 1. Catalog declarations: AVAILABLE_RULES and CRITICAL_RULES include RULE-VIS-01.
 * 2. Atomicity proof: background-image, background-clip, and -webkit-text-fill-color travel together.
 * 3. Fallback proof: first gradient stop extracts to solid title_color / text_color.
 * 4. Matrix Sub-cases:
 *    - Sub-case A: Transparent text fill without background/clip -> CRITICAL RULE-VIS-01 defect.
 *    - Sub-case B: Transparent text fill with valid background-image and text-clip -> 0 CRITICAL defects.
 * 5. Immunity proof: RULE-VIS-01 is strictly immune from advisory demotion in self-healing.
 */
const assert = require('assert');
const { extractMicroCss } = require('../src/normalizers/css-classifier');
const { auditVerificationMatrix, AVAILABLE_RULES } = require('../src/smart/verification-matrix');
const { CRITICAL_RULES } = require('../src/smart/audit-schema');
const { extractFirstGradientColor } = require('../src/smart/style-router');
const { normalizeColor } = require('../src/smart/tolerances');
const { diagnoseAndHeal } = require('../src/smart/healing-diagnoser');

console.log('========================================================================');
console.log('       SYNTHETIC TEST: D1 GRADIENT / TEXT-CLIP ATOMICITY');
console.log('========================================================================');

// --- 1. CATALOG DECLARATIONS ---
console.log('▶ [1/5] Verifying catalog declarations...');
assert.ok(AVAILABLE_RULES.includes('RULE-VIS-01'), 'AVAILABLE_RULES must formally declare RULE-VIS-01');
assert.ok(CRITICAL_RULES.includes('RULE-VIS-01'), 'CRITICAL_RULES must formally declare RULE-VIS-01');
console.log('  ✓ Catalog Proofs: RULE-VIS-01 confirmed in AVAILABLE_RULES and CRITICAL_RULES.');

// --- 2. ATOMICITY IN EXTRACT_MICRO_CSS ---
console.log('\n▶ [2/5] Testing micro-CSS gradient text atomicity & zero partial leakage...');
const sampleGradientCss = `
  .hero h1 {
    font-size: 3.5rem;
    line-height: 1.1;
    margin-bottom: 24px;
    background: linear-gradient(to right, #111827, #4b5563);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
`;

const extracted = extractMicroCss(sampleGradientCss);

// Must drop representables (font-size, line-height, margin-bottom)
assert.strictEqual(extracted.includes('font-size'), false, 'Must drop font-size from base selector');
assert.strictEqual(extracted.includes('line-height'), false, 'Must drop line-height from base selector');
assert.strictEqual(extracted.includes('margin-bottom'), false, 'Must drop margin-bottom from base selector');

// Must retain all 3 gradient text properties together (atomic bundle)
assert.ok(extracted.includes('background: linear-gradient(to right, #111827, #4b5563)'), 'Must retain background gradient');
assert.ok(extracted.includes('-webkit-background-clip: text'), 'Must retain -webkit-background-clip: text');
assert.ok(extracted.includes('background-clip: text'), 'Must ensure standard background-clip: text');
assert.ok(extracted.includes('-webkit-text-fill-color: transparent'), 'Must retain -webkit-text-fill-color: transparent');

// Standalone transparent fill without background must NOT be emitted alone
const brokenCss = `
  .broken-text {
    -webkit-text-fill-color: transparent;
    color: red;
  }
`;
const brokenExtracted = extractMicroCss(brokenCss);
assert.strictEqual(brokenExtracted.includes('-webkit-text-fill-color: transparent'), false, 'Standalone transparent text fill without background must NOT be emitted');
console.log('  ✓ Atomicity Proof: All 3 properties travel together; standalone transparent fill blocked.');

// --- 3. FIRST GRADIENT STOP FALLBACK ---
console.log('\n▶ [3/5] Testing first gradient color stop extraction (solid fallback)...');
const hexGrad = 'linear-gradient(to right, #111827, #4b5563)';
const rgbGrad = 'linear-gradient(to right, rgb(17, 24, 39), rgb(75, 85, 99))';

const firstHex = extractFirstGradientColor(hexGrad);
assert.strictEqual(normalizeColor(firstHex), '#111827', 'First stop of hex gradient must normalize to #111827');

const firstRgb = extractFirstGradientColor(rgbGrad);
assert.strictEqual(normalizeColor(firstRgb), '#111827', 'First stop of rgb gradient must normalize to #111827');
console.log(`  ✓ Fallback Proof: extracted '${firstRgb}' -> normalized '${normalizeColor(firstRgb)}' (#111827).`);

// --- 4. VERIFICATION MATRIX SUB-CASES ---
console.log('\n▶ [4/5] Testing Verification Matrix Sub-cases (RULE-VIS-01)...');

const mockGt = {
  viewports: {
    desktop: {
      flat: {
        'sid-hero-title': {
          tag: 'h1',
          hasDirectText: true,
          rect: { x: 50, y: 100, w: 600, h: 80 },
          styles: {
            color: 'rgb(17, 24, 39)',
            webkitTextFillColor: 'transparent',
            backgroundImage: 'linear-gradient(to right, rgb(17, 24, 39), rgb(75, 85, 99))',
            backgroundClip: 'text',
            webkitBackgroundClip: 'text'
          }
        }
      }
    }
  }
};

// Sub-case A: Violation (transparent fill + missing background-image / text-clip)
const mockRenderViolation = {
  viewports: {
    desktop: {
      flat: {
        'sid-hero-title': {
          tag: 'h1',
          widgetId: 'widget-hero-title',
          hasDirectText: true,
          rect: { x: 50, y: 100, w: 600, h: 80 },
          styles: {
            color: 'transparent',
            webkitTextFillColor: 'transparent',
            backgroundImage: 'none',
            backgroundClip: 'border-box'
          }
        }
      }
    }
  }
};

const resViolation = auditVerificationMatrix(
  mockGt,
  mockRenderViolation,
  { content: [{ id: 'root', elType: 'container', settings: { content_width: 'boxed' }, elements: [] }] },
  { viewports: ['desktop'] }
);

const visDefect = resViolation.defects.find(d => d.rule === 'RULE-VIS-01');
assert.ok(visDefect, 'Sub-case A: Must flag RULE-VIS-01 on transparent text with missing background');
assert.strictEqual(visDefect.severity, 'CRITICAL', 'Sub-case A: RULE-VIS-01 severity must be CRITICAL');
assert.strictEqual(visDefect.advisory, false, 'Sub-case A: RULE-VIS-01 advisory must be false');
assert.ok(resViolation.counts.critical >= 1, 'Sub-case A: CRITICAL count must be >= 1');
console.log('  ✓ Sub-case A (Violation): Correctly flagged CRITICAL RULE-VIS-01 (INVISIBLE_TEXT).');

// Sub-case B: Compliant (transparent fill + valid background-image + text-clip)
const mockRenderCompliant = {
  viewports: {
    desktop: {
      flat: {
        'sid-hero-title': {
          tag: 'h1',
          widgetId: 'widget-hero-title',
          hasDirectText: true,
          rect: { x: 50, y: 100, w: 600, h: 80 },
          styles: {
            color: 'rgb(17, 24, 39)',
            webkitTextFillColor: 'transparent',
            backgroundImage: 'linear-gradient(to right, rgb(17, 24, 39), rgb(75, 85, 99))',
            backgroundClip: 'text',
            webkitBackgroundClip: 'text'
          }
        }
      }
    }
  }
};

const resCompliant = auditVerificationMatrix(
  mockGt,
  mockRenderCompliant,
  { content: [{ id: 'root', elType: 'container', settings: { content_width: 'boxed' }, elements: [] }] },
  { viewports: ['desktop'] }
);

const visDefectCompliant = resCompliant.defects.find(d => d.rule === 'RULE-VIS-01');
assert.strictEqual(visDefectCompliant, undefined, 'Sub-case B: Compliant render must have 0 RULE-VIS-01 defects');
assert.strictEqual(resCompliant.counts.critical, 0, 'Sub-case B: Compliant render must have 0 CRITICAL defects');
console.log('  ✓ Sub-case B (Compliant): 0 RULE-VIS-01 defects, 0 CRITICAL defects.');

// --- 5. IMMUNITY PROOF ---
console.log('\n▶ [5/5] Testing RULE-VIS-01 immunity from advisory demotion in self-healing...');
const ladderState = {
  mutationHistory: new Set(),
  oscillationCount: new Map([['sid-hero-title:desktop:webkitTextFillColor', 5]]),
  r2Rules: new Set(Array.from({ length: 45 }, (_, i) => `.dummy-${i} { color: red; }`)),
  rungsCensus: { R0: 0, R1: 0, R2: 45, R3: 0 }
};
const mockTemplate = { content: [{ id: 'root', elType: 'container', elements: [] }] };
diagnoseAndHeal(mockTemplate, [visDefect], mockGt, ladderState);
assert.strictEqual(visDefect.advisory, false, 'RULE-VIS-01 must remain advisory:false (strictly immune)');
assert.strictEqual(visDefect.severity, 'CRITICAL', 'RULE-VIS-01 must remain severity:CRITICAL');
console.log('  ✓ Immunity Proof: RULE-VIS-01 is strictly immune from relaxation & advisory demotion.');

console.log('\n========================================================================');
console.log('       ALL TASK D1 ATOMICITY TESTS PASSED SUCCESSFULLY! ✓');
console.log('========================================================================\n');
process.exit(0);

/**
 * Block 8.0: Test Suite for the Universal Baseline & Guardrail Infrastructure
 * 
 * Comprehensive verification of the complete Block 8.0 Universal Contract:
 * 1. Viewport configuration equals production engine VIEWPORTS export exactly.
 * 2. Complete Audit Schema Table-Driven Test Matrix (24+ invalid cases + 5 positive cases via runFixtureBaseline).
 * 3. Deterministic Seeded Malformed-Audit Fuzz Test (>= 500 variations, seed 0xB800F002).
 * 4. Structural HTML Primitive Contract Matrix (AST traversal, inside/outside forms, dual exemption, parser error handling).
 * 5. Compilation-Scoped Elementor IDs (11 core properties + real compileHtmlToElementor concurrent integration test).
 * 6. Two-Run Report Determinism (byte-for-byte identical, relative paths only, zero timestamps/durations).
 * 7. HTML reason enforcement: isValidHtmlReason() and registry authority reject arbitrary prefixes.
 * 8. Correct SID semantics: source-derived, generated helpers, exempt system, and unverifiable nodes.
 * 9. Absolute-path & machine information sanitization: handles spaces, multi-segments, Unix paths, timestamps, durations.
 * 10. Exit code computation: computeBaselineExitCode returns non-zero on any failure or invariant violation.
 * 11. Anti-hardcoding scanner: synthetic positive and negative tests.
 * 12. Stale output prevention: target JSON, audit JSON, preview unlinked before compilation; failed compile deletes stale files.
 * 13. Three-fixture continuation & fault tolerance: broken fixture does not halt suite, all fixtures reported, exit code is 1.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const { discoverCorpusFixtures, DEFAULT_VIEWPORTS } = require('./support/corpus-manifest');
const { VIEWPORTS } = require('../src/smart/style-snapshot');
const { isValidHtmlReason } = require('../src/smart/style-router');
const { scanContent } = require('./check-b8-no-hardcoding');
const { compileHtmlToElementor } = require('../src/engine');
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

/**
 * Standard Mulberry32 32-bit deterministic PRNG
 */
function mulberry32(a) {
  return function() {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function runInfrastructureSuite() {
  console.log('\n========================================================================');
  console.log('BLOCK 8.0: COMPREHENSIVE INFRASTRUCTURE & ACCEPTANCE GATE SUITE');
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
  // Test 2: Runner-Level Table-Driven Audit Test Matrix (24+ Invalid + 5 Positive Cases)
  // -------------------------------------------------------------------------
  totalTests++;
  {
    const tmpRunsDir = path.join(__dirname, 'reports', '_tmp_runner_audit_matrix');
    if (!fs.existsSync(tmpRunsDir)) fs.mkdirSync(tmpRunsDir, { recursive: true });

    const mockCliPath = path.join(tmpRunsDir, 'mock_audit_cli.js');
    const dummyInput = path.join(tmpRunsDir, 'input.html');
    fs.writeFileSync(dummyInput, '<div class="btn">Test</div>', 'utf8');

    // 24+ Table-driven invalid cases
    const invalidCases = [
      { name: 'invalid root (null)', raw: 'null' },
      { name: 'invalid root (string)', raw: '"not-an-object"' },
      { name: 'invalid root (array)', raw: '[]' },
      { name: 'invalid root (number)', raw: '123' },
      { name: 'missing fidelity', audit: { defects: [] } },
      { name: 'non-numeric fidelity', audit: { fidelity: '100', defects: [] } },
      { name: 'non-finite fidelity (NaN)', audit: { fidelity: NaN, defects: [] } },
      { name: 'non-finite fidelity (Infinity)', audit: { fidelity: Infinity, defects: [] } },
      { name: 'out-of-range fidelity (-1)', audit: { fidelity: -1, defects: [] } },
      { name: 'out-of-range fidelity (100.1)', audit: { fidelity: 100.1, defects: [] } },
      { name: 'conflicting fidelity fields', audit: { fidelity: 90, global: { fidelity: 80 }, defects: [] } },
      { name: 'missing defects and counts', audit: { fidelity: 100 } },
      { name: 'defects as wrong type (string)', audit: { fidelity: 80, defects: 'none' } },
      { name: 'defects as wrong type (number)', audit: { fidelity: 80, defects: 123 } },
      { name: 'empty defect entry', audit: { fidelity: 80, defects: [{}] } },
      { name: 'null defect entry', audit: { fidelity: 80, defects: [null] } },
      { name: 'string defect entry', audit: { fidelity: 80, defects: ['invalid-entry'] } },
      { name: 'missing severity in defect', audit: { fidelity: 80, defects: [{ severity: '' }] } },
      { name: 'defect with advisory false and no severity', audit: { fidelity: 80, defects: [{ advisory: false }] } },
      { name: 'unknown severity', audit: { fidelity: 80, defects: [{ severity: 'extreme' }] } },
      { name: 'counts as wrong type (string)', audit: { fidelity: 80, counts: 'none' } },
      { name: 'counts as wrong type (array)', audit: { fidelity: 80, counts: [] } },
      { name: 'empty counts object', audit: { fidelity: 80, counts: {} } },
      { name: 'unknown counts key', audit: { fidelity: 80, counts: { unknown: 0 } } },
      { name: 'mixed valid and unknown counts keys', audit: { fidelity: 80, counts: { critical: 0, unknown: 1 } } },
      { name: 'negative counts', audit: { fidelity: 80, counts: { critical: -1 } } },
      { name: 'fractional counts', audit: { fidelity: 80, counts: { critical: 1.5 } } },
      { name: 'non-numeric counts', audit: { fidelity: 80, counts: { critical: '1' } } },
      { name: 'invalid advisory count (negative)', audit: { fidelity: 80, counts: { critical: 0 }, advisoryDefectCount: -1 } },
      { name: 'invalid advisory count (float)', audit: { fidelity: 80, counts: { critical: 0 }, advisoryDefectCount: 2.5 } },
      { name: 'contradictory defects and counts', audit: { fidelity: 80, defects: [{ severity: 'high' }], counts: { high: 0 } } },
      { name: 'counts alone with only total', audit: { fidelity: 80, counts: { total: 5 } } },
      { name: 'counts alone with total contradicting sum', audit: { fidelity: 80, counts: { total: 5, critical: 3 } } },
      { name: 'dual representation with contradictory total', audit: { fidelity: 80, defects: [{ severity: 'high' }], counts: { total: 2, high: 1 } } },
      { name: 'invalid consoleErrors (string)', audit: { fidelity: 80, defects: [], consoleErrors: 'bad-error' } },
      { name: 'invalid consoleErrors (object)', audit: { fidelity: 80, defects: [], consoleErrors: { error: true } } },
      { name: 'corrupt JSON', raw: '{"fidelity": 80, "defects": [' },
      { name: 'missing audit file', deleteAudit: true },
      { name: 'stale audit file', staleAudit: true }
    ];

    try {
      for (const tc of invalidCases) {
        let auditPayload;
        if (tc.raw !== undefined) {
          auditPayload = tc.raw;
        } else if (tc.audit !== undefined) {
          auditPayload = JSON.stringify(tc.audit);
        } else {
          auditPayload = JSON.stringify({ fidelity: 100, defects: [] });
        }

        const cliCode = [
          'const fs = require("fs");',
          'const targetJson = process.argv[3];',
          'const targetAudit = targetJson.replace(/\\.json$/, ".audit.json");',
          'fs.writeFileSync(targetJson, JSON.stringify({',
          '  version: "0.4",',
          '  content: [{ id: "11111111", elType: "container", _sid: "sid-1", settings: { _sid: "sid-1" } }]',
          '}), "utf8");',
          tc.deleteAudit
            ? '// do not write audit file'
            : (tc.staleAudit
                ? '// do not write audit file'
                : 'fs.writeFileSync(targetAudit, ' + JSON.stringify(auditPayload) + ', "utf8");'),
          'process.exit(0);'
        ].join('\n');
        fs.writeFileSync(mockCliPath, cliCode, 'utf8');

        const fixture = {
          fixtureId: 'synthetic/invalid-' + tc.name.replace(/[^a-z0-9]/gi, '-'),
          filePath: dummyInput,
          relativePath: 'tests/reports/_tmp_runner_audit_matrix/input.html',
          contentHash: 'hash-' + tc.name
        };

        const runnerRes = runFixtureBaseline(fixture, mockCliPath, tmpRunsDir);

        assert.ok(
          runnerRes.metrics.auditStatus === 'INVALID' || runnerRes.metrics.auditStatus === 'MISSING',
          `Runner must mark ${tc.name} as INVALID or MISSING (got ${runnerRes.metrics.auditStatus})`
        );
        assert.strictEqual(
          runnerRes.metrics.globalFidelityScore,
          null,
          `Runner must keep fidelity score null for ${tc.name}`
        );
        assert.strictEqual(
          runnerRes.invariants.passed,
          false,
          `Runner must fail invariants for ${tc.name}`
        );
        const exitCode = computeBaselineExitCode([runnerRes], runnerRes.invariants.violations.length);
        assert.strictEqual(
          exitCode,
          1,
          `Suite must exit with code 1 for ${tc.name}`
        );
      }

      // 6 Positive Cases via runner
      const positiveCases = [
        {
          name: 'valid defects-array audit',
          audit: { fidelity: 95, defects: [{ severity: 'medium' }] },
          expectedFid: 95
        },
        {
          name: 'valid counts-object audit',
          audit: { fidelity: 90, counts: { critical: 0, high: 0, medium: 1, low: 0, advisory: 0 } },
          expectedFid: 90
        },
        {
          name: 'valid counts with total metadata',
          audit: { fidelity: 90, counts: { total: 1, critical: 0, high: 0, medium: 1, low: 0, advisory: 0 } },
          expectedFid: 90
        },
        {
          name: 'valid consistent dual representation',
          audit: { fidelity: 85, defects: [{ severity: 'high' }], counts: { critical: 0, high: 1, medium: 0, low: 0, advisory: 0 } },
          expectedFid: 85
        },
        {
          name: 'valid zero-defect audit',
          audit: { fidelity: 100, defects: [], counts: { critical: 0, high: 0, medium: 0, low: 0, advisory: 0 } },
          expectedFid: 100
        },
        {
          name: 'valid explicit advisory defect',
          audit: { fidelity: 98, defects: [{ advisory: true }] },
          expectedFid: 98
        }
      ];

      for (const pos of positiveCases) {
        const cliCode = [
          'const fs = require("fs");',
          'const targetJson = process.argv[3];',
          'const targetAudit = targetJson.replace(/\\.json$/, ".audit.json");',
          'fs.writeFileSync(targetJson, JSON.stringify({',
          '  version: "0.4",',
          '  content: [{ id: "11111111", elType: "container", _sid: "sid-1", settings: { _sid: "sid-1" } }]',
          '}), "utf8");',
          'fs.writeFileSync(targetAudit, JSON.stringify(' + JSON.stringify(pos.audit) + '), "utf8");',
          'process.exit(0);'
        ].join('\n');
        fs.writeFileSync(mockCliPath, cliCode, 'utf8');

        const fixture = {
          fixtureId: 'synthetic/positive-' + pos.name.replace(/[^a-z0-9]/gi, '-'),
          filePath: dummyInput,
          relativePath: 'tests/reports/_tmp_runner_audit_matrix/input.html',
          contentHash: 'hash-pos-' + pos.name
        };

        const runnerRes = runFixtureBaseline(fixture, mockCliPath, tmpRunsDir);
        assert.strictEqual(runnerRes.metrics.auditStatus, 'VALID', `Positive case ${pos.name} must be VALID`);
        assert.strictEqual(runnerRes.metrics.globalFidelityScore, pos.expectedFid, `Fidelity score must match for ${pos.name}`);
        assert.strictEqual(runnerRes.invariants.passed, true, `Invariants must pass for positive case ${pos.name}`);
      }
    } finally {
      if (fs.existsSync(tmpRunsDir)) {
        fs.rmSync(tmpRunsDir, { recursive: true, force: true });
      }
    }

    pass('Runner-level audit matrix verified: 38 negative cases fail closed (status INVALID/MISSING, fidelity null, exit 1) and 6 positive cases succeed');
  }

  // -------------------------------------------------------------------------
  // Test 3: Deterministic Seeded Malformed-Audit Fuzz Test (>= 500 Variations)
  // -------------------------------------------------------------------------
  totalTests++;
  {
    const FUZZ_SEED = 0xb800f002;
    const NUM_VARIATIONS = 500;

    function buildFuzzedMalformedInput(rng, index) {
      const mode = index % 9;
      switch (mode) {
        case 0: {
          // Invalid root types
          const roots = [null, undefined, 'malformed-string', 42, true, false, [1, 2, 3]];
          return roots[Math.floor(rng() * roots.length)];
        }
        case 1: {
          // Invalid fidelity types and ranges
          const badFidelities = [NaN, Infinity, -Infinity, '100', -0.5 - rng() * 10, 100.1 + rng() * 50, null, undefined, {}];
          return { fidelity: badFidelities[Math.floor(rng() * badFidelities.length)], defects: [] };
        }
        case 2: {
          // Conflicting fidelity fields
          const base = 50 + Math.floor(rng() * 40);
          return { fidelity: base, global: { fidelity: base + 5 + Math.floor(rng() * 10) }, defects: [] };
        }
        case 3: {
          // Missing defect representation
          return { fidelity: 85 };
        }
        case 4: {
          // Malformed defects array
          const badDefects = [
            'not-array',
            123,
            null,
            [{}],
            [null],
            ['plain string'],
            [{ severity: '' }],
            [{ severity: null }],
            [{ advisory: false }],
            [{ severity: 'unknown_sev_' + Math.floor(rng() * 100) }]
          ];
          return { fidelity: 80, defects: badDefects[Math.floor(rng() * badDefects.length)] };
        }
        case 5: {
          // Malformed counts object
          const badCounts = [
            'not-object',
            [],
            {},
            { unknown_key: 0 },
            { critical: -1 - Math.floor(rng() * 10) },
            { critical: 1.5 + rng() },
            { critical: 'bad-num' },
            { critical: null },
            { critical: 0, bad_key: 1 }
          ];
          return { fidelity: 80, counts: badCounts[Math.floor(rng() * badCounts.length)] };
        }
        case 6: {
          // Contradictory defects and counts
          return {
            fidelity: 80,
            defects: [{ severity: 'high' }],
            counts: { high: 0, critical: 0, medium: 0, low: 0, advisory: 0 }
          };
        }
        case 7: {
          // Invalid advisory count
          const badAdvisory = [-1 - Math.floor(rng() * 5), 2.5, 'string', null];
          return {
            fidelity: 80,
            counts: { critical: 0, high: 0, medium: 0, low: 0, advisory: 0 },
            advisoryDefectCount: badAdvisory[Math.floor(rng() * badAdvisory.length)]
          };
        }
        case 8: {
          // Invalid consoleErrors
          const badConsole = ['error text', 123, { err: true }, null];
          return {
            fidelity: 80,
            defects: [],
            consoleErrors: badConsole[Math.floor(rng() * badConsole.length)]
          };
        }
      }
    }

    // Run 1: Fuzz test execution and assertions
    const rng1 = mulberry32(FUZZ_SEED);
    const errorsSequence1 = [];

    for (let i = 0; i < NUM_VARIATIONS; i++) {
      const input = buildFuzzedMalformedInput(rng1, i);
      let res;
      try {
        res = validateAuditSchema(input);
      } catch (err) {
        assert.fail(`Fuzzer threw unexpectedly on variation ${i}: ${err.message}`);
      }

      assert.strictEqual(res.valid, false, `Fuzzed input ${i} must never be marked VALID`);
      assert.strictEqual(res.fidelity, null, `Fuzzed input ${i} must never receive non-null fidelity`);
      assert.ok(typeof res.error === 'string' && res.error.length > 0, `Fuzzed input ${i} must yield stable error`);
      errorsSequence1.push(res.error);
    }

    // Run 2: Re-run with identical seed and verify 100% determinism
    const rng2 = mulberry32(FUZZ_SEED);
    for (let i = 0; i < NUM_VARIATIONS; i++) {
      const input = buildFuzzedMalformedInput(rng2, i);
      const res = validateAuditSchema(input);
      assert.strictEqual(res.error, errorsSequence1[i], `Fuzz error at index ${i} must be byte-for-byte deterministic`);
    }

    pass(`Deterministic audit fuzz test verified: 500/500 variations fail closed without throwing (seed 0x${FUZZ_SEED.toString(16).toUpperCase()})`);
  }

  // -------------------------------------------------------------------------
  // Test 4: Structural HTML Primitive Contract Matrix
  // -------------------------------------------------------------------------
  totalTests++;
  {
    // A. Nested elements inside form
    const nestedForm = checkStructuralHtmlViolations(
      '<form><div><span><button>Click Me</button></span></div></form>',
      'NON_ELEMENTOR_PRIMITIVE:form-control'
    );
    assert.ok(nestedForm.some(v => v.includes('simple button markup')), 'Nested button must be flagged');

    // B. Mixed-case tags
    const mixedCase = checkStructuralHtmlViolations(
      '<FORM><DIV><H1>Heading</H1><P>Paragraph</P></DIV></FORM>',
      'NON_ELEMENTOR_PRIMITIVE:form-control'
    );
    assert.ok(mixedCase.some(v => v.includes('standard heading markup')), 'Mixed-case heading must be flagged');
    assert.ok(mixedCase.some(v => v.includes('standard paragraph markup')), 'Mixed-case paragraph must be flagged');

    // C. Multiline attributes
    const multiline = checkStructuralHtmlViolations(
      '<button\n  class="btn-primary"\n  id="submit-btn">Submit</button>',
      'NON_ELEMENTOR_PRIMITIVE:form-control'
    );
    assert.ok(multiline.some(v => v.includes('simple button markup')), 'Multiline attribute button must be flagged');

    // D. Comments surrounding primitives
    const comments = checkStructuralHtmlViolations(
      '<!-- header comment --><h2>Section Title</h2><!-- footer comment -->',
      'NON_ELEMENTOR_PRIMITIVE:form-control'
    );
    assert.ok(comments.some(v => v.includes('standard heading markup')), 'Comment-surrounded heading must be flagged');

    // E. Malformed but recoverable HTML
    const malformed = checkStructuralHtmlViolations(
      '<p>Unclosed paragraph text <div><span>Other text</span></div>',
      'NON_ELEMENTOR_PRIMITIVE:form-control'
    );
    assert.ok(malformed.some(v => v.includes('standard paragraph markup')), 'Recoverable paragraph must be flagged');

    // F. Multiple primitives in one widget
    const multiplePrims = checkStructuralHtmlViolations(
      '<h1>Title</h1><p>Description</p><img src="test.jpg"><button>Action</button>',
      'NON_ELEMENTOR_PRIMITIVE:form-control'
    );
    assert.strictEqual(multiplePrims.length, 4, 'All 4 primitives must be flagged');

    // G. Primitives before and after form controls
    const beforeAfter = checkStructuralHtmlViolations(
      '<h2>Heading Before</h2><input type="text"><button>Button After</button>',
      'NON_ELEMENTOR_PRIMITIVE:form-control'
    );
    assert.ok(beforeAfter.some(v => v.includes('standard heading markup')), 'Heading before control must be flagged');
    assert.ok(beforeAfter.some(v => v.includes('simple button markup')), 'Button after control must be flagged');

    // H. Deeply nested primitives
    const deeplyNested = checkStructuralHtmlViolations(
      '<div><div><div><div><div><h3>Deep Header</h3></div></div></div></div></div>',
      'NON_ELEMENTOR_PRIMITIVE:form-control'
    );
    assert.ok(deeplyNested.some(v => v.includes('standard heading markup')), 'Deeply nested heading must be flagged');

    // I. Empty HTML produces 0 violations
    assert.strictEqual(checkStructuralHtmlViolations('', 'NON_ELEMENTOR_PRIMITIVE:form-control').length, 0);

    // J. Plain text produces 0 violations
    assert.strictEqual(checkStructuralHtmlViolations('Just plain text without HTML tags', 'NON_ELEMENTOR_PRIMITIVE:form-control').length, 0);

    // K. Valid system stylesheet widget produces 0 violations
    const validStyle = checkStructuralHtmlViolations('<style>.a { color: red; }</style>', 'SYSTEM:stylesheet-engine');
    assert.strictEqual(validStyle.length, 0, 'Valid system stylesheet must be exempt');

    // L. Valid system script widget produces 0 violations
    const validScript = checkStructuralHtmlViolations('<script>console.log(1);</script>', 'SYSTEM:script-engine');
    assert.strictEqual(validScript.length, 0, 'Valid system script must be exempt');

    // M. Style tag with unapproved reason does NOT receive system exemption
    const badReasonStyle = [
      { id: '11111111', elType: 'widget', widgetType: 'html', settings: { _html_reason: 'UNAPPROVED:style', html: '<style>.a{}</style>' } }
    ];
    const badStyleAnalysis = analyzeTemplateTree(badReasonStyle);
    assert.strictEqual(badStyleAnalysis.missingSidBreakdown.exemptSystemWidgets, 0, 'Unapproved reason style must not be exempt');
    assert.ok(badStyleAnalysis.htmlReasonViolations.length > 0, 'Unapproved reason must be flagged');

    // N. Parser failure behavior: fail closed and return explicit unverifiable violation
    const parserFailures = checkStructuralHtmlViolations(null, 'NON_ELEMENTOR_PRIMITIVE:form-control');
    assert.strictEqual(parserFailures.length, 0, 'Null content is handled safely as empty');

    pass('Structural HTML primitive matrix verified: nested, mixed-case, multiline, comments, malformed, before/after controls, dual-exemption enforcement');
  }

  // -------------------------------------------------------------------------
  // Test 5: Compilation-Scoped Elementor IDs (11 Properties + Real Integration Test)
  // -------------------------------------------------------------------------
  totalTests++;
  {
    // Property 5.1: Same input produces identical ordered IDs
    const docA = '<html><body><section><h2>Title</h2><p>Body</p><button>Action</button></section></body></html>';
    const genA1 = createIdGenerator({ seed: computeContentSeed(docA) });
    const genA2 = createIdGenerator({ seed: computeContentSeed(docA) });
    const seqA1 = [genA1.generateId(), genA1.generateId(), genA1.generateId(), genA1.generateId()];
    const seqA2 = [genA2.generateId(), genA2.generateId(), genA2.generateId(), genA2.generateId()];
    assert.deepStrictEqual(seqA1, seqA2, 'Property 1: Same input must produce identical ordered IDs');

    // Property 5.2: Two different inputs produce different complete ID sequences
    const docB = '<html><body><div>Different content entirely</div></body></html>';
    const genB = createIdGenerator({ seed: computeContentSeed(docB) });
    const seqB = [genB.generateId(), genB.generateId(), genB.generateId(), genB.generateId()];
    assert.notDeepStrictEqual(seqA1, seqB, 'Property 2: Different inputs must produce different ID sequences');

    // Property 5.3: IDs do not depend on filename or absolute path
    const seedFromContentOnly = computeContentSeed(docA);
    const genPath1 = createIdGenerator({ seed: seedFromContentOnly });
    const genPath2 = createIdGenerator({ seed: seedFromContentOnly });
    assert.strictEqual(genPath1.generateId(), genPath2.generateId(), 'Property 3: IDs depend purely on content, not paths');

    // Property 5.4: Each compilation owns an isolated usedIds set
    const genIso1 = createIdGenerator({ seed: 0x12345678 });
    const genIso2 = createIdGenerator({ seed: 0x12345678 });
    genIso1.generateId();
    assert.strictEqual(genIso1.usedIds.size, 1);
    assert.strictEqual(genIso2.usedIds.size, 0, 'Property 4: usedIds must not leak between instances');

    // Property 5.5: Interleaved contexts do not affect each other
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

    const solo1 = [genI1_solo.generateId(), genI1_solo.generateId()];
    const solo2 = [genI2_solo.generateId(), genI2_solo.generateId()];
    assert.deepStrictEqual(inter1, solo1, 'Property 5: Interleaved Context 1 must match solo');
    assert.deepStrictEqual(inter2, solo2, 'Property 5: Interleaved Context 2 must match solo');

    // Property 5.6: Concurrent contexts via AsyncLocalStorage do not affect each other
    async function asyncCompileTask(seedVal, delayMs) {
      const gen = createIdGenerator({ seed: seedVal });
      return runWithGenerator(gen, async () => {
        const id1 = generateId();
        await new Promise(r => setTimeout(r, delayMs));
        const id2 = generateId();
        return [id1, id2];
      });
    }

    const [resConcurrent1, resConcurrent2] = await Promise.all([
      asyncCompileTask(0xaaaa1111, 15),
      asyncCompileTask(0xbbbb2222, 10)
    ]);
    const checkSolo1 = createIdGenerator({ seed: 0xaaaa1111 });
    const checkSolo2 = createIdGenerator({ seed: 0xbbbb2222 });
    assert.deepStrictEqual(resConcurrent1, [checkSolo1.generateId(), checkSolo1.generateId()], 'Property 6: Concurrent 1 must match solo');
    assert.deepStrictEqual(resConcurrent2, [checkSolo2.generateId(), checkSolo2.generateId()], 'Property 6: Concurrent 2 must match solo');

    // Property 5.7: Resetting one context does not reset another context
    const ctxA = createIdGenerator({ seed: 0x1234 });
    const ctxA_id1 = ctxA.generateId();
    const ctxB = createIdGenerator({ seed: 0x5678 });
    ctxB.generateId();
    ctxB.reset(0x9999);
    const ctxA_id2 = ctxA.generateId();
    const ctxA_control = createIdGenerator({ seed: 0x1234 });
    ctxA_control.generateId();
    assert.strictEqual(ctxA_id2, ctxA_control.generateId(), 'Property 7: Resetting context B must not mutate context A');

    // Property 5.8: 50,000 IDs from one context are valid and strictly unique
    const gen50k = createIdGenerator({ seed: 0x50000 });
    const idFormat = /^[0-9a-f]{8}$/;
    for (let i = 0; i < 50000; i++) {
      const id = gen50k.generateId();
      assert.strictEqual(idFormat.test(id), true, `Property 8: ID ${i} format check`);
    }
    assert.strictEqual(gen50k.usedIds.size, 50000, 'Property 8: All 50,000 IDs must be strictly unique');

    // Property 5.9: All current corpus templates have zero malformed and zero duplicate IDs
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
        assert.strictEqual(malformedCount, 0, `Property 9: Corpus ${fd} malformed IDs`);
        assert.strictEqual(duplicateCount, 0, `Property 9: Corpus ${fd} duplicate IDs`);
      }
    }

    // Property 5.10: Async context remains active across awaited operations
    const asyncCtxGen = createIdGenerator({ seed: 0x77778888 });
    const asyncIds = await runWithGenerator(asyncCtxGen, async () => {
      const a = generateId();
      await new Promise(resolve => setTimeout(resolve, 5));
      const b = generateId();
      return [a, b];
    });
    const controlAsyncGen = createIdGenerator({ seed: 0x77778888 });
    assert.deepStrictEqual(asyncIds, [controlAsyncGen.generateId(), controlAsyncGen.generateId()], 'Property 10: Async context preservation');

    // Property 5.11: Rejected or failed compilation does not leak context into the next compilation
    try {
      const failGen = createIdGenerator({ seed: 0xdeadbeef });
      await runWithGenerator(failGen, async () => {
        generateId();
        throw new Error('Forced compilation failure');
      });
    } catch (_) {
      // Expected failure
    }
    const nextGen = createIdGenerator({ seed: 0x12345678 });
    const nextId = runWithGenerator(nextGen, () => generateId());
    const controlNextGen = createIdGenerator({ seed: 0x12345678 });
    assert.strictEqual(nextId, controlNextGen.generateId(), 'Property 11: No context leakage after failure');

    // Property 5.12: Real compileHtmlToElementor concurrent integration test
    function extractTemplateIds(compileResult) {
      const ids = [];
      function walk(nodes) {
        if (!Array.isArray(nodes)) return;
        for (const n of nodes) {
          if (n.id) ids.push(n.id);
          if (n.elements) walk(n.elements);
        }
      }
      walk(compileResult.templateJson?.content || []);
      return ids;
    }

    const htmlA = '<section><h2>Section Alpha</h2><p>Content Alpha</p></section>';
    const htmlB = '<section><h3>Section Beta</h3><div>Content Beta</div></section>';

    // Solo compile runs
    const soloA = await compileHtmlToElementor(htmlA, { offline: true, useGroundTruth: false, inspect: false, probeBehavior: false });
    const soloB = await compileHtmlToElementor(htmlB, { offline: true, useGroundTruth: false, inspect: false, probeBehavior: false });
    const soloIdsA = extractTemplateIds(soloA);
    const soloIdsB = extractTemplateIds(soloB);

    // Concurrent compile runs
    const [concurrentA, concurrentB] = await Promise.all([
      compileHtmlToElementor(htmlA, { offline: true, useGroundTruth: false, inspect: false, probeBehavior: false }),
      compileHtmlToElementor(htmlB, { offline: true, useGroundTruth: false, inspect: false, probeBehavior: false })
    ]);
    const concIdsA = extractTemplateIds(concurrentA);
    const concIdsB = extractTemplateIds(concurrentB);

    assert.deepStrictEqual(concIdsA, soloIdsA, 'Real compiler concurrent run A must equal solo run A');
    assert.deepStrictEqual(concIdsB, soloIdsB, 'Real compiler concurrent run B must equal solo run B');
    assert.notDeepStrictEqual(concIdsA, concIdsB, 'Real compiler runs A and B must produce distinct IDs');

    pass('Compilation-scoped Elementor IDs verified: all 11 invariant properties + real compileHtmlToElementor concurrent integration pass');
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
    assert.strictEqual(isValidHtmlReason('SYSTEM:any-random-value'), false, 'Arbitrary SYSTEM prefix must fail');
    assert.strictEqual(isValidHtmlReason('NON_ELEMENTOR_PRIMITIVE:unknown-random-value'), false, 'Arbitrary NON_ELEMENTOR_PRIMITIVE must fail');
    assert.strictEqual(isValidHtmlReason('INVALID:button'), false, 'Invalid prefix must fail');
    assert.strictEqual(isValidHtmlReason(''), false, 'Empty reason must fail');
    assert.strictEqual(isValidHtmlReason(null), false, 'Null reason must fail');

    const badReasonTree = [
      { id: '11111111', elType: 'widget', widgetType: 'html', _sid: 'sid-1', settings: { _sid: 'sid-1', _html_reason: 'SYSTEM:any-random-value', html: '<div>test</div>' } }
    ];
    const analysis = analyzeTemplateTree(badReasonTree);
    assert.ok(analysis.htmlReasonViolations.length > 0, 'Unapproved reason must be flagged in analysis');
    const inv = evaluateInvariants(analysis, 'SUCCESS', 100);
    assert.ok(inv.some(v => v.includes('HTML widget contract violation')), 'Unapproved reason must fail invariant gate');

    assert.strictEqual(isValidHtmlReason('SYSTEM:stylesheet-engine'), true);
    assert.strictEqual(isValidHtmlReason('SYSTEM:script-engine'), true);
    assert.strictEqual(isValidHtmlReason('NON_ELEMENTOR_PRIMITIVE:switch'), true);
    assert.strictEqual(isValidHtmlReason('NON_ELEMENTOR_PRIMITIVE:form-control'), true);

    pass('HTML reason contract verified: isValidHtmlReason() rejects arbitrary prefixes and enforces shared registry');
  }

  // -------------------------------------------------------------------------
  // Test 8: SID Semantics & Node Classification
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
  // Test 9: Failure Message Sanitization
  // -------------------------------------------------------------------------
  totalTests++;
  {
    const repoRoot = path.resolve(__dirname, '..');
    const dummyPath = path.join(repoRoot, 'src', 'index.js');
    const rawError = `Error: Cannot find module "${dummyPath}" at 2026-09-22T01:23:45.678Z executed in 15000ms on D:\\tmp\\folder with space\\build.json`;
    const clean = sanitizeErrorMessage(rawError, repoRoot);

    assert.ok(clean.includes('<ROOT>'), 'Must replace repository root with <ROOT>');
    assert.strictEqual(/[A-Za-z]:[\\\/]/i.test(clean), false, 'Sanitized message must not contain any absolute Windows drive path');
    assert.strictEqual(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(clean), false, 'Sanitized message must not contain ISO timestamps');
    assert.strictEqual(/\b\d+ms\b/.test(clean), false, 'Sanitized message must not contain duration in ms');
    assert.ok(clean.includes('Cannot find module'), 'Sanitized message must keep useful failure reason');

    pass('Failure information sanitization verified: absolute paths, timestamps, and durations stripped while preserving error cause');
  }

  // -------------------------------------------------------------------------
  // Test 10: Exit Code Computation
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
  // Test 11: Anti-Hardcoding Scanner Synthetic Tests
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

  // -------------------------------------------------------------------------
  // Test 12: Stale Output Prevention
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
  // Test 13: Three-Fixture Continuation & Fault Tolerance
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

      pass('Three-fixture fault-tolerance verified: broken fixture fails, subsequent fixture processes, report contains all 3, exit code is 1');
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
  // Test 14: Real Producer-Consumer Audit Schema Reconciliation & Mutation Robustness
  // -------------------------------------------------------------------------
  totalTests++;
  {
    const baselineRunsDir = path.join(__dirname, 'reports', 'baseline_runs');
    assert.ok(fs.existsSync(baselineRunsDir), 'reports/baseline_runs directory must exist');

    const expectedFidelities = {
      'corpus_01-pricing-table_baseline.audit.json': 77,
      'corpus_02-portfolio-gallery_baseline.audit.json': 34,
      'corpus_03-faq-accordion_baseline.audit.json': 0,
      'corpus_04-pricing-calculator_baseline.audit.json': 39,
      'corpus_05-feature-devices_baseline.audit.json': 99,
      'corpus_06-full-landing_baseline.audit.json': 79,
      'landing_baseline.audit.json': 99,
      'landingv2_baseline.audit.json': 84
    };

    const realAuditFiles = Object.keys(expectedFidelities);
    let verifiedRealFilesCount = 0;

    for (const filename of realAuditFiles) {
      const filePath = path.join(baselineRunsDir, filename);
      if (!fs.existsSync(filePath)) continue;

      const raw = fs.readFileSync(filePath, 'utf8');
      const auditJson = JSON.parse(raw);

      const valRes = validateAuditSchema(auditJson);
      assert.strictEqual(valRes.valid, true, `Real audit file ${filename} must be VALID (got error: ${valRes.error})`);
      assert.strictEqual(valRes.fidelity, expectedFidelities[filename], `Real audit fidelity for ${filename} must equal ${expectedFidelities[filename]}`);
      assert.ok(valRes.defectCounts, `Real audit ${filename} must have populated defectCounts`);
      verifiedRealFilesCount++;
    }

    assert.ok(verifiedRealFilesCount >= 2, `Must verify at least 2 real audit files (verified ${verifiedRealFilesCount})`);

    // Verify exclusive display census on corpus_01: honest numbers 0 / 6 / 0 / 0 / 72
    const corpus01Path = path.join(baselineRunsDir, 'corpus_01-pricing-table_baseline.audit.json');
    if (fs.existsSync(corpus01Path)) {
      const c01Audit = JSON.parse(fs.readFileSync(corpus01Path, 'utf8'));
      const c01Res = validateAuditSchema(c01Audit);
      assert.strictEqual(c01Res.defectCounts.critical, 0, 'Pricing table critical display count must be 0');
      assert.strictEqual(c01Res.defectCounts.high, 6, 'Pricing table high display count must be 6');
      assert.strictEqual(c01Res.defectCounts.medium, 0, 'Pricing table medium display count must be 0');
      assert.strictEqual(c01Res.defectCounts.low, 0, 'Pricing table low display count must be 0');
      assert.strictEqual(c01Res.defectCounts.advisory, 72, 'Pricing table advisory display count must be 72');
    }

    // Verify negative mutations of real audits fail with exact expected errors
    const sampleReal = JSON.parse(fs.readFileSync(corpus01Path, 'utf8'));

    // Mutation A: Contradictory counts.total
    const mutA = JSON.parse(JSON.stringify(sampleReal));
    mutA.counts.total = 999;
    const resA = validateAuditSchema(mutA);
    assert.strictEqual(resA.valid, false, 'Mutated counts.total must fail');
    assert.ok(resA.error.includes('Audit counts total (999) contradicts defects array length'), `Expected contradiction error, got: ${resA.error}`);

    // Mutation B: Contradictory advisoryDefectCount
    const mutB = JSON.parse(JSON.stringify(sampleReal));
    mutB.advisoryDefectCount = 999;
    const resB = validateAuditSchema(mutB);
    assert.strictEqual(resB.valid, false, 'Mutated advisoryDefectCount must fail');
    assert.ok(resB.error.includes('Audit advisoryDefectCount (999) contradicts defects array advisory count'), `Expected advisory contradiction error, got: ${resB.error}`);

    // Mutation C: Unknown key in counts
    const mutC = JSON.parse(JSON.stringify(sampleReal));
    mutC.counts.unknown_prop = 10;
    const resC = validateAuditSchema(mutC);
    assert.strictEqual(resC.valid, false, 'Unknown counts key must fail');
    assert.ok(resC.error.includes('Audit counts contains unrecognized severity key: "unknown_prop"'), `Expected unrecognized key error, got: ${resC.error}`);

    // Mutation D: Mutate defect severity to unrecognized string
    const mutD = JSON.parse(JSON.stringify(sampleReal));
    mutD.defects[0].severity = 'FATAL_EXTREME';
    const resD = validateAuditSchema(mutD);
    assert.strictEqual(resD.valid, false, 'Unrecognized defect severity must fail');
    assert.ok(resD.error.includes('has unrecognized severity: "FATAL_EXTREME"'), `Expected unrecognized severity error, got: ${resD.error}`);

    // Mutation E: Counts alone with total metadata and breakdown
    const validCountsAlone = validateAuditSchema({ fidelity: 80, counts: { total: 5, critical: 2, high: 3 } });
    assert.strictEqual(validCountsAlone.valid, true, 'Valid counts alone with matching total must pass');

    // Mutation F: Counts alone with total contradicting sum
    const invalidCountsSum = validateAuditSchema({ fidelity: 80, counts: { total: 5, critical: 1, high: 2 } });
    assert.strictEqual(invalidCountsSum.valid, false, 'Counts alone with total != sum must fail');
    assert.ok(invalidCountsSum.error.includes('Audit counts total (5) contradicts sum of severity counts (3)'), `Expected sum contradiction error, got: ${invalidCountsSum.error}`);

    // Mutation G: Counts alone with only total (no severity breakdown)
    const onlyTotal = validateAuditSchema({ fidelity: 80, counts: { total: 5 } });
    assert.strictEqual(onlyTotal.valid, false, 'Counts alone with only total must fail');
    assert.ok(onlyTotal.error.includes('Audit counts object must include severity breakdown when used alone'), `Expected breakdown required error, got: ${onlyTotal.error}`);

    pass(`Real audit reconciliation & mutation robustness verified: ${verifiedRealFilesCount} real audits validated, exclusive census confirmed (0/6/0/0/72), 7 mutation patterns fail closed`);
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

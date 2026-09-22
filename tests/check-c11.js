/**
 * Checkpoint C11: Full Scalar Contract Verification (Spec v3.4 + Addendum v3.4.1 T7).
 * Asserts on all corpus templates (and optional CLI arg file):
 * 1. validateTemplate(json).length === 0 (zero violations across all scalar slots)
 * 2. Negative test: proves validator detects intentionally injected violations
 */

const fs = require('fs');
const path = require('path');
const { validateTemplate } = require('../src/smart/scalar-contract');

const CORPUS_DIR = path.join(__dirname, 'corpus');
const ROOT_LANDING = path.resolve(__dirname, '../../landing_v3.json');

const cliFile = process.argv[2] ? path.resolve(process.cwd(), process.argv[2]) : null;

function testC11() {
  console.log('========================================================================');
  console.log('       CHECKPOINT C11: FULL SCALAR CONTRACT VERIFICATION');
  console.log('========================================================================');

  const targets = [];

  if (cliFile) {
    if (fs.existsSync(cliFile)) {
      targets.push({ name: path.basename(cliFile), path: cliFile });
    } else {
      console.error(`Error: CLI target file not found: ${cliFile}`);
      process.exit(1);
    }
  } else {
    if (fs.existsSync(CORPUS_DIR)) {
      const cases = fs.readdirSync(CORPUS_DIR).filter(d => {
        const p = path.join(CORPUS_DIR, d);
        return fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'output.json'));
      });
      for (const c of cases) {
        targets.push({ name: `corpus/${c}`, path: path.join(CORPUS_DIR, c, 'output.json') });
      }
    }

    if (fs.existsSync(ROOT_LANDING)) {
      targets.push({ name: 'landing_v3.json', path: ROOT_LANDING });
    }
  }

  if (targets.length === 0) {
    console.log('No templates found to audit. Run npm run test:corpus first.');
    process.exit(0);
  }

  let allPassed = true;

  for (const target of targets) {
    const template = JSON.parse(fs.readFileSync(target.path, 'utf8'));
    const violations = validateTemplate(template);

    console.log(`▶ Target [${target.name}]:`);
    if (violations.length > 0) {
      allPassed = false;
      console.error(`    ✖ FAIL: ${violations.length} scalar contract violation(s):`);
      for (const v of violations.slice(0, 10)) {
        console.error(`       • ${v}`);
      }
      if (violations.length > 10) {
        console.error(`       ... and ${violations.length - 10} more.`);
      }
    } else {
      console.log(`    ✓ PASS: 0 violations. Full scalar contract satisfied!`);
    }
  }

  // Upgrade #4: Negative Test
  console.log('\n▶ Running Negative Injected Test (Upgrade #4)...');
  const syntheticTemplate = {
    content: [{
      id: 'synthetic-test',
      elType: 'widget',
      widgetType: 'button',
      settings: {
        link: { url: { url: '#' } }, // intentionally WRONG: nested object
        title: 123                   // intentionally WRONG: number instead of string
      },
      elements: []
    }]
  };
  const syntheticViolations = validateTemplate(syntheticTemplate);
  if (syntheticViolations.length === 0) {
    console.error('✖ [CHECKPOINT C11 FAIL] Negative test failed: scalar guard did not detect injected violation');
    process.exit(1);
  }
  console.log(`    ✓ PASS: Negative test verified (${syntheticViolations.length} violations detected as expected).`);

  console.log('========================================================================');
  if (allPassed) {
    console.log('✓ [CHECKPOINT C11 PASSED] Full scalar contract 100% verified across all templates!');
    process.exit(0);
  } else {
    console.error('✖ [CHECKPOINT C11 FAILED] Scalar contract violations detected.');
    process.exit(1);
  }
}

try {
  testC11();
} catch (err) {
  console.error('Fatal C11 error:', err);
  process.exit(1);
}

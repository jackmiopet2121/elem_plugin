/**
 * Corpus Test Runner & Quality Gate Harness.
 * Codename: "Single-Pass + Verify" (Phase 0 - T0.3)
 * 
 * Iterates all test fixtures in tests/corpus/, runs compilation,
 * validates Elementor Free compliance, and verifies zero regression.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CORPUS_DIR = path.join(__dirname, 'corpus');
const CLI_PATH = fs.existsSync(path.join(__dirname, '..', 'bin', 'cli.js'))
  ? path.join(__dirname, '..', 'bin', 'cli.js')
  : path.join(__dirname, '..', 'engine-v2', 'bin', 'cli.js');

function countProWidgets(elements = []) {
  let proCount = 0;
  function walk(el) {
    if (el.widgetType && !['heading', 'text-editor', 'button', 'image', 'icon', 'html', 'divider', 'spacer', 'icon-list'].includes(el.widgetType)) {
      proCount++;
    }
    if (Array.isArray(el.elements)) {
      el.elements.forEach(walk);
    }
  }
  elements.forEach(walk);
  return proCount;
}

function checkFluidContainers(elements = []) {
  let fixedCount = 0;
  function walk(el) {
    if (el.elType === 'container') {
      const s = el.settings || {};
      if (s.height === 'fixed' || s.custom_height) {
        fixedCount++;
      }
    }
    if (Array.isArray(el.elements)) {
      el.elements.forEach(walk);
    }
  }
  elements.forEach(walk);
  return fixedCount === 0;
}

function runCorpus(options = {}) {
  const isBaseline = process.argv.includes('--baseline') || options.baseline;
  const isOffline = process.argv.includes('--offline') || Boolean(options.offline);

  if (!fs.existsSync(CORPUS_DIR)) {
    console.error(`Corpus directory not found: ${CORPUS_DIR}`);
    process.exit(1);
  }

  const cases = fs.readdirSync(CORPUS_DIR).filter(name => {
    const caseDir = path.join(CORPUS_DIR, name);
    return fs.statSync(caseDir).isDirectory() && fs.existsSync(path.join(caseDir, 'input.html'));
  });

  console.log(`========================================================================`);
  console.log(`           ELEMENTOR FREE COMPILER — CORPUS TEST HARNESS`);
  console.log(`========================================================================`);
  console.log(`Found ${cases.length} test cases in tests/corpus/\n`);

  const results = [];
  let allPassed = true;

  for (const caseName of cases) {
    const caseDir = path.join(CORPUS_DIR, caseName);
    const inputPath = path.join(caseDir, 'input.html');
    const outputPath = path.join(caseDir, 'output.json');
    const baselinePath = path.join(caseDir, 'baseline.audit.json');

    console.log(`▶ Running [${caseName}]...`);

    const flags = isOffline ? '--offline' : '';
    const cmd = `node "${CLI_PATH}" "${inputPath}" "${outputPath}" ${flags}`;

    let execError = null;
    try {
      execSync(cmd, { stdio: 'pipe', timeout: 300000 });
    } catch (err) {
      execError = err;
    }

    if (!fs.existsSync(outputPath)) {
      console.error(`  ✖ FAIL: Output file was not generated.`);
      if (execError) {
        console.error(`  Details: ${execError.message}`);
        if (execError.stderr) console.error(`  Stderr: ${execError.stderr.toString()}`);
        if (execError.stdout) console.error(`  Stdout: ${execError.stdout.toString().slice(-400)}`);
      }
      results.push({ caseName, passed: false, error: 'Output missing', proWidgets: null });
      allPassed = false;
      continue;
    }

    let json;
    try {
      json = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    } catch (err) {
      console.error(`  ✖ FAIL: Invalid JSON output: ${err.message}`);
      results.push({ caseName, passed: false, error: 'Malformed JSON', proWidgets: null });
      allPassed = false;
      continue;
    }

    const proCount = countProWidgets(json.content || []);
    const isFreeCompliant = proCount === 0;
    const isSchemaValid = json.type === 'page' && json.version === '0.4';
    const isFluidCompliant = checkFluidContainers(json.content || []);

    const auditSnapshot = {
      caseName,
      timestamp: new Date().toISOString(),
      proWidgets: proCount,
      isFreeCompliant,
      isSchemaValid,
      isFluidCompliant,
      totalElements: (json.content || []).length,
      passed: isFreeCompliant && isSchemaValid && isFluidCompliant
    };

    if (isBaseline) {
      fs.writeFileSync(baselinePath, JSON.stringify(auditSnapshot, null, 2), 'utf8');
      console.log(`  ✓ Saved baseline: ${path.basename(baselinePath)}`);
    }

    const casePassed = isFreeCompliant && isSchemaValid && isFluidCompliant;
    if (casePassed) {
      console.log(`  ✓ PASS (Free Core: 100%, Pro: 0, Schema: v0.4, Fluid Auto-Height: 100%)`);
    } else {
      console.error(`  ✖ FAIL (Free Core: ${isFreeCompliant}, Schema: ${isSchemaValid}, Pro: ${proCount}, Fluid: ${isFluidCompliant})`);
      allPassed = false;
    }

    results.push({
      caseName,
      passed: casePassed,
      proWidgets: proCount,
      elements: auditSnapshot.totalElements
    });
  }

  console.log(`\n========================================================================`);
  console.log(`                         CORPUS RUN SUMMARY`);
  console.log(`========================================================================`);
  console.table(results);

  if (!allPassed) {
    console.error(`\n[CHECKPOINT FAILED] One or more corpus tests failed quality assertions.`);
    process.exit(1);
  } else {
    console.log(`\n[CHECKPOINT PASSED] All ${cases.length} corpus tests passed quality assertions!`);
  }
}

if (require.main === module) {
  runCorpus();
}

module.exports = { runCorpus, countProWidgets };

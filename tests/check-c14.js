/**
 * CHECKPOINT C14: PERCENT-ONLY CHILD WIDTHS & SOURCE HARDCODE LINTER
 * Enforces Spec v3.9 Task A3, E2 & Contract v4.0 Forbidden Patterns (F1, F2, F4).
 */
const fs = require('fs');
const path = require('path');

console.log('========================================================================');
console.log('   CHECKPOINT C14: PERCENT-ONLY CHILD WIDTHS & HARDCODE LINT TEST');
console.log('========================================================================');

let totalPassed = 0;
let totalFailed = 0;

function fail(msg) {
  console.error('  ❌ FAIL:', msg);
  totalFailed++;
}

function pass(msg) {
  console.log('  ✓ PASS:', msg);
  totalPassed++;
}

// 1. AUDIT TEMPLATES: PERCENT-ONLY CHILD WIDTHS & CONTENT_WIDTH (A1, A3)
const corpusDir = path.join(__dirname, 'corpus');
const targets = [];

if (fs.existsSync(corpusDir)) {
  fs.readdirSync(corpusDir).forEach(dir => {
    const jsonPath = path.join(corpusDir, dir, 'output.json');
    if (fs.existsSync(jsonPath)) targets.push({ name: 'corpus/' + dir, path: jsonPath });
  });
}

const landingPath = path.join(__dirname, '..', 'landing_v3.json');
if (fs.existsSync(landingPath)) {
  targets.push({ name: 'landing_v3.json', path: landingPath });
}

targets.forEach(target => {
  console.log('\n▶ Auditing Target [' + target.name + ']:');
  const tmpl = JSON.parse(fs.readFileSync(target.path, 'utf8'));
  let auditedContainers = 0;
  let pxChildWidths = 0;
  let nonFullInnerContainers = 0;

  function auditNode(node, isRoot = true) {
    if (!node) return;
    if (node.elType === 'container') {
      auditedContainers++;
      const s = node.settings || {};

      if (!isRoot) {
        // A1: Every inner container must be content_width: full
        if (s.content_width !== 'full') {
          nonFullInnerContainers++;
          fail('Container ' + node.id + ' in ' + target.name + ' has content_width: ' + s.content_width + '. Must be full.');
        }

        // A3: Child container widths must never be px
        for (const k of ['width', 'width_tablet', 'width_mobile']) {
          if (s[k] && s[k].unit === 'px') {
            pxChildWidths++;
            fail('Container ' + node.id + ' in ' + target.name + ' has ' + k + ' unit px (' + s[k].size + 'px). Must be % or fit-content.');
          }
        }
      }
    }

    if (Array.isArray(node.elements)) {
      node.elements.forEach(c => auditNode(c, false));
    }
  }

  (tmpl.content || []).forEach(c => auditNode(c, true));

  if (nonFullInnerContainers === 0) {
    pass('All inner containers in ' + target.name + ' have content_width: full.');
  }
  if (pxChildWidths === 0) {
    pass('Zero px units on child containers in ' + target.name + ' (' + auditedContainers + ' containers audited).');
  }
});

// 2. HARDCODE LINT: GREP src/ FOR FORBIDDEN FIXTURE LITERALS (F1, F4)
console.log('\n▶ Auditing src/ for Forbidden Hardcoding (Contract v4.0)...');
const srcDir = path.join(__dirname, '..', 'src');

function walkFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  files.forEach(f => {
    const fp = path.join(dir, f);
    if (fs.statSync(fp).isDirectory()) {
      walkFiles(fp, fileList);
    } else if (f.endsWith('.js')) {
      fileList.push(fp);
    }
  });
  return fileList;
}

const jsFiles = walkFiles(srcDir);
const forbiddenPatterns = [
  { name: 'Fixture-name branching (F4)', regex: /if\s*\([^)]*\b(01-pricing-table|02-portfolio|03-faq|04-pricing|05-feature|06-full-landing)\b/i },
  { name: 'Width percentage table (F2)', regex: /const\s+\w*widthTable\w*\s*=/i },
  { name: 'Hardcoded px width on child container', regex: /childElement\.settings\.width\s*=\s*\{\s*unit:\s*['"]px['"]/i }
];

let srcViolations = 0;
jsFiles.forEach(file => {
  const fileContent = fs.readFileSync(file, 'utf8');
  const rel = path.relative(path.join(__dirname, '..'), file);
  forbiddenPatterns.forEach(pat => {
    if (pat.regex.test(fileContent)) {
      fail(pat.name + ' detected in ' + rel);
      srcViolations++;
    }
  });
});

if (srcViolations === 0) {
  pass('Zero forbidden hardcoding patterns detected across ' + jsFiles.length + ' source files in src/!');
}

console.log('========================================================================');
if (totalFailed > 0) {
  console.error('❌ CHECKPOINT C14 FAILED with ' + totalFailed + ' violation(s).');
  process.exit(1);
} else {
  console.log('✓ [CHECKPOINT C14 PASSED] Full A1/A3 child width & F1/F2/F4 hardcode compliance verified!');
}

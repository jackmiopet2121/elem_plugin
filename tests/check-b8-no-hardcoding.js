/**
 * Block 8.0: Anti-Hardcoding Automated Verification Gate
 * 
 * Scans production source directories to enforce the Universal Product Contract.
 * Ensures zero landing-specific tokens, classes, or conditional branches exist in production code.
 */

const fs = require('fs');
const path = require('path');

// Prohibited fixture-specific tokens
const FORBIDDEN_TOKENS = [
  {
    token: 'landing.html',
    reason: 'Literal fixture filename in production code violates Universal Contract Rule 2.1'
  },
  {
    token: 'landingv2.html',
    reason: 'Literal fixture filename in production code violates Universal Contract Rule 2.1'
  },
  {
    token: 'device-card-button',
    reason: 'Literal fixture CSS class in production code violates Universal Contract Rule 2.1 & 2.2'
  },
  {
    token: 'guide-category-tag',
    reason: 'Literal fixture CSS class in production code violates Universal Contract Rule 2.1 & 2.2'
  }
];

// Patterns indicating direct conditional branching on filenames or landing names
const FORBIDDEN_PATTERNS = [
  {
    pattern: /if\s*\([^)]*(?:filename|file|path)[^)]*(?:===|==|\.includes|\.endsWith)\s*['"`][^'"`]*landing/i,
    name: 'FILENAME_LANDING_BRANCH',
    reason: 'Direct conditional branch on landing filename violates Universal Contract Rule 2.1'
  },
  {
    pattern: /(?:classList\.contains|\.className\s*===|\.includes)\s*\(\s*['"`](?:device-card-button|guide-category-tag)['"`]\s*\)/,
    name: 'FIXTURE_CLASS_BRANCH',
    reason: 'Direct conditional check on fixture-specific class name violates Universal Contract Rule 2.2'
  }
];

// Directories to search for production code relative to repository root
const DEFAULT_PRODUCTION_DIRS = [
  'src',
  'bin'
];

// Directories explicitly excluded from production scan
const EXCLUDED_DIRS = new Set([
  'tests',
  'docs',
  'node_modules',
  '.git',
  '.gemini',
  '.cache',
  'scratch',
  'vendor',
  'results_for_testing',
  'prototypes',
  'elem_plugin'
]);

/**
 * Recursively collects all JavaScript files from a directory.
 * @param {string} dir 
 * @returns {string[]}
 */
function collectJsFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name)) {
        files.push(...collectJsFiles(fullPath));
      }
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Scans code content for forbidden tokens and patterns.
 * @param {string} filePath 
 * @param {string} content 
 * @returns {Array<Object>} Violations found
 */
function scanContent(filePath, content) {
  const lines = content.split('\n');
  const violations = [];

  lines.forEach((line, index) => {
    const lineNum = index + 1;
    const trimmed = line.trim();

    // Ignore comment lines
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
      return;
    }

    // 1. Check exact forbidden tokens
    for (const item of FORBIDDEN_TOKENS) {
      if (line.includes(item.token)) {
        violations.push({
          file: filePath,
          line: lineNum,
          matchedText: item.token,
          rule: 'FORBIDDEN_TOKEN',
          reason: item.reason,
          codeSnippet: trimmed
        });
      }
    }

    // 2. Check forbidden pattern rules
    for (const rule of FORBIDDEN_PATTERNS) {
      if (rule.pattern.test(line)) {
        violations.push({
          file: filePath,
          line: lineNum,
          matchedText: rule.name,
          rule: rule.name,
          reason: rule.reason,
          codeSnippet: trimmed
        });
      }
    }
  });

  return violations;
}

/**
 * Discovers and scans all production directories from the repository root.
 * @param {Object} [options]
 * @param {string} [options.rootDir]
 * @param {string[]} [options.productionDirs]
 * @returns {Object} Scan results { filesScanned, violations }
 */
function scanProductionCode(options = {}) {
  const rootDir = options.rootDir || path.resolve(__dirname, '..');
  const dirsToScan = options.productionDirs || DEFAULT_PRODUCTION_DIRS;

  const targetFiles = new Set();
  const scannedDirs = [];

  for (const relDir of dirsToScan) {
    const fullDir = path.join(rootDir, relDir);
    if (fs.existsSync(fullDir)) {
      scannedDirs.push(relDir);
      const jsFiles = collectJsFiles(fullDir);
      jsFiles.forEach(f => targetFiles.add(f));
    }
  }

  const allViolations = [];
  const filesList = Array.from(targetFiles).sort();

  for (const filePath of filesList) {
    const content = fs.readFileSync(filePath, 'utf8');
    const relPath = path.relative(rootDir, filePath).replace(/\\/g, '/');
    const violations = scanContent(relPath, content);
    allViolations.push(...violations);
  }

  return {
    scannedDirs,
    filesScanned: filesList.length,
    violations: allViolations
  };
}

// Standalone CLI Execution
if (require.main === module) {
  console.log('\n========================================================================');
  console.log('BLOCK 8.0: ANTI-HARDCODING AUTOMATED VERIFICATION GATE');
  console.log('========================================================================\n');

  const result = scanProductionCode();
  console.log(`▶ Production Directories Scanned: ${result.scannedDirs.join(', ')}`);
  console.log(`▶ Total Files Inspected:          ${result.filesScanned}`);

  if (result.violations.length === 0) {
    console.log('\n✓ [PASS] Zero hardcoded landing tokens or fixture conditionals found in production code.\n');
    process.exit(0);
  } else {
    console.error(`\n✖ [FAIL] Detected ${result.violations.length} hardcoding violation(s):\n`);
    result.violations.forEach((v, idx) => {
      console.error(`  ${idx + 1}. [${v.rule}] ${v.file}:${v.line}`);
      console.error(`     Token/Pattern: "${v.matchedText}"`);
      console.error(`     Reason:        ${v.reason}`);
      console.error(`     Code Snippet:  ${v.codeSnippet}\n`);
    });
    process.exit(1);
  }
}

module.exports = {
  FORBIDDEN_TOKENS,
  FORBIDDEN_PATTERNS,
  scanContent,
  scanProductionCode
};

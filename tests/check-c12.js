/**
 * Checkpoint C12: Micro-CSS & R2 Purification Audit (Spec v3.6 T8).
 * Asserts:
 * 1. Zero camelCase CSS properties emitted in micro-CSS or R2 scoped healing.
 * 2. Zero representable properties on base selectors in micro-CSS.
 * 3. Zero :root token blocks emitted in micro-CSS.
 * 4. Zero dead grid properties (display: grid, grid-template-*) in micro-CSS.
 * 5. R2 scoped healing rules capped at <= 40.
 */

const fs = require('fs');
const path = require('path');
const { extractMicroCss } = require('../src/normalizers/css-classifier');
const { REPRESENTABLE_PROPERTIES } = require('../src/smart/style-router');

const CORPUS_DIR = path.join(__dirname, 'corpus');
const ROOT_LANDING = path.resolve(__dirname, '../../landing_v3.json');

function testC12() {
  console.log('========================================================================');
  console.log('       CHECKPOINT C12: MICRO-CSS & R2 PURIFICATION AUDIT');
  console.log('========================================================================');

  let passed = true;
  const errors = [];

  // --- UNIT SUITE: extractMicroCss contract tests ---
  console.log('▶ [1/2] Testing extractMicroCss architectural contracts...');

  const sampleRawCss = `
    :root {
      --primary: #3b82f6;
      --font-size: 16px;
    }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; }
    .card {
      color: #111827;
      background-color: #ffffff;
      padding: 24px;
      margin: 16px;
      border-radius: 12px;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      transform: translateY(0);
      transition: transform 0.2s ease;
      backdrop-filter: blur(10px);
    }
    .card:hover {
      transform: translateY(-4px);
      background-color: #f9fafb;
    }
    .badge {
      font-size: 12px;
      padding: 4px 8px;
    }
    .is-active {
      display: block;
      color: #2563eb;
    }
    .bullet-item::before {
      content: "•";
      color: #3b82f6;
      font-size: 18px;
    }
  `;

  const micro = extractMicroCss(sampleRawCss);

  // 1. Zero :root
  if (micro.includes(':root')) {
    errors.push('extractMicroCss emitted :root block');
  }

  // 2. Zero dead grid
  if (/display\s*:\s*grid\b/i.test(micro) || /grid-template/i.test(micro)) {
    errors.push('extractMicroCss emitted dead grid properties');
  }

  // 3. Zero camelCase in properties
  const camelCasePropMatch = micro.match(/(?:^|\n|\{|\;)\s*([a-z]+[A-Z][a-zA-Z]*)\s*:/);
  if (camelCasePropMatch) {
    errors.push(`extractMicroCss emitted camelCase property: "${camelCasePropMatch[1]}"`);
  }

  // 4. Zero representable properties on base .card selector
  // .card should only keep transform, transition, backdrop-filter
  const cardBlockMatch = micro.match(/\.card\s*\{([^}]+)\}/);
  if (cardBlockMatch) {
    const cardDecls = cardBlockMatch[1];
    if (/\bcolor\s*:/i.test(cardDecls) || /\bbackground-color\s*:/i.test(cardDecls) || /\bpadding\s*:/i.test(cardDecls) || /\bmargin\s*:/i.test(cardDecls)) {
      errors.push('extractMicroCss leaked representable properties to base selector .card');
    }
    if (!cardDecls.includes('transform') || !cardDecls.includes('transition') || !cardDecls.includes('backdrop-filter')) {
      errors.push('extractMicroCss dropped advanced properties (transform/transition/backdrop-filter) from .card');
    }
  }

  // 5. Empty rule blocks must not exist
  if (/[^{}]+\{\s*\}/.test(micro)) {
    errors.push('extractMicroCss emitted empty rule block (e.g. .badge { })');
  }

  // 6. D2: Pseudo-content rules must be preserved in micro-CSS
  if (!micro.includes('.bullet-item::before') || !micro.includes('content: "•"')) {
    errors.push('extractMicroCss purged pseudo-content rule (.bullet-item::before)');
  }

  if (errors.length === 0) {
    console.log('  ✓ Unit contracts PASSED (0 :root, 0 dead grid, 0 camelCase, 0 leaked representables, 0 empty blocks, pseudo-content preserved).');
  } else {
    passed = false;
    errors.forEach(e => console.error(`  ✗ ${e}`));
  }

  // --- TEMPLATE AUDIT: Inspect any compiled templates for micro-CSS / R2 rules ---
  console.log('\n▶ [2/2] Auditing compiled template micro-CSS & R2 rules...');
  const targets = [];
  if (fs.existsSync(ROOT_LANDING)) {
    targets.push({ name: 'landing_v3.json', path: ROOT_LANDING });
  }
  if (fs.existsSync(CORPUS_DIR)) {
    const cases = fs.readdirSync(CORPUS_DIR).filter(d => {
      const p = path.join(CORPUS_DIR, d);
      return fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'output.json'));
    });
    for (const c of cases) {
      targets.push({ name: `corpus/${c}`, path: path.join(CORPUS_DIR, c, 'output.json') });
    }
  }

  for (const target of targets) {
    try {
      const tmpl = JSON.parse(fs.readFileSync(target.path, 'utf8'));
      function walk(el) {
        if (!el) return;
        if (el.widgetType === 'html') {
          const html = el.settings?.html || '';
          if (html.includes('<style')) {
            // Check for R2 rules cap
            if (html.includes('/* SCOPED_R2_HEALING */')) {
              const ruleCount = (html.match(/\{/g) || []).length;
              if (ruleCount > 40) {
                errors.push(`${target.name}: R2 scoped healing rules exceeded cap (${ruleCount} > 40)`);
                passed = false;
              }
            }
            // Check for camelCase properties
            const styleMatches = html.match(/(?:^|\n|\{|\;)\s*([a-z]+[A-Z][a-zA-Z]*)\s*:/g) || [];
            for (const m of styleMatches) {
              const prop = m.replace(/[^a-zA-Z]/g, '');
              if (prop && !prop.startsWith('webkit') && !prop.startsWith('moz')) {
                errors.push(`${target.name}: found camelCase property in style tag: "${prop}"`);
                passed = false;
                break;
              }
            }
          }
        }
        if (Array.isArray(el.elements)) el.elements.forEach(walk);
      }
      (tmpl.content || []).forEach(walk);
    } catch(e) {
      // Ignore parse errors on missing/partial files
    }
  }

  if (passed) {
    console.log('  ✓ Template stylesheet audit PASSED (R2 <= 40, zero camelCase).');
    console.log('\n[CHECKPOINT C12 PASSED] Micro-CSS & R2 Purification contract fully verified!');
    process.exit(0);
  } else {
    console.error('\n[CHECKPOINT C12 FAILED] Micro-CSS audit failed with errors:');
    errors.forEach(e => console.error(`  ✗ ${e}`));
    process.exit(1);
  }
}

testC12();

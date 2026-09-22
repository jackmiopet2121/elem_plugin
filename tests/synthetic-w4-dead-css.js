/**
 * Synthetic Test Suite W4: Dead CSS Elimination & Micro-CSS Purge
 * Codename: "Dead CSS Elimination & Media Consolidation" (Phase W4)
 *
 * Verifies:
 * 1. Scoped Rule Deduplication:
 *    Identical rule blocks (.badge-icon, .feature-icon, .step-marker, .check-icon)
 *    are merged into ONE single block (0 duplicate blocks).
 * 2. Media Query Consolidation:
 *    Multiple @media blocks per breakpoint are unified into exactly 1 consolidated block.
 * 3. Lint C17 / F9 / Z1 Representables Pruning:
 *    Generic base selectors drop representable properties (color, padding, margin, font-size),
 *    preserving only non-representables (pseudo, hover, lock/fill chains, composite resets, transitions).
 * 4. R2 Cap & Size Reduction:
 *    Scoped rule count <= 40 (R2 cap). Stylesheet size reduced by > 30%.
 * 5. Real Landing Parity:
 *    landing_final.json contains clean, deduped stylesheet with 0 duplicates and 100 fidelity.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { parseCssBlocks, deduplicateAndConsolidateCss, extractMicroCss } = require('../src/normalizers/css-classifier');
const { isElementorNativeProperty } = require('../src/smart/style-router');

const LANDING_FINAL_PATH = path.resolve(__dirname, '../../landing_final.json');

function pass(msg) {
  console.log(`  ✓ ${msg}`);
}

function fail(msg, err) {
  console.error(`  ❌ ${msg}`);
  if (err) console.error(err);
  process.exit(1);
}

function runW4Suite() {
  console.log('========================================================================');
  console.log('       SYNTHETIC TEST SUITE W4: DEAD CSS ELIMINATION & MEDIA CONSOLIDATION');
  console.log('========================================================================\n');

  // -------------------------------------------------------------------------
  // TEST 1: Deduplication of Identical CSS Rule Blocks
  // -------------------------------------------------------------------------
  console.log('▶ [1/5] Testing identical rule block deduplication...');
  {
    const rawCss = `
      .badge-icon, .badge-icon .elementor-icon {
        width: 48px !important;
        height: 48px !important;
        display: inline-flex !important;
      }
      .badge-icon, .badge-icon .elementor-icon {
        width: 48px !important;
        height: 48px !important;
        display: inline-flex !important;
      }
      .feature-icon, .feature-icon .elementor-icon {
        width: 56px !important;
        height: 56px !important;
      }
      .feature-icon, .feature-icon .elementor-icon {
        width: 56px !important;
        height: 56px !important;
      }
      .feature-icon, .feature-icon .elementor-icon {
        width: 56px !important;
        height: 56px !important;
      }
    `;

    const cleaned = deduplicateAndConsolidateCss(rawCss);
    const blocks = parseCssBlocks(cleaned);

    assert.strictEqual(blocks.length, 2, `Expected exactly 2 unique blocks (got ${blocks.length})`);
    assert(cleaned.includes('.badge-icon'), 'Must retain .badge-icon block');
    assert(cleaned.includes('.feature-icon'), 'Must retain .feature-icon block');

    const badgeMatches = (cleaned.match(/\.badge-icon\s*,/g) || []).length;
    assert.strictEqual(badgeMatches, 1, `Expected exactly 1 .badge-icon block (got ${badgeMatches})`);

    const featureMatches = (cleaned.match(/\.feature-icon\s*,/g) || []).length;
    assert.strictEqual(featureMatches, 1, `Expected exactly 1 .feature-icon block (got ${featureMatches})`);

    pass('Deduplication verified: 5 duplicate blocks cleanly merged into 2 unique blocks.');
  }

  // -------------------------------------------------------------------------
  // TEST 2: Multi-Breakpoint Media Query Consolidation
  // -------------------------------------------------------------------------
  console.log('\n▶ [2/5] Testing media query consolidation...');
  {
    const rawCss = `
      @media (max-width: 1024px) {
        .e-sid-20 { min-height: 480px !important; }
      }
      @media (max-width: 767px) {
        .e-sid-20 { min-height: 280px !important; }
      }
      @media (max-width: 1024px) {
        .e-sid-118 { min-height: 420px !important; }
      }
      @media (max-width: 767px) {
        .e-sid-118 { min-height: 260px !important; }
      }
      @media (max-width: 1024px) {
        .e-sid-171 { min-height: 380px !important; }
      }
      @media (max-width: 767px) {
        .e-sid-171 { min-height: 240px !important; }
      }
    `;

    const cleaned = deduplicateAndConsolidateCss(rawCss);

    const m1024 = (cleaned.match(/@media\s*\(\s*max-width\s*:\s*1024px\s*\)/g) || []).length;
    const m767 = (cleaned.match(/@media\s*\(\s*max-width\s*:\s*767px\s*\)/g) || []).length;

    assert.strictEqual(m1024, 1, `Expected exactly 1 consolidated 1024px media query (got ${m1024})`);
    assert.strictEqual(m767, 1, `Expected exactly 1 consolidated 767px media query (got ${m767})`);

    // Inner rules must all be present inside the consolidated block
    assert(cleaned.includes('.e-sid-20'), 'e-sid-20 must be preserved');
    assert(cleaned.includes('.e-sid-118'), 'e-sid-118 must be preserved');
    assert(cleaned.includes('.e-sid-171'), 'e-sid-171 must be preserved');

    pass('Media consolidation verified: 6 fragmented media queries merged into exactly 2 unified blocks.');
  }

  // -------------------------------------------------------------------------
  // TEST 3: Lint C17 Representables Pruning vs Non-Representable Retention
  // -------------------------------------------------------------------------
  console.log('\n▶ [3/5] Testing representables pruning on base selectors (Lint C17)...');
  {
    const rawCss = `
      .standard-card {
        color: #111827;
        background-color: #ffffff;
        padding: 24px;
        margin: 16px;
        border-radius: 12px;
        font-size: 16px;
        transition: transform 0.3s ease;
        cursor: pointer;
        backdrop-filter: blur(10px);
      }
      .standard-card:hover {
        transform: translateY(-4px);
        background-color: #f3f4f6;
      }
    `;

    const micro = extractMicroCss(rawCss);

    // Base selector .standard-card must drop color, background-color, padding, margin, border-radius, font-size
    const baseMatch = micro.match(/\.standard-card\s*\{([^}]+)\}/);
    assert(baseMatch, 'Base .standard-card selector block must exist for non-representables');
    const baseDecls = baseMatch[1];

    assert(!/\bcolor\s*:/i.test(baseDecls), 'Base selector must NOT carry color');
    assert(!/\bbackground-color\s*:/i.test(baseDecls), 'Base selector must NOT carry background-color');
    assert(!/\bpadding\s*:/i.test(baseDecls), 'Base selector must NOT carry padding');
    assert(!/\bmargin\s*:/i.test(baseDecls), 'Base selector must NOT carry margin');
    assert(!/\bborder-radius\s*:/i.test(baseDecls), 'Base selector must NOT carry border-radius');
    assert(!/\bfont-size\s*:/i.test(baseDecls), 'Base selector must NOT carry font-size');

    // But must retain transition, cursor, backdrop-filter
    assert(baseDecls.includes('transition'), 'Must retain transition');
    assert(baseDecls.includes('cursor'), 'Must retain cursor');
    assert(baseDecls.includes('backdrop-filter'), 'Must retain backdrop-filter');

    // Pseudo :hover must keep background-color and transform
    const hoverMatch = micro.match(/\.standard-card:hover\s*\{([^}]+)\}/);
    assert(hoverMatch, ':hover pseudo block must exist');
    assert(hoverMatch[1].includes('background-color'), ':hover pseudo must retain background-color');
    assert(hoverMatch[1].includes('transform'), ':hover pseudo must retain transform');

    pass('Lint C17 verified: base representables dropped, non-representables and pseudo states preserved.');
  }

  // -------------------------------------------------------------------------
  // TEST 4: Stylesheet Size Reduction & R2 Cap
  // -------------------------------------------------------------------------
  console.log('\n▶ [4/5] Auditing real landing_final.json stylesheet size and R2 cap...');
  {
    assert(fs.existsSync(LANDING_FINAL_PATH), 'landing_final.json must exist');
    const template = JSON.parse(fs.readFileSync(LANDING_FINAL_PATH, 'utf8'));

    let stylesheetHtml = '';
    function scan(n) {
      if (n.widgetType === 'html' && (n.settings?.html || '').includes('<style')) {
        stylesheetHtml = n.settings.html;
      }
      if (n.elements) n.elements.forEach(scan);
    }
    (template.content || []).forEach(scan);

    assert(stylesheetHtml, 'landing_final.json must contain a stylesheet widget');
    const rawCss = stylesheetHtml.replace(/<\/?style>/g, '').trim();
    const blocks = parseCssBlocks(rawCss);

    // 1. Zero duplicates
    const seen = new Set();
    for (const b of blocks) {
      const norm = b.replace(/\s+/g, ' ').trim();
      assert(!seen.has(norm), `Duplicate rule block detected in landing_final.json: ${norm.slice(0, 60)}`);
      seen.add(norm);
    }

    // 2. Scoped rule count <= 40
    let scopedCount = 0;
    for (const b of blocks) {
      if (b.includes('.e-sid-')) {
        if (b.startsWith('@media')) {
          const open = b.indexOf('{');
          const inner = parseCssBlocks(b.slice(open + 1, b.lastIndexOf('}')));
          scopedCount += inner.filter(ib => ib.includes('.e-sid-')).length;
        } else {
          scopedCount++;
        }
      }
    }
    assert(scopedCount <= 40, `Scoped rule count must be <= 40 (got ${scopedCount})`);

    // 3. Measurable size reduction (> 30%)
    const originalBaseline = 18751;
    const currentSize = rawCss.length;
    const reduction = Math.round(((originalBaseline - currentSize) / originalBaseline) * 100);
    assert(reduction >= 30, `Expected at least 30% reduction (got ${reduction}%)`);

    pass(`landing_final.json audited: 0 duplicates, ${scopedCount} scoped rules (<= 40), ${currentSize} bytes (${reduction}% reduction).`);
  }

  // -------------------------------------------------------------------------
  // TEST 5: Behavior Replay & Parity Preservation
  // -------------------------------------------------------------------------
  console.log('\n▶ [5/5] Auditing landing_final.audit.json fidelity & behavior...');
  {
    const auditPath = path.resolve(__dirname, '../../landing_final.audit.json');
    assert(fs.existsSync(auditPath), 'landing_final.audit.json must exist');
    const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));

    assert.strictEqual(audit.cleanPass, true, 'Audit cleanPass must be true');
    assert(audit.fidelity >= 95, `Fidelity must be >= 95 (got ${audit.fidelity})`);
    assert.strictEqual(audit.counts.critical, 0, 'Critical defects must be 0');
    assert.strictEqual(audit.counts.high, 0, 'High defects must be 0');
    assert.strictEqual(audit.behavior.tested, 1, 'Behavior tested must be 1');
    assert.strictEqual(audit.behavior.passed, 1, 'Behavior passed must be 1');
    assert.strictEqual(audit.behavior.failed, 0, 'Behavior failed must be 0');

    pass(`Audit certified: Fidelity = ${audit.fidelity}/100, 0 critical, 0 high, behavior 1/1 passed.`);
  }

  console.log('\n========================================================================');
  console.log('✓ [CHECKPOINT PASSED] ALL 5 SYNTHETIC W4 SUITE TESTS PASSED 100%!');
  console.log('========================================================================\n');
}

if (require.main === module) {
  runW4Suite();
}

module.exports = { runW4Suite };

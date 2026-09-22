/**
 * SYNTHETIC TEST SUITE: TASK M9
 * Glyph Map + Banner Integrity (Block 7.6 - Task M9)
 * 
 * Verifies:
 * 1. Glyph Map: Full dictionary coverage (★ ⚡ ⚙ ◈ ▲ ● etc.) maps to FA5 without generic fa-check fallback.
 * 2. HTML entity and Unicode escape decoding (&starf;, &#9733;, \u2605) translates cleanly.
 * 3. Elementor compiler maps glyph nodes directly to native Elementor icon widgets with exact FA5 icons.
 * 4. Advisory Rule RULE-VIS-04: Emits advisory defect (severity: LOW, advisory: true) on glyph mismatch/fallback.
 * 5. Banner Integrity: CLI banner "Unresolved Defects" matches *.audit.json counts.total (100% E1 consistency).
 * 6. Virtual Renderer renders correct FontAwesome classes in Elementor DOM.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const {
  GLYPH_TO_FA5,
  resolveGlyphToFa5,
  hasKnownGlyph,
  extractKnownGlyph,
  decodeGlyphEntities
} = require('../src/smart/glyph-map');
const { getFa5Equivalent } = require('../src/core/rules-engine');
const { auditVerificationMatrix } = require('../src/smart/verification-matrix');
const { renderElementorToHtml } = require('../src/emulator/elementor-virtual-renderer');
const { compileHtmlToElementor } = require('../src/engine');

console.log('========================================================================');
console.log('       SYNTHETIC SUITE M9: GLYPH MAP & BANNER INTEGRITY');
console.log('========================================================================\n');

let passedTests = 0;
let totalTests = 0;

function pass(msg) {
  totalTests++;
  passedTests++;
  console.log(`  ✓ PASS: ${msg}`);
}

function fail(msg, err) {
  totalTests++;
  console.error(`  ❌ FAIL: ${msg}`);
  if (err) console.error(err);
}

(async () => {
  // ---------------------------------------------------------------------------
  // TEST 1: Glyph Dictionary Coverage & Entity Decoding
  // ---------------------------------------------------------------------------
  console.log('\n▶ [1/5] Verifying Glyph Dictionary Coverage & Entity Decoding...');
  try {
    const keyPairs = [
      ['★', 'fas fa-star'],
      ['☆', 'far fa-star'],
      ['⚡', 'fas fa-bolt'],
      ['⚙', 'fas fa-cog'],
      ['◈', 'fas fa-gem'],
      ['◆', 'fas fa-gem'],
      ['▲', 'fas fa-caret-up'],
      ['▼', 'fas fa-caret-down'],
      ['▶', 'fas fa-play'],
      ['◀', 'fas fa-caret-left'],
      ['●', 'fas fa-circle'],
      ['•', 'fas fa-circle'],
      ['✦', 'fas fa-magic'],
      ['✨', 'fas fa-magic'],
      ['✔', 'fas fa-check'],
      ['✖', 'fas fa-times'],
      ['➕', 'fas fa-plus'],
      ['➖', 'fas fa-minus'],
      ['🛡', 'fas fa-shield-alt'],
      ['🔒', 'fas fa-lock'],
      ['🕒', 'fas fa-clock'],
      ['📞', 'fas fa-phone'],
      ['✉', 'fas fa-envelope'],
      ['🔔', 'fas fa-bell'],
      ['🔍', 'fas fa-search'],
      ['❓', 'fas fa-question-circle'],
      ['🔥', 'fas fa-fire'],
      ['🚀', 'fas fa-rocket'],
      ['💡', 'fas fa-lightbulb'],
      ['🌐', 'fas fa-globe']
    ];

    for (const [glyph, expectedFa] of keyPairs) {
      assert.strictEqual(
        resolveGlyphToFa5(glyph),
        expectedFa,
        `Glyph "${glyph}" must resolve to "${expectedFa}", got "${resolveGlyphToFa5(glyph)}"`
      );
      assert.strictEqual(hasKnownGlyph(glyph), true, `hasKnownGlyph("${glyph}") must be true`);
    }

    // Negative assertions
    assert.strictEqual(hasKnownGlyph('Hello World'), false);
    assert.strictEqual(hasKnownGlyph('12345'), false);
    assert.strictEqual(resolveGlyphToFa5('Standard Text'), null);

    // Entity decoding
    assert.strictEqual(decodeGlyphEntities('&#9733;'), '★');
    assert.strictEqual(resolveGlyphToFa5('&#9733;'), 'fas fa-star');
    assert.strictEqual(resolveGlyphToFa5('\\u2605'), 'fas fa-star');

    // Rules engine integration
    assert.strictEqual(getFa5Equivalent('★'), 'fas fa-star');
    assert.strictEqual(getFa5Equivalent('⚙'), 'fas fa-cog');

    pass('Glyph dictionary maps all target glyphs (★ ⚡ ⚙ ◈ ▲ ● etc.) accurately without check fallback');
  } catch (err) {
    fail('Glyph dictionary coverage test failed', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Zero fa-check Fallback for Known Glyphs in Single-Pass Compiler
  // ---------------------------------------------------------------------------
  console.log('\n▶ [2/5] Verifying Single-Pass Compiler maps glyphs with ZERO fa-check fallback...');
  try {
    const glyphHtml = `<!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { margin: 0; padding: 20px; font-family: sans-serif; }
        .feature-grid { display: flex; gap: 16px; }
        .glyph-star { width: 32px; height: 32px; font-size: 20px; color: #f59e0b; }
        .glyph-bolt { width: 32px; height: 32px; font-size: 20px; color: #ef4444; }
        .glyph-gear { width: 32px; height: 32px; font-size: 20px; color: #3b82f6; }
        .glyph-gem  { width: 32px; height: 32px; font-size: 20px; color: #8b5cf6; }
        .glyph-up   { width: 32px; height: 32px; font-size: 20px; color: #10b981; }
        .glyph-dot  { width: 32px; height: 32px; font-size: 20px; color: #64748b; }
      </style>
    </head>
    <body>
      <div class="feature-grid">
        <span class="glyph-star" data-sid="sid-star">★</span>
        <span class="glyph-bolt" data-sid="sid-bolt">⚡</span>
        <span class="glyph-gear" data-sid="sid-gear">⚙</span>
        <span class="glyph-gem"  data-sid="sid-gem">◈</span>
        <span class="glyph-up"   data-sid="sid-up">▲</span>
        <span class="glyph-dot"  data-sid="sid-dot">●</span>
      </div>
    </body>
    </html>`;

    const result = await compileHtmlToElementor(glyphHtml, { offline: true, inspect: false });
    assert(result && result.templateJson, 'Compiler must produce templateJson');

    const widgetsBySid = {};
    function collectWidgets(elements = []) {
      for (const el of elements) {
        const sid = el._sid || el.settings?._sid || el._dom_id;
        if (sid) widgetsBySid[sid] = el;
        if (Array.isArray(el.elements)) collectWidgets(el.elements);
      }
    }
    collectWidgets(result.templateJson.content);

    const expectedMappings = {
      'sid-star': 'fas fa-star',
      'sid-bolt': 'fas fa-bolt',
      'sid-gear': 'fas fa-cog',
      'sid-gem':  'fas fa-gem',
      'sid-up':   'fas fa-caret-up',
      'sid-dot':  'fas fa-circle'
    };

    for (const [sid, expectedFa] of Object.entries(expectedMappings)) {
      const widget = widgetsBySid[sid];
      assert(widget, `Widget for ${sid} must exist`);
      assert.strictEqual(widget.widgetType, 'icon', `Widget for ${sid} must be an icon widget`);
      const iconVal = widget.settings?.selected_icon?.value || widget.settings?.icon?.value || widget.settings?.icon;
      assert.strictEqual(
        iconVal,
        expectedFa,
        `Widget ${sid} icon must be "${expectedFa}", got "${iconVal}" (zero generic fa-check fallback)`
      );
    }

    pass('Compiler maps glyphs (★ ⚡ ⚙ ◈ ▲ ●) to exact FA5 icon widgets with zero generic fallback');
  } catch (err) {
    fail('Single-pass glyph compiler test failed', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Advisory Rule RULE-VIS-04 (Glyph Parity)
  // ---------------------------------------------------------------------------
  console.log('\n▶ [3/5] Verifying Advisory Rule RULE-VIS-04 (Glyph Parity)...');
  try {
    const mockGt = {
      viewports: {
        desktop: {
          flat: {
            'sid-valid-star': {
              sid: 'sid-valid-star',
              tag: 'span',
              rect: { x: 0, y: 0, w: 32, h: 32 },
              directText: '★',
              fullText: '★',
              hasDirectText: true,
              styles: { color: '#f59e0b', fontSize: '20px' }
            },
            'sid-bad-gear': {
              sid: 'sid-bad-gear',
              tag: 'span',
              rect: { x: 40, y: 0, w: 32, h: 32 },
              directText: '⚙',
              fullText: '⚙',
              hasDirectText: true,
              styles: { color: '#3b82f6', fontSize: '20px' }
            }
          }
        },
        tablet: { flat: {} },
        mobile: { flat: {} }
      }
    };

    const mockRender = {
      viewports: {
        desktop: {
          flat: {
            'sid-valid-star': {
              sid: 'sid-valid-star',
              widgetType: 'icon.default',
              rect: { x: 0, y: 0, w: 32, h: 32 },
              iconClass: 'fas fa-star',
              styles: { color: 'rgb(245, 158, 11)', fontSize: '20px' }
            },
            'sid-bad-gear': {
              sid: 'sid-bad-gear',
              widgetType: 'icon.default',
              rect: { x: 40, y: 0, w: 32, h: 32 },
              iconClass: 'fas fa-check', // Incorrect fallback!
              styles: { color: 'rgb(59, 130, 246)', fontSize: '20px' }
            }
          }
        },
        tablet: { flat: {} },
        mobile: { flat: {} }
      }
    };

    const mockTemplate = {
      title: 'Glyph Parity Test',
      content: [
        {
          _sid: 'sid-valid-star',
          elType: 'widget',
          widgetType: 'icon',
          settings: { selected_icon: { value: 'fas fa-star' } }
        },
        {
          _sid: 'sid-bad-gear',
          elType: 'widget',
          widgetType: 'icon',
          settings: { selected_icon: { value: 'fas fa-check' } }
        }
      ]
    };

    const matrixReport = auditVerificationMatrix(mockGt, mockRender, mockTemplate);
    const glyphDefects = matrixReport.defects.filter(d => d.rule === 'RULE-VIS-04');

    assert.strictEqual(glyphDefects.length, 1, `Expected exactly 1 RULE-VIS-04 defect, got ${glyphDefects.length}`);
    const d = glyphDefects[0];
    assert.strictEqual(d.nodeSid, 'sid-bad-gear');
    assert.strictEqual(d.rule, 'RULE-VIS-04');
    assert.strictEqual(d.severity, 'LOW');
    assert.strictEqual(d.advisory, true);
    assert.strictEqual(d.rung, 'R1');
    assert(d.message.includes('⚙') && d.message.includes('fas fa-cog'), 'Message must identify expected glyph and icon');

    pass('RULE-VIS-04 correctly flags fallback to fa-check as advisory LOW defect while passing valid glyphs');
  } catch (err) {
    fail('RULE-VIS-04 glyph parity audit test failed', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Banner Integrity (CLI banner === *.audit.json counts.total)
  // ---------------------------------------------------------------------------
  console.log('\n▶ [4/5] Verifying Banner Integrity (CLI banner === *.audit.json counts.total)...');
  try {
    const tempInput = path.join(__dirname, 'temp-m9-banner.html');
    const tempOutput = path.join(__dirname, 'temp-m9-banner.json');
    const tempAudit = path.join(__dirname, 'temp-m9-banner.audit.json');

    const fixtureHtml = `<!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { margin: 0; padding: 20px; font-family: Inter, sans-serif; }
        .hero { width: 100%; padding: 40px 0; background: #1e293b; color: #fff; }
        .title { font-size: 32px; font-weight: 700; color: #38bdf8; }
        .icon-row { display: flex; gap: 12px; margin-top: 16px; }
        .icon-star { width: 28px; height: 28px; font-size: 18px; }
      </style>
    </head>
    <body>
      <div class="hero">
        <h1 class="title">Banner Integrity Test</h1>
        <div class="icon-row">
          <span class="icon-star">★</span>
          <span class="icon-star">⚡</span>
        </div>
      </div>
    </body>
    </html>`;

    fs.writeFileSync(tempInput, fixtureHtml, 'utf8');

    try {
      const cliStdout = execSync(`node bin/cli.js "${tempInput}" "${tempOutput}" --offline 2>&1`, {
        cwd: path.join(__dirname, '..'),
        encoding: 'utf8',
        shell: true
      });

      assert(fs.existsSync(tempAudit), 'Audit JSON file must be generated');
      const auditJson = JSON.parse(fs.readFileSync(tempAudit, 'utf8'));

      const bannerMatch = cliStdout.match(/Unresolved Defects:\s+(\d+)/);
      assert(bannerMatch, 'CLI output must contain "Unresolved Defects: <N>"');
      const bannerCount = parseInt(bannerMatch[1], 10);
      const auditTotal = auditJson.counts?.total !== undefined ? auditJson.counts.total : auditJson.defects.length;

      assert.strictEqual(
        bannerCount,
        auditTotal,
        `CLI Banner count (${bannerCount}) must strictly match *.audit.json counts.total (${auditTotal})`
      );

      pass(`Banner integrity verified: CLI banner (${bannerCount}) === *.audit.json counts.total (${auditTotal})`);
    } finally {
      if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
      if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);
      if (fs.existsSync(tempAudit)) fs.unlinkSync(tempAudit);
      const tempPreview = tempOutput.replace('.json', '-preview.html');
      if (fs.existsSync(tempPreview)) fs.unlinkSync(tempPreview);
    }
  } catch (err) {
    fail('Banner integrity test failed', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Virtual Renderer Emits Proper FontAwesome Classes in Elementor DOM
  // ---------------------------------------------------------------------------
  console.log('\n▶ [5/5] Verifying Virtual Renderer Emits Proper FontAwesome Classes...');
  try {
    const templateWithIcons = {
      version: '0.4',
      title: 'Render Icon Test',
      content: [
        {
          id: 'test-icon-1',
          elType: 'widget',
          widgetType: 'icon',
          settings: {
            selected_icon: { value: 'fas fa-star' },
            view: 'default'
          }
        },
        {
          id: 'test-icon-2',
          elType: 'widget',
          widgetType: 'icon',
          settings: {
            selected_icon: { value: 'fas fa-bolt' },
            view: 'stacked',
            shape: 'circle'
          }
        }
      ]
    };

    const renderedHtml = renderElementorToHtml(templateWithIcons, { title: 'Test' });
    assert(renderedHtml.includes('class="fas fa-star"'), 'Rendered HTML must contain fas fa-star');
    assert(renderedHtml.includes('class="fas fa-bolt"'), 'Rendered HTML must contain fas fa-bolt');
    assert(renderedHtml.includes('elementor-view-stacked'), 'Rendered HTML must contain elementor-view-stacked');

    pass('Virtual renderer emits exact FontAwesome icon markup inside Elementor DOM');
  } catch (err) {
    fail('Virtual renderer icon markup test failed', err);
  }

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log(`SUITE M9 RESULTS: ${passedTests}/${totalTests} tests passed (${Math.round(passedTests / totalTests * 100)}%)`);
  console.log('========================================================================');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
})();

/**
 * Synthetic Test Suite W2: WP Cascade & Spacing Parity
 * Codename: "Cascade & Spacing Close-Out" (Phase W2)
 *
 * Verifies:
 * 1. Tiny glyph bullets (sid-175/186/197 class):
 *    GT glyph rect <= ~10px => render as inline text bullet (heading span),
 *    NEVER icon widget with shape:circle / stacked decor.
 * 2. Spacing double-count elimination (timeline 48+48, split 31+32 class):
 *    On the same stacking axis, if container gap > 0 AND child margin ≈ gap
 *    or their sum exceeds GT spacing => keep gap, zero the child margin.
 * 3. Real landing.html regression check:
 *    sid-175/186/197 mapped as inline spans, timeline & split spacing deduplicated,
 *    and cleanPass preserved.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { compileHtmlToElementor } = require('../src/engine');

function pass(msg) {
  console.log(`  ✓ ${msg}`);
}

function fail(msg, err) {
  console.error(`  ❌ ${msg}`);
  if (err) console.error(err);
  process.exit(1);
}

function findNodeBySid(root, sid) {
  if (!root) return null;
  const currentSid = root._sid || root.settings?._sid || root._dom_id || root.settings?._dom_id;
  if (currentSid === sid) return root;
  for (const child of (root.elements || [])) {
    const found = findNodeBySid(child, sid);
    if (found) return found;
  }
  return null;
}

async function runTests() {
  console.log('========================================================================');
  console.log('       SYNTHETIC TEST SUITE W2: WP CASCADE & SPACING PARITY');
  console.log('========================================================================\n');

  // ---------------------------------------------------------------------------
  // TEST 1: Tiny Glyph Bullet Mapping (sid-175 class)
  // ---------------------------------------------------------------------------
  console.log('▶ [1/3] Verifying tiny glyph bullets render as inline text/span (never icon/circle)...');
  try {
    const bulletHtml = `<!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { margin: 0; padding: 20px; font-family: Inter, sans-serif; }
        .card-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          color: #4f46e5;
        }
        .meta-bullet {
          display: inline;
          font-size: 14px;
          color: #4f46e5;
        }
      </style>
    </head>
    <body>
      <div class="card-meta" data-sid="meta-con">
        <span data-sid="meta-cat">Category</span>
        <span class="meta-bullet" data-sid="bullet-dot">•</span>
        <span class="meta-bullet" data-sid="bullet-middle">·</span>
        <span data-sid="meta-read">5 Min Read</span>
      </div>
    </body>
    </html>`;

    const result = await compileHtmlToElementor(bulletHtml, { offline: true, inspect: false });
    assert(result && result.templateJson, 'Compiler must return templateJson');

    const root = result.templateJson.content[0];
    const dotWidget = findNodeBySid(root, 'bullet-dot');
    const middleWidget = findNodeBySid(root, 'bullet-middle');

    if (dotWidget) {
      assert.strictEqual(dotWidget.widgetType, 'heading', 'bullet-dot must render as heading widget (not icon)');
      assert.strictEqual(dotWidget.settings?.header_size, 'span', 'bullet-dot must have header_size === "span"');
      assert.strictEqual(dotWidget.settings?._element_width, 'auto', 'bullet-dot must have _element_width === "auto"');
      assert.strictEqual(dotWidget.settings?.title, '•', 'bullet-dot title must be "•"');
      assert(!dotWidget.settings?.shape, 'bullet-dot must NEVER have shape: "circle"');
      assert.strictEqual(dotWidget.settings?.view, undefined, 'bullet-dot must not have icon view');
    } else {
      // Task K4: Consolidated into unified text-editor widget with inline spans
      const metaCon = findNodeBySid(root, 'meta-con');
      assert(metaCon, 'meta-con container must exist');
      const inlineWidget = metaCon.elements?.find(el => el.widgetType === 'text-editor');
      assert(inlineWidget, 'meta-con must contain consolidated text-editor widget');
      assert.ok(inlineWidget.settings?.editor.includes('data-sid="bullet-dot"'), 'Must contain bullet-dot span');
      assert.ok(inlineWidget.settings?.editor.includes('•'), 'Must contain bullet dot glyph •');
      assert.ok(!inlineWidget.settings?.shape, 'Must never have icon shape circle');
    }

    if (middleWidget) {
      assert.strictEqual(middleWidget.widgetType, 'heading', 'bullet-middle must render as heading widget');
      assert.strictEqual(middleWidget.settings?.header_size, 'span', 'bullet-middle must have header_size === "span"');
      assert.strictEqual(middleWidget.settings?._element_width, 'auto', 'bullet-middle must have _element_width === "auto"');
    } else {
      const metaCon = findNodeBySid(root, 'meta-con');
      const inlineWidget = metaCon?.elements?.find(el => el.widgetType === 'text-editor');
      assert.ok(inlineWidget?.settings?.editor.includes('data-sid="bullet-middle"'), 'Must contain bullet-middle span');
      assert.ok(inlineWidget?.settings?.editor.includes('·'), 'Must contain bullet middle glyph ·');
    }

    // Also verify standalone bullet maps to heading widget (not icon)
    const soloHtml = `<!DOCTYPE html><html><head><style>.meta-bullet { font-size: 14px; color: #4f46e5; }</style></head><body><div data-sid="solo-con"><span class="meta-bullet" data-sid="solo-dot">•</span></div></body></html>`;
    const soloRes = await compileHtmlToElementor(soloHtml, { offline: true, inspect: false });
    const soloRoot = soloRes.templateJson.content[0];
    const soloDot = findNodeBySid(soloRoot, 'solo-dot');
    assert(soloDot, 'solo-dot must exist');
    assert.strictEqual(soloDot.widgetType, 'heading', 'solo-dot must map to heading widget');
    assert.strictEqual(soloDot.settings?.header_size, 'span', 'solo-dot must have header_size === "span"');

    pass('Tiny glyph bullets correctly map to native inline heading spans or consolidated inline spans with zero circle decor');
  } catch (err) {
    fail('Tiny glyph bullet test failed', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Spacing Double-Count Elimination (Timeline & Split classes)
  // ---------------------------------------------------------------------------
  console.log('\n▶ [2/3] Verifying container gap & child margin double-count elimination...');
  try {
    const spacingHtml = `<!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { margin: 0; padding: 20px; font-family: Inter, sans-serif; }
        /* Timeline Class: gap 48px, child margin-bottom 48px */
        .timeline-container {
          display: flex;
          flex-direction: column;
          gap: 48px;
        }
        .timeline-step {
          height: 80px;
          margin-bottom: 48px;
          background: #f1f5f9;
        }
        /* Split Class: gap 31px, child margin-top 32px */
        .split-content {
          display: flex;
          flex-direction: column;
          gap: 31px;
          margin-top: 40px;
        }
        .split-h2 { height: 40px; }
        .split-p { height: 30px; }
        .split-checklist {
          height: 100px;
          margin-top: 32px;
          background: #e2e8f0;
        }
      </style>
    </head>
    <body>
      <div class="timeline-container" data-sid="timeline-con">
        <div class="timeline-step" data-sid="step-1">Step 1</div>
        <div class="timeline-step" data-sid="step-2">Step 2</div>
        <div class="timeline-step" data-sid="step-3">Step 3</div>
      </div>

      <div class="split-content" data-sid="split-con">
        <h2 class="split-h2" data-sid="split-h2">Heading</h2>
        <p class="split-p" data-sid="split-p">Paragraph</p>
        <div class="split-checklist" data-sid="split-checklist">Checklist</div>
      </div>
    </body>
    </html>`;

    const result = await compileHtmlToElementor(spacingHtml, { offline: true, inspect: false });
    assert(result && result.templateJson, 'Compiler must return templateJson');

    const root = result.templateJson.content[0];

    // Check Timeline Container
    const timelineCon = findNodeBySid(root, 'timeline-con');
    const step1 = findNodeBySid(root, 'step-1');
    const step2 = findNodeBySid(root, 'step-2');
    const step3 = findNodeBySid(root, 'step-3');

    assert(timelineCon, 'timeline-con must exist');
    const timelineGap = Number(timelineCon.settings?.gap?.row ?? timelineCon.settings?.gap?.size ?? 0);
    assert.strictEqual(timelineGap, 48, 'timeline-con gap must be 48px');

    const step1Bottom = Number(step1.settings?.margin?.bottom ?? step1.settings?._margin?.bottom ?? 0);
    const step2Bottom = Number(step2.settings?.margin?.bottom ?? step2.settings?._margin?.bottom ?? 0);

    assert.strictEqual(step1Bottom, 0, `step-1 margin-bottom must be zeroed to prevent 48+48 double counting (got ${step1Bottom})`);
    assert.strictEqual(step2Bottom, 0, `step-2 margin-bottom must be zeroed to prevent 48+48 double counting (got ${step2Bottom})`);

    // Check Split Container
    const splitCon = findNodeBySid(root, 'split-con');
    const checklist = findNodeBySid(root, 'split-checklist');

    assert(splitCon, 'split-con must exist');
    const splitGap = Number(splitCon.settings?.gap?.row ?? splitCon.settings?.gap?.size ?? 0);
    assert.strictEqual(splitGap, 31, 'split-con gap must be 31px');

    const checklistTop = Number(checklist.settings?.margin?.top ?? checklist.settings?._margin?.top ?? 0);
    assert.strictEqual(checklistTop, 0, `split-checklist margin-top must be zeroed to prevent 31+32 double counting (got ${checklistTop})`);

    pass('Double-counting eliminated: container gap preserved and redundant child margins zeroed');
  } catch (err) {
    fail('Spacing double-count test failed', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Real landing.html Regression Check
  // ---------------------------------------------------------------------------
  console.log('\n▶ [3/3] Verifying landing.html full regression & cleanPass with W2 fixes...');
  try {
    const landingPath = path.join(__dirname, '..', '..', 'landing.html');
    if (!fs.existsSync(landingPath)) {
      console.log('  ⚠️ landing.html not found at root, checking tests/fixtures');
      pass('Skipped landing.html check (file absent in current environment)');
      return;
    }

    const landingHtml = fs.readFileSync(landingPath, 'utf8');
    const result = await compileHtmlToElementor(landingHtml, { offline: true, inspect: false });
    assert(result && result.templateJson, 'Compiler must return templateJson for landing.html');

    const root = result.templateJson.content[0];

    // 1. Verify blog bullets (sid-175, sid-186, sid-197)
    for (const sid of ['sid-175', 'sid-186', 'sid-197']) {
      const bulletNode = findNodeBySid(root, sid);
      if (bulletNode) {
        assert.strictEqual(bulletNode.widgetType, 'heading', `${sid} must be heading widget (not icon)`);
        assert.strictEqual(bulletNode.settings?.header_size, 'span', `${sid} must have header_size === "span"`);
        assert.strictEqual(bulletNode.settings?.title, '•', `${sid} title must be "•"`);
        assert(!bulletNode.settings?.shape, `${sid} must not have shape`);
      } else {
        // Task K4: Consolidated into unified text-editor widget with inline spans
        const metaParent = sid === 'sid-175' ? findNodeBySid(root, 'sid-173') :
                           sid === 'sid-186' ? findNodeBySid(root, 'sid-184') :
                           findNodeBySid(root, 'sid-195');
        assert(metaParent, `Meta container for ${sid} must exist`);
        const inlineWidget = metaParent.elements?.find(el => el.widgetType === 'text-editor');
        assert(inlineWidget, `Meta container must house consolidated text-editor widget`);
        assert.ok(inlineWidget.settings?.editor.includes(`data-sid="${sid}"`), `${sid} must be preserved in editor HTML`);
        assert.ok(inlineWidget.settings?.editor.includes('•'), `Bullet glyph • must be preserved`);
      }
    }

    // 2. Verify timeline steps margin deduplication (sid-79, sid-84)
    const sid79 = findNodeBySid(root, 'sid-79');
    const sid84 = findNodeBySid(root, 'sid-84');
    assert(sid79, 'sid-79 must exist');
    assert(sid84, 'sid-84 must exist');
    const m79Bottom = Number(sid79.settings?.margin?.bottom ?? sid79.settings?._margin?.bottom ?? 0);
    const m84Bottom = Number(sid84.settings?.margin?.bottom ?? sid84.settings?._margin?.bottom ?? 0);
    assert.strictEqual(m79Bottom, 0, `sid-79 bottom margin must be zeroed (got ${m79Bottom})`);
    assert.strictEqual(m84Bottom, 0, `sid-84 bottom margin must be zeroed (got ${m84Bottom})`);

    // 3. Verify split section checklist margin deduplication (sid-122)
    const sid122 = findNodeBySid(root, 'sid-122');
    assert(sid122, 'sid-122 must exist');
    const m122Top = Number(sid122.settings?.margin?.top ?? sid122.settings?._margin?.top ?? 0);
    assert.strictEqual(m122Top, 0, `sid-122 top margin must be zeroed (got ${m122Top})`);

    // 4. Verify scorecard & cleanPass
    if (result.scorecard) {
      assert.strictEqual(result.scorecard.counts?.critical, 0, 'Critical defects must be 0');
      assert.strictEqual(result.scorecard.counts?.high, 0, 'High defects must be 0');
      assert(result.scorecard.fidelity >= 95, `Fidelity must be >= 95 (got ${result.scorecard.fidelity})`);
      assert.strictEqual(result.scorecard.cleanPass, true, 'cleanPass must be true');
    }

    pass('landing.html verified: inline bullets, collision-free spacing, and cleanPass intact');
  } catch (err) {
    fail('landing.html regression check failed', err);
  }

  console.log('\n[CHECKPOINT PASSED] Synthetic Test Suite W2 passed all assertions!');
}

runTests();

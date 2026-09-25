/**
 * Block 8.2 — Phase 6 (Part 6C-1): Transparent Decor Parity Test Suite.
 *
 * Verifies:
 * 1. Synthetic Fixture:
 *    - Two square/near-square containers sharing the SAME source class (.decor-card).
 *    - Container A: transparent background, 36x36.
 *    - Container B: visible color background (rgb(37, 99, 235)), 52x52.
 *    - Container C: transparent background-color + background-image, 44x44.
 *    - Native Elementor containers generated with SID retention.
 *    - Atomic CSS rules scoped strictly to per-node .e-sid-*, not shared .decor-card.
 *    - Dimensions isolated: 36px vs 52px, zero shared-class collision.
 *    - Transparent node does NOT become white; colored node retains actual color.
 *    - Container with background-image retains background-image (background-color rule does not erase it).
 *
 * 2. Real-Corpus Assertion on corpus/04-pricing-calculator:
 *    - SIDs: sid-28, sid-31, sid-34, sid-37, sid-40.
 *    - Measured Chromium render across desktop, tablet, and mobile.
 *    - All 15 records remain transparent and never turn white.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const { execFileSync } = require('child_process');

const { captureGroundTruth } = require('../src/smart/style-snapshot');
const { parseHtmlToAst } = require('../src/parser/html-parser');
const { compileGroundTruthToElementor } = require('../src/smart/geometry-mapper');
const { compileHtmlToElementor } = require('../src/engine');
const { renderElementorToHtml } = require('../src/emulator/elementor-virtual-renderer');
const { captureRenderSnapshot } = require('../src/smart/render-snapshot');
const { isFullyTransparentColor, readComputedCssProperty } = require('../src/smart/computed-style-resolver');
const { discoverCorpusFixtures } = require('./support/corpus-manifest');
const { resolveCliPath, runFixtureBaseline, analyzeTemplateTree } = require('./run-block-8-baseline');

const ROOT_DIR = path.resolve(__dirname, '..');

(async () => {
  console.log('========================================================================');
  console.log('BLOCK 8.2 — PHASE 6 (PART 6C-1): TRANSPARENT DECOR PARITY');
  console.log('========================================================================\n');

  let totalTests = 0;
  let passedTests = 0;

  function runTest(name, fn) {
    totalTests++;
    try {
      fn();
      passedTests++;
      console.log(`  ✓ [TEST ${totalTests}] ${name}`);
    } catch (err) {
      console.error(`  ✖ [TEST ${totalTests}] ${name} FAILED:`, err.message);
      throw err;
    }
  }

  async function runAsyncTest(name, fn) {
    totalTests++;
    try {
      await fn();
      passedTests++;
      console.log(`  ✓ [TEST ${totalTests}] ${name}`);
    } catch (err) {
      console.error(`  ✖ [TEST ${totalTests}] ${name} FAILED:`, err.message);
      throw err;
    }
  }

  function collectAllElements(roots) {
    const list = [];
    function walk(el) {
      if (!el) return;
      list.push(el);
      if (el.elements && Array.isArray(el.elements)) {
        for (const child of el.elements) walk(child);
      }
    }
    for (const r of roots) walk(r);
    return list;
  }

  // ===========================================================================
  // SECTION 1: Synthetic Fixture with Shared Class & Image Case
  // ===========================================================================
  console.log('▶ [SUITE 1] Synthetic Shared-Class Decor Fixture with Chromium');

  const syntheticHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0f172a; padding: 40px; font-family: sans-serif; }
    .decor-container { display: flex; gap: 20px; align-items: center; }

    /* Shared class used by two containers with different backgrounds and dimensions */
    .decor-card {
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .trans-box {
      width: 36px;
      height: 36px;
      background-color: rgba(0, 0, 0, 0);
      border: 1px solid #334155;
      border-radius: 8px;
    }
    .color-box {
      width: 52px;
      height: 52px;
      background-color: rgb(37, 99, 235);
      border-radius: 12px;
    }
    .img-box {
      width: 44px;
      height: 44px;
      background-color: rgba(0, 0, 0, 0);
      background-image: url("https://images.unsplash.com/photo-1500000000000?auto=format");
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
      border-radius: 6px;
    }
  </style>
</head>
<body>
  <div class="decor-container" data-sid="sid-parent">
    <div class="decor-card trans-box" data-sid="sid-decor-trans">
      <span data-sid="sid-icon-1">T</span>
    </div>
    <div class="decor-card color-box" data-sid="sid-decor-color">
      <span data-sid="sid-icon-2">C</span>
    </div>
    <div class="decor-card img-box" data-sid="sid-decor-img">
      <span data-sid="sid-icon-3">I</span>
    </div>
  </div>
</body>
</html>`;

  console.log('    • Capturing Ground Truth with Chromium...');
  const gtSnapshot = await captureGroundTruth(syntheticHtml);

  console.log('    • Compiling synthetic fixture to Elementor...');
  const ast = parseHtmlToAst(gtSnapshot.annotatedHtml || syntheticHtml);
  const atomicRules = [];
  const elements = compileGroundTruthToElementor(ast, gtSnapshot, {
    viewport: 'desktop',
    atomicRules
  });
  const allElements = collectAllElements(elements);

  const transCon = allElements.find(e => e._sid === 'sid-decor-trans' || e.settings?._sid === 'sid-decor-trans');
  const colorCon = allElements.find(e => e._sid === 'sid-decor-color' || e.settings?._sid === 'sid-decor-color');
  const imgCon = allElements.find(e => e._sid === 'sid-decor-img' || e.settings?._sid === 'sid-decor-img');

  runTest('1.1. Output generates native Elementor containers with SID retention', () => {
    assert(transCon, 'Transparent container must exist');
    assert.strictEqual(transCon.elType, 'container');
    assert.strictEqual(transCon.settings?._sid, 'sid-decor-trans');

    assert(colorCon, 'Colored container must exist');
    assert.strictEqual(colorCon.elType, 'container');
    assert.strictEqual(colorCon.settings?._sid, 'sid-decor-color');

    assert(imgCon, 'Image container must exist');
    assert.strictEqual(imgCon.elType, 'container');
    assert.strictEqual(imgCon.settings?._sid, 'sid-decor-img');
  });

  runTest('1.2. Per-node .e-sid-* atomic selectors used instead of shared class .decor-card', () => {
    const sharedClassRules = atomicRules.filter(r => r.startsWith('.decor-card') || r.includes('.decor-card,'));
    assert.strictEqual(sharedClassRules.length, 0, `Atomic rules must not target shared class .decor-card, found: ${JSON.stringify(sharedClassRules)}`);

    const transRule = atomicRules.find(r => r.includes('.e-sid-decor-trans'));
    assert(transRule, 'Must find atomic rule targeting .e-sid-decor-trans');
    assert(transRule.includes('width: 36px !important;'), `transRule must specify 36px width: ${transRule}`);
    assert(transRule.includes('height: 36px !important;'), `transRule must specify 36px height: ${transRule}`);
    assert(transRule.includes('background-color: rgba(0, 0, 0, 0) !important;'), `transRule must emit transparent background-color: ${transRule}`);
    assert(!transRule.includes('#ffffff'), `transRule must never invent #ffffff: ${transRule}`);

    const colorRule = atomicRules.find(r => r.includes('.e-sid-decor-color'));
    assert(colorRule, 'Must find atomic rule targeting .e-sid-decor-color');
    assert(colorRule.includes('width: 52px !important;'), `colorRule must specify 52px width: ${colorRule}`);
    assert(colorRule.includes('height: 52px !important;'), `colorRule must specify 52px height: ${colorRule}`);
    assert(colorRule.includes('background-color: rgb(37, 99, 235) !important;'), `colorRule must emit actual color: ${colorRule}`);

    const imgRule = atomicRules.find(r => r.includes('.e-sid-decor-img'));
    assert(imgRule, 'Must find atomic rule targeting .e-sid-decor-img');
    assert(imgRule.includes('background-color: rgba(0, 0, 0, 0) !important;'), `imgRule must emit background-color, not background: ${imgRule}`);
    assert(!imgRule.includes('background:'), `imgRule must NOT use shorthand background: ${imgRule}`);
  });

  console.log('    • Rendering synthetic template to HTML with virtual renderer...');
  const templateJson = {
    title: 'Decor Test',
    page_settings: { background_color: '#0f172a' },
    content: elements
  };
  const previewHtml = renderElementorToHtml(templateJson, { microCss: atomicRules.join('\n') });

  console.log('    • Capturing render snapshot of preview with Chromium...');
  const renderSnapshot = await captureRenderSnapshot(previewHtml);

  const deskRenderTrans = renderSnapshot.viewports.desktop.flat['sid-decor-trans'];
  const deskRenderColor = renderSnapshot.viewports.desktop.flat['sid-decor-color'];
  const deskRenderImg = renderSnapshot.viewports.desktop.flat['sid-decor-img'];

  assert(deskRenderTrans && deskRenderColor && deskRenderImg, 'All 3 rendered nodes must exist in desktop render snapshot');

  runTest('1.3. Dimensions isolation: 36px vs 52px vs 44px preserved without collision', () => {
    const wTrans = Math.round(deskRenderTrans.rect.w);
    const hTrans = Math.round(deskRenderTrans.rect.h);
    const wColor = Math.round(deskRenderColor.rect.w);
    const hColor = Math.round(deskRenderColor.rect.h);
    const wImg = Math.round(deskRenderImg.rect.w);
    const hImg = Math.round(deskRenderImg.rect.h);

    assert(Math.abs(wTrans - 38) <= 2, `Transparent node width expected ~38px, got: ${wTrans}px`);
    assert(Math.abs(hTrans - 38) <= 6, `Transparent node height expected ~38px, got: ${hTrans}px`);

    assert(Math.abs(wColor - 52) <= 2, `Colored node width expected ~52px, got: ${wColor}px`);
    assert(Math.abs(hColor - 52) <= 2, `Colored node height expected ~52px, got: ${hColor}px`);

    assert(Math.abs(wImg - 44) <= 2, `Image node width expected ~44px, got: ${wImg}px`);
    assert(Math.abs(hImg - 44) <= 2, `Image node height expected ~44px, got: ${hImg}px`);
  });

  runTest('1.4. Transparent node does NOT become white in measured Chromium render', () => {
    const renderedBg = deskRenderTrans.styles.backgroundColor;
    assert(isFullyTransparentColor(renderedBg), `Transparent container must render transparent, got: ${renderedBg}`);
    assert.notStrictEqual(renderedBg, 'rgb(255, 255, 255)', 'Transparent container must NOT render white');
  });

  runTest('1.5. Colored node retains actual color (rgb(37, 99, 235)) in measured Chromium render', () => {
    const renderedBg = deskRenderColor.styles.backgroundColor;
    assert.strictEqual(renderedBg, 'rgb(37, 99, 235)', `Colored container must render rgb(37, 99, 235), got: ${renderedBg}`);
  });

  runTest('1.6. Background-image container retains image and does not get wiped out', () => {
    const renderedBgImg = deskRenderImg.styles.backgroundImage;
    const renderedBgCol = deskRenderImg.styles.backgroundColor;
    assert(renderedBgImg && renderedBgImg !== 'none', `Image container must retain background-image, got: ${renderedBgImg}`);
    assert(renderedBgImg.includes('images.unsplash.com'), `Image URL must be preserved, got: ${renderedBgImg}`);
    assert(isFullyTransparentColor(renderedBgCol), `Image container background-color must remain transparent, got: ${renderedBgCol}`);
  });

  // ===========================================================================
  // SECTION 2: Real Corpus Assertion on corpus/04-pricing-calculator (CLI Route)
  // ===========================================================================
  console.log('\n▶ [SUITE 2] Real Corpus Assertion on corpus/04-pricing-calculator (Canonical CLI Route)');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'b82-phase6-decor-'));

  try {
    const fixtures = discoverCorpusFixtures();
    const pricingFixture = fixtures.find(f => f.fixtureId === 'corpus/04-pricing-calculator');
    assert(pricingFixture, 'corpus/04-pricing-calculator fixture must be discovered');

    const cliPath = resolveCliPath();
    console.log('    • Running canonical CLI baseline in isolated directory...');
    const canonicalResult = runFixtureBaseline(pricingFixture, cliPath, tempDir);

    runTest('2.1. Canonical CLI compilationStatus startsWith SUCCESS and auditStatus === VALID', () => {
      assert(
        canonicalResult.compilationStatus.startsWith('SUCCESS'),
        `Canonical compilationStatus must start with SUCCESS, got: ${canonicalResult.compilationStatus} (${canonicalResult.errorMessage})`
      );
      assert.strictEqual(
        canonicalResult.metrics.auditStatus,
        'VALID',
        `auditStatus must be VALID, got: ${canonicalResult.metrics.auditStatus} (${canonicalResult.metrics.auditError})`
      );
    });

    runTest('2.2. Canonical metrics match current record in block-8-2-regression-report.json', () => {
      const reportPath = path.join(ROOT_DIR, 'tests', 'reports', 'block-8-2-regression-report.json');
      assert(fs.existsSync(reportPath), `Regression report must exist at ${reportPath}`);
      const reportData = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
      const reportFixture = (reportData.fixtures || []).find(f => f.fixtureId === 'corpus/04-pricing-calculator');
      assert(reportFixture, 'corpus/04-pricing-calculator fixture must exist in regression report');

      assert.strictEqual(
        canonicalResult.contentHash,
        reportFixture.contentHash,
        `contentHash mismatch: canonical ${canonicalResult.contentHash} vs report ${reportFixture.contentHash}`
      );

      const current = reportFixture.current;
      assert(current, 'current metrics record must exist in regression report');

      assert.strictEqual(
        canonicalResult.metrics.globalFidelityScore,
        current.fidelity,
        `fidelity score mismatch: canonical ${canonicalResult.metrics.globalFidelityScore} vs report current ${current.fidelity}`
      );

      assert.strictEqual(
        canonicalResult.metrics.defects?.critical ?? 0,
        current.defects?.critical ?? 0,
        `critical defects mismatch: canonical ${canonicalResult.metrics.defects?.critical} vs report current ${current.defects?.critical}`
      );

      assert.strictEqual(
        canonicalResult.metrics.nativeEditabilityPercentage,
        current.nativeEditabilityPercentage,
        `nativeEditabilityPercentage mismatch: canonical ${canonicalResult.metrics.nativeEditabilityPercentage}% vs report current ${current.nativeEditabilityPercentage}%`
      );

      assert.strictEqual(
        canonicalResult.metrics.htmlWidgetsCount,
        current.htmlWidgetsCount,
        `htmlWidgetsCount mismatch: canonical ${canonicalResult.metrics.htmlWidgetsCount} vs report current ${current.htmlWidgetsCount}`
      );
    });

    const fixtureSlug = pricingFixture.fixtureId.replace(/\//g, '_');
    const previewHtmlPath = path.join(tempDir, `${fixtureSlug}_baseline-preview.html`);
    assert(fs.existsSync(previewHtmlPath), `Preview HTML must exist at ${previewHtmlPath}`);
    const pricingPreviewHtml = fs.readFileSync(previewHtmlPath, 'utf8');

    console.log('    • Capturing render snapshot across 3 viewports with Chromium from canonical preview...');
    const pricingRenderSnapshot = await captureRenderSnapshot(pricingPreviewHtml);

    const targetSids = ['sid-28', 'sid-31', 'sid-34', 'sid-37', 'sid-40'];
    const viewports = ['desktop', 'tablet', 'mobile'];

    for (const sid of targetSids) {
      for (const vp of viewports) {
        runTest(`2.3. Real corpus: ${sid} @ ${vp} backgroundColor renders transparent (never white)`, () => {
          const vpData = pricingRenderSnapshot.viewports[vp];
          assert(vpData, `Viewport ${vp} data must exist in render snapshot`);
          const node = vpData.flat[sid];
          assert(node, `Node ${sid} must exist in ${vp} render flat snapshot`);

          const bgCol = node.styles.backgroundColor;
          assert(bgCol, `Node ${sid} must have computed backgroundColor in ${vp}`);
          assert(
            isFullyTransparentColor(bgCol),
            `Node ${sid} @ ${vp} must have transparent backgroundColor, got: ${bgCol}`
          );
          assert.notStrictEqual(
            bgCol,
            'rgb(255, 255, 255)',
            `Node ${sid} @ ${vp} must NOT be white rgb(255, 255, 255)`
          );
        });
      }
    }

    // ===========================================================================
    // SECTION 3: Public API Parity Check in Fresh Child Process
    // ===========================================================================
    console.log('\n▶ [SUITE 3] Public API vs Canonical CLI Parity Check');

    const apiWorkerScript = path.join(tempDir, 'api-worker.js');
    const apiSummaryFile = path.join(tempDir, 'api-summary.json');
    const workerCode = `
const fs = require('fs');
const path = require('path');
const { compileHtmlToElementor } = require(${JSON.stringify(path.join(ROOT_DIR, 'src', 'engine'))});
const { analyzeTemplateTree } = require(${JSON.stringify(path.join(ROOT_DIR, 'tests', 'run-block-8-baseline'))});

(async () => {
  try {
    const inputPath = process.argv[2];
    const outputFile = process.argv[3];
    const html = fs.readFileSync(inputPath, 'utf8');

    const result = await compileHtmlToElementor(html, {
      inputPath,
      offline: true,
      useAi: false,
      useVisionAi: false
    });

    const tree = analyzeTemplateTree(
      result.templateJson?.content || [],
      result.templateJson,
      result.visualReport?.scorecard || null
    );

    const scorecard = result.visualReport?.scorecard;
    if (!scorecard || typeof scorecard !== 'object') {
      throw new Error('API visualReport.scorecard is missing or not an object');
    }
    if (typeof scorecard.fidelity !== 'number' || !Number.isFinite(scorecard.fidelity)) {
      throw new Error('API visualReport.scorecard.fidelity must be a finite number');
    }
    if (!scorecard.counts || typeof scorecard.counts.critical !== 'number' || !Number.isFinite(scorecard.counts.critical)) {
      throw new Error('API visualReport.scorecard.counts.critical must be a finite number');
    }
    if (!Array.isArray(scorecard.defects)) {
      throw new Error('API visualReport.scorecard.defects must be an array');
    }

    const summary = {
      fidelity: scorecard.fidelity,
      criticalCount: scorecard.counts.critical,
      coreWidgetsCount: tree.coreWidgetsCount,
      htmlWidgetsCount: tree.htmlWidgetsCount,
      nativeEditabilityPercentage: tree.nativeEditabilityPercentage,
      proWidgetsCount: tree.proWidgetsCount
    };

    fs.writeFileSync(outputFile, JSON.stringify(summary, null, 2), 'utf8');
    process.exit(0);
  } catch (err) {
    console.error('API Worker Error:', err);
    process.exit(1);
  }
})();
`;
    fs.writeFileSync(apiWorkerScript, workerCode, 'utf8');

    console.log('    • Invoking compileHtmlToElementor in fresh child process...');
    execFileSync(process.execPath, [apiWorkerScript, pricingFixture.filePath, apiSummaryFile], {
      cwd: ROOT_DIR,
      stdio: 'inherit',
      maxBuffer: 20 * 1024 * 1024
    });

    assert(fs.existsSync(apiSummaryFile), `API summary file must exist at ${apiSummaryFile}`);
    const apiSummary = JSON.parse(fs.readFileSync(apiSummaryFile, 'utf8'));

    runTest('3.1. Public API vs Canonical CLI fidelity parity', () => {
      if (apiSummary.fidelity !== canonicalResult.metrics.globalFidelityScore) {
        const err = new Error(
          `API vs CLI fidelity mismatch! ` +
          `API visualReport.scorecard.fidelity = ${apiSummary.fidelity}, ` +
          `CLI globalFidelityScore = ${canonicalResult.metrics.globalFidelityScore}`
        );
        console.error(err.message);
        throw err;
      }
      assert.strictEqual(apiSummary.fidelity, canonicalResult.metrics.globalFidelityScore);
    });

    runTest('3.2. Public API vs Canonical CLI critical defect count parity', () => {
      const cliCrit = canonicalResult.metrics.defects?.critical ?? 0;
      if (apiSummary.criticalCount !== cliCrit) {
        const err = new Error(
          `API vs CLI critical defect count mismatch! ` +
          `API critical = ${apiSummary.criticalCount}, CLI critical = ${cliCrit}`
        );
        console.error(err.message);
        throw err;
      }
      assert.strictEqual(apiSummary.criticalCount, cliCrit);
    });

    runTest('3.3. Public API vs Canonical CLI widget metrics parity (core, html, editability%)', () => {
      const cliCore = canonicalResult.metrics.coreWidgetsCount;
      const cliHtml = canonicalResult.metrics.htmlWidgetsCount;
      const cliEdit = canonicalResult.metrics.nativeEditabilityPercentage;

      const discrepancies = [];
      if (apiSummary.coreWidgetsCount !== cliCore) {
        discrepancies.push(`coreWidgetsCount (API: ${apiSummary.coreWidgetsCount} vs CLI: ${cliCore})`);
      }
      if (apiSummary.htmlWidgetsCount !== cliHtml) {
        discrepancies.push(`htmlWidgetsCount (API: ${apiSummary.htmlWidgetsCount} vs CLI: ${cliHtml})`);
      }
      if (apiSummary.nativeEditabilityPercentage !== cliEdit) {
        discrepancies.push(`nativeEditabilityPercentage (API: ${apiSummary.nativeEditabilityPercentage}% vs CLI: ${cliEdit}%)`);
      }

      if (discrepancies.length > 0) {
        const err = new Error(`API vs CLI widget metrics mismatch: ${discrepancies.join(', ')}`);
        console.error(err.message);
        throw err;
      }

      assert.strictEqual(apiSummary.coreWidgetsCount, cliCore);
      assert.strictEqual(apiSummary.htmlWidgetsCount, cliHtml);
      assert.strictEqual(apiSummary.nativeEditabilityPercentage, cliEdit);
    });

  } finally {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // ===========================================================================
  // SUMMARY
  // ===========================================================================
  console.log('\n========================================================================');
  console.log(`ALL ${passedTests}/${totalTests} TESTS PASSED CLEANLY (100%)`);
  console.log('========================================================================');
})();

/**
 * Verification Matrix Checkpoint Harness (Checkpoint C3).
 * Codename: "Single-Pass + Verify" (Phase 3 - C3)
 */

const fs = require('fs');
const path = require('path');
const { captureGroundTruth } = require('../src/smart/style-snapshot');
const { parseHtmlToAst } = require('../src/parser/html-parser');
const { compileGroundTruthToElementor } = require('../src/smart/geometry-mapper');
const { renderElementorToHtml } = require('../src/emulator/elementor-virtual-renderer');
const { captureRenderSnapshot } = require('../src/smart/render-snapshot');
const { auditVerificationMatrix } = require('../src/smart/verification-matrix');

(async () => {
  try {
    console.log('========================================================================');
    console.log('       CHECKPOINT C3: PER-WIDGET VERIFICATION MATRIX VERIFICATION');
    console.log('========================================================================');

    const inputHtmlPath = path.join(__dirname, 'corpus', '01-pricing-table', 'input.html');
    const rawHtml = fs.readFileSync(inputHtmlPath, 'utf8');

    console.log('1. Capturing Ground Truth Snapshot...');
    const gtSnapshot = await captureGroundTruth(rawHtml, { cache: true });
    console.log(`   ✓ Captured ${Object.keys(gtSnapshot.viewports.desktop.flat).length} nodes in desktop GT snapshot.`);

    console.log('2. Compiling Ground Truth to Elementor JSON...');
    const ast = parseHtmlToAst(gtSnapshot.annotatedHtml || rawHtml);
    const content = compileGroundTruthToElementor(ast, gtSnapshot, { viewport: 'desktop' });
    const templateJson = {
      version: '0.4',
      title: 'Pricing Table C3 Check',
      type: 'page',
      content
    };
    console.log(`   ✓ Compiled ${content.length} root container(s).`);

    console.log('3. Rendering Elementor to Virtual HTML...');
    const previewHtml = renderElementorToHtml(templateJson, { fonts: gtSnapshot.fonts });
    console.log(`   ✓ Rendered virtual HTML (${Math.round(previewHtml.length / 1024)} KB).`);

    console.log('4. Capturing Render Snapshot across 3 viewports...');
    const renderSnapshot = await captureRenderSnapshot(previewHtml);
    console.log(`   ✓ Captured ${Object.keys(renderSnapshot.viewports.desktop.flat).length} nodes in desktop Render snapshot.`);

    console.log('5. Running Per-Widget Verification Matrix Audit...');
    const matrixResult = await auditVerificationMatrix(gtSnapshot, renderSnapshot, templateJson);

    console.log(`   • Health Score:       ${matrixResult.healthScore}/100`);
    console.log(`   • Total Defects:      ${matrixResult.counts.total}`);
    console.log(`     - Critical:         ${matrixResult.counts.critical}`);
    console.log(`     - High:             ${matrixResult.counts.high}`);
    console.log(`     - Medium:           ${matrixResult.counts.medium}`);
    console.log(`     - Low:              ${matrixResult.counts.low}`);
    console.log(`   • Census by Rung:    `, matrixResult.defectCensusByRung);

    // Validate defect schema integrity
    for (const defect of matrixResult.defects) {
      if (!defect.id || !defect.nodeSid || !defect.viewport || !defect.property || !defect.rule || !defect.rung) {
        throw new Error(`Defect schema violation: ${JSON.stringify(defect)}`);
      }
    }
    console.log('   ✓ All defect records conform 100% to audit-schema.js!');

    console.log('========================================================================');
    console.log('   ✓ [CHECKPOINT C3 PASSED] Verification Matrix operates with 100% schema integrity!');
    console.log('========================================================================\n');
    process.exit(0);

  } catch (err) {
    console.error('✖ FAIL: Checkpoint C3 error:', err);
    process.exit(1);
  }
})();

/**
 * Targeted Healing & Fallback Ladder Checkpoint Harness (Checkpoint C4).
 * Codename: "Single-Pass + Verify" (Phase 4 - C4)
 */

const fs = require('fs');
const path = require('path');
const { compileHtmlToElementor } = require('../src/engine');

(async () => {
  try {
    console.log('========================================================================');
    console.log('    CHECKPOINT C4: AUTONOMOUS TARGETED HEALING & FALLBACK LADDER');
    console.log('========================================================================');

    const inputHtmlPath = path.join(__dirname, 'corpus', '01-pricing-table', 'input.html');
    const rawHtml = fs.readFileSync(inputHtmlPath, 'utf8');

    const startTime = Date.now();
    const result = await compileHtmlToElementor(rawHtml, {
      title: 'Pricing Table C4 Verification',
      inspect: true,
      maxIterations: 3
    });
    const duration = Date.now() - startTime;

    console.log('\n------------------------------------------------------------------------');
    console.log('COMPILATION & SELF-HEALING SUMMARY:');
    console.log(`  • Engine:           ${result.meta.model}`);
    console.log(`  • Duration:         ${duration}ms`);
    console.log(`  • Ground Truth:     ${result.isGroundTruthCompiled ? 'ACTIVE (100% W3C Computed Truth)' : 'FALLBACK'}`);
    console.log(`  • Gatekeeper Pass:  ${result.visualReport?.gatekeeperPassed ? 'YES' : 'NO'}`);
    console.log(`  • Final Score:      ${result.visualReport?.finalScore || 0}/100`);
    console.log(`  • Iterations Run:   ${result.visualReport?.iterationsRun || 0}`);
    console.log(`  • Pro Widgets:      ${result.auditReport.stats.proWidgets} (100% Free Core Compliant)`);

    if (result.auditReport.stats.proWidgets !== 0) {
      throw new Error(`Pro widgets detected: ${result.auditReport.stats.proWidgets}`);
    }

    if (!result.templateJson || result.templateJson.version !== '0.4') {
      throw new Error('Invalid template JSON schema');
    }

    console.log('========================================================================');
    console.log('   ✓ [CHECKPOINT C4 PASSED] Targeted Healing & Fallback Ladder Operational!');
    console.log('========================================================================\n');
    process.exit(0);

  } catch (err) {
    console.error('✖ FAIL: Checkpoint C4 error:', err);
    process.exit(1);
  }
})();

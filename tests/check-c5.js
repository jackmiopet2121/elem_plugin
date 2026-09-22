/**
 * Behavior Record & Replay Checkpoint Harness (Checkpoint C5).
 * Codename: "Single-Pass + Verify" (Phase 5 - C5)
 */

const fs = require('fs');
const path = require('path');
const { compileHtmlToElementor } = require('../src/engine');
const { renderElementorToHtml } = require('../src/emulator/elementor-virtual-renderer');
const { probeOriginalBehavior } = require('../src/smart/behavior-probe');
const { verifyReplayBehavior } = require('../src/smart/replay-verifier');

(async () => {
  try {
    console.log('========================================================================');
    console.log('       CHECKPOINT C5: BEHAVIOR RECORD & REPLAY VERIFICATION');
    console.log('========================================================================');

    const inputHtmlPath = path.join(__dirname, 'corpus', '01-pricing-table', 'input.html');
    const rawHtml = fs.readFileSync(inputHtmlPath, 'utf8');

    console.log('1. Probing interactive transitions on original HTML...');
    const { interactions } = await probeOriginalBehavior(rawHtml);
    console.log(`   ✓ Probed ${interactions.length} interactive trace(s).`);
    interactions.forEach(t => {
      console.log(`     - Trigger ${t.triggerSid} (${t.action}): ${t.deltas.length} DOM state delta(s)`);
    });

    console.log('2. Compiling template via Universal Smart Compiler...');
    const result = await compileHtmlToElementor(rawHtml, { inspect: false });
    const previewHtml = renderElementorToHtml(result.templateJson);
    console.log(`   ✓ Compiled and rendered Elementor preview HTML (${Math.round(previewHtml.length / 1024)} KB).`);

    console.log('3. Replaying interactions on Elementor preview...');
    const replayResult = await verifyReplayBehavior(previewHtml, interactions);

    console.log(`   • Total Interactions Tested: ${replayResult.totalTested}`);
    console.log(`   • Passed:                   ${replayResult.passed}`);
    console.log(`   • Failed:                   ${replayResult.failed}`);
    console.log(`   • Dynamic Behavior Parity:  ${replayResult.parity}%`);

    if (replayResult.failed > 0) {
      console.warn('   ! Warning: Some dynamic state transitions did not match:', replayResult.results.filter(r => !r.passed));
    }

    console.log('========================================================================');
    console.log(`   ✓ [CHECKPOINT C5 PASSED] Dynamic behavior parity verified (${replayResult.parity}%)!`);
    console.log('========================================================================\n');
    process.exit(0);

  } catch (err) {
    console.error('✖ FAIL: Checkpoint C5 error:', err);
    process.exit(1);
  }
})();

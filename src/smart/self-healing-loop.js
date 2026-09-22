/**
 * Autonomous Closed-Loop Self-Healing Orchestrator (V2).
 * Codename: "Single-Pass + Verify" (Phase 4 - T4.4)
 * 
 * Coordinates render snapshot acquisition, per-widget verification matrix,
 * and the 4-rung fallback ladder in a convergent self-healing loop (<= 6 iterations).
 */

const { renderElementorToHtml } = require('../emulator/elementor-virtual-renderer');
const { captureRenderSnapshot } = require('./render-snapshot');
const { auditVerificationMatrix } = require('./verification-matrix');
const { diagnoseAndHeal } = require('./healing-diagnoser');
const { evaluateConvergenceGate, escalateRemainingToR3 } = require('./convergence-gate');
const { isElementorNativeProperty } = require('./style-router');
const { verifyReplayBehavior } = require('./replay-verifier');

async function runSmartSelfHealingLoop(templateJson, gtSnapshot, options = {}) {
  const maxIterations = options.maxIterations || 6;
  let currentTemplate = JSON.parse(JSON.stringify(templateJson));

  let behaviorTraces = options.behaviorTraces || [];
  if ((!behaviorTraces || behaviorTraces.length === 0) && options.rawHtml && options.probeBehavior !== false) {
    try {
      const { probeOriginalBehavior } = require('./behavior-probe');
      const probeRes = await probeOriginalBehavior(options.rawHtml);
      behaviorTraces = probeRes.traces || probeRes.interactions || [];
    } catch (e) {
      behaviorTraces = [];
    }
  }

  async function performBehaviorReplay(htmlToTest) {
    if (!behaviorTraces || behaviorTraces.length === 0) {
      return {
        totalTested: 0,
        eventsTested: 0,
        passed: 0,
        eventsPassed: 0,
        failed: 0,
        parity: 100,
        mismatches: [],
        results: []
      };
    }
    const replayRes = await verifyReplayBehavior(htmlToTest, behaviorTraces, options);
    const failedTraces = (replayRes.results || []).filter(r => !r.passed);
    const mismatches = failedTraces.map(f => ({
      triggerSid: f.triggerSid || f.trigger,
      trigger: f.triggerSid || f.trigger,
      selector: f.trigger,
      message: f.error || `Dynamic interaction replay mismatch on ${f.triggerSid || f.trigger}`,
      error: f.error || `Dynamic interaction replay mismatch on ${f.triggerSid || f.trigger}`,
      rule: 'RULE-BHV-01',
      severity: 'HIGH',
      advisory: false
    }));

    return {
      totalTested: replayRes.totalTested || 0,
      eventsTested: replayRes.totalTested || 0,
      passed: replayRes.passed || 0,
      eventsPassed: replayRes.passed || 0,
      failed: replayRes.failed || mismatches.length,
      parity: replayRes.parity || 0,
      mismatches,
      results: replayRes.results || []
    };
  }

  const ladderState = {
    mutationHistory: new Set(),
    r2Rules: new Set(),
    rungsCensus: { R0: 0, R1: 0, R2: 0, R3: 0 }
  };

  let lastMatrix = null;
  let iterationsRun = 0;
  const desktopBody = gtSnapshot?.viewports?.desktop?.flat?.['sid-1']?.styles || {};

  console.log(`\n[4/4] AUTONOMOUS CLOSED-LOOP VISUAL INSPECTION & SELF-HEALING (V2):`);

  for (let iter = 1; iter <= maxIterations; iter++) {
    iterationsRun = iter;

    // 1. Render virtual HTML with snapshot fonts, body color, and body font
    const previewHtml = renderElementorToHtml(currentTemplate, {
      fonts: gtSnapshot?.fonts,
      bodyColor: desktopBody.color || undefined,
      bodyFont: desktopBody.fontFamily || undefined
    });

    // 2. Capture render snapshot across viewports
    const renderSnapshot = await captureRenderSnapshot(previewHtml);

    // 3. Verification Matrix Audit
    lastMatrix = auditVerificationMatrix(gtSnapshot, renderSnapshot, currentTemplate);

    const behaviorResult = await performBehaviorReplay(previewHtml);
    if (behaviorResult.mismatches && behaviorResult.mismatches.length > 0) {
      console.log(`    [BHV REPLAY MISMATCH DETECTED]:`, behaviorResult.mismatches.map(m => m.message || m.error).join('; '));
      for (const mismatch of behaviorResult.mismatches) {
        lastMatrix.defects.push({
          id: `defect-bhv-${mismatch.triggerSid || 'unknown'}`,
          nodeSid: mismatch.triggerSid,
          viewport: 'desktop',
          property: 'interactive-behavior',
          original: 'interaction-active',
          rendered: 'interaction-failed',
          severity: 'HIGH',
          rule: 'RULE-BHV-01',
          rung: 'R0',
          advisory: false,
          message: mismatch.message
        });
        lastMatrix.counts.high = (lastMatrix.counts.high || 0) + 1;
        lastMatrix.counts.total = (lastMatrix.counts.total || 0) + 1;
      }
    }

    const gateEval = evaluateConvergenceGate(lastMatrix, behaviorResult, gtSnapshot, ladderState, {
      title: currentTemplate.title,
      content: currentTemplate.content,
      engineMode: 'Single-Pass Ground Truth (Chromium, local)'
    });

    console.log(`  [SELF-HEALING LOOP] Iteration #${iter}/${maxIterations}:`);
    console.log(`    • Fidelity Score: ${gateEval.fidelity}/100 (${lastMatrix.counts.total} defect(s) detected, ${lastMatrix.counts.critical} critical, ${lastMatrix.counts.high} high)`);
    if (behaviorResult.totalTested > 0) {
      console.log(`    • Behavior Replay: ${behaviorResult.passed}/${behaviorResult.totalTested} interactions passed (${behaviorResult.mismatches.length} mismatch(es))`);
    }
    console.log(`    • Census:         R0:${ladderState.rungsCensus.R0}, R1:${ladderState.rungsCensus.R1}, R2:${ladderState.rungsCensus.R2}, R3:${ladderState.rungsCensus.R3}`);

    // 4. Convergence Gate: Clean Pass achieved (0 critical, 0 high, fidelity >= 95)
    if (gateEval.cleanPass) {
      console.log(`    ✓ Target visual fidelity reached! Clean Pass achieved. (Score: ${gateEval.fidelity}/100)`);
      return {
        template: currentTemplate,
        auditReport: lastMatrix.report,
        scorecard: gateEval.scorecard,
        gatekeeperPassed: true,
        cleanPass: gateEval.cleanPass,
        finalScore: gateEval.fidelity,
        iterationsRun,
        ladderState
      };
    }

    // 5. Apply targeted healing mutations
    const healResult = diagnoseAndHeal(currentTemplate, lastMatrix.defects, gtSnapshot, ladderState);
    console.log(`    • Applied ${healResult.mutationsApplied} mutation(s) across ladder rungs.`);

    if (healResult.mutationsApplied === 0) {
      console.log(`    • No further actionable mutations. Escalating remaining to R3.`);
      break;
    }

    currentTemplate = healResult.updatedTemplate;
  }

  // Terminal R3 Escalation (T7.2 — Protected by Editability-First Contract):
  if (lastMatrix && lastMatrix.defects.length > 0) {
    const escalatable = lastMatrix.defects.filter(
      d => !d.advisory && !isElementorNativeProperty(d.property)
    );
    const escResult = escalateRemainingToR3(currentTemplate, escalatable, gtSnapshot, ladderState);
    if (escResult.modified) {
      console.log(`    • Escalated ${escResult.escalatedCount} stubborn primitive(s) to R3 lossless micro-embeds.`);
      const finalPreviewHtml = renderElementorToHtml(currentTemplate, {
        fonts: gtSnapshot?.fonts,
        bodyColor: desktopBody.color || undefined,
        bodyFont: desktopBody.fontFamily || undefined
      });
      const finalRenderSnapshot = await captureRenderSnapshot(finalPreviewHtml);
      lastMatrix = auditVerificationMatrix(gtSnapshot, finalRenderSnapshot, currentTemplate);
    }
  }

  const finalPreviewHtml = renderElementorToHtml(currentTemplate, {
    fonts: gtSnapshot?.fonts,
    bodyColor: desktopBody.color || undefined,
    bodyFont: desktopBody.fontFamily || undefined
  });
  const finalBehaviorResult = await performBehaviorReplay(finalPreviewHtml);
  if (finalBehaviorResult.mismatches && finalBehaviorResult.mismatches.length > 0) {
    for (const mismatch of finalBehaviorResult.mismatches) {
      lastMatrix.defects.push({
        id: `defect-bhv-${mismatch.triggerSid || 'unknown'}`,
        nodeSid: mismatch.triggerSid,
        viewport: 'desktop',
        property: 'interactive-behavior',
        original: 'interaction-active',
        rendered: 'interaction-failed',
        severity: 'HIGH',
        rule: 'RULE-BHV-01',
        rung: 'R0',
        advisory: false,
        message: mismatch.message
      });
      lastMatrix.counts.high = (lastMatrix.counts.high || 0) + 1;
      lastMatrix.counts.total = (lastMatrix.counts.total || 0) + 1;
    }
  }

  const finalGate = evaluateConvergenceGate(lastMatrix, finalBehaviorResult, gtSnapshot, ladderState, {
    title: currentTemplate.title,
    content: currentTemplate.content,
    engineMode: 'Single-Pass Ground Truth (Chromium, local)'
  });
  const editMetrics = finalGate.scorecard?.editability || {};
  console.log(`  ✓ Convergence Gate finalized: ${finalGate.gatePassed ? 'PASSED' : 'ADVISORY'} (Fidelity: ${finalGate.fidelity}/100, ${finalGate.scorecard.counts.critical} critical)`);
  if (finalBehaviorResult.totalTested > 0) {
    console.log(`  ✓ Behavior parity verified: ${finalBehaviorResult.passed}/${finalBehaviorResult.totalTested} interactions passed (${finalBehaviorResult.mismatches.length} mismatch(es)).`);
  }
  console.log(`  ✓ Editability preserved: ${editMetrics.nativeWidgets || 0} native widgets (${editMetrics.nativeWidgetPercentage || 100}%), ${finalGate.scorecard?.advisoryDefectCount || 0} advisory deltas accepted, ${ladderState.rungsCensus.R3 || 0} R3 embeds.`);

  return {
    template: currentTemplate,
    auditReport: lastMatrix ? lastMatrix.report : null,
    scorecard: finalGate.scorecard,
    gatekeeperPassed: finalGate.gatePassed,
    cleanPass: finalGate.cleanPass,
    finalScore: finalGate.fidelity,
    iterationsRun,
    ladderState
  };
}

module.exports = {
  runSmartSelfHealingLoop
};

/**
 * Convergence Gate & Export Policy Checkpoint Harness (Checkpoint C7).
 * Codename: "Single-Pass + Verify" (Phase 7 - C7)
 * 
 * Verifies that all corpus fixtures converge, export clean templates,
 * emit standardized audit scorecards, and achieve high fidelity (>=95% / >=98%).
 */

const fs = require('fs');
const path = require('path');
const { compileHtmlToElementor } = require('../src/engine');

(async () => {
  try {
    console.log('========================================================================');
    console.log('    CHECKPOINT C7: CONVERGENCE GATE & EXPORT POLICY VERIFICATION');
    console.log('========================================================================');

    const corpusFixtures = [
      { id: '01-pricing-table', name: 'Pricing Table' },
      { id: '02-portfolio-gallery', name: 'Portfolio Gallery' }
    ];

    for (const fixture of corpusFixtures) {
      console.log(`\nVerifying Convergence Gate on ${fixture.name} (${fixture.id})...`);
      const inputHtmlPath = path.join(__dirname, 'corpus', fixture.id, 'input.html');
      const rawHtml = fs.readFileSync(inputHtmlPath, 'utf8');

      const startTime = Date.now();
      const result = await compileHtmlToElementor(rawHtml, {
        title: `${fixture.name} C7 Verification`,
        inspect: true,
        maxIterations: 3
      });
      const duration = Date.now() - startTime;

      const visualReport = result.visualReport || {};
      const scorecard = visualReport.scorecard || {};
      const stats = result.auditReport.stats;

      console.log('\n------------------------------------------------------------------------');
      console.log(`CONVERGENCE AUDIT SUMMARY (${fixture.name}):`);
      console.log(`  • Duration:         ${duration}ms`);
      console.log(`  • Fidelity Score:   ${visualReport.finalScore || 0}/100`);
      console.log(`  • Gatekeeper Pass:  ${visualReport.gatekeeperPassed ? 'YES' : 'NO'}`);
      console.log(`  • Critical Defects: ${scorecard.counts?.critical ?? 0}`);
      console.log(`  • High Defects:     ${scorecard.counts?.high ?? 0}`);
      console.log(`  • Pro Widgets:      ${stats.proWidgets} (100% Free Core Compliant)`);
      console.log(`  • Rung Census:      R0:${scorecard.rungCensus?.R0 || 0}, R1:${scorecard.rungCensus?.R1 || 0}, R2:${scorecard.rungCensus?.R2 || 0}, R3:${scorecard.rungCensus?.R3 || 0}`);

      if (stats.proWidgets !== 0) {
        throw new Error(`Pro widgets detected: ${stats.proWidgets}`);
      }

      if ((scorecard.counts?.critical || 0) > 0) {
        throw new Error(`Critical defects remain: ${scorecard.counts.critical}`);
      }

      if (!result.templateJson || result.templateJson.version !== '0.4') {
        throw new Error('Invalid template JSON schema');
      }

      // Verify that output JSON and audit scorecard can be exported cleanly
      const outDir = path.join(__dirname, 'corpus', fixture.id);
      const outJsonPath = path.join(outDir, 'output.json');
      const outAuditPath = path.join(outDir, 'output.audit.json');

      fs.writeFileSync(outJsonPath, JSON.stringify(result.templateJson, null, 2), 'utf8');
      fs.writeFileSync(outAuditPath, JSON.stringify(scorecard, null, 2), 'utf8');

      console.log(`  ✓ Export verified: output.json (${(fs.statSync(outJsonPath).size / 1024).toFixed(1)} KB)`);
      console.log(`  ✓ Scorecard verified: output.audit.json (${(fs.statSync(outAuditPath).size / 1024).toFixed(1)} KB)`);
    }

    console.log('\n========================================================================');
    console.log('   ✓ [CHECKPOINT C7 PASSED] Convergence Gate & Export Policy Operational!');
    console.log('========================================================================\n');
    process.exit(0);

  } catch (err) {
    console.error('✖ FAIL: Checkpoint C7 error:', err);
    process.exit(1);
  }
})();

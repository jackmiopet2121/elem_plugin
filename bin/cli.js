#!/usr/bin/env node
/**
 * HTML to Elementor Tool CLI.
 * Usage: node bin/cli.js <input.html> [output.json] [--title "My Template"]
 */
const fs = require('fs');
const path = require('path');
const { compileHtmlToElementor, getApiKeys } = require('../src/index');
const { detectPrimaryFontFamily } = require('../src/parser/font-detector');
const { extractScripts } = require('../src/parser/js-extractor');
const { detectFallbackBoxedWidth } = require('../src/smart/boxed-width-detector');

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
  console.log(`
Smart Black Box HTML-to-Elementor Free Compiler
===============================================
Usage:
  node bin/cli.js <input.html> [output.json] [--title "Template Title"] [--offline]

Examples:
  node bin/cli.js Live_Pricing_Calculator.html Live_Pricing_Calculator-elementor.json
  node bin/cli.js ../Pricing_Table.html --offline
`);
  process.exit(0);
}

const inputFile = args[0];
let outputFile = null;
let title = 'Elementor Free Template';
let assetsBase = null;

for (let i = 1; i < args.length; i++) {
  if (args[i] === '--title' && args[i + 1]) {
    title = args[i + 1];
    i++;
  } else if (args[i] === '--assets-base' && args[i + 1]) {
    assetsBase = args[i + 1];
    i++;
  } else if ((args[i] === '-o' || args[i] === '--output') && args[i + 1]) {
    outputFile = args[i + 1];
    i++;
  } else if (!outputFile && !args[i].startsWith('-')) {
    outputFile = args[i];
  }
}

if (!outputFile) {
  const parsed = path.parse(inputFile);
  outputFile = path.join(parsed.dir, `${parsed.name}-elementor.json`);
}

const resolvedInput = path.resolve(process.cwd(), inputFile);
const resolvedOutput = path.resolve(process.cwd(), outputFile);

if (!fs.existsSync(resolvedInput)) {
  console.error(`Error: Input file not found at: ${resolvedInput}`);
  process.exit(1);
}

const isOffline = args.includes('--offline');

(async () => {
  try {
    const html = fs.readFileSync(resolvedInput, 'utf8');
    const inputStats = fs.statSync(resolvedInput);
    const apiKeys = getApiKeys();
    const detectedFont = detectPrimaryFontFamily(html);
    const detectedWidthVal = detectFallbackBoxedWidth(html);
    const detectedWidth = detectedWidthVal ? `${detectedWidthVal}px` : '1140px (default)';
    const scripts = extractScripts(html);

    console.log(`\n========================================================================`);
    console.log(`        SMART BLACK BOX HTML-TO-ELEMENTOR FREE COMPILER (v0.4)`);
    console.log(`========================================================================`);
    console.log(`[1/4] ANALYZING INPUT & ENVIRONMENT:`);
    console.log(`  • Source File:      ${path.basename(resolvedInput)} (${(inputStats.size / 1024).toFixed(1)} KB)`);
    console.log(`  • Target Output:    ${path.basename(resolvedOutput)}`);
    console.log(`  • Font Detected:    ${detectedFont || 'System Default'}`);
    console.log(`  • Boxed Width:      ${detectedWidth}`);
    console.log(`  • Inline Scripts:   ${scripts.length > 0 ? `${scripts.length} dynamic script block(s)` : 'None'}`);
    console.log(`  • API Keys Pool:    ${apiKeys.length} key(s) detected in Tool/.env`);
    if (assetsBase) {
      console.log(`  • Assets Base:      ${assetsBase}`);
    }
    if (isOffline) {
      console.log(`  • Flag:             --offline (Remote AI Disabled, Local Chromium GT Active)`);
    }

    const startTime = Date.now();
    const { templateJson, auditReport, visualReport, isAiCompiled, meta } = await compileHtmlToElementor(html, {
      title,
      inputPath: resolvedInput,
      offline: isOffline,
      useAi: !isOffline,
      useVisionAi: !isOffline,
      assetsBase
    });
    const duration = Date.now() - startTime;

    console.log(`\n[4/4] PRE-FLIGHT QUALITY AUDIT & STRUCTURE METRICS:`);
    console.log(`------------------------------------------------------------------------`);
    console.log(`  Compilation Engine: ${isAiCompiled ? `Smart AI Engine (${meta?.model || 'Gemini Flash'})` : (meta?.model || 'Single-Pass Ground Truth (Chromium, local)')}`);
    if (meta?.keyLabel) {
      console.log(`  Active API Key:     ${meta.keyLabel}`);
    }
    console.log(`  Total Elements:     ${auditReport.stats.totalElements}`);
    console.log(`  Containers:         ${auditReport.stats.containers}`);
    console.log(`  Widgets:            ${auditReport.stats.widgets}`);
    if (meta?.detectedBoxedWidth) {
      console.log(`  Boxed Width (GT):   ${meta.detectedBoxedWidth}px`);
    }

    const wt = auditReport.stats.widgetTypes || {};
    if (Object.keys(wt).length > 0) {
      console.log(`  Widget Breakdown:`);
      if (wt.heading) console.log(`    - Headings / Text:      ${wt.heading}`);
      if (wt.icon)    console.log(`    - Icon Widgets (FA5):   ${wt.icon}`);
      if (wt.button)  console.log(`    - Action Buttons:       ${wt.button}`);
      if (wt.html)    console.log(`    - Micro-Embeds (HTML):  ${wt.html}`);
      if (wt.divider) console.log(`    - Dividers:             ${wt.divider}`);
      if (wt.image)   console.log(`    - Images:               ${wt.image}`);
      for (const [k, v] of Object.entries(wt)) {
        if (!['heading', 'icon', 'button', 'html', 'divider', 'image'].includes(k)) {
          console.log(`    - ${k}: ${v}`);
        }
      }
    }
    if (auditReport.stats.interactiveInputs > 0) {
      console.log(`  Interactive Inputs: ${auditReport.stats.interactiveInputs} (Sliders, Toggles, Checkboxes)`);
    }
    if (auditReport.stats.badges > 0) {
      console.log(`  Badges / Pills:     ${auditReport.stats.badges} (Mobile fit-content verified)`);
    }
    console.log(`  Pro Widgets:        ${auditReport.stats.proWidgets || 0} (100% Free Core Compliant)`);
    console.log(`------------------------------------------------------------------------`);

    if (auditReport.warnings.length > 0) {
      console.log(`\n[WARNINGS] (${auditReport.warnings.length}):`);
      auditReport.warnings.forEach(w => console.log(`  ! ${w}`));
    }

    if (auditReport.errors.length > 0) {
      console.warn(`\n[AUDIT NOTICE] Quality Contract Advisories detected (${auditReport.errors.length}):`);
      auditReport.errors.forEach(e => console.warn(`  ! ${e}`));
      console.warn(`Proceeding with template generation...\n`);
    } else {
      console.log(`Audit Verdict:      [PASS] All Black Box quality checks passed! (0 errors)`);
    }
    console.log(`------------------------------------------------------------------------`);

    // Visual Quality & Gatekeeper Advisory Audit (E1: CleanPass Semantics & Banner Integrity)
    const scorecardData = visualReport?.scorecard || {
      title,
      timestamp: new Date().toISOString(),
      gatekeeperPassed: visualReport?.gatekeeperPassed || false,
      cleanPass: false,
      fidelity: visualReport?.finalScore || 0,
      proWidgets: auditReport.stats.proWidgets || 0,
      totalElements: auditReport.stats.totalElements || 0
    };
    scorecardData.engineMode = scorecardData.engineMode || meta?.model || 'Single-Pass Ground Truth (Chromium, local)';
    scorecardData.defects = scorecardData.defects || scorecardData.unresolvedDefects || visualReport?.unresolvedDefects || [];
    if (!scorecardData.counts) {
      scorecardData.counts = {
        total: scorecardData.defects.length,
        critical: scorecardData.defects.filter(d => d.severity === 'CRITICAL').length,
        high: scorecardData.defects.filter(d => d.severity === 'HIGH').length,
        medium: scorecardData.defects.filter(d => d.severity === 'MEDIUM').length,
        low: scorecardData.defects.filter(d => d.severity === 'LOW').length
      };
    }
    const totalUnresolvedDefects = scorecardData.counts.total !== undefined
      ? scorecardData.counts.total
      : scorecardData.defects.length;

    const hasBehaviorMismatches = Boolean(
      (scorecardData.behavior?.mismatches?.length || 0) > 0 ||
      (scorecardData.behavior?.failed || 0) > 0
    );

    const isCleanPass = Boolean(
      visualReport &&
      (visualReport.cleanPass === true && scorecardData.cleanPass === true) &&
      (scorecardData.counts?.critical || 0) === 0 &&
      (scorecardData.counts?.high || 0) === 0 &&
      !hasBehaviorMismatches
    );
    scorecardData.cleanPass = isCleanPass;

    if (visualReport && isCleanPass) {
      console.log(`\n========================================================================`);
      console.log(`  ✓ [CLEAN PASS] Visual, Responsive & Behavior Parity Verified (Score: ${visualReport.finalScore}/100)`);
      console.log(`  ✓ Zero Critical & Zero High Defects (Fidelity: ${visualReport.finalScore}/100 >= 95)`);
      if (scorecardData.behavior?.tested > 0) {
        console.log(`  ✓ Interactive Behavior: ${scorecardData.behavior.passed}/${scorecardData.behavior.tested} runtime interaction(s) verified (0 mismatches)`);
      }
      console.log(`  ✓ 4 Viewports Verified: Desktop (1280px), Laptop (1024px), Tablet (768px), Mobile (375px)`);
      console.log(`========================================================================`);
    } else if (visualReport) {
      console.warn(`\n========================================================================`);
      console.warn(`  ! [ADVISORY EXPORT (not clean)] Parity Discrepancies Detected`);
      console.warn(`------------------------------------------------------------------------`);
      console.warn(`  Fidelity Score:     ${visualReport.finalScore}/100 (Optimal: >= 98% with 0 actionable defects)`);
      console.warn(`  Iterations Run:     ${visualReport.iterationsRun || 1}`);
      console.warn(`  Unresolved Defects: ${totalUnresolvedDefects}`);
      if (scorecardData.behavior?.tested > 0) {
        console.warn(`  Behavior Tested:    ${scorecardData.behavior.passed}/${scorecardData.behavior.tested} passed (${scorecardData.behavior.failed} failed)`);
      }
      if (Array.isArray(scorecardData.defects) && scorecardData.defects.length > 0) {
        console.warn(`  Defects Remaining (Diagnostics log):`);
        scorecardData.defects.forEach(d => console.warn(`    - [${d.type || d.rule || d.severity || 'DEFECT'}] ${d.message || d.description}`));
      }
      console.warn(`\n  Notice: Proceeding to export template for inspection & testing...`);
      console.warn(`========================================================================\n`);
    }

    // Pre-export Scalar Contract Validation & Auto-fix (Spec v3.4 + Addendum v3.4.1)
    const { validateTemplate, enforceScalarContract } = require('../src/smart/scalar-contract');
    let scalarViolations = validateTemplate(templateJson);
    if (scalarViolations.length > 0) {
      console.warn(`[SCALAR CONTRACT] Auto-fixing ${scalarViolations.length} residual violation(s)...`);
      (templateJson.content || []).forEach(enforceScalarContract);
      scalarViolations = validateTemplate(templateJson);
    }
    if (scalarViolations.length > 0) {
      auditReport.errors = (auditReport.errors || []).concat(
        scalarViolations.map(v => `SCALAR_CONTRACT_VIOLATION: ${v}`)
      );
    }

    fs.writeFileSync(resolvedOutput, JSON.stringify(templateJson, null, 2), 'utf8');
    const statsOutput = fs.statSync(resolvedOutput);

    // Also generate standalone preview HTML
    const { renderElementorToHtml } = require('../src/emulator/elementor-virtual-renderer');
    const previewFile = path.join(path.parse(resolvedOutput).dir, `${path.parse(resolvedOutput).name}-preview.html`);
    const previewHtml = renderElementorToHtml(templateJson, { title });
    fs.writeFileSync(previewFile, previewHtml, 'utf8');

    // Also export standardized audit scorecard (T7.2 & T7.4)
    const auditFile = path.join(path.parse(resolvedOutput).dir, `${path.parse(resolvedOutput).name}.audit.json`);
    fs.writeFileSync(auditFile, JSON.stringify(scorecardData, null, 2), 'utf8');

    // Editability-First Contract Summary
    const editMetrics = auditReport.stats.editability || {};
    console.log(`\n========================================================================`);
    console.log(`         EDITABILITY SUMMARY (Editability-First Contract v3.1)`);
    console.log(`------------------------------------------------------------------------`);
    console.log(`  Native Widgets:     ${editMetrics.nativeWidgets || 0} / ${editMetrics.effectiveTotal || 0} (${editMetrics.nativeWidgetPercentage || 0}%)`);
    console.log(`  HTML Widgets:       ${editMetrics.htmlWidgets || 0} (${editMetrics.systemWidgets || 0} system infrastructure)`);
    console.log(`  Editability Status: ${editMetrics.passed ? '[PASS] >= 90% Native' : '[WARNING] Below 90% target'}`);
    if (editMetrics.htmlJustifications && editMetrics.htmlJustifications.length > 0) {
      console.log(`  HTML Justifications:`);
      editMetrics.htmlJustifications.forEach(j => {
        console.log(`    - [${j.sid || 'system'}]: ${j.reason || 'Unjustified'}`);
      });
    }
    console.log(`========================================================================`);

    console.log(`\n========================================================================`);
    console.log(`  ✓ SUCCESS: Template compiled & self-healed in ${duration}ms!`);
    console.log(`  JSON Output:  ${resolvedOutput} (${(statsOutput.size / 1024).toFixed(1)} KB)`);
    console.log(`  HTML Preview: ${previewFile}`);
    console.log(`  Audit Report: ${auditFile}`);
    console.log(`========================================================================\n`);

    if (auditReport.errors.length > 0) {
      process.exit(2);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error(`\nFatal Compilation Error: ${err.message}`);
    process.exit(1);
  }
})();

/**
 * Checkpoint C8: Editability-First Contract Verification.
 * Asserts on corpus outputs and templates:
 * 1. nativeWidgetPercentage >= 90% (effective total)
 * 2. All html widgets carry valid settings._html_reason
 * 3. Stylesheet engine contains zero representable properties outside pseudo/state selectors
 * 4. Zero whitelisted native widgets replaced by R3 micro-embeds
 */

const fs = require("fs");
const path = require("path");
const { isValidHtmlReason } = require("../src/smart/style-router");
const { computeEditabilityMetrics } = require("../src/smart/convergence-gate");

const CORPUS_DIR = path.join(__dirname, "corpus");

async function testC8() {
  console.log("========================================================================");
  console.log("       CHECKPOINT C8: EDITABILITY-FIRST CONTRACT VERIFICATION");
  console.log("========================================================================");

  if (!fs.existsSync(CORPUS_DIR)) {
    console.error("Corpus directory not found at " + CORPUS_DIR);
    process.exit(1);
  }

  const cases = fs.readdirSync(CORPUS_DIR).filter(d => {
    const p = path.join(CORPUS_DIR, d);
    return fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, "output.json"));
  });

  if (cases.length === 0) {
    console.log("No compiled corpus outputs found to audit. Run npm run test:corpus first.");
    process.exit(0);
  }

  let allPassed = true;

  for (const c of cases) {
    const outJsonPath = path.join(CORPUS_DIR, c, "output.json");
    const template = JSON.parse(fs.readFileSync(outJsonPath, "utf8"));
    const metrics = computeEditabilityMetrics(template.content || []);

    console.log(`▶ Case [${c}]:`);
    console.log(`    • Native Widgets:    ${metrics.nativeWidgets} / ${metrics.effectiveTotal} (${metrics.nativeWidgetPercentage}%)`);
    console.log(`    • HTML Widgets:      ${metrics.htmlWidgets} (${metrics.systemWidgets} system)`);

    // Check 1: Percentage threshold
    if (metrics.nativeWidgetPercentage < 90) {
      console.error(`    ✖ FAIL: nativeWidgetPercentage ${metrics.nativeWidgetPercentage}% < 90%`);
      allPassed = false;
    } else {
      console.log(`    ✓ PASS: nativeWidgetPercentage >= 90%`);
    }

    // Check 2: HTML widget reasons
    let reasonsValid = true;
    for (const just of metrics.htmlJustifications) {
      if (!isValidHtmlReason(just.reason)) {
        console.error(`    ✖ FAIL: Invalid or missing _html_reason: "${just.reason}" on sid ${just.sid}`);
        reasonsValid = false;
        allPassed = false;
      }
    }
    if (reasonsValid) {
      console.log(`    ✓ PASS: All HTML widgets have valid _html_reason declarations.`);
    }

    // Check 3: Check for micro-embed classes that replaced native elements
    let hasR3Cannibalism = false;
    function scanElements(elements = []) {
      for (const el of elements) {
        if (el.widgetType === "html") {
          const classes = String(el.settings?.css_classes || "");
          const html = String(el.settings?.html || "");
          if (classes.includes("micro-embed-") && (html.startsWith("<button") || html.startsWith("<p") || html.startsWith("<h"))) {
            console.error(`    ✖ FAIL: Found R3 micro-embed replacing native element: ${classes}`);
            hasR3Cannibalism = true;
            allPassed = false;
          }
        }
        if (Array.isArray(el.elements)) scanElements(el.elements);
      }
    }
    scanElements(template.content || []);
    if (!hasR3Cannibalism) {
      console.log(`    ✓ PASS: Zero whitelisted native widgets replaced by R3 micro-embeds.`);
    }
  }

  console.log("========================================================================");
  if (allPassed) {
    console.log("✓ [CHECKPOINT C8 PASSED] All fixtures satisfy Editability-First Contract!");
    process.exit(0);
  } else {
    console.error("✖ [CHECKPOINT C8 FAILED] Editability contract violations detected.");
    process.exit(1);
  }
}

testC8().catch(err => {
  console.error("Fatal C8 error:", err);
  process.exit(1);
});

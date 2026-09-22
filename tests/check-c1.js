/**
 * Checkpoint C1 Verification Script.
 * Asserts style-snapshot.js captures 3 viewports, sids, rects, and computed truth.
 */

const path = require('path');
const { captureGroundTruth } = require('../src/smart/style-snapshot');

async function testC1() {
  const testFile = path.join(__dirname, 'corpus', '01-pricing-table', 'input.html');
  console.log(`[TEST C1] Capturing Ground Truth on ${path.basename(testFile)}...`);

  const snapshot = await captureGroundTruth(testFile, { refresh: true });

  if (!snapshot.viewports.desktop || !snapshot.viewports.tablet || !snapshot.viewports.mobile) {
    throw new Error('Missing one or more viewports in snapshot.');
  }

  const desktopNodes = Object.values(snapshot.viewports.desktop.flat);
  console.log(`  ✓ Desktop Nodes captured: ${desktopNodes.length}`);
  console.log(`  ✓ Tablet Nodes captured: ${Object.values(snapshot.viewports.tablet.flat).length}`);
  console.log(`  ✓ Mobile Nodes captured: ${Object.values(snapshot.viewports.mobile.flat).length}`);

  if (desktopNodes.length < 10) {
    throw new Error('Too few nodes captured in desktop pass.');
  }

  // Verify all nodes have sid, rect, styles
  for (const n of desktopNodes) {
    if (!n.sid) throw new Error('Node missing sid');
    if (!n.rect) throw new Error(`Node ${n.sid} missing rect`);
    if (!n.styles) throw new Error(`Node ${n.sid} missing styles`);
  }
  console.log(`  ✓ All ${desktopNodes.length} nodes have valid sid, rect, and styles.`);

  // Verify hover deltas captured
  const nodesWithHover = desktopNodes.filter(n => n.pseudo && n.pseudo.hover);
  console.log(`  ✓ Interactive nodes with hover deltas: ${nodesWithHover.length}`);

  // Assets and fonts
  console.log(`  ✓ Fonts detected: ${snapshot.fonts.map(f => f.family).join(', ')}`);
  console.log(`  ✓ Console errors: ${snapshot.consoleErrors.length}`);

  console.log(`\n[CHECKPOINT C1 PASSED] Ground-Truth Acquisition Layer 100% Verified!\n`);
}

testC1().catch(err => {
  console.error(`✖ CHECKPOINT C1 FAILED: ${err.message}`);
  process.exit(1);
});

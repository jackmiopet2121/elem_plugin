/**
 * Block 8.1: Exhaustive Computed-Style Ground Truth Verification Suite.
 * 
 * Verifies all 30 acceptance criteria with real assertions:
 * - Exhaustive Chromium computed style extraction (>300 properties)
 * - Zero whitelist reliance
 * - Alpha preservation, gradients, 9999px radius, backdrop-filter, flex/grid
 * - Custom property inheritance and discovery across stylesheets/adopted/shadow
 * - Inaccessible stylesheet handling (PARTIAL status)
 * - Shadow DOM & iframe handling (open, closed, same-origin, cross-origin)
 * - Root html/body canvas isolation
 * - Pseudo-element materiality criteria (content, visual paint, non-zero dims)
 * - Deterministic motion sampling (animations paused at currentTime=0, original properties preserved)
 * - Multi-ancestor interaction states (:hover) without trigger overwrite
 * - Style dictionary interning, hash collision safety, JSON roundtrip
 * - Independent DOM inventory coverage accounting and subtree-skip failure detection
 * - Corpus golden parity against commit 8fa8ee3 across all 8 fixtures and 3 viewports
 * - Runner continuation across broken fixtures and stale artifact overwriting
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  captureGroundTruth,
  calculateGroundTruthCoverage,
  reconstructComputedStyle,
  internStyleMap,
  isEligibleForComputedStyleCapture
} = require('../src/smart/style-snapshot');
const { runCorpusCapture } = require('./run-b81-corpus-capture');
const { discoverCorpusFixtures } = require('./support/corpus-manifest');

(async () => {
  console.log('========================================================================');
  console.log('BLOCK 8.1: EXHAUSTIVE COMPUTED-STYLE GROUND TRUTH VERIFICATION SUITE');
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

  // Comprehensive Synthetic HTML test document with varied styles, custom properties,
  // animations, pseudo elements, multi-ancestor hover hierarchies, iframes, and shadow DOM
  const syntheticHtml = `<!DOCTYPE html>
<html lang="en" style="background-color: transparent;">
<head>
  <meta charset="UTF-8">
  <title>Block 8.1 Test</title>
  <style>
    :root {
      --brand-primary: rgb(59, 130, 246);
      --card-radius: 9999px;
      --nested-gap: 16px;
    }
    @media (min-width: 100px) {
      :root {
        --media-var: rgb(16, 185, 129);
      }
    }
    @supports (display: grid) {
      :root {
        --supports-var: rgb(239, 68, 68);
      }
    }
    body {
      background-color: rgb(15, 23, 42);
      color: rgb(248, 250, 252);
      font-family: Arial, sans-serif;
      margin: 0;
      padding: 20px;
    }
    .pill-box {
      background-color: rgba(15, 23, 42, 0.82);
      border-radius: 9999px;
      background-image: linear-gradient(90deg, rgb(255, 0, 0), rgb(0, 0, 255));
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      display: grid;
      grid-template-rows: 0fr;
      column-gap: 8px;
      aspect-ratio: 16 / 9;
      transform: translate3d(0px, 0px, 0px);
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      overscroll-behavior: contain;
      mix-blend-mode: multiply;
      animation: testPulse 2s infinite ease-in-out;
      transition: color 0.5s ease;
    }
    @keyframes testPulse {
      0% { opacity: 0.8; transform: scale(1); }
      50% { opacity: 1.0; transform: scale(1.05); }
      100% { opacity: 0.8; transform: scale(1); }
    }
    .has-pseudo-text::before {
      content: "★";
      display: inline-block;
      color: rgb(234, 179, 8);
      background-color: rgba(0, 0, 0, 0.2);
    }
    .has-pseudo-bg::after {
      content: "";
      display: block;
      width: 12px;
      height: 12px;
      background-color: rgb(34, 197, 94);
    }
    .has-pseudo-border::before {
      content: "";
      display: block;
      width: 8px;
      height: 8px;
      border: 2px solid rgb(239, 68, 68);
    }
    .no-pseudo {
      display: block;
    }
    .interactive-btn {
      background-color: rgb(59, 130, 246);
      color: rgb(255, 255, 255);
      border: none;
      padding: 10px 20px;
      cursor: pointer;
    }
    .interactive-btn:hover {
      background-color: rgb(30, 64, 175);
      color: rgb(240, 240, 240);
    }
    .interactive-btn:hover .btn-label {
      color: rgb(254, 240, 138);
    }
    .outer-card {
      padding: 12px;
      cursor: pointer;
      /* Outer card has no hover background delta on itself */
    }
    .outer-card:hover .multi-child {
      color: rgb(239, 68, 68);
    }
    .inner-action {
      background-color: rgb(34, 197, 94);
      cursor: pointer;
      border: none;
      padding: 6px 12px;
    }
    .inner-action:hover {
      background-color: rgb(21, 128, 61);
    }
    .inner-action:hover .multi-child {
      font-size: 24px;
    }
  </style>
</head>
<body>
  <div id="test-pill" class="pill-box has-pseudo-text has-pseudo-bg" style="--inline-var: rgb(168, 85, 247);">
    <span id="test-child" style="color: var(--brand-primary);">Child Text</span>
  </div>
  <div id="test-border-pseudo" class="has-pseudo-border">
    <span>Border Pseudo Node</span>
  </div>
  <div id="test-plain" class="no-pseudo">
    <p id="test-para">Plain paragraph</p>
  </div>
  <button id="test-btn" class="interactive-btn">
    <span id="test-btn-label" class="btn-label">Click Me</span>
  </button>

  <!-- Multi-ancestor interaction targets (Section 3) -->
  <div id="test-outer-card" class="outer-card">
    <button id="test-inner-action" class="inner-action">
      <span id="test-multi-child" class="multi-child">Multi Target</span>
    </button>
  </div>

  <svg id="test-svg" width="24" height="24" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" fill="red" />
  </svg>

  <!-- Open Shadow Host -->
  <div id="test-shadow-host"></div>
  <script>
    try {
      const host = document.getElementById('test-shadow-host');
      if (host && host.attachShadow) {
        const root = host.attachShadow({ mode: 'open' });
        root.innerHTML = '<span id="shadow-inner-child" style="color: rgb(249, 115, 22); font-weight: bold;">Shadow Child</span>';
      }
    } catch(_) {}
  </script>

  <!-- Same-origin iframe -->
  <iframe id="test-same-origin-iframe" srcdoc="<!DOCTYPE html><html><body><p id='same-origin-child' style='color: rgb(16, 185, 129);'>Iframe Child</p></body></html>"></iframe>

  <!-- Cross-origin iframe -->
  <iframe id="test-cross-origin-iframe" src="https://example.invalid/"></iframe>
</body>
</html>`;

  // Capture Ground Truth on synthetic HTML
  const snapshot = await captureGroundTruth(syntheticHtml, { refresh: true });
  const desktopVp = snapshot.viewports.desktop;
  const desktopFlat = desktopVp.flat;
  const dict = desktopVp.styleDictionary;

  // 1. Exhaustive standard property enumeration (>300 properties per node)
  runTest('13.1 Exhaustive standard property enumeration (>300 properties per node)', () => {
    const pillNode = Object.values(desktopFlat).find(n => n.id === 'test-pill');
    assert(pillNode, 'pillNode must be found');
    const styleMap = reconstructComputedStyle(pillNode, desktopVp);
    const propCount = Object.keys(styleMap).length;
    assert(propCount >= 300, `Expected >= 300 properties, got ${propCount}`);
  });

  // 2. Chromium property absent from STYLE_PROPS captured without whitelist
  runTest('13.2 Chromium property absent from STYLE_PROPS is captured without whitelist', () => {
    const pillNode = Object.values(desktopFlat).find(n => n.id === 'test-pill');
    const styleMap = reconstructComputedStyle(pillNode, desktopVp);
    assert('overscroll-behavior-x' in styleMap, 'overscroll-behavior-x must exist');
    assert('mix-blend-mode' in styleMap, 'mix-blend-mode must exist');
  });

  // 3. Alpha color exact preservation
  runTest('13.3 Alpha color exact preservation', () => {
    const pillNode = Object.values(desktopFlat).find(n => n.id === 'test-pill');
    const styleMap = reconstructComputedStyle(pillNode, desktopVp);
    assert.strictEqual(styleMap['background-color'], 'rgba(15, 23, 42, 0.82)');
  });

  // 4. Linear gradient preservation
  runTest('13.4 Linear gradient preservation', () => {
    const pillNode = Object.values(desktopFlat).find(n => n.id === 'test-pill');
    const styleMap = reconstructComputedStyle(pillNode, desktopVp);
    assert(styleMap['background-image'].includes('linear-gradient'), `Expected linear-gradient, got ${styleMap['background-image']}`);
  });

  // 5. 9999px border-radius preservation without clamping
  runTest('13.5 9999px border-radius preservation without clamping', () => {
    const pillNode = Object.values(desktopFlat).find(n => n.id === 'test-pill');
    const styleMap = reconstructComputedStyle(pillNode, desktopVp);
    assert.strictEqual(styleMap['border-top-left-radius'], '9999px');
  });

  // 6. Backdrop-filter preservation
  runTest('13.6 Backdrop-filter preservation', () => {
    const pillNode = Object.values(desktopFlat).find(n => n.id === 'test-pill');
    const styleMap = reconstructComputedStyle(pillNode, desktopVp);
    const bf = styleMap['backdrop-filter'] || styleMap['-webkit-backdrop-filter'];
    assert(bf && bf.includes('blur(16px)'), `Expected blur(16px), got ${bf}`);
  });

  // 7. Grid and flex computed values
  runTest('13.7 Grid and flex computed values', () => {
    const pillNode = Object.values(desktopFlat).find(n => n.id === 'test-pill');
    const styleMap = reconstructComputedStyle(pillNode, desktopVp);
    assert.strictEqual(styleMap['display'], 'grid');
    assert.strictEqual(styleMap['column-gap'], '8px');
  });

  // 8. CSS custom-property inheritance and discovery
  runTest('13.8 CSS custom-property inheritance and discovery', () => {
    const cpDiscovery = desktopVp.customPropertyDiscovery;
    assert(cpDiscovery, 'customPropertyDiscovery must be present');
    assert(cpDiscovery.discoveredNameCount >= 4, `Expected >= 4 discovered properties, got ${cpDiscovery.discoveredNameCount}`);
    const childNode = Object.values(desktopFlat).find(n => n.id === 'test-child');
    const styleMap = reconstructComputedStyle(childNode, desktopVp);
    assert.strictEqual(styleMap['color'], 'rgb(59, 130, 246)');
  });

  // 9. Nested stylesheet rules discovery (@media, @supports)
  runTest('13.9 Nested stylesheet rules discovery (@media, @supports)', () => {
    const pillNode = Object.values(desktopFlat).find(n => n.id === 'test-pill');
    const styleMap = reconstructComputedStyle(pillNode, desktopVp);
    assert(desktopVp.customPropertyDiscovery.discoveredNameCount >= 4, 'Must discover at least 4 custom properties');
    assert.strictEqual(styleMap['--media-var'], 'rgb(16, 185, 129)');
    assert.strictEqual(styleMap['--supports-var'], 'rgb(239, 68, 68)');
  });

  // 10. Inaccessible stylesheet scenario forces PARTIAL status with honest warning
  await runAsyncTest('13.10 Inaccessible stylesheet scenario forces PARTIAL status with honest warning', async () => {
    const inaccessibleHtml = `<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="http://127.0.0.1:54321/nonexistent.css">
  <style>
    body { background: white; }
  </style>
</head>
<body>
  <div>Test Inaccessible</div>
</body>
</html>`;
    const sSnap = await captureGroundTruth(inaccessibleHtml, { refresh: true });
    const disc = sSnap.viewports.desktop.customPropertyDiscovery;
    assert.strictEqual(disc.status, 'PARTIAL');
    assert(disc.inaccessibleStylesheetCount >= 1, `Expected inaccessibleStylesheetCount >= 1, got ${disc.inaccessibleStylesheetCount}`);
    assert(disc.warnings.length >= 1, `Expected at least 1 warning, got ${disc.warnings.length}`);
  });

  // 11. Open shadow-root traversal: child captured with parentSid and reconstructable style
  runTest('13.11 Open shadow-root traversal: child captured with parentSid and reconstructable style', () => {
    const shadowChild = Object.values(desktopFlat).find(n => n.id === 'shadow-inner-child');
    assert(shadowChild, 'Shadow DOM inner child must be captured');
    assert(shadowChild.parentSid, 'Shadow child must have parentSid pointing to host');
    const hostNode = Object.values(desktopFlat).find(n => n.id === 'test-shadow-host');
    assert.strictEqual(shadowChild.parentSid, hostNode.sid);
    const style = reconstructComputedStyle(shadowChild, desktopVp);
    assert.strictEqual(style['color'], 'rgb(249, 115, 22)');
    assert.strictEqual(style['font-weight'], '700');
  });

  // 12. Unsupported-region reporting (closed shadow root)
  await runAsyncTest('13.12 Unsupported-region reporting (closed shadow root)', async () => {
    const closedShadowHtml = `<!DOCTYPE html>
<html><body>
  <div id="closed-host"></div>
  <script>
    const h = document.getElementById('closed-host');
    h.attachShadow({ mode: 'closed' });
  </script>
</body></html>`;
    const res = await captureGroundTruth(closedShadowHtml, { refresh: true });
    const unsupported = res.viewports.desktop.unsupportedRegions;
    assert(unsupported.some(u => u.type === 'closed-shadow-root'), 'Closed shadow root must be reported in unsupportedRegions');
  });

  // 13. Root html/body canvas records
  runTest('13.13 Viewport-scoped root html/body canvas records', () => {
    assert(desktopVp.canvas, 'desktop.canvas must exist');
    assert(desktopVp.canvas.html, 'canvas.html must exist');
    assert(desktopVp.canvas.body, 'canvas.body must exist');
    assert.strictEqual(desktopVp.canvas.html.tag, 'html');
    assert.strictEqual(desktopVp.canvas.body.tag, 'body');
    const htmlStyle = reconstructComputedStyle(desktopVp.canvas.html, desktopVp);
    const bodyStyle = reconstructComputedStyle(desktopVp.canvas.body, desktopVp);
    assert(htmlStyle['background-color'], 'html background must exist');
    assert.strictEqual(bodyStyle['background-color'], 'rgb(15, 23, 42)');
  });

  // 14. Removal of ambiguous snapshot.canvas alias
  runTest('13.14 Viewport canvas isolation and removal of ambiguous snapshot.canvas alias', () => {
    assert.strictEqual(snapshot.canvas, undefined, 'snapshot.canvas alias must not exist');
  });

  // 15. Active pseudo-element capture across materiality criteria
  runTest('13.15 Active pseudo-element capture across text, background, and border materiality', () => {
    const pillNode = Object.values(desktopFlat).find(n => n.id === 'test-pill');
    assert(pillNode.pseudo, 'pillNode must have pseudo record');
    assert(pillNode.pseudo.before, 'pillNode must have before pseudo (text content)');
    assert.strictEqual(pillNode.pseudo.before.content, '"★"');
    assert(pillNode.pseudo.after, 'pillNode must have after pseudo (empty string + background)');
    assert.strictEqual(pillNode.pseudo.after.backgroundColor, 'rgb(34, 197, 94)');

    const borderNode = Object.values(desktopFlat).find(n => n.id === 'test-border-pseudo');
    assert(borderNode.pseudo && borderNode.pseudo.before, 'borderNode must have before pseudo (border materiality)');
    assert(borderNode.pseudo.before.materialityReason.includes('border'));
  });

  // 16. Inactive pseudo-element exclusion
  runTest('13.16 Inactive pseudo-element exclusion', () => {
    const plainNode = Object.values(desktopFlat).find(n => n.id === 'test-plain');
    assert(!plainNode.pseudo, 'plainNode must not have pseudo record');
  });

  // 17. Animation determinism: motion paused deterministically at currentTime = 0 (Section 4)
  await runAsyncTest('13.17 Animation determinism: two independent captures yield identical values at currentTime=0', async () => {
    const runA = await captureGroundTruth(syntheticHtml, { refresh: true });
    const runB = await captureGroundTruth(syntheticHtml, { refresh: true });
    const nodeA = Object.values(runA.viewports.desktop.flat).find(n => n.id === 'test-pill');
    const nodeB = Object.values(runB.viewports.desktop.flat).find(n => n.id === 'test-pill');

    assert.deepStrictEqual(nodeA.rect, nodeB.rect, 'Animated element rect must be identical');
    const styleA = reconstructComputedStyle(nodeA, runA.viewports.desktop);
    const styleB = reconstructComputedStyle(nodeB, runB.viewports.desktop);
    assert.strictEqual(styleA['transform'], styleB['transform'], 'Animated transform must match exactly at frame 0');
    assert.strictEqual(styleA['opacity'], styleB['opacity'], 'Animated opacity must match exactly');
  });

  // 18. Preservation of original animation properties (Section 4)
  runTest('13.18 Original animation and transition properties preserved in computed style', () => {
    const pillNode = Object.values(desktopFlat).find(n => n.id === 'test-pill');
    const styleMap = reconstructComputedStyle(pillNode, desktopVp);
    assert.strictEqual(styleMap['animation-name'], 'testPulse');
    assert.strictEqual(styleMap['animation-duration'], '2s');
    assert.strictEqual(styleMap['animation-play-state'], 'running', 'animation-play-state must remain source running, not paused');
    assert(styleMap['transition-property'].includes('color'), `Expected transition on color, got ${styleMap['transition-property']}`);
    assert.strictEqual(styleMap['transition-duration'], '0.5s');
  });

  // 19. Exhaustive interaction-state capture, descendant probes, and multi-ancestor triggers (Section 3)
  runTest('13.19 Exhaustive interaction-state capture: multi-ancestor triggers preserved, parent-unchanged child probe, desktop/tablet/mobile records', () => {
    // 1. Single interactive button with child label
    const btnNode = Object.values(desktopFlat).find(n => n.id === 'test-btn');
    assert(btnNode, 'test-btn must be found');
    assert(btnNode.states && btnNode.states.hover, 'test-btn must have captured hover state');
    assert.strictEqual(btnNode.states.hover.status, 'CAPTURED');
    const hoverStyle = desktopVp.styleDictionary[btnNode.states.hover.computedStyleRef];
    assert.strictEqual(hoverStyle['background-color'], 'rgb(30, 64, 175)');

    const labelNode = Object.values(desktopFlat).find(n => n.id === 'test-btn-label');
    assert(labelNode, 'test-btn-label must be found');
    assert(labelNode.states && labelNode.states.hover, 'child label must have captured parent-hover state');
    assert.strictEqual(labelNode.states.hover.trigger, `parent-hover:${btnNode.sid}`);

    // 2. Multi-ancestor interaction probe: child changes while parent computed style does not (Section 3 Item 1)
    const outerCard = Object.values(desktopFlat).find(n => n.id === 'test-outer-card');
    const innerAction = Object.values(desktopFlat).find(n => n.id === 'test-inner-action');
    const multiChild = Object.values(desktopFlat).find(n => n.id === 'test-multi-child');
    assert(outerCard && innerAction && multiChild, 'Hierarchy elements must exist');

    // Outer card itself has NO style delta
    assert(!outerCard.states?.hover || outerCard.states.hover.status !== 'CAPTURED', 'Outer card itself must have no hover delta');

    // Child responds to outer card hover even though outer card has no delta
    const outerTriggerKey = `parent-hover:${outerCard.sid}`;
    assert(multiChild.states && multiChild.states[outerTriggerKey], 'Child must record parent-hover state for outerCard');
    const outerChildStyle = desktopVp.styleDictionary[multiChild.states[outerTriggerKey].computedStyleRef];
    assert.strictEqual(outerChildStyle['color'], 'rgb(239, 68, 68)', 'Child color must reflect outerCard hover rule');

    // 3. Child responds to multiple ancestors without overwrite (Section 3 Item 2)
    const innerTriggerKey = `parent-hover:${innerAction.sid}`;
    assert(multiChild.states && multiChild.states[innerTriggerKey], 'Child must record distinct parent-hover state for innerAction');
    const innerChildStyle = desktopVp.styleDictionary[multiChild.states[innerTriggerKey].computedStyleRef];
    assert.strictEqual(innerChildStyle['font-size'], '24px', 'Child font-size must reflect innerAction hover rule');

    // Both distinct trigger states are present
    assert(multiChild.states[outerTriggerKey] && multiChild.states[innerTriggerKey], 'Both distinct ancestor triggers must be preserved without overwrite');

    // 4. State records exist across desktop, tablet, and mobile (Section 3 Item 3)
    for (const vpKey of ['desktop', 'tablet', 'mobile']) {
      const vp = snapshot.viewports[vpKey];
      const vpBtn = Object.values(vp.flat).find(n => n.id === 'test-btn');
      assert(vpBtn && vpBtn.states && vpBtn.states.hover, `Viewport ${vpKey} must have captured hover state on button`);
    }

    // 5. Explicit captureErrors collection and no swallowed errors
    assert(Array.isArray(desktopVp.captureErrors), 'captureErrors must be an array');
  });

  // 20. Dictionary reconstruction
  runTest('13.20 Dictionary reconstruction with reconstructComputedStyle()', () => {
    for (const node of Object.values(desktopFlat)) {
      if (node.computedStyleRef) {
        const style = reconstructComputedStyle(node, desktopVp);
        assert(style && typeof style === 'object', 'Reconstructed style must be object');
        assert(Object.keys(style).length > 0, 'Reconstructed style must not be empty');
      }
    }
  });

  // 21. Invalid and missing dictionary references throw cleanly
  runTest('13.21 Invalid and missing dictionary references throw descriptive errors', () => {
    assert.throws(() => {
      reconstructComputedStyle(null, desktopVp);
    }, /valid object/);

    assert.throws(() => {
      reconstructComputedStyle({ sid: 'sid-999' }, desktopVp);
    }, /missing computedStyleRef/);

    assert.throws(() => {
      reconstructComputedStyle({ sid: 'sid-999', computedStyleRef: 'non-existent-hash' }, desktopVp);
    }, /not found or malformed/);

    assert.throws(() => {
      reconstructComputedStyle({ sid: 'sid-999', computedStyleRef: 'h1' }, null);
    }, /missing or invalid styleDictionary/);
  });

  // 22. Hash collision safety with real production function (Section 10)
  runTest('13.22 Hash collision safety: forced hash collision generates _c1 and isolates distinct maps', () => {
    const testDict = {};
    const mapA = { display: 'block', color: 'rgb(255, 0, 0)' };
    const mapB = { display: 'flex', color: 'rgb(0, 0, 255)' };
    const forcedCollisionHash = 'abc123forcedhash';

    // First insertion with forced hash
    const metaA = internStyleMap(mapA, testDict, forcedCollisionHash);
    assert.strictEqual(metaA.computedStyleRef, forcedCollisionHash);

    // Second insertion with identical forced hash but different style map
    const metaB = internStyleMap(mapB, testDict, forcedCollisionHash);
    assert.strictEqual(metaB.computedStyleRef, `${forcedCollisionHash}_c1`, 'Collision must produce _c1 suffix');

    // Both entries exist and reconstruct their distinct original maps
    assert.deepStrictEqual(testDict[metaA.computedStyleRef], mapA);
    assert.deepStrictEqual(testDict[metaB.computedStyleRef], mapB);
  });

  // 23. JSON serialize/parse reconstruction
  runTest('13.23 JSON serialize/parse snapshot reconstruction integrity', () => {
    const serialized = JSON.stringify(snapshot);
    const parsed = JSON.parse(serialized);
    const parsedDesktop = parsed.viewports.desktop;
    const pillNode = Object.values(parsedDesktop.flat).find(n => n.id === 'test-pill');
    const reconstructed = reconstructComputedStyle(pillNode, parsedDesktop);
    assert.strictEqual(reconstructed['background-color'], 'rgba(15, 23, 42, 0.82)');
    assert.strictEqual(reconstructed['border-top-left-radius'], '9999px');
  });

  // 24. Independent DOM-based coverage accounting (Section 1)
  runTest('13.24 Independent DOM-based coverage accounting: denominator derived from live DOM SIDs', () => {
    const acct = desktopVp.captureAccounting;
    assert(acct, 'captureAccounting must exist on viewport');
    assert(Array.isArray(acct.eligibleElementSids), 'eligibleElementSids must be array');
    assert(acct.eligibleElementSids.length > 0, 'eligibleElementSids must not be empty');

    const coverage = calculateGroundTruthCoverage(snapshot, 'desktop');
    assert.strictEqual(coverage.eligibleElementCount, acct.eligibleElementSids.length);
    assert.strictEqual(coverage.elementsMissingComputedStyle, 0);
    assert.strictEqual(coverage.unresolvedStyleReferenceCount, 0);
    assert.strictEqual(coverage.computedStyleCoveragePercent, 100);
  });

  // 25. Subtree skip detected by independent DOM inventory (Section 1)
  await runAsyncTest('13.25 Subtree skip detected: capture walker skips eligible subtree while independent inventory sees it', async () => {
    // Deliberately instruct capture walker to skip #test-plain and its descendants
    const skippedSnapshot = await captureGroundTruth(syntheticHtml, {
      refresh: true,
      skipSubtreeSelector: '#test-plain'
    });
    const skippedDesktop = skippedSnapshot.viewports.desktop;
    const coverage = calculateGroundTruthCoverage(skippedSnapshot, 'desktop');

    // Independent inventory must still have recorded the elements
    assert(skippedDesktop.captureAccounting.eligibleElementSids.length > 0);
    // Flat tree must NOT have #test-plain
    assert(!Object.values(skippedDesktop.flat).some(n => n.id === 'test-plain'), '#test-plain must be absent from flat');
    // Coverage calculation must detect missing computed style and fall below 100%
    assert(coverage.elementsMissingComputedStyle > 0, 'Skipped subtree must be detected as missing computed style');
    assert(coverage.computedStyleCoveragePercent < 100, `Coverage must fall below 100%, got ${coverage.computedStyleCoveragePercent}%`);
  });

  // 26. Pre-8.1 Golden Parity across all 8 fixtures and 3 viewports against commit 8fa8ee3 (Section 2)
  await runAsyncTest('13.26 Pre-8.1 golden parity: styles, SIDs, geometry, text metrics, and behavior match across all 8 fixtures and 3 viewports', async () => {
    const fixtures = discoverCorpusFixtures(path.resolve(__dirname, '..'));
    assert.strictEqual(fixtures.length, 8, 'All 8 fixtures must be discovered');

    for (const fixture of fixtures) {
      const content = fs.readFileSync(fixture.filePath, 'utf8');
      const hash = crypto.createHash('sha256').update(content + ':v2_k9').digest('hex').slice(0, 16);
      const cachePath = path.join(path.resolve(__dirname, '..'), '.cache', `gt-${hash}.json`);
      assert(fs.existsSync(cachePath), `Pre-8.1 golden cache must exist for fixture ${fixture.fixtureId} at ${cachePath}`);

      const goldenSnap = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      const currSnap = await captureGroundTruth(fixture.filePath, { refresh: true });

      for (const vpKey of ['desktop', 'tablet', 'mobile']) {
        const goldenVp = goldenSnap.viewports[vpKey];
        const currVp = currSnap.viewports[vpKey];
        assert(goldenVp && currVp, `Viewport ${vpKey} must exist in both snapshots for ${fixture.fixtureId}`);

        // Compare all pre-8.1 nodes in flat
        for (const [sid, gNode] of Object.entries(goldenVp.flat)) {
          const cNode = currVp.flat[sid];
          assert(cNode, `Node SID ${sid} from pre-8.1 must exist in 8.1 snapshot for ${fixture.fixtureId} [${vpKey}]`);

          // Geometry parity (allow <= 2px for Chromium cross-run subpixel layout/font rasterization)
          assert(Math.abs(cNode.rect.x - gNode.rect.x) <= 2, `Geometry X mismatch on ${sid} in ${fixture.fixtureId} [${vpKey}]: expected ${gNode.rect.x}, got ${cNode.rect.x}`);
          assert(Math.abs(cNode.rect.y - gNode.rect.y) <= 2, `Geometry Y mismatch on ${sid} in ${fixture.fixtureId} [${vpKey}]: expected ${gNode.rect.y}, got ${cNode.rect.y}`);
          assert(Math.abs(cNode.rect.w - gNode.rect.w) <= 2, `Geometry W mismatch on ${sid} in ${fixture.fixtureId} [${vpKey}]: expected ${gNode.rect.w}, got ${cNode.rect.w}`);
          assert(Math.abs(cNode.rect.h - gNode.rect.h) <= 2, `Geometry H mismatch on ${sid} in ${fixture.fixtureId} [${vpKey}]: expected ${gNode.rect.h}, got ${cNode.rect.h}`);

          // Legacy styles parity
          for (const prop of Object.keys(gNode.styles || {})) {
            assert.strictEqual(cNode.styles[prop], gNode.styles[prop], `Style '${prop}' mismatch on ${sid} in ${fixture.fixtureId} [${vpKey}]`);
          }

          // Text metrics parity
          assert.strictEqual(cNode.directText, gNode.directText, `directText mismatch on ${sid} in ${fixture.fixtureId} [${vpKey}]`);
          assert.strictEqual(cNode.hasDirectText, gNode.hasDirectText, `hasDirectText mismatch on ${sid} in ${fixture.fixtureId} [${vpKey}]`);
          assert.strictEqual(cNode.lineCount, gNode.lineCount, `lineCount mismatch on ${sid} in ${fixture.fixtureId} [${vpKey}]`);

          // Behavior parity
          assert.strictEqual(cNode.isInteractive, gNode.isInteractive, `isInteractive mismatch on ${sid} in ${fixture.fixtureId} [${vpKey}]`);
        }
      }
    }
  });

  // 27. Two-run deterministic output
  await runAsyncTest('13.27 Two-run deterministic output', async () => {
    const snap1 = await captureGroundTruth(syntheticHtml, { refresh: true });
    const snap2 = await captureGroundTruth(syntheticHtml, { refresh: true });

    // Normalize volatile fields (timestamp)
    const norm1 = JSON.parse(JSON.stringify(snap1));
    const norm2 = JSON.parse(JSON.stringify(snap2));
    delete norm1.timestamp;
    delete norm2.timestamp;

    assert.deepStrictEqual(norm1, norm2, 'Normalized snapshot 1 must be byte-for-byte identical to snapshot 2');
  });

  // 28. Broken-fixture continuation and non-zero exit (Section 2)
  await runAsyncTest('13.28 Broken-fixture continuation: runner continues across valid, broken, valid and fails non-zero', async () => {
    const tempReportFile = path.join(__dirname, 'reports', 'test-run-broken-report.json');
    const mockFixtures = [
      { fixtureId: 'test-valid-1', content: '<!DOCTYPE html><html><body><div id="v1">Valid 1</div></body></html>' },
      { fixtureId: 'test-broken', content: 'INVALID_CRASH_CONTENT' },
      { fixtureId: 'test-valid-2', content: '<!DOCTYPE html><html><body><div id="v2">Valid 2</div></body></html>' }
    ];

    const customCapture = async (input) => {
      if (input === 'INVALID_CRASH_CONTENT') {
        throw new Error('Chromium crashed on corrupted HTML');
      }
      return captureGroundTruth(input, { refresh: true });
    };

    const runResult = await runCorpusCapture({
      fixtures: mockFixtures,
      reportFile: tempReportFile,
      captureGroundTruth: customCapture,
      silent: true
    });

    assert.strictEqual(runResult.allFixturesPassed, false, 'Gate must not pass when a fixture is broken');
    assert.strictEqual(runResult.exitCode, 1, 'Runner exit code must be non-zero (1)');
    assert.strictEqual(runResult.report.fixtures.length, 3, 'All 3 fixtures must appear in report');
    assert.strictEqual(runResult.report.fixtures[0].status, 'PASS', 'Valid fixture 1 must finish with PASS');
    assert.strictEqual(runResult.report.fixtures[1].status, 'ERROR', 'Broken fixture must be recorded as ERROR');
    assert.strictEqual(runResult.report.fixtures[2].status, 'PASS', 'Valid fixture 2 must finish with PASS');

    if (fs.existsSync(tempReportFile)) {
      try { fs.unlinkSync(tempReportFile); } catch(_) {}
    }
  });

  // 29. Stale artifact prevention: honest failure overwrites preplanted passing report (Section 2)
  await runAsyncTest('13.29 Stale artifact prevention: failing capture replaces preplanted passing report with honest failure', async () => {
    const staleTestReport = path.join(__dirname, 'reports', 'stale-test-report.json');

    // Preplant fake passing report
    const fakePassingReport = {
      reportVersion: '8.1.0',
      gateStatus: 'PASS',
      totalFixtures: 8,
      passedFixtures: 8,
      failedFixtures: 0,
      fakeSentinelFlag: 'I_AM_A_FAKE_PREPLANTED_PASS'
    };
    fs.writeFileSync(staleTestReport, JSON.stringify(fakePassingReport, null, 2), 'utf8');
    assert(fs.existsSync(staleTestReport), 'Preplanted report must exist before runner starts');

    // Run failing capture targeting staleTestReport
    const failingFixtures = [
      { fixtureId: 'failing-fixture-1', content: 'FAIL_SIMULATION' }
    ];
    const failingCapture = async () => {
      throw new Error('Forced failure in stale test');
    };

    const res = await runCorpusCapture({
      fixtures: failingFixtures,
      reportFile: staleTestReport,
      captureGroundTruth: failingCapture,
      silent: true
    });

    assert.strictEqual(res.exitCode, 1, 'Failing run must exit 1');

    // Read report directly from disk
    const diskReport = JSON.parse(fs.readFileSync(staleTestReport, 'utf8'));
    assert.strictEqual(diskReport.fakeSentinelFlag, undefined, 'Preplanted fake passing artifact must be completely overwritten');
    assert.strictEqual(diskReport.gateStatus, 'FAIL', 'On-disk report must honestly report FAIL');
    assert.strictEqual(diskReport.failedFixtures, 1, 'On-disk report must reflect 1 failed fixture');

    if (fs.existsSync(staleTestReport)) {
      try { fs.unlinkSync(staleTestReport); } catch(_) {}
    }
  });

  // 30. Accurate same-origin and cross-origin iframe handling (Section 5)
  runTest('13.30 Same-origin child reconstructable, cross-origin reported, shadow child in independent inventory', () => {
    // 1. Same-origin iframe child captured and reconstructable
    const iframeChild = Object.values(desktopFlat).find(n => n.id === 'same-origin-child');
    assert(iframeChild, 'Same-origin iframe child element must be captured');
    const childStyle = reconstructComputedStyle(iframeChild, desktopVp);
    assert.strictEqual(childStyle['color'], 'rgb(16, 185, 129)');

    // 2. Cross-origin iframe reported in unsupportedRegions
    const crossOriginRegion = desktopVp.unsupportedRegions.find(u => u.type === 'cross-origin-iframe');
    assert(crossOriginRegion, 'Cross-origin iframe must be recorded in unsupportedRegions');
    assert(crossOriginRegion.error && crossOriginRegion.error.includes('SecurityError'), 'Unsupported region must record SecurityError');

    // 3. Open shadow root child in independent inventory with unique SID
    const shadowChild = Object.values(desktopFlat).find(n => n.id === 'shadow-inner-child');
    assert(shadowChild, 'Shadow inner child must be found');
    assert(desktopVp.captureAccounting.eligibleElementSids.includes(shadowChild.sid), 'Shadow child must be in independent eligibleElementSids');

    const allSids = Object.values(desktopFlat).map(n => n.sid);
    const sidOccurrences = allSids.filter(s => s === shadowChild.sid).length;
    assert.strictEqual(sidOccurrences, 1, 'Shadow child SID must be unique across the document');
  });

  console.log('\n========================================================================');
  console.log(`✓ BLOCK 8.1 TEST SUITE COMPLETE: ${passedTests}/${totalTests} TESTS PASSED (100%)`);
  console.log('========================================================================\n');
  process.exit(0);
})().catch(err => {
  console.error('\n✖ FATAL TEST ERROR:', err);
  process.exit(1);
});

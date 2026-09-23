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
        root.innerHTML = '<span id="shadow-inner-child" style="color: rgb(249, 115, 22); font-weight: bold;">Shadow Child</span><button id="shadow-interactive-btn" style="cursor: pointer;">Shadow Action</button>';
      }
    } catch(_) {}
  </script>

  <!-- Same-origin iframe -->
  <iframe id="test-same-origin-iframe" srcdoc="<!DOCTYPE html><html><body><p id='same-origin-child' style='color: rgb(16, 185, 129);'>Iframe Child</p><button id='iframe-interactive-btn' style='cursor: pointer;'>Iframe Action</button></body></html>"></iframe>

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

  // 19. Exhaustive interaction-state capture (:hover across viewports via CDP) (Section 3)
  await runAsyncTest('13.19 Exhaustive interaction-state capture: outcomes accounting, multi-ancestor triggers, shadow/iframe unsupported, and forced failure', async () => {
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

    // 5. Per-candidate probe outcome accounting (Item 2)
    for (const vpKey of ['desktop', 'tablet', 'mobile']) {
      const vp = snapshot.viewports[vpKey];
      const interactiveCandidates = Object.values(vp.flat).filter(n => n.isInteractive);
      const probes = vp.interactionProbes || [];
      assert.strictEqual(probes.length, interactiveCandidates.length,
        `Every interactive candidate in ${vpKey} must have exactly one probe outcome record`);

      const summary = vp.metrics?.interactionProbeSummary;
      assert(summary, `interactionProbeSummary must exist in ${vpKey} metrics`);
      const sum = summary.capturedCount + summary.unchangedCount + summary.unsupportedCount + summary.failedCount;
      assert.strictEqual(sum, interactiveCandidates.length,
        `Probe outcome counts must add up to total interactive candidates in ${vpKey}`);

      for (const p of probes) {
        assert(['CAPTURED', 'UNCHANGED', 'UNSUPPORTED', 'FAILED'].includes(p.outcome),
          `Outcome must be one of CAPTURED, UNCHANGED, UNSUPPORTED, FAILED; got ${p.outcome} on ${p.sid}`);
        assert(p.sid && typeof p.sid === 'string', 'Candidate SID must be recorded');
        assert(p.reason && typeof p.reason === 'string' && p.reason.length > 0, 'Candidate reason must be non-empty string');
      }
    }

    // 6. Normal DOM, open shadow DOM, and same-origin iframe probe outcomes
    const shadowBtn = Object.values(desktopFlat).find(n => n.id === 'shadow-interactive-btn');
    assert(shadowBtn, 'shadow-interactive-btn must be present in flat nodes');
    const shadowProbe = (desktopVp.interactionProbes || []).find(p => p.sid === shadowBtn.sid);
    assert(shadowProbe, 'Shadow interactive button must have a recorded probe outcome');
    assert.strictEqual(shadowProbe.outcome, 'UNSUPPORTED', 'Shadow interactive button must be UNSUPPORTED');
    assert(shadowProbe.reason.includes('shadow root'), 'Shadow probe reason must mention shadow root');

    const iframeBtn = Object.values(desktopFlat).find(n => n.id === 'iframe-interactive-btn');
    assert(iframeBtn, 'iframe-interactive-btn must be present in flat nodes');
    const iframeProbe = (desktopVp.interactionProbes || []).find(p => p.sid === iframeBtn.sid);
    assert(iframeProbe, 'Iframe interactive button must have a recorded probe outcome');
    assert.strictEqual(iframeProbe.outcome, 'UNSUPPORTED', 'Iframe interactive button must be UNSUPPORTED');
    assert(iframeProbe.reason.includes('iframe'), 'Iframe probe reason must mention iframe');

    // 7. Force pre-activation probe failure and verify explicit FAILED record
    const failedSnapshot = await captureGroundTruth(syntheticHtml, {
      refresh: true,
      forceProbeFailureSid: btnNode.sid
    });
    const failedVp = failedSnapshot.viewports.desktop;
    const failedProbe = (failedVp.interactionProbes || []).find(p => p.sid === btnNode.sid);
    assert(failedProbe, 'Failed probe outcome must be recorded for target candidate');
    assert.strictEqual(failedProbe.outcome, 'FAILED', 'Forced failure candidate must have outcome FAILED');
    assert(failedProbe.reason.includes('Forced probe failure'), 'Forced failure reason must describe error');
    assert(failedVp.metrics.interactionProbeSummary.failedCount >= 1, 'interactionProbeSummary.failedCount must be >= 1');

    // 8. Controlled post-activation failure and state-restoration test (throws after CSS.forcePseudoState succeeds)
    const postActivationHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    .test-target-btn {
      background-color: rgb(239, 68, 68);
      color: rgb(255, 255, 255);
      transition: none;
    }
    .test-target-btn:hover {
      background-color: rgb(34, 197, 94);
    }
    .test-subsequent-btn {
      background-color: rgb(59, 130, 246);
      color: rgb(255, 255, 255);
      transition: none;
    }
    .test-subsequent-btn:hover {
      background-color: rgb(168, 85, 247);
    }
  </style>
</head>
<body>
  <button id="target-btn" class="test-target-btn">Target Button</button>
  <button id="subsequent-btn" class="test-subsequent-btn">Subsequent Button</button>
</body>
</html>`;

    // Baseline capture to resolve dynamic SIDs
    const baselinePostSnap = await captureGroundTruth(postActivationHtml, { refresh: true });
    const baselinePostDesktop = baselinePostSnap.viewports.desktop;
    const targetNode = Object.values(baselinePostDesktop.flat).find(n => n.id === 'target-btn');
    const subsequentNode = Object.values(baselinePostDesktop.flat).find(n => n.id === 'subsequent-btn');
    assert(targetNode, 'Target interactive button must exist in baseline');
    assert(subsequentNode, 'Subsequent interactive button must exist in baseline');

    // Run capture with controlled post-activation failure on target button
    const postFailSnap = await captureGroundTruth(postActivationHtml, {
      refresh: true,
      forcePostActivationFailureSid: targetNode.sid
    });
    const postFailDesktop = postFailSnap.viewports.desktop;

    // Result 1: Target candidate has outcome FAILED with its SID and reason
    const targetProbe = (postFailDesktop.interactionProbes || []).find(p => p.sid === targetNode.sid);
    assert(targetProbe, 'Target probe record must be present in interactionProbes');
    assert.strictEqual(targetProbe.outcome, 'FAILED', 'Target candidate must have outcome FAILED');
    assert.strictEqual(targetProbe.sid, targetNode.sid, 'Target candidate SID must match');
    assert(targetProbe.reason.includes('Forced post-activation hover probe failure'),
      `Target probe reason must record error, got: ${targetProbe.reason}`);

    // Verify active hover state was applied and changed style before throwing
    const origBaseRef = postFailDesktop.flat[targetNode.sid].computedStyleRef;
    const origBaseStyle = postFailDesktop.styleDictionary[origBaseRef];
    const nonHoverBg = origBaseStyle['background-color'];
    assert.strictEqual(nonHoverBg, 'rgb(239, 68, 68)', 'Original non-hover background must be rgb(239, 68, 68)');
    assert(targetProbe.activeComputedStyle, 'Active computed style must be captured while hover was active');
    const activeHoverBg = targetProbe.activeComputedStyle['background-color'];
    assert.strictEqual(activeHoverBg, 'rgb(34, 197, 94)', 'Active hover background must be rgb(34, 197, 94)');
    assert.notStrictEqual(activeHoverBg, nonHoverBg, 'Active hover background must differ from non-hover background');

    // Result 2: After the finally cleanup, the element's computed style equals its original non-hover value
    assert(targetProbe.restoredComputedStyle, 'Restored computed style must be captured after finally cleanup');
    const restoredBg = targetProbe.restoredComputedStyle['background-color'];
    assert.strictEqual(
      restoredBg,
      nonHoverBg,
      `After finally cleanup, element computed style must equal original non-hover value: expected ${nonHoverBg}, got ${restoredBg}`
    );
    assert.strictEqual(restoredBg, 'rgb(239, 68, 68)', 'Restored background must equal exact original value rgb(239, 68, 68)');
    assert.strictEqual(
      targetProbe.finalRestoredComputedStyle?.['background-color'],
      'rgb(239, 68, 68)',
      'Final restored style at end of probe sequence must remain rgb(239, 68, 68)'
    );

    // Result 3: Subsequent candidate is probed normally, proving failed candidate did not leave forced hover active
    const subsequentProbe = (postFailDesktop.interactionProbes || []).find(p => p.sid === subsequentNode.sid);
    assert(subsequentProbe, 'Subsequent candidate probe record must be present');
    assert.strictEqual(subsequentProbe.outcome, 'CAPTURED', 'Subsequent candidate must be probed normally with outcome CAPTURED');
    assert.strictEqual(subsequentProbe.reason, 'Computed style delta detected on :hover', 'Subsequent candidate must record normal hover delta');
    const subsequentFlatNode = postFailDesktop.flat[subsequentNode.sid];
    assert(subsequentFlatNode.states && subsequentFlatNode.states.hover, 'Subsequent candidate must have valid captured hover state in flat tree');
    const subsequentHoverStyle = postFailDesktop.styleDictionary[subsequentFlatNode.states.hover.computedStyleRef];
    assert.strictEqual(subsequentHoverStyle['background-color'], 'rgb(168, 85, 247)', 'Subsequent candidate hover style must be captured accurately');

    // 9. Deterministic hover sampling with transitions on target and descendant, return settling, and subsequent candidate test (Item 1)
    const transitionSamplingHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    .trans-target-card {
      background-color: rgb(240, 240, 240);
      transition: background-color 0.4s ease;
      padding: 16px;
      cursor: pointer;
    }
    .trans-target-card:hover {
      background-color: rgb(200, 220, 240);
    }
    .trans-descendant-label {
      color: rgb(15, 23, 42);
      transition: color 0.4s ease;
      display: inline-block;
    }
    .trans-target-card:hover .trans-descendant-label {
      color: rgb(220, 38, 38);
    }
    .trans-subsequent-btn {
      background-color: rgb(16, 185, 129);
      transition: background-color 0.4s ease;
      cursor: pointer;
    }
    .trans-subsequent-btn:hover {
      background-color: rgb(5, 150, 105);
    }
  </style>
</head>
<body>
  <div id="trans-card" class="trans-target-card">
    <span id="trans-label" class="trans-descendant-label">Interactive Card Label</span>
  </div>
  <button id="trans-subsequent" class="trans-subsequent-btn">Subsequent Button</button>
</body>
</html>`;

    const transSnap = await captureGroundTruth(transitionSamplingHtml, { refresh: true, captureRestoredStyles: true });
    const transDesktop = transSnap.viewports.desktop;

    const transTarget = Object.values(transDesktop.flat).find(n => n.id === 'trans-card');
    const transDescendant = Object.values(transDesktop.flat).find(n => n.id === 'trans-label');
    const transSubsequent = Object.values(transDesktop.flat).find(n => n.id === 'trans-subsequent');

    assert(transTarget, 'Target card with transition must exist in snapshot');
    assert(transDescendant, 'Descendant element with transition must exist in snapshot');
    assert(transSubsequent, 'Subsequent button with transition must exist in snapshot');

    // Assert original base computed values
    const transTargetBaseStyle = transDesktop.styleDictionary[transTarget.computedStyleRef];
    const transDescendantBaseStyle = transDesktop.styleDictionary[transDescendant.computedStyleRef];
    const transSubsequentBaseStyle = transDesktop.styleDictionary[transSubsequent.computedStyleRef];

    assert.strictEqual(transTargetBaseStyle['background-color'], 'rgb(240, 240, 240)', 'Original target base background must be rgb(240, 240, 240)');
    assert.strictEqual(transDescendantBaseStyle['color'], 'rgb(15, 23, 42)', 'Original descendant base color must be rgb(15, 23, 42)');
    assert.strictEqual(transSubsequentBaseStyle['background-color'], 'rgb(16, 185, 129)', 'Original subsequent base background must be rgb(16, 185, 129)');

    // Assert exact final hover values after motion settling
    assert(transTarget.states && transTarget.states.hover, 'Target must have captured hover state after transition settled');
    assert.strictEqual(transTarget.states.hover.status, 'CAPTURED');
    const transTargetHoverStyle = transDesktop.styleDictionary[transTarget.states.hover.computedStyleRef];
    assert.strictEqual(transTargetHoverStyle['background-color'], 'rgb(200, 220, 240)', 'Exact final target hover background must be rgb(200, 220, 240)');

    const descendantTriggerKey = `parent-hover:${transTarget.sid}`;
    assert(transDescendant.states && transDescendant.states[descendantTriggerKey], 'Descendant must have captured parent-hover state after transition settled');
    const transDescendantHoverStyle = transDesktop.styleDictionary[transDescendant.states[descendantTriggerKey].computedStyleRef];
    assert.strictEqual(transDescendantHoverStyle['color'], 'rgb(220, 38, 38)', 'Exact final descendant hover color must be rgb(220, 38, 38)');

    // Assert original computed transition declarations are preserved intact without rewriting
    assert(transTargetBaseStyle['transition-property'].includes('background-color'), 'Original transition-property must be preserved on target');
    assert.strictEqual(transTargetBaseStyle['transition-duration'], '0.4s', 'Original transition-duration 0.4s must be preserved on target');
    assert(transDescendantBaseStyle['transition-property'].includes('color'), 'Original transition-property must be preserved on descendant');

    // Assert that the subsequent candidate is probed normally and unaffected
    assert(transSubsequent.states && transSubsequent.states.hover, 'Subsequent button must have captured hover state');
    assert.strictEqual(transSubsequent.states.hover.status, 'CAPTURED');
    const transSubsequentHoverStyle = transDesktop.styleDictionary[transSubsequent.states.hover.computedStyleRef];
    assert.strictEqual(transSubsequentHoverStyle['background-color'], 'rgb(5, 150, 105)', 'Exact final subsequent hover background must be rgb(5, 150, 105)');

    // Probe summary for transition fixture
    const targetProbeRecord = transDesktop.interactionProbes.find(p => p.sid === transTarget.sid);
    const subsequentProbeRecord = transDesktop.interactionProbes.find(p => p.sid === transSubsequent.sid);
    assert.strictEqual(targetProbeRecord.outcome, 'CAPTURED');
    assert.strictEqual(subsequentProbeRecord.outcome, 'CAPTURED');

    // Assert bounded settling loop failure test: if motion cannot settle, records FAILED with candidate SID and reason
    const failSettleSnap = await captureGroundTruth(transitionSamplingHtml, {
      refresh: true,
      forceMotionSettleFailureSid: transTarget.sid
    });
    const failSettleDesktop = failSettleSnap.viewports.desktop;
    const failedSettleProbe = failSettleDesktop.interactionProbes.find(p => p.sid === transTarget.sid);
    assert(failedSettleProbe, 'Failed settle candidate must have probe record');
    assert.strictEqual(failedSettleProbe.outcome, 'FAILED', 'Unsettled candidate must record FAILED');
    assert(failedSettleProbe.reason.includes('bounded settling loop'), 'Reason must describe bounded settling loop failure');
    assert.strictEqual(failedSettleProbe.sid, transTarget.sid, 'Failed settle SID must match target candidate');

    // 10. Synthetic failure tests: clearing failure and return-settling failure (Item 1)
    const multiCandidateHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    .test-multi-btn { background-color: rgb(100, 100, 100); transition: none; }
    .test-multi-btn:hover { background-color: rgb(200, 100, 100); }
  </style>
</head>
<body>
  <button id="multi-btn-1" class="test-multi-btn">Button 1</button>
  <button id="multi-btn-2" class="test-multi-btn">Button 2</button>
  <button id="multi-btn-3" class="test-multi-btn">Button 3</button>
</body>
</html>`;

    const multiBaseSnap = await captureGroundTruth(multiCandidateHtml, { refresh: true });
    const b1Sid = Object.values(multiBaseSnap.viewports.desktop.flat).find(n => n.id === 'multi-btn-1').sid;
    const b2Sid = Object.values(multiBaseSnap.viewports.desktop.flat).find(n => n.id === 'multi-btn-2').sid;
    const b3Sid = Object.values(multiBaseSnap.viewports.desktop.flat).find(n => n.id === 'multi-btn-3').sid;

    // Test A: Clearing failure on candidate 1
    const clearFailSnap = await captureGroundTruth(multiCandidateHtml, {
      refresh: true,
      forceClearingFailureSid: b1Sid
    });
    const clearFailDesktop = clearFailSnap.viewports.desktop;
    const cfProbes = clearFailDesktop.interactionProbes || [];

    // Current probe FAILED
    const cfP1 = cfProbes.find(p => p.sid === b1Sid);
    assert(cfP1, 'Candidate 1 probe record must exist in clearing failure test');
    assert.strictEqual(cfP1.outcome, 'FAILED', 'Current probe must be FAILED on clearing failure');
    assert(cfP1.reason.includes('CSS.forcePseudoState clearing failed'), `Reason must describe clearing failure: ${cfP1.reason}`);

    // Next candidates FAILED without probing
    const cfP2 = cfProbes.find(p => p.sid === b2Sid);
    const cfP3 = cfProbes.find(p => p.sid === b3Sid);
    assert(cfP2, 'Candidate 2 probe record must exist');
    assert.strictEqual(cfP2.outcome, 'FAILED', 'Next candidate 2 must be FAILED without probing');
    assert(cfP2.reason.includes(`Prior hover state could not be restored after SID ${b1Sid}`),
      `Candidate 2 reason must state prior hover state could not be restored: ${cfP2.reason}`);

    assert(cfP3, 'Candidate 3 probe record must exist');
    assert.strictEqual(cfP3.outcome, 'FAILED', 'Next candidate 3 must be FAILED without probing');
    assert(cfP3.reason.includes(`Prior hover state could not be restored after SID ${b1Sid}`),
      `Candidate 3 reason must state prior hover state could not be restored: ${cfP3.reason}`);

    // failedCount sahih
    assert.strictEqual(clearFailDesktop.metrics.interactionProbeSummary.failedCount, 3, 'All 3 candidates must be counted in failedCount');
    assert.strictEqual(clearFailDesktop.metrics.interactionProbeSummary.capturedCount, 0, 'No candidates may be captured on clearing failure');

    // ma kaynach pending hover state tktbat
    assert(!clearFailDesktop.flat[b1Sid]?.states?.hover, 'Candidate 1 must not have written hover state to flat');
    assert(!clearFailDesktop.flat[b2Sid]?.states?.hover, 'Candidate 2 must not have written hover state to flat');
    assert(!clearFailDesktop.flat[b3Sid]?.states?.hover, 'Candidate 3 must not have written hover state to flat');

    // Test B: Return-settling failure on candidate 1
    const returnFailSnap = await captureGroundTruth(multiCandidateHtml, {
      refresh: true,
      forceReturnSettlingFailureSid: b1Sid
    });
    const returnFailDesktop = returnFailSnap.viewports.desktop;
    const rfProbes = returnFailDesktop.interactionProbes || [];

    // Current probe FAILED
    const rfP1 = rfProbes.find(p => p.sid === b1Sid);
    assert(rfP1, 'Candidate 1 probe record must exist in return-settling failure test');
    assert.strictEqual(rfP1.outcome, 'FAILED', 'Current probe must be FAILED on return-settling failure');
    assert(rfP1.reason.includes('Return motion settling'), `Reason must describe return settling failure: ${rfP1.reason}`);

    // Next candidates FAILED without probing
    const rfP2 = rfProbes.find(p => p.sid === b2Sid);
    const rfP3 = rfProbes.find(p => p.sid === b3Sid);
    assert(rfP2, 'Candidate 2 probe record must exist');
    assert.strictEqual(rfP2.outcome, 'FAILED', 'Next candidate 2 must be FAILED without probing');
    assert(rfP2.reason.includes(`Prior hover state could not be restored after SID ${b1Sid}`),
      `Candidate 2 reason must state prior hover state could not be restored: ${rfP2.reason}`);

    assert(rfP3, 'Candidate 3 probe record must exist');
    assert.strictEqual(rfP3.outcome, 'FAILED', 'Next candidate 3 must be FAILED without probing');
    assert(rfP3.reason.includes(`Prior hover state could not be restored after SID ${b1Sid}`),
      `Candidate 3 reason must state prior hover state could not be restored: ${rfP3.reason}`);

    // failedCount sahih
    assert.strictEqual(returnFailDesktop.metrics.interactionProbeSummary.failedCount, 3, 'All 3 candidates must be counted in failedCount');
    assert.strictEqual(returnFailDesktop.metrics.interactionProbeSummary.capturedCount, 0, 'No candidates may be captured on return-settling failure');

    // ma kaynach pending hover state tktbat
    assert(!returnFailDesktop.flat[b1Sid]?.states?.hover, 'Candidate 1 must not have written hover state to flat');
    assert(!returnFailDesktop.flat[b2Sid]?.states?.hover, 'Candidate 2 must not have written hover state to flat');
    assert(!returnFailDesktop.flat[b3Sid]?.states?.hover, 'Candidate 3 must not have written hover state to flat');

    // 11. Do not claim full state coverage from stateSnapshotCount alone (unchanged states are valid)
    assert(desktopVp.metrics.computedStyleCoveragePercent === 100, 'Coverage must be 100% with valid unchanged hover states');
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
    const goldenDir = path.resolve(__dirname, 'fixtures', 'b81-golden');
    const manifestPath = path.join(goldenDir, 'manifest.json');
    const legacySnapshotsPath = path.join(goldenDir, 'legacy-snapshots.json');

    assert(fs.existsSync(manifestPath), `Committed golden manifest must exist at ${manifestPath}`);
    assert(fs.existsSync(legacySnapshotsPath), `Committed golden legacy snapshots must exist at ${legacySnapshotsPath}`);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.strictEqual(manifest.sourceCommit, '8fa8ee3', 'Committed golden manifest sourceCommit must be 8fa8ee3');

    const legacySnapshots = JSON.parse(fs.readFileSync(legacySnapshotsPath, 'utf8'));

    const fixtures = discoverCorpusFixtures(path.resolve(__dirname, '..'));
    assert.strictEqual(fixtures.length, 8, 'All 8 fixtures must be discovered');

    for (const fixture of fixtures) {
      const goldenEntry = legacySnapshots[fixture.fixtureId];
      assert(goldenEntry, `Committed golden snapshot entry must exist for ${fixture.fixtureId}`);

      const manifestEntry = manifest.fixtures[fixture.fixtureId];
      assert(manifestEntry, `Manifest entry must exist for ${fixture.fixtureId}`);

      // Verify content hash against committed manifest
      const content = fs.readFileSync(fixture.filePath, 'utf8');
      const hash = crypto.createHash('sha256').update(content + ':v2_k9').digest('hex').slice(0, 16);
      assert.strictEqual(hash, manifestEntry.contentHash,
        `Content hash for ${fixture.fixtureId} must match committed manifest (${manifestEntry.contentHash})`);

      const goldenSnap = goldenEntry;
      const currSnap = await captureGroundTruth(fixture.filePath, { refresh: true });

      for (const vpKey of ['desktop', 'tablet', 'mobile']) {
        const goldenVp = goldenSnap.viewports[vpKey];
        const currVp = currSnap.viewports[vpKey];
        assert(goldenVp && currVp, `Viewport ${vpKey} must exist in both snapshots for ${fixture.fixtureId}`);

        const gFlat = goldenVp.flat || {};
        const cFlat = currVp.flat || {};
        const gSids = Object.keys(gFlat).sort();
        const cSids = Object.keys(cFlat).sort();

        // 1. Exact set of legacy SIDs and node count
        if (cSids.length !== gSids.length) {
          assert.fail(`Node count mismatch: fixture=${fixture.fixtureId}, vp=${vpKey}, oldVal=${gSids.length}, newVal=${cSids.length}`);
        }
        assert.deepStrictEqual(cSids, gSids,
          `Exact SID set mismatch: fixture=${fixture.fixtureId}, vp=${vpKey}`);

        // Compare all pre-8.1 nodes in flat
        for (const sid of gSids) {
          const gNode = gFlat[sid];
          const cNode = cFlat[sid];

          // 2. Geometry parity (explicit tolerance <= 2px for Chromium cross-run subpixel layout/rasterization)
          for (const dim of ['x', 'y', 'w', 'h']) {
            const diff = Math.abs(cNode.rect[dim] - gNode.rect[dim]);
            if (diff > 2) {
              assert.fail(`Geometry mismatch: fixture=${fixture.fixtureId}, vp=${vpKey}, sid=${sid}, field=rect.${dim}, diff=${diff}px, oldVal=${gNode.rect[dim]}, newVal=${cNode.rect[dim]}`);
            }
          }

          // 3. ChildRects geometry and structure parity (explicit tolerance <= 2px)
          const gCR = gNode.childRects || [];
          const cCR = cNode.childRects || [];
          if (cCR.length !== gCR.length) {
            assert.fail(`childRects count mismatch: fixture=${fixture.fixtureId}, vp=${vpKey}, sid=${sid}, oldVal=${gCR.length}, newVal=${cCR.length}`);
          }
          for (let i = 0; i < gCR.length; i++) {
            if (cCR[i].type !== gCR[i].type) {
              assert.fail(`childRect[${i}].type mismatch: fixture=${fixture.fixtureId}, vp=${vpKey}, sid=${sid}, oldVal=${gCR[i].type}, newVal=${cCR[i].type}`);
            }
            if (cCR[i].tag !== gCR[i].tag) {
              assert.fail(`childRect[${i}].tag mismatch: fixture=${fixture.fixtureId}, vp=${vpKey}, sid=${sid}, oldVal=${gCR[i].tag}, newVal=${cCR[i].tag}`);
            }
            if (cCR[i].sid !== gCR[i].sid) {
              assert.fail(`childRect[${i}].sid mismatch: fixture=${fixture.fixtureId}, vp=${vpKey}, sid=${sid}, oldVal=${gCR[i].sid}, newVal=${cCR[i].sid}`);
            }
            for (const dim of ['x', 'y', 'w', 'h']) {
              const diff = Math.abs((cCR[i].rect?.[dim] || 0) - (gCR[i].rect?.[dim] || 0));
              if (diff > 2) {
                assert.fail(`childRect[${i}].rect.${dim} geometry mismatch: fixture=${fixture.fixtureId}, vp=${vpKey}, sid=${sid}, diff=${diff}px, oldVal=${gCR[i].rect[dim]}, newVal=${cCR[i].rect[dim]}`);
              }
            }
          }

          // 4. Complete legacy styles parity in both directions (subpixel layout tolerance <= 1px for px values)
          function isStyleMatch(val1, val2) {
            if (val1 === val2) return true;
            if (typeof val1 === 'string' && typeof val2 === 'string' && val1.endsWith('px') && val2.endsWith('px')) {
              const n1 = parseFloat(val1);
              const n2 = parseFloat(val2);
              if (!Number.isNaN(n1) && !Number.isNaN(n2) && Math.abs(n1 - n2) <= 1.0) {
                return true;
              }
            }
            return false;
          }

          for (const prop of Object.keys(gNode.styles || {})) {
            if (!isStyleMatch(cNode.styles[prop], gNode.styles[prop])) {
              assert.fail(`Style mismatch: fixture=${fixture.fixtureId}, vp=${vpKey}, sid=${sid}, field=styles.${prop}, oldVal=${JSON.stringify(gNode.styles[prop])}, newVal=${JSON.stringify(cNode.styles[prop])}`);
            }
          }
          for (const prop of Object.keys(cNode.styles || {})) {
            if (!isStyleMatch(gNode.styles[prop], cNode.styles[prop])) {
              assert.fail(`Reverse style mismatch: fixture=${fixture.fixtureId}, vp=${vpKey}, sid=${sid}, field=styles.${prop}, oldVal=${JSON.stringify(gNode.styles[prop])}, newVal=${JSON.stringify(cNode.styles[prop])}`);
            }
          }

          // 5. Text metrics parity
          for (const fld of ['directText', 'fullText', 'hasDirectText', 'lineCount']) {
            if (cNode[fld] !== gNode[fld]) {
              assert.fail(`Text metric mismatch: fixture=${fixture.fixtureId}, vp=${vpKey}, sid=${sid}, field=${fld}, oldVal=${JSON.stringify(gNode[fld])}, newVal=${JSON.stringify(cNode[fld])}`);
            }
          }
          if (JSON.stringify(cNode.lineWidths) !== JSON.stringify(gNode.lineWidths)) {
            assert.fail(`lineWidths mismatch: fixture=${fixture.fixtureId}, vp=${vpKey}, sid=${sid}, field=lineWidths, oldVal=${JSON.stringify(gNode.lineWidths)}, newVal=${JSON.stringify(cNode.lineWidths)}`);
          }

          // 6. Behavior parity
          if (cNode.isInteractive !== gNode.isInteractive) {
            assert.fail(`Behavior mismatch: fixture=${fixture.fixtureId}, vp=${vpKey}, sid=${sid}, field=isInteractive, oldVal=${gNode.isInteractive}, newVal=${cNode.isInteractive}`);
          }
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

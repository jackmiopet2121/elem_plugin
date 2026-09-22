/**
 * SYNTHETIC TEST SUITE K3: State-Rule Depth & Pseudo-Class Parity
 *
 * Verifies:
 * 1. Timeline Hover Chain Parity:
 *    - Selector expands to .timeline-step:hover .step-marker, .elementor-heading-title, .elementor-icon, .elementor-button.
 *    - Declarations enforce !important (background, color, border-color).
 * 2. Guide-Card Hover Scale Chain Parity:
 *    - Selector preserves leaf element .guide-card:hover .card-media img.
 *    - Declarations enforce transform: scale(1.05) !important.
 * 3. Accordion Is-Active Rotate Chain Parity:
 *    - Selector expands to .accordion-item.is-active .accordion-icon, .elementor-icon, .elementor-heading-title, *.
 *    - Declarations enforce transform: rotate(45deg) !important.
 * 4. Action Button Hover Chain Parity:
 *    - Expands to .elementor-button:hover and .elementor-widget-button.
 * 5. Pseudo-Element (::before / ::after) Parity:
 *    - Correct attachment to container vs inner widget targets.
 * 6. Direct Card/Container Hover Preservation:
 *    - Container hover (.guide-card:hover) does NOT pollute children with card transforms.
 * 7. Virtual Renderer WP-Faithful Cascade Order:
 *    - Micro-CSS emitted into slot 5 with post-cascade priority after compiled template styles.
 * 8. Real Compilation Check:
 *    - Real timeline snippet compiled through compiler pipeline produces expanded state rules in stylesheet-engine.
 */

const assert = require('assert');
const {
  extractMicroCss,
  expandStateSelectorForElementor
} = require('../src/normalizers/css-classifier');
const { renderElementorToHtml } = require('../src/emulator/elementor-virtual-renderer');
const { compileHtmlToElementor } = require('../src/index');

console.log('========================================================================');
console.log('     SYNTHETIC TEST SUITE K3: STATE-RULE DEPTH & PSEUDO-CLASS PARITY');
console.log('========================================================================\n');

let passedTests = 0;

// [1/8] Timeline Hover Chain Parity
console.log('▶ [1/8] Testing timeline hover chain parity (heading, icon, button inner elements)...');
const timelineSel = '.timeline-step:hover .step-marker';
const expandedTimeline = expandStateSelectorForElementor(timelineSel);
assert.ok(expandedTimeline.includes('.timeline-step:hover .step-marker'), 'Must include base selector');
assert.ok(expandedTimeline.includes('.timeline-step:hover .step-marker .elementor-heading-title'), 'Must include .elementor-heading-title');
assert.ok(expandedTimeline.includes('.timeline-step:hover .step-marker .elementor-icon'), 'Must include .elementor-icon');
assert.ok(expandedTimeline.includes('.timeline-step:hover .step-marker .elementor-button'), 'Must include .elementor-button');

const timelineCss = `
.timeline-step:hover .step-marker {
  background: #111827;
  color: white;
  border-color: #111827;
}
`;
const extractedTimeline = extractMicroCss(timelineCss);
assert.ok(extractedTimeline.includes('.elementor-heading-title'), 'Extracted micro-CSS must contain .elementor-heading-title');
assert.ok(extractedTimeline.includes('color: white !important'), 'Extracted micro-CSS must enforce color: white !important');
assert.ok(extractedTimeline.includes('background: #111827 !important'), 'Extracted micro-CSS must enforce background: #111827 !important');
assert.ok(extractedTimeline.includes('border-color: #111827 !important'), 'Extracted micro-CSS must enforce border-color: #111827 !important');
console.log('  ✓ Timeline hover chain verified: targets inner Elementor elements with !important parity.');
passedTests++;

// [2/8] Guide-Card Hover Scale Chain Parity
console.log('\n▶ [2/8] Testing guide-card hover scale chain parity (leaf img preserved)...');
const guideImgSel = '.guide-card:hover .card-media img';
const expandedGuideImg = expandStateSelectorForElementor(guideImgSel);
assert.strictEqual(expandedGuideImg, '.guide-card:hover .card-media img', 'Leaf img target must remain unpolluted');

const guideCss = `
.guide-card:hover .card-media img {
  transform: scale(1.05);
}
`;
const extractedGuide = extractMicroCss(guideCss);
assert.ok(extractedGuide.includes('.guide-card:hover .card-media img'), 'Must retain exact guide-card img selector');
assert.ok(extractedGuide.includes('transform: scale(1.05) !important'), 'Must enforce transform: scale(1.05) !important');
console.log('  ✓ Guide-card hover scale chain verified: leaf image scaled with !important.');
passedTests++;

// [3/8] Accordion Is-Active Rotate Chain Parity
console.log('\n▶ [3/8] Testing accordion is-active rotate chain parity (icon, heading, wildcard)...');
const accordionSel = '.accordion-item.is-active .accordion-icon';
const expandedAccordion = expandStateSelectorForElementor(accordionSel);
assert.ok(expandedAccordion.includes('.accordion-item.is-active .accordion-icon'), 'Must include base selector');
assert.ok(expandedAccordion.includes('.accordion-item.is-active .accordion-icon .elementor-icon'), 'Must include .elementor-icon');
assert.ok(expandedAccordion.includes('.accordion-item.is-active .accordion-icon .elementor-heading-title'), 'Must include .elementor-heading-title');
assert.ok(expandedAccordion.includes('.accordion-item.is-active .accordion-icon *'), 'Must include wildcard for nested spans/i/svg');

const accordionCss = `
.accordion-item.is-active .accordion-icon {
  transform: rotate(45deg);
}
`;
const extractedAccordion = extractMicroCss(accordionCss);
assert.ok(extractedAccordion.includes('.elementor-icon'), 'Must target inner .elementor-icon');
assert.ok(extractedAccordion.includes('transform: rotate(45deg) !important'), 'Must enforce transform: rotate(45deg) !important');
console.log('  ✓ Accordion is-active rotate verified: icon, heading, and wildcard rotate 45deg.');
passedTests++;

// [4/8] Action Button Hover Chain Parity
console.log('\n▶ [4/8] Testing action button hover chain parity...');
const btnSel = '.btn-primary:hover';
const expandedBtn = expandStateSelectorForElementor(btnSel);
assert.ok(expandedBtn.includes('.btn-primary .elementor-button:hover'), 'Must include .btn-primary .elementor-button:hover');
assert.ok(expandedBtn.includes('.elementor-widget-button.btn-primary .elementor-button:hover'), 'Must include .elementor-widget-button');
assert.ok(!expandedBtn.includes('.btn-primary:hover .elementor-button'), 'Must NOT include wrapper-triggered descendant');
assert.ok(!expandedBtn.includes('.btn-primary:hover'), 'Must NOT include bare wrapper hover');

const btnCss = `
.btn-primary:hover {
  transform: translateY(-2px);
  background-color: #111827;
  opacity: 0.9;
}
`;
const extractedBtn = extractMicroCss(btnCss);
assert.ok(extractedBtn.includes('.elementor-button:hover'), 'Must target .elementor-button:hover');
assert.ok(extractedBtn.includes('transform: translateY(-2px) !important'), 'Must enforce transform with !important');
assert.ok(extractedBtn.includes('background-color: #111827 !important'), 'Must enforce background-color with !important');
console.log('  ✓ Action button hover verified: targets native .elementor-button with !important.');
passedTests++;

// [5/8] Pseudo-Element (::before / ::after) Parity
console.log('\n▶ [5/8] Testing pseudo-element (::before / ::after) parity...');
const containerBeforeSel = '.timeline-container::before';
const expandedContainerBefore = expandStateSelectorForElementor(containerBeforeSel);
assert.strictEqual(expandedContainerBefore, '.timeline-container::before', 'Container ::before must remain on container');

const widgetBeforeSel = '.step-marker::after';
const expandedWidgetBefore = expandStateSelectorForElementor(widgetBeforeSel);
assert.ok(expandedWidgetBefore.includes('.step-marker::after'), 'Must include .step-marker::after');
assert.ok(expandedWidgetBefore.includes('.step-marker .elementor-heading-title::after'), 'Must include .elementor-heading-title::after');

const hoverBeforeSel = '.timeline-step:hover .step-marker::before';
const expandedHoverBefore = expandStateSelectorForElementor(hoverBeforeSel);
assert.ok(expandedHoverBefore.includes('.timeline-step:hover .step-marker::before'), 'Must include base hover ::before');
assert.ok(expandedHoverBefore.includes('.timeline-step:hover .step-marker .elementor-heading-title::before'), 'Must include heading ::before');
console.log('  ✓ Pseudo-element parity verified: container vs widget depth preserved.');
passedTests++;

// [6/8] Direct Card/Container Hover Preservation
console.log('\n▶ [6/8] Testing direct card/container hover preservation (no child pollution)...');
const cardSel = '.guide-card:hover';
const expandedCard = expandStateSelectorForElementor(cardSel);
assert.strictEqual(expandedCard, '.guide-card:hover', 'Card container hover must never pollute child headings/icons');

const featureCardSel = '.feature-card:hover';
const expandedFeature = expandStateSelectorForElementor(featureCardSel);
assert.strictEqual(expandedFeature, '.feature-card:hover', 'Feature card hover must never pollute child headings/icons');
console.log('  ✓ Direct card/container hover verified: zero pollution of child primitives.');
passedTests++;

// [7/8] Virtual Renderer WP-Faithful Cascade Order
console.log('\n▶ [7/8] Testing Virtual Renderer WP-faithful cascade order...');
const mockTemplate = {
  content: [
    {
      id: 'step_marker_1',
      elType: 'widget',
      widgetType: 'heading',
      _sid: 'step-1',
      settings: {
        _sid: 'step-1',
        title: '1',
        title_color: '#111827',
        css_classes: 'step-marker'
      }
    },
    {
      id: 'style_widget_1',
      elType: 'widget',
      widgetType: 'html',
      settings: {
        _html_reason: 'SYSTEM:stylesheet-engine',
        html: '<style>\n.timeline-step:hover .step-marker, .timeline-step:hover .step-marker .elementor-heading-title {\n  color: #ffffff !important;\n}\n</style>'
      }
    }
  ]
};

const virtualHtml = renderElementorToHtml(mockTemplate, { title: 'Cascade Order Test' });
assert.ok(virtualHtml.includes('/* 5. Isolated Micro-CSS & Atomic Overrides (Post-Cascade Priority) */'), 'Slot 5 must exist in rendered HTML');
assert.ok(virtualHtml.includes('.timeline-step:hover .step-marker .elementor-heading-title'), 'Slot 5 must contain expanded micro-CSS rule');

const idxSlot2 = virtualHtml.indexOf('/* 2. Compiled Elementor Template Styles');
const idxSlot5 = virtualHtml.indexOf('/* 5. Isolated Micro-CSS & Atomic Overrides');
assert.ok(idxSlot2 !== -1 && idxSlot5 !== -1, 'Both slot 2 and slot 5 must exist');
assert.ok(idxSlot5 > idxSlot2, 'Slot 5 (Micro-CSS) must come AFTER slot 2 (Compiled Template Styles) in cascade');
console.log('  ✓ Virtual renderer cascade order verified: Slot 5 post-cascade priority contract holds.');
passedTests++;

// [8/8] Full Compilation of Landing Timeline Hover Snippet
console.log('\n▶ [8/8] Compiling timeline snippet to verify stylesheet-engine state rules...');
(async () => {
  const timelineSnippet = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <style>
      .timeline-container { display: flex; flex-direction: column; gap: 48px; }
      .timeline-step { display: flex; align-items: center; gap: 24px; }
      .step-marker {
        width: 56px; height: 56px; border-radius: 50%;
        background: #ffffff; border: 2px solid #e5e7eb;
        display: flex; align-items: center; justify-content: center;
        font-weight: 700; color: #111827;
      }
      .timeline-step:hover .step-marker {
        background: #111827; color: white; border-color: #111827;
      }
    </style>
  </head>
  <body>
    <div class="timeline-container">
      <div class="timeline-step">
        <div class="step-marker">1</div>
        <div class="step-text">Setup account</div>
      </div>
    </div>
  </body>
  </html>
  `;

  const { templateJson } = await compileHtmlToElementor(timelineSnippet, { offline: true, inspect: false });
  assert.ok(templateJson, 'Template must be generated');

  function findStylesheet(nodes) {
    for (const n of nodes) {
      if (n.widgetType === 'html' && n.settings?.html?.includes('<style')) return n.settings.html;
      if (n.elements) {
        const found = findStylesheet(n.elements);
        if (found) return found;
      }
    }
    return null;
  }

  const sheetHtml = findStylesheet(templateJson.content);
  assert.ok(sheetHtml, 'Stylesheet engine HTML widget must exist');
  assert.ok(
    sheetHtml.includes('.timeline-step:hover .step-marker .elementor-heading-title'),
    'Stylesheet must contain expanded .elementor-heading-title hover target'
  );
  assert.ok(
    sheetHtml.includes('color: white !important'),
    'Stylesheet must contain color: white !important'
  );
  assert.ok(
    sheetHtml.includes('background: #111827 !important'),
    'Stylesheet must contain background: #111827 !important'
  );

  console.log('  ✓ Real timeline snippet compilation verified: stylesheet engine contains expanded hover rules.');
  passedTests++;

  console.log('\n========================================================================');
  console.log(`✓ [TASK K3 PASSED] ALL ${passedTests}/8 TESTS PASSED 100%!`);
  console.log('========================================================================\n');
})().catch(err => {
  console.error('\n❌ [TASK K3 FAILED]', err);
  process.exit(1);
});

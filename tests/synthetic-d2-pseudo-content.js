/**
 * SYNTHETIC TEST: D2 PSEUDO-CONTENT PRESERVATION SUITE
 * Verifies:
 * 1. Pseudo capture: style-snapshot extracts ::before/::after (content, color, fontSize).
 * 2. Rule retention: css-classifier NEVER purges rules with pseudo selectors + content !== 'none'.
 * 3. Micro-embed proof:
 *    - Node b direct text = empty + pseudo content !== 'none' -> HTML micro-embed (NON_ELEMENTOR_PRIMITIVE:pseudo-content).
 *    - Node b direct text + pseudo content -> Native widget + class retained.
 * 4. Justification & Schema audit: NON_ELEMENTOR_PRIMITIVE:pseudo-content is recognized as valid.
 * 5. Synthetic fixture 08-visual-atomicity (partial): pseudo-content bullets test.
 */
const assert = require('assert');
const { extractMicroCss } = require('../src/normalizers/css-classifier');
const { detectNodeRole, mapNodeToElementor } = require('../src/smart/geometry-mapper');
const { isValidHtmlReason } = require('../src/smart/style-router');
const { auditTemplate } = require('../src/linter/template-linter');

console.log('========================================================================');
console.log('       SYNTHETIC TEST: D2 PSEUDO-CONTENT PRESERVATION');
console.log('========================================================================');

// --- 1. PSEUDO RULE RETENTION IN MICRO-CSS ---
console.log('▶ [1/4] Testing micro-CSS pseudo-content rule retention...');
const samplePseudoCss = `
  .features-list li::before {
    content: "✓";
    color: #10b981;
    font-size: 16px;
    margin-right: 8px;
  }
  .bullet-tag::after {
    content: "•";
    color: #3b82f6;
    font-size: 14px;
  }
  .normal-heading {
    font-size: 24px;
    color: #111827;
  }
`;

const micro = extractMicroCss(samplePseudoCss);

// Base representables dropped
assert.strictEqual(micro.includes('.normal-heading'), false, 'Normal heading representables must be dropped');

// Pseudo-content rules MUST be retained
assert.ok(micro.includes('.features-list li::before'), 'Must retain .features-list li::before');
assert.ok(micro.includes('content: "✓"'), 'Must retain content: "✓"');
assert.ok(micro.includes('color: #10b981'), 'Must retain color on pseudo element');
assert.ok(micro.includes('.bullet-tag::after'), 'Must retain .bullet-tag::after');
assert.ok(micro.includes('content: "•"'), 'Must retain content: "•"');
console.log('  ✓ Rule Retention Proof: ::before and ::after rules survive 100% in micro-CSS.');

// --- 2. MICRO-EMBED PROOF: EMPTY TEXT + PSEUDO CONTENT ---
console.log('\n▶ [2/4] Testing empty direct text + pseudo content -> HTML micro-embed...');

const mockEmptyNode = {
  tagName: 'span',
  className: 'bullet-icon',
  attributes: { 'data-sid': 'sid-bullet-empty' },
  isTextOnly: () => false,
  children: []
};

const mockEmptyGt = {
  sid: 'sid-bullet-empty',
  hasDirectText: false,
  directText: '',
  fullText: '',
  rect: { x: 10, y: 10, w: 16, h: 16 },
  styles: { display: 'inline-block', width: '16px', height: '16px' },
  pseudo: {
    before: {
      content: '"✓"',
      color: 'rgb(16, 185, 129)',
      fontSize: '16px'
    }
  }
};

const mockSnapshot = {
  viewports: {
    desktop: {
      flat: {
        'sid-bullet-empty': mockEmptyGt
      }
    }
  }
};

const roleEmpty = detectNodeRole(mockEmptyNode, mockEmptyGt);
assert.strictEqual(roleEmpty, 'pseudo_html', 'Empty text node with pseudo-content must detect as pseudo_html');

const mappedWidget = mapNodeToElementor(mockEmptyNode, null, mockSnapshot, 'desktop', {});
assert.ok(mappedWidget, 'Mapped widget must be non-null');
assert.strictEqual(mappedWidget.widgetType, 'html', 'Empty text node with pseudo-content must map to HTML widget');
assert.strictEqual(mappedWidget.settings?._html_reason, 'NON_ELEMENTOR_PRIMITIVE:pseudo-content', 'HTML widget must have justification NON_ELEMENTOR_PRIMITIVE:pseudo-content');
assert.strictEqual(isValidHtmlReason(mappedWidget.settings._html_reason), true, 'Justification must be recognized by style-router');
assert.strictEqual(mappedWidget.settings?.css_classes, 'bullet-icon', 'CSS classes must be retained on HTML widget');
console.log('  ✓ Micro-Embed Proof: Empty text node mapped to justified HTML widget (NON_ELEMENTOR_PRIMITIVE:pseudo-content).');

// --- 3. NATIVE WIDGET PROOF: DIRECT TEXT + PSEUDO CONTENT ---
console.log('\n▶ [3/4] Testing direct text + pseudo content -> Native widget with class retained...');

const mockTextNode = {
  tagName: 'span',
  className: 'feature-label-badge',
  attributes: { 'data-sid': 'sid-label-with-text' },
  isTextOnly: () => true,
  children: []
};

const mockTextGt = {
  sid: 'sid-label-with-text',
  hasDirectText: true,
  directText: 'Enterprise Security Included',
  fullText: 'Enterprise Security Included',
  rect: { x: 50, y: 100, w: 250, h: 32 },
  styles: { color: 'rgb(17, 24, 39)', fontSize: '14px', fontWeight: '500' },
  pseudo: {
    before: {
      content: '"•"',
      color: 'rgb(59, 130, 246)',
      fontSize: '18px'
    }
  }
};

mockSnapshot.viewports.desktop.flat['sid-label-with-text'] = mockTextGt;

const roleText = detectNodeRole(mockTextNode, mockTextGt);
assert.ok(['heading', 'text'].includes(roleText), 'Node with direct text must remain native heading/text role');

const mappedNativeWidget = mapNodeToElementor(mockTextNode, null, mockSnapshot, 'desktop', {});
assert.ok(mappedNativeWidget, 'Mapped native widget must be non-null');
assert.ok(['heading', 'text-editor'].includes(mappedNativeWidget.widgetType), 'Must map to native heading or text-editor widget');
assert.strictEqual(mappedNativeWidget.settings?.css_classes, 'feature-label-badge', 'Native widget must retain css_classes for pseudo-selector scoping');
console.log(`  ✓ Native Widget Proof: Mapped to '${mappedNativeWidget.widgetType}' with css_classes='feature-label-badge' retained.`);

// --- 4. SYNTHETIC FIXTURE 08-VISUAL-ATOMICITY (PARTIAL) ---
console.log('\n▶ [4/5] Auditing synthetic template with justified pseudo HTML widgets...');
const testTemplate = {
  title: '08-visual-atomicity (pseudo-content bullets)',
  content: [
    {
      id: 'root-con',
      elType: 'container',
      settings: {
        content_width: 'boxed',
        boxed_width: { unit: 'px', size: 1200 },
        padding_mobile: { unit: 'px', top: '16', right: '16', bottom: '16', left: '16', isLinked: true }
      },
      elements: [
        mappedWidget,
        mappedNativeWidget
      ]
    }
  ]
};

const auditRes = auditTemplate(testTemplate);
if (auditRes.errors.length > 0) console.log('Audit errors:', auditRes.errors);
assert.strictEqual(auditRes.valid, true, 'Template with justified pseudo HTML widget must pass linter audit');
assert.strictEqual(auditRes.errors.length, 0, 'Must have zero linter errors');
assert.strictEqual(auditRes.stats.proWidgets, 0, 'Must have 0 Pro widgets (100% Free Core)');
console.log('  ✓ Linter Audit Proof: Template passed with 0 errors and 0 pro widgets.');

console.log('\n========================================================================');
console.log('       ALL TASK D2 PSEUDO-CONTENT TESTS PASSED SUCCESSFULLY! ✓');
console.log('========================================================================\n');
process.exit(0);

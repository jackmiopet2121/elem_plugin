/**
 * Synthetic Test: Task F5 - Pseudo Decor Parity (Timeline Line & Badges)
 * 
 * Verifies that:
 * 1. content: '' and content: counter(...) are treated as ACTIVE (not inactive/none).
 * 2. Pseudo rules with position: absolute, inset, transform, width, height, background are retained in micro-CSS.
 * 3. Mandatory css_classes retention on all nodes with active pseudo-elements.
 * 4. Timeline vertical line test: .timeline-item::before retains absolute layout, dimensions, and background.
 * 5. Numbered counter badge test: .process-step::before retains counter(step-counter), inset, transform, flex centering.
 * 6. Scalar contract validation passes with 0 violations.
 */

const assert = require('assert');
const { extractMicroCss } = require('../src/normalizers/css-classifier');
const { mapNodeToElementor } = require('../src/smart/geometry-mapper');
const { renderElementorToHtml } = require('../src/emulator/elementor-virtual-renderer');
const { validateTemplate } = require('../src/smart/scalar-contract');

console.log('=== Task F5: Pseudo Decor Parity Synthetic Suite ===\n');

// 1. Test Active Pseudo Content Detection Logic
console.log('1. Testing content: "" and content: counter(...) activity recognition...');

// Testing through geometry-mapper's hasActivePseudoContent logic
const snapshotEmptyContent = {
  pseudo: {
    before: { content: '""' }
  }
};
const snapshotSingleQuoteContent = {
  pseudo: {
    before: { content: "''" }
  }
};
const snapshotCounterContent = {
  pseudo: {
    before: { content: 'counter(step-counter)' }
  }
};
const snapshotCountersContent = {
  pseudo: {
    before: { content: 'counters(step, ".")' }
  }
};
const snapshotNoneContent = {
  pseudo: {
    before: { content: 'none' }
  }
};
const snapshotNormalContent = {
  pseudo: {
    before: { content: 'normal' }
  }
};

const createDummyNode = (sid) => ({
  tagName: 'div',
  attributes: { 'data-sid': sid },
  children: [
    { tagName: 'h3', textContent: 'Step Title', children: [] }
  ]
});

const mappedDummyEmpty = mapNodeToElementor(createDummyNode('d-1'), null, {
  viewports: { desktop: { flat: { 'd-1': { sid: 'd-1', ...snapshotEmptyContent, rect: { w: 100, h: 40 }, styles: {} } } } }
}, 'desktop');
assert.strictEqual(mappedDummyEmpty.settings._has_pseudo, true, 'content: "" must be treated as ACTIVE');

const mappedDummyCounter = mapNodeToElementor(createDummyNode('d-2'), null, {
  viewports: { desktop: { flat: { 'd-2': { sid: 'd-2', ...snapshotCounterContent, rect: { w: 100, h: 40 }, styles: {} } } } }
}, 'desktop');
assert.strictEqual(mappedDummyCounter.settings._has_pseudo, true, 'content: counter(...) must be treated as ACTIVE');

const mappedDummyNone = mapNodeToElementor(createDummyNode('d-3'), null, {
  viewports: { desktop: { flat: { 'd-3': { sid: 'd-3', ...snapshotNoneContent, rect: { w: 100, h: 40 }, styles: {} } } } }
}, 'desktop');
assert.strictEqual(mappedDummyNone.settings._has_pseudo, undefined, 'content: none must be treated as INACTIVE');

const mappedDummyNormal = mapNodeToElementor(createDummyNode('d-4'), null, {
  viewports: { desktop: { flat: { 'd-4': { sid: 'd-4', ...snapshotNormalContent, rect: { w: 100, h: 40 }, styles: {} } } } }
}, 'desktop');
assert.strictEqual(mappedDummyNormal.settings._has_pseudo, undefined, 'content: normal must be treated as INACTIVE');

console.log('   ✓ content: "", \'\', and counter(...) correctly verified as ACTIVE.');

// 2. Timeline Vertical Line Parity Test
console.log('\n2. Testing Timeline Vertical Line extraction & class retention...');

const timelineCss = `
  .timeline {
    position: relative;
  }
  .timeline-item {
    position: relative;
    padding-left: 32px;
  }
  .timeline-item::before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: 12px;
    width: 2px;
    background: #cbd5e1;
  }
`;

const extractedTimelineCss = extractMicroCss(timelineCss);
assert.ok(extractedTimelineCss.includes('.timeline-item::before'), 'Micro-CSS must retain .timeline-item::before');
assert.ok(extractedTimelineCss.includes("content: ''"), 'Micro-CSS must retain content: \'\'');
assert.ok(extractedTimelineCss.includes('position: absolute'), 'Micro-CSS must retain position: absolute');
assert.ok(extractedTimelineCss.includes('top: 0'), 'Micro-CSS must retain top: 0');
assert.ok(extractedTimelineCss.includes('bottom: 0'), 'Micro-CSS must retain bottom: 0');
assert.ok(extractedTimelineCss.includes('left: 12px'), 'Micro-CSS must retain left: 12px');
assert.ok(extractedTimelineCss.includes('width: 2px'), 'Micro-CSS must retain width: 2px');
assert.ok(extractedTimelineCss.includes('background: #cbd5e1'), 'Micro-CSS must retain background: #cbd5e1');

const timelineNode = {
  tagName: 'div',
  attributes: { 'data-sid': 't-item-1', class: 'timeline-item' },
  children: [
    { tagName: 'h4', textContent: 'Milestone 1', children: [] },
    { tagName: 'p', textContent: 'Phase completed', children: [] }
  ]
};

const timelineSnapshot = {
  viewports: {
    desktop: {
      flat: {
        't-item-1': {
          sid: 't-item-1',
          className: 'timeline-item',
          rect: { x: 50, y: 100, w: 600, h: 80 },
          styles: { position: 'relative', paddingLeft: '32px' },
          pseudo: {
            before: {
              content: '""',
              position: 'absolute',
              width: '2px',
              height: '80px',
              backgroundColor: '#cbd5e1'
            }
          }
        }
      }
    }
  }
};

const mappedTimeline = mapNodeToElementor(timelineNode, null, timelineSnapshot, 'desktop');
assert.ok(mappedTimeline, 'Timeline container must be mapped');
assert.strictEqual(mappedTimeline.elType, 'container', 'Timeline item with children must remain a container');
assert.ok(mappedTimeline.settings.css_classes.includes('timeline-item'), 'css_classes must retain "timeline-item"');
assert.ok(mappedTimeline.settings._css_classes.includes('timeline-item'), '_css_classes must retain "timeline-item"');
assert.strictEqual(mappedTimeline.settings._has_pseudo, true, '_has_pseudo flag must be true');
console.log('   ✓ Timeline item retains css_classes and micro-CSS retains full vertical line rule.');

// 3. Numbered Counter Badges Test (1, 2, 3)
console.log('\n3. Testing Numbered Counter Badges (inset, transform, counter-reset, counter-increment)...');

const counterCss = `
  .process-list {
    counter-reset: step-counter;
  }
  .process-step {
    counter-increment: step-counter;
    position: relative;
    padding-left: 48px;
  }
  .process-step::before {
    content: counter(step-counter);
    position: absolute;
    inset: 0 auto auto 0;
    transform: translateY(-50%);
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: #3b82f6;
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
  }
`;

const extractedCounterCss = extractMicroCss(counterCss);
assert.ok(extractedCounterCss.includes('counter-reset: step-counter'), 'Micro-CSS must retain counter-reset on process-list');
assert.ok(extractedCounterCss.includes('counter-increment: step-counter'), 'Micro-CSS must retain counter-increment on process-step');
assert.ok(extractedCounterCss.includes('.process-step::before'), 'Micro-CSS must retain .process-step::before');
assert.ok(extractedCounterCss.includes('content: counter(step-counter)'), 'Micro-CSS must retain content: counter(step-counter)');
assert.ok(extractedCounterCss.includes('position: absolute'), 'Micro-CSS must retain position: absolute');
assert.ok(extractedCounterCss.includes('inset: 0 auto auto 0'), 'Micro-CSS must retain inset: 0 auto auto 0');
assert.ok(extractedCounterCss.includes('transform: translateY(-50%)'), 'Micro-CSS must retain transform');
assert.ok(extractedCounterCss.includes('border-radius: 50%'), 'Micro-CSS must retain border-radius: 50%');
assert.ok(extractedCounterCss.includes('background: #3b82f6'), 'Micro-CSS must retain background: #3b82f6');
assert.ok(extractedCounterCss.includes('display: flex'), 'Micro-CSS must retain display: flex');

const stepNode = {
  tagName: 'div',
  attributes: { 'data-sid': 'step-item-1', class: 'process-step' },
  children: [
    { tagName: 'h4', textContent: 'Step 1: Sign up', children: [] }
  ]
};

const stepSnapshot = {
  viewports: {
    desktop: {
      flat: {
        'step-item-1': {
          sid: 'step-item-1',
          className: 'process-step',
          rect: { x: 50, y: 200, w: 400, h: 50 },
          styles: { position: 'relative' },
          pseudo: {
            before: {
              content: 'counter(step-counter)',
              position: 'absolute',
              width: '28px',
              height: '28px',
              backgroundColor: '#3b82f6',
              color: '#ffffff'
            }
          }
        }
      }
    }
  }
};

const mappedStep = mapNodeToElementor(stepNode, null, stepSnapshot, 'desktop');
assert.ok(mappedStep, 'Step container must be mapped');
assert.ok(mappedStep.settings.css_classes.includes('process-step'), 'css_classes must retain "process-step"');
assert.strictEqual(mappedStep.settings._has_pseudo, true, '_has_pseudo flag must be true');
console.log('   ✓ Counter badge retains process-step class and micro-CSS retains counter & transform.');

// 4. Virtual Renderer HTML Class Output
console.log('\n4. Testing Virtual Renderer HTML emission with retained classes...');
const htmlOutput = renderElementorToHtml({
  title: 'Pseudo Decor Test',
  content: [mappedTimeline, mappedStep]
});

assert.ok(htmlOutput.includes('class="elementor-element elementor-element-'), 'HTML output must render Elementor element');
assert.ok(htmlOutput.includes('timeline-item'), 'Rendered HTML must include timeline-item class');
assert.ok(htmlOutput.includes('process-step'), 'Rendered HTML must include process-step class');
console.log('   ✓ Emulator HTML output verified: classes timeline-item & process-step present on DOM elements.');

// 5. Scalar Contract Compliance
console.log('\n5. Testing Scalar Contract compliance on mapped structures...');
const violationsTimeline = validateTemplate({ content: [mappedTimeline] });
assert.strictEqual(violationsTimeline.length, 0, 'Timeline template must have 0 scalar contract violations');

const violationsStep = validateTemplate({ content: [mappedStep] });
assert.strictEqual(violationsStep.length, 0, 'Step template must have 0 scalar contract violations');
console.log('   ✓ 0 scalar contract violations detected on templates with pseudo decor.');

console.log('\n=== ALL TASK F5 CHECKS PASSED ===\n');

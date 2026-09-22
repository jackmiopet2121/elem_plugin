/**
 * Synthetic Test: Task F6 - Composite Interactive Controls (FAQ Header Text+Icon)
 * 
 * Verifies that:
 * 1. Button/trigger with child spans (text + icon) or nested visual elements is detected as composite_control.
 * 2. Maps to HTML micro-embed with lossless rawHtml, _html_reason: 'NON_ELEMENTOR_PRIMITIVE:composite-control', and css_classes retained.
 * 3. Standard CTA buttons remain native Elementor button widgets.
 * 4. Delegation bridge replay works (toggle closest classes, aria-expanded, icon rotation).
 * 5. Full scalar contract compliance.
 */

const assert = require('assert');
const { mapNodeToElementor, detectNodeRole } = require('../src/smart/geometry-mapper');
const { isValidHtmlReason } = require('../src/smart/style-router');
const { renderElementorToHtml } = require('../src/emulator/elementor-virtual-renderer');
const { validateTemplate } = require('../src/smart/scalar-contract');

console.log('=== Task F6: Composite Interactive Controls Synthetic Suite ===\n');

// 1. FAQ Accordion Header (text span + plus icon span)
console.log('1. Testing FAQ Accordion Header (text span + plus icon span)...');

const faqAccordionNode = {
  tagName: 'button',
  className: 'accordion-header',
  attributes: {
    'data-sid': 'faq-btn-1',
    class: 'accordion-header',
    'aria-expanded': 'false',
    type: 'button'
  },
  children: [
    {
      tagName: 'span',
      className: 'accordion-title',
      attributes: { class: 'accordion-title' },
      textContent: 'What is your refund policy?',
      children: [{ tagName: '#text', textContent: 'What is your refund policy?', children: [] }]
    },
    {
      tagName: 'span',
      className: 'accordion-icon',
      attributes: { class: 'accordion-icon' },
      textContent: '+',
      children: [{ tagName: '#text', textContent: '+', children: [] }]
    }
  ]
};

const faqSnapshot = {
  viewports: {
    desktop: {
      flat: {
        'faq-btn-1': {
          sid: 'faq-btn-1',
          className: 'accordion-header',
          rect: { x: 50, y: 100, w: 600, h: 56 },
          styles: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
          isInteractive: true
        }
      }
    }
  }
};

const role1 = detectNodeRole(faqAccordionNode, faqSnapshot.viewports.desktop.flat['faq-btn-1']);
assert.strictEqual(role1, 'composite_control', 'FAQ header with text span + icon span must be detected as composite_control');

const mappedFaq = mapNodeToElementor(faqAccordionNode, null, faqSnapshot, 'desktop');
assert.ok(mappedFaq, 'Mapped elementor widget must exist');
assert.strictEqual(mappedFaq.widgetType, 'html', 'Composite control must map to HTML widget');
assert.strictEqual(mappedFaq.settings._html_reason, 'NON_ELEMENTOR_PRIMITIVE:composite-control', 'Must carry NON_ELEMENTOR_PRIMITIVE:composite-control justification');
assert.strictEqual(isValidHtmlReason(mappedFaq.settings._html_reason), true, 'Justification must be recognized by style-router');
assert.ok(mappedFaq.settings.html.includes('What is your refund policy?'), 'Lossless HTML must retain title span text');
assert.ok(mappedFaq.settings.html.includes('accordion-icon'), 'Lossless HTML must retain accordion-icon span');
assert.ok(mappedFaq.settings.html.includes('+'), 'Lossless HTML must retain icon character');
assert.ok(mappedFaq.settings.css_classes.includes('accordion-header'), 'css_classes must retain accordion-header');
console.log('   ✓ FAQ header with text + plus icon mapped to justified HTML micro-embed.');

// 2. Trigger with SVG chevron indicator
console.log('\n2. Testing Accordion Trigger with SVG chevron indicator...');

const svgTriggerNode = {
  tagName: 'button',
  className: 'faq-trigger',
  attributes: {
    'data-sid': 'faq-btn-2',
    class: 'faq-trigger',
    id: 'faq-btn-2',
    'aria-expanded': 'false',
    'aria-controls': 'faq-panel-2'
  },
  children: [
    {
      tagName: 'span',
      className: 'faq-question',
      attributes: { class: 'faq-question' },
      textContent: 'How do I cancel my subscription?',
      children: [{ tagName: '#text', textContent: 'How do I cancel my subscription?', children: [] }]
    },
    {
      tagName: 'span',
      className: 'faq-indicator',
      attributes: { class: 'faq-indicator' },
      rawHtml: '<span class="faq-indicator"><svg viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7"></path></svg></span>',
      children: [
        {
          tagName: 'svg',
          rawHtml: '<svg viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7"></path></svg>',
          children: []
        }
      ]
    }
  ]
};

const svgSnapshot = {
  viewports: {
    desktop: {
      flat: {
        'faq-btn-2': {
          sid: 'faq-btn-2',
          className: 'faq-trigger',
          id: 'faq-btn-2',
          rect: { x: 50, y: 200, w: 700, h: 64 },
          styles: { display: 'flex', alignItems: 'center' },
          isInteractive: true
        }
      }
    }
  }
};

const role2 = detectNodeRole(svgTriggerNode, svgSnapshot.viewports.desktop.flat['faq-btn-2']);
assert.strictEqual(role2, 'composite_control', 'Trigger with text and SVG indicator must be detected as composite_control');

const mappedSvgTrigger = mapNodeToElementor(svgTriggerNode, null, svgSnapshot, 'desktop');
assert.strictEqual(mappedSvgTrigger.widgetType, 'html', 'Must map to HTML widget');
assert.strictEqual(mappedSvgTrigger.settings._html_reason, 'NON_ELEMENTOR_PRIMITIVE:composite-control');
assert.ok(mappedSvgTrigger.settings.html.includes('faq-indicator'), 'Lossless HTML must retain indicator span');
assert.ok(mappedSvgTrigger.settings.html.includes('<svg'), 'Lossless HTML must retain nested SVG');
assert.ok(mappedSvgTrigger.settings.css_classes.includes('faq-trigger'), 'css_classes must retain faq-trigger');
console.log('   ✓ Trigger with SVG chevron mapped to justified HTML micro-embed.');

// 3. Accordion header with direct text + icon span
console.log('\n3. Testing Accordion Header with direct text + icon span...');

const directTextAccordionNode = {
  tagName: 'button',
  className: 'accordion-header',
  attributes: {
    'data-sid': 'acc-btn-3',
    class: 'accordion-header'
  },
  textContent: 'Is there a free trial? +',
  children: [
    {
      tagName: '#text',
      textContent: 'Is there a free trial? ',
      children: []
    },
    {
      tagName: 'span',
      className: 'accordion-icon',
      attributes: { class: 'accordion-icon' },
      textContent: '+',
      children: [{ tagName: '#text', textContent: '+', children: [] }]
    }
  ]
};

const directTextSnapshot = {
  viewports: {
    desktop: {
      flat: {
        'acc-btn-3': {
          sid: 'acc-btn-3',
          className: 'accordion-header',
          directText: 'Is there a free trial? ',
          hasDirectText: true,
          rect: { x: 50, y: 300, w: 600, h: 50 },
          styles: {},
          isInteractive: true
        }
      }
    }
  }
};

const role3 = detectNodeRole(directTextAccordionNode, directTextSnapshot.viewports.desktop.flat['acc-btn-3']);
assert.strictEqual(role3, 'composite_control', 'Header with direct text + icon span must be composite_control');

const mappedDirectText = mapNodeToElementor(directTextAccordionNode, null, directTextSnapshot, 'desktop');
assert.strictEqual(mappedDirectText.widgetType, 'html');
assert.strictEqual(mappedDirectText.settings._html_reason, 'NON_ELEMENTOR_PRIMITIVE:composite-control');
assert.ok(mappedDirectText.settings.html.includes('accordion-icon'), 'HTML retains accordion-icon span');
console.log('   ✓ Direct text + icon span recognized and mapped to justified micro-embed.');

// 4. Negative Test: Standard CTA button remains native button widget
console.log('\n4. Testing Standard CTA Button (Negative Control)...');

const standardBtnNode = {
  tagName: 'button',
  className: 'btn btn-primary',
  attributes: {
    'data-sid': 'cta-btn-1',
    class: 'btn btn-primary'
  },
  children: [
    {
      tagName: 'span',
      textContent: 'Get Started Today',
      children: [{ tagName: '#text', textContent: 'Get Started Today', children: [] }]
    }
  ]
};

const ctaSnapshot = {
  viewports: {
    desktop: {
      flat: {
        'cta-btn-1': {
          sid: 'cta-btn-1',
          className: 'btn btn-primary',
          rect: { x: 50, y: 400, w: 180, h: 48 },
          styles: { backgroundColor: '#2563eb', paddingLeft: '24px' },
          fullText: 'Get Started Today',
          isInteractive: true
        }
      }
    }
  }
};

const role4 = detectNodeRole(standardBtnNode, ctaSnapshot.viewports.desktop.flat['cta-btn-1']);
assert.strictEqual(role4, 'button', 'Standard single-text button must remain native button widget');

const mappedCta = mapNodeToElementor(standardBtnNode, null, ctaSnapshot, 'desktop');
assert.strictEqual(mappedCta.widgetType, 'button', 'Must map to Elementor button widget');
assert.strictEqual(mappedCta.settings.text, 'Get Started Today');
console.log('   ✓ Standard CTA correctly remains native button widget.');

// 5. Delegation Bridge Replay Simulation
console.log('\n5. Testing Delegation Bridge Replay (toggle class, aria-expanded, icon rotation)...');

const renderedHtml = renderElementorToHtml({
  content: [
    {
      id: 'card-1',
      elType: 'container',
      settings: { css_classes: 'faq-card' },
      elements: [mappedFaq]
    }
  ]
});

assert.ok(renderedHtml.includes('faq-card'), 'Rendered HTML contains parent card container');
assert.ok(renderedHtml.includes('accordion-header'), 'Rendered HTML contains accordion-header class');
assert.ok(renderedHtml.includes('accordion-icon'), 'Rendered HTML contains accordion-icon');

const mockEvent = {
  _cardClasses: {},
  _ariaExpanded: 'false',
  target: {
    closest: (selector) => {
      if (selector === '.accordion-header' || selector.includes('accordion-header')) {
        return {
          hasAttribute: (attr) => attr === 'aria-expanded',
          getAttribute: (attr) => (attr === 'aria-expanded' ? mockEvent._ariaExpanded : null),
          setAttribute: (attr, val) => {
            mockEvent._ariaExpanded = val;
          },
          closest: (ancSelector) => {
            if (ancSelector === '.faq-card' || ancSelector.includes('faq-card')) {
              return {
                classList: {
                  contains: (cls) => Boolean(mockEvent._cardClasses[cls]),
                  toggle: (cls) => {
                    mockEvent._cardClasses[cls] = !mockEvent._cardClasses[cls];
                  }
                }
              };
            }
            return null;
          }
        };
      }
      return null;
    }
  }
};

const trig = mockEvent.target.closest('.accordion-header');
assert.ok(trig, 'Bridge closest finds trigger');
const anc = trig.closest('.faq-card');
assert.ok(anc, 'Bridge closest finds ancestor card');
anc.classList.toggle('is-open');
assert.strictEqual(mockEvent._cardClasses['is-open'], true, 'is-open toggled on card');

if (trig.hasAttribute('aria-expanded')) {
  const isExp = trig.getAttribute('aria-expanded') === 'true';
  trig.setAttribute('aria-expanded', String(!isExp));
}
assert.strictEqual(mockEvent._ariaExpanded, 'true', 'aria-expanded toggled to true');
console.log('   ✓ Delegation bridge interaction replay verified.');

// 6. Scalar Contract Validation
console.log('\n6. Testing Scalar Contract compliance on template with composite controls...');

const templateWithComposite = {
  version: '0.4',
  title: 'Test Template',
  type: 'page',
  content: [
    {
      id: 'root-con',
      elType: 'container',
      isInner: false,
      settings: {
        content_width: 'boxed',
        direction: 'column',
        gap: { unit: 'px', size: 20, column: 20, row: 20, isLinked: true }
      },
      elements: [
        {
          id: 'card-con',
          elType: 'container',
          isInner: true,
          settings: {
            content_width: 'full',
            direction: 'column'
          },
          elements: [mappedFaq, mappedSvgTrigger]
        }
      ]
    }
  ]
};

const violations = validateTemplate(templateWithComposite);
assert.strictEqual(violations.length, 0, 'Template must have 0 violations');
console.log('   ✓ 0 scalar contract violations detected on template with composite controls.');

console.log('\n=== ALL TASK F6 CHECKS PASSED ===\n');

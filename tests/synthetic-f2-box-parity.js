/**
 * Synthetic Test: Task F2 - Per-Side Border & Per-Corner Radius
 * 
 * Verifies that:
 * 1. FAQ divider container with only border-bottom maps to border_width { top: '0', right: '0', bottom: '1', left: '0', isLinked: false }.
 * 2. Guide image widget with top-only rounded corners (16px 16px 0 0) maps to border_radius { top: '16', right: '16', bottom: '0', left: '0', isLinked: false }.
 * 3. Virtual renderer renders per-side border-width and per-corner border-radius on containers and image widgets.
 * 4. Verification matrix RULE-BOX-01 detects borderBottomWidth mismatch.
 * 5. Verification matrix RULE-BOX-02 detects borderTopRightRadius mismatch.
 */

const assert = require('assert');
const { mapNodeToElementor } = require('../src/smart/geometry-mapper');
const { auditVerificationMatrix } = require('../src/smart/verification-matrix');
const { renderElementorToHtml } = require('../src/emulator/elementor-virtual-renderer');

console.log('=== Task F2: Per-Side Border & Per-Corner Radius Suite ===\n');

// 1. FAQ Divider: Container with border-bottom only
console.log('1. Testing FAQ divider (border-bottom only)...');
const faqNode = {
  tagName: 'div',
  attributes: { 'data-sid': 'faq-item-1', class: 'faq-item' },
  children: []
};

const faqSnapshot = {
  viewports: {
    desktop: {
      flat: {
        'faq-item-1': {
          sid: 'faq-item-1',
          rect: { x: 100, y: 100, w: 800, h: 60 },
          styles: {
            display: 'flex',
            flexDirection: 'column',
            borderTopWidth: '0px',
            borderRightWidth: '0px',
            borderBottomWidth: '1px',
            borderLeftWidth: '0px',
            borderBottomStyle: 'solid',
            borderBottomColor: 'rgb(226, 232, 240)',
            paddingTop: '16px',
            paddingBottom: '16px'
          }
        }
      }
    }
  }
};

const mappedFaq = mapNodeToElementor(faqNode, null, faqSnapshot, 'desktop');
assert.ok(mappedFaq, 'FAQ item container should be mapped');
assert.strictEqual(mappedFaq.settings.border_border, 'solid', 'Border style must be solid');
assert.strictEqual(mappedFaq.settings.border_color, '#e2e8f0', 'Border color must normalize to #e2e8f0');
assert.deepStrictEqual(mappedFaq.settings.border_width, {
  unit: 'px',
  top: '0',
  right: '0',
  bottom: '1',
  left: '0',
  isLinked: false
}, 'border_width must be { top:0, right:0, bottom:1, left:0, isLinked:false }');
console.log('   ✓ FAQ divider container mapped with exact per-side border_width.');

// 2. Guide Image: Top-only rounded corners (16px 16px 0 0)
console.log('\n2. Testing Guide Image (border-radius: 16px 16px 0 0)...');
const imgNode = {
  tagName: 'img',
  attributes: { 'data-sid': 'guide-img-1', src: 'https://example.com/guide.jpg', alt: 'Guide' },
  children: []
};

const imgSnapshot = {
  viewports: {
    desktop: {
      flat: {
        'guide-img-1': {
          sid: 'guide-img-1',
          rect: { x: 100, y: 100, w: 400, h: 250 },
          styles: {
            display: 'block',
            borderTopLeftRadius: '16px',
            borderTopRightRadius: '16px',
            borderBottomRightRadius: '0px',
            borderBottomLeftRadius: '0px',
            borderTopWidth: '0px',
            borderRightWidth: '0px',
            borderBottomWidth: '0px',
            borderLeftWidth: '0px'
          }
        }
      }
    }
  }
};

const mappedImg = mapNodeToElementor(imgNode, null, imgSnapshot, 'desktop');
assert.ok(mappedImg, 'Image widget should be mapped');
assert.deepStrictEqual(mappedImg.settings.border_radius, {
  unit: 'px',
  top: '16',
  right: '16',
  bottom: '0',
  left: '0',
  isLinked: false
}, 'border_radius must be { top:16, right:16, bottom:0, left:0, isLinked:false }');
console.log('   ✓ Guide image widget mapped with exact per-corner border_radius.');

// 3. Virtual Renderer CSS Emission
console.log('\n3. Testing Emulator CSS generation for borders & radius...');
const html = renderElementorToHtml({
  title: 'Test Box Parity',
  content: [mappedFaq, mappedImg]
});

assert.ok(html.includes('border-width: 0px 0px 1px 0px;'), 'CSS must include per-side border-width for container');
assert.ok(html.includes('border-color: #e2e8f0;'), 'CSS must include normalized border-color');
assert.ok(html.includes('border-radius: 16px 16px 0px 0px;'), 'CSS must include per-corner border-radius on img');
console.log('   ✓ Emulator emitted exact per-side border-width and per-corner border-radius CSS.');

// 4. Matrix RULE-BOX-01 (Border Width per-side check)
console.log('\n4. Testing verification-matrix RULE-BOX-01 (per-side border width)...');
const gtMatrixSnapshot = {
  viewports: {
    desktop: {
      flat: {
        'faq-div': {
          tag: 'div',
          sid: 'faq-div',
          rect: { x: 100, y: 100, w: 800, h: 50 },
          styles: {
            borderTopWidth: '0px',
            borderRightWidth: '0px',
            borderBottomWidth: '1px',
            borderLeftWidth: '0px'
          }
        }
      }
    }
  }
};

const renderPassing = {
  viewports: {
    desktop: {
      flat: {
        'faq-div': {
          tag: 'div',
          sid: 'faq-div',
          rect: { x: 100, y: 100, w: 800, h: 50 },
          styles: {
            borderTopWidth: '0px',
            borderRightWidth: '0px',
            borderBottomWidth: '1px',
            borderLeftWidth: '0px'
          }
        }
      }
    }
  }
};

const matrixPass = auditVerificationMatrix(gtMatrixSnapshot, renderPassing, { content: [] });
const bwPass = matrixPass.defects.filter(d => d.rule === 'RULE-BOX-01');
assert.strictEqual(bwPass.length, 0, 'No RULE-BOX-01 defect when bottom borders match');

const renderFailingBw = {
  viewports: {
    desktop: {
      flat: {
        'faq-div': {
          tag: 'div',
          sid: 'faq-div',
          rect: { x: 100, y: 100, w: 800, h: 50 },
          styles: {
            borderTopWidth: '0px',
            borderRightWidth: '0px',
            borderBottomWidth: '0px', // Missing bottom border!
            borderLeftWidth: '0px'
          }
        }
      }
    }
  }
};

const matrixFailBw = auditVerificationMatrix(gtMatrixSnapshot, renderFailingBw, { content: [] });
const bwFail = matrixFailBw.defects.filter(d => d.rule === 'RULE-BOX-01');
assert.strictEqual(bwFail.length, 1, 'RULE-BOX-01 must flag missing borderBottomWidth');
assert.strictEqual(bwFail[0].property, 'borderBottomWidth');
console.log('   ✓ RULE-BOX-01 correctly caught borderBottomWidth delta (expected 1px, got 0px).');

// 5. Matrix RULE-BOX-02 (Border Radius per-corner check)
console.log('\n5. Testing verification-matrix RULE-BOX-02 (per-corner border radius)...');
const gtRadSnapshot = {
  viewports: {
    desktop: {
      flat: {
        'card-img': {
          tag: 'img',
          sid: 'card-img',
          rect: { x: 100, y: 100, w: 300, h: 200 },
          styles: {
            borderTopLeftRadius: '16px',
            borderTopRightRadius: '16px',
            borderBottomRightRadius: '0px',
            borderBottomLeftRadius: '0px'
          }
        }
      }
    }
  }
};

const renderPassingRad = {
  viewports: {
    desktop: {
      flat: {
        'card-img': {
          tag: 'img',
          sid: 'card-img',
          rect: { x: 100, y: 100, w: 300, h: 200 },
          styles: {
            borderTopLeftRadius: '16px',
            borderTopRightRadius: '16px',
            borderBottomRightRadius: '0px',
            borderBottomLeftRadius: '0px'
          }
        }
      }
    }
  }
};

const matrixPassRad = auditVerificationMatrix(gtRadSnapshot, renderPassingRad, { content: [] });
const radPass = matrixPassRad.defects.filter(d => d.rule === 'RULE-BOX-02');
assert.strictEqual(radPass.length, 0, 'No RULE-BOX-02 defect when corners match');

const renderFailingCorner = {
  viewports: {
    desktop: {
      flat: {
        'card-img': {
          tag: 'img',
          sid: 'card-img',
          rect: { x: 100, y: 100, w: 300, h: 200 },
          styles: {
            borderTopLeftRadius: '16px',
            borderTopRightRadius: '0px', // Top-right corner missing!
            borderBottomRightRadius: '0px',
            borderBottomLeftRadius: '0px'
          }
        }
      }
    }
  }
};

const matrixFailRad = auditVerificationMatrix(gtRadSnapshot, renderFailingCorner, { content: [] });
const radFail = matrixFailRad.defects.filter(d => d.rule === 'RULE-BOX-02');
assert.strictEqual(radFail.length, 1, 'RULE-BOX-02 must flag missing borderTopRightRadius');
assert.strictEqual(radFail[0].property, 'borderTopRightRadius');
console.log('   ✓ RULE-BOX-02 correctly caught borderTopRightRadius delta (expected 16px, got 0px).');

console.log('\n=== ALL TASK F2 CHECKS PASSED ===\n');

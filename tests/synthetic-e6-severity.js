/**
 * SYNTHETIC TEST: E6 SEVERITY RECALIBRATION (G9 Enforcement)
 * 
 * Verifies:
 * 1. Native widget with |Δwidth| > 24px -> severity: 'HIGH', advisory: false
 * 2. Native widget with |Δwidth| <= 24px -> severity: 'MEDIUM', advisory: false
 * 3. Native widget with |Δheight| > 24px -> severity: 'HIGH', advisory: false
 * 4. Native widget with |Δheight| <= 24px -> severity: 'MEDIUM', advisory: false
 * 5. Derived metrics (lineCount, wordCount, lineWidth) remain rung: 'R0', advisory: true
 */

const assert = require('assert');
const { auditVerificationMatrix } = require('../src/smart/verification-matrix');

console.log('========================================================================');
console.log('       SYNTHETIC TEST: E6 SEVERITY RECALIBRATION (G9 ENFORCEMENT)');
console.log('========================================================================\n');

// 1. NATIVE WIDGET WITH |Δwidth| > 24px -> HIGH
console.log('▶ [1/5] Testing |Δwidth| > 24px on native editable widget (escalated to HIGH)...');
{
  const templateJson = {
    title: 'E6 Width Test',
    content: [
      {
        id: 'widget-btn-1',
        _sid: 'sid-btn-1',
        elType: 'widget',
        widgetType: 'button',
        settings: { text: 'Click me' }
      }
    ]
  };

  const gtSnapshot = {
    viewports: {
      desktop: {
        flat: {
          'sid-btn-1': {
            sid: 'sid-btn-1',
            tag: 'button',
            hasDirectText: true,
            rect: { x: 50, y: 50, w: 200, h: 50 },
            styles: { color: 'rgb(255, 255, 255)', backgroundColor: 'rgb(0, 100, 200)' }
          }
        }
      }
    }
  };

  // Rendered width is 150px -> delta = 50px (> 24px)
  const renderSnapshot = {
    viewports: {
      desktop: {
        flat: {
          'sid-btn-1': {
            sid: 'sid-btn-1',
            widgetId: 'widget-btn-1',
            tag: 'button',
            hasDirectText: true,
            rect: { x: 50, y: 50, w: 150, h: 50 },
            styles: { color: 'rgb(255, 255, 255)', backgroundColor: 'rgb(0, 100, 200)' }
          }
        }
      }
    }
  };

  const report = auditVerificationMatrix(gtSnapshot, renderSnapshot, templateJson);
  const widthDefect = report.defects.find(d => d.nodeSid === 'sid-btn-1' && d.property === 'width');

  assert.ok(widthDefect, 'Width defect must be generated for 50px delta');
  assert.strictEqual(widthDefect.severity, 'HIGH', 'Severity must be escalated to HIGH when delta > 24px');
  assert.strictEqual(widthDefect.advisory, false, 'Advisory must be false for native geometric defect');
  console.log('  ✓ Escalation Proof: Width delta = 50px correctly flagged as severity: HIGH, advisory: false');
}

// 2. NATIVE WIDGET WITH |Δwidth| <= 24px -> MEDIUM
console.log('\n▶ [2/5] Testing |Δwidth| <= 24px on native editable widget (retained as MEDIUM)...');
{
  const templateJson = {
    title: 'E6 Width Moderate Test',
    content: [
      {
        id: 'widget-btn-2',
        _sid: 'sid-btn-2',
        elType: 'widget',
        widgetType: 'button',
        settings: { text: 'Click me' }
      }
    ]
  };

  // Width tolerance for native widget is max(TOLERANCES.WIDTH_PX * 2.5, gtW * 0.12)
  // With TOLERANCES.WIDTH_PX = 4, 4 * 2.5 = 10px. If gtW = 80px, 80 * 0.12 = 9.6px -> tolerance = 10px.
  // Delta = 20px (> 10px tolerance, but <= 24px threshold)
  const gtSnapshot = {
    viewports: {
      desktop: {
        flat: {
          'sid-btn-2': {
            sid: 'sid-btn-2',
            tag: 'button',
            hasDirectText: true,
            rect: { x: 50, y: 50, w: 80, h: 40 },
            styles: { color: 'rgb(255, 255, 255)', backgroundColor: 'rgb(0, 100, 200)' }
          }
        }
      }
    }
  };

  const renderSnapshot = {
    viewports: {
      desktop: {
        flat: {
          'sid-btn-2': {
            sid: 'sid-btn-2',
            widgetId: 'widget-btn-2',
            tag: 'button',
            hasDirectText: true,
            rect: { x: 50, y: 50, w: 60, h: 40 }, // delta = 20px <= 24px
            styles: { color: 'rgb(255, 255, 255)', backgroundColor: 'rgb(0, 100, 200)' }
          }
        }
      }
    }
  };

  const report = auditVerificationMatrix(gtSnapshot, renderSnapshot, templateJson);
  const widthDefect = report.defects.find(d => d.nodeSid === 'sid-btn-2' && d.property === 'width');

  assert.ok(widthDefect, 'Width defect must be generated for 20px delta');
  assert.strictEqual(widthDefect.severity, 'MEDIUM', 'Severity must remain MEDIUM when delta <= 24px');
  assert.strictEqual(widthDefect.advisory, false, 'Advisory must be false');
  console.log('  ✓ Moderate Proof: Width delta = 20px retained as severity: MEDIUM, advisory: false');
}

// 3. NATIVE WIDGET WITH |Δheight| > 24px -> HIGH
console.log('\n▶ [3/5] Testing |Δheight| > 24px on native image widget (escalated to HIGH)...');
{
  const templateJson = {
    title: 'E6 Height Test',
    content: [
      {
        id: 'widget-img-1',
        _sid: 'sid-img-1',
        elType: 'widget',
        widgetType: 'image',
        settings: { image: { url: 'https://example.com/pic.jpg' } }
      }
    ]
  };

  const gtSnapshot = {
    viewports: {
      desktop: {
        flat: {
          'sid-img-1': {
            sid: 'sid-img-1',
            tag: 'img',
            hasDirectText: false,
            rect: { x: 50, y: 50, w: 300, h: 200 },
            styles: {}
          }
        }
      }
    }
  };

  // Rendered height is 150px -> delta = 50px (> 24px)
  const renderSnapshot = {
    viewports: {
      desktop: {
        flat: {
          'sid-img-1': {
            sid: 'sid-img-1',
            widgetId: 'widget-img-1',
            tag: 'img',
            hasDirectText: false,
            rect: { x: 50, y: 50, w: 300, h: 150 },
            styles: {}
          }
        }
      }
    }
  };

  const report = auditVerificationMatrix(gtSnapshot, renderSnapshot, templateJson);
  const heightDefect = report.defects.find(d => d.nodeSid === 'sid-img-1' && d.property === 'height');

  assert.ok(heightDefect, 'Height defect must be generated for 50px delta');
  assert.strictEqual(heightDefect.severity, 'HIGH', 'Severity must be escalated to HIGH when delta > 24px');
  assert.strictEqual(heightDefect.advisory, false, 'Advisory must be false');
  console.log('  ✓ Escalation Proof: Height delta = 50px correctly flagged as severity: HIGH, advisory: false');
}

// 4. NATIVE WIDGET WITH |Δheight| <= 24px -> MEDIUM
console.log('\n▶ [4/5] Testing |Δheight| <= 24px on native image widget (retained as MEDIUM)...');
{
  const templateJson = {
    title: 'E6 Height Moderate Test',
    content: [
      {
        id: 'widget-img-2',
        _sid: 'sid-img-2',
        elType: 'widget',
        widgetType: 'image',
        settings: { image: { url: 'https://example.com/pic2.jpg' } }
      }
    ]
  };

  // Height tolerance: max(TOLERANCES.HEIGHT_PX * 2.5, gtH * 0.15)
  // With TOLERANCES.HEIGHT_PX = 4, 4 * 2.5 = 10px. If gtH = 60px, 60 * 0.15 = 9px -> tolerance = 10px.
  // Delta = 20px (> 10px tolerance, but <= 24px threshold)
  const gtSnapshot = {
    viewports: {
      desktop: {
        flat: {
          'sid-img-2': {
            sid: 'sid-img-2',
            tag: 'img',
            hasDirectText: false,
            rect: { x: 50, y: 50, w: 100, h: 60 },
            styles: {}
          }
        }
      }
    }
  };

  const renderSnapshot = {
    viewports: {
      desktop: {
        flat: {
          'sid-img-2': {
            sid: 'sid-img-2',
            widgetId: 'widget-img-2',
            tag: 'img',
            hasDirectText: false,
            rect: { x: 50, y: 50, w: 100, h: 40 }, // delta = 20px <= 24px
            styles: {}
          }
        }
      }
    }
  };

  const report = auditVerificationMatrix(gtSnapshot, renderSnapshot, templateJson);
  const heightDefect = report.defects.find(d => d.nodeSid === 'sid-img-2' && d.property === 'height');

  assert.ok(heightDefect, 'Height defect must be generated for 20px delta');
  assert.strictEqual(heightDefect.severity, 'MEDIUM', 'Severity must remain MEDIUM when delta <= 24px');
  assert.strictEqual(heightDefect.advisory, false, 'Advisory must be false');
  console.log('  ✓ Moderate Proof: Height delta = 20px retained as severity: MEDIUM, advisory: false');
}

// 5. DERIVED METRICS REMAIN R0 AND ADVISORY: TRUE
console.log('\n▶ [5/5] Testing derived layout metrics (lineCount) remaining R0 & advisory: true...');
{
  const templateJson = {
    title: 'E6 Derived Metrics Test',
    content: [
      {
        id: 'widget-heading-1',
        _sid: 'sid-h1',
        elType: 'widget',
        widgetType: 'heading',
        settings: { title: 'Heading Text' }
      }
    ]
  };

  const gtSnapshot = {
    viewports: {
      desktop: {
        flat: {
          'sid-h1': {
            sid: 'sid-h1',
            tag: 'h1',
            hasDirectText: true,
            lineCount: 1,
            rect: { x: 50, y: 50, w: 300, h: 40 },
            styles: { color: 'rgb(0, 0, 0)', fontSize: '32px' }
          }
        }
      }
    }
  };

  const renderSnapshot = {
    viewports: {
      desktop: {
        flat: {
          'sid-h1': {
            sid: 'sid-h1',
            widgetId: 'widget-heading-1',
            tag: 'h1',
            hasDirectText: true,
            lineCount: 2,
            rect: { x: 50, y: 50, w: 300, h: 40 },
            styles: { color: 'rgb(0, 0, 0)', fontSize: '32px' }
          }
        }
      }
    }
  };

  const report = auditVerificationMatrix(gtSnapshot, renderSnapshot, templateJson);
  const lineDefect = report.defects.find(d => d.nodeSid === 'sid-h1' && d.property === 'lineCount');

  assert.ok(lineDefect, 'lineCount defect must be emitted');
  assert.strictEqual(lineDefect.rung, 'R0', 'lineCount rung must be R0');
  assert.strictEqual(lineDefect.advisory, true, 'lineCount must be marked advisory: true');
  console.log('  ✓ Derived Metric Proof: lineCount remains rung: R0, advisory: true');
}

console.log('\n========================================================================');
console.log('       ALL 5 CHECKS PASSED: E6 SEVERITY RECALIBRATION CERTIFIED');
console.log('========================================================================\n');

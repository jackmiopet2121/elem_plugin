/**
 * Checkpoint C13: Factory Input Contract & Fuzzing Verification (Spec v3.6 T8).
 * Asserts that widget transformer factories normalize all alias shapes, nested wrappers,
 * and edge-case inputs to canonical Elementor Free settings contracts.
 */

const {
  createImageWidget,
  createButtonWidget,
  createIconWidget,
  createHeadingWidget,
  createTextEditorWidget,
  normalizeWidgetInputs
} = require('../src/transformers/widget-transformer');

function testC13() {
  console.log('========================================================================');
  console.log('       CHECKPOINT C13: FACTORY INPUT CONTRACT & FUZZING VERIFICATION');
  console.log('========================================================================');

  let passed = true;
  const errors = [];

  function assert(condition, message) {
    if (!condition) {
      errors.push(message);
      console.error(`  ✗ ${message}`);
      passed = false;
    }
  }

  // --- 1. Image Widget Input Contract Fuzzing ---
  console.log('▶ [1/3] Fuzzing createImageWidget inputs...');
  const imgFuzzCases = [
    { in: { url: 'https://example.com/img1.png' }, expected: 'https://example.com/img1.png', label: 'canonical url' },
    { in: { image: { url: 'https://example.com/img2.png' } }, expected: 'https://example.com/img2.png', label: 'nested image.url' },
    { in: { src: 'https://example.com/img3.png' }, expected: 'https://example.com/img3.png', label: 'src alias' },
    { in: { image: { url: { url: 'https://example.com/img4.png' } } }, expected: 'https://example.com/img4.png', label: 'double-wrapped image.url' },
    { in: {}, expected: '', label: 'empty options' },
    { in: { url: null }, expected: '', label: 'null url' },
    { in: { url: undefined }, expected: '', label: 'undefined url' },
    { in: { url: 12345 }, expected: '12345.jpg', label: 'numeric url (auto fallback extension)' }
  ];

  for (const tc of imgFuzzCases) {
    const w = createImageWidget(tc.in);
    assert(w && w.widgetType === 'image', `createImageWidget (${tc.label}): returned invalid widget structure`);
    assert(w.settings && typeof w.settings.image?.url === 'string', `createImageWidget (${tc.label}): settings.image.url is not a string`);
    assert(w.settings.image.url === tc.expected, `createImageWidget (${tc.label}): expected "${tc.expected}", got "${w.settings?.image?.url}"`);
  }

  // --- 2. Button Widget Input Contract Fuzzing ---
  console.log('▶ [2/3] Fuzzing createButtonWidget inputs...');
  const btnFuzzCases = [
    { in: { link: 'https://example.com/b1' }, expected: 'https://example.com/b1', label: 'string link' },
    { in: { link: { url: 'https://example.com/b2' } }, expected: 'https://example.com/b2', label: 'object link.url' },
    { in: { href: 'https://example.com/b3' }, expected: 'https://example.com/b3', label: 'href alias' },
    { in: { url: 'https://example.com/b4' }, expected: 'https://example.com/b4', label: 'url alias' },
    { in: { link: { url: { url: 'https://example.com/b5' } } }, expected: 'https://example.com/b5', label: 'double-wrapped link.url' },
    { in: {}, expected: '#', label: 'empty options' },
    { in: { link: null }, expected: '#', label: 'null link' },
    { in: { padding: 12 }, expectedPadding: { unit: 'px', top: '12', right: '12', bottom: '12', left: '12', isLinked: true }, label: 'scalar padding expansion' }
  ];

  for (const tc of btnFuzzCases) {
    const w = createButtonWidget(tc.in);
    assert(w && w.widgetType === 'button', `createButtonWidget (${tc.label}): returned invalid widget structure`);
    if (tc.expected !== undefined) {
      assert(w.settings && typeof w.settings.link?.url === 'string', `createButtonWidget (${tc.label}): settings.link.url is not a string`);
      assert(w.settings.link.url === tc.expected, `createButtonWidget (${tc.label}): expected "${tc.expected}", got "${w.settings?.link?.url}"`);
    }
    if (tc.expectedPadding) {
      assert(w.settings && typeof w.settings.button_padding === 'object', `createButtonWidget (${tc.label}): button_padding was not expanded to box object`);
      assert(w.settings.button_padding.top === tc.expectedPadding.top, `createButtonWidget (${tc.label}): padding top mismatch`);
    }
  }

  // --- 3. Icon Widget Input Contract Fuzzing ---
  console.log('▶ [3/3] Fuzzing createIconWidget inputs...');
  const iconFuzzCases = [
    { in: { icon: 'fa fa-check' }, expectedValue: 'fas fa-check', label: 'string icon (translated to fa5)' },
    { in: { selected_icon: { value: 'fas fa-star', library: 'fa-solid' } }, expectedValue: 'fas fa-star', label: 'object selected_icon' },
    { in: { icon: { value: { value: 'fas fa-arrow-right' } } }, expectedValue: 'fas fa-arrow-right', label: 'nested icon value' },
    { in: {}, expectedValue: 'fas fa-arrow-right', label: 'empty options default' }
  ];

  for (const tc of iconFuzzCases) {
    const w = createIconWidget(tc.in);
    assert(w && w.widgetType === 'icon', `createIconWidget (${tc.label}): returned invalid widget structure`);
    assert(w.settings && typeof w.settings.selected_icon?.value === 'string', `createIconWidget (${tc.label}): selected_icon.value is not a string`);
    assert(w.settings.selected_icon.value === tc.expectedValue, `createIconWidget (${tc.label}): expected "${tc.expectedValue}", got "${w.settings?.selected_icon?.value}"`);
  }

  if (passed) {
    console.log('\n[CHECKPOINT C13 PASSED] All factory input fuzzing assertions passed with 100% compliance!');
    process.exit(0);
  } else {
    console.error(`\n[CHECKPOINT C13 FAILED] ${errors.length} fuzzing assertion(s) failed.`);
    process.exit(1);
  }
}

testC13();

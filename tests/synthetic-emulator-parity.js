const assert = require("assert");
const { renderElementorToHtml } = require("../src/emulator/elementor-virtual-renderer");

console.log("[TEST] Running A2 Strict Emulator Parity Suite...");

// Known WordPress Behaviors Parity Matrix
const cases = [
  {
    name: "Case 1: Inner container with content_width: undefined (must render boxed + e-con-inner + width: 100% !important)",
    template: {
      content: [
        {
          id: "root",
          elType: "container",
          settings: { content_width: "boxed" },
          elements: [
            {
              id: "inner-1",
              elType: "container",
              settings: { width: { unit: "%", size: 31 } }, // missing content_width: full!
              elements: []
            }
          ]
        }
      ]
    },
    asserts(html) {
      assert.ok(html.includes("elementor-element-inner-1"), "Must render inner container");
      assert.ok(html.includes("elementor-element-inner-1") && html.includes("e-con-boxed"), "Must treat undefined content_width as e-con-boxed");
      // The inner container must have .e-con-inner inside its wrapper
      const innerMatch = html.match(/class="[^"]*elementor-element-inner-1[^"]*"[\s\S]*?<div class="e-con-inner">/);
      assert.ok(innerMatch, "Must wrap children in .e-con-inner when boxed");
      // Must force 100% width in CSS
      assert.ok((html.includes(".elementor-element-inner-1") || html.includes(".e-sid-inner-1")) && html.includes("width: 100% !important;"), "Must force width: 100% !important for boxed container");
    }
  },
  {
    name: "Case 2: Inner container with content_width: full (must render e-con-full WITHOUT e-con-inner and use measured %)",
    template: {
      content: [
        {
          id: "root",
          elType: "container",
          settings: { content_width: "boxed" },
          elements: [
            {
              id: "inner-2",
              elType: "container",
              settings: { content_width: "full", width: { unit: "%", size: 31 } },
              elements: []
            }
          ]
        }
      ]
    },
    asserts(html) {
      assert.ok(html.includes("elementor-element-inner-2") && html.includes("e-con-full"), "Must render e-con-full");
      const sub = html.substring(html.indexOf("elementor-element-inner-2"));
      const directInner = sub.match(/^[^>]*>\s*<div class="e-con-inner">/);
      assert.strictEqual(directInner, null, "Must NOT have .e-con-inner inside full container");
      assert.ok((html.includes(".elementor-element-inner-2") || html.includes(".e-sid-inner-2")) && html.includes("width: 31%;"), "Must apply measured percentage width for full container");
    }
  },
  {
    name: "Case 3: Full-width container with missing width setting (must default to 100% width)",
    template: {
      content: [
        {
          id: "root",
          elType: "container",
          settings: { content_width: "boxed" },
          elements: [
            {
              id: "inner-3",
              elType: "container",
              settings: { content_width: "full" }, // no width
              elements: []
            }
          ]
        }
      ]
    },
    asserts(html) {
      assert.ok((html.includes(".elementor-element-inner-3") || html.includes(".e-sid-inner-3")) && html.includes("width: 100%;"), "Must default to width: 100% when width is undefined on full container");
    }
  }
];

cases.forEach((tc, idx) => {
  console.log(`  ▶ [${idx + 1}/${cases.length}] ${tc.name}`);
  const html = renderElementorToHtml(tc.template);
  tc.asserts(html);
  console.log("    ✓ PASSED");
});

console.log("ALL A2 EMULATOR PARITY TESTS PASSED!\n");

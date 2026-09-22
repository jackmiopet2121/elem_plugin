const assert = require("assert");
const { normalizeElementorSchema } = require("../src/normalizers/schema-normalizer");
const { auditTemplate } = require("../src/linter/template-linter");
const { auditVerificationMatrix } = require("../src/smart/verification-matrix");

console.log("[TEST] Running A1 Content-Width Contract Suite...");

// 1. Test schema normalizer auto-assignment
const rawTree = [
  {
    id: "root-1",
    elType: "container",
    settings: {},
    elements: [
      {
        id: "child-1",
        elType: "container",
        settings: {},
        elements: [
          {
            id: "grandchild-1",
            elType: "container",
            settings: { content_width: "boxed" },
            elements: []
          }
        ]
      }
    ]
  }
];

normalizeElementorSchema(rawTree);

assert.strictEqual(rawTree[0].settings.content_width, "boxed", "Root container must default to boxed");
assert.strictEqual(rawTree[0].elements[0].settings.content_width, "full", "Inner container must be full");
assert.strictEqual(rawTree[0].elements[0].elements[0].settings.content_width, "full", "Nested inner container must be full");
console.log("  ✓ normalizeElementorSchema guarantees content_width: full on all inner containers");

// 2. Test linter CONTENT_WIDTH_VIOLATION error on invalid template
const invalidTemplate = {
  version: "0.4",
  title: "Invalid",
  type: "page",
  content: [
    {
      id: "root",
      elType: "container",
      settings: { content_width: "boxed", boxed_width: { unit: "px", size: 1200 }, padding_mobile: { unit: "px", top: "10", right: "10", bottom: "10", left: "10" } },
      elements: [
        {
          id: "inner-col",
          elType: "container",
          settings: { /* content_width missing! */ },
          elements: []
        }
      ]
    }
  ]
};

const audit = auditTemplate(invalidTemplate);
const hasCwError = audit.errors.some(e => e.includes("CONTENT_WIDTH_VIOLATION"));
assert.strictEqual(hasCwError, true, "Linter must raise CONTENT_WIDTH_VIOLATION for missing content_width on inner container");
console.log("  ✓ template-linter catches CONTENT_WIDTH_VIOLATION");

// 3. Test verification-matrix CRITICAL defect
const matrixResult = auditVerificationMatrix(
  { viewports: { desktop: { flat: {} } } },
  { viewports: { desktop: { flat: {} } } },
  invalidTemplate,
  { viewports: ["desktop"] }
);

const cwCritical = matrixResult.defects.find(d => d.property === "content_width" && d.severity === "CRITICAL");
assert.ok(cwCritical, "Verification matrix must flag CONTENT_WIDTH_VIOLATION as CRITICAL");
console.log("  ✓ verification-matrix flags missing content_width as CRITICAL defect");

console.log("ALL A1 CONTRACT TESTS PASSED!\n");

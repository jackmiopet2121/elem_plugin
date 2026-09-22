/**
 * SYNTHETIC TEST: E3 HELD-OUT VALIDATION (P4 Universality Proof)
 */
const fs = require("fs");
const path = require("path");
const assert = require("assert");

console.log("========================================================================");
console.log("       SYNTHETIC TEST: E3 HELD-OUT VALIDATION (P4 UNIVERSALITY)");
console.log("========================================================================\n");

const dir = path.join(__dirname, "fixtures");

console.log("▶ [1/3] Verifying Held-Out Fixture 1: 07-saas-pricing...");
const a1 = JSON.parse(fs.readFileSync(path.join(dir, "07-saas-pricing", "output.audit.json"), "utf8"));
assert.ok(a1.fidelity >= 95, "Fidelity >= 95");
assert.strictEqual(a1.counts.critical, 0, "Critical === 0");
assert.strictEqual(a1.counts.high, 0, "High === 0");
assert.strictEqual(a1.cleanPass, true, "cleanPass === true");
assert.ok(a1.editability.nativeWidgetPercentage >= 90, "Native >= 90%");
console.log("  ✓ 07-saas-pricing: fidelity=" + a1.fidelity + "/100, high=" + a1.counts.high + ", critical=" + a1.counts.critical + ", cleanPass=" + a1.cleanPass + ", native=" + a1.editability.nativeWidgetPercentage + "%");

console.log("\n▶ [2/3] Verifying Held-Out Fixture 2: 08-ecommerce-hero...");
const a2 = JSON.parse(fs.readFileSync(path.join(dir, "08-ecommerce-hero", "output.audit.json"), "utf8"));
assert.ok(a2.fidelity >= 95, "Fidelity >= 95");
assert.strictEqual(a2.counts.critical, 0, "Critical === 0");
assert.strictEqual(a2.counts.high, 0, "High === 0");
assert.strictEqual(a2.cleanPass, true, "cleanPass === true");
assert.ok(a2.editability.nativeWidgetPercentage >= 90, "Native >= 90%");
console.log("  ✓ 08-ecommerce-hero: fidelity=" + a2.fidelity + "/100, high=" + a2.counts.high + ", critical=" + a2.counts.critical + ", cleanPass=" + a2.cleanPass + ", native=" + a2.editability.nativeWidgetPercentage + "%");

console.log("\n▶ [3/3] Checking Zero Fixture Hardcoding in src/ (P4 Universality)...");
const srcDir = path.join(__dirname, "..", "src");
const forbidden = ["07-saas-pricing", "08-ecommerce-hero", "saas-pricing", "ecommerce-hero", "lumina audio", "lumina pro", "lumina one", "lumina air"];
function walk(d) {
  let res = [];
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) res = res.concat(walk(p));
    else if (p.endsWith(".js")) res.push(p);
  }
  return res;
}
const files = walk(srcDir);
let violations = 0;
for (const file of files) {
  const code = fs.readFileSync(file, "utf8").toLowerCase();
  for (const pat of forbidden) {
    if (code.includes(pat)) {
      console.error("  ✖ VIOLATION: Hardcoded pattern \x22" + pat + "\x22 in " + path.relative(srcDir, file));
      violations++;
    }
  }
}
assert.strictEqual(violations, 0, "Zero hardcoded fixture patterns in src/");
console.log("  ✓ Scanned " + files.length + " source files: ZERO hardcoded fixture identifiers detected.");

console.log("\n[CHECKPOINT PASSED] Task E3 Held-Out Validation fully verified!");
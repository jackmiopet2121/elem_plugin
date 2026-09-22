/**
 * Checkpoint C9: Gap Scalar Verification Test (Spec v3.2).
 * Asserts on corpus outputs and root templates:
 * 1. space_between_widgets (and responsive variants) is a plain Number (or undefined), NEVER an Object.
 * 2. gap.size, gap.column, gap.row (and responsive variants) are NEVER Objects.
 * 
 * Prevents WordPress PHP 8 Fatal: "Object of class stdClass could not be converted to string".
 */

const fs = require("fs");
const path = require("path");

const CORPUS_DIR = path.join(__dirname, "corpus");
const ROOT_LANDING = path.resolve(__dirname, "../../landing_v3.json");

function testC9() {
  console.log("========================================================================");
  console.log("       CHECKPOINT C9: GAP SCALAR & PHP FATAL PREVENTION TEST");
  console.log("========================================================================");

  const targets = [];

  if (fs.existsSync(CORPUS_DIR)) {
    const cases = fs.readdirSync(CORPUS_DIR).filter(d => {
      const p = path.join(CORPUS_DIR, d);
      return fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, "output.json"));
    });
    for (const c of cases) {
      targets.push({ name: `corpus/${c}`, path: path.join(CORPUS_DIR, c, "output.json") });
    }
  }

  if (fs.existsSync(ROOT_LANDING)) {
    targets.push({ name: "landing_v3.json", path: ROOT_LANDING });
  }

  if (targets.length === 0) {
    console.log("No templates found to audit. Run npm run test:corpus first.");
    process.exit(0);
  }

  let allPassed = true;

  for (const target of targets) {
    const template = JSON.parse(fs.readFileSync(target.path, "utf8"));
    const errors = [];
    let containerCount = 0;

    function inspect(node) {
      if (!node || typeof node !== "object") return;
      if (node.elType === "container") {
        containerCount++;
        const s = node.settings || {};

        // 1. space_between_widgets checks
        for (const k of ["space_between_widgets", "space_between_widgets_tablet", "space_between_widgets_mobile"]) {
          if (s[k] !== undefined) {
            if (typeof s[k] !== "number" || !Number.isFinite(s[k])) {
              errors.push(`Container ${node.id}: ${k} is ${typeof s[k]} (${JSON.stringify(s[k])}). Must be a number.`);
            }
          }
        }

        // 2. gap object checks
        for (const k of ["gap", "flex_gap", "gap_tablet", "flex_gap_tablet", "gap_mobile", "flex_gap_mobile"]) {
          if (s[k] && typeof s[k] === "object") {
            for (const sub of ["size", "column", "row"]) {
              if (s[k][sub] !== undefined && typeof s[k][sub] === "object") {
                errors.push(`Container ${node.id}: ${k}.${sub} is nested object (${JSON.stringify(s[k][sub])}).`);
              }
            }
          }
        }
      }

      if (Array.isArray(node.elements)) {
        for (const el of node.elements) inspect(el);
      }
    }

    inspect({ elements: template.content || [] });

    console.log(`▶ Target [${target.name}]: audited ${containerCount} containers.`);
    if (errors.length > 0) {
      allPassed = false;
      console.error(`    ✖ FAIL: ${errors.length} gap nesting violations found:`);
      for (const err of errors.slice(0, 10)) {
        console.error(`       • ${err}`);
      }
      if (errors.length > 10) {
        console.error(`       ... and ${errors.length - 10} more.`);
      }
    } else {
      console.log(`    ✓ PASS: All containers have scalar gaps (0 PHP fatal risks).`);
    }
  }

  console.log("========================================================================");
  if (allPassed) {
    console.log("✓ [CHECKPOINT C9 PASSED] Zero nested gap objects found! 100% PHP 8 safe.");
    process.exit(0);
  } else {
    console.error("✖ [CHECKPOINT C9 FAILED] Nested gap objects detected.");
    process.exit(1);
  }
}

try {
  testC9();
} catch (err) {
  console.error("Fatal C9 error:", err);
  process.exit(1);
}

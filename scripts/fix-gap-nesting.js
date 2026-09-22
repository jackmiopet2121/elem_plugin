const fs = require("fs");
const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/fix-gap-nesting.js <file.json>");
  process.exit(1);
}
const json = JSON.parse(fs.readFileSync(file, "utf8"));
const unwrap = (v) => {
  let x = v, g = 0;
  while (x && typeof x === "object" && g++ < 5) x = (x.size ?? x.column ?? x.row ?? 0);
  const n = Number(parseFloat(x));
  return Number.isFinite(n) ? n : 0;
};
let fixed = 0;
(function walk(el) {
  if (!el) return;
  const s = el.settings || {};
  for (const k of ["space_between_widgets", "space_between_widgets_tablet", "space_between_widgets_mobile"]) {
    if (s[k] !== undefined && typeof s[k] !== "number") {
      s[k] = unwrap(s[k]);
      fixed++;
    }
  }
  for (const k of ["gap", "flex_gap", "gap_tablet", "flex_gap_tablet", "gap_mobile", "flex_gap_mobile"]) {
    const g = s[k];
    if (g && typeof g === "object") {
      for (const side of ["size", "column", "row"]) {
        if (g[side] !== undefined && typeof g[side] !== "number") {
          g[side] = unwrap(g[side]);
          fixed++;
        }
      }
    }
  }
  (el.elements || []).forEach(walk);
})({ elements: json.content || [] });
fs.writeFileSync(file, JSON.stringify(json, null, 2));
console.log(`Fixed ${fixed} nested gap value(s) in ${file}`);

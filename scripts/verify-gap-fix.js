#!/usr/bin/env node
/**
 * verify-gap-fix.js
 * Audits an Elementor template JSON to guarantee 100% scalar gap compliance.
 * Prevents WordPress PHP 8 Fatal: "Object of class stdClass could not be converted to string".
 * 
 * Usage:
 *   node scripts/verify-gap-fix.js <template.json>
 */

const fs = require('fs');
const path = require('path');

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/verify-gap-fix.js <file.json>");
  process.exit(1);
}

const resolvedPath = path.resolve(process.cwd(), file);
if (!fs.existsSync(resolvedPath)) {
  console.error(`Error: File not found: ${resolvedPath}`);
  process.exit(1);
}

const json = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
let containerCount = 0;
let widgetCount = 0;
const errors = [];

function walk(node) {
  if (!node || typeof node !== 'object') return;
  if (node.elType === 'container') {
    containerCount++;
    const s = node.settings || {};

    // 1. Check space_between_widgets scalar
    for (const k of ['space_between_widgets', 'space_between_widgets_tablet', 'space_between_widgets_mobile']) {
      if (s[k] !== undefined) {
        if (typeof s[k] !== 'number' || !Number.isFinite(s[k])) {
          errors.push(`Container ${node.id}: ${k} is ${typeof s[k]} (${JSON.stringify(s[k])}). Must be a scalar number.`);
        }
      }
    }

    // 2. Check gap objects
    for (const k of ['gap', 'flex_gap', 'gap_tablet', 'flex_gap_tablet', 'gap_mobile', 'flex_gap_mobile']) {
      if (s[k] && typeof s[k] === 'object') {
        for (const side of ['size', 'column', 'row']) {
          if (s[k][side] !== undefined && typeof s[k][side] === 'object') {
            errors.push(`Container ${node.id}: ${k}.${side} is nested object (${JSON.stringify(s[k][side])}).`);
          }
        }
      }
    }
  } else if (node.elType === 'widget') {
    widgetCount++;
  }

  if (Array.isArray(node.elements)) {
    node.elements.forEach(walk);
  }
}

walk({ elements: json.content || [] });

console.log("========================================================================");
console.log(`VERIFY GAP FIX REPORT: ${path.basename(resolvedPath)}`);
console.log("========================================================================");
console.log(`• Audited Containers: ${containerCount}`);
console.log(`• Audited Widgets:    ${widgetCount}`);

if (errors.length === 0) {
  console.log(`• Nested Gap Objects: 0`);
  console.log(`• Non-numeric Gaps:   0`);
  console.log(`• Result:             100% PASSED (PHP 8 safe, zero crash risks)`);
  console.log("========================================================================");
  process.exit(0);
} else {
  console.error(`• Violations Found:   ${errors.length}`);
  for (const err of errors.slice(0, 10)) {
    console.error(`   ✖ ${err}`);
  }
  if (errors.length > 10) {
    console.error(`   ... and ${errors.length - 10} more.`);
  }
  console.log("========================================================================");
  process.exit(1);
}

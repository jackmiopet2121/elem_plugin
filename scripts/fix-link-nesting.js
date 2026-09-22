#!/usr/bin/env node
/**
 * One-off repair script for nested link / scalar objects in legacy templates (Spec v3.4 T8).
 * Usage: node scripts/fix-link-nesting.js <file.json>
 */
const fs = require('fs');
const path = require('path');

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/fix-link-nesting.js <file.json>');
  process.exit(1);
}

const resolvedPath = path.resolve(process.cwd(), file);
if (!fs.existsSync(resolvedPath)) {
  console.error(`Error: File not found: ${resolvedPath}`);
  process.exit(1);
}

const json = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));

const unwrap = (v) => {
  let x = v, g = 0;
  while (x && typeof x === 'object' && g++ < 5) {
    x = (x.url ?? x.link ?? x.size ?? x.value ?? '');
  }
  return typeof x === 'string' ? x : String(x || '#');
};

let fixed = 0;

(function walk(el) {
  if (!el || typeof el !== 'object') return;
  const s = el.settings || {};

  // Universal link unwrapping (buttons, images, icons, etc.)
  if (s.link !== undefined) {
    if (typeof s.link === 'string') {
      s.link = { url: s.link, is_external: false, nofollow: false };
      fixed++;
    } else if (s.link && typeof s.link === 'object') {
      if (typeof s.link.url !== 'string') {
        s.link.url = unwrap(s.link.url);
        fixed++;
      }
      s.link.is_external = Boolean(s.link.is_external);
      s.link.nofollow = Boolean(s.link.nofollow);
    }
  }

  // Image media URL check
  if (s.image && typeof s.image === 'object') {
    if (s.image.url !== undefined && typeof s.image.url !== 'string') {
      s.image.url = unwrap(s.image.url);
      fixed++;
    }
  }

  // Icon value check
  if (s.selected_icon && typeof s.selected_icon === 'object') {
    if (s.selected_icon.value !== undefined && typeof s.selected_icon.value !== 'string') {
      s.selected_icon.value = unwrap(s.selected_icon.value);
      fixed++;
    }
  }

  (el.elements || []).forEach(walk);
})({ elements: json.content || [] });

fs.writeFileSync(resolvedPath, JSON.stringify(json, null, 2));
console.log(`Fixed ${fixed} nested scalar value(s) in ${resolvedPath}`);

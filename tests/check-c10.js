/**
 * Checkpoint C10: Link & Media URL Contract Verification (Spec v3.4 T7).
 * Asserts on all corpus templates (and optional CLI arg file):
 * 1. button.settings.link.url is ALWAYS a string
 * 2. image.settings.image.url is ALWAYS a string
 * 3. icon.settings.selected_icon.value is ALWAYS a string
 */

const fs = require('fs');
const path = require('path');

const CORPUS_DIR = path.join(__dirname, 'corpus');
const ROOT_LANDING = path.resolve(__dirname, '../../landing_v3.json');

const cliFile = process.argv[2] ? path.resolve(process.cwd(), process.argv[2]) : null;

function testC10() {
  console.log('========================================================================');
  console.log('       CHECKPOINT C10: LINK & MEDIA URL CONTRACT VERIFICATION');
  console.log('========================================================================');

  const targets = [];

  if (cliFile) {
    if (fs.existsSync(cliFile)) {
      targets.push({ name: path.basename(cliFile), path: cliFile });
    } else {
      console.error(`Error: CLI target file not found: ${cliFile}`);
      process.exit(1);
    }
  } else {
    if (fs.existsSync(CORPUS_DIR)) {
      const cases = fs.readdirSync(CORPUS_DIR).filter(d => {
        const p = path.join(CORPUS_DIR, d);
        return fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'output.json'));
      });
      for (const c of cases) {
        targets.push({ name: `corpus/${c}`, path: path.join(CORPUS_DIR, c, 'output.json') });
      }
    }

    if (fs.existsSync(ROOT_LANDING)) {
      targets.push({ name: 'landing_v3.json', path: ROOT_LANDING });
    }
  }

  if (targets.length === 0) {
    console.log('No templates found to audit. Run npm run test:corpus first.');
    process.exit(0);
  }

  let allPassed = true;

  for (const target of targets) {
    const template = JSON.parse(fs.readFileSync(target.path, 'utf8'));
    const errors = [];
    let widgetCount = 0;

    function walk(node) {
      if (!node || typeof node !== 'object') return;
      const s = node.settings || {};

      if (node.elType === 'widget') {
        widgetCount++;

        // 1. Link check (button and any widget with settings.link)
        if (s.link !== undefined) {
          if (typeof s.link !== 'object' || typeof s.link.url !== 'string') {
            errors.push(`Widget ${node.id} (${node.widgetType}): link.url is not a string (type: ${typeof s.link?.url})`);
          }
        }

        // 2. Image check
        if (node.widgetType === 'image' && s.image && typeof s.image === 'object') {
          if (s.image.url !== undefined && typeof s.image.url !== 'string') {
            errors.push(`Image widget ${node.id}: image.url is not a string (type: ${typeof s.image.url})`);
          }
        }

        // 3. Icon check
        if (node.widgetType === 'icon' && s.selected_icon && typeof s.selected_icon === 'object') {
          if (s.selected_icon.value !== undefined && typeof s.selected_icon.value !== 'string') {
            errors.push(`Icon widget ${node.id}: selected_icon.value is not a string (type: ${typeof s.selected_icon.value})`);
          }
        }
      }

      if (Array.isArray(node.elements)) {
        node.elements.forEach(walk);
      }
    }

    const content = template.content || (Array.isArray(template) ? template : []);
    content.forEach(walk);

    console.log(`▶ Target [${target.name}]: audited ${widgetCount} widgets.`);
    if (errors.length > 0) {
      allPassed = false;
      console.error(`    ✖ FAIL: ${errors.length} URL contract violations found:`);
      for (const err of errors.slice(0, 10)) {
        console.error(`       • ${err}`);
      }
      if (errors.length > 10) {
        console.error(`       ... and ${errors.length - 10} more.`);
      }
    } else {
      console.log(`    ✓ PASS: All links and media URLs are pure strings.`);
    }
  }

  console.log('========================================================================');
  if (allPassed) {
    console.log('✓ [CHECKPOINT C10 PASSED] All links and media URLs 100% compliant!');
    process.exit(0);
  } else {
    console.error('✖ [CHECKPOINT C10 FAILED] Non-string URLs detected.');
    process.exit(1);
  }
}

try {
  testC10();
} catch (err) {
  console.error('Fatal C10 error:', err);
  process.exit(1);
}

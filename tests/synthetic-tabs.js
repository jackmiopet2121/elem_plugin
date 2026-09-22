/**
 * SYNTHETIC TEST: 07-SYNTHETIC-TABS (Z3, Z4, M1, Z7, Z8, Z9)
 * Universality Proof for Interactive Component Delegation & Strict Parity Replay
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { probeOriginalBehavior } = require('../src/smart/behavior-probe');
const { compileHtmlToElementor } = require('../src/engine');
const { renderElementorToHtml } = require('../src/emulator/elementor-virtual-renderer');
const { verifyReplayBehavior } = require('../src/smart/replay-verifier');

console.log('========================================================================');
console.log('       SYNTHETIC TEST: 07-SYNTHETIC-TABS (Z3, Z4, M1, Z7, Z8, Z9)');
console.log('========================================================================\n');

(async () => {
  try {
    // 1. M1 Audit: Assert ZERO occurrences of "accordion" or "tab-btn" in src/
    console.log('1. Auditing M1 Contract (Zero fixture literals in src/)...');
    const srcDir = path.join(__dirname, '..', 'src');
    
    function getAllFiles(dir, fileList = []) {
      const files = fs.readdirSync(dir);
      files.forEach(file => {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
          getAllFiles(filePath, fileList);
        } else if (file.endsWith('.js') || file.endsWith('.json')) {
          fileList.push(filePath);
        }
      });
      return fileList;
    }

    const allSrcFiles = getAllFiles(srcDir);
    const forbiddenRegex = /\b(?:accordion|tab-btn)\b/i;
    const violations = [];

    for (const file of allSrcFiles) {
      const fileContent = fs.readFileSync(file, 'utf8');
      const lines = fileContent.split('\n');
      lines.forEach((line, idx) => {
        if (forbiddenRegex.test(line)) {
          violations.push({ file: path.relative(srcDir, file), line: idx + 1, content: line.trim() });
        }
      });
    }

    assert.strictEqual(
      violations.length,
      0,
      `M1 Violation: Found ${violations.length} occurrence(s) of "accordion" or "tab-btn" in src/:\n` +
      violations.map(v => `  at ${v.file}:${v.line} -> ${v.content}`).join('\n')
    );
    console.log(`   ✓ M1 PASSED: 0 matches for "accordion" or "tab-btn" across ${allSrcFiles.length} files in src/!\n`);

    // 2. Define Synthetic Tabbed Component HTML (07-synthetic-tabs)
    console.log('2. Defining synthetic tabbed component fixture (07-synthetic-tabs)...');
    const syntheticTabsHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Synthetic Tabs Fixture</title>
  <style>
    .tabs-card {
      max-width: 800px;
      margin: 40px auto;
      padding: 24px;
      border-radius: 12px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      font-family: sans-serif;
    }
    .tabs-nav {
      display: flex;
      gap: 12px;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 12px;
    }
    .tab-btn {
      padding: 8px 16px;
      border-radius: 6px;
      border: none;
      background: #f1f5f9;
      color: #475569;
      cursor: pointer;
      font-weight: 600;
      font-size: 14px;
      transition: all 0.2s;
    }
    .tab-btn.is-active {
      background: #3b82f6;
      color: #ffffff;
    }
    .tabs-content {
      padding-top: 20px;
    }
    .tab-panel {
      display: none;
      font-size: 16px;
      color: #1e293b;
      line-height: 1.5;
    }
    .tab-panel.is-active {
      display: block;
    }
  </style>
</head>
<body>
  <div class="tabs-card">
    <div class="tabs-nav">
      <button class="tab-btn is-active" data-tab="tab-alpha">Overview Tab</button>
      <button class="tab-btn" data-tab="tab-beta">Features Tab</button>
      <button class="tab-btn" data-tab="tab-gamma">Specs Tab</button>
    </div>
    <div class="tabs-content">
      <div id="tab-alpha" class="tab-panel is-active">
        <p>Alpha Overview content displayed here by default.</p>
      </div>
      <div id="tab-beta" class="tab-panel">
        <p>Beta Features content dynamically switched upon click.</p>
      </div>
      <div id="tab-gamma" class="tab-panel">
        <p>Gamma Specs content loaded in third panel.</p>
      </div>
    </div>
  </div>

  <script>
    document.addEventListener('DOMContentLoaded', () => {
      const buttons = document.querySelectorAll('.tab-btn');
      const panels = document.querySelectorAll('.tab-panel');

      buttons.forEach(btn => {
        btn.addEventListener('click', function() {
          const targetId = this.getAttribute('data-tab');
          buttons.forEach(b => b.classList.remove('is-active'));
          panels.forEach(p => {
            p.classList.remove('is-active');
            p.style.display = 'none';
          });

          this.classList.add('is-active');
          const targetPanel = document.getElementById(targetId);
          if (targetPanel) {
            targetPanel.classList.add('is-active');
            targetPanel.style.display = 'block';
          }
        });
      });
    });
  </script>
</body>
</html>`;

    // 3. Probing dynamic behaviors (Z3 Trace Schema)
    console.log('3. Probing interactive state transitions via behavior probe (Z3)...');
    const probeResult = await probeOriginalBehavior(syntheticTabsHtml);
    const traces = probeResult.traces || probeResult.interactions || [];

    console.log(`   ✓ Probed ${traces.length} trace(s):`);
    traces.forEach((t, idx) => {
      console.log(`     [Trace ${idx + 1}] trigger: "${t.trigger}", ancestor: "${t.ancestor}", mutations: [${t.mutations.join(', ')}], initialState: ${JSON.stringify(t.initialState)}`);
      assert.ok(t.trigger, `Trace ${idx + 1} must declare trigger`);
      assert.ok(t.ancestor, `Trace ${idx + 1} must declare ancestor`);
      assert.ok(Array.isArray(t.mutations) && t.mutations.length > 0, `Trace ${idx + 1} must declare mutations array`);
      assert.ok(typeof t.initialState === 'object', `Trace ${idx + 1} must declare initialState object`);
    });

    // 4. Compile via Universal Smart Compiler
    console.log('\n4. Compiling synthetic tabs to Elementor Free JSON...');
    const compileResult = await compileHtmlToElementor(syntheticTabsHtml, { inspect: false });
    assert.ok(compileResult.templateJson, 'Must return compiled templateJson');
    console.log(`   ✓ Compiled successfully into ${compileResult.templateJson.content.length} root container(s).`);

    // 5. Render strict Elementor emulator HTML
    console.log('5. Rendering template via Strict Elementor Virtual Renderer (A2/Strict Parity)...');
    const previewHtml = renderElementorToHtml(compileResult.templateJson);
    console.log(`   ✓ Rendered strict HTML preview (${Math.round(previewHtml.length / 1024)} KB).`);

    // 6. Assert Script Preservation & Idempotency Bridge (Z8 & Z9)
    console.log('6. Verifying Script Preservation Contract & Idempotency Guard (Z8, Z9)...');
    assert.ok(previewHtml.includes('__delegatedBridgesBound'), 'Preview MUST include __delegatedBridgesBound idempotency guard');
    assert.ok(previewHtml.includes('__appLogicInitialized'), 'Preview MUST include __appLogicInitialized idempotency guard');
    console.log('   ✓ Z8 & Z9 PASSED: Script preservation & idempotency bridges confirmed present.');

    // 7. Strict-Replay Parity Assertion (Z7)
    console.log('\n7. Replaying interaction traces on Strict Emulator preview (Z7)...');
    const replayResult = await verifyReplayBehavior(previewHtml, traces);
    console.log(`   • Total Interactions Tested: ${replayResult.totalTested}`);
    console.log(`   • Passed:                   ${replayResult.passed}`);
    console.log(`   • Failed:                   ${replayResult.failed}`);
    console.log(`   • Dynamic Parity:           ${replayResult.parity}%`);

    assert.strictEqual(replayResult.failed, 0, `All dynamic transitions must pass (failed: ${replayResult.failed})`);
    assert.strictEqual(replayResult.parity, 100, `Dynamic parity must be 100% (got: ${replayResult.parity}%)`);
    console.log('   ✓ Z7 PASSED: 100% strict-replay parity on tab triggers verified!');

    console.log('\n========================================================================');
    console.log('   ✓ [SYNTHETIC TABS SUITE PASSED] All Block 2 Contracts Verified!');
    console.log('========================================================================\n');
    process.exit(0);

  } catch (err) {
    console.error('\n✖ FAIL: Synthetic Tabs Suite error:', err);
    process.exit(1);
  }
})();

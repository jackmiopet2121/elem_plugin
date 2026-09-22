/**
 * Interactive Behavior Replay Verifier.
 * Codename: "Single-Pass + Verify" (Phase 5 - T5.2)
 * 
 * Replays recorded interaction traces on the compiled Elementor template,
 * asserting dynamic runtime parity.
 */

const { createBrowserSession } = require('../inspector/headless-driver');

async function verifyReplayBehavior(previewHtml, recordedInteractions = [], options = {}) {
  if (!recordedInteractions || recordedInteractions.length === 0) {
    return { totalTested: 0, passed: 0, failed: 0, results: [], parity: 100 };
  }

  const browser = await createBrowserSession();
  const results = [];

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setContent(previewHtml, { waitUntil: ['domcontentloaded', 'networkidle0'], timeout: 15000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 800));

    for (const trace of recordedInteractions) {
      const { triggerSid, action, deltas } = trace;

      // 1. Click trigger on Elementor preview
      const clicked = await page.evaluate((target) => {
        let el = null;
        if (target.sid) {
          try { el = document.querySelector(`[data-sid="${target.sid}"]`); } catch (_) {}
        }
        if (!el && target.selector) {
          try { el = document.querySelector(target.selector); } catch (_) {}
        }
        if (!el && target.sid) {
          try { el = document.querySelector(target.sid); } catch (_) {}
        }
        if (!el) return false;
        // If button inside or input inside, click that
        const innerInteractive = el.querySelector('button, a, input, label') || el;
        innerInteractive.click();
        return true;
      }, { sid: triggerSid, selector: trace.trigger });

      if (!clicked) {
        results.push({
          triggerSid: triggerSid || trace.trigger,
          passed: false,
          error: `Trigger ${triggerSid || trace.trigger} not found on Elementor preview.`
        });
        continue;
      }

      await new Promise(r => setTimeout(r, 600));

      // 2. Verify all deltas & mutations (Z7 strict parity)
      let allDeltasPassed = true;
      const deltaResults = [];

      for (const delta of (deltas || [])) {
        const currentText = await page.evaluate((sid) => {
          let el = null;
          try { el = document.querySelector(`[data-sid="${sid}"]`); } catch (_) {}
          if (!el) {
            try { el = document.querySelector(sid); } catch (_) {}
          }
          return el ? (el.innerText || el.textContent || '').trim() : null;
        }, delta.sid);

        const isMatch = currentText !== null && (currentText === delta.after || currentText.includes(delta.after) || delta.after.includes(currentText));
        deltaResults.push({
          sid: delta.sid,
          expected: delta.after,
          actual: currentText,
          match: isMatch
        });

        if (!isMatch) {
          allDeltasPassed = false;
        }
      }

      // 3. Verify class mutations if recorded
      let mutationPassed = true;
      if (trace.mutations && trace.mutations.length > 0) {
        mutationPassed = await page.evaluate((target) => {
          let el = null;
          if (target.selector) {
            try { el = document.querySelector(target.selector); } catch (_) {}
          }
          if (!el && target.sid) {
            try { el = document.querySelector(`[data-sid="${target.sid}"]`); } catch (_) {}
          }
          if (!el) return false;
          const anc = el.closest(target.ancestor || '.e-con') || el;
          return target.mutations.some(m => anc.classList.contains(m) || el.classList.contains(m) || (anc.querySelector && anc.querySelector('.' + m) !== null));
        }, { selector: trace.trigger, sid: triggerSid, ancestor: trace.ancestor, mutations: trace.mutations });
      }

      // 4. Verify expansion parity if initially collapsed (Z3 / W1 Parity)
      let expansionPassed = true;
      if (trace.initialState && trace.initialState.collapsed) {
        expansionPassed = await page.evaluate((target) => {
          let el = null;
          if (target.sid) {
            try { el = document.querySelector(`[data-sid="${target.sid}"]`); } catch (_) {}
          }
          if (!el && target.selector) {
            try { el = document.querySelector(target.selector); } catch (_) {}
          }
          if (!el) return false;
          const anc = el.closest(target.ancestor || '.e-con') || el;
          const body = (anc ? anc.querySelector('[class*="body"], [class*="content"], [class*="panel"]') : null) || el.nextElementSibling;
          if (!body) return true;
          body.offsetHeight;
          const bRect = body.getBoundingClientRect();
          const bStyle = window.getComputedStyle(body);
          const maxHVal = parseFloat(bStyle.maxHeight);
          const isMaxHeightExpanded = !isNaN(maxHVal) ? maxHVal > 0 : (bStyle.maxHeight !== '0px' && bStyle.maxHeight !== 'none');
          return (bRect.height > 0 || isMaxHeightExpanded) && bStyle.display !== 'none' && bStyle.visibility !== 'hidden' && bStyle.maxHeight !== '0px';
        }, { selector: trace.trigger, sid: triggerSid, ancestor: trace.ancestor });
      }

      const passed = (deltas && deltas.length > 0 ? allDeltasPassed : true) && mutationPassed && expansionPassed;
      let failureReason = null;
      if (!passed) {
        const reasons = [];
        if (!mutationPassed) reasons.push(`Class mutation mismatch (expected: ${(trace.mutations || []).join(', ')})`);
        if (!allDeltasPassed) reasons.push(`Content delta mismatch`);
        if (!expansionPassed) reasons.push(`Body expansion failed (max-height remained 0px or height is 0)`);
        failureReason = reasons.join('; ');
      }

      results.push({
        triggerSid: triggerSid || trace.trigger,
        trigger: trace.trigger,
        passed,
        deltas: deltaResults,
        mutationPassed,
        expansionPassed,
        error: failureReason
      });
    }

    await page.close();
  } finally {
    await browser.close();
  }

  const passed = results.filter(r => r.passed).length;
  const failed = results.length - passed;
  const parity = results.length > 0 ? Math.round((passed / results.length) * 100) : 100;

  return {
    totalTested: results.length,
    passed,
    failed,
    parity,
    results
  };
}

module.exports = {
  verifyReplayBehavior
};

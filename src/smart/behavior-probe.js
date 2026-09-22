/**
 * Interactive Behavior Probe.
 * Codename: "Single-Pass + Verify" (Phase 5 - T5.1)
 * 
 * Detects and records interactive state transitions (toggles, tabs, sliders)
 * on the original HTML page.
 */

const { createBrowserSession } = require('../inspector/headless-driver');

async function probeOriginalBehavior(rawHtml, options = {}) {
  const browser = await createBrowserSession();
  const interactions = [];

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setContent(rawHtml, { waitUntil: ['domcontentloaded', 'networkidle0'], timeout: 15000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 400));

    // Ensure persistent data-sid attributes matching ground-truth preorder traversal
    await page.evaluate(() => {
      let sidCounter = 0;
      function walk(el) {
        if (el.nodeType !== Node.ELEMENT_NODE) return;
        const tag = el.tagName.toLowerCase();
        if (['script', 'style', 'noscript', 'template'].includes(tag)) return;
        if (!el.getAttribute('data-sid')) {
          el.setAttribute('data-sid', `sid-${++sidCounter}`);
        }
        for (const child of el.children) {
          walk(child);
        }
      }
      if (document.body) walk(document.body);
    });

    // Identify interactive triggers with data-sid or robust DOM selectors
    const triggers = await page.evaluate(() => {
      const candidates = [];
      const els = document.querySelectorAll('button, [role="button"], [role="tab"], [role="switch"], input, label, a[href^="#"], [data-toggle], [data-tab], [aria-expanded], .trigger, [class*="trigger"], [class*="switch"], [class*="toggle"]');
      for (const el of els) {
        const sid = el.getAttribute('data-sid') || el.closest('[data-sid]')?.getAttribute('data-sid');
        
        // Derive robust selector dynamically from DOM data without hardcoded literals
        let selector = '';
        if (el.id) {
          selector = '#' + el.id;
        } else if (el.hasAttribute('data-tab')) {
          selector = `[data-tab="${el.getAttribute('data-tab')}"]`;
        } else if (el.hasAttribute('data-toggle')) {
          selector = `[data-toggle="${el.getAttribute('data-toggle')}"]`;
        } else if (el.className && typeof el.className === 'string' && el.className.trim()) {
          const firstCls = el.className.trim().split(/\s+/)[0];
          selector = '.' + firstCls;
        } else if (sid) {
          selector = `[data-sid="${sid}"]`;
        } else {
          selector = el.tagName.toLowerCase();
        }

        if (!candidates.some(c => c.selector === selector || (sid && c.sid === sid))) {
          candidates.push({
            sid: sid || null,
            selector,
            tag: el.tagName.toLowerCase(),
            id: el.id || null,
            className: typeof el.className === 'string' ? el.className : ''
          });
        }
      }
      return candidates;
    });

    // Test top triggers (bound to 8 to keep probe fast while thorough)
    for (const trig of triggers.slice(0, 8)) {
      // 1. Snapshot comprehensive pre-interaction state
      const preState = await page.evaluate((selector) => {
        const targetEl = document.querySelector(selector);
        const state = {
          texts: {},
          classes: {},
          heights: {},
          displays: {},
          targetAncestorSelector: null,
          isInitiallyCollapsed: false,
          isInitiallyActive: false
        };

        if (targetEl) {
          const anc = targetEl.closest('.e-con, [class*="card"], [class*="item"], [class*="container"], [class*="panel"], [class*="tab"], section, div');
          if (anc) {
            if (anc.id) {
              state.targetAncestorSelector = '#' + anc.id;
            } else if (anc.className && typeof anc.className === 'string' && anc.className.trim()) {
              state.targetAncestorSelector = '.' + anc.className.trim().split(/\s+/)[0];
            } else {
              state.targetAncestorSelector = anc.tagName.toLowerCase();
            }
          }

          state.isInitiallyActive = targetEl.classList.contains('active') || targetEl.classList.contains('is-active') || targetEl.getAttribute('aria-expanded') === 'true';

          // Check if associated content/body is collapsed
          const body = (anc ? anc.querySelector('[class*="body"], [class*="content"], [class*="panel"]') : null) || targetEl.nextElementSibling;
          if (body) {
            const bStyle = window.getComputedStyle(body);
            const bRect = body.getBoundingClientRect();
            state.isInitiallyCollapsed = bRect.height === 0 || bStyle.maxHeight === '0px' || bStyle.display === 'none' || bStyle.visibility === 'hidden';
          }
        }

        document.querySelectorAll('[data-sid], button, [class*="item"], [class*="card"], [class*="panel"], [class*="tab"]').forEach((el, idx) => {
          const key = el.getAttribute('data-sid') || ('idx-' + idx);
          if (el.children.length === 0) {
            state.texts[key] = (el.innerText || el.textContent || '').trim();
          }
          state.classes[key] = Array.from(el.classList);
          state.heights[key] = el.getBoundingClientRect().height;
          state.displays[key] = window.getComputedStyle(el).display;
        });
        return state;
      }, trig.selector);

      // 2. Trigger interaction
      const triggered = await page.evaluate((selector) => {
        const el = document.querySelector(selector);
        if (!el) return false;
        el.click();
        return true;
      }, trig.selector);

      if (!triggered) continue;
      await new Promise(r => setTimeout(r, 200));

      // 3. Snapshot post-interaction state & detect deltas & mutations
      const postAnalysis = await page.evaluate((selector, preState) => {
        const targetEl = document.querySelector(selector);
        const deltas = [];
        const detectedMutations = new Set();
        let affectedAncestorSelector = preState.targetAncestorSelector;

        document.querySelectorAll('[data-sid], button, [class*="item"], [class*="card"], [class*="panel"], [class*="tab"]').forEach((el, idx) => {
          const key = el.getAttribute('data-sid') || ('idx-' + idx);
          if (el.children.length === 0) {
            const postText = (el.innerText || el.textContent || '').trim();
            const preText = preState.texts[key];
            if (preText !== undefined && preText !== postText && postText.length > 0) {
              deltas.push({
                sid: el.getAttribute('data-sid') || key,
                property: 'text',
                before: preText,
                after: postText
              });
            }
          }

          // Check class mutations on target or ancestors
          const preClasses = preState.classes[key] || [];
          const postClasses = Array.from(el.classList);
          for (const c of postClasses) {
            if (!preClasses.includes(c) && (c.includes('active') || c.includes('open') || c.includes('selected') || c.includes('show'))) {
              detectedMutations.add(c);
              if (targetEl && (el === targetEl || el.contains(targetEl) || targetEl.contains(el))) {
                if (el.className && typeof el.className === 'string') {
                  affectedAncestorSelector = '.' + el.className.trim().split(/\s+/)[0];
                }
              }
            }
          }
        });

        return {
          deltas,
          mutations: Array.from(detectedMutations),
          affectedAncestorSelector
        };
      }, trig.selector, preState);

      const mutationsList = postAnalysis.mutations.length > 0 ? postAnalysis.mutations : ['is-active'];
      const ancestorSelector = postAnalysis.affectedAncestorSelector || '.e-con';

      // Always form complete 4-field trace (Contract v4.0 Z3)
      const trace = {
        trigger: trig.selector,
        ancestor: ancestorSelector,
        mutations: mutationsList,
        initialState: {
          collapsed: preState.isInitiallyCollapsed,
          active: preState.isInitiallyActive
        },
        triggerSid: trig.sid || trig.selector,
        action: 'click',
        deltas: postAnalysis.deltas
      };

      if (postAnalysis.deltas.length > 0 || postAnalysis.mutations.length > 0) {
        interactions.push(trace);
      }

      // Revert interaction if possible by clicking again
      await page.evaluate((selector) => {
        const el = document.querySelector(selector);
        if (el) el.click();
      }, trig.selector);
      await new Promise(r => setTimeout(r, 100));
    }

    await page.close();
  } finally {
    await browser.close();
  }

  return { interactions, traces: interactions };
}

module.exports = {
  probeOriginalBehavior
};

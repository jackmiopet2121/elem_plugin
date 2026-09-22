/**
 * Declarative Rules Engine Executor.
 * Automatically parses, binds, and executes operational rules from compiler-rules.json
 * directly on the Elementor AST without requiring manual JavaScript code changes.
 * 
 * Agnostic & Universal: Operates entirely on declarative selectors, conditions, and mutations.
 */

function setDeepProperty(obj, path, value) {
  if (!obj || !path) return;
  const parts = path.split('.');
  let curr = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (curr[part] === undefined || curr[part] === null || typeof curr[part] !== 'object') {
      curr[part] = {};
    }
    curr = curr[part];
  }
  const lastKey = parts[parts.length - 1];
  curr[lastKey] = JSON.parse(JSON.stringify(value));
}

function getDeepProperty(obj, path) {
  if (!obj || !path) return undefined;
  const parts = path.split('.');
  let curr = obj;
  for (const part of parts) {
    if (curr === undefined || curr === null) return undefined;
    curr = curr[part];
  }
  return curr;
}

function matchesSelector(node, parent, selector = {}) {
  if (!node || !selector) return false;
  const s = node.settings || {};
  const nodeClasses = (s.css_classes || s._css_classes || '').toLowerCase();

  // Match elType (container, widget)
  if (selector.elType && node.elType !== selector.elType) {
    return false;
  }

  // Match widgetType (heading, button, icon, image, html, etc.)
  if (selector.widgetType && node.widgetType !== selector.widgetType) {
    return false;
  }

  // Match classes or ID (any match in array)
  if (Array.isArray(selector.classes) && selector.classes.length > 0) {
    const nodeIds = ((s._element_id || '') + ' ' + (s.id || '')).toLowerCase();
    const matched = selector.classes.some(cls => {
      const lower = cls.toLowerCase();
      return nodeClasses.includes(lower) || nodeIds.includes(lower);
    });
    if (!matched) return false;
  }

  // Match tag if specified
  if (selector.tag && node.tagName && node.tagName.toLowerCase() !== selector.tag.toLowerCase()) {
    return false;
  }

  return true;
}

function matchesConditions(node, parent, conditions = {}) {
  if (!conditions) return true;

  // Match parentClasses
  if (Array.isArray(conditions.parentClasses) && conditions.parentClasses.length > 0) {
    if (!parent || !parent.settings) return false;
    const pClasses = (parent.settings.css_classes || parent.settings._css_classes || '').toLowerCase();
    const matched = conditions.parentClasses.some(cls => pClasses.includes(cls.toLowerCase()));
    if (!matched) return false;
  }

  // Match notClasses (excludes explicitly vertical or differently oriented elements)
  if (Array.isArray(conditions.notClasses) && conditions.notClasses.length > 0) {
    const nodeClasses = (node.settings?.css_classes || node.settings?._css_classes || '').toLowerCase();
    const hasForbidden = conditions.notClasses.some(cls => nodeClasses.includes(cls.toLowerCase()));
    if (hasForbidden) return false;
  }

  // Match hasChild
  if (conditions.hasChild && Array.isArray(node.elements)) {
    const targetChild = conditions.hasChild;
    const hasMatch = node.elements.some(child => {
      if (targetChild.widgetType && child.widgetType !== targetChild.widgetType) return false;
      if (targetChild.elType && child.elType !== targetChild.elType) return false;
      if (targetChild.classes) {
        const cClasses = (child.settings?.css_classes || child.settings?._css_classes || '').toLowerCase();
        return targetChild.classes.some(cls => cClasses.includes(cls.toLowerCase()));
      }
      return true;
    });
    if (!hasMatch) return false;
  }

  // Match propertyEquals
  if (conditions.propertyEquals) {
    for (const [propPath, expectedVal] of Object.entries(conditions.propertyEquals)) {
      const actualVal = getDeepProperty(node, propPath);
      if (actualVal !== expectedVal) return false;
    }
  }

  return true;
}

function applyDeclarativeMutations(node, parent, mutations = {}, context = {}) {
  if (!node || !mutations) return;

  for (const [path, val] of Object.entries(mutations)) {
    let resolvedVal = val;
    // Dynamic token replacement (e.g. font family from context)
    if (typeof val === 'string' && val.includes('${fontFamily}')) {
      resolvedVal = val.replace('${fontFamily}', context.fontFamily || 'Inter');
    }
    setDeepProperty(node, path, resolvedVal);
  }
}

/**
 * Traverses the entire compiler-rules.json object and extracts all declarative rule definitions.
 */
function extractDeclarativeRules(rulesObj) {
  const declarativeRules = [];

  function scan(curr, ruleKey = '') {
    if (!curr || typeof curr !== 'object') return;

    if (curr.target && (curr.mutations || curr.linter)) {
      declarativeRules.push({
        key: ruleKey,
        enabled: curr.enabled !== false,
        target: curr.target,
        conditions: curr.conditions || null,
        mutations: curr.mutations || null,
        linter: curr.linter || null,
        childMutations: curr.childMutations || null,
        ruleDescription: curr.ruleDescription || ''
      });
      return;
    }

    for (const [k, v] of Object.entries(curr)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        scan(v, ruleKey ? `${ruleKey}.${k}` : k);
      }
    }
  }

  scan(rulesObj);
  return declarativeRules;
}

/**
 * Autonomous Declarative Rule Executor.
 * Traverses the Elementor AST and executes all active declarative rules.
 */
function executeDeclarativeRules(contentElements, rulesObj, context = {}) {
  if (!Array.isArray(contentElements) || !rulesObj) return { executedCount: 0, appliedRules: [] };

  const declarativeRules = extractDeclarativeRules(rulesObj).filter(r => r.enabled);
  const telemetry = {
    executedCount: 0,
    appliedRules: new Set()
  };

  function processNode(node, parent = null) {
    if (!node) return;

    for (const rule of declarativeRules) {
      if (matchesSelector(node, parent, rule.target) && matchesConditions(node, parent, rule.conditions)) {
        if (rule.mutations) {
          applyDeclarativeMutations(node, parent, rule.mutations, context);
          telemetry.executedCount++;
          telemetry.appliedRules.add(rule.key);
        }

        // Apply child mutations if defined (e.g. on all child buttons of a switcher)
        if (rule.childMutations && Array.isArray(node.elements)) {
          const { target: childTarget, mutations: childMuts } = rule.childMutations;
          for (const child of node.elements) {
            if (matchesSelector(child, node, childTarget)) {
              applyDeclarativeMutations(child, node, childMuts, context);
              telemetry.executedCount++;
            }
          }
        }
      }
    }

    if (Array.isArray(node.elements)) {
      for (const child of node.elements) {
        processNode(child, node);
      }
    }
  }

  for (const root of contentElements) {
    processNode(root, null);
  }

  return {
    executedCount: telemetry.executedCount,
    appliedRules: Array.from(telemetry.appliedRules)
  };
}

module.exports = {
  setDeepProperty,
  getDeepProperty,
  matchesSelector,
  matchesConditions,
  applyDeclarativeMutations,
  extractDeclarativeRules,
  executeDeclarativeRules
};

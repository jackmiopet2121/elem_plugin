/**
 * Ground-Truth AST Linker.
 * Codename: "Single-Pass + Verify" (Phase 1 - T1.2)
 * 
 * Provides deterministic 1:1 lookup between any DOM AST node or Elementor widget
 * and its corresponding ground-truth snapshot record at any viewport.
 */

/**
 * Resolves the ground-truth snapshot record for a given AST or Elementor node.
 * @param {Object} node - AST DOMNode or Elementor element
 * @param {string} viewport - 'desktop' | 'tablet' | 'mobile'
 * @param {Object} snapshot - Ground-truth snapshot emitted by style-snapshot.js
 * @returns {Object|null} Node ground-truth data or null
 */
function gtFor(node, viewport = 'desktop', snapshot = null) {
  if (!node || !snapshot || !snapshot.viewports) return null;

  const vpData = snapshot.viewports[viewport];
  if (!vpData || !vpData.flat) return null;

  // 1. Direct data-sid attribute
  let sid = null;
  if (node.attributes && node.attributes['data-sid']) {
    sid = node.attributes['data-sid'];
  } else if (node.attrs && node.attrs['data-sid']) {
    sid = node.attrs['data-sid'];
  } else if (node._sid) {
    sid = node._sid;
  } else if (node.settings && node.settings._sid) {
    sid = node.settings._sid;
  } else if (node._dom_id) {
    sid = node._dom_id;
  } else if (node.settings && node.settings._dom_id) {
    sid = node.settings._dom_id;
  }

  if (sid && vpData.flat[sid]) {
    return vpData.flat[sid];
  }

  // 2. Fallback: match by DOM ID
  const elementId = (node.attributes && node.attributes.id) || (node.settings && node.settings._element_id);
  if (elementId) {
    const found = Object.values(vpData.flat).find(n => n.id === elementId);
    if (found) return found;
  }

  return null;
}

module.exports = {
  gtFor
};

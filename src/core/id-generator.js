/**
 * Collision-free 8-character hex ID generator for Elementor elements.
 */
const usedIds = new Set();

function generateId() {
  const chars = '0123456789abcdef';
  let id = '';
  do {
    id = '';
    for (let i = 0; i < 8; i++) {
      id += chars[Math.floor(Math.random() * chars.length)];
    }
  } while (usedIds.has(id));
  usedIds.add(id);
  return id;
}

function resetIdPool() {
  usedIds.clear();
}

function registerUsedId(id) {
  usedIds.add(id);
}

module.exports = {
  generateId,
  resetIdPool,
  registerUsedId,
  usedIds
};

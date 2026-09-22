/**
 * Collision-free 8-character hex ID generator for Elementor elements.
 * Uses a deterministic PRNG seeded per compilation pool reset.
 */
const usedIds = new Set();
let seed = 0x12345678;

function deterministicRandom() {
  let t = seed += 0x6D2B79F5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function generateId() {
  const chars = '0123456789abcdef';
  let id = '';
  do {
    id = '';
    for (let i = 0; i < 8; i++) {
      id += chars[Math.floor(deterministicRandom() * chars.length)];
    }
  } while (usedIds.has(id));
  usedIds.add(id);
  return id;
}

function resetIdPool(newSeed = 0x12345678) {
  usedIds.clear();
  seed = newSeed;
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

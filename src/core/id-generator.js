/**
 * Collision-free 8-character hex ID generator for Elementor elements.
 * Uses compilation-scoped PRNG seeded deterministically per compilation context.
 */

const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');

const compilationStorage = new AsyncLocalStorage();

/**
 * Computes a stable 32-bit integer seed from input content fingerprint.
 * Never uses filename, path, class name, or visible text heuristics.
 * @param {string} content
 * @returns {number}
 */
function computeContentSeed(content) {
  if (typeof content !== 'string') {
    content = String(content || '');
  }
  const hash = crypto.createHash('sha256').update(content, 'utf8').digest();
  return hash.readUInt32BE(0);
}

/**
 * Creates an isolated, compilation-scoped ID generator instance.
 * @param {Object} [options]
 * @param {number} [options.seed]
 * @param {string} [options.content]
 * @param {Iterable<string>} [options.existingIds]
 * @returns {Object}
 */
function createIdGenerator(options = {}) {
  let seed;
  if (typeof options.seed === 'number' && Number.isFinite(options.seed)) {
    seed = (options.seed >>> 0);
  } else if (options.content !== undefined) {
    seed = computeContentSeed(options.content);
  } else {
    seed = 0x12345678;
  }

  const initialSeed = seed;
  const usedIds = new Set(options.existingIds || []);
  const chars = '0123456789abcdef';

  function deterministicRandom() {
    let t = (seed = (seed + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= (t + Math.imul(t ^ (t >>> 7), t | 61)) | 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function generateId() {
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

  function registerUsedId(id) {
    if (id) usedIds.add(String(id));
  }

  function hasId(id) {
    return usedIds.has(String(id));
  }

  function reset(newSeed) {
    usedIds.clear();
    if (typeof newSeed === 'number' && Number.isFinite(newSeed)) {
      seed = (newSeed >>> 0);
    } else {
      seed = initialSeed;
    }
  }

  return {
    generateId,
    registerUsedId,
    hasId,
    reset,
    get usedIds() { return usedIds; },
    get seed() { return seed; }
  };
}

/**
 * Fallback standalone generator for legacy callers outside any explicit compilation context.
 */
const fallbackGenerator = createIdGenerator({ seed: 0x12345678 });

/**
 * Runs an action within an active compilation ID generator context.
 * @param {Object} generator
 * @param {Function} fn
 * @returns {*}
 */
function runWithGenerator(generator, fn) {
  return compilationStorage.run(generator, fn);
}

/**
 * Gets the active compilation generator from AsyncLocalStorage if present.
 * @returns {Object|null}
 */
function getCurrentGenerator() {
  return compilationStorage.getStore() || null;
}

/**
 * Public generateId function: uses the compilation context if active, otherwise fallback.
 * @returns {string}
 */
function generateId() {
  const current = getCurrentGenerator();
  if (current) {
    return current.generateId();
  }
  return fallbackGenerator.generateId();
}

/**
 * Public registerUsedId function: registers with active context if present, otherwise fallback.
 * @param {string} id
 */
function registerUsedId(id) {
  const current = getCurrentGenerator();
  if (current) {
    current.registerUsedId(id);
  } else {
    fallbackGenerator.registerUsedId(id);
  }
}

/**
 * Public resetIdPool function: resets the active context if present, otherwise fallback.
 * @param {number} [newSeed]
 */
function resetIdPool(newSeed) {
  const current = getCurrentGenerator();
  if (current) {
    current.reset(newSeed);
  } else {
    fallbackGenerator.reset(newSeed);
  }
}

module.exports = {
  createIdGenerator,
  computeContentSeed,
  runWithGenerator,
  getCurrentGenerator,
  generateId,
  registerUsedId,
  resetIdPool,
  get usedIds() {
    const current = getCurrentGenerator();
    return current ? current.usedIds : fallbackGenerator.usedIds;
  }
};

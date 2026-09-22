/**
 * Block 8.0: Universal Corpus Manifest
 * 
 * Auto-discovers available HTML fixtures across the repository.
 * Assigns stable, deterministic fixture IDs.
 * Attaches test-only metadata (never imported into production code).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Default viewports matching the engine contract
const DEFAULT_VIEWPORTS = [
  { name: 'desktop', width: 1200, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 375, height: 812 }
];

/**
 * Derives a stable, deterministic fixture ID from a relative path or file content hash.
 * @param {string} rootDir 
 * @param {string} filePath 
 * @returns {string}
 */
function deriveFixtureId(rootDir, filePath) {
  const relPath = path.relative(rootDir, filePath).replace(/\\/g, '/');
  return relPath
    .replace(/^tests\/corpus\//, 'corpus/')
    .replace(/^tests\/fixtures\//, 'fixtures/')
    .replace(/\/input\.html$/, '')
    .replace(/\.html$/, '');
}

/**
 * Computes SHA256 content hash of a file for identity tracking.
 * @param {string} filePath 
 * @returns {string}
 */
function computeFileHash(filePath) {
  try {
    const content = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 12);
  } catch (err) {
    return '000000000000';
  }
}

/**
 * Discovers fixtures dynamically across the repository.
 * Searches:
 * - tests/corpus/* /input.html
 * - Specific benchmark root files (landing.html, landingv2.html, etc. if present)
 * - Any additional explicit paths provided in options.additionalPaths
 * 
 * @param {Object} options
 * @param {string} [options.rootDir]
 * @param {string[]} [options.additionalPaths]
 * @returns {Array<Object>} Discovered fixtures
 */
function discoverCorpusFixtures(options = {}) {
  const rootDir = options.rootDir || path.resolve(__dirname, '..', '..');
  const additionalPaths = options.additionalPaths || [];

  const seenPaths = new Set();
  const seenIds = new Set();
  const fixtures = [];

  function addFixture(filePath, defaultMeta = {}) {
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) return;
    if (seenPaths.has(resolved)) return;
    seenPaths.add(resolved);

    const fixtureId = deriveFixtureId(rootDir, resolved);
    if (seenIds.has(fixtureId)) return;
    seenIds.add(fixtureId);

    const contentHash = computeFileHash(resolved);

    fixtures.push({
      fixtureId,
      filePath: resolved,
      relativePath: path.relative(rootDir, resolved).replace(/\\/g, '/'),
      contentHash,
      metadata: {
        minNativeEditability: defaultMeta.minNativeEditability !== undefined ? defaultMeta.minNativeEditability : 0.90,
        requireBehaviorVerification: Boolean(defaultMeta.requireBehaviorVerification),
        allowedUnsupportedCapabilities: defaultMeta.allowedUnsupportedCapabilities || [],
        viewports: defaultMeta.viewports || DEFAULT_VIEWPORTS,
        tags: defaultMeta.tags || []
      }
    });
  }

  // 1. Discover in tests/corpus
  const primaryCorpusDir = path.join(rootDir, 'tests', 'corpus');
  if (fs.existsSync(primaryCorpusDir)) {
    const entries = fs.readdirSync(primaryCorpusDir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.isDirectory()) {
        const inputHtml = path.join(primaryCorpusDir, ent.name, 'input.html');
        if (fs.existsSync(inputHtml)) {
          addFixture(inputHtml, { tags: ['corpus', ent.name] });
        }
      }
    }
  }

  // 2. Discover known benchmark landing pages at root
  const rootCandidates = [
    { file: 'landing.html', tags: ['benchmark', 'landing-v1', 'saas', 'light-dark'] },
    { file: 'landingv2.html', tags: ['benchmark', 'landing-v2', 'dark-space', 'interactive'] }
  ];
  for (const item of rootCandidates) {
    const fullPath = path.join(rootDir, item.file);
    if (fs.existsSync(fullPath)) {
      addFixture(fullPath, { tags: item.tags });
    }
  }

  // 3. Discover any dynamically provided additional paths
  for (const customPath of additionalPaths) {
    const resolved = path.resolve(rootDir, customPath);
    if (fs.existsSync(resolved)) {
      addFixture(resolved, { tags: ['custom'] });
    }
  }

  // Deterministic sort by fixtureId
  fixtures.sort((a, b) => a.fixtureId.localeCompare(b.fixtureId));

  return fixtures;
}

module.exports = {
  DEFAULT_VIEWPORTS,
  deriveFixtureId,
  computeFileHash,
  discoverCorpusFixtures
};

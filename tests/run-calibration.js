#!/usr/bin/env node

/**
 * CLI Runner: Offline Parity Calibration Engine (Task W3)
 * Runs the 8 held-out calibration micro-layouts and outputs divergence table.
 */

const { runCalibrationSuite } = require('./synthetic-w3-parity-calibration');

runCalibrationSuite()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Calibration Suite Failed:', err);
    process.exit(1);
  });

/**
 * HTML to Elementor Tool - Main Entry Point.
 */
const { compileHtmlToElementor } = require('./engine');
const { auditTemplate } = require('./linter/template-linter');
const { loadRules, getRule } = require('./core/rules-engine');
const { getApiKeys } = require('./ai/gemini-client');

module.exports = {
  compileHtmlToElementor,
  auditTemplate,
  loadRules,
  getRule,
  getApiKeys
};


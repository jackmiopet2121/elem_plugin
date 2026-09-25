/**
 * Audit and Defect Schema Definitions.
 * Codename: "Single-Pass + Verify" (Phase 0 - T0.2)
 * 
 * Standardized data models for defect logging, node lifecycle history, and global scorecard audits.
 */

const CRITICAL_RULES = Object.freeze([
  'RULE-ASSET-01',
  'RULE-DOM-01',
  'RULE-STATE-01',
  'RULE-TOPOLOGY-02',
  'RULE-VIS-01',
  'RULE-VIS-02',
  'RULE-VIS-03'
]);

const AVAILABLE_RULES = Object.freeze([
  'RULE-ASSET-01',
  'RULE-DOM-01',
  'RULE-STATE-01',
  'RULE-CLR-01',
  'RULE-CLR-02',
  'RULE-CLR-03',
  'RULE-CANVAS-01',
  'RULE-SURFACE-01',
  'RULE-SURFACE-02',
  'RULE-TYP-01',
  'RULE-TYP-02',
  'RULE-TXT-01',
  'RULE-TXT-02',
  'RULE-GEO-01',
  'RULE-TOPOLOGY-01',
  'RULE-TOPOLOGY-02',
  'RULE-BOX-01',
  'RULE-BOX-02',
  'RULE-VIS-01',
  'RULE-VIS-02',
  'RULE-VIS-03',
  'RULE-VIS-04',
  'RULE-BHV-01'
]);

let defectCounter = 0;

/**
 * Creates a normalized defect record.
 */
function createDefect({
  nodeSid = null,
  widgetId = null,
  viewport = 'desktop',
  property = '',
  original = null,
  rendered = null,
  severity = 'HIGH', // 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  rule = 'GENERIC_MISMATCH',
  rung = 'R0', // 'R0' | 'R1' | 'R2' | 'R3'
  advisory = false,
  message = ''
} = {}) {
  const isCritical = CRITICAL_RULES.includes(rule);
  const finalSeverity = isCritical ? 'CRITICAL' : severity;
  const finalAdvisory = isCritical ? false : advisory;
  return {
    id: `defect-${++defectCounter}`,
    nodeSid,
    widgetId,
    viewport,
    property,
    original,
    rendered,
    severity: finalSeverity,
    rule,
    rung,
    advisory: finalAdvisory,
    message: message || `Defect on ${nodeSid || widgetId || 'element'} [${rule}]: expected ${JSON.stringify(original)}, got ${JSON.stringify(rendered)}.`
  };
}

/**
 * Creates an empty audit report structure.
 */
function createAuditReport({
  title = 'Elementor Template Audit',
  totalElements = 0,
  proWidgets = 0
} = {}) {
  return {
    title,
    timestamp: new Date().toISOString(),
    perNode: new Map(), // sid -> { sid, currentRung: 'R0', history: [] }
    defects: [],
    global: {
      fidelity: 100,
      proWidgets,
      totalElements,
      behaviorResults: { tested: 0, passed: 0, failed: 0 },
      assets: { imagesTotal: 0, imagesLoaded: 0 },
      fonts: { declared: [], verified: [] },
      consoleErrors: []
    }
  };
}

/**
 * Records a rung transition or attempt for a specific node.
 */
function recordNodeRung(audit, sid, rung, action = '') {
  if (!audit || !sid) return;
  let entry = audit.perNode.get(sid);
  if (!entry) {
    entry = { sid, currentRung: rung, history: [] };
    audit.perNode.set(sid, entry);
  }
  entry.currentRung = rung;
  entry.history.push({
    rung,
    action,
    timestamp: Date.now()
  });
}

/**
 * Serializes the audit report into a clean JSON-serializable scorecard.
 */
function serializeAuditScorecard(audit) {
  if (!audit) return null;

  const perNodeArray = [];
  for (const [sid, data] of audit.perNode.entries()) {
    perNodeArray.push({
      sid,
      currentRung: data.currentRung,
      attempts: data.history.length,
      history: data.history
    });
  }

  const rungCensus = { R0: 0, R1: 0, R2: 0, R3: 0 };
  perNodeArray.forEach(n => {
    if (rungCensus[n.currentRung] !== undefined) {
      rungCensus[n.currentRung]++;
    }
  });

  return {
    title: audit.title,
    timestamp: audit.timestamp,
    global: {
      ...audit.global,
      unresolvedDefects: audit.defects.length,
      rungCensus
    },
    defects: audit.defects,
    perNode: perNodeArray
  };
}

module.exports = {
  CRITICAL_RULES,
  AVAILABLE_RULES,
  createDefect,
  createAuditReport,
  recordNodeRung,
  serializeAuditScorecard
};

# Block 8.0 - Universal Product & Architectural Contract

**Document Version:** 1.0.0  
**Effective Date:** September 2026  
**Scope:** Smart Black Box HTML-to-Elementor Free Compiler (Repository Root)

---

## 1. Objective & Purpose

This contract establishes the non-negotiable architectural rules for developing the commercial HTML-to-Elementor Free Compiler. The objective is to compile clean, arbitrary HTML, CSS, and vanilla JavaScript into 100% native, fully editable Elementor Free JSON templates without landing-specific hardcoding, heuristic guessing, or Elementor Pro dependencies.

`landing.html`, `landingv2.html`, and corpus fixtures are regression test fixtures only. They must **never** become special cases inside production conversion code.

---

## 2. Universal Anti-Hardcoding Contract

### Rule 2.1: Prohibited Production Branching
Production conversion logic must **NEVER** branch on or test against:
1. **Input filenames:** e.g., `if (filename.includes('landing'))`, `filename === 'landingv2.html'`.
2. **Landing names or slugs:** e.g., checking if the page title, document slug, or meta tag matches a known fixture.
3. **Literal CSS class names from a fixture:** e.g., `if (element.classList.contains('device-card-button'))`, `classes.includes('guide-category-tag')`.
4. **Literal HTML IDs from a fixture:** e.g., `element.id === 'pricing-card-2'`.
5. **Visible text content:** e.g., `if (text === 'Primary CTA Button')`, `text.includes('Frequently Asked Questions')`.
6. **Known colors or dimensions from a specific design:** e.g., checking for specific hardcoded hex values (`#6366F1`) or pixel widths (`1200px`, `282px`) to trigger custom layout branches.

### Rule 2.2: Permitted Uses of Source Classes and IDs
Original CSS class names and DOM IDs may be preserved **only** for:
- **Selector Scoping:** Namespacing isolated micro-CSS rules.
- **Source-to-Output Identity Tracking:** Preserving `data-sid` / `e-sid-*` attributes for audit traceability.
- **Dynamic Micro-CSS Targeting:** Ensuring `:hover`, animations, and pseudo-states target their corresponding rendered nodes.
- **Runtime Interactive Script Binding:** Preserving hook selectors (e.g. accordion triggers) used by vanilla JavaScript.

**Strict Prohibition:** Source classes and IDs must **never** control semantic classification, widget selection, or layout mapping decisions.

---

## 3. Signal-Based Decision Architecture

All semantic classification, layout inference, and styling decisions must be derived purely from general, universal signals:

| Signal Category | Permitted Data Sources |
| :--- | :--- |
| **DOM Semantics** | HTML tag (`<h1>`-`<h6>`, `<p>`, `<a>`, `<button>`, `<img>`, `<svg>`), ARIA roles (`role="button"`, `role="region"`). |
| **Child Structure** | Number of children, child tag types, presence of nested structural blocks vs leaf text/icon nodes. |
| **Computed Styles** | Chromium CDP computed styles (`display`, `flex-direction`, `gap`, `padding`, `color`, `backgroundColor`, `fontFamily`). |
| **Geometry** | Measured layout rectangles (`x`, `y`, `width`, `height`, `aspectRatio`) across Desktop, Tablet, and Mobile viewports. |
| **Repetition Patterns** | Identical structural siblings in lists/grids indicating repeated cards or collection items. |
| **Interaction Behavior** | Detected event listeners (click, hover), toggle state mutations, or CSS `:hover` / `:focus` style changes. |
| **Elementor Capability Support** | Whether an Elementor Free Core setting natively supports the computed style without CSS emission. |

---

## 4. Native Output Priority Hierarchy

When mapping an HTML element or structure to Elementor, the compiler must strictly adhere to this resolution hierarchy:

1. **Tier 1: Native Elementor Free Core Widget / Setting**  
   Use standard Free Core widgets (`heading`, `text-editor`, `button`, `image`, `icon`, `container`). Style properties must map to official Elementor schema settings whenever supported.
2. **Tier 2: Plugin Custom Elementor Widget**  
   When a common web pattern (e.g. interactive comparison slider, advanced filterable grid) is not supported by Elementor Free Core primitives, map to custom widgets registered by our companion WordPress plugin.
3. **Tier 3: Scoped Micro-CSS or Runtime Behavior Support**  
   For capabilities that Elementor controls cannot represent natively (e.g. CSS keyframe animations, backdrop filters, complex hover transforms, click toggles), generate isolated, scoped micro-CSS or a self-contained runtime script block.
4. **Tier 4: Explicit Unsupported-Feature Report**  
   If a feature cannot be represented natively and cannot be safely simulated via micro-CSS, emit an explicit machine-readable diagnostic defect. **Do not silently discard or guess.**

---

## 5. Prohibition of Structural HTML Embeds

HTML widgets (`widgetType: "html"`) are strictly reserved for:
- Embedded stylesheet engines (injected header `<style>`).
- Embedded interactive script engines (injected footer `<script>`).
- Raw non-primitive embeds (e.g. canvas elements, third-party iframe widgets).

**Rule:** HTML widgets must **never** be used for standard headings, text, buttons, images, icons, cards, sections, or ordinary layout containers. Downgrading an editable card (such as a `<button>` containing an icon, title, and description) to an HTML widget is a contract violation.

---

## 6. Verification and Audit Integrity

1. **No Fake Passes:** A conversion must not report a passing fidelity score (or 100%) if any section, element, or viewport was skipped, errored, or left unverified.
2. **Deterministic Reporting:** All regression and baseline audit reports must be deterministic. They must not embed volatile system timestamps, local machine file paths, or random IDs in comparison hashes.
3. **Honest Metric Reporting:** If a metric is not yet captured or implemented in the engine, it must be reported as `null` with an explicit reason. Fabricating or defaulting unmeasured values to `0` or `100` is strictly forbidden.

---

## 7. Complete Audit Schema Contract & Validation Precedence

### Rule 7.1: Valid Root & Fidelity Contract
- The audit root must be a non-null, non-array object.
- Fidelity score must be a finite number between 0 and 100 inclusive.
- Allowed locations for fidelity:
  1. `audit.fidelity` (highest priority)
  2. `audit.global.fidelity`
  3. `audit.score` (lowest priority)
- If multiple fidelity locations are defined, their values must match exactly. Conflicting fidelity values across audit fields are rejected.

### Rule 7.2: Defects & Counts Dual Representation & Reconciled Schema
- An audit must contain at least one complete defect representation: a valid `defects` array or a valid `counts` object. An audit containing only fidelity is invalid.
- Allowed keys in `counts`: `total`, `critical`, `high`, `medium`, `low`, `advisory`.
  - `total` is metadata, not a severity.
  - All count values must be finite non-negative integers. Unknown keys fail validation.
- When `counts` is used alone (without `defects` array):
  - At least one severity breakdown key (`critical`, `high`, `medium`, `low`, `advisory`) must be present.
  - If `total` exists, it must equal the sum of raw severity counts present in `counts`.
- When both `defects` and `counts` coexist:
  - If `counts.total` exists, it must equal `defects.length`.
  - Raw severity counts in `counts` must be consistent with defect severities (case-insensitive: `critical`, `high`, `medium`, `low`).
  - `d.advisory === true` does not change the defect's raw severity (`severity: "HIGH"` with `advisory: true` remains a high-severity defect in raw tally).
  - If `counts.advisory` is explicitly emitted, it must match the advisory defect tally.
- If `advisoryDefectCount` is provided:
  - Must be a finite non-negative integer.
  - When `defects` exists, it must equal `defects.filter(d => d.advisory === true).length`.
  - It is orthogonal to severity; equality with `counts.advisory` is not required unless `counts.advisory` was explicitly emitted.
- Baseline display census:
  - The baseline report display preserves exclusive categorization:
    `if (defect.advisory) -> census.advisory++ else -> census[severity]++`
    restoring honest baseline display numbers like `0 / 6 / 0 / 0 / 72` while preserving the underlying schema contract (`counts.total: 78`, `counts.high: 42`, `advisory: 72`).
- If `consoleErrors` is provided, it must be an array.

---

## 8. Conservative Structural HTML AST Checker & Block 8.1 Migration Scope

The structural HTML primitive checker uses clean AST parsing (`parseHtmlToAst`) and deep recursive traversal:
- Inspects all nodes independently, including those inside forms, custom wrappers, and composite controls.
- Flags standard headings (`<h1>`-`<h6>`), paragraphs (`<p>`), images (`<img>`), and simple buttons (`<button>`).
- System HTML exemption requires **both** a registered system reason (`SYSTEM:stylesheet-engine` or `SYSTEM:script-engine`) **and** matching system content (`<style>` or `<script>`).
- **Conservative Checker Scope Note:** The current checker is intentionally conservative. It flags composite HTML for later migration to custom plugin widgets in Block 8.1. If parsing fails, it fails closed with an explicit unverifiable structural validation violation.

---

## 9. Compilation-Scoped Elementor ID Architecture & Fallback Behavior

Elementor IDs are generated deterministically per compilation context:
- Input HTML content produces a SHA-256 derived seed (`computeContentSeed`), ensuring identical ordered IDs for the same input and distinct IDs for different inputs without depending on filenames or absolute machine paths.
- Each compilation owns an isolated `usedIds` set via `AsyncLocalStorage` (`runWithGenerator`).
- **Honest Fallback Behavior:** Production compiler calls run inside an isolated compilation context. Legacy calls outside a compilation context currently use the fallback generator. A shared fallback state exists for unbracketed legacy invocations.

---

## 10. SID Classification Taxonomy & Traceability

Nodes in the compiled template are classified into four explicit categories:
1. **Source-Derived:** Nodes representing source DOM elements mapped in Ground Truth; expected to preserve source SIDs (`_sid` / `settings._sid` / `e-sid-*`). Missing SID fails the invariant gate.
2. **Generated Helpers:** Explicit compiler-generated layout containers with `settings._is_helper: true`; reported separately without invented SIDs.
3. **Exempt System:** System stylesheet and script engine widgets with registered reasons and matching tags.
4. **Unverifiable:** Nodes without SID whose source derivation cannot be proven; strictly fails the invariant gate.


# PROJECT MASTER BRIEF & TECHNICAL SPECIFICATION
**Project Name:** Smart Black Box HTML-to-Elementor Free Compiler (`engine-v2`)  
**Repository Working Directory:** `c:\disque D\html_to_elementor`  
**Target Output:** 100% Native, Free Core Elementor Template JSON (`landing_final.json` / `landingv2_final.json`)  
**Status:** In Active Development — Transitioning from Single-Template Optimization to Universal Generalization.

---

## 1. EXECUTIVE MISSION & CORE GOAL

The objective of this project is to build an autonomous, industrial-grade compiler that takes **any arbitrary HTML/CSS/JS landing page** and converts it into a **valid, editable Elementor Free JSON template** (WordPress Elementor Core only, zero Elementor Pro dependencies).

### The Golden Metric:
1. **Visual Parity:** $\ge 98\%$ fidelity score measured across 3 viewports:
   - **Desktop:** 1200px
   - **Tablet:** 768px
   - **Mobile:** 375px
2. **Editability:** $\ge 90\%$ native Elementor widgets (Headings, Buttons, Images, Icons, Text Editors, Containers). Zero raw monolithic HTML blobs for standard sections.
3. **Universality:** **Zero hardcoded class names or page-specific rules.** Every style, layout decision, alignment, and typography rule must be mathematically derived from computed Ground Truth styles.
4. **Isolated Micro-CSS & Scripts:** Dynamic styling (:hover, transitions, backdrop-filter, animations) isolated into a single header micro-stylesheet; dynamic interactive JS (accordions, sliders, mobile menus) isolated into a footer script widget.

---

## 2. REPOSITORY ANATOMY & KEY SUBSYSTEMS

```
c:\disque D\html_to_elementor\
├── engine-v2/
│   ├── bin/
│   │   └── cli.js                    # CLI Entry Point: node engine-v2/bin/cli.js <input.html> <output.json> [--offline]
│   ├── src/
│   │   ├── engine.js                 # Central Orchestrator: links all pipeline phases
│   │   ├── smart/
│   │   │   ├── render-snapshot.js    # Chromium CDP Ground Truth Capturer (captures computed styles at 1200, 768, 375px)
│   │   │   ├── geometry-mapper.js    # Maps computed rects & flexbox into Elementor Container & Widget settings
│   │   │   ├── responsive-merger.js  # Calculates breakpoint diffs (desktop vs tablet vs mobile)
│   │   │   ├── verification-matrix.js# Rules Engine for visual parity audit (RULE-GEO, RULE-BOX, RULE-TYP, etc.)
│   │   │   └── audit-schema.js       # Formal schema for defects and audit scoring
│   │   ├── normalizers/
│   │   │   ├── dom-tree-reducer.js   # AST Optimizer: collapses redundant div wrappers, identifies cards/lists
│   │   │   ├── css-classifier.js     # Classifies CSS: native mappable vs state/pseudo vs keyframes vs dead CSS
│   │   │   └── css-style-resolver.js # Resolves CSS inheritance & custom properties (--var)
│   │   ├── transformers/
│   │   │   ├── container-transformer.js # Generates Elementor Flexbox Container JSON
│   │   │   └── widget-transformer.js    # Generates Elementor Native Widget JSON (heading, button, icon, etc.)
│   │   ├── emulator/
│   │   │   └── elementor-virtual-renderer.js # Headless emulator: renders Elementor JSON into HTML/CSS for audit
│   │   └── inspector/
│   │       └── self-healing-loop.js  # Iterative closed-loop mutation solver to eliminate residual visual deltas
│   └── tests/
│       ├── synthetic-k1-*.js to synthetic-k9-*.js # Unit/Contract test suites
│       └── corpus/                   # Regression templates (01-hero, 02-pricing, 03-grid, etc.)
├── landing.html                      # Primary benchmark template 1 (SaaS Light/Dark theme)
└── landingv2.html                    # Secondary benchmark template 2 (Full Dark Space theme, 52KB)
```

---

## 3. THE 5-PHASE COMPILATION PIPELINE

1. **Phase 1: Input Analysis & Environment Setup:**
   - Detects boxed container width (e.g. 1200px), primary font family (e.g. Inter), and inline interactive scripts.
2. **Phase 2: Single-Pass Ground Truth (CDP Headless Chromium):**
   - Spins up local headless Chromium.
   - Measures exact DOM tree rects `(x, y, width, height)` and computed styles across Desktop (1200px), Tablet (768px), and Mobile (375px).
   - Assigns unique `sid` (Semantic IDs) to each DOM node.
3. **Phase 3: Semantic Transformation & Elementor Mapping:**
   - Converts structural wrappers into `elType: "container"`.
   - Converts content leaf nodes into Elementor native widgets:
     - `<h1>`-`<h6>` $\rightarrow$ `widgetType: "heading"`
     - `<a>`, `<button>` (simple) $\rightarrow$ `widgetType: "button"`
     - `<img>`, `<picture>` $\rightarrow$ `widgetType: "image"`
     - `<svg>`, `<i>` (FontAwesome) $\rightarrow$ `widgetType: "icon"`
     - `<p>`, `<span>` $\rightarrow$ `widgetType: "text-editor"`
4. **Phase 4: Micro-CSS Classification & Guardrails:**
   - Evaluates all CSS rules from the original page.
   - Rules mapped natively to Elementor JSON are stripped from CSS.
   - Pseudo-states (`:hover`, `:focus`), CSS transforms, keyframe animations, and custom CSS are scoped and injected into the template's embedded `<style>` block.
5. **Phase 5: Autonomous Verification & Audit Loop:**
   - `elementor-virtual-renderer.js` renders the generated Elementor JSON to virtual HTML.
   - `verification-matrix.js` compares the virtual render against Chromium Ground Truth across all 3 viewports.
   - Generates `fidelity score` (target $\ge 98\%$), categorizing defects into `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, and `ADVISORY`.

---

## 4. WHAT WORKS (VERIFIED FOUNDATIONS UP TO BLOCK 7.9)

- **Single-Pass Determinism:** Zero external network calls in `--offline` mode; fast Chromium execution (~15-20s).
- **Editability Guard:** Guaranteed 90%+ native widgets.
- **K8 State-Selector Authority:** Prevents button hover states from expanding to full-width container wrappers (`.elementor-button:hover` semantic inner routing).
- **K9 Per-Viewport Auto-Centering:** Containers with `margin: 0 auto` correctly map to `align_self: center` (column) or `justify_content: center` (row) without leaking fixed desktop margins to mobile/tablet.
- **Primary Font UA Fallback Purge:** Buttons and widgets strictly inherit primary page typography (`Inter`) instead of defaulting to user-agent `Arial`.
- **Pre-flight Quality Audit:** Passes 99/100 on `landing.html` with 0 critical, 0 high defects.

---

## 5. THE CURRENT BOTTLENECK: THE `landingv2.html` CRASH-TEST

When the compiler was tested against an unseen, complex, dark-mode landing page (`landingv2.html`, 52.4 KB), the score dropped to **84/100** with **250 unresolved defects**.

### Visual & Structural Defects Identified:
1. **Canvas Inversion (Dark Theme Broken):**
   - Original page is full dark mode (`#080B11`).
   - The compiled preview rendered with a **pure white background (`#ffffff`)**, making white text invisible.
   - Semi-transparent section backgrounds (`rgba(14, 19, 31, 0.3)`) blended over white, appearing as dirty gray rectangles.
2. **Card Buttons Downgraded to Raw HTML Widgets:**
   - 4 device cards written as `<button class="device-card-button">` with icon, title, and description were downgraded to `widgetType: "html"` (`NON_ELEMENTOR_PRIMITIVE:composite-control`).
   - Triggered compiler warnings: `HTML widget contains raw structural card or button markup`.
   - Resulted in 36 typography and font-size defects (RULE-TYP-01).
3. **Purged CSS for Inline Metadata Spans:**
   - Article tags and metadata (`<span class="guide-category-tag">`) bundled into `text-editor` widgets lost their CSS styling completely because `css-classifier.js` purged the classes.
   - Resulted in 54 color, typography, and border-radius defects.
4. **Multi-Column Flex Math & Grid Wrapping:**
   - 4-card rows (Trust section) wrapped into 3 + 1.
   - 3-card rows (Guides section) wrapped into 2 + 1.
   - Resulted in 31 width discrepancies (RULE-GEO-01).
5. **False Positives in Audit Matrix (RULE-BOX-02):**
   - 27 border-radius defects flagged because `border-radius: 9999px` (GT) was compared against `50%` / `50px` (Elementor circle shape). Both produce identical circular geometry, but the audit penalizes `|9999 - 50| > 4`.

---

## 6. THE 5 UNIVERSAL ARCHITECTURAL SOLUTIONS REQUIRED

To achieve true universality without hardcoding for specific files, the following 5 solutions must be implemented:

### Solution 1: Body Canvas & Page Background Inheritance
- **Rule:** The root Elementor Container (or template settings) MUST inherit `document.body`'s computed `background-color` and `color` from Ground Truth.
- **Specification:**
  If `document.body` has computed background $\ne$ transparent/rgba(0,0,0,0), set root container `background_color = bodyBgColor`.
  This guarantees that all transparent child sections inherit the dark or light canvas correctly in WordPress.

### Solution 2: Semantic Container Classification for Interactive Cards
- **Rule:** A `<button>` or `<a>` element containing structured block-level children (icons, headings, paragraphs) is a **Card Container**, NOT a form input or composite trigger.
- **Specification:**
  In `dom-tree-reducer.js`, if a `<button>` or `<a>` has children that match container/card criteria, transform it to `elType: "container"` with native child widgets, setting the click/link handler at the container level.
  Never downgrade a structural card to an uneditable HTML widget.

### Solution 3: Preserve Sub-Class Styles for Embedded Text Content
- **Rule:** CSS rules targeting classes present inside the inner HTML of `text-editor` widgets (e.g. `.guide-category-tag`, `.badge-pill`, `code`, `span`) MUST be preserved in the micro-stylesheet.
- **Specification:**
  In `css-classifier.js`, collect all class names existing inside `text-editor` widget contents. Exclude them from the "dead CSS" purge and retain them in the embedded micro-stylesheet.

### Solution 4: Math-Based Multi-Column Percentage Widths
- **Rule:** In horizontal flex containers (`direction: "row"`) with $N$ equal-width children, calculate percentage width subtracting the gap.
- **Specification:**
  $$\text{width}_{\text{child}} = \frac{100\% - (N - 1) \times \text{gap}}{N}$$
  Set `width: { unit: '%', size: calculatedPercent }` or `flex_grow: 1` with `width: auto` to prevent unintended flex wrapping.

### Solution 5: Semantic Equivalence in Verification Matrix for Radii
- **Rule:** `border-radius: 9999px` and `border-radius: 50%` are mathematically and visually equivalent pills/circles on bounded elements.
- **Specification:**
  In `verification-matrix.js`, if $\min(\text{gtRad}, \text{rnRad}) \ge \frac{\min(w, h)}{2} - 1$, treat as a MATCH (0 penalty).

---

## 7. EXECUTION CONSTRAINTS & COMMANDS

- **Node/CLI Command to Run:**
  `node engine-v2/bin/cli.js <input.html> <output.json> --offline`
- **Synthetic Test Suites:**
  `node engine-v2/tests/synthetic-k9-responsive-emission.js`
- **Corpus Regressions:**
  `node engine-v2/tests/run-corpus-regressions.js`
- **CRITICAL CONSTRAINT:** **ZERO GIT COMMANDS.** Never run `git add`, `git commit`, `git push`, or `git checkout`. All changes must be verified through the test suite and audit reports.

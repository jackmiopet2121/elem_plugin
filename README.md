# Universal Smart HTML-to-Elementor Free Compiler (v0.4)
**Codename:** "Single-Pass + Verify" (Hybrid Architecture)

An autonomous compiler that converts arbitrary web landing pages (HTML5, CSS3, JavaScript) into native, clean WordPress Elementor Free JSON templates (`template_type: 'page'`, `version: '0.4'`) with 100% Free Core compliance (strictly zero Pro widgets).

---

## 1. Architecture: "Qis, Mappi, Verify, Heal"

```
[ Input HTML/CSS/JS ]
         │
         ▼
[ 1. Ground Truth Acquisition (style-snapshot.js) ]
  • Headless Chromium renders page at Desktop (1280px), Tablet (768px), Mobile (370px)
  • Assigns stable data-sid (1:1 deterministic node tracking)
  • Captures computed styles, bounding rects, line counts, CDP hover states, assets, and fonts
         │
         ▼
[ 2. Single-Pass Geometric Mapping (geometry-mapper.js) ]
  • Direct AST mapping from Chromium geometry and computed truth
  • Zero regex guessing, zero class-keyword heuristics
  • Fluid container auto-expansion (strictly min_height, never fixed heights)
         │
         ▼
[ 3. Multi-Viewport Responsive Merger (responsive-merger.js) ]
  • Decorates desktop base with tablet and mobile overrides (_tablet, _mobile)
  • Mobile column stacking and width 100% enforcement
         │
         ▼
[ 4. Closed-Loop Self-Healing & Verification (self-healing-loop.js) ]
  • Elementor Virtual Renderer generates preview in ~30ms without WordPress
  • Verification Matrix compares Elementor render vs Ground Truth per data-sid
  • 4-Rung Fallback Ladder escalates:
      R0: Native Free Elementor settings
      R1: Granular AST Parameter Mutation (tune typography, padding, color)
      R2: Scoped Micro-CSS Injection (element-isolated CSS)
      R3: Scoped HTML Micro-Embed (lossless terminal fallback)
         │
         ▼
[ 5. Convergence Gate & Non-Blocking Export (convergence-gate.js) ]
  • Guaranteed export of template JSON, HTML preview, and standardized audit scorecard
```

---

## 2. CLI Usage

```bash
# Standard compilation with Chromium Ground-Truth & Self-Healing:
node bin/cli.js input.html output.json

# Offline AST compilation (without Chromium):
node bin/cli.js input.html output.json --offline
```

### Generated Artifacts
For any compilation target `output.json`, the compiler generates:
1. `output.json`: Import-ready WordPress Elementor Free template JSON.
2. `output-preview.html`: Standalone, interactive HTML preview of the Elementor template.
3. `output.audit.json`: Standardized quality audit scorecard with fidelity score, rung census, and defect history.

---

## 3. The `--offline` Contract
When `--offline` is specified (or in environments without Chromium/Puppeteer):
- The compiler switches to the offline deterministic AST parser and cascading style resolver.
- Ground truth capture and visual verification loops are skipped.
- The template is always exported cleanly with an offline notice in the audit report.

---

## 4. Test Harnesses & Checkpoints

```bash
# Run automated regression suite across all corpus fixtures:
npm run test:corpus

# Verify Checkpoint C1 (Ground Truth Acquisition):
npm run test:c1

# Verify Checkpoint C3 (Verification Matrix):
npm run test:c3

# Verify Checkpoint C4 (Targeted Self-Healing Loop):
npm run test:c4

# Verify Checkpoint C5 (Interactive Behavior Parity):
npm run test:c5

# Verify Checkpoint C6 (Multi-Viewport Responsive Parity):
npm run test:c6

# Verify Checkpoint C7 (Convergence Gate & Export Policy):
npm run test:c7

# Verify Checkpoint C8 (Editability-First Contract):
npm run test:c8

# Verify Checkpoint C9 (Gap Scalar & PHP Fatal Prevention):
npm run test:c9

# Verify Checkpoint C10 (Link & Media URL Contract):
npm run test:c10

# Verify Checkpoint C11 (Full Scalar Contract & Negative Test):
npm run test:c11
```

---

## 5. Free Core Guarantee
- **Pro Widgets:** Strictly `0` (`proWidgets === 0`). Only native Elementor Free widgets (`heading`, `text-editor`, `button`, `image`, `icon`, `divider`, `html`) and flex containers are emitted.
- **Template Version:** Strictly `0.4` with `template_type: 'page'`.
- **Fluid Layout:** Containers expand dynamically with auto-height and content fluidity to permanently eliminate boundary bleeds and text wrapping defects.

---

## 6. Editability-First Contract ("Native or Nothing" v3.1)
- **Primary Goal:** Maximum native Elementor widgets (`heading`, `text-editor`, `button`, `image`, `icon`, `divider`).
- **Target T1:** `nativeWidgetPercentage >= 90%` across all corpus fixtures and arbitrary landing pages.
- **Target T2:** All HTML widgets carry machine-readable justification in `settings._html_reason` (strictly restricted to non-Elementor primitives like range sliders, switches, media, and system engines).
- **Target T3:** Zero representable properties in scoped micro-CSS.
- **Target T4:** Native editable widgets are **NEVER** replaced by R3 micro-embeds under any defect condition.
- **Target T5:** Residual visual deltas on native widgets that cannot be fixed via settings are accepted as advisories (Editability > Pixel Perfection).

---

## 7. Scalar & Link Contract ("String or Nothing" v3.4 + Addendum v3.4.1)
Guarantees Elementor Free PHP 8 in WordPress never receives an `Object` (`stdClass`) in a slot expecting a scalar (string or number). Eliminates PHP fatal crashes (`Object of class stdClass could not be converted to string`).

### Scalar Contract Slots
| Slot | Expected Type | Elementor PHP Usage |
|---|---|---|
| `link.url` (any widget with `settings.link`) | `string` | `esc_url()` |
| `link.is_external`, `link.nofollow` | `boolean` | conditional attributes |
| `image.url` | `string` | `esc_url()` / media |
| `selected_icon.value` | `string` | icon glyph class echo |
| `title`, `editor`, `html` | `string` | element text render |
| `space_between_widgets` (+ `_tablet`, `_mobile`) | `number` | gap CSS concat |
| `_margin.*`, `_padding.*`, `border_width.*`, `border_radius.*` | `string\|number` | box-model CSS concat |
| `width.size`, `min_height.size`, `typography_font_size.size` | `number\|string` | dimension CSS concat |
| `box_shadow_box_shadow.*` | `number\|string` | shadow CSS concat |
| `gap.size/column/row` | `number` | container gap concat |

### Universal Suffix-Pattern Matching
Instead of brittle enumeration of responsive variants, the contract strips `_(tablet|mobile)$` to test against base sets, making it 100% future-proof against any responsive breakpoint.

### Pre-Import Verification Commands
```bash
# Verify link & URL scalars across all corpus outputs and templates:
node tests/check-c10.js

# Verify full scalar contract (with synthetic negative violation detection):
node tests/check-c11.js

# Audit any specific compiled template before importing to WordPress:
node tests/check-c11.js path/to/template.json
```

---

## 8. Universal Guardrails & Visual Parity ("Never Again" Spec v3.6)

### The 9 Universal Guardrails (G1–G9)
1. **G1: Factory Input Contract**: Every widget factory accepts canonical shapes, nested objects, or shorthand aliases (`url`, `src`, `link`, `href`, `icon`, `selected_icon`, scalar padding/margin) and safely normalizes them to valid Elementor Free schema.
2. **G2: Measured Container Layouts**: Direct children of flex-row / grid containers receive measured percentage widths (`width: { unit: '%', size: pct }`), `_flex_size: 'none'`, and `flex_shrink: 0` derived from Chromium computed truth.
3. **G3: Kebab-Case Emitted CSS**: All properties emitted into micro-CSS or R2 scoped healing are formatted strictly via `toKebabCss(prop)` — zero camelCase properties.
4. **G4: Micro-CSS Routing Filter**: Only pseudo-classes (`:hover`, `:active`), pseudo-elements (`::before`), dynamic state classes (`.is-active`, `.is-open`), and non-representable CSS (`transform`, `backdrop-filter`, `clip-path`) are emitted into micro-CSS. Representable properties on base selectors are 100% routed to Elementor native settings (R1).
5. **G5: Stylesheet Purification**: `:root` variable blocks and dead grid properties (`display: grid`, `grid-template-*`) are permanently dropped from the emitted stylesheet engine. Empty rule blocks are never emitted.
6. **G6: Fluid Container Protocol**: Containers NEVER emit fixed CSS `height > 60px`. They use `min_height` and content fluidity, eliminating overflow clipping.
7. **G7: Behavior Delegation & DOM-Ready Lifecycle**: Inline scripts run via an asynchronous `DOMContentLoaded` polyfill that executes immediately if `document.readyState !== 'loading'`. Dynamic accordions and disclosures proxy `parentElement` and use delegated event handling to bridge Elementor wrapper containers cleanly.
8. **G8: Gradient Text Fallback**: Heading widgets with transparent text and background-clip gradients receive a solid high-contrast fallback color (`#111827`) to guarantee text is never invisible.
9. **G9: Calibrated Convergence & Verification**: Verification Matrix treats deltas on representable properties as actionable R1 defects. Non-negotiable critical checks (`EMPTY_ASSET_URL`, `INVISIBLE_TEXT`, `LAYOUT_TOPOLOGY_MISMATCH`) unconditionally block convergence.

### Asset Pipeline & CLI Flag
```bash
# Prefix relative assets (images and background-images) with a base origin:
node bin/cli.js input.html output.json --assets-base https://example.com/assets/
```

### Complete Checkpoint Suite
- `npm run test:c8`: Editability-First Contract (native widgets >= 90%, zero representable in R2).
- `npm run test:c9`: Space Between Widgets unwrap check.
- `npm run test:c10`: Link & Media URL scalar verification.
- `npm run test:c11`: Full scalar contract verification & synthetic negative injection test.
- `npm run test:c12`: Micro-CSS & R2 purification audit (kebab-case, zero :root, zero dead grid, R2 cap <= 40).
- `npm run test:c13`: Factory input contract fuzzing across all widget factories.



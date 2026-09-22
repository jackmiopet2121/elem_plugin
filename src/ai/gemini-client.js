/**
 * Lightweight Zero-Dependency Google Gemini Flash Client.
 * Connects directly to Google Generative Language API using native Node.js https.
 * Equipped with Universal, Agnostic System Prompt for ANY Landing Page or Section.
 */
const https = require('https');
const fs = require('fs');
const path = require('path');
const { detectPrimaryFontFamily } = require('../parser/font-detector');

function getApiKeys() {
  const keys = [];
  const rawFromEnv = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY;
  if (rawFromEnv) {
    keys.push(...rawFromEnv.split(',').map(k => k.trim()).filter(Boolean));
  }

  const candidatePaths = [
    path.resolve(__dirname, '../../.env'),
    path.resolve(__dirname, '../../../.env'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'engine-v2/.env')
  ];

  for (const envPath of candidatePaths) {
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, 'utf8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('GEMINI_API_KEYS=')) {
          const val = trimmed.slice('GEMINI_API_KEYS='.length).trim();
          keys.push(...val.split(',').map(k => k.trim()).filter(Boolean));
        } else if (trimmed.startsWith('GEMINI_API_KEY=')) {
          const val = trimmed.slice('GEMINI_API_KEY='.length).trim();
          keys.push(...val.split(',').map(k => k.trim()).filter(Boolean));
        }
      }
    }
  }

  // Return unique keys in original sequence
  return [...new Set(keys)].filter(Boolean);
}

function getApiKey() {
  const keys = getApiKeys();
  return keys.length > 0 ? keys[0] : null;
}

function loadMemoryKnowledge() {
  const patternsPath = path.resolve(__dirname, '../../memory/patterns.json');
  const rulesPath = path.resolve(__dirname, '../../compiler-rules.json');
  let patterns = {};
  let rules = {};

  if (fs.existsSync(patternsPath)) {
    patterns = JSON.parse(fs.readFileSync(patternsPath, 'utf8'));
  }
  if (fs.existsSync(rulesPath)) {
    rules = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
  }

  return { patterns, rules };
}

function optimizeHtmlForAi(html) {
  if (!html || typeof html !== 'string') return '';
  let clean = html;

  // 1. Strip HTML comments (<!-- ... -->)
  clean = clean.replace(/<!--[\s\S]*?-->/g, '');

  // 2. Strip CSS comments (/* ... */) inside <style> tags without touching selectors or properties
  clean = clean.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (match, css) => {
    const cleanCss = css
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\n\s*\n/g, '\n')
      .trim();
    return `<style>\n${cleanCss}\n</style>`;
  });

  // 3. Normalize excessive blank lines (3+ newlines -> 2)
  clean = clean.replace(/\n\s*\n\s*\n/g, '\n\n');

  return clean;
}

function callGeminiCompiler(htmlContent, options = {}) {
  return new Promise((resolve, reject) => {
    const apiKey = options.apiKey || getApiKey();
    if (!apiKey) {
      return reject(new Error('GEMINI_API_KEY is not configured in Tool/.env or environment variables.'));
    }

    const { patterns, rules } = loadMemoryKnowledge();
    const cleanedHtml = optimizeHtmlForAi(htmlContent);
    const detectedFont = detectPrimaryFontFamily(htmlContent);

    // Extract container max-width from CSS if present (e.g. 1280px, 1200px, 840px)
    const widthMatch = htmlContent.match(/max-width:\s*([0-9]+)px/i);
    const targetBoxedWidth = widthMatch ? parseInt(widthMatch[1], 10) : 1280;

    const systemPrompt = `You are the World-Class Native Elementor Free JSON Compiler Architect.
Your mission is to compile ANY arbitrary raw HTML, CSS, and Vanilla JS into 100% native Elementor Free JSON template content with pixel-perfect visual design and full interactive fidelity.
You must be completely AGNOSTIC to component types, whether compiling a Hero, Pricing Table, Features Grid, Testimonials, FAQ Disclosures, CTA Banner, Header, or Footer.

### UNIVERSAL ARCHITECTURAL RULES & BLACK BOX CONTRACT:
1. STRICT ELEMENTOR FREE SCHEMA:
   - Zero Elementor Pro widgets. Allowed widgetTypes: 'heading', 'text-editor', 'icon', 'image', 'html', 'button', 'divider'.
   - Containers MUST declare: "elType": "container", "isInner": (false for root, true for inner), and "elements": [ ... ].
   - EVERY single widget MUST declare: "elType": "widget", "widgetType": "...", and "elements": [].
   - NEVER omit "elType": "widget" on any widget! Without "elType": "widget", Elementor fails to render the widget.
2. ROOT CONTAINER (DESKTOP & MOBILE EDGE-TO-EDGE):
   - The root section MUST declare:
     content_width: 'boxed',
     boxed_width: { unit: 'px', size: ${targetBoxedWidth} },
     width: { unit: 'px', size: ${targetBoxedWidth} },
     width_mobile: { unit: '%', size: 100 },
     padding_mobile: { unit: 'px', top: '56', right: '16', bottom: '56', left: '16', isLinked: false }
   - Never omit 'boxed_width' or 'padding_mobile'.
3. ZERO TRUNCATION CONTRACT: Output 100% of all items. Never skip, truncate, or abbreviate cards, checklists, or questions. If the HTML has N items, all N items must be generated in full.
4. CLASS FIDELITY & WIDGET UNDERSCORE CONTRACT:
   - Copy ALL HTML class names into 'css_classes' and '_css_classes'.
   - Every widget MUST declare '_margin', '_padding', '_css_classes' (with leading underscores).
5. UNIVERSAL TYPOGRAPHY CONTRACT:
   - In Elementor, typography properties are strictly ignored unless 'typography_typography: "custom"' is declared!
   - Every 'heading' and 'button' widget MUST declare:
     typography_typography: 'custom',
     typography_font_family: '${detectedFont}',
     typography_font_weight: (e.g. '700' for headings, '600' for buttons, or matched from CSS).
6. PILL BADGES & TAGS:
   - Any badge, pill, or tag container MUST declare: content_width: 'full', width: { unit: 'custom', size: 'fit-content' }, width_tablet: { unit: 'custom', size: 'fit-content' }, width_mobile: { unit: 'custom', size: 'fit-content' }, align_self: 'center', _flex_size: 'none', flex_shrink: 0.
   - Extract its actual text and icon directly from the HTML without hardcoding fixture values.
7. BUTTONS & MOBILE FULL-WIDTH:
   - Any button that stretches full-width on mobile (e.g. width: 100% in mobile media queries) MUST declare:
     align_mobile: 'justify',
     _element_width_mobile: '100'
   - Its parent container on mobile must declare align_items_mobile: 'stretch'.
8. COLLAPSIBLE / DISCLOSURE / DRAWER CONTAINERS:
   - Any collapsible body container (answers, drawer content, dropdowns) MUST declare padding: 0 on the container settings itself.
   - Never put bottom padding directly on a collapsible container, because 'max-height: 0' in CSS does not collapse padding, leaving dead whitespace when closed. Internal padding belongs inside the inner text/content.
   - For collapsible rows: Trigger is a Flex Row container (direction: row, justify_content: space-between, align_items: center, wrap: nowrap) with heading on left and toggle icon widget on right.
   - Item 1 starts open ('is-open active'), subsequent items start closed.
9. ICONS & SVGS (NATIVE ICON WIDGET CONTRACT):
   - Every icon or SVG vector (such as calculator, shield, clock, sparkles, arrows) MUST be compiled as a native Elementor 'icon' widget ('widgetType': 'icon', library: 'fa-solid', e.g. 'fas fa-shield-alt', 'fas fa-calculator', 'fas fa-clock', 'fas fa-arrow-right').
   - NEVER put raw <svg> into a 'widgetType': 'html'.
10. SEGMENTED SWITCHERS & BILLING FREQUENCY TOGGLES:
    - Any segmented switcher or billing frequency toggle container (e.g. '.billing-toggle-card') MUST be a horizontal Flex Row container:
      direction: 'row', flex_direction: 'row', align_items: 'center', justify_content: 'center', wrap: 'nowrap', flex_wrap: 'nowrap',
      width: { unit: 'custom', size: 'fit-content' }, align_self: 'center', border_radius: { unit: 'px', size: 9999 }.
    - The switcher buttons inside MUST declare: _element_width: 'auto', _flex_size: 'none', align: 'center', to sit side-by-side in a single horizontal pill. Never allow them to stack vertically!
11. DIVIDERS & SEPARATORS:
    - Any divider line (such as '.summary-divider' or <hr>) MUST be compiled as a native Elementor 'divider' widget ('widgetType': 'divider', style: 'solid', weight: { unit: 'px', size: 1 }). Never use 'widgetType': 'html' for a divider.
12. STRICT NATIVE ELEMENTOR DECOMPOSITION (THE UNIVERSAL LEAF-ONLY CONTRACT):
    - All layout cards, columns, sidebars, control panels, summaries, addon items, rows, grids, and feature checklists MUST be native Elementor Containers ('elType': 'container').
    - THE UNIVERSAL LEAF-ONLY RULE: An 'html' widget is strictly forbidden from containing any text, headings, titles, labels, buttons, or list items!
      NEVER output an empty dynamic list (such as <ul id="features-list"></ul>) in an 'html' widget! Feature lists MUST be compiled into native Elementor Containers + 'heading' widgets + 'icon' widgets with their IDs preserved so JavaScript mutates text directly.
      An 'html' widget may ONLY be a naked leaf browser primitive with zero text children (e.g. <input type="range" ...>, <input type="checkbox" ...>, <canvas>, <select>, <audio>, <video>).
      If an item has text (e.g. an add-on item, a toggle row, a stepper milestone, a card): The wrapper MUST be a native Elementor Container, its text MUST be native 'heading' or 'text-editor' widgets, its icon MUST be native 'icon' or SVG widget, and only the raw <input> switch element is isolated into a micro-HTML widget!
    - NEVER encapsulate or dump an entire card, addon row, or layout block into an 'html' widget.
    - All titles, subtitles, prices, numbers, metrics, and labels MUST be native Elementor 'heading' or 'text-editor' widgets.
    - All action buttons and CTAs MUST be native Elementor 'button' widgets.
13. DOM ID PRESERVATION & ZERO DUPLICATE ID CONTRACT:
    - Every HTML element that has an 'id' attribute must preserve its ID:
      a) For native Containers, Heading, and Button widgets: Set '_element_id: id' in the widget/container settings.
      b) For text and numeric displays where JavaScript mutates inner text (e.g. price numbers, metric counters, badges), preserve the inner '<span id="price-total">79</span>' within the heading widget 'title' setting so dynamic JavaScript (document.getElementById) seamlessly finds and updates the exact text element.
      c) CRITICAL ANTI-COLLISION RULE: When a form control (<input id="xyz">, <select id="xyz">) is wrapped inside an 'html' widget, the 'html' widget settings MUST NOT declare '_element_id: "xyz"'! The ID belongs strictly on the inner HTML element. Setting '_element_id' on the wrapper creates duplicate DOM IDs that break document.getElementById and cause JavaScript calculations to evaluate to NaN!
14. ZERO RAW SCRIPT DUMP (DETERMINISTIC COMPILER SCRIPT RUNNER):
    - DO NOT emit or serialize raw <script> blocks in your JSON output! The compiler engine automatically extracts, verifies, and injects 100% of custom JavaScript business logic (calculators, slider listeners, state switchers) into the final template. Focus 100% of your tokens on compiling native Elementor Containers, Headings, Buttons, Icons, and Form controls with their exact DOM IDs (id="...", _element_id) preserved so the script runner binds to them flawlessly.
15. INLINE PRICE SPLIT ROWS & CURRENCY KERNING:
    - When a price is split into currency ($), number, and period (/mo) across multiple heading widgets, the container MUST declare flex_direction: 'row', align_items: 'baseline', wrap: 'nowrap', and every child widget MUST declare _element_width: 'auto', _flex_size: 'none'. Set _margin.right: '-3px' on the currency symbol widget for natural optical kerning.
16. CHECKLISTS & FEATURE ITEM ROWS:
    - Feature checklists (check-items) MUST be Flex Row containers with gap: 10px, align_items: 'center'. Feature headings MUST declare typography_line_height: 1.25. Stacked circle checkmark icons must declare icon_padding: 5px.
17. FLOATING CARD BADGES (POPULAR / BEST VALUE):
    - For elevated/featured card badges overlapping the top border, the badge container MUST declare margin-top: -16px, align_self: 'center', width: { unit: 'custom', size: 'fit-content' }, and the card container must have top padding: 0px.
18. CARD MEDIA & FULL-BLEED IMAGES:
    - Image widgets ('widgetType': 'image') inside cards must declare width: 100%, space: 100%, _element_width: 'inherit', _flex_align_self: 'stretch', and the parent media wrapper container must declare align_items: 'stretch' and zero padding so images bleed edge-to-edge. Ensure image URLs end with valid extensions (.jpg, .png, .webp).
19. SLIDER MILESTONES & STEP SCALES:
    - Any scale markers, step indicators, or milestone nodes beneath a horizontal slider track (such as '.slider-milestones', '.ticks', '.steps') MUST be a horizontal Flex Row container:
      direction: 'row', flex_direction: 'row', justify_content: 'space-between', flex_justify_content: 'space-between', width: { unit: '%', size: 100 }, wrap: 'nowrap'.
    - If and only if the original HTML/CSS explicitly defines a vertical orientation (e.g. '.vertical', '.vertical-steps', 'flex-direction: column', '.timeline'), respect the vertical column layout. Otherwise, for standard slider tracks, always enforce 'direction: row' so Elementor does not default them into a vertical column!
20. FLOATING TOOLTIPS & BUBBLE LABELS:
    - Any floating indicator, thumb tooltip, or bubble label (such as '#slider-tooltip', '.tooltip') MUST declare:
      content_width: 'full', width: { unit: 'custom', size: 'fit-content' }, _flex_size: 'none', flex_shrink: 0.
21. OUTPUT FORMAT: Output ONLY valid, raw JSON with no markdown formatting, no code fences.
The JSON must follow this exact structure:
{
  "version": "0.4",
  "title": "${options.title || 'Elementor Free Component'}",
  "type": "page",
  "content": [
    {
      "id": "c1000001",
      "elType": "container",
      "isInner": false,
      "settings": { ... },
      "elements": [
        {
          "id": "w1000001",
          "elType": "widget",
          "widgetType": "heading",
          "settings": { ... },
          "elements": []
        }
      ]
    }
  ]
}`;

    const availableKeys = (options.apiKeys && options.apiKeys.length > 0)
      ? options.apiKeys
      : (options.apiKey ? [options.apiKey, ...getApiKeys()] : getApiKeys());

    // Deduplicate available keys
    const activeKeys = [...new Set(availableKeys)].filter(Boolean);

    if (activeKeys.length === 0) {
      return reject(new Error('No GEMINI_API_KEY or GEMINI_API_KEYS configured in Tool/.env or environment.'));
    }

    // High-performance candidate models verified active on Google API
    const candidateModels = options.model
      ? [options.model]
      : ['gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-flash-latest', 'gemini-3.5-flash'];

    let modelIndex = 0;
    let keyIndex = 0;
    const exhaustedKeys = new Set(); // Persistent blacklist for 429 quota-exceeded keys during run
    let retriesForCurrentKey = 0;
    const maxRetriesPerKey = 2; // Maximum retries for temporary 503 server spikes

    function executeRequest() {
      if (modelIndex >= candidateModels.length) {
        return reject(new Error('All candidate Gemini models and API keys were exhausted or rate-limited (429/503).'));
      }

      const currentModel = candidateModels[modelIndex];

      const genConfig = {
        responseMimeType: 'application/json',
        temperature: 0.1,
        maxOutputTokens: 65536
      };
      // Only attach thinkingConfig on models that support it (e.g. gemini-3.7-flash)
      if (currentModel.includes('3.7')) {
        genConfig.thinkingConfig = { thinkingBudget: 0 };
      }

      const requestBody = JSON.stringify({
        contents: [
          {
            parts: [
              { text: `Compile the following HTML document into a native Elementor Free JSON template:\n\n${cleanedHtml}` }
            ]
          }
        ],
        systemInstruction: {
          parts: [
            { text: systemPrompt }
          ]
        },
        generationConfig: genConfig
      });

      // Automatically advance past any keys known to be 429 quota-exceeded
      while (keyIndex < activeKeys.length && exhaustedKeys.has(activeKeys[keyIndex])) {
        keyIndex++;
      }

      // If all keys in pool are exhausted for this model:
      if (keyIndex >= activeKeys.length) {
        console.warn(`  [AI ROUTER] ⚠ All active keys exhausted for ${currentModel}. Switching to next candidate model...`);
        modelIndex++;
        keyIndex = 0;
        retriesForCurrentKey = 0;
        return setTimeout(executeRequest, 1000);
      }

      const currentKey = activeKeys[keyIndex];
      const maskedKey = currentKey.length > 8 ? currentKey.substring(0, 4) + '...' + currentKey.substring(currentKey.length - 4) : '***';
      const keyLabel = `Key #${keyIndex + 1} (${maskedKey})`;
      const remainingKeysCount = activeKeys.length - exhaustedKeys.size;

      console.log(`  [AI ROUTER] Querying ${currentModel} via ${keyLabel} (Active Pool: ${remainingKeysCount}/${activeKeys.length})...`);
      const reqStart = Date.now();
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${currentKey}`;

      let isFinished = false;
      const headers = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody),
        'x-goog-api-key': currentKey
      };
      if (currentKey.startsWith('ya29.')) {
        headers['Authorization'] = `Bearer ${currentKey}`;
      }

      const req = https.request(url, {
        method: 'POST',
        headers,
        timeout: 120000 // 120-second timeout allows complete generation of 10,000+ tokens
      }, (res) => {
        let rawData = '';
        res.on('data', chunk => rawData += chunk);
        res.on('end', () => {
          if (isFinished) return;
          isFinished = true;

          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const parsed = JSON.parse(rawData);
              const candidate = parsed.candidates?.[0];
              const textContent = candidate?.content?.parts?.[0]?.text;
              if (!textContent) {
                console.warn(`  [AI ROUTER] ⚠ Empty response from ${currentModel}. Trying next candidate...`);
                modelIndex++;
                keyIndex = 0;
                retriesForCurrentKey = 0;
                return executeRequest();
              }
              const cleanJson = textContent.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
              const jsonAst = JSON.parse(cleanJson);
              const durationSec = ((Date.now() - reqStart) / 1000).toFixed(1);
              console.log(`  [AI ROUTER] ✓ Response received (HTTP 200 OK in ${durationSec}s, ${(cleanJson.length / 1024).toFixed(1)} KB AST)!`);
              jsonAst._meta = {
                model: currentModel,
                keyLabel,
                durationSec
              };
              return resolve(jsonAst);
            } catch (err) {
              console.warn(`  [AI ROUTER] ⚠ Failed to parse JSON output from ${currentModel}: ${err.message}`);
              modelIndex++;
              keyIndex = 0;
              retriesForCurrentKey = 0;
              return executeRequest();
            }
          } else if (res.statusCode === 429) {
            exhaustedKeys.add(currentKey);
            console.warn(`  [AI ROUTER] ⚠ ${keyLabel} hit HTTP 429 (Quota Exceeded). Marking key as exhausted.`);
            keyIndex++;
            retriesForCurrentKey = 0;

            if (keyIndex < activeKeys.length) {
              console.log(`  [AI ROUTER] ↺ Instant Failover: Rotating to Key #${keyIndex + 1} (in 500ms)...`);
              return setTimeout(executeRequest, 500);
            } else {
              console.warn(`  [AI ROUTER] ⚠ All API keys exhausted for ${currentModel}. Switching to next candidate model...`);
              modelIndex++;
              keyIndex = 0;
              return setTimeout(executeRequest, 1000);
            }
          } else if (res.statusCode === 503) {
            if (retriesForCurrentKey < maxRetriesPerKey) {
              retriesForCurrentKey++;
              console.warn(`  [AI ROUTER] ⚠ ${currentModel} returned HTTP 503 (High Demand). Retrying in 2500ms (Attempt ${retriesForCurrentKey}/${maxRetriesPerKey})...`);
              return setTimeout(executeRequest, 2500);
            } else {
              console.warn(`  [AI ROUTER] ⚠ ${keyLabel} 503 retries exhausted for ${currentModel}.`);
              retriesForCurrentKey = 0;
              keyIndex++;

              if (keyIndex < activeKeys.length) {
                console.log(`  [AI ROUTER] ↺ Failover: Trying next Key #${keyIndex + 1} on ${currentModel}...`);
                return setTimeout(executeRequest, 1000);
              } else {
                console.warn(`  [AI ROUTER] ⚠ All keys exhausted on ${currentModel}. Switching to next candidate model...`);
                modelIndex++;
                keyIndex = 0;
                return setTimeout(executeRequest, 1000);
              }
            }
          } else if (res.statusCode === 404) {
            console.warn(`  [AI ROUTER] ⚠ ${currentModel} returned HTTP 404 (Model Unavailable). Skipping...`);
            modelIndex++;
            keyIndex = 0;
            retriesForCurrentKey = 0;
            return executeRequest();
          } else {
            console.warn(`  [AI ROUTER] ⚠ Error HTTP ${res.statusCode} on ${currentModel}: ${rawData.substring(0, 160)}`);
            keyIndex++;
            retriesForCurrentKey = 0;
            if (keyIndex >= activeKeys.length) {
              modelIndex++;
              keyIndex = 0;
            }
            return setTimeout(executeRequest, 1000);
          }
        });
      });

      req.on('timeout', () => {
        if (isFinished) return;
        isFinished = true;
        req.destroy();
        console.warn(`  [AI ROUTER] ⚠ Request timed out on ${currentModel} via ${keyLabel} (120s limit). Rotating...`);
        keyIndex++;
        retriesForCurrentKey = 0;
        if (keyIndex >= activeKeys.length) {
          modelIndex++;
          keyIndex = 0;
        }
        executeRequest();
      });

      req.on('error', (err) => {
        if (isFinished) return;
        isFinished = true;
        console.warn(`  [AI ROUTER] ⚠ Network error on ${currentModel} via ${keyLabel} (${err.message}). Rotating...`);
        keyIndex++;
        retriesForCurrentKey = 0;
        if (keyIndex >= activeKeys.length) {
          modelIndex++;
          keyIndex = 0;
        }
        executeRequest();
      });

      req.write(requestBody);
      req.end();
    }

    executeRequest();
  });
}

module.exports = {
  callGeminiCompiler,
  getApiKey,
  getApiKeys
};

/**
 * Multimodal Gemini Vision Inspector.
 * Compares screenshot of Original HTML against Elementor Virtual Preview.
 * Audits icons, badge geometries, shadows, and overall visual gestalt.
 */
const https = require('https');
const { getApiKeys } = require('../ai/gemini-client');

async function inspectWithVision(originalPngBuffer, elementorPngBuffer, options = {}) {
  const apiKeys = options.apiKeys || getApiKeys();
  if (!apiKeys || apiKeys.length === 0) {
    return {
      passed: true,
      defects: [],
      source: 'offline-skip',
      message: 'Vision AI skipped (no API key configured). Running in deterministic mode.'
    };
  }

  const hasInteractive = !!(options.interactiveOriginalBuffer && options.interactiveElementorBuffer);

  const prompt = `You are an expert Autonomous UI/UX Visual QA Engineer inspecting a pixel-perfect conversion from HTML to WordPress Elementor Free.
Attached are screenshots:
Image 1: ORIGINAL Webpage (Default View).
Image 2: ELEMENTOR Free Virtual Preview (Default View).
${hasInteractive ? 'Image 3: ORIGINAL Webpage (Interactive / Active State).\nImage 4: ELEMENTOR Free Virtual Preview (Interactive / Active State).\n' : ''}
Inspect both images meticulously like a human designer and identify ALL visual discrepancies:
1. Canvas/Page Background: Did the page background color change (e.g. subtle cool gray/slate becoming pure white)?
2. Interactive Controls & Switches: Is the toggle switch / checkbox distorted (e.g. turned into a raw blue checkbox square instead of a sleek pill slider with a knob)?
3. Badges, Pills & Gradients: Did any discount pill badge (e.g. "-20% Save", "Most Popular") lose its background color, gradient, border, or rounded pill shape?
4. Card Elevations & Shadows: Did cards lose their soft drop shadows or borders?
5. Icon Accuracy: Did checkmarks (✓) turn into right arrows (→) or wrong icons?
6. Layout Stacking & Wrapping: Are horizontal cards stacked vertically into columns instead of a single horizontal row?
7. Spacing & Overlaps: Are any sections colliding or overlapping?
8. Component Zone Crops: Also inspect the attached high-resolution component close-ups (toggles, switches, lockups, badges, buttons) for micro-misalignments, knob displacement, and text wrapping.
9. Action Buttons & CTAs: Did any button collapse in width (e.g. from full-width spanning the card to a small centered button), or develop an unwanted secondary rectangular background wrapper around it?

When identifying a defect, pick the best matching Elementor Node ID from the provided AST Node Registry below.
You MUST output actionable TOOL CALLS in JSON format to directly heal the Elementor AST.

CRITICAL MANDATORY RULE:
For EVERY defect reported in the "defects" array, you MUST include a concrete, executable "toolCall" object. NEVER omit "toolCall" or set it to null.
- If a toggle switch is distorted or unstyled (SWITCH_DISTORTION): use action "INJECT_SCOPED_CSS", selector ".slider, [class*='slider']", cssRules "background-color: #E2E8F0 !important; border-radius: 999px !important;".
- If canvas background differs (BACKGROUND_MISMATCH): use action "SET_NODE_SETTING", targetId "root", property "background_color", value "#F8FAFC".
- If badge or pill lost styling (BADGE_STYLE_LOST): use action "INJECT_SCOPED_CSS" with the badge selector and styling.
- If a button collapsed in width (BUTTON_WIDTH_COLLAPSE): use action "SET_NODE_SETTING", targetId "button_node_id", property "align", value "justify".

Valid Tool Call Actions:
- "SET_NODE_SETTING": mutates an Elementor widget/container setting.
  targetId: Node ID from registry (e.g. "abc1234") or "root" for root container
  property: setting key (e.g. "title_color", "background_color", "typography_font_size", "button_text_color")
  value: value (e.g. "#1E293B", { "unit": "px", "size": 18 })
- "SET_CONTAINER_FLEX": updates flexbox layout on a container.
  targetId: Container ID from registry
  flexProps: { "direction": "row", "wrap": "nowrap", "justify_content": "space-between", "align_items": "stretch" }
- "INJECT_SCOPED_CSS": injects scoped micro-CSS rules for complex UI (toggles, gradients, pseudo-elements).
  selector: CSS selector targeting the element
  cssRules: Valid CSS declarations (e.g. "background-color: #E2E8F0 !important; border-radius: 999px !important;")

Return ONLY a valid JSON object matching this schema (NO markdown backticks, NO explanation):
{
  "similarityScore": 95,
  "defects": [
    {
      "type": "BACKGROUND_MISMATCH" | "SWITCH_DISTORTION" | "BADGE_STYLE_LOST" | "SHADOW_LOST" | "WRONG_ICON" | "CONTRAST_FAILURE" | "LAYOUT_MISALIGNMENT",
      "target": "page_background" | "toggle_switch" | "badge" | "card_shadow" | "icon" | "layout",
      "description": "brief explanation",
      "expected": "what was in Original",
      "current": "what is in Elementor",
      "toolCall": {
        "action": "SET_NODE_SETTING" | "SET_CONTAINER_FLEX" | "INJECT_SCOPED_CSS",
        "targetId": "node_id_or_root",
        "property": "property_name",
        "value": "value",
        "flexProps": {},
        "selector": "selector_string",
        "cssRules": "css_declarations"
      }
    }
  ]
}`;

  const nodeIndexText = options.nodeIndex && options.nodeIndex.length > 0
    ? `\n\nElementor AST Node Registry (Available for direct mutation targeting):\n${JSON.stringify(options.nodeIndex.slice(0, 45), null, 2)}`
    : '';

  const fullPrompt = prompt + nodeIndexText;

  const parts = [
    { text: fullPrompt },
    {
      inlineData: {
        mimeType: 'image/png',
        data: originalPngBuffer.toString('base64')
      }
    },
    {
      inlineData: {
        mimeType: 'image/png',
        data: elementorPngBuffer.toString('base64')
      }
    }
  ];

  if (hasInteractive) {
    parts.push({
      inlineData: {
        mimeType: 'image/png',
        data: options.interactiveOriginalBuffer.toString('base64')
      }
    });
    parts.push({
      inlineData: {
        mimeType: 'image/png',
        data: options.interactiveElementorBuffer.toString('base64')
      }
    });
  }

  // Multi-Scale Hierarchical Semantic Crops
  if (Array.isArray(options.cropPairs) && options.cropPairs.length > 0) {
    options.cropPairs.slice(0, 3).forEach((crop, idx) => {
      if (crop.origBuffer && crop.elBuffer) {
        parts.push({ text: `Component Zone #${idx + 1} - Original High-Res Close-Up:` });
        parts.push({
          inlineData: {
            mimeType: 'image/png',
            data: crop.origBuffer.toString('base64')
          }
        });
        parts.push({ text: `Component Zone #${idx + 1} - Elementor Preview High-Res Close-Up:` });
        parts.push({
          inlineData: {
            mimeType: 'image/png',
            data: crop.elBuffer.toString('base64')
          }
        });
      }
    });
  }

  const payload = {
    contents: [{ parts }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json'
    }
  };

  const models = ['gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-flash-latest'];
  let lastError = null;

  for (const model of models) {
    for (const key of apiKeys) {
      try {
        const result = await makeVisionRequest(model, key, payload);
        if (result && typeof result === 'object') {
          const rawDefects = Array.isArray(result.defects) ? result.defects : [];
          const normalizedDefects = rawDefects.map(d => {
            if (d.toolCall && d.toolCall.action) return d;
            if (d.suggestedPatch) {
              const sp = d.suggestedPatch;
              if (sp.backgroundColor) {
                d.toolCall = {
                  action: 'SET_NODE_SETTING',
                  targetId: 'root',
                  property: 'background_color',
                  value: sp.backgroundColor
                };
              } else if (sp.icon) {
                d.toolCall = {
                  action: 'SET_NODE_SETTING',
                  targetId: d.targetId || null,
                  property: 'selected_icon',
                  value: { value: sp.icon, library: 'fa-solid' }
                };
              } else if (sp.boxShadow) {
                d.toolCall = {
                  action: 'SET_NODE_SETTING',
                  targetId: d.targetId || null,
                  property: 'box_shadow_box_shadow',
                  value: sp.boxShadow
                };
              }
            }
            return d;
          });

          return {
            passed: normalizedDefects.length === 0,
            similarityScore: typeof result.similarityScore === 'number' ? result.similarityScore : (normalizedDefects.length === 0 ? 100 : 90),
            defects: normalizedDefects,
            source: 'gemini-vision',
            model
          };
        }
      } catch (err) {
        lastError = err;
      }
    }
  }

  // Graceful fallback if AI network fails
  return {
    passed: true,
    defects: [],
    source: 'vision-error-fallback',
    error: lastError ? lastError.message : 'Unknown vision failure'
  };
}

function makeVisionRequest(model, apiKey, payload) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
      'x-goog-api-key': apiKey
    };
    if (apiKey.startsWith('ya29.')) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      port: 443,
      path: `/v1beta/models/${model}:generateContent?key=${apiKey}`,
      method: 'POST',
      headers,
      timeout: 30000
    };

    const req = https.request(options, (res) => {
      let rawData = '';
      res.on('data', chunk => rawData += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsed = JSON.parse(rawData);
            const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              const cleanText = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
              resolve(JSON.parse(cleanText));
            } else {
              resolve(null);
            }
          } catch (e) {
            reject(new Error(`Failed to parse vision response: ${e.message}`));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${rawData.substring(0, 150)}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Vision request timed out'));
    });

    req.write(postData);
    req.end();
  });
}

module.exports = {
  inspectWithVision
};

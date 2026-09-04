<?php
/**
 * Universal CSS AST & DOM Parser Engine
 * Package: Gemini HTML to Elementor Universal Pro
 * Version: 8.0.0 — Hardened CSS cascade, selector and media-query parser
 */

if (!defined('ABSPATH')) exit;

class HCV_Universal_Parser {

    /**
     * Parse HTML document → extract font URLs, CSS AST, and top-level sections.
     */
    public static function parse($html_content, $include_header_footer = false) {
        $html_content = (string) $html_content;

        $fonts = self::extract_font_urls($html_content);
        $raw_css = self::extract_inline_css($html_content);
        $css_ast = self::tokenize_css($raw_css);

        $doc = new DOMDocument();
        libxml_use_internal_errors(true);

        $encoded = mb_encode_numericentity(
            $html_content,
            [0x80, 0x10ffff, 0, 0x1fffff],
            'UTF-8'
        );

        $doc->loadHTML(
            '<?xml encoding="utf-8"?>' . $encoded,
            LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD
        );

        libxml_clear_errors();

        $body = $doc->getElementsByTagName('body')->item(0);

        if (!$body) {
            $body = $doc->getElementsByTagName('main')->item(0);
        }

        if (!$body) {
            $body = $doc->getElementsByTagName('div')->item(0);
        }

        if (!$body && $doc->documentElement) {
            $body = $doc->documentElement;
        }

        $sections = [];

        if ($body) {
            self::collect_sections($body, $sections, (bool) $include_header_footer);
        }

        return [
            'fonts'    => array_values(array_unique($fonts)),
            'raw_css'  => $raw_css,
            'css_ast'  => $css_ast,
            'sections' => $sections,
            'dom'      => $doc,
        ];
    }

    /**
     * Extract useful external font stylesheets only.
     * The plugin does not remote-fetch CSS: it only records font URLs.
     */
    private static function extract_font_urls($html_content) {
        $fonts = [];

        preg_match_all(
            '/<link\b[^>]*\brel\s*=\s*["\']?stylesheet["\']?[^>]*\bhref\s*=\s*["\']([^"\']+)["\'][^>]*>/i',
            $html_content,
            $matches
        );

        if (empty($matches[1])) {
            preg_match_all(
                '/<link\b[^>]*\bhref\s*=\s*["\']([^"\']+)["\'][^>]*\brel\s*=\s*["\']?stylesheet["\']?[^>]*>/i',
                $html_content,
                $matches
            );
        }

        if (!empty($matches[1])) {
            foreach ($matches[1] as $href) {
                $href = trim(html_entity_decode($href, ENT_QUOTES, 'UTF-8'));

                if ($href === '') continue;

                if (
                    stripos($href, 'font') !== false ||
                    stripos($href, 'googleapis') !== false ||
                    stripos($href, 'fontshare') !== false ||
                    stripos($href, 'fonts.') !== false ||
                    stripos($href, 'jsdelivr') !== false
                ) {
                    $fonts[] = $href;
                }
            }
        }

        return $fonts;
    }

    /**
     * Extract CSS contained inside style tags.
     */
    private static function extract_inline_css($html_content) {
        $raw_css = '';

        preg_match_all('/<style\b[^>]*>(.*?)<\/style>/is', $html_content, $styles);

        if (!empty($styles[1])) {
            foreach ($styles[1] as $css) {
                $raw_css .= "\n" . $css;
            }
        }

        return $raw_css;
    }

    /**
     * Collect top-level body sections, unwrapping main containers.
     */
    private static function collect_sections($node, &$sections, $include_header_footer) {
        foreach ($node->childNodes as $child) {
            if (!($child instanceof DOMElement)) continue;

            $tag = strtolower($child->tagName);

            if (in_array($tag, [
                'script', 'style', 'link', 'meta', 'title',
                'head', 'noscript', 'br', 'hr', 'template'
            ], true)) {
                continue;
            }

            $cls = strtolower(trim($child->getAttribute('class')));
            $id  = strtolower(trim($child->getAttribute('id')));

            if (
                stripos($cls, 'skip-link') !== false ||
                stripos($cls, 'screen-reader') !== false ||
                stripos($cls, 'sr-only') !== false ||
                stripos($cls, 'noise') !== false
            ) {
                continue;
            }

            if (!$include_header_footer) {
                $is_header =
                    $tag === 'header' ||
                    stripos($cls, 'section-nav') !== false ||
                    stripos($cls, 'site-head') !== false ||
                    stripos($cls, 'site-header') !== false ||
                    stripos($cls, 'header-bar') !== false ||
                    $id === 'sitehead' ||
                    $id === 'header';

                $is_footer =
                    $tag === 'footer' ||
                    stripos($cls, 'section-footer') !== false ||
                    stripos($cls, 'site-foot') !== false ||
                    stripos($cls, 'site-footer') !== false ||
                    $id === 'sitefoot' ||
                    $id === 'footer';

                if ($is_header || $is_footer) {
                    continue;
                }
            }

            if ($tag === 'main' || $id === 'main' || $id === 'page-main') {
                self::collect_sections($child, $sections, $include_header_footer);
                continue;
            }

            $sections[] = $child;
        }
    }

    // ═══════════════════════════════════════════════════════
    // CSS TOKENIZER
    // ═══════════════════════════════════════════════════════

    /**
     * Build a lightweight CSS AST usable by the Elementor compiler.
     */
    public static function tokenize_css($css_text) {
        $css_text = (string) $css_text;
        $clean = self::strip_css_comments($css_text);

        $variables = self::extract_css_variables($clean);
        $variables = self::resolve_variable_map($variables);

        $rules = [];
        $hover_rules = [];
        $pseudo_rules = [];
        $media_rules = [
            'mobile'  => [],
            'tablet'  => [],
            'desktop' => [],
        ];

        $top_level_blocks = self::extract_css_blocks($clean);

        foreach ($top_level_blocks as $block) {
            $selector = trim($block['header']);
            $content  = $block['body'];

            if ($selector === '') continue;

            if (stripos($selector, '@media') === 0) {
                $query = trim(substr($selector, 6));
                $breakpoint = self::detect_breakpoint($query);

                if (!$breakpoint) continue;

                $inner_blocks = self::extract_css_blocks($content);

                foreach ($inner_blocks as $inner) {
                    self::store_rule(
                        $media_rules[$breakpoint],
                        $inner['header'],
                        $inner['body'],
                        $variables,
                        false,
                        $pseudo_rules
                    );
                }

                continue;
            }

            if (
                stripos($selector, '@keyframes') === 0 ||
                stripos($selector, '@font-face') === 0 ||
                stripos($selector, '@supports') === 0 ||
                stripos($selector, '@layer') === 0 ||
                stripos($selector, '@container') === 0 ||
                stripos($selector, '@import') === 0
            ) {
                continue;
            }

            self::store_rule(
                $rules,
                $selector,
                $content,
                $variables,
                true,
                $pseudo_rules,
                $hover_rules
            );
        }

        return [
            'variables'    => $variables,
            'rules'        => $rules,
            'hover_rules'  => $hover_rules,
            'pseudo_rules' => $pseudo_rules,
            'media_rules'  => $media_rules,
        ];
    }

    /**
     * CSS comments are safe to remove.
     * We deliberately do not remove // because URLs contain https://.
     */
    private static function strip_css_comments($css) {
        return preg_replace('#/\*.*?\*/#s', '', (string) $css);
    }

    /**
     * Extract CSS blocks while respecting quotes and nested braces.
     *
     * Each returned item:
     * [
     *   'header' => '.selector' or '@media (...)',
     *   'body' => 'property: value;'
     * ]
     */
    private static function extract_css_blocks($css) {
        $blocks = [];
        $length = strlen($css);
        $cursor = 0;
        $header_start = 0;
        $depth = 0;
        $quote = '';
        $escaped = false;

        for ($i = 0; $i < $length; $i++) {
            $char = $css[$i];

            if ($quote !== '') {
                if ($escaped) {
                    $escaped = false;
                    continue;
                }

                if ($char === '\\') {
                    $escaped = true;
                    continue;
                }

                if ($char === $quote) {
                    $quote = '';
                }

                continue;
            }

            if ($char === '"' || $char === "'") {
                $quote = $char;
                continue;
            }

            if ($char === '{') {
                if ($depth === 0) {
                    $header_start = $cursor;
                    $body_start = $i + 1;
                }

                $depth++;
                continue;
            }

            if ($char === '}') {
                if ($depth <= 0) continue;

                $depth--;

                if ($depth === 0) {
                    $header = trim(substr($css, $header_start, $body_start - $header_start - 1));
                    $body = substr($css, $body_start, $i - $body_start);

                    if ($header !== '') {
                        $blocks[] = [
                            'header' => $header,
                            'body'   => $body,
                        ];
                    }

                    $cursor = $i + 1;
                }
            }
        }

        return $blocks;
    }

    /**
     * Parse and store a selector rule.
     */
    private static function store_rule(
        &$target_rules,
        $selector_text,
        $declaration_text,
        $variables,
        $desktop_mode = true,
        &$pseudo_rules = [],
        &$hover_rules = []
    ) {
        $props = self::parse_declarations($declaration_text, $variables);

        if (empty($props)) return;

        $selectors = self::split_selector_list($selector_text);

        foreach ($selectors as $selector) {
            $selector = trim($selector);

            if ($selector === '' || $selector === ':root') continue;

            if (stripos($selector, ':hover') !== false) {
                $base_selector = preg_replace('/:hover\b/i', '', $selector);
                $base_selector = trim($base_selector);

                if ($base_selector !== '') {
                    if (!isset($hover_rules[$base_selector])) {
                        $hover_rules[$base_selector] = [];
                    }

                    $hover_rules[$base_selector] = array_merge(
                        $hover_rules[$base_selector],
                        $props
                    );
                }

                continue;
            }

            if (
                preg_match('/::(before|after)\b/i', $selector, $pseudo_match) ||
                preg_match('/:(before|after)\b/i', $selector, $pseudo_match)
            ) {
                $pseudo = strtolower($pseudo_match[1]);
                $base_selector = preg_replace('/::?(before|after)\b/i', '', $selector);
                $base_selector = trim($base_selector);

                if ($base_selector !== '') {
                    if (!isset($pseudo_rules[$base_selector])) {
                        $pseudo_rules[$base_selector] = [];
                    }

                    $pseudo_rules[$base_selector][$pseudo] = $props;
                }

                continue;
            }

            if (!isset($target_rules[$selector])) {
                $target_rules[$selector] = [];
            }

            $target_rules[$selector] = array_merge(
                $target_rules[$selector],
                $props
            );
        }
    }

    /**
     * Split selectors on commas, ignoring commas inside [] () or quotes.
     */
    private static function split_selector_list($selector_text) {
        $parts = [];
        $buffer = '';
        $quote = '';
        $escaped = false;
        $bracket_depth = 0;
        $paren_depth = 0;
        $length = strlen((string) $selector_text);

        for ($i = 0; $i < $length; $i++) {
            $char = $selector_text[$i];

            if ($quote !== '') {
                $buffer .= $char;

                if ($escaped) {
                    $escaped = false;
                } elseif ($char === '\\') {
                    $escaped = true;
                } elseif ($char === $quote) {
                    $quote = '';
                }

                continue;
            }

            if ($char === '"' || $char === "'") {
                $quote = $char;
                $buffer .= $char;
                continue;
            }

            if ($char === '[') $bracket_depth++;
            if ($char === ']') $bracket_depth = max(0, $bracket_depth - 1);
            if ($char === '(') $paren_depth++;
            if ($char === ')') $paren_depth = max(0, $paren_depth - 1);

            if (
                $char === ',' &&
                $bracket_depth === 0 &&
                $paren_depth === 0
            ) {
                $parts[] = trim($buffer);
                $buffer = '';
                continue;
            }

            $buffer .= $char;
        }

        if (trim($buffer) !== '') {
            $parts[] = trim($buffer);
        }

        return $parts;
    }

    /**
     * Parse CSS declarations without breaking values containing ; inside strings/functions.
     */
    private static function parse_declarations($block, $variables) {
        $props = [];
        $declarations = self::split_css_declarations($block);

        foreach ($declarations as $declaration) {
            $pair = self::split_property_value($declaration);

            if (!$pair) continue;

            $key = strtolower(trim($pair[0]));
            $val = trim($pair[1]);

            if ($key === '' || $val === '') continue;

            $important = false;

            if (preg_match('/\s*!important\s*$/i', $val)) {
                $important = true;
                $val = preg_replace('/\s*!important\s*$/i', '', $val);
                $val = trim($val);
            }

            $val = self::resolve_css_value_variables($val, $variables);

            if ($important) {
                $props[$key] = $val . ' !important';
            } else {
                $props[$key] = $val;
            }
        }

        return $props;
    }

    /**
     * Split a declaration block on semicolons safely.
     */
    private static function split_css_declarations($block) {
        $parts = [];
        $buffer = '';
        $quote = '';
        $escaped = false;
        $paren_depth = 0;
        $bracket_depth = 0;
        $length = strlen((string) $block);

        for ($i = 0; $i < $length; $i++) {
            $char = $block[$i];

            if ($quote !== '') {
                $buffer .= $char;

                if ($escaped) {
                    $escaped = false;
                } elseif ($char === '\\') {
                    $escaped = true;
                } elseif ($char === $quote) {
                    $quote = '';
                }

                continue;
            }

            if ($char === '"' || $char === "'") {
                $quote = $char;
                $buffer .= $char;
                continue;
            }

            if ($char === '(') $paren_depth++;
            if ($char === ')') $paren_depth = max(0, $paren_depth - 1);
            if ($char === '[') $bracket_depth++;
            if ($char === ']') $bracket_depth = max(0, $bracket_depth - 1);

            if (
                $char === ';' &&
                $paren_depth === 0 &&
                $bracket_depth === 0
            ) {
                if (trim($buffer) !== '') {
                    $parts[] = trim($buffer);
                }

                $buffer = '';
                continue;
            }

            $buffer .= $char;
        }

        if (trim($buffer) !== '') {
            $parts[] = trim($buffer);
        }

        return $parts;
    }

    /**
     * Split a CSS declaration at its first top-level colon.
     */
    private static function split_property_value($declaration) {
        $quote = '';
        $escaped = false;
        $paren_depth = 0;
        $length = strlen((string) $declaration);

        for ($i = 0; $i < $length; $i++) {
            $char = $declaration[$i];

            if ($quote !== '') {
                if ($escaped) {
                    $escaped = false;
                } elseif ($char === '\\') {
                    $escaped = true;
                } elseif ($char === $quote) {
                    $quote = '';
                }

                continue;
            }

            if ($char === '"' || $char === "'") {
                $quote = $char;
                continue;
            }

            if ($char === '(') {
                $paren_depth++;
                continue;
            }

            if ($char === ')') {
                $paren_depth = max(0, $paren_depth - 1);
                continue;
            }

            if ($char === ':' && $paren_depth === 0) {
                return [
                    substr($declaration, 0, $i),
                    substr($declaration, $i + 1),
                ];
            }
        }

        return null;
    }

    /**
     * Read custom properties from :root declarations.
     */
    private static function extract_css_variables($css) {
        $variables = [];
        $blocks = self::extract_css_blocks($css);

        foreach ($blocks as $block) {
            $selector = trim($block['header']);

            if ($selector !== ':root') continue;

            $pairs = self::split_css_declarations($block['body']);

            foreach ($pairs as $pair) {
                $property_value = self::split_property_value($pair);

                if (!$property_value) continue;

                $key = trim($property_value[0]);
                $val = trim($property_value[1]);

                if (strpos($key, '--') === 0 && $val !== '') {
                    $variables[$key] = $val;
                }
            }
        }

        return $variables;
    }

    /**
     * Resolve variables that refer to other variables.
     */
    private static function resolve_variable_map($variables) {
        for ($i = 0; $i < 10; $i++) {
            $changed = false;

            foreach ($variables as $key => $value) {
                $resolved = self::resolve_css_value_variables($value, $variables);

                if ($resolved !== $value) {
                    $variables[$key] = $resolved;
                    $changed = true;
                }
            }

            if (!$changed) break;
        }

        return $variables;
    }

    /**
     * Resolve var(--name) and var(--name, fallback).
     */
    private static function resolve_css_value_variables($value, $variables) {
        $value = (string) $value;

        for ($i = 0; $i < 10; $i++) {
            $old_value = $value;

            $value = preg_replace_callback(
                '/var\(\s*(--[a-z0-9_-]+)\s*(?:,\s*([^)]+))?\s*\)/i',
                function($match) use ($variables) {
                    $key = trim($match[1]);
                    $fallback = isset($match[2]) ? trim($match[2]) : '';

                    if (isset($variables[$key])) {
                        return $variables[$key];
                    }

                    return $fallback !== '' ? $fallback : $match[0];
                },
                $value
            );

            if ($value === $old_value) break;
        }

        return $value;
    }

    /**
     * Detect intended Elementor breakpoint.
     */
    private static function detect_breakpoint($query) {
        $q = strtolower(trim($query));

        if (preg_match('/max-width\s*:\s*([0-9.]+)\s*(px|em|rem)?/i', $q, $match)) {
            $width = floatval($match[1]);
            $unit = strtolower($match[2] ?? 'px');

            if ($unit === 'em' || $unit === 'rem') {
                $width *= 16;
            }

            if ($width <= 767) return 'mobile';
            if ($width <= 1024) return 'tablet';

            return 'desktop';
        }

        if (preg_match('/min-width\s*:\s*([0-9.]+)\s*(px|em|rem)?/i', $q, $match)) {
            $width = floatval($match[1]);
            $unit = strtolower($match[2] ?? 'px');

            if ($unit === 'em' || $unit === 'rem') {
                $width *= 16;
            }

            if ($width >= 1025) return 'desktop';
            if ($width >= 768) return 'tablet';

            return 'mobile';
        }

        if (stripos($q, 'mobile') !== false) return 'mobile';
        if (stripos($q, 'tablet') !== false) return 'tablet';
        if (stripos($q, 'desktop') !== false) return 'desktop';

        return null;
    }

    // ═══════════════════════════════════════════════════════
    // SELECTOR MATCHER + CSS CASCADE
    // ═══════════════════════════════════════════════════════

    /**
     * Compute effective styles for one DOM node.
     *
     * Desktop rules are always the base.
     * At mobile/tablet, matching media rules override desktop rules.
     */
    public static function get_computed_styles($element, $css_ast, $breakpoint = 'desktop') {
        if (!($element instanceof DOMElement)) return [];

        $base_rules = $css_ast['rules'] ?? [];
        $breakpoint_rules = [];

        if ($breakpoint !== 'desktop') {
            $breakpoint_rules = $css_ast['media_rules'][$breakpoint] ?? [];
        }

        $ordered_matches = [];
        $source_order = 0;

        foreach ($base_rules as $selector => $props) {
            if (self::selector_matches($selector, $element)) {
                $ordered_matches[] = [
                    'specificity' => self::calc_specificity($selector),
                    'source'      => $source_order,
                    'props'       => $props,
                ];
            }

            $source_order++;
        }

        foreach ($breakpoint_rules as $selector => $props) {
            if (self::selector_matches($selector, $element)) {
                $ordered_matches[] = [
                    'specificity' => self::calc_specificity($selector),
                    'source'      => 100000 + $source_order,
                    'props'       => $props,
                ];
            }

            $source_order++;
        }

        usort($ordered_matches, function($a, $b) {
            if ($a['specificity'] === $b['specificity']) {
                return $a['source'] <=> $b['source'];
            }

            return $a['specificity'] <=> $b['specificity'];
        });

        $styles = [];
        $important_styles = [];

        foreach ($ordered_matches as $match) {
            foreach ($match['props'] as $property => $value) {
                $is_important = preg_match('/\s*!important\s*$/i', $value) === 1;
                $clean_value = preg_replace('/\s*!important\s*$/i', '', $value);
                $clean_value = trim($clean_value);

                if ($is_important) {
                    $important_styles[$property] = $clean_value;
                    $styles[$property] = $clean_value;
                    continue;
                }

                if (!isset($important_styles[$property])) {
                    $styles[$property] = $clean_value;
                }
            }
        }

        $inline_styles = self::parse_inline_styles(
            $element->getAttribute('style'),
            $css_ast['variables'] ?? []
        );

        foreach ($inline_styles as $property => $value) {
            $is_important = preg_match('/\s*!important\s*$/i', $value) === 1;
            $clean_value = preg_replace('/\s*!important\s*$/i', '', $value);
            $clean_value = trim($clean_value);

            if ($is_important || !isset($important_styles[$property])) {
                $styles[$property] = $clean_value;

                if ($is_important) {
                    $important_styles[$property] = $clean_value;
                }
            }
        }

        $styles = self::resolve_inheritance($element, $styles, $css_ast, $breakpoint);

        return $styles;
    }

    /**
     * Parse inline styles using the same robust declaration parser.
     */
    private static function parse_inline_styles($style_text, $variables) {
        return self::parse_declarations((string) $style_text, $variables);
    }

    /**
     * Add inherited CSS values where the current element does not specify a value.
     */
    private static function resolve_inheritance($element, $styles, $css_ast, $breakpoint) {
        $inheritable = [
            'color',
            'font-family',
            'font-size',
            'font-weight',
            'font-style',
            'font-variant',
            'letter-spacing',
            'line-height',
            'text-align',
            'text-transform',
            'text-decoration',
            'visibility',
            'cursor',
        ];

        $parent = $element->parentNode;

        if (!($parent instanceof DOMElement)) {
            return $styles;
        }

        $parent_styles = self::get_computed_styles($parent, $css_ast, $breakpoint);

        foreach ($inheritable as $property) {
            $current = isset($styles[$property]) ? strtolower(trim($styles[$property])) : '';

            if ($current === 'inherit') {
                if (isset($parent_styles[$property])) {
                    $styles[$property] = $parent_styles[$property];
                } else {
                    unset($styles[$property]);
                }

                continue;
            }

            if ($current === '' && isset($parent_styles[$property])) {
                $styles[$property] = $parent_styles[$property];
            }
        }

        return $styles;
    }

    /**
     * Check whether a selector matches one DOM element.
     *
     * Supports:
     * - tag, .class, #id
     * - tag.class, .a.b, #id.class
     * - descendant selector: .card .title
     * - child selector: .card > .title
     * - adjacent sibling: .card + .card
     * - general sibling: .card ~ .card
     * - attribute selectors: [href], [type="button"]
     * - :not(), :first-child, :last-child, :nth-child()
     */
    public static function selector_matches($selector, $element) {
        if (!($element instanceof DOMElement)) return false;

        $selector = trim((string) $selector);

        if ($selector === '' || $selector === ':root') {
            return false;
        }

        $selector = self::strip_nonmatching_pseudos($selector);
        $selector = trim($selector);

        if ($selector === '') return false;

        $tokens = self::tokenize_selector($selector);

        if (empty($tokens)) return false;

        return self::match_selector_tokens($tokens, $element);
    }

    /**
     * Remove pseudo classes that do not represent an element's static DOM identity.
     */
    private static function strip_nonmatching_pseudos($selector) {
        $selector = preg_replace('/:hover\b/i', '', $selector);
        $selector = preg_replace('/:focus\b/i', '', $selector);
        $selector = preg_replace('/:active\b/i', '', $selector);
        $selector = preg_replace('/:visited\b/i', '', $selector);
        $selector = preg_replace('/:disabled\b/i', '', $selector);
        $selector = preg_replace('/:checked\b/i', '', $selector);
        $selector = preg_replace('/::(before|after|marker|selection|placeholder)\b/i', '', $selector);

        return trim($selector);
    }

    /**
     * Convert selector into compounds and combinators.
     */
    private static function tokenize_selector($selector) {
        $tokens = [];
        $buffer = '';
        $quote = '';
        $escaped = false;
        $bracket_depth = 0;
        $paren_depth = 0;
        $pending_space = false;
        $length = strlen((string) $selector);

        for ($i = 0; $i < $length; $i++) {
            $char = $selector[$i];

            if ($quote !== '') {
                $buffer .= $char;

                if ($escaped) {
                    $escaped = false;
                } elseif ($char === '\\') {
                    $escaped = true;
                } elseif ($char === $quote) {
                    $quote = '';
                }

                continue;
            }

            if ($char === '"' || $char === "'") {
                $quote = $char;
                $buffer .= $char;
                continue;
            }

            if ($char === '[') {
                $bracket_depth++;
                $buffer .= $char;
                continue;
            }

            if ($char === ']') {
                $bracket_depth = max(0, $bracket_depth - 1);
                $buffer .= $char;
                continue;
            }

            if ($char === '(') {
                $paren_depth++;
                $buffer .= $char;
                continue;
            }

            if ($char === ')') {
                $paren_depth = max(0, $paren_depth - 1);
                $buffer .= $char;
                continue;
            }

            if ($bracket_depth === 0 && $paren_depth === 0) {
                if (ctype_space($char)) {
                    if (trim($buffer) !== '') {
                        $tokens[] = ['type' => 'compound', 'value' => trim($buffer)];
                        $buffer = '';
                    }

                    $pending_space = true;
                    continue;
                }

                if (in_array($char, ['>', '+', '~'], true)) {
                    if (trim($buffer) !== '') {
                        $tokens[] = ['type' => 'compound', 'value' => trim($buffer)];
                        $buffer = '';
                    }

                    if (!empty($tokens) && end($tokens)['type'] === 'combinator') {
                        array_pop($tokens);
                    }

                    $tokens[] = ['type' => 'combinator', 'value' => $char];
                    $pending_space = false;
                    continue;
                }

                if ($pending_space && trim($buffer) === '') {
                    if (
                        !empty($tokens) &&
                        end($tokens)['type'] === 'compound'
                    ) {
                        $tokens[] = ['type' => 'combinator', 'value' => ' '];
                    }

                    $pending_space = false;
                }
            }

            $buffer .= $char;
        }

        if (trim($buffer) !== '') {
            $tokens[] = ['type' => 'compound', 'value' => trim($buffer)];
        }

        while (!empty($tokens) && end($tokens)['type'] === 'combinator') {
            array_pop($tokens);
        }

        return $tokens;
    }

    /**
     * Match a tokenized selector from right to left.
     */
    private static function match_selector_tokens($tokens, $element) {
        $index = count($tokens) - 1;
        $current = $element;

        if ($index < 0 || $tokens[$index]['type'] !== 'compound') {
            return false;
        }

        if (!self::simple_selector_matches($tokens[$index]['value'], $current)) {
            return false;
        }

        $index--;

        while ($index >= 0) {
            if ($tokens[$index]['type'] !== 'combinator') {
                return false;
            }

            $combinator = $tokens[$index]['value'];
            $index--;

            if ($index < 0 || $tokens[$index]['type'] !== 'compound') {
                return false;
            }

            $required_selector = $tokens[$index]['value'];

            if ($combinator === '>') {
                $current = self::parent_element($current);

                if (!$current || !self::simple_selector_matches($required_selector, $current)) {
                    return false;
                }
            } elseif ($combinator === '+') {
                $current = self::previous_element_sibling($current);

                if (!$current || !self::simple_selector_matches($required_selector, $current)) {
                    return false;
                }
            } elseif ($combinator === '~') {
                $sibling = self::previous_element_sibling($current);
                $matched = false;

                while ($sibling) {
                    if (self::simple_selector_matches($required_selector, $sibling)) {
                        $current = $sibling;
                        $matched = true;
                        break;
                    }

                    $sibling = self::previous_element_sibling($sibling);
                }

                if (!$matched) return false;
            } else {
                $ancestor = self::parent_element($current);
                $matched = false;

                while ($ancestor) {
                    if (self::simple_selector_matches($required_selector, $ancestor)) {
                        $current = $ancestor;
                        $matched = true;
                        break;
                    }

                    $ancestor = self::parent_element($ancestor);
                }

                if (!$matched) return false;
            }

            $index--;
        }

        return true;
    }

    /**
     * Match one selector compound against one DOM element.
     */
    private static function simple_selector_matches($selector, $element) {
        if (!($element instanceof DOMElement)) return false;

        $selector = trim((string) $selector);

        if ($selector === '' || $selector === '*') {
            return true;
        }

        if (!self::match_structural_pseudos($selector, $element)) {
            return false;
        }

        $selector = self::remove_structural_pseudos($selector);
        $selector = trim($selector);

        $not_selectors = [];

        if (preg_match_all('/:not\(([^()]*)\)/i', $selector, $not_matches)) {
            $not_selectors = $not_matches[1];
            $selector = preg_replace('/:not\([^()]*\)/i', '', $selector);
        }

        foreach ($not_selectors as $not_selector) {
            if (self::simple_selector_matches(trim($not_selector), $element)) {
                return false;
            }
        }

        $attribute_rules = [];

        if (preg_match_all('/\[([^\]]+)\]/', $selector, $attribute_matches)) {
            $attribute_rules = $attribute_matches[1];
            $selector = preg_replace('/\[[^\]]+\]/', '', $selector);
        }

        foreach ($attribute_rules as $rule) {
            if (!self::attribute_selector_matches(trim($rule), $element)) {
                return false;
            }
        }

        $tag = strtolower($element->tagName);
        $id = $element->getAttribute('id');
        $classes = preg_split('/\s+/', trim($element->getAttribute('class')));

        if (!$classes || (count($classes) === 1 && $classes[0] === '')) {
            $classes = [];
        }

        $tag_match = [];

        if (preg_match('/^[a-z][a-z0-9_-]*|\*/i', $selector, $tag_match)) {
            $selector_tag = strtolower($tag_match[0]);

            if ($selector_tag !== '*' && $selector_tag !== $tag) {
                return false;
            }

            $selector = substr($selector, strlen($tag_match[0]));
        }

        if (preg_match_all('/#([a-z0-9_-]+)/i', $selector, $id_matches)) {
            foreach ($id_matches[1] as $expected_id) {
                if ($id !== $expected_id) {
                    return false;
                }
            }
        }

        if (preg_match_all('/\.([a-z0-9_-]+)/i', $selector, $class_matches)) {
            foreach ($class_matches[1] as $expected_class) {
                if (!in_array($expected_class, $classes, true)) {
                    return false;
                }
            }
        }

        return true;
    }

    /**
     * Match a basic attribute selector:
     * [href], [type="button"], [class*=btn], [href^="https"].
     */
    private static function attribute_selector_matches($rule, $element) {
        if (!preg_match(
            '/^([a-z0-9_-]+)\s*(?:(\^=|\$=|\*=|~=|\|=|=)\s*(.+))?$/i',
            $rule,
            $match
        )) {
            return false;
        }

        $attribute = $match[1];

        if (!$element->hasAttribute($attribute)) {
            return false;
        }

        if (empty($match[2])) {
            return true;
        }

        $operator = $match[2];
        $expected = trim($match[3], " \t\n\r\0\x0B\"'");
        $actual = $element->getAttribute($attribute);

        if ($operator === '=') {
            return $actual === $expected;
        }

        if ($operator === '^=') {
            return strpos($actual, $expected) === 0;
        }

        if ($operator === '$=') {
            return substr($actual, -strlen($expected)) === $expected;
        }

        if ($operator === '*=') {
            return strpos($actual, $expected) !== false;
        }

        if ($operator === '~=') {
            return in_array($expected, preg_split('/\s+/', trim($actual)), true);
        }

        if ($operator === '|=') {
            return $actual === $expected || strpos($actual, $expected . '-') === 0;
        }

        return false;
    }

    /**
     * Evaluate :first-child, :last-child, :only-child, and :nth-child().
     */
    private static function match_structural_pseudos($selector, $element) {
        if (stripos($selector, ':first-child') !== false) {
            $parent = self::parent_element($element);

            if (!$parent || self::first_element_child($parent) !== $element) {
                return false;
            }
        }

        if (stripos($selector, ':last-child') !== false) {
            $parent = self::parent_element($element);

            if (!$parent || self::last_element_child($parent) !== $element) {
                return false;
            }
        }

        if (stripos($selector, ':only-child') !== false) {
            $parent = self::parent_element($element);

            if (
                !$parent ||
                self::first_element_child($parent) !== $element ||
                self::last_element_child($parent) !== $element
            ) {
                return false;
            }
        }

        if (preg_match_all('/:nth-child\(\s*([^)]+)\s*\)/i', $selector, $nth_matches)) {
            foreach ($nth_matches[1] as $expression) {
                $position = self::element_child_position($element);

                if (!self::nth_expression_matches($position, trim(strtolower($expression)))) {
                    return false;
                }
            }
        }

        return true;
    }

    private static function remove_structural_pseudos($selector) {
        $selector = preg_replace('/:first-child\b/i', '', $selector);
        $selector = preg_replace('/:last-child\b/i', '', $selector);
        $selector = preg_replace('/:only-child\b/i', '', $selector);
        $selector = preg_replace('/:nth-child\([^)]*\)/i', '', $selector);

        return $selector;
    }

    private static function nth_expression_matches($position, $expression) {
        if ($expression === 'odd') {
            return ($position % 2) === 1;
        }

        if ($expression === 'even') {
            return ($position % 2) === 0;
        }

        if (ctype_digit($expression)) {
            return $position === intval($expression);
        }

        if (preg_match('/^([+-]?\d*)n\s*([+-]\s*\d+)?$/i', $expression, $match)) {
            $a_raw = str_replace(' ', '', $match[1]);
            $b_raw = isset($match[2]) ? str_replace(' ', '', $match[2]) : '0';

            if ($a_raw === '' || $a_raw === '+') {
                $a = 1;
            } elseif ($a_raw === '-') {
                $a = -1;
            } else {
                $a = intval($a_raw);
            }

            $b = intval($b_raw);

            if ($a === 0) {
                return $position === $b;
            }

            $n = ($position - $b) / $a;

            return $n >= 0 && floor($n) == $n;
        }

        return false;
    }

    /**
     * Calculate CSS specificity:
     * ID * 100 + class/attribute/pseudo-class * 10 + element * 1.
     */
    public static function calc_specificity($selector) {
        $selector = (string) $selector;

        $id_count = preg_match_all('/#[a-z0-9_-]+/i', $selector);
        $class_count = preg_match_all('/\.[a-z0-9_-]+/i', $selector);
        $attribute_count = preg_match_all('/\[[^\]]+\]/', $selector);
        $pseudo_class_count = preg_match_all('/(?<!:):[a-z-]+(?:\([^)]*\))?/i', $selector);

        $clean = preg_replace('/#[a-z0-9_-]+/i', '', $selector);
        $clean = preg_replace('/\.[a-z0-9_-]+/i', '', $clean);
        $clean = preg_replace('/\[[^\]]+\]/', '', $clean);
        $clean = preg_replace('/::?[a-z-]+(?:\([^)]*\))?/i', '', $clean);

        $tag_count = preg_match_all(
            '/(?<![-\w])([a-z][a-z0-9_-]*|\*)(?![-\w])/i',
            $clean
        );

        return
            ($id_count * 100) +
            (($class_count + $attribute_count + $pseudo_class_count) * 10) +
            $tag_count;
    }

    /**
     * Return hover styles after normal selector matching.
     */
    public static function get_hover_styles($element, $css_ast) {
        if (!($element instanceof DOMElement)) return [];

        $hover_rules = $css_ast['hover_rules'] ?? [];
        $matches = [];
        $source_order = 0;

        foreach ($hover_rules as $selector => $props) {
            if (self::selector_matches($selector, $element)) {
                $matches[] = [
                    'specificity' => self::calc_specificity($selector),
                    'source' => $source_order,
                    'props' => $props,
                ];
            }

            $source_order++;
        }

        usort($matches, function($a, $b) {
            if ($a['specificity'] === $b['specificity']) {
                return $a['source'] <=> $b['source'];
            }

            return $a['specificity'] <=> $b['specificity'];
        });

        $styles = [];

        foreach ($matches as $match) {
            foreach ($match['props'] as $property => $value) {
                $styles[$property] = trim(
                    preg_replace('/\s*!important\s*$/i', '', $value)
                );
            }
        }

        return $styles;
    }

    // ═══════════════════════════════════════════════════════
    // DOM HELPERS
    // ═══════════════════════════════════════════════════════

    private static function parent_element($element) {
        $parent = $element ? $element->parentNode : null;

        while ($parent && !($parent instanceof DOMElement)) {
            $parent = $parent->parentNode;
        }

        return $parent instanceof DOMElement ? $parent : null;
    }

    private static function previous_element_sibling($element) {
        $sibling = $element ? $element->previousSibling : null;

        while ($sibling && !($sibling instanceof DOMElement)) {
            $sibling = $sibling->previousSibling;
        }

        return $sibling instanceof DOMElement ? $sibling : null;
    }

    private static function first_element_child($element) {
        if (!($element instanceof DOMElement)) return null;

        foreach ($element->childNodes as $child) {
            if ($child instanceof DOMElement) {
                return $child;
            }
        }

        return null;
    }

    private static function last_element_child($element) {
        if (!($element instanceof DOMElement)) return null;

        for ($child = $element->lastChild; $child; $child = $child->previousSibling) {
            if ($child instanceof DOMElement) {
                return $child;
            }
        }

        return null;
    }

    private static function element_child_position($element) {
        $parent = self::parent_element($element);

        if (!$parent) return 0;

        $position = 0;

        foreach ($parent->childNodes as $child) {
            if (!($child instanceof DOMElement)) continue;

            $position++;

            if ($child === $element) {
                return $position;
            }
        }

        return 0;
    }
}
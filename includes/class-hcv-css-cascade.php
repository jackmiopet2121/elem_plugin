<?php
/**
 * HCV Engine V2 - CSS Cascade Engine
 *
 * Parses inline CSS, resolves CSS variables, applies a deterministic
 * selector cascade, and returns desktop/tablet/mobile computed styles
 * keyed by HCV DOM Normalizer source IDs.
 *
 * This module does not generate Elementor JSON.
 *
 * @package Gemini_HTML_to_Elementor_Universal_Pro
 * @since 8.5.0
 */

if (!defined('ABSPATH')) {
    exit;
}

class HCV_CSS_Cascade {

    /**
     * Analyze styles for every source node emitted by HCV_DOM_Normalizer.
     *
     * @param array  $normalized Result from HCV_DOM_Normalizer::normalize().
     * @param string $html_content Original HTML source.
     * @return array
     */
    public static function analyze($normalized, $html_content) {
        $warnings = array();
        $css = self::extract_inline_css((string) $html_content);
        $ast = self::parse($css, $warnings);
        $styles_by_source = array();

        foreach (($normalized['source_map'] ?? array()) as $source_id => $descriptor) {
            if (empty($descriptor['node']) || !($descriptor['node'] instanceof DOMElement)) {
                continue;
            }

            $node = $descriptor['node'];

            $styles_by_source[$source_id] = array(
                'desktop' => self::compute_node_styles($node, $ast, 'desktop'),
                'tablet' => self::compute_node_styles($node, $ast, 'tablet'),
                'mobile' => self::compute_node_styles($node, $ast, 'mobile'),
            );
        }

        return array(
            'css' => $css,
            'ast' => $ast,
            'styles_by_source' => $styles_by_source,
            'warnings' => self::unique_warnings($warnings),
            'stats' => array(
                'css_bytes' => strlen($css),
                'rule_count' => count($ast['rules']),
                'tablet_rule_count' => count($ast['media_rules']['tablet']),
                'mobile_rule_count' => count($ast['media_rules']['mobile']),
                'variable_count' => count($ast['variables']),
                'styled_node_count' => count($styles_by_source),
                'warning_count' => count(self::unique_warnings($warnings)),
            ),
        );
    }

    /**
     * Return styles for one source ID and one breakpoint.
     */
    public static function get_styles($analysis, $source_id, $breakpoint = 'desktop') {
        $breakpoint = in_array($breakpoint, array('desktop', 'tablet', 'mobile'), true)
            ? $breakpoint
            : 'desktop';

        return $analysis['styles_by_source'][$source_id][$breakpoint] ?? array();
    }

    /**
     * Small serializable summary for the future admin test UI.
     */
    public static function summarize($analysis) {
        return array(
            'stats' => $analysis['stats'] ?? array(),
            'variables' => $analysis['ast']['variables'] ?? array(),
            'warnings' => $analysis['warnings'] ?? array(),
        );
    }

    /**
     * Parse raw CSS into a lightweight internal AST.
     */
    public static function parse($css, &$warnings = array()) {
        $css = self::strip_comments((string) $css);
        $variables = self::resolve_variable_map(self::extract_root_variables($css));

        $ast = array(
            'variables' => $variables,
            'rules' => array(),
            'media_rules' => array(
                'tablet' => array(),
                'mobile' => array(),
            ),
        );

        $blocks = self::read_blocks($css);
        $order = 0;

        foreach ($blocks as $block) {
            $header = trim($block['header']);
            $body = $block['body'];

            if ($header === '') {
                continue;
            }

            if (stripos($header, '@media') === 0) {
                $breakpoint = self::detect_breakpoint(trim(substr($header, 6)));

                if ($breakpoint === null || $breakpoint === 'desktop') {
                    if ($breakpoint === null) {
                        $warnings[] = self::warning(
                            'unmapped_media_query',
                            'info',
                            'A media query could not be mapped to Elementor desktop/tablet/mobile breakpoints.',
                            array('query' => $header)
                        );
                    }
                    continue;
                }

                foreach (self::read_blocks($body) as $inner) {
                    $inner_header = trim($inner['header']);

                    if ($inner_header === '' || $inner_header[0] === '@') {
                        continue;
                    }

                    self::append_rule(
                        $ast['media_rules'][$breakpoint],
                        $inner_header,
                        $inner['body'],
                        $variables,
                        $order
                    );
                }

                continue;
            }

            if ($header[0] === '@') {
                if (
                    stripos($header, '@keyframes') === 0 ||
                    stripos($header, '@font-face') === 0 ||
                    stripos($header, '@supports') === 0 ||
                    stripos($header, '@container') === 0
                ) {
                    $warnings[] = self::warning(
                        'advanced_css_at_rule',
                        'info',
                        'An advanced CSS at-rule was detected and may need hybrid or fallback rendering.',
                        array('rule' => $header)
                    );
                }
                continue;
            }

            self::append_rule($ast['rules'], $header, $body, $variables, $order);
        }

        return $ast;
    }

    private static function extract_inline_css($html_content) {
        $css = '';
        preg_match_all('/<style\b[^>]*>(.*?)<\/style>/is', $html_content, $matches);

        foreach (($matches[1] ?? array()) as $style_block) {
            $css .= "\n" . $style_block;
        }

        return $css;
    }

    private static function strip_comments($css) {
        return preg_replace('#/\*.*?\*/#s', '', $css);
    }

    /**
     * Read CSS blocks without breaking quoted strings, data URLs, or nested braces.
     */
    private static function read_blocks($css) {
        $blocks = array();
        $length = strlen($css);
        $start = 0;
        $body_start = null;
        $depth = 0;
        $quote = '';
        $escaped = false;

        for ($index = 0; $index < $length; $index++) {
            $char = $css[$index];

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

            if ($char === '{') {
                if ($depth === 0) {
                    $body_start = $index + 1;
                }
                $depth++;
                continue;
            }

            if ($char === '}' && $depth > 0) {
                $depth--;

                if ($depth === 0 && $body_start !== null) {
                    $header = trim(substr($css, $start, $body_start - $start - 1));
                    $body = substr($css, $body_start, $index - $body_start);

                    if ($header !== '') {
                        $blocks[] = array('header' => $header, 'body' => $body);
                    }

                    $start = $index + 1;
                    $body_start = null;
                }
            }
        }

        return $blocks;
    }

    private static function append_rule(&$target, $selector_list, $body, $variables, &$order) {
        $declarations = self::parse_declarations($body, $variables);

        if (empty($declarations)) {
            return;
        }

        foreach (self::split_selector_list($selector_list) as $selector) {
            $selector = trim($selector);

            if ($selector === '' || $selector === ':root') {
                continue;
            }

            $target[] = array(
                'selector' => $selector,
                'declarations' => $declarations,
                'order' => $order++,
            );
        }
    }

    private static function parse_declarations($body, $variables) {
        $result = array();

        foreach (self::split_declarations($body) as $declaration) {
            $pair = self::split_property_value($declaration);

            if ($pair === null) {
                continue;
            }

            $property = strtolower(trim($pair[0]));
            $value = trim($pair[1]);

            if ($property === '' || $value === '') {
                continue;
            }

            $important = false;

            if (preg_match('/\s*!important\s*$/i', $value)) {
                $important = true;
                $value = trim(preg_replace('/\s*!important\s*$/i', '', $value));
            }

            $result[$property] = array(
                'value' => self::resolve_value_variables($value, $variables),
                'important' => $important,
            );
        }

        return $result;
    }

    private static function split_declarations($body) {
        $items = array();
        $buffer = '';
        $quote = '';
        $escaped = false;
        $paren_depth = 0;
        $bracket_depth = 0;
        $length = strlen($body);

        for ($index = 0; $index < $length; $index++) {
            $char = $body[$index];

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

            if ($char === ';' && $paren_depth === 0 && $bracket_depth === 0) {
                if (trim($buffer) !== '') {
                    $items[] = trim($buffer);
                }
                $buffer = '';
                continue;
            }

            $buffer .= $char;
        }

        if (trim($buffer) !== '') {
            $items[] = trim($buffer);
        }

        return $items;
    }

    private static function split_property_value($declaration) {
        $quote = '';
        $escaped = false;
        $paren_depth = 0;
        $length = strlen($declaration);

        for ($index = 0; $index < $length; $index++) {
            $char = $declaration[$index];

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

            if ($char === '(') $paren_depth++;
            if ($char === ')') $paren_depth = max(0, $paren_depth - 1);

            if ($char === ':' && $paren_depth === 0) {
                return array(
                    substr($declaration, 0, $index),
                    substr($declaration, $index + 1),
                );
            }
        }

        return null;
    }

    private static function split_selector_list($selector_text) {
        $items = array();
        $buffer = '';
        $quote = '';
        $escaped = false;
        $paren_depth = 0;
        $bracket_depth = 0;
        $length = strlen($selector_text);

        for ($index = 0; $index < $length; $index++) {
            $char = $selector_text[$index];

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

            if ($char === ',' && $paren_depth === 0 && $bracket_depth === 0) {
                $items[] = trim($buffer);
                $buffer = '';
                continue;
            }

            $buffer .= $char;
        }

        if (trim($buffer) !== '') {
            $items[] = trim($buffer);
        }

        return $items;
    }

    private static function extract_root_variables($css) {
        $variables = array();

        foreach (self::read_blocks($css) as $block) {
            if (trim($block['header']) !== ':root') {
                continue;
            }

            foreach (self::split_declarations($block['body']) as $declaration) {
                $pair = self::split_property_value($declaration);

                if ($pair === null) {
                    continue;
                }

                $name = trim($pair[0]);
                $value = trim($pair[1]);

                if (strpos($name, '--') === 0 && $value !== '') {
                    $variables[$name] = $value;
                }
            }
        }

        return $variables;
    }

    private static function resolve_variable_map($variables) {
        for ($round = 0; $round < 10; $round++) {
            $changed = false;

            foreach ($variables as $name => $value) {
                $resolved = self::resolve_value_variables($value, $variables);

                if ($resolved !== $value) {
                    $variables[$name] = $resolved;
                    $changed = true;
                }
            }

            if (!$changed) {
                break;
            }
        }

        return $variables;
    }

    private static function resolve_value_variables($value, $variables) {
        for ($round = 0; $round < 10; $round++) {
            $previous = $value;

            $value = preg_replace_callback(
                '/var\(\s*(--[a-zA-Z0-9_-]+)\s*(?:,\s*([^\)]+))?\s*\)/',
                function($match) use ($variables) {
                    $name = $match[1];
                    $fallback = isset($match[2]) ? trim($match[2]) : '';

                    return array_key_exists($name, $variables)
                        ? $variables[$name]
                        : ($fallback !== '' ? $fallback : $match[0]);
                },
                $value
            );

            if ($value === $previous) {
                break;
            }
        }

        return $value;
    }

    private static function detect_breakpoint($query) {
        $query = strtolower($query);

        if (preg_match('/max-width\s*:\s*([0-9.]+)\s*(px|rem|em)?/i', $query, $match)) {
            $width = floatval($match[1]);
            $unit = strtolower($match[2] ?? 'px');

            if ($unit === 'rem' || $unit === 'em') {
                $width *= 16;
            }

            if ($width <= 767) return 'mobile';
            if ($width <= 1024) return 'tablet';
            return 'desktop';
        }

        if (preg_match('/min-width\s*:\s*([0-9.]+)\s*(px|rem|em)?/i', $query, $match)) {
            $width = floatval($match[1]);
            $unit = strtolower($match[2] ?? 'px');

            if ($unit === 'rem' || $unit === 'em') {
                $width *= 16;
            }

            if ($width >= 1025) return 'desktop';
            if ($width >= 768) return 'tablet';
            return 'mobile';
        }

        return null;
    }

    private static function compute_node_styles($node, $ast, $breakpoint) {
        $rules = $ast['rules'];

        if ($breakpoint === 'tablet') {
            $rules = array_merge($rules, $ast['media_rules']['tablet']);
        } elseif ($breakpoint === 'mobile') {
            $rules = array_merge($rules, $ast['media_rules']['tablet'], $ast['media_rules']['mobile']);
        }

        $matches = array();

        foreach ($rules as $rule) {
            if (!self::selector_matches($rule['selector'], $node)) {
                continue;
            }

            $matches[] = array(
                'specificity' => self::specificity($rule['selector']),
                'order' => $rule['order'],
                'declarations' => $rule['declarations'],
            );
        }

        usort($matches, function($left, $right) {
            if ($left['specificity'] === $right['specificity']) {
                return $left['order'] <=> $right['order'];
            }
            return $left['specificity'] <=> $right['specificity'];
        });

        $styles = array();
        $important = array();

        foreach ($matches as $match) {
            foreach ($match['declarations'] as $property => $declaration) {
                if ($declaration['important']) {
                    $styles[$property] = $declaration['value'];
                    $important[$property] = true;
                    continue;
                }

                if (!isset($important[$property])) {
                    $styles[$property] = $declaration['value'];
                }
            }
        }

        foreach (self::parse_declarations($node->getAttribute('style'), $ast['variables']) as $property => $declaration) {
            if ($declaration['important'] || !isset($important[$property])) {
                $styles[$property] = $declaration['value'];
                if ($declaration['important']) {
                    $important[$property] = true;
                }
            }
        }

        return self::apply_inheritance($node, $styles, $ast, $breakpoint);
    }

    private static function apply_inheritance($node, $styles, $ast, $breakpoint) {
        $inherited_properties = array(
            'color', 'font-family', 'font-size', 'font-weight', 'font-style',
            'font-variant', 'line-height', 'letter-spacing', 'word-spacing',
            'text-align', 'text-transform', 'text-decoration', 'visibility',
        );

        $parent = self::parent_element($node);

        if (!($parent instanceof DOMElement)) {
            return $styles;
        }

        $parent_styles = self::compute_node_styles($parent, $ast, $breakpoint);

        foreach ($inherited_properties as $property) {
            $value = isset($styles[$property]) ? strtolower(trim($styles[$property])) : '';

            if ($value === 'inherit') {
                if (isset($parent_styles[$property])) {
                    $styles[$property] = $parent_styles[$property];
                } else {
                    unset($styles[$property]);
                }
                continue;
            }

            if ($value === '' && isset($parent_styles[$property])) {
                $styles[$property] = $parent_styles[$property];
            }
        }

        return $styles;
    }

    /**
     * Supports common selectors required by clean static landing pages:
     * tag, class, id, compounds, descendant, child, +, ~, attributes,
     * :first-child, :last-child, :nth-child(), and :not(simple selector).
     */
    private static function selector_matches($selector, $node) {
        $selector = trim($selector);

        if ($selector === '' || $selector === ':root') {
            return false;
        }

        if (stripos($selector, ':hover') !== false || stripos($selector, ':focus') !== false || stripos($selector, ':active') !== false) {
            return false;
        }

        $selector = preg_replace('/::(before|after|marker|selection|placeholder)\b/i', '', $selector);
        $tokens = self::tokenize_selector($selector);

        if (empty($tokens) || end($tokens)['type'] !== 'compound') {
            return false;
        }

        return self::match_tokens_from_right($tokens, $node);
    }

    private static function tokenize_selector($selector) {
        $tokens = array();
        $buffer = '';
        $quote = '';
        $escaped = false;
        $bracket_depth = 0;
        $paren_depth = 0;
        $pending_space = false;
        $length = strlen($selector);

        for ($index = 0; $index < $length; $index++) {
            $char = $selector[$index];

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

            if ($bracket_depth === 0 && $paren_depth === 0) {
                if (ctype_space($char)) {
                    if (trim($buffer) !== '') {
                        $tokens[] = array('type' => 'compound', 'value' => trim($buffer));
                        $buffer = '';
                    }
                    $pending_space = true;
                    continue;
                }

                if (in_array($char, array('>', '+', '~'), true)) {
                    if (trim($buffer) !== '') {
                        $tokens[] = array('type' => 'compound', 'value' => trim($buffer));
                        $buffer = '';
                    }

                    if (!empty($tokens) && end($tokens)['type'] === 'combinator') {
                        array_pop($tokens);
                    }

                    $tokens[] = array('type' => 'combinator', 'value' => $char);
                    $pending_space = false;
                    continue;
                }

                if ($pending_space && trim($buffer) === '' && !empty($tokens) && end($tokens)['type'] === 'compound') {
                    $tokens[] = array('type' => 'combinator', 'value' => ' ');
                }
                $pending_space = false;
            }

            $buffer .= $char;
        }

        if (trim($buffer) !== '') {
            $tokens[] = array('type' => 'compound', 'value' => trim($buffer));
        }

        while (!empty($tokens) && end($tokens)['type'] === 'combinator') {
            array_pop($tokens);
        }

        return $tokens;
    }

    private static function match_tokens_from_right($tokens, $node) {
        $index = count($tokens) - 1;
        $current = $node;

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

            $required = $tokens[$index]['value'];

            if ($combinator === '>') {
                $current = self::parent_element($current);
                if (!$current || !self::simple_selector_matches($required, $current)) return false;
            } elseif ($combinator === '+') {
                $current = self::previous_element_sibling($current);
                if (!$current || !self::simple_selector_matches($required, $current)) return false;
            } elseif ($combinator === '~') {
                $candidate = self::previous_element_sibling($current);
                $matched = false;
                while ($candidate) {
                    if (self::simple_selector_matches($required, $candidate)) {
                        $current = $candidate;
                        $matched = true;
                        break;
                    }
                    $candidate = self::previous_element_sibling($candidate);
                }
                if (!$matched) return false;
            } else {
                $candidate = self::parent_element($current);
                $matched = false;
                while ($candidate) {
                    if (self::simple_selector_matches($required, $candidate)) {
                        $current = $candidate;
                        $matched = true;
                        break;
                    }
                    $candidate = self::parent_element($candidate);
                }
                if (!$matched) return false;
            }

            $index--;
        }

        return true;
    }

    private static function simple_selector_matches($selector, $node) {
        $selector = trim($selector);

        if ($selector === '' || $selector === '*') {
            return true;
        }

        if (!self::match_structural_pseudos($selector, $node)) {
            return false;
        }

        $selector = preg_replace('/:first-child\b/i', '', $selector);
        $selector = preg_replace('/:last-child\b/i', '', $selector);
        $selector = preg_replace('/:nth-child\([^)]*\)/i', '', $selector);

        if (preg_match_all('/:not\(([^()]*)\)/i', $selector, $not_matches)) {
            foreach ($not_matches[1] as $not_selector) {
                if (self::simple_selector_matches(trim($not_selector), $node)) {
                    return false;
                }
            }
            $selector = preg_replace('/:not\([^()]*\)/i', '', $selector);
        }

        if (preg_match_all('/\[([^\]]+)\]/', $selector, $attribute_matches)) {
            foreach ($attribute_matches[1] as $attribute_rule) {
                if (!self::attribute_matches(trim($attribute_rule), $node)) {
                    return false;
                }
            }
            $selector = preg_replace('/\[[^\]]+\]/', '', $selector);
        }

        $tag = strtolower($node->tagName);
        $classes = preg_split('/\s+/', trim($node->getAttribute('class')));
        $classes = array_values(array_filter($classes));
        $id = $node->getAttribute('id');

        if (preg_match('/^([a-z][a-z0-9_-]*|\*)/i', $selector, $tag_match)) {
            if ($tag_match[1] !== '*' && strtolower($tag_match[1]) !== $tag) {
                return false;
            }
            $selector = substr($selector, strlen($tag_match[1]));
        }

        if (preg_match_all('/#([a-z0-9_-]+)/i', $selector, $id_matches)) {
            foreach ($id_matches[1] as $expected) {
                if ($id !== $expected) return false;
            }
        }

        if (preg_match_all('/\.([a-z0-9_-]+)/i', $selector, $class_matches)) {
            foreach ($class_matches[1] as $expected) {
                if (!in_array($expected, $classes, true)) return false;
            }
        }

        return true;
    }

    private static function attribute_matches($rule, $node) {
        if (!preg_match('/^([a-z0-9_-]+)\s*(?:(\^=|\$=|\*=|~=|\|=|=)\s*(.+))?$/i', $rule, $match)) {
            return false;
        }

        $name = $match[1];

        if (!$node->hasAttribute($name)) {
            return false;
        }

        if (empty($match[2])) {
            return true;
        }

        $operator = $match[2];
        $expected = trim($match[3], " \t\n\r\0\x0B\"'");
        $actual = $node->getAttribute($name);

        if ($operator === '=') return $actual === $expected;
        if ($operator === '^=') return strpos($actual, $expected) === 0;
        if ($operator === '$=') return substr($actual, -strlen($expected)) === $expected;
        if ($operator === '*=') return strpos($actual, $expected) !== false;
        if ($operator === '~=') return in_array($expected, preg_split('/\s+/', trim($actual)), true);
        if ($operator === '|=') return $actual === $expected || strpos($actual, $expected . '-') === 0;

        return false;
    }

    private static function match_structural_pseudos($selector, $node) {
        $parent = self::parent_element($node);

        if (stripos($selector, ':first-child') !== false) {
            if (!$parent || self::first_element_child($parent) !== $node) return false;
        }

        if (stripos($selector, ':last-child') !== false) {
            if (!$parent || self::last_element_child($parent) !== $node) return false;
        }

        if (preg_match_all('/:nth-child\(\s*([^)]+)\s*\)/i', $selector, $matches)) {
            $position = self::element_child_position($node);
            foreach ($matches[1] as $expression) {
                if (!self::nth_matches($position, strtolower(trim($expression)))) return false;
            }
        }

        return true;
    }

    private static function nth_matches($position, $expression) {
        if ($expression === 'odd') return ($position % 2) === 1;
        if ($expression === 'even') return ($position % 2) === 0;
        if (ctype_digit($expression)) return $position === intval($expression);

        if (preg_match('/^([+-]?\d*)n\s*([+-]\s*\d+)?$/i', $expression, $match)) {
            $a_raw = str_replace(' ', '', $match[1]);
            $b_raw = isset($match[2]) ? str_replace(' ', '', $match[2]) : '0';
            $a = ($a_raw === '' || $a_raw === '+') ? 1 : (($a_raw === '-') ? -1 : intval($a_raw));
            $b = intval($b_raw);
            if ($a === 0) return $position === $b;
            $n = ($position - $b) / $a;
            return $n >= 0 && floor($n) == $n;
        }

        return false;
    }

    private static function specificity($selector) {
        $id_count = preg_match_all('/#[a-z0-9_-]+/i', $selector);
        $class_count = preg_match_all('/\.[a-z0-9_-]+/i', $selector);
        $attribute_count = preg_match_all('/\[[^\]]+\]/', $selector);
        $pseudo_count = preg_match_all('/(?<!:):[a-z-]+(?:\([^)]*\))?/i', $selector);
        $tag_count = preg_match_all('/(?<![-\w.#])([a-z][a-z0-9_-]*)(?![-\w])/i', preg_replace('/\[[^\]]+\]|:[a-z-]+(?:\([^)]*\))?/', '', $selector));

        return ($id_count * 100) + (($class_count + $attribute_count + $pseudo_count) * 10) + $tag_count;
    }

    private static function parent_element($node) {
        $parent = $node ? $node->parentNode : null;
        while ($parent && !($parent instanceof DOMElement)) {
            $parent = $parent->parentNode;
        }
        return $parent instanceof DOMElement ? $parent : null;
    }

    private static function previous_element_sibling($node) {
        $sibling = $node ? $node->previousSibling : null;
        while ($sibling && !($sibling instanceof DOMElement)) {
            $sibling = $sibling->previousSibling;
        }
        return $sibling instanceof DOMElement ? $sibling : null;
    }

    private static function first_element_child($node) {
        foreach ($node->childNodes as $child) {
            if ($child instanceof DOMElement) return $child;
        }
        return null;
    }

    private static function last_element_child($node) {
        for ($child = $node->lastChild; $child; $child = $child->previousSibling) {
            if ($child instanceof DOMElement) return $child;
        }
        return null;
    }

    private static function element_child_position($node) {
        $parent = self::parent_element($node);
        if (!$parent) return 0;
        $position = 0;
        foreach ($parent->childNodes as $child) {
            if (!($child instanceof DOMElement)) continue;
            $position++;
            if ($child === $node) return $position;
        }
        return 0;
    }

    private static function warning($code, $level, $message, $context) {
        return array(
            'code' => $code,
            'level' => $level,
            'message' => $message,
            'context' => $context,
        );
    }

    private static function unique_warnings($warnings) {
        $unique = array();
        $seen = array();
        foreach ($warnings as $warning) {
            $key = md5(wp_json_encode($warning));
            if (isset($seen[$key])) continue;
            $seen[$key] = true;
            $unique[] = $warning;
        }
        return $unique;
    }
}

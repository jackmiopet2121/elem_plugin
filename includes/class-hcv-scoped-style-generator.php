<?php
/**
 * HCV Engine V2 - Scoped Style Generator
 *
 * Emits visual and responsive CSS from computed per-source styles. Every
 * selector is tied to an Elementor element generated for that source node;
 * no document-wide normalization or template-specific selector is emitted.
 */

if (!defined('ABSPATH')) {
    exit;
}

class HCV_Scoped_Style_Generator {

    private static $inherited_properties = array(
        'color', 'font-family', 'font-size', 'font-weight', 'font-style',
        'font-variant', 'line-height', 'letter-spacing', 'word-spacing',
        'text-align', 'text-transform', 'text-decoration'
    );

    public static function generate($normalized, $css_analysis, $elements, $post_id = 0) {
        $source_map = isset($normalized['source_map']) && is_array($normalized['source_map']) ? $normalized['source_map'] : array();
        $styles_by_source = isset($css_analysis['styles_by_source']) && is_array($css_analysis['styles_by_source']) ? $css_analysis['styles_by_source'] : array();
        $element_types = self::map_element_types($elements);
        $parent_map = self::build_parent_map($normalized);
        $desktop_rules = array();
        $tablet_rules = array();
        $mobile_rules = array();
        $warnings = array();

        foreach ($source_map as $source_id => $descriptor) {
            if (!isset($element_types[$source_id])) continue;

            $type = $element_types[$source_id];
            $selector = self::selector_for_source($source_id, $type, $post_id);
            $parent_id = $parent_map[$source_id] ?? '';
            $desktop = $styles_by_source[$source_id]['desktop'] ?? array();
            $tablet = $styles_by_source[$source_id]['tablet'] ?? array();
            $mobile = $styles_by_source[$source_id]['mobile'] ?? array();
            $parent_desktop = $parent_id !== '' ? ($styles_by_source[$parent_id]['desktop'] ?? array()) : array();
            $parent_tablet = $parent_id !== '' ? ($styles_by_source[$parent_id]['tablet'] ?? array()) : array();
            $parent_mobile = $parent_id !== '' ? ($styles_by_source[$parent_id]['mobile'] ?? array()) : array();

            $desktop_direct = self::direct_properties($desktop, $parent_desktop, $type);
            $desktop_inner = self::inner_properties($desktop, $type);
            self::add_rule($desktop_rules, $selector, $desktop_direct);
            self::add_rule($desktop_rules, $selector . ' > .e-con-inner', $desktop_inner);

            $tablet_direct = self::direct_properties($tablet, $parent_tablet, $type);
            $tablet_inner = self::inner_properties($tablet, $type);
            self::add_rule($tablet_rules, $selector, self::properties_diff($tablet_direct, $desktop_direct));
            self::add_rule($tablet_rules, $selector . ' > .e-con-inner', self::properties_diff($tablet_inner, $desktop_inner));

            $mobile_direct = self::direct_properties($mobile, $parent_mobile, $type);
            $mobile_inner = self::inner_properties($mobile, $type);
            self::add_rule($mobile_rules, $selector, self::properties_diff($mobile_direct, $tablet_direct));
            self::add_rule($mobile_rules, $selector . ' > .e-con-inner', self::properties_diff($mobile_inner, $tablet_inner));
        }

        return self::result(
            self::dedupe_rules($desktop_rules),
            self::dedupe_rules($tablet_rules),
            self::dedupe_rules($mobile_rules),
            $warnings,
            $post_id
        );
    }

    public static function summarize($result) {
        $result = is_array($result) ? $result : array();
        return array(
            'status' => 'scoped_css',
            'post_id' => $result['post_id'] ?? 0,
            'raw_css_bytes' => $result['raw_css_bytes'] ?? 0,
            'minified_css_bytes' => $result['minified_css_bytes'] ?? 0,
            'estimated_gzip_bytes' => $result['estimated_gzip_bytes'] ?? 0,
            'desktop_rule_count' => $result['desktop_rule_count'] ?? 0,
            'tablet_rule_count' => $result['tablet_rule_count'] ?? 0,
            'mobile_rule_count' => $result['mobile_rule_count'] ?? 0,
            'total_rule_count' => $result['total_rule_count'] ?? 0,
            'warnings' => $result['warnings'] ?? array(),
        );
    }

    private static function add_rule(&$rules, $selector, $properties) {
        if ($selector === '' || empty($properties)) return;
        if (!isset($rules[$selector])) $rules[$selector] = array();
        foreach ($properties as $property => $value) $rules[$selector][$property] = $value;
    }

    private static function build_parent_map($normalized) {
        $source_map = isset($normalized['source_map']) && is_array($normalized['source_map']) ? $normalized['source_map'] : array();
        $node_lookup = array();
        $parents = array();
        foreach ($source_map as $source_id => $descriptor) {
            if (isset($descriptor['node']) && $descriptor['node'] instanceof DOMElement) $node_lookup[spl_object_id($descriptor['node'])] = $source_id;
        }
        foreach ($source_map as $source_id => $descriptor) {
            if (empty($descriptor['node']) || !($descriptor['node'] instanceof DOMElement)) continue;
            $parent = $descriptor['node']->parentNode;
            while ($parent && !($parent instanceof DOMElement)) $parent = $parent->parentNode;
            $parents[$source_id] = $parent instanceof DOMElement ? ($node_lookup[spl_object_id($parent)] ?? '') : '';
        }
        return $parents;
    }

    private static function map_element_types($elements) {
        $map = array();
        foreach ((array) $elements as $element) self::walk_element($element, $map);
        return $map;
    }

    private static function walk_element($element, &$map) {
        if (!is_array($element)) return;
        $element_id = $element['settings']['_element_id'] ?? '';
        if ($element_id !== '') {
            $source_id = preg_replace('/^hcv-v2-/', '', $element_id);
            $map[$source_id] = array('el_type' => $element['elType'] ?? 'container', 'widget_type' => $element['widgetType'] ?? '');
        }
        foreach (($element['elements'] ?? array()) as $child) self::walk_element($child, $map);
    }

    private static function selector_for_source($source_id, $type, $post_id) {
        $scope = $post_id > 0 ? '.elementor-' . absint($post_id) . ' ' : '';
        $selector = $scope . '#hcv-v2-' . sanitize_html_class($source_id);
        $widget = is_array($type) ? ($type['widget_type'] ?? '') : '';
        if ($widget === 'button') return $selector . ' .elementor-button';
        if ($widget === 'heading') return $selector . ' .elementor-heading-title';
        if ($widget === 'text-editor') return $selector . ' .elementor-widget-container';
        if ($widget === 'image') return $selector . ' img';
        if ($widget === 'html') return $selector . ' .elementor-widget-container';
        return $selector;
    }

    private static function direct_properties($styles, $parent_styles, $type) {
        $container = is_array($type) && (($type['el_type'] ?? '') === 'container');
        $allowed = array(
            'background', 'background-color', 'background-image', 'background-size', 'background-position', 'background-repeat', 'background-attachment', 'background-blend-mode',
            'color', 'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant', 'line-height', 'letter-spacing', 'word-spacing', 'text-transform', 'text-decoration', 'text-shadow', 'text-align',
            'border', 'border-top', 'border-right', 'border-bottom', 'border-left', 'border-color', 'border-style', 'border-width', 'border-radius', 'box-shadow', 'outline',
            'width', 'min-width', 'max-width', 'height', 'min-height', 'max-height', 'box-sizing',
            'flex', 'flex-basis', 'flex-grow', 'flex-shrink', 'order', 'align-self', 'justify-self',
            'position', 'top', 'right', 'bottom', 'left', 'z-index', 'overflow', 'overflow-x', 'overflow-y', 'opacity', 'visibility',
            'aspect-ratio', 'object-fit', 'object-position', 'white-space', 'transform', 'transform-origin',
            'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left'
        );
        $result = array();

        foreach ((array) $styles as $property => $value) {
            $property = strtolower(trim((string) $property));
            $value = trim((string) $value);
            if ($property === '' || $value === '' || strpos($property, '--') === 0 || !in_array($property, $allowed, true)) continue;
            if (in_array(strtolower($value), array('inherit', 'initial', 'unset', 'revert'), true)) continue;
            if ($container && in_array($property, array('display', 'flex-direction', 'flex-wrap', 'justify-content', 'align-items', 'align-content', 'gap', 'row-gap', 'column-gap'), true)) continue;
            if (in_array($property, self::$inherited_properties, true) && (($parent_styles[$property] ?? '') === $value)) continue;
            $safe = self::safe_css_value($value);
            if ($safe !== '') $result[$property] = $safe;
        }
        return $result;
    }

    private static function inner_properties($styles, $type) {
        if (!is_array($type) || ($type['el_type'] ?? '') !== 'container') return array();
        $allowed = array(
            'display', 'flex-direction', 'flex-wrap', 'flex-flow', 'justify-content', 'align-items', 'align-content',
            'justify-items', 'place-items', 'place-content',
            'gap', 'row-gap', 'column-gap',
            'grid-template-columns', 'grid-template-rows', 'grid-auto-columns', 'grid-auto-rows', 'grid-auto-flow'
        );
        $result = array();
        foreach ((array) $styles as $property => $value) {
            $property = strtolower(trim((string) $property));
            $value = trim((string) $value);
            if (!in_array($property, $allowed, true) || $value === '' || in_array(strtolower($value), array('inherit', 'initial', 'unset', 'revert'), true)) continue;
            $safe = self::safe_css_value($value);
            if ($safe !== '') $result[$property] = $safe;
        }
        return $result;
    }

    private static function properties_diff($current, $previous) {
        $diff = array();
        foreach ((array) $current as $property => $value) {
            if (!array_key_exists($property, (array) $previous) || $previous[$property] !== $value) $diff[$property] = $value;
        }
        return $diff;
    }

    private static function dedupe_rules($rules) {
        $grouped = array();
        foreach ((array) $rules as $selector => $properties) {
            if (empty($properties)) continue;
            ksort($properties);
            $key = md5(wp_json_encode($properties));
            if (!isset($grouped[$key])) $grouped[$key] = array('selectors' => array(), 'properties' => $properties);
            $grouped[$key]['selectors'][] = $selector;
        }
        $deduped = array();
        foreach ($grouped as $group) $deduped[implode(',', $group['selectors'])] = $group['properties'];
        return $deduped;
    }

    private static function safe_css_value($value) {
        $value = str_ireplace('</style', '', (string) $value);
        $value = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', '', $value);
        return trim($value);
    }

    private static function result($desktop_rules, $tablet_rules, $mobile_rules, $warnings, $post_id) {
        $desktop_css = self::rules_to_css($desktop_rules);
        $tablet_css = self::rules_to_css($tablet_rules);
        $mobile_css = self::rules_to_css($mobile_rules);
        $minified_css = $desktop_css;
        if ($tablet_css !== '') $minified_css .= '@media(max-width:1024px){' . $tablet_css . '}';
        if ($mobile_css !== '') $minified_css .= '@media(max-width:767px){' . $mobile_css . '}';
        $raw_css = self::readable_css($desktop_rules, $tablet_rules, $mobile_rules);

        return array(
            'post_id' => absint($post_id),
            'raw_css_bytes' => strlen($raw_css),
            'minified_css_bytes' => strlen($minified_css),
            'estimated_gzip_bytes' => (int) ceil(strlen($minified_css) * 0.35),
            'desktop_rule_count' => count($desktop_rules),
            'tablet_rule_count' => count($tablet_rules),
            'mobile_rule_count' => count($mobile_rules),
            'total_rule_count' => count($desktop_rules) + count($tablet_rules) + count($mobile_rules),
            'css_preview' => $minified_css,
            'css_readable' => $raw_css,
            'warnings' => $warnings,
        );
    }

    private static function rules_to_css($rules) {
        $css = '';
        foreach ((array) $rules as $selector => $properties) {
            if ($selector === '' || empty($properties)) continue;
            $css .= $selector . '{';
            foreach ($properties as $property => $value) $css .= $property . ':' . $value . ';';
            $css .= '}';
        }
        return $css;
    }

    private static function readable_css($desktop_rules, $tablet_rules, $mobile_rules) {
        $css = self::rules_to_readable_css($desktop_rules);
        if (!empty($tablet_rules)) $css .= "\n@media (max-width: 1024px) {\n" . self::indent_css(self::rules_to_readable_css($tablet_rules)) . "}\n";
        if (!empty($mobile_rules)) $css .= "\n@media (max-width: 767px) {\n" . self::indent_css(self::rules_to_readable_css($mobile_rules)) . "}\n";
        return trim($css);
    }

    private static function rules_to_readable_css($rules) {
        $css = '';
        foreach ((array) $rules as $selector => $properties) {
            if ($selector === '' || empty($properties)) continue;
            $css .= $selector . " {\n";
            foreach ($properties as $property => $value) $css .= '  ' . $property . ': ' . $value . ";\n";
            $css .= "}\n";
        }
        return $css;
    }

    private static function indent_css($css) {
        $lines = explode("\n", trim($css));
        return implode("\n", array_map(static function($line) { return $line === '' ? '' : '  ' . $line; }, $lines)) . "\n";
    }
}

<?php
/**
 * Temporary diagnostic replacement for class-hcv-layout-analyzer.php.
 * Remove after the Engine V2 test is complete.
 */

if (!defined('ABSPATH')) {
    exit;
}

class HCV_Layout_Analyzer {

    public static function analyze($normalized, $css_analysis) {
        $components = array();
        $source_map = isset($normalized['source_map']) && is_array($normalized['source_map'])
            ? $normalized['source_map']
            : array();

        foreach ($source_map as $source_id => $descriptor) {
            if (!isset($descriptor['node']) || !($descriptor['node'] instanceof DOMElement)) {
                continue;
            }

            $node = $descriptor['node'];
            $classes = isset($descriptor['classes']) && is_array($descriptor['classes'])
                ? $descriptor['classes']
                : array();

            $styles = array();
            if (isset($css_analysis['styles_by_source'][$source_id]['desktop'])) {
                $styles = is_array($css_analysis['styles_by_source'][$source_id]['desktop'])
                    ? $css_analysis['styles_by_source'][$source_id]['desktop']
                    : array();
            }

            $components[$source_id] = array(
                'source_id' => $source_id,
                'tag' => strtolower($node->tagName),
                'classes' => $classes,
                'role_hint' => isset($descriptor['role_hint']) ? $descriptor['role_hint'] : '',
                'component_type' => self::classify($node, $classes),
                'children' => array(),
                'styles' => $styles,
            );
        }

        return array(
            'components' => $components,
            'root_components' => array(),
            'stats' => array(
                'component_count' => count($components),
                'type_counts' => self::count_types($components),
            ),
        );
    }

    public static function summarize($analysis) {
        return array(
            'stats' => isset($analysis['stats']) ? $analysis['stats'] : array(),
            'root_components' => array(),
        );
    }

    public static function get_section_tree($analysis, $section_source_id) {
        return array();
    }

    private static function classify($node, $classes) {
        $tag = strtolower($node->tagName);

        if (in_array('step-node', $classes, true) || in_array('timeline__step', $classes, true)) {
            return 'step';
        }

        if (in_array('badge', $classes, true) || in_array('pill', $classes, true)) {
            return 'badge';
        }

        if (in_array('check-icon', $classes, true) || $tag === 'svg') {
            return 'icon';
        }

        if (in_array('card', $classes, true) || in_array('feature-card', $classes, true)) {
            return 'card';
        }

        if ($tag === 'h1' || $tag === 'h2' || $tag === 'h3' || $tag === 'h4' || $tag === 'h5' || $tag === 'h6') {
            return 'heading';
        }

        if ($tag === 'p') {
            return 'paragraph';
        }

        if ($tag === 'img') {
            return 'image';
        }

        if ($tag === 'a' || $tag === 'button' || $tag === 'input') {
            return 'button';
        }

        if ($tag === 'header') return 'header';
        if ($tag === 'footer') return 'footer';
        if ($tag === 'main') return 'main';
        if ($tag === 'section') return 'section';

        return 'group';
    }

    private static function count_types($components) {
        $counts = array();

        foreach ($components as $component) {
            $type = $component['component_type'];
            $counts[$type] = isset($counts[$type]) ? $counts[$type] + 1 : 1;
        }

        return $counts;
    }
}
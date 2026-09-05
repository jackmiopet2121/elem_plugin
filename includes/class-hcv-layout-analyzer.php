<?php
/**
 * HCV Engine V2 - Responsive Layout Analyzer
 *
 * Builds a source DOM tree and exposes layout information derived from the
 * computed CSS cascade. The analyzer is intentionally selector-agnostic:
 * it relies on DOM relationships and computed properties rather than on
 * template-specific class names.
 */

if (!defined('ABSPATH')) {
    exit;
}

class HCV_Layout_Analyzer {

    public static function analyze($normalized, $css_analysis) {
        $source_map = isset($normalized['source_map']) && is_array($normalized['source_map'])
            ? $normalized['source_map']
            : array();
        $node_lookup = array();
        $components = array();
        $roots = array();

        foreach ($source_map as $source_id => $descriptor) {
            if (isset($descriptor['node']) && $descriptor['node'] instanceof DOMElement) {
                $node_lookup[spl_object_id($descriptor['node'])] = $source_id;
            }
        }

        foreach ($source_map as $source_id => $descriptor) {
            if (empty($descriptor['node']) || !($descriptor['node'] instanceof DOMElement)) {
                continue;
            }

            $node = $descriptor['node'];
            $styles = array(
                'desktop' => self::source_styles($css_analysis, $source_id, 'desktop'),
                'tablet' => self::source_styles($css_analysis, $source_id, 'tablet'),
                'mobile' => self::source_styles($css_analysis, $source_id, 'mobile'),
            );
            $parent_source_id = self::parent_source_id($node, $node_lookup);

            $components[$source_id] = array(
                'source_id' => $source_id,
                'parent_source_id' => $parent_source_id,
                'tag' => strtolower($node->tagName),
                'classes' => isset($descriptor['classes']) && is_array($descriptor['classes'])
                    ? $descriptor['classes']
                    : self::classes_for_node($node),
                'role_hint' => isset($descriptor['role_hint']) ? (string) $descriptor['role_hint'] : '',
                'component_type' => self::classify($node, $styles['desktop']),
                'children' => array(),
                'styles' => $styles,
                'layout' => array(
                    'desktop' => self::layout_from_styles($styles['desktop']),
                    'tablet' => self::layout_from_styles($styles['tablet']),
                    'mobile' => self::layout_from_styles($styles['mobile']),
                ),
            );
        }

        foreach ($components as $source_id => $component) {
            $parent_source_id = $component['parent_source_id'];
            if ($parent_source_id !== '' && isset($components[$parent_source_id])) {
                $components[$parent_source_id]['children'][] = $source_id;
            } else {
                $roots[] = $source_id;
            }
        }

        return array(
            'components' => $components,
            'roots' => $roots,
            'root_components' => $roots,
            'stats' => array(
                'component_count' => count($components),
                'root_count' => count($roots),
                'type_counts' => self::count_types($components),
            ),
        );
    }

    public static function summarize($analysis) {
        return array(
            'stats' => isset($analysis['stats']) && is_array($analysis['stats'])
                ? $analysis['stats']
                : array(),
            'root_components' => isset($analysis['roots']) && is_array($analysis['roots'])
                ? $analysis['roots']
                : array(),
        );
    }

    public static function get_section_tree($analysis, $section_source_id) {
        $components = isset($analysis['components']) && is_array($analysis['components'])
            ? $analysis['components']
            : array();

        if (!isset($components[$section_source_id])) {
            return array();
        }

        return self::branch($components, $section_source_id);
    }

    private static function branch($components, $source_id) {
        $component = $components[$source_id];
        $children = array();

        foreach (($component['children'] ?? array()) as $child_id) {
            if (isset($components[$child_id])) {
                $children[] = self::branch($components, $child_id);
            }
        }

        $component['children'] = $children;
        return $component;
    }

    private static function source_styles($css_analysis, $source_id, $breakpoint) {
        $styles = $css_analysis['styles_by_source'][$source_id][$breakpoint] ?? array();
        return is_array($styles) ? $styles : array();
    }

    private static function parent_source_id($node, $node_lookup) {
        $parent = $node ? $node->parentNode : null;
        while ($parent && !($parent instanceof DOMElement)) {
            $parent = $parent->parentNode;
        }

        return $parent instanceof DOMElement
            ? ($node_lookup[spl_object_id($parent)] ?? '')
            : '';
    }

    private static function classes_for_node($node) {
        $classes = preg_split('/\s+/', trim($node->getAttribute('class')));
        return array_values(array_filter((array) $classes));
    }

    private static function classify($node, $styles) {
        $tag = strtolower($node->tagName);

        if (in_array($tag, array('h1', 'h2', 'h3', 'h4', 'h5', 'h6'), true)) return 'heading';
        if ($tag === 'p') return 'paragraph';
        if ($tag === 'img') return 'image';
        if ($tag === 'svg') return 'icon';
        if (in_array($tag, array('button', 'input'), true)) return 'button';

        if ($tag === 'a') {
            $display = strtolower(trim((string) ($styles['display'] ?? '')));
            $classes = self::classes_for_node($node);
            $button_words = array('btn', 'button', 'cta', 'action', 'primary', 'secondary');
            foreach ($classes as $class_name) {
                foreach ($button_words as $word) {
                    if (stripos($class_name, $word) !== false) return 'button';
                }
            }
            if (in_array($display, array('inline-flex', 'flex', 'inline-block', 'block'), true)) return 'button';
            return 'link';
        }

        if ($tag === 'header') return 'header';
        if ($tag === 'footer') return 'footer';
        if ($tag === 'main') return 'main';
        if ($tag === 'section') return 'section';

        return 'group';
    }

    private static function layout_from_styles($styles) {
        $keys = array(
            'display', 'flex-direction', 'flex-wrap', 'flex-flow',
            'justify-content', 'align-items', 'align-content', 'align-self',
            'justify-items', 'justify-self', 'place-items', 'place-content',
            'gap', 'row-gap', 'column-gap',
            'grid-template-columns', 'grid-template-rows', 'grid-auto-columns',
            'grid-auto-rows', 'grid-auto-flow', 'grid-column', 'grid-row',
            'order', 'flex', 'flex-basis', 'flex-grow', 'flex-shrink',
            'width', 'min-width', 'max-width', 'height', 'min-height', 'max-height',
            'position', 'top', 'right', 'bottom', 'left', 'z-index',
            'overflow', 'overflow-x', 'overflow-y', 'visibility', 'opacity',
            'aspect-ratio', 'object-fit', 'object-position'
        );
        $layout = array();

        foreach ($keys as $key) {
            if (array_key_exists($key, (array) $styles) && trim((string) $styles[$key]) !== '') {
                $layout[$key] = $styles[$key];
            }
        }

        return $layout;
    }

    private static function count_types($components) {
        $counts = array();
        foreach ($components as $component) {
            $type = $component['component_type'] ?? 'group';
            $counts[$type] = ($counts[$type] ?? 0) + 1;
        }
        return $counts;
    }
}

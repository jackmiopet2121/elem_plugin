<?php
/**
 * HCV Engine V2 - Elementor Renderer Preview
 * Safe renderer: source nodes remain DOMElement objects and are never read as arrays.
 */

if (!defined('ABSPATH')) {
    exit;
}

class HCV_Elementor_Renderer {

    private static $nodes = array();

    public static function render_preview($component_tree, $normalized, $include_header_footer = false) {
        $components = isset($component_tree['components']) && is_array($component_tree['components'])
            ? $component_tree['components']
            : array();
        $roots = isset($component_tree['roots']) && is_array($component_tree['roots'])
            ? $component_tree['roots']
            : array();
        $output = array();
        $main_source_id = self::find_main_source_id($normalized);

        if (!$include_header_footer && $main_source_id && isset($components[$main_source_id])) {
            $element = self::render_component($components, $main_source_id, $normalized);
            if (!empty($element)) {
                $output[] = $element;
            }
        } else {
            foreach ($roots as $root_id) {
                if (!isset($components[$root_id])) {
                    continue;
                }

                $root_children = isset($components[$root_id]['children']) && is_array($components[$root_id]['children'])
                    ? $components[$root_id]['children']
                    : array();

                foreach ($root_children as $child_id) {
                    if (!isset($components[$child_id])) {
                        continue;
                    }

                    $element = self::render_component($components, $child_id, $normalized);
                    if (!empty($element)) {
                        $output[] = $element;
                    }
                }
            }
        }

        return array(
            'elements' => $output,
            'stats' => self::get_stats($output),
            'warnings' => array(),
        );
    }

    public static function register_nodes($normalized) {
        self::$nodes = array();
        $source_map = isset($normalized['source_map']) && is_array($normalized['source_map'])
            ? $normalized['source_map']
            : array();

        foreach ($source_map as $source_id => $descriptor) {
            if (isset($descriptor['node']) && $descriptor['node'] instanceof DOMElement) {
                self::$nodes[$source_id] = $descriptor['node'];
            }
        }
    }

    private static function find_main_source_id($normalized) {
        foreach (($normalized['source_map'] ?? array()) as $source_id => $descriptor) {
            if (
                isset($descriptor['node']) &&
                $descriptor['node'] instanceof DOMElement &&
                strtolower($descriptor['node']->tagName) === 'main'
            ) {
                return $source_id;
            }
        }

        return '';
    }

    private static function render_component($components, $source_id, $normalized) {
        if (!isset($components[$source_id]) || !is_array($components[$source_id])) {
            return array();
        }

        $component = $components[$source_id];
        $type = isset($component['component_type']) ? $component['component_type'] : 'group';
        $tag = isset($component['tag']) ? strtolower($component['tag']) : 'div';
        $children = isset($component['children']) && is_array($component['children'])
            ? $component['children']
            : array();

        if (in_array($tag, array('style', 'script', 'meta', 'link', 'title'), true)) {
            return array();
        }

        if ($type === 'heading') return self::heading_widget($component);
        if ($type === 'paragraph') return self::text_widget($component);
        if ($type === 'image') return self::image_widget($component);

        if ($type === 'button') {
            if (self::is_button_like_link($component)) {
                return self::button_widget($component);
            }
            return self::link_widget($component);
        }

        if ($type === 'icon') return self::icon_widget($component, $normalized);

        $container = array(
            'id' => self::element_id($source_id),
            'elType' => 'container',
            'settings' => self::container_settings($component),
            'elements' => array(),
        );

        foreach ($children as $child_id) {
            $child = self::render_component($components, $child_id, $normalized);
            if (!empty($child)) {
                $container['elements'][] = $child;
            }
        }

        if (empty($container['elements']) && $type === 'group' && empty($component['classes'])) {
            return array();
        }

        // =========================================================================
        // NEW: Add hcv-v2-root class to root container (main tag)
        // =========================================================================
        $node = self::$nodes[$source_id] ?? null;
        if ($node instanceof DOMElement && strtolower($node->tagName) === 'main') {
            $container['settings']['_css_classes'] = trim(
                ($container['settings']['_css_classes'] ?? '') . ' hcv-v2-root'
            );
        }
        // =========================================================================

        return $container;
    }

    private static function heading_widget($component) {
        $tag = isset($component['tag']) ? strtolower($component['tag']) : 'h2';
        return array(
            'id' => self::element_id($component['source_id']),
            'elType' => 'widget',
            'widgetType' => 'heading',
            'settings' => array_filter(array(
                'title' => self::node_text($component),
                'header_size' => in_array($tag, array('h1', 'h2', 'h3', 'h4', 'h5', 'h6'), true) ? $tag : 'h2',
                'align' => self::text_alignment($component['styles'] ?? array()),
                '_element_id' => self::source_class($component['source_id']),
            )),
            'elements' => array(),
        );
    }

    private static function text_widget($component) {
        return array(
            'id' => self::element_id($component['source_id']),
            'elType' => 'widget',
            'widgetType' => 'text-editor',
            'settings' => array_filter(array(
                'editor' => '<p>' . esc_html(self::node_text($component)) . '</p>',
                'align' => self::text_alignment($component['styles'] ?? array()),
                '_element_id' => self::source_class($component['source_id']),
            )),
            'elements' => array(),
        );
    }

    private static function button_widget($component) {
        $node = self::node_for_component($component);
        $href = '#';

        if ($node instanceof DOMElement) {
            $candidate = trim($node->getAttribute('href'));
            if ($candidate !== '') $href = $candidate;
        }

        return array(
            'id' => self::element_id($component['source_id']),
            'elType' => 'widget',
            'widgetType' => 'button',
            'settings' => array(
                'text' => self::node_text($component),
                'link' => array('url' => $href, 'is_external' => false, 'nofollow' => false),
                '_element_id' => self::source_class($component['source_id']),
            ),
            'elements' => array(),
        );
    }

    private static function link_widget($component) {
        $node = self::node_for_component($component);
        $href = '#';

        if ($node instanceof DOMElement) {
            $candidate = trim($node->getAttribute('href'));
            if ($candidate !== '') $href = $candidate;
        }

        return array(
            'id' => self::element_id($component['source_id']),
            'elType' => 'widget',
            'widgetType' => 'text-editor',
            'settings' => array(
                'editor' => '<a href="' . esc_url($href) . '">' . esc_html(self::node_text($component)) . '</a>',
                '_element_id' => self::source_class($component['source_id']),
            ),
            'elements' => array(),
        );
    }

    private static function image_widget($component) {
        $node = self::node_for_component($component);
        $src = '';
        $alt = '';

        if ($node instanceof DOMElement) {
            $src = trim($node->getAttribute('src'));
            $alt = trim($node->getAttribute('alt'));
        }

        return array(
            'id' => self::element_id($component['source_id']),
            'elType' => 'widget',
            'widgetType' => 'image',
            'settings' => array(
                'image' => array('url' => $src, 'id' => 0),
                'image_size' => 'full',
                'caption_source' => 'none',
                '_element_id' => self::source_class($component['source_id']),
                '_title' => $alt,
            ),
            'elements' => array(),
        );
    }

    private static function icon_widget($component, $normalized) {
        $node = self::node_for_component($component);
        $html = '';

        if ($node instanceof DOMElement && strtolower($node->tagName) === 'svg') {
            $html = $node->ownerDocument->saveHTML($node);
        }

        if ($html === '') $html = '<span class="hcv-icon-placeholder"></span>';

        return array(
            'id' => self::element_id($component['source_id']),
            'elType' => 'widget',
            'widgetType' => 'html',
            'settings' => array(
                'html' => $html,
                '_element_id' => self::source_class($component['source_id']),
            ),
            'elements' => array(),
        );
    }

    private static function node_for_component($component) {
        return self::$nodes[$component['source_id']] ?? null;
    }

    private static function node_text($component) {
        $node = self::node_for_component($component);
        if (!($node instanceof DOMElement)) return '';
        return trim(preg_replace('/\s+/', ' ', $node->textContent));
    }

    private static function is_button_like_link($component) {
        $node = self::node_for_component($component);
        if (!($node instanceof DOMElement)) return false;

        $tag = strtolower($node->tagName);
        if ($tag === 'button') return true;

        if ($tag === 'input') {
            return in_array(strtolower($node->getAttribute('type')), array('submit', 'button', 'reset'), true);
        }

        if ($tag !== 'a') return false;

        $classes = preg_split('/\s+/', trim($node->getAttribute('class')));
        foreach (($classes ?: array()) as $class_name) {
            $class_name = strtolower($class_name);
            foreach (array('btn', 'button', 'cta', 'action', 'primary', 'secondary') as $word) {
                if (strpos($class_name, $word) !== false) return true;
            }
        }

        $styles = $component['styles'] ?? array();
        return in_array($styles['display'] ?? '', array('inline-flex', 'flex'), true);
    }

    private static function container_settings($component) {
        $styles = $component['styles'] ?? array();
        $settings = array('_element_id' => self::source_class($component['source_id']));

        if (!empty($component['classes'])) $settings['_css_classes'] = implode(' ', $component['classes']);

        if (($styles['display'] ?? '') === 'flex') {
            $settings['flex_direction'] = $styles['flex-direction'] ?? 'column';
            if (!empty($styles['justify-content'])) $settings['justify_content'] = $styles['justify-content'];
            if (!empty($styles['align-items'])) $settings['align_items'] = $styles['align-items'];
            if (!empty($styles['gap'])) $settings['gap'] = array('unit' => 'px', 'size' => self::px_value($styles['gap']));
        }

        if (!empty($styles['padding'])) $settings['padding'] = self::box_setting($styles['padding'], false);
        if (!empty($styles['margin'])) $settings['margin'] = self::box_setting($styles['margin'], false);

        $background = $styles['background-color'] ?? '';
        if ($background === '' && !empty($styles['background']) && self::is_hex_color($styles['background'])) $background = $styles['background'];
        if ($background !== '' && self::is_hex_color($background)) {
            $settings['background_background'] = 'classic';
            $settings['background_color'] = $background;
        }

        if (!empty($styles['border-radius'])) $settings['border_radius'] = self::box_setting($styles['border-radius'], true);
        if (!empty($styles['width']) && strpos($styles['width'], '%') !== false) $settings['width'] = 'full';

        return $settings;
    }

    private static function box_setting($value, $linked) {
        $parts = array_values(array_filter(preg_split('/\s+/', trim($value))));
        $top = $parts[0] ?? '0';
        $right = $parts[1] ?? $top;
        $bottom = $parts[2] ?? $top;
        $left = $parts[3] ?? $right;

        return array(
            'unit' => 'px',
            'top' => self::px_value($top),
            'right' => self::px_value($right),
            'bottom' => self::px_value($bottom),
            'left' => self::px_value($left),
            'isLinked' => $linked,
        );
    }

    private static function px_value($value) {
        if (preg_match('/-?[0-9.]+/', (string) $value, $match)) return floatval($match[0]);
        return 0;
    }

    private static function is_hex_color($value) {
        return (bool) preg_match('/^#[a-f0-9]{3,8}$/i', trim($value));
    }

    private static function text_alignment($styles) {
        $value = $styles['text-align'] ?? '';
        return in_array($value, array('left', 'center', 'right', 'justify'), true) ? $value : '';
    }

    private static function element_id($source_id) {
        return substr(md5('hcv-v2-' . $source_id), 0, 7);
    }

    private static function source_class($source_id) {
        return 'hcv-v2-' . sanitize_html_class($source_id);
    }

    private static function get_stats($elements) {
        $stats = array('root_elements' => count($elements), 'containers' => 0, 'widgets' => 0, 'widget_types' => array());
        foreach ($elements as $element) self::count_element($element, $stats);
        return $stats;
    }

    private static function count_element($element, &$stats) {
        if (($element['elType'] ?? '') === 'container') $stats['containers']++;
        if (($element['elType'] ?? '') === 'widget') {
            $stats['widgets']++;
            $type = $element['widgetType'] ?? 'unknown';
            $stats['widget_types'][$type] = ($stats['widget_types'][$type] ?? 0) + 1;
        }
        foreach (($element['elements'] ?? array()) as $child) self::count_element($child, $stats);
    }
}
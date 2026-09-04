<?php
/**
 * HCV Engine V2 - Scoped CSS Fallback Generator
 *
 * Preview-only CSS fallback generated from HCV_CSS_Cascade output.
 * This version removes inherited typography duplication and emits only
 * visual CSS that the current V2 Elementor renderer does not map natively.
 *
 * @package Gemini_HTML_to_Elementor_Universal_Pro
 * @since 8.6.1
 */

if (!defined('ABSPATH')) {
    exit;
}

class HCV_Scoped_Style_Generator {

    private static $inherited_properties = array(
        'color',
        'font-family',
        'font-size',
        'font-weight',
        'font-style',
        'font-variant',
        'line-height',
        'letter-spacing',
        'word-spacing',
        'text-align',
        'text-transform',
        'text-decoration',
    );

    /**
     * Build fallback CSS from Engine V2 computed styles.
     *
     * @param array $normalized Result from HCV_DOM_Normalizer::normalize().
     * @param array $css_analysis Result from HCV_CSS_Cascade::analyze().
     * @param array $elements Renderer output: $render_preview['elements'].
     * @param int   $post_id Target WordPress page ID. Use 0 for preview-only.
     * @return array
     */
    public static function generate($normalized, $css_analysis, $elements, $post_id = 0) {
        $source_map = isset($normalized['source_map']) && is_array($normalized['source_map'])
            ? $normalized['source_map']
            : array();
        $styles_by_source = isset($css_analysis['styles_by_source']) && is_array($css_analysis['styles_by_source'])
            ? $css_analysis['styles_by_source']
            : array();
        $element_types = self::map_element_types($elements);
        $parent_map = self::build_parent_map($normalized);
        $desktop_rules = array();
        $tablet_rules = array();
        $mobile_rules = array();
        $warnings = array();

        if (empty($source_map)) {
            return self::result(array(), array(), array(), array(array(
                'code' => 'missing_source_map',
                'message' => 'No normalized source map was available for scoped CSS generation.',
            )), $post_id);
        }

        foreach ($source_map as $source_id => $descriptor) {
            if (!isset($element_types[$source_id])) {
                continue;
            }

            $element_type = $element_types[$source_id];
            $selector = self::selector_for_source($source_id, $element_type, $post_id);
            $parent_source_id = $parent_map[$source_id] ?? '';

            $desktop_styles = $styles_by_source[$source_id]['desktop'] ?? array();
            $parent_desktop = $parent_source_id !== ''
                ? ($styles_by_source[$parent_source_id]['desktop'] ?? array())
                : array();
            $desktop_fallback = self::fallback_properties(
                $desktop_styles,
                $parent_desktop,
                $element_type
            );

            if (!empty($desktop_fallback)) {
                $desktop_rules[$selector] = $desktop_fallback;
            }

            /*
             * Elementor containers zaydin <div class="e-con-inner">.
             * Children kaykouno dakhel had wrapper, donc flex/gap khas hom ytmssou lih.
             */
            $desktop_inner = self::container_inner_properties(
                $desktop_styles,
                $element_type
            );

            if (!empty($desktop_inner)) {
                $desktop_rules[$selector . ' > .e-con-inner'] = $desktop_inner;
            }

            $tablet_styles = $styles_by_source[$source_id]['tablet'] ?? array();
            $parent_tablet = $parent_source_id !== ''
                ? ($styles_by_source[$parent_source_id]['tablet'] ?? array())
                : array();
            $tablet_fallback = self::fallback_properties(
                $tablet_styles,
                $parent_tablet,
                $element_type
            );

            $tablet_diff = self::properties_diff(
                $tablet_fallback,
                $desktop_fallback
            );

            if (!empty($tablet_diff)) {
                $tablet_rules[$selector] = $tablet_diff;
            }

            $tablet_inner = self::container_inner_properties(
                $tablet_styles,
                $element_type
            );

            $desktop_inner = self::container_inner_properties(
                $desktop_styles,
                $element_type
            );

            $tablet_inner_diff = self::properties_diff(
                $tablet_inner,
                $desktop_inner
            );

            if (!empty($tablet_inner_diff)) {
                $tablet_rules[$selector . ' > .e-con-inner'] = $tablet_inner_diff;
            }

            /*
             * Responsive safety fallback:
             * f tablet/mobile, stack flex layouts vertically.
             */
            $tablet_stack = self::responsive_stack_properties(
                $desktop_styles,
                $element_type
            );

            if (!empty($tablet_stack)) {
                $tablet_rules[$selector . ' > .e-con-inner'] = array_merge(
                    $tablet_rules[$selector . ' > .e-con-inner'] ?? array(),
                    $tablet_stack
                );
            }

            $mobile_styles = $styles_by_source[$source_id]['mobile'] ?? array();
            $parent_mobile = $parent_source_id !== ''
                ? ($styles_by_source[$parent_source_id]['mobile'] ?? array())
                : array();
            $mobile_fallback = self::fallback_properties(
                $mobile_styles,
                $parent_mobile,
                $element_type
            );

            $mobile_diff = self::properties_diff(
                $mobile_fallback,
                $tablet_fallback
            );

            if (!empty($mobile_diff)) {
                $mobile_rules[$selector] = $mobile_diff;
            }

            $mobile_inner = self::container_inner_properties(
                $mobile_styles,
                $element_type
            );

            $tablet_inner = self::container_inner_properties(
                $tablet_styles,
                $element_type
            );

            $mobile_inner_diff = self::properties_diff(
                $mobile_inner,
                $tablet_inner
            );

            if (!empty($mobile_inner_diff)) {
                $mobile_rules[$selector . ' > .e-con-inner'] = $mobile_inner_diff;
            }

            $mobile_stack = self::responsive_stack_properties(
                $desktop_styles,
                $element_type
            );

            if (!empty($mobile_stack)) {
                $mobile_rules[$selector . ' > .e-con-inner'] = array_merge(
                    $mobile_rules[$selector . ' > .e-con-inner'] ?? array(),
                    $mobile_stack
                );
            }
        }

        $desktop_rules = self::dedupe_rules($desktop_rules);
        $tablet_rules = self::dedupe_rules($tablet_rules);
        $mobile_rules = self::dedupe_rules($mobile_rules);

        return self::result($desktop_rules, $tablet_rules, $mobile_rules, $warnings, $post_id);
    }

    public static function summarize($result) {
        $result = is_array($result) ? $result : array();

        return array(
            'status' => 'preview_only',
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

    private static function build_parent_map($normalized) {
        $source_map = isset($normalized['source_map']) && is_array($normalized['source_map'])
            ? $normalized['source_map']
            : array();
        $node_lookup = array();
        $parents = array();

        foreach ($source_map as $source_id => $descriptor) {
            if (isset($descriptor['node']) && $descriptor['node'] instanceof DOMElement) {
                $node_lookup[spl_object_id($descriptor['node'])] = $source_id;
            }
        }

        foreach ($source_map as $source_id => $descriptor) {
            if (empty($descriptor['node']) || !($descriptor['node'] instanceof DOMElement)) {
                continue;
            }

            $parent = $descriptor['node']->parentNode;
            while ($parent && !($parent instanceof DOMElement)) {
                $parent = $parent->parentNode;
            }

            if ($parent instanceof DOMElement) {
                $parents[$source_id] = $node_lookup[spl_object_id($parent)] ?? '';
            } else {
                $parents[$source_id] = '';
            }
        }

        return $parents;
    }

    private static function map_element_types($elements) {
        $map = array();
        foreach ((array) $elements as $element) {
            self::walk_element($element, $map);
        }
        return $map;
    }

    private static function walk_element($element, &$map) {
        if (!is_array($element)) {
            return;
        }

        $element_id = $element['settings']['_element_id'] ?? '';
        if ($element_id !== '') {
            $source_id = preg_replace('/^hcv-v2-/', '', $element_id);
            $map[$source_id] = array(
                'el_type' => $element['elType'] ?? 'container',
                'widget_type' => $element['widgetType'] ?? '',
            );
        }

        foreach (($element['elements'] ?? array()) as $child) {
            self::walk_element($child, $map);
        }
    }

    private static function selector_for_source($source_id, $element_type, $post_id) {
        $element_id = 'hcv-v2-' . sanitize_html_class($source_id);
        $scope = $post_id > 0 ? '.elementor-' . absint($post_id) . ' ' : '';
        $selector = $scope . '#' . $element_id;
        $widget_type = is_array($element_type) ? ($element_type['widget_type'] ?? '') : '';

        if ($widget_type === 'button') {
            return $selector . ' .elementor-button';
        }
        if ($widget_type === 'heading') {
            return $selector . ' .elementor-heading-title';
        }
        if ($widget_type === 'text-editor') {
            return $selector . ' .elementor-widget-container';
        }
        if ($widget_type === 'image') {
            return $selector . ' img';
        }
        if ($widget_type === 'html') {
            return $selector . ' .elementor-widget-container';
        }

        return $selector;
    }

    /**
     * Keep only styles that V2 renderer does not map natively.
     * Inherited properties are emitted only when their value differs from the parent.
     */
    private static function fallback_properties($styles, $parent_styles, $element_type) {
        $allowed = array(
            'background',
            'background-image',
            'background-size',
            'background-position',
            'background-repeat',
            'background-attachment',
            'background-blend-mode',
            'background-color',
            'color',
            'font-family',
            'font-size',
            'font-weight',
            'font-style',
            'font-variant',
            'line-height',
            'letter-spacing',
            'word-spacing',
            'text-transform',
            'text-decoration',
            'text-shadow',
            'border',
            'border-top',
            'border-right',
            'border-bottom',
            'border-left',
            'border-color',
            'border-style',
            'border-width',
            'border-radius',
            'box-shadow',
            'outline',
            'width',
            'height',
            'min-width',
            'min-height',
            'max-width',
            'max-height',
            'flex-basis',
            'flex-grow',
            'flex-shrink',
            'object-fit',
            'object-position',
            'opacity',
            'overflow',
            'overflow-x',
            'overflow-y',
            'fill',
            'stroke',
            'stroke-width',
            'padding',
            'margin',
            'text-align',
            'display',
            'align-items',
            'justify-content',
            'gap',
            'white-space',
            'flex-direction',
            'flex-wrap',
            'align-content',
            'row-gap',
            'column-gap',
        );

        /*
         * These properties are generally rendered natively by Elementor
         * for containers. We do not add them as generic fallback CSS.
         *
         * Buttons are an exception; their visible HTML is .elementor-button,
         * so their styles must be preserved in generated fallback CSS.
         */
        $skip = array(
            'display',
            'flex-direction',
            'justify-content',
            'align-items',
            'align-content',
            'flex-wrap',
            'gap',
            'row-gap',
            'column-gap',
            'padding',
            'margin',
            'background-color',
            'border-radius',
            'text-align',
            'position',
            'z-index',
            'transform',
            'transition',
            'animation',
            'cursor',
            'visibility',
        );

        // Had value kattsayeb mra wa7da, machi dakhel foreach.
        $widget_type = is_array($element_type)
            ? ($element_type['widget_type'] ?? '')
            : '';

        $is_button = ($widget_type === 'button');

        $button_properties = array(
            'background',
            'background-color',
            'color',
            'padding',
            'margin',
            'border',
            'border-top',
            'border-right',
            'border-bottom',
            'border-left',
            'border-color',
            'border-style',
            'border-width',
            'border-radius',
            'box-shadow',
            'font-family',
            'font-size',
            'font-weight',
            'font-style',
            'line-height',
            'letter-spacing',
            'text-transform',
            'text-decoration',
            'text-align',
            'display',
            'align-items',
            'justify-content',
            'gap',
            'white-space',
            'min-width',
            'width',
            'height',
            'min-height',
            'max-width',
            'opacity',
        );

        $result = array();

        foreach ((array) $styles as $property => $value) {
            $property = strtolower(trim((string) $property));
            $value = trim((string) $value);

            if ($property === '' || $value === '' || strpos($property, '--') === 0) {
                continue;
            }

            /*
             * Ila had element button, nkhlliw properties dyal design
             * ydowzo 7tta ila kaynin f $skip.
             */
            if (
                !$is_button &&
                (in_array($property, $skip, true) || !in_array($property, $allowed, true))
            ) {
                continue;
            }

            /*
             * Ila button, nkhlliw ghir lproperties li kay7taj
             * w ma nkhlliwch chi property gharib ykhrreb output.
             */
            if (
                $is_button &&
                !in_array($property, $button_properties, true)
            ) {
                continue;
            }

            if (in_array(strtolower($value), array('inherit', 'initial', 'unset', 'revert'), true)) {
                continue;
            }

            /*
             * Generic containers ma n7tajouch simple hex background f CSS
             * 7it renderer y9der ymapih native.
             * Buttons khas hom background yb9a.
             */
            if (
                $property === 'background' &&
                self::is_simple_hex_background($value) &&
                !$is_button
            ) {
                continue;
            }

            if (in_array($property, self::$inherited_properties, true)) {
                $parent_value = isset($parent_styles[$property])
                    ? trim((string) $parent_styles[$property])
                    : '';

                if ($parent_value === $value) {
                    continue;
                }
            }

            $safe_value = self::safe_css_value($value);

            if ($safe_value !== '') {
                $result[$property] = $safe_value;
            }
        }

        return $result;
    }

    private static function is_simple_hex_background($value) {
        return (bool) preg_match('/^#[a-f0-9]{3,8}$/i', trim($value));
    }

    private static function safe_css_value($value) {
        $value = str_ireplace('</style', '', (string) $value);
        $value = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', '', $value);
        return trim($value);
    }
    
    /**
     * Katkhrrej ghir flex/layout properties li khas ytmssou
     * l .e-con-inner dyal Elementor containers.
     */
    private static function container_inner_properties($styles, $element_type) {
        $el_type = is_array($element_type)
            ? ($element_type['el_type'] ?? '')
            : '';

        // Ghir Elementor containers 3andhom .e-con-inner.
        if ($el_type !== 'container') {
            return array();
        }

        $layout_properties = array(
            'display',
            'flex-direction',
            'justify-content',
            'align-items',
            'align-content',
            'flex-wrap',
            'gap',
            'row-gap',
            'column-gap',
        );

        $result = array();

        foreach ((array) $styles as $property => $value) {
            $property = strtolower(trim((string) $property));
            $value = trim((string) $value);

            if (
                !in_array($property, $layout_properties, true) ||
                $value === '' ||
                in_array(strtolower($value), array('inherit', 'initial', 'unset', 'revert'), true)
            ) {
                continue;
            }

            $safe_value = self::safe_css_value($value);

            if ($safe_value !== '') {
                $result[$property] = $safe_value;
            }
        }

        return $result;
    }

    /**
     * Fix responsive flex layouts for Elementor containers.
     *
     * Ila child f tablet/mobile wla width: 100%, parent flex row
     * khaso ystacki children vertically. Hadi kat3awd behavior
     * li source HTML kay3tih implicit b flex-wrap/layout.
     */
    private static function responsive_stack_properties($styles, $element_type) {
        $el_type = is_array($element_type)
            ? ($element_type['el_type'] ?? '')
            : '';

        if ($el_type !== 'container') {
            return array();
        }

        $flex_direction = strtolower(trim((string) ($styles['flex-direction'] ?? '')));
        $display = strtolower(trim((string) ($styles['display'] ?? '')));

        // Ghir layouts flex row li khasshom ystackiw f responsive.
        if (
            $flex_direction !== 'row' &&
            $display !== 'flex' &&
            $display !== 'inline-flex'
        ) {
            return array();
        }

        return array(
            'flex-direction' => 'column',
            'align-items' => 'stretch',
            'justify-content' => 'flex-start',
        );
    }

    private static function properties_diff($current, $previous) {
        $diff = array();
        foreach ((array) $current as $property => $value) {
            if (!array_key_exists($property, (array) $previous) || $previous[$property] !== $value) {
                $diff[$property] = $value;
            }
        }
        return $diff;
    }

    private static function dedupe_rules($rules) {
        $grouped = array();

        foreach ((array) $rules as $selector => $properties) {
            if (empty($properties)) {
                continue;
            }
            ksort($properties);
            $key = md5(wp_json_encode($properties));

            if (!isset($grouped[$key])) {
                $grouped[$key] = array(
                    'selectors' => array(),
                    'properties' => $properties,
                );
            }
            $grouped[$key]['selectors'][] = $selector;
        }

        $deduped = array();
        foreach ($grouped as $group) {
            $deduped[implode(',', $group['selectors'])] = $group['properties'];
        }
        return $deduped;
    }

    private static function result($desktop_rules, $tablet_rules, $mobile_rules, $warnings, $post_id) {
        $desktop_css = self::rules_to_css($desktop_rules);
        $tablet_css = self::rules_to_css($tablet_rules);
        $mobile_css = self::rules_to_css($mobile_rules);
        $raw_css = self::readable_css($desktop_rules, $tablet_rules, $mobile_rules);
        $minified_css = $desktop_css;

        if ($tablet_css !== '') {
            $minified_css .= '@media(max-width:1024px){' . $tablet_css . '}';
        }
        if ($mobile_css !== '') {
            $minified_css .= '@media(max-width:767px){' . $mobile_css . '}';
        }

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
            if ($selector === '' || empty($properties)) {
                continue;
            }
            $css .= $selector . '{';
            foreach ($properties as $property => $value) {
                $css .= $property . ':' . $value . ';';
            }
            $css .= '}';
        }
        return $css;
    }

    private static function readable_css($desktop_rules, $tablet_rules, $mobile_rules) {
        $css = self::rules_to_readable_css($desktop_rules);

        if (!empty($tablet_rules)) {
            $css .= "\n@media (max-width: 1024px) {\n";
            $css .= self::indent_css(self::rules_to_readable_css($tablet_rules));
            $css .= "}\n";
        }
        if (!empty($mobile_rules)) {
            $css .= "\n@media (max-width: 767px) {\n";
            $css .= self::indent_css(self::rules_to_readable_css($mobile_rules));
            $css .= "}\n";
        }
        return trim($css);
    }

    private static function rules_to_readable_css($rules) {
        $css = '';
        foreach ((array) $rules as $selector => $properties) {
            if ($selector === '' || empty($properties)) {
                continue;
            }
            $css .= $selector . " {\n";
            foreach ($properties as $property => $value) {
                $css .= '  ' . $property . ': ' . $value . ";\n";
            }
            $css .= "}\n";
        }
        return $css;
    }

    private static function indent_css($css) {
        $lines = explode("\n", trim($css));
        $lines = array_map(static function($line) {
            return $line === '' ? '' : '  ' . $line;
        }, $lines);
        return implode("\n", $lines) . "\n";
    }

    // =========================================================================
    // NEW: Automatic detection methods for root + media containers
    // =========================================================================

    /**
     * Detect root container ID from HTML
     *
     * @param string $html
     * @return string|null
     */
    private static function detect_root_container_id( $html ) {
        $pattern = '/<div\s+id="(hcv-v2-hcv-\d+)"/';

        if ( preg_match( $pattern, $html, $matches ) ) {
            return $matches[1];
        }

        return null;
    }

    /**
     * Detect media container ID from HTML (container with img tag)
     *
     * @param string $html
     * @return string|null
     */
    private static function detect_media_container_id( $html ) {
        $pattern = '/<div\s+id="(hcv-v2-hcv-\d+)"[^>]*>.*?<img[^>]*>/s';

        if ( preg_match( $pattern, $html, $matches ) ) {
            return $matches[1];
        }

        return null;
    }

        // =========================================================================
    // NEW: HTML modifier — adds wrapper classes for scoped CSS
    // =========================================================================

    /**
     * Modify HTML output to add wrapper classes for responsive normalization.
     *
     * @param string $html Original HTML from converter.
     * @param int    $post_id Target WordPress page ID.
     * @return string Modified HTML.
     */
    public static function modify_html_for_responsive( $html, $post_id = 0 ) {
        $root_id = self::detect_root_container_id( $html );
        $media_id = self::detect_media_container_id( $html );

        // Add hcv-v2-root class to root container
        if ( $root_id ) {
            $html = preg_replace(
                '/(<div\s+id="' . preg_quote( $root_id, '/' ) . '")/',
                '$1 class="hcv-v2-root hcv-v2-root-' . absint( $post_id ) . '"',
                $html,
                1 // only first match
            );
        }

        // Add hcv-media-wrapper class to media container
        if ( $media_id ) {
            $html = preg_replace(
                '/(<div\s+id="' . preg_quote( $media_id, '/' ) . '")/',
                '$1 class="hcv-media-wrapper"',
                $html,
                1
            );
        }

        return $html;
    }

    // =========================================================================
    // NEW: Responsive normalization CSS block
    // =========================================================================

    /**
     * Generate responsive normalization CSS for Elementor V2 containers.
     *
     * @param int $post_id Target WordPress page ID.
     * @return string CSS rules.
     */
    public static function generate_responsive_normalization_css( $post_id = 0 ) {
    $scope = $post_id > 0 ? '.elementor-' . absint( $post_id ) . ' ' : '';

    return "
  {$scope}.hcv-v2-root,
  {$scope}.hcv-v2-root * {
    box-sizing: border-box;
  }
  {$scope}.hcv-v2-root .e-con {
    width: auto !important;
    max-width: 100% !important;
  }
  @media (max-width: 767px) {
  {$scope}.hcv-v2-root > .e-con-inner {
    max-width: min(100%, 767px) !important;
    width: 100% !important;
    margin-inline: auto !important;
    padding-inline: 20px !important;
  }
  {$scope}.hcv-v2-root .e-con {
    max-width: 380px !important;
    min-width: 380px !important;
    width: 380px !important;
    flex: 0 0 380px !important;
    margin-inline: auto !important;
  }
  {$scope}.hcv-v2-root .e-con .e-con,
  {$scope}.hcv-v2-root .e-con .e-con .e-con {
    max-width: 260px !important;
    min-width: 260px !important;
    width: 260px !important;
    flex: 0 0 260px !important;
    margin-inline: auto !important;
  }
  {$scope}.hcv-v2-root .e-con img {
    max-width: 100% !important;
    width: auto !important;
    height: auto !important;
  }
}";
}

    // =========================================================================
    // NEW: Combined helper — applies responsive normalization to HTML + CSS
    // =========================================================================

    /**
     * Apply responsive normalization to HTML and CSS.
     *
     * @param string $html Original converted HTML.
     * @param string $css  Original scoped CSS preview.
     * @param int    $post_id Target WordPress page ID.
     * @return array {
     *     @type string $html Modified HTML with wrapper classes.
     *     @type string $css  Modified CSS with responsive normalization.
     * }
     */
    public static function apply_responsive_normalization( $html, $css, $post_id = 0 ) {
        // Modify HTML to add wrapper classes
        $modified_html = self::modify_html_for_responsive( $html, $post_id );

        // Append responsive normalization CSS
        $responsive_css = self::generate_responsive_normalization_css( $post_id );
        $modified_css = $css . $responsive_css;

        return array(
            'html' => $modified_html,
            'css'  => $modified_css,
        );
    }
}
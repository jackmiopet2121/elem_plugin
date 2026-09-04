<?php
/**
 * Universal Native Elementor Compiler Engine
 * Package: Gemini HTML to Elementor Universal Pro
 * Version: 8.3.0 — Zero gap/padding fix for fixed-size circular components
 */

if (!defined('ABSPATH')) exit;

class HCV_Universal_Compiler {

    public static function compile($parsed, $layout_mode = 'theme_hf') {
        $elements = [];
        $css_ast = $parsed['css_ast'] ?? [];

        foreach (($parsed['sections'] ?? []) as $sec_node) {
            $container = self::dom_to_elementor($sec_node, $css_ast, true);

            if ($container) {
                $elements[] = $container;
            }
        }

        return $elements;
    }

    // ═══════════════════════════════════════════════════════
    // MAIN RECURSIVE DOM → ELEMENTOR COMPILER
    // ═══════════════════════════════════════════════════════

    public static function dom_to_elementor($node, $css_ast, $is_root = false) {
        if (!($node instanceof DOMElement)) {
            return null;
        }

        $tag = strtolower($node->tagName);

        if (in_array($tag, [
            'script', 'style', 'link', 'meta', 'title',
            'head', 'noscript', 'input', 'br', 'hr', 'template'
        ], true)) {
            return null;
        }

        $cls = trim($node->getAttribute('class'));
        $id = trim($node->getAttribute('id'));

        $styles = HCV_Universal_Parser::get_computed_styles($node, $css_ast);
        $hover_styles = HCV_Universal_Parser::get_hover_styles($node, $css_ast);

        if (in_array($tag, ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'], true)) {
            return self::build_heading_widget($node, $tag, $styles, $cls, $id);
        }

        if ($tag === 'img') {
            return self::build_image_widget($node, $styles, $cls, $id);
        }

        if (self::is_button($node, $tag, $cls, $css_ast)) {
            return self::build_button_widget($node, $styles, $hover_styles, $cls, $id);
        }

        if ($tag === 'details') {
            return self::build_accordion_widget($node, $styles, $css_ast, $cls, $id);
        }

        $cls_lower = strtolower($cls);

        if (
            (
                stripos($cls_lower, 'faq-accordion') !== false ||
                stripos($cls_lower, 'faq-toggle') !== false ||
                stripos($cls_lower, 'accordion-widget') !== false
            ) &&
            self::has_multiple_faq_items($node)
        ) {
            return self::build_faq_accordion($node, $css_ast, $cls, $id);
        }

        if ($tag === 'svg') {
            return self::build_svg_element($node, $styles, $cls, $id);
        }

        if (self::is_leaf_text_node($node, $css_ast)) {
            $text = trim($node->textContent);

            if ($text !== '') {
                return self::build_text_widget($text, $styles, $cls, $id);
            }
        }

        return self::build_container($node, $css_ast, $styles, $cls, $id, $is_root);
    }

    // ═══════════════════════════════════════════════════════
    // WIDGET BUILDERS
    // ═══════════════════════════════════════════════════════

    private static function build_heading_widget($node, $tag, $styles, $cls, $id) {
        $text = html_entity_decode(trim($node->textContent), ENT_QUOTES, 'UTF-8');

        $settings = [
            'title'       => $text,
            'header_size' => $tag,
        ];

        $typo = HCV_Elementor_Schema::parse_typography($styles);

        if (!empty($typo)) {
            $settings = array_merge($settings, $typo);
        }

        if (!empty($styles['color'])) {
            $settings['title_color'] = $styles['color'];
        }

        $align = strtolower($styles['text-align'] ?? '');

        if (in_array($align, ['left', 'center', 'right', 'justify'], true)) {
            $settings['align'] = $align;
        }

        self::apply_widget_spacing($settings, $styles);

        if ($cls) {
            $settings['_css_classes'] = $cls;
        }

        if ($id) {
            $settings['_element_id'] = $id;
        }

        return [
            'id'         => HCV_Elementor_Schema::gen_id(),
            'elType'     => 'widget',
            'widgetType' => 'heading',
            'settings'   => $settings,
            'elements'   => [],
        ];
    }

    private static function build_image_widget($node, $styles, $cls, $id) {
        $src = trim($node->getAttribute('src'));

        if ($src === '') {
            return null;
        }

        $alt = $node->getAttribute('alt') ?: 'Image';

        $settings = [
            'image' => [
                'url' => $src,
                'id'  => '',
                'alt' => $alt,
            ],
            'image_size' => 'full',
        ];

        if (!empty($styles['width'])) {
            $size = HCV_Elementor_Schema::parse_size($styles['width']);

            if ($size) {
                $settings['width'] = $size;
            }
        }

        if (!empty($styles['max-width'])) {
            $size = HCV_Elementor_Schema::parse_size($styles['max-width']);

            if ($size) {
                $settings['max_width'] = $size;
            }
        }

        if (!empty($styles['height'])) {
            $size = HCV_Elementor_Schema::parse_size($styles['height']);

            if ($size) {
                $settings['height'] = $size;
            }
        }

        $fit = strtolower($styles['object-fit'] ?? '');

        if (in_array($fit, ['cover', 'contain', 'fill', 'scale-down'], true)) {
            $settings['object_fit'] = $fit;
        }

        $border = HCV_Elementor_Schema::parse_border_and_radius($styles);

        if (!empty($border)) {
            $settings = array_merge($settings, $border);
        }

        $opacity = HCV_Elementor_Schema::parse_opacity($styles);

        if (!empty($opacity)) {
            $settings = array_merge($settings, $opacity);
        }

        if (!empty($styles['box-shadow'])) {
            $shadow = HCV_Elementor_Schema::parse_box_shadow($styles['box-shadow']);

            if ($shadow) {
                $settings = array_merge($settings, $shadow);
            }
        }

        $align = strtolower($styles['text-align'] ?? '');

        if (in_array($align, ['left', 'center', 'right'], true)) {
            $settings['align'] = $align;
        }

        self::apply_widget_spacing($settings, $styles);

        if ($cls) {
            $settings['_css_classes'] = $cls;
        }

        if ($id) {
            $settings['_element_id'] = $id;
        }

        return [
            'id'         => HCV_Elementor_Schema::gen_id(),
            'elType'     => 'widget',
            'widgetType' => 'image',
            'settings'   => $settings,
            'elements'   => [],
        ];
    }

    private static function build_button_widget($node, $styles, $hover_styles, $cls, $id) {
        $text = html_entity_decode(trim($node->textContent), ENT_QUOTES, 'UTF-8');
        $href = $node->getAttribute('href') ?: '#';

        $settings = [
            'text' => $text,
            'link' => [
                'url'         => $href,
                'is_external' => false,
                'nofollow'    => false,
            ],
        ];

        $background = HCV_Elementor_Schema::parse_background($styles);

        if (!empty($background)) {
            $settings = array_merge($settings, $background);
        }

        if (!empty($styles['color'])) {
            $settings['button_text_color'] = $styles['color'];
        }

        $typo = HCV_Elementor_Schema::parse_typography($styles);

        if (!empty($typo)) {
            $settings = array_merge($settings, $typo);
        }

        $border = HCV_Elementor_Schema::parse_border_and_radius($styles);

        if (!empty($border)) {
            $settings = array_merge($settings, $border);
        }

        if (!empty($styles['box-shadow'])) {
            $shadow = HCV_Elementor_Schema::parse_box_shadow($styles['box-shadow']);

            if ($shadow) {
                $settings = array_merge($settings, $shadow);
            }
        }

        if (!empty($hover_styles['background-color'])) {
            $settings['background_color_hover'] = $hover_styles['background-color'];
        }

        if (!empty($hover_styles['color'])) {
            $settings['button_text_color_hover'] = $hover_styles['color'];
        }

        if (!empty($hover_styles['border-color'])) {
            $settings['border_color_hover'] = $hover_styles['border-color'];
        }

        $align = strtolower($styles['text-align'] ?? '');

        if (in_array($align, ['left', 'center', 'right', 'justify'], true)) {
            $settings['align'] = $align;
        }

        self::apply_widget_spacing($settings, $styles);

        if ($cls) {
            $settings['_css_classes'] = $cls;
        }

        if ($id) {
            $settings['_element_id'] = $id;
        }

        return [
            'id'         => HCV_Elementor_Schema::gen_id(),
            'elType'     => 'widget',
            'widgetType' => 'button',
            'settings'   => $settings,
            'elements'   => [],
        ];
    }

    private static function build_accordion_widget($node, $styles, $css_ast, $cls, $id) {
        $tabs = [];
        $summaries = $node->getElementsByTagName('summary');
        $contents = [];

        foreach ($node->childNodes as $child) {
            if (
                $child instanceof DOMElement &&
                strtolower($child->tagName) !== 'summary'
            ) {
                $contents[] = $child;
            }
        }

        foreach ($summaries as $index => $summary) {
            $title = trim($summary->textContent);
            $content = isset($contents[$index])
                ? trim($contents[$index]->textContent)
                : '';

            $tabs[] = [
                'tab_title'   => html_entity_decode($title, ENT_QUOTES, 'UTF-8'),
                'tab_content' => html_entity_decode($content, ENT_QUOTES, 'UTF-8'),
            ];
        }

        if (empty($tabs)) {
            return self::build_container($node, $css_ast, $styles, $cls, $id, false);
        }

        $settings = [
            'tabs' => $tabs,
        ];

        $typo = HCV_Elementor_Schema::parse_typography($styles);

        if (!empty($typo)) {
            $settings = array_merge($settings, $typo);
        }

        $background = HCV_Elementor_Schema::parse_background($styles);

        if (!empty($background)) {
            $settings = array_merge($settings, $background);
        }

        $border = HCV_Elementor_Schema::parse_border_and_radius($styles);

        if (!empty($border)) {
            $settings = array_merge($settings, $border);
        }

        self::apply_widget_spacing($settings, $styles);

        if ($cls) {
            $settings['_css_classes'] = $cls;
        }

        if ($id) {
            $settings['_element_id'] = $id;
        }

        return [
            'id'         => HCV_Elementor_Schema::gen_id(),
            'elType'     => 'widget',
            'widgetType' => 'accordion',
            'settings'   => $settings,
            'elements'   => [],
        ];
    }

    private static function build_faq_accordion($node, $css_ast, $cls, $id) {
        $tabs = [];
        $items = [];

        foreach ($node->childNodes as $child) {
            if (!($child instanceof DOMElement)) {
                continue;
            }

            $child_class = strtolower(trim($child->getAttribute('class')));

            if (
                stripos($child_class, 'faq-item') !== false ||
                stripos($child_class, 'accordion-item') !== false ||
                (
                    preg_match('/(^|\s)item(\s|$)/', $child_class) &&
                    stripos($child_class, 'faq') === false
                )
            ) {
                $items[] = $child;
            }
        }

        if (empty($items)) {
            return self::build_container($node, $css_ast, [], $cls, $id, false);
        }

        foreach ($items as $item) {
            $question = '';
            $answer = '';

            foreach ($item->childNodes as $child) {
                if (!($child instanceof DOMElement)) {
                    continue;
                }

                $child_class = strtolower(trim($child->getAttribute('class')));
                $child_tag = strtolower($child->tagName);

                if (in_array($child_tag, ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'], true)) {
                    $question = trim($child->textContent);
                    continue;
                }

                if (
                    stripos($child_class, 'faq-q') !== false ||
                    stripos($child_class, 'faq-question') !== false ||
                    stripos($child_class, 'accordion-q') !== false ||
                    stripos($child_class, 'question-title') !== false ||
                    $child_class === 'q' ||
                    $child_class === 'question'
                ) {
                    $question = trim($child->textContent);
                    continue;
                }

                if (
                    stripos($child_class, 'faq-a') !== false ||
                    stripos($child_class, 'faq-answer') !== false ||
                    stripos($child_class, 'accordion-a') !== false ||
                    stripos($child_class, 'answer-content') !== false ||
                    stripos($child_class, 'accordion-panel') !== false ||
                    $child_class === 'a' ||
                    $child_class === 'answer' ||
                    $child_class === 'content' ||
                    $child_class === 'panel'
                ) {
                    $answer = trim($child->textContent);
                }
            }

            if ($question !== '') {
                $tabs[] = [
                    'tab_title'   => html_entity_decode($question, ENT_QUOTES, 'UTF-8'),
                    'tab_content' => html_entity_decode($answer, ENT_QUOTES, 'UTF-8'),
                ];
            }
        }

        if (empty($tabs)) {
            return self::build_container($node, $css_ast, [], $cls, $id, false);
        }

        $settings = [
            'tabs' => $tabs,
        ];

        if ($cls) {
            $settings['_css_classes'] = $cls;
        }

        if ($id) {
            $settings['_element_id'] = $id;
        }

        return [
            'id'         => HCV_Elementor_Schema::gen_id(),
            'elType'     => 'widget',
            'widgetType' => 'accordion',
            'settings'   => $settings,
            'elements'   => [],
        ];
    }

    // ═══════════════════════════════════════════════════════
    // SVG BUILDERS
    // ═══════════════════════════════════════════════════════

    private static function build_svg_element($node, $styles, $cls, $id) {
        $svg_raw = $node->ownerDocument->saveHTML($node);
        $strict_icon = self::detect_icon_from_svg_strict($svg_raw, $cls);

        if ($strict_icon) {
            return self::build_icon_widget_from_detected(
                $strict_icon,
                $styles,
                $cls,
                $id
            );
        }

        return self::build_svg_html_widget($svg_raw, $styles, $cls, $id);
    }

    private static function build_icon_widget_from_detected($detected_icon, $styles, $cls, $id) {
        $stroke = $styles['stroke'] ?? ($styles['color'] ?? '#006E2A');

        $settings = [
            'selected_icon' => [
                'value'   => $detected_icon['value'],
                'library' => $detected_icon['library'],
            ],
            'primary_color' => $stroke,
            'align'         => 'center',
        ];

        $size = 24;

        if (!empty($styles['width'])) {
            $size_data = HCV_Elementor_Schema::parse_size($styles['width']);

            if ($size_data && $size_data['unit'] === 'px') {
                $size = $size_data['size'];
            }
        }

        if (!empty($styles['height'])) {
            $size_data = HCV_Elementor_Schema::parse_size($styles['height']);

            if ($size_data && $size_data['unit'] === 'px') {
                $size = $size_data['size'];
            }
        }

        $settings['size'] = [
            'unit' => 'px',
            'size' => $size,
        ];

        self::apply_widget_spacing($settings, $styles);

        if ($cls) {
            $settings['_css_classes'] = $cls;
        }

        if ($id) {
            $settings['_element_id'] = $id;
        }

        return [
            'id'         => HCV_Elementor_Schema::gen_id(),
            'elType'     => 'widget',
            'widgetType' => 'icon',
            'settings'   => $settings,
            'elements'   => [],
        ];
    }

    private static function build_svg_html_widget($svg_raw, $styles, $cls, $id) {
        $settings = [
            'html' => $svg_raw,
        ];

        self::apply_widget_spacing($settings, $styles);

        if ($cls) {
            $settings['_css_classes'] = $cls;
        }

        if ($id) {
            $settings['_element_id'] = $id;
        }

        return [
            'id'         => HCV_Elementor_Schema::gen_id(),
            'elType'     => 'widget',
            'widgetType' => 'html',
            'settings'   => $settings,
            'elements'   => [],
        ];
    }

    private static function detect_icon_from_svg_strict($svg_raw, $cls) {
        $class_name = strtolower((string) $cls);

        if (
            stripos($svg_raw, 'polyline points="20 6 9 17 4 12"') !== false ||
            stripos($svg_raw, 'polyline points="20,6,9,17,4,12"') !== false ||
            preg_match('/(^|\s)(check|tick)(\s|$)/', $class_name)
        ) {
            return [
                'value'   => 'fas fa-check',
                'library' => 'fa-solid',
            ];
        }

        if (
            stripos($svg_raw, 'M12 22s8-4 8-10V5l-8-3') !== false ||
            preg_match('/(^|\s)shield(\s|$)/', $class_name)
        ) {
            return [
                'value'   => 'fas fa-shield-halved',
                'library' => 'fa-solid',
            ];
        }

        if (
            stripos($svg_raw, 'circle') !== false &&
            stripos($svg_raw, '12 6 12 12') !== false &&
            preg_match('/(^|\s)(clock|timer)(\s|$)/', $class_name)
        ) {
            return [
                'value'   => 'fas fa-clock',
                'library' => 'fa-solid',
            ];
        }

        return null;
    }

    private static function build_text_widget($text, $styles, $cls, $id) {
        $text = html_entity_decode($text, ENT_QUOTES, 'UTF-8');

        $settings = [
            'editor' => '<p>' . htmlspecialchars($text, ENT_QUOTES, 'UTF-8') . '</p>',
        ];

        $typo = HCV_Elementor_Schema::parse_typography($styles);

        if (!empty($typo)) {
            $settings = array_merge($settings, $typo);
        }

        if (!empty($styles['color'])) {
            $settings['text_color'] = $styles['color'];
        }

        $align = strtolower($styles['text-align'] ?? '');

        if (in_array($align, ['left', 'center', 'right', 'justify'], true)) {
            $settings['align'] = $align;
        }

        self::apply_widget_spacing($settings, $styles);

        if ($cls) {
            $settings['_css_classes'] = $cls;
        }

        if ($id) {
            $settings['_element_id'] = $id;
        }

        return [
            'id'         => HCV_Elementor_Schema::gen_id(),
            'elType'     => 'widget',
            'widgetType' => 'text-editor',
            'settings'   => $settings,
            'elements'   => [],
        ];
    }

    private static function apply_widget_spacing(&$settings, $styles) {
        if (!empty($styles['margin'])) {
            $margin = HCV_Elementor_Schema::parse_dimensions($styles['margin']);

            if ($margin) {
                $settings['margin'] = $margin;
            }
        }

        if (!empty($styles['padding'])) {
            $padding = HCV_Elementor_Schema::parse_dimensions($styles['padding']);

            if ($padding) {
                $settings['padding'] = $padding;
            }
        }
    }

    // ═══════════════════════════════════════════════════════
    // CONTAINER BUILDERS
    // ═══════════════════════════════════════════════════════

    private static function build_container($node, $css_ast, $styles, $cls, $id, $is_root) {
        $child_elements = [];

        foreach ($node->childNodes as $child) {
            if ($child instanceof DOMElement) {
                $child_element = self::dom_to_elementor($child, $css_ast, false);

                if ($child_element) {
                    $child_elements[] = $child_element;
                }
            } elseif ($child instanceof DOMText) {
                $text = trim($child->nodeValue);

                if ($text !== '' && $text !== "\n") {
                    $child_elements[] = self::build_text_widget($text, [], '', '');
                }
            }
        }

        $settings = self::build_container_settings(
            $node,
            $css_ast,
            $styles,
            $cls,
            $id,
            $is_root
        );

        return [
            'id'       => HCV_Elementor_Schema::gen_id(),
            'elType'   => 'container',
            'isInner'  => !$is_root,
            'settings' => $settings,
            'elements' => $child_elements,
        ];
    }

    private static function build_container_settings($node, $css_ast, $styles, $cls, $id, $is_root) {
        $settings = [];
        $class_name = strtolower((string) $cls);
        $display = strtolower(trim($styles['display'] ?? ''));

        if ($is_root) {
            $settings['content_width'] = 'full';
            $settings['width'] = [
                'unit' => '%',
                'size' => 100,
            ];
            $settings['container_type'] = 'flex';
            $settings['flex_direction'] = 'column';
            $settings['gap'] = [
                'unit' => 'px',
                'size' => 0,
                'isLinked' => true,
            ];
            $settings['margin'] = [
                'unit' => 'px',
                'top' => '0',
                'right' => '0',
                'bottom' => '0',
                'left' => '0',
                'isLinked' => true,
            ];
        } else {
            $settings['content_width'] = 'full';
            $settings['container_type'] = 'flex';
            $settings['flex_direction'] = 'column';
            $settings['gap'] = [
                'unit' => 'px',
                'size' => 20,
                'isLinked' => true,
            ];
        }

        if (in_array($display, ['flex', 'inline-flex', 'grid', 'inline-grid'], true)) {
            $settings['container_type'] = 'flex';
        }

        if (!empty($styles['flex-direction'])) {
            $direction = strtolower($styles['flex-direction']);

            if (in_array($direction, [
                'row',
                'column',
                'row-reverse',
                'column-reverse',
            ], true)) {
                $settings['flex_direction'] = $direction;
            }
        }

        if (!empty($styles['flex-wrap'])) {
            $wrap = strtolower($styles['flex-wrap']);

            if (in_array($wrap, ['nowrap', 'wrap', 'wrap-reverse'], true)) {
                $settings['flex_wrap'] = $wrap;
            }
        }

        if (!empty($styles['justify-content'])) {
            $justify = strtolower($styles['justify-content']);
            $justify_map = self::get_justify_map();

            if (isset($justify_map[$justify])) {
                $settings['justify_content'] = $justify_map[$justify];
            }
        }

        if (!empty($styles['align-items'])) {
            $align_items = strtolower($styles['align-items']);
            $align_items_map = self::get_align_items_map();

            if (isset($align_items_map[$align_items])) {
                $settings['align_items'] = $align_items_map[$align_items];
            }
        }

        if (!empty($styles['gap'])) {
            $gap = self::parse_gap_value($styles['gap']);

            if ($gap !== null) {
                $settings['gap'] = [
                    'unit' => 'px',
                    'size' => $gap,
                    'isLinked' => true,
                ];
            }
        }

        if (!empty($styles['row-gap']) && !empty($styles['column-gap'])) {
            $row_gap = self::parse_gap_value($styles['row-gap']);
            $column_gap = self::parse_gap_value($styles['column-gap']);

            if ($row_gap !== null && $column_gap !== null) {
                $settings['gap'] = [
                    'unit' => 'px',
                    'size' => round(($row_gap + $column_gap) / 2),
                    'isLinked' => true,
                ];
            }
        }

        if (!empty($styles['width']) && !$is_root) {
            $size = HCV_Elementor_Schema::parse_size($styles['width']);

            if ($size) {
                $settings['width'] = $size;
            }
        }

        if (!empty($styles['max-width']) && !$is_root) {
            $size = HCV_Elementor_Schema::parse_size($styles['max-width']);

            if ($size) {
                if ($size['unit'] === 'px' && $size['size'] <= 1400) {
                    $settings['content_width'] = 'boxed';
                    $settings['boxed_width'] = $size;
                } else {
                    $settings['max_width'] = $size;
                }
            }
        }

        if (!empty($styles['min-width']) && !$is_root) {
            $size = HCV_Elementor_Schema::parse_size($styles['min-width']);

            if ($size) {
                $settings['min_width'] = $size;
            }
        }

        if (!empty($styles['height'])) {
            $size = HCV_Elementor_Schema::parse_size($styles['height']);

            if ($size) {
                $settings['height'] = $size;
            }
        }

        if (!empty($styles['min-height'])) {
            $size = HCV_Elementor_Schema::parse_size($styles['min-height']);

            if ($size) {
                $settings['min_height'] = $size;
            }
        }

        if (!empty($styles['max-height'])) {
            $size = HCV_Elementor_Schema::parse_size($styles['max-height']);

            if ($size) {
                $settings['max_height'] = $size;
            }
        }

        if (!empty($styles['align-self'])) {
            $align_self = strtolower($styles['align-self']);

            if (in_array($align_self, [
                'center',
                'flex-start',
                'flex-end',
                'stretch',
                'baseline',
            ], true)) {
                $settings['align_self'] = $align_self;
            }
        }

        // ───────────────────────────────────────────────────
        // INTRINSIC FLEX ITEMS
        // ───────────────────────────────────────────────────

        $intrinsic_patterns = [
            'badge',
            'icon-badge',
            'check-icon',
            'step-node',
            'step-number',
            'faq-icon',
            'social-btn',
            'brand-icon',
            'badge-dot',
        ];

        $is_intrinsic_item = false;

        foreach ($intrinsic_patterns as $pattern) {
            if (stripos($class_name, $pattern) !== false) {
                $is_intrinsic_item = true;
                break;
            }
        }

        $is_inline_component = in_array(
            $display,
            ['inline-flex', 'inline-block', 'inline-grid'],
            true
        );

        $parent_class = '';

        if ($node->parentNode instanceof DOMElement) {
            $parent_class = strtolower(
                trim($node->parentNode->getAttribute('class'))
            );
        }

        if (($is_intrinsic_item || $is_inline_component) && !$is_root) {
            $settings['align_self'] = 'flex-start';

            if (
                $display === 'inline-flex' &&
                empty($styles['flex-direction'])
            ) {
                $settings['flex_direction'] = 'row';
                $settings['align_items'] = 'center';
            }

            if (empty($styles['width'])) {
                unset($settings['width']);
            }

            if (empty($styles['height'])) {
                unset($settings['height']);
            }

            if (stripos($parent_class, 'section-header') !== false) {
                $settings['align_self'] = 'center';
            }

            if (stripos($parent_class, 'faq-q') !== false) {
                $settings['align_self'] = 'center';
            }
        }

        // ───────────────────────────────────────────────────
        // FIXED SIZE COMPONENTS
        // ───────────────────────────────────────────────────

        self::apply_fixed_component_dimensions(
            $settings,
            $class_name,
            $is_root
        );

        $background = HCV_Elementor_Schema::parse_background($styles);

        if (!empty($background)) {
            $settings = array_merge($settings, $background);
        }

        $border = HCV_Elementor_Schema::parse_border_and_radius($styles);

        if (!empty($border)) {
            $settings = array_merge($settings, $border);
        }

        if (!empty($styles['padding'])) {
            $padding = HCV_Elementor_Schema::parse_dimensions($styles['padding']);

            if ($padding) {
                $settings['padding'] = $padding;
            }
        }

        if (!empty($styles['margin'])) {
            $margin = HCV_Elementor_Schema::parse_dimensions($styles['margin']);

            if ($margin) {
                $settings['margin'] = $margin;
            }
        }

        if (!empty($styles['box-shadow'])) {
            $shadow = HCV_Elementor_Schema::parse_box_shadow($styles['box-shadow']);

            if ($shadow) {
                $settings = array_merge($settings, $shadow);
            }
        }

        $opacity = HCV_Elementor_Schema::parse_opacity($styles);

        if (!empty($opacity)) {
            $settings = array_merge($settings, $opacity);
        }

        if (!empty($styles['overflow'])) {
            $settings['_overflow'] = strtolower($styles['overflow']);
        }

        if ($cls) {
            $settings['_css_classes'] = $cls;
        }

        if ($id) {
            $settings['_element_id'] = $id;
        }

        foreach (['mobile', 'tablet'] as $breakpoint) {
            $breakpoint_styles = HCV_Universal_Parser::get_computed_styles(
                $node,
                $css_ast,
                $breakpoint
            );

            if (empty($breakpoint_styles)) {
                continue;
            }

            $suffix = '_' . $breakpoint;

            if (!empty($breakpoint_styles['flex-direction'])) {
                $direction = strtolower($breakpoint_styles['flex-direction']);

                if (in_array($direction, [
                    'row',
                    'column',
                    'row-reverse',
                    'column-reverse',
                ], true)) {
                    $settings['flex_direction' . $suffix] = $direction;
                }
            }

            if (!empty($breakpoint_styles['flex-wrap'])) {
                $wrap = strtolower($breakpoint_styles['flex-wrap']);

                if (in_array($wrap, ['nowrap', 'wrap', 'wrap-reverse'], true)) {
                    $settings['flex_wrap' . $suffix] = $wrap;
                }
            }

            if (!empty($breakpoint_styles['gap'])) {
                $gap = self::parse_gap_value($breakpoint_styles['gap']);

                if ($gap !== null) {
                    $settings['gap' . $suffix] = [
                        'unit' => 'px',
                        'size' => $gap,
                        'isLinked' => true,
                    ];
                }
            }

            if (!empty($breakpoint_styles['padding'])) {
                $padding = HCV_Elementor_Schema::parse_dimensions(
                    $breakpoint_styles['padding']
                );

                if ($padding) {
                    $settings['padding' . $suffix] = $padding;
                }
            }

            if (!empty($breakpoint_styles['margin'])) {
                $margin = HCV_Elementor_Schema::parse_dimensions(
                    $breakpoint_styles['margin']
                );

                if ($margin) {
                    $settings['margin' . $suffix] = $margin;
                }
            }

            if (!empty($breakpoint_styles['width'])) {
                $size = HCV_Elementor_Schema::parse_size(
                    $breakpoint_styles['width']
                );

                if ($size) {
                    $settings['width' . $suffix] = $size;
                }
            }

            if (!empty($breakpoint_styles['height'])) {
                $size = HCV_Elementor_Schema::parse_size(
                    $breakpoint_styles['height']
                );

                if ($size) {
                    $settings['height' . $suffix] = $size;
                }
            }

            if (!empty($breakpoint_styles['text-align'])) {
                $text_align = strtolower($breakpoint_styles['text-align']);

                if (in_array($text_align, ['left', 'center', 'right', 'justify'], true)) {
                    $settings['align' . $suffix] = $text_align;
                }
            }

            if (!empty($breakpoint_styles['justify-content'])) {
                $justify = strtolower($breakpoint_styles['justify-content']);
                $justify_map = self::get_justify_map();

                if (isset($justify_map[$justify])) {
                    $settings['justify_content' . $suffix] = $justify_map[$justify];
                }
            }

            if (!empty($breakpoint_styles['align-items'])) {
                $align_items = strtolower($breakpoint_styles['align-items']);
                $align_items_map = self::get_align_items_map();

                if (isset($align_items_map[$align_items])) {
                    $settings['align_items' . $suffix] = $align_items_map[$align_items];
                }
            }
        }

        // Reapply exact fixed dimensions after responsive styles.
        self::apply_fixed_component_dimensions(
            $settings,
            $class_name,
            $is_root,
            'mobile'
        );

        self::apply_fixed_component_dimensions(
            $settings,
            $class_name,
            $is_root,
            'tablet'
        );

        return $settings;
    }

    /**
     * Force visual components to retain their intended square/circular
     * dimensions.
     *
     * V8.3.0 fix: also zero out gap and padding on these components.
     * Elementor Flexbox Containers factor internal gap/padding into
     * their rendered box size even when width/height/min/max are all
     * explicitly set — a single-child fixed circle (like a timeline
     * node containing only a text label) can still render taller than
     * intended if gap/padding are not explicitly zeroed.
     */
    private static function apply_fixed_component_dimensions(
        &$settings,
        $class_name,
        $is_root,
        $breakpoint = ''
    ) {
        if ($is_root) {
            return;
        }

        $suffix = $breakpoint !== '' ? '_' . $breakpoint : '';

        $component_dimensions = null;
        $alignment = 'flex-start';

        if (
            stripos($class_name, 'step-node') !== false ||
            stripos($class_name, 'step-number') !== false
        ) {
            $component_dimensions = 64;
            $alignment = 'center';
        } elseif (stripos($class_name, 'check-icon') !== false) {
            $component_dimensions = 24;
            $alignment = 'flex-start';
        } elseif (stripos($class_name, 'faq-icon') !== false) {
            $component_dimensions = 32;
            $alignment = 'center';
        } elseif (stripos($class_name, 'icon-badge') !== false) {
            $component_dimensions = 48;
            $alignment = 'flex-start';
        } elseif (stripos($class_name, 'social-btn') !== false) {
            $component_dimensions = 40;
            $alignment = 'flex-start';
        } elseif (stripos($class_name, 'brand-icon') !== false) {
            $component_dimensions = 36;
            $alignment = 'flex-start';
        } elseif (stripos($class_name, 'badge-dot') !== false) {
            $component_dimensions = 8;
            $alignment = 'center';
        }

        if ($component_dimensions === null) {
            return;
        }

        $size = [
            'unit' => 'px',
            'size' => $component_dimensions,
        ];

        $settings['width' . $suffix] = $size;
        $settings['height' . $suffix] = $size;
        $settings['min_width' . $suffix] = $size;
        $settings['min_height' . $suffix] = $size;
        $settings['max_width' . $suffix] = $size;
        $settings['max_height' . $suffix] = $size;

        $settings['flex_direction' . $suffix] = 'row';
        $settings['justify_content' . $suffix] = 'center';
        $settings['align_items' . $suffix] = 'center';
        $settings['align_self' . $suffix] = $alignment;

        $settings['border_radius' . $suffix] = [
            'unit' => 'px',
            'top' => '9999',
            'right' => '9999',
            'bottom' => '9999',
            'left' => '9999',
            'isLinked' => true,
        ];

        // ─── V8.3.0 FIX: zero gap and padding ───
        // Prevents Elementor from adding internal box growth beyond
        // the explicit fixed width/height above.
        $settings['gap' . $suffix] = [
            'unit' => 'px',
            'size' => 0,
            'isLinked' => true,
        ];

        $settings['padding' . $suffix] = [
            'unit' => 'px',
            'top' => '0',
            'right' => '0',
            'bottom' => '0',
            'left' => '0',
            'isLinked' => true,
        ];
    }

    // ═══════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════

    private static function get_justify_map() {
        return [
            'flex-start' => 'flex-start',
            'start' => 'flex-start',
            'flex-end' => 'flex-end',
            'end' => 'flex-end',
            'center' => 'center',
            'space-between' => 'space-between',
            'space-around' => 'space-around',
            'space-evenly' => 'space-evenly',
        ];
    }

    private static function get_align_items_map() {
        return [
            'flex-start' => 'flex-start',
            'start' => 'flex-start',
            'flex-end' => 'flex-end',
            'end' => 'flex-end',
            'center' => 'center',
            'stretch' => 'stretch',
            'baseline' => 'baseline',
        ];
    }

    private static function parse_gap_value($value) {
        $value = trim((string) $value);

        if (preg_match('/^(\d+(?:\.\d+)?)(px|rem|em)?$/i', $value, $matches)) {
            $number = floatval($matches[1]);
            $unit = strtolower($matches[2] ?? 'px');

            if ($unit === 'rem' || $unit === 'em') {
                $number *= 16;
            }

            return round($number);
        }

        return null;
    }

    private static function has_multiple_faq_items($node) {
        $count = 0;

        foreach ($node->childNodes as $child) {
            if (!($child instanceof DOMElement)) {
                continue;
            }

            $child_class = strtolower(trim($child->getAttribute('class')));

            if (
                stripos($child_class, 'faq-item') !== false ||
                stripos($child_class, 'accordion-item') !== false ||
                preg_match('/(^|\s)(item|question)(\s|$)/', $child_class)
            ) {
                $count++;
            }
        }

        return $count >= 2;
    }

    private static function is_button($node, $tag, $cls, $css_ast = null) {
        if ($tag === 'button') {
            return true;
        }

        if ($tag !== 'a' && $tag !== 'input') {
            return false;
        }

        $class_name = strtolower((string) $cls);

        $button_patterns = [
            'btn',
            'button',
            'cta',
            'read-more',
            'readmore',
            'primary',
            'secondary',
            'ghost',
        ];

        foreach ($button_patterns as $pattern) {
            if (stripos($class_name, $pattern) !== false) {
                return true;
            }
        }

        $parent = $node->parentNode;

        while ($parent && $parent instanceof DOMElement) {
            $parent_class = strtolower((string) $parent->getAttribute('class'));
            $parent_tag = strtolower($parent->tagName);

            if (
                stripos($parent_class, 'btn-row') !== false ||
                stripos($parent_class, 'button-row') !== false ||
                stripos($parent_class, 'button-group') !== false ||
                stripos($parent_class, 'header-actions') !== false ||
                stripos($parent_class, 'cta-buttons') !== false
            ) {
                return true;
            }

            if ($parent_tag === 'nav') {
                return false;
            }

            if (in_array($parent_tag, [
                'section',
                'article',
                'main',
                'aside',
                'footer',
                'header',
            ], true)) {
                break;
            }

            $parent = $parent->parentNode;
        }

        if ($css_ast) {
            $styles = HCV_Universal_Parser::get_computed_styles(
                $node,
                $css_ast
            );

            if (!empty($styles['background-color']) || !empty($styles['background'])) {
                $parent = $node->parentNode;

                if ($parent instanceof DOMElement) {
                    $parent_class = strtolower((string) $parent->getAttribute('class'));

                    if (
                        stripos($parent_class, 'nav') !== false ||
                        stripos($parent_class, 'menu') !== false
                    ) {
                        return false;
                    }
                }

                return true;
            }
        }

        return false;
    }

    private static function is_leaf_text_node($node, $css_ast = null) {
        $class_name = strtolower((string) $node->getAttribute('class'));

        $protected_patterns = [
            'badge-icon',
            'icon-wrap',
            'icon-box',
            'icon-container',
            'check-icon',
            'step-node',
            'step-icon',
            'step-number',
            'feature-icon',
            'trust-icon',
            'card-icon',
            'badge',
            'icon',
            'check',
            'step',
            'svg',
        ];

        foreach ($protected_patterns as $pattern) {
            if (stripos($class_name, $pattern) !== false) {
                return false;
            }
        }

        $inline_tags = [
            'span',
            'strong',
            'em',
            'b',
            'i',
            'a',
            'br',
            'sup',
            'sub',
            'small',
            'mark',
            'code',
            'u',
            'abbr',
            'del',
            'ins',
        ];

        foreach ($node->childNodes as $child) {
            if (!($child instanceof DOMElement)) {
                continue;
            }

            $child_tag = strtolower($child->tagName);

            if ($child_tag === 'svg') {
                return false;
            }

            if (!in_array($child_tag, $inline_tags, true)) {
                return false;
            }

            if (
                $child_tag === 'a' &&
                self::is_button(
                    $child,
                    'a',
                    $child->getAttribute('class'),
                    $css_ast
                )
            ) {
                return false;
            }
        }

        return true;
    }
}
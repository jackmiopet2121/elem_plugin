<?php
/**
 * Plugin Name: Gemini HTML to Elementor Universal Pro
 * Description: HTML/CSS to native Elementor converter with Engine V2.
 * Version: 8.6.5
 * Author: Gemini & Antigravity
 * Text Domain: gemini-html-elementor-pro
 */

if (!defined('ABSPATH')) {
    exit;
}

define('HCV_PRO_VERSION', '8.6.5');
define('HCV_PRO_DIR', plugin_dir_path(__FILE__));
define('HCV_PRO_URL', plugin_dir_url(__FILE__));

require_once HCV_PRO_DIR . 'includes/class-elementor-schema.php';
require_once HCV_PRO_DIR . 'includes/class-universal-parser.php';
require_once HCV_PRO_DIR . 'includes/class-universal-compiler.php';
require_once HCV_PRO_DIR . 'includes/class-hcv-dom-normalizer.php';
require_once HCV_PRO_DIR . 'includes/class-hcv-css-cascade.php';
require_once HCV_PRO_DIR . 'includes/class-hcv-layout-analyzer.php';
require_once HCV_PRO_DIR . 'includes/class-hcv-component-tree.php';
require_once HCV_PRO_DIR . 'includes/class-hcv-elementor-renderer.php';
require_once HCV_PRO_DIR . 'includes/class-hcv-elementor-validator.php';
require_once HCV_PRO_DIR . 'includes/class-hcv-scoped-style-generator.php';
require_once plugin_dir_path(__FILE__) . 'includes/class-hcv-js-injector.php';

class HCV_Universal_Plugin {

    public static function init() {
        add_action('admin_menu', [__CLASS__, 'register_admin_menu']);
        add_action('admin_enqueue_scripts', [__CLASS__, 'enqueue_admin_assets']);
        add_action('wp_ajax_hcv_universal_convert_page', [__CLASS__, 'ajax_convert_page']);
        add_action('wp_ajax_hcv_universal_export_json', [__CLASS__, 'ajax_export_json']);
        add_action('wp_ajax_hcv_test_engine_v2', [__CLASS__, 'ajax_test_engine_v2']);
        add_action('wp_ajax_hcv_download_engine_v2_json', [__CLASS__, 'ajax_download_engine_v2_json']);
        add_action('wp_ajax_hcv_convert_page_v2', [__CLASS__, 'ajax_convert_page_v2']);
        add_action('wp_enqueue_scripts', [__CLASS__, 'load_v2_scoped_css']);
    }

    public static function register_admin_menu() {
        add_menu_page(
            'HTML to Elementor Universal Pro',
            'HTML to Elementor',
            'manage_options',
            'gemini-html-to-elementor-pro',
            [__CLASS__, 'render_admin_page'],
            'dashicons-superhero-alt',
            29
        );
    }

    public static function enqueue_admin_assets($hook) {
        if (strpos($hook, 'gemini-html-to-elementor-pro') === false) {
            return;
        }

        wp_enqueue_style('hcv-pro-admin-css', HCV_PRO_URL . 'assets/admin.css', [], HCV_PRO_VERSION);
        wp_enqueue_script('hcv-pro-admin-js', HCV_PRO_URL . 'assets/admin.js', ['jquery'], HCV_PRO_VERSION, true);

        wp_localize_script('hcv-pro-admin-js', 'HCV_PRO', [
            'ajax_url' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('hcv_pro_nonce'),
        ]);
    }

    public static function render_admin_page() {
        $pages = get_posts([
            'post_type' => 'page',
            'post_status' => ['publish', 'draft'],
            'posts_per_page' => -1,
            'orderby' => 'title',
            'order' => 'ASC',
        ]);

        require HCV_PRO_DIR . 'admin/admin-view.php';
    }

    private static function build_v2($html_code, $hf_mode) {
        $include_hf = ($hf_mode === 'code_hf');

        $normalized = HCV_DOM_Normalizer::normalize($html_code, [
            'include_header_footer' => $include_hf,
            'max_depth' => 8,
        ]);

        $css_analysis = HCV_CSS_Cascade::analyze($normalized, $html_code);
        $layout_analysis = HCV_Layout_Analyzer::analyze($normalized, $css_analysis);
        $component_tree = HCV_Component_Tree::build($normalized, $layout_analysis);

        HCV_Elementor_Renderer::register_nodes($normalized);

        $render_preview = HCV_Elementor_Renderer::render_preview(
            $component_tree,
            $normalized,
            $include_hf
        );

        $validation = HCV_Elementor_Validator::validate($render_preview['elements'] ?? []);
        
        $scoped_css_preview = HCV_Scoped_Style_Generator::generate(
            $normalized,
            $css_analysis,
            $render_preview['elements'] ?? [],
            0
        );

        return [
            'normalized' => $normalized,
            'css_analysis' => $css_analysis,
            'component_tree' => $component_tree,
            'render_preview' => $render_preview,
            'validation' => $validation,
            'scoped_css_preview' => $scoped_css_preview,
        ];
    }

    public static function ajax_test_engine_v2() {
        check_ajax_referer('hcv_pro_nonce', 'nonce');

        if (!current_user_can('edit_pages')) {
            wp_send_json_error(['message' => 'Permission denied.'], 403);
        }

        $html_code = wp_unslash($_POST['html_code'] ?? '');
        $hf_mode = sanitize_text_field($_POST['hf_mode'] ?? 'theme_hf');

        if (trim($html_code) === '') {
            wp_send_json_error(['message' => 'Please paste HTML and CSS code first.'], 400);
        }

        try {
            $v2 = self::build_v2($html_code, $hf_mode);

            wp_send_json_success([
                'stage' => 'renderer_validation_ok',
                'component_tree' => HCV_Component_Tree::summarize($v2['component_tree']),
                'renderer' => [
                    'stats' => $v2['render_preview']['stats'] ?? [],
                    'warning_count' => count($v2['render_preview']['warnings'] ?? []),
                ],
                'validation' => HCV_Elementor_Validator::summarize($v2['validation']),
                'scoped_css' => HCV_Scoped_Style_Generator::summarize(
                    $v2['scoped_css_preview'] ?? []
                ),
                'scoped_css_readable' => $v2['scoped_css_preview']['css_readable'] ?? '',
                'css_cascade' => HCV_CSS_Cascade::summarize(
                    $v2['css_analysis'] ?? []
                ),
            ]);
        } catch (Throwable $error) {
            error_log('HCV Engine V2 test error: ' . $error->getMessage());
            wp_send_json_error(['message' => 'Engine V2 test error: ' . $error->getMessage()], 500);
        }
    }

    public static function ajax_download_engine_v2_json() {
        check_ajax_referer('hcv_pro_nonce', 'nonce');

        if (!current_user_can('edit_pages')) {
            wp_send_json_error(['message' => 'Permission denied.'], 403);
        }

        $html_code = wp_unslash($_POST['html_code'] ?? '');
        $hf_mode = sanitize_text_field($_POST['hf_mode'] ?? 'theme_hf');

        if (trim($html_code) === '') {
            wp_send_json_error(['message' => 'Please paste HTML and CSS code first.'], 400);
        }

        try {
            $v2 = self::build_v2($html_code, $hf_mode);

            if (empty($v2['validation']['valid'])) {
                wp_send_json_error([
                    'message' => 'Engine V2 JSON validation failed.',
                    'validation' => HCV_Elementor_Validator::summarize($v2['validation']),
                ], 422);
            }

            $template = [
                'version' => '0.4',
                'title' => 'Engine V2 Preview - ' . date('Y-m-d H:i'),
                'type' => 'page',
                'content' => $v2['render_preview']['elements'],
            ];

            $json = wp_json_encode($template, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);

            if ($json === false) {
                wp_send_json_error(['message' => 'Could not encode Engine V2 template JSON.'], 500);
            }

            wp_send_json_success([
                'filename' => 'elementor-engine-v2-preview-' . time() . '.json',
                'json' => $json,
                'renderer_stats' => $v2['render_preview']['stats'] ?? [],
                'validation' => HCV_Elementor_Validator::summarize($v2['validation']),
            ]);
        } catch (Throwable $error) {
            error_log('HCV Engine V2 export error: ' . $error->getMessage());
            wp_send_json_error(['message' => 'Engine V2 export error: ' . $error->getMessage()], 500);
        }
    }

    public static function ajax_convert_page() {
        check_ajax_referer('hcv_pro_nonce', 'nonce');

        if (!current_user_can('edit_pages')) {
            wp_send_json_error(['message' => 'Permission denied.']);
        }

        $post_id = intval($_POST['post_id'] ?? 0);
        $html_code = wp_unslash($_POST['html_code'] ?? '');
        $hf_mode = sanitize_text_field($_POST['hf_mode'] ?? 'theme_hf');
        $replace_existing = !empty($_POST['replace_existing']);

        if (!$html_code) {
            wp_send_json_error(['message' => 'Please paste your HTML and CSS code.']);
        }

        if ($post_id === 0) {
            $post_id = wp_insert_post([
                'post_title' => 'Landing Page - Elementor Native ' . date('Y-m-d H:i'),
                'post_type' => 'page',
                'post_status' => 'draft',
            ]);

            if (is_wp_error($post_id)) {
                wp_send_json_error(['message' => 'Could not create page: ' . $post_id->get_error_message()]);
            }

            $replace_existing = true;
        }

        $include_hf = ($hf_mode === 'code_hf');
        $parsed = HCV_Universal_Parser::parse($html_code, $include_hf);
        $elements = HCV_Universal_Compiler::compile($parsed, $hf_mode);

        if (!$replace_existing) {
            $existing_data = get_post_meta($post_id, '_elementor_data', true);
            $existing_elements = [];

            if ($existing_data) {
                $decoded = json_decode($existing_data, true);
                if (is_array($decoded)) {
                    $existing_elements = $decoded;
                }
            }

            $elements = array_merge($existing_elements, $elements);
        }

        update_post_meta($post_id, '_elementor_edit_mode', 'builder');
        update_post_meta($post_id, '_elementor_version', '3.20.0');
        update_post_meta($post_id, '_elementor_data', wp_slash(wp_json_encode($elements)));
        update_post_meta($post_id, '_wp_page_template', $include_hf ? 'elementor_canvas' : 'elementor_header_footer');

        if (class_exists('\Elementor\Plugin')) {
            \Elementor\Plugin::$instance->files_manager->clear_cache();
        }

        wp_send_json_success([
            'message' => 'Successfully compiled ' . count($elements) . ' Native Elementor sections!',
            'post_id' => $post_id,
            'edit_url' => admin_url('post.php?post=' . $post_id . '&action=elementor'),
            'view_url' => get_permalink($post_id),
            'count' => count($elements),
        ]);
    }

    /**
     * AJAX handler: hcv_convert_page_v2
     *
     * Converts HTML/CSS to Elementor JSON using Engine V2.
     * Creates new draft page by default, or updates selected page.
     */
    public static function ajax_convert_page_v2() {
        error_log('HCV V2 AJAX called');
        error_log('HCV V2 POST: ' . print_r($_POST, true));

        try {
            // Verify nonce
            if (
                !isset($_POST['nonce']) ||
                !wp_verify_nonce($_POST['nonce'], 'hcv_pro_nonce')
            ) {
                error_log('HCV V2: Nonce failed');
                wp_send_json_error(array(
                    'message' => 'Security check failed.'
                ));
                return;
            }

            // Capability check
            if (!current_user_can('edit_pages')) {
                error_log('HCV V2: Permission denied');
                wp_send_json_error(array(
                    'message' => 'Insufficient permissions.'
                ));
                return;
            }

            // Get inputs
            $html_code   = isset($_POST['html_code']) ? trim(wp_unslash($_POST['html_code'])) : '';
            $hf_mode     = isset($_POST['hf_mode']) ? sanitize_text_field($_POST['hf_mode']) : 'header_footer';
            $post_id     = isset($_POST['post_id']) ? intval($_POST['post_id']) : 0;
            $replace     = isset($_POST['replace_existing']) ? intval($_POST['replace_existing']) : 0;

            error_log('HCV V2: html_code length=' . strlen($html_code));
            error_log('HCV V2: hf_mode=' . $hf_mode);
            error_log('HCV V2: post_id=' . $post_id);
            error_log('HCV V2: replace=' . $replace);

            if (empty($html_code)) {
                error_log('HCV V2: Empty HTML code');
                wp_send_json_error(array(
                    'message' => 'No HTML/CSS code provided.'
                ));
                return;
            }

            // Build V2 JSON
            error_log('HCV V2: Calling build_v2()');
            $v2 = self::build_v2($html_code, $hf_mode);
            error_log('HCV V2: build_v2() returned');

            // Basic validation
            if (empty($v2['render_preview']['elements']) || !is_array($v2['render_preview']['elements'])) {
                error_log('HCV V2: Invalid V2 elements');
                wp_send_json_error(array(
                    'message' => 'Engine V2 produced invalid JSON.'
                ));
                return;
            }

            $elements = $v2['render_preview']['elements'];

            // Determine target page
            $is_new = false;
            if ($post_id <= 0) {
                error_log('HCV V2: Creating new page');
                $post_id = wp_insert_post(array(
                    'post_title'   => 'V2 Converted Page',
                    'post_status'  => 'draft',
                    'post_type'    => 'page',
                    'post_content' => '',
                ));

                if (is_wp_error($post_id) || $post_id <= 0) {
                    error_log('HCV V2: Failed to create page: ' . $post_id->get_error_message());
                    wp_send_json_error(array(
                        'message' => 'Failed to create new page.'
                    ));
                    return;
                }

                $is_new = true;
            } else {
                error_log('HCV V2: Using existing page ' . $post_id);
                $post = get_post($post_id);
                if (!$post || $post->post_type !== 'page') {
                    wp_send_json_error(array(
                        'message' => 'Selected page not found.'
                    ));
                    return;
                }
                if (!current_user_can('edit_post', $post_id)) {
                    wp_send_json_error(array(
                        'message' => 'You cannot edit this page.'
                    ));
                    return;
                }
            }

            // Existing Elementor data?
            $existing_data = get_post_meta($post_id, '_elementor_data', true);
            $existing_elements = [];

            if ($existing_data) {
                $decoded = json_decode($existing_data, true);
                if (is_array($decoded)) {
                    $existing_elements = $decoded;
                }
            }

            // Merge logic
            if ($replace === 1 || $is_new) {
                $merged_elements = $elements;
            } else {
                if (empty($existing_elements)) {
                    $merged_elements = $elements;
                } else {
                    $merged_elements = array_merge($existing_elements, $elements);
                }
            }

            $merged_json = wp_json_encode($merged_elements, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

            // Save Elementor data
            update_post_meta($post_id, '_elementor_data', wp_slash($merged_json));
            update_post_meta($post_id, '_elementor_edit_mode', 'builder');
            update_post_meta($post_id, '_elementor_version', '3.20.0');

            // =========================================================================
            // NEW: Apply responsive normalization to HTML + CSS
            // =========================================================================

            // Initialize CSS variables
            $normalized_css = '';
            $css_hash = '';

            // Extract V2 CSS (scoped) from build_v2 result
            $scoped_css_from_v2 = '';

            if (!empty($v2['scoped_css_preview']['css_minified'])) {
                $scoped_css_from_v2 = $v2['scoped_css_preview']['css_minified'];
            } elseif (!empty($v2['scoped_css_preview']['css_readable'])) {
                $scoped_css_from_v2 = $v2['scoped_css_preview']['css_readable'];
            }

            // Apply responsive normalization if CSS exists
            if (!empty($scoped_css_from_v2)) {
                try {
                    $normalized_result = HCV_Scoped_Style_Generator::apply_responsive_normalization(
                        $html_code,
                        $scoped_css_from_v2,
                        $post_id
                    );
                    $normalized_html = $normalized_result['html'];
                    $normalized_css = $normalized_result['css'];
                    $css_hash = md5($normalized_css);

                    // Save normalized CSS for reference
                    update_post_meta($post_id, '_hcv_v2_scoped_css', $normalized_css);
                    update_post_meta($post_id, '_hcv_v2_scoped_css_hash', $css_hash);

                    error_log('HCV V2: Responsive normalization applied, CSS length: ' . strlen($normalized_css));
                } catch (Throwable $css_error) {
                    error_log('HCV V2: Responsive normalization failed: ' . $css_error->getMessage());
                    // Fallback: save original CSS without normalization
                    update_post_meta($post_id, '_hcv_v2_scoped_css', $scoped_css_from_v2);
                    update_post_meta($post_id, '_hcv_v2_scoped_css_hash', md5($scoped_css_from_v2));
                    $css_hash = md5($scoped_css_from_v2);
                }
            } else {
                error_log('HCV V2: No scoped CSS to normalize');
            }

            // =========================================================================

            // Set Elementor template based on Header/Footer mode.
            $template = ($hf_mode === 'code_hf')
                ? 'elementor_canvas'
                : 'elementor_header_footer';

            update_post_meta($post_id, '_wp_page_template', $template);

            // Clear Elementor cache
            if (class_exists('\Elementor\Plugin')) {
                \Elementor\Plugin::instance()->files_manager->clear_cache();
            }

            // Clear post meta cache
            wp_cache_delete($post_id, 'post_meta');

            // Prepare response
            $edit_url = get_edit_post_link($post_id, false);
            $view_url = get_permalink($post_id);

            error_log('HCV V2: Success - post_id=' . $post_id);

            wp_send_json_success(array(
                'message'   => $is_new
                    ? 'Page created and converted with Engine V2!'
                    : ($replace === 1
                        ? 'Page replaced with Engine V2 conversion!'
                        : 'Engine V2 elements appended to existing page.'
                    ),
                'edit_url'  => $edit_url,
                'view_url'  => $view_url,
                'post_id'   => $post_id,
                'is_new'    => $is_new,
                'replaced'  => ($replace === 1),
                'css_hash'  => $css_hash,
            ));
        } catch (Throwable $error) {
            error_log('HCV V2 AJAX error: ' . $error->getMessage());
            error_log('HCV V2 AJAX trace: ' . $error->getTraceAsString());

            wp_send_json_error(array(
                'message' => 'V2 conversion error: ' . $error->getMessage()
            ));
        }
    }

    /**
     * Load V2 scoped CSS for converted pages.
     */
    public static function load_v2_scoped_css() {
        if (!is_singular('page')) {
            return;
        }

        $post_id = get_queried_object_id();

        if (!$post_id) {
            return;
        }

        $scoped_css = get_post_meta($post_id, '_hcv_v2_scoped_css', true);

        error_log(
            'HCV V2 CSS loader | page_id=' .
            $post_id .
            ' | length=' .
            strlen((string) $scoped_css)
        );

        if (empty($scoped_css)) {
            return;
        }

        $handle = 'hcv-v2-scoped-css';

        wp_register_style($handle, false, array(), HCV_PRO_VERSION);
        wp_enqueue_style($handle);

        wp_add_inline_style($handle, $scoped_css);
    }

    public static function ajax_export_json() {
        check_ajax_referer('hcv_pro_nonce', 'nonce');

        if (!current_user_can('edit_pages')) {
            wp_send_json_error(['message' => 'Permission denied.']);
        }

        $html_code = wp_unslash($_POST['html_code'] ?? '');
        $hf_mode = sanitize_text_field($_POST['hf_mode'] ?? 'theme_hf');

        if (!$html_code) {
            wp_send_json_error(['message' => 'Please paste your HTML and CSS code.']);
        }

        $include_hf = ($hf_mode === 'code_hf');
        $parsed = HCV_Universal_Parser::parse($html_code, $include_hf);
        $elements = HCV_Universal_Compiler::compile($parsed, $hf_mode);

        $template = [
            'version' => '0.4',
            'title' => 'Elementor Native Template - ' . date('Y-m-d H:i'),
            'type' => 'page',
            'content' => $elements,
        ];

        wp_send_json_success([
            'filename' => 'elementor-template-native-' . time() . '.json',
            'json' => wp_json_encode($template, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
            'count' => count($elements),
        ]);
    }
}

add_action('plugins_loaded', ['HCV_Universal_Plugin', 'init']);
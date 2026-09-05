<?php
/**
 * Legacy HCV frontend injector.
 *
 * Kept as a no-op for backward compatibility. Do not add HCV classes to
 * generic Elementor containers: theme, header, footer, and popup containers
 * must never be modified by the converter.
 *
 * @package Gemini_HTML_to_Elementor_Universal_Pro
 */

if (!defined('ABSPATH')) {
    exit;
}

class HCV_JS_Injector {

    /**
     * Kept for callers from older plugin versions.
     * Responsive behavior is generated as scoped CSS by
     * HCV_Scoped_Style_Generator, not through global frontend JavaScript.
     *
     * @return void
     */
    public static function init() {
        // Intentionally empty.
    }
}

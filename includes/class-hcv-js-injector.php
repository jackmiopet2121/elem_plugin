<?php
if (!defined('ABSPATH')) exit;

class HCV_JS_Injector {
    public static function init() {
        add_action('wp_footer', array(__CLASS__, 'inject_class_script'), 9999);
    }

    public static function inject_class_script() {
        ?>
        <script>
        document.addEventListener("DOMContentLoaded", function() {
            document.querySelectorAll(".e-con").forEach(function(el) {
                el.classList.add("hcv-v2-root");
            });
        });
        </script>
        <?php
    }
}

HCV_JS_Injector::init();
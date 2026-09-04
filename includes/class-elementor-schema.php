<?php
/**
 * Elementor Schema & CSS Property Evaluator
 * Package: Gemini HTML to Elementor Universal Pro
 */

if (!defined('ABSPATH')) exit;

class HCV_Elementor_Schema {

    public static function gen_id() {
        return substr(md5(uniqid(mt_rand(), true)), 0, 7);
    }

    // ─── DIMENSIONS (padding, margin, border-width) ───
    public static function parse_dimensions($val) {
        if (!$val || $val === '0') {
            return ['unit' => 'px', 'top' => '0', 'right' => '0', 'bottom' => '0', 'left' => '0', 'isLinked' => true];
        }
        $val = trim($val);
        $parts = preg_split('/\s+/', $val);
        $nums = [];
        foreach ($parts as $p) {
            if (preg_match('/^(-?\d+(?:\.\d+)?)(px|rem|em|%)?$/i', $p, $m)) {
                $num = floatval($m[1]);
                $u = strtolower($m[2] ?? 'px');
                if ($u === 'rem' || $u === 'em') $num *= 16;
                $nums[] = (string)round($num);
            }
        }
        $c = count($nums);
        if ($c === 0) return null;
        if ($c === 1) {
            return ['unit' => 'px', 'top' => $nums[0], 'right' => $nums[0], 'bottom' => $nums[0], 'left' => $nums[0], 'isLinked' => true];
        } elseif ($c === 2) {
            return ['unit' => 'px', 'top' => $nums[0], 'right' => $nums[1], 'bottom' => $nums[0], 'left' => $nums[1], 'isLinked' => false];
        } elseif ($c === 3) {
            return ['unit' => 'px', 'top' => $nums[0], 'right' => $nums[1], 'bottom' => $nums[2], 'left' => $nums[1], 'isLinked' => false];
        } else {
            return ['unit' => 'px', 'top' => $nums[0], 'right' => $nums[1], 'bottom' => $nums[2], 'left' => $nums[3], 'isLinked' => false];
        }
    }

    // ─── SIZE (single value) ───
    public static function parse_size($val, $default_unit = 'px') {
        if (!$val) return null;
        $val = trim($val);

        // calc() smart evaluator
        if (stripos($val, 'calc(') !== false) {
            if (preg_match('/33\.3{1,3}%/', $val) || stripos($val, '100% / 3') !== false) {
                return ['unit' => '%', 'size' => 31];
            } elseif (preg_match('/25%/', $val) || stripos($val, '100% / 4') !== false) {
                return ['unit' => '%', 'size' => 23];
            } elseif (preg_match('/50%/', $val) || stripos($val, '100% / 2') !== false) {
                return ['unit' => '%', 'size' => 48];
            } elseif (preg_match('/100%/', $val)) {
                return ['unit' => '%', 'size' => 100];
            }
        }

        if (preg_match('/^(-?\d+(?:\.\d+)?)(px|rem|em|%|vh|vw)?$/i', $val, $m)) {
            $num = floatval($m[1]);
            $unit = strtolower($m[2] ?? $default_unit);
            if ($unit === 'rem' || $unit === 'em') {
                $num *= 16;
                $unit = 'px';
            }
            return ['unit' => $unit, 'size' => ($unit === 'px') ? round($num) : $num];
        }
        return null;
    }

    // ─── BOX SHADOW ───
    public static function parse_box_shadow($val) {
        if (!$val || stripos($val, 'none') !== false) return null;
        if (preg_match('/(-?\d+)px?\s+(-?\d+)px?\s+(\d+)px?(?:\s+(\d+)px?)?\s+(rgba?\([^)]+\)|#[a-f0-9]{3,8}|[a-z]+)/i', $val, $m)) {
            return [
                'box_shadow_box_shadow_type' => 'yes',
                'box_shadow_box_shadow' => [
                    'horizontal' => intval($m[1]),
                    'vertical'   => intval($m[2]),
                    'blur'       => intval($m[3]),
                    'spread'     => !empty($m[4]) ? intval($m[4]) : 0,
                    'color'      => trim($m[5]),
                ]
            ];
        }
        return null;
    }

    // ─── TYPOGRAPHY ───
    public static function parse_typography($styles) {
        $settings = [];
        if (!empty($styles['font-family'])) {
            $family = trim(explode(',', $styles['font-family'])[0], " '\"");
            if ($family && $family !== 'inherit' && $family !== 'sans-serif' && $family !== 'serif' && $family !== 'monospace') {
                $settings['typography_typography'] = 'custom';
                $settings['typography_font_family'] = $family;
            }
        }
        if (!empty($styles['font-size'])) {
            $sz = self::parse_size($styles['font-size'], 'px');
            if ($sz) {
                $settings['typography_typography'] = 'custom';
                $settings['typography_font_size'] = $sz;
            }
        }
        if (!empty($styles['font-weight'])) {
            $w = trim($styles['font-weight']);
            $map = ['bold' => '700', 'normal' => '400', 'lighter' => '300', 'bolder' => '700'];
            $w = isset($map[$w]) ? $map[$w] : $w;
            if (in_array($w, ['100', '200', '300', '400', '500', '600', '700', '800', '900'])) {
                $settings['typography_typography'] = 'custom';
                $settings['typography_font_weight'] = $w;
            }
        }
        if (!empty($styles['line-height'])) {
            $lh = trim($styles['line-height']);
            if ($lh === 'normal') {
                // skip
            } elseif (is_numeric($lh)) {
                $settings['typography_typography'] = 'custom';
                $settings['typography_line_height'] = ['unit' => 'em', 'size' => floatval($lh)];
            } else {
                $sz = self::parse_size($lh, 'em');
                if ($sz) {
                    $settings['typography_typography'] = 'custom';
                    $settings['typography_line_height'] = $sz;
                }
            }
        }
        if (!empty($styles['letter-spacing'])) {
            $ls = self::parse_size($styles['letter-spacing'], 'px');
            if ($ls) {
                $settings['typography_typography'] = 'custom';
                $settings['typography_letter_spacing'] = $ls;
            }
        }
        if (!empty($styles['text-transform'])) {
            $tt = strtolower(trim($styles['text-transform']));
            if (in_array($tt, ['uppercase', 'lowercase', 'capitalize', 'none'])) {
                $settings['typography_typography'] = 'custom';
                $settings['typography_text_transform'] = $tt;
            }
        }
        if (!empty($styles['text-decoration'])) {
            $td = strtolower(trim($styles['text-decoration']));
            if (stripos($td, 'underline') !== false) {
                $settings['typography_typography'] = 'custom';
                $settings['typography_text_decoration'] = 'underline';
            }
        }
        return $settings;
    }

    // ─── BORDER & RADIUS ───
    public static function parse_border_and_radius($styles) {
        $settings = [];
        if (!empty($styles['border-radius'])) {
            $dim = self::parse_dimensions($styles['border-radius']);
            if ($dim) $settings['border_radius'] = $dim;
        }
        if (!empty($styles['border'])) {
            if (preg_match('/(\d+)px?\s+(solid|dashed|dotted|double|groove|ridge|inset|outset)\s*(rgba?\([^)]+\)|#[a-f0-9]{3,8}|[a-z]+)?/i', $styles['border'], $bm)) {
                $settings['border_border'] = strtolower($bm[2]);
                $settings['border_width'] = ['unit' => 'px', 'top' => $bm[1], 'right' => $bm[1], 'bottom' => $bm[1], 'left' => $bm[1], 'isLinked' => true];
                if (!empty($bm[3])) $settings['border_color'] = trim($bm[3]);
            } elseif (stripos($styles['border'], 'none') !== false) {
                $settings['border_border'] = 'none';
            }
        } else {
            if (!empty($styles['border-style']) || !empty($styles['border-width']) || !empty($styles['border-color'])) {
                $settings['border_border'] = !empty($styles['border-style']) ? strtolower($styles['border-style']) : 'solid';
                if (!empty($styles['border-width'])) {
                    $settings['border_width'] = self::parse_dimensions($styles['border-width']);
                }
                if (!empty($styles['border-color'])) {
                    $settings['border_color'] = trim($styles['border-color']);
                }
            }
        }
        return $settings;
    }

    // ─── BACKGROUND (color, gradient, image) ───
    public static function parse_background($styles) {
        $settings = [];

        // 1. Background Color (from background-color property)
        if (!empty($styles['background-color'])) {
            $c = trim($styles['background-color']);
            if ($c !== 'transparent' && $c !== 'none' && $c !== 'inherit' && $c !== 'initial') {
                $settings['background_background'] = 'classic';
                $settings['background_color'] = $c;
            }
        }

        // 2. Handle shorthand `background:` property (gradient, image, or solid color)
        if (!empty($styles['background'])) {
            $bg = trim($styles['background']);
            if (stripos($bg, 'gradient') !== false) {
                $grad = self::parse_gradient($bg);
                if ($grad) {
                    $settings['background_background'] = 'gradient';
                    $settings = array_merge($settings, $grad);
                }
            } elseif (preg_match('/url\(["\']?([^)\'"]+)["\']?\)/i', $bg, $m)) {
                $settings['background_background'] = 'classic';
                $settings['background_image'] = ['url' => trim($m[1]), 'id' => ''];
                $settings['background_position'] = !empty($styles['background-position']) ? $styles['background-position'] : 'center center';
                $settings['background_size'] = !empty($styles['background-size']) ? $styles['background-size'] : 'cover';
                $settings['background_repeat'] = !empty($styles['background-repeat']) ? $styles['background-repeat'] : 'no-repeat';
            } elseif (
                stripos($bg, 'none') === false &&
                stripos($bg, 'transparent') === false &&
                stripos($bg, 'inherit') === false &&
                stripos($bg, 'initial') === false &&
                stripos($bg, 'unset') === false
            ) {
                // Assume it is a solid color value
                $settings['background_background'] = 'classic';
                $settings['background_color'] = $bg;
            }
        }

        // 3. Background Image URL from `background-image` property (fallback if shorthand didn't win)
        if (!empty($styles['background-image'])) {
            if (stripos($styles['background-image'], 'gradient') !== false) {
                $grad = self::parse_gradient($styles['background-image']);
                if ($grad && empty($settings['background_background'])) {
                    $settings['background_background'] = 'gradient';
                    $settings = array_merge($settings, $grad);
                }
            } elseif (preg_match('/url\(["\']?([^)\'"]+)["\']?\)/i', $styles['background-image'], $m)) {
                if (empty($settings['background_background'])) {
                    $settings['background_background'] = 'classic';
                    $settings['background_image'] = ['url' => trim($m[1]), 'id' => ''];
                }
                if (empty($settings['background_position'])) {
                    $settings['background_position'] = !empty($styles['background-position']) ? $styles['background-position'] : 'center center';
                }
                if (empty($settings['background_size'])) {
                    $settings['background_size'] = !empty($styles['background-size']) ? $styles['background-size'] : 'cover';
                }
                if (empty($settings['background_repeat'])) {
                    $settings['background_repeat'] = !empty($styles['background-repeat']) ? $styles['background-repeat'] : 'no-repeat';
                }
            }
        }

        return $settings;
    }

    // ─── GRADIENT PARSER ───
    public static function parse_gradient($val) {
        $settings = [];
        // linear-gradient(135deg, #color1 0%, #color2 100%)
        if (preg_match('/linear-gradient\(\s*(\d+)deg\s*,\s*(.+)\)/i', $val, $m)) {
            $angle = intval($m[1]);
            $stops_str = $m[2];
            preg_match_all('/(#[a-f0-9]{3,8}|rgba?\([^)]+\))\s*(\d+%)?/i', $stops_str, $stops, PREG_SET_ORDER);
            if (count($stops) >= 2) {
                $settings['background_color'] = trim($stops[0][1]);
                $settings['background_color_stop'] = !empty($stops[0][2]) ? intval($stops[0][2]) : 0;
                $settings['background_color_b'] = trim($stops[1][1]);
                $settings['background_color_b_stop'] = !empty($stops[1][2]) ? intval($stops[1][2]) : 100;
                $settings['background_gradient_type'] = 'linear';
                $settings['background_gradient_angle'] = ['unit' => 'deg', 'size' => $angle];
            }
        } elseif (preg_match('/linear-gradient\(\s*to\s+(top|bottom|left|right)\s*,\s*(.+)\)/i', $val, $m)) {
            $dir = strtolower($m[1]);
            $angle_map = ['top' => 0, 'right' => 90, 'bottom' => 180, 'left' => 270];
            $angle = isset($angle_map[$dir]) ? $angle_map[$dir] : 180;
            $stops_str = $m[2];
            preg_match_all('/(#[a-f0-9]{3,8}|rgba?\([^)]+\))\s*(\d+%)?/i', $stops_str, $stops, PREG_SET_ORDER);
            if (count($stops) >= 2) {
                $settings['background_color'] = trim($stops[0][1]);
                $settings['background_color_stop'] = !empty($stops[0][2]) ? intval($stops[0][2]) : 0;
                $settings['background_color_b'] = trim($stops[1][1]);
                $settings['background_color_b_stop'] = !empty($stops[1][2]) ? intval($stops[1][2]) : 100;
                $settings['background_gradient_type'] = 'linear';
                $settings['background_gradient_angle'] = ['unit' => 'deg', 'size' => $angle];
            }
        }
        return $settings;
    }

    // ─── OPACITY ───
    public static function parse_opacity($styles) {
        if (!empty($styles['opacity'])) {
            $o = floatval($styles['opacity']);
            if ($o >= 0 && $o <= 1) {
                return ['_opacity' => ['unit' => 'px', 'size' => round($o * 100)]];
            }
        }
        return [];
    }
}

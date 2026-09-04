<?php
/**
 * HCV Engine V2 - Elementor JSON Validator
 *
 * Validates an Elementor content array before it is saved to _elementor_data.
 * Read-only validation: this class never writes WordPress data.
 */

if (!defined('ABSPATH')) {
    exit;
}

class HCV_Elementor_Validator {

    private static $allowed_element_types = [
        'container',
        'widget',
    ];

    private static $allowed_widget_types = [
        'heading',
        'text-editor',
        'button',
        'image',
        'html',
    ];

    public static function validate($elements) {
        $errors = [];
        $warnings = [];
        $seen_ids = [];

        if (!is_array($elements)) {
            return [
                'valid' => false,
                'errors' => [
                    self::message(
                        'invalid_root',
                        'Renderer result must be an array of Elementor elements.',
                        []
                    ),
                ],
                'warnings' => [],
                'stats' => [],
            ];
        }

        foreach ($elements as $index => $element) {
            self::validate_element(
                $element,
                'root[' . $index . ']',
                $seen_ids,
                $errors,
                $warnings
            );
        }

        $json = wp_json_encode($elements);

        if ($json === false) {
            $errors[] = self::message(
                'json_encode_failed',
                'The rendered Elementor structure could not be encoded as JSON.',
                [
                    'json_error' => json_last_error_msg(),
                ]
            );
        }

        return [
            'valid' => empty($errors),
            'errors' => $errors,
            'warnings' => $warnings,
            'stats' => [
                'root_element_count' => count($elements),
                'total_element_count' => self::count_elements($elements),
                'unique_id_count' => count($seen_ids),
                'json_bytes' => is_string($json) ? strlen($json) : 0,
                'error_count' => count($errors),
                'warning_count' => count($warnings),
            ],
        ];
    }

    private static function validate_element(
        $element,
        $path,
        &$seen_ids,
        &$errors,
        &$warnings
    ) {
        if (!is_array($element)) {
            $errors[] = self::message(
                'invalid_element',
                'An Elementor element must be an array.',
                [
                    'path' => $path,
                ]
            );
            return;
        }

        $id = $element['id'] ?? '';
        $el_type = $element['elType'] ?? '';
        $settings = $element['settings'] ?? null;
        $children = $element['elements'] ?? null;

        if (!is_string($id) || !preg_match('/^[a-z0-9]{7}$/', $id)) {
            $errors[] = self::message(
                'invalid_id',
                'Element ID must be a unique 7-character lowercase alphanumeric value.',
                [
                    'path' => $path,
                    'id' => $id,
                ]
            );
        } elseif (isset($seen_ids[$id])) {
            $errors[] = self::message(
                'duplicate_id',
                'Duplicate Elementor element ID detected.',
                [
                    'path' => $path,
                    'id' => $id,
                    'first_seen_at' => $seen_ids[$id],
                ]
            );
        } else {
            $seen_ids[$id] = $path;
        }

        if (!in_array($el_type, self::$allowed_element_types, true)) {
            $errors[] = self::message(
                'invalid_el_type',
                'Element elType must be container or widget.',
                [
                    'path' => $path,
                    'elType' => $el_type,
                ]
            );
            return;
        }

        if (!is_array($settings)) {
            $errors[] = self::message(
                'invalid_settings',
                'Element settings must be an array.',
                [
                    'path' => $path,
                ]
            );
        }

        if (!is_array($children)) {
            $errors[] = self::message(
                'invalid_children',
                'Element elements must be an array.',
                [
                    'path' => $path,
                ]
            );
            return;
        }

        if ($el_type === 'container') {
            if (isset($element['widgetType'])) {
                $warnings[] = self::message(
                    'container_has_widget_type',
                    'A container should not declare widgetType.',
                    [
                        'path' => $path,
                        'widgetType' => $element['widgetType'],
                    ]
                );
            }
        }

        if ($el_type === 'widget') {
            $widget_type = $element['widgetType'] ?? '';

            if (!is_string($widget_type) || $widget_type === '') {
                $errors[] = self::message(
                    'missing_widget_type',
                    'A widget must declare widgetType.',
                    [
                        'path' => $path,
                    ]
                );
            } elseif (!in_array($widget_type, self::$allowed_widget_types, true)) {
                $errors[] = self::message(
                    'unsupported_widget_type',
                    'Renderer generated a widget that is not supported by Elementor Free mode.',
                    [
                        'path' => $path,
                        'widgetType' => $widget_type,
                    ]
                );
            }

            if (!empty($children)) {
                $warnings[] = self::message(
                    'widget_has_children',
                    'A widget normally should not contain nested elements.',
                    [
                        'path' => $path,
                    ]
                );
            }
        }

        foreach ($children as $child_index => $child) {
            self::validate_element(
                $child,
                $path . '.elements[' . $child_index . ']',
                $seen_ids,
                $errors,
                $warnings
            );
        }
    }

    private static function count_elements($elements) {
        $count = 0;

        foreach ($elements as $element) {
            if (!is_array($element)) {
                continue;
            }

            $count++;

            if (!empty($element['elements']) && is_array($element['elements'])) {
                $count += self::count_elements($element['elements']);
            }
        }

        return $count;
    }

    private static function message($code, $message, $context) {
        return [
            'code' => $code,
            'message' => $message,
            'context' => $context,
        ];
    }

    public static function summarize($validation) {
        return [
            'valid' => !empty($validation['valid']),
            'stats' => $validation['stats'] ?? [],
            'errors' => $validation['errors'] ?? [],
            'warnings' => $validation['warnings'] ?? [],
        ];
    }
}
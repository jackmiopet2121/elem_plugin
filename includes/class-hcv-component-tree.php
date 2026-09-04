<?php
/**
 * HCV Engine V2 - Safe Component Tree Builder
 *
 * Builds parent/children relationships in one pass.
 * Does not recursively scan all nodes.
 */

if (!defined('ABSPATH')) {
    exit;
}

class HCV_Component_Tree {

    public static function build($normalized, $layout_analysis) {
        $source_map = $normalized['source_map'] ?? [];
        $components = $layout_analysis['components'] ?? [];

        $nodes_by_object_id = [];
        $parent_by_source_id = [];
        $children_by_source_id = [];

        /*
         * Pass 1:
         * Map each DOM node object to its HCV source ID.
         */
        foreach ($source_map as $source_id => $descriptor) {
            if (
                empty($descriptor['node']) ||
                !($descriptor['node'] instanceof DOMElement)
            ) {
                continue;
            }

            $nodes_by_object_id[spl_object_id($descriptor['node'])] = $source_id;

            if (!isset($children_by_source_id[$source_id])) {
                $children_by_source_id[$source_id] = [];
            }
        }

        /*
         * Pass 2:
         * For every component, find its direct parent once.
         */
        foreach ($source_map as $source_id => $descriptor) {
            if (
                empty($descriptor['node']) ||
                !($descriptor['node'] instanceof DOMElement) ||
                !isset($components[$source_id])
            ) {
                continue;
            }

            $parent = $descriptor['node']->parentNode;

            while ($parent && !($parent instanceof DOMElement)) {
                $parent = $parent->parentNode;
            }

            if (!$parent instanceof DOMElement) {
                $parent_by_source_id[$source_id] = '';
                continue;
            }

            $parent_object_id = spl_object_id($parent);

            if (!isset($nodes_by_object_id[$parent_object_id])) {
                $parent_by_source_id[$source_id] = '';
                continue;
            }

            $parent_source_id = $nodes_by_object_id[$parent_object_id];

            $parent_by_source_id[$source_id] = $parent_source_id;

            if (isset($children_by_source_id[$parent_source_id])) {
                $children_by_source_id[$parent_source_id][] = $source_id;
            }
        }

        /*
         * Pass 3:
         * Add tree data to each component.
         */
        foreach ($components as $source_id => &$component) {
            $component['parent_source_id'] = $parent_by_source_id[$source_id] ?? '';
            $component['children'] = $children_by_source_id[$source_id] ?? [];
        }
        unset($component);

        return [
            'components' => $components,
            'parent_by_source_id' => $parent_by_source_id,
            'children_by_source_id' => $children_by_source_id,
            'roots' => self::find_roots($components),
            'stats' => [
                'component_count' => count($components),
                'root_count' => count(self::find_roots($components)),
                'relationship_count' => count(
                    array_filter(
                        $parent_by_source_id,
                        function($parent_source_id) {
                            return !empty($parent_source_id);
                        }
                    )
                ),
            ],
        ];
    }

    public static function get_branch($tree, $source_id, $max_depth = 5) {
        $components = $tree['components'] ?? [];

        if (!isset($components[$source_id])) {
            return [];
        }

        return self::build_branch(
            $components,
            $source_id,
            0,
            max(1, intval($max_depth)),
            []
        );
    }

    private static function build_branch(
        $components,
        $source_id,
        $depth,
        $max_depth,
        $visited
    ) {
        if (
            !isset($components[$source_id]) ||
            isset($visited[$source_id])
        ) {
            return [];
        }

        $visited[$source_id] = true;

        $component = $components[$source_id];

        $component['depth'] = $depth;

        if ($depth >= $max_depth) {
            $component['children'] = [];
            $component['children_truncated'] = !empty(
                $components[$source_id]['children']
            );

            return $component;
        }

        $child_branches = [];

        foreach (($components[$source_id]['children'] ?? []) as $child_source_id) {
            $child_branch = self::build_branch(
                $components,
                $child_source_id,
                $depth + 1,
                $max_depth,
                $visited
            );

            if (!empty($child_branch)) {
                $child_branches[] = $child_branch;
            }
        }

        $component['children'] = $child_branches;

        return $component;
    }

    private static function find_roots($components) {
        $roots = [];

        foreach ($components as $source_id => $component) {
            if (empty($component['parent_source_id'])) {
                $roots[] = $source_id;
            }
        }

        return $roots;
    }

    public static function summarize($tree) {
        return [
            'stats' => $tree['stats'] ?? [],
            'roots' => $tree['roots'] ?? [],
        ];
    }
}
<?php
/**
 * HCV Engine V2 - DOM Normalizer
 *
 * Normalizes source HTML before CSS analysis or Elementor rendering.
 * This module does not generate Elementor JSON and does not mutate the
 * user's original input string. It creates a normalized DOM copy with
 * stable source IDs and a source map for later Engine V2 modules.
 *
 * @package Gemini_HTML_to_Elementor_Universal_Pro
 * @since 8.4.0
 */

if (!defined('ABSPATH')) {
    exit;
}

class HCV_DOM_Normalizer {

    const SOURCE_ATTRIBUTE = 'data-hcv-source-id';
    const SOURCE_PREFIX = 'hcv-';
    const MAX_RECOMMENDED_DEPTH = 8;

    /**
     * Normalize HTML into a clean DOM analysis result.
     *
     * @param string $html_content Source HTML document or fragment.
     * @param array  $options Supported options:
     *                        include_header_footer (bool), default false.
     *                        max_depth (int), default 8.
     * @return array|
     */
    public static function normalize($html_content, $options = array()) {
        $options = wp_parse_args($options, array(
            'include_header_footer' => false,
            'max_depth' => self::MAX_RECOMMENDED_DEPTH,
        ));

        $warnings = array();
        $html_content = (string) $html_content;

        if (trim($html_content) === '') {
            return self::empty_result(array(
                self::warning('empty_source', 'error', 'No HTML source was provided.')
            ));
        }

        $document = self::load_document($html_content, $warnings);

        if (!$document) {
            return self::empty_result($warnings);
        }

        $body = self::find_body($document);

        if (!($body instanceof DOMElement)) {
            $warnings[] = self::warning(
                'body_not_found',
                'error',
                'The source could not be normalized into a usable body element.'
            );

            return self::empty_result($warnings, $document);
        }

        self::remove_analysis_noise($body, $warnings);

        $regions = self::detect_regions($body);
        $counter = 0;
        $source_map = array();

        self::assign_source_ids(
            $body,
            $counter,
            $source_map,
            $warnings,
            0,
            max(1, intval($options['max_depth']))
        );

        $sections = self::collect_sections(
            $body,
            $regions,
            !empty($options['include_header_footer'])
        );

        self::append_document_warnings($body, $warnings);

        return array(
            'document' => $document,
            'body' => $body,
            'regions' => $regions,
            'sections' => $sections,
            'source_map' => $source_map,
            'warnings' => self::unique_warnings($warnings),
            'stats' => array(
                'node_count' => count($source_map),
                'section_count' => count($sections),
                'warning_count' => count(self::unique_warnings($warnings)),
            ),
        );
    }

    /**
     * Return a serializable summary safe for AJAX/debug reports.
     */
    public static function summarize($normalized) {
        $summary = array(
            'regions' => array(),
            'sections' => array(),
            'warnings' => $normalized['warnings'] ?? array(),
            'stats' => $normalized['stats'] ?? array(),
        );

        foreach (($normalized['regions'] ?? array()) as $name => $node) {
            $summary['regions'][$name] = $node instanceof DOMElement
                ? self::node_descriptor($node)
                : null;
        }

        foreach (($normalized['sections'] ?? array()) as $section) {
            $summary['sections'][] = array_diff_key(
                $section,
                array('node' => true)
            );
        }

        return $summary;
    }

    /**
     * Locate a node by its generated source ID.
     */
    public static function find_node_by_source_id($normalized, $source_id) {
        $source_id = trim((string) $source_id);

        if ($source_id === '' || empty($normalized['source_map'][$source_id]['node'])) {
            return null;
        }

        $node = $normalized['source_map'][$source_id]['node'];

        return $node instanceof DOMElement ? $node : null;
    }

    private static function load_document($html_content, &$warnings) {
        $document = new DOMDocument('1.0', 'UTF-8');
        $previous = libxml_use_internal_errors(true);

        $encoded_html = mb_encode_numericentity(
            $html_content,
            array(0x80, 0x10FFFF, 0, 0x1FFFFF),
            'UTF-8'
        );

        $loaded = $document->loadHTML(
            '<?xml encoding="UTF-8">' . $encoded_html,
            LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD | LIBXML_NONET
        );

        $errors = libxml_get_errors();
        libxml_clear_errors();
        libxml_use_internal_errors($previous);

        if (!$loaded) {
            $warnings[] = self::warning(
                'html_parse_failed',
                'error',
                'DOMDocument could not parse the supplied HTML.'
            );

            return null;
        }

        $fatal_count = 0;

        foreach ($errors as $error) {
            if ($error->level >= LIBXML_ERR_ERROR) {
                $fatal_count++;
            }
        }

        if ($fatal_count > 0) {
            $warnings[] = self::warning(
                'html_parse_recovered',
                'warning',
                'The supplied HTML contains parse errors. DOM normalization recovered where possible.',
                array('error_count' => $fatal_count)
            );
        }

        return $document;
    }

    private static function find_body($document) {
        $body = $document->getElementsByTagName('body')->item(0);

        if ($body instanceof DOMElement) {
            return $body;
        }

        $main = $document->getElementsByTagName('main')->item(0);

        if ($main instanceof DOMElement) {
            return $main;
        }

        if ($document->documentElement instanceof DOMElement) {
            return $document->documentElement;
        }

        return null;
    }

    /**
     * Remove elements that must not participate in layout/component analysis.
     */
    private static function remove_analysis_noise($root, &$warnings) {
        $skip_tags = array(
            'script', 'style', 'link', 'meta', 'title', 'head',
            'noscript', 'template', 'base', 'source', 'track'
        );

        $to_remove = array();
        $walker = new RecursiveIteratorIterator(
            new RecursiveDOMIterator($root),
            RecursiveIteratorIterator::CHILD_FIRST
        );

        foreach ($walker as $node) {
            if (!($node instanceof DOMElement)) {
                continue;
            }

            $tag = strtolower($node->tagName);
            $class_name = strtolower(trim($node->getAttribute('class')));
            $aria_hidden = strtolower(trim($node->getAttribute('aria-hidden')));

            if (in_array($tag, $skip_tags, true)) {
                $to_remove[] = $node;
                continue;
            }

            if (
                stripos($class_name, 'skip-link') !== false ||
                stripos($class_name, 'screen-reader') !== false ||
                stripos($class_name, 'sr-only') !== false ||
                stripos($class_name, 'cookie-banner') !== false
            ) {
                $to_remove[] = $node;
                continue;
            }

            if ($aria_hidden === 'true' && $tag !== 'svg') {
                $to_remove[] = $node;
            }
        }

        foreach ($to_remove as $node) {
            if ($node->parentNode) {
                $node->parentNode->removeChild($node);
            }
        }

        if (!empty($to_remove)) {
            $warnings[] = self::warning(
                'analysis_noise_removed',
                'info',
                'Non-layout source elements were excluded from Engine V2 analysis.',
                array('removed_count' => count($to_remove))
            );
        }
    }

    private static function detect_regions($body) {
        $regions = array(
            'header' => null,
            'main' => null,
            'footer' => null,
        );

        $walker = new RecursiveIteratorIterator(
            new RecursiveDOMIterator($body),
            RecursiveIteratorIterator::SELF_FIRST
        );

        foreach ($walker as $node) {
            if (!($node instanceof DOMElement)) {
                continue;
            }

            $tag = strtolower($node->tagName);
            $class_name = strtolower(trim($node->getAttribute('class')));
            $id = strtolower(trim($node->getAttribute('id')));

            if ($regions['header'] === null && self::is_header_node($tag, $class_name, $id)) {
                $regions['header'] = $node;
                continue;
            }

            if ($regions['main'] === null && ($tag === 'main' || $id === 'main' || $id === 'page-main')) {
                $regions['main'] = $node;
                continue;
            }

            if ($regions['footer'] === null && self::is_footer_node($tag, $class_name, $id)) {
                $regions['footer'] = $node;
            }
        }

        if ($regions['main'] === null) {
            $regions['main'] = $body;
        }

        return $regions;
    }

    private static function is_header_node($tag, $class_name, $id) {
        return $tag === 'header' ||
            $id === 'header' ||
            $id === 'sitehead' ||
            stripos($class_name, 'site-header') !== false ||
            stripos($class_name, 'site-head') !== false ||
            stripos($class_name, 'header-bar') !== false ||
            stripos($class_name, 'section-nav') !== false;
    }

    private static function is_footer_node($tag, $class_name, $id) {
        return $tag === 'footer' ||
            $id === 'footer' ||
            $id === 'sitefoot' ||
            stripos($class_name, 'site-footer') !== false ||
            stripos($class_name, 'site-foot') !== false ||
            stripos($class_name, 'section-footer') !== false;
    }

    private static function assign_source_ids(
        $node,
        &$counter,
        &$source_map,
        &$warnings,
        $depth,
        $max_depth
    ) {
        if (!($node instanceof DOMElement)) {
            return;
        }

        $counter++;
        $source_id = self::SOURCE_PREFIX . str_pad((string) $counter, 6, '0', STR_PAD_LEFT);
        $node->setAttribute(self::SOURCE_ATTRIBUTE, $source_id);

        $descriptor = self::node_descriptor($node, $depth);
        $descriptor['node'] = $node;
        $source_map[$source_id] = $descriptor;

        if ($depth > $max_depth) {
            $warnings[] = self::warning(
                'deep_nesting',
                'warning',
                'A source node exceeds the recommended nesting depth and may require hybrid conversion.',
                array(
                    'source_id' => $source_id,
                    'depth' => $depth,
                    'max_recommended_depth' => $max_depth,
                )
            );
        }

        self::append_node_warnings($node, $source_id, $warnings);

        foreach ($node->childNodes as $child) {
            if ($child instanceof DOMElement) {
                self::assign_source_ids(
                    $child,
                    $counter,
                    $source_map,
                    $warnings,
                    $depth + 1,
                    $max_depth
                );
            }
        }
    }

    private static function collect_sections($body, $regions, $include_header_footer) {
        $sections = array();
        $main = $regions['main'] instanceof DOMElement ? $regions['main'] : $body;

        foreach ($main->childNodes as $child) {
            if (!($child instanceof DOMElement)) {
                continue;
            }

            if (!$include_header_footer) {
                if ($child === $regions['header'] || $child === $regions['footer']) {
                    continue;
                }

                $tag = strtolower($child->tagName);
                $class_name = strtolower(trim($child->getAttribute('class')));
                $id = strtolower(trim($child->getAttribute('id')));

                if (
                    self::is_header_node($tag, $class_name, $id) ||
                    self::is_footer_node($tag, $class_name, $id)
                ) {
                    continue;
                }
            }

            if (self::is_empty_layout_node($child)) {
                continue;
            }

            $sections[] = self::section_descriptor($child);
        }

        if (empty($sections) && $main instanceof DOMElement && !self::is_empty_layout_node($main)) {
            $sections[] = self::section_descriptor($main);
        }

        return $sections;
    }

    private static function section_descriptor($node) {
        $descriptor = self::node_descriptor($node);
        $descriptor['node'] = $node;
        $descriptor['role_hint'] = self::infer_section_role($node);
        $descriptor['children_count'] = self::element_child_count($node);
        $descriptor['has_heading'] = self::has_descendant_tag($node, array('h1', 'h2', 'h3', 'h4', 'h5', 'h6'));
        $descriptor['has_image'] = self::has_descendant_tag($node, array('img', 'picture'));
        $descriptor['has_svg'] = self::has_descendant_tag($node, array('svg'));
        $descriptor['has_button'] = self::has_descendant_tag($node, array('button')) || self::has_button_like_anchor($node);

        return $descriptor;
    }

    private static function infer_section_role($node) {
        $class_name = strtolower(trim($node->getAttribute('class')));
        $id = strtolower(trim($node->getAttribute('id')));
        $haystack = $class_name . ' ' . $id;

        $patterns = array(
            'hero' => array('hero', 'banner'),
            'trust' => array('trust', 'badge', 'logos'),
            'features' => array('feature', 'benefit', 'service'),
            'timeline' => array('timeline', 'how-it-works', 'process', 'steps'),
            'devices' => array('device', 'platform', 'hardware'),
            'checklist' => array('why', 'checklist', 'advantages'),
            'faq' => array('faq', 'questions', 'accordion'),
            'guides' => array('guide', 'blog', 'article', 'news'),
            'cta' => array('cta', 'call-to-action', 'final'),
            'footer' => array('footer'),
        );

        foreach ($patterns as $role => $needles) {
            foreach ($needles as $needle) {
                if (stripos($haystack, $needle) !== false) {
                    return $role;
                }
            }
        }

        $tag = strtolower($node->tagName);

        if ($tag === 'section') {
            return 'section';
        }

        return 'unknown';
    }

    private static function append_node_warnings($node, $source_id, &$warnings) {
        $tag = strtolower($node->tagName);

        if (in_array($tag, array('canvas', 'iframe', 'video', 'audio'), true)) {
            $warnings[] = self::warning(
                'embedded_or_media_element',
                'warning',
                'This element may require a component fallback or manual review.',
                array('source_id' => $source_id, 'tag' => $tag)
            );
        }

        if ($tag === 'img' && trim($node->getAttribute('src')) === '') {
            $warnings[] = self::warning(
                'image_without_source',
                'warning',
                'An image element has no source URL.',
                array('source_id' => $source_id)
            );
        }

        if ($tag === 'svg') {
            $warnings[] = self::warning(
                'custom_svg_detected',
                'info',
                'A custom SVG was detected. Engine V2 should preserve its path data rather than guess an icon font.',
                array('source_id' => $source_id)
            );
        }

        foreach ($node->attributes as $attribute) {
            if (stripos($attribute->name, 'on') === 0) {
                $warnings[] = self::warning(
                    'inline_event_handler',
                    'warning',
                    'An inline JavaScript event handler requires manual review or a behavior fallback.',
                    array(
                        'source_id' => $source_id,
                        'attribute' => $attribute->name,
                    )
                );
            }
        }

        $style = strtolower($node->getAttribute('style'));

        if (stripos($style, 'position: absolute') !== false || stripos($style, 'position:absolute') !== false) {
            $warnings[] = self::warning(
                'absolute_positioning',
                'info',
                'Absolute positioning was detected. The component may require hybrid rendering.',
                array('source_id' => $source_id)
            );
        }
    }

    private static function append_document_warnings($body, &$warnings) {
        $html = $body->ownerDocument->saveHTML($body);

        if (stripos($html, '::before') !== false || stripos($html, '::after') !== false) {
            $warnings[] = self::warning(
                'pseudo_element_source_hint',
                'info',
                'Pseudo-elements cannot be identified from the DOM alone. CSS analysis must inspect them later.',
                array()
            );
        }
    }

    private static function node_descriptor($node, $depth = null) {
        $classes = preg_split('/\s+/', trim($node->getAttribute('class')));

        if (!$classes || (count($classes) === 1 && $classes[0] === '')) {
            $classes = array();
        }

        $descriptor = array(
            'source_id' => $node->getAttribute(self::SOURCE_ATTRIBUTE),
            'tag' => strtolower($node->tagName),
            'id' => trim($node->getAttribute('id')),
            'classes' => array_values(array_filter($classes)),
        );

        if ($depth !== null) {
            $descriptor['depth'] = $depth;
        }

        return $descriptor;
    }

    private static function has_descendant_tag($node, $tags) {
        foreach ($tags as $tag) {
            if ($node->getElementsByTagName($tag)->length > 0) {
                return true;
            }
        }

        return false;
    }

    private static function has_button_like_anchor($node) {
        $anchors = $node->getElementsByTagName('a');

        foreach ($anchors as $anchor) {
            $class_name = strtolower(trim($anchor->getAttribute('class')));

            if (
                stripos($class_name, 'btn') !== false ||
                stripos($class_name, 'button') !== false ||
                stripos($class_name, 'cta') !== false
            ) {
                return true;
            }
        }

        return false;
    }

    private static function element_child_count($node) {
        $count = 0;

        foreach ($node->childNodes as $child) {
            if ($child instanceof DOMElement) {
                $count++;
            }
        }

        return $count;
    }

    private static function is_empty_layout_node($node) {
        if (!($node instanceof DOMElement)) {
            return true;
        }

        if (self::element_child_count($node) > 0) {
            return false;
        }

        return trim($node->textContent) === '';
    }

    private static function warning($code, $level, $message, $context = array()) {
        return array(
            'code' => $code,
            'level' => $level,
            'message' => $message,
            'context' => $context,
        );
    }

    private static function unique_warnings($warnings) {
        $unique = array();
        $seen = array();

        foreach ($warnings as $warning) {
            $key = md5(wp_json_encode($warning));

            if (isset($seen[$key])) {
                continue;
            }

            $seen[$key] = true;
            $unique[] = $warning;
        }

        return $unique;
    }

    private static function empty_result($warnings = array(), $document = null) {
        return array(
            'document' => $document,
            'body' => null,
            'regions' => array(
                'header' => null,
                'main' => null,
                'footer' => null,
            ),
            'sections' => array(),
            'source_map' => array(),
            'warnings' => $warnings,
            'stats' => array(
                'node_count' => 0,
                'section_count' => 0,
                'warning_count' => count($warnings),
            ),
        );
    }
}

/**
 * RecursiveIterator adapter for DOM child nodes.
 * Kept local to Engine V2 so normalizer traversal is deterministic.
 */
class RecursiveDOMIterator implements RecursiveIterator {

    private $position = 0;
    private $nodes = array();

    public function __construct($node) {
        if ($node instanceof DOMNode && $node->hasChildNodes()) {
            foreach ($node->childNodes as $child) {
                $this->nodes[] = $child;
            }
        }
    }

    public function current(): mixed {
        return $this->nodes[$this->position] ?? null;
    }

    public function key(): mixed {
        return $this->position;
    }

    public function next(): void {
        $this->position++;
    }

    public function rewind(): void {
        $this->position = 0;
    }

    public function valid(): bool {
        return isset($this->nodes[$this->position]);
    }

    public function hasChildren(): bool {
        $current = $this->current();
        return $current instanceof DOMNode && $current->hasChildNodes();
    }

    public function getChildren(): RecursiveIterator {
        return new self($this->current());
    }
}

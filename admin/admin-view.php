<?php
if (!defined('ABSPATH')) exit;
?>
<div class="wrap hcv-pro-wrap">
  <div class="hcv-pro-header">
    <div class="hcv-pro-title">
      <span class="hcv-pro-badge">⭐ PURE NATIVE PRO</span>
      <h1>HTML to Elementor Universal Pro</h1>
    </div>
    <div class="hcv-pro-version">v<?php echo esc_html(HCV_PRO_VERSION); ?></div>
  </div>

  <div class="hcv-pro-card">
    <form id="hcv-pro-form">
      <div class="hcv-pro-field">
        <label for="hcv_post_id"><strong>1. Select Target WordPress Page:</strong></label>
        <select id="hcv_post_id" name="post_id" class="hcv-pro-select">
          <option value="0">➕ Create Brand New Page (Recommended)</option>
          <?php foreach ($pages as $p): ?>
            <option value="<?php echo esc_attr($p->ID); ?>">
              <?php echo esc_html($p->post_title); ?> (ID: <?php echo esc_html($p->ID); ?> - <?php echo esc_html($p->post_status); ?>)
            </option>
          <?php endforeach; ?>
        </select>
      </div>

      <div class="hcv-pro-field" id="hcv-replace-field" style="display:none; margin-top:8px; padding:12px 16px; background:#fff8e1; border:1px solid #ffe082; border-radius:8px;">
        <label class="hcv-pro-checkbox" style="display:flex; align-items:center; gap:8px; cursor:pointer;">
          <input type="checkbox" id="hcv_replace_existing" name="replace_existing" value="1" checked>
          <span>
            <strong>🔄 Replace existing Elementor content on this page</strong>
            <br><small style="color:#666;">If unchecked, new sections will be appended below existing content. Check this to clear old content before importing.</small>
          </span>
        </label>
      </div>

      <div class="hcv-pro-field">
        <label><strong>2. Layout & Header/Footer Mode:</strong></label>
        <div class="hcv-pro-radios">
          <label class="hcv-pro-radio">
            <input type="radio" name="hf_mode" value="theme_hf" checked>
            <div class="hcv-pro-radio-text">
              <strong>🏆 Use Active Theme Header & Footer (Elementor Full Width)</strong>
              <p>Strips code header/footer and renders your active Theme's header and footer. Page content stays centered at 1280px.</p>
            </div>
          </label>

          <label class="hcv-pro-radio">
            <input type="radio" name="hf_mode" value="code_hf">
            <div class="hcv-pro-radio-text">
              <strong>🎨 Use Custom Header & Footer from Code (Elementor Canvas)</strong>
              <p>Keeps custom header and footer from your HTML code and hides theme navigation.</p>
            </div>
          </label>
        </div>
      </div>

      <div class="hcv-pro-field">
        <label for="hcv_html_code"><strong>3. Paste Your Complete HTML and CSS Code:</strong></label>
        <textarea id="hcv_html_code" name="html_code" class="hcv-pro-textarea" rows="18" placeholder="Paste your <!DOCTYPE html> <html> ... <style> ... </style> </html> code here..."></textarea>
      </div>

      <div class="hcv-pro-actions">
  	<button type="submit" id="hcv-btn-convert" class="button button-primary button-hero">
    		🚀 Convert & Build Elementor Page
  	</button>

  	<button type="button" id="hcv-btn-export" class="button button-secondary button-hero">
    		📥 Download Elementor JSON Template
  	</button>

  	<button type="button" id="hcv-btn-test-v2" class="button button-secondary button-hero">
    		🔍 Test Engine V2 Structure
  	</button>
  	<button type="button" id="hcv-btn-download-v2" class="button button-secondary button-hero">
  📦 Download Engine V2 JSON Preview
</button>

<button type="button" id="hcv-btn-convert-v2" class="button button-primary button-hero">
  🧪 Convert with Engine V2 (Draft Test)
</button>

	</div>
    </form>
  </div>

  <div id="hcv-pro-result" class="hcv-pro-result" style="display:none;">
    <div class="hcv-pro-result-header">
      <span class="dashicons dashicons-yes-alt"></span>
      <h3>Compilation & Conversion Successful!</h3>
    </div>
    <p id="hcv-pro-result-msg"></p>
    <div class="hcv-pro-result-btns">
      <a id="hcv-link-edit" href="#" target="_blank" class="button button-primary">✏️ Edit in Elementor</a>
      <a id="hcv-link-view" href="#" target="_blank" class="button button-secondary">👁️ View Page</a>
    </div>
  </div>
</div>
<div id="hcv-v2-result" class="hcv-pro-result" style="display:none; margin-top:20px;">
  <div class="hcv-pro-result-header">
    <span class="dashicons dashicons-search"></span>
    <h3>Engine V2 Structure Test</h3>
  </div>

  <pre id="hcv-v2-result-content" style="white-space:pre-wrap; max-height:500px; overflow:auto; background:#f6f7f7; padding:16px; border-radius:8px; border:1px solid #dcdcde;"></pre>
</div>

<script>
(function(){
  var postSelect = document.getElementById('hcv_post_id');
  var replaceField = document.getElementById('hcv-replace-field');

  function toggleReplace() {
    if (postSelect.value === '0') {
      replaceField.style.display = 'none';
    } else {
      replaceField.style.display = 'block';
    }
  }

  postSelect.addEventListener('change', toggleReplace);
  toggleReplace();
})();
</script>

jQuery(document).ready(function($) {
  'use strict';

  $('#hcv-pro-form').on('submit', function(e) {
    e.preventDefault();

    var postId = $('#hcv_post_id').val();
    var htmlCode = $('#hcv_html_code').val().trim();
    var hfMode = $('input[name="hf_mode"]:checked').val();
    var replaceExisting = $('#hcv_replace_existing').is(':checked') ? 1 : 0;

    if (!htmlCode) {
      alert('Please paste your HTML and CSS code first!');
      return;
    }

    var $btn = $('#hcv-btn-convert');
    var originalText = $btn.html();

    $btn.prop('disabled', true).html('Compiling Pure Native Elementor Tree...');

    $.ajax({
      url: HCV_PRO.ajax_url,
      type: 'POST',
      data: {
        action: 'hcv_universal_convert_page',
        nonce: HCV_PRO.nonce,
        post_id: postId,
        html_code: htmlCode,
        hf_mode: hfMode,
        replace_existing: replaceExisting
      },
      success: function(res) {
        $btn.prop('disabled', false).html(originalText);

        if (res.success) {
          $('#hcv-pro-result-msg').html(res.data.message);
          $('#hcv-link-edit').attr('href', res.data.edit_url);
          $('#hcv-link-view').attr('href', res.data.view_url);
          $('#hcv-pro-result').slideDown();

          $('html, body').animate({
            scrollTop: $('#hcv-pro-result').offset().top - 40
          }, 400);
        } else {
          alert('Error: ' + (res.data.message || 'Conversion failed.'));
        }
      },
      error: function() {
        $btn.prop('disabled', false).html(originalText);
        alert('Server connection error. Please try again.');
      }
    });
  });

  $('#hcv-btn-export').on('click', function(e) {
    e.preventDefault();

    var htmlCode = $('#hcv_html_code').val().trim();
    var hfMode = $('input[name="hf_mode"]:checked').val();

    if (!htmlCode) {
      alert('Please paste your HTML and CSS code first!');
      return;
    }

    var $btn = $(this);
    var originalText = $btn.html();

    $btn.prop('disabled', true).html('Generating Native Elementor JSON...');

    $.ajax({
      url: HCV_PRO.ajax_url,
      type: 'POST',
      data: {
        action: 'hcv_universal_export_json',
        nonce: HCV_PRO.nonce,
        html_code: htmlCode,
        hf_mode: hfMode
      },
      success: function(res) {
        $btn.prop('disabled', false).html(originalText);

        if (res.success) {
          var blob = new Blob([res.data.json], {
            type: 'application/json'
          });

          var link = document.createElement('a');

          link.href = URL.createObjectURL(blob);
          link.download = res.data.filename;

          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

          URL.revokeObjectURL(link.href);
        } else {
          alert('Error: ' + (res.data.message || 'Export failed.'));
        }
      },
      error: function() {
        $btn.prop('disabled', false).html(originalText);
        alert('Server error generating JSON.');
      }
    });
  });

  $('#hcv-btn-test-v2').on('click', function(e) {
    e.preventDefault();

    var htmlCode = $('#hcv_html_code').val().trim();
    var hfMode = $('input[name="hf_mode"]:checked').val();
    var $btn = $(this);
    var $result = $('#hcv-v2-result');
    var $content = $('#hcv-v2-result-content');

    if (!htmlCode) {
      alert('Please paste your HTML and CSS code first!');
      return;
    }

    var originalText = $btn.html();

    $btn.prop('disabled', true).html('Analyzing Engine V2 structure...');
    $result.hide();
    $content.text('');

    $.ajax({
      url: HCV_PRO.ajax_url,
      type: 'POST',
      dataType: 'json',
      data: {
        action: 'hcv_test_engine_v2',
        nonce: HCV_PRO.nonce,
        html_code: htmlCode,
        hf_mode: hfMode
      },
      success: function(res) {
        if (res && res.success) {
          $content.text(JSON.stringify(res.data, null, 2));
          $result.slideDown();

          $('html, body').animate({
            scrollTop: $result.offset().top - 40
          }, 400);
        } else {
          alert('Error: ' + (
            res &&
            res.data &&
            res.data.message
              ? res.data.message
              : 'Engine V2 test failed.'
          ));
        }
      },
      error: function(xhr) {
        console.log('HCV V2 AJAX status:', xhr.status);
        console.log('HCV V2 AJAX response:', xhr.responseText);

        var message = 'Server error running Engine V2 test.';

        if (
          xhr.responseJSON &&
          xhr.responseJSON.data &&
          xhr.responseJSON.data.message
        ) {
          message = xhr.responseJSON.data.message;
        } else if (xhr.responseText) {
          message += '\n\n' + xhr.responseText.substring(0, 1500);
        }

        alert(
          'STATUS: ' + xhr.status +
          '\n\nRESPONSE:\n' +
          (xhr.responseText || 'No response')
        );
      },
      complete: function() {
        $btn.prop('disabled', false).html(originalText);
      }
    });
  });

  $('#hcv-btn-download-v2').on('click', function(e) {
    e.preventDefault();

    var htmlCode = $('#hcv_html_code').val().trim();
    var hfMode = $('input[name="hf_mode"]:checked').val();
    var $btn = $(this);
    var originalText = $btn.html();

    if (!htmlCode) {
      alert('Please paste your HTML and CSS code first!');
      return;
    }

    $btn.prop('disabled', true).html('Building Engine V2 JSON...');

    $.ajax({
      url: HCV_PRO.ajax_url,
      type: 'POST',
      dataType: 'json',
      data: {
        action: 'hcv_download_engine_v2_json',
        nonce: HCV_PRO.nonce,
        html_code: htmlCode,
        hf_mode: hfMode
      },
      success: function(res) {
        if (res && res.success) {
          var blob = new Blob(
            [res.data.json],
            { type: 'application/json' }
          );

          var link = document.createElement('a');

          link.href = URL.createObjectURL(blob);
          link.download = res.data.filename;

          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

          URL.revokeObjectURL(link.href);

          alert(
            'Engine V2 JSON downloaded successfully.\\n\\n' +
            'Validation: ' +
            (res.data.validation.valid ? 'PASSED' : 'FAILED')
          );
        } else {
          alert(
            'Error: ' +
            (
              res &&
              res.data &&
              res.data.message
                ? res.data.message
                : 'Engine V2 JSON export failed.'
            )
          );
        }
      },
      error: function(xhr) {
        var message = 'Server error generating Engine V2 JSON.';

        if (
          xhr.responseJSON &&
          xhr.responseJSON.data &&
          xhr.responseJSON.data.message
        ) {
          message = xhr.responseJSON.data.message;
        }

        alert(message);
      },
      complete: function() {
        $btn.prop('disabled', false).html(originalText);
      }
    });
  });

  $('#hcv-btn-convert-v2').on('click', function(e) {
    e.preventDefault();

    var postId = $('#hcv_post_id').val();
    var htmlCode = $('#hcv_html_code').val().trim();
    var hfMode = $('input[name="hf_mode"]:checked').val();
    var replaceExisting = $('#hcv_replace_existing').is(':checked') ? 1 : 0;

    if (!htmlCode) {
      alert('Please paste your HTML and CSS code first!');
      return;
    }

    var $btn = $(this);
    var originalText = $btn.html();

    $btn.prop('disabled', true).html('Converting with Engine V2...');

    $.ajax({
      url: HCV_PRO.ajax_url,
      type: 'POST',
      data: {
        action: 'hcv_convert_page_v2',
        nonce: HCV_PRO.nonce,
        post_id: postId,
        html_code: htmlCode,
        hf_mode: hfMode,
        replace_existing: replaceExisting
      },
      success: function(res) {
        $btn.prop('disabled', false).html(originalText);

        if (res.success) {
          $('#hcv-pro-result-msg').html(res.data.message);
          $('#hcv-link-edit').attr('href', res.data.edit_url);
          $('#hcv-link-view').attr('href', res.data.view_url);
          $('#hcv-pro-result').slideDown();

          $('html, body').animate({
            scrollTop: $('#hcv-pro-result').offset().top - 40
          }, 400);
        } else {
          alert('Error: ' + (res.data.message || 'Conversion failed.'));
        }
      },
      error: function(xhr) {
        console.log('HCV V2 Convert AJAX status:', xhr.status);
        console.log('HCV V2 Convert AJAX response:', xhr.responseText);

        var message = 'Server connection error. Please try again.';

        if (xhr.responseJSON && xhr.responseJSON.data && xhr.responseJSON.data.message) {
          message = xhr.responseJSON.data.message;
        } else if (xhr.responseText) {
          message += '\n\nServer response:\n' + xhr.responseText.substring(0, 1500);
        }

        $btn.prop('disabled', false).html(originalText);
        alert(message);
      }
    });
  });

});
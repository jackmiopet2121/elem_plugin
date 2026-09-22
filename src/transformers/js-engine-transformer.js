/**
 * JS Engine Transformer.
 * Compiles detected Vanilla JS interactive logic into an inline native Elementor Free execution engine.
 */
const { generateId } = require('../core/id-generator');

function buildInteractiveEngineWidget(options = {}) {
  const {
    tierClassPrefix = 'tier',
    switcherClassPrefix = 'switcher-btn',
    customJs = '',
    customCss = ''
  } = options;

  const engineHtml = `<style>
/* Defensive Native Elementor Free Engine Styles */
.tier-1-cards, .tier-2-cards, .tier-3-cards {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.tier-hidden {
  display: none !important;
  opacity: 0 !important;
  pointer-events: none !important;
}
.tier-visible {
  display: flex !important;
  opacity: 1 !important;
  pointer-events: auto !important;
}
.switcher-active {
  background: #ffffff !important;
  color: #0f172a !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08) !important;
}
.switcher-active h3, .switcher-active span {
  color: #0f172a !important;
}
.switcher-active svg path {
  fill: #10b981 !important;
}
${customCss}
</style>
<script>
(function() {
  function initEngine() {
    // Interactive Tab Switcher Handlers
    const buttons = [
      { id: 'switcher-1', tier: 1 },
      { id: 'switcher-2', tier: 2 },
      { id: 'switcher-3', tier: 3 }
    ];

    function activateTier(tierNum) {
      for (let i = 1; i <= 3; i++) {
        const containers = document.querySelectorAll('.tier-' + i + '-cards');
        containers.forEach(function(c) {
          if (i === tierNum) {
            c.classList.remove('tier-hidden');
            c.classList.add('tier-visible');
            c.style.display = 'flex';
          } else {
            c.classList.remove('tier-visible');
            c.classList.add('tier-hidden');
            c.style.display = 'none';
          }
        });

        const btn = document.querySelector('.switcher-btn-' + i);
        if (btn) {
          if (i === tierNum) {
            btn.classList.add('switcher-active');
          } else {
            btn.classList.remove('switcher-active');
          }
        }
      }
    }

    buttons.forEach(function(b) {
      const el = document.querySelector('.switcher-btn-' + b.tier);
      if (el) {
        el.style.cursor = 'pointer';
        el.addEventListener('click', function(e) {
          e.preventDefault();
          activateTier(b.tier);
        });
      }
    });

    // Default to Tier 1
    activateTier(1);

    ${customJs}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEngine);
  } else {
    initEngine();
  }
})();
</script>`;

  return {
    id: generateId(),
    elType: 'widget',
    widgetType: 'html',
    settings: {
      html: engineHtml,
      _margin: { unit: 'px', top: '0', right: '0', bottom: '0', left: '0', isLinked: true },
      _padding: { unit: 'px', top: '0', right: '0', bottom: '0', left: '0', isLinked: true },
      _css_classes: 'interactive-engine-script',
      css_classes: 'interactive-engine-script'
    },
    elements: []
  };
}

module.exports = {
  buildInteractiveEngineWidget
};

<script>(function(){
  Array.prototype.forEach.call(document.querySelectorAll('[data-ww-couple-search]'), function(root, index){
    if (root.getAttribute('data-ww-ready') === 'true') return;
    root.setAttribute('data-ww-ready', 'true');

    var launcher = root.querySelector('.wwcd-search-launcher');
    var closeButton = root.querySelector('.wwcd-search-close');
    var select = root.querySelector('select[name="sid"]');
    var location = root.querySelector('input[name="location_value"]');
    var quickLinks = root.querySelectorAll('[data-ww-category]');
    var form = root.querySelector('form');
    var submitLabel = root.querySelector('.wwcd-search-button span');
    var submitText = submitLabel ? submitLabel.textContent : '';

    if (!launcher) return;

    if (select) {
      select.id = 'wwcd-category-' + index;
      var categoryLabel = root.querySelector('label[for="wwcd-category"]');
      if (categoryLabel) categoryLabel.setAttribute('for', select.id);
    }
    if (location) {
      location.id = 'wwcd-location-' + index;
      var locationLabel = root.querySelector('label[for="wwcd-location"]');
      if (locationLabel) locationLabel.setAttribute('for', location.id);
    }

    function syncQuickLinks(){
      if (!select) return;
      Array.prototype.forEach.call(quickLinks, function(button){
        var isActive = button.getAttribute('data-ww-category') === select.value;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });
    }

    if (closeButton) {
      closeButton.hidden = false;
      closeButton.addEventListener('click', function(){
        root.open = false;
        launcher.focus();
      });
    }

    root.addEventListener('keydown', function(event){
      var target = event.target;
      var isFormControl = target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName);
      if (event.key === 'Escape' && root.open && !event.defaultPrevented && !isFormControl) {
        root.open = false;
        launcher.focus();
      }
    });

    if (select) select.addEventListener('change', syncQuickLinks);

    Array.prototype.forEach.call(quickLinks, function(button){
      button.addEventListener('click', function(){
        if (!select) return;
        select.value = button.getAttribute('data-ww-category');
        select.dispatchEvent(new Event('change', { bubbles: true }));
        select.focus();
      });
    });

    if (form && submitLabel) {
      form.addEventListener('submit', function(){
        submitLabel.textContent = 'Searching...';
      });
      window.addEventListener('pageshow', function(){
        submitLabel.textContent = submitText;
        syncQuickLinks();
      });
    }

    syncQuickLinks();
  });
})();</script>

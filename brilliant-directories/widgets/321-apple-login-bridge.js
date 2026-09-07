<script>
(function(){
  var BUTTON_ID = 'ww-web-apple-login';
  var FINAL_URL = 'https://www.weddingwin.ca/account/home';

  // Only these public, free signup plans are supported by the Apple bridge.
  // Keep aliases paired with the canonical plan; never default an unknown
  // checkout (including paid plans) to a Couples account.
  var SIGNUP_ROUTES = {
    '17': 'vendor',
    'pro-members-copy-11-copy-17': 'vendor',
    '10': 'couple',
    '18': 'couple',
    '23': 'vendor_venue',
    '33': 'vendor_multi',
    'basic': 'vendor_basic',
    '35': 'vendor_basic',
    '37': 'vendor_venue_multi',
    'niagara-wedding-show': 'vendor_show',
    '38': 'vendor_show'
  };

  function signupRole() {
    var path = window.location.pathname || '';
    var query = new URLSearchParams(window.location.search);
    if (query.has('claim') || query.has('claim_listing')) return false;
    var claimFields = document.querySelectorAll('input[name="claim"],input[name="claim_listing"]');
    for (var i = 0; i < claimFields.length; i++) {
      if (String(claimFields[i].value || '').trim()) return false;
    }
    var checkout = path.match(/^\/checkout\/([^/]+)\/?$/);
    if (!checkout) return /^\/checkout(?:\/|$)/.test(path) ? false : null;
    return Object.prototype.hasOwnProperty.call(SIGNUP_ROUTES, checkout[1])
      ? SIGNUP_ROUTES[checkout[1]] : false;
  }

  function isAppWebView() {
    return /WeddingWinApp/i.test(navigator.userAgent || '');
  }

  function isCheckoutPage() {
    return /^\/checkout\//.test(window.location.pathname || '') || !!document.querySelector('#signup_free,#googleAction,#containerGoogleLogin,#containerFBLogin,iframe[src*=\"accounts.google.com/gsi/button\"]');
  }

  function appleStartHref() {
    var role = signupRole();
    if (role === false) return null;
    var url = new URL('https://www.weddingwin.ca/auth/apple-start');
    url.searchParams.set('redirect_to', FINAL_URL);
    if (role) url.searchParams.set('signup_role', role);
    return url.toString();
  }

  function closestBlock(el) {
    if (!el) return null;
    return el.closest('.form-group,.row,.col-sm-6,.col-md-6,.col-xs-12,.module,div') || el.parentElement;
  }

  function findLoginArea() {
    var headings = Array.prototype.slice.call(document.querySelectorAll('h1,h2,h3,.h1,.h2,.h3'));
    for (var i = 0; i < headings.length; i++) {
      if (/member login/i.test(headings[i].textContent || '')) {
        return headings[i].closest('.module,.well,.panel,.container,div') || headings[i].parentElement;
      }
    }
    return document.querySelector('.ww-apple-login-bridge') || document.body;
  }

  function findCheckoutAnchor() {
    var fb = document.querySelector('#containerFBLogin,.btn-facebook');
    if (fb) return closestBlock(fb);

    var google = document.querySelector('#containerGoogleLogin,.btn-google,#googleAction,iframe[src*=\"accounts.google.com/gsi/button\"]');
    if (google) return closestBlock(google);

    var socialRow = Array.prototype.slice.call(document.querySelectorAll('.row,.form-group,div')).filter(function(el){
      return /google|facebook|social/i.test(el.textContent || '') || el.querySelector('iframe[src*=\"accounts.google.com/gsi/button\"]');
    })[0];
    if (socialRow) return socialRow;

    var signup = document.querySelector('#signup_free');
    return signup || null;
  }

  function buildButton(label) {
    var wrap = document.createElement('div');
    wrap.id = BUTTON_ID;
    wrap.className = 'ww-apple-login-wrap';

    var link = document.createElement('a');
    link.href = appleStartHref();
    link.setAttribute('aria-label', label);
    link.innerHTML = '<span class=\"ww-apple-mark\">&#63743;</span><span>' + label + '</span>';
    wrap.appendChild(link);
    return wrap;
  }

  function ensureButton() {
    if (isAppWebView()) return;

    var existing = document.getElementById(BUTTON_ID);
    if (signupRole() === false) {
      if (existing) existing.remove();
      return;
    }
    if (existing) {
      var oldLink = existing.tagName === 'A' ? existing : existing.querySelector('a');
      if (oldLink) oldLink.href = appleStartHref();
      return;
    }

    if (isCheckoutPage()) {
      var checkoutHost = document.createElement('div');
      checkoutHost.className = 'ww-apple-checkout-row';
      checkoutHost.appendChild(buildButton('Continue with Apple'));
      var anchor = findCheckoutAnchor();
      if (anchor) {
        anchor.insertAdjacentElement('afterend', checkoutHost);
        return;
      }
    }

    var google = document.querySelector('a[href*=\"google\"],button[id*=\"google\"],.google-login,.login-google');
    var wrap = buildButton('Sign in with Apple');
    if (google && google.parentElement) {
      google.parentElement.insertAdjacentElement('afterend', wrap);
      return;
    }

    findLoginArea().appendChild(wrap);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureButton);
  } else {
    ensureButton();
  }
  setTimeout(ensureButton, 500);
  setTimeout(ensureButton, 1500);
  setTimeout(ensureButton, 3000);
})();
</script>

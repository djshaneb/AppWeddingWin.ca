<script>
// WeddingWin checkout Apple login bridge
(function(){
  if ((window.location.pathname || '').indexOf('/checkout/') !== 0) return;
  if (/WeddingWinApp/i.test(navigator.userAgent || '')) return;
  function isLoggedIn(){
    if (document.body && (document.body.classList.contains('logged-in') || document.body.classList.contains('member-logged-in'))) return true;
    if (document.querySelector('a[href*="/logout"],a[href*="logout.php"],.member-profile-header,.account-menu')) return true;
    var accountLinks = document.querySelectorAll('a[href*="/account/home"]');
    for (var i = 0; i < accountLinks.length; i++) {
      var txt = (accountLinks[i].textContent || '').toLowerCase();
      if (txt.indexOf('dashboard') !== -1 || txt.indexOf('my account') !== -1 || txt.indexOf('account home') !== -1) return true;
    }
    return false;
  }
  if (isLoggedIn()) return;
  var BUTTON_ID = 'ww-web-apple-login';
  // Public free checkout routes only; keep each plan distinct through Apple.
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
  function signupRole(){
    var query = new URLSearchParams(window.location.search);
    if (query.has('claim') || query.has('claim_listing')) return null;
    var claimFields = document.querySelectorAll('input[name="claim"],input[name="claim_listing"]');
    for (var i = 0; i < claimFields.length; i++) {
      if (String(claimFields[i].value || '').trim()) return null;
    }
    var path = window.location.pathname || '';
    if (path.charAt(path.length - 1) === '/') path = path.slice(0, -1);
    var checkout = path.indexOf('/checkout/') === 0 ? path.slice(10) : '';
    return Object.prototype.hasOwnProperty.call(SIGNUP_ROUTES, checkout)
      ? SIGNUP_ROUTES[checkout] : null;
  }
  function appleHref(){
    var role = signupRole();
    if (!role) return null;
    var u = new URL('https://www.weddingwin.ca/auth/apple-start');
    u.searchParams.set('redirect_to','https://www.weddingwin.ca/account/home');
    u.searchParams.set('signup_role', role);
    return u.toString();
  }
  function ensure(){
    if (isLoggedIn()) return;
    var existing = document.getElementById(BUTTON_ID);
    var href = appleHref();
    if (!href) {
      if (existing) existing.remove();
      return;
    }
    if (existing) {
      var link = existing.tagName === 'A' ? existing : existing.querySelector('a');
      if (link) link.href = href;
      return;
    }
    var google = document.querySelector('#containerGoogleLogin');
    var form = document.querySelector('form[id^="signup"],#signup_free,#whmcs_signup_paid,form[action*="/checkout/"]');
    if (!google || !form) return;
    var host = document.createElement('div');
    host.className = 'col-sm-6 tmargin xs-nopad ww-apple-checkout-row';
    var wrap = document.createElement('div');
    wrap.id = BUTTON_ID;
    wrap.className = 'ww-apple-login-wrap';
    var link = document.createElement('a');
    link.href = href;
    link.setAttribute('aria-label','Continue with Apple');
    var svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('class','ww-apple-icon');
    svg.setAttribute('viewBox','0 0 24 24');
    svg.setAttribute('aria-hidden','true');
    svg.setAttribute('focusable','false');
    var iconPath = document.createElementNS('http://www.w3.org/2000/svg','path');
    iconPath.setAttribute('fill','currentColor');
    iconPath.setAttribute('d','M16.365 1.43c0 1.14-.42 2.17-1.25 3.08-.9.98-1.93 1.54-3.02 1.45-.14-1.1.32-2.25 1.1-3.15.86-.99 2.35-1.75 3.17-1.38zM20.86 17.17c-.54 1.25-.8 1.8-1.49 2.9-.97 1.49-2.34 3.35-4.04 3.37-1.51.01-1.9-.99-3.95-.98-2.05.01-2.48.99-3.99.98-1.7-.02-3-1.69-3.97-3.18-2.72-4.17-3-9.06-1.33-11.67 1.19-1.86 3.06-2.95 4.83-2.95 1.8 0 2.94 1 4.43 1 1.44 0 2.32-1 4.4-1 1.57 0 3.24.86 4.42 2.34-3.89 2.13-3.26 7.68.69 9.19z');
    svg.appendChild(iconPath);
    var label = document.createElement('span');
    label.appendChild(document.createTextNode('Continue with Apple'));
    link.appendChild(svg);
    link.appendChild(label);
    wrap.appendChild(link);
    host.appendChild(wrap);
    google.insertAdjacentElement('beforebegin', host);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensure);
  } else {
    ensure();
  }
  setTimeout(ensure,500);
  setTimeout(ensure,1500);
  setTimeout(ensure,3000);
})();
</script>

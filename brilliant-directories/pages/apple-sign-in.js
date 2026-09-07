<script>
(function () {
  'use strict';
  var form = document.getElementById('ww-apple-signin-form');
  if (!form) return;
  var button = form.querySelector('button[type="submit"]');
  var status = form.querySelector('.ww-apple-signin-status');
  var error = document.getElementById('ww-apple-signin-error');
  var submitted = false;
  var params = new URLSearchParams(window.location.search);
  var roles = params.getAll('signup_role');
  var signupCopy = {
    vendor: 'Create your vendor account with Apple.',
    vendor_venue: 'Create your wedding venue account with Apple.',
    vendor_multi: 'Create your multi-business vendor account with Apple.',
    vendor_venue_multi: 'Create your multi-business wedding venue account with Apple.',
    vendor_basic: 'Create your vendor account with Apple.',
    vendor_show: 'Create your Niagara Wedding Show vendor account with Apple.',
    couple: 'Create your couple account with Apple.'
  };
  var invalidRole = roles.length > 1 || (roles.length === 1 && !Object.prototype.hasOwnProperty.call(signupCopy, roles[0]));
  if (!invalidRole && roles.length === 1) {
    form.elements.signup_role.disabled = false;
    form.elements.signup_role.value = roles[0];
    document.getElementById('ww-apple-signin-intro').textContent = signupCopy[roles[0]];
  }
  try {
    var destination = new URL(params.get('redirect_to') || 'https://www.weddingwin.ca/account/home');
    if (destination.protocol === 'https:' && /^(www\.)?weddingwin\.ca$/.test(destination.hostname) && !destination.username && !destination.password && !destination.port) {
      form.elements.redirect_to.value = destination.toString();
    }
  } catch (_) { /* Keep the safe account-home default. */ }
  var messages = {
    agreement_required: 'Please agree to the Terms of Service and Privacy Policy to continue.',
    policies_changed: 'Our terms have been updated. Please review the links below and agree to continue.',
    invalid_request: 'Please try again using the button below.',
    invalid_account_type: 'Please return to the signup page and choose your account type again.',
    account_type_mismatch: 'This Apple account already has a different WeddingWin membership. Use the sign-in link below to open your existing account, or contact us for help changing it.',
    sign_in_unavailable: 'Apple sign-in is temporarily unavailable. Please try again or use another sign-in option.'
  };
  var errorCode = invalidRole ? 'invalid_account_type' : params.get('error');
  var blocked = invalidRole || errorCode === 'invalid_account_type' || errorCode === 'account_type_mismatch';
  button.disabled = blocked;
  if (Object.prototype.hasOwnProperty.call(messages, errorCode)) {
    error.textContent = messages[errorCode];
    error.hidden = false;
  }
  form.addEventListener('submit', function (event) {
    if (blocked || submitted || !form.checkValidity()) {
      event.preventDefault();
      if (!blocked && !submitted) form.reportValidity();
      return;
    }
    submitted = true;
    button.disabled = true;
    status.textContent = 'Opening Apple sign-in…';
  });
  window.addEventListener('pageshow', function () {
    submitted = false;
    button.disabled = blocked;
    status.textContent = '';
  });
})();
</script>

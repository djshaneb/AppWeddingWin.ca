<!-- WeddingWin chat email footer guard v1 BEGIN -->
<script>
(function () {
  'use strict';
  var path = window.location.pathname;
  while (path.length > 1 && path.slice(-1) === '/') path = path.slice(0, -1);
  if (!(path.endsWith('/connect') || path === '/account/chat_messages' || path.indexOf('/account/chat_messages/') === 0)) return;
  if (window.__wwChatEmailFooterGuard) return;
  window.__wwChatEmailFooterGuard = true;
  var composeSelector = '.bd-chat-pmb-st-form,.bd-chat-pmb-reply-form-container,.bd-chat-pmb-rfc-submit-container,#bd-chat-pmb-sm-sm';
  var state = 'unknown', inFlight = false, prefilterInstalled = false;
  var notice, message, retry, review;

  function compose() { return document.querySelector(composeSelector); }
  function withinCompose(target) { return target && typeof target.closest === 'function' && target.closest(composeSelector); }
  function text(node, value) { if (node.textContent !== value) node.textContent = value; }
  function render() {
    var form = compose();
    if (!form) return;
    if (!notice) {
      notice = document.createElement('div');
      notice.id = 'ww-chat-email-status';
      notice.setAttribute('role', 'status');
      notice.setAttribute('aria-live', 'polite');
      notice.style.cssText = 'padding:14px 18px;margin:12px 0;border:1px solid #dfc7c7;border-radius:8px;background:#faf5f5;color:#554747;font-size:16px;line-height:1.5';
      message = document.createElement('p');
      message.style.margin = '0 0 8px';
      review = document.createElement('a');
      review.href = '/verify-email-change';
      review.textContent = 'Review email';
      review.style.cssText = 'color:#944c50;margin-right:16px;text-decoration:underline';
      retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'btn btn-default btn-sm';
      retry.addEventListener('click', function (event) { event.preventDefault(); check(); });
      notice.appendChild(message);
      notice.appendChild(review);
      notice.appendChild(retry);
    }
    if (!notice.isConnected && form.parentNode) form.parentNode.insertBefore(notice, form);
    notice.hidden = state === 'allowed';
    retry.disabled = inFlight;
    review.hidden = state !== 'pending';
    if (inFlight || state === 'unknown') {
      text(message, 'Checking your email before sending messages...');
      text(retry, 'Checking...');
    } else if (state === 'pending') {
      text(message, 'Confirm your new email before sending messages.');
      text(retry, 'I have confirmed my email');
    } else {
      text(message, 'We could not check your email. Please try again.');
      text(retry, 'Try again');
    }
  }
  function check() {
    if (inFlight || !compose()) return;
    inFlight = true;
    state = 'unknown';
    render();
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 12000);
    fetch('/verify-email-change', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'ww_email_change_action=status', signal: controller.signal
    }).then(function (response) {
      if (!response.ok) throw new Error('unavailable');
      return response.json();
    }).then(function (data) {
      if (!data || data.ok !== true || typeof data.email_confirmation_required !== 'boolean') throw new Error('unavailable');
      var required = data.email_verification_status === 'pending' || data.email_verification_status === 'expired';
      var allowed = data.email_verification_status === 'none' || data.email_verification_status === 'confirmed';
      if ((!required && !allowed) || data.email_confirmation_required !== required) throw new Error('unavailable');
      state = required ? 'pending' : 'allowed';
    }).catch(function () { state = 'error'; }).finally(function () {
      clearTimeout(timeout);
      inFlight = false;
      render();
    });
  }
  function stopWrite(event) {
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    render();
    if (state === 'unknown') check();
  }
  document.addEventListener('click', function (event) {
    var control = event.target && typeof event.target.closest === 'function' ? event.target.closest('button,input[type="submit"],a,#bd-chat-pmb-sm-sm') : null;
    if (state !== 'allowed' && control && withinCompose(control) && !(notice && notice.contains(control))) stopWrite(event);
  }, true);
  document.addEventListener('submit', function (event) {
    if (state !== 'allowed' && withinCompose(event.target)) stopWrite(event);
  }, true);
  document.addEventListener('keydown', function (event) {
    if (state !== 'allowed' && (event.key === 'Enter' || event.keyCode === 13) && !event.shiftKey && withinCompose(event.target)) stopWrite(event);
  }, true);
  function activate() {
    if (!compose()) return;
    if (!prefilterInstalled && window.jQuery && typeof window.jQuery.ajaxPrefilter === 'function') {
      prefilterInstalled = true;
      window.jQuery.ajaxPrefilter(function (options, original, request) {
        if (state === 'allowed' || !compose()) return;
        try {
          var url = new URL(options.url || '', window.location.href);
          if (url.origin !== window.location.origin || url.pathname !== '/wapi/widget') return;
          var payload = original && original.data !== undefined ? original.data : options.data;
          var action = typeof payload === 'string' ? new URLSearchParams(payload).get('subaction') :
            payload && typeof payload.get === 'function' ? payload.get('subaction') : payload && payload.subaction;
          if (action !== 'init-pmb-thread' && action !== 'add-thread-message') return;
          if (request && typeof request.abort === 'function') request.abort('email_confirmation_required');
          render();
          if (state === 'unknown') check();
        } catch (_) { /* Unrelated malformed requests remain the add-on's concern. */ }
      });
    }
    render();
    if (state === 'unknown') check();
  }
  function start() {
    activate();
    if (window.MutationObserver && document.body) new MutationObserver(activate).observe(document.body, { childList: true, subtree: true });
  }
  activate();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
  window.addEventListener('focus', function () { if (compose()) check(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && compose()) check(); });
})();
</script>
<!-- WeddingWin chat email footer guard v1 END -->

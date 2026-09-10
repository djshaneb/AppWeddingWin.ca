<script>
(function () {
    'use strict';
    // This is normal-page UX, not the proprietary add-on's authorization
    // boundary. Server preflight and the separately provisioned database guards
    // enforce pending-email state for proprietary add-on/API message writes.
    function installPendingUi() {
    if (window.__wwChatEmailPendingUiInstalled) return;
    var notice = document.getElementById('ww-chat-email-pending-notice');
    if (!notice || notice.getAttribute('data-email-confirmation-required') !== '1') return;
    window.__wwChatEmailPendingUiInstalled = true;

    function showNotice() {
        notice.hidden = false;
    }
    function withinCompose(target) {
        return !!(target && typeof target.closest === 'function' && target.closest(
            '.bd-chat-pmb-st-form,.bd-chat-pmb-reply-form-container,.bd-chat-pmb-rfc-submit-container,#bd-chat-pmb-sm-sm'
        ));
    }
    function stopWrite(event) {
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
        showNotice();
    }
    document.addEventListener('click', function (event) {
        var target = event.target;
        var control = target && typeof target.closest === 'function'
            ? target.closest('button,input[type="submit"],a') : null;
        if (control && withinCompose(control)) stopWrite(event);
    }, true);
    document.addEventListener('submit', function (event) {
        if (withinCompose(event.target)) stopWrite(event);
    }, true);
    document.addEventListener('keydown', function (event) {
        if ((event.key === 'Enter' || event.keyCode === 13) && !event.shiftKey && withinCompose(event.target)) {
            stopWrite(event);
        }
    }, true);

    // Catch the add-on's programmatic sends on this rendered page as well as
    // button/keyboard actions. Read/list/other AJAX calls remain unaffected.
    if (window.jQuery && typeof window.jQuery.ajaxPrefilter === 'function') {
        window.jQuery.ajaxPrefilter(function (options, originalOptions, request) {
            try {
                var url = new URL(options.url || '', window.location.href);
                if (url.origin !== window.location.origin || url.pathname !== '/wapi/widget') return;
                var payload = originalOptions && originalOptions.data !== undefined ? originalOptions.data : options.data;
                var action;
                if (typeof payload === 'string') action = new URLSearchParams(payload).get('subaction');
                else if (payload && typeof payload.get === 'function') action = payload.get('subaction');
                else if (payload && typeof payload === 'object') action = payload.subaction;
                if (action !== 'init-pmb-thread' && action !== 'add-thread-message') return;
                if (request && typeof request.abort === 'function') request.abort('email_confirmation_required');
                showNotice();
            } catch (_) {
                // Malformed unrelated requests remain the add-on's concern;
                // never redirect, replay, log a payload, or invent success.
            }
        });
    }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', installPendingUi, true);
    } else {
        installPendingUi();
    }
})();
</script>

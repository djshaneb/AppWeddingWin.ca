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

<script>

function validate() {
var reason='';
form=document.matched;
    

  if (form.answerq.value!=<? $total=$val1+$val2; echo $total; ?>) {
  	reason=reason+'- Answer the security question\n';
  }

if (reason!='') { reason='Please correct the following errors:\n'+reason; alert(reason); return false; }
else { document.getElementById('loadingimg2').style.visibility='visible'; return true; }
}

</script>
<script>
(function () {
    if (window.__wwNewThreadGuardInstalled) {
        return;
    }
    window.__wwNewThreadGuardInstalled = true;

    var guardWidgetName = 'WeddingWin Chat New Thread Guard API';
    var recaptchaLoading = false;
    var recaptchaCallbacks = [];

    function closeGuardDialog() {
        if (window.swal && typeof window.swal.close === 'function') {
            window.swal.close();
        } else if (window.swal && typeof window.swal.closeModal === 'function') {
            window.swal.closeModal();
        }
    }

    function showWarning(message) {
        if (window.swal) {
            window.swal('', message, 'warning');
        } else {
            window.alert(message);
        }
    }

    function loadRecaptcha(callback) {
        if (window.grecaptcha && typeof window.grecaptcha.render === 'function') {
            callback();
            return;
        }

        recaptchaCallbacks.push(callback);
        if (recaptchaLoading) {
            return;
        }
        recaptchaLoading = true;

        var script = document.createElement('script');
        script.src = 'https://www.google.com/recaptcha/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        script.onload = function () {
            recaptchaLoading = false;
            var callbacks = recaptchaCallbacks.slice(0);
            recaptchaCallbacks = [];
            callbacks.forEach(function (item) { item(); });
        };
        script.onerror = function () {
            recaptchaLoading = false;
            recaptchaCallbacks = [];
            showWarning('The security check could not load. Please refresh the page and try again.');
        };
        document.head.appendChild(script);
    }

    function releaseButton(button) {
        button.removeAttribute('data-ww-guard-busy');
    }

    function replayApprovedClick(button) {
        releaseButton(button);
        button.setAttribute('data-ww-guard-pass', '1');
        button.click();
    }

    function showChallenge(response, button, message) {
        if (!response.site_key) {
            releaseButton(button);
            showWarning('The security check is not configured. Please contact WeddingWin support.');
            return;
        }

        var holderId = 'ww-chat-recaptcha-' + String(Date.now());
        var dialogHtml = '<p style="margin-bottom:14px">' + response.message + '</p>' +
            '<div id="' + holderId + '" style="display:inline-block"></div>' +
            '<p style="font-size:12px;color:#6b7280;margin-top:12px">This check applies only when starting several new conversations. Replies are unaffected.</p>';

        if (window.swal) {
            window.swal({
                title: 'Quick security check',
                html: dialogHtml,
                showConfirmButton: false,
                showCancelButton: true,
                cancelButtonText: 'Cancel',
                allowOutsideClick: false
            }).then(function () {
                releaseButton(button);
            }, function () {
                releaseButton(button);
            });
        }

        loadRecaptcha(function () {
            window.setTimeout(function () {
                var holder = document.getElementById(holderId);
                if (!holder) {
                    releaseButton(button);
                    return;
                }
                window.grecaptcha.render(holderId, {
                    sitekey: response.site_key,
                    callback: function (token) {
                        checkGuard(button, message, token);
                    },
                    'expired-callback': function () {
                        showWarning('The security check expired. Please try it again.');
                    },
                    'error-callback': function () {
                        releaseButton(button);
                        showWarning('The security check could not be completed. Please try again.');
                    }
                });
            }, 100);
        });
    }

    function handleGuardResponse(response, button, message) {
        if (!response || typeof response !== 'object') {
            releaseButton(button);
            showWarning('The chat safety service returned an unexpected response. Please try again.');
            return;
        }

        if (response.result === 'allow') {
            closeGuardDialog();
            replayApprovedClick(button);
            return;
        }

        if (response.result === 'challenge_required') {
            showChallenge(response, button, message);
            return;
        }

        releaseButton(button);
        showWarning(response.message || 'This new conversation could not be started.');
    }

    function checkGuard(button, message, captchaToken) {
        var payload = {
            widget_name: guardWidgetName,
            header_type: 'json',
            request_type: 'POST',
            subaction: 'ww-chat-guard-check',
            recipient_id: button.getAttribute('data-userid') || '',
            message: message,
            captcha_token: captchaToken || ''
        };

        window.jQuery.ajax({
            url: '/wapi/widget',
            type: 'POST',
            dataType: 'json',
            data: payload,
            success: function (response) {
                handleGuardResponse(response, button, message);
            },
            error: function (xhr, statusText, errorThrown) {
                if (xhr && xhr.status === 403 && xhr.responseJSON && xhr.responseJSON.result === 'email_confirmation_required') {
                    releaseButton(button);
                    showWarning('Confirm your new email address before sending messages.');
                    return;
                }
                if (window.console && typeof window.console.error === 'function') {
                    window.console.error('[WeddingWin Chat Guard]', xhr ? xhr.status : 0, statusText || '', errorThrown || '', xhr && xhr.responseText ? xhr.responseText.slice(0, 500) : '');
                }
                releaseButton(button);
                showWarning('The chat safety service is temporarily unavailable (error ' + (xhr ? xhr.status : 0) + '). Please try again.');
            }
        });
    }

    // Capture before BD's delegated init-pmb-thread click handler. The approved
    // replay is allowed through once; reply buttons use different selectors.
    document.addEventListener('click', function (event) {
        var button = event.target && event.target.closest ? event.target.closest('#bd-chat-pmb-sm-sm') : null;
        if (!button) {
            return;
        }

        if (button.getAttribute('data-ww-guard-pass') === '1') {
            button.removeAttribute('data-ww-guard-pass');
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        if (button.getAttribute('data-ww-guard-busy') === '1') {
            return;
        }
        button.setAttribute('data-ww-guard-busy', '1');

        var textarea = document.getElementById('bd-chat-pmbrfc-message');
        var message = textarea ? textarea.value : '';
        if (!message || !message.trim()) {
            releaseButton(button);
            showWarning('You cannot send an empty message to this member.');
            return;
        }

        checkGuard(button, message, '');
    }, true);

    // Guard native form submits as well as button clicks. This covers Enter-key
    // and alternate BD submit paths that do not originate on the send button.
    document.addEventListener('submit', function (event) {
        var form = event.target;
        if (!form || typeof form.querySelector !== 'function') {
            return;
        }

        var button = form.querySelector('#bd-chat-pmb-sm-sm');
        if (!button || button.getAttribute('data-ww-guard-pass') === '1') {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        if (button.getAttribute('data-ww-guard-busy') !== '1') {
            button.click();
        }
    }, true);

    // Preserve normal multiline Enter behavior; Ctrl/Cmd+Enter intentionally
    // submits through the same guarded button path.
    document.addEventListener('keydown', function (event) {
        var target = event.target;
        var chatContainer = target && target.closest ? target.closest('.bd-chat-pmb-st-form') : null;
        var visibleEditor = target && target.closest ? target.closest('.fr-element[contenteditable="true"]') : null;
        var isMessageEditor = target && target.matches && target.matches('#bd-chat-pmbrfc-message');
        isMessageEditor = isMessageEditor || Boolean(visibleEditor && chatContainer);
        var isSubmitShortcut = (event.key === 'Enter' || event.keyCode === 13) && (event.ctrlKey || event.metaKey);
        if (!isMessageEditor || !isSubmitShortcut) {
            return;
        }

        var form = target.closest ? target.closest('form') : null;
        var button = chatContainer ? chatContainer.querySelector('#bd-chat-pmb-sm-sm') :
            (form ? form.querySelector('#bd-chat-pmb-sm-sm') : document.getElementById('bd-chat-pmb-sm-sm'));
        if (!button) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        button.click();
    }, true);
})();
</script>

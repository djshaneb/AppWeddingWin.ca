(function () {
  'use strict';
  const root = document.querySelector('[data-email-verification]');
  if (!root || root.dataset.initialized === 'true') return;
  root.dataset.initialized = 'true';
  const form = root.querySelector('[data-email-request-form]');
  const status = root.querySelector('[data-email-status]');
  const refresh = root.querySelector('[data-email-refresh]');
  let busy = false;
  async function submit(action, email) {
    if (busy) return;
    busy = true;
    const buttons = root.querySelectorAll('button');
    buttons.forEach(button => { button.disabled = true; });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    if (status) status.textContent = action === 'request' ? 'Sending your confirmation email…' : 'Checking your email…';
    try {
      const values = new URLSearchParams({ ww_email_change_action: action });
      if (email !== undefined) values.set('new_email', email);
      const response = await fetch('/verify-email-change', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: values.toString(), signal: controller.signal
      });
      const body = await response.json();
      if (!response.ok || body.ok !== true) throw new Error(typeof body.message === 'string' ? body.message : 'Please try again.');
      if (action === 'status') {
        const valid = typeof body.current_email === 'string' &&
          typeof body.email_confirmation_required === 'boolean' &&
          ['none', 'pending', 'expired', 'confirmed'].includes(body.email_verification_status);
        if (!valid) throw new Error('We could not check your email. Please try again.');
        if (body.email_confirmation_required) {
          if (status) status.textContent = body.email_verification_status === 'expired'
            ? 'Your link has expired. Request a new confirmation email above.'
            : 'Please open the link in your email and choose Confirm Email first.';
        } else if (/@privaterelay\.appleid\.com$/i.test(body.current_email.trim())) {
          if (status) status.textContent = 'Add and confirm a contact email before continuing with QR Bingo.';
        } else {
          window.location.assign('/qr');
        }
      } else if (status) {
        status.textContent = typeof body.message === 'string' ? body.message : 'Check your email for the confirmation link.';
      }
    } catch (error) {
      if (status) status.textContent = error && error.name === 'AbortError'
        ? 'This is taking longer than expected. Check your email before trying again.'
        : (error && error.message ? error.message : 'Please try again.');
    } finally {
      clearTimeout(timeout);
      busy = false;
      buttons.forEach(button => { button.disabled = false; });
    }
  }
  if (form) form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const input = form.querySelector('[name="new_email"]');
    submit('request', input.value.trim());
  });
  if (refresh) refresh.addEventListener('click', () => submit('status'));
  const confirm = root.querySelector('[data-email-confirm-form]');
  if (confirm) confirm.addEventListener('submit', event => {
    if (busy) { event.preventDefault(); return; }
    busy = true;
    const button = confirm.querySelector('button[type="submit"]');
    if (button) { button.disabled = true; button.textContent = 'Confirming…'; }
  });
})();


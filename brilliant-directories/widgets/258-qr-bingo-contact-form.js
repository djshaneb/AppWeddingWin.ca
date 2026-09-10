    /* WW_QR_CONTACT_FORM_START */
    function initializeQrContactForm() {
      const form = document.getElementById('qrContactForm');
      if (!form || form.dataset.qrContactInitialized === '1') return;
      form.dataset.qrContactInitialized = '1';
      const gate = document.getElementById('qrContactGate');
      const save = document.getElementById('qrContactSave');
      const status = document.getElementById('qrContactStatus');
      const dateOpen = document.getElementById('qrContactDateOpen');
      const dateUnsure = document.getElementById('qrContactDateUnsure');
      const dialog = document.getElementById('qrContactDateDialog');
      const picker = document.getElementById('qrContactDatePicker');
      const edit = document.getElementById('qrContactEdit');
      const reload = document.getElementById('qrContactReload');
      const venueGroup = document.getElementById('qrContactVenueGroup');
      const venue = document.getElementById('qrContactVenue');
      // Hydrate once from the authenticated, safely encoded contact DTO;
      // repeated script delivery must never overwrite an in-progress edit.
      [['qrContactName', 'name'], ['qrContactEmail', 'email'], ['qrContactPhone', 'phone'], ['qrContactVenue', 'wedding_venue']].forEach(function (field) {
        document.getElementById(field[0]).value = typeof QR_CONTACT_PROFILE[field[1]] === 'string' ? QR_CONTACT_PROFILE[field[1]] : '';
      });
      let weddingDate = QR_CONTACT_PROFILE.wedding_date || '';
      let saving = false;
      function showDate() {
        const parts = weddingDate.split('-');
        const display = weddingDate && parts.length === 3
          ? new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })
          : 'Choose wedding date';
        dateOpen.textContent = '📅 ' + display;
        venueGroup.hidden = !weddingDate;
        if (!weddingDate) venue.value = '';
      }
      function setSaving(value) { saving = value; form.querySelectorAll('input,button').forEach(control => { control.disabled = value; }); }
      function closeDate() { if (dialog.open) dialog.close(); dateOpen.focus(); }
      function clearDate() { if (saving) return; weddingDate = ''; showDate(); closeDate(); }
      showDate();
      save.disabled = false;
      dateOpen.disabled = false;
      dateUnsure.disabled = false;
      reload.addEventListener('click', function () { if (!saving) window.location.reload(); });
      dateOpen.addEventListener('click', function () {
        if (saving) return;
        if (document.activeElement && typeof document.activeElement.blur === 'function') document.activeElement.blur();
        picker.value = weddingDate;
        if (typeof dialog.showModal !== 'function') { status.textContent = 'Your browser needs an update to open the calendar.'; return; }
        dialog.showModal();
        picker.focus();
        if (typeof picker.showPicker === 'function') { try { picker.showPicker(); } catch (_) {} }
      });
      document.getElementById('qrContactDateClose').addEventListener('click', closeDate);
      dialog.addEventListener('cancel', function (event) { event.preventDefault(); closeDate(); });
      picker.addEventListener('change', function () { weddingDate = picker.value; showDate(); closeDate(); });
      document.getElementById('qrContactDateClear').addEventListener('click', clearDate);
      dateUnsure.addEventListener('click', clearDate);
      if (edit) edit.addEventListener('click', function () {
        stopScanner();
        gate.hidden = false;
        document.getElementById('qrScannerExperience').hidden = true;
        edit.hidden = true;
        document.getElementById('qrContactName').focus();
      });
      form.addEventListener('submit', async function (event) {
        event.preventDefault();
        if (saving || !form.reportValidity()) return;
        const email = document.getElementById('qrContactEmail').value.trim();
        if (/@privaterelay[.]appleid[.]com$/i.test(email)) { status.textContent = 'Use an email where wedding vendors can contact you.'; return; }
        const fields = new URLSearchParams();
        fields.set('action', 'contact_profile_save');
        fields.set('qr_csrf', QR_WEBSITE_CSRF);
        fields.set('expected_event_key', EVENT_CONFIG.event_key);
        fields.set('expected_config_revision', String(EVENT_CONFIG.revision));
        fields.set('contact_event_key', QR_CONTACT_PROFILE.event_key);
        fields.set('expected_version', String(QR_CONTACT_PROFILE.version));
        fields.set('name', document.getElementById('qrContactName').value.trim());
        fields.set('email', email);
        fields.set('phone', document.getElementById('qrContactPhone').value.trim());
        fields.set('wedding_date', weddingDate);
        fields.set('wedding_venue', weddingDate ? venue.value.trim() : '');
        setSaving(true); reload.hidden = true;
        status.textContent = 'Saving your contact details…';
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);
        try {
          const response = await fetch('', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: fields.toString(), signal: controller.signal });
          let result;
          try { result = await response.json(); }
          catch (_) { reload.hidden = false; throw new Error('Your save could not be confirmed. Refresh contact details before trying again.'); }
          if (!response.ok || !result.ok || !result.profile_complete) {
            reload.hidden = response.status !== 409 && result.code !== 'contact_date_sync_pending';
            throw new Error(result.code === 'contact_date_sync_pending'
              ? 'Your QR Bingo details were saved. Refresh contact details to finish syncing your wedding date.'
              : response.status === 409 ? 'Your details changed elsewhere. Refresh contact details before saving again.'
              : (typeof result.error === 'string' ? result.error : 'Your details could not be saved. Please try again.'));
          }
          window.location.reload();
        } catch (error) {
          status.textContent = error && error.name === 'AbortError' ? 'Saving took too long. Refresh contact details to check before trying again.' : error instanceof Error ? error.message : 'Your details could not be saved. Please try again.';
          if (error && error.name === 'AbortError') reload.hidden = false;
          setSaving(false);
        } finally { clearTimeout(timeout); }
      });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeQrContactForm, { once: true });
    else initializeQrContactForm();
    /* WW_QR_CONTACT_FORM_END */

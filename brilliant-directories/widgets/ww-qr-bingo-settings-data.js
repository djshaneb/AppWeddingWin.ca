  /* WW_QR_ADMIN_DATA_UI_START */
  function initializeQrAdminData() {
    const root = document.getElementById('wwQrData');
    const form = document.getElementById('wwQrDataForm');
    if (!root || !form || form.dataset.qrDataInitialized === '1') return;
    form.dataset.qrDataInitialized = '1';
    const status = document.getElementById('wwQrDataStatus');
    const head = document.getElementById('wwQrDataHead');
    const rows = document.getElementById('wwQrDataRows');
    const previous = document.getElementById('wwQrDataPrevious');
    const next = document.getElementById('wwQrDataNext');
    const tabs = Array.from(root.querySelectorAll('[data-dataset]'));
    const byId = id => document.getElementById(id);
    const addPanel = byId('wwQrContactPanel'), addForm = byId('wwQrContactAddForm');
    const contactStatus = byId('wwQrContactStatus'), matches = byId('wwQrContactMatches');
    const confirmPanel = byId('wwQrContactConfirm');
    let dataset = 'contacts', page = 1, hasMore = false, busy = false;
    let selectedMember = null, contactEvent = '', confirmation = null, pendingMutation = null;
    const validId = value => typeof value === 'string' && /^[1-9][0-9]{0,17}$/.test(value);
    const eventKey = () => byId('wwQrDataEvent').value.trim();
    const contactFilter = () => byId('wwQrDataContactStatus').value;
    function setBusy(value) {
      busy = value;
      root.querySelectorAll('button,input,select').forEach(control => { control.disabled = value; });
      previous.disabled = value || page <= 1;
      next.disabled = value || !hasMore;
    }
    function clearRows() { head.replaceChildren(); rows.replaceChildren(); hasMore = false; previous.disabled = true; next.disabled = true; }
    function cell(tag, value) { const node = document.createElement(tag); node.textContent = value == null || value === '' ? '—' : String(value); return node; }
    function fieldsFor(action) {
      const fields = new URLSearchParams();
      fields.set('ww_qrbs_csrf_token', form.querySelector('[name="ww_qrbs_csrf_token"]').value);
      fields.set('ww_qrbs_form_action', action);
      return fields;
    }
    async function post(fields) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const response = await fetch(form.action, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: fields.toString(), signal: controller.signal });
        const result = await response.json();
        if (!response.ok || !result || result.ok !== true) {
          const error = new Error(result && typeof result.error === 'string' ? result.error : 'The request could not be completed. Please try again.');
          error.httpStatus = response.status;
          throw error;
        }
        return result;
      } finally { clearTimeout(timeout); }
    }
    function closeConfirmation() { confirmation = null; confirmPanel.hidden = true; }
    function closeAdd() { addPanel.hidden = true; byId('wwQrContactAddOpen').setAttribute('aria-expanded', 'false'); }
    function clearMember() { selectedMember = null; addForm.hidden = true; matches.replaceChildren(); }
    function errorText(error) { return error instanceof Error && error.name !== 'AbortError' ? error.message : 'The request could not be confirmed. Please try again.'; }
    function adminName(message, output) {
      const name = byId('wwQrDataOperator').value.trim();
      if (name.length < 3 || name.length > 160) { output.textContent = message; byId('wwQrDataOperator').focus(); return ''; }
      return name;
    }
    function rowAction(record, selectedEvent) {
      const column = document.createElement('td');
      if (!validId(record.couple_id) || !Number.isSafeInteger(record.version) || record.version < 1 || typeof record.removed !== 'boolean') {
        column.textContent = 'Refresh to manage'; return column;
      }
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'ww-qrbs-button ww-qrbs-contact-row-action ' + (record.removed ? 'ww-qrbs-data-secondary' : 'ww-qrbs-data-danger');
      button.textContent = record.removed ? 'Restore' : 'Remove';
      button.setAttribute('aria-label', button.textContent + ' contact for ' + String(record.name || 'couple') + ' (member ' + record.couple_id + ')');
      button.addEventListener('click', () => {
        if (busy || dataset !== 'contacts' || selectedEvent !== eventKey()) return;
        closeAdd();
        confirmation = { action: record.removed ? 'contact_restore' : 'contact_remove', coupleId: record.couple_id, version: record.version, event: selectedEvent };
        byId('wwQrContactConfirmMessage').textContent = (record.removed ? 'Restore ' : 'Remove ') + String(record.name || 'this couple') + ' (member #' + record.couple_id + ') ' + (record.removed ? 'to' : 'from') + ' Bingo contacts for event “' + selectedEvent + '”?';
        byId('wwQrContactConfirmAction').textContent = record.removed ? 'Restore contact' : 'Remove contact';
        confirmPanel.hidden = false;
        byId('wwQrContactConfirmCancel').focus();
      });
      column.appendChild(button); return column;
    }
    async function request(exporting, requestedPage) {
      if (busy || !form.reportValidity()) return;
      const operator = exporting ? adminName('Enter your admin name for the download audit.', status) : byId('wwQrDataOperator').value.trim();
      if (exporting && !operator) return;
      const fields = fieldsFor(exporting ? 'data_export' : 'data_list');
      fields.set('dataset', dataset);
      fields.set('event_key', eventKey());
      fields.set('vendor_id', document.getElementById('wwQrDataVendor').value.trim());
      fields.set('search', document.getElementById('wwQrDataSearch').value.trim());
      if (dataset === 'contacts') fields.set('contact_status', contactFilter());
      fields.set('operator_identity', operator);
      fields.set('page', String(requestedPage)); fields.set('page_size', '50');
      setBusy(true); status.textContent = exporting ? 'Preparing your audited download…' : 'Loading records…';
      try {
        const result = await post(fields);
        if (result.dataset !== dataset || result.event_key !== fields.get('event_key') || result.event_key !== eventKey() || (dataset === 'contacts' && (result.contact_status !== fields.get('contact_status') || result.contact_status !== contactFilter()))) throw new Error('The returned list did not match your filters. Please refresh and retry.');
        if (exporting) {
          const report = result.report;
          if (!report || typeof report.csv !== 'string' || !/^[a-zA-Z0-9._-]+[.]csv$/.test(report.filename) || report.mime_type !== 'text/csv;charset=utf-8' || !Number.isInteger(report.row_count) || report.row_count < 0 || report.row_count > 5000) throw new Error('The download could not be verified.');
          const csv = report.csv.charCodeAt(0) === 65279 ? report.csv : String.fromCharCode(65279) + report.csv;
          const url = URL.createObjectURL(new Blob([csv], { type: report.mime_type }));
          const link = document.createElement('a'); link.href = url; link.download = report.filename;
          document.body.appendChild(link); link.click(); link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          status.textContent = report.row_count + ' records downloaded. This export was audited.';
        } else {
          if (!Array.isArray(result.columns) || result.columns.length > 50 || !Array.isArray(result.rows) || result.rows.length > 100 || !Number.isInteger(result.page) || result.page !== requestedPage || typeof result.has_more !== 'boolean') throw new Error('The returned list could not be verified.');
          clearRows(); const titleRow = document.createElement('tr');
          if (dataset === 'contacts') titleRow.appendChild(cell('th', 'Actions'));
          result.columns.forEach(column => { if (!column || typeof column.key !== 'string' || typeof column.label !== 'string') throw new Error('The list columns could not be verified.'); titleRow.appendChild(cell('th', column.label)); });
          head.appendChild(titleRow);
          result.rows.forEach(record => { if (!record || typeof record !== 'object') throw new Error('The list records could not be verified.'); const row = document.createElement('tr'); if (dataset === 'contacts') row.appendChild(rowAction(record, result.event_key)); result.columns.forEach(column => row.appendChild(cell('td', record[column.key]))); rows.appendChild(row); });
          page = result.page; hasMore = result.has_more;
          status.textContent = result.rows.length ? 'Page ' + page + ' · ' + result.total + ' matching records' : 'No matching records.';
        }
        return true;
      } catch (error) { if (!exporting) clearRows(); status.textContent = errorText(error); return false; }
      finally { setBusy(false); }
    }
    async function lookup(event) {
      event.preventDefault();
      if (busy || dataset !== 'contacts' || addPanel.hidden || contactEvent !== eventKey() || !byId('wwQrContactLookupForm').reportValidity()) return;
      const search = byId('wwQrContactLookup').value.trim();
      if (search.length < 2 || search.length > 120) { contactStatus.textContent = 'Enter at least two characters to find a couple.'; return; }
      const fields = fieldsFor('contact_lookup'); fields.set('search', search);
      setBusy(true); clearMember(); contactStatus.textContent = 'Finding couple accounts…';
      try {
        const result = await post(fields);
        if (!Array.isArray(result.members) || result.members.length > 20 || byId('wwQrContactLookup').value.trim() !== search || contactEvent !== eventKey()) throw new Error('The couple search could not be verified. Please search again.');
        if (result.members.some(member => !member || !validId(member.couple_id) || typeof member.name !== 'string' || member.name.length > 500 || typeof member.email !== 'string' || member.email.length > 254)) throw new Error('The couple search could not be verified. Please search again.');
        result.members.forEach(member => {
          const row = document.createElement('div'); row.className = 'ww-qrbs-contact-match';
          row.appendChild(cell('span', member.name + ' · #' + member.couple_id + ' · ' + member.email));
          const choose = document.createElement('button'); choose.type = 'button'; choose.className = 'ww-qrbs-button ww-qrbs-data-secondary'; choose.textContent = 'Choose';
          choose.setAttribute('aria-label', 'Choose ' + member.name + ' (member ' + member.couple_id + ')');
          choose.addEventListener('click', () => {
            if (busy || contactEvent !== eventKey() || dataset !== 'contacts') return;
            selectedMember = { coupleId: member.couple_id }; pendingMutation = null;
            byId('wwQrContactChosen').textContent = member.name + ' · Member #' + member.couple_id;
            byId('wwQrContactName').value = member.name;
            byId('wwQrContactEmail').value = member.email;
            ['wwQrContactPhone', 'wwQrContactDate', 'wwQrContactVenue'].forEach(id => { byId(id).value = ''; });
            byId('wwQrContactVenueGroup').hidden = true; matches.replaceChildren(); addForm.hidden = false;
            contactStatus.textContent = 'Review the contact details before adding them.'; byId('wwQrContactName').focus();
          });
          row.appendChild(choose); matches.appendChild(row);
        });
        contactStatus.textContent = result.members.length ? 'Choose the couple account to add.' : 'No matching couple accounts. Try another name, email, or member ID.';
      } catch (error) { matches.replaceChildren(); contactStatus.textContent = errorText(error); }
      finally { setBusy(false); }
    }
    function requestId() {
      if (typeof crypto === 'undefined') throw new Error('Secure requests are unavailable. Refresh this admin page.');
      if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
      if (typeof crypto.getRandomValues !== 'function') throw new Error('Secure requests are unavailable. Refresh this admin page.');
      const bytes = crypto.getRandomValues(new Uint8Array(16)); bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
      const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
      return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
    }
    async function mutate(target) {
      const adding = target.action === 'contact_add', output = adding ? contactStatus : status;
      if (busy || dataset !== 'contacts' || target.event !== eventKey() || !form.reportValidity()) return;
      const operator = adminName('Enter your admin name before changing contacts.', output); if (!operator) return;
      const fields = fieldsFor(target.action);
      fields.set('dataset', 'contacts'); fields.set('event_key', target.event); fields.set('couple_id', target.coupleId);
      fields.set('expected_version', String(target.version)); fields.set('operator_identity', operator);
      if (adding) {
        fields.set('name', byId('wwQrContactName').value.trim()); fields.set('email', byId('wwQrContactEmail').value.trim()); fields.set('phone', byId('wwQrContactPhone').value.trim());
        fields.set('wedding_date', byId('wwQrContactDate').value); fields.set('wedding_venue', byId('wwQrContactDate').value ? byId('wwQrContactVenue').value.trim() : '');
      }
      let refresh = false, succeeded = false, message = '';
      try {
        const fingerprint = fields.toString();
        if (!pendingMutation || pendingMutation.fingerprint !== fingerprint) pendingMutation = { fingerprint, id: requestId() };
        fields.set('request_id', pendingMutation.id);
        setBusy(true); output.textContent = 'Saving the contact change…';
        const result = await post(fields);
        if (result.action !== target.action || result.dataset !== 'contacts' || result.event_key !== target.event || result.couple_id !== target.coupleId || result.request_id !== fields.get('request_id') || !Number.isSafeInteger(result.version) || result.version <= target.version || result.removed !== (target.action === 'contact_remove')) throw new Error('The contact change could not be verified. Refresh the list before trying again.');
        pendingMutation = null; refresh = true; succeeded = true;
        message = result.replayed === true ? 'This change was already saved. The current list is shown below.' : adding ? 'Contact added. Accounts and draw records were not changed.' : target.action === 'contact_remove' ? 'Contact removed. You can restore it from Removed contacts.' : 'Contact restored.';
        if (adding) {
          byId('wwQrDataVendor').value = ''; byId('wwQrDataSearch').value = ''; byId('wwQrDataContactStatus').value = 'active'; page = 1;
          clearMember(); closeAdd();
        } else closeConfirmation();
      } catch (error) {
        message = errorText(error);
        if (error && error.httpStatus === 409) { refresh = true; closeConfirmation(); message = adding ? 'This contact changed or already exists. Your entered details are still here; review the current contact before trying again.' : 'This contact changed. Review the current list before trying again.'; }
      } finally { setBusy(false); }
      if (refresh) {
        const refreshed = await request(false, page);
        if (!refreshed) message += ' The list could not be refreshed; select Show list before another change.';
        else if (!succeeded) message += ' The list has been refreshed.';
      }
      output.textContent = message;
      if (succeeded || !adding) status.textContent = message;
    }
    tabs.forEach(tab => tab.addEventListener('click', function () {
      if (busy) return;
      dataset = tab.dataset.dataset; page = 1; clearRows(); closeAdd(); closeConfirmation();
      tabs.forEach(item => item.setAttribute('aria-selected', item === tab ? 'true' : 'false'));
      document.getElementById('wwQrDataScanNote').hidden = dataset !== 'scans';
      byId('wwQrDataContactStatusGroup').hidden = dataset !== 'contacts'; byId('wwQrContactAddOpen').hidden = dataset !== 'contacts';
      void request(false, 1);
    }));
    form.addEventListener('submit', event => { event.preventDefault(); void request(false, 1); });
    document.getElementById('wwQrDataExport').addEventListener('click', () => { void request(true, 1); });
    previous.addEventListener('click', () => { if (page > 1) void request(false, page - 1); });
    next.addEventListener('click', () => { if (hasMore) void request(false, page + 1); });
    ['wwQrDataEvent', 'wwQrDataVendor', 'wwQrDataSearch', 'wwQrDataContactStatus'].forEach(id => document.getElementById(id).addEventListener(id === 'wwQrDataContactStatus' ? 'change' : 'input', () => { if (!busy) { page = 1; clearRows(); closeConfirmation(); if (id === 'wwQrDataEvent') { closeAdd(); clearMember(); } status.textContent = 'Filters changed. Select Show list.'; } }));
    byId('wwQrContactAddOpen').addEventListener('click', () => {
      if (busy || dataset !== 'contacts' || !form.reportValidity()) return;
      closeConfirmation(); clearMember(); contactEvent = eventKey(); addPanel.hidden = false;
      byId('wwQrContactEvent').textContent = 'Event: ' + contactEvent; byId('wwQrContactAddOpen').setAttribute('aria-expanded', 'true');
      byId('wwQrContactLookup').value = ''; contactStatus.textContent = ''; byId('wwQrContactLookup').focus();
    });
    byId('wwQrContactLookupForm').addEventListener('submit', event => { void lookup(event); });
    byId('wwQrContactLookup').addEventListener('input', () => { if (!busy) clearMember(); });
    byId('wwQrContactDate').addEventListener('change', () => { byId('wwQrContactVenueGroup').hidden = !byId('wwQrContactDate').value; });
    byId('wwQrContactCancel').addEventListener('click', () => { if (!busy) { closeAdd(); byId('wwQrContactAddOpen').focus(); } });
    addForm.addEventListener('submit', event => { event.preventDefault(); if (!busy && !addPanel.hidden && selectedMember && addForm.reportValidity()) void mutate({ action: 'contact_add', coupleId: selectedMember.coupleId, version: 0, event: contactEvent }); });
    byId('wwQrContactConfirmAction').addEventListener('click', () => { if (confirmation) void mutate(confirmation); });
    byId('wwQrContactConfirmCancel').addEventListener('click', () => { if (!busy) closeConfirmation(); });
  }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeQrAdminData, { once: true });
    else initializeQrAdminData();
  /* WW_QR_ADMIN_DATA_UI_END */

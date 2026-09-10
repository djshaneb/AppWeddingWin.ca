<script>
(function () {
  const login = document.getElementById('wwQrrPasswordForm');
  if (login) {
    let unlocking = false;
    login.addEventListener('submit', async event => {
      event.preventDefault();
      if (unlocking) return;
      unlocking = true;
      const password = document.getElementById('resultsPassword');
      const message = document.getElementById('wwQrrPasswordStatus');
      const button = login.querySelector('button');
      button.disabled = true;
      message.textContent = 'Opening results...';
      try {
        const response = await fetch('/qr_results', {method:'POST', credentials:'same-origin', cache:'no-store', headers:{'Content-Type':'application/x-www-form-urlencoded', Accept:'application/json'}, body:new URLSearchParams({action:'unlock_results',results_password:password.value}).toString()});
        const data = await response.json();
        if (!response.ok || data.status !== 'success') throw new Error(data.message || 'Could not open results. Please try again.');
        window.location.replace('/qr_results');
      } catch (error) { message.textContent = error instanceof Error ? error.message : 'Please try again.'; }
      finally { password.value = ''; button.disabled = false; unlocking = false; }
    });
  }
  const root = document.getElementById('wwQrResultsApp');
  if (!root) return;

  const eventKey = root.dataset.eventKey || '';
  const configRevision = root.dataset.configRevision || '';
  const active = document.getElementById('wwQrrActive');
  const completed = document.getElementById('wwQrrCompleted');
  const vendors = document.getElementById('wwQrrVendors');
  const search = document.getElementById('wwQrrSearch');
  const refresh = document.getElementById('wwQrrRefresh');
  const status = document.getElementById('wwQrrStatus');
  const tableWrap = document.getElementById('wwQrrTableWrap');
  const body = document.getElementById('wwQrrBody');
  const empty = document.getElementById('wwQrrEmpty');
  const updated = document.getElementById('wwQrrUpdated');
  let participants = [];
  let inFlight = false;

  function postAction(action, extra, signal) {
    const form = new URLSearchParams({
      action,
      expected_event_key: eventKey,
      expected_config_revision: configRevision,
      ...(extra || {})
    });
    return fetch(window.location.href, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      credentials: 'same-origin',
      cache: 'no-store',
      signal
    }).then(async response => {
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        body.replaceChildren();
        participants = [];
        root.hidden = true;
        window.location.reload();
        throw new Error('Enter the page password again.');
      }
      if (response.status === 409 && data.code === 'stale_event_config') {
        const url = new URL(window.location.href);
        const marker = `${eventKey}:${configRevision}`;
        if (url.searchParams.get('results_refresh') !== marker) {
          url.searchParams.set('results_refresh', marker);
          window.location.replace(url.toString());
          throw new Error('Event settings changed. Reloading results.');
        }
        throw new Error('QR Bingo settings changed. Please reload this page.');
      }
      if (!response.ok || data.status !== 'success') {
        throw new Error(data.message || 'Results could not be loaded.');
      }
      return data;
    });
  }

  function appendCell(row, label, child) {
    const cell = document.createElement('td');
    cell.dataset.label = label;
    if (typeof child === 'string') cell.textContent = child;
    else cell.appendChild(child);
    row.appendChild(cell);
  }

  function renderRows() {
    const term = search.value.trim().toLowerCase();
    const filtered = participants.filter(item => [item.label, item.member_id, item.email, item.phone].some(value => String(value || '').toLowerCase().includes(term)));
    body.replaceChildren();
    tableWrap.hidden = filtered.length === 0;
    empty.hidden = filtered.length !== 0;
    if (participants.length > 0 && filtered.length === 0) {
      empty.querySelector('h2').textContent = 'No members match';
      empty.querySelector('p').textContent = 'Try a different search.';
    } else {
      empty.querySelector('h2').textContent = 'No current-event scans yet';
      empty.querySelector('p').textContent = 'This page will update as couples visit vendors in the published QR Bingo event.';
    }

    filtered.forEach(item => {
      const row = document.createElement('tr');
      const name = document.createElement('span');
      name.className = 'ww-qrr-participant';
      name.textContent = item.label || 'Name not provided';
      appendCell(row, 'Name', name);
      appendCell(row, 'Member ID', item.member_id ? `#${item.member_id}` : '—');
      appendCell(row, 'Email', item.email || '—');
      appendCell(row, 'Phone', item.phone || '—');

      const progress = document.createElement('div');
      progress.className = 'ww-qrr-progress';
      const track = document.createElement('div');
      track.className = 'ww-qrr-track';
      const fill = document.createElement('div');
      fill.className = 'ww-qrr-fill';
      fill.style.width = `${Math.max(0, Math.min(100, Number(item.progress_percentage) || 0))}%`;
      track.appendChild(fill);
      const progressText = document.createElement('div');
      progressText.className = 'ww-qrr-progress-text';
      progressText.textContent = `${item.scanned_count}/${item.total_vendors} (${item.progress_percentage}%)`;
      progress.append(track, progressText);
      appendCell(row, 'Progress', progress);

      const badge = document.createElement('span');
      badge.className = `ww-qrr-badge${item.is_completed ? ' is-complete' : ''}`;
      badge.textContent = item.is_completed ? 'Completed' : 'In progress';
      appendCell(row, 'Status', badge);
      body.appendChild(row);
    });
  }

  async function loadResults() {
    if (inFlight) return;
    inFlight = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    refresh.disabled = true;
    status.classList.remove('is-error');
    status.textContent = 'Loading current results...';
    try {
      const data = await postAction('get_scoreboard_data', null, controller.signal);
      participants = Array.isArray(data.participants) ? data.participants : [];
      const participantCount = Number(data.active_participants) || 0;
      active.textContent = String(participantCount);
      completed.textContent = String(data.completed_participants || 0);
      vendors.textContent = String(data.total_vendors || 0);
      status.textContent = participantCount > participants.length
        ? `Showing ${participants.length} of ${participantCount} participants. The totals above include everyone.`
        : participantCount
          ? `${participantCount} current-event participant${participantCount === 1 ? '' : 's'}`
          : 'No current-event scans have been recorded.';
      updated.textContent = `Last refreshed ${new Date().toLocaleTimeString()}`;
      renderRows();
    } catch (error) {
      status.classList.add('is-error');
      status.textContent = controller.signal.aborted
        ? 'Results are taking longer than expected. Please try Refresh results.'
        : error instanceof Error ? error.message : 'Results could not be loaded.';
    } finally {
      window.clearTimeout(timeout);
      inFlight = false;
      refresh.disabled = false;
    }
  }

  refresh.addEventListener('click', loadResults);
  search.addEventListener('input', renderRows);
  loadResults();
  window.setInterval(loadResults, 60000);
  window.addEventListener('pagehide', () => { body.replaceChildren(); root.hidden = true; });
  window.addEventListener('pageshow', event => { if (event.persisted) window.location.reload(); });
  const lock = document.getElementById('wwQrrLockForm');
  if (lock) lock.addEventListener('submit', async event => {
    event.preventDefault();
    body.replaceChildren(); participants = []; root.hidden = true;
    try {
      await fetch('/qr_results', {method:'POST', credentials:'same-origin', cache:'no-store', headers:{'Content-Type':'application/x-www-form-urlencoded', Accept:'application/json'}, body:'action=lock_results'});
    } finally { window.location.replace('/qr_results'); }
  });
})();
</script>

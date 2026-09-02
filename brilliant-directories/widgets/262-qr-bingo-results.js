<script>
(function () {
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

  function postAction(action, extra) {
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
      cache: 'no-store'
    }).then(async response => {
      const data = await response.json().catch(() => ({}));
      if (response.status === 409 && data.code === 'stale_event_config') {
        window.location.reload();
        throw new Error('Event settings changed. Reloading results.');
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
    const filtered = participants.filter(item => item.label.toLowerCase().includes(term));
    body.replaceChildren();
    tableWrap.hidden = filtered.length === 0;
    empty.hidden = filtered.length !== 0;
    if (participants.length > 0 && filtered.length === 0) {
      empty.querySelector('h2').textContent = 'No participant labels match';
      empty.querySelector('p').textContent = 'Try a different search.';
    } else {
      empty.querySelector('h2').textContent = 'No current-event scans yet';
      empty.querySelector('p').textContent = 'This page will update as couples visit vendors in the published QR Bingo event.';
    }

    filtered.forEach(item => {
      const row = document.createElement('tr');
      const name = document.createElement('span');
      name.className = 'ww-qrr-participant';
      name.textContent = item.label;
      appendCell(row, 'Participant', name);

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
    refresh.disabled = true;
    status.classList.remove('is-error');
    status.textContent = 'Loading current results...';
    try {
      const data = await postAction('get_scoreboard_data');
      participants = Array.isArray(data.participants) ? data.participants : [];
      active.textContent = String(data.active_participants || 0);
      completed.textContent = String(data.completed_participants || 0);
      vendors.textContent = String(data.total_vendors || 0);
      status.textContent = participants.length
        ? `${participants.length} current-event participant${participants.length === 1 ? '' : 's'}`
        : 'No current-event scans have been recorded.';
      updated.textContent = `Last refreshed ${new Date().toLocaleTimeString()}`;
      renderRows();
    } catch (error) {
      status.classList.add('is-error');
      status.textContent = error instanceof Error ? error.message : 'Results could not be loaded.';
    } finally {
      refresh.disabled = false;
    }
  }

  refresh.addEventListener('click', loadResults);
  search.addEventListener('input', renderRows);
  loadResults();
  window.setInterval(loadResults, 60000);
})();
</script>

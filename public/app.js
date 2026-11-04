const state = {
  hosts: [],
  hostId: null,
  snapshot: null,
  rooms: [],
  modules: [],
  view: 'overview',
};

const $ = (selector) => document.querySelector(selector);

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function api(path, options) {
  const response = await fetch(path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `${response.status} ${response.statusText}`);
  return data;
}

function toneFor(health) {
  return health === 'off-hours' ? 'off-hours' : health;
}

function badge(health, label) {
  return `<span class="state-badge ${escapeHtml(toneFor(health))}"><span class="dot ${escapeHtml(toneFor(health))}"></span>${escapeHtml(label)}</span>`;
}

function setBusy(button, busy) {
  if (!button) return;
  button.disabled = busy;
  if (busy) {
    button.dataset.label = button.textContent;
    button.textContent = 'Working...';
  } else if (button.dataset.label) {
    button.textContent = button.dataset.label;
  }
}

async function init() {
  try {
    const hosts = await api('/api/hosts');
    state.hosts = hosts.hosts || [];
    state.hostId = hosts.defaultHost || state.hosts[0]?.id;
    renderHostSelect();
    await loadSnapshot();
    await loadModules();
    await loadAiStatus();
    bindEvents();
  } catch (error) {
    $('#counts').innerHTML = `<div class="error-text">Failed to start: ${escapeHtml(error.message)}</div>`;
  }
}

function renderHostSelect() {
  const select = $('#host-select');
  select.innerHTML = state.hosts
    .map((host) => `<option value="${escapeHtml(host.id)}"${host.id === state.hostId ? ' selected' : ''}>${escapeHtml(host.name)} (${escapeHtml(host.kind)})</option>`)
    .join('');
}

async function loadSnapshot(force = false) {
  const url = `/api/hosts/${encodeURIComponent(state.hostId)}/summary${force ? '?refresh=1' : ''}`;
  const data = await api(url);
  state.snapshot = data.snapshot;
  state.rooms = data.snapshot.spaces || [];
  renderOverview();
  renderRooms();
  renderBuildRooms();
  $('#footer-host').textContent = `${data.host.name} · ${data.host.kind} · ${data.snapshot.source?.build || ''}`;
}

async function loadModules() {
  const data = await api('/api/kb/modules');
  state.modules = data.modules || [];
  renderModules();
}

async function loadAiStatus() {
  try {
    const status = await api('/api/ai/status');
    $('#ai-status').textContent = `AI: ${status.mode}${status.model ? ` · ${status.model}` : ''}`;
  } catch {
    $('#ai-status').textContent = 'AI: offline';
  }
}

function renderOverview() {
  const snapshot = state.snapshot;
  if (!snapshot) return;
  const counts = snapshot.counts || {};
  const cards = [
    ['total', 'Spaces', counts.total],
    ['ok', 'Operational', counts.ok],
    ['warning', 'Attention', counts.warning],
    ['error', 'Faults', counts.error],
    ['off', 'System off', counts.off],
    ['suspended', 'Suspended', counts.suspended],
  ];
  $('#counts').innerHTML = cards
    .map(([tone, label, value]) => `<div class="count-card ${tone}"><div class="num">${Number(value || 0)}</div><div class="label">${label}</div></div>`)
    .join('');
  $('#snapshot-time').textContent = snapshot.generatedAt ? `Updated ${new Date(snapshot.generatedAt).toLocaleTimeString()}` : '';

  const groups = snapshot.groups || [];
  $('#matrix').innerHTML = groups
    .map((group) => {
      const rooms = snapshot.spaces.filter((space) => space.group === group.id);
      return `<div class="matrix-group">
        <h3>${escapeHtml(group.name)}</h3>
        <div class="matrix-rooms">
          ${rooms
            .map(
              (room) => `<button class="room-chip tone-${escapeHtml(toneFor(room.state.health))}" type="button" data-room="${escapeHtml(room.id)}">
                <span class="room-id">${escapeHtml(room.name)}</span>
                <span class="room-state"><span class="dot ${escapeHtml(toneFor(room.state.health))}"></span>${escapeHtml(room.state.healthLabel)}</span>
              </button>`,
            )
            .join('')}
        </div>
      </div>`;
    })
    .join('');

  const alerts = [];
  for (const space of snapshot.spaces) {
    for (const alert of space.state.alerts || []) alerts.push({ ...alert, room: space.name, roomId: space.id });
  }
  alerts.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
  $('#alerts').innerHTML = alerts.length
    ? alerts
        .slice(0, 80)
        .map(
          (alert) => `<div class="alert ${escapeHtml(alert.severity)}">
            <div><strong>${escapeHtml(alert.room)}</strong> · ${escapeHtml(alert.message)}</div>
            <div class="alert-device">${escapeHtml(alert.device)}</div>
          </div>`,
        )
        .join('')
    : '<div class="empty">No current alerts.</div>';
}

function severityRank(severity) {
  return severity === 'error' ? 3 : severity === 'warning' ? 2 : severity === 'info' ? 1 : 0;
}

function renderRooms() {
  const filter = ($('#room-filter')?.value || '').toLowerCase();
  const rooms = state.rooms.filter((room) => {
    if (!filter) return true;
    return `${room.id} ${room.name} ${room.group} ${room.roomType} ${room.healthLabel}`.toLowerCase().includes(filter);
  });
  $('#room-list').innerHTML = rooms.length
    ? rooms
        .map(
          (room) => `<div class="room-row" data-room="${escapeHtml(room.id)}">
            <div class="id">${escapeHtml(room.name)}</div>
            <div class="type">${escapeHtml(room.roomType)}</div>
            <div class="state">${badge(room.health, room.healthLabel)}</div>
            <div class="page">Page ${escapeHtml(room.page ?? '--')}</div>
          </div>`,
        )
        .join('')
    : '<div class="empty">No rooms match.</div>';
}

function renderBuildRooms() {
  const select = $('#build-room');
  if (!select) return;
  select.innerHTML = state.rooms
    .map((room) => `<option value="${escapeHtml(room.id)}">${escapeHtml(room.name)} · ${escapeHtml(room.roomType)}</option>`)
    .join('');
}

async function openRoom(roomId) {
  const detail = $('#room-detail');
  detail.hidden = false;
  detail.innerHTML = '<div class="empty">Loading room...</div>';
  switchView('rooms');
  try {
    const data = await api(`/api/hosts/${encodeURIComponent(state.hostId)}/rooms/${encodeURIComponent(roomId)}`);
    renderRoomDetail(data.room);
    detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    detail.innerHTML = `<div class="error-text">${escapeHtml(error.message)}</div>`;
  }
}

function renderRoomDetail(room) {
  const stateInfo = room.state;
  const projectors = stateInfo.projectors || [];
  const connections = stateInfo.connections || {};
  const pcu = stateInfo.pcu || { bits: [] };
  const alerts = stateInfo.alerts || [];
  $('#room-detail').innerHTML = `
    <div class="panel-head">
      <h2>${escapeHtml(room.name)} · ${badge(stateInfo.health, stateInfo.healthLabel)}</h2>
      <button class="btn ghost" type="button" data-close-detail>Close</button>
    </div>
    <div class="detail-grid">
      <div class="detail-card">
        <h4>Projectors</h4>
        ${
          projectors.length
            ? projectors
                .map(
                  (projector) => `<div class="kv">
                    <dt>Label</dt><dd>${escapeHtml(projector.label)}</dd>
                    <dt>State</dt><dd>${escapeHtml(projector.stateLabel)}</dd>
                    <dt>Model</dt><dd>${escapeHtml(projector.model || '--')}</dd>
                    <dt>Lamp</dt><dd>${escapeHtml(projector.lampHours || '--')} h</dd>
                    <dt>Blank</dt><dd>${escapeHtml(projector.blank?.label || '--')}</dd>
                    <dt>Freeze</dt><dd>${escapeHtml(projector.freeze?.label || '--')}</dd>
                  </div>`,
                )
                .join('<hr>')
            : '<div class="muted">None mapped</div>'
        }
      </div>
      <div class="detail-card">
        <h4>Connections</h4>
        ${
          Object.keys(connections).length
            ? Object.entries(connections)
                .map(
                  ([role, connection]) => `<div class="kv">
                    <dt>${escapeHtml(role.toUpperCase())}</dt>
                    <dd>${escapeHtml(connection.label)} <span class="muted">(${escapeHtml(connection.state)})</span></dd>
                  </div>`,
                )
                .join('')
            : '<div class="muted">None mapped</div>'
        }
      </div>
      <div class="detail-card">
        <h4>PCU bits</h4>
        ${
          pcu.bits?.length
            ? `<div class="pcu-bits">${pcu.bits
                .map((bit) => `<span class="bit ${bit.on ? 'on' : 'off'}">${escapeHtml(bit.label)} ${bit.on ? '1' : '0'}</span>`)
                .join('')}</div>
               <div class="kv" style="margin-top:8px"><dt>Raw</dt><dd>${escapeHtml(pcu.raw || '--')}</dd></div>`
            : '<div class="muted">No PCU data</div>'
        }
      </div>
      <div class="detail-card">
        <h4>Audio / source</h4>
        <div class="kv">
          <dt>Volume</dt><dd>${escapeHtml(stateInfo.volume?.label || '--')}</dd>
          <dt>Source</dt><dd>${escapeHtml(stateInfo.source?.label || '--')}</dd>
          <dt>Room type</dt><dd>${escapeHtml(room.roomType)}</dd>
          <dt>Lifecycle</dt><dd>${escapeHtml(room.lifecycle)}</dd>
        </div>
      </div>
      <div class="detail-card">
        <h4>Alerts</h4>
        ${
          alerts.length
            ? alerts
                .map((alert) => `<div class="alert ${escapeHtml(alert.severity)}"><div>${escapeHtml(alert.message)}</div><div class="alert-device">${escapeHtml(alert.device)}</div></div>`)
                .join('')
            : '<div class="muted">No alerts</div>'
        }
      </div>
    </div>`;
}

function renderModules() {
  $('#module-catalog').innerHTML = state.modules
    .map(
      (module) => `<div class="module-card">
        <div class="name">${escapeHtml(module.name)}</div>
        <div class="id">${escapeHtml(module.id)}</div>
        <div class="cat">${escapeHtml(module.category)} · ${escapeHtml(module.protocol)}</div>
        <div class="notes">${escapeHtml(module.notes || '')}</div>
      </div>`,
    )
    .join('');
}

async function buildPreview() {
  const button = $('#build-btn');
  setBusy(button, true);
  const result = $('#build-result');
  result.innerHTML = '<div class="empty">Generating...</div>';
  try {
    const body = {
      hostId: state.hostId,
      roomId: $('#build-room').value,
      schema: Number($('#build-schema').value),
      page: Number($('#build-page').value || 1),
    };
    const data = await api('/api/build/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const validation = data.validation;
    const warnings = [...(data.warnings || []), ...(validation.warnings || [])];
    const json = JSON.stringify(data.config, null, 2);
    result.innerHTML = `
      <div class="build-meta">
        <span class="tag">Room ${escapeHtml(data.room.id)}</span>
        <span class="tag">${escapeHtml(data.archetype.label)}</span>
        <span class="tag">Schema ${escapeHtml(data.meta.schema)}</span>
        <span class="tag">${escapeHtml(data.meta.styleMode)}</span>
        <span class="tag">${escapeHtml(data.meta.instances)} connections</span>
        <span class="tag">${escapeHtml(data.meta.buttons)} buttons</span>
        <span class="tag">${escapeHtml(data.meta.customVariables)} variables</span>
      </div>
      <div class="validation ${validation.ok ? 'ok' : 'bad'}">
        <strong>${validation.ok ? 'Valid configuration' : 'Validation failed'}</strong>
        ${validation.errors.length ? `<ul>${validation.errors.map((error) => `<li>${escapeHtml(error)}</li>`).join('')}</ul>` : ''}
        ${warnings.length ? `<div class="muted" style="margin-top:6px">Warnings</div><ul>${warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>` : ''}
      </div>
      ${
        data.diff
          ? `<div class="validation"><strong>Diff vs live export</strong><div class="muted" style="margin-top:6px">${escapeHtml(data.diff.summary)}</div>
              ${data.diff.instances.added.length ? `<div class="muted" style="margin-top:6px">Added: ${escapeHtml(data.diff.instances.added.join(', '))}</div>` : ''}
              ${data.diff.instances.removed.length ? `<div class="muted" style="margin-top:6px">Removed: ${escapeHtml(data.diff.instances.removed.join(', '))}</div>` : ''}
            </div>`
          : ''
      }
      <div class="form-row">
        <button id="download-config" class="btn primary" type="button">Download .companionconfig</button>
      </div>
      <pre class="code">${escapeHtml(json)}</pre>`;
    $('#download-config').addEventListener('click', () => downloadConfig(data.config, data.room.id));
  } catch (error) {
    result.innerHTML = `<div class="error-text">${escapeHtml(error.message)}</div>`;
  } finally {
    setBusy(button, false);
  }
}

function downloadConfig(config, roomId) {
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${roomId}-generated.companionconfig`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function searchKb() {
  const query = $('#kb-query').value.trim();
  if (!query) return;
  const result = $('#kb-results');
  result.innerHTML = '<div class="empty">Searching...</div>';
  try {
    const data = await api(`/api/kb/search?q=${encodeURIComponent(query)}&limit=10`);
    result.innerHTML = data.results.length
      ? data.results
          .map(
            (entry) => `<div class="kb-result">
              <div class="title">${escapeHtml(entry.title)}</div>
              <div class="snippet">${escapeHtml(entry.snippet)}</div>
              <div class="meta">${escapeHtml(entry.type)} · ${escapeHtml(entry.id)}${entry.source ? ` · ${escapeHtml(entry.source)}` : ''}</div>
            </div>`,
          )
          .join('')
      : '<div class="empty">No matches.</div>';
  } catch (error) {
    result.innerHTML = `<div class="error-text">${escapeHtml(error.message)}</div>`;
  }
}

async function askAi() {
  const question = $('#ai-question').value.trim();
  if (!question) return;
  const button = $('#ai-btn');
  const answer = $('#ai-answer');
  setBusy(button, true);
  answer.textContent = 'Thinking...';
  try {
    const data = await api('/api/ai/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, hostId: state.hostId }),
    });
    answer.innerHTML = `${escapeHtml(data.answer)}
      ${data.warning ? `<div class="warning">${escapeHtml(data.warning)}</div>` : ''}
      ${data.citations?.length ? `<div class="citations">${data.citations.map((citation) => `<span class="tag">${escapeHtml(citation.title)}</span>`).join('')}</div>` : ''}
      <div class="meta muted" style="margin-top:10px;font-size:11px">Mode: ${escapeHtml(data.mode)}${data.model ? ` · ${escapeHtml(data.model)}` : ''}</div>`;
  } catch (error) {
    answer.innerHTML = `<div class="error-text">${escapeHtml(error.message)}</div>`;
  } finally {
    setBusy(button, false);
  }
}

function switchView(name) {
  state.view = name;
  for (const tab of document.querySelectorAll('.tab')) tab.classList.toggle('active', tab.dataset.view === name);
  for (const view of document.querySelectorAll('.view')) view.classList.toggle('active', view.id === `view-${name}`);
}

function bindEvents() {
  $('#host-select').addEventListener('change', async (event) => {
    state.hostId = event.target.value;
    $('#room-detail').hidden = true;
    await loadSnapshot();
  });

  $('#refresh-btn').addEventListener('click', async () => {
    setBusy($('#refresh-btn'), true);
    try {
      await loadSnapshot(true);
    } finally {
      setBusy($('#refresh-btn'), false);
    }
  });

  for (const tab of document.querySelectorAll('.tab')) {
    tab.addEventListener('click', () => switchView(tab.dataset.view));
  }

  document.addEventListener('click', (event) => {
    const roomTarget = event.target.closest('[data-room]');
    if (roomTarget) openRoom(roomTarget.dataset.room);
    if (event.target.closest('[data-close-detail]')) $('#room-detail').hidden = true;
  });

  $('#room-filter').addEventListener('input', renderRooms);
  $('#build-btn').addEventListener('click', buildPreview);
  $('#kb-btn').addEventListener('click', searchKb);
  $('#kb-query').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') searchKb();
  });
  $('#ai-btn').addEventListener('click', askAi);
  $('#ai-question').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') askAi();
  });
}

init();

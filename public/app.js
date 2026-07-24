(function () {
  'use strict';

  var screens = { login: document.getElementById('screen-login'), dashboard: document.getElementById('screen-dashboard') };

  function showScreen(name) {
    Object.values(screens).forEach(function (el) { el.classList.remove('active'); });
    screens[name].classList.add('active');
  }

  function escapeHtml(str) { var div = document.createElement('div'); div.textContent = str; return div.innerHTML; }

  function showError(msg) {
    var el = document.getElementById('login-error');
    el.hidden = false;
    el.textContent = msg;
  }

  function hideError() { var el = document.getElementById('login-error'); el.hidden = true; el.textContent = ''; }

  function setLoginLoading(loading) {
    var btn = document.getElementById('btn-login');
    btn.disabled = loading;
    btn.textContent = loading ? 'Signing in...' : 'Sign In';
  }

  function setVal(id, val) { document.getElementById(id).textContent = val != null ? String(val) : '—'; }

  function statusClass(status) {
    var s = (status || '').toUpperCase();
    if (s === 'PLANNED') return 'status-planned';
    if (s === 'STAGED') return 'status-staged';
    if (s === 'SHIPPED') return 'status-shipped';
    if (s.includes('COMMIT FAILED') || s.includes('FAILED')) return 'status-failed';
    if (s === 'PICKING') return 'status-picking';
    if (s === 'LOADED') return 'status-loaded';
    return 'status-planned';
  }

  function renderDnTable(rows, containerId) {
    var el = document.getElementById(containerId);
    if (!rows || rows.length === 0) { el.innerHTML = '<p style="color:var(--text-muted);padding:1rem;text-align:center;">No records</p>'; el.hidden = false; return; }
    var html = '<table><thead><tr><th>DN#</th><th>Status</th><th>Carrier</th><th>Load #</th><th>Appt</th><th>Door</th></tr></thead><tbody>';
    rows.forEach(function (r) {
      var dnCell = r.dn ? '<a class="dn-link" href="https://unis.item.com/wms/outbound/order/view/' + escapeHtml(r.dn.replace('DN-', '')) + '" target="_blank" rel="noopener">' + escapeHtml(r.dn) + '</a>' : '—';
      html += '<tr><td>' + dnCell + '</td><td><span class="status-badge ' + statusClass(r.status) + '">' + escapeHtml(r.status || '—') + '</span></td><td>' + escapeHtml(r.carrier || '—') + '</td><td>' + escapeHtml(r.loadNo || '—') + '</td><td>' + escapeHtml(r.appointmentTime || '—') + '</td><td>' + escapeHtml(r.door || '—') + '</td></tr>';
    });
    html += '</tbody></table>';
    el.innerHTML = html;
    el.hidden = false;
  }

  function renderPoTable(rows, containerId) {
    var el = document.getElementById(containerId);
    if (!rows || rows.length === 0) { el.innerHTML = '<p style="color:var(--text-muted);padding:1rem;text-align:center;">No records</p>'; el.hidden = false; return; }
    var html = '<table><thead><tr><th>PO</th><th>Status</th><th>Carrier</th><th>RN</th><th>Door</th><th>Appt/Arrival</th></tr></thead><tbody>';
    rows.forEach(function (r) {
      html += '<tr><td class="dn-link">' + escapeHtml(r.po || '—') + '</td><td>' + escapeHtml(r.status || '—') + '</td><td>' + escapeHtml(r.carrier || '—') + '</td><td>' + escapeHtml(r.rn || '—') + '</td><td>' + escapeHtml(r.door || '—') + '</td><td>' + escapeHtml(r.appointmentTime || '—') + (r.arrivalTime ? ' / ' + escapeHtml(r.arrivalTime) : '') + '</td></tr>';
    });
    html += '</tbody></table>';
    el.innerHTML = html;
    el.hidden = false;
  }

  function renderYardTable(rows, containerId, title) {
    var el = document.getElementById(containerId);
    if (!rows || rows.length === 0) { el.innerHTML = '<p style="color:var(--text-muted);padding:1rem;text-align:center;">No records</p>'; el.hidden = false; return; }
    var html = '<p style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.5rem;">' + escapeHtml(title) + ' (' + rows.length + ')</p>';
    html += '<table><thead><tr><th>Carrier</th><th>RN</th><th>Trailer</th><th>Reference</th><th>Date</th></tr></thead><tbody>';
    rows.forEach(function (r) {
      html += '<tr><td>' + escapeHtml(r.carrier || '—') + '</td><td>' + escapeHtml(r.rn || '—') + '</td><td>' + escapeHtml(r.trailer || '—') + '</td><td>' + escapeHtml(r.reference || '—') + '</td><td>' + escapeHtml(r.date || '—') + '</td></tr>';
    });
    html += '</tbody></table>';
    el.innerHTML = html;
    el.hidden = false;
  }

  function renderOrderTable(orders, containerId, statusLabel) {
    var el = document.getElementById(containerId);
    if (!orders || orders.length === 0) { el.innerHTML = '<p style="color:var(--text-muted);padding:1rem;text-align:center;">No ' + escapeHtml(statusLabel) + ' orders</p>'; el.hidden = false; return; }
    var html = '<table><thead><tr><th>DN</th><th>Load ID</th><th>Status</th><th>Load #</th><th>Created</th></tr></thead><tbody>';
    orders.forEach(function (o) {
      var dnVal = o.dn || o.id || '—';
      var dnCell = o.id ? '<a class="dn-link" href="https://unis.item.com/wms/outbound/order/view/' + escapeHtml(o.id) + '" target="_blank" rel="noopener">' + escapeHtml(dnVal) + '</a>' : escapeHtml(dnVal);
      var created = o.createdTime ? new Date(o.createdTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
      html += '<tr><td>' + dnCell + '</td><td>' + escapeHtml(o.loadId || '—') + '</td><td><span class="status-badge ' + statusClass(o.status) + '">' + escapeHtml(o.status || statusLabel) + '</span></td><td>' + escapeHtml(o.loadNo || '—') + '</td><td>' + escapeHtml(created) + '</td></tr>';
    });
    html += '</tbody></table>';
    el.innerHTML = html;
    el.hidden = false;
  }

  function renderReceiptTable(receipts, containerId, statusLabel) {
    var el = document.getElementById(containerId);
    if (!receipts || receipts.length === 0) { el.innerHTML = '<p style="color:var(--text-muted);padding:1rem;text-align:center;">No ' + escapeHtml(statusLabel) + ' receipts</p>'; el.hidden = false; return; }
    var html = '<table><thead><tr><th>Receipt ID</th><th>PO</th><th>Reference</th><th>Status</th><th>Appointment</th></tr></thead><tbody>';
    receipts.forEach(function (r) {
      var idCell = r.id ? '<a class="dn-link" href="https://unis.item.com/wms/inbound/receipt/view/' + escapeHtml(r.id) + '" target="_blank" rel="noopener">' + escapeHtml(r.id) + '</a>' : '—';
      var appt = r.appointmentTime ? new Date(r.appointmentTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
      html += '<tr><td>' + idCell + '</td><td>' + escapeHtml(r.poNo || '—') + '</td><td>' + escapeHtml(r.referenceNo || '—') + '</td><td><span class="status-badge ' + statusClass(r.status) + '">' + escapeHtml(r.status || statusLabel) + '</span></td><td>' + escapeHtml(appt) + '</td></tr>';
    });
    html += '</tbody></table>';
    el.innerHTML = html;
    el.hidden = false;
  }

  function renderMetricsGrid(containerId, metrics, clickHandler) {
    var el = document.getElementById(containerId);
    if (!metrics || metrics.length === 0) {
      el.innerHTML = '<div class="metrics-placeholder">Unable to load metrics</div>';
      return;
    }
    var chevronSvg = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 4.5l3 3 3-3"/></svg>';
    var html = '';
    metrics.forEach(function (m) {
      html += '<div class="grid-metric clickable" data-status="' + escapeHtml(m.status) + '">'
        + '<div class="grid-metric-label">' + escapeHtml(m.label) + '</div>'
        + '<div class="grid-metric-value">' + (m.count != null ? m.count : '—') + '</div>'
        + '<div class="grid-metric-hint">' + chevronSvg + ' View details</div>'
        + '</div>';
    });
    el.innerHTML = html;
    if (clickHandler) {
      el.querySelectorAll('.grid-metric.clickable').forEach(function (card) {
        card.addEventListener('click', function () { clickHandler(card.dataset.status, card); });
      });
    }
  }

  function updateTimestamp() {
    document.getElementById('last-updated').textContent = 'Updated ' + new Date().toLocaleTimeString();
  }

  // Data state
  var outboundData = null;
  var inboundData = null;
  var yardData = null;
  var partialShippedData = [];
  var commitFailedData = [];

  async function fetchAll() {
    updateTimestamp();
    // Hide all detail panels on refresh
    ['partial-shipped-detail', 'commit-failed-detail', 'yard-detail', 'outbound-detail', 'inbound-detail', 'outbound-metrics-detail', 'inbound-metrics-detail'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.hidden = true;
    });

    var [yardRes, outboundRes, inboundRes] = await Promise.allSettled([
      fetch('/api/summary/yard').then(function (r) { return r.json(); }),
      fetch('/api/summary/outbound-schedule').then(function (r) { return r.json(); }),
      fetch('/api/summary/inbound-schedule').then(function (r) { return r.json(); }),
    ]);

    if (yardRes.status === 'fulfilled' && !yardRes.value.error) {
      yardData = yardRes.value;
      setVal('val-in-yard', yardData.inYardCount);
      setVal('val-no-rn', yardData.noRnCount);
      setVal('val-staged', yardData.stagedCount);
    }

    if (outboundRes.status === 'fulfilled' && !outboundRes.value.error) {
      outboundData = outboundRes.value;
      setVal('val-outbound-lives', outboundData.outboundLivesCount);
      setVal('val-preloads', outboundData.preloadsCount);
      setVal('val-shipped-live', outboundData.shippedLiveCount);
      setVal('val-shipped-preload', outboundData.shippedPreloadCount);
    }

    if (inboundRes.status === 'fulfilled' && !inboundRes.value.error) {
      inboundData = inboundRes.value;
      setVal('val-inbound-live', inboundData.liveCount);
      setVal('val-inbound-drop', inboundData.dropCount);
    }

    // Auth-required WMS metrics
    var [outMetrics, inMetrics, partialRes, commitRes] = await Promise.allSettled([
      fetch('/api/summary/outbound-metrics').then(function (r) { if (r.status === 401) throw new Error('auth'); return r.json(); }),
      fetch('/api/summary/inbound-metrics').then(function (r) { if (r.status === 401) throw new Error('auth'); return r.json(); }),
      fetch('/api/summary/partial-shipped').then(function (r) { if (r.status === 401) throw new Error('auth'); return r.json(); }),
      fetch('/api/summary/commit-failed').then(function (r) { if (r.status === 401) throw new Error('auth'); return r.json(); }),
    ]);

    if (outMetrics.status === 'fulfilled' && outMetrics.value.metrics) {
      renderMetricsGrid('outbound-metrics-grid', outMetrics.value.metrics, handleOutboundMetricClick);
      if (outMetrics.value.date) {
        document.getElementById('outbound-metrics-sub').textContent = 'Orders created today, ' + outMetrics.value.date;
      }
    } else {
      document.getElementById('outbound-metrics-grid').innerHTML = '<div class="metrics-placeholder">Sign in to view outbound metrics</div>';
    }

    if (inMetrics.status === 'fulfilled' && inMetrics.value.metrics) {
      renderMetricsGrid('inbound-metrics-grid', inMetrics.value.metrics, handleInboundMetricClick);
    } else {
      document.getElementById('inbound-metrics-grid').innerHTML = '<div class="metrics-placeholder">Sign in to view inbound metrics</div>';
    }

    if (partialRes.status === 'fulfilled' && partialRes.value.totalCount != null) {
      setVal('val-partial-shipped', partialRes.value.totalCount);
      partialShippedData = partialRes.value.orders || [];
    }

    if (commitRes.status === 'fulfilled' && commitRes.value.totalCount != null) {
      setVal('val-commit-failed', commitRes.value.totalCount);
      commitFailedData = commitRes.value.orders || [];
    }
  }

  // --- Click handlers for top metric cards ---
  var topDetailVisible = null;

  function toggleTopDetail(key, renderFn) {
    var panels = ['partial-shipped-detail', 'commit-failed-detail', 'yard-detail'];
    if (topDetailVisible === key) {
      panels.forEach(function (id) { document.getElementById(id).hidden = true; });
      topDetailVisible = null;
    } else {
      panels.forEach(function (id) { document.getElementById(id).hidden = true; });
      renderFn();
      topDetailVisible = key;
    }
  }

  document.getElementById('card-partial-shipped').addEventListener('click', function () {
    toggleTopDetail('partial', function () {
      renderOrderTable(partialShippedData, 'partial-shipped-detail', 'PARTIAL SHIPPED');
    });
  });

  document.getElementById('card-commit-failed').addEventListener('click', function () {
    toggleTopDetail('commit', function () {
      renderOrderTable(commitFailedData, 'commit-failed-detail', 'COMMIT FAILED');
    });
  });

  document.getElementById('card-in-yard').addEventListener('click', function () {
    toggleTopDetail('yard', function () {
      renderYardTable(yardData ? yardData.inYardRows : [], 'yard-detail', 'Loads in Yard');
    });
  });

  document.getElementById('card-no-rn').addEventListener('click', function () {
    toggleTopDetail('norn', function () {
      renderYardTable(yardData ? yardData.noRnRows : [], 'yard-detail', 'No RN');
    });
  });

  document.getElementById('card-staged').addEventListener('click', function () {
    toggleTopDetail('staged', function () {
      renderYardTable(yardData ? yardData.stagedRows : [], 'yard-detail', 'Staged');
    });
  });

  // --- Outbound schedule card toggles ---
  var outboundDetailVisible = null;
  function toggleOutbound(key, rows) {
    var el = document.getElementById('outbound-detail');
    if (outboundDetailVisible === key) { el.hidden = true; outboundDetailVisible = null; return; }
    renderDnTable(rows, 'outbound-detail');
    outboundDetailVisible = key;
  }

  document.getElementById('card-outbound-lives').addEventListener('click', function () {
    toggleOutbound('lives', outboundData ? outboundData.liveRows : []);
  });
  document.getElementById('card-preloads').addEventListener('click', function () {
    toggleOutbound('preloads', outboundData ? outboundData.preloadRows : []);
  });
  document.getElementById('card-shipped-live').addEventListener('click', function () {
    toggleOutbound('shipped', outboundData ? outboundData.shippedLiveRows : []);
  });
  document.getElementById('card-shipped-preload').addEventListener('click', function () {
    toggleOutbound('shippedPre', outboundData ? outboundData.shippedPreloadRows : []);
  });

  // --- Inbound schedule card toggles ---
  var inboundDetailVisible = null;
  function toggleInbound(key, rows) {
    var el = document.getElementById('inbound-detail');
    if (inboundDetailVisible === key) { el.hidden = true; inboundDetailVisible = null; return; }
    renderPoTable(rows, 'inbound-detail');
    inboundDetailVisible = key;
  }

  document.getElementById('card-inbound-live').addEventListener('click', function () {
    toggleInbound('live', inboundData ? inboundData.livePoRows : []);
  });
  document.getElementById('card-inbound-drop').addEventListener('click', function () {
    toggleInbound('drop', inboundData ? inboundData.dropPoRows : []);
  });

  // --- WMS Outbound Metric grid cell clicks ---
  var outboundMetricDetailStatus = null;
  async function handleOutboundMetricClick(status, card) {
    var el = document.getElementById('outbound-metrics-detail');
    var grid = document.getElementById('outbound-metrics-grid');

    // Clear active state from all cells in this grid
    grid.querySelectorAll('.grid-metric.active').forEach(function (c) { c.classList.remove('active'); });

    if (outboundMetricDetailStatus === status) { el.hidden = true; outboundMetricDetailStatus = null; return; }

    card.classList.add('active');
    el.innerHTML = '<p style="color:var(--text-muted);padding:1rem;text-align:center;">Loading...</p>';
    el.hidden = false;
    outboundMetricDetailStatus = status;
    try {
      var res = await fetch('/api/summary/outbound-orders/' + encodeURIComponent(status));
      if (res.status === 401) { el.innerHTML = '<p style="color:var(--text-muted);padding:1rem;text-align:center;">Sign in to view details</p>'; return; }
      var data = await res.json();
      if (data.error) { el.innerHTML = '<p style="color:var(--text-muted);padding:1rem;text-align:center;">Details unavailable</p>'; return; }
      var totalCount = data.totalCount || 0;
      var orders = data.orders || [];
      var limitNote = totalCount > orders.length ? '<div class="detail-limit-note">Showing first ' + orders.length + ' of ' + totalCount + '</div>' : '';
      var headerHtml = '<div class="detail-header"><span class="detail-header-title">' + escapeHtml(status.replace(/_/g, ' ')) + ' Orders</span><span class="detail-header-count">' + totalCount + ' total</span></div>';
      renderOrderTable(orders, 'outbound-metrics-detail', status);
      el.innerHTML = headerHtml + el.innerHTML + limitNote;
    } catch (e) {
      el.innerHTML = '<p style="color:var(--text-muted);padding:1rem;text-align:center;">Details unavailable</p>';
    }
  }

  // --- WMS Inbound Metric grid cell clicks ---
  var inboundMetricDetailStatus = null;
  async function handleInboundMetricClick(status, card) {
    var el = document.getElementById('inbound-metrics-detail');
    var grid = document.getElementById('inbound-metrics-grid');

    // Clear active state from all cells in this grid
    grid.querySelectorAll('.grid-metric.active').forEach(function (c) { c.classList.remove('active'); });

    if (inboundMetricDetailStatus === status) { el.hidden = true; inboundMetricDetailStatus = null; return; }

    card.classList.add('active');
    el.innerHTML = '<p style="color:var(--text-muted);padding:1rem;text-align:center;">Loading...</p>';
    el.hidden = false;
    inboundMetricDetailStatus = status;
    try {
      var res = await fetch('/api/summary/inbound-receipts/' + encodeURIComponent(status));
      if (res.status === 401) { el.innerHTML = '<p style="color:var(--text-muted);padding:1rem;text-align:center;">Sign in to view details</p>'; return; }
      var data = await res.json();
      if (data.error) { el.innerHTML = '<p style="color:var(--text-muted);padding:1rem;text-align:center;">Details unavailable</p>'; return; }
      var totalCount = data.totalCount || 0;
      var receipts = data.receipts || [];
      var limitNote = totalCount > receipts.length ? '<div class="detail-limit-note">Showing first ' + receipts.length + ' of ' + totalCount + '</div>' : '';
      var headerHtml = '<div class="detail-header"><span class="detail-header-title">' + escapeHtml(status.replace(/_/g, ' ')) + ' Receipts</span><span class="detail-header-count">' + totalCount + ' total</span></div>';
      renderReceiptTable(receipts, 'inbound-metrics-detail', status);
      el.innerHTML = headerHtml + el.innerHTML + limitNote;
    } catch (e) {
      el.innerHTML = '<p style="color:var(--text-muted);padding:1rem;text-align:center;">Details unavailable</p>';
    }
  }

  // Init dashboard
  function initDashboard(session) {
    document.getElementById('user-display').textContent = session.username || 'Signed in';
    document.getElementById('date-badge').textContent = 'Today, ' + new Date().toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', month: '2-digit', day: '2-digit', year: 'numeric' });
    fetchAll();
  }

  // Refresh
  document.getElementById('btn-refresh').addEventListener('click', function () {
    topDetailVisible = null;
    outboundDetailVisible = null;
    inboundDetailVisible = null;
    outboundMetricDetailStatus = null;
    inboundMetricDetailStatus = null;
    // Clear active states on metric grids
    document.querySelectorAll('.grid-metric.active').forEach(function (c) { c.classList.remove('active'); });
    fetchAll();
  });

  // Check session on load
  async function checkSession() {
    try {
      var res = await fetch('/api/auth/me');
      if (res.ok) {
        var data = await res.json();
        showScreen('dashboard');
        initDashboard(data);
        return;
      }
    } catch (e) {}
    showScreen('login');
  }

  // Login
  document.getElementById('login-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    hideError();
    var username = document.getElementById('input-username').value.trim();
    var password = document.getElementById('input-password').value;
    if (!username || !password) { showError('Please enter username and password'); return; }

    setLoginLoading(true);
    try {
      var res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username, password: password }),
      });
      if (!res.ok) {
        var errData = await res.json().catch(function () { return {}; });
        showError(errData.error || 'Sign-in failed');
        return;
      }
      var data = await res.json();
      document.getElementById('input-password').value = '';
      showScreen('dashboard');
      initDashboard(data);
    } catch (err) {
      showError('Connection error. Please try again.');
    } finally {
      setLoginLoading(false);
    }
  });

  // Logout
  document.getElementById('btn-logout').addEventListener('click', async function () {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (e) {}
    showScreen('login');
  });

  checkSession();
})();

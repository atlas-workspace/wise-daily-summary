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
    if (!rows || rows.length === 0) { el.hidden = true; return; }
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
    if (!rows || rows.length === 0) { el.hidden = true; return; }
    var html = '<table><thead><tr><th>PO</th><th>Status</th><th>Carrier</th><th>RN</th><th>Door</th><th>Appt/Arrival</th></tr></thead><tbody>';
    rows.forEach(function (r) {
      html += '<tr><td class="dn-link">' + escapeHtml(r.po || '—') + '</td><td>' + escapeHtml(r.status || '—') + '</td><td>' + escapeHtml(r.carrier || '—') + '</td><td>' + escapeHtml(r.rn || '—') + '</td><td>' + escapeHtml(r.door || '—') + '</td><td>' + escapeHtml(r.appointmentTime || '—') + (r.arrivalTime ? ' / ' + escapeHtml(r.arrivalTime) : '') + '</td></tr>';
    });
    html += '</tbody></table>';
    el.innerHTML = html;
    el.hidden = false;
  }

  function renderMetricsGrid(containerId, metrics) {
    var el = document.getElementById(containerId);
    if (!metrics || metrics.length === 0) {
      el.innerHTML = '<div class="metrics-placeholder">Unable to load metrics</div>';
      return;
    }
    var html = '';
    metrics.forEach(function (m) {
      html += '<div class="grid-metric"><div class="grid-metric-label">' + escapeHtml(m.label) + '</div><div class="grid-metric-value">' + (m.count != null ? m.count : '—') + '</div></div>';
    });
    el.innerHTML = html;
  }

  function updateTimestamp() {
    document.getElementById('last-updated').textContent = 'Updated ' + new Date().toLocaleTimeString();
  }

  // Data fetching
  var outboundData = null;
  var inboundData = null;

  async function fetchAll() {
    updateTimestamp();
    // Sheet-based (no auth)
    var [yardRes, outboundRes, inboundRes] = await Promise.allSettled([
      fetch('/api/summary/yard').then(r => r.json()),
      fetch('/api/summary/outbound-schedule').then(r => r.json()),
      fetch('/api/summary/inbound-schedule').then(r => r.json()),
    ]);

    if (yardRes.status === 'fulfilled' && !yardRes.value.error) {
      var y = yardRes.value;
      setVal('val-in-yard', y.inYardCount);
      setVal('val-no-rn', y.noRnCount);
      setVal('val-staged', y.stagedCount);
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
    var [outMetrics, inMetrics, partialRes] = await Promise.allSettled([
      fetch('/api/summary/outbound-metrics').then(r => { if (r.status === 401) throw new Error('auth'); return r.json(); }),
      fetch('/api/summary/inbound-metrics').then(r => { if (r.status === 401) throw new Error('auth'); return r.json(); }),
      fetch('/api/summary/partial-shipped').then(r => { if (r.status === 401) throw new Error('auth'); return r.json(); }),
    ]);

    if (outMetrics.status === 'fulfilled' && outMetrics.value.metrics) {
      renderMetricsGrid('outbound-metrics-grid', outMetrics.value.metrics);
      if (outMetrics.value.date) {
        document.getElementById('outbound-metrics-sub').textContent = 'Orders created today, ' + outMetrics.value.date;
      }
      var planned = outMetrics.value.metrics.find(m => m.status === 'PARTIAL_SHIPPED');
      var commitFailed = outMetrics.value.metrics.find(m => m.status === 'COMMIT_FAILED');
      if (planned) setVal('val-partial-shipped', planned.count);
      if (commitFailed) setVal('val-commit-failed', commitFailed.count);
    } else {
      document.getElementById('outbound-metrics-grid').innerHTML = '<div class="metrics-placeholder">Sign in to view outbound metrics</div>';
    }

    if (inMetrics.status === 'fulfilled' && inMetrics.value.metrics) {
      renderMetricsGrid('inbound-metrics-grid', inMetrics.value.metrics);
    } else {
      document.getElementById('inbound-metrics-grid').innerHTML = '<div class="metrics-placeholder">Sign in to view inbound metrics</div>';
    }

    if (partialRes.status === 'fulfilled' && partialRes.value.totalCount != null) {
      setVal('val-partial-shipped', partialRes.value.totalCount);
    }
  }

  // Toggle detail tables
  var outboundDetailVisible = null;
  document.getElementById('card-outbound-lives').addEventListener('click', function () {
    if (outboundDetailVisible === 'lives') { document.getElementById('outbound-detail').hidden = true; outboundDetailVisible = null; return; }
    if (outboundData) renderDnTable(outboundData.liveRows, 'outbound-detail');
    outboundDetailVisible = 'lives';
  });
  document.getElementById('card-preloads').addEventListener('click', function () {
    if (outboundDetailVisible === 'preloads') { document.getElementById('outbound-detail').hidden = true; outboundDetailVisible = null; return; }
    if (outboundData) renderDnTable(outboundData.preloadRows, 'outbound-detail');
    outboundDetailVisible = 'preloads';
  });
  document.getElementById('card-shipped-live').addEventListener('click', function () {
    if (outboundDetailVisible === 'shipped') { document.getElementById('outbound-detail').hidden = true; outboundDetailVisible = null; return; }
    if (outboundData) renderDnTable(outboundData.shippedLiveRows, 'outbound-detail');
    outboundDetailVisible = 'shipped';
  });
  document.getElementById('card-shipped-preload').addEventListener('click', function () {
    if (outboundDetailVisible === 'shippedPre') { document.getElementById('outbound-detail').hidden = true; outboundDetailVisible = null; return; }
    if (outboundData) renderDnTable(outboundData.shippedPreloadRows, 'outbound-detail');
    outboundDetailVisible = 'shippedPre';
  });

  var inboundDetailVisible = null;
  document.getElementById('card-inbound-live').addEventListener('click', function () {
    if (inboundDetailVisible === 'live') { document.getElementById('inbound-detail').hidden = true; inboundDetailVisible = null; return; }
    if (inboundData) renderPoTable(inboundData.livePoRows, 'inbound-detail');
    inboundDetailVisible = 'live';
  });
  document.getElementById('card-inbound-drop').addEventListener('click', function () {
    if (inboundDetailVisible === 'drop') { document.getElementById('inbound-detail').hidden = true; inboundDetailVisible = null; return; }
    if (inboundData) renderPoTable(inboundData.dropPoRows, 'inbound-detail');
    inboundDetailVisible = 'drop';
  });

  // Init dashboard
  function initDashboard(session) {
    document.getElementById('user-display').textContent = session.username || 'Signed in';
    document.getElementById('date-badge').textContent = 'Today, ' + new Date().toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', month: '2-digit', day: '2-digit', year: 'numeric' });
    fetchAll();
  }

  // Refresh
  document.getElementById('btn-refresh').addEventListener('click', fetchAll);

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

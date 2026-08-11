(function () {
  'use strict';

  var AUTO_REFRESH_INTERVAL_MS = 60000;
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

  function renderInboundStagedTable(rows, containerId) {
    var el = document.getElementById(containerId);
    if (!rows || rows.length === 0) { el.innerHTML = '<p style="color:var(--text-muted);padding:1rem;text-align:center;">No inbound staged records</p>'; el.hidden = false; return; }
    var html = '<p style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.5rem;">Inbound Staged (' + rows.length + ')</p>';
    html += '<table><thead><tr><th>PO / Reference</th><th>Status</th><th>Carrier</th><th>RN</th><th>Door</th><th>Date</th><th>Notes</th></tr></thead><tbody>';
    rows.forEach(function (r) {
      html += '<tr><td>' + escapeHtml(r.reference || '—') + '</td><td><span class="status-badge ' + statusClass(r.status) + '">' + escapeHtml(r.status || 'STAGED') + '</span></td><td>' + escapeHtml(r.carrier || '—') + '</td><td>' + escapeHtml(r.rn || '—') + '</td><td>' + escapeHtml(r.door || '—') + '</td><td>' + escapeHtml(r.date || '—') + '</td><td>' + escapeHtml(r.notes || '—') + '</td></tr>';
    });
    html += '</tbody></table>';
    el.innerHTML = html;
    el.hidden = false;
  }

  function renderYardUnavailable(containerId) {
    var el = document.getElementById(containerId);
    el.innerHTML = '<p style="color:var(--text-muted);padding:1rem;text-align:center;">Yard tracker is temporarily unavailable. The dashboard will retry automatically.</p>';
    el.hidden = false;
  }

  function setYardAvailability(available) {
    document.getElementById('sub-in-yard').textContent = available ? 'Drops in yard · click for details' : 'Yard tracker unavailable · retrying automatically';
    document.getElementById('sub-no-rn').textContent = available ? 'Missing receipt number · click for details' : 'Yard tracker unavailable · retrying automatically';
    document.getElementById('sub-staged').textContent = available ? 'Inbound staged · click for details' : 'Yard tracker unavailable · retrying automatically';
  }

  function renderYardDetail(rows, title, inboundStaged) {
    if (yardData && yardData.error) {
      renderYardUnavailable('yard-detail');
    } else if (inboundStaged) {
      renderInboundStagedTable(rows, 'yard-detail');
    } else {
      renderYardTable(rows, 'yard-detail', title);
    }
  }

  function renderOrderTable(orders, containerId, statusLabel) {
    var el = document.getElementById(containerId);
    if (!orders || orders.length === 0) { el.innerHTML = '<p style="color:var(--text-muted);padding:1rem;text-align:center;">No ' + escapeHtml(statusLabel) + ' orders</p>'; el.hidden = false; return; }
    var html = '<table><thead><tr><th>DN Number</th><th>Status</th><th>Load #</th><th>Created</th></tr></thead><tbody>';
    orders.forEach(function (o) {
      var dnVal = o.dn || o.id || '—';
      var dnCell = o.id ? '<a class="dn-link" href="https://unis.item.com/wms/outbound/order/view/' + escapeHtml(o.id) + '" target="_blank" rel="noopener">' + escapeHtml(dnVal) + '</a>' : escapeHtml(dnVal);
      var created = o.createdTime ? new Date(o.createdTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
      html += '<tr><td>' + dnCell + '</td><td><span class="status-badge ' + statusClass(o.status) + '">' + escapeHtml(o.status || statusLabel) + '</span></td><td>' + escapeHtml(o.loadNo || '—') + '</td><td>' + escapeHtml(created) + '</td></tr>';
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

  function renderYesterdayNoRnTable(rows, containerId, dateLabel) {
    var el = document.getElementById(containerId);
    if (!rows || rows.length === 0) { el.innerHTML = '<p style="color:var(--text-muted);padding:1rem;text-align:center;">No No-RN arrivals for ' + escapeHtml(dateLabel || 'the previous day') + '</p>'; el.hidden = false; return; }
    var html = '<div class="detail-header"><span class="detail-header-title">No RN Arrived ' + escapeHtml(dateLabel || '') + '</span><span class="detail-header-count">' + rows.length + ' total</span></div>';
    html += '<table><thead><tr><th>Carrier</th><th>RN</th><th>Trailer</th><th>Reference</th><th>Arrival Date</th><th>Door</th><th>Notes</th></tr></thead><tbody>';
    rows.forEach(function (r) {
      html += '<tr><td>' + escapeHtml(r.carrier || '—') + '</td><td>' + escapeHtml(r.rn || '—') + '</td><td>' + escapeHtml(r.trailer || '—') + '</td><td>' + escapeHtml(r.reference || '—') + '</td><td>' + escapeHtml(r.date || '—') + '</td><td>' + escapeHtml(r.door || '—') + '</td><td>' + escapeHtml(r.notes || '—') + '</td></tr>';
    });
    html += '</tbody></table>';
    el.innerHTML = html;
    el.hidden = false;
  }

  function renderMissedTable(rows, containerId, title, isOutbound, dateLabel) {
    var el = document.getElementById(containerId);
    if (!rows || rows.length === 0) { el.innerHTML = '<p style="color:var(--text-muted);padding:1rem;text-align:center;">No records</p>'; el.hidden = false; return; }
    var html = '<div class="detail-header"><span class="detail-header-title">' + escapeHtml(title) + '</span><span class="detail-header-count">' + rows.length + ' total</span></div>';
    if (isOutbound) {
      html += '<table><thead><tr><th>DN</th><th>Carrier</th><th>Load ID</th><th>Appt Date &amp; Time</th><th>Status</th><th>Door</th></tr></thead><tbody>';
      rows.forEach(function (r) {
        var apptDisplay = r.appointmentTime || '—';
        if (dateLabel && r.appointmentTime) apptDisplay = dateLabel + ' ' + r.appointmentTime;
        html += '<tr><td>' + escapeHtml(r.dn || '—') + '</td><td>' + escapeHtml(r.carrier || '—') + '</td><td>' + escapeHtml(r.loadId || '—') + '</td><td>' + escapeHtml(apptDisplay) + '</td><td>' + escapeHtml(r.status || '—') + '</td><td>' + escapeHtml(r.door || '—') + '</td></tr>';
      });
    } else {
      html += '<table><thead><tr><th>Carrier</th><th>RN</th><th>PO / Reference</th><th>Appt</th><th>Status</th><th>Door</th><th>Arrival</th></tr></thead><tbody>';
      rows.forEach(function (r) {
        html += '<tr><td>' + escapeHtml(r.carrier || '—') + '</td><td>' + escapeHtml(r.rn || '—') + '</td><td>' + escapeHtml(r.po || '—') + '</td><td>' + escapeHtml(r.appointmentTime || '—') + '</td><td>' + escapeHtml(r.status || '—') + '</td><td>' + escapeHtml(r.door || '—') + '</td><td>' + escapeHtml(r.arrivalTime || '—') + '</td></tr>';
      });
    }
    html += '</tbody></table>';
    el.innerHTML = html;
    el.hidden = false;
  }

  function updateTimestamp(date) {
    document.getElementById('last-updated').textContent = 'Updated ' + date.toLocaleTimeString();
  }

  // Data state
  var outboundData = null;
  var inboundData = null;
  var yardData = null;
  var partialShippedData = [];
  var commitFailedData = [];
  var autoRefreshTimeoutId = null;
  var countdownIntervalId = null;
  var nextAutoRefreshAt = null;
  var dashboardActive = false;
  var isRefreshing = false;

  function setRefreshLoading(loading) {
    var button = document.getElementById('btn-refresh');
    button.disabled = loading;
    button.textContent = loading ? 'Refreshing...' : 'Refresh';
  }

  function updateAutoRefreshStatus() {
    var status = document.getElementById('auto-refresh-status');
    if (!dashboardActive) {
      status.textContent = 'Auto-refresh paused';
      return;
    }
    if (isRefreshing || !nextAutoRefreshAt) {
      status.textContent = 'Refreshing dashboard...';
      return;
    }
    var seconds = Math.max(0, Math.ceil((nextAutoRefreshAt - Date.now()) / 1000));
    status.textContent = 'Auto-refreshes every 60 seconds · next in ' + seconds + 's';
  }

  function clearAutoRefresh() {
    if (autoRefreshTimeoutId) clearTimeout(autoRefreshTimeoutId);
    if (countdownIntervalId) clearInterval(countdownIntervalId);
    autoRefreshTimeoutId = null;
    countdownIntervalId = null;
    nextAutoRefreshAt = null;
  }

  function startAutoRefresh() {
    clearAutoRefresh();
    if (!dashboardActive) return;
    nextAutoRefreshAt = Date.now() + AUTO_REFRESH_INTERVAL_MS;
    updateAutoRefreshStatus();
    countdownIntervalId = setInterval(updateAutoRefreshStatus, 1000);
    autoRefreshTimeoutId = setTimeout(async function () {
      autoRefreshTimeoutId = null;
      await fetchAll({ preserveDetails: true });
      if (dashboardActive) startAutoRefresh();
    }, AUTO_REFRESH_INTERVAL_MS);
  }

  async function refreshOpenDetails() {
    if (topDetailVisible === 'partial') renderOrderTable(partialShippedData, 'partial-shipped-detail', 'PARTIAL SHIPPED');
    if (topDetailVisible === 'commit') renderOrderTable(commitFailedData, 'commit-failed-detail', 'COMMIT FAILED');
    if (topDetailVisible === 'yard') renderYardDetail(yardData ? yardData.inYardRows : [], 'Loads in Yard', false);
    if (topDetailVisible === 'norn') renderYardDetail(yardData ? yardData.noRnRows : [], 'No RN', false);
    if (topDetailVisible === 'staged') renderYardDetail(yardData ? yardData.inboundStagedRows : [], 'Inbound Staged', true);
    if (topDetailVisible === 'missedInbound') renderMissedTable(inboundData ? inboundData.missedInboundRows : [], 'missed-inbound-detail', 'Missed Inbound Appointments ' + (inboundData ? inboundData.missedInboundDate || '' : ''), false);
    if (topDetailVisible === 'missedOutbound') renderMissedTable(outboundData ? outboundData.missedOutboundRows : [], 'missed-outbound-detail', 'Missed Outbound Appointments ' + (outboundData ? outboundData.missedOutboundDate || '' : ''), true, outboundData ? outboundData.missedOutboundDate : '');

    if (outboundDetailVisible === 'lives') renderDnTable(outboundData ? outboundData.liveRows : [], 'outbound-detail');
    if (outboundDetailVisible === 'preloads') renderDnTable(outboundData ? outboundData.preloadRows : [], 'outbound-detail');
    if (outboundDetailVisible === 'shipped') renderDnTable(outboundData ? outboundData.shippedLiveRows : [], 'outbound-detail');
    if (outboundDetailVisible === 'shippedPre') renderDnTable(outboundData ? outboundData.shippedPreloadRows : [], 'outbound-detail');
    if (outboundLoadedDetailVisible) renderDnTable(outboundData ? outboundData.loadedRows : [], 'outbound-loaded-detail');

    if (inboundDetailVisible === 'live') renderPoTable(inboundData ? inboundData.livePoRows : [], 'inbound-detail');
    if (inboundDetailVisible === 'drop') renderPoTable(inboundData ? inboundData.dropPoRows : [], 'inbound-detail');
  }

  async function fetchSummaryJson(path) {
    var separator = path.includes('?') ? '&' : '?';
    var response = await fetch(path + separator + '_=' + Date.now(), {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    });
    return response.json();
  }

  async function fetchWmsJson(path) {
    var separator = path.includes('?') ? '&' : '?';
    var response = await fetch(path + separator + '_=' + Date.now(), {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    });
    var data = await response.json().catch(function () { return {}; });
    if (!response.ok) {
      var error = new Error(data.error || 'WMS data is temporarily unavailable.');
      error.status = response.status;
      error.payload = data;
      throw error;
    }
    return data;
  }

  async function fetchAll(options) {
    if (isRefreshing) return;
    var preserveDetails = options && options.preserveDetails;
    isRefreshing = true;
    setRefreshLoading(true);
    updateAutoRefreshStatus();

    if (!preserveDetails) {
      ['partial-shipped-detail', 'commit-failed-detail', 'yard-detail', 'yesterday-no-rn-detail', 'missed-inbound-detail', 'missed-outbound-detail', 'outbound-detail', 'outbound-loaded-detail', 'inbound-detail'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.hidden = true;
      });
    }

    try {
      var [yardRes, outboundRes, inboundRes] = await Promise.allSettled([
        fetchSummaryJson('/api/summary/yard'),
        fetchSummaryJson('/api/summary/outbound-schedule'),
        fetchSummaryJson('/api/summary/inbound-schedule'),
      ]);

    if (yardRes.status === 'fulfilled' && !yardRes.value.error) {
      yardData = yardRes.value;
      setVal('val-in-yard', yardData.inYardCount);
      setVal('val-no-rn', yardData.noRnCount);
      setVal('val-staged', yardData.inboundStagedCount);
      setYardAvailability(true);
    } else {
      yardData = yardRes.status === 'fulfilled' ? yardRes.value : { error: 'Yard tracker unavailable' };
      setVal('val-in-yard', null);
      setVal('val-no-rn', null);
      setVal('val-staged', null);
      setYardAvailability(false);
    }

    if (outboundRes.status === 'fulfilled' && !outboundRes.value.error) {
      outboundData = outboundRes.value;
      setVal('val-outbound-lives', outboundData.outboundLivesCount);
      setVal('val-preloads', outboundData.preloadsCount);
      setVal('val-shipped-live', outboundData.shippedLiveCount);
      setVal('val-shipped-preload', outboundData.shippedPreloadCount);
      if (outboundData.loadedCount != null) {
        setVal('val-outbound-loaded', outboundData.loadedCount);
        document.getElementById('sub-outbound-loaded').textContent = outboundData.loadedCount > 0 ? 'Outbound loads currently loaded · click for details' : 'No loaded outbound loads · click for details';
      } else {
        setVal('val-outbound-loaded', null);
        document.getElementById('sub-outbound-loaded').textContent = 'Outbound schedule unavailable';
      }
      if (outboundData.missedOutboundCount != null && !outboundData.missedOutboundError) {
        setVal('val-missed-outbound', outboundData.missedOutboundCount);
        document.getElementById('sub-missed-outbound').textContent = 'Missed on ' + (outboundData.missedOutboundDate || 'the previous day') + ' · click for details';
      } else {
        setVal('val-missed-outbound', null);
        document.getElementById('sub-missed-outbound').textContent = 'Previous-day data unavailable';
      }
    } else {
      outboundData = outboundRes.status === 'fulfilled' ? outboundRes.value : null;
      setVal('val-outbound-lives', null);
      setVal('val-preloads', null);
      setVal('val-shipped-live', null);
      setVal('val-shipped-preload', null);
      setVal('val-outbound-loaded', null);
      document.getElementById('sub-outbound-loaded').textContent = 'Outbound schedule unavailable';
      setVal('val-missed-outbound', null);
      document.getElementById('sub-missed-outbound').textContent = 'Outbound schedule unavailable';
    }

    if (inboundRes.status === 'fulfilled' && !inboundRes.value.error) {
      inboundData = inboundRes.value;
      setVal('val-inbound-live', inboundData.liveCount);
      setVal('val-inbound-drop', inboundData.dropCount);
      if (inboundData.yesterdayNoRnCount != null && !inboundData.yesterdayNoRnError) {
        setVal('val-yesterday-no-rn', inboundData.yesterdayNoRnCount);
        document.getElementById('sub-yesterday-no-rn').textContent = 'Arrived ' + (inboundData.yesterdayNoRnDate || 'the previous day') + ' · click for details';
      } else {
        setVal('val-yesterday-no-rn', null);
        document.getElementById('sub-yesterday-no-rn').textContent = 'Previous-day data unavailable';
      }
      if (inboundData.missedInboundCount != null && !inboundData.missedInboundError) {
        setVal('val-missed-inbound', inboundData.missedInboundCount);
        document.getElementById('sub-missed-inbound').textContent = 'Missed on ' + (inboundData.missedInboundDate || 'the previous day') + ' · click for details';
      } else {
        setVal('val-missed-inbound', null);
        document.getElementById('sub-missed-inbound').textContent = 'Previous-day data unavailable';
      }
    } else {
      inboundData = inboundRes.status === 'fulfilled' ? inboundRes.value : null;
      setVal('val-inbound-live', null);
      setVal('val-inbound-drop', null);
      setVal('val-yesterday-no-rn', null);
      document.getElementById('sub-yesterday-no-rn').textContent = 'Inbound schedule unavailable';
      setVal('val-missed-inbound', null);
      document.getElementById('sub-missed-inbound').textContent = 'Inbound schedule unavailable';
    }

    // WMS-backed current-status metrics are fetched on every manual and automatic refresh.
    var [partialRes, commitRes] = await Promise.allSettled([
      fetchWmsJson('/api/summary/partial-shipped'),
      fetchWmsJson('/api/summary/commit-failed'),
    ]);

    if (partialRes.status === 'fulfilled' && partialRes.value.totalCount != null && !partialRes.value.error) {
      setVal('val-partial-shipped', partialRes.value.totalCount);
      partialShippedData = partialRes.value.orders || [];
    } else {
      setVal('val-partial-shipped', null);
      partialShippedData = [];
    }

    if (commitRes.status === 'fulfilled' && commitRes.value.totalCount != null && !commitRes.value.error) {
      setVal('val-commit-failed', commitRes.value.totalCount);
      commitFailedData = commitRes.value.orders || [];
    } else {
      setVal('val-commit-failed', null);
      commitFailedData = [];
    }

      if (preserveDetails) await refreshOpenDetails();
      updateTimestamp(new Date());
    } finally {
      isRefreshing = false;
      setRefreshLoading(false);
      updateAutoRefreshStatus();
    }
  }

  // --- Click handlers for top metric cards ---
  var topDetailVisible = null;

  function toggleTopDetail(key, renderFn) {
    var panels = ['partial-shipped-detail', 'commit-failed-detail', 'yard-detail', 'yesterday-no-rn-detail', 'missed-inbound-detail', 'missed-outbound-detail'];
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
      renderYardDetail(yardData ? yardData.inYardRows : [], 'Loads in Yard', false);
    });
  });

  document.getElementById('card-no-rn').addEventListener('click', function () {
    toggleTopDetail('norn', function () {
      renderYardDetail(yardData ? yardData.noRnRows : [], 'No RN', false);
    });
  });

  document.getElementById('card-staged').addEventListener('click', function () {
    toggleTopDetail('staged', function () {
      renderYardDetail(yardData ? yardData.inboundStagedRows : [], 'Inbound Staged', true);
    });
  });

  document.getElementById('card-yesterday-no-rn').addEventListener('click', function () {
    toggleTopDetail('yesterdayNoRn', function () {
      renderYesterdayNoRnTable(inboundData ? inboundData.yesterdayNoRnRows : [], 'yesterday-no-rn-detail', inboundData ? inboundData.yesterdayNoRnDate : 'the previous day');
    });
  });

  document.getElementById('card-missed-inbound').addEventListener('click', function () {
    toggleTopDetail('missedInbound', function () {
      renderMissedTable(inboundData ? inboundData.missedInboundRows : [], 'missed-inbound-detail', 'Missed Inbound Appointments ' + (inboundData ? inboundData.missedInboundDate || '' : ''), false);
    });
  });

  document.getElementById('card-missed-outbound').addEventListener('click', function () {
    toggleTopDetail('missedOutbound', function () {
      renderMissedTable(outboundData ? outboundData.missedOutboundRows : [], 'missed-outbound-detail', 'Missed Outbound Appointments ' + (outboundData ? outboundData.missedOutboundDate || '' : ''), true, outboundData ? outboundData.missedOutboundDate : '');
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

  // --- Outbound Loaded card toggle ---
  var outboundLoadedDetailVisible = false;
  document.getElementById('card-outbound-loaded').addEventListener('click', function () {
    var el = document.getElementById('outbound-loaded-detail');
    if (outboundLoadedDetailVisible) { el.hidden = true; outboundLoadedDetailVisible = false; return; }
    renderDnTable(outboundData ? outboundData.loadedRows : [], 'outbound-loaded-detail');
    el.hidden = false;
    outboundLoadedDetailVisible = true;
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

  function resetDetailState() {
    topDetailVisible = null;
    outboundDetailVisible = null;
    inboundDetailVisible = null;
    outboundLoadedDetailVisible = false;
    document.querySelectorAll('.grid-metric.active').forEach(function (card) { card.classList.remove('active'); });
  }

  // Init dashboard
  function initDashboard(session) {
    dashboardActive = true;
    clearAutoRefresh();
    resetDetailState();
    document.getElementById('user-display').textContent = session.username || 'Signed in';
    document.getElementById('date-badge').textContent = 'Today, ' + new Date().toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', month: '2-digit', day: '2-digit', year: 'numeric' });
    fetchAll().then(startAutoRefresh);
  }

  // Refresh
  document.getElementById('btn-refresh').addEventListener('click', async function () {
    resetDetailState();
    clearAutoRefresh();
    await fetchAll();
    startAutoRefresh();
  });

  // Dashboard loads directly without requiring sign-in.
  // WMS-backed sections use server-side service auth when configured;
  // otherwise they show a business-friendly unavailable state.
  async function checkSession() {
    showScreen('dashboard');
    var session = null;
    try {
      var res = await fetch('/api/auth/me');
      if (res.ok) session = await res.json();
    } catch (e) {}
    initDashboard(session || { username: 'Operator' });
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
    dashboardActive = false;
    clearAutoRefresh();
    resetDetailState();
    updateAutoRefreshStatus();
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (e) {}
    showScreen('login');
  });

  checkSession();
})();

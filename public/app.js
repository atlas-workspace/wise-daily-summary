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

  function findMetricCard(gridId, status) {
    return Array.from(document.querySelectorAll('#' + gridId + ' .grid-metric')).find(function (card) {
      return card.dataset.status === status;
    });
  }

  async function refreshOpenDetails() {
    if (topDetailVisible === 'partial') renderOrderTable(partialShippedData, 'partial-shipped-detail', 'PARTIAL SHIPPED');
    if (topDetailVisible === 'commit') renderOrderTable(commitFailedData, 'commit-failed-detail', 'COMMIT FAILED');
    if (topDetailVisible === 'yard') renderYardDetail(yardData ? yardData.inYardRows : [], 'Loads in Yard', false);
    if (topDetailVisible === 'norn') renderYardDetail(yardData ? yardData.noRnRows : [], 'No RN', false);
    if (topDetailVisible === 'staged') renderYardDetail(yardData ? yardData.inboundStagedRows : [], 'Inbound Staged', true);

    if (outboundDetailVisible === 'lives') renderDnTable(outboundData ? outboundData.liveRows : [], 'outbound-detail');
    if (outboundDetailVisible === 'preloads') renderDnTable(outboundData ? outboundData.preloadRows : [], 'outbound-detail');
    if (outboundDetailVisible === 'shipped') renderDnTable(outboundData ? outboundData.shippedLiveRows : [], 'outbound-detail');
    if (outboundDetailVisible === 'shippedPre') renderDnTable(outboundData ? outboundData.shippedPreloadRows : [], 'outbound-detail');

    if (inboundDetailVisible === 'live') renderPoTable(inboundData ? inboundData.livePoRows : [], 'inbound-detail');
    if (inboundDetailVisible === 'drop') renderPoTable(inboundData ? inboundData.dropPoRows : [], 'inbound-detail');

    if (outboundMetricDetailStatus) {
      var outboundStatus = outboundMetricDetailStatus;
      var outboundCard = findMetricCard('outbound-metrics-grid', outboundStatus);
      outboundMetricDetailStatus = null;
      if (outboundCard) await handleOutboundMetricClick(outboundStatus, outboundCard);
      else document.getElementById('outbound-metrics-detail').hidden = true;
    }

    if (inboundMetricDetailStatus) {
      var inboundStatus = inboundMetricDetailStatus;
      var inboundCard = findMetricCard('inbound-metrics-grid', inboundStatus);
      inboundMetricDetailStatus = null;
      if (inboundCard) await handleInboundMetricClick(inboundStatus, inboundCard);
      else document.getElementById('inbound-metrics-detail').hidden = true;
    }
  }

  function renderMetricsUnavailable(gridId, message) {
    document.getElementById(gridId).innerHTML = '<div class="metrics-placeholder">' + escapeHtml(message) + '</div>';
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

  function getMetricsUnavailableMessage(result, sectionName) {
    if (result.status === 'rejected' && result.reason && result.reason.status === 401) {
      return 'Session expired. Sign out and sign in again.';
    }
    return sectionName + ' metrics are temporarily unavailable. Refresh to try again.';
  }

  function formatMetricsRefreshTime(value) {
    if (!value) return '';
    return new Date(value).toLocaleTimeString('en-US', {
      timeZone: 'America/Los_Angeles',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  function setMetricsSuccessSubtitle(elementId, data, recordLabel, detailHint) {
    var refreshedTime = formatMetricsRefreshTime(data.refreshedAt);
    var refreshCopy = refreshedTime ? ' · Refreshed ' + refreshedTime : '';
    var windowCopy = data.windowStart + ' to ' + data.windowEnd;
    var updateCopy = ' · Updates every 60 seconds';
    if (data.unavailableStatusCount > 0) {
      document.getElementById(elementId).textContent = 'Some PEPSICO WMS ' + recordLabel + ' statuses are temporarily unavailable for the schedule window ' + windowCopy + refreshCopy + updateCopy;
      return;
    }
    if (data.totalCount === 0) {
      document.getElementById(elementId).textContent = 'No PEPSICO WMS ' + recordLabel + ' scheduled from ' + windowCopy + refreshCopy + updateCopy;
      return;
    }
    document.getElementById(elementId).textContent = 'Scheduled from ' + windowCopy + ' · ' + data.totalCount + ' total' + refreshCopy + updateCopy + ' · ' + detailHint;
  }

  function setMetricsUnavailableSubtitle(elementId, result, sectionName) {
    if (result.status === 'rejected' && result.reason && result.reason.status === 401) {
      document.getElementById(elementId).textContent = 'Session expired · Sign out and sign in again';
      return;
    }
    document.getElementById(elementId).textContent = sectionName + ' metrics temporarily unavailable · Refresh to try again';
  }

  async function fetchAll(options) {
    if (isRefreshing) return;
    var preserveDetails = options && options.preserveDetails;
    isRefreshing = true;
    setRefreshLoading(true);
    updateAutoRefreshStatus();

    if (!preserveDetails) {
      ['partial-shipped-detail', 'commit-failed-detail', 'yard-detail', 'outbound-detail', 'inbound-detail', 'outbound-metrics-detail', 'inbound-metrics-detail'].forEach(function (id) {
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
    }

    if (inboundRes.status === 'fulfilled' && !inboundRes.value.error) {
      inboundData = inboundRes.value;
      setVal('val-inbound-live', inboundData.liveCount);
      setVal('val-inbound-drop', inboundData.dropCount);
    }

    // Auth-required WMS metrics are fetched on every manual and automatic refresh.
    var [outMetrics, inMetrics, partialRes, commitRes] = await Promise.allSettled([
      fetchWmsJson('/api/summary/outbound-metrics'),
      fetchWmsJson('/api/summary/inbound-metrics'),
      fetchWmsJson('/api/summary/partial-shipped'),
      fetchWmsJson('/api/summary/commit-failed'),
    ]);

    if (outMetrics.status === 'fulfilled' && outMetrics.value.metrics && !outMetrics.value.error) {
      renderMetricsGrid('outbound-metrics-grid', outMetrics.value.metrics, handleOutboundMetricClick);
      setMetricsSuccessSubtitle('outbound-metrics-sub', outMetrics.value, 'orders', 'Click a status to view DN numbers');
    } else {
      renderMetricsUnavailable('outbound-metrics-grid', getMetricsUnavailableMessage(outMetrics, 'Outbound'));
      setMetricsUnavailableSubtitle('outbound-metrics-sub', outMetrics, 'Outbound');
    }

    if (inMetrics.status === 'fulfilled' && inMetrics.value.metrics && !inMetrics.value.error) {
      renderMetricsGrid('inbound-metrics-grid', inMetrics.value.metrics, handleInboundMetricClick);
      setMetricsSuccessSubtitle('inbound-metrics-sub', inMetrics.value, 'receipts', 'Click a status to view receipts');
    } else {
      renderMetricsUnavailable('inbound-metrics-grid', getMetricsUnavailableMessage(inMetrics, 'Inbound'));
      setMetricsUnavailableSubtitle('inbound-metrics-sub', inMetrics, 'Inbound');
    }

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
      var data = await fetchWmsJson('/api/summary/outbound-orders/' + encodeURIComponent(status));
      if (data.error) { el.innerHTML = '<p style="color:var(--text-muted);padding:1rem;text-align:center;">Details unavailable</p>'; return; }
      var totalCount = data.totalCount || 0;
      var orders = data.orders || [];
      var limitNote = totalCount > orders.length ? '<div class="detail-limit-note">Showing first ' + orders.length + ' of ' + totalCount + '</div>' : '';
      var headerHtml = '<div class="detail-header"><span class="detail-header-title">' + escapeHtml(status.replace(/_/g, ' ')) + ' Orders</span><span class="detail-header-count">' + totalCount + ' total</span></div>';
      renderOrderTable(orders, 'outbound-metrics-detail', status);
      el.innerHTML = headerHtml + el.innerHTML + limitNote;
    } catch (e) {
      var message = e && e.status === 401 ? 'Session expired. Sign out and sign in again.' : 'Details unavailable';
      el.innerHTML = '<p style="color:var(--text-muted);padding:1rem;text-align:center;">' + escapeHtml(message) + '</p>';
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
      var data = await fetchWmsJson('/api/summary/inbound-receipts/' + encodeURIComponent(status));
      if (data.error) { el.innerHTML = '<p style="color:var(--text-muted);padding:1rem;text-align:center;">Details unavailable</p>'; return; }
      var totalCount = data.totalCount || 0;
      var receipts = data.receipts || [];
      var limitNote = totalCount > receipts.length ? '<div class="detail-limit-note">Showing first ' + receipts.length + ' of ' + totalCount + '</div>' : '';
      var headerHtml = '<div class="detail-header"><span class="detail-header-title">' + escapeHtml(status.replace(/_/g, ' ')) + ' Receipts</span><span class="detail-header-count">' + totalCount + ' total</span></div>';
      renderReceiptTable(receipts, 'inbound-metrics-detail', status);
      el.innerHTML = headerHtml + el.innerHTML + limitNote;
    } catch (e) {
      var message = e && e.status === 401 ? 'Session expired. Sign out and sign in again.' : 'Details unavailable';
      el.innerHTML = '<p style="color:var(--text-muted);padding:1rem;text-align:center;">' + escapeHtml(message) + '</p>';
    }
  }

  function resetDetailState() {
    topDetailVisible = null;
    outboundDetailVisible = null;
    inboundDetailVisible = null;
    outboundMetricDetailStatus = null;
    inboundMetricDetailStatus = null;
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
    dashboardActive = false;
    clearAutoRefresh();
    updateAutoRefreshStatus();
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
    dashboardActive = false;
    clearAutoRefresh();
    resetDetailState();
    updateAutoRefreshStatus();
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (e) {}
    showScreen('login');
  });

  checkSession();
})();

(function () {
  'use strict';

  var screens = {
    login: document.getElementById('screen-login'),
    dashboard: document.getElementById('screen-dashboard'),
  };

  function showScreen(name) {
    Object.values(screens).forEach(function (el) { el.classList.remove('active'); });
    screens[name].classList.add('active');
  }

  function showError(msg, diagnostics) {
    var el = document.getElementById('login-error');
    el.hidden = false;

    var html = '<div class="error-summary">' + escapeHtml(msg) + '</div>';
    if (diagnostics) {
      html += '<details class="diag-panel"><summary>Sign-in diagnostic</summary><dl class="diag-list">';
      if (diagnostics.status !== undefined) {
        html += '<dt>Status</dt><dd>' + escapeHtml(String(diagnostics.status) + ' ' + (diagnostics.statusText || '')) + '</dd>';
      }
      if (diagnostics.url) {
        html += '<dt>Endpoint</dt><dd>' + escapeHtml(diagnostics.url) + '</dd>';
      }
      if (diagnostics.upstreamMessage) {
        html += '<dt>Message</dt><dd>' + escapeHtml(diagnostics.upstreamMessage) + '</dd>';
      }
      if (diagnostics.upstreamCode) {
        html += '<dt>Code</dt><dd>' + escapeHtml(String(diagnostics.upstreamCode)) + '</dd>';
      }
      if (diagnostics.responseKeys && diagnostics.responseKeys.length) {
        html += '<dt>Response keys</dt><dd>' + escapeHtml(diagnostics.responseKeys.join(', ')) + '</dd>';
      }
      if (diagnostics.responseBody !== undefined && diagnostics.responseBody !== null) {
        var bodyStr = typeof diagnostics.responseBody === 'string'
          ? diagnostics.responseBody
          : JSON.stringify(diagnostics.responseBody, null, 2);
        html += '<dt>Response body</dt><dd><pre class="diag-pre">' + escapeHtml(bodyStr) + '</pre></dd>';
      }
      html += '</dl></details>';
    }
    el.innerHTML = html;
  }

  function hideError() {
    var el = document.getElementById('login-error');
    el.hidden = true;
    el.innerHTML = '';
  }

  function setLoginLoading(loading) {
    var btn = document.getElementById('btn-login');
    btn.disabled = loading;
    btn.textContent = loading ? 'Signing in...' : 'Sign In';
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Check existing session on page load
  async function checkSession() {
    try {
      var res = await fetch('/api/auth/me');
      if (res.ok) {
        var data = await res.json();
        showScreen('dashboard');
        initDashboard(data);
        return;
      }
    } catch (e) { /* no session */ }
    showScreen('login');
  }

  // Login form
  document.getElementById('login-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    hideError();

    var username = document.getElementById('input-username').value.trim();
    var password = document.getElementById('input-password').value;

    if (!username || !password) {
      showError('Please enter username and password');
      return;
    }

    setLoginLoading(true);
    try {
      var res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username, password: password }),
      });

      if (!res.ok) {
        var errData = await res.json().catch(function () { return {}; });
        showError(errData.error || 'Sign-in failed', errData.diagnostics);
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

  // Dashboard initialization
  function initDashboard(session) {
    document.getElementById('user-display').textContent = session.username || 'Signed in';
    resetHealthCard('wms');
    resetHealthCard('yms');
    resetHealthCard('tms');
    resetHealthCard('ticket');
  }

  function resetHealthCard(prefix) {
    var statusEl = document.getElementById(prefix + '-health-status');
    statusEl.className = 'health-status idle';
    statusEl.querySelector('.health-text').textContent = 'Not checked';
    document.getElementById(prefix + '-health-message').textContent = '';
    var diagEl = document.getElementById(prefix + '-health-diag');
    diagEl.hidden = true;
    diagEl.innerHTML = '';
  }

  // Generic health check handler
  function setupHealthCheck(btnId, apiPath, prefix, serviceName) {
    document.getElementById(btnId).addEventListener('click', async function () {
      var btn = this;
      var statusEl = document.getElementById(prefix + '-health-status');
      var msgEl = document.getElementById(prefix + '-health-message');
      var diagEl = document.getElementById(prefix + '-health-diag');

      btn.disabled = true;
      btn.textContent = 'Checking...';
      statusEl.className = 'health-status checking';
      statusEl.querySelector('.health-text').textContent = 'Checking...';
      msgEl.textContent = '';
      diagEl.hidden = true;
      diagEl.innerHTML = '';

      try {
        var res = await fetch(apiPath);

        if (res.status === 401) {
          showScreen('login');
          showError('Session expired. Please sign in again.');
          return;
        }

        var data = await res.json();

        if (data.ok) {
          statusEl.className = 'health-status connected';
          statusEl.querySelector('.health-text').textContent = 'Connected';
          msgEl.textContent = data.message || (serviceName + ' connection verified');
        } else {
          statusEl.className = 'health-status failed';
          statusEl.querySelector('.health-text').textContent = 'Failed';
          msgEl.textContent = data.message || (serviceName + ' access could not be verified');

          if (data.diagnostics) {
            diagEl.hidden = false;
            var html = '<details class="diag-panel"><summary>Diagnostic details</summary><dl class="diag-list">';
            if (data.diagnostics.status !== undefined) {
              html += '<dt>Status</dt><dd>' + escapeHtml(String(data.diagnostics.status) + ' ' + (data.diagnostics.statusText || '')) + '</dd>';
            }
            if (data.diagnostics.upstreamMessage) {
              html += '<dt>Message</dt><dd>' + escapeHtml(data.diagnostics.upstreamMessage) + '</dd>';
            }
            if (data.diagnostics.upstreamCode) {
              html += '<dt>Code</dt><dd>' + escapeHtml(String(data.diagnostics.upstreamCode)) + '</dd>';
            }
            if (data.diagnostics.error) {
              html += '<dt>Error</dt><dd>' + escapeHtml(data.diagnostics.error) + '</dd>';
            }
            html += '</dl></details>';
            diagEl.innerHTML = html;
          }
        }
      } catch (err) {
        statusEl.className = 'health-status failed';
        statusEl.querySelector('.health-text').textContent = 'Error';
        msgEl.textContent = 'Could not reach the server';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Check ' + serviceName + ' Connection';
      }
    });
  }

  setupHealthCheck('btn-check-wms', '/api/wms/health', 'wms', 'WMS');
  setupHealthCheck('btn-check-yms', '/api/yms/health', 'yms', 'YMS');
  setupHealthCheck('btn-check-tms', '/api/tms/health', 'tms', 'TMS/FMS');
  setupHealthCheck('btn-check-ticket', '/api/ticket/health', 'ticket', 'Ticket');

  // Logout
  document.getElementById('btn-logout').addEventListener('click', async function () {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) { /* ignore */ }
    resetHealthCard('wms');
    resetHealthCard('yms');
    resetHealthCard('tms');
    resetHealthCard('ticket');
    showScreen('login');
  });

  // Boot
  checkSession();
})();

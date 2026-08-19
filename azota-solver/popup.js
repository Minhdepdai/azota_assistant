// ═══════════════════════════════════════════════════════════════
// POPUP.JS — Logic cho popup UI
// ═══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKeyInput');
  const toggleKeyBtn = document.getElementById('toggleKey');
  const saveKeyBtn = document.getElementById('saveKey');
  const keyStatus = document.getElementById('keyStatus');
  const capturedCount = document.getElementById('capturedCount');
  const answerCount = document.getElementById('answerCount');
  const answersList = document.getElementById('answersList');
  const refreshBtn = document.getElementById('refreshBtn');
  const toggleLog = document.getElementById('toggleLog');
  const logList = document.getElementById('logList');

  // ── Load API Key hiện tại ─────────────────────────────────
  chrome.runtime.sendMessage({ action: 'GET_API_KEY' }, (response) => {
    if (response?.key) {
      apiKeyInput.value = response.key;
      showStatus(keyStatus, '✅ API Key đã được lưu', 'success');
    }
  });

  // ── Toggle hiện/ẩn API Key ────────────────────────────────
  toggleKeyBtn.addEventListener('click', () => {
    apiKeyInput.type = apiKeyInput.type === 'password' ? 'text' : 'password';
  });

  // ── Lưu API Key ──────────────────────────────────────────
  saveKeyBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (!key) {
      showStatus(keyStatus, '❌ Vui lòng nhập API Key', 'error');
      return;
    }

    // Validate key format (Gemini keys thường bắt đầu bằng AIza)
    if (!key.startsWith('AIza') || key.length < 30) {
      showStatus(keyStatus, '⚠️ Key không đúng định dạng (phải bắt đầu bằng AIza...)', 'error');
      return;
    }

    chrome.runtime.sendMessage({
      action: 'SET_API_KEY',
      data: { key },
    }, (response) => {
      if (response?.ok) {
        showStatus(keyStatus, '✅ Đã lưu thành công!', 'success');
      } else {
        showStatus(keyStatus, '❌ Lỗi lưu key', 'error');
      }
    });
  });

  // ── Load answers & log ───────────────────────────────────
  function loadData() {
    chrome.runtime.sendMessage({ action: 'GET_ANSWERS' }, (response) => {
      if (chrome.runtime.lastError) {
        console.log('Popup: không kết nối được background');
        return;
      }

      const answers = response?.answers || [];
      const log = response?.log || [];

      answerCount.textContent = answers.length;
      capturedCount.textContent = log.length;

      renderAnswers(answers);
      renderLog(log);
    });
  }

  // ── Render đáp án ─────────────────────────────────────────
  function renderAnswers(answers) {
    if (answers.length === 0) {
      answersList.innerHTML = '<div class="empty-state">Chưa có đáp án. Mở bài thi Azota để bắt đầu.</div>';
      return;
    }

    answersList.innerHTML = answers.map((a, i) => `
      <div class="answer-item">
        <div class="q-header">
          <span class="q-num">Câu ${a.questionNumber || (i + 1)}</span>
        </div>
        ${a.questionPreview ? `<div class="q-preview">${escapeHtml(a.questionPreview)}</div>` : ''}
        <div class="a-value">${escapeHtml(a.answer || '...')}</div>
        ${a.explanation ? `<div class="a-explain">${escapeHtml(a.explanation)}</div>` : ''}
      </div>
    `).join('');
  }

  // ── Render log ────────────────────────────────────────────
  function renderLog(log) {
    if (log.length === 0) {
      logList.innerHTML = '<div class="empty-state">Chưa có log</div>';
      return;
    }

    logList.innerHTML = log.slice(-20).reverse().map(entry => {
      const time = new Date(entry.timestamp).toLocaleTimeString('vi-VN');
      const isSuspect = entry.questionCount > 0;
      return `
        <div class="log-item ${isSuspect ? 'suspect' : ''}">
          <span class="log-time">${time}</span>
          <span class="log-url">${truncateURL(entry.url)}</span>
          <span class="log-meta">[${entry.encoding}${entry.questionCount > 0 ? ` · ${entry.questionCount}Q` : ''}]</span>
        </div>
      `;
    }).join('');
  }

  // ── Refresh button ────────────────────────────────────────
  refreshBtn.addEventListener('click', () => {
    loadData();
    refreshBtn.textContent = '✓';
    setTimeout(() => { refreshBtn.textContent = '🔄'; }, 1000);
  });

  // ── Toggle log section ───────────────────────────────────
  toggleLog.addEventListener('click', () => {
    logList.classList.toggle('hidden');
    toggleLog.classList.toggle('open');
  });

  // ── Helpers ───────────────────────────────────────────────
  function showStatus(el, text, type) {
    el.textContent = text;
    el.className = 'status-msg ' + type;
    setTimeout(() => { el.textContent = ''; }, 5000);
  }

  function escapeHtml(text) {
    const div = document.createElement('span');
    div.textContent = text;
    return div.innerHTML;
  }

  function truncateURL(url) {
    if (!url) return '(unknown)';
    try {
      const u = new URL(url);
      const path = u.pathname + u.search;
      return path.length > 50 ? path.substring(0, 47) + '...' : path;
    } catch {
      return url.length > 50 ? url.substring(0, 47) + '...' : url;
    }
  }

  // ── Auto-refresh ─────────────────────────────────────────
  loadData();
  setInterval(loadData, 3000); // refresh mỗi 3 giây
});

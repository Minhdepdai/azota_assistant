// ═══════════════════════════════════════════════════════════════
// CONTENT.JS — Content Script (ISOLATED world)
// Chạy tại document_start trên azota.vn
// 1. Inject interceptor.js vào page context
// 2. Lắng nghe dữ liệu từ interceptor qua postMessage
// 3. Relay dữ liệu sang background.js qua chrome.runtime
// 4. Tạo floating panel hiển thị đáp án (Shadow DOM)
// ═══════════════════════════════════════════════════════════════

(function () {
  'use strict';

  const SIGNATURE = '__AZOTA_SOLVER__';

  // ── Inject interceptor.js vào page context ────────────────
  // Phải chạy TRƯỚC mọi script khác của trang
  function injectInterceptor() {
    try {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('interceptor.js');
      script.setAttribute('data-id', SIGNATURE);

      // Inject vào <html> hoặc <head> — cái nào có trước
      const target = document.documentElement || document.head || document.body;
      if (target) {
        target.prepend(script);
      } else {
        // Fallback: đợi DOM
        document.addEventListener('DOMContentLoaded', () => {
          (document.head || document.documentElement).prepend(script);
        });
      }

      script.onload = () => script.remove(); // dọn dẹp
    } catch (err) {
      console.error('[AzotaSolver] Lỗi inject interceptor:', err);
    }
  }

  injectInterceptor();

  // ── State ─────────────────────────────────────────────────
  let panelElement = null;
  let panelRoot = null;
  let answers = [];
  let capturedData = [];
  let isProcessing = false;

  // ── Lắng nghe messages từ interceptor (page context) ──────
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (!event.data || event.data.source !== SIGNATURE) return;

    const { type, data } = event.data;

    switch (type) {
      case 'DIAGNOSTICS':
        console.log('[AzotaSolver] Diagnostics:', data);
        chrome.runtime.sendMessage({
          action: 'DIAGNOSTICS',
          data,
        });
        break;

      case 'HOOKS_READY':
        console.log('[AzotaSolver] ✅ Interceptor hooks đã sẵn sàng');
        updatePanel('status', '🟢 Đang lắng nghe...');
        break;

      case 'CAPTURED_RESPONSE':
        handleCapture(data);
        break;
    }
  });

  // ── Xử lý dữ liệu đã bắt được ──────────────────────────
  function handleCapture(capture) {
    capturedData.push(capture);

    console.log(
      `[AzotaSolver] 🎯 Bắt được: ${capture.captureType} ${capture.url}`,
      `| Questions: ${capture.questionCount}`,
      `| Encoding: ${capture.encoding}`
    );

    // Gửi toàn bộ capture sang background để phân tích + giải
    chrome.runtime.sendMessage({
      action: 'EXAM_DATA_CAPTURED',
      data: capture,
    });

    // Cập nhật panel
    updatePanel('status', `🔍 Đã bắt ${capturedData.length} response(s)...`);

    if (capture.questionCount > 0) {
      updatePanel('status', `📝 Phát hiện ${capture.questionCount} câu hỏi! Đang gửi AI...`);
    }
  }

  // ── Lắng nghe phản hồi từ background ─────────────────────
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
      case 'ANSWERS_READY':
        answers = message.data.answers || [];
        console.log('[AzotaSolver] ✅ Nhận được đáp án:', answers);
        renderAnswers(answers);
        sendResponse({ ok: true });
        break;

      case 'PROCESSING_STATUS':
        updatePanel('status', message.data.text);
        sendResponse({ ok: true });
        break;

      case 'ERROR':
        updatePanel('status', `❌ ${message.data.error}`);
        sendResponse({ ok: true });
        break;

      case 'PING':
        sendResponse({ alive: true, capturedCount: capturedData.length });
        break;
    }
    return true; // async response
  });

  // ── Floating Panel (Shadow DOM — tránh bẫy MutationObserver) ─
  function createPanel() {
    if (panelElement) return;

    // Đợi body sẵn sàng
    const attach = () => {
      panelElement = document.createElement('div');
      panelElement.id = '__azota_solver_host__';
      panelElement.style.cssText = `
        position: fixed !important;
        bottom: 16px !important;
        right: 16px !important;
        z-index: 2147483647 !important;
        all: initial !important;
      `;

      // Shadow DOM để cô lập hoàn toàn
      panelRoot = panelElement.attachShadow({ mode: 'closed' });

      panelRoot.innerHTML = `
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }

          :host {
            all: initial;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          }

          .panel {
            width: 340px;
            max-height: 70vh;
            background: #1a1a2e;
            border: 1px solid #16213e;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.4);
            overflow: hidden;
            display: flex;
            flex-direction: column;
            color: #e0e0e0;
            font-size: 13px;
          }

          .panel.minimized {
            width: auto;
            max-height: none;
          }

          .panel.minimized .panel-body,
          .panel.minimized .panel-status {
            display: none;
          }

          .header {
            background: #0f3460;
            padding: 10px 14px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: move;
            user-select: none;
          }

          .header-title {
            font-weight: 600;
            font-size: 13px;
            color: #e94560;
          }

          .header-controls {
            display: flex;
            gap: 8px;
          }

          .header-btn {
            background: none;
            border: none;
            color: #aaa;
            cursor: pointer;
            font-size: 16px;
            padding: 0 4px;
            line-height: 1;
          }
          .header-btn:hover { color: #fff; }

          .panel-status {
            padding: 8px 14px;
            background: #16213e;
            font-size: 11px;
            color: #8ec6ff;
            border-bottom: 1px solid #1a1a3e;
          }

          .panel-body {
            overflow-y: auto;
            max-height: 55vh;
            padding: 8px;
          }

          .answer-card {
            background: #16213e;
            border-radius: 8px;
            padding: 10px 12px;
            margin-bottom: 6px;
            border-left: 3px solid #e94560;
          }

          .answer-card .q-num {
            color: #e94560;
            font-weight: 700;
            font-size: 12px;
            margin-bottom: 4px;
          }

          .answer-card .q-text {
            color: #aaa;
            font-size: 11px;
            margin-bottom: 6px;
            line-height: 1.4;
            max-height: 40px;
            overflow: hidden;
          }

          .answer-card .a-text {
            color: #4ade80;
            font-weight: 600;
            font-size: 13px;
            line-height: 1.4;
          }

          .empty-state {
            padding: 24px 16px;
            text-align: center;
            color: #666;
            font-size: 12px;
          }

          .panel-body::-webkit-scrollbar { width: 4px; }
          .panel-body::-webkit-scrollbar-track { background: transparent; }
          .panel-body::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
        </style>

        <div class="panel" id="panel">
          <div class="header" id="header">
            <span class="header-title">⚡ Azota Solver</span>
            <div class="header-controls">
              <button class="header-btn" id="btn-minimize" title="Thu nhỏ">−</button>
              <button class="header-btn" id="btn-close" title="Ẩn">×</button>
            </div>
          </div>
          <div class="panel-status" id="status">⏳ Đang khởi tạo...</div>
          <div class="panel-body" id="body">
            <div class="empty-state">Đang chờ dữ liệu bài thi...</div>
          </div>
        </div>
      `;

      // Event handlers
      const panel = panelRoot.getElementById('panel');
      const btnMin = panelRoot.getElementById('btn-minimize');
      const btnClose = panelRoot.getElementById('btn-close');

      btnMin.addEventListener('click', () => {
        panel.classList.toggle('minimized');
        btnMin.textContent = panel.classList.contains('minimized') ? '+' : '−';
      });

      btnClose.addEventListener('click', () => {
        panelElement.style.display = 'none';
      });

      // Drag support
      let isDragging = false, startX, startY, startLeft, startBottom;
      const header = panelRoot.getElementById('header');

      header.addEventListener('mousedown', (e) => {
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = panelElement.getBoundingClientRect();
        startLeft = rect.left;
        startBottom = window.innerHeight - rect.bottom;
      });

      document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        panelElement.style.right = 'auto';
        panelElement.style.left = (startLeft + dx) + 'px';
        panelElement.style.bottom = (startBottom - dy) + 'px';
      });

      document.addEventListener('mouseup', () => { isDragging = false; });

      // Touch drag (cho mobile)
      header.addEventListener('touchstart', (e) => {
        isDragging = true;
        const touch = e.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
        const rect = panelElement.getBoundingClientRect();
        startLeft = rect.left;
        startBottom = window.innerHeight - rect.bottom;
      });

      document.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        const touch = e.touches[0];
        const dx = touch.clientX - startX;
        const dy = touch.clientY - startY;
        panelElement.style.right = 'auto';
        panelElement.style.left = (startLeft + dx) + 'px';
        panelElement.style.bottom = (startBottom - dy) + 'px';
      });

      document.addEventListener('touchend', () => { isDragging = false; });

      document.body.appendChild(panelElement);
    };

    if (document.body) {
      attach();
    } else {
      document.addEventListener('DOMContentLoaded', attach);
    }
  }

  // ── Cập nhật trạng thái panel ─────────────────────────────
  function updatePanel(section, content) {
    if (!panelRoot) return;

    if (section === 'status') {
      const el = panelRoot.getElementById('status');
      if (el) el.textContent = content;
    }
  }

  // ── Render đáp án lên panel ───────────────────────────────
  function renderAnswers(answerList) {
    if (!panelRoot) return;

    const body = panelRoot.getElementById('body');
    if (!body) return;

    if (answerList.length === 0) {
      body.innerHTML = '<div class="empty-state">Không có đáp án</div>';
      return;
    }

    body.innerHTML = answerList.map((a, i) => `
      <div class="answer-card">
        <div class="q-num">Câu ${a.questionNumber || (i + 1)}</div>
        <div class="q-text">${escapeHtml(a.questionPreview || '')}</div>
        <div class="a-text">${escapeHtml(a.answer || '...')}</div>
      </div>
    `).join('');

    updatePanel('status', `✅ ${answerList.length} đáp án sẵn sàng`);

    // Hiện panel nếu đang ẩn
    if (panelElement) {
      panelElement.style.display = '';
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ── Khởi tạo panel khi DOM sẵn sàng ──────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createPanel);
  } else {
    createPanel();
  }

})();

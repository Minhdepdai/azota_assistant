// ═══════════════════════════════════════════════════════════════
// INTERCEPTOR.JS — Chạy trong page context (MAIN world)
// Hook fetch/XHR để bắt response từ Azota API
// Giao tiếp với content.js qua window.postMessage
// ═══════════════════════════════════════════════════════════════

(function () {
  'use strict';

  const SIGNATURE = '__AZOTA_SOLVER__';

  // ── Phát hiện Monkey Patching có sẵn ──────────────────────
  const diagnostics = {
    fetchNative: String(window.fetch).includes('[native code]'),
    xhrOpenNative: String(XMLHttpRequest.prototype.open).includes('[native code]'),
    xhrSendNative: String(XMLHttpRequest.prototype.send).includes('[native code]'),
  };

  window.postMessage({
    source: SIGNATURE,
    type: 'DIAGNOSTICS',
    data: diagnostics,
  }, '*');

  // ── Heuristic: URL có khả năng chứa dữ liệu bài thi ─────
  const EXAM_PATTERNS = [
    /\/api\//i,
    /\/exam/i,
    /\/question/i,
    /\/quiz/i,
    /\/test/i,
    /\/assignment/i,
    /\/attempt/i,
    /\/paper/i,
    /\/assessment/i,
    /\/do-bai/i,
    /\/ket-qua/i,
    /\/bai-thi/i,
    /\/de-thi/i,
    /\/nop-bai/i,
    /graphql/i,
    /\.json(\?|$)/i,
  ];

  function isExamRelatedURL(url) {
    return EXAM_PATTERNS.some(p => p.test(url));
  }

  // ── Heuristic: JSON body có chứa dữ liệu câu hỏi không ──
  function looksLikeExamData(obj) {
    if (!obj || typeof obj !== 'object') return false;

    const json = JSON.stringify(obj).toLowerCase();

    // Tìm từ khóa đặc trưng của dữ liệu bài thi
    const examKeywords = [
      'question', 'câu hỏi', 'cauhoi', 'cau_hoi',
      'answer', 'đáp án', 'dapan', 'dap_an',
      'option', 'lựa chọn', 'lua_chon',
      'exam', 'bài thi', 'baithi', 'bai_thi',
      'content', 'nội dung', 'noidung',
      'quiz', 'test', 'assignment',
      'choice', 'correct', 'score',
    ];

    let matchCount = 0;
    for (const kw of examKeywords) {
      if (json.includes(kw)) matchCount++;
    }

    // Cần ít nhất 2 từ khóa trùng khớp
    return matchCount >= 2;
  }

  // ── Trích xuất câu hỏi từ JSON (đệ quy, linh hoạt) ──────
  function deepExtractQuestions(obj, path = '') {
    const results = [];

    if (Array.isArray(obj)) {
      obj.forEach((item, i) => {
        results.push(...deepExtractQuestions(item, `${path}[${i}]`));
      });
    } else if (obj && typeof obj === 'object') {
      // Kiểm tra xem object này có giống một câu hỏi không
      const keys = Object.keys(obj).map(k => k.toLowerCase());
      const hasQuestionIndicator = keys.some(k =>
        k.includes('question') || k.includes('content') || k.includes('text') ||
        k.includes('title') || k.includes('noidung') || k.includes('cauhoi') ||
        k.includes('body') || k.includes('stem') || k.includes('prompt')
      );
      const hasOptionsIndicator = keys.some(k =>
        k.includes('option') || k.includes('answer') || k.includes('choice') ||
        k.includes('dapan') || k.includes('luachon') || k.includes('select')
      );

      if (hasQuestionIndicator) {
        results.push({ path, data: obj });
      }

      // Tiếp tục đào sâu
      for (const [key, value] of Object.entries(obj)) {
        if (value && typeof value === 'object') {
          results.push(...deepExtractQuestions(value, `${path}.${key}`));
        }
      }
    }

    return results;
  }

  // ── Gửi dữ liệu đã bắt được về content.js ───────────────
  function sendCapture(captureType, url, method, status, responseText) {
    let parsed = null;
    let isJSON = false;
    let encoding = 'unknown';

    // Thử parse JSON
    try {
      parsed = JSON.parse(responseText);
      isJSON = true;
      encoding = 'json';
    } catch (e) {
      // Thử Base64 decode
      try {
        const decoded = atob(responseText.trim());
        parsed = JSON.parse(decoded);
        isJSON = true;
        encoding = 'base64-json';
      } catch (e2) {
        encoding = 'non-json';
      }
    }

    const urlMatch = isExamRelatedURL(url);
    const dataMatch = isJSON && looksLikeExamData(parsed);

    // Chỉ gửi nếu URL hoặc data khả nghi
    if (!urlMatch && !dataMatch) return;

    const questions = isJSON ? deepExtractQuestions(parsed) : [];

    window.postMessage({
      source: SIGNATURE,
      type: 'CAPTURED_RESPONSE',
      data: {
        captureType,        // 'FETCH' | 'XHR'
        url,
        method,
        status,
        encoding,
        urlMatch,
        dataMatch,
        questionCount: questions.length,
        questions,
        rawJSON: parsed,
        rawText: responseText.substring(0, 100000), // giới hạn 100KB
        timestamp: Date.now(),
      },
    }, '*');
  }

  // ── HOOK: window.fetch ────────────────────────────────────
  const _fetch = window.fetch;

  window.fetch = async function (...args) {
    let url = '', method = 'GET';

    if (typeof args[0] === 'string') {
      url = args[0];
    } else if (args[0] instanceof Request) {
      url = args[0].url;
      method = args[0].method || 'GET';
    }
    if (args[1]?.method) method = args[1].method;

    try {
      const response = await _fetch.apply(this, args);
      const clone = response.clone();

      // Đọc body async — không block
      clone.text().then(text => {
        sendCapture('FETCH', url, method, response.status, text);
      }).catch(() => {});

      return response;
    } catch (err) {
      throw err;
    }
  };

  // ── HOOK: XMLHttpRequest ──────────────────────────────────
  const _xhrOpen = XMLHttpRequest.prototype.open;
  const _xhrSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._recon = { method, url };
    return _xhrOpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener('load', function () {
      try {
        const text = typeof this.responseText === 'string'
          ? this.responseText
          : JSON.stringify(this.response);
        sendCapture(
          'XHR',
          this._recon?.url || this.responseURL || '',
          this._recon?.method || 'GET',
          this.status,
          text
        );
      } catch (e) {}
    });
    return _xhrSend.apply(this, args);
  };

  // ── HOOK: WebSocket (bonus — một số nền tảng dùng WS) ────
  const _WebSocket = window.WebSocket;

  window.WebSocket = function (...args) {
    const ws = new _WebSocket(...args);

    ws.addEventListener('message', function (event) {
      try {
        const text = typeof event.data === 'string' ? event.data : '';
        if (text.length > 10) {
          sendCapture('WS', args[0] || 'websocket', 'WS', 0, text);
        }
      } catch (e) {}
    });

    return ws;
  };
  // Kế thừa prototype
  window.WebSocket.prototype = _WebSocket.prototype;
  window.WebSocket.CONNECTING = _WebSocket.CONNECTING;
  window.WebSocket.OPEN = _WebSocket.OPEN;
  window.WebSocket.CLOSING = _WebSocket.CLOSING;
  window.WebSocket.CLOSED = _WebSocket.CLOSED;

  // ── Thông báo đã hook thành công ──────────────────────────
  window.postMessage({
    source: SIGNATURE,
    type: 'HOOKS_READY',
    data: { timestamp: Date.now() },
  }, '*');

})();

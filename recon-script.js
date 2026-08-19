// ============================================================
// RECON SCRIPT v1.0 — Giai đoạn 2: Thám thính mạng
// Mục tiêu: Chặn bắt fetch/XHR, lọc API bài thi, phân tích response
// Cách dùng: Dán vào DevTools Console TRƯỚC KHI tải trang,
//            hoặc chạy qua Tampermonkey với @run-at document-start
// ============================================================

(function () {
  'use strict';

  // ── CONFIG ──────────────────────────────────────────────────
  const CONFIG = {
    // Từ khóa lọc URL khả nghi (thêm/bớt tuỳ nền tảng)
    SUSPECT_KEYWORDS: [
      '/api', '/exam', '/question', '/quiz', '/test',
      '/submit', '/answer', '/paper', '/assignment',
      '/attempt', '/start', '/result', '/score',
      'azota', 'getExam', 'getQuestion', 'loadTest',
      'examination', 'assessment',
    ],
    // Giới hạn log để tránh tràn console
    MAX_RESPONSE_LOG_SIZE: 50000, // ký tự
    // Bật/tắt log tất cả request (không chỉ suspect)
    LOG_ALL_REQUESTS: false,
  };

  // ── STORAGE — Lưu trữ tạm các capture ─────────────────────
  const CAPTURED = [];
  window.__RECON_CAPTURED = CAPTURED; // truy cập từ console: __RECON_CAPTURED

  // ── UTILITIES ──────────────────────────────────────────────
  const log = (tag, ...args) => console.log(
    `%c[RECON:${tag}]`,
    'color:#00ff88;font-weight:bold;background:#1a1a2e;padding:2px 6px;border-radius:3px;',
    ...args
  );
  const warn = (tag, ...args) => console.warn(`[RECON:${tag}]`, ...args);
  const error = (tag, ...args) => console.error(`[RECON:${tag}]`, ...args);

  function isSuspectURL(url) {
    const lower = url.toLowerCase();
    return CONFIG.SUSPECT_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()));
  }

  // ── PHASE 0: Kiểm tra Monkey Patching có sẵn ──────────────
  // Phát hiện xem nền tảng đã ghi đè fetch/XHR trước chúng ta chưa
  (function detectExistingMonkeyPatch() {
    log('DETECT', '═══ Kiểm tra Monkey Patching có sẵn ═══');

    // Check fetch
    const fetchStr = String(window.fetch);
    const fetchIsNative = fetchStr.includes('[native code]');
    if (fetchIsNative) {
      log('DETECT', '✅ window.fetch — NATIVE (chưa bị ghi đè)');
    } else {
      warn('DETECT', '⚠️ window.fetch — ĐÃ BỊ GHI ĐÈ! Source:');
      warn('DETECT', fetchStr.substring(0, 500));
    }

    // Check XMLHttpRequest.prototype.open
    const xhrOpenStr = String(XMLHttpRequest.prototype.open);
    const xhrOpenNative = xhrOpenStr.includes('[native code]');
    if (xhrOpenNative) {
      log('DETECT', '✅ XHR.prototype.open — NATIVE');
    } else {
      warn('DETECT', '⚠️ XHR.prototype.open — ĐÃ BỊ GHI ĐÈ! Source:');
      warn('DETECT', xhrOpenStr.substring(0, 500));
    }

    // Check XMLHttpRequest.prototype.send
    const xhrSendStr = String(XMLHttpRequest.prototype.send);
    const xhrSendNative = xhrSendStr.includes('[native code]');
    if (xhrSendNative) {
      log('DETECT', '✅ XHR.prototype.send — NATIVE');
    } else {
      warn('DETECT', '⚠️ XHR.prototype.send — ĐÃ BỊ GHI ĐÈ! Source:');
      warn('DETECT', xhrSendStr.substring(0, 500));
    }

    // Check for MutationObserver traps (bonus intel)
    const moStr = String(MutationObserver);
    if (!moStr.includes('[native code]')) {
      warn('DETECT', '⚠️ MutationObserver cũng bị ghi đè — có thể có bẫy DOM');
    }

    // Check for debugger traps / devtools detection
    try {
      const perfEntries = performance.getEntriesByType('resource');
      log('DETECT', `📊 Đã tải ${perfEntries.length} resource entries (dùng để cross-ref)`);
    } catch (e) {
      warn('DETECT', 'Không truy cập được Performance API');
    }

    log('DETECT', '═══ Kết thúc kiểm tra ═══\n');
  })();

  // ── PHASE 1: Encoding / Encryption Detection ──────────────
  function analyzeEncoding(text, url) {
    const analysis = {
      isJSON: false,
      isBase64: false,
      isPossiblyEncrypted: false,
      encoding: 'plaintext',
      notes: [],
    };

    // Test JSON parse
    try {
      JSON.parse(text);
      analysis.isJSON = true;
      analysis.encoding = 'JSON';
    } catch (e) {
      // Không phải JSON thuần
    }

    // Test Base64
    const base64Regex = /^[A-Za-z0-9+/]+=*$/;
    const trimmed = text.trim();
    if (!analysis.isJSON && base64Regex.test(trimmed) && trimmed.length > 20) {
      analysis.isBase64 = true;
      analysis.encoding = 'Base64 (probable)';
      analysis.notes.push('Thử decode: atob(response)');

      // Thử decode
      try {
        const decoded = atob(trimmed);
        try {
          JSON.parse(decoded);
          analysis.notes.push('✅ Base64 → JSON decode THÀNH CÔNG');
          analysis.encoding = 'Base64-encoded JSON';
        } catch (e2) {
          analysis.notes.push('Base64 decode OK nhưng không phải JSON');
        }
      } catch (e) {
        analysis.notes.push('Base64 decode THẤT BẠI — có thể là mã hóa khác');
      }
    }

    // Detect possible encryption (high entropy, non-readable chars)
    if (!analysis.isJSON && !analysis.isBase64) {
      const nonPrintable = (text.match(/[^\x20-\x7E\s]/g) || []).length;
      const ratio = nonPrintable / text.length;
      if (ratio > 0.3) {
        analysis.isPossiblyEncrypted = true;
        analysis.encoding = 'Encrypted / Binary';
        analysis.notes.push(`${(ratio * 100).toFixed(1)}% ký tự non-printable — khả năng AES hoặc binary`);
      }
    }

    // Check cho các pattern mã hoá phổ biến
    if (text.includes('U2Fsd') || text.includes('CryptoJS')) {
      analysis.notes.push('🔐 Phát hiện dấu hiệu CryptoJS (AES)');
      analysis.isPossiblyEncrypted = true;
    }
    if (text.includes('"iv"') && text.includes('"ct"')) {
      analysis.notes.push('🔐 Phát hiện cấu trúc {iv, ct} — có thể AES-CBC');
      analysis.isPossiblyEncrypted = true;
    }

    return analysis;
  }

  // ── PHASE 2: JSON Structure Mapper ────────────────────────
  function mapStructure(obj, depth = 0, maxDepth = 4) {
    if (depth > maxDepth) return '...';
    if (obj === null) return 'null';
    if (Array.isArray(obj)) {
      if (obj.length === 0) return '[]';
      return `Array(${obj.length}) [ ${mapStructure(obj[0], depth + 1, maxDepth)} , ... ]`;
    }
    if (typeof obj === 'object') {
      const keys = Object.keys(obj);
      const mapped = {};
      for (const key of keys.slice(0, 15)) { // giới hạn 15 key
        mapped[key] = typeof obj[key] === 'object'
          ? mapStructure(obj[key], depth + 1, maxDepth)
          : `<${typeof obj[key]}> ${String(obj[key]).substring(0, 80)}`;
      }
      if (keys.length > 15) mapped['...'] = `(+${keys.length - 15} keys)`;
      return mapped;
    }
    return `<${typeof obj}>`;
  }

  // ── PHASE 3: Process & Log Captured Response ──────────────
  function processCapture(type, url, status, responseText, method = 'GET') {
    const suspect = isSuspectURL(url);
    if (!suspect && !CONFIG.LOG_ALL_REQUESTS) return;

    const timestamp = new Date().toISOString();
    const truncated = responseText.length > CONFIG.MAX_RESPONSE_LOG_SIZE
      ? responseText.substring(0, CONFIG.MAX_RESPONSE_LOG_SIZE) + '...[TRUNCATED]'
      : responseText;

    const encoding = analyzeEncoding(truncated, url);

    const entry = {
      timestamp,
      type,        // 'FETCH' hoặc 'XHR'
      method,
      url,
      status,
      encoding: encoding.encoding,
      encodingNotes: encoding.notes,
      responsePreview: truncated.substring(0, 300),
      fullResponse: truncated,
      structure: null,
    };

    // Parse JSON nếu có thể
    if (encoding.isJSON) {
      try {
        const parsed = JSON.parse(truncated);
        entry.structure = mapStructure(parsed);
        entry.parsedData = parsed;
      } catch (e) { /* bỏ qua */ }
    }

    CAPTURED.push(entry);

    // ── Console Output ──
    const icon = suspect ? '🎯' : '📡';
    const label = suspect ? 'SUSPECT' : 'NORMAL';

    console.groupCollapsed(
      `%c${icon} [RECON:${label}] ${type} ${method} ${status} → ${url}`,
      suspect
        ? 'color:#ff6b6b;font-weight:bold;font-size:12px;'
        : 'color:#888;'
    );

    log('URL', url);
    log('METHOD', method);
    log('STATUS', status);
    log('ENCODING', encoding.encoding);
    if (encoding.notes.length > 0) {
      warn('ENCODING-NOTES', encoding.notes.join(' | '));
    }
    if (entry.structure) {
      log('STRUCTURE', entry.structure);
    }
    log('RESPONSE-PREVIEW', truncated.substring(0, 500));
    if (suspect) {
      log('FULL-RESPONSE', truncated);
    }

    console.groupEnd();
  }

  // ── HOOK 1: window.fetch ──────────────────────────────────
  const originalFetch = window.fetch;

  window.fetch = async function (...args) {
    const request = args[0];
    let url = '';
    let method = 'GET';

    if (typeof request === 'string') {
      url = request;
    } else if (request instanceof Request) {
      url = request.url;
      method = request.method || 'GET';
    } else if (request && request.url) {
      url = request.url;
    }

    if (args[1] && args[1].method) {
      method = args[1].method;
    }

    try {
      const response = await originalFetch.apply(this, args);

      // Clone response để đọc body mà không ảnh hưởng luồng gốc
      const clone = response.clone();

      // Đọc body bất đồng bộ — không block luồng chính
      clone.text().then(text => {
        processCapture('FETCH', url, response.status, text, method);
      }).catch(err => {
        // Một số response không đọc được (opaque, etc.)
      });

      return response; // trả response gốc nguyên vẹn
    } catch (err) {
      error('FETCH', `Lỗi fetch ${url}:`, err);
      throw err;
    }
  };

  log('HOOK', '✅ window.fetch đã được hook');

  // ── HOOK 2: XMLHttpRequest ────────────────────────────────
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__recon_url = url;
    this.__recon_method = method;
    return originalXHROpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener('load', function () {
      try {
        const responseText = this.responseText || this.response || '';
        processCapture(
          'XHR',
          this.__recon_url || this.responseURL || '(unknown)',
          this.status,
          typeof responseText === 'string' ? responseText : JSON.stringify(responseText),
          this.__recon_method || 'GET'
        );
      } catch (e) {
        // Bỏ qua lỗi đọc response
      }
    });
    return originalXHRSend.apply(this, args);
  };

  log('HOOK', '✅ XMLHttpRequest đã được hook');

  // ── HELPER: Export captured data ──────────────────────────
  window.__RECON_EXPORT = function () {
    const suspects = CAPTURED.filter(c => isSuspectURL(c.url));
    const data = JSON.stringify(suspects, null, 2);

    log('EXPORT', `Xuất ${suspects.length} suspect captures (tổng ${CAPTURED.length} requests)`);
    console.log(data);

    // Copy vào clipboard nếu có thể
    try {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(data).then(() => {
          log('EXPORT', '📋 Đã copy vào clipboard!');
        });
      }
    } catch (e) { /* clipboard không khả dụng */ }

    return suspects;
  };

  window.__RECON_EXPORT_ALL = function () {
    const data = JSON.stringify(CAPTURED, null, 2);
    log('EXPORT', `Xuất TẤT CẢ ${CAPTURED.length} requests`);
    console.log(data);
    return CAPTURED;
  };

  // ── HELPER: Summary dashboard ─────────────────────────────
  window.__RECON_SUMMARY = function () {
    console.clear();
    log('SUMMARY', '═══════════════════════════════════════');
    log('SUMMARY', `📊 Tổng requests bắt được: ${CAPTURED.length}`);

    const suspects = CAPTURED.filter(c => isSuspectURL(c.url));
    log('SUMMARY', `🎯 Requests khả nghi: ${suspects.length}`);

    const encodings = {};
    suspects.forEach(s => {
      encodings[s.encoding] = (encodings[s.encoding] || 0) + 1;
    });
    log('SUMMARY', '📦 Phân loại encoding:', encodings);

    suspects.forEach((s, i) => {
      console.groupCollapsed(`🎯 #${i + 1}: ${s.method} ${s.url}`);
      log('STATUS', s.status);
      log('ENCODING', s.encoding);
      if (s.structure) log('STRUCTURE', s.structure);
      log('PREVIEW', s.responsePreview);
      console.groupEnd();
    });

    log('SUMMARY', '═══════════════════════════════════════');
    log('SUMMARY', 'Dùng __RECON_EXPORT() để xuất data khả nghi');
    log('SUMMARY', 'Dùng __RECON_EXPORT_ALL() để xuất tất cả');
  };

  // ── BOOT MESSAGE ──────────────────────────────────────────
  console.log(
    '%c🔍 RECON SCRIPT v1.0 — Đang lắng nghe...',
    'color:#00ff88;font-size:16px;font-weight:bold;background:#1a1a2e;padding:8px 16px;border-radius:6px;'
  );
  console.log(
    '%cCommands: __RECON_SUMMARY() | __RECON_EXPORT() | __RECON_EXPORT_ALL()',
    'color:#888;font-size:11px;'
  );

})();

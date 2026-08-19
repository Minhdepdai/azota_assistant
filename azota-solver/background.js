// ═══════════════════════════════════════════════════════════════
// BACKGROUND.JS — Service Worker
// 1. Nhận dữ liệu bài thi từ content script
// 2. Phân tích & cấu trúc thành prompt
// 3. Gọi Gemini API để giải
// 4. Gửi đáp án về content script
// ═══════════════════════════════════════════════════════════════

// ── Config ──────────────────────────────────────────────────
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// ── State ───────────────────────────────────────────────────
let lastProcessedHash = '';
let processingQueue = [];
let isProcessing = false;

// ── Lắng nghe messages từ content script ────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  switch (message.action) {
    case 'DIAGNOSTICS':
      console.log('[BG] Diagnostics từ tab', tabId, ':', message.data);
      sendResponse({ ok: true });
      break;

    case 'EXAM_DATA_CAPTURED':
      console.log('[BG] Nhận dữ liệu bài thi:', message.data.url);
      handleExamData(message.data, tabId);
      sendResponse({ ok: true });
      break;

    case 'GET_ANSWERS':
      // Popup yêu cầu lấy đáp án hiện tại
      chrome.storage.local.get(['currentAnswers', 'capturedLog'], (result) => {
        sendResponse({
          answers: result.currentAnswers || [],
          log: result.capturedLog || [],
        });
      });
      return true; // async

    case 'SET_API_KEY':
      chrome.storage.local.set({ geminiApiKey: message.data.key }, () => {
        sendResponse({ ok: true });
      });
      return true;

    case 'GET_API_KEY':
      chrome.storage.local.get(['geminiApiKey'], (result) => {
        sendResponse({ key: result.geminiApiKey || '' });
      });
      return true;

    case 'REPROCESS':
      // Yêu cầu xử lý lại dữ liệu đã bắt
      chrome.storage.local.get(['lastRawCapture'], (result) => {
        if (result.lastRawCapture) {
          handleExamData(result.lastRawCapture, tabId);
        }
        sendResponse({ ok: true });
      });
      return true;

    default:
      sendResponse({ ok: false, error: 'Unknown action' });
  }

  return true;
});

// ── Xử lý dữ liệu bài thi ─────────────────────────────────
async function handleExamData(capture, tabId) {
  // Lưu log
  chrome.storage.local.get(['capturedLog'], (result) => {
    const log = result.capturedLog || [];
    log.push({
      timestamp: Date.now(),
      url: capture.url,
      method: capture.method,
      encoding: capture.encoding,
      questionCount: capture.questionCount,
      urlMatch: capture.urlMatch,
      dataMatch: capture.dataMatch,
    });
    // Giữ tối đa 50 entries
    if (log.length > 50) log.splice(0, log.length - 50);
    chrome.storage.local.set({ capturedLog: log });
  });

  // Lưu raw capture cho reprocess
  chrome.storage.local.set({ lastRawCapture: capture });

  // Nếu không có câu hỏi nào được phát hiện, vẫn thử gửi raw JSON cho Gemini
  // vì heuristic có thể bỏ sót
  const rawJSON = capture.rawJSON;
  if (!rawJSON) {
    notifyTab(tabId, 'PROCESSING_STATUS', { text: '⚠️ Response không phải JSON, bỏ qua' });
    return;
  }

  // Tránh xử lý trùng lặp
  const hash = simpleHash(JSON.stringify(rawJSON).substring(0, 5000));
  if (hash === lastProcessedHash) {
    console.log('[BG] Bỏ qua dữ liệu trùng lặp');
    return;
  }
  lastProcessedHash = hash;

  // Gửi đến Gemini
  await processWithGemini(rawJSON, capture.questions, tabId);
}

// ── Xử lý với Gemini API ───────────────────────────────────
async function processWithGemini(rawJSON, extractedQuestions, tabId) {
  // Lấy API key
  const { geminiApiKey } = await chrome.storage.local.get(['geminiApiKey']);

  if (!geminiApiKey) {
    notifyTab(tabId, 'ERROR', { error: 'Chưa cài API Key! Mở popup extension để nhập.' });
    return;
  }

  notifyTab(tabId, 'PROCESSING_STATUS', { text: '🧠 Đang gửi cho Gemini AI...' });

  // Cấu trúc prompt
  const prompt = buildPrompt(rawJSON, extractedQuestions);

  try {
    const response = await fetch(`${GEMINI_ENDPOINT}?key=${geminiApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }],
        }],
        generationConfig: {
          temperature: 0.1,      // Thấp để trả lời chính xác
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
        },
        systemInstruction: {
          parts: [{
            text: `Bạn là chuyên gia giải bài thi. Nhiệm vụ: phân tích dữ liệu JSON từ hệ thống thi trực tuyến và trả lời TẤT CẢ câu hỏi.

Quy tắc:
- Với trắc nghiệm: trả về ký hiệu đáp án đúng (A/B/C/D hoặc số thứ tự)
- Với điền đáp án: trả về đáp án ngắn gọn, chính xác
- Với tự luận: trả lời ngắn gọn nhất có thể
- Với đúng/sai: trả về "Đúng" hoặc "Sai"
- Trả lời bằng tiếng Việt

Trả về JSON array, mỗi phần tử có dạng:
{
  "questionNumber": <số thứ tự>,
  "questionPreview": "<20 ký tự đầu của câu hỏi>",
  "answer": "<đáp án>",
  "explanation": "<giải thích ngắn nếu cần>"
}`
          }],
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[BG] Gemini API error:', response.status, errText);
      notifyTab(tabId, 'ERROR', {
        error: `Gemini API lỗi ${response.status}: ${errText.substring(0, 200)}`,
      });
      return;
    }

    const result = await response.json();

    // Trích xuất text từ Gemini response
    const aiText = result?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log('[BG] Gemini raw response:', aiText);

    // Parse đáp án
    let answers = [];
    try {
      answers = JSON.parse(aiText);
      if (!Array.isArray(answers)) {
        answers = [answers];
      }
    } catch (e) {
      // Nếu không parse được JSON, thử trích xuất thủ công
      answers = parseTextAnswers(aiText);
    }

    // Lưu đáp án
    chrome.storage.local.set({ currentAnswers: answers });

    // Gửi về content script
    notifyTab(tabId, 'ANSWERS_READY', { answers });

    console.log('[BG] ✅ Đã gửi', answers.length, 'đáp án về tab', tabId);

  } catch (err) {
    console.error('[BG] Lỗi gọi Gemini:', err);
    notifyTab(tabId, 'ERROR', { error: `Lỗi kết nối Gemini: ${err.message}` });
  }
}

// ── Xây dựng prompt cho Gemini ──────────────────────────────
function buildPrompt(rawJSON, extractedQuestions) {
  let prompt = `Dưới đây là dữ liệu JSON thô từ API của hệ thống thi trực tuyến Azota.\n`;
  prompt += `Hãy phân tích cấu trúc, tìm TẤT CẢ câu hỏi và trả lời chúng.\n\n`;

  if (extractedQuestions && extractedQuestions.length > 0) {
    prompt += `=== CÁC CÂU HỎI ĐÃ TRÍCH XUẤT (${extractedQuestions.length} câu) ===\n`;
    extractedQuestions.forEach((q, i) => {
      prompt += `\n--- Câu ${i + 1} (path: ${q.path}) ---\n`;
      prompt += JSON.stringify(q.data, null, 2).substring(0, 3000);
    });
    prompt += `\n\n`;
  }

  // Gửi kèm raw JSON để Gemini tự phân tích thêm nếu heuristic bỏ sót
  const rawStr = JSON.stringify(rawJSON, null, 2);
  const truncatedRaw = rawStr.substring(0, 30000); // Giới hạn ~30KB

  prompt += `=== RAW JSON DATA ===\n`;
  prompt += truncatedRaw;

  if (rawStr.length > 30000) {
    prompt += `\n...[TRUNCATED — tổng ${rawStr.length} ký tự]`;
  }

  return prompt;
}

// ── Fallback: parse text answers nếu JSON parse thất bại ────
function parseTextAnswers(text) {
  const lines = text.split('\n').filter(l => l.trim());
  const answers = [];

  const patterns = [
    /[Cc]âu\s*(\d+)\s*[:\.]\s*(.+)/,
    /(\d+)\s*[\.\)]\s*(.+)/,
    /[Qq]\s*(\d+)\s*[:\.]\s*(.+)/,
  ];

  for (const line of lines) {
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        answers.push({
          questionNumber: parseInt(match[1]),
          questionPreview: '',
          answer: match[2].trim(),
          explanation: '',
        });
        break;
      }
    }
  }

  // Nếu không match pattern nào, trả về toàn bộ text như 1 answer
  if (answers.length === 0 && text.trim()) {
    answers.push({
      questionNumber: 0,
      questionPreview: 'Toàn bộ bài thi',
      answer: text.trim().substring(0, 2000),
      explanation: '',
    });
  }

  return answers;
}

// ── Helper: gửi message đến tab ────────────────────────────
function notifyTab(tabId, action, data) {
  if (!tabId) return;
  try {
    chrome.tabs.sendMessage(tabId, { action, data }).catch(() => {});
  } catch (e) {
    // Tab có thể đã đóng
  }
}

// ── Helper: simple hash ────────────────────────────────────
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}

// ── Startup log ─────────────────────────────────────────────
console.log('[AzotaSolver BG] Service Worker started');

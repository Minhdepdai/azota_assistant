// background.js - Tương thích kép 100% Chromium (Kiwi / Chrome / Edge) và Gecko (Firefox Android / Desktop)

console.log('📸 Background service worker started (Universal Engine: Kiwi + Firefox Ready)');

const api = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;

let captureHistory = [];
let currentGeminiKeyIndex = 0;
let currentOpenAIKeyIndex = 0;

const DEFAULT_DOUBLE_CHECK_PROMPT = `Bạn là chuyên gia thẩm định và soát bài cấp cao. Dưới đây là ảnh chụp đề bài gốc và Lời giải sơ bộ số 1 từ AI:\n\n--- [LỜI GIẢI SƠ BỘ] ---\n{INITIAL_ANSWER}\n----------------------\n\nHãy đọc kỹ từng câu chữ, hình vẽ, số liệu trong ảnh và soát xét lại từng bước giải trên. Chỉ ra lời giải trước có đúng 100% không, có bị dính bẫy hay sai sót nào không. Cuối cùng, hãy đưa ra đáp án chính xác và chắc chắn nhất.`;

// Nạp history từ storage khi worker khởi động
api.storage.local.get('captureHistory', (data) => {
    if (data && data.captureHistory) {
        captureHistory = data.captureHistory;
    }
});

// ==================== UNIVERSAL HELPERS CHO KIWI & FIREFOX ====================

async function executeScriptUniversal(tabId, func, args = []) {
    if (api.scripting && api.scripting.executeScript) {
        const results = await api.scripting.executeScript({
            target: { tabId },
            func: func,
            args: args
        });
        return results && results[0] ? results[0].result : null;
    } else if (api.tabs && api.tabs.executeScript) {
        const code = `(${func.toString()})(${args.map(a => JSON.stringify(a)).join(',')})`;
        const results = await new Promise((resolve, reject) => {
            api.tabs.executeScript(tabId, { code }, (res) => {
                if (api.runtime.lastError) reject(new Error(api.runtime.lastError.message));
                else resolve(res);
            });
        });
        return results && results[0] !== undefined ? results[0] : null;
    }
    throw new Error('Trình duyệt không hỗ trợ scripting API');
}

// BỘ CHỤP NATIVE TỰ TÌM WINDOW ID (FIX TRIỆT ĐỂ LỖI 'No active web contents' TRÊN KIWI BROWSER)
function captureTabUniversal(targetWindowId = null) {
    return new Promise(async (resolve, reject) => {
        const captureFn = (api.tabs && api.tabs.captureVisibleTab) ? api.tabs.captureVisibleTab.bind(api.tabs) : null;
        if (!captureFn) {
            reject(new Error('Trình duyệt không hỗ trợ captureVisibleTab'));
            return;
        }

        // Danh sách các windowId ứng viên để thử nghiệm
        const candidateWindowIds = [];

        // 1. windowId được truyền trực tiếp từ sender.tab
        if (targetWindowId !== null && targetWindowId !== undefined) {
            candidateWindowIds.push(targetWindowId);
        }

        // 2. windowId lấy từ active tab
        try {
            const activeTabs = await api.tabs.query({ active: true });
            if (activeTabs) {
                activeTabs.forEach(t => {
                    if (t.windowId !== undefined && !candidateWindowIds.includes(t.windowId)) {
                        candidateWindowIds.push(t.windowId);
                    }
                });
            }
        } catch (e) {}

        // 3. windowId lấy từ windows API
        try {
            if (api.windows && api.windows.getAll) {
                const wins = await api.windows.getAll();
                if (wins) {
                    wins.forEach(w => {
                        if (w.id !== undefined && !candidateWindowIds.includes(w.id)) {
                            candidateWindowIds.push(w.id);
                        }
                    });
                }
            }
        } catch (e) {}

        // 4. Null fallback (cho Desktop Chrome / Firefox)
        candidateWindowIds.push(null);

        let lastErr = null;
        for (const winId of candidateWindowIds) {
            try {
                const dataUrl = await new Promise((res, rej) => {
                    const callback = (result) => {
                        if (api.runtime.lastError || !result) {
                            rej(new Error(api.runtime.lastError?.message || 'Empty capture'));
                        } else {
                            res(result);
                        }
                    };

                    if (winId !== null && winId !== undefined) {
                        captureFn(winId, { format: 'png' }, callback);
                    } else {
                        captureFn({ format: 'png' }, callback);
                    }
                });

                if (dataUrl) {
                    resolve(dataUrl);
                    return;
                }
            } catch (err) {
                lastErr = err;
            }
        }

        reject(lastErr || new Error('No active web contents to capture'));
    });
}

// Ghép các slice ảnh lại OffscreenCanvas
async function stitchCaptures(captures, totalWidth, totalHeight, dpr) {
    const canvasWidth = Math.max(1, Math.round(totalWidth * dpr));
    const canvasHeight = Math.max(1, Math.round(totalHeight * dpr));
    
    const canvas = new OffscreenCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    for (const cap of captures) {
        const response = await fetch(cap.dataUrl);
        const blob = await response.blob();
        const bitmap = await createImageBitmap(blob);

        const dw = Math.round(totalWidth * dpr);
        const sw = Math.min(bitmap.width, dw);

        if (cap.isLastCrop) {
            const sy = Math.max(0, Math.round((cap.viewportHeight - cap.sliceHeight) * dpr));
            const sh = Math.min(bitmap.height - sy, Math.round(cap.sliceHeight * dpr));
            const dy = Math.round(cap.destY * dpr);
            const dh = sh;

            ctx.drawImage(bitmap, 0, sy, sw, sh, 0, dy, dw, dh);
        } else {
            const sh = Math.min(bitmap.height, Math.round(cap.sliceHeight * dpr));
            const dy = Math.round(cap.destY * dpr);
            const dh = sh;

            ctx.drawImage(bitmap, 0, 0, sw, sh, 0, dy, dw, dh);
        }
    }

    const finalBlob = await canvas.convertToBlob({ type: 'image/png' });
    const arrayBuffer = await finalBlob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i += 8192) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + 8192, len)));
    }
    return `data:image/png;base64,${btoa(binary)}`;
}

// Chụp cuộn trang Native 100% với windowId chỉ định
async function captureScrollNative(tabId, mode = 'third', initialWindowId = null) {
    let originalScrollX = 0, originalScrollY = 0;
    
    // Lấy chính xác windowId của tab từ hệ thống
    let targetWinId = initialWindowId;
    try {
        const tabInfo = await api.tabs.get(tabId);
        if (tabInfo && tabInfo.windowId !== undefined) {
            targetWinId = tabInfo.windowId;
        }
    } catch (e) {}

    try {
        const dim = await executeScriptUniversal(tabId, () => {
            const clientWidth = document.documentElement.clientWidth || window.innerWidth;
            const scrollHeight = Math.max(
                document.documentElement.scrollHeight,
                document.body.scrollHeight,
                window.innerHeight
            );
            const isFull = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement);
            return {
                viewportWidth: window.innerWidth,
                viewportHeight: window.innerHeight,
                totalWidth: clientWidth,
                totalHeight: scrollHeight,
                dpr: window.devicePixelRatio || 1,
                originalScrollX: window.scrollX || 0,
                originalScrollY: window.scrollY || 0,
                isFullscreen: isFull
            };
        });

        if (!dim) throw new Error('Không thể lấy kích thước trang web');

        const { viewportWidth, viewportHeight, totalWidth, totalHeight, dpr, isFullscreen } = dim;
        originalScrollX = dim.originalScrollX;
        originalScrollY = dim.originalScrollY;

        // Nếu ở chế độ Fullscreen hoặc trang cố định không cuộn
        if (isFullscreen || totalHeight <= viewportHeight + 10) {
            await executeScriptUniversal(tabId, () => {
                document.querySelectorAll('.capture-temp-ui').forEach(el => {
                    el.style.opacity = '0';
                });
            });

            await new Promise(r => setTimeout(r, 120));
            const singleCap = await captureTabUniversal(targetWinId);
            return singleCap;
        }

        let startY = originalScrollY;
        let targetCaptureHeight = totalHeight;

        if (mode === 'third') {
            const oneThird = Math.round(totalHeight / 3);
            targetCaptureHeight = Math.min(oneThird, totalHeight - startY);
            targetCaptureHeight = Math.max(targetCaptureHeight, Math.min(viewportHeight, totalHeight - startY));
        } else if (mode === 'visible') {
            targetCaptureHeight = Math.min(viewportHeight, totalHeight - startY);
        }

        const captures = [];
        let currentY = startY;
        let accumulatedHeight = 0;

        while (accumulatedHeight < targetCaptureHeight) {
            const isFirstSlice = (accumulatedHeight === 0);
            const remainingHeight = targetCaptureHeight - accumulatedHeight;

            let scrollY = currentY;
            let isLastCrop = false;
            let sliceHeight = viewportHeight;

            if (remainingHeight <= viewportHeight) {
                sliceHeight = remainingHeight;
                if (!isFirstSlice) {
                    isLastCrop = true;
                    scrollY = Math.max(0, startY + targetCaptureHeight - viewportHeight);
                }
            }

            await executeScriptUniversal(tabId, (y, isFirst) => {
                window.scrollTo(0, y);
                window.dispatchEvent(new Event('scroll'));

                document.querySelectorAll('.capture-temp-ui').forEach(el => {
                    el.style.opacity = '0';
                });

                const headers = document.querySelectorAll('header, nav, [role="banner"]');
                headers.forEach(el => {
                    if (!isFirst) {
                        if (!el.dataset.prevVis) el.dataset.prevVis = el.style.visibility || 'visible';
                        el.style.visibility = 'hidden';
                    }
                });
            }, [scrollY, isFirstSlice]);

            await new Promise(r => setTimeout(r, 260));

            const dataUrl = await captureTabUniversal(targetWinId);

            if (dataUrl) {
                captures.push({
                    dataUrl,
                    destY: accumulatedHeight,
                    viewportHeight,
                    sliceHeight,
                    isLastCrop
                });
            }

            accumulatedHeight += sliceHeight;
            currentY += viewportHeight;

            if (isLastCrop || accumulatedHeight >= targetCaptureHeight) {
                break;
            }
        }

        if (captures.length === 1) {
            return captures[0].dataUrl;
        }

        return await stitchCaptures(captures, totalWidth, targetCaptureHeight, dpr);

    } finally {
        try {
            await executeScriptUniversal(tabId, (origX, origY) => {
                window.scrollTo(origX, origY);
                document.querySelectorAll('.capture-temp-ui').forEach(el => {
                    el.style.opacity = '1';
                    el.style.display = '';
                });
                document.querySelectorAll('header, nav, [role="banner"]').forEach(el => {
                    if (el.dataset.prevVis) {
                        el.style.visibility = el.dataset.prevVis === 'visible' ? '' : el.dataset.prevVis;
                        delete el.dataset.prevVis;
                    }
                });
            }, [originalScrollX, originalScrollY]);
        } catch (restoreErr) {
            console.warn('Lỗi restore DOM:', restoreErr);
        }
    }
}

// ==================== CẬP NHẬT BỘ ĐẾM TOKEN ====================

async function recordTokenUsage(promptTokens, candidateTokens, totalTokens) {
    const data = await api.storage.local.get('tokenStats');
    const stats = data.tokenStats || {
        totalTokens: 0,
        promptTokens: 0,
        candidateTokens: 0,
        totalRequests: 0
    };

    const p = promptTokens || 0;
    const c = candidateTokens || 0;
    const t = totalTokens || (p + c);

    stats.promptTokens += p;
    stats.candidateTokens += c;
    stats.totalTokens += t;
    stats.totalRequests += 1;

    await api.storage.local.set({ tokenStats: stats });
}

// ==================== NÉN & TỐI ƯU ẢNH TRƯỚC KHI GỬI AI ====================

async function optimizeImageForAI(imageDataUrl) {
    try {
        const response = await fetch(imageDataUrl);
        const blob = await response.blob();
        const bitmap = await createImageBitmap(blob);

        let width = bitmap.width;
        let height = bitmap.height;
        const maxDimension = 1600;

        if (width > maxDimension || height > maxDimension) {
            if (width > height) {
                height = Math.round((height * maxDimension) / width);
                width = maxDimension;
            } else {
                width = Math.round((width * maxDimension) / height);
                height = maxDimension;
            }
        }

        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(bitmap, 0, 0, width, height);

        const jpegBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.88 });
        const arrayBuffer = await jpegBlob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        const len = bytes.byteLength;
        for (let i = 0; i < len; i += 8192) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + 8192, len)));
        }
        return {
            base64: btoa(binary),
            mimeType: 'image/jpeg'
        };
    } catch (e) {
        return {
            base64: imageDataUrl.replace(/^data:image\/\w+;base64,/, ''),
            mimeType: 'image/png'
        };
    }
}

function getGeminiModelCandidates(selectedModel) {
    const primary = selectedModel || 'gemini-3.7-flash';
    return [
        primary,
        'gemini-2.0-flash-thinking-exp-01-21',
        'gemini-2.0-flash',
        'gemini-1.5-flash'
    ];
}

// ==================== GỌI GOOGLE GEMINI VISION API ====================

async function callGeminiVision(optimizedImage, prompt, config, overrideModel = null) {
    let keys = config.geminiApiKeys;
    if (!keys || !Array.isArray(keys) || keys.length === 0) {
        if (config.geminiApiKey) {
            keys = [config.geminiApiKey];
        } else {
            throw new Error('Chưa cài đặt Gemini API Key! Vui lòng mở Cài đặt AI để nhập API Key.');
        }
    }

    const selectedModel = overrideModel || config.geminiModel || 'gemini-3.7-flash';
    const modelCandidates = getGeminiModelCandidates(selectedModel);

    const requestBody = {
        contents: [
            {
                parts: [
                    { text: prompt },
                    {
                        inline_data: {
                            mime_type: optimizedImage.mimeType,
                            data: optimizedImage.base64
                        }
                    }
                ]
            }
        ],
        generationConfig: {
            temperature: 0.1,
            topP: 0.95,
            maxOutputTokens: 8192
        }
    };

    let lastError = null;
    const totalKeys = keys.length;

    for (let attempt = 0; attempt < totalKeys; attempt++) {
        const keyIdx = (currentGeminiKeyIndex + attempt) % totalKeys;
        const currentKey = keys[keyIdx].trim();
        const maskedKey = currentKey.substring(0, 6) + '...' + currentKey.substring(currentKey.length - 4);

        for (const model of modelCandidates) {
            try {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${currentKey}`;
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody)
                });

                const data = await response.json();

                if (!response.ok) {
                    const status = response.status;
                    const errorMsg = data?.error?.message || `HTTP ${status}`;
                    if (status === 404) continue;
                    lastError = new Error(`Key #${keyIdx + 1} (${maskedKey}): ${errorMsg}`);
                    break;
                }

                const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (!answer) throw new Error('Gemini không trả về câu trả lời.');

                const usage = data?.usageMetadata || {};
                const p = usage.promptTokenCount || 0;
                const c = usage.candidatesTokenCount || 0;
                const t = usage.totalTokenCount || (p + c);

                await recordTokenUsage(p, c, t);
                currentGeminiKeyIndex = keyIdx;

                return {
                    answer: answer,
                    usage: { promptTokenCount: p, candidatesTokenCount: c, totalTokenCount: t },
                    keyIndex: keyIdx + 1,
                    totalKeys: totalKeys,
                    model: selectedModel,
                    provider: 'Gemini'
                };
            } catch (err) {
                lastError = err;
            }
        }
    }

    throw new Error(`Gemini: ${lastError?.message || 'Không kết nối được'}`);
}

// ==================== GỌI OPENAI COMPATIBLE VISION API ====================

async function callOpenAIVision(optimizedImage, prompt, config, overrideModel = null) {
    let keys = config.openaiApiKeys;
    if (!keys || !Array.isArray(keys) || keys.length === 0) {
        throw new Error('Chưa cài đặt OpenAI / Proxy API Key! Vui lòng mở Cài đặt AI.');
    }

    let baseUrl = (config.openaiBaseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
    const model = overrideModel || config.openaiModel || 'gpt-5.6';
    const temp = (config.openaiTemperature !== undefined && config.openaiTemperature !== '') ? Number(config.openaiTemperature) : 0.2;
    const maxTokens = (config.openaiMaxTokens !== undefined && config.openaiMaxTokens !== '') ? Number(config.openaiMaxTokens) : 4096;

    const requestBody = {
        model: model,
        messages: [
            {
                role: 'user',
                content: [
                    { type: 'text', text: prompt },
                    {
                        type: 'image_url',
                        image_url: {
                            url: `data:${optimizedImage.mimeType};base64,${optimizedImage.base64}`
                        }
                    }
                ]
            }
        ],
        temperature: temp,
        max_tokens: maxTokens
    };

    let lastError = null;
    const totalKeys = keys.length;

    for (let attempt = 0; attempt < totalKeys; attempt++) {
        const keyIdx = (currentOpenAIKeyIndex + attempt) % totalKeys;
        const currentKey = keys[keyIdx].trim();
        const maskedKey = currentKey.substring(0, 6) + '...' + currentKey.substring(currentKey.length - 4);

        try {
            const url = `${baseUrl}/chat/completions`;
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${currentKey}`
                },
                body: JSON.stringify(requestBody)
            });

            const data = await response.json();

            if (!response.ok) {
                const errorMsg = data?.error?.message || `HTTP ${response.status}`;
                lastError = new Error(`Key #${keyIdx + 1} (${maskedKey}): ${errorMsg}`);
                continue;
            }

            const answer = data?.choices?.[0]?.message?.content;
            if (!answer) throw new Error('OpenAI không trả về nội dung câu trả lời.');

            const usage = data?.usage || {};
            const p = usage.prompt_tokens || 0;
            const c = usage.completion_tokens || 0;
            const t = usage.total_tokens || (p + c);

            await recordTokenUsage(p, c, t);
            currentOpenAIKeyIndex = keyIdx;

            return {
                answer: answer,
                usage: { promptTokenCount: p, candidatesTokenCount: c, totalTokenCount: t },
                keyIndex: keyIdx + 1,
                totalKeys: totalKeys,
                model: model,
                provider: 'OpenAI Compatible'
            };
        } catch (err) {
            lastError = err;
        }
    }

    throw new Error(`OpenAI Compatible: ${lastError?.message || 'Không kết nối được'}`);
}

// ==================== DISPATCHER GỌI AI ====================

async function callUnifiedAI(imageDataUrl, customPrompt) {
    const config = await api.storage.local.get([
        'aiProvider',
        'geminiApiKeys',
        'geminiApiKey',
        'geminiModel',
        'openaiBaseUrl',
        'openaiApiKeys',
        'openaiModel',
        'openaiTemperature',
        'openaiMaxTokens',
        'geminiPrompt'
    ]);

    const provider = config.aiProvider || 'gemini';
    const prompt = customPrompt || config.geminiPrompt || 'Bạn là chuyên gia giải đề thi. Hãy suy luận từng bước với độ chính xác cao nhất (Maximum Effort), giải thích chi tiết đề bài/câu hỏi trong ảnh chụp màn hình này và chỉ rõ đáp án đúng nhất (A, B, C, D)...';

    const optimized = await optimizeImageForAI(imageDataUrl);

    if (provider === 'openai') {
        return await callOpenAIVision(optimized, prompt, config);
    } else {
        return await callGeminiVision(optimized, prompt, config);
    }
}

// ==================== THỰC HIỆN DOUBLE CHECK (SOÁT BÀI) ====================

async function performDoubleCheck(imageDataUrl, initialAnswer) {
    const config = await api.storage.local.get([
        'aiProvider',
        'geminiApiKeys',
        'geminiApiKey',
        'geminiModel',
        'openaiBaseUrl',
        'openaiApiKeys',
        'openaiModel',
        'openaiTemperature',
        'openaiMaxTokens',
        'doubleCheckModel',
        'doubleCheckPrompt'
    ]);

    const dcPromptTemplate = config.doubleCheckPrompt || DEFAULT_DOUBLE_CHECK_PROMPT;
    const finalPrompt = dcPromptTemplate.replace('{INITIAL_ANSWER}', initialAnswer || '');

    const optimized = await optimizeImageForAI(imageDataUrl);
    const dcModelSetting = config.doubleCheckModel || 'same_as_main';

    if (dcModelSetting === 'same_as_main') {
        const provider = config.aiProvider || 'gemini';
        if (provider === 'openai') {
            return await callOpenAIVision(optimized, finalPrompt, config);
        } else {
            return await callGeminiVision(optimized, finalPrompt, config);
        }
    }

    if (dcModelSetting.startsWith('gemini')) {
        return await callGeminiVision(optimized, finalPrompt, config, dcModelSetting);
    } else {
        return await callOpenAIVision(optimized, finalPrompt, config, dcModelSetting);
    }
}

// ==================== GIAO TIẾP TIN NHẮN ====================

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.type) return false;

    if (message.type === 'PING') {
        sendResponse({ success: true, pong: true });
        return true;
    }

    if (message.type === 'CAPTURE_FULL_PAGE_NATIVE') {
        const tabId = message.tabId || (sender.tab ? sender.tab.id : null);
        const winId = sender.tab ? sender.tab.windowId : null;

        if (!tabId) {
            sendResponse({ success: false, error: 'Không xác định được tab' });
            return true;
        }

        captureScrollNative(tabId, message.mode || 'third', winId).then((dataUrl) => {
            sendResponse({ success: true, dataUrl });
        }).catch((err) => {
            console.error('Lỗi capture cuộn native:', err);
            sendResponse({ success: false, error: err.message });
        });
        return true;
    }

    if (message.type === 'CAPTURE_NATIVE_TAB') {
        captureTabUniversal(sender.tab ? sender.tab.windowId : null).then((dataUrl) => {
            sendResponse({ success: true, dataUrl });
        }).catch((err) => {
            console.error('Lỗi captureNativeTab:', err);
            sendResponse({ success: false, error: err.message });
        });
        return true;
    }

    if (message.type === 'ANALYZE_WITH_AI' || message.type === 'ANALYZE_WITH_GEMINI') {
        callUnifiedAI(message.dataUrl, message.prompt).then((res) => {
            if (message.captureId) {
                const item = captureHistory.find(c => c.id === message.captureId);
                if (item) {
                    item.geminiAnswer = res.answer;
                    item.geminiUsage = res.usage;
                    item.keyUsed = `Key #${res.keyIndex}/${res.totalKeys}`;
                    item.aiProvider = res.provider;
                    item.aiModel = res.model;
                    api.storage.local.set({ captureHistory: captureHistory });
                }
            }
            sendResponse({
                success: true,
                answer: res.answer,
                usage: res.usage,
                keyIndex: res.keyIndex,
                totalKeys: res.totalKeys,
                model: res.model,
                provider: res.provider
            });
        }).catch((err) => {
            console.error('Lỗi AI API:', err);
            sendResponse({ success: false, error: err.message });
        });
        return true;
    }

    if (message.type === 'PERFORM_DOUBLE_CHECK') {
        performDoubleCheck(message.dataUrl, message.initialAnswer).then((res) => {
            if (message.captureId) {
                const item = captureHistory.find(c => c.id === message.captureId);
                if (item) {
                    item.doubleCheckAnswer = res.answer;
                    item.doubleCheckModel = res.model;
                    api.storage.local.set({ captureHistory: captureHistory });
                }
            }
            sendResponse({
                success: true,
                answer: res.answer,
                usage: res.usage,
                model: res.model,
                provider: res.provider
            });
        }).catch((err) => {
            console.error('Lỗi Double Check API:', err);
            sendResponse({ success: false, error: err.message });
        });
        return true;
    }

    if (message.type === 'NEW_CAPTURE') {
        const newItem = {
            id: message.payload.id || ('cap_' + Date.now()),
            ...message.payload,
            receivedAt: new Date().toISOString()
        };

        captureHistory.unshift(newItem);
        if (captureHistory.length > 50) captureHistory = captureHistory.slice(0, 50);
        
        api.storage.local.set({
            lastCapture: newItem,
            captureHistory: captureHistory
        });
        sendResponse({ success: true, item: newItem });
        return true;
    }
    
    if (message.type === 'GET_HISTORY') {
        api.storage.local.get('captureHistory', (data) => {
            sendResponse(data ? (data.captureHistory || []) : []);
        });
        return true;
    }
    
    if (message.type === 'CLEAR_HISTORY') {
        captureHistory = [];
        api.storage.local.remove(['captureHistory', 'lastCapture']);
        sendResponse({ success: true });
        return true;
    }

    if (message.type === 'DOWNLOAD_FILE') {
        if (message.dataUrl && api.downloads) {
            api.downloads.download({
                url: message.dataUrl,
                filename: message.filename || 'capture.png',
                saveAs: true
            }, (downloadId) => {
                if (api.runtime.lastError) {
                    sendResponse({ success: false, error: api.runtime.lastError.message });
                } else {
                    sendResponse({ success: true, downloadId: downloadId });
                }
            });
            return true;
        }
    }

    return false;
});

console.log('✅ Background ready with Native Window Targeting for Kiwi Browser!');

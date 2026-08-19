// content.js - Floating HUD tối giản, tích hợp nút Double Check trực tiếp dưới phần đáp án

console.log('%c📸 Screen Capture AI HUD + Double Check Active', 'color:#3b82f6;font-size:13px;font-weight:600;');

const CONFIG = {
    clickCount: 2,
    clickTimeout: 600,
    triggerZone: {
        bottom: 250,
        right: 250
    }
};

let clickCounter = 0;
let clickTimer = null;
let isProcessing = false;

let hudHostElement = null;
let hudShadowRoot = null;
let hudContainer = null;
let hudBody = null;

// Lưu trữ dữ liệu ảnh chụp và đáp án sơ bộ hiện tại
let currentCaptureData = {
    dataUrl: null,
    initialAnswer: null,
    captureId: null,
    aiProvider: null,
    aiModel: null
};

function isExtensionValid() {
    return typeof chrome !== 'undefined' && chrome.runtime && !!chrome.runtime.id;
}

// ==================== TẠO FLOATING HUD (CLOSED SHADOW DOM) ====================

function initOrUpdateHUD() {
    const parent = document.fullscreenElement || document.body || document.documentElement;

    if (!hudHostElement) {
        hudHostElement = document.createElement('div');
        hudHostElement.className = 'capture-temp-ui';
        hudHostElement.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 0;
            height: 0;
            z-index: 2147483647;
            pointer-events: none;
        `;

        hudShadowRoot = hudHostElement.attachShadow({ mode: 'closed' });

        const style = document.createElement('style');
        style.textContent = `
            :host {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            }
            .hud-card {
                position: fixed;
                top: 50px;
                right: 24px;
                width: 420px;
                max-height: 580px;
                background: rgba(15, 23, 42, 0.96);
                backdrop-filter: blur(16px);
                -webkit-backdrop-filter: blur(16px);
                border: 1px solid rgba(255, 255, 255, 0.14);
                border-radius: 12px;
                box-shadow: 0 20px 45px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.06);
                color: #f8fafc;
                display: flex;
                flex-direction: column;
                z-index: 2147483647;
                pointer-events: auto;
                animation: hudAppear 0.25s cubic-bezier(0.16, 1, 0.3, 1);
                user-select: text;
                overflow: hidden;
            }

            @keyframes hudAppear {
                from { transform: translateY(-12px) scale(0.97); opacity: 0; }
                to { transform: translateY(0) scale(1); opacity: 1; }
            }

            .hud-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 11px 14px;
                background: rgba(255, 255, 255, 0.03);
                border-bottom: 1px solid rgba(255, 255, 255, 0.08);
                cursor: grab;
                user-select: none;
            }

            .hud-header:active {
                cursor: grabbing;
            }

            .hud-title-group {
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .hud-title {
                font-weight: 700;
                font-size: 13px;
                letter-spacing: -0.2px;
                color: #fff;
            }

            .hud-status-badge {
                font-size: 10.5px;
                font-weight: 500;
                padding: 2px 7px;
                background: rgba(59, 130, 246, 0.15);
                color: #60a5fa;
                border-radius: 10px;
                border: 1px solid rgba(59, 130, 246, 0.3);
            }

            .hud-controls {
                display: flex;
                gap: 4px;
            }

            .hud-btn {
                background: transparent;
                border: none;
                color: #94a3b8;
                cursor: pointer;
                padding: 3px 6px;
                border-radius: 4px;
                font-size: 12px;
                transition: all 0.15s;
                line-height: 1;
            }

            .hud-btn:hover {
                background: rgba(255, 255, 255, 0.08);
                color: #fff;
            }

            .hud-btn-close:hover {
                background: rgba(239, 68, 68, 0.2);
                color: #f87171;
            }

            .hud-body {
                padding: 14px;
                overflow-y: auto;
                max-height: 460px;
                line-height: 1.6;
                white-space: pre-wrap;
                word-break: break-word;
                font-size: 13px;
                color: #f1f5f9;
            }

            .hud-body::-webkit-scrollbar {
                width: 4px;
            }
            .hud-body::-webkit-scrollbar-thumb {
                background: rgba(255, 255, 255, 0.15);
                border-radius: 2px;
            }

            /* Hàng nút bấm trực tiếp dưới phần đáp án */
            .hud-action-bar {
                display: flex;
                gap: 8px;
                margin-top: 14px;
                padding-top: 12px;
                border-top: 1px solid rgba(255, 255, 255, 0.1);
            }

            .hud-btn-dc-prominent {
                flex: 1.5;
                background: rgba(16, 185, 129, 0.15);
                border: 1px solid rgba(16, 185, 129, 0.35);
                color: #34d399;
                padding: 8px 12px;
                border-radius: 6px;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.15s ease;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
            }

            .hud-btn-dc-prominent:hover {
                background: #10b981;
                color: #fff;
                box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
            }

            .hud-btn-copy-prominent {
                flex: 1;
                background: #1e293b;
                border: 1px solid rgba(255, 255, 255, 0.1);
                color: #f8fafc;
                padding: 8px 12px;
                border-radius: 6px;
                font-size: 12px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.15s ease;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 5px;
            }

            .hud-btn-copy-prominent:hover {
                background: #334155;
                color: #fff;
            }

            /* Khung hiển thị kết quả Double Check */
            .hud-dc-card {
                margin-top: 12px;
                padding: 12px 14px;
                background: rgba(16, 185, 129, 0.08);
                border: 1px solid rgba(16, 185, 129, 0.3);
                border-radius: 8px;
                color: #e2e8f0;
                animation: hudAppear 0.2s ease;
            }

            .hud-dc-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 8px;
                font-size: 11px;
                font-weight: 700;
                color: #34d399;
                text-transform: uppercase;
                letter-spacing: 0.4px;
            }

            .hud-footer {
                padding: 8px 14px;
                background: rgba(0, 0, 0, 0.25);
                border-top: 1px solid rgba(255, 255, 255, 0.06);
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-size: 11px;
                color: #94a3b8;
            }

            .hud-loading {
                display: flex;
                align-items: center;
                gap: 8px;
                color: #93c5fd;
                font-weight: 500;
                font-size: 12.5px;
            }

            .spinner {
                width: 14px;
                height: 14px;
                border: 2px solid rgba(59, 130, 246, 0.2);
                border-top: 2px solid #3b82f6;
                border-radius: 50%;
                animation: spin 0.8s linear infinite;
                flex-shrink: 0;
            }

            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }

            .minimized .hud-body, .minimized .hud-footer {
                display: none;
            }
            .minimized {
                width: 220px;
            }
        `;
        hudShadowRoot.appendChild(style);

        hudContainer = document.createElement('div');
        hudContainer.className = 'hud-card';
        hudContainer.style.display = 'none';

        hudContainer.innerHTML = `
            <div class="hud-header" id="hudHeader">
                <div class="hud-title-group">
                    <span class="hud-title">AI Assistant</span>
                    <span class="hud-status-badge" id="hudStatus">Sẵn sàng</span>
                </div>
                <div class="hud-controls">
                    <button class="hud-btn" id="btnMinimize" title="Thu nhỏ/Mở rộng">━</button>
                    <button class="hud-btn hud-btn-close" id="btnClose" title="Đóng">✕</button>
                </div>
            </div>
            <div class="hud-body" id="hudBody"></div>
            <div class="hud-footer">
                <span id="hudTokens">Token: 0</span>
                <span style="font-size: 10px; color: #64748b;">Alt+S để chụp câu tiếp</span>
            </div>
        `;

        hudShadowRoot.appendChild(hudContainer);

        const btnClose = hudShadowRoot.getElementById('btnClose');
        const btnMinimize = hudShadowRoot.getElementById('btnMinimize');
        const hudHeader = hudShadowRoot.getElementById('hudHeader');
        hudBody = hudShadowRoot.getElementById('hudBody');

        btnClose.addEventListener('click', (e) => {
            e.stopPropagation();
            hudContainer.style.display = 'none';
        });

        btnMinimize.addEventListener('click', (e) => {
            e.stopPropagation();
            hudContainer.classList.toggle('minimized');
            btnMinimize.textContent = hudContainer.classList.contains('minimized') ? '◻' : '━';
        });

        // Draggable
        let isDragging = false;
        let startX, startY, initialLeft, initialTop;

        hudHeader.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'BUTTON') return;
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = hudContainer.getBoundingClientRect();
            initialLeft = rect.left;
            initialTop = rect.top;

            function onMouseMove(moveEvent) {
                if (!isDragging) return;
                const dx = moveEvent.clientX - startX;
                const dy = moveEvent.clientY - startY;
                hudContainer.style.left = `${Math.max(10, initialLeft + dx)}px`;
                hudContainer.style.top = `${Math.max(10, initialTop + dy)}px`;
                hudContainer.style.right = 'auto';
            }

            function onMouseUp() {
                isDragging = false;
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);
            }

            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        });
    }

    if (hudHostElement.parentElement !== parent) {
        parent.appendChild(hudHostElement);
    }
}

// ==================== RENDER ĐÁP ÁN + NÚT DOUBLE CHECK ====================

function showHUDAnswer(answerText, statusText, tokenText = '') {
    initOrUpdateHUD();
    if (!hudContainer || !hudBody) return;

    hudContainer.style.display = 'flex';
    hudContainer.classList.remove('minimized');

    const statusEl = hudShadowRoot.getElementById('hudStatus');
    const tokenEl = hudShadowRoot.getElementById('hudTokens');

    if (statusEl) statusEl.textContent = statusText;
    if (tokenEl && tokenText) tokenEl.textContent = tokenText;

    // Render nội dung đáp án kèm hàng nút bấm ngay bên dưới
    hudBody.innerHTML = `
        <div class="hud-answer-text">${escapeHtml(answerText)}</div>
        <div class="hud-action-bar">
            <button class="hud-btn-dc-prominent" id="btnTriggerDoubleCheck">
                <span>🔍</span>
                <span>Soát bài (Double Check)</span>
            </button>
            <button class="hud-btn-copy-prominent" id="btnCopyAnswer">
                <span>📋</span>
                <span>Copy đáp án</span>
            </button>
        </div>
        <div id="dcContainer"></div>
    `;

    // Gắn sự kiện cho nút Double Check
    const btnDC = hudShadowRoot.getElementById('btnTriggerDoubleCheck');
    const btnCopy = hudShadowRoot.getElementById('btnCopyAnswer');
    const dcContainer = hudShadowRoot.getElementById('dcContainer');

    btnCopy.addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(answerText).then(() => {
            btnCopy.innerHTML = `<span>✅</span><span>Đã chép!</span>`;
            setTimeout(() => {
                btnCopy.innerHTML = `<span>📋</span><span>Copy đáp án</span>`;
            }, 1400);
        });
    });

    btnDC.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!currentCaptureData.dataUrl || !currentCaptureData.initialAnswer) {
            alert('Chưa có ảnh chụp hoặc đáp án để đối chiếu.');
            return;
        }

        btnDC.disabled = true;
        btnDC.innerHTML = `<span>⏳</span><span>Đang gửi ảnh & soát bài...</span>`;

        dcContainer.innerHTML = `
            <div class="hud-dc-card">
                <div class="hud-dc-header">
                    <span>Đang thẩm định & rà soát lại đề bài...</span>
                </div>
                <div class="hud-loading" style="padding: 4px 0;">
                    <div class="spinner"></div>
                    <span>Đang gửi lại ảnh gốc để AI kiểm tra từng bước tính...</span>
                </div>
            </div>
        `;
        dcContainer.scrollIntoView({ behavior: 'smooth' });

        // Gửi cả ảnh cap màn hình gốc + đáp án sơ bộ
        chrome.runtime.sendMessage({
            type: 'PERFORM_DOUBLE_CHECK',
            dataUrl: currentCaptureData.dataUrl,
            initialAnswer: currentCaptureData.initialAnswer,
            captureId: currentCaptureData.captureId
        }, (res) => {
            btnDC.disabled = false;
            btnDC.innerHTML = `<span>🔄</span><span>Soát lại lần nữa</span>`;

            if (res && res.success) {
                dcContainer.innerHTML = `
                    <div class="hud-dc-card">
                        <div class="hud-dc-header">
                            <span>✅ KẾT QUẢ SOÁT BÀI ĐỘC LẬP (${res.model || res.provider || 'AI Verified'})</span>
                        </div>
                        <div style="font-size: 13px; line-height: 1.6; color: #f8fafc;">${escapeHtml(res.answer)}</div>
                    </div>
                `;
                dcContainer.scrollIntoView({ behavior: 'smooth' });
            } else {
                dcContainer.innerHTML = `
                    <div class="hud-dc-card" style="border-color: rgba(239, 68, 68, 0.4); background: rgba(239, 68, 68, 0.08);">
                        <div class="hud-dc-header" style="color: #f87171;">
                            <span>❌ Lỗi Soát Bài</span>
                        </div>
                        <div style="color: #f87171;">${res?.error || 'Không thể thực hiện kiểm tra chéo'}</div>
                    </div>
                `;
            }
        });
    });
}

function showHUDLoading(statusText, message) {
    initOrUpdateHUD();
    if (!hudContainer || !hudBody) return;

    hudContainer.style.display = 'flex';
    hudContainer.classList.remove('minimized');

    const statusEl = hudShadowRoot.getElementById('hudStatus');
    if (statusEl) statusEl.textContent = statusText;

    hudBody.innerHTML = `
        <div class="hud-loading" style="padding: 12px 0;">
            <div class="spinner"></div>
            <span>${message || 'Đang xử lý dữ liệu...'}</span>
        </div>
    `;
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/[&<>"']/g, function(m) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    });
}

// ==================== NÚT NỔI CHỤP MÀN HÌNH ====================

function createOrUpdateFloatingButton() {
    let btn = document.getElementById('capture-floating-btn');
    if (!btn) {
        btn = document.createElement('div');
        btn.id = 'capture-floating-btn';
        btn.className = 'capture-temp-ui';
        btn.title = 'Chụp 1/3 trang & phân tích AI (Phím tắt: Alt+S)';
        btn.style.cssText = `
            position: fixed;
            bottom: 24px;
            right: 24px;
            width: 44px;
            height: 44px;
            border-radius: 50%;
            background: #0f172a;
            border: 1px solid rgba(255, 255, 255, 0.15);
            color: #60a5fa;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 19px;
            cursor: pointer;
            z-index: 2147483640;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
            transition: all 0.2s ease;
            user-select: none;
            pointer-events: auto;
        `;
        btn.innerHTML = '📷';

        btn.addEventListener('mouseenter', () => {
            btn.style.transform = 'scale(1.08)';
            btn.style.borderColor = '#3b82f6';
        });

        btn.addEventListener('mouseleave', () => {
            btn.style.transform = 'scale(1)';
            btn.style.borderColor = 'rgba(255, 255, 255, 0.15)';
        });

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            triggerCapture('third');
        }, true);
    }

    const targetParent = document.fullscreenElement || document.body || document.documentElement;
    if (btn.parentElement !== targetParent) {
        targetParent.appendChild(btn);
    }
}

document.addEventListener('fullscreenchange', () => {
    setTimeout(() => {
        createOrUpdateFloatingButton();
        initOrUpdateHUD();
    }, 200);
});

// Phím tắt Alt+S
window.addEventListener('keydown', function(e) {
    if (e.altKey && (e.key === 's' || e.key === 'S' || e.code === 'KeyS')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        triggerCapture('third');
    }
}, true);

// Double-click góc màn hình
window.addEventListener('dblclick', function(event) {
    const x = event.clientX;
    const y = event.clientY;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    
    const isInZone = (
        y > windowHeight - CONFIG.triggerZone.bottom &&
        x > windowWidth - CONFIG.triggerZone.right
    );
    
    if (isInZone && !isProcessing) {
        showClickIndicator(x, y);
        resetClickCounter();
        triggerCapture('third');
    }
}, true);

window.addEventListener('click', function(event) {
    const x = event.clientX;
    const y = event.clientY;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    
    const isInZone = (
        y > windowHeight - CONFIG.triggerZone.bottom &&
        x > windowWidth - CONFIG.triggerZone.right
    );
    
    if (event.target.closest('#capture-floating-btn')) return;
    
    if (!isInZone || isProcessing) {
        if (!isInZone) resetClickCounter();
        return;
    }
    
    clickCounter++;
    if (clickTimer) clearTimeout(clickTimer);
    showClickIndicator(x, y);

    if (clickCounter >= CONFIG.clickCount) {
        resetClickCounter();
        triggerCapture('third');
        return;
    }
    
    clickTimer = setTimeout(() => { resetClickCounter(); }, CONFIG.clickTimeout);
}, true);

function resetClickCounter() {
    clickCounter = 0;
    if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
    }
}

function showClickIndicator(x, y) {
    const indicator = document.createElement('div');
    indicator.className = 'capture-temp-ui';
    indicator.style.cssText = `
        position: fixed;
        left: ${x - 14}px;
        top: ${y - 14}px;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: rgba(59, 130, 246, 0.6);
        border: 1px solid #60a5fa;
        z-index: 2147483647;
        pointer-events: none;
        transition: all 0.35s ease-out;
    `;
    
    const parent = document.fullscreenElement || document.body || document.documentElement;
    parent.appendChild(indicator);
    
    setTimeout(() => {
        indicator.style.transform = 'scale(1.4)';
        indicator.style.opacity = '0';
    }, 40);

    setTimeout(() => { indicator.remove(); }, 380);
}

// ==================== TRIGGER CAPTURE & AI ====================

async function triggerCapture(mode = 'third') {
    if (isProcessing) return;

    if (!isExtensionValid()) {
        alert('Tiện ích mở rộng vừa được nạp lại. Vui lòng tải lại trang (F5) để tiếp tục.');
        return;
    }

    isProcessing = true;
    showHUDLoading('Đang chụp...', 'Đang cuộn và chụp khung hình trang web...');
    
    try {
        const response = await new Promise((resolve, reject) => {
            try {
                chrome.runtime.sendMessage({
                    type: 'CAPTURE_FULL_PAGE_NATIVE',
                    mode: mode
                }, (res) => {
                    if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                    else resolve(res);
                });
            } catch (err) {
                reject(err);
            }
        });

        if (!response?.success || !response?.dataUrl) {
            throw new Error(response?.error || 'Lỗi khi chụp trang');
        }

        const now = new Date();
        const timestamp = now.toISOString().replace(/[:.]/g, '-');
        const filename = `capture_${timestamp}.png`;
        const captureId = 'cap_' + Date.now();

        // Cập nhật dữ liệu ảnh chụp cho Double Check
        currentCaptureData.dataUrl = response.dataUrl;
        currentCaptureData.captureId = captureId;
        currentCaptureData.initialAnswer = null;

        const result = {
            id: captureId,
            image: response.dataUrl,
            filename: filename,
            timestamp: now.toISOString(),
            pageUrl: window.location.href,
            pageTitle: document.title || 'Untitled',
            mode: 'native-' + mode,
            geminiAnswer: null
        };

        chrome.runtime.sendMessage({
            type: 'NEW_CAPTURE',
            payload: result
        });

        showHUDLoading('Đang giải đề...', 'Đã chụp xong, đang gửi dữ liệu cho AI giải bài...');

        chrome.runtime.sendMessage({
            type: 'ANALYZE_WITH_AI',
            dataUrl: response.dataUrl,
            captureId: captureId
        }, (res) => {
            if (res && res.success) {
                currentCaptureData.initialAnswer = res.answer;
                currentCaptureData.aiProvider = res.provider;
                currentCaptureData.aiModel = res.model;

                const totalTokens = res.usage?.totalTokenCount || 0;
                const tokenStr = totalTokens > 0 ? `Token: ${totalTokens.toLocaleString('vi-VN')} (${res.provider || 'AI'})` : (res.provider || 'Hoàn tất');
                
                // Hiển thị đáp án kèm nút Soát bài (Double Check) trực tiếp bên dưới!
                showHUDAnswer(res.answer, `Đáp án (${res.provider || 'AI'})`, tokenStr);
            } else {
                showHUDLoading('Lỗi', `Lỗi kết nối: ${res?.error || 'Không thể lấy dữ liệu'}`);
            }
        });

    } catch (error) {
        console.error('Lỗi capture:', error);
        if (error.message && error.message.includes('Extension context invalidated')) {
            alert('Tiện ích mở rộng vừa được cập nhật. Vui lòng F5 tải lại trang!');
        } else {
            showHUDLoading('Lỗi', `Lỗi: ${error.message || 'Không thể chụp'}`);
        }
    } finally {
        isProcessing = false;
    }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'TRIGGER_CAPTURE') {
        triggerCapture(message.mode || 'third').then(() => {
            sendResponse({ success: true });
        }).catch(err => {
            sendResponse({ success: false, error: err.message });
        });
        return true;
    }
});

createOrUpdateFloatingButton();
initOrUpdateHUD();
setInterval(() => {
    createOrUpdateFloatingButton();
    initOrUpdateHUD();
}, 1000);

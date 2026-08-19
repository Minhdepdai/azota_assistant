// popup.js - Quản lý giao diện Popup & Hỗ trợ Double Check + Math Renderer

document.addEventListener('DOMContentLoaded', function() {
    const statusBadge = document.getElementById('statusBadge');
    const currentProviderText = document.getElementById('currentProviderText');
    const historyList = document.getElementById('historyList');
    const btnCapture = document.getElementById('btnCapture');
    const btnClear = document.getElementById('btnClear');
    const btnOpenOptions = document.getElementById('btnOpenOptions');
    const modeBtns = document.querySelectorAll('.mode-btn');

    let currentMode = 'native-third';
    let currentHistory = [];

    // Mở trang Cài đặt
    btnOpenOptions.addEventListener('click', () => {
        if (chrome.runtime.openOptionsPage) {
            chrome.runtime.openOptionsPage();
        } else {
            window.open('options.html');
        }
    });

    // Cập nhật provider label
    function updateProviderHeader() {
        chrome.storage.local.get(['aiProvider', 'geminiModel', 'openaiModel'], (data) => {
            const provider = data.aiProvider || 'gemini';
            if (provider === 'gemini') {
                const m = data.geminiModel || 'gemini-3.7-flash';
                currentProviderText.textContent = `Google Gemini (${m})`;
            } else {
                const m = data.openaiModel || 'gpt-5.6';
                currentProviderText.textContent = `OpenAI Compatible (${m})`;
            }
        });
    }

    updateProviderHeader();

    // Mode Selector
    modeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            modeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentMode = btn.dataset.mode;
        });
    });

    function isValidWebUrl(url) {
        if (!url) return false;
        const invalidPrefixes = ['chrome://', 'chrome-extension://', 'edge://', 'about:', 'view-source:', 'data:', 'javascript:'];
        if (invalidPrefixes.some(p => url.startsWith(p))) return false;
        if (url.includes('chromewebstore.google.com') || url.includes('chrome.google.com/webstore')) return false;
        return true;
    }

    // ==================== BỘ RENDER TOÁN & MARKDOWN ====================

    function renderMarkdownAndMath(text) {
        if (!text) return '';

        let html = text.replace(/\\d?frac\{([^{}]+)\}\{([^{}]+)\}/g, (match, num, den) => {
            return `<span class="math-fraction"><span class="math-num">${num}</span><span class="math-den">${den}</span></span>`;
        });

        const latexMap = [
            [/\\triangle/g, '△'],
            [/\\Rightarrow/g, '⇒'],
            [/\\Leftarrow/g, '⇐'],
            [/\\Leftrightarrow/g, '⇔'],
            [/\\rightarrow/g, '→'],
            [/\\leftarrow/g, '←'],
            [/\\cdot/g, '·'],
            [/\\times/g, '×'],
            [/\\div/g, '÷'],
            [/\\pm/g, '±'],
            [/\\le(q)?\b/g, '≤'],
            [/\\ge(q)?\b/g, '≥'],
            [/\\neq/g, '≠'],
            [/\\approx/g, '≈'],
            [/\\equiv/g, '≡'],
            [/\\in\b/g, '∈'],
            [/\\notin\b/g, '∉'],
            [/\\cap\b/g, '∩'],
            [/\\cup\b/g, '∪'],
            [/\\subset\b/g, '⊂'],
            [/\\perp\b/g, '⊥'],
            [/\\parallel\b/g, '∥'],
            [/\\angle\b/g, '∠'],
            [/\\pi\b/g, 'π'],
            [/\\alpha\b/g, 'α'],
            [/\\beta\b/g, 'β'],
            [/\\gamma\b/g, 'γ'],
            [/\\theta\b/g, 'θ'],
            [/\\lambda\b/g, 'λ'],
            [/\\Delta\b/g, 'Δ'],
            [/\\Omega\b/g, 'Ω'],
            [/\\infty\b/g, '∞'],
            [/\\sqrt\{([^{}]+)\}/g, '√($1)'],
            [/\\sqrt\[([^{}]+)\]\{([^{}]+)\}/g, '$1√($2)'],
            [/\\overline\{([^{}]+)\}/g, '<span style="text-decoration:overline;">$1</span>'],
            [/\\vec\{([^{}]+)\}/g, '$1⃗']
        ];

        latexMap.forEach(([regex, replacement]) => {
            html = html.replace(regex, replacement);
        });

        html = html.replace(/\^\{([^{}]+)\}/g, '<sup>$1</sup>');
        html = html.replace(/\^([0-9a-zA-Z+-]+)/g, '<sup>$1</sup>');
        html = html.replace(/_\{([^{}]+)\}/g, '<sub>$1</sub>');
        html = html.replace(/_([0-9a-zA-Z+-]+)/g, '<sub>$1</sub>');

        html = html.replace(/\$\$([^\$]+)\$\$/g, '<div class="math-block">$1</div>');
        html = html.replace(/\$([^\$]+)\$/g, '<span class="math-inline">$1</span>');

        html = html.replace(/^### (.*$)/gim, '<h4 class="md-h4">$1</h4>');
        html = html.replace(/^## (.*$)/gim, '<h3 class="md-h3">$1</h3>');
        html = html.replace(/^# (.*$)/gim, '<h2 class="md-h2">$1</h2>');

        html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="md-bold">$1</strong>');
        html = html.replace(/__(.*?)__/g, '<strong class="md-bold">$1</strong>');
        html = html.replace(/\*([^\*\n]+)\*/g, '<em class="md-em">$1</em>');
        html = html.replace(/_([^_\n]+)_/g, '<em class="md-em">$1</em>');

        const lines = html.split('\n');
        let inList = false;
        let newLines = [];

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            let trimmed = line.trim();

            if (/^[\*\-]\s+(.*)/.test(trimmed)) {
                let itemContent = trimmed.replace(/^[\*\-]\s+/, '');
                if (!inList) {
                    newLines.push('<ul class="md-list">');
                    inList = true;
                }
                newLines.push(`<li>${itemContent}</li>`);
            } else if (/^\d+\.\s+(.*)/.test(trimmed)) {
                let itemContent = trimmed.replace(/^\d+\.\s+/, '');
                if (!inList) {
                    newLines.push('<ol class="md-list">');
                    inList = true;
                }
                newLines.push(`<li>${itemContent}</li>`);
            } else {
                if (inList) {
                    newLines.push('</ul>');
                    inList = false;
                }
                if (trimmed.length > 0) {
                    newLines.push(`<p class="md-p">${line}</p>`);
                }
            }
        }
        if (inList) newLines.push('</ul>');

        return newLines.join('');
    }

    // Load History
    function loadHistory() {
        chrome.runtime.sendMessage({ type: 'GET_HISTORY' }, (history) => {
            if (chrome.runtime.lastError) return;
            currentHistory = history || [];
            renderHistory(currentHistory);
        });
    }

    // Render History
    function renderHistory(history) {
        if (!history || history.length === 0) {
            historyList.innerHTML = `
                <div class="empty-state">
                    <div>Chưa có bản chụp nào trong Cache</div>
                    <div style="font-size: 11px; margin-top: 4px; color: var(--text-muted);">Bấm Alt+S hoặc nút chụp trên trang để bắt đầu</div>
                </div>
            `;
            return;
        }

        let html = '';
        history.slice(0, 20).forEach((item, index) => {
            const time = item.timestamp ? new Date(item.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : 'Vừa xong';
            const sizeKb = item.image ? Math.round(item.image.length / 1024) : 0;
            const modeText = item.mode === 'native-third' ? '1/3 Trang' : (item.mode === 'native-full' ? 'Toàn trang' : 'Khung nhìn');
            const hasAI = !!item.geminiAnswer;
            const hasDC = !!item.doubleCheckAnswer;

            let tokenInfoHtml = '';
            if (item.geminiUsage) {
                const total = item.geminiUsage.totalTokenCount || 0;
                const p = item.geminiUsage.promptTokenCount || 0;
                const c = item.geminiUsage.candidatesTokenCount || 0;
                tokenInfoHtml = `<span>Token: ${total.toLocaleString('vi-VN')} (${p} in / ${c} out)</span>`;
            }

            html += `
                <div class="history-card" data-index="${index}">
                    <div class="card-header">
                        <span class="card-index">#${index + 1}</span>
                        <span class="card-time">${time}</span>
                    </div>
                    <div class="card-title" title="${escapeHtml(item.pageUrl || '')}">${escapeHtml(item.pageTitle || 'Untitled')}</div>
                    <div class="card-meta">${sizeKb} KB · ${modeText}</div>

                    ${hasAI ? `
                        <div class="answer-box">
                            <div class="answer-badge">
                                <span>${escapeHtml(item.aiProvider || 'AI Response')}</span>
                                ${tokenInfoHtml}
                            </div>
                            <div>${renderMarkdownAndMath(item.geminiAnswer)}</div>
                        </div>
                    ` : ''}

                    ${hasDC ? `
                        <div class="answer-box" style="background: rgba(16, 185, 129, 0.08); border-color: rgba(16, 185, 129, 0.3);">
                            <div class="answer-badge" style="color: #34d399;">
                                <span>KẾT QUẢ SOÁT BÀI (${escapeHtml(item.doubleCheckModel || 'Verified')})</span>
                            </div>
                            <div style="color: #e2e8f0;">${renderMarkdownAndMath(item.doubleCheckAnswer)}</div>
                        </div>
                    ` : ''}

                    <div class="card-actions">
                        ${hasAI ? `<button class="btn-card-action btn-ai-action" style="color:#34d399; border-color:rgba(16,185,129,0.3);" data-action="double-check" data-index="${index}">Soát bài</button>` : `<button class="btn-card-action btn-ai-action" data-action="ask-ai" data-index="${index}">Phân tích AI</button>`}
                        <button class="btn-card-action" data-action="view" data-index="${index}">Xem ảnh</button>
                        <button class="btn-card-action" data-action="download" data-index="${index}">Tải về</button>
                        ${hasAI ? `<button class="btn-card-action" data-action="copy" data-index="${index}">Copy</button>` : ''}
                    </div>
                </div>
            `;
        });

        historyList.innerHTML = html;
    }

    function escapeHtml(text) {
        if (!text) return '';
        return text.replace(/[&<>"']/g, function(m) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
        });
    }

    // Actions Delegation
    historyList.addEventListener('click', async function(e) {
        const btn = e.target.closest('.btn-card-action');
        if (!btn) return;

        const action = btn.dataset.action;
        const index = parseInt(btn.dataset.index, 10);
        const item = currentHistory[index];
        if (!item) return;

        if (action === 'view') {
            if (item.image) chrome.tabs.create({ url: item.image });
        } else if (action === 'download') {
            if (item.image) {
                chrome.downloads.download({
                    url: item.image,
                    filename: item.filename || 'capture.png',
                    saveAs: true
                });
            }
        } else if (action === 'ask-ai') {
            const prev = btn.textContent;
            btn.disabled = true;
            btn.textContent = 'Đang xử lý...';

            chrome.runtime.sendMessage({
                type: 'ANALYZE_WITH_AI',
                dataUrl: item.image,
                captureId: item.id
            }, (res) => {
                btn.disabled = false;
                btn.textContent = prev;

                if (res && res.success) {
                    item.geminiAnswer = res.answer;
                    item.geminiUsage = res.usage;
                    item.aiProvider = res.provider;
                    renderHistory(currentHistory);
                } else {
                    alert('Lỗi AI: ' + (res?.error || 'Không thể kết nối'));
                }
            });
        } else if (action === 'double-check') {
            const prev = btn.textContent;
            btn.disabled = true;
            btn.textContent = 'Đang soát...';

            chrome.runtime.sendMessage({
                type: 'PERFORM_DOUBLE_CHECK',
                dataUrl: item.image,
                initialAnswer: item.geminiAnswer,
                captureId: item.id
            }, (res) => {
                btn.disabled = false;
                btn.textContent = 'Đã soát';

                if (res && res.success) {
                    item.doubleCheckAnswer = res.answer;
                    item.doubleCheckModel = res.model;
                    renderHistory(currentHistory);
                } else {
                    alert('Lỗi Double Check: ' + (res?.error || 'Không thể kết nối'));
                }
            });
        } else if (action === 'copy') {
            const copyContent = (item.doubleCheckAnswer ? `[KẾT QUẢ SOÁT BÀI]\n${item.doubleCheckAnswer}\n\n[LỜI GIẢI GỐC]\n` : '') + (item.geminiAnswer || '');
            if (copyContent) {
                navigator.clipboard.writeText(copyContent).then(() => {
                    const prev = btn.textContent;
                    btn.textContent = 'Đã chép!';
                    setTimeout(() => { btn.textContent = prev; }, 1200);
                });
            }
        }
    });

    // Capture Handler
    btnCapture.addEventListener('click', async function() {
        statusBadge.textContent = 'Đang chụp...';

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            if (!tab || !tab.id || !isValidWebUrl(tab.url)) {
                alert('Không thể chụp trên trang hệ thống Chrome. Vui lòng chuyển sang trang web thông thường.');
                statusBadge.textContent = 'Sẵn sàng';
                return;
            }

            let dataUrl = null;

            if (currentMode === 'native-third' || currentMode === 'native-full') {
                const modeParam = (currentMode === 'native-third') ? 'third' : 'full';
                const response = await new Promise(resolve => {
                    chrome.runtime.sendMessage({
                        type: 'CAPTURE_FULL_PAGE_NATIVE',
                        tabId: tab.id,
                        mode: modeParam
                    }, resolve);
                });

                if (!response?.success || !response?.dataUrl) {
                    throw new Error(response?.error || 'Lỗi chụp trang');
                }
                dataUrl = response.dataUrl;
            } else {
                dataUrl = await new Promise((resolve, reject) => {
                    chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' }, (res) => {
                        if (chrome.runtime.lastError || !res) {
                            reject(new Error(chrome.runtime.lastError?.message || 'Lỗi chụp'));
                        } else {
                            resolve(res);
                        }
                    });
                });
            }

            const now = new Date();
            const timestamp = now.toISOString().replace(/[:.]/g, '-');
            const filename = `capture_${timestamp}.png`;
            const captureId = 'cap_' + Date.now();

            const fullResult = {
                id: captureId,
                image: dataUrl,
                filename: filename,
                timestamp: now.toISOString(),
                pageUrl: tab.url,
                pageTitle: tab.title || 'Untitled',
                mode: currentMode,
                geminiAnswer: null,
                geminiUsage: null,
                doubleCheckAnswer: null
            };

            chrome.runtime.sendMessage({
                type: 'NEW_CAPTURE',
                payload: fullResult
            });

            const settings = await chrome.storage.local.get(['geminiAutoAnalyze']);
            if (settings.geminiAutoAnalyze) {
                statusBadge.textContent = 'Đang gọi AI...';
                chrome.runtime.sendMessage({
                    type: 'ANALYZE_WITH_AI',
                    dataUrl: dataUrl,
                    captureId: captureId
                }, (res) => {
                    if (res && res.success) {
                        fullResult.geminiAnswer = res.answer;
                        fullResult.geminiUsage = res.usage;
                        fullResult.aiProvider = res.provider;
                        loadHistory();
                    }
                });
            }

            statusBadge.textContent = 'Đã lưu';
            setTimeout(() => { statusBadge.textContent = 'Sẵn sàng'; }, 1500);
            loadHistory();

        } catch (error) {
            console.error('Lỗi khi capture:', error);
            alert('Lỗi chụp: ' + (error.message || error));
            statusBadge.textContent = 'Thất bại';
            setTimeout(() => { statusBadge.textContent = 'Sẵn sàng'; }, 1500);
        }
    });

    btnClear.addEventListener('click', function() {
        if (confirm('Bạn có chắc muốn xóa tất cả ảnh chụp trong Cache không?')) {
            chrome.runtime.sendMessage({ type: 'CLEAR_HISTORY' }, () => {
                loadHistory();
                statusBadge.textContent = 'Đã xóa';
                setTimeout(() => { statusBadge.textContent = 'Sẵn sàng'; }, 1500);
            });
        }
    });

    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'NEW_CAPTURE') loadHistory();
    });

    loadHistory();
    setInterval(loadHistory, 3500);
});

// options.js - Quản lý độc lập API Keys và Cấu hình Double Check

document.addEventListener('DOMContentLoaded', () => {
    const providerTabs = document.querySelectorAll('.segmented-btn');
    const activeProviderBadge = document.getElementById('activeProviderBadge');
    const sectionGemini = document.getElementById('sectionGemini');
    const sectionOpenAI = document.getElementById('sectionOpenAI');

    // Gemini
    const geminiApiKeysTextarea = document.getElementById('geminiApiKeys');
    const geminiKeyCountBadge = document.getElementById('geminiKeyCountBadge');
    const geminiModelSelect = document.getElementById('geminiModelSelect');

    // OpenAI
    const openaiBaseUrlInput = document.getElementById('openaiBaseUrl');
    const openaiApiKeysTextarea = document.getElementById('openaiApiKeys');
    const openaiKeyCountBadge = document.getElementById('openaiKeyCountBadge');
    const openaiModelSelect = document.getElementById('openaiModelSelect');
    const openaiCustomModel = document.getElementById('openaiCustomModel');
    const paramTemperature = document.getElementById('paramTemperature');
    const paramMaxTokens = document.getElementById('paramMaxTokens');

    // Double Check
    const doubleCheckModelSelect = document.getElementById('doubleCheckModelSelect');
    const doubleCheckPrompt = document.getElementById('doubleCheckPrompt');

    // Common
    const promptTemplate = document.getElementById('promptTemplate');
    const autoAnalyze = document.getElementById('autoAnalyze');
    const settingsForm = document.getElementById('settingsForm');
    const btnTestAll = document.getElementById('btnTestAll');
    const btnResetStats = document.getElementById('btnResetStats');
    const alertBox = document.getElementById('alertBox');

    // Stats
    const statTotalTokens = document.getElementById('statTotalTokens');
    const statTokenDetails = document.getElementById('statTokenDetails');
    const statTotalRequests = document.getElementById('statTotalRequests');
    const statActiveKeys = document.getElementById('statActiveKeys');

    let currentProvider = 'gemini';
    const DEFAULT_PROMPT = 'Bạn là chuyên gia giải đề thi. Hãy suy luận từng bước với độ chính xác cao nhất (Maximum Effort), giải thích chi tiết đề bài/câu hỏi trong ảnh chụp màn hình này và chỉ rõ đáp án đúng nhất (A, B, C, D)...';
    const DEFAULT_DOUBLE_CHECK_PROMPT = `Bạn là chuyên gia thẩm định và soát bài cấp cao. Dưới đây là ảnh chụp đề bài gốc và Lời giải sơ bộ số 1 từ AI:\n\n--- [LỜI GIẢI SƠ BỘ] ---\n{INITIAL_ANSWER}\n----------------------\n\nHãy đọc kỹ từng câu chữ, hình vẽ, số liệu trong ảnh và soát xét lại từng bước giải trên. Chỉ ra lời giải trước có đúng 100% không, có bị dính bẫy hay sai sót nào không. Cuối cùng, hãy đưa ra đáp án chính xác và chắc chắn nhất.`;

    // ==================== PROVIDER SWITCHING ====================

    function setProviderUI(provider) {
        currentProvider = provider;
        providerTabs.forEach(t => {
            t.classList.toggle('active', t.dataset.provider === provider);
        });

        if (provider === 'gemini') {
            sectionGemini.style.display = 'flex';
            sectionOpenAI.style.display = 'none';
            activeProviderBadge.textContent = 'Gemini Active';
        } else {
            sectionGemini.style.display = 'none';
            sectionOpenAI.style.display = 'flex';
            activeProviderBadge.textContent = 'OpenAI Compatible Active';
        }
        updateKeyBadges();
    }

    providerTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            setProviderUI(tab.dataset.provider);
        });
    });

    openaiModelSelect.addEventListener('change', () => {
        if (openaiModelSelect.value === 'custom') {
            openaiCustomModel.style.display = 'block';
            openaiCustomModel.focus();
        } else {
            openaiCustomModel.style.display = 'none';
        }
    });

    // ==================== KEY PARSER ====================

    function parseKeys(rawText) {
        if (!rawText) return [];
        return rawText
            .split(/[\n,]+/)
            .map(k => k.trim())
            .filter(k => k.length > 5);
    }

    function updateKeyBadges() {
        const gKeys = parseKeys(geminiApiKeysTextarea.value);
        const oKeys = parseKeys(openaiApiKeysTextarea.value);

        geminiKeyCountBadge.textContent = `${gKeys.length} Key`;
        openaiKeyCountBadge.textContent = `${oKeys.length} Key`;

        statActiveKeys.textContent = currentProvider === 'gemini' ? gKeys.length : oKeys.length;
    }

    geminiApiKeysTextarea.addEventListener('input', updateKeyBadges);
    openaiApiKeysTextarea.addEventListener('input', updateKeyBadges);

    // ==================== LOAD SETTINGS ====================

    function loadSettings() {
        chrome.storage.local.get([
            'aiProvider',
            'geminiApiKeys',
            'geminiApiKey',
            'geminiModel',
            'openaiBaseUrl',
            'openaiApiKeys',
            'openaiModel',
            'openaiTemperature',
            'openaiMaxTokens',
            'geminiPrompt',
            'geminiAutoAnalyze',
            'doubleCheckModel',
            'doubleCheckPrompt',
            'tokenStats'
        ], (data) => {
            setProviderUI(data.aiProvider || 'gemini');

            // Gemini Keys
            if (data.geminiApiKeys && Array.isArray(data.geminiApiKeys)) {
                geminiApiKeysTextarea.value = data.geminiApiKeys.join('\n');
            } else if (data.geminiApiKey) {
                geminiApiKeysTextarea.value = data.geminiApiKey;
            }
            if (data.geminiModel) {
                geminiModelSelect.value = data.geminiModel;
            }

            // OpenAI Keys
            openaiBaseUrlInput.value = data.openaiBaseUrl || 'https://api.openai.com/v1';
            if (data.openaiApiKeys && Array.isArray(data.openaiApiKeys)) {
                openaiApiKeysTextarea.value = data.openaiApiKeys.join('\n');
            }
            if (data.openaiModel) {
                if (['gpt-5.6', 'gpt-5.5', 'claude-opus-4.8', 'chatgpt-4o-latest', 'o3-mini'].includes(data.openaiModel)) {
                    openaiModelSelect.value = data.openaiModel;
                } else {
                    openaiModelSelect.value = 'custom';
                    openaiCustomModel.style.display = 'block';
                    openaiCustomModel.value = data.openaiModel;
                }
            }
            if (data.openaiTemperature !== undefined && data.openaiTemperature !== '') {
                paramTemperature.value = data.openaiTemperature;
            }
            if (data.openaiMaxTokens !== undefined && data.openaiMaxTokens !== '') {
                paramMaxTokens.value = data.openaiMaxTokens;
            }

            // Double check
            doubleCheckModelSelect.value = data.doubleCheckModel || 'same_as_main';
            doubleCheckPrompt.value = data.doubleCheckPrompt || DEFAULT_DOUBLE_CHECK_PROMPT;

            promptTemplate.value = data.geminiPrompt || DEFAULT_PROMPT;
            autoAnalyze.checked = !!data.geminiAutoAnalyze;

            updateKeyBadges();

            const stats = data.tokenStats || {
                totalTokens: 0,
                promptTokens: 0,
                candidateTokens: 0,
                totalRequests: 0
            };
            statTotalTokens.textContent = stats.totalTokens.toLocaleString('vi-VN');
            statTokenDetails.textContent = `Prompt: ${stats.promptTokens.toLocaleString('vi-VN')} | Output: ${stats.candidateTokens.toLocaleString('vi-VN')}`;
            statTotalRequests.textContent = stats.totalRequests.toLocaleString('vi-VN');
        });
    }

    loadSettings();

    // ==================== RESET STATS ====================

    btnResetStats.addEventListener('click', () => {
        if (confirm('Bạn có chắc muốn đặt lại toàn bộ thống kê Token về 0?')) {
            const emptyStats = {
                totalTokens: 0,
                promptTokens: 0,
                candidateTokens: 0,
                totalRequests: 0
            };
            chrome.storage.local.set({ tokenStats: emptyStats }, () => {
                statTotalTokens.textContent = '0';
                statTokenDetails.textContent = 'Prompt: 0 | Output: 0';
                statTotalRequests.textContent = '0';
                showAlert('Đã đặt lại dữ liệu thống kê thành công.', 'success');
            });
        }
    });

    // ==================== TOAST ALERT ====================

    function showAlert(message, type = 'success') {
        alertBox.className = `alert-box alert-${type}`;
        alertBox.textContent = message;
        alertBox.style.display = 'block';
        setTimeout(() => {
            alertBox.style.display = 'none';
        }, 6000);
    }

    // ==================== SAVE SETTINGS ====================

    settingsForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const gKeys = parseKeys(geminiApiKeysTextarea.value);
        const oKeys = parseKeys(openaiApiKeysTextarea.value);
        const prompt = promptTemplate.value.trim() || DEFAULT_PROMPT;
        const dcPrompt = doubleCheckPrompt.value.trim() || DEFAULT_DOUBLE_CHECK_PROMPT;
        const auto = autoAnalyze.checked;

        if (currentProvider === 'gemini' && gKeys.length === 0) {
            showAlert('Vui lòng nhập ít nhất một Gemini API Key.', 'error');
            geminiApiKeysTextarea.focus();
            return;
        }

        if (currentProvider === 'openai' && oKeys.length === 0) {
            showAlert('Vui lòng nhập ít nhất một OpenAI / Proxy API Key.', 'error');
            openaiApiKeysTextarea.focus();
            return;
        }

        let actualOpenaiModel = openaiModelSelect.value;
        if (actualOpenaiModel === 'custom') {
            actualOpenaiModel = openaiCustomModel.value.trim() || 'gpt-5.6';
        }

        chrome.storage.local.set({
            aiProvider: currentProvider,
            // Gemini (riêng biệt)
            geminiApiKeys: gKeys,
            geminiApiKey: gKeys[0] || '',
            geminiModel: geminiModelSelect.value,
            // OpenAI (riêng biệt)
            openaiBaseUrl: openaiBaseUrlInput.value.trim() || 'https://api.openai.com/v1',
            openaiApiKeys: oKeys,
            openaiModel: actualOpenaiModel,
            openaiTemperature: paramTemperature.value ? parseFloat(paramTemperature.value) : '',
            openaiMaxTokens: paramMaxTokens.value ? parseInt(paramMaxTokens.value, 10) : '',
            // Double Check
            doubleCheckModel: doubleCheckModelSelect.value,
            doubleCheckPrompt: dcPrompt,
            // Common
            geminiPrompt: prompt,
            geminiAutoAnalyze: auto
        }, () => {
            updateKeyBadges();
            showAlert(`Đã lưu cấu hình [${currentProvider === 'gemini' ? 'Google Gemini' : 'OpenAI Compatible'}] và cài đặt Double Check thành công.`, 'success');
        });
    });

    // ==================== TEST CONNECTION ====================

    btnTestAll.addEventListener('click', async () => {
        const isGemini = currentProvider === 'gemini';
        const keys = isGemini ? parseKeys(geminiApiKeysTextarea.value) : parseKeys(openaiApiKeysTextarea.value);

        if (keys.length === 0) {
            showAlert('Vui lòng nhập API Key trước khi kiểm tra.', 'error');
            return;
        }

        let model = isGemini ? geminiModelSelect.value : (openaiModelSelect.value === 'custom' ? openaiCustomModel.value.trim() : openaiModelSelect.value);
        if (!model) model = 'gpt-5.6';

        btnTestAll.disabled = true;
        btnTestAll.textContent = `Đang kiểm tra ${keys.length} key...`;

        let successCount = 0;
        let report = [];

        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const maskedKey = key.substring(0, 6) + '...' + key.substring(key.length - 4);

            try {
                if (isGemini) {
                    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{ parts: [{ text: 'Ping' }] }],
                            generationConfig: { temperature: 0.1, maxOutputTokens: 30 }
                        })
                    });
                    const data = await response.json();
                    if (!response.ok) {
                        report.push(`Key #${i + 1} (${maskedKey}): ${data?.error?.message || `HTTP ${response.status}`}`);
                    } else {
                        successCount++;
                        report.push(`Key #${i + 1} (${maskedKey}): Hoạt động tốt (${model})`);
                    }
                } else {
                    let baseUrl = (openaiBaseUrlInput.value.trim() || 'https://api.openai.com/v1').replace(/\/+$/, '');
                    const url = `${baseUrl}/chat/completions`;

                    const response = await fetch(url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${key}`
                        },
                        body: JSON.stringify({
                            model: model,
                            messages: [{ role: 'user', content: 'Ping' }],
                            max_tokens: 30
                        })
                    });

                    const data = await response.json();
                    if (!response.ok) {
                        report.push(`Key #${i + 1} (${maskedKey}): ${data?.error?.message || `HTTP ${response.status}`}`);
                    } else {
                        successCount++;
                        report.push(`Key #${i + 1} (${maskedKey}): Hoạt động tốt (${model})`);
                    }
                }
            } catch (err) {
                report.push(`Key #${i + 1} (${maskedKey}): Lỗi mạng (${err.message})`);
            }
        }

        btnTestAll.disabled = false;
        btnTestAll.textContent = 'Kiểm tra kết nối';

        const alertType = successCount === keys.length ? 'success' : (successCount > 0 ? 'success' : 'error');
        const summary = `Kết quả kiểm tra [${isGemini ? 'Gemini: ' + model : 'OpenAI: ' + model}] (${successCount}/${keys.length} khả dụng):\n` + report.join('\n');
        showAlert(summary, alertType);
    });
});

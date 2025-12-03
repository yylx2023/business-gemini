// Debug: 确认脚本开始加载
console.log('[index.js] Script loading started...');

// [OPTIMIZATION] 1. 脚本微调以适应新的图标
        function updateThemeIcon(theme) {
            const iconContainer = document.getElementById('themeIconContainer');
            if (iconContainer) {
                const iconId = theme === 'dark' ? 'icon-sun' : 'icon-moon';
                iconContainer.innerHTML = `<svg class="icon"><use xlink:href="#${iconId}"></use></svg>`;
            }
        }

        // [OPTIMIZATION] 2. 改进Toast通知
        let toastTimeout;
        function showToast(message, type = 'info', duration = 3000) {
            const toast = document.getElementById('toast');
            if (!toast) return;

            let icon = '';
            let borderType = type; // 'success', 'error', 'info'
            switch(type) {
                case 'success':
                    icon = '<svg class="icon" style="color: var(--success);"><use xlink:href="#icon-check"></use></svg>';
                    break;
                case 'error':
                    icon = '<svg class="icon" style="color: var(--danger);"><use xlink:href="#icon-x"></use></svg>';
                    break;
                default:
                    icon = '<svg class="icon" style="color: var(--primary);"><use xlink:href="#icon-server"></use></svg>';
                    borderType = 'primary';
                    break;
            }

            toast.innerHTML = `${icon} <span class="toast-message">${message}</span>`;
            toast.className = `toast show`;
            toast.style.borderLeft = `4px solid var(--${borderType})`;

            clearTimeout(toastTimeout);
            toastTimeout = setTimeout(() => {
                toast.classList.remove('show');
            }, duration);
        }

        // =======================================================
        // [FULL SCRIPT] 以下是完整的、未删减的功能性 JavaScript 代码
        // =======================================================

        // API 基础 URL
        const API_BASE = '';

        // 全局数据缓存
        let accountsData = [];
        let modelsData = [];
        let configData = {};
        let currentEditAccountId = null;
        let currentEditModelId = null;
        const ADMIN_TOKEN_KEY = 'admin_token';

        // --- WebSocket 连接 ---
        let ws = null;
        let wsReconnectAttempts = 0;
        const MAX_RECONNECT_ATTEMPTS = 5;
        const RECONNECT_DELAY = 3000; // 3秒

        function connectWebSocket() {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}/socket.io/?EIO=4&transport=websocket`;
            
            try {
                // 使用 Socket.IO 客户端库
                if (typeof io !== 'undefined') {
                    ws = io({
                        transports: ['websocket', 'polling'],
                        reconnection: true,
                        reconnectionDelay: 1000,
                        reconnectionDelayMax: 5000,
                        reconnectionAttempts: MAX_RECONNECT_ATTEMPTS
                    });

                    ws.on('connect', () => {
                        // 调试日志已关闭
                        // console.log('[WebSocket] 连接成功');
                        wsReconnectAttempts = 0;
                        showToast('WebSocket 连接成功', 'success', 2000);
                    });

                    ws.on('disconnect', () => {
                        // 调试日志已关闭
                        // console.log('[WebSocket] 连接断开');
                        showToast('WebSocket 连接断开', 'warning', 2000);
                    });

                    ws.on('connected', (data) => {
                        // 调试日志已关闭
                        // console.log('[WebSocket] 服务器确认连接:', data);
                    });

                    // 账号更新事件
                    ws.on('account_update', (data) => {
                        // 调试日志已关闭
                        // console.log('[WebSocket] 账号更新:', data);
                        if (data.account === null) {
                            // 账号被删除
                            loadAccounts();
                        } else {
                            // 账号更新
                            loadAccounts();
                        }
                    });

                    // Cookie 刷新进度
                    ws.on('cookie_refresh_progress', (data) => {
                        // 调试日志已关闭
                        // console.log('[WebSocket] Cookie 刷新进度:', data);
                        const { account_index, status, message, progress } = data;
                        
                        if (status === 'start') {
                            showToast(`账号 ${account_index}: ${message}`, 'info', 3000);
                        } else if (status === 'success') {
                            showToast(`账号 ${account_index}: ${message}`, 'success', 3000);
                            loadAccounts();
                        } else if (status === 'error') {
                            showToast(`账号 ${account_index}: ${message}`, 'error', 5000);
                        }
                    });

                    // 系统日志
                    ws.on('system_log', (data) => {
                        // 调试日志已关闭
                        // console.log('[WebSocket] 系统日志:', data);
                        // 可以根据日志级别显示不同的提示
                        if (data.level === 'error') {
                            showToast(data.message, 'error', 5000);
                        } else if (data.level === 'warning') {
                            showToast(data.message, 'warning', 3000);
                        }
                    });

                    // 统计更新
                    ws.on('stats_update', (data) => {
                        // 调试日志已关闭
                        // console.log('[WebSocket] 统计更新:', data);
                        // 可以在这里更新统计信息
                    });

                    // 通知
                    ws.on('notification', (data) => {
                        // 调试日志已关闭
                        // console.log('[WebSocket] 通知:', data);
                        showToast(data.message || data.title, data.type || 'info', 3000);
                    });

                    // 心跳响应
                    ws.on('pong', (data) => {
                        // 调试日志已关闭
                        // console.log('[WebSocket] 心跳响应:', data);
                    });
                } else {
                    // 调试日志已关闭
                    // console.warn('[WebSocket] Socket.IO 客户端库未加载，使用轮询模式');
                }
            } catch (error) {
                // 调试日志已关闭
                // console.error('[WebSocket] 连接失败:', error);
                wsReconnectAttempts++;
                if (wsReconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                    setTimeout(connectWebSocket, RECONNECT_DELAY);
                }
            }
        }

        // --- 初始化 ---
        document.addEventListener('DOMContentLoaded', () => {
            initTheme();
            loadAllData();
            setInterval(checkServerStatus, 30000); // 每30秒检查一次服务状态
            updateLoginButton();
            
            // 连接 WebSocket
            connectWebSocket();
        });

        // --- 核心加载与渲染 ---
        async function loadAllData() {
            await Promise.all([
                loadAccounts(),
                loadModels(),
                loadConfig(),
                checkServerStatus(),
                loadLogLevel(),
                loadApiKeys()
            ]);
        }

        function getAuthHeaders() {
            const token = localStorage.getItem(ADMIN_TOKEN_KEY);
            return token ? { 'X-Admin-Token': token } : {};
        }

        function updateLoginButton() {
            const token = localStorage.getItem(ADMIN_TOKEN_KEY);
            const btn = document.getElementById('loginButton');
            if (!btn) return;
            if (token) {
                btn.textContent = '注销';
                btn.disabled = false;
                btn.classList.remove('btn-disabled');
                btn.title = '注销登录';
                btn.onclick = logoutAdmin;
            } else {
                btn.textContent = '登录';
                btn.disabled = false;
                btn.classList.remove('btn-disabled');
                btn.title = '管理员登录';
                btn.onclick = showLoginModal;
            }
        }

        async function apiFetch(url, options = {}) {
            const headers = Object.assign({}, options.headers || {}, getAuthHeaders());
            const res = await fetch(url, { ...options, headers });
            if (res.status === 401 || res.status === 403) {
                localStorage.removeItem(ADMIN_TOKEN_KEY);
                window.location.href = '/login';
                throw new Error('需要登录');
            }
            return res;
        }

        // --- 主题控制 ---
        function initTheme() {
            const savedTheme = localStorage.getItem('theme') || 'light';
            document.documentElement.setAttribute('data-theme', savedTheme);
            updateThemeIcon(savedTheme);
        }

        function toggleTheme() {
            const current = document.documentElement.getAttribute('data-theme');
            const newTheme = current === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            updateThemeIcon(newTheme);
        }

        // --- 标签页控制 ---
        function switchTab(tabName) {
            document.querySelectorAll('.tab').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            
            const tabBtn = document.querySelector(`[onclick="switchTab('${tabName}')"]`);
            const tabContent = document.getElementById(tabName);
            
            if (tabBtn) tabBtn.classList.add('active');
            if (tabContent) tabContent.classList.add('active');
            
            // 切换到 API 密钥管理时加载列表
            if (tabName === 'apiKeys') {
                loadApiKeys();
            }
            // 切换到系统设置时也加载 API 密钥（因为系统设置中也有 API 密钥管理）
            if (tabName === 'settings') {
                loadApiKeys();
            }
        }

        // --- 状态检查 ---
        async function checkServerStatus() {
            const indicator = document.getElementById('serviceStatus');
            if (!indicator) return;
            try {
                const res = await apiFetch(`${API_BASE}/api/status`);
                // 调试日志已关闭
                // console.log('Server Status Response:', res);
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            const data = await res.json();
            indicator.textContent = '服务运行中';
            indicator.classList.remove('offline');
            indicator.title = '服务连接正常 - ' + new Date().toLocaleString();
            } catch (e) {
                indicator.textContent = '服务离线';
                indicator.classList.add('offline');
                indicator.title = '无法连接到后端服务';
            }
        }

        // --- 账号管理 (Accounts) ---
        async function loadAccounts() {
            try {
                const res = await apiFetch(`${API_BASE}/api/accounts`);
                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
                }
                const data = await res.json();
                
                // 调试日志
                // 调试日志已关闭
                // console.log('[DEBUG][loadAccounts] 收到响应:', data);
                
                // 检查数据格式
                if (!data || typeof data !== 'object') {
                    // 调试日志已关闭
                    // console.error('无效的响应数据:', data);
                    throw new Error('服务器返回了无效的数据格式');
                }
                
                accountsData = Array.isArray(data.accounts) ? data.accounts : [];
                
                // 调试日志
                // 调试日志已关闭
                // console.log(`[DEBUG][loadAccounts] 解析后的账号数量: ${accountsData.length}`, accountsData);
                
                // 如果账号列表为空，记录警告
                if (accountsData.length === 0) {
                    // 调试日志已关闭
                    // console.warn('账号列表为空，可能是配置未加载或账号数据丢失');
                    // console.warn('原始响应数据:', data);
                }
                
                const currentIndexEl = document.getElementById('currentIndex');
                if (currentIndexEl) {
                    currentIndexEl.textContent = data.current_index || 0;
                }

                // 清理已删除账号的选中状态
                const currentAccountIds = new Set(accountsData.map(a => a.id));
                selectedAccountIds = new Set([...selectedAccountIds].filter(id => currentAccountIds.has(id)));

                renderAccounts();
                updateAccountStats();
                updateSelectedCount();
            } catch (e) {
                // 调试日志已关闭
                // console.error('加载账号列表失败:', e);
                // console.error('错误堆栈:', e.stack);
                showToast('加载账号列表失败: ' + e.message, 'error');
                // 即使失败也渲染空状态
                accountsData = [];
                renderAccounts();
                updateAccountStats();
            }
        }

        // 存储选中的账号 ID
        let selectedAccountIds = new Set();

        // 将选择相关函数暴露到全局作用域
        console.log('[index.js] Defining window.toggleAccountSelection...');
        window.toggleAccountSelection = function(accountId) {
            if (selectedAccountIds.has(accountId)) {
                selectedAccountIds.delete(accountId);
            } else {
                selectedAccountIds.add(accountId);
            }
            updateSelectedCount();
            updateSelectAllCheckbox();
            // 更新行的选中样式
            const row = document.querySelector(`input[data-id="${accountId}"]`)?.closest('tr');
            if (row) {
                row.classList.toggle('selected-row', selectedAccountIds.has(accountId));
            }
        };

        console.log('[index.js] Defining window.toggleSelectAll...');
        window.toggleSelectAll = function() {
            const selectAllCheckbox = document.getElementById('selectAllAccounts');
            const isChecked = selectAllCheckbox.checked;

            // 选中所有账号（批量测试不需要 tempmail_url）
            accountsData.forEach(acc => {
                if (isChecked) {
                    selectedAccountIds.add(acc.id);
                } else {
                    selectedAccountIds.delete(acc.id);
                }
            });

            updateSelectedCount();
            renderAccounts();
        };

        window.batchRefreshAccounts = async function() {
            const count = selectedAccountIds.size;
            if (count === 0) {
                showToast('请先选择要刷新的账号', 'warning');
                return;
            }

            // 过滤出有 tempmail_url 的账号
            const refreshableIds = Array.from(selectedAccountIds).filter(id => {
                const acc = accountsData.find(a => a.id === id);
                return acc && acc.tempmail_url && acc.tempmail_url.length > 0;
            });

            if (refreshableIds.length === 0) {
                showToast('选中的账号均无临时邮箱URL，无法批量刷新', 'warning');
                return;
            }

            const skippedCount = count - refreshableIds.length;
            let confirmMsg = `确定要批量刷新 ${refreshableIds.length} 个账号吗？`;
            if (skippedCount > 0) {
                confirmMsg += `\n\n注意：${skippedCount} 个账号因无临时邮箱URL将被跳过。`;
            }
            confirmMsg += `\n\n这将：\n1. 使用每个账号关联的临时邮箱\n2. 自动完成验证码验证\n3. 更新 Cookie 信息\n\n每个账号刷新成功后才会开始下一个。`;

            if (!confirm(confirmMsg)) {
                return;
            }

            const btn = document.getElementById('batchRefreshBtn');
            const originalText = btn.innerHTML;
            btn.disabled = true;

            const accountIds = refreshableIds;
            let successCount = 0;
            let failCount = 0;
            let shouldStop = false;

            for (let i = 0; i < accountIds.length && !shouldStop; i++) {
                const accountId = accountIds[i];
                const acc = accountsData.find(a => a.id === accountId);
                const displayName = acc ? (acc.tempmail_name || `账号${accountId}`) : `账号${accountId}`;

                // 更新按钮状态显示进度
                btn.innerHTML = `<svg class="icon spin"><use xlink:href="#icon-refresh-cw"></use></svg> 刷新中 (${i + 1}/${count})...`;

                showToast(`正在刷新 ${displayName} (${i + 1}/${count})...`, 'info');

                try {
                    const headers = Object.assign({}, { 'Content-Type': 'application/json' }, getAuthHeaders());
                    const res = await fetch(`${API_BASE}/api/accounts/${accountId}/auto-refresh-cookie`, {
                        method: 'POST',
                        headers: headers,
                        body: JSON.stringify({ headless: true })
                    });

                    // 处理认证失败
                    if (res.status === 401 || res.status === 403) {
                        showToast('登录已过期，请重新登录', 'error');
                        localStorage.removeItem(ADMIN_TOKEN_KEY);
                        shouldStop = true;
                        break;
                    }

                    const data = await res.json();
                    if (res.ok && data.success) {
                        successCount++;
                        showToast(`${displayName} 刷新成功!`, 'success');
                        // 刷新成功后从选中列表移除
                        selectedAccountIds.delete(accountId);
                    } else {
                        failCount++;
                        const errorMsg = data.error || data.detail || '未知错误';
                        showToast(`${displayName} 刷新失败: ${errorMsg}`, 'error');
                    }
                } catch (e) {
                    failCount++;
                    showToast(`${displayName} 刷新失败: ${e.message}`, 'error');
                    console.error(`批量刷新账号 ${accountId} 时出错:`, e);
                }

                // 如果还有下一个账号要刷新，等待一小段时间
                if (i < accountIds.length - 1 && !shouldStop) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            // 显示最终结果
            if (count > 1) {
                if (failCount === 0) {
                    showToast(`批量刷新完成！成功刷新 ${successCount} 个账号`, 'success');
                } else {
                    showToast(`批量刷新完成：成功 ${successCount} 个，失败 ${failCount} 个`, failCount > successCount ? 'error' : 'warning');
                }
            }

            // 恢复按钮状态
            btn.innerHTML = originalText;
            updateSelectedCount();

            // 刷新账号列表
            await loadAccounts();
        };

        /**
         * 批量测试账号连接
         */
        window.batchTestAccounts = async function() {
            const count = selectedAccountIds.size;
            if (count === 0) {
                showToast('请先选择要测试的账号', 'warning');
                return;
            }

            const confirmMsg = `确定要批量测试 ${count} 个选中的账号吗？\n\n这将逐个测试每个账号的 Cookie 是否有效。`;
            if (!confirm(confirmMsg)) {
                return;
            }

            const btn = document.getElementById('batchTestBtn');
            const originalText = btn.innerHTML;
            btn.disabled = true;

            const accountIds = Array.from(selectedAccountIds);
            let successCount = 0;
            let failCount = 0;
            let shouldStop = false;

            for (let i = 0; i < accountIds.length; i++) {
                if (shouldStop) break;

                const accountId = accountIds[i];
                const acc = accountsData.find(a => a.id === accountId);
                const displayName = acc?.tempmail_name || `账号 ${accountId}`;

                // 更新按钮显示进度
                btn.innerHTML = `<svg class="icon spin"><use xlink:href="#icon-refresh-cw"></use></svg> 测试中 (${i + 1}/${accountIds.length})`;

                try {
                    const headers = Object.assign({}, { 'Content-Type': 'application/json' }, getAuthHeaders());
                    const res = await fetch(`${API_BASE}/api/accounts/${accountId}/test`, {
                        method: 'GET',
                        headers: headers
                    });

                    // 处理认证失败
                    if (res.status === 401 || res.status === 403) {
                        showToast('登录已过期，请重新登录', 'error');
                        localStorage.removeItem(ADMIN_TOKEN_KEY);
                        shouldStop = true;
                        break;
                    }

                    const data = await res.json();
                    if (res.ok && data.success) {
                        successCount++;
                        showToast(`${displayName} 测试成功!`, 'success');
                    } else {
                        failCount++;
                        const errorMsg = data.error || data.detail || '未知错误';
                        showToast(`${displayName} 测试失败: ${errorMsg}`, 'error');
                    }
                } catch (e) {
                    failCount++;
                    showToast(`${displayName} 测试失败: ${e.message}`, 'error');
                    console.error(`批量测试账号 ${accountId} 时出错:`, e);
                }

                // 如果还有下一个账号要测试，等待一小段时间
                if (i < accountIds.length - 1 && !shouldStop) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }

            // 显示最终结果
            if (count > 1) {
                if (failCount === 0) {
                    showToast(`批量测试完成！${successCount} 个账号全部可用`, 'success');
                } else if (successCount === 0) {
                    showToast(`批量测试完成：${failCount} 个账号全部不可用`, 'error');
                } else {
                    showToast(`批量测试完成：${successCount} 个可用，${failCount} 个不可用`, 'warning');
                }
            }

            // 恢复按钮状态
            btn.innerHTML = originalText;
            btn.disabled = selectedAccountIds.size === 0;

            // 刷新账号列表以更新状态
            await loadAccounts();
        };

        /**
         * 更新全选复选框状态
         */
        function updateSelectAllCheckbox() {
            const selectAllCheckbox = document.getElementById('selectAllAccounts');
            if (!selectAllCheckbox) return;

            // 检查所有账号的选中状态
            const totalAccounts = accountsData.length;
            const selectedCount = accountsData.filter(acc => selectedAccountIds.has(acc.id)).length;

            if (totalAccounts === 0) {
                selectAllCheckbox.checked = false;
                selectAllCheckbox.indeterminate = false;
            } else if (selectedCount === totalAccounts) {
                selectAllCheckbox.checked = true;
                selectAllCheckbox.indeterminate = false;
            } else if (selectedCount > 0) {
                selectAllCheckbox.checked = false;
                selectAllCheckbox.indeterminate = true;
            } else {
                selectAllCheckbox.checked = false;
                selectAllCheckbox.indeterminate = false;
            }
        }

        /**
         * 更新选中数量显示
         */
        function updateSelectedCount() {
            const countEl = document.getElementById('selectedCount');
            const refreshBtn = document.getElementById('batchRefreshBtn');
            const testBtn = document.getElementById('batchTestBtn');
            const count = selectedAccountIds.size;

            if (countEl) countEl.textContent = count;
            if (refreshBtn) {
                refreshBtn.disabled = count === 0;
                refreshBtn.title = count === 0 ? '请先选择要刷新的账号' : `刷新 ${count} 个选中的账号`;
            }
            if (testBtn) {
                testBtn.disabled = count === 0;
                testBtn.title = count === 0 ? '请先选择要测试的账号' : `测试 ${count} 个选中的账号`;
            }
        }

        function renderAccounts() {
            const tbody = document.getElementById('accountsTableBody');
            if (!tbody) return;

            if (accountsData.length === 0) {
                tbody.innerHTML = `<tr><td colspan="8" class="empty-state">
                    <div class="empty-state-icon"><svg class="icon"><use xlink:href="#icon-users"></use></svg></div>
                    <h3>暂无账号</h3><p>点击 "添加账号" 按钮来创建一个。</p>
                </td></tr>`;
                updateSelectedCount();
                return;
            }

            tbody.innerHTML = accountsData.map((acc, index) => {
                const quota = acc.quota || {};
                const quotaTypes = quota.quota_types || {};
                
                // 被动检测模式：显示配额类型状态而不是计数
                let quotaDisplay = '-';
                if (quota.mode === 'passive_detection' && quotaTypes) {
                    const statusLabels = {
                        'available': '✓',
                        'cooldown': '⏸',
                        'error': '✗'
                    };
                    const statusColors = {
                        'available': 'var(--success)',
                        'cooldown': 'var(--warning)',
                        'error': 'var(--danger)'
                    };
                    
                    // 获取每个配额类型的详细信息
                    const textQuota = quotaTypes.text_queries || {};
                    const imageQuota = quotaTypes.images || {};
                    const videoQuota = quotaTypes.videos || {};
                    
                    const textStatus = textQuota.status || 'available';
                    const imageStatus = imageQuota.status || 'available';
                    const videoStatus = videoQuota.status || 'available';
                    
                    // 格式化冷却时间显示
                    function formatCooldownTime(quotaType) {
                        if (!quotaType || quotaType.status !== 'cooldown') return '';
                        const remaining = quotaType.cooldown_remaining || 0;
                        if (remaining <= 0) return '';
                        
                        const hours = Math.floor(remaining / 3600);
                        const minutes = Math.floor((remaining % 3600) / 60);
                        
                        if (hours > 0) {
                            return `（剩余 ${hours} 小时 ${minutes} 分钟）`;
                        } else {
                            return `（剩余 ${minutes} 分钟）`;
                        }
                    }
                    
                    quotaDisplay = `
                        <div style="display: flex; flex-direction: column; gap: 4px;">
                            <div style="display: flex; align-items: center; gap: 6px;">
                                <span style="color: ${statusColors[textStatus] || statusColors.available};">${statusLabels[textStatus] || '✓'}</span>
                                <span>文本</span>
                                ${textQuota.status_text ? `<span style="color: var(--text-muted); font-size: 11px; margin-left: 4px;">${textQuota.status_text}</span>` : ''}
                            </div>
                            <div style="display: flex; align-items: center; gap: 6px;">
                                <span style="color: ${statusColors[imageStatus] || statusColors.available};">${statusLabels[imageStatus] || '✓'}</span>
                                <span>图片</span>
                                ${imageQuota.status_text ? `<span style="color: var(--text-muted); font-size: 11px; margin-left: 4px;">${imageQuota.status_text}</span>` : ''}
                            </div>
                            <div style="display: flex; align-items: center; gap: 6px;">
                                <span style="color: ${statusColors[videoStatus] || statusColors.available};">${statusLabels[videoStatus] || '✓'}</span>
                                <span>视频</span>
                                ${videoQuota.status_text ? `<span style="color: var(--text-muted); font-size: 11px; margin-left: 4px;">${videoQuota.status_text}</span>` : ''}
                            </div>
                        </div>
                    `;
                    
                    // 如果有配额错误，显示错误提示
                    if (quota.quota_errors && quota.quota_errors.length > 0) {
                        const recentError = quota.quota_errors[quota.quota_errors.length - 1];
                        const errorTime = recentError.time ? new Date(recentError.time).toLocaleString('zh-CN') : '';
                        quotaDisplay += `
                            <div style="margin-top: 8px; padding: 6px; background: var(--danger-light); border-radius: var(--radius-sm); font-size: 11px; color: var(--danger);">
                                <strong>最近错误:</strong> HTTP ${recentError.status_code} (${errorTime})
                                ${recentError.quota_type ? `<br>类型: ${recentError.quota_type}` : ''}
                            </div>
                        `;
                    }
                    
                    // 如果有整体账号冷却信息，显示冷却提示（用于 401/403 等认证错误）
                    if (quota.status === 'cooldown' && quota.cooldown_remaining > 0) {
                        const hours = Math.floor(quota.cooldown_remaining / 3600);
                        const minutes = Math.floor((quota.cooldown_remaining % 3600) / 60);
                        quotaDisplay += `
                            <div style="margin-top: 8px; padding: 6px; background: var(--warning-light); border-radius: var(--radius-sm); font-size: 11px; color: #b06000;">
                                <strong>账号冷却中:</strong> ${hours > 0 ? `${hours} 小时 ` : ''}${minutes} 分钟后恢复
                                ${quota.cooldown_reason ? `<br>原因: ${quota.cooldown_reason.substring(0, 50)}${quota.cooldown_reason.length > 50 ? '...' : ''}` : ''}
                            </div>
                        `;
                    }
                } else if (quota.mode !== 'passive_detection') {
                    // 兼容旧格式（如果有计数信息）
                    const textQuota = quotaTypes.text_queries || {};
                    const imageQuota = quotaTypes.images || {};
                    const videoQuota = quotaTypes.videos || {};
                    if (textQuota.current !== undefined) {
                        quotaDisplay = `文本: ${textQuota.current}/${textQuota.limit} | 图片: ${imageQuota.current || 0}/${imageQuota.limit || 0} | 视频: ${videoQuota.current || 0}/${videoQuota.limit || 0}`;
                    }
                }
                
                const tempmailName = acc.tempmail_name || '-';
                const isSelected = selectedAccountIds.has(acc.id);
                // 检查是否有临时邮箱 URL（批量刷新需要）
                const canRefresh = acc.tempmail_url && acc.tempmail_url.length > 0;
                return `
                <tr class="${isSelected ? 'selected-row' : ''}">
                    <td>
                        <input type="checkbox"
                               class="account-checkbox"
                               data-id="${acc.id}"
                               ${isSelected ? 'checked' : ''}
                               title="${canRefresh ? '可批量刷新和测试' : '仅可批量测试（无临时邮箱URL）'}"
                               onchange="toggleAccountSelection(${acc.id})">
                    </td>
                    <td>${index + 1}</td>
                    <td><code>${acc.team_id || '-'}</code></td>
                    <td style="font-size: 12px; color: var(--text-muted);" title="${tempmailName}">${tempmailName}</td>
                    <td title="${acc.user_agent}">${acc.user_agent ? acc.user_agent.substring(0, 30) + '...' : '-'}</td>
                    <td>
                        <span class="badge ${acc.available ? 'badge-success' : 'badge-danger'}">${acc.available ? '可用' : '不可用'}</span>
                        ${acc.cookie_expired ? '<span class="badge badge-warning" style="margin-left: 8px;" title="Cookie已过期，需要刷新">⚠️ Cookie过期</span>' : ''}
                        ${renderNextRefresh(acc)}
                    </td>
                    <td style="font-size: 12px; color: var(--text-muted);">
                        ${quotaDisplay}
                    </td>
                    <td style="white-space: nowrap;">
                        <button class="btn btn-sm ${acc.available ? 'btn-warning' : 'btn-success'} btn-icon" onclick="toggleAccount(${acc.id})" title="${acc.available ? '停用' : '启用'}"><svg class="icon" style="width:16px; height:16px;"><use xlink:href="#icon-${acc.available ? 'pause' : 'play'}"></use></svg></button>
                        <button class="btn btn-sm btn-outline btn-icon" onclick="testAccount(${acc.id})" title="测试连接"><svg class="icon" style="width:16px; height:16px;"><use xlink:href="#icon-zap"></use></svg></button>
                        <button class="btn btn-sm btn-outline btn-icon" onclick="showRefreshCookieModal(${acc.id})" title="刷新Cookie"><svg class="icon" style="width:16px; height:16px;"><use xlink:href="#icon-refresh"></use></svg></button>
                        <button class="btn btn-sm btn-outline btn-icon" onclick="showEditAccountModal(${acc.id})" title="编辑"><svg class="icon" style="width:16px; height:16px;"><use xlink:href="#icon-settings"></use></svg></button>
                        <button class="btn btn-sm btn-danger btn-icon" onclick="deleteAccount(${acc.id})" title="删除"><svg class="icon" style="width:16px; height:16px;"><use xlink:href="#icon-x"></use></svg></button>
                    </td>
                </tr>
            `;
            }).join('');

            // 更新全选复选框状态
            updateSelectAllCheckbox();
        }

        function updateAccountStats() {
            document.getElementById('totalAccounts').textContent = accountsData.length;
            document.getElementById('availableAccounts').textContent = accountsData.filter(a => a.available).length;
            document.getElementById('unavailableAccounts').textContent = accountsData.length - accountsData.filter(a => a.available).length;
        }

        function renderNextRefresh(acc) {
            if (!acc || !acc.cooldown_until) return '';
            const now = Date.now();
            const ts = acc.cooldown_until * 1000;
            if (ts <= now) return '';
            const next = new Date(ts);
            const remaining = Math.max(0, ts - now);
            const minutes = Math.floor(remaining / 60000);
            const label = minutes >= 60
                ? `${Math.floor(minutes / 60)}小时${minutes % 60}分`
                : `${minutes}分`;
            return `<span class="cooldown-hint">下次恢复: ${next.toLocaleString()}（约${label}）</span>`;
        }

        function showAddAccountModal() {
            openModal('addAccountModal');
        }

        function showEditAccountModal(id) {
            const acc = accountsData.find(a => a.id === id);
            if (!acc) return;
            
            document.getElementById('editAccountId').value = id;
            document.getElementById('editTeamId').value = acc.team_id || '';
            document.getElementById('editSecureCses').value = acc.secure_c_ses || '';
            document.getElementById('editHostCoses').value = acc.host_c_oses || '';
            document.getElementById('editCsesidx').value = acc.csesidx || '';
            document.getElementById('editUserAgent').value = acc.user_agent ? acc.user_agent.replace('...', '') : '';
            document.getElementById('editTempmailName').value = acc.tempmail_name || '';
            document.getElementById('editTempmailUrl').value = acc.tempmail_url || '';
            
            openModal('editAccountModal');
        }

        async function updateAccount() {
            const id = document.getElementById('editAccountId').value;
            const account = {};
            
            const teamId = document.getElementById('editTeamId').value;
            const secureCses = document.getElementById('editSecureCses').value;
            const hostCoses = document.getElementById('editHostCoses').value;
            const csesidx = document.getElementById('editCsesidx').value;
            const userAgent = document.getElementById('editUserAgent').value;
            const tempmailName = document.getElementById('editTempmailName').value;
            const tempmailUrl = document.getElementById('editTempmailUrl').value;
            
            // team_id 字段：始终发送（包括空字符串），允许清空字段
            account.team_id = teamId || "";
            // Cookie 相关字段：始终发送（包括空字符串），允许清空字段
            account.secure_c_ses = secureCses || "";
            account.host_c_oses = hostCoses || "";
            account.csesidx = csesidx || "";
            if (userAgent) account.user_agent = userAgent;
            // 临时邮箱字段：始终发送（包括空字符串），允许清空字段
            account.tempmail_name = tempmailName || "";
            account.tempmail_url = tempmailUrl || "";
            
            try {
                const res = await apiFetch(`${API_BASE}/api/accounts/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(account)
                });
                const data = await res.json();
                
                if (data.success) {
                    showToast('账号更新成功', 'success');
                    closeModal('editAccountModal');
                    loadAccounts();
                } else {
                    showToast('更新失败: ' + (data.error || '未知错误'), 'error');
                }
            } catch (e) {
                showToast('更新失败: ' + e.message, 'error');
            }
        }

        async function saveNewAccount() {
            const teamId = document.getElementById('newTeamId').value;
            const secureCses = document.getElementById('newSecureCses').value;
            const hostCoses = document.getElementById('newHostCoses').value;
            const csesidx = document.getElementById('newCsesidx').value;
            const userAgent = document.getElementById('newUserAgent').value;

            try {
                const res = await apiFetch(`${API_BASE}/api/accounts`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        team_id: teamId,
                        "secure_c_ses": secureCses,
                        "host_c_oses": hostCoses,
                        "csesidx": csesidx,
                        "user_agent": userAgent })
                });
                const data = await res.json();
                if (!res.ok || data.error) throw new Error(data.error || data.detail || '添加失败');
                showToast('账号添加成功!', 'success');
                closeModal('addAccountModal');
                loadAccounts();
            } catch (e) {
                showToast('添加失败: ' + e.message, 'error');
            }
        }

        // 自动注册账号（创建临时邮箱 + 自动登录）- 支持批量注册
        async function autoRegisterAccount() {
            const btn = document.getElementById('autoRegisterBtn');
            const countInput = document.getElementById('autoRegisterCount');
            const originalText = btn.innerHTML;

            // 获取注册数量
            let count = parseInt(countInput.value) || 1;
            if (count < 1) count = 1;
            if (count > 100) count = 100;
            countInput.value = count;

            // 确认操作
            const confirmMsg = count === 1
                ? '确定要自动注册新账号吗？\n\n这将：\n1. 创建一个随机临时邮箱\n2. 使用该邮箱自动登录 Gemini Business\n3. 保存账号信息\n\n注意：需要配置临时邮箱服务（TEMPMAIL_WORKER_DOMAIN 和 TEMPMAIL_ADMIN_PASSWORD 环境变量）'
                : `确定要批量注册 ${count} 个新账号吗？\n\n这将顺序执行：\n1. 创建随机临时邮箱\n2. 使用该邮箱自动登录 Gemini Business\n3. 保存账号信息\n\n每个账号注册成功后才会开始下一个。\n\n注意：需要配置临时邮箱服务（TEMPMAIL_WORKER_DOMAIN 和 TEMPMAIL_ADMIN_PASSWORD 环境变量）`;

            if (!confirm(confirmMsg)) {
                return;
            }

            // 禁用按钮和输入框
            btn.disabled = true;
            countInput.disabled = true;

            let successCount = 0;
            let failCount = 0;
            let shouldStop = false;

            for (let i = 0; i < count && !shouldStop; i++) {
                // 更新按钮状态显示进度
                btn.innerHTML = `<svg class="icon spin"><use xlink:href="#icon-refresh-cw"></use></svg> 注册中 (${i + 1}/${count})...`;

                showToast(`正在注册第 ${i + 1}/${count} 个账号...`, 'info');

                try {
                    // 使用原生 fetch 避免 apiFetch 的重定向行为中断循环
                    const headers = Object.assign({}, { 'Content-Type': 'application/json' }, getAuthHeaders());
                    const res = await fetch(`${API_BASE}/api/accounts/auto-register`, {
                        method: 'POST',
                        headers: headers,
                        body: JSON.stringify({ headless: true })
                    });

                    // 处理认证失败
                    if (res.status === 401 || res.status === 403) {
                        showToast('登录已过期，请重新登录', 'error');
                        localStorage.removeItem(ADMIN_TOKEN_KEY);
                        shouldStop = true;
                        break;
                    }

                    const data = await res.json();

                    if (res.ok && data.success) {
                        successCount++;
                        showToast(`第 ${i + 1}/${count} 个账号注册成功！邮箱: ${data.email}`, 'success');
                        loadAccounts();
                    } else {
                        // 部分成功（邮箱创建成功但登录失败）
                        if (data.id !== undefined) {
                            failCount++;
                            showToast(`第 ${i + 1}/${count} 个账号：临时邮箱已创建，但登录失败: ${data.detail || data.error}`, 'warning');
                            loadAccounts();
                        } else {
                            failCount++;
                            showToast(`第 ${i + 1}/${count} 个账号注册失败: ${data.error || data.detail || '未知错误'}`, 'error');
                        }
                    }
                } catch (e) {
                    failCount++;
                    showToast(`第 ${i + 1}/${count} 个账号注册失败: ${e.message}`, 'error');
                    console.error(`批量注册第 ${i + 1} 个账号时出错:`, e);
                }

                // 如果还有下一个账号要注册，等待一小段时间
                if (i < count - 1 && !shouldStop) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            // 显示最终结果
            if (count > 1) {
                if (failCount === 0) {
                    showToast(`批量注册完成！成功注册 ${successCount} 个账号`, 'success');
                } else {
                    showToast(`批量注册完成：成功 ${successCount} 个，失败 ${failCount} 个`, failCount > successCount ? 'error' : 'warning');
                }
            }

            // 恢复按钮和输入框状态
            btn.disabled = false;
            countInput.disabled = false;
            btn.innerHTML = originalText;
        }

        function parseAccountJson(text) {
            const textarea = document.getElementById('newAccountJson');
            const raw = (typeof text === 'string' ? text : textarea.value || '').trim();
            if (!raw) {
                showToast('请先粘贴账号JSON', 'warning');
                return;
            }
            let acc;
            try {
                const parsed = JSON.parse(raw);
                acc = Array.isArray(parsed) ? parsed[0] : parsed;
                if (!acc || typeof acc !== 'object') throw new Error('格式不正确');
            } catch (err) {
                showToast('解析失败: ' + err.message, 'error');
                return;
            }

            document.getElementById('newTeamId').value = acc.team_id || '';
            document.getElementById('newSecureCses').value = acc.secure_c_ses || '';
            document.getElementById('newHostCoses').value = acc.host_c_oses || '';
            document.getElementById('newCsesidx').value = acc.csesidx || '';
            document.getElementById('newUserAgent').value = acc.user_agent || '';
            showToast('已填充账号信息', 'success');
        }

        async function pasteAccountJson() {
            try {
                const text = await navigator.clipboard.readText();
                document.getElementById('newAccountJson').value = text;
                parseAccountJson(text);
            } catch (e) {
                showToast('无法读取剪贴板: ' + e.message, 'error');
            }
        }
        
        async function deleteAccount(id) {
            if (!confirm('确定要删除这个账号吗？')) return;
            try {
                const res = await apiFetch(`${API_BASE}/api/accounts/${id}`, { method: 'DELETE' });
                if (!res.ok) throw new Error((await res.json()).detail);
                showToast('账号删除成功!', 'success');
                loadAccounts();
            } catch (e) {
                showToast('删除失败: ' + e.message, 'error');
            }
        }

        /**
         * 显示刷新Cookie的模态框
         * @param {number} id - 账号ID
         */
        function showRefreshCookieModal(id) {
            const acc = accountsData.find(a => a.id === id);
            if (!acc) {
                showToast('账号不存在', 'error');
                return;
            }
            
            document.getElementById('refreshAccountId').value = id;
            document.getElementById('refreshSecureCses').value = '';
            document.getElementById('refreshHostCoses').value = '';
            document.getElementById('refreshCsesidx').value = '';
            document.getElementById('refreshCookieJson').value = '';
            
            // 检查是否支持自动刷新（通过尝试调用 API 来检测）
            const autoRefreshBtn = document.getElementById('autoRefreshBtn');
            // 默认显示，如果后端不支持会自动隐藏
            autoRefreshBtn.style.display = 'inline-block';
            
            openModal('refreshCookieModal');
        }

        /**
         * 自动刷新账号Cookie（使用浏览器自动化）
         */
        async function autoRefreshAccountCookie() {
            const id = document.getElementById('refreshAccountId').value;
            if (!id) {
                showToast('账号ID不存在', 'error');
                return;
            }

            const btn = document.getElementById('autoRefreshBtn');
            const originalText = btn.textContent;
            btn.disabled = true;
            btn.textContent = '刷新中...';

            // 创建 AbortController 用于超时控制（5分钟超时）
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000); // 5分钟

            try {
                const res = await apiFetch(`${API_BASE}/api/accounts/${id}/auto-refresh-cookie`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ headless: true }),  // 使用无头模式
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                const data = await res.json();
                
                if (res.ok && data.success) {
                    showToast('Cookie自动刷新成功!', 'success');
                    closeModal('refreshCookieModal');
                    loadAccounts();
                } else {
                    // 提取错误信息
                    const errorMsg = data.error || '未知错误';
                    const detailMsg = data.detail || '';
                    
                    // 检查是否是 Playwright 相关错误
                    if (errorMsg.includes('Playwright') || errorMsg.includes('未安装') || errorMsg.includes('浏览器') || detailMsg.includes('playwright install')) {
                        // 显示详细的安装提示
                        const fullMsg = detailMsg ? 
                            `${errorMsg}\n${detailMsg}` : 
                            `${errorMsg}\n请运行: playwright install chromium`;
                        showToast(fullMsg, 'error', 10000);
                    } else {
                        showToast('Cookie自动刷新失败: ' + (detailMsg || errorMsg), 'error');
                    }
                }
            } catch (e) {
                clearTimeout(timeoutId);
                // 网络错误或其他异常
                let errorMsg = e.message || '未知错误';
                
                // 检查是否是超时错误
                if (e.name === 'AbortError' || errorMsg.includes('timeout') || errorMsg.includes('aborted')) {
                    showToast('自动刷新超时（超过5分钟），请检查后台日志或稍后重试', 'error', 10000);
                } else if (errorMsg.includes('Playwright') || errorMsg.includes('未安装') || errorMsg.includes('浏览器')) {
                    showToast(`自动刷新失败: ${errorMsg}\n请运行: playwright install chromium`, 'error', 10000);
                } else {
                    showToast('Cookie自动刷新失败: ' + errorMsg, 'error');
                }
            } finally {
                btn.disabled = false;
                btn.textContent = originalText;
            }
        }

        /**
         * 从JSON解析并填充刷新Cookie表单
         * @param {string} text - JSON字符串
         */
        function parseRefreshCookieJson(text) {
            const textarea = document.getElementById('refreshCookieJson');
            const raw = (typeof text === 'string' ? text : textarea.value || '').trim();
            if (!raw) {
                showToast('请先粘贴Cookie JSON', 'warning');
                return;
            }
            let acc;
            try {
                const parsed = JSON.parse(raw);
                acc = Array.isArray(parsed) ? parsed[0] : parsed;
                if (!acc || typeof acc !== 'object') throw new Error('格式不正确');
            } catch (err) {
                showToast('解析失败: ' + err.message, 'error');
                return;
            }

            document.getElementById('refreshSecureCses').value = acc.secure_c_ses || '';
            document.getElementById('refreshHostCoses').value = acc.host_c_oses || '';
            document.getElementById('refreshCsesidx').value = acc.csesidx || '';
            showToast('已填充Cookie信息', 'success');
        }

        /**
         * 从剪贴板粘贴并解析刷新Cookie JSON
         */
        async function pasteRefreshCookieJson() {
            try {
                const text = await navigator.clipboard.readText();
                document.getElementById('refreshCookieJson').value = text;
                parseRefreshCookieJson(text);
            } catch (e) {
                showToast('无法读取剪贴板: ' + e.message, 'error');
            }
        }

        /**
         * 刷新账号Cookie
         * 调用后端API更新账号的Cookie信息
         */
        async function refreshAccountCookie() {
            const id = document.getElementById('refreshAccountId').value;
            const secureCses = document.getElementById('refreshSecureCses').value.trim();
            const hostCoses = document.getElementById('refreshHostCoses').value.trim();
            const csesidx = document.getElementById('refreshCsesidx').value.trim();

            // 验证必填字段
            if (!secureCses || !hostCoses) {
                showToast('secure_c_ses 和 host_c_oses 为必填项', 'warning');
                return;
            }

            try {
                const res = await apiFetch(`${API_BASE}/api/accounts/${id}/refresh-cookie`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        secure_c_ses: secureCses,
                        host_c_oses: hostCoses,
                        csesidx: csesidx || undefined
                    })
                });
                const data = await res.json();
                
                if (res.ok && data.success) {
                    showToast('Cookie刷新成功! Cookie过期标记已清除', 'success');
                    closeModal('refreshCookieModal');
                    loadAccounts();
                } else {
                    throw new Error(data.error || data.detail || '未知错误');
                }
            } catch (e) {
                showToast('Cookie刷新失败: ' + e.message, 'error');
            }
        }

        async function testAccount(id) {
            showToast(`正在测试账号ID: ${id}...`, 'info');
            try {
                const res = await apiFetch(`${API_BASE}/api/accounts/${id}/test`);
                const data = await res.json();
                if (res.ok && data.success) {
                    showToast(`账号 ${id} 测试成功!`, 'success');
                } else {
                    // 优先显示 detail，然后是 message，最后是默认错误
                    const errorMsg = data.detail || data.message || '未知错误';
                    throw new Error(errorMsg);
                }
                loadAccounts();
            } catch (e) {
                showToast(`账号 ${id} 测试失败: ${e.message}`, 'error');
            }
        }

        async function toggleAccount(id) {
            const acc = accountsData.find(a => a.id === id);
            const action = acc && acc.available ? '停用' : '启用';
            try {
                const res = await apiFetch(`${API_BASE}/api/accounts/${id}/toggle`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                const data = await res.json();
                if (res.ok && data.success) {
                    showToast(`账号 ${id} ${action}成功!`, 'success');
                    loadAccounts();
                } else {
                    throw new Error(data.error || data.detail || '未知错误');
                }
            } catch (e) {
                showToast(`账号 ${id} ${action}失败: ${e.message}`, 'error');
            }
        }

        // --- 模型管理 (Models) ---
        async function loadModels() {
            try {
                const res = await apiFetch(`${API_BASE}/api/models`);
                const data = await res.json();
                modelsData = data.models || [];
                renderModels();
            } catch (e) {
                showToast('加载模型列表失败: ' + e.message, 'error');
            }
        }
        
        function renderModels() {
            const tbody = document.getElementById('modelsTableBody');
            if (!tbody) return;
            if (modelsData.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" class="empty-state">
                    <div class="empty-state-icon"><svg class="icon"><use xlink:href="#icon-robot"></use></svg></div>
                    <h3>暂无模型</h3><p>点击 "添加模型" 按钮来创建一个。</p>
                </td></tr>`;
                return;
            }
            tbody.innerHTML = modelsData.map(model => `
                <tr>
                    <td><code>${model.id}</code></td>
                    <td>${model.name}</td>
                    <td title="${model.description}">${model.description ? model.description.substring(0, 40) + '...' : ''}</td>
                    <td>${model.context_length}</td>
                    <td>${model.max_tokens}</td>
                    <td><span class="badge ${model.is_public ? 'badge-success' : 'badge-warning'}">${model.is_public ? '公共' : '私有'}</span></td>
                    <td>
                        <button class="btn btn-sm btn-outline btn-icon" onclick="showEditModelModal('${model.id}')" title="编辑">✏️</button>
                        <button class="btn btn-sm btn-danger btn-icon" onclick="deleteModel('${model.id}')" title="删除">🗑️</button>
                    </td>
                </tr>
            `).join('');
        }

        function showAddModelModal() {
            openModal('addModelModal');
        }

        function showEditModelModal(id) {
            const model = modelsData.find(m => m.id === id);
            if (!model) return;
            
            document.getElementById('editModelOriginalId').value = id;
            const editModelIdEl = document.getElementById('editModelId');
            if (editModelIdEl) {
                editModelIdEl.value = model.id || '';
                editModelIdEl.disabled = true; // 禁用ID编辑，因为后端不支持更新ID
            }
            const editModelNameEl = document.getElementById('editModelName');
            if (editModelNameEl) editModelNameEl.value = model.name || '';
            const editModelDescEl = document.getElementById('editModelDesc');
            if (editModelDescEl) editModelDescEl.value = model.description || '';
            const editApiModelIdEl = document.getElementById('editApiModelId');
            if (editApiModelIdEl) editApiModelIdEl.value = model.api_model_id || '';
            const editContextLengthEl = document.getElementById('editContextLength');
            if (editContextLengthEl) editContextLengthEl.value = model.context_length || 32768;
            const editMaxTokensEl = document.getElementById('editMaxTokens');
            if (editMaxTokensEl) editMaxTokensEl.value = model.max_tokens || 8192;
            
            openModal('editModelModal');
        }

        async function updateModel() {
            const originalId = document.getElementById('editModelOriginalId').value;
            const modelName = document.getElementById('editModelName').value.trim();
            const modelDesc = document.getElementById('editModelDesc').value.trim();
            const apiModelId = document.getElementById('editApiModelId').value.trim();
            const contextLength = parseInt(document.getElementById('editContextLength').value) || 32768;
            const maxTokens = parseInt(document.getElementById('editMaxTokens').value) || 8192;
            
            if (!modelName) {
                showToast('请输入模型名称', 'warning');
                return;
            }
            
            const model = {
                name: modelName,
                description: modelDesc,
                context_length: contextLength,
                max_tokens: maxTokens
            };
            
            // 如果设置了 API 模型ID，添加到请求中
            if (apiModelId) {
                model.api_model_id = apiModelId;
            } else {
                // 如果清空了，也传递 null 来删除该字段
                model.api_model_id = null;
            }
            
            try {
                const res = await apiFetch(`${API_BASE}/api/models/${originalId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(model)
                });
                const data = await res.json();
                
                if (data.success) {
                    showToast('模型更新成功', 'success');
                    closeModal('editModelModal');
                    loadModels();
                } else {
                    showToast('更新失败: ' + (data.error || '未知错误'), 'error');
                }
            } catch (e) {
                showToast('更新失败: ' + e.message, 'error');
            }
        }

        async function saveNewModel() {
            const modelId = document.getElementById('newModelId').value.trim();
            const modelName = document.getElementById('newModelName').value.trim();
            const modelDesc = document.getElementById('newModelDesc').value.trim();
            const apiModelId = document.getElementById('newApiModelId').value.trim();
            const contextLength = parseInt(document.getElementById('newContextLength').value) || 32768;
            const maxTokens = parseInt(document.getElementById('newMaxTokens').value) || 8192;
            
            if (!modelId) {
                showToast('请输入模型ID', 'warning');
                return;
            }
            if (!modelName) {
                showToast('请输入模型名称', 'warning');
                return;
            }
            
            const modelData = {
                id: modelId,
                name: modelName,
                description: modelDesc,
                context_length: contextLength,
                max_tokens: maxTokens
            };
            
            // 如果设置了 API 模型ID，添加到请求中
            if (apiModelId) {
                modelData.api_model_id = apiModelId;
            }
            
            try {
                const res = await apiFetch(`${API_BASE}/api/models`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(modelData)
                });
                const data = await res.json();
                
                if (data.success) {
                    showToast('模型添加成功', 'success');
                    closeModal('addModelModal');
                    // 清空表单
                    document.getElementById('newModelId').value = '';
                    document.getElementById('newModelName').value = '';
                    document.getElementById('newModelDesc').value = '';
                    document.getElementById('newApiModelId').value = '';
                    document.getElementById('newContextLength').value = '32768';
                    document.getElementById('newMaxTokens').value = '8192';
                    loadModels();
                } else {
                    showToast('添加失败: ' + (data.error || '未知错误'), 'error');
                }
            } catch (e) {
                showToast('添加失败: ' + e.message, 'error');
            }
        }

        async function deleteModel(modelId) {
            if (!confirm(`确定删除模型 "${modelId}" 吗？`)) return;
            
            try {
                const res = await apiFetch(`${API_BASE}/api/models/${modelId}`, {
                    method: 'DELETE'
                });
                const data = await res.json();
                
                if (data.success) {
                    showToast('模型删除成功', 'success');
                    loadModels();
                } else {
                    showToast('删除失败: ' + (data.error || '未知错误'), 'error');
                }
            } catch (e) {
                showToast('删除失败: ' + e.message, 'error');
            }
        }
        
        // --- 系统设置 (Settings) ---
        async function loadConfig() {
            try {
                const res = await apiFetch(`${API_BASE}/api/config`);
                configData = await res.json();
                
                // 处理代理配置（后端返回的是对象，包含 url, enabled, effective, available）
                if (configData.proxy && typeof configData.proxy === 'object') {
                    document.getElementById('proxyUrl').value = configData.proxy.url || '';
                    document.getElementById('proxyEnabled').checked = configData.proxy.enabled || false;
                } else {
                    // 兼容旧格式（直接是字符串）
                document.getElementById('proxyUrl').value = configData.proxy || '';
                    document.getElementById('proxyEnabled').checked = configData.proxy_enabled || false;
                }
                
                document.getElementById('uploadEndpoint').value = configData.upload_endpoint || '';
                document.getElementById('uploadApiToken').value = configData.upload_api_token || '';
                document.getElementById('imageBaseUrl').value = configData.image_base_url || '';
                document.getElementById('tempmailWorkerUrl').value = configData.tempmail_worker_url || '';
                document.getElementById('autoRefreshCookie').checked = configData.auto_refresh_cookie || false;
                document.getElementById('configJson').value = JSON.stringify(configData, null, 2);
                
                // 更新服务信息（动态获取）
                if (configData.service) {
                    document.getElementById('servicePort').value = configData.service.port || '8000';
                    document.getElementById('apiUrl').value = configData.service.api_url || 'http://localhost:8000/v1';
                }
                
                // 更新自动刷新 UI
                const autoRefreshEnabled = configData.auto_refresh_cookie || false;
                updateAutoRefreshUI(autoRefreshEnabled);
                if (autoRefreshEnabled) {
                    loadCookieCheckConfig();
                    loadCookieCheckStatus();
                    startCookieCheckStatusRefresh();
                }
            } catch (e) {
                showToast('加载配置失败: ' + e.message, 'error');
            }
        }

        async function toggleAutoRefresh() {
            const enabled = document.getElementById('autoRefreshCookie').checked;
            try {
                const res = await apiFetch(`${API_BASE}/api/config`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ auto_refresh_cookie: enabled })
                });
                if (!res.ok) {
                    throw new Error('保存失败');
                }
                showToast(enabled ? '已启用自动刷新 Cookie' : '已禁用自动刷新 Cookie', 'success');
                updateAutoRefreshUI(enabled);
                if (enabled) {
                    loadCookieCheckConfig();
                    loadCookieCheckStatus();
                }
            } catch (e) {
                showToast('设置失败: ' + e.message, 'error');
                document.getElementById('autoRefreshCookie').checked = !enabled;
            }
        }

        function updateAutoRefreshUI(enabled) {
            const statusDiv = document.getElementById('autoRefreshStatus');
            const statusText = document.getElementById('autoRefreshStatusText');
            const configDiv = document.getElementById('cookieCheckConfig');
            const checkStatusDiv = document.getElementById('cookieCheckStatus');

            if (enabled) {
                statusDiv.style.display = 'block';
                statusText.innerHTML = '✓ 自动刷新已启用';
                statusDiv.style.background = 'var(--success-light)';
                configDiv.style.display = 'block';
                checkStatusDiv.style.display = 'block';
            } else {
                statusDiv.style.display = 'none';
                configDiv.style.display = 'none';
                checkStatusDiv.style.display = 'none';
            }
        }

        async function loadCookieCheckConfig() {
            try {
                const res = await apiFetch(`${API_BASE}/api/cookie-check/config`);
                if (res.ok) {
                    const config = await res.json();
                    document.getElementById('cookieCheckInterval').value = Math.floor(config.cookie_check_interval / 60);
                    document.getElementById('cookieRefreshRetryDelay').value = Math.floor(config.cookie_refresh_retry_delay / 60);
                    document.getElementById('cookieCheckOnStartup').checked = config.cookie_check_on_startup;
                }
            } catch (e) {
                console.warn('加载 Cookie 检测配置失败:', e);
            }
        }

        async function saveCookieCheckConfig() {
            const interval = parseInt(document.getElementById('cookieCheckInterval').value) * 60;
            const retryDelay = parseInt(document.getElementById('cookieRefreshRetryDelay').value) * 60;
            const onStartup = document.getElementById('cookieCheckOnStartup').checked;

            try {
                const res = await apiFetch(`${API_BASE}/api/cookie-check/config`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        cookie_check_interval: interval,
                        cookie_refresh_retry_delay: retryDelay,
                        cookie_check_on_startup: onStartup
                    })
                });
                if (res.ok) {
                    showToast('Cookie 检测配置已保存', 'success');
                } else {
                    const data = await res.json();
                    showToast('保存失败: ' + (data.error || '未知错误'), 'error');
                }
            } catch (e) {
                showToast('保存失败: ' + e.message, 'error');
            }
        }

        async function loadCookieCheckStatus() {
            try {
                const res = await apiFetch(`${API_BASE}/api/cookie-check/status`);
                if (res.ok) {
                    const status = await res.json();
                    updateCookieCheckStatusUI(status);
                }
            } catch (e) {
                console.warn('加载 Cookie 检测状态失败:', e);
            }
        }

        function updateCookieCheckStatusUI(status) {
            // 运行状态
            const runningEl = document.getElementById('checkStatusRunning');
            if (status.is_running) {
                if (status.is_checking) {
                    runningEl.innerHTML = '<span style="color: var(--warning);">🔍 检测中...</span>';
                } else if (status.refresh_in_progress) {
                    runningEl.innerHTML = '<span style="color: var(--warning);">🔄 刷新中...</span>';
                } else {
                    runningEl.innerHTML = '<span style="color: var(--success);">✓ 运行中</span>';
                }
            } else {
                runningEl.innerHTML = '<span style="color: var(--text-muted);">未运行</span>';
            }

            // 检测次数
            document.getElementById('checkStatusCount').textContent = status.check_count || 0;

            // 上次检测时间
            const lastTimeEl = document.getElementById('checkStatusLastTime');
            if (status.last_check_time_iso) {
                const lastTime = new Date(status.last_check_time_iso);
                lastTimeEl.textContent = lastTime.toLocaleTimeString('zh-CN');
            } else {
                lastTimeEl.textContent = '-';
            }

            // 下次检测时间
            const nextTimeEl = document.getElementById('checkStatusNextTime');
            if (status.next_check_time_iso && status.seconds_until_next !== null) {
                const nextTime = new Date(status.next_check_time_iso);
                const minutes = Math.floor(status.seconds_until_next / 60);
                const seconds = status.seconds_until_next % 60;
                nextTimeEl.textContent = `${nextTime.toLocaleTimeString('zh-CN')} (${minutes}分${seconds}秒后)`;
            } else {
                nextTimeEl.textContent = '-';
            }

            // 最近结果
            const resultEl = document.getElementById('checkStatusResult');
            resultEl.textContent = status.last_check_result || '-';
        }

        async function triggerCookieCheck() {
            const btn = document.getElementById('triggerCheckBtn');
            btn.disabled = true;
            btn.innerHTML = '<svg class="icon spin" style="width: 14px; height: 14px;"><use xlink:href="#icon-refresh"></use></svg> 触发中...';

            try {
                const res = await apiFetch(`${API_BASE}/api/cookie-check/trigger`, {
                    method: 'POST'
                });
                const data = await res.json();
                if (res.ok) {
                    showToast(data.message || '已触发检测', 'success');
                    // 延迟后刷新状态
                    setTimeout(loadCookieCheckStatus, 2000);
                } else {
                    showToast(data.error || '触发失败', 'error');
                }
            } catch (e) {
                showToast('触发失败: ' + e.message, 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<svg class="icon" style="width: 14px; height: 14px;"><use xlink:href="#icon-play"></use></svg> 立即检测';
            }
        }

        // 定时刷新检测状态
        let cookieCheckStatusInterval = null;
        function startCookieCheckStatusRefresh() {
            if (cookieCheckStatusInterval) return;
            cookieCheckStatusInterval = setInterval(() => {
                const enabled = document.getElementById('autoRefreshCookie')?.checked;
                if (enabled) {
                    loadCookieCheckStatus();
                }
            }, 30000); // 每30秒刷新一次
        }

        async function loadLogLevel() {
            try {
                const res = await apiFetch(`${API_BASE}/api/logging`);
                const data = await res.json();
                const select = document.getElementById('logLevelSelect');
                if (select && data.level) {
                    select.value = data.level;
                }
            } catch (e) {
                // 调试日志已关闭
                // console.warn('日志级别加载失败', e);
            }
        }

        async function updateLogLevel(level) {
            try {
                const res = await apiFetch(`${API_BASE}/api/logging`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ level })
                });
                const data = await res.json();
                if (!res.ok || data.error) {
                    throw new Error(data.error || '设置失败');
                }
                showToast(`日志级别已切换为 ${data.level}`, 'success');
            } catch (e) {
                showToast('日志级别设置失败: ' + e.message, 'error');
            }
        }

        function copyToken(token) {
            if (!token) {
                showToast('无效的 Token', 'warning');
                return;
            }
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(token).then(() => {
                    showToast('已复制', 'success');
                }).catch(() => {
                    fallbackCopy(token);
                });
            } else {
                fallbackCopy(token);
            }
        }

        function fallbackCopy(text) {
            try {
                const textarea = document.createElement('textarea');
                textarea.value = text;
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                showToast('已复制', 'success');
            } catch (err) {
                showToast('复制失败', 'error');
            }
        }

        // --- API 密钥管理 ---
        let apiKeysData = [];

        async function loadApiKeys() {
            try {
                const res = await apiFetch(`${API_BASE}/api/api-keys`);
                const data = await res.json();
                if (!res.ok || data.error) throw new Error(data.error || '加载失败');
                apiKeysData = data.keys || [];
                renderApiKeys();
            } catch (e) {
                showToast('加载 API 密钥失败: ' + e.message, 'error');
                const container = document.getElementById('apiKeysListMain') || document.getElementById('apiKeysList');
                if (container) {
                    container.innerHTML = '<div class="empty-state">加载失败</div>';
                }
            }
        }

        function renderApiKeys() {
            // 支持两个位置：独立标签页和系统设置中
            const container = document.getElementById('apiKeysListMain') || document.getElementById('apiKeysList');
            if (!container) return;
            
            if (!apiKeysData.length) {
                container.innerHTML = '<div class="empty-state">暂无 API 密钥</div>';
                return;
            }

            container.innerHTML = apiKeysData.map(key => {
                const createdDate = key.created_at ? new Date(key.created_at).toLocaleString('zh-CN') : '未知';
                const expiresDate = key.expires_at ? new Date(key.expires_at).toLocaleString('zh-CN') : '永不过期';
                const lastUsed = key.last_used_at ? new Date(key.last_used_at).toLocaleString('zh-CN') : '从未使用';
                const isExpired = key.is_expired;
                const statusClass = !key.is_active ? 'status-inactive' : (isExpired ? 'status-expired' : 'status-active');
                const statusText = !key.is_active ? '已撤销' : (isExpired ? '已过期' : '活跃');

                return `
                    <div style="padding: 16px; background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius-md); margin-bottom: 12px;">
                        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
                            <div style="flex: 1;">
                                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                                    <strong style="color: var(--text-main);">${escapeHtml(key.name)}</strong>
                                    <span class="status-badge ${statusClass}" style="padding: 2px 8px; border-radius: 12px; font-size: 12px;">${statusText}</span>
                                </div>
                                ${key.description ? `<div style="color: var(--text-muted); font-size: 14px; margin-bottom: 8px;">${escapeHtml(key.description)}</div>` : ''}
                                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; font-size: 13px; color: var(--text-muted);">
                                    <div>创建时间: ${createdDate}</div>
                                    <div>过期时间: ${expiresDate}</div>
                                    <div>使用次数: ${key.usage_count || 0}</div>
                                    <div>最后使用: ${lastUsed}</div>
                                </div>
                            </div>
                            <div style="display: flex; gap: 8px; flex-shrink: 0;">
                                <button class="btn btn-outline btn-sm" onclick="viewApiKeyStats(${key.id})" title="查看统计">统计</button>
                                <button class="btn btn-outline btn-sm" onclick="viewApiKeyLogs(${key.id})" title="查看日志">日志</button>
                                ${key.is_active ? `<button class="btn btn-warning btn-sm" onclick="revokeApiKey(${key.id})" title="撤销密钥">撤销</button>` : ''}
                                <button class="btn btn-danger btn-sm" onclick="deleteApiKey(${key.id})" title="删除密钥">删除</button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        function openCreateApiKeyModal() {
            document.getElementById('newApiKeyName').value = '';
            document.getElementById('newApiKeyDescription').value = '';
            document.getElementById('newApiKeyExpiresDays').value = '';
            document.getElementById('newApiKeyResult').style.display = 'none';
            openModal('createApiKeyModal');
        }

        async function createApiKey() {
            const name = document.getElementById('newApiKeyName').value.trim();
            if (!name) {
                showToast('请输入密钥名称', 'warning');
                return;
            }

            const description = document.getElementById('newApiKeyDescription').value.trim();
            const expiresDays = document.getElementById('newApiKeyExpiresDays').value.trim();
            const expiresDaysNum = expiresDays ? parseInt(expiresDays) : null;

            if (expiresDays && (isNaN(expiresDaysNum) || expiresDaysNum <= 0)) {
                showToast('过期天数必须是大于0的数字', 'warning');
                return;
            }

            try {
                const res = await apiFetch(`${API_BASE}/api/api-keys`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: name,
                        description: description || null,
                        expires_days: expiresDaysNum
                    })
                });
                const data = await res.json();
                if (!res.ok || data.error) throw new Error(data.error || '创建失败');

                // 显示生成的密钥（仅显示一次）
                const resultDiv = document.getElementById('newApiKeyResult');
                resultDiv.innerHTML = `
                    <div style="padding: 16px; background: var(--warning-light); border: 1px solid var(--warning); border-radius: var(--radius-md); margin-top: 16px;">
                        <div style="color: var(--warning); font-weight: 600; margin-bottom: 8px;">⚠️ 请立即复制并保存此密钥，它将只显示一次！</div>
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <code style="flex: 1; padding: 8px; background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius-sm); word-break: break-all;">${escapeHtml(data.key)}</code>
                            <button class="btn btn-primary btn-sm" onclick="copyApiKey('${escapeHtml(data.key)}')">复制</button>
                        </div>
                    </div>
                `;
                resultDiv.style.display = 'block';
                
                showToast('API 密钥创建成功', 'success');
                loadApiKeys();
            } catch (e) {
                showToast('创建 API 密钥失败: ' + e.message, 'error');
            }
        }

        function copyApiKey(key) {
            copyToken(key);
        }

        async function revokeApiKey(keyId) {
            if (!confirm('确定要撤销此 API 密钥吗？撤销后该密钥将无法使用。')) return;
            try {
                const res = await apiFetch(`${API_BASE}/api/api-keys/${keyId}/revoke`, {
                    method: 'POST'
                });
                const data = await res.json();
                if (!res.ok || data.error) throw new Error(data.error || '撤销失败');
                showToast('API 密钥已撤销', 'success');
                loadApiKeys();
            } catch (e) {
                showToast('撤销 API 密钥失败: ' + e.message, 'error');
            }
        }

        async function deleteApiKey(keyId) {
            if (!confirm('确定要删除此 API 密钥吗？删除后该密钥及其所有调用日志将被永久删除，此操作不可恢复！')) return;
            try {
                const res = await apiFetch(`${API_BASE}/api/api-keys/${keyId}`, {
                    method: 'DELETE'
                });
                const data = await res.json();
                if (!res.ok || data.error) throw new Error(data.error || '删除失败');
                showToast('API 密钥已删除', 'success');
                loadApiKeys();
            } catch (e) {
                showToast('删除 API 密钥失败: ' + e.message, 'error');
            }
        }

        function viewApiKeyStats(keyId) {
            // 打开统计模态框
            openModal('apiKeyStatsModal');
            loadApiKeyStats(keyId);
        }

        async function loadApiKeyStats(keyId) {
            try {
                const res = await apiFetch(`${API_BASE}/api/api-keys/${keyId}/stats?days=30`);
                const data = await res.json();
                if (!res.ok || data.error) throw new Error(data.error || '加载失败');
                
                const stats = data.stats;
                document.getElementById('apiKeyStatsContent').innerHTML = `
                    <div style="padding: 16px;">
                        <h4 style="margin-bottom: 16px;">${escapeHtml(stats.key_name)} - 统计信息（最近 ${stats.period_days} 天）</h4>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px; margin-bottom: 24px;">
                            <div style="padding: 16px; background: var(--card-bg); border-radius: var(--radius-md);">
                                <div style="color: var(--text-muted); font-size: 13px; margin-bottom: 4px;">总调用次数</div>
                                <div style="font-size: 24px; font-weight: 600; color: var(--text-main);">${stats.total_calls}</div>
                            </div>
                            <div style="padding: 16px; background: var(--card-bg); border-radius: var(--radius-md);">
                                <div style="color: var(--text-muted); font-size: 13px; margin-bottom: 4px;">成功次数</div>
                                <div style="font-size: 24px; font-weight: 600; color: var(--success);">${stats.success_calls}</div>
                            </div>
                            <div style="padding: 16px; background: var(--card-bg); border-radius: var(--radius-md);">
                                <div style="color: var(--text-muted); font-size: 13px; margin-bottom: 4px;">失败次数</div>
                                <div style="font-size: 24px; font-weight: 600; color: var(--danger);">${stats.error_calls}</div>
                            </div>
                            <div style="padding: 16px; background: var(--card-bg); border-radius: var(--radius-md);">
                                <div style="color: var(--text-muted); font-size: 13px; margin-bottom: 4px;">成功率</div>
                                <div style="font-size: 24px; font-weight: 600; color: var(--text-main);">${stats.success_rate.toFixed(1)}%</div>
                            </div>
                            <div style="padding: 16px; background: var(--card-bg); border-radius: var(--radius-md);">
                                <div style="color: var(--text-muted); font-size: 13px; margin-bottom: 4px;">平均响应时间</div>
                                <div style="font-size: 24px; font-weight: 600; color: var(--text-main);">${stats.avg_response_time}ms</div>
                            </div>
                        </div>
                        ${Object.keys(stats.model_stats).length > 0 ? `
                            <div>
                                <h5 style="margin-bottom: 12px;">按模型统计</h5>
                                <div style="display: grid; gap: 8px;">
                                    ${Object.entries(stats.model_stats).map(([model, modelStat]) => `
                                        <div style="padding: 12px; background: var(--card-bg); border-radius: var(--radius-sm); display: flex; justify-content: space-between; align-items: center;">
                                            <div>
                                                <strong>${escapeHtml(model)}</strong>
                                                <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">
                                                    总计: ${modelStat.total} | 成功: ${modelStat.success} | 失败: ${modelStat.error}
                                                </div>
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                `;
            } catch (e) {
                document.getElementById('apiKeyStatsContent').innerHTML = `<div class="empty-state">加载失败: ${escapeHtml(e.message)}</div>`;
            }
        }

        function viewApiKeyLogs(keyId) {
            openModal('apiKeyLogsModal');
            loadApiKeyLogs(keyId);
        }

        async function loadApiKeyLogs(keyId, page = 1) {
            try {
                const res = await apiFetch(`${API_BASE}/api/api-keys/${keyId}/logs?page=${page}&page_size=50`);
                const data = await res.json();
                if (!res.ok || data.error) throw new Error(data.error || '加载失败');
                
                const logs = data.logs || [];
                const totalPages = data.total_pages || 1;
                
                const logsHtml = logs.length > 0 ? logs.map(log => {
                    const timestamp = log.timestamp ? new Date(log.timestamp).toLocaleString('zh-CN') : '未知';
                    const statusClass = log.status === 'success' ? 'status-success' : 'status-error';
                    return `
                        <tr>
                            <td>${timestamp}</td>
                            <td>${escapeHtml(log.model || 'N/A')}</td>
                            <td><span class="status-badge ${statusClass}">${log.status}</span></td>
                            <td>${log.response_time ? log.response_time + 'ms' : 'N/A'}</td>
                            <td>${escapeHtml(log.ip_address || 'N/A')}</td>
                            <td>${log.error_message ? `<span style="color: var(--danger);">${escapeHtml(log.error_message.substring(0, 50))}${log.error_message.length > 50 ? '...' : ''}</span>` : '-'}</td>
                        </tr>
                    `;
                }).join('') : '<tr><td colspan="6" class="empty-state">暂无日志</td></tr>';
                
                document.getElementById('apiKeyLogsContent').innerHTML = `
                    <table class="table" style="margin-top: 16px;">
                        <thead>
                            <tr>
                                <th>时间</th>
                                <th>模型</th>
                                <th>状态</th>
                                <th>响应时间</th>
                                <th>IP地址</th>
                                <th>错误信息</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${logsHtml}
                        </tbody>
                    </table>
                    ${totalPages > 1 ? `
                        <div style="display: flex; justify-content: center; gap: 8px; margin-top: 16px;">
                            <button class="btn btn-outline btn-sm" onclick="loadApiKeyLogs(${keyId}, ${page - 1})" ${page <= 1 ? 'disabled' : ''}>上一页</button>
                            <span style="padding: 8px;">第 ${page} / ${totalPages} 页</span>
                            <button class="btn btn-outline btn-sm" onclick="loadApiKeyLogs(${keyId}, ${page + 1})" ${page >= totalPages ? 'disabled' : ''}>下一页</button>
                        </div>
                    ` : ''}
                `;
            } catch (e) {
                document.getElementById('apiKeyLogsContent').innerHTML = `<div class="empty-state">加载失败: ${escapeHtml(e.message)}</div>`;
            }
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }


        async function logoutAdmin() {
            localStorage.removeItem(ADMIN_TOKEN_KEY);
            try {
                await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST' });
            } catch (err) {
                // 调试日志已关闭
                // console.warn('注销请求失败', err);
            }
            showToast('已注销，即将跳转登录页', 'success');
            setTimeout(() => {
                window.location.href = '/login';
            }, 600);
        }

        function showLoginModal() {
            document.getElementById('loginPassword').value = '';
            openModal('loginModal');
        }

        async function submitLogin() {
            const pwd = document.getElementById('loginPassword').value;
            if (!pwd) {
                showToast('请输入密码', 'warning');
                return;
            }
            try {
                const res = await fetch(`${API_BASE}/api/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: pwd })
                });
                const data = await res.json();
                if (!res.ok || data.error) {
                    throw new Error(data.error || '登录失败');
                }
                localStorage.setItem(ADMIN_TOKEN_KEY, data.token);
                showToast('登录成功', 'success');
                closeModal('loginModal');
                loadAllData();
                updateLoginButton();
            } catch (e) {
                showToast('登录失败: ' + e.message, 'error');
            }
        }

        async function saveSettings() {
            const proxyUrl = document.getElementById('proxyUrl').value;
            const proxyEnabled = document.getElementById('proxyEnabled').checked;
            const uploadEndpoint = document.getElementById('uploadEndpoint').value;
            const uploadApiToken = document.getElementById('uploadApiToken').value;
            const imageBaseUrl = document.getElementById('imageBaseUrl').value;
            const tempmailWorkerUrl = document.getElementById('tempmailWorkerUrl').value;
            try {
                const res = await apiFetch(`${API_BASE}/api/config`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        proxy: proxyUrl,
                        proxy_enabled: proxyEnabled,
                        upload_endpoint: uploadEndpoint,
                        upload_api_token: uploadApiToken,
                        image_base_url: imageBaseUrl,
                        tempmail_worker_url: tempmailWorkerUrl
                    })
                });
                if (!res.ok) throw new Error((await res.json()).detail);
                showToast('设置保存成功!', 'success');
                loadConfig();
            } catch (e) {
                showToast('保存失败: ' + e.message, 'error');
            }
        }

        async function testProxy() {
            const proxyUrl = document.getElementById('proxyUrl').value;
            const proxyStatus = document.getElementById('proxyStatus');
            proxyStatus.textContent = '测试中...';
            proxyStatus.style.color = 'var(--text-muted)';
            try {
                const res = await apiFetch(`${API_BASE}/api/proxy/test`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ proxy: proxyUrl })
                });
                const data = await res.json();
                if (res.ok && data.success) {
                    proxyStatus.textContent = `测试成功! (${data.delay_ms}ms)`;
                    proxyStatus.style.color = 'var(--success)';
                } else {
                    throw new Error(data.detail);
                }
            } catch (e) {
                proxyStatus.textContent = `测试失败: ${e.message}`;
                proxyStatus.style.color = 'var(--danger)';
            }
        }

        function refreshConfig() {
            loadConfig();
            showToast('配置已刷新', 'info');
        }

        async function downloadConfig() {
            try {
                // 使用导出接口获取完整配置（包含账号信息）
                const res = await apiFetch(`${API_BASE}/api/config/export`);
                if (!res.ok) throw new Error('导出失败');
                const fullConfig = await res.json();
                
                const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(fullConfig, null, 2));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", "business_gemini_session.json");
            document.body.appendChild(downloadAnchorNode);
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
            showToast('配置文件已开始下载', 'success');
            } catch (e) {
                showToast('导出配置失败: ' + e.message, 'error');
            }
        }
        
        function uploadConfig() {
            document.getElementById('configFileInput').click();
        }

        function handleConfigUpload(event) {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const newConfig = JSON.parse(e.target.result);
                    const res = await apiFetch(`${API_BASE}/api/config/import`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(newConfig)
                    });
                    if (!res.ok) throw new Error((await res.json()).detail);
                    showToast('配置导入成功!', 'success');
                    loadAllData();
                } catch (err) {
                    showToast('导入失败: ' + err.message, 'error');
                }
            };
            reader.readAsText(file);
        }
        
        // --- 模态框控制 ---
        function openModal(modalId) {
            const modal = document.getElementById(modalId);
            if (modal) modal.classList.add('show');
        }

        function closeModal(modalId) {
            const modal = document.getElementById(modalId);
            if (modal) modal.classList.remove('show');
        }

        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target.classList.contains('modal')) {
                    closeModal(modal.id);
                }
            });
        });
    
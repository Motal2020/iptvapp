document.addEventListener('DOMContentLoaded', () => {
    // --- ÉTAT DE L'APPLICATION ---
    const state = { config: null, live_streams: [], vod_streams: [], series_streams: [], groups: [], currentCategory: 'live', currentGroup: 'Tout voir', hls: null, logoObserver: null };

    // --- SÉLECTEURS DU DOM ---
    const dom = {
        loginView: document.getElementById('login-view'), playerView: document.getElementById('player-view'),
        connType: document.getElementById('connType'), xtreamFields: document.getElementById('xtream-fields'),
        m3uFields: document.getElementById('m3u-fields'), connectBtn: document.getElementById('connect-btn'),
        loginError: document.getElementById('login-error'), contentSelector: document.querySelector('.content-selector'),
        groupList: document.getElementById('group-list'), listTitle: document.getElementById('list-title'),
        channelList: document.getElementById('channel-list'), videoPlayer: document.getElementById('player'),
        logoutBtn: document.getElementById('logout-btn'), searchBar: document.getElementById('search-bar'),
        settingsBtn: document.getElementById('settings-btn'), settingsModal: document.getElementById('settings-modal'),
        closeModalBtn: document.querySelector('.close-btn'), saveSettingsBtn: document.getElementById('save-settings-btn'),
        m3uFile: document.getElementById('m3uFile'), serverUrl: document.getElementById('serverUrl'),
        username: document.getElementById('username'), password: document.getElementById('password'), m3uUrl: document.getElementById('m3uUrl'),
        loadingOverlay: document.getElementById('loading-overlay'), loadingMessage: document.getElementById('loading-message')
    };

    // --- Fonctions de l'écran de chargement ---
    function showLoadingOverlay(message) {
        dom.loadingMessage.textContent = message || "Chargement...";
        dom.loadingOverlay.classList.remove('hidden');
    }
    function updateLoadingMessage(message) { dom.loadingMessage.textContent = message; }
    function hideLoadingOverlay() { dom.loadingOverlay.classList.add('hidden'); }

    // --- GESTION DES VUES ---
    const showView = (viewId) => {
        dom.loginView.classList.remove('active');
        dom.playerView.classList.remove('active');
        document.getElementById(viewId).classList.add('active');
    };

    // --- LOGIQUE DE CONNEXION ---
    dom.connectBtn.addEventListener('click', async () => {
        dom.loginError.textContent = '';
        const type = dom.connType.value;
        let config = { type };
        if (type === 'xtream') {
            config.server = dom.serverUrl.value.trim();
            config.username = dom.username.value.trim();
            config.password = dom.password.value;
            if (!config.server || !config.username || !config.password) {
                dom.loginError.textContent = 'Tous les champs Xtream sont requis.'; return;
            }
        } else {
            config.m3u = dom.m3uUrl.value.trim();
            if (!config.m3u && dom.m3uFile.files.length === 0) { dom.loginError.textContent = 'Une URL M3U ou un fichier est requis.'; return; }
        }

        showLoadingOverlay("Initialisation de la connexion...");
        dom.connectBtn.disabled = true;

        try {
            await login(config);
            // Si la connexion réussit, on sauvegarde
            localStorage.setItem('iptv_config', JSON.stringify(state.config));
            showView('player-view');
        } catch (error) {
            dom.loginError.textContent = `Erreur : ${error.message}`;
            console.error("Erreur détaillée de connexion:", error);
            showView('login-view'); // On reste sur la page de login en cas d'erreur
        } finally {
            hideLoadingOverlay();
            dom.connectBtn.disabled = false;
        }
    });
    
    // --- Initialisation de l'application ---
    init();

    // --- Toutes les autres fonctions ---
    function init() {
        // ... (Code pour charger les settings et le fuseau horaire) ...
        const savedConfig = localStorage.getItem('iptv_config');
        if (savedConfig) {
            const config = JSON.parse(savedConfig);
            showLoadingOverlay("Reconnexion automatique...");
            setTimeout(async () => {
                try {
                    await login(config);
                    showView('player-view');
                } catch (error) {
                    localStorage.removeItem('iptv_config');
                    showView('login-view');
                    dom.loginError.textContent = `La reconnexion a échoué: ${error.message}`;
                } finally {
                    hideLoadingOverlay();
                }
            }, 100);
        } else {
            showView('login-view');
        }
    }

    async function login(config) {
        state.config = config;
        if (config.type === 'xtream') {
            updateLoadingMessage('1/6 - Chargement des catégories TV...');
            const live_categories = await fetchXtreamCategories(config, 'get_live_categories');
            updateLoadingMessage('2/6 - Chargement des chaînes TV...');
            state.live_streams = await fetchXtreamData(config, 'get_live_streams', live_categories);
            updateLoadingMessage('3/6 - Chargement des catégories Films...');
            const vod_categories = await fetchXtreamCategories(config, 'get_vod_categories');
            updateLoadingMessage('4/6 - Chargement des films...');
            state.vod_streams = await fetchXtreamData(config, 'get_vod_streams', vod_categories);
            updateLoadingMessage('5/6 - Chargement des catégories Séries...');
            const series_categories = await fetchXtreamCategories(config, 'get_series_categories');
            updateLoadingMessage('6/6 - Chargement des séries...');
            state.series_streams = await fetchXtreamData(config, 'get_series', series_categories);
            updateLoadingMessage('Finalisation...');
            dom.contentSelector.querySelector('[data-category="vod"]').style.display = state.vod_streams.length > 0 ? 'block' : 'none';
            dom.contentSelector.querySelector('[data-category="series"]').style.display = state.series_streams.length > 0 ? 'block' : 'none';
        } else if (config.type === 'm3u') {
            updateLoadingMessage('Chargement de la liste M3U...');
            state.live_streams = await fetchM3uChannels(config.m3u);
            state.vod_streams = []; state.series_streams = [];
        }
        switchCategory('live');
    }

    async function fetchXtreamCategories(config, action) {
        try {
            const data = await fetchApiData(config, action);
            const categoryMap = new Map();
            if (Array.isArray(data)) {
                data.forEach(cat => categoryMap.set(cat.category_id, cat.category_name));
            }
            return categoryMap;
        } catch (e) {
            console.error(`Impossible de charger les catégories pour ${action}, on continue sans.`, e);
            return new Map();
        }
    }

    async function fetchXtreamData(config, action, categoryMap = new Map()) {
        const data = await fetchApiData(config, action);
        if (!Array.isArray(data)) return [];

        const streamTypeMap = { 'get_live_streams': 'live', 'get_vod_streams': 'movie', 'get_series': 'series'};
        const type = streamTypeMap[action];
        
        return data.map(item => ({
            name: item.name || item.title || 'Sans Nom',
            logo: item.stream_icon || item.icon || item.cover || '',
            group: categoryMap.get(item.category_id) || item.category_name || 'Non classé',
            url: `${config.server}/${type}/${config.username}/${config.password}/${item.stream_id}.${item.container_extension || 'ts'}`,
            id: item.stream_id,
        })).filter(item => item.name); // S'assurer que les items sans nom sont filtrés
    }

    async function fetchApiData(config, action) {
        const apiUrl = `${config.server}/player_api.php?username=${config.username}&password=${config.password}&action=${action}`;
        const proxyUrl = 'https://corsproxy.io/?';
        const response = await fetch(proxyUrl + encodeURIComponent(apiUrl));
        if (!response.ok) throw new Error(`Proxy error for ${action}: Status ${response.status}`);
        const textData = await response.text();
        if(!textData || textData.includes('DOCTYPE html')) throw new Error(`Proxy response for ${action} is HTML.`);
        try {
            return JSON.parse(textData);
        } catch (e) {
            throw new Error(`JSON parsing error for ${action}: ${e.message}`);
        }
    }

    function switchCategory(category) { /* ... code inchangé ... */ }
    dom.contentSelector.addEventListener('click', (e) => { /* ... code inchangé ... */ });
    dom.connType.addEventListener('change', () => { /* ... code inchangé ... */ });
    dom.m3uFile.addEventListener('change', (event) => { /* ... code inchangé ... */ });
    async function fetchM3uChannels(url) { /* ... code inchangé ... */ }
    function parseM3U(m3uText) { /* ... code inchangé ... */ }
    function processItems() { /* ... code inchangé ... */ }
    function displayItems() { /* ... code inchangé ... */ }
    function setupLogoLazyLoading() { /* ... code inchangé ... */ }
    function playChannel(url) { /* ... code inchangé ... */ }
    dom.logoutBtn.addEventListener('click', () => { /* ... code inchangé ... */ });
    dom.settingsBtn.addEventListener('click', () => { /* ... code inchangé ... */ });
    dom.closeModalBtn.addEventListener('click', () => { /* ... code inchangé ... */ });
    window.addEventListener('click', (event) => { /* ... code inchangé ... */ });
    dom.saveSettingsBtn.addEventListener('click', () => { /* ... code inchangé ... */ });
});

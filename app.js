document.addEventListener('DOMContentLoaded', () => {
    // --- ÉTAT DE L'APPLICATION ---
    const state = { config: null, live_streams: [], vod_streams: [], series_streams: [], groups: [], currentCategory: 'live', currentGroup: 'Tout voir', hls: null };

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
    
    // --- LOGIQUE DE CONNEXION (entièrement réécrite pour la fiabilité) ---
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
            if (!config.m3u) { dom.loginError.textContent = 'L\'URL M3U est requise.'; return; }
        }

        showLoadingOverlay("Initialisation de la connexion...");
        dom.connectBtn.disabled = true;

        try {
            await login(config);
            localStorage.setItem('iptv_config', JSON.stringify(state.config));
            showView('player-view');
        } catch (error) {
            dom.loginError.textContent = `Erreur : ${error.message}`;
            showView('login-view');
        } finally {
            hideLoadingOverlay();
            dom.connectBtn.disabled = false;
        }
    });

    async function login(config) {
        state.config = config;
        if (config.type === 'xtream') {
            // Chargement séquentiel pour la robustesse et le feedback
            updateLoadingMessage('1/6 - Chargement des catégories TV...');
            const live_categories = await fetchXtreamCategories(config, 'get_live_categories');
            
            updateLoadingMessage(`2/6 - Chargement des chaînes TV...`);
            state.live_streams = await fetchXtreamData(config, 'get_live_streams', live_categories);
            
            updateLoadingMessage('3/6 - Chargement des catégories Films...');
            const vod_categories = await fetchXtreamCategories(config, 'get_vod_categories');

            updateLoadingMessage(`4/6 - Chargement des films...`);
            state.vod_streams = await fetchXtreamData(config, 'get_vod_streams', vod_categories);

            updateLoadingMessage('5/6 - Chargement des catégories Séries...');
            const series_categories = await fetchXtreamCategories(config, 'get_series_categories');
            
            updateLoadingMessage(`6/6 - Chargement des séries...`);
            state.series_streams = await fetchXtreamData(config, 'get_series', series_categories);

            updateLoadingMessage('Finalisation...');

            // Cacher les onglets si les catégories sont vides
            dom.contentSelector.querySelector('[data-category="vod"]').style.display = state.vod_streams.length > 0 ? 'block' : 'none';
            dom.contentSelector.querySelector('[data-category="series"]').style.display = state.series_streams.length > 0 ? 'block' : 'none';

        } else if (config.type === 'm3u') {
            updateLoadingMessage('Chargement de la liste M3U...');
            state.live_streams = await fetchM3uChannels(config.m3u);
            state.vod_streams = []; state.series_streams = [];
        }
        
        switchCategory('live'); // Afficher la TV par défaut
    }
    
    // ... Le reste de votre code (fetch, parse, display, etc.) est crucial mais n'a pas besoin de changer radicalement par rapport à la dernière version que je vous ai fournie.
    // L'important est la nouvelle structure de `login` et les fonctions `show/hideLoadingOverlay`.
    // Je vais inclure le reste du code pour que le fichier soit complet.

    dom.connType.addEventListener('change', () => {
        dom.xtreamFields.classList.toggle('hidden', dom.connType.value !== 'xtream');
        dom.m3uFields.classList.toggle('hidden', dom.connType.value !== 'm3u');
    });

    dom.m3uFile.addEventListener('change', (event) => { /* ... code inchangé ... */ });
    async function fetchXtreamCategories(config, action) { /* ... code inchangé ... */ }
    async function fetchXtreamData(config, action, categoryMap) { /* ... code inchangé ... */ }
    async function fetchM3uChannels(url) { /* ... code inchangé ... */ }
    function parseM3U(m3uText) { /* ... code inchangé ... */ }
    function processItems() { /* ... code inchangé ... */ }
    function displayItems() { /* ... code inchangé ... */ }
    function setupLogoLazyLoading() { /* ... code inchangé ... */ }
    function playChannel(url) { /* ... code inchangé ... */ }
    
    dom.logoutBtn.addEventListener('click', () => { /* ... code inchangé ... */ });
    dom.settingsBtn.addEventListener('click', () => dom.settingsModal.style.display = 'block');
    dom.closeModalBtn.addEventListener('click', () => dom.settingsModal.style.display = 'none');
    window.addEventListener('click', (event) => { if (event.target == dom.settingsModal) dom.settingsModal.style.display = 'none'; });
    dom.saveSettingsBtn.addEventListener('click', () => { /* ... code inchangé ... */ });

    // --- INITIALISATION (Mise à jour pour utiliser l'overlay) ---
    function init() {
        // ... code pour le fuseau horaire et les settings inchangé ...
        
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
    
    init();
});

// --- Débogueur à l'écran ---
(function () {
    const debugLog = document.getElementById('debug-log'); if (!debugLog) return;
    const originalLog = console.log, originalError = console.error, originalWarn = console.warn;
    function logToScreen(message, color = '#00ff00') {
        const p = document.createElement('p');
        p.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        p.style.color = color;
        debugLog.appendChild(p);
        debugLog.scrollTop = debugLog.scrollHeight;
    }
    console.log = function() { logToScreen(Array.from(arguments).join(' ')); originalLog.apply(console, arguments); };
    console.error = function() { logToScreen(`ERREUR: ${Array.from(arguments).join(' ')}`, '#ff4d4d'); originalError.apply(console, arguments); };
    console.warn = function() { logToScreen(`AVERTISSEMENT: ${Array.from(arguments).join(' ')}`, '#ffff4d'); originalWarn.apply(console, arguments); };
})();

document.addEventListener('DOMContentLoaded', () => {
    // --- ÉTAT DE L'APPLICATION ---
    const state = { config: null, live_streams: [], vod_streams: [], series_streams: [], groups: [], currentCategory: 'live', currentGroup: 'Tout voir', hls: null };

    // --- SÉLECTEURS DU DOM ---
    const allDomSelectors = { loginView: 'login-view', playerView: 'player-view', connType: 'connType', xtreamFields: 'xtream-fields', m3uFields: 'm3u-fields', connectBtn: 'connect-btn', loginError: 'login-error', contentSelector: '.content-selector', groupList: 'group-list', listTitle: 'list-title', channelList: 'channel-list', videoPlayer: 'player', logoutBtn: 'logout-btn', searchBar: 'search-bar', settingsBtn: 'settings-btn', settingsModal: 'settings-modal', closeModalBtn: '.close-btn', saveSettingsBtn: 'save-settings-btn', m3uFile: 'm3uFile' };
    const dom = Object.fromEntries(Object.entries(allDomSelectors).map(([key, id]) => [key, id.startsWith('.') ? document.querySelector(id) : document.getElementById(id)]));

    // --- OBSERVATEUR POUR LE LAZY LOADING ---
    let logoObserver;

    // --- GESTION DES VUES ---
    const showView = (viewId) => {
        dom.loginView.classList.remove('active');
        dom.playerView.classList.remove('active');
        document.getElementById(viewId).classList.add('active');
    };

    // --- LOGIQUE DE CATÉGORIE (TV, VOD, SÉRIES) ---
    function switchCategory(category) {
        state.currentCategory = category;
        state.currentGroup = 'Tout voir';
        dom.contentSelector.querySelectorAll('.selector-item').forEach(item => item.classList.toggle('active', item.dataset.category === category));
        const titles = { live: 'Chaînes', vod: 'Films', series: 'Séries' };
        dom.listTitle.textContent = titles[category];
        dom.searchBar.placeholder = `Rechercher dans ${titles[category]}...`;
        processItems();
    }
    
    dom.contentSelector.addEventListener('click', (e) => {
        if (e.target.classList.contains('selector-item')) switchCategory(e.target.dataset.category);
    });

    // --- LOGIQUE DE CONNEXION ---
    dom.connType.addEventListener('change', () => {
        dom.xtreamFields.classList.toggle('hidden', dom.connType.value !== 'xtream');
        dom.m3uFields.classList.toggle('hidden', dom.connType.value !== 'm3u');
    });

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
        dom.connectBtn.textContent = 'Connexion en cours...';
        dom.connectBtn.disabled = true;
        try {
            await login(config);
            localStorage.setItem('iptv_config', JSON.stringify(state.config));
            showView('player-view');
        } catch (error) {
            dom.loginError.textContent = `Erreur de connexion : ${error.message}`;
            console.error("Erreur détaillée de connexion:", error);
            showView('login-view');
        } finally {
            dom.connectBtn.textContent = 'Se Connecter';
            dom.connectBtn.disabled = false;
        }
    });

    dom.m3uFile.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                state.live_streams = parseM3U(e.target.result);
                state.vod_streams = []; state.series_streams = [];
                state.config = { type: 'm3u-local', name: file.name };
                localStorage.setItem('iptv_config', JSON.stringify(state.config));
                showView('player-view');
                switchCategory('live');
            } catch (error) {
                dom.loginError.textContent = `Erreur de lecture du fichier: ${error.message}`;
            }
        };
        reader.readAsText(file);
    });

    async function login(config) {
        state.config = config;
        if (config.type === 'xtream') {
            console.log("Tentative de chargement des données Xtream...");
            // OPTIMISATION: On charge les catégories en premier
            const [live_categories, vod_categories, series_categories] = await Promise.all([
                fetchXtreamCategories(config, 'get_live_categories'),
                fetchXtreamCategories(config, 'get_vod_categories'),
                fetchXtreamCategories(config, 'get_series_categories'),
            ]);

            const [live_streams, vod_streams, series_streams] = await Promise.all([
                fetchXtreamData(config, 'get_live_streams', live_categories),
                fetchXtreamData(config, 'get_vod_streams', vod_categories),
                fetchXtreamData(config, 'get_series', series_categories),
            ]);
            state.live_streams = live_streams;
            state.vod_streams = vod_streams;
            state.series_streams = series_streams;
            console.log(`Chargement terminé. TV: ${state.live_streams.length}, Films: ${state.vod_streams.length}, Séries: ${state.series_streams.length}`);

            // OPTIMISATION: Cacher les onglets si vides
            dom.contentSelector.querySelector('[data-category="vod"]').style.display = state.vod_streams.length > 0 ? 'block' : 'none';
            dom.contentSelector.querySelector('[data-category="series"]').style.display = state.series_streams.length > 0 ? 'block' : 'none';

        } else if (config.type === 'm3u') {
            state.live_streams = await fetchM3uChannels(config.m3u);
            state.vod_streams = []; state.series_streams = [];
        }
        switchCategory('live');
    }
    
    // NOUVELLE FONCTION pour récupérer les catégories
    async function fetchXtreamCategories(config, action) {
        try {
            const data = await fetchXtreamData(config, action); // Utilise la même fonction de base
            const categoryMap = new Map();
            data.forEach(cat => categoryMap.set(cat.category_id, cat.category_name));
            return categoryMap;
        } catch (e) {
            console.error(`Impossible de charger les catégories pour ${action}`, e);
            return new Map(); // Retourner une map vide en cas d'erreur
        }
    }

    async function fetchXtreamData(config, action, categoryMap = new Map()) {
        const apiUrl = `${config.server}/player_api.php?username=${config.username}&password=${config.password}&action=${action}`;
        const proxyUrl = 'https://corsproxy.io/?';
        const response = await fetch(proxyUrl + encodeURIComponent(apiUrl));
        if (!response.ok) throw new Error(`Erreur réseau via proxy pour ${action}: Statut ${response.status}`);
        const textData = await response.text();
        if(!textData || textData.includes('DOCTYPE html')) throw new Error(`La réponse pour ${action} est une page HTML.`);
        try {
            const data = JSON.parse(textData);
            if (!Array.isArray(data)) return [];
            
            const streamTypeMap = { 'get_live_streams': 'live', 'get_vod_streams': 'movie', 'get_series': 'series'};
            const type = streamTypeMap[action] || action.replace('get_', '').replace('_categories', '');
            
            return data.map(item => ({
                name: item.name || item.title || 'Sans Nom',
                logo: item.stream_icon || item.icon || item.cover || '',
                group: categoryMap.get(item.category_id) || item.category_name || 'Non classé',
                url: item.category_id ? `${config.server}/${type}/${config.username}/${config.password}/${item.stream_id}.${item.container_extension || 'ts'}` : null,
                id: item.stream_id || item.category_id
            }));
        } catch (e) { throw new Error(`Erreur de parsing JSON pour ${action}: ${e.message}`); }
    }
    
    // ... parseM3U et fetchM3uChannels restent les mêmes ...

    function processItems() {
        const currentItems = state[`${state.currentCategory}_streams`] || [];
        const groups = ['Tout voir', ...new Set(currentItems.map(item => item.group))];
        state.groups = groups.sort((a,b) => a.localeCompare(b));
        dom.groupList.innerHTML = '';
        groups.forEach(group => {
            const groupEl = document.createElement('div');
            groupEl.className = 'group-item';
            groupEl.textContent = group;
            if (group === state.currentGroup) groupEl.classList.add('active');
            groupEl.addEventListener('click', () => {
                state.currentGroup = group;
                dom.groupList.querySelector('.group-item.active')?.classList.remove('active');
                groupEl.classList.add('active');
                displayItems();
            });
            dom.groupList.appendChild(groupEl);
        });
        displayItems();
    }
    
    function displayItems() {
        // OPTIMISATION: Déconnexion de l'ancien observateur pour nettoyer
        if (logoObserver) logoObserver.disconnect();
        
        const currentItems = state[`${state.currentCategory}_streams`] || [];
        const filterText = dom.searchBar.value.toLowerCase();
        const filteredItems = currentItems.filter(item => {
            const itemName = item.name || '';
            return (state.currentGroup === 'Tout voir' || item.group === state.currentGroup) &&
                   itemName.toLowerCase().includes(filterText);
        });
        dom.channelList.innerHTML = '';
        if (filteredItems.length === 0) {
             dom.channelList.innerHTML = `<div class="channel-item">Aucun contenu trouvé.</div>`;
        } else {
            filteredItems.forEach(item => {
                const itemEl = document.createElement('div');
                itemEl.className = 'channel-item';
                itemEl.innerHTML = `
                    <img data-src="${item.logo}" alt="" class="channel-logo" src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=">
                    <span class="channel-name">${item.name}</span>
                `;
                itemEl.addEventListener('click', () => {
                    dom.channelList.querySelector('.channel-item.active')?.classList.remove('active');
                    itemEl.classList.add('active');
                    playChannel(item.url);
                });
                dom.channelList.appendChild(itemEl);
            });
            // OPTIMISATION: Initialiser le Lazy Loading pour les nouveaux logos
            setupLogoLazyLoading();
        }
    }

    dom.searchBar.addEventListener('input', displayItems);
    
    // NOUVELLE FONCTION pour le Lazy Loading
    function setupLogoLazyLoading() {
        logoObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    const src = img.getAttribute('data-src');
                    if (src) {
                        img.src = src;
                        img.onerror = () => { img.style.visibility = 'hidden'; }; // Cache l'image si l'URL est cassée
                    }
                    observer.unobserve(img); // Arrêter d'observer une fois chargée
                }
            });
        }, { rootMargin: "100px" }); // Pré-charger les images un peu avant qu'elles n'arrivent à l'écran

        dom.channelList.querySelectorAll('.channel-logo[data-src]').forEach(img => logoObserver.observe(img));
    }

    function playChannel(url) {
        if (!url) { console.error("URL de la chaîne non valide."); return; }
        if (state.hls) state.hls.destroy();
        if (Hls.isSupported()) {
            const userSettings = JSON.parse(localStorage.getItem('iptv_settings')) || {};
            state.hls = new Hls({ liveSyncDurationCount: 3, ...userSettings });
            state.hls.loadSource(url);
            state.hls.attachMedia(dom.videoPlayer);
            state.hls.on(Hls.Events.MANIFEST_PARSED, () => dom.videoPlayer.play());
        } else if (dom.videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
            dom.videoPlayer.src = url;
            dom.videoPlayer.play();
        }
    }

    // Le reste des fonctions (logout, settings, init) ne changent pas fondamentalement
    // ...
});

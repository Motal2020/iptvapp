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
            if (!config.server || !config.username || !config.password) { dom.loginError.textContent = 'Tous les champs Xtream sont requis.'; return; }
        } else {
            config.m3u = dom.m3uUrl.value.trim();
            if (!config.m3u && dom.m3uFile.files.length === 0) { dom.loginError.textContent = 'Une URL M3U ou un fichier est requis.'; return; }
        }

        showLoadingOverlay("Initialisation de la connexion...");
        dom.connectBtn.disabled = true;

        try {
            await login(config);
            localStorage.setItem('iptv_config', JSON.stringify(state.config));
            showView('player-view');
        } catch (error) {
            dom.loginError.textContent = `Erreur : ${error.message}`;
            console.error("Erreur détaillée de connexion:", error);
            showView('login-view');
        } finally {
            hideLoadingOverlay();
            dom.connectBtn.disabled = false;
        }
    });
    
    // --- Initialisation de l'application ---
    init();

    // --- Toutes les autres fonctions ---
    function init() {
        const timezoneSelect = document.getElementById('timezone-config');
        try {
            const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            timezoneSelect.innerHTML = `<option value="${userTimezone}">${userTimezone} (Votre fuseau)</option>`;
            const commonTimezones = ["UTC", "Europe/Paris", "America/New_York", "Asia/Tokyo"];
            commonTimezones.forEach(tz => {
                if (tz !== userTimezone) timezoneSelect.innerHTML += `<option value="${tz}">${tz}</option>`;
            });
        } catch(e) { timezoneSelect.innerHTML = `<option value="UTC">UTC</option>`; }
        
        const savedSettings = localStorage.getItem('iptv_settings');
        if (savedSettings) {
            const settings = JSON.parse(savedSettings);
            document.getElementById('latency-config').value = settings.latency || 1;
            document.getElementById('parental-code').value = settings.parentalCode || '';
            if(settings.timezone) timezoneSelect.value = settings.timezone;
        }

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

    async function fetchApiData(config, action) {
        const apiUrl = `${config.server}/player_api.php?username=${config.username}&password=${config.password}&action=${action}`;
        const proxyUrl = 'https://corsproxy.io/?';
        const response = await fetch(proxyUrl + encodeURIComponent(apiUrl));
        if (!response.ok) throw new Error(`Proxy error for ${action}: Status ${response.status}`);
        const textData = await response.text();
        if(!textData || textData.includes('DOCTYPE html')) throw new Error(`Proxy response for ${action} is HTML.`);
        try { return JSON.parse(textData); } 
        catch (e) { throw new Error(`JSON parsing error for ${action}: ${e.message}`); }
    }

    async function fetchXtreamCategories(config, action) {
        try {
            const data = await fetchApiData(config, action);
            const categoryMap = new Map();
            if (Array.isArray(data)) data.forEach(cat => categoryMap.set(cat.category_id, cat.category_name));
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
        
        return data.filter(item => item.name || item.title).map(item => ({
            name: item.name || item.title,
            logo: item.stream_icon || item.icon || item.cover || '',
            group: categoryMap.get(item.category_id) || item.category_name || 'Non classé',
            url: `${config.server}/${type}/${config.username}/${config.password}/${item.stream_id}.${item.container_extension || 'ts'}`,
            id: item.stream_id,
            epgId: item.epg_channel_id // NOUVEAU: On récupère l'ID EPG
        }));
    }

    function switchCategory(category) {
        state.currentCategory = category;
        state.currentGroup = 'Tout voir';
        dom.contentSelector.querySelectorAll('.selector-item').forEach(item => {
            item.classList.toggle('active', item.dataset.category === category);
        });
        const titles = { live: 'Chaînes', vod: 'Films', series: 'Séries' };
        dom.listTitle.textContent = titles[category];
        dom.searchBar.placeholder = `Rechercher dans ${titles[category]}...`;
        processItems();
    }
    
    function processItems() {
        if (state.logoObserver) state.logoObserver.disconnect();
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
                dom.groupList.querySelector('.group-item.active')?.classList.remove('active');
                groupEl.classList.add('active');
                state.currentGroup = group;
                displayItems();
            });
            dom.groupList.appendChild(groupEl);
        });
        displayItems();
    }
    
    function displayItems() {
        if (state.logoObserver) state.logoObserver.disconnect();
        const currentItems = state[`${state.currentCategory}_streams`] || [];
        const filterText = dom.searchBar.value.toLowerCase();
        const filteredItems = currentItems.filter(item => 
            (state.currentGroup === 'Tout voir' || item.group === state.currentGroup) &&
            (item.name || '').toLowerCase().includes(filterText)
        );
        dom.channelList.innerHTML = '';
        if (filteredItems.length === 0) {
            dom.channelList.innerHTML = `<div class="channel-item">Aucun contenu trouvé.</div>`;
        } else {
            filteredItems.forEach(item => {
                const itemEl = document.createElement('div');
                itemEl.className = 'channel-item';
                itemEl.innerHTML = `<img data-src="${item.logo}" alt="" class="channel-logo" src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="><span class="channel-name">${item.name}</span>`;
                itemEl.addEventListener('click', () => {
                    dom.channelList.querySelector('.channel-item.active')?.classList.remove('active');
                    itemEl.classList.add('active');
                    playChannel(item.url);
                });
                dom.channelList.appendChild(itemEl);
            });
            setupLogoLazyLoading();
        }
    }

    function setupLogoLazyLoading() {
        state.logoObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    const src = img.getAttribute('data-src');
                    if (src) {
                        img.src = src;
                        img.onerror = () => { img.style.visibility = 'hidden'; };
                    }
                    observer.unobserve(img);
                }
            });
        }, { rootMargin: "100px" });
        dom.channelList.querySelectorAll('.channel-logo[data-src]').forEach(img => state.logoObserver.observe(img));
    }

    // MISE À JOUR MAJEURE de playChannel pour ne plus geler
    function playChannel(url) {
        if (!url) {
            console.error("URL de la chaîne non valide.");
            return;
        }

        // Détruire l'ancienne instance de HLS si elle existe
        if (state.hls) {
            state.hls.destroy();
        }

        // Afficher un état de chargement sur le lecteur
        // (Optionnel, mais bonne UX)
        dom.videoPlayer.poster = ''; // Effacer l'ancienne image

        if (Hls.isSupported()) {
            const hls = new Hls({
                // Un timeout de 5 secondes pour le chargement initial
                manifestLoadtimeout: 5000, 
            });

            hls.loadSource(url);
            hls.attachMedia(dom.videoPlayer);

            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                dom.videoPlayer.play();
            });

            // C'EST LA PARTIE LA PLUS IMPORTANTE
            hls.on(Hls.Events.ERROR, function (event, data) {
                if (data.fatal) {
                    switch (data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            console.error('Erreur réseau fatale :', data);
                            // Le flux n'a pas pu être chargé (CORS ou autre)
                            hls.destroy();
                            alert("Erreur de lecture : Impossible de charger le flux.\nCela est probablement dû à une restriction CORS du fournisseur.\nL'application ne gèlera pas.");
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            console.error('Erreur média fatale :', data);
                            hls.recoverMediaError();
                            break;
                        default:
                            // Erreur inconnue, on détruit pour éviter le gel
                            hls.destroy();
                            break;
                    }
                }
            });
            state.hls = hls;

        } else if (dom.videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
            dom.videoPlayer.src = url;
            dom.videoPlayer.play();
        }
    }
    
    // Le reste des fonctions (logout, settings, etc.)
    dom.logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('iptv_config');
        location.reload();
    });
    // ... et tous les autres écouteurs d'événements restent identiques
});

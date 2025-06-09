// --- Débogueur à l'écran ---
(function () {
    const debugLog = document.getElementById('debug-log');
    if (!debugLog) return;
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
// --- Fin du débogueur à l'écran ---


document.addEventListener('DOMContentLoaded', () => {
    // --- ÉTAT DE L'APPLICATION ---
    const state = {
        config: null, live_streams: [], vod_streams: [], series_streams: [],
        groups: [], currentCategory: 'live', currentGroup: 'Tout voir', hls: null,
    };

    // --- SÉLECTEURS D'ÉLÉMENTS DU DOM ---
    const loginView = document.getElementById('login-view'), playerView = document.getElementById('player-view'),
        connTypeEl = document.getElementById('connType'), xtreamFields = document.getElementById('xtream-fields'),
        m3uFields = document.getElementById('m3u-fields'), connectBtn = document.getElementById('connect-btn'),
        loginError = document.getElementById('login-error'), contentSelector = document.querySelector('.content-selector'),
        groupList = document.getElementById('group-list'), listTitle = document.getElementById('list-title'),
        channelList = document.getElementById('channel-list'), videoPlayer = document.getElementById('player'),
        logoutBtn = document.getElementById('logout-btn'), searchBar = document.getElementById('search-bar'),
        settingsBtn = document.getElementById('settings-btn'), settingsModal = document.getElementById('settings-modal'),
        closeModalBtn = document.querySelector('.close-btn'), saveSettingsBtn = document.getElementById('save-settings-btn'),
        m3uFileEl = document.getElementById('m3uFile');

    // --- GESTION DES VUES ---
    const showView = (viewId) => {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById(viewId).classList.add('active');
    };

    // --- LOGIQUE DE CATÉGORIE (TV, VOD, SÉRIES) ---
    function switchCategory(category) {
        state.currentCategory = category;
        state.currentGroup = 'Tout voir';
        document.querySelectorAll('.selector-item').forEach(item => {
            item.classList.toggle('active', item.dataset.category === category);
        });
        const titles = { live: 'Chaînes', vod: 'Films', series: 'Séries' };
        listTitle.textContent = titles[category];
        searchBar.placeholder = `Rechercher dans ${titles[category]}...`;
        processItems();
    }
    
    contentSelector.addEventListener('click', (e) => {
        if (e.target.classList.contains('selector-item')) {
            switchCategory(e.target.dataset.category);
        }
    });

    // --- LOGIQUE DE CONNEXION ---
    connTypeEl.addEventListener('change', () => {
        xtreamFields.classList.toggle('hidden', connTypeEl.value !== 'xtream');
        m3uFields.classList.toggle('hidden', connTypeEl.value !== 'm3u');
    });

    connectBtn.addEventListener('click', async () => {
        loginError.textContent = '';
        const type = connTypeEl.value;
        let config = { type };
        if (type === 'xtream') {
            config.server = document.getElementById('serverUrl').value.trim();
            config.username = document.getElementById('username').value.trim();
            config.password = document.getElementById('password').value;
            if (!config.server || !config.username || !config.password) {
                loginError.textContent = 'Tous les champs Xtream sont requis.'; return;
            }
        } else {
            config.m3u = document.getElementById('m3uUrl').value.trim();
            if (!config.m3u) {
                loginError.textContent = 'L\'URL M3U est requise.'; return;
            }
        }
        connectBtn.textContent = 'Connexion en cours...';
        connectBtn.disabled = true;
        try {
            await login(config);
            localStorage.setItem('iptv_config', JSON.stringify(state.config));
            showView('player-view');
        } catch (error) {
            loginError.textContent = `Erreur de connexion : ${error.message}`;
            showView('login-view');
        } finally {
            connectBtn.textContent = 'Se Connecter';
            connectBtn.disabled = false;
        }
    });

    m3uFileEl.addEventListener('change', (event) => {
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
                loginError.textContent = `Erreur de lecture du fichier: ${error.message}`;
            }
        };
        reader.readAsText(file);
    });

    async function login(config) {
        state.config = config;
        if (config.type === 'xtream') {
            console.log("Tentative de chargement des données Xtream...");
            const results = await Promise.allSettled([
                fetchXtreamData(config, 'get_live_streams'),
                fetchXtreamData(config, 'get_vod_streams'),
                fetchXtreamData(config, 'get_series'),
            ]);
            state.live_streams = results[0].status === 'fulfilled' ? results[0].value : [];
            state.vod_streams = results[1].status === 'fulfilled' ? results[1].value : [];
            state.series_streams = results[2].status === 'fulfilled' ? results[2].value : [];
            if(results[0].status === 'rejected') console.error("Échec du chargement de la TV Live:", results[0].reason.message);
            if(results[1].status === 'rejected') console.error("Échec du chargement des Films:", results[1].reason.message);
            if(results[2].status === 'rejected') console.error("Échec du chargement des Séries:", results[2].reason.message);
            console.log(`Chargement terminé. TV: ${state.live_streams.length}, Films: ${state.vod_streams.length}, Séries: ${state.series_streams.length}`);
        } else if (config.type === 'm3u') {
            state.live_streams = await fetchM3uChannels(config.m3u);
            state.vod_streams = []; state.series_streams = [];
        }
        switchCategory('live');
    }
    
    async function fetchXtreamData(config, action) {
        const apiUrl = `${config.server}/player_api.php?username=${config.username}&password=${config.password}&action=${action}`;
        // ON CHANGE DE PROXY ICI !
        const proxyUrl = 'https://corsproxy.io/?';
        console.log(`Chargement de : ${action} via ${proxyUrl}`);
        const response = await fetch(proxyUrl + encodeURIComponent(apiUrl));
        if (!response.ok) {
            throw new Error(`Erreur réseau via proxy pour ${action}: Statut ${response.status}`);
        }
        const textData = await response.text();
        if(!textData || textData.includes('DOCTYPE html')) {
             throw new Error(`La réponse pour ${action} est une page HTML, pas du JSON. Le proxy est peut-être bloqué.`);
        }
        try {
            const data = JSON.parse(textData);
            if (!Array.isArray(data)) {
                if (data && data.user_info && data.user_info.auth === 0) {
                    throw new Error(`Échec de l'authentification pour ${action}: vérifiez les identifiants.`);
                }
                console.warn(`La réponse pour ${action} n'est pas un tableau, mais un objet.`, data);
                return [];
            }
            console.log(`${data.length} éléments trouvés pour ${action}.`);
            const streamTypeMap = { 'get_live_streams': 'live', 'get_vod_streams': 'movie', 'get_series': 'series'};
            const type = streamTypeMap[action];
            return data.map(item => ({
                name: item.name, logo: item.stream_icon || item.icon || '', group: item.category_name || 'Non classé',
                url: `${config.server}/${type}/${config.username}/${config.password}/${item.stream_id}.${item.container_extension || 'ts'}`,
                id: item.stream_id,
            }));
        } catch (e) {
            throw new Error(`Erreur de parsing JSON pour ${action}: ${e.message}`);
        }
    }
    
    async function fetchM3uChannels(url) {
        try {
            const proxyUrl = 'https://corsproxy.io/?'; // On change le proxy ici aussi
            const response = await fetch(proxyUrl + encodeURIComponent(url));
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const m3uText = await response.text();
            return parseM3U(m3uText);
        } catch (e) {
            throw new Error("Impossible de télécharger ou parser le fichier M3U.");
        }
    }

    function parseM3U(m3uText) {
        const lines = m3uText.split('\n'); const channels = [];
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith('#EXTINF:')) {
                const infoMatch = lines[i].match(/#EXTINF:-1(?:.*?tvg-id="([^"]*)")?(?:.*?tvg-name="([^"]*)")?(?:.*?tvg-logo="([^"]*)")?(?:.*?group-title="([^"]*)")?,(.+)/);
                if (infoMatch) {
                    const url = lines[++i]?.trim();
                    if(url){
                        channels.push({
                            id: infoMatch[1] || '', name: infoMatch[5] ? infoMatch[5].trim() : (infoMatch[2] || 'Nom inconnu'),
                            logo: infoMatch[3] || '', group: infoMatch[4] || 'Non classé', url: url
                        });
                    }
                }
            }
        }
        return channels;
    }

    function processItems() {
        const currentItems = state[`${state.currentCategory}_streams`] || [];
        const groups = ['Tout voir', ...new Set(currentItems.map(item => item.group))];
        state.groups = groups.sort((a,b) => a.localeCompare(b));
        groupList.innerHTML = '';
        groups.forEach(group => {
            const groupEl = document.createElement('div');
            groupEl.className = 'group-item';
            groupEl.textContent = group;
            if (group === state.currentGroup) groupEl.classList.add('active');
            groupEl.addEventListener('click', () => {
                state.currentGroup = group;
                document.querySelector('.group-item.active')?.classList.remove('active');
                groupEl.classList.add('active');
                displayItems();
            });
            groupList.appendChild(groupEl);
        });
        displayItems();
    }
    
    function displayItems() {
        const currentItems = state[`${state.currentCategory}_streams`] || [];
        const filterText = searchBar.value.toLowerCase();
        const filteredItems = currentItems.filter(item => 
            (state.currentGroup === 'Tout voir' || item.group === state.currentGroup) &&
            item.name.toLowerCase().includes(filterText)
        );
        channelList.innerHTML = '';
        if (filteredItems.length === 0 && currentItems.length > 0) {
            channelList.innerHTML = `<div class="channel-item">Aucun résultat pour "${searchBar.value}"</div>`;
        } else if (currentItems.length === 0) {
             channelList.innerHTML = `<div class="channel-item">Aucun contenu trouvé pour cette catégorie.</div>`;
        } else {
            filteredItems.forEach(item => {
                const itemEl = document.createElement('div');
                itemEl.className = 'channel-item';
                itemEl.innerHTML = `
                    <img src="${item.logo}" alt="" class="channel-logo" onerror="this.src='data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='">
                    <span class="channel-name">${item.name}</span>
                `;
                itemEl.addEventListener('click', () => {
                    document.querySelector('.channel-item.active')?.classList.remove('active');
                    itemEl.classList.add('active');
                    playChannel(item.url);
                });
                channelList.appendChild(itemEl);
            });
        }
    }

    searchBar.addEventListener('input', displayItems);

    function playChannel(url) {
        if (state.hls) state.hls.destroy();
        if (Hls.isSupported()) {
            const userSettings = JSON.parse(localStorage.getItem('iptv_settings')) || {};
            state.hls = new Hls({ liveSyncDurationCount: 3, liveMaxLatencyDurationCount: 4, ...userSettings });
            state.hls.loadSource(url);
            state.hls.attachMedia(videoPlayer);
            state.hls.on(Hls.Events.MANIFEST_PARSED, () => videoPlayer.play());
        } else if (videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
            videoPlayer.src = url;
            videoPlayer.play();
        }
    }

    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('iptv_config');
        localStorage.removeItem('iptv_settings');
        location.reload();
    });

    settingsBtn.addEventListener('click', () => settingsModal.style.display = 'block');
    closeModalBtn.addEventListener('click', () => settingsModal.style.display = 'none');
    window.addEventListener('click', (event) => {
        if (event.target == settingsModal) settingsModal.style.display = 'none';
    });

    saveSettingsBtn.addEventListener('click', () => {
        const settings = {
            latency: document.getElementById('latency-config').value,
            parentalCode: document.getElementById('parental-code').value,
            timezone: document.getElementById('timezone-config').value
        };
        localStorage.setItem('iptv_settings', JSON.stringify(settings));
        alert('Paramètres enregistrés !');
        settingsModal.style.display = 'none';
    });

    function init() {
        console.log("Initialisation de l'application...");
        const timezoneSelect = document.getElementById('timezone-config');
        try {
            const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            timezoneSelect.innerHTML = `<option value="${userTimezone}">${userTimezone} (Votre fuseau)</option>`;
            const commonTimezones = ["UTC", "Europe/Paris", "America/New_York", "Asia/Tokyo"];
            commonTimezones.forEach(tz => {
                if (tz !== userTimezone) timezoneSelect.innerHTML += `<option value="${tz}">${tz}</option>`;
            });
        } catch(e) {
            timezoneSelect.innerHTML = `<option value="UTC">UTC</option>`;
        }
        
        const savedSettings = localStorage.getItem('iptv_settings');
        if (savedSettings) {
            const settings = JSON.parse(savedSettings);
            document.getElementById('latency-config').value = settings.latency || 1;
            document.getElementById('parental-code').value = settings.parentalCode || '';
            if(settings.timezone) timezoneSelect.value = settings.timezone;
        }
        
        const savedConfig = localStorage.getItem('iptv_config');
        if (savedConfig) {
            showView('player-view');
            const config = JSON.parse(savedConfig);
            if (config.type === 'm3u-local') {
                loginError.textContent = `Connecté au fichier local: ${config.name}. Pour changer, déconnectez-vous.`;
            } else {
                 login(config).catch(error => {
                    localStorage.removeItem('iptv_config');
                    showView('login-view');
                    loginError.textContent = `Erreur de reconnexion: ${error.message}`;
                });
            }
        } else {
            showView('login-view');
        }
    }
    
    init();
});

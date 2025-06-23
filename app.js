document.addEventListener('DOMContentLoaded', () => {
    // --- ÉTAT DE L'APPLICATION ---
    const state = { currentPlaylist: null, live_streams: [], vod_streams: [], series_streams: [], groups: [], currentCategory: 'live', currentGroup: 'Tout voir', hls: null, logoObserver: null };

    // --- SÉLECTEURS DU DOM ---
    const dom = {};
    const allDomIds = ['loading-overlay', 'loading-message', 'playlist-selector-view', 'saved-playlists-list', 'add-new-playlist-btn', 'add-playlist-view', 'back-to-selector-btn', 'show-xtream-form', 'show-m3u-form', 'playlist-form-container', 'playlistName', 'xtream-fields', 'm3u-fields', 'serverUrl', 'username', 'password', 'm3uUrl', 'm3uFile', 'save-playlist-btn', 'form-error', 'player-view', 'content-selector', 'current-playlist-name', 'group-list', 'list-title', 'channel-list', 'search-bar', 'player', 'back-to-playlists-btn', 'settings-btn', 'settings-modal', 'close-btn', 'epg-info'];
    allDomIds.forEach(id => dom[id] = document.getElementById(id));
    
    // --- GESTION DES DONNÉES LOCALES (MULTI-PLAYLIST) ---
    const getPlaylists = () => JSON.parse(localStorage.getItem('iptv_playlists_v2')) || [];
    const savePlaylists = (playlists) => localStorage.setItem('iptv_playlists_v2', JSON.stringify(playlists));
    const getActivePlaylistId = () => localStorage.getItem('active_playlist_id_v2');
    const setActivePlaylistId = (id) => localStorage.setItem('active_playlist_id_v2', id);

    // --- GESTION DE L'AFFICHAGE ---
    function showLoadingOverlay(message) { dom.loadingOverlay.classList.remove('hidden'); dom.loadingMessage.textContent = message; }
    function updateLoadingMessage(message) { dom.loadingMessage.textContent = message; }
    function hideLoadingOverlay() { dom.loadingOverlay.classList.add('hidden'); }
    const showView = (viewId) => {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById(viewId).classList.add('active');
    };

    // --- POINT D'ENTRÉE DE L'APPLICATION ---
    init();

    function init() {
        setupEventListeners();
        const playlists = getPlaylists();
        const activeId = getActivePlaylistId();
        const activePlaylist = activeId ? playlists.find(p => p.id == activeId) : null;

        if (activePlaylist) {
            loadPlaylist(activePlaylist, true); // true for auto-reconnect
        } else if (playlists.length > 0) {
            displayPlaylistSelector();
        } else {
            showView('add-playlist-view');
            dom.backToSelectorBtn.classList.add('hidden');
        }
    }
    
    // --- GESTION DES PLAYLISTS ---
    async function loadPlaylist(playlist, isAutoReconnect = false) {
        showLoadingOverlay(isAutoReconnect ? `Reconnexion à "${playlist.name}"...` : `Chargement de "${playlist.name}"...`);
        try {
            await login(playlist);
            setActivePlaylistId(playlist.id);
            state.currentPlaylist = playlist;
            dom.currentPlaylistName.textContent = playlist.name;
            showView('player-view');
        } catch (error) {
            alert(`Erreur lors du chargement de la playlist "${playlist.name}": ${error.message}`);
            displayPlaylistSelector();
        } finally {
            hideLoadingOverlay();
        }
    }

    function displayPlaylistSelector() {
        const playlists = getPlaylists();
        dom.savedPlaylistsList.innerHTML = '';
        if (playlists.length === 0) {
            dom.savedPlaylistsList.innerHTML = '<p>Aucune playlist enregistrée. Cliquez ci-dessous pour en ajouter une.</p>';
        } else {
            playlists.forEach(p => {
                const card = document.createElement('div');
                card.className = 'playlist-card';
                card.innerHTML = `<h3>${p.name}</h3> <p>${p.type === 'xtream' ? 'API Xtream Codes' : 'Lien M3U'}</p> <div class="playlist-actions"><button class="delete-btn">Supprimer</button></div>`;
                card.addEventListener('click', () => loadPlaylist(p));
                card.querySelector('.delete-btn').addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (confirm(`Êtes-vous sûr de vouloir supprimer la playlist "${p.name}" ?`)) {
                        deletePlaylist(p.id);
                    }
                });
                dom.savedPlaylistsList.appendChild(card);
            });
        }
        showView('playlist-selector-view');
    }

    function deletePlaylist(id) {
        let playlists = getPlaylists();
        playlists = playlists.filter(p => p.id != id);
        savePlaylists(playlists);
        if (getActivePlaylistId() == id) localStorage.removeItem('active_playlist_id_v2');
        init();
    }
    
    // --- LOGIQUE DE CONNEXION ---
    async function login(config) {
        state.config = config;
        if (config.type === 'xtream') {
            updateLoadingMessage('1/6 - Catégories TV...');
            const live_categories = await fetchXtreamCategories(config, 'get_live_categories');
            updateLoadingMessage('2/6 - Chaînes TV...');
            state.live_streams = await fetchXtreamData(config, 'get_live_streams', live_categories);
            updateLoadingMessage('3/6 - Catégories Films...');
            const vod_categories = await fetchXtreamCategories(config, 'get_vod_categories');
            updateLoadingMessage('4/6 - Films...');
            state.vod_streams = await fetchXtreamData(config, 'get_vod_streams', vod_categories);
            updateLoadingMessage('5/6 - Catégories Séries...');
            const series_categories = await fetchXtreamCategories(config, 'get_series_categories');
            updateLoadingMessage('6/6 - Séries...');
            state.series_streams = await fetchXtreamData(config, 'get_series', series_categories);
            updateLoadingMessage('Finalisation...');
            dom.contentSelector.querySelector('[data-category="vod"]').style.display = state.vod_streams.length > 0 ? 'block' : 'none';
            dom.contentSelector.querySelector('[data-category="series"]').style.display = state.series_streams.length > 0 ? 'block' : 'none';
        } else { /* Gérer M3U ici */ }
        switchCategory('live');
    }

    async function fetchApiData(config, action) {
        const apiUrl = `${config.server}/player_api.php?username=${config.username}&password=${config.password}&action=${action}`;
        const proxyUrl = 'https://corsproxy.io/?';
        const response = await fetch(proxyUrl + encodeURIComponent(apiUrl));
        if (!response.ok) throw new Error(`Proxy error for ${action}: Status ${response.status}`);
        const textData = await response.text();
        if (!textData || textData.includes('DOCTYPE html')) throw new Error(`Proxy response for ${action} is HTML.`);
        try { return JSON.parse(textData); } catch (e) { throw new Error(`JSON parsing error for ${action}: ${e.message}`); }
    }

    async function fetchXtreamCategories(config, action) {
        try {
            const data = await fetchApiData(config, action);
            const categoryMap = new Map();
            if (Array.isArray(data)) data.forEach(cat => categoryMap.set(cat.category_id, cat.category_name));
            return categoryMap;
        } catch (e) { console.error(`Could not load categories for ${action}, continuing without.`, e); return new Map(); }
    }

    async function fetchXtreamData(config, action, categoryMap = new Map()) {
        const data = await fetchApiData(config, action);
        if (!Array.isArray(data)) return [];
        const streamTypeMap = { 'get_live_streams': 'live', 'get_vod_streams': 'movie', 'get_series': 'series' };
        const type = streamTypeMap[action];
        return data.filter(item => item.name || item.title).map(item => ({
            name: item.name || item.title, logo: item.stream_icon || item.icon || item.cover || '',
            group: categoryMap.get(item.category_id) || item.category_name || 'Non classé',
            url: `${config.server}/${type}/${config.username}/${config.password}/${item.stream_id}.${item.container_extension || 'ts'}`,
            id: item.stream_id, epgId: item.epg_channel_id
        }));
    }

    // --- GESTION DE L'INTERFACE UTILISATEUR ---
    function switchCategory(category) {
        state.currentCategory = category; state.currentGroup = 'Tout voir';
        dom.contentSelector.querySelectorAll('.selector-item').forEach(item => item.classList.toggle('active', item.dataset.category === category));
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

    function playChannel(url) {
        if (!url) { console.error("URL invalide."); return; }
        if (state.hls) state.hls.destroy();
        if (Hls.isSupported()) {
            const hls = new Hls({ manifestLoadtimeout: 10000 });
            hls.loadSource(url);
            hls.attachMedia(dom.player);
            hls.on(Hls.Events.MANIFEST_PARSED, () => dom.player.play());
            hls.on(Hls.Events.ERROR, function (event, data) {
                if (data.fatal) {
                    console.error('Erreur HLS fatale:', data);
                    switch (data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            alert("Erreur de lecture : Impossible de charger le flux.\nProbablement une restriction CORS du fournisseur.\nL'application ne gèlera pas.");
                            hls.destroy(); break;
                        default: hls.destroy(); break;
                    }
                }
            });
            state.hls = hls;
        } else if (dom.player.canPlayType('application/vnd.apple.mpegurl')) {
            dom.player.src = url;
            dom.player.play();
        }
    }
    
    // --- GESTION DES ÉVÉNEMENTS ---
    function setupEventListeners() {
        dom.addNewPlaylistBtn.addEventListener('click', () => {
            const playlists = getPlaylists();
            if (playlists.length > 0) {
                dom.backToSelectorBtn.classList.remove('hidden');
            }
            showView('add-playlist-view');
        });
        dom.backToSelectorBtn.addEventListener('click', () => displayPlaylistSelector());
        dom.backToPlaylistsBtn.addEventListener('click', () => {
            if (state.hls) state.hls.destroy();
            displayPlaylistSelector();
        });
        let currentFormType = null;
        dom.showXtreamForm.addEventListener('click', () => {
            currentFormType = 'xtream';
            dom.playlistFormContainer.classList.remove('hidden');
            dom.xtreamFields.classList.remove('hidden');
            dom.m3uFields.classList.add('hidden');
        });
        dom.showM3uForm.addEventListener('click', () => {
            currentFormType = 'm3u';
            dom.playlistFormContainer.classList.remove('hidden');
            dom.xtreamFields.classList.add('hidden');
            dom.m3uFields.classList.remove('hidden');
        });
        dom.savePlaylistBtn.addEventListener('click', async () => {
            dom.formError.textContent = '';
            const name = dom.playlistName.value.trim();
            if (!name) { dom.formError.textContent = "Veuillez donner un nom à la playlist."; return; }
            const newPlaylist = { id: Date.now(), name, type: currentFormType };
            if (currentFormType === 'xtream') {
                newPlaylist.server = dom.serverUrl.value.trim();
                newPlaylist.username = dom.username.value.trim();
                newPlaylist.password = dom.password.value;
                if (!newPlaylist.server || !newPlaylist.username || !newPlaylist.password) { dom.formError.textContent = 'Tous les champs Xtream sont requis.'; return; }
            } else {
                newPlaylist.m3uUrl = dom.m3uUrl.value.trim();
                if (!newPlaylist.m3uUrl) { dom.formError.textContent = "L'URL M3U est requise."; return; }
            }
            showLoadingOverlay(`Test de la connexion pour "${name}"...`);
            try {
                await login(newPlaylist);
                const playlists = getPlaylists();
                playlists.push(newPlaylist);
                savePlaylists(playlists);
                await loadPlaylist(newPlaylist);
            } catch (error) {
                dom.formError.textContent = `Impossible d'ajouter la playlist : ${error.message}`;
            } finally {
                hideLoadingOverlay();
            }
        });
        dom.contentSelector.addEventListener('click', (e) => {
            if (e.target.classList.contains('selector-item')) {
                switchCategory(e.target.dataset.category);
            }
        });
        dom.searchBar.addEventListener('input', displayItems);
    }
});

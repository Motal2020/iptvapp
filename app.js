document.addEventListener('DOMContentLoaded', () => {
    // --- ÉTAT DE L'APPLICATION ---
    const state = { currentPlaylist: null, live_streams: [], vod_streams: [], series_streams: [], groups: [], currentCategory: 'live', currentGroup: 'Tout voir', hls: null, logoObserver: null };

    // --- SÉLECTEURS DU DOM (Robustes) ---
    const dom = {
        loadingOverlay: document.getElementById('loading-overlay'), loadingMessage: document.getElementById('loading-message'),
        playlistSelectorView: document.getElementById('playlist-selector-view'), savedPlaylistsList: document.getElementById('saved-playlists-list'),
        addNewPlaylistBtn: document.getElementById('add-new-playlist-btn'), addPlaylistView: document.getElementById('add-playlist-view'),
        backToSelectorBtn: document.getElementById('back-to-selector-btn'), showXtreamForm: document.getElementById('show-xtream-form'),
        showM3uForm: document.getElementById('show-m3u-form'), playlistFormContainer: document.getElementById('playlist-form-container'),
        playlistName: document.getElementById('playlistName'), xtreamFields: document.getElementById('xtream-fields'),
        m3uFields: document.getElementById('m3u-fields'), serverUrl: document.getElementById('serverUrl'),
        username: document.getElementById('username'), password: document.getElementById('password'),
        m3uUrl: document.getElementById('m3uUrl'), savePlaylistBtn: document.getElementById('save-playlist-btn'),
        formError: document.getElementById('form-error'), playerView: document.getElementById('player-view'),
        contentSelector: document.querySelector('.content-selector'), currentPlaylistName: document.getElementById('current-playlist-name'),
        groupList: document.getElementById('group-list'), listTitle: document.getElementById('list-title'),
        channelList: document.getElementById('channel-list'), searchBar: document.getElementById('search-bar'),
        player: document.getElementById('player'), backToPlaylistsBtn: document.getElementById('back-to-playlists-btn'),
        settingsBtn: document.getElementById('settings-btn'), settingsModal: document.getElementById('settings-modal'),
        closeModalBtn: document.querySelector('.close-btn'), epgInfo: document.getElementById('epg-info')
    };
    
    // --- GESTION DES DONNÉES LOCALES ---
    const getPlaylists = () => JSON.parse(localStorage.getItem('iptv_playlists_v3')) || [];
    const savePlaylists = (playlists) => localStorage.setItem('iptv_playlists_v3', JSON.stringify(playlists));
    const getActivePlaylistId = () => localStorage.getItem('active_playlist_id_v3');
    const setActivePlaylistId = (id) => localStorage.setItem('active_playlist_id_v3', id);

    // --- Fonctions UI ---
    function showLoadingOverlay(message) { dom.loadingOverlay.classList.remove('hidden'); dom.loadingMessage.textContent = message; }
    function updateLoadingMessage(message) { dom.loadingMessage.textContent = message; }
    function hideLoadingOverlay() { dom.loadingOverlay.classList.add('hidden'); }
    const showView = (viewId) => {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById(viewId).classList.add('active');
    };

    // --- POINT D'ENTRÉE ---
    init();

    // --- LOGIQUE PRINCIPALE ---
    function init() {
        setupEventListeners();
        const playlists = getPlaylists();
        const activeId = getActivePlaylistId();
        const activePlaylist = activeId ? playlists.find(p => p.id == activeId) : null;

        if (activePlaylist) {
            loadPlaylist(activePlaylist, true);
        } else if (playlists.length > 0) {
            displayPlaylistSelector();
        } else {
            showView('add-playlist-view');
            dom.backToSelectorBtn.classList.add('hidden');
        }
    }

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
            dom.savedPlaylistsList.innerHTML = '<p style="padding: 20px;">Aucune playlist enregistrée.</p>';
        } else {
            playlists.forEach(p => {
                const card = document.createElement('div');
                card.className = 'playlist-card';
                card.innerHTML = `<h3>${p.name}</h3><p>${p.type === 'xtream' ? 'API Xtream Codes' : 'Lien M3U'}</p><div class="playlist-actions"><button class="delete-btn">Supprimer</button></div>`;
                card.addEventListener('click', () => loadPlaylist(p));
                card.querySelector('.delete-btn').addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (confirm(`Êtes-vous sûr de vouloir supprimer la playlist "${p.name}" ?`)) deletePlaylist(p.id);
                });
                dom.savedPlaylistsList.appendChild(card);
            });
        }
        showView('playlist-selector-view');
    }

    function deletePlaylist(id) {
        let playlists = getPlaylists().filter(p => p.id != id);
        savePlaylists(playlists);
        if (getActivePlaylistId() == id) localStorage.removeItem('active_playlist_id_v3');
        init();
    }
    
    // --- FONCTION LOGIN QUI ÉTAIT MANQUANTE ---
    async function login(playlistConfig) {
        state.config = playlistConfig; 
        if (playlistConfig.type === 'xtream') {
            updateLoadingMessage('1/6 - Catégories TV...');
            const live_categories = await fetchXtreamCategories(playlistConfig, 'get_live_categories');
            updateLoadingMessage('2/6 - Chaînes TV...');
            state.live_streams = await fetchXtreamData(playlistConfig, 'get_live_streams', live_categories);
            updateLoadingMessage('3/6 - Catégories Films...');
            const vod_categories = await fetchXtreamCategories(playlistConfig, 'get_vod_categories');
            updateLoadingMessage('4/6 - Films...');
            state.vod_streams = await fetchXtreamData(playlistConfig, 'get_vod_streams', vod_categories);
            updateLoadingMessage('5/6 - Catégories Séries...');
            const series_categories = await fetchXtreamCategories(playlistConfig, 'get_series_categories');
            updateLoadingMessage('6/6 - Séries...');
            state.series_streams = await fetchXtreamData(playlistConfig, 'get_series', series_categories);
        } else if (playlistConfig.type === 'm3u') {
            updateLoadingMessage('Chargement de la liste M3U...');
            state.live_streams = await fetchM3uChannels(playlistConfig.m3uUrl);
            state.vod_streams = []; state.series_streams = [];
        }
        
        updateLoadingMessage('Finalisation...');
        dom.contentSelector.querySelector('[data-category="vod"]').style.display = state.vod_streams.length > 0 ? 'block' : 'none';
        dom.contentSelector.querySelector('[data-category="series"]').style.display = state.series_streams.length > 0 ? 'block' : 'none';
        
        switchCategory('live');
    }

    // --- FONCTIONS DE RÉCUPÉRATION DE DONNÉES ---
    async function fetchApiData(config, action) {
        const apiUrl = `${config.server}/player_api.php?username=${config.username}&password=${config.password}&action=${action}`;
        const proxyUrl = 'https://corsproxy.io/?';
        const response = await fetch(proxyUrl + encodeURIComponent(apiUrl));
        if (!response.ok) throw new Error(`Erreur du proxy pour ${action}: Statut ${response.status}`);
        const textData = await response.text();
        if (!textData || textData.includes('DOCTYPE html')) throw new Error(`La réponse du proxy pour ${action} est du HTML.`);
        try { return JSON.parse(textData); } catch (e) { throw new Error(`Erreur de parsing JSON pour ${action}: ${e.message}`); }
    }

    async function fetchXtreamCategories(config, action) {
        try {
            const data = await fetchApiData(config, action);
            const categoryMap = new Map();
            if (Array.isArray(data)) data.forEach(cat => categoryMap.set(cat.category_id, cat.category_name));
            return categoryMap;
        } catch (e) { console.error(`Impossible de charger les catégories pour ${action}, on continue.`, e); return new Map(); }
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
    
    async function fetchM3uChannels(url) {
        const proxyUrl = 'https://corsproxy.io/?';
        const response = await fetch(proxyUrl + encodeURIComponent(url));
        if (!response.ok) throw new Error(`Erreur HTTP! Statut: ${response.status}`);
        const m3uText = await response.text();
        return parseM3U(m3uText);
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

    // --- FONCTIONS D'AFFICHAGE ET LECTURE ---
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
        const filteredItems = currentItems.filter(item => (state.currentGroup === 'Tout voir' || item.group === state.currentGroup) && (item.name || '').toLowerCase().includes(filterText));
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
            dom.playlistFormContainer.classList.add('hidden');
            const playlists = getPlaylists();
            dom.backToSelectorBtn.classList.toggle('hidden', playlists.length === 0);
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
                if (!newPlaylist.server || !newPlaylist.username) { dom.formError.textContent = 'Le serveur et le nom d\'utilisateur sont requis.'; return; }
            } else if (currentFormType === 'm3u') {
                newPlaylist.m3uUrl = dom.m3uUrl.value.trim();
                if (!newPlaylist.m3uUrl) { dom.formError.textContent = "L'URL M3U est requise."; return; }
            } else { dom.formError.textContent = "Veuillez choisir un type de connexion."; return; }
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
            if (e.target.classList.contains('selector-item')) switchCategory(e.target.dataset.category);
        });
        dom.searchBar.addEventListener('input', displayItems);
    }
});

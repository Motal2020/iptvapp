document.addEventListener('DOMContentLoaded', () => {
    // --- ÉTAT DE L'APPLICATION ---
    const state = { currentPlaylist: null, live_streams: [], vod_streams: [], series_streams: [], groups: [], currentCategory: 'live', currentGroup: 'Tout voir', hls: null, logoObserver: null };

    // --- SÉLECTEURS DU DOM (CORRIGÉ POUR ÊTRE PLUS ROBUSTE) ---
    const dom = {
        loadingOverlay: document.getElementById('loading-overlay'),
        loadingMessage: document.getElementById('loading-message'),
        playlistSelectorView: document.getElementById('playlist-selector-view'),
        savedPlaylistsList: document.getElementById('saved-playlists-list'),
        addNewPlaylistBtn: document.getElementById('add-new-playlist-btn'),
        addPlaylistView: document.getElementById('add-playlist-view'),
        backToSelectorBtn: document.getElementById('back-to-selector-btn'),
        showXtreamForm: document.getElementById('show-xtream-form'),
        showM3uForm: document.getElementById('show-m3u-form'),
        playlistFormContainer: document.getElementById('playlist-form-container'),
        playlistName: document.getElementById('playlistName'),
        xtreamFields: document.getElementById('xtream-fields'),
        m3uFields: document.getElementById('m3u-fields'),
        serverUrl: document.getElementById('serverUrl'),
        username: document.getElementById('username'),
        password: document.getElementById('password'),
        m3uUrl: document.getElementById('m3uUrl'),
        m3uFile: document.getElementById('m3uFile'),
        savePlaylistBtn: document.getElementById('save-playlist-btn'),
        formError: document.getElementById('form-error'),
        playerView: document.getElementById('player-view'),
        contentSelector: document.querySelector('.content-selector'), // CORRECTION: querySelector
        currentPlaylistName: document.getElementById('current-playlist-name'),
        groupList: document.getElementById('group-list'),
        listTitle: document.getElementById('list-title'),
        channelList: document.getElementById('channel-list'),
        searchBar: document.getElementById('search-bar'),
        player: document.getElementById('player'),
        backToPlaylistsBtn: document.getElementById('back-to-playlists-btn'),
        settingsBtn: document.getElementById('settings-btn'),
        settingsModal: document.getElementById('settings-modal'),
        closeModalBtn: document.querySelector('.close-btn'), // CORRECTION: querySelector
        epgInfo: document.getElementById('epg-info')
    };
    
    // --- GESTION DES DONNÉES LOCALES (MULTI-PLAYLIST) ---
    const getPlaylists = () => JSON.parse(localStorage.getItem('iptv_playlists_v2')) || [];
    const savePlaylists = (playlists) => localStorage.setItem('iptv_playlists_v2', JSON.stringify(playlists));
    const getActivePlaylistId = () => localStorage.getItem('active_playlist_id_v2');
    const setActivePlaylistId = (id) => localStorage.setItem('active_playlist_id_v2', id);

    // --- Fonctions de l'écran de chargement ---
    function showLoadingOverlay(message) { dom.loadingOverlay.classList.remove('hidden'); dom.loadingMessage.textContent = message; }
    function updateLoadingMessage(message) { dom.loadingMessage.textContent = message; }
    function hideLoadingOverlay() { dom.loadingOverlay.classList.add('hidden'); }

    // --- GESTION DES VUES ---
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
    
    // ... Toutes les autres fonctions (displayPlaylistSelector, deletePlaylist, login, fetchApiData, etc.)
    // ... Sont exactement les mêmes que dans ma réponse précédente.
    
    // --- GESTION DES ÉVÉNEMENTS ---
    function setupEventListeners() {
        dom.addNewPlaylistBtn.addEventListener('click', () => {
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
            } else {
                newPlaylist.m3uUrl = dom.m3uUrl.value.trim();
                if (!newPlaylist.m3uUrl) { dom.formError.textContent = "L'URL M3U est requise."; return; }
            }

            showLoadingOverlay(`Test de la connexion pour "${name}"...`);
            try {
                await login(newPlaylist); // Teste la connexion
                const playlists = getPlaylists();
                playlists.push(newPlaylist);
                savePlaylists(playlists);
                await loadPlaylist(newPlaylist); // Charge la playlist après l'avoir sauvegardée
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
        
        // ... Le reste des écouteurs d'événements
    }
});

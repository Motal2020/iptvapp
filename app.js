document.addEventListener('DOMContentLoaded', () => {
    // --- VARIABLES GLOBALES ET ÉTAT DE L'APPLICATION ---
    const state = {
        config: null,
        allChannels: [],
        groups: [],
        currentGroup: 'All',
        hls: null,
    };

    // --- SÉLECTEURS D'ÉLÉMENTS DU DOM ---
    const loginView = document.getElementById('login-view');
    const playerView = document.getElementById('player-view');
    const connTypeEl = document.getElementById('connType');
    const xtreamFields = document.getElementById('xtream-fields');
    const m3uFields = document.getElementById('m3u-fields');
    const connectBtn = document.getElementById('connect-btn');
    const loginError = document.getElementById('login-error');
    const groupList = document.getElementById('group-list');
    const channelList = document.getElementById('channel-list');
    const videoPlayer = document.getElementById('player');
    const logoutBtn = document.getElementById('logout-btn');
    const searchBar = document.getElementById('search-bar');
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeModalBtn = document.querySelector('.close-btn');
    const saveSettingsBtn = document.getElementById('save-settings-btn');


    // --- GESTION DES VUES ---
    const showView = (viewId) => {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById(viewId).classList.add('active');
    };

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
                loginError.textContent = 'Tous les champs Xtream sont requis.';
                return;
            }
        } else {
            config.m3u = document.getElementById('m3uUrl').value.trim();
            if (!config.m3u) {
                loginError.textContent = 'L\'URL M3U est requise.';
                return;
            }
        }

        connectBtn.textContent = 'Connexion en cours...';
        connectBtn.disabled = true;

        try {
            await login(config);
            localStorage.setItem('iptv_config', JSON.stringify(state.config));
            localStorage.setItem('iptv_settings', JSON.stringify({
                latency: document.getElementById('latency-config').value,
                parentalCode: document.getElementById('parental-code').value
            }));
            showView('player-view');
        } catch (error) {
            loginError.textContent = `Erreur de connexion : ${error.message}`;
            showView('login-view'); // Revenir à la vue de connexion en cas d'erreur
        } finally {
            connectBtn.textContent = 'Se Connecter';
            connectBtn.disabled = false;
        }
    });

    async function login(config) {
        state.config = config;
        let channels = [];
        if (config.type === 'xtream') {
            channels = await fetchXtreamChannels(config);
        } else {
            channels = await fetchM3uChannels(config.m3u);
        }
        state.allChannels = channels;
        processChannels();
    }

    async function fetchXtreamChannels(config) {
        // NOTE: C'est une simulation. En réalité, il faudrait un proxy côté serveur (CORS)
        // pour appeler l'API Xtream. Pour la démo, on utilise des données statiques.
        console.log(`Connexion à l'API Xtream : ${config.server}`);
        // URL d'exemple pour l'API Xtream
        // const apiUrl = `${config.server}/player_api.php?username=${config.username}&password=${config.password}&action=get_live_streams`;
        // const response = await fetch(apiUrl);
        // const data = await response.json();
        // return data.map(ch => ({ ... }))
        alert("La connexion directe à l'API Xtream depuis un navigateur est souvent bloquée (CORS). Ceci est une simulation.");
        return [
            { name: 'France 2 HD', group: 'France', logo: '', url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' },
            { name: 'TF1 HD', group: 'France', logo: '', url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' },
            { name: 'BBC One', group: 'UK', logo: '', url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' },
        ];
    }
    
    async function fetchM3uChannels(url) {
        try {
            // Pour contourner les problèmes de CORS, idéalement utiliser un proxy.
            // On peut utiliser un service de proxy pour le test.
            const proxyUrl = 'https://api.allorigins.win/raw?url=';
            const response = await fetch(proxyUrl + encodeURIComponent(url));
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const m3uText = await response.text();
            return parseM3U(m3uText);
        } catch (e) {
            throw new Error("Impossible de télécharger ou parser le fichier M3U.");
        }
    }

    function parseM3U(m3uText) {
        const lines = m3uText.split('\n');
        const channels = [];
        let currentChannel = {};

        for (const line of lines) {
            if (line.startsWith('#EXTINF:')) {
                // Regex pour extraire les informations
                const infoMatch = line.match(/#EXTINF:-1(?:.*?tvg-id="([^"]*)")?(?:.*?tvg-name="([^"]*)")?(?:.*?tvg-logo="([^"]*)")?(?:.*?group-title="([^"]*)")?,(.+)/);
                if (infoMatch) {
                    currentChannel = {
                        id: infoMatch[1] || '',
                        name: infoMatch[5] ? infoMatch[5].trim() : (infoMatch[2] || 'Nom inconnu'),
                        logo: infoMatch[3] || '',
                        group: infoMatch[4] || 'Non classé',
                        url: ''
                    };
                }
            } else if (line.trim() && !line.startsWith('#')) {
                if (currentChannel.name) {
                    currentChannel.url = line.trim();
                    channels.push(currentChannel);
                    currentChannel = {}; // Reset for next channel
                }
            }
        }
        return channels;
    }


    // --- GESTION DE L'AFFICHAGE ---
    function processChannels() {
        const groups = ['Tout voir', ...new Set(state.allChannels.map(ch => ch.group))];
        state.groups = groups;
        
        groupList.innerHTML = '';
        groups.forEach(group => {
            const groupEl = document.createElement('div');
            groupEl.className = 'group-item';
            groupEl.textContent = group;
            if (group === state.currentGroup) {
                groupEl.classList.add('active');
            }
            groupEl.addEventListener('click', () => {
                state.currentGroup = group;
                document.querySelector('.group-item.active')?.classList.remove('active');
                groupEl.classList.add('active');
                displayChannels();
            });
            groupList.appendChild(groupEl);
        });

        displayChannels();
    }
    
    function displayChannels() {
        const filterText = searchBar.value.toLowerCase();
        const filteredChannels = state.allChannels.filter(ch => 
            (state.currentGroup === 'Tout voir' || ch.group === state.currentGroup) &&
            ch.name.toLowerCase().includes(filterText)
        );

        channelList.innerHTML = '';
        filteredChannels.forEach(ch => {
            const channelEl = document.createElement('div');
            channelEl.className = 'channel-item';
            channelEl.innerHTML = `
                <img src="${ch.logo}" alt="" class="channel-logo" onerror="this.style.display='none'">
                <span class="channel-name">${ch.name}</span>
            `;
            channelEl.addEventListener('click', () => {
                document.querySelector('.channel-item.active')?.classList.remove('active');
                channelEl.classList.add('active');
                playChannel(ch.url);
            });
            channelList.appendChild(channelEl);
        });
    }

    searchBar.addEventListener('input', displayChannels);

    // --- LECTEUR VIDÉO ---
    function playChannel(url) {
        if (state.hls) {
            state.hls.destroy();
        }
        if (Hls.isSupported()) {
            const userSettings = JSON.parse(localStorage.getItem('iptv_settings')) || {};
            state.hls = new Hls({
                // Configuration de la latence
                liveSyncDurationCount: 3,
                liveMaxLatencyDurationCount: 4,
                liveDurationInfinity: true,
                highBufferWatchdogPeriod: userSettings.latency || 1 // Valeur par défaut
            });
            state.hls.loadSource(url);
            state.hls.attachMedia(videoPlayer);
            state.hls.on(Hls.Events.MANIFEST_PARSED, () => {
                videoPlayer.play();
            });
        } else if (videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
            // Support natif sur Safari
            videoPlayer.src = url;
            videoPlayer.addEventListener('loadedmetadata', () => {
                videoPlayer.play();
            });
        }
    }

    // --- DÉCONNEXION ET PARAMÈTRES ---
    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('iptv_config');
        localStorage.removeItem('iptv_settings');
        location.reload();
    });

    settingsBtn.addEventListener('click', () => settingsModal.style.display = 'block');
    closeModalBtn.addEventListener('click', () => settingsModal.style.display = 'none');
    window.addEventListener('click', (event) => {
        if (event.target == settingsModal) {
            settingsModal.style.display = 'none';
        }
    });

    saveSettingsBtn.addEventListener('click', () => {
        const settings = {
            latency: document.getElementById('latency-config').value,
            parentalCode: document.getElementById('parental-code').value
        };
        localStorage.setItem('iptv_settings', JSON.stringify(settings));
        alert('Paramètres enregistrés !');
        settingsModal.style.display = 'none';
    });


    // --- INITIALISATION DE L'APPLICATION ---
    function init() {
        const savedConfig = localStorage.getItem('iptv_config');
        const savedSettings = localStorage.getItem('iptv_settings');

        if (savedSettings) {
            const settings = JSON.parse(savedSettings);
            document.getElementById('latency-config').value = settings.latency || 1;
            document.getElementById('parental-code').value = settings.parentalCode || '';
        }
        
        if (savedConfig) {
            showView('player-view');
            const config = JSON.parse(savedConfig);
            login(config).catch(error => {
                console.error(error);
                localStorage.removeItem('iptv_config');
                showView('login-view');
                loginError.textContent = `Erreur de reconnexion: ${error.message}`;
            });
        } else {
            showView('login-view');
        }
    }
    
    init();
});

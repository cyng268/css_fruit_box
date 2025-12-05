const socket = io();

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const timerEl = document.getElementById('timer');
const myScoreEl = document.getElementById('my-score');
const scoreListEl = document.getElementById('score-list');
const gameOverModal = document.getElementById('game-over-modal');
const finalScoreEl = document.getElementById('final-score');
const restartBtn = document.getElementById('restart-btn');

// Lobby Elements
const lobbyContainer = document.getElementById('lobby-container');
const gameContainer = document.getElementById('game-container');
const gameLeaderboard = document.getElementById('game-leaderboard');
const lobbyPlayerList = document.getElementById('lobby-player-list');
const startGameBtn = document.getElementById('start-game-btn');
const playerNameInput = document.getElementById('player-name-input');
const readyBtn = document.getElementById('ready-btn');
const modeToggleBtn = document.getElementById('mode-toggle-btn');
const adminControls = document.getElementById('admin-controls');
const rowsInput = document.getElementById('rows-input');
const colsInput = document.getElementById('cols-input');
const durationInput = document.getElementById('duration-input');
const applySettingsBtn = document.getElementById('apply-settings-btn');

// Restore name from local storage
const savedName = localStorage.getItem('player_name');
if (savedName) {
    playerNameInput.value = savedName;
}

// Create toast container
const toastContainer = document.createElement('div');
toastContainer.id = 'toast-container';
document.body.appendChild(toastContainer);

function showToast(message) {
    // Limit to 2 toasts
    while (toastContainer.children.length >= 2) {
        toastContainer.removeChild(toastContainer.firstChild);
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    toastContainer.appendChild(toast);

    // Remove after animation
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// Game Config
let ROWS = 10;
let COLS = 20;
let CELL_SIZE = 40; // Will be dynamic
let grid = [];
let myId = null;
let gameMode = 'normal'; // 'normal' or 'capture'
let isDragging = false;
let selectionStart = null; // {r, c}
let selectionEnd = null;   // {r, c}
let playersMap = {}; // id -> {name, isReady}
let activeHighlights = []; // {r1, c1, r2, c2, timestamp}

// Resize canvas to fit container
function resizeCanvas() {
    const container = document.getElementById('game-container');
    const maxWidth = container.clientWidth - 40;
    const maxHeight = container.clientHeight - 40;

    // Calculate best cell size
    const cellW = Math.floor(maxWidth / COLS);
    const cellH = Math.floor(maxHeight / ROWS);
    CELL_SIZE = Math.min(cellW, cellH);

    canvas.width = CELL_SIZE * COLS;
    canvas.height = CELL_SIZE * ROWS;
    draw();
}

window.addEventListener('resize', resizeCanvas);

// Input Handling
function getCellFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const c = Math.floor(x / CELL_SIZE);
    const r = Math.floor(y / CELL_SIZE);
    return { r, c };
}

canvas.addEventListener('mousedown', (e) => {
    isDragging = true;
    const cell = getCellFromEvent(e);
    handleInputStart(cell);
});

canvas.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const cell = getCellFromEvent(e);
    handleInputMove(cell);
});

canvas.addEventListener('mouseup', () => {
    handleInputEnd();
});

canvas.addEventListener('mouseleave', () => {
    handleInputEnd();
});

// Touch Events
canvas.addEventListener('touchstart', (e) => {
    e.preventDefault(); // Prevent scrolling
    if (e.touches.length > 0) {
        isDragging = true;
        const cell = getCellFromTouchEvent(e.touches[0]);
        handleInputStart(cell);
    }
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault(); // Prevent scrolling
    if (!isDragging) return;
    if (e.touches.length > 0) {
        const cell = getCellFromTouchEvent(e.touches[0]);
        handleInputMove(cell);
    }
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    handleInputEnd();
});

function handleInputStart(cell) {
    if (cell.r >= 0 && cell.r < ROWS && cell.c >= 0 && cell.c < COLS) {
        selectionStart = cell;
        selectionEnd = cell;
        draw();
    }
}

function handleInputMove(cell) {
    // Constrain to grid
    const r = Math.max(0, Math.min(ROWS - 1, cell.r));
    const c = Math.max(0, Math.min(COLS - 1, cell.c));

    if (selectionEnd && (selectionEnd.r !== r || selectionEnd.c !== c)) {
        selectionEnd = { r, c };
        draw();
    }
}

function handleInputEnd() {
    if (isDragging && selectionStart && selectionEnd) {
        // Send selection to server
        socket.emit('select_area', {
            r1: selectionStart.r,
            c1: selectionStart.c,
            r2: selectionEnd.r,
            c2: selectionEnd.c
        });
    }
    isDragging = false;
    selectionStart = null;
    selectionEnd = null;
    draw();
}

function getCellFromTouchEvent(touch) {
    const rect = canvas.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    const c = Math.floor(x / CELL_SIZE);
    const r = Math.floor(y / CELL_SIZE);
    return { r, c };
}

// Rendering
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!grid || grid.length === 0) return;

    // Draw Grid
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const val = grid[r][c];
            const x = c * CELL_SIZE;
            const y = r * CELL_SIZE;

            // Background
            ctx.fillStyle = '#1e293b'; // Card bg
            ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);

            // Border
            ctx.strokeStyle = '#334155';
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, CELL_SIZE, CELL_SIZE);

            if (val !== 0) {
                // Draw Apple Block
                ctx.fillStyle = '#334155';
                ctx.fillRect(x + 2, y + 2, CELL_SIZE - 4, CELL_SIZE - 4);

                // Draw Number
                ctx.fillStyle = '#e2e8f0';
                ctx.font = `bold ${CELL_SIZE * 0.5}px Outfit`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(val, x + CELL_SIZE / 2, y + CELL_SIZE / 2);
            }
        }
    }

    // Draw Selection
    if (selectionStart && selectionEnd) {
        const r1 = Math.min(selectionStart.r, selectionEnd.r);
        const r2 = Math.max(selectionStart.r, selectionEnd.r);
        const c1 = Math.min(selectionStart.c, selectionEnd.c);
        const c2 = Math.max(selectionStart.c, selectionEnd.c);

        const x = c1 * CELL_SIZE;
        const y = r1 * CELL_SIZE;
        const w = (c2 - c1 + 1) * CELL_SIZE;
        const h = (r2 - r1 + 1) * CELL_SIZE;

        ctx.fillStyle = 'rgba(56, 189, 248, 0.3)';
        ctx.fillRect(x, y, w, h);

        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, w, h);

        // Calculate sum for feedback
        let sum = 0;
        for (let r = r1; r <= r2; r++) {
            for (let c = c1; c <= c2; c++) {
                sum += grid[r][c];
            }
        }

        // Draw sum tooltip
        // ctx.font = `bold 16px Outfit`;
        // ctx.fillText(`Sum: ${sum}`, x + w / 2, y - 10);
    }

    // Draw Active Highlights (from other players)
    activeHighlights.forEach(h => {
        // Filter out old highlights just in case, though we do it in setTimeout
        if (Date.now() - h.timestamp > 1000) return;

        const x = h.c1 * CELL_SIZE;
        const y = h.r1 * CELL_SIZE;
        const w = (h.c2 - h.c1 + 1) * CELL_SIZE;
        const h_px = (h.r2 - h.r1 + 1) * CELL_SIZE;

        ctx.fillStyle = 'rgba(239, 68, 68, 0.4)'; // Reddish highlight
        ctx.fillRect(x, y, w, h_px);

        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, w, h_px);

        // Optional: Draw name?
        // ctx.fillStyle = '#fff';
        // ctx.fillText(h.playerName, x + w/2, y + h_px/2);
    });
}

// Socket Events
socket.on('connect', () => {
    console.log('Connected');
    const savedName = localStorage.getItem('player_name');
    if (savedName) {
        socket.emit('update_name', savedName);
    }
});

socket.on('init_game', (data) => {
    grid = data.grid;
    myId = data.myId;
    updateGameMode(data.gameMode || 'normal');
    updateTimer(data.timer);

    updateLobbyPlayerList(data.players);
    if (data.settings) {
        ROWS = data.settings.ROWS || 10;
        COLS = data.settings.COLS || 20;
        rowsInput.value = ROWS;
        colsInput.value = COLS;
        durationInput.value = data.settings.GAME_DURATION || 120;
    }

    if (data.gameState === 'playing') {
        showGame();
        resizeCanvas();
    } else {
        showLobby();
    }
    updateAdminUI(); // Check if I should see admin controls
    gameOverModal.classList.add('hidden');
});

socket.on('player_list_update', (players) => {
    updateLobbyPlayerList(players);
});

socket.on('grid_update', (data) => {
    grid = data.grid;
    draw();
});

socket.on('score_update', (scores) => {
    updateLeaderboard(scores);
    if (myId && scores[myId] !== undefined) {
        myScoreEl.textContent = scores[myId];
    }
});

socket.on('timer_update', (time) => {
    updateTimer(time);
});

socket.on('block_cleared', (data) => {
    const { playerName, area } = data;

    // Show toast
    showToast(`${playerName} cleared a block!`);

    // Add highlight
    activeHighlights.push({
        ...area,
        playerName,
        timestamp: Date.now()
    });
    draw();

    // Remove highlight after 1 second
    setTimeout(() => {
        activeHighlights = activeHighlights.filter(h => Date.now() - h.timestamp < 1000);
        draw();
    }, 1000);
});

socket.on('settings_update', (settings) => {
    ROWS = settings.ROWS;
    COLS = settings.COLS;
    rowsInput.value = ROWS;
    colsInput.value = COLS;
    durationInput.value = settings.GAME_DURATION;
    showToast(`Game settings updated: ${ROWS}x${COLS}, ${settings.GAME_DURATION}s`);
});

const finalLeaderboardList = document.getElementById('final-leaderboard-list');

socket.on('game_over', (leaderboard) => {
    finalScoreEl.textContent = myScoreEl.textContent;

    // Render final leaderboard
    finalLeaderboardList.innerHTML = '';
    if (leaderboard) {
        leaderboard.forEach(p => {
            const li = document.createElement('li');
            li.className = 'score-item';
            if (p.id === myId) li.classList.add('me');
            const name = p.id === myId ? `${p.name} (You)` : p.name;
            li.innerHTML = `<span>${name}</span><span>${p.score}</span>`;
            finalLeaderboardList.appendChild(li);
        });
    }

    gameOverModal.classList.remove('hidden');
});

socket.on('game_start', (data) => {
    grid = data.grid;
    updateTimer(data.timer);
    gameOverModal.classList.add('hidden');
    countdownOverlay.classList.add('hidden'); // Hide countdown
    showGame();
    resizeCanvas();
    draw();
});

const countdownOverlay = document.getElementById('countdown-overlay');
const countdownNumber = document.getElementById('countdown-number');

socket.on('countdown', (count) => {
    countdownNumber.textContent = count;
    countdownOverlay.classList.remove('hidden');
    lobbyContainer.classList.add('hidden'); // Hide lobby during countdown
});

// UI Helpers
function showLobby() {
    lobbyContainer.classList.remove('hidden');
    gameContainer.classList.add('hidden');
    gameLeaderboard.classList.add('hidden');
}

function showGame() {
    lobbyContainer.classList.add('hidden');
    gameContainer.classList.remove('hidden');
    gameLeaderboard.classList.remove('hidden');
}

function updateLobbyPlayerList(players) {
    lobbyPlayerList.innerHTML = '';
    playersMap = {}; // Update cache
    let allReady = true;

    players.forEach(p => {
        playersMap[p.id] = p;
        if (!p.isReady) allReady = false;

        const li = document.createElement('li');
        li.className = 'lobby-player-item';

        const isMe = p.id === myId;
        const name = isMe ? `${p.name} (You)` : p.name;

        const statusClass = p.isReady ? 'ready' : '';
        const statusText = p.isReady ? 'Ready' : 'Not Ready';

        li.innerHTML = `
            <div class="lobby-player-info">
                <div class="status-dot ${statusClass}"></div>
                <span>${name}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="color: #94a3b8; font-size: 0.8rem;">${statusText}</span>
                ${(isAdmin() && !isMe) ? `<button class="kick-btn" onclick="kickPlayer('${p.id}')">Kick</button>` : ''}
            </div>
        `;
        lobbyPlayerList.appendChild(li);

        if (isMe) {
            if (p.isReady) {
                readyBtn.textContent = 'Not Ready';
                readyBtn.classList.add('ready');
                playerNameInput.disabled = true;
            } else {
                readyBtn.textContent = 'Ready';
                readyBtn.classList.remove('ready');
                playerNameInput.disabled = false;
            }
        }
    });

    startGameBtn.disabled = !allReady || players.length === 0;
}

function updateTimer(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    timerEl.textContent = `${m}:${s}`;
}

function updateLeaderboard(scores) {
    scoreListEl.innerHTML = '';
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);

    sorted.forEach(([id, score]) => {
        const li = document.createElement('li');
        li.className = 'score-item';
        if (id === myId) li.classList.add('me');

        const player = playersMap[id];
        let name = player ? player.name : `Player ${id.substr(0, 4)}`;
        if (id === myId) name = `${name} (You)`;

        li.innerHTML = `<span>${name}</span><span>${score}</span>`;
        scoreListEl.appendChild(li);
    });
}

restartBtn.addEventListener('click', () => {
    gameOverModal.classList.add('hidden');
    showLobby();
});

startGameBtn.addEventListener('click', () => {
    socket.emit('start_game');
});

playerNameInput.addEventListener('input', (e) => {
    const name = e.target.value;
    if (name) {
        localStorage.setItem('player_name', name);
        socket.emit('update_name', name);
        updateAdminUI();
    }
});

applySettingsBtn.addEventListener('click', () => {
    if (!isAdmin()) return;
    const rows = rowsInput.value;
    const cols = colsInput.value;
    const duration = durationInput.value;
    socket.emit('update_settings', { rows, cols, duration });
});

function isAdmin() {
    return playerNameInput.value === 'yiuyiu';
}

function updateAdminUI() {
    if (isAdmin()) {
        adminControls.classList.remove('hidden');
        modeToggleBtn.classList.remove('hidden'); // allow toggle
    } else {
        adminControls.classList.add('hidden');
        modeToggleBtn.classList.add('hidden'); // hide toggle
    }
    // Refresh list to show/hide kick buttons
    const currentList = []; // This is tricky as we don't have the list here. 
    // Usually socket updates list. But maybe we can trigger a list refresh?
    // Actually updateLobbyPlayerList is called by socket. 
    // We can rely on next update or manually trigger simple UI update? 
    // Ideally we store playersList in variable. We stored it in playersMap.
    renderPlayerListFromMap();
}

function kickPlayer(id) {
    if (isAdmin()) {
        socket.emit('kick_player', id);
    }
}
window.kickPlayer = kickPlayer; // Expose to global scope for onclick

function renderPlayerListFromMap() {
    // Re-render list using playersMap
    lobbyPlayerList.innerHTML = '';
    let allReady = true;
    let hasPlayers = false; // Check count

    Object.values(playersMap).forEach(p => {
        hasPlayers = true;
        if (!p.isReady) allReady = false;

        const li = document.createElement('li');
        li.className = 'lobby-player-item';

        const isMe = p.id === myId;
        const name = isMe ? `${p.name} (You)` : p.name;
        const statusClass = p.isReady ? 'ready' : '';
        const statusText = p.isReady ? 'Ready' : 'Not Ready';

        li.innerHTML = `
            <div class="lobby-player-info">
                <div class="status-dot ${statusClass}"></div>
                <span>${name}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="color: #94a3b8; font-size: 0.8rem;">${statusText}</span>
                ${(isAdmin() && !isMe) ? `<button class="kick-btn" onclick="kickPlayer('${p.id}')">Kick</button>` : ''}
            </div>
        `;
        lobbyPlayerList.appendChild(li);
    });

    startGameBtn.disabled = !allReady || !hasPlayers;
}

readyBtn.addEventListener('click', () => {
    socket.emit('toggle_ready');
});

modeToggleBtn.addEventListener('click', () => {
    socket.emit('toggle_mode');
});

socket.on('game_mode_update', (mode) => {
    updateGameMode(mode);
});

function updateGameMode(mode) {
    gameMode = mode;
    if (mode === 'normal') {
        modeToggleBtn.textContent = 'Normal Mode';
        modeToggleBtn.className = 'mode-btn normal';
    } else {
        modeToggleBtn.textContent = 'Capture Mode';
        modeToggleBtn.className = 'mode-btn capture';
    }
}

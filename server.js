const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const path = require('path');

app.use(express.static('public'));

// Game Constants
let ROWS = 10;
let COLS = 20;
let GAME_DURATION = 120; // 10 seconds for testing

// Game State
let gameState = 'waiting'; // 'waiting', 'playing'
let gameMode = 'normal'; // 'normal', 'capture'
let initialGrid = [];
let sharedGrid = [];
let players = {}; // socket.id -> { score, grid, name }
let timer = GAME_DURATION;
let gameInterval = null;

// Helper: Generate a new 10x20 grid with random numbers 1-9
function generateGrid() {
    const grid = [];
    for (let r = 0; r < ROWS; r++) {
        const row = [];
        for (let c = 0; c < COLS; c++) {
            row.push(Math.floor(Math.random() * 9) + 1);
        }
        grid.push(row);
    }
    return grid;
}

// Helper: Deep copy grid
function copyGrid(grid) {
    return grid.map(row => [...row]);
}

// Helper: Count possible combinations summing to 10
function countCombinations(grid) {
    if (!grid || grid.length === 0) return 0;
    const rows = grid.length;
    const cols = grid[0].length;
    let count = 0;

    // Precompute 2D prefix sums
    // prefix[i][j] stores sum of grid[0..i-1][0..j-1]
    const prefix = Array.from({ length: rows + 1 }, () => Array(cols + 1).fill(0));

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            prefix[r + 1][c + 1] = prefix[r][c + 1] + prefix[r + 1][c] - prefix[r][c] + grid[r][c];
        }
    }

    // Iterate over all possible rectangles
    for (let r1 = 0; r1 < rows; r1++) {
        for (let r2 = r1; r2 < rows; r2++) {
            for (let c1 = 0; c1 < cols; c1++) {
                for (let c2 = c1; c2 < cols; c2++) {
                    const currentSum = prefix[r2 + 1][c2 + 1] - prefix[r1][c2 + 1] - prefix[r2 + 1][c1] + prefix[r1][c1];
                    if (currentSum === 10) {
                        count++;
                    }
                }
            }
        }
    }
    return count;
}

function broadcastCombinations() {
    if (gameMode === 'capture') {
        const count = countCombinations(sharedGrid);
        io.emit('combinations_update', count);
    }
}

// Start or Reset Game
function startGame() {
    gameState = 'playing';
    initialGrid = generateGrid();

    if (gameMode === 'capture') {
        sharedGrid = copyGrid(initialGrid);
    }

    timer = GAME_DURATION;

    // Reset all connected players
    for (const id in players) {
        players[id].score = 0;
        players[id].grid = gameMode === 'capture' ? sharedGrid : copyGrid(initialGrid);
    }

    if (gameInterval) clearInterval(gameInterval);
    gameInterval = setInterval(() => {
        timer--;
        io.emit('timer_update', timer);
        if (timer <= 0) {
            clearInterval(gameInterval);

            const leaderboard = Object.values(players)
                .map(p => ({ name: p.name, score: p.score, id: p.id }))
                .sort((a, b) => b.score - a.score);

            io.emit('game_over', leaderboard);

            // Reset player readiness
            for (const id in players) {
                players[id].isReady = false;
            }
            io.emit('player_list_update', getPlayerList());

            gameState = 'waiting';
        }
    }, 1000);

    // Broadcast new state to everyone
    io.emit('game_start', {
        grid: gameMode === 'capture' ? sharedGrid : initialGrid,
        timer
    });
    broadcastScores();
    broadcastCombinations();
}

function broadcastScores() {
    const scores = {};
    for (const id in players) {
        scores[id] = players[id].score;
    }
    io.emit('score_update', scores);
}

function getPlayerList() {
    return Object.values(players).map(p => ({
        id: p.id,
        name: p.name,
        isReady: p.isReady
    }));
}

// Initialize first game if not running
// if (initialGrid.length === 0) {
//     initialGrid = generateGrid();
//     startGame();
// }

io.on('connection', (socket) => {
    console.log('a user connected', socket.id);

    // Initialize new player
    players[socket.id] = {
        id: socket.id,
        name: `Player ${socket.id.substr(0, 4)}`,
        score: 0,
        isReady: false,
        grid: gameState === 'playing' ? copyGrid(initialGrid) : []
    };

    // Send current state to new player
    const initPayload = {
        gameState: gameState,
        gameMode: gameMode,
        grid: (gameMode === 'capture' && gameState === 'playing') ? sharedGrid : players[socket.id].grid,
        timer: timer,
        myId: socket.id,
        players: getPlayerList(),
        settings: { ROWS, COLS, GAME_DURATION }
    };
    if (gameMode === 'capture' && gameState === 'playing') {
        initPayload.combinations = countCombinations(sharedGrid);
    }
    socket.emit('init_game', initPayload);
    broadcastScores();
    io.emit('player_list_update', getPlayerList());

    socket.on('update_name', (name) => {
        if (players[socket.id]) {
            players[socket.id].name = name.substring(0, 15); // Limit length
            io.emit('player_list_update', getPlayerList());
        }
    });

    socket.on('toggle_ready', () => {
        if (players[socket.id]) {
            players[socket.id].isReady = !players[socket.id].isReady;
            io.emit('player_list_update', getPlayerList());
        }
    });

    socket.on('toggle_mode', () => {
        // Only allow if admin (client-side check is weak but acceptable for this context,
        // ideally we check name here too but name isn't secure auth)
        // Checking name "yiuyiu" for basic security as requested
        if (players[socket.id] && players[socket.id].name === 'yiuyiu') {
            gameMode = gameMode === 'normal' ? 'capture' : 'normal';
            io.emit('game_mode_update', gameMode);
            if (gameMode === 'capture' && gameState === 'playing') {
                broadcastCombinations();
            }
        }
    });

    socket.on('update_settings', (settings) => {
        if (players[socket.id] && players[socket.id].name === 'yiuyiu') {
            if (settings.rows) ROWS = parseInt(settings.rows);
            if (settings.cols) COLS = parseInt(settings.cols);
            if (settings.duration) GAME_DURATION = parseInt(settings.duration);

            // Broadcast new settings
            io.emit('settings_update', { ROWS, COLS, GAME_DURATION });
        }
    });

    socket.on('kick_player', (targetId) => {
        if (players[socket.id] && players[socket.id].name === 'yiuyiu') {
            const targetSocket = io.sockets.sockets.get(targetId);
            if (targetSocket) {
                targetSocket.disconnect(true);
            }
        }
    });

    socket.on('start_game', () => {
        if (gameState === 'waiting') {
            // Check if all players are ready
            const allReady = Object.values(players).every(p => p.isReady);
            if (allReady && Object.keys(players).length > 0) {
                startCountdown();
            }
        }
    });

    function startCountdown() {
        gameState = 'starting';
        let count = 3;
        io.emit('countdown', count);

        const interval = setInterval(() => {
            count--;
            if (count > 0) {
                io.emit('countdown', count);
            } else {
                clearInterval(interval);
                startGame();
            }
        }, 1000);
    }

    socket.on('select_area', (data) => {
        if (gameState !== 'playing' || timer <= 0) return;

        const { r1, c1, r2, c2 } = data;
        const player = players[socket.id];

        // Determine which grid to use
        let currentGrid;
        if (gameMode === 'capture') {
            currentGrid = sharedGrid;
        } else {
            if (!player || !player.grid || player.grid.length === 0) return;
            currentGrid = player.grid;
        }

        // Validate bounds
        if (r1 < 0 || r1 >= ROWS || r2 < 0 || r2 >= ROWS ||
            c1 < 0 || c1 >= COLS || c2 < 0 || c2 >= COLS) {
            return;
        }

        // Calculate sum
        let sum = 0;
        const startR = Math.min(r1, r2);
        const endR = Math.max(r1, r2);
        const startC = Math.min(c1, c2);
        const endC = Math.max(c1, c2);

        for (let r = startR; r <= endR; r++) {
            for (let c = startC; c <= endC; c++) {
                const val = currentGrid[r][c];
                sum += val;
            }
        }

        if (sum === 10) {
            // Clear area
            let clearedCount = 0;
            for (let r = startR; r <= endR; r++) {
                for (let c = startC; c <= endC; c++) {
                    if (currentGrid[r][c] !== 0) {
                        currentGrid[r][c] = 0; // 0 means cleared
                        clearedCount++;
                    }
                }
            }

            if (clearedCount > 0) {
                player.score += clearedCount; // Score = number of apples cleared

                if (gameMode === 'capture') {
                    io.emit('grid_update', { grid: sharedGrid });
                    broadcastCombinations();
                    io.emit('block_cleared', {
                        playerName: player.name,
                        area: { r1: startR, c1: startC, r2: endR, c2: endC }
                    });
                } else {
                    socket.emit('grid_update', { grid: player.grid });
                }

                broadcastScores();
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('user disconnected', socket.id);
        delete players[socket.id];
        broadcastScores();
        io.emit('player_list_update', getPlayerList());
    });

    // Admin/Debug command to reset
    socket.on('reset_game', () => {
        startGame();
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

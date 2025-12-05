const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const path = require('path');

app.use(express.static('public'));

// Game Constants
const ROWS = 10;
const COLS = 20;
const GAME_DURATION = 120; // 2 minutes in seconds

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
            gameState = 'waiting'; // Go back to waiting or just end? Let's say end then waiting.

            const leaderboard = Object.values(players)
                .map(p => ({ name: p.name, score: p.score, id: p.id }))
                .sort((a, b) => b.score - a.score);

            io.emit('game_over', leaderboard);
        }
    }, 1000);

    // Broadcast new state to everyone
    io.emit('game_start', {
        grid: gameMode === 'capture' ? sharedGrid : initialGrid,
        timer
    });
    broadcastScores();
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
    socket.emit('init_game', {
        gameState: gameState,
        gameMode: gameMode,
        grid: (gameMode === 'capture' && gameState === 'playing') ? sharedGrid : players[socket.id].grid,
        timer: timer,
        myId: socket.id,
        players: getPlayerList()
    });
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
        gameMode = gameMode === 'normal' ? 'capture' : 'normal';
        io.emit('game_mode_update', gameMode);
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

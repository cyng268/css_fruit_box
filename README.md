# Fruit Box Multiplayer

A real-time multiplayer puzzle game where players race against the clock to clear numbers from a grid by selecting areas that sum up to 10.

## 🍎 Features

- **Real-time Multiplayer:** Play with friends in real-time using Socket.io.
- **Lobby System:** Join a lobby, set your name, and mark yourself as ready.
- **Synchronized Gameplay:** All players start at the same time and share a game timer.
- **Interactive Grid:** Select rectangular areas of numbers to clear them.
- **Live Leaderboard:** See everyone's scores update in real-time.
- **Responsive Design:** Works on desktop and mobile devices.

## 🎮 How to Play

1. **Join the Game:** Open the game in your browser.
2. **Set Name & Ready Up:** Enter your display name and click "Ready".
3. **Start Game:** Once everyone is ready, the host (or any player) can click "Start Game".
4. **Clear Numbers:**
   - Click and drag to select a rectangular area of numbers on the grid.
   - If the sum of the numbers in the selected area equals **10**, they will be cleared.
   - You earn points for every number cleared.
5. **Win:** The player with the highest score when the timer runs out wins!

## 🛠️ Technologies Used

- **Frontend:** HTML5, CSS3, Vanilla JavaScript
- **Backend:** Node.js, Express
- **Real-time Communication:** Socket.io

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v14 or higher recommended)
- npm (Node Package Manager)

### Installation

1. Clone the repository (if applicable) or download the source code.
2. Navigate to the project directory:
   ```bash
   cd fruit_box
   ```
3. Install dependencies:
   ```bash
   npm install
   ```

### Running the Game

1. Start the server:
   ```bash
   npm start
   ```
   Or for development with auto-restart (if nodemon is installed):
   ```bash
   npm run dev
   ```
2. Open your web browser and go to:
   ```
   http://localhost:3000
   ```
3. Open multiple tabs or share the link with friends on the same network to test multiplayer functionality.

## 📂 Project Structure

```
fruit_box/
├── public/             # Frontend static files
│   ├── index.html      # Main game HTML
│   ├── style.css       # Game styling
│   └── script.js       # Client-side game logic
├── server.js           # Main backend server (Express + Socket.io)
├── package.json        # Project dependencies and scripts
└── .gitignore          # Git ignore rules
```

## 🤝 Contributing

Feel free to fork this project and submit pull requests. You can also open issues for bugs or feature suggestions.

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

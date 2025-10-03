import { getCurrentGameMode, getCurrentUser, setCurrentPage, setCurrentUser } from '../utils/globalState';
import { PongGame } from '../game/PongGame';
import { toggleTournaments } from '../tournament';
import { renderApp } from '../main';

let pongGame: PongGame | null = null;

export async function renderGamePage(): Promise<void> {
    const gameMode = getCurrentGameMode();
    
    if (gameMode === "1v1") {
        await renderTwoPlayerGame();
    } else if (gameMode === "4player") {
        await renderFourPlayerGame();
    } else {
        console.log("Unrecognized game mode:", gameMode);
    }
}

async function renderTwoPlayerGame(): Promise<void> {
    const root = document.getElementById('app-root');
    if (!root) return;
    
    root.innerHTML = `
        <h1 class="main-title">2-Player Pong</h1>
        <div class="game-status">
            <div>
                Status: <span id="gameStatus" class="status-text">Initializing...</span>
            </div>
            <div>
                WebSocket: <span id="wsStatus" class="ws-status">Disconnected</span>
            </div>
            <div>
                FPS: <span id="fpsCounter" class="fps-text">0</span>
            </div>
        </div>
        <div class="controls-container">
            <button id="startBtn" class="btn btn-start">Start Game</button>
            <button id="pauseBtn" class="btn btn-pause">Pause Game</button>
            <button id="endBtn" class="btn btn-end">End Game</button>
            <button id="reconnectBtn" class="btn btn-reconnect">Reconnect WebSocket</button>
            <button id="tournamentsBtn" class="btn btn-tournaments">Tournaments</button>
        </div>
        <div class="player-info">
            <div class="player-names">
                <span id="player1Name" class="player1-name">${getCurrentUser() || 'Player 1'}</span>
                <span class="vs-text">vs</span> 
                <span id="player2Name" class="player2-name">Player 2</span>
            </div>
            <div class="score-container">
                <span id="player1score" class="player1-score">0</span> 
                <span class="score-separator">-</span> 
                <span id="player2score" class="player2-score">0</span>
            </div>
        </div>
        <canvas id="gameScreen" width="400" height="200"></canvas>
        <div class="controls-info">
            <p>Player 1 - Up/Down W/S</p>
        </div>
        <button id="backToLandingBtn" class="btn btn-back">Back</button>
        <hr>
        <div id="tournamentRoot" class="t-section"></div>
    `;
    
    await setupGameButtons();

    const backBtn = document.getElementById('backToLandingBtn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            history.pushState({ page: 'landing' }, '', '#');
            setCurrentPage('landing');
            renderApp();
        });
    }
}

async function renderFourPlayerGame(): Promise<void> {
    const root = document.getElementById('app-root');
    if (!root) return;
    
    root.innerHTML = `
        <h1 class="main-title">4-Player Pong</h1>
        <div class="game-status">
            <div>
                Status: <span id="gameStatus" class="status-text">Initializing...</span>
            </div>
            <div>
                WebSocket: <span id="wsStatus" class="ws-status">Disconnected</span>
            </div>
            <div>
                FPS: <span id="fpsCounter" class="fps-text">0</span>
            </div>
        </div>
        <div class="controls-container">
            <button id="startBtn" class="btn btn-start">Start Game</button>
            <button id="pauseBtn" class="btn btn-pause">Pause Game</button>
            <button id="endBtn" class="btn btn-end">End Game</button>
            <button id="reconnectBtn" class="btn btn-reconnect">Reconnect WebSocket</button>
            <button id="tournamentsBtn" class="btn btn-tournaments">Tournaments</button>
        </div>
        
        <div class="player-info">
            <span id="player1Name" class="player1-name">${getCurrentUser() || 'Player 1'}</span>
            <span class="vs-text">vs</span> 
            <span id="player2Name" class="player2-name">Player 2</span>
            <span class="vs-text">vs</span> 
            <span id="player3Name" class="player3-name">Player 3</span>
            <span class="vs-text">vs</span> 
            <span id="player4Name" class="player4-name">Player 4</span>
        </div>
        <div class="score-container">
            <span id="player1score" class="player1-score">0</span> 
            <span class="score-separator">-</span> 
            <span id="player2score" class="player2-score">0</span>
            <span class="score-separator">-</span> 
            <span id="player3score" class="player3-score">0</span>
            <span class="score-separator">-</span> 
            <span id="player4score" class="player4-score">0</span>
        </div>
        
        <canvas id="gameScreen" width="400" height="400"></canvas>
        
        <div class="controls-info" style="background: rgba(0, 0, 0, 0.3); padding: 15px; border-radius: 5px; margin-top: 15px;">
            <div class="four-player-controls">
                <p style="color: #ffaa00; font-style: italic; text-align: center; margin-top: 10px;">Last player to touch ball gets point when opponent misses!</p>
            </div>
        </div>
        <button id="backToLandingBtn" class="btn btn-back" style="text-align: center">Back</button>
        <hr>
        <div id="tournamentRoot" class="t-section"></div>
    `;
    
    const backBtn = document.getElementById('backToLandingBtn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            history.pushState({ page: 'landing' }, '', '#');
            setCurrentPage('landing');
            renderApp();
        });
    }

    await setupGameButtons();
}

async function setupGameButtons(): Promise<void> {
    const startBtn = document.getElementById('startBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const endBtn = document.getElementById('endBtn');
    const reconnectBtn = document.getElementById('reconnectBtn');
    const tournamentsBtn = document.getElementById('tournamentsBtn');
    
    if (startBtn) startBtn.addEventListener('click', startGame);
    if (pauseBtn) pauseBtn.addEventListener('click', pauseGame);
    if (endBtn) endBtn.addEventListener('click', endGame);
    if (reconnectBtn) reconnectBtn.addEventListener('click', reconnectWS);
    if (tournamentsBtn) tournamentsBtn.addEventListener('click', toggleTournaments);

    await initializeGame();
}

async function initializeGame(): Promise<void> {
    if (pongGame) {
        await pongGame.pauseGame();
        pongGame = null;
    }
    
    pongGame = new PongGame();
    await pongGame.init();
}

async function startGame(): Promise<void> {
    if (pongGame) {
        if (!pongGame.gameId) {
            await pongGame.init();
        }
        
        try {
            await pongGame.startServerGame();
            pongGame.startRenderLoop();
        } catch (error) {
            console.error('Failed to start game:', error);
        }
    }
}

async function pauseGame(): Promise<void> {
    if (pongGame) {
        await pongGame.pauseGame();
    }
}

async function endGame(): Promise<void> {
    if (pongGame) {
        await pongGame.endGame();
        
        const startBtn = document.getElementById('startBtn') as HTMLButtonElement;
        const pauseBtn = document.getElementById('pauseBtn') as HTMLButtonElement;
        if (startBtn) startBtn.disabled = false;
        if (pauseBtn) pauseBtn.disabled = true;
        
        pongGame.updateStatus("Game ended - Click Start for new game");
    }
}

async function reconnectWS(): Promise<void> {
    if (pongGame) {
        pongGame.reconnectWebSocket();
    }
}

export { pongGame };
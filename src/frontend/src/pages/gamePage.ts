import { setCurrentPage, getCurrentUser, getCurrentGameMode } from '../utils/globalState';
import { renderApp } from '../main';
import { authService } from '../utils/auth';
import { PongGame } from '../game/PongGame';
import { getLobbyPlayers, Player } from './lobbyPage';

export let pongGame: PongGame | null = null;

export async function renderGamePage(): Promise<void> {
    const gameMode = getCurrentGameMode();
    
    if (gameMode === '4player') {
        await renderFourPlayerGame();
    } else {
        await renderTwoPlayerGame();
    }
}

async function renderTwoPlayerGame(): Promise<void> {
    const root = document.getElementById('app-root');
    if (!root) return;
    
    // Get players from lobby
    const lobbyPlayers = getLobbyPlayers();
    const player1 = lobbyPlayers[0] || { username: 'Player 1', isAI: false };
    const player2 = lobbyPlayers[1] || { username: 'Player 2', isAI: false };
    
    // Get authenticated user info for fallback
    const user = authService.getCurrentUser();
    const displayName = user?.username || getCurrentUser() || player1.username;
    
    root.innerHTML = `
        <h1 class="main-title">Pong Game</h1>
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
                <span id="player1Name" class="player1-name">${player1.username}</span>
                <span class="vs-text">vs</span> 
                <span id="player2Name" class="player2-name">${player2.username}</span>
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
    
    // Get players from lobby
    const lobbyPlayers = getLobbyPlayers();
    const players = [
        lobbyPlayers[0] || { username: 'Player 1', isAI: false },
        lobbyPlayers[1] || { username: 'Player 2', isAI: false },
        lobbyPlayers[2] || { username: 'Player 3', isAI: false },
        lobbyPlayers[3] || { username: 'Player 4', isAI: false }
    ];
    
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
            <span id="player1Name" class="player1-name">${players[0].username}</span>
            <span class="vs-text">vs</span> 
            <span id="player2Name" class="player2-name">${players[1].username}</span>
            <span class="vs-text">vs</span> 
            <span id="player3Name" class="player3-name">${players[2].username}</span>
            <span class="vs-text">vs</span> 
            <span id="player4Name" class="player4-name">${players[3].username}</span>
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
                <p style="color: #60a5fa; font-weight: bold;">${players[0].username} (Top): A / D</p>
                <p style="color: #f87171; font-weight: bold;">${players[1].username} (Right): Up / Down Arrow</p>
                <p style="color: #facc15; font-weight: bold;">${players[2].username} (Bottom): J / L</p>
                <p style="color: #1be71b; font-weight: bold;">${players[3].username} (Left): W / S</p>
                <p style="color: #ffaa00; font-style: italic; text-align: center; margin-top: 10px;">Last player to touch ball gets point when opponent misses!</p>
            </div>
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

async function setupGameButtons(): Promise<void> {
    pongGame = new PongGame();
    
    pongGame.onGameEnd = async (winnerId: number) => {
        console.log(`Game ended, winner is Player ${winnerId}`);
        
        if (!pongGame || !pongGame.gameId) {
            console.error('No game ID available to update winner');
            return;
        }
        
        try {
            const apiEndpoint = window.__INITIAL_STATE__?.apiEndpoint || '';
            const response = await fetch(`${apiEndpoint}/api/game/${pongGame.gameId}/winner`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ 
                    winnerId: winnerId 
                }),
            });

            const data = await response.json();
            if (data.success) {
                console.log(`Winner (Player ${winnerId}) updated in database successfully`);
            } else {
                console.error('Failed to update winner:', data.message);
            }
        } catch (error) {
            console.error('Error updating winner:', error);
        }
    };
    
    await pongGame.init();

    const startBtn = document.getElementById('startBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const endBtn = document.getElementById('endBtn');
    const reconnectBtn = document.getElementById('reconnectBtn');
    const tournamentsBtn = document.getElementById('tournamentsBtn');

    if (startBtn) {
        startBtn.addEventListener('click', async () => {
            if (pongGame) {
                await pongGame.startServerGame();
            }
        });
    }

    if (pauseBtn) {
        pauseBtn.addEventListener('click', async () => {
            if (pongGame) {
                await pongGame.pauseGame();
            }
        });
    }

    if (endBtn) {
        endBtn.addEventListener('click', async () => {
            if (pongGame) {
                await pongGame.endGame();
            }
        });
    }

    if (reconnectBtn) {
        reconnectBtn.addEventListener('click', async () => {
            if (pongGame) {
                await pongGame.reconnectWebSocket();
            }
        });
    }

    if (tournamentsBtn) {
        tournamentsBtn.addEventListener('click', () => {
            const tournamentRoot = document.getElementById('tournamentRoot');
            if (tournamentRoot) {
                tournamentRoot.style.display = tournamentRoot.style.display === 'none' ? 'block' : 'none';
            }
        });
    }
}
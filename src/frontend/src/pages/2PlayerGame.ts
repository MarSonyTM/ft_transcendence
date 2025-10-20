import { setCurrentPage, getCurrentGameMode } from '../utils/globalState';
import { renderApp } from '../main';
import { authService } from '../utils/auth';
import { PongGame } from '../game/PongGame';
import { getLobbyPlayers,  getCurrentRoom } from '../utils/roomState';
import { initRoomWebSocket, RoomWebSocketManager } from '../utils/roomWebSocket';
import { setGameScreen,  cleanupGame,  updateConnectionStatus, setEffectiveRoom } from '../utils/gameUtils'
import { toggleTournaments } from '../tournament';

export let pongGame: PongGame | null = null;

export async function render2PlayerGame(): Promise<void> {
    const room = getCurrentRoom();

    pongGame = new PongGame();

    if (room)
        pongGame.hasLocal = room.players.some(p => p.id === 'local');

    const root = document.getElementById('app-root');
    if (!root) return;
    
    // Get players from lobby
    const lobbyPlayers = getLobbyPlayers();
    const players = [
        lobbyPlayers[0] || { username: 'Player 1', isAI: false },
        lobbyPlayers[1] || { username: 'Player 2', isAI: false },
    ];
    
    // Get authenticated user info for fallback
    const user = authService.getCurrentUser();
    
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
                <span id="player1Name" class="player1-name">${players[0].username}</span>
                <span class="vs-text">vs</span> 
                <span id="player2Name" class="player2-name">${players[1].username}</span>
            </div>
            <div class="score-container">
                <span id="player1score" class="player1-score">0</span> 
                <span class="score-separator">-</span> 
                <span id="player2score" class="player2-score">0</span>
            </div>
        </div>
        <div class="threeD-wrapper">
            <canvas id="renderCanvas"></canvas>
        </div>
        <div class="controls-info">
            <p style="color: #60a5fa; font-weight: bold;">W / S</p>
            ${!pongGame.hasLocal ? '<p style="color: #60a5fa; font-weight: bold;">Player 2 - Up/Down</p>' : ''}
        </div>
        <button id="backToLandingBtn" class="btn btn-back">Back to Home</button>
        <hr>
        <div id="tournamentRoot" class="t-section"></div>
    `;
    
    await setupGameButtons(pongGame);

    const backBtn = document.getElementById('backToLandingBtn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            if (pongGame) {
                cleanupGame(pongGame);
                pongGame.endGame();
            }
            history.pushState({ page: 'landing' }, '', '/landing');
            setCurrentPage('landing');
            renderApp();
        });
    }
    
    if (pongGame && room) {
        await initRoomBasedGame(room);
    }
}

async function setupGameButtons(pongGame: PongGame): Promise<void> {
    
    let effectiveRoom = await setEffectiveRoom();

    if (!effectiveRoom || !effectiveRoom.gameId) {
        console.error('❌ No shared gameId available yet; not creating a standalone game.');
        return;
    }

    console.log('Room-based game detected! Using shared gameId:', effectiveRoom.gameId);
    
    pongGame.gameId = effectiveRoom.gameId;
    
    setGameScreen(pongGame);

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
            cleanupGame(pongGame);
        });
    }

    if (reconnectBtn) {
        reconnectBtn.addEventListener('click', async () => {
            if (pongGame) {
                pongGame.reconnectWebSocket();
            }
            if (pongGame.roomWS) {
                try {
                    await pongGame.roomWS.connect();
                } catch (error) {
                    console.error('Failed to reconnect room WebSocket:', error);
                }
            }
        });
    }

    if (tournamentsBtn) {
        tournamentsBtn.addEventListener('click', toggleTournaments);
    }
}

// Initialize room-based multiplayer game
async function initRoomBasedGame(room: any): Promise<void> {
    if (!pongGame) {
        console.error('No pongGame instance');
        return;
    }
    
    const user = authService.getCurrentUser();
    
    if (!user && localStorage.getItem('isGuest') != 'true') {
        console.error('No authenticated user for room game');
        return;
    }

    const playerId = user?.id?.toString() || `guest-${Date.now()}`;
    const gameMode = getCurrentGameMode();

    console.log('Initializing room-based game:', {
        roomId: room.roomId,
        playerId,
        gameId: room.gameId,
        gameMode
    });

    // Initialize WebSocket connection to room
    pongGame.roomWS = initRoomWebSocket({
        roomId: room.roomId,
        playerId,
        
        onConnect: () => {
            console.log('✅ Connected to 2-player game room');
            updateConnectionStatus('Connected (Room)', true);
            
            if (pongGame?.roomWS) {
                pongGame.roomWS.requestState();
                setupKeyboardControls(pongGame.roomWS, playerId);
            }
        },
        
        onDisconnect: () => {
            console.log('Disconnected from 2-player game room');
            updateConnectionStatus('Disconnected', false);
        },
        
        onGameState: (state) => {
            if (!pongGame) 
                return;
            pongGame.currentGameState = state;
            syncGameStateFromRoom(state);
        },
        
        onPlayerMove: (movedPlayerId, position) => {
            console.log(`Remote player ${movedPlayerId} moved to ${position}`);
            if (pongGame?.currentGameState) { 
                updateRemotePlayerPosition(movedPlayerId, position);
            }
        },
        
        onScore: (scores) => {
            console.log('Score update from room:', scores);
            updateScoreDisplay(scores);
        },
        
        onGameEnd: (winnerId) => {
            console.log('2-player game ended in room, winner:', winnerId);
            const winner = room.players.find((p: any) => p.id === winnerId);
            if (winner) {
                alert(`Game Over! ${winner.username} wins!`);
            }
        }
    });

    try {
        await pongGame.roomWS.connect();
    } catch (e) {
        console.error('❌ Failed to connect room WebSocket:', e);
    }
}

// Setup keyboard controls
function setupKeyboardControls(ws: RoomWebSocketManager, playerId: string): void {
    const keys: { [key: string]: boolean } = {};
    const hasLocal = pongGame && pongGame.hasLocal;
    
    const gameMode = getCurrentGameMode();

    console.log('Setting up controls:', { 
        playerId,
        hasLocal,
        gameMode
    });
    
    const movementKeys = new Set(['w','s','o','l','arrowup','arrowdown']);

    const handleKeyDown = (e: KeyboardEvent) => {
        const key = e.key.toLowerCase();
        const wasPressed = keys[key];
        keys[key] = true;
        
        // Only send on key state CHANGE
        if (!wasPressed && movementKeys.has(key)) {
            e.preventDefault();
            
            // Check if this is a local guest key (o/l)
            const isGuestKey = ['o', 'l'].includes(key);
            
            if (isGuestKey && hasLocal) {
                // Send as guest/local player
                ws.sendKeyState(key, true, true);
            } else if (!isGuestKey) {
                // Send as main player
                ws.sendKeyState(key, true, false);
            }
        }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
        const key = e.key.toLowerCase();
        keys[key] = false;
        
        if (movementKeys.has(key)) {
            const isGuestKey = ['o', 'l'].includes(key);
            
            if (isGuestKey && hasLocal) {
                ws.sendKeyState(key, false, true);
            } else if (!isGuestKey) {
                ws.sendKeyState(key, false, false);
            }
        }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
}


// Sync game state from room WebSocket
function syncGameStateFromRoom(state: any): void {
    if (!pongGame || !pongGame.gameState) return;

    // Merge delta updates - only update fields that are present
    if (state.ballPosX !== undefined) {
        pongGame.gameState.ballPosX = state.ballPosX;
    }
    if (state.ballPosY !== undefined) {
        pongGame.gameState.ballPosY = state.ballPosY;
    }
    for (let i = 0; i < 2; i++) {
        if (state.players && state.players[i] && state.players[i].pos !== undefined) {
            pongGame.gameState.players[i].pos = state.players[i].pos;
        }
        if (state.players && state.players[i] && state.players[i].score !== undefined) {
            pongGame.gameState.players[i].score = state.players[i].score;
        }
    }
}

// Update remote player position
function updateRemotePlayerPosition(playerId: string, position: number): void {
    if (!pongGame || !pongGame.gameState) return;
    
    const room = getCurrentRoom();

    if (!room) 
        return;
    
    const user = authService.getCurrentUser();
    const currentPlayerId = user?.id?.toString();
    
    if (playerId === currentPlayerId) 
        return;
    
    const playerIndex = room.players.findIndex((p: any) => p.id === playerId);
    const currentPos = pongGame.gameState.players[playerIndex].pos || position;
    pongGame.gameState.players[playerIndex].pos = currentPos + (position - currentPos);
}

// Update score display
function updateScoreDisplay(scores: any): void {
    const scoreP1 = document.getElementById('player1score');
    const scoreP2 = document.getElementById('player2score');

    if (scoreP1 && scores.scorePlayer1 !== undefined) {
        scoreP1.textContent = scores.scorePlayer1.toString();
    }
    if (scoreP2 && scores.scorePlayer2 !== undefined) {
        scoreP2.textContent = scores.scorePlayer2.toString();
    }
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }

    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);
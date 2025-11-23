import { setCurrentPage, getCurrentGameMode } from '../utils/globalState';
import { renderApp } from '../main';
import { authService } from '../utils/auth';
import { PongGame } from '../game/PongGame';
import { getLobbyPlayers,  getCurrentRoom } from '../utils/roomState';
import { initRoomWebSocket, RoomWebSocketManager } from '../utils/roomWebSocket';
import { setGameScreen, endGame,cleanupGame, setEffectiveRoom, showGameEndScreen } from '../utils/gameUtils'
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
        <div class="neon-grid">
            <div class="grid-anim"></div>
            <div class="glass-card" style="max-width: 1200px; width: 100%;">

                <div style="text-align: center; margin-bottom: 20px;">
                    <h1 class="title-neon" style="font-size: 2.5rem;">Pong Game</h1>
                </div>

                <div class="glass-card" style="margin-bottom: 20px; padding: 15px;">
                    <div style="display: flex; justify-content: space-around; align-items: center; flex-wrap: wrap; gap: 15px;">
                        <div>Status: <span id="gameStatus" class="status-text" style="color: #0ff; font-weight: bold;">Initializing...</span></div>
                        <div>WebSocket: <span id="wsStatus" class="ws-status" style="color: #0f0; font-weight: bold;">Disconnected</span></div>
                        <div>FPS: <span id="fpsCounter" class="fps-text" style="color: #ff0; font-weight: bold;">0</span></div>
                    </div>
                </div>

                <div class="glass-card" style="margin-bottom: 20px; padding: 15px;">
                    <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                        <button id="startBtn" class="btn btn-neon primary">Start Game</button>
                        <button id="pauseBtn" class="btn btn-neon accent">Pause Game</button>
                        <button id="endBtn" class="btn btn-neon danger">End Game</button>
                        <button id="reconnectBtn" class="btn btn-neon primary">Reconnect WebSocket</button>
                        <button id="tournamentsBtn" class="btn btn-neon accent">Tournaments</button>
                    </div>
                </div>

                <div class="glass-card" style="margin-bottom: 20px; padding: 20px; text-align: center;">
                    <div class="player-names" style="margin-bottom: 10px;">
                        <span id="player1Name" class="player1-name" style="color: #0ff; font-weight: bold; font-size: 1.2rem;">${players[0].username}</span>
                        <span class="vs-text" style="color: #fff; margin: 0 15px; font-weight: bold;">VS</span>
                        <span id="player2Name" class="player2-name" style="color: #ff0; font-weight: bold; font-size: 1.2rem;">${players[1].username}</span>
                    </div>
                    <div class="score-container" style="font-size: 3rem; font-weight: bold; color: #fff; text-shadow: 0 0 10px rgba(0, 255, 255, 0.5);">
                        <span id="player1score" class="player1-score">0</span>
                        <span class="score-separator" style="margin: 0 20px;">-</span>
                        <span id="player2score" class="player2-score">0</span>
                    </div>
                </div>

                <div class="threeD-wrapper">
                    <canvas id="renderCanvas"></canvas>
                </div>

                <div class="controls-info" style="background: rgba(255, 255, 255, 0.1); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 10px; padding: 15px; margin-top: 20px; text-align: center;">
                    <p style="color: #0ff; font-weight: bold; margin: 5px 0;">${players[0].username}: W / S keys</p>
                    ${pongGame.hasLocal ? '<p style="color: #0ff; font-weight: bold; margin: 5px 0;">Local Player: O / L keys</p>' : ''}
                    <p style="color: #ff6b00; font-style: italic; margin-top: 10px;">Last player to touch ball gets point when opponent misses!</p>
                </div>

                <div style="text-align: center; margin-top: 20px;">
                    <button id="backToLandingBtn" class="btn btn-neon danger">Back to Home</button>
                </div>
            </div>
        </div>
    `;
    
    await setupGameButtons(pongGame);

    const backBtn = document.getElementById('backToLandingBtn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            if (pongGame) {
                cleanupGame(pongGame);
                endGame(pongGame);
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
    endGame(pongGame);

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
    
    if (!user) {
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
            
            if (pongGame?.roomWS) {
                pongGame.roomWS.requestState();
                setupKeyboardControls(pongGame.roomWS, playerId);
            }
        },
        
        onDisconnect: () => {
            console.log('Disconnected from 2-player game room');
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
        
        onGameEnd: (data: any) => {
            console.log('2-player game ended in room, winner:', data);
            const winner = room.players.find((p: any) => p.id === data.winnerId);
            const winnerName = winner ? winner.username : `Player ${data.winnerId}`;
            const winnerId = winner ? winner.id : data.winnerId;
        
            showGameEndScreen(winnerId, winnerName, pongGame!);
        },
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

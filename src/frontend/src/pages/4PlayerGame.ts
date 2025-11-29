import { setCurrentPage, getCurrentGameMode } from '../utils/globalState';
import { renderApp } from '../main';
import { authService } from '../utils/auth';
import { PongGame } from '../game/PongGame';
import { getLobbyPlayers, getCurrentRoom } from '../utils/roomState';
import { initRoomWebSocket,  RoomWebSocketManager } from '../utils/roomWebSocket';
import { setGameScreen, endGame, cleanupGame, setEffectiveRoom, showGameEndScreen } from '../utils/gameUtils'
import { presenceService } from '../utils/presenceService';

export let pongGame: PongGame | null = null;
let keyboardCleanup: (() => void) | null = null;

export async function render4PlayerGame(): Promise<void> {
    const room = getCurrentRoom();

    pongGame = new PongGame();

    if (room) {
        pongGame.hasLocal = room.players.some(p => p.id === 'local');
    }
    
    const root = document.getElementById('app-root');
    if (!root) return;
    
    // Get players from lobby
    const lobbyPlayers = getLobbyPlayers();
    const players = [
        lobbyPlayers[0] || { name: 'Player 1', isAI: false },
        lobbyPlayers[1] || { name: 'Player 2', isAI: false },
        lobbyPlayers[2] || { name: 'Player 3', isAI: false },
        lobbyPlayers[3] || { name: 'Player 4', isAI: false }
    ];

    // Get authenticated user info for fallback
    const user = authService.getCurrentUser();
    
    root.innerHTML = `

    <!-- Fixed Debug Panel - Top Left -->
        <div style="position: fixed; top: 10px; left: 10px; z-index: 9999; background: rgba(0, 0, 0, 0.8); border: 1px solid rgba(0, 255, 255, 0.3); border-radius: 8px; padding: 10px; font-size: 0.85rem; max-width: 300px;">
            <div style="margin-bottom: 8px; color: #0ff; font-weight: bold; border-bottom: 1px solid rgba(0, 255, 255, 0.3); padding-bottom: 5px;">Debug Panel</div>
            <div style="display: flex; flex-direction: column; gap: 5px; margin-bottom: 10px;">
                <div>Status: <span id="gameStatus" style="color: #0ff; font-weight: bold;">Initializing...</span></div>
                <div>WebSocket: <span id="wsStatus" style="color: #0f0; font-weight: bold;">Disconnected</span></div>
                <div>FPS: <span id="fpsCounter" style="color: #ff0; font-weight: bold;">0</span></div>
            </div>
            <div style="display: flex; flex-direction: column; gap: 5px;">
                <button id="startBtn" class="btn btn-neon primary" style="padding: 5px 10px; font-size: 0.8rem;">Start Game</button>
                <button id="pauseBtn" class="btn btn-neon accent" style="padding: 5px 10px; font-size: 0.8rem;">Pause Game</button>
                <button id="endBtn" class="btn btn-neon danger" style="padding: 5px 10px; font-size: 0.8rem;">End Game</button>
                <button id="reconnectBtn" class="btn btn-neon primary" style="padding: 5px 10px; font-size: 0.8rem;">Reconnect WebSocket</button>
                <button id="tournamentsBtn" class="btn btn-neon accent" style="padding: 5px 10px; font-size: 0.8rem;">Tournaments</button>
            </div>
        </div>
        <div class="neon-grid" style="padding: 0; ">
            <div class="grid-anim"></div>
            <div class="glass-card" style="max-width: 1200px; width: 100%;">

                <div class="glass-card" style="margin-bottom: 20px; padding: 20px; text-align: center;">
                    <div class="player-names" style="margin-bottom: 15px; display: flex; justify-content: center; align-items: center; flex-wrap: wrap; gap: 10px;">
                        <span id="player1Name" class="player1-name" style="color: #0ff; font-weight: bold;">${players[0].username}</span>
                        <span class="vs-text" style="color: #fff; font-weight: bold;">VS</span>
                        <span id="player2Name" class="player2-name" style="color: #ff0; font-weight: bold;">${players[1].username}</span>
                        <span class="vs-text" style="color: #fff; font-weight: bold;">VS</span>
                        <span id="player3Name" class="player3-name" style="color: #f0f; font-weight: bold;">${players[2].username}</span>
                        <span class="vs-text" style="color: #fff; font-weight: bold;">VS</span>
                        <span id="player4Name" class="player4-name" style="color: #0f0; font-weight: bold;">${players[3].username}</span>
                    </div>
                    <div class="score-container" style="font-size: 2.5rem; font-weight: bold; color: #fff; text-shadow: 0 0 10px rgba(0, 255, 255, 0.5);">
                        <span id="player1score" class="player1-score">0</span>
                        <span class="score-separator" style="margin: 0 15px;">-</span>
                        <span id="player2score" class="player2-score">0</span>
                        <span class="score-separator" style="margin: 0 15px;">-</span>
                        <span id="player3score" class="player3-score">0</span>
                        <span class="score-separator" style="margin: 0 15px;">-</span>
                        <span id="player4score" class="player4-score">0</span>
                    </div>
                </div>

                <div class="threeD-wrapper">
                    <canvas id="renderCanvas"></canvas>
                </div>

                <div class="controls-info" style="background: rgba(255, 255, 255, 0.1); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 10px; padding: 15px; margin-top: 20px; text-align: center;">
                    <p style="color: #0ff; font-weight: bold; margin: 5px 0;">W / S keys</p>
                    ${!pongGame.hasLocal ? '<p style="color: #0f0; font-weight: bold; margin: 5px 0;">Player 2: Up/Down arrows</p>' : ''}
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
        backBtn.addEventListener('click', async () => {
            // Clean up keyboard handlers
            if (keyboardCleanup) {
                keyboardCleanup();
            }
            
            if (pongGame) {
                cleanupGame(pongGame);
                endGame(pongGame);
            }
            
            history.pushState({ page: 'landing' }, '', '/landing');
            setCurrentPage('landing');
            renderApp();
        });
    }
    
    if (room) {
        await initRoomBasedGame(room);
    }
}

async function setupGameButtons(pongGame: PongGame): Promise<void> {   
    
    let effectiveRoom = await setEffectiveRoom();
    
    if (!effectiveRoom || !effectiveRoom.gameId) {
        console.warn('No game found, returning to home.');
        history.pushState({ page: 'landing' }, '', '/landing');
        setCurrentPage('landing');
        renderApp();
        return;
    }
    
    pongGame.gameId = effectiveRoom.gameId;
    
    setGameScreen(pongGame);
    endGame(pongGame);

    const startBtn = document.getElementById('startBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const endBtn = document.getElementById('endBtn');
    const reconnectBtn = document.getElementById('reconnectBtn');

    if (startBtn) {
        startBtn.addEventListener('click', async () => {
            if (pongGame) {
                // Set status to "in game" when starting
                await presenceService.setInGame();
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
            
            // Set status back to online when ending game
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
}

// Initialize room-based multiplayer game
async function initRoomBasedGame(room: any): Promise<void> {
    if (!pongGame) {
        return;
    }
    
    const user = await authService.getCurrentUser();
    
    if (!user) {
        console.error('No authenticated user for room game');
        return;
    }

    const playerId = user.id?.toString() || `guest-${Date.now()}`;
    const gameMode = getCurrentGameMode();

    pongGame.roomWS = initRoomWebSocket({
        roomId: room.roomId,
        playerId,
        
        onConnect: () => {
            
            if (pongGame?.roomWS) {
                pongGame.roomWS.requestState();
                setupKeyboardControls(pongGame.roomWS, playerId);
            }
        },
        
        onDisconnect: () => {
            console.log('Disconnected from 4-player game room');
        },
        
        onGameState: (state) => {
            if (!pongGame) return; 
            pongGame.currentGameState = state;
            syncGameStateFromRoom(state);
        },
        
        onPlayerMove: (movedPlayerId, position) => {
            console.log(`Remote player ${movedPlayerId} moved to ${position}`);
            updateRemotePlayerPosition(movedPlayerId, position);
        },
        
        onScore: (scores) => {
            console.log('Score update from room:', scores);
            updateScoreDisplay(scores);
        },
        
        onGameEnd: async (data: any) => {
            console.log('4-player game ended in room, winner:', data);
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

// Setup keyboard controls for room-based game
function setupKeyboardControls(ws: RoomWebSocketManager, playerId: string): void {
    // Clean up any existing handlers first!
    if (keyboardCleanup) {
        console.log('🧹 Cleaning up old keyboard handlers');
        keyboardCleanup();
    }

    const keys: { [key: string]: boolean } = {};
    const hasLocal = pongGame && pongGame.hasLocal;
    const gameMode = getCurrentGameMode();
    
    // DEBUG: Check what's in the room
    const room = getCurrentRoom();
    const user = authService.getCurrentUser();
    
    // Verify this player is in the room
    if (room) {
        const playerInRoom = room.players.find((p: any) => p.id === playerId);
        if (!playerInRoom) {
            console.error('❌ Player NOT found in room!', {
                lookingFor: playerId,
                availablePlayers: room.players.map((p: any) => p.id)
            });
        } 
    }
    
    const movementKeys = new Set(['w','s','o','l','arrowup','arrowdown']);

    const handleKeyDown = (e: KeyboardEvent) => {
        const key = e.key.toLowerCase();
        const wasPressed = keys[key];
        keys[key] = true;
        
        if (!wasPressed && movementKeys.has(key)) {
            e.preventDefault();
            
            const isGuestKey = ['o', 'l'].includes(key);
            
            if (isGuestKey && hasLocal) {
                ws.sendKeyState(key, true, true);
            } else if (!isGuestKey) {
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

    keyboardCleanup = () => {
        document.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('keyup', handleKeyUp);
        console.log('✅ Keyboard handlers removed for', playerId);
        keyboardCleanup = null;
    };
}


// Sync game state from room WebSocket
function syncGameStateFromRoom(state: any): void {
    if (!pongGame || !pongGame.gameState) return;

    // Update ball position
    if (state.ballPosX !== undefined) {
        pongGame.gameState.ballPosX = state.ballPosX;
    }
    if (state.ballPosY !== undefined) {
        pongGame.gameState.ballPosY = state.ballPosY;
    }
    
    // Update all 4 players
    for (let i = 0; i < 4; i++) {
        if (state.players && state.players[i]) {
            if (state.players[i].pos !== undefined) {
                pongGame.gameState.players[i].pos = state.players[i].pos;
            }
            if (state.players[i].score !== undefined) {
                pongGame.gameState.players[i].score = state.players[i].score;
            }
        }
    }
}

// Update remote player position
async function updateRemotePlayerPosition(playerId: string, position: number): Promise<void> {
    if (!pongGame || !pongGame.gameState) return;
    
    const room = getCurrentRoom();
    if (!room) return;
    
    const user = await authService.getCurrentUser();
    const currentPlayerId = user?.id?.toString();
    
    // Don't update our own position
    if (playerId === currentPlayerId) return;
    
    const playerIndex = room.players.findIndex((p: any) => p.id === playerId);
    if (playerIndex !== -1) {
        pongGame.gameState.players[playerIndex].pos = position;
    }
}

// Update score display
function updateScoreDisplay(scores: any): void {
    const scoreP1 = document.getElementById('player1score');
    const scoreP2 = document.getElementById('player2score');
    const scoreP3 = document.getElementById('player3score');
    const scoreP4 = document.getElementById('player4score');

    if (scoreP1 && scores.scorePlayer1 !== undefined) {
        scoreP1.textContent = scores.scorePlayer1.toString();
    }
    if (scoreP2 && scores.scorePlayer2 !== undefined) {
        scoreP2.textContent = scores.scorePlayer2.toString();
    }
    if (scoreP3 && scores.scorePlayer3 !== undefined) {
        scoreP3.textContent = scores.scorePlayer3.toString();
    }
    if (scoreP4 && scores.scorePlayer4 !== undefined) {
        scoreP4.textContent = scores.scorePlayer4.toString();
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
import { setCurrentPage, getCurrentGameMode } from '../utils/globalState';
import { renderApp } from '../main';
import { authService } from '../utils/auth';
import { PongGame } from '../game/PongGame';
import { getLobbyPlayers,  getCurrentRoom } from '../utils/roomState';
import { initRoomWebSocket, RoomWebSocketManager } from '../utils/roomWebSocket';
import { setGameScreen, endGame,cleanupGame, setEffectiveRoom, showGameEndScreen } from '../utils/gameUtils'
import { presenceService } from '../utils/presenceService';
import { TournamentWebSocketManager } from '../utils/tournamentWebSocket';

export let pongGame: PongGame | null = null;
let keyboardCleanup: (() => void) | null = null;

export async function render2PlayerGame(pong?: PongGame): Promise<void> {
    const room = getCurrentRoom();

	if (!pong)
    	pongGame = new PongGame();
	else
		pongGame = pong;

    if (room)
        pongGame.hasLocal = room.players.some(p => p.id === 'local');

    const root = document.getElementById('app-root');
    if (!root) return;
    
    // Get players from lobby
    const lobbyPlayers = getLobbyPlayers();
    const players = [
        lobbyPlayers[0] || { name: 'Player 1', isAI: false },
        lobbyPlayers[1] || { name: 'Player 2', isAI: false },
    ];
    
    // Get authenticated user info for fallback
    const user = authService.getCurrentUser();

    await presenceService.setInGame();
    
    root.innerHTML = `
        <!-- Fixed Debug Panel - Top Left -->
        

        <div class="neon-grid" style="padding-top: 0;">
            <div class="grid-anim"></div>
            <div class="glass-card" style="max-width: 1200px; width: 100%;">

                <div style="text-align: center; position: relative; padding-top: 20px;">
                    <button id="backToLandingBtn" class="btn btn-neon danger" style="position: absolute; left: 0; top: 20px;">← Back to Home</button>
                    
                    <!-- Elegant Player & Score Display -->
                    <div style="display: flex; justify-content: center; align-items: center; gap: 40px; margin-top: 20px;">
                        <!-- Player 1 -->
                        <div style="flex: 1; max-width: 250px; text-align: right;">
                            <div id="player1Name" style="color: #0ff; font-size: 1.3rem; font-weight: 600; letter-spacing: 1px; text-shadow: 0 0 10px rgba(0, 255, 255, 0.6);">
                                ${players[0].username}
                            </div>
                        </div>
                        
                        <!-- Score Display -->
                        <div style="display: flex; align-items: center; gap: 20px;">
                            <span id="player1score" style="font-size: 4rem; font-weight: 700; color: #0ff; text-shadow: 0 0 20px rgba(0, 255, 255, 0.8), 0 0 40px rgba(0, 255, 255, 0.4); min-width: 70px; text-align: center;">0</span>
                            <span style="font-size: 2rem; color: rgba(255, 255, 255, 0.4); font-weight: 300;">:</span>
                            <span id="player2score" style="font-size: 4rem; font-weight: 700; color: #ff0; text-shadow: 0 0 20px rgba(255, 255, 0, 0.8), 0 0 40px rgba(255, 255, 0, 0.4); min-width: 70px; text-align: center;">0</span>
                        </div>
                        
                        <!-- Player 2 -->
                        <div style="flex: 1; max-width: 250px; text-align: left;">
                            <div id="player2Name" style="color: #ff0; font-size: 1.3rem; font-weight: 600; letter-spacing: 1px; text-shadow: 0 0 10px rgba(255, 255, 0, 0.6);">
                                ${players[1].username}
                            </div>
                        </div>
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

            </div>
        </div>
    `;

    await setupGameButtons(pongGame);

    const backBtn = document.getElementById('backToLandingBtn');
    if (backBtn) {
        backBtn.addEventListener('click', async () => {
            if (keyboardCleanup) {
                keyboardCleanup();
            }
            
            if (pongGame) {
                if (pongGame) {
                    await pongGame.endGame();
                }
                cleanupGame(pongGame);
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

export async function setupGameButtons(pongGame: PongGame): Promise<void> {
    
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

    window.addEventListener('popstate', async () => {
        if (pongGame) {
            await pongGame.endGame();
        }
        cleanupGame(pongGame);
    });

    window.addEventListener('beforeunload', async (event) => {
        if (pongGame) {
            await pongGame.endGame();
        }
        cleanupGame(pongGame);
    });

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
// Initialize room-based multiplayer game
async function initRoomBasedGame(room: any): Promise<void> {
    if (!pongGame) {
        console.error('No pongGame instance');
        return;
    }
    
    const user = await authService.getCurrentUser();
    
    if (!user) {
        console.error('No authenticated user for room game');
        return;
    }

    const playerId = user?.id?.toString() || room.players[0].id.toString() || `guest-${Date.now()}`;

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
        
        onGameEnd: async (data: any) => {
            console.log('2-player game ended in room, winner:', data);
            const winner = room.players.find((p: any) => p.id === data.winnerId);
            const winnerName = winner ? winner.username : `Player ${data.winnerId}`;
            const winnerId = winner ? winner.id : data.winnerId;
        
            // Set status back to online when game ends
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
export function setupKeyboardControls(ws: any, playerId: string, pongInstance?: PongGame): void {
    if (keyboardCleanup) {
        console.log('🧹 Cleaning up old keyboard handlers');
        keyboardCleanup();
    }

    const keys: { [key: string]: boolean } = {};
    // Use provided pong instance (for tournaments) or fall back to global pongGame
    const activePong = pongInstance || pongGame;
    const hasLocal = activePong && activePong.hasLocal;
    const gameMode = getCurrentGameMode();
    
    const room = getCurrentRoom();
    
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
export function syncGameStateFromRoom(state: any): void {
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
async function updateRemotePlayerPosition(playerId: string, position: number): Promise<void> {
    if (!pongGame || !pongGame.gameState) return;
    
    const room = getCurrentRoom();

    if (!room) 
        return;
    
    const user = await authService.getCurrentUser();
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
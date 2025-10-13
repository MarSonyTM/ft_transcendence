import { setCurrentPage, getCurrentUser, getCurrentGameMode } from '../utils/globalState';
import { renderApp } from '../main';
import { authService } from '../utils/auth';
import { PongGame } from '../game/PongGame';
import { getLobbyPlayers, Player, getCurrentRoom } from '../utils/roomState';
import { initRoomWebSocket, disconnectRoomWebSocket, RoomWebSocketManager } from '../utils/roomWebSocket';
import { setGameScreen, endGame, cleanupGame, showPlayerDisconnectedMessage, updateConnectionStatus, setEffectiveRoom } from '../utils/gameUtils'

export let pongGame: PongGame | null = null;

export async function render4PlayerGame(): Promise<void> {
    const gameMode = getCurrentGameMode();
    const room = getCurrentRoom();

    pongGame = new PongGame();
    pongGame.isRoomBasedGame = room !== null;
    
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
    
    // Count remote players
    const remotePlayerCount = pongGame.isRoomBasedGame ? players.filter(p => !p.isAI).length - 1 : 0;
    
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
            ${pongGame.isRoomBasedGame ? `<div>Mode: <span style="color: #34d399;">Remote Multiplayer (${remotePlayerCount} remote players)</span></div>` : ''}
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
                <p style="color: #60a5fa; font-weight: bold;">${players[0].username} (Left): W / S</p>
                <p style="color: #ffaa00; font-style: italic; text-align: center; margin-top: 10px;">Last player to touch ball gets point when opponent misses!</p>
            </div>
        </div>
        <button id="backToLandingBtn" class="btn btn-back">Back to Lobby</button>
        <hr>
        <div id="tournamentRoot" class="t-section"></div>
    `;
    
    await setupGameButtons(pongGame);

    const backBtn = document.getElementById('backToLandingBtn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            if (pongGame)
                cleanupGame(pongGame);
            history.pushState({ page: 'lobby' }, '', '/lobby');
            setCurrentPage('lobby');
            renderApp();
        });
    }
    
    if (pongGame.isRoomBasedGame && room) {
        await initRoomBasedGame(room);
    }
}

async function setupGameButtons(pongGame: PongGame): Promise<void> {   
    
    if (pongGame.isRoomBasedGame) {
        let effectiveRoom = await setEffectiveRoom();
        
        if (!effectiveRoom || !effectiveRoom.gameId) {
            console.error('❌ No shared gameId available yet; not creating a standalone game.');
            return;
        }

        console.log('Room-based 4-player game detected! Using shared gameId:', effectiveRoom.gameId);
        
        pongGame.gameId = effectiveRoom.gameId;
        const localUser = authService.getCurrentUser();
        if (localUser && effectiveRoom.players) {
            const idx = effectiveRoom.players.findIndex((p: any) => p.id?.toString() === localUser.id?.toString());
            // Set view rotation based on player index for 4-player
            // Each player sees themselves on the left (position 3)
            if (idx === 0) {
                // Player 0 (top) rotates 90° CW to be on left
                pongGame.viewIndexMap = [3, 0, 1, 2];
            } else if (idx === 1) {
                // Player 1 (right) rotates 180° to be on left
                pongGame.viewIndexMap = [2, 3, 0, 1];
            } else if (idx === 2) {
                // Player 2 (bottom) rotates 270° CW to be on left
                pongGame.viewIndexMap = [1, 2, 3, 0];
            } else {
                // Player 3 (left) - no rotation needed
                pongGame.viewIndexMap = [0, 1, 2, 3];
            }
            console.log(`Player ${idx} view rotation:`, pongGame.viewIndexMap);
        }
        
        setGameScreen(pongGame);
        
    } else {
        console.log('Local game - creating new game instance');
        await pongGame.init();
    }
    
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
            } else
                return;
            if (pongGame.isRoomBasedGame) {
                cleanupGame(pongGame);
            }
        });
    }

    if (reconnectBtn) {
        reconnectBtn.addEventListener('click', async () => {
            if (pongGame) {
                await pongGame.reconnectWebSocket();
            } else 
                return;
            if (pongGame.isRoomBasedGame && pongGame.roomWS) {
                try {
                    await pongGame.roomWS.connect();
                } catch (error) {
                    console.error('Failed to reconnect room WebSocket:', error);
                }
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

// Initialize room-based multiplayer game
async function initRoomBasedGame(room: any): Promise<void> {
    if (!pongGame) {  // ← Already there, good!
        return;
    }
    
    const user = authService.getCurrentUser();
    
    if (!user) {
        console.error('No authenticated user for room game');
        return;
    }

    const playerId = user.id?.toString() || `guest-${Date.now()}`;
    const gameMode = getCurrentGameMode();

    console.log('Initializing room-based 4-player game:', {
        roomId: room.roomId,
        playerId,
        gameId: room.gameId,
        gameMode
    });

    if (pongGame && room.gameId) {
        pongGame.gameId = room.gameId;
        console.log(`✅ Using shared game ID from room: ${room.gameId}`);
        
        const idx = room.players.findIndex((p: any) => p.id?.toString() === playerId?.toString());
        
        // Set view rotation based on game mode and player index
        if (idx === 0) {
            pongGame.viewIndexMap = [3, 0, 1, 2];
        } else if (idx === 1) {
            pongGame.viewIndexMap = [2, 3, 0, 1];
        } else if (idx === 2) {
            pongGame.viewIndexMap = [1, 2, 3, 0];
        } else {
            pongGame.viewIndexMap = [0, 1, 2, 3];
        }
    }

    // Initialize WebSocket connection to room
    pongGame.roomWS = initRoomWebSocket({
        roomId: room.roomId,
        playerId,
        
        onConnect: () => {
            console.log('✅ Connected to 4-player game room');
            updateConnectionStatus('Connected (Room)', true);
            
            if (pongGame?.roomWS) {  // ← Add optional chaining
                pongGame.roomWS.requestState();
            }
            if (pongGame?.roomWS) {  // ← Add null check
                setupRoomKeyboardControls(pongGame.roomWS, playerId);
            }
        },
        
        onDisconnect: () => {
            console.log('Disconnected from 4-player game room');
            updateConnectionStatus('Disconnected', false);
        },
        
        onGameState: (state) => {
            if (!pongGame) return;  // ← Add null check
            pongGame.currentGameState = state;
            syncGameStateFromRoom(state);
        },
        
        onPlayerMove: (movedPlayerId, position) => {
            console.log(`Remote player ${movedPlayerId} moved to ${position}`);
            if (pongGame?.currentGameState) {  // ← Add optional chaining
                updateRemotePlayerPosition(movedPlayerId, position);
            }
        },
        
        onScore: (scores) => {
            console.log('Score update from room:', scores);
            updateScoreDisplay(scores);
        },
        
        onGameEnd: (winnerId) => {
            console.log('4-player game ended in room, winner:', winnerId);
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

// Setup keyboard controls for room-based game
function setupRoomKeyboardControls(ws: RoomWebSocketManager, playerId: string): void {
    const keys: { [key: string]: boolean } = {};
    
    const gameMode = getCurrentGameMode();
    const room = getCurrentRoom();
    const playerIndex = room?.players.findIndex((p: any) => p.id === playerId) ?? 0;
    const maxEnginePosition = 350;
    
    let lastPosition = 50;
    if (pongGame && pongGame.gameState) {
        if (playerIndex === 0 && typeof pongGame.gameState.player1Pos === 'number') {
            lastPosition = Math.max(0, Math.min(100, (pongGame.gameState.player1Pos / maxEnginePosition) * 100));
        } else if (playerIndex === 1 && typeof pongGame.gameState.player2Pos === 'number') {
            lastPosition = Math.max(0, Math.min(100, (pongGame.gameState.player2Pos / maxEnginePosition) * 100));
        } else if (playerIndex === 2 && typeof pongGame.gameState.player3Pos === 'number') {
            lastPosition = Math.max(0, Math.min(100, (pongGame.gameState.player3Pos / maxEnginePosition) * 100));
        } else if (playerIndex === 3 && typeof pongGame.gameState.player4Pos === 'number') {
            lastPosition = Math.max(0, Math.min(100, (pongGame.gameState.player4Pos / maxEnginePosition) * 100));
        }
    }
    
    let lastSentTime = 0;
    const throttleMs = 16;

    document.addEventListener('keydown', (e) => {
        keys[e.key.toLowerCase()] = true;
        if (['arrowup','arrowdown'].includes(e.key.toLowerCase())) e.preventDefault();
    });

    document.addEventListener('keyup', (e) => {
        keys[e.key.toLowerCase()] = false;
    });

    // Update and send position
    setInterval(() => {
        if (!ws.isConnected()) return;

        const now = Date.now();
        if (now - lastSentTime < throttleMs) return;

        let moved = false;
        let newPosition = lastPosition;
        const paddleSpeed = 5;
        
        if (keys['w'] || keys['arrowup']) {
            newPosition = Math.max(0, newPosition - paddleSpeed);
            moved = true;
        }
        if (keys['s'] || keys['arrowdown']) {
            newPosition = Math.min(100, newPosition + paddleSpeed);
            moved = true;
        }

        if (moved && newPosition !== lastPosition) {
            const enginePos = Math.round((newPosition / 100) * maxEnginePosition);
            ws.sendMove(enginePos);

            if (pongGame && pongGame.gameState) {
                if (playerIndex === 0) {
                    pongGame.gameState.player1Pos = enginePos;
                } else if (playerIndex === 1) {
                    pongGame.gameState.player2Pos = enginePos;
                } else if (playerIndex === 2) {
                    pongGame.gameState.player3Pos = enginePos;
                } else if (playerIndex === 3) {
                    pongGame.gameState.player4Pos = enginePos;
                }
            }
            lastPosition = newPosition;
            lastSentTime = now;
        }
    }, 16);
}

// Sync game state from room WebSocket
function syncGameStateFromRoom(state: any): void {
    if (!pongGame || !pongGame.gameState) return;

    if (state.ballPosX !== undefined) pongGame.gameState.ballPosX = state.ballPosX;
    if (state.ballPosY !== undefined) pongGame.gameState.ballPosY = state.ballPosY;
    if (state.player1Pos !== undefined) pongGame.gameState.player1Pos = state.player1Pos;
    if (state.player2Pos !== undefined) pongGame.gameState.player2Pos = state.player2Pos;
    if (state.player3Pos !== undefined) pongGame.gameState.player3Pos = state.player3Pos;
    if (state.player4Pos !== undefined) pongGame.gameState.player4Pos = state.player4Pos;
    if (state.scorePlayer1 !== undefined) pongGame.gameState.scorePlayer1 = state.scorePlayer1;
    if (state.scorePlayer2 !== undefined) pongGame.gameState.scorePlayer2 = state.scorePlayer2;
    if (state.scorePlayer3 !== undefined) pongGame.gameState.scorePlayer3 = state.scorePlayer3;
    if (state.scorePlayer4 !== undefined) pongGame.gameState.scorePlayer4 = state.scorePlayer4;
}

// Update remote player position
function updateRemotePlayerPosition(playerId: string, position: number): void {
    if (!pongGame || !pongGame.gameState) return;
    
    const room = getCurrentRoom();
    if (!room) return;
    
    const playerIndex = room.players.findIndex((p: any) => p.id === playerId);
    
    if (playerIndex === 0) {
        pongGame.gameState.player1Pos = position;
    } else if (playerIndex === 1) {
        pongGame.gameState.player2Pos = position;
    } else if (playerIndex === 2) {
        pongGame.gameState.player3Pos = position;
    } else if (playerIndex === 3) {
        pongGame.gameState.player4Pos = position;
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
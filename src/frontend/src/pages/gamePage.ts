import { setCurrentPage, getCurrentUser, getCurrentGameMode } from '../utils/globalState';
import { renderApp } from '../main';
import { authService } from '../utils/auth';
import { PongGame } from '../game/PongGame';
import { getLobbyPlayers, Player, getCurrentRoom } from '../utils/roomState';
import { initRoomWebSocket, disconnectRoomWebSocket, RoomWebSocketManager } from '../utils/roomWebSocket';

let roomWS: RoomWebSocketManager | null = null;
let currentGameState: any = null;
let isRoomBasedGame = false;

export let pongGame: PongGame | null = null;

export async function renderGamePage(): Promise<void> {
    const gameMode = getCurrentGameMode();
    const room = getCurrentRoom();
    
    // Check if this is a room-based game (remote players)
    isRoomBasedGame = room !== null;
    
    if (gameMode === '4player') {
        await renderFourPlayerGame();
    } else {
        await renderTwoPlayerGame();
    }
    
    // Initialize room-based multiplayer if room exists
    if (isRoomBasedGame && room) {
        await initRoomBasedGame(room);
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
            ${isRoomBasedGame ? '<div>Mode: <span style="color: #34d399;">Remote Multiplayer</span></div>' : ''}
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
            <p>${player1.username} - Up/Down W/S</p>
            ${!isRoomBasedGame && !player2.isAI ? '<p>Player 2 - Up/Down O/L</p>' : ''}
            ${isRoomBasedGame ? '<p style="color: #34d399;">🌐 Playing online with remote player</p>' : ''}
        </div>
        <button id="backToLandingBtn" class="btn btn-back">Back to Lobby</button>
        <hr>
        <div id="tournamentRoot" class="t-section"></div>
    `;
    
    await setupGameButtons();

    const backBtn = document.getElementById('backToLandingBtn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            cleanupGame();
            history.pushState({ page: 'lobby' }, '', '/lobby');
            setCurrentPage('lobby');
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
    
    // Count remote players
    const remotePlayerCount = isRoomBasedGame ? players.filter(p => !p.isAI).length - 1 : 0;
    
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
            ${isRoomBasedGame ? `<div>Mode: <span style="color: #34d399;">Remote Multiplayer (${remotePlayerCount} remote players)</span></div>` : ''}
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
                ${isRoomBasedGame ? 
                    '<p style="color: #34d399; font-weight: bold; text-align: center;">🌐 You control one paddle, other players control theirs remotely!</p>' 
                    : 
                    `<p style="color: #60a5fa; font-weight: bold;">${players[0].username} (Top): A / D</p>
                    <p style="color: #f87171; font-weight: bold;">${players[1].username} (Right): Up / Down Arrow</p>
                    <p style="color: #facc15; font-weight: bold;">${players[2].username} (Bottom): J / L</p>
                    <p style="color: #1be71b; font-weight: bold;">${players[3].username} (Left): W / S</p>`
                }
                <p style="color: #ffaa00; font-style: italic; text-align: center; margin-top: 10px;">Last player to touch ball gets point when opponent misses!</p>
            </div>
        </div>
        <button id="backToLandingBtn" class="btn btn-back">Back to Lobby</button>
        <hr>
        <div id="tournamentRoot" class="t-section"></div>
    `;
    
    await setupGameButtons();

    const backBtn = document.getElementById('backToLandingBtn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            cleanupGame();
            history.pushState({ page: 'lobby' }, '', '/lobby');
            setCurrentPage('lobby');
            renderApp();
        });
    }
}

async function setupGameButtons(): Promise<void> {
    const room = getCurrentRoom();
    
    console.log('🔍 Setup game - isRoomBasedGame:', isRoomBasedGame);
    console.log('🔍 Room:', room);
    console.log('🔍 Room gameId:', room?.gameId);
    
    pongGame = new PongGame();
    
    // For room-based games, ALWAYS connect to the shared game and NEVER create a new one locally
    if (isRoomBasedGame) {
        // Ensure we have a gameId; if missing, fetch latest room data and wait briefly
        let effectiveRoom = room;
        if (!effectiveRoom || !effectiveRoom.gameId) {
            console.warn('⚠️ Room-based game but missing gameId. Fetching room state before connecting...');
            const roomId = effectiveRoom?.roomId || (history.state && history.state.roomId);
            if (roomId) {
                try {
                    // Try up to ~1s to obtain the gameId (helps with websocket/HTTP race)
                    const deadline = Date.now() + 1000;
                    while (Date.now() < deadline && (!effectiveRoom || !effectiveRoom.gameId)) {
                        const resp = await fetch(`/api/room/${roomId}`);
                        const data = await resp.json();
                        if (data?.success && data?.room) {
                            effectiveRoom = data.room;
                        }
                        if (!effectiveRoom?.gameId) {
                            await new Promise(r => setTimeout(r, 100));
                        }
                    }
                } catch (e) {
                    console.error('Failed to fetch updated room:', e);
                }
            }
        }

        if (!effectiveRoom || !effectiveRoom.gameId) {
            console.error('❌ No shared gameId available yet; not creating a standalone game.');
            // Gracefully abort button setup here; lobby WS should navigate once gameId arrives
            return;
        }

        console.log('🎮 Room-based game detected! Using shared gameId:', effectiveRoom.gameId);
        
        // Set the shared gameId BEFORE any initialization
        pongGame.gameId = effectiveRoom.gameId;
        // Configure view mapping so each client can see themselves on the left in 1v1
        const localUser = authService.getCurrentUser();
        if (localUser && effectiveRoom.players) {
            const idx = effectiveRoom.players.findIndex((p: any) => p.id?.toString() === localUser.id?.toString());
            // If this client is the second player (right side on server), swap left/right for display
            if (idx === 1) pongGame.viewIndexMap = [1, 0, 2, 3];
        }
        
        // Manually initialize canvas without creating a new game
        pongGame.canvas = document.getElementById('gameScreen') as HTMLCanvasElement;
        if (!pongGame.canvas) {
            console.error('❌ Canvas not found!');
            return;
        }
        pongGame.ctx = pongGame.canvas.getContext('2d');
        
        try {
            await pongGame.connectWebSocket();
            console.log('✅ Connected to shared game WebSocket');
            pongGame.updateStatus("Connected - Click Start to begin");
            if (pongGame.startRenderLoop) pongGame.startRenderLoop();
        } catch (error) {
            console.error('❌ Failed to connect to game WebSocket:', error);
        }
    } else {
        console.log('🎮 Local game - creating new game instance');
        await pongGame.init();
    }
    
    pongGame.onGameEnd = async (winnerId: number) => {
        console.log(`Game ended, winner is Player ${winnerId}`);
        
        // Notify room if this is a room-based game
        if (isRoomBasedGame && roomWS) {
            const room = getCurrentRoom();
            if (room) {
                const winner = room.players[winnerId - 1];
                if (winner) {
                    showGameEndScreen(winner.id, winner.username);
                }
            }
        }
        
        if (!pongGame || !pongGame.gameId) {
            console.error('No game ID available to update winner');
            return;
        }
        
        try {
            const apiEndpoint = window.__INITIAL_STATE__?.apiEndpoint || '';
            // Persist winner to the game
            const response = await fetch(`${apiEndpoint}/api/game/${pongGame.gameId}/winner`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ winnerId })
            });
            const data = await response.json();
            if (!data.success) {
                console.error('Failed to update winner:', data.message);
            }

            // Also update the logged-in user's profile stats if available
            const user = authService.getCurrentUser();
            if (user && user.id) {
                // Determine if the current user actually won
                let didWin = false;
                const room = getCurrentRoom();
                if (isRoomBasedGame && room && Array.isArray(room.players)) {
                    const winnerPlayer = room.players[winnerId - 1];
                    didWin = !!winnerPlayer && (winnerPlayer.id?.toString() === user.id?.toString());
                } else {
                    // Fallback for local/non-room 2P
                    didWin = (winnerId === 1);
                }
                try {
                    await fetch(`${apiEndpoint}/api/users/stats`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', ...(authService.getAuthHeader?.() || {}) },
                        body: JSON.stringify({ won: didWin })
                    });
                } catch (e) {
                    console.warn('Unable to update user stats:', e);
                }
            }
        } catch (error) {
            console.error('Error updating winner or stats:', error);
        }
    };

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
            if (isRoomBasedGame) {
                cleanupGame();
            }
        });
    }

    if (reconnectBtn) {
        reconnectBtn.addEventListener('click', async () => {
            if (pongGame) {
                await pongGame.reconnectWebSocket();
            }
            if (isRoomBasedGame && roomWS) {
                try {
                    await roomWS.connect();
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
    const user = authService.getCurrentUser();
    
    if (!user) {
        console.error('No authenticated user for room game');
        return;
    }

    const playerId = user.id?.toString() || `guest-${Date.now()}`;

    console.log('🎮 Initializing room-based game:', {
        roomId: room.roomId,
        playerId,
        gameId: room.gameId  // THIS is the shared game ID
    });

    // CRITICAL: Set the shared game ID BEFORE initializing the game
    if (pongGame && room.gameId) {
        pongGame.gameId = room.gameId;  // Use the room's game ID
        console.log(`✅ Using shared game ID from room: ${room.gameId}`);
        // Also set view mapping according to local player's index
        const idx = room.players.findIndex((p: any) => p.id?.toString() === playerId?.toString());
        if (idx === 1) {
            pongGame.viewIndexMap = [1, 0, 2, 3];
        } else {
            pongGame.viewIndexMap = [0, 1, 2, 3];
        }
    }

    // Initialize WebSocket connection to room
    roomWS = initRoomWebSocket({
        roomId: room.roomId,
        playerId,
        
        onConnect: () => {
            console.log('✅ Connected to game room');
            updateConnectionStatus('Connected (Room)', true);
            
            // Request initial game state
            if (roomWS) {
                roomWS.requestState();
            }

            // Hook up keyboard controls to send moves to the room WS
            setupRoomKeyboardControls(roomWS!, playerId);
        },
        
        onDisconnect: () => {
            console.log('🔌 Disconnected from game room');
            updateConnectionStatus('Disconnected', false);
        },
        
        onGameState: (state) => {
            // Update game state from server
            currentGameState = state;
            if (pongGame) {
                syncGameStateFromRoom(state);
            }
        },
        
        onPlayerMove: (movedPlayerId, position) => {
            console.log(`Remote player ${movedPlayerId} moved to ${position}`);
            if (pongGame && currentGameState) {
                updateRemotePlayerPosition(movedPlayerId, position);
            }
        },
        
        onScore: (scores) => {
            console.log('Score update from room:', scores);
            updateScoreDisplay(scores);
        },
        
        onGameEnd: (winnerId) => {
            console.log('Game ended in room, winner:', winnerId);
            const winner = room.players.find((p: any) => p.id === winnerId);
            if (winner) {
                alert(`Game Over! ${winner.username} wins!`);
            }
        }
    });
}

// Setup keyboard controls for room-based game
function setupRoomKeyboardControls(ws: RoomWebSocketManager, playerId: string): void {
    const keys: { [key: string]: boolean } = {};
    // Start from current paddle position if available (normalize to 0..100)
    let lastPosition = 50;
    if (pongGame && pongGame.gameState) {
        const room = getCurrentRoom();
        const idx = room?.players.findIndex((p: any) => p.id === playerId) ?? 0;
        if (idx === 0 && typeof pongGame.gameState.player1Pos === 'number') {
            lastPosition = Math.max(0, Math.min(100, (pongGame.gameState.player1Pos / 160) * 100));
        } else if (idx === 1 && typeof pongGame.gameState.player2Pos === 'number') {
            lastPosition = Math.max(0, Math.min(100, (pongGame.gameState.player2Pos / 160) * 100));
        }
    }
    let lastSentTime = 0;
    const throttleMs = 50; // Send updates every 50ms max

    document.addEventListener('keydown', (e) => {
        keys[e.key.toLowerCase()] = true;
        // Prevent page scroll on arrow keys
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

        // Get current player's controls based on their position in room
        const room = getCurrentRoom();
        if (!room) return;

        const playerIndex = room.players.findIndex((p: any) => p.id === playerId);
        
        // Player-specific controls (both players can use W/S or Arrow keys; uniqueness comes from socket playerId)
        if (keys['w'] || keys['arrowup']) {
            newPosition = Math.max(0, newPosition - 2);
            moved = true;
        }
        if (keys['s'] || keys['arrowdown']) {
            newPosition = Math.min(100, newPosition + 2);
            moved = true;
        }
        // Add more player controls as needed for 4-player

        if (moved && newPosition !== lastPosition) {
            // Scale to engine space for 1v1: 0..100% -> 0..160px
            const enginePos = Math.round((newPosition / 100) * 160);
            console.log(`[INPUT] Sending move for playerIndex=${playerIndex} pos=${enginePos}`);
            ws.sendMove(enginePos);

            // Optimistic local update for immediate visual feedback
            if (pongGame && pongGame.gameState) {
                if (playerIndex === 0) {
                    pongGame.gameState.player1Pos = enginePos;
                } else if (playerIndex === 1) {
                    pongGame.gameState.player2Pos = enginePos;
                }
            }
            lastPosition = newPosition;
            lastSentTime = now;
        }
    }, 16); // ~60 FPS
}

// Sync game state from room WebSocket
function syncGameStateFromRoom(state: any): void {
    if (!pongGame || !pongGame.gameState) return;

    // Update local game state with server state
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

// Update connection status
function updateConnectionStatus(status: string, isConnected: boolean): void {
    const wsStatus = document.getElementById('wsStatus');
    if (wsStatus) {
        wsStatus.textContent = status;
        wsStatus.style.color = isConnected ? '#34d399' : '#ef4444';
    }
}

// Show game end screen
function showGameEndScreen(winnerId: string, winnerName: string): void {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.9);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
    `;

    overlay.innerHTML = `
        <div style="background: rgb(55 65 81); padding: 3em; border-radius: 12px; text-align: center; max-width: 500px;">
            <div style="font-size: 4em; margin-bottom: 0.2em;">🏆</div>
            <h2 style="color: rgb(52 211 153); font-size: 2.5em; margin: 0 0 0.3em 0;">Game Over!</h2>
            <p style="color: rgb(209 213 219); font-size: 1.8em; margin-bottom: 1.5em; font-weight: bold;">
                ${winnerName} wins!
            </p>
            <div style="display: flex; gap: 1em; justify-content: center;">
                <button id="backToLobbyBtn" style="background: rgb(99 102 241); color: white; border: none; padding: 1em 2em; border-radius: 8px; font-size: 1.1em; cursor: pointer; font-weight: 600; transition: background 0.2s;">
                    Back to Lobby
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById('backToLobbyBtn')?.addEventListener('click', () => {
        overlay.remove();
        cleanupGame();
        history.pushState({ page: 'lobby' }, '', '/lobby');
        window.location.reload();
    });
}

// Show player disconnected notification
function showPlayerDisconnectedMessage(playerName: string): void {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgb(220 38 38);
        color: white;
        padding: 1em 1.5em;
        border-radius: 8px;
        z-index: 999;
        font-weight: 600;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
        animation: slideIn 0.3s ease-out;
    `;
    notification.innerHTML = `⚠️ ${playerName} disconnected`;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => notification.remove(), 300);
    }, 4000);
}

// Cleanup function
export function cleanupGame(): void {
    if (roomWS) {
        disconnectRoomWebSocket();
        roomWS = null;
    }
    currentGameState = null;
    isRoomBasedGame = false;
    
    if (pongGame) {
        // Your existing cleanup
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
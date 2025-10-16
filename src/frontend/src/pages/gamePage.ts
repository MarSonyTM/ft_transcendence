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
    
    isRoomBasedGame = room !== null;
    
    if (gameMode === '4player') {
        await renderFourPlayerGame();
    } else {
        await renderTwoPlayerGame();
    }
    
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
    const hasLocalPlayer2 = lobbyPlayers.some(p => p.isLocal);
    
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
            <p>${player1.username} - W (up) / S (down)</p>
            ${hasLocalPlayer2 ? '<p>Local Player 2 - O (up) / L (down)</p>' : ''}
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
    
    if (isRoomBasedGame) {
        let effectiveRoom = room;
        if (!effectiveRoom || !effectiveRoom.gameId) {
            console.warn('⚠️ Room-based game but missing gameId. Fetching room state before connecting...');
            const roomId = effectiveRoom?.roomId || (history.state && history.state.roomId);
            if (roomId) {
                try {
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
            return;
        }

        console.log('Room-based game detected! Using shared gameId:', effectiveRoom.gameId);
        
        pongGame.gameId = effectiveRoom.gameId;
        const localUser = authService.getCurrentUser();
        if (localUser && effectiveRoom.players) {
            const idx = effectiveRoom.players.findIndex((p: any) => p.id?.toString() === localUser.id?.toString());
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
        console.log('Local game - creating new game instance');
        await pongGame.init();
    }
    
    pongGame.onGameEnd = async (winnerId: number) => {
        console.log(`Game ended, winner is Player ${winnerId}`);
        
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
            const response = await fetch(`${apiEndpoint}/api/game/${pongGame.gameId}/winner`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ winnerId })
            });
            const data = await response.json();
            if (!data.success) {
                console.error('Failed to update winner:', data.message);
            }

            const user = authService.getCurrentUser();
            if (user && user.id) {
                let didWin = false;
                const room = getCurrentRoom();
                if (isRoomBasedGame && room && Array.isArray(room.players)) {
                    const winnerPlayer = room.players[winnerId - 1];
                    didWin = !!winnerPlayer && (winnerPlayer.id?.toString() === user.id?.toString());
                } else {
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

    console.log('Initializing room-based game:', {
        roomId: room.roomId,
        playerId,
        gameId: room.gameId
    });

    if (pongGame && room.gameId) {
        pongGame.gameId = room.gameId;
        console.log(`✅ Using shared game ID from room: ${room.gameId}`);
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
            
            if (roomWS) {
                roomWS.requestState();
            }
            setupRoomKeyboardControls(roomWS!, playerId);
        },
        
        onDisconnect: () => {
            console.log('🔌 Disconnected from game room');
            updateConnectionStatus('Disconnected', false);
        },
        
        onGameState: (state) => {
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

    try {
        await roomWS.connect();
    } catch (e) {
        console.error('❌ Failed to connect room WebSocket:', e);
    }
}

// Setup keyboard controls for room-based game
function setupRoomKeyboardControls(ws: RoomWebSocketManager, playerId: string): void {
    const keys: { [key: string]: boolean } = {};
    
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
    const throttleMs = 16;
    let logThrottle = 0; // Throttle console logs

    const handleKeyDown = (e: KeyboardEvent) => {
        const key = e.key.toLowerCase();
        keys[key] = true;
        if (['arrowup','arrowdown','w','s','o','l'].includes(key)) {
            e.preventDefault();
            // Log only once per second
            if (Date.now() - logThrottle > 1000) {
                console.log('🎮 Key down:', key);
                logThrottle = Date.now();
            }
        }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
        keys[e.key.toLowerCase()] = false;
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    let lastPosition2 = 50; // For local player 2
    let lastSentTime2 = 0;

    // Update and send position
    setInterval(() => {
        if (!ws.isConnected()) return;

        const now = Date.now();
        
        let moved = false;
        let moved2 = false;
        let newPosition = lastPosition;
        let newPosition2 = lastPosition2;

        const room = getCurrentRoom();
        if (!room) return;

        const playerIndex = room.players.findIndex((p: any) => p.id === playerId);
        
        // Get local player 2 fresh each time (in case they joined after game started)
        const currentLocalPlayer2 = room.players.find((p: any) => p.isLocal);
        const localPlayer2Index = currentLocalPlayer2 ? room.players.findIndex((p: any) => p.id === currentLocalPlayer2.id) : -1;
        
        const paddleSpeed = 5;
        
        // Player 1 controls (W/S) - for the connected player
        if (keys['w'] || keys['arrowup']) {
            newPosition = Math.max(0, newPosition - paddleSpeed);
            moved = true;
        }
        if (keys['s'] || keys['arrowdown']) {
            newPosition = Math.min(100, newPosition + paddleSpeed);
            moved = true;
        }

        // Local Player 2 controls (O/L keys) - ONLY if local player exists
        if (currentLocalPlayer2 && localPlayer2Index >= 0) {
            if (keys['o']) {
                newPosition2 = Math.max(0, newPosition2 - paddleSpeed);
                moved2 = true;
            }
            if (keys['l']) {
                newPosition2 = Math.min(100, newPosition2 + paddleSpeed);
                moved2 = true;
            }
        }

        // Send Player 1 moves
        if (moved && newPosition !== lastPosition && (now - lastSentTime >= throttleMs)) {
            const enginePos = Math.round((newPosition / 100) * 160);
            ws.sendMove(enginePos);

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

        // Send Local Player 2 moves
        if (moved2 && newPosition2 !== lastPosition2 && currentLocalPlayer2 && (now - lastSentTime2 >= throttleMs)) {
            const enginePos2 = Math.round((newPosition2 / 100) * 160);
            ws.sendMove(enginePos2, currentLocalPlayer2.id);

            if (pongGame && pongGame.gameState) {
                if (localPlayer2Index === 0) {
                    pongGame.gameState.player1Pos = enginePos2;
                } else if (localPlayer2Index === 1) {
                    pongGame.gameState.player2Pos = enginePos2;
                }
            }
            lastPosition2 = newPosition2;
            lastSentTime2 = now;
        }
    }, 16);
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
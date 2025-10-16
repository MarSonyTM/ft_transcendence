import { setCurrentPage, getCurrentUser, getCurrentGameMode } from '../utils/globalState';
import { renderApp } from '../main';
import { authService } from '../utils/auth';
import { PongGame } from '../game/PongGame';
import { toggleTournaments } from '../tournament';
import { getLobbyPlayers, getCurrentRoom } from '../utils/roomState';
import { initRoomWebSocket, disconnectRoomWebSocket, RoomWebSocketManager } from '../utils/roomWebSocket';

let roomWS: RoomWebSocketManager | null = null;
let currentGameState: any = null;
let isRoomBasedGame = false;

export let pongGame: PongGame | null = null;
let game3DInstance: any | null = null;

export async function renderGamePage(): Promise<void> {
    const gameMode = getCurrentGameMode();
    const room = getCurrentRoom();
    
    isRoomBasedGame = room !== null;
    
    if (gameMode === "2P") {
        await renderTwoPlayerGame();
    } else if (gameMode === "4P") {
        await renderFourPlayerGame();
    } else {
        console.log("Unrecognized game mode:", gameMode);
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
        <div class="threeD-wrapper">
            <canvas id="renderCanvas"></canvas>
        </div>
        <div class="controls-info">
            <p>${player1.username} - Up/Down W/S</p>
            ${!isRoomBasedGame && !player2.isAI ? '<p>Player 2 - Up/Down O/L</p>' : ''}
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
            <span style="font-size: 12px; opacity: 0.7;">Left:</span> <span id="player1score" class="player1-score" style="color: #ff4444; font-weight: bold;">0</span> 
            <span class="score-separator">|</span> 
            <span style="font-size: 12px; opacity: 0.7;">Top:</span> <span id="player2score" class="player2-score" style="color: #4488ff; font-weight: bold;">0</span>
            <span class="score-separator">|</span> 
            <span style="font-size: 12px; opacity: 0.7;">Right:</span> <span id="player3score" class="player3-score" style="color: #ffdd44; font-weight: bold;">0</span>
            <span class="score-separator">|</span> 
            <span style="font-size: 12px; opacity: 0.7;">Bottom:</span> <span id="player4score" class="player4-score" style="color: #44ff44; font-weight: bold;">0</span>
        </div>
        <div class="threeD-wrapper">
            <canvas id="renderCanvas"></canvas>
        </div>
        
        <div class="controls-info" style="background: rgba(0, 0, 0, 0.3); padding: 15px; border-radius: 5px; margin-top: 15px;">
            <div class="four-player-controls">
                ${isRoomBasedGame ? 
                    '<p style="color: #34d399; font-weight: bold; text-align: center;">🌐 You control one paddle, other players control theirs remotely!</p>' 
                    : 
                    `<p style="color: #ff4444; font-weight: bold;">${players[0].username} (Left): W / S</p>
                    <p style="color: #4488ff; font-weight: bold;">${players[1].username} (Top): A / D</p>
                    <p style="color: #ffdd44; font-weight: bold;">${players[2].username} (Right): Up / Down Arrow</p>
                    <p style="color: #44ff44; font-weight: bold;">${players[3].username} (Bottom): J / L</p>`
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
            // if (idx === 1) pongGame.viewIndexMap = [1, 0, 2, 3];// TODO: always on the left side version -> didnt work for me 
        }
        
        // Manually initialize canvas without creating a new game
        pongGame.canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
        if (!pongGame.canvas) {
            console.error('❌ Canvas not found!');
            return;
        }
        
        pongGame.canvas.style.width = '800px';
        pongGame.canvas.style.height = '500px';
        
        try {
            await pongGame.connectWebSocket();
            console.log('✅ Connected to shared game WebSocket');
            pongGame.updateStatus("Connected - Click Start to begin");
            pongGame.startRenderLoop();
            
            const { baby3D } = await import('../game/game3D');
            if (!game3DInstance)
                game3DInstance = new baby3D(pongGame);
            else
                game3DInstance.attachGame(pongGame);
            await game3DInstance.createScene();
        } catch (error) {
            console.error('❌ Failed to connect to game WebSocket:', error);
        }
    } else {
        console.log('Local game - creating new game instance');
        await pongGame.init();
        
        const { baby3D } = await import('../game/game3D');
        if (!game3DInstance)
            game3DInstance = new baby3D(pongGame);
        else
            game3DInstance.attachGame(pongGame);
        await game3DInstance.createScene();
        
        // Set canvas size for local game
        const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
        if (canvas) {
            canvas.style.width = '800px';
            canvas.style.height = '500px';
        }
    }
    
    pongGame.onGameEnd = async (winnerId: number) => {
        console.log(`Game ended, winner is Player ${winnerId}`);
        
        if (pongGame && pongGame.gameId) {
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
        }
        
        if (isRoomBasedGame) {
            const room = getCurrentRoom();
            if (room && room.players) {
                const winnerIndex = typeof winnerId === 'number' ? winnerId - 1 : parseInt(winnerId) - 1;
                const winner = room.players[winnerIndex];
                
                if (winner) {
                    showGameEndScreen(winner.id, winner.username);
                } else {
                    const positions = ['Left', 'Top', 'Right', 'Bottom'];
                    const positionName = positions[winnerIndex] || `Player ${winnerId}`;
                    showGameEndScreen('unknown', positionName);
                }
            }
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
                pongGame.reconnectWebSocket();
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
        tournamentsBtn.addEventListener('click', toggleTournaments);
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

    try {
        const response = await fetch(`/api/room/${room.roomId}`);
        if (!response.ok) {
            console.error(`❌ Room ${room.roomId} not found on backend`);
            alert('Room no longer exists. Please create a new room.');
            window.location.href = '/';
            return;
        }
        const roomData = await response.json();
        console.log('✅ Room verified on backend:', roomData);
    } catch (error) {
        console.error('❌ Failed to verify room:', error);
        alert('Failed to connect to game server. Please try again.');
        return;
    }

    if (pongGame && room.gameId) {
        pongGame.gameId = room.gameId;
        console.log(`✅ Using shared game ID from room: ${room.gameId}`);
        // const idx = room.players.findIndex((p: any) => p.id?.toString() === playerId?.toString());
        // if (idx === 1) {
        //     pongGame.viewIndexMap = [1, 0, 2, 3];
        // } else {
        //     pongGame.viewIndexMap = [0, 1, 2, 3];
        // }
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
        
        onGameEnd: (data) => {
            const room = getCurrentRoom();
            if (room && room.players && data.winnerId) {
                const winnerIndex = (typeof data.winnerId === 'number' ? data.winnerId : parseInt(data.winnerId)) - 1;
                const winner = room.players[winnerIndex];
                
                if (winner) {
                    alert(`Game Over! ${winner.username} wins!`);
                } else if (data.winnerName) {
                    alert(`Game Over! ${data.winnerName} wins!`);
                }
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
async function setupRoomKeyboardControls(ws: RoomWebSocketManager, playerId: string): Promise<void> {
    const keys: { [key: string]: boolean } = {};
    
    const room = getCurrentRoom();
    if (!room) return;
    
    const playerIndex = room.players.findIndex((p: any) => p.id === playerId);
    if (playerIndex === -1) return;
    
    let lastPosition = 160;
    if (pongGame && pongGame.gameState && pongGame.gameState.players[playerIndex]) {
        lastPosition = pongGame.gameState.players[playerIndex].pos || 160;
    }
    
    let lastSentTime = 0;
    const throttleMs = 16;

    document.addEventListener('keydown', (e) => {
        keys[e.key.toLowerCase()] = true;
        if (['w', 's', 'arrowup', 'arrowdown'].includes(e.key.toLowerCase())) e.preventDefault();
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
        
        const gameMode = getCurrentGameMode();
        const paddleSpeed = gameMode === '4P' ? 8 : 4;
        
        const maxPos = gameMode === '4P' ? 320 : 160;
        
        if (keys['w'] || keys['arrowup']) {
            newPosition = Math.max(0, newPosition - paddleSpeed);
            moved = true;
        }
        if (keys['s'] || keys['arrowdown']) {
            newPosition = Math.min(maxPos, newPosition + paddleSpeed);
            moved = true;
        }

        if (moved && newPosition !== lastPosition) {
            ws.sendMove(newPosition);

            if (pongGame && pongGame.gameState && pongGame.gameState.players[playerIndex]) {
                pongGame.gameState.players[playerIndex].pos = newPosition;
            }
            lastPosition = newPosition;
            lastSentTime = now;
        }
    }, 16);
}

// Sync game state from room WebSocket
async function syncGameStateFromRoom(state: any): Promise<void> {
    if (!pongGame || !pongGame.gameState) return;

    // Update local game state with server state
    if (state.ballPosX !== undefined) pongGame.gameState.ballPosX = state.ballPosX;
    if (state.ballPosY !== undefined) pongGame.gameState.ballPosY = state.ballPosY;
    if (Array.isArray(state.players)) {
        state.players.forEach((p: any, idx: number) => {
            if (pongGame && pongGame.gameState && pongGame.gameState.players[idx]) {
                if (p.pos !== undefined) pongGame.gameState.players[idx].pos = p.pos;
                if (p.score !== undefined) pongGame.gameState.players[idx].score = p.score;
            }
        });
    }
}

// Update remote player position
async function updateRemotePlayerPosition(playerId: string, position: number): Promise<void> {
    if (!pongGame || !pongGame.gameState) return;

    const room = getCurrentRoom();
    if (!room) return;

    const playerIndex = room.players.findIndex((p: any) => p.id === playerId);
    pongGame.gameState.players[playerIndex].pos = position;
}

// Update score display
async function updateScoreDisplay(scores: any): Promise<void> {
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
async function updateConnectionStatus(status: string, isConnected: boolean): Promise<void> {
    const wsStatus = document.getElementById('wsStatus');
    if (wsStatus) {
        wsStatus.textContent = status;
        wsStatus.style.color = isConnected ? '#34d399' : '#ef4444';
    }
}

// Show game end screen
async function showGameEndScreen(winnerId: string, winnerName: string): Promise<void> {
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
                <button id="backToLobbyBtn" class="btn btn-back" style="cursor: pointer; pointer-events: auto;">Back to Lobby</button>
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
async function showPlayerDisconnectedMessage(playerName: string): Promise<void> {
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
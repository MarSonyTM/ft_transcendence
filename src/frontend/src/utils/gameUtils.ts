import { PongGame } from "../game/PongGame";
import { GameRoom, getCurrentRoom } from "./roomState";
import { disconnectRoomWebSocket } from '../utils/roomWebSocket';
import { authService } from "./auth";

export async function setGameScreen(pongGame: PongGame) {
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
}

export function endGame(pongGame: PongGame) {
    pongGame.onGameEnd = async (winnerId: number) => {
        console.log(`Game ended, winner is Player ${winnerId}`);
        
        if (pongGame.roomWS) {
            const room = getCurrentRoom();
            if (room) {
                const winner = room.players[winnerId - 1];
                if (winner) {
                    showGameEndScreen(winner.id, winner.username, pongGame);
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
                if (room && Array.isArray(room.players)) {
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
}

function showGameEndScreen(winnerId: string, winnerName: string, pongGame: PongGame): void {
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
                <button id="backToHomeBtn" style="background: rgb(99 102 241); color: white; border: none; padding: 1em 2em; border-radius: 8px; font-size: 1.1em; cursor: pointer; font-weight: 600; transition: background 0.2s;">
                    Back to Home
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById('backToHomeBtn')?.addEventListener('click', () => {
        overlay.remove();
        cleanupGame(pongGame);
        history.pushState({ page: 'landing' }, '', '#landing');
        window.location.reload();
    });
}

// Cleanup function
export function cleanupGame(pongGame: PongGame): void {
    if (pongGame.roomWS) {
        disconnectRoomWebSocket();
        pongGame.roomWS = null;
    }
    pongGame.currentGameState = null;
    
    if (pongGame) {
        // Your existing cleanup
    }
}

// Show player disconnected notification
export function showPlayerDisconnectedMessage(playerName: string): void {
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

// Update connection status
export function updateConnectionStatus(status: string, isConnected: boolean): void {
    // const wsStatus = document.getElementById('wsStatus');
    // if (wsStatus) {
    //     wsStatus.textContent = status;
    //     wsStatus.style.color = isConnected ? '#34d399' : '#ef4444';
    // }
}

export async function setEffectiveRoom(): Promise<GameRoom | null> {
    let room = getCurrentRoom();

    if (room && room.gameId) {
        return room;
    }
    
    // Room exists but missing gameId - need to fetch it
    console.warn('⚠️ Room-based game but missing gameId. Fetching room state before connecting...');
    const roomId = room?.roomId || (history.state && history.state.roomId);
    
    if (!roomId) {
        console.error('❌ No roomId available to fetch');
        return room || null;
    }
    
    let effectiveRoom = room; // Initialize outside try block
    if (!effectiveRoom)
        return null;
    
    try {
        const deadline = Date.now() + 1000;
        
        while (Date.now() < deadline) {
            const resp = await fetch(`/api/room/${roomId}`);
            const data = await resp.json();
            
            if (data?.success && data?.room) {
                effectiveRoom = data.room;
                if (!effectiveRoom)
                    return null;
                // Exit early if we found a gameId
                if (effectiveRoom.gameId) {
                    console.log('✅ Found gameId:', effectiveRoom.gameId);
                    return effectiveRoom;
                }
            }
            
            // Wait before next attempt
            await new Promise(r => setTimeout(r, 100));
        }
        
        console.warn('⏱️ Timeout: gameId not found within deadline');
    } catch (e) {
        console.error('Failed to fetch updated room:', e);
    }
    
    // Return whatever we have, even if gameId is still missing
    return effectiveRoom || null;
}


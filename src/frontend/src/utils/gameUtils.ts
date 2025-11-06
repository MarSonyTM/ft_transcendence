import { PongGame } from "../game/PongGame";
import { GameRoom, getCurrentRoom } from "./roomState";
import { disconnectRoomWebSocket } from '../utils/roomWebSocket';
import { authService } from "./auth";
import { baby3D } from "../game/game3D";

export async function setGameScreen(pongGame: PongGame) {
    pongGame.canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
    if (!pongGame.canvas) {
        console.error('❌ Render canvas not found');
        return;
    }
    
    try {
        await pongGame.connectWebSocket();
        console.log('✅ Connected to shared game WebSocket');
        pongGame.updateStatus("Connected - Click Start to begin");
        if (pongGame.startRenderLoop) pongGame.startRenderLoop();

        try {
            const baby = new baby3D(pongGame);
            await baby.createScene();
        } catch (e) {
            console.error('❌ Failed to start 3D renderer:', e);
        }
    } catch (error) {
        console.error('❌ Failed to connect to game WebSocket:', error);
    }
}

export function endGame(pongGame: PongGame) {
    pongGame.onGameEnd = async (winnerId: number) => {
        console.log(`Game ended, winner is Player ${winnerId}`);
        
        // Show winner screen for all games (both room-based and regular)
        const room = getCurrentRoom();
        let winnerIdStr: string;
        let winnerNameStr: string;
        
        if (pongGame.roomWS && room) {
            // Room-based game
            const winner = room.players[winnerId - 1];
            if (winner) {
                winnerIdStr = winner.id;
                winnerNameStr = winner.username;
            } else {
                winnerIdStr = winnerId.toString();
                winnerNameStr = `Player ${winnerId}`;
            }
        } else {
            // Regular game (not room-based)
            winnerIdStr = winnerId.toString();
            winnerNameStr = `Player ${winnerId}`;
        }
        
        // Show the winner screen
        showGameEndScreen(winnerIdStr, winnerNameStr, pongGame);
        
        // Update winner in database
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
                if (room && Array.isArray(room.players)) {
                    const winnerPlayer = room.players[winnerId - 1];
                    didWin = !!winnerPlayer && (winnerPlayer.id?.toString() === user.id?.toString());
                } else {
                    didWin = (winnerId === 1);
                }
                try {                
                    const statsResponse = await fetch(`${apiEndpoint}/api/users/stats`, {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 
                            'Content-Type': 'application/json', 
                        },
                        body: JSON.stringify({ won: didWin })
                    });
                
                    if (!statsResponse.ok) {
                        const errorText = await statsResponse.text();
                        console.error('❌ Failed to update stats:', statsResponse.status, errorText);
                    } else {
                        console.log('✅ Stats updated successfully');
                        // Refresh user profile to get updated stats
                        await authService.fetchUserProfile?.();
                    }
                } catch (e) {
                    console.error('❌ Error updating user stats:', e);
                }
            }
        } catch (error) {
            console.error('Error updating winner or stats:', error);
        }
    };
}

export function showGameEndScreen(winnerId: string, winnerName: string, pongGame: PongGame): void {
    // Remove any existing overlays first
    const existingOverlay = document.getElementById('gameEndOverlay');
    if (existingOverlay) {
        existingOverlay.remove();
    }

    const overlay = document.createElement('div');
    overlay.id = 'gameEndOverlay';
    overlay.className = 'neon-grid';
    overlay.innerHTML = `
        <div class="grid-anim"></div>
        <div class="glass-card" style="text-align: center; max-width: 500px; padding: 3em;">
            <div style="font-size: 4em; margin-bottom: 0.2em;">🏆</div>
            <h2 style="color: #0ff; font-size: 2.5em; margin: 0 0 0.3em 0; text-shadow: 0 0 10px rgba(0, 255, 255, 0.5);">Game Over!</h2>
            <p style="color: #fff; font-size: 1.8em; margin-bottom: 1.5em; font-weight: bold; text-shadow: 0 0 10px rgba(255, 255, 255, 0.5);">
                ${winnerName} wins!
            </p>
            <div style="display: flex; gap: 1em; justify-content: center;">
                <button id="backToHomeBtn" class="btn btn-neon primary">
                    Back to Home
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    setTimeout(() => {
        const backBtn = document.getElementById('backToHomeBtn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                overlay.remove();
                cleanupGame(pongGame);
                history.pushState({ page: 'landing' }, '', '/');
                window.location.reload();
            });
        } 
    }, 0);
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
        background: rgba(239, 68, 68, 0.9);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(239, 68, 68, 0.5);
        color: white;
        padding: 1em 1.5em;
        border-radius: 8px;
        z-index: 999;
        font-weight: 600;
        box-shadow: 0 8px 32px rgba(239, 68, 68, 0.3);
        animation: slideIn 0.3s ease-out;
    `;
    notification.innerHTML = `⚠️ ${playerName} disconnected`;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => notification.remove(), 300);
    }, 4000);
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


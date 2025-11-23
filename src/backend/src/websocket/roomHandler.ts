import { FastifyInstance } from 'fastify';
import { activeGames } from '../routes/game';
import { gameRoomManager } from '../game/gameRoom';

const DEBUG = true;

// Store WebSocket connections per room
const roomConnections = new Map<string, Map<string, any>>();

// Store player to room mapping
const playerRoomMap = new Map<string, string>();

// Register room-based WebSocket routes
async function roomWebSocketRoutes(fastify: FastifyInstance) {
  
  // Room-based WebSocket endpoint - registered directly on fastify instance
    fastify.get('/room/:roomId/ws', { websocket: true }, (connection: any, req: any) => {
        const { roomId } = req.params;
        const queryParams = new URLSearchParams(req.url.split('?')[1] || '');
        const playerId = queryParams.get('playerId') || 'unknown';

        // Verify room exists
        const room = gameRoomManager.getRoom(roomId);
        if (!room) {
            console.log(`❌ Room ${roomId} not found`);
            if (connection.socket) {
                connection.socket.close(1008, 'Room not found');
            }
            return;
        }

        let socket = connection;
        if (!socket) {
            console.log('❌ Invalid socket connection');
            return;
        }

        // Initialize room connections map
        if (!roomConnections.has(roomId)) {
            roomConnections.set(roomId, new Map());
        }
        
        const roomSockets = roomConnections.get(roomId)!;
        roomSockets.set(playerId, socket);
        playerRoomMap.set(playerId, roomId);

        // Associate socket with player in room manager
        gameRoomManager.setPlayerSocket(roomId, playerId, playerId);

        // Handle incoming messages
        socket.on('message', (data: any) => {
            try {
                const message = JSON.parse(data.toString());
                handleRoomMessage(roomId, playerId, message, socket);
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
            }
        });

        sendRoomState(roomId, playerId);

        broadcastToRoom(roomId, {
            type: 'playerJoined',
            playerId: playerId,
            room: {
                roomId: room.roomId,
                players: room.players,
                status: room.status,
                maxPlayers: room.maxPlayers
            }
        }, playerId);

        socket.on('close', () => {
            console.log(`🔌 Player ${playerId} disconnected from room ${roomId}`);
            removePlayerFromRoom(roomId, playerId);
        });

        socket.on('error', (error: any) => {
            console.error(`❌ WebSocket error for player ${playerId}:`, error);
            removePlayerFromRoom(roomId, playerId);
        });

        // Send connection confirmation
        if (typeof socket.send === 'function') {
            socket.send(JSON.stringify({
                type: 'connected',
                roomId,
                playerId,
                message: 'Connected to room successfully'
            }));

            // Send current room state
            sendRoomState(roomId, playerId);
        }
    });
}

// Handle messages from players in a room
function handleRoomMessage(roomId: string, playerId: string, message: any, socket: any): void {
    const room = gameRoomManager.getRoom(roomId);
    if (!room) return;

    switch (message.type) {
        case 'ping':
            socket.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
            break;

        case 'move':
            // Handle player movement
            if (typeof message.position === 'number' && room.gameId) {
                let targetPlayerId = playerId;
                let targetPlayerNum = getPlayerNumber(room, playerId);
        
                // Check if this is a guest move from a local player
                if (message.isGuest) {
                    // Find the "local" player in the room
                    const localPlayer = room.players.find((p: any) => p.id === 'local');
                    if (localPlayer) {
                        targetPlayerId = 'local';
                        targetPlayerNum = getPlayerNumber(room, 'local');
                        console.log(`📤 Guest move from ${playerId} controlling local player (position ${targetPlayerNum})`);
                    }
                }
        
                const gameEngine = activeGames.get(room.gameId);
                if (gameEngine && typeof gameEngine.updatePlayerPosition === 'function') {
                    gameEngine.updatePlayerPosition(targetPlayerNum, message.position);
                }

                // Broadcast movement to all players in room (for UI sync)
                broadcastToRoom(roomId, {
                    type: 'playerMove',
                    playerId: targetPlayerId,
                    position: message.position
                }, playerId); // Exclude sender from broadcast
            }
            break;

        case 'ready':
            // Player ready status changed
            broadcastToRoom(roomId, {
                type: 'playerReady',
                playerId,
                isReady: message.isReady
            });
            break;

        case 'chat':
            // Chat message
            broadcastToRoom(roomId, {
                type: 'chat',
                playerId,
                username: message.username,
                message: message.text,
            });
            break;

        case 'requestState':
            // Send current game state to requesting player
            sendRoomState(roomId, playerId);
            break;

        case 'keyState':
            // Handle key state updates
            if (room.gameId) {
                let targetPlayerNum = getPlayerNumber(room, playerId);
          
                // If this is a guest key press, control player 2 (the local guest)
                if (message.isGuest) {
                    const localPlayer = room.players.find((p: any) => p.id === 'local');
                    if (localPlayer) {
                        targetPlayerNum = getPlayerNumber(room, 'local');
                    }
                }
          
                const gameEngine = activeGames.get(room.gameId);
                if (gameEngine && typeof gameEngine.setPlayerKeyState === 'function') {
                    gameEngine.setPlayerKeyState(targetPlayerNum, message.key, message.pressed);
                }
            }
            break;

        default:
            if (DEBUG) {
                console.log(`⚠️ Unknown message type: ${message.type}`);
            }
    }
}

// Get player number (1, 2, 3, 4) based on their position in the room
function getPlayerNumber(room: any, playerId: string): number {
    const index = room.players.findIndex((p: any) => p.id === playerId);
    return index >= 0 ? index + 1 : 1;
}

// Send current room/game state to a player
function sendRoomState(roomId: string, playerId: string): void {
    const room = gameRoomManager.getRoom(roomId);
    if (!room) return;

    const roomSockets = roomConnections.get(roomId);
    if (!roomSockets) return;

    const socket = roomSockets.get(playerId);
    if (!socket || typeof socket.send !== 'function') return;

    // If game is active, send game state
    if (room.gameId && room.status === 'playing') {
        const gameEngine = activeGames.get(room.gameId);
        if (gameEngine) {
            const gameState = gameEngine.getCurrentState();
            socket.send(JSON.stringify({
                type: 'gameState',
                state: gameState
            }));
        }
    }

    // Send room info
    socket.send(JSON.stringify({
        type: 'roomState',
        room: {
            roomId: room.roomId,
            players: room.players,
            status: room.status,
            maxPlayers: room.maxPlayers
        }
    }));
}

// Broadcast message to all players in a room (optionally excluding sender)
function broadcastToRoom(roomId: string, message: any, excludePlayerId?: string): void {
    const roomSockets = roomConnections.get(roomId);
    if (!roomSockets) return;

    const messageStr = JSON.stringify(message);
    let sentCount = 0;

    roomSockets.forEach((socket, playerId) => {
        if (excludePlayerId && playerId === excludePlayerId) return;
    
        if (socket && typeof socket.send === 'function') {
            try {
                if (typeof socket.readyState !== 'undefined' && socket.readyState === 1) {
                    socket.send(messageStr);
                    sentCount++;
                }
            } catch (error) {
                console.error(`Error sending to player ${playerId}:`, error);
            }
        }
    });
}

// Broadcast game start to room
export function broadcastGameStartToRoom(roomId: string, gameId: number): void {
    broadcastToRoom(roomId, {
        type: 'gameStart',
        gameId,
    });
}

export function broadcastCountdownToRoom(roomId: string): void {
    broadcastToRoom(roomId, {
        type: 'countdown',
        message: 'Game starting soon'
    });
}

// Broadcast game state updates to all players in a room
export function broadcastGameStateToRoom(roomId: string, gameState: any): void {
    broadcastToRoom(roomId, {
        type: 'gameState',
        state: gameState,
    });
}

// Broadcast score update to room
export function broadcastScoreToRoom(roomId: string, scores: any): void {
    broadcastToRoom(roomId, {
        type: 'score',
        ...scores,
    });
}

// Broadcast game end to room
export function broadcastGameEndToRoom(roomId: string, winnerId: string): void {
    broadcastToRoom(roomId, {
        type: 'gameEnd',
        winnerId,
    });
}

// Remove player from room
function removePlayerFromRoom(roomId: string, playerId: string): void {
    const roomSockets = roomConnections.get(roomId);
    if (roomSockets) {
        roomSockets.delete(playerId);
    
        if (roomSockets.size === 0) {
            roomConnections.delete(roomId);
        } else {
            // Notify remaining players
            broadcastToRoom(roomId, {
                type: 'playerDisconnected',
                playerId,
            });
        }
    }
  
    playerRoomMap.delete(playerId);
}

// Get connection count for a room
export function getRoomConnectionCount(roomId: string): number {
    const roomSockets = roomConnections.get(roomId);
    return roomSockets ? roomSockets.size : 0;
}

// Check if player is connected
export function isPlayerConnected(roomId: string, playerId: string): boolean {
    const roomSockets = roomConnections.get(roomId);
    return roomSockets ? roomSockets.has(playerId) : false;
}

export default roomWebSocketRoutes;
export { broadcastToRoom };
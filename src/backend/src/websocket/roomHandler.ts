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
  // Don't register @fastify/websocket again if already registered
  // It should be registered once at the top level in server.ts

  (fastify as any).register(async function (fastify: any) {
    // Room-based WebSocket endpoint
    fastify.get('/room/:roomId/ws', { websocket: true }, (connection: any, req: any) => {
      const { roomId } = req.params;
      const queryParams = new URLSearchParams(req.url.split('?')[1] || '');
      const playerId = queryParams.get('playerId') || 'unknown';
      
      if (DEBUG) {
        console.log(`🔌 WebSocket connection attempt: roomId=${roomId}, playerId=${playerId}`);
      }

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

      if (DEBUG) {
        console.log(`✅ Player ${playerId} connected to room ${roomId}`);
        console.log(`📊 Room ${roomId} now has ${roomSockets.size} connections`);
      }

      // Handle incoming messages
      if (typeof socket.on === 'function') {
        socket.on('message', (data: any) => {
          try {
            const message = JSON.parse(data.toString());
            handleRoomMessage(roomId, playerId, message, socket);
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        });

        socket.on('close', () => {
          if (DEBUG) {
            console.log(`🔌 Player ${playerId} disconnected from room ${roomId}`);
          }
          removePlayerFromRoom(roomId, playerId);
        });

        socket.on('error', (error: any) => {
          console.error(`❌ WebSocket error for player ${playerId}:`, error);
          removePlayerFromRoom(roomId, playerId);
        });
      }

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
  });
}

// Handle messages from players in a room
function handleRoomMessage(roomId: string, playerId: string, message: any, socket: any): void {
  const room = gameRoomManager.getRoom(roomId);
  if (!room) return;

  if (DEBUG) {
    console.log(`📨 Message from ${playerId} in room ${roomId}:`, message.type);
  }

  switch (message.type) {
    case 'ping':
      socket.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      break;

    case 'move':
      // Handle player movement
      if (typeof message.position === 'number' && room.gameId) {
        const playerNum = getPlayerNumber(room, playerId);
        const gameEngine = activeGames.get(room.gameId);
        if (gameEngine && typeof gameEngine.updatePlayerPosition === 'function') {
          gameEngine.updatePlayerPosition(playerNum, message.position);
        }

        // Broadcast movement to all players in room (for UI sync)
        broadcastToRoom(roomId, {
          type: 'playerMove',
          playerId,
          position: message.position
        }, playerId); // Exclude sender
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
        timestamp: Date.now()
      });
      break;

    case 'requestState':
      // Send current game state to requesting player
      sendRoomState(roomId, playerId);
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

  if (DEBUG && sentCount > 0) {
    console.log(`📡 Broadcast to room ${roomId}: ${message.type} (${sentCount} players)`);
  }
}

// Broadcast game start to room
export function broadcastGameStartToRoom(roomId: string, gameId: number): void {
  broadcastToRoom(roomId, {
    type: 'gameStart',
    gameId,
    timestamp: Date.now()
  });
}

// Broadcast game state updates to all players in a room
export function broadcastGameStateToRoom(roomId: string, gameState: any): void {
  broadcastToRoom(roomId, {
    type: 'gameState',
    state: gameState,
    timestamp: Date.now()
  });
}

// Broadcast score update to room
export function broadcastScoreToRoom(roomId: string, scores: any): void {
  broadcastToRoom(roomId, {
    type: 'score',
    ...scores,
    timestamp: Date.now()
  });
}

// Broadcast game end to room
export function broadcastGameEndToRoom(roomId: string, winnerId: string): void {
  broadcastToRoom(roomId, {
    type: 'gameEnd',
    winnerId,
    timestamp: Date.now()
  });
}

// Remove player from room
function removePlayerFromRoom(roomId: string, playerId: string): void {
  const roomSockets = roomConnections.get(roomId);
  if (roomSockets) {
    roomSockets.delete(playerId);
    
    if (roomSockets.size === 0) {
      roomConnections.delete(roomId);
      if (DEBUG) {
        console.log(`🗑️ Room ${roomId} WebSocket connections cleared`);
      }
    } else {
      // Notify remaining players
      broadcastToRoom(roomId, {
        type: 'playerDisconnected',
        playerId,
        timestamp: Date.now()
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
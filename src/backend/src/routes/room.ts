import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { gameRoomManager } from '../game/gameRoom';
import { broadcastGameStartToRoom, broadcastToRoom } from '../websocket/roomHandler';
import { database } from '../database/index';
import { TwoPlayerGameEngine, FourPlayerGameEngine } from '../game/gameEngine';
import { activeGames } from './game';
import { GameState } from '../database/index';

interface CreateRoomBody {
  hostId: string;
  hostUsername: string;
  maxPlayers?: number;
}

interface JoinRoomBody {
  playerId: string;
  username: string;
  isAI?: boolean;
  isLocal?: boolean;
  isReady?: boolean;
  difficulty?: string;
}

interface ToggleReadyBody {
  playerId: string;
}

interface LeaveRoomBody {
  playerId: string;
}

async function roomRoutes(fastify: FastifyInstance) {
  
  // Create a new room
  fastify.post('/api/room/create', async (
    request: FastifyRequest<{ Body: CreateRoomBody }>, 
    reply: FastifyReply
  ) => {
    try {
      const { hostId, hostUsername, maxPlayers = 2 } = request.body;

      if (!hostId || !hostUsername) {
        return reply.code(400).send({
          success: false,
          message: 'hostId and hostUsername are required'
        });
      }

      const room = gameRoomManager.createRoom(hostId, hostUsername, maxPlayers);

      return reply.code(201).send({
        success: true,
        message: 'Room created successfully',
        data: {
          roomId: room.roomId,
          inviteLink: `/join/${room.roomId}`,
          room
        }
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({
        success: false,
        message: 'Failed to create room'
      });
    }
  });

  // Get room details
  fastify.get('/api/room/:roomId', async (request, reply) => {
    const { roomId } = request.params as { roomId: string };
    
    const room = gameRoomManager.getRoom(roomId);
    if (!room) {
      return reply.status(404).send({ success: false, message: 'Room not found' });
    }

    return reply.send({
      success: true,
      room: {
        ...room,
        gameId: room.gameId
      }
    });
  });

  // Join a room
  fastify.post('/api/room/:roomId/join', async (
    request: FastifyRequest<{ 
      Params: { roomId: string };
      Body: JoinRoomBody;
    }>,
    reply: FastifyReply
  ) => {
    try {
      const { roomId } = request.params;
      const { playerId, username, isAI = false, isLocal = false, isReady = false, difficulty } = request.body;
      // AI and local players are automatically ready
      const finalIsReady = isReady || isAI;

      if (!playerId || !username) {
        return reply.code(400).send({
          success: false,
          message: 'playerId and username are required'
        });
      }

      const result = gameRoomManager.joinRoom(roomId, playerId, username, isAI, finalIsReady, difficulty, isLocal);

      if (!result.success) {
        return reply.code(400).send(result);
      }

      const room = gameRoomManager.getRoom(roomId);
      if (room) {
        console.log(`📡 Broadcasting room update to ${room.players.length} players`);
        
        broadcastToRoom(roomId, {
          type: 'roomState',
          room: {
            roomId: room.roomId,
            hostId: room.hostId,
            players: room.players,
            status: room.status,
            maxPlayers: room.maxPlayers,
            gameId: room.gameId
          },
          timestamp: Date.now()
        });
      }

      return reply.send(result);
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({
        success: false,
        message: 'Failed to join room'
      });
    }
  });


  // Leave a room
  fastify.post('/api/room/:roomId/leave', async (
    request: FastifyRequest<{
      Params: { roomId: string };
      Body: LeaveRoomBody;
    }>,
    reply: FastifyReply
  ) => {
    try {
      const { roomId } = request.params;
      const { playerId } = request.body;

      if (!playerId) {
        return reply.code(400).send({
          success: false,
          message: 'playerId is required'
        });
      }

      const success = gameRoomManager.leaveRoom(roomId, playerId);

      if (!success) {
        return reply.code(404).send({
          success: false,
          message: 'Room or player not found'
        });
      }

      const room = gameRoomManager.getRoom(roomId);
      if (room) {
        console.log(`📡 Broadcasting player left to room ${roomId}`);
        
        broadcastToRoom(roomId, {
          type: 'roomState',
          room: {
            roomId: room.roomId,
            hostId: room.hostId,
            players: room.players,
            status: room.status,
            maxPlayers: room.maxPlayers,
            gameId: room.gameId
          },
          timestamp: Date.now()
        });
      }

      return reply.send({
        success: true,
        message: 'Left room successfully'
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({
        success: false,
        message: 'Failed to leave room'
      });
    }
  });

  // Toggle ready status
  fastify.post('/api/room/:roomId/ready', async (
    request: FastifyRequest<{
      Params: { roomId: string };
      Body: ToggleReadyBody;
    }>,
    reply: FastifyReply
  ) => {
    try {
      const { roomId } = request.params;
      const { playerId } = request.body;

      if (!playerId) {
        return reply.code(400).send({
          success: false,
          message: 'playerId is required'
        });
      }

      const success = gameRoomManager.toggleReady(roomId, playerId);

      if (!success) {
        return reply.code(404).send({
          success: false,
          message: 'Room or player not found'
        });
      }

      const room = gameRoomManager.getRoom(roomId);
      const allReady = gameRoomManager.allPlayersReady(roomId);

      if (room) {
        console.log(`📡 Broadcasting ready status to room ${roomId}`);
        
        broadcastToRoom(roomId, {
          type: 'roomState',
          room: {
            roomId: room.roomId,
            hostId: room.hostId,
            players: room.players,
            status: room.status,
            maxPlayers: room.maxPlayers,
            gameId: room.gameId
          },
          timestamp: Date.now()
        });
      }

      return reply.send({
        success: true,
        message: 'Ready status toggled',
        data: {
          room,
          allReady
        }
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({
        success: false,
        message: 'Failed to toggle ready'
      });
    }
  });

  // Start game in room
  fastify.post('/api/room/:roomId/start', async (request, reply) => {
    const { roomId } = request.params as { roomId: string };
    const { hostId } = request.body as { hostId: string };

    const room = gameRoomManager.getRoom(roomId);
    if (!room) {
      return reply.status(404).send({ success: false, message: 'Room not found' });
    }

    if (room.hostId !== hostId) {
      return reply.status(403).send({ success: false, message: 'Only the host can start the game' });
    }

    if (!gameRoomManager.allPlayersReady(roomId)) {
      return reply.status(400).send({ success: false, message: 'Not all players are ready' });
    }

    try {
      const gameMode = room.maxPlayers === 4 ? '4player' : '1v1';
      // Use incremental DB-backed game IDs for cleanliness
      const createdGame = database.games.createGame({ mode: gameMode, difficulty: 'normal' });
      const gameId = createdGame.id;
      
      console.log(`✅ Creating shared game ${gameId} for room ${roomId}`);

      // Create a proper GameState object
      const initialGameState: GameState = {
        id: 0, // Optional: engine updates guard errors internally
        gameId: gameId,
        player1Id: 0,
        player2Id: 0,
        player3Id: 0,
        player4Id: 0,
        ballPosX: 200,
        ballPosY: 100,
        ballVelX: 0,
        ballVelY: 0,
        player1Pos: 80,
        player2Pos: 80,
        player3Pos: 180,
        player4Pos: 180,
        scorePlayer1: 0,
        scorePlayer2: 0,
        scorePlayer3: 0,
        scorePlayer4: 0,
        gameMode: gameMode
      };

      // Create game engine with proper GameState
      let gameEngine;
      if (gameMode === '4player') {
        gameEngine = new FourPlayerGameEngine(initialGameState);
      } else {
        gameEngine = new TwoPlayerGameEngine(initialGameState);
      }

      // Attach AI players before first frame
      room.players.forEach((player, index) => {
      const playerId = index + 1; // Player IDs are 1-indexed
      if (player.isAI) {
        const difficulty = (player.difficulty as any) || 'normal';
        gameEngine.setPlayerAI(playerId, true, difficulty);
      }
    });

      // Ensure all runtime state is initialized AFTER AI is attached
      if (typeof (gameEngine as any).resetGame === 'function') {
        try {
          console.log('🔄 Performing pre-start reset to stabilize initial state...');
          (gameEngine as any).resetGame();
        } catch (e) {
          console.warn('⚠️ Pre-start reset failed (continuing):', e);
        }
      }

      // Store and start the game engine
      activeGames.set(gameId, gameEngine);
      if (typeof (gameEngine as any).startGame === 'function') {
        (gameEngine as any).startGame();
      }
      
      const started = gameRoomManager.startGame(roomId, gameId);
      if (!started) {
        throw new Error('Failed to start game in room');
      }

      broadcastGameStartToRoom(roomId, gameId);
      return reply.send({
        success: true,
      message: 'Game started',
      gameId: gameId,
      room: gameRoomManager.getRoom(roomId)
      });

    } catch (error) {
      console.error('Error starting room game:', error);
      return reply.status(500).send({
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // List all active rooms
  fastify.get('/api/rooms', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const rooms = gameRoomManager.getAllRooms();
      return reply.send({
        success: true,
        data: rooms
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({
        success: false,
        message: 'Failed to get rooms'
      });
    }
  });
}

export default roomRoutes;
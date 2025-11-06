import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { gameRoomManager } from '../game/gameRoom';
import { broadcastGameStartToRoom, broadcastToRoom, broadcastCountdownToRoom } from '../websocket/roomHandler';
import { database } from '../database/index';
import { BaseGameEngine } from '../game/gameEngine';
import { activeGames } from './game';
import { GameState } from '../../../shared/gameTypes';

interface CreateRoomBody {
    hostId: string;
    hostUsername: string;
    maxPlayers?: number;
}

interface JoinRoomBody {
    playerId: string;
    username: string;
    isAI?: boolean;
    isReady?: boolean;
    isLocal: boolean;
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
            const { playerId, username, isAI = false, isReady: _ignoredIsReady, isLocal = false, difficulty } = request.body;
            const isReady = (isAI || isLocal) ? true : false;

            if (!playerId || !username) {
                return reply.code(400).send({
                    success: false,
                    message: 'playerId and username are required'
                });
            }

            const result = gameRoomManager.joinRoom(roomId, playerId, username, isAI, isReady, isLocal, difficulty);

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
            broadcastCountdownToRoom(roomId);
        
            reply.send({
                success: true,
                message: 'Countdown started'
            });
        
            setTimeout(async () => {
                try {
                    const gameMode = room.maxPlayers === 4 ? '4P' : '2P';
                    const createdGame = database.games.createGame({ mode: gameMode, difficulty: 'normal' });
                    const gameId = createdGame.id;
            
                    console.log(`✅ Creating shared game ${gameId} for room ${roomId}`);

                    const positions = gameMode === '4P' 
                        ? ['left', 'top', 'right', 'bottom'] 
                        : ['left', 'right'];
            
                    const players = room.players.map((roomPlayer, index) => {
                        let playerId: number;
                        const parsedId = parseInt(roomPlayer.id);
              
                        if (!isNaN(parsedId) && parsedId > 0) {
                            playerId = parsedId;
                
                            try {
                                const position = positions[index] || 'left';
                                database.players.addPlayerToGame(gameId, playerId, position);
                            } catch (err) {
                                console.warn(`⚠️ Could not add player ${playerId} to database`);
                            }
                        } else {
                            playerId = index + 1;
                        }
              
                        return {
                            id: playerId,
                            name: roomPlayer.name,
                            gameId: gameId,
                            isReady: roomPlayer.isReady,
                            pos: gameMode === '4P' ? 160 : 70,
                            score: 0,
                            connectionStatus: 'connected',
                            lastActivity: new Date().toISOString()
                        };
                    });

                    const initialGameState: GameState = {
                        id: 0,
                        gameId: gameId,
                        players: players,
                        ballPosX: 200,
                        ballPosY: gameMode === '4P' ? 200 : 100,
                        ballVelX: 0,
                        ballVelY: 0,
                        mode: gameMode,
                        lastContact: 0,
                        lastActivity: new Date().toISOString(),
                    };

                    const gameEngine: BaseGameEngine = new BaseGameEngine(initialGameState);

                    // Attach AI players
                    room.players.forEach((player, index) => {
                        const playerId = index + 1;
                        if (player.isAI) {
                            const difficulty = (player.difficulty as any) || 'normal';
                            gameEngine.setPlayerAI(playerId, true, difficulty);
                        }
                    });

                    activeGames.set(gameId, gameEngine);
                    gameEngine.startGame();

                    room.gameId = gameId;
                    room.status = 'playing';

                    // Broadcast game start to all players
                    broadcastGameStartToRoom(roomId, gameId);
            
                    console.log('✅ Game started successfully after countdown');
                } catch (error) {
                    console.error('Error starting game after countdown:', error);
                }
            }, 4000); // 4 second delay for countdown
        
        } catch (error) {
            fastify.log.error(error);
            return reply.status(500).send({
                success: false,
                message: 'Failed to start countdown'
            });
        }
    });

  // End the current game and reset room to waiting for a fresh start
    fastify.post('/api/room/:roomId/end', async (request, reply) => {
        const { roomId } = request.params as { roomId: string };
        const room = gameRoomManager.getRoom(roomId);
        if (!room) {
            return reply.status(404).send({ success: false, message: 'Room not found' });
        }

        try {
            const gameId = room.gameId;
            if (gameId) {
                const engine = activeGames.get(gameId);
                if (engine && typeof (engine as any).endGame === 'function') {
                    (engine as any).endGame();
                }
                activeGames.delete(gameId);
            }

            // Reset room for a new game
            room.status = 'waiting';
            room.gameId = undefined;
            room.players = room.players.map(p => ({ ...p, isReady: false }));

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

            return reply.send({ success: true, message: 'Game ended and room reset', room });
        } catch (error) {
            fastify.log.error(error);
            return reply.status(500).send({ success: false, message: 'Failed to end game' });
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

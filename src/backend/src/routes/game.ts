import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { database, Game, Player } from '../database/index';
import { createGameEngine } from '../game/gameEngine';
import type { BaseGameEngine } from '../game/gameEngine';

import { JWT_SECRET } from '../config/index';
import jwt from 'jsonwebtoken';

// Types
export interface CreateGameInput {
  mode?: string;
  difficulty?: string;
}

function getUserIdFromRequest(request: any): number | null {
    try {
        const authHeader = request.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return null;
        }
        
        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, JWT_SECRET!) as { id: string };
        return parseInt(decoded.id);
    } catch {
        return null;
    }
}

// Store active game engines (MUST be exported for room.ts)
export const activeGames = new Map<number, BaseGameEngine>();

// Plugin function that registers all game routes
async function gameRoutes(fastify: FastifyInstance, options: FastifyPluginOptions) {
    
    // Get all games
    fastify.get('/', async (request, reply) => {
        try {
            const games = database.games.getAllGames();
            return {
                success: true,
                count: games.length,
                data: games
            };
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                message: 'Failed to fetch games'
            });
        }
    });
    
    // Get game by ID
    fastify.get('/:id', async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const gameId = parseInt(id);
            
            if (isNaN(gameId)) {
                reply.code(400).send({
                    success: false,
                    message: 'Invalid game ID'
                });
                return;
            }
            
            const game = database.games.getGameById(gameId);
            
            if (!game) {
                reply.code(404).send({
                    success: false,
                    message: 'Game not found'
                });
                return;
            }
            
            // Also get players for this game
            const players = database.players.getPlayers(gameId);
            
            return {
                success: true,
                data: {
                    ...game,
                    players
                }
            };
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                message: 'Failed to fetch game'
            });
        }
    });

    // Get ball position for specific game
    fastify.get('/:id/ball-position', async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const gameId = parseInt(id);
            
            if (isNaN(gameId)) {
                reply.code(400).send({
                    success: false,
                    message: 'Invalid game ID'
                });
                return;
            }
            
            const gameEngine = activeGames.get(gameId);
            if (!gameEngine) {
                reply.code(404).send({
                    success: false,
                    message: 'Game engine not found'
                });
                return;
            }
            
            const gameState = gameEngine.getGameState();
            
            return {
                success: true,
                data: {
                    ballPosX: gameState.ballPosX,
                    ballPosY: gameState.ballPosY
                }
            };
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                message: 'Failed to get ball position'
            });
        }
    });

    // Get player position
    fastify.get('/:id/players/:playerId/position', async (request, reply) => {
        try {
            const { id, playerId } = request.params as { id: string; playerId: string };
            const gameId = parseInt(id);
            const playerIdNum = parseInt(playerId);
            
            if (isNaN(gameId) || isNaN(playerIdNum)) {
                reply.code(400).send({
                    success: false,
                    message: 'Invalid game ID or player ID'
                });
                return;
            }
            
            const gameEngine = activeGames.get(gameId);
            if (!gameEngine) {
                reply.code(404).send({
                    success: false,
                    message: 'Game engine not found'
                });
                return;
            }
            
            const gameState = gameEngine.getGameState();
            const position = playerIdNum === 1 ? gameState.player1Pos : gameState.player2Pos;
            
            return {
                success: true,
                data: {
                    playerId: playerIdNum,
                    position: position
                }
            };
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                message: 'Failed to get player position'
            });
        }
    });

    // Update player position
    fastify.put('/:id/players/:playerId/position', async (request, reply) => {
        try {
            const { id, playerId } = request.params as { id: string; playerId: string };
            const { position } = request.body as { position: number };
            const gameId = parseInt(id);
            const playerIdNum = parseInt(playerId);
            
            if (isNaN(gameId) || isNaN(playerIdNum)) {
                reply.code(400).send({
                    success: false,
                    message: 'Invalid game ID or player ID'
                });
                return;
            }
            
            if (position === undefined || position < 0) {
                reply.code(400).send({
                    success: false,
                    message: 'Invalid position value'
                });
                return;
            }
            
            const gameEngine = activeGames.get(gameId);
            if (!gameEngine) {
                reply.code(404).send({
                    success: false,
                    message: 'Game engine not found'
                });
                return;
            }
            
            // Check if player is in this game
            const players = database.players.getPlayers(gameId);
            const player = players.find(p => p.playerId === playerIdNum);
            
            if (!player) {
                reply.code(404).send({
                    success: false,
                    message: 'Player not in this game'
                });
                return;
            }
            
            return {
                success: true,
                message: 'Player position updated',
                gameId: gameId,
                playerId: playerIdNum,
                position: position
            };
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                message: 'Failed to update player position'
            });
        }
    });

    // Create new game
    fastify.post('/new', async (request, reply) => {
        try {
            const gameData = request.body as CreateGameInput;
            
            // Get authenticated user ID from JWT token
            const userId = getUserIdFromRequest(request);
            
            // Create the game
            const newGame = database.games.createGame(gameData);
            
            // If user is authenticated, create game state with their ID
            if (userId) {
                try {
                    const gameStateData = {
                        gameId: newGame.id,
                        player1Id: userId,
                        player2Id: userId 
                    };
                    
                    database.gameState.createGameState(gameStateData);
                } catch (gameStateError) {
                    // Game state creation failed, but game was created
                    console.log('Game state creation skipped:', gameStateError);
                }
            }
            
            reply.code(201).send({
                success: true,
                message: 'Game created successfully',
                data: newGame
            });
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                message: 'Failed to create game'
            });
        }
    });

    // ✅ FIXED: Join game endpoint
    fastify.post('/:id/join', async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const gameId = parseInt(id);
            const { playerId } = request.body as { playerId: number };
            
            if (isNaN(gameId)) {
                reply.code(400).send({
                    success: false,
                    message: 'Invalid game ID'
                });
                return;
            }
            
            // Check if game exists
            const game = database.games.getGameById(gameId);
            if (!game) {
                reply.code(404).send({
                    success: false,
                    message: 'Game not found'
                });
                return;
            }
            
            // Check current players
            const currentPlayers = database.players.getPlayers(gameId);
            if (currentPlayers.length >= 2) {
                reply.code(400).send({
                    success: false,
                    message: 'Game is full'
                });
                return;
            }
            
            // ✅ NEW: Check if player is already in this game
            const existingPlayer = currentPlayers.find(p => p.playerId === playerId);
            if (existingPlayer) {
                reply.code(409).send({
                    success: false,
                    message: 'Player already in this game',
                    data: existingPlayer
                });
                return;
            }
            
            // Determine position
            const position = currentPlayers.length === 0 ? 'left' : 'right';
            
            // Add player to game
            const gamePlayer = database.players.addPlayerToGame(gameId, playerId, position);
            
            // ✅ FIXED: Create game state ONLY when we have exactly 2 players AND no game state exists yet
            if (currentPlayers.length === 1) {
                // Check if game state already exists for this game
                const existingGameState = database.gameState.getGameStateByGameId(gameId);
                
                if (!existingGameState) {
                    // Get both players (the one that was already there + the one we just added)
                    const allPlayers = database.players.getPlayers(gameId);
                    const player1 = allPlayers.find(p => p.playerPosition === 'left');
                    const player2 = allPlayers.find(p => p.playerPosition === 'right');
                    
                    if (player1 && player2) {
                        fastify.log.info(`Creating game state for game ${gameId} with player1: ${player1.playerId}, player2: ${player2.playerId}`);
                        
                        // Create initial game state
                        try {
                            database.gameState.createGameState({
                                gameId: gameId,
                                player1Id: player1.playerId,
                                player2Id: player2.playerId
                            });
                            
                            // Update game status to ready
                            database.games.updateGame(gameId, { status: 'ready' });
                            
                            fastify.log.info(`Game state created successfully for game ${gameId}`);
                        } catch (error) {
                            fastify.log.error(`Failed to create game state: ${error}`);
                            // Don't fail the join if game state creation fails
                        }
                    } else {
                        fastify.log.warn(`Could not find both players for game ${gameId}`);
                    }
                } else {
                    fastify.log.info(`Game state already exists for game ${gameId}, skipping creation`);
                }
            }
            
            return {
                success: true,
                message: 'Successfully joined game',
                data: gamePlayer
            };
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                message: 'Failed to join game'
            });
        }
    });

    // Delete game
    fastify.delete('/:id', async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const gameId = parseInt(id);
            
            if (isNaN(gameId)) {
                reply.code(400).send({
                    success: false,
                    message: 'Invalid game ID'
                });
                return;
            }
            
            // Stop game engine if running
            const gameEngine = activeGames.get(gameId);
            if (gameEngine) {
                gameEngine.stop();
                activeGames.delete(gameId);
            }
            
            // Delete from database
            const deleted = database.games.deleteGame(gameId);
            
            if (!deleted) {
                reply.code(404).send({
                    success: false,
                    message: 'Game not found'
                });
                return;
            }
            
            return {
                success: true,
                message: 'Game deleted successfully'
            };
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                message: 'Failed to delete game'
            });
        }
    });

    // Get game state
    fastify.get('/:id/state', async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const gameId = parseInt(id);
            
            if (isNaN(gameId)) {
                reply.code(400).send({
                    success: false,
                    message: 'Invalid game ID'
                });
                return;
            }
            
            const gameEngine = activeGames.get(gameId);
            
            if (gameEngine) {
                const gameState = gameEngine.getGameState();
                return {
                    success: true,
                    data: gameState,
                    isLive: true,
                    isRunning: gameEngine.isRunning()
                };
            }
            
            const gameState = database.gameState.getGameStateByGameId(gameId);
            
            if (!gameState) {
                reply.code(404).send({
                    success: false,
                    message: 'Game state not found'
                });
                return;
            }
            
            return {
                success: true,
                data: gameState,
                isLive: false,
                isRunning: false
            };
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                message: 'Failed to get game state'
            });
        }
    });

    // Start game engine
    fastify.post('/:id/start', async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const gameId = parseInt(id);
            
            if (isNaN(gameId)) {
                reply.code(400).send({
                    success: false,
                    message: 'Invalid game ID'
                });
                return;
            }
            
            // Check if game already running
            if (activeGames.has(gameId)) {
                reply.send({
                    success: true,
                    message: 'Game already running',
                    gameId: gameId
                });
                return;
            }
            
            // Check if game exists
            const game = database.games.getGameById(gameId);
            if (!game) {
                reply.code(404).send({
                    success: false,
                    message: 'Game not found'
                });
                return;
            }
            
            // Get or create game state
            let gameState = database.gameState.getGameStateByGameId(gameId);
            
            if (!gameState) {
                // Get authenticated user or first available user
                let userId = getUserIdFromRequest(request);
                
                if (!userId) {
                    // No auth token, use first user in database
                    const allUsers = database.users.getAllUsers();
                    if (allUsers.length === 0) {
                        reply.code(500).send({
                            success: false,
                            message: 'No users in database. Create a user first.'
                        });
                        return;
                    }
                    userId = allUsers[0].id;
                }
                
                // Create game state
                gameState = database.gameState.createGameState({
                    gameId: gameId,
                    player1Id: userId,
                    player2Id: userId
                });
            }
            
            // Create and start game engine
            const gameEngine = createGameEngine(gameState);
            gameEngine.start();
            activeGames.set(gameId, gameEngine);
            
            // Update game status
            database.games.updateGame(gameId, { 
                status: 'active',
                startedAt: new Date().toISOString()
            });
            
            reply.send({
                success: true,
                message: 'Game started successfully',
                gameId: gameId
            });
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                message: 'Failed to start game'
            });
        }
    });

    // Stop game
    fastify.post('/:id/stop', async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const gameId = parseInt(id);
            
            if (isNaN(gameId)) {
                reply.code(400).send({
                    success: false,
                    message: 'Invalid game ID'
                });
                return;
            }
            
            const gameEngine = activeGames.get(gameId);
            
            if (!gameEngine) {
                reply.code(404).send({
                    success: false,
                    message: 'Game not running'
                });
                return;
            }
            
            gameEngine.stop();
            activeGames.delete(gameId);
            
            // Update game status
            database.games.updateGame(gameId, { 
                status: 'finished',
                endedAt: new Date().toISOString()
            });
            
            reply.send({
                success: true,
                message: 'Game stopped successfully'
            });
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                message: 'Failed to stop game'
            });
        }
    });

    // Update winner
    fastify.post('/:id/winner', async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const { winnerId } = request.body as { winnerId: number };
            const gameId = parseInt(id);
            
            if (isNaN(gameId)) {
                reply.code(400).send({
                    success: false,
                    message: 'Invalid game ID'
                });
                return;
            }
            
            // Update game with winner
            const updatedGame = database.games.updateGame(gameId, {
                winnerId: winnerId,
                endedAt: new Date().toISOString(),
                status: 'finished'
            });
            
            if (!updatedGame) {
                reply.code(404).send({
                    success: false,
                    message: 'Game not found'
                });
                return;
            }
            
            reply.send({
                success: true,
                message: 'Winner updated successfully',
                data: updatedGame
            });
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                message: 'Failed to update winner'
            });
        }
    });
}

export default gameRoutes;
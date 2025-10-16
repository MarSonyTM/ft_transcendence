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
            if (gameEngine) {
                const currentState = gameEngine.getCurrentState();
                return {
                    success: true,
                    ballX: currentState.ballPosX,
                    ballY: currentState.ballPosY,
                    isLive: true
                };
            }
            
            // If not active, get from database (static data)
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
                ballX: gameState.ballPosX,
                ballY: gameState.ballPosY,
                isLive: false
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
    // fastify.get('/:id/players/:playerId/position', async (request, reply) => {
    //     try {
    //         const { id, playerId } = request.params as { id: string; playerId: string };
    //         const gameId = parseInt(id);
    //         const playerIdNum = parseInt(playerId);
            
    //         if (isNaN(gameId) || isNaN(playerIdNum)) {
    //             reply.code(400).send({
    //                 success: false,
    //                 message: 'Invalid game ID or player ID'
    //             });
    //             return;
    //         }
            
    //         const gameEngine = activeGames.get(gameId);
    //         if (!gameEngine) {
    //             reply.code(404).send({
    //                 success: false,
    //                 message: 'Game engine not found'
    //             });
    //             return;
    //         }
            
    //         const gameState = gameEngine.getGameState();
    //         const position = playerIdNum === 1 ? gameState.player1Pos : gameState.player2Pos;
            
    //         return {
    //             success: true,
    //             data: {
    //                 playerId: playerIdNum,
    //                 position: position
    //             }
    //         };
    //     } catch (error) {
    //         fastify.log.error(error);
    //         reply.code(500).send({
    //             success: false,
    //             message: 'Failed to get player position'
    //         });
    //     }
    // });
    fastify.get('/:id/player-positions', async (request, reply) => {
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
            
            // Check if game engine is active (live data)
            const gameEngine = activeGames.get(gameId);
            if (gameEngine) {
                const currentState = gameEngine.getCurrentState();
                return {
                    success: true,
                    players: currentState.players,
                    isLive: true,
                    gameId: gameId
                };
            }
            
            // If not active, get from database (static data)
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
                players: [],
                isLive: false,
                gameId: gameId
            };
            
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                message: 'Failed to get player positions'
            });
        }
    });

    // Update player position
    fastify.put('/:id/player-positions', async (request, reply) => {
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
            const player = players.find(p => p.id === playerIdNum);
            
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
                        ballPosX: 200,
                        ballPosY: 100,
                        ballVelX: 0,
                        ballVelY: 0,
                        players: [{
                            id: 0,
                            name: `${userId}`, // Placeholder, replace with actual user name if available
                            gameId: newGame.id,
                            pos: 0,
                            score: 0,
                            connectionStatus: 'connected',
                            lastActivity: new Date().toISOString()
                        }],
                        mode: gameData.mode || '2P'
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
            const existingPlayer = currentPlayers.find(p => p.id === playerId);
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
                    
                    if (allPlayers[0] && allPlayers[1]) {
                        fastify.log.info(`Creating game state for game ${gameId} with player1: ${allPlayers[0].id}, player2: ${allPlayers[1].id}`);
                        
                        // Create initial game state
                        try {
                            database.gameState.createGameState({
                                gameId: gameId
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
                gameEngine.endGame();
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
                return {
                    success: true,
                    data: gameEngine.getCurrentState(),
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
            
            // Check if game already exists and is running
            const existingGame = activeGames.get(gameId);
            if (existingGame) {
                // Game engine exists - check if it's already running
                if (existingGame.isRunning()) {
                    reply.send({
                        success: true,
                        message: 'Game already running',
                        gameId: gameId
                    });
                    return;
                } else {
                    // Game engine exists but not started yet - start it now
                    console.log(`🎮 Starting existing game engine ${gameId}`);
                    existingGame.startGame();
                    
                    // Update game status in database
                    database.games.updateGame(gameId, { 
                        status: 'active',
                        startedAt: new Date().toISOString()
                    });
                    
                    reply.send({
                        success: true,
                        message: 'Game started successfully',
                        gameId: gameId
                    });
                    return;
                }
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

            // Get or create game state (DB snapshot)
            let gameStateRow = database.gameState.getGameStateByGameId(gameId);
            if (!gameStateRow) {
                try {
                    gameStateRow = database.gameState.createGameState({ gameId });
                } catch (createError) {
                    console.error('Failed to create game state:', createError);
                    reply.code(500).send({
                        success: false,
                        message: 'Failed to create game state'
                    });
                    return;
                }
            }
            
            // Start game engine
            try {
                // Get the game mode from the database - NOW SUPPORTING 4PLAYER!
                const gameMode = game.mode || '2P'; // Default to 2P if no mode specified
                
                console.log(`🎮 Starting ${gameMode} game engine for game ${gameId}`);
                
                // Build a runtime game state that the engine expects
                const playersInDb = database.players.getPlayers(gameId) as any[];
                const left = playersInDb.find((p: any) => p.playerPosition === 'left');
                const right = playersInDb.find((p: any) => p.playerPosition === 'right');
                const p1Id = left?.playerId ?? 1;
                const p2Id = right?.playerId ?? 2;

                const runtimeGameState = {
                    gameId,
                    players: [
                        {
                            id: p1Id,
                            gameId,
                            pos: 0,
                            material: null,
                            color: { r: 1, g: 1, b: 1 },
                            score: 0,
                            connectionStatus: 'connected',
                            lastActivity: new Date().toISOString()
                        },
                        {
                            id: p2Id,
                            gameId,
                            pos: 0,
                            material: null,
                            color: { r: 1, g: 1, b: 1 },
                            score: 0,
                            connectionStatus: 'connected',
                            lastActivity: new Date().toISOString()
                        }
                    ],
                    ballPosX: gameStateRow?.ballPosX ?? 0,
                    ballPosY: gameStateRow?.ballPosY ?? 0,
                    ballVelX: gameStateRow?.ballVelX ?? 0,
                    ballVelY: gameStateRow?.ballVelY ?? 0,
                    mode: gameMode,
                    lastActivity: new Date().toISOString()
                } as any;

                const gameEngine = createGameEngine(runtimeGameState as any, gameMode);
                activeGames.set(gameId, gameEngine);
                gameEngine.startGame();
                
                // Update game status in database
                database.games.updateGame(gameId, { 
                    status: 'active',
                    startedAt: new Date().toISOString()
                });
                
                reply.send({
                    success: true,
                    message: `${gameMode} game started successfully`,
                    gameId: gameId,
                    mode: gameMode
                });
                
            } catch (engineError) {
                console.error('Failed to start game engine:', engineError);
                reply.code(500).send({
                    success: false,
                    message: `Failed to start game engine: ${engineError instanceof Error ? engineError.message : 'Unknown error'}`
                });
                return;
            }
            
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                message: 'Failed to start game'
            });
        }
    });

    // Pause game engine
    fastify.post('/:id/pause', async (request, reply) => {
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
                    message: 'No active game found'
                });
                return;
            }
            
            gameEngine.pauseGame();
            activeGames.delete(gameId);
            
            // Update game status in database
            database.games.updateGame(gameId, { 
                status: 'paused' 
            });
            
            return {
                success: true,
                message: 'Game paused successfully',
                gameId: gameId
            };
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                message: 'Failed to pause game'
            });
        }
    });

    // End game engine
    fastify.post('/:id/end', async (request, reply) => {
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
                    message: 'No active game found'
                });
                return;
            }
            
            // End the game (this resets everything)
            gameEngine.endGame();
            
            // Remove from active games so next start creates fresh instance
            activeGames.delete(gameId);
            
            // Update game status in database to 'waiting' so it can be started again
            database.games.updateGame(gameId, { 
                status: 'waiting',
                endedAt: new Date().toISOString()
            });
            
            return {
                success: true,
                message: 'Game ended and reset - ready for new game',
                gameId: gameId
            };
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                message: 'Failed to end game'
            });
        }
    });

    // Set winner endpoint
    fastify.post('/:id/winner', async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const gameId = parseInt(id);
            const { winnerId } = request.body as { winnerId: number };
            
            if (isNaN(gameId)) {
                reply.code(400).send({
                    success: false,
                    message: 'Invalid game ID'
                });
                return;
            }
            
            if (!winnerId || isNaN(winnerId)) {
                reply.code(400).send({
                    success: false,
                    message: 'Invalid winner ID'
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
            
            // Check if winner is a real user (not AI/guest)
            const winnerUser = database.users.getUserById(winnerId);
            
            // Update game with winner (only set winnerId if it's a real user to avoid FK constraint)
            const updateData: any = { 
                status: 'finished',
                endedAt: new Date().toISOString()
            };
            
            // Only set winnerId if winner exists in users table
            if (winnerUser) {
                updateData.winnerId = winnerId;
            }
            
            database.games.updateGame(gameId, updateData);
            
            // Clean up active game if exists
            const gameEngine = activeGames.get(gameId);
            if (gameEngine) {
                gameEngine.endGame();
                activeGames.delete(gameId);
            }
            
            return {
                success: true,
                message: 'Winner recorded successfully',
                gameId: gameId,
                winnerId: winnerId,
                winnerInDatabase: !!winnerUser
            };
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                message: 'Failed to record winner'
            });
        }
    });

    fastify.get('/:id/mode', async (request, reply) => {
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
            
            const gameEngine = activeGames.get(gameId);
            
            reply.send({
                success: true,
                data: {
                    gameId: gameId,
                    mode: game.mode,
                    isActive: !!gameEngine,
                    isRunning: gameEngine ? gameEngine.isRunning() : false
                }
            });
            
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                message: 'Failed to get game mode'
            });
        }
    });

    // Update player position
    fastify.put('/:id/player/:playerId/position', async (request, reply) => {
        try {
            const { id, playerId } = request.params as { id: string; playerId: string };
            const gameId = parseInt(id);
            const playerIdNum = parseInt(playerId);
            const { position } = request.body as { position: number };
            
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
                    message: 'Game not active'
                });
                return;
            }
            
            // Delegate to engine's unified update method
            gameEngine.updatePlayerPosition(playerIdNum, position);
            
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
}
export default gameRoutes;
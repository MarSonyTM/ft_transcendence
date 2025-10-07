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

// Store active game engines
const activeGames = new Map<number, BaseGameEngine>();

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
            
            // Check if game engine is active (live data)
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
                ballX: gameState.ballPosX || 0,
                ballY: gameState.ballPosY || 0,
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

    // ==== Get player positions for specific game ====
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
                return {
                    success: true,
                    player1Pos: gameEngine.getPlayer1Position(),
                    player2Pos: gameEngine.getPlayer2Position(),
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
                player1Pos: gameState.player1Pos || 0,
                player2Pos: gameState.player2Pos || 0,
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

    // Get full game state
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
            
            // Check if game engine is active (live data)
            const gameEngine = activeGames.get(gameId);
            if (gameEngine) {
                return {
                    success: true,
                    data: gameEngine.getCurrentState(),
                    isLive: true,
                    isRunning: gameEngine.isRunning()
                };
            }
            
            // If not active, get from database
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
                
                // Create game state using direct database insert (bypasses validation)
                try {
                    const stmt = database['db'].prepare(`
                        INSERT INTO gameState (
                            gameId, player1Id, player2Id, player3Id, player4Id,
                            ballPosX, ballPosY, ballVelX, ballVelY, 
                            player1Pos, player2Pos, scorePlayer1, scorePlayer2
                        ) 
                        VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 0, 0, 0)
                    `);
                    
                    stmt.run(gameId, userId, userId, userId, userId);
                    
                    gameState = database.gameState.getGameStateByGameId(gameId);
                    
                    if (!gameState) {
                        throw new Error('Failed to retrieve created game state');
                    }
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
                const gameMode = game.mode || '1v1';
                const gameEngine = createGameEngine(gameState, gameMode);
                activeGames.set(gameId, gameEngine);
                gameEngine.startGame();
                
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
                    message: `Failed to start game engine`
                });
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
            
            // Get the game state to determine which player this is
            const gameState = gameEngine.getCurrentState();
            
            if (playerIdNum === gameState.player1Id) {
                gameEngine.updatePlayer1Position(position);
            } else if (playerIdNum === gameState.player2Id) {
                gameEngine.updatePlayer2Position(position);
            } else {
                reply.code(400).send({
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

    // Join game
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
            
            // Determine position
            const position = currentPlayers.length === 0 ? 'left' : 'right';
            
            // Add player to game
            const gamePlayer = database.players.addPlayerToGame(gameId, playerId, position);
            
            // Create game state when we have 2 players
            if (currentPlayers.length === 1) {
                // Get both players
                const allPlayers = database.players.getPlayers(gameId);
                const player1 = allPlayers.find(p => p.playerPosition === 'left');
                const player2 = allPlayers.find(p => p.playerPosition === 'right');
                
                if (player1 && player2) {
                    // Create initial game state
                    database.gameState.createGameState({
                        gameId: gameId,
                        player1Id: player1.playerId,
                        player2Id: player2.playerId
                    });
                    
                    // Update game status
                    database.games.updateGame(gameId, { status: 'ready' });
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
            
            if (!winnerId || isNaN(winnerId)) {
                reply.code(400).send({
                    success: false,
                    message: 'Invalid winner ID - must be 1 or 2'
                });
                return;
            }
            
            // Get the game
            const game = database.games.getGameById(gameId);
            if (!game) {
                reply.code(404).send({
                    success: false,
                    message: 'Game not found'
                });
                return;
            }
            
            // Get the game state to find actual player IDs
            const gameState = database.gameState.getGameStateByGameId(gameId);
            if (!gameState) {
                reply.code(404).send({
                    success: false,
                    message: 'Game state not found'
                });
                return;
            }
            
            // Map the winnerId (1 or 2) to actual database player ID
            let actualWinnerId: number;
            if (winnerId === 1) {
                actualWinnerId = gameState.player1Id;
            } else if (winnerId === 2) {
                actualWinnerId = gameState.player2Id;
            } else {
                reply.code(400).send({
                    success: false,
                    message: 'Winner ID must be 1 or 2'
                });
                return;
            }
            
            // Update the game with winner ID and mark as finished
            const updatedGame = database.games.updateGame(gameId, { 
                status: 'finished',
                winnerId: actualWinnerId,
                endedAt: new Date().toISOString()
            });
            
            if (!updatedGame) {
                reply.code(500).send({
                    success: false,
                    message: 'Failed to update game'
                });
                return;
            }
            
            // Increment gamesWon for winner
            database.users.updateUserStats(actualWinnerId, true);
            
            // Increment gamesLost for loser
            const loserId = winnerId === 1 ? gameState.player2Id : gameState.player1Id;
            database.users.updateUserStats(loserId, false);
            
            fastify.log.info(`Game ${gameId} winner set to player ${winnerId} (user ID: ${actualWinnerId})`);
            fastify.log.info(`Updated stats: Winner ${actualWinnerId} +1 win, Loser ${loserId} +1 loss`);
            
            return {
                success: true,
                message: 'Winner updated successfully',
                gameId: gameId,
                winnerId: actualWinnerId,
                winnerPosition: winnerId
            };
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                message: 'Failed to update winner'
            });
        }
    });
}

export { activeGames };
export default gameRoutes;
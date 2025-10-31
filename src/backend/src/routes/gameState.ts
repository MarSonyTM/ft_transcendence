import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { GameState } from '../game/gameState';
import { database, Player } from '../database/index';

// Types
export interface CreateGameStateInput {
    gameId: number;
}

export interface UpdateGameStateInput {
    ballPosX?: number;
    ballPosY?: number;
    ballVelX?: number;
    ballVelY?: number;
}

// Plugin function that registers all game state routes
async function gameStateRoutes(fastify: FastifyInstance, options: FastifyPluginOptions) {
    
    // ==== Get all game states ====
    // Example: curl localhost:3000/gamestate
    fastify.get('/', async (request, reply) => {
        try {
            const gameStates = database.gameState.getAllGameStates();
            return {
                success: true,
                count: gameStates.length,
                data: gameStates
            };
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                message: 'Failed to fetch game states'
            });
        }
    });
    
    // ==== Get game state by ID ====
    // Example: curl localhost:3000/gamestate/1
    fastify.get('/:id', async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const gameStateId = parseInt(id);
            
            if (isNaN(gameStateId)) {
                reply.code(400).send({
                    success: false,
                    message: 'Invalid game state ID'
                });
                return;
            }
            
            const gameState = database.gameState.getGameStateById(gameStateId);
            
            if (!gameState) {
                reply.code(404).send({
                    success: false,
                    message: 'Game state not found'
                });
                return;
            }
            
            return {
                success: true,
                data: gameState
            };
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                message: 'Failed to fetch game state'
            });
        }
    });

    fastify.get('/game/:gameId', async (request, reply) => {
        try {
            const { gameId } = request.params as { gameId: string };
            const gameIdNum = parseInt(gameId);
            
            // Add debugging logs
            fastify.log.info(`Looking for game with ID: ${gameIdNum}`);
            
            if (isNaN(gameIdNum)) {
                reply.code(400).send({
                    success: false,
                    message: 'Invalid game ID'
                });
                return;
            }
            
            // Check if game exists
            const game = database.games.getGameById(gameIdNum);
            fastify.log.info(`Game found: ${game ? 'YES' : 'NO'}`);
            
            if (!game) {
                // Add more info about available games
                const allGames = database.games.getAllGames ? database.games.getAllGames() : [];
                fastify.log.info(`Available games: ${allGames.map(g => g.id).join(', ')}`);
                
                reply.code(404).send({
                    success: false,
                    message: `Game ${gameIdNum} not found. Available games: ${allGames.map(g => g.id).join(', ')}`
                });
                return;
            }
            
            const gameState = database.gameState.getGameStateByGameId(gameIdNum);
            fastify.log.info(`Game state found: ${gameState ? 'YES' : 'NO'}`);
            
            if (!gameState) {
                // Create a default game state if none exists
                fastify.log.info(`Creating default game state for game ${gameIdNum}`);
                
                const defaultGameState = {
                    gameId: gameIdNum,
                    players: [] as Player[],
                    ballPosX: 200,
                    ballPosY: game.mode === '4P' ? 200 : 100,
                    ballVelX: 0,
                    ballVelY: 0,
                    mode: game.mode || '2P',
                    lastActivity: new Date().toISOString()
                };
                
                // Try to create the game state
                try {
                    const newGameState = database.gameState.createGameState(defaultGameState);
                    return {
                        success: true,
                        data: newGameState,
                        message: 'Created default game state'
                    };
                } catch (createError) {
                    reply.code(404).send({
                        success: false,
                        message: 'Game state not found and could not create default state'
                    });
                    return;
                }
            }
            
            return {
                success: true,
                data: gameState
            };
        } catch (error) {
            fastify.log.error({ err: error }, 'Route error');
            reply.code(500).send({
                success: false,
                message: 'Failed to fetch game state for game'
            });
        }
    });

    // ==== Create new game state ====
    // Example: curl -X POST http://localhost:3000/gamestate -H "Content-Type: application/json" -d '{ "gameId": 1, "player1Id": 1, "player2Id": 2 }'
    fastify.post('/', async (request, reply) => {
        try {
            const gameStateData = request.body as CreateGameStateInput;
            
            // Basic validation
            if (!gameStateData.gameId) {
                reply.code(400).send({
                    success: false,
                    message: 'gameId is required'
                });
                return;
            }
            
            // Check if game exists
            const game = database.games.getGameById(gameStateData.gameId);
            if (!game) {
                reply.code(404).send({
                    success: false,
                    message: 'Game not found'
                });
                return;
            }
            
            // Check if game state already exists for this game
            const existingGameState = database.gameState.getGameStateByGameId(gameStateData.gameId);
            if (existingGameState) {
                reply.code(409).send({
                    success: false,
                    message: 'Game state already exists for this game'
                });
                return;
            }
            
            const newGameState = database.gameState.createGameState({ gameId: gameStateData.gameId});//, players: [], ballPosX: 200, ballPosY: game.mode === '4P' ? 200 : 100, ballVelX: 0, ballVelY: 0, mode: game.mode || '2P' });
            
            reply.code(201).send({
                success: true,
                message: 'Game state created successfully',
                data: newGameState
            });
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                message: 'Failed to create game state'
            });
        }
    });

    // ==== Update game state ====
    // Example: curl -X PUT http://localhost:3000/gamestate/1 -H "Content-Type: application/json" -d '{ "ballPosX": 100, "ballPosY": 50, "player1Pos": 200 }'
    fastify.put('/:id', async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const gameStateId = parseInt(id);
            const updateData = request.body as UpdateGameStateInput;
            
            if (isNaN(gameStateId)) {
                reply.code(400).send({
                    success: false,
                    message: 'Invalid game state ID'
                });
                return;
            }
            
            const updatedGameState = database.gameState.updateGameStateByGameId(gameStateId, updateData);
            
            if (!updatedGameState) {
                reply.code(404).send({
                    success: false,
                    message: 'Game state not found'
                });
                return;
            }
            
            return {
                success: true,
                message: 'Game state updated successfully',
                data: updatedGameState
            };
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                message: 'Failed to update game state'
            });
        }
    });

    // ==== Delete game state ====
    // Example: curl -X DELETE http://localhost:3000/gamestate/1
    fastify.delete('/:id', async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const gameStateId = parseInt(id);
            
            if (isNaN(gameStateId)) {
                reply.code(400).send({
                    success: false,
                    message: 'Invalid game state ID'
                });
                return;
            }
            
            const deleted = database.gameState.deleteGameState(gameStateId);
            
            if (!deleted) {
                reply.code(404).send({
                    success: false,
                    message: 'Game state not found'
                });
                return;
            }
            
            return {
                success: true,
                message: 'Game state deleted successfully'
            };
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                message: 'Failed to delete game state'
            });
        }
    });

    // ==== Delete game state by game ID ====
    // Example: curl -X DELETE http://localhost:3000/gamestate/game/1
    fastify.delete('/game/:gameId', async (request, reply) => {
        try {
            const { gameId } = request.params as { gameId: string };
            const gameIdNum = parseInt(gameId);
            
            if (isNaN(gameIdNum)) {
                reply.code(400).send({
                    success: false,
                    message: 'Invalid game ID'
                });
                return;
            }
            
            const deleted = database.gameState.deleteGameStateByGameId(gameIdNum);
            
            if (!deleted) {
                reply.code(404).send({
                    success: false,
                    message: 'No game state found for this game'
                });
                return;
            }
            
            return {
                success: true,
                message: 'Game state deleted successfully for game'
            };
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                message: 'Failed to delete game state for game'
            });
        }
    });

    // Get ball pos for specific game
    fastify.get('/game/:gameId/ball-position', async (request, reply) => {
        try {
            const { gameId } = request.params as { gameId: string };
            const gameIdNum = parseInt(gameId);
            
            if (isNaN(gameIdNum)) {
                reply.code(400).send({
                    success: false,
                    message: 'Invalid game ID'
                });
                return;
            }
            
            // Get game state from database
            const gameState = database.gameState.getGameStateByGameId(gameIdNum);
            
            if (!gameState) {
                reply.code(404).send({
                    success: false,
                    message: 'Game state not found'
                });
                return;
            }
            
            return {
                success: true,
                ballX: gameState.ballPosX, // Direct access to properties from database
                ballY: gameState.ballPosY
            };
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                message: 'Failed to get ball position'
            });
        }
    });

    // Get score for specific game
    fastify.get('/:id/score', async (request, reply) => {
        const { id } = request.params as { id: number };
        const gameStateInstance = database.gameState.getGameStateByGameId(id);
        if (!gameStateInstance) {
            reply.code(404).send({
                success: false,
                message: 'Game state not found'
            });
            return;
        }
        return {
            success: true,
            scorePlayer1: gameStateInstance.players[0].score,
            scorePlayer2: gameStateInstance.players[1].score,
            scorePlayer3: gameStateInstance.players[2]?.score || 0,
            scorePlayer4: gameStateInstance.players[3]?.score || 0
        };
    });

    // Get full gameState
    fastify.get('/game/:gameId/state', async (request, reply) => {
        try {
            const { gameId } = request.params as { gameId: string };
            const gameIdNum = parseInt(gameId);
            
            if (isNaN(gameIdNum)) {
                reply.code(400).send({
                    success: false,
                    message: 'Invalid game ID'
                });
                return;
            }
            
            // Get game state from database
            const gameStateData = database.gameState.getGameStateByGameId(gameIdNum);
            
            if (!gameStateData) {
                reply.code(404).send({
                    success: false,
                    message: 'Game state not found'
                });
                return;
            }
            
            // Create GameState instance and populate it with data
            return {
                success: true,
                data: {
                    ballPosX: gameStateData.ballPosX,
                    ballPosY: gameStateData.ballPosY,
                    ballVelX: gameStateData.ballVelX ?? 0,
                    ballVelY: gameStateData.ballVelY ?? 0,
                    players: gameStateData.players,
                    gameId: gameStateData.gameId,
                    mode: gameStateData.mode,
                    lastContact: gameStateData.lastContact || 0
                }
            };
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                message: 'Failed to get gamestate'
            });
        }
    });

    

}

export default gameStateRoutes;

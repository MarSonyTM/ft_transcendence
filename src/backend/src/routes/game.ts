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
                data: games  // ✅ Use games as-is, don't overwrite players field
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
            
            return {
                success: true,
                data: game
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
            console.warn("!!!!!!!!!!HERE")
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
                        ballPosY: gameData.mode === '4P' ? 200 : 100,
                        ballVelX: 0,
                        ballVelY: 0,
                        players: [{
                            id: 0,
                            name: `${userId}`, 
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
            
            const game = database.games.getGameById(gameId);
            if (!game) {
                console.log(`❌ Game ${gameId} not found`);
                reply.code(404).send({
                    success: false,
                    message: 'Game not found'
                });
                return;
            }
            
            let gamePlayers = database.players.getPlayers(gameId);
            
            if (gamePlayers.length === 0) {
                const gameEngine = activeGames.get(gameId);
                
                if (gameEngine) {
                    const currentState = gameEngine.getCurrentState();
                    
                    if (currentState && currentState.players) {
                        
                        gamePlayers = currentState.players.map((player: any, index: number) => {
                            const positionId = index + 1; // Position ID (1-based)
                            
                            // Check if this position is an AI player via the game engine
                            const isAI = gameEngine.isPlayerAI(positionId) || player.isAI || (player.name && player.name.toLowerCase().includes('ai'));
                            
                            // Determine player name and user ID
                            let actualUserId = positionId; // Default fallback
                            let playerName = player.name || player.username;
                            
                            if (isAI) {
                                // For AI players, use special ID and format name
                                actualUserId = 9000 + positionId;
                                const difficulty = player.difficulty || 'Normal';
                                const difficultyCapitalized = difficulty.charAt(0).toUpperCase() + difficulty.slice(1).toLowerCase();
                                playerName = `AI Bot (${difficultyCapitalized})`;
                                console.log(`   🤖 AI Player detected at position ${positionId}`);
                            } else if (player.username) {
                                // Real player - find by username
                                const userByUsername = database.users.getAllUsers().find(
                                    u => u.username === player.username
                                );
                                
                                if (userByUsername) {
                                    actualUserId = userByUsername.id;
                                }
                            } else if (player.id && typeof player.id === 'number') {
                                // Try using player.id for real players
                                const userById = database.users.getUserById(player.id);
                                if (userById) {
                                    actualUserId = player.id;
                                    console.log(`   ✅ Found user by ID ${player.id}`);
                                }
                            } else if (player.id && typeof player.id === 'number') {
                                // Try using player.id for real players
                                const userById = database.users.getUserById(player.id);
                                if (userById) {
                                    actualUserId = player.id;
                                    console.log(`   ✅ Found user by ID ${player.id}`);
                                }
                            }
                            
                            return {
                                id: actualUserId || -(index + 1),
                                gameId: gameId,
                                playerId: actualUserId,
                                playerPosition: index === 0 ? 'left' : 'right',
                                score: player.score || 0,
                                connectionStatus: 'connected',
                                lastActivity: new Date().toISOString(),
                                pos: player.pos || 0,
                                color: player.color || { r: 255, g: 255, b: 255 },
                                name: playerName,
                                username: playerName,
                                isAI: isAI,
                                difficulty: player.difficulty || undefined
                            };
                        });                    
                    } else {
                        console.log(`❌ No players in game engine state`);
                    }
                } else {
                    console.log(`❌ Game engine not found. Active games: ${Array.from(activeGames.keys())}`);
                }
            }
            
            // Build players data for saving
            // Build the players array with usernames
            const playersData = gamePlayers.map((player: any) => {
                let displayName = '';
                
                // Special handling for local players (playerId: "local")
                if (player.playerId === 'local' || player.playerId === 'Local') {
                    displayName = player.name || 'Local Player';
                } 
                // Special handling for AI players
                else if (player.name && (player.name.toLowerCase().includes('ai') || player.name.toLowerCase().includes('bot'))) {
                    const difficulty = player.difficulty || 'Normal';
                    displayName = `AI Bot (${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)})`;
                }
                // Try to look up registered user
                else {
                    const user = database.users.getUserById(player.playerId);
                    
                    if (user) {
                        // Registered user - use their username
                        displayName = user.username;
                    } else if (player.name) {
                        // Fallback to player.name if no user found
                        displayName = player.name;
                    } else {
                        displayName = `Player ${player.playerId}`;
                    }
                }
                
                return {
                    id: player.playerId.toString(),
                    username: displayName,
                    score: player.score || 0,
                    position: player.playerPosition || 'unknown'
                };
            });
            
            console.log(`✅ Final players data:`, JSON.stringify(playersData, null, 2));
            
            const winnerUser = database.users.getUserById(winnerId);
            
            const updateData: any = { 
                status: 'finished',
                endedAt: new Date().toISOString(),
                players: playersData
            };
            
            if (winnerUser) {
                updateData.winnerId = winnerId;
                updateData.winner = winnerUser.username;
            } else {
                updateData.winner = `Player ${winnerId}`; 
            }
            
            database.games.updateGame(gameId, updateData);
            
            return {
                success: true,
                message: 'Winner recorded successfully',
                gameId: gameId,
                winnerId: winnerId,
                winnerName: updateData.winner,
                playersRecorded: playersData.length
            };
        } catch (error) {
            console.error(`❌ Error in winner endpoint:`, error);
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                message: 'Failed to set winner'
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

    // Clear all games (for testing/development)
    fastify.delete('/clear-all', async (request, reply) => {
        try {
            // Delete all game states
            const gameStates = database.gameState.getAllGameStates();
            gameStates.forEach(gs => {
                database.gameState.deleteGameState(gs.id);
            });
            
            // Delete all players
            const allGames = database.games.getAllGames();
            allGames.forEach(game => {
                const players = database.players.getPlayers(game.id);
                players.forEach(player => {
                    database.players.removePlayerFromGame(game.id, player.id);
                });
            });
            
            // Delete all games
            allGames.forEach(game => {
                database.games.deleteGame(game.id);
            });
            
            // Reset user statistics
            const users = database.users.getAllUsers();
            users.forEach(user => {
                database.users.updateUser(user.id, {
                    gamesWon: 0,
                    gamesLost: 0
                } as any);
            });
            
            return {
                success: true,
                message: 'All game data cleared successfully',
                gamesDeleted: allGames.length,
                gameStatesDeleted: gameStates.length
            };
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                message: 'Failed to clear game data'
            });
        }
    });
}
export default gameRoutes;

// src/routes/players.ts
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { database } from '../database/index';

// Types
export interface CreatePlayerInput {
    gameId: number;
    playerId: number;
    playerPosition: 'left' | 'top' | 'right' | 'bottom';
}

export interface UpdatePlayerInput {
    currentScore?: number;
    connectionStatus?: string;
    playerPosition?: 'left' | 'top' | 'right' | 'bottom';
}

// Plugin function that registers all player routes
async function playerRoutes(fastify: FastifyInstance, options: FastifyPluginOptions) {
    
    // ==== Get all players ====
    // Example: curl localhost:3000/players
    fastify.get('/', async (request, reply) => {
        try {
            // Get all players from all games
            const allGames = database.games.getAllGames();
            const allPlayers = [];
            
            for (const game of allGames) {
                const gamePlayers = database.players.getPlayers(game.id);
                allPlayers.push(...gamePlayers);
            }
            
            return {
                success: true,
                count: allPlayers.length,
                data: allPlayers
            };
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                message: 'Failed to fetch players'
            });
        }
    });
    
    // ==== Get player by ID ====
    // Example: curl localhost:3000/players/1
    fastify.get('/:id', async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const playerId = parseInt(id);
            
            if (isNaN(playerId)) {
                reply.code(400).send({
                    success: false,
                    message: 'Invalid player ID'
                });
                return;
            }
            
            // Since we don't have a direct player table, we need to search through game_players
            const allGames = database.games.getAllGames();
            let foundPlayer: any = null;
            
            for (const game of allGames) {
                const gamePlayers = database.players.getPlayers(game.id);
                foundPlayer = gamePlayers.find((p) => p.id === playerId);
                if (foundPlayer) break;
            }
            
            if (!foundPlayer) {
                reply.code(404).send({
                    success: false,
                    message: 'Player not found'
                });
                return;
            }
            
            return {
                success: true,
                data: foundPlayer
            };
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                message: 'Failed to fetch player'
            });
        }
    });

    // ==== Get players by game ID ====
    // Example: curl localhost:3000/players/game/1
    fastify.get('/game/:gameId', async (request, reply) => {
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
            
            // Check if game exists
            const game = database.games.getGameById(gameIdNum);
            if (!game) {
                reply.code(404).send({
                    success: false,
                    message: 'Game not found'
                });
                return;
            }
            
            const players = database.players.getPlayers(gameIdNum);
            
            return {
                success: true,
                count: players.length,
                data: players
            };
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                message: 'Failed to fetch players for game'
            });
        }
    });

    // ==== Get players by user ID ====
    // Example: curl localhost:3000/players/user/1
    fastify.get('/user/:userId', async (request, reply) => {
        try {
            const { userId } = request.params as { userId: string };
            const userIdNum = parseInt(userId);
            
            if (isNaN(userIdNum)) {
                reply.code(400).send({
                    success: false,
                    message: 'Invalid user ID'
                });
                return;
            }
            
            // Check if user exists
            const user = database.users.getUserById(userIdNum);
            if (!user) {
                reply.code(404).send({
                    success: false,
                    message: 'User not found'
                });
                return;
            }
            
            // Find all games where this user is a player
            const allGames = database.games.getAllGames();
            const userPlayers = [];
            
            for (const game of allGames) {
                const gamePlayers = database.players.getPlayers(game.id);
                const userGamePlayers = gamePlayers.filter((p) => p.id === userIdNum);
                userPlayers.push(...userGamePlayers);
            }
            
            return {
                success: true,
                count: userPlayers.length,
                data: userPlayers
            };
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                message: 'Failed to fetch players for user'
            });
        }
    });

    // ==== Add player to game ====
    // Example: curl -X POST http://localhost:3000/players -H "Content-Type: application/json" -d '{ "gameId": 1, "playerId": 1, "playerPosition": "left" }'
    fastify.post('/', async (request, reply) => {
        try {
            const playerData = request.body as CreatePlayerInput;
            
            // Basic validation
            if (!playerData.gameId || !playerData.playerId || !playerData.playerPosition) {
                reply.code(400).send({
                    success: false,
                    message: 'gameId, playerId, and playerPosition are required'
                });
                return;
            }
            
            // Check if game exists
            const game = database.games.getGameById(playerData.gameId);
            if (!game) {
                reply.code(404).send({
                    success: false,
                    message: 'Game not found'
                });
                return;
            }
            
            // Check if user exists
            const user = database.users.getUserById(playerData.playerId);
            if (!user) {
                reply.code(404).send({
                    success: false,
                    message: 'User not found'
                });
                return;
            }
            
            // Check if game is full
            const currentPlayers = database.players.getPlayers(playerData.gameId);
            const is4P = game.mode === '4P';
            const capacity = is4P ? 4 : 2;
            if (currentPlayers.length >= capacity) {
                reply.code(400).send({
                    success: false,
                    message: 'Game is full'
                });
                return;
            }
            
            // Check if player is already in this game
            const existingPlayer = currentPlayers.find((p) => p.id === playerData.playerId);
            if (existingPlayer) {
                reply.code(400).send({
                    success: false,
                    message: 'Player is already in this game'
                });
                return;
            }

            // Check if requested seat is already taken
            const seatTaken = (currentPlayers as any[]).some((p) => (p as any).playerPosition === playerData.playerPosition);
            if (seatTaken) {
                reply.code(400).send({
                    success: false,
                    message: `Seat '${playerData.playerPosition}' is already taken`
                });
                return;
            }
            
            // Add player to game
            const newPlayer = database.players.addPlayerToGame(
                playerData.gameId,
                playerData.playerId,
                playerData.playerPosition
            );
            
            // Update game status if needed
            if (!is4P && currentPlayers.length === 1) {
                database.games.updateGame(playerData.gameId, { status: 'ready' });
            } else if (is4P && currentPlayers.length === 3) {
                database.games.updateGame(playerData.gameId, { status: 'ready' });
            }
            
            reply.code(201).send({
                success: true,
                message: 'Player added to game successfully',
                data: newPlayer
            });
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                message: 'Failed to add player to game'
            });
        }
    });

    // ==== Update player ====
    // Example: curl -X PUT http://localhost:3000/players/1 -H "Content-Type: application/json" -d '{ "currentScore": 5, "connectionStatus": "connected" }'
    fastify.put('/:id', async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const playerId = parseInt(id);
            const updateData = request.body as UpdatePlayerInput;
            
            if (isNaN(playerId)) {
                reply.code(400).send({
                    success: false,
                    message: 'Invalid player ID'
                });
                return;
            }
            
            try {
                // Find the game this player is in
                const allGames = database.games.getAllGames();
                let playerGameId = null;
                
                for (const game of allGames) {
                    const gamePlayers = database.players.getPlayers(game.id);
                    const foundPlayer = gamePlayers.find((p) => p.id === playerId);
                    if (foundPlayer) {
                        playerGameId = game.id;
                        break;
                    }
                }
                
                if (!playerGameId) {
                    reply.code(404).send({
                        success: false,
                        message: 'Player not found in any active game'
                    });
                    return;
                }
                
                // Update the player using the actual player ID (which is the user ID)
                const gamePlayers = database.players.getPlayers(playerGameId);
                const playerRecord = gamePlayers.find((p) => p.id === playerId);
                
                if (!playerRecord) {
                    reply.code(404).send({
                        success: false,
                        message: 'Player not found'
                    });
                    return;
                }

                // Validate seat change against mode and seat availability
                if (updateData.playerPosition) {
                    const game = database.games.getGameById(playerGameId);
                    const is4P = game?.mode === '4P';
                    const allowedPositions = is4P ? ['left', 'top', 'right', 'bottom'] : ['left', 'right'];
                    if (!allowedPositions.includes(updateData.playerPosition)) {
                        reply.code(400).send({
                            success: false,
                            message: `Invalid playerPosition for mode ${game?.mode}. Allowed: ${allowedPositions.join(', ')}`
                        });
                        return;
                    }
                    const seatTaken = (gamePlayers as any[]).some((p) => (p as any).playerPosition === updateData.playerPosition && (p as any).id !== playerId);
                    if (seatTaken) {
                        reply.code(400).send({
                            success: false,
                            message: `Seat '${updateData.playerPosition}' is already taken`
                        });
                        return;
                    }
                }
                
                const updatedPlayer = database.players.updatePlayer(
                    (playerRecord as any).playerId,
                    playerGameId, 
                    updateData
                );
                
                if (!updatedPlayer) {
                    reply.code(404).send({
                        success: false,
                        message: 'Failed to update player'
                    });
                    return;
                }
                
                return {
                    success: true,
                    message: 'Player updated successfully',
                    data: updatedPlayer
                };
            } catch (error) {
                fastify.log.error(error);
                reply.code(500).send({
                    success: false,
                    message: 'Failed to update player'
                });
            }
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                message: 'Failed to update player'
            });
        }
    });

    // ==== Remove player from game ====
    // Example: curl -X DELETE http://localhost:3000/players/1
    fastify.delete('/:id', async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const playerId = parseInt(id);
            
            if (isNaN(playerId)) {
                reply.code(400).send({
                    success: false,
                    message: 'Invalid player ID'
                });
                return;
            }

            try {
                // Find the game this player is in
                const allGames = database.games.getAllGames();
                let playerGameId = null;
                let playerUserId = null;
                
                for (const game of allGames) {
                    const gamePlayers = database.players.getPlayers(game.id);
                    const foundPlayer = gamePlayers.find((p) => p.id === playerId);
                    if (foundPlayer) {
                        playerGameId = game.id;
                        playerUserId = (foundPlayer as any).playerId;
                        break;
                    }
                }
                
                if (!playerGameId || !playerUserId) {
                    reply.code(404).send({
                        success: false,
                        message: 'Player not found in any active game'
                    });
                    return;
                }
                
                const removed = database.players.removePlayerFromGame(playerUserId, playerGameId);
                
                if (!removed) {
                    reply.code(404).send({
                        success: false,
                        message: 'Failed to remove player from game'
                    });
                    return;
                }
                
                return {
                    success: true,
                    message: 'Player removed from game successfully'
                };
            } catch (error) {
                fastify.log.error(error);
                reply.code(500).send({
                    success: false,
                    message: 'Failed to remove player'
                });
            }
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                message: 'Failed to remove player'
            });
        }
    });

    // ==== Get player statistics ====
    // Example: curl localhost:3000/players/1/stats
    fastify.get('/:id/stats', async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const playerId = parseInt(id);
            
            if (isNaN(playerId)) {
                reply.code(400).send({
                    success: false,
                    message: 'Invalid player ID'
                });
                return;
            }
            
            // Check if user exists
            const user = database.users.getUserById(playerId);
            if (!user) {
                reply.code(404).send({
                    success: false,
                    message: 'User not found'
                });
                return;
            }
            
            // Get all games where this user participated
            const allGames = database.games.getAllGames();
            const playerGames = [];
            let totalScore = 0;
            let gamesWon = 0;
            let gamesLost = 0;
            
            for (const game of allGames) {
                const gamePlayers = database.players.getPlayers(game.id);
                const userInGame = gamePlayers.find((p) => p.id === playerId);
                
                if (userInGame) {
                    playerGames.push({
                        gameId: game.id,
                        playerPosition: (userInGame as any).playerPosition,
                        currentScore: (userInGame as any).score,
                    });
                    
                    totalScore += (userInGame as any).score || 0;
                }
            }
            
            return {
                success: true,
                data: {
                    playerId: playerId,
                    playerName: `${user.firstName} ${user.lastName}`,
                    totalGames: playerGames.length,
                    gamesWon: gamesWon,
                    gamesLost: gamesLost,
                    totalScore: totalScore,
                    averageScore: playerGames.length > 0 ? totalScore / playerGames.length : 0,
                    games: playerGames
                }
            };
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                message: 'Failed to fetch player statistics'
            });
        }
    });
}

export default playerRoutes;
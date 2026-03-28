import { FastifyInstance } from 'fastify';
import { activeGames } from '../routes/game';
import { broadcastGameStateToMatch, broadcastScoreToMatch, broadcastGameEndToMatch } from './tournamentHandler';

const gameConnections = new Map<number, Set<any>>();
const gameToMatchMap = new Map<number, number>();

export function registerTournamentGame(gameId: number, matchId: number): void {
    console.log(`📝 Registered tournament game ${gameId} -> match ${matchId}`);
    gameToMatchMap.set(gameId, matchId);
}
export function unregisterTournamentGame(gameId: number): void {
    console.log(`🗑️ Unregistered tournament game ${gameId}`);
    gameToMatchMap.delete(gameId);
}

// Register WebSocket routes
async function webSocketRoutes(fastify: FastifyInstance) {
    (fastify as any).register(async function (fastify: any) {
        fastify.get('/game/:gameId/ws', { websocket: true }, (connection: any, req: any) => {
            const { gameId } = req.params;
            const gameIdNum = parseInt(gameId);
            
            if (isNaN(gameIdNum)) {
                if (connection.socket) {
                    connection.socket.close(1008, 'Invalid game ID');
                } else if (connection.close) {
                    connection.close();
                } else if (connection.ws) {
                    connection.ws.close(1008, 'Invalid game ID');
                }
                return;
            }

            let socket = connection;
            if (!socket) return;
            
            if (!gameConnections.has(gameIdNum)) {
                gameConnections.set(gameIdNum, new Set());
            }
            gameConnections.get(gameIdNum)!.add(socket);

            if (typeof socket.on === 'function') {
                socket.on('message', (data: any) => {
                    try {
                        const message = JSON.parse(data.toString());
                  
                        switch (message.type) {
                            case 'ping':
                                if (typeof socket.send === 'function') {
                                    socket.send(JSON.stringify({ type: 'pong' }));
                                }
                                break;
                      
                            case 'move':
                                if (typeof message.position === 'number') {
                                    const playerId = typeof message.playerId === 'number' ? message.playerId : 1;
                                    handlePlayerMove(gameIdNum, playerId, message.position);
                                }
                                break;
                    
                            case 'score':
                                const gameEngine = activeGames.get(gameIdNum);
                                if (gameEngine) {
                                    const currentState = gameEngine.getCurrentState();
                                    socket.send(JSON.stringify({
                                        type: 'score',
                                        players: currentState.players,
                                        mode: (currentState as any).mode || '2P'
                                    }));
                                }
                                break;
                        }
                    } catch {} 
                });

                socket.on('close', () => {
                    removeSocketFromGame(gameIdNum, socket);
                });

                socket.on('error', (error: any) => {
                    removeSocketFromGame(gameIdNum, socket);
                });
            }

            if (typeof socket.send === 'function') {
                socket.send(JSON.stringify({
                    type: 'connected',
                    gameId: gameIdNum,
                    message: 'Connected to game successfully'
                }));
            }
        });
    });
}

function removeSocketFromGame(gameId: number, socket: any) {
    const connections = gameConnections.get(gameId);
    if (connections) {
        connections.delete(socket);
        if (connections.size === 0) {
            gameConnections.delete(gameId);
        }
    }
}

function handlePlayerMove(gameId: number, playerId: number, position: number) {
    const gameEngine = activeGames.get(gameId);
    if (gameEngine) {
        gameEngine.updatePlayerPosition(playerId, position);
    }
}

export function broadcastToGame(gameId: number, message: any) {
    const connections = gameConnections.get(gameId);
    if (connections && connections.size > 0) {
        const messageStr = JSON.stringify(message);
        const deadConnections: any[] = [];
      
        connections.forEach(socket => {
            if (socket && typeof socket.send === 'function') {
                try {
                    if (typeof socket.readyState !== 'undefined' && socket.readyState === 1) {
                        socket.send(messageStr);
                    } else {
                        deadConnections.push(socket);
                    }
                } catch (error) {
                    deadConnections.push(socket);
                }
            } else {
                deadConnections.push(socket);
            }
        });

        deadConnections.forEach(socket => connections.delete(socket));
        if (connections.size === 0) {
            gameConnections.delete(gameId);
        }
    }

    const matchId = gameToMatchMap.get(gameId);
    if (matchId) {
        if (message.type === 'gameState') {
            broadcastGameStateToMatch(matchId, message.state);
        } else if (message.type === 'score') {
            broadcastScoreToMatch(matchId, message);
        } else if (message.type === 'gameEnd') {
            broadcastGameEndToMatch(matchId, message.winner);
        } else if (message.type === 'ballReset') {
            // Also forward ball reset messages to tournament
            broadcastGameStateToMatch(matchId, { ballReset: true, ...message });
        }
    }
}

export function getGameConnectionCount(gameId: number): number {
    const connections = gameConnections.get(gameId);
    return connections ? connections.size : 0;
}

export default webSocketRoutes;
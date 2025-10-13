import { FastifyInstance } from 'fastify';
import { activeGames } from '../routes/game';

const DEBUG = false;

// Store active WebSocket connections per game
const gameConnections = new Map<number, Set<any>>();

// Register WebSocket routes
async function webSocketRoutes(fastify: FastifyInstance) {

  // WebSocket endpoint for game connections
  (fastify as any).register(async function (fastify: any) {
    fastify.get('/game/:gameId/ws', { websocket: true }, (connection: any, req: any) => {
      const { gameId } = req.params;
      const gameIdNum = parseInt(gameId);
      
      if (isNaN(gameIdNum)) {
        // Try different ways to close the connection
        if (connection.socket) {
          connection.socket.close(1008, 'Invalid game ID');
        } else if (connection.close) {
          connection.close();
        } else if (connection.ws) {
          connection.ws.close(1008, 'Invalid game ID');
        }
        return;
      }

      // Try to find the actual WebSocket object
      let socket = null;
      if (connection) {
        socket = connection;
      }
      
      if (!socket) {
        return;
      }
      
      // Add socket to game connections
      if (!gameConnections.has(gameIdNum)) {
        gameConnections.set(gameIdNum, new Set());
      }
      gameConnections.get(gameIdNum)!.add(socket);

      // Handle incoming messages
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
                    scorePlayer1: currentState.scorePlayer1,
                    scorePlayer2: currentState.scorePlayer2
                  }));
                }
                break;
            }
          } catch (error) {
            // Ignore malformed messages
          }
        });

        // Handle connection close
        socket.on('close', () => {
          removeSocketFromGame(gameIdNum, socket);
        });

        // Handle errors
        socket.on('error', (error: any) => {
          removeSocketFromGame(gameIdNum, socket);
        });
      } else {
        return;
      }

      // Send initial connection confirmation
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

// Helper function to remove socket from game connections
function removeSocketFromGame(gameId: number, socket: any) {
  const connections = gameConnections.get(gameId);
  if (connections) {
    connections.delete(socket);
    if (connections.size === 0) {
      gameConnections.delete(gameId);
    }
  }
}

// Handle player movement - FIXED VERSION
function handlePlayerMove(gameId: number, playerId: number, position: number) {
  const gameEngine = activeGames.get(gameId);
  if (gameEngine) {
    // Use the correct method name from your game engine
    gameEngine.updatePlayerPosition(playerId, position);
    
  }
}

// Broadcast message to all connections in a game
export function broadcastToGame(gameId: number, message: any) {
  const connections = gameConnections.get(gameId);
  if (!connections || connections.size === 0) {
    return;
  }
  
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

  // Clean up dead connections
  deadConnections.forEach(socket => {
    connections.delete(socket);
  });

  if (connections.size === 0) {
    gameConnections.delete(gameId);
  }
}

// Get connection count for a game
export function getGameConnectionCount(gameId: number): number {
  const connections = gameConnections.get(gameId);
  if (connections)
    return connections.size
  return 0;
}

export default webSocketRoutes;
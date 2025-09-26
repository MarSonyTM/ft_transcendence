import fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import path from 'path';
import userRoutes from './routes/users';
import gameRoutes from './routes/game';
import gameStateRoutes from './routes/gameState';
import playerRoutes from './routes/players';
import ssrRoutes from './routes/ssr';
import webSocketRoutes from './websocket/websocketHandler';
import tournamentRoutes from './routes/tournament';
import { database } from './database';

const PORT = 3000;
const HOST = '0.0.0.0';

const server: FastifyInstance = fastify({
  logger: {
    level: 'info',
    transport: process.env.NODE_ENV === 'development' ? {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid',
        colorize: true
      }
    } : undefined
  }
});

// Start server
const start = async (): Promise<void> => {
  try {
    // Enable CORS for frontend communication
    await server.register(require('@fastify/cors'), {
      origin: [
        'http://localhost:8080',
        'http://frontend:8080',
        'http://localhost:3000',
        'http://localhost:5173', // Vite dev server
        /^http:\/\/localhost:\d+$/
      ],
      credentials: true
    });
    
    // Register WebSocket support first
    await webSocketRoutes(server);

    // Register API routes (these must come before SSR routes)
    await server.register(userRoutes, { prefix: '/api/users' });
    await server.register(gameRoutes, { prefix: '/api/game' });
    await server.register(gameStateRoutes, { prefix: '/api/gamestate' });
    await server.register(playerRoutes, { prefix: '/api/players' });
    await server.register(tournamentRoutes, { prefix: '/api/tournament' });

    // API Routes
    await server.register(async function (fastify: FastifyInstance) {
      // Basic API info route
      fastify.get('/api', async (request: FastifyRequest, reply: FastifyReply) => {
        return {
          message: 'Transcendence API with SSR',
          version: '0.0.3',
          features: ['WebSocket', 'Server-Side Rendering', 'Real-time Pong'],
          endpoints: {
            users: '/api/users',
            userById: '/api/users/:id',
            games: '/api/game',
            gamesById: '/api/game/:id',
            joinGame: '/api/game/:id/join',
            gameState: '/api/gamestate',
            gameStateById: '/api/gamestate/:id',
            players: '/api/players',
            playerById: '/api/players/:id',
            playersByGame: '/api/players/game/:gameId',
            playersByUser: '/api/players/user/:userId',
            playerStats: '/api/players/:id/stats',
            tournamentStart: '/api/tournament/start',
            tournamentState: '/api/tournament/state',
            tournamentResult: '/api/tournament/result',
            ping: '/api/ping',
            health: '/health',
            webSocket: '/game/:gameid/ws'
          },
          pages: {
            landing: '/',
            login: '/login',
            game: '/game',
            gameWithId: '/game/:gameId'
          }
        };
      });

      // Health check endpoint
      fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
        try {
          return {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            database: 'sqlite connected',
            websocket: 'enabled',
            ssr: 'enabled',
            database_path: process.env.DATABASE_PATH || '/app/database/database.db'
          };
        } catch (error) {
          reply.code(503);
          return {
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      });

      // Witty Route
      fastify.get('/ping', async (request: FastifyRequest, reply: FastifyReply) => {
        return { pong: 'it worked!' };
      });
    });

    // Register SSR routes
    await server.register(ssrRoutes);

    // Start listening
    await server.listen({ port: PORT, host: HOST });
    console.log(`🚀 Backend server with WebSocket and SSR listening on http://${HOST}:${PORT}`);
    console.log(`🔌 WebSocket endpoint: ws://${HOST}:${PORT}/game/:gameId/ws`);
    console.log(`📊 Health check available at http://${HOST}:${PORT}/health`);
    console.log(`📡 API docs available at http://${HOST}:${PORT}/api`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
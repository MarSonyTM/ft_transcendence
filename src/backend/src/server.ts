import fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import path from 'path';
import websocket from '@fastify/websocket';
import userRoutes from './routes/users';
import auth from './routes/auth';
import gameRoutes from './routes/game';
import gameStateRoutes from './routes/gameState';
import playerRoutes from './routes/players';
import ssrRoutes from './routes/ssr';
import webSocketRoutes from './websocket/websocketHandler';
import tournamentRoutes from './routes/tournament';
import roomRoutes from './routes/room';
import roomWebSocketRoutes from './websocket/roomHandler';
import { authGuard } from './middleware';
import friendRoutes from './routes/friends';
import invitationRoutes from './routes/invite';
import { database } from './database';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

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
        origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
        
            if (!origin) {
                return cb(null, true);
            }
            
            // Allow any localhost or local network IP
            const allowedPatterns = [
                /^http:\/\/localhost:\d+$/,
                /^http:\/\/127\.0\.0\.1:\d+$/,
                /^http:\/\/0\.0\.0\.0:\d+$/,
                /^http:\/\/192\.168\.\d+\.\d+:\d+$/,
                /^http:\/\/10\.\d+\.\d+\.\d+:\d+$/,
                /^http:\/\/172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+:\d+$/,
                /^https:\/\/localhost$/,
                'http://frontend:8080',
                'https://play.google.com'
            ];
            
            const isAllowed = allowedPatterns.some(pattern => {
                if (typeof pattern === 'string') {
                    return origin === pattern;
                }
                return pattern.test(origin);
            });
            
            if (isAllowed) {
                console.log('✅ Origin allowed:', origin);
                cb(null, true);
            } else {
                console.log('❌ Origin blocked:', origin);
                cb(new Error('Not allowed by CORS'));
            }
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
    });

    await server.register(websocket);
    console.log('✅ WebSocket support registered');
    
    // Register WebSocket routes BEFORE authGuard
    await server.register(webSocketRoutes);
    await server.register(roomWebSocketRoutes);
    console.log('✅ WebSocket routes registered');
    
    // NOW add the auth guard (it won't affect already-registered routes)
    server.addHook('onRequest', authGuard);
    console.log('✅ Authentication middleware registered');
    
    // Register all other API routes AFTER authGuard
    await server.register(userRoutes, { prefix: '/api/users' });
    await server.register(gameRoutes, { prefix: '/api/game' });
    await server.register(gameStateRoutes, { prefix: '/api/gamestate' });
    await server.register(playerRoutes, { prefix: '/api/players' });
    await server.register(tournamentRoutes, { prefix: '/api/tournament' });
    await server.register(auth, { prefix: '/api/auth' });
    await server.register(roomRoutes);
    await server.register(friendRoutes, { prefix: '/api/friends' });
    await server.register(invitationRoutes, { prefix: '/api/invitations' });

    // API Routes
    await server.register(async function (fastify: FastifyInstance) {
        // Basic API info route
        fastify.get('/api', async (request: FastifyRequest, reply: FastifyReply) => {
            return {
                message: 'Transcendence API with SSR',
                version: '0.0.7',
                features: ['WebSocket', 'Server-Side Rendering', 'Real-time Pong'],
                endpoints: {
                    auth: '/api/auth',
                    createUser: '/api/auth/create',
                    login: '/api/auth/login',
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
                    createRoom: '/api/room/create',
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
    console.log(`Backend server with WebSocket and SSR listening on http://${HOST}:${PORT}`);
    console.log(`WebSocket endpoint: ws://${HOST}:${PORT}/game/:gameId/ws`);
    console.log(`Health check available at http://${HOST}:${PORT}/health`);
    console.log(`API docs available at http://${HOST}:${PORT}/api`);
    } catch (err) {
        server.log.error(err);
        process.exit(1);
    }
};

start();

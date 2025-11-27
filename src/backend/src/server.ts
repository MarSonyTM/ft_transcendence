import fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import websocket from '@fastify/websocket';
import userRoutes from './routes/users';
import auth from './routes/auth';
import gameRoutes from './routes/game';
import gameStateRoutes from './routes/gameState';
import playerRoutes from './routes/players';
import ssrRoutes from './routes/ssr';
import webSocketRoutes from './websocket/websocketHandler';
import roomRoutes from './routes/room';
import roomWebSocketRoutes from './websocket/roomHandler';
import tournamentRoutes from './routes/tournaments';
import tournamentWebSocketRoutes from './websocket/tournamentHandler';
import { authGuard } from './middleware';
import friendRoutes from './routes/friends';
import { registerPresenceStatusRoute } from './routes/presence'
import cookie from '@fastify/cookie';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

const server: FastifyInstance = fastify({
    logger: {
        level: 'info',
        transport: {
            target: 'pino-pretty',
            options: {
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname',
                colorize: true,
                singleLine: false
            }
        }
    }
});



server.addContentTypeParser('application/json', { parseAs: 'string' }, (req, payload, done) => {
    try {
        const text = (payload || '').toString();
        if (!text || text.trim() === '') {
            done(null, {});
            return;
        }
        const parsed = JSON.parse(text);
        done(null, parsed);
    } catch (err) {
        done(err as Error);
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
                // HTTP patterns
                /^http:\/\/localhost:\d+$/,
                /^http:\/\/127\.0\.0\.1:\d+$/,
                /^http:\/\/0\.0\.0\.0:\d+$/,
                /^http:\/\/192\.168\.\d+\.\d+:\d+$/,
                /^http:\/\/10\.\d+\.\d+\.\d+:\d+$/,
                /^http:\/\/172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+:\d+$/,
                
                // HTTPS patterns
                /^https:\/\/localhost(:\d+)?$/,
                /^https:\/\/127\.0\.0\.1(:\d+)?$/,
                /^https:\/\/192\.168\.\d+\.\d+(:\d+)?$/,
                /^https:\/\/10\.\d+\.\d+\.\d+(:\d+)?$/,
                /^https:\/\/172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+(:\d+)?$/,
                
                'http://frontend:8080',
                'https://play.google.com',
                '10.18.178.53:5173',
                'http://localhost:5173'
            ];
            
            const isAllowed = allowedPatterns.some(pattern => {
                if (typeof pattern === 'string') {
                    return origin === pattern;
                }
                return pattern.test(origin);
            });
            
            if (isAllowed) {
                cb(null, true);
            } else {
                console.log('❌ Origin blocked:', origin);
                cb(new Error('Not allowed by CORS'));
            }
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
        exposedHeaders: ['set-cookie'],
    });

    await server.register(websocket);
    await server.register(cookie, {
        secret: process.env.COOKIE_SECRET || 'supersecret',
    });
    console.log('✅ WebSocket support registered');
    
    // ✅ SECURITY HEADERS (XSS Protection, CSP, etc.)
    server.addHook('onSend', async (request, reply) => {
        // Content Security Policy - Prevents XSS attacks
        reply.header('Content-Security-Policy', 
            "default-src 'self'; " +
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
            "style-src 'self' 'unsafe-inline'; " +
            "img-src 'self' data: https:; " +
            "font-src 'self' data:; " +
            "connect-src 'self' ws: wss:; " +
            "frame-ancestors 'none';"
        );
        
        // X-Content-Type-Options - Prevents MIME type sniffing
        reply.header('X-Content-Type-Options', 'nosniff');
        
        // X-Frame-Options - Prevents clickjacking
        reply.header('X-Frame-Options', 'DENY');
        
        // X-XSS-Protection - Enables browser XSS filter
        reply.header('X-XSS-Protection', '1; mode=block');
        
        // Referrer-Policy - Controls referrer information
        reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
        
        // Permissions-Policy - Restricts browser features
        reply.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    });
    console.log('✅ Security headers configured');
    
    // Register WebSocket routes BEFORE authGuard
    await server.register(webSocketRoutes);
    await server.register(roomWebSocketRoutes);
    await server.register(tournamentWebSocketRoutes);
    console.log('✅ WebSocket routes registered');
    
    // NOW add the auth guard (it won't affect already-registered routes)
    server.addHook('onRequest', authGuard);
    console.log('✅ Authentication middleware registered');
    
    // Register all other API routes AFTER authGuard
    await server.register(userRoutes, { prefix: '/api/users' });
    await server.register(gameRoutes, { prefix: '/api/game' });
    await server.register(gameStateRoutes, { prefix: '/api/gamestate' });
    await server.register(playerRoutes, { prefix: '/api/players' });
    await server.register(tournamentRoutes);
    await server.register(auth, { prefix: '/api/auth' });
    await server.register(roomRoutes);
    await server.register(friendRoutes, { prefix: '/api/friends' });
    await server.register(registerPresenceStatusRoute)

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

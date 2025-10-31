import { FastifyInstance, FastifyPluginOptions, FastifyRequest } from 'fastify';
import { database } from '../database';
import path from 'path';
import { readFileSync, existsSync } from 'fs';

async function ssrRoutes(fastify: FastifyInstance, options: FastifyPluginOptions) {
  
    // Path to the built frontend files from Vite
    const frontendDistPath = path.resolve('/app/frontend/dist');
    const indexPath = path.join(frontendDistPath, 'index.html');

    // Register static asset serving for Vite build output
    await fastify.register(require('@fastify/static'), {
        root: path.join(frontendDistPath, 'assets'),
        prefix: '/assets/',
        decorateReply: false
    });

    // Serve favicon
    fastify.get('/favicon.ico', async (request, reply) => {
        const faviconPath = path.join(frontendDistPath, 'favicon.ico');
        if (existsSync(faviconPath)) {
            const favicon = readFileSync(faviconPath);
            reply.type('image/x-icon');
            return reply.send(favicon);
        } else {
            reply.code(404);
            return { error: 'Favicon not found' };
        }
    });

    // Helper function to inject server data into the HTML
    function injectGameData(html: string, gameState: any, gameId: number | null, currentUsername: string, currentPage: string, request: FastifyRequest): string {
        // Get the host from the request headers
        const host = request.headers.host || `0.0.0.0:${process.env.PORT || 3000}`;
        const protocol = request.headers['x-forwarded-proto'] || (request.protocol === 'https' ? 'https' : 'http');
        const wsProtocol = protocol === 'https' ? 'wss' : 'ws';
      
        const initialState = {
            gameState,
            gameId,
            currentUsername,
            currentPage,
            apiEndpoint: `${protocol}://${host}`,
            wsEndpoint: `${wsProtocol}://${host}`,
            environment: process.env.NODE_ENV || 'development',
        };

        const scriptTag = `
            <script>
            window.__INITIAL_STATE__ = ${JSON.stringify(initialState)};
            window.__GAME_STATE__ = ${JSON.stringify(gameState)};
            window.__GAME_ID__ = ${gameId};
            window.__CURRENT_USER__ = "${currentUsername}";
            window.__CURRENT_PAGE__ = "${currentPage}";
            </script>
        `;

        return html.replace('</head>', `${scriptTag}</head>`);
    }

    // SSR route for root
    fastify.get('/', async (request, reply) => {
        try {
            if (!existsSync(indexPath)) {
                reply.code(500);
                return { 
                    error: 'Frontend build not found',
                    message: 'Please run frontend build first',
                    path: indexPath
                };
            }

            let html = readFileSync(indexPath, 'utf-8');
            html = injectGameData(html, null, null, 'Guest', 'landing', request);

            reply.type('text/html');
            return reply.send(html);
        } catch (error) {
            reply.code(500);
            return { 
                error: 'Failed to render page',
                message: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    });

    // SSR route for login page
    fastify.get('/login', async (request, reply) => {
        try {
            if (!existsSync(indexPath)) {
                reply.code(500);
                return { error: 'Frontend build not found' };
            }

            let html = readFileSync(indexPath, 'utf-8');
            html = injectGameData(html, null, null, 'Guest', 'login', request);

            reply.type('text/html');
            return reply.send(html);
        } catch (error) {
            reply.code(500);
            return { error: 'Failed to render login page' };
        }
    });

    // SSR route for game page with optional gameId
    fastify.get('/game/:gameId?', async (request, reply) => {
        try {
            const { gameId } = request.params as { gameId?: string };

            if (!existsSync(indexPath)) {
                reply.code(500);
                return { error: 'Frontend build not found' };
            }

            let html = readFileSync(indexPath, 'utf-8');
            let gameState = null;
            let parsedGameId = null;

            if (gameId) {
                parsedGameId = parseInt(gameId, 10);
                const game = database.games.getGameById(parsedGameId);
          
                if (game) {
                    gameState = {
                        id: game.id,
                        mode: game.mode,
                        difficulty: game.difficulty,
                    };
                }
            }

            html = injectGameData(html, gameState, parsedGameId, 'Guest', 'game', request);

            reply.type('text/html');
            return reply.send(html);
        } catch (error) {
            reply.code(500);
            return { 
                error: 'Failed to render game page',
                message: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    });

    // Catch-all route for SPA routing
    fastify.get('*', async (request, reply) => {
        try {
            if (!existsSync(indexPath)) {
                reply.code(500);
                return { error: 'Frontend build not found' };
            }

            let html = readFileSync(indexPath, 'utf-8');
            html = injectGameData(html, null, null, 'Guest', 'unknown', request);

            reply.type('text/html');
            return reply.send(html);
        } catch (error) {
            reply.code(500);
            return { error: 'Failed to render page' };
        }
    });
}

export default ssrRoutes;

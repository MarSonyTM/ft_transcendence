import { FastifyInstance, FastifyPluginOptions } from 'fastify';
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
  function injectGameData(html: string, gameState: any, gameId: number | null, currentUsername: string, currentPage: string): string {
    const initialState = {
      gameState,
      gameId,
      currentUsername,
      currentPage,
      timestamp: Date.now(),
      apiEndpoint: `http://localhost:${process.env.PORT || 3000}`,
      wsEndpoint: `ws://localhost:${process.env.PORT || 3000}`,
      environment: process.env.NODE_ENV || 'development'
    };

    // Inject the state right after the app-root div
    return html.replace(
      '<div id="app-root"></div>',
      `<div id="app-root"></div>
       <script>
         window.__INITIAL_STATE__ = ${JSON.stringify(initialState)};
         window.__GAME_STATE__ = ${JSON.stringify(gameState)};
         window.__GAME_ID__ = ${gameId};
         window.__USERNAME__ = ${JSON.stringify(currentUsername)};
         window.__CURRENT_PAGE__ = ${JSON.stringify(currentPage)};
         console.log('🏓 SSR: Game state injected for page:', '${currentPage}');
       </script>`
    );
  }

  // Serve HTML with game state injection
  async function servePageWithGameState(
    request: any, 
    reply: any, 
    pageType: 'landing' | 'login' | 'game',
    gameId: number | null = null,
    username: string = ''
  ) {
    try {
      // Check if frontend is built
      if (!existsSync(indexPath)) {
        fastify.log.error(`Frontend build not found at: ${indexPath}`);
        reply.code(503);
        return {
          error: 'Frontend not built',
          message: 'Please run "npm run build" in the frontend directory',
          expectedPath: indexPath
        };
      }

      // Default game state
      let gameState = {
        ballPosX: 200,
        ballPosY: 100,
        player1Pos: 80,
        player2Pos: 80,
        scorePlayer1: 0,
        scorePlayer2: 0
      };

      // If gameId is provided, try to get current game state from database
      if (gameId) {
        try {
          const dbGameState = database.gameState.getGameStateByGameId(gameId);
          if (dbGameState) {
            gameState = {
              ballPosX: dbGameState.ballPosX || 200,
              ballPosY: dbGameState.ballPosY || 100,
              player1Pos: dbGameState.player1Pos || 80,
              player2Pos: dbGameState.player2Pos || 80,
              scorePlayer1: dbGameState.scorePlayer1 || 0,
              scorePlayer2: dbGameState.scorePlayer2 || 0
            };
            fastify.log.info(`Loaded game state for game ${gameId}: ${JSON.stringify(gameState)}`);
          }
        } catch (error) {
          fastify.log.warn(`Failed to load game state for game ${gameId}: ${error}`);
        }
      }

      // Read the built HTML file
      const html = readFileSync(indexPath, 'utf-8');
      
      // Inject server-side game data
      const htmlWithGameData = injectGameData(html, gameState, gameId, username, pageType);
      
      // Set proper headers
      reply.type('text/html; charset=utf-8');
      
      // Add caching headers
      if (process.env.NODE_ENV === 'production') {
        reply.header('Cache-Control', 'public, max-age=3600');
      } else {
        reply.header('Cache-Control', 'no-cache');
      }
      
      return reply.send(htmlWithGameData);
      
    } catch (error) {
      fastify.log.error(`SSR Error for ${pageType}: ${error}`);
      reply.code(500);
      return {
        error: 'Server-side rendering failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        page: pageType,
        timestamp: new Date().toISOString()
      };
    }
  }

  // Root route - renders based on query parameters or defaults to landing
  fastify.get('/', async (request, reply) => {
    const query = request.query as { page?: string; username?: string };
    const page = query.page || 'landing';
    const username = query.username || '';
    
    return servePageWithGameState(
      request, 
      reply, 
      page as 'landing' | 'login' | 'game', 
      null, 
      username
    );
  });

  // Game-specific SSR route
  fastify.get('/game/:gameId?', async (request, reply) => {
    const params = request.params as { gameId?: string };
    const query = request.query as { username?: string };
    
    const gameId = params.gameId ? parseInt(params.gameId) : null;
    const username = query.username || '';
    
    return servePageWithGameState(request, reply, 'game', gameId, username);
  });

  // Login page route
  fastify.get('/login', async (request, reply) => {
    return servePageWithGameState(request, reply, 'login');
  });

  // Catch-all route for SPA client-side routing

  fastify.setNotFoundHandler(async (request, reply) => {
    // Only handle HTML requests, not API or WebSocket requests
    const acceptsHtml = request.headers.accept?.includes('text/html');
    const isApiRequest = request.url.startsWith('/api/') || 
                        (request.url.startsWith('/game/') && request.url.includes('/ws'));
    
    if (acceptsHtml && !isApiRequest) {
      // Default to serving the SPA with empty state for unknown routes
      return servePageWithGameState(request, reply, 'landing');
    } else {
      reply.code(404);
      return {
        error: 'Not Found',
        message: `Route ${request.method} ${request.url} not found`,
        timestamp: new Date().toISOString()
      };
    }
  });
}

export default ssrRoutes;
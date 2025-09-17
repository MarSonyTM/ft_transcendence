import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { renderFullPage, SSRPageProps } from '../ssr/renderer';
import { database } from '../database';

async function ssrRoutes(fastify: FastifyInstance, options: FastifyPluginOptions) {
  
  // Root route - renders based on query parameters or defaults to landing
  fastify.get('/', async (request, reply) => {
    try {
      const query = request.query as { page?: string; username?: string };
      const page = query.page || 'landing';
      const username = query.username || '';
      
      const initialGameState = {
        ballPosX: 200,
        ballPosY: 100,
        player1Pos: 80,
        player2Pos: 80,
        scorePlayer1: 0,
        scorePlayer2: 0
      };

      const props: SSRPageProps = {
        gameState: initialGameState,
        gameId: null,
        currentUsername: username,
        currentPage: page as 'landing' | 'login' | 'game'
      };

      const html = renderFullPage(props);
      reply.type('text/html').send(html);
    } catch (error) {
      fastify.log.error('SSR Error:', error);
      reply.code(500).send('Server Error');
    }
  });

  // Game-specific SSR route
  fastify.get('/game/:gameId?', async (request, reply) => {
    try {
      const params = request.params as { gameId?: string };
      const query = request.query as { username?: string };
      
      const gameId = params.gameId ? parseInt(params.gameId) : null;
      const username = query.username || '';
      
      let gameState = {
        ballPosX: 200,
        ballPosY: 100,
        player1Pos: 80,
        player2Pos: 80,
        scorePlayer1: 0,
        scorePlayer2: 0
      };

      // If gameId is provided, try to get current game state
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
          }
        } catch (error) {
          fastify.log.warn(`Failed to load game state for game ${gameId}:`, error);
        }
      }

      const props: SSRPageProps = {
        gameState,
        gameId,
        currentUsername: username,
        currentPage: 'game'
      };

      const html = renderFullPage(props);
      reply.type('text/html').send(html);
    } catch (error) {
      fastify.log.error('Game SSR Error:', error);
      reply.code(500).send('Game Load Error');
    }
  });

  // Login page route
  fastify.get('/login', async (request, reply) => {
    try {
      const initialGameState = {
        ballPosX: 200,
        ballPosY: 100,
        player1Pos: 80,
        player2Pos: 80,
        scorePlayer1: 0,
        scorePlayer2: 0
      };

      const props: SSRPageProps = {
        gameState: initialGameState,
        gameId: null,
        currentUsername: '',
        currentPage: 'login'
      };

      const html = renderFullPage(props);
      reply.type('text/html').send(html);
    } catch (error) {
      fastify.log.error('Login SSR Error:', error);
      reply.code(500).send('Login Page Error');
    }
  });
}

export default ssrRoutes;
import { FastifyInstance, FastifyRequest, FastifyReply, FastifyPluginOptions } from 'fastify';
import { tournamentManager } from '../tournament/tournamentManager';
import { TPT, TournamentPlayer } from '../types/index';
import { activeGames } from './game';
import { database } from '../database/index';
import { BaseGameEngine } from '../game/gameEngine';
import { AIDifficulty } from '../game/aiPlayer';
import { registerTournamentGame } from '../websocket/websocketHandler';
import { broadcastGameStartToMatch, broadcastTournamentState } from '../websocket/tournamentHandler';
import { sanitizeString, sanitizeAlias, sanitizeId } from '../utils/sanitization';

// Validation schemas for tournament routes
const resetTournamentBodySchema = {
	type: 'object',
	properties: {
		shouldCreate: {
			type: 'string',
			enum: ['true', 'false']
		},
		status: {
			type: 'string',
			enum: ['setup', 'active', 'completed', 'archived', 'suspended']
		}
	},
	required: ['shouldCreate', 'status'],
	additionalProperties: false
};

const createTournamentBodySchema = {
	type: 'object',
	properties: {
		name: { 
			type: 'string', 
			minLength: 1, 
			maxLength: 100 
		},
		id: { 
			type: 'string', 
			pattern: '^[0-9]+$',
			minLength: 1,
			maxLength: 20
		},
		ok: { 
			type: 'string',
			enum: ['true', 'false']
		}
	},
	required: ['name', 'id', 'ok'],
	additionalProperties: false
};

const addPlayerBodySchema = {
	type: 'object',
	properties: {
		name: { 
			type: 'string', 
			minLength: 1,
			maxLength: 50 
		},
		tpt: { 
			type: 'string', 
			enum: ['host', 'ai', 'local', 'remote']
		},
		id: { 
			type: 'string',
			pattern: '^[0-9-]+$',
			minLength: 1,
			maxLength: 20
		},
		difficulty: {
			type: 'string',
			enum: ['easy', 'normal', 'hard']
		}
	},
	required: ['name', 'tpt', 'id'],
	additionalProperties: false
};

const leaveTournamentBodySchema = {
	type: 'object',
	properties: {
		playerId: { 
			type: 'number',
			minimum: 1
		}
	},
	required: ['playerId'],
	additionalProperties: false
};

const endMatchBodySchema = {
	type: 'object',
	properties: {
		winnerId: { 
			type: 'number',
			minimum: 1
		}
	},
	additionalProperties: false
};

const tournamentParamsSchema = {
	type: 'object',
	properties: {
		tournamentId: { 
			type: 'string', 
			pattern: '^[0-9]+$',
			minLength: 1,
			maxLength: 20
		}
	},
	required: ['tournamentId'],
	additionalProperties: false
};

const matchParamsSchema = {
	type: 'object',
	properties: {
		tournamentId: { 
			type: 'string', 
			pattern: '^[0-9]+$',
			minLength: 1,
			maxLength: 20
		},
		matchId: { 
			type: 'string', 
			pattern: '^[0-9]+$',
			minLength: 1,
			maxLength: 20
		}
	},
	required: ['tournamentId', 'matchId'],
	additionalProperties: false
};

const playerReadyParamsSchema = {
	type: 'object',
	properties: {
		tournamentId: { 
			type: 'string', 
			pattern: '^[0-9]+$',
			minLength: 1,
			maxLength: 20
		},
		matchId: { 
			type: 'string', 
			pattern: '^[0-9]+$',
			minLength: 1,
			maxLength: 20
		},
		playerId: { 
			type: 'string', 
			pattern: '^[0-9]+$',
			minLength: 1,
			maxLength: 20
		}
	},
	required: ['tournamentId', 'matchId', 'playerId'],
	additionalProperties: false
};

async function tournamentRoutes(fastify: FastifyInstance, _options: FastifyPluginOptions) {

	// -------------------------------------- TOURNAMENTS -------------------------------------- //
	// List all tournaments
	fastify.get('/api/tournament', async (_request: FastifyRequest, reply: FastifyReply) => {
		try {
			const tournaments = tournamentManager.getAllTournaments();
			if (!tournaments)
				return reply.status(400).send({ success: false, message: 'No tournaments received' });

			return reply.send({ success: true, data: tournaments});
		} catch (error) {
			fastify.log.error(error);
			return reply.status(500).send({ success: false, message: 'Failed to list tournaments' });
		}
	});

	// Create new tournament
	fastify.post('/api/tournament', {
		schema: {
			body: createTournamentBodySchema
		}
	}, async (request: FastifyRequest, reply: FastifyReply) => {
		try {
			const { name, id, ok } = request.body as { name: string, id: string, ok: string };
			
			const sanitizedName = sanitizeAlias(name);
			const sanitizedId = sanitizeId(id);
			
			if (ok === 'false' || !sanitizedName || sanitizedId <= 0)
				return reply.status(401).send({ success: false, message: 'No authenticated User' });
			
			let tournament = await tournamentManager.createTournament(sanitizedName, sanitizedId);
			if (!tournament)
				return reply.status(400).send({ success: false, message: 'Failed to create tournament'});

			return reply.send({ success: true, data: tournament });
		} catch (error) {
			fastify.log.error(error);
			return reply.status(500).send({ success: false, message: 'Failed to create tournament' });
		}
	});

	// Get tournament by ID
	fastify.get('/api/tournament/:tournamentId', {
		schema: {
			params: tournamentParamsSchema
		}
	}, async (request: FastifyRequest, reply: FastifyReply) => {
		try {
			const { tournamentId } = request.params as { tournamentId: string };
			
			const tId = sanitizeId(tournamentId);
			if (tId <= 0)
				return reply.status(400).send({ success: false, message: 'Invalid tournament id' });

			const t = tournamentManager.getTournament(tId);
			if (!t)
				return reply.status(404).send({ success: false, message: 'Tournament not found' });

			return reply.send({ success: true, data: t });
		} catch (error) {
			fastify.log.error(error);
			return reply.status(500).send({ success: false, message: 'Failed to get tournament' });
		}
	});

	// Start tournament
	fastify.post('/api/tournament/:tournamentId/start', {
		schema: {
			params: tournamentParamsSchema
		}
	}, async (request: FastifyRequest, reply: FastifyReply) => {
		try {	
			const { tournamentId } = request.params as { tournamentId: string };
			
			const tId = sanitizeId(tournamentId);
			if (tId <= 0)
				return reply.status(400).send({ success: false, message: 'Invalid tournament id' });

			if (!(await tournamentManager.setupMatches(tId)))
				return reply.status(400).send({ success: false, message: 'Failed to setup matches before starting tournament' });

			if (!(await tournamentManager.startTournament(tId)))
				return reply.status(400).send({ success: false, message: 'Failed to start tournament' });

			const t = tournamentManager.getTournament(tId);
			if (!t)
				return reply.status(404).send({ success: false, message: 'Tournament not found' });

			return reply.send({ success: true, data: t });
			} catch (error) {
				fastify.log.error(error);
				return reply.status(500).send({ success: false, message: 'Failed to start tournament' });
		}
	});

	// Leave tournament
	fastify.post('/api/tournament/:tournamentId/leave', {
		schema: {
			params: tournamentParamsSchema,
			body: leaveTournamentBodySchema
		}
	}, async (request: FastifyRequest ,reply: FastifyReply) => {
		try {
			const { tournamentId } = request.params as { tournamentId: string };
			const { playerId } = request.body as { playerId: string };
			
			const tId = sanitizeId(tournamentId);
			const pId = sanitizeId(playerId);
			
			if (isNaN(tId) || tId <= 0)
				return reply.status(400).send({ success: false, message: 'Invalid tournament id' });
			if (isNaN(pId) || pId <= 0)
				return reply.status(400).send({ success: false, message: 'Invalid player id' });

			if (!tournamentManager.leaveTournament(tId, pId))
				return reply.status(404).send({ success: false, message: 'Unable to leave Tournament' });

			return reply.send({ success: true, message: 'Left tournament' });
		} catch (error) {
			fastify.log.error(error);
			return reply.status(500).send({ success: false, message: 'Failed to leave tournament' });
		}
	});

	// End tournament
	fastify.post('/api/tournament/:tournamentId/end', {
		schema: {
			params: tournamentParamsSchema
		}
	}, async (request: FastifyRequest, reply: FastifyReply) => {
		try {
			const { tournamentId } = request.params as { tournamentId: string };
			
			const tId = sanitizeId(tournamentId);
			if (tId <= 0)
				return reply.status(400).send({ success: false, message: 'Invalid tournament id' });

			if (!(await tournamentManager.endTournament(tId)))
				return reply.status(400).send({ success: false, message: 'Unable to end Tournament' });

			const t = tournamentManager.getTournament(tId);
			if (!t)
				return reply.status(404).send({ success: false, message: 'Tournament not found' });

			return reply.send({ success: true, data: t });
		} catch (error) {
			fastify.log.error(error);
			return reply.status(500).send({ success: false, message: 'Failed to end tournament' });
		}
	});

	fastify.post('/api/tournament/:tournamentId/delete', {
		schema: {
			params: tournamentParamsSchema
		}
	}, async (request: FastifyRequest, reply: FastifyReply) => {
		try {
			const { tournamentId } = request.params as { tournamentId: string };
			
			const tId = sanitizeId(tournamentId);
			if (tId <= 0)
				return reply.status(400).send({ success: false, message: 'Invalid tournament id' });

			await tournamentManager.deleteTournament(tId);
			return reply.send({ success: true, message: 'Tournament deleted' });
		} catch (err) {
			fastify.log.error(err);
			return reply.status(500).send({ success: false, message: 'Failed to delete tournament' });
		}
	})

	fastify.post('/api/tournament/:tournamentId/reset', {
		schema: {
			params: tournamentParamsSchema,
			body: resetTournamentBodySchema
		}
	}, async (request:FastifyRequest, reply: FastifyReply) => {
		try {
			const { tournamentId } = request.params as { tournamentId: string };

			const tId = sanitizeId(tournamentId);
			if (isNaN(tId) || tId <= 0)
				return reply.status(400).send({ success: false, message: 'Invalid tournament id' });

			const { shouldCreate, status } = request.body as { shouldCreate: string, status: string };
			let create: boolean = true;
			if (shouldCreate && shouldCreate === 'false')
				create = false;

			let t = await tournamentManager.resetTournament(tId, create, status);
			return reply.send({ success: true, data: t });
		} catch (err) {
			fastify.log.error(err);
			return reply.status(500).send({ success: false, message: 'Failed to reset tournament' });
		}
	})

	// -------------------------------------- PLAYERS -------------------------------------- //
	// Get all players in a tournament
	fastify.get('/api/tournament/:tournamentId/player', {
		schema: {
			params: tournamentParamsSchema
		}
	}, async (request: FastifyRequest, reply: FastifyReply) => {
		try {
			const { tournamentId } = request.params as { tournamentId: string };
			
			const tId = sanitizeId(tournamentId);
			if (tId <= 0)
				return reply.status(400).send({ success: false, message: 'Invalid tournament id' });

			const t = tournamentManager.getTournament(tId);
			if (!t)
				return reply.status(404).send({ success: false, message: 'Tournament not found' });

			return reply.send({ success: true, data: t });
		} catch (error) {
			fastify.log.error(error);
			return reply.status(500).send({ success: false, message: 'Failed to get players' });
		}
	});

	// Post/Add player //Join tournament
	fastify.post('/api/tournament/:tournamentId/player', {
		schema: {
			params: tournamentParamsSchema,
			body: addPlayerBodySchema
		}
	}, async (request: FastifyRequest, reply: FastifyReply) => {
		try {
			const { tournamentId } = request.params as { tournamentId: string };
			const { name, tpt, id, difficulty } = request.body as { name: string; tpt: TPT, id: string, difficulty?: string };
			
			const sanitizedName = sanitizeAlias(name);
			const sanitizedTpt = sanitizeString(tpt) as TPT;
			const tId = sanitizeId(tournamentId);
			
			// Sanitize and validate difficulty (only for AI players)
			let sanitizedDifficulty: string | undefined = undefined;
			if (difficulty && sanitizedTpt === 'ai') {
				sanitizedDifficulty = sanitizeString(difficulty);
				if (!['easy', 'normal', 'hard'].includes(sanitizedDifficulty)) {
					sanitizedDifficulty = 'normal'; // Default to normal if invalid
				}
			}
			
			if (isNaN(tId) || tId <= 0)
				return reply.status(400).send({ success: false, message: 'Invalid tournament id' });
			if (!sanitizedName || !sanitizedTpt)
				return reply.status(400).send({ success: false, message: 'Name and player type are required' });
			
			if (!['host', 'ai', 'local', 'remote'].includes(sanitizedTpt))
				return reply.status(400).send({ success: false, message: 'Invalid player type' });
			
			if (id !== '-' && sanitizeId(id) <= 0)
				return reply.status(401).send({ success: false, message: 'Not authenticated' });

			let success;
			if (id === '-')
				success = await tournamentManager.addPlayerToTournament(tId, sanitizedName, sanitizedTpt, undefined, sanitizedDifficulty);
			else
				success = await tournamentManager.addPlayerToTournament(tId, sanitizedName, sanitizedTpt, sanitizeId(id), sanitizedDifficulty);
			
			if (!success)
				return reply.status(400).send({ success: false, message: 'Failed to add player to tournament' });

			const t = tournamentManager.getTournament(tId);
			if (!t)
				return reply.status(400).send({ success: false, message: 'Failed to get tournament' });

			return reply.send({ success: true, data: t });
		} catch (error) {
			fastify.log.error(error);
			return reply.status(500).send({ success: false, message: 'Failed to add player to tournament' });
		}
	});

	// Toggle player ready
	fastify.post('/api/tournament/:tournamentId/match/:matchId/player/:playerId/ready', {
		schema: {
			params: playerReadyParamsSchema
		}
	}, async (request: FastifyRequest, reply: FastifyReply) => {
		try {
			const { tournamentId, matchId, playerId } = request.params as { tournamentId: string; matchId: string; playerId: string };
			let pId = +playerId;
			
			const tId = sanitizeId(tournamentId);
			const mId = sanitizeId(matchId);
			pId = sanitizeId(playerId);
			
			if (tId <= 0 || mId <= 0 || pId <= 0)
				return reply.status(400).send({ success: false, message: 'Invalid id(s)' });

			let m = tournamentManager.getMatch(+matchId);
			if (!m)
				return reply.status(404).send({ success: false, message: 'Match not found' });
			if (!m.p1 || !m.p2)
				return reply.status(404).send({ success: false, message: 'Match player(s) not found' });

			const p = m.p1.id === pId ? m.p1 : m.p2;
			if (!p)
				return reply.status(404).send({ success: false, message: 'Player not found in match' });

			if (!tournamentManager.toggleMatchPlayerReady(m.tournamentId, m.id, pId))
				return reply.status(400).send({ success: false, message: 'Unable to toggle player ready' });

			let t = tournamentManager.getTournament(+tournamentId);
			if (!t)
				return reply.status(404).send({ success: false, message: 'Tournament not found' });
			
			return reply.send({ success: true, data: t });
		} catch (error) {
			fastify.log.error(error);
			return reply.status(500).send({ success: false, message: 'Failed to toggle player ready status' });
		}
	});

	// -------------------------------------- ARCHIVE -------------------------------------- //
	// Get archive snapshot
	fastify.get('/api/tournament/:tournamentId/archive', {
		schema: {
			params: tournamentParamsSchema
		}
	}, async (request: FastifyRequest, reply: FastifyReply) => {
		try {
			const { tournamentId } = request.params as { tournamentId: string };
			
			const tId = sanitizeId(tournamentId);
			if (tId <= 0)
				return reply.status(400).send({ success: false, message: 'Invalid tournament id' });
			
			const archive = tournamentManager.getTournament(tId);
			if (!archive)
				return reply.status(404).send({ success: false, message: 'Archive not found' });

			return reply.send({ success: true, data: archive });
		} catch (error) {
			fastify.log.error(error);
			return reply.status(500).send({ success: false, message: 'Failed to get archive' });
		}
	});

	// List all archives
	fastify.get('/api/tournament/archives', async (_request: FastifyRequest, reply: FastifyReply) => {
		try {
			const archives = tournamentManager.getAllTournaments();
			if (!archives)
				return reply.status(404).send({ success: false, message: 'Archives not found' });

			return reply.send({ success: true, data: archives });
		} catch (error) {
			fastify.log.error(error);
			return reply.status(500).send({ success: false, message: 'Failed to list archives' });
		}
	});

	// -------------------------------------- MATCHES -------------------------------------- //
	// Get current match (next in queue) for a tournament
	fastify.get('/api/tournament/:tournamentId/match/current', {
		schema: {
			params: tournamentParamsSchema
		}
	}, async (request: FastifyRequest, reply: FastifyReply) => {
		try {
			const { tournamentId } = request.params as { tournamentId: string };
			
			const tId = sanitizeId(tournamentId);
			if (tId <= 0)
				return reply.status(400).send({ success: false, message: 'Invalid tournament id' });

			const m = await tournamentManager.getCurrentMatch(tId);

			return reply.send({ success: true, data: m });
		} catch (error) {
			fastify.log.error(error);
			return reply.status(500).send({ success: false, message: 'Failed to get current match' });
		}
	});

	// Get all players in match
	fastify.get('/api/tournament/:tournamentId/match/:matchId/player', {
		schema: {
			params: matchParamsSchema
		}
	}, async (request: FastifyRequest, reply: FastifyReply) => {
		try {
			const { tournamentId, matchId } = request.params as { tournamentId: string; matchId: string };
			
			const tId = sanitizeId(tournamentId);
			const mId = sanitizeId(matchId);
			
			if (tId <= 0 || mId <= 0)
				return reply.status(400).send({ success: false, message: 'Invalid id(s)' });

			const match = tournamentManager.getMatch(mId);
			if (!match)
				return reply.status(404).send({ success: false, message: 'Match not found' });

			const players: TournamentPlayer[] = [];
			if (match.p1)
				players.push(match.p1);
			if (match.p2)
				players.push(match.p2);
			return reply.send({ success: true, data: players });
		} catch (error) {
			fastify.log.error(error);
			return reply.status(500).send({ success: false, message: 'Failed to get match players' });
		}
	});

	// Get match by ID in a tournament
	fastify.get('/api/tournament/:tournamentId/match/:matchId', {
		schema: {
			params: matchParamsSchema
		}
	}, async (request: FastifyRequest, reply: FastifyReply) => {
		try {
			const { tournamentId, matchId } = request.params as { tournamentId: string; matchId: string };
			
			const tId = sanitizeId(tournamentId);
			const mId = sanitizeId(matchId);
			
			if (tId <= 0 || mId <= 0)
				return reply.status(400).send({ success: false, message: 'Invalid id(s)' });

			const match = tournamentManager.getMatch(mId);
			if (!match)
				return reply.status(404).send({ success: false, message: 'Match not found' });

			return reply.send({ success: true, data: match });
		} catch (error) {
			fastify.log.error(error);
			return reply.status(500).send({ success: false, message: 'Failed to get match' });
		}
	});

	// Start match
	fastify.post('/api/tournament/:tournamentId/match/:matchId/start', {
		schema: {
			params: matchParamsSchema
		}
	}, async (req: FastifyRequest, reply: FastifyReply) => {
		try {
			const { tournamentId, matchId } = req.params as { tournamentId: string; matchId: string };
			
			const tId = sanitizeId(tournamentId);
			const mId = sanitizeId(matchId);
			
			if (tId <= 0 || mId <= 0)
				return reply.status(400).send({ success: false, message: 'Invalid id(s)' });

			let m = await tournamentManager.prepareMatch(tId, mId);
			if (!m || !m.gameId)
				return reply.status(404).send({ success: false, message: 'Failed to prepare match/game' });
			
			const gameId = m.gameId;
			let gameEngine = activeGames.get(gameId);
			if (!gameEngine) {
				const game = database.games.getGameById(gameId);
				if (!game)
					return reply.status(404).send({ success: false, message: 'Game not found' });

				let gameStateRow = database.gameState.getGameStateByGameId(gameId);
				if (!gameStateRow)
					gameStateRow = database.gameState.createGameState({ gameId });

				const initialGameState = {
					id: mId,
					gameId: gameId,
					players: [
						{ 
						id: 1, 
						name: m.p1?.name ? sanitizeAlias(m.p1.name) : 'Player 1', 
						pos: 70, 
						score: 0,
						gameId: gameId,
						connectionStatus: 'active',
						lastActivity: new Date().toISOString()
						},
						{ 
						id: 2, 
						name: m.p2?.name ? sanitizeAlias(m.p2.name) : 'Player 2', 
						pos: 70, 
						score: 0,
						gameId: gameId,
						connectionStatus: 'active',
						lastActivity: new Date().toISOString()
						}
					],
					ballPosX: 200,
					ballPosY: 100,
					ballVelX: 0,
					ballVelY: 0,
					mode: '2P',
					lastContact: 0,
					lastActivity: new Date().toISOString(),
				};

				gameEngine = new BaseGameEngine(initialGameState);
				
				// Set AI players with their stored difficulty (default to 'normal' if not set)
				if (m.p1?.tpt === 'ai') {
					const p1Difficulty = (m.p1.difficulty && ['easy', 'normal', 'hard'].includes(m.p1.difficulty)) 
						? m.p1.difficulty as AIDifficulty 
						: 'normal';
					gameEngine.setPlayerAI(1, true, p1Difficulty);
					console.log(`🎮 Tournament: Set AI Player 1 with difficulty: ${p1Difficulty}`);
				}
				if (m.p2?.tpt === 'ai') {
					const p2Difficulty = (m.p2.difficulty && ['easy', 'normal', 'hard'].includes(m.p2.difficulty)) 
						? m.p2.difficulty as AIDifficulty 
						: 'normal';
					gameEngine.setPlayerAI(2, true, p2Difficulty);
					console.log(`🎮 Tournament: Set AI Player 2 with difficulty: ${p2Difficulty}`);
				}

				activeGames.set(gameId, gameEngine);
				registerTournamentGame(gameId, mId);
			}

			if (!gameEngine.isRunning()) {
				gameEngine.startGame();
				console.log(`🎮 Tournament match ${mId} game engine ${gameId} started!`);

				registerTournamentGame(gameId, mId);

				database.games.updateGame(gameId, { 
					status: 'active',
					startedAt: new Date().toISOString()
				});
			}
			
			if (m && m.id) {
				m.status = 'active';
				m.startedAt = new Date().toISOString();
				m = database.tournaments.updateMatch(m);
				if (!m)
					return reply.status(400).send({ success: false, message: 'Failed to update match status' });
				
				const tournamentUpdate = database.tournaments.updateTournament(tId, { curM: m });
				if (!tournamentUpdate) {
					console.error(`Failed to update tournament ${tId} with new match status`);
				}
			}

			broadcastGameStartToMatch(mId, gameId);
			console.log(`📡 Broadcasted game start for match ${mId}, game ${gameId}`);

			broadcastTournamentState(tId);
			console.log(`📡 Broadcasted tournament state update for tournament ${tId}`);

			return reply.send({ success: true, data: m });
		} catch (error) {
			fastify.log.error(error);
			return reply.status(500).send({ success: false, message: 'Failed to start match' });
		}
	});

	// End a match
	fastify.post('/api/tournament/:tournamentId/match/:matchId/end', {
		schema: {
			params: matchParamsSchema,
			body: endMatchBodySchema
		}
	}, async (request: FastifyRequest, reply: FastifyReply) => {
		try {
			const { tournamentId, matchId } = request.params as { tournamentId: string; matchId: string };
			const { winnerId } = request.body as { winnerId?: number };
			
			const tId = sanitizeId(tournamentId);
			const mId = sanitizeId(matchId);
			
			if (tId <= 0 || mId <= 0)
				return reply.status(400).send({ success: false, message: 'Invalid id(s)' });
			
			if (winnerId) {
				const sanitizedWinnerId = sanitizeId(winnerId);
				if (sanitizedWinnerId <= 0)
					return reply.status(400).send({ success: false, message: 'Invalid winner id' });
				
				const match = tournamentManager.getMatch(mId);
				if (match) {
					let actualWinnerId = sanitizedWinnerId;
					if (sanitizedWinnerId === 1 && match.p1) {
						actualWinnerId = match.p1.id;
					} else if (sanitizedWinnerId === 2 && match.p2) {
						actualWinnerId = match.p2.id;
					}
					
					match.winnerId = actualWinnerId;
					database.tournaments.updateMatch({ id: mId, winnerId: actualWinnerId });
				}
			}
			
			if (!(await tournamentManager.endMatch(mId)))
				return reply.status(400).send({ success: false, message: 'Failed to end match' });

			const m = tournamentManager.getMatch(mId);
			if (!m)
				return reply.status(404).send({ success: false, message: 'Match not found' });

			return reply.send({ success: true, data: m });
		} catch (error) {
			fastify.log.error(error);
			return reply.status(500).send({ success: false, message: 'Failed to end match' });
		}
	});
}

export default tournamentRoutes;

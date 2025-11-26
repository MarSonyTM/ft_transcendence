import { FastifyInstance, FastifyRequest, FastifyReply, FastifyPluginOptions } from 'fastify';
import { tournamentManager } from '../tournament/tournamentManager';
import { TPT, Tournament, TournamentPlayer } from '../types/index';
import { activeGames } from './game';
import { database } from '../database/index';
import { BaseGameEngine } from '../game/gameEngine';
import { registerTournamentGame } from '../websocket/websocketHandler';

async function tournamentRoutes(fastify: FastifyInstance, _options: FastifyPluginOptions) {

	// -------------------------------------- TOURNAMENTS -------------------------------------- //
	// List all tournaments
	fastify.get('/api/tournament', async (_request: FastifyRequest, reply: FastifyReply) => {
		try {
			const tournaments = tournamentManager.getAllTournaments();
			if (!tournaments)
				return reply.status(400).send({ success: false, message: 'No tournaments received' });
			let tts: Tournament[] = [];
			for (let t of tournaments)
				tts.push(t);
			return reply.send({ success: true, data: tts});
		} catch (error) {
			fastify.log.error(error);
			return reply.status(500).send({ success: false, message: 'Failed to list tournaments' });
		}
	});

	// Create new tournament
	fastify.post('/api/tournament', async (request: FastifyRequest, reply: FastifyReply) => {
		try {
			const { name, id, ok } = request.body as { name: string, id: string, ok: string };
			if (ok === 'false' || !name || isNaN(+id) || +id <= 0)
				return reply.status(401).send({ success: false, message: 'No authenticated User' });
			let tournament = await tournamentManager.createTournament(name, +id);
			if (!tournament)
				return reply.status(400).send({ success: false, message: 'Failed to create tournament'});
			return reply.send({ success: true, data: tournament });
		} catch (error) {
			fastify.log.error(error);
			return reply.status(500).send({ success: false, message: 'Failed to create tournament' });
		}
	});

	// Get tournament by ID
	fastify.get('/api/tournament/:tournamentId', async (request: FastifyRequest, reply: FastifyReply) => {
		try {
			const { tournamentId } = request.params as { tournamentId: string };
			const tId = +tournamentId;
			if (isNaN(tId) || tId <= 0)
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
	fastify.post('/api/tournament/:tournamentId/start', async (request: FastifyRequest, reply: FastifyReply) => {
		try {	
			const { tournamentId } = request.params as { tournamentId: string };
			const tId = +tournamentId;
			if (isNaN(tId) || tId <= 0)
				return reply.status(400).send({ success: false, message: 'Invalid tournament id' });
			const setup = await tournamentManager.setupMatches(tId);
			if (!setup)
				return reply.status(400).send({ success: false, message: 'Failed to setup matches before starting tournament' });
			
			const started = await tournamentManager.startTournament(tId);
			if (!started)
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
	fastify.post('/api/tournament/:tournamentId/leave', async (request: FastifyRequest ,reply: FastifyReply) => {
		try {
			const { tournamentId } = request.params as { tournamentId: string };
			const tId = +tournamentId;
			if (isNaN(tId) || tId <= 0)
				return reply.status(400).send({ success: false, message: 'Invalid tournament id' });
			const { playerId } = request.body as { playerId: number };
			const pId = +playerId;
			if (isNaN(pId) || pId <= 0)
				return reply.status(400).send({ success: false, message: 'Invalid player id' });
			const ok = tournamentManager.leaveTournament(tId, pId);
			if (!ok)
				return reply.status(404).send({ success: false, message: 'Tournament or player not found' });
			return reply.send({ success: true, message: 'Left tournament' });
		} catch (error) {
			fastify.log.error(error);
			return reply.status(500).send({ success: false, message: 'Failed to leave tournament' });
		}
	});

	// End tournament
	fastify.post('/api/tournament/:tournamentId/end', async (request: FastifyRequest, reply: FastifyReply) => {
		try {
			const { tournamentId } = request.params as { tournamentId: string };
			const tId = +tournamentId;
			if (isNaN(tId) || tId <= 0)
				return reply.status(400).send({ success: false, message: 'Invalid tournament id' });
			const ok = await tournamentManager.endTournament(tId);
			if (!ok)
				return reply.status(404).send({ success: false, message: 'Tournament not found or already ended' });
			const t = tournamentManager.getTournament(tId);
			if (!t)
				return reply.status(404).send({ success: false, message: 'Tournament not found' });
			return reply.send({ success: true, data: t });
		} catch (error) {
			fastify.log.error(error);
			return reply.status(500).send({ success: false, message: 'Failed to end tournament' });
		}
	});

	fastify.post('/api/tournament/:tournamentId/delete', async (request: FastifyRequest, reply: FastifyReply) => {
		try {
			const { tournamentId } = request.params as { tournamentId: string };
			const tId = +tournamentId;
			if (isNaN(tId) || tId <= 0)
				return reply.status(400).send({ success: false, message: 'Invalid tournament id' });
			await tournamentManager.deleteTournament(tId);
			return reply.send({ success: true, message: 'Tournament deleted' });
		} catch (err) {
			fastify.log.error(err);
			return reply.status(500).send({ success: false, message: 'Failed to delete tournament' });
		}
	})

	// -------------------------------------- PLAYERS -------------------------------------- //
	// Get all players in a tournament
	fastify.get('/api/tournament/:tournamentId/player', async (request: FastifyRequest, reply: FastifyReply) => {
		try {
			const { tournamentId } = request.params as { tournamentId: string };
			const tId = +tournamentId;
			if (isNaN(tId) || tId <= 0)
				return reply.status(400).send({ success: false, message: 'Invalid tournament id' });
			const t = tournamentManager.getTournament(tId);
			if (!t)
				return reply.status(404).send({ success: false, message: 'Tournament not found' });
			return reply.send({ success: true, data: t.players });
		} catch (error) {
			fastify.log.error(error);
			return reply.status(500).send({ success: false, message: 'Failed to get players' });
		}
	});

	// Post/Add player //Join tournament
	fastify.post('/api/tournament/:tournamentId/player', async (request: FastifyRequest, reply: FastifyReply) => {
		try {
			const { tournamentId } = request.params as { tournamentId: string };
			const { name, tpt, id } = request.body as { name: string; tpt: TPT, id: string };
			const tId = +tournamentId;
			if (isNaN(tId) || tId <= 0)
				return reply.status(400).send({ success: false, message: 'Invalid tournament id' });
			if (!name || (id !== '-' && (isNaN(+id) || +id <= 0)))
				return reply.status(401).send({ success: false, message: 'Not authenticated' });
			let success;
			if (id === '-')
				success = await tournamentManager.addPlayerToTournament(tId, name, tpt);
			else
				success = await tournamentManager.addPlayerToTournament(tId, name, tpt, +id);
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
	fastify.post('/api/tournament/:tournamentId/match/:matchId/player/:playerId/ready', async (request: FastifyRequest, reply: FastifyReply) => {
		try {
			const { tournamentId, matchId, playerId } = request.params as { tournamentId: string; matchId: string; playerId: string };
			if (isNaN(+tournamentId) || isNaN(+matchId) || isNaN(+playerId)
				|| +tournamentId <= 0 || +matchId <= 0 || +playerId <= 0)
				return reply.status(400).send({ success: false, message: 'Invalid id(s)' });
			let m = tournamentManager.getMatch(+matchId);
			if (!m)
				return reply.status(404).send({ success: false, message: 'Match not found' });
			let pId = +playerId;
			if (!m.p1 || !m.p2)
				return reply.status(404).send({ success: false, message: 'Match players not found' });
			const p = m.p1.id === pId ? m.p1 : m.p2;
			if (!p)
				return reply.status(404).send({ success: false, message: 'Player not found in match' });
			const success = tournamentManager.toggleMatchPlayerReady(m.tournamentId, m.id, pId);
			if (!success)
				return reply.status(400).send({ success: false, message: 'Unable to toggle player ready' });
			m = tournamentManager.getMatch(+matchId);
			if (!m || !m.tournamentId)
				return reply.status(404).send({ success: false, message: 'Match not found' });
			let t = tournamentManager.getTournament(m.tournamentId);
			if (!t)
				return reply.status(404).send({ success: false, message: 'Tournament not found' });
			return reply.send({ success: true, data: t});
		} catch (error) {
			fastify.log.error(error);
			return reply.status(500).send({ success: false, message: 'Failed to toggle player ready status' });
		}
	});

	// -------------------------------------- ARCHIVE -------------------------------------- //
	// Get archive snapshot //TODO
	fastify.get('/api/tournament/:tournamentId/archive', async (request: FastifyRequest, reply: FastifyReply) => {
		try {
			const { tournamentId } = request.params as { tournamentId: string };
			const tId = +(tournamentId);
			if (isNaN(tId) || tId <= 0)
				return reply.status(400).send({ success: false, message: 'Invalid tournament id' });
			// const archive = tournamentManager.getArchive(tId);
			// if (!archive)
			// 	return reply.status(404).send({ success: false, message: 'Archive not found' });
			// return reply.send({ success: true, data: archive });
		} catch (error) {
			fastify.log.error(error);
			return reply.status(500).send({ success: false, message: 'Failed to get archive' });
		}
	});

	// List all archives //TODO
	fastify.get('/api/tournament/archives', async (_request: FastifyRequest, reply: FastifyReply) => {
		try {
			// const archives = tournamentManager.getAllArchives();
			// if (!archives)
			// 	return reply.status(404).send({ success: false, message: 'Archives not found' });
			// return reply.send({ success: true, data: archives });
		} catch (error) {
			fastify.log.error(error);
			return reply.status(500).send({ success: false, message: 'Failed to list archives' });
		}
	});

	// -------------------------------------- MATCHES -------------------------------------- //
	// Get current match (next in queue) for a tournament
	fastify.get('/api/tournament/:tournamentId/match/current', async (request: FastifyRequest, reply: FastifyReply) => {
		try {
			const { tournamentId } = request.params as { tournamentId: string };
			const tId = +tournamentId;
			if (isNaN(tId) || tId <= 0)
				return reply.status(400).send({ success: false, message: 'Invalid tournament id' });
			const m = await tournamentManager.getCurrentMatch(tId);
			if (!m)
				return reply.status(404).send({ success: false, message: 'No current match available' });
			return reply.send({ success: true, data: m });
		} catch (error) {
			fastify.log.error(error);
			return reply.status(500).send({ success: false, message: 'Failed to get current match' });
		}
	});

	// Get all players in match
	fastify.get('/api/tournament/:tournamentId/match/:matchId/player', async (request: FastifyRequest, reply: FastifyReply) => {
		try {
			const { tournamentId, matchId } = request.params as { tournamentId: string; matchId: string };
			const tId = +tournamentId;
			const mId = +matchId;
			if (isNaN(tId) || isNaN(mId) || tId <= 0 || mId <= 0)
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
	fastify.get('/api/tournament/:tournamentId/match/:matchId', async (request: FastifyRequest, reply: FastifyReply) => {
		try {
			const { tournamentId, matchId } = request.params as { tournamentId: string; matchId: string };
			const tId = +tournamentId;
			const mId = +matchId;
			if (isNaN(tId) || isNaN(mId) || tId <= 0 || mId <= 0)
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
	fastify.post('/api/tournament/:tournamentId/match/:matchId/start', async (req: FastifyRequest, reply: FastifyReply) => {
		try {
			const { tournamentId, matchId } = req.params as { tournamentId: string; matchId: string };
			const tId = +tournamentId;
			const mId = +matchId;
			if (isNaN(tId) || isNaN(mId) || tId <= 0 || mId <= 0)
				return reply.status(400).send({ success: false, message: 'Invalid id(s)' });

			let m = await tournamentManager.prepareMatch(tId, mId);
			if (!m || !m.gameId)
				return reply.status(404).send({ success: false, message: 'Failed to prepare match/game' });
			
			const gameId = m.gameId;
			

			let gameEngine = activeGames.get(gameId);
			
			if (!gameEngine) {
				const game = database.games.getGameById(gameId);
				if (!game) {
					return reply.status(404).send({ success: false, message: 'Game not found' });
				}

				let gameStateRow = database.gameState.getGameStateByGameId(gameId);
				if (!gameStateRow) {
					gameStateRow = database.gameState.createGameState({ gameId });
				}

				const initialGameState = {
					id: mId,
					gameId: gameId,
					players: [
						{ 
						id: 1, 
						name: m.p1?.name || 'Player 1', 
						pos: 70, 
						score: 0,
						gameId: gameId,
						connectionStatus: 'active',
						lastActivity: new Date().toISOString()
						},
						{ 
						id: 2, 
						name: m.p2?.name || 'Player 2', 
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

				if (m.p1?.tpt === 'ai') {
					gameEngine.setPlayerAI(1, true, 'normal');
				}
				if (m.p2?.tpt === 'ai') {
					gameEngine.setPlayerAI(2, true, 'normal');
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
				m = database.tournaments.updateMatch(m);
				if (!m)
					return reply.status(400).send({ success: false, message: 'Failed to update match' });
			}

			return reply.send({ success: true, data: m });
		} catch (error) {
			fastify.log.error(error);
			return reply.status(500).send({ success: false, message: 'Failed to start match' });
		}
	});

	// End a match
	fastify.post('/api/tournament/:tournamentId/match/:matchId/end', async (request: FastifyRequest, reply: FastifyReply) => {
		try {
			const { tournamentId, matchId } = request.params as { tournamentId: string; matchId: string };
			const { winnerId } = request.body as { winnerId?: number };
			const tId = +tournamentId;
			const mId = +matchId;
			if (isNaN(tId) || isNaN(mId) || tId <= 0 || mId <= 0)
				return reply.status(400).send({ success: false, message: 'Invalid id(s)' });
			
			if (winnerId) {
				const match = tournamentManager.getMatch(mId);
				if (match) {
					match.winnerId = winnerId;
					database.tournaments.updateMatch({ id: mId, winnerId });
				}
			}
			
			const ok = await tournamentManager.endMatch(mId);
			if (!ok)
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

import { FastifyInstance, FastifyRequest, FastifyReply, FastifyPluginOptions } from 'fastify';
import { tournamentManager as TManager } from '../tournament/tournamentManager';
import { TPT, database } from '../database/index';
import { BaseGameEngine } from '../game/gameEngine';
import { activeGames } from './game';
import { broadcastCountdownToMatch, broadcastGameStartToMatch } from '../websocket/tournamentHandler';
import { GameState } from '../../../shared/gameTypes';

// Re-export active tournaments instance for potential external use (similar to other routes)
export const activeTournaments: typeof TManager = TManager;

// Request payload types
interface CreateTournamentBody {
	hostId: string;
	hostUsername: string;
}

interface JoinTournamentBody {
	playerId: string;
	name: string;
	tpt: TPT;
	isReady?: boolean;
}

interface ToggleReadyBody {
	playerId: string;
}

interface LeaveTournamentBody {
	playerId: string;
}

interface StartMatchBody {
	gameId?: number; // optional: if not provided, server will create one and start
}

interface EndMatchBody {
	winnerId?: string;
}

interface ToggleMatchReadyBody {
	playerId: string;
}

// Plugin function that registers all tournament routes
async function tournamentsRoutes(fastify: FastifyInstance, _options: FastifyPluginOptions) {
	// List all tournaments
	fastify.get('/api/tournament', async (_request: FastifyRequest, reply: FastifyReply) => {
		try {
			const tournaments = TManager.getAllTournaments();
			return reply.send({ success: true, count: tournaments.length, data: tournaments });
		} catch (error) {
			fastify.log.error(error);
			return reply.code(500).send({ success: false, message: 'Failed to get tournaments' });
		}
	});

	// Create new tournament
	fastify.post('/api/tournament', async (request: FastifyRequest<{ Body: CreateTournamentBody }>, reply: FastifyReply) => {
		try {
			const { hostId, hostUsername } = request.body;
			if (!hostId || !hostUsername) {
				return reply.code(400).send({ success: false, message: 'hostId and hostUsername are required' });
			}
			const t = TManager.createTournament(hostId, hostUsername);
			return reply.code(201).send({ success: true, data: t });
		} catch (error) {
			fastify.log.error(error);
			return reply.code(500).send({ success: false, message: 'Failed to create tournament' });
		}
	});

	// Get tournament by ID
	fastify.get('/api/tournament/:tournamentId', async (request: FastifyRequest, reply: FastifyReply) => {
		try {
			const { tournamentId } = request.params as { tournamentId: string };
			const t = TManager.getTournament(tournamentId);
			if (!t) return reply.code(404).send({ success: false, message: 'Tournament not found' });
			return reply.send({ success: true, data: t });
		} catch (error) {
			fastify.log.error(error);
			return reply.code(500).send({ success: false, message: 'Failed to get tournament' });
		}
	});

	// Get players
	fastify.get('/api/tournament/:tournamentId/players', async (request: FastifyRequest, reply: FastifyReply) => {
		try {
			const { tournamentId } = request.params as { tournamentId: string };
			const t = TManager.getTournament(tournamentId);
			if (!t) return reply.code(404).send({ success: false, message: 'Tournament not found' });
			return reply.send({ success: true, data: t.players });
		} catch (error) {
			fastify.log.error(error);
			return reply.code(500).send({ success: false, message: 'Failed to get players' });
		}
	});

	// Join tournament
	fastify.post('/api/tournament/:tournamentId/join', async (
		request: FastifyRequest<{ Params: { tournamentId: string }; Body: JoinTournamentBody }>,
		reply: FastifyReply
	) => {
		try {
			const { tournamentId } = request.params;
			const { playerId, name, tpt, isReady = false } = request.body;
			if (!playerId || !name || !tpt) {
				return reply.code(400).send({ success: false, message: 'playerId, name and tpt are required' });
			}
			const result = TManager.joinTournament(tournamentId, playerId, name, tpt, isReady);
			if (!result.success) return reply.code(400).send(result);
			return reply.send({ success: true, data: result.tournament });
		} catch (error) {
			fastify.log.error(error);
			return reply.code(500).send({ success: false, message: 'Failed to join tournament' });
		}
	});

	// Leave tournament
	fastify.post('/api/tournament/:tournamentId/leave', async (
		request: FastifyRequest<{ Params: { tournamentId: string }; Body: LeaveTournamentBody }>,
		reply: FastifyReply
	) => {
		try {
			const { tournamentId } = request.params;
			const { playerId } = request.body;
			if (!playerId) return reply.code(400).send({ success: false, message: 'playerId is required' });
			const ok = TManager.leaveTournament(tournamentId, playerId);
			if (!ok) return reply.code(404).send({ success: false, message: 'Tournament or player not found' });
			return reply.send({ success: true, message: 'Left tournament' });
		} catch (error) {
			fastify.log.error(error);
			return reply.code(500).send({ success: false, message: 'Failed to leave tournament' });
		}
	});

	// Toggle tournament-level player ready
	fastify.post('/api/tournament/:tournamentId/ready', async (
		request: FastifyRequest<{ Params: { tournamentId: string }; Body: ToggleReadyBody }>,
		reply: FastifyReply
	) => {
		try {
			const { tournamentId } = request.params;
			const { playerId } = request.body;
			if (!playerId) return reply.code(400).send({ success: false, message: 'playerId is required' });
			const ok = TManager.togglePlayerReady(tournamentId, playerId);
			if (!ok) return reply.code(404).send({ success: false, message: 'Tournament or player not found' });
			const t = TManager.getTournament(tournamentId);
			return reply.send({ success: true, data: t });
		} catch (error) {
			fastify.log.error(error);
			return reply.code(500).send({ success: false, message: 'Failed to toggle ready' });
		}
	});

	// Start tournament
	fastify.post('/api/tournament/:tournamentId/start', async (request: FastifyRequest, reply: FastifyReply) => {
		try {
			const { tournamentId } = request.params as { tournamentId: string };
			const t = TManager.getTournament(tournamentId);
			if (!t) return reply.code(404).send({ success: false, message: 'Tournament not found' });
			const ok = TManager.startTournament(tournamentId);
			if (!ok) return reply.code(400).send({ success: false, message: 'Failed to start tournament' });
			return reply.send({ success: true, message: 'Tournament started' });
		} catch (error) {
			fastify.log.error(error);
			return reply.code(500).send({ success: false, message: 'Failed to start tournament' });
		}
	});

	// End tournament
	fastify.post('/api/tournament/:tournamentId/end', async (request: FastifyRequest, reply: FastifyReply) => {
		try {
			const { tournamentId } = request.params as { tournamentId: string };
			const ok = TManager.endTournament(tournamentId);
			if (!ok) return reply.code(404).send({ success: false, message: 'Tournament not found or already ended' });
			return reply.send({ success: true, message: 'Tournament ended' });
		} catch (error) {
			fastify.log.error(error);
			return reply.code(500).send({ success: false, message: 'Failed to end tournament' });
		}
	});

	// Persist archive manually (optional, since end auto-persists)
	fastify.post('/tournaments/:tournamentId/archive', async (request: FastifyRequest, reply: FastifyReply) => {
		try {
			const { tournamentId } = request.params as { tournamentId: string };
			const t = TManager.getTournament(tournamentId);
			if (!t) return reply.code(404).send({ success: false, message: 'Tournament not found' });
			const ok = TManager.persistArchive(tournamentId);
			if (!ok) return reply.code(400).send({ success: false, message: 'Failed to archive tournament' });
			return reply.send({ success: true, message: 'Tournament archived' });
		} catch (error) {
			fastify.log.error(error);
			return reply.code(500).send({ success: false, message: 'Failed to archive tournament' });
		}
	});

	// Get archive snapshot
	fastify.get('/tournaments/:tournamentId/archive', async (request: FastifyRequest, reply: FastifyReply) => {
		try {
			const { tournamentId } = request.params as { tournamentId: string };
			const archive = TManager.getArchive(tournamentId);
			if (!archive) return reply.code(404).send({ success: false, message: 'Archive not found' });
			return reply.send({ success: true, data: archive });
		} catch (error) {
			fastify.log.error(error);
			return reply.code(500).send({ success: false, message: 'Failed to get archive' });
		}
	});

	// List all archives//TODO /tournament/archives ? //TODO add /api/ ?
	fastify.get('/tournaments-archives', async (_request: FastifyRequest, reply: FastifyReply) => {
		try {
			const archives = TManager.getAllArchives();
			return reply.send({ success: true, count: archives.length, data: archives });
		} catch (error) {
			fastify.log.error(error);
			return reply.code(500).send({ success: false, message: 'Failed to list archives' });
		}
	});

	// Get current match (next in queue) for a tournament
	fastify.get('/api/tournament/:tournamentId/match/current', async (request: FastifyRequest, reply: FastifyReply) => {
		try {
			const { tournamentId } = request.params as { tournamentId: string };
			const match = TManager.getCurrentMatch(tournamentId);
			if (!match) return reply.code(404).send({ success: false, message: 'No current match available' });
			return reply.send({ success: true, data: match });
		} catch (error) {
			fastify.log.error(error);
			return reply.code(500).send({ success: false, message: 'Failed to get current match' });
		}
	});

	// Get active matches for a tournament
	fastify.get('/api/tournament/:tournamentId/match/active', async (request: FastifyRequest, reply: FastifyReply) => {
		try {
			const { tournamentId } = request.params as { tournamentId: string };
			const matches = TManager.getActiveMatches(tournamentId);
			return reply.send({ success: true, count: matches.length, data: matches });
		} catch (error) {
			fastify.log.error(error);
			return reply.code(500).send({ success: false, message: 'Failed to get active matches' });
		}
	});

	// Get match by ID in a tournament
	fastify.get('/api/tournament/:tournamentId/match/:matchId', async (request: FastifyRequest, reply: FastifyReply) => {
		try {
			const { tournamentId, matchId } = request.params as { tournamentId: string; matchId: string };
			const match = TManager.getMatch(tournamentId, matchId);
			if (!match) return reply.code(404).send({ success: false, message: 'Match not found' });
			const players = TManager.getPlayersInMatch(tournamentId, matchId);
			return reply.send({ success: true, data: { match, players } });
		} catch (error) {
			fastify.log.error(error);
			return reply.code(500).send({ success: false, message: 'Failed to get match' });
		}
	});

	// Toggle match-level ready for a player
	fastify.post('/api/tournament/:tournamentId/match/:matchId/ready', async (
		request: FastifyRequest<{ Params: { tournamentId: string; matchId: string }; Body: ToggleMatchReadyBody }>,
		reply: FastifyReply
	) => {
		try {
			const { tournamentId, matchId } = request.params;
			const { playerId } = request.body;
			if (!playerId) return reply.code(400).send({ success: false, message: 'playerId is required' });
			const ok = TManager.toggleMatchPlayerReady(tournamentId, matchId, playerId);
			if (!ok) return reply.code(404).send({ success: false, message: 'Tournament, match, or player not found' });
			const match = TManager.getMatch(tournamentId, matchId);
			return reply.send({ success: true, data: match });
		} catch (error) {
			fastify.log.error(error);
			return reply.code(500).send({ success: false, message: 'Failed to toggle match ready' });
		}
	});

	// Start a match
	fastify.post('/api/tournament/:tournamentId/match/:matchId/start', async (
		request: FastifyRequest<{ Params: { tournamentId: string; matchId: string }; Body: StartMatchBody }>,
		reply: FastifyReply
	) => {
		try {
			const { tournamentId, matchId } = request.params;
			const body = request.body || {};
			const providedGameId = body.gameId;

			// If a gameId is provided, attempt to start immediately using it
			if (typeof providedGameId === 'number') {
				const ok = TManager.startMatch(tournamentId, matchId, providedGameId);
				if (!ok) return reply.code(400).send({ success: false, message: 'Failed to start match (not ready?)' });
				// Notify match channel clients that game has started
				broadcastGameStartToMatch(matchId, providedGameId);
				const match = TManager.getMatch(tournamentId, matchId);
				return reply.send({ success: true, data: match });
			}

			// Otherwise, orchestrate countdown + game creation similar to room start
			const players = TManager.getPlayersInMatch(tournamentId, matchId);
			if (!players || players.length < 1) {
				return reply.code(404).send({ success: false, message: 'Match or players not found' });
			}

			// Kick off a short countdown for UX and return immediately
			broadcastCountdownToMatch(matchId);
			reply.send({ success: true, message: 'Countdown started' });

			setTimeout(() => {
				try {
					const mode = '2P';
					const createdGame = database.games.createGame({ mode, difficulty: 'normal' });
					const gameId = createdGame.id;

					// Try to attach DB players when we can parse user ids, else fall back to engine-only players
					const positions = ['left', 'right'];

					const enginePlayers = players.slice(0, 2).map((tp, index) => {
						const parsedId = parseInt(tp.playerId);
						const userId = Number.isFinite(parsedId) && parsedId > 0 ? parsedId : index + 1;
						// Best-effort: persist to DB only if we have a real user id
						if (Number.isFinite(parsedId) && parsedId > 0) {
							try {
								const position = positions[index] || 'left';
								database.players.addPlayerToGame(gameId, parsedId, position);
							} catch {
								// non-fatal
							}
						}
						return {
							id: userId,
							name: tp.name || `Player ${index + 1}`,
							gameId,
							isReady: tp.isReady === true,
							pos: 70,
							score: 0,
							connectionStatus: 'connected',
							lastActivity: new Date().toISOString()
						};
					});

					const initialGameState: GameState = {
						id: 0,
						gameId,
						players: enginePlayers,
						ballPosX: 200,
						ballPosY: 100,
						ballVelX: 0,
						ballVelY: 0,
						mode,
						lastContact: 0,
						lastActivity: new Date().toISOString(),
					};

					const gameEngine: BaseGameEngine = new BaseGameEngine(initialGameState);

					// Attach AI players based on tournament player type
					players.slice(0, 2).forEach((tp, index) => {
						const playerNum = index + 1;
						if (tp.tpt === 'ai') {
							const difficulty = 'normal';
							gameEngine.setPlayerAI(playerNum, true, difficulty);
						}
					});

					activeGames.set(gameId, gameEngine);
					gameEngine.startGame();

					// Update in-memory tournament match and notify clients
					const ok = TManager.startMatch(tournamentId, matchId, gameId);
					if (ok) {
						broadcastGameStartToMatch(matchId, gameId);
					} else {
						// if players not ready, we still keep engine running; could be stopped if desired
					}
				} catch (e) {
					console.error('Error starting tournament match after countdown:', e);
				}
			}, 3000);
		} catch (error) {
			fastify.log.error(error);
			// If reply might have been sent already (countdown branch), just bail
			try {
				return reply.code(500).send({ success: false, message: 'Failed to start match' });
			} catch {}
		}
	});

	// End a match
	fastify.post('/api/tournament/:tournamentId/match/:matchId/end', async (
		request: FastifyRequest<{ Params: { tournamentId: string; matchId: string }; Body: EndMatchBody }>,
		reply: FastifyReply
	) => {
		try {
			const { tournamentId, matchId } = request.params;
			const { winnerId } = request.body || {};
			const ok = TManager.endMatch(tournamentId, matchId, winnerId);
			if (!ok) return reply.code(400).send({ success: false, message: 'Failed to end match' });
			const match = TManager.getMatch(tournamentId, matchId);
			return reply.send({ success: true, data: match });
		} catch (error) {
			fastify.log.error(error);
			return reply.code(500).send({ success: false, message: 'Failed to end match' });
		}
	});
}

export default tournamentsRoutes;


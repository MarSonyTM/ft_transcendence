import { FastifyInstance, FastifyRequest, FastifyReply, FastifyPluginOptions } from 'fastify';
import { tournamentManager as TManager } from '../tournament/tournamentManager';
import { TPT } from '../types/index';
import { broadcastCountdownToMatch, broadcastGameStartToMatch, publicTournamentShape, publicMatchShape } from '../websocket/tournamentHandler';

// Plugin function that registers all tournament routes
async function tournamentRoutes(fastify: FastifyInstance, _options: FastifyPluginOptions) {

	// -------------------------------------- TOURNAMENTS -------------------------------------- //
	// List all tournaments
	fastify.get('/api/tournament', async (_request: FastifyRequest, reply: FastifyReply) => {
		try {
			const tournaments = await TManager.getAllTournaments();
			return reply.send({ success: true, count: tournaments.length, tournaments: tournaments.map(publicTournamentShape)});
		} catch (error) {
			fastify.log.error(error);
			return reply.status(500).send({ success: false, message: 'Failed to list tournaments' });
		}
	});

	// Create new tournament
	fastify.post('/api/tournament', async (request: FastifyRequest, reply: FastifyReply) => {
		try {
			const { name, id, ok } = request.body as { name: string, id: string, ok: boolean };
			if (ok === false || !name || isNaN(+id) || +id <= 0)
				return reply.status(401).send({ success: false, message: 'No authenticated User' });
			let tournament = await TManager.createTournament(name, +id);
			if (!tournament)
				return reply.status(400).send({ success: false, message: 'Failed to create tournament'});
			return reply.status(201).send({ success: true, tournament: publicTournamentShape(tournament) });
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
			const t = await TManager.getTournament(tId);
			if (!t)
				return reply.status(404).send({ success: false, message: 'Tournament not found' });
			return reply.send({ success: true, tournament: t && publicTournamentShape(t) });
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
			const setup = await TManager.setupMatches(tId);
			if (!setup)
				return reply.status(400).send({ success: false, message: 'Failed to setup matches before starting tournament' });
			const started = await TManager.startTournament(tId);
			if (!started)
				return reply.status(400).send({ success: false, message: 'Failed to start tournament' });
			const t = TManager.getTournament(tId);
			return reply.send({ success: true, tournament: publicTournamentShape(t) });
			} catch (error) {
				fastify.log.error(error);
				return reply.status(500).send({ success: false, message: 'Failed to start tournament' });
		}
	});

	// End tournament
	fastify.post('/api/tournament/:tournamentId/end', async (request: FastifyRequest, reply: FastifyReply) => {
		try {
			const { tournamentId } = request.params as { tournamentId: string };
			const tId = +tournamentId;
			if (isNaN(tId) || tId <= 0)
				return reply.status(400).send({ success: false, message: 'Invalid tournament id' });
			const ok = await TManager.endTournament(tId);
			if (!ok)
				return reply.status(404).send({ success: false, message: 'Tournament not found or already ended' });
			const t = await TManager.getTournament(tId);
			return reply.send({ tournament: t && publicTournamentShape(t) });
		} catch (error) {
			fastify.log.error(error);
			return reply.status(500).send({ success: false, message: 'Failed to end tournament' });
		}
	});

	// -------------------------------------- PLAYERS -------------------------------------- //
	// Get all players in a tournament
	fastify.get('/api/tournament/:tournamentId/player', async (request: FastifyRequest, reply: FastifyReply) => {
		try {
			const { tournamentId } = request.params as { tournamentId: string };
			const tId = +tournamentId;
			if (isNaN(tId) || tId <= 0)
				return reply.status(400).send({ success: false, message: 'Invalid tournament id' });
			const t = await TManager.getTournament(tId);
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
			const { name, idString: id, tpt } = request.body as { name: string; idString: string, tpt: TPT };
			const tId = +tournamentId;
			if (isNaN(tId) || tId <= 0)
				return reply.status(400).send({ success: false, message: 'Invalid tournament id' });
			if (!name || (id !== '-' && (isNaN(+id) || +id <= 0)))
				return reply.status(401).send({ error: 'Not authenticated' });
			let success;
			if (id === '-')
				success = await TManager.addPlayerToTournament(tId, name, tpt);
			else
				success = await TManager.addPlayerToTournament(tId, name, tpt, +id);
			if (!success)
				return reply.status(400).send({ error: 'Failed to add player to tournament' });
			const t = await TManager.getTournament(tId);
			return { success: true, tournament: t && publicTournamentShape(t) };
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
			const success = await TManager.toggleMatchPlayerReady(+tournamentId, +matchId, +playerId);
			if (!success)
				return reply.status(400).send({ success: false, message: 'Unable to toggle player ready' });
			const m = await TManager.getMatch(+matchId);
			return reply.send({ success: true, data: publicMatchShape(m) });
		} catch (error) {
			fastify.log.error(error);
			return reply.status(500).send({ success: false, message: 'Failed to toggle player ready status' });
		}
	});

	// // Toggle match-level ready
	// fastify.post('/api/tournament/:tournamentId/match/:matchId/ready', async (request: FastifyRequest, reply: FastifyReply) => {
	// 	try {
	// 		const { tournamentId, matchId } = request.params as { tournamentId: string; matchId: string };
	// 		const tId = +tournamentId;
	// 		const mId = +matchId;
	// 		if (isNaN(tId) || isNaN(mId) || tId <= 0 || mId <= 0)
	// 			return reply.status(400).send({ success: false, message: 'Invalid id(s)' });
	// 		const { playerId } = request.body as { playerId: string };
	// 		const pId = +playerId;
	// 		if (isNaN(pId) || pId <= 0)
	// 			return reply.status(400).send({ success: false, message: 'playerId is required' });
	// 		const ok = await TManager.toggleMatchPlayerReady(tId, mId, pId);
	// 		if (!ok) return reply.status(404).send({ success: false, message: 'Tournament, match, or player not found' });
	// 		const match = await TManager.getMatch(mId);
	// 		return reply.send({ success: true, data: publicMatchShape(match) });
	// 	} catch (error) {
	// 		fastify.log.error(error);
	// 		return reply.status(500).send({ success: false, message: 'Failed to toggle match ready' });
	// 	}
	// });

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
			const ok = await TManager.leaveTournament(tId, pId);
			if (!ok)
				return reply.status(404).send({ success: false, message: 'Tournament or player not found' });
			console.log(`✅ Player ${pId} left tournament ${tId}`);
			return reply.send({ success: true, message: 'Left tournament' });
		} catch (error) {
			fastify.log.error(error);
			return reply.status(500).send({ success: false, message: 'Failed to leave tournament' });
		}
	});

	// -------------------------------------- ARCHIVE -------------------------------------- //
	// Get archive snapshot
	// //TODO
	// fastify.get('/api/tournament/:tournamentId/archive', async (request: FastifyRequest, reply: FastifyReply) => {
	// 	try {
	// 		const { tournamentId } = request.params as { tournamentId: string };
	// 		const tId = +(tournamentId);
	// 		if (isNaN(tId) || tId <= 0)
	// 			return reply.status(400).send({ success: false, message: 'Invalid tournament id' });
	// 		const archive = await TManager.getArchive(tId);
	// 		if (!archive)
	// 			return reply.status(404).send({ success: false, message: 'Archive not found' });
	// 		return reply.send({ success: true, data: archive });
	// 	} catch (error) {
	// 		fastify.log.error(error);
	// 		return reply.status(500).send({ success: false, message: 'Failed to get archive' });
	// 	}
	// });

	// // List all archives
	// fastify.get('/api/tournament/archives', async (_request: FastifyRequest, reply: FastifyReply) => {
	// 	try {
	// 		const archives = await TManager.getAllArchives();
	// 		return reply.send({ success: true, count: archives.length, data: archives });
	// 	} catch (error) {
	// 		fastify.log.error(error);
	// 		return reply.status(500).send({ success: false, message: 'Failed to list archives' });
	// 	}
	// });

	// -------------------------------------- MATCHES -------------------------------------- //
	// Get current match (next in queue) for a tournament
	fastify.get('/api/tournament/:tournamentId/match/current', async (request: FastifyRequest, reply: FastifyReply) => {
		try {
			const { tournamentId } = request.params as { tournamentId: string };
			const tId = +tournamentId;
			if (isNaN(tId) || tId <= 0)
				return reply.status(400).send({ success: false, message: 'Invalid tournament id' });
			const m = await TManager.getCurrentMatch(tId);
			if (!m)
				return reply.send({ success: true, data: null, message: 'No current match available yet' });
			return reply.send({ success: true, data: publicMatchShape(m) });
		} catch (error) {
			fastify.log.error(error);
			return reply.status(500).send({ success: false, message: 'Failed to get current match' });
		}
	});

	// // Get active matches for a tournament
	// fastify.get('/api/tournament/:tournamentId/match/active', async (request: FastifyRequest, reply: FastifyReply) => {
	// 	try {
	// 		const { tournamentId } = request.params as { tournamentId: string };
	// 		const tId = +tournamentId;
	// 		if (isNaN(tId) || tId <= 0)
	// 			return reply.status(400).send({ success: false, message: 'Invalid tournament id' });
	// 		const matches = await TManager.getActiveMatches(tId);
	// 		return reply.send({ success: true, count: matches.length, data: matches.map(publicMatchShape) });
	// 	} catch (error) {
	// 		fastify.log.error(error);
	// 		return reply.status(500).send({ success: false, message: 'Failed to get active matches' });
	// 	}
	// });

	// Get match by ID in a tournament
	fastify.get('/api/tournament/:tournamentId/match/:matchId', async (request: FastifyRequest, reply: FastifyReply) => {
		try {
			const { tournamentId, matchId } = request.params as { tournamentId: string; matchId: string };
			const tId = +tournamentId;
			const mId = +matchId;
			if (isNaN(tId) || isNaN(mId) || tId <= 0 || mId <= 0)
				return reply.status(400).send({ success: false, message: 'Invalid id(s)' });
			const match = await TManager.getMatch(mId);
			if (!match)
				return reply.status(404).send({ success: false, message: 'Match not found' });
			return reply.send({ success: true, data: { match: publicMatchShape(match) } });
		} catch (error) {
			fastify.log.error(error);
			return reply.status(500).send({ success: false, message: 'Failed to get match' });
		}
	});

	// Start match
	fastify.post('/api/tournament/:tournamentId/match/:matchId/start', async (req, reply) => {
		try {
			const { tournamentId, matchId } = req.params as { tournamentId: string; matchId: string };
			const tId = +tournamentId;
			const mId = +matchId;
			if (isNaN(tId) || isNaN(mId) || tId <= 0 || mId <= 0)
				return reply.code(400).send({ success: false, message: 'invalid id(s)' });
			const m = await TManager.startMatch(tId, mId);
			if (!m)
				return reply.code(400).send({ success: false, message: 'failed to start match' });
			return reply.send({ success: true, message: 'match starting', gameId: m.gameId ?? null, matchId: m.id ?? null });
		} catch (error) {
			fastify.log.error(error);
			return reply.status(500).send({ success: false, message: 'Failed to start match' });
		}
	});

	// End a match
	fastify.post('/api/tournament/:tournamentId/match/:matchId/end', async (request: FastifyRequest, reply: FastifyReply) => {
		try {
			const { tournamentId, matchId } = request.params as { tournamentId: string; matchId: string };
			const tId = +tournamentId;
			const mId = +matchId;
			if (isNaN(tId) || isNaN(mId) || tId <= 0 || mId <= 0)
				return reply.status(400).send({ success: false, message: 'Invalid id(s)' });
			// const { winnerId } = request.body as { winnerId: string };
			// const winner = +winnerId;
			// if (isNaN(winner) || winner <= 0)
			// 	return reply.status(400).send({ success: false, message: 'Invalid winnerId' });
			const ok = await TManager.endMatch(mId);
			if (!ok)
				return reply.status(400).send({ success: false, message: 'Failed to end match' });
			const m = await TManager.getMatch(mId);
			return reply.send({ success: true, data: { match: publicMatchShape(m) } });
		} catch (error) {
			fastify.log.error(error);
			return reply.status(500).send({ success: false, message: 'Failed to end match' });
		}
	});
}

export default tournamentRoutes;


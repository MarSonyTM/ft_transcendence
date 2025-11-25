import { FastifyInstance, FastifyRequest, FastifyReply, FastifyPluginOptions } from 'fastify';
import { tournamentManager } from '../tournament/tournamentManager';
import { TPT, Tournament, TournamentPlayer } from '../types/index';
// import { publicTournamentShape, publicMatchShape } from '../websocket/tournamentHandler';
import { sanitizeAlias } from '../utils/sanitization';

// const state = tournamentManager.startTournament(sanitizedAliases);

// interface StartTournamentBody { aliases: string[]; }
// interface ResultBody { winnerAlias?: string; winnerId?: number; }

// function serializeState(state: TournamentState): SerializedTournamentState {
// 	const playerMap = new Map<number, SerializedPlayer>();
// 	state.players.forEach((player: TournamentPlayer) => {
// 		playerMap.set(player.id, {
// 			id: player.id,
// 			alias: player.alias,
// 			eliminated: player.eliminated,
// 			wins: player.wins,
// 			losses: player.losses
// 		});
// 	});

// 	const currentMatch: SerializedMatch | null = state.currentMatch ? {
// 		matchId: state.currentMatch.matchId,
// 		player1: playerMap.get(state.currentMatch.player1Id) || null,
// 		player2: playerMap.get(state.currentMatch.player2Id) || null,
// 		startedAt: state.currentMatch.startedAt
// 	} : null;

// 	const queueAliases = state.queue.map((id: number) => playerMap.get(id)?.alias || 'Unknown');

// 	const nextMatches: SerializedNextMatchPreview[] = [];
// 	const queueCopy = [...state.queue];
// 	let order = 1;
// 	while (queueCopy.length > 0) {
// 		const player1Id = queueCopy.shift();
// 		const player2Id = queueCopy.shift();
// 		if (player1Id === undefined) break;
// 		nextMatches.push({
// 			order,
// 			player1: playerMap.get(player1Id)?.alias || 'Unknown',
// 			player2: player2Id !== undefined ? playerMap.get(player2Id)?.alias || null : null
// 		});
// 		order += 1;
// 	}

// 	const matchHistory: SerializedMatchHistoryItem[] = state.matchHistory.map((match: TournamentMatchRecord) => ({
// 		matchId: match.id,
// 		player1: playerMap.get(match.player1Id)?.alias || 'Unknown',
// 		player2: playerMap.get(match.player2Id)?.alias || 'Unknown',
// 		winner: match.winnerId ? playerMap.get(match.winnerId)?.alias || 'Unknown' : 'Unknown',
// 		loser: match.loserId ? playerMap.get(match.loserId)?.alias || 'Unknown' : 'Unknown',
// 		finishedAt: match.finishedAt
// 	}));

// 	const championAlias = state.championId ? playerMap.get(state.championId)?.alias || null : null;

// 	return {
// 		id: state.id,
// 		status: state.status,
// 		createdAt: state.createdAt,
// 		updatedAt: state.updatedAt,
// 		players: Array.from(playerMap.values()),
// 		currentMatch,
// 		queue: queueAliases,
// 		nextMatches,
// 		matchHistory,
// 		championId: state.championId,
// 		championAlias
// 	};
// }

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
			
			// // ✅ SANITIZE ALL ALIASES (XSS Protection)//TODO insert
			// const sanitizedAliases = body.aliases.map(alias => sanitizeAlias(alias));

			// // Validate aliases
			// if (sanitizedAliases.some(alias => !alias || alias.length < 1 || alias.length > 50)) {
			// 	reply.code(400);
			// 	return { success: false, message: 'All aliases must be 1-50 characters' };
			// }

			// if (sanitizedAliases.length < 2) {
			// 	reply.code(400);
			// 	return { success: false, message: 'At least 2 players required for tournament' };
			// }
			
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

	// // Get archive snapshot
    // fastify.get('/api/tournament/:tournamentId/archive', async (request: FastifyRequest, reply: FastifyReply) => {
    //     try {
    //         const { tournamentId } = request.params as { tournamentId: string };
    //         const tId = +tournamentId;
    //         if (isNaN(tId) || tId <= 0)
    //             return reply.status(400).send({ success: false, message: 'Invalid tournament id' });
            
    //         const t = tournamentManager.getTournament(tId);
    //         if (!t)
    //             return reply.status(404).send({ success: false, message: 'Tournament not found' });
            
    //         return reply.send({ success: true, data: publicTournamentShape(t) });
    //     } catch (error) {
    //         fastify.log.error(error);
    //         return reply.status(500).send({ success: false, message: 'Failed to get archive' });
    //     }
    // });

    // // List all archives
    // fastify.get('/api/tournament/archives', async (_request: FastifyRequest, reply: FastifyReply) => {
    //     try {
    //         const allTournaments = tournamentManager.getAllTournaments();
    //         const completed = allTournaments.filter(t => t.status === 'completed' || t.status === 'archived');
            
    //         return reply.send({ 
    //             success: true, 
    //             data: completed.map(publicTournamentShape)
    //         });
    //     } catch (error) {
    //         fastify.log.error(error);
    //         return reply.status(500).send({ success: false, message: 'Failed to list archives' });
    //     }
    // });

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
			if (!m)
				return reply.status(404).send({ success: false, message: 'Failed to prepare match/game' });
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
			const tId = +tournamentId;
			const mId = +matchId;
			if (isNaN(tId) || isNaN(mId) || tId <= 0 || mId <= 0)
				return reply.status(400).send({ success: false, message: 'Invalid id(s)' });
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


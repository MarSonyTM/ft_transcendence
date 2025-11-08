import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { TManager } from '../tournament/tournamentManager';
import { database } from '../database';
import {
	Tournament,
	TournamentPlayer,
	TournamentMatch,
	TournamentNextMatch,
	MatchSummary,
	TPT
} from '../../../shared/tournamentTypes';

interface StartTournamentBody {
	players: Array<{name: string, tpt: TPT, isReady?: boolean}>;
}
interface ResultBody { winnerAlias?: string; winnerId?: number; }

function serializeState(state: Tournament): Tournament {
	const playerMap = new Map<number, TournamentPlayer>();
	state.players?.forEach((player: TournamentPlayer) => {
		playerMap.set(player.id, {
			id: player.id!,
			name: player.name,
			tId: player.tId,
			identity: player.identity,
			user: player.user,
			tpt: player.tpt,
			isReady: player.isReady,
			pos: player.pos,
			score: player.score!,
			eliminated: player.eliminated,
			wins: player.wins,
			losses: player.losses,
			connectionStatus: player.connectionStatus!,
			lastActivity: player.lastActivity!
		});
	});

	const currentMatch: TournamentMatch | undefined = state.curMatch ? {
		matchId: state.curMatch.matchId,
		tId: state.curMatch.tId,
		p1: state.curMatch.p1,
		p2: state.curMatch.p2,
		gameId: state.curMatch.gameId,
		roomId: state.curMatch.roomId,
		status: state.curMatch.status,
		createdAt: state.curMatch.createdAt,
		finishedAt: state.curMatch.finishedAt,
		winner: state.curMatch.winner,
		loser: state.curMatch.loser,
		startedAt: state.curMatch.startedAt
	} : undefined;

	const queuePlayers = state.queue?.map((id: number) => playerMap.get(id));
	if (queuePlayers === undefined || queuePlayers.length === 0) throw new Error('No Players in queue.');

	const nextMatches: TournamentNextMatch[] = [];
	const queueCopy = [...state.queue ?? []];
	let order = 1;
	while (queueCopy.length > 0) {
		const player1Id = queueCopy.shift();
		const player2Id = queueCopy.shift();
		nextMatches.push({
			order: order++,
			p1: playerMap.get(player1Id!) || undefined,
			p2: playerMap.get(player2Id!) || undefined
		});
	}

	const matchHistory: MatchSummary[] = state.matchHistory?.map((match: MatchSummary) => ({
		matchId: match.matchId,
		p1: playerMap.get(match.p1?.id!)!,
		p2: playerMap.get(match.p2?.id!)!,
		winner: playerMap.get(match.winner?.id!),
		loser: playerMap.get(match.loser?.id!),
		createdAt: match.createdAt,
		startedAt: match.startedAt,
		finishedAt: match.finishedAt,
	})) || [];

	return {
		tId: state.tId,
		status: state.status,
		players: Array.from(playerMap.values()),
		queue: queuePlayers?.map(p => p?.id!),
		matches: state.matches,
		curMatch: currentMatch,
		nextMatches,
		matchHistory,
		createdAt: state.createdAt,
		startedAt: state.startedAt,
		finishedAt: state.finishedAt,
		updatedAt: state.updatedAt,
		champion: state.champion,
		matchDelay: state.matchDelay
	};
}

async function tournamentRoutes(fastify: FastifyInstance, _options: FastifyPluginOptions) {
	fastify.post('/start', async (request, reply) => {
		try {
			const body = request.body as StartTournamentBody;
			if (!body || !Array.isArray(body.players)) {
				reply.code(400);
				return { success: false, message: 'Body must include a players array.' };
			}
			const state = await TManager.startTournament(body.players);
			return { success: true, data: serializeState(state) };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to start tournament.';
			reply.code(400);
			return { success: false, message };
		}
	});

	fastify.get('/state', async (_request, reply) => {
	const state = TManager.getActiveTournament();
		if (!state) {
			reply.code(404);
			return { success: false, message: 'No active tournament.' };
		}
		return { success: true, data: serializeState(state) };
	});

	fastify.get('/list', async () => {
		const live = TManager.list();
		const summaries = live.map((t: Tournament, idx: number) => {
			const dbRow = database.tournaments.getTournamentById(t.tId as any);
			const friendly = (dbRow as any)?.friendlyId ?? (idx + 1);
			const championAlias = t.champion?.id ? (t.players?.find((p: TournamentPlayer) => p.id === t.champion?.id)?.name || null) : null;
			return {
				tournamentId: t.tId,
				displayId: friendly,
				status: t.status,
				championId: t.champion?.id,
				championAlias,
				createdAt: t.createdAt,
				updatedAt: t.updatedAt,
				players: t.players,
				matches: t.matchHistory,
			};
		}).reverse();
		return { success: true, data: summaries };
	});

	fastify.get('/match/:matchId', async (req, reply) => {
		const body = req.params as { matchId: string };
		const matchId = Number(body.matchId);
		if (Number.isNaN(matchId)) {
			return reply.code(400).send({ success: false, message: 'Invalid match ID.' });
		}
		const matches = TManager.getActiveTournament()?.matches || [];
		const match = matches.find(m => m.matchId === matchId);
		if (!match) {
			return reply.code(404).send({ success: false, message: 'Match not found.' });
		}
		return { success: true, data: match };
	});

	fastify.get('/player/:id', async (req, reply) => {
		const body = req.params as { id: string };
		const playerId = Number(body.id);
		if (Number.isNaN(playerId)) {
			return reply.code(400).send({ success: false, message: 'Invalid player ID.' });
		}
		const players = TManager.getActiveTournament()?.players || [];
		const player = players.find(p => p.id === playerId);
		if (!player) {
			return reply.code(404).send({ success: false, message: 'Player not found.' });
		}
		return { success: true, data: player };
	});

	fastify.get('/tournament/:tId', async (req, reply) => {
		const body = req.params as { tId: string };
		const tournamentId = Number(body.tId);
		if (Number.isNaN(tournamentId)) {
			return reply.code(400).send({ success: false, message: 'Invalid tournament ID.' });
		}
		const tournament = TManager.getTournamentById(tournamentId);
		if (!tournament) {
			return reply.code(404).send({ success: false, message: 'Tournament not found.' });
		}
		return { success: true, data: tournament };
	});

	fastify.post('/new', async () => {
	const t = TManager.getActiveTournament();
		return { success: true, data: t };
	});

	fastify.post('/ready/:playerId', async (request, reply) => {
		try {
			const body = request.body as { playerId: number, ready: boolean };
			if (isNaN(body.playerId)) {
				reply.code(400);
				return { success: false, message: 'Invalid player ID.' };
			}
			const state = TManager.togglePlayerReady(body.playerId, body.ready);
			return { success: true, data: serializeState(state) };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to toggle ready state.';
			reply.code(400);
			return { success: false, message };
		}
	});

	fastify.post('/result', async (request, reply) => {
		try {
			const body = request.body as ResultBody & { player1Score?: number; player2Score?: number };
			if (!body || (!body.winnerAlias && body.winnerId === undefined)) {
				reply.code(400);
				return { success: false, message: 'Winner alias or winnerId is required.' };
			}
			const state = TManager.recordResult(
				{ name: body.winnerAlias, winnerId: body.winnerId },
				body.player1Score,
				body.player2Score
			);
			return { success: true, data: serializeState(state) };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to record result.';
			reply.code(400);
			return { success: false, message };
		}
	});
}

export default tournamentRoutes;
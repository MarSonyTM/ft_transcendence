import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { TManager } from '../tournament/tournamentManager';
import { database } from '../database';
import {
	Tournament,
	TournamentPlayer,
	TournamentMatch,
	TournamentNextMatch
} from '../../../shared/tournamentTypes';

interface StartTournamentBody { 
	aliases?: string[];
	players?: Array<{alias: string, isAI?: boolean, isLocal?: boolean, isRemote?: boolean}>;
}
interface ResultBody { winnerAlias?: string; winnerId?: number; }

function serializeState(state: Tournament): Tournament {
	const playerMap = new Map<number, TournamentPlayer>();
	state.players?.forEach((player: TournamentPlayer) => {
		playerMap.set(player.id, {
			id: player.id,
			playerId: player.playerId,
			tournamentId: player.tournamentId,
			alias: player.alias,
			user: player.user,
			eliminated: player.eliminated,
			wins: player.wins,
			losses: player.losses,
			totalScore: player.totalScore,
			averageScore: player.averageScore,
			isReady: player.isReady,
			isAI: player.isAI,
			isLocal: player.isLocal,
			isRemote: player.isRemote,
			avatar: player.avatar,
			score: player.score,
			pos: player.pos,
			lastActivity: player.lastActivity,
			connectionStatus: player.connectionStatus
		});
	});

	const currentMatch: TournamentMatch | undefined = state.currentMatch ? {
		matchId: state.currentMatch.matchId,
		tournamentId: state.currentMatch.tournamentId,
		p1: state.currentMatch.p1,
		p2: state.currentMatch.p2,
		gameId: state.currentMatch.gameId,
		roomId: state.currentMatch.roomId,
		status: state.currentMatch.status,
		createdAt: state.currentMatch.createdAt,
		winner: state.currentMatch.winner,
		loser: state.currentMatch.loser,
		startedAt: state.currentMatch.startedAt
	} : undefined;

	const queuePlayers = state.queue.map((id: number) => playerMap.get(id));

	const nextMatches: TournamentNextMatch[] = [];
	const queueCopy = [...state.queue];
	let order = 1;
	while (queueCopy.length > 0) {
		const player1Id = queueCopy.shift();
		const player2Id = queueCopy.shift();
		nextMatches.push({
			order,
			p1: playerMap.get(player1Id!) || undefined,
			p2: playerMap.get(player2Id!) || undefined
		});
		order += 1;
	}

	const matchHistory: TournamentMatch[] = state.matchHistory?.map((match: TournamentMatch) => ({
		matchId: match.matchId,
		tournamentId: match.tournamentId,
		gameId: match.gameId,
		roomId: match.roomId,
		p1: playerMap.get(match.p1?.id!),
		p2: playerMap.get(match.p2?.id!),
		winner: playerMap.get(match.winner?.id!),
		loser: playerMap.get(match.loser?.id!),
		status: match.status,
		createdAt: match.createdAt,
		startedAt: match.startedAt,
		finishedAt: match.finishedAt,
		disputeReason: match.disputeReason
	})) || [];

	return {
		tournamentId: state.tournamentId,
		status: state.status,
		createdAt: state.createdAt,
		updatedAt: state.updatedAt,
		players: Array.from(playerMap.values()),
		gameStates: state.gameStates,
		matches: state.matches,
		currentMatch,
		queue: queuePlayers?.map(p => p?.id!),
		nextMatches,
		matchHistory,
		champion: state.champion,
		format: state.format,
		matchDelay: state.matchDelay,
	};
}

async function tournamentRoutes(fastify: FastifyInstance, _options: FastifyPluginOptions) {
	fastify.post('/start', async (request, reply) => {
		try {
			const body = request.body as StartTournamentBody;
			if (!body || (!Array.isArray(body.aliases) && !Array.isArray(body.players))) {
				reply.code(400);
				return { success: false, message: 'Body must include an aliases array or players array.' };
			}

			const playersData = body.players ? body.players : (body.aliases ? body.aliases.map((a: string) => ({ alias: a })) : []);
			const state = await TManager.startTournament(playersData);
			return { success: true, data: serializeState(state) };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to start tournament.';
			reply.code(400);
			return { success: false, message };
		}
	});

	fastify.get('/state', async (_request, reply) => {
	const state = TManager.getActive();
		if (!state) {
			reply.code(404);
			return { success: false, message: 'No active tournament.' };
		}
		return { success: true, data: serializeState(state) };
	});

			fastify.get('/list', async () => {
				// Prefer live manager state, enrich with DB-friendly display IDs when available
				const live = TManager.list();
				const summaries = live.map((t: Tournament, idx: number) => {
					const dbRow = database.tournaments.getTournamentById(t.tournamentId as any);
					const friendly = (dbRow as any)?.friendlyId ?? (idx + 1);
					const championAlias = t.champion?.id ? (t.players?.find((p: TournamentPlayer) => p.id === t.champion?.id)?.alias || null) : null;
					return {
						tournamentId: t.tournamentId,
						displayId: friendly,
						status: t.status,
						championId: t.champion?.id,
						championAlias,
						createdAt: t.createdAt,
						updatedAt: t.updatedAt,
						players: t.players.length,
						matches: t.matchHistory.length,
						format: t.format
					};
				}).reverse();
				return { success: true, data: summaries };
			});

	fastify.get('/:id', async (req, reply) => {
		const id = Number((req.params as any).id);
		if (Number.isNaN(id)) return reply.code(400).send({ success: false, message: 'Invalid id' });
	const t = TManager.getById ? TManager.getById(id) : null;
		if (!t) return reply.code(404).send({ success: false, message: 'Not found' });
		return { success: true, data: serializeState(t) };
	});

	fastify.post('/new', async () => {
	const t = TManager.newTournament();
		return { success: true, data: t };
	});

	// Toggle player ready state
	fastify.post('/ready/:playerId', async (request, reply) => {
		try {
			const params = request.params as { playerId: string };
			const playerId = Number(params.playerId);
			if (isNaN(playerId)) {
				reply.code(400);
				return { success: false, message: 'Invalid player ID.' };
			}
			const state = TManager.togglePlayerReady(playerId);
			return { success: true, data: serializeState(state) };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to toggle ready state.';
			reply.code(400);
			return { success: false, message };
		}
	});

	// Manual result recording (fallback, primarily for testing)
	fastify.post('/result', async (request, reply) => {
		try {
			const body = request.body as ResultBody & { player1Score?: number; player2Score?: number };
			if (!body || (!body.winnerAlias && body.winnerId === undefined)) {
				reply.code(400);
				return { success: false, message: 'Winner alias or winnerId is required.' };
			}
			const state = TManager.recordResult(
				{ alias: body.winnerAlias, playerId: body.winnerId },
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

	// Request rematch/dispute
	fastify.post('/dispute/:matchId', async (request, reply) => {
		try {
			const params = request.params as { matchId: string };
			const body = request.body as { reason: string };
			const matchId = Number(params.matchId);
			if (isNaN(matchId)) {
				reply.code(400);
				return { success: false, message: 'Invalid match ID.' };
			}
			if (!body || !body.reason) {
				reply.code(400);
				return { success: false, message: 'Dispute reason is required.' };
			}
			const state = TManager.requestRematch(matchId, body.reason);
			return { success: true, data: serializeState(state) };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to dispute match.';
			reply.code(400);
			return { success: false, message };
		}
	});

	// Resolve dispute and allow rematch
	fastify.post('/dispute/:matchId/resolve', async (request, reply) => {
		try {
			const params = request.params as { matchId: string };
			const matchId = Number(params.matchId);
			if (isNaN(matchId)) {
				reply.code(400);
				return { success: false, message: 'Invalid match ID.' };
			}
			const state = TManager.resolveDispute(matchId);
			return { success: true, data: serializeState(state) };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to resolve dispute.';
			reply.code(400);
			return { success: false, message };
		}
	});

	fastify.post('/reset', async () => {
	TManager.resetActive();
		return { success: true, message: 'Tournament reset.' };
	});
}

export default tournamentRoutes;
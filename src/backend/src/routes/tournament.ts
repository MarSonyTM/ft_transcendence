import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { TournamentState, tournamentManager } from '../tournament/tournamentManager';
import {
	SerializedTournamentState,
	SerializedPlayer,
	SerializedMatch,
	SerializedNextMatchPreview,
	SerializedMatchHistoryItem,
	TournamentSummary,
	TournamentPlayer,
	TournamentMatchRecord
} from '../../../shared/tournamentTypes';
import { sanitizeAlias } from '../utils/sanitization';

interface StartTournamentBody { aliases: string[]; }
interface ResultBody { winnerAlias?: string; winnerId?: number; }

function serializeState(state: TournamentState): SerializedTournamentState {
	const playerMap = new Map<number, SerializedPlayer>();
	state.players.forEach((player: TournamentPlayer) => {
		playerMap.set(player.id, {
			id: player.id,
			alias: player.alias,
			eliminated: player.eliminated,
			wins: player.wins,
			losses: player.losses
		});
	});

	const currentMatch: SerializedMatch | null = state.currentMatch ? {
		matchId: state.currentMatch.matchId,
		player1: playerMap.get(state.currentMatch.player1Id) || null,
		player2: playerMap.get(state.currentMatch.player2Id) || null,
		startedAt: state.currentMatch.startedAt
	} : null;

	const queueAliases = state.queue.map((id: number) => playerMap.get(id)?.alias || 'Unknown');

	const nextMatches: SerializedNextMatchPreview[] = [];
	const queueCopy = [...state.queue];
	let order = 1;
	while (queueCopy.length > 0) {
		const player1Id = queueCopy.shift();
		const player2Id = queueCopy.shift();
		if (player1Id === undefined) break;
		nextMatches.push({
			order,
			player1: playerMap.get(player1Id)?.alias || 'Unknown',
			player2: player2Id !== undefined ? playerMap.get(player2Id)?.alias || null : null
		});
		order += 1;
	}

	const matchHistory: SerializedMatchHistoryItem[] = state.matchHistory.map((match: TournamentMatchRecord) => ({
		matchId: match.id,
		player1: playerMap.get(match.player1Id)?.alias || 'Unknown',
		player2: playerMap.get(match.player2Id)?.alias || 'Unknown',
		winner: match.winnerId ? playerMap.get(match.winnerId)?.alias || 'Unknown' : 'Unknown',
		loser: match.loserId ? playerMap.get(match.loserId)?.alias || 'Unknown' : 'Unknown',
		finishedAt: match.finishedAt
	}));

	const championAlias = state.championId ? playerMap.get(state.championId)?.alias || null : null;

	return {
		id: state.id,
		status: state.status,
		createdAt: state.createdAt,
		updatedAt: state.updatedAt,
		players: Array.from(playerMap.values()),
		currentMatch,
		queue: queueAliases,
		nextMatches,
		matchHistory,
		championId: state.championId,
		championAlias
	};
}

async function tournamentRoutes(fastify: FastifyInstance, _options: FastifyPluginOptions) {
	fastify.post('/start', async (request, reply) => {
		try {
			const body = request.body as StartTournamentBody;
			if (!body || !Array.isArray(body.aliases)) {
				reply.code(400);
				return { success: false, message: 'Body must include an aliases array.' };
			}
			
			// ✅ SANITIZE ALL ALIASES (XSS Protection)
			const sanitizedAliases = body.aliases.map(alias => sanitizeAlias(alias));
			
			// Validate aliases
			if (sanitizedAliases.some(alias => !alias || alias.length < 1 || alias.length > 50)) {
				reply.code(400);
				return { success: false, message: 'All aliases must be 1-50 characters' };
			}
			
			if (sanitizedAliases.length < 2) {
				reply.code(400);
				return { success: false, message: 'At least 2 players required for tournament' };
			}
			
			const state = tournamentManager.startTournament(sanitizedAliases);
			return { success: true, data: serializeState(state) };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to start tournament.';
			reply.code(400);
			return { success: false, message };
		}
	});

	fastify.get('/state', async (_request, reply) => {
		const state = tournamentManager.getActive();
		if (!state) {
			reply.code(404);
			return { success: false, message: 'No active tournament.' };
		}
		return { success: true, data: serializeState(state) };
	});

	fastify.get('/list', async () => {
		const all = tournamentManager.list();
		const summaries: TournamentSummary[] = all.map((t: TournamentState) => ({
			id: t.id,
			status: t.status,
			championId: t.championId,
			championAlias: t.championId ? (t.players.find((p: TournamentPlayer) => p.id === t.championId)?.alias || null) : null,
			createdAt: t.createdAt,
			updatedAt: t.updatedAt,
			players: t.players.length,
			matches: t.matchHistory.length
		})).reverse();
		return { success: true, data: summaries };
	});

	fastify.get('/:id', async (req, reply) => {
		const id = Number((req.params as any).id);
		if (Number.isNaN(id)) return reply.code(400).send({ success: false, message: 'Invalid id' });
		const t = tournamentManager.getById ? tournamentManager.getById(id) : null;
		if (!t) return reply.code(404).send({ success: false, message: 'Not found' });
		return { success: true, data: serializeState(t) };
	});

	fastify.post('/new', async () => {
		const t = tournamentManager.newTournament();
		return { success: true, data: t };
	});

	fastify.post('/result', async (request, reply) => {
		try {
			const body = request.body as ResultBody;
			if (!body || (!body.winnerAlias && body.winnerId === undefined)) {
				reply.code(400);
				return { success: false, message: 'Winner alias or winnerId is required.' };
			}
			const state = tournamentManager.recordResult({ alias: body.winnerAlias, playerId: body.winnerId });
			return { success: true, data: serializeState(state) };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to record result.';
			reply.code(400);
			return { success: false, message };
		}
	});

	fastify.post('/reset', async () => {
		tournamentManager.resetActive();
		return { success: true, message: 'Tournament reset.' };
	});
}

export default tournamentRoutes;
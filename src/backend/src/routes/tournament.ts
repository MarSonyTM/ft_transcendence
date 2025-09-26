import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { TournamentState, tournamentManager } from '../tournament/tournamentManager';

interface StartTournamentBody {
  aliases: string[];
}

interface ResultBody {
  winnerAlias?: string;
  winnerId?: number;
}

interface SerializedPlayer {
  id: number;
  alias: string;
  eliminated: boolean;
  wins: number;
  losses: number;
}

interface SerializedMatchHistoryItem {
  matchId: number;
  player1: string;
  player2: string;
  winner: string;
  loser: string;
  finishedAt?: string;
}

interface SerializedMatch {
  matchId: number;
  player1: SerializedPlayer | null;
  player2: SerializedPlayer | null;
  startedAt: string;
}

interface SerializedNextMatchPreview {
  order: number;
  player1: string;
  player2?: string | null;
}

interface SerializedTournamentState {
  id: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  players: SerializedPlayer[];
  currentMatch: SerializedMatch | null;
  queue: string[];
  nextMatches: SerializedNextMatchPreview[];
  matchHistory: SerializedMatchHistoryItem[];
  championId?: number;
  championAlias?: string | null;
}

function serializeState(state: TournamentState): SerializedTournamentState {
  const playerMap = new Map<number, SerializedPlayer>();

  state.players.forEach(player => {
    playerMap.set(player.id, {
      id: player.id,
      alias: player.alias,
      eliminated: player.eliminated,
      wins: player.wins,
      losses: player.losses
    });
  });

  const currentMatch: SerializedMatch | null = state.currentMatch
    ? {
        matchId: state.currentMatch.matchId,
        player1: playerMap.get(state.currentMatch.player1Id) || null,
        player2: playerMap.get(state.currentMatch.player2Id) || null,
        startedAt: state.currentMatch.startedAt
      }
    : null;

  const queueAliases = state.queue.map(id => playerMap.get(id)?.alias || 'Unknown');

  const nextMatches: SerializedNextMatchPreview[] = [];
  const queueCopy = [...state.queue];
  let order = 1;
  while (queueCopy.length > 0) {
    const player1Id = queueCopy.shift();
    const player2Id = queueCopy.shift();

    if (player1Id === undefined) {
      break;
    }

    nextMatches.push({
      order,
      player1: playerMap.get(player1Id)?.alias || 'Unknown',
      player2: player2Id !== undefined ? playerMap.get(player2Id)?.alias || null : null
    });
    order += 1;
  }

  const matchHistory: SerializedMatchHistoryItem[] = state.matchHistory.map(match => ({
    matchId: match.id,
    player1: playerMap.get(match.player1Id)?.alias || 'Unknown',
    player2: playerMap.get(match.player2Id)?.alias || 'Unknown',
    winner: match.winnerId ? playerMap.get(match.winnerId)?.alias || 'Unknown' : 'Unknown',
    loser: match.loserId ? playerMap.get(match.loserId)?.alias || 'Unknown' : 'Unknown',
    finishedAt: match.finishedAt
  }));

  const championAlias = state.championId
    ? playerMap.get(state.championId)?.alias || null
    : null;

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

      const state = tournamentManager.startTournament(body.aliases);

      return {
        success: true,
        data: serializeState(state)
      };
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

    return {
      success: true,
      data: serializeState(state)
    };
  });

  fastify.get('/list', async () => {
    const all = tournamentManager.list();
    return {
      success: true,
      data: all.map(t => ({
        id: t.id,
        status: t.status,
        championId: t.championId,
        championAlias: t.championId
          ? (t.players.find(p => p.id === t.championId)?.alias || null)
          : null,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        players: t.players.length,
        matches: t.matchHistory.length
      })).reverse()
    };
  });

  fastify.get('/:id', async (req, reply) => {
    const id = Number((req.params as any).id);
    if (Number.isNaN(id)) {
      return reply.code(400).send({ success: false, message: 'Invalid id' });
    }
    const t = tournamentManager.getById
      ? tournamentManager.getById(id)
      : null;
    if (!t) return reply.code(404).send({ success: false, message: 'Not found' });

    const playerIndex = new Map(t.players.map(p => [p.id, p.alias]));
    const history = t.matchHistory.map(m => ({
      id: m.id,
      player1: playerIndex.get(m.player1Id) || `#${m.player1Id}`,
      player2: playerIndex.get(m.player2Id) || `#${m.player2Id}`,
      winner: m.winnerId ? (playerIndex.get(m.winnerId) || `#${m.winnerId}`) : undefined,
      loser: m.loserId ? (playerIndex.get(m.loserId) || `#${m.loserId}`) : undefined,
      finishedAt: m.finishedAt
    }));

    return {
      success: true,
      data: {
        ...t,
        players: t.players,
        matchHistory: history
      }
    };
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

      const state = tournamentManager.recordResult({
        alias: body.winnerAlias,
        playerId: body.winnerId
      });

      return {
        success: true,
        data: serializeState(state)
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to record result.';
      reply.code(400);
      return { success: false, message };
    }
  });

  fastify.post('/reset', async () => {
    tournamentManager.resetActive();
    return {
      success: true,
      message: 'Tournament reset.'
    };
  });
}

export default tournamentRoutes;

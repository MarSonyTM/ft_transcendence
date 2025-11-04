import { Tournament, TournamentPlayer, TournamentMatch, TournamentArchive } from '../../../shared/tournamentTypes';
import { authService } from './auth';

// Simple in-memory tournament store with localStorage archive
let state: Tournament | undefined = undefined;

const LS_ARCHIVE_KEY = 'tournamentArchive';
const BYE_PREFIX = '__BYE__-';
const isByeId = (id?: string) => !!id && id.startsWith(BYE_PREFIX);

export function createTournament(): Tournament {
	state = {
		tournamentId: Date.now(),
		status: 'setup',
        format: 'single_elimination',
        gameStates: [],
        players: [],
        queue: [],
        matches: [],
		currentMatch: undefined,
        nextMatches: [],
        matchHistory: [],
		createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
		champion: undefined,
        matchDelay: 3
	};
    // Auto-add host as a participant for visibility and quick starts
    try {
        const user = authService.getCurrentUser();
        if (user) {
            const alias = user.username || 'Host';
            const hostPlayer: TournamentPlayer = {
                id: 1,
                tournamentId: state.tournamentId,
                alias,
                isAI: false,
                isLocal: true,
                isRemote: false,
                eliminated: false,
                wins: 0,
                losses: 0,
                totalScore: 0,
                averageScore: 0,
                isReady: false,
                score: 0,
                pos: 0,
                avatar: undefined,
                connectionStatus: 'connected',
                lastActivity: new Date().toISOString(),
                user: undefined,
                playerId: `host-${user.id}`
            } as TournamentPlayer;
            state.players.push(hostPlayer);
        }
    } catch {}
	return state;
}

export function getTournament(): Tournament | undefined {
	return state;
}

export function addPlayer(alias: string, opts?: { isAI?: boolean; isLocal?: boolean; isRemote?: boolean }): TournamentPlayer {
	if (!state) createTournament();
    const nextIdx = (state?.players?.length ?? 0) + 1;
    const uniqueId = `p-${state!.tournamentId}-${nextIdx}-${Math.random().toString(36).slice(2,6)}`;
	const player: TournamentPlayer = {
        id: nextIdx,
        tournamentId: state!.tournamentId,
		alias,
		isAI: !!opts?.isAI,
		isLocal: !!opts?.isLocal,
		isRemote: !!opts?.isRemote,
        eliminated: false,
        wins: 0,
        losses: 0,
        totalScore: 0,
        averageScore: 0,
        isReady: false,
        score: 0,
        pos: 0,
        avatar: undefined,
        connectionStatus: 'connected',
        lastActivity: new Date().toISOString(),
        user: undefined,
        playerId: uniqueId
	};
	state!.players?.push(player);
	return player;
}

export function removePlayer(id: string): void {
	if (!state) return;
	state.players = state.players?.filter(p => p.playerId !== id);
}

export function clearPlayers(): void {
	if (!state) return;
	state.players = [];
}

// Build a single-elimination bracket with random first-round pairing.
// Even player counts => no BYEs in Round 1. Odd counts => one implicit BYE.
export function buildBracket(): TournamentMatch[] {
    if (!state) throw new Error('No tournament');
    const players = [...(state.players as TournamentPlayer[])];

    // Shuffle players for random pairing
    for (let i = players.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [players[i], players[j]] = [players[j], players[i]];
    }

    const rounds: TournamentMatch[][] = [];
    let matchId = 1;

    // Round 1: pair sequentially; if odd, last player gets implicit BYE (p2 undefined)
    const r1: TournamentMatch[] = [];
    for (let i = 0; i < players.length; i += 2) {
        const p1 = players[i];
        const p2 = players[i + 1];
        r1.push({
            matchId: matchId++,
            tournamentId: state.tournamentId,
            p1,
            p2,
            winner: undefined,
            loser: undefined,
            createdAt: state.createdAt,
            status: 'pending',
            round: 1,
            indexInRound: Math.floor(i / 2),
        });
    }
    rounds.push(r1);

    // Subsequent rounds: link winners; if odd number of prev matches, last flows alone
    let prev = r1;
    let roundNum = 2;
    while (prev.length > 1) {
        const cur: TournamentMatch[] = [];
        for (let i = 0; i < prev.length; i += 2) {
            const m: TournamentMatch = {
                matchId: matchId++,
                tournamentId: state.tournamentId,
                p1: undefined,
                p2: undefined,
                winner: undefined,
                loser: undefined,
                createdAt: state.createdAt,
                status: 'pending',
                round: roundNum,
                indexInRound: Math.floor(i / 2),
            };
            // Link left feeder
            prev[i].nextMatchId = m.matchId; prev[i].nextSlot = 'p1';
            // Link right feeder if present
            if (i + 1 < prev.length) {
                prev[i + 1].nextMatchId = m.matchId; prev[i + 1].nextSlot = 'p2';
            }
            cur.push(m);
        }
        rounds.push(cur);
        prev = cur;
        roundNum++;
    }

    state.matches = rounds.flat();
    // Promote any single-player matches through BYEs
    autoResolveByes();
    // Normalize round numbers and ordering based on dependencies
    relevelRoundsByDependencies();

    state.currentMatch = findNextPlayableMatch(state.matches);
    state.status = 'in_progress';
    return state.matches;
}

export function getCurrentMatch(): TournamentMatch | undefined {
	if (!state) return undefined;
	if (state.currentMatch === undefined ||
        (state.matches && state.currentMatch && state.matches.find(m => m.matchId === state?.currentMatch?.matchId) === undefined))
        return undefined;
	return state.currentMatch;
}

export function getPlayerById(id: string | undefined): TournamentPlayer | undefined {
	if (!id || !state) return undefined;
	return state.players?.find(p => p.playerId === id);
}

export function advanceAfterResult(matchId: number, winnerId: string, p1Score: number, p2Score: number): void {
    if (!state) return;
    const match = state.matches?.find(m => m.matchId === matchId);
    if (!match) return;
    match.status = 'completed';
    const winnerPlayer = state.players?.find(p => p.playerId === winnerId);
    match.winner = winnerPlayer;
    match.p1!.score = p1Score;
    match.p2!.score = p2Score;
    match.finishedAt = new Date().toISOString();

    if (match.nextMatchId && match.nextSlot) {
        const next = state.matches.find(m => m.matchId === match.nextMatchId);
        if (next) {
            if (match.nextSlot === 'p1') next.p1 = winnerPlayer;
            else next.p2 = winnerPlayer;

            const nextHasBye = isByeId(next.p1?.playerId) || isByeId(next.p2?.playerId);
            const nextBothPresent = !!next.p1?.playerId && !!next.p2?.playerId;
            if (nextBothPresent && nextHasBye) {
                autoResolveByes();
            }
        }
    }

    const nextIdx = state.matches.findIndex(m =>
        m.status === 'pending' &&
        !!m.p1?.playerId && !!m.p2?.playerId &&
        !isByeId(m.p1?.playerId) && !isByeId(m.p2?.playerId)
    );
    if (nextIdx >= 0) {
        state.currentMatch = state.matches[nextIdx];
    } else {
        state.status = 'completed';
        state.champion = getPlayerById(winnerId);
        state.currentMatch = undefined;
        persistArchive();
    }
}

export function setMatchLiveInfo(matchId: number, info: Partial<Pick<TournamentMatch, 'status' | 'roomId' | 'gameId'>>): void {
	if (!state) return;
	const m = state.matches.find(x => x.matchId === matchId);
	if (!m) return;
	Object.assign(m, info);
	if (info.status === 'in_progress') {
		m.startedAt = new Date().toISOString();
	}
}

function persistArchive(): void {
	if (!state) return;
	const item: TournamentArchive = {
		tournamentId: state.tournamentId,
		createdAt: state.createdAt,
		players: state.players,
		matches: state.matches.map(m => ({ id: m.matchId, p1: m.p1!, p2: m.p2!, winner: m.winner })),
		champion: (() => {
			const lastRound = Math.max(...state.matches.map(m => m.round || 1));
			const last = state.matches.find(m => (m.round || 1) === lastRound);
			const champ = getPlayerById(last?.winner?.playerId || '');
			return champ!;
		})(),
	};
	const list = getArchive();
	list.unshift(item);
	localStorage.setItem(LS_ARCHIVE_KEY, JSON.stringify(list).toString());
}

export function getArchive(): TournamentArchive[] {
	try {
		const raw = localStorage.getItem(LS_ARCHIVE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

export function resetTournament(): void {
	state = undefined;
}

function relevelRoundsByDependencies(): void {
    if (!state) return;
    const matches = state.matches;
    if (!matches.length) return;

    // Index: matchId -> match
    const byId = new Map<number, TournamentMatch>();
    for (const m of matches) byId.set(m.matchId, m);

    // Build inputs for each match (which previous matches feed into its p1/p2)
    const inputs = new Map<number, { left?: TournamentMatch; right?: TournamentMatch }>();
    for (const m of matches) {
        if (!m.nextMatchId || !m.nextSlot) continue;
        const parent = byId.get(m.nextMatchId);
        if (!parent) continue;
        const entry = inputs.get(parent.matchId) || {};
        if (m.nextSlot === 'p1') entry.left = m; else entry.right = m;
        inputs.set(parent.matchId, entry);
    }

    // Memoized DFS for round depth
    const memo = new Map<number, number>();
    const getDepth = (m: TournamentMatch): number => {
        if (memo.has(m.matchId)) return memo.get(m.matchId)!;
        const inps = inputs.get(m.matchId);
        const left = inps?.left ? getDepth(inps.left) : 0;
        const right = inps?.right ? getDepth(inps.right) : 0;
        const depth = 1 + Math.max(left, right);
        memo.set(m.matchId, depth);
        return depth;
    };

    // Assign rounds
    for (const m of matches) {
        m.round = getDepth(m);
    }

    // Reindex matches within each round for stable display
    const byRound = new Map<number, TournamentMatch[]>();
    for (const m of matches) {
        const arr = byRound.get(m.round!) || [];
        arr.push(m);
        byRound.set(m.round!, arr);
    }
    for (const [r, arr] of byRound) {
        // Sort deterministically by creation id; then reindex per round starting from 0
        arr.sort((a, b) => a.matchId - b.matchId);
        arr.forEach((m, i) => { m.indexInRound = i; m.round = r; });
    }

    // Sort globally by round then index
    state.matches = [...matches].sort((a, b) =>
        (a.round! - b.round!) || (a.indexInRound! - b.indexInRound!) || (a.matchId - b.matchId)
    );

    // Update pointer
    state.currentMatch = findNextPlayableMatch(state.matches);
}

export function startTournamentIfReady(): boolean {
    if (!state) createTournament();
    if (!state) return false;
    // Require at least 3 players as per requirement
    if ((state.players?.length || 0) < 3) return false;
    state.status = 'in_progress';
    return true;
}

function findNextPlayableMatch(matches: TournamentMatch[]): TournamentMatch | undefined {
    for (const m of matches) {
        if (m.status !== 'pending') continue;
        const p1Id = m.p1?.playerId;
        const p2Id = m.p2?.playerId;
        if (!p1Id || !p2Id) continue;
        if (isByeId(p1Id) || isByeId(p2Id)) continue;
        return m;
    }
    return undefined;
}

function autoResolveByes(): void {
    if (!state) return;

    // Precompute which matches feed into which slots of a given match
    const feeders: Map<number, { left: boolean; right: boolean }> = new Map();
    for (const m of state.matches) {
        if (!m.nextMatchId || !m.nextSlot) continue;
        const entry = feeders.get(m.nextMatchId) || { left: false, right: false };
        if (m.nextSlot === 'p1') entry.left = true; else entry.right = true;
        feeders.set(m.nextMatchId, entry);
    }

    let changed = true;
    while (changed) {
        changed = false;
        for (const m of state.matches) {
            if (m.status !== 'pending') continue;

            const p1 = m.p1;
            const p2 = m.p2;
            const p1Missing = !p1?.playerId || isByeId(p1.playerId);
            const p2Missing = !p2?.playerId || isByeId(p2.playerId);

            // If both missing or both present, skip
            if ((p1Missing && p2Missing) || (!p1Missing && !p2Missing)) continue;

            // Determine if the missing side has an upstream feeder; if yes, do NOT auto-advance
            const f = feeders.get(m.matchId) || { left: false, right: false };
            const missingHasFeeder = (p1Missing && f.left) || (p2Missing && f.right);
            if (missingHasFeeder) continue;

            // Otherwise, legitimate BYE: advance the present player
            const winner = p1Missing ? p2 : p1;
            if (!winner) continue;
            m.status = 'completed';
            m.winner = winner;
            m.finishedAt = new Date().toISOString();

            if (m.nextMatchId && m.nextSlot) {
                const next = state.matches.find(x => x.matchId === m.nextMatchId);
                if (next) {
                    if (m.nextSlot === 'p1') next.p1 = winner; else next.p2 = winner;
                }
            }
            changed = true;
        }
    }
}

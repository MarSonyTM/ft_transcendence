import { User, Tournament, TournamentPlayer, TournamentMatch, MatchSummary, TournamentArchive } from '../../../shared/tournamentTypes';
import { authService } from './auth';

// Simple in-memory tournament store with localStorage archive//TODO:MERGE change
let state: Tournament | undefined = undefined;

const LS_ARCHIVE_KEY = 'tournamentArchive';
const BYE_PREFIX = '__BYE__-';
const isByeId = (identityCheck?: string) => !!identityCheck && identityCheck.startsWith(BYE_PREFIX);

export function createTournament(): Tournament {
	state = {
		tournamentId: 0,
		status: 'setup',
        format: 'single_elimination',
        players: [],
		createdAt: new Date().toISOString(),
        startedAt: '',
        finishedAt: '',
        updatedAt: new Date().toISOString(),
        matchDelay: 3
	};

    let user: User | undefined = undefined;
    const isUser = authService.getCurrentUser();
    if (isUser) {
        user = {
            id: parseInt(isUser.id),
            username: isUser.username,
            email: isUser.email,
            avatar: isUser.avatar,
            gamesWon: isUser.gamesWon,
            gamesLost: isUser.gamesLost
        }
    }
    if (user) {
        const hostPlayer: TournamentPlayer = {
            id: 0,
            name: user.username,
            tournamentId: state.tournamentId,
            user,
            isAI: false,
            isLocalGuest: false,
            isRemote: false,
            isHost: true,
            isReady: false,
            score: 0,
            wins: 0,
            losses: 0,
            totalScore: 0,
            averageScore: 0,
            connectionStatus: 'connected',
            lastActivity: new Date().toISOString()
        } as TournamentPlayer;
        state.players.push(hostPlayer);
    }
	return state;
}

export function getTournament(): Tournament | undefined {
	return state;
}

export function addPlayer(name: string, opts?: { isAI?: boolean; isLocalGuest?: boolean; isRemote?: boolean; isHost?: boolean, isReady?: boolean, user?: User }): TournamentPlayer {
	if (!state) createTournament();
    const nextIdx = (state?.players?.length ?? 0) + 1;
    const uniqueId = `p-${state!.tournamentId}-${nextIdx}-${Math.random().toString(36).slice(2,6)}`;
	const player: TournamentPlayer = {
        id: nextIdx,
		name: opts?.user ? opts.user.username : name,
        tournamentId: state!.tournamentId,
        identity: uniqueId,
        user: opts?.isLocalGuest ? undefined : opts?.user,
		isAI: opts?.isAI,
		isLocalGuest: opts?.isLocalGuest,
		isRemote: opts?.isRemote,
        isHost: opts?.isHost,
        isReady: opts?.isAI ? true : false,
        score: 0,
        wins: 0,
        losses: 0,
        connectionStatus: 'connected',
        lastActivity: new Date().toISOString(),
	};
	state?.players.push(player);
	return player;
}

export function removePlayer(id: number): void {
	if (!state) return;
	state.players = state.players?.filter(p => p.id !== id);
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
            tournamentId: state.tournamentId!,
            status: 'pending',
            p1,
            p2,
            createdAt: new Date().toISOString(),
            startedAt: '',
            finishedAt: '',
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
                tournamentId: state.tournamentId!,
                status: 'pending',
                createdAt: new Date().toISOString(),
                startedAt: '',
                finishedAt: '',
                round: roundNum,
                indexInRound: Math.floor(i / 2),
            };
            prev[i].nextMatchId = m.matchId;
            prev[i].nextSlot = 'p1';
            if (i + 1 < prev.length) {
                prev[i + 1].nextMatchId = m.matchId;
                prev[i + 1].nextSlot = 'p2';
            }
            cur.push(m);
        }
        rounds.push(cur);
        prev = cur;
        roundNum++;
    }

    state.matches = rounds.flat();
    autoResolveByes();
    relevelRoundsByDependencies();

    state.currentMatch = findNextPlayableMatch(state.matches);
    state.status = 'in_progress';
    state.updatedAt = new Date().toISOString();
    return state.matches;
}

export function updateHistory(): void {//TODO:MERGE use this?
    if (!state || !state.matches) return;
    if (!state.matchHistory) state.matchHistory = [];
    for (const m of state.matches) {
        if (m.status !== 'completed') continue;
        state.matchHistory.push({
            matchId: m.matchId,
            p1: m.p1!,
            p2: m.p2!,
            winner: m.winner,
            loser: m.loser,
            createdAt: m.createdAt!,
            startedAt: m.startedAt,
            finishedAt: m.finishedAt,
            disputeReason: m.disputeReason
        });
    }
}

export function getCurrentMatch(): TournamentMatch | undefined {
	if (!state) return undefined;
	if (state.currentMatch === undefined ||
        (state.matches && state.currentMatch && state.matches.find(m => m.matchId === state?.currentMatch?.matchId) === undefined))
        return undefined;
	return state.currentMatch;
}

export function getPlayerById(id: number): TournamentPlayer | undefined {
	if (!state) return undefined;
	return state.players?.find(p => p.id === id);
}

export function advanceAfterResult(matchId: number, winnerId: number, p1Score: number, p2Score: number): void {
    if (!state) return;
    const match = state.matches?.find(m => m.matchId === matchId);
    if (!match) return;
    match.status = 'completed';
    match.winner = match.p1?.id === winnerId ? match.p1 : match.p2;
    match.loser = (match.p1?.id === winnerId) ? match.p2 : match.p1;
    match.p1!.score = p1Score;
    match.p2!.score = p2Score;
    match.finishedAt = new Date().toISOString();

    if (match.nextMatchId && match.nextSlot) {
        const next = state.matches?.find(m => m.matchId === match.nextMatchId);
        if (next) {
            if (match.nextSlot === 'p1') next.p1 = match.winner;
            else next.p2 = match.winner;

            const nextHasBye = isByeId(next.p1?.identity!) || isByeId(next.p2?.identity!);
            const nextBothPresent = next.p1 && next.p2;
            if (nextBothPresent && nextHasBye) {
                autoResolveByes();
            }
        }
    }

    const nextIdx = state.matches?.findIndex(m =>
        m.status === 'pending' && m.p1 && m.p2 &&
        !isByeId(m.p1?.identity!) && !isByeId(m.p2?.identity!)
    );
    if (nextIdx && nextIdx >= 0) {
        state.currentMatch = state.matches![nextIdx];
    } else {
        state.status = 'completed';
        state.champion = getPlayerById(winnerId);
        state.currentMatch = undefined;
        updateHistory();
        persistArchive();
    }
    state.updatedAt = new Date().toISOString();
}

export function setMatchLiveInfo(matchId: number, info: Partial<Pick<TournamentMatch, 'status' | 'roomId' | 'gameId'>>): void {
	if (!state || !state.matches) return;
	const m = state.matches.find(x => x.matchId === matchId);
	if (!m) return;
	Object.assign(m, info);
	if (info.status === 'in_progress') {
		m.startedAt = new Date().toISOString();
        state.updatedAt = new Date().toISOString();
	}
}

function persistArchive(): void {
	if (!state) return;
	const item: TournamentArchive = {
		tournamentId: state.tournamentId!,
		createdAt: state.createdAt,
        startedAt: state.startedAt!,
        finishedAt: state.finishedAt!,
		players: state.players,
		matches: state.matchHistory!,
		champion: state.champion!
	};
	const list = getArchive();
	list.unshift(item);
	localStorage.setItem(LS_ARCHIVE_KEY, JSON.stringify(list).toString());//TODO:MERGE only local storage?
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
    if (!matches) return;

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
    state.updatedAt = new Date().toISOString();
}

export function startTournamentIfReady(): boolean {
    if (!state) createTournament();
    if (!state) return false;
    if ((state.players?.length || 0) < 3) return false;
    state.status = 'in_progress';
    state.startedAt = new Date().toISOString();
    state.updatedAt = new Date().toISOString();
    return true;
}

function findNextPlayableMatch(matches: TournamentMatch[]): TournamentMatch | undefined {
    for (const m of matches) {
        if (m.status !== 'pending') continue;
        const p1Id = m.p1?.identity;
        const p2Id = m.p2?.identity;
        if (!p1Id || !p2Id) continue;
        if (isByeId(p1Id) || isByeId(p2Id)) continue;
        return m;
    }
    return undefined;
}

function autoResolveByes(): void {
    if (!state || !state.matches) return;

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
            const p1Missing = !p1?.identity || isByeId(p1.identity);
            const p2Missing = !p2?.identity || isByeId(p2.identity);

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
    state.updatedAt = new Date().toISOString();
}

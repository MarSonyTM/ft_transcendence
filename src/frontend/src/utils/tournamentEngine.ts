import { User, Tournament, TournamentPlayer, TournamentMatch, MatchSummary, TournamentArchive, TPT } from '../../../shared/tournamentTypes';
import { authService } from './auth';

let state: Tournament | undefined = undefined;

const LS_ARCHIVE_KEY = 'tournamentArchive';
const BYE_PREFIX = '__BYE__-';
const isByeId = (identityCheck?: string) => !!identityCheck && identityCheck.startsWith(BYE_PREFIX);

let nextPlayerId = 1;
let nextMatchId = 1;

export function createTournament(): Tournament {
    state = {
        tId: Date.now(),
        status: 'idle',
        players: [],
        queue: [],
        matches: [],
        curMatch: undefined,
        nextMatches: [],
        matchHistory: [],
        createdAt: new Date().toISOString(),
        startedAt: '',
        finishedAt: '',
        updatedAt: new Date().toISOString(),
        champion: undefined,
        matchDelay: 3
    } as Tournament;

    try {
        const usr = authService.getCurrentUser();
        if (usr) {
            const user: User = {
                id: parseInt(usr.id),
                username: usr.username,
                email: usr.email,
                avatar: usr.avatar,
                gamesWon: usr.gamesWon,
                gamesLost: usr.gamesLost
            };
            const p: TournamentPlayer = {
                id: nextPlayerId++,
                name: user.username,
                tId: state.tId,
                identity: '',
                user,
                tpt: 'host',
                isReady: false,
                pos: undefined,
                score: 0,
                eliminated: false,
                wins: 0,
                losses: 0,
                connectionStatus: 'connected',
                lastActivity: new Date().toISOString()
            } as TournamentPlayer;
            p.identity = createUniqueId(p.id, 'host');
            state.players = [p];
        }
    } catch {/* ignore auth errors */}
    return state;
}

export function getTournament(): Tournament | undefined {
	return state;
}

function createUniqueId(idx: number, type: TPT) : string {
    if (!state) {
        console.log('Unable to create unique ID, missing state');
        return ``;
    }
    return `${type}-${state!.tId}-${idx}-${Math.random().toString(36).slice(2,6)}`;
}

// Build a single-elimination bracket with random first-round pairing.
// Even player counts => no BYEs in Round 1. Odd counts => one implicit BYE.
export function buildBracket(): TournamentMatch[] {
    if (!state) throw new Error('No tournament');
    const players = [...(state.players as TournamentPlayer[])];

    for (const p of players) {
        if (!p.identity) p.identity = createUniqueId(p.id, (p.tpt || 'local') as TPT);
    }

    // Shuffle players for random pairing
    for (let i = players.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [players[i], players[j]] = [players[j], players[i]];
    }

    const rounds: TournamentMatch[][] = [];

    // Round 1: pair sequentially; if odd, last player gets implicit BYE (p2 undefined)
    const r1: TournamentMatch[] = [];
    for (let i = 0; i < players.length; i += 2) {
        const p1 = players[i];
        const p2 = players[i + 1];
        let x: Partial<TournamentMatch> = {
            tId: state.tId!,
            roomId: '',
            status: 'pending',
            p1,
            p2,
            createdAt: new Date().toISOString(),
            startedAt: '',
            finishedAt: '',
            round: 1,
            indexInRound: Math.floor(i / 2)
        };
        (x as any).matchId = nextMatchId++;
        r1.push(x as TournamentMatch);
    }
    rounds.push(r1);

    // Subsequent rounds: link winners; if odd number of prev matches, last flows alone
    let prev = r1;
    let roundNum = 2;
    while (prev.length > 1) {
        const cur: TournamentMatch[] = [];
        for (let i = 0; i < prev.length; i += 2) {
            let y: Partial<TournamentMatch> = {
                tId: state.tId!,
                roomId: '',
                status: 'pending',
                createdAt: new Date().toISOString(),
                startedAt: '',
                finishedAt: '',
                round: roundNum,
                indexInRound: Math.floor(i / 2),
            };
            (y as any).matchId = nextMatchId++;
            prev[i].nextMatchId = (y as any).matchId;
            prev[i].nextSlot = 'p1';
            if (i + 1 < prev.length) {
                prev[i + 1].nextMatchId = (y as any).matchId;
                prev[i + 1].nextSlot = 'p2';
            }
            cur.push(y as TournamentMatch);
        }
        rounds.push(cur);
        prev = cur;
        roundNum++;
    }

    const flat = rounds.flat();
    state.matches = flat;
    autoResolveByes();
    relevelRoundsByDependencies();

    state.curMatch = findNextPlayableMatch(state.matches);
    state.status = 'in_progress';
    state.updatedAt = new Date().toISOString();
    return state.matches;
}

// export function updateHistory(): void {//TODO:MERGE use this?
//     if (!state || !state.matches) return;
//     if (!state.matchHistory) state.matchHistory = [];
//     for (const m of state.matches) {
//         if (m.status !== 'completed') continue;
//         state.matchHistory.push({
//             matchId: m.matchId,
//             p1: m.p1!,
//             p2: m.p2!,
//             winner: m.winner,
//             loser: m.loser,
//             createdAt: m.createdAt!,
//             startedAt: m.startedAt,
//             finishedAt: m.finishedAt,
//         });
//     }
// }

export function getCurrentMatch(): TournamentMatch | undefined {
	if (!state) return undefined;
	if (state.curMatch === undefined ||
        (state.matches && state.curMatch && state.matches.find(m => m.matchId === state?.curMatch?.matchId) === undefined))
        return undefined;
	return state.curMatch;
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
        state.curMatch = state.matches![nextIdx];
    } else {
        state.status = 'completed';
        state.champion = getPlayerById(winnerId);
        state.curMatch = undefined;
        state.finishedAt = new Date().toISOString();
        state.updatedAt = new Date().toISOString();
        // updateHistory();
        persistArchive();
    }
    state.updatedAt = new Date().toISOString();
}

export function setMatchLiveInfo(matchId: number, info: Partial<Pick<TournamentMatch, 'status' | 'roomId' | 'gameId'>>): void {
	if (!state) return;
	const m = state.matches?.find(x => x.matchId === matchId);
	if (!m) return;
	Object.assign(m, info);
	if (info.status === 'in_progress') {
		m.startedAt = new Date().toISOString();
        state.updatedAt = new Date().toISOString();
	}
    // if (info.gameId) {
    //     m.gameId = info.gameId;
    //     state.updatedAt = new Date().toISOString();
    // }
    // if (info.roomId) {
    //     m.roomId = info.roomId;
    //     state.updatedAt = new Date().toISOString();
    // }
}

function persistArchive(): void {
	if (!state) return;
	const item: TournamentArchive = {
		tId: state.tId!,
		createdAt: state.createdAt,
        startedAt: state.startedAt!,
        finishedAt: state.finishedAt!,
		players: state.players,
		matches: state.matchHistory!,
		champion: state.champion!
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
    state.curMatch = findNextPlayableMatch(state.matches);
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
        const p1Bye = p1Id ? isByeId(p1Id) : false;
        const p2Bye = p2Id ? isByeId(p2Id) : false;
        if (!m.p1 || !m.p2) continue;
        if (p1Bye || p2Bye) continue;
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

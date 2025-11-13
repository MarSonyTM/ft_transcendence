import { Tournament, TournamentMatch, TournamentPlayer, MatchStatus, TournamentStatus, TournamentArchiveEntry } from "../types";
import { getCurrentTournament, hydrateTournament, setCurrentTournament } from "./tournamentState";
import { getCurrentUser } from "./globalState";
import { authService } from "./auth";

// Canonical tournament utilities (no legacy adapter layer)

// -------- Canonical local archive (V2) --------
type ArchiveEntry = TournamentArchiveEntry;
const LOCAL_ARCHIVE_KEY = 'tournamentArchiveV2';
let legacyArchive: ArchiveEntry[] = [];

function loadArchive(): void {
	try {
		const raw = localStorage.getItem(LOCAL_ARCHIVE_KEY);
		if (raw) legacyArchive = JSON.parse(raw) || [];
	} catch { /* ignore */ }
}
function persistArchive(): void {
	try { localStorage.setItem(LOCAL_ARCHIVE_KEY, JSON.stringify(legacyArchive)); } catch { /* ignore */ }
}
loadArchive();

export function getArchive(): ArchiveEntry[] { return legacyArchive.slice(); }

function addToArchive(entry: ArchiveEntry): void { legacyArchive.push(entry); persistArchive(); }

// -------- Tournament creation / management --------
// Removed legacy counters (tId, tPId, matchId); display ordering derived at render time.

// Create a fresh canonical tournament and hydrate state.
export function createTournament(): Tournament {
	const tournamentId = `t-${Date.now()}-${Math.floor(Math.random()*1e5)}`;
	const host: TournamentPlayer = {
		playerId: `p-${Date.now()}-${Math.floor(Math.random()*1e4)}`,
		tournamentId,
		name: authService.getCurrentUser()?.username,
		avatar: authService.getCurrentUser()?.avatar,
		tpt: 'host',
		isReady: false,
		score: 0,
		identity: getCurrentUser() || 'host',
		eliminated: false
	}
	const t: Tournament = {
		tournamentId,
		status: 'setup',
		players: [host],
		allMatches: [],
		currentMatch: null,
		championId: null
	};
	hydrateTournament(t);
	// Initialize bracket state fields
	t.bracketRound = 0; t.matchQueueIds = [];
	return getCurrentTournament()!;
}

export function resetTournament(): void {
	setCurrentTournament(null); // clears state
	createTournament();
}

export function getTournament(): Tournament | null {
	const t = getCurrentTournament();
	if (!t) return createTournament();
	return t;
}

export function setTournament(t: Tournament): void {
    // Hydrate canonical tournament directly
    hydrateTournament(t);
}

// Utility to derive numeric-ish id for display ordering (not guaranteed unique globally)
// (numeric derivation helpers removed)

export function addPlayerToTournament(partial: { name: string; tpt: string; isReady: boolean }): TournamentPlayer | null {
	// Always operate on canonical tournament state to avoid mutating t objects
	let canon = getCurrentTournament();
	if (!canon) canon = createTournament();
	if (!canon) { console.warn('[Tournament] Failed to obtain canonical tournament for player add'); return null; }
	const player: TournamentPlayer = {
		playerId: `p-${Date.now()}-${Math.floor(Math.random()*1e4)}`,
		tournamentId: canon.tournamentId,
		tpt: partial.tpt as any,
		identity: partial.name,
		name: partial.name,
		avatar: undefined,
		isReady: partial.isReady,
		pos: undefined,
		score: 0,
		eliminated: false,
		byeRounds: []
	};
	canon.players.push(player);
	// Re-hydrate to ensure any derived t reads next time reflect updated list
	hydrateTournament(canon);
	return player;
}

// removed legacy getPlayerById()

// Simple bracket setup: pair players sequentially by shuffled order, set tournament active.
// ---------------- New round-based bracket logic (adapted from legacy request) ----------------
// Ephemeral state (not yet persisted in canonical Tournament type)
let bracketRound = 0; // current round number (starts at 0 until first insertion)
let matchQueue: TournamentMatch[] = []; // queue of matches for current round
let currentMatchShadow: any | null = null; // current active/pending match (shadow only)

function createMatch(index: number, round: number): any {
	const t = getCurrentTournament();
	return {
		matchRoomId: `room-${round}-${Date.now()}-${Math.floor(Math.random()*1e4)}`,
		tournamentId: t?.tournamentId || '',
		status: 'setup',
		playerId1: '',
		playerId2: '',
		p1: undefined,
		p2: undefined,
		winner: null,
		round,
		roundIdx: index - 1
	};
}

function toggleByePlayer(player: TournamentPlayer): void {
	console.debug(`[Tournament] BYE awarded to ${player.name}`);
}

// Insert (non-eliminated) players into matches of the next round; advance bracket state.
export function insertPlayersIntoNextRound(): void {
	const t = getTournament();
	if (!t || !t.players) return;
	bracketRound++;
	let remaining: TournamentPlayer[] = t.players.filter((p: any) => !p.eliminated).slice();
	if (remaining.length === 0) return;
	if (remaining.length === 1) {
		// Champion found – finalize tournament
		const champ = remaining.pop()!;
		t.championId = champ.playerId;
		t.status = 'completed';
		// Persist archive entry using existing finalize helper
		finalizeTournament(champ.playerId);
		t.status = 'completed';
		setTournament(t); // updates canonical championId/status
		console.log('Tournament is done!');
		return;
	}
	// Shuffle remaining players
	for (let i = remaining.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[remaining[i], remaining[j]] = [remaining[j], remaining[i]];
	}
	// Build queue from matches of this round (reverse so pop gives earliest added)
	matchQueue = (t.allMatches || []).filter((m: any) => m.round === bracketRound).reverse();
	for (const m of matchQueue) {
		const set = remaining.splice(0, 2);
		if (set[0]) m.playerId1 = set[0].playerId;
		if (set[1]) m.playerId2 = set[1].playerId;
	}
	if (remaining.length > 0) {
		// Assign single BYE player to next round automatically
		toggleByePlayer(remaining.shift()!);
		if (remaining.length > 0) throw new Error('More than one player left after assigning BYE');
	}
	matchQueue.forEach(m => m.status = 'setup');
	currentMatchShadow = matchQueue.pop() || null;
	t.currentMatch = currentMatchShadow || null;
	if (t.currentMatch) t.currentMatch.status = 'active';
	t.status = t.currentMatch ? 'active' : t.status;
	// Persist bracket state
	t.bracketRound = bracketRound;
	t.matchQueueIds = matchQueue.map(m => m.matchRoomId);
	// Persist updated matches & status back into canonical state
	setTournament(t);
}

export function setupMatches(): void {
	let t = getTournament();
	if (!t) throw new Error('No tournament');
	if (!t.players) throw new Error('No players in tournament');
	bracketRound = 0; matchQueue = []; currentMatchShadow = null;
	let round: number = 1;
	let amount: number = t.players.length;
	let bye: boolean = amount % 2 === 1;
	amount = Math.floor(amount / 2);
	while (amount > 1 || bye) {
		let i = 0;
		while (i++ < amount) {
			const match = createMatch(i, round);
			t.allMatches = t.allMatches || [];
			t.allMatches.push(match);
		}
		amount += bye ? 1 : 0;
		bye = amount % 2 === 1;
		amount = Math.floor(amount / 2);
		round++;
	}
	t.status = 'setup';
	setTournament(t); // persist base bracket structure
	insertPlayersIntoNextRound(); // populate first round players & start tournament
	t = getTournament();
	if (t) setTournament(t);
}

export function getCurrentMatch(): TournamentMatch | undefined {
	let t = getTournament();
	if (!t) return undefined;
	if (t.currentMatch && t.currentMatch.status !== 'completed') {
		return t.currentMatch;
	}
	if (matchQueue.length === 0) {
		insertPlayersIntoNextRound();
		t = getTournament();
	} else {
		const nxt = matchQueue.pop() || null;
		if (nxt) nxt.status = 'active';
		t.currentMatch = nxt;
		if (t?.matchQueueIds) t.matchQueueIds = matchQueue.map(m => m.matchRoomId);
		setTournament(t);
	}
	t = getTournament();
	return t?.currentMatch || undefined;
}

// Mark tournament complete and archive (legacy path)
export function finalizeTournament(championId: string | null): void {
	const t = getCurrentTournament();
	if (!t) return;
	t.status = 'completed';
	t.championId = championId;
	const entry: ArchiveEntry = {
		tournamentId: t.tournamentId,
		status: t.status,
		players: t.players.slice(),
		matches: t.allMatches.slice(),
		championId: championId,
		createdAt: new Date().toISOString(),
		finishedAt: new Date().toISOString(),
		startedAt: new Date().toISOString()
	};
	addToArchive(entry);
}

// Fetch and hydrate a tournament by id; returns current tournament or null on failure
export async function setEffectiveTournament(tournamentId: string): Promise<Tournament | null> {
	try {
		const apiEndpoint = window.__INITIAL_STATE__?.apiEndpoint || '';
		const resp = await fetch(`${apiEndpoint}/api/tournament/${tournamentId}`);
		const json = await resp.json();
		if (json?.success && json?.data) {
			// Expect backend to return shape convertible to frontend Tournament
			// If shape already matches, hydrate directly; otherwise map minimal fields
			const serverT = json.data as Partial<Tournament> & { tournamentId?: string };
			const normalized: Partial<Tournament> & { tournamentId: string } = {
				tournamentId: serverT.tournamentId,
				status: serverT.status,
				players: (serverT as any).players || [],
				allMatches: (serverT as any).allMatches || (serverT as any).matches || [],
				championId: (serverT as any).championId ?? null,
			} as any;
			hydrateTournament(normalized);
			return getCurrentTournament();
		}
	} catch (e) {
		console.error('Failed to fetch tournament:', e);
	}
	return null;
}

// Post winner for a tournament match
export async function postTournamentMatchWinner(tournamentId: string, matchRoomId: string, winner: string | null): Promise<boolean> {
	try {
		const apiEndpoint = window.__INITIAL_STATE__?.apiEndpoint || '';
		const resp = await fetch(`${apiEndpoint}/api/tournament/${tournamentId}/match/${matchRoomId}/end`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ winnerId: winner !== null ? String(winner) : undefined })
		});
		if (!resp.ok) return false;
		const json = await resp.json();
		return !!json?.success;
	} catch (e) {
		console.error('Failed to post match winner:', e);
		return false;
	}
}

// Show a simple overlay announcing the tournament champion
export function showTournamentEndScreen(championId: string, championName?: string): void {
	const existingOverlay = document.getElementById('tournamentEndOverlay');
	if (existingOverlay) existingOverlay.remove();

	const overlay = document.createElement('div');
	overlay.id = 'tournamentEndOverlay';
	overlay.style.cssText = `
		position: fixed; inset: 0; background: rgba(0,0,0,0.9);
		display: flex; align-items: center; justify-content: center; z-index: 1000;
	`;

	const t = getCurrentTournament();
	const name = championName || (t?.players.find(p => p.playerId === championId)?.name) || `Player ${championId}`;

	overlay.innerHTML = `
		<div style="background: rgb(55 65 81); padding: 3em; border-radius: 12px; text-align: center; max-width: 560px;">
			<div style="font-size: 4em; margin-bottom: 0.2em;">🏆</div>
			<h2 style="color: rgb(52 211 153); font-size: 2.4em; margin: 0 0 0.3em 0;">Tournament Finished</h2>
			<p style="color: rgb(209 213 219); font-size: 1.6em; margin-bottom: 1.5em; font-weight: bold;">${name} is the Champion!</p>
			<div style="display: flex; gap: 1em; justify-content: center;">
				<button id="backToHomeBtn" style="background: rgb(99 102 241); color: white; border: none; padding: 1em 2em; border-radius: 8px; font-size: 1.1em; cursor: pointer; font-weight: 600; transition: background 0.2s;">Back to Home</button>
			</div>
		</div>
	`;

	document.body.appendChild(overlay);
	setTimeout(() => {
		const backBtn = document.getElementById('backToHomeBtn');
		if (backBtn) backBtn.addEventListener('click', () => { overlay.remove(); history.pushState({ page: 'landing' }, '', '/'); window.location.reload(); });
	}, 0);
}

// Small toast for disconnects
export function showTournamentPlayerDisconnectedMessage(playerName: string): void {
	const notification = document.createElement('div');
	notification.style.cssText = `
		position: fixed; top: 20px; right: 20px; background: rgb(220 38 38);
		color: white; padding: 1em 1.5em; border-radius: 8px; z-index: 999; font-weight: 600;
		box-t: 0 4px 6px rgba(0,0,0,0.3); animation: slideIn 0.3s ease-out;
	`;
	notification.innerHTML = `⚠️ ${playerName} disconnected`;
	document.body.appendChild(notification);
	setTimeout(() => { notification.style.animation = 'slideOut 0.3s ease-in'; setTimeout(() => notification.remove(), 300); }, 4000);
}

// Utility to resolve a match by id from local state
export function findMatch(matchRoomId: string): TournamentMatch | undefined {
	const t = getCurrentTournament();
	return t?.allMatches.find(m => m.matchRoomId === matchRoomId);
}

export function findPlayer(playerId: string): TournamentPlayer | undefined {
	const t = getCurrentTournament();
	return t?.players.find(p => p.playerId === playerId);
}

// Legacy name compatibility (so existing imports in pages stop erroring)
export const getTournamentPlayersLegacy = getTournament;
export const getTournamentLegacy = getTournament;
// getPlayerLegacy removed; use findPlayer instead if needed



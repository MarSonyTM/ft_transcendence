import { TournamentPlayer, TournamentStatus, TournamentMatch, Tournament } from "../types/index";

let currentTournament: Tournament | null = null;
let currentMatch: TournamentMatch | null = null;

// --- Tournament level ---
export function getCurrentTournament(): Tournament | null { return currentTournament; }
export function setCurrentTournament(t: Tournament | null): void { currentTournament = t; if (!t) currentMatch = null; }
export function clearTournament(): void { currentTournament = null; currentMatch = null; }

// --- Players ---
export function getTournamentPlayers(): TournamentPlayer[] { return currentTournament ? currentTournament.players : []; }

export function addTournamentPlayer(player: TournamentPlayer): void {
	if (!currentTournament) return;
	if (currentTournament.players.find(p => p.playerId === player.playerId)) return;
	currentTournament.players.push(player);
}

export function removeTournamentPlayer(playerId: string): void {
	if (!currentTournament) return;
	currentTournament.players = currentTournament.players.filter(p => p.playerId !== playerId);
}

export function toggleTournamentPlayerReady(playerId: string): void {
	if (!currentTournament) return;
	const p = currentTournament.players.find(pl => pl.playerId === playerId);
	if (p) p.isReady = !p.isReady;
}

export function updateTournamentPlayer(partial: Partial<TournamentPlayer> & { playerId: number }): void {
	if (!currentTournament) return;
	const idx = currentTournament.players.findIndex(p => p.playerId === partial.playerId);
	if (idx >= 0) currentTournament.players[idx] = { ...currentTournament.players[idx], ...partial } as TournamentPlayer;
}

// --- Matches ---
export function getTournamentMatchList(): TournamentMatch[] { return currentTournament ? currentTournament.allMatches : []; }

export function findTournamentMatch(matchRoomId: string): TournamentMatch | undefined {
	return currentTournament?.allMatches.find(m => m.matchRoomId === matchRoomId);
}

export function upsertTournamentMatch(match: TournamentMatch): void {
	if (!currentTournament) return;
	const idx = currentTournament.allMatches.findIndex(m => m.matchRoomId === match.matchRoomId);
	if (idx >= 0) currentTournament.allMatches[idx] = match; else currentTournament.allMatches.push(match);
	if (currentMatch && currentMatch.matchRoomId === match.matchRoomId) currentMatch = match;
}

// --- Current match ---
export function getCurrentMatch(): TournamentMatch | null { return currentMatch; }
export function setCurrentMatch(match: TournamentMatch | null): void { currentMatch = match; if (match) upsertTournamentMatch(match); }
export function clearCurrentMatch(): void { currentMatch = null; }

export function updateCurrentMatch(partial: Partial<TournamentMatch> & { matchRoomId: string }): void {
	if (!currentTournament) return;
	const existing = currentTournament.allMatches.find(m => m.matchRoomId === partial.matchRoomId);
	if (!existing) return;
	Object.assign(existing, partial);
	if (currentMatch && currentMatch.matchRoomId === partial.matchRoomId) Object.assign(currentMatch, partial);
}

// --- Status / champion ---
export function setTournamentStatus(status: TournamentStatus): void { if (currentTournament) currentTournament.status = status; }
export function setTournamentChampion(championId: string | null): void { if (currentTournament) currentTournament.championId = championId; }

// --- Hydration helper (merge incoming payload) ---
export function hydrateTournament(payload: Partial<Tournament> & { tournamentId: string }): void {
	if (!currentTournament || currentTournament.tournamentId !== payload.tournamentId) {
		currentTournament = {
			tournamentId: payload.tournamentId,
			status: payload.status || 'setup',
			players: payload.players ? payload.players.slice() : [],
			allMatches: payload.allMatches ? payload.allMatches.slice() : [],
			currentMatch: payload.currentMatch || null,
			championId: payload.championId || null
		};
	} else {
		if (payload.status !== undefined) currentTournament.status = payload.status;
		if (payload.players) currentTournament.players = payload.players.slice();
		if (payload.allMatches) currentTournament.allMatches = payload.allMatches.slice();
		if (payload.championId !== undefined) currentTournament.championId = payload.championId;
	}
}

// Legacy-compatible export names (if older code expected them)
export const getCurrentTournamentState = getCurrentTournament;
export const setCurrentTournamentState = setCurrentTournament;
export const clearTournamentState = clearTournament;
export const getTournamentMatches = getTournamentMatchList;
export const setCurrentTournamentMatchState = setCurrentMatch;
export const getCurrentTournamentMatchState = getCurrentMatch;
export const clearTournamentMatchState = clearCurrentMatch;
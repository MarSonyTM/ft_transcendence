import { TournamentPlayer, TournamentStatus, TournamentMatch, Tournament } from "../types/index";

let currentTournament: Tournament | null = null;
let currentMatch: TournamentMatch | null = null;


// --- Tournament level ---
export function getCurrentTournament(): Tournament | null { 
	return currentTournament;
}

export function setCurrentTournament(t: Tournament | null): void {
	currentTournament = t;
	if (!t) currentMatch = null;
}

// --- Players ---
export function getTournamentPlayers(): TournamentPlayer[] {
	return currentTournament ? currentTournament.players : [];
}

export function updateTournamentPlayer(playerId: number, partial?: Partial<TournamentPlayer>): void {
  if (!currentTournament) return;
  const idx = currentTournament.players.findIndex(p => p.id === playerId);
  if (idx < 0) return;
  if (!partial) {
    currentTournament.players[idx].isReady = !currentTournament.players[idx].isReady;
    return;
  }
  currentTournament.players[idx] = { ...currentTournament.players[idx], ...partial };
}

// --- Matches ---
export function getTournamentMatchList(): TournamentMatch[] {
	return currentTournament ? currentTournament.allMatches : [];
}

export function getTournamentMatch(matchId: number): TournamentMatch | undefined {
	return currentTournament?.allMatches.find(m => m.id === matchId);
}

// export function upsertTournamentMatch(match: TournamentMatch): void {
// 	if (!currentTournament) return;
// 	const idx = currentTournament.allMatches.findIndex(m => m.id === match.id);
// 	if (idx >= 0) currentTournament.allMatches[idx] = match;
// 	else currentTournament.allMatches.push(match);
// 	if (currentMatch && currentMatch.id === match.id) currentMatch = match;
// }

// --- Current match ---
export function getCurrentMatch(): TournamentMatch | null {
	return currentMatch;
}

export function setCurrentMatch(match: TournamentMatch | null): void {
	// currentMatch = match;
	if (currentTournament)
		(currentTournament as any).currentMatch = match;
	// if (match) upsertTournamentMatch(match);
}

export function updateCurrentMatch(partial: Partial<TournamentMatch> & { id: number }): void {
	if (!currentTournament) return;
	const existing = currentTournament.allMatches.find(m => m.id === partial.id);
	if (!existing) return;
	Object.assign(existing, partial);
	if (currentMatch && currentMatch.id === partial.id)
		Object.assign(currentMatch, partial);
}

// --- Status / champion ---
export function setTournamentStatus(status: TournamentStatus): void {
	if (currentTournament)
		currentTournament.status = status;
}

export function setTournamentChampion(championId: number | null): void {
	if (currentTournament)
		currentTournament.championId = championId;
}

// --- Hydration helper ---
export function hydrateTournament(t: Tournament): void {
  if (!currentTournament || currentTournament.id !== t.id) {
    currentTournament = t;
    currentMatch = t.currentMatch || null;
    return;
  }

  // Shallow replace mutable arrays/objects
  currentTournament.status = t.status;
  currentTournament.players = t.players;
  currentTournament.allMatches = t.allMatches;
  currentTournament.currentMatch = t.currentMatch || null;
  (currentTournament as any).matchQueue = (t as any).matchQueue;
  currentTournament.championId = t.championId;
  currentMatch = currentTournament.currentMatch;
}
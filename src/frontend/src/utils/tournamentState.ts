import { TournamentPlayer, TournamentMatch, Tournament } from "../types/index";

let currentTournament: Tournament | null = null;
let currentMatch: TournamentMatch | null = null;

export function getCurrentTournament(): Tournament | null { 
    return currentTournament;
}

export function setCurrentTournament(t: Tournament | null): void {
    currentTournament = t;
    if (!t)
        currentMatch = null;
    else if (t.curM)
        currentMatch = t.curM;
}

export function getTournamentPlayers(): TournamentPlayer[] {
    return currentTournament ? currentTournament.players : [];
}

export function getCurrentMatch(): TournamentMatch | null {
    return currentMatch || currentTournament?.curM || null;
}

export function setCurrentMatch(match: TournamentMatch | null): void {
    currentMatch = match;
    if (currentTournament)
        currentTournament.curM = match;
}

export function updateMatchInTournament(updatedMatch: TournamentMatch): void {
    if (!currentTournament) return;
    const idx = currentTournament.allMatches.findIndex(m => m.id === updatedMatch.id);
    if (idx >= 0)
        currentTournament.allMatches[idx] = updatedMatch;    
    if (currentMatch && currentMatch.id === updatedMatch.id) {
        currentMatch = updatedMatch;
        currentTournament.curM = updatedMatch;
    }
}
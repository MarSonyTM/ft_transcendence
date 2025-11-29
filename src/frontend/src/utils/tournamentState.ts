import { TournamentMatch, Tournament } from "../types/index";

let currentTournament: Tournament | null = null;
let currentMatch: TournamentMatch | null = null;

export function getCurrentTournament(): Tournament | null { 
    return currentTournament;
}

export function setCurrentTournament(t: Tournament | null): void {
    currentTournament = t;
    if (!t)
        currentMatch = null;
    if (t && t.curM)
        currentMatch = t.curM;
}

export function getCurrentMatch(): TournamentMatch | null {
    return currentMatch || currentTournament?.curM || null;
}

export function setCurrentMatch(match: TournamentMatch | null): void {
    currentMatch = match;
    if (currentTournament)
        currentTournament.curM = match;
}

import { Tournament, TournamentMatch, TournamentPlayer, TPT, getApiEndpoint } from '../types';
import { getCurrentTournament, setCurrentTournament, setCurrentMatch, getCurrentMatch } from './tournamentState';
import { authService } from './auth';
import { setCurrentPage } from './globalState';
import { renderApp } from '../main';

function unwrapPayload<T>(raw: any): T | null {
    if (!raw) return null;
    if (raw.success !== undefined) {
        if (!raw.success) return null;
        return (raw.data ?? raw.tournament ?? raw.match ?? null) as T | null;
    }
    return raw as T;
}

function normalizeMatch(raw: any): TournamentMatch {
    return {
        id: raw.id,
        tournamentId: raw.tournamentId,
        gameId: raw.gameId,
        roomId: raw.roomId,
        room: raw.room,
        status: raw.status || 'pending',
        isBye: raw.isBye ?? false,
        p1: raw.p1,
        p2: raw.p2,
        winnerId: raw.winnerId ?? null,
        round: typeof raw.round === 'number' ? raw.round : 0,
        roundIdx: typeof raw.roundIdx === 'number' ? raw.roundIdx : 0,
        createdAt: raw.createdAt,
        startedAt: raw.startedAt,
        endedAt: raw.endedAt
    };
}

function normalizeTournament(raw: any): Tournament {
    return {
        id: raw.id,
        status: raw.status || 'setup',
        players: (raw.players || []).map((p: any) => ({
            id: p.id,
            tournamentId: p.tournamentId,
            name: p.name,
            tpt: p.tpt,
            user: p.user,
            isReady: !!p.isReady,
            eliminated: !!p.eliminated,
            score: p.score ?? 0,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt
        })),
        allMatches: (raw.allMatches || []).map(normalizeMatch),
        championId: raw.championId ?? null,
        curM: raw.currentMatch || raw.curM ? normalizeMatch(raw.currentMatch || raw.curM) : null,
        matchQueue: raw.matchQueue || [],
        round: raw.round,
        createdAt: raw.createdAt,
        startedAt: raw.startedAt,
        endedAt: raw.endedAt
    };
}

export function hydrateTournament(t: Tournament): void {
    if (!t) return;
    setCurrentTournament(t);
    if (t.curM)
        setCurrentMatch(t.curM);
}

export async function createTournament(): Promise<Tournament | null> {
    try {
        const host = authService.getCurrentUser();
        if (!host) {
            console.error('Cannot create tournament: no authenticated user');
            return null;
        }

        const response = await fetch(`${getApiEndpoint()}/api/tournament`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': `Bearer ${authService.getToken()}` 
            },
            body: JSON.stringify({ 
                name: host.username,
                id: host.id
            })
        });

        const json = await response.json();
        if (!response.ok) {
            console.error('Failed to create tournament:', json);
            return null;
        }
        const raw = unwrapPayload<any>(json);
        if (!raw) return null;
        const t = normalizeTournament(raw);
        hydrateTournament(t);
        return t;
    } catch (err) {
        console.error('createTournament error:', err);
        return null;
    }
}

export async function resetTournament(): Promise<void> {
    setCurrentTournament(null);
    setCurrentMatch(null);
    const host = authService.getCurrentUser();
    if (!host) {
        console.error('Cannot create new tournament: no user logged in');
        return;
    }
    let t = await createTournament();
    if (!t || !t.id) {
        console.error('Failed to create new tournament during reset');
        return;
    }
    setCurrentTournament(t);
}

// export function getTournament(): Tournament | null {
//     return getCurrentTournament();
// }

export function setTournament(t: Tournament): void {
    hydrateTournament(t);
}

export async function addPlayerToTournament(tournamentId: number, name: string, tpt: TPT, userId?: number): Promise<TournamentPlayer | null> {
    try {
        let id = '-';
        if (userId) id = userId.toString();
        const resp = await fetch(`${getApiEndpoint()}/api/tournament/${tournamentId}/player`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': `Bearer ${authService.getToken()}` 
            },
            body: JSON.stringify({ 
                name, 
                tpt,
                id
            })
        });

        const json = await resp.json();
        if (!resp.ok) {
            console.error('Failed to add player:', json);
            return null;
        }
        const raw = unwrapPayload<any>(json);
        if (!raw) return null;
        const t = normalizeTournament(raw);
        hydrateTournament(t);
        return t.players.find(p => p.name === name) || null;
    } catch (error) {
        console.error('addPlayerToTournament error:', error);
        return null;
    }
}

export async function removeTournamentPlayer(playerName: string): Promise<void> {
    const currentTournament = getCurrentTournament();
    if (!currentTournament) return;
    const player = currentTournament.players.find(p => p.name === playerName);
    if (!player || !player.id) {
        console.error(`Player ${playerName} not found`, { player, allPlayers: currentTournament.players });
        return;
    }
    try {
        console.log(`Removing player ${playerName} (id=${player.id}) from tournament ${currentTournament.id}`);
        const resp = await fetch(`${getApiEndpoint()}/api/tournament/${currentTournament.id}/leave`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authService.getToken()}`
            },
            body: JSON.stringify({ playerId: player.id })
        });
        if (!resp.ok) {
            const msg = await resp.text().catch(() => '');
            console.error(`Failed to remove player ${player.id}`, msg);
            return;
        }
        showTournamentPlayerDisconnectedMessage(playerName);
        console.log(`Player ${player.id} removed from tournament ${currentTournament.id}`);
        if (currentTournament.id)
            await setEffectiveTournament(currentTournament.id);
    } catch (e) {
        console.error('removeTournamentPlayer failed:', e);
    }
}

export async function startTournament(): Promise<boolean> {
    const t = getCurrentTournament();
    if (!t || !t.id) {
        console.error('Cannot start tournament: no current tournament');
        return false;
    }
    try {
        const resp = await fetch(`${getApiEndpoint()}/api/tournament/${t.id}/start`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': `Bearer ${authService.getToken()}` 
            },
            body: JSON.stringify({})
        });
        const json = await resp.json();
        if (!resp.ok) {
            console.error('Failed to start tournament:', json?.message || `HTTP ${resp.status}`);
            return false;
        }
        await setEffectiveTournament(t.id);
        console.log(`Tournament ${t.id} started`);
        return true;
    } catch (e) {
        console.error('startTournament failed:', e);
        return false;
    }
}

export async function loadCurrentMatch(): Promise<TournamentMatch | null> {
    const t = getCurrentTournament();
    if (!t || !t.id) return null;
    try {
        const resp = await fetch(`${getApiEndpoint()}/api/tournament/${t.id}/match/current`, {
            headers: { 'Authorization': `Bearer ${authService.getToken()}` }
        });
        const json = await resp.json();
        if (!resp.ok) return null;
        const raw = unwrapPayload<any>(json);
        if (!raw) return null;
        const m = normalizeMatch(raw);
        setCurrentMatch(m);
        return m;
    } catch (error) {
        console.error('loadCurrentMatch error:', error);
        return null;
    }
}

export async function setEffectiveTournament(tournamentId: number): Promise<Tournament | null> {
    try {
        const resp = await fetch(`${getApiEndpoint()}/api/tournament/${tournamentId}`, {
            headers: { 'Authorization': `Bearer ${authService.getToken()}` }
        });
        const json = await resp.json();
        if (!resp.ok) return null;
        const raw = unwrapPayload<any>(json);
        if (!raw) return null;
        const t = normalizeTournament(raw);
        hydrateTournament(t);
        const curM = await loadCurrentMatch();
        if (curM) {
            t.curM = curM;
            setCurrentMatch(curM);
        }
        console.log(`Loaded tournament ${tournamentId} with ${t.players.length} players and ${t.allMatches.length} matches`);
        return t;
    } catch (error) {
        console.error('setEffectiveTournament error:', error);
        return null;
    }
}

export async function postTournamentMatchWinner(tournamentId: number, matchId: number, winnerId: number | null): Promise<boolean> {
    try {
        const resp = await fetch(`${getApiEndpoint()}/api/tournament/${tournamentId}/match/${matchId}/end`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': `Bearer ${authService.getToken()}` 
            },
            body: JSON.stringify({ winnerId })
        });
        if (!resp.ok) {
            console.error('Failed to post match winner:', resp.status);
            return false;
        }
        return true;
    } catch (e) {
        console.error('Failed to post match winner:', e);
        return false;
    }
}

export function finalizeTournament(championId: number | null): void {
    const t = getCurrentTournament();
    if (!t) return;
    t.status = 'completed';
    t.championId = championId;
    setCurrentTournament(t);
}

export function showTournamentEndScreen(championId: number, championName?: string): void {
    const existingOverlay = document.getElementById('tournamentEndOverlay');
    if (existingOverlay) existingOverlay.remove();
    const overlay = document.createElement('div');
    overlay.id = 'tournamentEndOverlay';
    overlay.style.cssText = `
        position: fixed; inset: 0; background: rgba(0,0,0,0.9);
        display: flex; align-items: center; justify-content: center; z-index: 1000;
    `;
    const t = getCurrentTournament();
    const name = championName || (t?.players.find(p => p.id === championId)?.name) || `Player ${championId}`;
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
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                overlay.remove();
                history.pushState({ page: 'landing' }, '', '/');
                setCurrentPage('landing');
                renderApp();
            });
        }
    }, 0);
}

export function showTournamentPlayerDisconnectedMessage(playerName: string): void {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed; top: 20px; right: 20px; background: rgb(220 38 38);
        color: white; padding: 1em 1.5em; border-radius: 8px; z-index: 999; font-weight: 600;
        box-shadow: 0 4px 6px rgba(0,0,0,0.3); animation: slideIn 0.3s ease-out;
    `;
    notification.innerHTML = `${playerName} disconnected`;
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => notification.remove(), 300);
    }, 4000);
}

export function findMatch(matchId: number): TournamentMatch | undefined {
    const t = getCurrentTournament();
    return t?.allMatches.find(m => m.id === matchId);
}

export function findPlayer(playerId: number): TournamentPlayer | undefined {
    const t = getCurrentTournament();
    return t?.players.find(p => p.id === playerId);
}
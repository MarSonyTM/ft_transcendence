import { Tournament, TournamentMatch, TournamentPlayer, TPT, getApiEndpoint } from '../types';
import { getCurrentTournament, setCurrentTournament, setCurrentMatch } from './tournamentState';
import { authService } from './auth';
import { setCurrentPage } from './globalState';
import { renderApp } from '../main';

export async function createTournament(): Promise<Tournament | null> {
    try {
        let ok: string = 'true';
        const host = await authService.getCurrentUser();
        if (!host) ok = 'false';
        const response = await fetch(`${getApiEndpoint()}/api/tournament`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                name: host?.username,
                id: host?.id,
                ok
            })
        });

        const data = await response.json();
        if (!response.ok) {
            console.error('Failed to create tournament:', data);
            return null;
        }
        const t: Tournament = data.data as Tournament;
        if (!t)
            return null;
        setCurrentTournament(t);
        return t;
    } catch (err) {
        console.error('createTournament error:', err);
        return null;
    }
}

export async function deleteTournament(tId: number): Promise<void> {
    try {
        const response = await fetch(`${getApiEndpoint()}/api/tournament/${tId}/delete`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            console.error('Failed to delete Tournament');
            return;
        }
        setCurrentTournament(null);
        setCurrentMatch(null);
    } catch (err) {
        console.error('deleteTournament failed:', err);
    }
}

export async function resetTournament(): Promise<void> {
    let t = getCurrentTournament();
    if (t && t.id && t.status === 'setup')
        deleteTournament(t.id);
	setCurrentTournament(null);
    setCurrentMatch(null);
    const host = authService.getCurrentUser();
    if (!host) {
        console.error('Cannot create new tournament: no user logged in');
        return;
    }
    t = await createTournament();
    if (!t || !t.id) {
        console.error('Failed to create new tournament during reset');
        return;
    }
    setCurrentTournament(t);
}

export async function addPlayerToTournament(tournamentId: number, name: string, tpt: TPT, userId?: number): Promise<TournamentPlayer | null> {
    try {
        let id = '-';
        if (userId) id = userId.toString();
        const resp = await fetch(`${getApiEndpoint()}/api/tournament/${tournamentId}/player`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                name, 
                tpt,
                id
            })
        });

        const data = await resp.json();
        if (!resp.ok) {
            console.error('Failed to add player:', data);
            return null;
        }
        const t: Tournament = data.data as Tournament;
        return t.players.find(p => p.name === name) || null;
    } catch (error) {
        console.error('addPlayerToTournament error:', error);
        return null;
    }
}

export async function removeTournamentPlayer(playerName: string): Promise<void> {
    const t = getCurrentTournament();
    if (!t) return;

    const player = t.players.find(p => p.name === playerName);
    if (!player || !player.id) {
        console.error(`Player ${playerName} not found`, { player, allPlayers: t.players });
        return;
    }

    try {
        console.log(`Removing player ${playerName} (id=${player.id}) from tournament ${t.id}`);

        const resp = await fetch(`${getApiEndpoint()}/api/tournament/${t.id}/leave`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playerId: player.id })
        });

        if (!resp.ok) {
            const msg = await resp.text().catch(() => '');
            console.error(`Failed to remove player ${player.id}`, msg);
            return;
        }

        showTournamentPlayerDisconnectedMessage(playerName);
        console.log(`Player ${player.id} removed from tournament ${t.id}`);
        if (t.id)
            await setEffectiveTournament(t.id);
    } catch (e) {
        console.error('removeTournamentPlayer failed:', e);
    }
}

export async function startTournament(): Promise<boolean> {
    try {
        let t = getCurrentTournament();
        if (!t || !t.id) {
            console.error('Cannot start tournament: no current tournament');
            return false;
        }
        const resp = await fetch(`${getApiEndpoint()}/api/tournament/${t.id}/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await resp.json();
        if (!resp.ok) {
            console.error('Failed to start tournament:', data?.message || `HTTP ${resp.status}`);
            return false;
        }
        t = data.data as Tournament;
        if (!t)
            return false;
        setCurrentTournament(t);
        console.log(`Tournament ${t.id} started`);
        return true;
    } catch (e) {
        console.error('startTournament failed:', e);
        return false;
    }
}

export async function loadCurrentMatch(): Promise<TournamentMatch | null> {
    try {
        const t = getCurrentTournament();
        if (!t || !t.id) return null;
        const resp = await fetch(`${getApiEndpoint()}/api/tournament/${t.id}/match/current`, {
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await resp.json();
        if (!resp.ok)
            return null;
        const m: TournamentMatch = data.data as TournamentMatch;
        if (!m)
            return null;
        t.curM = m;
        setCurrentMatch(m);
        return m;
    } catch (error) {
        console.error('loadCurrentMatch error:', error);
        return null;
    }
}

export async function setEffectiveTournament(tournamentId: number): Promise<Tournament> {
    try {
        const resp = await fetch(`${getApiEndpoint()}/api/tournament/${tournamentId}`, {
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await resp.json();
        if (!resp.ok) return null as any;
        const t: Tournament = data.data as Tournament;
        if (!t)
            return null as any;
        setCurrentTournament(t);
        t.curM = await loadCurrentMatch();
        console.log(`Loaded tournament ${tournamentId} with ${t.players.length} players and ${t.allMatches.length} matches`);
        return t;
    } catch (error) {
        console.error('setEffectiveTournament error:', error);
        return null as any;
    }
}

export async function postTournamentMatchWinner(tournamentId: number, matchId: number, winnerId: number | null): Promise<boolean> {
    try {
        const resp = await fetch(`${getApiEndpoint()}/api/tournament/${tournamentId}/match/${matchId}/end`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ winnerId })
        });
        if (!resp.ok) {
            console.error('Failed to post match winner:', resp.status);
            return false;
        }

        await setEffectiveTournament(tournamentId);
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
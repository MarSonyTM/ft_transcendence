import { setCurrentPage } from '../utils/globalState';
import { renderApp } from '../main';
import { PongGame } from '../game/PongGame';
import { authService } from '../utils/auth';
import { cleanupGame } from '../utils/gameUtils';
import { openTournamentArchive } from '../utils/tournamentArchive';
import {
    // getCurrentTournament,
    findPlayer,
    resetTournament,
    loadCurrentMatch,
    createTournament,
    setEffectiveTournament,
    postTournamentMatchWinner,
    showTournamentEndScreen,
    startTournament
} from '../utils/tournamentUtils';
import { renderSetup } from './tournamentLobbyPage';
import { MatchStatus, MSmap, TournamentMatch, getApiEndpoint, Tournament, TournamentPlayer } from '../types';
import { getCurrentMatch, getCurrentTournament, hydrateMatch, hydrateTournament, setCurrentMatch, setCurrentTournament } from '../utils/tournamentState';
import { initTournamentWebSocket, TournamentWebSocketManager } from '../utils/tournamentWebSocket';
import { baby3D } from '../game/game3D';
import { render2PlayerGame } from './2PlayerGame';
import { setCurrentRoom } from '../utils/roomState';

let activeMatch: PongGame | undefined = undefined;
let isGameActive = false;
let tWS: TournamentWebSocketManager | null = null;
let lastRenderedCurrentMatchId: number | null = null;
let readyDelegationBound = false;

function matchBracketHTML(t: any): string {
    const matches = Array.isArray(t.allMatches) ? t.allMatches : [];
    const byRound = new Map<number, TournamentMatch[]>();
    
    for (const m of matches) {
        const r = m.round || 1;
        if (!byRound.has(r)) byRound.set(r, []);
        byRound.get(r)!.push(m);
    }
    const activeRound = t.round ?? t.curM?.round;
    const rounds = Array.from(byRound.keys())
        .filter(r => activeRound === undefined || r <= activeRound)
        .sort((a, b) => a - b);

    const roundHtml = rounds.map(r => {
        const ms = (byRound.get(r) || []).sort((a, b) => (a.roundIdx || 0) - (b.roundIdx || 0));
        
        const cards = ms.map((m: any) => {
            const p1 = m.p1?.name || '—';
            const p2 = m.p2?.name || '—';
            const status = MSmap.get(m.status) || '—';
            const isCurrent = t.curM && t.curM.id === m.id;
            
            return `<div class="t-match-card ${m.status} ${isCurrent ? 'current' : ''}">
                <div class="t-match-number">R${r}#${(m.roundIdx ?? 0) + 1}</div>
                <div class="t-match-players">
                    <div class="t-match-player ${m.winnerId === m.p1?.id ? 'winner' : ''}">${p1}</div>
                    <div class="t-match-vs">VS</div>
                    <div class="t-match-player ${m.winnerId === m.p2?.id ? 'winner' : ''}">${p2}</div>
                </div>
                <div class="t-match-status">${status}</div>
            </div>`;
        }).join('');
        
        return `<div class="t-bracket-round"><h4>Round ${r}</h4><div class="t-bracket-grid">${cards}</div></div>`;
    }).join('');
    
    return `<div class="t-bracket">${roundHtml}</div>`;
}

async function waitForNextMatch(tournamentId: number, attempts = 8, delayMs = 500): Promise<boolean> {
    for (let i = 0; i < attempts; i++) {
        try {
            await loadCurrentMatch();
            const t = getCurrentTournament();
            if (!t) return false;
            if (t.curM) return true;
        } catch {}
        await new Promise(res => setTimeout(res, delayMs));
    }
    return false;
}

function statusComplete(content: HTMLElement): void {
    const t = getCurrentTournament();
    if (!t || !t.id) return;
    const champPlayer = t.championId ? findPlayer(t.championId) : undefined;
    const champ = champPlayer?.name || '—';

    content.innerHTML = `
        <p class="t-info-text"><strong>Tournament #${t.id || '?'}</strong></p>
        <h3 class="t-info-text">Tournament Complete</h3>
        <p class="t-info-text">Champion: <strong>${champ}</strong></p>
        <div class="t-footer">
            <span class="t-footer-spacer">
                <button id="archiveBtn" class="btn btn-archive t-flex-1">History</button>
                <button id="resetBtn" class="btn btn-submit t-flex-1">New Tournament</button>
                <button id="backBtn" class="btn btn-t-back t-flex-1">Back</button>
            </span>
        </div>
    `;
    
    document.getElementById('archiveBtn')?.addEventListener('click', () => openTournamentArchive());

    document.getElementById('resetBtn')?.addEventListener('click', async () => {
        await resetTournament();
        let t = getCurrentTournament();
        if (!t || !t.id) {
            console.debug('[Tournament] No tournament found after reset, creating new one');
            return;
        }
        await renderTournamentContent(t);
    });
    
    document.getElementById('backBtn')?.addEventListener('click', () => {
        history.pushState({ page: 'gameSelect' }, '', '/gameSelect');
        setCurrentPage('gameSelect');
        renderApp();
    });
}

export async function renderTournamentContent(t: Tournament): Promise<void> {
    const content = document.getElementById('tournamentContent');
    if (!content) {
        console.error('[Tournament] No tournament content element found');
        return;
    }
    if (!t) return;
    if (t.status === 'setup') {
        renderSetup(content);
        return;
    }
    if (t.status === 'completed') {
        statusComplete(content);
        return;
    }
    if (!t.curM) {
        content.innerHTML = '<p>Loading match data...</p>';
        try {
            t.curM = await loadCurrentMatch();
            if (!t.curM && t.status === 'active') {
                if (!(await waitForNextMatch(t.id!))) {
                    content.innerHTML = '<p>No current match available</p>';
                    return;
                }
            }
        } catch (e) {
            console.error('[Tournament] Error loading match:', e);
        }
    }
    if (!t || !t.curM) {
        content.innerHTML = '<p>No current match available</p>';
        return;
    }

    let resp = await fetch(`${getApiEndpoint()}/api/tournament/${t.id}/player`, {
        headers: { 'Authorization': `Bearer ${authService.getToken()}` }
    });
    if (!resp.ok) {
        console.error('[Tournament] Failed to fetch tournament players:', resp.status);
        return;
    }
    const data = await resp.json();
    if (!data || !data.data || !Array.isArray(data.data) || data.data.length === 0) {
        console.error('[Tournament] Invalid player data received:', data);
        return;
    }
    t.players = data.data as TournamentPlayer[];
    if (!t.players || t.players.length === 0) {
        console.debug('[Tournament] No players found in tournament after fetch');
        content.innerHTML = '<p>No players found in tournament</p>';
        return;
    }
    if (!t.curM || !t.curM.p1 || !t.curM.p2 || !t.curM.p1.id || !t.curM.p2.id) {
        console.debug('[Tournament] Current match players not fully assigned yet');
        content.innerHTML = '<p>Waiting for players to be assigned...</p>';
        return;
    }
    // const p1 = t.players.find(p => p.id === t.curM!.p1!.id);
    // t.curM.p1 = p1;
    // const p2 = t.players.find(p => p.id === t.curM!.p2!.id);
    // t.curM.p2 = p2;
    console.debug('[Tournament] Current Match Players:', t.curM.p1, t.curM.p2);
    const curLabel = `${t.curM.p1.name || '—'} vs ${t.curM.p2.name || '—'}`;
    content.innerHTML = `
        <p class="t-info-text"><strong>Tournament #${t.id || '?'}</strong></p>
        <p class="t-info-text"><strong>Status:</strong> <span id="tStatusText">${t.status}</span></p>
        <p class="t-info-text"><strong>Current Match:</strong> ${curLabel}</p>
        
        <div id="currentMatchBox" class="t-match-controls"></div>
        
        <div id="tournamentGameContainer" class="t-game-container" style="display: none;">
            <div id="pureGameContainer">
                <h3 class="t-game-title">Live Match</h3>
                <div class="game-status">
                    <div>Status: <span id="gameStatus" class="status-text">Initializing...</span></div>
                </div>
                <div class="player-info">
                    <div class="player-names">
                        <span id="player1Name" class="player1-name">${t.curM.p1.name || 'Player 1'}</span>
                        <span class="vs-text">vs</span>
                        <span id="player2Name" class="player2-name">${t.curM.p2.name || 'Player 2'}</span>
                    </div>
                    <div class="score-container">
                        <span id="player1score" class="player1-score">0</span>
                        <span class="score-separator">-</span>
                        <span id="player2score" class="player2-score">0</span>
                    </div>
                </div>
                <div class="threeD-wrapper">
                    <canvas id="renderCanvas"></canvas>
                </div>
            </div>
            <div class="t-game-controls">
                <button id="toggleGameBtn" class="btn btn-gameview">Hide Game</button>
            </div>
        </div>
        
        <details open class="t-section-details" id="bracketSection">
            <summary><strong>Bracket View</strong></summary>
            ${matchBracketHTML(t)}
        </details>
        
        <div class="t-footer">
            <span class="t-footer-spacer">
                <button id="archiveBtn" class="btn btn-archive t-flex-1">History</button>
                <button id="resetBtn" class="btn btn-reset t-flex-1">Reset</button>
                <button id="backBtn" class="btn btn-t-back t-flex-1">Back</button>
            </span>
        </div>
    `;

    document.getElementById('toggleGameBtn')?.addEventListener('click', () => {
        const pure = document.getElementById('pureGameContainer');
        const btn = document.getElementById('toggleGameBtn') as HTMLButtonElement;
        if (!pure || !btn) return;
        if (!isGameActive) {
            console.log('[Tournament] No active game to show/hide');
            return;
        }
        const isVisible = pure.style.display !== 'none';
        pure.style.display = isVisible ? 'none' : 'block';
        btn.textContent = isVisible ? 'Show Game' : 'Hide Game';
    });

    document.getElementById('backBtn')?.addEventListener('click', async () => {
        if (confirm('Leave tournament page? Any active games will be ended.')) {
            cleanupActiveGame();
            await resetTournament();
            history.pushState({ page: 'gameSelect' }, '', '/gameSelect');
            setCurrentPage('gameSelect');
            renderApp();
        }
    });

    document.getElementById('resetBtn')?.addEventListener('click', async () => {
        if (confirm('Reset tournament?')) {
            cleanupActiveGame();
            await resetTournament();
            const content = document.getElementById('tournamentContent');
            if (content) await renderSetup(content);
        }
    });

    document.getElementById('archiveBtn')?.addEventListener('click', () => {
		openTournamentArchive();
	});

    const box = document.getElementById('currentMatchBox')!;
    if (t.id && t.curM.status === 'completed') {
        box.innerHTML = '<p>Match completed. Loading next match...</p>';
        if (await waitForNextMatch(t.id))
            await renderTournamentContent(t);
        return;
    }
    if (t.curM.status === 'active') {
        box.innerHTML = '<p>Match in progress...</p>';
        await showMatch(t.curM);
        return;
    }
    // t.curM = await loadCurrentMatch();
    // if (!t.curM) {
    //     box.innerHTML = '<p>No current match available</p>';
    //     return;
    // }
    if (!t.curM.p1 || !t.curM.p1.id || !t.curM.p2 || !t.curM.p2.id) {
        box.innerHTML = '<p>Waiting for players to be assigned...</p>';
        return;
    }
    // setCurrentTournament(t);
    // t = setEffectiveTournament(t.id!);
    console.debug('[Tournament] Rendering match controls for match:', t.curM);
    // setCurrentMatch(t.curM);
    renderMatchControls(box, t);
    
    if (!tWS)
        initTWS(t);
}

function renderMatchControls(box: HTMLElement, t: Tournament): void {
    if (!t || !t.curM || !t.curM.p1 || !t.curM.p2 || !t.curM.p1.id || !t.curM.p2.id)
        return console.debug('No current match or players to render controls for');

    box.innerHTML = `
        <p class="t-info-bold">Next Match:</p>
        <div class="t-flex" style="gap:.5rem;">
            <div class="t-flex-1" style="color:#fff;font-weight:bold;">${t.curM.p1?.name || '—'}</div>
            <div class="t-flex-1" style="color:#fff;font-weight:bold;">${t.curM.p2?.name || '—'}</div>
        </div>
        <div style="margin-top:.5rem;">
            <div style="font-size:.9em;color:#fff;opacity:.9;">Match ID: <code>${t.curM.id}</code></div>
        </div>
        <div class="t-flex">
            <button id="p1ReadyBtn" class="t-flex-1 btn btn-ready" data="">...ready?</button>
            <button id="p2ReadyBtn" class="t-flex-1 btn btn-ready">...ready?</button>
        </div>
        <div class="t-flex" style="gap:.5rem;margin-top:.5rem;">
            <button id="readyAndStartBtn" class="btn btn-start t-flex-1">Start when both ready</button>
        </div>
    `;

    document.getElementById('p1ReadyBtn')?.addEventListener('click', async (ev) => {
        if (!t || !t.curM || !t.curM.p1 || !t.curM.p1.id) return console.debug('[Tournament] No Player 1 in current match');
        const target = ev.target as HTMLButtonElement;
        // const pidStr = target.getAttribute('data-player');
        // const pid = pidStr ? Number(pidStr) : NaN;
        // console.log('[Tournament] Ready button click detected for Player 1 id=', pid);
        // if (!isNaN(pid)) {
        await togglePlayerReady(t, t.curM.p1.id, target);
        // } else {
            // console.warn('Missing playerId on ready button');
        // }
    });

    document.getElementById('p2ReadyBtn')?.addEventListener('click', async (ev) => {
        if (!t || !t.curM || !t.curM.p2 || !t.curM.p2.id) return console.debug('No Player 2 assigned yet');
        const target = ev.target as HTMLButtonElement;
        // const pidStr = target.getAttribute('data-player');
        // const pid = pidStr ? Number(pidStr) : NaN;
        // console.log('[Tournament] Ready button click detected for Player 2 id=', pid);
        // if (!isNaN(pid)) {
        await togglePlayerReady(t, t.curM.p2.id, target);
        // } else {
            // console.warn('Missing playerId on ready button');
        // }
    });

    document.getElementById('readyAndStartBtn')?.addEventListener('click', async (ev) => {
        const target = ev.target as HTMLButtonElement;
        if (!t || !t.curM) return console.debug('[Tournament] No current match to start');
        try {
            const resp = await fetch(`${getApiEndpoint()}/api/tournament/${t.id}/match/${t.curM.id}/start`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authService.getToken()}`
                }
            });
            const data = await resp.json();
            if (!resp.ok) {
                alert(data?.message || `Failed to start (HTTP ${resp.status})`);
                return;
            }
            t.curM = data.match as TournamentMatch;
            if (!t.curM) {
                console.error('[Tournament] No data returned after starting match');
                return;
            }
            console.log('[Tournament] Match start initiated');
            // await showMatch(m);
            updateReadyUI(t, target);
            if (tWS?.isConnected()) tWS.requestState();//requestMatchState();
        } catch (e) {
            console.error('[Tournament] Failed to start match:', e);
        }
    });
}

function updateReadyUI(t: Tournament, target: HTMLButtonElement, pId?: number): void {
    if (!t || !t.curM || !t.curM.p1 || !t.curM.p2) return;
    if (!pId) {
        if (t.curM.p1 && t.curM.p2 && target) {
            const bothReady = (t.curM.p1.tpt === 'ai' || !!t.curM.p1.isReady) && (t.curM.p2.tpt === 'ai' || !!t.curM.p2.isReady);
            if (bothReady) target.disabled = false;
            else target.disabled = true;
            return;
        }
    } else if (target && (t.curM.p1.id === pId || t.curM.p2.id === pId)) {
        let p = t.curM.p1.id === pId ? t.curM.p1 : t.curM.p2;
        if (!p) return;
        if (p.tpt === 'ai') {
            // target.ariaPressed = 'true';
            target.classList.add('.clicked');
            target.textContent = 'Ready ✓';
        } else {
            if (p.isReady) {
                // target.ariaPressed = 'true';
                target.classList.add('.clicked');
                target.textContent = 'Ready ✓';
            } else {
                // target.ariaPressed = 'false';
                target.classList.remove('.clicked');
                target.textContent = '...ready?';
            }
        }
    }
    if ((t.curM.p1.tpt === 'ai' || !!t.curM.p1.isReady) && (t.curM.p2.tpt === 'ai' || !!t.curM.p2.isReady)) {
        let startBtn = document.getElementById('readyAndStartBtn') as HTMLButtonElement | null;
        if (startBtn) startBtn.disabled = false;
    }
}

async function togglePlayerReady(t: Tournament, playerId: number, button: HTMLButtonElement | null): Promise<void> {
    if (!button) return;
    if (!t || !t.curM) return;
    console.debug('[Tournament] togglePlayerReady for', playerId);
    try {
        const resp = await fetch(`${getApiEndpoint()}/api/tournament/${t.id}/match/${t.curM.id}/player/${playerId}/ready`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authService.getToken()}`
            },
            body: JSON.stringify({})
        });
        if (!resp.ok) {
            console.error('[Tournament] togglePlayerReady failed:', resp.status);
            return;
        }
        const data = await resp.json();
        t.curM = data.data as TournamentMatch;
        if (!t.curM || !t.curM.p1 || !t.curM.p2) {
            console.error('[Tournament] togglePlayerReady received invalid match data:', t.curM);
            return;
        }
        updateReadyUI(t, button, playerId);
        console.debug('ReadyStatus p1: ', t.curM.p1.isReady, 'p2:', t.curM.p2.isReady);
        if (tWS?.isConnected()) {
            tWS.requestMatchState();
        } else {
            console.warn('WS not connected; skipped requestMatchState');
        }
    } catch (e) {
        console.error('[Tournament] togglePlayerReady error:', e);
    }
}

function initTWS(t: Tournament): void {
    if (tWS) return;
    if (!t || !t.id) return;
    const user = authService.getCurrentUser();
    if (!user) return;

    const hostPlayer = t.players.find(p => p.tpt === 'host' || p.user?.id === user.id);
    const wsPlayerId = hostPlayer?.id != null ? String(hostPlayer.id) : String(user.id);

    console.log('Initializing tournament WebSocket with tournament playerId:', wsPlayerId);

    tWS = initTournamentWebSocket({
        tournamentId: t.id.toString(),
        matchId: t.curM?.id?.toString() || '',
        playerId: wsPlayerId,
        onConnect: () => {
            console.log('Tournament WebSocket connected');
            tWS?.requestState();
        },
        onTournamentState: (incoming) => {
            hydrateTournament(incoming);
            // const tt = getCurrentTournament();
            // if (!tt || !tt.id) return;
            const st = document.getElementById('tStatusText');
            if (st) st.textContent = t.status;
            const br = document.getElementById('bracketSection');
            if (br) br.innerHTML = `<summary><strong>Bracket View</strong></summary>${matchBracketHTML(t)}`;
            const cmId = t.curM?.id;
            if (cmId != null && cmId !== lastRenderedCurrentMatchId) {
                lastRenderedCurrentMatchId = cmId;
                renderTournamentContent(t);
            }
        },
        onMatchState: (match) => {
            if (match) {
                 const st = document.getElementById('tStatusText');
                if (st) st.textContent = t.status;
                const br = document.getElementById('bracketSection');
                if (br) br.innerHTML = `<summary><strong>Bracket View</strong></summary>${matchBracketHTML(t)}`;
                const cmId = t.curM?.id;
                if (cmId != null && cmId !== lastRenderedCurrentMatchId) {
                    lastRenderedCurrentMatchId = cmId;
                    renderTournamentContent(t);
                }
                // setCurrentMatch(match);
                // updateReadyUI(match, match.p1);
                // updateReadyUI(match, match.p2);
            }
        },
        onGameStart: async (matchId, gameId) => {
            console.log(`Game started: matchId=${matchId}, gameId=${gameId}`);
            if (!t || !t.curM) return;
            t.curM.gameId = gameId;
            t.curM.status = 'active';
            await showMatch(t.curM);
        },
        onGameEnd: async (data) => {
            console.log('Game ended:', data);
            if (!t || !data.matchId) return;
            cleanupActiveGame();
            const gameContainer = document.getElementById('tournamentGameContainer');
            if (gameContainer) gameContainer.style.display = 'none';
            if (data.winnerId)
                await postTournamentMatchWinner(t.id!, Number(data.matchId), Number(data.winnerId));
        },
        onMatchEnd: async (data) => {
            console.log('Match ended:', data);
            if (!t || !t.id) return;
            t.curM = t.allMatches.find(m => m.id === Number(data.matchId)) || null;
            if (t.curM) {
                t.curM.winnerId = Number(data.winnerId) || null;
                t.curM.status = 'completed';
            }
            if (!t.id) return;
            const found = await waitForNextMatch(t.id);
            if (found)
                await renderTournamentContent(t);
        },
        onTournamentEnd: (tournamentId) => {
            console.log('Tournament ended:', tournamentId);
            if (!t || t.id !== Number(tournamentId)) return;
            if (t.championId)
                showTournamentEndScreen(t.championId);
        },
        onError: (err) => {
            console.error('[Tournament] WebSocket error:', err);
        }
    });
    tWS.connect().catch(err => console.error('[Tournament] Failed to connect WebSocket:', err));
}

async function showMatch(match: TournamentMatch): Promise<void> {
    console.log('[Tournament] Showing match:', match.id);
    if (!match) return;
    setCurrentRoom(match.room);
    render2PlayerGame();
    const gameContainer = document.getElementById('tournamentGameContainer');
    if (gameContainer) gameContainer.style.display = 'block';
    isGameActive = true;
}

function cleanupActiveGame(): void {
    if (activeMatch) {
        cleanupGame(activeMatch);
        activeMatch = undefined;
    }
    isGameActive = false;
}

export async function renderTournamentPage(): Promise<void> {
    const root = document.getElementById('app-root');
    if (!root) return;
    root.innerHTML = `
        <div class="t-section">
            <h2>Tournament Mode</h2>
            <div id="tournamentContent" class="t-content">Loading...</div>
        </div>
    `;
    let t = getCurrentTournament();
    if (!t) {
        t = await createTournament();
        if (t && t.id)
            await setEffectiveTournament(t.id);
        else {
            console.error('[Tournament] Failed to create or retrieve tournament');
            return;
        }
    }
    if (t)
    await renderTournamentContent(t);
}

export function cleanupTournamentPage(): void {
    cleanupActiveGame();
    if (tWS) {
        try {
            tWS.disconnect();
        } catch {}
        tWS = null;
    }
}
import { setCurrentPage } from '../utils/globalState';
import { renderApp } from '../main';
import { PongGame } from '../game/PongGame';
import { authService } from '../utils/auth';
import { cleanupGame } from '../utils/gameUtils';
import { openTournamentArchive } from '../utils/tournamentArchive';
import {
    getTournament,
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
import { getCurrentTournament, hydrateMatch, hydrateTournament, setCurrentMatch, setCurrentTournament } from '../utils/tournamentState';
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
            const t = getTournament();
            if (!t) return false;
            if (t.curM) return true;
        } catch {}
        await new Promise(res => setTimeout(res, delayMs));
    }
    return false;
}

function statusComplete(content: HTMLElement): void {
    const t = getTournament();
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
        let t = getTournament();
        if (!t || !t.id) {
            console.debug('[Tournament] No tournament found after reset, creating new one');
            return;
        }
        await renderTournamentContent(t.id);
    });
    
    document.getElementById('backBtn')?.addEventListener('click', () => {
        history.pushState({ page: 'gameSelect' }, '', '/gameSelect');
        setCurrentPage('gameSelect');
        renderApp();
    });
}

export async function renderTournamentContent(tId: number): Promise<void> {
    const content = document.getElementById('tournamentContent');
    if (!content) {
        console.error('[Tournament] No tournament content element found');
        return;
    }
    let t = getTournament();
    if (!t) {
        t = await setEffectiveTournament(tId);
        if (!t || !t.id) {
            console.error('[Tournament] No tournament available');
            return;
        }
    }
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
                if (await waitForNextMatch(t.id!)) {
                    t = getTournament();
                    if (t) t.curM = await loadCurrentMatch();
                }
            }
        } catch (e) {
            console.error('[Tournament] Error loading match:', e);
        }
    }
    setCurrentTournament(t);
    if (!t || !t.curM) {
        content.innerHTML = '<p>No current match available</p>';
        return;
    }
    console.debug('HERE [Tournament] Current Match:', t.curM);

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
    if (t.curM === null || !t.curM.p1 || !t.curM.p2 || !t.curM.p1.id || !t.curM.p2.id) {
        console.debug('[Tournament] Current match players not fully assigned yet');
        content.innerHTML = '<p>Waiting for players to be assigned...</p>';
        return;
    }
    const p1 = t.players.find(p => p.id === t.curM!.p1!.id);
    t.curM.p1 = p1;
    const p2 = t.players.find(p => p.id === t.curM!.p2!.id);
    t.curM.p2 = p2;
    console.debug('[Tournament] Current Match Players:', t.curM.p1, t.curM.p2);
    setCurrentMatch(t.curM);
    setCurrentTournament(t);
    const curLabel = `${p1?.name || '—'} vs ${p2?.name || '—'}`;
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
                        <span id="player1Name" class="player1-name">${p1?.name || 'Player 1'}</span>
                        <span class="vs-text">vs</span>
                        <span id="player2Name" class="player2-name">${p2?.name || 'Player 2'}</span>
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
            await renderTournamentContent(t.id);
        return;
    }
    if (t.curM.status === 'active') {
        box.innerHTML = '<p>Match in progress...</p>';
        await showMatch(t.curM);
        return;
    }
    t.curM = await loadCurrentMatch();
    if (!t.curM) {
        box.innerHTML = '<p>No current match available</p>';
        return;
    }
    if (!t.curM.p1 || !t.curM.p1.id || !t.curM.p2 || !t.curM.p2.id) {
        box.innerHTML = '<p>Waiting for players to be assigned...</p>';
        return;
    }
    setCurrentTournament(t);
    setCurrentMatch(t.curM);
    renderMatchControls(box);
    
    if (!tWS)
        initTWS();
}

function renderMatchControls(box: HTMLElement): void {
    const t = getTournament();
    if (!t || !t.curM || !t.curM.p1 || !t.curM.p2 || !t.curM.p1.id || !t.curM.p2.id) return;

    box.innerHTML = `
        <p class="t-info-bold">Next Match:</p>
        <div class="t-flex" style="gap:.5rem;">
            <div class="t-flex-1" style="color:#fff;font-weight:bold;">${t.curM.p1?.name || '—'}</div>
            <div class="t-flex-1" style="color:#fff;font-weight:bold;">${t.curM.p2?.name || '—'}</div>
        </div>
        <div style="margin-top:.5rem;">
            <div style="font-size:.9em;color:#fff;opacity:.9;">Match ID: <code>${t.curM.id}</code></div>
        </div>
        <div class="t-flex" style="gap:.5rem;margin-top:.5rem;">
            <button id="p1ReadyBtn" class="btn btn-ready t-flex-1" data-player="${t.curM.p1?.id}">...ready?</button>
            <button id="p2ReadyBtn" class="btn btn-ready t-flex-1" data-player="${t.curM.p2?.id}">...ready?</button>
        </div>
        <div class="t-flex" style="gap:.5rem;margin-top:.5rem;">
            <button id="readyAndStartBtn" class="btn btn-start t-flex-1" disabled>Start when both ready</button>
        </div>
    `;

    document.getElementById('p1ReadyBtn')?.addEventListener('click', async (ev) => {
        const target = ev.target as HTMLButtonElement;
        const pidStr = target.getAttribute('data-player');
        const pid = pidStr ? Number(pidStr) : NaN;
        console.log('[Tournament] Ready button click detected for Player 1 id=', pid);
        if (!isNaN(pid)) {
            togglePlayerReady(t, t.curM!, pid, target);
        } else {
            console.warn('Missing playerId on ready button');
        }
    });

    document.getElementById('p2ReadyBtn')?.addEventListener('click', async (ev) => {
        const target = ev.target as HTMLButtonElement;
        const pidStr = target.getAttribute('data-player');
        const pid = pidStr ? Number(pidStr) : NaN;
        console.log('[Tournament] Ready button click detected for Player 2 id=', pid);
        if (!isNaN(pid)) {
            togglePlayerReady(t, t.curM!, pid, target);
        } else {
            console.warn('Missing playerId on ready button');
        }
    });

    document.getElementById('readyAndStartBtn')?.addEventListener('click', async () => {
        let t = getTournament();
        if (!t || !t.curM?.id) return;
        updateReadyUI(t.curM);
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
            let m = data.match as TournamentMatch;
            if (!m) {
                console.error('[Tournament] No data returned after starting match');
                return;
            }
            setCurrentMatch(m);
            console.log('[Tournament] Match start initiated');
            // await showMatch(m);
            updateReadyUI(m);
            if (tWS?.isConnected()) tWS.requestState();//requestMatchState();
        } catch (e) {
            console.error('[Tournament] Failed to start match:', e);
        }
    });
}

function updateReadyUI(match: TournamentMatch, target?: HTMLButtonElement, pId?: number): void {
    if (!match || !match.p1 || !match.p2) return;
    let startBtn = document.getElementById('readyAndStartBtn') as HTMLButtonElement | null;
    if (!startBtn) return;
    if (!pId && !target) {
        if (match.p1 && match.p2 && startBtn.id === 'readyAndStartBtn') {
            const bothReady = (match.p1.tpt === 'ai' || !!match.p1.isReady) && (match.p2.tpt === 'ai' || !!match.p2.isReady);
            startBtn.disabled = !bothReady;
            return;
        }
    } else if (target && (match.p1.id === pId || match.p2.id === pId)) {
        if (match.p1.id === pId && target.id === 'p1ReadyBtn') {
            if (match.p1.tpt === 'ai') {
                target.disabled = true;
                target.textContent = 'Ready ✓';
            } else
                target.textContent = match.p1.isReady ? 'Ready ✓' : '...ready?';
        }
        else if (match.p2.id === pId && target.id === 'p2ReadyBtn') {
            if (match.p2.tpt === 'ai') {
                target.disabled = true;
                target.textContent = 'Ready ✓';
            } else
                target.textContent = match.p2.isReady ? 'Ready ✓' : '...ready?';
        }
    }
    if ((match.p1.tpt === 'ai' || !!match.p1.isReady) && (match.p2.tpt === 'ai' || !!match.p2.isReady)) {
        startBtn.disabled = false;
    }
}

async function togglePlayerReady(t: Tournament, m: TournamentMatch, playerId: number, button: HTMLButtonElement | null): Promise<void> {
    if (!button) return;
    console.log('[Tournament] togglePlayerReady invoked for', playerId);
	let p = t.players.find(pl => pl.id === playerId);
    if (!p) {
        console.error('[Tournament] Player not found in tournament:', playerId, 'all Players in match:', m.p1, m.p2);
        return;
    }
    p.isReady = p.isReady ? false : true;
    if (!m.p1 || !m.p2 ||( m.p1.id !== playerId && m.p2.id !== playerId)) {
        console.error('[Tournament] togglePlayerReady front: Player not found in match:', playerId);
        return;
    }
    try {
        const resp = await fetch(`${getApiEndpoint()}/api/tournament/${t.id}/match/${m.id}/player/${playerId}/ready`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authService.getToken()}`
            },
            body: JSON.stringify({ isReady: p.isReady? 'true' : 'false' })
        });
        if (!resp.ok) {
            console.error('[Tournament] togglePlayerReady failed:', resp.status);
            return;
        }
        const data = await resp.json();
        m = data.data as TournamentMatch;
        if (!m || !m.p1 || !m.p2) {
            console.error('[Tournament] togglePlayerReady received invalid match data:', m);
            return;
        }
        updateReadyUI(m, button, playerId);
        hydrateMatch(m);
        console.debug('ReadyStatus p1: ', m.p1.isReady, 'p2:', m.p2.isReady);
        if (tWS?.isConnected()) {
            tWS.requestMatchState();
        } else {
            console.warn('WS not connected; skipped requestMatchState');
        }
    } catch (e) {
        console.error('[Tournament] togglePlayerReady error:', e);
    }
}

function initTWS(): void {
    if (tWS) return;
    const t = getTournament();
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
            const tt = getTournament();
            if (!tt || !tt.id) return;
            const st = document.getElementById('tStatusText');
            if (st) st.textContent = tt.status;
            const br = document.getElementById('bracketSection');
            if (br) br.innerHTML = `<summary><strong>Bracket View</strong></summary>${matchBracketHTML(tt)}`;
            const cmId = tt.curM?.id;
            if (cmId != null && cmId !== lastRenderedCurrentMatchId) {
                lastRenderedCurrentMatchId = cmId;
                renderTournamentContent(tt.id);
            }
        },
        onMatchState: (match) => {
            if (match) {
                setCurrentMatch(match);
                updateReadyUI(match, match.p1);
                updateReadyUI(match, match.p2);
            }
        },
        onGameStart: async (matchId, gameId) => {
            console.log(`Game started: matchId=${matchId}, gameId=${gameId}`);
            const tt = getTournament();
            if (!tt || !tt.curM) return;
            tt.curM.gameId = gameId;
            tt.curM.status = 'active';
            setCurrentMatch(tt.curM);
            await showMatch(tt.curM);
        },
        onGameEnd: async (data) => {
            console.log('Game ended:', data);
            const tt = getTournament();
            if (!tt || !data.matchId) return;
            cleanupActiveGame();
            const gameContainer = document.getElementById('tournamentGameContainer');
            if (gameContainer) gameContainer.style.display = 'none';
            if (data.winnerId)
                await postTournamentMatchWinner(tt.id!, Number(data.matchId), Number(data.winnerId));
        },
        onMatchEnd: async (data) => {
            console.log('Match ended:', data);
            const tt = getTournament();
            if (!tt || !tt.id) return;
            const target = tt.allMatches.find(m => m.id === Number(data.matchId));
            if (target) {
                target.winnerId = Number(data.winnerId) || null;
                target.status = 'completed';
            }
            setCurrentTournament(tt);
            if (!tt.id) return;
            const found = await waitForNextMatch(tt.id);
            if (found)
                await renderTournamentContent(tt.id);
        },
        onTournamentEnd: (tournamentId) => {
            console.log('Tournament ended:', tournamentId);
            const tt = getTournament();
            if (!tt || tt.id !== Number(tournamentId)) return;
            if (tt.championId)
                showTournamentEndScreen(tt.championId);
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
    let t = getTournament();
    if (!t) {
        t = await createTournament();
        if (t && t.id)
            await setEffectiveTournament(t.id);
        else {
            console.error('[Tournament] Failed to create or retrieve tournament');
            return;
        }
    }
    if (t && t.id)
    await renderTournamentContent(t.id);
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
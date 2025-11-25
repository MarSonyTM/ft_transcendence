import { setCurrentPage } from '../utils/globalState';
import { renderApp } from '../main';
import { PongGame } from '../game/PongGame';
import { authService } from '../utils/auth';
import { cleanupGame } from '../utils/gameUtils';
import { openTournamentArchive } from '../utils/tournamentArchive';
import {
    unwrapPayload,
    normalizeMatch,
    normalizePlayer,
    normalizeTournament,
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
import { getCurrentMatch, getCurrentTournament, setCurrentMatch, setCurrentTournament, updateMatchInTournament } from '../utils/tournamentState';
import { initTournamentWebSocket, TournamentWebSocketManager } from '../utils/tournamentWebSocket';
import { render2PlayerGame } from './2PlayerGame';
import { getCurrentRoom, setCurrentRoom } from '../utils/roomState';

let activeMatch: PongGame | undefined = undefined;
let isGameActive = false;
let tWS: TournamentWebSocketManager | null = null;
let lastRenderedCurrentMatchId: number | null = null;

function matchBracketHTML(t: Tournament): string {
    const sortedByRound = new Map<number, TournamentMatch[]>();
    let round: TournamentMatch[] = [];
    for (let i = 1; round = t.allMatches.filter(m => m.round === i).slice(); i++) {
        if (round.length > 0) break;
        sortedByRound.set(i, round);
    }
    const curRound = t.curM?.round || t.round || 1;
    const rounds = new Map<number, TournamentMatch[]>();
    for (let [r, matches] of sortedByRound.entries()) {
        if (r >= curRound)
            rounds.set(r, matches);
    }

    let roundHtml = '';
    for (let r of rounds.keys()) {
        let matches = rounds.get(r);
        if (!matches) break;
        const cards = matches.map(m => {
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
        roundHtml += `<div class="t-bracket-round"><h4>Round ${r}</h4><div class="t-bracket-grid">${cards}</div></div>`;
    }
    return `<div class="t-bracket">${roundHtml}</div>`; 
}

async function waitForNextMatch(tournamentId: number, attempts = 8, delayMs = 500): Promise<boolean> {
    let t = getCurrentTournament();
    if (!t) return false;
    for (let i = 0; i < attempts; i++) {
        try {
            t.curM = await loadCurrentMatch();
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
        await renderSetup(content);
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

    const resp = await fetch(`${getApiEndpoint()}/api/tournament/${t.id}/player`, {
        headers: { 'Content-Type': 'application/json' }
    });

    if (!resp.ok) {
        console.error('[Tournament] Failed to fetch tournament players:', resp.status);
        return;
    }
    const data = await resp.json();
    if (!data || !data.data) {
        console.error('[Tournament] Invalid player data received:', data);
        return;
    }
    const raw = unwrapPayload<any>(data);
    if (!raw) return;
    t.players = raw.map(normalizePlayer);
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
    
    console.debug('[Tournament] Current Match Players:', t.curM.p1, t.curM.p2);
    const curLabel = `${t.curM.p1.name || '—'} vs ${t.curM.p2.name || '—'}`;
    content.innerHTML = `
        <p class="t-info-text"><strong>Tournament #${t.id || '?'}</strong></p>
        <p class="t-info-text"><strong>Status:</strong> <span id="tStatusText">${t.status}</span></p>
        <p class="t-info-text"><strong>Current Match:</strong> ${curLabel}</p>
        
        <div id="currentMatchBox" class="t-match-controls"></div>
        
        <div id="tournamentGameContainer" class="t-game-container" style="display: block;">
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
        const isVisible = pure.style.display !== 'block';//TODO
        pure.style.display = isVisible ? 'block' : 'block';
        btn.textContent = isVisible ? 'Show Game' : 'Hide Game';
    });

    document.getElementById('backBtn')?.addEventListener('click', async () => {
        if (confirm('Leave tournament page? Any active games will be ended.')) {
            cleanupActiveGame();
            await resetTournament();
            history.pushState({ page: 'gameSelect' }, '', '/gameSelect');
            setCurrentPage('gameSelect');
            await renderApp();
        }
    });

    document.getElementById('resetBtn')?.addEventListener('click', async () => {
        if (confirm('Reset tournament?')) {
            cleanupActiveGame();
            await resetTournament();
            const content = document.getElementById('tournamentContent');
            if (content)
                await renderSetup(content);
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
        await showMatch(t);
        // await renderTournamentContent(t);
        return;
    }
    if (!t.curM.p1 || !t.curM.p1.id || !t.curM.p2 || !t.curM.p2.id) {
        box.innerHTML = '<p>Waiting for players to be assigned...</p>';
        return;
    }
    renderMatchControls(box, t);
    
    if (!tWS)
        initTWS(t);
}

function renderMatchControls(box: HTMLElement, t: Tournament): void {
    if (!t || !t.curM || !t.curM.p1 || !t.curM.p2 || !t.curM.p1.id || !t.curM.p2.id)
        return console.debug('No current match or players to render controls for');
    console.debug('[Tournament] Rendering match controls for match:', t.curM);


    box.innerHTML = `
        <p class="t-info-bold">Next Match:</p>
        <div class="t-flex" style="gap:.5rem;">
            <div class="t-flex-1" style="color:#fff;font-weight:bold;">${t.curM.p1.name || '—'}</div>
            <div class="t-flex-1" style="color:#fff;font-weight:bold;">${t.curM.p2.name || '—'}</div>
        </div>
        <div style="margin-top:.5rem;">
            <div style="font-size:.9em;color:#fff;opacity:.9;">Match ID: <code>${t.curM.id}</code></div>
        </div>
        <div class="t-flex">
            <button id="p1ReadyBtn" class="t-flex-1 btn btn-ready" data-player="${t.curM.p1.id}">...ready?</button>
            <button id="p2ReadyBtn" class="t-flex-1 btn btn-ready" data-player="${t.curM.p2.id}">...ready?</button>
        </div>
        <div class="t-flex" style="gap:.5rem;margin-top:.5rem;">
            <button id="readyAndStartBtn" class="btn btn-start t-flex-1">Start when both ready</button>
        </div>
    `;

    const p1Btn = document.getElementById('p1ReadyBtn') as HTMLButtonElement;
    if (!p1Btn) return console.error('Error: button p1');
    const p2Btn = document.getElementById('p2ReadyBtn') as HTMLButtonElement;
    if (!p2Btn) return console.error('Error: button p2');
    const startBtn = document.getElementById('readyAndStartBtn') as HTMLButtonElement;
    if (!startBtn) return console.error('Error: startBtn');
    updateReadyUI(t, {p1Btn, p2Btn, startBtn});
    

    p1Btn.addEventListener('click', async () => {//TODO
        const target = p1Btn;
        const pidStr = target.getAttribute('data-player');
        const pid = pidStr ? Number(pidStr) : NaN;
        updateReadyUI(t, {p1Btn: target});
        if (!isNaN(pid)) {
            togglePlayerReady(t, pid, target);
        } else {
            console.warn('Missing playerId on ready button');
        }
    });

    p2Btn.addEventListener('click', async () => {
        const target = p2Btn;
        const pidStr = target.getAttribute('data-player');
        const pid = pidStr ? Number(pidStr) : NaN;
        updateReadyUI(t, {p2Btn: target});
        if (!isNaN(pid)) {
            togglePlayerReady(t, pid, target);
        } else {
            console.warn('Missing playerId on ready button');
        }
    });

    startBtn.addEventListener('click', async () => {//TODO use onGameStart?
        if (!t || !t.curM) return console.debug('[Tournament] No current match to start');
        try {
            const resp = await fetch(`${getApiEndpoint()}/api/tournament/${t.id}/match/${t.curM.id}/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await resp.json();
            if (!resp.ok) {
                alert(data?.message || `Failed to start (HTTP ${resp.status})`);
                return;
            }
            const raw = unwrapPayload<any>(data);
            if (!raw) return null;
            t.curM = normalizeMatch(raw);
            setCurrentMatch(t.curM);          
            updateReadyUI(t, {startBtn});
            if (!tWS)
                await initTWS(t);
            if (tWS?.isConnected())
                tWS.requestMatchState();//tWS.requestState();//
            await showMatch(t);
            // await renderTournamentContent(t);
            console.log('[Tournament] Match start initiated');
        } catch (e) {
            console.error('[Tournament] Failed to start match:', e);
        }
    });
}

function updateReadyUI(t: Tournament, opts: { p1Btn?: HTMLButtonElement, p2Btn?: HTMLButtonElement, startBtn?: HTMLButtonElement }): void {
    if (!t || !t.curM || !t.curM.p1 || !t.curM.p2) return;
    const start = document.getElementById('readyAndStartBtn') as HTMLButtonElement;
    if (!start) return console.error('Error: startBtn');
    if (opts.p1Btn) {
        if (t.curM.p1.tpt === 'ai') {
            opts.p1Btn.setAttribute("aria-pressed", "true");
            opts.p1Btn.textContent = 'Ready ✓';
            opts.p1Btn.disabled = true;
        }
        else if (t.curM.p1.isReady) {
            opts.p1Btn.setAttribute("aria-pressed", "true");
            opts.p1Btn.textContent = 'Ready ✓';
        }
        else {
            opts.p1Btn.setAttribute("aria-pressed", "false");
            opts.p1Btn.textContent = '...ready?';
        }
    }
    if (opts.p2Btn) {
        if (t.curM.p2.tpt === 'ai') {
            opts.p2Btn.setAttribute("aria-pressed", "true");
            opts.p2Btn.textContent = 'Ready ✓';
            opts.p2Btn.disabled = true;
        }
        else if (t.curM.p2.isReady) {
            opts.p2Btn.setAttribute("aria-pressed", "true");
            opts.p2Btn.textContent = 'Ready ✓';
        }
        else {
            opts.p2Btn.setAttribute("aria-pressed", "false");
            opts.p2Btn.textContent = '...ready?';
        }
    }
    if (opts.startBtn) {
        const bothReady = (t.curM.p1.tpt === 'ai' || !!t.curM.p1.isReady) && (t.curM.p2.tpt === 'ai' || !!t.curM.p2.isReady);
        if (bothReady && t.curM.status !== 'active') {
            opts.startBtn.disabled = false;
            if (tWS) tWS.sendReady(true);
            t.curM.status = 'ready';
        }
        else opts.startBtn.disabled = true;
    }
    else if (start) {
        const bothReady = (t.curM.p1.tpt === 'ai' || !!t.curM.p1.isReady) && (t.curM.p2.tpt === 'ai' || !!t.curM.p2.isReady);
        if (bothReady && t.curM.status !== 'active') {
            start.disabled = false;
            if (tWS) tWS.sendReady(true);
            t.curM.status = 'ready';
        }
        else start.disabled = true;
    }
    updateMatchInTournament(t.curM);
}

async function togglePlayerReady(t: Tournament, playerId: number, button: HTMLButtonElement | null): Promise<void> {
    if (!button) return;
    if (!t || !t.curM) return;
    try {
        const resp = await fetch(`${getApiEndpoint()}/api/tournament/${t.id}/match/${t.curM.id}/player/${playerId}/ready`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        });
        if (!resp.ok) {
            console.error('[Tournament] togglePlayerReady failed:', resp.status);
            return;
        }
        const data = await resp.json();
        const raw = unwrapPayload<any>(data);
        if (!raw) return;
        t = normalizeTournament(raw);
        setCurrentTournament(t);
        if (!t || !t.id)
            return;
        t = await setEffectiveTournament(t.id);
        if (!t || !t.id || !t.curM || !t.curM.p1 || !t.curM.p2) return;
        if (t.curM.p1.id === playerId)
            updateReadyUI(t, {p1Btn: button});
        else if (t.curM.p2.id === playerId)
            updateReadyUI(t, {p2Btn: button});
        console.debug('READY_OR_NOT:', t.curM.p1, t.curM.p2);
        if (tWS?.isConnected()) {
            tWS.requestMatchState();
        } else {
            console.warn('WS not connected; skipped requestMatchState');
        }
    } catch (e) {
        console.error('[Tournament] togglePlayerReady error:', e);
    }
}

async function initTWS(t: Tournament): Promise<void> {
    if (tWS) return;
    if (!t || !t.id) return;
    const user = await authService.getCurrentUser();
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

        onTournamentState: (t) => {
            // hydrateTournament(incoming);
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
            }
        },

        onGameStart: async (matchId, gameId) => {
            console.log(`Game started: matchId=${matchId}, gameId=${gameId}`);
            if (!t || !t.curM) return;
            t.curM.gameId = gameId;
            t.curM.status = 'active';
            const gameContainer = document.getElementById('tournamentGameContainer');
            if (gameContainer) gameContainer.style.display = 'block';
            await showMatch(t);
            await renderTournamentContent(t);
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

async function showMatch(t: Tournament): Promise<void> {
    if (!t || !t.curM) return console.error('No tournament or current Match found');
    if (!t.curM.room) return console.error('No current room found');
    const gameContainer = document.getElementById('tournamentGameContainer');
    if (gameContainer)
        gameContainer.style.display = 'block';
    console.log('[Tournament] Showing match:', t.curM.id);
    setCurrentRoom(t.curM.room);
    await render2PlayerGame();
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
        // setCurrentTournament(t);
        if (!t) {
            console.error('[Tournament] Failed to create or retrieve tournament');
            return;
        }
        if (t && t.id)
            t = await setEffectiveTournament(t.id);
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
// Implemented from .tournamentPage reference, adapted to current utils and types
import { setCurrentPage } from '../utils/globalState';
import { renderApp } from '../main';
import { PongGame } from '../game/PongGame';
import { authService } from '../utils/auth';
// RoomWebSocket not used; tournament WebSocket (match scope) handles controls
import { setGameScreen, cleanupGame } from '../utils/gameUtils';
// Room state no longer used for tournament matches
import { openTournamentArchive } from '../utils/tournamentArchive';
import {
	getArchive,
	getTournament,
	resetTournament,
	findPlayer
} from '../utils/tournamentUtils';
import { MatchStatus, MSmap, TournamentMatch } from '../types';
import { hydrateTournament } from '../utils/tournamentState';
import { initTournamentWebSocket, TournamentWebSocketManager } from '../utils/tournamentWebSocket';

let activeMatch: PongGame | undefined = undefined;
let isGameActive = false;
let tWS: TournamentWebSocketManager | undefined = undefined;
let tournamentControlsCleanup: (() => void) | undefined = undefined;

function getApiEndpoint(): string {
	return (window.__INITIAL_STATE__?.apiEndpoint || '').replace(/\/$/, '');
}

async function ensureMatchRoom(match: any): Promise<void> {
	if (match.matchRoomId) return;
	if (!match.tournamentId) throw new Error('Match missing tournamentId');
	const currentUser = authService.getCurrentUser();
	if (!currentUser) return;
	const p1 = match.playerId1 ? findPlayer(match.playerId1) : undefined;
	const p2 = match.playerId2 ? findPlayer(match.playerId2) : undefined;
	const hostPlayer = p1?.tpt === 'host' ? p1 : (p2?.tpt === 'host' ? p2 : undefined);
	const hostId = hostPlayer?.playerId || currentUser?.id?.toString() || `host-${Date.now()}`;
	const hostUsername = hostPlayer?.name || currentUser?.username || 'Host';
	const resp = await fetch(`${getApiEndpoint()}/api/tournament/${match.tournamentId}/match/create`, {
		method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authService.getToken()}` },
		body: JSON.stringify({ hostId, hostUsername, maxPlayers: 2, difficulty: 'normal' })
	});
	const data = await resp.json();
	if (!data.success || !data.data?.room) throw new Error('Failed to create room');
	const room = data.data.room;
	match.matchRoomId = room.roomId;
	const joinIfAuto = async (name: string, id: string, tpt: string) => {
		if (room.hostId === id) return;
		try {
			const resp = await fetch(`${getApiEndpoint()}/api/tournament/${match.tournamentId}/match/${room.roomId}/join`, {
				method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authService.getToken()}` },
				body: JSON.stringify({ id, name, tpt })
			});
			const data = await resp.json();
			if (!data?.success) console.warn('Auto-join failed:', data?.message || data);
		} catch (e) { console.warn('Auto-join error:', e); }
	};
	if (p1) await joinIfAuto(p1.name || `Player_${p1.playerId}`, p1.playerId, p1.tpt);
	if (p2) await joinIfAuto(p2.name || `Player_${p2.playerId}`, p2.playerId, p2.tpt);
}

async function startMatchCountdown(roomId: string): Promise<void> {
	const overlay = document.createElement('div');
	overlay.id = 'countdown-overlay';
	overlay.className = 'countdown-overlay animate-fade-in';
	const countdownText = document.createElement('div');
	countdownText.className = 'countdown-text animate-pulse';
	const messageText = document.createElement('div');
	messageText.className = 'countdown-message';
	messageText.textContent = 'Get Ready!';
	overlay.appendChild(countdownText);
	overlay.appendChild(messageText);
	document.body.appendChild(overlay);
	let count = 3;
	countdownText.textContent = count.toString();
	await new Promise<void>((resolve) => {
		const iv = setInterval(() => {
			count--;
			if (count > 0) {
				countdownText.textContent = count.toString();
				countdownText.classList.remove('animate-pulse');
				void (countdownText as HTMLElement).offsetWidth;
				countdownText.classList.add('animate-pulse');
			} else {
				countdownText.textContent = 'GO!';
				countdownText.style.color = 'rgb(251 191 36)';
				messageText.textContent = 'Game Starting...';
				clearInterval(iv);
				setTimeout(() => {
					overlay.classList.remove('animate-fade-in');
					overlay.classList.add('animate-fade-out');
					setTimeout(() => { overlay.remove(); resolve(); }, 300);
				}, 800);
			}
		}, 1000);
	});
}

function matchBracketHTML(t: any): string {
	const matches = t.allMatches || [];
	const byRound = new Map<number, any[]>();
	matches.forEach((m: any) => {
		const r = m.round || 1;
		if (!byRound.has(r)) byRound.set(r, [] as any);
		(byRound.get(r) as any[]).push(m);
	});
	const rounds = Array.from(byRound.keys()).sort((a, b) => a - b);

	const roundHtml = rounds.map(r => {
		const ms = (byRound.get(r) || []).sort((a: any, b: any) => (a.roundIdx || 0) - (b.roundIdx || 0));
		const cards = ms.map((m: any) => {
			const p1 = m.playerId1 ? (findPlayer(m.playerId1)?.name || '—') : '—';
			const p2 = m.playerId2 ? (findPlayer(m.playerId2)?.name || '—') : '—';
			let status = MSmap.get(m.status) || '—';
			const score = '';
			return `
				<div class="t-match-card ${m.status} ${status}">
					<div class="t-match-number">R${r}#${(m.roundIdx ?? 0) + 1}</div>
					<div class="t-match-players">
						<div class="t-match-player ${m.winner === m.playerId1 ? 'winner' : ''}">${p1}</div>
						<div class="t-match-vs">VS</div>
						<div class="t-match-player ${m.winner === m.playerId2 ? 'winner' : ''}">${p2}</div>
					</div>
					${score}
					<div class="t-match-status">${status}</div>
				</div>`;
		}).join('');
		return `<div class="t-bracket-round"><h4>Round ${r}</h4><div class="t-bracket-grid">${cards}</div></div>`;
	}).join('');

	return `<div class="t-bracket">${roundHtml}</div>`;
}

function setMatchLiveInfoByRoom(matchRoomId: string, info: Partial<{ status: MatchStatus; gameId: number }>): void {
	const t = getTournament();
	if (!t) return;
	const m = (t.allMatches || []).find((x: any) => x.matchRoomId === matchRoomId) || (t.currentMatch && t.currentMatch.matchRoomId === matchRoomId ? t.currentMatch : null);
	if (!m) return;
	Object.assign(m, info);
	if (info.status === 'active') (m as any).startedAt = new Date().toISOString();
}

function advanceAfterResult(matchRoomId: string, winnerPlayerId: string, p1Score?: number, p2Score?: number): void {
	const t = getTournament();
	if (!t) return;
	const match = (t.allMatches || []).find((m: any) => m.matchRoomId === matchRoomId) || t.currentMatch;
	if (!match) return;
	const p1 = match.playerId1 ? findPlayer(match.playerId1) : undefined;
	const p2 = match.playerId2 ? findPlayer(match.playerId2) : undefined;
	if (p1Score !== undefined && p1) (p1 as any).score = p1Score;
	if (p2Score !== undefined && p2) (p2 as any).score = p2Score;
	match.status = 'completed';
	match.winner = winnerPlayerId;
	(match as any).finishedAt = new Date().toISOString();
	const loserId = winnerPlayerId === match.playerId1 ? match.playerId2 : match.playerId1;
	const loser = loserId ? findPlayer(loserId) : undefined;
	if (loser) loser.eliminated = true;
	const alive = (t.players || []).filter((pl: any) => !pl.eliminated);
	if (alive.length === 1) {
		t.status = 'completed';
		t.championId = alive[0].playerId;
	}
}

export async function renderTournamentContent(): Promise<void> {
	const content = document.getElementById('tournamentContent');
	if (!content) return;
	const t = getTournament();
	if (!t) return;

	if (t.status === 'setup') {
		// Lazy import to avoid circular
		const mod = await import('./tournamentLobbyPage');
		mod.renderSetup();
		return;
	}

	if (t.status === 'completed') {
		const champPlayer = t.championId ? findPlayer(t.championId) : undefined;
		const champ = champPlayer?.name ? `<strong>${champPlayer.name}</strong>` : '—';
		content.innerHTML = `
			<p class="t-info-text"><strong>Tournament #</strong>${(() => {
				try {
					const ar: any[] = getArchive();
					const sorted = [...ar].sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
					const pos = sorted.findIndex((x: any) => x.tournamentId === t.tournamentId);
					return pos >= 0 ? (pos + 1) : (ar.length || '?');
				} catch { return '?'; }
			})()}</p>
			<h3 class="t-info-text">Tournament complete</h3>
			<p class="t-info-text">Champion: ${champ}</p>
			<div class="t-footer">
				<span class="t-footer-spacer">
					<button id="archiveBtn" class="btn btn-archive t-flex-1">History</button>
					<button id="resetBtn" class="btn btn-submit t-flex-1">New Tournament</button>
					<button id="backBtn" class="btn btn-t-back t-flex-1">Back</button>
				</span>
			</div>
		`;
		document.getElementById('archiveBtn')?.addEventListener('click', () => openTournamentArchive());
		document.getElementById('resetBtn')?.addEventListener('click', () => { resetTournament(); renderTournamentContent(); });
		document.getElementById('backBtn')?.addEventListener('click', () => {
			history.pushState({ page: 'gameSelect' }, '', '/gameSelect');
			setCurrentPage('gameSelect');
			renderApp();
		});
		return;
	}

	const cm = t.currentMatch;
	let p1 = cm?.playerId1 ? findPlayer(cm.playerId1) : undefined;
	let p2 = cm?.playerId2 ? findPlayer(cm.playerId2) : undefined;
	if (cm && p1 && p2) {
		if (p2.tpt === 'host' && p1.tpt !== 'host') { const tmp = p1; p1 = p2; p2 = tmp; }
	}

	const curLabel = cm ? `${p1?.name || '—'} vs ${p2?.name || '—'}` : '(no current match)';

	content.innerHTML = `
		${(() => {
			try {
				const ar: any[] = getArchive();
				const archivedIdx = ar.findIndex((a: any) => a.tournamentId === t.tournamentId);
				if (archivedIdx >= 0) {
					const sorted = [...ar].sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
					const pos = sorted.findIndex((x: any) => x.tournamentId === t.tournamentId);
					const friendly = pos >= 0 ? pos + 1 : (archivedIdx + 1);
					return `<p class=\"t-info-text\"><strong>Tournament #</strong>${friendly}</p>`;
				}
				const friendly = ar.length + 1;
				return `<p class=\"t-info-text\"><strong>Tournament #</strong>${friendly}</p>`;
			} catch { return `<p class=\"t-info-text\"><strong>Tournament #</strong>?</p>`; }
		})()}
		<p class="t-info-text"><strong>Status:</strong> <span id="tStatusText">${t.status}</span> <span id="tSyncIndicator" style="margin-left:.5rem;font-size:.85em;opacity:.8;">WS: …</span></p>
	${t.currentMatch ? `<p class="t-info-text"><strong>Current Match:</strong> ${curLabel}</p>` : ''}
		<div id="currentMatchBox" class="t-match-controls"></div>
		<div id="tournamentGameContainer" class="t-game-container" style="display: none;">
			<div id="pureGameContainer">
				<h3 class="t-game-title">Live Match</h3>
				<div class="game-status">
					<div>Status: <span id="gameStatus" class="status-text">Initializing...</span></div>
					<div>WebSocket: <span id="wsStatus" class="ws-status">Disconnected</span></div>
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
		const pure = document.getElementById('pureGameContainer') as HTMLElement | null;
		const btn = document.getElementById('toggleGameBtn') as HTMLButtonElement | null;
		if (!pure || !btn) return;
		if (!isGameActive) { console.log('No active game to show/hide.'); return; }
		const isVisible = pure.style.display !== 'none';
		if (isVisible) { pure.style.display = 'none'; btn.textContent = 'Show Game'; }
		else { pure.style.display = 'block'; btn.textContent = 'Hide Game'; }
	});

	document.getElementById('backBtn')?.addEventListener('click', () => {
		history.pushState({ page: 'gameSelect' }, '', '/gameSelect');
		setCurrentPage('gameSelect');
		renderApp();
	});

	document.getElementById('resetBtn')?.addEventListener('click', () => {
		if (confirm('Reset tournament?')) {
			cleanupActiveGame();
			resetTournament();
			renderTournamentContent();
		}
	});

	document.getElementById('archiveBtn')?.addEventListener('click', () => { openTournamentArchive(); });

	const box = document.getElementById('currentMatchBox')!;
	if (!t.currentMatch) {
		if (t.championId) { box.innerHTML = '<p>No more matches. Tournament complete.</p>'; }
		else if ((t.players?.length || 0) < 3) { box.innerHTML = '<p>Add at least 3 players and click Start.</p>'; }
		else { box.innerHTML = '<p>Bracket is preparing. Please wait…</p>'; }
		return;
	}

	await ensureMatchRoom(t.currentMatch);

	const joinUrl = `${window.location.origin}/join/${t.currentMatch.matchRoomId}`;
	box.innerHTML = `
		<p class="t-info-bold">Next up:</p>
		<div class="t-flex" style="gap:.5rem;">
			<div class="t-flex-1" id="p1Badge" style="color:#fff;font-weight:bold;">${p1?.name || '—'}</div>
			<div class="t-flex-1" id="p2Badge" style="color:#fff;font-weight:bold;">${p2?.name || '—'}</div>
		</div>
		<div style="margin-top:.5rem;">
			<div style="font-size:.9em;color:#fff;opacity:.9;">Room: <code>${t.currentMatch.matchRoomId}</code></div>
			<div style="font-size:.9em;color:#fff;opacity:.9;">Share link: <a href="${joinUrl}" target="_blank" style="color: rgba(172, 204, 255, 1);">${joinUrl}</a></div>
		</div>
		<div class="t-flex" style="gap:.5rem;margin-top:.5rem;">
			<button id="p1ReadyBtn" class="btn btn-ready t-flex-1">Ready?</button>
			<button id="p2ReadyBtn" class="btn btn-ready t-flex-1">Ready?</button>
		</div>
		<div class="t-flex" style="gap:.5rem;margin-top:.5rem;">
			<button id="readyAndStartBtn" class="btn btn-start t-flex-1" disabled>Start when both ready</button>
		</div>`;

	const syncReadyButton = (btn: HTMLButtonElement | null, opts: { isReady: boolean; isAI: boolean; playerId?: string }) => {
		if (!btn) return;
		if (opts.playerId) btn.dataset.playerId = opts.playerId;
		const noPlayer = !opts.playerId;
		btn.disabled = opts.isAI || noPlayer;
		btn.classList.toggle('clicked', opts.isReady);
		btn.setAttribute('aria-pressed', opts.isReady ? 'true' : 'false');
		btn.textContent = opts.isReady ? 'Ready ✓' : 'Ready?';
	};

	const updateReadyUI = (room: TournamentMatch) => {
		if (!room) return;
		const p1 = room.playerId1 ? findPlayer(room.playerId1) : undefined;
		const p2 = room.playerId2 ? findPlayer(room.playerId2) : undefined;
		if (!p1 || !p2) return;
		const p1Btn = document.getElementById('p1ReadyBtn') as HTMLButtonElement | null;
		const p2Btn = document.getElementById('p2ReadyBtn') as HTMLButtonElement | null;
		const startBtn = document.getElementById('readyAndStartBtn') as HTMLButtonElement | null;
		syncReadyButton(p1Btn, { playerId: p1.playerId, isAI: p1.tpt === 'ai', isReady: p1.isReady ?? (p1.tpt === 'ai') });
		syncReadyButton(p2Btn, { playerId: p2.playerId, isAI: p2.tpt === 'ai', isReady: p2.isReady ?? (p2.tpt === 'ai') });
		if (startBtn) startBtn.disabled = !(!!p1.isReady && !!p2.isReady);
		const token = authService.getToken();
		const autoReady = async (idx: 0 | 1, state: any) => {
			const isAI = idx === 0 ? p1.tpt === 'ai' : p2.tpt === 'ai';
			if (!isAI || state.isReady || (state as any)._autoReadySent) return;
			try {
				(state as any)._autoReadySent = true;
				await fetch(`${getApiEndpoint()}/api/tournament/${t.tournamentId}/match/${t.currentMatch?.matchRoomId}/ready`, {
					method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
					body: JSON.stringify({ playerId: state.playerId })
				});
			} catch {}
		};
		if (p1 && p2) { void autoReady(0, p1); void autoReady(1, p2); }
	};

	// Initialize tournament websocket (tournament + match scopes)
	let tConnected = false;
	let mConnected = false;
	const updateSyncIndicator = () => {
		const el = document.getElementById('tSyncIndicator');
		if (!el) return;
		const parts: string[] = [];
		parts.push(`T:${tConnected ? '✓' : '×'}`);
		parts.push(`M:${mConnected ? '✓' : '×'}`);
		el.textContent = `WS: ${parts.join(' | ')}`;
		el.style.opacity = (tConnected || mConnected) ? '0.9' : '0.6';
	};

	tWS = initTournamentWebSocket({
		tournamentId: t.tournamentId,
		matchId: t.currentMatch.matchRoomId,
		playerId: authService.getCurrentUser()?.id?.toString() || `viewer-${Date.now()}`,
		onConnect: (scope) => {
			if (!tWS) return;
			if (scope === 'tournament') { tConnected = true; tWS.requestTournamentState(); }
			if (scope === 'match') { mConnected = true; tWS.requestMatchState(); }
			updateSyncIndicator();
		},
		onDisconnect: (scope) => {
			if (scope === 'tournament') tConnected = false;
			if (scope === 'match') mConnected = false;
			updateSyncIndicator();
		},
		onTournamentState: (incoming) => {
			try {
				hydrateTournament(incoming);
				const ts = getTournament();
				if (!ts) return;
				const st = document.getElementById('tStatusText');
				if (st) st.textContent = ts.status;
				const br = document.getElementById('bracketSection');
				if (br) br.innerHTML = `<summary><strong>Bracket View</strong></summary>${matchBracketHTML(ts)}`;
			} catch {}
		},
		onCountdown: async () => { await startMatchCountdown(t.currentMatch?.matchRoomId!); },
		onGameStart: async (gameId) => {
			if (!t.currentMatch) return;
			setMatchLiveInfoByRoom(t.currentMatch.matchRoomId, { status: 'active', gameId });
			const startBtn = document.getElementById('readyAndStartBtn') as HTMLButtonElement | null;
			if (startBtn) startBtn.disabled = true;
			await showMatch(t.currentMatch, gameId);
		},
		onMatchState: (match) => { if (match?.matchRoomId === t.currentMatch?.matchRoomId) updateReadyUI(match); },
		onGameEnd: async (data) => {
			if (!data?.winnerId || !t.currentMatch) return;
			advanceAfterResult(t.currentMatch.matchRoomId, String(data.winnerId));
			await renderTournamentContent();
		}
	});

	// Connect tournament scope then match scope
	try { await tWS.connectTournament(); } catch {}
	try { await tWS.connectMatch({ matchId: t.currentMatch.matchRoomId }); } catch {}
	const initialRoom = getTournament()?.currentMatch; if (initialRoom) updateReadyUI(initialRoom);

	const postToggleReady = async (_which: 'p1' | 'p2', button: HTMLButtonElement) => {
		const prevDisabled = button.disabled; button.disabled = true;
		try {
			const token = authService.getToken();
			const playerId = (button.dataset && button.dataset.playerId) ? String(button.dataset.playerId) : undefined;
			if (!playerId) return;
			const resp = await fetch(`${getApiEndpoint()}/api/tournament/${t.tournamentId}/match/${t.currentMatch?.matchRoomId}/ready`, {
				method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
				body: JSON.stringify({ playerId })
			});
			await resp.json();
			if (tWS) tWS.requestMatchState();
		} catch (e) { console.error(e); }
		finally { button.disabled = prevDisabled; }
	};

	const button1 = document.getElementById('p1ReadyBtn') as HTMLButtonElement;
	const button2 = document.getElementById('p2ReadyBtn') as HTMLButtonElement;
	button1.addEventListener('click', async () => postToggleReady('p1', button1));
	button2.addEventListener('click', async () => postToggleReady('p2', button2));

	document.getElementById('readyAndStartBtn')?.addEventListener('click', async () => {
		try {
			if (!t.currentMatch) return;
			const token = authService.getToken();
				// Determine hostId without room state
				const p1h = t.currentMatch.playerId1 ? findPlayer(t.currentMatch.playerId1) : undefined;
				const p2h = t.currentMatch.playerId2 ? findPlayer(t.currentMatch.playerId2) : undefined;
				const hostPl = p1h?.tpt === 'host' ? p1h : (p2h?.tpt === 'host' ? p2h : undefined);
				const hostId = hostPl?.playerId || authService.getCurrentUser()?.id?.toString();
				const resp = await fetch(`${getApiEndpoint()}/api/tournament/${t.tournamentId}/match/${t.currentMatch!.matchRoomId}/start`, {
					method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
					body: JSON.stringify({ hostId })
				});
			const data = await resp.json();
			if (!t.currentMatch) return;
			if (!data.success) alert(data.message || 'Failed to start');
			else setMatchLiveInfoByRoom(t.currentMatch.matchRoomId, { status: 'active' });
		} catch (e) { console.error(e); alert('Failed to start match'); }
	});
}

async function showMatch(match: any, gameId: number): Promise<void> {
	const gameContainer = document.getElementById('tournamentGameContainer');
	if (!gameContainer) return;
	gameContainer.style.display = 'block';
	isGameActive = true;

	if (!activeMatch) activeMatch = new PongGame();
	activeMatch.gameId = gameId;
	const p1Name = findPlayer(match.playerId1 || '')?.name || 'Player 1';
	const p2Name = findPlayer(match.playerId2 || '')?.name || 'Player 2';
	(document.getElementById('player1Name') || { textContent: '' }).textContent = p1Name;
	(document.getElementById('player2Name') || { textContent: '' }).textContent = p2Name;

	setTimeout(async () => {
		if (!activeMatch) return;
		await setGameScreen(activeMatch);
		activeMatch.onGameEnd = async (winnerIdx: number) => {
			const p1Score = activeMatch?.gameState?.players?.[0]?.score || 0;
			const p2Score = activeMatch?.gameState?.players?.[1]?.score || 0;
			// Map winner index (1-based) to playerId fields
			const winnerPlayerId = winnerIdx === 1 ? match.playerId1 : match.playerId2;
			if (winnerPlayerId) advanceAfterResult(match.matchRoomId, winnerPlayerId, p1Score, p2Score);
			const gc = document.getElementById('tournamentGameContainer');
			if (gc) gc.style.display = 'none';
			const bracket = document.getElementById('bracketSection') as HTMLElement | null;
			if (bracket) bracket.style.display = 'block';
			cleanupActiveGame();
			await renderTournamentContent();
		};

		try {
			// Attach keyboard handlers that send key state via tournament WS (match scope)
			const keys: Record<string, boolean> = {};
			const movement = new Set(['w','s','o','l']);
			const onDown = (e: KeyboardEvent) => {
				const k = e.key.toLowerCase();
				if (!movement.has(k)) return;
				if (!keys[k]) {
					keys[k] = true;
					e.preventDefault();
					const isGuest = (k === 'o' || k === 'l');
					tWS?.sendKeyState(k, true);
					// If you need guest lane support, extend tournamentWS to carry isGuest
				}
			};
			const onUp = (e: KeyboardEvent) => {
				const k = e.key.toLowerCase();
				if (!movement.has(k)) return;
				keys[k] = false;
				tWS?.sendKeyState(k, false);
			};
			document.addEventListener('keydown', onDown);
			document.addEventListener('keyup', onUp);
			tournamentControlsCleanup = () => {
				document.removeEventListener('keydown', onDown);
				document.removeEventListener('keyup', onUp);
			};
		} catch (e) { console.warn('Controls setup skipped:', e); }
	}, 50);
}

function cleanupActiveGame(): void {
	if (activeMatch) { cleanupGame(activeMatch); activeMatch = undefined; }
	if (tournamentControlsCleanup) { try { tournamentControlsCleanup(); } catch {} tournamentControlsCleanup = undefined; }
	if (tWS) { try { tWS.disconnectAll(); } catch {} tWS = undefined; }
	isGameActive = false;
}

export async function renderTournamentPage(): Promise<void> {
	const root = document.getElementById('app-root');
	if (!root) return;
	root.innerHTML = `
		<div class="t-section">
			<h2>Tournament Mode</h2>
			<div id="tournamentContent" class="t-content">Loading...</div>
		</div>`;
	renderTournamentContent();
}

export function cleanupTournamentPage(): void { cleanupActiveGame(); }


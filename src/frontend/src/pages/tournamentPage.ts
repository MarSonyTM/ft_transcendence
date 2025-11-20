import { setCurrentPage } from '../utils/globalState';
import { renderApp } from '../main';
import { PongGame } from '../game/PongGame';
import { authService } from '../utils/auth';
import { setGameScreen, cleanupGame, setEffectiveRoom } from '../utils/gameUtils';
import { openTournamentArchive } from '../utils/tournamentArchive';
import {
	getArchive,
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
import { MatchStatus, MSmap, TournamentMatch, getApiEndpoint, TournamentPlayer } from '../types';
import { getCurrentTournament, hydrateTournament, setCurrentMatch } from '../utils/tournamentState';
import { initTournamentWebSocket, TournamentWebSocketManager } from '../utils/tournamentWebSocket';

let activeMatch: PongGame | undefined = undefined;
let isGameActive = false;
let tWS: TournamentWebSocketManager | undefined = undefined;
let tournamentControlsCleanup: (() => void) | undefined = undefined;
let lastRenderedCurrentMatchId: number | null = null;

// async function startMatchCountdown(roomId: number): Promise<void> {
// 	const overlay = document.createElement('div');
// 	overlay.id = 'countdown-overlay';
// 	overlay.className = 'countdown-overlay animate-fade-in';
// 	const countdownText = document.createElement('div');
// 	countdownText.className = 'countdown-text animate-pulse';
// 	const messageText = document.createElement('div');
// 	messageText.className = 'countdown-message';
// 	messageText.textContent = 'Get Ready!';
// 	overlay.appendChild(countdownText);
// 	overlay.appendChild(messageText);
// 	document.body.appendChild(overlay);
// 	let count = 3;
// 	countdownText.textContent = count.toString();
// 	await new Promise<void>((resolve) => {
// 		const iv = setInterval(() => {
// 			count--;
// 			if (count > 0) {
// 				countdownText.textContent = count.toString();
// 				countdownText.classList.remove('animate-pulse');
// 				void (countdownText as HTMLElement).offsetWidth;
// 				countdownText.classList.add('animate-pulse');
// 			} else {
// 				countdownText.textContent = 'GO!';
// 				countdownText.style.color = 'rgb(251 191 36)';
// 				messageText.textContent = 'Game Starting...';
// 				clearInterval(iv);
// 				setTimeout(() => {
// 					overlay.classList.remove('animate-fade-in');
// 					overlay.classList.add('animate-fade-out');
// 					setTimeout(() => { overlay.remove(); resolve(); }, 300);
// 				}, 800);
// 			}
// 		}, 1000);
// 	});
// }

function matchBracketHTML(t: any): string {
	const matches = Array.isArray(t.allMatches) ? t.allMatches : [];
	const byRound = new Map<number, TournamentMatch[]>();
	for (const m of matches) {
		const r = m.round || 1;
		if (!byRound.has(r)) byRound.set(r, [] as any);
		(byRound.get(r) as any[]).push(m);
	}
	const queueIds: string[] = (t.matchQueue || []).map((mq: any) => String(mq.id));
	const activeRound: number | undefined = (t.round ?? t.bracketRound ?? t.currentMatch?.round);
	const rounds = Array.from(byRound.keys())
		.filter(r => activeRound === undefined ? true : r <= activeRound)
		.sort((a, b) => a - b);
	const roundHtml = rounds.map(r => {
		let ms = (byRound.get(r) || []).sort((a: any, b: any) => (a.roundIdx || 0) - (b.roundIdx || 0));
	if (activeRound !== undefined && r === activeRound && queueIds.length > 0) {
			const inQueue: any[] = [];
			const done: any[] = [];
			const queueOrder = new Map<string, number>();
			queueIds.forEach((id, idx) => queueOrder.set(id, idx));
			for (const m of ms) {
				const id = String(m.id);
				if (queueOrder.has(id) && m.status !== 'completed')
					inQueue.push(m);
				else
					done.push(m);
			}
			inQueue.sort((a: any, b: any) => (queueOrder.get(String(a.id))! - queueOrder.get(String(b.id))!));
			ms = [...inQueue, ...done];
		}
		const cards = ms.map((m: any) => {
			const p1 = m.playerId1 ? (findPlayer(m.playerId1)?.name || '—') : '—';
			const p2 = m.playerId2 ? (findPlayer(m.playerId2)?.name || '—') : '—';
			let status = MSmap.get(m.status) || '—';
			const isQueued = queueIds.includes(String(m.matchRoomId)) && m.status !== 'completed';
			const isCurrent = t.currentMatch && String(t.currentMatch.matchRoomId) === String(m.matchRoomId);
			return `<div class="t-match-card ${m.status} ${status} ${isQueued ? 'queued' : ''} ${isCurrent ? 'current' : ''}">`
				+ `
				<div class="t-match-number">R${r}#${(m.roundIdx ?? 0) + 1}</div>
				<div class="t-match-players">
					<div class="t-match-player ${m.winner === m.playerId1 ? 'winner' : ''}">${p1}</div>
					<div class="t-match-vs">VS</div>
					<div class="t-match-player ${m.winner === m.playerId2 ? 'winner' : ''}">${p2}</div>
				</div>
				<div class="t-match-status">${status}${isQueued ? ' •' : ''}</div>
			</div>`;
		}).join('');
		return `<div class="t-bracket-round"><h4>Round ${r}</h4><div class="t-bracket-grid">${cards}</div></div>`;
	}).join('');
	return `<div class="t-bracket">${roundHtml}</div>`;
}

function setMatchLiveInfoByRoom(matchRoomId: number, info: Partial<{ status: MatchStatus; gameId: number }>): void {
	let t = getTournament();
	if (!t) return;
	const m = (t.allMatches || []).find((x: any) => x.id === matchRoomId) ||
		(t.currentMatch && t.currentMatch.id === matchRoomId ? t.currentMatch : null);
	if (!m) return;
	Object.assign(m, info);
	if (info.status === 'active')
		(m as any).startedAt = new Date().toISOString();
	if (info.gameId !== undefined)
		(m as any).gameId = info.gameId;
}

async function waitForNextMatch(tournamentId: any, attempts = 8, delayMs = 500): Promise<boolean> {
	for (let i = 0; i < attempts; i++) {
		try {
			await loadCurrentMatch();
			const t = getTournament();
			if (!t) return false;
			if (t.currentMatch) return true;
		} catch {}
		await new Promise(res => setTimeout(res, delayMs));
	}
	return false;
}

function statusComplete(content: HTMLElement): void {
	const t = getTournament();
	if (!t) return;
	const champPlayer = t.championId ? findPlayer(t.championId) : undefined;
		const champ = champPlayer?.name ? `<strong>${champPlayer.name}</strong>` : '—';
		content.innerHTML = `
			<p class="t-info-text"><strong>Tournament #</strong>${(() => {
				try {
					const ar: any[] = getArchive();
					const sorted = [...ar].sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
					const pos = sorted.findIndex((x: any) => x.tournamentId === t!.id);
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
		document.getElementById('resetBtn')?.addEventListener('click', async () => {
			await resetTournament();
			await renderTournamentContent();
		});
		document.getElementById('backBtn')?.addEventListener('click', () => {
			history.pushState({ page: 'gameSelect' }, '', '/gameSelect');
			setCurrentPage('gameSelect');
			renderApp();
		});
		return;
}

export async function renderTournamentContent(): Promise<void> {
	const content = document.getElementById('tournamentContent');
	if (!content)
		return console.debug('[Tournament] No tournament content element found');
	let t = getTournament();
	if (!t)
		return console.error('[Tournament] renderTournamentContent - tournament is null, cannot render');
	// console.debug('[Tournament] renderTournamentContent - getTournament():', t);

	if (t.status === 'setup')
		renderSetup(content);
	console.debug('HERE 1');
	t = getTournament();
	if (!t) {
		console.debug('[Tournament] No tournament after setup');
		return;
	}
	console.debug('HERE 2');
	if (t.status === 'completed') {
		return statusComplete(content);
	}
	t = getTournament();
	if (!t || !t.currentMatch) {
		return;
	}
	console.debug('HERE 3');
	let p1 = t.players.find((pl: any) => pl.playerId === t?.currentMatch?.playerId1);
	let p2 = t.players.find((pl: any) => pl.playerId === t?.currentMatch?.playerId2);
	const curLabel = t.currentMatch ? `${p1?.name || '—'} vs ${p2?.name || '—'}` : '(no current match)';

	content.innerHTML = `
		${(() => {
			try {
				const ar: any[] = getArchive();
				const archivedIdx = ar.findIndex((a: any) => a.tournamentId === t!.id);
				if (archivedIdx >= 0) {
					const sorted = [...ar].sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
					const pos = sorted.findIndex((x: any) => x.tournamentId === t!.id);
					const friendly = pos >= 0 ? pos + 1 : (archivedIdx + 1);
					return `<p class=\"t-info-text\"><strong>Tournament #</strong>${friendly}</p>`;
				}
				return `<p class=\"t-info-text\"><strong>Tournament #</strong>${t.id}</p>`;
			} catch { return `<p class=\"t-info-text\"><strong>Tournament #</strong>?</p>`; }
		})()}
		<p class="t-info-text"><strong>Status:</strong> <span id="tStatusText">${t.status}</span>
		<span id="tSyncIndicator" style="margin-left:.5rem;font-size:.85em;opacity:.8;">WS: …</span></p>
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

	console.debug('HERE 4');
	document.getElementById('toggleGameBtn')?.addEventListener('click', () => {
		const pure = document.getElementById('pureGameContainer') as HTMLElement | null;
		const btn = document.getElementById('toggleGameBtn') as HTMLButtonElement | null;
		if (!pure || !btn) return;
		if (!isGameActive) return console.log('[Tournament] No active game to show/hide.');
		const isVisible = pure.style.display !== 'none';
		if (isVisible) {
			pure.style.display = 'none';
			btn.textContent = 'Show Game';
		}
		else {
			pure.style.display = 'block';
			btn.textContent = 'Hide Game';
		}
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
			if (!content) return;
			await renderSetup(content);
		};
	});

	document.getElementById('archiveBtn')?.addEventListener('click', () => {
		openTournamentArchive();
	});

	const box = document.getElementById('currentMatchBox')!;
	console.debug('HERE 5');
	if (t.currentMatch.status !== 'active') { 
		if (t.championId) {
			box.innerHTML = '<p>No more matches. Tournament complete.</p>';
			showTournamentEndScreen(t.championId);
			return;
		}
		if (t.players?.length < 3) {
			box.innerHTML = '<p>Add at least 3 players to seed matches (minimum 3).</p>';
			return;
		}
		if (!t.championId && (t as any).status !== 'completed') {
			console.debug('HERE 6');
			box.innerHTML = '<p>Loading next match…</p>';
			try {
				if (await waitForNextMatch(t.id))
					t.currentMatch = await loadCurrentMatch();
			} catch (e) {
				console.error('[Tournament]: ', e);
				box.innerHTML = '<p style="color:#f87171;">Failed to start tournament.</p>';
				return;
			}
		}
		console.debug('HERE 7');
		box.innerHTML = '<p>Fetching first match…</p>';
		t.currentMatch = await loadCurrentMatch();
		if (!t.currentMatch) {
			box.innerHTML = '<p style="opacity:.85;">Waiting for server to generate first match…</p>';
			return;
		}
	}
	console.debug('HERE 8');
	let rp1 = t.players.find((pl: any) => pl.playerId === t?.currentMatch?.playerId1);
	let rp2 = t.players.find((pl: any) => pl.playerId === t?.currentMatch?.playerId2);
	box.innerHTML = `
		<p class="t-info-bold">Next up:</p>
		<div class="t-flex" style="gap:.5rem;">
			<div class="t-flex-1" id="p1Badge" style="color:#fff;font-weight:bold;">${rp1?.name || '—'}</div>
			<div class="t-flex-1" id="p2Badge" style="color:#fff;font-weight:bold;">${rp2?.name || '—'}</div>
		</div>
		<div style="margin-top:.5rem;">
			<div style="font-size:.9em;color:#fff;opacity:.9;">Match: <code>${t.currentMatch.id}</code></div>
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
		btn.setAttribute('aria-pressed', opts.isReady ? 'true' : 'true');//'false');//TODO just for testing
		btn.textContent = opts.isReady ? 'Ready ✓' : 'Ready?';
	};

	const updateReadyUI = async (match: TournamentMatch) => {
		if (!match) return;
		const t = getTournament();
		if (!t || match.tournamentId !== t.id) return;
		const p1 = t.players.find((pl: any) => pl.playerId === match.playerId1);
		const p2 = t.players.find((pl: any) => pl.playerId === match.playerId2);
		if (!p1 || !p2) return;
		
		const p1Btn = document.getElementById('p1ReadyBtn') as HTMLButtonElement | null;
		const p2Btn = document.getElementById('p2ReadyBtn') as HTMLButtonElement | null;
		const startBtn = document.getElementById('readyAndStartBtn') as HTMLButtonElement | null;
		
		syncReadyButton(p1Btn, { playerId: String(p1.id), isAI: p1.tpt === 'ai', isReady: p1.isReady ?? (p1.tpt === 'ai') });
		syncReadyButton(p2Btn, { playerId: String(p2.id), isAI: p2.tpt === 'ai', isReady: p2.isReady ?? (p2.tpt === 'ai') });
		
		if (startBtn)
			startBtn.disabled = (match.status === 'ready') ? false : !(!!p1.isReady && !!p2.isReady);
		
		const autoReady = async (idx: 0 | 1, p: TournamentPlayer) => {
			const isAI = idx === 0 ? p1.tpt === 'ai' : p2.tpt === 'ai';
			if (!isAI || p.isReady || (p as any)._autoReadySent) return;
			(p as any)._autoReadySent = true;
			await fetch(`${getApiEndpoint()}/api/tournament/${match.tournamentId}/match/${match.id}/player/${p.id}/ready`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authService.getToken()}` },
				body: JSON.stringify({ })
			});
		};

		if (p1 && p2) {
			void autoReady(0, p1);
			void autoReady(1, p2);
		}
	};

    if (tWS === undefined) {
		tWS = initTournamentWebSocket({
			tournamentId: String(t.id),
            playerId: authService.getCurrentUser()!.id,

			onConnect: async() => {
                if (!tWS) return;
				tWS.requestTournamentState();
				tWS.requestMatchState();
            },

			onDisconnect: async () => {
				if (!tWS) return;
				tWS.disconnectTournament();
			},

			onTournamentState: (incoming) => {
				hydrateTournament(incoming);
				t = incoming;//getTournament();
				if (!t) return;
				const st = document.getElementById('tStatusText');
				if (st)
					st.textContent = t.status;
				const br = document.getElementById('bracketSection');
				if (br)
					br.innerHTML = `<summary><strong>Bracket View</strong></summary>${matchBracketHTML(t)}`;

				const cmId = t.currentMatch?.id;
				if (cmId != null && cmId !== lastRenderedCurrentMatchId) {
					lastRenderedCurrentMatchId = cmId;
					renderTournamentContent();
				}
			},

            onCountdown: async () => {
				console.log('Please call actual countdown');
				// await startMatchCountdown(t?.currentMatch?.id!);
			},

            onGameStart: async (gameId) => {
				t = getTournament();
                if (!t || !t.currentMatch) return;
                setMatchLiveInfoByRoom(t.currentMatch.id!, { status: 'active', gameId });
                const startBtn = document.getElementById('readyAndStartBtn') as HTMLButtonElement | null;
                if (startBtn) startBtn.disabled = false;//true;//TODO just for testing
                await showMatch(t.currentMatch);
            },

            onMatchState: (match) => {
				if (t && match?.id === t.currentMatch?.id)
					updateReadyUI(match);
			},

            onMatchEnd: async (data) => {//TODO why matchEnd and GameEnd??
				if (!t)
					t = getTournament();
				if (!t) return;
                const target = t.allMatches.find(m => m.id === Number(data.matchId));
                if (target) {
					target.winnerId = Number(data.winnerId) || null;
					target.status = 'completed';
				}
				const br = document.getElementById('bracketSection');
				if (br)
					br.innerHTML = `<summary><strong>Bracket View</strong></summary>${matchBracketHTML(t)}`;
                const box = document.getElementById('currentMatchBox');
                if (box)
					box.innerHTML = '<p>Fetching next match…</p>';
                const found = await waitForNextMatch(t.id);
                if (!found && t.status === 'completed')
					showTournamentEndScreen(Number(data.winnerId));
                await renderTournamentContent();
            },

            onGameEnd: (data) => {
				if (data.matchId && t) {
					setMatchLiveInfoByRoom(Number(data.matchId), { status: 'completed' });
					postTournamentMatchWinner(t.id!, Number(data.matchId), Number(data.winnerId));
				}
                if (!data?.winnerId || !t?.currentMatch) return;
                setCurrentMatch(null)
                cleanupActiveGame();
                const gc = document.getElementById('tournamentGameContainer');
                if (gc) gc.style.display = 'none';
            },

            onError: (err) => {
				console.error('[Tournament] WebSocket error:', err);
			}

        });

        await tWS.connectTournament();
        if (t.currentMatch)
			await tWS.connectMatch({ matchId: String(t.currentMatch.id) });

	} else {
		if (t.currentMatch && tWS) {
			if (!tWS.isMatchConnected() || (t.currentMatch.id !== (tWS as any).matchCfg?.matchId))
				await tWS.connectMatch({ matchId: String(t.currentMatch.id) });
		}
	}

	const initialRoom = getTournament()?.currentMatch;
	if (initialRoom) updateReadyUI(initialRoom);

	const postToggleReady = async (p: TournamentPlayer, button: HTMLButtonElement) => {
		const prevDisabled = button.disabled;
		button.disabled = true;
		try {
			if (!t) return;
			const playerId = (button.dataset && button.dataset.playerId) ? String(button.dataset.playerId) : undefined;
			if (!playerId) return;
			const response = await fetch(`${getApiEndpoint()}/api/tournament/${t.id}/match/${t.currentMatch?.id}/player/${p.id}/ready`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authService.getToken()}` },
				body: JSON.stringify({ })
			});
			await response.json();
			const latest = await loadCurrentMatch();
			if (latest)
				updateReadyUI(latest);
			if (tWS)
				tWS.requestMatchState();//tWS.requestTournamentState();//
		} catch (e) {
			console.error(e);
		}
		finally {
			button.disabled = prevDisabled;
		}
	};

	const button1 = document.getElementById('p1ReadyBtn') as HTMLButtonElement;
	const button2 = document.getElementById('p2ReadyBtn') as HTMLButtonElement;
	button1.addEventListener('click', async () => postToggleReady(t?.currentMatch?.p1!, button1));
	button2.addEventListener('click', async () => postToggleReady(t?.currentMatch?.p2!, button2));

	document.getElementById('readyAndStartBtn')?.addEventListener('click', async () => {
		try {
			if (!t || !t.currentMatch) return;
			const p1h = t.currentMatch.p1;
			const p2h = t.currentMatch.p2;
			// const hostPl = p1h?.tpt === 'host' ? p1h : (p2h?.tpt === 'host' ? p2h : undefined);
			// const hostId = hostPl?.id || authService.getCurrentUser()?.id?.toString();

			const response = await fetch(`${getApiEndpoint()}/api/tournament/${t.id}/match/${t.currentMatch!.id}/start`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authService.getToken()}` },
				body: JSON.stringify({  })
			});
			const data = await response.json();
			if (!response.ok) {
				alert((data && data.message) || `Failed to start (HTTP ${response.status})`);
				return;
			}
			// if (data && data.gameId)
			// 	t.currentMatch.gameId = data.gameId;
			console.log('[Tournament] Requesting match start for room ID:', t.currentMatch.id);
			// console.log('[Tournament] Match start successful:', data);
			setMatchLiveInfoByRoom(t.currentMatch.id!, { status: 'active' });
			// t.currentMatch.status = 'active';
			const startBtn = document.getElementById('readyAndStartBtn') as HTMLButtonElement | null;
			if (startBtn) startBtn.disabled = false;//true;//TODO just for testing
			const statusSpan = document.getElementById('gameStatus');
			if (statusSpan) statusSpan.textContent = 'Starting…';
			tWS?.requestMatchState();
			await renderTournamentContent();
			setTimeout(async () => {
				if (!getTournament()?.currentMatch?.gameId) {
					await loadCurrentMatch();
					await renderTournamentContent();
				}
			}, 800);
			t = getTournament();
			if (!t || !t.currentMatch) return;
			await showMatch(t.currentMatch);//TODO at least it shows up
			// await renderTournamentContent();
		} catch (e) {
			console.error(e);
			alert('Failed to start match');
		}
	});
}

async function showMatch(match: TournamentMatch): Promise<void> {
	console.debug('[Tournament] inside showMatch')
	const gameContainer = document.getElementById('tournamentGameContainer');
	if (!gameContainer) return;
	gameContainer.style.display = 'block';
	isGameActive = true;

	activeMatch = undefined;
	activeMatch = new PongGame();
	activeMatch.gameId = match.gameId;
	const response = await fetch(`${getApiEndpoint()}/api/game/${activeMatch.gameId}`, {
		headers: { 'Authorization': `Bearer ${authService.getToken()}` }
	})
	const gameData = await response.json();
	if (!response.ok) {
		console.error('Failed to fetch game data for tournament match:', gameData);
		return;
	}
	activeMatch.gameState = gameData;
	await setEffectiveRoom();
	console.log('Initialized PongGame instance for tournament match:', activeMatch);
	
	let p1 = match.p1;
	let p2 = match.p2;
	(document.getElementById('player1Name') || { textContent: '' }).textContent = p1?.name || 'Player 1';
	(document.getElementById('player2Name') || { textContent: '' }).textContent = p2?.name || 'Player 2';

	setTimeout(async () => {
		if (!activeMatch) return;
		await setGameScreen(activeMatch);//TODO HERE! look at actual ponggame implementation!!
		activeMatch.startHeartbeat();
		activeMatch.startRenderLoop();
		activeMatch.startServerGame();
		activeMatch.addStateListener(activeMatch.currentGameState);
		// renderTournamentContent();

		activeMatch.onGameEnd = async (winnerIdx: number) => {
			if (p1)
				p1.score = activeMatch?.gameState?.players?.[0]?.score || 0;
			if (p2)
				p2.score = activeMatch?.gameState?.players?.[1]?.score || 0;
			const winnerPlayerId = winnerIdx === 1 ? p1?.id : p2?.id;
			match.winnerId = winnerPlayerId || null;
			activeMatch?.stopRenderLoop();
			isGameActive = false;
			cleanupActiveGame();
			const gameContainer = document.getElementById('tournamentGameContainer');
			if (gameContainer) gameContainer.style.display = 'none';
			try {
				const t = getTournament();
				if (!t) return;
				if (t && winnerPlayerId) 
					p1?.id === winnerPlayerId ? (p2!.eliminated = true) : (p1!.eliminated = true);
				console.log(`Match ended. Winner: Player ${winnerIdx} (ID: ${winnerPlayerId}). Scores: ${p1?.score || 0}-${p2?.score || 0}`);
				await postTournamentMatchWinner(t.id!, match.id!, winnerPlayerId || null);
				renderTournamentContent();
			} catch (e) {
				console.warn('[Tournament] Failed to post tournament match winner:', e);
			}
			// renderTournamentContent();
		};

		// try {
		// 	const keys: Record<string, boolean> = {};
		// 	const movement = new Set(['w','s','o','l']);
			
		// 	const onDown = (e: KeyboardEvent) => {
		// 		const k = e.key.toLowerCase();
		// 		if (!movement.has(k)) return;
		// 		if (!keys[k]) {
		// 			keys[k] = true;
		// 			e.preventDefault();
		// 			const isGuest = (k === 'o' || k === 'l');
		// 			tWS?.sendKeyState(k, true, isGuest);
		// 		}
		// 	};

		// 	const onUp = (e: KeyboardEvent) => {
		// 		const k = e.key.toLowerCase();
		// 		if (!movement.has(k)) return;
		// 		keys[k] = false;
		// 		e.preventDefault();
		// 		const isGuest = (k === 'o' || k === 'l');
		// 		tWS?.sendKeyState(k, false, isGuest);
		// 	};

		// 	document.addEventListener('keydown', onDown);
		// 	document.addEventListener('keyup', onUp);
		// 	tournamentControlsCleanup = () => {
		// 		document.removeEventListener('keydown', onDown);
		// 		document.removeEventListener('keyup', onUp);
		// 	};
		// } catch (e) {
		// 	console.warn('Controls setup skipped:', e);
		// }
	}, 50);
}

function cleanupActiveGame(): void {
	if (activeMatch) {
		cleanupGame(activeMatch);
		activeMatch = undefined;
	}
	if (tournamentControlsCleanup) {
		try {
			tournamentControlsCleanup();
		} catch {}
		tournamentControlsCleanup = undefined;
	}
	if (tWS) {
		try {
			tWS.disconnectMatch();
		} catch {}
		tWS = undefined;
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
		</div>`;
	
	let t = getTournament();
	if (!t) {
		t = await createTournament();
		if (t)
			await setEffectiveTournament(t.id!);
		else
			return console.error('Failed to create or retrieve tournament.');
	}
	await renderTournamentContent();
}

export function cleanupTournamentPage(): void { cleanupActiveGame(); }


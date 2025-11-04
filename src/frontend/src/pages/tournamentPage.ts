import { setCurrentPage } from '../utils/globalState';
import { renderApp } from '../main';
import { PongGame } from '../game/PongGame';
import { authService } from '../utils/auth';
import { initRoomWebSocket, RoomWebSocketManager } from '../utils/roomWebSocket';
import { setGameScreen, cleanupGame, updateConnectionStatus, setupRoomKeyboardControls } from '../utils/gameUtils';
import { getCurrentRoom, setCurrentRoom } from '../utils/roomState';
import { TournamentMatch, Tournament } from '../../../shared/tournamentTypes';
import { openTournamentArchive } from '../utils/tournamentArchive';
import {
	addPlayer,
	advanceAfterResult,
	buildBracket,
	createTournament,
	getArchive,
	getPlayerById,
	getTournament,
	resetTournament as resetEngine,
	setMatchLiveInfo,
	startTournamentIfReady,
} from '../utils/tournamentEngine';

let activeTournamentGame: PongGame | undefined = undefined;
let isGameActive = false;
let tournamentControlsCleanup: (() => void) | undefined = undefined;
let tournamentSecondaryWS: RoomWebSocketManager | null = null;

function getApiEndpoint(): string {
	return (window.__INITIAL_STATE__?.apiEndpoint || '').replace(/\/$/, '');
}

function renderSetup(content: HTMLElement): void {
	const t = getTournament() ?? createTournament();
	content.innerHTML = `
		<p class="t-msg">Create a new tournament</p>
		<div class="t-setup">
		<div class="t-flex">
			<button id="addLocalBtn" class="btn btn-add t-flex-1">🎮 Add Local Player</button>
			<button id="addAIBtn" class="btn btn-add t-flex-1">🤖 Add AI Player</button>
			<button id="addRemoteBtn" class="btn btn-add t-flex-1">🌐 Add Remote Player</button>
		</div>
		<ul id="playersList" class="t-alias-list"></ul>
		<div class="t-actions">
			<button id="clearBtn" class="btn btn-end t-flex-1">Clear</button>
			<button id="startBtn" class="btn btn-start t-flex-1">Start Tournament</button>
		</div>
		</div>`;

	const listEl = document.getElementById('playersList') as HTMLUListElement;
	const rerender = () => {
		const cur = getTournament();
		if (!cur) return;
		if (cur.players.length === 0) {
			listEl.innerHTML = `<li class="empty">No players yet</li>`;
		} else if (cur.players.length > 10) {
			alert('Maximum of 10 players reached');
		} else {
			listEl.innerHTML = cur.players.map(p => {
				const tags = [p.isAI ? '🤖' : null, p.isLocal ? '🎮' : null, p.isRemote ? '🌐' : null].filter(Boolean).join(' ');
				return `<li class="t-alias-item"><span class="t-alias-name">${p.alias} ${tags}</span></li>`;
			}).join('');
		}
	};
	rerender();

	document.getElementById('addLocalBtn')?.addEventListener('click', () => {
		const alias = prompt('Local player alias', `Local_${(getTournament()?.players.length ?? 0) + 1}`)?.trim();
		if (!alias) return;
		addPlayer(alias, { isLocal: true });
		rerender();
	});

	document.getElementById('addAIBtn')?.addEventListener('click', () => {
		let x = getTournament()?.players.filter(p => p.isAI).length || 0;
		const alias = `AI_${x + 1}`;
		if (!alias) return;
		addPlayer(alias, { isAI: true });
		rerender();
	});

	document.getElementById('addRemoteBtn')?.addEventListener('click', () => {//TODO:X test remote adding
		const alias = prompt('Remote player alias', `Remote_${(getTournament()?.players.length ?? 0) + 1}`)?.trim();
		if (!alias) return;
		addPlayer(alias, { isRemote: true });
		rerender();
	});

	document.getElementById('clearBtn')?.addEventListener('click', () => {
		resetEngine();
		createTournament();
		renderSetup(content);
	});

	document.getElementById('startBtn')?.addEventListener('click', () => {
		if (!startTournamentIfReady()) {
			alert('Add at least 3 players');
			return;
		}
		buildBracket();
		renderTournamentContent();
	});
}

async function ensureMatchRoom(match: TournamentMatch): Promise<void> {
	if (match.roomId) return;

	const currentUser = authService.getCurrentUser();
	const hostId = currentUser?.id?.toString() || `host-${Date.now()}`;
	const hostUsername = currentUser?.username || 'Host';
	const p1 = getPlayerById(match.p1?.playerId);
	const p2 = getPlayerById(match.p2?.playerId);

	const desiredHostId = p1?.playerId || hostId;
	const desiredHostName = p1?.alias || hostUsername;

	const resp = await fetch(`${getApiEndpoint()}/api/room/create`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${authService.getToken()}`
		},
		body: JSON.stringify({
			hostId: desiredHostId,
			hostUsername: desiredHostName,
			maxPlayers: 2,
			isAi: !!p1?.isAI,
			hostIsLocal: !!p1?.isLocal && !p1?.isAI,
			difficulty: (p1 as any)?.difficulty || 'normal'
		})
	});
	const data = await resp.json();
	if (!data.success || !data.data?.room) throw new Error('Failed to create room');
	const room = data.data.room;
	setCurrentRoom(room);
	match.roomId = room.roomId;
	setMatchLiveInfo(match.matchId, { roomId: room.roomId });

	const joinIfAuto = async (alias: string, id: string, opts?: { isAI?: boolean; isLocal?: boolean; difficulty?: string }) => {
		if (!opts?.isAI && !opts?.isLocal) return;
		if (room.hostId === id) return;
		try {
			const resp = await fetch(`${getApiEndpoint()}/api/room/${room.roomId}/join`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${authService.getToken()}`
				},
				body: JSON.stringify({
					playerId: id,
					username: alias,
					isAI: !!opts.isAI,
					isLocal: !!opts.isLocal,
					difficulty: opts.difficulty || 'normal'
				})
			});
			const data = await resp.json();
			if (!data?.success) {
				console.warn('Auto-join failed:', data?.message || data);
			}
		} catch (e) {
			console.warn('Auto-join error:', e);
		}
	};

	if (p1) await joinIfAuto(p1.alias, p1.playerId, { isAI: p1.isAI, isLocal: p1.isLocal });
	if (p2) await joinIfAuto(p2.alias, p2.playerId, { isAI: p2.isAI, isLocal: p2.isLocal });
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
			setTimeout(() => {
				overlay.remove();
				resolve();
			}, 300);
			}, 800);
		}
		}, 1000);
	});
}

function matchBracketHTML(t: Tournament): string {
	if (!t.matches.length) return '<div class="t-bracket-grid"></div>';
	const byRound = new Map<number, typeof t.matches>();
	t.matches.forEach(m => {
		const r = m.round || 1;
		if (!byRound.has(r)) byRound.set(r, [] as any);
		(byRound.get(r) as TournamentMatch[]).push(m);
	});
	const rounds = Array.from(byRound.keys()).sort((a, b) => a - b);

	const roundHtml = rounds.map(r => {
		const ms = (byRound.get(r) || []).sort((a, b) => (a.indexInRound || 0) - (b.indexInRound || 0));
		const cards = ms.map(m => {
			const p1 = m.p1?.id ? (getPlayerById(m.p1?.playerId)?.alias || '—') : '—';
			const p2 = m.p2?.id ? (getPlayerById(m.p2?.playerId)?.alias || '—') : '—';
			const statusMap: Record<string, string> = { pending: '⏸️ PENDING', ready: '⏳ READY', countdown: '⏳ COUNTDOWN', in_progress: '🎮 PLAYING', completed: '✅ DONE', disputed: '⚖️ DISPUTED' };
			let status;
			switch (m.status) {
				case 'pending':
					status = statusMap.pending;
					break;
				case 'ready':
					status = statusMap.ready;
					break;
				case 'countdown':
					status = statusMap.countdown;
					break;
				case 'in_progress':
					status = statusMap.in_progress;
					break;
				case 'completed':
					status = statusMap.completed;
					break;
				case 'disputed':
					status = statusMap.disputed;
					break;
				default:
					status = '—';
			}
			const score = m.p1?.score !== undefined && m.p2?.score !== undefined ? `<div class="t-match-score">${m.p1?.score} - ${m.p2?.score}</div>` : '';
			return `
				<div class="t-match-card ${m.status === 'completed' ? 'completed' : (m.status === 'in_progress' ? 'active' : 'waiting')}">
					<div class="t-match-number">R${r}#${(m.indexInRound ?? 0) + 1}</div>
					<div class="t-match-players">
						<div class="t-match-player ${m.winner?.playerId === m.p1?.playerId ? 'winner' : ''}">${p1}${m.winner?.playerId === m.p1?.playerId ? '' : ''}</div>
						<div class="t-match-vs">VS</div>
						<div class="t-match-player ${m.winner?.playerId === m.p2?.playerId ? 'winner' : ''}">${p2}${m.winner?.playerId === m.p2?.playerId ? '' : ''}</div>
					</div>
					${score}
					<div class="t-match-status">${status}</div>
				</div>`;
		}).join('');
		return `<div class="t-bracket-round"><h4>Round ${r}</h4><div class="t-bracket-grid">${cards}</div></div>`;
	}).join('');

	return `<div class="t-bracket">${roundHtml}</div>`;
}

async function renderTournamentContent(): Promise<void> {
	const content = document.getElementById('tournamentContent');
	if (!content) return;
	const t = getTournament() ?? createTournament();

	if (t.status === 'setup') {
		renderSetup(content);
		return;
	}

	if (t.status === 'completed') {
		const champ = t.champion?.alias ? `<strong>${t.champion.alias}</strong>` : '—';
		content.innerHTML = `
			<p class="t-info-text"><strong>Tournament #</strong>${(() => {
				try {
					const ar = getArchive();
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
		document.getElementById('resetBtn')?.addEventListener('click', () => {
			resetEngine();
			renderTournamentContent();
		});
		document.getElementById('backBtn')?.addEventListener('click', () => {
			history.pushState({ page: 'gameSelect' }, '', '/gameSelect');
			setCurrentPage('gameSelect');
			renderApp();
		});
		return;
	}

	const current = t.currentMatch;
	// Ensure host plays on the left side when participating
	if (current) {
		const user = authService.getCurrentUser();
		const hostPid = user?.id ? `host-${user.id}` : undefined;
		if (hostPid && current.p2?.playerId === hostPid && current.p1?.playerId !== hostPid) {
			const tmp = current.p1;
			current.p1 = current.p2;
			current.p2 = tmp;
		}
	}
	const p1 = current?.p1;
	const p2 = current?.p2;
	const curLabel = current ? `${p1?.alias || '—'} vs ${p2?.alias || '—'}` : '(no current match)';

	content.innerHTML = `
		${(() => {
			try {
				const ar = getArchive();
				// If the current tournament is already archived, compute friendly index by createdAt asc
				const archivedIdx = ar.findIndex(a => a.tournamentId === t.tournamentId);
				if (archivedIdx >= 0) {
					const sorted = [...ar].sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
					const pos = sorted.findIndex((x: any) => x.tournamentId === t.tournamentId);
					const friendly = pos >= 0 ? pos + 1 : (archivedIdx + 1);
					return `<p class=\"t-info-text\"><strong>Tournament #</strong>${friendly}</p>`;
				}
				// Otherwise, show the next number after existing archive count
				const friendly = ar.length + 1;
				return `<p class=\"t-info-text\"><strong>Tournament #</strong>${friendly}</p>`;
			} catch {
				return `<p class=\"t-info-text\"><strong>Tournament #</strong>?</p>`;
			}
		})()}
		<p class="t-info-text"><strong>Status:</strong> ${t.status}</p>
		${current ? `<p class="t-info-text"><strong>Current Match:</strong> ${curLabel}</p>` : ''}
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
						<span id="player1Name" class="player1-name">${p1?.alias || 'Player 1'}</span>
						<span class="vs-text">vs</span>
						<span id="player2Name" class="player2-name">${p2?.alias || 'Player 2'}</span>
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
		const btn = document.getElementById('toggleGameBtn');
		if (!pure || !btn) return;
		if (!isGameActive) {
			console.log('⚠️ No active game to show/hide.');
			return;
		}
		const isVisible = pure.style.display !== 'none';
		if (isVisible) {
			pure.style.display = 'none';
			btn.textContent = 'Show Game';
		} else {
			pure.style.display = 'block';
			btn.textContent = 'Hide Game';
		}
	});

	document.getElementById('backBtn')?.addEventListener('click', () => {
		history.pushState({ page: 'gameSelect' }, '', '/gameSelect');
		setCurrentPage('gameSelect');
		renderApp();
	});

	document.getElementById('resetBtn')?.addEventListener('click', () => {
		if (confirm('Reset tournament?')) {
			cleanupActiveGame();
			resetEngine();
			renderTournamentContent();
		}
	});

	document.getElementById('archiveBtn')?.addEventListener('click', () => {
		openTournamentArchive();
	});

	const box = document.getElementById('currentMatchBox')!;
	if (!current) {
		box.innerHTML = '<p>No more matches. Tournament complete.</p>';
		return;
	}

  	await ensureMatchRoom(current);

	// Show joining instructions and per-player readiness
	const joinUrl = `${window.location.origin}/join/${current.roomId}`;
		box.innerHTML = `
			<p class="t-info-bold">Next up:</p>
			<div class="t-flex" style="gap:.5rem;">
				<div class="t-flex-1" id="p1Badge" style="color: rgb(255, 255, 255); font-weight: bold;">${p1?.alias || '—'}</div>
				<div class="t-flex-1" id="p2Badge" style="color: rgb(255, 255, 255); font-weight: bold;">${p2?.alias || '—'}</div>
			</div>
			<div style="margin-top:.5rem;">
				<div style="font-size:.9em; color: rgb(255, 255, 255); opacity:.9;">Room: <code>${current.roomId}</code></div>
				<div style="font-size:.9em; color: rgb(255, 255, 255); opacity:.9;">Share link: <a href="${joinUrl}" target="_blank" style="color: rgba(172, 204, 255, 1);">${joinUrl}</a></div>
			</div>
			<div class="t-flex" style="gap:.5rem; margin-top:.5rem;">
				<button id="p1ReadyBtn" class="btn btn-ready t-flex-1">Ready?</button>
				<button id="p2ReadyBtn" class="btn btn-ready t-flex-1">Ready?</button>
			</div>
			<div class="t-flex" style="gap:.5rem; margin-top:.5rem;">
				<button id="readyAndStartBtn" class="btn btn-start t-flex-1" disabled>Start when both ready</button>
			</div>
		`;

	const syncReadyButton = (btn: HTMLButtonElement | null, opts: { isReady: boolean; isAI: boolean; playerId?: string }) => {
		if (!btn) return;
		if (opts.playerId) btn.dataset.playerId = opts.playerId;
		const noPlayer = !opts.playerId;
		btn.disabled = opts.isAI || noPlayer;
		btn.classList.toggle('clicked', opts.isReady);
		btn.setAttribute('aria-pressed', opts.isReady ? 'true' : 'false');
		btn.textContent = opts.isReady ? 'Ready ✓' : 'Ready?';
	};

	const updateReadyUI = (room: any) => {
		const p1Btn = document.getElementById('p1ReadyBtn') as HTMLButtonElement | null;
		const p2Btn = document.getElementById('p2ReadyBtn') as HTMLButtonElement | null;
		const startBtn = document.getElementById('readyAndStartBtn') as HTMLButtonElement | null;

		// Map match participants to actual room indices to avoid index mismatches
		let p1Index = -1;
		let p2Index = -1;
		if (room?.players?.length) {
			p1Index = room.players.findIndex((rp: any) => rp.playerId === p1?.playerId);
			p2Index = room.players.findIndex((rp: any) => rp.playerId === p2?.playerId);
			if (p1Index === -1 && room.players[0]) p1Index = 0;
			if (p2Index === -1 && room.players[1]) p2Index = 1;
		}

		const p1State = (p1Index >= 0 ? room?.players?.[p1Index] : {}) || {};
		const p2State = (p2Index >= 0 ? room?.players?.[p2Index] : {}) || {};
		const p1IsAI = !!p1?.isAI;
		const p2IsAI = !!p2?.isAI;

		syncReadyButton(p1Btn, {
			isReady: !!p1State.isReady,
			isAI: p1IsAI,
			playerId: p1State.playerId
		});
		syncReadyButton(p2Btn, {
			isReady: !!p2State.isReady,
			isAI: p2IsAI,
			playerId: p2State.playerId
		});

		if (startBtn) startBtn.disabled = !(!!p1State.isReady && !!p2State.isReady);

		// Auto-ready AI if the server state isn't ready yet (failsafe)
		const token = authService.getToken();
		const autoReady = async (idx: 0 | 1, state: any) => {
			const isAI = idx === 0 ? p1IsAI : p2IsAI;
			if (!isAI || state.isReady || (state as any)._autoReadySent) return;
			try {
				(state as any)._autoReadySent = true;
				await fetch(`${getApiEndpoint()}/api/room/${current.roomId}/ready`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
					body: JSON.stringify({ playerId: state.playerId }),
				});
			} catch {}
		};
		if (room?.players?.length === 2) {
			void autoReady(0, p1State);
			void autoReady(1, p2State);
		}
	};

  	// Wire up WS to listen for gameStart and countdown
	const ws = initRoomWebSocket({
		roomId: current.roomId!,
		playerId: authService.getCurrentUser()?.id?.toString() || `viewer-${Date.now()}`,
		onConnect: () => {
			ws.requestState();
		},
		onCountdown: async () => {
			await startMatchCountdown(current.roomId!);
		},
		onGameStart: async (gameId) => {
			setMatchLiveInfo(current.matchId, { status: 'in_progress', gameId });
			const startBtn = document.getElementById('readyAndStartBtn') as HTMLButtonElement | null;
			if (startBtn) startBtn.disabled = true;
			await showTournamentGame(current, gameId);
		},
		onRoomState: (room) => {
			updateReadyUI(room);
		},
	});

	await ws.connect().catch(() => {});
	const initialRoom = getCurrentRoom();
	if (initialRoom) updateReadyUI(initialRoom);

	// Toggle ready handlers (only meaningful if this device controls that player)
	const postToggleReady = async (which: 'p1' | 'p2', button: HTMLButtonElement) => {
		const prevDisabled = button.disabled;
		button.disabled = true;
		try {
			const token = authService.getToken();
			const playerId = (button.dataset && button.dataset.playerId) ? String(button.dataset.playerId) : undefined;
			if (!playerId) return;

			const resp = await fetch(`${getApiEndpoint()}/api/room/${current.roomId}/ready`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
				body: JSON.stringify({ playerId }),
			});

			await resp.json();
			ws.requestState();
		} catch (e) { console.error(e); }
		finally {
			button.disabled = prevDisabled;
		}
	};

	const button1 = document.getElementById('p1ReadyBtn') as HTMLButtonElement;
	const button2 = document.getElementById('p2ReadyBtn') as HTMLButtonElement;
	button1.addEventListener('click', async () => postToggleReady('p1', button1));
	button2.addEventListener('click', async () => postToggleReady('p2', button2));

  	document.getElementById('readyAndStartBtn')?.addEventListener('click', async () => {
		try {
			const token = authService.getToken();
			const resp = await fetch(`${getApiEndpoint()}/api/room/${current.roomId}/start`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
				body: JSON.stringify({ hostId: getCurrentRoom()?.hostId })
			});
			const data = await resp.json();
			if (!data.success) alert(data.message || 'Failed to start');
			else setMatchLiveInfo(current.matchId, { status: 'countdown' });
		} catch (e) {
			console.error(e);
			alert('Failed to start match');
		}
	});
}

async function showTournamentGame(match: TournamentMatch, gameId: number): Promise<void> {
	const gameContainer = document.getElementById('tournamentGameContainer');
	if (!gameContainer) return;
	gameContainer.style.display = 'block';
	isGameActive = true;

	if (activeTournamentGame) {
		cleanupGame(activeTournamentGame);
		await activeTournamentGame.endGame();
		activeTournamentGame = undefined;
	}

	activeTournamentGame = new PongGame();
	activeTournamentGame.gameId = gameId;
	const room = getCurrentRoom();
	const p1Name = match.p1?.alias || room?.players?.[0]?.alias || 'Player 1';
	const p2Name = match.p2?.alias || room?.players?.[1]?.alias || 'Player 2';
	(document.getElementById('player1Name') || { textContent: '' }).textContent = p1Name;
	(document.getElementById('player2Name') || { textContent: '' }).textContent = p2Name;

	setTimeout(async () => {
		if (!activeTournamentGame) return;
		await setGameScreen(activeTournamentGame);
		activeTournamentGame.onGameEnd = async (winnerIdx) => {
			const p1Score = activeTournamentGame?.gameState?.players?.[0]?.score || 0;
			const p2Score = activeTournamentGame?.gameState?.players?.[1]?.score || 0;
			const winner = winnerIdx === 1 ? match.p1 : match.p2;
			const loserId = winnerIdx === 1 ? match.p2?.playerId : match.p1?.playerId;
			if (winner?.playerId)
				advanceAfterResult(match.matchId, winner.playerId, p1Score, p2Score);
			const gc = document.getElementById('tournamentGameContainer');
			if (gc) gc.style.display = 'none';
			const bracket = document.getElementById('bracketSection');
			if (bracket) bracket.style.display = 'block';
			cleanupActiveGame();
			renderTournamentContent();
		};
		updateConnectionStatus('Spectating', true);

		try {
			const room = getCurrentRoom();
			const p1 = match.p1;
			const p2 = match.p2;

			const bothLocal = !!(p1?.isLocal && p2?.isLocal);

			const bindKeys = (ws: RoomWebSocketManager, keysSet: Set<string>) => {
				const keys: Record<string, boolean> = {};
				const onDown = (e: KeyboardEvent) => {
					const k = e.key.toLowerCase();
					if (!keysSet.has(k)) return;
					if (!keys[k]) { keys[k] = true; e.preventDefault(); ws.sendKeyState(k, true, false); }
				};
				const onUp = (e: KeyboardEvent) => {
					const k = e.key.toLowerCase();
					if (!keysSet.has(k)) return;
					keys[k] = false; ws.sendKeyState(k, false, false);
				};
				document.addEventListener('keydown', onDown);
				document.addEventListener('keyup', onUp);
				return () => {
					document.removeEventListener('keydown', onDown);
					document.removeEventListener('keyup', onUp);
				};
			};

			if (room && match.roomId) {
				if (bothLocal && p1?.playerId && p2?.playerId) {
					// Two local players: open two room WS connections
					const ws1 = new RoomWebSocketManager({
						roomId: match.roomId,
						playerId: p1.playerId,
						onConnect: () => { updateConnectionStatus('Connected (Room)', true); ws1.requestState(); },
						onDisconnect: () => { updateConnectionStatus('Disconnected', false); }
					});
					const ws2 = new RoomWebSocketManager({
						roomId: match.roomId,
						playerId: p2.playerId,
						onDisconnect: () => { /* secondary disconnect */ }
					});

					// Track primary in game, secondary in module var
					activeTournamentGame.roomWS = ws1;
					tournamentSecondaryWS = ws2;

					// Bind keys: P1=W/S to ws1, P2=O/L to ws2
					const cleanup1 = bindKeys(ws1, new Set(['w', 's']));
					const cleanup2 = bindKeys(ws2, new Set(['o', 'l']));
					tournamentControlsCleanup = () => { cleanup1(); cleanup2(); };

					try { await ws1.connect(); } catch {}
					try { await ws2.connect(); } catch {}
				} else {
					// Single local player controls one seat
					let controlPlayerId: string | undefined;
					let keyset: Set<string> | undefined;
					if (p1?.isLocal && p1?.playerId) { controlPlayerId = p1.playerId; keyset = new Set(['w','s']); }
					else if (p2?.isLocal && p2?.playerId) { controlPlayerId = p2.playerId; keyset = new Set(['o','l']); }

					if (controlPlayerId && keyset) {
						activeTournamentGame.roomWS = initRoomWebSocket({
							roomId: match.roomId,
							playerId: controlPlayerId,
							onConnect: () => {
								updateConnectionStatus('Connected (Room)', true);
								if (activeTournamentGame?.roomWS) {
									activeTournamentGame.roomWS.requestState();
									const cleanup = bindKeys(activeTournamentGame.roomWS, keyset!);
									tournamentControlsCleanup = () => { cleanup(); };
								}
							},
							onDisconnect: () => {
								updateConnectionStatus('Disconnected', false);
								if (tournamentControlsCleanup) { tournamentControlsCleanup(); tournamentControlsCleanup = undefined; }
							}
						});

						try { await activeTournamentGame.roomWS.connect(); } catch {}
					} else {
						// Spectator view only
						updateConnectionStatus('Spectating', true);
					}
				}
			} else {
				// Spectator view only
				updateConnectionStatus('Spectating', true);
			}
		} catch (e) {
			console.warn('Controls setup skipped:', e);
		}
	}, 50);
}

function cleanupActiveGame(): void {
	if (activeTournamentGame) {
		cleanupGame(activeTournamentGame);
		activeTournamentGame = undefined;
	}
	if (tournamentSecondaryWS) {
		try { tournamentSecondaryWS.disconnect(); } catch {}
		tournamentSecondaryWS = null;
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
	`;
	await renderTournamentContent();
}

export function cleanupTournamentPage(): void {
	cleanupActiveGame();
}

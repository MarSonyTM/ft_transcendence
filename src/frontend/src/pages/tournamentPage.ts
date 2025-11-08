import { setCurrentPage } from '../utils/globalState';
import { renderApp } from '../main';
import { PongGame } from '../game/PongGame';
import { authService } from '../utils/auth';
import { initRoomWebSocket, RoomWebSocketManager } from '../utils/roomWebSocket';
import { setGameScreen, cleanupGame } from '../utils/gameUtils';
import { getCurrentRoom, setCurrentRoom } from '../utils/roomState';
import { TournamentMatch, Tournament, TPT } from '../../../shared/tournamentTypes';
import { openTournamentArchive } from '../utils/tournamentArchive';
import {
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
import { GameState } from '../../../shared/gameTypes';

let activeTournamentGame: PongGame | undefined = undefined;
let isGameActive = false;
let tournamentWS: RoomWebSocketManager | undefined = undefined;
let tournamentControlsCleanup: (() => void) | undefined = undefined;

function getApiEndpoint(): string {
	return (window.__INITIAL_STATE__?.apiEndpoint || '').replace(/\/$/, '');
}

function addPlayerToTournament(t: Tournament, opts: { name: string; tpt: TPT; isReady?: boolean }) {
	const id = Date.now() + Math.floor(Math.random() * 1000);
	const p: any = {
		id,
		name: opts.name,
		tpt: opts.tpt,
		isReady: !!opts.isReady,
	};
	try {
		const rand = Math.random().toString(36).slice(2, 6);
		(p as any).identity = `${opts.tpt}-${t.tId}-${id}-${rand}`;
	} catch { /* noop */ }
	(t.players as any).push(p);
	return p;
}

export async function renderSetup(content: HTMLElement): Promise<void> {
	const t = getTournament() ?? createTournament();
	content.innerHTML = `
		<p class="t-msg">Create a new tournament</p>
		<div class="t-setup">
		<div class="t-flex-1">
			<button id="addLocalBtn" class="btn btn-add">🎮 Add Local Player</button>
			<button id="addAIBtn" class="btn btn-add">🤖 Add AI Player</button>
			<button id="addRemoteBtn" class="btn btn-add">🌐 Invite Remote Player?</button>
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
				let tag: string = '';
				switch (p.tpt) {
					case 'ai':
						tag = '🤖';
						break;
					case 'local':
						tag = '🎮';
						break;
					case 'remote':
						tag = '🌐';
						break;
					case 'host':
						tag = '👑';
						break;
				}
				return `<li class="t-alias-item"><span class="t-alias-name">${p.name} ${tag}</span></li>`;
			}).join('');
		}
	};
	rerender();

	let curT = getTournament();
	if (!curT) return;

	document.getElementById('addLocalBtn')?.addEventListener('click', () => {
		let x = curT.players.filter(p => p.tpt === 'local').length || 0;
		const alias = prompt('Local player alias', `Local_${x + 1}`)?.trim();
		if (!alias) return;
		addPlayerToTournament(curT, { name: alias, tpt: 'local', isReady: false });
		rerender();
	});

	document.getElementById('addAIBtn')?.addEventListener('click', () => {
		let x = curT.players.filter(p => p.tpt === 'ai').length || 0;
		const alias = `AI_${x + 1}`;
		if (!alias) return;
		addPlayerToTournament(curT, { name: alias, tpt: 'ai', isReady: true });
		rerender();
	});

	document.getElementById('addRemoteBtn')?.addEventListener('click', () => {//TODO:X test remote adding, maybe invite friend?
		const alias = prompt('Remote player alias', `Remote_${(curT.players.length ?? 0) + 1}`)?.trim();
		if (!alias) return;
		addPlayerToTournament(curT, { name: alias, tpt: 'remote', isReady: false });
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
	const p1 = getPlayerById(match.p1?.id!);
	const p2 = getPlayerById(match.p2?.id!);
	const hostId = p1?.tpt === 'host' ? p1!.id.toString() : p2?.tpt === 'host' ? p2!.id.toString() : currentUser?.id?.toString() || `host-${Date.now()}`;
	const hostUsername = currentUser?.username || 'Host';

	const desiredHostId = hostId;
	const desiredHostName = p1?.name || hostUsername;

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
			difficulty: 'normal'
		})
	});
	const data = await resp.json();
	if (!data.success || !data.data?.room) throw new Error('Failed to create room');
	const room = data.data.room;
	setCurrentRoom(room);
	match.roomId = room.roomId;
	setMatchLiveInfo(match.matchId, { roomId: room.roomId });

	const joinIfAuto = async (name: string, id: string, tpt: TPT) => {
		if (!tpt) return;
		if (room.hostId === id) return;
		try {
			const resp = await fetch(`${getApiEndpoint()}/api/room/${room.roomId}/join`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${authService.getToken()}`
				},
				body: JSON.stringify({
					id,
					name,
					tpt
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

	if (p1) await joinIfAuto(p1.name || `Player_${p1.id}`, p1.id.toString(), p1.tpt);
	if (p2) await joinIfAuto(p2.name || `Player_${p2.id}`, p2.id.toString(), p2.tpt);
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
	if (!t.matches) return '<div class="t-bracket-grid"></div>';
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
			const p1 = m.p1?.id ? (getPlayerById(m.p1?.id)?.name || '—') : '—';
			const p2 = m.p2?.id ? (getPlayerById(m.p2?.id)?.name || '—') : '—';
			const statusMap: Record<string, string> = { pending: '⏸️ PENDING', ready: '⏳ READY', countdown: '⏳ COUNTDOWN', in_progress: '🎮 PLAYING', completed: '✅ DONE' };
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
				default:
					status = '—';
			}
			const score = m.p1?.score !== undefined && m.p2?.score !== undefined ? `<div class="t-match-score">${m.p1?.score} - ${m.p2?.score}</div>` : '';
			return `
				<div class="t-match-card ${m.status === 'completed' ? 'completed' : (m.status === 'in_progress' ? 'active' : 'waiting')}">
					<div class="t-match-number">R${r}#${(m.indexInRound ?? 0) + 1}</div>
					<div class="t-match-players">
						<div class="t-match-player ${m.winner?.id === m.p1?.id ? 'winner' : ''}">${p1}${m.winner?.id === m.p1?.id ? '' : ''}</div>
						<div class="t-match-vs">VS</div>
						<div class="t-match-player ${m.winner?.id === m.p2?.id ? 'winner' : ''}">${p2}${m.winner?.id === m.p2?.id ? '' : ''}</div>
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
		const champ = t.champion?.name ? `<strong>${t.champion.name}</strong>` : '—';
		content.innerHTML = `
			<p class="t-info-text"><strong>Tournament #</strong>${(() => {
				try {
					const ar = getArchive();
					const sorted = [...ar].sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
					const pos = sorted.findIndex((x: any) => x.tournamentId === t.tId);
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

	if (t.curMatch) {
		if (t.curMatch.p2 && t.curMatch.p2.tpt === 'host' && t.curMatch.p1 && t.curMatch.p1.tpt !== 'host') {
			const tmp = t.curMatch.p1;
			t.curMatch.p1 = t.curMatch.p2;
			t.curMatch.p2 = tmp;
		}
	}
	const p1 = t.curMatch?.p1;
	const p2 = t.curMatch?.p2;
	const curLabel = t.curMatch ? `${p1?.name || '—'} vs ${p2?.name || '—'}` : '(no current match)';

	content.innerHTML = `
		${(() => {
			try {
				const ar = getArchive();
				// If the current tournament is already archived, compute friendly index by createdAt asc
				const archivedIdx = ar.findIndex(a => a.tId === t.tId);
				if (archivedIdx >= 0) {
					const sorted = [...ar].sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
					const pos = sorted.findIndex((x: any) => x.tId === t.tId);
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
		${t.curMatch ? `<p class="t-info-text"><strong>Current Match:</strong> ${curLabel}</p>` : ''}
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
	if (!t.curMatch) {
		if (t.champion) {
			box.innerHTML = '<p>No more matches. Tournament complete.</p>';
		} else if ((t.players?.length || 0) < 3) {
			box.innerHTML = '<p>Add at least 3 players and click Start.</p>';
		} else {
			box.innerHTML = '<p>Bracket is preparing. Please wait…</p>';
		}
		return;
	}

	await ensureMatchRoom(t.curMatch);

	// try {
	// 	const tState = getTournament();
	// 	const navKey = tState ? `${tState.tId}:${current.matchId}` : `:${current.matchId}`;
	// 	const lastNav = sessionStorage.getItem('tournament-auto-lobby');
	// 	if (current.roomId && lastNav !== navKey) {
	// 		sessionStorage.setItem('pendingRoomJoin', current.roomId);
	// 		sessionStorage.setItem('tournament-auto-lobby', navKey);
	// 		history.pushState({ page: 'lobby' }, '', '/lobby');
	// 		setCurrentPage('lobby');
	// 		renderApp();
	// 		return;
	// 	}
	// } catch { /* ignore auto-nav errors */ }

	// Show joining instructions and per-player readiness
	const joinUrl = `${window.location.origin}/join/${t.curMatch.roomId}`;
		box.innerHTML = `
			<p class="t-info-bold">Next up:</p>
			<div class="t-flex" style="gap:.5rem;">
				<div class="t-flex-1" id="p1Badge" style="color: rgb(255, 255, 255); font-weight: bold;">${p1?.name || '—'}</div>
				<div class="t-flex-1" id="p2Badge" style="color: rgb(255, 255, 255); font-weight: bold;">${p2?.name || '—'}</div>
			</div>
			<div style="margin-top:.5rem;">
				<div style="font-size:.9em; color: rgb(255, 255, 255); opacity:.9;">Room: <code>${t.curMatch.roomId}</code></div>
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

	const updateReadyUI = (room: TournamentMatch) => {
		if (!room) return;
		const p1 = room.p1!;
		const p2 = room.p2!;

		const p1Btn = document.getElementById('p1ReadyBtn') as HTMLButtonElement | null;
		const p2Btn = document.getElementById('p2ReadyBtn') as HTMLButtonElement | null;
		const startBtn = document.getElementById('readyAndStartBtn') as HTMLButtonElement | null;

		syncReadyButton(p1Btn, {
			playerId: p1.id.toString(),
			isAI: p1.tpt === 'ai',
			isReady: p1.isReady === undefined ? p1.tpt === 'ai' ? true : false : p1.isReady,
		});
		syncReadyButton(p2Btn, {
			playerId: p2.id.toString(),
			isAI: p2.tpt === 'ai',
			isReady: p2.isReady === undefined ? p2.tpt === 'ai' ? true : false : p2.isReady
		});

		if (startBtn) startBtn.disabled = !(!!p1.isReady && !!p2.isReady);

		// Auto-ready AI if the server state isn't ready yet (failsafe)
		const token = authService.getToken();
		const autoReady = async (idx: 0 | 1, state: any) => {
			const isAI = idx === 0 ? p1.tpt === 'ai' : p2.tpt === 'ai';
			if (!isAI || state.isReady || (state as any)._autoReadySent) return;
			try {
				(state as any)._autoReadySent = true;
				await fetch(`${getApiEndpoint()}/api/room/${t.curMatch?.roomId}/ready`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
					body: JSON.stringify({ playerId: state.playerId }),
				});
			} catch {}
		};
		if (p1 && p2) {
			void autoReady(0, p1);
			void autoReady(1, p2);
		}
	};

  	// Wire up WS to listen for gameStart and countdown
	const ws = initRoomWebSocket({
		roomId: t.curMatch.roomId!,
		playerId: authService.getCurrentUser()?.id?.toString() || `viewer-${Date.now()}`,
		onConnect: () => {
			ws.requestState();
		},
		onCountdown: async () => {
			await startMatchCountdown(t.curMatch?.roomId!);
		},
		onGameStart: async (gameId) => {
			if (!t.curMatch) return;
			setMatchLiveInfo(t.curMatch.matchId, { status: 'in_progress', gameId });
			const startBtn = document.getElementById('readyAndStartBtn') as HTMLButtonElement | null;
			if (startBtn) startBtn.disabled = true;
			await showTournamentGame(t.curMatch, gameId);
		},
		onRoomState: (room) => {
			updateReadyUI(room);
		},
	});

	await ws.connect().catch(() => {});
	const initialRoom = getTournament()?.curMatch;
	if (initialRoom) updateReadyUI(initialRoom);

	// Toggle ready handlers (only meaningful if this device controls that player)
	const postToggleReady = async (which: 'p1' | 'p2', button: HTMLButtonElement) => {
		const prevDisabled = button.disabled;
		button.disabled = true;
		try {
			const token = authService.getToken();
			const playerId = (button.dataset && button.dataset.playerId) ? String(button.dataset.playerId) : undefined;
			if (!playerId) return;

			const resp = await fetch(`${getApiEndpoint()}/api/room/${t.curMatch?.roomId}/ready`, {
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
			const resp = await fetch(`${getApiEndpoint()}/api/room/${t.curMatch!.roomId}/start`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
				body: JSON.stringify({ hostId: getCurrentRoom()?.hostId })
			});
			const data = await resp.json();
			if (!t.curMatch) return;
			if (!data.success) alert(data.message || 'Failed to start');
			else setMatchLiveInfo(t.curMatch.matchId, { status: 'countdown' });
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

	if (!activeTournamentGame)
		activeTournamentGame = new PongGame();
	activeTournamentGame.gameId = gameId;
	const room = getCurrentRoom();
	if (!room) return;
	const p1Name = match.p1?.name || room?.players?.[0]?.name || 'Player 1';
	const p2Name = match.p2?.name || room?.players?.[1]?.name || 'Player 2';
	(document.getElementById('player1Name') || { textContent: '' }).textContent = p1Name;
	(document.getElementById('player2Name') || { textContent: '' }).textContent = p2Name;

	setTimeout(async () => {
		if (!activeTournamentGame) return;
		await setGameScreen(activeTournamentGame);
		activeTournamentGame.onGameEnd = async (winnerIdx) => {
			const p1Score = activeTournamentGame?.gameState?.players?.[0]?.score || 0;
			const p2Score = activeTournamentGame?.gameState?.players?.[1]?.score || 0;
			const winner = winnerIdx === 1 ? match.p1 : match.p2;
			if (winner?.id)
				advanceAfterResult(match.matchId, winner.id, p1Score, p2Score);
			const gc = document.getElementById('tournamentGameContainer');
			if (gc) gc.style.display = 'none';
			const bracket = document.getElementById('bracketSection');
			if (bracket) bracket.style.display = 'block';
			cleanupActiveGame();
			renderTournamentContent();
		};

		try {
			const room = getCurrentRoom();
			const p1 = match.p1;
			const p2 = match.p2;

			const bothLocal = !!(p1?.tpt === 'local' && p2?.tpt === 'local');

			const bindKeys = (ws: RoomWebSocketManager, keysSet: Set<string>) => {
				const keys: Record<string, boolean> = {};
				const onDown = (e: KeyboardEvent) => {
					const k = e.key.toLowerCase();
					if (!keysSet.has(k)) return;
					if (!keys[k]) {
						keys[k] = true;
						e.preventDefault();
						ws.sendKeyState(k, true, false);
					}
				};
				const onUp = (e: KeyboardEvent) => {
					const k = e.key.toLowerCase();
					if (!keysSet.has(k)) return;
					keys[k] = false;
					ws.sendKeyState(k, false, false);
				};
				document.addEventListener('keydown', onDown);
				document.addEventListener('keyup', onUp);
				return () => {
					document.removeEventListener('keydown', onDown);
					document.removeEventListener('keyup', onUp);
				};
			};

			if (room && match.roomId && p1 && p2) {
				// if (bothLocal && p1 && p2) {
				activeTournamentGame.roomWS = initRoomWebSocket({
					roomId: match.roomId,
					playerId: p1.id.toString(),
					onConnect: () => {
						activeTournamentGame?.roomWS?.requestState();
						const keys: Record<string, boolean> = {};
						const movement = new Set(['w','s','o','l']);
						const releaseAll = () => {
							for (const k of Object.keys(keys)) {
								if (keys[k]) {
									const isGuest = (k === 'o' || k === 'l');
									activeTournamentGame?.roomWS?.sendKeyState(k, false, isGuest);
									keys[k] = false;
								}
							}
						};
						const onDown = (e: KeyboardEvent) => {
							const k = e.key.toLowerCase();
							if (!movement.has(k)) return;
							if (!keys[k]) {
								keys[k] = true;
								e.preventDefault();
								const isGuest = (k === 'o' || k === 'l');
								activeTournamentGame?.roomWS?.sendKeyState(k, true, isGuest);
							}
						};
						const onUp = (e: KeyboardEvent) => {
							const k = e.key.toLowerCase();
							if (!movement.has(k)) return;
							keys[k] = false;
							const isGuest = (k === 'o' || k === 'l');
							activeTournamentGame?.roomWS?.sendKeyState(k, false, isGuest);
						};
						
						document.addEventListener('keydown', onDown);
						document.addEventListener('keyup', onUp);
						return () => {
							document.removeEventListener('keydown', onDown);
							document.removeEventListener('keyup', onUp);
						};
					},
					onDisconnect: () => { /* noop */ }
				});

				try { await activeTournamentGame.roomWS.connect(); } catch {}
				// } else {
				// 	// Single local player controls one seat
				// 	let controlPlayerId: string | undefined;
				// 	let keyset: Set<string> | undefined;
				// 	if (p1 && p1.tpt === 'local') {
				// 		controlPlayerId = p1.id.toString();
				// 		keyset = new Set(['w','s']);
				// 	}
				// 	else if (p2 && p2.tpt === 'local') {
				// 		controlPlayerId = p2.id.toString();
				// 		keyset = new Set(['o','l']);
				// 	}

				// 	if (controlPlayerId && keyset) {
				// 		activeTournamentGame.roomWS = initRoomWebSocket({
				// 			roomId: match.roomId,
				// 			playerId: controlPlayerId,
				// 			onConnect: () => {
				// 				if (activeTournamentGame?.roomWS) {
				// 					activeTournamentGame.roomWS.requestState();
				// 					const cleanup = bindKeys(activeTournamentGame.roomWS, keyset!);
				// 					tournamentControlsCleanup = () => { cleanup(); };
				// 				}
				// 			},
				// 			onDisconnect: () => {
				// 				if (tournamentControlsCleanup) {
				// 					tournamentControlsCleanup();
				// 					tournamentControlsCleanup = undefined;
				// 				}
				// 			}
				// 		});

				// 		try { await activeTournamentGame.roomWS.connect(); } catch {}
				// 	}
				// }
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
	if (tournamentWS) {
		try { tournamentWS.disconnect(); } catch {}
		tournamentWS = undefined;
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

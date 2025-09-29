import {
	SerializedTournamentState as TournamentState,
	TournamentSummary,
	SerializedMatchHistoryItem,
	SerializedPlayer
} from '../../shared/tournamentTypes';

let pendingAliases: string[] = [];

export const currentMatchPlayers: { left?: string; right?: string } = {};

let scoreboardUpdateFn: (() => void) | null = null;
export function registerScoreboardUpdater(fn: () => void) {
	scoreboardUpdateFn = fn;
}

function updateScoreboardNames() {
	if (scoreboardUpdateFn) scoreboardUpdateFn();
}

function getApiEndpoint(): string {
	return (window.__INITIAL_STATE__?.apiEndpoint || '').replace(/\/$/, '');
}

async function fetchTournamentState(): Promise<TournamentState | null> {
	try {
		const res = await fetch(`${getApiEndpoint()}/api/tournament/state`);
		const data = await res.json();
		if (!data.success) return null;
		return data.data as TournamentState;
	} catch {
		return null;
	}
}

async function fetchTournamentList(): Promise<TournamentSummary[]> {
	try {
		const res = await fetch(`${getApiEndpoint()}/api/tournament/list`);
		const data = await res.json();
		if (!data.success) return [];
		return data.data as TournamentSummary[];
	} catch {
		return [];
	}
}

async function fetchTournamentById(id: number): Promise<TournamentState | null> {
	try {
		const res = await fetch(`${getApiEndpoint()}/api/tournament/${id}`);
		const data = await res.json();
		if (!data.success) return null;
		return data.data as TournamentState;
	} catch {
		return null;
	}
}

async function startTournament(aliases: string[]): Promise<void> {
	await fetch(`${getApiEndpoint()}/api/tournament/start`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ aliases })
	});
	await renderTournament();
}

async function submitMatchResult(winnerAlias: string): Promise<void> {
	await fetch(`${getApiEndpoint()}/api/tournament/result`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ winnerAlias })
	});
	await renderTournament();
}

async function resetTournament(): Promise<void> {
	await fetch(`${getApiEndpoint()}/api/tournament/reset`, { method: 'POST' });
	await renderTournament();
}

export function toggleTournaments(): void {
	const root = document.getElementById('tournamentRoot');
	const btn = document.getElementById('tournamentsBtn');
	if (!root) return;
	const hidden = root.style.display === 'none' || root.style.display === '';
	if (hidden) {
		if (!root.dataset.mounted) {
			mountTournamentUI();
			root.dataset.mounted = '1';
		}
		root.style.display = 'block';
		if (btn) btn.textContent = 'Hide Tournaments';
	} else {
		root.style.display = 'none';
		if (btn) btn.textContent = 'Show Tournaments';
	}
}

export function mountTournamentUI(): void {
	const root = document.getElementById('tournamentRoot');
	if (root) {
		root.innerHTML =
			`<div class="t-section">
				<div class="t-header">
					<h2 class="t-title">Tournaments</h2>
					<div class="t-header-actions">
						<button id="allTournamentsBtn" class="btn btn-secondary btn-archive">All</button>
					</div>
				</div>
				<div id="tournamentContent" class="t-content">Loading...</div>
			</div>`;
		const allBtn = document.getElementById('allTournamentsBtn');
		if (allBtn) allBtn.addEventListener('click', openTournamentArchive);
		renderTournament();
	}
}

let archiveModalEl: HTMLDivElement | null = null;

async function openTournamentArchive(): Promise<void> {
	if (!archiveModalEl) {
		archiveModalEl = document.createElement('div');
		archiveModalEl.id = 'tArchiveModal';
		archiveModalEl.className = 't-archive-modal';
		archiveModalEl.innerHTML =
			`<div class="t-archive-backdrop" data-close="1"></div>
			<div class="t-archive-dialog">
				<div class="t-archive-header">
					<h3>All Tournaments</h3>
					<button class="btn btn-close-archive" data-close="1">✕</button>
				</div>
				<div class="t-archive-body">
					<div class="t-archive-list" id="tArchiveList">Loading...</div>
					<div class="t-archive-detail" id="tArchiveDetail">
						<p class="t-archive-hint">Select a tournament to view details.</p>
					</div>
				</div>
			</div>`;
		document.body.appendChild(archiveModalEl);
		archiveModalEl.addEventListener('click', (e) => {
			const target = e.target as HTMLElement;
			if (target.dataset.close === '1') closeTournamentArchive();
		});
	}
	archiveModalEl.style.display = 'block';
	await populateArchiveList();
}

function closeTournamentArchive(): void {
	if (archiveModalEl) archiveModalEl.style.display = 'none';
}

async function populateArchiveList(): Promise<void> {
	const list = await fetchTournamentList();
	const listEl = document.getElementById('tArchiveList');
	if (!listEl) return;
	if (!list.length) {
		listEl.innerHTML = `<p class="t-archive-empty">No tournaments yet.</p>`;
		return;
	}
	listEl.innerHTML =
		`<ul class="t-archive-ul">
			${list.map(t =>
				`<li class="t-archive-item">
					<button class="t-archive-row" data-id="${t.id}">
						<span class="t-arch-id">#${t.id}</span>
						<span class="t-arch-status ${t.status}">${t.status}</span>
						<span class="t-arch-meta">${new Date(t.createdAt).toLocaleString()}</span>
						<span class="t-arch-players">${t.players} players</span>
						<span class="t-arch-matches">${t.matches} matches</span>
						${t.championId ? `<span class="t-arch-champion">🏆</span>` : ''}
					</button>
				</li>
			`).join('')}
		</ul>`;
	listEl.querySelectorAll<HTMLButtonElement>('button[data-id]').forEach(btn => {
		btn.addEventListener('click', async () => {
			const id = Number(btn.dataset.id);
			await showTournamentDetail(id);
		});
	});
}

async function showTournamentDetail(id: number): Promise<void> {
	const detailEl = document.getElementById('tArchiveDetail');
	if (!detailEl) return;
	detailEl.innerHTML = `<p class="t-archive-loading">Loading tournament #${id}...</p>`;
	const data = await fetchTournamentById(id);
	if (!data) {
		detailEl.innerHTML = `<p class="t-archive-error">Failed to load tournament.</p>`;
		return;
	}
	const playersHtml = data.players.map((p: SerializedPlayer) =>
	`<li>${p.alias} ${p.eliminated ? '✖' : ''} (${p.wins}W-${p.losses}L)</li>`).join('');
	const historyHtml = data.matchHistory.length
	? data.matchHistory.map((h: SerializedMatchHistoryItem) => {
		const p1 = h.player1 || '?';
		const p2 = h.player2 || '?';
		const w = h.winner || '?';
		return `<li>#${h.matchId} ${p1} vs ${p2} → <strong>${w}</strong></li>`;
	}).join('')
	: '<li>(no matches)</li>';
	const champName = data.championAlias ||
	(data.championId ? data.players.find((p: SerializedPlayer) => p.id === data.championId)?.alias : null);

	detailEl.innerHTML = 
		`<div class="t-archive-detail-inner">
			<h4>Tournament #${data.id}</h4>
			<p>Status: <strong>${data.status}</strong> ${champName ? ` | Champion: <strong>${champName}</strong>` : ''}</p>
			<details open>
				<summary><strong>Players (${data.players.length})</strong></summary>
				<ul class="t-archive-players">${playersHtml}</ul>
			</details>
			<details open>
				<summary><strong>Match History (${data.matchHistory.length})</strong></summary>
				<ul class="t-archive-history">${historyHtml}</ul>
			</details>
		</div>`;
}

export async function renderTournament(): Promise<void> {
	const content = document.getElementById('tournamentContent');
	if (!content) return;
	const state = await fetchTournamentState();

	if (!state) {
		content.innerHTML =
			`<p class="t-msg">No active tournament.</p>
			<div class="t-setup">
				<form id="aliasForm" class="t-alias-form" autocomplete="off">
					<input id="aliasInput" type="text" placeholder="Name" class="t-alias-input"></input>
					<button type="submit" class="btn btn-submit">Add</button>
				</form>
				<ul id="pendingAliasesList" class="t-alias-list"></ul>
				<div class="t-actions">
					<button id="clearAliasesBtn" class="btn btn-pause" disabled>Clear</button>
					<button id="startTournamentBtn" class="btn btn-start" disabled>Start Tournament</button>
				</div>
			</div>`;

		const form = document.getElementById('aliasForm') as HTMLFormElement | null;
		const input = document.getElementById('aliasInput') as HTMLInputElement | null;
		const listEl = document.getElementById('pendingAliasesList') as HTMLUListElement | null;
		const clearBtn = document.getElementById('clearAliasesBtn') as HTMLButtonElement | null;
		const startBtn = document.getElementById('startTournamentBtn') as HTMLButtonElement | null;

		function refreshPending(): void {
			if (!listEl || !startBtn || !clearBtn) return;
			if (pendingAliases.length === 0)
				listEl.innerHTML = `<li class="empty">No players added yet.</li>`;
			else {
				listEl.innerHTML = pendingAliases.map(a =>
					`<li class="t-alias-item">
						<span class="t-alias-name">${a}</span>
						<button type="button" data-remove="${a}" class="btn btn-remove-alias" title="Remove ${a}">×</button>
					</li>`).join('');
			}
			startBtn.disabled = pendingAliases.length < 2;
			clearBtn.disabled = pendingAliases.length === 0;

			listEl.querySelectorAll('button[data-remove]').forEach(btn => {
				btn.addEventListener('click', () => {
					const alias = (btn as HTMLButtonElement).dataset.remove!;
					pendingAliases = pendingAliases.filter(p => p !== alias);
					refreshPending();
				});
			});
		}

		if (form && input) {
			form.addEventListener('submit', e => {
				e.preventDefault();
				const alias = input.value.trim();
				if (!alias) return;
				const exists = pendingAliases.some(a => a.toLowerCase() === alias.toLowerCase());
				if (exists) {
					input.value = '';
					input.placeholder = 'Alias already added';
					setTimeout(() => input.placeholder = 'Name', 3000);
					return;
				}
				pendingAliases.push(alias);
				input.value = '';
				refreshPending();
			});
		}

		if (clearBtn) {
			clearBtn.addEventListener('click', () => {
				if (pendingAliases.length && confirm('Clear all pending players?')) {
					pendingAliases = [];
					refreshPending();
				}
			});
		}

		if (startBtn) {
			startBtn.addEventListener('click', async () => {
				if (pendingAliases.length < 2) return;
				await startTournament(pendingAliases);
				pendingAliases = [];
			});
		}

		refreshPending();
		return;
	}

	const curMatch = state.currentMatch && state.currentMatch.player1 && state.currentMatch.player2
	? `${state.currentMatch.player1.alias} vs ${state.currentMatch.player2.alias}`
	: '(waiting for players)';

	const queueList = state.queue.length ? state.queue.join(', ') : '(empty)';
	const historyHtml = state.matchHistory.slice(-5).map((h: SerializedMatchHistoryItem) =>
	`<li>${h.player1} vs ${h.player2} → <strong>${h.winner}</strong></li>`
	).join('') || '<li>(none yet)</li>';

	let winnerButtons = '';
	if (state.currentMatch && state.currentMatch.player1 && state.currentMatch.player2 && state.status === 'in_progress') {
		winnerButtons =
			`<div style="display:flex; gap:.5rem; margin-top:.5rem;">
				<button data-winner="${state.currentMatch.player1.alias}" class="btn btn-start" style="flex:1;">${state.currentMatch.player1.alias} won</button>
				<button data-winner="${state.currentMatch.player2.alias}" class="btn btn-start" style="flex:1;">${state.currentMatch.player2.alias} won</button>
			</div>`;
	}

	const championAlias = state.championAlias ||
	(state.championId ? state.players.find((p: SerializedPlayer) => p.id === state.championId)?.alias : null);

	const showMatch = state.status !== 'completed';

	const showQueue = state.queue.length > 0;

	const showWinner = state.status == 'completed';

	content.innerHTML =
		`<p style="margin:.2rem 0;"><strong>Tournament #</strong>${state.id}</p>
		<p style="margin:.2rem 0;"><strong>Status:</strong> ${state.status}</p>
		${showWinner ? `<p style="margin:.4rem 0;"><strong>Winner:</strong> ${championAlias}</p>` : ''}
		${showMatch ? `<p style=\"margin:.2rem 0;\"><strong>Current Match:</strong> ${curMatch}</p>` : ''}
		${showQueue ? `<p style=\"margin:.2rem 0;\"><strong>Queue:</strong> ${queueList}</p>` : ''}
		${winnerButtons}
		<details style="margin:.5rem; border-top:1px solid #666; padding:.5rem;">
			<summary style="cursor:pointer;">Recent Results</summary>
			<ul style="margin:.3rem 0; padding-left:1.2rem;">${historyHtml}</ul>
		</details>
		<div>
			<button id="tReset" class="t-section btn-reset">Reset</button>
		</div>`;

	content.querySelectorAll('button[data-winner]').forEach(btn => {
		btn.addEventListener('click', async () => {
			const alias = (btn as HTMLButtonElement).dataset.winner!;
			await submitMatchResult(alias);
		});
	});

	const resetBtn = document.getElementById('tReset');
	if (resetBtn) resetBtn.addEventListener('click', async () => {
		if (confirm('Reset tournament?')) {
			await resetTournament();//TODO: modify function
		}
	});

	if (state.currentMatch && state.currentMatch.player1 && state.currentMatch.player2) {
		currentMatchPlayers.left = state.currentMatch.player1.alias;
		currentMatchPlayers.right = state.currentMatch.player2.alias;
		updateScoreboardNames();
	} else if (state.status === 'completed' && state.championId) {
		currentMatchPlayers.left = championAlias || 'Champion';
		currentMatchPlayers.right = '---';
		updateScoreboardNames();
	}
}
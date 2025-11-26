import { getApiEndpoint, Tournament, TournamentPlayer } from "../types/index";

export interface TournamentArchiveEntry {
	tournamentId: number;
	players: TournamentPlayer[];//maybe simplify?
	matches: any[];//maybe simplify?
	champion: TournamentPlayer | null;
	createdAt: string;
	startedAt?: string;
	endedAt?: string;
}

async function fetchTournamentList(): Promise<any[]> {
	try {
		const res = await fetch(`${getApiEndpoint()}/api/tournament/archives`);
		const data = await res.json();
		if (!data.success) return [];
		return data.data as any[];
	} catch {
		return [];
	}
}

async function fetchTournamentById(id: number): Promise<any | null> {
	try {
		const res = await fetch(`${getApiEndpoint()}/api/tournament/${id}/archive`);
		const data = await res.json();
		if (!data.success) return null;
		return data.data as any;
	} catch {
		return null;
	}
}

let archiveEl: HTMLDivElement | null = null;
let selectedDisplayId: number | undefined;

export async function openTournamentArchive(): Promise<void> {
	if (!archiveEl) {
		archiveEl = document.createElement('div');
		archiveEl.id = 'tArchiveModal';
		archiveEl.className = 't-archive-modal';
		archiveEl.innerHTML =
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
		document.body.appendChild(archiveEl);
		archiveEl.addEventListener('click', (e) => {
			const target = e.target as HTMLElement;
			if (target.dataset.close === '1') closeTournamentArchive();
		});
	}
	archiveEl.style.display = 'block';
	await populateArchive();
}

function closeTournamentArchive(): void {
  if (archiveEl) archiveEl.style.display = 'none';
}

async function populateArchive(): Promise<void> {
	let list: any[] = [];
	const archive = await fetchTournamentList();
	list = archive.map((t: any) => ({
		tournamentId: t.id,
		displayId: (t as any).displayId ?? t.id,//?
		status: t.status,
		players: t.players,
		matches: t.matches ?? t.matchHistory ?? 0,
		champion: t.championAlias || t.champion?.alias || null,
		createdAt: t.createdAt,
		startedAt: t.startedAt,
		endedAt: t.endedAt,
	}));
	
	list = list.filter(filterByArchive);


	const tListArchive = document.getElementById('tArchiveList');
	if (!tListArchive) return;

	if (!list.length) {
		tListArchive.innerHTML = `<p class="t-archive-empty">No tournaments yet.</p>`;
		return;
	}
	tListArchive.innerHTML =
		`<ul class="t-archive-ul">
		${list.map((t: any) => {
			const hasChampion = !!t.championAlias;
			return `
				<li class="t-archive-item">
				<button class="t-archive-row" data-id="${t.tournamentId}" data-source="${t._source}" data-display-id="${t.displayId ?? t.tournamentId}">
				<span class="t-arch-id">#${t.displayId ?? t.tournamentId}</span>
				<span class="t-arch-status ${t.status}">${t.status}</span>
				<span class="t-arch-meta">${new Date(t.createdAt).toLocaleString()}</span>
				<span class="t-arch-players">${t.players} players</span>
				<span class="t-arch-matches">${t.matches} matches</span>
				${hasChampion ? `<span class="t-arch-champion">🏆</span>` : ''}
				</button>
			</li>`;
		}).join('')}
		</ul>`;

	tListArchive.querySelectorAll<HTMLButtonElement>('button[data-id]').forEach(btn => {
		btn.addEventListener('click', async () => {
			const id = Number(btn.dataset.id);
			selectedDisplayId = btn.dataset.displayId ? Number(btn.dataset.displayId) : undefined;
			await showTournamentDetail(id);
		});
	});
}

function filterByArchive(item: Tournament) {
  if (item.status === 'archived') {
    return true;
  }
  return false;
}

async function showTournamentDetail(id: number): Promise<void> {
	const tDetailArchive = document.getElementById('tArchiveDetail');
	if (!tDetailArchive) return;
	tDetailArchive.innerHTML = `<p class="t-archive-loading">Loading tournament #${id}...</p>`;
	const data = await fetchTournamentById(id);
	if (!data) {
		tDetailArchive.innerHTML = `<p class="t-archive-error">Failed to load tournament.</p>`;
		return;
	}

	const playersHtml = (data.players || []).map((p: any) => {
		const stats = `${p.wins ?? 0}W-${p.losses ?? 0}L`;
		return `<li>${p.name} ${p.eliminated ? '✖' : '✓'} (${stats})</li>`;
	}).join('');

	const history = data.matchHistory || [];
	const historyHtml = history.length ? history.map((h: any) => {
		const p1 = h.p1 || '?';
		const p2 = h.p2 || '?';
		const w = h.winner || '?';
		return `<li>#${h.id} ${p1} vs ${p2} → <strong>${w}</strong></li>
				<details open>
				<p>Created At: ${h.createdAt}</p>
				<p>Started At: ${h.startedAt ? h.startedAt : 'N/A'}</p>
				<p>Finished At: ${h.endedAt ? h.endedAt : 'N/A'}</p>
				</details>`;
	}).join('') : '<li>(no matches)</li>';
	const champName = data.champion?.name;

	tDetailArchive.innerHTML =
		`<div class="t-archive-detail-inner">
		<h4>Tournament #${selectedDisplayId ?? data.id}</h4>
		<p>Status: <strong>${data.status}</strong> ${champName ? ` | Champion: <strong>${champName}</strong>` : ''}</p>
		<details open>
			<summary><strong>Players (${data.players.length})</strong></summary>
			<ul class="t-archive-players">${playersHtml}</ul>
		</details>
		<details open>
			<summary><strong>Match History (${history.length})</strong></summary>
			<ul class="t-archive-history">${historyHtml}</ul>
		</details>
		</div>`;
}

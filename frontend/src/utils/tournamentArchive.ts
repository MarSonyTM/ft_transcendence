import { Tournament, TournamentPlayer, TournamentMatch, TournamentArchive, MatchSummary } from '../../../shared/tournamentTypes';
import { getArchive } from './tournamentEngine';

function getApiEndpoint(): string {
    return (window.__INITIAL_STATE__?.apiEndpoint || '').replace(/\/$/, '');
}

async function fetchTournamentList(): Promise<Tournament[]> {
	try {
		const res = await fetch(`${getApiEndpoint()}/api/tournament/list`);
		const data = await res.json();
		if (!data.success) return [];
		return data.data as Tournament[];
	} catch {
		return [];
	}
}

async function fetchTournamentById(id: number): Promise<Tournament | null> {
	try {
		const res = await fetch(`${getApiEndpoint()}/api/tournament/${id}`);
		const data = await res.json();
		if (!data.success) return null;
		return data.data as Tournament;
	} catch {
		return null;
	}
}
let archive: HTMLDivElement | null = null;
let selectedDisplayId: number | undefined;

export async function openTournamentArchive(): Promise<void> {
	if (!archive) {
		archive = document.createElement('div');
		archive.id = 'tArchiveModal';
		archive.className = 't-archive-modal';
		archive.innerHTML =
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
		document.body.appendChild(archive);
		archive.addEventListener('click', (e) => {
			const target = e.target as HTMLElement;
			if (target.dataset.close === '1') closeTournamentArchive();
		});
	}
	archive.style.display = 'block';
	await populateArchiveList();
}

function closeTournamentArchive(): void {
	if (archive) archive.style.display = 'none';
}

async function populateArchiveList(): Promise<void> {//TODO:MERGE maybe delete friendlyId
	// Prefer local archive if present, fallback to backend list
	let list: any[] = [];
	try {
		const local = getArchive();
		if (local && local.length) {
			const byTimeAsc = [...local].sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
			const friendlyMap = new Map<number, number>();
			byTimeAsc.forEach((a: any, i: number) => friendlyMap.set(a.tournamentId, i + 1));
			list = local.map(a => ({
				tournamentId: a.tournamentId,
				displayId: friendlyMap.get(a.tournamentId) ?? a.tournamentId,
				status: 'completed',
				createdAt: a.createdAt,
				startedAt: a.startedAt,
				finishedAt: a.finishedAt,
				players: a.players?.length || 0,
				matches: a.matches?.length || 0,
				championAlias: a.champion?.name || null,
				_source: 'local'
			}));
		}
	} catch {}
	if (!list.length) {
		const remote = await fetchTournamentList();//TODO:MERGE maybe use Archive for fetching?
		list = remote.map((t: any) => ({
			tournamentId: t.tournamentId,
			displayId: (t as any).displayId ?? t.tournamentId,
			status: t.status,
			createdAt: t.createdAt,
			startedAt: t.startedAt,
			finishedAt: t.finishedAt,
			players: t.players,
			matches: t.matches ?? t.matchHistory ?? 0,
			championAlias: t.championAlias || t.champion?.alias || null,
			_source: 'remote'
		}));
	}
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
			const source = btn.dataset.source;
			selectedDisplayId = btn.dataset.displayId ? Number(btn.dataset.displayId) : undefined;
			if (source === 'local') await showLocalTournamentDetail(id);
			else await showTournamentDetail(id);
		});
	});
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
	const playersHtml = data.players.map((p: TournamentPlayer) => {
		const stats = `${p.wins}W-${p.losses}L | Total: ${p.totalScore} | Avg: ${p.averageScore?.toFixed(1)}`;
		return `<li>${p.name} ${p.eliminated ? '✖' : '✓'} (${stats})</li>`;
	}).join('');
	const historyHtml = data.matchHistory?.length
	? data.matchHistory.map((h: MatchSummary) => {
		const p1 = h.p1 || '?';
		const p2 = h.p2 || '?';
		const w = h.winner || '?';
		return `<li>#${h.matchId} ${p1} vs ${p2} → <strong>${w}</strong></li>
				<details open>
					<p>Created At: ${new Date(h.createdAt).toLocaleString()}</p>
					<p>Started At: ${h.startedAt ? new Date(h.startedAt).toLocaleString() : 'N/A'}</p>
					<p>Finished At: ${h.finishedAt ? new Date(h.finishedAt).toLocaleString() : 'N/A'}</p>
				</details>`;
	}).join('')
	: '<li>(no matches)</li>';
	const champName = data.champion?.name;

	tDetailArchive.innerHTML = 
		`<div class="t-archive-detail-inner">
			<h4>Tournament #${selectedDisplayId ?? data.tournamentId}</h4>
			<p>Status: <strong>${data.status}</strong> ${champName ? ` | Champion: <strong>${champName}</strong>` : ''}</p>
			<details open>
				<summary><strong>Players (${data.players.length})</strong></summary>
				<ul class="t-archive-players">${playersHtml}</ul>
			</details>
			<details open>
				<summary><strong>Match History (${data.matchHistory?.length})</strong></summary>
				<ul class="t-archive-history">${historyHtml}</ul>
			</details>
		</div>`;
}

async function showLocalTournamentDetail(id: number): Promise<void> {
	const detailEl = document.getElementById('tArchiveDetail');
	if (!detailEl) return;
	detailEl.innerHTML = `<p class="t-archive-loading">Loading tournament #${id}...</p>`;
	const list = getArchive();
	const data = list.find(a => a.tournamentId === id);
	if (!data) {
		detailEl.innerHTML = `<p class="t-archive-error">Tournament not found in local archive.</p>`;
		return;
	}
	// Compute local displayId by createdAt order
	const byTimeAsc = [...list].sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
	const idx = byTimeAsc.findIndex((x: any) => x.tournamentId === id);
	const localDisplayId = idx >= 0 ? (idx + 1) : id;
	const playersHtml = (data.players || []).map((p: TournamentPlayer) => {
		const stats = `${p.wins}W-${p.losses}L | Total: ${p.totalScore} | Avg: ${p.averageScore?.toFixed(1)}`;
		return `<li>${p.name} ${p.eliminated ? '✖' : '✓'} (${stats})</li>`;
	}).join('');
	const historyHtml = (data.matches || []).length
		? data.matches.map((m: MatchSummary) => {
			const p1 = m.p1?.name || '—';
			const p2 = m.p2?.name || '—';
			const w = m.winner?.name || '—';
			return `<li>#${m.matchId} ${p1} vs ${p2} → <strong>${w}</strong></li>
					<details>
						<p>Created At: ${new Date(m.createdAt).toLocaleString()}</p>
						<p>Started At: ${m.startedAt ? new Date(m.startedAt).toLocaleString() : 'N/A'}</p>
						<p>Finished At: ${m.finishedAt ? new Date(m.finishedAt).toLocaleString() : 'N/A'}</p>
					</details>`;
		}).join('')
		: '<li>(no matches)</li>';
	const champName = data.champion?.name;

	detailEl.innerHTML = 
		`<div class="t-archive-detail-inner">
			<h4>Tournament #${localDisplayId}</h4>
			<p>Status: <strong>completed</strong> ${champName ? ` | Champion: <strong>${champName}</strong>` : ''}</p>
			<details open>
				<summary><strong>Players (${data.players.length})</strong></summary>
				<ul class="t-archive-players">${playersHtml}</ul>
			</details>
			<details open>
				<summary><strong>Match History (${data.matches.length})</strong></summary>
				<ul class="t-archive-history">${historyHtml}</ul>
			</details>
		</div>`;
}


import { TPT, TPTmap, Tournament } from '../types';
import { setCurrentPage } from '../utils/globalState';
import { getCurrentTournament, setCurrentMatch, setCurrentTournament } from '../utils/tournamentState';
import {
	createTournament,
	resetTournament,
	addPlayerToTournament,
	removeTournamentPlayer,
	setEffectiveTournament,
	loadCurrentMatch,
	startTournament,
	deleteTournament
} from '../utils/tournamentUtils';
import { renderTournamentPage } from './tournamentPage';
import { openTournamentArchive } from '../utils/tournamentArchive'
import { renderApp } from '../main';

let activeT: Tournament | null = null;

let internalLocalIds: number[] = [];
let internalAIIds: number[] = [];
let internalRemoteIds: number[] = [];

function getNextId(existingIds: number[]): number {
	let nextId = 1;
	while (existingIds.includes(nextId))
		nextId++;
	existingIds.push(nextId);
	return nextId;
}

function clearNextIds(): void {
	internalLocalIds = [];
	internalAIIds = [];
	internalRemoteIds = [];
}

function startTournamentIfReady(): boolean {
	if (!activeT) {
		console.error('[Tournament] No active tournament found');
		return false;
	}
	const count = activeT.players?.length || 0;
	return count >= 3;
}

export async function renderSetup(content: HTMLElement): Promise<void> {
	clearNextIds();
	activeT = getCurrentTournament();
	if (!activeT) {
		let activeT = await createTournament();
		if (activeT) setCurrentTournament(activeT);
	}
	if (!activeT) return;
	content.innerHTML = `
		<p class="t-msg" style="text-align: center;">Create a new tournament</p>
			<div class="t-setup">
			<div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">
				<button id="addLocalBtn" class="btn btn-add">${TPTmap.get('local')} Add Local Player</button>
				<button id="addAIBtn" class="btn btn-add">${TPTmap.get('ai')} Add AI Player</button>
			</div>
			<ul id="playersList" class="t-alias-list"><button class="btn btn-remove" data-player-name="" data-player-type="" style="display: none">x</button></ul>
			<div class="t-footer">
				<div class="t-actions">
					<button id="archiveBtn" class="btn btn-archive t-flex-1">History</button>
					<button id="clearBtn" class="btn btn-end t-flex-1">Clear</button>
					<button id="startBtn" class="btn btn-start t-flex-1">Start Tournament</button>
					<button id="backBtn" class="btn btn-t-back t-flex-1">Back</button>
				</div>
			</div>
		</div>`;

	document.getElementById('archiveBtn')?.addEventListener('click', () => openTournamentArchive());

	const listEl = document.getElementById('playersList') as HTMLUListElement;
	const rerender = async () => {
		activeT = getCurrentTournament();
		if (activeT?.id)
			await setEffectiveTournament(activeT.id);
		activeT = getCurrentTournament();
		if (!activeT) return;
		if (activeT.players.length === 0) {
			listEl.innerHTML = `<li class="empty">No players yet</li>`;
		} else if (activeT.players.length > 10) {
			alert('Maximum of 10 players reached');
		} else {
			listEl.innerHTML = activeT.players.map((p: any) => {
				return `<li class="t-alias-item"><span class="t-alias-name">${p.name} ${TPTmap.get(p.tpt as TPT)}</span>
				<button class="btn btn-remove" data-player-name="${p.name}" data-player-type="${p.tpt}"
				style="${p.tpt === 'host' ?  'display: none' : ''}">x</button></li>`;
			}).join('');
		}
		const startBtn = document.getElementById('startBtn') as HTMLButtonElement | null;
		if (startBtn) startBtn.disabled = (activeT.players.length < 3);
	};
	rerender();


	document.getElementById('addLocalBtn')?.addEventListener('click', async () => {
		if (!activeT) return;
		const x = getNextId(internalLocalIds);
		const alias = prompt('Local player alias', `Local_${x}`)?.trim();
		if (!alias) return;
		console.log('[Tournament] Add local player:', alias);
		addPlayerToTournament(activeT.id!, alias, 'local');
		rerender();
	});

	document.getElementById('addAIBtn')?.addEventListener('click', async () => {
		if (!activeT) return;
		const x = getNextId(internalAIIds);
		const alias = `AI_${x}`;
		if (!alias) return;
		console.log('[Tournament] Add AI player:', alias);
		addPlayerToTournament(activeT.id!, alias, 'ai');
		rerender();
	});

	document.getElementById('addRemoteBtn')?.addEventListener('click', async () => {
		if (!activeT) return;
		let x = getNextId(internalRemoteIds);
		const alias = prompt('Remote player alias', `Remote_${x}`)?.trim();
		if (!alias) return;
		console.log('[Tournament] Add remote player:', alias);
		addPlayerToTournament(activeT.id!, alias, 'remote');
		rerender();
	});

	listEl.addEventListener('click', async (e) => {
		const target = e.target as HTMLElement;
		if (target && target.classList.contains('btn-remove')) {
			const type = target.getAttribute('data-player-type');
			const name = target.getAttribute('data-player-name');
			const idNum = Number(name?.split('_')[1]);
			if (type === 'local' && name?.startsWith('Local_')) {
				internalLocalIds = internalLocalIds.filter(id => id !== idNum);
			} else if (type === 'ai' && name?.startsWith('AI_')) {
				internalAIIds = internalAIIds.filter(id => id !== idNum);
			} else if (type === 'remote' && name?.startsWith('Remote_')) {
				internalRemoteIds = internalRemoteIds.filter(id => id !== idNum);
			}
			if (name) {
				console.debug('[Tournament] Remove player:', name);
				await removeTournamentPlayer(name);
				await rerender();
			}
		}
	});

	document.getElementById('clearBtn')?.addEventListener('click', async () => {
		await resetTournament();
		const content = document.getElementById('tournamentContent');
		if (!content) return console.debug('[Tournament] No tournament content element found');
		await renderSetup(content);
	});

	document.getElementById('startBtn')?.addEventListener('click', async () => {
		if (!activeT) return;
		console.debug('[Tournament] Start button clicked');
		if (!startTournamentIfReady()) {
			alert('Minimum are 3 players');
			rerender();
		}
		else if (activeT && activeT.players.length >= 3) {
			if (!(await startTournament()))
				rerender();
			activeT = getCurrentTournament();
			if (!activeT) {
				console.error('[Tournament] No active tournament');
				return;
			}
			if (activeT.curM === null) {
				activeT.curM = await loadCurrentMatch();
				console.debug('[Tournament] Current match set to:', activeT.curM);
			}
			setCurrentTournament(activeT);
			setCurrentMatch(activeT.curM!);
			await renderTournamentPage();
			console.debug('[Tournament] Rendering tournament page');
		}
	});

	document.getElementById('backBtn')?.addEventListener('click', async () => {
		if (activeT && activeT.id)
			await deleteTournament(activeT.id);
		history.pushState({ page: 'gameSelect' }, '', '/game-select');
		setCurrentPage('gameSelect');
		renderApp();
	});
}


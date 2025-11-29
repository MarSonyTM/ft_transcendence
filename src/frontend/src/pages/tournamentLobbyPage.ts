import { TPT, TPTmap, Tournament } from '../types';
import { setCurrentPage } from '../utils/globalState';
import { getCurrentTournament, setCurrentTournament } from '../utils/tournamentState';
import {
	createTournament,
	resetTournament,
	addPlayerToTournament,
	removeTournamentPlayer,
	setEffectiveTournament,
	loadCurrentMatch,
	startTournament,
	showTournamentMaxPlayerMessage
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
		if (activeT)
			setCurrentTournament(activeT);
	}
	if (!activeT) return;
	content.innerHTML = `
	<p class="t-msg">Create a new tournament</p>
		<div class="t-setup">
			<span class="t-actions t-flex">
				<button id="addLocalBtn" class="btn btn-add">${TPTmap.get('local')} Add Local Player</button>
				<button id="addAIBtn" class="btn btn-add">${TPTmap.get('ai')} Add AI Player</button>
				<div id="alias-modal" class="modal hidden">
					<div class="modal-content">
						<input id="alias-input" />
						<button id="alias-ok">OK</button>
					</div>
				</div>
			</span>
			<ul id="playersList" class="t-alias-list"><button class="btn btn-remove-alias" style="display: none">x</button></ul>
			<div class="t-footer">
				<div class="t-actions">
					<button id="archiveBtn" class="btn btn-archive t-flex-1">History</button>
					<button id="clearBtn" class="btn btn-reset t-flex-1">Clear</button>
					<button id="startBtn" class="btn btn-start t-flex-1">Start</button>
					<button id="backBtn" class="btn btn-t-back t-flex-1">Back</button>
				</div>
			</div>
		</div>`;

	document.getElementById('archiveBtn')?.addEventListener('click', async () => await openTournamentArchive());

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
			showTournamentMaxPlayerMessage();
		} else {
			listEl.innerHTML = activeT.players.map((p: any) => {
				return `<li class="t-alias-item"><span class="t-alias-name">${p.name} ${TPTmap.get(p.tpt as TPT)}</span>
				<button class="btn btn-remove-alias" data-player-name="${p.name}" data-player-type="${p.tpt}"
				style="${p.tpt === 'host' ?  'display: none' : ''}">x</button></li>`;
			}).join('');
		}
		const startBtn = document.getElementById('startBtn') as HTMLButtonElement | null;
		if (startBtn)
			startBtn.disabled = (activeT.players.length < 3);
	};
	await rerender();

	function askAlias(x: number, tpt: TPT) {
		return new Promise<string>(resolve => {
			const modal = document.getElementById('alias-modal') as HTMLElement;
    		const input = document.getElementById('alias-input') as HTMLInputElement;
    		const ok = document.getElementById('alias-ok') as HTMLButtonElement;
			if (!modal || !input || !ok)
				return;

			const type = tpt === 'local' ? 'Local_' : tpt === 'ai' ? 'AI_' : 'Remote_';
			const defaultAlias =  `${type}${x}`;
			input.placeholder = defaultAlias;
			input.value = "";

			const finish = () => {
				modal.classList.add('hidden');
				const alias = input.value.trim() || defaultAlias;
				input.value = "";
				resolve(alias);
			};

			modal.classList.remove('hidden');
			input.focus();

			ok.onclick = finish;

			input.onkeydown = e => {
				if (e.key === "Enter") {
					e.preventDefault();
					finish();
				}
			};
		});
	}

	document.getElementById('addLocalBtn')?.addEventListener('click', async () => {
		if (!activeT) return;
		const x = getNextId(internalLocalIds);
		const alias = await askAlias(x, 'local');
		if (!alias) return;
		await addPlayerToTournament(activeT.id!, alias, 'local');
		await rerender();
	});

	document.getElementById('addAIBtn')?.addEventListener('click', async () => {
		if (!activeT) return;
		const x = getNextId(internalAIIds);
		const alias = `AI_${x}`;
		// const alias = await askAlias(x, 'ai');
		if (!alias) return;
		await addPlayerToTournament(activeT.id!, alias, 'ai');
		await rerender();
	});

	document.getElementById('addRemoteBtn')?.addEventListener('click', async () => {
		if (!activeT) return;
		let x = getNextId(internalRemoteIds);
		const alias = await askAlias(x, 'remote');
		if (!alias) return;
		await addPlayerToTournament(activeT.id!, alias, 'remote');
		await rerender();
	});

	listEl.addEventListener('click', async (e) => {
		const target = e.target as HTMLElement;
		if (target && target.classList.contains('btn-remove-alias')) {
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
				await removeTournamentPlayer(name);
				await rerender();
			}
		}
	});

	document.getElementById('clearBtn')?.addEventListener('click', async () => {
		if (activeT && activeT.players.length > 1) {
			for (let p of activeT.players) {
				if (p.tpt !== 'host')
					await removeTournamentPlayer(p.name, true);
				await rerender();
			}
		}
		clearNextIds();
		await resetTournament();
		await rerender();
	});

	document.getElementById('startBtn')?.addEventListener('click', async () => {
		if (!activeT) return;
		if (!startTournamentIfReady()) {
			await rerender();
		}
		else if (activeT && activeT.players.length >= 3) {
			if (!(await startTournament()))
				await rerender();
			activeT = getCurrentTournament();
			if (!activeT) {
				console.error('[Tournament] No active tournament');
				return;
			}
			if (activeT.curM === null) {
				activeT.curM = await loadCurrentMatch();
			}
			setCurrentTournament(activeT);
			await renderTournamentPage();
		}
	});

	document.getElementById('backBtn')?.addEventListener('click', async () => {
		await resetTournament(false);
		history.pushState({ page: 'gameSelect' }, '', '/gameSelect');
		setCurrentPage('gameSelect');
		await renderApp();
	});
}


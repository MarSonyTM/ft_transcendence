import { TPT, TPTmap } from '../types';
import {
	getTournament,
	createTournament,
	setupMatches,
	resetTournament,
	addPlayerToTournament
} from '../utils/tournamentUtils';
import { renderTournamentContent } from './tournamentPage';

let activeT: any | undefined = undefined;

function startTournamentIfReady(): boolean {
	if (!activeT) {
		console.error('No active tournament found');
		return false;
	}
	const count = activeT.players?.length || 0;
	console.debug(`[Tournament] Player count: ${count}`);
	return count >= 3;
}

export function renderSetup(): void {
	// Ensure a tournament exists in state
	activeT = getTournament();
	if (!activeT) {
		createTournament();
		activeT = getTournament();
	}
	if (!activeT) return;
	const content = document.getElementById('tournamentContent');
	if (!content) { activeT = undefined; return; }
	content.innerHTML = `
		<p class="t-msg">Create a new tournament</p>
		<div class="t-setup">
			<div class="t-flex-1">
				<button id="addLocalBtn" class="btn btn-add">${TPTmap.get('local')} Add Local Player</button>
				<button id="addAIBtn" class="btn btn-add">${TPTmap.get('ai')} Add AI Player</button>
				<button id="addRemoteBtn" class="btn btn-add">${TPTmap.get('remote')} Invite Remote Player?</button>
			</div>
			<ul id="playersList" class="t-alias-list"></ul>
			<div class="t-actions">
				<button id="clearBtn" class="btn btn-end t-flex-1">Clear</button>
				<button id="startBtn" class="btn btn-start t-flex-1">Start Tournament</button>
			</div>
		</div>`;

	const listEl = document.getElementById('playersList') as HTMLUListElement;
	const rerender = () => {
		activeT = getTournament();
		if (!activeT) return;
		if (activeT.players.length === 0) {
			listEl.innerHTML = `<li class="empty">No players yet</li>`;
		} else if (activeT.players.length > 10) {
			alert('Maximum of 10 players reached');
		} else {
			listEl.innerHTML = activeT.players.map((p: any) => {
				return `<li class="t-alias-item"><span class="t-alias-name">${p.name} ${TPTmap.get(p.tpt as TPT)}</span></li>`;
			}).join('');
		}
		// Toggle start button enabled state for quick feedback
		const startBtn = document.getElementById('startBtn') as HTMLButtonElement | null;
		if (startBtn) startBtn.disabled = (activeT.players.length < 3);
	};
	rerender();

	document.getElementById('addLocalBtn')?.addEventListener('click', () => {
		if (!activeT) return;
		const x = activeT.players.filter((p: any) => p.tpt === 'local').length || 0;
		const alias = prompt('Local player alias', `Local_${x + 1}`)?.trim();
		if (!alias) return;
		console.debug('[Tournament] Add local player:', alias);
		addPlayerToTournament({ name: alias, tpt: 'local', isReady: false });
		rerender();
	});

	document.getElementById('addAIBtn')?.addEventListener('click', () => {
		if (!activeT) return;
		const x = activeT.players.filter((p: any) => p.tpt === 'ai').length || 0;
		const alias = `AI_${x + 1}`;
		if (!alias) return;
		console.debug('[Tournament] Add AI player:', alias);
		addPlayerToTournament({ name: alias, tpt: 'ai', isReady: true });
		rerender();
	});

	document.getElementById('addRemoteBtn')?.addEventListener('click', () => {
		if (!activeT) return;
		const alias = prompt('Remote player alias', `Remote_${(activeT.players.length ?? 0) + 1}`)?.trim();
		if (!alias) return;
		console.debug('[Tournament] Add remote player:', alias);
		addPlayerToTournament({ name: alias, tpt: 'remote', isReady: false });
		rerender();
	});

	document.getElementById('clearBtn')?.addEventListener('click', () => {
		resetTournament();
		renderSetup();
	});

	document.getElementById('startBtn')?.addEventListener('click', () => {
		console.debug('[Tournament] Start button clicked');
		if (!startTournamentIfReady()) {
			alert('Add at least 3 players');
			return;
		}
		setupMatches();
		renderTournamentContent();
	});
}


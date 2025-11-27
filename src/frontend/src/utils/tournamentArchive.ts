import { getApiEndpoint, Tournament, TournamentPlayer } from "../types/index";

let list: Partial<Tournament>[];

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

	for (let i = 0; i < list.length; i++) {
		list[i].id = list.length - i;
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
			return `
				<div>
					<button class="t-archive-row" data-id="${t.tournamentId}" data-source="${t._source}" data-display-id="${t.id ?? t.tournamentId}">
							Tournament #${t.id}
					</button>
				</div>`;
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

function filterByArchive(item: Partial<Tournament>) {
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
    
    const history = data.allMatches || [];
    const players = data.players || [];
    const champion = data.champion;
    const champName = champion?.name || null;
    
    // Create match list HTML
    const matchListHtml = history.length ? history.map((match: any) => {
        // p1 and p2 are objects - extract the name property
        const p1Name = match.p1?.name || ' (Bye)';
        const p2Name = match.p2?.name ? ' vs ' + match.p2?.name : ' (Bye)';
        
        // Find winner by winnerId
        const winner = players.find((p: any) => p.id === match.winnerId);
        
        return `
            <div class="t-match-item" data-match-id="${match.gameId}">
                <div class="t-match-players">${p1Name}${p2Name}</div>
            </div>`;
    }).join('') : '<p class="t-no-matches">No matches played yet</p>';
    // Create main layout
    tDetailArchive.innerHTML = `
        <div class="t-archive-detail-inner">
            <div class="t-detail-header">
                <h4>Tournament #${selectedDisplayId ?? data.id}</h4>
                <p class="t-status">
                    ${champName ? `<span class="t-champion">🏆 Champion: <strong>${champName}</strong></span>` : ''}
                </p>
            </div>
            
            <div class="t-detail-content">
                <!-- Left Panel: Match List -->
                <div class="t-matches-panel">
                    <h5>Match History (${history.length})</h5>
                    <div class="t-matches-list">
                        ${matchListHtml}
                    </div>
                </div>
                
                <!-- Right Panel: Match Details -->
                <div class="t-match-detail-panel">
                    <div class="t-match-detail-placeholder">
                        <p>Select a match to view details</p>
                    </div>
                </div>
            </div>
        </div>`;
    
    // Add click handlers for matches
    if (history.length > 0) {
        const matchItems = tDetailArchive.querySelectorAll('.t-match-item');
        matchItems.forEach(item => {
            item.addEventListener('click', () => {
                const matchId = parseInt(item.getAttribute('data-match-id') || '0');
                const match = history.find((h: any) => h.gameId === matchId);
                if (match) {
                    matchItems.forEach(mi => mi.classList.remove('active'));
                    item.classList.add('active');
                    showMatchDetail(match, history, players, data);
                }
            });
        });
    }
}

function showMatchDetail(match: any, allMatches: any[], players: any[], tournamentData: any): void {
    const detailPanel = document.querySelector('.t-match-detail-panel');
    if (!detailPanel) return;
    
    // Extract player names from p1/p2 objects
    const p1Name = match.p1?.name || match.p1?.username || 'Player 1';
    const p2Name = match.p2?.name || match.p2?.username || 'Player 2';
    
    // Find winner by winnerId
    const winner = players.find((p: any) => p.id === match.winnerId);
    const winnerName = winner?.name || null;
    
    // Get player stats from the p1/p2 objects (they might have stats)
    // or find them in the players array
    const p1Stats = match.p1?.wins !== undefined 
        ? `${match.p1.wins ?? 0}W - ${match.p1.losses ?? 0}L`
        : '';
    const p2Stats = match.p2?.wins !== undefined 
        ? `${match.p2.wins ?? 0}W - ${match.p2.losses ?? 0}L`
        : '';
    
    // Generate bracket visualization
    const bracketHtml = generateBracketVisualization(allMatches, players);
    
    detailPanel.innerHTML = bracketHtml;
        // <div class="t-match-detail-content">          
        //     <!-- Player Grid (1x2) -->
        //     <div class="t-players-grid">
        //         <div class="t-player-card ${match.winnerId === match.p1?.id ? 'winner' : 'loser'}">
        //             <div class="t-player-name">${p1Name}</div>
        //             <div class="t-player-stats">${p1Stats}</div>
        //             ${match.winnerId === match.p1?.id ? '<div class="t-winner-badge">🏆 Winner</div>' : '<div class="t-loser-badge">Loser</div>'}
        //         </div>
                
        //         <div class="t-player-card ${match.winnerId === match.p2?.id ? 'winner' : 'loser'}">
        //             <div class="t-player-name">${p2Name}</div>
        //             <div class="t-player-stats">${p2Stats}</div>
        //             ${match.winnerId === match.p2?.id ? '<div class="t-winner-badge">🏆 Winner</div>' : '<div class="t-loser-badge">Loser</div>'}
        //         </div>
        //     </div>
            
        //     <!-- Bracket Visualization -->
        //     <div class="t-bracket-section">
        //         <h6>Tournament Bracket</h6>
        //         ${bracketHtml}
        //     </div>
        // </div>`;
}

function generateBracketVisualization(matches: any[], players: any[]): string {
    if (!matches.length) return '<p class="t-no-bracket">No bracket data available</p>';
    
    // Group matches by round
    const rounds: any[][] = [];
    const maxRound = Math.max(...matches.map((m: any) => m.round || 0));
    
    if (maxRound > 0) {
        for (let r = 1; r <= maxRound; r++) {
            const roundMatches = matches.filter((m: any) => m.round === r);
            if (roundMatches.length) rounds.push(roundMatches);
        }
    } else {
        // Fallback: group by progression
        let roundSize = Math.ceil(players.length / 2);
        let matchIndex = 0;
        
        while (roundSize >= 1 && matchIndex < matches.length) {
            const roundMatches = matches.slice(matchIndex, matchIndex + roundSize);
            if (roundMatches.length) rounds.push(roundMatches);
            matchIndex += roundSize;
            roundSize = Math.ceil(roundSize / 2);
        }
    }
    
    // Generate bracket HTML
    let bracketHtml = '<div class="t-bracket-container">';
    
    rounds.forEach((round, roundIdx) => {
        bracketHtml += `
            <div class="t-bracket-round">
                <div class="t-round-label">${getRoundLabel(roundIdx, rounds.length)}</div>
                <div class="t-round-matches">`;
        
        round.forEach(match => {
            const p1Name = match.p1?.name || match.p1?.username || '(Bye)';
            const p2Name = match.p2?.name || match.p2?.username || '(Bye)';
            
            bracketHtml += `
                <div class="t-bracket-match ${match.isBye ? 'bye-match' : ''}">
                    <div class="t-bracket-player ${match.winnerId === match.p1?.id ? 'won' : 'lost'}">${p1Name}</div>
                    <div class="t-bracket-player ${match.winnerId === match.p2?.id ? 'won' : 'lost'}">${p2Name}</div>
                </div>`;
        });
        
        bracketHtml += `
                </div>
            </div>`;
    });
    
    bracketHtml += '</div>';
    return bracketHtml;
}

function getRoundLabel(roundIdx: number, totalRounds: number): string {
    const roundsFromEnd = totalRounds - roundIdx - 1;
    if (roundsFromEnd === 0) return 'Final';
    if (roundsFromEnd === 1) return 'Semi-Final';
    if (roundsFromEnd === 2) return 'Quarter-Final';
    return `Round ${roundIdx + 1}`;
}

function formatDate(dateString: string): string {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
    });
}

import { Tournament, TournamentMatch, TournamentPlayer, TPT } from "../database/index";

// Internal state representation for a tournament
interface TournamentState {
  t: Tournament;
  players: TournamentPlayer[];
  matchesById: Map<string, TournamentMatch>;
  roundQueues: Map<number, string[]>;
  currentRound: number;
}

class TournamentManager {
	private minPlayers: number = 3;
	private maxPlayers: number = 10;
	private tournaments: Map<string, TournamentState> = new Map();
    private archives: Map<string, Tournament> = new Map();

	/* -------------------------------------------------- */
	/* ID Generators                                      */
	/* -------------------------------------------------- */
	private generateTournamentId(): string {
		const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
		let result = 'T-';
		for (let i = 0; i < 8; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
		return result;
	}

	private generateMatchId(tournamentId: string): string {
		const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
		let result = `M-${tournamentId}-`;
		for (let i = 0; i < 5; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
		return result;
	}

	/* -------------------------------------------------- */
	/* Tournament CRUD / Player Management                */
	/* -------------------------------------------------- */
	createTournament(hostId: string, hostUsername: string): Tournament {
		const tournamentId = this.generateTournamentId();
		const ts = new Date().toISOString();
		const hostPlayer: TournamentPlayer = {
			playerId: hostId,
			tournamentId,
			tpt: 'host',
			identity: `host-${tournamentId}-${hostId}-${hostUsername}`,
			name: hostUsername,
			pos: 70,
			isReady: false,
			score: 0,
			eliminated: false,
			createdAt: ts,
			updatedAt: ts
		};
		const t: Tournament = {
			tournamentId,
			status: 'setup',
			players: [hostPlayer],
			allMatches: [],
			championId: null,
			createdAt: ts,
			startedAt: undefined,
			endedAt: undefined
		};
		const state: TournamentState = {
			t,
			players: t.players,
			matchesById: new Map(),
			roundQueues: new Map(),
			currentRound: 0
		};
		this.tournaments.set(tournamentId, state);
		console.log(`✅ Tournament created: ${tournamentId} by ${hostUsername}`);
		return t;
	}

	getTournament(tournamentId: string): Tournament | undefined {
		return this.tournaments.get(tournamentId)?.t;
	}

	joinTournament(tournamentId: string, playerId: string, name: string, tpt: TPT, isReady: boolean): { success: boolean; message: string; tournament?: Tournament } {
		const state = this.tournaments.get(tournamentId);
		if (!state) return { success: false, message: 'Tournament not found' };
		const t = state.t;
		if (t.status !== 'setup') return { success: false, message: 'Tournament already in progress' };
		if (t.players.length >= this.maxPlayers) return { success: false, message: 'Tournament is full' };
		if (t.players.some(p => p.playerId === playerId)) return { success: false, message: 'Already in this tournament' };
		const now = new Date().toISOString();
		const newPlayer: TournamentPlayer = {
			playerId,
			tournamentId,
			tpt,
			identity: `${tpt}-${tournamentId}-${playerId}-${name}`,
			name,
			isReady: isReady,
			pos: 70,
			score: 0,
			eliminated: false,
			createdAt: now,
			updatedAt: now
		};
		t.players.push(newPlayer);
		console.log(`✅ ${name} joined tournament ${tournamentId}`);
		return { success: true, message: 'Joined successfully', tournament: t };
	}

	leaveTournament(tournamentId: string, playerId: string): boolean {
		const state = this.tournaments.get(tournamentId);
		if (!state) return false;
		const t = state.t;
		const p = t.players.find(pl => pl.playerId === playerId);
		if (!p) return false;
		p.eliminated = true; // treat leave as elimination

		const activePlayers = t.players.filter(pl => !pl.eliminated);
    if (activePlayers.length === 0) {
      this.endTournament(tournamentId);
      return true;
    }
		console.log(`🚪 Player ${playerId} left tournament ${tournamentId}`);
		return true;
	}

	togglePlayerReady(tournamentId: string, playerId: string): boolean {
		const state = this.tournaments.get(tournamentId);
		if (!state) return false;
		const player = state.players.find(p => p.playerId === playerId);
		if (!player) return false;
		player.isReady = !player.isReady;
		return true;
	}

	/* -------------------------------------------------- */
	/* Bracket / Match Helpers                            */
	/* -------------------------------------------------- */
	private seedBracket(state: TournamentState): void {
		// Pre-generate matches for all rounds based on initial player count.
		const totalPlayers = state.players.filter(p => !p.eliminated).length;
		if (totalPlayers < this.minPlayers) return; // not enough to seed

		let amount = totalPlayers;
		let round = 1;
		let bye = amount % 2 === 1;
		amount = Math.floor(amount / 2);

		while (amount > 0) {
			const matchIds: string[] = [];
			for (let i = 0; i < amount; i++) {
				const matchRoomId = this.generateMatchId(state.t.tournamentId);
					const createdAt = new Date().toISOString();
					const match: TournamentMatch = {
						matchRoomId,
						tournamentId: state.t.tournamentId,
						status: 'setup',
						playerId1: '',
						playerId2: '',
						winnerId: null,
						round,
						roundIdx: i,
						createdAt,
						startedAt: undefined,
						endedAt: undefined
					};
				state.matchesById.set(matchRoomId, match);
				matchIds.push(matchRoomId);
			}
			state.roundQueues.set(round, matchIds.reverse()); // reverse to use pop() for FIFO order
			round++;
			amount += bye ? 1 : 0; // carry bye forward as a phantom player
			bye = amount % 2 === 1;
			amount = Math.floor(amount / 2);
		}
		state.t.allMatches = Array.from(state.matchesById.values());
	}

	private shuffle<T>(arr: T[]): void {
		for (let i = arr.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[arr[i], arr[j]] = [arr[j], arr[i]];
		}
	}

	private assignPlayersToRound(state: TournamentState, round: number): boolean {
		const activePlayers = state.players.filter(p => !p.eliminated);
		if (activePlayers.length <= 1) return false;
		this.shuffle(activePlayers);

		const queue = state.roundQueues.get(round) || [];
		if (queue.length === 0) return false;

		for (const matchId of queue) {
			const match = state.matchesById.get(matchId);
			if (!match) continue;
			if (activePlayers.length > 0) match.playerId1 = activePlayers.pop()!.playerId;
			if (activePlayers.length > 0) match.playerId2 = activePlayers.pop()!.playerId;
			match.status = 'pending';
		}

		// If a single player is left -> automatic advance (bye)
		if (activePlayers.length === 1) {
			// Mark player as bye by setting identity flag (non-destructive boolean would be cleaner; kept for compatibility)
			const byePlayer = activePlayers[0];
			if (!byePlayer.identity.endsWith('-BYE')) byePlayer.identity += '-BYE';
		} else if (activePlayers.length > 1) {
			throw new Error('Invariant violated: more than one player left after round assignment');
		}
		return true;
	}

	private advanceRound(state: TournamentState): boolean {
    state.currentRound++;
		const success = this.assignPlayersToRound(state, state.currentRound);
		if (!success) return false;
		return true;
	}

	private allPlayersReadyForMatch(state: TournamentState, matchId: string): boolean {
		const match = state.matchesById.get(matchId);
		if (!match) return false;
		const p1 = state.players.find(p => p.playerId === match.playerId1);
		const p2 = state.players.find(p => p.playerId === match.playerId2);
		if (!p1 || !p2) return false;
		if (p1.isReady !== true || p2.isReady !== true) return false;
		match.status = 'ready';
		return true;
	}

	private computeChampionIfPossible(state: TournamentState): void {
		const remaining = state.players.filter(p => !p.eliminated);
		if (remaining.length === 1) {
			const champ = remaining[0];
			state.t.championId = champ.playerId;
			state.t.status = 'completed';
			console.log(`🏆 Tournament ${state.t.tournamentId} champion: ${champ.name}`);
		}
	}

	/* -------------------------------------------------- */
	/* Tournament Lifecycle                                */
	/* -------------------------------------------------- */
	isSetupComplete(tournamentId: string): boolean {
		const state = this.tournaments.get(tournamentId);
		if (!state) return false;
		if (state.players.filter(p => !p.eliminated).length < this.minPlayers) return false;
		if (state.t.allMatches.length <= 0) return false;
		return true;
	}

	startTournament(tournamentId: string): boolean {
		const state = this.tournaments.get(tournamentId);
		if (!state) return false;
		const t = state.t;
		if (t.status !== 'setup') return false;

		// Seed bracket if not already seeded
		if (state.t.allMatches.length === 0) this.seedBracket(state);
		if (!this.assignPlayersToRound(state, 1)) return false;
    	state.currentRound = 1;
		if (!this.isSetupComplete(tournamentId)) return false;

		t.status = 'active';
		console.log(`🏁 Tournament started ${tournamentId}`);
		return true;
	}

	endTournament(tournamentId: string): boolean {
		const state = this.tournaments.get(tournamentId);
		if (!state) return false;
		const t = state.t;
		if (t.status === 'completed') return false; // already ended
		this.computeChampionIfPossible(state); // ensure champion set if possible
		t.status = 'completed';
		console.log(`🏁 Tournament ended ${tournamentId}`);
		// Persist archive snapshot immediately
		this.persistArchive(tournamentId);
		setTimeout(() => {
			this.tournaments.delete(tournamentId);
			console.log(`🗑️ Tournament ${tournamentId} cleaned up`);
		}, 30000);
		return true;
	}

	/* -------------------------------------------------- */
	/* Archive                                             */
	/* -------------------------------------------------- */
	persistArchive(tournamentId: string): boolean {
		const state = this.tournaments.get(tournamentId);
		if (!state) return false;
		const snapshot: Tournament = JSON.parse(JSON.stringify(state.t));
		// Mark snapshot as completed if not already
		if (snapshot.status !== 'completed') snapshot.status = 'completed';
		this.archives.set(tournamentId, snapshot);
		console.log(`📦 Tournament ${tournamentId} archived`);
		return true;
	}

	getArchive(tournamentId: string): Tournament | undefined {
		return this.archives.get(tournamentId);
	}

	getAllArchives(): Tournament[] {
		return Array.from(this.archives.values());
	}

	/* -------------------------------------------------- */
	/* Match Operations                                    */
	/* -------------------------------------------------- */
	getMatch(tournamentId: string, matchId: string): TournamentMatch | undefined {
		return this.tournaments.get(tournamentId)?.matchesById.get(matchId);
	}

	getPlayersInMatch(tournamentId: string, matchId: string): TournamentPlayer[] {
		const state = this.tournaments.get(tournamentId);
		if (!state) return [];
		const match = state.matchesById.get(matchId);
		if (!match) return [];
		const players: TournamentPlayer[] = [];
		const p1 = state.players.find(p => p.playerId === match.playerId1);
		const p2 = state.players.find(p => p.playerId === match.playerId2);
		if (p1) players.push(p1);
		if (p2) players.push(p2);
		return players;
	}

	getCurrentMatch(tournamentId: string): TournamentMatch | undefined {
		const state = this.tournaments.get(tournamentId);
		if (!state) return undefined;
		const t = state.t;
		if (t.status !== 'active' && t.status !== 'setup') return undefined;
		const queue = state.roundQueues.get(state.currentRound) || [];
		if (queue.length === 0) {
			// attempt to advance to next round
			if (!this.advanceRound(state)) return undefined;
			return this.getCurrentMatch(tournamentId);
		}
		const matchId = queue.pop();
		if (!matchId) return undefined;
		const match = state.matchesById.get(matchId);
		return match;
	}

	startMatch(tournamentId: string, matchId: string, gameId: number): boolean {
		const state = this.tournaments.get(tournamentId);
		if (!state) return false;
		const match = state.matchesById.get(matchId);
		if (!match) return false;
		if (!this.allPlayersReadyForMatch(state, matchId)) return false;
		match.gameId = gameId;
		match.status = 'active';
		match.startedAt = new Date().toISOString();
		console.log(`▶️ Match ${matchId} started (tournament ${tournamentId})`);
		return true;
	}

	endMatch(tournamentId: string, matchId: string, winnerId?: string): boolean {
		const state = this.tournaments.get(tournamentId);
		if (!state) return false;
		const match = state.matchesById.get(matchId);
		if (!match) return false;
		if (match.status === 'completed') return false; // already ended

		// Determine winner if not supplied (placeholder: no scoring logic yet)
		if (!winnerId) {
			// naive: choose a ready, non-eliminated player or player1 fallback
			const candidates = [match.playerId1, match.playerId2].filter(pid => {
				const pl = state.players.find(p => p.playerId === pid);
				return pl && !pl.eliminated;
			});
			winnerId = candidates[0] || match.playerId1;
		}
		match.winnerId = winnerId;
		match.status = 'completed';
		match.endedAt = new Date().toISOString();
		// eliminate the loser
		const loserId = winnerId === match.playerId1 ? match.playerId2 : match.playerId1;
		const loser = state.players.find(p => p.playerId === loserId);
		if (loser) loser.eliminated = true;
		console.log(`🏁 Match ${matchId} completed. Winner: ${winnerId}`);

		// Round completion check: if all matches in current round are completed, advance
		const currentIds = state.roundQueues.get(match.round) || [];
		const allCompleted = currentIds.every(id => (state.matchesById.get(id)?.status === 'completed'));
		if (allCompleted) {
			// Clean bye markers on remaining players
			state.players.forEach(p => { if (p.identity.endsWith('-BYE')) p.identity = p.identity.replace(/-BYE$/, ''); });
			if (!this.advanceRound(state)) {
				// No further round -> determine champion if possible
				this.computeChampionIfPossible(state);
				if (state.t.status !== 'completed') this.endTournament(tournamentId);
			}
		} else {
			this.computeChampionIfPossible(state);
		}

		// Clean up match after delay (retain history inside t.allMatches, but remove from active queue)
		setTimeout(() => {
			// Remove from queue array if still present
			const queue = state.roundQueues.get(match.round);
			if (queue) {
				const idx = queue.indexOf(matchId);
				if (idx !== -1) queue.splice(idx, 1);
			}
			console.log(`🗑️ Match ${matchId} cleanup (tournament ${tournamentId})`);
		}, 30000);
		return true;
	}

	leaveMatch(tournamentId: string, matchId: string, playerId: string): boolean {
		const state = this.tournaments.get(tournamentId);
		if (!state) return false;
		const match = state.matchesById.get(matchId);
		if (!match) return false;
		const player = state.players.find(p => p.playerId === playerId);
		if (!player) return false;
		player.eliminated = true;
		console.log(`🚪 Player ${playerId} left match ${matchId}`);
		// If leaving decides winner, end match with other player as winner
		const otherId = playerId === match.playerId1 ? match.playerId2 : match.playerId1;
		this.endMatch(tournamentId, matchId, otherId);
		return true;
	}

	toggleMatchPlayerReady(tournamentId: string, matchId: string, playerId: string): boolean {
		const state = this.tournaments.get(tournamentId);
		if (!state) return false;
		const match = state.matchesById.get(matchId);
		if (!match) return false;
		if (playerId !== match.playerId1 && playerId !== match.playerId2) return false;
		const player = state.players.find(p => p.playerId === playerId);
		if (!player) return false;
		player.isReady = !player.isReady;
		player.updatedAt = new Date().toISOString();
		this.allPlayersReadyForMatch(state, matchId);
		if (match.status !== 'ready') match.status = 'pending';
		return true;
	}

	/* -------------------------------------------------- */
	/* Queries / Sockets                                   */
	/* -------------------------------------------------- */
	getAllTournaments(): Tournament[] {
		return Array.from(this.tournaments.values()).map(s => s.t);
	}

	getActiveMatches(tournamentId: string): TournamentMatch[] {
		const state = this.tournaments.get(tournamentId);
		if (!state) return [];
		return Array.from(state.matchesById.values()).filter(m => ['pending', 'ready', 'active'].includes(m.status));
	}

	setPlayerSocket(tournamentId: string, playerId: string, socketId: string): boolean {
		const state = this.tournaments.get(tournamentId);
		if (!state) return false;
		const player = state.players.find(p => p.playerId === playerId);
		if (!player) return false;
		return true;
	}

	setMatchPlayerSocket(tournamentId: string, matchId: string, playerId: string, socketId: string): boolean {
		const state = this.tournaments.get(tournamentId);
		if (!state) return false;
		const match = state.matchesById.get(matchId);
		if (!match) return false;
		if (playerId !== match.playerId1 && playerId !== match.playerId2) return false;
		const player = state.players.find(p => p.playerId === playerId);
		if (!player) return false;
		return true;
	}
}

// Export singleton instance similar to other managers
export const tournamentManager = new TournamentManager();
export type { TournamentState };


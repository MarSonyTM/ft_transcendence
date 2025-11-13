import { Tournament, TournamentMatch, TournamentPlayer } from '../database/index';

// Lightweight state container for a tournament lifecycle.
// Separate from the manager so it can be serialized, inspected, or replayed.
export class TournamentState {
	tournamentId: string;
	hostId: string;
	status: string; // 'setup' | 'active' | 'completed'
	round: number = 0;
	championId: string | null = null;
	createdAt: string = new Date().toISOString();

	players: TournamentPlayer[] = [];
	matches: TournamentMatch[] = [];
	currentQueue: string[] = []; // matchRoomIds for current round (stack semantics)
	history: string[] = []; // simple log of events

	constructor(base: Tournament) {
		this.tournamentId = base.tournamentId;
		this.hostId = base.players.find(p => p.tpt === 'host')?.playerId || '';
		this.status = base.status;
		this.round = base.allMatches.find(m => m.status === 'active')?.round || 0;
		this.championId = base.championId;
		this.players = base.players.slice();
		this.matches = base.allMatches.slice();
		this.currentQueue = base.allMatches.filter(m => m.round === this.round).map(m => m.matchRoomId);
	}

	log(event: string): void {
		const line = `${new Date().toISOString()} ${event}`;
		this.history.push(line);
	}

	getActivePlayers(): TournamentPlayer[] {
		return this.players.filter(p => !p.eliminated);
	}

	getMatchById(matchRoomId: string): TournamentMatch | undefined {
		return this.matches.find(m => m.matchRoomId === matchRoomId);
	}

	setChampion(playerId: string): void {
		this.championId = playerId;
		this.status = 'completed';
		this.log(`Champion set: ${playerId}`);
	}

	advanceRound(newQueue: string[]): void {
		this.round += 1;
		this.currentQueue = newQueue.slice();
		this.log(`Advanced to round ${this.round}`);
	}

	toPublicJSON() {
		return {
			tournamentId: this.tournamentId,
			status: this.status,
			round: this.round,
			championId: this.championId,
			players: this.players,
			matches: this.matches,
			currentQueue: this.currentQueue,
			history: this.history
		};
	}
}

export type { TournamentMatch, TournamentPlayer };

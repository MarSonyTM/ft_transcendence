import { GameRoom } from '../game/gameRoom';
import { Tournament, TournamentMatch, TournamentPlayer, TournamentStatus } from '../types/index';

export class TournamentState {
	tournamentId: number;
	hostId: number;
	status: TournamentStatus;
	room?: GameRoom | null;
	round: number = 0;
	championId: number | null = null;
	createdAt: string = new Date().toISOString();

	players: TournamentPlayer[] = [];
	matches:  TournamentMatch[] = [];
	currentQueue:TournamentMatch[] = [];
	history: string[] = [];

	constructor(base: Tournament) {
		this.tournamentId = base.id;
		this.hostId = base.players.find(p => p.tpt === 'host')?.id || 0;
		this.status = base.status;
		this.room = base.curM?.room;
		this.round = base.round;
		this.championId = base.players.find(p => p.id === base.championId)?.id || null;
		this.players = base.players.slice();
		this.matches = base.allMatches.slice();
		this.currentQueue = base.matchQueue.slice();
	}

	log(event: string): void {
		const line = `${new Date().toISOString()} ${event}`;
		this.history.push(line);
	}

	getActivePlayers(): TournamentPlayer[] {
		return this.players.filter(p => !p.eliminated);
	}

	setChampion(playerId: number): void {
		this.championId = playerId;
		this.status = 'completed';
		this.log(`Champion set: ${playerId}`);
	}

	toPublicJSON() {
		return {
			tournamentId: this.tournamentId,
			status: this.status,
			room: this.room,
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

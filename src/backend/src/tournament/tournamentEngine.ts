import { TournamentState } from './tournamentState';
import { tournamentManager } from './tournamentManager';
import { broadcastToTournament } from '../websocket/tournamentHandler';

export class TournamentEngine {
	private state: TournamentState;
	private tickTimer: NodeJS.Timeout | null = null;
	private readonly TICK_MS = 1000;

	constructor(state: TournamentState) {
		this.state = state;
	}

	public start(): void {
		if (this.tickTimer) return;
		this.broadcastState();
		this.loop();
	}

	public stop(): void {
		if (this.tickTimer) {
			clearTimeout(this.tickTimer);
			this.tickTimer = null;
		}
	}

	public getCurrentState(): TournamentState {
		return this.state;
	}

	private loop = async () => {
		const next = await tournamentManager.getCurrentMatch(this.state.tournamentId);
		if (next) {
			broadcastToTournament(this.state.tournamentId, {
				type: 'nextMatch',
				matchId: next.id,
				room: next.room,
				round: next.round,
				roundIdx: next.roundIdx
			});
		}
		this.broadcastState();
		this.tickTimer = setTimeout(this.loop, this.TICK_MS);
	};

	private broadcastState(): void {
		broadcastToTournament(this.state.tournamentId, {
			type: 'tournamentState',
			tournament: this.state.toPublicJSON()
		});
	}
}

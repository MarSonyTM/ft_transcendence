import { TournamentState } from './tournamentState';
import { tournamentManager as TManager } from './tournamentManager';
import { broadcastToTournament } from '../websocket/tournamentHandler';

// Minimal tournament engine responsible for sequencing matches and broadcasting state changes.
// It does NOT own the authoritative state (the manager does) but offers a loop-like API to
// pull next matches and notify clients. This mirrors the idea of gameEngine vs gameState.

export class TournamentEngine {
	private state: TournamentState;
	private tickTimer: NodeJS.Timeout | null = null;
	private readonly TICK_MS = 1000; // lightweight periodic broadcast / checks

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

	private loop = () => {
		// Try to fetch current match from manager if none are active in queue
		const next = TManager.getCurrentMatch(this.state.tournamentId);
		if (next) {
			// Announce what's next
			broadcastToTournament(this.state.tournamentId, {
				type: 'nextMatch',
				matchRoomId: next.matchRoomId,
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

export default TournamentEngine;

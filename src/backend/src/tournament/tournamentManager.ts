import {
	TournamentPlayer,
	Tournament,
	TournamentMatch,
	MatchStatus,
	MatchSummary,
	TStatus
} from '../../../shared/tournamentTypes';
import { database } from '../database';
import { activeGames } from '../routes/game';
import { createGameEngine } from '../game/gameEngine';
import { broadcastTournamentUpdate } from '../websocket/websocketHandler';
import { GameState } from '../../../shared/gameTypes';

function nowISO(): string {
	return new Date().toISOString();
}

let activeTournamentId: number | undefined = undefined;

export class TournamentManager {
	private gameMonitors = new Map<number, NodeJS.Timeout>();

	private loadTournamentState(tId: number): Tournament | undefined {
		const t = database.tournaments.getTournamentById(tId);
		if (!t) return undefined;

		const players = database.tournaments.getAllPlayers(tId);
		const matches = database.tournaments.getAllMatches(tId);

		const matchHistory: MatchSummary[] | undefined = matches?.filter(m => m.status === 'completed').map(m => ({
			matchId: m.matchId,
			p1: m.p1!,
			p2: m.p2!,
			winner: m.winner,
			loser: m.loser,
			createdAt: m.createdAt,
			startedAt: m.startedAt,
			finishedAt: m.finishedAt,
		}));

		const inCurrentMatch = t.curMatch ? [t.curMatch.p1, t.curMatch.p2] : [];
		const queue: number[] = players.filter(p => !p.eliminated && !inCurrentMatch.includes(p)).map(p => p.id);

		const data = {
			tId: t.tId,
			status: t.status,
			players,
			queue,
			matches: t.matches,
			curMatch: t.curMatch,
			nextMatches: t.nextMatches,
			matchHistory,
			createdAt: t.createdAt,
			startedAt: t.startedAt,
			finishedAt: t.finishedAt,
			updatedAt: t.updatedAt,
			champion: t.champion,
			matchDelay: t.matchDelay,
		};

		return database.tournaments.updateTournament(tId, data);
	}

	public list(): Tournament[] {
		return database.tournaments.getAllTournaments();
	}

	public getActiveTournament(): Tournament | undefined {
		let t: Tournament | undefined;
		if (activeTournamentId === undefined)
			t = database.tournaments.createTournament();
		else
			t = this.loadTournamentState(activeTournamentId);
		activeTournamentId = t?.tId;
		return t;
	}

	public getTournamentById(tId: number): Tournament | undefined {
		return this.loadTournamentState(tId);
	}

	public async startTournament(players: Array<{name: string, isHost?: boolean, isAI?: boolean, isLocal?: boolean, isRemote?: boolean, isReady?: boolean}> ): Promise<Tournament> {
		if (players.length < 3) throw new Error('At least three players required.');
		const seen = new Set<string>();
		players.forEach(p => {
			const k = p.name.toLowerCase();
			if (seen.has(k)) throw new Error(`Duplicate name: ${p.name}`);
			seen.add(k);
		});

		if (!this.getActiveTournament())
			throw new Error('Failed to get/create active tournament.');
		const tId = activeTournamentId!;
		for (const p of players) {
			p.isReady = p.isAI === true ? true : p.isReady;
			database.tournaments.addPlayer(tId, { ...p });
		}
		const state = this.loadTournamentState(tId)!;
		state.queue = state.players?.map(p => p.id);
		const match = this.createNextMatch(tId, state.queue ? state.queue : []);
		if (match) {
			state.curMatch = match;
			state.status = 'in_progress';
			let canStartMatch = false;

			this.checkAndSetReady(tId, match.matchId);
			if (match.p1?.isReady && match.p2?.isReady) {
				console.log(`🎮 Both players ready, ready to start match ${match.matchId}`);
				canStartMatch = true;
				database.tournaments.updateMatch(tId, match.matchId, { status: 'ready' });
				broadcastTournamentUpdate({
					type: 'match_ready',
					tId: tId,
					matchId: match.matchId
				});
			}
			if (canStartMatch) {
				setTimeout(() => {
					this.startMatch(tId, match.matchId);
				}, state.matchDelay ? state.matchDelay * 1000 : 0);
			}
		} else {
			state.status = 'completed';
			state.champion = state.players?.[0];
		}

		database.tournaments.updateTournament(tId, {
			status: state.status,
			champion: state.champion
		});
		
		broadcastTournamentUpdate({
			type: 'tournament_started',
			tId: tId,
			playerCount: state.players?.length
		});
		return this.loadTournamentState(tId)!;
	}

	public checkAndSetReady(tId: number, matchId: number): Tournament {
		let state = this.loadTournamentState(tId);
		if (!state) throw new Error('Tournament not found.');

		const match = database.tournaments.getMatchById(tId, matchId);
		if (!match) throw new Error('Match not found.');

		if (match.p1 && (match.p1?.tpt === 'ai' || match.p1.isReady)) {
			match.p1.isReady = true;
			state = this.togglePlayerReady(match.p1.id, match.p1.isReady);
		}
		if (match.p2 && (match.p2?.tpt === 'ai' || match.p2.isReady)) {
			match.p2.isReady = true;
			state = this.togglePlayerReady(match.p2.id, match.p2.isReady);
		}
		return state;
	}

	public togglePlayerReady(tPlayerId: number, ready: boolean): Tournament {
		const state = this.getActiveTournament();
		if (!state) throw new Error('No active tournament.');
		if (!state.curMatch || !state.matches) throw new Error('No active match.');

		const p1 = state.curMatch.p1;
		const p2 = state.curMatch.p2;
		if (!p1 || !p2 || (tPlayerId !== p1?.id && tPlayerId !== p2?.id))
			throw new Error('Player not in current match.');
		let mStatus = state.curMatch.status;
		let updated: TournamentMatch | undefined = undefined;

		if (tPlayerId === p1.id) {
			if (p2 && p2.isReady && ready)
				mStatus = 'ready';
			updated = database.tournaments.updateMatch(state.curMatch.tId, state.curMatch.matchId, {
				p1: {
					tId: state.curMatch.tId,
					id: state.curMatch.p1!.id,
					tpt: state.curMatch.p1!.tpt,
					isReady: ready,
					lastActivity: nowISO()
				},
				status: mStatus
			});
		} else if (tPlayerId === p2.id) {
			if (p1 && p1.isReady && ready)
				mStatus = 'ready';
			updated = database.tournaments.updateMatch(state.curMatch.tId, state.curMatch.matchId, {
				p2: {
					tId: state.curMatch.tId,
					id: state.curMatch.p2!.id,
					tpt: state.curMatch.p2!.tpt,
					isReady: ready,
					lastActivity: nowISO()
				},
				status: mStatus
			});
		}

		if (!updated) throw new Error('Failed to update match.');

		if (updated.status === 'ready') {
			setTimeout(() => {
				this.startMatch(state.tId, updated.matchId);
			}, state.matchDelay ? state.matchDelay * 1000 : 0);
			
			broadcastTournamentUpdate({
				type: 'match_ready',
				tId: state.tId,
				matchId: updated.matchId
			});
		} else {
			broadcastTournamentUpdate({
				type: 'player_ready_toggle',
				tId: state.tId,
				playerId: tPlayerId,
				matchId: updated.matchId
			});
		}

		return this.loadTournamentState(state.tId)!;
	}

	public startMatch(tId: number, matchId: number): void {
		const state = this.loadTournamentState(tId);
		if (!state) throw new Error('Unable to load Tournament.');

		let match = database.tournaments.getMatchById(tId, matchId);
		if (!match || match.status !== 'ready') return;
		state.curMatch = match;

		const game = database.games.createGame({ mode: '2P', difficulty: 'normal' });
		const gameState = database.gameState.createGameState({ gameId: game.id });

		state.curMatch = database.tournaments.updateMatch(state.curMatch.tId, state.curMatch.matchId, {
			gameId: gameState.id,
			status: 'in_progress',
			startedAt: nowISO()
		});

		const p1 = state.players?.find(p => p.id === state.curMatch?.p1?.id)!;
		const p2 = state.players?.find(p => p.id === state.curMatch?.p2?.id)!;

		const runtimeGameState = {
			gameId: game.id,
			players: [
				{
					id: p1.id,
					gameId: game.id,
					name: p1.name,
					pos: p1.pos !== undefined ? p1.pos : 70,
					score: p1.score || 0,
					connectionStatus: 'connected',
					lastActivity: nowISO()
				},
				{
					id: p2.id,
					gameId: game.id,
					name: p2.name,
					pos: p2.pos !== undefined ? p2.pos : 70,
					score: p2.score || 0,
					connectionStatus: 'connected',
					lastActivity: nowISO()
				}
			],
			ballPosX: 200,
			ballPosY: 100,
			ballVelX: 0,
			ballVelY: 0,
			mode: '2P',
			lastActivity: nowISO()
		} as GameState;

		const gameEngine = createGameEngine(runtimeGameState, '2P');

		if (p1.tpt === 'ai') {
			console.log(`🤖 Setting player 1 (${p1.name}) as AI`);
			gameEngine.setPlayerAI(1, true, 'normal');
		}
		if (p2.tpt === 'ai') {
			console.log(`🤖 Setting player 2 (${p2.name}) as AI`);
			gameEngine.setPlayerAI(2, true, 'normal');
		}
		
		activeGames.set(game.id, gameEngine);
		gameEngine.startGame();
		console.log(`🎮 Tournament match ${matchId} started with game ${game.id}`);
		
		broadcastTournamentUpdate({
			type: 'match_started',
			tId,
			matchId,
			gameId: game.id,
			player1: p1.name,
			player2: p2.name
		});

		this.monitorGame(tId, matchId, game.id);
	}

	public monitorGame(tId: number, matchId: number, gameId: number): void {
		const checkInterval = setInterval(() => {
			const gameEngine = activeGames.get(gameId);
			if (!gameEngine || !gameEngine.isRunning()) {
				clearInterval(checkInterval);
				this.gameMonitors.delete(gameId);

				if (gameEngine) {
					const finalState = gameEngine.getCurrentState();
					const p1Score = finalState.players[0]?.score || 0;
					const p2Score = finalState.players[1]?.score || 0;

					console.log(`🏁 Tournament match ${matchId} ended. Scores: ${p1Score} - ${p2Score}`);

					const winnerId = p1Score > p2Score ? 1 : 2;

					const state = this.loadTournamentState(tId);
					if (state && state.curMatch) {
						const actualWinnerId = winnerId === 1 ? state.curMatch.p1?.id : state.curMatch.p2?.id;
						this.recordResult({ winnerId: actualWinnerId }, p1Score, p2Score);
					}
				}
			}
		}, 1000);

		this.gameMonitors.set(gameId, checkInterval);
	}

	public recordResult(winner: { name?: string; winnerId?: number }, player1Score?: number, player2Score?: number): Tournament {
		const state = this.getActiveTournament();
		if (!state) throw new Error('No active tournament.');
		if (!state.curMatch) throw new Error('No active match.');

		const { p1: player1, p2: player2, matchId: matchId, gameId: gameId } = state.curMatch;
		const p1 = state.players?.find(p => p.id === player1?.id)!;
		const p2 = state.players?.find(p => p.id === player2?.id)!;
		const winP = this.resolveWinner(winner, [p1, p2]);
		const loseP = winP.id === p1.id ? p2 : p1;

		const winnerScore = winP.id === p1.id ? player1Score : player2Score;
		const loserScore = winP.id === p1.id ? player2Score : player1Score;

		const dbPlayers = database.tournaments.getAllPlayers(state.tId);
		const dbWinner = dbPlayers.find(p => p.id === winP.id);
		const dbLoser = dbPlayers.find(p => p.id === loseP.id);

		if (dbWinner && winnerScore !== undefined) {
			const newWins = dbWinner.wins ? dbWinner.wins + 1 : 1;
			database.tournaments.updatePlayer(state.tId, dbWinner.id, {
				wins: newWins
			});
		}

		if (dbLoser && loserScore !== undefined) {
			const newLosses = dbLoser.losses ? dbLoser.losses + 1 : 1;
			database.tournaments.updatePlayer(state.tId, dbLoser.id, {
				losses: newLosses,
				eliminated: true
			});
		}

		if (state.curMatch) {
			database.tournaments.updateMatch(state.tId, state.curMatch.matchId, {
				winner: winP,
				loser: loseP,
				status: 'completed',
				finishedAt: nowISO()
			});
		}

		if (state.curMatch.gameId) {
			const gameEngine = activeGames.get(state.curMatch.gameId);
			if (gameEngine) {
				gameEngine.endGame();
				activeGames.delete(state.curMatch.gameId);
			}

			const monitor = this.gameMonitors.get(state.curMatch.gameId);
			if (monitor) {
				clearInterval(monitor);
				this.gameMonitors.delete(state.curMatch.gameId);
			}
		}

		const updatedState = this.loadTournamentState(state.tId);
		if (!updatedState) throw new Error('Failed to load updated tournament state.');
		
		// Broadcast match completion
		broadcastTournamentUpdate({
			type: 'match_completed',
			tId: state.tId,
			matchId,
			winnerId: winP.id,
			winnerAlias: winP.name,
			loserId: loseP.id,
			loserAlias: loseP.name,
			scores: {
				player1: player1Score,
				player2: player2Score
			}
		});

		return this.checkEndOrNextMatch(updatedState);
	}

	public checkEndOrNextMatch(state: Tournament): Tournament {
		const alive = state.players.filter(p => !p.eliminated);
		if (alive.length === 1) {
			database.tournaments.updateTournament(state.tId, {
				status: 'completed',
				champion: alive[0],
				finishedAt: nowISO(),
				updatedAt: nowISO()
			});
			console.log(`🏆 Tournament ${state.tId} completed! Champion: ${alive[0].name}`);
			
			broadcastTournamentUpdate({
				type: 'tournament_completed',
				tId: state.tId,
				championId: alive[0].id,
				championAlias: alive[0].name
			});
		} else {
			const queue = alive.map(p => p.id);
			let nextMatch = this.createNextMatch(state.tId, queue);
			if (nextMatch === undefined) {
				console.log(`⚠️ No next match could be created for tournament ${state.tId}`);
				return this.loadTournamentState(state.tId)!;
			}
			console.log(`📋 Next match created for tournament ${state.tId}`);
			
			this.checkAndSetReady(nextMatch.tId, nextMatch.matchId);
			
			// Broadcast next match created
			broadcastTournamentUpdate({
				type: 'next_match_created',
				tId: state.tId,
				matchId: nextMatch.matchId
			});
		}

		return this.loadTournamentState(state.tId)!;
	}

	public createNextMatch(tId: number, queue: number[]): TournamentMatch | undefined {
		if (queue.length < 2) return undefined;

		const p1 = queue.shift();
		const p2 = queue.shift();
		if (p1 == undefined || p2 == undefined) return undefined;
		const player1 = database.tournaments.getAllPlayers(tId).find(p => p.id === p1);
		const player2 = database.tournaments.getAllPlayers(tId).find(p => p.id === p2);
		if (!player1 || !player2) return undefined;

		const match = database.tournaments.createMatch(tId, player1, player2);
		return match;
	}

	public resolveWinner(w: { name?: string; id?: number }, players: TournamentPlayer[]): TournamentPlayer {
		if (w.id != undefined) {
			const p = players.find(pl => pl.id === w.id);
			if (p) return p;
		}
		if (w.name) {
			const low = w.name.toLowerCase();
			const p = players.find(pl => pl.name?.toLowerCase() === low);
			if (p) return p;
		}
		throw new Error('Winner not in current match.');
	}
}

export const TManager = new TournamentManager();

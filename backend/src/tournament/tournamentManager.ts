import {
	TournamentPlayer,
	Tournament,
	TournamentMatch,
	MatchStatus,
	MatchSummary,
	TFormat,
	TStatus
} from '../../../shared/tournamentTypes';
import { database } from '../database';
import { activeGames } from '../routes/game';
import { createGameEngine } from '../game/gameEngine';
import { broadcastTournamentUpdate } from '../websocket/websocketHandler';

function nowISO(): string {
	return new Date().toISOString();
}

let activeTournamentId: number | undefined = undefined;

export class TournamentManager {
	private nextPlayerIdGlobal = 1;
	private gameMonitors = new Map<number, NodeJS.Timeout>();

	private loadTournamentState(tournamentId: number): Tournament | undefined {
		const dbTournament = database.tournaments.getTournamentById(tournamentId);
		if (!dbTournament) return undefined;

		const dbPlayers = database.tournaments.getPlayers(tournamentId);
		const dbMatches = database.tournaments.getMatches(tournamentId);

		const players: TournamentPlayer[] = dbPlayers.map(p => ({
			id: p.id,
			name: p.name,
			gameId: p.gameId,
			tournamentId: p.tournamentId,
			identity: p.identity,
			user: p.user,
			isAI: p.isAI,
			isLocalGuest: p.isLocalGuest,
			isRemote: p.isRemote,
			isHost: p.isHost,
			isReady: p.isReady,
			pos: p.pos,
			score: p.score,
			eliminated: p.eliminated,
			wins: p.wins,
			losses: p.losses,
			totalScore: p.totalScore,
			averageScore: p.averageScore,
			championTimes: p.championTimes,
			connectionStatus: p.connectionStatus,
			lastActivity: p.lastActivity
		}));

		const matchHistory: MatchSummary[] = dbMatches.filter(m => m.status === 'completed' || m.status === 'disputed').map(m => ({
			matchId: m.matchId,
			p1: m.p1!,
			p2: m.p2!,
			winner: m.winner,
			loser: m.loser,
			createdAt: m.createdAt,
			startedAt: m.startedAt,
			finishedAt: m.finishedAt,
			disputeReason: m.disputeReason
		}));

		const currentMatchDb = dbMatches.find(m => m.status === 'in_progress' || m.status === 'ready' || m.status === 'pending');

		const currentMatch: TournamentMatch | undefined = currentMatchDb ? {
			matchId: currentMatchDb.matchId,
			tournamentId: currentMatchDb.tournamentId,
			p1: currentMatchDb.p1,
			p2: currentMatchDb.p2,
			gameId: currentMatchDb.gameId,
			roomId: currentMatchDb.roomId,
			status: currentMatchDb.status as MatchStatus,
			createdAt: currentMatchDb.createdAt,
			startedAt: currentMatchDb.startedAt,
			finishedAt: currentMatchDb.finishedAt,
			winner: currentMatchDb.winner,
			loser: currentMatchDb.loser
		} : undefined;

		const inCurrentMatch = currentMatch ? [currentMatch.p1, currentMatch.p2] : [];
		const queue = players.filter(p => !p.eliminated && !inCurrentMatch.includes(p)).map(p => p.id);

		return {
			tournamentId: dbTournament.tournamentId,
			status: dbTournament.status,
			gameStates: dbTournament.gameStates,
			createdAt: dbTournament.createdAt,
			startedAt: dbTournament.startedAt,
			finishedAt: dbTournament.finishedAt,
			updatedAt: dbTournament.updatedAt,
			players,
			queue,
			matches: dbTournament.matches,
			nextMatches: dbTournament.nextMatches,
			currentMatch,
			matchHistory,
			champion: dbTournament.champion,
			format: dbTournament.format,
			matchDelay: dbTournament.matchDelay,
			};
	}

	public list(): Tournament[] {
		const dbTournaments = database.tournaments.getAllTournaments();
		return dbTournaments.map(t => this.loadTournamentState(t.tournamentId!)).filter(t => t !== undefined) as Tournament[];
	}

	public getActive(): Tournament | undefined {
		if (activeTournamentId === undefined) return undefined;
		return this.loadTournamentState(activeTournamentId);
	}

	public getById(id: number): Tournament | undefined {
		return this.loadTournamentState(id);
	}

	public newTournament(format: TFormat = 'single_elimination'): Tournament {
		const dbTournament = database.tournaments.createTournament(format);
		activeTournamentId = dbTournament.tournamentId;

		const state: Tournament = {
			tournamentId: dbTournament.tournamentId,
			status: 'idle',
			format: dbTournament.format || format,
			gameStates: [],
			players: [],
			queue: [],
			matches: [],
			currentMatch: undefined,
			nextMatches: [],
			matchHistory: [],
			createdAt: dbTournament.createdAt,
			startedAt: '',
			finishedAt: '',
			updatedAt: dbTournament.updatedAt,
			champion: dbTournament.champion,
			matchDelay: dbTournament.matchDelay,
		};

		return state;
	}

	public async startTournament(players: Array<{alias: string, isAI?: boolean, isLocalGuest?: boolean, isRemote?: boolean, isHost?: boolean, isReady?: boolean}> ): Promise<Tournament> {
		if (players.length < 3) throw new Error('At least three players required.');

		const seen = new Set<string>();
		players.forEach(p => {
			const k = p.alias.toLowerCase();
			if (seen.has(k)) throw new Error(`Duplicate alias: ${p.alias}`);
			seen.add(k);
		});

		if (!activeTournamentId) this.newTournament();

		const tournamentId = activeTournamentId!;

		for (const player of players) {
			const user = await database.users.getUserByUsername(player.alias) || undefined;

			const playerId = this.nextPlayerIdGlobal++;
			database.tournaments.addPlayer(playerId, tournamentId, player.isAI, player.isLocalGuest, player.isRemote, player.isHost, player.isReady);
			
			// Auto-ready AI players
			if (player.isAI) {
				const dbPlayers = database.tournaments.getPlayers(tournamentId);
				const dbPlayer = dbPlayers.find(p => p.id === playerId);
				if (dbPlayer) {
					database.tournaments.updatePlayer(dbPlayer.id, { isReady: true });
					console.log(`🤖 AI player ${player.alias} automatically set to ready`);
				}
			}
		}

		const state = this.loadTournamentState(tournamentId)!;

		state.queue = state.players?.map(p => p.id);
		const match = this.createNextMatch(tournamentId, state.queue ? state.queue : []);

		if (match) {
			state.currentMatch = {
				matchId: match.matchId,
				tournamentId: match.tournamentId,
				gameId: match.gameId,
				roomId: match.roomId,
				status: match.status,
				p1: match.p1,
				p2: match.p2,
				winner: match.winner,
				loser: match.loser,
				createdAt: match.createdAt,
				startedAt: match.startedAt,
				finishedAt: match.finishedAt,
				disputeReason: match.disputeReason,
				round: match.round,
				indexInRound: match.indexInRound,
				nextMatchId: match.nextMatchId,
				nextSlot: match.nextSlot
			};
			state.status = 'in_progress';

			// Auto-ready AI players in the match
			const p1 = state.players?.find(p => p.id === match.p1?.id);
			const p2 = state.players?.find(p => p.id === match.p2?.id);

			const dbMatches = database.tournaments.getMatches(tournamentId);
			const matchDb = dbMatches.find(m => m.matchId === match.matchId);
		
			if (matchDb) {
				let autoStartMatch = false;

				if (p1?.isAI && match.p1) {
					p1.isReady = true;
					match.p1.isReady = true;
					state.currentMatch!.p1!.isReady = true;
					database.tournaments.updateMatch(matchDb.matchId, { p1 });
					console.log(`🤖 AI player ${p1.name} auto-ready for match ${match.matchId}`);
				}
				
				if (p2?.isAI && match.p2) {
					p2.isReady = true;
					match.p2.isReady = true;
					state.currentMatch!.p2!.isReady = true;
					database.tournaments.updateMatch(matchDb.matchId, { p2 });
					console.log(`🤖 AI player ${p2.name} auto-ready for match ${match.matchId}`);
				}
				
				// Auto-start if both players are ready
				if (match.p1?.isReady && match.p2?.isReady) {
					console.log(`🎮 Both players ready, auto-starting match ${match.matchId}`);
					autoStartMatch = true;

					database.tournaments.updateMatch(matchDb.matchId, { status: 'ready' });

					broadcastTournamentUpdate({
						type: 'match_ready',
						tournamentId,
						matchId: match.matchId
					});
				}
				
				if (autoStartMatch) {
					setTimeout(() => {
						this.startMatch(tournamentId, match.matchId);
					}, state.matchDelay ? state.matchDelay * 1000 : 0);
				}
			}
		} else {
			state.status = 'completed';
			state.champion = state.players?.[0];
		}

		database.tournaments.updateTournament(tournamentId, {
			status: state.status as TStatus,
			champion: state.champion
		});
		
		// Broadcast tournament start
		broadcastTournamentUpdate({
			type: 'tournament_started',
			tournamentId,
			playerCount: state.players?.length
		});

		return this.loadTournamentState(tournamentId)!;
	}

	public togglePlayerReady(playerId: number): Tournament {
		const state = this.getActive();
		if (!state) throw new Error('No active tournament.');
		if (!state.currentMatch) throw new Error('No active match.');

		const { p1: player1, p2: player2 } = state.currentMatch;
		if (playerId !== player1?.id && playerId !== player2?.id) throw new Error('Player not in current match.');

		const dbMatches = database.tournaments.getMatches(state.tournamentId);
		const currentMatchDb = dbMatches.find(m => m.matchId === state.currentMatch!.matchId);
		if (!currentMatchDb) throw new Error('Match not found in database.');

		if (playerId === player1?.id) {
			database.tournaments.updateMatch(currentMatchDb.matchId, {
				p1: {
					id: currentMatchDb.p1?.id!,
					isReady: currentMatchDb.p1?.isReady,
					lastActivity: nowISO()
				}
			});
		} else {
			database.tournaments.updateMatch(currentMatchDb.matchId, {
				p2: {
					id: currentMatchDb.p2?.id!,
					isReady: !currentMatchDb.p2?.isReady,
					lastActivity: nowISO()
				}
			});
		}

		const dbPlayers = database.tournaments.getPlayers(state.tournamentId);
		const dbPlayer = dbPlayers.find(p => p.id === playerId);
		if (dbPlayer) {
			database.tournaments.updatePlayer(dbPlayer.id, {
				isReady: dbPlayer.isReady
			});
		}

		const updatedState = this.loadTournamentState(state.tournamentId)!;

		if (updatedState.currentMatch?.p1?.isReady && updatedState.currentMatch?.p2?.isReady) {
			setTimeout(() => {
				this.startMatch(state.tournamentId, updatedState.currentMatch!.matchId);
			}, state.matchDelay ? state.matchDelay * 1000 : 0);

			database.tournaments.updateMatch(currentMatchDb.matchId, {
				status: 'ready'
			});
			
			// Broadcast ready state change
			broadcastTournamentUpdate({
				type: 'match_ready',
				tournamentId: state.tournamentId,
				matchId: updatedState.currentMatch.matchId
			});
		} else {
			// Broadcast player ready toggle
			broadcastTournamentUpdate({
				type: 'player_ready_toggle',
				tournamentId: state.tournamentId,
				playerId,
				matchId: updatedState.currentMatch!.matchId
			});
		}

		return this.loadTournamentState(state.tournamentId)!;
	}

	public startMatch(tournamentId: number, matchId: number): void {
		const state = this.loadTournamentState(tournamentId);
		if (!state || !state.currentMatch) return;

		const dbMatches = database.tournaments.getMatches(tournamentId);
		const matchDb = dbMatches.find(m => m.matchId === matchId);
		if (!matchDb) return;

		const game = database.games.createGame({ mode: '2P', difficulty: 'normal' });

		database.tournaments.updateMatch(matchDb.matchId, {
			gameId: game.id,
			status: 'in_progress',
			startedAt: nowISO()
		});

		database.gameState.createGameState({ gameId: game.id });

		const p1 = state.players?.find(p => p.id === state.currentMatch!.p1?.id)!;
		const p2 = state.players?.find(p => p.id === state.currentMatch!.p2?.id)!;

		const runtimeGameState = {
			gameId: game.id,
			players: [
				{
					id: p1.id,
					gameId: game.id,
					name: p1.name,
					pos: p1.pos || 0,
					score: p1.score || 0,
					connectionStatus: 'connected',
					lastActivity: nowISO()
				},
				{
					id: p2.id,
					gameId: game.id,
					name: p2.name,
					pos: p2.pos || 0,
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
		} as any;

		const gameEngine = createGameEngine(runtimeGameState, '2P');
		
		// Set up AI players
		if (p1.isAI) {
			console.log(`🤖 Setting player 1 (${p1.name}) as AI`);
			gameEngine.setPlayerAI(1, true, 'normal');
		}
		if (p2.isAI) {
			console.log(`🤖 Setting player 2 (${p2.name}) as AI`);
			gameEngine.setPlayerAI(2, true, 'normal');
		}
		
		activeGames.set(game.id, gameEngine);
		gameEngine.startGame();	console.log(`🎮 Tournament match ${matchId} started with game ${game.id}`);
		
		// Broadcast match start
		broadcastTournamentUpdate({
			type: 'match_started',
			tournamentId,
			matchId,
			gameId: game.id,
			player1: p1.name,
			player2: p2.name
		});

		this.monitorGame(tournamentId, matchId, game.id);
	}

	public monitorGame(tournamentId: number, matchId: number, gameId: number): void {
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

					const state = this.loadTournamentState(tournamentId);
					if (state && state.currentMatch) {
						const actualWinnerId = winnerId === 1 ? state.currentMatch.p1?.id : state.currentMatch.p2?.id;
						this.recordResult({ id: actualWinnerId }, p1Score, p2Score);
					}
				}
			}
		}, 1000);

		this.gameMonitors.set(gameId, checkInterval);
	}

	public recordResult(winner: { name?: string; id?: number }, player1Score?: number, player2Score?: number): Tournament {
		const state = this.getActive();
		if (!state) throw new Error('No active tournament.');
		if (!state.currentMatch) throw new Error('No active match.');

		const { p1: player1, p2: player2, matchId: matchId, gameId } = state.currentMatch;
		const p1 = state.players?.find(p => p.id === player1?.id)!;
		const p2 = state.players?.find(p => p.id === player2?.id)!;
		const winP = this.resolveWinner(winner, [p1, p2]);
		const loseP = winP.id === p1.id ? p2 : p1;

		const winnerScore = winP.id === p1.id ? player1Score : player2Score;
		const loserScore = winP.id === p1.id ? player2Score : player1Score;

		const dbPlayers = database.tournaments.getPlayers(state.tournamentId);
		const dbWinner = dbPlayers.find(p => p.id === winP.id);
		const dbLoser = dbPlayers.find(p => p.id === loseP.id);

		if (dbWinner && winnerScore !== undefined) {
			const newTotalScore = dbWinner.totalScore ? dbWinner.totalScore + winnerScore : winnerScore;
			const newWins = dbWinner.wins ? dbWinner.wins + 1 : 1;
			database.tournaments.updatePlayer(dbWinner.id, {
				wins: newWins,
				totalScore: newTotalScore,
				averageScore: newTotalScore / (newWins + (dbWinner.losses ? dbWinner.losses : 0))
			});
		}

		if (dbLoser && loserScore !== undefined) {
			const newTotalScore = dbLoser.totalScore ? dbLoser.totalScore + loserScore : loserScore;
			const newLosses = dbLoser.losses ? dbLoser.losses + 1 : 1;
			database.tournaments.updatePlayer(dbLoser.id, {
				losses: newLosses,
				eliminated: true,
				totalScore: newTotalScore,
				averageScore: newTotalScore / (dbLoser.wins ? dbLoser.wins + newLosses : newLosses)
			});
		}

		const dbMatches = database.tournaments.getMatches(state.tournamentId);
		const matchDb = dbMatches.find(m => m.matchId === matchId);
		if (matchDb) {
			database.tournaments.updateMatch(matchDb.matchId, {
				winner: winP,
				loser: loseP,
				p1: {
					id: p1.id!,
					isReady: !p1.isReady,
					pos: p1.pos,
					score: p1.score!,
					eliminated: p1.eliminated,
					wins: p1.wins,
					losses: p1.losses,
					totalScore: p1.totalScore,
					averageScore: p1.averageScore,
					championTimes: p1.championTimes,
					connectionStatus: p1.connectionStatus!,
					lastActivity: p1.lastActivity!
				},
				p2: {
					id: p2.id!,
					isReady: !p2.isReady,
					pos: p2.pos,
					score: p2.score!,
					eliminated: p2.eliminated,
					wins: p2.wins,
					losses: p2.losses,
					totalScore: p2.totalScore,
					averageScore: p2.averageScore,
					championTimes: p2.championTimes,
					connectionStatus: p2.connectionStatus!,
					lastActivity: p2.lastActivity!
				},
				status: 'completed',
				finishedAt: nowISO()
			});
		}

		if (gameId) {
			const gameEngine = activeGames.get(gameId);
			if (gameEngine) {
				gameEngine.endGame();
				activeGames.delete(gameId);
			}

			const monitor = this.gameMonitors.get(gameId);
			if (monitor) {
				clearInterval(monitor);
				this.gameMonitors.delete(gameId);
			}
		}

		const updatedState = this.loadTournamentState(state.tournamentId)!;
		
		// Broadcast match completion
		broadcastTournamentUpdate({
			type: 'match_completed',
			tournamentId: state.tournamentId,
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

		const alive = updatedState.players.filter(p => !p.eliminated);
		if (alive.length === 1) {
			database.tournaments.updateTournament(state.tournamentId, {
				status: 'completed',
				champion: alive[0]
			});
			console.log(`🏆 Tournament ${state.tournamentId} completed! Champion: ${alive[0].name}`);
			
			// Broadcast tournament completion
			broadcastTournamentUpdate({
				type: 'tournament_completed',
				tournamentId: state.tournamentId,
				championId: alive[0].id,
				championAlias: alive[0].name
			});
		} else {
			const queue = alive.map(p => p.id);
			this.createNextMatch(state.tournamentId, queue);
			console.log(`📋 Next match created for tournament ${state.tournamentId}`);

			// Auto-ready AI players in the newly created match
			const dbPlayers = database.tournaments.getPlayers(state.tournamentId);
			const dbMatches = database.tournaments.getMatches(state.tournamentId);
			const newMatch = dbMatches[dbMatches.length - 1]; // Get the just-created match
			
			if (newMatch) {
				const p1 = dbPlayers.find(p => p.id === newMatch.p1?.id);
				const p2 = dbPlayers.find(p => p.id === newMatch.p2?.id);

				if (p1?.isAI) {
					database.tournaments.updateMatch(newMatch.matchId, {
						p1: {
							id: p1.id!,
							isReady: true,
							lastActivity: nowISO()
						}
					});
					console.log(`🤖 Auto-readied AI player: ${p1.name}`);
				}
				if (p2?.isAI) {
					database.tournaments.updateMatch(newMatch.matchId, {
						p2: {
							id: p2.id!,
							isReady: true,
							lastActivity: nowISO()
						}
					});
					console.log(`🤖 Auto-readied AI player: ${p2.name}`);
				}
				
				// Check if both are now ready and auto-start if needed
				const updatedMatch = database.tournaments.getMatches(state.tournamentId).find(m => m.matchId === newMatch.matchId);
				if (updatedMatch && updatedMatch.p1?.isReady && updatedMatch.p2?.isReady) {
					database.tournaments.updateMatch(newMatch.matchId, { status: 'ready' });
					console.log(`🎮 Both players ready, auto-starting match in ${state.matchDelay}s`);
					
					// Broadcast match ready
					broadcastTournamentUpdate({
						type: 'match_ready',
						tournamentId: state.tournamentId,
						matchId: updatedMatch.matchId
					});
					
					// Auto-start the match after delay
					setTimeout(() => {
						this.startMatch(state.tournamentId, updatedMatch.matchId);
					}, state.matchDelay ? state.matchDelay * 1000 : 0);
				}
			}
			
			// Broadcast next match created
			broadcastTournamentUpdate({
				type: 'next_match_created',
				tournamentId: state.tournamentId
			});
		}

		return this.loadTournamentState(state.tournamentId)!;
	}

	public requestRematch(matchId: number, reason: string): Tournament {
		const state = this.getActive();
		if (!state) throw new Error('No active tournament.');

		const dbMatches = database.tournaments.getMatches(state.tournamentId);
		const matchDb = dbMatches.find(m => m.matchId === matchId);
		if (!matchDb) throw new Error('Match not found.');

		if (matchDb.gameId) {
			const gameEngine = activeGames.get(matchDb.gameId);
			if (gameEngine) {
				gameEngine.endGame();
				activeGames.delete(matchDb.gameId);
			}

			const monitor = this.gameMonitors.get(matchDb.gameId);
			if (monitor) {
				clearInterval(monitor);
				this.gameMonitors.delete(matchDb.gameId);
			}
		}

		database.tournaments.updateMatch(matchDb.matchId, {
			status: 'disputed',
			disputeReason: reason,
			gameId: undefined,
			p1: {
				id: matchDb.p1?.id!,
				name: matchDb.p1?.name,
				gameId: matchDb.p1?.gameId,
				tournamentId: matchDb.p1?.tournamentId,
				identity: matchDb.p1?.identity,
				user: matchDb.p1?.user,
				isAI: matchDb.p1?.isAI,
				isLocalGuest: matchDb.p1?.isLocalGuest,
				isRemote: matchDb.p1?.isRemote,
				isHost: matchDb.p1?.isHost,
				isReady: false,
				pos: matchDb.p1?.pos,
				score: matchDb.p1?.score!,
				eliminated: matchDb.p1?.eliminated,
				wins: matchDb.p1?.wins,
				losses: matchDb.p1?.losses,
				totalScore: matchDb.p1?.totalScore,
				averageScore: matchDb.p1?.averageScore,
				championTimes: matchDb.p1?.championTimes,
				connectionStatus: matchDb.p1?.connectionStatus!,
				lastActivity: matchDb.p1?.lastActivity!
			},
			p2: {
				id: matchDb.p2?.id!,
				name: matchDb.p2?.name,
				gameId: matchDb.p2?.gameId,
				tournamentId: matchDb.p2?.tournamentId,
				identity: matchDb.p2?.identity,
				user: matchDb.p2?.user,
				isAI: matchDb.p2?.isAI,
				isLocalGuest: matchDb.p2?.isLocalGuest,
				isRemote: matchDb.p2?.isRemote,
				isHost: matchDb.p2?.isHost,
				isReady: false,
				pos: matchDb.p2?.pos,
				score: matchDb.p2?.score!,
				eliminated: matchDb.p2?.eliminated,
				wins: matchDb.p2?.wins,
				losses: matchDb.p2?.losses,
				totalScore: matchDb.p2?.totalScore,
				averageScore: matchDb.p2?.averageScore,
				championTimes: matchDb.p2?.championTimes,
				connectionStatus: matchDb.p2?.connectionStatus!,
				lastActivity: matchDb.p2?.lastActivity!
			},
			winner: undefined,
			loser: undefined
		});

		const dbPlayers = database.tournaments.getPlayers(state.tournamentId);
		const p1 = dbPlayers.find(p => p.id === matchDb.p1?.id);
		const p2 = dbPlayers.find(p => p.id === matchDb.p2?.id);

		if (p1) database.tournaments.updatePlayer(p1.id, { isReady: false, eliminated: false });
		if (p2) database.tournaments.updatePlayer(p2.id, { isReady: false, eliminated: false });

		console.log(`⚠️ Match ${matchId} disputed: ${reason}`);
		
		// Broadcast dispute
		broadcastTournamentUpdate({
			type: 'match_disputed',
			tournamentId: state.tournamentId,
			matchId,
			reason
		});

		return this.loadTournamentState(state.tournamentId)!;
	}

	public resolveDispute(matchId: number): Tournament {
		const state = this.getActive();
		if (!state) throw new Error('No active tournament.');

		const dbMatches = database.tournaments.getMatches(state.tournamentId);
		const matchDb = dbMatches.find(m => m.matchId === matchId);
		if (!matchDb || matchDb.status !== 'disputed') throw new Error('Match not found or not disputed.');

		database.tournaments.updateMatch(matchDb.matchId, {
			status: 'pending',
			disputeReason: undefined,
			p1: {
				id: matchDb.p1?.id!,
				name: matchDb.p1?.name,
				gameId: matchDb.p1?.gameId,
				tournamentId: matchDb.p1?.tournamentId,
				identity: matchDb.p1?.identity,
				user: matchDb.p1?.user,
				isAI: matchDb.p1?.isAI,
				isLocalGuest: matchDb.p1?.isLocalGuest,
				isRemote: matchDb.p1?.isRemote,
				isHost: matchDb.p1?.isHost,
				isReady: false,
				pos: matchDb.p1?.pos,
				score: 0,
				eliminated: matchDb.p1?.eliminated,
				wins: matchDb.p1?.wins,
				losses: matchDb.p1?.losses,
				totalScore: matchDb.p1?.totalScore,
				averageScore: matchDb.p1?.averageScore,
				championTimes: matchDb.p1?.championTimes,
				connectionStatus: matchDb.p1?.connectionStatus!,
				lastActivity: matchDb.p1?.lastActivity!
			},
			p2: {
				id: matchDb.p2?.id!,
				name: matchDb.p2?.name,
				gameId: matchDb.p2?.gameId,
				tournamentId: matchDb.p2?.tournamentId,
				identity: matchDb.p2?.identity,
				user: matchDb.p2?.user,
				isAI: matchDb.p2?.isAI,
				isLocalGuest: matchDb.p2?.isLocalGuest,
				isRemote: matchDb.p2?.isRemote,
				isHost: matchDb.p2?.isHost,
				isReady: false,
				pos: matchDb.p2?.pos,
				score: 0,
				eliminated: matchDb.p2?.eliminated,
				wins: matchDb.p2?.wins,
				losses: matchDb.p2?.losses,
				totalScore: matchDb.p2?.totalScore,
				averageScore: matchDb.p2?.averageScore,
				championTimes: matchDb.p2?.championTimes,
				connectionStatus: matchDb.p2?.connectionStatus!,
				lastActivity: matchDb.p2?.lastActivity!
			},
			winner: undefined,
			loser: undefined,
		});

		console.log(`✅ Match ${matchId} dispute resolved, ready for rematch`);
		
		// Broadcast dispute resolution
		broadcastTournamentUpdate({
			type: 'dispute_resolved',
			tournamentId: state.tournamentId,
			matchId
		});

		return this.loadTournamentState(state.tournamentId)!;
	}

	public resetActive(): void {
		if (activeTournamentId) {
			const state = this.loadTournamentState(activeTournamentId);
			if (state?.currentMatch?.gameId) {
				const gameEngine = activeGames.get(state.currentMatch.gameId);
				if (gameEngine) {
					gameEngine.endGame();
					activeGames.delete(state.currentMatch.gameId);
				}
			}
		}

		this.gameMonitors.forEach(monitor => clearInterval(monitor));
		this.gameMonitors.clear();

		activeTournamentId = undefined;
	}

	public createNextMatch(tournamentId: number, queue: number[]): TournamentMatch | undefined {
		if (queue.length < 2) return undefined;

		const p1 = queue.shift();
		const p2 = queue.shift();
		if (p1 == undefined || p2 == undefined) return undefined;
		const player1 = database.tournaments.getPlayers(tournamentId).find(p => p.id === p1);
		const player2 = database.tournaments.getPlayers(tournamentId).find(p => p.id === p2);
		if (!player1 || !player2) return undefined;

		const dbMatches = database.tournaments.getMatches(tournamentId);
		const matchNumber = dbMatches.length + 1;

		const match = database.tournaments.createMatch(tournamentId, matchNumber, player1, player2);
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

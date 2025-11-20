import { database, User } from "../database/index";
import { TPT, Tournament, TournamentMatch, TournamentPlayer } from "../types/index";
import { BaseGameEngine } from "../game/gameEngine";
import { GameState, Player } from "../../../shared/gameTypes";
import { activeGames } from "../routes/game";
// import { TournamentState } from './tournamentState';
import { broadcastToMatch, broadcastToTournament, broadcastCountdownToMatch, broadcastGameStartToMatch, publicMatchShape, publicTournamentShape } from '../websocket/tournamentHandler';

const db = database.tournaments;

class TournamentManager {
	private minPlayers: number = 3;
	private maxPlayers: number = 10;

	constructor() {}

	async createTournament(name: string, id: number): Promise<Tournament | null> {
		try {
			let t = db.createTournament({ });
			if (!t) throw new Error('Failed to create tournament in database');

			if (!(await this.addPlayerToTournament(t.id, name, 'host', id)))
				throw new Error('Failed to add host player to tournament');

			let x = db.getTournamentById(t.id);
			if (!x) throw new Error('Failed to retrieve tournament after creation');
			console.log(`✅ Tournament created: ${t.id} by ${name || 'anonymous'}, players:`, t.players.length);
			return t;
		} catch (error) {
			console.error('Failed to create tournament and/or player in database:', error);
			throw error;
		}
	}

	async addPlayerToTournament(tournamentId: number, name: string, tpt: TPT, userId?: number): Promise<TournamentPlayer | null> {
		let t: Tournament | null;
		try {
			t = db.getTournamentById(tournamentId);
			if (!t) {
				console.error('[Tournament] Tournament not found', { tournamentId });
				return null;
			}
		} catch (e) {
			console.error('[Tournament] Error in addPlayerToTournament:', e);
			throw e;
		}
		
		if (t.status !== 'setup') {
			console.warn('[Tournament] Cannot join: status not setup', { tournamentId, status: t.status });
			return null;
		}
		if (t.players.length >= this.maxPlayers) {
			console.warn('[Tournament] Cannot join: max players reached', { tournamentId, current: t.players.length, max: this.maxPlayers });
			return null;
		}
		if (t.players.find(p => p.name === name)) {
			console.warn('[Tournament] Cannot join: duplicate name', { tournamentId, name });
			return null;
		}
		try {
			const player = db.createPlayer({
					tournamentId,
					tpt,
					name,
					isReady: tpt === 'ai',
					userId: userId ? userId : null
			});
			if (!player) throw new Error('[Tournament] createPlayer failed');
			t = db.getTournamentById(tournamentId);
			if (!t) throw new Error('[Tournament] Failed to refresh tournament after adding player');
			const alreadyPresent = t.players.some(p => p.id === player.id);
			if (!alreadyPresent) {
				t.players.push(player);
				db.updateTournament(t.id, { players: t.players });
			}
			console.log(`✅ ${name} joined tournament ${tournamentId}`);
			return player;
		} catch (err) {
			console.error('[Tournament] createPlayer failed:', err);
			throw err;
		}
	}

	async leaveTournament(tournamentId: number, playerId: number): Promise<boolean> {
		try {
			let t = db.getTournamentById(tournamentId);
			if (!t) return false;
			if (t.status === 'completed' || t.status === 'archived') return false;
			if (t.status === 'setup') {
				if (!db.deletePlayer(playerId)) return false;
				console.log(`🚪 Player ${playerId} left tournament ${tournamentId} during setup`);
			}
			else {
				db.updatePlayer({ id: playerId, eliminated: true });
				console.log(`🚪 Player ${playerId} got eliminated`);
			}
			return true;
		} catch (error) {
			console.error('leaveTournament unexpected error:', error);
			return false;
		}
	}

	/* -------------------------------------------------- */
	/* Bracket / Match Helpers                            */
	/* -------------------------------------------------- */
	private async createMatch(tId: number, roundIdx: number, round: number, bye: boolean = false): Promise<TournamentMatch | null> {
		try {
			const match = db.createMatch({ tournamentId: tId, round, roundIdx, isBye: bye, status: 'setup' });
			if (!match) return null;
			console.log(`[Tournament] Created match ${match.id} (round ${round}${bye ? ', bye' : ''}) in tournament ${tId}`);
			return match;
		} catch (err) {
			console.error(`[Tournament] Failed to create match:`, err);
			return null;
		}
	}

	private async isQueueEmpty(tId: number): Promise<boolean> {
		try {
			let t = db.getTournamentById(tId);
			if (!t) throw new Error('[Tournament] Failed to retrieve tournament in isQueueEmpty');
			if (t.matchQueue.length > 0) return false;
			return true;
		} catch (err) {
			console.error('[Tournament] isQueueEmpty unexpected error:', err);
			return false;
		}
	}

	private async getNextMatches(tId: number): Promise<boolean> {
		try {
			let t = db.getTournamentById(tId);
			if (!t) throw new Error('[Tournament] Failed to retrieve tournament in getNextMatches');
			t.round++;
			let matches = db.getAllMatches(tId).filter((m: TournamentMatch) => m.round === t.round);
			if (matches.length === 0) {
				console.log('[Tournament] No matches found for next round');
				return false;
			}
			db.updateTournament(tId, { round: t.round, matchQueue: matches });
			return true;
		} catch (err) {
			console.error('[Tournament] getNextMatches unexpected error:', err);
			return false;
		}
	}

	private async assignPlayersToMatches(tId: number, players: TournamentPlayer[]): Promise<boolean> {
		try {
			let t = db.getTournamentById(tId);
			if (!t) throw new Error('[Tournament] Failed to retrieve tournament in assignPlayersToMatches');
			for (const m of t.matchQueue) {
				let a = players.shift();
				let b = players.shift();
				if (!a && !b) throw new Error('[Tournament] No players available for assignment');
				if (a && b && b.tpt === 'host') {
					[a, b] = this.swapPlayers(a, b);
				}
				if (a)
					m.p1 = db.getPlayerById(a.id) || undefined;//a;
				if (!m.p1) throw new Error('[Tournament] Not enough players to assign to match');
				if (!m.isBye && b) {
					m.p2 = db.getPlayerById(b.id) || undefined;//b;
					if (!m.p2) throw new Error('[Tournament] getPlayerById failed');
				} else {
					// m.winnerId = m.p1.id;//TODO check if compute winner does this already
				}
				m.status = 'pending';
				db.updateMatch({ id: m.id, p1: m.p1, p2: m.p2, status: m.status, winnerId: m.winnerId });
				t = db.updateTournament(tId, t);
				if (!t) throw new Error('[Tournament] updateTournament failed');
			}
			if (players.length > 0) throw new Error('[Tournament] Not all players were assigned to matches');
			// t.matchQueue = t.allMatches.filter(m => m.round === t!.round && m.status === 'pending');
			t.matchQueue.sort((a, b) => a.roundIdx - b.roundIdx);
			t.curM = t.matchQueue.shift() || null;
			db.updateTournament(tId, t);
			return true;
		} catch (err) {
			console.error('[Tournament] assignPlayersToMatches unexpected error:', err);
			return false;
		}
	}

	async insertPlayersIntoNextRound(tId: number): Promise<boolean> {
		try {
			let t = db.getTournamentById(tId);
			if (!t) throw new Error('[Tournament] Failed to retrieve tournament in insertPlayersIntoNextRound');
			if (t.round === 0 && t.players.length < this.minPlayers) {
				console.log('[Tournament] Not enough players to insert into next round');
				return false;
			}
			if (!(await this.isQueueEmpty(tId))) return false;
			console.debug('[Tournament] Inserting players into next round');
			let players = db.getAllPlayers(tId).filter((p: TournamentPlayer) => !p.eliminated).slice();
			if (players.length === 0) {
				console.debug('[Tournament] No remaining players to insert into next round');
				return false;
			} else if (players.length === 1)
				return await this.endTournament(tId);
			else {
				this.shuffle(players);
				if (!(await this.getNextMatches(tId)))//ups the round and fills queue with pending matches
					return false;
				if (!(await this.assignPlayersToMatches(tId, players)))//assigns players and sets current match, DOES NOT set bye match winner or status!
					return false;
				// let t = db.getTournamentById(tId);
				// if (!t) throw new Error('[Tournament] Failed to retrieve tournament in insertPlayersIntoNextRound');
				// if (!t.currentMatch)
				// 	return false;
				// if (t.currentMatch.isBye) {
				// 	await this.endMatch(tId, t.currentMatch.id);
					// let nt = await db.getTournamentById(tId);
					// if (nt) {
					// 	nt.currentMatch = nt.matchQueue.shift() || null;
					// 	await db.updateTournament(tId, { currentMatch: nt.currentMatch, matchQueue: nt.matchQueue });
					// }
				// }
			}
			// t = db.getTournamentById(tId);
			// if (!t) throw new Error('Failed to retrieve tournament in insertPlayersIntoNextRound');
			// console.debug('[Tournament] matchQueue unsorted: ', t.matchQueue);
			// t.matchQueue.sort((a, b) => b.roundIdx - a.roundIdx);//ALREADY DONE by assignPlayersToMatches
			// console.debug('[Tournament] matchQueue sorted: ', t.matchQueue);
			// t.currentMatch = t.matchQueue.shift() || null;//ALREADY DONE by assignPlayersToMatches
			// await db.updateTournament(tId, { currentMatch: t.currentMatch, matchQueue: t.matchQueue });
			console.log('[Tournament] Players inserted into next round');
			return true;
		} catch (err) {
			console.error('[Tournament] insertPlayersIntoNextRound unexpected error:', err);
			return false;
		}
	}

	async setupMatches(tId: number): Promise<boolean> {
		try {
			let t = db.getTournamentById(tId);
			if (!t) throw new Error('[Tournament] Failed to retrieve tournament in setupMatches');
			let playerCount = t.players.length;
			console.log('[Tournament] Number of players:', playerCount);
			if (playerCount < this.minPlayers) {
				console.warn('[Tournament] Not enough players to setup matches');
				return false;
			}

			let round = 1;
			let amount = Math.floor(playerCount / 2);
			let bye = playerCount % 2 === 1;

			while (amount > 0) {
				let i = 0;
				let match: TournamentMatch | null;
				for (; i < amount; i++) {
					match = await this.createMatch(tId, i, round, false);
					if (!match) throw new Error('[Tournament] createMatch failed');
					t.allMatches.push(match);
				}
				if (i === amount && bye) {
					match = await this.createMatch(tId, i, round, true);
					if (!match) throw new Error('[Tournament] createMatch failed');
					t.allMatches.push(match);
				}
				console.debug(`[Tournament] Round ${round} matches created: ${amount}${bye ? ' + bye' : ''}`);

				playerCount = amount + (bye ? 1 : 0);
				amount = Math.floor(playerCount / 2);
				bye = playerCount % 2 === 1 && playerCount > 1;
				round++;
			}
			t.round = 0;
			db.updateTournament(tId, t);
			console.log('[Tournament] Matches setup complete, there are ' + (t?.allMatches.length || 0) + ' matches total');
			return await this.insertPlayersIntoNextRound(tId);
		} catch (err) {
			console.error('[Tournament] setupMatches unexpected error:', err);
			return false;
		}
	}

	private shuffle<T>(arr: T[]): void {
		for (let i = arr.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[arr[i], arr[j]] = [arr[j], arr[i]];
		}
	}

	private swapPlayers(a: TournamentPlayer | undefined, b: TournamentPlayer | undefined): TournamentPlayer[] {
		if (a === undefined && b === undefined) return [];
		if (a === undefined && b) return [b];
		if (b === undefined && a) return [a];
		return [b!, a!];
	}

	private async allPlayersReadyForMatch(tId: number): Promise<boolean> {
		try {
			const t = db.getTournamentById(tId);
			if (!t) throw new Error('[Tournament] Failed to retrieve tournament in allPlayersReadyForMatch');
			if (!t.curM) {
				console.debug('[Tournament] No active Match to check if players are ready');
				return false;
			}
			const p1 = t.curM.p1;
			const p2 = t.curM.p2;
			return !!p1 && !!p2 && p1.isReady && p2.isReady;
		} catch (err) {
			console.log('[Tournament] allPlayersReadyForMatch unexpected error:', err);
			return false;
		}
	}

	private async computeChampionIfPossible(tId: number): Promise<void> {
		try {
			const remaining = db.getAllPlayers(tId).filter((p: TournamentPlayer) => !p.eliminated);
			if (remaining.length === 1) {
				db.updateTournament(tId, { championId: remaining[0].id });
			}
		} catch (err) {
			console.error('Error computing champion:', err);
		}
	}

	private async computeWinnerIfPossible(mId: number): Promise<void> {
		try {
			const match = db.getMatchById(mId);
			if (!match) return;
			if (match.isBye) {
				if (match.p1) match.winnerId = match.p1.id;
				else return console.debug('[Tournament] Match is bye but no player present');
			} else {
				if (match.p1 && match.p2) {
					if (match.p1.eliminated && match.p2.eliminated)
						return;
					else if (match.p1.eliminated || match.p2.eliminated)
						match.winnerId = match.p1.eliminated ? match.p2.id : match.p1.id;
					else if (match.p1.score !== undefined && match.p2.score !== undefined && (match.p1.score >= 3 || match.p2.score >= 3))
						match.winnerId = match.p1.score > match.p2.score ? match.p1.id : match.p2.id;
				}
				else if (match.p1 || match.p2)
					match.winnerId = match.p1 ? match.p1.id : match.p2!.id;
			}
			db.updateMatch(match);
		} catch (err) {
			console.error('[Tournament] Error computing winner:', err);
		}
	}

	/* -------------------------------------------------- */
	/* Tournament Lifecycle                                */
	/* -------------------------------------------------- */
	async isSetupComplete(tId: number): Promise<boolean> {
		try {
			const t = db.getTournamentById(tId);
			if (!t) throw new Error('[Tournament] getTournamentById failed');
			if (t.players.length < this.minPlayers) return false;
			if (t.allMatches.length <= 0) return false;
			if (t.matchQueue.length <= 0 || !t.curM) return false;
			return true;
		} catch (err) {
			console.error('[Tournament] isSetupComplete unexpected error:', err);
			return false;
		}
	}

	async startTournament(tId: number): Promise<boolean> {
		try {
			console.debug(`[Tournament] Starting tournament ${tId}`);
			if (!(await this.isSetupComplete(tId))) return false;
			const t = db.updateTournament(tId, { status: 'active', startedAt: new Date().toISOString() });
			if (!t) throw new Error('[Tournament] updateTournament failed');
			broadcastToTournament(tId, { type: 'tournamentStarted', tournamentId: tId });
			console.debug(`[Tournament] Tournament started ${tId}`);
			return true;
		} catch (err) {
			console.error('[Tournament] startTournament unexpected error:', err);
			return false;
		}
	}

	async endTournament(tId: number): Promise<boolean> {
		try {
			console.debug(`[Tournament] Ending tournament ${tId}`);
			await this.computeChampionIfPossible(tId);
			const t = db.updateTournament(tId, { status: 'completed', endedAt: new Date().toISOString() });
			if (!t) throw new Error('[Tournament] updateTournament failed');
			broadcastToTournament(tId, { type: 'tournamentEnded', tournamentId: tId });
			console.debug(`[Tournament] Tournament ended ${tId}`);
			return true;
		} catch (err) {
			console.error('[Tournament] endTournament unexpected error:', err);
			return false;
		}
	}

	/* -------------------------------------------------- */
	/* Archive                                             */
	/* -------------------------------------------------- */
	//TODO
	// persistArchive(tId: number): boolean {
	// 	const t = db.getTournamentById(tId);
	// 	if (!t) return false;
	// 	const snapshot: TournamentState = new TournamentState(t);
	// 	this.archives.set(t.tId, snapshot);
		
	// 	try {
	// 		db.updateTournament(tId, { status: 'archived' });
	// 	} catch (err) {
	// 		console.error('[Tournament] Failed to mark tournament as archived:', err);
	// 	}
		
	// 	console.debug('[Tournament] Tournament ${tId} archived');
	// 	return true;
	// }

	// getArchive(tId: number): TournamentState | undefined {
	// 	return this.archives.get(tId);
	// }

	// getAllArchives(): TournamentState[] {
	// 	return Array.from(this.archives.values());
	// }

	/* -------------------------------------------------- */
	/* Match Operations                                    */
	/* -------------------------------------------------- */

	async getCurrentMatch(tId: number): Promise<TournamentMatch | null> {
		try {
			let t = db.getTournamentById(tId);
			if (!t) return null;
			if (t.curM)
				return t.curM;
			else {
				// console.debug('[Tournament] ROUND: ', t.round, 'QUEUE: ', t.matchQueue);
				if (t.matchQueue.length > 0) {
					t.curM = t.matchQueue.shift() || null;
					t = db.updateTournament(tId, { curM: t.curM, matchQueue: t.matchQueue });
					if (!t) throw new Error('[Tournament] updateTournament failed');
					console.debug('[Tournament] getCurrentMatch got match from matchQueue');
				} else if (t.round > 1) {
					console.debug('[Tournament] getCurrentMatch tries to insert players into next round');
					if (!(await this.insertPlayersIntoNextRound(tId))) {
						console.debug('[Tournament] insertPlayersIntoNextRound failed');
						return null;
					}
				}
			}
			t = db.getTournamentById(tId);
			if (!t) throw new Error('[Tournament] Failed to get tournament in getCurrentMatch');
			return t.curM;
		} catch (err) {
			console.error('[Tournament] getCurrentMatch unexpected error:', err);
			return null;
		}
	}

	private hydrateGameState(gs: any): GameState {
        if (!gs || typeof gs !== 'object') return gs;
        if (typeof gs.players === 'string') {
            try {
                gs.players = JSON.parse(gs.players);
            } catch (e) {
                console.error('[Tournament] Failed to parse gameState.players JSON:', e);
            }
        }
        return gs;
    }

	createPongGame(tId: number): boolean {
		let t = db.getTournamentById(tId);
		if (!t || !t.curM) return false;
		if (!t.curM.gameId) {
			let game;
			game = database.games.createGame({ mode: '2P', difficulty: 'normal' });
			if (!game) {
				console.debug('[Tournament] No Game after createGame');
				return false;
			}
			t.curM.gameId = game.id;
			t = db.updateTournament(t.id, { curM: t.curM });
			if (!t || !t.curM || !t.curM.gameId) throw new Error('[Tournament] updateTournament failed');
		}
		
		let gamestate: GameState | undefined = database.gameState.createGameState({ gameId: t.curM.gameId });
		if (!t.curM.p1 || !t.curM.p2) return false;
		let players: Player[] = [
			{ id: t.curM.p1.id, name: t.curM.p1.name, pos: 70, score: 0 } as Player,
			{ id: t.curM.p2.id, name: t.curM.p2.name, pos: 70, score: 0 } as Player
		];
		gamestate = database.gameState.updateGameStateByGameId(t.curM.gameId, { players });
		if (!gamestate) {
			console.debug('[Tournament] No GameState');
			return false;
		}
		gamestate = this.hydrateGameState(gamestate);
		if (!Array.isArray(gamestate.players)) {
			console.error('[Tournament] Invalid gameState.players shape after update:', typeof gamestate.players);
			return false;
		}

		let engine = new BaseGameEngine(gamestate);
		if (t.curM.p1.tpt === 'ai') engine.setPlayerAI(1, true);
		if (t.curM.p2.tpt === 'ai') engine.setPlayerAI(2, true);
		activeGames.set(t.curM.gameId, engine);
		engine.startGame();
		if (db.updateTournament(t.id, t) === null) return false;
		return true;
	}

	async startMatch(tId: number, matchId: number): Promise<TournamentMatch | null> {
		try {
			let t = db.getTournamentById(tId);
			if (!t) return null;
			if (!t.curM || (t.curM && t.curM.id !== matchId)) {
				let m = db.getMatchById(matchId);
				if (!m) return null;
				t = db.updateTournament(tId, { curM: m });
				if (!t) throw new Error('[Tournament] updateTournament failed');
			}
			if (!t.curM) return null;
			if (t.curM.isBye) {//TODO check
				await this.endMatch(t.curM.id);
				return null;
			}
			if (!t.curM.isBye && !(await this.allPlayersReadyForMatch(tId))) {
				console.debug('[Tournament] Not all players are ready yet');
				return null;
			}

			if (!this.createPongGame(t.id)) {
				console.debug('[Tournament] Creating PongGame failed');
				return null;
			}
			
			t = db.getTournamentById(t.id);
			if (!t || !t.curM) {
				console.debug('[Tournament] getTournamentById failed');
				return null;
			}
			broadcastToMatch(t.curM.id, { type: 'gameStart', gameId: t.curM.gameId });
			// broadcastGameStartToMatch(t.curM.id, t.curM.gameId);
			// broadcastToTournament(tId, { type: 'gameStart', matchId: t.curM.id, gameId: t.curM.gameId });

			setTimeout(async () => {
                try {
					if (!t || !t.curM) throw new Error('[Tournament] No tournament/match');
                    t.curM.status = 'active';
                    t.curM.startedAt = new Date().toISOString();
                    t = db.updateTournament(tId, { curM: t.curM });
                    if (!t || !t.curM)
						throw new Error('[Tournament] updateTournament failed');
                    broadcastToMatch(t.curM!.id, { type: 'matchState', match: publicMatchShape(t.curM) });
                    broadcastToTournament(tId, { type: 'tournamentState', tournament: publicTournamentShape(t) });
                    // if (t.curM.gameId != null) broadcastGameStartToMatch(t.curM.id, t.curM.gameId);
                } catch (e) {
                    console.error('[Tournament] setTimeout unexpected error:', e);
					return null;
                }
            }, 1500);
			return t.curM;
		} catch (err) {
			console.error('[Tournament] startMatch unexpected error:', err);
			return null;
		}
	}

	async endMatch(mId: number): Promise<boolean> {
		try {
			let m = db.getMatchById(mId);
			if (!m) throw new Error('[Tournament] getMatchById failed');
			await this.computeWinnerIfPossible(mId);
			if (!m.winnerId) {
				console.error('[Tournament] Cannot end match: winner could not be determined');
				return false;
			}
			m.endedAt = new Date().toISOString();
			m.status = 'completed';
			console.log(`🏁 Match ${mId} completed. Winner: ${m.winnerId}`);
			m = db.updateMatch(m);
			if (!m) {
				console.debug('[Tournament] updateMatch failed');
				return false;
			}
			broadcastToMatch(m.id, { type: 'matchEnded', matchId: m.id, winnerId: m.winnerId });
			// broadcastToTournament(tId, { type: 'matchEnded', matchId: m.id, winnerId: m.winnerId });
			return true;
		} catch (err) {
			console.error('[Tournament] endMatch unexpected error:', err);
			return false;
		}
	}

	async toggleMatchPlayerReady(tId: number, mId: number, pId: number): Promise<boolean> {
		try {
			let t = db.getTournamentById(tId);
			if (!t) throw new Error('[Tournament] getTournamentById failed');
			if (!t.curM || t.curM.id != mId) return false;

			if (t.curM.p1 && t.curM.p1.id === pId)//TODO just for testing
				t.curM.p1.isReady = true;//!t.curM.p1.isReady;
			else if (t.curM.p2 && t.curM.p2.id === pId)
				t.curM.p2.isReady = true;//!t.curM.p2.isReady;
			else
				return false;
			if (!t.curM.isBye && (await this.allPlayersReadyForMatch(tId)))
				t.curM.status = 'ready';
			db.updateTournament(t.id, { curM: t.curM })
			broadcastToMatch(t.curM.id, { type: 'matchState', match: publicMatchShape(t.curM) });
			// broadcastToTournament(tId, { type: 'tournamentState', tournament: publicTournamentShape(t) });
			return true;
		} catch (err) {
			console.error('[Tournament] toggleMatchPlayerReady unexpected error:', err);
			return false;
		}
	}

	async setPlayerSocket(pId: number, socketId: string): Promise<boolean> {
		try {
			db.updatePlayer({ id: pId, socketId });
			return true;
		} catch (err) {
			console.error('[Tournament] setPlayerSocket unexpected error:', err);
			return false;
		}
	}

	async getMatch(mId: number): Promise<TournamentMatch> {
		try {
			const m = db.getMatchById(mId);
			if (!m) throw new Error('[Tournament] getMatchById failed');
			return m;
		} catch (err) {
			console.error('[Tournament] getMatch unexpected error:', err);
			return null as any;
		}
	}

	async getTournament(tId: number): Promise<Tournament> {
		try {
			const t = db.getTournamentById(tId);
			if (!t) throw new Error('[Tournament] getTournamentById failed');
			return t;
		} catch (err) {
			console.error('[Tournament] getTournament unexpected error:', err);
			return null as any;
		}
	}

	async getAllTournaments(): Promise<Tournament[]> {
		try {
			const tournaments = db.getAllTournaments();
			if (!tournaments) throw new Error('[Tournament] getAllTournaments failed');
			return tournaments;
		} catch (err) {
			console.error('[Tournament] getAllTournaments unexpected error:', err);
			return null as any;
		}
	}
}

export const tournamentManager = new TournamentManager();

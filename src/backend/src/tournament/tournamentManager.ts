import { database } from "../database/index";
import { Tournament, TournamentMatch, TournamentPlayer, TPT } from "../types/index";
import { CreateGameInput } from "../routes/game";
import { gameRoomManager } from "../game/gameRoom";
import {
	broadcastToTournament,
	broadcastMatchEndToTournament,
	broadcastTournamentState,
	broadcastTournamentEnd
} from '../websocket/tournamentHandler';

const db = database.tournaments;

class TournamentManager {
	private minPlayers: number = 3;
	private maxPlayers: number = 10;
	private matchRooms: Map<number, string> = new Map();

	constructor() {}

	/* ================================================== */
	/* Tournament Setup                                    */
	/* ================================================== */

	async createTournament(name: string, userId: number): Promise<Tournament> {
		try {
			let t: Tournament | null;
			t = db.createTournament({});
			if (!t) throw new Error('Failed to create tournament in database');
			if (!this.addPlayerToTournament(t.id, name, 'host', userId))
				throw new Error('Failed to add host player to tournament');
			t = db.getTournamentById(t.id);
			if (!t)
				throw new Error('Failed to retrieve tournament after creation');
			console.log(`Tournament ${t.id} created by ${name}`);
			return t;
		} catch (error) {
			console.error('Failed to create tournament:', error);
			throw error;
		}
	}

	async addPlayerToTournament(tournamentId: number, name: string, tpt: TPT, userId?: number): Promise<TournamentPlayer> {
		try {
			let t = db.getTournamentById(tournamentId);
			if (!t) {
				console.error('Tournament not found:', tournamentId);
				return null as any;
			}
			if (t.status !== 'setup') {
				console.error('Cannot join: tournament already started');
				return null as any;
			}
			if (t.players.length > this.maxPlayers) {
				console.error('Cannot join: max players reached');
				return null as any;
			}
			if (t.players.find(p => p.name === name)) {
				console.error('Cannot join: duplicate name');
				return null as any;
			}
			const player = db.createPlayer({
				tournamentId,
				tpt,
				name,
				isReady: tpt === 'ai',
				userId: userId || null
			});
			if (!player)
				throw new Error('Failed to create player');
			t = db.getTournamentById(tournamentId);
			if (!t)
				throw new Error('Failed to get tournament');
			const alreadyPresent = t.players.some(p => p.id === player.id);
			if (!alreadyPresent) {
				t.players.push(player);
				db.updateTournament(t.id, { players: t.players });
			}
			console.log(`${name} joined tournament ${tournamentId}`);
			broadcastTournamentState(tournamentId);
			return player;
		} catch (error) {
			console.error('Failed to add player:', error);
			throw error;
		}
	}

	leaveTournament(tournamentId: number, playerId: number): boolean {
		try {
			let t = db.getTournamentById(tournamentId);
			if (!t) return false;
			if (t.status === 'completed' || t.status === 'archived')
				return false;
			if (t.status === 'setup') {
				if (!db.deletePlayer(playerId))
					return false;
			} else {
				db.updatePlayer({ id: playerId, eliminated: true });
				console.log(`Player ${playerId} eliminated from tournament ${tournamentId}`);
				if (t.curM)
					this.computeWinnerIfPossible(t.curM.id);
			}
			broadcastTournamentState(tournamentId);
			return true;
		} catch (error) {
			console.error('leaveTournament error:', error);
			return false;
		}
	}

	/* ================================================== */
	/* Bracket & Match Management                          */
	/* ================================================== */

	async createMatch(tournamentId: number, roundIdx: number, round: number, isBye: boolean = false): Promise<TournamentMatch> {
		try {
			const match = db.createMatch({
				tournamentId,
				round,
				roundIdx,
				isBye,
				status: 'setup'
			});
			if (!match)
				return null as any;
			console.log(`Created match ${match.id} (round ${round}${isBye ? ', bye' : ''})`);
			return match;
		} catch (error) {
			console.error('Failed to create match:', error);
			return null as any;
		}
	}

	async createMatchRoom(match: TournamentMatch): Promise<boolean> {
		try {
			if (!match.p1 || !match.p1.name) {
				console.error('Cannot create room: match has no player 1');
				return false;
			}

			let id = match.p1.userId?.toString() || match.p1.id.toString();

			match.room = gameRoomManager.createRoom(
				id,
				match.p1.name,
				2,
				match.p1.tpt
			);
			if (!match.room) {
				console.error('Failed to create game room for match:', match.id);
				return false;
			}
			if (match.p2 && !match.isBye) {
				const joinResult = gameRoomManager.joinRoom(
					match.room.roomId,
					match.p2.id.toString(),
					match.p2.name!,
					match.p2.tpt === 'ai',
					match.p2.isReady,
					match.p2.tpt === 'local',
					'normal'
				);
				if (!joinResult.success) {
					console.error('Failed to join player 2 to room:', joinResult.message);
					return false;
				}
			}
			this.matchRooms.set(match.id, match.room.roomId);
			let m = db.updateMatch({ id: match.id, room: match.room });
			if (!m) return false;
			let t = this.getTournament(m.tournamentId);
			if (!t) return false;
			let all = db.getAllMatches(t.id);
			db.updateTournament(m.tournamentId, { allMatches: all, curM: m });
			console.log(`Created room ${m.room!.roomId} for match ${m.id}`);
			return true;
		} catch (error) {
			console.error('Failed to create match room:', error);
			return false;
		}
	}

	async setupMatches(tournamentId: number): Promise<boolean> {
		try {
			let t = db.getTournamentById(tournamentId);
			if (!t)
				throw new Error('Tournament not found');
			let playerCount = t.players.length;
			if (playerCount < this.minPlayers) {
				console.warn('Not enough players to setup matches');
				return false;
			}
			let round = 1;
			let matchCount = Math.floor(playerCount / 2);
			let hasBye = playerCount % 2 === 1;
			while (matchCount > 0) {
				let roundMatches: TournamentMatch[] = [];
				for (let i = 0; i < matchCount; i++) {
					const match = await this.createMatch(tournamentId, i, round, false);
					if (!match)
						throw new Error('Failed to create match');
					roundMatches.push(match);
				}
				if (hasBye) {
					const byeMatch = await this.createMatch(tournamentId, matchCount, round, true);
					if (!byeMatch)
						throw new Error('Failed to create bye match');
					roundMatches.push(byeMatch);
				}
				t.allMatches.push(...roundMatches);
				playerCount = matchCount + (hasBye ? 1 : 0);
				matchCount = Math.floor(playerCount / 2);
				hasBye = playerCount % 2 === 1 && playerCount > 1;
				round++;
			}
			t.round = 0;
			db.updateTournament(tournamentId, t);
			console.log(`Bracket setup complete: ${t.allMatches.length} total matches`);
			if (!(await this.insertPlayersIntoNextRound(tournamentId)))
				return false;
			if (!t.curM || (t.curM && t.curM.status === 'completed')) {
				if (t.matchQueue.length > 0) {
					t.curM = t.matchQueue.shift() || null;
					while (t.curM && t.curM.status === 'completed')
						t.curM = t.matchQueue.shift() || null;
				}
			}
			if (!t || !t.curM) return false;
			return true;
		} catch (error) {
			console.error('setupMatches error:', error);
			return false;
		}
	}

	async insertPlayersIntoNextRound(tournamentId: number): Promise<boolean> {
		try {
			let t = db.getTournamentById(tournamentId);
			if (!t)
				throw new Error('Tournament not found');
			if ((!t.curM || t.curM && t.curM.status === 'completed') && t.matchQueue.length > 0) {
				t.curM = t.matchQueue.shift() || null;
				while (t.curM && t.curM.status === 'completed')
					t.curM = t.matchQueue.shift() || null;
				if (!t.curM)
					t.matchQueue = [];
				t = db.updateTournament(t.id, {curM: t.curM, matchQueue: t.matchQueue});
				if (t && t.curM) {
					console.log('Match queue not empty, cannot advance round');
					return true;
				}
			}
			let players = db.getAllPlayers(tournamentId).filter((p: TournamentPlayer) => !p.eliminated).slice();
			if (players.length === 0) {
				console.log('No remaining players');
				return false;
			}
			if (players.length === 1) {
				console.log('Only one player remaining, ending tournament');
				return this.endTournament(tournamentId);
			}
			if (!t) return false;
			t.round++;
			console.log(`Advancing to round ${t.round}`);
			t = db.updateTournament(t.id, {round: t.round});
			if (!t)
				return false;
			let matches = db.getAllMatches(tournamentId).filter((m: TournamentMatch) => m.round === t!.round);
			if (matches.length === 0) {
				console.error('No matches found for round', t.round);
				return false;
			}
			this.shuffle(players);
			for (let m of matches) {
				let p1 = players.shift();
				if (p1)
					p1.isReady = p1.tpt === 'ai' ? true : false;
				let p2 = players.shift();
				if (p2)
					p2.isReady = p2.tpt === 'ai' ? true : false;
				if (!p1)
					throw new Error('Not enough players for assignment');
				if (p1 && p2 && p2.tpt === 'host')
					[p1, p2] = [p2, p1];
				m.p1 = p1;
				if (!m.isBye && p2) {
					m.p2 = p2;
					m.status = 'pending';
				}
				else if (m.isBye) {
					m.winnerId = p1.id;
					m.status = 'completed';
				}

				if (!m.isBye && m.p1 && m.p2 && m.p1.tpt === 'ai' && m.p2.tpt === 'ai') {
					const randomSeed = Math.random();
					const winner = randomSeed < 0.5 ? m.p1 : m.p2;
					const loser = winner.id === m.p1.id ? m.p2 : m.p1;
					m.winnerId = winner.id;
					m.status = 'completed';
					m.endedAt = new Date().toISOString();
					if (m.p1.id === loser.id)
						m.p1 = db.updatePlayer({ id: loser.id, eliminated: true }) || undefined;
					else
						m.p2 = db.updatePlayer({ id: loser.id, eliminated: true }) || undefined;
				}

				db.updateMatch({
					id: m.id,
					p1: m.p1,
					p2: m.p2,
					status: m.status,
					winnerId: m.winnerId,
					endedAt: m.endedAt
				});
			}
			if (players.length > 0)
				throw new Error(`${players.length} players left unassigned`);
			t.matchQueue = matches.filter(m => m.status === 'pending');
			t.matchQueue.sort((a, b) => a.roundIdx - b.roundIdx);
			t.curM = t.matchQueue.shift() || null;
			while (t.curM && t.curM.status === 'completed' && t.matchQueue.length > 0) {
				t.curM = t.matchQueue.shift() || null;
			}
			t = db.updateTournament(tournamentId, {
				round: t.round,
				matchQueue: t.matchQueue,
				curM: t.curM
			});

			broadcastTournamentState(tournamentId);
			return true;
		} catch (error) {
			console.error('insertPlayersIntoNextRound error:', error);
			return false;
		}
	}

	private shuffle<T>(array: T[]): void {
		for (let i = array.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[array[i], array[j]] = [array[j], array[i]];
		}
	}

	/* ================================================== */
	/* Tournament Lifecycle                                */
	/* ================================================== */

	async isSetupComplete(tournamentId: number): Promise<boolean> {
		try {
			const t = db.getTournamentById(tournamentId);
			if (!t)
				return false;
			const playerAmountOk = t.players.length >= this.minPlayers;
			const matchesOk = t.allMatches.length > 0;
			const curMatchOk = t.curM !== null;
			return playerAmountOk && matchesOk && curMatchOk;
		} catch (error) {
			console.error('isSetupComplete error:', error);
			return false;
		}
	}

	async startTournament(tournamentId: number): Promise<boolean> {
		try {
			let t = db.getTournamentById(tournamentId);
			if (!t)
				return false;
			if (t.allMatches.length === 0) {
				if (!this.setupMatches(tournamentId)) {
					console.error('Failed to setup bracket');
					return false;
				}
			}
			if (!this.isSetupComplete(tournamentId)) {
				console.error('Setup incomplete');
				return false;
			}

			t = db.updateTournament(tournamentId, {
				status: 'active',
				startedAt: new Date().toISOString()
			});
			if (!t)
				throw new Error('Failed to update tournament');

			broadcastToTournament(tournamentId, {
				type: 'tournamentStart',
				tournamentId
			});

			broadcastTournamentState(tournamentId);
			return true;
		} catch (error) {
			console.error('startTournament error:', error);
			return false;
		}
	}

	async endTournament(tournamentId: number): Promise<boolean> {
		try {
			this.computeChampionIfPossible(tournamentId);
			const t = db.updateTournament(tournamentId, {//TODO check if is archived?
				status: 'archived',
				endedAt: new Date().toISOString()
			});
			if (!t)
				throw new Error('Failed to update tournament');

			broadcastTournamentEnd(tournamentId);
			broadcastTournamentState(tournamentId);
			return true;
		} catch (error) {
			console.error('endTournament error:', error);
			return false;
		}
	}

	async computeChampionIfPossible(tournamentId: number): Promise<void> {
		try {
			const remaining = db.getAllPlayers(tournamentId).filter((p: TournamentPlayer) => !p.eliminated);
			if (remaining.length === 1) {
				db.updateTournament(tournamentId, { championId: remaining[0].id });
				console.log(`Champion: ${remaining[0].name}`);
			}
		} catch (error) {
			console.error('computeChampionIfPossible failed:', error);
		}
	}

	/* ================================================== */
	/* Match Operations                                    */
	/* ================================================== */

	async getCurrentMatch(tournamentId: number): Promise<TournamentMatch | null> {
		try {
			let t = db.getTournamentById(tournamentId);
			if (!t)
				return null;
			if (!t.curM || t.curM.status === 'completed')
				t.curM = null;

			if (!t.curM && t.matchQueue.length > 0) {
				t.curM = t.matchQueue.shift() || null;
				while (t.curM && t.curM.status === 'completed')
					t.curM = t.matchQueue.shift() || null;
			}
			if (!t.curM && (!t.matchQueue || t.matchQueue.length === 0) && t.round > 0) {
				if (await this.insertPlayersIntoNextRound(tournamentId)) {
					t = db.getTournamentById(tournamentId);
					if (t && !t.curM && t.matchQueue && t.matchQueue.length > 0) {
						t.curM = t.matchQueue.shift() || null;
						while (t.curM && t.curM.status === 'completed')
							t.curM = t.matchQueue.shift() || null;
					}
				} //else
					// return null;
					// throw new Error('insertPlayersIntoNextRound failed');
			}
			if (t && t.curM && t.curM.id) {
				if (this.allPlayersReadyForMatch(t.curM.id) && t.curM.status !== 'completed')
					t.curM.status = 'ready';
				t.curM = db.updateMatch(t.curM);
				t = db.updateTournament(tournamentId, {
					curM: t.curM,
					matchQueue: t.matchQueue
				});
			}
			if (!t || !t.curM)
				return null;
			return t.curM;
		} catch (error) {
			console.error('getCurrentMatch error:', error);
			return null;
		}
	}

	async createGameState(mId: number): Promise<TournamentMatch> {
		try {
			let gameInput: CreateGameInput = { mode: '2P', difficulty: 'normal' };
			const game = database.games.createGame(gameInput);
			if (!game || !game.id)
				throw new Error('Failed to create new game for Tournament');
			let m = db.getMatchById(mId);
			if (!m)
				throw new Error('Failed to get match by id');
			m.room!.gameId = game.id;
			m.gameId = game.id;
			m = db.updateMatch({ id: m.id, gameId: m.gameId, room: m.room });
			if (!m)
				throw new Error('Failed to update match');
			return m;
		} catch (err) {
			console.error('createGameState for Tournament failed:', err);
			return null as any;
		}
	}

	async prepareMatch(tournamentId: number, matchId: number): Promise<TournamentMatch | null> {
		try {
			let t = db.getTournamentById(tournamentId);
			if (!t)
				return null;
			if (t.curM && t.curM.room && t.curM.room.gameId)
				return t.curM;
			if (!t.curM || t.curM.id !== matchId) {
				let match = db.getMatchById(matchId);
				if (!match) return null;
				if (match.status === 'completed')
					match = await this.getCurrentMatch(t.id);
				t = db.updateTournament(tournamentId, { curM: match });
			}
			if (!t || !t.curM)
				return null;
			if (t.curM.isBye) {
				console.log(`Bye match ${matchId}, auto-completing`);
				await this.endMatch(matchId);
				return null;
			}
			if (!this.allPlayersReadyForMatch(t.curM.id)) {
				console.log('Waiting for players to be ready...');
				return null;
			}
			t.curM.status = 'ready';
			t.curM = db.updateMatch({ id: t.curM.id, status: t.curM.status });
			t = db.updateTournament(t.id, {curM: t.curM});
			if (!t || !t.curM) return null;
			if (!(await this.createMatchRoom(t.curM)))
				throw new Error('createMatchRoom failed');
			t.curM = db.getMatchById(matchId);
			if (!t || !t.curM || !t.curM.room|| !t.curM.room.roomId) {
				console.error('Failed to create match room');
				return null;
			}
			t.curM = await this.createGameState(t.curM.id);
			t = db.updateTournament(t.id, { curM: t.curM });
			if (!t) return null;
			return t.curM;
		} catch (error) {
			console.error('startMatch error:', error);
			return null;
		}
	}

	async endMatch(matchId: number): Promise<boolean> {
		try {
			let match = db.getMatchById(matchId);
			if (!match)
				throw new Error('Match not found');
			let t = db.getTournamentById(match.tournamentId);
			if (!t)
				throw new Error('Tournament not found');
			t.curM = match;

			await this.computeWinnerIfPossible(t.curM.id);
			if (!t.curM.winnerId) {
				console.error('Cannot end match: no winner determined');
				return false;
			}
			if (t.curM.p1 && t.curM.p1.id !== t.curM.winnerId)
				t.curM.p1 = db.updatePlayer({ id: t.curM.p1.id, eliminated: true }) || undefined;
			else if (t.curM.p2 && t.curM.p2.id !== t.curM.winnerId)
				t.curM.p2 = db.updatePlayer({ id: t.curM.p2.id, eliminated: true }) || undefined;

			t.curM.status = 'completed';
			t.curM.endedAt = new Date().toISOString();
			t = db.updateTournament(t.id, { curM: t.curM });
			console.log(`Match ${t!.curM!.id} completed. Winner: ${t!.curM!.winnerId}`);
			
			const roomId = this.matchRooms.get(matchId);
			if (roomId)
				this.matchRooms.delete(matchId);
			if (!match.winnerId)
				throw new Error('Winner not set after computation');
			
			if (t) {
				db.updateTournament(t.id, { curM: null });
				console.log(`Cleared curM for tournament ${match.tournamentId}, ready for next match`);
			}
			
			broadcastMatchEndToTournament(match.tournamentId, matchId, match.winnerId);
			return true;
		} catch (error) {
			console.error('endMatch error:', error);
			return false;
		}
	}

	async computeWinnerIfPossible(matchId: number): Promise<void> {
		try {
			let match = db.getMatchById(matchId);
			if (!match)
				return;
			if (match.isBye && match.p1) {
				match.winnerId = match.p1.id;
				db.updateMatch(match);
				return;
			}
			if (match.p1 && match.p2) {
				if (match.p1.eliminated && match.p2.eliminated) return;
				if (match.p1.eliminated || match.p2.eliminated)
					match.winnerId = match.p1.eliminated ? match.p2.id : match.p1.id;
				else if (match.p1.score !== undefined && match.p2.score !== undefined
					&& (match.p1.score >= 3 || match.p2.score >= 3))
					match.winnerId = match.p1.score > match.p2.score ? match.p1.id : match.p2.id;
			} else if (match.p1 || match.p2) {
				match.winnerId = match.p1 ? match.p1.id : match.p2!.id;
			}
			match.status = 'completed';
			db.updateMatch(match);
		} catch (error) {
			console.error('Error computing winner:', error);
		}
	}

	allPlayersReadyForMatch(matchId: number): boolean {
		try {
			let m = db.getMatchById(matchId);
			if (!m)
				throw new Error('Match not found');
			if (m.status === 'completed')
				return false;
			const p1 = m.p1;
			if (!p1 || !p1.isReady)
				return false;
			const p2 = m.p2;
			if (!p2 || !p2.isReady)
				return false;
			return true;
		} catch (error) {
			console.error('allPlayersReadyForMatch error:', error);
			return false;
		}
	}

	toggleMatchPlayerReady(tournamentId: number, matchId: number, playerId: number): boolean {
		try {
			let t = db.getTournamentById(tournamentId);
			if (!t)
				return false;
			if (!t.curM || t.curM.id !== matchId || !t.curM.p1 || !t.curM.p2
				|| (playerId !== t.curM.p1.id && playerId !== t.curM.p2.id))
				return false;
			
			let p = t.curM.p1.id === playerId ? t.curM.p1 : t.curM.p2;
			let player = db.updatePlayer({ id: playerId, isReady: !p.isReady});
			if (!player) {
				console.error('updatePlayer failed');
				return false;
			}
			if (player.id === t.curM.p1.id)
				t.curM.p1 = player;
			else
				t.curM.p2 = player;

			t.curM = db.updateMatch({ id: matchId, p1: t.curM.p1, p2: t.curM.p2 });
			if (!t.curM)
				throw new Error('updateMatch failed');

			if (!t.curM.isBye && this.allPlayersReadyForMatch(matchId))
				t.curM.status = 'ready';

			t.curM = db.updateMatch({ id: matchId, status: t.curM.status });
			if (!t.curM)
				throw new Error('Failed to update match');

			t = db.updateTournament(t.id, { curM: t.curM });
			if (!t)
				throw new Error('Failed to update tournament');

			broadcastTournamentState(tournamentId);
			return true;
		} catch (error) {
			console.error('toggleMatchPlayerReady error:', error);
			return false;
		}
	}

	hydrateAllMatches(matches: TournamentMatch[]): TournamentMatch[] {
		try {
			let m: TournamentMatch | null;
			for (m of matches) {
				m = this.hydrateMatch(m);
				if (!m) throw new Error('updateMatch failed');
			}
			return matches;
		} catch (err) {
			console.error('hydrateAllMatches failed');
			return null as any;
		}
	}

	hydrateMatch(match: any): TournamentMatch | null {
        if (!match) return null;
        try {
            if (typeof match.p1 === 'string')
                match.p1 = match.p1 ? JSON.parse(match.p1) : undefined;
            if (typeof match.p2 === 'string')
                match.p2 = match.p2 ? JSON.parse(match.p2) : undefined;
            if (typeof match.room === 'string')
                match.room = match.room ? JSON.parse(match.room) : null;
            return match;
        } catch (error) {
            console.error('Error hydrating match:', error);
            return match;
        }
    }

	hydrateTournament(t: any): Tournament | null {
    try {
        if (typeof t.players === 'string')
            t.players = JSON.parse(t.players);
        if (typeof t.allMatches === 'string')
            t.allMatches = JSON.parse(t.allMatches);
        if (typeof t.matchQueue === 'string')
            t.matchQueue = JSON.parse(t.matchQueue);
        if (typeof t.curM === 'string')
            t.curM = JSON.parse(t.curM);
        const players = db.getAllPlayers(t.id);
        if (players.length > 0)
            t.players = players;
        const matches = db.getAllMatches(t.id);
        if (matches.length > 0)
            t.allMatches = matches;
        
        const mqueue = t.allMatches.filter((m: TournamentMatch) => 
            m.round === t.round && m.status !== 'completed' && m.status !== 'active'
        );
        if (mqueue.length > 0)
            t.matchQueue = mqueue;
        else
            t.matchQueue = [];
            
        t.curM = this.hydrateMatch(t.curM);
        return t as Tournament;
    } catch (error) {
        console.error('hydrateTournament failed:', error);
        return null;
    }
}

	async deleteTournament(tId: number): Promise<void> {
		try {
			if (!db.deleteTournament(tId))
				throw new Error('Failed to delete tournament');
		} catch (err) {
			console.error('deleteTournament failed:', err);
		}
	}

	/* ================================================== */
	/* Utility Methods                                     */
	/* ================================================== */

	setPlayerSocket(playerId: number, socketId: string): boolean {
		try {
			db.updatePlayer({ id: playerId, socketId });
			return true;
		} catch (error) {
			console.error('setPlayerSocket error:', error);
			return false;
		}
	}

	getMatch(matchId: number): TournamentMatch | null {
		try {
			return db.getMatchById(matchId);
		} catch (error) {
			console.error('getMatch error:', error);
			return null;
		}
	}

	getTournament(tournamentId: number): Tournament | null {
		try {
			let t = db.getTournamentById(tournamentId);
			if (t)
				return this.hydrateTournament(t);
			else
				return null;
		} catch (error) {
			console.error('getTournament error:', error);
			return null;
		}
	}

	getAllTournaments(): Tournament[] {
		try {
			let tt = db.getAllTournaments() || [];
			let t: Tournament | null;
			for (t of tt) {
				t = this.hydrateTournament(t);
				if (!t)
					throw new Error('hydrateTournament failed');
			}
			return tt;
		} catch (error) {
			console.error('getAllTournaments error:', error);
			return [];
		}
	}

	getMatchRoom(matchId: number): string | undefined {
		return this.matchRooms.get(matchId);
	}
}

export const tournamentManager = new TournamentManager();
import { database } from "../database/index";
import { Tournament, TournamentMatch, TournamentPlayer, TPT } from "../types/index";
import { BaseGameEngine } from "../game/gameEngine";
import { GameState, Player } from "../../../shared/gameTypes";
import { activeGames } from "../routes/game";
import { gameRoomManager } from "../game/gameRoom";
import {
	broadcastToTournament,
	broadcastCountdownToMatch,
	broadcastGameStartToMatch,
	broadcastMatchEndToTournament,
	broadcastTournamentState,
	broadcastTournamentEnd
} from '../websocket/tournamentHandler';

const db = database.tournaments;

class TournamentManager {
	private minPlayers: number = 3;
	private maxPlayers: number = 10;
	private matchRooms: Map<number, string> = new Map(); // Map<matchId, roomId> -> room = GameRoom

	constructor() {}

	/* ================================================== */
	/* Tournament Setup                                    */
	/* ================================================== */

	createTournament(name: string, userId: number): Tournament | null {
		try {
			let t: Tournament | null;
			t = db.createTournament({});
			if (!t) throw new Error('Failed to create tournament in database');
			if (!this.addPlayerToTournament(t.id, name, 'host', userId))
				throw new Error('Failed to add host player to tournament');
			t = db.getTournamentById(t.id);
			if (!t) throw new Error('Failed to retrieve tournament after creation');
			console.log(`Tournament ${t.id} created by ${name}`);
			return t;
		} catch (error) {
			console.error('Failed to create tournament:', error);
			throw error;
		}
	}

	addPlayerToTournament(tournamentId: number, name: string, tpt: TPT, userId?: number): TournamentPlayer | null {
		try {
			let t = db.getTournamentById(tournamentId);
			if (!t) {
				console.error('Tournament not found:', tournamentId);
				return null;
			}
			if (t.status !== 'setup') {
				console.warn('Cannot join: tournament already started');
				return null;
			}
			if (t.players.length >= this.maxPlayers) {
				console.warn('Cannot join: max players reached');
				return null;
			}
			if (t.players.find(p => p.name === name)) {
				console.warn('Cannot join: duplicate name');
				return null;
			}
			const player = db.createPlayer({
				tournamentId,
				tpt,
				name,
				isReady: tpt === 'ai',
				userId: userId || null
			});
			if (!player) throw new Error('Failed to create player');
			t = db.getTournamentById(tournamentId);
			if (!t) throw new Error('Failed to refresh tournament');
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

	createMatch(tournamentId: number, roundIdx: number, round: number, isBye: boolean = false): TournamentMatch | null {
		try {
			const match = db.createMatch({
				tournamentId,
				round,
				roundIdx,
				isBye,
				status: 'setup'
			});
			if (!match) return null;
			console.log(`Created match ${match.id} (round ${round}${isBye ? ', bye' : ''})`);
			return match;
		} catch (error) {
			console.error('Failed to create match:', error);
			return null;
		}
	}

	createMatchRoom(match: TournamentMatch): boolean {
		try {
			if (!match.p1 || !match.p1.name) {
				console.error('Cannot create room: match has no player 1');
				return false;
			}
			match.room = gameRoomManager.createRoom(
				match.p1.id.toString(),
				match.p1.name,
				2
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

	setupMatches(tournamentId: number): boolean {
		try {
			let t = db.getTournamentById(tournamentId);
			if (!t) throw new Error('Tournament not found');
			let playerCount = t.players.length;
			console.log(`Setting up bracket for ${playerCount} players`);
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
					const match = this.createMatch(tournamentId, i, round, false);
					if (!match) throw new Error('Failed to create match');
					roundMatches.push(match);
				}
				if (hasBye) {
					const byeMatch = this.createMatch(tournamentId, matchCount, round, true);
					if (!byeMatch) throw new Error('Failed to create bye match');
					roundMatches.push(byeMatch);
				}
				t.allMatches.push(...roundMatches);
				console.log(`Round ${round}: ${matchCount} matches${hasBye ? ' + 1 bye' : ''}`);
				playerCount = matchCount + (hasBye ? 1 : 0);
				matchCount = Math.floor(playerCount / 2);
				hasBye = playerCount % 2 === 1 && playerCount > 1;
				round++;
			}
			t.round = 0;
			db.updateTournament(tournamentId, t);
			console.log(`Bracket setup complete: ${t.allMatches.length} total matches`);
			return this.insertPlayersIntoNextRound(tournamentId);
		} catch (error) {
			console.error('setupMatches error:', error);
			return false;
		}
	}

	private insertPlayersIntoNextRound(tournamentId: number): boolean {
		try {
			let t = db.getTournamentById(tournamentId);
			if (!t) throw new Error('Tournament not found');
			if (t.matchQueue.length > 0) {
				console.log('Match queue not empty, cannot advance round');
				return false;
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
			t.round++;
			console.log(`Advancing to round ${t.round}`);
			let matches = db.getAllMatches(tournamentId).filter((m: TournamentMatch) => m.round === t.round);
			if (matches.length === 0) {
				console.error('No matches found for round', t.round);
				return false;
			}
			this.shuffle(players);
			for (const m of matches) {
				let p1 = players.shift();
				let p2 = players.shift();
				if (!p1) throw new Error('Not enough players for assignment');
				if (p1 && p2 && p2.tpt === 'host')
					[p1, p2] = [p2, p1];
				m.p1 = p1;
				if (!m.isBye && p2)
					m.p2 = p2;
				else if (m.isBye) {
					m.winnerId = p1.id;
					m.status = 'completed';
				}
				m.status = m.isBye ? 'completed' : 'pending';
				db.updateMatch({
					id: m.id,
					p1: m.p1,
					p2: m.p2,
					status: m.status,
					winnerId: m.winnerId
				});
			}
			if (players.length > 0)
				throw new Error(`${players.length} players left unassigned`);
			t.matchQueue = matches.filter(m => m.status === 'pending');
			t.matchQueue.sort((a, b) => a.roundIdx - b.roundIdx);
			t.curM = t.matchQueue.shift() || null;
			db.updateTournament(tournamentId, {
				round: t.round,
				matchQueue: t.matchQueue,
				curM: t.curM
			});
			console.log(`Round ${t.round} ready: ${t.matchQueue.length + 1} matches`);
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

	isSetupComplete(tournamentId: number): boolean {
		try {
			const t = db.getTournamentById(tournamentId);
			if (!t) return false;
			const playerAmountOk = t.players.length >= this.minPlayers;
			const matchesOk = t.allMatches.length > 0;
			const curMatchOk = t.curM !== null;
			return playerAmountOk && matchesOk && curMatchOk;
		} catch (error) {
			console.error('isSetupComplete error:', error);
			return false;
		}
	}

	startTournament(tournamentId: number): boolean {
		try {
			console.log(`Starting tournament ${tournamentId}`);
			let t = db.getTournamentById(tournamentId);
			if (!t) return false;
			if (t.allMatches.length === 0) {
				console.log('Setting up bracket...');
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
			if (!t) throw new Error('Failed to update tournament');
			console.log(`Tournament ${tournamentId} started`);
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

	endTournament(tournamentId: number): boolean {
		try {
			console.log(`Ending tournament ${tournamentId}`);
			this.computeChampionIfPossible(tournamentId);
			const t = db.updateTournament(tournamentId, {
				status: 'completed',
				endedAt: new Date().toISOString()
			});
			if (!t) throw new Error('Failed to update tournament');
			console.log(`Tournament ${tournamentId} completed`);
			broadcastTournamentEnd(tournamentId);
			broadcastTournamentState(tournamentId);
			return true;
		} catch (error) {
			console.error('endTournament error:', error);
			return false;
		}
	}

	private computeChampionIfPossible(tournamentId: number): void {
		try {
			const remaining = db.getAllPlayers(tournamentId).filter((p: TournamentPlayer) => !p.eliminated);
			if (remaining.length === 1) {
				db.updateTournament(tournamentId, { championId: remaining[0].id });
				console.log(`Champion: ${remaining[0].name}`);
			}
		} catch (error) {
			console.error('Error computing champion:', error);
		}
	}

	/* ================================================== */
	/* Match Operations                                    */
	/* ================================================== */

	getCurrentMatch(tournamentId: number): TournamentMatch | null {
		try {
			let t = db.getTournamentById(tournamentId);
			if (!t) return null;
			if (!t.curM && t.matchQueue.length > 0) {
				t.curM = t.matchQueue.shift() || null;
				t = db.updateTournament(tournamentId, {
					curM: t.curM,
					matchQueue: t.matchQueue
				});
				if (!t) throw new Error('Failed to update tournament');
				console.log(`Loaded next match from queue: ${t.curM?.id}`);
			}
			if (!t.curM && t.matchQueue.length === 0 && t.round > 0) {
				console.log('Attempting to advance to next round...');
				if (this.insertPlayersIntoNextRound(tournamentId)) {
					t = db.getTournamentById(tournamentId);
					if (t) return t.curM;
				}
			}
			if (!t) return null;
			return t.curM;
		} catch (error) {
			console.error('getCurrentMatch error:', error);
			return null;
		}
	}

	prepareMatch(tournamentId: number, matchId: number): Tournament | null {
		try {
			let t = db.getTournamentById(tournamentId);
			if (!t) return null;
			if (!t.curM || t.curM.id !== matchId) {
				let match = db.getMatchById(matchId);
				if (!match) return null;
				t = db.updateTournament(tournamentId, { curM: match });
				if (!t) throw new Error('Failed to update tournament');
			}
			if (!t.curM) return null;
			if (t.curM.isBye) {
				console.log(`Bye match ${matchId}, auto-completing`);
				this.endMatch(matchId);
				return null;
			}
			if (!this.allPlayersReadyForMatch(tournamentId)) {
				console.log('Waiting for players to be ready...');
				return null;
			}

			if (!this.createMatchRoom(t.curM)) return null;
			t.curM = db.getMatchById(matchId);
			if (!t || !t.curM || !t.curM.room|| !t.curM.room.roomId) {
				console.error('Failed to create match room');
				return null;
			}
			t = db.updateTournament(t.id, { curM: t.curM });
			return t;
		} catch (error) {
			console.error('startMatch error:', error);
			return null;
		}
	}

	endMatch(matchId: number): boolean {
		try {
			let match = db.getMatchById(matchId);
			if (!match) throw new Error('Match not found');
			this.computeWinnerIfPossible(matchId);
			if (!match.winnerId) {
				console.error('Cannot end match: no winner determined');
				return false;
			}
			if (match.p1 && match.p1.id !== match.winnerId)
				db.updatePlayer({ id: match.p1.id, eliminated: true });
			if (match.p2 && match.p2.id !== match.winnerId)
				db.updatePlayer({ id: match.p2.id, eliminated: true });

			match.status = 'completed';
			match.endedAt = new Date().toISOString();
			match = db.updateMatch(match);
			if (!match) throw new Error('Failed to update match');
			console.log(`Match ${matchId} completed. Winner: ${match.winnerId}`);
			const roomId = this.matchRooms.get(matchId);
			if (roomId)
				this.matchRooms.delete(matchId);
			if (!match.winnerId) throw new Error('Winner not set after computation');
			broadcastMatchEndToTournament(match.tournamentId, matchId, match.winnerId);
			return true;
		} catch (error) {
			console.error('endMatch error:', error);
			return false;
		}
	}

	private computeWinnerIfPossible(matchId: number): void {
		try {
			const match = db.getMatchById(matchId);
			if (!match) return;
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
			} else if (match.p1 || match.p2)
				match.winnerId = match.p1 ? match.p1.id : match.p2!.id;
			db.updateMatch(match);
		} catch (error) {
			console.error('Error computing winner:', error);
		}
	}

	private allPlayersReadyForMatch(tournamentId: number): boolean {
		try {
			const t = db.getTournamentById(tournamentId);
			if (!t || !t.curM) return false;
			const p1 = t.curM.p1;
			const p2 = t.curM.p2;
			return !!p1 && !!p2 && p1.isReady && p2.isReady;
		} catch (error) {
			console.error('allPlayersReadyForMatch error:', error);
			return false;
		}
	}

	toggleMatchPlayerReady(tournamentId: number, matchId: number, playerId: number): boolean {
		try {
			let t = db.getTournamentById(tournamentId);
			if (!t || !t.curM || t.curM.id !== matchId) return false;
			if (t.curM.p1 && t.curM.p1.id === playerId) {
				db.updatePlayer({ id: playerId, isReady: !t.curM.p1.isReady });
			} else if (t.curM.p2 && t.curM.p2.id === playerId) {
				t.curM.p2.isReady = !t.curM.p2.isReady;;
				console.debug(`Player ${playerId} ready state toggled to ${t.curM.p2.isReady}`);
				db.updatePlayer({ id: playerId, isReady: !t.curM.p2.isReady });
			}
			if (!t.curM.isBye && this.allPlayersReadyForMatch(tournamentId))
				console.debug('Both players are ready for match', matchId);
				t.curM.status = 'ready';
			t.curM = db.updateMatch({id: t.curM.id, status: t.curM.status, p1: t.curM.p1, p2: t.curM.p2});
			if (!t.curM) throw new Error('Failed to update match');
			t = db.updateTournament(t.id, { curM: t.curM });
			if (!t) throw new Error('Failed to update tournament');
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

	hydrateMatch(match: TournamentMatch | null): TournamentMatch | null {
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

	hydrateTournament(t: Tournament | null): Tournament | null {
        if (!t) return null;
        
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
			t.allMatches = this.hydrateAllMatches(t.allMatches);
			t.matchQueue = this.hydrateAllMatches(t.matchQueue);
            return t;
        } catch (error) {
            console.error('Error hydrating tournament:', error);
            return t;
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
			// return db.getTournamentById(tournamentId);
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
				if (!t) throw new Error('[Tournaments] hydrateTournament failed');
			}
			return tt;
			// return db.getAllTournaments() || [];
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
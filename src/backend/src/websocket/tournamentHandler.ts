import { FastifyInstance } from 'fastify';
import { tournamentManager as TManager } from '../tournament/tournamentManager';
import { activeGames } from '../routes/game';
import { TournamentMatch } from '../database/index';

const DEBUG = true;

// Store WebSocket connections per tournament and per match
const tournamentConnections = new Map<string, Map<string, any>>(); // Map<tournamentId, Map<participantId, socket>>
const matchConnections = new Map<string, Map<string, any>>(); // Map<matchId, Map<playerId, socket>>

// Optional reverse indices
const playerTournamentMap = new Map<string, string>(); // Map<playerId, tournamentId>
const playerMatchMap = new Map<string, string>(); // Map<playerId, matchId>

// Register Tournament and Match websocket routes
async function tournamentWebSocketRoutes(fastify: FastifyInstance) {
	// Tournament-level channel
	fastify.get('/tournament/:tournamentId/ws', { websocket: true }, (connection: any, req: any) => {
		const { tournamentId } = req.params as { tournamentId: string };
		const queryParams = new URLSearchParams((req.url.split('?')[1] || ''));
		const playerId = queryParams.get('playerId') || 'unknown';

		const tournament = TManager.getTournament(tournamentId);
		if (!tournament) {
			if (connection?.socket) connection.socket.close(1008, 'Tournament not found');
			return;
		}

		let socket = connection;
		if (!socket) return;

		if (!tournamentConnections.has(tournamentId)) tournamentConnections.set(tournamentId, new Map());
		const tournamentSockets = tournamentConnections.get(tournamentId)!;
		tournamentSockets.set(playerId, socket);
		playerTournamentMap.set(playerId, tournamentId);

		// Associate socket with player in manager
		TManager.setPlayerSocket(tournamentId, playerId, playerId);

		// Incoming messages
		socket.on('message', (data: any) => {
			try {
				const msg = JSON.parse(data.toString());
				handleTournamentMessage(tournamentId, playerId, msg, socket);
			} catch (e) {
				if (DEBUG) console.error('Tournament WS parse error', e);
			}
		});
		
		sendTournamentState(tournamentId, playerId);
		broadcastToTournament(tournamentId, { type: 'playerJoined', playerId, tournament: publicTournamentShape(tournament) }, playerId);

		socket.on('close', () => removeTournamentPlayer(tournamentId, playerId, playerMatchMap.get(playerId)));
		socket.on('error', () => removeTournamentPlayer(tournamentId, playerId, playerMatchMap.get(playerId)));

		safeSend(socket, { type: 'connected', tournamentId, playerId });
	});

	// Match-level channel
	fastify.get('/tournament/:tournamentId/match/:matchId/ws', { websocket: true }, (connection: any, req: any) => {
		const { tournamentId, matchId } = req.params as { tournamentId: string; matchId: string };
		const queryParams = new URLSearchParams((req.url.split('?')[1] || ''));
		const playerId = queryParams.get('playerId') || 'unknown';

		const match = TManager.getMatch(tournamentId, matchId);
		if (!match) {
			if (connection?.socket) connection.socket.close(1008, 'Match not found');
			return;
		}

		const socket = connection;
		if (!socket) return;

		if (!matchConnections.has(matchId)) matchConnections.set(matchId, new Map());
		const sockets = matchConnections.get(matchId)!;
		sockets.set(playerId, socket);
		playerMatchMap.set(playerId, matchId);

		// Associate socket with player in manager
		TManager.setMatchPlayerSocket(tournamentId, matchId, playerId, playerId);

		// Incoming messages
		socket.on('message', (data: any) => {
			try {
				const msg = JSON.parse(data.toString());
				handleMatchMessage(tournamentId, matchId, playerId, msg, socket);
			} catch (e) {
				if (DEBUG) console.error('Match WS parse error', e);
			}
		});
		
		sendMatchState(tournamentId, matchId, playerId);
		broadcastToMatch(matchId, { type: 'playerJoined', playerId, match: publicMatchShape(match) }, playerId);

		socket.on('close', () => removeTournamentPlayer(tournamentId, playerId, matchId));
		socket.on('error', () => removeTournamentPlayer(tournamentId, playerId, matchId));
		
		safeSend(socket, { type: 'connected', tournamentId, matchId, playerId });
	});
}

/* --------------------------- Handlers ---------------------------- */
function handleTournamentMessage(tournamentId: string, senderId: string, message: any, socket: any): void {
	const t = TManager.getTournament(tournamentId);
	if (!t) return;
	switch (message?.type) {
		case 'ping':
			safeSend(socket, { type: 'pong', ts: Date.now() });
			break;
		case 'requestState':
			sendTournamentState(tournamentId, senderId);
			break;
		default:
			if (DEBUG) console.log('Unknown tournament message', message);
	}
}

function handleMatchMessage(tournamentId: string, matchId: string, playerId: string, message: any, socket: any): void {
	const match = TManager.getMatch(tournamentId, matchId);
	if (!match) return;
	switch (message.type) {
		case 'ping':
			safeSend(socket, { type: 'pong', ts: Date.now() });
			break;
		case 'requestState':
			sendMatchState(tournamentId, matchId, playerId);
			break;
		case 'ready': {
			// const ok = TManager.toggleMatchPlayerReady(tournamentId, matchId, playerId);
			// if (ok) broadcastToMatch(matchId, { type: 'playerReady', playerId });
			broadcastToMatch(matchId, { type: 'playerReady', playerId, isReady: message.isReady });
			break;
		}
		case 'move': {
			if (typeof message.position === 'number' && match.gameId) {
				const engine = activeGames.get(match.gameId);
				if (engine && typeof engine.updatePlayerPosition === 'function') {
					const playerNum = getMatchPlayerNumber(match, playerId);
					engine.updatePlayerPosition(playerNum, message.position);
				}
				broadcastToMatch(matchId, { type: 'playerMove', playerId, position: message.position }, playerId);
			}
			break;
		}
		case 'keyState': {
			if (match.gameId) {
				const engine = activeGames.get(match.gameId);
				if (engine && typeof engine.setPlayerKeyState === 'function') {
					const playerNum = getMatchPlayerNumber(match, playerId);
					engine.setPlayerKeyState(playerNum, message.key, message.pressed);
				}
			}
			break;
		}
			
		default:
			if (DEBUG) console.log('Unknown match message', message);
	}
}

/* --------------------------- Helpers ----------------------------- */
function safeSend(socket: any, payload: any) {
	try {
		if (socket && typeof socket.send === 'function' && (socket.readyState === undefined || socket.readyState === 1)) {
			socket.send(JSON.stringify(payload));
		}
	} catch {}
}

function publicTournamentShape(t: any) {
	return {
		tournamentId: t.tournamentId,
		status: t.status,
		hostId: t.hostId,
		round: t.round,
		queue: t.queue,
		players: t.players,
		allMatches: t.allMatches,
		championId: t.championId
	};
}

function publicMatchShape(m: any) {
	return {
		matchRoomId: m.matchRoomId,
		status: m.status,
		playerId1: m.playerId1,
		playerId2: m.playerId2,
		gameId: m.gameId,
		round: m.round,
		roundIdx: m.roundIdx
	};
}

function getMatchPlayerNumber(match: TournamentMatch, playerId: string): number {
	if (playerId === match.playerId1) return 1;
	if (playerId === match.playerId2) return 2;
	return 1;
}

function sendTournamentState(tournamentId: string, receiverId: string): void {
	const t = TManager.getTournament(tournamentId);
	if (!t) return;
	const sockets = tournamentConnections.get(tournamentId);
	if (!sockets) return;
	const socket = sockets.get(receiverId);
	if (!socket) return;

	safeSend(socket, {
		type: 'tournamentState',
		tournament: publicTournamentShape(t)
	});
}

function sendMatchState(tournamentId: string, matchId: string, receiverId: string): void {
	const match = TManager.getMatch(tournamentId, matchId);
	if (!match) return;
	const sockets = matchConnections.get(matchId);
	if (!sockets) return;
	const socket = sockets.get(receiverId);
	if (!socket) return;

	// live game state if active
	if (match.gameId && match.status === 'active') {
		const engine = activeGames.get(match.gameId);
		if (engine) {
			safeSend(socket, {
				type: 'gameState',
				state: engine.getCurrentState?.()
			});
		}
	}
	safeSend(socket, {
		type: 'matchState',
		match: publicMatchShape(match)
	});
}

/* ------------------------ Connection utils ----------------------- */
function removeTournamentPlayer(tournamentId: string, playerId: string, matchId?: string) {
	const tournamentSockets = tournamentConnections.get(tournamentId);
	if (!tournamentSockets) return;
	if (matchId) {
		const matchSockets = matchConnections.get(matchId);
		if (matchSockets) {
			matchSockets.delete(playerId);
			if (matchSockets.size === 0)
				matchConnections.delete(matchId);
			else
				broadcastToMatch(matchId, { type: 'playerDisconnected', playerId });
		}
		playerMatchMap.delete(playerId);
	}
	tournamentSockets.delete(playerId);
	if (tournamentSockets.size === 0)
		tournamentConnections.delete(tournamentId);
	playerTournamentMap.delete(playerId);
	broadcastToTournament(tournamentId, { type: 'playerDisconnected', playerId });
}

// function removePlayerFromTournament(tournamentId: string, playerId: string) {
// 	const tournamentSockets = tournamentConnections.get(tournamentId);
// 	if (!tournamentSockets) return;
// 	tournamentSockets.delete(playerId);
// 	if (tournamentSockets.size === 0) tournamentConnections.delete(tournamentId);
// 	playerTournamentMap.delete(playerId);
// 	broadcastToTournament(tournamentId, { type: 'playerDisconnected', playerId });
// }

// function removePlayerFromMatch(matchId: string, playerId: string) {
// 	const matchSockets = matchConnections.get(matchId);
// 	if (!matchSockets) return;
// 	matchSockets.delete(playerId);
// 	if (matchSockets.size === 0) matchConnections.delete(matchId);
// 	playerMatchMap.delete(playerId);
// 	broadcastToMatch(matchId, { type: 'playerDisconnected', playerId });
// }

/* ----------------------------- API -------------------------------- */
export function broadcastToTournament(tournamentId: string, message: any, excludeId?: string) {
	const sockets = tournamentConnections.get(tournamentId);
	if (!sockets) return;
	const msg = JSON.stringify(message);
	const dead: any[] = [];
	sockets.forEach((socket, pid) => {
		if (excludeId && pid === excludeId) return;
		try {
			if (socket && typeof socket.send === 'function' && (socket.readyState === undefined || socket.readyState === 1)) {
				socket.send(msg);
			} else {
				dead.push(pid);
			}
		} catch {
			dead.push(pid);
		}
	});
	dead.forEach((pid) => sockets.delete(pid));
	if (sockets.size === 0) tournamentConnections.delete(tournamentId);
}

export function broadcastToMatch(matchId: string, message: any, excludeId?: string) {
	const sockets = matchConnections.get(matchId);
	if (!sockets) return;
	const msg = JSON.stringify(message);
	const dead: any[] = [];
	sockets.forEach((socket, pid) => {
		if (excludeId && pid === excludeId) return;
		try {
			if (socket && typeof socket.send === 'function' && (socket.readyState === undefined || socket.readyState === 1)) {
				socket.send(msg);
			} else {
				dead.push(pid);
			}
		} catch {
			dead.push(pid);
		}
	});
	dead.forEach((pid) => sockets.delete(pid));
	if (sockets.size === 0) matchConnections.delete(matchId);
}

export function broadcastGameStartToMatch(matchId: string, gameId: number) {
	broadcastToMatch(matchId, { type: 'gameStart', gameId });
}

export function broadcastCountdownToMatch(matchId: string) {
	broadcastToMatch(matchId, { type: 'countdown', message: 'Match starting soon' });
}

export function broadcastGameStateToMatch(matchId: string, state: any) {
	broadcastToMatch(matchId, { type: 'gameState', state });
}

export function broadcastScoreToMatch(matchId: string, scores: any) {
	broadcastToMatch(matchId, { type: 'score', ...scores });
}

export function broadcastGameEndToMatch(matchId: string, winnerId: string) {
	broadcastToMatch(matchId, { type: 'gameEnd', winnerId });
}

export function broadcastTournamentEnd(tournamentId: string, championId: string) {
	broadcastToTournament(tournamentId, { type: 'tournamentEnd', championId });
}

export function broadcastMatchEndToTournament(tournamentId: string, matchId: string, winnerId: string) {
	broadcastToTournament(tournamentId, { type: 'matchEnd', matchId, winnerId });
}

export function getTournamentConnectionCount(tournamentId: string): number {
	return tournamentConnections.get(tournamentId)?.size || 0;
}

export function isTournamentPlayerConnected(tournamentId: string, playerId: string): boolean {
	return tournamentConnections.get(tournamentId)?.has(playerId) || false;
}

export function getMatchConnectionCount(matchId: string): number {
	return matchConnections.get(matchId)?.size || 0;
}

export function isMatchPlayerConnected(matchId: string, playerId: string): boolean {
	return matchConnections.get(matchId)?.has(playerId) || false;
}

export default tournamentWebSocketRoutes;


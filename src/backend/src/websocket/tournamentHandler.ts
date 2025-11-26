import { FastifyInstance } from 'fastify';
import { tournamentManager } from '../tournament/tournamentManager';
import { Tournament, TournamentMatch } from '../types/index';
import { activeGames } from '../routes/game';

const DEBUG = true;

const tournamentConnections = new Map<number, Map<number, any>>(); // Map<tournamentId, Map<playerId, socket>>
const playerTournamentMap = new Map<number, number>(); // Map<playerId, tournamentId>

async function tournamentWebSocketRoutes(fastify: FastifyInstance) {
	fastify.get('/api/tournament/:tournamentId/ws', { websocket: true }, (connection: any, req: any) => {
		const { tournamentId } = req.params;
		const queryParams = new URLSearchParams(req.url.split('?')[1] || '');
		const playerId = parseInt(queryParams.get('playerId') || '0');
		const tournamentIdNum = parseInt(tournamentId);

		if (isNaN(tournamentIdNum) || tournamentIdNum <= 0) {
			console.error('Invalid tournament or player ID');
			if (connection.socket)
				connection.socket.close(1008, 'Invalid tournament or player ID');
			return;
		}
		const tournament = tournamentManager.getTournament(tournamentIdNum);
        if (!tournament) {
            console.log(`Tournament ${tournamentIdNum} not found`);
            if (connection.socket)
                connection.socket.close(1008, 'Tournament not found');
            return;
        }
		let socket = connection;
		if (!socket) {
			console.log('Invalid socket connection');
			return;
		}
		if (!tournamentConnections.has(tournamentIdNum))
			tournamentConnections.set(tournamentIdNum, new Map());

		const tournamentSockets = tournamentConnections.get(tournamentIdNum)!;
		tournamentSockets.set(playerId, socket);
		playerTournamentMap.set(playerId, tournamentIdNum);

		tournamentManager.setPlayerSocket(playerId, playerId.toString());

        if (DEBUG) console.log(`Player ${playerId} connected to tournament ${tournamentIdNum}`);

		socket.on('message', (data: any) => {
			try {
				const message = JSON.parse(data.toString());
				handleTournamentMessage(tournamentIdNum, playerId, message, socket);
			} catch (error) {
				console.error('Error parsing tournament WebSocket message:', error);
			}
		});

		sendTournamentState(tournamentIdNum, playerId);

		broadcastToTournament(tournamentIdNum, {
			type: 'playerJoined',
			playerId: playerId,
			tournament: tournament
		}, playerId);

		socket.on('close', () => {
			console.log(`Player ${playerId} disconnected from tournament ${tournamentIdNum}`);
			removeTournamentPlayer(tournamentIdNum, playerId);
		});

		socket.on('error', (error: any) => {
			console.error(`Tournament WebSocket error for player ${playerId}:`, error);
			removeTournamentPlayer(tournamentIdNum, playerId);
		});

		if (typeof socket.send === 'function') {
			socket.send(JSON.stringify({
				type: 'connected',
				tournamentId: tournamentIdNum,
				playerId,
				message: 'Connected to tournament successfully'
			}));
		}
	});
}

async function handleTournamentMessage(tournamentId: number, playerId: number, message: any, socket: any): Promise<void> {
	const t = tournamentManager.getTournament(tournamentId);
	if (!t) return;
	switch (message.type) {
		case 'ping':
			socket.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
			break;

		case 'ready':
			let curM = await tournamentManager.getCurrentMatch(tournamentId);
			if (curM) {
				broadcastToTournament(tournamentId, {
					type: 'playerReady',
					playerId,
					matchId: curM.id
				});
			}
			break;

		case 'requestState':
			sendTournamentState(tournamentId, playerId);
			break;

		case 'requestMatchState':
			const m = await tournamentManager.getCurrentMatch(tournamentId);
			if (m)
				sendMatchState(tournamentId, playerId, m.id);
			break;

		case 'move':
			const activeMatch = await tournamentManager.getCurrentMatch(tournamentId);
			if (activeMatch && activeMatch.gameId && typeof message.position === 'number') {
				const gameEngine = activeGames.get(activeMatch.gameId);
				if (gameEngine && typeof gameEngine.updatePlayerPosition === 'function') {
					const playerNumber = getMatchPlayerNumber(activeMatch, playerId);
					gameEngine.updatePlayerPosition(playerNumber, message.position);
				}
				broadcastToTournament(tournamentId, {
					type: 'playerMove',
					playerId,
					matchId: activeMatch.id,
					position: message.position
				});
			}
			break;

		case 'keyState':
			const keyMatch = await tournamentManager.getCurrentMatch(tournamentId);
			if (keyMatch && keyMatch.gameId) {
				const gameEngine = activeGames.get(keyMatch.gameId);
				if (gameEngine && typeof gameEngine.setPlayerKeyState === 'function') {
					// If isGuest is true, this is the local player (player 2), otherwise use the websocket playerId
					let playerNumber;
					if (message.isGuest) {
						// Local player is always player 2
						playerNumber = 2;
					} else {
						playerNumber = getMatchPlayerNumber(keyMatch, playerId);
					}
					gameEngine.setPlayerKeyState(playerNumber, message.key, message.pressed);
				}
			}
			break;

		case 'startTournament':
			if (t.hostId === playerId)
				tournamentManager.startTournament(tournamentId);
			break;

		default:
			if (DEBUG)
				console.log(`Unknown tournament message type: ${message.type}`);
	}
}

function getMatchPlayerNumber(match: any, playerId: number): number {
	if (match.p1?.id === playerId) return 1;
	if (match.p2?.id === playerId) return 2;
	return 1;
}

function sendTournamentState(tournamentId: number, playerId: number): void {
	const t = tournamentManager.getTournament(tournamentId);
	if (!t) return;
	const tournamentSockets = tournamentConnections.get(tournamentId);
	if (!tournamentSockets) return;
	const socket = tournamentSockets.get(playerId);
	if (!socket || typeof socket.send !== 'function') return;
	socket.send(JSON.stringify({
		type: 'tournamentState',
		tournament: t
	}));
}

function sendMatchState(tournamentId: number, playerId: number, matchId: number): void {
	const m = tournamentManager.getMatch(matchId);
	if (!m) return;
	const tournamentSockets = tournamentConnections.get(tournamentId);
	if (!tournamentSockets) return;
	const socket = tournamentSockets.get(playerId);
	if (!socket || typeof socket.send !== 'function') return;
	if (m.gameId && m.status === 'active') {
		const gameEngine = activeGames.get(m.gameId);
		if (gameEngine) {
			socket.send(JSON.stringify({
				type: 'gameState',
				state: gameEngine.getCurrentState?.()
			}));
		}
	}
	socket.send(JSON.stringify({
		type: 'matchState',
		match: m
	}));
}

export function broadcastToTournament(tournamentId: number, message: any, excludePlayerId?: number): void {
	const tournamentSockets = tournamentConnections.get(tournamentId);
	if (!tournamentSockets) return;
	const messageStr = JSON.stringify(message);
	const deadConnections: number[] = [];

	tournamentSockets.forEach((socket, playerId) => {
		if (excludePlayerId && playerId === excludePlayerId) return;
		if (socket && typeof socket.send === 'function') {
			try {
				if (typeof socket.readyState !== 'undefined' && socket.readyState === 1)
					socket.send(messageStr);
				else 
					deadConnections.push(playerId);
			} catch (error) {
				console.error(`Error sending to player ${playerId}:`, error);
				deadConnections.push(playerId);
			}
		} else
			deadConnections.push(playerId);
	});

	deadConnections.forEach(playerId => { tournamentSockets.delete(playerId) });
	if (tournamentSockets.size === 0)
		tournamentConnections.delete(tournamentId);
}

function removeTournamentPlayer(tournamentId: number, playerId: number): void {
	const tournamentSockets = tournamentConnections.get(tournamentId);
	if (tournamentSockets) {
		tournamentSockets.delete(playerId);
		if (tournamentSockets.size === 0)
			tournamentConnections.delete(tournamentId);
		else {
			broadcastToTournament(tournamentId, {
				type: 'playerDisconnected',
				playerId,
			});
		}
	}
	playerTournamentMap.delete(playerId);
}

export function broadcastGameStartToMatch(matchId: number, gameId: number): void {
	const m = tournamentManager.getMatch(matchId);
	if (!m) return;
	broadcastToTournament(m.tournamentId, {
		type: 'gameStart',
		matchId,
		gameId,
	});
}

export function broadcastCountdownToMatch(matchId: number): void {
	const m = tournamentManager.getMatch(matchId);
	if (!m) return;
	broadcastToTournament(m.tournamentId, {
		type: 'countdown',
		matchId,
		message: 'Match starting soon'
	});
}

export function broadcastGameStateToMatch(matchId: number, gameState: any): void {
	const m = tournamentManager.getMatch(matchId);
	if (!m) return;
	broadcastToTournament(m.tournamentId, {
		type: 'gameState',
		matchId,
		state: gameState,
	});
}

export function broadcastScoreToMatch(matchId: number, scores: any): void {
	const m = tournamentManager.getMatch(matchId);
	if (!m) return;
	broadcastToTournament(m.tournamentId, {
		type: 'score',
		matchId,
		...scores,
	});
}

export function broadcastGameEndToMatch(matchId: number, winnerId: number): void {
	const m = tournamentManager.getMatch(matchId);
	const players = [m?.p1, m?.p2]
	if (!m) return;
	broadcastToTournament(m.tournamentId, {
		type: 'gameEnd',
		matchId,
		winnerId,
		players
	});
}

export function broadcastMatchEndToTournament(tournamentId: number, matchId: number, winnerId: number): void {
	const m = tournamentManager.getMatch(matchId);
	const players = [m?.p1, m?.p2]
	broadcastToTournament(tournamentId, {
		type: 'matchEnd',
		matchId,
		winnerId,
		players
	});
	const t = tournamentManager.getTournament(tournamentId);
	if (t) {
		broadcastToTournament(tournamentId, {
			type: 'tournamentState',
			tournament: t
		});
	}
}

export function broadcastTournamentState(tournamentId: number): void {
	const t = tournamentManager.getTournament(tournamentId);
	if (!t) return;
	broadcastToTournament(tournamentId, {
		type: 'tournamentState',
		tournament: t
	});
}

export function broadcastTournamentEnd(tournamentId: number): void {
	broadcastToTournament(tournamentId, {
		type: 'tournamentEnd',
		tournamentId,
	});
}

export function getTournamentConnectionCount(tournamentId: number): number {
	const tournamentSockets = tournamentConnections.get(tournamentId);
	return tournamentSockets ? tournamentSockets.size : 0;
}

export function isTournamentPlayerConnected(tournamentId: number, playerId: number): boolean {
	const tournamentSockets = tournamentConnections.get(tournamentId);
	return tournamentSockets ? tournamentSockets.has(playerId) : false;
}

export default tournamentWebSocketRoutes;

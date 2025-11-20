import { FastifyInstance } from 'fastify';
import { tournamentManager as TManager } from '../tournament/tournamentManager';
import { TournamentMatch } from '../types/index';
import { activeGames } from '../routes/game';

const DEBUG = true;

const tournamentConnections = new Map<number, Map<number, any>>(); // Map<tournamentId, Map<participantId, socket>>

const playerTournamentMap = new Map<number, number>(); // Map<playerId, tournamentId>

async function tournamentWebSocketRoutes(fastify: FastifyInstance) {
	fastify.get('/api/tournament/:tournamentId/ws', { websocket: true }, async (connection: any, req: any) => {
		const { tournamentId } = req.params as { tournamentId: string };
		const queryParams = new URLSearchParams((req.url.split('?')[1] || ''));
		const rawPid = queryParams.get('playerId') || '';
		const tId = +tournamentId;
		const playerId = +rawPid;
		if (isNaN(tId) || isNaN(playerId) || tId <= 0 || playerId <= 0) {
			if (connection?.socket) connection.socket.close(1008, 'Invalid tournament or player ID');
			return;
		}

		const tournament = await TManager.getTournament(tId);
		if (!tournament) {
			if (connection?.socket) connection.socket.close(1008, 'Tournament not found');
			return;
		}

		const socket = connection?.socket;
		if (!socket) return;

		if (!tournamentConnections.has(tId)) tournamentConnections.set(tId, new Map());
		const tournamentSockets = tournamentConnections.get(tId)!;
		tournamentSockets.set(playerId, socket);
		playerTournamentMap.set(playerId, tId);
		TManager.setPlayerSocket(playerId, playerId.toString());

		socket.on('message', (data: any) => {
			try {
				const msg = JSON.parse(data.toString());
				handleTournamentMessage(tId, playerId, msg, socket);
			} catch (e) {
				if (DEBUG) console.error('Tournament WS parse error', e);
			}
		});
		
		sendTournamentState(tId, playerId);
		broadcastToTournament(tId, { type: 'playerJoined', playerId, tournament: publicTournamentShape(tournament) }, playerId);

		socket.on('close', () => removeTournamentPlayer(tId, playerId));
		socket.on('error', () => removeTournamentPlayer(tId, playerId));

		safeSend(socket, { type: 'connected', tournamentId: tId, playerId });
	});
}

/* --------------------------- Handlers ---------------------------- */
function handleTournamentMessage(tournamentId: number, senderId: number, message: any, socket: any): void {
	const tPromise = Promise.resolve(TManager.getTournament(tournamentId));
	switch (message?.type) {
		case 'ping':
			safeSend(socket, { type: 'pong', ts: Date.now() });
			break;
		case 'requestState':
			sendTournamentState(tournamentId, senderId);
			break;
		case 'requestMatchState':
			tPromise.then(t => {
				const m = t?.curM;
				if (m) sendMatchStateViaTournament(tournamentId, senderId, m.id);
			});
			break;
		case 'ready':
			tPromise.then(t => {
				const m = t?.curM; if (!m) return;
				broadcastToTournament(tournamentId, { type: 'playerReady', playerId: senderId, isReady: message.isReady, matchId: m.id });
			});
			break;
		case 'move':
			tPromise.then(t => {
				const m = t?.curM; if (!m) return;
				if (typeof message.position === 'number' && m.gameId) {
					const engine = activeGames.get(m.gameId);
					if (engine && typeof engine.updatePlayerPosition === 'function') {
						const playerNum = getMatchPlayerNumber(m as TournamentMatch, senderId);
						engine.updatePlayerPosition(playerNum, message.position);
					}
					broadcastToTournament(tournamentId, { type: 'playerMove', playerId: senderId, position: message.position, matchId: m.id });
				}
			});
			break;
		case 'keyState':
			tPromise.then(t => {
				const m = t?.curM; if (!m || !m.gameId) return;
				const engine = activeGames.get(m.gameId);
				if (engine && typeof engine.setPlayerKeyState === 'function') {
					const playerNum = getMatchPlayerNumber(m as TournamentMatch, senderId);
					engine.setPlayerKeyState(playerNum, message.key, message.pressed);
				}
			});
			break;
		default:
			if (DEBUG) console.log('Unknown tournament message', message);
	}
}

/* --------------------------- Helpers ----------------------------- */
function safeSend(socket: any, payload: any) {
	if (socket && typeof socket.send === 'function' && (socket.readyState === undefined || socket.readyState === 1))
		socket.send(JSON.stringify(payload));
}

export function publicTournamentShape(t: any) {
	return {
		id: t.id,
		status: t.status,
		round: t.round,
		players: t.players,
		allMatches: t.allMatches,
		curM: t.curM,
		matchQueue:t.matchQueue,
		championId: t.championId,
		createdAt: t.createdAt,
		startedAt: t.startedAt,
		endedAt: t.endedAt
	};
}

export function publicMatchShape(m: any) {
	return {
		id: m.id,
		tournamentId: m.tournamentId,
		status: m.status,
		p1: m.p1,
		p2: m.p2,
		gameId: m.gameId,
		winnerId: m.winnerId,
		round: m.round,
		roundIdx: m.roundIdx,
		isBye: m.isBye,
		createdAt: m.createdAt,
		startedAt: m.startedAt,
		endedAt: m.endedAt
	};
}

function getMatchPlayerNumber(match: TournamentMatch, playerId: number): number {
	if (playerId === match.p1?.id) return 1;
	if (playerId === match.p2?.id) return 2;
	return 1;
}

async function sendTournamentState(tournamentId: number, receiverId: number): Promise<void> {
	const t = await TManager.getTournament(tournamentId);
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

async function sendMatchStateViaTournament(tournamentId: number, receiverId: number, matchId: number): Promise<void> {
	const match = await TManager.getMatch(matchId);
	if (!match) return;
	const sockets = tournamentConnections.get(tournamentId);
	if (!sockets) return;
	const socket = sockets.get(receiverId);
	if (!socket) return;

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
function removeTournamentPlayer(tournamentId: number, playerId: number) {
	const tournamentSockets = tournamentConnections.get(tournamentId);
	if (!tournamentSockets) return;
	tournamentSockets.delete(playerId);
	if (tournamentSockets.size === 0)
		tournamentConnections.delete(tournamentId);
	playerTournamentMap.delete(playerId);
	broadcastToTournament(tournamentId, { type: 'playerDisconnected', playerId });
}

/* ----------------------------- API -------------------------------- */
export function broadcastToTournament(tournamentId: number, message: any, excludeId?: number) {
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

export function broadcastToMatch(matchId: number, message: any, excludeId?: number) {
	// Route match events through the tournament channel (single-WS design)
	Promise.resolve(TManager.getMatch(matchId)).then(m => {
		if (!m) return;
		const payload = { ...message, matchId };
		broadcastToTournament(m.tournamentId, payload);
	});
}

export function broadcastGameStartToMatch(matchId: number, gameId: number) {
	broadcastToMatch(matchId, { type: 'gameStart', gameId });
}

export function broadcastCountdownToMatch(matchId: number) {
	broadcastToMatch(matchId, { type: 'countdown', message: 'Match starting soon' });
}

export function broadcastGameStateToMatch(matchId: number, state: any) {
	broadcastToMatch(matchId, { type: 'gameState', state });
}

export function broadcastScoreToMatch(matchId: number, scores: any) {
	broadcastToMatch(matchId, { type: 'score', ...scores });
}

export function broadcastGameEndToMatch(matchId: number, winnerId: number) {
	broadcastToMatch(matchId, { type: 'gameEnd', winnerId });
}

export function broadcastTournamentEnd(tournamentId: number) {
	broadcastToTournament(tournamentId, { type: 'tournamentEnd' });
}

export function broadcastMatchEndToTournament(tournamentId: number, matchId: number, winnerId: number) {
	broadcastToTournament(tournamentId, { type: 'matchEnd', matchId, winnerId });
	Promise.resolve(TManager.getTournament(tournamentId)).then(t => {
		if (t) broadcastToTournament(tournamentId, { type: 'tournamentState', tournament: publicTournamentShape(t) });
	});
}

export function broadcastTournamentState(tournamentId: number) {
	Promise.resolve(TManager.getTournament(tournamentId)).then(t => {
		if (!t) return;
		broadcastToTournament(tournamentId, { type: 'tournamentState', tournament: publicTournamentShape(t) });
	});
}

export function getTournamentConnectionCount(tournamentId: number): number {
	return tournamentConnections.get(tournamentId)?.size || 0;
}

export function isTournamentPlayerConnected(tournamentId: number, playerId: number): boolean {
	return tournamentConnections.get(tournamentId)?.has(playerId) || false;
}

export default tournamentWebSocketRoutes;

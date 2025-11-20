import { API_BASE } from '../config';

interface TournamentWebSocketConfig {
	tournamentId: string;
	playerId: string;
	onConnect?: (scope: 'tournament') => void;
	onDisconnect?: (scope: 'tournament') => void;
	onTournamentState?: (tournament: any) => void;
	onMatchState?: (match: any) => void;
	onMatchEnd?: (data: { matchId: string; winnerId: string | null }) => void;
	onGameState?: (state: any) => void;
	onPlayerMove?: (playerId: string, position: number) => void;
	onPlayerReady?: (playerId: string) => void;
	onPlayerDisconnected?: (data: { playerId: string; scope: 'tournament' }) => void;
	onPlayerJoined?: (data: { playerId: string; scope: 'tournament'; tournament?: any; match?: any }) => void;
	onScore?: (matchId: string, scores: any) => void;
	onGameStart?: (gameId: number) => void;
	onCountdown?: () => void;
	onGameEnd?: (data: { winnerId: string; winnerSeat?: string; winnerName?: string; matchId: string }) => void;
	onError?: (error: Error, scope: 'tournament') => void;
	onTournamentEnd?: (tournamentId: string) => void;
}

type ScopedWS = {
	ws: WebSocket | null;
	reconnectAttempts: number;
	intentionalClose: boolean;
	heartbeatInterval: number | null;
};

export class TournamentWebSocketManager {
	private tournamentCfg: TournamentWebSocketConfig;
	private tournamentWS: ScopedWS = { ws: null, reconnectAttempts: 0, intentionalClose: false, heartbeatInterval: null };

	private readonly maxReconnectAttempts = 5;
	private readonly baseReconnectDelay = 2000; // ms
	private readonly heartbeatMs = 30000;

  	private currentMatchId: string | null = null;

	constructor(cfg: TournamentWebSocketConfig) {
		this.tournamentCfg = cfg;
	}

	// ---------- Public API ----------
	disconnectAll(): void { this.disconnectTournament(); }

	connectTournament(): Promise<void> { return this.openChannel('tournament'); }
	disconnectTournament(): void { this.closeChannel('tournament'); }
	isTournamentConnected(): boolean { return this.tournamentWS.ws?.readyState === WebSocket.OPEN; }
	requestTournamentState(): void { this.send('tournament', { type: 'requestState' }); }
	stopTournament(): void { this.send('tournament', { type: 'stop' }); }

	async connectMatch(cfg: { matchId: string }): Promise<void> {
		this.currentMatchId = cfg.matchId;
		this.requestMatchState();
	}
	disconnectMatch(): void { /* no-op on single channel */ }
	isMatchConnected(): boolean { return this.isTournamentConnected(); }
	requestMatchState(): void { this.send('tournament', { type: 'requestMatchState' }); }
	sendReady(): void { this.send('tournament', { type: 'ready' }); }
	sendMove(position: number): void { this.send('tournament', { type: 'move', position }); }
	sendKeyState(key: string, pressed: boolean, isGuest?: boolean): void { this.send('tournament', { type: 'keyState', key, pressed, isGuest }); }

	// ---------- Internal: Open / Close Channels ----------
	private openChannel(scope: 'tournament'): Promise<void> {
		return new Promise((resolve, reject) => {
			try {
				const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
				let apiUrl: URL;
				try {
					apiUrl = new URL(API_BASE);
				} catch {
					apiUrl = new URL(`${window.location.protocol}//${window.location.hostname}:3000`);
				}
				const host = apiUrl.host;

				const url = `${wsProtocol}//${host}/api/tournament/${this.tournamentCfg.tournamentId}/ws?playerId=${this.tournamentCfg.playerId}`;
				const bucket = this.tournamentWS;
				bucket.intentionalClose = false;
				bucket.ws = new WebSocket(url);

				bucket.ws.onopen = () => {
					bucket.reconnectAttempts = 0;
					this.startHeartbeat(scope);
					this.tournamentCfg.onConnect?.('tournament');
					resolve();
				};

				bucket.ws.onmessage = (ev) => {
				try {
					const msg = JSON.parse(ev.data);
					this.handleMessage(scope, msg);
				} catch (e) {
					console.error('[tournamentWS] parse error', e);
				}
				};

				bucket.ws.onclose = () => {
					this.stopHeartbeat(scope);
					this.tournamentCfg.onDisconnect?.('tournament');
					if (!bucket.intentionalClose && bucket.reconnectAttempts < this.maxReconnectAttempts) {
						bucket.reconnectAttempts++;
						const delay = this.baseReconnectDelay * bucket.reconnectAttempts;
						setTimeout(() => this.openChannel(scope).catch(() => {}), delay);
					}
				};

				bucket.ws.onerror = () => {
					this.tournamentCfg.onError?.(new Error('WebSocket error'), 'tournament');
				};

				setTimeout(() => {
					if (bucket.ws && bucket.ws.readyState !== WebSocket.OPEN) {
						try { bucket.ws.close(); } catch {}
						reject(new Error(`WebSocket ${scope} connection timeout`));
					}
				}, 5000);
			} catch (err) {
				reject(err);
			}
		});
	}

	private closeChannel(scope: 'tournament'): void {
		const bucket = this.tournamentWS;
		bucket.intentionalClose = true;
		this.stopHeartbeat(scope);
		if (bucket.ws) bucket.ws.close(1000, 'Client disconnect');
		bucket.ws = null;
	}

	// ---------- Heartbeat ----------
	private startHeartbeat(scope: 'tournament') {
		const bucket = this.tournamentWS;
		bucket.heartbeatInterval = window.setInterval(() => {
			if (bucket.ws && bucket.ws.readyState === WebSocket.OPEN)
				this.send(scope, { type: 'ping', ts: Date.now() });
		}, this.heartbeatMs);
	}

	private stopHeartbeat(_scope: 'tournament') {
		const bucket = this.tournamentWS;
		if (bucket.heartbeatInterval) {
			clearInterval(bucket.heartbeatInterval);
			bucket.heartbeatInterval = null;
		}
	}

	// ---------- Sending ----------
	private send(_scope: 'tournament', payload: any): void {
		const bucket = this.tournamentWS;
		if (!bucket.ws || bucket.ws.readyState !== WebSocket.OPEN) return;
		try {
			bucket.ws.send(JSON.stringify(payload));
		} catch (e) {
			console.error('[tournamentWS] send error', e);
		}
	}

	// ---------- Message Routing ----------
	private handleMessage(_scope: 'tournament', message: any): void {
		switch (message?.type) {
		case 'connected':
			this.tournamentCfg.onConnect?.('tournament');
			break;
		case 'disconnected':
			this.tournamentCfg.onDisconnect?.('tournament');
			break;
		case 'pong':
			break;
		case 'countdown': {
			this.tournamentCfg.onCountdown?.();
			break;
		}
		case 'gameStart': {
			if (typeof message.gameId === 'number')
				this.tournamentCfg.onGameStart?.(message.gameId);
			break;
		}
		case 'gameEnd': {
			this.tournamentCfg.onGameEnd?.({
				winnerId: message.winner || message.winnerId,
				winnerSeat: message.winnerSeat,
				winnerName: message.winnerName,
				matchId: message.matchId || this.currentMatchId || ''
			});
			break;
		}
		case 'score': {
			const scores = {
				scorePlayer1: message.scorePlayer1,
				scorePlayer2: message.scorePlayer2
			};
			const matchId = message.matchId || this.currentMatchId || '';
			this.tournamentCfg.onScore?.(matchId, scores);
			break;
		}
		case 'playerJoined': {
			this.tournamentCfg.onPlayerJoined?.({
				playerId: message.playerId,
				scope: 'tournament',
				tournament: message.tournament,
				match: message.match,
			});
			break;
		}
		case 'playerDisconnected': {
			this.tournamentCfg.onPlayerDisconnected?.({ playerId: message.playerId, scope: 'tournament' });
			break;
		}
		case 'tournamentState': {
			this.tournamentCfg.onTournamentState?.(message.tournament);
			break;
		}
		case 'matchEnd': {
			const winnerId = message.winnerId != null ? String(message.winnerId) : null;
			const matchId = String(message.matchId || this.currentMatchId || '');
			this.tournamentCfg.onMatchEnd?.({ matchId, winnerId });
			break;
		}
		case 'matchState': {
			this.tournamentCfg.onMatchState?.(message.match);
			break;
		}
		case 'gameState': {
			this.tournamentCfg.onGameState?.(message.state);
			break;
		}
		case 'playerReady': {
			this.tournamentCfg.onPlayerReady?.(message.playerId);
			break;
		}
		case 'playerMove': {
			this.tournamentCfg.onPlayerMove?.(message.playerId, message.position);
			break;
		}
		case 'tournamentEnd': {
			this.tournamentCfg.onTournamentEnd?.(message.tournamentId);
			break;
		}
		default:
			// Unknown / ignore
			break;
		}
	}
}

// ----------- Singleton Helpers -----------
let globalTournamentWS: TournamentWebSocketManager | null = null;

export function initTournamentWebSocket(cfg: TournamentWebSocketConfig): TournamentWebSocketManager {
	if (globalTournamentWS)
		globalTournamentWS.disconnectAll();
	globalTournamentWS = new TournamentWebSocketManager(cfg);
	return globalTournamentWS;
}

export function getTournamentWebSocket(): TournamentWebSocketManager | null {
  	return globalTournamentWS;
}

export function disconnectTournamentWebSocket(): void {
	if (globalTournamentWS) {
		globalTournamentWS.disconnectAll();
		globalTournamentWS = null;
	}
}

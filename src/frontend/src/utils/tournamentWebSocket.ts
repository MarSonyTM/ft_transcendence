interface TournamentWebSocketConfig {
	tournamentId: string;
	matchId?: string;
	playerId: string;
	onConnect?: (scope: 'tournament' | 'match') => void;
	onDisconnect?: (scope: 'tournament' | 'match') => void;
	onTournamentState?: (tournament: any) => void;
	onMatchState?: (match: any) => void;
	onGameState?: (state: any) => void;
	onPlayerMove?: (playerId: string, position: number) => void;
	onPlayerReady?: (playerId: string) => void;
	onPlayerDisconnected?: (data: { playerId: string; scope: 'tournament' | 'match' }) => void;
	onPlayerJoined?: (data: { playerId: string; scope: 'tournament' | 'match'; tournament?: any; match?: any }) => void;
	onScore?: (matchId: string, scores: any) => void;
	onGameStart?: (gameId: number) => void;
	onCountdown?: () => void;
	onGameEnd?: (data: { winnerId: string; winnerSeat?: string; winnerName?: string; matchId: string }) => void;
	onError?: (error: Error, scope: 'tournament' | 'match') => void;
	onTournamentEnd?: (tournamentId: string) => void;
}

interface MatchChannelConfig extends TournamentWebSocketConfig {
    matchId: string; // Required for match-level connections
}

type ScopedWS = {
	ws: WebSocket | null;
	reconnectAttempts: number;
	intentionalClose: boolean;
	heartbeatInterval: number | null;
};

export class TournamentWebSocketManager {
	private tournamentCfg: TournamentWebSocketConfig;
	private matchCfg: MatchChannelConfig | null = null;

	private tournamentWS: ScopedWS = { ws: null, reconnectAttempts: 0, intentionalClose: false, heartbeatInterval: null };
	private matchWS: ScopedWS = { ws: null, reconnectAttempts: 0, intentionalClose: false, heartbeatInterval: null };

	private readonly maxReconnectAttempts = 5;
	private readonly baseReconnectDelay = 2000; // ms
	private readonly heartbeatMs = 30000;

	constructor(cfg: TournamentWebSocketConfig) {
		this.tournamentCfg = cfg;
	}

	// ---------- Public API ----------
	connectTournament(): Promise<void> {
		return this.openChannel('tournament');
	}

	connectMatch(cfg: { matchId: string }): Promise<void> {
		this.matchCfg = { ...this.tournamentCfg, matchId: cfg.matchId };
		return this.openChannel('match');
	}

	disconnectTournament(): void {
		this.closeChannel('tournament');
	}

	disconnectMatch(): void {
		this.closeChannel('match');
	}

	disconnectAll(): void {
		this.disconnectTournament();
		this.disconnectMatch();
	}

	isTournamentConnected(): boolean {
		return this.tournamentWS.ws?.readyState === WebSocket.OPEN;
	}

	isMatchConnected(): boolean {
		return this.matchWS.ws?.readyState === WebSocket.OPEN;
	}

	requestTournamentState(): void {
		this.send('tournament', { type: 'requestState' });
	}

	requestMatchState(): void {
		this.send('match', { type: 'requestState' });
	}

	sendReady(): void {
		this.send('match', { type: 'ready' });
	}

	sendMove(position: number): void {
		this.send('match', { type: 'move', position });
	}

	sendKeyState(key: string, pressed: boolean): void {
		this.send('match', { type: 'keyState', key, pressed });
	}

	stopTournament(): void {
		this.send('tournament', { type: 'stop' });
	}

	// ---------- Internal: Open / Close Channels ----------
	private openChannel(scope: 'tournament' | 'match'): Promise<void> {
		return new Promise((resolve, reject) => {
			try {
				const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
				const host = window.location.hostname === 'localhost' ? 'localhost:3000' : `${window.location.hostname}:3000`;

				let url = '';
				if (scope === 'tournament') {
					url = `${wsProtocol}//${host}/tournament/${this.tournamentCfg.tournamentId}/ws?playerId=${this.tournamentCfg.playerId}`;
				} else {
					if (!this.matchCfg) return reject(new Error('Match config not set'));
					url = `${wsProtocol}//${host}/tournament/${this.matchCfg.tournamentId}/match/${this.matchCfg.matchId}/ws?playerId=${this.matchCfg.playerId}`;
				}

				const bucket = scope === 'tournament' ? this.tournamentWS : this.matchWS;
				bucket.intentionalClose = false;
				bucket.ws = new WebSocket(url);

				bucket.ws.onopen = () => {
					bucket.reconnectAttempts = 0;
					this.startHeartbeat(scope);
					this.tournamentCfg.onConnect?.(scope);
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

				bucket.ws.onclose = (ev) => {
					this.stopHeartbeat(scope);
					this.tournamentCfg.onDisconnect?.(scope);
					if (!bucket.intentionalClose && bucket.reconnectAttempts < this.maxReconnectAttempts) {
						bucket.reconnectAttempts++;
						const delay = this.baseReconnectDelay * bucket.reconnectAttempts;
						setTimeout(() => this.openChannel(scope).catch(() => {}), delay);
					}
				};

				bucket.ws.onerror = () => {
					this.tournamentCfg.onError?.(new Error('WebSocket error'), scope);
				};

				// Connection timeout (5s)
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

	private closeChannel(scope: 'tournament' | 'match'): void {
		const bucket = scope === 'tournament' ? this.tournamentWS : this.matchWS;
		bucket.intentionalClose = true;
		this.stopHeartbeat(scope);
		if (bucket.ws) {
			try { bucket.ws.close(1000, 'Client disconnect'); } catch {}
		}
		bucket.ws = null;
	}

	// ---------- Heartbeat ----------
	private startHeartbeat(scope: 'tournament' | 'match') {
		const bucket = scope === 'tournament' ? this.tournamentWS : this.matchWS;
		bucket.heartbeatInterval = window.setInterval(() => {
			if (bucket.ws && bucket.ws.readyState === WebSocket.OPEN) {
				this.send(scope, { type: 'ping', ts: Date.now() });
			}
		}, this.heartbeatMs);
	}

	private stopHeartbeat(scope: 'tournament' | 'match') {
		const bucket = scope === 'tournament' ? this.tournamentWS : this.matchWS;
		if (bucket.heartbeatInterval) {
			clearInterval(bucket.heartbeatInterval);
			bucket.heartbeatInterval = null;
		}
	}

	// ---------- Sending ----------
	private send(scope: 'tournament' | 'match', payload: any): void {
		const bucket = scope === 'tournament' ? this.tournamentWS : this.matchWS;
		if (!bucket.ws || bucket.ws.readyState !== WebSocket.OPEN) return;
		try { bucket.ws.send(JSON.stringify(payload)); } catch (e) { console.error('[tournamentWS] send error', e); }
	}

	// ---------- Message Routing ----------
	private handleMessage(scope: 'tournament' | 'match', message: any): void {
		switch (message?.type) {
			case 'connected':
				// Initial handshake acknowledged
				break;
			case 'pong':
				break;
			case 'countdown': {
				this.tournamentCfg.onCountdown?.();
				break;
			}
			case 'gameStart': {
				if (typeof message.gameId === 'number') this.tournamentCfg.onGameStart?.(message.gameId);
				break;
			}
			case 'gameEnd': {
				this.tournamentCfg.onGameEnd?.({
					winnerId: message.winner || message.winnerId,
					winnerSeat: message.winnerSeat,
					winnerName: message.winnerName,
					matchId: message.matchId || this.matchCfg?.matchId || ''
				});
				break;
			}
			case 'score': {
				const scores = {
					scorePlayer1: message.scorePlayer1,
					scorePlayer2: message.scorePlayer2,
					scorePlayer3: message.scorePlayer3,
					scorePlayer4: message.scorePlayer4
				};
				const matchId = message.matchId || this.matchCfg?.matchId || '';
				this.tournamentCfg.onScore?.(matchId, scores);
				break;
			}
			case 'playerJoined': {
				this.tournamentCfg.onPlayerJoined?.({
					playerId: message.playerId,
					scope,
					tournament: message.tournament,
					match: message.match,
				});
				break;
			}
			case 'playerDisconnected': {
				this.tournamentCfg.onPlayerDisconnected?.({ playerId: message.playerId, scope });
				break;
			}
			case 'tournamentState': {
				this.tournamentCfg.onTournamentState?.(message.tournament);
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
	if (globalTournamentWS) globalTournamentWS.disconnectAll();
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


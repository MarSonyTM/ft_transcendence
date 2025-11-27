import { WebSocketBase } from "./roomWebSocket";

interface TournamentWebSocketConfig {
    tournamentId: string;
    matchId: string;
    playerId: string;
    onConnect?: () => void;
    onDisconnect?: () => void;
    onTournamentState?: (tournament: any) => void;
    onMatchState?: (match: any) => void;
    onPlayerReady?: (playerId: string, isReady: boolean) => void;
    onPlayerDisconnected?: (playerId: string) => void;
    onTournamentStart?: (tournamentId: string) => void;
    onTournamentEnd?: (tournamentId: string) => void;
    onGameStart?: (matchId: string, gameId: number) => void;
    onGameState?: (state: any) => void;
    onCountdown?: () => void;
    onGameEnd?: (data: { matchId?: string; winnerId?: string, players?: any[] }) => void;
    onMatchEnd?: (data: { matchId?: string; winnerId?: string | null, p1?: any, p2?: any }) => void;
    onScore?: (scoreData: any) => void;
    onPlayerMove?: (playerId: number, position: number) => void;
    onError?: (error: Error) => void;
}

export class TournamentWebSocketManager {
    private tconfig: TournamentWebSocketConfig;
    private opt: WebSocketBase;

    constructor(tconfig: TournamentWebSocketConfig) {
            this.tconfig = tconfig;
            this.opt = new WebSocketBase;
        }

    connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                const wsHost = window.location.hostname === 'localhost' ? 'localhost:3000' : `${window.location.hostname}:3000`;
                const wsUrl = `${wsProtocol}//${wsHost}/api/tournament/${this.tconfig.tournamentId}/ws?playerId=${this.tconfig.playerId}`;
                console.log('Connecting to tournament WebSocket:', wsUrl);
                this.opt.ws = new WebSocket(wsUrl);

                this.opt.ws.onopen = () => {
                    console.log('WebSocket connected to tournament:', this.tconfig.tournamentId);
                    this.opt.reconnectAttempts = 0;
                    this.startHeartbeat();
                    if (this.tconfig.onConnect)
                        this.tconfig.onConnect();
                    resolve();
                };

                this.opt.ws.onmessage = (event) => {
                    try {
                        const message = JSON.parse(event.data);
                        this.handleMessage(message);
                    } catch (error) {
                        console.error('Error parsing WebSocket message:', error);
                    }
                };

                this.opt.ws.onclose = (event) => {
                    console.log('WebSocket disconnected:', event.code, event.reason);
                    this.stopHeartbeat();
                    if (this.tconfig.onDisconnect)
                        this.tconfig.onDisconnect();
                    if (!this.opt.isIntentionalClose && this.opt.reconnectAttempts < this.opt.maxReconnectAttempts) {
                        this.opt.reconnectAttempts++;
                        console.log(`Reconnecting... (attempt ${this.opt.reconnectAttempts}/${this.opt.maxReconnectAttempts})`);
                        setTimeout(() => {
                            this.connect().catch(console.error);
                        }, this.opt.reconnectDelay * this.opt.reconnectAttempts);
                    }
                };

                this.opt.ws.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    if (this.tconfig.onError)
                        this.tconfig.onError(new Error('WebSocket connection error'));
                    reject(error);
                };

                setTimeout(() => {
                    if (this.opt.ws && this.opt.ws.readyState !== WebSocket.OPEN) {
                        console.error('WebSocket connection timeout after 5 seconds');
                        if (this.opt.ws)
                            this.opt.ws.close();
                        reject(new Error('WebSocket connection timeout'));
                    }
                }, 5000);
            } catch (error) {
                console.error('Error creating WebSocket:', error);
                reject(error);
            }
        });
    }

    private handleMessage(message: any): void {
        switch (message.type) {
            case 'connected':
                console.log('Connected to tournament:', message.tournamentId);
                break;

            case 'pong':
                break;

            case 'countdown':
                if (this.tconfig.onCountdown)
                    this.tconfig.onCountdown();
                break;

            case 'gameState':
                if (this.tconfig.onGameState)
                this.tconfig.onGameState(message.state);
            break;

            case 'score':
                if (this.tconfig.onScore)
                    this.tconfig.onScore(message);
                break;

            case 'ballReset':
                if (this.tconfig.onGameState)
                    this.tconfig.onGameState(message.state || message);
                break;

            case 'playerMove':
                if (this.tconfig.onPlayerMove)
                    this.tconfig.onPlayerMove(message.playerId, message.position);
                break;

            case 'tournamentState':
                if (this.tconfig.onTournamentState)
                    this.tconfig.onTournamentState(message.tournament);
                break;
            
            case 'tournamentStart':
                if (this.tconfig.onTournamentStart)
                    this.tconfig.onTournamentStart(message.tournamentId);
                break;

            case 'tournamentEnd':
                if (this.tconfig.onTournamentEnd)
                    this.tconfig.onTournamentEnd(message.tournamentId);
                break;
            
            case 'matchState':
                if (this.tconfig.onMatchState)
                    this.tconfig.onMatchState(message.match);
                break;

            case 'gameStart':
                if (this.tconfig.onGameStart) {
                    const matchId = message.matchId || this.tconfig.matchId;
                    this.tconfig.onGameStart(matchId, message.gameId);
                }
                break;
            
            case 'gameEnd':
                if (this.tconfig.onGameEnd) {
                    const winnerId = message.winner || message.winnerId;
                    const matchId = message.matchId || this.tconfig.matchId;
                    this.tconfig.onGameEnd({ 
                        matchId: String(matchId), 
                        winnerId: String(winnerId),
                        players: message.players
                    });
                }
                break;
            
            case 'matchEnd':
                if (this.tconfig.onMatchEnd) {
                    const winnerId = message.winnerId != null ? String(message.winnerId) : null;
                    const matchId = String(message.matchId || this.tconfig.matchId || '');
                    const p1 = message.players[0] || null;
                    const p2 = message.players[1] || null;
                    this.tconfig.onMatchEnd({ matchId, winnerId, p1, p2 });
                }
                break;
            
            case 'playerDisconnected':
                if (this.tconfig.onPlayerDisconnected)
                    this.tconfig.onPlayerDisconnected(message.playerId);
                break;
            
            case 'playerReady':
                if (this.tconfig.onPlayerReady)
                    this.tconfig.onPlayerReady(message.playerId, message.isReady);
                break;

            case 'playerJoined':
                if (message.tournament && this.tconfig.onTournamentState)
                    this.tconfig.onTournamentState(message.tournament);
                break;

            default:
                console.log('Unknown message type:', message.type);
                break;
        }
    }

    requestState(): void {
        this.send({ type: 'requestState' });
    }

    requestMatchState(): void {
        this.send({ type: 'requestMatchState' });
    }

    sendReady(isReady: boolean): void {;
        this.send({ type: 'ready', isReady });
    }

    sendPlayerReady(playerId: number, isReady: boolean): void {
        console.debug('SEND PLAYER READY:', playerId, isReady);
        this.send({ type: 'playerReady', playerId, isReady });
    }

    sendMove(position: number): void {
        this.send({ type: 'move', position });
    }

    sendKeyState(key: string, pressed: boolean, isGuest: boolean = false): void {
        this.send({ type: 'keyState', key, pressed, isGuest });
    }

    private send(message: any): void {
    if (!this.opt.ws || this.opt.ws.readyState !== WebSocket.OPEN) {
        console.warn('Tournament ws not open, dropping message:', message);
        return;
    }
    try {
        this.opt.ws.send(JSON.stringify(message));
    } catch (error) {
        console.error('Error sending WebSocket message:', error);
    }
}

    private startHeartbeat(): void {
        this.opt.heartbeatInterval = window.setInterval(() => {
            if (this.opt.ws && this.opt.ws.readyState === WebSocket.OPEN)
                this.send({ type: 'ping', ts: Date.now() });
        }, 30000);
    }

    private stopHeartbeat(): void {
        if (this.opt.heartbeatInterval) {
            clearInterval(this.opt.heartbeatInterval);
            this.opt.heartbeatInterval = null;
        }
    }

    disconnect(): void {
        this.opt.isIntentionalClose = true;
        this.stopHeartbeat();
        if (this.opt.ws) {
            this.opt.ws.close(1000, 'Client disconnect');
            this.opt.ws = null;
        }
    }

    isConnected(): boolean {
        return this.opt.ws?.readyState === WebSocket.OPEN;
    }

    getState(): string {
        if (!this.opt.ws) return 'DISCONNECTED';
        switch (this.opt.ws.readyState) {
            case WebSocket.CONNECTING:
                return 'CONNECTING';
            case WebSocket.OPEN:
                return 'OPEN';
            case WebSocket.CLOSING:
                return 'CLOSING';
            case WebSocket.CLOSED:
                return 'CLOSED';
            default:
                return 'UNKNOWN';
        }
    }
}

let globalTws: TournamentWebSocketManager | null = null;

export function initTournamentWebSocket(tconfig: TournamentWebSocketConfig): TournamentWebSocketManager {
    if (globalTws)
        globalTws.disconnect();
    globalTws = new TournamentWebSocketManager(tconfig);
    return globalTws;
}

export function getTournamentWebSocket(): TournamentWebSocketManager | null {
    return globalTws;
}

export function disconnectTournamentWebSocket(): void {
    if (globalTws) {
        globalTws.disconnect();
        globalTws = null;
    }
}
interface TournamentWebSocketConfig {
    tournamentId: string;
    matchId: string;
    playerId: string;
    onConnect?: () => void;
    onDisconnect?: () => void;
    onTournamentState?: (tournament: any) => void;
    onMatchState?: (match: any) => void;
    onPlayerDisconnected?: (playerId: string) => void;
    onTournamentStart?: (tournamentId: string) => void;
    onTournamentEnd?: (tournamentId: string) => void;
    onGameStart?: (matchId: string, gameId: number) => void;
    onGameEnd?: (data: { matchId: string; winnerId: string }) => void;
    onMatchEnd?: (data: { matchId: string; winnerId: string | null }) => void;
    onError?: (error: Error) => void;
}

export class TournamentWebSocketManager {
    private ws: WebSocket | null = null;
    private tconfig: TournamentWebSocketConfig;
    private reconnectAttempts: number = 0;
    private maxReconnectAttempts: number = 5;
    private reconnectDelay: number = 2000;
    private heartbeatInterval: number | null = null;
    private isIntentionalClose: boolean = false;

    constructor(tconfig: TournamentWebSocketConfig) {
        this.tconfig = tconfig;
    }

    connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                const wsHost = window.location.hostname === 'localhost' ? 'localhost:3000' : `${window.location.hostname}:3000`;
                const wsUrl = `${wsProtocol}//${wsHost}/api/tournament/${this.tconfig.tournamentId}/ws?playerId=${this.tconfig.playerId}`;
                console.log('Connecting to tournament WebSocket:', wsUrl);
                this.ws = new WebSocket(wsUrl);

                this.ws.onopen = () => {
                    console.log('WebSocket connected to tournament:', this.tconfig.tournamentId);
                    this.reconnectAttempts = 0;
                    this.startHeartbeat();
                    if (this.tconfig.onConnect)
                        this.tconfig.onConnect();
                    resolve();
                };

                this.ws.onmessage = (event) => {
                    try {
                        const message = JSON.parse(event.data);
                        this.handleMessage(message);
                    } catch (error) {
                        console.error('Error parsing WebSocket message:', error);
                    }
                };

                this.ws.onclose = (event) => {
                    console.log('WebSocket disconnected:', event.code, event.reason);
                    this.stopHeartbeat();
                    if (this.tconfig.onDisconnect)
                        this.tconfig.onDisconnect();
                    if (!this.isIntentionalClose && this.reconnectAttempts < this.maxReconnectAttempts) {
                        this.reconnectAttempts++;
                        console.log(`Reconnecting... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
                        setTimeout(() => {
                            this.connect().catch(console.error);
                        }, this.reconnectDelay * this.reconnectAttempts);
                    }
                };

                this.ws.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    if (this.tconfig.onError)
                        this.tconfig.onError(new Error('WebSocket connection error'));
                    reject(error);
                };

                setTimeout(() => {
                    if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
                        console.error('WebSocket connection timeout after 5 seconds');
                        if (this.ws)
                            this.ws.close();
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
                        winnerId: String(winnerId) 
                    });
                }
                break;
            
            case 'matchEnd':
                if (this.tconfig.onMatchEnd) {
                    const winnerId = message.winnerId != null ? String(message.winnerId) : null;
                    const matchId = String(message.matchId || this.tconfig.matchId || '');
                    this.tconfig.onMatchEnd({ matchId, winnerId });
                }
                break;
            
            case 'playerDisconnected':
                if (this.tconfig.onPlayerDisconnected)
                    this.tconfig.onPlayerDisconnected(message.playerId);
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

    sendReady(isReady: boolean): void {
        this.send({ type: 'ready', isReady });
    }

    sendMove(position: number): void {
        this.send({ type: 'move', position });
    }

    sendKeyState(key: string, pressed: boolean): void {
        this.send({ type: 'keyState', key, pressed });
    }

    private send(message: any): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        console.warn('Tournament WS not open, dropping message:', message);
        return;
    }
    try {
        this.ws.send(JSON.stringify(message));
    } catch (error) {
        console.error('Error sending WebSocket message:', error);
    }
}

    private startHeartbeat(): void {
        this.heartbeatInterval = window.setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN)
                this.send({ type: 'ping', ts: Date.now() });
        }, 30000);
    }

    private stopHeartbeat(): void {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    disconnect(): void {
        this.isIntentionalClose = true;
        this.stopHeartbeat();
        if (this.ws) {
            this.ws.close(1000, 'Client disconnect');
            this.ws = null;
        }
    }

    isConnected(): boolean {
        return this.ws?.readyState === WebSocket.OPEN;
    }

    getState(): string {
        if (!this.ws) return 'DISCONNECTED';
        switch (this.ws.readyState) {
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

let globalTWS: TournamentWebSocketManager | null = null;

export function initTournamentWebSocket(tconfig: TournamentWebSocketConfig): TournamentWebSocketManager {
    if (globalTWS)
        globalTWS.disconnect();
    globalTWS = new TournamentWebSocketManager(tconfig);
    return globalTWS;
}

export function getTournamentWebSocket(): TournamentWebSocketManager | null {
    return globalTWS;
}

export function disconnectTournamentWebSocket(): void {
    if (globalTWS) {
        globalTWS.disconnect();
        globalTWS = null;
    }
}
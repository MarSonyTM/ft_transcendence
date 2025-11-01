import { GameRoom } from '../../../shared/gameTypes';

interface RoomWebSocketConfig {
  roomId: string;
  playerId: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onRoomState?: (room: GameRoom) => void;
  onGameState?: (state: any) => void;
  onPlayerMove?: (playerId: string, position: number) => void;
  onPlayerReady?: (playerId: string, isReady: boolean) => void;
  onPlayerDisconnected?: (playerId: string) => void;
  onScore?: (scores: any) => void;
  onGameStart?: (gameId: number) => void;
  onCountdown?: () => void;
  onGameEnd?: (data: { winnerId: string; winnerSeat?: string; winnerName?: string; players?: any[] }) => void;
  onChat?: (message: any) => void;
  onError?: (error: Error) => void;
}

export class RoomWebSocketManager {
  private ws: WebSocket | null = null;
  private config: RoomWebSocketConfig;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 2000;
  private heartbeatInterval: number | null = null;
  private isIntentionalClose = false;

  constructor(config: RoomWebSocketConfig) {
    this.config = config;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsHost = window.location.hostname === 'localhost' ? 'localhost:3000' : 
                       `${window.location.hostname}:3000`;
        const wsUrl = `${wsProtocol}//${wsHost}/room/${this.config.roomId}/ws?playerId=${this.config.playerId}`;
        
        console.log('🔌 Connecting to:', wsUrl);
        
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          console.log('✅ WebSocket connected to room:', this.config.roomId);
          this.reconnectAttempts = 0;
          this.startHeartbeat();
          
          if (this.config.onConnect) {
            this.config.onConnect();
          }
          
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
          console.log('🔌 WebSocket disconnected:', event.code, event.reason);
          this.stopHeartbeat();
          
          if (this.config.onDisconnect) {
            this.config.onDisconnect();
          }

          // Attempt reconnection if not intentional
          if (!this.isIntentionalClose && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`🔄 Reconnecting... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            
            setTimeout(() => {
              this.connect().catch(console.error);
            }, this.reconnectDelay * this.reconnectAttempts);
          }
        };

        this.ws.onerror = (error) => {
          console.error('❌ WebSocket error:', error);
          
          if (this.config.onError) {
            this.config.onError(new Error('WebSocket connection error'));
          }
          
          reject(error);
        };

        // Connection timeout - reduced to 5 seconds
        setTimeout(() => {
          if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
            console.error('WebSocket connection timeout after 5 seconds');
            if (this.ws) {
              this.ws.close();
            }
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
        console.log('✅ Connected to room:', message.roomId);
        break;

      case 'pong':
        // Heartbeat response
        break;

      case 'countdown':
        if (this.config.onCountdown) {
          this.config.onCountdown();
        }
        break;

      case 'roomState':
        if (this.config.onRoomState) {
          this.config.onRoomState(message.room);
        }
        break;

      case 'gameState':
        if (this.config.onGameState) {
          this.config.onGameState(message.state);
        }
        break;

      case 'playerMove':
        if (this.config.onPlayerMove) {
          this.config.onPlayerMove(message.playerId, message.position);
        }
        break;

      case 'playerReady':
        if (this.config.onPlayerReady) {
          this.config.onPlayerReady(message.playerId, message.isReady);
        }
        break;

      case 'playerDisconnected':
        if (this.config.onPlayerDisconnected) {
          this.config.onPlayerDisconnected(message.playerId);
        }
        break;

      case 'playerJoined':
        if (message.room && this.config.onRoomState) {
          this.config.onRoomState(message.room);
        }
        break;

      case 'score':
        if (this.config.onScore) {
          this.config.onScore({
            scorePlayer1: message.scorePlayer1,
            scorePlayer2: message.scorePlayer2,
            scorePlayer3: message.scorePlayer3,
            scorePlayer4: message.scorePlayer4
          });
        }
        break;

      case 'gameEnd':
        if (this.config.onGameEnd) {
          this.config.onGameEnd({
            winnerId: message.winner || message.winnerId,
            winnerSeat: message.winnerSeat,
            winnerName: message.winnerName,
            players: message.players
          });
        }
        break;

      case 'gameStart':
        if (this.config.onGameStart) {
          this.config.onGameStart(message.gameId);
        }
        break;

      case 'chat':
        if (this.config.onChat) {
          this.config.onChat({
            playerId: message.playerId,
            username: message.username,
            message: message.message,
            timestamp: message.timestamp
          });
        }
        break;

      default:
        console.log('⚠️ Unknown message type:', message.type);
    }
  }

  // Send player movement
  sendMove(position: number, isGuest: boolean = false): void {
    this.send({
      type: 'move',
      playerId: this.config.playerId,
      position,
      isGuest,  // Add this flag
    });
  }

  // Send ready status
  sendReady(isReady: boolean): void {
    this.send({
      type: 'ready',
      isReady,
    });
  }

  // Send chat message
  sendChat(username: string, text: string): void {
    this.send({
      type: 'chat',
      username,
      text,
    });
  }

  // Request current state
  requestState(): void {
    this.send({
      type: 'requestState',
    });
  }

  sendKeyState(key: string, pressed: boolean, isGuest: boolean = false): void {
    this.send({
      type: 'keyState',
      key,
      pressed,
      isGuest,
    });
  }
  // Generic send method
  private send(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message));
      } catch (error) {
        console.error('Error sending WebSocket message:', error);
      }
    } else {
      console.warn('WebSocket not connected, cannot send:', message.type);
    }
  }

  // Start heartbeat to keep connection alive
  private startHeartbeat(): void {
    this.heartbeatInterval = window.setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping', timestamp: Date.now() });
      }
    }, 30000); // Every 30 seconds
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  // Close connection
  disconnect(): void {
    this.isIntentionalClose = true;
    this.stopHeartbeat();
    
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
  }

  // Check if connected
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  // Get connection state
  getState(): string {
    if (!this.ws) return 'DISCONNECTED';
    
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING: return 'CONNECTING';
      case WebSocket.OPEN: return 'OPEN';
      case WebSocket.CLOSING: return 'CLOSING';
      case WebSocket.CLOSED: return 'CLOSED';
      default: return 'UNKNOWN';
    }
  }
}

// Singleton instance for easy access
let globalRoomWS: RoomWebSocketManager | null = null;

export function initRoomWebSocket(config: RoomWebSocketConfig): RoomWebSocketManager {
  if (globalRoomWS) {
    globalRoomWS.disconnect();
  }
  
  globalRoomWS = new RoomWebSocketManager(config);
  return globalRoomWS;
}

export function getRoomWebSocket(): RoomWebSocketManager | null {
  return globalRoomWS;
}

export function disconnectRoomWebSocket(): void {
  if (globalRoomWS) {
    globalRoomWS.disconnect();
    globalRoomWS = null;
  }
}


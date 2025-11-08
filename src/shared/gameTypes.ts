export interface Player {
  id: number;
  name: string;
  gameId?: number;
  pos: number;
  score: number;
  connectionStatus?: string;
  lastActivity?: string;
}

// Core game state structure
export interface GameState {
  id?: number;
  gameId?: number;
  players: any[];//Player[];
  ballPosX: number;
  ballPosY: number;
  ballVelX?: number;
  ballVelY?: number;
  mode: '2P' | '4P' | string;
  lastContact: number;
  lastActivity?: string;
}

// WebSocket message structure
export interface WebSocketMessage {
  type: string;
  gameId?: number;
  state?: GameState;//state?: any;//
  message?: string | null;
  winner?: number;
  winnerName?: string | null;
  winnerSeat?: string;
  winnerUiNumber?: number;
  mode?: string;
  players?: Player[];//players?: any[];//
  finalScores?: Array<{
    playerId: number;
    score: number;
  }>;
}
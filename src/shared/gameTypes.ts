export interface RGBColor {
  r: number;
  g: number;
  b: number;
}

// Core player data structure
export interface Player {
  id: number;
  name?: string; // Optional player name
  gameId?: number;
  pos: number; // Paddle position
  score: number;
  connectionStatus?: string;
  lastActivity?: string;
}

// Core game state structure
export interface GameState {
  gameId?: number;
  players: Player[];
  ballPosX: number;
  ballPosY: number;
  ballVelX?: number;
  ballVelY?: number;
  mode: '2P' | '4P' | string;
  lastContact?: number;
}

// WebSocket message structure
export interface WebSocketMessage {
  type: string;
  gameId?: number;
  state?: GameState;
  message?: string | null;
  winner?: number;
  winnerName?: string | null;
  winnerSeat?: string;
  winnerUiNumber?: number;
  mode?: string;
  players?: Player[];
}

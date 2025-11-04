//CORE USER
export interface CoreUser {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
  avatar: string | undefined;
}

//CORE PLAYER
export interface CorePlayer {
  id: number;
  playerId: string;
  alias: string;
  avatar: string | undefined;
  gameId?: number;
  user: CoreUser | undefined;
  pos: number;
  score: number;
  isReady: boolean;
  isAI: boolean;
  difficulty?: string;
  isLocal: boolean;
  socketId?: string;
  connectionStatus: string;
  lastActivity: string;
}

//CORE GAMEROOM
export interface GameRoom {
  roomId: string;
  hostId: string;
  players: CorePlayer[];
  maxPlayers: number;
  status: 'waiting' | 'playing' | 'finished';
  gameId?: number;
  createdAt: Date;
}

//CORE GAMESTATE
export interface CoreGameState {
  id: number;
  gameId: number;
  players: CorePlayer[];
  ballPosX: number;
  ballPosY: number;
  ballVelX?: number;
  ballVelY?: number;
  mode: string;
  lastContact: number;
  lastActivity: string;
}

// WebSocket message structure
export interface WebSocketMessage {
  type: string;
  gameId?: number;
  state?: CoreGameState;
  message?: string | null;
  winner?: number;
  winnerName?: string | null;
  winnerSeat?: string;
  winnerUiNumber?: number;
  mode?: string;
  players?: CorePlayer[];
  finalScores?: Array<{
    playerId: number;
    score: number;
  }>;
}

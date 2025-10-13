export interface GameState {
    ballPosX: number;
    ballPosY: number;
    player1Pos: number;
    player2Pos: number;
    player3Pos: number;
    player4Pos: number;
    scorePlayer1: number;
    scorePlayer2: number;
    scorePlayer3: number;
    scorePlayer4: number;
    gameMode: string;
    mode?: string;
    playerPositions?: number[];
    scores?: number[];
    lastContact?: number;
}

export interface WebSocketMessage {
    type: string;
    gameId?: number;
    playerId?: number;
    state?: GameState;
    scorePlayer1?: number;
    scorePlayer2?: number;
    scorePlayer3?: number;
    scorePlayer4?: number;
    message?: string;
    winner?: number;
    winnerName?: string;
    mode?: string;
    scores?: number[];
    playerPositions?: number[];
    finalScores?: number[];
}

export type AppPage = 'landing' | 'login' | 'game' | 'gameSelect' | 'profile' | 
  'lobby' | 'authCallback' | 'register' | 'join' | 'friends';

declare global {
  interface Window {
    __INITIAL_STATE__?: {
      gameState: any;
      gameId: number | null;
      currentUser: string;
      currentPage: string;
      timestamp: number;
      apiEndpoint: string;
      wsEndpoint: string;
      environment: string;
    };
    __GAME_STATE__?: any;
    __GAME_ID__?: number | null;
    __USERNAME__?: string;
    __CURRENT_PAGE__?: string;
    game?: any;
  }
}
import { Color3 } from "@babylonjs/core";
import { Player as SharedPlayer, GameState as SharedGameState, WebSocketMessage as SharedWebSocketMessage } from "../../../shared/gameTypes";

// Frontend-specific extensions to shared types
export interface Player extends SharedPlayer {
    color?: Color3;
}

export interface GameState extends SharedGameState {
    players: Player[];
}

export interface WebSocketMessage extends SharedWebSocketMessage {
    state?: GameState;
    players?: Player[];
}

export type AppPage = 'landing' | 'login' | 'game' | 'gameSelect' | 'profile' | 
    'lobby' | 'authCallback' | 'register' | 'join' | 'friends' | '2PGame' | '4PGame' | 
    'tempLogin' | 'editProfile' | 'changeUsername' | 'changeEmail' | 'verifyEmail' | 'leaderboard' | 'pingPong';

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

import { Player, GameState as SharedGameState, WebSocketMessage as SharedWebSocketMessage } from "../../../shared/gameTypes";
import { GameRoom } from "../utils/roomState";

export type AppPage = 
    'landing' | 'login' | 'register' | 'gameSelect' | 'tempLogin' | 'leaderboard' | 'friends' |
    'profile' | 'editProfile' | 'changeUsername' | 'changeEmail' | 'verifyEmail' | 'authCallback' |
    'game' | 'lobby' | 'join' | '2PGame' | '4PGame' | 'tournament';

export function getApiEndpoint(): string {
	return (window.__INITIAL_STATE__?.apiEndpoint || '').replace(/\/$/, '');
}

/* TOURNAMENT TYPES */
export type TournamentStatus = 'setup' | 'active' | 'completed' | 'archived';
export const TSmap: Map<TournamentStatus, string> = new Map<TournamentStatus, string>([
	['setup', '⚙️'],
	['active', '🎮'],
	['completed', '🏁'],
    ['archived', '📦']
]);

export type MatchStatus = 'setup' | 'pending' | 'ready' | 'active' | 'completed';
export const MSmap: Map<MatchStatus, string> = new Map<MatchStatus, string>([
	['setup', '⚙️'],
	['pending', '⏳'],
	['ready', '✔️'],
	['active', '🎮'],
	['completed', '🏁']
]);

export type TPT = 'host' | 'ai' | 'local' | 'remote';
export const TPTmap: Map<TPT, string> = new Map<TPT, string>([
	['host', '👾'],
	['ai', '🤖'],
	['local', '🕹️'],
	['remote', '🌐']
]);

export interface TournamentPlayer {
    id?: number;
    tournamentId: number;
    tpt: TPT;
    name?: string;
    user?: any;
    isReady?: boolean;
    score?: number;
    eliminated: boolean;
    createdAt?: string;
    updatedAt?: string;
}

export interface TournamentMatch {
    id?: number;
    tournamentId: number;
    roomId?: string;
    room: GameRoom;
    gameId?: number;
    status: MatchStatus;
    isBye?: boolean;
    p1?: TournamentPlayer;
    p2?: TournamentPlayer;
    winnerId: number | null;
    round: number;
    roundIdx: number;
    createdAt?: string;
    startedAt?: string;
    endedAt?: string;
}

export interface Tournament {
    id?: number;
    status: TournamentStatus;
    players: Array<TournamentPlayer>;
    allMatches: Array<TournamentMatch>;
    curM: TournamentMatch | null;
    matchQueue?: Array<number>;
    championId: number | null;
    round?: number;
    createdAt?: string;
    startedAt?: string;
    endedAt?: string;
}

export interface GameState extends SharedGameState {
  players: Player[];
}

export interface WebSocketMessage extends SharedWebSocketMessage {
  state?: GameState;
  players?: Player[];
}

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

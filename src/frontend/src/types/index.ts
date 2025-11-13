export type AppPage = 
    'landing' | 'login' | 'register' | 'gameSelect' | 'tempLogin' | 'leaderboard' | 'friends' |
    'profile' | 'editProfile' | 'changeUsername' | 'changeEmail' | 'verifyEmail' | 'authCallback' |
    'game' | 'lobby' | 'join' | '2PGame' | '4PGame' | 'tournament';

/* TOURNAMENT TYPES */
export type TournamentStatus = 'setup' | 'active' | 'completed';
export const TSmap: Map<TournamentStatus, string> = new Map<TournamentStatus, string>([
	['setup', '⚙️'],
	['active', '🎮'],
	['completed', '🏁']
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
    playerId: string;
    tournamentId: string;
    tpt: TPT;
    identity: string;
    name?: string;
    avatar?: string;
    isReady?: boolean;
    pos?: number;
    score?: number;
    eliminated: boolean;
    byeRounds?: number[]; // TODO delete maybe
}

export interface TournamentMatch {
    matchRoomId: string;
    tournamentId: string;
    gameId?: number;
    status: MatchStatus;
    playerId1: string;
    playerId2: string;
    winner: string | null;
    round: number;
    roundIdx: number;
}

export interface Tournament {
    tournamentId: string;
    status: TournamentStatus;
    players: TournamentPlayer[];
    allMatches: TournamentMatch[];
    currentMatch: TournamentMatch | null;
    championId: string | null;
    bracketRound?: number; // current round number
    matchQueueIds?: string[]; // remaining matchRoomIds for current round (LIFO pop)
}

export interface TournamentArchiveEntry {
	tournamentId: string;
	status: TournamentStatus;
	players: TournamentPlayer[];
	matches: TournamentMatch[];
	championId: string | null;
	createdAt: string;
	startedAt?: string;
	finishedAt?: string;
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
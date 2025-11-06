export type AppPage = 'landing' | 'login' | 'game' | 'gameSelect' | 'profile' | 
    'lobby' | 'tlobby' | 'authCallback' | 'register' | 'join' | 'friends' | '2PGame' | '4PGame' | 
    'tempLogin' | 'editProfile' | 'changeUsername' | 'changeEmail' | 'verifyEmail' | 'tournament' | 'leaderboard';

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
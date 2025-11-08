export type TStatus = 'setup' | 'idle' | 'in_progress' | 'paused' | 'completed';
export type MatchStatus = 'pending' | 'ready' | 'countdown' | 'in_progress' | 'completed';
export type TPT = 'host' | 'ai' | 'local' | 'remote' | '__BYE__';//TournamentPlayerType

export interface User {
	id: number | undefined;
	username: string | undefined;
	avatar?: string;
	email?: string;
	gamesWon: number | undefined;
	gamesLost: number | undefined;
}

export interface TournamentPlayer {
	id: number;//tournament internal player-id
	name?: string;
	tId: number;
	identity?: string;//has prefix (ai, local, remote, host)
	user?: User;
	tpt: TPT;
	isReady?: boolean;
	pos?: number;
	score?: number;
	eliminated?: boolean;
	wins?: number;
	losses?: number;
	connectionStatus?: string;
	lastActivity?: string;
}

export interface TournamentMatch {
	matchId: number;
	tId: number;
	roomId: string;
	status: MatchStatus;
	gameId?: number;
	p1?: TournamentPlayer;
	p2?: TournamentPlayer;
	winner?: TournamentPlayer;
	loser?: TournamentPlayer;
	createdAt: string;
	startedAt: string;
  	finishedAt: string;
	round?: number;
	indexInRound?: number;
	nextMatchId?: number;
	nextSlot?: 'p1' | 'p2';
}

export interface TournamentNextMatch {
	order: number;
	p1?: TournamentPlayer;
	p2?: TournamentPlayer;
}

export interface Tournament {
	tId: number;
	status: TStatus;
	players: TournamentPlayer[] | [];
	queue?: number[];
	matches?: TournamentMatch[];
	curMatch?: TournamentMatch;
	nextMatches?: TournamentNextMatch[];
	matchHistory?: MatchSummary[];
	createdAt: string;
	startedAt: string;
	finishedAt: string;
	updatedAt: string;
	champion?: TournamentPlayer;
	matchDelay?: number;
}

export interface MatchSummary {
	matchId: number;
	p1: TournamentPlayer;
	p2: TournamentPlayer;
	winner?: TournamentPlayer;
	loser?: TournamentPlayer;
	createdAt: string;
	startedAt: string;
  	finishedAt: string;
}

export interface TournamentArchive {
	tId: number;
	createdAt: string;
	startedAt: string;
	finishedAt: string;
	players: TournamentPlayer[];
	matches: MatchSummary[];
	champion: TournamentPlayer;
}

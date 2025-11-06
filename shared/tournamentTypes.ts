import { GameState } from "./gameTypes";

export type TStatus = 'setup' | 'idle' | 'in_progress' | 'paused' | 'completed';
export type MatchStatus = 'pending' | 'ready' | 'countdown' | 'in_progress' | 'completed' | 'disputed';
export type TFormat = 'single_elimination' | 'double_elimination' | 'round_robin';//TODO: implement or delete

export interface User {
	id: number;
	username: string;
	avatar?: string;
	email?: string;
	gamesWon: number;
	gamesLost: number;
}

export interface TournamentPlayer {
	id: number;
	name?: string;
	gameId?: number;
	tournamentId?: number;
	identity?: string;
	user?: User;
	isAI?: boolean;
	isLocalGuest?: boolean;
	isRemote?: boolean;
	isHost?: boolean;
	isReady?: boolean;
	pos?: number;
	score?: number;
	eliminated?: boolean;
	wins?: number;
	losses?: number;
	totalScore?: number;
	averageScore?: number;
	championTimes?: number;//TODO:MERGE use?
	connectionStatus?: string;
	lastActivity?: string;
}

export interface TournamentMatch {
	matchId: number;
	tournamentId: number;
	gameId?: number;
	roomId?: string;
	status: MatchStatus;
	p1?: TournamentPlayer;
	p2?: TournamentPlayer;
	winner?: TournamentPlayer;
	loser?: TournamentPlayer;
	createdAt: string;
	startedAt: string;
  	finishedAt: string;
	disputeReason?: string;
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
	tournamentId: number;
	status: TStatus;
	format: TFormat;
	gameStates?: GameState[];
	players: TournamentPlayer[];
	queue?: number[];
	matches?: TournamentMatch[];
	currentMatch?: TournamentMatch;
	nextMatches?: TournamentNextMatch[];
	matchHistory?: MatchSummary[];
	createdAt: string;
	startedAt: string;
	finishedAt: string;
	updatedAt: string;
	champion?: TournamentPlayer;
	matchDelay: number;
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
	disputeReason?: string;
}

export interface TournamentArchive {
	tournamentId: number;
	createdAt: string;
	startedAt: string;
	finishedAt: string;
	players: TournamentPlayer[];
	matches: MatchSummary[];
	champion: TournamentPlayer;
}

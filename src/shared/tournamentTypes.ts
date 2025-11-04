import { CorePlayer, CoreGameState as GameState } from "./gameTypes";

export type TStatus = 'setup' | 'idle' | 'in_progress' | 'paused' | 'completed';
export type MatchStatus = 'pending' | 'ready' | 'countdown' | 'in_progress' | 'completed' | 'disputed';
export type TFormat = 'single_elimination' | 'double_elimination' | 'round_robin';//TODO: implement or delete

export interface TournamentPlayer extends CorePlayer {
	tournamentId: number;
	eliminated: boolean;
	wins: number;
	losses: number;
	totalScore: number;
	averageScore: number;
	isRemote: boolean;
}

export interface TournamentMatch {
	matchId: number;
	tournamentId: number;
	gameId?: number;
	roomId?: string;
	status: MatchStatus;
	p1: TournamentPlayer | undefined;
	p2: TournamentPlayer | undefined;
	winner: TournamentPlayer | undefined;
	loser: TournamentPlayer | undefined;
	createdAt: string;
	startedAt?: string;
  	finishedAt?: string;
	disputeReason?: string;
	round?: number;
	indexInRound?: number;
	nextMatchId?: number;
	nextSlot?: 'p1' | 'p2';
}

export interface TournamentNextMatch {
	order: number;
	p1: TournamentPlayer | undefined;
	p2: TournamentPlayer | undefined;
}

export interface Tournament {
	tournamentId: number;
	status: TStatus;
	format: TFormat;
	gameStates: GameState[] | undefined;
	players: TournamentPlayer[];
	queue: number[];
	matches: TournamentMatch[];
	currentMatch: TournamentMatch | undefined;
	nextMatches: TournamentNextMatch[] | undefined;
	matchHistory: TournamentMatch[];
	createdAt: string;
	updatedAt: string;
	champion: TournamentPlayer | undefined;
	matchDelay: number;
}

export interface TournamentArchive {
	tournamentId: number;
	createdAt: string;
	players: TournamentPlayer[];
	matches: { id: number; p1: TournamentPlayer; p2: TournamentPlayer; winner?: TournamentPlayer }[];
	champion: TournamentPlayer;
}

// Serialized / API facing types
// export interface SerializedPlayer {
// 	id: number;
// 	alias: string;
// 	userId?: number;
// 	eliminated: boolean;
// 	wins: number;
// 	losses: number;
// 	totalScore: number;
// 	averageScore: number;
// 	isReady: boolean;
// 	isAI: boolean;
// 	isLocal: boolean;
// }

// export interface SerializedMatchHistoryItem {
// 	matchId: number;
// 	player1: string;
// 	player2: string;
// 	winner: string;
// 	loser: string;
// 	player1Score?: number;
// 	player2Score?: number;
// 	status: MatchStatus;
// 	gameId?: number;
// 	startedAt?: string;
// 	finishedAt?: string;
// 	disputeReason?: string;
// }

// export interface SerializedMatch {
// 	matchId: number;
// 	player1: SerializedPlayer | null;
// 	player2: SerializedPlayer | null;
// 	gameId?: number;
// 	roomId?: string;
// 	status: MatchStatus;
// 	player1Ready: boolean;
// 	player2Ready: boolean;
// 	startedAt?: string;
// }

// export interface SerializedNextMatchPreview {
// 	order: number;
// 	player1: string;
// 	player2?: string | null;
// }

// export interface SerializedTournamentState {
// 	id: number;
// 	status: TStatus;
// 	createdAt: string;
// 	updatedAt: string;
// 	players: SerializedPlayer[];
// 	currentMatch: SerializedMatch | null;
// 	queue: string[];
// 	nextMatches: SerializedNextMatchPreview[];
// 	matchHistory: SerializedMatchHistoryItem[];
// 	championId?: number;
// 	championAlias?: string | null;
// 	format: TFormat;
// 	matchDelay: number;
// 	allowSpectators: boolean;
// }

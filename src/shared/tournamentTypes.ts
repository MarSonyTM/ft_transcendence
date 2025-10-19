import { GameState, Player } from "../backend/src/database";

export type TournamentStatus = 'idle' | 'in_progress' | 'completed';

// Domain types (backend internal state)
export interface TournamentPlayer {
	id: number;
	alias: string;
	eliminated: boolean;
	wins: number;
	losses: number;
	profile: Player;//TODO: use this!
}

export interface TournamentMatchRecord {
	id: number;
	player1Id: number;
	player2Id: number;
	winnerId?: number;
	loserId?: number;
	finishedAt?: string;
}

export interface TournamentMatchInternal {
	matchId: number;
	player1Id: number;
	player2Id: number;
	startedAt: string;
}

export interface TournamentState {
	id: number;
	status: TournamentStatus;
	gameStates: GameState[];//TODO: maybe good to have for live tracking?
	createdAt: string;
	updatedAt: string;
	players: TournamentPlayer[];
	queue: number[];
	currentMatch: TournamentMatchInternal | null;
	matchHistory: TournamentMatchRecord[];
	championId?: number;
}

// Serialized / API facing types
export interface SerializedPlayer {
	id: number;
	alias: string;
	eliminated: boolean;
	wins: number;
	losses: number;
}

export interface SerializedMatchHistoryItem {
	matchId: number;
	player1: string;
	player2: string;
	winner: string;
	loser: string;
	finishedAt?: string;
}

export interface SerializedMatch {
	matchId: number;
	player1: SerializedPlayer | null;
	player2: SerializedPlayer | null;
	startedAt: string;
}

export interface SerializedNextMatchPreview {
	order: number;
	player1: string;
	player2?: string | null;
}

export interface SerializedTournamentState {
	id: number;
	status: TournamentStatus;
	createdAt: string;
	updatedAt: string;
	players: SerializedPlayer[];
	currentMatch: SerializedMatch | null;
	queue: string[];
	nextMatches: SerializedNextMatchPreview[];
	matchHistory: SerializedMatchHistoryItem[];
	championId?: number;
	championAlias?: string | null;
}

export interface TournamentSummary {
	id: number;
	status: TournamentStatus;
	championId?: number;
	championAlias?: string | null;
	createdAt: string;
	updatedAt: string;
	players: number;
	matches: number;
}

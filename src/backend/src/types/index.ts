import { GameRoom } from "../game/gameRoom";
import { GameState } from '../database/index';

export type TPT = 'host' | 'ai' | 'local' | 'remote';

export type MatchStatus = 'setup' | 'pending' | 'ready' | 'active' | 'completed';

export type TournamentStatus = 'setup' | 'active' | 'completed' | 'archived' | 'suspended';

export interface Tournament {
	id: number;
	hostId?: number;
	status: TournamentStatus;
	players: TournamentPlayer[];
	allMatches: TournamentMatch[];
	matchQueue: Array<TournamentMatch>;
	curM: TournamentMatch | null;
	round: number;
	championId: number | null;
	createdAt?: string;
	startedAt?: string | null;
	endedAt?: string | null;
}

export interface TournamentMatch {
	id: number;
	tournamentId: number;
	gameId?: number;
	room?: GameRoom | null;
	gameState?: GameState;
	status: MatchStatus;
	isBye: boolean;
	p1?: TournamentPlayer;
	p2?: TournamentPlayer;
	winnerId: number | null;
	round: number;
	roundIdx: number;
	createdAt?: string;
	startedAt?: string | null;
	endedAt?: string | null;
}

export interface TournamentPlayer {
	id: number;
	tournamentId: number;
	tpt: TPT;
	name?: string;
	userId?: number | null;
	isReady: boolean;
	score?: number;
	eliminated: boolean;
	socketId?: string;
	createdAt?: string;
	updatedAt?: string;
}

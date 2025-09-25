export type TournamentStatus = 'idle' | 'in_progress' | 'completed';

export interface TournamentPlayer {
  id: number;
  alias: string;
  eliminated: boolean;
  wins: number;
  losses: number;
}

export interface TournamentMatchRecord {
  id: number;
  player1Id: number;
  player2Id: number;
  winnerId?: number;
  loserId?: number;
  finishedAt?: string;
}

export interface TournamentMatch {
  matchId: number;
  player1Id: number;
  player2Id: number;
  startedAt: string;
}

export interface TournamentState {
  id: number;
  status: TournamentStatus;
  createdAt: string;
  updatedAt: string;
  players: TournamentPlayer[];
  queue: number[];
  currentMatch: TournamentMatch | null;
  matchHistory: TournamentMatchRecord[];
  championId?: number;
}

function nowISO(): string {
  return new Date().toISOString();
}

class TournamentManager {
  private tournaments: TournamentState[] = [];
  private activeId: number | null = null;
  private nextTournamentId = 1;
  private nextPlayerIdGlobal = 1;
  private nextMatchIdGlobal = 1;

  // ===== Public =====
  list(): TournamentState[] {
    return this.tournaments.map(t => this.cloneState(t));
  }

  getActive(): TournamentState | null {
    if (this.activeId == null) return null;
    const t = this.tournaments.find(x => x.id === this.activeId) || null;
    return t ? this.cloneState(t) : null;
  }

  getById(id: number): TournamentState | null {
    const t = this.tournaments.find(x => x.id === id);
    return t ? this.cloneState(t) : null;
  }

  newTournament(): TournamentState {
    const createdAt = nowISO();
    const t: TournamentState = {
      id: this.nextTournamentId++,
      status: 'idle',
      createdAt,
      updatedAt: createdAt,
      players: [],
      queue: [],
      currentMatch: null,
      matchHistory: [],
      championId: undefined
    };
    this.tournaments.push(t);
    this.activeId = t.id;
    return this.cloneState(t);
  }

  // Bulk start (existing behavior) creates a NEW tournament and starts it
  startTournament(aliases: string[]): TournamentState {
    const cleaned = aliases.map(a => a.trim()).filter(Boolean);
    if (cleaned.length < 2) throw new Error('At least two players required.');
    const seen = new Set<string>();
    cleaned.forEach(a => {
      const k = a.toLowerCase();
      if (seen.has(k)) throw new Error(`Duplicate alias: ${a}`);
      seen.add(k);
    });

    const t = this.newTournamentInternal(); // internal create (not cloning)
    t.players = cleaned.map(alias => ({
      id: this.nextPlayerIdGlobal++,
      alias,
      eliminated: false,
      wins: 0,
      losses: 0
    }));
    t.queue = t.players.map(p => p.id);
    t.currentMatch = this.createNextMatch(t.queue);
    t.status = t.currentMatch ? 'in_progress' : 'completed';

    if (!t.currentMatch) {
      t.status = 'completed';
      t.championId = t.players[0]?.id;
      if (t.championId) t.queue = [t.championId];
    }
    t.updatedAt = nowISO();
    return this.cloneState(t);
  }

  recordResult(winner: { alias?: string; playerId?: number }): TournamentState {
    const t = this.getActiveOrThrow();
    if (!t.currentMatch) throw new Error('No active match.');
    const { player1Id, player2Id, matchId } = t.currentMatch;
    const p1 = t.players.find(p => p.id === player1Id)!;
    const p2 = t.players.find(p => p.id === player2Id)!;
    const winP = this.resolveWinner(winner, [p1, p2]);
    const loseP = winP.id === p1.id ? p2 : p1;

    winP.wins++; loseP.losses++; loseP.eliminated = true;

    t.matchHistory.push({
      id: matchId,
      player1Id,
      player2Id,
      winnerId: winP.id,
      loserId: loseP.id,
      finishedAt: nowISO()
    });

    // Remove both contestants from front (already shifted when match created)
    // Winner re-enters queue end if tournament not finishing
    t.currentMatch = null;
    const alive = t.players.filter(p => !p.eliminated).map(p => p.id);
    if (alive.length === 1) {
      t.status = 'completed';
      t.championId = alive[0];
      t.queue = [alive[0]];
    } else {
      t.queue.push(winP.id);
      // Remove eliminated IDs from queue
      t.queue = t.queue.filter(id => alive.includes(id));
      t.currentMatch = this.createNextMatch(t.queue);
      if (!t.currentMatch) {
        t.status = 'completed';
        t.championId = winP.id;
        t.queue = [winP.id];
      } else {
        t.status = 'in_progress';
      }
    }
    t.updatedAt = nowISO();
    return this.cloneState(t);
  }

  resetActive(): void {
    this.activeId = null;
  }

  // ===== Internals =====
  private getActiveOrThrow(): TournamentState {
    const t = this.tournaments.find(x => x.id === this.activeId!);
    if (!t) throw new Error('No active tournament.');
    return t;
  }

  private createNextMatch(queue: number[]): TournamentMatch | null {
    if (queue.length < 2) return null;
    const p1 = queue.shift();
    const p2 = queue.shift();
    if (p1 == null || p2 == null) return null;
    return {
      matchId: this.nextMatchIdGlobal++,
      player1Id: p1,
      player2Id: p2,
      startedAt: nowISO()
    };
  }

  private resolveWinner(w: { alias?: string; playerId?: number }, players: TournamentPlayer[]): TournamentPlayer {
    if (w.playerId != null) {
      const p = players.find(pl => pl.id === w.playerId);
      if (p) return p;
    }
    if (w.alias) {
      const low = w.alias.toLowerCase();
      const p = players.find(pl => pl.alias.toLowerCase() === low);
      if (p) return p;
    }
    throw new Error('Winner not in current match.');
  }

  private newTournamentInternal(): TournamentState {
    const createdAt = nowISO();
    const t: TournamentState = {
      id: this.nextTournamentId++,
      status: 'idle',
      createdAt,
      updatedAt: createdAt,
      players: [],
      queue: [],
      currentMatch: null,
      matchHistory: [],
      championId: undefined
    };
    this.tournaments.push(t);
    this.activeId = t.id;
    return t;
  }

  private cloneState(state: TournamentState): TournamentState {
    return {
      ...state,
      players: state.players.map(p => ({ ...p })),
      queue: [...state.queue],
      currentMatch: state.currentMatch ? { ...state.currentMatch } : null,
      matchHistory: state.matchHistory.map(m => ({ ...m }))
    };
  }
}

export const tournamentManager = new TournamentManager();

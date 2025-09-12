import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Use environment variable for Docker compatibility, fallback to local path
const DATABASE_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'database', 'transcendence.db');
const DATABASE_DIR = path.dirname(DATABASE_PATH);

// Interface definitions
export interface User {
  id: number;
  firstName: string;
  lastName: string;
  email?: string;
  createdAt: string;
}

export interface Game {
  id: number;
  status: string;
  mode: string;
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
  winnerId?: number;
  difficulty: string;
}

export interface Player {
  id: number;
  gameId: number;
  playerId: number;
  playerPosition: string;
  currentScore: number;
  connectionStatus: string;
  lastActivity: string;
}

export interface GameState {
  id: number;
  gameId: number;
  player1Id: number;
  player2Id: number;
  ballPosX: number;
  ballPosY: number;
  ballVelX: number;
  ballVelY: number;
  player1Pos: number;
  player2Pos: number;
  scorePlayer1: number;
  scorePlayer2: number;
  lastActivity: string;
}

// Base database manager class
abstract class BaseDatabaseManager {
  protected db: Database.Database;

  constructor() {
    try {
      // Ensure database directory exists
      if (!fs.existsSync(DATABASE_DIR)) {
        fs.mkdirSync(DATABASE_DIR, { recursive: true });
      }
      
      this.db = new Database(DATABASE_PATH);
      
      // Enable WAL mode for better performance
      this.db.pragma('journal_mode = WAL');
      
      this.initializeTables();
    } catch (error) {
      console.error(`Failed to initialize database:`, error);
      throw error;
    }
  }

  protected abstract initializeTables(): void;

  close() {
    this.db.close();
  }
}

// User Database Manager
class UserDatabaseManager {
  private db: Database.Database;

  constructor(database: Database.Database) {
    this.db = database;
  }

  // User methods
  getAllUsers(): User[] {
    const stmt = this.db.prepare('SELECT * FROM users ORDER BY id');
    return stmt.all() as User[];
  }

  getUserById(id: number): User | undefined {
    const stmt = this.db.prepare('SELECT * FROM users WHERE id = ?');
    return stmt.get(id) as User | undefined;
  }

  createUser(userData: { firstName: string; lastName: string; email?: string }): User {
    const stmt = this.db.prepare(`
      INSERT INTO users (firstName, lastName, email) 
      VALUES (?, ?, ?)
    `);
    
    const result = stmt.run(userData.firstName, userData.lastName, userData.email);
    const insertedUser = this.getUserById(result.lastInsertRowid as number);
    
    if (!insertedUser) {
      throw new Error('Failed to retrieve created user');
    }
    
    return insertedUser;
  }

  updateUser(id: number, userData: Partial<{ firstName: string; lastName: string; email?: string }>): User | undefined {
    const fields: string[] = [];
    const values: any[] = [];
    
    if (userData.firstName) {
      fields.push('firstName = ?');
      values.push(userData.firstName);
    }
    
    if (userData.lastName) {
      fields.push('lastName = ?');
      values.push(userData.lastName);
    }
    
    if (userData.email !== undefined) {
      fields.push('email = ?');
      values.push(userData.email);
    }
    
    if (fields.length === 0) {
      return this.getUserById(id);
    }
    
    values.push(id);
    
    const stmt = this.db.prepare(`
      UPDATE users 
      SET ${fields.join(', ')} 
      WHERE id = ?
    `);
    
    const result = stmt.run(...values);
    
    if (result.changes === 0) {
      return undefined;
    }
    
    return this.getUserById(id);
  }

  deleteUser(id: number): boolean {
    const stmt = this.db.prepare('DELETE FROM users WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }
}

// Game Database Manager
class GameDatabaseManager {
  private db: Database.Database;

  constructor(database: Database.Database) {
    this.db = database;
  }

  // Game methods
  getAllGames(): Game[] {
    const stmt = this.db.prepare('SELECT * FROM games ORDER BY id DESC');
    return stmt.all() as Game[];
  }

  getGameById(id: number): Game | undefined {
    const stmt = this.db.prepare('SELECT * FROM games WHERE id = ?');
    return stmt.get(id) as Game | undefined;
  }

  createGame(gameData: { mode?: string; difficulty?: string }): Game {
    const stmt = this.db.prepare(`
      INSERT INTO games (mode, difficulty) 
      VALUES (?, ?)
    `);
    
    const result = stmt.run(
      gameData.mode || '1v1',
      gameData.difficulty || 'normal'
    );
    
    const insertedGame = this.getGameById(result.lastInsertRowid as number);
    if (!insertedGame) {
      throw new Error('Failed to retrieve created game');
    }
    
    return insertedGame;
  }

  updateGame(id: number, gameData: Partial<{ status: string; startedAt: string; endedAt: string; winnerId: number }>): Game | undefined {
    const fields: string[] = [];
    const values: any[] = [];
    
    if (gameData.status) {
      fields.push('status = ?');
      values.push(gameData.status);
    }
    
    if (gameData.startedAt) {
      fields.push('startedAt = ?');
      values.push(gameData.startedAt);
    }
    
    if (gameData.endedAt) {
      fields.push('endedAt = ?');
      values.push(gameData.endedAt);
    }
    
    if (gameData.winnerId !== undefined) {
      fields.push('winnerId = ?');
      values.push(gameData.winnerId);
    }
    
    if (fields.length === 0) {
      return this.getGameById(id);
    }
    
    values.push(id);
    
    const stmt = this.db.prepare(`
      UPDATE games 
      SET ${fields.join(', ')} 
      WHERE id = ?
    `);
    
    const result = stmt.run(...values);
    
    if (result.changes === 0) {
      return undefined;
    }
    
    return this.getGameById(id);
  }

  deleteGame(id: number): boolean {
    const stmt = this.db.prepare('DELETE FROM games WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }
}

class PlayerDatabaseManager {
  private db: Database.Database;

  constructor(database: Database.Database) {
    this.db = database;
  }

  getPlayers(gameId: number): Player[] {
    const stmt = this.db.prepare('SELECT * FROM players WHERE gameId = ?');
    return stmt.all(gameId) as Player[];
  }

  addPlayerToGame(gameId: number, playerId: number, position: string): Player {
    const stmt = this.db.prepare(`
      INSERT INTO players (gameId, playerId, playerPosition) 
      VALUES (?, ?, ?)
    `);
    
    const result = stmt.run(gameId, playerId, position);
    
    const insertedPlayer = this.db.prepare('SELECT * FROM players WHERE id = ?')
      .get(result.lastInsertRowid as number) as Player;
    
    if (!insertedPlayer) {
      throw new Error('Failed to retrieve created game player');
    }
    
    return insertedPlayer;
  }

  removePlayerFromGame(playerId: number, gameId: number): boolean {
    const stmt = this.db.prepare('DELETE FROM players WHERE playerId = ? AND gameId = ?');
    const result = stmt.run(playerId, gameId);
    return result.changes > 0;
  }

  updatePlayer(playerId: number, gameId: number, updateData: Partial<{ currentScore: number; connectionStatus: string; playerPosition: string }>): Player | undefined {
    const fields: string[] = [];
    const values: any[] = [];
    
    if (updateData.currentScore !== undefined) {
      fields.push('currentScore = ?');
      values.push(updateData.currentScore);
    }
    
    if (updateData.connectionStatus) {
      fields.push('connectionStatus = ?');
      values.push(updateData.connectionStatus);
    }
    
    if (updateData.playerPosition) {
      fields.push('playerPosition = ?');
      values.push(updateData.playerPosition);
    }
    
    if (fields.length === 0) {
      const stmt = this.db.prepare('SELECT * FROM players WHERE playerId = ? AND gameId = ?');
      return stmt.get(playerId, gameId) as Player | undefined;
    }
    
    values.push(playerId, gameId);
    
    const stmt = this.db.prepare(`
      UPDATE players 
      SET ${fields.join(', ')}, lastActivity = CURRENT_TIMESTAMP
      WHERE playerId = ? AND gameId = ?
    `);
    
    const result = stmt.run(...values);
    
    if (result.changes === 0) {
      return undefined;
    }
    
    const updatedPlayer = this.db.prepare('SELECT * FROM players WHERE playerId = ? AND gameId = ?')
      .get(playerId, gameId) as Player;
    
    return updatedPlayer;
  }
}

// GameState Database Manager
class GameStateDatabaseManager {
  private db: Database.Database;

  constructor(database: Database.Database) {
    this.db = database;
  }

  // Game Logic methods
  getAllGameStates(): GameState[] {
    const stmt = this.db.prepare('SELECT * FROM gameState ORDER BY id');
    return stmt.all() as GameState[];
  }

  getGameStateById(id: number): GameState | undefined {
    const stmt = this.db.prepare('SELECT * FROM gameState WHERE id = ?');
    return stmt.get(id) as GameState | undefined;
  }

  getGameStateByGameId(gameId: number): GameState | undefined {
    const stmt = this.db.prepare('SELECT * FROM gameState WHERE gameId = ? ORDER BY lastActivity DESC LIMIT 1');
    return stmt.get(gameId) as GameState | undefined;
  }

  createGameState(gameStateData: { gameId: number; player1Id: number; player2Id: number }): GameState {
    const stmt = this.db.prepare(`
      INSERT INTO gameState (gameId, player1Id, player2Id, ballPosX, ballPosY, ballVelX, ballVelY, player1Pos, player2Pos, scorePlayer1, scorePlayer2) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      gameStateData.gameId,
      gameStateData.player1Id,
      gameStateData.player2Id,
      0, // Default ball X position
      0, // Default ball Y position
      0, // Default ball X velocity
      0, // Default ball Y velocity
      0, // Default player1 position
      0, // Default player2 position
      0, // Default player1 score
      0  // Default player2 score
    );
    
    const newGameState = this.getGameStateById(result.lastInsertRowid as number);
    
    if (!newGameState) {
      throw new Error('Failed to retrieve created game logic');
    }
    
    return newGameState;
  }

  updateGameState(id: number, gameStateData: Partial<{ ballPosX: number; ballPosY: number;
     ballVelX: number; ballVelY: number; player1Pos: number; player2Pos: number; 
     scorePlayer1: number; scorePlayer2: number }>): GameState | undefined {
    const fields: string[] = [];
    const values: any[] = [];
    
    if (gameStateData.ballPosX !== undefined) {
      fields.push('ballPosX = ?');
      values.push(gameStateData.ballPosX);
    }
    
    if (gameStateData.ballPosY !== undefined) {
      fields.push('ballPosY = ?');
      values.push(gameStateData.ballPosY);
    }
    
    if (gameStateData.ballVelX !== undefined) {
      fields.push('ballVelX = ?');
      values.push(gameStateData.ballVelX);
    }
    
    if (gameStateData.ballVelY !== undefined) {
      fields.push('ballVelY = ?');
      values.push(gameStateData.ballVelY);
    }
    
    if (gameStateData.player1Pos !== undefined) {
      fields.push('player1Pos = ?');
      values.push(gameStateData.player1Pos);
    }
    
    if (gameStateData.player2Pos !== undefined) {
      fields.push('player2Pos = ?');
      values.push(gameStateData.player2Pos);
    }
    
    if (gameStateData.scorePlayer1 !== undefined) {
      fields.push('scorePlayer1 = ?');
      values.push(gameStateData.scorePlayer1);
    }
    
    if (gameStateData.scorePlayer2 !== undefined) {
      fields.push('scorePlayer2 = ?');
      values.push(gameStateData.scorePlayer2);
    }
    
    if (fields.length === 0) {
      return this.getGameStateById(id);
    }
    
    values.push(id);
    
    const stmt = this.db.prepare(`
      UPDATE gameState 
      SET ${fields.join(', ')}, lastActivity = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    
    const result = stmt.run(...values);
    
    if (result.changes === 0) {
      return undefined;
    }
    
    return this.getGameStateById(id);
  }

  deleteGameState(id: number): boolean {
    const stmt = this.db.prepare('DELETE FROM gameState WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  deleteGameStateByGameId(gameId: number): boolean {
    const stmt = this.db.prepare('DELETE FROM gameState WHERE gameId = ?');
    const result = stmt.run(gameId);
    return result.changes > 0;
  }
}

// Central Database Manager
export class DatabaseManager extends BaseDatabaseManager {
  public users: UserDatabaseManager;
  public games: GameDatabaseManager;
  public gameState: GameStateDatabaseManager;
  public players: PlayerDatabaseManager;

  constructor() {
    super();
    this.users = new UserDatabaseManager(this.db);
    this.games = new GameDatabaseManager(this.db);
    this.gameState = new GameStateDatabaseManager(this.db);
    this.players = new PlayerDatabaseManager(this.db);
  }

  protected initializeTables() {
    this.initializeUsersTable();
    this.initializeGamesTable();
    this.initializePlayersTable();
    this.initializeGameStateTable();
  }

  private initializeUsersTable() {
    const createUsersTable = `
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        firstName TEXT NOT NULL,
        lastName TEXT NOT NULL,
        email TEXT UNIQUE,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
    
    this.db.exec(createUsersTable);
    
    // Insert sample data if table is empty
    const userCount = this.db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    
    if (userCount.count === 0) {
      const insertSampleUsers = this.db.prepare(`
        INSERT INTO users (firstName, lastName, email) VALUES (?, ?, ?)
      `);
      
      const sampleUsers = [
        ['Michael', 'Naysmith', 'michael@example.com'],
        ['John', 'Doe', 'john.doe@example.com'],
        ['Jane', 'Smith', 'jane.smith@example.com']
      ];
      
      for (const user of sampleUsers) {
        insertSampleUsers.run(user);
      }
    }
  }

  private initializeGamesTable() {
    const createGamesTable = `
      CREATE TABLE IF NOT EXISTS games (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        status TEXT NOT NULL DEFAULT 'waiting',
        mode TEXT NOT NULL DEFAULT '1v1',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        startedAt DATETIME NULL,
        endedAt DATETIME NULL,
        winnerId INTEGER NULL,
        difficulty TEXT NOT NULL DEFAULT 'normal',
        FOREIGN KEY (winnerId) REFERENCES users(id)
      )
    `;
    
    this.db.exec(createGamesTable);
  }

  private initializePlayersTable() {
    const createPlayersTable = `
      CREATE TABLE IF NOT EXISTS players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        gameId INTEGER NOT NULL,
        playerId INTEGER NOT NULL,
        playerPosition TEXT NOT NULL,
        currentScore INTEGER NOT NULL DEFAULT 0,
        connectionStatus TEXT NOT NULL DEFAULT 'connected',
        lastActivity DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (gameId) REFERENCES games(id) ON DELETE CASCADE,
        FOREIGN KEY (playerId) REFERENCES users(id),
        UNIQUE(gameId, playerId)
      )
    `;
    
    this.db.exec(createPlayersTable);
  }

  private initializeGameStateTable() {
    const createGameStateTable = `
      CREATE TABLE IF NOT EXISTS gameState (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        gameId INTEGER NOT NULL,
        player1Id INTEGER NOT NULL,
        player2Id INTEGER NOT NULL,
        ballPosX INTEGER NOT NULL DEFAULT 0,
        ballPosY INTEGER NOT NULL DEFAULT 0,
        ballVelX INTEGER NOT NULL DEFAULT 0,
        ballVelY INTEGER NOT NULL DEFAULT 0,
        player1Pos INTEGER NOT NULL DEFAULT 0,
        player2Pos INTEGER NOT NULL DEFAULT 0,
        scorePlayer1 INTEGER NOT NULL DEFAULT 0,
        scorePlayer2 INTEGER NOT NULL DEFAULT 0,
        lastActivity DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (gameId) REFERENCES games(id) ON DELETE CASCADE,
        FOREIGN KEY (player1Id) REFERENCES users(id),
        FOREIGN KEY (player2Id) REFERENCES users(id)
      )
    `;
    
    this.db.exec(createGameStateTable);
  }
}

// Export singleton instance
export const database = new DatabaseManager();

// Graceful shutdown
process.on('SIGINT', () => {
  database.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  database.close();
  process.exit(0);
});
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { StringAsNumber } from 'fastify/types/utils';

// Use environment variable for Docker compatibility, fallback to local path
const DATABASE_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'database', 'transcendence.db');
const DATABASE_DIR = path.dirname(DATABASE_PATH);

// Interface definitions
export interface User {
  id: number;
  firstName: string;
  lastName: string;
  email?: string;
  username: string;
  password: string;
  avatar: string;
  googleId: string;
  gamesWon: number;
  gamesLost: number;
  createdAt: string;
  UpdatedAt: string;
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
  player3Id: number;
  player4Id: number;
  ballPosX: number;
  ballPosY: number;
  ballVelX: number;
  ballVelY: number;
  player1Pos: number;
  player2Pos: number;
  player3Pos: number;
  player4Pos: number;
  scorePlayer1: number;
  scorePlayer2: number;
  scorePlayer3: number;
  scorePlayer4: number;
  lastActivity: string;
}

export interface Friend {
  id: number;
  userId: number;
  friendId: number;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
  updatedAt: string;
}

export interface GameInvitation {
  id: number;
  fromUserId: number;
  toUserId: number;
  roomId: string;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  createdAt: string;
  expiresAt: string;
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

  async getUserByUsername(username: string): Promise<User | undefined> {
    const stmt = this.db.prepare('SELECT * FROM users WHERE username = ?');
    return stmt.get(username) as User | undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const stmt = this.db.prepare('SELECT * FROM users WHERE email = ?');
    return stmt.get(email) as User | undefined;
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    const stmt = this.db.prepare('SELECT * FROM users WHERE googleId = ?');
    return stmt.get(googleId) as User | undefined;
  }

  async createUser(userData: { firstName: string; lastName: string; email?: string; username?: string; password?: string; avatar?: string; googleId?: string; gamesWon?: number; gamesLost?: number}): Promise<User> {
    const stmt = this.db.prepare(`
      INSERT INTO users (firstName, lastName, email, username, password, avatar, googleId, gamesWon, gamesLost) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(userData.firstName, userData.lastName, userData.email, userData.username, userData.password, userData.avatar, userData.googleId, userData.gamesWon, userData.gamesLost);
    const insertedUser = this.getUserById(result.lastInsertRowid as number);
    
    if (!insertedUser) {
      throw new Error('Failed to retrieve created user');
    }
    
    return insertedUser;
  }

  updateUserStats(userId: number, won: boolean): User | undefined {
    const user = this.getUserById(userId);
    
    if (!user) {
      return undefined;
    }
    
    const stmt = this.db.prepare(`
      UPDATE users 
      SET gamesWon = COALESCE(gamesWon, 0) + ?, 
          gamesLost = COALESCE(gamesLost, 0) + ?,
          UpdatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    
    // If won is true, increment gamesWon, otherwise increment gamesLost
    const result = stmt.run(won ? 1 : 0, won ? 0 : 1, userId);
    
    if (result.changes === 0) {
      return undefined;
    }
    
    return this.getUserById(userId);
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
      INSERT INTO gameState (
        gameId, player1Id, player2Id, player3Id, player4Id,
        ballPosX, ballPosY, ballVelX, ballVelY, 
        player1Pos, player2Pos, scorePlayer1, scorePlayer2
      ) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      gameStateData.gameId,
      gameStateData.player1Id,
      gameStateData.player2Id,
      gameStateData.player1Id,  // Use player1Id as default for player3Id
      gameStateData.player2Id,  // Use player2Id as default for player4Id
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
      throw new Error('Failed to retrieve created game state');
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

class FriendDatabaseManager {
  private db: Database.Database;

  constructor(database: Database.Database) {
    this.db = database;
  }

  // Send friend request
  sendFriendRequest(userId: number, friendId: number): Friend {
    // Check if request already exists
    const existing = this.db.prepare(
      'SELECT * FROM friends WHERE (userId = ? AND friendId = ?) OR (userId = ? AND friendId = ?)'
    ).get(userId, friendId, friendId, userId) as Friend | undefined;

    if (existing) {
      throw new Error('Friend request already exists');
    }

    const stmt = this.db.prepare(`
      INSERT INTO friends (userId, friendId, status) 
      VALUES (?, ?, 'pending')
    `);
    
    const result = stmt.run(userId, friendId);
    return this.getFriendshipById(result.lastInsertRowid as number)!;
  }

  // Get friendship by ID
  getFriendshipById(id: number): Friend | undefined {
    const stmt = this.db.prepare('SELECT * FROM friends WHERE id = ?');
    return stmt.get(id) as Friend | undefined;
  }

  // Accept friend request
  acceptFriendRequest(userId: number, friendId: number): Friend | undefined {
    const stmt = this.db.prepare(`
      UPDATE friends 
      SET status = 'accepted', updatedAt = CURRENT_TIMESTAMP 
      WHERE friendId = ? AND userId = ? AND status = 'pending'
    `);
    
    const result = stmt.run(userId, friendId);
    if (result.changes === 0) return undefined;

    return this.db.prepare(
      'SELECT * FROM friends WHERE userId = ? AND friendId = ?'
    ).get(friendId, userId) as Friend | undefined;
  }

  // Reject friend request
  rejectFriendRequest(userId: number, friendId: number): boolean {
    const stmt = this.db.prepare(`
      UPDATE friends 
      SET status = 'rejected', updatedAt = CURRENT_TIMESTAMP 
      WHERE friendId = ? AND userId = ? AND status = 'pending'
    `);
    
    const result = stmt.run(userId, friendId);
    return result.changes > 0;
  }

  // Remove friend
  removeFriend(userId: number, friendId: number): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM friends 
      WHERE (userId = ? AND friendId = ?) OR (userId = ? AND friendId = ?)
    `);
    
    const result = stmt.run(userId, friendId, friendId, userId);
    return result.changes > 0;
  }

  // Get all friends for a user
  getFriends(userId: number): User[] {
    const stmt = this.db.prepare(`
      SELECT u.* FROM users u
      INNER JOIN friends f ON (
        (f.userId = ? AND f.friendId = u.id) OR 
        (f.friendId = ? AND f.userId = u.id)
      )
      WHERE f.status = 'accepted'
    `);
    
    return stmt.all(userId, userId) as User[];
  }

  // Get pending friend requests (received)
  getPendingRequests(userId: number): User[] {
    const stmt = this.db.prepare(`
      SELECT u.* FROM users u
      INNER JOIN friends f ON f.userId = u.id
      WHERE f.friendId = ? AND f.status = 'pending'
    `);
    
    return stmt.all(userId) as User[];
  }

  // Get sent friend requests
  getSentRequests(userId: number): User[] {
    const stmt = this.db.prepare(`
      SELECT u.* FROM users u
      INNER JOIN friends f ON f.friendId = u.id
      WHERE f.userId = ? AND f.status = 'pending'
    `);
    
    return stmt.all(userId) as User[];
  }

  // Check friendship status
  getFriendshipStatus(userId: number, friendId: number): string | null {
    const stmt = this.db.prepare(`
      SELECT status FROM friends 
      WHERE (userId = ? AND friendId = ?) OR (userId = ? AND friendId = ?)
    `);
    
    const result = stmt.get(userId, friendId, friendId, userId) as Friend | undefined;
    return result ? result.status : null;
  }
}

class InvitationDatabaseManager {
  private db: Database.Database;

  constructor(database: Database.Database) {
    this.db = database;
  }

  sendInvitation(fromUserId: number, toUserId: number, roomId: string): GameInvitation {
    // Set expiration to 10 minutes from now
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    
    const stmt = this.db.prepare(`
      INSERT INTO game_invitations (fromUserId, toUserId, roomId, status, expiresAt) 
      VALUES (?, ?, ?, 'pending', ?)
    `);
    
    const result = stmt.run(fromUserId, toUserId, roomId, expiresAt);
    return this.getInvitationById(result.lastInsertRowid as number)!;
  }

  getInvitationById(id: number): GameInvitation | undefined {
    const stmt = this.db.prepare('SELECT * FROM game_invitations WHERE id = ?');
    return stmt.get(id) as GameInvitation | undefined;
  }

  getPendingInvitations(userId: number): GameInvitation[] {
    const stmt = this.db.prepare(`
      SELECT * FROM game_invitations 
      WHERE toUserId = ? 
      AND status = 'pending' 
      AND datetime(expiresAt) > datetime('now')
      ORDER BY createdAt DESC
    `);
    return stmt.all(userId) as GameInvitation[];
  }

  getSentInvitations(userId: number): GameInvitation[] {
    const stmt = this.db.prepare(`
      SELECT * FROM game_invitations 
      WHERE fromUserId = ? 
      AND status = 'pending'
      ORDER BY createdAt DESC
    `);
    return stmt.all(userId) as GameInvitation[];
  }

  acceptInvitation(invitationId: number, userId: number): GameInvitation | undefined {
    const stmt = this.db.prepare(`
      UPDATE game_invitations 
      SET status = 'accepted' 
      WHERE id = ? AND toUserId = ? AND status = 'pending'
    `);
    
    const result = stmt.run(invitationId, userId);
    if (result.changes === 0) return undefined;
    
    return this.getInvitationById(invitationId);
  }

  rejectInvitation(invitationId: number, userId: number): boolean {
    const stmt = this.db.prepare(`
      UPDATE game_invitations 
      SET status = 'rejected' 
      WHERE id = ? AND toUserId = ? AND status = 'pending'
    `);
    
    const result = stmt.run(invitationId, userId);
    return result.changes > 0;
  }

  cancelInvitation(invitationId: number, userId: number): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM game_invitations 
      WHERE id = ? AND fromUserId = ?
    `);
    
    const result = stmt.run(invitationId, userId);
    return result.changes > 0;
  }

  // Cleanup expired invitations
  cleanupExpiredInvitations(): void {
    const stmt = this.db.prepare(`
      UPDATE game_invitations 
      SET status = 'expired' 
      WHERE status = 'pending' 
      AND datetime(expiresAt) <= datetime('now')
    `);
    stmt.run();
  }
}


// Central Database Manager
export class DatabaseManager extends BaseDatabaseManager {
  public users: UserDatabaseManager;
  public games: GameDatabaseManager;
  public gameState: GameStateDatabaseManager;
  public players: PlayerDatabaseManager;
  public friends: FriendDatabaseManager;
  public invitations: InvitationDatabaseManager;

  constructor() {
    super();
    this.users = new UserDatabaseManager(this.db);
    this.games = new GameDatabaseManager(this.db);
    this.gameState = new GameStateDatabaseManager(this.db);
    this.players = new PlayerDatabaseManager(this.db);
    this.friends = new FriendDatabaseManager(this.db);
    this.invitations = new InvitationDatabaseManager(this.db);
  }

  protected initializeTables() {
    this.initializeUsersTable();
    this.initializeGamesTable();
    this.initializePlayersTable();
    this.initializeGameStateTable();
    this.initializeFriendsTable();
    this.initializeInvitationsTable();
  }

  private initializeUsersTable() {
    const createUsersTable = `
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        firstName TEXT NOT NULL,
        lastName TEXT NOT NULL,
        email TEXT UNIQUE,
        username TEXT UNIQUE,
        password TEXT,
        avatar TEXT,
        googleId TEXT UNIQUE,
        gamesWon INTEGER DEFAULT 0,
        gamesLost INTEGER DEFAULT 0,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
    
    this.db.exec(createUsersTable);
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
        player3Id INTEGER NOT NULL,
        player4Id INTEGER NOT NULL,
        ballPosX INTEGER NOT NULL DEFAULT 0,
        ballPosY INTEGER NOT NULL DEFAULT 0,
        ballVelX INTEGER NOT NULL DEFAULT 0,
        ballVelY INTEGER NOT NULL DEFAULT 0,
        player1Pos INTEGER NOT NULL DEFAULT 0,
        player2Pos INTEGER NOT NULL DEFAULT 0,
        player3Pos INTEGER NOT NULL DEFAULT 0,
        player4Pos INTEGER NOT NULL DEFAULT 0,
        scorePlayer1 INTEGER NOT NULL DEFAULT 0,
        scorePlayer2 INTEGER NOT NULL DEFAULT 0,
        scorePlayer3 INTEGER NOT NULL DEFAULT 0,
        scorePlayer4 INTEGER NOT NULL DEFAULT 0,
        gameMode TEXT NOT NULL DEFAULT '1v1',
        lastActivity DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (gameId) REFERENCES games(id) ON DELETE CASCADE,
        FOREIGN KEY (player1Id) REFERENCES users(id),
        FOREIGN KEY (player2Id) REFERENCES users(id),
        FOREIGN KEY (player3Id) REFERENCES users(id),
        FOREIGN KEY (player4Id) REFERENCES users(id)
      )
    `;
    
    this.db.exec(createGameStateTable);
  }

  private initializeFriendsTable() {
    const createFriendsTable = `
      CREATE TABLE IF NOT EXISTS friends (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        friendId INTEGER NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'accepted', 'rejected')) DEFAULT 'pending',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (friendId) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(userId, friendId)
      )
    `;
    
    this.db.exec(createFriendsTable);
  }

  private initializeInvitationsTable() {
    const createInvitationsTable = `
      CREATE TABLE IF NOT EXISTS game_invitations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fromUserId INTEGER NOT NULL,
        toUserId INTEGER NOT NULL,
        roomId TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'accepted', 'rejected', 'expired')) DEFAULT 'pending',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        expiresAt DATETIME NOT NULL,
        FOREIGN KEY (fromUserId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (toUserId) REFERENCES users(id) ON DELETE CASCADE
      )
    `;
    
    this.db.exec(createInvitationsTable);
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
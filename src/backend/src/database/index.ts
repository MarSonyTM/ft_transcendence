import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { CoreUser, CorePlayer as Player, CoreGameState as GameState } from '../../../shared/gameTypes';
import { Tournament, TournamentPlayer, TournamentMatch, TFormat } from '../../../shared/tournamentTypes';

const DATABASE_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'database', 'transcendence.db');
const DATABASE_DIR = path.dirname(DATABASE_PATH);

export interface User extends CoreUser {
  email: string;
  password: string;
  googleId: string;
  emailVerified: boolean;
  gamesWon: number;
  gamesLost: number;
  createdAt: string;
  UpdatedAt: string;
}

export interface Game {
    id: number;
    mode: string;
    winner: Player | null;   
    players: Player[];         
    points: any[];             
    difficulty: string;
    createdAt: string;
    status?: string;
    startedAt?: string;
    endedAt?: string;
    winnerId?: number;
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

export interface EmailVerification {
    id: number;
    userId: number;
    email: string;
    verificationCode: string;
    status: 'pending' | 'verified' | 'expired';
    createdAt: string;
    expiresAt: string;
}

export interface UsernameChange {
    id: number;
    userId: number;
    oldUsername: string;
    newUsername: string;
    status: 'pending' | 'approved' | 'rejected';
    createdAt: string;
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

    async createUser(userData: { firstName: string; lastName: string; email?: string; username?: string; password?: string; avatar?: string; googleId?: string; gamesWon?: number; gamesLost?: number; emailVerified?: boolean}): Promise<User> {
        const stmt = this.db.prepare(`
            INSERT INTO users (firstName, lastName, email, username, password, avatar, googleId, gamesWon, gamesLost, emailVerified) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        // Handle Google OAuth users who don't have passwords
        const password = userData.password || (userData.googleId ? '' : null);
        const result = stmt.run(userData.firstName, userData.lastName, userData.email, userData.username, password, userData.avatar, userData.googleId, userData.gamesWon || 0, userData.gamesLost || 0, userData.emailVerified);
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

    updateUser(id: number, userData: Partial<{ firstName: string; lastName: string; email?: string; username?: string; emailVerified?: boolean }>): User | undefined {
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

        if (userData.emailVerified !== undefined) {
            fields.push('emailVerified = ?');
            values.push(userData.emailVerified ? 1 : 0);
        }
        
        if (userData.username) {
            fields.push('username = ?');
            values.push(userData.username);
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

//   Game Database Manager
class GameDatabaseManager {
    private db: Database.Database;

    constructor(database: Database.Database) {
        this.db = database;
    }

    // Game methods
    getAllGames(): Game[] {
        const stmt = this.db.prepare('SELECT * FROM games ORDER BY id DESC');
        return stmt.all() as Game[];
    
        // // Parse JSON fields
        // return games.map(game => ({
        //     ...game,
        //     players: game.players ? (typeof game.players === 'string' ? JSON.parse(game.players) : game.players) : [],
        //     points: game.points ? (typeof game.points === 'string' ? JSON.parse(game.points) : game.points) : []
        // }));
    }

    getGameById(id: number): Game | undefined {
        const stmt = this.db.prepare('SELECT * FROM games WHERE id = ?');
        const game = stmt.get(id) as Game | undefined;
    
        if (!game) return undefined;
    
        return {
            ...game,
            players: game.players ? (typeof game.players === 'string' ? JSON.parse(game.players) : game.players) : [],
            points: game.points ? (typeof game.points === 'string' ? JSON.parse(game.points) : game.points) : []
        };
    }

    createGame(gameData: { mode?: string; difficulty?: string }): Game {
        const stmt = this.db.prepare(`
            INSERT INTO games (mode, difficulty) 
            VALUES (?, ?)
        `);
      
        const result = stmt.run(
            gameData.mode || '2P',
            gameData.difficulty || 'normal'
        );
      
        const insertedGame = this.getGameById(result.lastInsertRowid as number);
        if (!insertedGame) {
            throw new Error('Failed to retrieve created game');
        }
      
        return insertedGame;
    }

    updateGame(id: number, gameData: Partial<{ 
        status: string; 
        startedAt: string; 
        endedAt: string; 
        winnerId: number;
        players: any; 
        points: any;
      }>): Game | undefined {
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

    if (gameData.players !== undefined) {
        fields.push('players = ?');
        values.push(typeof gameData.players === 'string' ? gameData.players : JSON.stringify(gameData.players));
    }

    if (gameData.points !== undefined) {
        fields.push('points = ?');
        values.push(typeof gameData.points === 'string' ? gameData.points : JSON.stringify(gameData.points));
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

    updatePlayer(playerId: number, gameId: number, updateData: Partial<{ score: number; connectionStatus: string; pos: number }>): Player | undefined {
        const fields: string[] = [];
        const values: any[] = [];
    
        if (updateData.score !== undefined) {
            fields.push('score = ?');
            values.push(updateData.score);
        }
    
        if (updateData.connectionStatus) {
            fields.push('connectionStatus = ?');
            values.push(updateData.connectionStatus);
        }
        
        if (updateData.pos) {
            fields.push('pos = ?');
            values.push(updateData.pos);
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
        try {
            const stmt = this.db.prepare('SELECT * FROM gameState WHERE gameId = ? ORDER BY lastActivity DESC LIMIT 1');
            return stmt.get(gameId) as GameState | undefined;
        } catch (e) {
            try {
                const stmt2 = this.db.prepare('SELECT * FROM gameState WHERE gameId = ? LIMIT 1');
                return stmt2.get(gameId) as GameState | undefined;
            } catch (e2) {
            return undefined;
        }
      }
    }

    createGameState(gameStateData: { gameId: number }): GameState {
        const columns = this.db.prepare("PRAGMA table_info('gameState')").all() as Array<{ cid: number; name: string; type: string; notnull: number; dflt_value: any; pk: number }>;
        const existing = this.getGameStateByGameId(gameStateData.gameId);
        if (existing) 
            return existing;

        const defaultForColumn = (name: string, type?: string): any => {
            const lower = name.toLowerCase();
            if (lower === 'mode') return '2P';
            if (lower === 'difficulty') return 'normal';
            if (lower === 'status') return 'waiting';
            if (lower === 'startedat') return new Date().toISOString();
            if (lower === 'endedat') return null;
            if (lower === 'winnerid') return null;
            if (lower.endsWith('id')) {
                if (lower === 'gameid') return gameStateData.gameId;
                return 0;
            }
            if (lower.includes('pos') || lower.includes('vel') || lower.includes('score') || lower.includes('ball')) return 0;
            if (lower.includes('lastactivity')) return new Date().toISOString();
            const t = (type || '').toUpperCase();
            if (t.includes('TEXT')) return '';
            if (t.includes('INT') || t.includes('REAL') || t.includes('NUM')) return 0;
            return 0;
        };

        const insertCols: string[] = [];
        const values: any[] = [];

        for (const col of columns) {
            if (col.pk === 1 || col.name.toLowerCase() === 'id') {
                continue;
        }
        insertCols.push(col.name);
        if (col.name.toLowerCase() === 'gameid') {
            values.push(gameStateData.gameId);
        } else if (col.dflt_value !== null && col.dflt_value !== undefined) {
            values.push(defaultForColumn(col.name, col.type));
        } else {
            values.push(defaultForColumn(col.name, col.type));
        }
    }

    if (insertCols.length === 0) {
        try {
            const stmt2 = this.db.prepare('INSERT INTO gameState (gameId) VALUES (?)');
            const res2 = stmt2.run(gameStateData.gameId);
            const gs2 = this.getGameStateById(res2.lastInsertRowid as number);
            if (gs2)
                return gs2;
        } catch {}
            throw new Error('Unable to construct insert for gameState');
        }

        const placeholders = insertCols.map(() => '?').join(', ');
        const sql = `INSERT INTO gameState (${insertCols.join(', ')}) VALUES (${placeholders})`;
        
        try {
            const stmt = this.db.prepare(sql);
            const result = stmt.run(...values);
            const newGameState = this.getGameStateById(result.lastInsertRowid as number);
            if (newGameState)
                return newGameState;
        } catch (e: any) {
            const existing2 = this.getGameStateByGameId(gameStateData.gameId);
            if (existing2)
                return existing2;
            throw e;
        }
        const fallback = this.getGameStateByGameId(gameStateData.gameId);
        if (!fallback) {
            throw new Error('Failed to retrieve created game state');
        }
        return fallback;
    }

    updateGameStateByGameId(gameId: number, gameStateData: Partial<{ ballPosX: number; ballPosY: number; ballVelX: number; ballVelY: number; players: Player[]; mode: string }>): GameState | undefined {
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

    if (gameStateData.players !== undefined) {
      fields.push('players = ?');
      values.push(JSON.stringify(gameStateData.players));
    }

    if (gameStateData.mode !== undefined) {
      fields.push('mode = ?');
      values.push(gameStateData.mode);
    }

        if (fields.length === 0) {
            return this.getGameStateByGameId(gameId);
        }

        values.push(gameId);
        const stmt = this.db.prepare(`
            UPDATE gameState
            SET ${fields.join(', ')}, lastActivity = CURRENT_TIMESTAMP
            WHERE gameId = ?
        `);
        const result = stmt.run(...values);
        if (result.changes === 0) {
            return undefined;
        }
        return this.getGameStateByGameId(gameId);
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

class EmailVerificationDatabaseManager {
    private db: Database.Database;

    constructor(database: Database.Database) {
        this.db = database;
    }

    // Create email verification request
    createVerificationRequest(userId: number, email: string, verificationCode: string): EmailVerification {
        // Set expiration to 15 minutes from now
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      
        const stmt = this.db.prepare(`
            INSERT INTO email_verifications (userId, email, verificationCode, status, expiresAt) 
            VALUES (?, ?, ?, 'pending', ?)
        `);
      
        const result = stmt.run(userId, email, verificationCode, expiresAt);
        return this.getVerificationById(result.lastInsertRowid as number)!;
    }

    getVerificationById(id: number): EmailVerification | undefined {
        const stmt = this.db.prepare('SELECT * FROM email_verifications WHERE id = ?');
        return stmt.get(id) as EmailVerification | undefined;
    }

    getVerificationByCode(verificationCode: string): EmailVerification | undefined {
        const stmt = this.db.prepare('SELECT * FROM email_verifications WHERE verificationCode = ? AND status = "pending"');
        return stmt.get(verificationCode) as EmailVerification | undefined;
    }

    getPendingVerification(userId: number, email: string): EmailVerification | undefined {
        const stmt = this.db.prepare(`
            SELECT * FROM email_verifications 
            WHERE userId = ? AND email = ? AND status = 'pending'
            AND datetime(expiresAt) > datetime('now')
            ORDER BY createdAt DESC LIMIT 1
        `);
        return stmt.get(userId, email) as EmailVerification | undefined;
    }

    verifyEmail(verificationCode: string, userId: number): EmailVerification | undefined {
        const stmt = this.db.prepare(`
            UPDATE email_verifications 
            SET status = 'verified' 
            WHERE verificationCode = ? AND userId = ? AND status = 'pending'
            AND datetime(expiresAt) > datetime('now')
        `);
      
        const result = stmt.run(verificationCode, userId);
        if (result.changes === 0) return undefined;
      
        return this.db.prepare(
            'SELECT * FROM email_verifications WHERE verificationCode = ? AND userId = ?'
        ).get(verificationCode, userId) as EmailVerification | undefined;
    }

    cleanupExpiredVerifications(): void {
        const stmt = this.db.prepare(`
            UPDATE email_verifications 
            SET status = 'expired' 
            WHERE status = 'pending' 
            AND datetime(expiresAt) <= datetime('now')
        `);
        stmt.run();
    }
}

class UsernameChangeDatabaseManager {
    private db: Database.Database;

    constructor(database: Database.Database) {
        this.db = database;
    }

    // Create username change request
    createUsernameChangeRequest(userId: number, oldUsername: string, newUsername: string): UsernameChange {
        const stmt = this.db.prepare(`
            INSERT INTO username_changes (userId, oldUsername, newUsername, status) 
            VALUES (?, ?, ?, 'pending')
        `);
      
        const result = stmt.run(userId, oldUsername, newUsername);
        return this.getUsernameChangeById(result.lastInsertRowid as number)!;
    }

    getUsernameChangeById(id: number): UsernameChange | undefined {
        const stmt = this.db.prepare('SELECT * FROM username_changes WHERE id = ?');
        return stmt.get(id) as UsernameChange | undefined;
    }

    getPendingUsernameChanges(userId: number): UsernameChange[] {
        const stmt = this.db.prepare(`
            SELECT * FROM username_changes 
            WHERE userId = ? AND status = 'pending'
            ORDER BY createdAt DESC
        `);
        return stmt.all(userId) as UsernameChange[];
    }

    // Check if username is available
    isUsernameAvailable(username: string): boolean {
        const stmt = this.db.prepare('SELECT id FROM users WHERE username = ?');
        const result = stmt.get(username);
        return !result;
    }

    // Check if username is available excluding current user
    isUsernameAvailableForUser(username: string, userId: number): boolean {
        const stmt = this.db.prepare('SELECT id FROM users WHERE username = ? AND id != ?');
        const result = stmt.get(username, userId);
        return !result;
    }
}

class TournamentDatabaseManager {
  private db: Database.Database;

  constructor(database: Database.Database) {
    this.db = database;
  }

  // Create a new tournament
  createTournament(format: TFormat = 'single_elimination', matchDelay: number = 3): Tournament {
    // Determine next friendlyId (sequential, gapless)
    const row = this.db.prepare('SELECT COALESCE(MAX(friendlyId), 0) + 1 AS n FROM tournaments').get() as { n?: number } | undefined;
    const nextFriendly = (row && typeof row.n === 'number' ? row.n : 1);

    const stmt = this.db.prepare(`
      INSERT INTO tournaments (format, matchDelay, status, createdAt, updatedAt, friendlyId)
      VALUES (?, ?, 'idle', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)
    `);
    
    const result = stmt.run(format, matchDelay, nextFriendly);
    return this.getTournamentById(result.lastInsertRowid as number)!;
  }

  // Get tournament by ID
  getTournamentById(id: number): Tournament | undefined {
    const stmt = this.db.prepare('SELECT * FROM tournaments WHERE id = ?');
    return stmt.get(id) as Tournament | undefined;
  }

  // Get all tournaments
  getAllTournaments(): Tournament[] {
    const stmt = this.db.prepare('SELECT * FROM tournaments ORDER BY createdAt DESC');
    return stmt.all() as Tournament[];
  }

  // Update tournament
  updateTournament(id: number, data: Partial<Tournament>): Tournament | undefined {
    const fields: string[] = [];
    const values: any[] = [];

    if (data.status) {
      fields.push('status = ?');
      values.push(data.status);
    }
    if (data.format) {
      fields.push('format = ?');
      values.push(data.format);
    }
    if ((data as any).champion !== undefined) {
      const champ = (data as any).champion as any;
      const champId = champ && typeof champ === 'object' ? champ.id : champ;
      fields.push('championId = ?');
      values.push(champId ?? null);
    }
    if (fields.length === 0) {
      return this.getTournamentById(id);
    }

    fields.push('updatedAt = CURRENT_TIMESTAMP');
    values.push(id);

    const stmt = this.db.prepare(`
      UPDATE tournaments
      SET ${fields.join(', ')}
      WHERE id = ?
    `);

    stmt.run(...values);
    return this.getTournamentById(id);
  }

  // Delete tournament
  deleteTournament(id: number): boolean {
    const stmt = this.db.prepare('DELETE FROM tournaments WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  // Add player to tournament (playerId is tournament-internal ID)
  addPlayer(tournamentId: number, playerId: number, user: User | undefined, alias: string, isAI: boolean = false, isLocal: boolean = false, isRemote: boolean = false): TournamentPlayer {
    const stmt = this.db.prepare(`
      INSERT INTO tournament_players (tournamentId, playerId, userId, alias, isAI, isLocal, isRemote)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(tournamentId, playerId, user?.id ?? null, alias, isAI ? 1 : 0, isLocal ? 1 : 0, isRemote ? 1 : 0);
    // Return mapped player
    const player = this.getPlayers(tournamentId).find(p => p.id === playerId);
    if (!player) throw new Error('Failed to insert tournament player');
    return player;
  }

  // Get player by tournament-internal ID
  getPlayerById(id: number): TournamentPlayer | undefined {
    const row = this.db.prepare('SELECT * FROM tournament_players WHERE playerId = ?').get(id) as any;
    if (!row) return undefined;
    return this.mapPlayerRow(row);
  }

  // Get all players for a tournament
  getPlayers(tournamentId: number): TournamentPlayer[] {
    const rows = this.db.prepare('SELECT * FROM tournament_players WHERE tournamentId = ? ORDER BY playerId').all(tournamentId) as any[];
    return rows.map(r => this.mapPlayerRow(r));
  }

  private mapPlayerRow(r: any): TournamentPlayer {
    return {
      id: r.playerId,              // tournament-internal ID
      playerId: r.playerId,
      tournamentId: r.tournamentId,
      alias: r.alias,
      user: r.userId ? { id: r.userId } as any : undefined,
      avatar: undefined,
      eliminated: !!r.eliminated,
      wins: r.wins ?? 0,
      losses: r.losses ?? 0,
      totalScore: r.totalScore ?? 0,
      averageScore: r.averageScore ?? 0,
      isReady: !!r.isReady,
      isAI: !!r.isAI,
      isLocal: !!r.isLocal,
      isRemote: !!r.isRemote,
      gameId: r.gameId ?? undefined,
      pos: r.pos ?? 0,
      score: r.score ?? 0,
      socketId: r.socketId ?? undefined,
      connectionStatus: r.connectionStatus ?? 'connected',
      lastActivity: r.lastActivity ?? new Date().toISOString()
    } as TournamentPlayer;
  }

  // Update player
  updatePlayer(id: number, data: Partial<TournamentPlayer>): TournamentPlayer | undefined {
    const fields: string[] = [];
    const values: any[] = [];

    if (data.eliminated !== undefined) {
      fields.push('eliminated = ?');
      values.push(data.eliminated ? 1 : 0);
    }
    if (data.wins !== undefined) {
      fields.push('wins = ?');
      values.push(data.wins);
    }
    if (data.losses !== undefined) {
      fields.push('losses = ?');
      values.push(data.losses);
    }
    if (data.totalScore !== undefined) {
      fields.push('totalScore = ?');
      values.push(data.totalScore);
    }
    if (data.averageScore !== undefined) {
      fields.push('averageScore = ?');
      values.push(data.averageScore);
    }
    if (data.isReady !== undefined) {
      fields.push('isReady = ?');
      values.push(data.isReady ? 1 : 0);
    }

    if (fields.length === 0) {
      return this.getPlayerById(id);
    }

    values.push(id);

    const stmt = this.db.prepare(`
      UPDATE tournament_players
      SET ${fields.join(', ')}
      WHERE playerId = ?
    `);

    stmt.run(...values);
    return this.getPlayerById(id);
  }

  // Create match
  createMatch(tournamentId: number, matchId: number, p1: TournamentPlayer | null, p2: TournamentPlayer | null): TournamentMatch {
    const stmt = this.db.prepare(`
      INSERT INTO tournament_matches (tournamentId, matchNumber, player1Id, player2Id, status)
      VALUES (?, ?, ?, ?, 'pending')
    `);
    stmt.run(tournamentId, matchId, p1?.id ?? null, p2?.id ?? null);
    // Return mapped match
    const m = this.getMatches(tournamentId).find(x => x.matchId === matchId);
    if (!m) throw new Error('Failed to create tournament match');
    return m;
  }

  // Get match by ID
  getMatchById(id: number): TournamentMatch | undefined {
    const row = this.db.prepare('SELECT * FROM tournament_matches WHERE id = ?').get(id) as any;
    if (!row) return undefined;
    return this.mapMatchRow(row);
  }

  // Get all matches for a tournament
  getMatches(tournamentId: number): TournamentMatch[] {
    const rows = this.db.prepare('SELECT * FROM tournament_matches WHERE tournamentId = ? ORDER BY matchNumber').all(tournamentId) as any[];
    return rows.map(r => this.mapMatchRow(r, tournamentId));
  }

  private mapMatchRow(r: any, tId?: number): TournamentMatch {
    const tid = tId ?? r.tournamentId;
    const p1 = r.player1Id != null ? this.getPlayers(tid).find(p => p.id === r.player1Id) : undefined;
    const p2 = r.player2Id != null ? this.getPlayers(tid).find(p => p.id === r.player2Id) : undefined;
    const winner = r.winnerId != null ? this.getPlayers(tid).find(p => p.id === r.winnerId) : undefined;
    const loser = r.loserId != null ? this.getPlayers(tid).find(p => p.id === r.loserId) : undefined;
    return {
      matchId: r.matchNumber,
      tournamentId: tid,
      p1,
      p2,
      winner,
      loser,
      gameId: r.gameId ?? undefined,
      roomId: r.roomId ?? undefined,
      status: r.status,
      createdAt: r.createdAt ?? new Date().toISOString(),
      startedAt: r.startedAt ?? undefined,
      finishedAt: r.finishedAt ?? undefined,
      disputeReason: r.disputeReason ?? undefined,
      // Additionally map scores if present
      ...(p1 ? { p1: { ...p1, score: r.player1Score ?? p1.score, isReady: !!r.player1Ready } } : {} as any),
      ...(p2 ? { p2: { ...p2, score: r.player2Score ?? p2.score, isReady: !!r.player2Ready } } : {} as any)
    } as TournamentMatch;
  }

  // Update match
  updateMatch(id: number, data: Partial<TournamentMatch>): TournamentMatch | undefined {
    const fields: string[] = [];
    const values: any[] = [];

    if (data.status) {
      fields.push('status = ?');
      values.push(data.status);
    }
    if (data.winner !== undefined) {
      fields.push('winnerId = ?');
      values.push((data.winner as any)?.id ?? null);
    }
    if (data.loser !== undefined) {
      fields.push('loserId = ?');
      values.push((data.loser as any)?.id ?? null);
    }
    if (data.gameId !== undefined) {
      fields.push('gameId = ?');
      values.push(data.gameId);
    }
    if (data.roomId !== undefined) {
      fields.push('roomId = ?');
      values.push(data.roomId);
    }
    if (data.p1 !== undefined) {
      if ((data.p1 as any).score !== undefined) { fields.push('player1Score = ?'); values.push((data.p1 as any).score); }
      if ((data.p1 as any).isReady !== undefined) { fields.push('player1Ready = ?'); values.push((data.p1 as any).isReady ? 1 : 0); }
    }
    if (data.p2 !== undefined) {
      if ((data.p2 as any).score !== undefined) { fields.push('player2Score = ?'); values.push((data.p2 as any).score); }
      if ((data.p2 as any).isReady !== undefined) { fields.push('player2Ready = ?'); values.push((data.p2 as any).isReady ? 1 : 0); }
    }
    if (data.createdAt !== undefined) {
      fields.push('createdAt = ?');
      values.push(data.createdAt);
    }
    if (data.disputeReason !== undefined) {
      fields.push('disputeReason = ?');
      values.push(data.disputeReason);
    }
    if (data.startedAt !== undefined) {
      fields.push('startedAt = ?');
      values.push(data.startedAt);
    }
    if (data.finishedAt !== undefined) {
      fields.push('finishedAt = ?');
      values.push(data.finishedAt);
    }

    if (fields.length === 0) {
      return this.getMatchById(id);
    }

    values.push(id);

    const stmt = this.db.prepare(`
      UPDATE tournament_matches
      SET ${fields.join(', ')}
      WHERE id = ?
    `);

    stmt.run(...values);
    return this.getMatchById(id);
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
  public emailVerifications: EmailVerificationDatabaseManager;
  public usernameChanges: UsernameChangeDatabaseManager;
  public tournaments: TournamentDatabaseManager;

  constructor() {
    super();
    this.users = new UserDatabaseManager(this.db);
    this.games = new GameDatabaseManager(this.db);
    this.gameState = new GameStateDatabaseManager(this.db);
    this.players = new PlayerDatabaseManager(this.db);
    this.friends = new FriendDatabaseManager(this.db);
    this.invitations = new InvitationDatabaseManager(this.db);
    this.emailVerifications = new EmailVerificationDatabaseManager(this.db);
    this.usernameChanges = new UsernameChangeDatabaseManager(this.db);
    this.tournaments = new TournamentDatabaseManager(this.db);
  }

  protected initializeTables() {
    this.initializeUsersTable();
    this.initializeGamesTable();
    this.initializePlayersTable();
    this.initializeGameStateTable();
    this.initializeFriendsTable();
    this.initializeInvitationsTable();
    this.initializeEmailVerificationsTable();
    this.initializeUsernameChangesTable();
    this.initializeTournamentsTable();
    this.createSeedUser();
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
        emailVerified BOOLEAN DEFAULT FALSE,
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
                mode TEXT NOT NULL DEFAULT '2P',
                points JSON DEFAULT '[]',
                players JSON DEFAULT '[]',
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
                pos INTEGER NOT NULL DEFAULT 0,
                score INTEGER NOT NULL DEFAULT 0,
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
                ballPosX INTEGER NOT NULL DEFAULT 0,
                ballPosY INTEGER NOT NULL DEFAULT 0,
                ballVelX INTEGER NOT NULL DEFAULT 0,
                ballVelY INTEGER NOT NULL DEFAULT 0,
                mode TEXT NOT NULL DEFAULT '2P',
                lastActivity DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (gameId) REFERENCES games(id) ON DELETE CASCADE
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

    private initializeEmailVerificationsTable() {
        const createEmailVerificationsTable = `
            CREATE TABLE IF NOT EXISTS email_verifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                userId INTEGER NOT NULL,
                email TEXT NOT NULL,
                verificationCode TEXT NOT NULL,
                status TEXT NOT NULL CHECK(status IN ('pending', 'verified', 'expired')) DEFAULT 'pending',
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                expiresAt DATETIME NOT NULL,
                FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
            )
        `;
      
        this.db.exec(createEmailVerificationsTable);
    }

  private initializeUsernameChangesTable() {
    const createUsernameChangesTable = `
      CREATE TABLE IF NOT EXISTS username_changes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        oldUsername TEXT NOT NULL,
        newUsername TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      )
    `;
    
    this.db.exec(createUsernameChangesTable);
  }

  private initializeTournamentsTable() {
    // Main tournaments table
    const createTournamentsTable = `
      CREATE TABLE IF NOT EXISTS tournaments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        status TEXT NOT NULL CHECK(status IN ('idle', 'in_progress', 'paused', 'completed')) DEFAULT 'idle',
        format TEXT NOT NULL CHECK(format IN ('single_elimination', 'double_elimination', 'round_robin')) DEFAULT 'single_elimination',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        championId INTEGER,
        matchDelay INTEGER DEFAULT 3,
        allowSpectators BOOLEAN DEFAULT TRUE,
        friendlyId INTEGER
      )
    `;
    
    // Tournament players table
    const createTournamentPlayersTable = `
      CREATE TABLE IF NOT EXISTS tournament_players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tournamentId INTEGER NOT NULL,
        playerId INTEGER NOT NULL,
        userId INTEGER,
        alias TEXT NOT NULL,
        eliminated BOOLEAN DEFAULT FALSE,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        totalScore INTEGER DEFAULT 0,
        averageScore REAL DEFAULT 0.0,
        isReady BOOLEAN DEFAULT FALSE,
        isAI BOOLEAN DEFAULT FALSE,
        isLocal BOOLEAN DEFAULT FALSE,
        isRemote BOOLEAN DEFAULT FALSE,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tournamentId) REFERENCES tournaments(id) ON DELETE CASCADE,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE SET NULL
      )
    `;
    
    // Tournament matches table
    const createTournamentMatchesTable = `
      CREATE TABLE IF NOT EXISTS tournament_matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tournamentId INTEGER NOT NULL,
        matchNumber INTEGER NOT NULL,
        player1Id INTEGER,
        player2Id INTEGER,
        winnerId INTEGER,
        loserId INTEGER,
        gameId INTEGER,
        roomId TEXT,
        player1Score INTEGER,
        player2Score INTEGER,
        status TEXT NOT NULL CHECK(status IN ('pending', 'ready', 'in_progress', 'completed', 'disputed')) DEFAULT 'pending',
        player1Ready BOOLEAN DEFAULT FALSE,
        player2Ready BOOLEAN DEFAULT FALSE,
        disputeReason TEXT,
        startedAt DATETIME,
        finishedAt DATETIME,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tournamentId) REFERENCES tournaments(id) ON DELETE CASCADE,
        FOREIGN KEY (gameId) REFERENCES games(id) ON DELETE SET NULL
      )
    `;
    
    this.db.exec(createTournamentsTable);
    this.db.exec(createTournamentPlayersTable);
    this.db.exec(createTournamentMatchesTable);
    
    // Migration: Add isAI, isLocal, and isRemote columns if they don't exist
    try {
      const columns = this.db.prepare("PRAGMA table_info('tournament_players')").all() as Array<{ name: string }>;
      const hasIsAI = columns.some(col => col.name === 'isAI');
      const hasIsLocal = columns.some(col => col.name === 'isLocal');
      const hasIsRemote = columns.some(col => col.name === 'isRemote');
      
      if (!hasIsAI) {
        this.db.exec('ALTER TABLE tournament_players ADD COLUMN isAI BOOLEAN DEFAULT FALSE');
        console.log('✅ Added isAI column to tournament_players');
      }
      if (!hasIsLocal) {
        this.db.exec('ALTER TABLE tournament_players ADD COLUMN isLocal BOOLEAN DEFAULT FALSE');
        console.log('✅ Added isLocal column to tournament_players');
      }
      if (!hasIsRemote) {
        this.db.exec('ALTER TABLE tournament_players ADD COLUMN isRemote BOOLEAN DEFAULT FALSE');
        console.log('✅ Added isRemote column to tournament_players');
      }
    } catch (error) {
      console.log('ℹ️ Tournament player columns migration check:', error instanceof Error ? error.message : 'unknown');
    }

    // Migration: Add friendlyId to tournaments and backfill sequential values
    try {
      const tCols = this.db.prepare("PRAGMA table_info('tournaments')").all() as Array<{ name: string }>;
      const hasFriendly = tCols.some(c => c.name === 'friendlyId');
      if (!hasFriendly) {
        this.db.exec('ALTER TABLE tournaments ADD COLUMN friendlyId INTEGER');
      }
      const rows = this.db.prepare(
        "SELECT id, friendlyId FROM tournaments ORDER BY datetime(createdAt) ASC, id ASC"
      ).all() as Array<{ id: number; friendlyId: number | null }>;
      let seq = 1;
      const updateStmt = this.db.prepare('UPDATE tournaments SET friendlyId = ? WHERE id = ?');
      for (const r of rows) {
        if (r.friendlyId == null) {
          updateStmt.run(seq, r.id);
        }
        seq++;
      }
    } catch (e) {
      console.log('ℹ️ tournaments.friendlyId migration:', e instanceof Error ? e.message : 'unknown');
    }
  }

    private createSeedUser() {
        try {
            // Check if seed user already exists
            const existingUser = this.db.prepare('SELECT id FROM users WHERE username = ?').get('testuser');
        
            if (existingUser) {
                console.log('Seed user already exists');
                return;
            }  

            // Create seed user with verified email
            const stmt = this.db.prepare(`
                INSERT INTO users (
                    firstName, lastName, email, username, password, 
                    emailVerified, gamesWon, gamesLost
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);

            const result = stmt.run(
                'test',           // firstName
                'User',           // lastName
                'test@example.com',  // email
                'testuser',       // username
                '$2a$10$11CaXhwOlAB4VgvhIWBog./z1Pg3yY5KrtW3LYnkD9JuQ6Pt3.41u',               // password (empty for seed user)
                1,                // emailVerified (true)
                0,                // gamesWon
                0                 // gamesLost
            );

            console.log(`Seed user created with ID: ${result.lastInsertRowid}`);
        } catch (error) {
            console.error('Failed to create seed user:', error);
        }
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

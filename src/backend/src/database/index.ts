import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { Tournament, TournamentMatch, TournamentPlayer } from '../types/index';

const DATABASE_PATH = process.env.DATABASE_PATH || "./app/database/database.db";
const DATABASE_DIR = path.dirname(DATABASE_PATH);

export interface User {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
    username: string;
    password: string;
    avatar: string;
    googleId: string;
    emailVerified: boolean;
    twoFactorEnabled: boolean;
    gamesWon: number;
    gamesLost: number;
    createdAt: string;
    updatedAt: string;
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

export interface Player {
    id: number;
    name: string;
    gameId: number;
    pos: number;
    score: number;
    connectionStatus: string;
    lastActivity: string;
}

export interface GameState {
    id: number;
    gameId: number;
    players: Player[];
    
    ballPosX: number;
    ballPosY: number;
    ballVelX: number;
    ballVelY: number;
    
    mode: string;
    lastContact: number;
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

export interface EmailVerification {
    id: number;
    userId: number;
    email: string;
    verificationCode: string;
    status: 'pending' | 'verified' | 'expired';
    createdAt: string;
    expiresAt: string;
}

export interface TwoFactorVerification {
    id: number;
    userId: number;
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

export interface GameInvitation {
    id: number;
    fromUserId: number;
    toUserId: number;
    roomId: string;
    status: 'pending' | 'accepted' | 'rejected' | 'expired';
    createdAt: string;
    expiresAt: string;
}

export interface TournamentArchiveEntry {
	tournamentId: number;
	players: TournamentPlayer[];//maybe simplify?
	matches: any[];//maybe simplify?
	champion: TournamentPlayer | null;
	createdAt: string;
	startedAt?: string;
	endedAt?: string;
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
        // SQLite binding compatibility: convert undefined -> null, booleans -> 1/0
        const email = userData.email ?? null;
        const username = userData.username ?? null;
        const avatar = userData.avatar ?? 'https://raw.githubusercontent.com/Schmitzi/webserv/refs/heads/main/local/images/seahorse.jpg';
        const googleId = userData.googleId ?? null;
        const gamesWon = userData.gamesWon ?? 0;
        const gamesLost = userData.gamesLost ?? 0;
        const emailVerified = userData.emailVerified === true ? 1 : (userData.emailVerified === false ? 0 : 0);

        const result = stmt.run(
            userData.firstName,
            userData.lastName,
            email,
            username,
            password,
            avatar,
            googleId,
            gamesWon,
            gamesLost,
            emailVerified
        );
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
                updatedAt = CURRENT_TIMESTAMP
            WHERE id = ?
        `);
        
        // If won is true, increment gamesWon, otherwise increment gamesLost
        const result = stmt.run(won ? 1 : 0, won ? 0 : 1, userId);
        
        if (result.changes === 0) {
            return undefined;
        }
        
        return this.getUserById(userId);
    }

    updateUser(id: number, userData: Partial<{ firstName: string; lastName: string; email?: string; username?: string; emailVerified?: boolean; avatar?: string, twoFactorEnabled?: boolean }>): User | undefined {
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
        
        if (userData.avatar !== undefined) {
            fields.push('avatar = ?');
            values.push(userData.avatar || 'https://raw.githubusercontent.com/Schmitzi/webserv/refs/heads/main/local/images/seahorse.jpg');
        }

        if (userData.twoFactorEnabled !== undefined) {
            fields.push('twoFactorEnabled = ?');
            values.push(userData.twoFactorEnabled ? 1 : 0);
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
        const games = stmt.all() as Game[];
    
        // Parse JSON fields
        return games.map(game => ({
            ...game,
            players: game.players ? (typeof game.players === 'string' ? JSON.parse(game.players) : game.players) : [],
            points: game.points ? (typeof game.points === 'string' ? JSON.parse(game.points) : game.points) : []
        }));
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

class TwoFactorVerificationDatabaseManager {
    private db: Database.Database;

    constructor(database: Database.Database) {
        this.db = database;
    }

    // Create 2FA verification request
    createVerificationRequest(userId: number, verificationCode: string): TwoFactorVerification {
        // Set expiration to 10 minutes from now
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      
        const stmt = this.db.prepare(`
            INSERT INTO two_factor_verifications (userId, verificationCode, status, expiresAt) 
            VALUES (?, ?, 'pending', ?)
        `);
      
        const result = stmt.run(userId, verificationCode, expiresAt);
        return this.getVerificationById(result.lastInsertRowid as number)!;
    }

    getVerificationById(id: number): TwoFactorVerification | undefined {
        const stmt = this.db.prepare('SELECT * FROM two_factor_verifications WHERE id = ?');
        return stmt.get(id) as TwoFactorVerification | undefined;
    }

    getVerificationByCode(verificationCode: string): TwoFactorVerification | undefined {
        const stmt = this.db.prepare('SELECT * FROM two_factor_verifications WHERE verificationCode = ? AND status = "pending"');
        return stmt.get(verificationCode) as TwoFactorVerification | undefined;
    }

    getPendingVerification(userId: number): TwoFactorVerification | undefined {
        const stmt = this.db.prepare(`
            SELECT * FROM two_factor_verifications 
            WHERE userId = ? AND status = 'pending'
            AND datetime(expiresAt) > datetime('now')
            ORDER BY createdAt DESC LIMIT 1
        `);
        return stmt.get(userId) as TwoFactorVerification | undefined;
    }

    verify2FA(verificationCode: string, userId: number): TwoFactorVerification | undefined {
        const stmt = this.db.prepare(`
            UPDATE two_factor_verifications 
            SET status = 'verified' 
            WHERE verificationCode = ? AND userId = ? AND status = 'pending'
            AND datetime(expiresAt) > datetime('now')
        `);
      
        const result = stmt.run(verificationCode, userId);
        if (result.changes === 0) return undefined;
      
        return this.db.prepare(
            'SELECT * FROM two_factor_verifications WHERE verificationCode = ? AND userId = ?'
        ).get(verificationCode, userId) as TwoFactorVerification | undefined;
    }

    cleanupExpiredVerifications(): void {
        const stmt = this.db.prepare(`
            UPDATE two_factor_verifications 
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

    /* ---------------------- TOURNAMENTS ---------------------- */    
    createTournament(data: Partial<Tournament>): Tournament {
        try {
            const fields: string[] = [];
            const values: any[] = [];

            for (const key of Object.keys(data) as (keyof Tournament)[]) {
                const v = data[key];
                if (v !== undefined) {
                    fields.push(key);
                    const value = (key === 'players' || key === 'allMatches' || key === 'matchQueue' || key === 'curM')
                        ? JSON.stringify(v)
                        : v;
                    values.push(value);
                }
            }

            let rowId: number;
            if (fields.length === 0) {
                const result = this.db.prepare('INSERT INTO tournaments DEFAULT VALUES').run();
                rowId = result.lastInsertRowid as number;
            } else {
                const placeholders = fields.map(() => '?').join(', ');
                const sql = `INSERT INTO tournaments (${fields.join(', ')}) VALUES (${placeholders})`;
                const result = this.db.prepare(sql).run(...values);
                rowId = result.lastInsertRowid as number;
            }
            let t = this.getTournamentById(rowId);
            if (!t) {
                console.debug('[Tournament] Tournament not found');
                return null as any;
            }
            t = this.hydrateTournament(t);
            if (!t) {
                console.debug('[Tournament] hydrateTournament failed');
                return null as any;
            }
            return t;
        } catch (error) {
            console.error('Error creating tournament:', error);
            return null as any;
        }
    }

    deleteTournament(id: number): boolean {
        try {
            const result = this.db.prepare('DELETE FROM tournaments WHERE id = ?').run(id);
            return result.changes > 0;
        } catch (error) {
            console.error('Error deleting tournament:', error);
            return false;
        }
    }

    getTournamentById(id: number): Tournament | null {
        try {
            const tournament = this.db.prepare('SELECT * FROM tournaments WHERE id = ?').get(id) as Tournament;
            return this.hydrateTournament(tournament);
        } catch (error) {
            console.error('Error getting tournament:', error);
            return null;
        }
    }

    getAllTournaments(): Tournament[] {
        try {
            const tournaments = this.db.prepare('SELECT * FROM tournaments ORDER BY createdAt DESC').all() as Tournament[];
            return tournaments.map(t => this.hydrateTournament(t)).filter(t => t !== null) as Tournament[];
        } catch (error) {
            console.error('Error getting all tournaments:', error);
            return [];
        }
    }

    updateTournament(id: number, data: Partial<Tournament>): Tournament | null {
        try {
            if (!this.getTournamentById(id)) return null;
            
            for (const key of Object.keys(data) as (keyof Tournament)[]) {
                if (data[key] !== undefined) {
                    const value = (key === 'players' || key === 'allMatches' || key === 'matchQueue' || key === 'curM')
                        ? JSON.stringify(data[key])
                        : data[key];
                    this.db.prepare(`UPDATE tournaments SET ${key} = ? WHERE id = ?`).run(value, id);
                }
            }
            
            return this.hydrateTournament(this.getTournamentById(id));
        } catch (error) {
            console.error('Error updating tournament:', error);
            return null;
        }
    }

    hydrateTournament(t: any): Tournament | null {
        if (!t) return null;
        
        try {
            if (typeof t.players === 'string')
                t.players = JSON.parse(t.players);
            if (typeof t.allMatches === 'string')
                t.allMatches = JSON.parse(t.allMatches);
            if (typeof t.matchQueue === 'string')
                t.matchQueue = JSON.parse(t.matchQueue);
            if (typeof t.curM === 'string')
                t.curM = JSON.parse(t.curM);
            const players = this.getAllPlayers(t.id);
            if (players.length > 0)
                t.players = players;
            const matches = this.getAllMatches(t.id);
            if (matches.length > 0)
                t.allMatches = matches;
            const mqueue = t.allMatches.filter((m: TournamentMatch) => m.round === t.round);
            if (mqueue.length > 0)
                t.matchQueue = mqueue;
            t.curM = this.hydrateMatch(t.curM);
            return t as Tournament;
        } catch (error) {
            console.error('Error hydrating tournament:', error);
            return t;
        }
    }

    /* ---------------------- TOURNAMENT PLAYERS ---------------------- */
    createPlayer(p: Partial<TournamentPlayer>): TournamentPlayer | null {
        try {
            if (p.tournamentId === undefined)
                throw new Error('tournamentId is required to create a tournament player');
            if (p.tpt === undefined)
                throw new Error('tpt is required to create a tournament player');

            const fields: string[] = [];
            const values: any[] = [];
            for (const key of Object.keys(p) as (keyof TournamentPlayer)[]) {
                const v = p[key];
                if (v !== undefined) {
                    fields.push(key);
                    values.push(typeof v === 'boolean' ? (v ? 1 : 0) : v);
                }
            }
            const placeholders = fields.map(() => '?').join(', ');
            const sql = `INSERT INTO t_players (${fields.join(', ')}) VALUES (${placeholders})`;
            const result = this.db.prepare(sql).run(...values);
            return this.hydratePlayer(this.getPlayerById(result.lastInsertRowid as number));
        } catch (error) {
            console.error('Error creating player:', error);
            return null;
        }
    }
    
    deletePlayer(id: number): boolean {
        try {
            const result = this.db.prepare('DELETE FROM t_players WHERE id = ?').run(id);
            return result.changes > 0;
        } catch (error) {
            console.error('Error deleting player:', error);
            return false;
        }
    }
    
    getPlayerById(id: number): TournamentPlayer | null {
        try {
            const player = this.db.prepare('SELECT * FROM t_players WHERE id = ?').get(id) as TournamentPlayer;
            return player || null;
        } catch (error) {
            console.error('Error getting player:', error);
            return null;
        }
    }

    getAllPlayers(tId: number): TournamentPlayer[] {
        try {
            const players = this.db.prepare('SELECT * FROM t_players WHERE tournamentId = ?').all(tId) as TournamentPlayer[];
            return players.map(p => this.hydratePlayer(p)).filter(p => p !== null) as TournamentPlayer[];
        } catch (error) {
            console.error('Error getting all players:', error);
            return [];
        }
    }
    
    updatePlayer(data: Partial<TournamentPlayer>): TournamentPlayer | null {
        try {
            if (!data.id)
                throw new Error('Player ID is required for update');
            if (!this.getPlayerById(data.id))
                return null;
            
            for (const key of Object.keys(data) as (keyof TournamentPlayer)[]) {
                if (data[key] !== undefined) {
                    this.db.prepare(`UPDATE t_players SET ${key} = ? WHERE id = ?`)
                        .run(typeof data[key] === 'boolean' ? (data[key] ? 1 : 0) : data[key], data.id);
                }
            }
            return this.hydratePlayer(this.getPlayerById(data.id));
        } catch (error) {
            console.error('Error updating player:', error);
            return null;
        }
    }

    updateAllPlayers(data: TournamentPlayer[]): TournamentPlayer[] {
        const results: TournamentPlayer[] = [];
        data.forEach((p) => {
            const updated = this.updatePlayer(p);
            if (updated) results.push(updated);
        });
        return results;
    }

    hydratePlayer(player: any): TournamentPlayer | null {
        if (!player) return null;
        try {
            if (typeof player.eliminated === 'number')
                player.eliminated = player.eliminated === 1 ? true : false;
            if (typeof player.isReady === 'number')
                player.isReady = player.isReady === 1 ? true : false;
            return player as TournamentPlayer;
        } catch (error) {
            console.error('Error hydrating player:', error);
            return null;
        }
    }

    /* ---------------------- TOURNAMENT MATCHES ---------------------- */
    createMatch(data: Partial<TournamentMatch>): TournamentMatch | null {
        try {
            if (!data.tournamentId)
                throw new Error('tournamentId is required to create a match');
            const fields: string[] = [];
            const values: any[] = [];

            for (const key of Object.keys(data) as (keyof TournamentMatch)[]) {
                if (data[key] !== undefined) {
                    fields.push(key);
                    if (key === 'p1' || key === 'p2' || key === 'room' || key === 'gameState')
                        values.push(JSON.stringify(data[key]));
                    else {
                        const v = data[key];
                        values.push(typeof v === 'boolean' ? (v ? 1 : 0) : v);
                    }
                }
            }
            const placeholders = fields.map(() => '?').join(', ');
            const sql = `INSERT INTO t_matches (${fields.join(', ')}) VALUES (${placeholders})`;
            const result = this.db.prepare(sql).run(...values);
            return this.hydrateMatch(this.getMatchById(result.lastInsertRowid as number));
        } catch (error) {
            console.error('Error creating match:', error);
            return null;
        }
    }
    
    deleteMatch(id: number): boolean {
        try {
            const result = this.db.prepare('DELETE FROM t_matches WHERE id = ?').run(id);
            return result.changes > 0;
        } catch (error) {
            console.error('Error deleting match:', error);
            return false;
        }
    }

    getMatchById(id: number): TournamentMatch | null {
        try {
            const match = this.db.prepare('SELECT * FROM t_matches WHERE id = ?').get(id) as TournamentMatch;
            let m = this.hydrateMatch(match);
            return m;
        } catch (error) {
            console.error('Error getting match:', error);
            return null;
        }
    }

    getAllMatches(tId: number): TournamentMatch[] {
        try {
            const matches = this.db.prepare('SELECT * FROM t_matches WHERE tournamentId = ? ORDER BY id').all(tId) as TournamentMatch[];
            return matches.map(m => this.hydrateMatch(m)).filter(m => m !== null) as TournamentMatch[];
        } catch (error) {
            console.error('Error getting all matches:', error);
            return [];
        }
    }

    updateMatch(data: Partial<TournamentMatch>): TournamentMatch | null {
        try {
            if (!data.id)
                throw new Error('Match ID is required for update');
            if (!this.getMatchById(data.id))
                return null;
            
            for (const key of Object.keys(data) as (keyof TournamentMatch)[]) {
                if (data[key] !== undefined) {
                    const value = (key === 'p1' || key === 'p2' || key === 'room' || key === 'gameState') ? JSON.stringify(data[key])
                        : (typeof data[key] === 'boolean' ? (data[key] ? 1 : 0) : data[key]);
                    this.db.prepare(`UPDATE t_matches SET ${key} = ? WHERE id = ?`).run(value, data.id);
                }
            }
            return this.hydrateMatch(this.getMatchById(data.id));
        } catch (error) {
            console.error('Error updating match:', error);
            return null;
        }
    }

    updateAllMatches(data: TournamentMatch[]): TournamentMatch[] {
        const results: TournamentMatch[] = [];
        data.forEach((m) => {
            const updated = this.updateMatch(m);
            if (updated) results.push(updated);
        });
        return results;
    }

    hydrateMatch(match: any): TournamentMatch | null {
        if (!match) return null;
        try {
            if (typeof match.p1 === 'string')
                match.p1 = match.p1 ? JSON.parse(match.p1) : undefined;
            if (typeof match.p2 === 'string')
                match.p2 = match.p2 ? JSON.parse(match.p2) : undefined;
            if (typeof match.room === 'string')
                match.room = match.room ? JSON.parse(match.room) : null;
			if (typeof match.gameState === 'string')
				match.gameState = match.gameState ? JSON.parse(match.gameState) : undefined;
            return match;
        } catch (error) {
            console.error('Error hydrating match:', error);
            return match;
        }
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
    public twoFactorVerifications: TwoFactorVerificationDatabaseManager;
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
        this.twoFactorVerifications = new TwoFactorVerificationDatabaseManager(this.db);
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
        this.initializeTwoFactorVerificationsTable();
        this.initializeUsernameChangesTable();
        this.initializeTournamentTables();
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
                twoFactorEnabled BOOLEAN DEFAULT FALSE,
                gamesWon INTEGER DEFAULT 0,
                gamesLost INTEGER DEFAULT 0,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
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
				players JSON DEFAULT '{}',
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

    private initializeTwoFactorVerificationsTable() {
        const createTwoFactorVerificationsTable = `
            CREATE TABLE IF NOT EXISTS two_factor_verifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                userId INTEGER NOT NULL,
                verificationCode TEXT NOT NULL,
                status TEXT NOT NULL CHECK(status IN ('pending', 'verified', 'expired')) DEFAULT 'pending',
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                expiresAt DATETIME NOT NULL,
                FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
            )
        `;
      
        this.db.exec(createTwoFactorVerificationsTable);
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

    private initializeTournamentTables() {
        const createTournamentT = `
            CREATE TABLE IF NOT EXISTS tournaments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                status TEXT NOT NULL DEFAULT 'setup',
                players JSON DEFAULT '[]',
                allMatches JSON DEFAULT '[]',
                matchQueue JSON DEFAULT '[]',
                curM JSON DEFAULT '{}',
                round INTEGER DEFAULT 0,
                championId INTEGER DEFAULT NULL,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                startedAt DATETIME DEFAULT NULL,
                endedAt DATETIME DEFAULT NULL,
                FOREIGN KEY (championId) REFERENCES t_players(id) ON DELETE SET NULL
            )
        `;
        this.db.exec(createTournamentT);

        const createTPlayerT = `
            CREATE TABLE IF NOT EXISTS t_players (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tournamentId INTEGER NOT NULL,
                tpt TEXT NOT NULL,
                name TEXT,
                userId INTEGER DEFAULT NULL,
                isReady BOOLEAN DEFAULT FALSE,
                score INTEGER DEFAULT 0,
                eliminated BOOLEAN DEFAULT FALSE,
                socketId TEXT,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tournamentId) REFERENCES tournaments(id) ON DELETE CASCADE,
                FOREIGN KEY (userId) REFERENCES users(id) ON DELETE SET NULL
            )
        `;
        this.db.exec(createTPlayerT);

        const createTMatchT = `
            CREATE TABLE IF NOT EXISTS t_matches (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tournamentId INTEGER NOT NULL,
                gameId INTEGER,
                room JSON DEFAULT '{}',
				gameState JSON DEFAULT '{}',
                status TEXT NOT NULL DEFAULT 'setup',
                isBye BOOLEAN DEFAULT FALSE,
                p1 JSON DEFAULT '{}',
                p2 JSON DEFAULT '{}',
                winnerId INTEGER DEFAULT NULL,
                round INTEGER DEFAULT 0,
                roundIdx INTEGER DEFAULT 0,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                startedAt DATETIME DEFAULT NULL,
                endedAt DATETIME DEFAULT NULL,
                FOREIGN KEY (tournamentId) REFERENCES tournaments(id) ON DELETE CASCADE,
                FOREIGN KEY (gameId) REFERENCES games(id) ON DELETE SET NULL,
                FOREIGN KEY (winnerId) REFERENCES t_players(id) ON DELETE SET NULL
            )
        `;
        this.db.exec(createTMatchT);

        const createTArchiveT = `
            CREATE TABLE IF NOT EXISTS t_archive (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tournamentId INTEGER NOT NULL,
                players JSON DEFAULT '[]',
                matches JSON DEFAULT '[]',
                championId INTEGER,
                createdAt DATETIME,
                startedAt DATETIME,
                endedAt DATETIME,
                FOREIGN KEY (tournamentId) REFERENCES tournaments(id) ON DELETE CASCADE,
                FOREIGN KEY (championId) REFERENCES t_players(id) ON DELETE SET NULL
            )
        `;
        this.db.exec(createTArchiveT);

        this.createTriggers();
    }
    
    private createTriggers() {
        // tournament players summary
        const TPlayersSum = `
            SELECT COALESCE(json_group_array(
                json_object(
                    'id', id,
                    'tournamentId', tournamentId,
                    'tpt', tpt,
                    'name', name,
                    'userId', userId,
                    'isReady', isReady,
                    'score', score,
                    'eliminated', eliminated,
                    'socketId', socketId,
                    'createdAt', createdAt,
                    'updatedAt', updatedAt
                )
            ), '[]')
        `;

        //t_players_after_insert
        this.db.exec(`
            CREATE TRIGGER IF NOT EXISTS t_players_after_insert
            AFTER INSERT ON t_players
            BEGIN
                UPDATE tournaments
                SET players = (${TPlayersSum} FROM t_players WHERE tournamentId = NEW.tournamentId)
                WHERE id = NEW.tournamentId;
            END;
        `);
        //t_players_after_update
        this.db.exec(`
            CREATE TRIGGER IF NOT EXISTS t_players_after_update
            AFTER UPDATE ON t_players
            BEGIN
                UPDATE tournaments
                SET players = (${TPlayersSum} FROM t_players WHERE tournamentId = NEW.tournamentId)
                WHERE id = NEW.tournamentId;
            END;
        `);
        //t_players_after_delete
        this.db.exec(`
            CREATE TRIGGER IF NOT EXISTS t_players_after_delete
            AFTER DELETE ON t_players
            BEGIN
                UPDATE tournaments
                SET players = (${TPlayersSum} FROM t_players WHERE tournamentId = OLD.tournamentId)
                WHERE id = OLD.tournamentId;
            END;
        `);

        // tournament matches summary
        const TMatchesSum = `
            SELECT COALESCE(json_group_array(
                json_object(
                    'id', id,
                    'tournamentId', tournamentId,
                    'gameId', gameId,
					'room', room,
					'gameState', gameState,
                    'status', status,
                    'isBye', isBye,
                    'p1', json(p1),
                    'p2', json(p2),
                    'winnerId', winnerId,
                    'round', round,
                    'roundIdx', roundIdx,
                    'createdAt', createdAt,
                    'startedAt', startedAt,
                    'endedAt', endedAt
                )
            ), '[]')
        `;

        //t_matches_after_insert
        this.db.exec(`
            CREATE TRIGGER IF NOT EXISTS t_matches_after_insert
            AFTER INSERT ON t_matches
            BEGIN
                UPDATE tournaments
                SET allMatches = (${TMatchesSum} FROM t_matches WHERE tournamentId = NEW.tournamentId)
                WHERE id = NEW.tournamentId;
            END;
        `);

        //t_matches_after_update
        this.db.exec(`
            CREATE TRIGGER IF NOT EXISTS t_matches_after_update
            AFTER UPDATE ON t_matches
            BEGIN
                UPDATE tournaments
                SET allMatches = (${TMatchesSum} FROM t_matches WHERE tournamentId = NEW.tournamentId)
                WHERE id = NEW.tournamentId;
            END;
        `);

        //t_matches_after_delete
        this.db.exec(`
            CREATE TRIGGER IF NOT EXISTS t_matches_after_delete
            AFTER DELETE ON t_matches
            BEGIN
                UPDATE tournaments
                SET allMatches = (${TMatchesSum} FROM t_matches WHERE tournamentId = OLD.tournamentId)
                WHERE id = OLD.tournamentId;
            END;
        `);

        // TMatchArchive on tournament completion
        const TMatchArchive = `
            SELECT COALESCE(json_group_array(
                json_object(
                    'id', id,
                    'player1Id', json_extract(p1,'$.playerId'),
                    'player2Id', json_extract(p2,'$.playerId'),
                    'winnerId', winnerId,
                    'loserId',
                        CASE
                            WHEN winnerId IS NULL THEN NULL
                            WHEN winnerId = json_extract(p1,'$.playerId') THEN json_extract(p2,'$.playerId')
                            ELSE json_extract(p1,'$.playerId')
                        END,
                    'createdAt', createdAt,
                    'startedAt', startedAt,
                    'endedAt', endedAt
                )
            ), '[]')
            FROM t_matches
            WHERE id = NEW.id AND status = 'completed'
        `;

        //tournaments_after_update_completed
        this.db.exec(`
            CREATE TRIGGER IF NOT EXISTS tournaments_after_update_completed
            AFTER UPDATE ON tournaments
            WHEN NEW.status = 'completed'
              AND (OLD.status IS NULL OR OLD.status != 'completed')
              AND NEW.endedAt IS NOT NULL
              AND NEW.championId IS NOT NULL
            BEGIN
                INSERT INTO t_archive (
                    id, createdAt, startedAt, endedAt, players, matches, championId
                ) VALUES (
                    NEW.id,
                    NEW.createdAt,
                    NEW.startedAt,
                    NEW.endedAt,
                    NEW.players,
                    (${TMatchArchive}),
                    NEW.championId
                );
            END;
        `);

        //tournaments_after_delete
        this.db.exec(`
            CREATE TRIGGER IF NOT EXISTS tournaments_after_delete
            AFTER DELETE ON tournaments
            BEGIN
                DELETE FROM t_players WHERE tournamentId = OLD.id;
                DELETE FROM t_matches WHERE tournamentId = OLD.id;
                DELETE FROM t_archive WHERE tournamentId = OLD.id;
            END;
        `);
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
                    emailVerified, gamesWon, gamesLost, avatar
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            const result = stmt.run(
                'Test',           // firstName
                'User',           // lastName
                'test@example.com',  // email
                'testuser',       // username
                '$2a$10$11CaXhwOlAB4VgvhIWBog./z1Pg3yY5KrtW3LYnkD9JuQ6Pt3.41u',               // password (empty for seed user)
                1,                // emailVerified (true)
                0,                // gamesWon
                0,                 // gamesLost
                'https://raw.githubusercontent.com/Schmitzi/webserv/refs/heads/main/local/images/seahorse.jpg'            );

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
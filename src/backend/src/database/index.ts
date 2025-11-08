import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { Player, GameState } from '../../../shared/gameTypes';
import { Tournament, TournamentPlayer, TournamentMatch, MatchSummary } from '../../../shared/tournamentTypes';

const DATABASE_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'database', 'transcendence.db');
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
    gamesWon: number;
    gamesLost: number;
    createdAt: string;
    updatedAt: string;
}

export interface Game {
    id: number;
    status?: string;
    mode: string;
    points: any[];             
    players: Player[];         
    createdAt: string;
    startedAt: string;// | null;
    endedAt: string | null;
    winner: Player | null;   
    difficulty: string;
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

class TournamentDatabaseManager {//TODO
    private db: Database.Database;

    constructor(database: Database.Database) {
        this.db = database;
    }

    createTournament(): Tournament {
        const result = this.db.prepare(`INSERT INTO tournaments (matchDelay, status, createdAt, updatedAt) 
            VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`).run(3, 'idle');
        if (!result) throw new Error('Failed to create tournament');
        return this.getTournamentById(result.lastInsertRowid as number);
    }

    getAllTournaments(): Tournament[] {
        return this.db.prepare('SELECT * FROM tournaments ORDER BY createdAt DESC').all() as Tournament[];
    }

    getTournamentById(tId: number): Tournament {
       return this.db.prepare('SELECT * FROM tournaments WHERE tId = ?').get(tId) as Tournament;
    }

    deleteTournament(tId: number): void {
        this.db.prepare('DELETE FROM tournaments WHERE tId = ?').run(tId);
    }

    updateTournament(tId: number, data: Partial<Tournament>): Tournament {
        const x: any[] = [];

        if (data.status) x.push(`status = ${data.status}`);
        if (data.queue) x.push(`queue = ${JSON.stringify(data.queue)}`);
        if (data.curMatch && data.curMatch.matchId) x.push(`currentMatch = ${data.curMatch.matchId}`);
        if (data.nextMatches) x.push(`nextMatches = ${JSON.stringify(data.nextMatches)}`);
        if (data.matchHistory) x.push(`matchHistory = ${JSON.stringify(data.matchHistory)}`);
        if (data.startedAt) x.push(`startedAt = ${data.startedAt}`);
        if (data.finishedAt) x.push(`finishedAt = ${data.finishedAt}`);
        if (data.champion && data.champion.id) x.push(`championId = ${data.champion.id}`);
        x.push(`updatedAt = CURRENT_TIMESTAMP`);

        if (data.players) this.updateAllPlayers(tId, data.players);
        if (data.matches) this.updateAllMatches(tId, data.matches);
        if (x.length) this.db.prepare(`UPDATE tournaments SET ${x.join(', ')} WHERE tId = ?`).run(tId);
        return this.getTournamentById(tId);
    }

    getAllPlayers(tId: number): TournamentPlayer[] {
        return this.db.prepare('SELECT * FROM t_players WHERE tId = ?').all(tId) as TournamentPlayer[];
    }

    getPlayerById(tId: number, playerId: number): TournamentPlayer {
        return this.db.prepare('SELECT * FROM t_players WHERE tId = ? AND id = ?').get(tId, playerId) as TournamentPlayer;
    }

    deletePlayer(tId: number, playerId: number): void {
        this.db.prepare('DELETE FROM t_players WHERE tId = ? AND id = ?').run(tId, playerId);
    }

    addPlayer(tId: number, data: Partial<TournamentPlayer>) : TournamentPlayer {
        const x: any[] = [];

        x.push(`tId = ${tId}`);
        if (data.name !== undefined) x.push(`name = ${data.name}`);
        if (data.identity !== undefined) x.push(`identity = ${data.identity}`);
        if (data.user && data.user.id) x.push(`userId = ${data.user.id}`);
        if (data.tpt) x.push(`isType = ${data.tpt}`);
        if (data.isReady !== undefined) x.push(`isReady = ${data.isReady}`);

        this.db.prepare(`INSERT INTO t_players ${x.join(', ')}`).run();
        return this.db.prepare('SELECT * FROM t_players WHERE tId = ? ORDER BY id DESC LIMIT 1').get(tId) as TournamentPlayer;
    }

    updateAllPlayers(tId: number, data: TournamentPlayer[]): void {
        data.forEach((playerData) => {
            this.updatePlayer(tId, playerData.id, playerData);
        });
    }

    updatePlayer(tId: number, playerId: number, data: Partial<TournamentPlayer>): TournamentPlayer {
        const x: any[] = [];

        if (data.name !== undefined) x.push(`name = ${data.name}`);
        if (data.identity !== undefined) x.push(`identity = ${data.identity}`);
        if (data.user && data.user.id) x.push(`userId = ${data.user.id}`);
        if (data.tpt) x.push(`isType = ${data.tpt}`);
        if (data.isReady !== undefined) x.push(`isReady = ${data.isReady}`);
        if (data.pos !== undefined) x.push(`pos = ${data.pos}`);
        if (data.score !== undefined) x.push(`score = ${data.score}`);
        if (data.eliminated !== undefined) x.push(`eliminated = ${data.eliminated}`);
        if (data.wins !== undefined) x.push(`wins = ${data.wins}`);
        if (data.losses !== undefined) x.push(`losses = ${data.losses}`);
        if (data.connectionStatus !== undefined) x.push(`connectionStatus = ${data.connectionStatus}`);
        if (data.lastActivity !== undefined) x.push(`lastActivity = ${data.lastActivity}`);

        if (x.length === 0) return this.getPlayerById(tId, playerId);

        this.db.prepare(`UPDATE t_players SET ${x.join(', ')} WHERE tId = ? AND id = ?`).run(tId, playerId);
        return this.getPlayerById(tId, playerId);
    }

    createMatch(tId: number, p1: TournamentPlayer, p2: TournamentPlayer): TournamentMatch {
        const result = this.db.prepare(`INSERT INTO t_matches (tId, player1Id, player2Id, status, createdAt) 
            VALUES (?, ?, ?, 'pending', CURRENT_TIMESTAMP)`).run(tId, p1.id, p2.id);
        if (!result) throw new Error('Failed to create tournament match');
        return this.getMatchById(tId, result.lastInsertRowid as number);
    }

    getAllMatches(tId: number): TournamentMatch[] {
        return this.db.prepare('SELECT * FROM t_matches WHERE tId = ? ORDER BY matchId').all(tId) as TournamentMatch[];
    }

    getMatchById(tId: number, matchId: number): TournamentMatch {
        return this.db.prepare('SELECT * FROM t_matches WHERE matchId = ? AND tId = ?').get(matchId, tId) as TournamentMatch;
    }

    deleteMatch(tId: number, matchId: number): void {
        this.db.prepare('DELETE FROM t_matches WHERE matchId = ? AND tId = ?').run(matchId, tId);
    }

    updateAllMatches(tId: number, data: TournamentMatch[]): void {
        data.forEach((matchData) => {
            this.updateMatch(tId, matchData.matchId, matchData);
        });
    }

    updateMatch(tId: number, matchId: number, data: Partial<TournamentMatch>): TournamentMatch {
        const x: any[] = [];
        
        if (data.roomId !== undefined) x.push(`roomId = ${data.roomId}`);
        if (data.status) x.push(`status = ${data.status}`);
        if (data.gameId) x.push(`gameId = ${data.gameId}`);
        if (data.winner && data.winner.id) x.push(`winnerId = ${data.winner.id}`);
        if (data.loser && data.loser.id) x.push(`loserId = ${data.loser.id}`);
        if (data.startedAt !== undefined) x.push(`startedAt = ${data.startedAt}`);
        if (data.finishedAt !== undefined) x.push(`finishedAt = ${data.finishedAt}`);
        if (data.round !== undefined) x.push(`round = ${data.round}`);
        if (data.indexInRound !== undefined) x.push(`indexInRound = ${data.indexInRound}`);
        if (data.nextMatchId !== undefined) x.push(`nextMatchId = ${data.nextMatchId}`);
        if (data.nextSlot !== undefined) x.push(`nextSlot = ${data.nextSlot}`);

        if (x.length === 0) return this.getMatchById(tId, matchId);

        if (data.p1) this.updatePlayer(tId, data.p1.id, data.p1);
        if (data.p2) this.updatePlayer(tId, data.p2.id, data.p2);        
        this.db.prepare(`UPDATE t_matches SET ${x.join(', ')} WHERE matchId = ? AND tId = ?`).run(matchId, tId);
        return this.getMatchById(tId, matchId);
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
        const createTournamentsTable = `
            CREATE TABLE IF NOT EXISTS tournaments (
                tId INTEGER PRIMARY KEY AUTOINCREMENT,
                status TEXT NOT NULL CHECK(status IN ('setup', 'idle', 'in_progress', 'paused', 'completed')) DEFAULT 'idle',
                players JSON DEFAULT '[]',
                queue JSON DEFAULT '[]',
                matches JSON DEFAULT '[]',
                currentMatch INTEGER DEFAULT 0,
                nextMatches JSON DEFAULT '[]',
                matchHistory JSON DEFAULT '[]',
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                startedAt DATETIME,
                finishedAt DATETIME,
                updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                championId INTEGER,
                matchDelay INTEGER DEFAULT 3,
                FOREIGN KEY (championId) REFERENCES t_players(id),
                FOREIGN KEY (currentMatch) REFERENCES t_matches(matchId)
            )
        `;
        this.db.exec(createTournamentsTable);

        const createTournamentPlayersTable = `
            CREATE TABLE IF NOT EXISTS t_players (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                tId INTEGER NOT NULL,
                identity TEXT,
                userId INTEGER,
                isType TEXT NOT NULL CHECK(isType IN ('host', 'ai', 'local', 'remote', '__BYE__')),
                isReady BOOLEAN DEFAULT FALSE,
                pos INTEGER,
                score INTEGER DEFAULT 0,
                eliminated BOOLEAN DEFAULT FALSE,
                wins INTEGER DEFAULT 0,
                losses INTEGER DEFAULT 0,
                connectionStatus TEXT,
                lastActivity DATETIME,
                FOREIGN KEY (tId) REFERENCES tournaments(tId) ON DELETE CASCADE,
                FOREIGN KEY (userId) REFERENCES users(id) ON DELETE SET NULL
            )
        `;
        this.db.exec(createTournamentPlayersTable);

        const createTournamentMatchesTable = `
            CREATE TABLE IF NOT EXISTS t_matches (
                matchId INTEGER PRIMARY KEY AUTOINCREMENT,
                tId INTEGER NOT NULL,
                roomId TEXT,
                status TEXT NOT NULL CHECK(status IN ('pending', 'ready', 'countdown', 'in_progress', 'completed')) DEFAULT 'pending',
                gameId INTEGER,
                player1Id INTEGER,
                player2Id INTEGER,
                winnerId INTEGER,
                loserId INTEGER,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                startedAt DATETIME,
                finishedAt DATETIME,
                round INTEGER,
                indexInRound INTEGER,
                nextMatchId INTEGER,
                nextSlot TEXT CHECK(nextSlot IN ('p1', 'p2')),
                FOREIGN KEY (gameId) REFERENCES games(id) ON DELETE SET NULL,
                FOREIGN KEY (player1Id) REFERENCES t_players(id) ON DELETE SET NULL,
                FOREIGN KEY (player2Id) REFERENCES t_players(id) ON DELETE SET NULL,
                FOREIGN KEY (winnerId) REFERENCES t_players(id) ON DELETE SET NULL,
                FOREIGN KEY (loserId) REFERENCES t_players(id) ON DELETE SET NULL,
                FOREIGN KEY (tId) REFERENCES tournaments(tId) ON DELETE CASCADE
            )
        `;
        this.db.exec(createTournamentMatchesTable);

        const createTournamentArchiveTable = `
            CREATE TABLE IF NOT EXISTS t_archive (
                archiveId INTEGER PRIMARY KEY AUTOINCREMENT,
                tId INTEGER NOT NULL,
                createdAt DATETIME NOT NULL,
                startedAt DATETIME NOT NULL,
                finishedAt DATETIME NOT NULL,
                players JSON DEFAULT '[]',
                matches JSON DEFAULT '[]',
                championId INTEGER,
                FOREIGN KEY (tId) REFERENCES tournaments(tId) ON DELETE CASCADE,
                FOREIGN KEY (championId) REFERENCES t_players(id) ON DELETE SET NULL
            )
        `;
        this.db.exec(createTournamentArchiveTable);

        const createMatchSummaryTable = `
            CREATE TABLE IF NOT EXISTS t_match_summaries (
                summaryId INTEGER PRIMARY KEY AUTOINCREMENT,
                tId INTEGER NOT NULL,
                matchId INTEGER NOT NULL,
                player1Id INTEGER,
                player2Id INTEGER,
                winnerId INTEGER,
                loserId INTEGER,
                createdAt DATETIME NOT NULL,
                startedAt DATETIME,
                finishedAt DATETIME,
                FOREIGN KEY (tId) REFERENCES tournaments(tId) ON DELETE CASCADE,
                FOREIGN KEY (player1Id) REFERENCES t_players(id) ON DELETE SET NULL,
                FOREIGN KEY (player2Id) REFERENCES t_players(id) ON DELETE SET NULL,
                FOREIGN KEY (winnerId) REFERENCES t_players(id) ON DELETE SET NULL,
                FOREIGN KEY (loserId) REFERENCES t_players(id) ON DELETE SET NULL
            )
        `;
        this.db.exec(createMatchSummaryTable);
        this.createTriggers();
    }
    
    private createTriggers() {

        const TPlayerT = `SELECT json_group_array(
            json_object(
                'id', id,
                'name', name,
                'identity', identity,
                'userId', userId,
                'isType', isType,
                'isReady', isReady,
                'pos', pos,
                'score', score,
                'eliminated', eliminated,
                'wins', wins,
                'losses', losses,
                'connectionStatus', connectionStatus,
                'lastActivity', lastActivity
            )
        ) FROM t_players WHERE tId = NEW.tId`;

        this.db.exec(`CREATE TRIGGER IF NOT EXISTS trigger_addTPlayerT AFTER INSERT ON t_players
            BEGIN UPDATE tournaments SET players = (${TPlayerT}) WHERE tId = NEW.tId; END;`);
        this.db.exec(`CREATE TRIGGER IF NOT EXISTS trigger_updateTPlayerT AFTER UPDATE ON t_players
            BEGIN UPDATE tournaments SET players = (${TPlayerT}) WHERE tId = NEW.tId; END;`);
        this.db.exec(`CREATE TRIGGER IF NOT EXISTS trigger_removeTPlayerT AFTER DELETE ON t_players
            BEGIN UPDATE tournaments SET players = (${TPlayerT}) WHERE tId = OLD.tId; END;`);

        const TMatchesT = `SELECT json_group_array(
            json_object(
                'matchId', matchId,
                'tId', tId,
                'roomId', roomId,
                'status', status,
                'p1', player1Id,
                'p2', player2Id,
                'winner', winnerId,
                'loser', loserId,
                'createdAt', createdAt,
                'startedAt', startedAt,
                'finishedAt', finishedAt,
                'round', round,
                'indexInRound', indexInRound,
                'nextMatchId', nextMatchId,
                'nextSlot', nextSlot
            )
        ) FROM t_matches WHERE tId = NEW.tId`;

        this.db.exec(`CREATE TRIGGER IF NOT EXISTS trigger_addTMatchT AFTER INSERT ON t_matches
            BEGIN UPDATE tournaments SET matches = (${TMatchesT}) WHERE tId = NEW.tId; END;`);
        this.db.exec(`CREATE TRIGGER IF NOT EXISTS trigger_updateTMatchT AFTER UPDATE ON t_matches
            BEGIN UPDATE tournaments SET matches = (${TMatchesT}) WHERE tId = NEW.tId; END;`);
        this.db.exec(`CREATE TRIGGER IF NOT EXISTS trigger_removeTMatchT AFTER DELETE ON t_matches
            BEGIN UPDATE tournaments SET matches = (${TMatchesT}) WHERE tId = OLD.tId; END;`);

        const TMatchSummary = `SELECT json_group_array(
            json_object(
                'matchId', matchId,
                'player1Id', player1Id,
                'player2Id', player2Id,
                'winnerId', winnerId,
                'loserId', loserId,
                'createdAt', createdAt,
                'startedAt', startedAt,
                'finishedAt', finishedAt
            )
        ) FROM t_matches WHERE tId = NEW.tId AND status = 'completed'`;

        this.db.exec(`CREATE TRIGGER IF NOT EXISTS trigger_updateHistory AFTER UPDATE ON tournaments
            WHEN NEW.status = 'completed' AND NEW.status IS NOT OLD.status AND NEW.finishedAt IS NOT OLD.finishedAt AND NEW.championId IS NOT NULL
            BEGIN 
                INSERT INTO t_archive (tId, createdAt, startedAt, finishedAt, players, matches, championId)
                VALUES (
                    NEW.tId,
                    NEW.createdAt,
                    NEW.startedAt,
                    NEW.finishedAt,
                    NEW.players,
                    (${TMatchSummary}),
                    NEW.championId
                );
            END;`);

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

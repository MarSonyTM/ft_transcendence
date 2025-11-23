const Database = require('better-sqlite3');
const path = require('path');

const DATABASE_PATH = process.env.DATABASE_PATH || path.join(__dirname, '..', 'database', 'database.db');

console.log('🗑️  CLEARING ALL DATA FROM DATABASE');
console.log('Connecting to database at:', DATABASE_PATH);

const db = new Database(DATABASE_PATH);

try {
    console.log('\n⚠️  WARNING: This will delete ALL data including user accounts!\n');
    
    // Delete in order to respect foreign key constraints
    
    // 1. Delete all game states first (foreign key to games)
    try {
        const deleteGameStates = db.prepare('DELETE FROM gameState');
        const gameStatesDeleted = deleteGameStates.run();
        console.log(`✓ Deleted ${gameStatesDeleted.changes} game states`);
    } catch (error) {
        console.log('⚠️  No gameState table or already empty');
    }
    
    // 2. Delete all players (foreign key to games and users)
    try {
        const deletePlayers = db.prepare('DELETE FROM players');
        const playersDeleted = deletePlayers.run();
        console.log(`✓ Deleted ${playersDeleted.changes} players`);
    } catch (error) {
        console.log('⚠️  No players table or already empty');
    }
    
    // 3. Delete all games (foreign key to users)
    try {
        const deleteGames = db.prepare('DELETE FROM games');
        const gamesDeleted = deleteGames.run();
        console.log(`✓ Deleted ${gamesDeleted.changes} games`);
    } catch (error) {
        console.log('⚠️  No games table or already empty');
    }
    
    // 4. Delete all email verifications (foreign key to users)
    try {
        const deleteEmailVerifications = db.prepare('DELETE FROM emailVerifications');
        const emailVerificationsDeleted = deleteEmailVerifications.run();
        console.log(`✓ Deleted ${emailVerificationsDeleted.changes} email verifications`);
    } catch (error) {
        console.log('⚠️  No emailVerifications table or already empty');
    }
    
    // 5. Delete all username changes (foreign key to users)
    try {
        const deleteUsernameChanges = db.prepare('DELETE FROM usernameChanges');
        const usernameChangesDeleted = deleteUsernameChanges.run();
        console.log(`✓ Deleted ${usernameChangesDeleted.changes} username changes`);
    } catch (error) {
        console.log('⚠️  No usernameChanges table or already empty');
    }
    
    // 6. Delete all friends relationships (foreign key to users)
    try {
        const deleteFriends = db.prepare('DELETE FROM friends');
        const friendsDeleted = deleteFriends.run();
        console.log(`✓ Deleted ${friendsDeleted.changes} friend relationships`);
    } catch (error) {
        console.log('⚠️  No friends table or already empty');
    }
    
    // 7. Delete all sessions (foreign key to users)
    try {
        const deleteSessions = db.prepare('DELETE FROM sessions');
        const sessionsDeleted = deleteSessions.run();
        console.log(`✓ Deleted ${sessionsDeleted.changes} sessions`);
    } catch (error) {
        console.log('⚠️  No sessions table or already empty');
    }
    
    // 8. Finally, delete all users
    try {
        const deleteUsers = db.prepare('DELETE FROM users');
        const usersDeleted = deleteUsers.run();
        console.log(`✓ Deleted ${usersDeleted.changes} users`);
    } catch (error) {
        console.log('⚠️  No users table or already empty');
    }
    
    console.log('\n✅ ALL DATA CLEARED SUCCESSFULLY!');
    console.log('🎯 Database is now completely empty and ready for fresh start.\n');
} catch (error) {
    console.error('❌ Error clearing data:', error);
    process.exit(1);
} finally {
    db.close();
}


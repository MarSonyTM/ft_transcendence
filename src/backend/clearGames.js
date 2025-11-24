const Database = require('better-sqlite3');
const path = require('path');

const DATABASE_PATH = process.env.DATABASE_PATH || path.join(__dirname, '..', 'database', 'database.db');

console.log('Connecting to database at:', DATABASE_PATH);

const db = new Database(DATABASE_PATH);

try {
    console.log('Clearing all game data...');
    
    // Delete all game states first (foreign key constraint)
    const deleteGameStates = db.prepare('DELETE FROM gameState');
    const gameStatesDeleted = deleteGameStates.run();
    console.log(`✓ Deleted ${gameStatesDeleted.changes} game states`);
    
    // Delete all players (foreign key constraint)
    const deletePlayers = db.prepare('DELETE FROM players');
    const playersDeleted = deletePlayers.run();
    console.log(`✓ Deleted ${playersDeleted.changes} players`);
    
    // Delete all games
    const deleteGames = db.prepare('DELETE FROM games');
    const gamesDeleted = deleteGames.run();
    console.log(`✓ Deleted ${gamesDeleted.changes} games`);
    
    // Reset user game statistics
    const resetStats = db.prepare('UPDATE users SET gamesWon = 0, gamesLost = 0');
    const statsReset = resetStats.run();
    console.log(`✓ Reset game statistics for ${statsReset.changes} users`);
    
    console.log('\n✅ All game data cleared successfully!');
} catch (error) {
    console.error('❌ Error clearing game data:', error);
    process.exit(1);
} finally {
    db.close();
}


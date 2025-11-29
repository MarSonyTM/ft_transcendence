const Database = require('better-sqlite3');
const path = require('path');

const DATABASE_PATH = process.env.DATABASE_PATH || path.join(__dirname, '..', 'database', 'database.db');

console.log('Connecting to database at:', DATABASE_PATH);

const db = new Database(DATABASE_PATH);

try {
    console.log('🗑️  Clearing all statistics and game data...\n');
    
    // Delete tournament data first (foreign key constraints)
    try {
        const deleteTArchive = db.prepare('DELETE FROM t_archive');
        const tArchiveDeleted = deleteTArchive.run();
        console.log(`✓ Deleted ${tArchiveDeleted.changes} tournament archive entries`);
    } catch (error) {
        console.log('⚠️  No t_archive table or already empty');
    }
    
    try {
        const deleteTMatches = db.prepare('DELETE FROM t_matches');
        const tMatchesDeleted = deleteTMatches.run();
        console.log(`✓ Deleted ${tMatchesDeleted.changes} tournament matches`);
    } catch (error) {
        console.log('⚠️  No t_matches table or already empty');
    }
    
    try {
        const deleteTPlayers = db.prepare('DELETE FROM t_players');
        const tPlayersDeleted = deleteTPlayers.run();
        console.log(`✓ Deleted ${tPlayersDeleted.changes} tournament players`);
    } catch (error) {
        console.log('⚠️  No t_players table or already empty');
    }
    
    try {
        const deleteTournaments = db.prepare('DELETE FROM tournaments');
        const tournamentsDeleted = deleteTournaments.run();
        console.log(`✓ Deleted ${tournamentsDeleted.changes} tournaments`);
    } catch (error) {
        console.log('⚠️  No tournaments table or already empty');
    }
    
    // Delete all game states (foreign key constraint)
    try {
        const deleteGameStates = db.prepare('DELETE FROM gameState');
        const gameStatesDeleted = deleteGameStates.run();
        console.log(`✓ Deleted ${gameStatesDeleted.changes} game states`);
    } catch (error) {
        console.log('⚠️  No gameState table or already empty');
    }
    
    // Delete all players (foreign key constraint)
    try {
        const deletePlayers = db.prepare('DELETE FROM players');
        const playersDeleted = deletePlayers.run();
        console.log(`✓ Deleted ${playersDeleted.changes} players`);
    } catch (error) {
        console.log('⚠️  No players table or already empty');
    }
    
    // Delete all games
    try {
        const deleteGames = db.prepare('DELETE FROM games');
        const gamesDeleted = deleteGames.run();
        console.log(`✓ Deleted ${gamesDeleted.changes} games`);
    } catch (error) {
        console.log('⚠️  No games table or already empty');
    }
    
    // Reset user game statistics (gamesWon, gamesLost)
    try {
        const resetStats = db.prepare('UPDATE users SET gamesWon = 0, gamesLost = 0');
        const statsReset = resetStats.run();
        console.log(`✓ Reset game statistics (gamesWon, gamesLost) for ${statsReset.changes} users`);
    } catch (error) {
        console.log('⚠️  Could not reset user statistics:', error.message);
    }
    
    console.log('\n✅ All statistics and game data cleared successfully!');
    console.log('📊 Leaderboard and statistics are now empty - ready for fresh testing.\n');
} catch (error) {
    console.error('❌ Error clearing game data:', error);
    process.exit(1);
} finally {
    db.close();
}


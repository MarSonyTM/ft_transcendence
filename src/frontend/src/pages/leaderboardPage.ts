import { setCurrentPage } from '../utils/globalState';
import { renderApp } from '../main';
import { createUserNav, attachUserNavListeners } from '../utils/navigation';
import { authService } from '../utils/auth';

interface LeaderboardUser {
    username: string;
    gamesWon: number;
    gamesLost: number;
    winRate: number;
}

// Updated interface to match actual game data
interface GamePlayer {
    id: number | string;
    playerId?: number;
    name?: string;
    username?: string;
    score: number;
    isAI?: boolean;
    difficulty?: string;
    pos?: number;
    position?: string;
    connectionStatus?: string;
}

interface GameResult {
    id: number;
    mode: string;
    winner: string | number | GamePlayer | null;  // Can be different formats
    winnerId?: number;
    createdAt: string;
    players?: GamePlayer[] | string;  // Can be array or JSON string
    points?: number[];
}

function getApiEndpoint(): string {
    return (window.__INITIAL_STATE__?.apiEndpoint || '').replace(/\/$/, '');
}

async function fetchAllGames(): Promise<GameResult[]> {
    try {
        const response = await fetch(`${getApiEndpoint()}/api/game`);
        if (!response.ok) {
            console.error('Failed to fetch games:', response.status);
            throw new Error('Failed to fetch games');
        }
        const result = await response.json();
        console.log('Games API response:', result);
        
        return result.data || [];
    } catch (error) {
        console.error('Error fetching games:', error);
        return [];
    }
}

async function fetchLeaderboard(): Promise<LeaderboardUser[]> {
    try {
        const response = await fetch(`${getApiEndpoint()}/api/users/stats`);
        if (!response.ok) {
            console.error('Failed to fetch leaderboard:', response.status);
            // Fallback: calculate from current user only
            const user = await authService.getCurrentUser();
            if (!user) return [];
            const total = (user.gamesWon || 0) + (user.gamesLost || 0);
            const winRate = total > 0 ? ((user.gamesWon || 0) / total) * 100 : 0;
            return [{
                username: user.username,
                gamesWon: user.gamesWon || 0,
                gamesLost: user.gamesLost || 0,
                winRate
            }];
        }
        
        const result = await response.json();
        console.log('Leaderboard API response:', result);
        
        const users = result.data || [];
        
        return users
            .map((u: any) => {
                const total = (u.gamesWon || 0) + (u.gamesLost || 0);
                return {
                    username: u.username,
                    gamesWon: u.gamesWon || 0,
                    gamesLost: u.gamesLost || 0,
                    winRate: total > 0 ? ((u.gamesWon || 0) / total) * 100 : 0
                };
            })
            .sort((a: LeaderboardUser, b: LeaderboardUser) => {
                if (b.gamesWon !== a.gamesWon) {
                    return b.gamesWon - a.gamesWon;
                }
                return b.winRate - a.winRate;
            });
    } catch (error) {
        console.error('Error fetching leaderboard:', error);
        return [];
    }
}

// Helper function to parse players from JSON string or array
function parsePlayers(players: GamePlayer[] | string | undefined): GamePlayer[] {
    if (!players) return [];
    
    if (typeof players === 'string') {
        try {
            const parsed = JSON.parse(players);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            console.error('Failed to parse players:', e);
            return [];
        }
    }
    
    return Array.isArray(players) ? players : [];
}

// Helper function to get player display name
function getPlayerName(player: GamePlayer): string {
    if (player.username) return player.username;
    if (player.name) return player.name;
    const playerId = player.playerId || player.id;
    return `Player ${playerId}`;
}

export async function renderLeaderboardPage(): Promise<void> {
    const root = document.getElementById('app-root');
    if (!root) return;

    // Show loading state
    root.innerHTML = `
        <div class="neon-grid">
            <div class="grid-anim"></div>
            <div class="glass-card" style="max-width: 1200px;">
                <h2 class="title-neon" style="text-align: center">Leaderboard</h2>
                <p style="text-align: center; color: rgb(156 163 175);">Loading...</p>
            </div>
        </div>
    `;

    // Fetch data
    const [leaderboard, games] = await Promise.all([
        fetchLeaderboard(),
        fetchAllGames()
    ]);

    // Sort games by date descending (newest first)
    const sortedGames = games.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const leader = leaderboard[0];
    const userNavHTML = await createUserNav();

    root.innerHTML = `
        <div class="neon-grid profile-container" style="width:100%; max-width:1200px; margin: 0 auto;">
            ${userNavHTML}
            <div class="grid-anim"></div>
            <div class="glass-card" style="padding: 2.5em; width:100%;">
                <h2 class="title-neon" style="text-align: center; margin-bottom: 2em;">Leaderboard</h2>
                
                <!-- Desktop Layout: Top Players + Recent Games in one row -->
                <div style="display: grid; grid-template-columns: auto 1fr; gap: 3em; align-items: start; margin-bottom: 2.5em;">
                    
                    <!-- Left Column: Top Players -->
                    <div style="min-width: 380px;">
                        <h3 style="color: rgb(156 163 175); font-size: 0.9em; margin: 0 0 0.5em 0; text-transform: uppercase; letter-spacing: 0.05em;">🏆 Top Players</h3>
                        <div style="display: flex; flex-direction: column; gap: 0.8em;">
                            ${leaderboard.slice(0, 10).map((player, index) => {
                                const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`;
                                const bgColor = index === 0 ? 'rgba(255, 215, 0, 0.1)' : 
                                               index === 1 ? 'rgba(192, 192, 192, 0.1)' : 
                                               index === 2 ? 'rgba(205, 127, 50, 0.1)' : 
                                               'rgba(255, 255, 255, 0.03)';
                                const borderColor = index === 0 ? 'rgba(255, 215, 0, 0.3)' : 
                                                   index === 1 ? 'rgba(192, 192, 192, 0.3)' : 
                                                   index === 2 ? 'rgba(205, 127, 50, 0.3)' : 
                                                   'rgba(255, 255, 255, 0.1)';
                                return `
                                    <div style="background: ${bgColor}; border: 1px solid ${borderColor}; padding: 0.9em; border-radius: 8px; display: flex; align-items: center; justify-content: space-between;">
                                        <div style="display: flex; align-items: center; gap: 0.8em;">
                                            <span style="font-size: 1.2em; min-width: 2em; text-align: center;">${medal}</span>
                                            <div>
                                                <p style="font-weight: 600; color: rgb(229 231 235); margin: 0; font-size: 1.05em;">${player.username}</p>
                                                <p style="color: rgb(156 163 175); margin: 0; font-size: 0.8em;">${player.gamesWon}W - ${player.gamesLost}L</p>
                                            </div>
                                        </div>
                                        <div style="text-align: right;">
                                            <p style="font-weight: 700; color: rgb(59 130 246); margin: 0; font-size: 1.1em;">${player.winRate.toFixed(0)}%</p>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                            ${leaderboard.length === 0 ? '<p style="color: rgb(156 163 175); text-align: center; padding: 2em;">No players yet</p>' : ''}
                        </div>
                    </div>
                    
                    <!-- Right Column: Recent Games -->
                    <div style="padding: 0 1em;">
                        <h3 style="color: rgb(156 163 175); font-size: 0.9em; margin: 0 0 0.5em 0; text-transform: uppercase; letter-spacing: 0.05em;">🎮 Recent Games (${sortedGames.length})</h3>
                        <div id="gamesScrollContainer" style="max-height: 500px; overflow-y: auto; padding-right: 0.5em;">
                        ${sortedGames.length > 0 ? `
                            <div style="display: flex; flex-direction: column; gap: 0.8em;">
                                ${sortedGames.map((game, index) => {
                                    const date = new Date(game.createdAt);
                                    const dateStr = date.toLocaleDateString();
                                    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                    
                                    // Determine winner and loser from the game data
                                    if (game.mode == '2P') {
                                        let winnerName = 'Unknown';
                                        let loserName = 'Unknown';
                                        
                                        // Parse players if it's a string
                                        let players = game.players;
                                        if (typeof players === 'string') {
                                            try {
                                                players = JSON.parse(players);
                                            } catch (e) {
                                                console.error('Failed to parse players:', e);
                                                players = [];
                                            }
                                        }
                                        
                                        if (players && Array.isArray(players) && players.length >= 2) {
                                            // Sort players by score to determine winner/loser
                                            const sortedPlayers = [...players].sort((a: any, b: any) => 
                                                (b.score || 0) - (a.score || 0)
                                            );
                                            
                                            const winner = sortedPlayers[0];
                                            const loser = sortedPlayers[1];
                                            
                                            // Get winner name - try multiple fields
                                            if (winner) {
                                                winnerName = winner.username || winner.name || 
                                                    (typeof game.winner === 'string' ? game.winner : null) ||
                                                    `Player ${winner.id || winner.playerId || '?'}`;
                                            } else if (game.winner) {
                                                // Fallback to game.winner if it's a string
                                                winnerName = typeof game.winner === 'string' ? game.winner : 'Unknown';
                                            }
                                            
                                            // Get loser name - try multiple fields
                                            if (loser) {
                                                loserName = loser.username || loser.name || 
                                                    `Player ${loser.id || loser.playerId || '?'}`;
                                            } else if (players.length > 0) {
                                                // If we found winner but not loser, get the other player
                                                const otherPlayer = players.find((p: any) => {
                                                    const pName = p.username || p.name;
                                                    const wName = winnerName;
                                                    return pName && pName !== wName;
                                                });
                                                if (otherPlayer) {
                                                    loserName = otherPlayer.username || otherPlayer.name || 
                                                        `Player ${otherPlayer.id || otherPlayer.playerId || '?'}`;
                                                }
                                            }
                                        } else if (game.winner) {
                                            // Fallback: use game.winner if players array is missing
                                            winnerName = typeof game.winner === 'string' ? game.winner : 'Unknown';
                                        }
                                    }

                                    return `
                                        <div style="background: rgba(255, 255, 255, 0.05); padding: 1em; border-radius: 6px; border-left: 3px solid rgb(59 130 246);">
                                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5em;">
                                                <span style="font-weight: bold; color: rgb(229 231 235);">Game #${sortedGames.length - index}</span>
                                                <span style="font-size: 0.85em; color: rgb(156 163 175);">${dateStr} ${timeStr}</span>
                                            </div>
                                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                                <div style="flex: 1;">
                                                    <div style="margin-bottom: 0.3em;">
                                                        <span style="color: rgb(156 163 175); font-size: 0.9em;">Players:</span>
                                                        <span style="color: rgb(34 197 94); font-weight: bold; margin-left: 0.5em;">
                                                            🏆 ${winnerName}
                                                        </span>
                                                        <span style="color: rgb(239 68 68); font-weight: bold; margin-left: 0.5em;">
                                                            ❌ ${loserName}
                                                        </span>
                                                    </div>
                                                </div>
                                                <span style="background: rgba(59, 130, 246, 0.2); color: rgb(147 197 253); padding: 0.3em 0.8em; border-radius: 4px; font-size: 0.85em;">
                                                    ${game.mode || 'Pong'}
                                                </span>
                                            </div>
                                        </div>
                                    `;
                                } else {
                                    // 4P mode
                                    let winnerName = 'Unknown';
                                    let loserNames: string[] = [];
                                    
                                    if (players.length >= 2) {
                                        // Sort by score
                                        const sortedPlayers = [...players].sort((a, b) => 
                                            (b.score || 0) - (a.score || 0)
                                        );
                                        
                                        winnerName = getPlayerName(sortedPlayers[0]);
                                        loserNames = sortedPlayers.slice(1).map(p => getPlayerName(p));
                                    } else if (typeof game.winner === 'string') {
                                        winnerName = game.winner;
                                    } else if (game.winnerId && players.length > 0) {
                                        const winner = players.find(p => 
                                            (p.id === game.winnerId || p.playerId === game.winnerId)
                                        );
                                        if (winner) {
                                            winnerName = getPlayerName(winner);
                                            loserNames = players
                                                .filter(p => p !== winner)
                                                .map(p => getPlayerName(p));
                                        }
                                    }

                                    return `
                                        <div style="background: rgba(255, 255, 255, 0.05); padding: 1em; border-radius: 6px; border-left: 3px solid rgb(59 130 246);">
                                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5em;">
                                                <span style="font-weight: bold; color: rgb(229 231 235);">Game #${sortedGames.length - index}</span>
                                                <span style="font-size: 0.85em; color: rgb(156 163 175);">${dateStr} ${timeStr}</span>
                                            </div>
                                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                                <div style="flex: 1;">
                                                    <div style="margin-bottom: 0.3em;">
                                                        <span style="color: rgb(156 163 175); font-size: 0.9em;">Winner:</span>
                                                        <span style="color: rgb(34 197 94); font-weight: bold; margin-left: 0.5em;">
                                                            🏆 ${winnerName}
                                                        </span>
                                                        ${loserNames.length > 0 ? `
                                                            <span style="color: rgb(239 68 68); font-weight: bold; margin-left: 0.5em;">
                                                                ❌ ${loserNames.join(' | ')}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <span style="background: rgba(59, 130, 246, 0.2); color: rgb(147 197 253); padding: 0.3em 0.8em; border-radius: 4px; font-size: 0.85em;">
                                                        ${game.mode || 'Pong'}
                                                    </span>
                                                </div>
                                            </div>
                                        `;
                                    }
                                }).join('')}                           
                            </div>
                        ` : `
                            <p style="color: rgb(156 163 175); text-align: center; padding: 2em;">No games played yet</p>
                        `}
                        </div>
                    </div>
                </div>
                
                <!-- Action Buttons -->
                <div style="display: flex; gap: 1.2em; justify-content: center; padding-top: 1.5em; border-top: 1px solid rgba(255,255,255,0.1);">
                    <button id="backToLandingBtn" class="btn btn-back" style="font-size: 1em; background: rgba(255, 255, 255, 0.03); color: rgb(156 163 175); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 8px; padding: 0.65em 1.8em; cursor: pointer; font-weight: 500; transition: all 0.3s ease;">← Home</button>
                </div>
            </div>
        </div>

        <style>
            #gamesScrollContainer::-webkit-scrollbar {
                width: 6px;
            }
            #gamesScrollContainer::-webkit-scrollbar-track {
                background: rgba(255, 255, 255, 0.05);
                border-radius: 3px;
            }
            #gamesScrollContainer::-webkit-scrollbar-thumb {
                background: rgba(255, 255, 255, 0.2);
                border-radius: 3px;
            }
            #gamesScrollContainer::-webkit-scrollbar-thumb:hover {
                background: rgba(255, 255, 255, 0.3);
            }
        </style>
    `;

    const backBtn = document.getElementById('backToLandingBtn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            history.pushState({ page: 'landing' }, '', '/');
            setCurrentPage('landing');
            renderApp();
        });
    }

    // Attach user nav dropdown listeners
    attachUserNavListeners();
}
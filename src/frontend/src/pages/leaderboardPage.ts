import { getCurrentUser, setCurrentPage } from '../utils/globalState';
import { renderApp } from '../main';
import { createUserNav, attachUserNavListeners } from '../utils/navigation';

interface LeaderboardUser {
    username: string;
    gamesWon: number;
    gamesLost: number;
    winRate: number;
}

interface GameResult {
    id: number;
    mode: string;
    winner: Player;
    createdAt: string;
    players?: Player[];
    points?: number[];
}

interface Player {
  id: string;
  username: string;
  isReady: boolean;
  isAI?: boolean;
  isLocal: boolean;
  difficulty?: string;
  socketId?: string;
}

function getApiEndpoint(): string {
	return (window.__INITIAL_STATE__?.apiEndpoint || '').replace(/\/$/, '');
}

async function fetchAllGames(): Promise<GameResult[]> {
    try {
        //TODO: check if the api needs authentication for this endpoint
        const response = await fetch(`${getApiEndpoint()}/api/game`);
        if (!response.ok) {
            console.error('Failed to fetch games:', response.status);
            throw new Error('Failed to fetch games');
        }
        const result = await response.json();
        console.log('Games API response:', result);
        
        // Extract the data array from the API response
        return result.data || [];
    } catch (error) {
        console.error('Error fetching games:', error);
        return [];
    }
}

async function fetchLeaderboard(): Promise<LeaderboardUser[]> {
    try {
        // Fetch all users with their stats
        //TODO: check if the api needs authentication for this endpoint
        const response = await fetch(`${getApiEndpoint()}/api/users/stats`);
        if (!response.ok) {
            console.error('Failed to fetch leaderboard:', response.status);
            // Fallback: calculate from current user only
            const currentUser = localStorage.getItem('currentUser');
            if (!currentUser) return [];
            const user = JSON.parse(currentUser);
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
        
        // Extract the data array from the API response
        const users = result.data || [];
        
        // Calculate win rates and sort
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
                // Sort by games won first, then by win rate
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
        ${userNavHTML}
        <div class="neon-grid" style="display: flex; flex-direction: column; align-items: center; gap: 2em;">
            <div class="grid-anim"></div>
            <div class="glass-card" style="max-width: 1200px; width: 100%;">
                <h2 class="title-neon" style="text-align: center; margin-bottom: 1.5em;">Leaderboard</h2>
                
                <div class="games-section">
                    <h3>Current Leader</h3>
                    ${leader ? `
                        <div style="background: rgba(59, 130, 246, 0.1); padding: 1em; border-radius: 8px; margin-top: 0.5em;">
                            <p style="font-size: 1.5em; font-weight: bold; color: rgb(229 231 235); margin: 0 0 0.3em 0;">
                                🏆 ${leader.username}
                            </p>
                            <p style="color: rgb(156 163 175); margin: 0; font-size: 0.9em;">
                                ${leader.gamesWon} wins • ${leader.gamesLost} losses • ${leader.winRate.toFixed(1)}% win rate
                            </p>
                        </div>
                    ` : `
                        <p style="color: rgb(156 163 175);">No games played yet</p>
                    `}
                </div>

                <div class="games-section" style="margin-top: 2em;">
                    <h3>Past Games (${sortedGames.length})</h3>
                    <div id="gamesScrollContainer" style="max-height: 300px; overflow-y: auto; margin-top: 0.5em; padding-right: 0.5em;">
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
                                        
                                        console.log(`[LEADERBOARD] Game #${sortedGames.length - index} - Winner: ${winnerName}, Loser: ${loserName}`, {
                                            players: players,
                                            winner: game.winner,
                                            winnerId: game.winnerId
                                        });

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
                                        
                                        let winnerName = 'Unknown';
                                        let loserNames: string[] = ['Unknown', 'Unknown', 'Unknown', 'Unknown'];
                                        
                                        if (game.players && Array.isArray(game.players) && game.players.length >= 2) {
                                            // Find winner by winner username, winnerId, or by highest score
                                            let winner;
                                            let losers = new Array<Player>();
                                            
                                            if (game.winner) {
                                                // game.winner is a username string, not an ID
                                                winner = game.players.find((p: any) => 
                                                    p.username === game.winner || 
                                                    p.id === game.winnerId || 
                                                    p.id?.toString() === game.winnerId?.toString()
                                                );
                                                losers = game.players.filter((p: any) => 
                                                    p.username !== game.winner && 
                                                    p.id !== game.winnerId && 
                                                    p.id?.toString() !== game.winnerId?.toString()
                                                );
                                            } else if (game.winnerId) {
                                                // Try to find by winnerId
                                                winner = game.players.find((p: any) => 
                                                    p.id === game.winnerId || 
                                                    p.id?.toString() === game.winnerId?.toString()
                                                );
                                                losers = game.players.filter((p: any) => 
                                                    p.id !== game.winnerId && 
                                                    p.id?.toString() !== game.winnerId?.toString()
                                                );
                                            } else {
                                                // Sort by score to find winner
                                                const sortedPlayers = [...game.players].sort((a: any, b: any) => 
                                                    (b.score || 0) - (a.score || 0)
                                                );
                                                winner = sortedPlayers[0];
                                                losers = sortedPlayers.slice(1);
                                            }
                                            // Get winner name
                                            if (winner) {
                                                winnerName = winner.username || winner.name || `Player ${winner.id}`;
                                            } else if (game.winner) {
                                                // Fallback to game.winner if it's a string
                                                winnerName = typeof game.winner === 'string' ? game.winner : 'Unknown';
                                            }
                                            
                                            // Get loser names
                                            if (losers && losers.length > 0) {
                                                for (let i = 0; i < Math.min(losers.length, 3); i++) {
                                                    loserNames[i] = losers[i].username || losers[i].name || `Player ${losers[i].id}`;
                                                }
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
                                                             <span style="color: rgb(239 68 68); font-weight: bold; margin-left: 0.5em;">
                                                                ❌ ${loserNames[0]} | ${loserNames[1]} | ${loserNames[2]}                                                           
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
            
            <button id="backToLandingBtn" class="btn btn-back glass-card" style="position: relative; z-index: 10; padding: 0.9em 1.6em; border: 1px solid rgba(255,255,255,0.08); background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.04)); backdrop-filter: blur(10px); border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.35);">Back to Home</button>
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
    attachUserNavListeners();
    
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            history.pushState({ page: 'landing' }, '', '/');
            setCurrentPage('landing');
            renderApp();
        });
    }
}

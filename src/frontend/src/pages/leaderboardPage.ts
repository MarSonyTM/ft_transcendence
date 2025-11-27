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
        const response = await fetch(`${getApiEndpoint()}/api/game`);
        if (!response.ok) {
            console.error('Failed to fetch games:', response.status);
            throw new Error('Failed to fetch games');
        }
        const result = await response.json();
        
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

function createFullStatisticsView(leaderboard: LeaderboardUser[]): string {
    if (leaderboard.length === 0) {
        return `
            <div style="text-align: center; padding: 3em; color: #9ca3af;">
                <div style="font-size: 3em; margin-bottom: 0.5em;">🎮</div>
                <h2 style="color: #fff; margin-bottom: 0.5em;">No Statistics Yet</h2>
                <p>Play some games to see statistics visualized here!</p>
            </div>
        `;
    }

    // Calculate aggregate stats
    const totalWins = leaderboard.reduce((sum, p) => sum + p.gamesWon, 0);
    const totalLosses = leaderboard.reduce((sum, p) => sum + p.gamesLost, 0);
    const totalGames = totalWins + totalLosses;
    const avgWinRate = leaderboard.reduce((sum, p) => sum + p.winRate, 0) / leaderboard.length;

    // Top 5 for bar chart
    const top5 = leaderboard.slice(0, 5);
    const maxGames = Math.max(...top5.map(p => p.gamesWon + p.gamesLost), 1);

    // Pie chart calculations
    const winPercentage = totalGames > 0 ? (totalWins / totalGames) * 100 : 0;
    const lossPercentage = totalGames > 0 ? (totalLosses / totalGames) * 100 : 0;
    const radius = 100;
    const circumference = 2 * Math.PI * radius;
    const winStroke = (winPercentage / 100) * circumference;
    const lossStroke = (lossPercentage / 100) * circumference;

    return `
        <!-- Overview Cards -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1.5em; margin-bottom: 2em;">
            <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); padding: 1.5em; border-radius: 8px; text-align: center;">
                <div style="font-size: 0.9rem; color: #9ca3af; margin-bottom: 0.5em;">Total Games</div>
                <div style="font-size: 2.5rem; font-weight: bold; color: #10b981;">${totalGames}</div>
            </div>
            
            <div style="background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); padding: 1.5em; border-radius: 8px; text-align: center;">
                <div style="font-size: 0.9rem; color: #9ca3af; margin-bottom: 0.5em;">Total Wins</div>
                <div style="font-size: 2.5rem; font-weight: bold; color: #3b82f6;">${totalWins}</div>
            </div>
            
            <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); padding: 1.5em; border-radius: 8px; text-align: center;">
                <div style="font-size: 0.9rem; color: #9ca3af; margin-bottom: 0.5em;">Total Losses</div>
                <div style="font-size: 2.5rem; font-weight: bold; color: #ef4444;">${totalLosses}</div>
            </div>
            
            <div style="background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); padding: 1.5em; border-radius: 8px; text-align: center;">
                <div style="font-size: 0.9rem; color: #9ca3af; margin-bottom: 0.5em;">Avg Win Rate</div>
                <div style="font-size: 2.5rem; font-weight: bold; color: #f59e0b;">${avgWinRate.toFixed(1)}%</div>
            </div>
        </div>

        <!-- Charts Grid -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 2em; margin-bottom: 2em;">
            <!-- Pie Chart -->
            <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.1); padding: 2em; border-radius: 8px;">
                <h3 style="text-align: center; color: #fff; margin-bottom: 1.5em;">Win/Loss Distribution</h3>
                <div style="position: relative; width: 300px; height: 300px; margin: 0 auto;">
                    <svg width="300" height="300" viewBox="0 0 300 300" style="transform: rotate(-90deg);">
                        <circle cx="150" cy="150" r="${radius}" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="60"/>
                        <circle cx="150" cy="150" r="${radius}" fill="none" stroke="#10b981" stroke-width="60"
                            stroke-dasharray="${winStroke} ${circumference}" stroke-dashoffset="0"
                            style="transition: stroke-dasharray 1s ease;"/>
                        <circle cx="150" cy="150" r="${radius}" fill="none" stroke="#ef4444" stroke-width="60"
                            stroke-dasharray="${lossStroke} ${circumference}" stroke-dashoffset="${-winStroke}"
                            style="transition: stroke-dasharray 1s ease;"/>
                    </svg>
                    <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center;">
                        <div style="font-size: 2.5rem; font-weight: bold; color: #fff;">${totalGames}</div>
                        <div style="font-size: 0.9rem; color: #9ca3af;">Total Games</div>
                    </div>
                </div>
                <div style="display: flex; justify-content: center; gap: 2em; margin-top: 1.5em;">
                    <div style="display: flex; align-items: center; gap: 0.5em;">
                        <div style="width: 20px; height: 20px; background: #10b981; border-radius: 4px;"></div>
                        <span style="color: #9ca3af;">Wins: ${totalWins} (${winPercentage.toFixed(1)}%)</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.5em;">
                        <div style="width: 20px; height: 20px; background: #ef4444; border-radius: 4px;"></div>
                        <span style="color: #9ca3af;">Losses: ${totalLosses} (${lossPercentage.toFixed(1)}%)</span>
                    </div>
                </div>
            </div>

            <!-- Bar Chart -->
            <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.1); padding: 2em; border-radius: 8px;">
                <h3 style="text-align: center; color: #fff; margin-bottom: 1.5em;">Performance Comparison</h3>
                <div style="display: flex; align-items: flex-end; justify-content: center; gap: 4em; height: 250px; padding: 1em;">
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 0.5em;">
                        <div style="font-size: 1.5rem; font-weight: bold; color: #10b981;">${totalWins}</div>
                        <div style="position: relative; width: 80px; height: 200px; background: rgba(255,255,255,0.1); border-radius: 8px; overflow: hidden;">
                            <div style="position: absolute; bottom: 0; width: 100%; height: ${(totalWins / Math.max(totalWins, totalLosses, 1)) * 200}px;
                                background: linear-gradient(to top, #10b981, #34d399); border-radius: 8px 8px 0 0; transition: height 1s ease;"></div>
                        </div>
                        <div style="color: #9ca3af; font-weight: 600;">Wins</div>
                    </div>
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 0.5em;">
                        <div style="font-size: 1.5rem; font-weight: bold; color: #ef4444;">${totalLosses}</div>
                        <div style="position: relative; width: 80px; height: 200px; background: rgba(255,255,255,0.1); border-radius: 8px; overflow: hidden;">
                            <div style="position: absolute; bottom: 0; width: 100%; height: ${(totalLosses / Math.max(totalWins, totalLosses, 1)) * 200}px;
                                background: linear-gradient(to top, #ef4444, #f87171); border-radius: 8px 8px 0 0; transition: height 1s ease;"></div>
                        </div>
                        <div style="color: #9ca3af; font-weight: 600;">Losses</div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Top 5 Players Bar Chart -->
        <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.1); padding: 2em; border-radius: 8px;">
            <h3 style="color: #fff; margin: 0 0 1.5em 0; text-align: center;">📊 Top 5 Players Performance</h3>
            <div style="display: flex; align-items: flex-end; justify-content: space-around; height: 250px; padding: 0 1em;">
                ${top5.map((player, index) => {
                    const winHeight = (player.gamesWon / maxGames) * 200;
                    const lossHeight = (player.gamesLost / maxGames) * 200;
                    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '';
                    
                    return `
                        <div style="display: flex; flex-direction: column; align-items: center; gap: 0.5em; flex: 1; max-width: 120px;">
                            <div style="font-size: 1.2rem;">${medal}</div>
                            <div style="display: flex; gap: 0.5em; align-items: flex-end; height: 200px;">
                                <div style="position: relative; width: 35px; height: 200px; background: rgba(16, 185, 129, 0.1); border-radius: 4px; overflow: hidden;">
                                    <div style="position: absolute; bottom: 0; width: 100%; height: ${winHeight}px;
                                        background: linear-gradient(to top, #10b981, #34d399); border-radius: 4px 4px 0 0; transition: height 1s ease;"></div>
                                    <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 0.75rem; 
                                        font-weight: bold; color: #fff; text-shadow: 0 0 4px rgba(0,0,0,0.8);">${player.gamesWon}</div>
                                </div>
                                <div style="position: relative; width: 35px; height: 200px; background: rgba(239, 68, 68, 0.1); border-radius: 4px; overflow: hidden;">
                                    <div style="position: absolute; bottom: 0; width: 100%; height: ${lossHeight}px;
                                        background: linear-gradient(to top, #ef4444, #f87171); border-radius: 4px 4px 0 0; transition: height 1s ease;"></div>
                                    <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 0.75rem; 
                                        font-weight: bold; color: #fff; text-shadow: 0 0 4px rgba(0,0,0,0.8);">${player.gamesLost}</div>
                                </div>
                            </div>
                            <div style="font-size: 0.85rem; font-weight: 600; color: #fff; text-align: center; max-width: 100px; 
                                overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${player.username}</div>
                            <div style="font-size: 0.75rem; color: #9ca3af;">${player.winRate.toFixed(0)}%</div>
                        </div>
                    `;
                }).join('')}
            </div>
            <div style="display: flex; justify-content: center; gap: 2em; margin-top: 1.5em; padding-top: 1em; border-top: 1px solid rgba(255,255,255,0.1);">
                <div style="display: flex; align-items: center; gap: 0.5em;">
                    <div style="width: 16px; height: 16px; background: linear-gradient(to top, #10b981, #34d399); border-radius: 3px;"></div>
                    <span style="color: #9ca3af; font-size: 0.9rem;">Wins</span>
                </div>
                <div style="display: flex; align-items: center; gap: 0.5em;">
                    <div style="width: 16px; height: 16px; background: linear-gradient(to top, #ef4444, #f87171); border-radius: 3px;"></div>
                    <span style="color: #9ca3af; font-size: 0.9rem;">Losses</span>
                </div>
            </div>
        </div>
    `;
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
                                                winnerName = winner.username || winner.username || 
                                                    (typeof game.winner === 'string' ? game.winner : null) ||
                                                    `Player ${winner.id || winner.id || '?'}`;
                                            } else if (game.winner) {
                                                // Fallback to game.winner if it's a string
                                                winnerName = typeof game.winner === 'string' ? game.winner : 'Unknown';
                                            }
                                            
                                            // Get loser name - try multiple fields
                                            if (loser) {
                                                loserName = loser.username || 
                                                    `Player ${loser.id || '?'}`;
                                            } else if (players.length > 0) {
                                                // If we found winner but not loser, get the other player
                                                const otherPlayer = players.find((p: any) => {
                                                    const pName = p.username || p.name;
                                                    const wName = winnerName;
                                                    return pName && pName !== wName;
                                                });
                                                if (otherPlayer) {
                                                    loserName = otherPlayer.username || otherPlayer.username || 
                                                        `Player ${otherPlayer.id || '?'}`;
                                                }
                                            }
                                        } else if (game.winner) {
                                            // Fallback: use game.winner if players array is missing
                                            winnerName = typeof game.winner === 'string' ? game.winner : 'Unknown';
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
                                                    p.id === game.winner.id || 
                                                    p.id?.toString() === game.winner.id?.toString()
                                                );
                                                losers = game.players.filter((p: any) => 
                                                    p.username !== game.winner && 
                                                    p.id !== game.winner.id && 
                                                    p.id?.toString() !== game.winner.id?.toString()
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
                                                winnerName = winner.username || `Player ${winner.id}`;
                                            } else if (game.winner) {
                                                // Fallback to game.winner if it's a string
                                                winnerName = typeof game.winner === 'string' ? game.winner : 'Unknown';
                                            }
                                            
                                            // Get loser names
                                            if (losers && losers.length > 0) {
                                                for (let i = 0; i < Math.min(losers.length, 3); i++) {
                                                    loserNames[i] = losers[i].username || losers[i].username || `Player ${losers[i].id}`;
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
                
                <!-- Statistics Toggle Section -->
                <div style="margin-top: 2em; padding-top: 2em; border-top: 2px solid rgba(255,255,255,0.1);">
                    <button id="toggleStatsBtn" class="btn-neon accent" style="
                        width: 100%;
                        padding: 1em;
                        font-size: 1.1rem;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 0.5em;
                        background: rgba(59, 130, 246, 0.1);
                        border: 1px solid rgba(59, 130, 246, 0.3);
                        transition: all 0.3s ease;
                    ">
                        <span id="statsToggleIcon">▼</span>
                        <span>Show Statistics & Charts</span>
                    </button>
                    
                    <div id="statisticsContainer" style="
                        max-height: 0;
                        overflow: hidden;
                        transition: max-height 0.5s ease, opacity 0.5s ease, margin-top 0.5s ease;
                        opacity: 0;
                    ">
                        <div style="padding-top: 2em;">
                            ${createFullStatisticsView(leaderboard)}
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

    // Statistics toggle functionality
    const toggleStatsBtn = document.getElementById('toggleStatsBtn');
    const statsContainer = document.getElementById('statisticsContainer');
    const statsToggleIcon = document.getElementById('statsToggleIcon');
    let statsVisible = false;

    if (toggleStatsBtn && statsContainer && statsToggleIcon) {
        toggleStatsBtn.addEventListener('click', () => {
            statsVisible = !statsVisible;
            
            if (statsVisible) {
                // Show statistics
                statsContainer.style.maxHeight = '3000px';
                statsContainer.style.opacity = '1';
                statsContainer.style.marginTop = '2em';
                statsToggleIcon.textContent = '▲';
                toggleStatsBtn.querySelector('span:last-child')!.textContent = 'Hide Statistics & Charts';
            } else {
                // Hide statistics
                statsContainer.style.maxHeight = '0';
                statsContainer.style.opacity = '0';
                statsContainer.style.marginTop = '0';
                statsToggleIcon.textContent = '▼';
                toggleStatsBtn.querySelector('span:last-child')!.textContent = 'Show Statistics & Charts';
            }
        });
    }

    // Attach user nav dropdown listeners
    attachUserNavListeners();
}
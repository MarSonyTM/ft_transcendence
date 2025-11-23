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
                                ${leader.gamesWon} wins • ${leader.winRate.toFixed(1)}% win rate
                            </p>
                        </div>
                    ` : `<p style="color: rgb(156 163 175);">No games played yet</p>`}
                </div>

                <div class="games-section" style="margin-top: 2em;">
                    <h3>Top Players</h3>
                    <div style="margin-top: 1em;">
                        ${leaderboard.length > 0 ? leaderboard.slice(0, 10).map((user, index) => `
                            <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.8em; background: rgba(255, 255, 255, ${index === 0 ? '0.1' : '0.05'}); border-radius: 6px; margin-bottom: 0.5em; ${index === 0 ? 'border: 1px solid rgba(59, 130, 246, 0.3);' : ''}">
                                <div style="display: flex; align-items: center; gap: 1em;">
                                    <span style="font-weight: bold; color: ${index === 0 ? 'rgb(251 191 36)' : index === 1 ? 'rgb(192 192 192)' : index === 2 ? 'rgb(205 127 50)' : 'rgb(156 163 175)'}; min-width: 2em;">
                                        ${index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`}
                                    </span>
                                    <span style="color: rgb(229 231 235); font-weight: ${index < 3 ? 'bold' : 'normal'};">
                                        ${user.username}
                                    </span>
                                </div>
                                <div style="display: flex; gap: 2em; align-items: center;">
                                    <span style="color: rgb(34 197 94); font-size: 0.9em;">
                                        ${user.gamesWon}W
                                    </span>
                                    <span style="color: rgb(239 68 68); font-size: 0.9em;">
                                        ${user.gamesLost}L
                                    </span>
                                    <span style="color: rgb(156 163 175); font-size: 0.9em; min-width: 4em; text-align: right;">
                                        ${user.winRate.toFixed(1)}%
                                    </span>
                                </div>
                            </div>
                        `).join('') : `
                            <p style="color: rgb(156 163 175); text-align: center; padding: 2em;">No players yet</p>
                        `}
                    </div>
                </div>

                <div class="games-section" style="margin-top: 2em;">
                    <h3>Recent Games</h3>
                    ${sortedGames.length > 0 ? `
                        <div id="gamesScrollContainer" style="max-height: 500px; overflow-y: auto; margin-top: 1em; display: flex; flex-direction: column; gap: 0.75em; padding-right: 0.5em;">
                            ${sortedGames.slice(0, 50).map((game, index) => {
                                const date = new Date(game.createdAt);
                                const dateStr = date.toLocaleDateString();
                                const timeStr = date.toLocaleTimeString();
                                
                                // Parse players array
                                const players = parsePlayers(game.players);

                                if (game.mode === '2P') {
                                    let winnerName = 'Unknown';
                                    let loserName = 'Unknown';

                                    if (players.length >= 2) {
                                        // Sort by score to find winner/loser
                                        const sortedPlayers = [...players].sort((a, b) => 
                                            (b.score || 0) - (a.score || 0)
                                        );
                                        
                                        winnerName = getPlayerName(sortedPlayers[0]);
                                        loserName = getPlayerName(sortedPlayers[1]);
                                    } else if (typeof game.winner === 'string') {
                                        winnerName = game.winner;
                                        const otherPlayer = players.find(p => 
                                            getPlayerName(p) !== game.winner
                                        );
                                        if (otherPlayer) {
                                            loserName = getPlayerName(otherPlayer);
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
                                                        ` : ''}
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
import { getCurrentUser, setCurrentPage } from '../utils/globalState';
import { renderApp } from '../main';

interface LeaderboardUser {
    username: string;
    gamesWon: number;
    gamesLost: number;
    winRate: number;
}

interface GameResult {
    id: number;
    mode: string;
    winner: string;
    createdAt: string;
    players?: string[];
}

interface Game {
    id: number;
    mode: string;
    players: JSON;
    points: JSON;
    winnerId: number;
    difficulty: string;
    createdAt: string;
}

function getApiEndpoint(): string {
	return (window.__INITIAL_STATE__?.apiEndpoint || '').replace(/\/$/, '');
}

async function fetchAllGames(): Promise<Game[]> {
//async function fetchAllGames(): Promise<GameResult[]> {
    try {
        const response = await fetch(`${getApiEndpoint()}/api/game/returnall`);
        if (!response.ok)
            throw new Error('Failed to fetch all games');
        const games = await response.json();
        return games;
    } catch (error) {
        console.error('Error fetching games:', error);
        return [];
    }
}

async function fetchLeaderboard(): Promise<LeaderboardUser[]> {
    try {
        // Fetch all users with their stats
        const response = await fetch(`${getApiEndpoint()}/api/users/stats`);
        if (!response.ok) {
            // Fallback: calculate from current user only
            const currentUser = localStorage.getItem('currentUser');
            if (!currentUser) return [];
            const user = JSON.parse(currentUser);
            const total = user.gamesWon + user.gamesLost;
            const winRate = total > 0 ? (user.gamesWon / total) * 100 : 0;
            return [{
                username: user.username,
                gamesWon: user.gamesWon || 0,
                gamesLost: user.gamesLost || 0,
                winRate
            }];
        }
        const users = await response.json();
        // Calculate win rates and sort
        return users
            .map((u: any) => {
                const total = u.gamesWon + u.gamesLost;
                return {
                    username: u.username,
                    gamesWon: u.gamesWon || 0,
                    gamesLost: u.gamesLost || 0,
                    winRate: total > 0 ? (u.gamesWon / total) * 100 : 0
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
        <div class="profile-container">
            <div class="profile-card">
                <h2 style="text-align: center">Leaderboard</h2>
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

    root.innerHTML = `
        <div class="profile-container">
            <div class="profile-card">
                <h2 style="text-align: center; margin-bottom: 1.5em;">Leaderboard</h2>
                
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
                    <h3>Top Players</h3>
                    <div style="max-height: 200px; overflow-y: auto; margin-top: 0.5em; padding-right: 0.5em;">
                        ${leaderboard.length > 0 ? `
                            <div style="display: flex; flex-direction: column; gap: 0.5em;">
                                ${leaderboard.map((user, index) => `
                                    <div style="background: rgba(255, 255, 255, 0.05); padding: 0.8em; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
                                        <div style="display: flex; align-items: center; gap: 0.8em;">
                                            <span style="font-weight: bold; color: rgb(156 163 175); min-width: 1.5em;">#${index + 1}</span>
                                            <span style="color: rgb(229 231 235);">${user.username}</span>
                                        </div>
                                        <div style="text-align: right; font-size: 0.85em;">
                                            <div style="color: rgb(34 197 94);">${user.gamesWon}W</div>
                                            <div style="color: rgb(239 68 68);">${user.gamesLost}L</div>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        ` : `
                            <p style="color: rgb(156 163 175); text-align: center; padding: 1em;">No players yet</p>
                        `}
                    </div>
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
                                    return `
                                        <div style="background: rgba(255, 255, 255, 0.05); padding: 1em; border-radius: 6px; border-left: 3px solid rgb(59 130 246);">
                                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5em;">
                                                <span style="font-weight: bold; color: rgb(229 231 235);">Game #${sortedGames.length - index}</span>
                                                <span style="font-size: 0.85em; color: rgb(156 163 175);">${dateStr} ${timeStr}</span>
                                            </div>
                                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                                <div>
                                                    <span style="color: rgb(156 163 175); font-size: 0.9em;">Winner:</span>
                                                    <span style="color: rgb(34 197 94); font-weight: bold; margin-left: 0.5em;">${game.winnerId || 'Unknown'}</span>
                                                </div>
                                                <span style="background: rgba(59, 130, 246, 0.2); color: rgb(147 197 253); padding: 0.3em 0.8em; border-radius: 4px; font-size: 0.85em;">
                                                    ${game.mode || 'Pong'}
                                                </span>
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        ` : `
                            <p style="color: rgb(156 163 175); text-align: center; padding: 2em;">No games played yet</p>
                        `}
                    </div>
                </div>
            </div>
            <button id="backToLandingBtn" class="btn btn-back">Back to Home</button>
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
}

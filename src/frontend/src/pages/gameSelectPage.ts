import { setCurrentPage, setCurrentUser, setCurrentGameMode, getCurrentUser } from '../utils/globalState';
import { renderApp } from '../main';
import { authService } from '../utils/auth';

export function renderGameSelectPage(): void {
    const root = document.getElementById('app-root');
    if (!root) return;
    
    root.innerHTML = `
        <div class="game-select-container" style="display:flex; flex-direction:column; align-items:center; min-height:70vh;">
            <h2 class="select-title">Choose Game Mode</h2>
            <div class="game-mode-options">
                <button id="2PBtn" class="btn btn-game-mode">1 vs 1 Match</button>
                <button id="4PBtn" class="btn btn-game-mode">4 Player Match</button>
            </div>
            <div style="display:flex; gap:0.8em; justify-content:center; margin-top:1.2em;">
                <button id="leaderboardBtn" class="btn btn-profile">Leaderboard</button>
                <button id="profileBtn" class="btn btn-profile">Profile</button>
            </div>
            <div style="display:flex; justify-content:center; margin-top:0.6em;">
                <button id="logoutBtn" class="btn" style="min-width: 140px; font-size: 1.1em; background: #ef4444; color: #fff; border: none; border-radius: 8px; padding: 0.6em 1.2em; cursor: pointer;">
                    Logout
                </button>
            </div>
        </div>
    `;
    
    const oneVsOneBtn = document.getElementById('2PBtn');
    if (oneVsOneBtn) {
        oneVsOneBtn.addEventListener('click', () => {
            if (!getCurrentUser()) {
                setCurrentUser('Player 1');
            }
            setCurrentGameMode('2P');
            history.pushState({ page: 'lobby' }, '', '#lobby');
            setCurrentPage('lobby');
            renderApp();
        });
    }
    
    const fourPlayerBtn = document.getElementById('4PBtn');
    if (fourPlayerBtn) {
        fourPlayerBtn.addEventListener('click', () => {
            if (!getCurrentUser()) {
                setCurrentUser('Player 1');
            }
            setCurrentGameMode('4P');
            history.pushState({ page: 'lobby' }, '', '/lobby');
            setCurrentPage('lobby');
            renderApp();
        });
    }
    
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await authService.logout();
            history.pushState({ page: 'landing' }, '', '/');
            setCurrentPage('landing');
            renderApp();
        });
    }

    const leaderboardBtn = document.getElementById('leaderboardBtn');
    if (leaderboardBtn) {
        leaderboardBtn.addEventListener('click', () => {
            history.pushState({ page: 'leaderboard' }, '', '/leaderboard');
            setCurrentPage('leaderboard');
            renderApp();
        });
    }

    const profileBtn = document.getElementById('profileBtn');
    if (profileBtn) {
        profileBtn.addEventListener('click', () => {
            history.pushState({ page: 'profile' }, '', '/profile');
            setCurrentPage('profile');
            renderApp();
        });
    }
}